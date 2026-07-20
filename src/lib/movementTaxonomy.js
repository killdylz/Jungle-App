// ─── Movement taxonomy (workstream D, spec §9.2) ─────────────────────────────
// The parser recognises STRUCTURE but not MEANING: it can pull "Back Squat" out
// of "M1 Back Squat 5x5 @ RIR 2" and infer `barbell`, but nothing tells it that a
// back squat is a strength lift and a sled push is a Hyrox station. This module
// is that missing layer. Pure functions, no imports.
//
// It is the foundation three things stand on:
//   • blueprint slot filters (§9.1) — "fill this slot from `warmup`/`mobility`"
//   • a sharper classCategory (personaAggregate.js)
//   • "no ergs in a strength block" enforced STRUCTURALLY, not by asking a model
//     nicely in a prompt.
//
// Three layers, in order of authority (§9.2): deterministic rules (here) → the
// coach's override in the movement catalog → an LLM fallback for genuinely
// unknown names, batched (not yet built — the blanks have to accumulate first).

// The legal category set, pinned in ONE place. This repo's recurring data-loss
// bug is a constrained column rejecting a client value (three occurrences), so
// nothing anywhere else may spell these strings inline — import CATEGORIES.
// A unit test asserts these exact contents.
export const CATEGORIES = ["warmup", "mobility", "strength", "conditioning", "core", "cooldown"];

// Hyrox is a FORMAT, not a property of a movement (§13 Q8, settled 2026-07-19).
// There is deliberately no `hyrox` category: a circuit class can use a sled or a
// farmers carry without being Hyrox in any sense, so tagging the movement with
// the format would mislabel every ordinary circuit that owns a sled. A sled push
// is a loaded carry whoever is pushing it — it classifies as `conditioning`.
//
// The station list still matters, because the format is real; it just belongs to
// the Hyrox blueprint PRESET (§9.1), not to the movement taxonomy. Exported here
// so that preset reuses this list rather than redefining it and drifting.
//
// NOTE: §9.2's prose lists "run" as a station and omits Wall Balls. The actual
// race is 8 × 1km run BETWEEN eight stations — the run is the connective tissue,
// not a station — and the eighth station is Wall Balls. Corrected here; the spec
// prose should follow.
export const HYROX_STATIONS = [
  "Ski Erg", "Sled Push", "Sled Pull", "Burpee Broad Jump",
  "Row", "Farmers Carry", "Sandbag Lunge", "Wall Balls",
];

