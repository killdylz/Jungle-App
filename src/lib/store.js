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
  personas:      "jungle_personas",
  personaPlans:  "jungle_persona_plans",
  personaMoves:  "jungle_persona_movements",
  personaGens:   "jungle_persona_generations",
  members:       "jungle_members",
  classInstances:"jungle_class_instances",
  attendance:    "jungle_attendance",
};

// Client-generated UUID, used as the row PK on both coach_personas and
// persona_plans so the persona→plans FK bridges cleanly in the local-first
// flow (create locally, sync later, same id server-side). Prefers the native
// generator; the fallback stays uuid-v4-shaped so Postgres accepts it.
export function newId() {
  try { return crypto.randomUUID(); } catch (_) {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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

// Sync-failure ledger. "A failure just leaves localStorage as the source of truth"
// was only half true: a hydrate that is server-wins will then happily overwrite that
// localStorage with a server list which never received the failed rows — silently
// destroying data whose only surviving copy was local. So failures are RECORDED
// (and persisted, to survive a reload) and the hydrate path consults them before
// overwriting anything. Cleared on the next successful write to that table.
const SYNC_ERR_KEY = "jungle_sync_errors";
function _noteSyncError(table, msg) {
  try {
    const all = readJSON(SYNC_ERR_KEY, {});
    all[table] = { msg: String(msg || "unknown"), at: Date.now() };
    writeJSON(SYNC_ERR_KEY, all);
  } catch (_) { /* never let bookkeeping break a write */ }
}
function _clearSyncError(table) {
  try {
    const all = readJSON(SYNC_ERR_KEY, {});
    if (all[table]) { delete all[table]; writeJSON(SYNC_ERR_KEY, all); }
  } catch (_) { /* ignore */ }
}
// { msg, at } for the last failed write to `table`, or null when it last succeeded.
export function syncErrorFor(table) { return readJSON(SYNC_ERR_KEY, {})[table] || null; }

// Tables whose last write failed. Drives the UI's "not synced" banner and lets a
// caller ask the general question ("is anything unsynced?") rather than naming
// each table — which is how domains kept getting missed.
export function syncErrors() {
  const all = readJSON(SYNC_ERR_KEY, {});
  return Object.keys(all).map(table => ({ table, ...all[table] }));
}

// ── The two hydrate guards (infra backlog I3) ────────────────────────────────
// `_bgUpsert` failure + a server-wins `hydrate*` = SILENT DATA LOSS. That pairing
// destroyed a coach's imported corpus on 2026-07-18: the write failed a CHECK
// constraint, the failure went to console.warn, and the next hydrate overwrote
// localStorage with a server list that had never received the rows.
//
// The fix was applied to persona_plans alone. Every other domain still had the
// same shape, so the guard is generalised here and applied to all of them. Two
// shapes need two guards:

// (1) ID-KEYED LISTS — keep rows the server has never seen and re-push them.
// Returns the list the caller should write to localStorage.
// Exported for tests: this is the last line of defence against silent data loss,
// so it is worth pinning directly rather than through a hydrate that needs a
// live Supabase. Same reasoning as _ciToRow.
export function _guardList(table, serverRows, getLocal, resave, label = table) {
  if (!syncErrorFor(table)) return serverRows;
  const onServer = new Set((serverRows || []).map(r => r.id));
  const localOnly = (getLocal() || []).filter(r => r && !onServer.has(r.id));
  if (!localOnly.length) return serverRows;
  console.warn(`[store] ${label}: keeping ${localOnly.length} local row(s) the server never received; retrying push`);
  const merged = [...serverRows, ...localOnly];
  resave(merged);                 // writes local + retries the upsert
  return merged;
}

// (2) SINGLE-ROW BLOBS (one row per gym / per user: library_overrides,
// brand_profiles, user_prefs). There are no per-row ids to diff, so the question
// is simply "did our last write land?". If it did not, the server copy is STALE
// and letting it win would silently revert the user's most recent change — the
// same data loss, one row at a time. Keep local, re-push, and let the next
// successful write clear the flag.
export function _blobStale(table) {
  if (!syncErrorFor(table)) return false;
  console.warn(`[store] ${table}: last write failed, so the server copy is stale — keeping local and re-pushing`);
  return true;
}

// Fire-and-forget writes — never block or throw into the caller.
function _bgUpsert(table, row, onConflict) {
  supabase.from(table).upsert(row, { onConflict }).then(
    ({ error }) => {
      if (error) { console.warn(`[store] ${table} upsert failed:`, error.message); _noteSyncError(table, error.message); }
      else _clearSyncError(table);
    },
    (e) => _noteSyncError(table, e?.message || e));
}
function _bgDelete(table, col, val) {
  supabase.from(table).delete().eq(col, val).then(
    ({ error }) => { if (error) console.warn(`[store] ${table} delete failed:`, error.message); },
    () => {});
}

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
  // Records into the sync-failure ledger like every other domain. This one used to
  // console.warn ONLY, which meant hydrateUserClasses (server-wins) had no way to
  // know a class the coach just added had never reached Postgres.
  supabase.from("class_schedule_rules")
    .upsert(rows, { onConflict: "gym_id,client_id" })
    .then(({ error }) => {
      if (error) { console.warn("[store] saveUserClasses push failed:", error.message); _noteSyncError("class_schedule_rules", error.message); }
      else _clearSyncError("class_schedule_rules");
    },
    (e) => _noteSyncError("class_schedule_rules", e?.message || e));
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
    const rows = _guardList("class_schedule_rules", serverRows, getUserClasses, saveUserClasses);
    writeJSON(KEYS.userClasses, rows);
    return rows;
  } catch (e) {
    console.warn("[store] hydrateUserClasses error:", e?.message || e);
    return null;
  }
}

