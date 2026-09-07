import { describe, it, expect } from "vitest";
import {
  atRiskMembers, retentionSummary, describeRetention, attendanceIndex, studioActivity,
  applyRetentionActions, activityIndex, RETENTION_RULES, INACTIVE_STATUSES, isCurrentMember,
  ABSENCE_DAYS, NEW_MEMBER_MIN_VISITS,
} from "./retention.js";
import {
  RETENTION_ACTIONS, retentionAction, retentionRule, MEMBER_STATUSES,
  PT_SESSION_STATUSES, ptSessionStatus,
} from "./store.js";

// A fixed "now" so every test is deterministic — a retention rule that drifts
// with the wall clock is untestable, and this one has to be defensible to an
// operator phoning a member about it.
const NOW = Date.parse("2026-06-01T12:00:00Z");
const daysAgo = d => new Date(NOW - d * 86_400_000).toISOString();

const member = (id, name, joinedAt) => ({ id, name, joinedAt: joinedAt || "" });
const visit = (memberId, d) => ({ memberId, checkedInAt: daysAgo(d), classInstanceId: `c${d}` });

describe("attendanceIndex", () => {
  it("counts visits and finds the first and last, whatever the row order", () => {
    const idx = attendanceIndex([visit("m1", 3), visit("m1", 30), visit("m1", 10)]);
    expect(idx.get("m1").visits).toBe(3);
    expect(idx.get("m1").firstMs).toBe(Date.parse(daysAgo(30)));
    expect(idx.get("m1").lastMs).toBe(Date.parse(daysAgo(3)));
  });

  it("ignores rows with no member or an unparseable date rather than counting them", () => {
    const idx = attendanceIndex([{ memberId: "m1" }, { checkedInAt: daysAgo(1) }, { memberId: "m1", checkedInAt: "nope" }]);
    expect(idx.get("m1")).toBeUndefined();
  });
});

// ── "days ago" counts CALENDAR days ──────────────────────────────────────────
// These fixtures are built with LOCAL-time constructors, not ISO strings, so
// they assert the same thing in every timezone the suite might run in — the
// defect they pin was itself a timezone-shaped one, and an ISO fixture would
// have reproduced it only between certain hours.
//
// The old implementation floored the raw millisecond gap, which answers "how
// many whole 24-hour periods have elapsed" — a different question, and one no
// coach or owner is asking.
describe("days ago is a calendar count, not an elapsed-time one", () => {
  const at = (y, mo, d, h) => new Date(y, mo, d, h, 0, 0).getTime();   // local

  it("counts an imported check-in by the calendar, whatever time of day it is read", () => {
    // The real case: a date-only import anchored at noon UTC (evening local),
    // read the next morning. Jun 19 → Aug 3 is 45 days on any calendar; the
    // elapsed span is 44 days and 13 hours, which floored to 44.
    const lastIn = at(2026, 5, 19, 20);
    const now = at(2026, 7, 3, 9);
    const a = studioActivity([{ memberId: "m1", checkedInAt: new Date(lastIn).toISOString() }], now);
    expect(a.daysSince).toBe(45);
  });

  it("says a member who trained yesterday evening was in 1 day ago, not 0", () => {
    const now = at(2026, 5, 2, 7);
    const a = studioActivity([{ memberId: "m1", checkedInAt: new Date(at(2026, 5, 1, 21)).toISOString() }], now);
    expect(a.daysSince).toBe(1);
  });

  it("still says 0 for someone who trained earlier the same day", () => {
    // The control: calendar counting must not round every visit up to a day.
    const now = at(2026, 5, 2, 19);
    const a = studioActivity([{ memberId: "m1", checkedInAt: new Date(at(2026, 5, 2, 6)).toISOString() }], now);
    expect(a.daysSince).toBe(0);
  });

  it("puts the absence threshold on the day the calendar crosses it", () => {
    // The consequence worth stating: the rule fires on calendar day 14, which is
    // up to a day earlier than the elapsed-time reading used to allow.
    const now = at(2026, 5, 15, 9);
    const roster = [{ id: "m1", name: "Ada", joinedAt: "" }];
    const visits = [{ memberId: "m1", checkedInAt: new Date(at(2026, 5, 1, 20)).toISOString(), classInstanceId: "c1" },
                    { memberId: "m1", checkedInAt: new Date(at(2026, 4, 25, 20)).toISOString(), classInstanceId: "c2" }];
    const f = atRiskMembers(roster, visits, { now });
    expect(f).toHaveLength(1);
    expect(f[0].daysSince).toBe(14);
    expect(f[0].reason).toContain("Last attended 14 days ago, after 2 visits");
  });
});

