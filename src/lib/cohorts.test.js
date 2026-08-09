import { describe, it, expect } from "vitest";
import {
  cohortModel, describeCohorts, monthIndex, monthLabel,
  MIN_MEMBERS, MIN_POINT_N, MAX_OFFSET,
} from "./cohorts.js";

// A fixed "now" in the middle of a month, so the trailing-partial-month rule is
// actually exercised. `now` is 9 Aug 2026, which means August is incomplete and
// the last FULL month is July.
const NOW = new Date(2026, 7, 9, 12, 0, 0).getTime();
const AUG_2026 = 2026 * 12 + 7;
const JUL_2026 = AUG_2026 - 1;

// Local-time constructors, not ISO strings. The month boundary is the thing under
// test here, and an ISO fixture would land in a different month depending on the
// runner's timezone — the exact shape of bug retention.js's `daysBetween` comment
// was written about.
const at = (monthIdx, day = 15) =>
  new Date(Math.floor(monthIdx / 12), ((monthIdx % 12) + 12) % 12, day, 12, 0, 0).toISOString();

// One member, one row per month they trained in. `source` matters: it is what
// tells the model whether the record's first month is an import boundary.
const visits = (memberId, months, source = "coach") =>
  months.map((m, i) => ({ id: `${memberId}-${i}`, memberId, classInstanceId: `c${m}`, source, checkedInAt: at(m) }));

// n members whose first month is `start` and who keep coming for `lifespan`
// months. `lifespan: 0` means they came once and never returned.
const cohort = (prefix, n, start, lifespan, source = "coach") =>
  Array.from({ length: n }, (_, i) =>
    visits(`${prefix}${i}`, Array.from({ length: lifespan + 1 }, (_, k) => start + k), source)).flat();

const roster = (attendance) =>
  [...new Set(attendance.map(a => a.memberId))].map(id => ({ id, name: id, status: "active" }));

const model = (attendance, members = null, o = {}) =>
  cohortModel(members ?? roster(attendance), attendance, { now: NOW, ...o });

describe("month arithmetic", () => {
  it("indexes local calendar months and labels them", () => {
    expect(monthIndex(new Date(2026, 0, 1).getTime())).toBe(2026 * 12);
    expect(monthIndex(new Date(2026, 11, 31, 23, 59).getTime())).toBe(2026 * 12 + 11);
    expect(monthLabel(2026 * 12)).toBe("Jan 2026");
    expect(monthLabel(AUG_2026)).toBe("Aug 2026");
  });

  it("counts a month boundary as a month, not as 30 days", () => {
    // 31 Jan and 1 Feb are one day apart and two different cohorts. A model built
    // on 30-day blocks would put them together and drift a whole month over a year.
    expect(monthIndex(new Date(2026, 1, 1).getTime()) - monthIndex(new Date(2026, 0, 31).getTime())).toBe(1);
  });
});

// ─── THE GATE ────────────────────────────────────────────────────────────────
// Built first and tested first, because it is the honesty of the whole screen: a
// curve over three members is sampling error with a chart around it, and a gym
// that imported nothing must be told what is missing rather than shown a shape.
describe("the minimum-N gate states what is needed instead of drawing a line", () => {
  it("says so when there is no attendance at all", () => {
    const m = cohortModel([{ id: "m1" }], [], { now: NOW });
    expect(m.ready).toBe(false);
    expect(m.curve).toEqual([]);
    expect(m.reason).toMatch(/No check-ins are recorded yet/);
    expect(m.reason, "must name where to fix it").toMatch(/Members screen|Class Runner/);
  });

  it("names the number it has and the number it needs", () => {
    // 5 members, well under MIN_MEMBERS.
    const m = model(cohort("a", 5, JUL_2026 - 6, 4));
    expect(m.ready).toBe(false);
    expect(m.reason).toContain(String(MIN_MEMBERS));
    expect(m.reason).toContain("So far 5 members do");
    // "Not enough data" alone leaves an owner unable to tell whether they are one
    // member short or a hundred, and therefore unable to decide whether to import.
    expect(m.measured).toBe(5);
  });

  it("refuses a curve when no point clears MIN_POINT_N, even with enough members", () => {
    // 20 members, all first seen in the LAST full month — so month 1 is not
    // observable for any of them and there is nothing to plot but the anchor.
    const m = model(cohort("a", 20, JUL_2026, 0));
    expect(m.measured).toBe(20);
    expect(m.ready).toBe(false);
    expect(m.reason).toMatch(/needs at least one full month/);
  });

  it("CONTROL: enough data DOES produce a curve", () => {
    // Without this the four assertions above would all pass against a model that
    // never returns ready — a one-line mistake away — and the screen would show
    // the gate forever to every gym.
    const m = model(cohort("a", 20, JUL_2026 - 8, 6));
    expect(m.ready).toBe(true);
    expect(m.curve.length).toBeGreaterThan(1);
    expect(m.reason).toBe("");
  });
});

