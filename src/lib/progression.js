// ─── PT progression maths (PT9 / PT11) ───────────────────────────────────────
//
// Pure functions, no I/O, no imports beyond the movement taxonomy (itself pure).
//
// WHY EVERY FUNCTION HERE RETURNS ITS WORKING
//
// `retention.js` states the rule this module inherits: at-risk v1 is arithmetic,
// not a model, because "an operator has to trust the rule enough to phone a
// member about it, and a lawyer has to be able to read it". PT raises that bar
// rather than lowering it — a trainer has to trust a suggestion enough to PUT
// THAT WEIGHT ON A BAR WITH A HUMAN UNDER IT.
//
// And PT analytics is the richest available source of confident wrong numbers.
// Every competitor ships them: a 1RM projected from a set of twenty, "you're 12%
// stronger" drawn through three points, a body-fat percentage computed from
// calipers. The product rule is that a confident wrong number is worse than no
// number, so:
//
//   · every estimate carries the SET it came from and the formula's name;
//   · every gate returns a REASON the UI can print, never a silent null;
//   · nothing here computes a percentage without also returning its denominator;
//   · there is deliberately NO totalVolume() and NO bodyFat(). See below.
//
// The return shape is uniform and deliberately not a bare number:
//   { ok: true,  value, unit, method, basis }
//   { ok: false, reason, need? , have? }
// so a caller cannot accidentally render a gated result as a value. `reason` is
// a stable key; the UI owns the wording (U1 — no raw enum reaches a coach).

// classifyMovement, NOT categoryOf. categoryOf takes a movement OBJECT from the
// persona catalogue ({name, equip, meta}) and reads a coach's override off
// `meta.category`; a set log carries a NAME. Passing the name to categoryOf
// returns "" for everything and every chart silently reads "uncategorised" —
// which looks like a taxonomy gap rather than a call-site bug, so it would have
// been fixed in the wrong file.
import { classifyMovement } from "./movementTaxonomy.js";

// Local calendar days, not 24-hour periods. Same reasoning as retention.js's own
// `daysBetween`, which is private to that module; duplicated here rather than
// exported from it so this file stays importable by the client bundle without
// pulling the retention rules along. The datum is a date and the reader is a
// human with a calendar.
const DAY_MS = 86400000;
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
export const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);

// ── Which set logs may be reasoned about at all ─────────────────────────────
// A superseded row is history, not truth. Everything below reads through this.
export const liveLogs = logs => (logs || []).filter(l => l && !l.voided);

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── e1RM ─────────────────────────────────────────────────────────────────────
//
// Epley, adjusted for reps left in reserve: a set of 5 at RIR 3 is an eight-rep
// effort, and treating it as a five-rep effort under-reads the lift badly.
//
//   e1RM = load × (1 + (reps + RIR) / 30)
//
// THE GATES, and why each one exists rather than being a nicety:
//
//   reps ≤ 10          Every rep-max formula is a straight-line fit to a curve.
//                      They agree within ~2% at five reps and diverge past ten;
//                      at twenty, Epley and Brzycki differ by more than 20% and
//                      neither is right. A number nobody can defend is worse
//                      than the set itself, which the UI can always show.
//
//   an effort marker   RIR or RPE must be PRESENT. Without one, a set of 5 might
//                      have been near failure or trivially easy, and those imply
//                      one-rep maxes tens of kilos apart. This is the gate most
//                      products skip, and it is the one that makes the rest
//                      meaningless when it is missing.
//
//   RIR ≤ 3            Further from failure than that and the extrapolation is
//                      doing more work than the observation.
export const E1RM_MAX_REPS = 10;
export const E1RM_MAX_RIR = 3;