describe("Rule 1 — new member not building a habit", () => {
  it("flags a member 20 days in with fewer than 4 visits", () => {
    const f = atRiskMembers([member("m1", "Ada", daysAgo(20))], [visit("m1", 18), visit("m1", 15)], { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].rule).toBe("new_member_low_visits");
    expect(f[0].visits).toBe(2);
    // The reason must state the RULE, with its numbers — an operator has to be
    // able to argue with it, not just believe it.
    expect(f[0].reason).toContain("20 days ago");
    expect(f[0].reason).toContain("2 times");
    expect(f[0].reason).toContain(String(NEW_MEMBER_MIN_VISITS));
  });

  it("does NOT flag someone who joined this week — that's a good start, not a warning", () => {
    expect(atRiskMembers([member("m1", "Ada", daysAgo(3))], [visit("m1", 2)], { now: NOW })).toHaveLength(0);
  });

  it("does not flag a new member who IS building a habit", () => {
    const visits = [visit("m1", 18), visit("m1", 15), visit("m1", 10), visit("m1", 5)];
    expect(atRiskMembers([member("m1", "Ada", daysAgo(20))], visits, { now: NOW })).toHaveLength(0);
  });

  it("flags a member who joined 20 days ago and has never attended at all", () => {
    const f = atRiskMembers([member("m1", "Ada", daysAgo(20))], [], { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].visits).toBe(0);
    expect(f[0].severity).toBeGreaterThan(0);
  });

  it("stops applying once the member is past their first month", () => {
    // Beyond the window this is no longer a "month one" problem; the absence rule
    // is the right instrument from here.
    const f = atRiskMembers([member("m1", "Ada", daysAgo(60))], [visit("m1", 58)], { now: NOW });
    expect(f.every(x => x.rule !== "new_member_low_visits")).toBe(true);
  });

  // The gate that makes rule 1 symmetric with rule 2. A CSV backfill carries no
  // join date, and the member's first imported check-in is NOT one — it is the
  // start of the file. Guessing it announces most of an established roster as new
  // members (measured in store.test.js) while stating a date that was never in
  // the data. Silence here is the honest answer; rule 2 still catches a real lapse.
  it("does NOT call someone a new member when the roster has no joined date (CSV backfill)", () => {
    const f = atRiskMembers([member("m1", "Ada", "")], [visit("m1", 20)], { now: NOW });
    expect(f.every(x => x.rule !== "new_member_low_visits")).toBe(true);
  });

  it("ignores an unparseable joined date rather than reading it as the epoch", () => {
    const f = atRiskMembers([member("m1", "Ada", "sometime last spring")], [visit("m1", 20)], { now: NOW });
    expect(f.every(x => x.rule !== "new_member_low_visits")).toBe(true);
  });

  // The other half of the gate: a member the studio actually enrolled still gets
  // rule 1, because `addMember` always records a join date.
  it("still flags a member whose joined date IS known", () => {
    const f = atRiskMembers([member("m1", "Ada", daysAgo(20))], [visit("m1", 18)], { now: NOW });
    expect(f[0].rule).toBe("new_member_low_visits");
  });
});

