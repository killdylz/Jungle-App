// ─── The gym's exercise-library overrides: a DELTA, not a snapshot (DEC-13) ───
//
// What this replaces, and why it mattered.
//
// The Exercise Library is "editable per gym". The first implementation kept that
// promise by writing the WHOLE merged catalogue back on every edit: adding one
// movement wrote all 10 class types, 27 sub-types and 330 exercises — 59,154
// bytes — to localStorage and, when synced, upserted that same blob to
// `library_overrides` on every keystroke-ish save.
//
// Two problems, and the second is the one that had teeth:
//
//   (a) PAYLOAD. 59 KB to Postgres per save, which is the cost store.js:207
//       already calls out for personas.
//
//   (b) THE FREEZE. The old read merged saved-over-built-in per class type with
//       `subTypes: {...built.subTypes, ...saved.subTypes}`. Because the saved
//       blob contained EVERY class type, the gym's snapshot won everywhere. So
//       any later improvement to src/data/library.js — a fixed rep count, a
//       better cue, a new movement — could never reach a gym that had once
//       pressed Save. "Editable per gym" quietly meant "frozen at first edit",
//       permanently and invisibly.
//
// The fix is to store only what the gym actually CHANGED. The unit of change is
// the POOL (one subType's warmup / main / cooldown list), because those lists
// are ordered and reorder is a real editing operation — diffing per-exercise
// would need order tracking to say the same thing. 81 pools, median 615 bytes:
// editing one movement now writes its one list, not the catalogue.
//
// The blast radius of an edit goes from "the entire catalogue, forever" to "the
// one list you edited". A gym that customises its CrossFit WOD main set still
// receives every future improvement to its warm-ups, to AMRAP, and to Spin.
// Nothing can un-freeze the exact list a gym has rewritten — that list is theirs
// — and nothing should.
//
// ── Format ───────────────────────────────────────────────────────────────────
//
//   { v: 2, classes: { [classKey]: <classDelta | null> } }
//
// A `null` value means the gym REMOVED that key; a key that is simply absent
// means "unchanged, take the built-in". No field in src/data/library.js is ever
// legitimately null, so null is free to carry the tombstone. A class or sub-type
// the built-in catalogue does not have is stored whole — there is nothing to
// diff it against.
//
// ── Reading a v1 blob ────────────────────────────────────────────────────────
//
// Blobs written before this change are full snapshots with no `v` field.
// `mergeLibrary` detects them and applies the OLD semantics verbatim, so no gym
// loses an edit on upgrade. The next save re-writes it as a v2 delta, which is
// where that gym stops being frozen. That conversion is lossless by
// construction: a pool identical to the built-in is dropped from the delta, and
// dropping it changes nothing; a pool that differs is kept. `libraryStore.test.js`
// pins the round-trip.

export const LIBRARY_BLOB_VERSION = 2;

// Key-order-insensitive, so a blob that has been through JSON and a few object
// spreads is not reported as "changed" when only its key order moved.
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Fields are compared generically rather than against a hard-coded list, so a
// new field in src/data/library.js needs no change here.
function diffFields(base, cur, skip) {
  const out = {};
  let changed = false;
  for (const k of Object.keys(cur)) {
    if (k === skip) continue;
    if (!deepEqual(cur[k], base[k])) { out[k] = cur[k]; changed = true; }
  }
  for (const k of Object.keys(base)) {
    if (k === skip || has(cur, k)) continue;
    out[k] = null; changed = true;
  }
  return changed ? out : null;
}

function diffClass(base, cur) {
  const out = diffFields(base, cur, "subTypes") || {};
  let changed = Object.keys(out).length > 0;

  const subs = {};
  const curSubs = cur.subTypes || {}, baseSubs = base.subTypes || {};
  for (const sk of Object.keys(curSubs)) {
    if (!has(baseSubs, sk)) { subs[sk] = curSubs[sk]; changed = true; continue; }
    const d = diffFields(baseSubs[sk], curSubs[sk], null);
    if (d) { subs[sk] = d; changed = true; }
  }
  for (const sk of Object.keys(baseSubs)) {
    if (!has(curSubs, sk)) { subs[sk] = null; changed = true; }
  }
  if (Object.keys(subs).length) out.subTypes = subs;
  return changed ? out : null;
}

