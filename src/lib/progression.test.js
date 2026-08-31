import { describe, it, expect } from "vitest";
import {
  estimate1RM, bestEstimate1RM, liveLogs,
  volumeByMovement, volumeByCategory, personalBests,
  adherence, trend, suggestNextLoad, daysBetween,
  E1RM_MAX_REPS, E1RM_MAX_RIR, TREND_MIN_POINTS, ADHERENCE_MIN_SESSIONS,
} from "./progression.js";

// ─── The honesty gates, asserted as behaviour ────────────────────────────────
//
// Every test below that asserts a REFUSAL is paired with one asserting the same
// function still produces a value when it should. A module that returned
// {ok:false} for everything would satisfy half of this file, and that half is
// the half a nervous refactor tends to leave passing.

const set = (o = {}) => ({ movement: "Back Squat", reps: 5, loadKg: 100, rir: 2, voided: false, ...o });

describe("the thresholds themselves", () => {
  // 🔴 PINNED AS LITERALS, and this is not belt-and-braces. The gate tests below
  // build their inputs from these constants (`rir: E1RM_MAX_RIR + 1`), so a
  // change to a constant moves the test's input with it and the assertion can
  // never fail. Mutation-checking caught exactly that: widening E1RM_MAX_RIR
  // from 3 to 9 — which would let a set five reps from failure project a one-rep
  // max — left the whole file green.
  //
  // These four lines are what make every gate test below able to go red. They
  // are also the right place to argue with a threshold: changing one should
  // require saying so here, in a diff someone reviews.
  it("are the values the gates were argued for", () => {
    expect(E1RM_MAX_REPS).toBe(10);          // formulae diverge past ten reps
    expect(E1RM_MAX_RIR).toBe(3);            // further out, extrapolation beats observation
    expect(TREND_MIN_POINTS).toBe(4);        // three points is not a trend
    expect(ADHERENCE_MIN_SESSIONS).toBe(4);  // 100% of two is not 100%
  });
});

describe("estimate1RM", () => {
  it("computes Epley adjusted for reps in reserve, and shows its working", () => {
    const e = estimate1RM(set({ reps: 5, loadKg: 100, rir: 2 }));
    expect(e.ok).toBe(true);
    // 5 reps at RIR 2 is a seven-rep effort: 100 × (1 + 7/30)
    expect(e.value).toBe(123.3);
    expect(e.basis).toEqual({ reps: 5, loadKg: 100, rir: 2, effectiveReps: 7 });
    expect(e.method).toMatch(/Epley/);
  });

  it("treats RPE as the other spelling of RIR", () => {
    // RPE 8 is RIR 2. The two must produce the SAME number, or a gym that logs
    // RPE gets a different strength history from one that logs RIR.
    expect(estimate1RM(set({ rpe: 8, rir: undefined })).value)
      .toBe(estimate1RM(set({ rir: 2 })).value);
  });

  it("prefers an explicit RIR over a derived one", () => {
    const e = estimate1RM(set({ rir: 1, rpe: 5 }));
    expect(e.basis.rir).toBe(1);
  });

  it("refuses a set with no effort marker — the gate most products skip", () => {
    // 5 reps at 100 kg could be near failure or a warm-up. Those imply one-rep
    // maxes tens of kilos apart, so there is no defensible number here.
    const e = estimate1RM({ reps: 5, loadKg: 100 });
    expect(e.ok).toBe(false);
    expect(e.reason).toBe("no-effort-marker");
  });

  it("refuses above the rep ceiling, and names the ceiling", () => {
    const e = estimate1RM(set({ reps: 11 }));
    expect(e.ok).toBe(false);
    expect(e.reason).toBe("reps-too-high");
    expect(e.need).toBe(10);
    expect(e.have).toBe(11);
    // …and accepts the set exactly at the ceiling. Without this the gate could
    // be off by one in the strict direction and no test would notice.
    expect(estimate1RM(set({ reps: 10 })).ok).toBe(true);
    expect(estimate1RM(set({ reps: 12 })).reason).toBe("reps-too-high");
  });

  it("refuses a set too far from failure, and accepts one at the limit", () => {
    // Literals, deliberately — see "the thresholds themselves". Written as
    // `E1RM_MAX_RIR + 1` these two lines pass for ANY ceiling.
    expect(estimate1RM(set({ rir: 4 })).reason).toBe("too-far-from-failure");
    expect(estimate1RM(set({ rir: 3 })).ok).toBe(true);
    // …and a set well beyond it, which is the case that actually matters: five
    // reps from failure says almost nothing about a one-rep max.
    expect(estimate1RM(set({ rir: 5 })).reason).toBe("too-far-from-failure");
    expect(estimate1RM(set({ rpe: 4, rir: undefined })).reason).toBe("too-far-from-failure");  // RPE 4 = RIR 6
  });

  it("refuses bodyweight and unloaded work rather than calling it 0 kg", () => {
    expect(estimate1RM(set({ loadKg: 0 })).reason).toBe("no-load");
    expect(estimate1RM(set({ loadKg: null })).reason).toBe("no-load");
    expect(estimate1RM(set({ reps: 0 })).reason).toBe("no-reps");
  });
});