describe("Rule 2 — absence", () => {
  // The studio must be actively recording for absence to mean anything.
  const active = [visit("regular", 1), visit("regular", 5)];

  it("flags a member who was attending and has stopped", () => {
    const members = [member("m1", "Ada", daysAgo(200)), member("regular", "Reg", daysAgo(200))];
    const att = [...active, visit("m1", 40), visit("m1", 30)];
    const f = atRiskMembers(members, att, { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].memberId).toBe("m1");
    expect(f[0].rule).toBe("absence");
    expect(f[0].daysSince).toBe(30);
    expect(f[0].reason).toContain("30 days ago");
  });

  it("does not flag someone inside the absence window", () => {
    const members = [member("m1", "Ada", daysAgo(200)), member("regular", "Reg", daysAgo(200))];
    const f = atRiskMembers(members, [...active, visit("m1", ABSENCE_DAYS - 1)], { now: NOW });
    expect(f.filter(x => x.memberId === "m1")).toHaveLength(0);
  });

  it("ranks a longer absence as more urgent", () => {
    const members = [member("m1", "Ada", daysAgo(200)), member("m2", "Bea", daysAgo(200)), member("regular", "Reg", daysAgo(200))];
    const f = atRiskMembers(members, [...active, visit("m1", 20), visit("m2", 90)], { now: NOW });
    expect(f[0].memberId).toBe("m2");
    expect(f[0].severity).toBeGreaterThan(f[1].severity);
  });

  it("gives a member ONE flag, not two", () => {
    const f = atRiskMembers([member("m1", "Ada", daysAgo(20)), member("regular", "Reg", daysAgo(200))],
                            [...active, visit("m1", 19)], { now: NOW });
    expect(f.filter(x => x.memberId === "m1")).toHaveLength(1);
  });
});

// ── The honesty property this module exists for ──────────────────────────────
describe("a historical backfill must NOT flag the entire roster", () => {
  // This is the failure that would matter most in practice. A studio imports two
  // years of attendance on day one; every row is old by definition. A naive
  // absence rule flags all 400 members, the operator learns to ignore the screen,
  // and A3 ("do operators act on alerts?") gets answered by our bug, not the market.
  const roster = Array.from({ length: 20 }, (_, i) => member(`m${i}`, `Member ${i}`, daysAgo(400)));
  const historical = roster.map((m, i) => visit(m.id, 300 + i));

  it("raises no absence flags when nothing has been recorded recently", () => {
    const f = atRiskMembers(roster, historical, { now: NOW });
    expect(f.filter(x => x.rule === "absence")).toHaveLength(0);
  });

  it("reports the DATA as stale rather than the members as at-risk", () => {
    const s = retentionSummary(roster, historical, { now: NOW });
    expect(s.state).toBe("not-recording");
    expect(s.atRisk).toBeNull();          // unknown, NOT zero and NOT 20
    expect(describeRetention(s)).toMatch(/paused/i);
  });

  it("resumes flagging as soon as the studio records again", () => {
    const s = retentionSummary(roster, [...historical, visit("m0", 1)], { now: NOW });
    expect(s.state).toBe("flagged");
    expect(s.flags.some(x => x.rule === "absence")).toBe(true);
  });
});

describe("retentionSummary states", () => {
  it("says 'no data' rather than showing a green all-clear", () => {
    const s = retentionSummary([member("m1", "Ada", daysAgo(20))], [], { now: NOW });
    // Rule 1 can still fire without attendance, but the STATE must be honest.
    expect(s.state).toBe("no-data");
    expect(s.atRisk).toBeNull();
    expect(describeRetention(s)).toMatch(/no attendance recorded/i);
  });

  it("reports a genuinely healthy roster as ok — with a real zero, not a null", () => {
    const members = [member("m1", "Ada", daysAgo(200))];
    const s = retentionSummary(members, [visit("m1", 1), visit("m1", 4)], { now: NOW });
    expect(s.state).toBe("ok");
    expect(s.atRisk).toBe(0);
  });

  it("is deterministic for a fixed now", () => {
    const members = [member("m1", "Ada", daysAgo(20)), member("m2", "Bea", daysAgo(200))];
    const att = [visit("m1", 18), visit("m2", 1)];
    expect(JSON.stringify(retentionSummary(members, att, { now: NOW })))
      .toBe(JSON.stringify(retentionSummary(members, att, { now: NOW })));
  });
});

describe("studioActivity", () => {
  it("knows whether the studio is currently recording", () => {
    expect(studioActivity([visit("m1", 2)], NOW).recording).toBe(true);
    expect(studioActivity([visit("m1", 40)], NOW).recording).toBe(false);
    expect(studioActivity([], NOW)).toMatchObject({ recording: false, lastCheckInMs: null, daysSince: null });
  });
});

