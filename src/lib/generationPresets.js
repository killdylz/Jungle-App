// ─── Generation presets (backlog D4, spec §9.3) ──────────────────────────────
//
// WHY THIS EXISTS
// §9.3's rule is that a coach PICKS, never prompts: asking a trainer to write
// "upper hypertrophy, week 3 of 6, 45 minutes" into a text box is the same
// category of error as showing them a confidence percentage. It makes the coach
// do the model's translation work, and it makes the output unreproducible —
// two coaches asking for the same thing in different words get different
// classes, and neither can say why.
//
// A preset is the alternative: a NAMED, REUSABLE INTENT ("heavier day", "engine
// day", "short class") that resolves to a deterministic transformation of the
// coach's own blueprint. No model, no network, works with Supabase off. The
// structure is still the coach's; a preset only changes the emphasis WITHIN it.
//
// ── The rule that keeps this honest ──────────────────────────────────────────
// A preset may REORDER a slot's categories. It may never ADD one.
//
// `deriveBlueprint` orders each slot's categories by how much of that slot each
// one actually accounts for, and `draftFromBlueprint` reads that order as
// priority. So biasing a slot toward strength promotes strength only where the
// coach already programs strength in that slot. Without this rule, "heavier
// day" would put a deadlift in the warm-up — which is not a hypothetical: it is
// the exact bug the category ordering in blueprints.js was written to fix.
//
// Everything a preset does is therefore arithmetic on the coach's own shape, and
// `describePresetEffect` states it in numbers before they commit.

// Bounds, so a preset cannot produce a class no room could run.
const MIN_SLOT_MINUTES = 2;
const MIN_MOVEMENTS = 1;
const MAX_MOVEMENTS = 8;

/**
 * The presets themselves.
 *
 * `bias`          category promoted to the front of any slot that ALREADY has it
 * `movementDelta` movements added to / removed from each slot
 * `minutesScale`  proportional change to every slot's length
 * `avoidRecent`   how many recent drafts to treat as already-used, so a repeat
 *                 press does not hand back the same class
 *
 * Named for what a coach would say out loud, not for the knob each one turns.
 */
export const GENERATION_PRESETS = [
  {
    key: "usual",
    name: "The usual",
    body: "Your shape, filled with the movements you reach for most.",
    bias: null, movementDelta: 0, minutesScale: 1, avoidRecent: 0,
  },
  {
    key: "fresh",
    name: "Something different",
    body: "The same class, built from movements you haven't drafted lately.",
    bias: null, movementDelta: 0, minutesScale: 1, avoidRecent: 8,
  },
  {
    key: "heavy",
    name: "Heavier day",
    body: "Leans on the strength work you already program, with fewer movements to a block.",
    bias: "strength", movementDelta: -1, minutesScale: 1, avoidRecent: 0,
  },
  {
    key: "engine",
    name: "Engine day",
    body: "Leans on conditioning, with more movements to a block and less rest between them.",
    bias: "conditioning", movementDelta: 1, minutesScale: 1, avoidRecent: 0,
  },
  {
    key: "short",
    name: "Short class",
    body: "The same shape compressed — every block trimmed, nothing dropped.",
    bias: null, movementDelta: -1, minutesScale: 0.65, avoidRecent: 0,
  },
];

export function presetByKey(key) {
  return GENERATION_PRESETS.find(p => p.key === key) || null;
}

// Total length of a blueprint, in minutes.
export function blueprintMinutes(blueprint) {
  return (blueprint?.slots || []).reduce((n, s) => n + (Number(s.minutes) || 0), 0);
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Apply a preset to a blueprint, returning a NEW blueprint. The original is
 * never mutated — a preset is a way to draft, not an edit to the coach's shape,
 * and blurring the two is how a "try heavier this week" click would quietly
 * rewrite the format they have used for years.
 */
export function applyPreset(blueprint, preset) {
  if (!blueprint || !blueprint.slots) return blueprint;
  if (!preset) return blueprint;

  const slots = blueprint.slots.map(s => {
    const cats = [...(s.categories || [])];
    // Promote, never introduce. See the header note.
    if (preset.bias && cats.includes(preset.bias)) {
      cats.splice(cats.indexOf(preset.bias), 1);
      cats.unshift(preset.bias);
    }
    return {
      ...s,
      categories: cats,
      movementCount: clamp(
        (Number(s.movementCount) || 1) + (preset.movementDelta || 0),
        MIN_MOVEMENTS, MAX_MOVEMENTS),
      minutes: Math.max(
        MIN_SLOT_MINUTES,
        Math.round((Number(s.minutes) || 0) * (preset.minutesScale ?? 1))),
    };
  });

  // `source` is carried through untouched. A preset-drafted class must not mark
  // the coach's blueprint as "edited" — that flag is what stops re-derivation
  // from overwriting their decisions, and spending it on a drafting choice would
  // freeze whatever shape happened to be current when they first tried one.
  return { ...blueprint, slots };
}

/**
 * The drafting options this preset implies, for `draftFromBlueprint`.
 * `recent` is the coach's generation history, newest first.
 */
export function presetDraftOpts(preset, { classType = "", recent = [] } = {}) {
  const n = preset?.avoidRecent || 0;
  return { classType, recent: n ? (recent || []).slice(0, n) : [] };
}

/**
 * What this preset will actually do to THIS blueprint, in numbers, before the
 * coach commits to it. A preset that cannot say what it changes is a prompt with
 * a nicer name.
 *
 * Returns "" when the preset changes nothing measurable — the caller shows the
 * preset's own description instead of an empty-sounding "no change".
 */
export function describePresetEffect(preset, blueprint) {
  if (!preset || !blueprint?.slots?.length) return "";
  const after = applyPreset(blueprint, preset);
  const bits = [];

  const beforeMin = blueprintMinutes(blueprint);
  const afterMin = blueprintMinutes(after);
  if (beforeMin && afterMin !== beforeMin) bits.push(`${beforeMin} → ${afterMin} min`);

  const beforeMoves = blueprint.slots.reduce((n, s) => n + (Number(s.movementCount) || 1), 0);
  const afterMoves = after.slots.reduce((n, s) => n + (Number(s.movementCount) || 1), 0);
  if (afterMoves !== beforeMoves) {
    bits.push(`${beforeMoves} → ${afterMoves} movement${afterMoves === 1 ? "" : "s"}`);
  }

  // Only count slots where the bias could actually bite. Saying "leans strength"
  // over a blueprint with no strength in it would be a claim the draft cannot
  // keep — and the coach would see it broken on the very next screen.
  if (preset.bias) {
    const n = blueprint.slots.filter(s => (s.categories || []).includes(preset.bias)).length;
    if (n) bits.push(`${preset.bias} first in ${n} block${n === 1 ? "" : "s"}`);
  }

  if (preset.avoidRecent) bits.push(`avoids your last ${preset.avoidRecent} drafts`);

  return bits.join(" · ");
}

// The title a drafted class is saved under. Reads as something a coach wrote,
// not as a function call — this string ends up in their plan list forever.
export function presetDraftTitle(classType, preset) {
  const ct = (classType || "Class").trim() || "Class";
  if (!preset || preset.key === "usual") return `${ct} — from your class shape`;
  return `${ct} — ${preset.name.toLowerCase()}`;
}
