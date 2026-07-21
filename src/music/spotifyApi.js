// ─── Spotify REST API, BPM data and track scoring ────────────────────────────
// Quarantined (audit 2.1, FLAGS.music). Every function here needs a token, and
// with music off no token is ever obtained, so none of them run.
// Moved verbatim from App.jsx in decomposition stage 3.
import { getToken } from "./spotifyAuth.js";
import { SCFG } from "../data/stageConfig.js";

const SPOTIFY_GENRES = ["afrobeat","blues","chill","country","dance","drum-and-bass","dubstep","edm","electronic","folk","funk","gospel","hip-hop","house","indie","jazz","latin","metal","piano","pop","r-n-b","reggae","reggaeton","rock","soul","techno","trap","workout"];

function rampVolume(player, from, to, secs){
  if(!player) return null;
  const steps = Math.max(1, Math.round(secs*10));
  let i=0; player.setVolume(from).catch(()=>{});
  const iv = setInterval(()=>{ i++; const v = from + (to-from)*(i/steps); player.setVolume(Math.max(0,Math.min(1,v))).catch(()=>{}); if(i>=steps) clearInterval(iv); }, 100);
  return iv;
}

// ─── Spotify REST API ─────────────────────────────────────────────────────────
async function spFetch(path, opts={}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const r = await fetch(`https://api.spotify.com/v1${path}`, { ...opts, headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json", ...opts.headers } });
  if (r.status===204||r.status===202) return {};
  const txt = await r.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const msg = json?.error?.message || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return json;
}
async function searchTracks(q) {
  const d = await spFetch(`/search?q=${encodeURIComponent(q)}&type=track&limit=10`);
  return d.tracks?.items || [];
}
async function searchPlaylists(q) {
  const d = await spFetch(`/search?q=${encodeURIComponent(q)}&type=playlist&limit=10`);
  return (d.playlists?.items || []).filter(Boolean); // Spotify can return null items
}
async function getAudioFeatures(ids) {
  if (!ids.length) return [];
  const d = await spFetch(`/audio-features?ids=${ids.slice(0,50).join(",")}`);
  return d.audio_features || [];
}
// ── BPM cache — persist fetched tempo data so we never re-fetch the same track ──
const BPM_CACHE_KEY = "sp_bpm_cache";
function getBpmCache() { try { return JSON.parse(localStorage.getItem(BPM_CACHE_KEY)||"{}"); } catch { return {}; } }
function saveBpmCache(map) { try { localStorage.setItem(BPM_CACHE_KEY, JSON.stringify(map)); } catch(_) {} }
// Enrich an array of {id,...} objects with BPM from cache or Spotify audio-features
async function enrichTracksWithBpm(tracks) {
  const cache = getBpmCache();
  const missing = [...new Set(tracks.filter(t=>t.id && !cache[t.id]).map(t=>t.id))];
  if (missing.length) {
    for (let i=0; i<missing.length; i+=50) {
      try {
        const feats = await getAudioFeatures(missing.slice(i, i+50));
        feats.filter(Boolean).forEach(f => { if (f?.tempo) cache[f.id] = Math.round(f.tempo); });
      } catch(_) {}
    }
    saveBpmCache(cache);
  }
  return tracks.map(t => ({ ...t, bpm: cache[t.id] || t.bpm || 0 }));
}
async function apiGetRecommendations({seedGenres=["workout"], minTempo, maxTempo, limit=20}) {
  const p = new URLSearchParams({ seed_genres: seedGenres.join(","), limit: String(limit) });
  if (minTempo != null) p.set("min_tempo", String(Math.round(minTempo)));
  if (maxTempo != null) p.set("max_tempo", String(Math.round(maxTempo)));
  const d = await spFetch(`/recommendations?${p}`);
  return d.tracks || [];
}
async function getSpotifyProfile() { return spFetch("/me"); }
// Normalise any raw Spotify track object (works for search results, playlist items, recommendations)
function normSpTrack(t) {
  const cache = getBpmCache();
  return { t:t.name||"", a:t.artists?.map(a=>a.name).join(", ")||"", bpm:cache[t.id]||0, uri:t.uri||"", id:t.id||"", albumArt:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||null, dur:Math.round((t.duration_ms||0)/1000) };
}
function normTrack(sp, af) {
  return { t:sp.name, a:sp.artists.map(x=>x.name).join(", "), bpm:Math.round(af?.tempo||0), uri:sp.uri, id:sp.id, albumArt:sp.album?.images?.[1]?.url||sp.album?.images?.[0]?.url||null, dur:Math.round((sp.duration_ms||0)/1000) };
}

// ── Deezer BPM helpers (no API key required) ────────────────────────
async function fetchBpmData(title, artist) {
  const cacheKey = `${title}|${artist}`.toLowerCase().replace(/\s+/g,"_");
  try {
    const cached = JSON.parse(localStorage.getItem("gsb_bpm_cache")||"{}");
    if (cached[cacheKey]) return cached[cacheKey];
    // Try Deezer public API (no key required)
    const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`);
    const r = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
    if (!r.ok) return null;
    const d = await r.json();
    const trackId = d.data?.[0]?.id;
    if (!trackId) return null;
    const r2 = await fetch(`https://api.deezer.com/track/${trackId}`);
    if (!r2.ok) return null;
    const t = await r2.json();
    if (!t.bpm) return null;
    const result = { bpm: Number(t.bpm)||0, key: "", camelot: "" };
    const cache = JSON.parse(localStorage.getItem("gsb_bpm_cache")||"{}");
    cache[cacheKey] = result;
    localStorage.setItem("gsb_bpm_cache", JSON.stringify(cache));
    return result;
  } catch { return null; }
}

function camelotCompat(a, b) {
  if (!a || !b) return 0.5;
  if (a === b) return 1.0;
  const numA = parseInt(a), numB = parseInt(b);
  const letA = a.slice(-1), letB = b.slice(-1);
  const diff = Math.min(Math.abs(numA-numB), 12-Math.abs(numA-numB));
  if (diff === 0) return 0.85; // parallel major/minor
  if (diff === 1) return 0.75; // adjacent key
  return 0.2;
}

function scoreTrackForStage(track, bpmMin, bpmMax, prevCamelot) {
  let score = 0;
  const bpm = track.bpm || 0;
  // BPM score (0-50): full 50 if within range, decreasing outside
  if (bpm > 0) {
    const mid = (bpmMin + bpmMax) / 2;
    const halfRange = (bpmMax - bpmMin) / 2 || 10;
    const dist = Math.max(0, Math.abs(bpm - mid) - halfRange);
    score += Math.max(0, 50 - (dist / halfRange) * 50);
  } else { score += 20; } // unknown BPM: partial credit
  // Camelot score (0-30)
  score += camelotCompat(track.camelot, prevCamelot) * 30;
  // Freshness: slight bonus for longer tracks (fills time better)
  score += Math.min(20, ((track.dur||180) / 60));
  return score;
}

function selectTracksForDuration(scoredTracks, durationSec, stageType) {
  const isIntense = ["circuit","cardio","hiit","strength","boxing","crossfit"].includes(stageType);
  const sorted = [...scoredTracks].sort((a,b) => b._score - a._score);
  const picked = [];
  let total = 0;
  for (const t of sorted) {
    if (total >= durationSec) break;
    picked.push(t);
    total += (t.dur||210);
  }
  // Energy arc: low→high BPM for intense stages, high→low for recovery
  picked.sort((a,b) => isIntense ? (a.bpm||120)-(b.bpm||120) : (b.bpm||120)-(a.bpm||120));
  return picked;
}

async function apiPlay(deviceId, uris) {
  const token = await getToken();
  if (!token||!deviceId||!uris.length) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method:"PUT", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify({ uris }) });
}
async function apiGetDevices() {
  const token = await getToken();
  if (!token) return [];
  const r = await fetch("https://api.spotify.com/v1/me/player/devices", { headers:{ Authorization:`Bearer ${token}` } });
  if (!r.ok) return [];
  const d = await r.json();
  return d.devices || [];
}
async function apiTransferPlayback(toDeviceId, play=false) {
  const token = await getToken();
  if (!token||!toDeviceId) return;
  await fetch("https://api.spotify.com/v1/me/player", { method:"PUT", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify({ device_ids:[toDeviceId], play }) });
}
async function apiGetPlaylists() {
  const token = await getToken();
  if (!token) return [];
  const r = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", { headers:{ Authorization:`Bearer ${token}` } });
  if (!r.ok) return [];
  const d = await r.json();
  return d.items || [];
}
async function apiGetPlaylistTracks(playlistId) {
  const token = await getToken();
  if (!token||!playlistId) return [];
  const tracks = [];
  const base = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&additional_types=track`;
  let url = `${base}&market=from_token`;
  let triedNoMarket = false;
  while (url) {
    const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) {
      const errBody = await r.json().catch(()=>({}));
      const errMsg  = errBody?.error?.message || "";
      if (r.status === 403) {
        const storedScope = localStorage.getItem("sp_scope") || "";
        // F8: a collaborative playlist often 403s with a GENERIC message when the saved token
        // predates the playlist-read-collaborative scope. Treat missing scope as a re-auth trigger.
        const scopeMissing = errMsg.toLowerCase().includes("scope")
          || (storedScope && !storedScope.includes("playlist-read-collaborative"));
        if (scopeMissing) { localStorage.removeItem("sp_scope"); return null; }
        // F8: collaborative/relinked playlists can 403 specifically due to market=from_token — retry once without it.
        if (!triedNoMarket) { triedNoMarket = true; url = base; continue; }
        // Still forbidden: Spotify dev-mode quota blocks track access to playlists owned by other users.
        return { denied: true, message: errMsg || "Forbidden" };
      }
      if (r.status === 404) {
        return { denied: true, message: "Playlist not found — it may have been deleted or made private." };
      }
      break;
    }
    const d = await r.json();
    (d.items||[]).forEach(it => {
      const tr = it?.item || it?.track;
      if (tr?.id && tr?.uri?.startsWith("spotify:track:")) tracks.push(tr);
    });
    url = d.next || null;
  }
  return tracks;
}

// F9: BPM colour-coding: blue=slow, green=moderate, orange=fast, red=intense
function bpmColor(bpm) {
  if (!bpm) return "var(--muted)";
  if (bpm < 90)  return "#3B82F6";
  if (bpm < 120) return "#10B981";
  if (bpm < 150) return "#F97316";
  return "#EF4444";
}
// F9: Check if a BPM value falls outside a stage's target range
function bpmMismatch(bpm, stageType) {
  if (!bpm) return false;
  const cfg = SCFG[stageType];
  if (!cfg?.bpmMin) return false;
  return bpm < cfg.bpmMin || bpm > cfg.bpmMax;
}

// ⚠ DEAD — `fetchBpmData` (Deezer) has no caller anywhere in the repo. It is moved
// flagged rather than deleted, on the same rule session 6 applied to
// nudgeForContrast and resolveSubBrand: relocating code is not the moment to
// decide a feature's fate. It joins the dead-symbol list awaiting a yes/no.
export {
  SPOTIFY_GENRES, rampVolume,
  spFetch, searchTracks, searchPlaylists, getAudioFeatures,
  getBpmCache, saveBpmCache, enrichTracksWithBpm, apiGetRecommendations, getSpotifyProfile,
  normSpTrack, normTrack, fetchBpmData, camelotCompat,
  scoreTrackForStage, selectTracksForDuration,
  apiPlay, apiGetDevices, apiTransferPlayback, apiGetPlaylists, apiGetPlaylistTracks,
  bpmColor, bpmMismatch,
};