// ── N3 surface: the operator's own actions ───────────────────────────────────
// These two constants are written into 0008's CHECK constraints. A constrained
// column rejecting a client value is this repo's recurring data-loss bug (three
// occurrences), so both are pinned here and the SQL must be read alongside them.
describe("constrained values shared with 0008", () => {
  it("pins the rule names the CHECK constraint allows", () => {
    expect(RETENTION_RULES).toEqual(["new_member_low_visits", "absence"]);
  });

  it("pins the action names the CHECK constraint allows", () => {
    expect(RETENTION_ACTIONS).toEqual(["acted", "dismissed", "reopened"]);
  });

  it("every rule a flag can carry is a legal rule", () => {
    // The flags and the constraint cannot drift: whatever atRiskMembers emits
    // has to be insertable.
    const members = [member("m1", "Ada", daysAgo(20)), member("m2", "Bea", daysAgo(200))];
    const flags = atRiskMembers(members, [visit("m2", 40), visit("m2", 1), visit("m1", 19)], { now: NOW });
    flags.forEach(f => expect(RETENTION_RULES).toContain(f.rule));
  });

  it("coerces an unknown action but REFUSES an unknown rule", () => {
    // Opposite treatments on purpose: a bad action defaults to the conservative
    // "acted", but a bad rule would file the action against the wrong alert,
    // which is worse than not recording it at all.
    expect(retentionAction("nonsense")).toBe("acted");
    expect(retentionAction("dismissed")).toBe("dismissed");
    expect(retentionRule("absence")).toBe("absence");
    expect(retentionRule("nonsense")).toBeNull();
  });
});

describe("applyRetentionActions", () => {
  // "regular" keeps the studio RECORDING, without which the absence rule is
  // correctly suppressed and there is no flag to action in the first place.
  const members = [member("m1", "Ada", daysAgo(200)), member("regular", "Reg", daysAgo(200))];
  const att = [visit("regular", 1), visit("m1", 30), visit("m1", 20)];   // m1 last seen 20d → absence
  const flagsFor = () => atRiskMembers(members, att, { now: NOW }).filter(f => f.memberId === "m1");
  const action = (action, d, rule = "absence") =>
    ({ memberId: "m1", rule, action, occurredAt: daysAgo(d) });

  it("leaves a flag active when nothing has been done about it", () => {
    const { active, handled } = applyRetentionActions(flagsFor(), [], att);
    expect(active).toHaveLength(1);
    expect(handled).toHaveLength(0);
  });

  it("moves an actioned flag out of the active list", () => {
    const { active, handled } = applyRetentionActions(flagsFor(), [action("acted", 2)], att);
    expect(active).toHaveLength(0);
    expect(handled).toHaveLength(1);
    expect(handled[0].action).toBe("acted");
  });

  it("keeps WHAT was done and WHEN, rather than just hiding the flag", () => {
    // A3 asks whether operators act on alerts. Hiding the flag without keeping
    // the action would answer it by destroying the evidence.
    const acts = [{ ...action("acted", 2), note: "called, coming Thursday" }];
    const { handled } = applyRetentionActions(flagsFor(), acts, att);
    expect(handled[0].actionNote).toBe("called, coming Thursday");
    expect(handled[0].actionAt).toBe(daysAgo(2));
  });

  it("uses the LATEST action per member and rule", () => {
    const acts = [action("acted", 10), action("dismissed", 2)];
    expect(applyRetentionActions(flagsFor(), acts, att).handled[0].action).toBe("dismissed");
  });

  it("re-activates a flag that was explicitly reopened", () => {
    const acts = [action("acted", 10), action("reopened", 2)];
    const { active, handled } = applyRetentionActions(flagsFor(), acts, att);
    expect(active).toHaveLength(1);
    expect(handled).toHaveLength(0);
  });

  it("brings the flag back once the member is SEEN AGAIN after the action", () => {
    // The judgement call in the whole feature. A member who lapses, is called,
    // returns, and lapses again is exactly the case an operator wants to know
    // about — so an action holds only until the next check-in.
    const acts = [action("acted", 25)];               // actioned 25 days ago
    const { active } = applyRetentionActions(flagsFor(), acts, att);   // seen 20 days ago
    expect(active).toHaveLength(1);
  });

  it("keeps a never-returning member suppressed", () => {
    // The mirror case: they never came back, the operator already dealt with
    // them, and re-flagging forever is how an alert screen becomes wallpaper.
    const acts = [action("acted", 2)];                // actioned after the last visit
    expect(applyRetentionActions(flagsFor(), acts, att).active).toHaveLength(0);
  });

  it("does not let an action on one rule suppress a different rule", () => {
    const acts = [action("dismissed", 2, "new_member_low_visits")];
    expect(applyRetentionActions(flagsFor(), acts, att).active).toHaveLength(1);
  });

  it("does not let an action on one member suppress another", () => {
    const acts = [{ ...action("dismissed", 2), memberId: "someone-else" }];
    expect(applyRetentionActions(flagsFor(), acts, att).active).toHaveLength(1);
  });

  it("ignores malformed action rows rather than throwing", () => {
    const acts = [{}, { memberId: "m1" }, { memberId: "m1", rule: "absence", action: "acted", occurredAt: "nope" }];
    expect(applyRetentionActions(flagsFor(), acts, att).active).toHaveLength(1);
  });
});