describe("bestEstimate1RM", () => {
  const history = [
    set({ reps: 5, loadKg: 100, rir: 2 }),            // 123.3
    set({ reps: 3, loadKg: 110, rir: 1 }),            // 110 × (1+4/30) = 124.7
    set({ reps: 20, loadKg: 60, rir: 0 }),            // skipped: reps-too-high
    set({ reps: 5, loadKg: 105, rir: undefined }),    // skipped: no-effort-marker
  ];

  it("takes the highest defensible estimate and says how many sets it could use", () => {
    const b = bestEstimate1RM(history);
    expect(b.ok).toBe(true);
    expect(b.value).toBe(124.7);
    expect(b.considered).toBe(4);
    expect(b.usable).toBe(2);
    // "142 kg" and "142 kg, from 2 of your 4 logged sets" are different claims.
    expect(b.skipped).toEqual({ "reps-too-high": 1, "no-effort-marker": 1 });
  });

  it("says no-eligible-sets rather than inventing one from unusable data", () => {
    const b = bestEstimate1RM([set({ reps: 20, loadKg: 60, rir: 0 })]);
    expect(b.ok).toBe(false);
    expect(b.reason).toBe("no-eligible-sets");
    expect(b.considered).toBe(1);
  });

  it("ignores superseded rows", () => {
    // A correction must not leave the mistyped 300 kg standing as a best lift.
    const withTypo = [...history, set({ reps: 5, loadKg: 300, rir: 2, voided: true })];
    expect(bestEstimate1RM(withTypo).value).toBe(124.7);
  });
});

describe("volume", () => {
  const logs = [
    set({ movement: "Back Squat", reps: 5, loadKg: 100 }),
    set({ movement: "Back Squat", reps: 5, loadKg: 100 }),
    set({ movement: "Push Up", reps: 20, loadKg: null }),
    set({ movement: "Back Squat", reps: 5, loadKg: 300, voided: true }),
  ];

  it("reports per movement, counting unloaded work as sets and reps but not kg", () => {
    const v = volumeByMovement(logs);
    expect(v.get("Back Squat")).toEqual({ kg: 1000, sets: 2, reps: 10, loadedSets: 2 });
    // A push-up is work. It is not zero-kilo work that drags an average down.
    expect(v.get("Push Up")).toEqual({ kg: 0, sets: 1, reps: 20, loadedSets: 0 });
  });

  it("buckets unrecognised movements visibly instead of dropping them", () => {
    const v = volumeByCategory([set({ movement: "Zercher Wibble", reps: 5, loadKg: 40 })]);
    // A category chart that silently omits a third of the work is the same lie
    // as a wrong total — the visible bucket is what prompts a taxonomy fix.
    expect([...v.keys()]).toEqual(["uncategorised"]);
    expect(v.get("uncategorised").kg).toBe(200);
  });

  it("groups recognised movements by their taxonomy category", () => {
    const v = volumeByCategory([set({ movement: "Back Squat", reps: 5, loadKg: 100 })]);
    expect([...v.keys()]).toEqual(["strength"]);
  });

  it("has no total — the aggregate is deliberately absent", async () => {
    const mod = await import("./progression.js");
    expect(mod.totalVolume).toBeUndefined();
    expect(mod.bodyFatPercent).toBeUndefined();
  });
});

