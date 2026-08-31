import { describe, it, expect } from "vitest";
import {
  PT_CLIENT_STATUSES, ptClientStatus, ptSessionStatus, sessionMinutes,
  ptClientRows, ptRosterSummary, describePtRoster, sessionsForClient, availableMembers,
} from "./ptClients.js";
import { PARQ_QUESTIONS } from "./parq.js";

const NOW = new Date(2026, 7, 31);   // 2026-08-31, local
const clean = () => PARQ_QUESTIONS.reduce((a, q) => { a[q.id] = false; return a; }, {});

const MEMBERS = [
  { id: "m1", name: "Sarah Chen",  email: "s@example.com", status: "active" },
  { id: "m2", name: "Marcus Lee",  email: "m@example.com", status: "active" },
  { id: "m3", name: "Priya Nair",  email: "p@example.com", status: "paused" },
];
const CLIENTS = [
  { id: "c1", memberId: "m1", goal: "First pull-up",  status: "active", startedAt: "2026-06-01" },
  { id: "c2", memberId: "m2", goal: "Return to sport", status: "active", startedAt: "2026-07-15" },
  { id: "c3", memberId: "m3", goal: "Post-natal",      status: "paused", startedAt: "2026-02-02" },
];
const PARQS = [
  { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), recordedAt: "2026-08-01T09:00:00Z" },
];
const SESSIONS = [
  { id: "s1", clientId: "c1", memberId: "m1", date: "2026-08-20", status: "done",    planName: "Pull strength" },
  { id: "s2", clientId: "c1", memberId: "m1", date: "2026-09-02", status: "planned", planName: "Pull strength" },
  { id: "s3", clientId: "c2", memberId: "m2", date: "2026-08-10", status: "planned", planName: "Return week 1" },
];

describe("status coercion", () => {
  it("keeps a status inside the allowed set, defaulting to active", () => {
    expect(ptClientStatus("paused")).toBe("paused");
    expect(ptClientStatus("PAUSED")).toBe("paused");
    // The `members` lesson, repeated: one caller writing "archived" into a
    // CHECK-constrained column is a silent sync failure.
    expect(ptClientStatus("archived")).toBe("active");
    expect(ptClientStatus(undefined)).toBe("active");
  });
  it("has no delete state — a finished relationship is history", () => {
    expect(PT_CLIENT_STATUSES).toEqual(["active", "paused", "ended"]);
    expect(PT_CLIENT_STATUSES).not.toContain("deleted");
  });
  it("defaults a session to planned, not done", () => {
    // Wrong-way-round matters: a session defaulted to `done` would credit a
    // coach for work nobody did and would count in the history.
    expect(ptSessionStatus(undefined)).toBe("planned");
    expect(ptSessionStatus("done")).toBe("done");
    expect(ptSessionStatus("cancelled")).toBe("planned");
  });
});

describe("sessionMinutes", () => {
  it("sums stage durations in whole minutes", () => {
    expect(sessionMinutes([{ dur: 300 }, { dur: 600 }, { dur: 900 }])).toBe(30);
  });
  it("survives the shapes a half-built draft actually has", () => {
    expect(sessionMinutes([])).toBe(0);
    expect(sessionMinutes(undefined)).toBe(0);
    expect(sessionMinutes([{ dur: "300" }, {}, null])).toBe(5);
  });
});

