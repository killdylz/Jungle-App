// ─── Spotify PKCE auth ───────────────────────────────────────────────────────
// Quarantined (audit 2.1, FLAGS.music). Nothing here runs while the flag is off:
// useSpotify returns before its first effect, so no token is read and no redirect
// is ever issued. Moved verbatim from App.jsx in decomposition stage 3.
//
// randStr, b64url and doRefresh stay module-private — they were only ever called
// from inside this file.

const SPOTIFY_CLIENT_ID = "594e4864b902473c86c939c9cccce420";
const REDIRECT_URI      = window.location.origin + window.location.pathname;
const IS_CONFIGURED     = SPOTIFY_CLIENT_ID !== "YOUR_CLIENT_ID_HERE";

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

export {
  SPOTIFY_CLIENT_ID, REDIRECT_URI, IS_CONFIGURED, SP_SCOPES,
  redirectToSpotify, openSpotifyAuthPopup, exchangeCode,
  saveToken, getToken, clearTokens,
};
