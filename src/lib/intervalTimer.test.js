import { describe, it, expect } from "vitest";
import { calcIntervalState, floorPacer } from "./intervalTimer.js";

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

// The Floor board faces the room. Everything it shows is read by members mid-class,
// so the rule here is the one the "No tracks" and "coming soon" panels were cut
// under: an honest blank beats a confident wrong number. It used to run on fixed
// cadences (45s/15s, 8 rounds, 180s rotation) that came from nothing in the plan.
describe("floorPacer — an interval stage gets its REAL phase", () => {
  const stage = { name: "Tabata Block", dur: 600, exercises: [{ n: "Burpees", timing: "tabata", workSec: 20, restSec: 10, rounds: 8 }] };

  it("takes work/rest from the coach's plan, not a fixed 45/15", () => {
    expect(floorPacer(stage, 0)).toMatchObject({ mode: "interval", phase: "WORK", phaseRemaining: 20, currentRound: 1, rounds: 8 });
    // At 20s the old fixed pacer was still in WORK with 25s left. The plan says REST.
    expect(floorPacer(stage, 20)).toMatchObject({ phase: "REST", phaseRemaining: 10, currentRound: 1 });
    expect(floorPacer(stage, 30)).toMatchObject({ phase: "WORK", currentRound: 2 });
  });

  it("reports the round count the plan states", () => {
    const short = { dur: 300, exercises: [{ n: "Row", timing: "tabata", workSec: 30, restSec: 15, rounds: 3 }] };
    expect(floorPacer(short, 0)).toMatchObject({ rounds: 3, currentRound: 1 });
  });

  it("still counts the stage itself down alongside the phase", () => {
    expect(floorPacer(stage, 60).stageRemaining).toBe(540);
  });
});

describe("floorPacer — a non-interval stage says nothing it cannot know", () => {
  const stage = { name: "Strength", dur: 480, exercises: [{ n: "Back Squat" }] };

  it("reports no phase and no rounds at all", () => {
    const s = floorPacer(stage, 100);
    expect(s.mode).toBe("steady");
    // The whole point: a room on a strength block sees no fabricated WORK/REST.
    expect(s.phase).toBeNull();
    expect(s.phaseRemaining).toBeNull();
    expect(s.currentRound).toBeNull();
    expect(s.rounds).toBeNull();
  });

  it("counts down the one thing it does know — this stage", () => {
    expect(floorPacer(stage, 0).stageRemaining).toBe(480);
    expect(floorPacer(stage, 479).stageRemaining).toBe(1);
  });

  it("never runs the stage countdown past zero", () => {
    expect(floorPacer(stage, 999).stageRemaining).toBe(0);
  });

  it("treats an exercise with timing 'none' as untimed", () => {
    expect(floorPacer({ dur: 60, exercises: [{ n: "Row", timing: "none" }] }, 0).mode).toBe("steady");
  });

  it("goes steady once a finished interval block is spent", () => {
    // A default Tabata owns 0-239. Past that there is no phase left to show, and
    // inventing one is exactly the bug this replaced.
    const s = floorPacer({ dur: 600, exercises: [{ n: "Burpees", timing: "tabata" }] }, 240);
    expect(s).toMatchObject({ mode: "steady", phase: null });
  });
});

describe("floorPacer — guards", () => {
  it("survives a missing stage", () => {
    expect(floorPacer(null, 10)).toMatchObject({ mode: "steady", phase: null, stageRemaining: null });
    expect(floorPacer(undefined, 0).mode).toBe("steady");
  });

  it("reports an unknown stage length as null rather than zero", () => {
    // null means "we don't know", and the board hides the countdown. Zero would
    // read as "this stage is over", which is a different and wrong claim.
    expect(floorPacer({ exercises: [] }, 10).stageRemaining).toBeNull();
  });

  it("treats a negative or missing clock as zero", () => {
    expect(floorPacer({ dur: 100 }, -5).stageRemaining).toBe(100);
    expect(floorPacer({ dur: 100 }, undefined).stageRemaining).toBe(100);
  });
});