describe("describeRetention agrees with the number the operator sees", () => {
  // Found by driving the UI: the card showed "2" beside "3 members meet an
  // at-risk rule" because the sentence counted raw flags and the headline
  // counted active ones. A screen that contradicts itself will not be trusted
  // enough to phone a member about.
  const members = [member("m1", "Ada", daysAgo(200)), member("m2", "Bea", daysAgo(200)), member("regular", "Reg", daysAgo(200))];
  const att = [visit("regular", 1), visit("m1", 30), visit("m2", 95)];

  it("counts only what is still active, and says how many were handled", () => {
    const s = retentionSummary(members, att, { now: NOW });
    expect(s.flags).toHaveLength(2);
    const line = describeRetention(s, { active: 1, handled: 1 });
    expect(line).toContain("1 member needs attention");
    expect(line).toContain("1 already handled");
    expect(line).not.toContain("2 members");
  });

  it("says everything is handled rather than reporting zero", () => {
    const s = retentionSummary(members, att, { now: NOW });
    expect(describeRetention(s, { active: 0, handled: 2 })).toMatch(/every flagged member has been handled/i);
  });

  it("still describes raw flags when no counts are supplied", () => {
    const s = retentionSummary(members, att, { now: NOW });
    expect(describeRetention(s)).toContain("2 members need attention");
  });
});

// ── SWEEP (session 12) — who is even eligible to be "at risk" ────────────────
//
// Both rules ask "is this member drifting away?" of every row on the roster,
// without ever asking whether the member is still A MEMBER. Two states make that
// question meaningless, and both are reachable from the Members screen's own
// status dropdown:
//
//   cancelled — they have LEFT. "At risk of leaving" is not a warning about
//               someone who already left; it is the screen failing to notice.
//               RosterScreen's own history records this: the members COUNT was
//               fixed so it could go down, and the at-risk list was not.
//   paused    — absent BY AGREEMENT. Injury, travel, a paused membership. The
//               absence rule fires on exactly the absence the gym agreed to.
//
// Both produce a flag the operator cannot act on: `winBackBlockedReason` already
// refuses a draft for anything but "active", so the screen raises an alarm and
// then explains it will not help with it. That is the false-alarm failure this
// module's own header exists to prevent, arriving through a different door.
describe("SWEEP — a flag is only meaningful for a current member", () => {
  const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);
  const ago = d => new Date(NOW - d * 86_400_000).toISOString();
  // Someone current, so the studio counts as recording and rule 2 stays live.
  const CURRENT = { id: "m-cur", name: "Rita Chua", status: "active", joinedAt: "2025-01-05" };
  const curVisit = { memberId: "m-cur", checkedInAt: ago(1) };

  const flagsFor = (status) => atRiskMembers(
    [CURRENT, { id: "m-x", name: "Xan Lee", status, joinedAt: "2025-01-05" }],
    [curVisit, { memberId: "m-x", checkedInAt: ago(40) }],
    { now: NOW },
  ).filter(f => f.memberId === "m-x");

  it("flags a current member who has stopped coming", () => {
    expect(flagsFor("active")).toHaveLength(1);
  });

  it("does not flag someone who has left — they are not at risk, they are gone", () => {
    expect(flagsFor("cancelled")).toHaveLength(0);
  });

  it("does not flag a paused membership for the absence it agreed to", () => {
    expect(flagsFor("paused")).toHaveLength(0);
  });

  // Rule 1 has the same hole: a member who joins, pays, pauses immediately and
  // never attends is not "failing to build a habit", they are on a pause.
  it("does not call a paused member a new member failing to build a habit", () => {
    const flags = atRiskMembers(
      [CURRENT, { id: "m-new", name: "Nia Goh", status: "paused", joinedAt: new Date(NOW - 20 * 86_400_000).toISOString().slice(0, 10) }],
      [curVisit],
      { now: NOW },
    );
    expect(flags.filter(f => f.memberId === "m-new")).toHaveLength(0);
  });

  // The headline the owner reads. A roster of people who have left must not
  // report a number that implies work to do.
  it("does not report members who left as needing attention", () => {
    const s = retentionSummary(
      [CURRENT, { id: "m-a", name: "A", status: "cancelled", joinedAt: "2025-01-05" },
                { id: "m-b", name: "B", status: "cancelled", joinedAt: "2025-01-05" }],
      [curVisit, { memberId: "m-a", checkedInAt: ago(60) }, { memberId: "m-b", checkedInAt: ago(90) }],
      { now: NOW },
    );
    expect(s.atRisk).toBe(0);
    expect(describeRetention(s, { active: 0, handled: 0 })).toMatch(/No members currently meet an at-risk rule/);
  });
});

