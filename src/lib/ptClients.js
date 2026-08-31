// ─── The 1:1 lens (F1 / P5) ─────────────────────────────────────────────────
//
// The spec's design principle P5 is "one primitive, two lenses": a session is a
// programmed set of stages assigned to N people. Assigned to a class it is a
// group workout; assigned to one person it is PT. Until now only the group lens
// existed, so P5 was marked ⛔ and "no 1:1/PT path exists at all".
//
// This module is the second lens, and it is deliberately a LENS rather than a
// fork. A 1:1 client is a row in `members` — the same people the roster, the
// check-in list and the retention analytics already know about — plus a record
// saying "this person also trains 1:1". Forking a separate `pt_members` table
// would have given the gym two rosters that disagree, which is the drift
// `isCurrentMember` exists to prevent one screen at a time.
//
// 🔴 WHAT THIS DOES NOT DO, AND WHY THAT IS THE HONEST CHOICE
// 1:1 sessions are NOT written into `class_instances` or `attendance`. They
// could be — the shapes fit — and then every studio number would silently start
// counting one-person sessions as classes. "Average class size" would fall, the
// retention curve would move, and nothing on screen would say why. The server
// side of this needs the `session_assignments` migration (F1, Dylan's call), and
// until then the PT log is its own local ledger and the screens say so out loud.
//
// Everything here is pure. The screens render what these functions return; they
// never decide a status themselves.

import { parqStatus, latestParq } from "./parq.js";

// The status vocabularies live in `store.js`, beside `MEMBER_STATUSES`, and are
// re-exported here so the 1:1 screens have one import for the 1:1 lens.
//
// 🔴 THE DIRECTION OF THAT IMPORT IS A SIZE DECISION, not a taste one. store.js
// is in the EAGER StaffApp chunk; this module and `parq.js` are in a lazy one.
// When store.js imported the coercion from here instead, rollup pulled the whole
// 1:1 lens — including the seven PAR-Q question texts — into the eager bundle to
// satisfy one four-line function, and StaffApp went 0.9 kB over a budget with
// 10.5 kB of headroom. Definitions belong on the eager side of a seam; prose
// belongs on the lazy side.
export {
  PT_CLIENT_STATUSES, PT_CLIENT_STATUS_LABEL, ptClientStatus,
  PT_SESSION_STATUSES, ptSessionStatus,
} from "./store.js";
import { ptClientStatus, ptSessionStatus, PT_CLIENT_STATUSES } from "./store.js";

const dayOf = v => (v ? String(v).slice(0, 10) : "");
const isoDay = d => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Total programmed minutes for a stage array — the same `dur` (seconds) the
// Builder and the Runner speak. Rounded to the minute because that is the unit
// a coach books in; a "47.5 min" session is a number nobody asked for.
export function sessionMinutes(stages) {
  const secs = (stages || []).reduce((t, s) => t + (Number(s?.dur) || 0), 0);
  return Math.round(secs / 60);
}

/**
 * One row per 1:1 client, joined to the member they are and the screens and
 * sessions they have.
 *
 * Pure. `now` is injected so the PAR-Q expiry is testable without a fixed clock
 * — and because a fixed clock freezes Date.now(), which this repo has been
 * bitten by when ids derive from it.
 */
export function ptClientRows(clients = [], members = [], parqRecords = [], sessions = [], { now = new Date() } = {}) {
  const byId = new Map((members || []).filter(Boolean).map(m => [m.id, m]));
  const today = isoDay(now instanceof Date ? now : new Date(now));

  const rows = (clients || []).filter(Boolean).map(c => {
    const member = byId.get(c.memberId) || null;
    const mine = (sessions || []).filter(s => s && s.clientId === c.id);
    const done = mine.filter(s => ptSessionStatus(s.status) === "done");
    const planned = mine.filter(s => ptSessionStatus(s.status) === "planned");

    const lastDone = done.map(s => dayOf(s.date)).filter(Boolean).sort().pop() || "";
    // The NEXT session is the earliest planned one that has not already passed.
    // A planned session dated last Tuesday is not "next"; it is a session the
    // coach forgot to mark done, and calling it next would put a date in the
    // future column that is in the past.
    const upcoming = planned.map(s => dayOf(s.date)).filter(d => d && d >= today).sort();
    const overdue  = planned.map(s => dayOf(s.date)).filter(d => d && d < today).sort();

    return {
      id: c.id,
      memberId: c.memberId,
      // An orphan is a 1:1 record whose member row is gone — PDPA erasure
      // cascades `attendance` but knows nothing about this local ledger. Shown
      // as itself rather than as a blank name, because a nameless row in a
      // client list reads as a rendering bug and gets ignored.
      orphan: !member,
      name: member?.name || "",
      email: member?.email || "",
      memberStatus: member?.status || "",
      goal: c.goal || "",
      coachName: c.coachName || "",
      startedAt: dayOf(c.startedAt),
      status: ptClientStatus(c.status),
      notes: c.notes || "",
      parq: parqStatus(latestParq(parqRecords, c.memberId), { now }),
      sessionsDone: done.length,
      sessionsPlanned: planned.length,
      lastDone,
      nextPlanned: upcoming[0] || "",
      overduePlanned: overdue.length,
    };
  });

  return rows.sort(_byCoachDay);
}