// ─── Right censoring ─────────────────────────────────────────────────────────
describe("a member too new to measure is not counted as churned", () => {
  it("keeps a member too new to measure out of BOTH numerator and denominator", () => {
    // 20 members 8 months old (observable to month 8) and 20 first seen last
    // month (whose month 1 lands in the incomplete August).
    const m = model([...cohort("old", 20, JUL_2026 - 8, 8), ...cohort("new", 20, JUL_2026, 0)]);
    expect(m.ready).toBe(true);

    // One population for the whole curve, at the horizon the data supports.
    expect(m.horizon).toBe(8);
    expect(m.curveOf).toBe(20);
    expect(m.curveTooNew).toBe(20);
    m.curve.forEach(p => expect(p.of, `offset ${p.offset}`).toBe(20));
    // If the new members had been counted as churned, month 1 would read 50%.
    expect(m.curve.find(p => p.offset === 1).pct).toBe(100);
  });

  it("stops the curve where the population gets thin rather than drawing noise", () => {
    const m = model(cohort("a", 20, JUL_2026 - 4, 4));
    expect(m.ready).toBe(true);
    // Observable only to month 4; month 5 has nobody.
    expect(m.horizon).toBe(4);
    expect(m.curve[m.curve.length - 1].offset).toBe(4);
    expect(m.curveOf).toBeGreaterThanOrEqual(MIN_POINT_N);
  });

  it("never draws past MAX_OFFSET", () => {
    const m = model(cohort("a", 20, JUL_2026 - 30, 30));
    expect(m.curve[m.curve.length - 1].offset).toBe(MAX_OFFSET);
  });

  it("excludes the trailing partial month from the observable window", () => {
    // First seen in June, `now` is 9 August. Month 2 is August, which has had nine
    // days to happen — counting it would report a member as churned for not having
    // trained in the first week of a month that is still running.
    const m = model(cohort("a", 20, JUL_2026 - 1, 1));
    expect(m.window.lastFull).toBe(JUL_2026);
    expect(m.horizon).toBe(1);
    expect(m.curve.find(p => p.offset === 2)).toBeUndefined();
    expect(m.curve.find(p => p.offset === 1).of).toBe(20);
  });

  it("clamps a future-dated row rather than letting it eat the analysis", () => {
    // A CSV with a mistyped year. If `lastFull` trusted it, every denominator
    // would include months that have not happened and the curve would collapse.
    const bad = [...cohort("a", 20, JUL_2026 - 6, 6), ...visits("typo", [AUG_2026 + 40])];
    const m = model(bad);
    expect(m.window.lastFull).toBe(JUL_2026);
    expect(m.ready).toBe(true);
  });
});