// The drift guard. `INACTIVE_STATUSES` lives in retention.js because store.js
// already imports from it and the reverse would be a cycle — so the two lists
// cannot be derived from one another in the source, and this test is what keeps
// them in step. Adding a membership status forces a decision here rather than
// silently defaulting, which is the same reasoning as dbConstraints.test.js.
describe("eligibility covers every membership status the store allows", () => {
  it("classifies each of MEMBER_STATUSES as monitored or not", () => {
    const monitored = MEMBER_STATUSES.filter(s => !INACTIVE_STATUSES.includes(s));
    expect(monitored).toEqual(["active"]);
    expect(INACTIVE_STATUSES.every(s => MEMBER_STATUSES.includes(s))).toBe(true);
  });
});

// `isCurrentMember` was a private helper until session 20 gave it a second
// caller: the Runner's check-in sweep, which decides who is offered a row
// mid-class. It is now a shared contract rather than an implementation detail
// of the flagging rules, so its edges are pinned here directly — a change that
// only broke the check-in list would otherwise be caught by nothing in `npm test`.
describe("isCurrentMember", () => {
  it("counts an active member, and anyone whose status is unknown or missing", () => {
    expect(isCurrentMember({ status: "active" })).toBe(true);
    // The stated reason INACTIVE_STATUSES is an excluded set rather than an
    // "active" whitelist: a row written by an older build, or a status added
    // later, must default to BEING SHOWN. A member silently dropped out of the
    // check-in list is invisible, and invisible wrongness is the worst kind.
    expect(isCurrentMember({ status: "" })).toBe(true);
    expect(isCurrentMember({})).toBe(true);
    expect(isCurrentMember({ status: "trial" })).toBe(true);
  });

  it("excludes the two statuses that mean 'not in the room'", () => {
    expect(isCurrentMember({ status: "paused" })).toBe(false);
    expect(isCurrentMember({ status: "cancelled" })).toBe(false);
    // Case-folded, because a hydrated row is whatever Postgres returned.
    expect(isCurrentMember({ status: "Cancelled" })).toBe(false);
  });

  it("does not confuse the members.status spelling with entity_status", () => {
    // `members.status` is "cancelled" (two Ls); the sibling `entity_status` enum
    // in 0001 is "canceled" (one L). Both are legal, in different columns. The
    // one-L spelling is NOT a member status, so it must fall through to current
    // rather than silently hiding someone from the sweep list.
    expect(isCurrentMember({ status: "canceled" })).toBe(true);
  });

  it("survives a null member without throwing", () => {
    // It runs inside a `.filter` over whatever localStorage held.
    expect(isCurrentMember(null)).toBe(true);
    expect(isCurrentMember(undefined)).toBe(true);
  });
});