// ── Library (editable workout library overrides) → public.library_overrides ──
// One jsonb blob per gym (per-gym, admin-write RLS).
export function getLibraryCustom() { return readJSON(KEYS.libraryCustom, null); }
export function saveLibraryCustom(data) {
  writeJSON(KEYS.libraryCustom, data);
  if (_synced()) _bgUpsert("library_overrides", { gym_id: _ctx.gymId, data }, "gym_id");
}
export function resetLibraryCustom() {
  remove(KEYS.libraryCustom);
  if (_synced()) _bgDelete("library_overrides", "gym_id", _ctx.gymId);
}
// Server wins into localStorage; seed the server from local when it has no row.
// Read on demand via getLibrary()/getLibraryCustom(), so no return value needed.
async function _hydrateLibrary() {
  if (!_synced()) return;
  try {
    const { data, error } = await supabase.from("library_overrides")
      .select("data").eq("gym_id", _ctx.gymId).maybeSingle();
    if (error) { console.warn("[store] hydrate library failed:", error.message); return; }
    if (!data) { const local = getLibraryCustom(); if (local) _bgUpsert("library_overrides", { gym_id: _ctx.gymId, data: local }, "gym_id"); return; }
    // Our last write failed → the server blob predates the coach's newest library
    // edit, and overwriting local with it would silently revert that edit.
    if (_blobStale("library_overrides")) { saveLibraryCustom(getLibraryCustom()); return; }
    writeJSON(KEYS.libraryCustom, data.data);
  } catch (e) { console.warn("[store] hydrate library error:", e?.message || e); }
}

// ── Brand (gym branding + skin/theme) → public.brand_profiles ────────────────
// One row per gym (per-gym, admin-write RLS). Each setter does a partial upsert
// of just its column, so they compose without clobbering each other. skin id
// lives in brand_profiles.active_skin_id (0004) because gyms.active_skin_id is
// read-only under RLS.
export function getGymBranding() { return readJSON(KEYS.gymBranding, {}) || {}; }
export function saveGymBranding(branding) {
  writeJSON(KEYS.gymBranding, branding);
  if (_synced()) _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, branding }, "gym_id");
}

export function getSkinId() { return readStr(KEYS.skinId, "canopy"); }
export function saveSkinId(id) {
  writeStr(KEYS.skinId, id);
  if (_synced()) _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, active_skin_id: id }, "gym_id");
}
export function getCustomSkinTokens() { return readJSON(KEYS.customSkin, null); }
export function saveCustomSkinTokens(tokens) {
  writeJSON(KEYS.customSkin, tokens);
  if (_synced()) _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, custom_skin_tokens: tokens }, "gym_id");
}
export function clearCustomSkinTokens() {
  remove(KEYS.customSkin);
  if (_synced()) _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, custom_skin_tokens: null }, "gym_id");
}
// Server wins into localStorage; returns { skinId, customSkinTokens, branding }
// for the App root to setState. Seeds the server from local when it has no row.
async function _hydrateBrand() {
  if (!_synced()) return null;
  try {
    const { data, error } = await supabase.from("brand_profiles")
      .select("active_skin_id, custom_skin_tokens, branding").eq("gym_id", _ctx.gymId).maybeSingle();
    if (error) { console.warn("[store] hydrate brand failed:", error.message); return null; }
    if (!data) {
      _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, active_skin_id: getSkinId(),
        custom_skin_tokens: getCustomSkinTokens(), branding: getGymBranding() }, "gym_id");
      return null;
    }
    // A failed write means the server row is behind the studio's newest branding
    // change. Letting it win would revert the coach's logo/colour edit with no
    // error anywhere — re-push local instead and return it unchanged.
    if (_blobStale("brand_profiles")) {
      _bgUpsert("brand_profiles", { gym_id: _ctx.gymId, active_skin_id: getSkinId(),
        custom_skin_tokens: getCustomSkinTokens(), branding: getGymBranding() }, "gym_id");
      return { skinId: getSkinId(), customSkinTokens: getCustomSkinTokens(), branding: getGymBranding() };
    }
    if (data.active_skin_id) writeStr(KEYS.skinId, data.active_skin_id);
    if (data.custom_skin_tokens) writeJSON(KEYS.customSkin, data.custom_skin_tokens); else remove(KEYS.customSkin);
    writeJSON(KEYS.gymBranding, data.branding || {});
    return { skinId: data.active_skin_id || null, customSkinTokens: data.custom_skin_tokens || null, branding: data.branding || {} };
  } catch (e) { console.warn("[store] hydrate brand error:", e?.message || e); return null; }
}