describe("ptClientRows", () => {
  const rows = ptClientRows(CLIENTS, MEMBERS, PARQS, SESSIONS, { now: NOW });

  it("joins each client to their member row rather than copying the name", () => {
    const sarah = rows.find(r => r.id === "c1");
    expect(sarah.name).toBe("Sarah Chen");
    expect(sarah.email).toBe("s@example.com");
    expect(sarah.orphan).toBe(false);
  });

  it("carries the PAR-Q gate onto every row", () => {
    expect(rows.find(r => r.id === "c1").parq.state).toBe("cleared");
    expect(rows.find(r => r.id === "c1").parq.blocksLoad).toBe(false);
    // Never screened: the gate is shut and says so.
    expect(rows.find(r => r.id === "c2").parq.state).toBe("unscreened");
    expect(rows.find(r => r.id === "c2").parq.blocksLoad).toBe(true);
  });

  it("counts done and planned sessions separately", () => {
    const sarah = rows.find(r => r.id === "c1");
    expect(sarah.sessionsDone).toBe(1);
    expect(sarah.sessionsPlanned).toBe(1);
    expect(sarah.lastDone).toBe("2026-08-20");
    expect(sarah.nextPlanned).toBe("2026-09-02");
  });

  it("does not call a session in the past 'next'", () => {
    // c2's only planned session is 2026-08-10, three weeks before `now`. That is
    // a session the coach forgot to mark done, not the next one — putting it in
    // the "next" column would print a past date in a future field.
    const marcus = rows.find(r => r.id === "c2");
    expect(marcus.nextPlanned).toBe("");
    expect(marcus.overduePlanned).toBe(1);
  });

  it("orders the coach's day: training first, booked first, then by name", () => {
    // c1 is training with a booking, c2 is training with none, c3 is paused.
    expect(rows.map(r => r.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("shows a client whose member row has been erased as an orphan, not a blank", () => {
    const orphaned = ptClientRows(
      [{ id: "cX", memberId: "gone", status: "active" }], MEMBERS, PARQS, SESSIONS, { now: NOW });
    expect(orphaned[0].orphan).toBe(true);
    expect(orphaned[0].name).toBe("");
    // And it must not throw on the way — PDPA erasure cascades attendance and
    // knows nothing about this local ledger.
    expect(orphaned[0].parq.state).toBe("unscreened");
  });

  it("returns nothing, and throws nothing, on an empty gym", () => {
    expect(ptClientRows()).toEqual([]);
    expect(ptClientRows([], [], [], [])).toEqual([]);
  });
});

describe("ptRosterSummary and its sentence", () => {
  const rows = ptClientRows(CLIENTS, MEMBERS, PARQS, SESSIONS, { now: NOW });
  const s = ptRosterSummary(rows);

  it("counts only what it can see", () => {
    expect(s.total).toBe(3);
    expect(s.training).toBe(2);
    expect(s.booked).toBe(1);
    expect(s.overdue).toBe(1);
  });

  it("counts a blocked client only while the coach is trying to program for them", () => {
    // m2 is training and unscreened → blocked. m3 is unscreened too, but paused,
    // so it is not a problem this week and must not inflate the number the coach
    // is being asked to act on.
    expect(s.blocked).toBe(1);
    expect(s.unscreened).toBe(1);
  });

  it("says what is blocked and what is booked, in the coach's words", () => {
    const line = describePtRoster(s);
    expect(line).toContain("2 training 1:1");
    expect(line).toMatch(/1 cannot be programmed for/);
    expect(line).toContain("1 with a session booked");
    expect(line).toMatch(/1 planned session is in the past/);
  });

  it("says what to do when there are no clients at all", () => {
    const line = describePtRoster(ptRosterSummary([]));
    expect(line).toMatch(/No 1:1 clients yet/);
    // An empty state that names the next action, not a shrug.
    expect(line).toMatch(/roster/i);
  });

  it("does not claim a booking nobody made", () => {
    const noBookings = ptClientRows(
      [{ id: "c9", memberId: "m1", status: "active" }], MEMBERS, PARQS, [], { now: NOW });
    expect(describePtRoster(ptRosterSummary(noBookings))).toContain("none with a session booked");
  });
});

describe("sessionsForClient", () => {
  it("returns that client's sessions, newest first", () => {
    expect(sessionsForClient(SESSIONS, "c1").map(s => s.id)).toEqual(["s2", "s1"]);
  });
  it("returns nothing for a client with no id and no sessions", () => {
    expect(sessionsForClient(SESSIONS, "")).toEqual([]);
    expect(sessionsForClient(SESSIONS, "nope")).toEqual([]);
  });
});

describe("availableMembers", () => {
  it("offers only members who are not already 1:1 clients", () => {
    expect(availableMembers(MEMBERS, CLIENTS)).toEqual([]);
    expect(availableMembers(MEMBERS, [CLIENTS[0]]).map(m => m.id)).toEqual(["m2", "m3"]);
  });
  it("keeps an ended client out of the picker so their history is reopened, not duplicated", () => {
    const ended = [{ id: "c1", memberId: "m1", status: "ended" }];
    expect(availableMembers(MEMBERS, ended).map(m => m.id)).toEqual(["m2", "m3"]);
  });
  it("sorts by name so the picker does not reshuffle", () => {
    expect(availableMembers(MEMBERS, []).map(m => m.name))
      .toEqual(["Marcus Lee", "Priya Nair", "Sarah Chen"]);
  });
});
