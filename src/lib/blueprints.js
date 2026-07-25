// ─── Class Blueprints (workstream D, spec §9.1) ──────────────────────────────
// A coach's FORMAT is the most stable and most valuable thing they know about
// their own programming — "my S360 is a warm-up, a primary lift, two supersets
// and a finisher, in that order" — and until now there was nowhere to say it.
// Structure was whatever extraction happened to produce, and generation mimicked
// it statistically.
//
// A Blueprint makes that sentence an object: derived from the coach's own corpus,
// PRESENTED as a starting point, and owned by them thereafter. The derivation is
// a convenience, not an authority (§9.1) — an edited blueprint is never silently
// regenerated over, and when the corpus later disagrees the contradiction is
// SURFACED rather than reconciled (§13 Q7, settled 2026-07-19).
//
// Pure functions, no I/O. Persisted under coach_personas.style_profile.blueprints
// keyed by class type — that column already exists and already syncs, so this
// needed no migration.

import { mode, median } from "./personaAggregate.js";
import { CATEGORIES, categoryOf } from "./movementTaxonomy.js";

// A blueprint's provenance. `edited` is load-bearing: it is the flag that stops
// re-derivation from overwriting a coach's decision.
export const BLUEPRINT_SOURCES = ["recommended", "preset", "edited"];

// House block lengths, mirroring ROLE_DUR_SEC in App.jsx. Used as the STARTING
// value for a slot's minutes, never presented as something learned from the
// coach — see the note on `minutes` in deriveBlueprint.
const ROLE_MINUTES = { warmup: 5, primary_lift: 15, superset: 10, circuit: 10, finisher: 8, cooldown: 5, recovery: 5 };

// Block labels carry a stable prefix and a per-class suffix: "M1 — Deadlift" and
// "M1 — Squat" are the same slot in two different weeks. Keep the prefix so they
// collapse; bare labels ("Warm Up", GC's "C1") pass through untouched.
//
// The separator must be a SPACED dash: "Cool-down" is one word, not a slot with
// a suffix.
export function slotKey(label) {
  const t = (label || "").trim();
  if (!t) return "";
  return t.split(/\s+[—–-]\s+|:\s*/)[0].trim() || t;
}

const seqOf = plan => (plan?.blocks || []).map(b => slotKey(b.label)).filter(Boolean);

// Identity of a sequence, for grouping and comparison.
//
// Deliberately JSON, never a delimited string. Slot keys legitimately contain
// spaces and punctuation ("Warm Up", "A1 + A2"), so any single-character
// delimiter is one movement name away from shredding a key on the way back out.
// An earlier draft of this joined on a space and split "Warm Up" into two slots.
const seqId = seq => JSON.stringify(seq);