// ── History (completed session log) → public.session_history (append-only) ───
export function getHistory() { return readJSON(KEYS.history, []); }
// Local write only — the whole capped array. The server is append-only, so the
// per-session insert is a separate call (appendSessionHistory), made alongside.
export function saveHistory(entries) { writeJSON(KEYS.history, entries); }

function _historyToRow(rec) {
  return {
    gym_id: _ctx.gymId, user_id: _ctx.userId || null,
    session_date: rec.date, name: rec.name || null,
    stage_count: rec.stages ?? null, dur_min: rec.durMin ?? null,
    stage_types: rec.stageTypes || null,
    ts: rec.ts ? new Date(rec.ts).toISOString() : new Date().toISOString(),
  };
}
function _rowToHistory(r) {
  return { date: r.session_date, name: r.name, stages: r.stage_count, durMin: r.dur_min,
           ts: r.ts ? new Date(r.ts).getTime() : Date.now(), stageTypes: r.stage_types || [] };
}
// Immutable insert of one completed session. Local cap/write stays in saveHistory().
export function appendSessionHistory(record) {
  if (!_synced()) return;
  supabase.from("session_history").insert(_historyToRow(record)).then(
    ({ error }) => { if (error) console.warn("[store] appendSessionHistory failed:", error.message); },
    () => {});
}
// Merge server + local by ts (an append log must never drop offline sessions),
// push any local-only sessions up, cap to 100. Returns the merged list.
async function _hydrateHistory() {
  if (!_synced()) return null;
  try {
    const { data, error } = await supabase.from("session_history").select("*")
      .eq("gym_id", _ctx.gymId).order("ts", { ascending: false }).limit(100);
    if (error) { console.warn("[store] hydrate history failed:", error.message); return null; }
    const server = (data || []).map(_rowToHistory);
    const seen = new Set(server.map(r => r.ts));
    const localOnly = getHistory().filter(r => !seen.has(r.ts));
    localOnly.forEach(r => appendSessionHistory(r));
    const merged = [...server, ...localOnly].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 100);
    writeJSON(KEYS.history, merged);
    return merged;
  } catch (e) { console.warn("[store] hydrate history error:", e?.message || e); return null; }
}

// ── Prefs → public.user_prefs (per-user; user_id = auth.uid() RLS) ────────────
export function getDisplayPrefs() {
  const p = readJSON(KEYS.dispPrefs, {}) || {};
  return { preset: p.preset || "full", fontScale: p.fontScale || "m" };
}
export function saveDisplayPrefs(prefs) {
  writeJSON(KEYS.dispPrefs, prefs);
  if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, display_preset: prefs.preset, display_font_scale: prefs.fontScale }, "user_id");
}

export function getCrossfade() {
  try { return parseInt(localStorage.getItem(KEYS.crossfade) || "0") || 0; } catch (_) { return 0; }
}
export function saveCrossfade(v) {
  writeStr(KEYS.crossfade, String(v));
  if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, crossfade: Number(v) || 0 }, "user_id");
}

export function getTemplateTracks() { return readJSON(KEYS.templateTracks, {}); }
export function saveTemplateTracks(tracks) {
  writeJSON(KEYS.templateTracks, tracks);
  if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, template_tracks: tracks || {} }, "user_id");
}

export function getExerciseDbKey() {
  try { return (localStorage.getItem(KEYS.exdbKey) || "").trim(); } catch (_) { return ""; }
}
export function saveExerciseDbKey(key) {
  writeStr(KEYS.exdbKey, key);
  if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, exercise_db_key: key }, "user_id");
}

// DJ settings (Music Hub) — also columns on public.user_prefs
export function getDjEnergy() { return readStr(KEYS.djEnergy, "High"); }
export function saveDjEnergy(v) { writeStr(KEYS.djEnergy, v); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_energy: v }, "user_id"); }
export function getDjBpmMin() { try { return Number(localStorage.getItem(KEYS.djBpmMin) || 120); } catch (_) { return 120; } }
export function getDjBpmMax() { try { return Number(localStorage.getItem(KEYS.djBpmMax) || 142); } catch (_) { return 142; } }
export function saveDjBpmRange(min, max) { writeStr(KEYS.djBpmMin, String(min)); writeStr(KEYS.djBpmMax, String(max)); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_bpm_min: Number(min), dj_bpm_max: Number(max) }, "user_id"); }
export function getDjTransition() { return readStr(KEYS.djTransition, "Beat-match"); }
export function saveDjTransition(v) { writeStr(KEYS.djTransition, v); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_transition: v }, "user_id"); }
export function getDjFollowStructure() { try { return localStorage.getItem(KEYS.djFollow) !== "false"; } catch (_) { return true; } }
export function saveDjFollowStructure(v) { writeStr(KEYS.djFollow, String(v)); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_follow_structure: !!v }, "user_id"); }
export function getDjTakeRequests() { try { return localStorage.getItem(KEYS.djRequests) !== "false"; } catch (_) { return true; } }
export function saveDjTakeRequests(v) { writeStr(KEYS.djRequests, String(v)); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_take_requests: !!v }, "user_id"); }
export function getDjCleanEdits() { try { return localStorage.getItem(KEYS.djClean) !== "false"; } catch (_) { return true; } }
export function saveDjCleanEdits(v) { writeStr(KEYS.djClean, String(v)); if (_synced()) _bgUpsert("user_prefs", { user_id: _ctx.userId, dj_clean_edits: !!v }, "user_id"); }

