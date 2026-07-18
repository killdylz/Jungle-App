// persona_plans.source normalization.
//
// This guards a real data-loss bug: migration 0005 constrains the column to
// ('google_slides','manual','jungle'), but the client wrote "slides" for Slides
// imports and "extract" for pasted decks. Because the whole plan list is upserted
// in ONE call, a single bad value failed EVERY plan's sync — and hydratePersonas
// is server-wins, so the next visit to the Personas screen overwrote localStorage
// with a server list that had never received them. The coach's imported corpus
// disappeared with nothing but a console warning.
//
// The values below are not arbitrary strings: they are the exact contents of the
// CHECK constraint. If someone widens or changes it, this test must change with it.
import { describe, it, expect, beforeEach } from "vitest";
import {
  planSource, attendanceSource, ATTENDANCE_SOURCES,
  getMembers, addMember, getAttendance, recordAttendance,
  ensureClassInstance, getClassInstances, _ciToRow,
} from "./store.js";

const ALLOWED = ["google_slides", "manual", "jungle"];

describe("planSource", () => {
  it("passes through every value the CHECK constraint allows", () => {
    ALLOWED.forEach(s => expect(planSource(s)).toBe(s));
  });

  it("maps the legacy values that caused the outage", () => {
    expect(planSource("slides")).toBe("google_slides");   // Google Slides importer
    expect(planSource("extract")).toBe("manual");         // Paste-deck-text path
  });

  it("falls back to a legal value for anything unrecognised", () => {
    // The point is that NOTHING can ever reach the column that the constraint
    // would reject — an unknown source must degrade, never poison the batch.
    expect(planSource("")).toBe("manual");
    expect(planSource(null)).toBe("manual");
    expect(planSource(undefined)).toBe("manual");
    expect(planSource("   ")).toBe("manual");
    expect(planSource("something-nobody-has-written-yet")).toBe("manual");
  });

  it("only ever returns a constraint-legal value", () => {
    const inputs = ["slides", "extract", "", null, undefined, "  ", "jungle", "GOOGLE_SLIDES", 42, {}];
    inputs.forEach(i => expect(ALLOWED).toContain(planSource(i)));
  });
});

// ── F4 attendance spine (migration 0007) ─────────────────────────────────────
// These run against the plain-localStorage path (no Supabase configured in the
// test env), which is exactly the offline branch a coach hits in a dead-Wi-Fi
// room — the branch that has to work or attendance is lost for good (P7).
describe("attendanceSource", () => {
  it("passes through the three values 0007's CHECK allows", () => {
    ATTENDANCE_SOURCES.forEach(s => expect(attendanceSource(s)).toBe(s));
    expect(ATTENDANCE_SOURCES).toEqual(["qr", "coach", "import"]);
  });

  it("never lets an illegal value reach the column", () => {
    // Same failure this guards on persona_plans: a rejected value fails the write
    // in the background, then a hydrate destroys the only surviving copy.
    ["scan", "", null, undefined, "QR", 7, {}].forEach(bad =>
      expect(ATTENDANCE_SOURCES).toContain(attendanceSource(bad)));
    expect(attendanceSource("scan")).toBe("coach");
  });
});

