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
  _guardList, _blobStale, syncErrors, applyAttendanceImport, saveMembers,
  getDraftClass, saveDraftClass,
  updateMember, memberStatus, MEMBER_STATUSES, _mergeAppendLog, _dueRetries,
} from "./store.js";
import { analyzeAttendanceCsv } from "./csvImport.js";

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

// ── Hydrate guards (infra backlog I3) ────────────────────────────────────────
// The pairing that has now cost live data three times in one day: a background
// upsert fails, the failure only reaches console.warn, and the next server-wins
// hydrate overwrites localStorage with a server copy that never received the
// write. The guard was originally applied to persona_plans alone; these tests
// pin the GENERALISED versions, because every other domain had the same shape.
describe("_guardList — id-keyed domains", () => {
  beforeEach(() => localStorage.clear());

  const setSyncError = table =>
    localStorage.setItem("jungle_sync_errors", JSON.stringify({ [table]: { msg: "boom", at: Date.now() } }));

  it("returns the server list untouched when the last write SUCCEEDED", () => {
    const server = [{ id: "a" }];
    const local = [{ id: "a" }, { id: "ghost" }];
    let resaved = null;
    // No sync error recorded → server-wins is correct, even though local has more.
    // (A row missing from the server that we DID write is a real delete.)
    const out = _guardList("t", server, () => local, r => { resaved = r; });
    expect(out).toBe(server);
    expect(resaved).toBeNull();
  });

  it("keeps and re-pushes local rows the server never received after a FAILED write", () => {
    setSyncError("t");
    const server = [{ id: "a" }];
    const local = [{ id: "a" }, { id: "unsynced" }];
    let resaved = null;
    const out = _guardList("t", server, () => local, r => { resaved = r; });
    expect(out.map(r => r.id)).toEqual(["a", "unsynced"]);
    expect(resaved).toEqual(out);   // re-pushed, not just kept in memory
  });

  it("does not touch anything when a failed write left no local-only rows", () => {
    setSyncError("t");
    const server = [{ id: "a" }];
    let resaved = null;
    const out = _guardList("t", server, () => [{ id: "a" }], r => { resaved = r; });
    expect(out).toBe(server);
    expect(resaved).toBeNull();
  });

  it("is scoped per TABLE — one domain's failure must not alter another's hydrate", () => {
    setSyncError("other_table");
    const server = [{ id: "a" }];
    const out = _guardList("t", server, () => [{ id: "a" }, { id: "unsynced" }], () => {});
    expect(out).toBe(server);
  });

  it("survives a null/degenerate local list without throwing", () => {
    setSyncError("t");
    expect(_guardList("t", [{ id: "a" }], () => null, () => {})).toEqual([{ id: "a" }]);
    expect(_guardList("t", [{ id: "a" }], () => [null, { id: "b" }], () => {}).map(r => r.id)).toEqual(["a", "b"]);
  });
});

describe("_blobStale — single-row domains", () => {
  beforeEach(() => localStorage.clear());

  it("is false when the last write landed, so the server may win", () => {
    expect(_blobStale("brand_profiles")).toBe(false);
  });

  it("is true after a failed write, so a stale server row cannot revert local", () => {
    localStorage.setItem("jungle_sync_errors", JSON.stringify({ brand_profiles: { msg: "boom", at: Date.now() } }));
    expect(_blobStale("brand_profiles")).toBe(true);
    expect(_blobStale("user_prefs")).toBe(false);   // scoped per table
  });
});

describe("syncErrors", () => {
  beforeEach(() => localStorage.clear());

  it("lists every table with an outstanding failure", () => {
    expect(syncErrors()).toEqual([]);
    localStorage.setItem("jungle_sync_errors", JSON.stringify({
      persona_plans: { msg: "check violation", at: 1 },
      user_prefs: { msg: "network", at: 2 },
    }));
    expect(syncErrors().map(e => e.table).sort()).toEqual(["persona_plans", "user_prefs"]);
    expect(syncErrors().find(e => e.table === "persona_plans").msg).toBe("check violation");
  });
});

