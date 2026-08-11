import { describe, it, expect } from "vitest";
import { classTypeRetention, describeClassTypes, RETURN_WINDOW_DAYS, MIN_TRIERS } from "./classTypeRetention.js";

// The arithmetic behind "which of your class types keeps members". Every test
// here is about a way the number can lie, because the number is the product —
// the screen is markup over it.

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-11T09:00:00Z");
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

// A gym, built from the outside in: instances first, then check-ins that point
// at them. `mk` produces one member's visit history to one type.
let seq = 0;
function gym(spec) {
  const classInstances = [], attendance = [];
  for (const [type, members] of Object.entries(spec)) {
    members.forEach((daysAgoList, i) => {
      daysAgoList.forEach((d) => {
        const id = `ci-${type}-${i}-${seq++}`;
        classInstances.push({ id, classType: type, startsAt: at(d) });
        attendance.push({ id: `a-${seq}`, classInstanceId: id, memberId: `${type}-m${i}`, checkedInAt: at(d) });
      });
    });
  }
  return { classInstances, attendance };
}
// n members who tried `firstDaysAgo` and came back `returnAfter` days later
// (null = never came back).
const cohort = (n, firstDaysAgo, returnAfter) =>
  Array.from({ length: n }, () => returnAfter == null ? [firstDaysAgo] : [firstDaysAgo, firstDaysAgo - returnAfter]);

const run = (spec, opts = {}) => {
  const g = gym(spec);
  return classTypeRetention(g.attendance, g.classInstances, { now: NOW, ...opts });
};