export function estimate1RM(log) {
  const loadKg = num(log?.loadKg);
  const reps = num(log?.reps);
  // RPE and RIR are two spellings of the same observation; a trainer's app
  // offers one or the other and the maths must not care which was recorded.
  const rir = num(log?.rir) ?? (num(log?.rpe) == null ? null : 10 - num(log.rpe));

  if (loadKg == null || loadKg <= 0) return { ok: false, reason: "no-load" };
  if (reps == null || reps < 1) return { ok: false, reason: "no-reps" };
  if (reps > E1RM_MAX_REPS) {
    return { ok: false, reason: "reps-too-high", have: reps, need: E1RM_MAX_REPS };
  }
  if (rir == null) return { ok: false, reason: "no-effort-marker" };
  if (rir < 0) return { ok: false, reason: "no-effort-marker" };
  if (rir > E1RM_MAX_RIR) {
    return { ok: false, reason: "too-far-from-failure", have: rir, need: E1RM_MAX_RIR };
  }

  const effectiveReps = reps + rir;
  const value = loadKg * (1 + effectiveReps / 30);
  return {
    ok: true,
    // Rounded to 0.1 kg. More precision would be a claim about the arithmetic
    // that the input — a trainer's judgement of RIR — cannot support.
    value: Math.round(value * 10) / 10,
    unit: "kg",
    method: "Epley, RIR-adjusted",
    // The set that produced it, so the UI can print "from 5 × 100 kg @ RIR 2"
    // instead of asserting a maximum nobody performed.
    basis: { reps, loadKg, rir, effectiveReps },
  };
}

/**
 * The best defensible e1RM across a history, plus how many sets were skipped and
 * why. The skipped count is not diagnostic noise: "best estimate 142 kg" reads
 * very differently from "best estimate 142 kg, from 3 of your 47 logged sets",
 * and the second is the honest one.
 */
export function bestEstimate1RM(logs) {
  const live = liveLogs(logs);
  if (!live.length) return { ok: false, reason: "no-sets" };

  let best = null;
  const skipped = {};
  for (const log of live) {
    const e = estimate1RM(log);
    if (!e.ok) { skipped[e.reason] = (skipped[e.reason] || 0) + 1; continue; }
    if (!best || e.value > best.value) best = { ...e, log };
  }
  if (!best) return { ok: false, reason: "no-eligible-sets", skipped, considered: live.length };
  return { ...best, considered: live.length, usable: live.length - Object.values(skipped).reduce((a, b) => a + b, 0), skipped };
}

// ── Volume ───────────────────────────────────────────────────────────────────
//
// 🔴 THERE IS DELIBERATELY NO totalVolume(). Summing kg×reps across a back squat
// and a band pull-apart produces a number that goes up when a session gets
// easier, and a trainer who acts on it programs the wrong week. Volume is
// reported PER MOVEMENT and PER CATEGORY, and the absence of the aggregate is
// the feature. If one is ever added, it needs an argument in a commit message,
// not a convenience wrapper.
//
// Bodyweight and timed work carry no load; they contribute sets and reps and
// contribute nothing to kg, rather than being counted as zero-kg lifts that drag
// an average down.

const emptyBucket = () => ({ kg: 0, sets: 0, reps: 0, loadedSets: 0 });

function accumulate(bucket, log) {
  const reps = num(log.reps) ?? 0;
  const loadKg = num(log.loadKg);
  bucket.sets += 1;
  bucket.reps += reps;
  if (loadKg != null && loadKg > 0 && reps > 0) {
    bucket.kg += loadKg * reps;
    bucket.loadedSets += 1;
  }
  return bucket;
}

export function volumeByMovement(logs) {
  const out = new Map();
  for (const log of liveLogs(logs)) {
    const key = log.movement || "";
    if (!key) continue;
    accumulate(out.get(key) || out.set(key, emptyBucket()).get(key), log);
  }
  return out;
}

