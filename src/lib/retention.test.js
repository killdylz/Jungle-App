import { describe, it, expect } from "vitest";
import {
  atRiskMembers, retentionSummary, describeRetention, attendanceIndex, studioActivity,
  ABSENCE_DAYS, NEW_MEMBER_MIN_VISITS,
} from "./retention.js";

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

  it("falls back to the first visit when the roster has no joined date (CSV backfill)", () => {
    const f = atRiskMembers([member("m1", "Ada", "")], [visit("m1", 20)], { now: NOW });
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
