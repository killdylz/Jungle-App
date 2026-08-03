// ─── Persona aggregation (workstream D) ──────────────────────────────────────
// Derive a coach persona's per-class-type profile + movement catalog from its
// plan corpus. The extraction Edge Function will mirror THIS shape server-side
// (chunk 2); the client runs it for instant feedback after manual/paste edits
// and to seed the editable movement catalog. Pure functions — no I/O.
//
// A persona's plans carry `classType` (S360 / GC / Enduro…). Class type is the
// dimension WITHIN a coach: each accumulates its own structure, schemes and
// movements. Movement names are canonicalized through the catalog's aliases so
// coach edits ("Conv Deadlift" → "Deadlift") feed back into aggregation.

import { classifyMovement } from "./movementTaxonomy.js";

const ROLE_ORDER = ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"];
const norm = s => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
// Exported because the SCREEN needs the same answer. It kept a byte-identical
// private copy called `ctOf`, which is the shape of drift this whole module
// exists to prevent — one question, one function.
export const classTypeOf = pl => ((pl.classType || "").trim() || "Uncategorized");

// Exported for blueprints.js, whose slot aggregation needs exactly these — the
// modal role across plans, the median movement count. Same statistics, so they
// stay in one place rather than drifting into a second copy.
export function mode(arr) {
  const m = new Map(); let best, bestN = 0;
  arr.forEach(v => { if (v == null || v === "") return; const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bestN) { bestN = n; best = v; } });
  return best;
}
export function median(arr) {
  const a = arr.filter(v => v != null).map(Number).filter(v => !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
// Exported because the catalogue screen asks the same question: a row's total
// occurrences across every class type is what separates a movement the coach
// still programs from one that survives only on its edits. A second copy of
// this reduce is the `ctOf` drift all over again.
export function totalCount(ct) { return Object.values(ct || {}).reduce((a, b) => a + b, 0); }

// RPE for a scheme. First-class scheme.rpe (increment 3) with a fallback parse
// from scheme.note, where earlier extractions put it ("RPE 7", "@ RPE 7-8" —
// ranges land on their midpoint). Lets pre-increment-3 corpora feed RPE
// defaults without re-extraction.
function rpeOf(scheme) {
  if (scheme?.rpe != null && !Number.isNaN(Number(scheme.rpe))) return Number(scheme.rpe);
  const m = (scheme?.note || "").match(/\bRPE\s*:?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i);
  if (!m) return null;
  return m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
}

// A class type has no id — its NAME is its key, in FOUR places at once: every
// plan's `classType`, `styleProfile.blueprints[ct]` (the shape the coach saved),
// `styleProfile.byClassType[ct]` (what extraction learned about how they coach
// it), and every row of the generation ledger. The plan editor lets a coach
// retype that name, and it used to rewrite only the first: the others stayed
// keyed under a name nothing pointed at any more. Every write was correct; the
// READERS disagreed. On screen that was a ghost tab holding the coach's own
// saved shape, their conventions and vocabulary gone from the profile, and the
// shape reverting to "suggested" — surviving a reload, because storage was never
// wrong.
//
// Carry them across ONLY when the rename empties the old name out. If other
// plans still sit under it, the coach MOVED one plan between class types and
// both names keep their own identity — which is what they meant. Correcting a
// name the importer guessed is the common case and the one that has to be safe:
// those conventions cost an LLM pass over a real deck, and a typo-fix used to
// drop them on the floor.
//
// The rename-vs-move test lives here rather than in each function because it is
// the ONE rule the two must never disagree about — and a second copy of a shared
// rule is how the fourth reader came to be missed in the first place.
const isMove = (plansAfter, oldCT) => (plansAfter || []).some(pl => classTypeOf(pl) === oldCT);

export function renameClassType(styleProfile, oldCT, newCT, plansAfter) {
  const sp = styleProfile || {};
  if (!oldCT || !newCT || oldCT === newCT) return sp;
  if (isMove(plansAfter, oldCT)) return sp;
  let changed = false;
  const out = { ...sp };
  ["blueprints", "byClassType"].forEach(key => {
    const map = sp[key];
    if (!map || !(oldCT in map)) return;
    const { [oldCT]: carried, ...rest } = map;
    // Never clobber a destination that already has its own: a coach folding a
    // mis-extracted name into a type they already coach keeps the real one. The
    // orphan goes either way — nothing points at it once the plans have moved.
    out[key] = (newCT in rest) ? rest : { ...rest, [newCT]: carried };
    changed = true;
  });
  return changed ? out : sp;
}

// The fourth reader. `recentGens` selects the ledger by `g.classType === curCT`,
// so a rename that leaves the rows behind does two things at once: the coach's
// "Recently generated" list and its Reopen buttons vanish, and — the quiet half
// — that same list is what the next draft is steered AWAY from. An empty
// repeat-avoidance list does not fail; it just lets the generator hand back the
// class it produced last time, degrading every later draft with nothing on
// screen to say why.
//
// Scoped to one persona: the rename is a decision about THIS coach's vocabulary,
// and two coaches may legitimately use the same class-type name for their own
// different classes.
export function renameClassTypeInGenerations(generations, oldCT, newCT, plansAfter, personaId) {
  if (!oldCT || !newCT || oldCT === newCT) return generations;
  if (isMove(plansAfter, oldCT)) return generations;
  let changed = false;
  const out = (generations || []).map(g => {
    if (g.personaId !== personaId || g.classType !== oldCT) return g;
    changed = true;
    return { ...g, classType: newCT };
  });
  return changed ? out : generations;
}

// Distinct class types present in a persona's plans, first-seen order.
export function classTypesOf(plans) {
  const seen = [];
  (plans || []).forEach(pl => { const ct = classTypeOf(pl); if (!seen.includes(ct)) seen.push(ct); });
  return seen;
}

// Per-class-type derived profile: how this coach structures + schemes this class
// type, plus their default RIR / rest. Qualitative conventions & vocabulary are
// NOT derived here — they come from LLM extraction into style_profile.
export function aggregateClassType(plans, classType) {
  const ctPlans = (plans || []).filter(pl => classTypeOf(pl) === classType);
  const blocks = ctPlans.flatMap(pl => pl.plan?.blocks || []);
  // structure: role → # plans that include it, canonical order
  const roleMap = new Map();
  ctPlans.forEach(pl => {
    new Set((pl.plan?.blocks || []).map(b => b.role || "circuit")).forEach(r => {
      const e = roleMap.get(r) || { role: r, plans: 0 }; e.plans++; roleMap.set(r, e);
    });
  });
  const structure = [...roleMap.values()].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  // scheme mix
  const schemeMap = new Map();
  blocks.forEach(b => { const t = b.scheme?.type; if (t) schemeMap.set(t, (schemeMap.get(t) || 0) + 1); });
  const schemes = [...schemeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  // defaults
  const rir = mode(blocks.map(b => b.scheme?.rir).filter(v => v != null));
  const rpe = mode(blocks.map(b => rpeOf(b.scheme)).filter(v => v != null));
  const restByRole = {};
  ROLE_ORDER.forEach(role => {
    const md = median(blocks.filter(b => (b.role || "circuit") === role).map(b => b.scheme?.rest_sec));
    if (md != null) restByRole[role] = md;
  });
  return { classType, planCount: ctPlans.length, structure, schemes, defaults: { rir, rpe, restByRole } };
}

// Coarse training category for a class type, derived from its block roles, scheme
// mix and movement equipment/targets. Drives (a) which Builder class type is auto-
// selected on push and (b) in-category discipline during generation (no cardio in a
// strength class). Returns "strength" | "conditioning" | "endurance" | "mixed".
const ENDURANCE_RE = /\berg|row(?:ing|er)?|run(?:ning)?|ski|bike|assault|echo|sled|prowler|\d+\s?k\b|\d+\s?km|\d+\s?m\b|\d+\s?mi|meter|metre|calorie|\bcals?\b/i;
export function classCategory(plans, classType) {
  const ctPlans = (plans || []).filter(pl => classTypeOf(pl) === classType);
  const blocks = ctPlans.flatMap(pl => pl.plan?.blocks || []);
  if (!blocks.length) return "mixed";
  let strength = 0, cond = 0, endur = 0;
  blocks.forEach(b => {
    const role = b.role || "circuit";
    const type = b.scheme?.type;
    if (role === "primary_lift" || role === "superset") strength += 2;
    if (role === "circuit" || role === "finisher") cond += 1;
    if (type === "sets_reps") strength += 1;
    if (type === "amrap" || type === "interval" || type === "rounds") cond += 1;
    if (type === "time") endur += 1;
    (b.exercises || []).forEach(ex => {
      if (ENDURANCE_RE.test(`${ex.name || ""} ${ex.equip || ""} ${ex.target || ""}`)) endur += 1;
      // What the movement actually IS, not just what block it sits in (§9.2).
      // Roles and scheme types describe the container; this reads the contents,
      // so a "circuit" block full of barbell lifts stops voting conditioning.
      // Deliberately weighted 1 — a supporting signal, not an override, so the
      // existing role/scheme verdicts stand unless the movements clearly differ.
      const cat = classifyMovement(ex.name, ex.equip);
      if (cat === "strength") strength += 1;
      else if (cat === "conditioning") cond += 1;
    });
  });
  if (Math.max(strength, cond, endur) === 0) return "mixed";
  if (strength >= cond && strength >= endur) return "strength";
  if (endur > cond && endur >= 3) return "endurance";
  return "conditioning";
}

function aliasIndex(catalog) {
  const idx = new Map();
  (catalog || []).forEach(m => {
    idx.set(norm(m.name), m.name);
    (m.aliases || []).forEach(a => idx.set(norm(a), m.name));
  });
  return idx;
}
function commonScheme(schemes) {
  if (!schemes.length) return {};
  const out = { type: mode(schemes.map(s => s.type)), sets: mode(schemes.map(s => s.sets).filter(v => v != null)),
                rir: mode(schemes.map(s => s.rir).filter(v => v != null)), rpe: mode(schemes.map(rpeOf).filter(v => v != null)),
                rest_sec: median(schemes.map(s => s.rest_sec)) };
  Object.keys(out).forEach(k => (out[k] == null) && delete out[k]);
  return out;
}

// Derive the movement catalog from plans, canonicalizing names via the existing
// catalog's aliases, then MERGE into it — preserving each row's manual edits
// (id, aliases, equip override, meta, glossary_ref) while refreshing the derived
// fields (per-class-type counts, common scheme). Manually-edited rows with no
// current occurrences are kept (counts zeroed) so edits are never lost.
export function aggregateMovements(plans, catalog = []) {
  const idx = aliasIndex(catalog);
  const derived = new Map(); // canonical → { name, classTypes, equipVotes, schemes }
  (plans || []).forEach(pl => {
    const ct = classTypeOf(pl);
    (pl.plan?.blocks || []).forEach(b => (b.exercises || []).forEach(ex => {
      const raw = (ex.name || "").trim(); if (!raw) return;
      const canon = idx.get(norm(raw)) || raw;
      const e = derived.get(canon) || { name: canon, classTypes: {}, equipVotes: {}, schemes: [] };
      e.classTypes[ct] = (e.classTypes[ct] || 0) + 1;
      if (ex.equip) e.equipVotes[ex.equip] = (e.equipVotes[ex.equip] || 0) + 1;
      if (b.scheme) e.schemes.push(b.scheme);
      derived.set(canon, e);
    }));
  });
  const existingByName = new Map((catalog || []).map(m => [norm(m.name), m]));
  const usedExisting = new Set();
  const out = [];
  derived.forEach((d, canon) => {
    const ex = existingByName.get(norm(canon));
    const equip = ex?.equip || mode(Object.entries(d.equipVotes).flatMap(([k, n]) => Array(n).fill(k))) || "";
    // Derived category (§9.2). Always recomputed, so a row picks up improvements
    // to the rules — the coach's override is NOT stored here but in meta.category,
    // which survives via the `...ex` spread and wins at read time in categoryOf().
    // That split is what lets the derivation improve without ever overwriting a
    // coach's decision.
    const category = classifyMovement(canon, equip);
    if (ex) {
      usedExisting.add(norm(canon));
      // Local shape is camelCase (store maps to common_scheme on sync) — emitting
      // snake_case here previously hid the derived scheme from the catalog UI and
      // let savePersonaMovements clobber it to {} server-side.
      out.push({ ...ex, equip, category, classTypes: d.classTypes,
                 commonScheme: ex.meta?._schemeEdited ? (ex.commonScheme || ex.common_scheme) : commonScheme(d.schemes) });
    } else {
      out.push({ id: null, personaId: (catalog[0]?.personaId) || null, name: canon, aliases: [], equip, category,
                 classTypes: d.classTypes, commonScheme: commonScheme(d.schemes), glossaryRef: "", meta: {} });
    }
  });
  (catalog || []).forEach(m => {
    if (usedExisting.has(norm(m.name))) return;
    // A category override is a manual edit like any other and keeps the row
    // alive — it already counts via the meta key scan below, which is why that
    // scan is written as "any key that isn't the internal _schemeEdited flag".
    const manual = (m.aliases?.length) || m.equip || (m.meta && Object.keys(m.meta).some(k => k !== "_schemeEdited")) || m.glossaryRef;
    if (manual) out.push({ ...m, category: classifyMovement(m.name, m.equip), classTypes: {} });
  });
  return out.sort((a, b) => totalCount(b.classTypes) - totalCount(a.classTypes) || a.name.localeCompare(b.name));
}
