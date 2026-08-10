// ─── Check-in timing instrumentation (infra backlog I4) ──────────────────────
//
// WHY THIS EXISTS
// The spec names check-in rate the pilot's #1 metric, sets **P6: ≤5 seconds per
// member** as a design law, and makes **A7** — "coaches will actually capture
// attendance" — an assumption whose failure is kill criterion #3. None of that
// was measurable. The product could fail its own kill criterion silently, and
// the first signal would be a studio quietly not using the feature.
//
// This module turns that into a number. Local-only for now: persisting it
// server-side needs a migration, and a metric is not worth changing the schema
// for until we have looked at it for a few weeks.
//
// THE MEASUREMENT PROBLEM, and how it is handled honestly:
// The naive metric — (panel closed - panel opened) / members — is wrong, because
// a coach opens the roster, checks two people in, then coaches for ten minutes
// and checks in a latecomer. That idle stretch is not check-in effort, and
// including it would make a fast interaction look catastrophically slow.
//
// So we measure the GAP BETWEEN CONSECUTIVE CHECK-INS and treat gaps beyond
// IDLE_GAP_MS as the coach doing something else. Those are excluded from the
// timing and counted separately, so the exclusion is visible rather than a
// silent filter that flatters the number. The FIRST check-in is measured from
// the panel opening — finding the first name is real cost that P6 has to cover.
//
// The reported figure is the MEDIAN, not the mean: one fumbled search for an
// unusual spelling should not swamp twenty fast taps, and P6 is a claim about
// the typical member, not the worst one.

const KEY = "jungle_checkin_metrics";
const MAX_SESSIONS = 200;          // ~a season of classes; keeps localStorage small
export const IDLE_GAP_MS = 60_000; // beyond this, the coach was doing something else
export const P6_TARGET_SEC = 5;    // the design law this exists to measure

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_SESSIONS))); } catch (_) { /* quota */ }
}