// ── I13: which failed writes are due for a retry ─────────────────────────────
// The pure decision behind background retry. The I/O around it (navigator.onLine,
// calling the re-push thunks, the interval) needs a live Supabase and a browser,
// so — like _mergeAppendLog for I14 — the decision is pinned here and the wiring
// is left to the integration surface. Base backoff is 5s, cap 5min.
describe("_dueRetries", () => {
  const BASE = 5_000, CAP = 300_000;

  it("returns nothing while offline — a retry that can't reach the network only burns an attempt", () => {
    const errors = { members: { at: 0, attempts: 0 } };   // long overdue
    expect(_dueRetries(errors, { online: false, now: 10 * CAP })).toEqual([]);
  });

  it("returns nothing for an empty or missing ledger", () => {
    expect(_dueRetries({}, { online: true, now: Date.now() })).toEqual([]);
    expect(_dueRetries(undefined, { online: true, now: Date.now() })).toEqual([]);
  });

  it("waits out the base backoff before the first retry", () => {
    const at = 1_000_000;
    const errors = { members: { at, attempts: 0 } };
    // just before base has elapsed → not yet due
    expect(_dueRetries(errors, { online: true, now: at + BASE - 1 })).toEqual([]);
    // at/after base → due
    expect(_dueRetries(errors, { online: true, now: at + BASE })).toEqual(["members"]);
  });

  it("backs off exponentially with the attempt count", () => {
    const at = 1_000_000;
    // attempts=3 → wait = base * 2^3 = 40s
    const errors = { attendance: { at, attempts: 3 } };
    expect(_dueRetries(errors, { online: true, now: at + 8 * BASE - 1 })).toEqual([]);
    expect(_dueRetries(errors, { online: true, now: at + 8 * BASE })).toEqual(["attendance"]);
  });

  it("never waits longer than the cap, no matter how many attempts have failed", () => {
    const at = 1_000_000;
    // 2^40 * base would be astronomical; the cap must clamp it to 5 min.
    const errors = { persona_plans: { at, attempts: 40 } };
    expect(_dueRetries(errors, { online: true, now: at + CAP - 1 })).toEqual([]);
    expect(_dueRetries(errors, { online: true, now: at + CAP })).toEqual(["persona_plans"]);
  });

  it("returns only the DUE tables, sorted for a deterministic retry order", () => {
    const now = 2_000_000;
    const errors = {
      members:      { at: now - BASE - 1, attempts: 0 },   // due
      user_prefs:   { at: now - 1,        attempts: 0 },   // too recent
      attendance:   { at: now - CAP,      attempts: 20 },  // capped → due
      brand_profiles:{ at: now - 100,     attempts: 5 },   // backing off → not due
    };
    expect(_dueRetries(errors, { online: true, now })).toEqual(["attendance", "members"]);
  });
});