export function volumeByCategory(logs) {
  const out = new Map();
  for (const log of liveLogs(logs)) {
    // classifyMovement returns "" for a name the deterministic rules do not
    // recognise. Bucketed under "uncategorised" rather than dropped: a category
    // chart that silently omits a third of the work is the same lie as a wrong
    // total, and the visible bucket is what prompts someone to fix the taxonomy.
    //
    // `equip` is passed when the log has it — the taxonomy's rules read it, and
    // omitting it makes a barbell row and a machine row classify identically.
    const key = classifyMovement(log.movement || "", log.equip || "") || "uncategorised";
    accumulate(out.get(key) || out.set(key, emptyBucket()).get(key), log);
  }
  return out;
}

// ── Personal bests ───────────────────────────────────────────────────────────
//
// Resolved through the persona movement catalogue's aliases. "Back Squat" and
// "Backsquat" are one movement, and a PB every session because the spelling
// changed is a bug the client would proudly show their trainer.
//
// `canonical` is injected rather than imported so this stays usable in the
// client bundle, which has no persona catalogue of its own.
export function personalBests(logs, canonical = n => n) {
  const out = new Map();
  for (const log of liveLogs(logs)) {
    const name = canonical(log.movement || "");
    if (!name) continue;
    const loadKg = num(log.loadKg);
    const reps = num(log.reps);
    if (loadKg == null || loadKg <= 0 || reps == null || reps < 1) continue;

    const prev = out.get(name);
    // Heaviest load first, then most reps at that load. A heavier single is a
    // PB over a lighter triple; ten reps at the same weight is a PB over eight.
    const better = !prev || loadKg > prev.loadKg || (loadKg === prev.loadKg && reps > prev.reps);
    if (better) out.set(name, { movement: name, loadKg, reps, at: log.performedAt ?? null, logId: log.id ?? null });
  }
  return out;
}

// ── Adherence ────────────────────────────────────────────────────────────────
//
// Both numerals, always. A percentage without its denominator is the defect
// lib/cohorts.js exists to prevent — 100% from two planned sessions and 100%
// from forty are the same number and not the same fact.
export const ADHERENCE_MIN_SESSIONS = 4;

export function adherence(sessions) {
  const all = (sessions || []).filter(Boolean);
  const counted = all.filter(s => s.status !== "cancelled");   // a cancellation is not a miss
  const delivered = counted.filter(s => s.status === "delivered").length;
  const planned = counted.length;

  if (planned === 0) return { ok: false, reason: "nothing-planned", delivered: 0, planned: 0 };

  const pct = Math.round((delivered / planned) * 100);
  return {
    ok: true,
    value: pct,
    unit: "%",
    delivered,
    planned,
    // Not a gate on rendering — the fraction is always honest — but a flag the
    // UI uses to refuse the PERCENTAGE and show "3 of 4" instead. The numbers
    // are the truth; the percentage is the part that over-claims.
    confident: planned >= ADHERENCE_MIN_SESSIONS,
    method: "delivered ÷ (planned − cancelled)",
  };
}

// ── Trend ────────────────────────────────────────────────────────────────────
//
// "You're 12% stronger" drawn through three points is the single most-shipped
// lie in fitness software. Below the minimum this says what is missing, in the
// same shape `cohortModel` uses — state the gap, do not draw the shape.
export const TREND_MIN_POINTS = 4;

export function trend(points, { minPoints = TREND_MIN_POINTS } = {}) {
  const clean = (points || [])
    .filter(p => p && num(p.value) != null && p.at != null)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  if (clean.length < minPoints) {
    return { ok: false, reason: "not-enough-data", have: clean.length, need: minPoints };
  }

  const first = clean[0], last = clean[clean.length - 1];
  const spanDays = daysBetween(last.at, first.at);
  // Two points on the same day are not a trend however many there are of them.
  if (spanDays < 1) return { ok: false, reason: "no-time-span", have: clean.length, need: minPoints };

  const delta = last.value - first.value;
  // A percentage change from a zero or negative baseline is undefined, not zero.
  const pct = first.value > 0 ? Math.round((delta / first.value) * 1000) / 10 : null;

  return {
    ok: true,
    value: delta,
    pct,
    unit: first.unit || "",
    points: clean.length,
    spanDays,
    from: first.value,
    to: last.value,
    method: `first vs last of ${clean.length} points over ${spanDays} days`,
  };
}

