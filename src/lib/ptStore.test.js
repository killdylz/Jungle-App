// ─── The 1:1 store seam ─────────────────────────────────────────────────────
//
// store.test.js is already 1,000+ lines about sync, and none of this syncs (see
// the block above `getParqRecords`). Kept separate so the file that is about
// "what reaches Postgres" is not also the file about the one domain that
// deliberately does not.
//
// The assertion that matters most here is the LAST describe block: the health
// screen is a hard gate, and a gate enforced only in JSX is walked through by
// the next caller. These tests drive the store directly, with no screen involved.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getParqRecords, appendParqRecord,
  getPtClients, savePtClients, addPtClient, updatePtClient,
  getPtSessions, savePtSessions, assignPtSession, togglePtSessionDone, removePtSession,
  erasePtClient, describePtErasure, saveMembers,
} from "./store.js";
import { parqStatus, PARQ_QUESTIONS } from "./parq.js";

const clean = () => PARQ_QUESTIONS.reduce((a, q) => { a[q.id] = false; return a; }, {});
const NOW = new Date(2026, 7, 31);
// Every real save carries a consent now (D5). Declared once so the tests read as
// "a screening with the tick", which is the only kind that can happen on screen.
const CONSENT = { grantedAt: "2026-08-01", policyVersion: "parq-v1" };
const CLEARED = parqStatus(
  { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), clearance: null }, { now: NOW });
const BLOCKED = parqStatus(null, { now: NOW });

beforeEach(() => { localStorage.clear(); });