// Server wins into localStorage for every pref key; returns the App-root-held
// values (crossfade, templateTracks). Display prefs + DJ settings are read from
// the hydrated localStorage by their own screens on mount. Seeds when no row.
async function _hydratePrefs() {
  if (!_synced()) return null;
  try {
    const { data, error } = await supabase.from("user_prefs").select("*").eq("user_id", _ctx.userId).maybeSingle();
    if (error) { console.warn("[store] hydrate prefs failed:", error.message); return null; }
    if (!data) {
      const dp = getDisplayPrefs();
      _bgUpsert("user_prefs", {
        user_id: _ctx.userId, display_preset: dp.preset, display_font_scale: dp.fontScale,
        crossfade: getCrossfade(), exercise_db_key: getExerciseDbKey() || null, template_tracks: getTemplateTracks(),
        dj_energy: getDjEnergy(), dj_bpm_min: getDjBpmMin(), dj_bpm_max: getDjBpmMax(), dj_transition: getDjTransition(),
        dj_follow_structure: getDjFollowStructure(), dj_take_requests: getDjTakeRequests(), dj_clean_edits: getDjCleanEdits(),
      }, "user_id");
      return null;
    }
    // Same rule as the other single-row blobs: if our last write failed, the server
    // row is stale and server-wins would quietly undo the setting the user just
    // changed. Return local so the App root setStates what the user actually chose.
    if (_blobStale("user_prefs")) {
      return { crossfade: Number(getCrossfade()) || 0, templateTracks: getTemplateTracks() };
    }
    writeJSON(KEYS.dispPrefs, { preset: data.display_preset || "full", fontScale: data.display_font_scale || "m" });
    writeStr(KEYS.crossfade, String(data.crossfade ?? 0));
    writeJSON(KEYS.templateTracks, data.template_tracks || {});
    if (data.exercise_db_key != null) writeStr(KEYS.exdbKey, data.exercise_db_key);
    writeStr(KEYS.djEnergy, data.dj_energy || "High");
    writeStr(KEYS.djBpmMin, String(data.dj_bpm_min ?? 120));
    writeStr(KEYS.djBpmMax, String(data.dj_bpm_max ?? 142));
    writeStr(KEYS.djTransition, data.dj_transition || "Beat-match");
    writeStr(KEYS.djFollow, String(data.dj_follow_structure !== false));
    writeStr(KEYS.djRequests, String(data.dj_take_requests !== false));
    writeStr(KEYS.djClean, String(data.dj_clean_edits !== false));
    return { crossfade: data.crossfade ?? 0, templateTracks: data.template_tracks || {} };
  } catch (e) { console.warn("[store] hydrate prefs error:", e?.message || e); return null; }
}

// ── Coach personas (workstream D) → public.coach_personas / persona_plans ────
// Persona-first planning. A persona is the unit you define up front; historical
// class plans are attached to it as the corpus. Both tables are gym-scoped,
// admin-write RLS (mirrors library/brand). Row PKs are client-generated (newId)
// so persona.id === persona_plans.persona_id links locally and after sync.
// Local persona shape: { id, name, kind, description, styleProfile:{}, profileUpdatedAt }
// Local plan shape:    { id, personaId, source, sourceRef, title, classType, focus, planDate, plan:{blocks:[]} }
export function getPersonas()     { return readJSON(KEYS.personas, []); }
// Normalized on READ as well as write, so a corpus imported before the source fix
// heals itself the moment it's loaded — the UI shows the right label and the next
// save pushes a value the CHECK constraint accepts. See planSource() below.
export function getPersonaPlans() {
  return readJSON(KEYS.personaPlans, []).map(pl => {
    const s = planSource(pl.source);
    return s === pl.source ? pl : { ...pl, source: s };
  });
}

function _personaToRow(p) {
  return { id: p.id, gym_id: _ctx.gymId, name: p.name, kind: p.kind || "coach",
           description: p.description || null, style_profile: p.styleProfile || {},
           profile_updated_at: p.profileUpdatedAt || null, created_by: _ctx.userId || null };
}
function _rowToPersona(r) {
  return { id: r.id, name: r.name, kind: r.kind || "coach", description: r.description || "",
           styleProfile: r.style_profile || {}, profileUpdatedAt: r.profile_updated_at || null };
}
// persona_plans.source has a CHECK constraint (migration 0005) allowing exactly
// these three values. Sending anything else fails the upsert — and because we
// upsert the whole list in ONE call, a single bad row silently blocks EVERY plan
// from syncing. hydratePersonas is server-wins, so the next visit to the Personas
// screen then overwrites localStorage with a server list that never received them:
// the coach's imported corpus disappears with no error anywhere but the console.
//
// That is exactly what happened — the importer wrote "slides" and the paste-deck
// path wrote "extract", neither of which the constraint allows. Both call sites are
// fixed, and this normalizer repairs rows ALREADY sitting in localStorage from
// before the fix, so they sync on the next save instead of staying poisoned.
const PLAN_SOURCES  = new Set(["google_slides", "manual", "jungle"]);
const LEGACY_SOURCE = { slides: "google_slides", extract: "manual" };
export function planSource(s) {
  // Type-guard rather than `(s || "")`: a non-string source (corrupted localStorage,
  // a number) would throw on .trim() INSIDE the save path — turning the function
  // that exists to keep bad values out of the column into the thing that breaks the
  // write. Caught by a test; worth the extra clause.
  const v = (typeof s === "string" ? s : "").trim() || "manual";
  return PLAN_SOURCES.has(v) ? v : (LEGACY_SOURCE[v] || "manual");
}