// ─── Left censoring: the import boundary ─────────────────────────────────────
describe("the month an import starts is not a cohort", () => {
  it("drops the first month of imported history and says which one", () => {
    const start = JUL_2026 - 10;
    const m = model([
      ...cohort("pre", 30, start, 10, "import"),      // already training when the export begins
      ...cohort("real", 20, start + 3, 4, "import"),
    ]);
    expect(m.censoredMonth).toBe(start);
    expect(m.measured).toBe(20);
    expect(m.excluded).toBe(30);
    expect(m.cohorts.some(c => c.month === start), "the censored month must not appear as a cohort").toBe(false);
    expect(describeCohorts(m)).toContain(monthLabel(start));
    expect(describeCohorts(m)).toMatch(/already training/);
  });

  it("KEEPS the first month for a gym that has only ever used Jungle", () => {
    // The discriminator is `source`, read off the rows — not a guess. A studio
    // that started recording in Jungle on day one has a genuine first cohort, and
    // dropping it would throw away the only cohort a new gym has.
    const start = JUL_2026 - 6;
    const m = model(cohort("a", 20, start, 5, "coach"));
    expect(m.censoredMonth).toBeNull();
    expect(m.imported).toBe(false);
    expect(m.cohorts.some(c => c.month === start)).toBe(true);
    expect(describeCohorts(m)).not.toMatch(/already training/);
  });

  it("censors on the import's OWN first month, not on the earliest import row anywhere", () => {
    // A gym that used Jungle for a while and later imported its older history:
    // the record now begins at the import, so that boundary month is the censored
    // one — not the month the gym happened to start checking in through Jungle.
    const imported = JUL_2026 - 12, live = JUL_2026 - 4;
    const m = model([
      ...cohort("old", 20, imported, 11, "import"),
      ...cohort("live", 20, live, 3, "coach"),
    ]);
    expect(m.censoredMonth).toBe(imported);
    expect(m.imported).toBe(true);
  });
});

// ─── What the numbers mean ───────────────────────────────────────────────────
describe("the curve is a survival curve, not an attendance one", () => {
  it("does not churn a member who skips a month and comes back", () => {
    // Trained in month 0, skipped 1 and 2, back in month 3. Asking "did they
    // visit in month 2" reports them as gone and then un-gone; asking "is their
    // last visit month 2 or later" is the question an owner means.
    const gappy = Array.from({ length: 20 }, (_, i) =>
      visits(`g${i}`, [JUL_2026 - 6, JUL_2026 - 3])).flat();
    const m = model(gappy);
    expect(m.ready).toBe(true);
    [1, 2, 3].forEach(k => expect(m.curve.find(p => p.offset === k).pct, `month ${k}`).toBe(100));
  });

  // 🔴 THE DEFECT THIS PINS, found by this test against the first implementation.
  // With a per-point denominator the curve ROSE: month 7 read 50% after month 6
  // read 33%, because those are percentages of different populations and the
  // members old enough to be measured at month 7 were a more loyal subset. Nobody
  // came back. An owner reading that upturn reads "they return" — a confident
  // wrong story told by arithmetic that is correct at every individual point.
  //
  // The fix is one population for the whole curve, so `last >= cohort + k` is
  // nested in k and the line cannot rise. This asserts the property, not the
  // implementation, because there are several ways to lose it again.
  it("is monotonically non-increasing, so the line can never invite a false story", () => {
    // Deliberately ragged: three cohorts of different ages and very different
    // lifespans, which is what produced the rise in the first place.
    const mixed = [
      ...cohort("a", 12, JUL_2026 - 10, 9),
      ...cohort("b", 12, JUL_2026 - 9, 2),
      ...cohort("c", 12, JUL_2026 - 7, 5),
      ...cohort("d", 12, JUL_2026 - 3, 0),
    ];
    const m = model(mixed);
    expect(m.ready).toBe(true);
    expect(m.curve.length, "control: a curve with only one point cannot rise").toBeGreaterThan(3);
    for (let i = 1; i < m.curve.length; i++) {
      expect(m.curve[i].pct, `offset ${m.curve[i].offset} rose above ${m.curve[i - 1].offset}`)
        .toBeLessThanOrEqual(m.curve[i - 1].pct);
    }
    // And every point really is the same people, which is the reason it holds.
    expect(new Set(m.curve.map(p => p.of)).size).toBe(1);
  });

  it("counts CANCELLED and PAUSED members — they are the signal, not noise", () => {
    // The exact opposite of `atRiskMembers`, which excludes them. Filtering to
    // current members here would compute the retention of the people who stayed
    // and report it as the retention of everyone: a curve pinned near 100% that
    // flatters the gym into ignoring the very problem the screen exists to show.
    const attendance = [...cohort("stay", 12, JUL_2026 - 8, 8), ...cohort("left", 12, JUL_2026 - 8, 0)];
    const withStatus = roster(attendance).map(m => ({ ...m, status: m.id.startsWith("left") ? "cancelled" : "active" }));
    const m = model(attendance, withStatus);
    expect(m.measured).toBe(24);
    // Half came once and never returned.
    expect(m.curve.find(p => p.offset === 1).pct).toBe(50);
  });

  it("reports a half-life only when the curve actually crosses 50%", () => {
    // 12 lasting 8 months, 12 gone after 2 → drops to 50% at month 3, and 50 is
    // not below 50, so the crossing is month 3 only if it goes strictly under.
    const m = model([...cohort("a", 12, JUL_2026 - 9, 8), ...cohort("b", 12, JUL_2026 - 9, 2),
                     ...cohort("c", 4, JUL_2026 - 9, 1)]);
    expect(m.halfLifeMonths).not.toBeNull();
    expect(m.curve.find(p => p.offset === m.halfLifeMonths).pct).toBeLessThan(50);

    // A gym whose members mostly stay gets `null` — NOT an extrapolated figure.
    // A projected half-life is exactly the confident wrong number this refuses.
    const loyal = model(cohort("a", 20, JUL_2026 - 10, 10));
    expect(loyal.ready).toBe(true);
    expect(loyal.halfLifeMonths).toBeNull();
  });
});

