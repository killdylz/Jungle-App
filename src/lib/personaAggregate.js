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

const ROLE_ORDER = ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"];
const norm = s => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const classTypeOf = pl => ((pl.classType || "").trim() || "Uncategorized");

function mode(arr) {
  const m = new Map(); let best, bestN = 0;
  arr.forEach(v => { if (v == null || v === "") return; const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bestN) { bestN = n; best = v; } });
  return best;
}
function median(arr) {
  const a = arr.filter(v => v != null).map(Number).filter(v => !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
function totalCount(ct) { return Object.values(ct || {}).reduce((a, b) => a + b, 0); }

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
  const restByRole = {};
  ROLE_ORDER.forEach(role => {
    const md = median(blocks.filter(b => (b.role || "circuit") === role).map(b => b.scheme?.rest_sec));
    if (md != null) restByRole[role] = md;
  });
  return { classType, planCount: ctPlans.length, structure, schemes, defaults: { rir, restByRole } };
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
                rir: mode(schemes.map(s => s.rir).filter(v => v != null)), rest_sec: median(schemes.map(s => s.rest_sec)) };
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
    if (ex) {
      usedExisting.add(norm(canon));
      out.push({ ...ex, equip, classTypes: d.classTypes,
                 common_scheme: ex.meta?._schemeEdited ? ex.common_scheme : commonScheme(d.schemes) });
    } else {
      out.push({ id: null, personaId: (catalog[0]?.personaId) || null, name: canon, aliases: [], equip,
                 classTypes: d.classTypes, common_scheme: commonScheme(d.schemes), glossaryRef: "", meta: {} });
    }
  });
  (catalog || []).forEach(m => {
    if (usedExisting.has(norm(m.name))) return;
    const manual = (m.aliases?.length) || m.equip || (m.meta && Object.keys(m.meta).some(k => k !== "_schemeEdited")) || m.glossaryRef;
    if (manual) out.push({ ...m, classTypes: {} });
  });
  return out.sort((a, b) => totalCount(b.classTypes) - totalCount(a.classTypes) || a.name.localeCompare(b.name));
}