// Derive the shape of a coach's class type from their corpus.
//
// Plans differ in length and in whether an optional block ran, so rather than
// trying to align them positionally (which invents correspondences that are not
// in the data) this takes the MODAL SEQUENCE: the exact shape the most plans
// follow. That is both simpler and honest — the returned `matched` / `total`
// let the UI say "the shape 6 of your 8 classes follow" instead of implying the
// blueprint describes all of them.
//
// Returns null when there is nothing to derive from; the caller offers presets.
export function deriveBlueprint(plans, classType, catalog = []) {
  const ctPlans = (plans || []).filter(pl => ((pl.classType || "").trim() || "Uncategorized") === classType);
  const seqs = ctPlans.map(pl => seqOf(pl.plan)).filter(s => s.length);
  if (!seqs.length) return null;

  // Most common exact shape. Ties break toward the longer sequence: a coach who
  // sometimes skips the finisher still programs the finisher.
  const counts = new Map();
  seqs.forEach(s => {
    const k = seqId(s);
    counts.set(k, { seq: s, n: ((counts.get(k) || {}).n || 0) + 1 });
  });
  let best = null;
  counts.forEach(entry => {
    if (best === null) { best = entry; return; }
    if (entry.n > best.n || (entry.n === best.n && entry.seq.length > best.seq.length)) best = entry;
  });
  const keys = best.seq;
  const bestN = best.n;
  const bestId = seqId(keys);

  // Aggregate each slot over ONLY the plans that follow this shape — mixing in
  // plans of a different shape would attribute one slot's scheme to another.
  const matching = ctPlans.filter(pl => seqId(seqOf(pl.plan)) === bestId);
  const slots = keys.map((key, i) => {
    const blocks = matching.map(pl => (pl.plan?.blocks || [])[i]).filter(Boolean);
    const role = mode(blocks.map(b => b.role).filter(Boolean)) || "circuit";
    const catCount = new Map();
    blocks.forEach(b => (b.exercises || []).forEach(ex => {
      // Resolve through the catalog first so a coach's category override on a
      // movement flows into the slot that movement lives in.
      const row = (catalog || []).find(m => (m.name || "").toLowerCase() === (ex.name || "").trim().toLowerCase());
      const cat = categoryOf(row || { name: ex.name, equip: ex.equip });
      if (cat) catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }));
    return {
      key,
      // The KEY, deliberately — not the modal full label. A slot is the part of
      // the class that recurs; the full label carries that week's focus
      // ("M1 — Deadlift"), and naming the slot after it bakes one week into the
      // shape and reads as a lie next week when it is a squat. Found by driving
      // the real corpus. The coach can rename it to whatever they call it.
      label: key,
      role,
      // NOT derived. Blocks carry no duration — only occasional prose in
      // scheme.note ("8-min AMRAP") hints at one, and parsing that would be a
      // guess dressed as data. This is a house default the coach can change.
      minutes: ROLE_MINUTES[role] || 10,
      movementCount: median(blocks.map(b => (b.exercises || []).length)) || 1,
      schemeDefault: mode(blocks.map(b => b.scheme && b.scheme.type).filter(Boolean)) || "",
      // ORDERED BY PREVALENCE IN THIS SLOT, most common first — the order is
      // load-bearing, not cosmetic. A real warm-up block contains the odd
      // strength-ish movement ("Banded Good Morning"), so a slot's category set
      // is legitimately broad; ranking by prevalence is what stops "broad" from
      // becoming "anything goes". Drafting reads this order as priority, so the
      // warm-up fills with warm-ups and only reaches for the rest to top up.
      // Found by driving it: the first draft put a deadlift in the warm-up.
      // CATEGORIES order breaks ties, so the result stays deterministic.
      categories: [...catCount.keys()].sort((a, b) =>
        (catCount.get(b) - catCount.get(a)) || (CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))),
    };
  });

  return { classType, name: classType, source: "recommended", slots,
           matched: bestN, total: ctPlans.length };
}

// Re-derive without ever clobbering a coach's decision (§13 Q7). An edited
// blueprint is returned untouched; the freshly derived shape rides along as
// `contradiction` ONLY when it actually differs, so the UI can surface the drift
// and let the coach choose. Never auto-applied.
export function reconcileBlueprint(existing, derived) {
  if (!existing) return derived;
  if (existing.source !== "edited") return derived || existing;
  if (!derived) return existing;
  const same = seqId(existing.slots.map(s => s.key)) === seqId(derived.slots.map(s => s.key));
  return same ? existing : { ...existing, contradiction: derived };
}

// ── Cold-start presets (§9.1, backlog D3) ────────────────────────────────────
// A coach with no corpus otherwise faces an empty screen, which is exactly when
// they decide whether this product is for them. Presets are PICKED, not
// prompted (§9.3) — asking a trainer to write a prompt is the same category of
// error as showing them a confidence percentage.
const slot = (key, label, role, movementCount, schemeDefault, categories) =>
  ({ key, label, role, minutes: ROLE_MINUTES[role] || 10, movementCount, schemeDefault, categories });