function _planToRow(pl) {
  return { id: pl.id, gym_id: _ctx.gymId, persona_id: pl.personaId, source: planSource(pl.source),
           source_ref: pl.sourceRef || null, title: pl.title || null, class_type: pl.classType || null,
           focus: pl.focus || null, plan_date: pl.planDate || null, plan: pl.plan || {},
           created_by: _ctx.userId || null };
}
function _rowToPlan(r) {
  return { id: r.id, personaId: r.persona_id, source: r.source || "manual", sourceRef: r.source_ref || "",
           title: r.title || "", classType: r.class_type || "", focus: r.focus || "",
           planDate: r.plan_date || "", plan: r.plan || {} };
}

// Upsert the whole persona list (local write + background push, onConflict id).
export function savePersonas(personas) {
  writeJSON(KEYS.personas, personas);
  if (!_synced()) return;
  const rows = (personas || []).map(_personaToRow);
  if (rows.length) _bgUpsert("coach_personas", rows, "id");
}
export function savePersonaPlans(plans) {
  writeJSON(KEYS.personaPlans, plans);
  if (!_synced()) return;
  const rows = (plans || []).map(_planToRow);
  if (rows.length) _bgUpsert("persona_plans", rows, "id");
}
// Delete a persona + its plans locally; server plans cascade via the FK.
export function deletePersona(id) {
  const personas = getPersonas().filter(p => p.id !== id);
  const plans    = getPersonaPlans().filter(pl => pl.personaId !== id);
  writeJSON(KEYS.personas, personas);
  writeJSON(KEYS.personaPlans, plans);
  if (_synced()) _bgDelete("coach_personas", "id", id);
  return { personas, plans };
}
export function deletePersonaPlan(id) {
  const plans = getPersonaPlans().filter(pl => pl.id !== id);
  writeJSON(KEYS.personaPlans, plans);
  if (_synced()) _bgDelete("persona_plans", "id", id);
  return plans;
}

// Movement catalog (persona_movements) — normalized, editable, aggregated from
// plans. Local shape: { id, personaId, name, aliases:[], equip, classTypes:{},
// commonScheme:{}, glossaryRef, meta:{} }.
export function getPersonaMovements() { return readJSON(KEYS.personaMoves, []); }
function _moveToRow(m) {
  return { id: m.id, gym_id: _ctx.gymId, persona_id: m.personaId, name: m.name,
           aliases: m.aliases || [], equip: m.equip || null, class_types: m.classTypes || {},
           common_scheme: m.commonScheme || m.common_scheme || {}, glossary_ref: m.glossaryRef || null,
           meta: m.meta || {} };
}
function _rowToMove(r) {
  return { id: r.id, personaId: r.persona_id, name: r.name, aliases: r.aliases || [], equip: r.equip || "",
           classTypes: r.class_types || {}, commonScheme: r.common_scheme || {}, glossaryRef: r.glossary_ref || "",
           meta: r.meta || {} };
}
// Save the whole catalog for a persona. Rows may arrive from aggregation without
// an id (freshly derived) — mint one so the row keys locally and after sync.
export function savePersonaMovements(moves) {
  const withIds = (moves || []).map(m => (m.id ? m : { ...m, id: newId() }));
  writeJSON(KEYS.personaMoves, withIds);
  if (_synced()) {
    const rows = withIds.map(m => ({ ...m, common_scheme: m.commonScheme || {} })).map(_moveToRow);
    if (rows.length) _bgUpsert("persona_movements", rows, "id");
  }
  return withIds;
}
export function deletePersonaMovement(id) {
  const moves = getPersonaMovements().filter(m => m.id !== id);
  writeJSON(KEYS.personaMoves, moves);
  if (_synced()) _bgDelete("persona_movements", "id", id);
  return moves;
}

// Generation ledger (persona_generations) — every class the generate flow produced
// for a coach, so future generations avoid repeating (items 6–8). Local shape:
// { id, personaId, classType, category, title, focus, brief:{}, movements:[], plan:{}, createdAt }.
// Capped to the most recent GEN_CAP per persona locally to stay bounded.
const GEN_CAP = 50;
export function getPersonaGenerations() { return readJSON(KEYS.personaGens, []); }
function _genToRow(g) {
  return { id: g.id, gym_id: _ctx.gymId, persona_id: g.personaId, class_type: g.classType || "",
           category: g.category || "mixed", title: g.title || "", focus: g.focus || "",
           brief: g.brief || {}, movements: g.movements || [], plan: g.plan || {},
           created_by: _ctx.userId || null, created_at: g.createdAt || new Date().toISOString() };
}
function _rowToGen(r) {
  return { id: r.id, personaId: r.persona_id, classType: r.class_type || "", category: r.category || "mixed",
           title: r.title || "", focus: r.focus || "", brief: r.brief || {}, movements: r.movements || [],
           plan: r.plan || {}, createdAt: r.created_at || "" };
}
// Append one generation (newest-first), cap per persona, and background-insert it.
export function appendPersonaGeneration(gen) {
  const row = { ...gen, id: gen.id || newId(), createdAt: gen.createdAt || new Date().toISOString() };
  const all = [row, ...getPersonaGenerations().filter(g => g.id !== row.id)];
  const perCount = {};
  const capped = all.filter(g => (perCount[g.personaId] = (perCount[g.personaId] || 0) + 1) <= GEN_CAP);
  writeJSON(KEYS.personaGens, capped);
  if (_synced()) _bgUpsert("persona_generations", [_genToRow(row)], "id");
  return capped;
}
export function savePersonaGenerations(list) {
  writeJSON(KEYS.personaGens, list || []);
  if (_synced()) {
    const rows = (list || []).map(_genToRow);
    if (rows.length) _bgUpsert("persona_generations", rows, "id");
  }
}