describe("the PAR-Q ledger is append-only", () => {
  it("adds a row instead of replacing the previous screen", () => {
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2025-01-05", consent: CONSENT });
    const list = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    expect(list).toHaveLength(2);
    // Last year's answers are what a coach acted on last year. Overwriting them
    // destroys the only evidence of why.
    expect(list.map(r => r.screenedAt)).toEqual(["2025-01-05", "2026-08-01"]);
    expect(getParqRecords()).toHaveLength(2);
  });

  it("dates the screening and the writing separately", () => {
    const [rec] = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    expect(rec.screenedAt).toBe("2026-08-01");          // the day it was taken
    expect(rec.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // the instant it was written
  });

  it("copies the answers rather than holding the screen's live object", () => {
    const answers = clean();
    appendParqRecord({ memberId: "m1", answers, screenedAt: "2026-08-01", consent: CONSENT });
    answers.q1 = true;                                  // the coach keeps clicking
    expect(getParqRecords()[0].answers.q1).toBe(false); // the record does not move
  });

  it("drops a clearance with no date on it", () => {
    const [rec] = appendParqRecord({
      memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT,
      clearance: { note: "he said it's fine" },
    });
    // An undated clearance is a coach ticking a box, which is what the gate
    // exists to prevent. parq.js refuses to read it; the store refuses to store it.
    expect(rec.clearance).toBeNull();
  });

  it("refuses a record with no member on it", () => {
    expect(appendParqRecord({ answers: clean(), consent: CONSENT })).toEqual([]);
    expect(getParqRecords()).toEqual([]);
  });
});

describe("1:1 clients", () => {
  it("adds a client and defaults them to training", () => {
    const { client, error } = addPtClient({ memberId: "m1", goal: "First pull-up" });
    expect(error).toBe("");
    expect(client.status).toBe("active");
    expect(client.goal).toBe("First pull-up");
    expect(getPtClients()).toHaveLength(1);
  });

  it("refuses a second record for the same member", () => {
    addPtClient({ memberId: "m1" });
    const { error, clients } = addPtClient({ memberId: "m1", goal: "different goal" });
    // Two histories for one person, with no way to tell which is current.
    expect(error).toMatch(/already a 1:1 client/i);
    expect(clients).toHaveLength(1);
  });

  it("refuses a client with no member", () => {
    const { client, error } = addPtClient({ goal: "nobody" });
    expect(client).toBeNull();
    expect(error).toMatch(/pick a member/i);
  });

  it("patches only the keys it was given", () => {
    const { client } = addPtClient({ memberId: "m1", goal: "First pull-up", coachName: "Dylan" });
    const { client: next } = updatePtClient(client.id, { status: "paused" });
    expect(next.status).toBe("paused");
    expect(next.goal).toBe("First pull-up");   // not blanked by a partial patch
    expect(next.coachName).toBe("Dylan");
  });

  it("coerces a status it does not recognise instead of persisting it", () => {
    const { client } = addPtClient({ memberId: "m1" });
    const { client: next } = updatePtClient(client.id, { status: "archived" });
    expect(next.status).toBe("active");
  });

  it("has no delete — ending a relationship keeps its history", async () => {
    const store = await import("./store.js");
    expect(store.deletePtClient).toBeUndefined();
  });
});

// ── D7 · the orphan erasure ────────────────────────────────────────────────
//
// The pair above and this block are the two halves of one decision and they
// have to be read together: there is no `deletePtClient` because ENDING a
// relationship must not destroy a delivery record, and there IS an
// `erasePtClient` because an erasure that leaves seven health answers behind is
// not an erasure. The refusals below are what keeps them from being the same
// function.
describe("erasePtClient — the one hard delete, and everything it refuses", () => {
  const seed = () => {
    saveMembers([{ id: "m1", name: "Sarah Chen" }, { id: "m2", name: "Ana Ruiz" }]);
    const a = addPtClient({ memberId: "m1", goal: "First pull-up" }).client;
    const b = addPtClient({ memberId: "m2", goal: "Back squat" }).client;
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-20", consent: CONSENT });
    appendParqRecord({ memberId: "m2", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    assignPtSession({ clientId: a.id, memberId: "m1", date: "2026-09-01" }, CLEARED);
    assignPtSession({ clientId: a.id, memberId: "m1", date: "2026-09-03" }, CLEARED);
    assignPtSession({ clientId: b.id, memberId: "m2", date: "2026-09-02" }, CLEARED);
    return { a, b };
  };

  beforeEach(() => { localStorage.clear(); });

  it("REFUSES a client whose member row still exists — that is `status: ended`", () => {
    const { a } = seed();
    const r = erasePtClient(a.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("member-present");
    // And it stored nothing. A refusal that half-erased would be worse than no
    // refusal at all.
    expect(getPtClients()).toHaveLength(2);
    expect(getParqRecords()).toHaveLength(3);
    expect(getPtSessions()).toHaveLength(3);
  });

  it("erases the client, its sessions AND its health answers once the member is gone", () => {
    const { a } = seed();
    // The member row is erased under PDPA; the cascade knows nothing about
    // these three local ledgers, which is the whole defect.
    saveMembers([{ id: "m2", name: "Ana Ruiz" }]);

    const r = erasePtClient(a.id);
    expect(r.ok).toBe(true);
    expect(r.erased).toEqual({ sessions: 2, parqRecords: 2 });

    // 🔴 The assertion that matters: the health answers are GONE from the store,
    // not merely absent from the returned list.
    expect(getParqRecords().filter(x => x.memberId === "m1")).toHaveLength(0);
    expect(getPtSessions().filter(x => x.clientId === a.id)).toHaveLength(0);
    expect(getPtClients().filter(x => x.id === a.id)).toHaveLength(0);
  });

  it("takes nothing belonging to any other client", () => {
    const { a, b } = seed();
    saveMembers([{ id: "m2", name: "Ana Ruiz" }]);
    erasePtClient(a.id);
    expect(getPtClients().map(c => c.id)).toEqual([b.id]);
    expect(getParqRecords().map(r => r.memberId)).toEqual(["m2"]);
    expect(getPtSessions().map(s => s.clientId)).toEqual([b.id]);
  });

  it("ignores an id it does not hold rather than throwing", () => {
    seed();
    const r = erasePtClient("nope");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not-found");
    expect(getPtClients()).toHaveLength(2);
  });

  it("describes exactly what the erase will take, counted from the same reads", () => {
    const { a } = seed();
    saveMembers([{ id: "m2", name: "Ana Ruiz" }]);
    const d = describePtErasure(a.id);
    expect(d.ok).toBe(true);
    expect(d.sessions).toBe(2);
    expect(d.parq).toBe(2);
    expect(d.text).toContain("2 sessions");
    expect(d.text).toContain("2 health screens");
    expect(d.text).toContain("cannot be undone");
    // The dialog's counts and the erase's counts are the same numbers. A dialog
    // that promises one thing and deletes another is the failure this pairing
    // exists to make impossible.
    const r = erasePtClient(a.id);
    expect(r.erased.sessions).toBe(d.sessions);
    expect(r.erased.parqRecords).toBe(d.parq);
  });

  it("singularises, because '1 sessions' is how a dialog stops being read", () => {
    saveMembers([{ id: "m1", name: "Sarah Chen" }]);
    const c = addPtClient({ memberId: "m1" }).client;
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    assignPtSession({ clientId: c.id, memberId: "m1", date: "2026-09-01" }, CLEARED);
    saveMembers([]);
    const d = describePtErasure(c.id);
    expect(d.text).toContain("1 session ");
    expect(d.text).toContain("1 health screen ");
    expect(d.text).not.toContain("1 sessions");
  });

  it("refuses to describe a live client, and says why rather than returning a blank", () => {
    const { a } = seed();
    const d = describePtErasure(a.id);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("member-present");
    expect(d.text).toContain("End the 1:1 instead");
  });
});

describe("assignPtSession — the health-screen gate, enforced in the store", () => {
  let clientId;
  beforeEach(() => { clientId = addPtClient({ memberId: "m1" }).client.id; });

  it("writes a session for a cleared client", () => {
    const { session, error } = assignPtSession(
      { clientId, memberId: "m1", date: "2026-09-02", planName: "Pull strength" }, CLEARED);
    expect(error).toBe("");
    expect(session.status).toBe("planned");
    // Assert the STORED object, not only the return value.
    expect(getPtSessions()).toHaveLength(1);
    expect(getPtSessions()[0].planName).toBe("Pull strength");
  });

  it("REFUSES a session for a client with no valid screen, and stores nothing", () => {
    const { session, error } = assignPtSession(
      { clientId, memberId: "m1", date: "2026-09-02" }, BLOCKED);
    expect(session).toBeNull();
    expect(error).toMatch(/health screen/i);
    expect(getPtSessions()).toEqual([]);
  });

  it("refuses when handed no gate at all", () => {
    // A caller that forgets to pass the status must not get a free pass — the
    // whole point of putting the refusal here is that the NEXT screen to call
    // this cannot walk through it.
    expect(assignPtSession({ clientId, memberId: "m1", date: "2026-09-02" }).session).toBeNull();
    expect(assignPtSession({ clientId, memberId: "m1", date: "2026-09-02" }, {}).session).toBeNull();
    expect(assignPtSession({ clientId, memberId: "m1", date: "2026-09-02" }, { blocksLoad: true }).session).toBeNull();
    expect(getPtSessions()).toEqual([]);
  });

  it("records WHICH gate state let the session through", () => {
    assignPtSession({ clientId, memberId: "m1", date: "2026-09-02" }, CLEARED);
    // "cleared" and "gp_cleared" are different assurances; a year from now the
    // difference is the whole question.
    expect(getPtSessions()[0].parqStateAtAssign).toBe("cleared");
  });

  it("needs a date, and a client", () => {
    expect(assignPtSession({ clientId, memberId: "m1", date: "" }, CLEARED).error).toMatch(/date/i);
    expect(assignPtSession({ memberId: "m1", date: "2026-09-02" }, CLEARED).error).toMatch(/client/i);
    expect(getPtSessions()).toEqual([]);
  });

  it("snapshots the plan so a later Builder edit cannot rewrite what was prescribed", () => {
    const stages = [{ id: "s1", name: "Warm-Up", dur: 300, exercises: [{ n: "Light Jog" }] }];
    assignPtSession({ clientId, memberId: "m1", date: "2026-09-02", stages }, CLEARED);
    stages[0].name = "Something else entirely";
    stages[0].exercises[0].n = "Back Squat";
    const stored = getPtSessions()[0].stages;
    expect(stored[0].name).toBe("Warm-Up");
    expect(stored[0].exercises[0].n).toBe("Light Jog");
  });
});

describe("marking and removing sessions", () => {
  let clientId, id;
  beforeEach(() => {
    clientId = addPtClient({ memberId: "m1" }).client.id;
    id = assignPtSession({ clientId, memberId: "m1", date: "2026-09-02" }, CLEARED).session.id;
  });

  it("toggles done and back, which is its own undo", () => {
    expect(togglePtSessionDone(id)[0].status).toBe("done");
    expect(getPtSessions()[0].completedAt).toMatch(/^\d{4}/);
    expect(togglePtSessionDone(id)[0].status).toBe("planned");
    expect(getPtSessions()[0].completedAt).toBe("");
  });

  it("ignores an id it does not hold rather than throwing", () => {
    expect(togglePtSessionDone("nope")).toHaveLength(1);
    expect(getPtSessions()[0].status).toBe("planned");
  });

  it("returns the PRIOR LIST when a session is removed, so the caller can undo", () => {
    const second = assignPtSession({ clientId, memberId: "m1", date: "2026-09-09" }, CLEARED).session;
    const { sessions, undo } = removePtSession(second.id);
    expect(sessions.map(s => s.id)).toEqual([id]);
    // The prior LIST, not the deleted row: position is part of what was lost.
    expect(undo.map(s => s.id)).toEqual([id, second.id]);
    savePtSessions(undo);
    expect(getPtSessions().map(s => s.id)).toEqual([id, second.id]);
  });
});

describe("nothing here reaches the network", () => {
  it("writes only to localStorage, under the three jungle_pt_/jungle_parq_ keys", () => {
    // Supabase is unconfigured in this environment, so `_synced()` is false and a
    // sync call would be a no-op — which means "no error was thrown" proves
    // nothing. What IS provable is the storage footprint: if someone later wires
    // a table in, the keys stay the same, but the block above `getParqRecords`
    // explaining WHY they must not is right beside the code they would edit.
    const { client } = addPtClient({ memberId: "m1" });
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    assignPtSession({ clientId: client.id, memberId: "m1", date: "2026-09-02" }, CLEARED);
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();
    expect(keys).toEqual(["jungle_parq_records", "jungle_pt_clients", "jungle_pt_sessions"]);
  });

  it("survives a store that has never been written to", () => {
    expect(getPtClients()).toEqual([]);
    expect(getPtSessions()).toEqual([]);
    expect(getParqRecords()).toEqual([]);
    expect(savePtClients(null)).toEqual([]);
  });
});

// ─── D5 · health answers are not collected without a consent trail ───────────
//
// 🔴 THE PROMPT'S VERSION OF THIS FIX IS REFUSED, and the refusal is the point.
// Session 34 asked for `store.recordConsent()` to be called on save with a
// `health_screen` scope. That scope is not in 0007's CHECK constraint, so every
// insert would be rejected by Postgres — and more importantly a consent_records
// row asserts a person consented, which `CheckInPanel` already refuses to
// fabricate for check-ins. So the consent here is a REAL tick against a REAL
// notice, stored with the record, and nothing is sent to a column that would
// reject it.
describe("the health screen carries its own consent (D5)", () => {
  it("refuses to write health answers with no consent at all", () => {
    expect(appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01" })).toEqual([]);
    expect(getParqRecords()).toEqual([]);
    // The control: the SAME call with a consent does write, so the refusal above
    // is about the consent and not about a broken fixture.
    expect(appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT })).toHaveLength(1);
  });

  it("refuses an undated consent, the way it refuses an undated clearance", () => {
    // An undated consent is a box someone ticked. The date is the whole
    // evidentiary value of the record.
    expect(appendParqRecord({ memberId: "m1", answers: clean(), consent: { policyVersion: "parq-v1" } })).toEqual([]);
    expect(getParqRecords()).toEqual([]);
  });

  it("stores which wording was agreed to, and when", () => {
    const [rec] = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    expect(rec.consent.grantedAt).toBe("2026-08-01");
    // Consent is to a SPECIFIC text: if the notice is reworded, a record saying
    // "parq-v1" still truthfully names what its subject actually read.
    expect(rec.consent.policyVersion).toBe("parq-v1");
    // A method 0007's CHECK constraint already allows, so the row is ready for
    // the day a `health_screen` scope exists.
    expect(rec.consent.method).toBe("explicit_opt_in");
  });

  it("lets a doctor's clearance be appended without a fresh tick", () => {
    // The amendment path. A clearance appends a doctor's note against answers
    // the client already gave and agreed to keep — and the client is not in the
    // room. Demanding a new tick would block the clearance, or train a coach to
    // consent on someone else's behalf.
    const [first] = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    const list = appendParqRecord({
      memberId: "m1", answers: clean(), screenedAt: "2026-08-01",
      clearance: { grantedAt: "2026-08-20", note: "Cardiology sign-off" },
      amends: first.id,
    });
    expect(list).toHaveLength(2);
    expect(list[1].clearance.note).toBe("Cardiology sign-off");
    // Inherited, not re-minted: the date is the one the client actually agreed on.
    expect(list[1].consent.grantedAt).toBe("2026-08-01");
    expect(list[1].amends).toBe(first.id);
  });

  it("inherits an EMPTY consent honestly, for a screen recorded before the field existed", () => {
    // The legacy case, and the one that decides whether this is honest. A record
    // written before D5 has no consent. Amending it must not back-fill today's
    // date — that would assert an agreement nobody was ever asked for.
    const legacy = { id: "legacy1", memberId: "m1", screenedAt: "2026-01-01",
                     answers: clean(), clearance: null, recordedAt: "2026-01-01T00:00:00.000Z" };
    localStorage.setItem("jungle_parq_records", JSON.stringify([legacy]));
    const list = appendParqRecord({
      memberId: "m1", answers: clean(), screenedAt: "2026-01-01",
      clearance: { grantedAt: "2026-08-20", note: "ok" }, amends: "legacy1",
    });
    expect(list).toHaveLength(2);
    expect(list[1].consent).toBeNull();
  });

  it("will not let `amends` smuggle a consent-free NEW screening through", () => {
    // The hole this closes: if `amends` were trusted without checking, any save
    // could pass a made-up id and skip the tick entirely.
    expect(appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", amends: "no-such-row" })).toEqual([]);
    // And it must not reach across members either.
    const [mine] = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01", consent: CONSENT });
    expect(appendParqRecord({ memberId: "m2", answers: clean(), screenedAt: "2026-08-01", amends: mine.id })).toHaveLength(1);
    expect(getParqRecords().filter(r => r.memberId === "m2")).toEqual([]);
  });
});
