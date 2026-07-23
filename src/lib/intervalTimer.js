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