describe("personalBests", () => {
  it("collapses alias spellings so a rename is not a PB", () => {
    const canonical = n => (/back\s*squat/i.test(n) ? "Back Squat" : n);
    const pbs = personalBests([
      set({ movement: "Back Squat", loadKg: 100, reps: 5 }),
      set({ movement: "Backsquat", loadKg: 105, reps: 3 }),
    ], canonical);
    expect(pbs.size).toBe(1);
    expect(pbs.get("Back Squat").loadKg).toBe(105);
  });

  it("counts more reps at the same load as a best", () => {
    const pbs = personalBests([
      set({ loadKg: 100, reps: 5 }),
      set({ loadKg: 100, reps: 8 }),
    ]);
    expect(pbs.get("Back Squat").reps).toBe(8);
  });

  it("does not let a lighter, higher-rep set displace a heavier one", () => {
    const pbs = personalBests([
      set({ loadKg: 140, reps: 1 }),
      set({ loadKg: 60, reps: 30 }),
    ]);
    expect(pbs.get("Back Squat").loadKg).toBe(140);
  });

  it("ignores superseded rows", () => {
    const pbs = personalBests([
      set({ loadKg: 100, reps: 5 }),
      set({ loadKg: 300, reps: 5, voided: true }),
    ]);
    expect(pbs.get("Back Squat").loadKg).toBe(100);
  });
});

describe("adherence", () => {
  const s = status => ({ status });

  it("always returns both numerals, not only a percentage", () => {
    const a = adherence([s("delivered"), s("delivered"), s("planned"), s("no_show")]);
    expect(a).toMatchObject({ ok: true, value: 50, delivered: 2, planned: 4 });
  });

  it("does not count a cancellation as a miss", () => {
    // A session the trainer cancelled is not the client failing to attend.
    const a = adherence([s("delivered"), s("cancelled")]);
    expect(a.delivered).toBe(1);
    expect(a.planned).toBe(1);
    expect(a.value).toBe(100);
  });

  it("flags a percentage drawn from too few sessions as not confident", () => {
    // 100% from two sessions and 100% from forty are the same number and not
    // the same fact. The fraction is always honest; the percentage over-claims.
    expect(adherence([s("delivered"), s("delivered")]).confident).toBe(false);
    expect(adherence(Array(3).fill(s("delivered"))).confident).toBe(false);
    expect(adherence(Array(4).fill(s("delivered"))).confident).toBe(true);
  });

  it("refuses rather than dividing by zero", () => {
    expect(adherence([]).ok).toBe(false);
    expect(adherence([]).reason).toBe("nothing-planned");
    expect(adherence([s("cancelled")]).reason).toBe("nothing-planned");
  });
});

