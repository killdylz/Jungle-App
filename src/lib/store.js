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
import { RETENTION_RULES } from "./retention.js";
import { diffOccurrences, occurrenceKey, CLASS_WINDOW_MS } from "./scheduleInstances.js";
// One key function shared with the analysis step. Two definitions of "the same
// class occurrence" is exactly the drift that lost a real attendance row.
import { occurrenceKeyOf } from "./csvImport.js";
// libraryStore.js has no imports of its own, so this cannot close a cycle back
// through libraryAccess.js (which imports THIS file).
import { resolveClassType } from "./libraryStore.js";
// coachRoster.js imports scheduleInstances and retention, both of which this
// module already pulls in, so the roster costs no new module in the chunk. It
// does NOT import store.js back — the resolution rules are pure and the
// persistence is here, which is what keeps the cycle from existing.
import { makeCoach, coachKey, normaliseAvailability, resolveCoach } from "./coachRoster.js";
// The settle rule lives in coverRequests.js and stays there: this module owns
// where a row is written, not what a legal transition is. Neither file imports
// this one back, so the roster/cover pair costs no cycle and no new chunk.
import { settleCover, makeCoverForOccurrence, requestsForOccurrence,
         isOpen } from "./coverRequests.js";
import { makeAbsence, occurrenceDate } from "./coachAbsence.js";
import { compareAndSet, CAS_WON, CAS_LOST } from "./compareAndSet.js";
import { localDateStr } from "./format.js";

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
  draftClass:    "jungle_draft_class",
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
  retentionActions:"jungle_retention_actions",
  coaches:       "jungle_coaches",
  coverRequests: "jungle_cover_requests",
  bookingOutbox: "jungle_booking_outbox",
  absences:      "jungle_coach_absences",
};

// `localDateStr` now lives in format.js and is imported at the top of this file:
// `useClassRunner` and `ProfileModal` needed the same rule, and a second copy is
// exactly how a writer and its reader drift apart. Behaviour is unchanged.

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
    const prev = all[table];
    // `attempts` counts CONSECUTIVE failures for this table and drives I13's
    // exponential backoff (see _dueRetries). It starts at 0 on the first failure
    // and increments each time a write to this table fails again before any
    // success clears it — so a genuinely broken write (a CHECK violation that will
    // fail identically forever) backs off toward the cap instead of hammering the
    // server every tick, while a transient blip retries quickly and then clears.
    all[table] = { msg: String(msg || "unknown"), at: Date.now(),
                   attempts: prev ? (prev.attempts || 0) + 1 : 0 };
    writeJSON(SYNC_ERR_KEY, all);
  } catch (_) { /* never let bookkeeping break a write */ }
}
function _clearSyncError(table) {
  try {
    // ⚠️ A successful UPSERT does not settle an outstanding DELETE. The retry
    // pushers for id-keyed tables re-send the local list, which never removes a
    // row the server still has — so clearing here on that success would report the
    // table synced while a deletion was still unlanded, and the banner would go
    // quiet on a divergence that is still real. See PENDING_DEL_KEY.
    if (_pendingDeletesFor(table).length) return;
    const all = readJSON(SYNC_ERR_KEY, {});
    if (all[table]) { delete all[table]; writeJSON(SYNC_ERR_KEY, all); }
  } catch (_) { /* ignore */ }
}

// ─── A table the database has not got is not a failed write (S32 §2.1) ──────
//
// 🔴 TWO THINGS THAT LOOK IDENTICAL IN THE LEDGER AND ARE NOT THE SAME EVENT.
// A write that failed will land on a retry. A write to a table that DOES NOT
// EXIST will never land, however many times it is retried, because the fix is a
// migration only Dylan can run — 0005, 0006 and 0010 are all in that state
// (DYLAN-QUEUE A15). Both belong in the ledger, and they do: the banner saying
// "coach_roster is not synced" is true in both cases and the retry costs almost
// nothing. What differs is what the PRODUCT may claim in the meantime.
//
// `deliveryTruth` is the reason this exists. It reports what happened to a cover
// request, and its "waiting" branch means "the row is on the server and will
// reach them when they next open Jungle". With `cover_requests` absent that is
// FALSE — the row is on one phone, exactly as if there were no server at all —
// and a product that says "Waiting for Dev" over a row nobody can ever receive
// is the same defect as the panel that said "passes". So the absence is recorded
// as its own fact and the UI reads it.
//
// ⚠️ IT DOES NOT SUPPRESS THE PUSH. A latch that stopped writing would have to be
// cleared by something, and nothing would clear it: the day the migration runs,
// the only evidence is a write that succeeds. So pushes continue on the ledger's
// own backoff and the first success clears this, which is why it is written from
// `_bgUpsert`'s two branches rather than from a call site.
const ABSENT_KEY = "jungle_absent_tables";

// PostgREST's vocabulary for "no such table". It answers a missing relation with
// PGRST205 and a message naming the schema cache; Postgres itself says 42P01 /
// "does not exist". Matched on the text because the error object's shape differs
// between the two layers and only the message is guaranteed to reach us.
export function _isMissingTable(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "PGRST205" || code === "42P01"
      || /could not find the table|does not exist|schema cache/i.test(msg);
}
export function tableAbsent(table) {
  try { return (readJSON(ABSENT_KEY, []) || []).includes(table); } catch (_) { return false; }
}
function _noteAbsent(table, absent) {
  try {
    const list = readJSON(ABSENT_KEY, []) || [];
    const has = list.includes(table);
    if (absent === has) return;
    const next = absent ? [...list, table] : list.filter(t => t !== table);
    if (next.length) writeJSON(ABSENT_KEY, next); else remove(ABSENT_KEY);
  } catch (_) { /* never let bookkeeping break a write */ }
}

// ─── Tombstones for failed deletes (§2.5) ────────────────────────────────────
//
// WHAT WAS WRONG
// `_bgDelete` sent its failure to `console.warn` and nowhere else. So a delete
// that failed never entered the ledger, never showed the banner, was never
// retried — and the next hydrate found the row still on the server and put it
// back. The coach deletes a coach, sees them go, and finds them again tomorrow.
//
// WHY THE OBVIOUS FIX IS WORSE THAN NOTHING
// Simply calling `_noteSyncError` makes the retry machinery LIE. `_dueRetries`
// hands the table to `_RETRY_PUSHERS[table]`, which for every id-keyed domain is
// `save*(get*())` — an upsert of the local list. An upsert cannot remove a row the
// server has and local does not, so the retry SUCCEEDS, `_clearSyncError` fires,
// and the ledger reports a healthy table whose deletion never happened. That is a
// confident wrong answer about data loss, which is worse than the silence it
// replaced.
//
// WHAT RETRYING A DELETE MEANS WITH NO LOCAL TOMBSTONE — the decision §2.5 asked
// for. It means nothing, because after the local delete there is no record that
// the id ever existed; the local list cannot express "and not this one". So the
// tombstone has to be written explicitly, and it does two jobs:
//
//   1. it is the retry's ARGUMENT — (table, col, val) is exactly what re-issuing
//      the DELETE needs and exactly what the local list has thrown away;
//   2. it SUPPRESSES the resurrection while the retry is outstanding, so hydrate
//      drops a server row the coach has already deleted instead of adopting it.
//
// Job 2 is the one the coach feels. Without it, the row comes back on the next
// hydrate even though the retry will remove it a minute later.
//
// ⚠️ ONE TABLE ALREADY GOT THIS RIGHT and is the reason the shape is worth
// copying: `library_overrides`' pusher is `if (d) saveLibraryCustom(d); else
// resetLibraryCustom()`, which MIRRORS whichever operation failed because "no
// overrides" is derivable from local state (DEC-13). A blob table needs no
// tombstone — the absence IS the tombstone. Only id-keyed tables do, because
// absence from a list of many rows says nothing about which row left.
const PENDING_DEL_KEY = "jungle_pending_deletes";

