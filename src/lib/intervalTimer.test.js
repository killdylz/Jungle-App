import { describe, it, expect } from "vitest";
import { calcIntervalState, floorPacer, FLOOR_PACE } from "./intervalTimer.js";

// The Runner's live interval sub-timer. Every number below is what a coach and a
// room would see counting down, so each is stated as an exact expectation rather
// than a range — a phase or round off by one is a real, visible, mid-class bug.

const tabata = (over = {}) => ({ n: "Burpees", timing: "tabata", ...over });
const emom   = (over = {}) => ({ n: "Cleans",  timing: "emom",   ...over });

describe("calcIntervalState — guards", () => {
  it("returns null when there are no exercises", () => {
    expect(calcIntervalState([], 5)).toBeNull();
    expect(calcIntervalState(null, 5)).toBeNull();
    expect(calcIntervalState(undefined, 5)).toBeNull();
  });

  it("returns null when no exercise carries a timing", () => {
    expect(calcIntervalState([{ n: "Back Squat" }, { n: "Row", timing: "none" }], 5)).toBeNull();
  });

  it("returns null for a missing or negative clock", () => {
    expect(calcIntervalState([tabata()], null)).toBeNull();
    expect(calcIntervalState([tabata()], undefined)).toBeNull();
    expect(calcIntervalState([tabata()], -1)).toBeNull();
  });
});

describe("calcIntervalState — default Tabata (20s on / 10s off, 8 rounds)", () => {
  // cycle = 30s, total = 240s.
  it("opens in WORK with the full work time on the clock", () => {
    expect(calcIntervalState([tabata()], 0)).toMatchObject({
      phase: "WORK", phaseRemaining: 20, round: 1, totalRounds: 8, exName: "Burpees",
    });
  });

  it("counts the work phase down to 1", () => {
    expect(calcIntervalState([tabata()], 19)).toMatchObject({ phase: "WORK", phaseRemaining: 1, round: 1 });
  });

  it("flips to REST exactly at the work boundary, not before", () => {
    expect(calcIntervalState([tabata()], 20)).toMatchObject({ phase: "REST", phaseRemaining: 10, round: 1 });
  });

  it("counts the rest phase down to 1", () => {
    expect(calcIntervalState([tabata()], 29)).toMatchObject({ phase: "REST", phaseRemaining: 1, round: 1 });
  });

  it("rolls into round 2 at the cycle boundary", () => {
    expect(calcIntervalState([tabata()], 30)).toMatchObject({ phase: "WORK", phaseRemaining: 20, round: 2 });
  });

  it("is still live in the final round", () => {
    expect(calcIntervalState([tabata()], 239)).toMatchObject({ phase: "REST", phaseRemaining: 1, round: 8, totalRounds: 8 });
  });

  it("goes null the instant the last round completes", () => {
    expect(calcIntervalState([tabata()], 240)).toBeNull();
  });
});

describe("calcIntervalState — EMOM has no rest phase", () => {
  // A stated 60s EMOM: work == the whole cycle, so it never shows REST.
  const ex = emom({ workSec: 60, rounds: 3 }); // rest defaults to 0
  it("stays in WORK across a whole minute", () => {
    expect(calcIntervalState([ex], 0)).toMatchObject({ phase: "WORK", phaseRemaining: 60, round: 1 });
    expect(calcIntervalState([ex], 59)).toMatchObject({ phase: "WORK", phaseRemaining: 1, round: 1 });
  });
  it("ticks to the next minute without a rest phase in between", () => {
    expect(calcIntervalState([ex], 60)).toMatchObject({ phase: "WORK", phaseRemaining: 60, round: 2 });
  });
  it("ends after the last round", () => {
    expect(calcIntervalState([ex], 180)).toBeNull();
  });
});

describe("calcIntervalState — explicit work/rest/rounds", () => {
  const ex = tabata({ workSec: 30, restSec: 15, rounds: 2 }); // cycle 45, total 90
  it("respects the stated durations", () => {
    expect(calcIntervalState([ex], 44)).toMatchObject({ phase: "REST", phaseRemaining: 1, round: 1 });
    expect(calcIntervalState([ex], 45)).toMatchObject({ phase: "WORK", phaseRemaining: 30, round: 2 });
  });
});

