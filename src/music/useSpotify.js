// ─── useSpotify ──────────────────────────────────────────────────────────────
// The quarantine boundary itself. Moved verbatim from App.jsx in stage 3.
import { useState, useEffect } from "react";
import { FLAGS } from "../config/flags.js";
import { exchangeCode, saveToken, getToken, clearTokens } from "./spotifyAuth.js";
import { getSpotifyProfile, apiGetDevices } from "./spotifyApi.js";

// ─── useSpotify hook ──────────────────────────────────────────────────────────
function useSpotify() {
  const [token,          setToken]          = useState(null);
  const [player,         setPlayer]         = useState(null);
  const [deviceId,       setDeviceId]       = useState(null);  // browser SDK device
  const [activeDeviceId, setActiveDeviceId] = useState(null);  // chosen playback device
  const [devices,        setDevices]        = useState([]);    // all available devices
  const [nowPlaying,     setNowPlaying]     = useState(null);
  const [spPaused,       setSpPaused]       = useState(true);
  const [sdkReady,       setSdkReady]       = useState(false);
  const [authError,      setAuthError]      = useState(null);
  const [spError,        setSpError]        = useState(null);
  const [profile,        setProfile]        = useState(null);

  useEffect(() => {
    // Music quarantine (audit 2.1). This is the ONE gate that matters: every
    // effect below is already `if (!token) return`, so leaving the token null
    // stops the SDK script load, the OAuth exchange and the player entirely —
    // no Spotify network call is made and no listener is attached. Downstream,
    // `nowPlaying`/`deviceId` stay null, which is what silences the dozens of
    // `{nowPlaying && …}` fragments scattered through the runner and displays
    // without touching each one.
    if (!FLAGS.music) return;
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
    const p = new window.Spotify.Player({ name:"Jungle 🌿", getOAuthToken:async cb=>{ const t=await getToken(); if(t) cb(t); }, volume:0.8 });
    p.addListener("ready", ({device_id})=>{
      if (!live) return;
      setDeviceId(device_id);
      setSpError(null);
      // Default active device to browser player unless user already picked one
      setActiveDeviceId(prev => prev || device_id);
      // Refresh device list once SDK is ready
      apiGetDevices().then(devs => { if(live) setDevices(devs); }).catch(()=>{});
    });
    p.addListener("not_ready", ()=>{ if(live) { setDeviceId(null); setSpError("Spotify player disconnected. Try refreshing the page."); } });
    p.addListener("player_state_changed", state=>{
      if(!state||!live) return;
      setNowPlaying(state.track_window?.current_track??null);
      setSpPaused(state.paused);
    });
    p.addListener("authentication_error", ({message})=>{ if(live) setSpError("Spotify authentication failed: " + (message||"session expired. Please re-login.")); });
    p.addListener("account_error", ({message})=>{ if(live) setSpError("Spotify account error: " + (message||"Premium required for playback.")); });
    p.connect();
    setPlayer(p);
    return ()=>{ live=false; p.disconnect(); };
  }, [sdkReady, token]);

  const refreshDevices = async () => {
    const devs = await apiGetDevices().catch(()=>[]);
    setDevices(devs);
    return devs;
  };

  const logout = () => { clearTokens(); player?.disconnect(); setToken(null); setPlayer(null); setDeviceId(null); setActiveDeviceId(null); setDevices([]); setNowPlaying(null); setSdkReady(false); setProfile(null); setSpError(null); };

  // Returned AFTER every hook above has run, never before — the hook count must
  // not depend on a flag, or flipping `music` back on would break hook order.
  if (!FLAGS.music) return MUSIC_OFF;

  return { token, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices, nowPlaying, spPaused, authError, spError, profile, logout };
}

// The inert shape `useSpotify` returns while music is quarantined. Frozen so a
// caller that tries to write to it fails loudly in dev rather than appearing to
// work; every field matches the live shape so no call site needs a null check
// it did not already have.
const MUSIC_OFF = Object.freeze({
  token: null, player: null, deviceId: null, activeDeviceId: null,
  setActiveDeviceId: () => {}, devices: Object.freeze([]),
  refreshDevices: async () => [], nowPlaying: null, spPaused: true,
  authError: null, spError: null, profile: null, logout: () => {},
});

export { useSpotify, MUSIC_OFF };
