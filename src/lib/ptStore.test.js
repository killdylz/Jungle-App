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
} from "./store.js";
import { parqStatus, PARQ_QUESTIONS } from "./parq.js";

const clean = () => PARQ_QUESTIONS.reduce((a, q) => { a[q.id] = false; return a; }, {});
const NOW = new Date(2026, 7, 31);
const CLEARED = parqStatus(
  { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), clearance: null }, { now: NOW });
const BLOCKED = parqStatus(null, { now: NOW });

beforeEach(() => { localStorage.clear(); });

describe("the PAR-Q ledger is append-only", () => {
  it("adds a row instead of replacing the previous screen", () => {
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2025-01-05" });
    const list = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01" });
    expect(list).toHaveLength(2);
    // Last year's answers are what a coach acted on last year. Overwriting them
    // destroys the only evidence of why.
    expect(list.map(r => r.screenedAt)).toEqual(["2025-01-05", "2026-08-01"]);
    expect(getParqRecords()).toHaveLength(2);
  });

  it("dates the screening and the writing separately", () => {
    const [rec] = appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01" });
    expect(rec.screenedAt).toBe("2026-08-01");          // the day it was taken
    expect(rec.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // the instant it was written
  });

  it("copies the answers rather than holding the screen's live object", () => {
    const answers = clean();
    appendParqRecord({ memberId: "m1", answers, screenedAt: "2026-08-01" });
    answers.q1 = true;                                  // the coach keeps clicking
    expect(getParqRecords()[0].answers.q1).toBe(false); // the record does not move
  });

  it("drops a clearance with no date on it", () => {
    const [rec] = appendParqRecord({
      memberId: "m1", answers: clean(), screenedAt: "2026-08-01",
      clearance: { note: "he said it's fine" },
    });
    // An undated clearance is a coach ticking a box, which is what the gate
    // exists to prevent. parq.js refuses to read it; the store refuses to store it.
    expect(rec.clearance).toBeNull();
  });

  it("refuses a record with no member on it", () => {
    expect(appendParqRecord({ answers: clean() })).toEqual([]);
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
    appendParqRecord({ memberId: "m1", answers: clean(), screenedAt: "2026-08-01" });
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