// One-time hydrate for the Personas screen: pull both tables for the gym
// (server wins), seed the server from local when it has none. Returns
// { personas, plans } or null when not synced / on error (caller keeps local).
export async function hydratePersonas() {
  if (!_synced()) return null;
  try {
    const [pRes, plRes, mRes] = await Promise.all([
      supabase.from("coach_personas").select("*").eq("gym_id", _ctx.gymId),
      supabase.from("persona_plans").select("*").eq("gym_id", _ctx.gymId),
      supabase.from("persona_movements").select("*").eq("gym_id", _ctx.gymId),
    ]);
    if (pRes.error || plRes.error || mRes.error) {
      console.warn("[store] hydratePersonas failed:", (pRes.error || plRes.error || mRes.error).message);
      return null;
    }
    // Generation ledger is optional — pulled defensively so a not-yet-applied 0006
    // never breaks core persona hydration. serverGens stays null if the table is absent.
    let serverGens = null;
    try {
      const gRes = await supabase.from("persona_generations").select("*").eq("gym_id", _ctx.gymId);
      if (!gRes.error) serverGens = (gRes.data || []).map(_rowToGen);
    } catch (_) { /* table may not exist yet */ }

    const serverPersonas = (pRes.data || []).map(_rowToPersona);
    const serverPlans    = (plRes.data || []).map(_rowToPlan);
    const serverMoves    = (mRes.data || []).map(_rowToMove);
    const local = getPersonas();
    if (serverPersonas.length === 0 && local.length > 0) {
      savePersonas(local);                 // seed server from pre-sync local
      savePersonaPlans(getPersonaPlans());
      savePersonaMovements(getPersonaMovements());
      if (serverGens !== null) savePersonaGenerations(getPersonaGenerations());
      return null;                         // keep local as-is (no flicker)
    }
    // Server-wins is correct ONLY when the local writes actually landed. Guard all
    // FOUR persona tables, not just plans: a persona whose creation never synced is
    // just as gone, and it takes its plans' foreign key with it. (Previously only
    // persona_plans was guarded — the others still had the shape that caused the
    // 2026-07-18 corpus loss.)
    const personas  = _guardList("coach_personas", serverPersonas, getPersonas, savePersonas);
    const plans     = _guardList("persona_plans", serverPlans, getPersonaPlans, savePersonaPlans);
    const movements = _guardList("persona_movements", serverMoves, getPersonaMovements, savePersonaMovements);
    const gens      = serverGens === null ? getPersonaGenerations()
                    : _guardList("persona_generations", serverGens, getPersonaGenerations, savePersonaGenerations);

    writeJSON(KEYS.personas, personas);
    writeJSON(KEYS.personaPlans, plans);
    writeJSON(KEYS.personaMoves, movements);
    if (serverGens !== null) writeJSON(KEYS.personaGens, gens);
    return { personas, plans, movements, generations: gens };
  } catch (e) {
    console.warn("[store] hydratePersonas error:", e?.message || e);
    return null;
  }
}

// ── F4 attendance spine (migration 0007) ─────────────────────────────────────
// members / class_instances / attendance. The critical-path data spine: every
// delivered session writes attendance, and the retention instrument is priced
// against it.
//
// TWO WAYS THIS SECTION DIFFERS FROM EVERY OTHER DOMAIN ABOVE — both deliberate:
//
// 1. `attendance` is INSERT-ONLY server-side (0007 grants read+insert and no
//    update/delete policy at all). So it must NOT use the whole-list `_bgUpsert`
//    pattern: a re-upsert of an existing row compiles to ON CONFLICT DO UPDATE,
//    which has no policy and would silently affect zero rows. It follows
//    session_history's append+merge shape instead, and the one place a conflict
//    is expected uses ignoreDuplicates (ON CONFLICT DO NOTHING — insert-only).
// 2. Hydrate MERGES attendance rather than letting the server win. A check-in
//    recorded on a coach's phone in a dead-Wi-Fi room is the only copy that
//    exists; server-wins would delete it (exactly how the persona_plans data
//    loss happened on 2026-07-18).