// ── Next-load suggestion (PT11) ──────────────────────────────────────────────
//
// Double progression: work up the rep range at a fixed load, then add weight and
// drop back to the bottom of the range. Deterministic, and it returns the
// numbers that produced it so the trainer can disagree with the reasoning rather
// than only with the answer.
//
// 🔴 A SUGGESTION, NEVER AN ASSIGNMENT. Nothing here writes a prescription. The
// trainer approves, exactly as they approve a generated class — same
// coach-approval gate, higher stakes.
export const DEFAULT_INCREMENT_KG = 2.5;

export function suggestNextLoad({ lastSets, repTarget, incrementKg = DEFAULT_INCREMENT_KG, rirTarget = 2 } = {}) {
  const sets = liveLogs(lastSets);
  if (!sets.length) return { ok: false, reason: "no-history" };

  const top = num(repTarget?.max);
  const bottom = num(repTarget?.min);
  if (top == null || bottom == null) return { ok: false, reason: "no-rep-target" };

  const loads = sets.map(s => num(s.loadKg)).filter(v => v != null && v > 0);
  if (!loads.length) return { ok: false, reason: "no-load" };
  // The working load, not the average: a warm-up set logged against the same
  // movement would drag a mean down and quietly suggest deloading someone.
  const workingLoad = Math.max(...loads);

  const atLoad = sets.filter(s => num(s.loadKg) === workingLoad);
  const reps = atLoad.map(s => num(s.reps)).filter(v => v != null);
  if (!reps.length) return { ok: false, reason: "no-reps" };

  const minReps = Math.min(...reps);
  const rirs = atLoad.map(s => num(s.rir) ?? (num(s.rpe) == null ? null : 10 - num(s.rpe)))
                     .filter(v => v != null);
  // Unknown effort is not assumed to be hard OR easy. Without it, hold — the
  // conservative reading, and the one that does not add weight to a bar on the
  // strength of a missing field.
  const hardEnough = rirs.length ? Math.min(...rirs) <= rirTarget : null;

  const basis = { workingLoad, setsAtLoad: atLoad.length, minReps, repTarget: { min: bottom, max: top }, rirObserved: rirs.length ? Math.min(...rirs) : null };

  if (minReps >= top && hardEnough !== false) {
    return {
      ok: true, action: "increase",
      value: Math.round((workingLoad + incrementKg) * 10) / 10, unit: "kg",
      method: `all sets hit ${top} reps at ${workingLoad} kg — add ${incrementKg} kg and return to ${bottom}`,
      basis,
    };
  }
  if (minReps < bottom) {
    return {
      ok: true, action: "hold",
      value: workingLoad, unit: "kg",
      method: `${minReps} reps is below the ${bottom}-rep floor — hold ${workingLoad} kg`,
      basis,
    };
  }
  return {
    ok: true, action: "hold",
    value: workingLoad, unit: "kg",
    method: `${minReps} reps is inside ${bottom}–${top} — hold ${workingLoad} kg and add reps`,
    basis,
  };
}

// ── What is deliberately absent ──────────────────────────────────────────────
//
// bodyFatPercent()  — caliper and bioimpedance arithmetic presented as a
//                     measurement. `measurements` has no body_fat_pct column for
//                     the same reason. Record what was measured; a derived
//                     percentage is the gym's to state, not ours to compute.
// totalVolume()     — see volumeByMovement.
// readiness()/strain() — a single wellness score from sleep and soreness
//                     self-reports is a number with no unit and no validation,
//                     and it is the one clients screenshot.