describe("attendance capture (offline path)", () => {
  beforeEach(() => localStorage.clear());

  it("quick-adds a member with just a name", () => {
    // P6: anything more than a name is a form a coach won't fill in mid-class.
    const { member } = addMember("  Sam Okonkwo  ");
    expect(member.name).toBe("Sam Okonkwo");        // trimmed
    expect(member.status).toBe("active");
    expect(member.joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);  // drives the cohort curve
    expect(getMembers()).toHaveLength(1);
  });

  it("records a check-in and persists it locally", () => {
    const { member } = addMember("Ana");
    const { instance } = ensureClassInstance({ name: "Tuesday 6pm", classType: "HIIT" });
    const res = recordAttendance({ classInstanceId: instance.id, memberId: member.id, source: "coach" });
    expect(res.added).toBe(true);
    expect(getAttendance()).toHaveLength(1);
    expect(getAttendance()[0]).toMatchObject({ memberId: member.id, source: "coach" });
  });

  it("treats a double check-in as a no-op, not an error", () => {
    // The coach sweeping a roster after a member already self-scanned is the
    // expected case, not an exceptional one — 0007 has a unique index for it.
    const { member } = addMember("Ana");
    const { instance } = ensureClassInstance({ name: "Tuesday 6pm" });
    recordAttendance({ classInstanceId: instance.id, memberId: member.id });
    const second = recordAttendance({ classInstanceId: instance.id, memberId: member.id });
    expect(second.added).toBe(false);
    expect(getAttendance()).toHaveLength(1);
  });

  it("keeps check-ins for the same member in different classes", () => {
    const { member } = addMember("Ana");
    const a = ensureClassInstance({ name: "Mon 6pm" }).instance;
    localStorage.setItem("jungle_class_instances", "[]");   // force a distinct occurrence
    const b = ensureClassInstance({ name: "Tue 6pm" }).instance;
    recordAttendance({ classInstanceId: a.id, memberId: member.id });
    recordAttendance({ classInstanceId: b.id, memberId: member.id });
    expect(getAttendance()).toHaveLength(2);   // attendance across classes IS the retention signal
  });

  it("coerces an illegal source instead of writing it", () => {
    const { member } = addMember("Ana");
    const { instance } = ensureClassInstance({ name: "Tue 6pm" });
    recordAttendance({ classInstanceId: instance.id, memberId: member.id, source: "scan" });
    expect(getAttendance()[0].source).toBe("coach");
  });
});

describe("ensureClassInstance", () => {
  beforeEach(() => localStorage.clear());

  it("reuses the same occurrence for a class already running", () => {
    // Reopening the roster or pausing/resuming must not mint a second occurrence,
    // or one class's attendance splits across two rows and every count is wrong.
    const first  = ensureClassInstance({ name: "Tuesday 6pm", classType: "HIIT" }).instance;
    const second = ensureClassInstance({ name: "Tuesday 6pm", classType: "HIIT" }).instance;
    expect(second.id).toBe(first.id);
    expect(getClassInstances()).toHaveLength(1);
  });

  it("never stores a non-string in the class_type text column", () => {
    // Caught by driving the real UI: the app's classChoice is an OBJECT
    // ({classType, subType}), and class_instances.class_type is `text`. Passing it
    // through would fail the insert in the background — the same silent-sync
    // failure that destroyed persona_plans data. Both the call site and the row
    // mapper coerce; this pins the mapper, which is the one that can't be bypassed.
    const { instance } = ensureClassInstance({
      name: "Tuesday 6pm", classType: { classType: "crossfit", subType: "wod" },
    });
    const row = _ciToRow(instance);
    expect(typeof row.class_type).toBe("string");
    expect(row.class_type).toBe("crossfit · wod");
    expect(typeof row.name).toBe("string");
  });

  it("creates a separate occurrence for a differently-named class", () => {
    ensureClassInstance({ name: "Tuesday 6pm" });
    ensureClassInstance({ name: "Tuesday 7pm" });
    expect(getClassInstances()).toHaveLength(2);
  });

  it("does not reuse an occurrence from outside the window", () => {
    const { instance } = ensureClassInstance({ name: "Tuesday 6pm" });
    // Backdate last week's class: same name, but a different session entirely.
    const stale = getClassInstances().map(c =>
      ({ ...c, startsAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString() }));
    localStorage.setItem("jungle_class_instances", JSON.stringify(stale));
    const fresh = ensureClassInstance({ name: "Tuesday 6pm" }).instance;
    expect(fresh.id).not.toBe(instance.id);
    expect(getClassInstances()).toHaveLength(2);
  });
});