describe("classTypeRetention — the return rate, over one comparable population", () => {
  it("ranks types by the share of triers who came back inside the window", () => {
    const m = run({
      // 10 tried 200 days ago; 8 of them came back a week later
      hiit:     [...cohort(8, 200, 7), ...cohort(2, 200, null)],
      // 10 tried, 3 came back
      strength: [...cohort(3, 200, 10), ...cohort(7, 200, null)],
    });
    expect(m.ready).toBe(true);
    expect(m.types.map(t => [t.type, t.pct])).toEqual([["hiit", 80], ["strength", 30]]);
    expect(m.types[0].triers).toBe(10);
  });

  // 🔴 The control that makes the test above mean something. A fixture that
  // cannot produce a ranking passes "ranks types" trivially — this asserts the
  // two figures actually differ and that the order is not the input order.
  it("CONTROL: the fixture really separates the two types", () => {
    const m = run({ hiit: cohort(10, 200, 7), strength: cohort(10, 200, null) });
    expect(m.types[0].pct).toBe(100);
    expect(m.types[1].pct).toBe(0);
    expect(m.types[0].type, "the better type must sort first regardless of insertion order").toBe("hiit");
  });

  // ── The window, which is the whole design ────────────────────────────────
  it("gives every member the SAME window — an older class cannot look better for it", () => {
    // Both types: everyone came back, but only after 40 days. Neither should
    // score, and the one whose members are two years old must not score higher.
    const m = run({
      ancient: cohort(10, 800, 40),
      recent:  cohort(10, 100, 40),
    });
    expect(m.types.map(t => t.pct), "a return outside the window counts for neither")
      .toEqual([0, 0]);
  });

  it("counts a return ON the window boundary and not one past it", () => {
    const inside = run({ a: cohort(10, 200, RETURN_WINDOW_DAYS) });
    const outside = run({ a: cohort(10, 200, RETURN_WINDOW_DAYS + 1) });
    expect(inside.types[0].pct).toBe(100);
    expect(outside.types[0].pct).toBe(0);
  });

  it("leaves members who have not had the window OUT of both numerator and denominator", () => {
    // 10 measurable triers (0 returned) plus 5 who tried three days ago. If the
    // newcomers landed in the denominator the rate would read 0/15 and the
    // NEWEST class on the timetable would always look like the worst one.
    const m = run({ a: [...cohort(10, 200, 5), ...cohort(5, 3, null)] });
    expect(m.types[0].triers).toBe(10);
    expect(m.types[0].pct).toBe(100);
    expect(m.types[0].tooNew, "the too-new members are reported, not hidden").toBe(5);
  });

  it("does not reward a type for being on the timetable more often", () => {
    // `often` has four visits per member, `rare` two. Both: everyone returned
    // once inside the window. A visits-per-member metric would rank `often`
    // twice as high; a return RATE must call them equal.
    const often = Array.from({ length: 10 }, () => [200, 195, 190, 185]);
    const rare  = Array.from({ length: 10 }, () => [200, 195]);
    const m = run({ often, rare });
    expect(m.types.map(t => t.pct)).toEqual([100, 100]);
  });

  // ── The honesty gates ────────────────────────────────────────────────────
  it("EXCLUDES a thin type by name rather than ranking or dropping it", () => {
    const m = run({ hiit: cohort(12, 200, 5), barre: cohort(3, 200, null) });
    expect(m.types.map(t => t.type)).toEqual(["hiit"]);
    expect(m.excluded.map(e => [e.type, e.triers])).toEqual([["barre", 3]]);
    expect(describeClassTypes(m)).toContain("barre (3)");
    expect(describeClassTypes(m), "the threshold must be stated, not implied")
      .toContain(`fewer than ${MIN_TRIERS}`);
  });

  it("refuses to rank at all when no type clears the threshold, and says how close", () => {
    const m = run({ hiit: cohort(5, 200, 5), barre: cohort(2, 200, null) });
    expect(m.ready).toBe(false);
    expect(m.types).toEqual([]);
    expect(m.reason).toContain("hiit");
    expect(m.reason).toContain("5");
    expect(m.reason).toContain(String(MIN_TRIERS));
  });

  it("counts check-ins that cannot be traced to a class type and states them", () => {
    const g = gym({ hiit: cohort(10, 200, 5) });
    // Three rows pointing at an instance with a blank type, and two pointing at
    // an instance the gym does not hold at all. Both are unattributable and read
    // as the same sentence, so they are one number.
    g.classInstances.push({ id: "ci-blank", classType: "", startsAt: at(150) });
    for (let i = 0; i < 3; i++) g.attendance.push({ id: `u${i}`, classInstanceId: "ci-blank", memberId: `x${i}`, checkedInAt: at(150) });
    for (let i = 0; i < 2; i++) g.attendance.push({ id: `g${i}`, classInstanceId: "ci-gone", memberId: `y${i}`, checkedInAt: at(150) });
    const m = classTypeRetention(g.attendance, g.classInstances, { now: NOW });
    expect(m.unattributed).toBe(5);
    expect(m.attributed).toBe(20);
    expect(describeClassTypes(m)).toContain("5 check-ins could not be traced");
  });

  it("says nothing rather than something when EVERY row is unattributable", () => {
    const m = classTypeRetention(
      [{ id: "a", classInstanceId: "nope", memberId: "m1", checkedInAt: at(100) }], [], { now: NOW });
    expect(m.ready).toBe(false);
    expect(m.types).toEqual([]);
    expect(m.reason).toContain("can be traced to a class type");
  });

  // ⚠️ The empty-gym sentence deliberately does NOT repeat the cohort panel's
  // "No check-ins are recorded yet". Both render on the same screen, and one
  // owner reading one screen should not be told the same fact twice in two
  // voices — this panel says what IT is waiting for. The e2e that found this
  // failed on a strict-mode violation, which is the DOM telling you the copy
  // is duplicated.
  it("is empty and honest on a gym with no check-ins at all", () => {
    const m = classTypeRetention([], [], { now: NOW });
    expect(m.ready).toBe(false);
    expect(m.reason).toContain("Once a few weeks of classes");
    expect(m.reason, "must not duplicate the cohort panel's empty sentence")
      .not.toContain("No check-ins are recorded yet");
    expect(describeClassTypes(m)).toBe(m.reason);
  });

  // ── The studio baseline ──────────────────────────────────────────────────
  it("pools the studio rate over members, not over types", () => {
    // 90 triers at 100%, 10 at 0%. Pooled: 90/100 = 90%. A mean of the two RATES
    // would say 50% — a figure no member of this gym experienced.
    const m = run({ big: cohort(90, 200, 5), small: cohort(10, 200, null) });
    expect(m.studioRate).toBe(90);
    expect(m.studioOf).toBe(100);
  });

  // ── Data shapes the importer really produces ─────────────────────────────
  it("survives rows with no date, no member, or no instance", () => {
    const g = gym({ hiit: cohort(10, 200, 5) });
    g.attendance.push({ id: "n1", classInstanceId: "ci-x", memberId: "m", checkedInAt: "not a date" });
    g.attendance.push({ id: "n2", classInstanceId: "ci-x", checkedInAt: at(10) });
    const m = classTypeRetention(g.attendance, g.classInstances, { now: NOW });
    expect(m.ready).toBe(true);
    expect(m.undated).toBe(1);
    expect(m.types[0].pct).toBe(100);
  });

  it("renders a key through the label function — a key is storage, never copy", () => {
    const m = run({ "gym-barre-mrkhj2lc": cohort(10, 200, 5) },
                   { label: (k) => (k === "gym-barre-mrkhj2lc" ? "Barre" : k) });
    expect(m.types[0].label).toBe("Barre");
    expect(describeClassTypes(m)).not.toContain("mrkhj2lc");
  });

  it("does not count a member's own first visit as a return", () => {
    // One visit each, ever. The naive `visits.length >= 1` reads 100%.
    const m = run({ a: cohort(10, 200, null) });
    expect(m.types[0].pct).toBe(0);
  });

  it("does not count two check-ins at the same instant as a return", () => {
    // A double check-in — the importer can produce these from a duplicated row.
    const m = run({ a: Array.from({ length: 10 }, () => [200, 200]) });
    expect(m.types[0].pct, "a return has to happen AFTER the first visit").toBe(0);
  });
});
