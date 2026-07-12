// ─── localStorage seam ────────────────────────────────────────────────────
// Single choke-point for every domain-data localStorage key (classes, library,
// brand, history, prefs). Spotify OAuth tokens/PKCE state and derived caches
// (GIF/BPM lookups) are intentionally NOT routed through here — they're
// session/cache state, not user content, and won't move to Postgres.
//
// This is a mechanical extraction: each getter/setter preserves the exact
// parse/fallback/try-catch behavior of the call site it replaced. Swapping
// the backend later means changing the bodies here, not the ~30 call sites.

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

// ── Classes (F5: user-created recurring classes) ──────────────────────────
export function getUserClasses() { return readJSON(KEYS.userClasses, []); }
export function saveUserClasses(classes) { writeJSON(KEYS.userClasses, classes); }

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
