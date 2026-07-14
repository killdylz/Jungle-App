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

// Fire-and-forget writes — never block or throw into the caller; a failure just
// leaves localStorage as the source of truth until the next successful sync.
function _bgUpsert(table, row, onConflict) {
  supabase.from(table).upsert(row, { onConflict }).then(
    ({ error }) => { if (error) console.warn(`[store] ${table} upsert failed:`, error.message); },
    () => {});
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
export function getPersonaPlans() { return readJSON(KEYS.personaPlans, []); }

function _personaToRow(p) {
  return { id: p.id, gym_id: _ctx.gymId, name: p.name, kind: p.kind || "coach",
           description: p.description || null, style_profile: p.styleProfile || {},
           profile_updated_at: p.profileUpdatedAt || null, created_by: _ctx.userId || null };
}
function _rowToPersona(r) {
  return { id: r.id, name: r.name, kind: r.kind || "coach", description: r.description || "",
           styleProfile: r.style_profile || {}, profileUpdatedAt: r.profile_updated_at || null };
}
function _planToRow(pl) {
  return { id: pl.id, gym_id: _ctx.gymId, persona_id: pl.personaId, source: pl.source || "manual",
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
    const serverPersonas = (pRes.data || []).map(_rowToPersona);
    const serverPlans    = (plRes.data || []).map(_rowToPlan);
    const serverMoves    = (mRes.data || []).map(_rowToMove);
    const local = getPersonas();
    if (serverPersonas.length === 0 && local.length > 0) {
      savePersonas(local);                 // seed server from pre-sync local
      savePersonaPlans(getPersonaPlans());
      savePersonaMovements(getPersonaMovements());
      return null;                         // keep local as-is (no flicker)
    }
    writeJSON(KEYS.personas, serverPersonas);
    writeJSON(KEYS.personaPlans, serverPlans);
    writeJSON(KEYS.personaMoves, serverMoves);
    return { personas: serverPersonas, plans: serverPlans, movements: serverMoves };
  } catch (e) {
    console.warn("[store] hydratePersonas error:", e?.message || e);
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