export const BLUEPRINT_PRESETS = [
  { name: "Strength", source: "preset", slots: [
    slot("Warm-up", "Warm-up",      "warmup",       4, "time",      ["warmup", "mobility"]),
    slot("M1",      "Primary lift", "primary_lift", 1, "sets_reps", ["strength"]),
    slot("A1+A2",   "Superset",     "superset",     2, "rounds",    ["strength", "core"]),
    slot("B1+B2",   "Superset",     "superset",     2, "rounds",    ["strength", "core"]),
    slot("Finish",  "Finisher",     "finisher",     2, "amrap",     ["conditioning"]),
  ] },
  { name: "Circuit", source: "preset", slots: [
    slot("C1", "Warm-up",   "warmup",   4, "time",  ["warmup", "mobility"]),
    slot("C2", "Circuit 1", "circuit",  5, "amrap", ["conditioning", "core"]),
    slot("C3", "Circuit 2", "circuit",  5, "amrap", ["conditioning", "core"]),
    slot("CD", "Cool-down", "cooldown", 3, "time",  ["cooldown", "mobility"]),
  ] },
  // Hyrox is a FORMAT, which is exactly why it is a preset and not a movement
  // category (§13 Q8). This is the home HYROX_STATIONS was kept for.
  { name: "Endurance / Hyrox", source: "preset", slots: [
    slot("Warm-up",  "Warm-up",      "warmup",   4, "time",     ["warmup", "mobility"]),
    slot("Stations", "Station work", "circuit",  4, "interval", ["conditioning"]),
    slot("Engine",   "Engine",       "circuit",  3, "interval", ["conditioning"]),
    slot("CD",       "Cool-down",    "cooldown", 3, "time",     ["cooldown", "mobility"]),
  ] },
];

// ── Deterministic drafting ───────────────────────────────────────────────────
// Fill a fixed structure from the coach's OWN catalog. No model involved: the
// structure is the coach's, the movements are the coach's, and the selection is
// arithmetic. This is §9.3's division of labour taken to its conclusion — and
// unlike the persona-ai path it works with Supabase off.
//
// Emits the same { blocks:[...] } shape as a parsed plan, so it feeds the
// existing planToStages() untouched.
export function draftFromBlueprint(blueprint, catalog = [], opts = {}) {
  if (!blueprint || !blueprint.slots || !blueprint.slots.length) return { blocks: [] };
  const classType = opts.classType || blueprint.classType;
  const recent = opts.recent || [];
  // Movements recommended recently, so a second draft is not the first again.
  const stale = new Set(recent.flatMap(g => g.movements || []).map(n => (n || "").toLowerCase()));
  const used = new Set();

  const blocks = blueprint.slots.map(s => {
    const want = Math.max(1, Number(s.movementCount) || 1);
    const pool = (catalog || [])
      .filter(m => {
        const cat = categoryOf(m);
        // No category at all means we do not know what it is — putting it in a
        // slot would be exactly the confident wrong guess the taxonomy exists to
        // avoid. It stays out until the coach categorises it.
        if (!cat) return false;
        if ((s.categories || []).length && !s.categories.includes(cat)) return false;
        return !used.has((m.name || "").toLowerCase());
      })
      .sort((a, b) => {
        // Category fit FIRST. slot.categories is ordered by how much of this
        // slot each category actually accounts for, so a warm-up slot fills
        // with warm-ups before it reaches for the strength movement that
        // happens to be legal in it. Without this the slot's broadest category
        // wins on alphabetical order alone — which is how a deadlift ended up
        // in a warm-up.
        const cats = s.categories || [];
        const ai = cats.indexOf(categoryOf(a)), bi = cats.indexOf(categoryOf(b));
        if (ai !== bi) return ai - bi;
        const aStale = stale.has((a.name || "").toLowerCase()) ? 1 : 0;
        const bStale = stale.has((b.name || "").toLowerCase()) ? 1 : 0;
        if (aStale !== bStale) return aStale - bStale;                  // fresh first
        const an = (a.classTypes || {})[classType] || 0;
        const bn = (b.classTypes || {})[classType] || 0;
        return bn - an || (a.name || "").localeCompare(b.name || "");   // then most-used
      });
    const picked = pool.slice(0, want);
    picked.forEach(m => used.add((m.name || "").toLowerCase()));
    // A slot the catalog cannot fill emits an EMPTY block, not an out-of-category
    // one. The coach sees a gap they can fill; a wrong movement they might not.
    return {
      label: s.label || s.key,
      role: s.role || "circuit",
      // The slot's own length rides along. Without it the coach's minutes were
      // write-only: ClassShapeCard has always let them set a warm-up to 8
      // minutes, and the drafted class came back with the house 5 because
      // planToStages fell through to a per-role default. A block that carries no
      // minutes still does, so parsed plans are unaffected.
      ...(Number(s.minutes) > 0 ? { minutes: Number(s.minutes) } : {}),
      scheme: s.schemeDefault ? { type: s.schemeDefault } : {},
      exercises: picked.map(m => ({ name: m.name, equip: m.equip || "", reps: "" })),
    };
  });
  return { blocks };
}
