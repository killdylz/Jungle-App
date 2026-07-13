// ─── localStorage seam ────────────────────────────────────────────────────
// Single choke-point for every domain-data localStorage key (classes, library,
// brand, history, prefs). Spotify OAuth tokens/PKCE state and derived caches
// (GIF/BPM lookups) are intentionally NOT routed through here — they're
// session/cache state, not user content, and won't move to Postgres.
//
// This is a mechanical extraction: each getter/setter preserves the exact
// parse/fallback/try-catch behavior of the call site it replaced. Swapping
// the backend later means changing the bodies here, not the ~30 call sites.

import { supabase, supabaseEnabled } from "../supabase.js";

const KEYS = {
  userClasses:   "jungle_user_classes",
  libraryCustom: "jungle_library_custom",
  gymBranding:   "jungle_gym_branding",
  skinId:        "jungle_skin",
  customSkin:    "jungle_custom_skin",
  history:       "jungle_history",
  dispPrefs:     "jungle_disp_prefs",
  crossfade:     "jungle_crossfade",
  templateTracks:"jungle_tmpl_tracks",
  exdbKey:       "jungle_exdb_key",
  djEnergy:      "dj_energy",
  djBpmMin:      "dj_bpmMin",
  djBpmMax:      "dj_bpmMax",
  djTransition:  "dj_transition",
  djFollow:      "dj_follow",
  djRequests:    "dj_requests",
  djClean:       "dj_clean",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
function readStr(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}
function writeStr(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
function remove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

// ─── Supabase background sync (local-first) ─────────────────────────────────
// localStorage stays the instant, offline read layer. When Supabase is
// configured AND we know the current gym, domain writes also push to Postgres
// in the background, and a one-time hydrate pulls server state down. When
// Supabase is off (no env vars) or no gym is resolved, every sync path below is
// a no-op and the app behaves exactly as the pure-localStorage build.
let _ctx = { gymId: null, userId: null };
export function connect({ gymId, userId } = {}) {
  _ctx.gymId = gymId || null;
  _ctx.userId = userId || null;
}
function _synced() { return supabaseEnabled && !!supabase && !!_ctx.gymId; }

// ── Classes (F5: user-created recurring classes) ──────────────────────────
// Local shape: { id:"uc<ts>", name, type, coach, day, slot, dur, repeat, weekKey?, fill? }
// Postgres:    public.class_schedule_rules, with client_id == the local id.
function _classToRow(uc) {
  return {
    gym_id:     _ctx.gymId,
    client_id:  uc.id,
    name:       uc.name,
    class_type: uc.type,
    coach:      uc.coach || null,
    day:        uc.day || null,
    slot:       uc.slot || null,
    dur:        uc.dur || null,
    repeat:     uc.repeat || "weekly",
    week_key:   uc.weekKey || null,
    fill:       uc.fill || 0,
    created_by: _ctx.userId || null,
  };
}
function _rowToClass(r) {
  const uc = { id: r.client_id, name: r.name, type: r.class_type, coach: r.coach || "",
               day: r.day, slot: r.slot, dur: r.dur || "45m", repeat: r.repeat, fill: r.fill || 0 };
  if (r.week_key) uc.weekKey = r.week_key;
  return uc;
}

export function getUserClasses() { return readJSON(KEYS.userClasses, []); }

// Sync local write, then fire a background upsert to Postgres. Upsert-only — the
// Calendar UI has no delete path yet, so no reconcile-delete is needed; add one
// here when a remove-class action ships.
export function saveUserClasses(classes) {
  writeJSON(KEYS.userClasses, classes);
  if (!_synced()) return;
  const rows = (classes || []).map(_classToRow);
  if (!rows.length) return;
  supabase.from("class_schedule_rules")
    .upsert(rows, { onConflict: "gym_id,client_id" })
    .then(({ error }) => { if (error) console.warn("[store] saveUserClasses push failed:", error.message); },
          () => {});
}

// One-time hydrate: pull the gym's classes from Postgres into localStorage and
// return them (server wins). If the server has none but local does, seed the
// server from local instead and keep local. Returns null when not synced or on
// error, so the caller leaves its local value untouched.
export async function hydrateUserClasses() {
  if (!_synced()) return null;
  try {
    const { data, error } = await supabase
      .from("class_schedule_rules").select("*").eq("gym_id", _ctx.gymId);
    if (error) { console.warn("[store] hydrateUserClasses failed:", error.message); return null; }
    const serverRows = (data || []).map(_rowToClass);
    const local = getUserClasses();
    if (serverRows.length === 0 && local.length > 0) {
      saveUserClasses(local);   // seed server from pre-Supabase local data
      return null;              // keep local as-is (no flicker)
    }
    writeJSON(KEYS.userClasses, serverRows);
    return serverRows;
  } catch (e) {
    console.warn("[store] hydrateUserClasses error:", e?.message || e);
    return null;
  }
}

// ── Library (editable workout library overrides) ──────────────────────────
export function getLibraryCustom() { return readJSON(KEYS.libraryCustom, null); }
export function saveLibraryCustom(data) { writeJSON(KEYS.libraryCustom, data); }
export function resetLibraryCustom() { remove(KEYS.libraryCustom); }

// ── Brand (gym branding + skin/theme) ──────────────────────────────────────
export function getGymBranding() { return readJSON(KEYS.gymBranding, {}) || {}; }
export function saveGymBranding(branding) { writeJSON(KEYS.gymBranding, branding); }

export function getSkinId() { return readStr(KEYS.skinId, "canopy"); }
export function saveSkinId(id) { writeStr(KEYS.skinId, id); }
export function getCustomSkinTokens() { return readJSON(KEYS.customSkin, null); }
export function saveCustomSkinTokens(tokens) { writeJSON(KEYS.customSkin, tokens); }
export function clearCustomSkinTokens() { remove(KEYS.customSkin); }

// ── History (completed session log) ────────────────────────────────────────
export function getHistory() { return readJSON(KEYS.history, []); }
export function saveHistory(entries) { writeJSON(KEYS.history, entries); }

// ── Prefs ───────────────────────────────────────────────────────────────────
export function getDisplayPrefs() {
  const p = readJSON(KEYS.dispPrefs, {}) || {};
  return { preset: p.preset || "full", fontScale: p.fontScale || "m" };
}
export function saveDisplayPrefs(prefs) { writeJSON(KEYS.dispPrefs, prefs); }

export function getCrossfade() {
  try { return parseInt(localStorage.getItem(KEYS.crossfade) || "0") || 0; } catch (_) { return 0; }
}
export function saveCrossfade(v) { writeStr(KEYS.crossfade, String(v)); }

export function getTemplateTracks() { return readJSON(KEYS.templateTracks, {}); }
export function saveTemplateTracks(tracks) { writeJSON(KEYS.templateTracks, tracks); }

export function getExerciseDbKey() {
  try { return (localStorage.getItem(KEYS.exdbKey) || "").trim(); } catch (_) { return ""; }
}
export function saveExerciseDbKey(key) { writeStr(KEYS.exdbKey, key); }

// DJ settings (Music Hub)
export function getDjEnergy() { return readStr(KEYS.djEnergy, "High"); }
export function saveDjEnergy(v) { writeStr(KEYS.djEnergy, v); }
export function getDjBpmMin() { try { return Number(localStorage.getItem(KEYS.djBpmMin) || 120); } catch (_) { return 120; } }
export function getDjBpmMax() { try { return Number(localStorage.getItem(KEYS.djBpmMax) || 142); } catch (_) { return 142; } }
export function saveDjBpmRange(min, max) { writeStr(KEYS.djBpmMin, String(min)); writeStr(KEYS.djBpmMax, String(max)); }
export function getDjTransition() { return readStr(KEYS.djTransition, "Beat-match"); }
export function saveDjTransition(v) { writeStr(KEYS.djTransition, v); }
export function getDjFollowStructure() { try { return localStorage.getItem(KEYS.djFollow) !== "false"; } catch (_) { return true; } }
export function saveDjFollowStructure(v) { writeStr(KEYS.djFollow, String(v)); }
export function getDjTakeRequests() { try { return localStorage.getItem(KEYS.djRequests) !== "false"; } catch (_) { return true; } }
export function saveDjTakeRequests(v) { writeStr(KEYS.djRequests, String(v)); }
export function getDjCleanEdits() { try { return localStorage.getItem(KEYS.djClean) !== "false"; } catch (_) { return true; } }
export function saveDjCleanEdits(v) { writeStr(KEYS.djClean, String(v)); }
