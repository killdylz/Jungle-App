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
  _pendingDeletes, _pendingDeletesFor, _deletedIdsFor,
  getDraftClass, saveDraftClass,
  updateMember, memberStatus, MEMBER_STATUSES, _mergeAppendLog, _dueRetries,
  _deltaRows, _markSynced, _unmark, publishOccurrences, startScheduledClass,
  appendPersonaGeneration, getPersonaGenerations,
  _clearLedgerIfSettled, syncErrorSignature,
  restorePersonaCascade, getPersonas, getPersonaPlans, getPersonaMovements,
  addCoach, updateCoach, removeCoach, getCoaches, saveCoaches, coachAccountFor,
  connect,
} from "./store.js";
import { analyzeAttendanceCsv, describeImport } from "./csvImport.js";
import { atRiskMembers } from "./retention.js";

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

  // B4 publishes dated occurrences from the Schedule; the Runner mints one when a
  // coach presses play. They are two doors into the SAME table, and whether they
  // meet decides if a class's check-ins land on the row the Schedule published or
  // on a second row nobody looks at. The join works — on name, inside the 4h
  // window — so it is pinned here before anything relies on it.
  it("joins the occurrence the Schedule already published, rather than minting a second", () => {
    const startsAt = new Date().toISOString();          // the class runs at its slot
    const published = publishOccurrences([{ startsAt, name: "S360", classType: "HIIT",
                                            coachName: "Dylan", durationMin: 45 }]).instances[0];
    const { instance } = ensureClassInstance({ name: "S360", classType: "HIIT" });
    expect(instance.id).toBe(published.id);
    expect(getClassInstances()).toHaveLength(1);
    // The published row's real data survives — the Runner joins it, never overwrites it.
    expect(instance).toMatchObject({ coachName: "Dylan", durationMin: 45 });
  });

  it("still joins a class started a few minutes off its slot", () => {
    const startsAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const published = publishOccurrences([{ startsAt, name: "S360" }]).instances[0];
    expect(ensureClassInstance({ name: "S360" }).instance.id).toBe(published.id);
  });

  // ── THE GAP, closed (session 11, §3A) ──────────────────────────────────────
  // The join above is keyed on NAME, and nothing made the Builder's `sessionName`
  // equal the schedule rule's name: it comes from the draft, a template or a
  // persona and defaults to "My Workout". So in real use the names differed, the
  // Runner minted a second occurrence, and the published row kept zero attendance
  // forever. Measured before the fix: identical names at slot time -> 1
  // occurrence; "S360" published vs "S360 — Week 4" or "My Workout" run -> 2.
  //
  // NOT fixed by loosening the match — guessing WHICH scheduled occurrence a
  // coach is running would attach attendance to the wrong class permanently and
  // invisibly. Fixed by letting the coach start the class FROM the Schedule, so
  // the occurrence is chosen and its id travels into the Runner.
  //
  // This is the test that pins the whole point of the change: the names diverge
  // as badly as they ever did, and the check-in still lands on the published row.
  it("carries the Schedule's occurrence into the Runner so the names cannot diverge", () => {
    const startsAt = new Date().toISOString();
    const published = publishOccurrences([{ startsAt, name: "S360", classType: "HIIT",
                                            coachName: "Dylan", durationMin: 45 }]).instances[0];

    // The coach taps Start on that cell. The occurrence is chosen, not inferred.
    const started = startScheduledClass({ name: "S360", startsAt });
    expect(started.created).toBe(false);
    expect(started.instance.id).toBe(published.id);

    // …and runs it under a completely different name — the default, the worst case.
    const { instance } = ensureClassInstance({ name: "My Workout", classType: "HIIT",
                                               instanceId: started.instance.id });
    expect(instance.id).toBe(published.id);
    expect(getClassInstances()).toHaveLength(1);
    // The published row is untouched: still the schedule's name, coach and length.
    expect(instance).toMatchObject({ name: "S360", coachName: "Dylan", durationMin: 45 });

    // And the attendance actually lands there — the thing that was zero forever.
    const { member } = addMember("Ana");
    recordAttendance({ classInstanceId: instance.id, memberId: member.id });
    expect(getAttendance().filter(a => a.classInstanceId === published.id)).toHaveLength(1);
  });

  // A pin that no longer resolves must not mint a row under an id nothing else
  // knows about. Reloading the tab drops the pin (it is in-memory), and this is
  // the path that has to stay safe — it degrades to the name join above, which
  // now matches because starting from the Schedule set `sessionName`.
  it("falls back to the name join when the pinned occurrence is gone", () => {
    const startsAt = new Date().toISOString();
    const published = publishOccurrences([{ startsAt, name: "S360" }]).instances[0];
    const { instance } = ensureClassInstance({ name: "S360", instanceId: "ci-that-never-existed" });
    expect(instance.id).toBe(published.id);
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

// ── §3A: starting a class from the Schedule ─────────────────────────────────
// The third door into class_instances, and the only one that resolves an
// occurrence from what the coach pointed at rather than from a name and a clock.
describe("startScheduledClass", () => {
  beforeEach(() => localStorage.clear());

  it("returns the row the Schedule already published, without writing a second", () => {
    const startsAt = new Date().toISOString();
    const published = publishOccurrences([{ startsAt, name: "Morning Burn", coachName: "Dylan" }]).instances[0];
    const r = startScheduledClass({ name: "Morning Burn", startsAt, coachName: "" });
    expect(r.instance.id).toBe(published.id);
    expect(r.created).toBe(false);
    // Starting must never overwrite what the Schedule wrote — the same trap as
    // the Runner's door in session 10, where one door recorded a null duration.
    expect(r.instance.coachName).toBe("Dylan");
    expect(getClassInstances()).toHaveLength(1);
  });

  it("puts an unpublished class on the books rather than refusing to start it", () => {
    const startsAt = new Date().toISOString();
    const r = startScheduledClass({ name: "Hyrox Sim", startsAt, classType: "Hyrox",
                                    coachName: "Mara", durationMin: 60 });
    expect(r.created).toBe(true);
    expect(getClassInstances()).toHaveLength(1);
    expect(r.instance).toMatchObject({ name: "Hyrox Sim", classType: "Hyrox", coachName: "Mara", durationMin: 60 });
  });

  // THE one that matters: the row keeps the SLOT's time, not the moment Start was
  // pressed. Otherwise publishing the week afterwards would not recognise it, and
  // the same class would sit on the books twice — six minutes apart.
  it("dates the occurrence to its slot, not to when Start was pressed", () => {
    const slot = new Date(Date.now() - 6 * 60_000).toISOString();
    const r = startScheduledClass({ name: "Morning Burn", startsAt: slot });
    expect(r.instance.startsAt).toBe(slot);

    const after = publishOccurrences([{ startsAt: slot, name: "Morning Burn" }]);
    expect(after.created).toBe(0);
    expect(after.already).toBe(1);
    expect(getClassInstances()).toHaveLength(1);
  });

  it("is idempotent when a coach presses Start twice", () => {
    const startsAt = new Date().toISOString();
    const first  = startScheduledClass({ name: "Morning Burn", startsAt });
    const second = startScheduledClass({ name: "Morning Burn", startsAt });
    expect(second.instance.id).toBe(first.instance.id);
    expect(getClassInstances()).toHaveLength(1);
  });

  it("refuses an occurrence it cannot identify instead of writing a nameless row", () => {
    for (const bad of [null, undefined, {}, { name: "No time" }, { startsAt: new Date().toISOString() }]) {
      expect(startScheduledClass(bad)).toBeNull();
    }
    expect(getClassInstances()).toHaveLength(0);
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

// ─── §2.5 · a delete that failed must not undo itself ────────────────────────
//
// `_bgDelete` sent its failure to console.warn and nowhere else: never in the
// ledger, never retried, and the next hydrate found the row still on the server
// and put it back. The coach deletes a coach, watches them go, and finds them
// again tomorrow.
//
// The tombstone queue is what makes a delete retryable at all — after the local
// delete there is no record the id ever existed, so the local list cannot express
// "and not this one". These pin the two jobs it does. See PENDING_DEL_KEY in
// store.js for the reasoning, including why simply recording a sync error would be
// worse than the silence it replaced.
describe("pending deletes", () => {
  beforeEach(() => localStorage.clear());

  const seed = (rows) => localStorage.setItem("jungle_pending_deletes", JSON.stringify(rows));
  const tomb = (table, val, col = "id") => ({ table, col, val, at: Date.now() });

  it("reads back per table and never leaks between them", () => {
    seed([tomb("coach_personas", "p1"), tomb("persona_plans", "pl9"), tomb("coach_personas", "p2")]);
    expect(_pendingDeletes()).toHaveLength(3);
    expect(_pendingDeletesFor("coach_personas").map(d => d.val)).toEqual(["p1", "p2"]);
    expect(_pendingDeletesFor("persona_plans").map(d => d.val)).toEqual(["pl9"]);
    expect(_pendingDeletesFor("members")).toEqual([]);
  });

  it("collects only id-keyed tombstones as deleted ids", () => {
    // A blob delete is keyed on `gym_id` and needs no tombstone — the absence of a
    // local override IS the tombstone, and `library_overrides`' retry pusher
    // already mirrors that. Feeding a gym_id row to the row-level guard would
    // filter every row belonging to that gym.
    seed([tomb("coach_personas", "p1"), tomb("library_overrides", "gym-7", "gym_id")]);
    expect([..._deletedIdsFor("coach_personas")]).toEqual(["p1"]);
    expect(_deletedIdsFor("library_overrides").size).toBe(0);
  });

  it("degrades to empty on corrupted storage rather than throwing on hydrate", () => {
    localStorage.setItem("jungle_pending_deletes", "{not json");
    expect(_pendingDeletes()).toEqual([]);
    expect(_deletedIdsFor("coach_personas").size).toBe(0);
  });

  // ── Job 1: the resurrection the coach actually sees ────────────────────────
  it("drops a server row the coach deleted while the delete was unsent", () => {
    seed([tomb("coach_personas", "gone")]);
    const server = [{ id: "keep" }, { id: "gone" }];
    const out = _guardList("coach_personas", server, () => [{ id: "keep" }], () => {});
    expect(out.map(r => r.id)).toEqual(["keep"]);
  });

  it("drops it even when the ledger has since been cleared", () => {
    // Deliberately no sync error. A later successful upsert to the same table
    // clears the ledger, and the deletion is still outstanding — so the guard runs
    // this filter unconditionally rather than behind `syncErrorFor`.
    expect(syncErrors()).toEqual([]);
    seed([tomb("coach_personas", "gone")]);
    const out = _guardList("coach_personas", [{ id: "keep" }, { id: "gone" }], () => [], () => {});
    expect(out.map(r => r.id)).toEqual(["keep"]);
  });

  it("does not re-add a deleted row through the local-only path", () => {
    // The nastiest interaction. `_guardList` keeps local rows the server never
    // received; a stale local copy still holding the deleted row would otherwise be
    // treated as unsynced work and pushed straight back up.
    localStorage.setItem("jungle_sync_errors", JSON.stringify({ coach_personas: { msg: "boom", at: Date.now() } }));
    seed([tomb("coach_personas", "gone")]);
    let resaved = null;
    const out = _guardList("coach_personas", [{ id: "keep" }],
      () => [{ id: "keep" }, { id: "gone" }, { id: "genuinely-unsynced" }], r => { resaved = r; });
    expect(out.map(r => r.id)).toEqual(["keep", "genuinely-unsynced"]);
    expect(resaved.map(r => r.id)).toEqual(["keep", "genuinely-unsynced"]);
  });

  it("CONTROL: with no tombstone the guard behaves exactly as before", () => {
    // Without this the five assertions above would all pass against a guard that
    // dropped every server row it was handed.
    const server = [{ id: "keep" }, { id: "gone" }];
    expect(_guardList("coach_personas", server, () => [{ id: "keep" }], () => {})).toBe(server);
  });

  it("is scoped per table — one domain's tombstone cannot filter another's rows", () => {
    seed([tomb("persona_plans", "gone")]);
    const server = [{ id: "keep" }, { id: "gone" }];
    expect(_guardList("coach_personas", server, () => [], () => {})).toBe(server);
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

// ── The ledger entry nothing could clear ─────────────────────────────────────
// Found while diagnosing why the sync banner never goes away. _bgUpsertDelta
// makes NO request when there is no delta, and _clearSyncError only runs on a
// successful request — so once a table's rows were confirmed (or deleted) after
// a failure, the ledger entry became immortal. The banner named a domain with
// nothing left to send, forever, and no action available to a coach could clear
// it. These pin the settle step that closes it.
describe("_clearLedgerIfSettled", () => {
  beforeEach(() => localStorage.clear());
  const setSyncError = (table, msg = "boom") =>
    localStorage.setItem("jungle_sync_errors", JSON.stringify({ [table]: { msg, at: Date.now() } }));

  it("clears the entry when every local row is already server-confirmed", () => {
    const rows = [{ id: "p1", name: "Mike" }];
    _markSynced("coach_personas", rows, rows);      // the server said yes to these
    setSyncError("coach_personas");
    expect(_clearLedgerIfSettled("coach_personas", _deltaRows("coach_personas", rows))).toBe(true);
    expect(syncErrors()).toEqual([]);
  });

  it("clears when the local list has gone EMPTY — the case with nothing to re-push", () => {
    // The retry thunk calls save*(get*()); with an empty list the delta is empty
    // and no request is ever made, so this was the state that stuck hardest.
    setSyncError("coach_personas");
    expect(_clearLedgerIfSettled("coach_personas", _deltaRows("coach_personas", []))).toBe(true);
    expect(syncErrors()).toEqual([]);
  });

  it("does NOT clear while a row is still unconfirmed — the banner must stay up", () => {
    // The whole point of the ledger. A row the server never acknowledged is
    // exactly the data the banner exists to warn about.
    setSyncError("coach_personas");
    const rows = [{ id: "p1", name: "Mike" }];      // never marked
    expect(_clearLedgerIfSettled("coach_personas", _deltaRows("coach_personas", rows))).toBe(false);
    expect(syncErrors().map(e => e.table)).toEqual(["coach_personas"]);
  });

  it("is scoped per table — one domain settling must not silence another", () => {
    localStorage.setItem("jungle_sync_errors", JSON.stringify({
      coach_personas: { msg: "boom", at: 1 }, persona_plans: { msg: "boom", at: 1 },
    }));
    _clearLedgerIfSettled("coach_personas", []);
    expect(syncErrors().map(e => e.table)).toEqual(["persona_plans"]);
  });
});

// ── Undoing a coach delete has to survive the CASCADE ────────────────────────
//
// The subtle half of session 25's undo. `deletePersona` removes only the
// coach_personas row from the server; persona_plans, persona_movements and
// persona_generations go with it through their FKs' ON DELETE CASCADE — no
// client call, so no `_unmark`. Those rows keep the fingerprints the server
// confirmed BEFORE the delete, so a plain re-save computes an empty delta and
// pushes nothing: the coach sees their corpus restored on this device while the
// server stays empty, and the next server-wins hydrate takes it away for good.
//
// That failure is completely invisible locally — every local assertion passes.
// It is only observable as "which rows would the next push send", which is what
// these assert.
describe("restorePersonaCascade", () => {
  beforeEach(() => localStorage.clear());

  const CORPUS = {
    personas:    [{ id: "p1", name: "Coach Mike" }],
    plans:       [{ id: "pl1", personaId: "p1", title: "S360" }],
    movements:   [{ id: "mv1", personaId: "p1", name: "Back Squat" }],
    generations: [{ id: "gn1", personaId: "p1" }],
  };
  // What the server had confirmed before the delete.
  const markEverything = () => {
    _markSynced("persona_plans",       [{ id: "pl1" }], [{ id: "pl1" }]);
    _markSynced("persona_movements",   [{ id: "mv1" }], [{ id: "mv1" }]);
    _markSynced("persona_generations", [{ id: "gn1" }], [{ id: "gn1" }]);
  };

  it("POSITIVE CONTROL: those marks really do suppress a push", () => {
    // Without this, the assertions below could pass because the marks were never
    // written in the first place — the test would prove nothing at all.
    markEverything();
    expect(_deltaRows("persona_plans", [{ id: "pl1" }]), "a confirmed row must NOT be in the delta").toEqual([]);
    expect(_deltaRows("persona_movements", [{ id: "mv1" }])).toEqual([]);
    expect(_deltaRows("persona_generations", [{ id: "gn1" }])).toEqual([]);
  });

  it("drops the cascaded tables' marks so the undo actually reaches Postgres", () => {
    markEverything();
    restorePersonaCascade(CORPUS);
    expect(_deltaRows("persona_plans", [{ id: "pl1" }]),
      "restored plans must be queued for re-push — the cascade deleted them server-side").toHaveLength(1);
    expect(_deltaRows("persona_movements", [{ id: "mv1" }])).toHaveLength(1);
    expect(_deltaRows("persona_generations", [{ id: "gn1" }])).toHaveLength(1);
  });

  it("puts every domain back on this device", () => {
    restorePersonaCascade(CORPUS);
    expect(getPersonas().map(p => p.id)).toEqual(["p1"]);
    expect(getPersonaPlans().map(p => p.id)).toEqual(["pl1"]);
    expect(getPersonaMovements().map(m => m.id)).toEqual(["mv1"]);
  });

  it("survives a degenerate or partial snapshot without throwing", () => {
    // The undo closure is held for nine seconds across any amount of other
    // state change; it must not be able to be the thing that breaks the screen.
    expect(() => restorePersonaCascade()).not.toThrow();
    expect(() => restorePersonaCascade({ personas: null, plans: [null] })).not.toThrow();
  });
});

// ── What the banner's dismiss is keyed on ────────────────────────────────────
describe("syncErrorSignature", () => {
  it("ignores `at` and `attempts`, so a dismissal survives the next failed retry", () => {
    // Retries fire every 30s and each failure rewrites both. If either were in
    // the signature, dismissing the banner would hide it for under half a minute
    // — a button that does nothing, which is worse than no button.
    const a = [{ table: "coach_personas", msg: "relation does not exist", at: 1, attempts: 0 }];
    const b = [{ table: "coach_personas", msg: "relation does not exist", at: 99, attempts: 14 }];
    expect(syncErrorSignature(a)).toBe(syncErrorSignature(b));
  });

  it("changes when a NEW table starts failing", () => {
    const a = [{ table: "coach_personas", msg: "x" }];
    const b = [{ table: "coach_personas", msg: "x" }, { table: "members", msg: "x" }];
    expect(syncErrorSignature(a)).not.toBe(syncErrorSignature(b));
  });

  it("changes when the same table fails for a NEW reason", () => {
    const a = [{ table: "coach_personas", msg: "relation does not exist" }];
    const b = [{ table: "coach_personas", msg: "violates row-level security policy" }];
    expect(syncErrorSignature(a)).not.toBe(syncErrorSignature(b));
  });

  it("is order-independent — syncErrors() returns object-key order, which is not stable", () => {
    const a = [{ table: "members", msg: "x" }, { table: "coach_personas", msg: "y" }];
    const b = [{ table: "coach_personas", msg: "y" }, { table: "members", msg: "x" }];
    expect(syncErrorSignature(a)).toBe(syncErrorSignature(b));
  });

  it("cannot flatten two different ledgers onto one signature", () => {
    // Delimiters are control characters for exactly this reason: a collision
    // would hide a CHANGED error behind an old dismissal.
    const a = [{ table: "a", msg: "b c" }];
    const b = [{ table: "a b", msg: "c" }];
    expect(syncErrorSignature(a)).not.toBe(syncErrorSignature(b));
  });

  it("is empty for an empty or missing ledger", () => {
    expect(syncErrorSignature([])).toBe("");
    expect(syncErrorSignature(undefined)).toBe("");
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

// ── I10: delta writes ────────────────────────────────────────────────────────
// What actually reaches Postgres on a save. The whole-list upsert this replaces
// meant one bad row failed EVERY row in the domain — the 2026-07-18 data loss at
// the top of this file. The danger in fixing it is that the full-list push was
// accidentally self-healing (every save re-sent everything, so a failed row got
// another chance), so these tests care as much about what STAYS in the delta as
// about what leaves it.
describe("_deltaRows / _markSynced", () => {
  const T = "persona_plans";
  const row = (id, v) => ({ id, gym_id: "g1", title: v });
  beforeEach(() => localStorage.removeItem("jungle_synced_rows"));

  it("sends everything when the server has confirmed nothing", () => {
    const rows = [row("a", 1), row("b", 2)];
    expect(_deltaRows(T, rows)).toEqual(rows);
  });

  it("sends nothing when every row is unchanged — the common re-save", () => {
    const rows = [row("a", 1), row("b", 2)];
    _markSynced(T, rows, rows);
    expect(_deltaRows(T, rows)).toEqual([]);
  });

  it("sends ONLY the row that changed", () => {
    const rows = [row("a", 1), row("b", 2), row("c", 3)];
    _markSynced(T, rows, rows);
    const edited = [rows[0], { ...rows[1], title: 99 }, rows[2]];
    expect(_deltaRows(T, edited)).toEqual([{ id: "b", gym_id: "g1", title: 99 }]);
  });

  it("sends a newly added row and nothing else", () => {
    const rows = [row("a", 1)];
    _markSynced(T, rows, rows);
    expect(_deltaRows(T, [rows[0], row("b", 2)])).toEqual([row("b", 2)]);
  });

  it("notices a change to any mapped field, not just the visible one", () => {
    const rows = [row("a", 1)];
    _markSynced(T, rows, rows);
    // Same id, same title, different gym — must not be mistaken for synced.
    expect(_deltaRows(T, [{ id: "a", gym_id: "g2", title: 1 }])).toHaveLength(1);
  });

  // THE self-healing property. A push that failed is never marked, so it must
  // still be in the next delta — otherwise a transient Wi-Fi blip becomes
  // permanent divergence, which is strictly worse than the whole-list push.
  it("keeps an unconfirmed row in the delta forever until it is confirmed", () => {
    const ok = row("a", 1), failed = row("b", 2);
    _markSynced(T, [ok], [ok, failed]);          // only `a` came back clean
    expect(_deltaRows(T, [ok, failed])).toEqual([failed]);
    // ...and it is still there on the save after that, and the one after.
    expect(_deltaRows(T, [ok, failed])).toEqual([failed]);
    _markSynced(T, [failed], [ok, failed]);      // the retry finally lands
    expect(_deltaRows(T, [ok, failed])).toEqual([]);
  });

  it("keeps each table's marks separate", () => {
    const rows = [row("a", 1)];
    _markSynced(T, rows, rows);
    expect(_deltaRows("members", rows)).toEqual(rows);
  });

  it("drops marks for rows deleted locally, so the map cannot grow forever", () => {
    const rows = [row("a", 1), row("b", 2)];
    _markSynced(T, rows, rows);
    _markSynced(T, [], [rows[0]]);               // `b` deleted
    const marks = JSON.parse(localStorage.getItem("jungle_synced_rows"))[T];
    expect(Object.keys(marks)).toEqual(["a"]);
  });

  // A re-added id must not inherit the dead row's mark and skip its push.
  it("re-sends an id that was deleted and later came back with new content", () => {
    const a = row("a", 1);
    _markSynced(T, [a], [a]);
    _markSynced(T, [], []);                      // deleted
    expect(_deltaRows(T, [row("a", 7)])).toHaveLength(1);
  });

  // The nastier version of the same case: deleted, then re-added with IDENTICAL
  // content. The fingerprint matches the dead row's mark, so without _unmark the
  // row looks synced and the server stays permanently missing it. _bgDelete calls
  // this for every id-keyed delete.
  it("re-sends an id that was deleted and came back byte-identical", () => {
    const a = row("a", 1);
    _markSynced(T, [a], [a]);
    expect(_deltaRows(T, [a])).toEqual([]);       // synced, as far as we know
    _unmark(T, "a");                             // what _bgDelete does
    expect(_deltaRows(T, [a])).toEqual([a]);      // ...and now it must go again
  });

  it("unmarking an absent table or id is a no-op, not a throw", () => {
    expect(() => _unmark("nope", "x")).not.toThrow();
    _markSynced(T, [row("a", 1)], [row("a", 1)]);
    expect(() => _unmark(T, "missing")).not.toThrow();
    expect(_deltaRows(T, [row("a", 1)])).toEqual([]);
  });

  it("survives a missing or malformed list", () => {
    expect(_deltaRows(T, null)).toEqual([]);
    expect(_deltaRows(T, [null, undefined])).toEqual([]);
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

  // ── The third door into class_instances.class_type ────────────────────────
  // A backfill carries the OLD system's vocabulary. Left alone it wrote "HIIT"
  // while the Runner wrote "hiit" for the same class, so the very history being
  // imported to make N2 possible arrived ungroupable against everything
  // recorded since.
  const TYPED = `Member,Date,Class,Type
Sarah Chen,2026-03-04,Tuesday 6pm,HIIT
Tom Reed,2026-03-05,Wednesday 7pm,Strength Training
Ann Poh,2026-03-06,Friday 6pm,Aqua Aerobics`;
  const LIB = { hiit: { label: "HIIT" }, strength: { label: "Strength Training" } };
  const typeOf = name => getClassInstances().find(c => c.name === name).classType;

  it("resolves an imported class type to the catalogue's key", () => {
    applyAttendanceImport(analyzeAttendanceCsv(TYPED, []), LIB);
    expect(getClassInstances(), "precondition: three occurrences must exist").toHaveLength(3);
    expect(typeOf("Tuesday 6pm")).toBe("hiit");
    expect(typeOf("Wednesday 7pm")).toBe("strength");
    // Not ours to guess at — a type the catalogue has never heard of keeps the
    // text the gym's old system used.
    expect(typeOf("Friday 6pm")).toBe("Aqua Aerobics");
  });

  // The CONTROL for the test above: without a catalogue nothing is resolved, so
  // a pass there cannot come from the fixture simply being lowercase already.
  it("stores the file's own wording when no catalogue is supplied", () => {
    applyAttendanceImport(analyzeAttendanceCsv(TYPED, []));
    expect(typeOf("Tuesday 6pm")).toBe("HIIT");
    expect(typeOf("Wednesday 7pm")).toBe("Strength Training");
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

// ── SWEEP: CSV backfill → members → class_instances → attendance → retention ──
//
// The whole chain, over a multi-week corpus, ending on the DERIVED store. Every
// step of this already had per-function tests and they all passed; what none of
// them could see is the composition — the same shape as session 10's parser
// defect, which every unit test missed and one whole-deck sweep caught.
//
// Why a corpus and not three rows: a studio switching to Jungle imports YEARS of
// attendance, and the defects that matter here scale with the file. The counts
// below are the quantification — they are what makes a "tidy-looking nit" either
// obviously fine or obviously a must-fix.
//
// The clock is fixed. Retention arithmetic is all relative to now, so a corpus
// built from `new Date()` would assert something different every day it ran.
describe("SWEEP — a real attendance export, end to end", () => {
  beforeEach(() => localStorage.clear());

  const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
  const dayAt = off => new Date(NOW + off * 86_400_000).toISOString().slice(0, 10);

  // Ana is already on the roster, under a DIFFERENT name from the one the export
  // uses ("A. Lim"). Only the email can match her; if it does not, she is
  // duplicated and her four years of history splits across two members.
  const ANA = { id: "m-ana", name: "Ana Lim", email: "ana@example.com",
                status: "active", joinedAt: dayAt(-400) };

  const CORPUS = [
    "Member Name,Email,Date,Class,Type,Coach",
    // Ana — matched by email despite the name, and sharing the -60 class with Ben.
    `A. Lim,ANA@EXAMPLE.COM,${dayAt(-60)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-60)},S360,HIIT,Dylan`,
    `A. Lim,ANA@EXAMPLE.COM,${dayAt(-30)},S360,HIIT,Dylan`,
    `A. Lim,ANA@EXAMPLE.COM,${dayAt(-9)},GC,Hyrox,Mara`,
    `A. Lim,ANA@EXAMPLE.COM,${dayAt(-2)},S360,HIIT,Dylan`,
    // A genuine duplicate: same member, same class, same day, twice in the file.
    `A. Lim,ANA@EXAMPLE.COM,${dayAt(-2)},S360,HIIT,Dylan`,
    // Ben — a long history that stops 40 days ago.
    `Ben Tan,ben@example.com,${dayAt(-120)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-110)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-100)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-90)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-50)},S360,HIIT,Dylan`,
    `Ben Tan,ben@example.com,${dayAt(-40)},S360,HIIT,Dylan`,
    // Cara — joined recently, two visits, still inside her first month.
    `Cara Ng,cara@example.com,${dayAt(-20)},GC,Hyrox,Mara`,
    `Cara Ng,cara@example.com,${dayAt(-18)},GC,Hyrox,Mara`,
    // Dan — the morning AND the evening class of the same name, same day. Two
    // real classes, two real attendances. Most studios run exactly this.
    `Dan Ho,dan@example.com,${dayAt(-10)}T06:00,Morning Burn,HIIT,Jo`,
    `Dan Ho,dan@example.com,${dayAt(-10)}T18:00,Morning Burn,HIIT,Jo`,
    // Unreadable date — reported with its line, never guessed.
    `Eve Wong,eve@example.com,sometime last spring,S360,HIIT,Dylan`,
  ].join("\n");

  const analyse = () => analyzeAttendanceCsv(CORPUS, getMembers());

  it("reads the corpus without inventing or losing a class", () => {
    saveMembers([ANA]);
    const a = analyse();
    expect(a.ok).toBe(true);

    // One unreadable row, reported with the spreadsheet line number it is on.
    expect(a.problems).toHaveLength(1);
    expect(a.problems[0]).toMatchObject({ line: 18 });
    expect(a.problems[0].why).toMatch(/couldn't read the date/);

    // ONE duplicate — Ana's repeated row. Dan's second class of the day is NOT a
    // duplicate: a studio that runs a 06:00 and an 18:00 class of the same name
    // held two classes, and counting the second as a repeat both loses a real
    // attendance and tells the coach it was a duplicate.
    expect(a.skipped).toBe(1);
    expect(a.rows).toHaveLength(15);
    expect(a.classes).toHaveLength(14);

    // Eve's row was rejected before she could become a member — a member created
    // from a row that is not being imported is a roster entry from nowhere.
    expect(a.newMembers.map(m => m.name).sort()).toEqual(["Ben Tan", "Cara Ng", "Dan Ho"]);

    expect(describeImport(a)).toBe(
      "15 check-ins · 14 classes · 3 new members · 1 duplicate skipped · 1 row that couldn't be read");
  });

  it("materialises the roster, the occurrences and the check-ins that reference them", () => {
    saveMembers([ANA]);
    const r = applyAttendanceImport(analyse());
    expect(r).toMatchObject({ ok: true, members: 3, classes: 14, attendance: 15 });

    expect(getMembers()).toHaveLength(4);
    expect(getClassInstances()).toHaveLength(14);
    expect(getAttendance()).toHaveLength(15);

    // Ana was matched, not duplicated — one "Lim" on the roster, still under the
    // name the gym typed rather than the one the old system exported.
    expect(getMembers().filter(m => /Lim/.test(m.name))).toHaveLength(1);
    expect(getMembers().find(m => m.id === "m-ana").name).toBe("Ana Lim");
    // …and her history is all on her, including the class she shared with Ben.
    const byId = id => getAttendance().filter(a => a.memberId === id);
    expect(byId("m-ana")).toHaveLength(4);

    // Every backfilled row stays distinguishable from a live check-in forever.
    expect(getAttendance().every(a => a.source === "import")).toBe(true);

    // Referential integrity: no check-in points at an id that does not exist.
    const memberIds = new Set(getMembers().map(m => m.id));
    const ciIds = new Set(getClassInstances().map(c => c.id));
    getAttendance().forEach(a => {
      expect(memberIds.has(a.memberId)).toBe(true);
      expect(ciIds.has(a.classInstanceId)).toBe(true);
    });
  });

  // THE finding this sweep exists for.
  it("keeps a morning and an evening class of the same name as two classes", () => {
    saveMembers([ANA]);
    applyAttendanceImport(analyse());

    const burns = getClassInstances().filter(c => c.name === "Morning Burn");
    expect(burns).toHaveLength(2);
    expect(burns.map(c => new Date(c.startsAt).getUTCHours()).sort((x, y) => x - y)).toEqual([6, 18]);

    const dan = getMembers().find(m => m.email === "dan@example.com");
    const danAtt = getAttendance().filter(a => a.memberId === dan.id);
    expect(danAtt).toHaveLength(2);
    // Two check-ins on two DIFFERENT occurrences. Collapsed onto one, the second
    // hits 0007's unique(class_instance_id, member_id) and is dropped.
    expect(new Set(danAtt.map(a => a.classInstanceId)).size).toBe(2);
  });

  // Re-running an overlapping export is the normal case, not an edge case: a
  // studio exports again to pick up the last month. It must add nothing.
  it("adds nothing when the same export is imported twice", () => {
    saveMembers([ANA]);
    applyAttendanceImport(analyse());
    const second = applyAttendanceImport(analyse());
    expect(second).toMatchObject({ ok: true, members: 0, classes: 0, attendance: 0 });
    expect(getMembers()).toHaveLength(4);
    expect(getClassInstances()).toHaveLength(14);
    expect(getAttendance()).toHaveLength(15);
  });

  // The DERIVED store — the reason the backfill exists at all. Read back the
  // instrument, not the rows: the plan looked fine in session 10 too.
  it("feeds the retention instrument the right answers", () => {
    saveMembers([ANA]);
    applyAttendanceImport(analyse());
    const flags = atRiskMembers(getMembers(), getAttendance(), { now: NOW });

    // Ben first: a longer absence is more urgent. Cara is here on the ABSENCE
    // rule, not the new-member rule — the import gave her no join date, so
    // nothing knows how long she has been a member. What it does know is that she
    // has not been seen in 18 days, and that is what the flag says.
    expect(flags.map(f => f.name)).toEqual(["Ben Tan", "Cara Ng"]);

    const ben = flags[0];
    expect(ben.rule).toBe("absence");
    expect(ben).toMatchObject({ visits: 7, daysSince: 40, severity: 3 });

    const cara = flags[1];
    expect(cara.rule).toBe("absence");
    expect(cara).toMatchObject({ visits: 2, daysSince: 18, severity: 2 });
    expect(cara.reason).toMatch(/Last attended 18 days ago, after 2 visits/);
    // No flag off this import may assert a join date the file never carried.
    flags.forEach(f => expect(f.reason).not.toMatch(/^Joined/));

    // Ana is current and Dan is inside his grace period — neither is a warning.
    expect(flags.map(f => f.memberId)).not.toContain("m-ana");
    const dan = getMembers().find(m => m.email === "dan@example.com");
    expect(flags.map(f => f.memberId)).not.toContain(dan.id);
  });

  // ✅ MEASURED, THEN FIXED (session 12, Dylan's call).
  //
  // Rule 1 is a claim about tenure. The CSV export carries no join date, so
  // `applyAttendanceImport` leaves `joinedAt: ""` (honest — it does not know), and
  // rule 1 used to substitute the member's FIRST IMPORTED CHECK-IN. At n=1 that
  // reads as obviously right: a member whose history starts 20 days ago probably
  // is new.
  //
  // At corpus scale it inverted. An established gym importing a SHORT recent
  // export has a roster whose every "first visit" is inside the 30-day window, so
  // every member with fewer than 4 visits IN THE FILE was announced as a new
  // member not building a habit — 9 of 12 here — each reason line stating "Joined
  // N days ago" as fact about people who joined years ago.
  //
  // Rule 1 now requires a join date it actually holds, which is the same gate
  // rule 2 has had since it was written. This test keeps the corpus, because the
  // defect was invisible at n=1 and the guard has to be asked the hard question.
  it("does not call an established roster new members off a short export", () => {
    // A three-week export from a gym that has been running for years. Nobody here
    // is new; the file just does not go back far enough to show it.
    const rows = ["Member Name,Email,Date,Class"];
    const visitsFor = i => (i < 5 ? 2 : i < 9 ? 3 : 6);
    for (let i = 0; i < 12; i++) {
      for (let v = 0; v < visitsFor(i); v++) {
        rows.push(`Member ${i},m${i}@example.com,${dayAt(-20 + v * 3)},S360`);
      }
    }
    applyAttendanceImport(analyzeAttendanceCsv(rows.join("\n"), []));
    expect(getMembers()).toHaveLength(12);
    expect(getMembers().every(m => m.joinedAt === "")).toBe(true);

    const flags = atRiskMembers(getMembers(), getAttendance(), { now: NOW });

    // Nobody is called a new member, and no reason line asserts a join date.
    expect(flags.filter(f => f.rule === "new_member_low_visits")).toHaveLength(0);
    flags.forEach(f => expect(f.reason).not.toMatch(/Joined/));

    // The instrument is not silenced — it just says the true thing instead. The
    // same 9 members are surfaced, now on the evidence the file actually carries:
    // they have not been seen in ≥14 days while the studio is still recording.
    expect(flags).toHaveLength(9);
    expect(flags.every(f => f.rule === "absence")).toBe(true);
    flags.forEach(f => expect(f.daysSince).toBeGreaterThanOrEqual(14));
    // The three with 6 visits are current, not lucky: their last visit is recent.
    expect(new Set(flags.map(f => f.visits))).toEqual(new Set([2, 3]));
  });

  // The absence rule is gated on the studio RECORDING. A pure historical import
  // with nothing recent must not flag the entire roster on day one — that is the
  // difference between an instrument and noise.
  it("does not flag the whole roster off a purely historical import", () => {
    saveMembers([ANA]);
    applyAttendanceImport(analyse());
    // Drop the only recent check-ins, leaving nothing inside the last 14 days.
    const stale = getAttendance().filter(a => Date.parse(a.checkedInAt) < NOW - 30 * 86_400_000);
    localStorage.setItem("jungle_attendance", JSON.stringify(stale));

    const flags = atRiskMembers(getMembers(), getAttendance(), { now: NOW });
    // With both gates in place this is now the strong claim: a purely historical
    // import flags NOBODY. Rule 2 is suppressed because the studio is not
    // recording, and rule 1 because an import knows nobody's join date. Every
    // name on that screen would have been an artefact of the backfill.
    expect(flags).toHaveLength(0);
  });
});

// ── the generation ledger's cap ──────────────────────────────────────────────
// `appendPersonaGeneration` keeps the most recent GEN_CAP (50) rows PER PERSONA
// so the local blob stays bounded. Nothing had ever driven it past the cap, and
// the counter it filters with is easy to get subtly wrong: a single running
// count rather than a per-persona one would trim a busy coach's history the
// moment a second coach existed.
describe("appendPersonaGeneration — the per-persona cap", () => {
  // The reset above is scoped to another describe, and without one here the
  // ledger carries over between these tests — the first run reported 51 rows for
  // a two-row expectation. A probe's own setup is part of the measurement.
  beforeEach(() => localStorage.clear());

  const gen = (personaId, n) => ({ id: `g-${personaId}-${n}`, personaId, classType: "S360",
                                   category: "strength", title: `class ${n}`, movements: [], plan: {} });

  it("keeps the 50 most recent for a persona and drops the oldest", () => {
    for (let n = 1; n <= 55; n++) appendPersonaGeneration(gen("p1", n));
    const all = getPersonaGenerations();
    expect(all).toHaveLength(50);
    // Newest-first, so the survivors are 55 down to 6 and the first five are gone.
    expect(all[0].id).toBe("g-p1-55");
    expect(all[49].id).toBe("g-p1-6");
    expect(all.some(g => g.id === "g-p1-5")).toBe(false);
  });

  it("counts per persona, so one busy coach does not evict another's history", () => {
    // The failure this exists to catch: a single running counter would let p1's
    // 50 rows consume the whole cap and silently delete p2's.
    appendPersonaGeneration(gen("p2", 0));
    for (let n = 1; n <= 55; n++) appendPersonaGeneration(gen("p1", n));

    const all = getPersonaGenerations();
    expect(all.filter(g => g.personaId === "p1")).toHaveLength(50);
    expect(all.filter(g => g.personaId === "p2"), "the quiet coach's history was evicted").toHaveLength(1);
  });

  it("re-appending the same id moves it to the front rather than duplicating it", () => {
    appendPersonaGeneration(gen("p1", 1));
    appendPersonaGeneration(gen("p1", 2));
    appendPersonaGeneration(gen("p1", 1));
    const all = getPersonaGenerations();
    expect(all.map(g => g.id)).toEqual(["g-p1-1", "g-p1-2"]);
  });

  it("mints an id and a createdAt when the caller supplies neither", () => {
    appendPersonaGeneration({ personaId: "p1", classType: "S360", title: "unnamed" });
    const [row] = getPersonaGenerations();
    expect(row.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);
  });
});

// ─── The coach roster, and the link it fixes (S30 §2.1) ─────────────────────

describe("the roster", () => {
  beforeEach(() => localStorage.clear());

  it("adds, and mints an id rather than trusting the caller for one", () => {
    const { coach, coaches } = addCoach("  Mara  ");
    expect(coach.name).toBe("Mara");            // trimmed on the way in
    expect(coach.id).toBeTruthy();
    expect(coaches).toHaveLength(1);
    expect(getCoaches()[0].id).toBe(coach.id);
  });

  it("patches only the keys it was given", () => {
    const { coach } = addCoach("Mara");
    updateCoach(coach.id, { userId: "u1" });
    const after = getCoaches()[0];
    expect(after.userId).toBe("u1");
    expect(after.name).toBe("Mara");            // untouched
    expect(after.active).toBe(true);
  });

  it("🔴 stamps availabilityAt itself, so a grid can never arrive undated", () => {
    const { coach } = addCoach("Mara");
    expect(getCoaches()[0].availabilityAt).toBe("");
    updateCoach(coach.id, { availability: { Mon: ["06:00"] } });
    expect(getCoaches()[0].availabilityAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("drops an alias that merely restates the name, and blank ones", () => {
    const { coach } = addCoach("Mara");
    updateCoach(coach.id, { aliases: ["MARA", "  ", "Mara K.", "mara k."] });
    // "MARA" folds onto the name; "mara k." folds onto "Mara K."; blanks go.
    expect(getCoaches()[0].aliases).toEqual(["Mara K."]);
  });

  it("refuses to blank a coach's name", () => {
    const { coach } = addCoach("Mara");
    updateCoach(coach.id, { name: "   " });
    expect(getCoaches()[0].name).toBe("Mara");
  });

  it("removing hands back the PRIOR LIST, because position is part of the loss", () => {
    addCoach("Ann"); const { coach: b } = addCoach("Bo"); addCoach("Cy");
    const { coaches, before } = removeCoach(b.id);
    expect(coaches.map(c => c.name)).toEqual(["Ann", "Cy"]);
    expect(before.map(c => c.name)).toEqual(["Ann", "Bo", "Cy"]);
    saveCoaches(before);                                    // the undo
    expect(getCoaches().map(c => c.name)).toEqual(["Ann", "Bo", "Cy"]);
  });
});

describe("🔴 class_instances.coach_id names the person who TEACHES, not the one who published", () => {
  beforeEach(() => localStorage.clear());

  // The regression this replaces: `coach_id` was `_ctx.userId`, so a manager
  // publishing the week recorded every class in the gym as taught by themselves.
  // `created_by` is where that fact belongs and already held it.
  const instance = (coachName) => ({ id: "ci1", startsAt: "2026-08-24T06:00:00.000Z",
                                     name: "Strength Lab", classType: "hyrox",
                                     coachName, durationMin: 45 });

  it("is the roster entry's account when the typed name resolves to one", () => {
    const { coach } = addCoach("Mara");
    updateCoach(coach.id, { userId: "profile-mara" });
    expect(_ciToRow(instance("Mara")).coach_id).toBe("profile-mara");
    // and through the same case-folding the rest of the roster uses
    expect(_ciToRow(instance("mara")).coach_id).toBe("profile-mara");
  });

  it("is NULL for a coach on the roster with no account", () => {
    addCoach("Mara");
    expect(_ciToRow(instance("Mara")).coach_id).toBeNull();
  });

  it("is NULL for a name nobody has put on the roster", () => {
    expect(_ciToRow(instance("Mara")).coach_id).toBeNull();
    expect(_ciToRow(instance("")).coach_id).toBeNull();
  });

  it("🔴 does not follow the roster to the WRONG person", () => {
    const { coach } = addCoach("Dev");
    updateCoach(coach.id, { userId: "profile-dev" });
    // Mara teaches it; only Dev has an account. The answer is "we do not know",
    // not "the one account we happen to have".
    expect(_ciToRow(instance("Mara")).coach_id).toBeNull();
    expect(_ciToRow(instance("Dev")).coach_id).toBe("profile-dev");
  });

  it("🔴 is not the signed-in publisher — the regression, pinned with a real one", () => {
    // Without this, the whole block above passes on the OLD code: `_ctx.userId`
    // is undefined in a bare test, so `_ctx.userId || null` is null and looks
    // correct. The bug only shows once somebody is actually signed in, which is
    // every real gym and no previous test.
    connect({ gymId: "gym-1", userId: "profile-the-manager" });
    try {
      addCoach("Mara");                                   // on the roster, no account
      const row = _ciToRow(instance("Mara"));
      expect(row.coach_id).toBeNull();                    // NOT the manager
      expect(row.created_by).toBe("profile-the-manager"); // which is recorded here
      expect(row.coach_id).not.toBe(row.created_by);
    } finally {
      connect({ gymId: null, userId: null });
    }
  });

  it("keeps the typed name alongside it, which is what every screen reads", () => {
    addCoach("Mara");
    const row = _ciToRow(instance("Mara"));
    expect(row.coach_name).toBe("Mara");
  });

  it("coachAccountFor is the single bridge, and answers null by default", () => {
    expect(coachAccountFor("Mara")).toBeNull();
    expect(coachAccountFor("")).toBeNull();
    expect(coachAccountFor(null)).toBeNull();
  });
});