// The coach's day, in order. Training clients before paused before ended;
// within those, whoever is on today's page first, then whoever has no session
// booked (the ones needing a decision), then alphabetically so the list does not
// reshuffle between renders.
function _byCoachDay(a, b) {
  const rank = s => PT_CLIENT_STATUSES.indexOf(s);
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  if (!!a.nextPlanned !== !!b.nextPlanned) return a.nextPlanned ? -1 : 1;
  if (a.nextPlanned && b.nextPlanned && a.nextPlanned !== b.nextPlanned)
    return a.nextPlanned < b.nextPlanned ? -1 : 1;
  return (a.name || "").localeCompare(b.name || "");
}

/**
 * The numbers at the top of the 1:1 screen. Counts only — nothing derived, and
 * in particular no money: this product has no PT billing model, and a rate
 * multiplied by a session count would be the confident wrong number that CLAUDE.md
 * names as worse than no number.
 */
export function ptRosterSummary(rows = []) {
  const training = rows.filter(r => r.status === "active");
  return {
    total: rows.length,
    training: training.length,
    // Blocked counts only clients the coach is actually trying to program for.
    // A paused client with an expired screen is not a problem this week.
    blocked: training.filter(r => r.parq.blocksLoad).length,
    unscreened: training.filter(r => r.parq.state === "unscreened").length,
    booked: training.filter(r => r.nextPlanned).length,
    overdue: training.reduce((t, r) => t + r.overduePlanned, 0),
    orphans: rows.filter(r => r.orphan).length,
  };
}

/**
 * The sentence under those numbers. Lives here, beside the arithmetic that
 * decides it, for the reason `describeCohorts` does: two places describing one
 * count is how a heading and its prose come to disagree.
 */
export function describePtRoster(s) {
  if (!s.total) {
    return "No 1:1 clients yet. Add someone from your roster to start programming for them individually.";
  }
  if (!s.training) {
    return `${s.total} 1:1 ${s.total === 1 ? "client" : "clients"} on record, none currently training.`;
  }
  const parts = [`${s.training} training 1:1`];
  if (s.blocked) {
    parts.push(`${s.blocked} cannot be programmed for until ${s.blocked === 1 ? "their health screen is" : "their health screens are"} sorted`);
  }
  parts.push(s.booked
    ? `${s.booked} with a session booked`
    : "none with a session booked");
  let out = parts.join(" · ");
  if (s.overdue) {
    out += `. ${s.overdue} planned ${s.overdue === 1 ? "session is" : "sessions are"} in the past and still unmarked.`;
  }
  return out;
}

/** A client's own sessions, newest first — the order a coach reads a history in. */
export function sessionsForClient(sessions = [], clientId) {
  if (!clientId) return [];
  return (sessions || [])
    .filter(s => s && s.clientId === clientId)
    .sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date))
      || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/**
 * Which members are still available to be added as a 1:1 client.
 *
 * Excludes anyone who already has a 1:1 record — including an `ended` one,
 * because the right move for a returning client is to reopen their history, not
 * to start a second one beside it. The screen offers exactly that.
 */
export function availableMembers(members = [], clients = []) {
  const taken = new Set((clients || []).filter(Boolean).map(c => c.memberId));
  return (members || [])
    .filter(m => m && m.id && !taken.has(m.id))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
