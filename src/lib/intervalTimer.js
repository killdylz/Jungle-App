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

// ── Floor board ambient pacer (CURRENT behaviour, pinned) ────────────────────
// The live Floor board ("STUDIO FLOOR · LIVE") shows a WORK/REST countdown, a
// round counter, a station-rotation timer and a moving station spotlight. Today
// these come from FIXED cadences — 45s work / 15s rest, 8 rounds, 180s rotation,
// spotlight every 6s — NOT from the coach's actual plan. That is a live
// member-facing-honesty question flagged for Dylan (see "fabricated pacer" in
// SESSION-HANDOFF.md). This function pins the current maths verbatim so it is
// testable now, and so whichever way that decision lands there is a clean, covered
// seam to change (e.g. feed it calcIntervalState's phase for interval stages).
export const FLOOR_PACE = { roundLen: 45, restLen: 15, rounds: 8, rotateEverySec: 180, spotlightEverySec: 6 };

export function floorPacer(elapsed, stationCount, cfg = FLOOR_PACE) {
  const e = Math.max(0, elapsed || 0);
  const cycle = cfg.roundLen + cfg.restLen;
  const inCycle = e % cycle;
  const phase = inCycle < cfg.roundLen ? "WORK" : "REST";
  const phaseRemaining = phase === "WORK" ? cfg.roundLen - inCycle : cycle - inCycle;
  const currentRound = Math.min(cfg.rounds, Math.floor(e / cycle) + 1);
  const rotateRemaining = cfg.rotateEverySec - (e % cfg.rotateEverySec);
  const spotlight = stationCount ? Math.floor(e / cfg.spotlightEverySec) % stationCount : 0;
  return { phase, phaseRemaining, currentRound, rounds: cfg.rounds, rotateRemaining, spotlight };
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
