// ─── Deterministic class-plan parser (infra backlog I2, spec §4.3.1) ─────────
//
// WHY THIS EXISTS
// Importing a coach's Google Slides deck used to send every slide to Gemini.
// That is the wrong default, for one decisive reason: these are HOUSE FORMATS.
// S360, GC and Enduro are the same notation repeated weekly across dozens of
// decks — a consistent private grammar, which is the textbook case for a parser
// rather than a language model. The LLM was paying quota, latency and (the real
// cost) NON-DETERMINISM to re-derive a grammar that does not change.
//
// Non-determinism is not a cosmetic problem here. The corpus feeds a derived
// style profile, so re-importing the same deck with slightly different output
// makes the coach's "learned style" drift without the coach changing anything.
// A parser's output is fixed, reproducible, and pinnable by a unit test.
//
// THE CONTRACT: NEVER SILENTLY GUESS.
// Everything in this module is coverage-accounted. Each meaningful input line is
// either consumed by a rule or recorded as unconsumed, and unconsumed lines pull
// `confidence` down. Below `PARSE_THRESHOLD` the caller must DEFER to the LLM
// rather than accept a half-understood plan — a plausible-looking wrong plan is
// far worse than an honest fallback, because nothing downstream can detect it.
//
// Output is byte-compatible with what persona-ai's extractor emits, so a parsed
// plan and an extracted plan are interchangeable to personaAggregate/planToStages.

// Accept a parse at or above this confidence; below it, fall through to the LLM.
// 0.72 was chosen against the fixtures in planParser.test.js: a well-formed slide
// in a known house format lands 0.85-1.0, a slide with a couple of odd lines lands
// 0.72-0.85, and genuinely foreign notation lands below 0.6.
export const PARSE_THRESHOLD = 0.72;
export const PARSER_VERSION = 1;

const ROLES = ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"];

// ── Per-coach parse hints (§4.3.2 "next step") ───────────────────────────────
// Once a coach has a corpus, their notation is no longer unknown — it is
// EVIDENCE. Their movement vocabulary, class types and block labels are all
// sitting in plans already extracted, and feeding them back turns slides the
// generic rules would defer into slides that parse for free.
//
// This is the mechanism that makes the LLM the cold-start tool it should be
// rather than the steady-state engine: the first import of a new coach leans on
// the model, and every import after that leans on it less.
//
// Hints only ever let the parser RECOGNISE more — they never invent structure.
// A hinted line still has to be a real line in the source, and confidence is
// still coverage-accounted, so a hint can raise the score only by genuinely
// accounting for text that would otherwise have been unparsed.
export function deriveHints(plans = [], catalog = []) {
  const movements = new Set();
  const classTypes = new Set();
  const labels = new Set();
  (catalog || []).forEach(m => {
    if (m?.name) movements.add(norm(m.name));
    (m?.aliases || []).forEach(a => a && movements.add(norm(a)));
  });
  (plans || []).forEach(pl => {
    if (pl?.classType) classTypes.add(String(pl.classType).trim());
    (pl?.plan?.blocks || []).forEach(b => {
      if (b?.label) labels.add(String(b.label).trim());
      (b?.exercises || []).forEach(ex => { if (ex?.name) movements.add(norm(ex.name)); });
    });
  });
  movements.delete("");
  return {
    movements: [...movements],
    classTypes: [...classTypes].filter(Boolean),
    labels: [...labels].filter(Boolean),
  };
}

const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Does this line name a movement this coach is already known to program? Matched
// on the line with its scheme tokens stripped, so "Zercher Squat 5x5" resolves
// against a catalog entry of "Zercher Squat".
function hintedMovement(line, hints) {
  if (!hints?.movements?.length) return false;
  const bare = norm(stripSchemeTokens(stripBullet(line))
    .replace(/\([^)]*\)/g, " ")
    .replace(/[x×]\s*\d+/gi, " ")
    .replace(/\d+\s*(?:m|km|cal|s|sec|min|reps?)\b/gi, " ")
    .replace(/\b\d+(?:\s*[-–]\s*\d+)+\b/g, " "));
  if (!bare) return false;
  return hints.movements.some(m => m && (bare === m || bare.includes(m)));
}

// ── Small helpers ────────────────────────────────────────────────────────────
const clean = s => (s || "").replace(/ /g, " ").trim();
// Leading bullets/dashes/numbering that carry no meaning ("• ", "- ", "1. ").
const stripBullet = s => clean(s).replace(/^[-–—•*·]+\s*/, "").replace(/^\d+[.)]\s+/, "");

