// ── Interval sub-timer (Tabata / EMOM) ───────────────────────────────────────
// Extracted from App.jsx so the Runner's live interval math — which drives what a
// coach and a room see counting down mid-class — is finally unit-testable. The
// spec (§ testing) named "timer/stage math" as the one piece of core logic with
// no coverage; a wrong phase or round here is a bug that only shows up in a live
// class, which is the worst place to find it.
//
// Model: within a stage, the exercises that carry a `timing` of "tabata" or "emom"
// run back-to-back from the stage's own elapsed clock. Untimed exercises are not
// part of the interval timeline (they have no duration to advance it). Given the
// stage's exercises and the seconds elapsed in the stage, this returns the state
// of whichever timed exercise is live — or null when none is (no timed exercises,
// or the elapsed time is past the last one, or elapsed is missing/negative).

// ── Floor board pacer ────────────────────────────────────────────────────────
// The live Floor board ("STUDIO FLOOR · LIVE") faces the room — members read it
// mid-class. It used to show a WORK/REST countdown, a round counter and a station
// rotation timer driven by FIXED cadences (45s work / 15s rest, 8 rounds, 180s
// rotation, spotlight every 6s) that had nothing to do with the coach's plan. On a
// non-interval class the room was reading a fabricated clock — the same
// member-facing-honesty problem that got the "No tracks" and "coming soon" panels
// cut. Dylan's call was to feed it the real phase and be honest otherwise.
//
// So: a stage whose exercises carry a real Tabata/EMOM timing gets its real phase,
// from the same calcIntervalState the Runner already uses. Every other stage gets
// an honest steady state — the stage's own countdown and no invented rounds.
//
// `elapsed` is elapsed WITHIN the current stage (the Runner resets it on every
// stage change), which is exactly what calcIntervalState expects.
export function floorPacer(stage, elapsed) {
  const e = Math.max(0, elapsed || 0);
  const dur = Math.max(0, Number(stage?.dur) || 0);
  // Real: how long this stage has left. This is also the only honest answer to
  // "when do we rotate?" — the room moves on when the stage does, and nothing in
  // the plan expresses a rotation cadence independent of that.
  const stageRemaining = dur ? Math.max(0, dur - e) : null;
  const iv = calcIntervalState(stage?.exercises, e);
  if (iv) {
    return {
      mode: "interval",
      phase: iv.phase, phaseRemaining: iv.phaseRemaining,
      currentRound: iv.round, rounds: iv.totalRounds,
      exName: iv.exName, stageRemaining,
    };
  }
  return {
    mode: "steady",
    phase: null, phaseRemaining: null, currentRound: null, rounds: null,
    exName: "", stageRemaining,
  };
}

export function calcIntervalState(exercises, elapsed) {
  if (!exercises?.length || elapsed == null || elapsed < 0) return null;
  let offset = 0;
  for (const ex of exercises) {
    if (!ex.timing || ex.timing === "none") continue;
    const workSec  = Math.max(1, parseInt(ex.workSec)  || 20);
    const restSec  = Math.max(0, parseInt(ex.restSec)  || (ex.timing === "emom" ? 0 : 10));
    const rounds   = Math.max(1, parseInt(ex.rounds)   || (ex.timing === "emom" ? 10 : 8));
    const cycleDur = workSec + restSec;           // always >= 1
    const totalDur = rounds * cycleDur;
    if (elapsed < offset + totalDur) {
      const elapsedInEx    = elapsed - offset;
      const roundIdx       = Math.floor(elapsedInEx / cycleDur);
      const elapsedInCycle = elapsedInEx % cycleDur;
      const isWork         = elapsedInCycle < workSec;
      const phaseRemaining = Math.max(0, isWork ? workSec - elapsedInCycle : cycleDur - elapsedInCycle);
      return { exName: ex.n, phase: isWork ? "WORK" : "REST", phaseRemaining, round: roundIdx + 1, totalRounds: rounds, timing: ex.timing, workSec, restSec };
    }
    offset += totalDur;
  }
  return null;
}