export function median(nums) {
  const a = nums.filter(n => typeof n === "number" && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Turn one panel session's raw timestamps into a timing summary.
 * @param openedAt  ms epoch when the check-in panel opened
 * @param stamps    ms epoch of each check-in, in the order they happened
 */
export function summarize(openedAt, stamps) {
  const ts = (stamps || []).filter(n => typeof n === "number").sort((a, b) => a - b);
  if (!ts.length) return { count: 0, medianSec: null, idleSkipped: 0, totalSec: 0 };

  const gaps = [];
  let idleSkipped = 0;
  let prev = openedAt;
  for (const t of ts) {
    const gap = t - prev;
    prev = t;
    if (gap < 0) continue;                       // clock skew — ignore, never negative-credit
    if (gap > IDLE_GAP_MS) { idleSkipped++; continue; }
    gaps.push(gap / 1000);
  }
  return {
    count: ts.length,
    medianSec: median(gaps),
    idleSkipped,
    totalSec: Math.round((ts[ts.length - 1] - openedAt) / 1000),
  };
}

// Record one completed check-in session. No-ops on a session with no check-ins,
// so simply opening and closing the panel does not pollute the sample.
export function recordSession({ classInstanceId, openedAt, stamps }) {
  const s = summarize(openedAt, stamps);
  if (!s.count) return null;
  const row = { at: new Date(openedAt).toISOString(), classInstanceId: classInstanceId || "", ...s };
  write([...read(), row]);
  return row;
}

export function getSessions() { return read(); }
export function clearSessions() { write([]); }

/**
 * The headline: is check-in meeting P6, across every recorded session?
 * `medianSec` is the median of per-session medians — a session with 40 members
 * shouldn't outvote twenty ordinary classes when the question is "what does a
 * check-in feel like".
 */
export function p6Summary(sessions = read()) {
  const withTiming = sessions.filter(s => s.medianSec != null);
  const med = median(withTiming.map(s => s.medianSec));
  const members = sessions.reduce((n, s) => n + (s.count || 0), 0);
  return {
    sessions: sessions.length,
    members,
    // How big a class actually is here, so the consequence of the per-member
    // figure can be stated without inventing a roster size. Median for the same
    // reason the timing is a median: one 40-person special event should not
    // describe a studio's ordinary Tuesday.
    medianClassSize: sessions.length ? median(sessions.map(s => s.count || 0)) : null,
    medianSec: med == null ? null : Math.round(med * 10) / 10,
    // `null` when there is nothing to judge — NOT `true`. An unmeasured law must
    // never read as a passing one; that is the failure mode this module exists
    // to remove, and defaulting to "meeting target" would recreate it exactly.
    meetsTarget: med == null ? null : med <= P6_TARGET_SEC,
    idleSkipped: sessions.reduce((n, s) => n + (s.idleSkipped || 0), 0),
  };
}

// ─── Saying it to a GYM OWNER rather than to ourselves ───────────────────────
//
// This instrument was written for us. P6 is a DESIGN LAW — Jungle's own promise
// that checking a member in takes under five seconds — and the reason to measure
// it is that an unmeasured law is indistinguishable from a met one. That reasoning
// is still good. What was wrong was where it was said.
//
// On the Members screen, directly under the at-risk list, an owner read:
//
//   Check-in speed · "Not measured yet — check members in from the Class Runner
//   and the typical time per member appears here. The target is under 5s." · —
//   · NO DATA
//
// Three things wrong with that, in the middle of the screen meant to sell
// retention. "The target" is unattributed, so an owner cannot tell whose target it
// is or that they are not failing it. `—` beside `NO DATA` is the visual grammar
// of a broken gauge, not of a feature waiting for its first class. And seconds per
// member is not a unit an owner thinks in.
//
// So the number is unchanged and the sentence is rewritten: the target is named as
// JUNGLE'S, which turns an internal threshold into a promise the owner is entitled
// to see measured; the consequence is stated in the unit they care about, coach
// time per class, from their own median class size; and the empty state says
// "nothing yet" and points at the thing that fills it.
//
// Lives here rather than in the screen because this is the third instance of the
// same rule in this repo (`describeRetention`, `describeCohorts`): the wording that
// explains a measurement belongs next to the measurement, or the two drift and the
// screen ends up describing arithmetic it no longer does.

// "45s" / "1 min 20s" / "3 min". Seconds below 90 stay seconds, because "1 min 15s"
// is a harder read than "75s" and an owner is comparing it to how long a queue at
// the door feels.
export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  if (s < 90) return `${s}s`;
  const min = Math.floor(s / 60), rem = s % 60;
  return rem ? `${min} min ${rem}s` : `${min} min`;
}

/**
 * What to tell the gym about check-in speed, including when the answer is
 * "nothing yet". Returns { headline, detail, state } where `state` is
 * "unmeasured" | "meets" | "over" — the screen never derives the verdict itself.
 */
export function describeCheckinSpeed(p6) {
  if (!p6 || p6.medianSec == null) {
    return {
      state: "unmeasured",
      headline: "",
      // No number, no dash, no verdict. An empty instrument must read as a
      // feature that has not started yet, and the previous copy read as a fault
      // the owner had caused and could not fix.
      detail: `Nothing measured yet. Once you run a class from the Class Runner, this shows how long checking members in takes your coaches. Jungle's own target is under ${P6_TARGET_SEC} seconds a member.`,
    };
  }
  const perClass = p6.medianClassSize ? p6.medianSec * p6.medianClassSize : null;
  // "roughly", and the word is doing work: the per-class figure is the median
  // per-member time times the median class size, not a directly measured total.
  // Every input is the gym's own, and the estimate is labelled as one.
  const consequence = perClass
    ? ` A typical class here is ${p6.medianClassSize} member${p6.medianClassSize === 1 ? "" : "s"}, so roughly ${fmtDuration(perClass)} of your coach's time per class.`
    : "";
  return {
    state: p6.meetsTarget ? "meets" : "over",
    headline: `${p6.medianSec}s a member`,
    detail: `Measured across ${p6.sessions} class${p6.sessions === 1 ? "" : "es"} and ${p6.members} check-in${p6.members === 1 ? "" : "s"}.${consequence}`
      + ` Jungle aims to keep this under ${P6_TARGET_SEC}s; long gaps where the coach was doing something else are left out.`,
  };
}