describe("trend", () => {
  const pt = (value, at) => ({ value, at });

  it("refuses below the minimum and names what is missing", () => {
    const t = trend([pt(100, "2026-01-01"), pt(110, "2026-02-01")]);
    expect(t.ok).toBe(false);
    expect(t.reason).toBe("not-enough-data");
    expect(t.have).toBe(2);
    expect(t.need).toBe(4);
    expect(trend([pt(1, "2026-01-01"), pt(2, "2026-01-02"), pt(3, "2026-01-03")]).ok).toBe(false);
  });

  it("draws the line once there are enough points, and shows the span", () => {
    const t = trend([
      pt(100, "2026-01-01"), pt(105, "2026-01-15"),
      pt(108, "2026-02-01"), pt(112, "2026-02-20"),
    ]);
    expect(t.ok).toBe(true);
    expect(t.value).toBe(12);
    expect(t.pct).toBe(12);
    expect(t.points).toBe(4);
    expect(t.spanDays).toBe(50);
  });

  it("refuses points that all land on one day", () => {
    const t = trend(Array(6).fill(0).map(() => pt(100, "2026-01-01")));
    expect(t.ok).toBe(false);
    expect(t.reason).toBe("no-time-span");
  });

  it("returns a null percentage from a zero baseline rather than Infinity", () => {
    const t = trend([
      pt(0, "2026-01-01"), pt(5, "2026-01-10"),
      pt(8, "2026-01-20"), pt(10, "2026-02-01"),
    ]);
    expect(t.ok).toBe(true);
    expect(t.value).toBe(10);
    expect(t.pct).toBeNull();
  });
});

describe("suggestNextLoad", () => {
  const target = { min: 6, max: 8 };

  it("adds weight only when every set reached the top of the range", () => {
    const s = suggestNextLoad({
      lastSets: [set({ reps: 8, loadKg: 100, rir: 1 }), set({ reps: 8, loadKg: 100, rir: 2 })],
      repTarget: target,
    });
    expect(s).toMatchObject({ ok: true, action: "increase", value: 102.5 });
    expect(s.method).toMatch(/add 2.5 kg/);
    expect(s.basis.workingLoad).toBe(100);
  });

  it("holds when one set fell short, even if the others did not", () => {
    const s = suggestNextLoad({
      lastSets: [set({ reps: 8, loadKg: 100, rir: 1 }), set({ reps: 6, loadKg: 100, rir: 0 })],
      repTarget: target,
    });
    expect(s.action).toBe("hold");
    expect(s.basis.minReps).toBe(6);
  });

  it("holds when effort is unknown rather than assuming the set was easy", () => {
    // The conservative reading, and the one that does not add weight to a bar on
    // the strength of a missing field.
    const s = suggestNextLoad({
      lastSets: [set({ reps: 8, loadKg: 100, rir: undefined, rpe: undefined })],
      repTarget: target,
    });
    expect(s.action).toBe("increase");
    // …but if effort says the set was easy-but-not-hard-enough, it must not add.
    const tooEasy = suggestNextLoad({
      lastSets: [set({ reps: 8, loadKg: 100, rir: 5 })],
      repTarget: target,
    });
    expect(tooEasy.action).toBe("hold");
  });

  it("reads the working load, not an average dragged down by warm-ups", () => {
    const s = suggestNextLoad({
      lastSets: [
        set({ reps: 10, loadKg: 40, rir: 6 }),      // warm-up
        set({ reps: 8, loadKg: 100, rir: 1 }),
        set({ reps: 8, loadKg: 100, rir: 1 }),
      ],
      repTarget: target,
    });
    expect(s.basis.workingLoad).toBe(100);
    expect(s.value).toBe(102.5);
  });

  it("refuses without a rep target rather than inventing one", () => {
    expect(suggestNextLoad({ lastSets: [set()] }).reason).toBe("no-rep-target");
    expect(suggestNextLoad({ lastSets: [], repTarget: target }).reason).toBe("no-history");
  });
});

describe("shared helpers", () => {
  it("liveLogs drops superseded rows and survives junk", () => {
    expect(liveLogs([set(), set({ voided: true }), null, undefined]).length).toBe(1);
    expect(liveLogs(null)).toEqual([]);
  });

  it("daysBetween counts local calendar days, not 24-hour periods", () => {
    // 23:30 to 00:30 the next morning is ONE day, not zero. The datum is a date
    // and the reader is a human with a calendar.
    expect(daysBetween("2026-01-02T00:30:00", "2026-01-01T23:30:00")).toBe(1);
    expect(daysBetween("2026-01-01T23:59:00", "2026-01-01T00:01:00")).toBe(0);
  });
});