describe("per-cohort detail", () => {
  it("leaves an unobservable cell EMPTY, never zero", () => {
    const m = model([...cohort("old", 12, JUL_2026 - 9, 9), ...cohort("recent", 12, JUL_2026 - 2, 2)]);
    expect(m.ready).toBe(true);
    expect(m.period).toBe("month");           // both groups clear MIN_POINT_N
    const recent = m.cohorts.find(c => c.month === JUL_2026 - 2);
    // Two months old: month 1 is measurable, months 3 and 6 are not. Zero in
    // those cells would report a young cohort as a catastrophic one, which is the
    // single most common way a retention table lies.
    expect(recent.points.find(p => p.offset === 1).pct).toBe(100);
    expect(recent.points.find(p => p.offset === 3).pct).toBeNull();
    expect(recent.points.find(p => p.offset === 6).pct).toBeNull();
  });

  it("lists cohorts newest first — the newest is the one being judged", () => {
    const m = model([...cohort("a", 12, JUL_2026 - 9, 8), ...cohort("b", 12, JUL_2026 - 5, 4)]);
    expect(m.cohorts.map(c => c.month)).toEqual([JUL_2026 - 5, JUL_2026 - 9]);
    expect(m.cohorts[0].label).toBe(monthLabel(JUL_2026 - 5));
    m.cohorts.forEach(c => expect(c.size).toBe(12));
  });

  it("never lets a later column sit above an earlier one in the same row", () => {
    // One denominator per row. With a per-cell denominator the 3-month figure can
    // exceed the 1-month one — the same survivorship artefact that made the pooled
    // curve rise, in table form, and just as capable of telling an owner that
    // members come back.
    const m = model([
      ...cohort("a", 10, JUL_2026 - 9, 9), ...cohort("b", 10, JUL_2026 - 9, 1),
      ...cohort("c", 10, JUL_2026 - 4, 4), ...cohort("d", 10, JUL_2026 - 4, 0),
    ]);
    expect(m.ready).toBe(true);
    expect(m.cohorts.length).toBeGreaterThan(1);   // control: something to compare
    m.cohorts.forEach(c => {
      const seen = c.points.filter(p => p.pct != null).map(p => p.pct);
      expect(seen.length, `${c.label} has no measurable cell`).toBeGreaterThan(0);
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i], `${c.label}: a later column rose`).toBeLessThanOrEqual(seen[i - 1]);
      }
    });
  });
});