// ORDER IS LOAD-BEARING, exactly as in inferEquip's EQUIP_RULES — the more
// specific claim must be tested before the more general one, or the general rule
// eats it.
const CATEGORY_RULES = [
  // ── Loaded carries and sled work → conditioning ────────────────────────────
  // These are the movements a Hyrox class is built from, but they are NOT tagged
  // with the format: a circuit class can own a sled without being Hyrox, and a
  // farmers carry is a loaded carry whoever is carrying it. See HYROX_STATIONS.
  //
  // They need their own rule rather than falling through, for two reasons:
  // "Sandbag Lunge" would otherwise be eaten by the generic `lunge` in the
  // strength rule below, and "Sled Push" / "Farmers Carry" match nothing at all
  // in the general conditioning rule and would come back blank.
  [/\b(?:sled\s*(?:push|pull|drag)|prowler\s*push)\b/i, "conditioning"],
  [/\b(?:farmer'?s?\s*(?:carry|walk|hold)|suitcase\s*carry|yoke\s*(?:carry|walk))\b/i, "conditioning"],
  [/\bsandbag\s*(?:lunge|carry|clean|over\s*shoulder)\b/i, "conditioning"],

  // ── Cool-down / mobility: checked before strength, because "Couch Stretch"
  // and "Hamstring Floss" must not be read as leg work. ──────────────────────
  // Three passes, narrowest first, because mobility and cool-down genuinely
  // overlap and the tie has to be broken deliberately rather than by accident of
  // ordering:
  //   1. unambiguous cool-down acts (rolling, breathing, floor rest)
  //   2. named mobility drills — "World's Greatest Stretch" is a warm-up flow,
  //      not a cool-down, and the generic `stretch` rule would swallow it
  //   3. everything else that reads as a stretch → cool-down
  // "Thoracic Foam Roll" lands cooldown via (1); "Thoracic CAR" lands mobility
  // via (2). Following the corpus in data/library.js, which files rolling under
  // cooldown.
  [/\b(?:foam\s*roll|breath(?:e|ing)|child'?s\s*pose|savasana|cool\s*down|cooldown)\b/i, "cooldown"],
  [/\b(?:mobility|cars?\b|90\/90|floss|banded\s*(?:distraction|opener)|thoracic|ankle\s*rock|world'?s\s*greatest)\b/i, "mobility"],
  [/\b(?:stretch|pigeon)\b/i, "cooldown"],

  // ── Warm-up / activation ───────────────────────────────────────────────────
  // `primer` is deliberately absent: "1st set as primer" is a coaching qualifier
  // foldScheme already lifts into the block note, and matching it here let a
  // stray modifier acquire a category and ride into the catalog as a movement.
  [/\b(?:warm\s*up|warmup|activation|band\s*pull\s*apart|scap(?:ular)?\s*(?:push|pull|row)|glute\s*bridge|monster\s*walk|clamshell|inchworm|leg\s*swing|arm\s*circle|jump\s*rope|single\s*unders?)\b/i, "warmup"],
  // A BANDED good morning is a primer, not a lift — the implement is what decides
  // it. Must be tested before the strength rule's bare `good morning` below, which
  // would otherwise take it and is correct only for the loaded version.
  //
  // This is narrow ON PURPOSE, and does not generalise to the rest of the hinge
  // family in that rule: a banded HIP THRUST is indeed activation, but a banded
  // DEADLIFT is accommodating resistance on a loaded bar — a strength variation,
  // not a warm-up. "Banded X is always a warm-up" is exactly the confident wrong
  // guess this module exists to avoid, so each one is claimed individually.
  //
  // Both spellings are matched because `equip` is appended to the name before the
  // rules run: a coach may write "Banded Good Morning", or "Good Morning" with
  // equip `band`.
  // `band(?:ed)?` and NOT `banded?` — the latter reads as "bande" + optional "d"
  // and silently never matches a plain "Band Good Morning". Caught by the test.
  [/\b(?:band(?:ed)?|mini[\s-]?band)\s+good\s*morning\b|\bgood\s*morning\b(?=.*\bband(?:ed)?\b)/i, "warmup"],

  // ── Core ───────────────────────────────────────────────────────────────────
  // Before strength so "Pallof Press" is core, not a press.
  // The raise family splits: a KNEE or LEG raise is core, a calf/lateral/front
  // raise is strength. Matched explicitly here because the generic `raise` in the
  // strength rule below would otherwise take all of them — "Hanging Knee Raise"
  // came back `strength` from the real sample corpus before this existed.
  [/\b(?:plank|hollow(?:\s*(?:hold|rock|body))?|pallof|dead\s*bug|bird\s*dog|sit[\s-]?up|toes\s*to\s*bar|russian\s*twist|ab\s*wheel|copenhagen|side\s*bend|(?:hanging\s*)?(?:knee|leg)\s*raise|knee\s*tuck|v[\s-]?up|flutter\s*kick)\b/i, "core"],

  // ── Strength ───────────────────────────────────────────────────────────────
  // The barbell lifts and their accessory relatives. "Air Squat" is excluded by
  // the negative lookahead — it is a conditioning/warm-up movement, not a lift.
  [/\b(?:back|front|goblet|overhead|split|bulgarian|hack|zercher)\s*squat\b/i, "strength"],
  [/\b(?:deadlift|rdl|romanian\s*deadlift|good\s*morning|hip\s*thrust)\b/i, "strength"],
  [/\b(?:bench|incline|overhead|strict|push|floor|z)\s*press\b/i, "strength"],
  [/\b(?:clean|snatch|jerk|thruster\s*complex|power\s*clean|hang\s*clean)\b/i, "strength"],
  // Strength ROW variants are named explicitly and a bare "Row" is NOT among
  // them — same trap inferEquip documents at planParser.js:246. "Chest Supported
  // Row" is strength; an unqualified "Row" in a circuit is the erg, and falls
  // through to the conditioning rule below.
  [/\b(?:chest[\s-]?supported|bent[\s-]?over|pendlay|inverted|renegade|seal|meadows|gorilla|upright|seated|barbell|bb|db|dumbbell|kb|kettlebell|cable|ring|single[\s-]?arm)\s+row\b/i, "strength"],
  // `push-up` sits with its bodyweight siblings pull-up / chin-up / dip rather
  // than with the burpees below: it is an upper-body push whoever programs it,
  // and a coach who puts it in a circuit re-tags the block, not the movement.
  // It must come AFTER the core rule so "Push-Up to Plank" stays core.
  [/\b(?:pull[\s-]?up|chin[\s-]?up|push[\s-]?up|press[\s-]?up|dip|curl|extension|raise|fly|pulldown|pullover|shrug|lunge|step[\s-]?up|calf\s*raise|leg\s*press|nordic)\b/i, "strength"],

  // ── Conditioning: the residual for recognisably metabolic work ─────────────
  // NOT a catch-all — an unmatched name still returns "". Only names that are
  // positively conditioning land here.
  [/\b(?:burpee|box\s*jump|kb\s*swing|kettlebell\s*swing|swing|thruster|air\s*squat|wall\s*ball(?:s|\s*shots?)?|mountain\s*climber|jumping\s*jack|battle\s*rope|slam\s*ball|devil'?s\s*press|man\s*maker|bear\s*crawl|tuck\s*jump|high\s*knee|skater|double\s*unders?)\b/i, "conditioning"],
  // `skierg` as one word is spelled out: the `\berg\b` alternative does not match
  // inside it, and it is how coaches most often write the machine's name.
  [/\b(?:erg|skierg|rower|rowing|assault\s*bike|echo\s*bike|air\s*bike|bike|treadmill|run(?:ning)?|jog|sprint|shuttle)\b/i, "conditioning"],
  // Bare "Row" is the erg — but ONLY when bare. It has to be anchored to the end
  // of the name (optionally trailed by "erg") or followed by a number, or it
  // swallows every unrecognised strength row: "Nonesuch Row Variation Two" came
  // back `conditioning` before this anchor existed. Same shape as inferEquip's
  // row rule at planParser.js:265.
  [/\bcal\s+row\b|\brow\b(?=\s*\d)|\brow(?:er|ing)?\b\s*(?:erg)?\s*$/i, "conditioning"],
];

// Classify one movement name. `equip` is accepted as a secondary signal for the
// cases where the name alone is genuinely ambiguous.
//
// Returns "" when unsure, and that is the point. An honest blank beats a
// confident wrong guess: the catalog surfaces a blank as "needs category" for the
// coach to fill in, whereas a wrong value silently skews aggregation and slot
// filters with nothing to flag it. This mirrors inferEquip's "Chest Supported
// Row" → "" decision exactly.
export function classifyMovement(name, equip = "") {
  const text = `${name || ""} ${equip || ""}`.trim();
  if (!text) return "";
  for (const [re, category] of CATEGORY_RULES) if (re.test(text)) return category;
  return "";
}

// Resolve the category actually in force for a catalog row. The coach's override
// always wins — the same authority order the whole persona system uses (a human's
// judgement is the asset; derivation is a convenience).
//
// With no override it re-derives from the RULES rather than trusting the row's
// stored `category`. That matters because a catalog is only re-aggregated when a
// persona's plans change (App.jsx `recompute`, and the empty-catalog guard around
// :7648) — so a stored category is a snapshot that goes stale the moment the rules
// improve, and an existing coach would never see the improvement. Deriving here
// keeps every read current; the stored field remains as the persisted copy for
// consumers that cannot run the rules.
export function categoryOf(movement) {
  if (!movement) return "";
  const override = movement.meta?.category;
  if (override && CATEGORIES.includes(override)) return override;
  return classifyMovement(movement.name, movement.equip);
}