// ── CSV backfill apply step (F4 slice 2) ─────────────────────────────────────
// analyzeAttendanceCsv validates; applyAttendanceImport materialises. The order
// (members -> class_instances -> attendance) is a foreign-key requirement, not a
// preference, and re-running an overlapping export must not duplicate anything.
describe("applyAttendanceImport", () => {
  beforeEach(() => localStorage.clear());

  const CSV = `Member Name,Email,Date,Class,Type
Sarah Chen,sarah@example.com,2026-03-04,Tuesday 6pm,S360
Tom Reed,tom@example.com,2026-03-04,Tuesday 6pm,S360
Sarah Chen,sarah@example.com,2026-03-06,Thursday 6pm,GC`;

  it("creates members, classes and check-ins from an empty roster", () => {
    const r = applyAttendanceImport(analyzeAttendanceCsv(CSV, []));
    expect(r).toMatchObject({ ok: true, members: 2, classes: 2, attendance: 3 });
    expect(getMembers()).toHaveLength(2);
    expect(getClassInstances()).toHaveLength(2);
    expect(getAttendance()).toHaveLength(3);
  });

  it("marks every backfilled row source='import' so it stays distinguishable from a live check-in", () => {
    applyAttendanceImport(analyzeAttendanceCsv(CSV, []));
    expect(getAttendance().every(a => a.source === "import")).toBe(true);
    getAttendance().forEach(a => expect(ATTENDANCE_SOURCES).toContain(a.source));
  });

  it("points check-ins at REAL member and class ids, not the analysis placeholders", () => {
    applyAttendanceImport(analyzeAttendanceCsv(CSV, []));
    const memberIds = new Set(getMembers().map(m => m.id));
    const ciIds = new Set(getClassInstances().map(c => c.id));
    getAttendance().forEach(a => {
      expect(memberIds.has(a.memberId)).toBe(true);
      expect(ciIds.has(a.classInstanceId)).toBe(true);
      expect(String(a.memberId).startsWith("new:")).toBe(false);
    });
  });

  it("reuses an existing roster member instead of creating a second row", () => {
    const { member } = addMember("Sarah Chen");
    const r = applyAttendanceImport(analyzeAttendanceCsv(CSV, getMembers()));
    expect(r.members).toBe(1);                  // only Tom is new
    expect(getMembers()).toHaveLength(2);
    const sarahRows = getAttendance().filter(a => a.memberId === member.id);
    expect(sarahRows).toHaveLength(2);
  });

  it("is IDEMPOTENT — re-importing the same file adds nothing", () => {
    applyAttendanceImport(analyzeAttendanceCsv(CSV, getMembers()));
    const second = applyAttendanceImport(analyzeAttendanceCsv(CSV, getMembers()));
    expect(second.attendance).toBe(0);
    expect(second.duplicates).toBe(3);
    expect(getAttendance()).toHaveLength(3);
    expect(getClassInstances()).toHaveLength(2);   // no duplicate occurrences
    expect(getMembers()).toHaveLength(2);
  });

  it("refuses to apply an analysis that failed validation", () => {
    const bad = analyzeAttendanceCsv("class,date\nTuesday,2026-03-04", []);
    expect(applyAttendanceImport(bad).ok).toBe(false);
    expect(getAttendance()).toHaveLength(0);
  });
});

// The Builder's working class. Found by driving the UI, not by a unit test: this
// was plain useState with no persistence, so a coach who planned a class and
// closed the tab lost the work — behind a Dashboard button offering to "Resume
// building" it. Every other domain in this module already persisted.
describe("draft class", () => {
  beforeEach(() => localStorage.clear());

  const DRAFT = {
    name: "Circuit Surge",
    stages: [{ id: "s1", name: "Activation", type: "warmup", dur: 300, exercises: [{ n: "Bear Crawl Sprint" }] }],
    classChoice: { classType: "crossfit", subType: "wod" },
  };

  it("round-trips the class a coach was working on", () => {
    saveDraftClass(DRAFT);
    const back = getDraftClass();
    expect(back.name).toBe("Circuit Surge");
    expect(back.stages).toHaveLength(1);
    expect(back.stages[0].exercises[0].n).toBe("Bear Crawl Sprint");
    expect(back.classChoice).toEqual({ classType: "crossfit", subType: "wod" });
  });

  it("returns null when nothing has been saved", () => {
    expect(getDraftClass()).toBeNull();
  });

  // The caller decides what "a new class" means. Inventing a default here would
  // put stages a coach never chose in front of them after a reload.
  it("returns null rather than a default for an empty or malformed draft", () => {
    saveDraftClass({ name: "x", stages: [] });
    expect(getDraftClass()).toBeNull();
    localStorage.setItem("jungle_draft_class", JSON.stringify({ name: "x" }));
    expect(getDraftClass()).toBeNull();
    localStorage.setItem("jungle_draft_class", "not json");
    expect(getDraftClass()).toBeNull();
  });

  it("ignores a save with no stages array instead of clobbering a good draft", () => {
    saveDraftClass(DRAFT);
    saveDraftClass({ name: "clobber" });
    expect(getDraftClass().name).toBe("Circuit Surge");
  });
});