// ─── Monthly or quarterly ────────────────────────────────────────────────────
// Written monthly-only first, and looking at the rendered screen is what found the
// problem: a 36-member studio adding two or three members a month produced a table
// where EVERY row carried the "read this as a direction, not a measurement"
// footnote. A table that is entirely caveat is what this screen exists to refuse,
// arriving as a table rather than as a chart.
describe("the grouping period comes from the data", () => {
  it("says which period it used, so the prose cannot contradict the table", () => {
    // The first draft's prose said "grouped by the month" while the table showed
    // quarters — one line apart on the rendered screen.
    const trickle = Array.from({ length: 12 }, (_, mo) =>
      cohort(`t${mo}`, 3, JUL_2026 - 11 + mo, Math.max(0, 6 - mo))).flat();
    const q = describeCohorts(model(trickle));
    expect(q).toContain("grouped by the quarter");
    expect(q).not.toContain("grouped by the month");
    expect(q).toMatch(/Grouped by quarter because/);

    const monthly = describeCohorts(model([...cohort("a", 12, JUL_2026 - 8, 8), ...cohort("b", 12, JUL_2026 - 5, 5)]));
    expect(monthly).toContain("grouped by the month");
    expect(monthly).not.toMatch(/Grouped by quarter/);
  });

  it("uses quarters when monthly groups would be a handful of people each", () => {
    // Twelve months, three new members a month — a real small studio's shape.
    const trickle = Array.from({ length: 12 }, (_, mo) =>
      cohort(`t${mo}`, 3, JUL_2026 - 11 + mo, Math.max(0, 6 - mo))).flat();
    const m = model(trickle);
    expect(m.ready).toBe(true);
    expect(m.period).toBe("quarter");
    expect(m.cohorts[0].label).toMatch(/^Q[1-4] \d{4}$/);
    // Quarters are three months of that trickle, so the rows are worth reading.
    expect(Math.max(...m.cohorts.map(c => c.size))).toBeGreaterThanOrEqual(MIN_POINT_N);
  });

  it("stays monthly when the months are big enough, and says which it used", () => {
    const m = model([...cohort("a", 12, JUL_2026 - 8, 8), ...cohort("b", 12, JUL_2026 - 5, 5)]);
    expect(m.period).toBe("month");
    expect(m.cohorts[0].label).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  });

  it("measures a quarterly row from each member's OWN first month", () => {
    // A quarter groups members who started in different months. "Still here after
    // 3 months" for someone who first came in the quarter's third month means
    // three months after THEIR class, not after the quarter began — otherwise the
    // youngest member of every quarter is judged on a head start they never had.
    // Aligned to a real quarter boundary, so both halves land in the SAME group —
    // the first attempt at this fixture straddled two quarters and asserted a
    // 10-member row that never existed.
    const q = Math.floor((JUL_2026 - 11) / 3) * 3;
    const attendance = [
      ...cohort("early", 6, q, 4),                 // first month of the group, lasted 4
      ...cohort("late", 6, q + 2, 4),              // third month of the group, also lasted 4
    ];
    const m = model(attendance);
    expect(m.period).toBe("quarter");
    const row = m.cohorts.find(c => c.month === q);
    expect(row.size).toBe(12);
    // Both halves survived 4 months from their own start, so a correct 3-month
    // figure is 100%. Measured from the quarter's start it would read 50%,
    // because the late half's month 3 falls outside their four-month life.
    expect(row.points.find(p => p.offset === 3).pct).toBe(100);
  });
});

describe("describeCohorts", () => {
  it("names the window, the count, and who is not in it", () => {
    const attendance = cohort("a", 20, JUL_2026 - 6, 5);
    const withGhosts = [...roster(attendance), { id: "ghost1", status: "active" }, { id: "ghost2", status: "active" }];
    const m = model(attendance, withGhosts);
    const s = describeCohorts(m);
    expect(s).toContain("20 members");
    expect(s).toContain(monthLabel(JUL_2026 - 6));
    // The window ends at the last month with a row, not at "now": these members
    // stopped in June, and claiming the analysis covers July would overstate it.
    expect(s).toContain(monthLabel(JUL_2026 - 1));
    // A roster of 22 against an analysis of 20 needs explaining, or the screen
    // looks like it lost two people.
    expect(s).toMatch(/2 members have no recorded check-in/);
  });

  it("returns the gate's reason when there is nothing to describe", () => {
    expect(describeCohorts(cohortModel([], [], { now: NOW }))).toMatch(/No check-ins/);
    expect(describeCohorts(null)).toBe("");
  });
});