// The three values 0007's CHECK constraint allows on attendance.source. Pinned in
// ONE place with a unit test precisely because that constraint class already cost
// us live data once: persona_plans.source rejected the client's value, the
// background write failed silently, and a server-wins hydrate then destroyed the
// only remaining copy. Never inline a raw source string at a call site.
export const ATTENDANCE_SOURCES = ["qr", "coach", "import"];
export function attendanceSource(s) {
  return ATTENDANCE_SOURCES.includes(s) ? s : "coach";
}

// ── members: roster rows, NOT auth users ────────────────────────────────────
// Local shape: { id, name, email, status, joinedAt, externalRef }
function _memberToRow(m) {
  return { id: m.id, gym_id: _ctx.gymId, name: m.name, email: m.email || null,
           status: m.status || "active", joined_at: m.joinedAt || null,
           external_ref: m.externalRef || null, created_by: _ctx.userId || null };
}
function _rowToMember(r) {
  return { id: r.id, name: r.name || "", email: r.email || "", status: r.status || "active",
           joinedAt: r.joined_at || "", externalRef: r.external_ref || "" };
}
export function getMembers() { return readJSON(KEYS.members, []); }
export function saveMembers(list) {
  writeJSON(KEYS.members, list || []);
  if (!_synced()) return;
  const rows = (list || []).map(_memberToRow);
  if (rows.length) _bgUpsert("members", rows, "id");
}
// Quick-add during check-in: a name is all that's required, because anything
// more is a form a coach won't fill in mid-class and P6 gives us <5 seconds.
export function addMember(name, extra = {}) {
  const m = { id: newId(), name: String(name || "").trim(),
              email: extra.email || "", status: "active",
              joinedAt: extra.joinedAt || new Date().toISOString().slice(0, 10),
              externalRef: extra.externalRef || "" };
  const list = [...getMembers(), m];
  saveMembers(list);
  return { member: m, members: list };
}

// ── class_instances: one dated occurrence ───────────────────────────────────
// Local shape: { id, startsAt, name, classType, coachName, durationMin }
//
// class_type is a `text` column, and the app's classChoice is an OBJECT
// ({classType, subType}). Passing it straight through fails the insert — the same
// silent-sync-failure shape that cost us persona_plans data. Coerced here so no
// caller can put a non-string into a text column, regardless of what it holds.
function _asText(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return [v.classType, v.subType].filter(Boolean).join(" · ") || null;
  return String(v);
}
// Exported for tests: this mapper is the last line of defence before a value
// reaches Postgres, so it's worth pinning directly rather than through a proxy.
export function _ciToRow(c) {
  return { id: c.id, gym_id: _ctx.gymId, starts_at: c.startsAt, name: _asText(c.name),
           class_type: _asText(c.classType), coach_name: _asText(c.coachName),
           coach_id: _ctx.userId || null, duration_min: c.durationMin || null,
           created_by: _ctx.userId || null };
}
function _rowToCi(r) {
  return { id: r.id, startsAt: r.starts_at, name: r.name || "", classType: r.class_type || "",
           coachName: r.coach_name || "", durationMin: r.duration_min || null };
}
export function getClassInstances() { return readJSON(KEYS.classInstances, []); }
export function saveClassInstances(list) {
  writeJSON(KEYS.classInstances, list || []);
  if (!_synced()) return;
  const rows = (list || []).map(_ciToRow);
  if (rows.length) _bgUpsert("class_instances", rows, "id");
}
// Find-or-create the occurrence for a class being run right now. Idempotent
// within the window so pausing and resuming, or reopening the roster, does not
// mint a second occurrence and split one class's attendance across two rows.
const CI_WINDOW_MS = 4 * 60 * 60 * 1000;   // same name inside 4h == the same class
export function ensureClassInstance({ name, classType, coachName, durationMin }) {
  const list = getClassInstances();
  const now = Date.now();
  const hit = list.find(c => (c.name || "") === (name || "") &&
                             Math.abs(new Date(c.startsAt).getTime() - now) < CI_WINDOW_MS);
  if (hit) return { instance: hit, instances: list };
  const c = { id: newId(), startsAt: new Date().toISOString(), name: name || "",
              classType: classType || "", coachName: coachName || "", durationMin: durationMin || null };
  const next = [...list, c];
  saveClassInstances(next);
  return { instance: c, instances: next };
}

// ── attendance: the spine. Append-only. ─────────────────────────────────────
// Local shape: { id, classInstanceId, memberId, source, checkedInAt }
function _attToRow(a) {
  return { id: a.id, gym_id: _ctx.gymId, class_instance_id: a.classInstanceId,
           member_id: a.memberId, source: attendanceSource(a.source),
           checked_in_at: a.checkedInAt, recorded_by: _ctx.userId || null };
}
function _rowToAtt(r) {
  return { id: r.id, classInstanceId: r.class_instance_id, memberId: r.member_id,
           source: r.source, checkedInAt: r.checked_in_at };
}
export function getAttendance() { return readJSON(KEYS.attendance, []); }

// Insert-only push. ignoreDuplicates => ON CONFLICT DO NOTHING, which needs only
// the INSERT policy; a plain upsert would be ON CONFLICT DO UPDATE and fail. The
// conflict is EXPECTED, not exceptional: 0007 has unique(class_instance_id,
// member_id) and a member self-scanning while the coach sweeps the roster is a
// race we designed for rather than one we prevent.
function _pushAttendance(rows) {
  if (!_synced() || !rows.length) return;
  supabase.from("attendance")
    .upsert(rows.map(_attToRow), { onConflict: "class_instance_id,member_id", ignoreDuplicates: true })
    .then(({ error }) => {
      if (error) { console.warn("[store] attendance insert failed:", error.message); _noteSyncError("attendance", error.message); }
      else _clearSyncError("attendance");
    }, (e) => _noteSyncError("attendance", e?.message || e));
}