// ── M1: editing a member ─────────────────────────────────────────────────────
// The roster could be read and added to but never corrected. A misspelled name
// captured mid-class was permanent, and there was no way to mark someone as
// having left — so "active members" counted people who quit months ago, and the
// at-risk list kept flagging them forever.
describe("updateMember", () => {
  beforeEach(() => localStorage.clear());

  const seed = () => addMember("Ada Lovelace", { email: "ada@example.com" }).member;

  it("patches only the fields it is given", () => {
    const m = seed();
    const { member } = updateMember(m.id, { name: "Ada L." });
    expect(member.name).toBe("Ada L.");
    // The whole point of a patch: email survives untouched.
    expect(member.email).toBe("ada@example.com");
    expect(member.id).toBe(m.id);
    expect(getMembers()[0].name).toBe("Ada L.");
  });

  it("persists, so a correction survives a reload", () => {
    const m = seed();
    updateMember(m.id, { email: "ada@newdomain.com" });
    expect(getMembers()[0].email).toBe("ada@newdomain.com");
  });

  it("coerces an illegal status instead of persisting it", () => {
    // "archived" is the value a status dropdown reaches for by default, and
    // members.status rejects it. It must never reach localStorage either — a bad
    // local value comes back on the next read and re-attempts the failed write.
    const m = seed();
    const { member } = updateMember(m.id, { status: "archived" });
    expect(member.status).toBe("active");
    expect(MEMBER_STATUSES).toContain(member.status);
    expect(getMembers()[0].status).toBe("active");
  });

  it("accepts every status the database allows", () => {
    const m = seed();
    for (const s of MEMBER_STATUSES) {
      expect(updateMember(m.id, { status: s }).member.status).toBe(s);
    }
  });

  it("refuses to blank a member's name", () => {
    // A nameless member cannot be found in the check-in list or searched for —
    // it is unreachable, not merely untidy.
    const m = seed();
    const res = updateMember(m.id, { name: "   " });
    expect(res.member).toBeNull();
    expect(res.error).toMatch(/name/i);
    expect(getMembers()[0].name).toBe("Ada Lovelace");   // unchanged
  });

  it("drops unknown keys rather than riding them into a fixed column set", () => {
    const m = seed();
    const { member } = updateMember(m.id, { name: "Ada", nickname: "The Countess" });
    expect(member.nickname).toBeUndefined();
  });

  it("returns null for an id that is not on the roster, without touching it", () => {
    seed();
    const res = updateMember("no-such-id", { name: "Ghost" });
    expect(res.member).toBeNull();
    expect(res.members).toHaveLength(1);
    expect(getMembers()[0].name).toBe("Ada Lovelace");
  });

  it("edits the right member when several share a first name", () => {
    const a = addMember("Sam Reed").member;
    addMember("Sam Torres");
    updateMember(a.id, { status: "cancelled" });
    const byId = Object.fromEntries(getMembers().map(m => [m.name, m.status]));
    expect(byId["Sam Reed"]).toBe("cancelled");
    expect(byId["Sam Torres"]).toBe("active");
  });
});

describe("memberStatus", () => {
  it("passes through the legal values and falls back for anything else", () => {
    MEMBER_STATUSES.forEach(s => expect(memberStatus(s)).toBe(s));
    ["archived", "inactive", "canceled", "", null, undefined, 7].forEach(bad =>
      expect(MEMBER_STATUSES).toContain(memberStatus(bad)));
  });

  it("rejects the ONE-L spelling, which is legal only on a different column", () => {
    // entity_status (0001) allows "canceled"; members.status (0007) wants
    // "cancelled". Mixing them up is a silent failed write.
    expect(memberStatus("canceled")).toBe("active");
  });
});