// ── Line classification ──────────────────────────────────────────────────────
// Lines that are real content but carry no programming: dates, the deck's own
// branding, slide furniture. Recognising them explicitly matters — an unrecognised
// line costs confidence, so without this a dated slide would look half-parsed.
const NOISE_RE = /^(?:jungle|the garage|garage|week\s+\d+(?:\s*(?:of|\/)\s*\d+)?|slide\s*\d+|notes?:?|playlist|coach|@\w+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const DATE_RE = /^\s*\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\s*$/i;

// Block labels, in the notation these decks actually use.
//   "Warm Up", "Cool Down", "Finisher"        — named blocks
//   "M1", "M2"                                 — S360's primary/main lift slots
//   "A1", "A2", "B1", "B2", "C1", "C3"         — lettered slots; same letter = a set
//   "AMRAP 12", "EMOM 10", "Circuit 3"         — scheme-named blocks
const NAMED_BLOCK = [
  [/^warm[\s-]?up\b/i, "warmup"],
  [/^(?:cool[\s-]?down|stretch|mobility)\b/i, "cooldown"],
  [/^(?:finisher|burnout)\b/i, "finisher"],
  [/^(?:recovery|rest day)\b/i, "recovery"],
  [/^(?:circuit|conditioning|metcon|wod)\b/i, "circuit"],
];
const SLOT_RE = /^([A-Z])(\d{1,2})\b[.:)]?\s*/;      // A1 / B2 / C3 / M1
const SCHEME_BLOCK_RE = /^(amrap|emom|e\d+mom|tabata|for time|intervals?)\b/i;
// A slot header carrying a SEPARATED suffix — "M1 — Deadlift", "M1: Deadlift".
// Deliberately mirrors slotKey() in blueprints.js, which already reads this exact
// form as "slot M1, plus this week's focus". The separator is what distinguishes it
// from "M1 Back Squat 5x5", where the suffix is the movement itself.
const FOCUS_SUFFIX_RE = /^([A-Z])(\d{1,2})\b(?:\s+[—–-]\s+|:\s*)(.+)$/;

// ── Scheme parsing ───────────────────────────────────────────────────────────
// Every rule below is a pattern the decks use verbatim. Each returns the fields it
// recognises plus the span it consumed, so the caller can tell whether a line was
// fully understood or only partly.

