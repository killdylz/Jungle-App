import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Plus, Trash2, Monitor, ArrowLeft, Music, LogOut, Search, Loader, Wifi, User, Sun, Moon, BookOpen, BarChart2, Calendar, X, ChevronLeft, ChevronRight, Clock, Home, Layers, Share2, Check, Mic } from "lucide-react";

// ─── Load Canopy fonts (Space Grotesk display + Hanken Grotesk body) ──────────
(function injectFonts() {
  if (document.getElementById("jungle-fonts")) return;
  const l = document.createElement("link");
  l.id = "jungle-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
})();

const SPOTIFY_CLIENT_ID = "594e4864b902473c86c939c9cccce420";
const REDIRECT_URI      = window.location.origin + window.location.pathname;
const IS_CONFIGURED     = SPOTIFY_CLIENT_ID !== "YOUR_CLIENT_ID_HERE";

// ─── Theme — Canopy skin (matches design mockups) ─────────────────────────────
const DARK  = { bg:"#0A0F0C", card:"#0F1611", navy:"#141D17", border:"rgba(255,255,255,.07)", accent:"#7BE3A4", green:"#CFF5DE", text:"#E8EFE9", muted:"#8AA294" };
const LIGHT = { bg:"#F0F4F8", card:"#FFFFFF",  navy:"#E8EDF5", border:"#CBD8E4",              accent:"#3DBF7A", green:"#1DB954", text:"#1A2B3C", muted:"#5A6F80" };
const T = { ...DARK };

const SPOTIFY_GENRES = ["afrobeat","blues","chill","country","dance","drum-and-bass","dubstep","edm","electronic","folk","funk","gospel","hip-hop","house","indie","jazz","latin","metal","piano","pop","r-n-b","reggae","reggaeton","rock","soul","techno","trap","workout"];
const GROUP_PALETTE  = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];
// Stable colour for a group — derived from its id so it never shifts on reorder
const grpColor = id => GROUP_PALETTE[Math.abs((id||'').split('').reduce((a,c,i)=>a+c.charCodeAt(0)*(i+1),0))%GROUP_PALETTE.length];

// ─── Gym Fonts ────────────────────────────────────────────────────────────────
const GYM_FONTS = [
  { label:"Default (System)",   value:"system" },
  { label:"Montserrat",         value:"Montserrat" },
  { label:"Bebas Neue",         value:"Bebas Neue" },
  { label:"Oswald",             value:"Oswald" },
  { label:"Anton",              value:"Anton" },
  { label:"Rajdhani",           value:"Rajdhani" },
  { label:"Barlow Condensed",   value:"Barlow Condensed" },
  { label:"Exo 2",              value:"Exo 2" },
  { label:"Black Ops One",      value:"Black Ops One" },
  { label:"Russo One",          value:"Russo One" },
  { label:"Graduate",           value:"Graduate" },
];

// ─── Dominant colour extractor (canvas-based) ─────────────────────────────────
function extractDominantColor(imgSrc, callback) {
  const img = new Image();
  img.onload = () => {
    const size = 100;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const freq = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      if (r > 230 && g > 230 && b > 230) continue; // near-white
      if (r < 25  && g < 25  && b < 25)  continue; // near-black
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max === 0 || (max - min) / max < 0.2) continue; // grey
      const k = `${Math.round(r/20)*20},${Math.round(g/20)*20},${Math.round(b/20)*20}`;
      freq[k] = (freq[k] || 0) + 1;
    }
    const top = Object.entries(freq).sort((a,b) => b[1] - a[1])[0];
    if (!top) { callback(null); return; }
    const [r, g, b] = top[0].split(",").map(Number);
    callback("#" + [r, g, b].map(v => v.toString(16).padStart(2,"0")).join(""));
  };
  img.onerror = () => callback(null);
  img.src = imgSrc;
}

// ─── Responsive hook ──────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(typeof window!=="undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ─── Spotify PKCE Auth ────────────────────────────────────────────────────────
const SP_SCOPES = ["streaming","user-read-email","user-read-private","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","playlist-read-private","playlist-read-collaborative","playlist-modify-public","playlist-modify-private"].join(" ");

function randStr(n) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => chars[b % chars.length]).join("");
}
async function b64url(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function redirectToSpotify() {
  const v = randStr(128);
  localStorage.setItem("pkce_v", v);
  const challenge = await b64url(v);
  const p = new URLSearchParams({ client_id:SPOTIFY_CLIENT_ID, response_type:"code", redirect_uri:REDIRECT_URI, scope:SP_SCOPES, code_challenge_method:"S256", code_challenge:challenge });
  window.location.href = `https://accounts.spotify.com/authorize?${p}`;
}
// Opens Spotify auth in a small popup — used for in-app permission upgrades so the page stays open
async function openSpotifyAuthPopup() {
  const v = randStr(128);
  localStorage.setItem("pkce_v", v);
  const challenge = await b64url(v);
  const p = new URLSearchParams({ client_id:SPOTIFY_CLIENT_ID, response_type:"code", redirect_uri:REDIRECT_URI, scope:SP_SCOPES, code_challenge_method:"S256", code_challenge:challenge });
  const url = `https://accounts.spotify.com/authorize?${p}`;
  const popup = window.open(url, "spotify_auth_popup", "width=500,height=680,left=200,top=80,resizable=yes,scrollbars=yes");
  if (!popup) { window.location.href = url; return null; } // fallback if popup blocked
  return popup;
}
async function exchangeCode(code) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ client_id:SPOTIFY_CLIENT_ID, grant_type:"authorization_code", code, redirect_uri:REDIRECT_URI, code_verifier:localStorage.getItem("pkce_v")||"" }) });
  return r.json();
}
async function doRefresh() {
  const rt = localStorage.getItem("sp_rt");
  if (!rt) return null;
  const r = await fetch("https://accounts.spotify.com/api/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ client_id:SPOTIFY_CLIENT_ID, grant_type:"refresh_token", refresh_token:rt }) });
  const d = await r.json();
  if (d.access_token) { saveToken(d); return d.access_token; }
  return null;
}
function saveToken(d) {
  localStorage.setItem("sp_at", d.access_token);
  localStorage.setItem("sp_ex", String(Date.now() + (d.expires_in||3600)*1000));
  if (d.refresh_token) localStorage.setItem("sp_rt", d.refresh_token);
  if (d.scope) localStorage.setItem("sp_scope", d.scope);
}
async function getToken() {
  const ex = parseInt(localStorage.getItem("sp_ex")||"0");
  if (Date.now() < ex - 60000) return localStorage.getItem("sp_at");
  return doRefresh();
}
function clearTokens() { ["sp_at","sp_ex","sp_rt","pkce_v","sp_scope"].forEach(k=>localStorage.removeItem(k)); }

// ─── Attendee Mode (shareable read-only URL) ─────────────────────────────────
function getAttendeePayload() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") !== "attendee") return null;
    return JSON.parse(atob(p.get("data") || ""));
  } catch(_) { return null; }
}
const ATTENDEE_PAYLOAD = getAttendeePayload();

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
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&additional_types=track&market=from_token`;
  while (url) {
    const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
    if (!r.ok) {
      const errBody = await r.json().catch(()=>({}));
      const errMsg  = errBody?.error?.message || "";
      if (r.status === 403) {
        if (errMsg.toLowerCase().includes("insufficient client scope") || errMsg.toLowerCase().includes("scope")) {
          localStorage.removeItem("sp_scope");
          return null;
        }
        // Spotify API restricts track access to playlists owned by the authenticated user
        // in development quota mode. This affects playlists owned by other users.
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

// ─── useSpotify hook ──────────────────────────────────────────────────────────
function useSpotify() {
  const [token,      setToken]      = useState(null);
  const [player,     setPlayer]     = useState(null);
  const [deviceId,   setDeviceId]   = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [spPaused,   setSpPaused]   = useState(true);
  const [sdkReady,   setSdkReady]   = useState(false);
  const [authError,  setAuthError]  = useState(null);
  const [spError,    setSpError]    = useState(null);
  const [profile,    setProfile]    = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"), err = params.get("error");
    if (err) { setAuthError("Spotify authorization was denied."); window.history.replaceState({},"",window.location.pathname); return; }
    if (code) {
      window.history.replaceState({},"",window.location.pathname);
      // Popup mode: exchange code, post result to opener, close popup
      if (window.opener && !window.opener.closed) {
        exchangeCode(code).then(d => {
          if (d.access_token) {
            saveToken(d);
            try { window.opener.postMessage({ type:"spotify_auth_complete", token:d.access_token }, window.location.origin); } catch(_) {}
          }
          window.close();
        }).catch(() => window.close());
        return;
      }
      // Normal (non-popup) flow
      exchangeCode(code).then(d => { if (d.access_token) { saveToken(d); setToken(d.access_token); } else setAuthError(d.error_description||"Authentication failed."); }).catch(e=>setAuthError(e.message));
      return;
    }
    getToken().then(t => { if (t) setToken(t); });
  }, []);

  useEffect(() => {
    if (!token) return;
    getSpotifyProfile().then(p => { if (p?.id) { setProfile(p); localStorage.setItem("sp_uid", p.id); } }).catch(()=>{});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (window.Spotify) { setSdkReady(true); return; }
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    if (!document.querySelector("script[src*='spotify-player']")) {
      const s = Object.assign(document.createElement("script"), { src:"https://sdk.scdn.co/spotify-player.js", async:true });
      document.body.appendChild(s);
    }
  }, [token]);

  useEffect(() => {
    if (!sdkReady||!token) return;
    let live = true;
    const p = new window.Spotify.Player({ name:"Jungle", getOAuthToken:async cb=>{ const t=await getToken(); if(t) cb(t); }, volume:0.8 });
    p.addListener("ready", ({device_id})=>{ if(live) { setDeviceId(device_id); setSpError(null); } });
    p.addListener("not_ready", ()=>{ if(live) { setDeviceId(null); setSpError("Spotify player disconnected. Try refreshing the page."); } });
    p.addListener("player_state_changed", state=>{ if(!state||!live) return; setNowPlaying(state.track_window?.current_track??null); setSpPaused(state.paused); });
    p.addListener("authentication_error", ({message})=>{ if(live) setSpError("Spotify authentication failed: " + (message||"session expired. Please re-login.")); });
    p.addListener("account_error", ({message})=>{ if(live) setSpError("Spotify account error: " + (message||"Premium required for playback.")); });
    p.connect();
    setPlayer(p);
    return ()=>{ live=false; p.disconnect(); };
  }, [sdkReady, token]);

  const logout = () => { clearTokens(); player?.disconnect(); setToken(null); setPlayer(null); setDeviceId(null); setNowPlaying(null); setSdkReady(false); setProfile(null); setSpError(null); };
  return { token, player, deviceId, nowPlaying, spPaused, authError, spError, profile, logout };
}

// ─── General helpers ──────────────────────────────────────────────────────────
let _uid = 1;
const uid = () => `s${_uid++}`;
const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const fmtSec = s => `${s}s`;

// ── Feature 4: interval state calculator ─────────────────────────────────────
// Given the exercises for a stage and the elapsed seconds, returns the current
// interval sub-timer state (Tabata / EMOM), or null if no timed exercises are active.
function calcIntervalState(exercises, elapsed) {
  if (!exercises?.length || elapsed == null || elapsed < 0) return null;
  let offset = 0;
  for (const ex of exercises) {
    if (!ex.timing || ex.timing === "none") continue;
    const workSec  = Math.max(1, parseInt(ex.workSec)  || 20);
    const restSec  = Math.max(0, parseInt(ex.restSec)  || (ex.timing === "emom" ? 0 : 10));
    const rounds   = Math.max(1, parseInt(ex.rounds)   || (ex.timing === "emom" ? 10 : 8));
    const cycleDur = workSec + restSec;           // always >= 1
    const totalDur = rounds * cycleDur;
    if (elapsed < offset + totalDur) {
      const elapsedInEx    = elapsed - offset;
      const roundIdx       = Math.floor(elapsedInEx / cycleDur);
      const elapsedInCycle = elapsedInEx % cycleDur;
      const isWork         = elapsedInCycle < workSec;
      const phaseRemaining = Math.max(0, isWork ? workSec - elapsedInCycle : cycleDur - elapsedInCycle);
      return { exName: ex.n, phase: isWork ? "WORK" : "REST", phaseRemaining, round: roundIdx + 1, totalRounds: rounds, timing: ex.timing, workSec, restSec };
    }
    offset += totalDur;
  }
  return null;
}

function fireSiren() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0,0.55,1.1].forEach(off => {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(880,ctx.currentTime+off);
      o.frequency.linearRampToValueAtTime(440,ctx.currentTime+off+0.42);
      g.gain.setValueAtTime(0.28,ctx.currentTime+off);
      g.gain.linearRampToValueAtTime(0,ctx.currentTime+off+0.5);
      o.start(ctx.currentTime+off); o.stop(ctx.currentTime+off+0.52);
    });
  } catch(_) {}
}

// ─── Data ─────────────────────────────────────────────────────────────────────
// bpmMin/bpmMax are science-backed target ranges per workout phase (see PRD §4.2)
const SCFG = {
  warmup:   { label:"Warm-Up",        color:"#F59E0B", bpmMin:80,  bpmMax:110 },
  circuit:  { label:"Circuit",        color:"#EF4444", bpmMin:110, bpmMax:130 },
  strength: { label:"Strength",       color:"#8B5CF6", bpmMin:110, bpmMax:130 },
  cardio:   { label:"Cardio Blast",   color:"#F97316", bpmMin:120, bpmMax:150 },
  recovery: { label:"Active Recovery",color:"#06B6D4", bpmMin:80,  bpmMax:100 },
  stretch:  { label:"Stretch",        color:"#10B981", bpmMin:60,  bpmMax:90  },
  cooldown: { label:"Cool-Down",      color:"#3B82F6", bpmMin:80,  bpmMax:100 },
};

// F9: BPM colour-coding: blue=slow, green=moderate, orange=fast, red=intense
function bpmColor(bpm) {
  if (!bpm) return T.muted;
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

function mkStages() {
  return [
    { id:uid(), type:"warmup",   name:"Warm-Up",         dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""},{n:"Arm Swings",s:"2",r:"30 sec",rest:""}], tracks:[] },
    { id:uid(), type:"circuit",  name:"Circuit Blast",   dur:600,  exercises:[{n:"Burpee Complex",s:"3",r:"10",rest:"30s"},{n:"Box Jump",s:"3",r:"8",rest:"30s"}], tracks:[] },
    { id:uid(), type:"strength", name:"Strength Block",  dur:900,  exercises:[{n:"Primal Squat",s:"4",r:"8",rest:"90s"},{n:"Atlas Press",s:"4",r:"10",rest:"90s"}], tracks:[] },
    { id:uid(), type:"recovery", name:"Active Recovery", dur:300,  exercises:[{n:"Easy Walk",s:"",r:"5 min",rest:""}], tracks:[] },
    { id:uid(), type:"cooldown", name:"Cool-Down",       dur:300,  exercises:[{n:"Pigeon Flow",s:"",r:"90 sec",rest:""},{n:"Hip 90/90 Flow",s:"",r:"60 sec each",rest:""}], tracks:[] },
  ];
}

const TEMPLATES = [
  { id:"t1", name:"Apex HIIT",       tag:"30 min", emoji:"⚡", desc:"Zero-rest intervals, max output every round",      color:"#EF4444",
    stages:[
      { type:"warmup",   name:"Ignition",      dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""},{n:"World's Greatest Stretch",s:"1",r:"60s",rest:""}],  tracks:[] },
      { type:"circuit",  name:"Surge Block 1", dur:480,  exercises:[{n:"Burpee Complex",s:"4",r:"10",rest:"20s"},{n:"Box Jump",s:"4",r:"8",rest:"20s"}],             tracks:[] },
      { type:"cardio",   name:"Velocity Peak", dur:360,  exercises:[{n:"Tuck Jump",s:"3",r:"15",rest:"30s"},{n:"High Knee Drive",s:"3",r:"40",rest:"30s"}],          tracks:[] },
      { type:"circuit",  name:"Surge Block 2", dur:480,  exercises:[{n:"Renegade Row",s:"3",r:"10",rest:"30s"},{n:"Skater Bound",s:"3",r:"12",rest:"30s"}],          tracks:[] },
      { type:"cooldown", name:"Reset",         dur:180,  exercises:[{n:"Pigeon Flow",s:"",r:"60s each",rest:""},{n:"Hamstring Floss",s:"",r:"45s",rest:""}],          tracks:[] },
    ]
  },
  { id:"t2", name:"Iron Protocol",   tag:"60 min", emoji:"🏋️", desc:"Compound lifts, progressive overload structure",   color:"#8B5CF6",
    stages:[
      { type:"warmup",   name:"Mobility Prime", dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"3 min",rest:""},{n:"Thoracic CAR",s:"2",r:"10",rest:""}],          tracks:[] },
      { type:"strength", name:"Primary Lift",   dur:1200, exercises:[{n:"Primal Squat",s:"5",r:"5",rest:"3 min"},{n:"Atlas Press",s:"4",r:"6",rest:"2 min"}],         tracks:[] },
      { type:"strength", name:"Accessory Work", dur:900,  exercises:[{n:"Nordic Curl",s:"3",r:"6",rest:"90s"},{n:"Serpent Row",s:"4",r:"8",rest:"90s"}],              tracks:[] },
      { type:"recovery", name:"Active Rest",    dur:300,  exercises:[{n:"Dead Bug",s:"3",r:"10",rest:"60s"},{n:"Shoulder CARs",s:"2",r:"8",rest:""}],                 tracks:[] },
      { type:"cooldown", name:"Restore",        dur:600,  exercises:[{n:"Pigeon Flow",s:"",r:"90s each",rest:""},{n:"Hollow Rock",s:"2",r:"30s",rest:"30s"}],          tracks:[] },
    ]
  },
  { id:"t3", name:"Circuit Surge",   tag:"45 min", emoji:"🔥", desc:"Mixed modality, maximum metabolic output",         color:"#F97316",
    stages:[
      { type:"warmup",   name:"Activation",    dur:300,  exercises:[{n:"Bear Crawl Sprint",s:"3",r:"20m",rest:"30s"}],                                               tracks:[] },
      { type:"circuit",  name:"Station A",     dur:600,  exercises:[{n:"Burpee Complex",s:"3",r:"10",rest:"30s"},{n:"Box Jump",s:"3",r:"8",rest:"30s"}],              tracks:[] },
      { type:"circuit",  name:"Station B",     dur:600,  exercises:[{n:"Battle Rope Wave",s:"3",r:"30s",rest:"30s"},{n:"Spider Curl",s:"3",r:"12",rest:"30s"}],       tracks:[] },
      { type:"circuit",  name:"Station C",     dur:600,  exercises:[{n:"Copenhagen Adductor",s:"3",r:"10",rest:"30s"},{n:"Pallof Press",s:"3",r:"12",rest:"30s"}],    tracks:[] },
      { type:"cooldown", name:"Cool-Down",     dur:300,  exercises:[{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""}],                                        tracks:[] },
    ]
  },
  { id:"t4", name:"Flow State",      tag:"45 min", emoji:"🧘", desc:"Mind-body connection, breath-led movement",        color:"#10B981",
    stages:[
      { type:"warmup",   name:"Centering",     dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"5 min",rest:""}],                                                    tracks:[] },
      { type:"stretch",  name:"Active Flow",   dur:900,  exercises:[{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""},{n:"Pigeon Flow",s:"",r:"2 min each",rest:""}], tracks:[] },
      { type:"stretch",  name:"Deep Work",     dur:900,  exercises:[{n:"Thoracic CAR",s:"2",r:"10",rest:""},{n:"Shoulder CARs",s:"2",r:"8",rest:""}],                  tracks:[] },
      { type:"cooldown", name:"Savasana",      dur:300,  exercises:[{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],                                                  tracks:[] },
    ]
  },
  { id:"t5", name:"Velocity",        tag:"45 min", emoji:"🚴", desc:"Cadence peaks, structured recovery valleys",       color:"#3B82F6",
    stages:[
      { type:"warmup",   name:"Base Build",    dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""}],                                                          tracks:[] },
      { type:"cardio",   name:"Threshold Push",dur:600,  exercises:[{n:"Skater Bound",s:"4",r:"30s",rest:"20s"}],                                                     tracks:[] },
      { type:"recovery", name:"Valley",        dur:300,  exercises:[{n:"Easy Walk",s:"",r:"5 min",rest:""}],                                                          tracks:[] },
      { type:"cardio",   name:"Peak Effort",   dur:600,  exercises:[{n:"Box Depth Jump",s:"4",r:"8",rest:"30s"},{n:"Tuck Jump",s:"3",r:"12",rest:"20s"}],              tracks:[] },
      { type:"cooldown", name:"Restore",       dur:300,  exercises:[{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],                                                  tracks:[] },
    ]
  },
  { id:"t6", name:"Reset & Restore", tag:"30 min", emoji:"🌿", desc:"Active recovery, mobility restoration",            color:"#06B6D4",
    stages:[
      { type:"stretch",  name:"Unwind",        dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"5 min",rest:""},{n:"Thoracic CAR",s:"2",r:"8",rest:""}],              tracks:[] },
      { type:"stretch",  name:"Deep Release",  dur:600,  exercises:[{n:"Pigeon Flow",s:"",r:"2 min each",rest:""},{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""}], tracks:[] },
      { type:"cooldown", name:"Settle",        dur:600,  exercises:[{n:"Shoulder CARs",s:"2",r:"10",rest:""},{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],          tracks:[] },
    ]
  },
];

// ─── Workout Library ──────────────────────────────────────────────────────────
// Each class type → sub-types → { warmup[], main[], cooldown[] }
// Exercise fields match builder format: { id, n, s, r, rest, muscles, notes, timing }
const WORKOUT_LIBRARY = {
  crossfit: {
    label:"CrossFit", icon:"⚡", color:"#EF4444",
    description:"Constantly varied functional movements performed at high intensity",
    subTypes:{
      wod:{
        label:"WOD (Workout of the Day)", description:"Classic CrossFit daily workout combining gymnastics, weightlifting and metabolic conditioning",
        warmup:[
          {id:"cf-wod-wu-1",n:"Jump Rope Drill",s:"3",r:"30s",rest:"20s",muscles:"Calves, Shoulders, Coordination",notes:"Single unders → attempts at double unders"},
          {id:"cf-wod-wu-2",n:"PVC Overhead Squat",s:"2",r:"10",rest:"30s",muscles:"Shoulders, Thoracic, Ankles",notes:"Focus on depth and vertical torso"},
          {id:"cf-wod-wu-3",n:"Hip 90/90 Flow",s:"",r:"90s each side",rest:"",muscles:"Hip Flexors, Glutes, Thoracic",notes:"Slow controlled transitions"},
          {id:"cf-wod-wu-4",n:"Banded Glute Activation",s:"2",r:"15",rest:"20s",muscles:"Glutes, Abductors",notes:"Monster walk + clamshell"},
          {id:"cf-wod-wu-5",n:"Hollow Body Hold",s:"2",r:"20s",rest:"20s",muscles:"Core, Lats",notes:"Press lower back into floor"},
        ],
        main:[
          {id:"cf-wod-m-1",n:"Thruster",s:"4",r:"10",rest:"60s",muscles:"Quads, Shoulders, Triceps",notes:"Full squat, press overhead in one motion",timing:"none"},
          {id:"cf-wod-m-2",n:"Pull-Up (Kipping)",s:"4",r:"8",rest:"60s",muscles:"Lats, Biceps, Core",notes:"Scale to banded or ring rows"},
          {id:"cf-wod-m-3",n:"Box Jump",s:"4",r:"8",rest:"30s",muscles:"Quads, Glutes, Power",notes:"Land softly, reset between reps"},
          {id:"cf-wod-m-4",n:"Double Unders",s:"4",r:"30",rest:"30s",muscles:"Cardio, Coordination, Calves",notes:"Scale to 90 single unders"},
          {id:"cf-wod-m-5",n:"Wall Ball Shot",s:"4",r:"15",rest:"30s",muscles:"Quads, Shoulders, Cardio",notes:"10ft target, full depth squat"},
          {id:"cf-wod-m-6",n:"Toes to Bar",s:"3",r:"10",rest:"30s",muscles:"Core, Hip Flexors, Lats",notes:"Control the swing, avoid kipping wildly"},
        ],
        cooldown:[
          {id:"cf-wod-cd-1",n:"Doorway Pec Stretch",s:"",r:"60s each",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Two heights: 90° and 135° elbow"},
          {id:"cf-wod-cd-2",n:"Pigeon Stretch",s:"",r:"90s each side",rest:"",muscles:"Hip External Rotators, Glutes",notes:"Support on forearms if tight"},
          {id:"cf-wod-cd-3",n:"Couch Stretch",s:"",r:"90s each side",rest:"",muscles:"Hip Flexors, Quads",notes:"Against a wall or box"},
          {id:"cf-wod-cd-4",n:"Thoracic Foam Roll",s:"",r:"90s",rest:"",muscles:"Thoracic Spine, Lats",notes:"10 passes, pause on tight spots"},
        ],
      },
      amrap:{
        label:"AMRAP", description:"As Many Rounds As Possible — maximum work within a fixed time window",
        warmup:[
          {id:"cf-amrap-wu-1",n:"Light Row / Bike",s:"",r:"5 min",rest:"",muscles:"Full Body, Cardio",notes:"Build intensity over 5 minutes"},
          {id:"cf-amrap-wu-2",n:"World's Greatest Stretch",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Thoracic, Hamstrings",notes:"Elbow to ground, rotate"},
          {id:"cf-amrap-wu-3",n:"Air Squat",s:"2",r:"10",rest:"20s",muscles:"Quads, Glutes, Mobility",notes:"Focus on heel contact and depth"},
          {id:"cf-amrap-wu-4",n:"Inchworm",s:"2",r:"6",rest:"20s",muscles:"Hamstrings, Shoulders, Core",notes:"Walk out to plank, walk back"},
        ],
        main:[
          {id:"cf-amrap-m-1",n:"Burpee",s:"",r:"AMRAP 20 min",rest:"",muscles:"Full Body, Cardio",notes:"Consistent pace beats sprinting and stopping",timing:"none"},
          {id:"cf-amrap-m-2",n:"Kettlebell Swing",s:"",r:"15 reps/round",rest:"",muscles:"Posterior Chain, Cardio",notes:"Hinge, not squat. Drive hips forward"},
          {id:"cf-amrap-m-3",n:"Push-Up",s:"",r:"10 reps/round",rest:"",muscles:"Chest, Triceps, Core",notes:"Scale: knee push-ups"},
          {id:"cf-amrap-m-4",n:"Goblet Squat",s:"",r:"10 reps/round",rest:"",muscles:"Quads, Glutes",notes:"Elbows inside knees at bottom"},
          {id:"cf-amrap-m-5",n:"Assault Bike Calories",s:"",r:"10 cal/round",rest:"",muscles:"Full Body, Cardio",notes:"Maintain consistent output"},
        ],
        cooldown:[
          {id:"cf-amrap-cd-1",n:"Child's Pose",s:"",r:"2 min",rest:"",muscles:"Lats, Thoracic, Hips",notes:"Arms extended or by sides"},
          {id:"cf-amrap-cd-2",n:"Downward Dog to Upward Dog",s:"2",r:"5 slow",rest:"",muscles:"Hamstrings, Hip Flexors, Shoulders",notes:"Breathe into each transition"},
          {id:"cf-amrap-cd-3",n:"Supine Twist",s:"",r:"60s each side",rest:"",muscles:"Thoracic Spine, Glutes",notes:"Guide the knee to the floor"},
        ],
      },
      emom:{
        label:"EMOM", description:"Every Minute On the Minute — structured interval work with built-in recovery",
        warmup:[
          {id:"cf-emom-wu-1",n:"Dynamic Hip Circle",s:"2",r:"10 each direction",rest:"20s",muscles:"Hips, Glutes",notes:"Large slow circles"},
          {id:"cf-emom-wu-2",n:"Band Pull-Apart",s:"3",r:"15",rest:"20s",muscles:"Rear Delts, Rhomboids",notes:"Stretch band at chest height"},
          {id:"cf-emom-wu-3",n:"Squat to Stand",s:"2",r:"8",rest:"20s",muscles:"Hamstrings, Quads, Ankles",notes:"Hold ankles, straighten legs"},
          {id:"cf-emom-wu-4",n:"Lat Activation Hang",s:"2",r:"20s",rest:"20s",muscles:"Lats, Grip, Shoulder",notes:"Active hang on bar or rings"},
        ],
        main:[
          {id:"cf-emom-m-1",n:"Power Clean",s:"",r:"3 reps/min (10 min)",rest:"",muscles:"Posterior Chain, Power, Full Body",notes:"70-80% 1RM, reset between reps",timing:"emom"},
          {id:"cf-emom-m-2",n:"Ring Dip",s:"",r:"5 reps/min (8 min)",rest:"",muscles:"Triceps, Chest, Shoulders",notes:"Scale to box dips",timing:"emom"},
          {id:"cf-emom-m-3",n:"Handstand Push-Up",s:"",r:"Max reps/min (8 min)",rest:"",muscles:"Shoulders, Triceps, Core",notes:"Scale to pike push-up",timing:"emom"},
          {id:"cf-emom-m-4",n:"Deadlift",s:"",r:"4 reps/min (10 min)",rest:"",muscles:"Posterior Chain, Core",notes:"Moderate weight, perfect form every rep",timing:"emom"},
        ],
        cooldown:[
          {id:"cf-emom-cd-1",n:"Lat Stretch (Bar Hang)",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic, Shoulders",notes:"Allow body to decompress"},
          {id:"cf-emom-cd-2",n:"Hamstring Floss",s:"",r:"60s each",rest:"",muscles:"Hamstrings, Calves",notes:"Straight leg, dorsiflexed foot"},
          {id:"cf-emom-cd-3",n:"Seated Thoracic Rotation",s:"",r:"45s each side",rest:"",muscles:"Thoracic Spine, Obliques",notes:"Sit cross-legged, rotate from mid-back"},
        ],
      },
    },
  },

  spin:{
    label:"Spin / Indoor Cycling", icon:"🚴", color:"#3B82F6",
    description:"High-energy indoor cycling combining endurance, intervals and strength on the bike",
    subTypes:{
      endurance:{
        label:"Endurance Ride", description:"Sustained aerobic effort building base fitness and fat-burning capacity",
        warmup:[
          {id:"sp-end-wu-1",n:"Easy Cadence Build",s:"",r:"5 min",rest:"",muscles:"Quads, Hamstrings, Calves",notes:"Start at 70 RPM, build to 90 RPM. Resistance: 1-2"},
          {id:"sp-end-wu-2",n:"Standing Climb",s:"",r:"2 min",rest:"",muscles:"Glutes, Quads",notes:"Resistance 4-5, 60-70 RPM. Activate glutes"},
          {id:"sp-end-wu-3",n:"Seated Run",s:"",r:"2 min",rest:"",muscles:"Full Legs, Cardio",notes:"Resistance 2, 95-100 RPM. Breathing check"},
        ],
        main:[
          {id:"sp-end-m-1",n:"Steady State Base",s:"",r:"15 min",rest:"",muscles:"Quads, Glutes, Cardiovascular",notes:"80-85% max heart rate. Resistance 5-6, 85-90 RPM"},
          {id:"sp-end-m-2",n:"Progressive Climb",s:"3",r:"4 min",rest:"2 min easy",muscles:"Glutes, Quads, Back",notes:"Add resistance each minute. Sit then stand in final minute"},
          {id:"sp-end-m-3",n:"Tempo Intervals",s:"4",r:"3 min on / 2 min easy",rest:"",muscles:"Full Legs, Cardio",notes:"Push to 90% on working interval"},
          {id:"sp-end-m-4",n:"Seated Sprint",s:"6",r:"20s",rest:"40s easy",muscles:"Fast-Twitch Legs, Cardio",notes:"Max RPM, resistance 3"},
        ],
        cooldown:[
          {id:"sp-end-cd-1",n:"Cool-Down Spin",s:"",r:"5 min",rest:"",muscles:"Legs, Cardiovascular",notes:"Drop to 70 RPM, resistance 1. Let heart rate fall"},
          {id:"sp-end-cd-2",n:"Standing Quad Stretch",s:"",r:"45s each",rest:"",muscles:"Quads, Hip Flexors",notes:"Hold saddle, pull foot to glute"},
          {id:"sp-end-cd-3",n:"Hamstring Stretch (off bike)",s:"",r:"60s each",rest:"",muscles:"Hamstrings, Calves",notes:"Foot on saddle, hinge forward"},
          {id:"sp-end-cd-4",n:"Seated Forward Fold",s:"",r:"90s",rest:"",muscles:"Hamstrings, Lower Back",notes:"Floor, legs straight, reach forward"},
        ],
      },
      hiit_ride:{
        label:"HIIT Ride", description:"Max-effort sprint intervals with full recovery — anaerobic capacity and explosive power",
        warmup:[
          {id:"sp-hiit-wu-1",n:"Easy Pedal",s:"",r:"3 min",rest:"",muscles:"Legs, Cardio",notes:"Resistance 1, 85 RPM. Just moving"},
          {id:"sp-hiit-wu-2",n:"Pyramid Acceleration",s:"3",r:"30s",rest:"30s",muscles:"Legs, Cardio",notes:"Each sprint slightly faster. Build to 90% effort"},
          {id:"sp-hiit-wu-3",n:"Standing Jog",s:"",r:"2 min",rest:"",muscles:"Quads, Core, Balance",notes:"Light resistance. Hover above saddle"},
        ],
        main:[
          {id:"sp-hiit-m-1",n:"Tabata Sprint",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Full Legs, Cardio, Power",notes:"Max RPM resistance 2. True maximum effort",timing:"tabata"},
          {id:"sp-hiit-m-2",n:"Heavy Climb Burst",s:"5",r:"30s",rest:"90s easy",muscles:"Glutes, Quads",notes:"Resistance 8-9. Standing, drive through heels"},
          {id:"sp-hiit-m-3",n:"Flying 20s",s:"10",r:"20s",rest:"60s easy",muscles:"Power, Cardio",notes:"Build 10s, max 10s. Explosive turnover"},
          {id:"sp-hiit-m-4",n:"Pyramid Intervals",s:"",r:"1/2/3/2/1 min",rest:"Equal rest",muscles:"Cardio, Endurance, Power",notes:"Intensity increases on way up, decreases on way down"},
        ],
        cooldown:[
          {id:"sp-hiit-cd-1",n:"Easy Pedal",s:"",r:"5 min",rest:"",muscles:"Recovery, Cardiovascular",notes:"Resistance 1. Spin legs out"},
          {id:"sp-hiit-cd-2",n:"Hip Flexor Stretch",s:"",r:"60s each",rest:"",muscles:"Hip Flexors",notes:"Lunge position, sink hips forward"},
          {id:"sp-hiit-cd-3",n:"Calf Stretch",s:"",r:"45s each",rest:"",muscles:"Gastrocnemius, Soleus",notes:"Wall or step. Straight and bent knee versions"},
        ],
      },
      hills:{
        label:"Hills & Climbs", description:"Resistance-heavy climbing simulations for lower body strength and muscular endurance",
        warmup:[
          {id:"sp-hills-wu-1",n:"Base Spin",s:"",r:"4 min",rest:"",muscles:"Legs, Warm-Up",notes:"Light resistance, moderate cadence"},
          {id:"sp-hills-wu-2",n:"Standing Climb Preview",s:"3",r:"30s",rest:"30s",muscles:"Glutes, Quads",notes:"Taste of what's coming. Resistance 5"},
          {id:"sp-hills-wu-3",n:"Activation Squats (off bike)",s:"2",r:"10",rest:"20s",muscles:"Glutes, Quads",notes:"Full depth bodyweight squat"},
        ],
        main:[
          {id:"sp-hills-m-1",n:"Seated Climb",s:"4",r:"4 min",rest:"2 min easy",muscles:"Quads, Glutes, Hamstrings",notes:"Resistance 7-8. 65-70 RPM. Power through heels"},
          {id:"sp-hills-m-2",n:"Standing Climb",s:"4",r:"3 min",rest:"2 min",muscles:"Glutes, Quads, Core",notes:"Resistance 8-9. 55-60 RPM. Stable upper body"},
          {id:"sp-hills-m-3",n:"Seated to Standing Transitions",s:"3",r:"8 times",rest:"",muscles:"Full Legs, Core",notes:"Every 30s switch seated/standing same resistance"},
          {id:"sp-hills-m-4",n:"Summit Sprint",s:"3",r:"45s",rest:"2 min",muscles:"Power, Quads, Calves",notes:"Resistance 6, burst to max cadence"},
        ],
        cooldown:[
          {id:"sp-hills-cd-1",n:"Easy Pedal Flush",s:"",r:"5 min",rest:"",muscles:"Recovery",notes:"Very light resistance, 80-90 RPM"},
          {id:"sp-hills-cd-2",n:"IT Band Stretch",s:"",r:"60s each",rest:"",muscles:"IT Band, Glutes",notes:"Cross leg over, lean away from bike"},
          {id:"sp-hills-cd-3",n:"Glute Stretch (Figure 4)",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Seated on floor, figure-four position"},
        ],
      },
    },
  },

  circuit:{
    label:"Circuit Training", icon:"🔥", color:"#F97316",
    description:"Structured rotation through exercise stations targeting different muscle groups",
    subTypes:{
      cardio_circuit:{
        label:"Cardio Circuit", description:"High-rep, low-rest stations keeping heart rate elevated throughout",
        warmup:[
          {id:"cir-card-wu-1",n:"March on Spot",s:"",r:"2 min",rest:"",muscles:"Legs, Core, Heart Rate",notes:"Lift knees to hip height, pump arms"},
          {id:"cir-card-wu-2",n:"Lateral Shuffle",s:"3",r:"30s",rest:"20s",muscles:"Glutes, Adductors, Cardio",notes:"Low athletic stance, quick feet"},
          {id:"cir-card-wu-3",n:"Arm Circle Progression",s:"",r:"30s each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Small → large circles, forward and backward"},
          {id:"cir-card-wu-4",n:"High Knee Drive",s:"2",r:"20",rest:"20s",muscles:"Hip Flexors, Cardio, Coordination",notes:"Drive arms in opposition"},
        ],
        main:[
          {id:"cir-card-m-1",n:"Star Jump",s:"",r:"45s on / 15s rest",rest:"",muscles:"Full Body, Cardio",notes:"Land softly, arms overhead at top",timing:"tabata"},
          {id:"cir-card-m-2",n:"Mountain Climber",s:"",r:"45s on / 15s rest",rest:"",muscles:"Core, Shoulders, Cardio",notes:"Drive knees to opposite elbows for oblique focus",timing:"tabata"},
          {id:"cir-card-m-3",n:"Skater Bound",s:"",r:"45s on / 15s rest",rest:"",muscles:"Glutes, Adductors, Balance",notes:"Leap side to side, touch floor",timing:"tabata"},
          {id:"cir-card-m-4",n:"Burpee",s:"",r:"45s on / 15s rest",rest:"",muscles:"Full Body, Power, Cardio",notes:"Step back to scale intensity",timing:"tabata"},
          {id:"cir-card-m-5",n:"Jump Rope",s:"",r:"45s on / 15s rest",rest:"",muscles:"Calves, Coordination, Cardio",notes:"Single unders focus on consistent rhythm",timing:"tabata"},
          {id:"cir-card-m-6",n:"Broad Jump to Backpedal",s:"3",r:"8",rest:"30s",muscles:"Power, Quads, Cardio",notes:"Max distance jump, controlled backpedal return"},
        ],
        cooldown:[
          {id:"cir-card-cd-1",n:"Low Lunge Hip Flexor",s:"",r:"60s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Sink hips forward, tall posture"},
          {id:"cir-card-cd-2",n:"Quad Stretch Standing",s:"",r:"45s each",rest:"",muscles:"Quads",notes:"Hold wall for balance if needed"},
          {id:"cir-card-cd-3",n:"World's Greatest Stretch",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Thoracic, Hamstrings",notes:"Slow and deliberate, breathe into restriction"},
        ],
      },
      strength_circuit:{
        label:"Strength Circuit", description:"Compound movement stations with moderate rest building full-body strength",
        warmup:[
          {id:"cir-str-wu-1",n:"Foam Roll Thoracic",s:"",r:"90s",rest:"",muscles:"Thoracic Spine, Lats",notes:"Pause on tight spots, 5–10 passes"},
          {id:"cir-str-wu-2",n:"Goblet Squat",s:"2",r:"8",rest:"30s",muscles:"Quads, Glutes, Mobility",notes:"Light KB, focus on depth and upright torso"},
          {id:"cir-str-wu-3",n:"Band Pull-Apart",s:"3",r:"15",rest:"20s",muscles:"Rear Delts, Rhomboids",notes:"Squeeze at full extension"},
          {id:"cir-str-wu-4",n:"Single Leg Hip Hinge",s:"2",r:"8 each",rest:"20s",muscles:"Hamstrings, Glutes, Balance",notes:"Bodyweight RDL on one leg"},
        ],
        main:[
          {id:"cir-str-m-1",n:"Barbell Back Squat",s:"4",r:"8",rest:"90s",muscles:"Quads, Glutes, Core",notes:"Controlled descent, 3 seconds down"},
          {id:"cir-str-m-2",n:"Dumbbell Bench Press",s:"4",r:"10",rest:"90s",muscles:"Chest, Shoulders, Triceps",notes:"Full range of motion, slight arch"},
          {id:"cir-str-m-3",n:"Bent-Over Row",s:"4",r:"10",rest:"90s",muscles:"Lats, Rhomboids, Biceps",notes:"Hinge 45°, row elbows to hip"},
          {id:"cir-str-m-4",n:"Romanian Deadlift",s:"4",r:"10",rest:"90s",muscles:"Hamstrings, Glutes, Lower Back",notes:"Hip hinge, bar close to legs"},
          {id:"cir-str-m-5",n:"Overhead Press",s:"3",r:"10",rest:"90s",muscles:"Shoulders, Triceps, Core",notes:"Rib cage down, glutes engaged"},
          {id:"cir-str-m-6",n:"Farmer's Carry",s:"4",r:"30m",rest:"60s",muscles:"Core, Grip, Traps, Legs",notes:"Shoulders back, walk tall"},
        ],
        cooldown:[
          {id:"cir-str-cd-1",n:"Pigeon Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Use props if needed"},
          {id:"cir-str-cd-2",n:"Pec/Shoulder Stretch",s:"",r:"60s each",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Doorway or corner stretch"},
          {id:"cir-str-cd-3",n:"Child's Pose with Lat Reach",s:"",r:"90s each side",rest:"",muscles:"Lats, Thoracic, Hips",notes:"Walk hands to one side to bias lat"},
        ],
      },
      fundamental:{
        label:"Fundamentals", description:"Movement pattern mastery — bodyweight fundamentals for beginners or skill refinement",
        warmup:[
          {id:"cir-fund-wu-1",n:"Cat-Cow",s:"2",r:"10",rest:"",muscles:"Spine, Core",notes:"Inhale on extension, exhale on flexion"},
          {id:"cir-fund-wu-2",n:"Dead Bug",s:"2",r:"8 each side",rest:"20s",muscles:"Core, Hip Flexors",notes:"Press lower back to floor throughout"},
          {id:"cir-fund-wu-3",n:"Glute Bridge",s:"2",r:"12",rest:"20s",muscles:"Glutes, Hamstrings",notes:"Drive through heels, squeeze at top"},
          {id:"cir-fund-wu-4",n:"Wall Slide",s:"2",r:"10",rest:"",muscles:"Shoulders, Thoracic",notes:"Maintain contact with wall throughout"},
        ],
        main:[
          {id:"cir-fund-m-1",n:"Bodyweight Squat",s:"3",r:"15",rest:"45s",muscles:"Quads, Glutes",notes:"Sit back, heels down, chest up"},
          {id:"cir-fund-m-2",n:"Push-Up (Progression)",s:"3",r:"10",rest:"45s",muscles:"Chest, Triceps, Core",notes:"Scale: incline → full → archer"},
          {id:"cir-fund-m-3",n:"Inverted Row",s:"3",r:"12",rest:"45s",muscles:"Lats, Rhomboids, Biceps",notes:"Straight body from ears to heels"},
          {id:"cir-fund-m-4",n:"Reverse Lunge",s:"3",r:"10 each",rest:"45s",muscles:"Quads, Glutes, Balance",notes:"Step back, 90° angles both knees"},
          {id:"cir-fund-m-5",n:"Plank Hold",s:"3",r:"30s",rest:"30s",muscles:"Core, Shoulders",notes:"Squeeze everything, breathe normally"},
          {id:"cir-fund-m-6",n:"Hip Hinge (Kettlebell Swing Prep)",s:"3",r:"10",rest:"30s",muscles:"Posterior Chain",notes:"Hinge at hip, soft knees, flat back"},
        ],
        cooldown:[
          {id:"cir-fund-cd-1",n:"Seated Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Flex foot, reach forward slowly"},
          {id:"cir-fund-cd-2",n:"Neck Rolls",s:"",r:"60s",rest:"",muscles:"Cervical Spine, Traps",notes:"Slow, half-circles only, avoid full roll"},
          {id:"cir-fund-cd-3",n:"Lying Glute Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Figure-four on back, gentle pull"},
        ],
      },
    },
  },

  strength:{
    label:"Strength Training", icon:"🏋️", color:"#8B5CF6",
    description:"Progressive resistance training to build maximum strength and muscle mass",
    subTypes:{
      powerlifting:{
        label:"Powerlifting", description:"Squat, bench, deadlift — maximal strength through the big three lifts",
        warmup:[
          {id:"str-pow-wu-1",n:"Hip Airplanes",s:"2",r:"8 each",rest:"20s",muscles:"Glutes, Hip Stabilizers",notes:"Standing, kick leg back and rotate"},
          {id:"str-pow-wu-2",n:"Thoracic Extension (foam roll)",s:"",r:"2 min",rest:"",muscles:"Thoracic Spine",notes:"Arms crossed, roll from T4 to T12"},
          {id:"str-pow-wu-3",n:"Pause Box Squat (bar only)",s:"3",r:"5",rest:"30s",muscles:"Quads, Glutes",notes:"Pause 2s on box, feel hamstring load"},
          {id:"str-pow-wu-4",n:"Shoulder Capsule Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Shoulder",notes:"Cross body pull, stabilise with opposite hand"},
        ],
        main:[
          {id:"str-pow-m-1",n:"Back Squat",s:"5",r:"3",rest:"3 min",muscles:"Quads, Glutes, Core, Upper Back",notes:"85% 1RM. Brace hard, controlled descent"},
          {id:"str-pow-m-2",n:"Bench Press",s:"5",r:"3",rest:"3 min",muscles:"Pectorals, Triceps, Shoulders",notes:"Arch, retract scapula, drive feet into floor"},
          {id:"str-pow-m-3",n:"Conventional Deadlift",s:"4",r:"3",rest:"3 min",muscles:"Hamstrings, Glutes, Lower Back, Traps",notes:"Lat engagement cue: bend the bar"},
          {id:"str-pow-m-4",n:"Romanian Deadlift",s:"3",r:"8",rest:"90s",muscles:"Hamstrings, Glutes",notes:"Accessory — moderate weight, feel the stretch"},
          {id:"str-pow-m-5",n:"Paused Bench (60%)",s:"3",r:"5",rest:"90s",muscles:"Chest, Triceps",notes:"2s pause on chest, no bounce"},
        ],
        cooldown:[
          {id:"str-pow-cd-1",n:"Couch Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Against wall or box, vertical shin"},
          {id:"str-pow-cd-2",n:"Lat Hang",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic",notes:"Passive hang on pull-up bar, decompress spine"},
          {id:"str-pow-cd-3",n:"Glute Pigeon",s:"",r:"90s each",rest:"",muscles:"Glutes, Piriformis",notes:"Elevated is fine if floor is too intense"},
        ],
      },
      bodybuilding:{
        label:"Bodybuilding / Hypertrophy", description:"Volume-focused training in the 8–15 rep range maximising muscle growth",
        warmup:[
          {id:"str-bbd-wu-1",n:"Resistance Band Chest Fly",s:"2",r:"15",rest:"20s",muscles:"Pectorals",notes:"Pre-activate before pressing"},
          {id:"str-bbd-wu-2",n:"Cable Face Pull",s:"2",r:"15",rest:"20s",muscles:"Rear Delts, External Rotators",notes:"External rotate at top"},
          {id:"str-bbd-wu-3",n:"Leg Extension (light)",s:"2",r:"15",rest:"20s",muscles:"Quads",notes:"Full extension, pause at top"},
          {id:"str-bbd-wu-4",n:"Hip Abduction",s:"2",r:"15",rest:"",muscles:"Glutes, Abductors",notes:"Cable or machine, slow eccentric"},
        ],
        main:[
          {id:"str-bbd-m-1",n:"Incline Dumbbell Press",s:"4",r:"12",rest:"90s",muscles:"Upper Chest, Shoulders, Triceps",notes:"30–45° angle, stretch at bottom"},
          {id:"str-bbd-m-2",n:"Cable Lateral Raise",s:"4",r:"15",rest:"60s",muscles:"Lateral Deltoid",notes:"Lead with elbow, no shrug"},
          {id:"str-bbd-m-3",n:"Leg Press",s:"4",r:"12",rest:"90s",muscles:"Quads, Glutes",notes:"Foot position controls emphasis"},
          {id:"str-bbd-m-4",n:"Machine Row",s:"4",r:"12",rest:"90s",muscles:"Lats, Rhomboids, Rear Delts",notes:"Drive elbows back, feel squeeze"},
          {id:"str-bbd-m-5",n:"Hammer Curl",s:"3",r:"12 each",rest:"60s",muscles:"Biceps, Brachialis",notes:"Neutral grip, no body swing"},
          {id:"str-bbd-m-6",n:"Tricep Rope Pushdown",s:"3",r:"15",rest:"60s",muscles:"Triceps",notes:"Spread rope at bottom, squeeze"},
          {id:"str-bbd-m-7",n:"Seated Leg Curl",s:"3",r:"12",rest:"60s",muscles:"Hamstrings",notes:"Full ROM, pause at peak contraction"},
        ],
        cooldown:[
          {id:"str-bbd-cd-1",n:"Lying Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Towel around foot if inflexible"},
          {id:"str-bbd-cd-2",n:"Cross-Body Shoulder Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Deltoid, Teres Minor",notes:"Pull straight arm across chest"},
          {id:"str-bbd-cd-3",n:"Bicep Wall Stretch",s:"",r:"45s each",rest:"",muscles:"Biceps, Anterior Shoulder",notes:"Hand on wall at shoulder height, rotate away"},
        ],
      },
      functional:{
        label:"Functional Strength", description:"Movement-based strength training for real-world athleticism and injury resilience",
        warmup:[
          {id:"str-func-wu-1",n:"Turkish Get-Up (no weight)",s:"2",r:"3 each side",rest:"30s",muscles:"Full Body, Stability",notes:"Slow deliberate each step"},
          {id:"str-func-wu-2",n:"Cossack Squat",s:"2",r:"8 each",rest:"20s",muscles:"Adductors, Quads, Ankles",notes:"Heel flat on working side"},
          {id:"str-func-wu-3",n:"Shoulder CARs",s:"2",r:"5 each direction",rest:"",muscles:"Shoulder Joint, Rotator Cuff",notes:"Full passive range of motion"},
        ],
        main:[
          {id:"str-func-m-1",n:"Single Leg Deadlift (DB)",s:"4",r:"8 each",rest:"90s",muscles:"Hamstrings, Glutes, Balance",notes:"Hip hinge, slight knee bend, tall spine"},
          {id:"str-func-m-2",n:"Turkish Get-Up",s:"4",r:"3 each side",rest:"90s",muscles:"Full Body, Core, Shoulder Stability",notes:"Slow on both up and down"},
          {id:"str-func-m-3",n:"Split Squat (Rear-Foot Elevated)",s:"4",r:"8 each",rest:"90s",muscles:"Quads, Glutes",notes:"Bulgarian — back foot elevated, vertical shin front"},
          {id:"str-func-m-4",n:"Suitcase Carry",s:"4",r:"40m",rest:"60s",muscles:"Core (Anti-Lateral Flexion), Grip",notes:"One arm, resist leaning"},
          {id:"str-func-m-5",n:"Landmine Press",s:"3",r:"10 each",rest:"75s",muscles:"Shoulders, Chest, Core",notes:"Staggered stance for stability"},
        ],
        cooldown:[
          {id:"str-func-cd-1",n:"90/90 Hip Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Internal/External Rotators",notes:"Both positions — front and back leg"},
          {id:"str-func-cd-2",n:"Thoracic Rotation (Quadruped)",s:"",r:"45s each",rest:"",muscles:"Thoracic Spine, Obliques",notes:"Hand behind head, rotate elbow to ceiling"},
          {id:"str-func-cd-3",n:"Ankle Circles",s:"",r:"30s each direction",rest:"",muscles:"Ankles, Lower Leg",notes:"Full range, seated or standing"},
        ],
      },
    },
  },

  hiit:{
    label:"HIIT", icon:"⚡", color:"#F59E0B",
    description:"High-Intensity Interval Training — maximum effort bursts with strategic rest for fat loss and conditioning",
    subTypes:{
      tabata:{
        label:"Tabata", description:"20 seconds maximum effort, 10 seconds rest, 8 rounds = 4 minutes per exercise",
        warmup:[
          {id:"hiit-tab-wu-1",n:"Slow Squat Reach",s:"2",r:"10",rest:"20s",muscles:"Quads, Thoracic, Shoulders",notes:"Reach overhead as you stand"},
          {id:"hiit-tab-wu-2",n:"Arm Swing Cross-Body",s:"",r:"45s",rest:"",muscles:"Shoulders, Upper Back",notes:"Gradually increase speed and range"},
          {id:"hiit-tab-wu-3",n:"Step Touch",s:"",r:"60s",rest:"",muscles:"Legs, Coordination",notes:"Side to side, progress to grapevine"},
          {id:"hiit-tab-wu-4",n:"Slow Burpee",s:"2",r:"5",rest:"20s",muscles:"Full Body",notes:"No jump, controlled tempo"},
        ],
        main:[
          {id:"hiit-tab-m-1",n:"Squat Jump",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Quads, Glutes, Power, Cardio",notes:"Full depth, explosive jump, land softly",timing:"tabata"},
          {id:"hiit-tab-m-2",n:"Push-Up Plank Alternating",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Chest, Triceps, Core",notes:"Alternate between push-up and plank reach",timing:"tabata"},
          {id:"hiit-tab-m-3",n:"High Knees",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Cardio, Hip Flexors, Core",notes:"Drive arms, maintain upright posture",timing:"tabata"},
          {id:"hiit-tab-m-4",n:"Alternating Reverse Lunge",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Quads, Glutes",notes:"Explosively drive front knee up between lunges",timing:"tabata"},
          {id:"hiit-tab-m-5",n:"Battle Rope Slam",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Shoulders, Core, Cardio",notes:"Overhead slam variation",timing:"tabata"},
        ],
        cooldown:[
          {id:"hiit-tab-cd-1",n:"Controlled Breathing Walk",s:"",r:"3 min",rest:"",muscles:"Cardiovascular Recovery",notes:"4-7-8 breath: inhale 4, hold 7, exhale 8"},
          {id:"hiit-tab-cd-2",n:"Standing Figure-4 Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Wall or chair for balance"},
          {id:"hiit-tab-cd-3",n:"Neck and Shoulder Release",s:"",r:"30s each position",rest:"",muscles:"Traps, Neck, Shoulders",notes:"Ear to shoulder, apply gentle pressure"},
        ],
      },
      bootcamp:{
        label:"Bootcamp", description:"Military-style group training combining cardio, bodyweight strength and team drills",
        warmup:[
          {id:"hiit-boot-wu-1",n:"Jog + Sprint Shuttle",s:"2",r:"4x20m",rest:"30s",muscles:"Full Legs, Cardio",notes:"Walk, jog, run progression each shuttle"},
          {id:"hiit-boot-wu-2",n:"Jumping Jack",s:"2",r:"30s",rest:"15s",muscles:"Full Body, Cardio",notes:"Full arm extension overhead"},
          {id:"hiit-boot-wu-3",n:"Bear Crawl",s:"2",r:"20m",rest:"20s",muscles:"Core, Shoulders, Legs",notes:"Knees just off ground, opposing limbs"},
          {id:"hiit-boot-wu-4",n:"Iron Cross Leg Swing",s:"2",r:"10 each",rest:"",muscles:"Adductors, Hamstrings, Hip Flexors",notes:"Hold wall for balance"},
        ],
        main:[
          {id:"hiit-boot-m-1",n:"Burpee",s:"4",r:"10",rest:"30s",muscles:"Full Body, Cardio",notes:"No pause at top — continuous flow"},
          {id:"hiit-boot-m-2",n:"Sprint (50m)",s:"6",r:"1",rest:"45s",muscles:"Full Legs, Power, Cardio",notes:"Drive knees, pump arms"},
          {id:"hiit-boot-m-3",n:"Squat Thrust",s:"4",r:"15",rest:"30s",muscles:"Core, Quads, Shoulders",notes:"Plank position + feet jump in"},
          {id:"hiit-boot-m-4",n:"Push-Up Hold (Bottom Position)",s:"3",r:"20s",rest:"30s",muscles:"Chest, Triceps, Core",notes:"2 inches off floor, elbows at 45°"},
          {id:"hiit-boot-m-5",n:"Broad Jump",s:"4",r:"6",rest:"30s",muscles:"Power, Quads, Glutes",notes:"Land and reset, max distance each jump"},
          {id:"hiit-boot-m-6",n:"Flutter Kick",s:"3",r:"30s",rest:"20s",muscles:"Core, Hip Flexors",notes:"Lower back pressed down, controlled"},
        ],
        cooldown:[
          {id:"hiit-boot-cd-1",n:"Walking Lunge Stretch",s:"",r:"2 min",rest:"",muscles:"Hip Flexors, Quads",notes:"Slow, pause at lowest point each step"},
          {id:"hiit-boot-cd-2",n:"Seated Forward Fold",s:"",r:"90s",rest:"",muscles:"Hamstrings, Lower Back",notes:"Flex feet, reach forward"},
          {id:"hiit-boot-cd-3",n:"Thread the Needle",s:"",r:"60s each",rest:"",muscles:"Thoracic, Shoulder",notes:"From quadruped, one arm under body"},
        ],
      },
      athletic:{
        label:"Athletic Performance", description:"Sport-specific conditioning combining power, agility and metabolic work",
        warmup:[
          {id:"hiit-ath-wu-1",n:"Hip Circle",s:"2",r:"10 each direction",rest:"",muscles:"Hips, Glutes",notes:"Forward and backward hip circles"},
          {id:"hiit-ath-wu-2",n:"Ankle Bounce",s:"2",r:"30s",rest:"15s",muscles:"Calves, Achilles",notes:"Minimal ground contact time"},
          {id:"hiit-ath-wu-3",n:"A-Skip",s:"2",r:"20m",rest:"20s",muscles:"Hip Flexors, Calves, Coordination",notes:"Knee to 90°, push through forefoot"},
          {id:"hiit-ath-wu-4",n:"Lateral Bound (small)",s:"2",r:"8 each",rest:"20s",muscles:"Glutes, Adductors",notes:"Small, controlled lateral hops to start"},
        ],
        main:[
          {id:"hiit-ath-m-1",n:"Box Jump (Rebound)",s:"5",r:"6",rest:"45s",muscles:"Power, Quads, Calves",notes:"Minimal ground contact, fast rebound"},
          {id:"hiit-ath-m-2",n:"Lateral Hurdle Hop",s:"4",r:"10",rest:"30s",muscles:"Lateral Power, Ankles, Coordination",notes:"Quick feet, stiff ankles"},
          {id:"hiit-ath-m-3",n:"Med Ball Rotational Slam",s:"4",r:"8 each",rest:"30s",muscles:"Rotational Power, Obliques",notes:"Full hip rotation, aggressive"},
          {id:"hiit-ath-m-4",n:"Deceleration Lunge",s:"4",r:"6 each",rest:"30s",muscles:"Quads, Glutes, Proprioception",notes:"Step out aggressively, brake hard"},
          {id:"hiit-ath-m-5",n:"Single Leg Broad Jump",s:"3",r:"5 each",rest:"45s",muscles:"Power, Balance, Glutes",notes:"Stick the landing 2 seconds"},
        ],
        cooldown:[
          {id:"hiit-ath-cd-1",n:"Standing Quad Stretch",s:"",r:"45s each",rest:"",muscles:"Quads",notes:"Stabilising foot straight forward"},
          {id:"hiit-ath-cd-2",n:"Calf Stretch",s:"",r:"45s each, 2 positions",rest:"",muscles:"Gastrocnemius, Soleus",notes:"Straight knee then bent knee"},
          {id:"hiit-ath-cd-3",n:"Figure-4 Hip Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Piriformis",notes:"Lying down, gentle pull"},
        ],
      },
    },
  },

  yoga:{
    label:"Yoga", icon:"🧘", color:"#10B981",
    description:"Mind-body practice integrating breath, movement and mindfulness",
    subTypes:{
      vinyasa:{
        label:"Vinyasa Flow", description:"Breath-linked movement flowing from pose to pose in a dynamic sequence",
        warmup:[
          {id:"yoga-vin-wu-1",n:"Child's Pose (Balasana)",s:"",r:"2 min",rest:"",muscles:"Hips, Thoracic, Lats",notes:"Arms extended, breathe into back body"},
          {id:"yoga-vin-wu-2",n:"Cat-Cow Flow",s:"2",r:"10 breaths",rest:"",muscles:"Spine, Core",notes:"Inhale = arch, exhale = round"},
          {id:"yoga-vin-wu-3",n:"Downward Dog",s:"",r:"60s",rest:"",muscles:"Hamstrings, Shoulders, Calves",notes:"Pedal heels alternately to open"},
          {id:"yoga-vin-wu-4",n:"Sun Salutation A (half speed)",s:"2",r:"1 round",rest:"",muscles:"Full Body",notes:"Focus on breath transitions, not speed"},
        ],
        main:[
          {id:"yoga-vin-m-1",n:"Sun Salutation B",s:"3",r:"1 round",rest:"",muscles:"Full Body, Cardio, Flexibility",notes:"Chair → Warrior 1 → Vinyasa"},
          {id:"yoga-vin-m-2",n:"Warrior 1 → 2 → Reverse",s:"",r:"5 breaths each side",rest:"",muscles:"Hips, Legs, Shoulders",notes:"Ground back foot, lengthen through fingertips"},
          {id:"yoga-vin-m-3",n:"Triangle → Extended Side Angle",s:"",r:"5 breaths each side",rest:"",muscles:"Adductors, Obliques, Hamstrings",notes:"Stack hips, lengthen side body"},
          {id:"yoga-vin-m-4",n:"Crow Pose (Bakasana)",s:"3",r:"15s",rest:"",muscles:"Core, Wrists, Shoulder Girdle",notes:"Round upper back, gaze forward"},
          {id:"yoga-vin-m-5",n:"Wheel (Urdhva Dhanurasana)",s:"3",r:"5 breaths",rest:"",muscles:"Hip Flexors, Chest, Shoulders, Spinal Extensors",notes:"Press into hands and feet evenly"},
        ],
        cooldown:[
          {id:"yoga-vin-cd-1",n:"Supine Spinal Twist",s:"",r:"90s each side",rest:"",muscles:"Thoracic, Obliques",notes:"Both shoulders contact the ground"},
          {id:"yoga-vin-cd-2",n:"Happy Baby",s:"",r:"90s",rest:"",muscles:"Hips, Groin, Lower Back",notes:"Rock gently side to side"},
          {id:"yoga-vin-cd-3",n:"Savasana",s:"",r:"5 min",rest:"",muscles:"Full Body Recovery, Nervous System",notes:"Complete stillness, scan body from feet to crown"},
        ],
      },
      yin:{
        label:"Yin Yoga", description:"Passive long-hold poses targeting deep connective tissue and joint mobility",
        warmup:[
          {id:"yoga-yin-wu-1",n:"Constructive Rest",s:"",r:"5 min",rest:"",muscles:"Lower Back, Nervous System",notes:"Feet flat on floor, knees up, arms relaxed"},
          {id:"yoga-yin-wu-2",n:"Supine Butterfly",s:"",r:"3 min",rest:"",muscles:"Adductors, Hips",notes:"Soles together, knees fall out. Support with blocks"},
          {id:"yoga-yin-wu-3",n:"Windshield Wiper Legs",s:"",r:"2 min",rest:"",muscles:"IT Band, Hips",notes:"Legs up, let knees fall side to side"},
        ],
        main:[
          {id:"yoga-yin-m-1",n:"Dragon Pose (deep lunge)",s:"",r:"3-5 min each",rest:"",muscles:"Hip Flexors, Quads",notes:"Sink weight forward, relax completely"},
          {id:"yoga-yin-m-2",n:"Sleeping Swan (Yin Pigeon)",s:"",r:"4-5 min each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Fold forward, use blocks under hip"},
          {id:"yoga-yin-m-3",n:"Caterpillar",s:"",r:"4-5 min",rest:"",muscles:"Hamstrings, Lower Back",notes:"Seated forward fold, fully round back"},
          {id:"yoga-yin-m-4",n:"Twisted Root (Reclined)",s:"",r:"3 min each",rest:"",muscles:"IT Band, Glutes, Thoracic",notes:"Cross leg over, both shoulders down"},
          {id:"yoga-yin-m-5",n:"Saddle Pose",s:"",r:"3-5 min",rest:"",muscles:"Quads, Hip Flexors, Ankles",notes:"Recline back — block under sacrum if needed"},
        ],
        cooldown:[
          {id:"yoga-yin-cd-1",n:"Savasana",s:"",r:"10 min",rest:"",muscles:"Nervous System, Full Body",notes:"Bolster under knees, eye pillow. Complete surrender"},
        ],
      },
      power_yoga:{
        label:"Power Yoga", description:"Strength-building yoga sequences combining poses with dynamic movement",
        warmup:[
          {id:"yoga-pow-wu-1",n:"Dynamic Child's Pose to Cobra",s:"",r:"8 reps",rest:"",muscles:"Spine, Shoulders, Hips",notes:"Flow between with breath"},
          {id:"yoga-pow-wu-2",n:"Standing Side Stretch",s:"",r:"45s each",rest:"",muscles:"Lats, Obliques",notes:"Reach overhead arc, breathe into ribs"},
          {id:"yoga-pow-wu-3",n:"Sun Salutation A",s:"3",r:"1 round",rest:"",muscles:"Full Body",notes:"Building pace, not max speed"},
        ],
        main:[
          {id:"yoga-pow-m-1",n:"Chair Pose Hold",s:"3",r:"10 breaths",rest:"",muscles:"Quads, Core, Shoulders",notes:"Arms overhead, sit deeper each breath"},
          {id:"yoga-pow-m-2",n:"Warrior 3 Balance",s:"3",r:"8 breaths each",rest:"",muscles:"Glutes, Hamstrings, Core",notes:"T-shape, flex standing foot"},
          {id:"yoga-pow-m-3",n:"Side Plank (Vasisthasana)",s:"3",r:"20s each",rest:"",muscles:"Obliques, Shoulders",notes:"Stack feet or stagger for modification"},
          {id:"yoga-pow-m-4",n:"Locust Pose",s:"3",r:"15s",rest:"",muscles:"Spinal Extensors, Glutes, Hamstrings",notes:"Both legs and arms off floor simultaneously"},
          {id:"yoga-pow-m-5",n:"Chaturanga Flow",s:"4",r:"8",rest:"",muscles:"Chest, Triceps, Core",notes:"Elbows skim ribs, straight line down"},
        ],
        cooldown:[
          {id:"yoga-pow-cd-1",n:"Seated Wide-Leg Forward Fold",s:"",r:"90s",rest:"",muscles:"Adductors, Hamstrings",notes:"Lead with chest, not forehead"},
          {id:"yoga-pow-cd-2",n:"Supine Spinal Twist",s:"",r:"90s each",rest:"",muscles:"Thoracic, Obliques",notes:"Arms in T, breathe into restriction"},
          {id:"yoga-pow-cd-3",n:"Legs-Up-the-Wall",s:"",r:"5 min",rest:"",muscles:"Legs, Lower Back, Nervous System",notes:"Scoot hips close to wall"},
        ],
      },
    },
  },

  boxing:{
    label:"Boxing / Kickboxing", icon:"🥊", color:"#EC4899",
    description:"Combat sports conditioning — technique, power and cardiovascular fitness through striking",
    subTypes:{
      boxing_fundamentals:{
        label:"Boxing Fundamentals", description:"Stance, footwork and the six basic punches — beginner to intermediate",
        warmup:[
          {id:"box-fund-wu-1",n:"Jump Rope",s:"3",r:"2 min",rest:"30s",muscles:"Calves, Coordination, Cardio",notes:"Focus on rhythm, not speed"},
          {id:"box-fund-wu-2",n:"Neck Rolls + Shoulder Circles",s:"2",r:"45s",rest:"",muscles:"Cervical Spine, Shoulders",notes:"Slow, no full backward roll"},
          {id:"box-fund-wu-3",n:"Shadow Boxing (low intensity)",s:"2",r:"2 min",rest:"30s",muscles:"Shoulders, Core, Cardio",notes:"Practice stance and weight transfer"},
          {id:"box-fund-wu-4",n:"Hip Rotation Drill",s:"2",r:"20",rest:"",muscles:"Core, Obliques",notes:"Drive rotation from hips, not shoulders"},
        ],
        main:[
          {id:"box-fund-m-1",n:"Jab-Cross Combo (Heavy Bag)",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Shoulders, Chest, Core",notes:"Extend fully, retract fast"},
          {id:"box-fund-m-2",n:"1-2-3-4 Combo",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Full Upper Body, Core",notes:"Jab-Cross-Left hook-Right hook"},
          {id:"box-fund-m-3",n:"Slip and Counter",s:"3",r:"90s",rest:"60s",muscles:"Core, Legs, Reaction",notes:"Bob outside lead foot, counter cross"},
          {id:"box-fund-m-4",n:"Footwork Ladder",s:"3",r:"60s",rest:"30s",muscles:"Calves, Glutes, Coordination",notes:"In/out, lateral, pivot patterns"},
          {id:"box-fund-m-5",n:"3-Minute Bag Round",s:"5",r:"3 min",rest:"1 min",muscles:"Full Body, Cardio, Endurance",notes:"Vary combos — work jabs, body shots"},
        ],
        cooldown:[
          {id:"box-fund-cd-1",n:"Shoulder Pendulum Swing",s:"",r:"60s each",rest:"",muscles:"Rotator Cuff, Anterior Shoulder",notes:"Lean forward, arm hangs and circles"},
          {id:"box-fund-cd-2",n:"Wrist and Forearm Stretch",s:"",r:"45s each direction",rest:"",muscles:"Forearms, Wrists",notes:"Extensor and flexor stretch both ways"},
          {id:"box-fund-cd-3",n:"Standing Glute Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Figure-4 standing, wall for balance"},
        ],
      },
      kickboxing:{
        label:"Kickboxing", description:"Full-body striking combining punches and kicks for maximum conditioning",
        warmup:[
          {id:"kick-wu-1",n:"Jump Rope Intervals",s:"3",r:"90s",rest:"30s",muscles:"Cardio, Coordination",notes:"Vary between single and alternating foot"},
          {id:"kick-wu-2",n:"Dynamic Hip Opener",s:"2",r:"10 each",rest:"",muscles:"Hips, Groin",notes:"Hold something, circle leg forward/back"},
          {id:"kick-wu-3",n:"Leg Swing Kick",s:"2",r:"10 each",rest:"",muscles:"Hamstrings, Hip Flexors",notes:"Front kick motion, controlled"},
          {id:"kick-wu-4",n:"Shadow Combo",s:"2",r:"2 min",rest:"30s",muscles:"Full Body, Cardio",notes:"Include low kicks — visualise targets"},
        ],
        main:[
          {id:"kick-m-1",n:"Roundhouse Kick (pad or bag)",s:"4",r:"10 each side",rest:"45s",muscles:"Glutes, Obliques, Hip Flexors",notes:"Chamber, rotate hip, snap and retract"},
          {id:"kick-m-2",n:"Front Kick (Teep)",s:"4",r:"10 each",rest:"30s",muscles:"Quads, Hip Flexors, Core",notes:"Push through heel, re-chamber before landing"},
          {id:"kick-m-3",n:"Jab-Cross-Roundhouse Combo",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Full Body, Cardio",notes:"Mix kicks at body and head height"},
          {id:"kick-m-4",n:"Jump Knee Strike",s:"3",r:"8 each",rest:"45s",muscles:"Core, Hip Flexors, Quads",notes:"Drive knee up explosively, tall upper body"},
          {id:"kick-m-5",n:"Thai Pad Work",s:"5",r:"3 min rounds",rest:"1 min",muscles:"Full Body, Power, Reaction",notes:"Call combos mid-round"},
        ],
        cooldown:[
          {id:"kick-cd-1",n:"Hip Flexor Lunge Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Back knee down, sink forward"},
          {id:"kick-cd-2",n:"Butterfly Groin Stretch",s:"",r:"90s",rest:"",muscles:"Adductors, Groin",notes:"Soles together, lean gently forward"},
          {id:"kick-cd-3",n:"Lying Quad Stretch",s:"",r:"60s each",rest:"",muscles:"Quads",notes:"Side-lying, bend knee to glute"},
        ],
      },
    },
  },

  pilates:{
    label:"Pilates", icon:"🌀", color:"#06B6D4",
    description:"Core-centred training integrating breath, alignment and controlled movement",
    subTypes:{
      mat_pilates:{
        label:"Mat Pilates", description:"Classical mat sequence using bodyweight for core strength, posture and flexibility",
        warmup:[
          {id:"pil-mat-wu-1",n:"Breathing Prep",s:"",r:"8 breaths",rest:"",muscles:"Deep Core, Diaphragm",notes:"Inhale wide ribcage, exhale zip from pelvic floor up"},
          {id:"pil-mat-wu-2",n:"Pelvic Curl",s:"2",r:"8",rest:"",muscles:"Glutes, Hamstrings, Spinal Articulation",notes:"Peel spine off mat vertebra by vertebra"},
          {id:"pil-mat-wu-3",n:"Spine Twist Supine",s:"2",r:"6 each",rest:"",muscles:"Obliques, Thoracic",notes:"Knees fall to one side, opposite shoulder stays"},
          {id:"pil-mat-wu-4",n:"Chest Lift",s:"2",r:"10",rest:"",muscles:"Rectus Abdominis, Hip Flexors",notes:"Curl from crown of head, elbows wide"},
        ],
        main:[
          {id:"pil-mat-m-1",n:"The Hundred",s:"1",r:"100 pumps",rest:"",muscles:"Core, Hip Flexors, Shoulders",notes:"Inhale 5, exhale 5. Legs at table-top or diagonal"},
          {id:"pil-mat-m-2",n:"Roll-Up",s:"3",r:"8",rest:"",muscles:"Rectus Abdominis, Spinal Flexibility",notes:"Peel and stack each vertebra, control down"},
          {id:"pil-mat-m-3",n:"Single Leg Stretch",s:"3",r:"10 each",rest:"",muscles:"Core, Hip Flexors",notes:"Hands on ankle and knee of bent leg"},
          {id:"pil-mat-m-4",n:"Criss-Cross",s:"3",r:"12",rest:"",muscles:"Obliques, Core",notes:"Rotate to opposite knee, extend other leg"},
          {id:"pil-mat-m-5",n:"Swan",s:"3",r:"6",rest:"",muscles:"Spinal Extensors, Glutes",notes:"Keep pelvis down, lengthen not compress"},
          {id:"pil-mat-m-6",n:"Side Kick Series",s:"2",r:"10 each",rest:"",muscles:"Glutes, Abductors, Core Stability",notes:"Stable pelvis and spine throughout"},
        ],
        cooldown:[
          {id:"pil-mat-cd-1",n:"Mermaid Stretch",s:"",r:"45s each",rest:"",muscles:"Obliques, Lats",notes:"Side sit, arm arcs over head"},
          {id:"pil-mat-cd-2",n:"Rest Position (Child's Pose)",s:"",r:"2 min",rest:"",muscles:"Hips, Lower Back, Thoracic",notes:"Breathe into back body completely"},
          {id:"pil-mat-cd-3",n:"Spine Stretch Forward",s:"",r:"60s",rest:"",muscles:"Hamstrings, Spinal Flexion",notes:"Seated, reach forward over straight legs"},
        ],
      },
      core_focus:{
        label:"Core Focus", description:"Deep stabiliser activation targeting the Pilates powerhouse — transversus abdominis, pelvic floor, multifidus",
        warmup:[
          {id:"pil-core-wu-1",n:"Imprinting Exercise",s:"",r:"2 min",rest:"",muscles:"Multifidus, Pelvic Floor",notes:"Find neutral spine, breathe deep abdomen"},
          {id:"pil-core-wu-2",n:"Heel Slides",s:"2",r:"8 each",rest:"",muscles:"Deep Core, Hip Flexors",notes:"Maintain neutral spine as leg extends"},
          {id:"pil-core-wu-3",n:"Bent Knee Fall Out",s:"2",r:"6 each",rest:"",muscles:"Hip Rotators, Deep Core Stability",notes:"Pelvis completely still, knee falls slowly"},
        ],
        main:[
          {id:"pil-core-m-1",n:"Dead Bug",s:"3",r:"8 each",rest:"30s",muscles:"Transversus Abdominis, Core",notes:"Opposite arm/leg, press lower back down"},
          {id:"pil-core-m-2",n:"Bird Dog",s:"3",r:"8 each",rest:"30s",muscles:"Multifidus, Glutes, Core",notes:"Level pelvis, extend fully"},
          {id:"pil-core-m-3",n:"Plank with Tap",s:"3",r:"8 each",rest:"30s",muscles:"Core, Shoulders, Glutes",notes:"Lift alternate hand to tap, minimal hip sway"},
          {id:"pil-core-m-4",n:"Bicycle Crunch",s:"3",r:"12 each",rest:"30s",muscles:"Obliques, Rectus Abdominis",notes:"Long elbow, rotate from ribcage not neck"},
          {id:"pil-core-m-5",n:"Side Plank Clamshell",s:"3",r:"10 each",rest:"30s",muscles:"Obliques, Glutes",notes:"Side plank, top knee opens"},
          {id:"pil-core-m-6",n:"Hollow Body Rock",s:"3",r:"20s",rest:"30s",muscles:"Full Core, Hip Flexors",notes:"Arms by ears, rock from shoulders to hips"},
        ],
        cooldown:[
          {id:"pil-core-cd-1",n:"Cat-Cow 3D",s:"",r:"8 each direction",rest:"",muscles:"Spine, Core",notes:"Also side-bend and rotation"},
          {id:"pil-core-cd-2",n:"Supine Knees to Chest",s:"",r:"90s",rest:"",muscles:"Lower Back, Glutes",notes:"Hug knees, gentle rock"},
          {id:"pil-core-cd-3",n:"Hip Hinge Release",s:"",r:"60s",rest:"",muscles:"Lower Back, Hamstrings",notes:"Standing, hinge and hang limp"},
        ],
      },
    },
  },

  bootcamp:{
    label:"Bootcamp", icon:"🎖️", color:"#7A94AA",
    description:"Military-inspired group training combining functional fitness, resilience and team challenge",
    subTypes:{
      military:{
        label:"Military Style", description:"Classic military physical training — functional endurance and raw toughness",
        warmup:[
          {id:"boot-mil-wu-1",n:"Jog on Spot",s:"",r:"3 min",rest:"",muscles:"Legs, Cardio",notes:"Progress intensity each minute"},
          {id:"boot-mil-wu-2",n:"Squat Thrust",s:"2",r:"10",rest:"20s",muscles:"Core, Quads, Shoulders",notes:"Controlled, not rushed"},
          {id:"boot-mil-wu-3",n:"Side-Straddle Hop",s:"2",r:"20",rest:"15s",muscles:"Full Body, Coordination",notes:"Military jumping jack — 4-count"},
          {id:"boot-mil-wu-4",n:"Arm Circles",s:"",r:"30s each direction",rest:"",muscles:"Shoulders",notes:"Forward and backward, small to large"},
        ],
        main:[
          {id:"boot-mil-m-1",n:"Push-Up",s:"4",r:"20",rest:"30s",muscles:"Chest, Triceps, Core",notes:"Cadence: down-two-three, up"},
          {id:"boot-mil-m-2",n:"Squat",s:"4",r:"20",rest:"30s",muscles:"Quads, Glutes",notes:"Parallel or below, weight in heels"},
          {id:"boot-mil-m-3",n:"Sit-Up",s:"4",r:"20",rest:"30s",muscles:"Core, Hip Flexors",notes:"Feet secured, full range"},
          {id:"boot-mil-m-4",n:"Burpee",s:"3",r:"15",rest:"45s",muscles:"Full Body, Cardio",notes:"Max effort, consistent form"},
          {id:"boot-mil-m-5",n:"Run (400m)",s:"4",r:"1",rest:"2 min",muscles:"Full Legs, Cardio, Endurance",notes:"Moderate pace, not sprint — maintain form"},
          {id:"boot-mil-m-6",n:"Plank",s:"3",r:"45s",rest:"30s",muscles:"Core, Shoulders",notes:"Rigid as a plank"},
        ],
        cooldown:[
          {id:"boot-mil-cd-1",n:"Standing IT Band Stretch",s:"",r:"45s each",rest:"",muscles:"IT Band, Glutes",notes:"Cross one leg, lean away"},
          {id:"boot-mil-cd-2",n:"Chest Opener",s:"",r:"60s",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Clasp hands behind back, open chest"},
          {id:"boot-mil-cd-3",n:"Standing Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Straight leg heel elevated on surface"},
        ],
      },
      athletic_camp:{
        label:"Athletic Camp", description:"Sport science-backed bootcamp combining athletic drills with functional strength",
        warmup:[
          {id:"boot-ath-wu-1",n:"Skipping",s:"",r:"3 min",rest:"",muscles:"Cardio, Calves, Coordination",notes:"Single skip, vary rhythm"},
          {id:"boot-ath-wu-2",n:"Lunge with Rotation",s:"2",r:"8 each",rest:"20s",muscles:"Hip Flexors, Thoracic, Quads",notes:"Hands behind head, rotate to front leg"},
          {id:"boot-ath-wu-3",n:"T-Drill",s:"3",r:"1",rest:"30s",muscles:"Agility, Change of Direction, Legs",notes:"Forward run, lateral shuffle, backpedal"},
          {id:"boot-ath-wu-4",n:"Spiderman Stretch",s:"",r:"5 each side",rest:"",muscles:"Hip Flexors, Thoracic, Groin",notes:"From push-up: step outside hand, hold 3s"},
        ],
        main:[
          {id:"boot-ath-m-1",n:"Sled Push / Prowler",s:"4",r:"20m",rest:"90s",muscles:"Quads, Glutes, Calves, Drive",notes:"Forward lean, short fast steps"},
          {id:"boot-ath-m-2",n:"Tyre Flip",s:"4",r:"6",rest:"60s",muscles:"Posterior Chain, Grip, Power",notes:"Deadlift pattern, push as it tips"},
          {id:"boot-ath-m-3",n:"Battle Rope",s:"4",r:"30s",rest:"30s",muscles:"Shoulders, Core, Cardio",notes:"Alternate waves, maintain low stance"},
          {id:"boot-ath-m-4",n:"Sandbag Carry",s:"4",r:"40m",rest:"60s",muscles:"Core, Grip, Traps, Legs",notes:"Bear hug or shoulder carry — both sides"},
          {id:"boot-ath-m-5",n:"Box Jump Burpee",s:"3",r:"8",rest:"45s",muscles:"Power, Full Body, Cardio",notes:"Burpee into box jump — land controlled"},
        ],
        cooldown:[
          {id:"boot-ath-cd-1",n:"Standing Overhead Stretch",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic, Shoulders",notes:"Interlace fingers overhead, lengthen"},
          {id:"boot-ath-cd-2",n:"Pigeon Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Knee towards same-side wrist"},
          {id:"boot-ath-cd-3",n:"Neck Stretch",s:"",r:"30s each",rest:"",muscles:"Neck, Upper Traps",notes:"Ear to shoulder, gentle hand assist"},
        ],
      },
    },
  },

  hyrox:{
    label:"Hyrox", icon:"🏅", color:"#F59E0B",
    description:"The world fitness race — 8×1km runs each followed by a functional workout station",
    subTypes:{
      race_prep:{
        label:"Race Simulation", description:"Full Hyrox-format session simulating the 8 station race structure with running intervals",
        warmup:[
          {id:"hx-race-wu-1",n:"Easy Run",s:"",r:"8 min",rest:"",muscles:"Full Legs, Cardio",notes:"Conversational pace. Build leg turnover gradually"},
          {id:"hx-race-wu-2",n:"Hip Flexor Lunge",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Quads",notes:"Deep lunge, reach arm overhead on front leg side"},
          {id:"hx-race-wu-3",n:"Leg Swing",s:"",r:"15 each direction",rest:"",muscles:"Hip Flexors, Hamstrings",notes:"Forward/back and lateral. Hold wall for balance"},
          {id:"hx-race-wu-4",n:"Shoulder Circle",s:"",r:"10 each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Full ROM, large slow circles"},
          {id:"hx-race-wu-5",n:"Box Step-Up",s:"2",r:"10 each",rest:"30s",muscles:"Quads, Glutes",notes:"Activate glutes before heavy stations"},
        ],
        main:[
          {id:"hx-race-m-1",n:"1km Run + Ski Erg",s:"",r:"1km + 1000m",rest:"Into next station",muscles:"Full Body, Cardio, Shoulders",notes:"Ski erg: hinge at hips, drive with arms and legs. Consistent stroke rate",timing:"none"},
          {id:"hx-race-m-2",n:"1km Run + Sled Push",s:"",r:"1km + 50m",rest:"Into next station",muscles:"Quads, Glutes, Drive",notes:"Heavy sled: forward lean 45°, fast short steps, breathe every 2-3 steps"},
          {id:"hx-race-m-3",n:"1km Run + Sled Pull",s:"",r:"1km + 50m",rest:"Into next station",muscles:"Posterior Chain, Grip",notes:"Light sled: walk backward, hand over hand rope pull. Keep back straight"},
          {id:"hx-race-m-4",n:"1km Run + Burpee Broad Jumps",s:"",r:"1km + 80m",rest:"Into next station",muscles:"Full Body, Power, Cardio",notes:"Chest to floor, explosive jump forward. Find rhythm — don't sprint then die"},
          {id:"hx-race-m-5",n:"1km Run + Rowing",s:"",r:"1km + 1000m",rest:"Into next station",muscles:"Full Body, Posterior Chain, Cardio",notes:"Drive with legs first, lean back slightly, pull hands to sternum. 24-26 SPM target"},
          {id:"hx-race-m-6",n:"1km Run + Farmers Carry",s:"",r:"1km + 200m",rest:"Into next station",muscles:"Grip, Traps, Core, Legs",notes:"Tall posture, neutral spine. Switch hands at 100m turnaround"},
          {id:"hx-race-m-7",n:"1km Run + Sandbag Lunges",s:"",r:"1km + 100m",rest:"Into next station",muscles:"Quads, Glutes, Core",notes:"Sandbag in front rack or hugged to chest. Back knee close to floor"},
          {id:"hx-race-m-8",n:"1km Run + Wall Balls",s:"",r:"1km + 100 reps",rest:"Finish",muscles:"Quads, Shoulders, Cardio",notes:"10ft target. Full squat, drive through heels, release ball at top of push"},
        ],
        cooldown:[
          {id:"hx-race-cd-1",n:"Walk",s:"",r:"5 min",rest:"",muscles:"Cardiovascular Recovery",notes:"Slow walk, hands on head, deep nasal breaths"},
          {id:"hx-race-cd-2",n:"Quad Stretch",s:"",r:"60s each",rest:"",muscles:"Quads, Hip Flexors",notes:"Standing or lying, pull heel to glute"},
          {id:"hx-race-cd-3",n:"Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Seated single leg, reach toward toes"},
          {id:"hx-race-cd-4",n:"Shoulder Cross-Body Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Shoulder, Rhomboids",notes:"Pull arm across chest, ease into stretch"},
          {id:"hx-race-cd-5",n:"Cat-Cow",s:"",r:"10 slow",rest:"",muscles:"Thoracic Spine, Lumbar",notes:"On all fours. Full spinal flexion and extension"},
        ],
      },
      station_strength:{
        label:"Station Strength", description:"Isolated Hyrox station training — build strength and technique at each exercise",
        warmup:[
          {id:"hx-str-wu-1",n:"Row Erg Warm-Up",s:"",r:"3 min easy",rest:"",muscles:"Full Body, Posterior Chain",notes:"Damper at 3. Focus on leg drive sequence"},
          {id:"hx-str-wu-2",n:"Goblet Squat",s:"2",r:"10",rest:"30s",muscles:"Quads, Glutes, Thoracic",notes:"Light KB. Elbows inside knees, tall chest"},
          {id:"hx-str-wu-3",n:"Banded Shoulder Warm-Up",s:"2",r:"12",rest:"20s",muscles:"Rotator Cuff, Rear Delts",notes:"External rotation + band pull-apart"},
          {id:"hx-str-wu-4",n:"Walking Lunge",s:"",r:"20m",rest:"",muscles:"Quads, Glutes, Hip Flexors",notes:"Long stride, upright torso"},
        ],
        main:[
          {id:"hx-str-m-1",n:"Ski Erg Intervals",s:"5",r:"200m",rest:"90s",muscles:"Lats, Shoulders, Core, Cardio",notes:"Target consistent pace each rep. Practice double-pole rhythm"},
          {id:"hx-str-m-2",n:"Sled Push",s:"4",r:"25m",rest:"2 min",muscles:"Quads, Glutes, Calves",notes:"Add weight each set. Find race-day weight and master it"},
          {id:"hx-str-m-3",n:"Farmers Carry",s:"4",r:"50m",rest:"90s",muscles:"Grip, Traps, Core",notes:"Race weight. Time each rep, aim for sub-40s per 50m"},
          {id:"hx-str-m-4",n:"Sandbag Lunge",s:"3",r:"20m",rest:"90s",muscles:"Quads, Glutes, Core",notes:"Slow and controlled. Knee close to floor without touching"},
          {id:"hx-str-m-5",n:"Wall Ball",s:"4",r:"25",rest:"60s",muscles:"Quads, Shoulders, Cardio",notes:"Unbroken sets. Catch below chin, squat, explode"},
          {id:"hx-str-m-6",n:"Burpee Broad Jump",s:"3",r:"20m",rest:"90s",muscles:"Full Body, Power",notes:"Measure and track distance. Aim for consistent jump distance"},
        ],
        cooldown:[
          {id:"hx-str-cd-1",n:"Hip Flexor Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors",notes:"Low lunge, sink hips. Arms overhead for deeper stretch"},
          {id:"hx-str-cd-2",n:"Lat Stretch",s:"",r:"60s each",rest:"",muscles:"Lats, Thoracic",notes:"Arm overhead on box/wall, sit back into stretch"},
          {id:"hx-str-cd-3",n:"Calf Raises + Stretch",s:"",r:"60s",rest:"",muscles:"Gastrocnemius, Soleus",notes:"10 slow raises then stretch. Address running tightness"},
        ],
      },
      open_format:{
        label:"Hyrox Open", description:"Scaled or partner format — accessible Hyrox training for all fitness levels",
        warmup:[
          {id:"hx-open-wu-1",n:"Light Jog",s:"",r:"5 min",rest:"",muscles:"Legs, Cardio",notes:"5 min easy jog to elevate heart rate"},
          {id:"hx-open-wu-2",n:"Glute Bridge",s:"2",r:"15",rest:"20s",muscles:"Glutes, Hamstrings",notes:"Pause at top, squeeze glutes"},
          {id:"hx-open-wu-3",n:"Arm Swing",s:"",r:"30s each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Loosen shoulders for ski erg and carries"},
        ],
        main:[
          {id:"hx-open-m-1",n:"Run / Row Interval",s:"4",r:"400m each",rest:"2 min",muscles:"Full Legs, Cardio",notes:"Alternate between run and row to simulate race demands at lower intensity"},
          {id:"hx-open-m-2",n:"Light Sled Push",s:"4",r:"20m",rest:"90s",muscles:"Quads, Glutes",notes:"50% race weight. Build confidence with technique"},
          {id:"hx-open-m-3",n:"KB Carry (Farmers)",s:"3",r:"40m",rest:"60s",muscles:"Grip, Core, Traps",notes:"Light to moderate. Walk tall, neutral spine"},
          {id:"hx-open-m-4",n:"Goblet Squat + Wall Ball Combo",s:"3",r:"10+10",rest:"60s",muscles:"Quads, Shoulders, Glutes",notes:"10 goblet squats into 10 wall balls — mimics race transition fatigue"},
          {id:"hx-open-m-5",n:"Walking Lunge (Unloaded)",s:"3",r:"30m",rest:"60s",muscles:"Quads, Glutes",notes:"Learn sandbag lunge mechanics without load first"},
        ],
        cooldown:[
          {id:"hx-open-cd-1",n:"Full Body Stretch Sequence",s:"",r:"5 min",rest:"",muscles:"Full Body",notes:"Quad, hip flexor, hamstring, shoulder — 45s each"},
          {id:"hx-open-cd-2",n:"Foam Roll Quads",s:"",r:"90s each",rest:"",muscles:"Quads, IT Band",notes:"Slow passes. Pause on tender spots"},
          {id:"hx-open-cd-3",n:"Box Breathing",s:"",r:"5 rounds",rest:"",muscles:"Nervous System Recovery",notes:"Inhale 4s, hold 4s, exhale 4s, hold 4s"},
        ],
      },
    },
  },
};

// ─── Editable library helpers ─────────────────────────────────────────────────
function getLibrary() {
  try {
    const raw = localStorage.getItem("jungle_library_custom");
    if (raw) {
      const saved = JSON.parse(raw);
      const merged = {};
      const allKeys = [...new Set([...Object.keys(WORKOUT_LIBRARY), ...Object.keys(saved)])];
      allKeys.forEach(k => {
        if (saved[k]) {
          merged[k] = {
            ...(WORKOUT_LIBRARY[k] || {}),
            ...saved[k],
            subTypes: { ...(WORKOUT_LIBRARY[k]?.subTypes || {}), ...(saved[k]?.subTypes || {}) },
          };
        } else {
          merged[k] = WORKOUT_LIBRARY[k];
        }
      });
      return merged;
    }
  } catch(_) {}
  return WORKOUT_LIBRARY;
}
function saveLibrary(data) {
  try { localStorage.setItem("jungle_library_custom", JSON.stringify(data)); } catch(_) {}
}
function resetLibrary() {
  try { localStorage.removeItem("jungle_library_custom"); } catch(_) {}
}

// ─── SCFG-to-library stage mapping ───────────────────────────────────────────
// Maps builder stage types → which exercise pool to draw from
const STAGE_LIBRARY_MAP = {
  warmup:   "warmup",
  cooldown: "cooldown",
  stretch:  "cooldown",
  recovery: "cooldown",
  circuit:  "main",
  strength: "main",
  cardio:   "main",
};

// ─── Smart exercise distributor from library ──────────────────────────────────
// lib param is optional — falls back to getLibrary() which merges user edits
function distributeLibraryExercises(classType, subType, currentStages, lib) {
  const library = lib || getLibrary();
  const cls = library[classType];
  if (!cls) return currentStages;
  const sub = cls.subTypes[subType];
  if (!sub) return currentStages;

  return currentStages.map(stage => {
    const pool = STAGE_LIBRARY_MAP[stage.type] || "main";
    const exercises = (sub[pool] || sub.main || []).map(ex => ({
      id: ex.id + "_" + Date.now(),
      n: ex.n, s: ex.s, r: ex.r, rest: ex.rest,
      notes: ex.notes || "",
      timing: ex.timing || "none",
      muscles: ex.muscles || "",
      source: "library",
    }));
    return { ...stage, exercises };
  });
}

// ─── Class-level stage structure templates ────────────────────────────────────
// Defines the default stage timeline for each class type + sub-type.
// Each entry is an array of { name, type, dur } — id/exercises/tracks added at apply-time.
const CLASS_STAGE_TEMPLATES = {
  crossfit:{
    wod:[
      {name:"Warm-Up",    type:"warmup",   dur:300},
      {name:"Skill Work", type:"strength", dur:900},
      {name:"WOD",        type:"circuit",  dur:1200},
      {name:"Cool-Down",  type:"cooldown", dur:300},
    ],
    amrap:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"AMRAP",     type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    emom:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"EMOM",      type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  spin:{
    endurance:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Base Ride",    type:"cardio",  dur:900},
      {name:"Climb Block",  type:"cardio",  dur:900},
      {name:"Sprint Block", type:"cardio",  dur:600},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
    hiit_ride:[
      {name:"Warm-Up",          type:"warmup",   dur:300},
      {name:"Sprint Intervals", type:"cardio",   dur:1200},
      {name:"Active Recovery",  type:"recovery", dur:300},
      {name:"Finisher",         type:"cardio",   dur:300},
      {name:"Cool-Down",        type:"cooldown", dur:300},
    ],
    hills:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Climb A",   type:"cardio",  dur:720},
      {name:"Climb B",   type:"cardio",  dur:720},
      {name:"Climb C",   type:"cardio",  dur:480},
      {name:"Cool-Down", type:"cooldown",dur:480},
    ],
  },
  circuit:{
    cardio_circuit:[
      {name:"Warm-Up",         type:"warmup",   dur:300},
      {name:"Circuit A",       type:"circuit",  dur:900},
      {name:"Active Recovery", type:"recovery", dur:180},
      {name:"Circuit B",       type:"circuit",  dur:900},
      {name:"Cool-Down",       type:"cooldown", dur:420},
    ],
    strength_circuit:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:720},
      {name:"Circuit B", type:"circuit", dur:720},
      {name:"Circuit C", type:"circuit", dur:720},
      {name:"Cool-Down", type:"cooldown",dur:540},
    ],
    fundamental:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  strength:{
    powerlifting:[
      {name:"Warm-Up",        type:"warmup",   dur:600},
      {name:"Main Lifts",     type:"strength", dur:2100},
      {name:"Accessory Work", type:"strength", dur:600},
      {name:"Cool-Down",      type:"cooldown", dur:300},
    ],
    bodybuilding:[
      {name:"Warm-Up",         type:"warmup",   dur:300},
      {name:"Primary Group",   type:"strength", dur:1200},
      {name:"Secondary Group", type:"strength", dur:1200},
      {name:"Isolation",       type:"strength", dur:300},
      {name:"Cool-Down",       type:"cooldown", dur:300},
    ],
    functional:[
      {name:"Warm-Up",        type:"warmup",  dur:300},
      {name:"Strength Block", type:"strength",dur:1500},
      {name:"Cool-Down",      type:"cooldown",dur:300},
    ],
  },
  hiit:{
    tabata:[
      {name:"Warm-Up",        type:"warmup",   dur:300},
      {name:"Tabata Block 1", type:"circuit",  dur:480},
      {name:"Rest",           type:"recovery", dur:120},
      {name:"Tabata Block 2", type:"circuit",  dur:480},
      {name:"Rest",           type:"recovery", dur:120},
      {name:"Cool-Down",      type:"cooldown", dur:300},
    ],
    bootcamp:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Station A", type:"circuit", dur:900},
      {name:"Station B", type:"circuit", dur:900},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    athletic:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Power Block",  type:"strength",dur:600},
      {name:"Conditioning", type:"circuit", dur:1200},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
  yoga:{
    vinyasa:[
      {name:"Warm-Up",        type:"warmup",  dur:300},
      {name:"Sun Salutation", type:"cardio",  dur:600},
      {name:"Standing Flow",  type:"circuit", dur:1200},
      {name:"Floor Work",     type:"stretch", dur:900},
      {name:"Cool-Down",      type:"cooldown",dur:600},
    ],
    yin:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Yin Block 1", type:"stretch", dur:1200},
      {name:"Yin Block 2", type:"stretch", dur:900},
      {name:"Cool-Down",   type:"cooldown",dur:600},
    ],
    power_yoga:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Power Flow",  type:"circuit", dur:1500},
      {name:"Core Work",   type:"strength",dur:600},
      {name:"Cool-Down",   type:"cooldown",dur:600},
    ],
  },
  boxing:{
    boxing_fundamentals:[
      {name:"Warm-Up",          type:"warmup",  dur:300},
      {name:"Technique Rounds", type:"circuit", dur:900},
      {name:"Bag Work",         type:"circuit", dur:900},
      {name:"Cool-Down",        type:"cooldown",dur:300},
    ],
    kickboxing:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Combo Rounds", type:"circuit", dur:1200},
      {name:"Conditioning", type:"cardio",  dur:600},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
  pilates:{
    mat_pilates:[
      {name:"Warm-Up",       type:"warmup",  dur:300},
      {name:"Core Sequence", type:"strength",dur:2100},
      {name:"Stretch",       type:"stretch", dur:600},
      {name:"Cool-Down",     type:"cooldown",dur:300},
    ],
    core_focus:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Core Block A",type:"strength",dur:900},
      {name:"Core Block B",type:"strength",dur:900},
      {name:"Cool-Down",   type:"cooldown",dur:300},
    ],
  },
  bootcamp:{
    military:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:900},
      {name:"Circuit B", type:"circuit", dur:900},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    athletic_camp:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Station A", type:"circuit", dur:720},
      {name:"Station B", type:"circuit", dur:720},
      {name:"Finisher",  type:"strength",dur:360},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  hyrox:{
    race_prep:[
      {name:"Warm-Up",               type:"warmup",  dur:600},
      {name:"Ski Erg + Run",         type:"cardio",  dur:480},
      {name:"Sled Push + Run",       type:"cardio",  dur:480},
      {name:"Sled Pull + Run",       type:"cardio",  dur:480},
      {name:"Burpee BJ + Run",       type:"cardio",  dur:600},
      {name:"Rowing + Run",          type:"cardio",  dur:480},
      {name:"Farmers Carry + Run",   type:"cardio",  dur:480},
      {name:"Sandbag Lunges + Run",  type:"cardio",  dur:600},
      {name:"Wall Balls + Run",      type:"cardio",  dur:720},
      {name:"Cool-Down",             type:"cooldown",dur:600},
    ],
    station_strength:[
      {name:"Warm-Up",   type:"warmup",  dur:600},
      {name:"Ski Erg",   type:"strength",dur:900},
      {name:"Sled Work", type:"strength",dur:900},
      {name:"Carries",   type:"strength",dur:600},
      {name:"Cool-Down", type:"cooldown",dur:600},
    ],
    open_format:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Station Work", type:"circuit", dur:1200},
      {name:"Conditioning", type:"cardio",  dur:900},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
};

// Build fresh stages from a class template (empty exercises — ready for library distribute)
function buildStagesFromTemplate(classType, subType) {
  const tmpl = CLASS_STAGE_TEMPLATES[classType]?.[subType];
  if (!tmpl) return null;
  return tmpl.map(t => ({ id:uid(), name:t.name, type:t.type, dur:t.dur, exercises:[], tracks:[], groups:[] }));
}

// Deep-clone template stages so tracks are fully isolated per session
function cloneTemplateStages(tmpl) {
  return tmpl.stages.map(s => ({ ...s, id:uid(), tracks:[], exercises:s.exercises.map(e=>({...e})) }));
}

const GLOSSARY = {
  "Upper Body": [
    { name:"Atlas Press",         muscles:"Shoulders, Triceps, Upper Traps", diff:"Intermediate", cues:"Drive from shoulder, full lockout overhead, ribs down." },
    { name:"Serpent Row",         muscles:"Lats, Rhomboids, Biceps",         diff:"Intermediate", cues:"Hinge 45°, row to lower chest, squeeze scapula at top." },
    { name:"Cobra Push-Up",       muscles:"Chest, Triceps, Serratus",        diff:"Beginner",     cues:"Wide hands, lower slow, explosive push, protract at top." },
    { name:"Renegade Row",        muscles:"Lats, Core, Shoulders",           diff:"Advanced",     cues:"Plank position, minimal hip rotation, row to ribcage." },
    { name:"Spider Curl",         muscles:"Biceps, Brachialis",              diff:"Beginner",     cues:"Incline bench 45°, arm hangs free, curl to shoulder." },
    { name:"JM Press",            muscles:"Triceps, Chest",                  diff:"Advanced",     cues:"Bar to nose, elbows 45°, press explosively to lockout." },
  ],
  "Lower Body": [
    { name:"Primal Squat",        muscles:"Quads, Glutes, Hamstrings",       diff:"Beginner",     cues:"Feet hip-width, chest tall, break parallel, drive through heels." },
    { name:"Nordic Curl",         muscles:"Hamstrings (eccentric)",          diff:"Advanced",     cues:"Anchor feet, lower body slow with hamstrings, pull back up." },
    { name:"Pistol Squat",        muscles:"Quads, Glutes, Hamstrings, Core", diff:"Advanced",     cues:"Weighted or assisted, contralateral leg extended, hip depth." },
    { name:"Skater Bound",        muscles:"Glutes, Quads, Hamstrings, Core", diff:"Intermediate", cues:"Bound lateral, drive off rear leg, land stacked knee." },
    { name:"Box Jump",            muscles:"Quads, Glutes, Hamstrings",       diff:"Intermediate", cues:"Swing arms, explosive extension, land soft, full reset." },
    { name:"Copenhagen Adductor", muscles:"Adductors, Obliques, Core",       diff:"Beginner",     cues:"Side plank position, bottom leg extended, top knee bent." },
    { name:"Box Depth Jump",      muscles:"Quads, Glutes, Reactive Strength",diff:"Advanced",     cues:"Step off, absorb fast, explode straight up immediately." },
  ],
  "Core & Stability": [
    { name:"Dead Bug",            muscles:"Rectus Abdominis, Transverse, Spinal Erectors", diff:"Beginner", cues:"Press lower back down, opposite arm-leg lower, slow." },
    { name:"Pallof Press",        muscles:"Obliques, Core, Stability",       diff:"Beginner",     cues:"Cable or band, offset stance, press without rotation." },
    { name:"Hollow Rock",         muscles:"Core, Spinal Erectors",           diff:"Beginner",     cues:"Hollow position, lower back flattened, shoulder blades protracted." },
    { name:"Bird Dog",            muscles:"Core, Glutes, Stabilizers",       diff:"Beginner",     cues:"Neutral spine, opposite arm-leg extend, no rotation." },
    { name:"Battle Rope Wave",    muscles:"Shoulders, Core, Cardiovascular", diff:"Intermediate", cues:"Alternate wave, drive from hips, keep core braced." },
  ],
  "Plyometrics & Cardio": [
    { name:"Tuck Jump",           muscles:"Quads, Glutes, Cardiovascular",   diff:"Intermediate", cues:"Explosive takeoff, tuck knees to chest, land soft." },
    { name:"High Knee Drive",     muscles:"Hip Flexors, Cardiovascular",     diff:"Beginner",     cues:"Drive knees up to hip height, stay on balls of feet, pump arms." },
    { name:"Bear Crawl Sprint",   muscles:"Full Body, Core",                 diff:"Intermediate", cues:"Hips level, fast hands and feet, keep back flat." },
    { name:"Burpee Complex",      muscles:"Full Body, Cardiovascular",       diff:"Intermediate", cues:"Controlled lower, explosive jump, hands always shoulder-width." },
  ],
  "Mobility & Prehab": [
    { name:"World's Greatest Stretch", muscles:"Full Body Mobility", diff:"Beginner",     cues:"Walking lunge, rotate, hamstring stretch, thoracic extension." },
    { name:"Hip 90/90 Flow",           muscles:"Hip Mobility, Glutes", diff:"Beginner",   cues:"90° flexion and abduction, alternate sides, explore ROM." },
    { name:"Thoracic CAR",             muscles:"Thoracic Spine",       diff:"Intermediate",cues:"Tall kneeling, open up, big circles, drive rotation." },
    { name:"Shoulder CARs",            muscles:"Shoulder Complex",     diff:"Beginner",    cues:"Standing tall, full ROM circles, smooth and controlled." },
    { name:"Hamstring Floss",          muscles:"Hamstrings, Glutes",   diff:"Beginner",    cues:"Standing fold, hamstring tension, gentle oscillation." },
    { name:"Pigeon Flow",              muscles:"Hip External Rotators, Glutes", diff:"Beginner", cues:"90° hip angle, alternate hip stretch, breathe deep." },
  ]
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CLASS_TYPES = ["HIIT","Strength","Mobility","Circuit","Cardio","Recovery","Open Gym"];

// ─── UI Primitives ────────────────────────────────────────────────────────────
const Btn = ({children, onClick, variant="primary", style:s={}, ...p}) => (
  <button onClick={onClick} style={{padding:"10px 18px",background:variant==="ghost"?"transparent":variant==="green"?T.green:T.accent,color:variant==="ghost"?T.accent:"white",border:`1px solid ${variant==="ghost"?T.accent+"60":"transparent"}`,borderRadius:"6px",cursor:"pointer",fontSize:"13px",fontWeight:"700",display:"inline-flex",alignItems:"center",gap:"6px",...s}} {...p}>{children}</button>
);
const Input = ({style:s={}, ...p}) => (
  <input style={{padding:"9px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"13px",outline:"none",width:"100%",boxSizing:"border-box",...s}} {...p}/>
);
const Select = ({children, style:s={}, ...p}) => (
  <select style={{padding:"9px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"13px",outline:"none",width:"100%",...s}} {...p}>{children}</select>
);
const Tag = ({children, color, style:s={}}) => (
  <span style={{display:"inline-block",padding:"3px 9px",background:color||T.navy,color:"white",borderRadius:"4px",fontSize:"11px",fontWeight:"700",...s}}>{children}</span>
);
const SpBadge = ({children}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"5px 10px",background:T.green+"20",color:T.green,borderRadius:"6px",fontSize:"12px",fontWeight:"700",border:`1px solid ${T.green}40`}}>{children}</span>
);

// ─── Logo ─────────────────────────────────────────────────────────────────────
// Option A (default): Leaf + Barbell in a circle
const JungleLogo = ({size=32}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" fill={T.accent+"18"} stroke={T.accent} strokeWidth="2"/>
    {/* Jungle leaf */}
    <path d="M26 57 Q37 22 56 29 Q41 45 26 57Z" fill={T.green} opacity="0.95"/>
    <path d="M56 29 Q71 17 74 35 Q62 40 56 29Z" fill={T.green} opacity="0.7"/>
    <line x1="26" y1="57" x2="56" y2="29" stroke={T.green} strokeWidth="1.5" opacity="0.4"/>
    {/* Barbell */}
    <rect x="22" y="68" width="56" height="6" rx="3" fill={T.accent}/>
    <rect x="13" y="62" width="12" height="18" rx="2.5" fill={T.accent}/>
    <rect x="75" y="62" width="12" height="18" rx="2.5" fill={T.accent}/>
  </svg>
);

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({icon, label, value, color}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  return (
    <div style={{padding:isMobile?"12px 10px":"18px",background:T.card,borderRadius:"10px",border:`1px solid ${T.border}`}}>
      <div style={{fontSize:isMobile?"18px":"22px",marginBottom:isMobile?"5px":"8px"}}>{icon}</div>
      <p style={{fontSize:isMobile?"20px":"26px",fontWeight:"800",color:color||T.text,marginBottom:"3px",lineHeight:"1"}}>{value}</p>
      <p style={{fontSize:"10px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p>
    </div>
  );
}

// ─── LoginScreen ──────────────────────────────────────────────────────────────
function LoginScreen({onLogin, authError}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at 50% 20%, ${T.navy} 0%, ${T.bg} 65%)`,color:T.text,padding:isMobile?"20px":"30px",textAlign:"center"}}>
      <JungleLogo size={isMobile?60:80}/>
      <h1 style={{marginTop:"20px",fontSize:isMobile?"36px":"56px",fontWeight:"800",letterSpacing:isMobile?"4px":"8px"}}>JUNGLE</h1>
      <p style={{marginTop:"12px",color:T.muted,fontSize:isMobile?"14px":"16px",maxWidth:"360px",lineHeight:"1.7",width:"100%",boxSizing:"border-box"}}>Elite gym workout management<br/>with synchronized Spotify integration</p>
      {authError && <div style={{marginTop:"20px",padding:"12px 20px",background:T.accent+"20",border:`1px solid ${T.accent}`,borderRadius:"8px",color:T.accent,fontSize:"13px"}}>⚠️ {authError}</div>}
      {IS_CONFIGURED ? (
        <button onClick={onLogin} style={{marginTop:"32px",padding:isMobile?"14px 36px":"16px 52px",background:T.green,color:"white",border:"none",borderRadius:"32px",fontSize:isMobile?"14px":"15px",fontWeight:"700",cursor:"pointer",width:isMobile?"92vw":"auto",maxWidth:"320px",minHeight:"44px"}}>
          🎵 Continue with Spotify
        </button>
      ) : (
        <div style={{marginTop:"28px",padding:isMobile?"16px":"20px",background:T.card,borderRadius:"12px",border:`1px solid ${T.border}`,width:isMobile?"92vw":"420px",maxWidth:"100%",textAlign:"left",boxSizing:"border-box"}}>
          <p style={{fontWeight:"700",marginBottom:"10px"}}>⚙️ Setup Required</p>
          <p style={{fontSize:"13px",color:T.muted,marginBottom:"10px"}}>Open jungle.jsx and set your Spotify Client ID:</p>
          <code style={{fontSize:"12px",color:T.accent,background:T.navy,padding:"10px 12px",borderRadius:"6px",display:"block",wordBreak:"break-all"}}>const SPOTIFY_CLIENT_ID = "your_id_here";</code>
        </div>
      )}
      <p style={{marginTop:"24px",fontSize:"12px",color:T.muted,padding:"0 8px"}}>Spotify Premium required · Redirect URI must match your Spotify Dashboard</p>
    </div>
  );
}

// ─── ProfileModal ─────────────────────────────────────────────────────────────
// F13: Expanded with real class-history stats and recent sessions
function ProfileModal({profile, onClose, onLogout, sessionHistory=[], gymBranding={}, onBrandingChange}) {
  if (!profile) return null;

  const vwPM = useWindowWidth();
  const isMobilePM = vwPM < 480;
  const [tab, setTab] = useState("profile"); // "profile" | "branding"

  // ── Profile stats ──
  const totalSessions = sessionHistory.length;
  const totalMinutes  = sessionHistory.reduce((a,s)=>a+(s.durMin||0),0);
  const totalHours    = (totalMinutes/60).toFixed(1);
  const avgDur        = totalSessions ? Math.round(totalMinutes/totalSessions) : 0;
  const now = new Date(), today = now.toISOString().slice(0,10);
  const dates = new Set(sessionHistory.map(s=>s.date));
  let streak = 0;
  for (let d=new Date(now);;d.setDate(d.getDate()-1)) {
    const ds = d.toISOString().slice(0,10);
    if (dates.has(ds)) streak++; else if (ds<today) break;
  }
  const typeCounts = {};
  sessionHistory.forEach(s => s.stageTypes?.forEach(t=>{ typeCounts[t]=(typeCounts[t]||0)+1; }));
  const topType = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const recent = sessionHistory.slice(0,5);

  // ── Branding draft ──
  const [draft, setDraft] = useState({
    logo:        gymBranding.logo        || null,
    gymName:     gymBranding.gymName     || "",
    accentColor: gymBranding.accentColor || T.accent,
    secondColor: gymBranding.secondColor || T.green,
    fontFamily:  gymBranding.fontFamily  || "system",
    customFont:  gymBranding.customFont  || "",
  });
  const [extracting, setExtracting] = useState(false);
  const [saved, setSaved]           = useState(false);
  const fileRef = useRef(null);

  const handleLogoUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      // Resize to ≤320px before storing
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const maxD = 320, scale = Math.min(1, maxD/tmpImg.width, maxD/tmpImg.height);
        const cv = document.createElement("canvas");
        cv.width = Math.round(tmpImg.width*scale); cv.height = Math.round(tmpImg.height*scale);
        cv.getContext("2d").drawImage(tmpImg, 0, 0, cv.width, cv.height);
        const resized = cv.toDataURL("image/png", 0.85);
        setDraft(d => ({...d, logo: resized}));
        setExtracting(true);
        extractDominantColor(resized, color => {
          setExtracting(false);
          if (color) setDraft(d => ({...d, accentColor: color}));
        });
      };
      tmpImg.src = src;
    };
    reader.readAsDataURL(file);
  };

  const saveBranding = () => {
    const effectiveFont = draft.fontFamily === "custom" ? (draft.customFont||"system") : draft.fontFamily;
    onBrandingChange({...draft, fontFamily: effectiveFont});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetBranding = () => {
    const empty = { logo:null, gymName:"", accentColor:null, secondColor:null, fontFamily:"system", customFont:"" };
    setDraft(empty);
    onBrandingChange({});
  };

  const TabBtn = ({id, label}) => (
    <button onClick={()=>setTab(id)} style={{flex:1, padding:"9px", background:tab===id?T.accent+"20":"transparent",
      color:tab===id?T.accent:T.muted, border:`1px solid ${tab===id?T.accent+"50":T.border}`,
      borderRadius:"8px", cursor:"pointer", fontSize:"12px", fontWeight:"700"}}>
      {label}
    </button>
  );

  return (
    <div style={{position:"fixed",inset:"0",background:"rgba(0,0,0,0.65)",display:"flex",alignItems:isMobilePM?"flex-end":"center",justifyContent:"center",zIndex:1000,padding:isMobilePM?"0":"16px"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:isMobilePM?"14px 14px 0 0":"14px",width:"100%",maxWidth:"420px",maxHeight:isMobilePM?"96vh":"92vh",display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid ${T.border}`}}>

        {/* Header */}
        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"14px"}}>
            {profile.images?.[0]?.url
              ? <img src={profile.images[0].url} style={{width:"52px",height:"52px",borderRadius:"50%",border:`2px solid ${T.green}`}} alt="avatar"/>
              : <div style={{width:"52px",height:"52px",borderRadius:"50%",background:T.navy,display:"flex",alignItems:"center",justifyContent:"center"}}><User size={24} color={T.muted}/></div>
            }
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:"16px",fontWeight:"700",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.display_name||"Spotify User"}</p>
              <p style={{fontSize:"11px",color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.email}</p>
            </div>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:"6px"}}>
            <TabBtn id="profile"  label="👤 Profile"/>
            <TabBtn id="branding" label="🎨 Gym Branding"/>
          </div>
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && <>
          {/* Stats */}
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
            <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Your Stats</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {[
                {icon:"🏋️",label:"Total Sessions",value:String(totalSessions),color:T.accent},
                {icon:"⏱️",label:"Total Hours",   value:totalHours+"h",      color:T.green},
                {icon:"📊",label:"Avg Duration",  value:avgDur+" min",        color:"#8B5CF6"},
                {icon:"🔥",label:"Day Streak",    value:String(streak),       color:"#F97316"},
              ].map(s=>(
                <div key={s.label} style={{padding:"10px 12px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                  <p style={{fontSize:"18px",fontWeight:"800",color:s.color,lineHeight:"1"}}>{s.value}</p>
                  <p style={{fontSize:"10px",color:T.muted,marginTop:"2px"}}>{s.icon} {s.label}</p>
                </div>
              ))}
            </div>
            {topType && <p style={{fontSize:"11px",color:T.muted,marginTop:"10px"}}>🏆 Most trained: <span style={{color:SCFG[topType]?.color||T.green,fontWeight:"700"}}>{SCFG[topType]?.label||topType}</span></p>}
          </div>
          {/* Recent sessions */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Recent Sessions</p>
            {recent.length === 0
              ? <p style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"16px 0"}}>No sessions yet. Start one to track your history.</p>
              : recent.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<recent.length-1?`1px solid ${T.border}`:"none"}}>
                  <div style={{width:"36px",height:"36px",borderRadius:"8px",background:T.accent+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"16px"}}>🏋️</span></div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"13px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name||"Workout"}</p>
                    <p style={{fontSize:"11px",color:T.muted}}>{s.date} · {s.durMin} min · {s.stages} stage{s.stages!==1?"s":""}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </>}

        {/* ── BRANDING TAB ── */}
        {tab === "branding" && (
          <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:"16px"}}>

            {/* Gym logo */}
            <div>
              <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Gym Logo</p>
              <div style={{display:"flex",gap:"12px",alignItems:"flex-start"}}>
                {/* Preview */}
                <div style={{width:"80px",height:"80px",borderRadius:"10px",background:T.navy,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                  {draft.logo
                    ? <img src={draft.logo} style={{width:"100%",height:"100%",objectFit:"contain"}} alt="logo"/>
                    : <span style={{fontSize:"28px"}}>🏢</span>
                  }
                </div>
                <div style={{flex:1}}>
                  <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoUpload}/>
                  <button onClick={()=>fileRef.current?.click()}
                    style={{width:"100%",padding:"9px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",color:T.text,fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}>
                    {extracting ? "⏳ Extracting colours…" : draft.logo ? "🔄 Change Logo" : "📁 Upload Logo"}
                  </button>
                  {draft.logo && (
                    <button onClick={()=>setDraft(d=>({...d,logo:null}))}
                      style={{width:"100%",padding:"7px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>
                      Remove
                    </button>
                  )}
                  <p style={{fontSize:"10px",color:T.muted,marginTop:"5px"}}>Logo appears in the header. Dominant colour is auto-extracted.</p>
                </div>
              </div>
            </div>

            {/* Gym name */}
            <div>
              <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Gym Name</p>
              <Input value={draft.gymName} onChange={e=>setDraft(d=>({...d,gymName:e.target.value}))} placeholder="e.g. Iron House Fitness"/>
              <p style={{fontSize:"10px",color:T.muted,marginTop:"4px"}}>Shown in the header alongside your logo.</p>
            </div>

            {/* Accent colour */}
            <div>
              <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Accent Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" value={draft.accentColor} onChange={e=>setDraft(d=>({...d,accentColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid ${T.border}`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.accentColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.accentColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Primary</span>
                </div>
              </div>
              <p style={{fontSize:"10px",color:T.muted,marginTop:"4px"}}>Auto-extracted from logo — override by clicking the swatch.</p>
            </div>

            {/* Secondary colour */}
            <div>
              <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Secondary Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" value={draft.secondColor} onChange={e=>setDraft(d=>({...d,secondColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid ${T.border}`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.secondColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.secondColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Secondary</span>
                </div>
              </div>
            </div>

            {/* Font */}
            <div>
              <p style={{fontSize:"11px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Font</p>
              <Select value={draft.fontFamily} onChange={e=>setDraft(d=>({...d,fontFamily:e.target.value}))}>
                {GYM_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                <option value="custom">✏️ Custom Google Font…</option>
              </Select>
              {draft.fontFamily !== "system" && draft.fontFamily !== "custom" && (
                <p style={{fontSize:"13px",marginTop:"8px",fontFamily:`'${draft.fontFamily}', sans-serif`,color:T.text,padding:"8px 12px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                  The quick brown fox — {draft.fontFamily}
                </p>
              )}
              {draft.fontFamily === "custom" && (
                <Input placeholder="e.g. Poppins, Nunito, Space Grotesk" value={draft.customFont}
                  onChange={e=>setDraft(d=>({...d,customFont:e.target.value}))} style={{marginTop:"6px"}}/>
              )}
              <p style={{fontSize:"10px",color:T.muted,marginTop:"4px"}}>Loaded from Google Fonts — applied app-wide.</p>
            </div>


          </div>
        )}

        {/* Footer */}
        <div style={{padding:"12px 18px",borderTop:`1px solid ${T.border}`,display:"flex",gap:"8px",flexShrink:0}}>
          {tab === "branding" ? <>
            <button onClick={saveBranding}
              style={{flex:2,padding:"10px",background:saved?T.green:T.accent,color:"white",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",transition:"background 0.3s",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              {saved ? <><Check size={13}/> Saved!</> : "💾 Save Branding"}
            </button>
            <button onClick={resetBranding}
              style={{flex:1,padding:"10px",background:T.navy,color:T.muted,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>
              Reset
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:T.navy,color:T.text,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
          </> : <>
            <button onClick={onLogout} style={{flex:1,padding:"10px",background:T.accent+"15",color:T.accent,border:`1px solid ${T.accent}40`,borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <LogOut size={13}/> Sign Out
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:T.navy,color:T.text,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── PinScreen ────────────────────────────────────────────────────────────────
function PinScreen({onUnlock}) {
  const vwPin = useWindowWidth();
  const isMobilePin = vwPin < 480;
  const [pin, setPin]       = useState("");
  const [shake, setShake]   = useState(false);
  const [error, setError]   = useState(false);
  const PIN_LENGTH = 6;
  const CORRECT    = "080921";

  const handleDigit = d => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === PIN_LENGTH) {
      if (next === CORRECT) {
        sessionStorage.setItem("jungle_pin_ok", "1");
        onUnlock();
      } else {
        setShake(true);
        setError(true);
        setTimeout(() => { setPin(""); setShake(false); }, 600);
      }
    }
  };

  const handleDelete = () => { setPin(p => p.slice(0, -1)); setError(false); };

  const pad = [
    ["1","2","3"],
    ["4","5","6"],
    ["7","8","9"],
    [null,"0","del"],
  ];

  return (
    <div style={{minHeight:"100vh",background:DARK.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <JungleLogo size={52} style={{marginBottom:"16px"}}/>
      <p style={{fontSize:"22px",fontWeight:"800",letterSpacing:"3px",color:DARK.text,marginBottom:"6px"}}>JUNGLE</p>
      <p style={{fontSize:"13px",color:DARK.muted,marginBottom:"40px"}}>Enter your PIN to continue</p>

      {/* Dot indicators */}
      <div style={{
        display:"flex",gap:"14px",marginBottom:"36px",
        animation: shake ? "pinShake 0.5s ease" : "none",
      }}>
        {Array.from({length:PIN_LENGTH}).map((_,i) => (
          <div key={i} style={{
            width:"14px",height:"14px",borderRadius:"50%",
            background: i < pin.length ? (error ? DARK.accent : DARK.green) : "transparent",
            border: `2px solid ${i < pin.length ? (error ? DARK.accent : DARK.green) : DARK.border}`,
            transition:"background 0.15s, border-color 0.15s",
          }}/>
        ))}
      </div>

      {/* Number pad */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:isMobilePin?"12px":"10px",width:isMobilePin?"min(320px,90vw)":"min(280px,85vw)"}}>
        {pad.flat().map((k,i) => {
          if (k === null) return <div key={i}/>;
          return (
            <button key={i} onClick={k==="del" ? handleDelete : ()=>handleDigit(k)}
              style={{
                width:"100%",aspectRatio:"1",borderRadius:"50%",
                background: k==="del" ? "transparent" : DARK.card,
                border: `1px solid ${k==="del" ? "transparent" : DARK.border}`,
                color: DARK.text,cursor:"pointer",
                fontSize: k==="del" ? (isMobilePin?"20px":"16px") : (isMobilePin?"26px":"22px"),
                fontWeight:"600",display:"flex",alignItems:"center",justifyContent:"center",
                transition:"background 0.1s",minHeight:isMobilePin?"64px":"44px",minWidth:isMobilePin?"64px":"44px",
              }}
              onMouseEnter={e=>{ if(k!=="del") e.currentTarget.style.background=DARK.navy; }}
              onMouseLeave={e=>{ if(k!=="del") e.currentTarget.style.background=DARK.card; }}
            >
              {k==="del" ? "⌫" : k}
            </button>
          );
        })}
      </div>

      {error && <p style={{marginTop:"24px",fontSize:"13px",color:DARK.accent,fontWeight:"600"}}>Incorrect PIN. Try again.</p>}

      <style>{`
        @keyframes pinShake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}

// ─── TrackItem ────────────────────────────────────────────────────────────────
// stageType is optional – if provided, shows a mismatch warning on the BPM pill
// BPM is always shown: auto-detected where possible, or "? BPM" click-to-set manually
function TrackItem({track, onAdd, onRemove, added=false, stageType=null}) {
  // Initialise from track.bpm or the cache (covers tracks loaded before cache was warmed)
  const [bpm,        setBpm]        = useState(() => track.bpm || getBpmCache()[track.id] || 0);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput,   setBpmInput]   = useState("");

  // If parent updates track.bpm (e.g. async enrichment finishes), sync local state
  useEffect(() => {
    const fresh = track.bpm || getBpmCache()[track.id] || 0;
    if (fresh && fresh !== bpm) setBpm(fresh);
  }, [track.bpm, track.id]);

  const saveBpm = () => {
    const val = parseInt(bpmInput);
    if (val > 0 && val < 300 && track.id) {
      const cache = getBpmCache();
      cache[track.id] = val;
      saveBpmCache(cache);
      setBpm(val);
    }
    setEditingBpm(false);
  };

  const bc       = bpm ? bpmColor(bpm) : T.muted;
  const mismatch = stageType && bpm ? bpmMismatch(bpm, stageType) : false;

  return (
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:added?T.green+"12":T.navy,borderRadius:"6px",border:`1px solid ${added?T.green+"30":"transparent"}`,transition:"background 0.2s"}}>
      {track.albumArt
        ? <img src={track.albumArt} style={{width:"40px",height:"40px",borderRadius:"4px",flexShrink:0,objectFit:"cover"}} alt="album"/>
        : <div style={{width:"40px",height:"40px",borderRadius:"4px",background:T.border,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={14} color={T.muted}/></div>
      }
      <div style={{flex:1,minWidth:"0"}}>
        <p style={{fontSize:"13px",fontWeight:"600",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{track.t}</p>
        <p style={{fontSize:"11px",color:T.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{track.a}</p>
        <div style={{display:"flex",alignItems:"center",gap:"5px",marginTop:"3px"}}>
          {/* BPM pill — always visible; click to set/edit manually */}
          {editingBpm ? (
            <span style={{display:"flex",alignItems:"center",gap:"3px"}}>
              <input
                autoFocus
                value={bpmInput}
                onChange={e=>setBpmInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter")saveBpm(); if(e.key==="Escape")setEditingBpm(false); }}
                placeholder="BPM"
                style={{width:"52px",padding:"1px 5px",background:T.card,border:`1px solid ${T.accent}`,borderRadius:"3px",color:T.text,fontSize:"10px",fontWeight:"700",outline:"none"}}
              />
              <button onClick={saveBpm} style={{padding:"1px 6px",background:T.accent,border:"none",borderRadius:"3px",cursor:"pointer",color:"#fff",fontSize:"10px",fontWeight:"700"}}>✓</button>
              <button onClick={()=>setEditingBpm(false)} style={{padding:"1px 4px",background:"transparent",border:"none",cursor:"pointer",color:T.muted,fontSize:"10px"}}>✕</button>
            </span>
          ) : bpm > 0 ? (
            <span
              onClick={()=>{ setBpmInput(String(bpm)); setEditingBpm(true); }}
              title={mismatch && SCFG[stageType]?.bpmMin
                ? `⚠ Target for this stage: ${SCFG[stageType].bpmMin}–${SCFG[stageType].bpmMax} BPM · Click to edit`
                : `${bpm} BPM · Click to edit`}
              style={{fontSize:"10px",fontWeight:"700",padding:"1px 6px",borderRadius:"3px",background:bc+"25",color:bc,border:`1px solid ${mismatch?"#F59E0B33":"transparent"}`,cursor:"pointer",userSelect:"none"}}>
              {mismatch && "⚠ "}{bpm} BPM
            </span>
          ) : (
            <span
              onClick={()=>{ setBpmInput(""); setEditingBpm(true); }}
              title="BPM unknown — click to set manually"
              style={{fontSize:"10px",fontWeight:"600",padding:"1px 6px",borderRadius:"3px",background:T.border+"60",color:T.muted,border:`1px dashed ${T.border}`,cursor:"pointer",userSelect:"none"}}>
              ? BPM
            </span>
          )}
          <span style={{fontSize:"10px",color:T.muted}}>{fmt(track.dur)}</span>
        </div>
      </div>
      {added && <span style={{fontSize:"10px",color:T.green,fontWeight:"700",flexShrink:0,padding:"2px 8px",background:T.green+"20",borderRadius:"4px"}}>✓ Added</span>}
      {onAdd    && !added && <button onClick={onAdd}    title="Add to stage" style={{background:T.green+"20",border:"none",cursor:"pointer",color:T.green,flexShrink:0,padding:"6px 10px",borderRadius:"5px",display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",fontWeight:"700"}}><Plus size={14}/> Add</button>}
      {onRemove && <button onClick={onRemove} title="Remove from stage" style={{background:T.accent+"15",border:"none",cursor:"pointer",color:T.accent,flexShrink:0,padding:"6px 8px",borderRadius:"5px",display:"flex",alignItems:"center"}}><Trash2 size={14}/></button>}
    </div>
  );
}

// ─── TrackSearch ──────────────────────────────────────────────────────────────
function TrackSearch({onAdd, addedIds=[], stageType=null, onSmartDistribute=null}) {
  const [tab,      setTab]      = useState("track"); // "track"|"genre"|"playlist"|"bpm"
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // Track tab
  const [q, setQ] = useState("");

  // Genre tab
  const [selGenre, setSelGenre] = useState("");
  const [genreQ,   setGenreQ]   = useState("");

  // Playlist tab
  const [playlists,  setPlaylists]  = useState([]);
  const [loadingPls, setLoadingPls] = useState(false);
  const [selPl,      setSelPl]      = useState(null);
  const [plTracks,   setPlTracks]   = useState([]);
  const [loadingTr,  setLoadingTr]  = useState(false);
  const [plDenied,      setPlDenied]      = useState(false);
  const [plSearch,      setPlSearch]      = useState(""); // search Spotify playlists
  const [plSearchActive, setPlSearchActive] = useState(false); // true when showing search results

  // BPM tab
  const [bpmMin,       setBpmMin]       = useState(() => SCFG[stageType]?.bpmMin || 120);
  const [bpmMax,       setBpmMax]       = useState(() => SCFG[stageType]?.bpmMax || 140);
  const [bpmSeedGenre, setBpmSeedGenre] = useState("workout");

  // Pre-fill BPM from stageType when it changes
  useEffect(() => {
    if (stageType && SCFG[stageType]?.bpmMin) {
      setBpmMin(SCFG[stageType].bpmMin);
      setBpmMax(SCFG[stageType].bpmMax);
    }
  }, [stageType]);

  // Load playlists when playlist tab is first opened
  useEffect(() => {
    if (tab === "playlist" && !playlists.length && !loadingPls) {
      setLoadingPls(true);
      apiGetPlaylists().then(pls => { setPlaylists(pls); setLoadingPls(false); });
    }
  }, [tab]);

  const switchTab = (t) => { setTab(t); setResults([]); setError(null); };

  // ── Search helpers ──
  const withAudioFeatures = async (tracks) => {
    let fmap = {};
    try {
      const ids = tracks.map(t=>t.id).filter(Boolean);
      const feats = await getAudioFeatures(ids);
      fmap = Object.fromEntries(feats.filter(Boolean).map(f=>[f.id,f]));
    } catch(_) {}
    return tracks.map(t => normTrack(t, fmap[t.id]));
  };

  const runQuery = async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true); setError(null);
    try {
      const raw = await searchTracks(trimmed);
      if (!raw.length) { setResults([]); setLoading(false); return; }
      setResults(await withAudioFeatures(raw));
    } catch(err) {
      setError(err?.status===401?"auth":"generic"); setResults([]);
    }
    setLoading(false);
  };

  const runBpmSearch = async () => {
    setLoading(true); setError(null);
    try {
      // Use genre search (Spotify's /recommendations is deprecated for most apps)
      const genre = bpmSeedGenre || "workout";
      const raw = await searchTracks(`genre:"${genre}"`);
      if (!raw.length) { setResults([]); setLoading(false); return; }
      setResults(await withAudioFeatures(raw));
    } catch(err) {
      setError("generic"); setResults([]);
    }
    setLoading(false);
  };

  const openPlaylist = async (pl) => {
    setSelPl(pl); setLoadingTr(true); setPlTracks([]); setPlDenied(false);
    const tr = await apiGetPlaylistTracks(pl.id);
    if (tr === null) {
      // Scope missing — send user through re-auth popup to get collaborative scope
      setLoadingTr(false);
      const win = await openSpotifyAuthPopup();
      if (win) {
        const handleMsg = async (evt) => {
          if (evt.data?.type !== "spotify_auth_complete") return;
          window.removeEventListener("message", handleMsg);
          const tr2 = await apiGetPlaylistTracks(pl.id);
          if (tr2 && Array.isArray(tr2)) {
            const normed2 = tr2.map(normSpTrack);
            setPlTracks(normed2);
            enrichTracksWithBpm(normed2).then(e=>setPlTracks(e)).catch(()=>{});
          } else setPlDenied(true);
          setLoadingTr(false);
        };
        window.addEventListener("message", handleMsg);
      } else {
        setPlDenied(true);
      }
      return;
    }
    if (tr?.denied) { setPlDenied(tr.message || true); setLoadingTr(false); return; }
    // Normalize tracks immediately; enrich BPM asynchronously in background
    const normed = tr.map(normSpTrack);
    setPlTracks(normed); setLoadingTr(false);
    enrichTracksWithBpm(normed).then(enriched => setPlTracks(enriched)).catch(()=>{});
  };

  const searchSpotifyPlaylists = async () => {
    if (!plSearch.trim()) return;
    setLoadingPls(true);
    setPlSearchActive(true);
    try {
      const pls = await searchPlaylists(plSearch.trim());
      setPlaylists((pls || []).filter(Boolean));
    } catch (e) {
      setPlaylists([]);
    } finally {
      setLoadingPls(false);
    }
  };

  const clearPlSearch = () => {
    setPlSearch("");
    setPlSearchActive(false);
    setLoadingPls(true);
    apiGetPlaylists().then(pls => { setPlaylists(pls); setLoadingPls(false); });
  };

  // ── Sub-components ──
  const GoBtn = ({onClick, disabled}) => (
    <button onClick={onClick} disabled={disabled||loading}
      style={{flexShrink:0,padding:"8px 14px",background:(disabled||loading)?T.border:T.accent,color:"white",border:"none",borderRadius:"6px",cursor:(disabled||loading)?"not-allowed":"pointer",fontWeight:"700",fontSize:"12px",display:"flex",alignItems:"center",gap:"5px",transition:"background 0.15s"}}>
      {loading?<Loader size={13}/>:<Search size={13}/>} {loading?"…":"Go"}
    </button>
  );

  const ErrorBanner = () => !error ? null : (
    <div style={{padding:"10px 12px",background:error==="auth"?T.accent+"18":T.navy,border:`1px solid ${error==="auth"?T.accent+"40":T.border}`,borderRadius:"7px",marginBottom:"10px",textAlign:"center"}}>
      {error==="auth"
        ? <><p style={{fontSize:"12px",color:T.accent,fontWeight:"700",marginBottom:"2px"}}>Session expired</p><p style={{fontSize:"11px",color:T.muted}}>Refresh and reconnect.</p></>
        : <p style={{fontSize:"12px",color:T.muted,fontWeight:"600"}}>Search failed — try again</p>
      }
    </div>
  );

  const ResultsList = ({empty}) => (
    <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
      {results.map(t => (
        <TrackItem key={t.id} track={t} onAdd={addedIds.includes(t.id)?null:()=>onAdd(t)} added={addedIds.includes(t.id)} stageType={stageType}/>
      ))}
      {!results.length && !loading && (
        <p style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"24px 0"}}>{empty||"No results yet"}</p>
      )}
    </div>
  );

  const tabStyle = (id) => ({
    flex:1, display:"flex", alignItems:"center", justifyContent:"center",
    padding:"7px 4px", fontSize:"11px", fontWeight:"700",
    background: tab===id ? T.accent : T.navy,
    color: tab===id ? "white" : T.muted,
    border: `1px solid ${tab===id?T.accent:T.border}`,
    borderRadius:"7px", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s",
    minHeight:"40px",
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{display:"flex",gap:"4px",marginBottom:"12px"}}>
        {[["track","🔍 Track"],["genre","🎸 Genre"],["playlist","📋 List"],["bpm","⏱ BPM"]].map(([id,lbl])=>(
          <button key={id} style={tabStyle(id)} onClick={()=>switchTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── Track ── */}
      {tab==="track" && (
        <div>
          <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
            <Input type="text" placeholder="Song, artist, album…" value={q} onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&runQuery(q)} autoComplete="off"/>
            <GoBtn onClick={()=>runQuery(q)}/>
          </div>
          {stageType && SCFG[stageType]?.bpmMin && results.length>0 && (
            <p style={{fontSize:"10px",color:T.muted,marginBottom:"8px"}}>
              🎵 Target: <span style={{color:bpmColor((SCFG[stageType].bpmMin+SCFG[stageType].bpmMax)/2),fontWeight:"700"}}>{SCFG[stageType].bpmMin}–{SCFG[stageType].bpmMax} BPM</span>
            </p>
          )}
          <ErrorBanner/>
          <ResultsList empty="Type a song or artist and press Go"/>
        </div>
      )}

      {/* ── Genre ── */}
      {tab==="genre" && (
        <div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"10px"}}>
            {SPOTIFY_GENRES.map(g => (
              <button key={g} onClick={()=>setSelGenre(g===selGenre?"":g)}
                style={{padding:"4px 9px",fontSize:"10px",fontWeight:"700",borderRadius:"14px",cursor:"pointer",transition:"all 0.15s",
                  background:selGenre===g?T.accent+"30":"transparent",
                  color:selGenre===g?T.accent:T.muted,
                  border:`1px solid ${selGenre===g?T.accent:T.border}`}}>
                {g}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
            <Input type="text" placeholder="Filter by artist / title (optional)…" value={genreQ}
              onChange={e=>setGenreQ(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&runQuery(selGenre?`genre:"${selGenre}" ${genreQ}`:genreQ)}/>
            <GoBtn onClick={()=>runQuery(selGenre?`genre:"${selGenre}" ${genreQ}`:genreQ)} disabled={!selGenre&&!genreQ}/>
          </div>
          {!selGenre && <p style={{fontSize:"11px",color:T.muted,textAlign:"center",padding:"10px 0 4px"}}>Pick a genre above to search</p>}
          <ErrorBanner/>
          <ResultsList/>
        </div>
      )}

      {/* ── Playlist ── */}
      {tab==="playlist" && (
        <div>
          {!selPl ? (
            <>
              {onSmartDistribute && (
                <div style={{marginBottom:"12px",padding:"12px 14px",background:T.accent+"12",border:`1px solid ${T.accent}30`,borderRadius:"9px",display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:T.text,marginBottom:"2px"}}>⚡ Smart Distribute</p>
                    <p style={{fontSize:"10px",color:T.muted,lineHeight:"1.4"}}>Import a playlist and auto-distribute songs across all stages by duration</p>
                  </div>
                  <button onClick={onSmartDistribute}
                    style={{flexShrink:0,padding:"7px 14px",background:T.accent,color:"white",border:"none",borderRadius:"7px",cursor:"pointer",fontSize:"11px",fontWeight:"700",whiteSpace:"nowrap"}}>
                    Go
                  </button>
                </div>
              )}
              <div style={{display:"flex",gap:"6px",marginBottom:"6px"}}>
                <Input type="text" placeholder="Search Spotify playlists…" value={plSearch}
                  onChange={e=>setPlSearch(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&searchSpotifyPlaylists()}/>
                <button onClick={searchSpotifyPlaylists} disabled={loadingPls||!plSearch.trim()}
                  style={{flexShrink:0,padding:"8px 12px",background:(!plSearch.trim()||loadingPls)?T.border:T.accent,color:"white",border:"none",borderRadius:"6px",cursor:(!plSearch.trim()||loadingPls)?"not-allowed":"pointer",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px"}}>
                  {loadingPls?<Loader size={13}/>:<Search size={13}/>}
                </button>
              </div>
              {plSearchActive && (
                <button onClick={clearPlSearch}
                  style={{background:"none",border:"none",cursor:"pointer",color:T.accent,fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",marginBottom:"8px",padding:"0"}}>
                  <ArrowLeft size={11}/> My playlists
                </button>
              )}
              {loadingPls
                ? <div style={{textAlign:"center",padding:"24px"}}><Loader size={18} color={T.muted}/></div>
                : playlists.length
                  ? <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                      {(playlists || []).filter(Boolean).map(pl => {
                        const imgUrl = pl.images?.[0]?.url;
                        const count  = pl.tracks?.total ?? pl.items?.total ?? 0;
                        const myUid  = localStorage.getItem("sp_uid");
                        const notMine = plSearchActive && myUid && pl.owner?.id && pl.owner.id !== myUid;
                        return (
                          <div key={pl.id} onClick={()=>openPlaylist(pl)}
                            style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:T.navy,borderRadius:"7px",cursor:"pointer",border:`1px solid ${notMine ? T.accent+"40" : "transparent"}`,transition:"border-color 0.15s",opacity:notMine?0.75:1}}
                            onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent+"60"}
                            onMouseLeave={e=>e.currentTarget.style.borderColor=notMine?T.accent+"40":"transparent"}>
                            {imgUrl
                              ? <img src={imgUrl} style={{width:"36px",height:"36px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt="pl"/>
                              : <div style={{width:"36px",height:"36px",borderRadius:"5px",background:T.border,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={13} color={T.muted}/></div>
                            }
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
                                <p style={{fontSize:"12px",fontWeight:"700",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pl.name}</p>
                                {notMine && <span title="Owned by another user — may not be accessible" style={{fontSize:"9px",fontWeight:"700",color:T.accent,background:T.accent+"20",borderRadius:"3px",padding:"1px 4px",flexShrink:0,whiteSpace:"nowrap"}}>NOT YOURS</span>}
                              </div>
                              <p style={{fontSize:"10px",color:T.muted}}>{count} tracks{pl.owner?.display_name?` · ${pl.owner.display_name}`:""}</p>
                            </div>
                            <ChevronRight size={13} color={T.muted}/>
                          </div>
                        );
                      })}
                    </div>
                  : <p style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"24px 0"}}>
                      {plSearchActive ? `No playlists found for "${plSearch}"` : "Search above or connect Spotify to see your playlists"}
                    </p>
              }
            </>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
                <button onClick={()=>{setSelPl(null);setPlTracks([]);setPlDenied(false);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",fontWeight:"700"}}>
                  <ArrowLeft size={14}/> Back
                </button>
                <p style={{fontSize:"12px",fontWeight:"700",color:T.text,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selPl.name}</p>
              </div>
              {loadingTr
                ? <div style={{textAlign:"center",padding:"24px"}}><Loader size={18} color={T.muted}/></div>
                : plDenied
                  ? <div style={{textAlign:"center",padding:"20px 16px"}}>
                      <p style={{fontSize:"22px",marginBottom:"8px"}}>🔒</p>
                      <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"6px"}}>Playlist not accessible</p>
                      <p style={{fontSize:"11px",color:T.muted,lineHeight:"1.5",marginBottom:"14px"}}>
                        {typeof plDenied === "string" && plDenied !== "Forbidden"
                          ? plDenied
                          : "Spotify only allows track access for playlists you own. To use this playlist, import its songs into one of your own Spotify playlists, then access it from 'My playlists' here."}
                      </p>
                      <button onClick={()=>{setSelPl(null);setPlTracks([]);setPlDenied(false);}}
                        style={{padding:"7px 14px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>
                        ← Back
                      </button>
                    </div>
                  : plTracks.length
                    ? <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                        {plTracks.map(t => (
                          <TrackItem key={t.id} track={t} onAdd={addedIds.includes(t.id)?null:()=>onAdd(t)} added={addedIds.includes(t.id)} stageType={stageType}/>
                        ))}
                      </div>
                    : <p style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"24px 0"}}>No playable tracks</p>
              }
            </>
          )}
        </div>
      )}

      {/* ── BPM ── */}
      {tab==="bpm" && (
        <div>
          <div style={{marginBottom:"12px"}}>
            <p style={{fontSize:"10px",color:T.muted,marginBottom:"10px"}}>
              Pick a genre to find tracks — BPM shown where available. The BPM range sets a target to help you choose.
            </p>
            <div style={{display:"flex",gap:"10px",alignItems:"flex-end",marginBottom:"12px"}}>
              <div style={{flex:1}}>
                <p style={{fontSize:"9px",color:T.muted,marginBottom:"3px"}}>Target Min BPM</p>
                <Input type="number" value={bpmMin} min="60" max="220"
                  onChange={e=>setBpmMin(parseInt(e.target.value)||80)} style={{textAlign:"center",fontWeight:"700"}}/>
              </div>
              <span style={{color:T.muted,paddingBottom:"9px"}}>–</span>
              <div style={{flex:1}}>
                <p style={{fontSize:"9px",color:T.muted,marginBottom:"3px"}}>Target Max BPM</p>
                <Input type="number" value={bpmMax} min="60" max="220"
                  onChange={e=>setBpmMax(parseInt(e.target.value)||160)} style={{textAlign:"center",fontWeight:"700"}}/>
              </div>
            </div>
            <p style={{fontSize:"10px",color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px"}}>Genre</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"12px"}}>
              {["workout","electronic","hip-hop","dance","pop","rock","edm","r-n-b","afrobeat","latin"].map(g=>(
                <button key={g} onClick={()=>setBpmSeedGenre(g)}
                  style={{padding:"4px 8px",fontSize:"10px",fontWeight:"700",borderRadius:"12px",cursor:"pointer",
                    background:bpmSeedGenre===g?T.accent+"30":"transparent",
                    color:bpmSeedGenre===g?T.accent:T.muted,
                    border:`1px solid ${bpmSeedGenre===g?T.accent:T.border}`}}>
                  {g}
                </button>
              ))}
            </div>
            <button onClick={runBpmSearch} disabled={loading||!bpmSeedGenre}
              style={{width:"100%",padding:"10px",background:(loading||!bpmSeedGenre)?T.border:T.accent,color:"white",border:"none",borderRadius:"7px",cursor:(loading||!bpmSeedGenre)?"not-allowed":"pointer",fontWeight:"700",fontSize:"13px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              {loading?<><Loader size={14}/> Searching…</>:<><Search size={14}/> Find {bpmSeedGenre||"genre"} tracks</>}
            </button>
          </div>
          <ErrorBanner/>
          <ResultsList empty="Pick a genre above and click Find Tracks"/>
        </div>
      )}
    </div>
  );
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────
function DashboardScreen({onNewSession, onViewTemplates, onViewCalendar, onViewAnalytics, onViewGlossary, onViewLibrary, profile, sessionHistory=[]}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const first = profile?.display_name?.split(" ")?.[0] || null;

  // Compute real stats from sessionHistory
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStr = startOfWeek.toISOString().slice(0,10);
  const monthStr = startOfMonth.toISOString().slice(0,10);

  const sessionsThisWeek = sessionHistory.filter(s => s.date >= weekStr).length;
  const hoursThisMonth = (sessionHistory.filter(s => s.date >= monthStr).reduce((a,s) => a + (s.durMin||0), 0) / 60).toFixed(1);

  // Day streak: count consecutive days with sessions going backwards from today
  const todayStr = now.toISOString().slice(0,10);
  const sessionDates = new Set(sessionHistory.map(s => s.date));
  let streak = 0;
  for (let d = new Date(now); ; d.setDate(d.getDate()-1)) {
    const ds = d.toISOString().slice(0,10);
    if (sessionDates.has(ds)) { streak++; } else { if (ds < todayStr) break; }
  }

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"32px",maxWidth:"960px",margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
      {/* Hero */}
      <div style={{marginBottom:isMobile?"18px":"28px"}}>
        <h1 style={{fontSize:isMobile?"22px":"30px",fontWeight:"800",color:T.text,marginBottom:"6px"}}>
          Welcome back{first ? `, ${first}` : ""}! 👋
        </h1>
        <p style={{fontSize:isMobile?"13px":"14px",color:T.muted}}>Ready to crush today's session?</p>
      </div>

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr 1fr":"repeat(3,1fr)",gap:isMobile?"8px":"14px",marginBottom:isMobile?"18px":"28px"}}>
        <StatCard icon="🏋️" label="Sessions This Week" value={String(sessionsThisWeek)} color={T.accent}/>
        <StatCard icon="⏱️" label="Hours This Month"   value={hoursThisMonth + "h"}     color={T.green}/>
        <StatCard icon="🔥" label="Day Streak"          value={String(streak)}           color="#F97316"/>
      </div>

      {/* CTA */}
      <button onClick={onNewSession} style={{width:"100%",padding:isMobile?"14px":"17px",background:T.accent,color:"white",border:"none",borderRadius:"10px",fontSize:isMobile?"14px":"16px",fontWeight:"700",cursor:"pointer",marginBottom:isMobile?"20px":"32px",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px"}}>
        <Plus size={isMobile?17:20}/> Start New Session
      </button>

      {/* Quick nav tiles */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?"8px":"12px",marginBottom:isMobile?"20px":"32px"}}>
        {[
          { icon:<Calendar size={isMobile?18:22}/>, label:"Calendar",  onClick:onViewCalendar  },
          { icon:<BarChart2 size={isMobile?18:22}/>, label:"Analytics", onClick:onViewAnalytics },
          { icon:<BookOpen size={isMobile?18:22}/>, label:"Glossary",  onClick:onViewGlossary  },
          { icon:<BookOpen size={isMobile?18:22}/>, label:"Library",   onClick:onViewLibrary   },
        ].map(item => (
          <div key={item.label} onClick={item.onClick} style={{padding:isMobile?"12px 8px":"18px",background:T.card,borderRadius:"10px",border:`1px solid ${T.border}`,cursor:"pointer",textAlign:"center"}}>
            <div style={{color:T.accent,marginBottom:"6px",display:"flex",justifyContent:"center"}}>{item.icon}</div>
            <p style={{fontSize:isMobile?"11px":"13px",fontWeight:"700",color:T.text}}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* Class Templates */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
        <h2 style={{fontSize:isMobile?"15px":"18px",fontWeight:"700",color:T.text}}>Class Templates</h2>
        <button onClick={onViewTemplates} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:"13px",fontWeight:"700"}}>View all →</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?"8px":"12px"}}>
        {Object.entries(WORKOUT_LIBRARY).slice(0,isMobile?4:8).map(([key,cls]) => (
          <div key={key} onClick={onViewTemplates} style={{padding:isMobile?"12px 10px":"16px",background:T.card,borderRadius:"12px",border:`1px solid ${T.border}`,cursor:"pointer",position:"relative",overflow:"hidden",textAlign:"center",transition:"border-color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=cls.color}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:cls.color}}/>
            <div style={{fontSize:isMobile?"26px":"30px",marginBottom:"6px"}}>{cls.icon}</div>
            <p style={{fontSize:isMobile?"11px":"12px",fontWeight:"700",color:T.text}}>{cls.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TemplatesScreen ──────────────────────────────────────────────────────────
function TemplatesScreen({onSelectClassStyle, onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const [selClassType, setSelClassType] = useState(null);
  const [selStyle, setSelStyle]         = useState(null);
  const [search, setSearch]             = useState("");
  const classTypes = Object.entries(WORKOUT_LIBRARY);

  const filteredTypes = search
    ? classTypes.filter(([,cls]) => cls.label.toLowerCase().includes(search.toLowerCase()) || cls.description.toLowerCase().includes(search.toLowerCase()))
    : classTypes;

  // When class type changes, default to first style
  const handleTypeClick = key => {
    setSelClassType(key);
    const firstSub = Object.keys(WORKOUT_LIBRARY[key].subTypes)[0];
    setSelStyle(firstSub || null);
  };

  const selCls = selClassType ? WORKOUT_LIBRARY[selClassType] : null;

  const totalStyles = classTypes.reduce((a,[,cls])=>a+Object.keys(cls.subTypes).length,0);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Page header */}
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:"11px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>CLASS TEMPLATES</p>
          <p style={{fontSize:"12px",color:T.muted}}>Where a class starts — pick a discipline and a style, Jungle pre-fills the stages, exercises and soundtrack shape</p>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── Left panel: class type grid ── */}
        <div style={{flex:isMobile?1:"1.5",display:"flex",flexDirection:"column",overflow:"hidden",borderRight:isMobile?"none":`1px solid ${T.border}`}}>
          {/* Panel header */}
          <div style={{flexShrink:0,padding:"18px 22px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
            <div>
              <p style={{fontSize:"20px",fontWeight:"700",color:T.text,fontFamily:"'Space Grotesk',sans-serif"}}>Choose a class type</p>
              <p style={{fontSize:"12px",color:T.muted}}>{classTypes.length} disciplines · {totalStyles}+ ready-made styles</p>
            </div>
            {/* Search */}
            <div style={{display:"flex",alignItems:"center",gap:"8px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"999px",padding:"8px 16px",minWidth:0,flex:"0 0 220px"}}>
              <Search size={14} color={T.muted}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search templates…"
                style={{background:"none",border:"none",outline:"none",color:T.text,fontSize:"13px",width:"100%"}}/>
            </div>
          </div>

          {/* Cards grid */}
          <div style={{flex:1,overflowY:"auto",padding:"0 22px 22px"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":isTablet?"1fr 1fr":"1fr 1fr 1fr",gap:"12px"}}>
              {filteredTypes.map(([key,cls]) => {
                const isSelected = selClassType === key;
                return (
                  <div key={key} onClick={()=>handleTypeClick(key)}
                    style={{
                      padding:"18px",borderRadius:"14px",cursor:"pointer",
                      position:"relative",overflow:"hidden",
                      border:isSelected?`1px solid ${cls.color}`:`1px solid ${T.border}`,
                      background:isSelected?`linear-gradient(160deg,${T.navy},${T.card})`:`${T.card}`,
                      boxShadow:isSelected?`0 0 0 3px ${cls.color}18`:"none",
                      transition:"border-color 0.2s,box-shadow 0.2s"
                    }}
                    onMouseEnter={e=>{if(!isSelected){e.currentTarget.style.borderColor=cls.color+"90"; e.currentTarget.style.filter="brightness(1.07)";}}}
                    onMouseLeave={e=>{if(!isSelected){e.currentTarget.style.borderColor=T.border; e.currentTarget.style.filter="brightness(1)";}}}
                  >
                    {/* 3px top accent bar */}
                    <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:cls.color,borderRadius:"14px 14px 0 0"}}/>

                    {/* Icon tile */}
                    <div style={{
                      width:"40px",height:"40px",borderRadius:"11px",
                      background:`${cls.color}20`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:"20px",marginBottom:"12px",marginTop:"4px"
                    }}>{cls.icon}</div>

                    <p style={{fontSize:"15px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>{cls.label}</p>
                    <p style={{fontSize:"11px",color:T.muted,lineHeight:"1.5",marginBottom:"14px"}}>{cls.description}</p>

                    {/* Footer */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:"11px",color:cls.color,fontWeight:"600"}}>{Object.keys(cls.subTypes).length} styles</span>
                      <ChevronRight size={14} color={isSelected?cls.color:T.muted}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right panel: style picker ── (hidden on mobile when no selection) */}
        {(!isMobile || selClassType) && (
          <div style={{
            width:isMobile?"100%":"380px",flexShrink:0,
            display:"flex",flexDirection:"column",overflow:"hidden",
            background:T.card,
            position:isMobile?"fixed":"relative",
            inset:isMobile?"0":undefined,
            zIndex:isMobile?600:undefined
          }}>
            {selCls ? (
              <>
                {/* Right panel header */}
                <div style={{flexShrink:0,padding:"20px 22px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"flex-start",gap:"14px"}}>
                  <div style={{
                    width:"40px",height:"40px",borderRadius:"11px",flexShrink:0,
                    background:`${selCls.color}20`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px"
                  }}>{selCls.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"16px",fontWeight:"700",color:T.text}}>{selCls.label}</p>
                    <p style={{fontSize:"12px",color:T.muted}}>Pick a style to pre-fill your class</p>
                  </div>
                  {isMobile && (
                    <button onClick={()=>setSelClassType(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"2px"}}><X size={18}/></button>
                  )}
                </div>

                {/* Styles list */}
                <div style={{flex:1,overflowY:"auto",padding:"14px"}}>
                  {Object.entries(selCls.subTypes).map(([subKey,sub]) => {
                    const stageCount = (CLASS_STAGE_TEMPLATES[selClassType]?.[subKey] || []).length;
                    const isSelStyle = selStyle === subKey;
                    return (
                      <div key={subKey} onClick={()=>setSelStyle(subKey)}
                        style={{
                          padding:"16px",borderRadius:"11px",marginBottom:"8px",cursor:"pointer",
                          border:isSelStyle?`1px solid ${selCls.color}`:`1px solid ${T.border}`,
                          background:isSelStyle?`linear-gradient(160deg,${T.navy},${T.card})`:"transparent",
                          boxShadow:isSelStyle?`0 0 0 3px ${selCls.color}12`:"none",
                          transition:"border-color 0.15s,background 0.15s"
                        }}
                        onMouseEnter={e=>{if(!isSelStyle){e.currentTarget.style.borderColor=selCls.color+"60";}}}
                        onMouseLeave={e=>{if(!isSelStyle){e.currentTarget.style.borderColor=T.border;}}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
                          <p style={{fontSize:"14px",fontWeight:"700",color:T.text}}>{sub.label}</p>
                          {stageCount>0 && <span style={{fontSize:"10px",padding:"2px 8px",background:`${selCls.color}25`,color:selCls.color,borderRadius:"999px",fontWeight:"700"}}>{stageCount} stages</span>}
                        </div>
                        <p style={{fontSize:"12px",color:T.muted,lineHeight:"1.5"}}>{sub.description}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Sticky CTA */}
                <div style={{flexShrink:0,padding:"14px",borderTop:`1px solid ${T.border}`}}>
                  <button
                    disabled={!selStyle}
                    onClick={()=>{ if(selStyle){ onSelectClassStyle(selClassType,selStyle); setSelClassType(null); }}}
                    style={{
                      width:"100%",padding:"14px",borderRadius:"10px",border:"none",cursor:selStyle?"pointer":"not-allowed",
                      background:selStyle?`linear-gradient(135deg,${selCls.color},${selCls.color}CC)`:`${T.border}`,
                      color:selStyle?"#fff":T.muted,fontSize:"14px",fontWeight:"700",
                      transition:"opacity 0.15s"
                    }}>
                    {selStyle ? `Build from ${selCls.subTypes[selStyle]?.label||selStyle}` : "Select a style above"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center",gap:"12px"}}>
                <div style={{fontSize:"40px",opacity:0.3}}>👈</div>
                <p style={{fontSize:"14px",fontWeight:"600",color:T.muted}}>Select a class type</p>
                <p style={{fontSize:"12px",color:T.muted,lineHeight:"1.5"}}>Pick a discipline on the left to see available styles</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AnalyticsScreen ──────────────────────────────────────────────────────────
// ─── IntegrationsScreen ───────────────────────────────────────────────────────
function IntegrationsScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;

  const integrations = [
    {
      name: "Spotify",
      connected: true,
      iconBg: "#1DB954",
      detail: "Studio · Premium",
      desc: "Powers the Auto-DJ. Pulls BPM & audio analysis, plays from studio Premium account.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.62.62 0 0 1-.86.2c-2.34-1.43-5.3-1.76-8.77-.96a.62.62 0 1 1-.28-1.21c3.8-.87 7.07-.5 9.7 1.11a.62.62 0 0 1 .2.86Zm1.23-2.74a.78.78 0 0 1-1.07.26c-2.68-1.65-6.77-2.13-9.94-1.16a.78.78 0 1 1-.45-1.49c3.63-1.1 8.13-.57 11.2 1.32a.78.78 0 0 1 .26 1.07Zm.1-2.85C14.83 8.96 9.4 8.78 6.3 9.72a.93.93 0 1 1-.54-1.79c3.56-1.08 9.56-.87 13.3 1.35a.94.94 0 0 1-.95 1.62Z"/>
        </svg>
      ),
    },
    {
      name: "ClassPass",
      connected: true,
      iconBg: "#0B1F3A",
      detail: "238 bookings / wk",
      desc: "Two-way booking sync. Inventory, spot allocation & no-show fees flow automatically.",
      iconText: "CP",
    },
    {
      name: "Wearables",
      connected: true,
      iconBg: "#FF2D55",
      detail: "HR zones live",
      desc: "Apple Health, Whoop & Garmin. Live heart-rate to the TV, recovery into RPE data.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 21s-7-4.35-9.5-8.5C.7 9.3 2 5.5 5.5 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7C19 16.65 12 21 12 21Z"/>
        </svg>
      ),
    },
    {
      name: "Calendar",
      connected: true,
      iconBg: "#fff",
      detail: "Google · Outlook",
      desc: "Trainer shifts & member bookings sync to Google / Outlook calendars both ways.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2">
          <rect x="3" y="4" width="18" height="17" rx="2"/>
          <path d="M3 9h18M8 2v4M16 2v4"/>
        </svg>
      ),
    },
    {
      name: "Stripe",
      connected: true,
      iconBg: "#635BFF",
      detail: "£48k / mo",
      desc: "Memberships, drop-ins & retail. Revenue lands in the analytics dashboard live.",
      iconText: "S",
    },
    {
      name: null, // placeholder "Browse more"
      connected: false,
      isPlaceholder: true,
    },
  ];

  const cols = isMobile ? 1 : isTablet ? 2 : 3;

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"32px",boxSizing:"border-box"}}>
      {/* Back */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"26px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"18px":"22px",fontWeight:"700",color:T.text,margin:0}}>Integrations</h2>
      </div>

      {/* Card */}
      <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:"18px",overflow:"hidden",maxWidth:"1200px",margin:"0 auto"}}>
        {/* Header row */}
        <div style={{padding:"24px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
          <div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"20px",fontWeight:"700",color:T.text}}>Connected apps</div>
            <div style={{fontSize:"12px",color:T.muted,marginTop:"3px"}}>6 active · syncs in real time</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"7px",fontSize:"12px",color:T.accent,padding:"7px 13px",borderRadius:"999px",background:"rgba(123,227,164,.1)",border:`1px solid ${T.accent}`}}>
            <div style={{width:"7px",height:"7px",borderRadius:"50%",background:T.accent}}/>
            All systems healthy
          </div>
        </div>

        {/* Grid */}
        <div style={{padding:"24px 28px",display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:"16px"}}>
          {integrations.map((item, idx) => {
            if (item.isPlaceholder) {
              return (
                <div key={idx} style={{border:`1px dashed ${T.border}`,borderRadius:"14px",padding:"18px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"10px",minHeight:"170px",cursor:"pointer"}}>
                  <div style={{width:"42px",height:"42px",borderRadius:"11px",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
                  </div>
                  <div style={{fontSize:"13px",fontWeight:"600",color:T.muted}}>Browse 40+ integrations</div>
                  <div style={{fontSize:"11px",color:T.muted,textAlign:"center"}}>Mailchimp · Mindbody · Slack · Zapier · Sonos</div>
                </div>
              );
            }
            const borderCol = item.connected ? T.accent : T.border;
            return (
              <div key={idx} style={{background:T.card,border:`1px solid ${borderCol}`,borderRadius:"14px",padding:"18px"}}>
                {/* Header row */}
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"13px"}}>
                  <div style={{width:"42px",height:"42px",borderRadius:"11px",background:item.iconBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"'Space Grotesk',sans-serif",fontWeight:"800",color:"#fff",fontSize:item.iconText?.length===1?"18px":"15px"}}>
                    {item.icon || item.iconText}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"14px",fontWeight:"700",color:T.text}}>{item.name}</div>
                    <div style={{fontSize:"11px",color:item.connected?T.accent:T.muted}}>
                      {item.connected ? "● Connected" : "○ Available"}
                    </div>
                  </div>
                </div>
                <div style={{fontSize:"12px",color:T.muted,lineHeight:"1.5",marginBottom:"14px"}}>{item.desc}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:"13px",borderTop:`1px solid ${T.border}`}}>
                  <span style={{fontSize:"11px",color:T.muted}}>{item.detail}</span>
                  {/* Toggle */}
                  <div style={{width:"38px",height:"22px",borderRadius:"11px",background:item.connected?T.accent:T.border,position:"relative",cursor:"pointer",flexShrink:0}}>
                    <div style={{position:"absolute",top:"2px",width:"18px",height:"18px",borderRadius:"50%",background:T.bg,transition:"left 0.2s",[item.connected?"right":"left"]:"2px"}}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnalyticsScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [timeFilter, setTimeFilter] = React.useState("12w");
  const [rpeTab, setRpeTab] = React.useState("distribution");

  const attendanceData = [
    {label:"W1",val:74},{label:"W2",val:81},{label:"W3",val:88},{label:"W4",val:72},
    {label:"W5",val:90},{label:"W6",val:86},{label:"W7",val:93},{label:"W8",val:78},
    {label:"W9",val:95},{label:"W10",val:82},{label:"W11",val:88},{label:"W12",val:91},
  ];
  const maxAttn = Math.max(...attendanceData.map(d=>d.val), 1);

  const classTypes = [
    {label:"HIIT",       pct:94, color:"#F59E0B"},
    {label:"Hyrox sim",  pct:88, color:"#22D3A6"},
    {label:"Strength Lab",pct:71, color:"#8B5CF6"},
    {label:"Spin",       pct:63, color:"#3B82F6"},
    {label:"Yoga / recovery",pct:48,color:"#10B981"},
  ];

  const kpis = [
    {label:"Active members",  value:"1,284", delta:"▲ 6.2% vs prev", up:true},
    {label:"Avg visits / wk", value:"3.4",   delta:"▲ 0.3",           up:true},
    {label:"Churn risk",      value:"47",    delta:"members flagged",  up:false, warn:true},
    {label:"Revenue / class", value:"£412",  delta:"▲ 9%",            up:true},
  ];

  const trainers = [
    {name:"Mara K.",  fill:"96%", nps:78, score:9.2},
    {name:"Dev R.",   fill:"91%", nps:74, score:8.8},
    {name:"Priya S.", fill:"79%", nps:69, score:8.1},
  ];

  const musicImpact = [
    {rank:1, track:"Pump It — Reso",        stat:"+18% return when played"},
    {rank:2, track:"Belters — C. Bland",    stat:"+14% return"},
    {rank:3, track:"Lose Control — T.Swims",stat:"+11% return"},
  ];

  const bpmByClass = [
    {label:"HIIT",     bpm:130, color:"#F59E0B"},
    {label:"Hyrox",    bpm:140, color:"#22D3A6"},
    {label:"Strength", bpm:95,  color:"#8B5CF6"},
    {label:"Spin",     bpm:126, color:"#3B82F6"},
    {label:"Yoga",     bpm:72,  color:"#10B981"},
  ];

  const rpeData = [5,6,7,8,9,10].map(v=>({v,count:v===7?38:v===8?29:v===6?16:v===9?11:v===5?4:2}));
  const maxRpe = Math.max(...rpeData.map(d=>d.count));

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"22px",flexWrap:"wrap",gap:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"18px":"20px",fontWeight:"700",color:T.text,margin:0}}>Studio analytics</h2>
            <div style={{fontSize:"12px",color:T.muted,marginTop:"2px"}}>Barry's · Shoreditch</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden",fontSize:"12px"}}>
            {[["4w","4 weeks"],["12w","12 weeks"],["year","Year"]].map(([k,lbl])=>(
              <div key={k} onClick={()=>setTimeFilter(k)}
                style={{padding:"8px 14px",background:timeFilter===k?T.navy:"transparent",color:timeFilter===k?T.text:T.muted,fontWeight:timeFilter===k?"600":"400",cursor:"pointer"}}>
                {lbl}
              </div>
            ))}
          </div>
          <button style={{border:`1px solid ${T.border}`,background:"transparent",color:T.text,fontWeight:"600",fontSize:"13px",padding:"8px 15px",borderRadius:"9px",cursor:"pointer",display:"flex",alignItems:"center",gap:"7px"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${isTablet?2:4},1fr)`,gap:"12px",marginBottom:"18px"}}>
        {kpis.map((k,i)=>(
          <div key={i} style={{background:T.card,border:`1px solid ${k.warn?"#F59E0B40":T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",letterSpacing:"1px",color:T.muted,fontWeight:"700",textTransform:"uppercase"}}>{k.label}</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"28px",fontWeight:"700",marginTop:"6px",color:k.warn?"#F59E0B":T.text}}>{k.value}</div>
            <div style={{fontSize:"12px",marginTop:"3px",color:k.warn?"#F59E0B":k.up?T.accent:"#EF4444"}}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.4fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Attendance chart */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text}}>Attendance & fill rate</div>
            <div style={{fontSize:"11px",color:T.muted,display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{width:"8px",height:"8px",borderRadius:"2px",background:T.accent,display:"inline-block"}}/>Attendance
              <span style={{marginLeft:"8px",width:"8px",height:"8px",borderRadius:"2px",background:"#E0B85B",display:"inline-block"}}/>Fill %
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:isMobile?"3px":"6px",height:"100px",marginBottom:"8px"}}>
            {attendanceData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:`linear-gradient(to top, ${T.accent}cc, ${T.green}66)`,
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.val/maxAttn)*90}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"9px",color:T.muted}}>{d.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Class type distribution */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"16px"}}>Most-booked class types</div>
          <div style={{display:"flex",flexDirection:"column",gap:"11px"}}>
            {classTypes.map((item,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                  <span style={{fontSize:"12px",color:T.text,fontWeight:"600"}}>{item.label}</span>
                  <span style={{fontSize:"12px",color:item.color,fontWeight:"700"}}>{item.pct}%</span>
                </div>
                <div style={{height:"6px",background:T.navy,borderRadius:"3px",overflow:"hidden"}}>
                  <div style={{width:`${item.pct}%`,height:"100%",background:item.color,borderRadius:"3px"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RPE + Trainers row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* RPE Distribution */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text}}>RPE distribution</div>
              <div style={{fontSize:"11px",color:T.muted,marginTop:"2px"}}>avg <span style={{color:T.accent,fontWeight:"700"}}>7.4</span> · reported exertion · last 12 wks</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:"10px",height:"90px",marginBottom:"8px"}}>
            {rpeData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:d.v>=8?T.accent+"cc":d.v<=5?"#EF4444aa":"#E0B85Baa",
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.count/maxRpe)*80}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"10px",color:T.muted}}>{d.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trainer performance */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Trainer performance</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {trainers.map((t,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",background:T.navy,borderRadius:"10px",border:`1px solid ${T.border}`}}>
                <div style={{width:"34px",height:"34px",borderRadius:"50%",background:T.accent+"22",border:`1px solid ${T.accent}40`,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,fontSize:"12px",fontWeight:"700",flexShrink:0}}>
                  {t.name.split(" ")[0][0]}{t.name.split(" ")[1]?.[0]||""}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:T.text}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:T.muted}}>{t.fill} fill · NPS {t.nps}</div>
                </div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.accent}}>{t.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Music impact + BPM by class */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.2fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Music that fills rooms */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Music that fills rooms</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {musicImpact.map((m,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<musicImpact.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{width:"24px",height:"24px",borderRadius:"50%",background:T.accent+"22",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,fontSize:"11px",fontWeight:"800",flexShrink:0}}>{m.rank}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.track}</div>
                </div>
                <div style={{fontSize:"12px",color:T.accent,fontWeight:"700",whiteSpace:"nowrap"}}>{m.stat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best BPM by class */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Best BPM by class</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {bpmByClass.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:b.color}}/>
                  <span style={{fontSize:"13px",fontWeight:"600",color:T.text}}>{b.label}</span>
                </div>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"16px",fontWeight:"700",color:b.color}}>{b.bpm} <span style={{fontSize:"11px",color:T.muted,fontWeight:"400"}}>BPM</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Churn risk members */}
      <div style={{background:T.card,border:`1px solid #F59E0B40`,borderRadius:"14px",padding:"18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text}}>Churn risk</div>
            <div style={{fontSize:"11px",color:"#F59E0B",marginTop:"2px"}}>47 members flagged · no visit in 10+ days</div>
          </div>
          <button style={{padding:"7px 14px",background:"#F59E0B20",border:"1px solid #F59E0B50",borderRadius:"7px",cursor:"pointer",color:"#F59E0B",fontSize:"12px",fontWeight:"700"}}>Message all</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {[
            {name:"Sarah M.",  lastSeen:"12d ago", missed:3, type:"HIIT"},
            {name:"James T.",  lastSeen:"18d ago", missed:4, type:"Hyrox"},
            {name:"Priya K.",  lastSeen:"9d ago",  missed:2, type:"Yoga"},
            {name:"Marcus L.", lastSeen:"14d ago", missed:5, type:"Strength"},
          ].map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px"}}>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"#F59E0B20",border:"1px solid #F59E0B40",display:"flex",alignItems:"center",justifyContent:"center",color:"#F59E0B",fontSize:"11px",fontWeight:"700",flexShrink:0}}>
                {m.name.split(" ").map(n=>n[0]).join("")}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",fontWeight:"600",color:T.text}}>{m.name}</div>
                <div style={{fontSize:"11px",color:T.muted}}>Last seen {m.lastSeen} · {m.missed} missed · {m.type}</div>
              </div>
              <button style={{padding:"5px 12px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",cursor:"pointer",color:T.text,fontSize:"11px",fontWeight:"600",whiteSpace:"nowrap"}}>Contact</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── GlossaryScreen ───────────────────────────────────────────────────────────
function GlossaryScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const [openGroups, setOpenGroups] = useState({"Upper Body":true});
  const [search, setSearch] = useState("");

  const allGroups = Object.entries(GLOSSARY);
  const totalMovements = allGroups.reduce((a,[,exs])=>a+exs.length,0);

  const toggleGroup = grp => setOpenGroups(prev=>({...prev,[grp]:!prev[grp]}));

  const diffStyle = diff => {
    if (diff==="Advanced")     return {bg:"rgba(123,227,164,.18)",color:T.accent||"#7BE3A4"};
    if (diff==="Intermediate") return {bg:"rgba(224,184,91,.15)", color:"#E0B85B"};
    return                            {bg:"rgba(123,227,164,.15)",color:T.accent||"#7BE3A4"};
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Page header bar */}
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div>
          <p style={{fontSize:"11px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>EXERCISE GLOSSARY</p>
          <p style={{fontSize:"12px",color:T.muted}}>Coaching reference — every movement with target muscles, difficulty and a one-line cue</p>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px 28px"}}>
        <div style={{maxWidth:"1200px",margin:"0 auto"}}>
          {/* Search bar + count */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",
            padding:"12px 18px",marginBottom:"20px",gap:"12px"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:"10px",flex:1}}>
              <Search size={15} color={T.muted}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search exercises or muscles…"
                style={{background:"none",border:"none",outline:"none",color:T.text,fontSize:"14px",width:"100%"}}/>
            </div>
            <span style={{fontSize:"12px",color:T.muted,flexShrink:0,fontWeight:"600"}}>
              {allGroups.length} groups · {totalMovements} movements
            </span>
          </div>

          {/* Accordion groups */}
          {allGroups.map(([grp, exs]) => {
            const filtered = search
              ? exs.filter(e=>e.name.toLowerCase().includes(search.toLowerCase())||e.muscles.toLowerCase().includes(search.toLowerCase()))
              : exs;
            if (!filtered.length) return null;
            const isOpen = search ? true : !!openGroups[grp];
            return (
              <div key={grp} style={{marginBottom:"10px",background:T.card,borderRadius:"12px",border:`1px solid ${T.border}`,overflow:"hidden"}}>
                {/* Group header */}
                <button onClick={()=>toggleGroup(grp)}
                  style={{
                    width:"100%",padding:"15px 20px",background:"none",border:"none",cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"space-between"
                  }}>
                  <span style={{fontSize:"14px",fontWeight:"700",color:isOpen?T.text:T.muted}}>
                    {grp} <span style={{fontSize:"12px",fontWeight:"400",color:T.muted,marginLeft:"6px"}}>({filtered.length})</span>
                  </span>
                  <ChevronRight size={16} color={isOpen?T.accent:T.muted}
                    style={{transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}/>
                </button>

                {/* Exercise cards */}
                {isOpen && (
                  <div style={{
                    display:"grid",
                    gridTemplateColumns:isMobile?"1fr":"1fr 1fr",
                    gap:"1px",
                    borderTop:`1px solid ${T.border}`
                  }}>
                    {filtered.map((ex,i) => {
                      const ds = diffStyle(ex.diff);
                      return (
                        <div key={i} style={{
                          padding:"15px 18px",
                          background:T.card,
                          borderRight: (!isMobile && i%2===0) ? `1px solid ${T.border}` : "none",
                          borderBottom: i < filtered.length - (isMobile?1:2) ? `1px solid ${T.border}` : "none"
                        }}>
                          <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>{ex.name}</p>
                          <p style={{fontSize:"11px",color:T.muted,marginBottom:"8px"}}>
                            {ex.muscles.split(/[,·]/).map(m=>m.trim()).join(" · ")}
                          </p>
                          <span style={{
                            display:"inline-block",fontSize:"10px",fontWeight:"700",
                            padding:"2px 8px",borderRadius:"6px",marginBottom:"8px",
                            background:ds.bg,color:ds.color
                          }}>{ex.diff}</span>
                          <p style={{fontSize:"12px",color:T.accent,fontStyle:"italic",lineHeight:"1.45",margin:0}}>
                            "{ex.cues}"
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CalendarScreen (Planning & Schedule Board) ───────────────────────────────
function CalendarScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [viewMode, setViewMode] = React.useState("grid"); // "grid" | "heat"
  const [dismissedTips, setDismissedTips] = React.useState([]);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];
  const SLOTS = ["06:00","09:00","12:00","18:00","19:30"];
  const SLOT_LABELS = ["Morning","Mid-Morning","Lunch","Evening","Late"];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay() + 1);

  const dayDates = DAYS.map((d,i)=>{
    const dt = new Date(startOfWeek);
    dt.setDate(startOfWeek.getDate() + i);
    return dt.getDate();
  });

  const CAT_COLOR = {HIIT:"#F59E0B",Strength:"#8B5CF6",Hyrox:"#22D3A6",Circuit:"#F97316",Spin:"#3B82F6",Yoga:"#10B981",Boxing:"#EC4899",Mobility:"#5BD0C0"};

  const schedule = {
    "Mon-06:00": {name:"Sunrise HIIT", coach:"Mara", fill:96, type:"HIIT", dur:"45m"},
    "Mon-09:00": {name:"Flow Yoga",    coach:"Priya",fill:64, type:"Yoga", dur:"50m"},
    "Mon-18:00": {name:"Hyrox Sim",   coach:"Dev",  fill:92, type:"Hyrox",dur:"60m"},
    "Tue-06:00": {name:"Strength Lab", coach:"Mara", fill:100,type:"Strength",dur:"45m"},
    "Tue-09:00": {name:"Sunrise HIIT", coach:"Mara", fill:88, type:"HIIT", dur:"45m"},
    "Tue-18:00": {name:"Spin Ride",    coach:"Dev",  fill:71, type:"Spin", dur:"45m"},
    "Tue-19:30": {name:"Boxing",       coach:"Jo",   fill:55, type:"Boxing",dur:"45m"},
    "Wed-06:00": {name:"Sunrise HIIT", coach:"Jo",   fill:90, type:"HIIT", dur:"45m"},
    "Wed-09:00": {name:"Mobility",     coach:"Priya",fill:58, type:"Mobility",dur:"45m"},
    "Wed-12:00": {name:"Hyrox Sim",   coach:"Dev",  fill:94, type:"Hyrox",dur:"60m"},
    "Wed-18:00": {name:"Strength Lab", coach:"Mara", fill:98, type:"Strength",dur:"45m"},
    "Thu-06:00": {name:"Sunrise HIIT", coach:"Mara", fill:86, type:"HIIT", dur:"45m"},
    "Thu-18:00": {name:"Hyrox Sim",   coach:"Dev",  fill:89, type:"Hyrox",dur:"60m"},
    "Thu-19:30": {name:"Recovery",     coach:"Jo",   fill:52, type:"Yoga", dur:"45m"},
    "Fri-06:00": {name:"Sunrise HIIT", coach:"Mara", fill:91, type:"HIIT", dur:"45m"},
    "Fri-09:00": {name:"Flow Yoga",    coach:"Priya",fill:61, type:"Yoga", dur:"50m"},
    "Fri-12:00": {name:"Hyrox Sim",   coach:"Dev",  fill:95, type:"Hyrox",dur:"60m"},
    "Fri-18:00": {name:"Friday Burn",  coach:"Mara", fill:100,type:"Circuit",dur:"45m"},
    "Sat-09:00": {name:"Strength Lab", coach:"Dev",  fill:82, type:"Strength",dur:"50m"},
    "Sat-12:00": {name:"Spin Ride",    coach:"Priya",fill:68, type:"Spin", dur:"45m"},
  };

  const suggested = [
    {day:"Tue",slot:"18:00",name:"Strength Lab",reason:"high demand · +34% this slot"},
    {day:"Thu",slot:"09:00",name:"Mobility",    reason:"try 12:00 — lunchtime demand"},
  ];

  const trainers = [
    {name:"Mara K.",  classes:14, cap:16, color:"#F59E0B"},
    {name:"Dev R.",   classes:11, cap:14, color:"#22D3A6"},
    {name:"Priya S.", classes:8,  cap:12, color:"#8B5CF6"},
    {name:"Jo M.",    classes:5,  cap:10, color:"#3B82F6"},
  ];

  const aiTips = [
    {id:0, text:"Tue 18:00 demand is up 34% — add a second Strength Lab. Likely 90%+ fill.", action:"Add it"},
    {id:1, text:"Thu 09:00 Mobility under-fills. Try moving to 12:00 — matches lunchtime demand.", action:"Move it"},
    {id:2, text:"Mara is near weekly cap (14/16). Shift Fri Burn to Jo to balance load.", action:"Reassign"},
  ];

  const fillColor = f => f >= 90 ? T.accent : f >= 70 ? "#E0B85B" : "#8AA294";

  const visibleDays = isMobile ? DAYS.slice(0,4) : DAYS;

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"12px":"24px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"18px",flexWrap:"wrap",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:T.text,margin:0}}>Planning & schedule</h2>
            <div style={{fontSize:"11px",color:T.muted,marginTop:"1px"}}>Shoreditch · 3 studios · {Object.keys(schedule).length} classes</div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          {/* Week nav */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:T.muted,fontWeight:"700"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:"600",color:T.text,padding:"0 4px"}}>
              {weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":`Week ${weekOffset>0?"+":""}${weekOffset}`}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:T.muted,fontWeight:"700"}}>›</button>
          </div>
          <button style={{padding:"8px 14px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",color:T.muted,fontSize:"12px",fontWeight:"600"}}>
            Demand heat
          </button>
          <button style={{padding:"8px 14px",background:T.accent,border:"none",borderRadius:"8px",cursor:"pointer",color:"#0A0F0C",fontSize:"12px",fontWeight:"700"}}>
            Publish week
          </button>
          <button style={{padding:"8px 14px",background:T.navy,border:`1px solid ${T.accent}50`,borderRadius:"8px",cursor:"pointer",color:T.accent,fontSize:"12px",fontWeight:"600"}}>
            Auto-fill week
          </button>
        </div>
      </div>

      {/* Schedule grid */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",overflow:"hidden",marginBottom:"16px"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid ${T.border}`}}>
          <div style={{padding:"10px 12px",background:T.navy}}/>
          {visibleDays.map((d,i)=>(
            <div key={d} style={{padding:"10px 8px",background:T.navy,borderLeft:`1px solid ${T.border}`,textAlign:"center"}}>
              <div style={{fontSize:"11px",color:T.muted,fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text}}>{dayDates[i]}</div>
            </div>
          ))}
        </div>

        {/* Time slot rows */}
        {SLOTS.map(slot=>(
          <div key={slot} style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid ${T.border}`,minHeight:"80px"}}>
            <div style={{padding:"10px 12px",background:T.navy+"66",display:"flex",flexDirection:"column",justifyContent:"center",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{slot}</div>
            </div>
            {visibleDays.map(day=>{
              const key = `${day}-${slot}`;
              const cls = schedule[key];
              const sug = suggested.find(s=>s.day===day && s.slot===slot);
              return (
                <div key={day} style={{padding:"6px",borderLeft:`1px solid ${T.border}`,position:"relative"}}>
                  {cls && (
                    <div style={{
                      padding:"7px 8px",
                      background:`${CAT_COLOR[cls.type]||T.accent}18`,
                      border:`1px solid ${CAT_COLOR[cls.type]||T.accent}40`,
                      borderRadius:"8px",
                      cursor:"pointer",
                      height:"calc(100% - 2px)",
                      boxSizing:"border-box",
                    }}>
                      <div style={{fontSize:isMobile?"9px":"11px",fontWeight:"700",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls.name}</div>
                      <div style={{fontSize:"10px",color:T.muted,marginTop:"2px"}}>{cls.coach} · {cls.dur}</div>
                      <div style={{marginTop:"4px",display:"flex",alignItems:"center",gap:"4px"}}>
                        <div style={{flex:1,height:"3px",background:T.navy,borderRadius:"2px"}}>
                          <div style={{width:`${cls.fill}%`,height:"100%",background:fillColor(cls.fill),borderRadius:"2px"}}/>
                        </div>
                        <span style={{fontSize:"9px",color:fillColor(cls.fill),fontWeight:"700"}}>{cls.fill}%</span>
                      </div>
                    </div>
                  )}
                  {!cls && sug && (
                    <div style={{
                      padding:"7px 8px",
                      background:"rgba(123,227,164,.06)",
                      border:`1px dashed ${T.accent}60`,
                      borderRadius:"8px",
                      cursor:"pointer",
                    }}>
                      <div style={{fontSize:"9px",fontWeight:"700",color:T.accent,letterSpacing:"0.5px",textTransform:"uppercase"}}>SUGGESTED</div>
                      <div style={{fontSize:isMobile?"9px":"10px",fontWeight:"600",color:T.text,marginTop:"1px"}}>{sug.name}</div>
                    </div>
                  )}
                  {!cls && !sug && (
                    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="0"}>
                      <span style={{fontSize:"18px",color:T.muted}}>+</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom: AI tips + Trainer load */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.4fr 1fr",gap:"14px"}}>
        {/* Jungle Intelligence */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
            <div style={{width:"28px",height:"28px",borderRadius:"8px",background:T.accent+"22",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text}}>Jungle Intelligence</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {aiTips.filter(t=>!dismissedTips.includes(t.id)).map((tip,i)=>(
              <div key={tip.id} style={{padding:"12px 14px",background:T.navy,border:`1px solid ${T.accent}30`,borderRadius:"10px",position:"relative"}}>
                <div style={{fontSize:"12px",color:T.text,lineHeight:"1.5",paddingRight:"20px"}}>{tip.text}</div>
                <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
                  <button style={{padding:"5px 12px",background:T.accent,border:"none",borderRadius:"6px",cursor:"pointer",color:"#0A0F0C",fontSize:"11px",fontWeight:"700"}}>{tip.action}</button>
                  <button onClick={()=>setDismissedTips(d=>[...d,tip.id])} style={{padding:"5px 12px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>Dismiss</button>
                </div>
              </div>
            ))}
            {dismissedTips.length===aiTips.length && (
              <div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:"13px"}}>All suggestions reviewed ✓</div>
            )}
          </div>
        </div>

        {/* Trainer load */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Trainer load · this week</div>
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {trainers.map((t,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
                  <span style={{fontSize:"13px",fontWeight:"600",color:T.text}}>{t.name}</span>
                  <span style={{fontSize:"12px",color:t.classes/t.cap>0.85?"#F59E0B":T.muted,fontWeight:"600"}}>{t.classes} classes{t.classes/t.cap>0.85?" ⚠":""}</span>
                </div>
                <div style={{height:"7px",background:T.navy,borderRadius:"4px",overflow:"hidden"}}>
                  <div style={{width:`${(t.classes/t.cap)*100}%`,height:"100%",background:t.classes/t.cap>0.85?"#F59E0B":t.color,borderRadius:"4px",transition:"width 0.4s"}}/>
                </div>
                <div style={{fontSize:"10px",color:T.muted,marginTop:"2px"}}>{t.classes}/{t.cap} capacity</div>
              </div>
            ))}
          </div>
          {trainers.some(t=>t.classes/t.cap>0.85) && (
            <div style={{marginTop:"14px",padding:"10px 12px",background:"#F59E0B15",border:"1px solid #F59E0B40",borderRadius:"8px",fontSize:"11px",color:"#F59E0B",lineHeight:"1.5"}}>
              ⚠ Mara is near weekly cap. Shift Fri Burn to Jo to balance load.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MusicHubScreen ────────────────────────────────────────────────────────────
function MusicHubScreen({onBack, stages=[], nowPlaying=null, liveState={}, player=null}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [energy, setEnergy] = React.useState("High");
  const [bpmMin, setBpmMin] = React.useState(120);
  const [bpmMax, setBpmMax] = React.useState(142);
  const [transition, setTransition] = React.useState("Beat-match");
  const [followStructure, setFollowStructure] = React.useState(true);
  const [takeRequests, setTakeRequests] = React.useState(true);
  const [cleanEdits, setCleanEdits] = React.useState(true);
  const [requests, setRequests] = React.useState([
    {id:1, track:"Titanium — David Guetta", member:"Sam",   votes:24, bpm:126, note:"fits Block B"},
    {id:2, track:"Levels — Avicii",          member:"Jess",  votes:11, bpm:128, note:"too slow for finisher"},
    {id:3, track:"Somebody That I Used to Know", member:"Alex", votes:7, bpm:122, note:"cool-down maybe"},
  ]);

  const queue = [
    {title:"Pump It (Extended Mix)",  artist:"Reso",            bpm:132, stage:"Block A peak",  transition:""},
    {title:"Belters",                  artist:"Christian Bland", bpm:138, stage:"Block B",        transition:"Beat-matched crossfade · 16 bars · +6 BPM"},
    {title:"Lose Control",            artist:"Teddy Swims (remix)",bpm:142,stage:"Block B",       transition:"Filter-sweep down · cool-down · −44 BPM"},
    {title:"Weightless",              artist:"Marconi Union",   bpm:98,  stage:"Finisher",       transition:""},
  ];

  const playlists = [
    {name:"HIIT Bangers",   tracks:42, color:"#F59E0B"},
    {name:"Beast Mode",     tracks:31, color:"#8B5CF6"},
    {name:"House 2026",     tracks:58, color:"#3B82F6"},
    {name:"Strength Cuts",  tracks:27, color:"#22D3A6"},
  ];

  const Toggle = ({value, onChange, label}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontSize:"12px",color:T.text,fontWeight:"600"}}>{label}</span>
      <div onClick={()=>onChange(!value)} style={{
        width:"38px",height:"20px",borderRadius:"10px",
        background:value?T.accent:T.navy,
        border:`1px solid ${value?T.accent:T.border}`,
        cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0,
      }}>
        <div style={{
          width:"14px",height:"14px",borderRadius:"50%",background:"white",
          position:"absolute",top:"2px",left:value?"21px":"2px",transition:"left 0.2s",
        }}/>
      </div>
    </div>
  );

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"22px",flexWrap:"wrap",gap:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:T.text,margin:0}}>Music Hub · Auto-DJ</h2>
            <div style={{fontSize:"11px",color:T.muted,marginTop:"1px"}}>Spotify · Premium · Live session</div>
          </div>
        </div>
        <div style={{padding:"6px 14px",background:T.accent+"22",border:`1px solid ${T.accent}60`,borderRadius:"999px",fontSize:"12px",fontWeight:"700",color:T.accent}}>
          ● AUTO-DJ LIVE
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr 1fr",gap:"16px"}}>

        {/* Now Playing + Queue */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {/* Now playing */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Now playing</div>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"14px"}}>
              <div style={{width:"52px",height:"52px",borderRadius:"10px",background:"repeating-linear-gradient(45deg,#1a2b1f 0,#1a2b1f 4px,#0f1611 4px,#0f1611 8px)",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"14px",fontWeight:"700",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Pump It (Extended Mix)</div>
                <div style={{fontSize:"12px",color:T.muted,marginTop:"2px"}}>Reso · Block A peak</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"32px",fontWeight:"700",color:T.accent}}>132</div>
              <div style={{fontSize:"11px",color:T.muted}}>BPM</div>
              <div style={{display:"flex",gap:"8px"}}>
                <button style={{width:"34px",height:"34px",borderRadius:"50%",background:T.navy,border:`1px solid ${T.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.text}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                </button>
                <button style={{width:"34px",height:"34px",borderRadius:"50%",background:T.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#0A0F0C"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <button style={{width:"34px",height:"34px",borderRadius:"50%",background:T.navy,border:`1px solid ${T.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.text}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Up next queue */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>Up next · beat-matched</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {queue.map((q,i)=>(
                <div key={i}>
                  {q.transition && i>0 && (
                    <div style={{fontSize:"10px",color:T.muted,fontStyle:"italic",padding:"4px 0 4px 12px",borderLeft:`2px solid ${T.border}`}}>{q.transition}</div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                    <div style={{width:"28px",height:"28px",borderRadius:"6px",background:"repeating-linear-gradient(45deg,#1a2b1f 0,#1a2b1f 3px,#0f1611 3px,#0f1611 6px)",flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.title}</div>
                      <div style={{fontSize:"10px",color:T.muted}}>{q.artist}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"12px",fontWeight:"700",color:T.accent}}>{q.bpm}</div>
                      <div style={{fontSize:"9px",color:T.muted}}>BPM</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Member requests */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px"}}>Member requests</div>
              <div style={{padding:"3px 9px",background:T.accent+"22",border:`1px solid ${T.accent}50`,borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:T.accent}}>{requests.length} pending</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {requests.map((r,i)=>(
                <div key={r.id} style={{padding:"10px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"10px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
                    <div style={{width:"32px",height:"32px",borderRadius:"50%",background:T.accent+"22",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Grotesk',sans-serif",fontSize:"13px",fontWeight:"700",color:T.accent,flexShrink:0}}>{r.votes}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.track}</div>
                      <div style={{fontSize:"10px",color:T.muted,marginTop:"1px"}}>{r.member} · {r.bpm} BPM · {r.note}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                    <button onClick={()=>setRequests(rs=>rs.filter(x=>x.id!==r.id))} style={{flex:1,padding:"5px",background:T.accent+"22",border:`1px solid ${T.accent}50`,borderRadius:"6px",cursor:"pointer",color:T.accent,fontSize:"11px",fontWeight:"700"}}>Queue it</button>
                    <button onClick={()=>setRequests(rs=>rs.filter(x=>x.id!==r.id))} style={{padding:"5px 10px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>Skip</button>
                  </div>
                </div>
              ))}
              {requests.length===0 && <div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:"13px"}}>No pending requests</div>}
            </div>
          </div>

          {/* Source playlists */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px"}}>Source playlists</div>
              <button style={{fontSize:"11px",fontWeight:"700",color:T.accent,background:"none",border:"none",cursor:"pointer"}}>+ Add</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              {playlists.map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:p.color,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:"13px",fontWeight:"600",color:T.text}}>{p.name}</span>
                  <span style={{fontSize:"11px",color:T.muted}}>{p.tracks} tracks</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mix controls */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>Mix controls</div>

          {/* Energy target */}
          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"11px",color:T.muted,fontWeight:"600",marginBottom:"6px"}}>Energy target</div>
            <div style={{display:"flex",gap:"6px"}}>
              {["Low","Medium","High","Peak"].map(e=>(
                <button key={e} onClick={()=>setEnergy(e)}
                  style={{flex:1,padding:"7px",background:energy===e?T.accent:"transparent",border:`1px solid ${energy===e?T.accent:T.border}`,borderRadius:"7px",cursor:"pointer",color:energy===e?"#0A0F0C":T.muted,fontSize:"11px",fontWeight:"700"}}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* BPM range */}
          <div style={{marginBottom:"14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
              <div style={{fontSize:"11px",color:T.muted,fontWeight:"600"}}>BPM range</div>
              <div style={{fontSize:"11px",color:T.accent,fontWeight:"700"}}>{bpmMin}–{bpmMax} BPM</div>
            </div>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <input type="range" min={60} max={180} value={bpmMin}
                onChange={e=>setBpmMin(Math.min(Number(e.target.value),bpmMax-5))}
                style={{flex:1,accentColor:T.accent}}/>
              <input type="range" min={60} max={180} value={bpmMax}
                onChange={e=>setBpmMax(Math.max(Number(e.target.value),bpmMin+5))}
                style={{flex:1,accentColor:T.accent}}/>
            </div>
          </div>

          {/* Transition style */}
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"11px",color:T.muted,fontWeight:"600",marginBottom:"6px"}}>Transition style</div>
            <div style={{display:"flex",gap:"6px"}}>
              {["Beat-match","Cut","Echo"].map(s=>(
                <button key={s} onClick={()=>setTransition(s)}
                  style={{flex:1,padding:"7px",background:transition===s?T.accent+"22":"transparent",border:`1px solid ${transition===s?T.accent:T.border}`,borderRadius:"7px",cursor:"pointer",color:transition===s?T.accent:T.muted,fontSize:"11px",fontWeight:"700"}}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <Toggle value={followStructure} onChange={setFollowStructure} label="Follow class structure · sync BPM to each stage"/>
          <Toggle value={takeRequests}    onChange={setTakeRequests}    label="Take requests · members queue tracks"/>
          <Toggle value={cleanEdits}      onChange={setCleanEdits}      label="Clean / radio edits · no explicit lyrics"/>
        </div>

      </div>
    </div>
  );
}


// ─── MemberScreen ─────────────────────────────────────────────────────────────
function MemberScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const [tab, setTab] = React.useState("discover"); // discover | detail | live | book | profile
  const [selectedClass, setSelectedClass] = React.useState(null);

  const CAT_COLOR = {HIIT:"#F59E0B",Strength:"#8B5CF6",Hyrox:"#22D3A6",Spin:"#3B82F6",Yoga:"#10B981",Boxing:"#EC4899"};
  const upcomingClasses = [
    {id:1, name:"Sunrise HIIT",  date:"Tue 06:00", coach:"Mara", bpm:130, match:92, type:"HIIT",     spots:6, booked:false, dur:"45m"},
    {id:2, name:"Hyrox Sim",    date:"Wed 12:15", coach:"Dev",  bpm:140, match:84, type:"Hyrox",    spots:4, booked:false, dur:"60m"},
    {id:3, name:"Strength Lab", date:"Thu 18:30", coach:"Priya",bpm:95,  match:78, type:"Strength", spots:0, booked:true,  dur:"45m"},
    {id:4, name:"Spin Ride",    date:"Fri 19:30", coach:"Dev",  bpm:126, match:71, type:"Spin",     spots:0, booked:false, waitlist:3, dur:"45m"},
  ];

  const classDetail = selectedClass || upcomingClasses[0];
  const stagesPreview = [
    {name:"Warm-up flow",   bpm:88, color:"#5BD0C0"},
    {name:"AMRAP block",    bpm:128,color:"#7BE3A4"},
    {name:"Interval peak",  bpm:138,color:"#7BE3A4"},
    {name:"Cool-down",      bpm:78, color:"#E0B85B"},
  ];

  const TabBtn = ({id, label, icon}) => (
    <button onClick={()=>setTab(id)} style={{
      flex:1,padding:"10px 4px",background:"none",border:"none",cursor:"pointer",
      color:tab===id?T.accent:T.muted,
      borderTop:`2px solid ${tab===id?T.accent:"transparent"}`,
      fontSize:"11px",fontWeight:"700",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",
    }}>
      <span style={{fontSize:"16px"}}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"16px",fontWeight:"700",color:T.text}}>Member App</div>
        <div style={{marginLeft:"auto",fontSize:"11px",color:T.muted}}>Sam Ellis</div>
        <div style={{width:"30px",height:"30px",borderRadius:"50%",background:T.accent+"22",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,fontSize:"12px",fontWeight:"700"}}>SE</div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"0"}}>

        {/* ── DISCOVER ── */}
        {tab==="discover" && (
          <div style={{padding:"20px"}}>
            <div style={{marginBottom:"18px"}}>
              <div style={{fontSize:"12px",color:T.muted,fontWeight:"600",marginBottom:"2px"}}>TONIGHT · 18:30</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"20px",fontWeight:"700",color:T.text}}>Hey, Sam 👋</div>
              <div style={{padding:"14px",background:T.card,border:`1px solid ${T.accent}50`,borderRadius:"12px",marginTop:"12px",cursor:"pointer"}} onClick={()=>{setSelectedClass(upcomingClasses[2]);setTab("detail");}}>
                <div style={{fontSize:"11px",color:T.accent,fontWeight:"700",marginBottom:"4px"}}>TONIGHT · 18:30</div>
                <div style={{fontSize:"16px",fontWeight:"700",color:T.text}}>Strength Lab</div>
                <div style={{fontSize:"12px",color:T.muted,marginTop:"2px"}}>with Priya · 45 min · Studio 2</div>
                <div style={{marginTop:"10px",padding:"6px 12px",background:T.accent,borderRadius:"6px",display:"inline-block",fontSize:"12px",fontWeight:"700",color:"#0A0F0C",cursor:"pointer"}}>View workout →</div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>Recommended for you</div>
              <button style={{background:"none",border:"none",cursor:"pointer",color:T.accent,fontSize:"12px",fontWeight:"700"}}>See all</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {upcomingClasses.map((cls,i)=>(
                <div key={cls.id} onClick={()=>{setSelectedClass(cls);setTab("detail");}}
                  style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",cursor:"pointer"}}>
                  <div style={{width:"44px",height:"44px",borderRadius:"10px",background:`${CAT_COLOR[cls.type]||T.accent}22`,border:`1px solid ${CAT_COLOR[cls.type]||T.accent}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"16px",fontWeight:"800",color:CAT_COLOR[cls.type]||T.accent}}>{cls.date.split(" ")[0][0]+cls.date.split(" ")[0].slice(-2)}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{cls.name}</div>
                    <div style={{fontSize:"11px",color:T.muted}}>{cls.date} · {cls.coach} · {cls.bpm} BPM</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:"14px",fontWeight:"800",color:T.accent}}>{cls.match}%</div>
                    <div style={{fontSize:"10px",color:T.muted}}>match</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CLASS DETAIL ── */}
        {tab==="detail" && (
          <div style={{padding:"20px"}}>
            <div style={{padding:"3px 8px",background:`${CAT_COLOR[classDetail.type]||T.accent}22`,border:`1px solid ${CAT_COLOR[classDetail.type]||T.accent}40`,borderRadius:"4px",display:"inline-block",fontSize:"11px",fontWeight:"700",color:CAT_COLOR[classDetail.type]||T.accent,marginBottom:"8px"}}>{classDetail.type} · {classDetail.dur}</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"24px",fontWeight:"800",color:T.text,marginBottom:"4px"}}>{classDetail.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
              <div style={{width:"36px",height:"36px",borderRadius:"50%",background:T.accent+"22",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,fontSize:"12px",fontWeight:"700"}}>{classDetail.coach[0]}</div>
              <div>
                <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{classDetail.coach}</div>
                <div style={{fontSize:"11px",color:T.muted}}>Lead coach · 4.9 ★</div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:"12px",fontSize:"11px",color:T.muted}}>
                <span>RPE 7–8</span>
                <span>Studio 1</span>
                <span style={{color:classDetail.spots>0?T.accent:"#EF4444",fontWeight:"700"}}>{classDetail.spots>0?`${classDetail.spots} spots left`:"Full"}</span>
              </div>
            </div>

            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>The plan</div>
            <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"16px"}}>
              {stagesPreview.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"10px",borderLeft:`3px solid ${s.color}`}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:T.text}}>{s.name}</div>
                  <div style={{fontSize:"12px",color:s.color,fontWeight:"700"}}>{s.bpm} BPM</div>
                </div>
              ))}
            </div>

            <div style={{padding:"12px 14px",background:T.accent+"11",border:`1px solid ${T.accent}30`,borderRadius:"10px",marginBottom:"16px"}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:T.accent,marginBottom:"2px"}}>Auto-DJ soundtrack ready</div>
              <div style={{fontSize:"11px",color:T.muted}}>House · 52 tracks · beat-matched to every stage</div>
            </div>

            {classDetail.booked
              ? <div style={{width:"100%",padding:"14px",background:T.accent+"22",border:`1px solid ${T.accent}60`,borderRadius:"10px",textAlign:"center",fontSize:"14px",fontWeight:"700",color:T.accent}}>✓ Booked</div>
              : classDetail.waitlist
                ? <button style={{width:"100%",padding:"14px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"10px",cursor:"pointer",fontSize:"14px",fontWeight:"700",color:T.muted}}>Join waitlist ({classDetail.waitlist} ahead)</button>
                : <button style={{width:"100%",padding:"14px",background:T.accent,border:"none",borderRadius:"10px",cursor:"pointer",fontSize:"14px",fontWeight:"700",color:"#0A0F0C"}}>Book with ClassPass</button>
            }
          </div>
        )}

        {/* ── LIVE IN CLASS ── */}
        {tab==="live" && (
          <div style={{padding:"20px",display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:"20px"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"16px",fontWeight:"700",color:T.text}}>Sunrise HIIT</div>
              <div style={{padding:"4px 10px",background:"#EF444422",border:"1px solid #EF444460",borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:"#EF4444"}}>● LIVE</div>
            </div>

            <div style={{padding:"3px 10px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"999px",fontSize:"11px",color:T.muted,marginBottom:"16px"}}>ROUND 3 / 8</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"72px",fontWeight:"800",color:T.text,lineHeight:"1",marginBottom:"8px"}}>00:42</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"22px",fontWeight:"700",color:T.accent,marginBottom:"4px"}}>Kettlebell Swings</div>
            <div style={{fontSize:"13px",color:T.muted,marginBottom:"24px"}}>×20 · 24kg</div>

            <div style={{padding:"12px 16px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",width:"100%",marginBottom:"16px",display:"flex",alignItems:"center",gap:"12px"}}>
              <div style={{width:"36px",height:"36px",borderRadius:"8px",background:"repeating-linear-gradient(45deg,#1a2b1f 0,#1a2b1f 3px,#0f1611 3px,#0f1611 6px)",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:"12px",fontWeight:"700",color:T.text}}>Pump It — Reso</div>
                <div style={{fontSize:"11px",color:T.muted,marginTop:"1px"}}>now playing</div>
              </div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.accent}}>132<span style={{fontSize:"10px",color:T.muted}}> BPM</span></div>
            </div>

            <button style={{width:"100%",padding:"12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"10px",cursor:"pointer",fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"12px"}}>
              🎵 Request a track · 3 in queue
            </button>

            <div style={{padding:"14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",width:"100%"}}>
              <div style={{fontSize:"12px",color:T.muted,marginBottom:"10px"}}>How hard did that feel? Tap to log RPE after the round</div>
              <div style={{display:"flex",gap:"6px"}}>
                {[5,6,7,8,9,10].map(n=>(
                  <button key={n} style={{flex:1,padding:"8px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"13px",fontWeight:"700"}}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── BOOK / SCHEDULE ── */}
        {tab==="book" && (
          <div style={{padding:"20px"}}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Book a class</div>

            {/* Week strip */}
            <div style={{display:"flex",gap:"8px",marginBottom:"16px",overflowX:"auto",paddingBottom:"4px"}}>
              {["MON\n14","TUE\n15","WED\n16","THU\n17","FRI\n18","SAT\n19"].map((d,i)=>(
                <div key={i} style={{
                  minWidth:"48px",padding:"8px 4px",borderRadius:"10px",textAlign:"center",cursor:"pointer",flexShrink:0,
                  background:i===1?T.accent:T.card,border:`1px solid ${i===1?T.accent:T.border}`,
                  color:i===1?"#0A0F0C":T.text,
                }}>
                  <div style={{fontSize:"9px",fontWeight:"700",letterSpacing:"0.5px"}}>{d.split("\n")[0]}</div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700"}}>{d.split("\n")[1]}</div>
                </div>
              ))}
            </div>

            {/* ClassPass badge */}
            <div style={{padding:"8px 14px",background:"#3B82F622",border:"1px solid #3B82F650",borderRadius:"8px",fontSize:"12px",fontWeight:"600",color:"#3B82F6",marginBottom:"14px",display:"flex",alignItems:"center",gap:"8px"}}>
              <span style={{fontWeight:"800"}}>CP</span> ClassPass · 7 credits left this month
            </div>

            {/* Class list */}
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {[
                {time:"06:00",name:"Sunrise HIIT",coach:"Mara",dur:"45m",status:"Booked"},
                {time:"12:15",name:"Hyrox Sim",coach:"Dev",dur:"50m",spots:4,status:"Book"},
                {time:"18:30",name:"Strength Lab",coach:"Priya",dur:"45m",spots:8,status:"Book"},
                {time:"19:30",name:"Spin Ride",dur:"45m",status:"Waitlist 3",full:true},
              ].map((cls,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"10px"}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"15px",fontWeight:"700",color:T.muted,minWidth:"44px"}}>{cls.time}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{cls.name}</div>
                    <div style={{fontSize:"11px",color:T.muted,marginTop:"1px"}}>{cls.coach||""} {cls.coach?"·":""} {cls.dur}{cls.spots?` · ${cls.spots} left`:""}</div>
                  </div>
                  <button style={{
                    padding:"6px 12px",
                    background:cls.status==="Booked"?T.accent+"22":cls.full?T.navy:"transparent",
                    border:`1px solid ${cls.status==="Booked"?T.accent:T.border}`,
                    borderRadius:"7px",cursor:"pointer",
                    color:cls.status==="Booked"?T.accent:T.text,
                    fontSize:"11px",fontWeight:"700",whiteSpace:"nowrap",
                  }}>{cls.status}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PROFILE / DATA ── */}
        {tab==="profile" && (
          <div style={{padding:"20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"20px"}}>
              <div style={{width:"56px",height:"56px",borderRadius:"50%",background:T.accent+"22",border:`2px solid ${T.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",fontWeight:"800",color:T.accent,flexShrink:0}}>SE</div>
              <div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text}}>Sam Ellis</div>
                <div style={{fontSize:"12px",color:T.muted}}>Member since 2024 · Shoreditch</div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginBottom:"20px"}}>
              {[{val:"128",label:"classes"},{val:"7.6",label:"avg RPE"},{val:"12wk",label:"streak"}].map((s,i)=>(
                <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"14px",textAlign:"center"}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"24px",fontWeight:"800",color:T.accent}}>{s.val}</div>
                  <div style={{fontSize:"11px",color:T.muted,marginTop:"2px"}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Favourite classes</div>
            <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"20px"}}>
              {[{type:"HIIT",n:48,color:"#F59E0B"},{type:"Strength",n:36,color:"#8B5CF6"},{type:"Hyrox",n:24,color:"#22D3A6"}].map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"8px"}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:c.color}}/>
                  <span style={{flex:1,fontSize:"13px",fontWeight:"600",color:T.text}}>{c.type}</span>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"16px",fontWeight:"700",color:c.color}}>{c.n}</span>
                </div>
              ))}
            </div>

            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Music taste</div>
            <div style={{padding:"14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"10px"}}>
                {["House","Drum & Bass","Hip-hop"].map(g=>(
                  <div key={g} style={{padding:"5px 12px",background:T.accent+"22",border:`1px solid ${T.accent}40`,borderRadius:"999px",fontSize:"12px",fontWeight:"700",color:T.accent}}>{g}</div>
                ))}
              </div>
              <div style={{fontSize:"12px",color:T.muted}}>128–140 BPM · peak zone</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{borderTop:`1px solid ${T.border}`,background:T.card,display:"flex",flexShrink:0}}>
        <TabBtn id="discover" label="Discover" icon="🏠"/>
        <TabBtn id="detail"   label="Classes"  icon="📋"/>
        <TabBtn id="live"     label="Live"     icon="🎙"/>
        <TabBtn id="book"     label="Book"     icon="📅"/>
        <TabBtn id="profile"  label="Profile"  icon="👤"/>
      </div>
    </div>
  );
}


// ─── BrandStudioScreen ────────────────────────────────────────────────────────
function BrandStudioScreen({onBack, gymBranding={}, onBrandingChange}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [analyzing, setAnalyzing] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [recommended, setRecommended] = React.useState(null);
  const [selectedSkin, setSelectedSkin] = React.useState("canopy");
  const [files, setFiles] = React.useState([]);
  const fileRef = React.useRef(null);

  const analyzeSteps = [
    "Extracting colour palette from photos…",
    "Matching typography to your logo…",
    "Reading tone from brand guidelines…",
    "Composing your Jungle identity…",
  ];

  const runAnalysis = () => {
    setAnalyzing(true);
    setStep(0);
    const timer = (i) => {
      if (i >= analyzeSteps.length) {
        setAnalyzing(false);
        setRecommended({name:"Ember",accent:"#FF6A3D",bg:"#0C0B0A",font:"Space Grotesk",vibe:["Bold","High-energy","Urban","Confident"]});
        return;
      }
      setStep(i);
      setTimeout(()=>timer(i+1), 900);
    };
    timer(0);
  };

  const skins = [
    {id:"canopy", name:"Canopy", desc:"Wellness",  accent:"#7BE3A4", bg:"#0A0F0C"},
    {id:"pulse",  name:"Pulse",  desc:"HIIT",      accent:"#D6FF3D", bg:"#08090A"},
    {id:"atelier",name:"Atelier",desc:"Luxury",    accent:"#C8A86A", bg:"#0C0C0E"},
    {id:"ember",  name:"Ember",  desc:"Brand-Studio",accent:"#FF6A3D",bg:"#0C0B0A"},
  ];

  const applyRecommended = () => {
    if (!recommended) return;
    onBrandingChange({...gymBranding, accentColor: recommended.accent, fontFamily:"Space Grotesk"});
  };

  const applySkin = (skin) => {
    const map = {
      canopy:  {accentColor:"#7BE3A4", secondColor:"#CFF5DE"},
      pulse:   {accentColor:"#D6FF3D", secondColor:"#B8E000"},
      atelier: {accentColor:"#C8A86A", secondColor:"#A08040"},
      ember:   {accentColor:"#FF6A3D", secondColor:"#FF9B7A"},
    };
    onBrandingChange({...gymBranding, ...map[skin]});
    setSelectedSkin(skin);
  };

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"22px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.text,display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div>
          <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:T.text,margin:0}}>Brand Studio</h2>
          <div style={{fontSize:"11px",color:T.muted,marginTop:"1px"}}>Upload your brand — Jungle designs the identity, then reskins every surface</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr",gap:"18px"}}>

        {/* Left: Upload + analyze */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {/* File drop */}
          <div style={{background:T.card,border:`1px dashed ${T.border}`,borderRadius:"14px",padding:"24px",textAlign:"center"}}>
            <div style={{fontSize:"32px",marginBottom:"10px"}}>🎨</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"15px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>Drop in your brand</div>
            <div style={{fontSize:"12px",color:T.muted,marginBottom:"14px"}}>Logo · guidelines · photos · brand site</div>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{display:"none"}}
              onChange={e=>setFiles(prev=>[...prev,...Array.from(e.target.files).map(f=>f.name)])}/>
            <button onClick={()=>fileRef.current?.click()}
              style={{padding:"9px 20px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",color:T.text,fontSize:"13px",fontWeight:"700"}}>
              Browse files
            </button>
            {files.length>0 && (
              <div style={{marginTop:"12px",display:"flex",flexDirection:"column",gap:"4px"}}>
                {files.map((f,i)=>(
                  <div key={i} style={{fontSize:"12px",color:T.muted,padding:"4px 8px",background:T.navy,borderRadius:"6px"}}>{f}</div>
                ))}
              </div>
            )}
          </div>

          {/* Analyze button */}
          {!analyzing && !recommended && (
            <button onClick={runAnalysis}
              style={{width:"100%",padding:"14px",background:T.accent,border:"none",borderRadius:"10px",cursor:"pointer",fontSize:"14px",fontWeight:"700",color:"#0A0F0C",fontFamily:"'Space Grotesk',sans-serif"}}>
              Analyse & design my brand
            </button>
          )}

          {/* Analysis progress */}
          {analyzing && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"20px"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"14px"}}>Reading your brand…</div>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {analyzeSteps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <div style={{width:"18px",height:"18px",borderRadius:"50%",flexShrink:0,
                      background:i<step?T.accent:i===step?"transparent":T.navy,
                      border:`1px solid ${i<=step?T.accent:T.border}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                    }}>
                      {i<step && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A0F0C" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      {i===step && <div style={{width:"6px",height:"6px",borderRadius:"50%",background:T.accent,animation:"pulse 1s infinite"}}/>}
                    </div>
                    <span style={{fontSize:"12px",color:i<=step?T.text:T.muted}}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended result */}
          {recommended && (
            <div style={{background:T.card,border:`1px solid ${T.accent}50`,borderRadius:"14px",padding:"18px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:T.accent,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>RECOMMENDED</div>
              <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
                <div style={{width:"48px",height:"48px",borderRadius:"10px",background:recommended.accent,flexShrink:0}}/>
                <div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"800",color:T.text}}>{recommended.name} — built from your brand</div>
                  <div style={{display:"flex",gap:"6px",marginTop:"4px",flexWrap:"wrap"}}>
                    {recommended.vibe.map(v=>(
                      <span key={v} style={{padding:"2px 8px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"4px",fontSize:"10px",color:T.muted}}>{v}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
                <div style={{padding:"10px 12px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"10px",color:T.muted,marginBottom:"4px",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>PALETTE FROM PHOTOS</div>
                  <div style={{display:"flex",gap:"6px"}}>
                    {[recommended.accent,"#FF9B7A","#0C0B0A","#2A1810"].map((c,i)=>(
                      <div key={i} style={{width:"22px",height:"22px",borderRadius:"5px",background:c,border:"1px solid rgba(255,255,255,0.1)"}}/>
                    ))}
                  </div>
                </div>
                <div style={{padding:"10px 12px",background:T.navy,borderRadius:"8px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"10px",color:T.muted,marginBottom:"4px",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>TYPE PAIRING</div>
                  <div style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{recommended.font}</div>
                  <div style={{fontSize:"10px",color:T.muted}}>Hanken Grotesk · body</div>
                </div>
              </div>
              <button onClick={applyRecommended}
                style={{width:"100%",padding:"12px",background:recommended.accent,border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"13px",fontWeight:"700",color:"white"}}>
                Apply to all surfaces
              </button>
            </div>
          )}
        </div>

        {/* Right: skin templates + live preview */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>Or start from a template</div>
            <div style={{fontSize:"11px",color:T.muted,marginBottom:"14px"}}>Each skin reskins every surface instantly</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"10px"}}>
              {skins.map(skin=>(
                <div key={skin.id} onClick={()=>applySkin(skin.id)} style={{
                  padding:"14px",
                  background:selectedSkin===skin.id?`${skin.accent}15`:T.navy,
                  border:`1px solid ${selectedSkin===skin.id?skin.accent:T.border}`,
                  borderRadius:"10px",cursor:"pointer",
                  boxShadow:selectedSkin===skin.id?`0 0 0 2px ${skin.accent}30`:"none",
                  transition:"all 0.15s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
                    <div style={{width:"20px",height:"20px",borderRadius:"5px",background:skin.accent,flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{skin.name}</div>
                      <div style={{fontSize:"10px",color:T.muted}}>{skin.desc}</div>
                    </div>
                  </div>
                  <div style={{height:"4px",borderRadius:"2px",background:`linear-gradient(to right, ${skin.accent}, ${skin.bg})`}}/>
                </div>
              ))}
            </div>
          </div>

          {/* Live preview mini */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>LIVE PREVIEW · UPDATES INSTANTLY</div>
            <div style={{background:"#050705",borderRadius:"10px",padding:"14px",border:`1px solid rgba(255,255,255,0.06)`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"14px",fontWeight:"800",color:T.accent||"#7BE3A4"}}>JUNGLE</div>
                <div style={{display:"flex",gap:"8px"}}>
                  {[["FILL","92%"],["RPE","7.4"],["NPS","71"]].map(([l,v])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"13px",fontWeight:"800",color:T.accent||"#7BE3A4"}}>{v}</div>
                      <div style={{fontSize:"9px",color:"#5a6f58",fontWeight:"700"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{fontSize:"10px",color:"#5a6f58",marginBottom:"6px",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>Today's schedule</div>
              {["06:00  Sunrise HIIT","12:15  Hyrox Sim","18:30  Strength Lab"].map((c,i)=>(
                <div key={i} style={{fontSize:"11px",color:i===0?T.text||"#E8EFE9":"#5a6f58",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>{c}</div>
              ))}
              <div style={{marginTop:"10px",padding:"8px 10px",background:"rgba(123,227,164,0.06)",border:"1px solid rgba(123,227,164,0.2)",borderRadius:"8px"}}>
                <div style={{fontSize:"10px",color:T.muted,marginBottom:"2px"}}>TONIGHT · 18:30</div>
                <div style={{fontSize:"12px",fontWeight:"700",color:T.text||"#E8EFE9"}}>Strength Lab</div>
                <div style={{fontSize:"10px",color:"#5a6f58"}}>with Priya · 45 min</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── PlaylistImportModal ──────────────────────────────────────────────────────
function PlaylistImportModal({ stages, selIdx, onAddTrack, onAddTracksToAll, onClose }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [playlists,    setPlaylists]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selPl,        setSelPl]        = useState(null);
  const [tracks,       setTracks]       = useState([]);
  const [loadingTr,    setLoadingTr]    = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  // mode: "playlists" | "tracks" | "scope-error"
  const [mode,         setMode]         = useState("playlists");
  const [scopeError,   setScopeError]   = useState(false);
  const [targetIdx,    setTargetIdx]    = useState(selIdx);   // which stage to add tracks to
  const [addedSet,     setAddedSet]     = useState(new Set()); // track IDs added this session
  const [bulkAdded,    setBulkAdded]    = useState(false);
  const [distributing, setDistributing] = useState(false);

  // Clamp targetIdx if stages array shrinks while modal is open
  useEffect(() => {
    if (stages.length > 0) setTargetIdx(i => Math.min(i, stages.length - 1));
  }, [stages.length]);

  const fmtMs = ms => { const s=Math.round(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; };
  const totalDurSec = tracks.reduce((a,t)=>a+Math.round((t.duration_ms||0)/1000),0);
  const totalDurLabel = totalDurSec > 0
    ? `${Math.floor(totalDurSec/60)} min${totalDurSec%60>0?" "+String(totalDurSec%60).padStart(2,"0")+" sec":""}`
    : "";

  // Convert raw Spotify track object to the normalized format used by TrackItem / stage queues
  const normPlTrack = t => {
    const cache = getBpmCache();
    return {
      t:       t.name || "",
      a:       t.artists?.map(a=>a.name).join(", ") || "",
      bpm:     cache[t.id] || 0,
      uri:     t.uri  || "",
      id:      t.id   || "",
      albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      dur:     Math.round((t.duration_ms||0)/1000),
    };
  };

  useEffect(() => {
    // Check scope from localStorage first (fast path for re-auths)
    const storedScope = localStorage.getItem("sp_scope") || "";
    // Only block if we know for certain that playlist-read-private is absent
    // (playlist-read-collaborative is a nice-to-have for other users' playlists — don't block own playlists for it)
    const knownMissing = storedScope.length > 0 && (!storedScope.includes("playlist-read-private") || !storedScope.includes("playlist-modify-public"));
    if (knownMissing) { setMode("scope-error"); setLoading(false); return; }

    // Load playlists normally — own playlists always work with playlist-read-private
    apiGetPlaylists().then(async pls => {
      setPlaylists(pls);
      setLoading(false);
    });
  }, []);

  const openPlaylist = async (pl) => {
    setSelPl(pl); setMode("tracks"); setScopeError(false); setLoadingTr(true);
    setAccessDenied(false); setAddedSet(new Set()); setBulkAdded(false);
    const tr = await apiGetPlaylistTracks(pl.id);
    if (tr === null) { setMode("scope-error"); setTracks([]); setLoadingTr(false); return; }
    if (tr?.denied) { setAccessDenied(tr.message || true); setTracks([]); setLoadingTr(false); return; }
    setTracks(tr);
    setLoadingTr(false);
    // Pre-warm BPM cache so normPlTrack picks it up immediately when tracks are added
    enrichTracksWithBpm(tr.map(t=>({id:t.id, bpm:0}))).catch(()=>{});
  };

  const addOneTrack = (t) => {
    onAddTrack(targetIdx, normPlTrack(t));
    setAddedSet(prev => new Set([...prev, t.id]));
  };

  const addAllToStage = () => {
    tracks.forEach(t => onAddTrack(targetIdx, normPlTrack(t)));
    setBulkAdded(true);
    setTimeout(onClose, 800);
  };

  // Feature 5: Smart BPM distribution — assigns tracks whose tempo matches each
  // stage's science-backed BPM range; falls back to any remaining track if needed.
  const distributeAcrossStages = async () => {
    setDistributing(true);
    try {
      const MIN_SEC = 300; // 5-minute minimum music coverage per stage

      // Step 1: Warm BPM cache for all tracks in this playlist
      await enrichTracksWithBpm(tracks.map(t => ({ id: t.id, bpm: getBpmCache()[t.id] || 0 })));
      const cache = getBpmCache();

      // Step 2: Attach resolved BPM to each track
      const bpmTracks = tracks.map(t => ({ ...t, _bpm: cache[t.id] || 0 }));

      // Step 3: Assign tracks to stages using BPM matching
      const usedIds   = new Set();
      const newlyAdded = new Set();

      stages.forEach((s, si) => {
        const stageDurSec = +(s.dur) || 0;
        const target = Math.max(stageDurSec, MIN_SEC);
        const cfg = SCFG[s.type] || SCFG.circuit;
        const bpmMin = cfg.bpmMin ?? 0;
        const bpmMax = cfg.bpmMax ?? 999;
        const mid    = (bpmMin + bpmMax) / 2;

        const available = bpmTracks.filter(t => !usedIds.has(t.id));
        // Prefer tracks in the stage's BPM range; sort by proximity to midpoint
        const inRange  = available.filter(t => t._bpm && t._bpm >= bpmMin && t._bpm <= bpmMax)
                                  .sort((a,b) => Math.abs(a._bpm - mid) - Math.abs(b._bpm - mid));
        const fallback = available.filter(t => !t._bpm || t._bpm < bpmMin || t._bpm > bpmMax);

        let filled = 0;
        for (const pool of [inRange, fallback]) {
          for (const t of pool) {
            if (filled >= target) break;
            onAddTracksToAll(si, normPlTrack(t));
            usedIds.add(t.id);
            newlyAdded.add(t.id);
            filled += Math.round((t.duration_ms || 0) / 1000) || 180;
          }
          if (filled >= target) break;
        }
      });

      setAddedSet(prev => new Set([...prev, ...newlyAdded]));
      setBulkAdded(true);
      setTimeout(onClose, 800);
    } catch(e) {
      console.error("Smart distribute error:", e);
      setDistributing(false);
    }
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center" };
  const modal   = { background:T.card, border:`1px solid ${T.border}`, borderRadius:isMobile?"14px 14px 0 0":"14px", width:isMobile?"100%":"680px", maxWidth:isMobile?"100%":"95vw", maxHeight:isMobile?"92vh":"82vh", display:"flex", flexDirection:"column", overflow:"hidden" };

  const [grantingAccess, setGrantingAccess] = useState(false);

  const handleGrantAccess = async () => {
    setGrantingAccess(true);
    const popup = await openSpotifyAuthPopup();
    if (!popup) return; // popup blocked → fell back to full redirect

    // Listen for the popup to post back after exchanging the code
    const handleMsg = (evt) => {
      if (evt.origin !== window.location.origin) return;
      if (evt.data?.type !== "spotify_auth_complete") return;
      window.removeEventListener("message", handleMsg);
      setGrantingAccess(false);
      // Token now saved — reload playlists then auto-open last clicked playlist if any
      setMode("playlists");
      setLoading(true);
      apiGetPlaylists().then(pls => {
        setPlaylists(pls);
        setLoading(false);
        // If the user had already selected a playlist before the permission screen, re-open it
        if (selPl) openPlaylist(selPl);
      });
    };
    window.addEventListener("message", handleMsg);

    // Safety: if popup is closed by user without completing, reset state
    const pollClose = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClose);
        window.removeEventListener("message", handleMsg);
        setGrantingAccess(false);
      }
    }, 800);
  };

  // Shared scope-error screen content (used for both proactive and reactive detection)
  const ScopeErrorScreen = () => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 32px",textAlign:"center",flex:1}}>
      <p style={{fontSize:"40px",marginBottom:"14px"}}>🔒</p>
      <p style={{fontSize:"15px",fontWeight:"700",color:T.text,marginBottom:"8px"}}>One-time permission needed</p>
      <p style={{fontSize:"13px",color:T.muted,marginBottom:"8px",maxWidth:"340px",lineHeight:"1.6"}}>
        Jungle needs read access to your Spotify playlist songs.<br/>
        This is a <strong style={{color:T.text}}>one-time step</strong> — after this, clicking any playlist will show its songs instantly.
      </p>
      <p style={{fontSize:"11px",color:T.muted,marginBottom:"28px",opacity:0.7}}>
        {grantingAccess ? "A Spotify window just opened — approve access there, then come back." : "A small window will open — you'll be back here in seconds."}
      </p>
      <button onClick={handleGrantAccess} disabled={grantingAccess}
        style={{padding:"12px 32px",background: grantingAccess ? T.muted : "#1DB954",color:"white",border:"none",borderRadius:"24px",cursor: grantingAccess ? "default" : "pointer",fontWeight:"700",fontSize:"14px",display:"flex",alignItems:"center",gap:"9px",boxShadow: grantingAccess ? "none" : "0 4px 14px #1DB95440",transition:"all 0.2s"}}>
        <span>🎵</span> {grantingAccess ? "Waiting for Spotify…" : "Grant Playlist Access"}
      </button>
    </div>
  );

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{padding:"16px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0}}>
          <div style={{display:"flex", alignItems:"center", gap:"10px", minWidth:0}}>
            {mode==="tracks" && (
              <button onClick={()=>setMode("playlists")} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"4px",display:"flex",flexShrink:0}}>
                <ArrowLeft size={18}/>
              </button>
            )}
            <div style={{minWidth:0}}>
              <p style={{fontSize:"15px", fontWeight:"700", color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                {mode==="tracks" ? selPl?.name : "My Spotify Playlists"}
              </p>
              {mode==="tracks" && !loadingTr && tracks.length > 0 && (
                <p style={{fontSize:"11px", color:T.muted, marginTop:"1px"}}>
                  {tracks.length} tracks{totalDurLabel ? ` · ${totalDurLabel}` : ""}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"4px",display:"flex",flexShrink:0}}><X size={18}/></button>
        </div>

        {/* Stage selector bar — shown in tracks view only */}
        {mode==="tracks" && !loadingTr && tracks.length > 0 && (
          <div style={{padding:"10px 16px", borderBottom:`1px solid ${T.border}`, background:T.navy, flexShrink:0, display:"flex", alignItems:"center", gap:"10px"}}>
            <p style={{fontSize:"11px", color:T.muted, whiteSpace:"nowrap", fontWeight:"600"}}>Adding tracks to:</p>
            <select value={targetIdx} onChange={e=>{ setTargetIdx(Number(e.target.value)); setAddedSet(new Set()); }}
              style={{flex:1, background:T.card, color:T.text, border:`1px solid ${T.border}`, borderRadius:"6px", padding:"6px 10px", fontSize:"12px", fontWeight:"600", cursor:"pointer"}}>
              {stages.map((s,i) => <option key={i} value={i}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Body */}
        <div style={{flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column"}}>

          {/* ── Scope-error screen (proactive — shown before any playlist click) ── */}
          {mode==="scope-error" && <ScopeErrorScreen/>}

          {/* ── Playlist grid ── */}
          {mode==="playlists" && (
            loading
              ? <div style={{display:"flex",justifyContent:"center",padding:"40px"}}><Loader size={28} color={T.accent} style={{animation:"spin 1s linear infinite"}}/></div>
              : playlists.length === 0
                ? <p style={{textAlign:"center",color:T.muted,padding:"40px",fontSize:"13px"}}>No playlists found on your Spotify account.</p>
                : <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":isTablet?"repeat(2,1fr)":"repeat(3,1fr)", gap:"10px"}}>
                    {(playlists || []).filter(Boolean).map(pl => {
                      const count = pl.tracks?.total ?? pl.items?.total ?? 0;
                      const myUid = localStorage.getItem("sp_uid");
                      const notMine = myUid && pl.owner?.id && pl.owner.id !== myUid;
                      return (
                        <div key={pl.id} onClick={()=>openPlaylist(pl)}
                          style={{background:T.navy, border:`1px solid ${notMine?T.accent+"30":T.border}`, borderRadius:"10px", cursor:"pointer", overflow:"hidden", transition:"border-color 0.15s, transform 0.12s", opacity:notMine?0.8:1}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.transform="scale(1.02)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=notMine?T.accent+"30":T.border; e.currentTarget.style.transform="scale(1)";}}>
                          <div style={{position:"relative"}}>
                            {pl.images?.[0]?.url
                              ? <img src={pl.images[0].url} style={{width:"100%", aspectRatio:"1", objectFit:"cover"}} alt={pl.name}/>
                              : <div style={{width:"100%", aspectRatio:"1", background:T.card, display:"flex", alignItems:"center", justifyContent:"center"}}><Music size={32} color={T.muted}/></div>
                            }
                            {notMine && <span style={{position:"absolute",top:"6px",right:"6px",fontSize:"9px",fontWeight:"700",color:T.accent,background:T.bg+"dd",borderRadius:"3px",padding:"2px 5px",backdropFilter:"blur(4px)"}}>NOT YOURS</span>}
                          </div>
                          <div style={{padding:"10px"}}>
                            <p style={{fontSize:"12px", fontWeight:"700", color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:"3px"}}>{pl.name}</p>
                            <p style={{fontSize:"10px", color:T.muted}}>{count} {count===1?"song":"songs"}{notMine&&pl.owner?.display_name?` · ${pl.owner.display_name}`:""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
          )}

          {/* ── Track list ── */}
          {mode==="tracks" && (
            loadingTr
              ? <div style={{display:"flex",justifyContent:"center",padding:"40px"}}><Loader size={28} color={T.accent} style={{animation:"spin 1s linear infinite"}}/></div>
              : tracks.length === 0
                ? <div style={{textAlign:"center",padding:"40px 24px"}}>
                    {accessDenied
                      ? <><p style={{fontSize:"20px",marginBottom:"8px"}}>🔒</p>
                          <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"6px"}}>Playlist not accessible</p>
                          <p style={{fontSize:"12px",color:T.muted,marginBottom:"16px",lineHeight:"1.5"}}>
                            {typeof accessDenied === "string" && accessDenied !== "Forbidden"
                              ? accessDenied
                              : "Spotify only allows track access for playlists you own. To use this playlist, import its songs into one of your own Spotify playlists, then access it from 'My playlists' here."}
                          </p>
                          <button onClick={()=>{setMode("playlists");setAccessDenied(false);}} style={{padding:"8px 18px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px",cursor:"pointer",color:T.muted,fontSize:"12px"}}>← Back</button>
                        </>
                      : <p style={{fontSize:"13px",color:T.muted}}>This playlist has no playable tracks.</p>
                    }
                  </div>
                : <div>
                    {tracks.map((t) => {
                      const isAdded = addedSet.has(t.id);
                      return (
                        <div key={t.id} style={{display:"flex", alignItems:"center", gap:"10px", padding:"8px 10px", borderRadius:"8px", marginBottom:"3px", background:isAdded?T.green+"10":T.navy, border:`1px solid ${isAdded?T.green+"40":"transparent"}`, transition:"background 0.2s"}}>
                          {t.album?.images?.[0]?.url
                            ? <img src={t.album.images[0].url} style={{width:"40px",height:"40px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                            : <div style={{width:"40px",height:"40px",background:T.card,borderRadius:"5px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={16} color={T.muted}/></div>
                          }
                          <div style={{flex:1, minWidth:0}}>
                            <p style={{fontSize:"12px",fontWeight:"600",color:isAdded?T.green:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</p>
                            <p style={{fontSize:"11px",color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.artists?.map(a=>a.name).join(", ")}</p>
                          </div>
                          {t.duration_ms > 0 && (
                            <span style={{fontSize:"10px",color:T.muted,flexShrink:0}}>{fmtMs(t.duration_ms)}</span>
                          )}
                          <button onClick={()=>!isAdded&&addOneTrack(t)}
                            style={{flexShrink:0, padding:"6px 14px", background:isAdded?T.green+"20":"#1DB954", color:isAdded?T.green:"white", border:`1px solid ${isAdded?T.green+"60":"transparent"}`, borderRadius:"20px", cursor:isAdded?"default":"pointer", fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap", transition:"all 0.2s"}}>
                            {isAdded ? "✓ Added" : "+ Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
          )}
        </div>

        {/* Footer — bulk actions (tracks view only) */}
        {mode==="tracks" && !loadingTr && tracks.length > 0 && (
          <div style={{padding:"12px 16px", borderTop:`1px solid ${T.border}`, display:"flex", gap:"8px", flexShrink:0, background:T.card}}>
            {bulkAdded
              ? <p style={{color:T.green, fontWeight:"700", fontSize:"13px", margin:"auto"}}>✓ All tracks added!</p>
              : <>
                  <button onClick={addAllToStage}
                    style={{flex:1, padding:"10px", background:T.accent, color:"white", border:"none", borderRadius:"7px", cursor:"pointer", fontSize:"12px", fontWeight:"700"}}>
                    Add all {tracks.length} to "{stages[targetIdx]?.name}"
                  </button>
                  {stages.length > 1 && (
                    <button onClick={distributeAcrossStages} disabled={distributing}
                      style={{flex:1, padding:"10px", background:T.navy, color:distributing?T.muted:T.text, border:`1px solid ${T.border}`, borderRadius:"7px", cursor:distributing?"default":"pointer", fontSize:"12px", fontWeight:"600", transition:"color 0.2s"}}
                      title="Matches each track's BPM to the target range of each stage type, then fills by duration">
                      {distributing ? "⏳ Fetching BPM…" : "🎯 Smart Distribute by BPM"}
                    </button>
                  )}
                </>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DiscoverTab — wger.de ExerciseDB integration ─────────────────────────────
const WGER_CATEGORIES = [
  {id:"",label:"All"},
  {id:"8",label:"Arms"},
  {id:"9",label:"Legs"},
  {id:"10",label:"Abs"},
  {id:"11",label:"Chest"},
  {id:"12",label:"Back"},
  {id:"13",label:"Shoulders"},
  {id:"14",label:"Calves"},
  {id:"15",label:"Cardio"},
];
function DiscoverTab({ onAddExercise }) {
  const [query,     setQuery]     = useState("");
  const [category,  setCategory]  = useState("");
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [detail,    setDetail]    = useState(null);  // expanded exercise detail
  const [loadingDt, setLoadingDt] = useState(false);
  const [addedIds,  setAddedIds]  = useState(new Set());

  const search = async () => {
    if (!query.trim() && !category) return;
    setLoading(true); setError(null); setResults([]); setDetail(null);
    try {
      let url;
      if (query.trim()) {
        url = `https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(query.trim())}&language=english&format=json`;
      } else {
        url = `https://wger.de/api/v2/exercise/?format=json&language=2&category=${category}&limit=30`;
      }
      const r = await fetch(url);
      if (!r.ok) throw new Error("Network error");
      const d = await r.json();
      if (d.suggestions) {
        // Search endpoint returns suggestions
        setResults(d.suggestions.map(s=>({ id:s.data.base_id, name:s.value, category:s.data.category, image:s.data.image_thumbnail })));
      } else {
        // List endpoint returns results array
        const items = d.results || d;
        setResults(items.map(ex=>{
          const trans = (ex.translations||[]).find(t=>t.language===2) || (ex.translations||[])[0] || {};
          return { id:ex.id, name:trans.name||ex.name||"Exercise", category:ex.category?.name||"", image:null, muscles:(ex.muscles||[]).map(m=>m.name_en||m.name).filter(Boolean) };
        }));
      }
    } catch(e) {
      setError("Could not load exercises. Check your connection.");
    }
    setLoading(false);
  };

  const loadDetail = async (id) => {
    if (detail?.id === id) { setDetail(null); return; }
    setLoadingDt(id); setDetail(null);
    try {
      const r = await fetch(`https://wger.de/api/v2/exerciseinfo/${id}/?format=json`);
      const d = await r.json();
      const trans = (d.translations||[]).find(t=>t.language===2) || (d.translations||[])[0] || {};
      setDetail({
        id,
        name:       trans.name    || d.name    || "Exercise",
        desc:       trans.description ? trans.description.replace(/<[^>]+>/g,"") : "",
        muscles:    (d.muscles||[]).map(m=>m.name_en||m.name).filter(Boolean),
        musclesAux: (d.muscles_secondary||[]).map(m=>m.name_en||m.name).filter(Boolean),
        equipment:  (d.equipment||[]).map(e=>e.name).filter(Boolean),
        category:   d.category?.name || "",
      });
    } catch(_) {}
    setLoadingDt(null);
  };

  const handleAdd = (ex) => {
    if (!onAddExercise) return;
    const newEx = {
      id:     "disc_" + ex.id + "_" + Date.now(),
      n:      detail?.name || ex.name,
      s:      "3",
      r:      "10",
      rest:   "30s",
      muscles: (detail?.muscles||[]).join(", ") || ex.muscles?.join(", ") || ex.category || "",
      notes:  detail?.desc ? detail.desc.slice(0, 120) : "",
      timing: "none",
      source: "discover",
    };
    onAddExercise(newEx);
    setAddedIds(prev => new Set([...prev, ex.id]));
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
      {/* Search bar */}
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <p style={{fontSize:"11px",color:T.muted,marginBottom:"8px"}}>Search the wger.de open exercise database · 11,000+ exercises</p>
        <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="e.g. squat, deadlift, plank…"
            style={{flex:1,padding:"8px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",color:T.text,fontSize:"12px",outline:"none"}}
          />
          <button onClick={search} disabled={loading||(!query.trim()&&!category)}
            style={{padding:"8px 16px",background:T.accent,color:"white",border:"none",borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px",opacity:(loading||(!query.trim()&&!category))?0.5:1}}>
            {loading ? <Loader size={13}/> : <Search size={13}/>} Search
          </button>
        </div>
        {/* Category quick-filter pills */}
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
          {WGER_CATEGORIES.map(c=>(
            <button key={c.id} onClick={()=>{ setCategory(c.id); }}
              style={{padding:"3px 10px",borderRadius:"12px",border:`1px solid ${category===c.id?T.accent:T.border}`,background:category===c.id?T.accent+"22":"transparent",color:category===c.id?T.accent:T.muted,fontSize:"10px",fontWeight:"700",cursor:"pointer",transition:"all 0.12s"}}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px"}}>
        {error && <p style={{fontSize:"12px",color:T.accent,padding:"20px",textAlign:"center"}}>{error}</p>}
        {!loading && !error && results.length === 0 && (
          <div style={{textAlign:"center",padding:"40px 20px",color:T.muted}}>
            <p style={{fontSize:"26px",marginBottom:"8px"}}>🏋️</p>
            <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>Search the exercise database</p>
            <p style={{fontSize:"11px"}}>Type an exercise name or pick a category above, then hit Search</p>
          </div>
        )}
        {results.map(ex => {
          const isOpen   = detail?.id === ex.id;
          const isLoading = loadingDt === ex.id;
          const isAdded  = addedIds.has(ex.id);
          return (
            <div key={ex.id} style={{marginBottom:"7px",borderRadius:"10px",border:`1px solid ${isOpen?T.accent+"60":T.border}`,overflow:"hidden",transition:"border-color 0.15s"}}>
              {/* Exercise row */}
              <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 13px",background:T.navy,cursor:"pointer"}}
                onClick={()=>loadDetail(ex.id)}>
                {ex.image
                  ? <img src={ex.image} style={{width:"36px",height:"36px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                  : <div style={{width:"36px",height:"36px",borderRadius:"5px",background:T.border,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>🏋️</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:"13px",fontWeight:"700",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ex.name}</p>
                  <p style={{fontSize:"10px",color:T.muted}}>{ex.category}{(ex.muscles||[]).length?` · ${ex.muscles.slice(0,2).join(", ")}`:""}</p>
                </div>
                <div style={{display:"flex",gap:"5px",alignItems:"center",flexShrink:0}}>
                  {onAddExercise && (
                    <button onClick={e=>{e.stopPropagation();handleAdd(ex);}}
                      style={{padding:"5px 10px",background:isAdded?T.green+"22":T.accent+"22",color:isAdded?T.green:T.accent,border:`1px solid ${isAdded?T.green+"40":T.accent+"40"}`,borderRadius:"6px",cursor:"pointer",fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"3px",whiteSpace:"nowrap"}}>
                      {isAdded ? <><Check size={11}/> Added</> : <><Plus size={11}/> Add</>}
                    </button>
                  )}
                  {isLoading ? <Loader size={13} color={T.muted}/> : <ChevronRight size={13} color={T.muted} style={{transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}/>}
                </div>
              </div>
              {/* Expanded detail */}
              {isOpen && detail && (
                <div style={{padding:"12px 14px",background:T.card,borderTop:`1px solid ${T.border}`}}>
                  {detail.muscles.length > 0 && (
                    <p style={{fontSize:"10px",color:T.accent,fontWeight:"700",marginBottom:"4px"}}>💪 Primary: {detail.muscles.join(", ")}</p>
                  )}
                  {detail.musclesAux.length > 0 && (
                    <p style={{fontSize:"10px",color:T.muted,marginBottom:"4px"}}>Secondary: {detail.musclesAux.join(", ")}</p>
                  )}
                  {detail.equipment.length > 0 && (
                    <p style={{fontSize:"10px",color:T.muted,marginBottom:"6px"}}>Equipment: {detail.equipment.join(", ")}</p>
                  )}
                  {detail.desc && (
                    <p style={{fontSize:"11px",color:T.muted,lineHeight:"1.5",marginBottom:"8px"}}>{detail.desc.slice(0,200)}{detail.desc.length>200?"…":""}</p>
                  )}
                  {onAddExercise && (
                    <button onClick={()=>handleAdd(ex)}
                      style={{padding:"7px 16px",background:isAdded?T.green:T.accent,color:"white",border:"none",borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px"}}>
                      {isAdded ? <><Check size={13}/> Added to Stage</> : <><Plus size={13}/> Add to Stage</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LibraryBrowserModal ──────────────────────────────────────────────────────
function LibraryBrowserModal({ onClose, onAddExercise=null }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const [mainTab, setMainTab] = useState("library");

  const [libData, setLibData] = useState(() => getLibrary());
  const classKeys = Object.keys(libData);

  const [selClass,     setSelClass]     = useState(classKeys[0]);
  const [selSub,       setSelSub]       = useState(null);
  const [selStage,     setSelStage]     = useState("main");
  const [search,       setSearch]       = useState("");
  const [editMode,     setEditMode]     = useState(false);
  const [editingId,    setEditingId]    = useState(null);
  const [draftEx,      setDraftEx]      = useState({});
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toast,        setToast]        = useState(null);

  const cls      = libData[selClass];
  const subKeys  = cls ? Object.keys(cls.subTypes) : [];
  useEffect(() => { setSelSub(subKeys[0]||null); setEditingId(null); }, [selClass]);

  const sub       = cls && selSub ? cls.subTypes[selSub] : null;
  const rawEx     = sub ? (sub[selStage]||[]) : [];
  const exercises = search
    ? rawEx.filter(e=>e.n.toLowerCase().includes(search.toLowerCase())||(e.muscles||"").toLowerCase().includes(search.toLowerCase()))
    : rawEx;
  const classColor = libData[selClass]?.color || T.accent;

  const persist = updated => { setLibData(updated); saveLibrary(updated); };
  const updateExerciseList = newList => persist({...libData,[selClass]:{...cls,subTypes:{...cls.subTypes,[selSub]:{...sub,[selStage]:newList}}}});

  const startEdit  = ex => { setEditingId(ex.id); setDraftEx({...ex}); };
  const cancelEdit = ()  => { setEditingId(null); setDraftEx({}); };
  const saveEdit   = ()  => { updateExerciseList(rawEx.map(e=>e.id===editingId?{...draftEx}:e)); setEditingId(null); showToast("Saved"); };
  const deleteEx   = id  => { if(!window.confirm("Delete this exercise?")) return; updateExerciseList(rawEx.filter(e=>e.id!==id)); showToast("Deleted"); };
  const addNewEx   = ()  => {
    const ex = {id:"custom_"+Date.now(),n:"New Exercise",s:"3",r:"10",rest:"30s",muscles:"",notes:"",timing:"none"};
    updateExerciseList([...rawEx,ex]);
    startEdit(ex);
  };
  const handleReset = () => { resetLibrary(); setLibData(WORKOUT_LIBRARY); setResetConfirm(false); showToast("Reset to defaults"); };
  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null), 2500); };

  // Discover packs data
  const DISCOVER_PACKS = [
    {id:"hyrox12",icon:"🏋",title:"12 Days of Hyrox",author:"CrossFit Mile End",stats:"8 stations · 1.2k imports"},
    {id:"tabata3",icon:"🔥",title:"Tabata Burner Vol. 3",author:"Jungle Editorial",stats:"16 exercises · 940 imports"},
    {id:"5x5",    icon:"💪",title:"5×5 Strength Base",  author:"Mara K.",         stats:"5 lifts · 2.7k imports"},
  ];
  const [importedPacks, setImportedPacks] = useState([]);

  const stageLabels = {warmup:"Warm-up",main:"Main set",cooldown:"Cool-down"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:600,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?"0":"20px"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{
        background:T.card,borderRadius:isMobile?"14px 14px 0 0":"18px",
        border:`1px solid ${T.border}`,
        width:"100%",maxWidth:isTablet?"700px":"1200px",
        height:isMobile?"96vh":"88vh",
        display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
        boxShadow:"0 30px 80px rgba(0,0,0,.45)"
      }}>

        {/* Toast */}
        {toast && <div style={{position:"absolute",top:"12px",left:"50%",transform:"translateX(-50%)",background:T.accent,color:"#fff",padding:"8px 18px",borderRadius:"20px",fontSize:"12px",fontWeight:"700",zIndex:10,pointerEvents:"none",whiteSpace:"nowrap"}}>{toast}</div>}

        {/* ── Top page header ── */}
        <div style={{flexShrink:0,padding:isMobile?"12px 16px":"16px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
          <div>
            <p style={{fontSize:"11px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>EXERCISE LIBRARY</p>
            <p style={{fontSize:"12px",color:T.muted}}>The studio's movement catalogue — editable per gym, with a Discover feed of community packs</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:"8px",padding:"6px 12px",cursor:"pointer",color:T.muted,fontSize:"12px",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
            <X size={13}/> Close
          </button>
        </div>

        {/* ── Body: 3 columns (or stacked on mobile) ── */}
        <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden",minHeight:0}}>

          {/* ── LEFT RAIL: class type list ── */}
          {!isMobile && (
            <div style={{width:"220px",flexShrink:0,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <p style={{fontSize:"10px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1.5px",padding:"14px 18px 8px"}}>CLASS TYPE</p>
              <div style={{flex:1,overflowY:"auto"}}>
                {classKeys.map(k=>{
                  const c = libData[k];
                  const totalCount = Object.values(c.subTypes||{}).reduce((a,sub)=>a+(sub.warmup?.length||0)+(sub.main?.length||0)+(sub.cooldown?.length||0),0);
                  const isActive = selClass===k;
                  return (
                    <button key={k} onClick={()=>setSelClass(k)}
                      style={{
                        width:"100%",textAlign:"left",padding:"10px 18px",border:"none",
                        background:isActive?T.navy:"transparent",cursor:"pointer",
                        display:"flex",alignItems:"center",gap:"10px",
                        borderLeft:isActive?`3px solid ${c.color}`:"3px solid transparent",
                        transition:"background 0.15s"
                      }}>
                      <div style={{width:"9px",height:"9px",borderRadius:"3px",flexShrink:0,background:c.color}}/>
                      <span style={{flex:1,fontSize:"13px",fontWeight:isActive?"700":"500",color:isActive?T.text:T.muted}}>{c.label}</span>
                      <span style={{fontSize:"11px",color:T.muted}}>{totalCount}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{flexShrink:0,padding:"12px 18px",borderTop:`1px solid ${T.border}`}}>
                <button style={{background:"none",border:"none",cursor:"pointer",color:T.muted,fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                  <Plus size={13}/> New class type
                </button>
              </div>
            </div>
          )}

          {/* ── CENTER: library / discover content ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

            {/* Center toolbar */}
            <div style={{flexShrink:0,padding:isMobile?"10px 14px":"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
              {/* Mobile: class type select */}
              {isMobile && (
                <select value={selClass} onChange={e=>setSelClass(e.target.value)}
                  style={{padding:"5px 8px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",color:T.text,fontSize:"12px",cursor:"pointer"}}>
                  {classKeys.map(k=><option key={k} value={k}>{libData[k].icon} {libData[k].label}</option>)}
                </select>
              )}

              {/* My Library / Discover segmented toggle */}
              <div style={{display:"flex",gap:"3px",background:T.navy,borderRadius:"8px",padding:"3px",flexShrink:0}}>
                {[["library","My Library"],["discover","Discover"]].map(([id,lbl])=>(
                  <button key={id} onClick={()=>setMainTab(id)}
                    style={{padding:"5px 14px",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"700",
                      background:mainTab===id?T.card:"transparent",
                      color:mainTab===id?T.text:T.muted,
                      boxShadow:mainTab===id?"0 1px 4px rgba(0,0,0,.3)":"none",transition:"all 0.15s"}}>
                    {lbl}
                  </button>
                ))}
              </div>

              {mainTab==="library" && (
                <>
                  {/* Search */}
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:"7px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"7px 12px",minWidth:"120px"}}>
                    <Search size={13} color={T.muted}/>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search exercises…"
                      style={{background:"none",border:"none",outline:"none",color:T.text,fontSize:"12px",width:"100%"}}/>
                  </div>
                  {/* Edit toggle */}
                  <button onClick={()=>{setEditMode(v=>!v);setEditingId(null);}}
                    style={{padding:"7px 14px",background:editMode?classColor+"22":T.navy,border:`1px solid ${editMode?classColor:T.border}`,borderRadius:"8px",cursor:"pointer",color:editMode?classColor:T.muted,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
                    ✏️ {editMode?"Done":"Edit"}
                  </button>
                  {editMode && <button onClick={()=>setResetConfirm(true)} style={{padding:"7px 12px",background:"transparent",border:"1px solid #EF444440",borderRadius:"8px",cursor:"pointer",color:"#EF4444",fontSize:"11px",fontWeight:"700",flexShrink:0}}>Reset</button>}
                </>
              )}
            </div>

            {mainTab==="discover" ? (
              <DiscoverTab onAddExercise={onAddExercise} onClose={onClose}/>
            ) : (
              <>
                {/* Sub-type filter chips */}
                <div style={{flexShrink:0,padding:"8px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:"6px",overflowX:"auto",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
                  {subKeys.map(sk=>{
                    const s = cls.subTypes[sk];
                    const isActive = selSub===sk;
                    return (
                      <button key={sk} onClick={()=>{setSelSub(sk);setEditingId(null);}}
                        style={{flexShrink:0,padding:"5px 14px",borderRadius:"999px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"700",whiteSpace:"nowrap",
                          background:isActive?classColor:"transparent",
                          color:isActive?"#fff":T.muted,
                          outline:isActive?"none":`1px solid ${T.border}`,
                          transition:"background 0.15s"}}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {/* Stage tabs */}
                <div style={{flexShrink:0,padding:"0 18px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:"0",alignItems:"center"}}>
                  {[["warmup","Warm-up"],["main","Main set"],["cooldown","Cool-down"]].map(([stage,lbl])=>{
                    const cnt = (sub?.[stage]||[]).length;
                    const isActive = selStage===stage;
                    return (
                      <button key={stage} onClick={()=>{setSelStage(stage);setEditingId(null);}}
                        style={{
                          padding:"12px 16px",background:"none",border:"none",cursor:"pointer",
                          fontSize:"13px",fontWeight:"600",whiteSpace:"nowrap",
                          color:isActive?classColor:T.muted,
                          borderBottom:isActive?`2px solid ${classColor}`:"2px solid transparent",
                          transition:"color 0.15s,border-color 0.15s"
                        }}>
                        {lbl} <span style={{fontSize:"11px",opacity:0.7}}>{cnt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Exercise list */}
                <div style={{flex:1,overflowY:"auto",padding:"12px 18px",display:"flex",flexDirection:"column",gap:"6px"}}>
                  {exercises.length===0 && !editMode && (
                    <div style={{textAlign:"center",padding:"40px",color:T.muted}}>
                      <p style={{fontSize:"24px",marginBottom:"8px"}}>🔍</p>
                      <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>No exercises found</p>
                      <p style={{fontSize:"11px"}}>{search?"Try a different search":"No exercises for this stage yet"}</p>
                    </div>
                  )}

                  {exercises.map(ex=>{
                    const isEditing = editMode && editingId===ex.id;
                    return (
                      <div key={ex.id} style={{
                        background:isEditing?classColor+"12":T.navy,
                        border:`1px solid ${isEditing?classColor+"60":T.border}`,
                        borderRadius:"10px",padding:"12px 14px",
                        transition:"border-color 0.15s,background 0.15s"
                      }}>
                        {isEditing ? (
                          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                            <input value={draftEx.n||""} onChange={e=>setDraftEx(d=>({...d,n:e.target.value}))} placeholder="Exercise name *"
                              style={{padding:"6px 10px",background:T.card,border:`1px solid ${classColor}60`,borderRadius:"6px",color:T.text,fontSize:"13px",fontWeight:"700",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                              {[["s","Sets","60px"],["r","Reps / Duration","110px"],["rest","Rest","80px"]].map(([f,p,w])=>(
                                <input key={f} value={draftEx[f]||""} onChange={e=>setDraftEx(d=>({...d,[f]:e.target.value}))} placeholder={p}
                                  style={{padding:"5px 8px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"11px",outline:"none",width:w,boxSizing:"border-box"}}/>
                              ))}
                              <select value={draftEx.timing||"none"} onChange={e=>setDraftEx(d=>({...d,timing:e.target.value}))}
                                style={{padding:"5px 8px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"11px",cursor:"pointer"}}>
                                {["none","emom","tabata","amrap","for time"].map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <input value={draftEx.muscles||""} onChange={e=>setDraftEx(d=>({...d,muscles:e.target.value}))} placeholder="Muscles targeted"
                              style={{padding:"5px 8px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"11px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <textarea value={draftEx.notes||""} onChange={e=>setDraftEx(d=>({...d,notes:e.target.value}))} placeholder="Coaching notes (optional)" rows={2}
                              style={{padding:"5px 8px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"6px",color:T.text,fontSize:"11px",outline:"none",width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            <div style={{display:"flex",gap:"6px",justifyContent:"flex-end"}}>
                              <button onClick={cancelEdit} style={{padding:"5px 14px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>Cancel</button>
                              <button onClick={saveEdit} disabled={!draftEx.n?.trim()} style={{padding:"5px 14px",background:classColor,border:"none",borderRadius:"6px",cursor:"pointer",color:"#fff",fontSize:"11px",fontWeight:"700",opacity:!draftEx.n?.trim()?0.5:1}}>Save Exercise</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                            {/* Drag handle */}
                            <div style={{color:T.muted,fontSize:"14px",flexShrink:0,cursor:"grab",opacity:0.4}}>⠿</div>
                            {/* Info */}
                            <div style={{flex:1,minWidth:0}}>
                              <p style={{fontSize:"14px",fontWeight:"600",color:T.text,marginBottom:"2px"}}>{ex.n}</p>
                              {ex.muscles && <p style={{fontSize:"11px",color:T.muted}}>{ex.muscles}</p>}
                            </div>
                            {/* Tags */}
                            <div style={{display:"flex",gap:"5px",flexShrink:0,alignItems:"center"}}>
                              {ex.timing&&ex.timing!=="none" && (
                                <span style={{fontSize:"10px",padding:"3px 8px",background:classColor+"20",color:classColor,borderRadius:"999px",fontWeight:"700"}}>{ex.timing} work</span>
                              )}
                              {ex.r && <span style={{fontSize:"10px",color:T.muted}}>×{ex.r}{ex.s?` · ${ex.s}×`:""}</span>}
                              {editMode && (
                                <>
                                  <button onClick={()=>startEdit(ex)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",padding:"4px 8px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>✏️</button>
                                  <button onClick={()=>deleteEx(ex.id)} style={{background:"transparent",border:"1px solid #EF444430",borderRadius:"6px",padding:"4px 8px",cursor:"pointer",color:"#EF4444",fontSize:"11px"}}>🗑️</button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add exercise dashed row */}
                  {editMode && sub && !search && (
                    <button onClick={addNewEx} style={{padding:"14px",background:"transparent",border:`2px dashed ${classColor}40`,borderRadius:"10px",cursor:"pointer",color:classColor,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",marginTop:"4px"}}>
                      + Add exercise to this set
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT RAIL: Discover packs ── */}
          {!isMobile && !isTablet && (
            <div style={{width:"300px",flexShrink:0,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{flexShrink:0,padding:"16px 18px 10px"}}>
                <p style={{fontSize:"14px",fontWeight:"700",color:T.text,marginBottom:"3px"}}>Discover packs</p>
                <p style={{fontSize:"11px",color:T.muted}}>Community workouts — one tap to import</p>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"6px 14px"}}>
                {DISCOVER_PACKS.map(pack=>(
                  <div key={pack.id} style={{background:T.navy,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"14px",marginBottom:"10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                      <div style={{width:"36px",height:"36px",borderRadius:"9px",background:classColor+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0}}>{pack.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"2px"}}>{pack.title}</p>
                        <p style={{fontSize:"11px",color:T.muted}}>by {pack.author}</p>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:"11px",color:T.muted}}>{pack.stats}</span>
                      <button
                        onClick={()=>setImportedPacks(p=>p.includes(pack.id)?p:[...p,pack.id])}
                        style={{padding:"5px 12px",background:importedPacks.includes(pack.id)?"transparent":T.card,border:`1px solid ${importedPacks.includes(pack.id)?T.muted:classColor}`,borderRadius:"6px",cursor:"pointer",color:importedPacks.includes(pack.id)?T.muted:classColor,fontSize:"11px",fontWeight:"700"}}>
                        {importedPacks.includes(pack.id)?"✓ Imported":"Import"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{flexShrink:0,padding:"12px 18px",borderTop:`1px solid ${T.border}`}}>
                <p style={{fontSize:"10px",color:T.muted,lineHeight:"1.5"}}>Every imported exercise keeps its BPM hints, so the Auto-DJ scores it automatically.</p>
              </div>
            </div>
          )}
        </div>

        {/* Reset overlay */}
        {resetConfirm && (
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,borderRadius:"18px"}}>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"24px",maxWidth:"340px",textAlign:"center"}}>
              <p style={{fontSize:"28px",marginBottom:"8px"}}>⚠️</p>
              <p style={{fontSize:"15px",fontWeight:"700",color:T.text,marginBottom:"8px"}}>Reset to Defaults?</p>
              <p style={{fontSize:"12px",color:T.muted,marginBottom:"18px",lineHeight:"1.5"}}>All custom exercises will be removed and the built-in library restored.</p>
              <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                <button onClick={()=>setResetConfirm(false)} style={{padding:"8px 20px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"12px"}}>Cancel</button>
                <button onClick={handleReset} style={{padding:"8px 20px",background:"#EF4444",border:"none",borderRadius:"7px",cursor:"pointer",color:"#fff",fontSize:"12px",fontWeight:"700"}}>Reset Library</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BuilderScreen({stages, onStageChange, onAddStage, onRemoveStage, onRemoveTrack, onAddTrack, onReorderTrack, sessionName, onSessionNameChange, onStartSession, onReorderStages, onMoveExercise, onOverviewDisplay, classChoice, onClassChoiceChange, onDjClass, djProgress}) {
  const vw = useWindowWidth();
  const isMobile  = vw < 480;
  const isTablet  = vw < 768;
  const [showPlaylistModal,  setShowPlaylistModal]  = useState(false);
  const [showLibraryModal,   setShowLibraryModal]   = useState(false);
  const [distributeToast,    setDistributeToast]    = useState(null); // {msg}
  const [selIdx, setSelIdx] = useState(0);

  // Retroactively enrich BPM for any tracks already in stages (e.g. loaded from localStorage)
  const stageTrackIds = stages.flatMap(s=>(s.tracks||[]).map(t=>t.id)).join(",");
  useEffect(() => {
    const allTracks = stages.flatMap(s => s.tracks || []);
    if (!allTracks.some(t => t.id && !t.bpm)) return;
    enrichTracksWithBpm(allTracks).then(enriched => {
      const enrichMap = Object.fromEntries(enriched.map(t=>[t.id, t.bpm]));
      stages.forEach((s, idx) => {
        if (!(s.tracks||[]).some(t => t.id && !t.bpm && enrichMap[t.id])) return;
        onStageChange(idx, { ...s, tracks: s.tracks.map(t => t.bpm ? t : { ...t, bpm: enrichMap[t.id]||0 }) });
      });
    }).catch(()=>{});
  }, [stageTrackIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingEx, setEditingEx] = useState(null);
  const [subTab, setSubTab] = useState("exercises"); // "exercises"|"music"|"groups"|"queue"
  // Pending template change — { classType, subType } — shown when stages have custom exercises
  const [templatePrompt, setTemplatePrompt] = useState(null);

  // Class type / sub-type selection
  const classKeys = Object.keys(WORKOUT_LIBRARY);
  const selectedClass   = classChoice?.classType || classKeys[0];
  const selectedSubKeys = Object.keys(WORKOUT_LIBRARY[selectedClass]?.subTypes || {});
  const selectedSub     = classChoice?.subType || selectedSubKeys[0] || null;

  // Helper: does a stage have any manually-authored exercises?
  const hasCustomExercises = s => (s.exercises||[]).some(e => !e.source || e.source !== "library");
  const anyCustom = stages.some(hasCustomExercises);

  // Apply a template + immediately smart-distribute exercises from the library
  const applyTemplate = (classType, subType) => {
    const newStages = buildStagesFromTemplate(classType, subType);
    if (!newStages) return;
    // Replace entire stage list
    onReorderStages(newStages);
    setSelIdx(0);
    setTemplatePrompt(null);
    // Auto-distribute library exercises into the fresh stages
    const lib = getLibrary();
    const distributed = distributeLibraryExercises(classType, subType, newStages, lib);
    // We need a tiny delay so onReorderStages state update settles first
    setTimeout(() => {
      distributed.forEach((s, i) => onStageChange(i, s));
      const clsInfo = lib[classType];
      const subInfo = clsInfo?.subTypes?.[subType];
      const total   = distributed.reduce((a, s) => a + (s.exercises?.length||0), 0);
      setDistributeToast({msg:`✅ ${clsInfo?.icon} ${clsInfo?.label} — ${subInfo?.label||subType} · ${newStages.length} stages · ${total} exercises loaded`});
      setTimeout(()=>setDistributeToast(null), 4000);
    }, 50);
  };

  // Add an exercise discovered in the ExerciseDB to the currently-selected stage
  const handleAddLibraryExercise = (ex) => {
    const idx = Math.min(selIdx, stages.length - 1);
    if (idx < 0) return;
    const s = stages[idx];
    onStageChange(idx, { ...s, exercises: [...(s.exercises||[]), {...ex, id:"disc_"+Date.now()}] });
  };

  // Handle class type change from the selector
  const handleClassChange = (classType) => {
    const firstSub = Object.keys(WORKOUT_LIBRARY[classType]?.subTypes||{})[0]||null;
    onClassChoiceChange({classType, subType:firstSub});
    if (anyCustom) {
      setTemplatePrompt({classType, subType:firstSub});
    } else {
      applyTemplate(classType, firstSub);
    }
  };

  // Handle sub-type change from the selector
  const handleSubChange = (subType) => {
    onClassChoiceChange({classType:selectedClass, subType});
    if (anyCustom) {
      setTemplatePrompt({classType:selectedClass, subType});
    } else {
      applyTemplate(selectedClass, subType);
    }
  };
  const [musicTargetIdx, setMusicTargetIdx] = useState(0);
  // Keep musicTargetIdx in sync when user clicks a different stage
  useEffect(() => { setMusicTargetIdx(selIdx); }, [selIdx]);
  // Stage drag-and-drop state
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  // Track queue drag-and-drop state
  const trackDragIdx = useRef(null);
  const [trackDragOver, setTrackDragOver] = useState(null);
  const handleTrackDragStart = (e, i) => { trackDragIdx.current = i; e.dataTransfer.effectAllowed = "move"; };
  const handleTrackDragOver  = (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setTrackDragOver(i); };
  const handleTrackDrop      = (e, i) => { e.preventDefault(); setTrackDragOver(null); const from=trackDragIdx.current; if(from===null||from===i) return; onReorderTrack(selIdx, from, i); trackDragIdx.current=null; };
  const handleTrackDragEnd   = ()     => { setTrackDragOver(null); trackDragIdx.current = null; };
  const stage = stages[Math.min(selIdx, stages.length-1)];
  const totalDur = stages.reduce((a,s)=>a+s.dur,0);

  const addEx = () => {
    onStageChange(selIdx, {...stage, exercises:[...stage.exercises, {id:uid(),n:"New Exercise",s:"3",r:"10",rest:"30s"}]});
    setEditingEx(stage.exercises.length);
  };
  const updEx = (i,f,v) => onStageChange(selIdx, {...stage, exercises:stage.exercises.map((e,j)=>j===i?{...e,[f]:v}:e)});
  const delEx = i => { onStageChange(selIdx, {...stage, exercises:stage.exercises.filter((_,j)=>j!==i)}); if(editingEx===i) setEditingEx(null); };

  // Group helpers (GROUP_PALETTE is module-level)
  const addGroup = () => {
    const grps = stage.groups||[];
    onStageChange(selIdx, {...stage, groups:[...grps, {id:uid(),name:`Group ${grps.length+1}`,exercise:""}]});
  };
  const updGroup = (gi,field,val) => onStageChange(selIdx, {...stage, groups:(stage.groups||[]).map((g,j)=>j===gi?{...g,[field]:val}:g)});
  const delGroup = gi => onStageChange(selIdx, {...stage, groups:(stage.groups||[]).filter((_,j)=>j!==gi)});

  const handleDragStart = (e, i) => { dragIdx.current = i; e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver  = (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(i); };
  const handleDrop      = (e, i) => {
    e.preventDefault();
    setDragOver(null);
    const from = dragIdx.current;
    if (from === null || from === i) return;
    const arr = [...stages];
    const [moved] = arr.splice(from, 1);
    arr.splice(i, 0, moved);
    onReorderStages(arr);
    setSelIdx(i);
    dragIdx.current = null;
  };
  const handleDragEnd = () => { setDragOver(null); dragIdx.current = null; };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg}}>

      {/* TOP BAR */}
      <div style={{height:"84px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",flexShrink:0,background:T.card,gap:"12px"}}>
        {/* Left: back + session name */}
        <div style={{display:"flex",alignItems:"center",gap:"14px",minWidth:0,flex:1}}>
          <button onClick={()=>onOverviewDisplay()} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",flexShrink:0,padding:"4px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"16px":"21px",fontWeight:"700",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:isMobile?"140px":"320px"}}>{sessionName||"Untitled Session"}</span>
              <button onClick={()=>{const n=prompt("Session name:",sessionName);if(n)onSessionNameChange(n);}} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"2px",display:"flex",flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            </div>
            {!isMobile && <div style={{fontSize:"12px",color:T.muted}}>
              {Math.round(totalDur/60)} min · {stages.length} stages · {WORKOUT_LIBRARY[selectedClass]?.label||selectedClass} · target RPE 7–8
            </div>}
          </div>
        </div>
        {/* Right: action buttons */}
        {!isMobile && (
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
            <button onClick={onOverviewDisplay} style={{border:`1px solid ${T.border}`,background:"transparent",color:T.text,fontWeight:"600",fontSize:"13px",padding:"9px 15px",borderRadius:"9px",cursor:"pointer"}}>
              Preview on TV
            </button>
            <button onClick={()=>{ onStartSession(); }}
              style={{border:"none",background:T.accent,color:T.bg,fontWeight:"700",fontSize:"13px",padding:"9px 17px",borderRadius:"9px",cursor:"pointer"}}>
              Add to schedule
            </button>
          </div>
        )}
      </div>

      {/* Class type selector + DJ row */}
      <div style={{padding:isMobile?"8px 14px":"12px 24px",borderBottom:`1px solid ${T.border}`,background:T.card,display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
        {!isMobile && <span style={{fontSize:"10px",color:T.muted,fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Class</span>}
        <select value={selectedClass} onChange={e=>handleClassChange(e.target.value)}
          style={{padding:"5px 8px",background:T.navy,border:`1px solid ${WORKOUT_LIBRARY[selectedClass]?.color||T.border}`,borderRadius:"7px",color:T.text,fontSize:isMobile?"11px":"12px",cursor:"pointer",fontWeight:"600",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
          {classKeys.map(k=><option key={k} value={k}>{WORKOUT_LIBRARY[k].icon} {WORKOUT_LIBRARY[k].label}</option>)}
        </select>
        {selectedSubKeys.length > 0 && <>
          {!isMobile && <span style={{fontSize:"10px",color:T.muted,fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Style</span>}
          <select value={selectedSub||""} onChange={e=>handleSubChange(e.target.value)}
            style={{padding:"5px 8px",background:T.navy,border:`1px solid ${WORKOUT_LIBRARY[selectedClass]?.color||T.border}`,borderRadius:"7px",color:T.text,fontSize:isMobile?"11px":"12px",cursor:"pointer",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
            {selectedSubKeys.map(sk=><option key={sk} value={sk}>{WORKOUT_LIBRARY[selectedClass].subTypes[sk].label}</option>)}
          </select>
        </>}
        <button onClick={()=>setShowLibraryModal(true)}
          style={{padding:"5px 10px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",flexShrink:0,minHeight:"30px"}}>
          📚 {!isMobile && "Browse "}Library
        </button>
        <button title="Smart Distribute"
          onClick={()=>{
            const lib = getLibrary();
            const allNew = distributeLibraryExercises(selectedClass, selectedSub, stages, lib);
            const filled = allNew.filter(s=>(s.exercises||[]).length>0).length;
            if (filled === 0) { setDistributeToast({msg:"No exercises found — try a different class or style"}); setTimeout(()=>setDistributeToast(null),3500); return; }
            allNew.forEach((s,i)=>onStageChange(i,s));
            const clsInfo = lib[selectedClass]; const subInfo = clsInfo?.subTypes?.[selectedSub];
            const totalEx = allNew.reduce((a,s)=>a+(s.exercises?.length||0),0);
            setDistributeToast({msg:`⚡ ${totalEx} exercises across ${filled} stage${filled!==1?"s":""}`});
            setTimeout(()=>setDistributeToast(null),4000);
          }}
          style={{padding:"5px 10px",background:T.accent+"18",border:`1px solid ${T.accent}50`,borderRadius:"7px",cursor:"pointer",color:T.accent,fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",flexShrink:0,minHeight:"30px"}}>
          ⚡ {!isMobile && "Smart "}Distribute
        </button>
        <button onClick={onDjClass} disabled={djProgress?.active}
          style={{display:"flex",alignItems:"center",gap:"6px",padding:isMobile?"6px 10px":"8px 14px",background:djProgress?.active?T.border:"linear-gradient(135deg,#1DB954,#148a3d)",color:"#fff",border:"none",borderRadius:"8px",cursor:djProgress?.active?"wait":"pointer",fontSize:isMobile?"12px":"13px",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0}}>
          {djProgress?.active ? "⏳ DJ'ing..." : "🎧 DJ This Class"}
        </button>
      </div>

      {/* DJ progress bar */}
      {djProgress?.active && (
        <div style={{padding:"8px 24px",display:"flex",flexDirection:"column",gap:"4px",background:T.card,borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:T.muted}}>
            <span>{djProgress.message}</span><span>{djProgress.pct}%</span>
          </div>
          <div style={{height:"4px",background:T.border,borderRadius:"2px"}}>
            <div style={{height:"100%",width:`${djProgress.pct}%`,background:T.green,borderRadius:"2px",transition:"width 0.5s ease"}}/>
          </div>
        </div>
      )}

      {/* Template change banner */}
      {templatePrompt && (
        <div style={{padding:"10px 24px",background:"#F59E0B18",borderBottom:`1px solid #F59E0B50`,display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{fontSize:"11px",color:T.text,flex:1,minWidth:"200px"}}>
            <span style={{fontWeight:"700",color:"#F59E0B"}}>⚠️ Apply {WORKOUT_LIBRARY[templatePrompt.classType]?.icon} {WORKOUT_LIBRARY[templatePrompt.classType]?.label} template?</span>
            {" "}This will replace your current stages.
          </span>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>setTemplatePrompt(null)} style={{padding:"5px 12px",background:"transparent",border:`1px solid ${T.border}`,borderRadius:"6px",cursor:"pointer",color:T.muted,fontSize:"11px"}}>Keep Current</button>
            <button onClick={()=>applyTemplate(templatePrompt.classType,templatePrompt.subType)} style={{padding:"5px 12px",background:T.accent,border:"none",borderRadius:"6px",cursor:"pointer",color:T.bg,fontSize:"11px",fontWeight:"700"}}>Apply</button>
          </div>
        </div>
      )}

      {/* Distribute toast */}
      {distributeToast && (
        <div style={{position:"fixed",bottom:"80px",left:"50%",transform:"translateX(-50%)",background:T.navy,border:`1px solid ${T.accent}50`,borderRadius:"10px",padding:"12px 20px",color:T.text,fontSize:"13px",fontWeight:"600",zIndex:200,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",pointerEvents:"none",whiteSpace:"nowrap"}}>
          {distributeToast.msg}
        </div>
      )}

      {/* THREE-COLUMN BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* LEFT COLUMN: Stage list */}
        <div style={{flex:1.7,display:"flex",flexDirection:"column",borderRight:isTablet?"none":`1px solid ${T.border}`,minWidth:0,overflowY:"auto",padding:"20px 24px",gap:"12px"}}>
          {stages.map((s, i) => {
            const cfg = SCFG[s.type] || SCFG.circuit;
            const isOpen = selIdx === i;
            return (
              <div key={s.id}
                draggable onDragStart={e=>handleDragStart(e,i)} onDragOver={e=>handleDragOver(e,i)} onDrop={e=>handleDrop(e,i)} onDragEnd={handleDragEnd}
                onClick={()=>setSelIdx(i)}
                style={{border:`1px solid ${isOpen?T.accent:T.border}`,borderRadius:"14px",overflow:"hidden",background:T.card,cursor:"pointer",boxShadow:isOpen?`0 0 0 1px ${T.accent}20`:undefined,opacity:dragOver===i?0.6:1,transition:"opacity 0.15s"}}>
                {/* Stage header */}
                <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 16px",background:isOpen?"transparent":T.navy}}>
                  <div style={{width:"3px",height:"26px",borderRadius:"2px",background:cfg.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"14px",fontWeight:"700",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                    <div style={{fontSize:"11px",color:T.muted}}>{s.type} · {fmt(s.dur)}</div>
                  </div>
                  <span style={{fontSize:"11px",color:T.muted,flexShrink:0}}>{(s.exercises||[]).length} ex</span>
                  <button onClick={e=>{e.stopPropagation();onRemoveStage(i);}} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"4px",display:"flex",flexShrink:0}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                {/* Exercise list when expanded */}
                {isOpen && (s.exercises||[]).length > 0 && (
                  <div style={{padding:"6px 14px 10px"}}>
                    {(s.exercises||[]).map((ex,ei)=>(
                      <div key={ei} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 6px",borderBottom:ei<(s.exercises||[]).length-1?`1px solid ${T.border}`:"none"}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.8">
                          <circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>
                          <circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>
                        </svg>
                        <div style={{flex:1,fontSize:"13px",color:T.text}}>{ex.n}</div>
                        <div style={{fontSize:"12px",color:T.muted}}>{[ex.s&&`${ex.s}×`,ex.r,ex.rest&&`· ${ex.rest}`].filter(Boolean).join(" ")}</div>
                      </div>
                    ))}
                    <button onClick={e=>{e.stopPropagation();addEx();}}
                      style={{marginTop:"8px",width:"100%",padding:"7px",background:"transparent",border:`1px dashed ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      Add exercise
                    </button>
                  </div>
                )}
                {isOpen && (s.exercises||[]).length === 0 && (
                  <div style={{padding:"10px 14px"}}>
                    <button onClick={e=>{e.stopPropagation();addEx();}}
                      style={{width:"100%",padding:"10px",background:"transparent",border:`1px dashed ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      Add exercise
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add stage button */}
          <button onClick={onAddStage}
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"9px",padding:"11px",border:`1px dashed ${T.border}`,borderRadius:"11px",color:T.muted,fontSize:"13px",fontWeight:"600",background:"transparent",cursor:"pointer",width:"100%"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
            Add stage
          </button>

          {/* Mobile: start session button */}
          {isMobile && (
            <button onClick={onStartSession}
              style={{padding:"14px",background:T.accent,color:T.bg,border:"none",borderRadius:"10px",cursor:"pointer",fontWeight:"700",fontSize:"14px",width:"100%",marginTop:"8px"}}>
              ▶ Start Session
            </button>
          )}
        </div>

        {/* CENTER COLUMN: Tabs panel (hidden on mobile) */}
        {!isMobile && (
          <div style={{flex:1,display:"flex",flexDirection:"column",borderRight:isTablet?"none":`1px solid ${T.border}`,minWidth:0,overflow:"hidden"}}>
            {/* Tabs */}
            <div style={{height:"56px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"flex-end",padding:"0 22px",gap:"22px",flexShrink:0,background:T.card}}>
              {["Soundtrack","Exercise Library","Settings"].map(tab=>(
                <button key={tab} onClick={()=>setSubTab(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")}
                  style={{paddingBottom:"14px",fontWeight:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?"700":"600",color:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?T.accent:T.muted,background:"none",border:"none",borderBottom:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?`2px solid ${T.accent}`:"2px solid transparent",cursor:"pointer",fontSize:"14px",whiteSpace:"nowrap"}}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Soundtrack tab */}
            {subTab==="music" && (
              <div style={{flex:1,padding:"22px",display:"flex",flexDirection:"column",gap:"16px",overflowY:"auto"}}>
                {/* Match music toggle */}
                <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px",borderRadius:"12px",background:`linear-gradient(160deg,${T.navy},${T.card})`,border:`1px solid ${T.accent}`}}>
                  <div style={{width:"34px",height:"34px",borderRadius:"9px",background:"rgba(123,227,164,.14)",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="7" cy="18" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M9.5 18V6l11-2v10"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>Match music to structure</div>
                    <div style={{fontSize:"11px",color:T.muted}}>BPM follows each stage's intensity</div>
                  </div>
                  <div style={{width:"38px",height:"22px",borderRadius:"11px",background:T.accent,position:"relative",flexShrink:0,cursor:"pointer"}}>
                    <div style={{position:"absolute",right:"2px",top:"2px",width:"18px",height:"18px",borderRadius:"50%",background:T.bg}}/>
                  </div>
                </div>

                {/* Energy curve */}
                <div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                    <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:T.text}}>ENERGY CURVE</div>
                    <div style={{fontSize:"11px",color:T.muted}}>peak intensity</div>
                  </div>
                  <div style={{position:"relative",height:"100px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",overflow:"hidden"}}>
                    <svg width="100%" height="100" viewBox="0 0 400 100" preserveAspectRatio="none" style={{display:"block"}}>
                      <defs><linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T.accent} stopOpacity="0.4"/><stop offset="1" stopColor={T.accent} stopOpacity="0"/></linearGradient></defs>
                      <path d="M0,80 C40,72 70,60 120,54 C170,48 180,32 220,26 C260,20 280,10 320,10 C360,10 380,20 400,24 L400,100 L0,100 Z" fill="url(#eg2)"/>
                      <path d="M0,80 C40,72 70,60 120,54 C170,48 180,32 220,26 C260,20 280,10 320,10 C360,10 380,20 400,24" fill="none" stroke={T.accent} strokeWidth="2.5"/>
                    </svg>
                    {/* Stage labels */}
                    <div style={{position:"absolute",left:0,right:0,bottom:0,display:"flex",fontSize:"9px",color:T.muted,textAlign:"center",borderTop:`1px solid ${T.border}`}}>
                      {stages.slice(0,4).map((s,i)=>(
                        <div key={i} style={{flex:1,padding:"4px 0",borderRight:i<Math.min(stages.length,4)-1?`1px solid ${T.border}`:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:i===selIdx?T.accent:T.muted,fontWeight:i===selIdx?"700":"400"}}>
                          {s.name.slice(0,6).toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Track list */}
                {stage && (
                  <div style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"14px",display:"flex",flexDirection:"column",minHeight:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                      <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:T.text}}>TRACKS — {stage.name.toUpperCase()}</div>
                      <div style={{fontSize:"11px",color:T.accent}}>{(stage.tracks||[]).length} tracks</div>
                    </div>
                    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"8px"}}>
                      {(stage.tracks||[]).map((t,ti)=>(
                        <div key={ti}
                          draggable onDragStart={e=>handleTrackDragStart(e,ti)} onDragOver={e=>handleTrackDragOver(e,ti)} onDrop={e=>handleTrackDrop(e,ti)} onDragEnd={handleTrackDragEnd}
                          style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"8px",background:trackDragOver===ti?T.navy:"transparent",border:`1px solid ${trackDragOver===ti?T.border:"transparent"}`,cursor:"grab"}}>
                          <div style={{width:"32px",height:"32px",borderRadius:"7px",background:"repeating-linear-gradient(45deg,#1b2a20,#1b2a20 4px,#22382a 4px,#22382a 8px)",flexShrink:0,overflow:"hidden"}}>
                            {t.album?.images?.[0]?.url && <img src={t.album.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"12px",fontWeight:"600",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
                            <div style={{fontSize:"11px",color:T.muted}}>{t.artists?.[0]?.name}{t.bpm?` · ${Math.round(t.bpm)} BPM`:""}</div>
                          </div>
                          <button onClick={()=>onRemoveTrack(selIdx,ti)} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"3px",display:"flex"}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ))}
                      {(stage.tracks||[]).length === 0 && (
                        <div style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"20px 0"}}>No tracks yet — use DJ This Class or add manually</div>
                      )}
                    </div>
                    <button onClick={()=>setShowPlaylistModal(true)}
                      style={{marginTop:"10px",border:`1px solid ${T.border}`,background:"transparent",color:T.text,fontWeight:"600",fontSize:"13px",padding:"10px",borderRadius:"9px",cursor:"pointer"}}>
                      + Add tracks
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Exercise Library tab */}
            {subTab==="exercises" && (
              <div style={{flex:1,overflowY:"auto"}}>
                <LibraryBrowserModal onClose={()=>setSubTab("music")} onAddExercise={handleAddLibraryExercise}/>
              </div>
            )}

            {/* Settings tab */}
            {subTab==="settings" && stage && (
              <div style={{flex:1,padding:"22px",display:"flex",flexDirection:"column",gap:"16px",overflowY:"auto"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>{stage.name} — Settings</div>
                <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                  <div>
                    <label style={{fontSize:"11px",color:T.muted,fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage name</label>
                    <input value={stage.name} onChange={e=>onStageChange(selIdx,{...stage,name:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",color:T.text,fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:"11px",color:T.muted,fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Duration (minutes)</label>
                    <input type="number" min="1" max="60" value={Math.round(stage.dur/60)}
                      onChange={e=>onStageChange(selIdx,{...stage,dur:parseInt(e.target.value||"1")*60})}
                      style={{width:"100%",padding:"8px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",color:T.text,fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:"11px",color:T.muted,fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage type</label>
                    <select value={stage.type} onChange={e=>onStageChange(selIdx,{...stage,type:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",color:T.text,fontSize:"13px",marginTop:"5px",outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
                      {Object.entries(SCFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RIGHT COLUMN: Auto-DJ panel (desktop only, non-tablet) */}
        {!isMobile && !isTablet && (
          <div style={{width:"300px",display:"flex",flexDirection:"column",flexShrink:0,borderLeft:`1px solid ${T.border}`,background:T.card,overflow:"hidden"}}>
            <div style={{padding:"20px 20px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"15px",fontWeight:"700",color:T.text,marginBottom:"4px"}}>Auto-DJ</div>
              <div style={{fontSize:"11px",color:T.muted}}>BPM matched per stage</div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
              {/* BPM range per stage */}
              <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"16px"}}>
                {stages.map((s,i)=>{
                  const cfg = SCFG[s.type]||SCFG.circuit;
                  const bpm = s.type==="warmup"?"88–100":s.type==="cooldown"?"80–90":s.type==="hiit"?"132–140":s.type==="strength"?"110–120":"120–130";
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <div style={{width:"3px",height:"18px",background:cfg.color,borderRadius:"2px",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"11px",fontWeight:"600",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                      </div>
                      <div style={{fontSize:"11px",color:T.muted,flexShrink:0}}>{bpm}</div>
                    </div>
                  );
                })}
              </div>
              <button onClick={onDjClass} disabled={djProgress?.active}
                style={{width:"100%",padding:"12px",background:djProgress?.active?T.border:T.accent,color:djProgress?.active?T.muted:T.bg,border:"none",borderRadius:"9px",cursor:djProgress?.active?"wait":"pointer",fontSize:"13px",fontWeight:"700"}}>
                {djProgress?.active?"⏳ DJ'ing...":"🎧 DJ This Class"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showPlaylistModal && (
        <SpotifySearchModal
          onClose={()=>setShowPlaylistModal(false)}
          onSelectTrack={t=>{ onAddTrack(selIdx, t); setShowPlaylistModal(false); }}
        />
      )}
      {showLibraryModal && <LibraryBrowserModal onClose={()=>setShowLibraryModal(false)} onAddExercise={handleAddLibraryExercise}/>}
    </div>
  );
}

// ─── LiveScreen ───────────────────────────────────────────────────────────────
function LiveScreen({stages, onBack, liveState, onPlayPause, player, deviceId, spPaused, nowPlaying, onDisplayMode, onNextStage, onSkipTimer, onAddTrack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const stage = stages[liveState.idx];
  const dur = stage?.dur||1;
  const elapsed = liveState.elapsed;
  const remaining = Math.max(0, dur - elapsed);
  const progress = elapsed / dur;
  const totalDur = stages.reduce((a,s)=>a+s.dur,0);
  const cfg = SCFG[stage?.type]||SCFG.circuit;

  // Feature 7: on-the-fly search overlay
  const [showLiveSearch, setShowLiveSearch] = useState(false);
  const [liveSearchStageIdx, setLiveSearchStageIdx] = useState(liveState.idx);

  // Feature 7: Mic Mode / Volume Ducking
  // When active, ducks Spotify to 20% so the instructor can speak; restores to 80% on toggle-off.
  const NORMAL_VOL = 0.8;
  const DUCKED_VOL = 0.2;
  const [micMode, setMicMode] = useState(false);
  const handleMicMode = () => {
    const next = !micMode;
    setMicMode(next);
    if (player) player.setVolume(next ? DUCKED_VOL : NORMAL_VOL).catch(()=>{});
  };
  // Restore normal volume on unmount (e.g. leaving Live screen with mic mode on)
  useEffect(() => {
    return () => { if (player && micMode) player.setVolume(NORMAL_VOL).catch(()=>{}); };
  }, [player, micMode]);

  // F15: Keyboard shortcuts — Space=play/pause, N=next stage, ←/→=skip ±10s, S=search, M=mic mode, Esc=back
  useEffect(() => {
    const onKey = (e) => {
      // Ignore if user is typing in an input/textarea/select
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); handlePlayPause(); }
      else if (e.key === "n" || e.key === "N") { onNextStage(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onSkipTimer(10); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); onSkipTimer(-10); }
      else if (e.key === "s" || e.key === "S") { setLiveSearchStageIdx(liveState.idx); setShowLiveSearch(true); }
      else if (e.key === "m" || e.key === "M") { handleMicMode(); }
      else if (e.key === "Escape") { if (showLiveSearch) setShowLiveSearch(false); else onBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveState.playing, liveState.idx, showLiveSearch, micMode]);

  // Color-coded timer: green >50%, amber 25-50%, red <25%
  const ratio = remaining / dur;
  const timerColor = ratio > 0.5 ? cfg.color : ratio > 0.25 ? "#F59E0B" : T.accent;
  const isPulsing = remaining <= 10 && remaining > 0 && liveState.playing;
  const hasNoTracks = !stage?.tracks?.length;

  const handlePlayPause = () => {
    const willPlay = !liveState.playing; // direction BEFORE toggling
    onPlayPause();
    if (!player || !deviceId) return;
    if (willPlay) {
      const uris = stage?.tracks?.map(t=>t.uri).filter(Boolean)||[];
      if (uris.length) {
        // Check if the currently playing Spotify track belongs to this stage's queue
        const currentUri = nowPlaying?.uri;
        const isStageTrackPlaying = currentUri && uris.includes(currentUri);
        if (isStageTrackPlaying) {
          // Resume the same track — don't restart from beginning
          player.resume().catch(()=>{});
        } else {
          // Load this stage's tracks (either nothing is playing, or the wrong song is)
          apiPlay(deviceId, uris).catch(()=>{});
        }
      } else {
        // No tracks queued for this stage — just resume whatever Spotify has
        player.resume().catch(()=>{});
      }
    } else {
      player.pause().catch(()=>{});
    }
  };

  // Auto-play/pause when stage advances based on whether new stage has tracks
  useEffect(() => {
    const uris = stage?.tracks?.map(t=>t.uri).filter(Boolean)||[];
    if (!deviceId || !liveState.playing) return;
    if (uris.length) {
      // If the current Spotify track is already from this stage (e.g. returning from
      // Display Mode), don't restart — just leave it playing where it is.
      const currentUri = nowPlaying?.uri;
      const isAlreadyPlayingStageTrack = currentUri && uris.includes(currentUri);
      if (!isAlreadyPlayingStageTrack) {
        apiPlay(deviceId, uris).catch(()=>{});
      }
    } else {
      // No tracks for this stage — pause Spotify automatically
      if (player) player.pause().catch(()=>{});
    }
  }, [liveState.idx]);

  // Pause Spotify when navigating away — but NOT when going to Display Mode
  const goingToDisplayRef = useRef(false);
  const handleDisplayMode = () => { goingToDisplayRef.current = true; onDisplayMode(); };
  useEffect(() => {
    return () => {
      if (!goingToDisplayRef.current && player) player.pause().catch(()=>{});
      goingToDisplayRef.current = false;
    };
  }, [player]);

  return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:isMobile?"flex-start":"center",
      background:"#000", overflowY:"auto", padding:isMobile?"0":"20px", boxSizing:"border-box"
    }}>
      {/* Tablet bezel — shown on non-mobile */}
      <div style={{
        width:"100%", maxWidth:isMobile?"100%":"900px",
        background: isMobile?"transparent":"#111",
        borderRadius: isMobile?"0":"34px",
        padding: isMobile?"0":"16px",
        border: isMobile?"none":`1px solid ${T.border}`,
        boxShadow: isMobile?"none":"0 30px 80px rgba(0,0,0,.5)",
        display:"flex", flexDirection:"column",
        minHeight: isMobile?"100vh":"auto",
      }}>
        {/* Inner screen */}
        <div style={{
          borderRadius: isMobile?"0":"22px",
          background: T.bg,
          overflow:"hidden",
          display:"flex", flexDirection:"column",
          flex:1,
        }}>
          {/* HEADER */}
          <div style={{height:"64px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"4px",display:"flex"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text}}>{stage?.name||"Session"}</div>
                <div style={{fontSize:"11px",color:T.muted}}>
                  {stages.length} stages · {fmt(totalDur)} total
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              {/* Casting badge */}
              <div style={{display:"flex",alignItems:"center",gap:"7px",padding:"6px 12px",borderRadius:"999px",background:"rgba(123,227,164,.1)",border:`1px solid ${T.accent}`,fontSize:"12px",color:T.accent,fontWeight:"600",flexShrink:0}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12a10 10 0 0 1 10-10"/><path d="M5 12a7 7 0 0 1 7-7"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
                {!isMobile && "Casting to Studio TV"}
              </div>
              {/* ELAPSED */}
              <div style={{textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:"10px",letterSpacing:"1.5px",color:T.muted,fontWeight:"600"}}>ELAPSED</div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text}}>{fmt(liveState.elapsed)}</div>
              </div>
              {/* ROUND */}
              <div style={{textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:"10px",letterSpacing:"1.5px",color:T.muted,fontWeight:"600"}}>STAGE</div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.text}}>
                  <span style={{color:T.accent}}>{liveState.idx+1}</span>/{stages.length}
                </div>
              </div>
            </div>
          </div>

          {/* BODY */}
          <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",minHeight:0,overflow:"hidden"}}>
            {/* MAIN CONTROL: big stage display */}
            <div style={{flex:1.7,display:"flex",flexDirection:"column",borderRight:isMobile?"none":`1px solid ${T.border}`,minWidth:0}}>
              {/* Stage type + name */}
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"6px",padding:"24px",position:"relative"}}>
                {/* WORK/REST phase label */}
                <div style={{position:"absolute",top:"20px",left:"50%",transform:"translateX(-50%)",fontSize:"12px",letterSpacing:"5px",color:cfg.color,fontWeight:"700"}}>
                  {cfg.label.toUpperCase()}
                </div>

                {/* Big timer */}
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"80px":"120px",fontWeight:"700",lineHeight:"1",letterSpacing:"-3px",color:cfg.color,textShadow:`0 0 60px ${cfg.color}40`}}>
                  {fmt(remaining)}
                </div>

                {/* Stage name */}
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:isMobile?"22px":"28px",fontWeight:"700",color:T.text,textAlign:"center",marginTop:"4px"}}>
                  {stage?.name||"Complete"}
                </div>
                {stage?.exercises?.[0] && (
                  <div style={{fontSize:"15px",color:T.muted}}>{stage.exercises[0].n}{stage.exercises[0].r?` · ${stage.exercises[0].s||""}×${stage.exercises[0].r}`:""}</div>
                )}

                {/* Skip timer controls */}
                <div style={{display:"flex",gap:"8px",alignItems:"center",marginTop:"12px"}}>
                  {[-30,-10,10,30].map(s=>(
                    <button key={s} onClick={()=>onSkipTimer(s)}
                      style={{padding:isMobile?"10px 14px":"7px 12px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,fontSize:"12px",fontWeight:"700",minHeight:"40px"}}>
                      {s>0?"+":""}{s}s
                    </button>
                  ))}
                </div>

                {/* Feature: Interval sub-timer */}
                {(()=>{
                  const ivState = calcIntervalState(stage?.exercises, elapsed);
                  if (!ivState) return null;
                  const isWork = ivState.phase==="WORK";
                  const ivColor = isWork?"#EF4444":"#06B6D4";
                  return (
                    <div style={{marginTop:"12px",background:`${ivColor}15`,border:`2px solid ${ivColor}`,borderRadius:"12px",padding:"12px 16px",textAlign:"center",width:"100%",maxWidth:"300px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"7px",marginBottom:"6px"}}>
                        <span style={{fontSize:"10px",fontWeight:"800",color:ivColor,textTransform:"uppercase",letterSpacing:"1.5px",padding:"2px 6px",background:`${ivColor}25`,borderRadius:"4px"}}>{ivState.phase}</span>
                        <span style={{fontSize:"11px",color:T.muted}}>{ivState.exName}</span>
                      </div>
                      <p style={{fontSize:"40px",fontWeight:"900",color:ivColor,lineHeight:"1",margin:"0 0 3px"}}>{fmtSec(ivState.phaseRemaining)}</p>
                      <p style={{fontSize:"11px",color:T.muted}}>Round {ivState.round} of {ivState.totalRounds}</p>
                    </div>
                  );
                })()}
              </div>

              {/* TRANSPORT controls */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:isMobile?"16px":"18px",padding:"0 24px 20px",flexShrink:0}}>
                {/* Prev stage */}
                {liveState.idx > 0 && (
                  <button onClick={onNextStage} style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={T.text}><path d="M11 19V5l-8 7 8 7Zm9 0V5l-8 7 8 7Z"/></svg>
                  </button>
                )}
                {/* Skip back track */}
                <button onClick={()=>player?.previousTrack()} style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text}}>
                  <SkipBack size={20}/>
                </button>
                {/* Play/Pause — large accent button */}
                <button onClick={handlePlayPause} style={{width:isMobile?"76px":"84px",height:isMobile?"76px":"84px",borderRadius:"50%",background:T.accent,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:`0 0 40px ${T.accent}40`,flexShrink:0}}>
                  {liveState.playing
                    ? <svg width="30" height="30" viewBox="0 0 24 24" fill={T.bg}><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                    : <svg width="30" height="30" viewBox="0 0 24 24" fill={T.bg}><path d="M8 5l11 7-11 7V5z"/></svg>
                  }
                </button>
                {/* Skip forward track */}
                <button onClick={()=>player?.nextTrack()} style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text}}>
                  <SkipForward size={20}/>
                </button>
                {/* Next stage */}
                {liveState.idx < stages.length - 1 && (
                  <button onClick={onNextStage} style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid ${T.border}`,background:T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={T.text}><path d="M13 5v14l8-7-8-7ZM4 5v14l8-7L4 5Z"/></svg>
                  </button>
                )}
                {/* Mic mode */}
                {player && (
                  <button onClick={handleMicMode} title="Mic Mode (M)"
                    style={{width:"44px",height:"44px",borderRadius:"50%",border:`1px solid ${micMode?"#EF4444":"#EF444440"}`,background:micMode?"#EF444420":T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:micMode?"#EF4444":T.muted,animation:micMode?"jg-pulse 1s ease-in-out infinite":"none"}}>
                    <Mic size={16}/>
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div style={{height:"4px",background:T.navy,flexShrink:0,position:"relative"}}>
                <div style={{position:"absolute",left:0,top:0,bottom:0,background:cfg.color,width:`${progress*100}%`,transition:"width 0.8s linear",borderRadius:"0 2px 2px 0"}}/>
              </div>
            </div>

            {/* SIDE: Up Next + Music */}
            {!isMobile && (
              <div style={{width:"380px",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
                {/* UP NEXT */}
                <div style={{flex:1,padding:"18px 20px",display:"flex",flexDirection:"column",gap:"10px",overflow:"hidden",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:T.muted}}>UP NEXT</div>
                  {stages.slice(liveState.idx+1, liveState.idx+4).map((s,i)=>{
                    const sCfg = SCFG[s.type]||SCFG.circuit;
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 13px",borderRadius:"11px",background:i===0?T.card:T.navy,border:`1px solid ${i===0?T.border:T.border}`}}>
                        <span style={{fontSize:"11px",fontWeight:"700",color:sCfg.color,background:`${sCfg.color}18`,padding:"3px 8px",borderRadius:"5px",flexShrink:0}}>{sCfg.label}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"14px",fontWeight:"600",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                          <div style={{fontSize:"11px",color:T.muted}}>{fmt(s.dur)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {stages.slice(liveState.idx+1).length === 0 && (
                    <div style={{fontSize:"12px",color:T.muted,padding:"10px 0"}}>Last stage — session ending soon</div>
                  )}
                </div>

                {/* MUSIC panel */}
                <div style={{padding:"16px 20px",background:T.card,flexShrink:0}}>
                  {nowPlaying ? (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
                        <div style={{width:"46px",height:"46px",borderRadius:"9px",background:"repeating-linear-gradient(45deg,#1b2a20,#1b2a20 5px,#22382a 5px,#22382a 10px)",flexShrink:0,overflow:"hidden"}}>
                          {nowPlaying.album?.images?.[0]?.url && <img src={nowPlaying.album.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"14px",fontWeight:"700",color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nowPlaying.name}</div>
                          <div style={{fontSize:"11px",color:T.muted}}>{nowPlaying.artists?.[0]?.name} · now playing</div>
                        </div>
                        {nowPlaying.bpm && <div style={{textAlign:"center",flexShrink:0}}>
                          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"18px",fontWeight:"700",color:T.accent}}>{Math.round(nowPlaying.bpm)}</div>
                          <div style={{fontSize:"9px",color:T.muted,letterSpacing:"1px"}}>BPM</div>
                        </div>}
                      </div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <button onClick={()=>player?.previousTrack()} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:T.navy,border:`1px solid ${T.border}`,fontSize:"12px",fontWeight:"600",color:T.text,cursor:"pointer"}}>
                          <SkipBack size={13}/> Prev
                        </button>
                        <button onClick={handleMicMode} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:micMode?"#EF444420":T.navy,border:`1px solid ${micMode?"#EF4444":"#EF444440"}`,fontSize:"12px",fontWeight:"600",color:micMode?"#EF4444":T.muted,cursor:"pointer"}}>
                          <Mic size={13}/> Mic {micMode?"ON":"Mode"}
                        </button>
                        <button onClick={()=>player?.nextTrack()} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:T.navy,border:`1px solid ${T.border}`,fontSize:"12px",fontWeight:"600",color:T.text,cursor:"pointer"}}>
                          <SkipForward size={13}/> Next
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{fontSize:"12px",color:T.muted,textAlign:"center",padding:"8px 0"}}>No music playing</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mobile: compact music strip */}
          {isMobile && nowPlaying && (
            <div style={{flexShrink:0,borderTop:`1px solid ${T.border}`,background:T.card,padding:"10px 14px",display:"flex",alignItems:"center",gap:"10px"}}>
              {nowPlaying.album?.images?.[0]?.url && (
                <img src={nowPlaying.album.images[0].url} style={{width:"40px",height:"40px",borderRadius:"6px",objectFit:"cover",flexShrink:0}} alt="album"/>
              )}
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:"12px",fontWeight:"700",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.name}</p>
                <p style={{fontSize:"10px",color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.artists?.[0]?.name}</p>
              </div>
              <button onClick={handleMicMode} style={{background:"none",border:"none",cursor:"pointer",color:micMode?"#EF4444":T.muted,padding:"6px",display:"flex"}}>
                <Mic size={18}/>
              </button>
              <button onClick={handleDisplayMode} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"6px",display:"flex"}}>
                <Monitor size={18}/>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live search overlay */}
      {showLiveSearch && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div style={{background:T.card,borderRadius:"16px",padding:"24px",width:"100%",maxWidth:"480px",border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div style={{fontSize:"16px",fontWeight:"700",color:T.text}}>Add track to stage</div>
              <button onClick={()=>setShowLiveSearch(false)} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"4px",display:"flex"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <SpotifySearchModal
              onClose={()=>setShowLiveSearch(false)}
              onSelectTrack={t=>{ onAddTrack(liveSearchStageIdx, t); setShowLiveSearch(false); }}
            />
          </div>
        </div>
      )}

      {/* Keyboard shortcut legend */}
      <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
    </div>
  );
}

// ─── OverviewDisplayScreen (pre-class TV overview) ────────────────────────────
function OverviewDisplayScreen({ stages, sessionName, onBack }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const totalDur    = stages.reduce((a,s)=>a+s.dur,0);
  const totalTracks = stages.reduce((a,s)=>a+(s.tracks||[]).length, 0);
  const totalExs    = stages.reduce((a,s)=>a+(s.exercises||[]).length, 0);

  useEffect(() => {
    const onKey = e => { if (e.key==="Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtDur = s => {
    const m = Math.floor(s/60), sec = s%60;
    return sec ? `${m}m ${sec}s` : `${m}m`;
  };

  // Find "peak" stage (highest BPM range or most exercises)
  const peakIdx = stages.reduce((best,s,i) => {
    const cfg = SCFG[s.type]||SCFG.circuit;
    const score = (cfg.bpmMax||0) + (s.exercises||[]).length;
    const bestCfg = SCFG[stages[best]?.type]||SCFG.circuit;
    const bestScore = (bestCfg.bpmMax||0) + (stages[best]?.exercises||[]).length;
    return score > bestScore ? i : best;
  }, 0);

  const cols = isMobile ? 1 : isTablet ? Math.min(stages.length, 2) : Math.min(stages.length, 4);

  return (
    <div style={{position:"fixed",inset:0,background:"#050705",zIndex:500,display:"flex",flexDirection:"column",overflow:"auto",padding:isMobile?"0":"24px"}}>

      {/* TV bezel frame */}
      <div style={{
        flex:1,background:"#050705",borderRadius:isMobile?"0":"16px",
        padding:isMobile?"0":"14px",
        boxShadow:isMobile?"none":"0 30px 80px rgba(0,0,0,.6)",
        display:"flex",flexDirection:"column",overflow:"hidden",
        minHeight:isMobile?"100vh":"auto"
      }}>

        {/* Inner screen */}
        <div style={{flex:1,background:`radial-gradient(120% 90% at 50% 0%,rgba(123,227,164,.06),transparent),${T.bg}`,borderRadius:isMobile?"0":"10px",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Header row */}
          <div style={{
            flexShrink:0,padding:isMobile?"16px":"22px 26px",
            borderBottom:`1px solid ${T.border}`,
            display:"flex",alignItems:isMobile?"flex-start":"center",
            justifyContent:"space-between",flexDirection:isMobile?"column":"row",gap:"12px"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <button onClick={onBack} style={{
                display:"flex",alignItems:"center",gap:"6px",padding:"7px 13px",
                background:"transparent",border:`1px solid ${T.border}`,borderRadius:"8px",
                cursor:"pointer",color:T.muted,fontSize:"12px",fontWeight:"600",flexShrink:0
              }}>← {!isMobile && <span style={{opacity:0.5,fontSize:"10px"}}>Esc</span>}</button>
              <div>
                <p style={{fontSize:isMobile?"18px":"26px",fontWeight:"700",color:T.text,lineHeight:1,marginBottom:"4px",fontFamily:"'Space Grotesk',sans-serif"}}>
                  {sessionName||"Class Plan Overview"}
                </p>
                <p style={{fontSize:"12px",color:T.muted}}>
                  {stages.length} stages · {fmtDur(totalDur)} · {totalTracks} tracks · {totalExs} exercises
                </p>
              </div>
            </div>

            {/* Per-stage duration chips */}
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {stages.map((s,si)=>{
                const cfg = SCFG[s.type]||SCFG.circuit;
                return (
                  <div key={s.id} style={{
                    display:"flex",alignItems:"center",gap:"5px",
                    padding:"5px 10px",background:`${cfg.color}18`,
                    borderRadius:"999px",border:`1px solid ${cfg.color}40`
                  }}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:cfg.color}}/>
                    <span style={{fontSize:"11px",fontWeight:"700",color:cfg.color}}>{fmtDur(s.dur)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage cards grid */}
          <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"22px 26px"}}>
            <div style={{
              display:"grid",
              gridTemplateColumns:`repeat(${cols},1fr)`,
              gap:isMobile?"12px":"16px"
            }}>
              {stages.map((s,si)=>{
                const cfg     = SCFG[s.type]||SCFG.circuit;
                const exList  = s.exercises||[];
                const trList  = s.tracks||[];
                const grpList = s.groups||[];
                const isPeak  = si===peakIdx && stages.length>1;
                const firstTrack = trList[0];

                return (
                  <div key={s.id} style={{
                    borderRadius:"14px",overflow:"hidden",display:"flex",flexDirection:"column",
                    border:isPeak?`2px solid ${cfg.color}`:`2px solid ${cfg.color}40`,
                    background:isPeak?`linear-gradient(160deg,${T.navy},${T.card})`:`${T.card}`,
                    boxShadow:isPeak?`0 0 0 3px ${cfg.color}18`:"none"
                  }}>

                    {/* Colored header band */}
                    <div style={{background:`${cfg.color}${isPeak?"28":"18"}`,padding:"14px 18px"}}>
                      {/* Stage label */}
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"8px"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
                        <span style={{fontSize:"10px",fontWeight:"800",color:cfg.color,
                          textTransform:"uppercase",letterSpacing:"1px"}}>
                          {cfg.label}{isPeak?" · PEAK":""}
                        </span>
                      </div>
                      {/* Stage name */}
                      <p style={{fontSize:"16px",fontWeight:"800",color:T.text,lineHeight:1.2,marginBottom:"6px",fontFamily:"'Space Grotesk',sans-serif"}}>{s.name}</p>
                      {/* Duration + BPM */}
                      <p style={{fontSize:"12px",color:T.muted,fontWeight:"600"}}>
                        {fmtDur(s.dur)}{cfg.bpmMin ? ` · ${cfg.bpmMin}–${cfg.bpmMax} BPM` : ""}
                      </p>
                    </div>

                    {/* Body */}
                    <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column",gap:"7px"}}>
                      {exList.length===0 && trList.length===0 && grpList.length===0 && (
                        <p style={{fontSize:"11px",color:T.muted,fontStyle:"italic"}}>No content added yet</p>
                      )}

                      {/* Exercises */}
                      {exList.map((ex,ei)=>(
                        <div key={ei} style={{
                          paddingLeft:"10px",borderLeft:`3px solid ${cfg.color}`,
                          marginBottom:"4px"
                        }}>
                          <p style={{fontSize:"13px",fontWeight:"700",color:T.text,lineHeight:1.2,marginBottom:"2px"}}>{ex.n}</p>
                          <p style={{fontSize:"11px",color:T.muted}}>
                            {[ex.s&&`${ex.s}×`,ex.r,ex.rest&&`· ${ex.rest} rest`].filter(Boolean).join(" ")||"—"}
                          </p>
                        </div>
                      ))}

                      {/* Groups */}
                      {grpList.map((g,gi)=>(
                        <div key={g.id} style={{display:"flex",alignItems:"center",gap:"7px"}}>
                          <div style={{width:"8px",height:"8px",borderRadius:"50%",flexShrink:0,background:grpColor(g.id)}}/>
                          <p style={{fontSize:"12px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</p>
                        </div>
                      ))}
                    </div>

                    {/* Music footer */}
                    <div style={{
                      flexShrink:0,padding:"10px 18px",
                      borderTop:`1px solid ${cfg.color}25`,
                      display:"flex",alignItems:"center",gap:"8px"
                    }}>
                      <Music size={12} color={cfg.color} style={{flexShrink:0}}/>
                      {firstTrack ? (
                        <p style={{fontSize:"11px",color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          <span style={{color:T.text,fontWeight:"600"}}>{firstTrack.t}</span>
                          {firstTrack.a && <span> — {firstTrack.a}</span>}
                          {trList.length>1 && <span style={{color:cfg.color}}> +{trList.length-1}</span>}
                        </p>
                      ) : (
                        <p style={{fontSize:"11px",color:T.muted,fontStyle:"italic"}}>No tracks</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DisplayScreen (TV mode) ──────────────────────────────────────────────────
const DISPLAY_PRESETS = [
  { id:"full",    label:"Full",        desc:"Timer + exercises + music" },
  { id:"minimal", label:"Minimal",     desc:"Timer + stage name only"   },
  { id:"timer",   label:"Timer Only",  desc:"Giant full-screen clock"   },
  { id:"music",   label:"Music Focus", desc:"Big album art + timer"      },
];
const FONT_SCALES = [
  { id:"s",  label:"S",  mult:0.75 },
  { id:"m",  label:"M",  mult:1    },
  { id:"l",  label:"L",  mult:1.4  },
  { id:"xl", label:"XL", mult:1.85 },
];

function DisplayScreen({stages, liveState, onBack, player, deviceId, spPaused, nowPlaying, onPlayPause}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const stage = stages[liveState.idx];
  const dur = stage?.dur||1;
  const remaining = Math.max(0, dur - liveState.elapsed);
  const progress = (liveState.elapsed/dur)*100;
  const cfg = SCFG[stage?.type]||SCFG.circuit;
  const totalDur = stages.reduce((a,s)=>a+s.dur,0);

  // Display prefs persisted to localStorage
  const [preset,    setPreset]    = useState(() => { try { return JSON.parse(localStorage.getItem("jungle_disp_prefs")||"{}").preset    || "full"; } catch{return "full";} });
  const [fontScale, setFontScale] = useState(() => { try { return JSON.parse(localStorage.getItem("jungle_disp_prefs")||"{}").fontScale || "m";    } catch{return "m";}   });
  const [showSettings, setShowSettings] = useState(false);
  const [showQR,       setShowQR]       = useState(false);
  useEffect(() => {
    try { localStorage.setItem("jungle_disp_prefs", JSON.stringify({ preset, fontScale })); } catch{}
  }, [preset, fontScale]);

  // Feature 6: Generate attendee URL for QR code (try/catch guards against non-ASCII btoa errors)
  const attendeeUrl = (() => {
    try {
      const payload = {
        name: "Live Workout",
        stages: stages.map(s => ({
          name: s.name, type: s.type, dur: s.dur,
          exercises: (s.exercises||[]).map(e => ({ n:e.n, s:e.s, r:e.r, rest:e.rest }))
        }))
      };
      const encoded = btoa(JSON.stringify(payload));
      return `${window.location.origin}${window.location.pathname}?mode=attendee&data=${encoded}`;
    } catch { return ""; }
  })();
  const qrSrc = attendeeUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(attendeeUrl)}&color=EEEEEE&bgcolor=060D18&margin=10`
    : "";

  // F15: Esc exits display mode back to live
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scaleMult = FONT_SCALES.find(f=>f.id===fontScale)?.mult || 1;

  // Color-coded timer
  const ratio = remaining / dur;
  const timerColor = ratio > 0.5 ? cfg.color : ratio > 0.25 ? "#F59E0B" : T.accent;
  const isPulsing = remaining <= 10 && remaining > 0 && liveState.playing;
  const hasNoTracks = !stage?.tracks?.length;

  const handlePlayPause = () => {
    const willPlay = !liveState.playing;
    onPlayPause();
    if (!player || !deviceId) return;
    if (willPlay) {
      const uris = stage?.tracks?.map(t=>t.uri).filter(Boolean)||[];
      if (uris.length) {
        const currentUri = nowPlaying?.uri;
        const isStageTrackPlaying = currentUri && uris.includes(currentUri);
        if (isStageTrackPlaying) {
          player.resume().catch(()=>{});
        } else {
          apiPlay(deviceId, uris).catch(()=>{});
        }
      } else {
        player.resume().catch(()=>{});
      }
    } else {
      player.pause().catch(()=>{});
    }
  };

  // ── Settings panel ──
  const SettingsPanel = () => (
    <div style={{position:"absolute",top:"64px",right:isMobile?"8px":"20px",zIndex:200,background:T.card,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px",width:isMobile?"min(260px,calc(100vw-16px))":"260px",boxShadow:"0 12px 40px rgba(0,0,0,0.5)",boxSizing:"border-box"}}>
      <p style={{fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>Layout Preset</p>
      <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"18px"}}>
        {DISPLAY_PRESETS.map(p => (
          <button key={p.id} onClick={()=>setPreset(p.id)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:preset===p.id?T.accent+"20":T.navy,border:`1px solid ${preset===p.id?T.accent+"60":T.border}`,borderRadius:"7px",cursor:"pointer",textAlign:"left"}}>
            <div>
              <p style={{fontSize:"13px",fontWeight:"700",color:preset===p.id?T.accent:T.text,marginBottom:"1px"}}>{p.label}</p>
              <p style={{fontSize:"10px",color:T.muted}}>{p.desc}</p>
            </div>
            {preset===p.id && <div style={{width:"7px",height:"7px",borderRadius:"50%",background:T.accent}}/>}
          </button>
        ))}
      </div>
      <p style={{fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Font Size</p>
      <div style={{display:"flex",gap:"6px"}}>
        {FONT_SCALES.map(f => (
          <button key={f.id} onClick={()=>setFontScale(f.id)}
            style={{flex:1,padding:"8px 0",background:fontScale===f.id?T.accent:"transparent",color:fontScale===f.id?"white":T.muted,border:`1px solid ${fontScale===f.id?T.accent:T.border}`,borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── Shared stage journey strip (must be declared before preset early-returns) ──
  const StageJourney = ({compact=false}) => (
    <div style={{display:"flex",alignItems:"center",gap:compact?"4px":"6px",overflowX:"auto",paddingBottom:"2px"}}>
      {stages.map((s,i) => {
        const sCfg = SCFG[s.type]||SCFG.circuit;
        const isPast    = i < liveState.idx;
        const isCurrent = i === liveState.idx;
        const isFuture  = i > liveState.idx;
        return (
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:compact?"4px":"6px",flexShrink:0}}>
            <div style={{
              padding:compact?"3px 8px":"5px 12px",
              borderRadius:"20px",
              background:isCurrent?sCfg.color+"30":isPast?T.border+"60":"transparent",
              border:`1.5px solid ${isCurrent?sCfg.color:isPast?T.muted+"40":T.border}`,
              display:"flex",alignItems:"center",gap:"5px",
              opacity:isFuture?0.45:1,
              transition:"all 0.3s",
            }}>
              <div style={{width:compact?"6px":"7px",height:compact?"6px":"7px",borderRadius:"50%",background:isCurrent?sCfg.color:isPast?"#ffffff50":T.muted,flexShrink:0}}/>
              <span style={{fontSize:compact?"9px":"10px",fontWeight:isCurrent?"800":"600",color:isCurrent?sCfg.color:isPast?T.muted:T.muted,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden",maxWidth:compact?"80px":"120px"}}>
                {isPast?"✓ ":""}{s.name}
              </span>
            </div>
            {i < stages.length-1 && <span style={{color:T.muted,fontSize:"8px",opacity:0.4,flexShrink:0}}>▶</span>}
          </div>
        );
      })}
    </div>
  );

  // ── Timer-Only preset ──
  if (preset === "timer") {
    return (
      <div style={{minHeight:"100vh",background:"#000",display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
        <div style={{position:"absolute",top:"16px",left:"20px",right:"20px",display:"flex",justifyContent:"space-between",alignItems:"center",zIndex:100}}>
          <div style={{flex:1,overflow:"hidden",marginRight:"12px"}}>
            <StageJourney compact={true}/>
          </div>
          <div style={{display:"flex",gap:"8px",flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"8px",background:T.card+"80",border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"8px 14px",background:T.card+"80",border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.text,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:"56px"}}>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <p style={{fontSize:`${Math.round(160*scaleMult)}px`,fontWeight:"900",color:timerColor,lineHeight:"0.9",fontVariantNumeric:"tabular-nums",animation:isPulsing?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",letterSpacing:"-4px"}}>{fmt(remaining)}</p>
          <p style={{fontSize:`${Math.round(20*scaleMult)}px`,color:T.muted,marginTop:"16px",textTransform:"uppercase",letterSpacing:"6px"}}>{stage?.name}</p>
          <p style={{fontSize:"13px",color:T.muted,marginTop:"8px",opacity:0.6}}>Stage {liveState.idx+1} of {stages.length}</p>
        </div>
        <div style={{height:"6px",display:"flex",overflow:"hidden"}}>
          {stages.map((s,i)=>{ const c=SCFG[s.type]?.color||T.border; return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,background:i<liveState.idx?c+"60":i===liveState.idx?c:T.navy}}/>; })}
        </div>
      </div>
    );
  }

  // ── Minimal preset ──
  if (preset === "minimal") {
    return (
      <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:"12px"}}>
          <JungleLogo size={24}/>
          <div style={{flex:1,overflow:"hidden"}}>
            <StageJourney compact={true}/>
          </div>
          <div style={{display:"flex",gap:"8px",flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"7px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"7px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.text,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <h1 style={{fontSize:`${Math.round(52*scaleMult)}px`,fontWeight:"800",color:T.text,marginBottom:"6px",textAlign:"center"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"56px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"28px"}}/>
          <p style={{fontSize:`${Math.round(110*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"tabular-nums",animation:isPulsing?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s"}}>{fmt(remaining)}</p>
          <p style={{fontSize:"15px",color:T.muted,marginBottom:"28px"}}>remaining · Stage {liveState.idx+1} of {stages.length}</p>
          <div style={{width:"min(480px,80%)",height:"8px",background:T.navy,borderRadius:"4px",overflow:"hidden"}}>
            <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
          </div>
        </div>
        <div style={{height:"5px",display:"flex",overflow:"hidden"}}>
          {stages.map((s,i)=>{ const c=SCFG[s.type]?.color||T.border; return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,background:i<liveState.idx?c+"60":i===liveState.idx?c:T.navy}}/>; })}
        </div>
      </div>
    );
  }

  // ── Music Focus preset ──
  if (preset === "music") {
    return (
      <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
        <div style={{padding:"14px 20px",background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <JungleLogo size={28}/>
            <span style={{fontSize:"14px",fontWeight:"800",letterSpacing:"2px"}}>JUNGLE</span>
          </div>
          <Tag color={cfg.color}>{stage?.name}</Tag>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"7px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.muted,display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"7px 12px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.text,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
        <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",gap:"0",overflow:isMobile?"auto":"hidden"}}>
          {/* Album art left */}
          <div style={{flex:isMobile?"0 0 auto":"0 0 420px",padding:isMobile?"20px 24px":"36px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.card,borderRight:isMobile?"none":`1px solid ${T.border}`,borderBottom:isMobile?`1px solid ${T.border}`:"none"}}>
            {nowPlaying?.album?.images?.[0]?.url
              ? <img src={nowPlaying.album.images[0].url} style={{width:"100%",maxWidth:"340px",aspectRatio:"1",borderRadius:"16px",objectFit:"cover",boxShadow:`0 16px 64px ${cfg.color}60`}} alt="album"/>
              : <div style={{width:"300px",height:"300px",background:T.navy,borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={80} color={T.border}/></div>
            }
            {nowPlaying && <>
              <p style={{fontSize:"20px",fontWeight:"700",color:T.text,marginTop:"20px",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"}}>{nowPlaying.name}</p>
              <p style={{fontSize:"14px",color:T.muted,marginTop:"4px"}}>{nowPlaying.artists?.[0]?.name}</p>
              <div style={{display:"flex",gap:"22px",alignItems:"center",marginTop:"20px"}}>
                <button onClick={()=>player?.previousTrack()} style={{background:"none",border:"none",cursor:"pointer",color:T.muted}}><SkipBack size={28}/></button>
                <button onClick={handlePlayPause} style={{width:"60px",height:"60px",borderRadius:"50%",background:T.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>{liveState.playing?<Pause size={24}/>:<Play size={24}/>}</button>
                <button onClick={()=>player?.nextTrack()} style={{background:"none",border:"none",cursor:"pointer",color:T.muted}}><SkipForward size={28}/></button>
              </div>
            </>}
          </div>
          {/* Timer right */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"36px"}}>
            <p style={{fontSize:`${Math.round(96*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"tabular-nums",animation:isPulsing?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",textAlign:"center"}}>{fmt(remaining)}</p>
            <p style={{fontSize:"16px",color:T.muted,marginTop:"10px",marginBottom:"28px"}}>remaining</p>
            <div style={{width:"100%",maxWidth:"360px",height:"8px",background:T.navy,borderRadius:"4px",overflow:"hidden"}}>
              <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
            </div>
            <p style={{fontSize:"13px",color:T.muted,marginTop:"14px"}}>Stage {liveState.idx+1} of {stages.length}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full preset (default) ──
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
      {/* TV Header */}
      <div style={{padding:"14px 28px",background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",flexShrink:0}}>
          <JungleLogo size={36}/>
          <span style={{fontSize:"20px",fontWeight:"800",letterSpacing:"3px"}}>JUNGLE</span>
        </div>
        {/* Stage journey in header */}
        <div style={{flex:1,overflow:"hidden"}}>
          <StageJourney compact={true}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
          {/* Feature 6: QR code toggle */}
          <button onClick={e=>{e.stopPropagation();setShowQR(s=>!s);setShowSettings(false);}} title="Show attendee QR code"
            style={{padding:"8px",background:showQR?"#10B98120":T.navy,border:`1px solid ${showQR?"#10B98140":T.border}`,borderRadius:"7px",cursor:"pointer",color:showQR?"#10B981":T.muted,display:"flex"}}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="6" y="6" width="1" height="1"/><rect x="17" y="6" width="1" height="1"/><rect x="6" y="17" width="1" height="1"/><path d="M14 14h1v1h-1zM14 17h1v1h-1zM17 14h1v1h-1zM17 17h1v1h-1zM20 14v1M14 20h1M17 20v1M20 17h1"/></svg>
          </button>
          {/* Settings gear */}
          <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);setShowQR(false);}} style={{padding:"8px",background:showSettings?T.accent+"20":T.navy,border:`1px solid ${showSettings?T.accent+"40":T.border}`,borderRadius:"7px",cursor:"pointer",color:showSettings?T.accent:T.muted,display:"flex"}}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
          <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 14px",background:T.navy,border:`1px solid ${T.border}`,borderRadius:"7px",cursor:"pointer",color:T.text,fontSize:"13px",fontWeight:"700"}}><ArrowLeft size={14}/> Back</button>
        </div>
      </div>

      {showSettings && <SettingsPanel/>}
      {/* Feature 6: QR code floating panel */}
      {showQR && qrSrc && (
        <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"70px",right:"20px",zIndex:200,background:T.card,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px",boxShadow:`0 8px 32px rgba(0,0,0,0.5)`,textAlign:"center",minWidth:"200px"}}>
          <p style={{fontSize:"11px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>📱 Attendee QR</p>
          <img src={qrSrc} width="200" height="200" style={{borderRadius:"8px",display:"block",margin:"0 auto"}} alt="Attendee QR code" onError={e=>{e.target.style.display="none";}}/>
          <p style={{fontSize:"10px",color:T.muted,marginTop:"10px",lineHeight:"1.5"}}>Scan to see today's<br/>session on your phone</p>
        </div>
      )}

      <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:isMobile?"auto":"hidden"}}>
        {/* LEFT: Stage info */}
        <div style={{flex:1,padding:isMobile?"20px 16px":"44px 52px",display:"flex",flexDirection:"column",justifyContent:isMobile?"flex-start":"center"}}>
          <h1 style={{fontSize:isMobile?`${Math.round(30*scaleMult)}px`:`${Math.round(54*scaleMult)}px`,fontWeight:"800",color:T.text,marginBottom:"8px",lineHeight:"1"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"64px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"36px",transition:"background 0.5s"}}/>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <p style={{fontSize:isMobile?`${Math.round(56*scaleMult)}px`:`${Math.round(92*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"tabular-nums",marginBottom:"6px",transition:"color 0.5s",animation:isPulsing?"jg-pulse 0.8s ease-in-out infinite":"none"}}>{fmt(remaining)}</p>
          <p style={{fontSize:"16px",color:T.muted,marginBottom:"36px"}}>remaining</p>
          <div style={{width:"100%",height:"8px",background:T.navy,borderRadius:"4px",marginBottom:"24px",overflow:"hidden"}}>
            <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
          </div>

          {/* Feature 4: Interval sub-timer in Display Mode (Full preset) */}
          {(() => {
            const ivState = calcIntervalState(stage?.exercises, liveState.elapsed);
            if (!ivState) return <div style={{marginBottom:"12px"}}/>;
            const isWork = ivState.phase === "WORK";
            const ivColor = isWork ? "#EF4444" : "#06B6D4";
            return (
              <div style={{marginBottom:"28px",background:ivColor+"12",border:`2px solid ${ivColor}`,borderRadius:"16px",padding:"18px 24px",display:"flex",alignItems:"center",gap:"24px"}}>
                <div>
                  <span style={{fontSize:"10px",fontWeight:"800",color:ivColor,textTransform:"uppercase",letterSpacing:"2px",display:"block",marginBottom:"4px"}}>{ivState.phase}</span>
                  <p style={{fontSize:`${Math.round(64*scaleMult)}px`,fontWeight:"900",color:ivColor,lineHeight:"1",fontVariantNumeric:"tabular-nums"}}>{fmtSec(ivState.phaseRemaining)}</p>
                </div>
                <div>
                  <p style={{fontSize:`${Math.round(18*scaleMult)}px`,fontWeight:"700",color:T.text,marginBottom:"4px"}}>{ivState.exName}</p>
                  <p style={{fontSize:"13px",color:T.muted}}>Round {ivState.round} of {ivState.totalRounds} · {ivState.timing === "tabata" ? `${ivState.workSec}s on / ${ivState.restSec}s off` : "EMOM"}</p>
                </div>
              </div>
            );
          })()}

          {/* Group splits in display mode */}
          {stage?.groups?.length > 0 && (
            <div style={{marginBottom:"20px"}}>
              <p style={{fontSize:"13px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>👥 Groups</p>
              <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(stage.groups.length,3)}, 1fr)`,gap:"12px"}}>
                {stage.groups.map((grp,gi) => {
                  const gc = grpColor(grp.id);
                  const exerciseLabel = grp.exercise==="__custom__" ? (grp.customEx||"") : (grp.exercise||"");
                  return (
                    <div key={grp.id} style={{padding:"18px 20px",background:T.card,border:`2px solid ${gc}`,borderRadius:"12px",boxShadow:`0 0 20px ${gc}30`}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                        <div style={{width:"12px",height:"12px",borderRadius:"50%",background:gc,flexShrink:0}}/>
                        <p style={{fontSize:`${Math.round(14*scaleMult)}px`,fontWeight:"800",color:T.text}}>{grp.name}</p>
                      </div>
                      {exerciseLabel
                        ? <p style={{fontSize:`${Math.round(20*scaleMult)}px`,fontWeight:"700",color:gc,lineHeight:"1.2"}}>{exerciseLabel}</p>
                        : <p style={{fontSize:"12px",color:T.muted,fontStyle:"italic"}}>—</p>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stage?.exercises?.length > 0 && (
            <div>
              <p style={{fontSize:"13px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>Exercises</p>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"10px"}}>
                {stage.exercises.map((ex,i) => (
                  <div key={i} style={{padding:"14px 18px",background:T.card,border:`1px solid ${T.border}`,borderLeft:`3px solid ${cfg.color}`,borderRadius:"8px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}>
                      <p style={{fontSize:`${Math.round(16*scaleMult)}px`,fontWeight:"700",color:T.text}}>{ex.n}</p>
                      {ex.timing && ex.timing!=="none" && <span style={{fontSize:"10px",padding:"1px 5px",background:"#8B5CF620",color:"#8B5CF6",borderRadius:"3px",fontWeight:"700",flexShrink:0}}>{ex.timing==="tabata"?"TABATA":ex.timing==="emom"?"EMOM":`${ex.workSec}s/${ex.restSec}s`}</span>}
                    </div>
                    <p style={{fontSize:"13px",color:T.muted}}>{[ex.s&&`${ex.s} sets`,ex.r&&`${ex.r} reps`,ex.rest&&`${ex.rest} rest`,ex.timing&&ex.timing!=="none"&&`${ex.rounds||8} rounds`].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Spotify */}
        <div style={{flex:isMobile?"0 0 auto":"0 0 320px",background:T.card,borderLeft:isMobile?"none":`1px solid ${T.border}`,borderTop:isMobile?`1px solid ${T.border}`:"none",padding:isMobile?"16px":"44px 28px",display:"flex",flexDirection:isMobile?"row":"column",gap:isMobile?"12px":"0",alignItems:isMobile?"center":"stretch"}}>
          <p style={{fontSize:"12px",fontWeight:"700",color:T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"20px"}}>Now Playing</p>
          {nowPlaying ? (
            <>
              {nowPlaying.album?.images?.[0]?.url && (
                <img src={nowPlaying.album.images[0].url} style={{width:"100%",aspectRatio:"1",borderRadius:"12px",marginBottom:"20px",objectFit:"cover",boxShadow:`0 8px 32px ${cfg.color}40`}} alt="album"/>
              )}
              <p style={{fontSize:"18px",fontWeight:"700",color:T.text,marginBottom:"5px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.name}</p>
              <p style={{fontSize:"14px",color:T.muted,marginBottom:"28px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.artists?.[0]?.name}</p>
              <div style={{display:"flex",justifyContent:"center",gap:"22px",alignItems:"center"}}>
                <button onClick={()=>player?.previousTrack()} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"8px"}}><SkipBack size={26}/></button>
                <button onClick={handlePlayPause} style={{width:"64px",height:"64px",borderRadius:"50%",background:T.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>
                  {liveState.playing ? <Pause size={26}/> : <Play size={26}/>}
                </button>
                <button onClick={()=>player?.nextTrack()} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"8px"}}><SkipForward size={26}/></button>
              </div>
            </>
          ) : (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
              <Music size={56} color={hasNoTracks ? T.accent+"80" : T.muted} style={{marginBottom:"14px"}}/>
              <p style={{fontSize:"15px",color:hasNoTracks ? T.accent : T.muted,fontWeight:"600",marginBottom:"6px"}}>
                {hasNoTracks ? "⏸ Music paused" : "No track playing"}
              </p>
              <p style={{fontSize:"12px",color:T.muted}}>
                {hasNoTracks ? "No tracks assigned to this stage" : "Add songs in the builder to queue music per stage"}
              </p>
            </div>
          )}
          <div style={{marginTop:"auto",paddingTop:"24px",borderTop:`1px solid ${T.border}`}}>
            <p style={{fontSize:"11px",color:T.muted,marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage Progress</p>
            <div style={{display:"flex",height:"6px",borderRadius:"3px",overflow:"hidden",gap:"2px"}}>
              {stages.map((s,i) => {
                const c = SCFG[s.type]?.color||T.border;
                return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,height:"100%",background:i<liveState.idx?c+"80":i===liveState.idx?c:T.navy}}/>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AttendeeView ─────────────────────────────────────────────────────────────
function AttendeeView({ data }) {
  const { name = "Workout Session", stages = [] } = data;
  const totalSec = stages.reduce((a, s) => a + (s.dur || 0), 0);
  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const T2 = DARK;
  const vwAV = useWindowWidth();
  const isMobileAV = vwAV < 480;
  return (
    <div style={{minHeight:"100vh",background:T2.bg,color:T2.text,fontFamily:"'Hanken Grotesk',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:isMobileAV?"12px 16px":"16px 28px",borderBottom:`1px solid ${T2.border}`,background:T2.card,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <JungleLogo size={28}/>
          <span style={{fontSize:"15px",fontWeight:"800",letterSpacing:"2px"}}>JUNGLE</span>
        </div>
        <div style={{background:T2.green+"20",color:T2.green,border:`1px solid ${T2.green}40`,borderRadius:"20px",padding:"4px 14px",fontSize:"12px",fontWeight:"700"}}>
          📋 Attendee View
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,maxWidth:"720px",width:"100%",margin:"0 auto",padding:isMobileAV?"16px":"32px 24px",boxSizing:"border-box"}}>
        {/* Session header */}
        <div style={{marginBottom:isMobileAV?"20px":"28px"}}>
          <p style={{fontSize:"12px",color:T2.muted,fontWeight:"600",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Today's Session</p>
          <h1 style={{fontSize:isMobileAV?"24px":"32px",fontWeight:"800",color:T2.text,marginBottom:"8px"}}>{name}</h1>
          <div style={{display:"flex",gap:"16px",alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:"5px",color:T2.muted,fontSize:"13px"}}>
              <Clock size={14}/> {fmt(totalSec)} total
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"5px",color:T2.muted,fontSize:"13px"}}>
              <Layers size={14}/> {stages.length} stages
            </div>
          </div>
        </div>

        {/* Stage timeline bar */}
        {stages.length > 0 && (
          <div style={{display:"flex",height:"6px",borderRadius:"3px",overflow:"hidden",marginBottom:"28px",gap:"2px"}}>
            {stages.map((s, i) => {
              const cfg = SCFG[s.type] || Object.values(SCFG).find(c => c.label === s.type) || SCFG.warmup;
              return <div key={i} style={{flex:s.dur||1,background:cfg.color,borderRadius:"2px"}}/>;
            })}
          </div>
        )}

        {/* Stages list */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {stages.map((s, i) => {
            const cfg = SCFG[s.type] || Object.values(SCFG).find(c => c.label === s.type) || SCFG.warmup;
            const exs = s.exercises || [];
            return (
              <div key={i} style={{background:T2.card,border:`1px solid ${T2.border}`,borderLeft:`3px solid ${cfg.color}`,borderRadius:"10px",padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:exs.length?"12px":"0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <span style={{fontSize:"11px",fontWeight:"700",color:cfg.color,textTransform:"uppercase",letterSpacing:"0.5px",background:cfg.color+"18",padding:"3px 8px",borderRadius:"4px"}}>{s.type || "Stage"}</span>
                    <span style={{fontSize:"16px",fontWeight:"700",color:T2.text}}>{s.name}</span>
                  </div>
                  <span style={{fontSize:"14px",fontWeight:"600",color:T2.muted,background:T2.navy,padding:"4px 10px",borderRadius:"6px"}}>{fmt(s.dur||0)}</span>
                </div>
                {exs.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                    {exs.map((ex, j) => (
                      <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:isMobileAV?"flex-start":"center",flexDirection:isMobileAV?"column":"row",gap:isMobileAV?"2px":"0",padding:"7px 10px",background:T2.navy,borderRadius:"6px"}}>
                        <span style={{fontSize:"13px",fontWeight:"600",color:T2.text}}>{ex.n || "Exercise"}</span>
                        <span style={{fontSize:"11px",color:T2.muted}}>
                          {[ex.s&&`${ex.s} sets`,ex.r&&`${ex.r} reps`,ex.rest&&`${ex.rest} rest`].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {exs.length === 0 && (
                  <p style={{fontSize:"12px",color:T2.muted,marginTop:"4px"}}>No exercises assigned</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{marginTop:"32px",padding:"14px 18px",background:T2.navy,borderRadius:"8px",display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{fontSize:"20px"}}>💪</span>
          <div>
            <p style={{fontSize:"13px",fontWeight:"600",color:T2.text,marginBottom:"2px"}}>Shared by your trainer via Jungle</p>
            <p style={{fontSize:"11px",color:T2.muted}}>This is a read-only view of the workout plan. Your trainer controls the live session.</p>
          </div>
        </div>
        <p style={{textAlign:"center",fontSize:"11px",color:T2.muted,marginTop:"20px"}}>© {new Date().getFullYear()} Dylan Rodrigues. All rights reserved.</p>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Attendee mode – bypass PIN + Spotify entirely
  if (ATTENDEE_PAYLOAD) return <AttendeeView data={ATTENDEE_PAYLOAD}/>;

  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const isXSmall = vw < 380;

  const { token, player, deviceId, nowPlaying, spPaused, authError, spError, profile, logout } = useSpotify();
  const [pinUnlocked, setPinUnlocked] = useState(() => sessionStorage.getItem("jungle_pin_ok") === "1");
  const [dark, setDark]               = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [djProgress, setDjProgress]   = useState({active:false, message:"", pct:0, done:false});
  // Gym branding
  const [gymBranding, setGymBranding] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jungle_gym_branding") || "null") || {}; } catch(_) { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("jungle_gym_branding", JSON.stringify(gymBranding)); } catch(_) {}
  }, [gymBranding]);
  // Workout library class choice
  const [classChoice, setClassChoice] = useState(() => {
    const firstClass = Object.keys(WORKOUT_LIBRARY)[0];
    const firstSub   = Object.keys(WORKOUT_LIBRARY[firstClass]?.subTypes || {})[0] || null;
    return { classType: firstClass, subType: firstSub };
  });
  const [view, setView]               = useState("dashboard");
  const [stages, setStages]           = useState(mkStages);
  const [sessionName, setSessionName] = useState("My Workout");
  const [liveState, setLiveState]     = useState({ playing:false, idx:0, elapsed:0 });
  const [showProfile, setShowProfile] = useState(false);
  // Per-template track assignments (persisted across sessions)
  const [templateTracks, setTemplateTracks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jungle_tmpl_tracks") || "{}"); } catch(_) { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("jungle_tmpl_tracks", JSON.stringify(templateTracks)); } catch(_) {}
  }, [templateTracks]);
  const handleAddTemplateTrack    = (tid, si, t)  => setTemplateTracks(prev => ({...prev, [tid]:{...(prev[tid]||{}), [si]:[...(prev[tid]?.[si]||[]), t]}}));
  const handleRemoveTemplateTrack = (tid, si, ti) => setTemplateTracks(prev => ({...prev, [tid]:{...(prev[tid]||{}), [si]:(prev[tid]?.[si]||[]).filter((_,i)=>i!==ti)}}));

  // Session history (persisted)
  const [sessionHistory, setSessionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jungle_history") || "[]"); } catch(_) { return []; }
  });
  const saveSession = () => {
    const totalElapsed = stages.slice(0, liveState.idx).reduce((a,s)=>a+s.dur,0) + liveState.elapsed;
    if (totalElapsed < 10) return; // don't log trivial sessions
    const record = {
      date: new Date().toISOString().slice(0,10),
      name: sessionName,
      stages: stages.length,
      durMin: Math.round(totalElapsed/60),
      ts: Date.now(),
      stageTypes: [...new Set(stages.map(s=>s.type))] // F13: for profile stats
    };
    const updated = [record, ...sessionHistory].slice(0, 100); // keep last 100
    setSessionHistory(updated);
    try { localStorage.setItem("jungle_history", JSON.stringify(updated)); } catch(_) {}
  };

  Object.assign(T, dark ? DARK : LIGHT);
  // Apply gym branding colour overrides
  if (gymBranding?.accentColor) T.accent = gymBranding.accentColor;
  if (gymBranding?.secondColor) T.green  = gymBranding.secondColor;

  // Inject Google Font when gym branding font changes
  useEffect(() => {
    const font = gymBranding?.fontFamily;
    if (!font || font === "system") {
      const el = document.getElementById("jungle-gfont");
      if (el) el.href = "";
      return;
    }
    let link = document.getElementById("jungle-gfont");
    if (!link) {
      link = document.createElement("link");
      link.id = "jungle-gfont";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800;900&display=swap`;
  }, [gymBranding?.fontFamily]);

  // Session timer (runs independently of Spotify state)
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  useEffect(() => {
    if (view!=="live"&&view!=="display"&&view!=="overview-display") return;
    if (!liveState.playing) return;
    const iv = setInterval(() => {
      setLiveState(ls => {
        const ss = stagesRef.current;
        const dur = ss[ls.idx]?.dur||1;
        const next = ls.elapsed + 1;
        // Crossfade: fade out 8s before stage ends
        const stageDur = ss[ls.idx]?.dur || 0;
        const timeLeft = stageDur - ls.elapsed;
        if (player && ls.playing && timeLeft > 0 && timeLeft <= 8) {
          player.setVolume(Math.max(0.01, timeLeft / 8)).catch(()=>{});
        } else if (player && ls.playing && (ls.elapsed === 1 || timeLeft > 8)) {
          player.setVolume(1).catch(()=>{});
        }
        if (next >= dur) {
          fireSiren();
          if (ls.idx < ss.length-1) {
            return {...ls, idx:ls.idx+1, elapsed:0};
          }
          // Session complete — stop timer & pause music, save session
          if (player) player.pause().catch(()=>{});
          clearInterval(iv);
          saveSession();
          return {...ls, playing:false, elapsed:dur};
        }
        return {...ls, elapsed:next};
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [view, liveState.playing, player]);

  const handleAddTrack    = (si, t)  => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:[...(n[si].tracks||[]),t]};         return n; });
  const handleRemoveTrack = (si, ti) => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:n[si].tracks.filter((_,i)=>i!==ti)}; return n; });
  const handleReorderTrack = (si, from, to) => setStages(ss => { const n=[...ss]; const tr=[...n[si].tracks]; const [mv]=tr.splice(from,1); tr.splice(to,0,mv); n[si]={...n[si],tracks:tr}; return n; });
  const handleAddStage    = ()       => setStages(ss => [...ss, {id:uid(),type:"circuit",name:`Stage ${ss.length+1}`,dur:600,exercises:[],tracks:[]}]);
  const handleRemoveStage = i        => setStages(ss => ss.filter((_,j)=>j!==i));
  const handleNextStage   = ()       => setLiveState(ls => ls.idx < stages.length-1 ? {...ls, idx:ls.idx+1, elapsed:0} : ls);
  const handleSkipTimer   = (secs)   => setLiveState(ls => {
    const dur = stages[ls.idx]?.dur || 1;
    const next = Math.max(0, Math.min(ls.elapsed + secs, dur - 1));
    return {...ls, elapsed: next};
  });
  const handleStageChange    = (i, s)  => setStages(ss => { const n=[...ss]; n[i]=s; return n; });
  const handleReorderStages  = (arr)  => setStages(arr);
  // F12: Move exercise from one stage to another
  const handleMoveExercise = (fromStageIdx, exIdx, toStageIdx) => {
    setStages(ss => {
      const n = ss.map(s => ({...s, exercises:[...s.exercises]}));
      const [moved] = n[fromStageIdx].exercises.splice(exIdx, 1);
      n[toStageIdx].exercises.push(moved);
      return n;
    });
  };

  const handleDjThisClass = async () => {
    if (!token) return;
    setDjProgress({active:true, message:"Fetching your Spotify playlists...", pct:5, done:false});
    try {
      // 1. Get playlists
      const pls = await apiGetPlaylists();
      if (!pls?.length) { setDjProgress({active:true,message:"No playlists found.",pct:0,done:true}); return; }
      setDjProgress({active:true, message:`Loading tracks from ${pls.length} playlists...`, pct:10, done:false});

      // 2. Collect all tracks
      let allTracks = [];
      for (let i=0; i<pls.length; i++) {
        const tracks = await apiGetPlaylistTracks(pls[i].id);
        if (Array.isArray(tracks)) allTracks = allTracks.concat(tracks.map(normSpTrack));
        setDjProgress({active:true, message:`Loading playlist ${i+1}/${pls.length}...`, pct:10+Math.round((i/pls.length)*15), done:false});
      }
      // Deduplicate
      const seen = new Set();
      allTracks = allTracks.filter(t=>{ if(!t?.id||seen.has(t.id)) return false; seen.add(t.id); return true; });
      setDjProgress({active:true, message:`Analysing ${allTracks.length} tracks...`, pct:25, done:false});

      // 3. Enrich BPM via GetSongBPM (batch, 150ms delay between calls)
      const bpmCache = JSON.parse(localStorage.getItem("sp_bpm_cache")||"{}");
      const enriched = [];
      for (let i=0; i<allTracks.length; i++) {
        const t = allTracks[i];
        let bpm = bpmCache[t.id] || t.bpm || 0;
        let camelot = t.camelot || "";
        if (!bpm && t.t && t.a) {
          const data = await fetchBpmData(t.t, t.a);
          if (data) { bpm = data.bpm; camelot = data.camelot; }
          await new Promise(r=>setTimeout(r,150)); // rate limit
        }
        enriched.push({...t, bpm, camelot});
        if (i % 10 === 0) setDjProgress({active:true, message:`Analysing tracks... ${i}/${allTracks.length}`, pct:25+Math.round((i/allTracks.length)*35), done:false});
      }

      // 4. Fill each stage
      const newStages = stages.map((stage, si) => {
        const cfg = SCFG[stage.type] || {bpmMin:100, bpmMax:140};
        setDjProgress({active:true, message:`Building music for "${stage.name}"...`, pct:60+Math.round((si/stages.length)*35), done:false});
        let prevCamelot = "";
        const scored = enriched.map(t=>({...t, _score: scoreTrackForStage(t, cfg.bpmMin, cfg.bpmMax, prevCamelot)}));
        const selected = selectTracksForDuration(scored, stage.dur, stage.type);
        return {...stage, tracks: selected};
      });

      setStages(newStages);
      setDjProgress({active:true, message:"✅ Class DJ'd! Music assigned to all stages.", pct:100, done:true});
    } catch(e) {
      setDjProgress({active:true, message:`Error: ${e.message}`, pct:0, done:true});
    }
    setTimeout(()=>setDjProgress({active:false,message:"",pct:0,done:false}),3000);
  };

  const handleSelectTemplate = t => {
    const saved = templateTracks[t.id] || {};
    setStages(t.stages.map((s, i) => ({ ...s, id:uid(), tracks:[...(saved[i]||[])], exercises:s.exercises.map(e=>({...e})) })));
    setSessionName(t.name);
    setView("builder");
  };
  const handleSelectClassStyle = (classTypeKey, subTypeKey) => {
    const stageDefs = CLASS_STAGE_TEMPLATES[classTypeKey]?.[subTypeKey] || [];
    const initialStages = stageDefs.map(s => ({...s, id:uid(), exercises:[], tracks:[]}));
    const withExercises = distributeLibraryExercises(classTypeKey, subTypeKey, initialStages);
    const cls = WORKOUT_LIBRARY[classTypeKey];
    const sub = cls?.subTypes?.[subTypeKey];
    setStages(withExercises);
    setSessionName(`${cls?.label || classTypeKey} — ${sub?.label || subTypeKey}`);
    setClassChoice({classType: classTypeKey, subType: subTypeKey});
    setView("builder");
  };
  const shareWithClass = () => {
    const payload = {
      name: sessionName,
      stages: stages.map(s => ({
        name: s.name, type: s.type, dur: s.dur,
        exercises: (s.exercises||[]).map(e => ({ n:e.n, s:e.s, r:e.r, rest:e.rest }))
      }))
    };
    const encoded = btoa(JSON.stringify(payload));
    const url = `${window.location.origin}${window.location.pathname}?mode=attendee&data=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }).catch(() => {
      // fallback: open in new tab
      window.open(url, "_blank");
    });
  };

  // If this window is a popup handling the OAuth callback, just show a loading screen
  // (The useEffect above will exchange the code, notify the opener, and close)
  if (window.opener && !window.opener.closed && new URLSearchParams(window.location.search).get("code")) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,color:T.text,flexDirection:"column",gap:"16px"}}>
      <div style={{fontSize:"32px"}}>🎵</div>
      <p style={{fontSize:"15px",fontWeight:"700"}}>Connecting to Spotify…</p>
      <p style={{fontSize:"12px",color:T.muted}}>This window will close automatically.</p>
    </div>;
  }

  if (!pinUnlocked) return <PinScreen onUnlock={()=>setPinUnlocked(true)}/>;
  if (!token) return <LoginScreen onLogin={redirectToSpotify} authError={authError}/>;

  const navItems = [
    {key:"dashboard",    label:isXSmall?"Home":"Dashboard"},
    {key:"builder",      label:"Builder"},
    {key:"templates",    label:isXSmall?"Tmpl":"Templates"},
    {key:"library",      label:isXSmall?"Lib":"Library"},
    {key:"glossary",     label:isXSmall?"Glos":"Glossary"},
    {key:"analytics",    label:isXSmall?"Stats":"Analytics"},
    {key:"music",        label:isXSmall?"Music":"Music Hub"},
    {key:"schedule",     label:isXSmall?"Sched":"Schedule"},
    {key:"members",      label:isXSmall?"Mbrs":"Members"},
    {key:"brand",        label:isXSmall?"Brand":"Brand Studio"},
    {key:"integrations", label:isXSmall?"Intg":"Integrations"},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:T.bg,color:T.text,
      fontFamily: gymBranding?.fontFamily && gymBranding.fontFamily !== "system"
        ? `'${gymBranding.fontFamily}', 'Hanken Grotesk', system-ui, sans-serif`
        : "'Hanken Grotesk',system-ui,sans-serif"}}>

      {view!=="display"&&view!=="overview-display" && (
      <header style={{display:"flex",alignItems:"center",gap:"8px",padding:isMobile?"10px 14px":"12px 24px",borderBottom:`1px solid ${T.border}`,background:T.card,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
          {gymBranding?.logo
            ? <><img src={gymBranding.logo} style={{height:isMobile?"26px":"32px",maxWidth:isMobile?"90px":"130px",objectFit:"contain"}} alt="gym logo"/>{gymBranding.gymName && !isMobile && <span style={{fontSize:"14px",fontWeight:"800",letterSpacing:"1px",color:T.text,whiteSpace:"nowrap"}}>{gymBranding.gymName}</span>}</>
            : <><JungleLogo size={isMobile?24:30}/>{!isMobile && <span style={{fontSize:"16px",fontWeight:"800",letterSpacing:"2px"}}>JUNGLE</span>}</>
          }
        </div>
        <nav style={{flex:1,display:"flex",justifyContent:"center",gap:"4px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {navItems.map(n => (
            <button key={n.key} onClick={()=>{
              if ((view==="live"||view==="display") && player) player.pause().catch(()=>{});
              if (view==="live"||view==="display") setLiveState(ls=>({...ls,playing:false}));
              setView(n.key);
            }} style={{padding:isMobile?"6px 12px":"8px 14px",background:view===n.key?T.accent+"20":"transparent",color:view===n.key?T.accent:T.muted,border:`1px solid ${view===n.key?T.accent+"40":"transparent"}`,borderRadius:"7px",cursor:"pointer",fontSize:isMobile?"12px":"13px",fontWeight:"600",whiteSpace:"nowrap",flexShrink:0}}>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{display:"flex",gap:isMobile?"6px":"12px",alignItems:"center",flexShrink:0}}>
          <button onClick={()=>setDark(!dark)} style={{background:"none",border:"none",cursor:"pointer",color:T.muted,padding:"6px",display:"flex"}}>
            {dark
              ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          {deviceId && !isMobile && <SpBadge><Wifi size={12}/> Spotify Ready</SpBadge>}
          {deviceId && isMobile && <Wifi size={14} color={T.green}/>}
          {!isMobile && (
            <button onClick={shareWithClass} style={{display:"flex",alignItems:"center",gap:"5px",padding:"6px 12px",background:shareCopied?T.green+"20":T.navy,color:shareCopied?T.green:T.muted,border:`1px solid ${shareCopied?T.green+"40":T.border}`,borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"600",transition:"all 0.2s"}}>
              {shareCopied ? <Check size={13}/> : <Share2 size={13}/>}
              {shareCopied ? "Copied!" : "Share"}
            </button>
          )}
          {isMobile && (
            <button onClick={shareWithClass} style={{background:"none",border:"none",cursor:"pointer",color:shareCopied?T.green:T.muted,padding:"4px",display:"flex"}}>
              {shareCopied ? <Check size={16}/> : <Share2 size={16}/>}
            </button>
          )}
          <button onClick={()=>setShowProfile(true)} style={{width:"34px",height:"34px",borderRadius:"50%",background:T.navy,border:`1px solid ${T.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:0}}>
            {profile?.images?.[0]?.url
              ? <img src={profile.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/>
              : <User size={16} color={T.muted}/>
            }
          </button>
        </div>
      </header>
      )}

      {spError && view!=="display"&&view!=="overview-display" && (
        <div style={{padding:"10px 24px",background:T.accent+"20",borderBottom:`1px solid ${T.accent}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <p style={{fontSize:"13px",color:T.accent,fontWeight:"600"}}>&#9888;&#65039; {spError}</p>
          <button onClick={()=>window.location.reload()} style={{padding:"5px 14px",background:T.accent,color:"white",border:"none",borderRadius:"5px",cursor:"pointer",fontSize:"12px",fontWeight:"600"}}>Refresh</button>
        </div>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {view==="dashboard"        && <DashboardScreen onNewSession={()=>setView("builder")} onViewTemplates={()=>setView("templates")} onViewCalendar={()=>setView("calendar")} onViewAnalytics={()=>setView("analytics")} onViewGlossary={()=>setView("glossary")} onViewLibrary={()=>setView("library")} profile={profile} sessionHistory={sessionHistory}/>}
        {view==="templates"        && <TemplatesScreen onSelectClassStyle={handleSelectClassStyle} onBack={()=>setView("dashboard")}/>}
        {view==="builder"          && <BuilderScreen stages={stages} onStageChange={handleStageChange} onAddStage={handleAddStage} onRemoveStage={handleRemoveStage} onRemoveTrack={handleRemoveTrack} onAddTrack={handleAddTrack} onReorderTrack={handleReorderTrack} sessionName={sessionName} onSessionNameChange={setSessionName} onStartSession={()=>{setLiveState({playing:false,idx:0,elapsed:0});setView("live");}} onReorderStages={handleReorderStages} onMoveExercise={handleMoveExercise} onOverviewDisplay={()=>setView("overview-display")} classChoice={classChoice} onClassChoiceChange={setClassChoice} onDjClass={handleDjThisClass} djProgress={djProgress}/>}
        {view==="library"          && <LibraryBrowserModal onClose={()=>setView("dashboard")}/>}
        {view==="overview-display" && <OverviewDisplayScreen stages={stages} sessionName={sessionName} onBack={()=>setView("builder")}/>}
        {view==="live"             && <LiveScreen stages={stages} onBack={()=>{player?.pause().catch(()=>{}); setLiveState(ls=>({...ls,playing:false})); saveSession(); setView("builder");}} liveState={liveState} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} player={player} deviceId={deviceId} spPaused={spPaused} nowPlaying={nowPlaying} onDisplayMode={()=>setView("display")} onNextStage={handleNextStage} onSkipTimer={handleSkipTimer} onAddTrack={handleAddTrack}/>}
        {view==="display"          && <DisplayScreen stages={stages} liveState={liveState} onBack={()=>setView("live")} player={player} deviceId={deviceId} spPaused={spPaused} nowPlaying={nowPlaying} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))}/>}
        {view==="analytics"        && <AnalyticsScreen onBack={()=>setView("dashboard")}/>}
        {view==="integrations"     && <IntegrationsScreen onBack={()=>setView("dashboard")}/>}
        {view==="glossary"         && <GlossaryScreen onBack={()=>setView("dashboard")}/>}
        {view==="calendar"         && <CalendarScreen onBack={()=>setView("dashboard")}/>}
        {view==="music"            && <MusicHubScreen onBack={()=>setView("dashboard")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>}
        {view==="schedule"         && <CalendarScreen onBack={()=>setView("dashboard")}/>}
        {view==="members"          && <MemberScreen onBack={()=>setView("dashboard")}/>}
        {view==="brand"            && <BrandStudioScreen onBack={()=>setView("dashboard")} gymBranding={gymBranding} onBrandingChange={setGymBranding}/>}
      </div>

      {showProfile && <ProfileModal profile={profile} onClose={()=>setShowProfile(false)} onLogout={()=>{logout();setView("dashboard");setShowProfile(false);}} sessionHistory={sessionHistory} gymBranding={gymBranding} onBrandingChange={setGymBranding}/>}
    </div>
  );
}