// ── I14: paged hydrate + the merge that decides what gets re-pushed ──────────
// `.limit(2000)` on an append-only log was a silent truncation with a date on
// it. A studio at 20 classes/week x 12 heads generates ~12,500 attendance rows a
// year, so the cap was reached inside twelve months and then TWO things went
// wrong at once, neither visibly:
//
//   1. a newly signed-in device saw only the newest 2,000 rows, so every
//      retention number was computed on a truncated history and was simply wrong
//   2. the merge read "not in the response" as "the server never got it", so
//      every row outside the window looked local-only and was RE-PUSHED on every
//      hydrate — a permanent, growing rewrite of the whole back-catalogue
//
// `_mergeAppendLog` is where (2) is decided, so it is tested directly rather
// than through a hydrate that would need a live Supabase — the same reasoning
// that already exports _guardList and _ciToRow.
describe("_mergeAppendLog", () => {
  const row = (id) => ({ id, checkedInAt: `2026-01-${String(id).padStart(2, "0")}` });

  it("keeps every row from both sides", () => {
    const { merged } = _mergeAppendLog([row(1), row(2)], [row(2), row(3)], true);
    expect(merged.map(r => r.id).sort()).toEqual([1, 2, 3]);
  });

  it("never duplicates a row present on both sides", () => {
    // The id is the identity. A duplicated check-in inflates every visit count
    // and every retention number derived from it.
    const { merged } = _mergeAppendLog([row(1), row(2)], [row(1), row(2)], true);
    expect(merged).toHaveLength(2);
  });

  it("pushes rows the server provably lacks when the fetch was COMPLETE", () => {
    const { toPush } = _mergeAppendLog([row(1)], [row(1), row(2)], true);
    expect(toPush.map(r => r.id)).toEqual([2]);
  });

  it("pushes NOTHING when the fetch was truncated, but still keeps the rows", () => {
    // The heart of the fix. With an incomplete view, a local row missing from the
    // response proves nothing — it is far more likely to be older than the window
    // than genuinely unsynced. Keeping it costs nothing; re-pushing it every
    // hydrate rewrites the entire history forever.
    const { merged, toPush } = _mergeAppendLog([row(1)], [row(1), row(2), row(3)], false);
    expect(toPush).toEqual([]);
    expect(merged.map(r => r.id).sort()).toEqual([1, 2, 3]);   // nothing lost
  });

  it("keeps an offline-only check-in, which may be the only copy in existence", () => {
    const { merged, toPush } = _mergeAppendLog([], [row(9)], true);
    expect(merged.map(r => r.id)).toEqual([9]);
    expect(toPush.map(r => r.id)).toEqual([9]);
  });

  it("survives empty and missing inputs rather than throwing mid-hydrate", () => {
    expect(_mergeAppendLog([], [], true)).toEqual({ merged: [], toPush: [] });
    expect(_mergeAppendLog(null, null, true)).toEqual({ merged: [], toPush: [] });
    expect(_mergeAppendLog(undefined, [row(1)], false).merged).toHaveLength(1);
  });

  it("ignores a null row in the local list instead of poisoning the push", () => {
    const { merged, toPush } = _mergeAppendLog([row(1)], [null, row(2)], true);
    expect(merged.map(r => r.id).sort()).toEqual([1, 2]);
    expect(toPush.map(r => r.id)).toEqual([2]);
  });

  it("prefers the SERVER copy when the same id exists on both sides", () => {
    // Attendance rows are immutable once written, so this is a tie-break rather
    // than a policy — but it must be deterministic, not insertion-order luck.
    const server = { id: 1, source: "coach" };
    const local  = { id: 1, source: "qr" };
    const { merged } = _mergeAppendLog([server], [local], true);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("coach");
  });
});