// Record one check-in. Local write is immediate and unconditional so a dead-Wi-Fi
// room still captures attendance (P7); the server insert rides along. Returns
// { attendance, added:false } when this member is already checked into this class,
// so the caller can treat a double-tap as a no-op instead of an error.
export function recordAttendance({ classInstanceId, memberId, source = "coach" }) {
  const list = getAttendance();
  if (list.some(a => a.classInstanceId === classInstanceId && a.memberId === memberId))
    return { attendance: list, added: false };
  const row = { id: newId(), classInstanceId, memberId,
                source: attendanceSource(source), checkedInAt: new Date().toISOString() };
  const next = [...list, row];
  writeJSON(KEYS.attendance, next);
  _pushAttendance([row]);
  return { attendance: next, added: true, row };
}

// ── consent_records: append-only ledger ─────────────────────────────────────
// Notice-level roster/attendance consent is all Phase 1 needs; every biometric
// scope stays unused until Phase 4. Fire-and-forget: a consent record that fails
// to write must never block a check-in, but it must also never be silently lost,
// so failures land in the sync ledger like everything else.
export function recordConsent({ memberId, scope = "roster_attendance", granted = true,
                                policyVersion = "v1", method = "notice" }) {
  if (!_synced()) return;
  supabase.from("consent_records").insert({
    gym_id: _ctx.gymId, member_id: memberId, scope, granted,
    policy_version: policyVersion, method, recorded_by: _ctx.userId || null,
  }).then(({ error }) => {
    if (error) { console.warn("[store] consent insert failed:", error.message); _noteSyncError("consent_records", error.message); }
    else _clearSyncError("consent_records");
  }, (e) => _noteSyncError("consent_records", e?.message || e));
}

// ── hydrate ─────────────────────────────────────────────────────────────────
// members + class_instances are server-wins but guarded (same shape as
// hydratePersonas): if their last write failed, local-only rows are kept and
// re-pushed rather than deleted. attendance always MERGES — it is an append log
// and an offline check-in may be the only copy in existence.
export async function hydrateAttendance() {
  if (!_synced()) return null;
  try {
    const [mRes, cRes, aRes] = await Promise.all([
      supabase.from("members").select("*").eq("gym_id", _ctx.gymId),
      supabase.from("class_instances").select("*").eq("gym_id", _ctx.gymId)
        .order("starts_at", { ascending: false }).limit(200),
      supabase.from("attendance").select("*").eq("gym_id", _ctx.gymId)
        .order("checked_in_at", { ascending: false }).limit(2000),
    ]);
    if (mRes.error || cRes.error || aRes.error) {
      console.warn("[store] hydrateAttendance failed:", (mRes.error || cRes.error || aRes.error).message);
      return null;
    }
    const serverMembers = (mRes.data || []).map(_rowToMember);
    const serverCis     = (cRes.data || []).map(_rowToCi);
    const serverAtt     = (aRes.data || []).map(_rowToAtt);

    const keepUnsynced = (table, server, local) => {
      if (!syncErrorFor(table)) return server;
      const onServer = new Set(server.map(r => r.id));
      const localOnly = local.filter(r => !onServer.has(r.id));
      return localOnly.length ? [...server, ...localOnly] : server;
    };
    const members = keepUnsynced("members", serverMembers, getMembers());
    const cis     = keepUnsynced("class_instances", serverCis, getClassInstances());
    if (members.length !== serverMembers.length) saveMembers(members);
    if (cis.length !== serverCis.length) saveClassInstances(cis);

    // Append log: never drop a local check-in the server hasn't got. Push it up.
    const seen = new Set(serverAtt.map(a => a.id));
    const localOnlyAtt = getAttendance().filter(a => !seen.has(a.id));
    if (localOnlyAtt.length) _pushAttendance(localOnlyAtt);
    const attendance = [...serverAtt, ...localOnlyAtt];

    writeJSON(KEYS.members, members);
    writeJSON(KEYS.classInstances, cis);
    writeJSON(KEYS.attendance, attendance);
    return { members, classInstances: cis, attendance };
  } catch (e) {
    console.warn("[store] hydrateAttendance error:", e?.message || e);
    return null;
  }
}

// ── One-shot hydrate for the App root ────────────────────────────────────────
// Pulls every domain's server state into localStorage on login and returns the
// values the App-root component holds in useState (brand, prefs, history) so it
// can setState. Library / exercise-db key / DJ / display prefs are read from the
// freshly-hydrated localStorage by their own screens on mount. Classes hydrate
// separately in CalendarScreen. No-op (null) when Supabase is off or no gym.
export async function hydrateAll() {
  if (!_synced()) return null;
  const [brand, prefs, history] = await Promise.all([
    _hydrateBrand(), _hydratePrefs(), _hydrateHistory(), _hydrateLibrary(),
  ]);
  return { brand, prefs, history };
}