// ─── D1 · a 1:1 client trained twice a week and was flagged for not turning up ─
//
// The defect, exactly: `addMember` always stamps `joinedAt`, so rule 1 runs on
// every hand-added member. 1:1 sessions are deliberately never written into
// `attendance`. So a PT-only client had `visits === 0`, tripped
// "fewer than 4 visits in their first month" at the highest severity a flag
// carries, and `revenueAtRisk` priced it as money walking out of the door.
//
// 🔴 EVERY TEST HERE CARRIES ITS OWN CONTROL. A fixture that produces no flag
// either way would pass the "not flagged" assertion by testing nothing — this
// repo's empty-screen trap, which has now bitten it three times — so each test
// below asserts the flag IS there without the 1:1 log before asserting it is
// gone with it.
const ptSession = (memberId, d, status = "done") => ({
  id: `s${memberId}${d}`, clientId: `c${memberId}`, memberId,
  date: new Date(NOW - d * 86_400_000).toISOString().slice(0, 10),
  status, planName: "1:1 session",
});

describe("atRiskMembers — the 1:1 log as a second activity source (D1)", () => {
  // Joined 20 days ago: inside rule 1's 14–30 day window, past its grace period.
  const joined20 = [member("m1", "Ana", new Date(NOW - 20 * 86_400_000).toISOString().slice(0, 10))];
  // Twice a week for those three weeks.
  const twiceAWeek = [2, 5, 9, 12, 16, 19].map(d => ptSession("m1", d));

  it("flags a PT-only client when the 1:1 log is not passed — the control", () => {
    // This is the defect reproducing. If this assertion ever goes green-by-
    // absence, every "no longer flagged" test below is worthless.
    const flags = atRiskMembers(joined20, [], { now: NOW });
    expect(flags).toHaveLength(1);
    expect(flags[0].rule).toBe("new_member_low_visits");
    expect(flags[0].visits).toBe(0);
  });

  it("does not flag them once their 1:1 sessions are counted", () => {
    const flags = atRiskMembers(joined20, [], { now: NOW, ptSessions: twiceAWeek });
    expect(flags).toEqual([]);
  });

  it("names WHICH kind of session it counted", () => {
    // A coach reading "attended 3 times" about someone they only ever see
    // one-to-one cannot tell whether the number includes those sessions — and
    // ignoring them is precisely what made this flag wrong.
    const flags = atRiskMembers(joined20, [], { now: NOW, ptSessions: [ptSession("m1", 3)] });
    expect(flags).toHaveLength(1);          // 1 visit is still under the threshold
    expect(flags[0].visits).toBe(1);
    expect(flags[0].reason).toContain("all one-to-one");
  });

  it("names the split when a member does both", () => {
    const flags = atRiskMembers(joined20, [visit("m1", 4)], { now: NOW, ptSessions: [ptSession("m1", 3)] });
    expect(flags).toHaveLength(1);
    expect(flags[0].visits).toBe(2);
    expect(flags[0].reason).toContain("1 in class, 1 one-to-one");
  });

  it("counts DELIVERED sessions only, never booked ones", () => {
    // A booking is an intention. Counting it would let a client who books and
    // never turns up look like the most engaged member on the roster — the
    // opposite of what this rule is for.
    const planned = twiceAWeek.map(s => ({ ...s, status: "planned" }));
    const flags = atRiskMembers(joined20, [], { now: NOW, ptSessions: planned });
    expect(flags).toHaveLength(1);
    expect(flags[0].visits).toBe(0);
  });

  it("lets the absence rule see a 1:1 client who has stopped coming", () => {
    // The other direction, and it is new true-positive value: before this, a
    // PT-only client had no attendance rows at all, so rule 2 (`visits > 0`)
    // skipped them entirely and nothing could ever flag them.
    const members = [member("m2", "Bo", "")];
    const recent = [visit("mOther", 1)];                 // the studio IS recording
    const stale = [ptSession("m2", 40), ptSession("m2", 47)];
    const without = atRiskMembers(members, recent, { now: NOW });
    expect(without).toEqual([]);                          // control: invisible before
    const flags = atRiskMembers(members, recent, { now: NOW, ptSessions: stale });
    expect(flags).toHaveLength(1);
    expect(flags[0].rule).toBe("absence");
    expect(flags[0].daysSince).toBe(40);
    expect(flags[0].reason).toContain("all one-to-one");
  });

  it("keeps studioActivity attendance-only, deliberately", () => {
    // The one place the 1:1 log is NOT folded in, and the reason is the flood
    // this file's header exists to prevent: a gym that imported two years of
    // history and then ran a single 1:1 must not have its whole back-catalogue
    // flagged on the strength of that one session.
    const recentPt = [ptSession("m1", 1), ptSession("m1", 3)];
    expect(studioActivity([], NOW).recording).toBe(false);
    // Fed the 1:1 rows directly it still says no: they carry `date`, not
    // `checkedInAt`, so there is not even an accidental path by which one could
    // turn recording on.
    expect(studioActivity(recentPt, NOW).recording).toBe(false);
    // And the summary the screen reads says "no data" rather than claiming the
    // studio is recording — an honest silence, stated on screen, not a wrong
    // number. This is the deliberate cost of the decision above.
    const s = retentionSummary([member("m1", "Ana", "")], [], { now: NOW, ptSessions: recentPt });
    expect(s.state).toBe("no-data");
    expect(s.atRisk).toBe(null);
    expect(describeRetention(s)).toContain("No attendance recorded yet");
  });

  it("merges both sources into one visit count and one last-seen", () => {
    const idx = activityIndex([visit("m1", 10)], [ptSession("m1", 3), ptSession("m1", 20)]);
    const e = idx.get("m1");
    expect(e.visits).toBe(3);
    expect(e.classVisits).toBe(1);
    expect(e.ptVisits).toBe(2);
    // Last seen is the 1:1 session three days ago, not the class ten days ago.
    expect(new Date(e.lastMs).toISOString().slice(0, 10))
      .toBe(new Date(NOW - 3 * 86_400_000).toISOString().slice(0, 10));
  });

  it("survives a malformed 1:1 row rather than counting it", () => {
    const idx = activityIndex([], [null, { memberId: "m1" }, { status: "done" }, { memberId: "m1", status: "done", date: "nope" }]);
    expect(idx.get("m1")).toBeUndefined();
  });

  it("reopens a suppressed flag when the member returns one-to-one", () => {
    // `applyRetentionActions` closes an episode when the member is SEEN AGAIN.
    // Reading attendance only, a client whose visits are all 1:1 could never be
    // seen again, so a handled flag would stay suppressed for ever.
    const members = [member("m3", "Cy", "")];
    const attendance = [visit("m3", 30), visit("m3", 40), visit("mOther", 1)];
    const flags = atRiskMembers(members, attendance, { now: NOW });
    expect(flags).toHaveLength(1);                        // control: absence fires
    const actions = [{ memberId: "m3", rule: "absence", action: "acted", occurredAt: new Date(NOW - 20 * 86_400_000).toISOString() }];

    const stillHandled = applyRetentionActions(flags, actions, attendance);
    expect(stillHandled.active).toEqual([]);              // control: suppressed

    const back = applyRetentionActions(flags, actions, attendance, { ptSessions: [ptSession("m3", 2)] });
    expect(back.active).toHaveLength(1);
    expect(back.handled).toEqual([]);
  });

  it("threads the 1:1 log through retentionSummary", () => {
    // The screen calls the summary, not `atRiskMembers`. A fix that stopped at
    // the rule would be invisible to every surface.
    const before = retentionSummary(joined20, [], { now: NOW });
    expect(before.flags).toHaveLength(1);                 // control
    const after = retentionSummary(joined20, [], { now: NOW, ptSessions: twiceAWeek });
    expect(after.flags).toEqual([]);
  });

  it("spells 'done' the same way store.js coerces it", () => {
    // retention.js compares the status literally rather than importing
    // `ptSessionStatus`, because store.js imports RETENTION_RULES from
    // retention.js and the import would close a cycle. This is the mirror test
    // that keeps the two spellings honest — the shape `classToken.mirror.test.js`
    // uses for the same reason.
    expect(PT_SESSION_STATUSES).toContain("done");
    expect(ptSessionStatus("done")).toBe("done");
    // The coercion maps everything unrecognised to "planned", so a literal
    // `=== "done"` accepts exactly the same set it does.
    for (const v of ["", null, undefined, "DONE?", "finished", "planned"]) {
      expect(ptSessionStatus(v) === "done").toBe(String(v || "").toLowerCase() === "done");
    }
  });
});