// The edited catalogue in, the smallest blob that reproduces it out. Returns
// null when the gym's library is byte-for-byte the built-in one — the caller is
// expected to DELETE the override row in that case, so that a coach who edits
// something and then edits it back is genuinely un-customised again rather than
// carrying an empty snapshot that freezes them forever.
export function diffLibrary(builtIn, current) {
  if (!current || typeof current !== "object") return null;
  const classes = {};
  for (const ck of Object.keys(current)) {
    if (!has(builtIn, ck)) { classes[ck] = current[ck]; continue; }
    const d = diffClass(builtIn[ck], current[ck]);
    if (d) classes[ck] = d;
  }
  for (const ck of Object.keys(builtIn)) {
    if (!has(current, ck)) classes[ck] = null;
  }
  return Object.keys(classes).length ? { v: LIBRARY_BLOB_VERSION, classes } : null;
}

function applyFields(base, d, skip) {
  const out = { ...base };
  for (const [k, v] of Object.entries(d)) {
    if (k === skip) continue;
    if (v === null) delete out[k]; else out[k] = v;
  }
  return out;
}

function applyClass(base, d) {
  const out = applyFields(base, d, "subTypes");
  const subs = { ...(base.subTypes || {}) };
  for (const [sk, sd] of Object.entries(d.subTypes || {})) {
    if (sd === null) delete subs[sk];
    else if (!has(subs, sk)) subs[sk] = sd;
    else subs[sk] = applyFields(subs[sk], sd, null);
  }
  out.subTypes = subs;
  return out;
}

// The OLD merge, kept verbatim so a v1 blob reads exactly as it did before this
// change. Do not "improve" it — its job is to be bug-compatible with what wrote
// the blob, not to be right.
function mergeLegacy(builtIn, saved) {
  const merged = {};
  const allKeys = [...new Set([...Object.keys(builtIn), ...Object.keys(saved)])];
  allKeys.forEach(k => {
    if (saved[k]) {
      merged[k] = {
        ...(builtIn[k] || {}),
        ...saved[k],
        subTypes: { ...(builtIn[k]?.subTypes || {}), ...(saved[k]?.subTypes || {}) },
      };
    } else {
      merged[k] = builtIn[k];
    }
  });
  return merged;
}

// Built-in catalogue + whatever is stored → what the coach should see. Tolerates
// null (no overrides yet) and a v1 snapshot. Pure: callers use it inside render,
// so it must never write anything.
export function mergeLibrary(builtIn, blob) {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return builtIn;
  if (blob.v !== LIBRARY_BLOB_VERSION) return mergeLegacy(builtIn, blob);

  const out = { ...builtIn };
  for (const [ck, d] of Object.entries(blob.classes || {})) {
    if (d === null) delete out[ck];
    else if (!has(out, ck)) out[ck] = d;
    else out[ck] = applyClass(out[ck], d);
  }
  return out;
}

// True for a full-snapshot blob written before DEC-13. Exposed so a caller can
// report the migration rather than performing it silently.
export function isLegacyLibraryBlob(blob) {
  return !!blob && typeof blob === "object" && !Array.isArray(blob) && blob.v !== LIBRARY_BLOB_VERSION;
}

// ── One vocabulary for class_instances.class_type ───────────────────────────
//
// That column is what N2's cohort analytics group by, and it had THREE writers
// speaking two taxonomies. The Builder → Runner door writes a library KEY
// (`hiit`, or `gym-barre-ms4pk827` for a gym-authored type). The Schedule wrote
// whatever its own hand-maintained `CAT_COLOR` map was keyed by — display
// strings, capitalised: `HIIT`, `Mobility`. So one gym running one class type
// through two doors produced `"hiit"` and `"HIIT"`, which no `group by` will
// ever bring back together, and the column is not recoverable after the fact.
//
// Session 20 fixed the Runner's half (it was writing `"hiit · amrap"`) and
// recorded that both doors now agreed. They did not: the separator went away,
// the case mismatch stayed. This is the other half.
//
// 🔴 IT RETURNS THE RAW STRING WHEN NOTHING MATCHES, deliberately. The Schedule
// offered `Mobility`, which is not a class type the catalogue has at all, and
// mapping it to a near-neighbour would invent programming a gym never chose.
// Same reasoning `retention.js` gives for `INACTIVE_STATUSES` being an excluded
// set: an unrecognised value stays visible and keeps its own text, because
// silently rewriting data is worse than carrying a value we cannot classify.
export function resolveClassType(raw, lib) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const keys = Object.keys(lib || {});
  if (keys.includes(s)) return s;                       // already a key
  const want = s.toLowerCase();
  // Key first, then label: `hiit`'s label is "HIIT" and `strength`'s is
  // "Strength Training", so both spellings a gym could have stored resolve.
  const byKey = keys.find(k => k.toLowerCase() === want);
  if (byKey) return byKey;
  const byLabel = keys.find(k => String(lib[k]?.label ?? "").trim().toLowerCase() === want);
  return byLabel || s;
}
