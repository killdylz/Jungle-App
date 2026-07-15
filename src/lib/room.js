// Realtime room channel (workstreams B+C — the "missing organ").
//
// The coach's runner broadcasts the live class state over a Supabase Realtime
// broadcast channel scoped to the gym; a Room TV on ANY other signed-in device
// follows the same channel and mirrors the class without touching the coach's
// phone. Broadcast-only (no table writes, no migration); everything no-ops
// when Supabase is off or no gym is resolved, so the plain-localStorage build
// is unchanged.
import { supabase, supabaseEnabled } from "../supabase.js";

let channel = null;
let joinedGym = null;
let handler = null; // single App-level listener

function roomChannel(gymId) {
  if (!supabaseEnabled || !supabase || !gymId) return null;
  if (channel && joinedGym === gymId) return channel;
  if (channel) { try { supabase.removeChannel(channel); } catch { /* stale */ } }
  joinedGym = gymId;
  channel = supabase.channel(`room:${gymId}`, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "room_state" }, ({ payload }) => { if (handler) handler(payload); });
  channel.subscribe();
  return channel;
}

// Follow the room: cb fires with every state the active runner broadcasts.
// Returns an unlisten fn (the channel itself stays open for the broadcaster).
export function onRoomState(gymId, cb) {
  if (!roomChannel(gymId)) return () => {};
  handler = cb;
  return () => { if (handler === cb) handler = null; };
}

// Broadcast the runner's state. Called at most 1/s (the live tick) — well
// within Realtime's message budget. Silently skipped until the channel joins.
export function sendRoomState(gymId, payload) {
  const ch = roomChannel(gymId);
  if (!ch || ch.state !== "joined") return;
  try { ch.send({ type: "broadcast", event: "room_state", payload }); } catch { /* transient */ }
}