// Exported for tests: these decide whether a deletion is honoured or quietly
// undone, so they are pinned directly rather than through a live Supabase — the
// same reasoning as _guardList and _dueRetries.
export function _pendingDeletes() { return readJSON(PENDING_DEL_KEY, []) || []; }
export function _pendingDeletesFor(table) {
  return _pendingDeletes().filter(d => d && d.table === table);
}
function _writePendingDeletes(list) {
  try {
    if (list.length) writeJSON(PENDING_DEL_KEY, list); else remove(PENDING_DEL_KEY);
  } catch (_) { /* never let bookkeeping break a write */ }
}
function _addPendingDelete(table, col, val) {
  const list = _pendingDeletes();
  // Idempotent: the same delete failing on every retry must leave one tombstone,
  // not one per attempt. Unbounded growth here would be a localStorage quota bug
  // that only appears for the gym with the worst connection.
  if (list.some(d => d.table === table && d.col === col && d.val === val)) return;
  _writePendingDeletes([...list, { table, col, val, at: Date.now() }]);
}
function _removePendingDelete(table, col, val) {
  const list = _pendingDeletes();
  const next = list.filter(d => !(d.table === table && d.col === col && d.val === val));
  if (next.length !== list.length) _writePendingDeletes(next);
}
// The ids this table has outstanding deletes for. Used by the hydrate guard to
// refuse a server row the coach has already removed.
export function _deletedIdsFor(table) {
  return new Set(_pendingDeletesFor(table).filter(d => d.col === "id").map(d => d.val));
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

// A stable identity for WHAT is currently failing: the set of tables and the
// reason each gave, and deliberately NOT `at` or `attempts`.
//
// The sync banner's dismiss is keyed on this. Every retry that fails rewrites
// `at` and increments `attempts`, so a signature covering either would change
// within 30 seconds and bring a dismissed banner straight back — dismissal would
// be a button that does nothing for half a minute. Keyed on table+message, the
// same failure staying the same failure stays dismissed, while a NEW table
// failing, or the same table failing for a NEW reason, is a different problem and
// reappears. That is the property that lets dismissal exist at all: it can hide
// what the coach has already read, and cannot hide anything new.
//
// The two delimiters are control characters, not punctuation: a table name
// cannot contain them and a Postgres message will not either, so two different
// ledgers cannot flatten onto the same signature. A collision here would hide a
// CHANGED error behind an old dismissal — the one thing this must never do.
export function syncErrorSignature(errs) {
  return (errs || []).map(e => `${e.table}\u0000${e.msg || ""}`).sort().join("\u0001");
}

// ── I13: background retry of failed writes ───────────────────────────────────
// Until now a failed background write sat in the ledger above until the NEXT
// hydrate re-pushed it (via _guardList / _blobStale / _mergeAppendLog). Hydrate
// runs on login and little else, so a check-in that failed on a two-second Wi-Fi
// blip could wait hours to reach Postgres — invisible on every other device, and
// only "saved on this device" the whole time. I13 closes that: reconnecting fires
// an immediate retry, and a slow timer re-pushes anything that failed while online
// (a transient 500, which has no `online` event to ride back on).
//
// The decision — WHICH tables are due to retry right now — is pulled out here as a
// pure function and unit-tested, the same discipline I14 used for _mergeAppendLog.
// The I/O around it (reading navigator.onLine, calling the re-push thunks, the
// interval) is the untestable-locally part and stays thin.
const RETRY_BASE_MS = 5_000;      // first retry ~5s after a failure
const RETRY_CAP_MS  = 5 * 60_000; // never slower than every 5 min, never faster than base

// Given the ledger, whether we're online, and the clock, return the tables whose
// backoff has elapsed — sorted, so the result is deterministic for tests and the
// retry order is stable. Offline returns nothing: a retry that cannot reach the
// network only burns an attempt and inflates the backoff for when it matters.
export function _dueRetries(errors, { online, now, baseMs = RETRY_BASE_MS, capMs = RETRY_CAP_MS } = {}) {
  if (!online) return [];
  return Object.entries(errors || {})
    .filter(([, e]) => e && (now - (e.at || 0)) >= Math.min(baseMs * 2 ** (e.attempts || 0), capMs))
    .map(([table]) => table)
    .sort();
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
  // ── A row the coach already deleted must not come back ──────────────────────
  // Applied BEFORE the sync-error gate, and unconditionally: an outstanding
  // tombstone is itself the evidence that this table is behind, and a delete whose
  // failure predates a later successful upsert would otherwise slip through a
  // cleared ledger. Without this the deletion visibly undoes itself on the next
  // hydrate and the retry only fixes it a minute later — the coach has already
  // seen the row return.
  const deleted = _deletedIdsFor(table);
  let rows = serverRows;
  if (deleted.size) {
    rows = (serverRows || []).filter(r => !deleted.has(r?.id));
    if (rows.length !== (serverRows || []).length) {
      console.warn(`[store] ${label}: dropping ${(serverRows || []).length - rows.length} server row(s) `
        + `the coach deleted while a delete was still unsent`);
    }
    _flushPendingDeletes(table);
  }
  if (!syncErrorFor(table)) return rows;
  const onServer = new Set((rows || []).map(r => r.id));
  const localOnly = (getLocal() || []).filter(r => r && !onServer.has(r.id) && !deleted.has(r.id));
  if (!localOnly.length) return rows;
  console.warn(`[store] ${label}: keeping ${localOnly.length} local row(s) the server never received; retrying push`);
  const merged = [...rows, ...localOnly];
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

// ── I10: delta writes ────────────────────────────────────────────────────────
// Every id-keyed `save*` below used to push the WHOLE domain list on every
// change: renaming one plan re-sent the entire corpus. Two costs, one of which
// is the reason AUDIT 3.2 wants this before gym #2:
//
// 1. DATA LOSS BLAST RADIUS. An upsert is one statement. If a single row
//    violates a CHECK, the whole batch fails — so one bad row stops every OTHER
//    row in that domain from syncing, and the ledger just says "the table
//    failed". That is how one bad row poisoned every plan on 2026-07-18.
// 2. Payload. A coach's whole corpus over gym Wi-Fi on every keystroke-ish save.
//
// The subtle part, and the reason this was deferred rather than obvious: today's
// full-list push is ACCIDENTALLY SELF-HEALING. A row that failed to sync is
// re-sent by the next unrelated save, and `_RETRY_PUSHERS` leans on exactly that
// — every thunk just calls the same `save*` again. A naive delta destroys that
// property and turns a transient failure into permanent divergence.
//
// So the rule here is: a row is only marked synced when the SERVER CONFIRMED it.
// A failed push marks nothing, so the row stays in the delta and the very next
// save — or I13's retry thunk, unchanged — picks it up again. The self-healing
// survives; only the payload shrinks.
const SYNCED_KEY = "jungle_synced_rows";

// 64 bits over the row as it will be SENT (not the local shape), so a change to
// gym_id or any mapped field counts as a change. Two independent 32-bit hashes
// rather than one: a collision here means an edited row is never pushed — silent
// data loss, which is the one failure this whole module exists to prevent — and
// 2^-32 is not a margin worth taking for a few bytes.
function _fingerprint(row) {
  const s = JSON.stringify(row);
  let h1 = 0x811c9dc5, h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// The rows whose mapped form differs from what the server last confirmed.
// Exported for tests: this decides what does and does not reach Postgres, so it
// is pinned directly rather than through a write that needs a live Supabase —
// the same reasoning as _guardList and _dueRetries.
export function _deltaRows(table, rows) {
  const marks = readJSON(SYNCED_KEY, {})[table] || {};
  return (rows || []).filter(r => r && marks[r.id] !== _fingerprint(r));
}

// Confirm the rows the server accepted, and drop marks for rows that no longer
// exist locally so the map cannot grow forever. `allRows` is the full current
// list; anything outside it is gone (deleted via _bgDelete) and its mark is dead.
// Exported alongside _deltaRows so the self-healing property — a push that was
// never confirmed stays in the next delta — can be pinned without a live Supabase.
export function _markSynced(table, pushed, allRows) {
  try {
    const all = readJSON(SYNCED_KEY, {});
    const prev = all[table] || {};
    const live = new Set((allRows || []).map(r => r && r.id));
    const next = {};
    Object.keys(prev).forEach(id => { if (live.has(id)) next[id] = prev[id]; });
    (pushed || []).forEach(r => { if (r) next[r.id] = _fingerprint(r); });
    all[table] = next;
    writeJSON(SYNCED_KEY, all);
  } catch (_) { /* never let bookkeeping break a write */ }
}

// Drop one row's mark, so a later row with that id is pushed on its own merits.
// Exported for tests for the same reason as the two above.
export function _unmark(table, id) {
  try {
    const all = readJSON(SYNCED_KEY, {});
    if (all[table] && all[table][id] !== undefined) { delete all[table][id]; writeJSON(SYNCED_KEY, all); }
  } catch (_) { /* never let bookkeeping break a write */ }
}

// Note there is deliberately no "forget everything for this table" escape hatch:
// the fingerprint covers the row AS SENT, gym_id included, so a different gym (or
// any remapping) already mismatches every mark and re-pushes in full on its own.
// A second mechanism for that would only be a second thing to get wrong.

// ─── Hydrate must not discard an edit the server has never seen (S32 §2.1) ──
//
// 🔴 SERVER-WINS IS RIGHT FOR EVERY DOMAIN THAT ONE PERSON EDITS ON ONE DEVICE,
// AND THE ROSTER IS THE FIRST THAT IS NOT. `_guardList` protects a local row the
// server has never HEARD OF (local-only by id) and a row the coach deleted. It
// does not protect the third case, which did not exist before coach availability:
// a row the server HAS, whose local copy is newer. Server-wins throws that away.
//
// Coach A opens Jungle on the way to the gym, ticks Thursday 06:00, and the push
// is still in flight — or failed, or the tab closed — when the app next hydrates.
// The manager's tablet holds the same roster entry. Server-wins would silently
// restore the older grid and coach A's answer would be gone, with no error
// anywhere, which is precisely the shape of the 2026-07-18 corpus loss.
//
// ⚠️ THE OBVIOUS FIX — COMPARE TIMESTAMPS — IS THE WRONG ONE HERE, and it is worth
// saying why because `availabilityAt` is sitting right there looking like the
// answer. It is a LOCAL CALENDAR DATE (`updateCoach` stamps it via `localDateStr`,
// and `daysBetween` reads it as a date because the reader is a human with a
// calendar). Two edits on the same day are indistinguishable by it, and two
// devices in two timezones do not even agree which day it is. A field that is
// correct for "how stale is this claim" is not thereby a version clock.
//
// THE SIGNAL THIS USES INSTEAD IS ALREADY IN THE FILE AND COSTS NOTHING: the
// delta marks. A mark is written ONLY from `_bgUpsert`'s success path, so
// "local row's fingerprint ≠ its mark" means exactly "the server has never
// confirmed this content". No clocks, no timezones, no new storage.
//
// What this is, stated plainly: last-writer-wins biased toward the device with
// unsynced work. Two coaches editing the same entry between two hydrates still
// lose one edit — that needs per-field merge or a real version column, and
// neither is worth inventing before a gym has hit it. What it removes is the
// case where the losing edit is the one you just typed and watched save.
export function _unsyncedIds(table, mappedRows) {
  return new Set(_deltaRows(table, mappedRows).map(r => r.id));
}

// Swap the local version back in for any server row whose id is unsynced. Pure,
// and exported for the same reason as `_guardList`: the decision needs no live
// Supabase, so it is pinned directly rather than through a network round-trip.
export function _preferLocalEdits(serverRows, localRows, unsyncedIds) {
  if (!unsyncedIds || !unsyncedIds.size) return serverRows || [];
  const localById = new Map((localRows || []).filter(Boolean).map(r => [r.id, r]));
  let kept = 0;
  const out = (serverRows || []).map(r => {
    if (!unsyncedIds.has(r?.id) || !localById.has(r?.id)) return r;
    kept += 1;
    return localById.get(r.id);
  });
  if (kept) console.warn(`[store] keeping ${kept} local row(s) the server has an older copy of`);
  return out;
}

// Push only what changed. `allRows` is the full mapped list, used to prune marks.
// No delta => no request at all, which is the common case on a re-save.
function _bgUpsertDelta(table, allRows, onConflict = "id") {
  const delta = _deltaRows(table, allRows);
  if (_clearLedgerIfSettled(table, delta)) return;
  _bgUpsert(table, delta, onConflict, () => _markSynced(table, delta, allRows));
}

// An empty delta means every local row carries a fingerprint the SERVER
// confirmed — marks are only ever written from _bgUpsert's success path — so
// there is provably nothing outstanding for this table. That includes the case
// where the local list has since gone empty and there is literally nothing left
// to send.
//
// A ledger entry surviving that state is stale, and nothing else would ever
// clear it: _clearSyncError runs only after a successful request, and the
// no-delta path makes no request at all. The result was a banner stuck on
// forever, naming a domain with nothing to sync, that no coach action could
// clear — a warning that cannot be resolved stops being read as a warning.
//
// Exported for the same reason as _deltaRows, _guardList and _dueRetries: the
// call site needs a live Supabase, this decision does not. Returns true when it
// settled the ledger and the caller should not push.
export function _clearLedgerIfSettled(table, delta) {
  if ((delta || []).length) return false;
  _clearSyncError(table);
  return true;
}

// Fire-and-forget writes — never block or throw into the caller.
function _bgUpsert(table, row, onConflict, onOk) {
  supabase.from(table).upsert(row, { onConflict }).then(
    ({ error }) => {
      if (error) {
        console.warn(`[store] ${table} upsert failed:`, error.message);
        // Recorded here rather than at any call site, so every domain gets it —
        // 0005 and 0006 are unapplied too, and a screen asking "is this table
        // really there" should get one answer however the absence was learned.
        _noteAbsent(table, _isMissingTable(error));
        _noteSyncError(table, error.message);
      }
      else { _noteAbsent(table, false); _clearSyncError(table); if (onOk) { try { onOk(); } catch (_) {} } }
    },
    (e) => _noteSyncError(table, e?.message || e));
}
function _bgDelete(table, col, val) {
  // Drop the delta mark for a deleted id. Without this, deleting a row and later
  // re-adding the SAME id with identical content would match the dead row's
  // fingerprint, look already-synced, and never be pushed — the server would stay
  // permanently missing a row that exists locally. Unmarking here (rather than at
  // each call site) keeps every present and future delete honest by construction.
  if (col === "id") _unmark(table, val);
  supabase.from(table).delete().eq(col, val).then(
    ({ error }) => {
      if (error) {
        console.warn(`[store] ${table} delete failed:`, error.message);
        // The tombstone FIRST, so `_noteSyncError`'s entry can never be cleared by
        // a successful upsert before the delete has actually landed — see
        // `_clearSyncError`, which now refuses while this queue is non-empty.
        _addPendingDelete(table, col, val);
        _noteSyncError(table, error.message);
      } else {
        _removePendingDelete(table, col, val);
        _clearSyncError(table);
      }
    },
    (e) => {
      // A rejected request — offline, DNS, a dropped socket — reached neither
      // branch above before this commit and so was invisible twice over.
      _addPendingDelete(table, col, val);
      _noteSyncError(table, e?.message || String(e));
    });
}

// Re-issue every outstanding delete for a table. Called from the retry pushers of
// id-keyed domains, where the pusher's own upsert cannot express a removal.
// Fire-and-forget like every other write here; each call removes its own tombstone
// on success and re-notes on failure, so the backoff keeps working.
function _flushPendingDeletes(table) {
  if (!_synced()) return;
  _pendingDeletesFor(table).forEach(d => _bgDelete(d.table, d.col, d.val));
}

// ── Classes (F5: user-created recurring classes) ──────────────────────────
// Local shape: { id:"uc<ts>", name, type, coach, day, slot, dur, repeat, weekKey?, fill? }
// Postgres:    public.class_schedule_rules, with client_id == the local id.
export function _classToRow(uc) {
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

// ── The class currently open in the Builder ──────────────────────────────────
// Found by driving the UI: `stages`/`sessionName` were plain useState with no
// persistence, so a coach who planned a class and closed the tab lost the work —
// while the Dashboard offered them a "Resume building" button for it. Everything
// else in the app persists; this, the thing a trainer spends the most time on,
// did not.
//
// LOCAL ONLY, deliberately. There is no table for an in-progress draft and
// adding one is an infra change that is Dylan's call, so this never touches
// Supabase. A finished class becomes session history, which does sync.
//
// Returns null (not a default class) when nothing is stored, so the caller keeps
// owning what "a new class" means rather than this module inventing one.
export function getDraftClass() {
  const d = readJSON(KEYS.draftClass, null);
  if (!d || !Array.isArray(d.stages) || d.stages.length === 0) return null;
  return { name: typeof d.name === "string" ? d.name : "", stages: d.stages, classChoice: d.classChoice || null };
}
export function saveDraftClass(draft) {
  if (!draft || !Array.isArray(draft.stages)) return;
  writeJSON(KEYS.draftClass, { name: draft.name || "", stages: draft.stages, classChoice: draft.classChoice || null });
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
// The three values 0005's CHECK allows on persona_plans.source — the very column
// whose rejection cost live data on 2026-07-18. `planSource()` normalises to this
// set; the array is the single authority both it and dbConstraints.test.js read.
export const PERSONA_PLAN_SOURCES = ["google_slides", "manual", "jungle"];
const PLAN_SOURCES  = new Set(PERSONA_PLAN_SOURCES);
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
  _bgUpsertDelta("coach_personas", rows);
}
export function savePersonaPlans(plans) {
  writeJSON(KEYS.personaPlans, plans);
  if (!_synced()) return;
  const rows = (plans || []).map(_planToRow);
  _bgUpsertDelta("persona_plans", rows);
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
    _bgUpsertDelta("persona_movements", rows);
  }
  return withIds;
}
// Delete a catalogue row. ⚠️ Only ever call this for a row with NO occurrences.
//
// A row that still appears in a plan is RE-DERIVED by `aggregateMovements` on
// the next recompute — which any movement save or plan edit triggers — so
// deleting one looked correct through a reload and then undid itself. There is
// no tombstone, deliberately: the catalogue's promise is that it says what the
// corpus contains. That is why the main list offers no delete at all.
//
// A zero-occurrence row is the opposite case. It is in none of the coach's
// plans, so nothing re-derives it; it survives only because it carries a manual
// edit, and the retention rule in `aggregateMovements` keeps it so those edits
// are never lost. Deleting one is the coach saying they no longer want it kept,
// and it holds.
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
    _bgUpsertDelta("persona_generations", rows);
  }
}

// Put a deleted coach back, with everything that went with them.
//
// A plain re-save of the four lists is NOT enough, and the reason is the delta
// writer. `deletePersona` removes only the coach_personas row from the server;
// persona_plans, persona_movements and persona_generations go with it through
// their FKs' ON DELETE CASCADE — no client call, so no `_unmark`. Those rows
// still carry the fingerprints the server confirmed before the delete, so a
// re-save computes an EMPTY delta and pushes nothing. The coach would see their
// whole corpus restored on this device while the server stayed empty, and the
// next server-wins hydrate would take it away again for good.
//
// Dropping the marks first is what makes the undo actually reach Postgres. The
// knowledge of which tables cascade belongs here rather than in the screen: the
// FKs are declared in migration 0005 two feet from this file's mental model, and
// a screen cannot be expected to know that deleting one row deletes three tables.
export function restorePersonaCascade({ personas, plans, movements, generations } = {}) {
  (plans || []).forEach(pl => pl && _unmark("persona_plans", pl.id));
  (movements || []).forEach(m => m && _unmark("persona_movements", m.id));
  (generations || []).forEach(g => g && _unmark("persona_generations", g.id));
  savePersonas(personas || []);
  savePersonaPlans(plans || []);
  const moves = savePersonaMovements(movements || []);
  savePersonaGenerations(generations || []);
  return { personas: personas || [], plans: plans || [], movements: moves,
           generations: generations || [] };
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

// The three values 0007's CHECK allows on members.status. Same rule, same reason.
//
// Note the vocabulary trap this one carries: the column says **"cancelled"**, with
// two Ls, while the sibling `entity_status` enum in 0001 says **"canceled"** with
// one. Both spellings are legal — in different columns. Anyone who normalises
// them by eye will break one of the two, so neither is written inline anywhere;
// `dbConstraints.test.js` checks each against its own migration.
//
// "archived"/"inactive" are NOT legal here, which is the shape a Members CRUD
// status dropdown reaches for by default.
export const MEMBER_STATUSES = ["active", "paused", "cancelled"];
export function memberStatus(s) {
  return MEMBER_STATUSES.includes(s) ? s : "active";
}

// Plain words for those three values. The UI never shows a raw enum (U1), and
// the map lives beside the constant so a new status cannot be added to one
// without the other going blank. "Cancelled" is deliberately not called
// "deleted": nothing is deleted, and the attendance history stays.
//
// Here rather than in a screen because session 20 needed a SECOND UI consumer —
// the check-in sweep, which now says which rows are not current members. Two
// screens spelling "Left" separately is one rename away from disagreeing about
// what a member's status is called.
//
// ⚠️ `csvExport.js` keeps its own copy ON PURPOSE and must not be "fixed" to
// import this one: that module has zero imports by design, and pulling in this
// file would drag the whole localStorage + Supabase seam into a pure formatter.
export const MEMBER_STATUS_LABEL = {
  active:    "Active",
  paused:    "Paused",
  cancelled: "Left",
};

// ── retention_actions: what the operator DID about a flag (N3) ──────────────
// Append-only, mirroring attendance and consent_records: insert-only push, and
// hydrate MERGES rather than letting the server win. Local shape:
// { id, memberId, rule, action, note, occurredAt }.
//
// The two constrained columns in 0008. `rule` deliberately re-exports
// RETENTION_RULES rather than restating it — the rule names belong to the rules
// engine, and two copies is precisely how a CHECK constraint starts rejecting a
// client value.
export const RETENTION_ACTIONS = ["acted", "dismissed", "reopened"];
export function retentionAction(a) {
  return RETENTION_ACTIONS.includes(a) ? a : "acted";
}
export function retentionRule(r) {
  return RETENTION_RULES.includes(r) ? r : null;
}

// ── Two more constrained columns the client actually writes ──────────────────
// Both `coach_personas.kind` (0005) and `class_schedule_rules.repeat` (0003) sync
// to Postgres CHECK-constrained columns, so their legal values are pinned here —
// in ONE place, read by the UI that produces them — and checked against the
// migrations by dbConstraints.test.js. Order is the UI display order; the guard
// compares sets, so it is free. Anything the dropdowns can emit is, by
// construction, a member of these arrays.
export const PERSONA_KINDS   = ["coach", "house", "format"];
export const SCHEDULE_REPEATS = ["once", "weekly", "daily"];
function _raToRow(a) {
  return { id: a.id, gym_id: _ctx.gymId, member_id: a.memberId, rule: a.rule,
           action: retentionAction(a.action), note: a.note || null,
           occurred_at: a.occurredAt, recorded_by: _ctx.userId || null };
}
function _rowToRa(r) {
  return { id: r.id, memberId: r.member_id, rule: r.rule, action: r.action,
           note: r.note || "", occurredAt: r.occurred_at };
}
export function getRetentionActions() { return readJSON(KEYS.retentionActions, []); }

// Record one action. Local write is immediate and unconditional so the operator
// sees their own click land; the server insert rides along. An unknown rule is
// REFUSED rather than coerced — coercing would file the action against the wrong
// rule, which is worse than not recording it.
export function recordRetentionAction({ memberId, rule, action, note = "" }) {
  const r = retentionRule(rule);
  if (!memberId || !r) return getRetentionActions();
  const row = { id: newId(), memberId, rule: r, action: retentionAction(action),
                note: String(note || ""), occurredAt: new Date().toISOString() };
  const list = [...getRetentionActions(), row];
  writeJSON(KEYS.retentionActions, list);
  if (_synced()) {
    supabase.from("retention_actions").insert([_raToRow(row)]).then(
      ({ error }) => { if (error) _noteSyncError("retention_actions", error.message); },
      (e) => _noteSyncError("retention_actions", e?.message || e));
  }
  return list;
}

// ── members: roster rows, NOT auth users ────────────────────────────────────
// Local shape: { id, name, email, status, joinedAt, externalRef }
export function _memberToRow(m) {
  return { id: m.id, gym_id: _ctx.gymId, name: m.name, email: m.email || null,
           // Through memberStatus(), not `|| "active"`. The old form passed any
           // string straight into a CHECK-constrained column, so one caller
           // writing "archived" would fail the write silently — the exact shape
           // that cost persona_plans data. Same reasoning as _asText below: this
           // mapper is the last line of defence before Postgres, so it coerces
           // rather than trusting the caller.
           status: memberStatus(m.status), joined_at: m.joinedAt || null,
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
  _bgUpsertDelta("members", rows);
}
// Quick-add during check-in: a name is all that's required, because anything
// more is a form a coach won't fill in mid-class and P6 gives us <5 seconds.
export function addMember(name, extra = {}) {
  // 🔴 `localDateStr`, NOT `toISOString().slice(0,10)` (S31 §2.4). The latter is
  // UTC, which is a different calendar day from the coach's for part of every
  // day: in Singapore a member added before 8am was recorded as joining
  // YESTERDAY. The datum is a date and the reader is a human with a wall
  // calendar — the same reasoning `daysBetween` carries in retention.js, and
  // `joinedAt` is read by exactly that code (retention.js:157, rule 1's tenure
  // gate) as well as by both CSV exports.
  const m = { id: newId(), name: String(name || "").trim(),
              email: extra.email || "", status: "active",
              joinedAt: extra.joinedAt || localDateStr(),
              externalRef: extra.externalRef || "" };
  const list = [...getMembers(), m];
  saveMembers(list);
  return { member: m, members: list };
}

// ── M1: edit an existing member ─────────────────────────────────────────────
// Patch-shaped rather than whole-object, so a caller cannot blank a field it
// never meant to touch by round-tripping a stale copy. Unknown keys are dropped:
// `members` has a fixed column set, and an extra key would ride into
// _memberToRow and be rejected by Postgres.
//
// `status` goes through memberStatus() here as well as in _memberToRow. That is
// deliberate belt-and-braces — this one keeps the LOCAL copy honest too, so a
// bad value never reaches localStorage and cannot come back on the next read.
export function updateMember(id, patch = {}) {
  const list = getMembers();
  const i = list.findIndex(m => m && m.id === id);
  if (i < 0) return { member: null, members: list };

  const cur = list[i];
  const next = { ...cur };
  if ("name" in patch)        next.name = String(patch.name || "").trim();
  if ("email" in patch)       next.email = String(patch.email || "").trim();
  if ("joinedAt" in patch)    next.joinedAt = patch.joinedAt || "";
  if ("externalRef" in patch) next.externalRef = String(patch.externalRef || "").trim();
  if ("status" in patch)      next.status = memberStatus(patch.status);

  // A member with no name is unusable in the runner's check-in list and cannot
  // be searched for — refuse rather than persist something unreachable.
  if (!next.name) return { member: null, members: list, error: "A member needs a name." };

  const out = [...list];
  out[i] = next;
  saveMembers(out);
  return { member: next, members: out };
}

// NOTE: there is deliberately no `deleteMember`. `attendance.member_id` cascades
// on delete (0007) — by design, because PDPA erasure has to reach the attendance
// rows too. That makes deletion the right primitive for an ERASURE REQUEST and
// the wrong one for "this person left the gym": a trash icon beside a name would
// quietly destroy the attendance history the retention analytics are computed
// from, and the owner would never connect the two. Leaving is `status:
// 'cancelled'`, which keeps the history. Erasure deserves its own deliberate
// flow, with the consent ledger involved.

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
// 🔴 `coach_id` USED TO BE `_ctx.userId`, WHICH IS THE PERSON WHO PRESSED PUBLISH.
//
// `class_instances.coach_id` is `references public.profiles(id)` — it means "the
// person who teaches this". `_ctx.userId` means "whoever was signed in when the
// week was published". Those are the same person only when a coach publishes
// their own classes and nobody else's, which is not how a schedule gets
// published: one manager presses **Add to schedule** once and every class in the
// week — everybody's — was recorded as taught by that manager.
//
// It was invisible because `coach_name` sat next to it holding the RIGHT answer,
// so every screen (all of which read the name) looked correct, and the only
// reader of the id is analytics that does not exist yet. Per-coach retention is
// on DYLAN-QUEUE; it would have been built on this and reported one person
// teaching a gym's entire timetable.
//
// ⚠️ AND THE FACT IT WAS CARRYING WAS ALREADY RECORDED. `created_by`, on the very
// next line, is exactly "who wrote this row" and has always been `_ctx.userId`.
// So the old value was not merely wrong, it was a duplicate of its neighbour
// under a name that means something else.
//
// Now: resolve the typed coach name against the gym's roster, and use that
// person's account when there is one. NULL when there is not — a nullable FK
// whose null means "we do not know who this was" is worth far more than a
// non-null one that is confidently wrong.
export function _ciToRow(c) {
  return { id: c.id, gym_id: _ctx.gymId, starts_at: c.startsAt, name: _asText(c.name),
           class_type: _asText(c.classType), coach_name: _asText(c.coachName),
           coach_id: coachAccountFor(c.coachName), duration_min: c.durationMin || null,
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
  _bgUpsertDelta("class_instances", rows);
}
// Find-or-create the occurrence for a class being run right now. Idempotent
// within the window so pausing and resuming, or reopening the roster, does not
// mint a second occurrence and split one class's attendance across two rows.
//
// `instanceId` is the CHOSEN occurrence — set when the coach started this class
// from the Schedule (see startScheduledClass). It short-circuits the name match,
// which is what stops the two doors into this table from diverging: the Builder's
// `sessionName` comes from a draft, a template or a persona and has no reason to
// equal the schedule rule's name, so name matching alone left the published row
// on zero attendance forever (session 11, §3A).
const CI_WINDOW_MS = CLASS_WINDOW_MS;      // same name inside 4h == the same class
export function ensureClassInstance({ name, classType, coachName, durationMin, instanceId }) {
  const list = getClassInstances();
  const now = Date.now();
  if (instanceId) {
    const pinned = list.find(c => c.id === instanceId);
    if (pinned) return { instance: pinned, instances: list };
    // The pinned row is gone — storage cleared, or a device that never had it.
    // Fall through rather than mint a row under an id nothing else knows: the
    // name path below is the same join, and the name it matches on IS the
    // schedule's, because starting from the Schedule set it.
  }
  const hit = list.find(c => (c.name || "") === (name || "") &&
                             Math.abs(new Date(c.startsAt).getTime() - now) < CI_WINDOW_MS);
  if (hit) return { instance: hit, instances: list };
  const c = { id: newId(), startsAt: new Date().toISOString(), name: name || "",
              classType: classType || "", coachName: coachName || "", durationMin: durationMin || null };
  const next = [...list, c];
  saveClassInstances(next);
  return { instance: c, instances: next };
}

// ── B4: publish a week of the schedule as dated occurrences ─────────────────
// The other half of `ensureClassInstance`. That one mints the occurrence for the
// class happening RIGHT NOW; this one turns the recurring rules the Schedule
// grid holds into the dated occurrences attendance and analytics hang off, so a
// class exists before a coach presses play. 0003 named this as the generator
// class_schedule_rules was always the input to.
//
// The dedupe belongs in scheduleInstances.js (pure, tested); this only decides
// what gets written. Pressing publish twice must be a no-op — a duplicated
// occurrence splits one class's check-ins across two rows and nothing surfaces
// the split.
export function publishOccurrences(occurrences) {
  const list = getClassInstances();
  const { create, already } = diffOccurrences(occurrences, list);
  if (!create.length) return { created: 0, already: already.length, instances: list };

  const rows = create.map(o => ({
    id: newId(),
    startsAt: o.startsAt,
    name: o.name || "",
    classType: o.classType || "",
    coachName: o.coachName || "",
    // `|| null`, not `|| 0`: a rule whose duration could not be read must stay
    // unknown. duration_min is nullable and a zero-minute class is a lie.
    durationMin: o.durationMin || null,
  }));
  const next = [...list, ...rows];
  saveClassInstances(next);
  return { created: rows.length, already: already.length, instances: next };
}

// ── §3A: start a scheduled class, so the occurrence is CHOSEN not inferred ────
// The third caller of this table, and the only one that resolves an occurrence
// from a coach's actual intent rather than from a name and a clock.
//
// A coach taps Start on the 18:00 S360 cell. Whatever the draft in the Builder is
// called, the check-ins from that class must land on the row the Schedule
// published — so this returns that row by IDENTITY (name @ startsAt), and the
// caller pins its id through the Runner.
//
// It publishes the occurrence when the week was never published, because the
// alternative is refusing to start a class that is plainly on the schedule. Note
// what it does NOT do: it never dates the row `now`. The row keeps the SLOT's
// time, so starting six minutes late does not record a class that the schedule
// says starts at 18:00 as an 18:06 class, and publishing the week afterwards
// still recognises it as already there.
export function startScheduledClass(occurrence) {
  if (!occurrence || !occurrence.startsAt || !occurrence.name) return null;
  const list = getClassInstances();
  const key = occurrenceKey(occurrence);
  const hit = list.find(c => occurrenceKey(c) === key);
  if (hit) return { instance: hit, instances: list, created: false };
  // Reuses the publish writer so there is one mapper from occurrence to row —
  // a second one is how the two doors came to record different amounts of the
  // same class in session 10.
  const r = publishOccurrences([occurrence]);
  return { instance: r.instances[r.instances.length - 1], instances: r.instances, created: true };
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

// Apply a validated CSV backfill (F4 slice 2). Takes the output of
// csvImport.analyzeAttendanceCsv — which has ALREADY rejected every unusable row
// — and materialises it: new members, then class occurrences, then the check-ins
// that reference them.
//
// Order matters and is not cosmetic. attendance carries FKs to members and
// class_instances, so those rows must exist first; creating them in one batch
// each (rather than per check-in) also keeps a 2,000-row backfill to three
// writes instead of six thousand.
//
// source is "import" — one of the three values 0007's CHECK constraint allows,
// routed through attendanceSource() like every other call site. It is also what
// makes a backfilled row distinguishable from a live check-in forever, which
// matters when Phase 2 reports on data the studio did not capture in Jungle.
// `lib` is the gym's merged catalogue, passed in by the caller because
// `getLibrary()` lives in libraryAccess.js, which imports THIS file. Optional:
// without it an imported type is stored exactly as the file gave it, which is
// the behaviour this had before — so no existing caller changes meaning.
export function applyAttendanceImport(analysis, lib = null) {
  if (!analysis?.ok) return { ok: false, error: analysis?.error || "nothing to import" };

  // 1. Members. Keyed by the analysis's own "new:<key>" placeholders.
  const memberIdFor = new Map();
  const members = getMembers();
  const newRows = (analysis.newMembers || []).map(nm => {
    // `externalRef` from the import (S31 §2.2), not "". This is the field's only
    // writer: it holds the member's id in the system the gym is migrating FROM,
    // and the export of that system is the one place it appears. Still "" when
    // the file had no such column, which is the normal case.
    const m = { id: newId(), name: nm.name, email: nm.email || "", status: "active",
                joinedAt: "", externalRef: nm.externalRef || "" };
    memberIdFor.set(nm.key, m.id);
    return m;
  });
  if (newRows.length) saveMembers([...members, ...newRows]);

  // 2. Class occurrences. Reuse an existing occurrence so re-running an
  //    overlapping export doesn't mint a duplicate class — matched at the SAME
  //    precision the analysis used to decide what one class is. A day-only index
  //    would map a studio's 06:00 and 18:00 classes of the same name onto one
  //    row, and on the second import would hand the evening class's check-ins to
  //    the morning one.
  const cis = getClassInstances();
  const ciIdFor = new Map();
  const byMinute = new Map(), byDay = new Map();
  cis.forEach(c => {
    byMinute.set(occurrenceKeyOf(c.name, c.startsAt, true), c.id);
    // Last wins: with no time in hand there is nothing better to prefer, and
    // saying so is more honest than a rule that looks principled.
    byDay.set(occurrenceKeyOf(c.name, c.startsAt, false), c.id);
  });
  const newCis = [];
  (analysis.classes || []).forEach(c => {
    const hit = c.timed ? byMinute.get(occurrenceKeyOf(c.name, c.startsAt, true))
                        : byDay.get(occurrenceKeyOf(c.name, c.startsAt, false));
    if (hit) { ciIdFor.set(c.key, hit); return; }
    // The THIRD door into class_type, and the one whose vocabulary we control
    // least: a foreign system's own "Type" column, verbatim. A backfill from a
    // gym's old software wrote "HIIT" while the Runner wrote "hiit" for the same
    // class, so the history being imported to make N2 possible arrived already
    // ungroupable against the classes recorded since. Resolved to a catalogue
    // key where one matches; an unrecognised type keeps its own text, which is
    // the honest answer for a vocabulary that was never ours.
    const row = { id: newId(), startsAt: c.startsAt, name: c.name,
                  classType: lib ? resolveClassType(c.classType, lib) : (c.classType || ""),
                  coachName: c.coachName || "", durationMin: null };
    ciIdFor.set(c.key, row.id);
    newCis.push(row);
  });
  if (newCis.length) saveClassInstances([...cis, ...newCis]);

  // 3. Check-ins. Dedupe against what is already recorded — the server's unique
  //    index would reject these anyway, and counting them would overstate the
  //    import to the coach.
  const existing = getAttendance();
  const have = new Set(existing.map(a => `${a.classInstanceId}|${a.memberId}`));
  const rows = [];
  (analysis.rows || []).forEach(r => {
    const memberId = memberIdFor.get(r.memberKey) || r.memberKey;
    const classInstanceId = ciIdFor.get(r.classKey);
    if (!classInstanceId || !memberId) return;
    const pair = `${classInstanceId}|${memberId}`;
    if (have.has(pair)) return;
    have.add(pair);
    rows.push({ id: newId(), classInstanceId, memberId,
                source: attendanceSource("import"), checkedInAt: r.checkedInAt });
  });
  if (rows.length) {
    writeJSON(KEYS.attendance, [...existing, ...rows]);
    _pushAttendance(rows);
  }
  return { ok: true, members: newRows.length, classes: newCis.length, attendance: rows.length,
           duplicates: (analysis.rows || []).length - rows.length };
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

// ── I14: paged fetch ────────────────────────────────────────────────────────
// `.limit(2000)` on an append-only log is a silent truncation with a date on it.
// A studio running 20 classes a week at 12 heads generates ~12,500 attendance
// rows a year, so the cap is reached inside twelve months and then two things go
// wrong at once, neither of them visibly:
//
//   1. A newly signed-in device sees only the newest 2,000 rows, so every
//      retention number — cohort curves, "last seen", who is slipping away — is
//      computed on a truncated history and is simply wrong, with nothing saying so.
//   2. Worse, the merge below treats "not in the server response" as "the server
//      never got it", so every row outside the window looks local-only and is
//      RE-PUSHED on every single hydrate. Not a one-off cost: a permanent,
//      growing rewrite of the entire back-catalogue on every login.
//
// Paging fixes (1). `complete` is what fixes (2): it records whether we actually
// reached the end, so the merge can tell "the server has never seen this" from
// "we simply have not looked that far back yet".
const PAGE_SIZE = 1000;
const HARD_CAP  = 50_000;   // ~4 years for the studio above; a stop, not a target.

async function _fetchPaged(table, orderCol) {
  const rows = [];
  for (let from = 0; from < HARD_CAP; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select("*")
      .eq("gym_id", _ctx.gymId)
      .order(orderCol, { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error, complete: false };
    rows.push(...(data || []));
    // A short page means the end of the table — the only honest "complete".
    if (!data || data.length < PAGE_SIZE) return { rows, error: null, complete: true };
  }
  // Hit the ceiling. We are truncated and we KNOW it, which is the whole point:
  // an honest "I cannot see all of this" beats a confident wrong merge.
  console.warn(`[store] ${table}: more than ${HARD_CAP} rows; history is truncated for this session`);
  return { rows, error: null, complete: false };
}

// Merge an append-only log. Pure, and exported for tests: this is a last line of
// defence against both data loss and a runaway re-push, and the hydrate around it
// needs a live Supabase — the same reasoning as _guardList and _ciToRow.
//
// `serverComplete` is load-bearing. When we have NOT seen the whole table, a
// local row missing from the response proves nothing, so it is kept (never lose
// a check-in) but NOT pushed (it is probably already up there, just older than
// the window).
export function _mergeAppendLog(serverRows, localRows, serverComplete) {
  const seen = new Set((serverRows || []).map(r => r.id));
  const missing = (localRows || []).filter(r => r && !seen.has(r.id));
  const byId = new Map([...(serverRows || []), ...missing].map(r => [r.id, r]));
  return {
    merged: [...byId.values()],
    // Only rows we can prove the server lacks are worth pushing.
    toPush: serverComplete ? missing : [],
  };
}

// ── hydrate ─────────────────────────────────────────────────────────────────
// members + class_instances are server-wins but guarded (same shape as
// hydratePersonas): if their last write failed, local-only rows are kept and
// re-pushed rather than deleted. attendance always MERGES — it is an append log
// and an offline check-in may be the only copy in existence.
export async function hydrateAttendance() {
  if (!_synced()) return null;
  try {
    const [mRes, cPaged, aPaged] = await Promise.all([
      supabase.from("members").select("*").eq("gym_id", _ctx.gymId),
      // class_instances is paged too: at 20 classes a week the old limit of 200
      // covered ten weeks, so after a fresh sign-in a check-in against an older
      // class had no occurrence to hang off.
      _fetchPaged("class_instances", "starts_at"),
      _fetchPaged("attendance", "checked_in_at"),
    ]);
    // Retention actions are pulled defensively and separately, so a not-yet-applied
    // 0008 degrades to "no actions recorded" instead of breaking attendance
    // hydration outright — the same shape hydratePersonas uses for 0006.
    let serverRa = null;
    let raComplete = false;
    try {
      const rPaged = await _fetchPaged("retention_actions", "occurred_at");
      if (!rPaged.error) { serverRa = (rPaged.rows || []).map(_rowToRa); raComplete = rPaged.complete; }
    } catch (_) { /* table may not exist yet */ }
    if (mRes.error || cPaged.error || aPaged.error) {
      console.warn("[store] hydrateAttendance failed:", (mRes.error || cPaged.error || aPaged.error).message);
      return null;
    }
    const serverMembers = (mRes.data || []).map(_rowToMember);
    const serverCis     = (cPaged.rows || []).map(_rowToCi);
    const serverAtt     = (aPaged.rows || []).map(_rowToAtt);

    // Uses the shared _guardList (I3) rather than the local copy this once had —
    // one implementation means a fix to the guard reaches every domain, which is
    // the whole point of generalising it.
    const members = _guardList("members", serverMembers, getMembers, saveMembers);
    const cis     = _guardList("class_instances", serverCis, getClassInstances, saveClassInstances);

    // Append log: never drop a local check-in the server hasn't got. Push up only
    // what we can PROVE it lacks — see _mergeAppendLog on why `complete` matters.
    const att = _mergeAppendLog(serverAtt, getAttendance(), aPaged.complete);
    if (att.toPush.length) _pushAttendance(att.toPush);
    const attendance = att.merged;

    // Same append-log rule as attendance: an action recorded offline is the only
    // copy, so merge and push it up rather than letting the server win.
    let retentionActions = getRetentionActions();
    if (serverRa !== null) {
      // Same merge as attendance, through the same function rather than a second
      // copy of the logic — a fix to one has to reach both, which is exactly why
      // _guardList was generalised.
      const ra = _mergeAppendLog(serverRa, retentionActions, raComplete);
      if (ra.toPush.length) {
        supabase.from("retention_actions").insert(ra.toPush.map(_raToRow)).then(
          ({ error }) => { if (error) _noteSyncError("retention_actions", error.message); },
          (e) => _noteSyncError("retention_actions", e?.message || e));
      }
      retentionActions = ra.merged;
      writeJSON(KEYS.retentionActions, retentionActions);
    }

    writeJSON(KEYS.members, members);
    writeJSON(KEYS.classInstances, cis);
    writeJSON(KEYS.attendance, attendance);
    return { members, classInstances: cis, attendance, retentionActions };
  } catch (e) {
    console.warn("[store] hydrateAttendance error:", e?.message || e);
    return null;
  }
}

// ── I13: the re-push registry and the retry driver ───────────────────────────
// One thunk per syncable table that re-pushes the CURRENT local state for that
// domain. We do NOT retain the exact failed payload — the ledger records only
// that a table's last write failed — so the honest retry is "push what local
// holds now", which is also self-correcting: a value that has since been edited
// (or healed by a normalizer like planSource on read) pushes the corrected row.
//
// Every push here is idempotent by construction: list/blob domains upsert on a
// stable key, and the append logs insert with ignoreDuplicates.
//
// The scoping this comment used to describe as "what I10 (delta writes, deferred)
// would buy" HAS LANDED — the id-keyed thunks below call the same `save*` they
// always did, and those now route through `_bgUpsertDelta`, so a retry re-sends
// only the rows the server never confirmed rather than the whole domain. That is
// the property I10's header calls accidentally-self-healing, kept deliberately:
// a failed push marks nothing, so the row stays in the next delta.
//
// Two thunks are still whole-payload, for reasons that are not I10's to fix.
// `attendance` re-pushes the full log because it is an append-only insert with
// ignoreDuplicates and keeps no per-row sync marks. brand_profiles and user_prefs
// have no single "save current state" setter — their columns are written by many
// partial upserts — so their thunks re-assemble the full row the way _hydrate*'s
// seed path does.
//
// consent_records is deliberately absent: recordConsent keeps no local copy, so
// there is nothing to re-push. A failed consent write is a separate gap (it needs
// a local consent ledger) and is not something a blind retry can honestly close.
const _RETRY_PUSHERS = {
  class_schedule_rules: () => saveUserClasses(getUserClasses()),
  // "No overrides" is a real state for this table — a gym that resets, or edits
  // back to the built-in catalogue, has its row DELETED (DEC-13). Re-pushing
  // blindly would upsert `data: null` and resurrect the row the failed write was
  // trying to remove, so the retry has to mirror whichever operation failed.
  library_overrides:    () => { const d = getLibraryCustom();
                          if (d) saveLibraryCustom(d); else resetLibraryCustom(); },
  brand_profiles:       () => _bgUpsert("brand_profiles", { gym_id: _ctx.gymId,
                          branding: getGymBranding(), active_skin_id: getSkinId(),
                          custom_skin_tokens: getCustomSkinTokens() }, "gym_id"),
  user_prefs:           () => { const dp = getDisplayPrefs(); _bgUpsert("user_prefs", {
                          user_id: _ctx.userId, display_preset: dp.preset, display_font_scale: dp.fontScale,
                          crossfade: getCrossfade(), exercise_db_key: getExerciseDbKey() || null,
                          template_tracks: getTemplateTracks(), dj_energy: getDjEnergy(),
                          dj_bpm_min: getDjBpmMin(), dj_bpm_max: getDjBpmMax(), dj_transition: getDjTransition(),
                          dj_follow_structure: getDjFollowStructure(), dj_take_requests: getDjTakeRequests(),
                          dj_clean_edits: getDjCleanEdits() }, "user_id"); },
  // ⚠️ These three are the only tables `_bgDelete` touches by `id`, and an upsert
  // of the local list cannot express a removal — so each flushes its tombstones
  // BEFORE re-pushing. Without the flush the retry would succeed on the push,
  // report the table healthy, and leave the deleted row on the server forever.
  // See PENDING_DEL_KEY for the whole argument.
  coach_personas:       () => { _flushPendingDeletes("coach_personas"); savePersonas(getPersonas()); },
  persona_plans:        () => { _flushPendingDeletes("persona_plans"); savePersonaPlans(getPersonaPlans()); },
  persona_movements:    () => { _flushPendingDeletes("persona_movements"); savePersonaMovements(getPersonaMovements()); },
  persona_generations:  () => savePersonaGenerations(getPersonaGenerations()),
  // ⚠️ THE ROSTER HAS TO LAND BEFORE THE REQUESTS DO. `cover_requests`'
  // from/to columns are FKs to `coach_roster`, so re-pushing requests at a
  // server that never received the roster fails on the foreign key and reads
  // like a broken cover table. Both thunks therefore push the roster; the
  // roster's own delta is empty when it is already synced, so the extra call
  // costs one localStorage read and no request.
  coach_roster:         () => { _flushPendingDeletes("coach_roster"); saveCoaches(getCoaches()); },
  // Absences reference the roster, so the roster goes first for the same reason
  // cover requests do. No tombstone flush: withdrawing an absence is an update.
  coach_absences:       () => { saveCoaches(getCoaches()); saveAbsences(getAbsences()); },
  cover_requests:       () => { saveCoaches(getCoaches());
                          _pushCoverInserts(getCoverRequests().map(_coverToRow)); },
  members:              () => saveMembers(getMembers()),
  class_instances:      () => saveClassInstances(getClassInstances()),
  attendance:           () => _pushAttendance(getAttendance()),
  retention_actions:    () => { const rows = getRetentionActions(); if (rows.length)
                          supabase.from("retention_actions").upsert(rows.map(_raToRow),
                            { onConflict: "id", ignoreDuplicates: true }).then(
                            ({ error }) => { if (error) _noteSyncError("retention_actions", error.message);
                                             else _clearSyncError("retention_actions"); },
                            (e) => _noteSyncError("retention_actions", e?.message || e)); },
};

// Run the retries that are due. `force` (used by the online-event trigger) retries
// every ledgered table regardless of backoff, because regaining connectivity is a
// strong, real signal — not a guess a timer is making. Returns the tables it
// re-pushed, for tests and callers. Never throws: a retry must not be able to
// break the caller any more than the original fire-and-forget write could.
export function _retryNow({ force = false } = {}) {
  if (!_synced()) return [];
  let tables = [];
  try {
    const errors = readJSON(SYNC_ERR_KEY, {});
    const online = (typeof navigator === "undefined") ? true : navigator.onLine !== false;
    tables = force ? Object.keys(errors).sort()
                   : _dueRetries(errors, { online, now: Date.now() });
    tables.forEach(t => { const push = _RETRY_PUSHERS[t]; if (push) push(); });
  } catch (_) { /* a retry can never be the thing that breaks a session */ }
  return tables;
}

// Install the two triggers, once. Idempotent: calling it again (connect() runs on
// every auth change) does not stack listeners or intervals. The interval only does
// work while the ledger is non-empty and we are online, so a healthy app pays
// nothing but a cheap localStorage read per tick.
let _retryInstalled = false;
const RETRY_TICK_MS = 30_000;
export function startSyncRetry() {
  if (_retryInstalled || typeof window === "undefined") return;
  _retryInstalled = true;
  window.addEventListener("online", () => _retryNow({ force: true }));
  setInterval(() => {
    if (!_synced()) return;
    const errors = readJSON(SYNC_ERR_KEY, {});
    if (Object.keys(errors).length) _retryNow({ force: false });
  }, RETRY_TICK_MS);
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

// ── Coach roster (S30 §2.1; synced S32 §2.1) → localStorage + Postgres ──────
// Local shape: { id, name, aliases:[], userId, active, availability:{}, availabilityAt }
// Postgres:    public.coach_roster (migration 0010), id-keyed exactly like the
//              persona tables — the client mints a uuid and it IS the server PK.
//
// 🔴 THIS DOMAIN NOW SYNCS, AND THE TABLE IT SYNCS TO MAY NOT EXIST YET.
// Migration `0010_coach_cover.sql` is written and unapplied (DYLAN-QUEUE A15),
// so on a gym whose server has not had it run, every push here fails. That is
// the correct behaviour and not a reason to hold the client half back: the
// failure lands in the sync ledger, the banner names `coach_roster`, and the
// retry driver re-sends on the day the migration runs. Until then the roster
// behaves exactly as it did before — local, and honest about it.
//
// ⚠️ WHY THIS IS SAFE TO SHIP AHEAD OF THE MIGRATION, given that `_classToRow`'s
// lesson says the opposite. That lesson is about a COLUMN added to an existing
// table's mapper: PostgREST rejects the whole batch, so one unknown key stops
// every class in the gym from syncing. This is a SEPARATE TABLE with its own
// request. A missing `coach_roster` cannot touch `class_schedule_rules`, and
// `dbConstraints.test.js` guards the mapper below against 0010's own
// `create table` so the column-side of that lesson still applies here.
//
// ⚠️ THE SHORTCUT THAT IS STILL BANNED. Do not push the roster into a jsonb
// column that already round-trips (`brand_profiles.branding` is right there).
// `saveGymBranding` writes that blob whole, so the next Brand Studio save would
// silently drop the gym's entire staff list — the same data loss this module
// exists to prevent, arriving from a screen with nothing to do with coaching.
export function getCoaches() { return readJSON(KEYS.coaches, []); }

// The account behind a typed coach name, or null.
//
// This is the ONLY bridge from the free text on a class to a real person, and
// `null` is the honest answer for most gyms most of the time: a name nobody has
// put on the roster, or a roster entry with no account, is not a person the
// database can point at. Returning null keeps `class_instances.coach_id`
// meaning what its column name says.
//
// ⚠️ Reads the roster per call, and `_ciToRow` is used through `.map()`. That is
// a JSON parse per published class — a week is tens of rows, not thousands — and
// the alternative (threading a roster argument through the mapper) would put a
// parameter on the one function that must stay callable from a test with nothing
// but a row. Revisit if a gym ever publishes a year in one press.
export function coachAccountFor(name) {
  const entry = resolveCoach(getCoaches(), name);
  return entry?.userId || null;
}
// 🔴 GUARDED BY dbConstraints.test.js against 0010's own `create table`. A key
// here that the migration has not created would fail every roster push with a
// message naming only the table, which is the failure this repo pays for most.
export function _coachToRow(c) {
  return {
    id:              c.id,
    gym_id:          _ctx.gymId,
    name:            c.name,
    // `text[] not null default '{}'` — an absent list goes as [], never null.
    aliases:         c.aliases || [],
    // "" is the normal LOCAL value for "no account linked" (see makeCoach), and
    // the column is a nullable FK to profiles. "" is not a uuid, so it must not
    // travel: Postgres would reject the row rather than read it as absent.
    user_id:         c.userId || null,
    active:          c.active !== false,
    availability:    c.availability || {},
    // Same rule, for the same reason: "" is the local "never stated" and the
    // column is `date`. `availabilityState` needs to tell those apart, and null
    // is how the database spells it.
    availability_at: c.availabilityAt || null,
  };
}
// The inverse. `normaliseAvailability` on the way in for the same reason
// `planSource` normalises on read: a grid that reached the server before a
// tightening of the rules must not come back and fail the next push.
function _rowToCoach(r) {
  return {
    id:             r.id,
    name:           r.name || "",
    aliases:        r.aliases || [],
    userId:         r.user_id || "",
    active:         r.active !== false,
    availability:   normaliseAvailability(r.availability || {}),
    availabilityAt: r.availability_at || "",
  };
}

export function saveCoaches(list) {
  writeJSON(KEYS.coaches, list || []);
  if (!_synced()) return;
  // The same delta writer every other id-keyed domain uses. No second mechanism:
  // a roster re-save that changed one coach's grid sends one row.
  _bgUpsertDelta("coach_roster", (list || []).map(_coachToRow));
}

export function addCoach(name, extra = {}) {
  const c = { ...makeCoach(name, extra), id: extra.id || newId() };
  const list = [...getCoaches(), c];
  saveCoaches(list);
  return { coach: c, coaches: list };
}

// Patch-shaped, exactly as updateMember is, and for the same reason: a caller
// holding a stale copy must not be able to blank a field it never meant to
// touch. Unknown keys are dropped.
export function updateCoach(id, patch = {}) {
  const list = getCoaches();
  const i = list.findIndex(c => c && c.id === id);
  if (i < 0) return { coach: null, coaches: list };

  const cur = list[i];
  const next = { ...cur };
  if ("name" in patch)    next.name = String(patch.name || "").trim();
  if ("userId" in patch)  next.userId = String(patch.userId || "").trim();
  if ("active" in patch)  next.active = !!patch.active;
  if ("aliases" in patch) {
    // Deduplicated by match key, blanks dropped, and an alias that merely
    // restates the entry's own name is dropped too — it would be a second way of
    // saying the same thing, and it would survive a rename as a stale duplicate.
    const seen = new Set([coachKey(next.name)]);
    next.aliases = (patch.aliases || []).map(a => String(a || "").trim()).filter(a => {
      const k = coachKey(a);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if ("availability" in patch) {
    next.availability = normaliseAvailability(patch.availability);
    // 🔴 STAMPED HERE, not by the caller. Availability whose date the UI supplies
    // is availability whose date a UI can forget to supply, and a grid with no
    // date is exactly the "claim from March" this stamp exists to expose. Local
    // calendar date, matching `daysBetween`'s reasoning: the reader is a human
    // with a wall calendar, not a clock.
    next.availabilityAt = localDateStr();
  }

  // A coach with no name cannot be resolved from a class or picked from a list,
  // and an empty row in a roster is worse than a missing one.
  if (!next.name) return { coach: cur, coaches: list };

  const out = list.slice();
  out[i] = next;
  saveCoaches(out);
  return { coach: next, coaches: out };
}

// Returns the PRIOR LIST, not the removed row: position is part of what was
// lost, and an undo that appends the coach back at the end has not undone
// anything the person looking at the screen would recognise.
export function removeCoach(id) {
  const before = getCoaches();
  const after = before.filter(c => c && c.id !== id);
  saveCoaches(after);
  // ⚠️ AN UPSERT OF `after` CANNOT EXPRESS A REMOVAL — the same reason the three
  // persona tables delete explicitly. `_bgDelete` also `_unmark`s the id, which
  // is what makes the toast's undo actually reach Postgres: `saveCoaches(before)`
  // recomputes a delta that now contains the restored row instead of matching a
  // dead fingerprint and pushing nothing. That is `restorePersonaCascade`'s
  // lesson, and here it comes for free rather than needing its own function.
  if (_synced()) _bgDelete("coach_roster", "id", id);
  return { coaches: after, before };
}

// ── Cover requests (S30 §2.3; synced S32 §2.1) → localStorage + Postgres ────
//
// 🔴 THE ONE DOMAIN WHERE "LOCAL ONLY" IS NOT A DEGRADATION BUT A FAILURE.
// A roster that lives on one device still does useful work there. A cover
// request that lives on one device does NOTHING AT ALL — its entire purpose is
// to reach a second person. `coverRequests.js`'s header is the long version and
// it should be read before this is extended.
//
// 🔴🔴 THIS TABLE IS NOT WRITTEN THE WAY EVERY OTHER LIST DOMAIN IS, AND THE
// DIFFERENCE IS THE WHOLE FEATURE. `_bgUpsertDelta` would be catastrophic here,
// and not in a way any test of the delta writer would catch:
//
//   Device A holds request R as `open`. Device B approves it, so the server now
//   says `approved`. Device A hydrates — which writes no delta marks, because
//   nothing does — and then the coach on A raises an unrelated request. The
//   delta is "every row whose fingerprint has no mark", which after a hydrate is
//   ALL OF THEM, so the list upsert re-sends R as `open`. The approval is gone.
//   Nothing failed, nothing logged, and the ledger says the table synced.
//
// So a cover request has exactly TWO legal server writes, and they are the two
// the migration's RLS policies allow (insert, update — and deliberately no
// delete, because a request that was answered is a record of who covered what):
//
//   1. INSERT, when it is raised. Idempotent via `ignoreDuplicates`, the same
//      append-log shape as `attendance` and `retention_actions`. ⚠️ THE FLAG IS
//      LOAD-BEARING, NOT AN OPTIMISATION: it is what makes re-pushing the local
//      list on a retry unable to touch a row the server has already settled.
//   2. The CONDITIONAL UPDATE that settles it — `settleCoverRequest` below,
//      through `compareAndSet`. Never an upsert. See that function's comment.
//
// `saveCoverRequests` is therefore a LOCAL WRITE ONLY, and keeps its name so the
// undo/toast call sites in the panel are unchanged. The two pushers are named
// separately so that "which write is this?" is answered at the call site.
export function getCoverRequests() { return readJSON(KEYS.coverRequests, []); }
export function saveCoverRequests(list) { writeJSON(KEYS.coverRequests, list || []); }

// 🔴 GUARDED BY dbConstraints.test.js against 0010's `create table`, and its
// `status` is guarded against 0010's CHECK by the same file.
export function _coverToRow(r) {
  return {
    id:              r.id,
    gym_id:          _ctx.gymId,
    class_client_id: r.classClientId,
    class_label:     r.classLabel,
    class_day:       r.classDay || null,
    class_slot:      r.classSlot || null,
    // 🔴 WHICH DAY. Null only for a request raised before S33 — see 0010's own
    // comment on why the column is nullable rather than `not null`.
    class_date:      r.classDate || null,
    absence_id:      r.absenceId || null,
    // Roster ids, and "" is the local "not known". Both are nullable FKs to
    // coach_roster, so "" must become null or Postgres rejects the row.
    from_coach_id:   r.fromCoachId || null,
    to_coach_id:     r.toCoachId || null,
    status:          r.status,
    note:            r.note || null,
    // The local timestamp travels rather than letting the column default fire:
    // `created_at` is what "raised 20 minutes ago" is read from, and a row that
    // was raised offline and inserted an hour later would otherwise claim to be
    // an hour younger than it is.
    created_at:      r.createdAt || new Date().toISOString(),
    settled_at:      r.settledAt || null,
    settled_by:      r.settledBy || null,
  };
}
function _rowToCover(r) {
  return {
    id: r.id, classClientId: r.class_client_id || "", classLabel: r.class_label || "",
    classDay: r.class_day || "", classSlot: r.class_slot || "",
    classDate: r.class_date || "", absenceId: r.absence_id || "",
    fromCoachId: r.from_coach_id || "", toCoachId: r.to_coach_id || "",
    note: r.note || "", status: r.status || "open",
    createdAt: r.created_at || "", settledAt: r.settled_at || "",
    settledBy: r.settled_by || "",
  };
}

// Write 1: the insert. `ignoreDuplicates` is the safety property described above.
function _pushCoverInserts(rows) {
  if (!rows || !rows.length) return;
  supabase.from("cover_requests").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).then(
    ({ error }) => {
      if (error) {
        console.warn("[store] cover_requests insert failed:", error.message);
        _noteAbsent("cover_requests", _isMissingTable(error));
        _noteSyncError("cover_requests", error.message);
      } else { _noteAbsent("cover_requests", false); _clearSyncError("cover_requests"); }
    },
    (e) => _noteSyncError("cover_requests", e?.message || e));
}

// Raise one. Local first, exactly like every other domain; the insert follows.
export function addCoverRequest(req) {
  if (!req) return getCoverRequests();
  const list = [...getCoverRequests(), req];
  saveCoverRequests(list);
  if (_synced()) _pushCoverInserts([_coverToRow(req)]);
  return list;
}

// Write 2: the settle. THE ONE PLACE IN THIS FILE THAT DOES NOT WRITE LOCALLY
// FIRST, and the reason is the only reason that could justify it.
//
// 🔴 EVERY OTHER DOMAIN IS LOCAL-FIRST BECAUSE THE LOCAL ANSWER IS THE TRUE ONE
// AND THE SERVER IS A COPY. A settle is the opposite: two coaches on two phones
// both press Approve on the same 5am request, both read `open`, and both are
// right at the moment they read. There is no local fact to be first about — the
// question "who got it" is only decided where both writes meet, and that is
// Postgres under a row lock. A device that applied its own approval and told the
// coach so would be showing an approval that did not happen, which is the exact
// defect `settleCover`'s `changed:false` branch was built to report.
//
// So when there is somewhere to decide it, the server decides and the local
// write follows the answer. When there is NOT — no credentials, or migration
// 0010 unapplied so the table is absent — we fall back to the device-only path
// that shipped in S30, because refusing to settle at all would be a regression
// for the gym that has been using this locally. `deliveryTruth` reports the same
// two worlds in the same words, from `tableAbsent`, so the screen and the write
// cannot disagree about which one we are in.
//
// Returns settleCover's shape plus `where` ("device" | "server") and, on the
// losing branch, the status that actually won.
export async function settleCoverRequest(id, next, { now = Date.now(), coachId = "" } = {}) {
  const list = getCoverRequests();
  const local = settleCover(list, id, next, { now, by: _ctx.userId || "", coachId });

  // Refused locally — gone, illegal, or already settled on THIS device. No
  // request is worth making; the caller renders the reason.
  if (!local.changed) return { ...local, where: "local" };

  const deviceOnly = !_synced() || tableAbsent("cover_requests");
  if (deviceOnly) {
    saveCoverRequests(local.list);
    return { ...local, where: "device" };
  }

  const row = _coverToRow(local.request);
  const res = await compareAndSet(supabase, "cover_requests", id,
    // The guard IS the mutual exclusion. `status: "open"` re-evaluated under the
    // row lock is what the second writer loses against.
    { status: "open" },
    // `to_coach_id` rides the same conditional update, so "who is covering" is
    // written by the transaction that decided the race and cannot disagree with
    // it. Setting it separately would let a lost claim still stamp its name.
    { status: row.status, settled_at: row.settled_at, settled_by: row.settled_by,
      to_coach_id: row.to_coach_id });

  if (res.outcome === CAS_WON) {
    saveCoverRequests(local.list);
    _noteAbsent("cover_requests", false);
    _clearSyncError("cover_requests");
    return { ...local, where: "server" };
  }

  if (res.outcome === CAS_LOST) {
    // Somebody else settled it. Telling the coach "you lost" without saying what
    // won leaves them to guess whether the class is covered — which is the one
    // fact they came here for. One extra round-trip, on the rare branch, for the
    // answer that matters most.
    let won = "";
    try {
      const { data } = await supabase.from("cover_requests").select("*").eq("id", id).maybeSingle();
      if (data) {
        won = data.status || "";
        const adopted = list.slice();
        const i = adopted.findIndex(r => r && r.id === id);
        if (i >= 0) adopted[i] = _rowToCover(data);
        saveCoverRequests(adopted);
        return { list: adopted, request: adopted[i] || null, changed: false,
                 reason: won || "settled", where: "server" };
      }
    } catch (_) { /* the read is a courtesy; losing is already decided */ }
    return { list, request: local.request, changed: false, reason: won || "settled", where: "server" };
  }

  // CAS_FAIL. The write did not complete, so NOTHING is written locally: a
  // settle we cannot confirm is not a settle, and recording it would recreate
  // the phantom approval this function exists to prevent. The ledger gets it and
  // the retry driver will not "fix" it — there is no re-push for a transition,
  // which is correct, because by the time we are back online the answer may be
  // somebody else's. The coach presses Approve again and finds out.
  _noteAbsent("cover_requests", _isMissingTable(res.error));
  _noteSyncError("cover_requests", res.error || "settle failed");
  return { list, request: local.request, changed: false, reason: "unconfirmed", where: "server" };
}

// ── Coach absences (S33) → localStorage + Postgres ──────────────────────────
//
// Local shape: { id, coachId, from, to, note, createdAt, cancelledAt }.
// `coachAbsence.js` owns what an absence MEANS and which classes it takes a
// coach away from; this owns only where the row lives.
//
// ⚠️ NO `_bgDelete` HERE, and that is not an omission. Withdrawing an absence
// sets `cancelledAt` rather than removing the row — the cover requests already
// raised against it point at its id, and deleting it would leave them pointing
// at nothing. So the delta writer alone is enough and there are no tombstones to
// flush, which is the first id-keyed domain in this file that genuinely needs
// neither.
export function _absenceToRow(a) {
  return {
    id:           a.id,
    gym_id:       _ctx.gymId,
    coach_id:     a.coachId,
    // Local calendar dates, travelling as the strings they already are. Nothing
    // here builds a Date — see coachAbsence.js's header for why.
    from_date:    a.from,
    to_date:      a.to,
    note:         a.note || null,
    created_at:   a.createdAt || new Date().toISOString(),
    cancelled_at: a.cancelledAt || null,
  };
}
function _rowToAbsence(r) {
  return {
    id: r.id, coachId: r.coach_id || "",
    from: r.from_date || "", to: r.to_date || "",
    note: r.note || "", createdAt: r.created_at || "",
    cancelledAt: r.cancelled_at || "",
  };
}

export function getAbsences() { return readJSON(KEYS.absences, []); }
export function saveAbsences(list) {
  writeJSON(KEYS.absences, list || []);
  if (!_synced()) return;
  _bgUpsertDelta("coach_absences", (list || []).map(_absenceToRow));
}

// Record one. Returns { absence, absences } or { absence: null, ... } when the
// range was refused — `makeAbsence` is the single judge of that and the caller
// renders `absenceError`'s sentence rather than re-deciding.
export function addAbsence({ coachId, from, to, note = "" } = {}) {
  const list = getAbsences();
  const a = makeAbsence({ id: newId(), coachId, from, to, note });
  if (!a) return { absence: null, absences: list };
  const next = [...list, a];
  saveAbsences(next);
  return { absence: a, absences: next };
}

// Withdraw one, and take back the asks it raised. NOT a delete: see the header.
//
// 🔴 A CLAIMED COVER IS LEFT ALONE, and that is the whole judgement in this
// function. "Mara is back after all" cancels the QUESTION; it does not cancel
// Dev having already agreed to teach Thursday and planned their week around it.
// Withdrawing that is a conversation between two people, not a side effect of
// pressing a button — so the open ones go and the claimed ones stay, and the
// panel says how many of each.
// ⚠️ ASYNC, AND THE WITHDRAWALS ARE SEQUENTIAL. Fired in parallel they each read
// `getCoverRequests()` before any of them writes, so every one of them saves a
// list containing only its OWN change and the last write wins — a coach
// withdrawing a week's absence would find one class still on the board and no
// error anywhere. Found by a test asserting all of them landed, which is the
// only reason it was found at all: with a server each settle is a round trip, so
// the race is wide open and completely invisible on a fast one.
export async function cancelAbsence(id, { now = Date.now() } = {}) {
  const list = getAbsences();
  const i = list.findIndex(a => a && a.id === id);
  if (i < 0 || list[i].cancelledAt) return { absence: null, absences: list, withdrawn: 0, kept: 0 };
  const next = list.slice();
  next[i] = { ...list[i], cancelledAt: new Date(now).toISOString() };
  saveAbsences(next);

  const mine = getCoverRequests().filter(r => r && r.absenceId === id);
  const open = mine.filter(isOpen);
  const kept = mine.filter(r => r.status === "approved").length;
  // Withdrawn one at a time through the ordinary settle so each goes through the
  // same transition rule — and, when there is a server, the same conditional
  // update. A coach claiming one of these in the same second must still win it.
  for (const r of open) await settleCoverRequest(r.id, "cancelled", { now });

  return { absence: next[i], absences: next, withdrawn: open.length, kept };
}

/**
 * Raise a cover request for every class an absence takes a coach away from.
 *
 * ⚠️ SKIPS AN OCCURRENCE THAT ALREADY HAS ONE. Re-recording an overlapping
 * absence, or opening the panel twice, must not put the same Thursday on the
 * board two or three times — two open asks for one class is how two coaches both
 * turn up. A CANCELLED request does not count as one: a coach who withdrew an
 * ask and then genuinely does need cover has to be able to raise it again.
 *
 * The inserts go in ONE batch rather than through `addCoverRequest` per class:
 * a week's absence is six requests and six fire-and-forget round trips would be
 * six chances to half-land.
 */
export function raiseCoversForAbsence(absence, occurrences) {
  const existing = getCoverRequests();
  if (!absence?.id) return { created: [], requests: existing };

  const made = [];
  const seen = new Set();
  for (const o of occurrences || []) {
    const date = o?.date || occurrenceDate(o);
    if (!date || !o.ruleId) continue;
    const key = `${o.ruleId}@${date}`;
    if (seen.has(key)) continue;                 // two rules onto one cell
    seen.add(key);
    const already = requestsForOccurrence(existing, o.ruleId, date)
      .some(r => r.status !== "cancelled");
    if (already) continue;
    const req = makeCoverForOccurrence({ id: newId(), occurrence: o,
                                         fromCoachId: absence.coachId, absenceId: absence.id });
    if (req) made.push(req);
  }
  if (!made.length) return { created: [], requests: existing };

  const next = [...existing, ...made];
  saveCoverRequests(next);
  if (_synced()) _pushCoverInserts(made.map(_coverToRow));
  return { created: made, requests: next };
}

// ── The booking outbox (S32 §2.4) → localStorage ONLY, and staying that way ──
//
// A record of what each approval handed to the booking seam. `bookingAdapter.js`
// owns the shape, the idempotency key and the cap; this is only the seam that
// lets it reach localStorage without that module growing an import.
//
// 🔴 LOCAL ON PURPOSE, AND NOT AS A STAGING POST. It is a log of what THIS
// DEVICE handed over, and syncing it would need a third table in a migration
// nobody has run — for a queue that may never be drained at all, depending on
// how A16 question 3 comes back. A cover approval settles on exactly one device
// (the compare-and-set has one winner), so the device that recorded it is the
// device that did it, and per-device idempotency is per-event idempotency.
export function getBookingOutbox() { return readJSON(KEYS.bookingOutbox, []); }
export function saveBookingOutbox(list) { writeJSON(KEYS.bookingOutbox, list || []); }

// ── One hydrate for both tables (S32 §2.1) ──────────────────────────────────
//
// Pulled together because they are one feature and one migration: a cover
// request whose roster entry has not arrived renders as "someone", which is
// worse than rendering nothing.
//
// ⚠️ THE TWO TABLES USE DIFFERENT MERGE RULES ON PURPOSE, and reading them side
// by side is the fastest way to see why.
//
//   coach_roster   — server-wins EXCEPT for rows this device has edited and not
//                    yet had confirmed (`_preferLocalEdits`). The roster is the
//                    first domain two people edit on two devices, and the edit
//                    a coach just typed must not lose to a copy the server
//                    happens to hold.
//   cover_requests — server-wins, FULL STOP. The local status of a request is
//                    never ahead of the server's: the only path that changes it
//                    while synced is `settleCoverRequest`, which writes locally
//                    only after Postgres has already agreed. So a local value
//                    that differs from the server is by construction a value
//                    that LOST, and preferring it would resurrect exactly the
//                    approval-that-did-not-happen this design is built around.
//
// Returns { coaches, requests, absences } or null when not synced / on error,
// so the caller keeps whatever it already had.
function _probeTable(table, error) {
  if (!error) _noteAbsent(table, false);
  else if (_isMissingTable(error)) _noteAbsent(table, true);
}

export async function hydrateCoachCover() {
  if (!_synced()) return null;
  try {
    const [rRes, qRes, aRes] = await Promise.all([
      supabase.from("coach_roster").select("*").eq("gym_id", _ctx.gymId),
      supabase.from("cover_requests").select("*").eq("gym_id", _ctx.gymId),
      supabase.from("coach_absences").select("*").eq("gym_id", _ctx.gymId),
    ]);

    // The probe that lets the UI stop claiming delivery. Each table is recorded
    // on its own — they are separate relations and 0010 could half-apply.
    //
    // ⚠️ ONLY A SUCCESSFUL READ CLEARS AN ABSENCE. A network error is not
    // evidence that the table is there; treating it as such would let a gym that
    // has never run 0010 go back to being told a cover request is "waiting for
    // Dev" for the duration of an outage — a claim that is false whether or not
    // the wifi is working. Absence is asserted only by the error that means it.
    _probeTable("coach_roster", rRes.error);
    _probeTable("cover_requests", qRes.error);
    _probeTable("coach_absences", aRes.error);

    if (rRes.error || qRes.error || aRes.error) {
      console.warn("[store] hydrateCoachCover failed:",
        (rRes.error || qRes.error || aRes.error).message);
      return null;
    }

    const serverCoaches = (rRes.data || []).map(_rowToCoach);
    const serverReqs    = (qRes.data || []).map(_rowToCover);
    const serverAbs     = (aRes.data || []).map(_rowToAbsence);
    const localCoaches  = getCoaches();

    // Seed from local when the server has nothing — the same first-run shape as
    // hydrateUserClasses and hydratePersonas. Returning null keeps local as-is
    // rather than flickering through an empty roster.
    if (serverCoaches.length === 0 && localCoaches.length > 0) {
      // 🔴 DROP THE MARKS FIRST, or the seed can push nothing at all. `saveCoaches`
      // sends a DELTA, and a mark says "the server confirmed this content" — but
      // we are standing here BECAUSE the server has no roster, so every mark is
      // provably wrong. Without this, a device whose gym's server was reset (or
      // re-provisioned) keeps its whole roster to itself for ever: the delta is
      // empty, no request is made, and no error is recorded anywhere. That is
      // `restorePersonaCascade`'s lesson arriving from the other direction, and
      // it is why that function drops marks before re-saving too.
      localCoaches.forEach(c => c && _unmark("coach_roster", c.id));
      saveCoaches(localCoaches);
      const localAbs = getAbsences();
      if (localAbs.length) { localAbs.forEach(a => a && _unmark("coach_absences", a.id)); saveAbsences(localAbs); }
      const localReqs = getCoverRequests();
      if (localReqs.length) _pushCoverInserts(localReqs.map(_coverToRow));
      return null;
    }

    const unsynced = _unsyncedIds("coach_roster", localCoaches.map(_coachToRow));
    const preferred = _preferLocalEdits(serverCoaches, localCoaches, unsynced);
    const coaches = _guardList("coach_roster", preferred, getCoaches, saveCoaches);
    // ⚠️ ABSENCES TAKE THE ROSTER'S RULE, NOT THE COVER REQUESTS'. An absence is
    // something a coach TYPES on their own device and the push is
    // fire-and-forget, so the "server has an older copy of a row I just edited"
    // case is live here exactly as it is for an availability grid. A cover's
    // status is never legitimately ahead of the server's, because the only path
    // that changes it while synced waits for Postgres to agree first.
    const localAbs   = getAbsences();
    const absUnsynced = _unsyncedIds("coach_absences", localAbs.map(_absenceToRow));
    const absences   = _guardList("coach_absences",
                                  _preferLocalEdits(serverAbs, localAbs, absUnsynced),
                                  getAbsences, saveAbsences);

    const requests = _guardList("cover_requests", serverReqs, getCoverRequests,
                                // ⚠️ The resave for THIS table is the insert, not a
                                // list upsert — see the section header.
                                (merged) => { saveCoverRequests(merged);
                                              _pushCoverInserts(merged.map(_coverToRow)); });

    writeJSON(KEYS.coaches, coaches);
    writeJSON(KEYS.coverRequests, requests);
    writeJSON(KEYS.absences, absences);

    // A row we kept because it was newer than the server's is a row the server
    // still has not got. `_guardList` only re-pushes when the LEDGER says the
    // table failed, and the commonest way to end up here is quieter than that —
    // a tab closed mid-request marks nothing and records no failure. Re-saving
    // recomputes the delta and sends exactly those rows.
    if (unsynced.size) saveCoaches(coaches);
    if (absUnsynced.size) saveAbsences(absences);

    return { coaches, requests, absences };
  } catch (e) {
    console.warn("[store] hydrateCoachCover error:", e?.message || e);
    return null;
  }
}
