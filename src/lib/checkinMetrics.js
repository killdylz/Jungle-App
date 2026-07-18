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
    medianSec: med == null ? null : Math.round(med * 10) / 10,
    // `null` when there is nothing to judge — NOT `true`. An unmeasured law must
    // never read as a passing one; that is the failure mode this module exists
    // to remove, and defaulting to "meeting target" would recreate it exactly.
    meetsTarget: med == null ? null : med <= P6_TARGET_SEC,
    idleSkipped: sessions.reduce((n, s) => n + (s.idleSkipped || 0), 0),
  };
}