describe("calcIntervalState — several timed blocks run back-to-back", () => {
  it("advances into the second block once the first is spent", () => {
    // Two default Tabatas: block 1 owns 0–239, block 2 owns 240–479.
    const s = calcIntervalState([tabata({ n: "A" }), tabata({ n: "B" })], 250);
    expect(s).toMatchObject({ exName: "B", phase: "WORK", phaseRemaining: 10, round: 1 });
  });

  it("does not let an untimed exercise consume the clock", () => {
    // The untimed lift contributes no duration, so the Tabata is live from 0.
    const s = calcIntervalState([{ n: "Deadlift" }, tabata({ n: "Finisher" })], 0);
    expect(s).toMatchObject({ exName: "Finisher", phase: "WORK", round: 1 });
  });
});

describe("calcIntervalState — degenerate inputs are clamped, not crashed", () => {
  it("floors work at 1s and rounds at 1", () => {
    // workSec 0 and rounds 0 are treated as unset → defaults, then clamped.
    const s = calcIntervalState([tabata({ workSec: 0, rounds: 0 })], 0);
    expect(s).toMatchObject({ workSec: 20, totalRounds: 8 });
  });

  it("documents the one Tabata quirk: an explicit 0 rest reads as unset and becomes 10", () => {
    // `parseInt('0') || 10` is 10 because 0 is falsy. A continuous (no-rest) format
    // is EMOM's job; a 0-rest Tabata is degenerate, so this is acceptable — but it
    // is surprising, so it is pinned rather than left to be discovered live.
    const s = calcIntervalState([tabata({ restSec: 0 })], 20);
    expect(s).toMatchObject({ phase: "REST", restSec: 10 });
  });
});

// The Floor board's ambient pacer. These pin the CURRENT (fixed-cadence) behaviour
// verbatim — 45s work / 15s rest / 8 rounds, 180s rotation, spotlight every 6s. If
// the "fabricated pacer" decision (SESSION-HANDOFF.md) makes it plan-derived, these
// are the tests that will change with it; until then they stop it drifting silently.
describe("floorPacer — fixed work/rest/rotation cadence", () => {
  const { roundLen, restLen, rounds, rotateEverySec } = FLOOR_PACE; // 45/15/8/180

  it("opens in WORK with the full round on the clock, round 1", () => {
    expect(floorPacer(0, 5)).toMatchObject({ phase: "WORK", phaseRemaining: roundLen, currentRound: 1, rounds });
  });

  it("counts work down and flips to REST exactly at the work boundary", () => {
    expect(floorPacer(44, 5)).toMatchObject({ phase: "WORK", phaseRemaining: 1 });
    expect(floorPacer(45, 5)).toMatchObject({ phase: "REST", phaseRemaining: restLen });
    expect(floorPacer(59, 5)).toMatchObject({ phase: "REST", phaseRemaining: 1 });
  });

  it("rolls into the next round at the 60s cycle boundary", () => {
    expect(floorPacer(60, 5)).toMatchObject({ phase: "WORK", phaseRemaining: roundLen, currentRound: 2 });
  });

  it("caps the round counter at the configured total", () => {
    // 8 rounds * 60s = 480s; anything at or past that stays at round 8.
    expect(floorPacer(480, 5).currentRound).toBe(rounds);
    expect(floorPacer(6000, 5).currentRound).toBe(rounds);
  });

  it("counts the 180s station rotation down and wraps", () => {
    expect(floorPacer(0, 5).rotateRemaining).toBe(rotateEverySec);
    expect(floorPacer(179, 5).rotateRemaining).toBe(1);
    expect(floorPacer(180, 5).rotateRemaining).toBe(rotateEverySec); // wrapped
  });

  it("moves the spotlight one station every 6s, wrapping on the station count", () => {
    expect(floorPacer(0, 5).spotlight).toBe(0);
    expect(floorPacer(6, 5).spotlight).toBe(1);
    expect(floorPacer(30, 5).spotlight).toBe(0); // 5 stations → back to the first
  });

  it("does not divide by a zero station count", () => {
    expect(floorPacer(42, 0).spotlight).toBe(0);
  });

  it("treats a negative or missing clock as zero", () => {
    expect(floorPacer(-5, 3)).toMatchObject({ phase: "WORK", phaseRemaining: roundLen, currentRound: 1 });
    expect(floorPacer(undefined, 3).phase).toBe("WORK");
  });
});