// "3min" / "90s" / "2:00" / "3 minutes" → seconds.
function durationSec(value, unit) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (/^m/i.test(unit)) return Math.round(n * 60);
  return Math.round(n);
}
function parseRest(text) {
  // "rest 3min", "Rest: 90s", "rest 2:00", "R: 90 sec"
  let m = text.match(/\brest\s*:?\s*(\d{1,2}):(\d{2})\b/i);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = text.match(/\brest\s*:?\s*(\d+(?:\.\d+)?)\s*(m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/i);
  if (m) return durationSec(m[1], m[2]);
  return null;
}
function parseRir(text) {
  const m = text.match(/\bRIR\s*:?\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}
// "RPE 7", "@ RPE 7-8" (a range lands on its MIDPOINT — same rule the extractor
// prompt uses, so parsed and extracted corpora aggregate identically).
function parseRpe(text) {
  const m = text.match(/\bRPE\s*:?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i);
  if (!m) return null;
  return m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
}
// Tempo codes: "31X1", "3-1-X-1", "@ 3010". Kept as a note, never a number.
// A bare 4-digit run is ambiguous — "3010" is a tempo but "3000" is a rowing
// distance — so an all-digit code is only accepted when the line MARKS it as
// tempo ("tempo 3010", "@ 3010"). A code containing X is unambiguous on its own.
function parseTempo(text) {
  const m = text.match(/\b([\dX]{4}|\d-\d-[\dX]-\d)\b/i);
  if (!m) return null;
  const code = m[1];
  if (/x/i.test(code)) return code;
  return /\btempo\b|@\s*$/i.test(text.slice(0, m.index)) ? code : null;
}
// Rep ladder: "12-10-10-8". Requires 3+ terms so a plain range ("8-10") is NOT
// mistaken for a ladder — that distinction is load-bearing, since "4 x 8-10"
// means four sets of eight-to-ten, not a four-rung ladder.
function parseLadder(text) {
  const m = text.match(/\b(\d{1,3}(?:\s*[-–]\s*\d{1,3}){2,})\b/);
  if (!m) return null;
  return m[1].split(/[-–]/).map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
}
// "5x5", "3 x 10", "4×8-10". Returns { sets, reps[], note }.
function parseSetsReps(text) {
  const m = text.match(/\b(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\b/i);
  if (!m) return null;
  const out = { sets: Number(m[1]), reps: [Number(m[2])], note: "" };
  if (m[3]) out.note = `${m[2]}-${m[3]} reps`;   // a range: keep the span, pin the floor
  return out;
}
function parseRounds(text) {
  const m = text.match(/\b(\d{1,2})\s*(?:rounds?|sets?|rds?)\b/i);
  return m ? Number(m[1]) : null;
}

// Does this line carry scheme information at all? Used to decide whether a line
// inside a block is scheme prose or a movement.
function schemeSignal(text) {
  return /\b(rest|rir|rpe|amrap|emom|tabata|rounds?|sets?|for time|primer|tempo|\d\s*[x×]\s*\d)\b/i.test(text)
      || !!parseLadder(text);
}

// Fold whatever a line says about the scheme into an accumulating scheme object.
// Returns true if the line contributed anything.
function foldScheme(scheme, line, notes) {
  let hit = false;
  const sr = parseSetsReps(line);
  if (sr) {
    scheme.sets = sr.sets;
    if (!scheme.reps.length) scheme.reps = sr.reps;
    if (sr.note) notes.push(sr.note);
    scheme.type = "sets_reps"; hit = true;
  }
  const ladder = parseLadder(line);
  if (ladder) {
    scheme.reps = ladder; scheme.type = "sets_reps";
    // A 4-rung ladder implies 4 sets — but that is an INFERENCE, and the coach may
    // state the count themselves ("3 rounds"). Flag it so a stated value can win;
    // a real import read "A1/A2 12-10-10-8 ... 3 rounds" as 4 sets, quietly
    // contradicting the deck.
    if (scheme.sets == null) { scheme.sets = ladder.length; scheme._setsInferred = true; }
    hit = true;
  }

  const rounds = parseRounds(line);
  if (rounds != null && !sr) {
    if (scheme.sets == null || scheme._setsInferred) { scheme.sets = rounds; scheme._setsInferred = false; }
    if (!scheme.type) scheme.type = "rounds";
    hit = true;
  }

  const rest = parseRest(line); if (rest != null) { scheme.rest_sec = rest; hit = true; }
  const rir  = parseRir(line);  if (rir  != null) { scheme.rir = rir;       hit = true; }
  const rpe  = parseRpe(line);  if (rpe  != null) { scheme.rpe = rpe;       hit = true; }
  const tempo = parseTempo(line); if (tempo) { notes.push(`tempo ${tempo}`); hit = true; }

  // AMRAP / EMOM / intervals set the scheme TYPE and keep their window as a note.
  const am = line.match(/\bamrap\s*:?\s*(\d+)?\s*(m(?:in)?|s(?:ec)?)?\b/i);
  if (am) {
    scheme.type = "amrap";
    notes.push(am[1] ? `AMRAP ${am[1]}${/^m/i.test(am[2] || "m") ? "min" : "s"}` : "AMRAP");
    hit = true;
  }
  const em = line.match(/\b(?:emom|e(\d+)mom)\s*:?\s*(\d+)?\b/i);
  if (em) { scheme.type = "interval"; notes.push(em[0].trim().toUpperCase()); hit = true; }
  if (/\bfor time\b/i.test(line)) { scheme.type = "time"; notes.push("for time"); hit = true; }
  if (/\btabata\b/i.test(line))   { scheme.type = "interval"; notes.push("Tabata"); hit = true; }
  // Interval notation: "40s on / 20s off".
  const iv = line.match(/\b(\d+)\s*(?:s|sec)\s*on\s*[/,]?\s*(\d+)\s*(?:s|sec)\s*off\b/i);
  if (iv) { scheme.type = "interval"; notes.push(`${iv[1]}s on / ${iv[2]}s off`); hit = true; }

  // Coaching qualifiers that belong in the note, verbatim ("1st set as primer").
  const primer = line.match(/\b(1st|first)\s+set\s+as\s+(?:a\s+)?primer\b/i);
  if (primer) { notes.push("1st set as primer"); hit = true; }

  return hit;
}

// ── Exercise parsing ─────────────────────────────────────────────────────────
// Equipment inference. ORDER IS LOAD-BEARING: explicit equipment markers are
// checked before movement-name heuristics, so "Chest Supported Row" and "DB Row"
// do not both fall through to the cardio rule and come back as an erg.
const EQUIP_RULES = [
  // Strength ROW variants first, and they resolve to "" (unknown) rather than a
  // guess. "Chest Supported Row" is not an erg, but whether it is a machine, a
  // bench + DBs or a cable is genuinely not stated — and the movement catalog UI
  // already flags blank equipment as "needs equipment" for the coach to fill in.
  // An honest blank beats a confident wrong value that silently skews aggregation.
  [/\b(?:chest[\s-]?supported|bent[\s-]?over|pendlay|inverted|renegade|seal|meadows|gorilla|upright|seated)\s+row\b/i, ""],

  // EXPLICIT equipment tokens come first, as a group, and beat every movement-name
  // heuristic below. "DB Bench Press" is a dumbbell movement even though "bench
  // press" is normally a barbell lift — and it came back tagged `barbell` from a
  // real import because the movement-name rule was ordered above the DB rule.
  [/\b(?:db|dumbbell|dumbell)\b/i, "DB"],
  [/\b(?:kb|kettlebell)\b/i, "KB"],
  [/\b(?:bb|barbell)\b/i, "barbell"],

  // Movement-name heuristics: true only when no explicit marker contradicted them.
  [/\b(?:back squat|front squat|deadlift|bench press|overhead press|strict press|push press|clean|snatch|jerk)\b/i, "barbell"],
  [/\b(?:sled|prowler)\b/i, "sled"],
  [/\b(?:erg|rower|ski\s?erg|skierg|assault|echo|air\s?bike|\bbike\b|treadmill|run|jog)\b/i, "erg"],
  [/\bcal\s+row\b|\brow\b(?=\s*\d)|\brow(?:er|ing)?\s*$/i, "erg"],
  [/\b(?:push[\s-]?up|pull[\s-]?up|chin[\s-]?up|burpee|air squat|sit[\s-]?up|plank|mountain climber|jumping jack|scap)\b/i, "bodyweight"],
  [/\b(?:machine|cable|smith|leg press|lat pulldown|pec dec)\b/i, "machine"],
];
export function inferEquip(name) {
  for (const [re, equip] of EQUIP_RULES) if (re.test(name)) return equip;
  return "";
}

// Distance / calorie / time targets: "500m", "15 cal", "40s", "3km", "40m".
const TARGET_RE = /\b(\d+(?:\.\d+)?\s*(?:m|km|mi|miles?|metres?|meters?|cal(?:s|ories)?|s|sec(?:onds?)?|min(?:utes?)?))\b/i;

// One movement line → an exercise. Everything peeled off the name is recorded in
// its own field; whatever remains is the name AS THE COACH WROTE IT (the prompt's
// rule too — we expand nothing beyond obvious abbreviations, which aggregation
// handles via the movement catalog's aliases).
export function parseExercise(rawLine) {
  let line = stripBullet(rawLine);
  const ex = { name: "", equip: "", reps: "", per_side: false, regression: "", target: "" };
  if (!line) return null;

  // Regression: "(DB Press regression)", "or DB Press", "scale to Box Push Up".
  let m = line.match(/\((?:regression|scale(?:\s+to)?|sub(?:stitute)?)\s*:?\s*([^)]+)\)/i)
       || line.match(/\(([^)]+?)\s+regression\)/i)
       || line.match(/\b(?:scale to|sub(?:stitute)? with|regression\s*:)\s*(.+)$/i)
       || line.match(/\bor\s+([A-Z][\w\s-]{2,40})$/);
  if (m) { ex.regression = clean(m[1]); line = clean(line.replace(m[0], " ")); }

  // Per side.
  m = line.match(/\b(?:each side|per side|e\/s|\/side|ea\.? side|each leg|each arm)\b/i);
  if (m) { ex.per_side = true; line = clean(line.replace(m[0], " ")); }

  // Reps. A ladder ("12-10-10-8"), an "x15"/"15 reps" count, or a leading count
  // ("10 Wall Balls" — the GC/CrossFit convention).
  const ladder = parseLadder(line);
  if (ladder) {
    ex.reps = ladder.join("-");
    line = clean(line.replace(/\b\d{1,3}(?:\s*[-–]\s*\d{1,3}){2,}\b/, " "));
  } else if ((m = line.match(/\b[x×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\b/i))) {
    ex.reps = m[1].replace(/\s+/g, ""); line = clean(line.replace(m[0], " "));
  } else if ((m = line.match(/\b(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*reps?\b/i))) {
    ex.reps = m[1].replace(/\s+/g, ""); line = clean(line.replace(m[0], " "));
  } else if ((m = line.match(/^(\d{1,3})\s+(?=[A-Za-z])/))) {
    // Leading count, but ONLY when what follows is not itself a unit — "500 m Row"
    // is a target, not 500 reps.
    if (!/^\s*(?:m|km|cal|s|sec|min)\b/i.test(line.slice(m[0].length))) {
      ex.reps = m[1]; line = clean(line.slice(m[0].length));
    }
  }

  // An inline sets x reps ("M1 Back Squat 5x5") belongs to the BLOCK scheme, which
  // foldScheme has already taken from this same line. Strip it so it does not ride
  // into the movement name — this shipped a catalog entry called "Back Squat 5x5",
  // which aggregates as a different movement from "Back Squat" and silently splits
  // the coach's own history in two.
  //
  // The trailing unit clause is the same bug in its TIME form, found by driving a
  // real deck: "Assault Bike 3x30s" kept every character, because `\b` cannot sit
  // between `0` and `s`, while "Burpee 3x10" beside it cleaned up perfectly. So
  // the catalog held "Assault Bike" and "Assault Bike 3x30s" as two movements —
  // and `draftFromBlueprint` would offer the second one as a movement name in a
  // class. Only unambiguous time units are accepted: a bare `m` is metres at
  // least as often as minutes, and TARGET_RE owns distance.
  line = clean(line.replace(/\b\d{1,2}\s*[x×]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?(?:\s*(?:secs?|mins?|s)\b|\b)/i, " "));

  // Intensity qualifiers. `foldScheme` has ALREADY read these into the block's
  // scheme from this same line, so leaving them here duplicates the fact and
  // pollutes the name: "Conventional Deadlift 4x5 @RPE8" aggregated as a
  // different movement from "Conventional Deadlift" while `scheme.rpe` was
  // already 8. Mirrors the patterns in stripSchemeTokens rather than inventing
  // new ones, so the two cannot drift.
  line = clean(line.replace(/@?\bRPE\s*:?\s*\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?/gi, " ")
                   .replace(/@?\bRIR\s*:?\s*\d+(?:\.\d+)?/gi, " "));

  // Target (distance / calories / time cap) — after reps, so "10 Wall Balls" has
  // already taken its count and cannot re-read it here.
  // Normalised to "500m" / "15cal" / "3km" — unit lowercased and spaces dropped so
  // the same target written three ways aggregates as one value.
  m = line.match(TARGET_RE);
  if (m) { ex.target = clean(m[1]).replace(/\s+/g, "").toLowerCase(); line = clean(line.replace(m[0], " ")); }

  // Whatever survives is the movement name.
  ex.name = clean(line).replace(/[\s,·|@-]+$/, "").replace(/^[\s,·|@-]+/, "").replace(/\s{2,}/g, " ");
  if (!ex.name) return null;
  ex.equip = inferEquip(rawLine);   // infer from the ORIGINAL line — "DB" may have been peeled off
  return ex;
}

// A line is a plausible movement if it has letters and is not obviously prose.
// Deliberately strict: a sentence-shaped line ("Remember to keep the core braced
// and breathe through each rep") is NOT a movement, and treating it as one would
// pollute the catalog — so it stays unconsumed and costs confidence instead.
function looksLikeMovement(line) {
  const t = stripBullet(line);
  if (!t || t.length > 80) return false;
  if (!/[A-Za-z]{3}/.test(t)) return false;
  if (/[.!?]\s+[A-Z]/.test(t)) return false;              // multiple sentences
  return t.split(/\s+/).length <= 9;                      // movement lines are short
}

// ── Block role assignment ────────────────────────────────────────────────────
// Keyword first, then scheme, then the lettered-slot convention. Ordering matters:
// GC decks label their warmup "C1", so the word "warm up" must beat the letter rule.

// The strong, EXPLICIT signals: a role word in the label or text, or S360's M-slot.
// These come from the slide itself and are authoritative — nothing (not even the
// coach's blueprint) overrides what they literally wrote on this slide.
function explicitRole(label, text) {
  for (const [re, role] of NAMED_BLOCK) if (re.test(label) || re.test(text)) return role;
  if (/\bfinisher|burnout\b/i.test(text)) return "finisher";
  if (/^M\d/i.test(label)) return "primary_lift";          // S360's main-lift slot
  return null;
}

function roleFor({ label, text, scheme, slotLetter, slotPeers, isLast, blueprintRole }) {
  const explicit = explicitRole(label, text);
  if (explicit) return explicit;
  // D2 (§4.3.2) — the coach's blueprint answers what the generic heuristics below
  // can only GUESS. It is evidence from their own corpus, applied exactly where the
  // parser would otherwise guess: AFTER the slide's explicit words, BEFORE the
  // structural fallbacks. Like the movement/class-type hints, it only ever
  // resolves an existing block — it never invents structure.
  if (blueprintRole && ROLES.includes(blueprintRole)) return blueprintRole;
  if (slotPeers > 1) return "superset";                    // A1 + A2 share a letter
  if (scheme.type === "amrap" || scheme.type === "interval") return "circuit";
  if (scheme.type === "rounds") return "circuit";
  if (slotLetter === "A" && scheme.type === "sets_reps") return "primary_lift";
  if (isLast && scheme.type === "sets_reps") return "finisher";
  return "circuit";
}

// ── D2 blueprint role resolution ─────────────────────────────────────────────
// A slot key normalised so the parser's block label ("A1+A2", "Warm Up") and the
// blueprint's stored key ("A1+A2", "Warm-up") match despite spacing/dash noise.
const slotKeyNorm = k => String(k || "").trim().toLowerCase().replace(/[\s\-–—+]+/g, "");

// Choose the blueprint to apply: an explicit single `opts.blueprint`, or an
// `opts.blueprints` map keyed by class type, resolved against the type the header
// pass detected (case-insensitively).
function pickBlueprint(opts, classType) {
  if (opts.blueprint) return opts.blueprint;
  const map = opts.blueprints;
  if (!map || typeof map !== "object") return null;
  if (classType && map[classType]) return map[classType];
  const key = Object.keys(map).find(k => norm(k) === norm(classType));
  return key ? map[key] : null;
}

// slotKeyNorm(key) → role, for the roles a blueprint actually declares. Only the
// valid ROLES are indexed, so a malformed blueprint can never inject a bad role.
function blueprintRoleMap(blueprint) {
  const m = new Map();
  (blueprint?.slots || []).forEach(s => {
    if (s && s.key && ROLES.includes(s.role)) m.set(slotKeyNorm(s.key), s.role);
  });
  return m;
}

// ── The parser ───────────────────────────────────────────────────────────────
/**
 * Parse one class-plan slide into the extractor's shape.
 * @returns {{ title, classType, focus, plan:{blocks}, confidence, reasons, stats }}
 *   `confidence` in [0,1]. Callers MUST compare it against PARSE_THRESHOLD and
 *   defer to the LLM below it — see the contract at the top of this file.
 */
export function parsePlanText(text, opts = {}) {
  const reasons = [];
  const hints = opts.hints || null;
  let hintedLines = 0;          // reported in stats, so the hints' value is visible
  const rawLines = String(text || "").split(/\r?\n/);
  const lines = rawLines.map(clean).filter(Boolean);

  if (!lines.length) {
    return emptyResult(opts, ["empty input"], 0);
  }

  // ── Pass 1: header. The first few lines carry class type / focus / date before
  // any block starts. Stop at the first line that opens a block.
  let classType = clean(opts.classTypeHint || "");
  let focus = "";
  let title = clean(opts.title || "");
  let i = 0;
  const headerLines = [];
  while (i < lines.length && !isBlockStart(lines[i])) { headerLines.push(lines[i]); i++; }

  const consumed = new Array(lines.length).fill(false);
  headerLines.forEach((h, idx) => {
    if (DATE_RE.test(h) || NOISE_RE.test(h)) { consumed[idx] = true; return; }
    // A class type this coach already uses is recognised even when it isn't
    // shaped like the generic ALL-CAPS rule ("Garage Enduro", "Fundamental").
    if (!classType && hints?.classTypes?.length) {
      const hit = hints.classTypes.find(ct => norm(ct) === norm(h));
      if (hit) { classType = hit; consumed[idx] = true; hintedLines++; return; }
    }
    // A short ALL-CAPS-ish token is the class type ("S360", "GC", "ENDURO").
    if (!classType && /^[A-Z][A-Z0-9]{1,9}$/.test(h.replace(/\s+/g, ""))) { classType = h.trim(); consumed[idx] = true; return; }
    if (!focus && h.length <= 60) { focus = h; consumed[idx] = true; return; }
    consumed[idx] = true;                              // extra header prose: harmless
  });

  // D2 — resolve the coach's blueprint for the class type the header identified,
  // so a lettered slot with no role word gets the coach's own role rather than a
  // guess (§4.3.2). Empty when no blueprint is supplied — then nothing below
  // changes and the parser behaves exactly as before.
  const blueprintRoles = blueprintRoleMap(pickBlueprint(opts, classType));
  let blueprintLines = 0;

  // ── Pass 2: segment into blocks.
  // Each entry in `rest` carries its own source index. Tracking the index ON the
  // line (rather than a parallel array) matters: a label line with no trailing
  // content contributes an index but no text, which put the two arrays out of
  // step and made coverage accounting attribute lines to the wrong slot.
  const segments = [];
  let cur = null;
  for (; i < lines.length; i++) {
    if (isBlockStart(lines[i])) {
      const inline = afterLabel(lines[i]);
      const focusSuffix = FOCUS_SUFFIX_RE.test(stripBullet(lines[i]));
      cur = { label: blockLabelOf(lines[i]), headIdx: i, rest: inline ? [{ text: inline, idx: i, focusSuffix }] : [] };
      segments.push(cur);
    } else if (cur) {
      cur.rest.push({ text: lines[i], idx: i });
    } else {
      // Content before any block label and after the header — unclaimed.
      reasons.push(`line outside any block: "${lines[i].slice(0, 48)}"`);
    }
  }
  if (!segments.length) {
    reasons.push("no block labels found (no Warm Up / M1 / A1 / AMRAP structure)");
    return emptyResult(opts, reasons, 0, { classType, focus, title });
  }

  // ── Pass 3: parse each segment.
  const parsed = segments.map((seg, si) => {
    const scheme = { type: "", sets: null, reps: [], rir: null, rpe: null, rest_sec: null, note: "" };
    const notes = [];
    const exercises = [];
    const slot = seg.label.match(SLOT_RE);

    // A block header written "M1 — Deadlift" names the slot AND this week's focus —
    // exactly how slotKey() reads it. That suffix is a THEME, not a movement, and
    // parsing it as one invented an exercise the coach never wrote on a movement
    // line, then fed it into the catalog the whole persona thesis aggregates.
    //
    // The separator alone is NOT the signal. If the suffix is the block's only
    // movement-shaped content it IS the movement, and dropping it would lose the
    // only one. So defer the decision until the rest of the block has been read.
    let focusEntry = null;

    seg.rest.forEach(({ text: line, idx, focusSuffix }) => {
      if (focusSuffix) {
        // Fold the scheme now regardless: "M1 — Deadlift 5x5" states the block's
        // scheme on the header line, and it must not be lost along with the label.
        // Folding HERE rather than after the loop also keeps the header's scheme
        // first, so a later line still wins exactly as it does today.
        if (foldScheme(scheme, line, notes)) consumed[idx] = true;
        focusEntry = { line, idx };
        return;
      }
      // A regression written on its OWN line — "(DB Press regression)" under the
      // movement it scales — belongs to the exercise above it, not to a new one.
      // Without this it parsed as a separate movement and quietly entered the
      // coach's catalog as a real exercise they never programmed.
      const solo = soloRegression(line);
      if (solo && exercises.length) {
        exercises[exercises.length - 1].regression = solo;
        consumed[idx] = true;
        return;
      }

      // A line that is ONLY a role word ("Finisher" sitting under "C1", "Cool Down")
      // names the block; it is not a movement. A real import produced an exercise
      // literally called "Finisher", which then entered the coach's movement catalog
      // as if they programmed it.
      if (isBareRoleWord(line)) { consumed[idx] = true; return; }

      const contributed = foldScheme(scheme, line, notes);
      // A line can be BOTH a movement and scheme-bearing ("M1 Back Squat 5x5") —
      // try the exercise too, unless the line is pure scheme prose.
      const schemeOnly = contributed && !looksLikeMovement(stripSchemeTokens(line));
      // `looksLikeMovement` is deliberately strict, which means it also rejects
      // real movements written unusually (a long name, a trailing coaching cue).
      // A movement THIS COACH is already known to program is evidence the generic
      // heuristic doesn't have, so it overrides — that is the whole point of hints.
      const known = !schemeOnly && hintedMovement(line, hints);
      if (known || (!schemeOnly && looksLikeMovement(line))) {
        const ex = parseExercise(line);
        if (ex) { exercises.push(ex); consumed[idx] = true; if (known) hintedLines++; return; }
      }
      if (contributed) { consumed[idx] = true; return; }
      if (NOISE_RE.test(line) || DATE_RE.test(line)) { consumed[idx] = true; return; }
      reasons.push(`unparsed line in "${seg.label}": "${line.slice(0, 48)}"`);
    });

    // Nothing else in the block was movement-shaped, so the suffix was never a
    // focus label — it is the block's one movement. Run it through the SAME guards
    // the normal path uses, so "C1 — Warm Up" stays block furniture rather than
    // becoming an exercise called "Warm Up".
    if (focusEntry && !exercises.length && !isBareRoleWord(focusEntry.line)) {
      const known = hintedMovement(focusEntry.line, hints);
      if (known || looksLikeMovement(focusEntry.line)) {
        const ex = parseExercise(focusEntry.line);
        if (ex) { exercises.push(ex); consumed[focusEntry.idx] = true; if (known) hintedLines++; }
      }
    }

    scheme.note = notes.join("; ");
    if (!scheme.type) scheme.type = scheme.reps.length || scheme.sets != null ? "sets_reps" : "rounds";
    consumed[seg.headIdx] = true;
    // "plain" = a lettered slot carrying nothing but a movement. A slot that names
    // its own role ("C1 Warm Up", "C2 AMRAP 12min", "C3 Finisher") is a stage in a
    // sequence, NOT half of a superset — which is exactly how GC decks are written.
    const body = seg.rest.map(r => r.text).join(" ");
    const plain = !NAMED_BLOCK.some(([re]) => re.test(body)) && !SCHEME_BLOCK_RE.test(body)
                  && !/\bfinisher|burnout\b/i.test(body);
    return { seg, slot, scheme, exercises, plain };
  });

  // ── Pass 4: fold same-letter slots into supersets (A1 + A2 → one block).
  const letterCount = {};
  parsed.forEach(p => { if (p.slot && !/^M$/i.test(p.slot[1])) letterCount[p.slot[1]] = (letterCount[p.slot[1]] || 0) + 1; });

  const blocks = [];
  let k = 0;
  while (k < parsed.length) {
    const p = parsed[k];
    const letter = p.slot?.[1];
    const peers = letter ? (letterCount[letter] || 1) : 1;
    // Consecutive same-letter slots are ONE superset block — that is what the
    // notation means, and what the extractor prompt is told to produce.
    //
    // But ONLY when every member is "plain". S360 writes a pair as "A1 <movement>"
    // / "A2 <movement>"; GC writes a sequence as "C1 Warm Up" / "C2 AMRAP 12min" /
    // "C3 Finisher". Same shape to a naive letter rule, opposite meaning — folding
    // GC's three stages into one superset destroyed the whole class structure.
    // A run is a superset only if it is 2-3 members, all plain, all with movements.
    if (letter && peers > 1 && /^[A-L]$/i.test(letter)) {
      const run = [];
      let j = k;
      while (j < parsed.length && parsed[j].slot?.[1] === letter) { run.push(parsed[j]); j++; }
      // D2 — if the coach's blueprint names each member as its OWN (non-superset)
      // slot, they are a SEQUENCE the coach declared, not a superset — GC's bare
      // "C1 / C2 / C3" that a naive letter rule folds into one block, destroying the
      // exact structure §4.3.2 is about. The blueprint vetoes the fold. Empty
      // blueprint → `bpDistinct` is false → folding is unchanged.
      const bpDistinct = run.length >= 2 && run.every(g => {
        const r = blueprintRoles.get(slotKeyNorm(g.seg.label));
        return r && r !== "superset";
      });
      const foldable = !bpDistinct && run.length >= 2 && run.length <= 3
                       && run.every(g => g.plain && g.exercises.length);
      if (foldable) {
        k = j;
        blocks.push(mergeSuperset(run, letter, k >= parsed.length));
        continue;
      }
    }
    const isLast = k === parsed.length - 1;
    const text = p.seg.rest.map(r => r.text).join(" ");
    // The coach's blueprint governs this slot only when the slide itself gave no
    // explicit role word — otherwise the slide wins. Counted for stats so the
    // blueprint's contribution is visible, the same way `hinted` is.
    const bpRole = blueprintRoles.get(slotKeyNorm(p.seg.label));
    if (bpRole && ROLES.includes(bpRole) && !explicitRole(p.seg.label, text)) blueprintLines++;
    blocks.push({
      label: p.seg.label,
      // slotPeers is 1 here BY DEFINITION: anything that was a genuine superset
      // was folded above, so a block reaching this branch is a standalone stage
      // even when other slots share its letter (GC's C1/C2/C3).
      role: roleFor({ label: p.seg.label, text, scheme: p.scheme, slotLetter: letter, slotPeers: 1, isLast, blueprintRole: bpRole }),
      rotation: "",
      scheme: p.scheme,
      exercises: p.exercises,
    });
    k++;
  }

  // ── Confidence.
  // Coverage = the share of input lines a rule actually claimed. Exercise lines are
  // already flagged in `consumed`, so adding the exercise COUNT on top (as an earlier
  // version did) double-counted them and pinned coverage at 1.0 for slides that were
  // only half understood — the exact opposite of what this number is for.
  const meaningful = lines.length;
  const accounted = consumed.filter(Boolean).length;
  const withEx = blocks.filter(b => b.exercises.length).length;

  let confidence = Math.min(1, accounted / Math.max(1, meaningful));
  const unparsed = reasons.filter(r => r.startsWith("unparsed") || r.startsWith("line outside")).length;
  if (unparsed) confidence -= Math.min(0.5, unparsed * 0.12);
  if (!withEx) { confidence = 0; reasons.push("no block produced a single exercise"); }
  else if (withEx < blocks.length) {
    confidence -= 0.1 * (blocks.length - withEx);
    reasons.push(`${blocks.length - withEx} block(s) parsed with no exercises`);
  }
  if (!blocks.some(b => b.scheme.type)) { confidence -= 0.2; reasons.push("no block yielded a scheme type"); }
  if (blocks.length === 1 && blocks[0].exercises.length === 1) {
    confidence -= 0.15; reasons.push("only one block with one exercise — likely a partial read");
  }
  confidence = Math.max(0, Math.round(confidence * 100) / 100);

  // Decks routinely name the class type twice — once alone, once leading the focus
  // line ("S360", then "S360 — Week 4") — which joined into "S360 — S360 — Week 4".
  // Prefix the class type only when the focus does not already lead with it. The
  // boundary check matters: class type "S3" must NOT be treated as a prefix of
  // "S360 — Week 4".
  if (!title) {
    const f = focus.trim(), c = classType.trim();
    const dup = c && f.toLowerCase().startsWith(c.toLowerCase()) && !/[a-z0-9]/i.test(f.charAt(c.length));
    title = (dup ? f : [c, f].filter(Boolean).join(" — ")) || "Imported class";
  }

  // `_setsInferred` is bookkeeping for the merge above, not part of the schema.
  // It must not reach persona_plans.plan — the block shape is asserted by tests
  // and consumed field-by-field by personaAggregate.
  blocks.forEach(b => { delete b.scheme._setsInferred; });

  return {
    title, classType, focus,
    plan: { blocks },
    confidence,
    reasons,
    stats: { lines: meaningful, blocks: blocks.length,
             exercises: blocks.reduce((n, b) => n + b.exercises.length, 0),
             // How many lines only parsed BECAUSE of this coach's own corpus.
             // Makes the hints' contribution measurable instead of assumed.
             hinted: hintedLines,
             // How many blocks took their role from the coach's blueprint rather
             // than a guess (§4.3.2) — the D2 contribution, made visible too.
             blueprint: blueprintLines },
  };
}

// ── Internals ────────────────────────────────────────────────────────────────
function emptyResult(opts, reasons, confidence, extra = {}) {
  return {
    title: clean(opts.title || "") || extra.title || "",
    classType: clean(opts.classTypeHint || "") || extra.classType || "",
    focus: extra.focus || "",
    plan: { blocks: [] },
    confidence, reasons,
    stats: { lines: 0, blocks: 0, exercises: 0, hinted: 0 },
  };
}
// A line that is ONLY a regression/scaling note, e.g. "(DB Press regression)",
// "(scale to Box Push Up)", "or Ring Row". Returns the movement it names.
function soloRegression(line) {
  const t = stripBullet(line);
  let m = t.match(/^\((.+?)\s+regression\)$/i)
       || t.match(/^\((?:regression|scale(?:\s+to)?|sub(?:stitute)?)\s*:?\s*(.+?)\)$/i)
       || t.match(/^(?:regression|scale to|sub(?:stitute)? with)\s*:?\s*(.+)$/i)
       || t.match(/^or\s+(.+)$/i);
  return m ? clean(m[1]) : "";
}
// True when the whole line is a role name and nothing else ("Finisher", "Warm Up",
// "Cool Down") — block furniture, never a movement.
function isBareRoleWord(line) {
  const t = stripBullet(line);
  return /^(?:warm[\s-]?up|cool[\s-]?down|finisher|burnout|circuit|conditioning|metcon|recovery|stretch|mobility)$/i.test(t);
}
function isBlockStart(line) {
  const t = stripBullet(line);
  if (NAMED_BLOCK.some(([re]) => re.test(t))) return true;
  if (SCHEME_BLOCK_RE.test(t)) return true;
  return SLOT_RE.test(t);
}
function blockLabelOf(line) {
  const t = stripBullet(line);
  const slot = t.match(SLOT_RE);
  if (slot) return `${slot[1]}${slot[2]}`;
  const named = NAMED_BLOCK.find(([re]) => re.test(t));
  if (named) return clean(t.match(named[0])[0]).replace(/\b\w/g, c => c.toUpperCase());
  const sch = t.match(SCHEME_BLOCK_RE);
  return sch ? sch[1].toUpperCase() : t.slice(0, 24);
}
function afterLabel(line) {
  const t = stripBullet(line);
  const slot = t.match(SLOT_RE);
  if (slot) return clean(t.slice(slot[0].length));
  const named = NAMED_BLOCK.find(([re]) => re.test(t));
  if (named) return clean(t.replace(named[0], " "));
  return t;
}
// Remove tokens a scheme rule already claimed, to test whether anything
// movement-shaped is left on the line.
function stripSchemeTokens(line) {
  return line
    .replace(/\brest\s*:?\s*[\d:]+\s*(?:m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)?/gi, " ")
    .replace(/\bRIR\s*:?\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\bRPE\s*:?\s*\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?/gi, " ")
    .replace(/\b\d{1,2}\s*[x×]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?/gi, " ")
    .replace(/\b\d{1,2}\s*(?:rounds?|sets?|rds?)\b/gi, " ")
    .replace(/\b(?:amrap|emom|tabata|for time)\b/gi, " ")
    .replace(/\b(1st|first)\s+set\s+as\s+(?:a\s+)?primer\b/gi, " ")
    // Bare durations attached to a scheme word ("AMRAP 12min" -> "12min"). Without
    // this the leftover reads as movement-shaped and "AMRAP 12min" was parsed as an
    // exercise literally named "AMRAP".
    .replace(/\b\d+(?:\.\d+)?\s*(?:m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/gi, " ");
}
function mergeSuperset(group, letter, isLast) {
  const labels = group.map(g => g.seg.label);
  const scheme = group[0].scheme;
  // The pair usually states rounds/rest once, on either member — merge so the
  // block carries whatever the coach wrote wherever they wrote it.
  group.slice(1).forEach(g => {
    // A stated set count from ANY member beats a count this block only inferred
    // from its rep-ladder length — "3 rounds" written under A2 governs the pair.
    if (scheme.sets == null || (scheme._setsInferred && g.scheme.sets != null && !g.scheme._setsInferred)) {
      scheme.sets = g.scheme.sets; scheme._setsInferred = g.scheme._setsInferred;
    }
    if (scheme.rest_sec == null) scheme.rest_sec = g.scheme.rest_sec;
    if (scheme.rir == null) scheme.rir = g.scheme.rir;
    if (scheme.rpe == null) scheme.rpe = g.scheme.rpe;
    if (!scheme.reps.length) scheme.reps = g.scheme.reps;
    if (!scheme.type) scheme.type = g.scheme.type;
    if (g.scheme.note) scheme.note = [scheme.note, g.scheme.note].filter(Boolean).join("; ");
  });
  const text = group.map(g => g.seg.rest.map(r => r.text).join(" ")).join(" ");
  const role = /\bfinisher|burnout\b/i.test(text) ? "finisher" : "superset";
  void isLast;
  return {
    label: labels.join("+"),
    role,
    rotation: `${labels.join("+")}${scheme.sets ? `, ${scheme.sets} rounds` : ""}`,
    scheme,
    exercises: group.flatMap(g => g.exercises),
  };
}

export const _internal = { parseSetsReps, parseLadder, parseRest, parseRir, parseRpe, parseTempo, roleFor, ROLES, schemeSignal };
