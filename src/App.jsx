import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Plus, Trash2, Monitor, ArrowLeft, Music, LogOut, Search, Loader, Wifi, User, Sun, Moon, BookOpen, BarChart2, Calendar, X, ChevronLeft, ChevronRight, Clock, Home, Layers, Check, Mic, Download, Upload, LayoutGrid, List, PlayCircle, Users, Palette, Plug, Zap } from "lucide-react";
import { supabase, supabaseEnabled } from "./supabase.js";
import { useJungleAuth } from "./AuthGate.jsx";
import { FLAGS, isViewEnabled } from "./config/flags.js";
import * as store from "./lib/store.js";
import { TEMPLATES } from "./data/templates.js";
import { GLOSSARY } from "./data/glossary.js";
import { SEED_PERSONAS } from "./data/personas.seed.js";
import { WORKOUT_LIBRARY, STAGE_LIBRARY_MAP, CLASS_STAGE_TEMPLATES } from "./data/library.js";
import { classTypesOf, aggregateClassType, aggregateMovements, classCategory } from "./lib/personaAggregate.js";
import { CATEGORIES, categoryOf } from "./lib/movementTaxonomy.js";
import { deriveBlueprint, reconcileBlueprint, draftFromBlueprint, BLUEPRINT_PRESETS } from "./lib/blueprints.js";
import { slidesEnabled, getSlidesToken, parseDriveId, resolveDriveTarget, listPresentations, fetchPresentationText, splitDeckSlides, slideDate, looksLikeClassSlide } from "./lib/slidesImport.js";
import { parsePlanText, deriveHints, PARSE_THRESHOLD, PARSER_VERSION } from "./lib/planParser.js";
import { analyzeAttendanceCsv, describeImport } from "./lib/csvImport.js";
import { recordSession as recordCheckinSession, p6Summary, P6_TARGET_SEC } from "./lib/checkinMetrics.js";
import { retentionSummary, describeRetention, applyRetentionActions } from "./lib/retention.js";
import { onRoomState, sendRoomState } from "./lib/room.js";
// src/lib/qr.js is intentionally kept but unimported: the N4 member link (Day 5)
// is the QR's first honest destination.
import { ThemeContext, useTheme, useWindowWidth, Btn, Input, Select, Tag, SpBadge, JungleLogo, BrandLogo, StatCard } from "./ui/primitives.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import { ROLE_LABEL, MOVEMENT_CATEGORY_LABEL, CLASS_CATEGORY_LABEL, SOURCE_LABEL,
         KIND_LABEL, schemeTypeLabel, readErrorMessage } from "./ui/labels.js";

// Human labels for the per-view error boundary, so a crash reads "The Class Runner
// panel stopped responding" rather than the internal view key.
const VIEW_LABELS = {
  dashboard:"Dashboard", templates:"Templates", builder:"Builder", personas:"Coaches",
  library:"Exercise Library", live:"Class Runner", "room-tv":"Room TV", analytics:"Analytics",
  glossary:"Glossary", calendar:"Schedule", music:"Music Hub", member:"Members",
  integrations:"Integrations", "brand-studio":"Brand Studio", team:"Team",
};

// Skin fonts are bundled, not fetched — see src/fonts.js for why (P7: a Room TV
// on gym Wi-Fi with no internet must still render in the gym's type).
import "./fonts.js";

const SPOTIFY_CLIENT_ID = "594e4864b902473c86c939c9cccce420";
const REDIRECT_URI      = window.location.origin + window.location.pathname;
const IS_CONFIGURED     = SPOTIFY_CLIENT_ID !== "YOUR_CLIENT_ID_HERE";

// ─── Theme — Canopy skin (matches design mockups) ─────────────────────────────
// ─── Preset Skins ──────────────────────────────────────────────────────────────
const PRESET_SKINS = {
  canopy: {
    name:"Canopy", vibe:"natural",
    tokens:{ bg:"#0A0F0C", card:"#0F1611", navy:"#141D17", border:"rgba(255,255,255,.07)",
             accent:"#7BE3A4", green:"#CFF5DE", text:"#E8EFE9", muted:"#8AA294" },
    fonts:{ display:"Space Grotesk", body:"Hanken Grotesk" },
    voice:"credible-community", numeralStyle:"proportional", accentBehaviour:"flat", mode:"dark",
    programs:[{name:"Strength",tint:"#A78BFA"},{name:"Endurance",tint:"#34D399"},{name:"Mobility",tint:"#22D3EE"}],
  },
  pulse: {
    name:"Pulse", vibe:"energetic",
    tokens:{ bg:"#08090A", card:"#101113", navy:"#17181B", border:"rgba(255,255,255,.08)",
             accent:"#D6FF3D", green:"#ECFFA3", text:"#F4F5F2", muted:"#8B8F8A" },
    fonts:{ display:"Anton", body:"Archivo" },
    voice:"competitive-measurable", numeralStyle:"tabular", accentBehaviour:"glow", mode:"dark",
    programs:[{name:"Race",tint:"#FB7185"},{name:"Power",tint:"#FBBF24"},{name:"Engine",tint:"#38BDF8"}],
  },
  atelier: {
    name:"Atelier", vibe:"luxury",
    tokens:{ bg:"#0C0C0E", card:"#131316", navy:"#1A1A1E", border:"rgba(255,255,255,.06)",
             accent:"#C8A86A", green:"#E8D6AE", text:"#ECEAE6", muted:"#908C85" },
    fonts:{ display:"Instrument Serif", body:"Manrope" },
    voice:"technical-considered", numeralStyle:"proportional", accentBehaviour:"flat", mode:"dark",
    programs:[{name:"Reformer",tint:"#C8A86A"},{name:"Sculpt",tint:"#D4A5A5"},{name:"Flow",tint:"#9FB4C4"}],
  },
};

// ─── Theme object (populated from active skin at render — keeps all T.x refs working) ──
const DARK = PRESET_SKINS.canopy.tokens;   // fallback reference kept for safety
const T = { ...PRESET_SKINS.canopy.tokens };
// ThemeContext + useTheme moved to src/ui/primitives.jsx (imported above).

// Switching skins used to fetch that skin's font pair from the Google CDN, which
// meant re-skinning a display mid-demo needed the internet. All three preset
// pairs are bundled now (src/fonts.js), so this is a no-op kept as a named seam:
// a gym that later supplies its own licensed font file gets it wired in here.
function injectSkinFonts(_skin) { /* bundled at build time — nothing to fetch */ }

// ─── Write CSS custom properties onto :root ─────────────────────────────────────
function applySkinCSS(tokens, meta={}) {
  const r = document.documentElement.style;
  r.setProperty("--bg",     tokens.bg);
  r.setProperty("--card",   tokens.card);
  r.setProperty("--navy",   tokens.navy);
  r.setProperty("--border", tokens.border);
  r.setProperty("--accent", tokens.accent);
  r.setProperty("--green",  tokens.green);
  r.setProperty("--text",   tokens.text);
  r.setProperty("--muted",  tokens.muted);
  // Compute on-accent / on-green: dark bg text for light accents, light text for dark accents
  const _rgbA = hexToRgb(tokens.accent);
  const _lumA = _rgbA ? relativeLuminance(..._rgbA) : 0;
  r.setProperty("--on-accent", _lumA > 0.18 ? tokens.bg : tokens.text);
  const _rgbG = hexToRgb(tokens.green);
  const _lumG = _rgbG ? relativeLuminance(..._rgbG) : 0;
  r.setProperty("--on-green", _lumG > 0.18 ? tokens.bg : tokens.text);
  // Alpha variant shortcuts for CSS-only colour transitions
  r.setProperty("--accent-10", tokens.accent + "1A");
  r.setProperty("--accent-20", tokens.accent + "33");
  r.setProperty("--accent-30", tokens.accent + "4D");
  r.setProperty("--accent-40", tokens.accent + "66");
  r.setProperty("--green-20",  tokens.green  + "33");
  r.setProperty("--green-40",  tokens.green  + "66");
  // FR-H4/H5: behavioural tokens -> CSS vars
  const glow = meta.accentBehaviour === "glow";
  r.setProperty("--glow", glow ? `0 0 22px ${tokens.accent}66` : "none");
  const num = meta.numeralStyle || "proportional";
  r.setProperty("--num", (num==="tabular"||num==="mono") ? "tabular-nums" : "normal");
  r.setProperty("--num-font", num==="mono" ? "'Space Mono',ui-monospace,monospace" : "inherit");
  // FR-A5: font tokens (display -> headings, body -> shell)
  if (meta.fonts) {
    r.setProperty("--display", `'${meta.fonts.display}', sans-serif`);
    r.setProperty("--body", `'${meta.fonts.body}', sans-serif`);
    document.body.style.fontFamily = `'${meta.fonts.body}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  }
  // FR-A4: smooth reskin transition (inject once)
  if (!document.getElementById("jungle-reskin-tx")) {
    const _tx = document.createElement("style"); _tx.id = "jungle-reskin-tx";
    _tx.textContent = "#root *{transition:background-color .35s ease,color .35s ease,border-color .35s ease,fill .35s ease;}";
    document.head.appendChild(_tx);
  }
  // Body background keeps in sync with skin
  document.body.style.background = tokens.bg;
}

// FR-H3: microcopy register per voice. Surfaces read copy from here, never hard-code strings.
const BRAND_COPY = {
  "systemised-motivational": { kioskTag:"Show up. Do the work.", waitingHead:"Your session starts soon", stationCue:"Lock in" },
  "earned-disciplined":      { kioskTag:"Earn it.", waitingHead:"Warm up, get ready", stationCue:"Hold the standard" },
  "joyful-inclusive":        { kioskTag:"Come move with us", waitingHead:"So glad you are here", stationCue:"You have got this" },
  "competitive-measurable":  { kioskTag:"Beat yesterday", waitingHead:"Next heat loading", stationCue:"Push the pace" },
  "credible-community":      { kioskTag:"Train together", waitingHead:"Class starting shortly", stationCue:"Find your rhythm" },
  "technical-considered":    { kioskTag:"Move with intent", waitingHead:"Preparing your session", stationCue:"Precision over speed" },
};
function brandCopy(voice, slot){ const v = BRAND_COPY[voice] || BRAND_COPY["credible-community"]; return v[slot] || ""; }
function hexA(hex, a){ const c=hexToRgb(hex); return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : hex; }
// FR-H7: default program sub-tints (decorative only).
const DEFAULT_PROGRAMS = [ { name:"Strength", tint:"#A78BFA" }, { name:"Conditioning", tint:"#F59E0B" }, { name:"Mobility", tint:"#5BD0C0" } ];
function ProgramChip({ name, tint }) {
  const hex = tint || "#7BE3A4";
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:hex,background:hexA(hex,0.14),border:`1px solid ${hexA(hex,0.4)}`,whiteSpace:"nowrap"}}>{name}</span>;
}

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
// ─── Colour utilities ─────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace("#","");
  const n = parseInt(h,16);
  return [n>>16&255,(n>>8)&255,n&255];
}
function rgbToHex(r,g,b) {
  return "#"+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}
// RGB → HSL (0-360, 0-1, 0-1)
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min)return[0,0,l];
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min);
  let h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
  return[h*60,s,l];
}
function hslToRgb(h,s,l){
  h/=360;
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const hue=(t)=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return[Math.round(hue(h+1/3)*255),Math.round(hue(h)*255),Math.round(hue(h-1/3)*255)];
}
// Relative luminance for WCAG contrast
function relativeLuminance(r,g,b){
  const sRGB=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});
  return 0.2126*sRGB[0]+0.7152*sRGB[1]+0.0722*sRGB[2];
}
function wcagContrast(hex1,hex2){
  const l1=relativeLuminance(...hexToRgb(hex1));
  const l2=relativeLuminance(...hexToRgb(hex2));
  const lighter=Math.max(l1,l2),darker=Math.min(l1,l2);
  return(lighter+0.05)/(darker+0.05);
}
// Nudge lightness until contrast target met
function nudgeForContrast(fgHex, bgHex, target=4.5, maxIter=30){
  let [h,s,l]=rgbToHsl(...hexToRgb(fgHex));
  let iter=0;
  while(wcagContrast(rgbToHex(...hslToRgb(h,s,l)),bgHex)<target && iter<maxIter){
    l=Math.min(1,l+0.03);iter++;
  }
  return rgbToHex(...hslToRgb(h,s,l));
}
// FR-H6/D4: direction-aware contrast nudge (darkens ink on light bg, lightens on dark bg).
function nudgeContrast(fgHex, bgHex, target=4.5, maxIter=40){
  let [h,s,l]=rgbToHsl(...hexToRgb(fgHex));
  const [,,bgL]=rgbToHsl(...hexToRgb(bgHex));
  const dir = bgL > 0.5 ? -0.03 : 0.03;
  let iter=0;
  while(wcagContrast(rgbToHex(...hslToRgb(h,s,l)),bgHex)<target && iter<maxIter && l>0.02 && l<0.98){
    l=Math.max(0,Math.min(1,l+dir));iter++;
  }
  return rgbToHex(...hslToRgb(h,s,l));
}

// ─── Extract colour palette from image ────────────────────────────────────────
function extractPalette(imgSrc, callback) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const freq = {};
    let lumaSum = 0, lumaCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      lumaSum += (0.299*r + 0.587*g + 0.114*b)/255; lumaCount++;
      if (r>230&&g>230&&b>230) continue; // near-white
      if (r<20&&g<20&&b<20) continue;    // near-black
      const [,s,l] = rgbToHsl(r,g,b);
      if (s < 0.15) continue;            // near-grey
      const k = `${Math.round(r/16)*16},${Math.round(g/16)*16},${Math.round(b/16)*16}`;
      freq[k] = (freq[k]||0) + 1;
    }
    const total = Object.values(freq).reduce((a,b)=>a+b,0) || 1;
    const swatches = Object.entries(freq)
      .map(([k,cnt]) => {
        const [r,g,b] = k.split(",").map(Number);
        const [,s,l] = rgbToHsl(r,g,b);
        return { hex:rgbToHex(r,g,b), score: s * (cnt/total) };
      })
      .sort((a,b)=>b.score-a.score)
      .slice(0,6)
      .map(x=>x.hex);
    callback(swatches.length ? swatches : null, lumaCount ? lumaSum/lumaCount : 0.2);
  };
  img.onerror = () => callback(null, 0.2);
  img.src = imgSrc;
}

// ─── Legacy single-colour extractor (kept for existing callers) ────────────────
function extractDominantColor(imgSrc, callback) {
  extractPalette(imgSrc, swatches => callback(swatches ? swatches[0] : null));
}

// ─── Generate a full accessible skin from a palette ───────────────────────────
function generateSkinFromPalette(swatches, vibe="natural", mode="dark") {
  const accent = swatches[0] || "#7BE3A4";
  const [ah,as,al] = rgbToHsl(...hexToRgb(accent));

  // FR-H6: bg/text polarity from the detected mode
  let bg, card, navy, text, muted, green, border;
  if (mode === "light") {
    bg   = rgbToHex(...hslToRgb(ah, Math.min(as*0.25,0.10), 0.97));
    card = rgbToHex(...hslToRgb(ah, Math.min(as*0.30,0.12), 0.93));
    navy = rgbToHex(...hslToRgb(ah, Math.min(as*0.35,0.14), 0.88));
    text = rgbToHex(...hslToRgb(ah, 0.18, 0.14));
    muted= rgbToHex(...hslToRgb(ah, 0.12, 0.40));
    green= rgbToHex(...hslToRgb(ah, Math.max(0,as-0.05), Math.max(0.30, al-0.18)));
    border = "rgba(0,0,0,.12)";
  } else {
    bg   = rgbToHex(...hslToRgb(ah, Math.min(as*0.6,0.25), 0.06));
    card = rgbToHex(...hslToRgb(ah, Math.min(as*0.55,0.22), 0.09));
    navy = rgbToHex(...hslToRgb(ah, Math.min(as*0.5,0.20), 0.12));
    text = rgbToHex(...hslToRgb(ah, 0.08, 0.92));
    muted= rgbToHex(...hslToRgb(ah, 0.05, 0.60));
    green= rgbToHex(...hslToRgb(ah, Math.max(0,as-0.1), Math.min(0.95,al+0.22)));
    border = "rgba(255,255,255,.07)";
  }

  // Accessibility clamp
  text  = nudgeContrast(text,  bg, 7.0);
  muted = nudgeContrast(muted, bg, 4.5);

  // Font pair by vibe
  const fontPairs = {
    energetic: { display:"Anton",             body:"Archivo" },
    luxury:    { display:"Instrument Serif",  body:"Manrope" },
    bold:      { display:"Space Grotesk",     body:"Inter Tight" },
    natural:   { display:"Space Grotesk",     body:"Hanken Grotesk" },
    calm:      { display:"Space Grotesk",     body:"Hanken Grotesk" },
  };
  const fonts = fontPairs[vibe] || fontPairs.natural;

  // Contrast metrics
  const contrast = {
    textOnBg:   wcagContrast(text,   bg),
    mutedOnBg:  wcagContrast(muted,  bg),
    accentOnBg: wcagContrast(accent, bg),
    passesAA:   wcagContrast(text, bg) >= 4.5,
  };

  return {
    name:"Custom — Generated",
    source:"generated",
    vibe,
    mode,
    tokens:{ bg, card, navy, border, accent, green, text, muted },
    fonts,
    contrast,
  };
}

// FR-H8: a sub-brand is a child theme overriding accent + numeralStyle (often voice), inheriting the rest.
function resolveSubBrand(parent, overrides={}) {
  if (!parent) return null;
  return {
    ...parent,
    name: overrides.name || `${parent.name} sub-brand`,
    parentName: parent.name,
    isSubBrand: true,
    tokens: { ...parent.tokens, accent: overrides.accent || parent.tokens.accent, green: overrides.green || parent.tokens.green },
    numeralStyle: overrides.numeralStyle || parent.numeralStyle,
    voice: overrides.voice || parent.voice,
  };
}
// FR-H1: one palette -> three independently contrast-clamped themes (one recommended).
function generateThemes(swatches, avgLuma){
  const pal = (swatches && swatches.length) ? swatches : ["#7BE3A4"];
  const mode = (avgLuma != null && avgLuma >= 0.5) ? "light" : "dark";
  const a0 = pal[0];
  const a1 = pal[1] || a0;
  const [h,sat,l] = rgbToHsl(...hexToRgb(a0));
  const steel = rgbToHex(...hslToRgb(h, Math.max(0.08, sat*0.35), Math.min(0.74, l+0.06)));
  const mk = (acc, vibe, name, voice, num, glow) => {
    const sk = generateSkinFromPalette([acc], vibe, mode);
    sk.name = name; sk.mode = mode; sk.voice = voice; sk.numeralStyle = num; sk.accentBehaviour = glow; sk.programs = DEFAULT_PROGRAMS;
    return sk;
  };
  return [
    { ...mk(a0, "natural", "Signature", "credible-community", "proportional", "flat"), recommended:true },
    mk(a1, "energetic", "Charge", "competitive-measurable", "tabular", "glow"),
    mk(steel, "bold", "Steel", "technical-considered", "tabular", "flat"),
  ];
}

// useWindowWidth moved to src/ui/primitives.jsx (imported above).

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

// Unicode-safe base64 (btoa throws on chars >0xFF: accents, emojis, en-dashes)
function downloadJson(obj, filename){
  try {
    const blob = new Blob([JSON.stringify(obj,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  } catch(_) {}
}
function rampVolume(player, from, to, secs){
  if(!player) return null;
  const steps = Math.max(1, Math.round(secs*10));
  let i=0; player.setVolume(from).catch(()=>{});
  const iv = setInterval(()=>{ i++; const v = from + (to-from)*(i/steps); player.setVolume(Math.max(0,Math.min(1,v))).catch(()=>{}); if(i>=steps) clearInterval(iv); }, 100);
  return iv;
}
async function fetchExerciseGif(name){
  const key = store.getExerciseDbKey();
  if (!key) return null;
  let cache={}; try { cache=JSON.parse(localStorage.getItem("jungle_gif_cache")||"{}"); } catch(_){}
  const norm = (name||"").toLowerCase().replace(/\(.*?\)/g,"").replace(/[^a-z0-9 ]/g,"").trim();
  if (!norm) return null;
  if (Object.prototype.hasOwnProperty.call(cache, norm)) return cache[norm];
  try {
    const q = encodeURIComponent(norm.split(" ").slice(0,3).join(" "));
    const r = await fetch(`https://exercisedb.p.rapidapi.com/exercises/name/${q}?limit=1`, { headers:{ "X-RapidAPI-Key":key, "X-RapidAPI-Host":"exercisedb.p.rapidapi.com" } });
    if (!r.ok) return null;
    const d = await r.json();
    const url = Array.isArray(d) && d[0] ? (d[0].gifUrl||null) : null;
    cache[norm]=url||null; try { localStorage.setItem("jungle_gif_cache", JSON.stringify(cache)); } catch(_){}
    return url;
  } catch(_) { return null; }
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
  engine:   { label:"Engine",         color:"#06B6D4", bpmMin:130, bpmMax:160 },
  power:    { label:"Power",          color:"#F59E0B", bpmMin:120, bpmMax:150 },
  core:     { label:"Core",           color:"#10B981", bpmMin:90,  bpmMax:120 },
  cardio:   { label:"Cardio Blast",   color:"#F97316", bpmMin:120, bpmMax:150 },
  recovery: { label:"Active Recovery",color:"#06B6D4", bpmMin:80,  bpmMax:100 },
  stretch:  { label:"Stretch",        color:"#10B981", bpmMin:60,  bpmMax:90  },
  cooldown: { label:"Cool-Down",      color:"#3B82F6", bpmMin:80,  bpmMax:100 },
};

// Shared class schedule store (Calendar + Dashboard read the same data)
const CLASS_COLORS = {HIIT:"#F59E0B",Strength:"#8B5CF6",Hyrox:"#22D3A6",Circuit:"#F97316",Spin:"#3B82F6",Yoga:"#10B981",Boxing:"#EC4899",Mobility:"#5BD0C0"};
function getUserClasses(){ return store.getUserClasses(); }
function getDayClasses(dayAbbrev){
  // BASE_SCHEDULE (20 invented classes with invented coaches and fill rates) is
  // deleted — the schedule shows the gym's own classes or nothing (audit 2.2).
  const out = [];
  getUserClasses().forEach(uc=>{ const hit = uc.repeat==="daily" || uc.day===dayAbbrev; if(hit) out.push({time:uc.slot,name:uc.name,coach:uc.coach||"",type:uc.type,dur:uc.dur||"45m",fill:uc.fill||0,color:CLASS_COLORS[uc.type]||"#8AA294",custom:true}); });
  return out.sort((a,b)=>String(a.time).localeCompare(String(b.time)));
}
// Smart class picker: match an NLP prompt (or studio default) to a WORKOUT_LIBRARY class.
function smartPickClass(prompt){
  const keys = Object.keys(WORKOUT_LIBRARY);
  const pr = (prompt||"").toLowerCase();
  let hit = pr && keys.find(k => pr.includes(k.toLowerCase()) || pr.includes((WORKOUT_LIBRARY[k].label||"").toLowerCase()));
  if(!hit && pr){ hit = keys.find(k => (WORKOUT_LIBRARY[k].label||"").toLowerCase().split(/[^a-z]+/).some(w=>w.length>2 && pr.includes(w))); }
  const classType = hit || keys[0];
  const subType = Object.keys(WORKOUT_LIBRARY[classType]?.subTypes||{})[0] || null;
  return { classType, subType };
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

function mkStages() {
  return [
    { id:uid(), type:"warmup",   name:"Warm-Up",         dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""},{n:"Arm Swings",s:"2",r:"30 sec",rest:""}], tracks:[] },
    { id:uid(), type:"circuit",  name:"Circuit Blast",   dur:600,  exercises:[{n:"Burpee Complex",s:"3",r:"10",rest:"30s"},{n:"Box Jump",s:"3",r:"8",rest:"30s"}], tracks:[] },
    { id:uid(), type:"strength", name:"Strength Block",  dur:900,  exercises:[{n:"Back Squat",s:"4",r:"8",rest:"90s"},{n:"Overhead Press",s:"4",r:"10",rest:"90s"}], tracks:[] },
    { id:uid(), type:"recovery", name:"Active Recovery", dur:300,  exercises:[{n:"Easy Walk",s:"",r:"5 min",rest:""}], tracks:[] },
    { id:uid(), type:"cooldown", name:"Cool-Down",       dur:300,  exercises:[{n:"Pigeon Flow",s:"",r:"90 sec",rest:""},{n:"Hip 90/90 Flow",s:"",r:"60 sec each",rest:""}], tracks:[] },
  ];
}

// TEMPLATES moved to src/data/templates.js (imported above).

// WORKOUT_LIBRARY moved to src/data/library.js (imported above).

// ─── Editable library helpers ─────────────────────────────────────────────────
function getLibrary() {
  try {
    const saved = store.getLibraryCustom();
    if (saved) {
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
  store.saveLibraryCustom(data);
}
function resetLibrary() {
  store.resetLibraryCustom();
}

// STAGE_LIBRARY_MAP moved to src/data/library.js (imported above).

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

// CLASS_STAGE_TEMPLATES moved to src/data/library.js (imported above).

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

// GLOSSARY moved to src/data/glossary.js (imported above).

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CLASS_TYPES = ["HIIT","Strength","Mobility","Circuit","Cardio","Recovery","Open Gym"];

// UI primitives (Btn/Input/Select/Tag/SpBadge) moved to src/ui/primitives.jsx (imported above).

// JungleLogo moved to src/ui/primitives.jsx (imported above).

// BrandLogo + StatCard moved to src/ui/primitives.jsx (imported above).

// ─── LoginScreen ──────────────────────────────────────────────────────────────
function LoginScreen({onLogin, authError}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at 50% 20%, var(--navy) 0%, var(--bg) 65%)`,color:"var(--text)",padding:isMobile?"20px":"30px",textAlign:"center"}}>
      <JungleLogo size={isMobile?60:80}/>
      <h1 style={{marginTop:"20px",fontSize:isMobile?"36px":"56px",fontWeight:"800",letterSpacing:isMobile?"4px":"8px"}}>JUNGLE</h1>
      <p style={{marginTop:"12px",color:"var(--muted)",fontSize:isMobile?"14px":"16px",maxWidth:"360px",lineHeight:"1.7",width:"100%",boxSizing:"border-box"}}>Elite gym workout management<br/>with synchronized Spotify integration</p>
      {authError && <div style={{marginTop:"20px",padding:"12px 20px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid var(--accent)`,borderRadius:"8px",color:"var(--accent)",fontSize:"13px"}}>⚠️ {authError}</div>}
      {IS_CONFIGURED ? (
        <button onClick={onLogin} style={{marginTop:"32px",padding:isMobile?"14px 36px":"16px 52px",background:"var(--green)",color:"var(--on-green)",border:"none",borderRadius:"32px",fontSize:isMobile?"14px":"15px",fontWeight:"700",cursor:"pointer",width:isMobile?"92vw":"auto",maxWidth:"320px",minHeight:"44px"}}>
          🎵 Continue with Spotify
        </button>
      ) : (
        <div style={{marginTop:"28px",padding:isMobile?"16px":"20px",background:"var(--card)",borderRadius:"12px",border:`1px solid var(--border)`,width:isMobile?"92vw":"420px",maxWidth:"100%",textAlign:"left",boxSizing:"border-box"}}>
          <p style={{fontWeight:"700",marginBottom:"10px"}}>⚙️ Setup Required</p>
          <p style={{fontSize:"13px",color:"var(--muted)",marginBottom:"10px"}}>Open jungle.jsx and set your Spotify Client ID:</p>
          <code style={{fontSize:"12px",color:"var(--accent)",background:"var(--navy)",padding:"10px 12px",borderRadius:"6px",display:"block",wordBreak:"break-all"}}>const SPOTIFY_CLIENT_ID = "your_id_here";</code>
        </div>
      )}
      <p style={{marginTop:"24px",fontSize:"12px",color:"var(--muted)",padding:"0 8px"}}>Spotify Premium required · Redirect URI must match your Spotify Dashboard</p>
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
    accentColor: gymBranding.accentColor || "var(--accent)",
    secondColor: gymBranding.secondColor || "var(--green)",
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
    <button onClick={()=>setTab(id)} style={{flex:1, padding:"9px", background:tab===id?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",
      color:tab===id?"var(--accent)":"var(--muted)", border:`1px solid ${tab===id?"color-mix(in srgb, var(--accent) 31%, transparent)":"var(--border)"}`,
      borderRadius:"8px", cursor:"pointer", fontSize:"12px", fontWeight:"700"}}>
      {label}
    </button>
  );

  return (
    <div style={{position:"fixed",inset:"0",background:"rgba(0,0,0,0.65)",display:"flex",alignItems:isMobilePM?"flex-end":"center",justifyContent:"center",zIndex:1000,padding:isMobilePM?"0":"16px"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",borderRadius:isMobilePM?"14px 14px 0 0":"14px",width:"100%",maxWidth:"420px",maxHeight:isMobilePM?"96vh":"92vh",display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid var(--border)`}}>

        {/* Header */}
        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"14px"}}>
            {profile.images?.[0]?.url
              ? <img src={profile.images[0].url} style={{width:"52px",height:"52px",borderRadius:"50%",border:`2px solid var(--green)`}} alt="avatar"/>
              : <div style={{width:"52px",height:"52px",borderRadius:"50%",background:"var(--navy)",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={24} color={"var(--muted)"}/></div>
            }
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:"16px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.display_name||"Spotify User"}</p>
              <p style={{fontSize:"11px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.email}</p>
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
          <div style={{padding:"14px 18px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
            <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Your Stats</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {[
                {icon:"🏋️",label:"Total Sessions",value:String(totalSessions),color:"var(--accent)"},
                {icon:"⏱️",label:"Total Hours",   value:totalHours+"h",      color:"var(--green)"},
                {icon:"📊",label:"Avg Duration",  value:avgDur+" min",        color:"#8B5CF6"},
                {icon:"🔥",label:"Day Streak",    value:String(streak),       color:"#F97316"},
              ].map(s=>(
                <div key={s.label} style={{padding:"10px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                  <p style={{fontSize:"18px",fontWeight:"800",color:s.color,lineHeight:"1"}}>{s.value}</p>
                  <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{s.icon} {s.label}</p>
                </div>
              ))}
            </div>
            {topType && <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"10px"}}>🏆 Most trained: <span style={{color:SCFG[topType]?.color||"var(--green)",fontWeight:"700"}}>{SCFG[topType]?.label||topType}</span></p>}
          </div>
          {/* Recent sessions */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Recent Sessions</p>
            {recent.length === 0
              ? <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>No sessions yet. Start one to track your history.</p>
              : recent.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<recent.length-1?`1px solid var(--border)`:"none"}}>
                  <div style={{width:"36px",height:"36px",borderRadius:"8px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"16px"}}>🏋️</span></div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name||"Workout"}</p>
                    <p style={{fontSize:"11px",color:"var(--muted)"}}>{s.date} · {s.durMin} min · {s.stages} stage{s.stages!==1?"s":""}</p>
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
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Gym Logo</p>
              <div style={{display:"flex",gap:"12px",alignItems:"flex-start"}}>
                {/* Preview */}
                <div style={{width:"80px",height:"80px",borderRadius:"10px",background:"var(--navy)",border:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                  {draft.logo
                    ? <img src={draft.logo} style={{width:"100%",height:"100%",objectFit:"contain"}} alt="logo"/>
                    : <span style={{fontSize:"28px"}}>🏢</span>
                  }
                </div>
                <div style={{flex:1}}>
                  <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoUpload}/>
                  <button onClick={()=>fileRef.current?.click()}
                    style={{width:"100%",padding:"9px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",color:"var(--text)",fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}>
                    {extracting ? "⏳ Reading your logo…" : draft.logo ? "🔄 Change Logo" : "📁 Upload Logo"}
                  </button>
                  {draft.logo && (
                    <button onClick={()=>setDraft(d=>({...d,logo:null}))}
                      style={{width:"100%",padding:"7px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>
                      Remove
                    </button>
                  )}
                  <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"5px"}}>Logo appears in the header. Dominant colour is auto-extracted.</p>
                </div>
              </div>
            </div>

            {/* Gym name */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Gym Name</p>
              <Input value={draft.gymName} onChange={e=>setDraft(d=>({...d,gymName:e.target.value}))} placeholder="e.g. Iron House Fitness"/>
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Shown in the header alongside your logo.</p>
            </div>

            {/* Accent colour */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Accent Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" value={draft.accentColor} onChange={e=>setDraft(d=>({...d,accentColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.accentColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.accentColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Primary</span>
                </div>
              </div>
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Auto-extracted from logo — override by clicking the swatch.</p>
            </div>

            {/* Secondary colour */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Secondary Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" value={draft.secondColor} onChange={e=>setDraft(d=>({...d,secondColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.secondColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.secondColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Secondary</span>
                </div>
              </div>
            </div>

            {/* Font */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Font</p>
              <Select value={draft.fontFamily} onChange={e=>setDraft(d=>({...d,fontFamily:e.target.value}))}>
                {GYM_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                <option value="custom">✏️ Custom Google Font…</option>
              </Select>
              {draft.fontFamily !== "system" && draft.fontFamily !== "custom" && (
                <p style={{fontSize:"13px",marginTop:"8px",fontFamily:`'${draft.fontFamily}', sans-serif`,color:"var(--text)",padding:"8px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                  The quick brown fox — {draft.fontFamily}
                </p>
              )}
              {draft.fontFamily === "custom" && (
                <Input placeholder="e.g. Poppins, Nunito, Space Grotesk" value={draft.customFont}
                  onChange={e=>setDraft(d=>({...d,customFont:e.target.value}))} style={{marginTop:"6px"}}/>
              )}
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Loaded from Google Fonts — applied app-wide.</p>
            </div>


          </div>
        )}

        {/* Footer */}
        <div style={{padding:"12px 18px",borderTop:`1px solid var(--border)`,display:"flex",gap:"8px",flexShrink:0}}>
          {tab === "branding" ? <>
            <button onClick={saveBranding}
              style={{flex:2,padding:"10px",background:saved?"var(--green)":"var(--accent)",color:saved?"var(--on-green)":"var(--on-accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",transition:"background .3s,color .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              {saved ? <><Check size={13}/> Saved!</> : "💾 Save Branding"}
            </button>
            <button onClick={resetBranding}
              style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--muted)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>
              Reset
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--text)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
          </> : <>
            <button onClick={onLogout} style={{flex:1,padding:"10px",background:"color-mix(in srgb, var(--accent) 8%, transparent)",color:"var(--accent)",border:`1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <LogOut size={13}/> Sign Out
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--text)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
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

  const bc       = bpm ? bpmColor(bpm) : "var(--muted)";
  const mismatch = stageType && bpm ? bpmMismatch(bpm, stageType) : false;

  return (
    <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:added?"color-mix(in srgb, var(--green) 7%, transparent)":"var(--navy)",borderRadius:"6px",border:`1px solid ${added?"color-mix(in srgb, var(--green) 19%, transparent)":"transparent"}`,transition:"background 0.2s"}}>
      {track.albumArt
        ? <img src={track.albumArt} style={{width:"40px",height:"40px",borderRadius:"4px",flexShrink:0,objectFit:"cover"}} alt="album"/>
        : <div style={{width:"40px",height:"40px",borderRadius:"4px",background:"var(--border)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={14} color={"var(--muted)"}/></div>
      }
      <div style={{flex:1,minWidth:"0"}}>
        <p style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{track.t}</p>
        <p style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{track.a}</p>
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
                style={{width:"52px",padding:"1px 5px",background:"var(--card)",border:`1px solid var(--accent)`,borderRadius:"3px",color:"var(--text)",fontSize:"10px",fontWeight:"700",outline:"none"}}
              />
              <button onClick={saveBpm} style={{padding:"1px 6px",background:"var(--accent)",border:"none",borderRadius:"3px",cursor:"pointer",color:"var(--on-accent)",fontSize:"10px",fontWeight:"700"}}>✓</button>
              <button onClick={()=>setEditingBpm(false)} style={{padding:"1px 4px",background:"transparent",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:"10px"}}>✕</button>
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
              style={{fontSize:"10px",fontWeight:"600",padding:"1px 6px",borderRadius:"3px",background:"color-mix(in srgb, var(--border) 38%, transparent)",color:"var(--muted)",border:`1px dashed var(--border)`,cursor:"pointer",userSelect:"none"}}>
              ? BPM
            </span>
          )}
          <span style={{fontSize:"10px",color:"var(--muted)"}}>{fmt(track.dur)}</span>
        </div>
      </div>
      {added && <span style={{fontSize:"10px",color:"var(--green)",fontWeight:"700",flexShrink:0,padding:"2px 8px",background:"color-mix(in srgb, var(--green) 13%, transparent)",borderRadius:"4px"}}>✓ Added</span>}
      {onAdd    && !added && <button onClick={onAdd}    title="Add to stage" style={{background:"color-mix(in srgb, var(--green) 13%, transparent)",border:"none",cursor:"pointer",color:"var(--green)",flexShrink:0,padding:"6px 10px",borderRadius:"5px",display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",fontWeight:"700"}}><Plus size={14}/> Add</button>}
      {onRemove && <button onClick={onRemove} title="Remove from stage" style={{background:"color-mix(in srgb, var(--accent) 8%, transparent)",border:"none",cursor:"pointer",color:"var(--accent)",flexShrink:0,padding:"6px 8px",borderRadius:"5px",display:"flex",alignItems:"center"}}><Trash2 size={14}/></button>}
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
      style={{flexShrink:0,padding:"8px 14px",background:(disabled||loading)?"var(--border)":"var(--accent)",color:(disabled||loading)?"var(--muted)":"var(--on-accent)",border:"none",borderRadius:"6px",cursor:(disabled||loading)?"not-allowed":"pointer",fontWeight:"700",fontSize:"12px",display:"flex",alignItems:"center",gap:"5px",transition:"background .3s,color .2s"}}>
      {loading?<Loader size={13}/>:<Search size={13}/>} {loading?"…":"Go"}
    </button>
  );

  const ErrorBanner = () => !error ? null : (
    <div style={{padding:"10px 12px",background:error==="auth"?"color-mix(in srgb, var(--accent) 9%, transparent)":"var(--navy)",border:`1px solid ${error==="auth"?"color-mix(in srgb, var(--accent) 25%, transparent)":"var(--border)"}`,borderRadius:"7px",marginBottom:"10px",textAlign:"center"}}>
      {error==="auth"
        ? <><p style={{fontSize:"12px",color:"var(--accent)",fontWeight:"700",marginBottom:"2px"}}>Session expired</p><p style={{fontSize:"11px",color:"var(--muted)"}}>Refresh and reconnect.</p></>
        : <p style={{fontSize:"12px",color:"var(--muted)",fontWeight:"600"}}>Search failed — try again</p>
      }
    </div>
  );

  const ResultsList = ({empty}) => (
    <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
      {results.map(t => (
        <TrackItem key={t.id} track={t} onAdd={addedIds.includes(t.id)?null:()=>onAdd(t)} added={addedIds.includes(t.id)} stageType={stageType}/>
      ))}
      {!results.length && !loading && (
        <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>{empty||"No results yet"}</p>
      )}
    </div>
  );

  const tabStyle = (id) => ({
    flex:1, display:"flex", alignItems:"center", justifyContent:"center",
    padding:"7px 4px", fontSize:"11px", fontWeight:"700",
    background: tab===id ? "var(--accent)" : "var(--navy)",
    color: tab===id ? "white" : "var(--muted)",
    border: `1px solid ${tab===id?"var(--accent)":"var(--border)"}`,
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
            <p style={{fontSize:"10px",color:"var(--muted)",marginBottom:"8px"}}>
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
                  background:selGenre===g?"color-mix(in srgb, var(--accent) 19%, transparent)":"transparent",
                  color:selGenre===g?"var(--accent)":"var(--muted)",
                  border:`1px solid ${selGenre===g?"var(--accent)":"var(--border)"}`}}>
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
          {!selGenre && <p style={{fontSize:"11px",color:"var(--muted)",textAlign:"center",padding:"10px 0 4px"}}>Pick a genre above to search</p>}
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
                <div style={{marginBottom:"12px",padding:"12px 14px",background:"color-mix(in srgb, var(--accent) 7%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 19%, transparent)`,borderRadius:"9px",display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:"var(--text)",marginBottom:"2px"}}>⚡ Smart Distribute</p>
                    <p style={{fontSize:"10px",color:"var(--muted)",lineHeight:"1.4"}}>Import a playlist and auto-distribute songs across all stages by duration</p>
                  </div>
                  <button onClick={onSmartDistribute}
                    style={{flexShrink:0,padding:"7px 14px",background:"var(--accent)",color:"var(--on-accent)",border:"none",borderRadius:"7px",cursor:"pointer",fontSize:"11px",fontWeight:"700",whiteSpace:"nowrap"}}>
                    Go
                  </button>
                </div>
              )}
              <div style={{display:"flex",gap:"6px",marginBottom:"6px"}}>
                <Input type="text" placeholder="Search Spotify playlists…" value={plSearch}
                  onChange={e=>setPlSearch(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&searchSpotifyPlaylists()}/>
                <button onClick={searchSpotifyPlaylists} disabled={loadingPls||!plSearch.trim()}
                  style={{flexShrink:0,padding:"8px 12px",background:(!plSearch.trim()||loadingPls)?"var(--border)":"var(--accent)",color:(!plSearch.trim()||loadingPls)?"var(--muted)":"var(--on-accent)",border:"none",borderRadius:"6px",cursor:(!plSearch.trim()||loadingPls)?"not-allowed":"pointer",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px"}}>
                  {loadingPls?<Loader size={13}/>:<Search size={13}/>}
                </button>
              </div>
              {plSearchActive && (
                <button onClick={clearPlSearch}
                  style={{background:"none",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",marginBottom:"8px",padding:"0"}}>
                  <ArrowLeft size={11}/> My playlists
                </button>
              )}
              {loadingPls
                ? <div style={{textAlign:"center",padding:"24px"}}><Loader size={18} color={"var(--muted)"}/></div>
                : playlists.length
                  ? <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                      {(playlists || []).filter(Boolean).map(pl => {
                        const imgUrl = pl.images?.[0]?.url;
                        const count  = pl.tracks?.total ?? pl.items?.total ?? 0;
                        const myUid  = localStorage.getItem("sp_uid");
                        const notMine = plSearchActive && myUid && pl.owner?.id && pl.owner.id !== myUid;
                        return (
                          <div key={pl.id} onClick={()=>openPlaylist(pl)}
                            style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:"var(--navy)",borderRadius:"7px",cursor:"pointer",border:`1px solid ${notMine ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "transparent"}`,transition:"border-color 0.15s",opacity:notMine?0.75:1}}
                            onMouseEnter={e=>e.currentTarget.style.borderColor="color-mix(in srgb, var(--accent) 38%, transparent)"}
                            onMouseLeave={e=>e.currentTarget.style.borderColor=notMine?"color-mix(in srgb, var(--accent) 25%, transparent)":"transparent"}>
                            {imgUrl
                              ? <img src={imgUrl} style={{width:"36px",height:"36px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt="pl"/>
                              : <div style={{width:"36px",height:"36px",borderRadius:"5px",background:"var(--border)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={13} color={"var(--muted)"}/></div>
                            }
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
                                <p style={{fontSize:"12px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pl.name}</p>
                                {notMine && <span title="Owned by another user — may not be accessible" style={{fontSize:"9px",fontWeight:"700",color:"var(--accent)",background:"color-mix(in srgb, var(--accent) 13%, transparent)",borderRadius:"3px",padding:"1px 4px",flexShrink:0,whiteSpace:"nowrap"}}>NOT YOURS</span>}
                              </div>
                              <p style={{fontSize:"10px",color:"var(--muted)"}}>{count} tracks{pl.owner?.display_name?` · ${pl.owner.display_name}`:""}</p>
                            </div>
                            <ChevronRight size={13} color={"var(--muted)"}/>
                          </div>
                        );
                      })}
                    </div>
                  : <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>
                      {plSearchActive ? `No playlists found for "${plSearch}"` : "Search above or connect Spotify to see your playlists"}
                    </p>
              }
            </>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
                <button onClick={()=>{setSelPl(null);setPlTracks([]);setPlDenied(false);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",fontWeight:"700"}}>
                  <ArrowLeft size={14}/> Back
                </button>
                <p style={{fontSize:"12px",fontWeight:"700",color:"var(--text)",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selPl.name}</p>
              </div>
              {loadingTr
                ? <div style={{textAlign:"center",padding:"24px"}}><Loader size={18} color={"var(--muted)"}/></div>
                : plDenied
                  ? <div style={{textAlign:"center",padding:"20px 16px"}}>
                      <p style={{fontSize:"22px",marginBottom:"8px"}}>🔒</p>
                      <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"6px"}}>Playlist not accessible</p>
                      <p style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.5",marginBottom:"14px"}}>
                        {typeof plDenied === "string" && plDenied !== "Forbidden"
                          ? plDenied
                          : "Spotify only allows track access for playlists you own. To use this playlist, import its songs into one of your own Spotify playlists, then access it from 'My playlists' here."}
                      </p>
                      <button onClick={()=>{setSelPl(null);setPlTracks([]);setPlDenied(false);}}
                        style={{padding:"7px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>
                        ← Back
                      </button>
                    </div>
                  : plTracks.length
                    ? <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                        {plTracks.map(t => (
                          <TrackItem key={t.id} track={t} onAdd={addedIds.includes(t.id)?null:()=>onAdd(t)} added={addedIds.includes(t.id)} stageType={stageType}/>
                        ))}
                      </div>
                    : <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>No playable tracks</p>
              }
            </>
          )}
        </div>
      )}

      {/* ── BPM ── */}
      {tab==="bpm" && (
        <div>
          <div style={{marginBottom:"12px"}}>
            <p style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px"}}>
              Pick a genre to find tracks — BPM shown where available. The BPM range sets a target to help you choose.
            </p>
            <div style={{display:"flex",gap:"10px",alignItems:"flex-end",marginBottom:"12px"}}>
              <div style={{flex:1}}>
                <p style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>Target Min BPM</p>
                <Input type="number" value={bpmMin} min="60" max="220"
                  onChange={e=>setBpmMin(parseInt(e.target.value)||80)} style={{textAlign:"center",fontWeight:"700"}}/>
              </div>
              <span style={{color:"var(--muted)",paddingBottom:"9px"}}>–</span>
              <div style={{flex:1}}>
                <p style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>Target Max BPM</p>
                <Input type="number" value={bpmMax} min="60" max="220"
                  onChange={e=>setBpmMax(parseInt(e.target.value)||160)} style={{textAlign:"center",fontWeight:"700"}}/>
              </div>
            </div>
            <p style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px"}}>Genre</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"12px"}}>
              {["workout","electronic","hip-hop","dance","pop","rock","edm","r-n-b","afrobeat","latin"].map(g=>(
                <button key={g} onClick={()=>setBpmSeedGenre(g)}
                  style={{padding:"4px 8px",fontSize:"10px",fontWeight:"700",borderRadius:"12px",cursor:"pointer",
                    background:bpmSeedGenre===g?"color-mix(in srgb, var(--accent) 19%, transparent)":"transparent",
                    color:bpmSeedGenre===g?"var(--accent)":"var(--muted)",
                    border:`1px solid ${bpmSeedGenre===g?"var(--accent)":"var(--border)"}`}}>
                  {g}
                </button>
              ))}
            </div>
            <button onClick={runBpmSearch} disabled={loading||!bpmSeedGenre}
              style={{width:"100%",padding:"10px",background:(loading||!bpmSeedGenre)?"var(--border)":"var(--accent)",color:(loading||!bpmSeedGenre)?"var(--muted)":"var(--on-accent)",border:"none",borderRadius:"7px",cursor:(loading||!bpmSeedGenre)?"not-allowed":"pointer",fontWeight:"700",fontSize:"13px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
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
function DashboardScreen({onNavigate, onNewSession, onProfile, profile, sessionHistory=[], stages=[], sessionName="", nowPlaying=null, djProgress=null}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isNarrow = vw < 1000;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
  const first = profile?.display_name?.split(" ")?.[0] || "Coach";
  const dayN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const monN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateStr = `${dayN[now.getDay()]} ${now.getDate()} ${monN[now.getMonth()]}`;

  const parseD = s => new Date(s.ts || s.date || 0);
  const sow = new Date(now); sow.setHours(0,0,0,0); sow.setDate(now.getDate() - ((now.getDay()+6)%7));
  const sessionsWeek = sessionHistory.filter(s=>parseD(s)>=sow).length;
  const monthMins = sessionHistory.filter(s=>{const d=parseD(s);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((a,s)=>a+(s.durMin||0),0);
  let streak=0; { const days=new Set(sessionHistory.map(s=>parseD(s).toDateString())); let d=new Date(now); for(let i=0;i<400;i++){ if(days.has(d.toDateString())) streak++; else if(i>0) break; d.setDate(d.getDate()-1);} }
  const stats = [
    {label:"Sessions this week", value:String(sessionsWeek), Icon:Layers},
    {label:"Hours this month", value:(monthMins/60).toFixed(1), Icon:Clock},
    {label:"Day streak", value:String(streak), Icon:Zap},
    {label:"Total sessions", value:String(sessionHistory.length), Icon:BarChart2},
  ];

  const totalStages = stages.length;
  const totalMin = Math.round(stages.reduce((a,s)=>a+(s.dur||0),0)/60);
  const hasDraft = totalStages>0;

  const todayAbbrev = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];
  const todayClasses = getDayClasses(todayAbbrev).slice(0,5);
  const recent = sessionHistory.slice(0,3);
  const npName = nowPlaying?.name; const npArtist = (nowPlaying?.artists||[]).map(a=>a.name).join(", ");

  const nav = [
    {group:"HOME",   items:[{k:"dashboard",l:"Dashboard",Icon:Home}]},
    {group:"BUILD",  items:[{k:"builder",l:"Class Builder",Icon:Layers},{k:"templates",l:"Templates",Icon:LayoutGrid},{k:"library",l:"Exercise Library",Icon:BookOpen},{k:"glossary",l:"Glossary",Icon:List}]},
    {group:"RUN",    items:[{k:"live",l:"Class Runner",Icon:PlayCircle}]},
    {group:"MANAGE", items:[{k:"calendar",l:"Schedule",Icon:Calendar},{k:"member",l:"Members",Icon:Users},{k:"analytics",l:"Analytics",Icon:BarChart2}]},
    {group:"GROW",   items:[{k:"brand-studio",l:"Brand Studio",Icon:Palette},{k:"integrations",l:"Integrations",Icon:Plug}]},
  ].map(g => ({ ...g, items: g.items.filter(it => isViewEnabled(it.k)) })).filter(g => g.items.length);

  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px"};
  const navBtn = (on) => ({width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"9px 10px",marginBottom:"2px",borderRadius:"8px",border:"none",cursor:"pointer",background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--text)",fontSize:"13px",fontWeight:on?"700":"500",textAlign:"left"});

  return (
    <div style={{flex:1,display:"flex",minHeight:0,background:"var(--bg)"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:isMobile?"14px 16px":"18px 28px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
          <div><div style={{fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)"}}>Dashboard</div><div style={{fontSize:"12px",color:"var(--muted)"}}>{dateStr}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"6px",padding:"7px 12px",borderRadius:"999px",background:"var(--navy)",border:"1px solid var(--border)"}}><Search size={13} color="var(--muted)"/><span style={{fontSize:"12px",color:"var(--muted)"}}>Search</span></div>
          </div>
        </div>

        <div style={{padding:isMobile?"16px":"24px 28px",display:"flex",flexDirection:"column",gap:isMobile?"14px":"20px"}}>
          <div style={{...card,padding:isMobile?"18px":"26px",display:"flex",flexDirection:isMobile?"column":"row",alignItems:isMobile?"stretch":"center",gap:"18px",background:"linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), var(--card))"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:"var(--accent)",letterSpacing:"1px",marginBottom:"6px"}}>{greeting.toUpperCase()}, {first.toUpperCase()}</div>
              <div style={{fontSize:isMobile?"22px":"28px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)",marginBottom:"4px"}}>{hasDraft ? (sessionName||"Today's class") : "Start today's first class"}</div>
              <div style={{fontSize:"13px",color:"var(--muted)",marginBottom:"14px"}}>{hasDraft ? `${totalStages} stage${totalStages!==1?"s":""} · ${totalMin} min planned` : "Build a class from a template or from scratch"}</div>
              {hasDraft && <div style={{height:"8px",borderRadius:"4px",background:"var(--navy)",overflow:"hidden",marginBottom:"16px",maxWidth:"420px"}}><div style={{height:"100%",width:`${Math.min(100,totalStages*20)}%`,background:"var(--accent)"}}/></div>}
              <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                <button onClick={()=>onNavigate("builder")} style={{padding:"11px 20px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"14px",boxShadow:"var(--glow)"}}>{hasDraft?"Resume building":"New class"}</button>
                <button onClick={()=>onNavigate("templates")} style={{padding:"11px 20px",background:"var(--navy)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"14px"}}>{hasDraft?"New class":"Browse templates"}</button>
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?"10px":"14px"}}>
            {stats.map((s,i)=>(
              <div key={i} style={{...card,padding:isMobile?"14px":"18px"}}>
                <s.Icon size={18} color="var(--accent)"/>
                <div style={{fontSize:isMobile?"22px":"28px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)",fontVariantNumeric:"var(--num)",margin:"8px 0 2px"}}>{s.value}</div>
                <div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:isNarrow?"1fr":"1.4fr 1fr",gap:isMobile?"14px":"20px"}}>
            <div style={{...card,padding:"18px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}><div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)"}}>Today's classes</div><button onClick={()=>onNavigate("calendar")} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Calendar →</button></div>
              {todayClasses.length===0 && <div style={{fontSize:"12px",color:"var(--muted)",padding:"8px 0"}}>No classes scheduled today.</div>}
              {todayClasses.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<todayClasses.length-1?"1px solid var(--border)":"none"}}>
                  <div style={{width:"3px",height:"34px",borderRadius:"2px",background:c.color,flexShrink:0}}/>
                  <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",width:"48px",flexShrink:0,fontVariantNumeric:"var(--num)"}}>{c.time}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{c.name}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>{c.coach}{c.dur?" · "+c.dur:""}</div></div>
                  <div style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",flexShrink:0,fontVariantNumeric:"var(--num)"}}>{c.fill||0}%</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:isMobile?"14px":"20px"}}>
              {FLAGS.music && (
                <div style={{...card,padding:"18px"}}>
                  <div style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",letterSpacing:"1px",marginBottom:"12px"}}>AUTO-DJ</div>
                  {npName ? (
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <div style={{width:"46px",height:"46px",borderRadius:"8px",background:"repeating-linear-gradient(45deg,var(--navy),var(--navy) 6px,var(--card) 6px,var(--card) 12px)",flexShrink:0}}/>
                      <div style={{minWidth:0}}><div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{npName}</div><div style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{npArtist}</div></div>
                    </div>
                  ) : (
                    <div style={{fontSize:"12px",color:"var(--muted)"}}>Auto-DJ idle — <button onClick={()=>onNavigate("music")} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontWeight:"700",fontSize:"12px",padding:0}}>open Music</button></div>
                  )}
                </div>
              )}
              <div style={{...card,padding:"18px",flex:1}}>
                <div style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",letterSpacing:"1px",marginBottom:"12px"}}>RECENT SESSIONS</div>
                {recent.length===0 && <div style={{fontSize:"12px",color:"var(--muted)"}}>No sessions yet — your finished classes show here.</div>}
                {recent.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 0",borderBottom:i<recent.length-1?"1px solid var(--border)":"none"}}>
                    <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"var(--accent)",flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name||"Session"}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>{s.date} · {s.durMin||0} min</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AnalyticsScreen ──────────────────────────────────────────────────────────
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
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Studio analytics</h2>
            <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>Barry's · Shoreditch</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <div style={{display:"flex",border:`1px solid var(--border)`,borderRadius:"9px",overflow:"hidden",fontSize:"12px"}}>
            {[["4w","4 weeks"],["12w","12 weeks"],["year","Year"]].map(([k,lbl])=>(
              <div key={k} onClick={()=>setTimeFilter(k)}
                style={{padding:"8px 14px",background:timeFilter===k?"var(--navy)":"transparent",color:timeFilter===k?"var(--text)":"var(--muted)",fontWeight:timeFilter===k?"600":"400",cursor:"pointer"}}>
                {lbl}
              </div>
            ))}
          </div>
          <button style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontWeight:"600",fontSize:"13px",padding:"8px 15px",borderRadius:"9px",cursor:"pointer",display:"flex",alignItems:"center",gap:"7px"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${isTablet?2:4},1fr)`,gap:"12px",marginBottom:"18px"}}>
        {kpis.map((k,i)=>(
          <div key={i} style={{background:"var(--card)",border:`1px solid ${k.warn?"#F59E0B40":"var(--border)"}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",letterSpacing:"1px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase"}}>{k.label}</div>
            <div style={{fontFamily:"var(--display)",fontSize:"28px",fontWeight:"700",marginTop:"6px",color:k.warn?"#F59E0B":"var(--text)"}}>{k.value}</div>
            <div style={{fontSize:"12px",marginTop:"3px",color:k.warn?"#F59E0B":k.up?"var(--accent)":"#EF4444"}}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.4fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Attendance chart */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Attendance & fill rate</div>
            <div style={{fontSize:"11px",color:"var(--muted)",display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{width:"8px",height:"8px",borderRadius:"2px",background:"var(--accent)",display:"inline-block"}}/>Attendance
              <span style={{marginLeft:"8px",width:"8px",height:"8px",borderRadius:"2px",background:"#E0B85B",display:"inline-block"}}/>Fill %
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:isMobile?"3px":"6px",height:"100px",marginBottom:"8px"}}>
            {attendanceData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:`linear-gradient(to top, color-mix(in srgb, var(--accent) 80%, transparent), color-mix(in srgb, var(--green) 40%, transparent))`,
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.val/maxAttn)*90}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"9px",color:"var(--muted)"}}>{d.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Class type distribution */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"16px"}}>Most-booked class types</div>
          <div style={{display:"flex",flexDirection:"column",gap:"11px"}}>
            {classTypes.map((item,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                  <span style={{fontSize:"12px",color:"var(--text)",fontWeight:"600"}}>{item.label}</span>
                  <span style={{fontSize:"12px",color:item.color,fontWeight:"700"}}>{item.pct}%</span>
                </div>
                <div style={{height:"6px",background:"var(--navy)",borderRadius:"3px",overflow:"hidden"}}>
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
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div>
              <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>RPE distribution</div>
              <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>avg <span style={{color:"var(--accent)",fontWeight:"700"}}>7.4</span> · reported exertion · last 12 wks</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:"10px",height:"90px",marginBottom:"8px"}}>
            {rpeData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:d.v>=8?"color-mix(in srgb, var(--accent) 80%, transparent)":d.v<=5?"#EF4444aa":"#E0B85Baa",
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.count/maxRpe)*80}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"10px",color:"var(--muted)"}}>{d.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trainer performance */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Trainer performance</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {trainers.map((t,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",background:"var(--navy)",borderRadius:"10px",border:`1px solid var(--border)`}}>
                <div style={{width:"34px",height:"34px",borderRadius:"50%",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",fontSize:"12px",fontWeight:"700",flexShrink:0}}>
                  {t.name.split(" ")[0][0]}{t.name.split(" ")[1]?.[0]||""}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:"var(--muted)"}}>{t.fill} fill · NPS {t.nps}</div>
                </div>
                <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--accent)"}}>{t.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Music impact + BPM by class */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.2fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Music that fills rooms */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Music that fills rooms</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {musicImpact.map((m,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<musicImpact.length-1?`1px solid var(--border)`:"none"}}>
                <div style={{width:"24px",height:"24px",borderRadius:"50%",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",fontSize:"11px",fontWeight:"800",flexShrink:0}}>{m.rank}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.track}</div>
                </div>
                <div style={{fontSize:"12px",color:"var(--accent)",fontWeight:"700",whiteSpace:"nowrap"}}>{m.stat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best BPM by class */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Best BPM by class</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {bpmByClass.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:b.color}}/>
                  <span style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{b.label}</span>
                </div>
                <span style={{fontFamily:"var(--display)",fontSize:"16px",fontWeight:"700",color:b.color}}>{b.bpm} <span style={{fontSize:"11px",color:"var(--muted)",fontWeight:"400"}}>BPM</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Churn risk members */}
      <div style={{background:"var(--card)",border:`1px solid #F59E0B40`,borderRadius:"14px",padding:"18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <div>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Churn risk</div>
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
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px"}}>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"#F59E0B20",border:"1px solid #F59E0B40",display:"flex",alignItems:"center",justifyContent:"center",color:"#F59E0B",fontSize:"11px",fontWeight:"700",flexShrink:0}}>
                {m.name.split(" ").map(n=>n[0]).join("")}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{m.name}</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>Last seen {m.lastSeen} · {m.missed} missed · {m.type}</div>
              </div>
              <button style={{padding:"5px 12px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--text)",fontSize:"11px",fontWeight:"600",whiteSpace:"nowrap"}}>Contact</button>
            </div>
          ))}
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
  // F5: user-created recurring classes
  const [userClasses, setUserClasses] = React.useState(() => store.getUserClasses());
  // Local-first: pull the gym's classes from Postgres once on mount (server
  // wins / seeds from local). store.connect() already ran at the App root.
  React.useEffect(() => {
    let alive = true;
    store.hydrateUserClasses().then(rows => { if (alive && rows) setUserClasses(rows); });
    return () => { alive = false; };
  }, []);
  // Persist on change (local write + background push). Skip the initial mount so
  // we never push stale/empty local over server data before hydrate reconciles.
  const _ucInit = React.useRef(false);
  React.useEffect(() => {
    if (!_ucInit.current) { _ucInit.current = true; return; }
    store.saveUserClasses(userClasses);
  }, [userClasses]);
  const [showAddClass, setShowAddClass] = React.useState(false);
  const [addForm, setAddForm] = React.useState({name:"",type:"HIIT",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];
  const SLOTS = ["06:00","09:00","12:00","18:00","19:30"];
  const SLOT_LABELS = ["Morning","Mid-Morning","Lunch","Evening","Late"];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay() + 1);
  const weekKey = `${startOfWeek.getFullYear()}-${startOfWeek.getMonth()}-${startOfWeek.getDate()}`;

  const dayDates = DAYS.map((d,i)=>{
    const dt = new Date(startOfWeek);
    dt.setDate(startOfWeek.getDate() + i);
    return dt.getDate();
  });

  const CAT_COLOR = {HIIT:"#F59E0B",Strength:"#8B5CF6",Hyrox:"#22D3A6",Circuit:"#F97316",Spin:"#3B82F6",Yoga:"#10B981",Boxing:"#EC4899",Mobility:"#5BD0C0"};

  // Only the gym's own classes appear — the mock base schedule is gone (audit 2.2).
  const schedule = {};

  // F5: merge user classes (with recurrence) onto the base schedule for the viewed week
  const effSchedule = { ...schedule };
  userClasses.forEach(uc => {
    const entry = { name:uc.name, coach:uc.coach||"", fill:uc.fill||0, type:uc.type, dur:uc.dur||"45m", custom:true, repeat:uc.repeat };
    if (uc.repeat === "daily") { DAYS.forEach(d => { effSchedule[`${d}-${uc.slot}`] = entry; }); }
    else if (uc.repeat === "weekly") { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
    else if (uc.weekKey === weekKey) { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
  });
  const addClass = () => {
    if (!addForm.name.trim()) return;
    const uc = { id:`uc${Date.now()}`, ...addForm };
    if (addForm.repeat === "once") uc.weekKey = weekKey;
    setUserClasses(list => [...list, uc]);
    setShowAddClass(false);
    setAddForm({name:"",type:"HIIT",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});
  };
  const suggested = FLAGS.mockAnalytics ? [
    {day:"Tue",slot:"18:00",name:"Strength Lab",reason:"high demand · +34% this slot"},
    {day:"Thu",slot:"09:00",name:"Mobility",    reason:"try 12:00 — lunchtime demand"},
  ] : [];

  const trainers = FLAGS.mockAnalytics ? [
    {name:"Mara K.",  classes:14, cap:16, color:"#F59E0B"},
    {name:"Dev R.",   classes:11, cap:14, color:"#22D3A6"},
    {name:"Priya S.", classes:8,  cap:12, color:"#8B5CF6"},
    {name:"Jo M.",    classes:5,  cap:10, color:"#3B82F6"},
  ] : [];

  const aiTips = FLAGS.mockAnalytics ? [
    {id:0, text:"Tue 18:00 demand is up 34% — add a second Strength Lab. Likely 90%+ fill.", action:"Add it"},
    {id:1, text:"Thu 09:00 Mobility under-fills. Try moving to 12:00 — matches lunchtime demand.", action:"Move it"},
    {id:2, text:"Mara is near weekly cap (14/16). Shift Fri Burn to Jo to balance load.", action:"Reassign"},
  ] : [];

  const fillColor = f => f >= 90 ? "var(--accent)" : f >= 70 ? "#E0B85B" : "#8AA294";

  const visibleDays = isMobile ? DAYS.slice(0,4) : DAYS;

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"12px":"24px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"18px",flexWrap:"wrap",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Planning & schedule</h2>
            {/* Was "Shoreditch · 3 studios" — a hardcoded London district on a
                Singapore product (audit 1.3). The only honest facts here are the
                gym's own name and how many classes are actually on the week. */}
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"1px"}}>
              {[store.getGymBranding()?.gymName, `${Object.keys(schedule).length} classes`].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          {/* Week nav */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",border:`1px solid var(--border)`,borderRadius:"9px",overflow:"hidden"}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",padding:"0 4px"}}>
              {weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":`Week ${weekOffset>0?"+":""}${weekOffset}`}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>›</button>
          </div>
          {/* "Demand heat", "Publish week" and "Auto-fill week" were dead buttons —
              rendered, clickable, backed by nothing (audit 1.3). They return when
              there is real demand data and a class_instances table to publish to. */}
          <button onClick={()=>setShowAddClass(true)} style={{padding:"8px 14px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",color:"var(--on-accent)",fontSize:"12px",fontWeight:"700"}}>
            + Add class
          </button>
        </div>
      </div>

      {/* F5: Add class modal */}
      {showAddClass && (
        <div onClick={()=>setShowAddClass(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"22px",width:"min(420px,100%)",boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)"}}>Add class</div>
              <button onClick={()=>setShowAddClass(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><X size={18}/></button>
            </div>
            <input autoFocus value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="Class name" style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",marginBottom:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"14px"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
              <select value={addForm.type} onChange={e=>setAddForm(f=>({...f,type:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{Object.keys(CAT_COLOR).map(t=><option key={t} value={t}>{t}</option>)}</select>
              <input value={addForm.coach} onChange={e=>setAddForm(f=>({...f,coach:e.target.value}))} placeholder="Coach" style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
              <select value={addForm.day} onChange={e=>setAddForm(f=>({...f,day:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select value={addForm.slot} onChange={e=>setAddForm(f=>({...f,slot:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{SLOTS.map(sl=><option key={sl} value={sl}>{sl}</option>)}</select>
            </div>
            <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Repeat</div>
            <div style={{display:"flex",gap:"6px",marginBottom:"18px"}}>
              {[["once","This week"],["weekly","Weekly"],["daily","Every day"]].map(([val,lbl])=>(
                <button key={val} onClick={()=>setAddForm(f=>({...f,repeat:val}))} style={{flex:1,padding:"9px 0",background:addForm.repeat===val?"var(--accent)":"transparent",color:addForm.repeat===val?"var(--on-accent)":"var(--muted)",border:`1px solid ${addForm.repeat===val?"var(--accent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>{lbl}</button>
              ))}
            </div>
            <button onClick={addClass} disabled={!addForm.name.trim()} style={{width:"100%",padding:"12px",background:addForm.name.trim()?"var(--accent)":"var(--border)",color:addForm.name.trim()?"var(--on-accent)":"var(--muted)",border:"none",borderRadius:"9px",cursor:addForm.name.trim()?"pointer":"not-allowed",fontSize:"14px",fontWeight:"700"}}>Add to schedule</button>
          </div>
        </div>
      )}

      {/* Schedule grid */}
      <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",overflow:"hidden",marginBottom:"16px"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid var(--border)`}}>
          <div style={{padding:"10px 12px",background:"var(--navy)"}}/>
          {visibleDays.map((d,i)=>(
            <div key={d} style={{padding:"10px 8px",background:"var(--navy)",borderLeft:`1px solid var(--border)`,textAlign:"center"}}>
              <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</div>
              <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--text)"}}>{dayDates[i]}</div>
            </div>
          ))}
        </div>

        {/* Time slot rows */}
        {SLOTS.map(slot=>(
          <div key={slot} style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid var(--border)`,minHeight:"80px"}}>
            <div style={{padding:"10px 12px",background:"color-mix(in srgb, var(--navy) 40%, transparent)",display:"flex",flexDirection:"column",justifyContent:"center",borderRight:`1px solid var(--border)`}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>{slot}</div>
            </div>
            {visibleDays.map(day=>{
              const key = `${day}-${slot}`;
              const cls = effSchedule[key];
              const sug = suggested.find(s=>s.day===day && s.slot===slot);
              return (
                <div key={day} style={{padding:"6px",borderLeft:`1px solid var(--border)`,position:"relative"}}>
                  {cls && (
                    <div style={{
                      padding:"7px 8px",
                      background:`${CAT_COLOR[cls.type]||"var(--accent)"}18`,
                      border:`1px solid ${CAT_COLOR[cls.type]||"var(--accent)"}40`,
                      borderRadius:"8px",
                      cursor:"pointer",
                      height:"calc(100% - 2px)",
                      boxSizing:"border-box",
                    }}>
                      <div style={{fontSize:isMobile?"9px":"11px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls.name}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{cls.coach} · {cls.dur}</div>
                      <div style={{marginTop:"4px",display:"flex",alignItems:"center",gap:"4px"}}>
                        <div style={{flex:1,height:"3px",background:"var(--navy)",borderRadius:"2px"}}>
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
                      border:`1px dashed color-mix(in srgb, var(--accent) 38%, transparent)`,
                      borderRadius:"8px",
                      cursor:"pointer",
                    }}>
                      <div style={{fontSize:"9px",fontWeight:"700",color:"var(--accent)",letterSpacing:"0.5px",textTransform:"uppercase"}}>SUGGESTED</div>
                      <div style={{fontSize:isMobile?"9px":"10px",fontWeight:"600",color:"var(--text)",marginTop:"1px"}}>{sug.name}</div>
                    </div>
                  )}
                  {!cls && !sug && (
                    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="0"}>
                      <span style={{fontSize:"18px",color:"var(--muted)"}}>+</span>
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
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
            <div style={{width:"28px",height:"28px",borderRadius:"8px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={"var(--accent)"} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Jungle Intelligence</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {aiTips.filter(t=>!dismissedTips.includes(t.id)).map((tip,i)=>(
              <div key={tip.id} style={{padding:"12px 14px",background:"var(--navy)",border:`1px solid color-mix(in srgb, var(--accent) 19%, transparent)`,borderRadius:"10px",position:"relative"}}>
                <div style={{fontSize:"12px",color:"var(--text)",lineHeight:"1.5",paddingRight:"20px"}}>{tip.text}</div>
                <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
                  <button style={{padding:"5px 12px",background:"var(--accent)",border:"none",borderRadius:"6px",cursor:"pointer",color:"var(--on-accent)",fontSize:"11px",fontWeight:"700"}}>{tip.action}</button>
                  <button onClick={()=>setDismissedTips(d=>[...d,tip.id])} style={{padding:"5px 12px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Dismiss</button>
                </div>
              </div>
            ))}
            {aiTips.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--muted)",fontSize:"13px",lineHeight:"1.5"}}>Scheduling suggestions appear here once Jungle has live attendance &amp; demand data.</div>
            ) : dismissedTips.length===aiTips.length && (
              <div style={{textAlign:"center",padding:"24px",color:"var(--muted)",fontSize:"13px"}}>All suggestions reviewed ✓</div>
            )}
          </div>
        </div>

        {/* Trainer load */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Trainer load · this week</div>
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {trainers.map((t,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
                  <span style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{t.name}</span>
                  <span style={{fontSize:"12px",color:t.classes/t.cap>0.85?"#F59E0B":"var(--muted)",fontWeight:"600"}}>{t.classes} classes{t.classes/t.cap>0.85?" ⚠":""}</span>
                </div>
                <div style={{height:"7px",background:"var(--navy)",borderRadius:"4px",overflow:"hidden"}}>
                  <div style={{width:`${(t.classes/t.cap)*100}%`,height:"100%",background:t.classes/t.cap>0.85?"#F59E0B":t.color,borderRadius:"4px",transition:"width 0.4s"}}/>
                </div>
                <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{t.classes}/{t.cap} capacity</div>
              </div>
            ))}
            {trainers.length===0 && (
              <div style={{textAlign:"center",padding:"20px 4px",color:"var(--muted)",fontSize:"13px",lineHeight:"1.5"}}>Trainer load balances here once classes are scheduled with assigned coaches.</div>
            )}
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

  // Settings (persisted)
  const [energy,     setEnergy]     = React.useState(()=>store.getDjEnergy());
  const [bpmMin,     setBpmMin]     = React.useState(()=>store.getDjBpmMin());
  const [bpmMax,     setBpmMax]     = React.useState(()=>store.getDjBpmMax());
  const [transition, setTransition] = React.useState(()=>store.getDjTransition());
  const [followStructure, setFollowStructure] = React.useState(()=>store.getDjFollowStructure());
  const [takeRequests,    setTakeRequests]    = React.useState(()=>store.getDjTakeRequests());
  const [cleanEdits,      setCleanEdits]      = React.useState(()=>store.getDjCleanEdits());

  // Persist settings
  React.useEffect(()=>{ store.saveDjEnergy(energy); },[energy]);
  React.useEffect(()=>{ store.saveDjBpmRange(bpmMin, bpmMax); },[bpmMin,bpmMax]);
  React.useEffect(()=>{ store.saveDjTransition(transition); },[transition]);
  React.useEffect(()=>{ store.saveDjFollowStructure(followStructure); },[followStructure]);
  React.useEffect(()=>{ store.saveDjTakeRequests(takeRequests); },[takeRequests]);
  React.useEffect(()=>{ store.saveDjCleanEdits(cleanEdits); },[cleanEdits]);

  // Real playlists from Spotify
  const [playlists, setPlaylists] = React.useState([]);
  const [loadingPls, setLoadingPls] = React.useState(false);
  React.useEffect(()=>{
    setLoadingPls(true);
    apiGetPlaylists().then(pls=>{ setPlaylists((pls||[]).filter(Boolean)); setLoadingPls(false); }).catch(()=>setLoadingPls(false));
  },[]);

  // Member requests (demo — would come from a backend in production)
  const [requests, setRequests] = React.useState(FLAGS.mockMembers ? [
    {id:1, track:"Titanium — David Guetta", member:"Sam",  votes:24, bpm:126, note:"fits Block B"},
    {id:2, track:"Levels — Avicii",         member:"Jess", votes:11, bpm:128, note:"cool-down maybe"},
    {id:3, track:"Somebody That I Used to Know", member:"Alex", votes:7, bpm:122, note:""},
  ] : []);

  // Build real queue from stages
  const currentStageIdx = liveState.idx || 0;
  const queueTracks = stages.flatMap((s,si)=>
    (s.tracks||[]).map(t=>({...t, stageName:s.name, stageColor:(SCFG[s.type]||{}).color||"var(--accent)", isCurrent:si===currentStageIdx}))
  );

  const np = nowPlaying;
  const currentBpm = np?.bpm || (stages[currentStageIdx]?.tracks?.[0]?.bpm) || 0;

  const Toggle = ({value, onChange, label}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid var(--border)`}}>
      <span style={{fontSize:"12px",color:"var(--text)",fontWeight:"600",flex:1,paddingRight:"12px"}}>{label}</span>
      <div onClick={()=>onChange(!value)} style={{
        width:"38px",height:"20px",borderRadius:"10px",
        background:value?"var(--accent)":"var(--navy)",border:`1px solid ${value?"var(--accent)":"var(--border)"}`,
        cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0,
      }}>
        <div style={{width:"14px",height:"14px",borderRadius:"50%",background:"white",position:"absolute",top:"2px",left:value?"21px":"2px",transition:"left 0.2s"}}/>
      </div>
    </div>
  );

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"22px",flexWrap:"wrap",gap:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Music Hub · Auto-DJ</h2>
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"1px"}}>Spotify Premium · {queueTracks.length} tracks queued</div>
          </div>
        </div>
        {queueTracks.length > 0 && (
          <div style={{padding:"5px 14px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 38%, transparent)`,borderRadius:"999px",fontSize:"12px",fontWeight:"700",color:"var(--accent)"}}>
            ● AUTO-DJ READY
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"1fr 1fr 1fr",gap:"16px"}}>

        {/* Column 1: Now Playing + Queue */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {/* Now playing */}
          <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Now playing</div>
            {np ? (
              <>
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"14px"}}>
                  {np.albumArt
                    ? <img src={np.albumArt} style={{width:"52px",height:"52px",borderRadius:"10px",objectFit:"cover",flexShrink:0}} alt=""/>
                    : <div style={{width:"52px",height:"52px",borderRadius:"10px",background:"repeating-linear-gradient(45deg,#1a2b1f 0,#1a2b1f 4px,#0f1611 4px,#0f1611 8px)",flexShrink:0}}/>
                  }
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{np.t||np.name}</div>
                    <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{np.a||np.artist}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  {currentBpm > 0
                    ? <div style={{fontFamily:"var(--display)",fontSize:"32px",fontWeight:"700",color:"var(--accent)"}}>{currentBpm} <span style={{fontSize:"11px",color:"var(--muted)",fontWeight:"400"}}>BPM</span></div>
                    : <div style={{fontSize:"13px",color:"var(--muted)"}}>BPM unknown</div>
                  }
                  <div style={{display:"flex",gap:"8px"}}>
                    <button onClick={()=>player?.previousTrack?.()} style={{width:"34px",height:"34px",borderRadius:"50%",background:"var(--navy)",border:`1px solid var(--border)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text)"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                    </button>
                    <button onClick={()=>player?.togglePlay?.()} style={{width:"34px",height:"34px",borderRadius:"50%",background:"var(--accent)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--on-accent)"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    </button>
                    <button onClick={()=>player?.nextTrack?.()} style={{width:"34px",height:"34px",borderRadius:"50%",background:"var(--navy)",border:`1px solid var(--border)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text)"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:"28px",marginBottom:"8px"}}>🎵</div>
                <div style={{fontSize:"12px",color:"var(--muted)",lineHeight:"1.5"}}>Nothing playing.<br/>Start a live session to see now-playing info.</div>
              </div>
            )}
          </div>

          {/* Track queue (from stages) */}
          <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>Stage queue</div>
              <div style={{fontSize:"11px",color:"var(--muted)"}}>{queueTracks.length} tracks</div>
            </div>
            {queueTracks.length === 0 ? (
              <div style={{textAlign:"center",padding:"16px 0",fontSize:"12px",color:"var(--muted)",lineHeight:"1.5"}}>
                No tracks yet.<br/>Run <strong style={{color:"var(--accent)"}}>DJ This Class</strong> in the Builder to fill the queue.
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"6px",maxHeight:"300px",overflowY:"auto"}}>
                {queueTracks.slice(0,30).map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 9px",background:t.isCurrent?"color-mix(in srgb, var(--accent) 8%, transparent)":"var(--navy)",border:`1px solid ${t.isCurrent?"color-mix(in srgb, var(--accent) 31%, transparent)":"var(--border)"}`,borderRadius:"8px"}}>
                    {t.albumArt
                      ? <img src={t.albumArt} style={{width:"28px",height:"28px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                      : <div style={{width:"28px",height:"28px",borderRadius:"5px",background:t.stageColor+"22",flexShrink:0}}/>
                    }
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.t}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.a} · {t.stageName}</div>
                    </div>
                    {t.bpm > 0 && <div style={{fontSize:"11px",fontWeight:"700",color:t.stageColor,flexShrink:0}}>{t.bpm}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Member requests + Playlists */}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>Member requests</div>
              {takeRequests
                ? <div style={{padding:"3px 9px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 31%, transparent)`,borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:"var(--accent)"}}>{requests.length} pending</div>
                : <div style={{padding:"3px 9px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"999px",fontSize:"11px",color:"var(--muted)"}}>Off</div>
              }
            </div>
            {!takeRequests
              ? <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>Enable "Take requests" in Mix Controls to allow member track requests.</div>
              : requests.length===0
                ? <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>No pending requests</div>
                : <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                    {requests.map(r=>(
                      <div key={r.id} style={{padding:"10px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"10px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
                          <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--display)",fontSize:"13px",fontWeight:"700",color:"var(--accent)",flexShrink:0}}>{r.votes}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.track}</div>
                            <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"1px"}}>{r.member}{r.bpm?` · ${r.bpm} BPM`:""}{r.note?` · ${r.note}`:""}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                          <button onClick={()=>setRequests(rs=>rs.filter(x=>x.id!==r.id))} style={{flex:1,padding:"5px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 31%, transparent)`,borderRadius:"6px",cursor:"pointer",color:"var(--accent)",fontSize:"11px",fontWeight:"700"}}>Queue it</button>
                          <button onClick={()=>setRequests(rs=>rs.filter(x=>x.id!==r.id))} style={{padding:"5px 10px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Skip</button>
                        </div>
                      </div>
                    ))}
                  </div>
            }
          </div>

          {/* Source playlists */}
          <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>Your Spotify playlists</div>
            {loadingPls && <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>Loading…</div>}
            {!loadingPls && playlists.length===0 && <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>No playlists found — connect Spotify first.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:"6px",maxHeight:"240px",overflowY:"auto"}}>
              {playlists.slice(0,15).map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"7px 9px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                  {p.images?.[0]?.url
                    ? <img src={p.images[0].url} style={{width:"28px",height:"28px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                    : <div style={{width:"28px",height:"28px",borderRadius:"5px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px"}}>🎵</div>
                  }
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)"}}>{(p.tracks?.total ?? "?")} tracks</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Mix controls */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>Mix controls</div>

          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"6px"}}>Energy target</div>
            <div style={{display:"flex",gap:"5px"}}>
              {["Low","Medium","High","Peak"].map(e=>(
                <button key={e} onClick={()=>setEnergy(e)} style={{flex:1,padding:"7px 2px",background:energy===e?"var(--accent)":"transparent",border:`1px solid ${energy===e?"var(--accent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",color:energy===e?"#0A0F0C":"var(--muted)",fontSize:"10px",fontWeight:"700"}}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:"14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
              <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600"}}>BPM range</div>
              <div style={{fontSize:"11px",color:"var(--accent)",fontWeight:"700"}}>{bpmMin}–{bpmMax}</div>
            </div>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <input type="range" min={60} max={180} value={bpmMin} onChange={e=>setBpmMin(Math.min(Number(e.target.value),bpmMax-5))} style={{flex:1,accentColor:"var(--accent)"}}/>
              <input type="range" min={60} max={180} value={bpmMax} onChange={e=>setBpmMax(Math.max(Number(e.target.value),bpmMin+5))} style={{flex:1,accentColor:"var(--accent)"}}/>
            </div>
          </div>

          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"6px"}}>Transition style</div>
            <div style={{display:"flex",gap:"5px"}}>
              {["Beat-match","Cut","Echo"].map(s=>(
                <button key={s} onClick={()=>setTransition(s)} style={{flex:1,padding:"7px 2px",background:transition===s?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",border:`1px solid ${transition===s?"var(--accent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",color:transition===s?"var(--accent)":"var(--muted)",fontSize:"10px",fontWeight:"700"}}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Toggle value={followStructure} onChange={setFollowStructure} label="Follow class structure · sync BPM to each stage"/>
          <Toggle value={takeRequests}    onChange={setTakeRequests}    label="Take requests · members queue tracks"/>
          <Toggle value={cleanEdits}      onChange={setCleanEdits}      label="Clean / radio edits · no explicit lyrics"/>
        </div>

      </div>
    </div>
  );
}



// ─── BrandStudioScreen ────────────────────────────────────────────────────────
// Smart brand recommendation: gym archetype -> curated accent + vibe + suggested preset.
const GYM_ARCHETYPES = [
  { label:"HIIT / Bootcamp",     kw:["hiit","bootcamp","conditioning","sweat","burn"], accent:"#FF5A3C", vibe:"energetic", preset:"pulse",   note:"High-intensity - a hot, punchy accent that reads across a dark room." },
  { label:"HYROX / Functional",  kw:["hyrox","functional","engine","race","competitive","erg"], accent:"#D6FF3D", vibe:"energetic", preset:"pulse",   note:"Race energy - electric lime with tabular numerals and accent glow." },
  { label:"Strength / CrossFit", kw:["strength","crossfit","power","barbell","lift","heavy"], accent:"#F5A623", vibe:"bold", preset:"pulse",   note:"Heavy and industrial - a bold amber-steel accent." },
  { label:"Boutique / Wellness", kw:["boutique","wellness","holistic","yoga","flow","calm","natural","mindful"], accent:"#7BE3A4", vibe:"natural", preset:"canopy",  note:"Calm and natural - soft sage green over gentle surfaces." },
  { label:"Luxury / Reformer",   kw:["luxury","reformer","pilates","premium","editorial","refined"], accent:"#C8A86A", vibe:"luxury", preset:"atelier", note:"Quiet luxury - warm gold on near-black with a serif display face." },
  { label:"Spin / Rhythm",       kw:["spin","rhythm","cycle","ride","dance","beat"], accent:"#A855F7", vibe:"energetic", preset:"pulse",   note:"Nightclub energy - a vivid violet with an accent glow." },
  { label:"Boxing / Combat",     kw:["boxing","combat","mma","fight","muay","kick"], accent:"#EF4444", vibe:"bold", preset:"pulse",   note:"Combat grit - a bold red on a dark canvas." },
  { label:"Recovery / Mobility", kw:["recovery","mobility","stretch","restore","sauna","reset"], accent:"#5BD0C0", vibe:"calm", preset:"canopy",  note:"Restorative - a cool teal, low-contrast and easy on the eyes." },
];
function recommendArchetype(text){
  const t=(text||"").toLowerCase();
  if(t){ const hit=GYM_ARCHETYPES.find(a=>a.kw.some(k=>t.includes(k))); if(hit) return hit; }
  return null;
}
function BrandStudioScreen({onBack, gymBranding={}, onBrandingChange, activeSkinId="canopy", onSkinChange, customSkinTokens=null, onCustomSkinChange}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;

  // ── Preset templates ──────────────────────────────────────────────────────────
  const presets = [
    { id:"canopy",  label:"Canopy",  desc:"Natural · Wellness",   accent:"#7BE3A4", bg:"#0A0F0C", preview:["#7BE3A4","#CFF5DE","#0F1611"], fonts:"Space Grotesk · Hanken" },
    { id:"pulse",   label:"Pulse",   desc:"Electric · HIIT",      accent:"#D6FF3D", bg:"#08090A", preview:["#D6FF3D","#ECFFA3","#101113"], fonts:"Anton · Archivo" },
    { id:"atelier", label:"Atelier", desc:"Luxury · Editorial",   accent:"#C8A86A", bg:"#0C0C0E", preview:["#C8A86A","#E8D6AE","#131316"], fonts:"Instrument Serif · Manrope" },
  ];

  // ── Brand generator state ─────────────────────────────────────────────────────
  const [files, setFiles]         = React.useState([]);
  const [logoSrc, setLogoSrc]     = React.useState(gymBranding.logo || null);
  const [palette, setPalette]     = React.useState(null);        // string[] from extractPalette
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analyzeStep, setAnalyzeStep] = React.useState(0);
  const [generatedSkin, setGeneratedSkin] = React.useState(null); // full skin object
  const [generatedThemes, setGeneratedThemes] = React.useState([]);   // FR-H1: 3 options
  const [luma, setLuma] = React.useState(0.2);                        // FR-H6: collateral luminance
  const [vibe, setVibe]           = React.useState("natural");
  const fileRef                   = React.useRef(null);

  // ── Fine-tune state (draft tokens for the active skin) ───────────────────────
  const _baseSkin = PRESET_SKINS[activeSkinId] || PRESET_SKINS.canopy;
  const currentTokens = customSkinTokens
    ? { ..._baseSkin.tokens, ...customSkinTokens }
    : { ..._baseSkin.tokens };

  const [draftTokens, setDraftTokens] = React.useState(currentTokens);
  const [recPrompt, setRecPrompt] = React.useState("");
  const [recNote, setRecNote] = React.useState(null);
  const [recBusy, setRecBusy] = React.useState(false);
  React.useEffect(() => { setDraftTokens(currentTokens); }, [activeSkinId]);

  const analyzeSteps = [
    "Reading the colours in your logo…",
    "Deriving background & surface tones…",
    "Checking accessibility contrast…",
    "Composing your custom identity…",
  ];

  const vibes = [
    { id:"natural",   label:"Natural" },
    { id:"energetic", label:"Energetic" },
    { id:"luxury",    label:"Luxury" },
    { id:"bold",      label:"Bold" },
    { id:"calm",      label:"Calm" },
  ];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFiles([file.name]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      setLogoSrc(src);
      setPalette(null);
      setGeneratedSkin(null);
    };
    reader.readAsDataURL(file);
  };

  const runAnalysis = () => {
    if (!logoSrc) return;
    setAnalyzing(true);
    setAnalyzeStep(0);
    setGeneratedSkin(null);
    setGeneratedThemes([]);

    const advance = (i) => {
      if (i === 1) {
        // Real palette extraction at step 1
        extractPalette(logoSrc, (swatches, lm) => {
          const extracted = swatches || ["#7BE3A4"];
          setPalette(extracted);
          setLuma(lm!=null?lm:0.2);
          setAnalyzeStep(2);
          setTimeout(() => advance(2), 900);
        });
      } else if (i >= analyzeSteps.length) {
        setAnalyzing(false);
        // Generate skin from extracted palette
        const themes = generateThemes(palette || ["#7BE3A4"], luma);
        setGeneratedThemes(themes);
        setGeneratedSkin(themes[0]);
      } else {
        setAnalyzeStep(i);
        setTimeout(() => advance(i + 1), 900);
      }
    };
    setTimeout(() => { setAnalyzeStep(1); advance(1); }, 700);
  };

  const applyGenerated = () => {
    if (!generatedSkin) return;
    // Switch to "canopy" as base then apply custom token overrides
    onSkinChange("canopy");
    onCustomSkinChange(generatedSkin.tokens);
    if (logoSrc) onBrandingChange({ ...gymBranding, logo: logoSrc });
  };
  const applyRecommendation = (arch) => {
    if(!arch) return;
    const mode = arch.mode === "light" ? "light" : "dark";
    const skin = generateSkinFromPalette([arch.accent], arch.vibe, mode);
    setDraftTokens({ ...skin.tokens });
    setRecNote({ label:arch.label, preset:arch.preset, note:arch.note });
  };
  // LLM-first: ask the smart-build function (task:"brand") for a bespoke scheme,
  // falling back to the offline curated matcher on any error or when Supabase is off.
  const runRecommend = async () => {
    const pr = (recPrompt||"").trim();
    const curated = () => applyRecommendation(recommendArchetype(pr) || GYM_ARCHETYPES[0]);
    if (pr && supabaseEnabled && supabase) {
      setRecBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("smart-build", { body: { prompt: pr, task: "brand" } });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        if (data && data.accent) {
          applyRecommendation({
            label: data.name || "Custom recommendation",
            accent: data.accent,
            vibe: data.vibe || "natural",
            mode: data.mode,
            preset: data.preset || "canopy",
            note: data.note || "",
          });
          setRecBusy(false);
          return;
        }
      } catch (err) { /* fall back to curated matcher */ }
      setRecBusy(false);
    }
    curated();
  };

  const tokenLabels = [
    { key:"bg",     label:"Background" },
    { key:"card",   label:"Card surface" },
    { key:"navy",   label:"Inset / chip" },
    { key:"accent", label:"Primary accent" },
    { key:"green",  label:"Accent light" },
    { key:"text",   label:"Primary text" },
    { key:"muted",  label:"Secondary text" },
    { key:"border", label:"Border" },
  ];

  // Contrast badges for fine-tune panel
  const contrastBadge = (fg, bg) => {
    try {
      const ratio = wcagContrast(fg, bg);
      const pass = ratio >= 4.5;
      return <span style={{fontSize:"9px",padding:"1px 5px",borderRadius:"4px",background:pass?"rgba(123,227,164,.15)":"rgba(239,68,68,.15)",color:pass?"#7BE3A4":"#EF4444",fontWeight:"700",marginLeft:"4px"}}>{ratio.toFixed(1)}:1</span>;
    } catch(_){ return null; }
  };

  // ── WCAG-AA contrast audit of member-visible token pairs (Fable F6 · P2 10-foot rule).
  //    Checked live against the draft tokens the coach is editing. Button-label colour
  //    (--on-accent) is auto-derived (dark ink on a light accent, light ink on a dark one),
  //    so we mirror that derivation here rather than treating it as an editable token.
  const onAccentFor = (tk) => {
    try { return relativeLuminance(...hexToRgb(tk.accent)) > 0.18 ? tk.bg : tk.text; }
    catch(_){ return tk.text; }
  };
  const a11yChecks = [
    { id:"text-bg",   fgKey:"text",   fg:draftTokens.text,          bg:draftTokens.bg,     label:"Body text on background",     min:4.5, big:false },
    { id:"text-card", fgKey:"text",   fg:draftTokens.text,          bg:draftTokens.card,   label:"Text on card surface",        min:4.5, big:false },
    { id:"muted-bg",  fgKey:"muted",  fg:draftTokens.muted,         bg:draftTokens.bg,     label:"Secondary text on background",min:4.5, big:false },
    { id:"onacc-acc", fgKey:null,     fg:onAccentFor(draftTokens),  bg:draftTokens.accent, label:"Button label on accent",      min:4.5, big:false },
    { id:"accent-bg", fgKey:"accent", fg:draftTokens.accent,        bg:draftTokens.bg,     label:"Accent as text / graphics",   min:3.0, big:true  },
  ].map(c => {
    let ratio = 0; try { ratio = wcagContrast(c.fg, c.bg); } catch(_){}
    return { ...c, ratio, pass: ratio >= c.min };
  });
  const a11yTextFails = a11yChecks.filter(c => !c.big && !c.pass).length;
  const fixablePair  = (c) => c.fgKey && c.fgKey !== "accent" && !c.pass;   // never auto-mangle the brand accent
  const fixPair = (c) => { if (fixablePair(c)) setDraftTokens(d => ({ ...d, [c.fgKey]: nudgeContrast(c.fg, c.bg, c.min) })); };
  const fixAllText = () => setDraftTokens(d => {
    const nd = { ...d };
    a11yChecks.forEach(c => { if (c.fgKey && c.fgKey !== "accent" && !c.pass) nd[c.fgKey] = nudgeContrast(nd[c.fgKey], c.bg, c.min); });
    return nd;
  });

  const sectionStyle = {
    background:"var(--card)", border:`1px solid var(--border)`, borderRadius:"16px", padding:"20px",
  };
  const displayFont = (_baseSkin.fonts?.display || "Space Grotesk");

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid var(--border)`,borderRadius:"8px",padding:"7px",cursor:"pointer",color:"var(--text)",display:"flex"}}>
          <ArrowLeft size={16}/>
        </button>
        <div>
          <h2 style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:isMobile?"17px":"22px",fontWeight:"800",color:"var(--text)",margin:0,letterSpacing:"-0.3px"}}>Brand Studio</h2>
          <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>Upload your brand — Jungle designs the identity, then reskins every surface</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr",gap:"18px"}}>

        {/* ── LEFT COL ──────────────────────────────────────────────────────── */}
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

          {/* 1. PRESET TEMPLATES */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>TEMPLATES</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
              {presets.map(p => {
                const active = activeSkinId===p.id && !customSkinTokens;
                return (
                  <div key={p.id} onClick={()=>{ onSkinChange(p.id); onCustomSkinChange(null); }}
                    style={{
                      padding:"14px 12px",
                      background: active ? `${p.accent}12` : "var(--navy)",
                      border:`1px solid ${active ? p.accent : "var(--border)"}`,
                      borderRadius:"12px", cursor:"pointer",
                      boxShadow: active ? `0 0 0 3px ${p.accent}25` : "none",
                      transition:"all .25s",
                    }}>
                    {/* Swatch row */}
                    <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}>
                      {p.preview.map((c,i)=>(
                        <div key={i} style={{flex:1,height:"22px",borderRadius:"5px",background:c,border:"1px solid rgba(255,255,255,.08)"}}/>
                      ))}
                    </div>
                    <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"13px",fontWeight:"800",color:active?p.accent:"var(--text)",marginBottom:"2px"}}>{p.label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:"1.4"}}>{p.desc}</div>
                    <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"5px",opacity:0.7}}>{p.fonts}</div>
                    {active && <div style={{marginTop:"8px",fontSize:"9px",fontWeight:"700",color:p.accent,display:"flex",alignItems:"center",gap:"3px"}}><Check size={10}/> ACTIVE</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. GENERATE FROM BRAND */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>GENERATE FROM YOUR BRAND</div>

            {/* Logo upload */}
            <div
              onClick={()=>fileRef.current?.click()}
              style={{border:`1px dashed ${logoSrc?"var(--accent)":"var(--border)"}`,borderRadius:"12px",padding:"18px",textAlign:"center",cursor:"pointer",marginBottom:"12px",background:logoSrc?`color-mix(in srgb, var(--accent) 3%, transparent)`:"var(--navy)",transition:"all .2s"}}>
              {logoSrc
                ? <img src={logoSrc} alt="logo" style={{maxHeight:"60px",maxWidth:"100%",objectFit:"contain",borderRadius:"6px"}}/>
                : <>
                    <div style={{fontSize:"24px",marginBottom:"6px"}}>🎨</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"2px"}}>Drop your logo here</div>
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>PNG, JPG, SVG · click to browse</div>
                  </>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFileChange}/>

            {/* Vibe selector */}
            <div style={{marginBottom:"12px"}}>
              <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"7px"}}>Brand vibe</div>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {vibes.map(v=>(
                  <button key={v.id} onClick={()=>setVibe(v.id)}
                    style={{padding:"5px 11px",borderRadius:"999px",fontSize:"11px",fontWeight:"600",cursor:"pointer",
                      background:vibe===v.id?"var(--accent)":"var(--navy)",
                      color:vibe===v.id?"#0A0F0C":"var(--muted)",
                      border:`1px solid ${vibe===v.id?"var(--accent)":"var(--border)"}`,transition:"all .15s"}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Extracted palette preview */}
            {palette && (
              <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                <div style={{fontSize:"10px",color:"var(--muted)",fontWeight:"600",marginRight:"4px",lineHeight:"24px"}}>From your logo:</div>
                {palette.map((c,i)=>(
                  <div key={i} title={c} style={{width:"24px",height:"24px",borderRadius:"6px",background:c,border:"1px solid rgba(255,255,255,.12)",cursor:"default"}}/>
                ))}
              </div>
            )}

            {/* Analyze button */}
            {!analyzing && !generatedSkin && (
              <button onClick={runAnalysis} disabled={!logoSrc}
                style={{width:"100%",padding:"12px",background:logoSrc?"var(--accent)":"rgba(255,255,255,.06)",border:"none",borderRadius:"10px",cursor:logoSrc?"pointer":"not-allowed",fontSize:"13px",fontWeight:"700",color:logoSrc?"#0A0F0C":"var(--muted)",fontFamily:`'${displayFont}',sans-serif`,transition:"all .2s"}}>
                Analyse & generate identity
              </button>
            )}

            {/* Progress */}
            {analyzing && (
              <div style={{display:"flex",flexDirection:"column",gap:"8px",padding:"4px 0"}}>
                {analyzeSteps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{width:"18px",height:"18px",borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                      background:i<analyzeStep?"var(--accent)":i===analyzeStep?`color-mix(in srgb, var(--accent) 13%, transparent)`:"var(--navy)",
                      border:`1px solid ${i<=analyzeStep?"var(--accent)":"var(--border)"}`}}>
                      {i<analyzeStep && <Check size={10} color="#0A0F0C" strokeWidth={3}/>}
                      {i===analyzeStep && <div style={{width:"5px",height:"5px",borderRadius:"50%",background:"var(--accent)"}}/>}
                    </div>
                    <span style={{fontSize:"12px",color:i<=analyzeStep?"var(--text)":"var(--muted)"}}>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Generated result */}
            {generatedSkin && !analyzing && (
              <div style={{background:"var(--navy)",border:`1px solid ${generatedSkin.tokens.accent}50`,borderRadius:"12px",padding:"14px",marginTop:"4px"}}>
                <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>GENERATED IDENTITY</div>
                {generatedThemes.length>1 && (
                  <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                    {generatedThemes.map((th,i)=>{
                      const on = generatedSkin && generatedSkin.name===th.name;
                      return (
                        <button key={i} onClick={()=>setGeneratedSkin(th)} style={{flex:1,padding:"8px",background:on?th.tokens.accent+"22":"var(--card)",border:`1px solid ${on?th.tokens.accent:"var(--border)"}`,borderRadius:"9px",cursor:"pointer",textAlign:"left"}}>
                          <div style={{display:"flex",gap:"3px",marginBottom:"6px"}}>
                            {[th.tokens.accent,th.tokens.green,th.tokens.card].map((c,j)=><div key={j} style={{flex:1,height:"14px",borderRadius:"3px",background:c}}/>)}
                          </div>
                          <div style={{fontSize:"11px",fontWeight:"700",color:on?th.tokens.accent:"var(--text)"}}>{th.name}</div>
                          {th.recommended && <div style={{fontSize:"8px",fontWeight:"700",color:"var(--accent)",letterSpacing:"0.5px"}}>RECOMMENDED</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                  {[generatedSkin.tokens.accent, generatedSkin.tokens.green, generatedSkin.tokens.card, generatedSkin.tokens.bg].map((c,i)=>(
                    <div key={i} title={c} style={{flex:1,height:"28px",borderRadius:"7px",background:c,border:"1px solid rgba(255,255,255,.1)"}}/>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <div>
                    <div style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>{generatedSkin.fonts.display} · {generatedSkin.fonts.body}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)"}}>Vibe: {generatedSkin.vibe} · {generatedSkin.contrast?.passesAA?"✓ Passes WCAG AA":"⚠ Low contrast"}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={applyGenerated}
                    style={{flex:1,padding:"10px",background:generatedSkin.tokens.accent,border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"#0A0F0C",fontFamily:`'${displayFont}',sans-serif`}}>
                    Apply to all surfaces
                  </button>
                  <button onClick={()=>{setGeneratedSkin(null);setGeneratedThemes([]);}}
                    style={{padding:"10px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"var(--muted)"}}>
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COL ─────────────────────────────────────────────────────── */}
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

          {/* Smart recommendation */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"10px"}}>SMART RECOMMENDATION</div>
            <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"10px"}}>Describe your gym or pick a type — get a suggested palette that passes accessibility checks, straight into the swatches below.</div>
            <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
              <input value={recPrompt} onChange={e=>setRecPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!recBusy&&runRecommend()} disabled={recBusy} placeholder="e.g. high-intensity hyrox gym, industrial" style={{flex:1,minWidth:0,padding:"9px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
              <button onClick={runRecommend} disabled={recBusy} style={{padding:"9px 16px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"8px",cursor:recBusy?"default":"pointer",opacity:recBusy?0.7:1,fontWeight:"700",fontSize:"13px",whiteSpace:"nowrap"}}>{recBusy?"Thinking…":"Recommend"}</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"12px"}}>
              {GYM_ARCHETYPES.map(a=>(
                <button key={a.label} onClick={()=>{ setRecPrompt(a.label); applyRecommendation(a); }} style={{display:"flex",alignItems:"center",gap:"6px",padding:"5px 10px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"999px",cursor:"pointer",fontSize:"11px",fontWeight:"600",color:"var(--muted)"}}>
                  <span style={{width:"10px",height:"10px",borderRadius:"50%",background:a.accent,flexShrink:0}}/>{a.label}
                </button>
              ))}
            </div>
            {recNote && (
              <div style={{padding:"10px 12px",background:"color-mix(in srgb, var(--accent) 10%, transparent)",border:"1px solid color-mix(in srgb, var(--accent) 25%, transparent)",borderRadius:"9px",fontSize:"12px",color:"var(--text)",lineHeight:"1.5"}}>
                <b>{recNote.label}</b> - {recNote.note} <span style={{color:"var(--muted)"}}>Applied to the swatches below (based on the {recNote.preset.charAt(0).toUpperCase()+recNote.preset.slice(1)} preset). Tweak, then Save.</span>
              </div>
            )}
          </div>

          {/* 3. FINE-TUNE */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>FINE-TUNE TOKENS</div>
            <div style={{fontSize:"9px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Program tints · decorative</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"16px"}}>
              {((generatedSkin&&generatedSkin.programs)||PRESET_SKINS[activeSkinId]?.programs||DEFAULT_PROGRAMS).map((pg,i)=>(
                <ProgramChip key={i} name={pg.name} tint={pg.tint}/>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {tokenLabels.map(({key,label})=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <input type="color" value={draftTokens[key]?.startsWith("rgba")?"var(--card)":draftTokens[key]||"#000000"}
                    onChange={e=>setDraftTokens(d=>({...d,[key]:e.target.value}))}
                    style={{width:"30px",height:"30px",borderRadius:"6px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"1px"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)"}}>{label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)",fontFamily:"monospace"}}>{draftTokens[key]}</div>
                  </div>
                  {(key==="text"||key==="muted")&&contrastBadge(draftTokens[key],draftTokens.bg)}
                  {key==="accent"&&contrastBadge(draftTokens[key],draftTokens.bg)}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
              <button onClick={()=>{onCustomSkinChange(draftTokens);onSkinChange("custom");}}
                style={{flex:1,padding:"10px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--on-accent)",fontFamily:`'${displayFont}',sans-serif`}}>
                Save custom tokens
              </button>
              <button onClick={()=>{setDraftTokens({..._baseSkin.tokens});onCustomSkinChange(null);}}
                style={{padding:"10px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"var(--muted)"}}>
                Reset
              </button>
            </div>
          </div>

          {/* 3.5 ACCESSIBILITY — live WCAG-AA contrast audit (F6 · P2 10-foot rule) */}
          <div style={sectionStyle}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px"}}>ACCESSIBILITY · WCAG AA</div>
              {a11yTextFails>0 && (
                <button onClick={fixAllText} title="Nudge failing text colours until they pass AA"
                  style={{fontSize:"11px",fontWeight:"700",padding:"5px 11px",borderRadius:"999px",border:"1px solid var(--accent)",background:"color-mix(in srgb, var(--accent) 12%, transparent)",color:"var(--accent)",cursor:"pointer"}}>Auto-fix text</button>
              )}
            </div>

            {/* Roll-up banner */}
            <div style={{display:"flex",alignItems:"center",gap:"9px",padding:"10px 12px",borderRadius:"9px",marginBottom:"12px",
              background:a11yTextFails===0?"rgba(123,227,164,.12)":"rgba(245,158,11,.12)",
              border:`1px solid ${a11yTextFails===0?"rgba(123,227,164,.4)":"rgba(245,158,11,.4)"}`}}>
              <span style={{fontSize:"15px",flexShrink:0}}>{a11yTextFails===0?"✓":"⚠️"}</span>
              <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",lineHeight:1.4}}>
                {a11yTextFails===0
                  ? "Member-visible text meets WCAG AA — legible at room-display size."
                  : `${a11yTextFails} text pair${a11yTextFails>1?"s":""} below AA — may be hard to read from the back of the floor.`}
              </span>
            </div>

            {/* Per-pair rows */}
            <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
              {a11yChecks.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{width:"36px",height:"28px",borderRadius:"6px",background:c.bg,border:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{color:c.fg,fontSize:"13px",fontWeight:"800",lineHeight:1}}>Aa</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)"}}>{c.label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)"}}>{c.ratio.toFixed(2)}:1 · needs {c.min}:1{c.big?" · large/graphic":""}</div>
                  </div>
                  <span style={{fontSize:"10px",fontWeight:"800",padding:"2px 7px",borderRadius:"999px",flexShrink:0,
                    background:c.pass?"rgba(123,227,164,.15)":"rgba(239,68,68,.15)",color:c.pass?"#7BE3A4":"#EF4444"}}>{c.pass?"AA":"FAIL"}</span>
                  {fixablePair(c) && (
                    <button onClick={()=>fixPair(c)} title="Nudge this text colour until it passes AA"
                      style={{fontSize:"10px",fontWeight:"700",padding:"3px 8px",borderRadius:"6px",border:`1px solid var(--border)`,background:"var(--navy)",color:"var(--text)",cursor:"pointer",flexShrink:0}}>Fix</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"11px",lineHeight:1.5}}>
              Live against your draft tokens. AA needs 4.5:1 for body text, 3:1 for large/graphic marks. Passing keeps every branded member surface — including the room TV read at 8&nbsp;m — legible.
            </div>
          </div>

          {/* 4. LIVE PREVIEW */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>LIVE PREVIEW · updates instantly on reskin</div>
            <div style={{background:"var(--bg)",borderRadius:"12px",padding:"16px",border:`1px solid var(--border)`}}>
              {/* Mini nav */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"15px",fontWeight:"800",color:"var(--accent)",letterSpacing:"2px"}}>JUNGLE</div>
                <div style={{display:"flex",gap:"10px"}}>
                  {[["FILL","92%"],["RPE","7.4"],["NPS","71"]].map(([l,v])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"14px",fontWeight:"800",color:"var(--accent)"}}>{v}</div>
                      <div style={{fontSize:"9px",color:"var(--muted)",fontWeight:"700"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Mini class card */}
              <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"10px",padding:"12px",marginBottom:"8px"}}>
                <div style={{fontSize:"9px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"5px"}}>NEXT CLASS</div>
                <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"15px",fontWeight:"800",color:"var(--text)",marginBottom:"2px"}}>Strength Lab</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>with Priya · 18:30 · 45 min</div>
                <div style={{marginTop:"8px",height:"3px",borderRadius:"2px",background:`linear-gradient(to right, var(--accent), var(--green))`}}/>
              </div>
              {/* Mini schedule rows */}
              {["06:00  Sunrise HIIT","12:15  Hyrox Sim","18:30  Strength Lab"].map((c,i)=>(
                <div key={i} style={{fontSize:"11px",color:i===0?"var(--text)":"var(--muted)",padding:"5px 0",borderBottom:`1px solid var(--border)`,display:"flex",justifyContent:"space-between"}}>
                  <span>{c}</span>
                  {i===0&&<span style={{fontSize:"9px",padding:"2px 6px",background:`color-mix(in srgb, var(--accent) 9%, transparent)`,color:"var(--accent)",borderRadius:"4px",fontWeight:"700"}}>LIVE</span>}
                </div>
              ))}
              {/* Mini button */}
              <button style={{width:"100%",marginTop:"10px",padding:"9px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--on-accent)",fontFamily:`'${displayFont}',sans-serif`}}>
                Start Class
              </button>
            </div>
          </div>

          {/* 5. GYM NAME + LOGO (existing brand settings) */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>GYM IDENTITY</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div>
                <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"5px"}}>Gym name</div>
                <input value={gymBranding.gymName||""} onChange={e=>onBrandingChange({...gymBranding,gymName:e.target.value})}
                  placeholder="Your gym name…"
                  style={{width:"100%",padding:"9px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px",boxSizing:"border-box"}}/>
              </div>
              {gymBranding.logo && (
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <img src={gymBranding.logo} style={{height:"36px",maxWidth:"80px",objectFit:"contain",borderRadius:"6px",border:`1px solid var(--border)`}} alt="logo"/>
                  <button onClick={()=>onBrandingChange({...gymBranding,logo:null})}
                    style={{padding:"6px 10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const modal   = { background:"var(--card)", border:`1px solid var(--border)`, borderRadius:isMobile?"14px 14px 0 0":"14px", width:isMobile?"100%":"680px", maxWidth:isMobile?"100%":"95vw", maxHeight:isMobile?"92vh":"82vh", display:"flex", flexDirection:"column", overflow:"hidden" };

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
      <p style={{fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"8px"}}>One-time permission needed</p>
      <p style={{fontSize:"13px",color:"var(--muted)",marginBottom:"8px",maxWidth:"340px",lineHeight:"1.6"}}>
        Jungle needs read access to your Spotify playlist songs.<br/>
        This is a <strong style={{color:"var(--text)"}}>one-time step</strong> — after this, clicking any playlist will show its songs instantly.
      </p>
      <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"28px",opacity:0.7}}>
        {grantingAccess ? "A Spotify window just opened — approve access there, then come back." : "A small window will open — you'll be back here in seconds."}
      </p>
      <button onClick={handleGrantAccess} disabled={grantingAccess}
        style={{padding:"12px 32px",background: grantingAccess ? "var(--muted)" : "#1DB954",color:"white",border:"none",borderRadius:"24px",cursor: grantingAccess ? "default" : "pointer",fontWeight:"700",fontSize:"14px",display:"flex",alignItems:"center",gap:"9px",boxShadow: grantingAccess ? "none" : "0 4px 14px #1DB95440",transition:"all 0.2s"}}>
        <span>🎵</span> {grantingAccess ? "Waiting for Spotify…" : "Grant Playlist Access"}
      </button>
    </div>
  );

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{padding:"16px 20px", borderBottom:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0}}>
          <div style={{display:"flex", alignItems:"center", gap:"10px", minWidth:0}}>
            {mode==="tracks" && (
              <button onClick={()=>setMode("playlists")} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex",flexShrink:0}}>
                <ArrowLeft size={18}/>
              </button>
            )}
            <div style={{minWidth:0}}>
              <p style={{fontSize:"15px", fontWeight:"700", color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                {mode==="tracks" ? selPl?.name : "My Spotify Playlists"}
              </p>
              {mode==="tracks" && !loadingTr && tracks.length > 0 && (
                <p style={{fontSize:"11px", color:"var(--muted)", marginTop:"1px"}}>
                  {tracks.length} tracks{totalDurLabel ? ` · ${totalDurLabel}` : ""}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex",flexShrink:0}}><X size={18}/></button>
        </div>

        {/* Stage selector bar — shown in tracks view only */}
        {mode==="tracks" && !loadingTr && tracks.length > 0 && (
          <div style={{padding:"10px 16px", borderBottom:`1px solid var(--border)`, background:"var(--navy)", flexShrink:0, display:"flex", alignItems:"center", gap:"10px"}}>
            <p style={{fontSize:"11px", color:"var(--muted)", whiteSpace:"nowrap", fontWeight:"600"}}>Adding tracks to:</p>
            <select value={targetIdx} onChange={e=>{ setTargetIdx(Number(e.target.value)); setAddedSet(new Set()); }}
              style={{flex:1, background:"var(--card)", color:"var(--text)", border:`1px solid var(--border)`, borderRadius:"6px", padding:"6px 10px", fontSize:"12px", fontWeight:"600", cursor:"pointer"}}>
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
              ? <div style={{display:"flex",justifyContent:"center",padding:"40px"}}><Loader size={28} color={"var(--accent)"} style={{animation:"spin 1s linear infinite"}}/></div>
              : playlists.length === 0
                ? <p style={{textAlign:"center",color:"var(--muted)",padding:"40px",fontSize:"13px"}}>No playlists found on your Spotify account.</p>
                : <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":isTablet?"repeat(2,1fr)":"repeat(3,1fr)", gap:"10px"}}>
                    {(playlists || []).filter(Boolean).map(pl => {
                      const count = pl.tracks?.total ?? pl.items?.total ?? 0;
                      const myUid = localStorage.getItem("sp_uid");
                      const notMine = myUid && pl.owner?.id && pl.owner.id !== myUid;
                      return (
                        <div key={pl.id} onClick={()=>openPlaylist(pl)}
                          style={{background:"var(--navy)", border:`1px solid ${notMine?"color-mix(in srgb, var(--accent) 19%, transparent)":"var(--border)"}`, borderRadius:"10px", cursor:"pointer", overflow:"hidden", transition:"border-color 0.15s, transform 0.12s", opacity:notMine?0.8:1}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)"; e.currentTarget.style.transform="scale(1.02)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=notMine?"color-mix(in srgb, var(--accent) 19%, transparent)":"var(--border)"; e.currentTarget.style.transform="scale(1)";}}>
                          <div style={{position:"relative"}}>
                            {pl.images?.[0]?.url
                              ? <img src={pl.images[0].url} style={{width:"100%", aspectRatio:"1", objectFit:"cover"}} alt={pl.name}/>
                              : <div style={{width:"100%", aspectRatio:"1", background:"var(--card)", display:"flex", alignItems:"center", justifyContent:"center"}}><Music size={32} color={"var(--muted)"}/></div>
                            }
                            {notMine && <span style={{position:"absolute",top:"6px",right:"6px",fontSize:"9px",fontWeight:"700",color:"var(--accent)",background:"color-mix(in srgb, var(--bg) 87%, transparent)",borderRadius:"3px",padding:"2px 5px",backdropFilter:"blur(4px)"}}>NOT YOURS</span>}
                          </div>
                          <div style={{padding:"10px"}}>
                            <p style={{fontSize:"12px", fontWeight:"700", color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:"3px"}}>{pl.name}</p>
                            <p style={{fontSize:"10px", color:"var(--muted)"}}>{count} {count===1?"song":"songs"}{notMine&&pl.owner?.display_name?` · ${pl.owner.display_name}`:""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
          )}

          {/* ── Track list ── */}
          {mode==="tracks" && (
            loadingTr
              ? <div style={{display:"flex",justifyContent:"center",padding:"40px"}}><Loader size={28} color={"var(--accent)"} style={{animation:"spin 1s linear infinite"}}/></div>
              : tracks.length === 0
                ? <div style={{textAlign:"center",padding:"40px 24px"}}>
                    {accessDenied
                      ? <><p style={{fontSize:"20px",marginBottom:"8px"}}>🔒</p>
                          <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"6px"}}>Playlist not accessible</p>
                          <p style={{fontSize:"12px",color:"var(--muted)",marginBottom:"16px",lineHeight:"1.5"}}>
                            {typeof accessDenied === "string" && accessDenied !== "Forbidden"
                              ? accessDenied
                              : "Spotify only allows track access for playlists you own. To use this playlist, import its songs into one of your own Spotify playlists, then access it from 'My playlists' here."}
                          </p>
                          <button onClick={()=>{setMode("playlists");setAccessDenied(false);}} style={{padding:"8px 18px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",color:"var(--muted)",fontSize:"12px"}}>← Back</button>
                        </>
                      : <p style={{fontSize:"13px",color:"var(--muted)"}}>This playlist has no playable tracks.</p>
                    }
                  </div>
                : <div>
                    {tracks.map((t) => {
                      const isAdded = addedSet.has(t.id);
                      return (
                        <div key={t.id} style={{display:"flex", alignItems:"center", gap:"10px", padding:"8px 10px", borderRadius:"8px", marginBottom:"3px", background:isAdded?"color-mix(in srgb, var(--green) 6%, transparent)":"var(--navy)", border:`1px solid ${isAdded?"color-mix(in srgb, var(--green) 25%, transparent)":"transparent"}`, transition:"background 0.2s"}}>
                          {t.album?.images?.[0]?.url
                            ? <img src={t.album.images[0].url} style={{width:"40px",height:"40px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                            : <div style={{width:"40px",height:"40px",background:"var(--card)",borderRadius:"5px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={16} color={"var(--muted)"}/></div>
                          }
                          <div style={{flex:1, minWidth:0}}>
                            <p style={{fontSize:"12px",fontWeight:"600",color:isAdded?"var(--green)":"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</p>
                            <p style={{fontSize:"11px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.artists?.map(a=>a.name).join(", ")}</p>
                          </div>
                          {t.duration_ms > 0 && (
                            <span style={{fontSize:"10px",color:"var(--muted)",flexShrink:0}}>{fmtMs(t.duration_ms)}</span>
                          )}
                          <button onClick={()=>!isAdded&&addOneTrack(t)}
                            style={{flexShrink:0, padding:"6px 14px", background:isAdded?"color-mix(in srgb, var(--green) 13%, transparent)":"#1DB954", color:isAdded?"var(--green)":"white", border:`1px solid ${isAdded?"color-mix(in srgb, var(--green) 38%, transparent)":"transparent"}`, borderRadius:"20px", cursor:isAdded?"default":"pointer", fontSize:"11px", fontWeight:"700", whiteSpace:"nowrap", transition:"all 0.2s"}}>
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
          <div style={{padding:"12px 16px", borderTop:`1px solid var(--border)`, display:"flex", gap:"8px", flexShrink:0, background:"var(--card)"}}>
            {bulkAdded
              ? <p style={{color:"var(--green)", fontWeight:"700", fontSize:"13px", margin:"auto"}}>✓ All tracks added!</p>
              : <>
                  <button onClick={addAllToStage}
                    style={{flex:1, padding:"10px", background:"var(--accent)", color:"var(--on-accent)", border:"none", borderRadius:"7px", cursor:"pointer", fontSize:"12px", fontWeight:"700"}}>
                    Add all {tracks.length} to "{stages[targetIdx]?.name}"
                  </button>
                  {stages.length > 1 && (
                    <button onClick={distributeAcrossStages} disabled={distributing}
                      style={{flex:1, padding:"10px", background:"var(--navy)", color:distributing?"var(--muted)":"var(--text)", border:`1px solid var(--border)`, borderRadius:"7px", cursor:distributing?"default":"pointer", fontSize:"12px", fontWeight:"600", transition:"color 0.2s"}}
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

// ─── Glossary, folded into the Library (audit 2.3) ───────────────────────────
// The Glossary was its own nav destination showing muscles + a coaching cue for
// ~28 movements. That content is real and worth keeping; a separate screen for
// it was not, because it forced a coach to remember which of two places a
// movement lives in. The cue now rides on the movement's Library row.
//
// Matching is on a normalised name so "Push-Up", "push up" and "Push Up" all
// resolve. A miss returns null and NOTHING renders — the library is per-gym and
// mostly larger than the glossary, so an absent cue is the normal case, not an
// error to apologise for.
const GLOSSARY_BY_NAME = (() => {
  const map = new Map();
  for (const entries of Object.values(GLOSSARY)) {
    for (const e of entries) map.set(normMovementName(e.name), e);
  }
  return map;
})();
function normMovementName(n) {
  return String(n || "").toLowerCase().replace(/[\s\-_]+/g, " ").trim();
}
function glossaryEntry(name) {
  return GLOSSARY_BY_NAME.get(normMovementName(name)) || null;
}

// ─── LibraryBrowserModal ──────────────────────────────────────────────────────
function LibraryBrowserModal({ onClose, onAddExercise=null }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;

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
  const classColor = libData[selClass]?.color || "var(--accent)";

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

  const stageLabels = {warmup:"Warm-up",main:"Main set",cooldown:"Cool-down"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:600,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?"0":"20px"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{
        background:"var(--card)",borderRadius:isMobile?"14px 14px 0 0":"18px",
        border:`1px solid var(--border)`,
        width:"100%",maxWidth:isTablet?"700px":"1200px",
        height:isMobile?"96vh":"88vh",
        display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
        boxShadow:"0 30px 80px rgba(0,0,0,.45)"
      }}>

        {/* Toast */}
        {toast && <div style={{position:"absolute",top:"12px",left:"50%",transform:"translateX(-50%)",background:"var(--accent)",color:"var(--on-accent)",padding:"8px 18px",borderRadius:"20px",fontSize:"12px",fontWeight:"700",zIndex:10,pointerEvents:"none",whiteSpace:"nowrap"}}>{toast}</div>}

        {/* ── Top page header ── */}
        <div style={{flexShrink:0,padding:isMobile?"12px 16px":"16px 22px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
          <div>
            <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>EXERCISE LIBRARY</p>
            <p style={{fontSize:"12px",color:"var(--muted)"}}>The studio's movement catalogue — editable per gym, with a Discover feed of community packs</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:`1px solid var(--border)`,borderRadius:"8px",padding:"6px 12px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
            <X size={13}/> Close
          </button>
        </div>

        {/* ── Body: 3 columns (or stacked on mobile) ── */}
        <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden",minHeight:0}}>

          {/* ── LEFT RAIL: class type list ── */}
          {!isMobile && (
            <div style={{width:"220px",flexShrink:0,borderRight:`1px solid var(--border)`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <p style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",padding:"14px 18px 8px"}}>CLASS TYPE</p>
              <div style={{flex:1,overflowY:"auto"}}>
                {classKeys.map(k=>{
                  const c = libData[k];
                  const totalCount = Object.values(c.subTypes||{}).reduce((a,sub)=>a+(sub.warmup?.length||0)+(sub.main?.length||0)+(sub.cooldown?.length||0),0);
                  const isActive = selClass===k;
                  return (
                    <button key={k} onClick={()=>setSelClass(k)}
                      style={{
                        width:"100%",textAlign:"left",padding:"10px 18px",border:"none",
                        background:isActive?"var(--navy)":"transparent",cursor:"pointer",
                        display:"flex",alignItems:"center",gap:"10px",
                        borderLeft:isActive?`3px solid ${c.color}`:"3px solid transparent",
                        transition:"background 0.15s"
                      }}>
                      <div style={{width:"9px",height:"9px",borderRadius:"3px",flexShrink:0,background:c.color}}/>
                      <span style={{flex:1,fontSize:"13px",fontWeight:isActive?"700":"500",color:isActive?"var(--text)":"var(--muted)"}}>{c.label}</span>
                      <span style={{fontSize:"11px",color:"var(--muted)"}}>{totalCount}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{flexShrink:0,padding:"12px 18px",borderTop:`1px solid var(--border)`}}>
                <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                  <Plus size={13}/> New class type
                </button>
              </div>
            </div>
          )}

          {/* ── CENTER: library / discover content ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

            {/* Center toolbar */}
            <div style={{flexShrink:0,padding:isMobile?"10px 14px":"12px 18px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
              {/* Mobile: class type select */}
              {isMobile && (
                <select value={selClass} onChange={e=>setSelClass(e.target.value)}
                  style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"12px",cursor:"pointer"}}>
                  {classKeys.map(k=><option key={k} value={k}>{libData[k].icon} {libData[k].label}</option>)}
                </select>
              )}

              {/* The "Discover" tab and its right-rail packs feed are gone: the tab
                  browsed a third-party exercise API the gym never asked for, and
                  the packs were fabricated authors and import counts (audit 2.2).
                  The library is now the one movement home. */}
              <>
                  {/* Search */}
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:"7px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",padding:"7px 12px",minWidth:"120px"}}>
                    <Search size={13} color={"var(--muted)"}/>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search exercises…"
                      style={{background:"none",border:"none",outline:"none",color:"var(--text)",fontSize:"12px",width:"100%"}}/>
                  </div>
                  {/* Edit toggle */}
                  <button onClick={()=>{setEditMode(v=>!v);setEditingId(null);}}
                    style={{padding:"7px 14px",background:editMode?classColor+"22":"var(--navy)",border:`1px solid ${editMode?classColor:"var(--border)"}`,borderRadius:"8px",cursor:"pointer",color:editMode?classColor:"var(--muted)",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
                    ✏️ {editMode?"Done":"Edit"}
                  </button>
                  {editMode && <button onClick={()=>setResetConfirm(true)} style={{padding:"7px 12px",background:"transparent",border:"1px solid #EF444440",borderRadius:"8px",cursor:"pointer",color:"#EF4444",fontSize:"11px",fontWeight:"700",flexShrink:0}}>Reset</button>}
              </>
            </div>

            <>
                {/* Sub-type filter chips */}
                <div style={{flexShrink:0,padding:"8px 18px",borderBottom:`1px solid var(--border)`,display:"flex",gap:"6px",overflowX:"auto",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
                  {subKeys.map(sk=>{
                    const s = cls.subTypes[sk];
                    const isActive = selSub===sk;
                    return (
                      <button key={sk} onClick={()=>{setSelSub(sk);setEditingId(null);}}
                        style={{flexShrink:0,padding:"5px 14px",borderRadius:"999px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"700",whiteSpace:"nowrap",
                          background:isActive?classColor:"transparent",
                          color:isActive?"#fff":"var(--muted)",
                          outline:isActive?"none":`1px solid var(--border)`,
                          transition:"background 0.15s"}}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {/* Stage tabs */}
                <div style={{flexShrink:0,padding:"0 18px",borderBottom:`1px solid var(--border)`,display:"flex",gap:"0",alignItems:"center"}}>
                  {[["warmup","Warm-up"],["main","Main set"],["cooldown","Cool-down"]].map(([stage,lbl])=>{
                    const cnt = (sub?.[stage]||[]).length;
                    const isActive = selStage===stage;
                    return (
                      <button key={stage} onClick={()=>{setSelStage(stage);setEditingId(null);}}
                        style={{
                          padding:"12px 16px",background:"none",border:"none",cursor:"pointer",
                          fontSize:"13px",fontWeight:"600",whiteSpace:"nowrap",
                          color:isActive?classColor:"var(--muted)",
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
                    <div style={{textAlign:"center",padding:"40px",color:"var(--muted)"}}>
                      <p style={{fontSize:"24px",marginBottom:"8px"}}>🔍</p>
                      <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>No exercises found</p>
                      <p style={{fontSize:"11px"}}>{search?"Try a different search":"No exercises for this stage yet"}</p>
                    </div>
                  )}

                  {exercises.map(ex=>{
                    const isEditing = editMode && editingId===ex.id;
                    return (
                      <div key={ex.id} style={{
                        background:isEditing?classColor+"12":"var(--navy)",
                        border:`1px solid ${isEditing?classColor+"60":"var(--border)"}`,
                        borderRadius:"10px",padding:"12px 14px",
                        transition:"border-color 0.15s,background 0.15s"
                      }}>
                        {isEditing ? (
                          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                            <input value={draftEx.n||""} onChange={e=>setDraftEx(d=>({...d,n:e.target.value}))} placeholder="Exercise name *"
                              style={{padding:"6px 10px",background:"var(--card)",border:`1px solid ${classColor}60`,borderRadius:"6px",color:"var(--text)",fontSize:"13px",fontWeight:"700",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                              {[["s","Sets","60px"],["r","Reps / Duration","110px"],["rest","Rest","80px"]].map(([f,p,w])=>(
                                <input key={f} value={draftEx[f]||""} onChange={e=>setDraftEx(d=>({...d,[f]:e.target.value}))} placeholder={p}
                                  style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:w,boxSizing:"border-box"}}/>
                              ))}
                              <select value={draftEx.timing||"none"} onChange={e=>setDraftEx(d=>({...d,timing:e.target.value}))}
                                style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",cursor:"pointer"}}>
                                {["none","emom","tabata","amrap","for time"].map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <input value={draftEx.muscles||""} onChange={e=>setDraftEx(d=>({...d,muscles:e.target.value}))} placeholder="Muscles targeted"
                              style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <textarea value={draftEx.notes||""} onChange={e=>setDraftEx(d=>({...d,notes:e.target.value}))} placeholder="Coaching notes (optional)" rows={2}
                              style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            <div style={{display:"flex",gap:"6px",justifyContent:"flex-end"}}>
                              <button onClick={cancelEdit} style={{padding:"5px 14px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Cancel</button>
                              <button onClick={saveEdit} disabled={!draftEx.n?.trim()} style={{padding:"5px 14px",background:classColor,border:"none",borderRadius:"6px",cursor:"pointer",color:"#fff",fontSize:"11px",fontWeight:"700",opacity:!draftEx.n?.trim()?0.5:1}}>Save Exercise</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                            {/* Drag handle */}
                            <div style={{color:"var(--muted)",fontSize:"14px",flexShrink:0,cursor:"grab",opacity:0.4}}>⠿</div>
                            {/* Info. `g` is the folded-in Glossary entry (or null).
                                It only fills gaps — a gym's own muscles text and
                                notes always win over the built-in reference. */}
                            <div style={{flex:1,minWidth:0}}>
                              <p style={{fontSize:"14px",fontWeight:"600",color:"var(--text)",marginBottom:"2px"}}>{ex.n}</p>
                              {(ex.muscles || glossaryEntry(ex.n)?.muscles) && (
                                <p style={{fontSize:"11px",color:"var(--muted)"}}>{ex.muscles || glossaryEntry(ex.n).muscles}</p>
                              )}
                              {(ex.notes || glossaryEntry(ex.n)?.cues) && (
                                <p style={{fontSize:"11px",color:"var(--muted)",opacity:0.85,marginTop:"3px",lineHeight:"1.45"}}>
                                  {ex.notes || glossaryEntry(ex.n).cues}
                                </p>
                              )}
                            </div>
                            {/* Tags */}
                            <div style={{display:"flex",gap:"5px",flexShrink:0,alignItems:"center"}}>
                              {ex.timing&&ex.timing!=="none" && (
                                <span style={{fontSize:"10px",padding:"3px 8px",background:classColor+"20",color:classColor,borderRadius:"999px",fontWeight:"700"}}>{ex.timing} work</span>
                              )}
                              {ex.r && <span style={{fontSize:"10px",color:"var(--muted)"}}>×{ex.r}{ex.s?` · ${ex.s}×`:""}</span>}
                              {editMode && (
                                <>
                                  <button onClick={()=>startEdit(ex)} style={{background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",padding:"4px 8px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>✏️</button>
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
          </div>

          {/* The 300px "Discover packs" rail is gone. It advertised a community
              marketplace that does not exist — fabricated authors and import
              counts when flagged on, and a permanent coming-soon billboard when
              flagged off. A column that only announces an absence earns none of
              its width (audit 2.2). The Glossary cues claim this space instead. */}
        </div>

        {/* Reset overlay */}
        {resetConfirm && (
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,borderRadius:"18px"}}>
            <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"24px",maxWidth:"340px",textAlign:"center"}}>
              <p style={{fontSize:"28px",marginBottom:"8px"}}>⚠️</p>
              <p style={{fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"8px"}}>Reset to Defaults?</p>
              <p style={{fontSize:"12px",color:"var(--muted)",marginBottom:"18px",lineHeight:"1.5"}}>All custom exercises will be removed and the built-in library restored.</p>
              <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                <button onClick={()=>setResetConfirm(false)} style={{padding:"8px 20px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"12px"}}>Cancel</button>
                <button onClick={handleReset} style={{padding:"8px 20px",background:"#EF4444",border:"none",borderRadius:"7px",cursor:"pointer",color:"#fff",fontSize:"12px",fontWeight:"700"}}>Reset Library</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SpotifyDevicePicker ──────────────────────────────────────────────────────
// Shows a pill/dropdown to choose between browser player and external devices.
function SpotifyDevicePicker({ devices, activeDeviceId, setActiveDeviceId, browserDeviceId, refreshDevices, compact=false }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!open) {
      setLoading(true);
      await refreshDevices().catch(()=>{});
      setLoading(false);
    }
  };

  const activeDevice = devices.find(d => d.id === activeDeviceId);
  const isBrowser = activeDeviceId === browserDeviceId;
  const label = activeDevice ? activeDevice.name : isBrowser ? "Browser" : "No device";

  const deviceIcon = (type) => {
    if (!type) return "🔊";
    const t = type.toLowerCase();
    if (t.includes("computer")) return "💻";
    if (t.includes("phone") || t.includes("smartphone")) return "📱";
    if (t.includes("speaker")) return "🔊";
    if (t.includes("tv") || t.includes("cast")) return "📺";
    return "🎵";
  };

  return (
    <div style={{position:"relative"}}>
      <button onClick={handleOpen}
        title="Choose playback device"
        style={{display:"flex",alignItems:"center",gap:"5px",padding:compact?"5px 9px":"6px 12px",
          background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"999px",
          fontSize:"11px",fontWeight:"600",color:"var(--text)",cursor:"pointer",whiteSpace:"nowrap"}}>
        <span style={{fontSize:"12px"}}>{deviceIcon(activeDevice?.type)}</span>
        {!compact && <span style={{maxWidth:"90px",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke={"var(--muted)"} strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"8px",minWidth:"200px",zIndex:999,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",padding:"4px 8px 8px"}}>Playback device</div>
          {loading && <div style={{fontSize:"12px",color:"var(--muted)",padding:"8px",textAlign:"center"}}>Loading devices…</div>}
          {!loading && devices.length === 0 && (
            <div style={{fontSize:"11px",color:"var(--muted)",padding:"8px",lineHeight:"1.5",textAlign:"center"}}>
              No devices found.<br/>Open Spotify on another device.
            </div>
          )}
          {!loading && devices.map(dev => (
            <div key={dev.id} onClick={()=>{ setActiveDeviceId(dev.id); setOpen(false); }}
              style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",borderRadius:"8px",cursor:"pointer",
                background:activeDeviceId===dev.id?"var(--accent-10)":"transparent",
                border:`1px solid ${activeDeviceId===dev.id?"var(--accent-30)":"transparent"}`,marginBottom:"2px"}}>
              <span style={{fontSize:"14px"}}>{deviceIcon(dev.type)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dev.name}</div>
                <div style={{fontSize:"10px",color:"var(--muted)"}}>{dev.is_active?"▶ Currently active":"Available"}{dev.id===browserDeviceId?" · Browser player":""}</div>
              </div>
              {activeDeviceId===dev.id && <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--accent)",flexShrink:0}}/>}
            </div>
          ))}
          <div style={{borderTop:`1px solid var(--border)`,marginTop:"6px",paddingTop:"6px"}}>
            <button onClick={async()=>{setLoading(true); await refreshDevices().catch(()=>{}); setLoading(false);}}
              style={{width:"100%",padding:"7px",background:"transparent",border:"none",color:"var(--muted)",fontSize:"11px",cursor:"pointer",fontWeight:"600"}}>
              ↻ Refresh devices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DjPlaylistModal ──────────────────────────────────────────────────────────
// Full-screen modal for selecting playlists before running Auto-DJ.
// Used on mobile/tablet where the AutoDjPanel sidebar isn't visible.
function DjPlaylistModal({ stages, onDjClass, djProgress, onClose }) {
  const [playlists, setPlaylists] = React.useState([]);
  const [loading,   setLoading]   = React.useState(false);
  const [selected,  setSelected]  = React.useState([]);

  React.useEffect(() => {
    setLoading(true);
    apiGetPlaylists().then(pls => {
      const valid = (pls||[]).filter(Boolean);
      setPlaylists(valid);
      setSelected(valid.map(p=>p.id));
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const run = () => { onDjClass(selected.length ? selected : null); onClose(); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:2000,display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{flexShrink:0,padding:"16px 20px",borderBottom:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:"var(--display)",fontSize:"16px",fontWeight:"800",color:"var(--text)"}}>🎧 Auto-DJ</div>
          <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>Choose source playlists for BPM matching</div>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"6px",display:"flex"}}>
          <X size={20}/>
        </button>
      </div>

      {/* Stage targets */}
      <div style={{flexShrink:0,padding:"14px 20px",borderBottom:`1px solid var(--border)`,background:"var(--navy)"}}>
        <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Stage BPM targets</div>
        <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"4px"}}>
          {stages.map((s,i)=>{
            const cfg = SCFG[s.type]||{bpmMin:100,bpmMax:140,color:"var(--accent)"};
            return (
              <div key={i} style={{flexShrink:0,padding:"6px 10px",background:"var(--card)",borderRadius:"8px",border:`1px solid var(--border)`,minWidth:"80px"}}>
                <div style={{width:"3px",height:"10px",background:cfg.color,borderRadius:"2px",marginBottom:"4px"}}/>
                <div style={{fontSize:"10px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                <div style={{fontSize:"9px",color:"var(--muted)"}}>{cfg.bpmMin}–{cfg.bpmMax}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Playlist list */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>Your playlists</div>
          {playlists.length > 0 && (
            <button onClick={()=>setSelected(selected.length===playlists.length?[]:[...playlists.map(p=>p.id)])}
              style={{fontSize:"11px",fontWeight:"700",color:"var(--accent)",background:"none",border:"none",cursor:"pointer"}}>
              {selected.length===playlists.length?"Deselect all":"Select all"}
            </button>
          )}
        </div>
        {loading && <div style={{textAlign:"center",padding:"24px",color:"var(--muted)"}}>Loading playlists…</div>}
        {!loading && playlists.map(pl => (
          <div key={pl.id} onClick={()=>toggle(pl.id)}
            style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",marginBottom:"6px",
              background:selected.includes(pl.id)?"var(--accent-10)":"var(--card)",
              border:`1px solid ${selected.includes(pl.id)?"var(--accent-30)":"var(--border)"}`,
              borderRadius:"10px",cursor:"pointer",transition:"all 0.12s"}}>
            <div style={{width:"16px",height:"16px",borderRadius:"4px",flexShrink:0,
              background:selected.includes(pl.id)?"var(--accent)":"transparent",
              border:`2px solid ${selected.includes(pl.id)?"var(--accent)":"var(--muted)"}`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              {selected.includes(pl.id) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            {pl.images?.[0]?.url
              ? <img src={pl.images[0].url} style={{width:"38px",height:"38px",borderRadius:"7px",objectFit:"cover",flexShrink:0}} alt=""/>
              : <div style={{width:"38px",height:"38px",borderRadius:"7px",background:"var(--accent-10)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>🎵</div>
            }
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pl.name}</div>
              <div style={{fontSize:"11px",color:"var(--muted)"}}>{pl.tracks?.total ?? "?"} tracks</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{flexShrink:0,padding:"16px 20px",borderTop:`1px solid var(--border)`,background:"var(--card)"}}>
        {djProgress?.active && (
          <div style={{marginBottom:"10px"}}>
            <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"4px"}}>{djProgress.message}</div>
            <div style={{height:"4px",background:"var(--navy)",borderRadius:"2px",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${djProgress.pct||0}%`,background:"var(--accent)",borderRadius:"2px",transition:"width .5s ease"}}/>
            </div>
          </div>
        )}
        <button onClick={run} disabled={djProgress?.active||selected.length===0}
          style={{width:"100%",padding:"14px",background:selected.length===0||djProgress?.active?"transparent":"var(--accent)",
            color:selected.length===0||djProgress?.active?"var(--muted)":"var(--on-accent)",
            border:`1px solid ${selected.length===0||djProgress?.active?"var(--border)":"var(--accent)"}`,
            borderRadius:"10px",fontSize:"14px",fontWeight:"800",cursor:selected.length===0||djProgress?.active?"not-allowed":"pointer",
            fontFamily:"var(--display)"}}>
          {djProgress?.active ? "⏳ Building set…" : selected.length===0 ? "Select at least one playlist" : `🎧 DJ This Class (${selected.length} playlist${selected.length!==1?"s":""})`}
        </button>
      </div>
    </div>
  );
}

// ─── AutoDjPanel ──────────────────────────────────────────────────────────────
function AutoDjPanel({ stages, onDjClass, djProgress }) {
  const [playlists,  setPlaylists]  = React.useState([]);
  const [loading,    setLoading]    = React.useState(false);
  const [selected,   setSelected]   = React.useState([]); // selected playlist ids
  const [loaded,     setLoaded]     = React.useState(false);

  const loadPlaylists = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const pls = await apiGetPlaylists();
      if (Array.isArray(pls) && pls.length) {
        setPlaylists(pls.filter(Boolean));
        setSelected(pls.filter(Boolean).map(p=>p.id)); // select all by default
      }
    } catch(_) {}
    setLoading(false);
    setLoaded(true);
  };

  React.useEffect(() => { loadPlaylists(); }, []);

  const toggle = id => setSelected(prev =>
    prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
  );

  const run = () => onDjClass(selected.length ? selected : null);

  return (
    <div style={{width:"300px",display:"flex",flexDirection:"column",flexShrink:0,borderLeft:`1px solid var(--border)`,background:"var(--card)",overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"16px 18px 12px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
        <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"2px"}}>Auto-DJ</div>
        <div style={{fontSize:"11px",color:"var(--muted)"}}>Spotify BPM-matched per stage</div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px"}}>
        {/* Stage BPM targets */}
        <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Stage BPM targets</div>
        <div style={{display:"flex",flexDirection:"column",gap:"7px",marginBottom:"16px"}}>
          {stages.map((s,i)=>{
            const cfg = SCFG[s.type] || {bpmMin:100,bpmMax:140,color:"var(--accent)"};
            const tracks = s.tracks||[];
            const trackCount = tracks.length;
            const firstTrack = tracks[0];
            return (
              <div key={i} style={{background:"var(--navy)",borderRadius:"8px",border:`1px solid ${trackCount>0?cfg.color+"40":"var(--border)"}`,overflow:"hidden",marginBottom:"2px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px"}}>
                  <div style={{width:"3px",height:"20px",background:cfg.color,borderRadius:"2px",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"1px"}}>{cfg.bpmMin}–{cfg.bpmMax} BPM</div>
                  </div>
                  {trackCount > 0
                    ? <div style={{fontSize:"10px",fontWeight:"700",color:cfg.color,flexShrink:0,background:cfg.color+"18",padding:"2px 6px",borderRadius:"4px"}}>{trackCount} ✓</div>
                    : <div style={{fontSize:"10px",color:"var(--muted)",flexShrink:0}}>–</div>
                  }
                </div>
                {firstTrack && (
                  <div style={{padding:"5px 10px 7px",borderTop:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"7px"}}>
                    {firstTrack.albumArt
                      ? <img src={firstTrack.albumArt} style={{width:"22px",height:"22px",borderRadius:"3px",objectFit:"cover",flexShrink:0}} alt=""/>
                      : <div style={{width:"22px",height:"22px",borderRadius:"3px",background:cfg.color+"22",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px"}}>🎵</div>
                    }
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"10px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{firstTrack.t||firstTrack.name||""}</div>
                      <div style={{fontSize:"9px",color:"var(--muted)"}}>
                        {firstTrack.a||""}{firstTrack.bpm?` · ${Math.round(firstTrack.bpm)} BPM`:""}
                        {trackCount>1?` +${trackCount-1} more`:""}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Playlist picker */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
          <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>Source playlists</div>
          {playlists.length > 0 && (
            <button onClick={()=>setSelected(selected.length===playlists.length?[]:[...playlists.map(p=>p.id)])}
              style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",background:"none",border:"none",cursor:"pointer",padding:0}}>
              {selected.length===playlists.length?"None":"All"}
            </button>
          )}
        </div>

        {loading && <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"12px 0"}}>Loading playlists…</div>}
        {!loading && playlists.length === 0 && (
          <div style={{fontSize:"11px",color:"var(--muted)",textAlign:"center",padding:"12px 0",lineHeight:"1.5"}}>
            Connect Spotify to load your playlists
          </div>
        )}
        {!loading && playlists.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:"5px",marginBottom:"16px"}}>
            {playlists.slice(0,20).map(pl=>(
              <div key={pl.id} onClick={()=>toggle(pl.id)} style={{
                display:"flex",alignItems:"center",gap:"9px",
                padding:"7px 10px",
                background:selected.includes(pl.id)?"color-mix(in srgb, var(--accent) 8%, transparent)":"var(--navy)",
                border:`1px solid ${selected.includes(pl.id)?"color-mix(in srgb, var(--accent) 31%, transparent)":"var(--border)"}`,
                borderRadius:"8px",cursor:"pointer",transition:"all 0.15s",
              }}>
                {/* Checkbox */}
                <div style={{
                  width:"14px",height:"14px",borderRadius:"3px",flexShrink:0,
                  background:selected.includes(pl.id)?"var(--accent)":"transparent",
                  border:`1.5px solid ${selected.includes(pl.id)?"var(--accent)":"var(--muted)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                }}>
                  {selected.includes(pl.id) && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="#0A0F0C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {pl.images?.[0]?.url
                  ? <img src={pl.images[0].url} style={{width:"28px",height:"28px",borderRadius:"5px",objectFit:"cover",flexShrink:0}} alt=""/>
                  : <div style={{width:"28px",height:"28px",borderRadius:"5px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px"}}>🎵</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pl.name}</div>
                  <div style={{fontSize:"10px",color:"var(--muted)"}}>{pl.tracks?.total ?? "?"} tracks</div>
                </div>
              </div>
            ))}
            {playlists.length > 20 && (
              <div style={{fontSize:"10px",color:"var(--muted)",textAlign:"center",padding:"4px"}}>{playlists.length - 20} more playlists not shown</div>
            )}
          </div>
        )}

        {/* Progress bar when running */}
        {djProgress?.active && (
          <div style={{marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"var(--muted)",marginBottom:"5px"}}>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{djProgress.message}</span>
              <span style={{flexShrink:0,marginLeft:"6px"}}>{djProgress.pct}%</span>
            </div>
            <div style={{height:"4px",background:"var(--navy)",borderRadius:"2px",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${djProgress.pct}%`,background:"var(--accent)",borderRadius:"2px",transition:"width 0.5s ease"}}/>
            </div>
          </div>
        )}

        {/* DJ button */}
        <button onClick={run} disabled={djProgress?.active || selected.length===0}
          style={{
            width:"100%",padding:"12px",
            background:djProgress?.active||selected.length===0?"transparent":"var(--accent)",
            color:djProgress?.active||selected.length===0?"var(--muted)":"var(--bg)",
            border:`1px solid ${djProgress?.active||selected.length===0?"var(--border)":"var(--accent)"}`,
            borderRadius:"9px",cursor:djProgress?.active||selected.length===0?"not-allowed":"pointer",
            fontSize:"13px",fontWeight:"700",transition:"all 0.2s",
          }}>
          {djProgress?.active ? "⏳ DJ'ing…" : selected.length===0 ? "Select playlists first" : `🎧 DJ This Class (${selected.length} playlist${selected.length!==1?"s":""})`}
        </button>
      </div>
    </div>
  );
}


function BuilderScreen({stages, onStageChange, onAddStage, onRemoveStage, onRemoveTrack, onAddTrack, onReorderTrack, sessionName, onSessionNameChange, onStartSession, onReorderStages, onMoveExercise, onOverviewDisplay, classChoice, onClassChoiceChange, onDjClass, djProgress, crossfade, onCrossfadeChange, onExportClass, onImportClass}) {
  // Export/import moved here from the retired Templates screen. Without this the
  // feature would have been orphaned by the nav change rather than folded.
  const importFileRef = useRef(null);
  const handleImportFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onImportClass?.(JSON.parse(reader.result)); }
      catch { alert("Could not read that file — please choose a Jungle class file (.json)."); }
    };
    reader.readAsText(file);
    e.target.value = ""; // let the same file be picked twice in a row
  };
  const vw = useWindowWidth();
  const isMobile  = vw < 480;
  const isTablet  = vw < 768;
  const [showPlaylistModal,  setShowPlaylistModal]  = useState(false);
  const [showLibraryModal,   setShowLibraryModal]   = useState(false);
  const [showDjModal,        setShowDjModal]        = useState(false);
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
  // F6: exercise movement previews (ExerciseDB)
  const [gifState, setGifState] = useState({});
  const [gifKeyDraft, setGifKeyDraft] = useState("");
  const openGif = (gkey, name) => {
    const hasKey = !!store.getExerciseDbKey();
    if (!hasKey) { setGifState(pv=>({...pv,[gkey]:{status:"nokey"}})); return; }
    setGifState(pv=>({...pv,[gkey]:{status:"loading"}}));
    fetchExerciseGif(name).then(url=>setGifState(pv=>({...pv,[gkey]:{status:url?"ok":"none",url}})));
  };
  const toggleGif = (gkey, name) => {
    if (gifState[gkey]) { setGifState(pv=>{const n={...pv}; delete n[gkey]; return n;}); return; }
    openGif(gkey, name);
  };
  const saveGifKey = (gkey, name) => {
    const v=(gifKeyDraft||"").trim(); if(!v) return;
    store.saveExerciseDbKey(v);
    setGifKeyDraft("");
    setGifState(pv=>({...pv,[gkey]:{status:"loading"}}));
    fetchExerciseGif(name).then(url=>setGifState(pv=>({...pv,[gkey]:{status:url?"ok":"none",url}})));
  };
  // Landing tab. With music quarantined the Soundtrack tab does not exist, so
  // defaulting to it would open the Builder on a blank panel (audit 2.1).
  const [subTab, setSubTab] = useState(FLAGS.music ? "music" : "settings");
  const [showSmart, setShowSmart] = useState(false);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
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
  const runSmartBuild = async () => {
    const pr = (smartPrompt||"").trim(); if (!pr) return;
    if (supabaseEnabled && supabase) {
      setSmartBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("smart-build", { body: { prompt: pr } });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        const built = (data && data.stages || []).map(st => ({ id:uid(), type:st.type||"circuit", name:st.name||"Stage", dur:Math.max(60, Math.round((st.durMin||8)*60)), exercises:(st.exercises||[]).map(e => ({ id:uid(), n:e.n||"Exercise", s:e.s||"", r:e.r||"", rest:e.rest||"" })), tracks:[] }));
        if (built.length) {
          onReorderStages(built); onSessionNameChange((data && data.name) || "Smart-built class"); setSelIdx(0);
          setSmartBusy(false); setShowSmart(false);
          setDistributeToast({msg:`\u26a1 Built "${(data && data.name)||"your class"}" \u2014 ${built.length} stages`}); setTimeout(()=>setDistributeToast(null),4000);
          return;
        }
      } catch(err) { /* fall back to template matcher */ }
      setSmartBusy(false);
    }
    const pk = smartPickClass(pr); applyTemplate(pk.classType, pk.subType); setShowSmart(false);
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
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg)"}}>

      {/* TOP BAR */}
      <div style={{height:"84px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",flexShrink:0,background:"var(--card)",gap:"12px"}}>
        {/* Left: back + session name */}
        <div style={{display:"flex",alignItems:"center",gap:"14px",minWidth:0,flex:1}}>
          <button onClick={()=>onOverviewDisplay()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center",flexShrink:0,padding:"4px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"21px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:isMobile?"140px":"320px"}}>{sessionName||"Untitled Session"}</span>
              <button onClick={()=>{const n=prompt("Session name:",sessionName);if(n)onSessionNameChange(n);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"2px",display:"flex",flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            </div>
            {!isMobile && <div style={{fontSize:"12px",color:"var(--muted)"}}>
              {Math.round(totalDur/60)} min · {stages.length} stages · {WORKOUT_LIBRARY[selectedClass]?.label||selectedClass} · target RPE 7–8
            </div>}
          </div>
        </div>
        {/* Right: action buttons */}
        {!isMobile && (
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
            <input ref={importFileRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{display:"none"}}/>
            <button onClick={()=>importFileRef.current?.click()} title="Open a class file saved from Jungle"
              style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--muted)",fontWeight:"600",fontSize:"13px",padding:"9px 13px",borderRadius:"9px",cursor:"pointer"}}>
              Open
            </button>
            <button onClick={onExportClass} title="Save this class as a file you can keep or send to another coach"
              style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--muted)",fontWeight:"600",fontSize:"13px",padding:"9px 13px",borderRadius:"9px",cursor:"pointer"}}>
              Save to file
            </button>
            <button onClick={onOverviewDisplay} style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontWeight:"600",fontSize:"13px",padding:"9px 15px",borderRadius:"9px",cursor:"pointer"}}>
              Preview on TV
            </button>
            <button onClick={()=>{ onStartSession(); }}
              style={{border:"none",background:"var(--accent)",color:"var(--bg)",fontWeight:"700",fontSize:"13px",padding:"9px 17px",borderRadius:"9px",cursor:"pointer"}}>
              Add to schedule
            </button>
          </div>
        )}
      </div>

      {/* Class type selector + DJ row */}
      <div style={{padding:isMobile?"8px 14px":"12px 24px",borderBottom:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
        {!isMobile && <span style={{fontSize:"10px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Class</span>}
        <select value={selectedClass} onChange={e=>handleClassChange(e.target.value)}
          style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid ${WORKOUT_LIBRARY[selectedClass]?.color||"var(--border)"}`,borderRadius:"7px",color:"var(--text)",fontSize:isMobile?"11px":"12px",cursor:"pointer",fontWeight:"600",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
          {classKeys.map(k=><option key={k} value={k}>{WORKOUT_LIBRARY[k].icon} {WORKOUT_LIBRARY[k].label}</option>)}
        </select>
        {selectedSubKeys.length > 0 && <>
          {!isMobile && <span style={{fontSize:"10px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Style</span>}
          <select value={selectedSub||""} onChange={e=>handleSubChange(e.target.value)}
            style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid ${WORKOUT_LIBRARY[selectedClass]?.color||"var(--border)"}`,borderRadius:"7px",color:"var(--text)",fontSize:isMobile?"11px":"12px",cursor:"pointer",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
            {selectedSubKeys.map(sk=><option key={sk} value={sk}>{WORKOUT_LIBRARY[selectedClass].subTypes[sk].label}</option>)}
          </select>
        </>}
        {/* Jungle presets — the six starter classes that used to be their own
            Templates nav destination (audit 2.3). They belong beside Class and
            Style: all three answer "what shape is this class", and a coach with
            no plans yet needs a ready-made one right here, not in another screen.
            Picking one REPLACES the current stages, so it stays on "—" until
            chosen rather than showing a preset the coach did not pick. */}
        {!isMobile && <span style={{fontSize:"10px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Preset</span>}
        <select value="" onChange={e=>{
            const t = TEMPLATES.find(x=>x.id===e.target.value);
            if (t) onImportClass?.({ name:t.name, stages:t.stages });
          }}
          title="Start from a ready-made Jungle class"
          style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--muted)",fontSize:isMobile?"11px":"12px",cursor:"pointer",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
          <option value="">Jungle presets…</option>
          {TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.name} · {t.tag}</option>)}
        </select>
        <button onClick={()=>setShowLibraryModal(true)}
          style={{padding:"5px 10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",flexShrink:0,minHeight:"30px"}}>
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
          style={{padding:"5px 10px",background:"color-mix(in srgb, var(--accent) 9%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 31%, transparent)`,borderRadius:"7px",cursor:"pointer",color:"var(--accent)",fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",flexShrink:0,minHeight:"30px"}}>
          ⚡ {!isMobile && "Smart "}Distribute
        </button>
        {FLAGS.music && <button onClick={()=>{ if(isMobile||isTablet) setShowDjModal(true); else onDjClass(); }} disabled={djProgress?.active}
          style={{display:"flex",alignItems:"center",gap:"6px",padding:isMobile?"6px 10px":"8px 14px",background:djProgress?.active?"var(--border)":"linear-gradient(135deg,#1DB954,#148a3d)",color:"#fff",border:"none",borderRadius:"8px",cursor:djProgress?.active?"wait":"pointer",fontSize:isMobile?"12px":"13px",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0}}>
          {djProgress?.active ? "⏳ DJ'ing..." : "🎧 DJ This Class"}
        </button>}
        <button onClick={()=>setShowSmart(true)} style={{display:"flex",alignItems:"center",gap:"6px",padding:isMobile?"6px 10px":"8px 14px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:isMobile?"12px":"13px",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0,boxShadow:"var(--glow)"}}>⚡ {isMobile?"Build":"Build for me"}</button>
      </div>

      {/* DJ progress bar */}
      {djProgress?.active && (
        <div style={{padding:"8px 24px",display:"flex",flexDirection:"column",gap:"4px",background:"var(--card)",borderBottom:`1px solid var(--border)`}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:"var(--muted)"}}>
            <span>{djProgress.message}</span><span>{djProgress.pct}%</span>
          </div>
          <div style={{height:"4px",background:"var(--border)",borderRadius:"2px"}}>
            <div style={{height:"100%",width:`${djProgress.pct}%`,background:"var(--green)",borderRadius:"2px",transition:"width 0.5s ease"}}/>
          </div>
        </div>
      )}

      {/* Template change banner */}
      {templatePrompt && (
        <div style={{padding:"10px 24px",background:"#F59E0B18",borderBottom:`1px solid #F59E0B50`,display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{fontSize:"11px",color:"var(--text)",flex:1,minWidth:"200px"}}>
            <span style={{fontWeight:"700",color:"#F59E0B"}}>⚠️ Apply {WORKOUT_LIBRARY[templatePrompt.classType]?.icon} {WORKOUT_LIBRARY[templatePrompt.classType]?.label} template?</span>
            {" "}This will replace your current stages.
          </span>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>setTemplatePrompt(null)} style={{padding:"5px 12px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Keep Current</button>
            <button onClick={()=>applyTemplate(templatePrompt.classType,templatePrompt.subType)} style={{padding:"5px 12px",background:"var(--accent)",border:"none",borderRadius:"6px",cursor:"pointer",color:"var(--bg)",fontSize:"11px",fontWeight:"700"}}>Apply</button>
          </div>
        </div>
      )}

      {/* Distribute toast */}
      {distributeToast && (
        <div style={{position:"fixed",bottom:"80px",left:"50%",transform:"translateX(-50%)",background:"var(--navy)",border:`1px solid color-mix(in srgb, var(--accent) 31%, transparent)`,borderRadius:"10px",padding:"12px 20px",color:"var(--text)",fontSize:"13px",fontWeight:"600",zIndex:200,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",pointerEvents:"none",whiteSpace:"nowrap"}}>
          {distributeToast.msg}
        </div>
      )}

      {/* THREE-COLUMN BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* LEFT COLUMN: Stage list */}
        <div style={{flex:1.7,display:"flex",flexDirection:"column",borderRight:isTablet?"none":`1px solid var(--border)`,minWidth:0,overflowY:"auto",padding:"20px 24px",gap:"12px"}}>
          {stages.map((s, i) => {
            const cfg = SCFG[s.type] || SCFG.circuit;
            const isOpen = selIdx === i;
            return (
              <div key={s.id}
                draggable onDragStart={e=>handleDragStart(e,i)} onDragOver={e=>handleDragOver(e,i)} onDrop={e=>handleDrop(e,i)} onDragEnd={handleDragEnd}
                onClick={()=>setSelIdx(i)}
                style={{border:`1px solid ${isOpen?"var(--accent)":"var(--border)"}`,borderRadius:"14px",overflow:"hidden",background:"var(--card)",cursor:"pointer",boxShadow:isOpen?`0 0 0 1px color-mix(in srgb, var(--accent) 13%, transparent)`:undefined,opacity:dragOver===i?0.6:1,transition:"opacity 0.15s"}}>
                {/* Stage header */}
                <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 16px",background:isOpen?"transparent":"var(--navy)"}}>
                  <div style={{width:"3px",height:"26px",borderRadius:"2px",background:cfg.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>{s.type} · {fmt(s.dur)}</div>
                  </div>
                  <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0}}>{(s.exercises||[]).length} ex</span>
                  <button onClick={e=>{e.stopPropagation();onRemoveStage(i);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex",flexShrink:0}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                {/* Exercise list when expanded */}
                {isOpen && (s.exercises||[]).length > 0 && (
                  <div style={{padding:"6px 14px 10px"}}>
                    {(s.exercises||[]).map((ex,ei)=>{
                      const gkey = `${s.id}-${ei}`;
                      const g = gifState[gkey];
                      return (
                      <div key={ei}>
                        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 6px",borderBottom:ei<(s.exercises||[]).length-1?`1px solid var(--border)`:"none"}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={"var(--muted)"} strokeWidth="1.8">
                            <circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>
                            <circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>
                          </svg>
                          <div style={{flex:1,fontSize:"13px",color:"var(--text)"}}>{ex.n}</div>
                          <div style={{fontSize:"12px",color:"var(--muted)"}}>{[ex.s&&`${ex.s}×`,ex.r,ex.rest&&`· ${ex.rest}`].filter(Boolean).join(" ")}</div>
                          <button onClick={ev=>{ev.stopPropagation(); toggleGif(gkey, ex.n);}} title="Movement preview" style={{background:"none",border:"none",cursor:"pointer",color:g?"var(--accent)":"var(--muted)",padding:"2px",display:"flex",flexShrink:0}}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          </button>
                        </div>
                        {g && (
                          <div onClick={ev=>ev.stopPropagation()} style={{padding:"0 6px 6px"}}>
                            {g.status==="loading" && <div style={{fontSize:"11px",color:"var(--muted)",padding:"6px"}}>Loading preview…</div>}
                            {g.status==="ok" && <img src={g.url} alt={ex.n} style={{width:"100%",maxWidth:"240px",borderRadius:"8px",display:"block",margin:"4px auto"}} onError={ev=>{ev.target.style.display="none";}}/>}
                            {g.status==="none" && <div style={{fontSize:"11px",color:"var(--muted)",padding:"6px"}}>No preview found for "{ex.n}".</div>}
                            {g.status==="nokey" && (
                              <div style={{padding:"8px",background:"var(--navy)",borderRadius:"8px",margin:"4px 0"}}>
                                <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"6px"}}>Paste your ExerciseDB (RapidAPI) key to load movement GIFs:</div>
                                <div style={{display:"flex",gap:"6px"}}>
                                  <input value={gifKeyDraft} onChange={e=>setGifKeyDraft(e.target.value)} placeholder="RapidAPI key" style={{flex:1,minWidth:0,padding:"7px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"12px"}}/>
                                  <button onClick={ev=>{ev.stopPropagation(); saveGifKey(gkey, ex.n);}} style={{padding:"7px 12px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Save</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    <button onClick={e=>{e.stopPropagation();addEx();}}
                      style={{marginTop:"8px",width:"100%",padding:"7px",background:"transparent",border:`1px dashed var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      Add exercise
                    </button>
                  </div>
                )}
                {isOpen && (s.exercises||[]).length === 0 && (
                  <div style={{padding:"10px 14px"}}>
                    <button onClick={e=>{e.stopPropagation();addEx();}}
                      style={{width:"100%",padding:"10px",background:"transparent",border:`1px dashed var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
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
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"9px",padding:"11px",border:`1px dashed var(--border)`,borderRadius:"11px",color:"var(--muted)",fontSize:"13px",fontWeight:"600",background:"transparent",cursor:"pointer",width:"100%"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
            Add stage
          </button>

          {/* Mobile: start session button */}
          {isMobile && (
            <button onClick={onStartSession}
              style={{padding:"14px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"10px",cursor:"pointer",fontWeight:"700",fontSize:"14px",width:"100%",marginTop:"8px"}}>
              ▶ Start Session
            </button>
          )}
        </div>

        {/* CENTER COLUMN: Tabs panel (hidden on mobile) */}
        {!isMobile && (
          <div style={{flex:1,display:"flex",flexDirection:"column",borderRight:isTablet?"none":`1px solid var(--border)`,minWidth:0,overflow:"hidden"}}>
            {/* Tabs */}
            <div style={{height:"56px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"flex-end",padding:"0 22px",gap:"22px",flexShrink:0,background:"var(--card)"}}>
              {[...(FLAGS.music?["Soundtrack"]:[]),"Exercise Library","Settings"].map(tab=>(
                <button key={tab} onClick={()=>setSubTab(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")}
                  style={{paddingBottom:"14px",fontWeight:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?"700":"600",color:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?"var(--accent)":"var(--muted)",background:"none",border:"none",borderBottom:subTab===(tab==="Soundtrack"?"music":tab==="Exercise Library"?"exercises":"settings")?`2px solid var(--accent)`:"2px solid transparent",cursor:"pointer",fontSize:"14px",whiteSpace:"nowrap"}}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Soundtrack tab */}
            {subTab==="music" && (
              <div style={{flex:1,padding:"22px",display:"flex",flexDirection:"column",gap:"16px",overflowY:"auto"}}>
                {/* Match music toggle */}
                <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px",borderRadius:"12px",background:`linear-gradient(160deg,var(--navy),var(--card))`,border:`1px solid var(--accent)`}}>
                  <div style={{width:"34px",height:"34px",borderRadius:"9px",background:"rgba(123,227,164,.14)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)"}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="7" cy="18" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M9.5 18V6l11-2v10"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>Match music to structure</div>
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>BPM follows each stage's intensity</div>
                  </div>
                  <div style={{width:"38px",height:"22px",borderRadius:"11px",background:"var(--accent)",position:"relative",flexShrink:0,cursor:"pointer"}}>
                    <div style={{position:"absolute",right:"2px",top:"2px",width:"18px",height:"18px",borderRadius:"50%",background:"var(--bg)"}}/>
                  </div>
                </div>

                {/* F4: Crossfade duration */}
                <div style={{padding:"14px",borderRadius:"12px",background:"var(--card)",border:`1px solid var(--border)`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"4px"}}>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>Crossfade</div>
                    <div style={{fontSize:"12px",fontWeight:"700",color:"var(--accent)"}}>{(crossfade||0)===0?"Off":`${crossfade}s`}</div>
                  </div>
                  <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"10px"}}>Fade the soundtrack in as each stage begins</div>
                  <input type="range" min="0" max="12" step="1" value={crossfade||0} onChange={e=>onCrossfadeChange&&onCrossfadeChange(parseInt(e.target.value)||0)} style={{width:"100%",accentColor:"var(--accent)",cursor:"pointer"}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"9px",color:"var(--muted)",marginTop:"2px"}}><span>Off</span><span>6s</span><span>12s</span></div>
                </div>

                {/* Energy curve */}
                <div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                    <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:"var(--text)"}}>ENERGY CURVE</div>
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>peak intensity</div>
                  </div>
                  <div style={{position:"relative",height:"100px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",overflow:"hidden"}}>
                    <svg width="100%" height="100" viewBox="0 0 400 100" preserveAspectRatio="none" style={{display:"block"}}>
                      <defs><linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={"var(--accent)"} stopOpacity="0.4"/><stop offset="1" stopColor={"var(--accent)"} stopOpacity="0"/></linearGradient></defs>
                      <path d="M0,80 C40,72 70,60 120,54 C170,48 180,32 220,26 C260,20 280,10 320,10 C360,10 380,20 400,24 L400,100 L0,100 Z" fill="url(#eg2)"/>
                      <path d="M0,80 C40,72 70,60 120,54 C170,48 180,32 220,26 C260,20 280,10 320,10 C360,10 380,20 400,24" fill="none" stroke={"var(--accent)"} strokeWidth="2.5"/>
                    </svg>
                    {/* Stage labels */}
                    <div style={{position:"absolute",left:0,right:0,bottom:0,display:"flex",fontSize:"9px",color:"var(--muted)",textAlign:"center",borderTop:`1px solid var(--border)`}}>
                      {stages.slice(0,4).map((s,i)=>(
                        <div key={i} style={{flex:1,padding:"4px 0",borderRight:i<Math.min(stages.length,4)-1?`1px solid var(--border)`:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:i===selIdx?"var(--accent)":"var(--muted)",fontWeight:i===selIdx?"700":"400"}}>
                          {s.name.slice(0,6).toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Track list */}
                {stage && (
                  <div style={{flex:1,background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"14px",display:"flex",flexDirection:"column",minHeight:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                      <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:"var(--text)"}}>TRACKS — {stage.name.toUpperCase()}</div>
                      <div style={{fontSize:"11px",color:"var(--accent)"}}>{(stage.tracks||[]).length} tracks</div>
                    </div>
                    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"8px"}}>
                      {(stage.tracks||[]).map((t,ti)=>(
                        <div key={ti}
                          draggable onDragStart={e=>handleTrackDragStart(e,ti)} onDragOver={e=>handleTrackDragOver(e,ti)} onDrop={e=>handleTrackDrop(e,ti)} onDragEnd={handleTrackDragEnd}
                          style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"8px",background:trackDragOver===ti?"var(--navy)":"transparent",border:`1px solid ${trackDragOver===ti?"var(--border)":"transparent"}`,cursor:"grab"}}>
                          <div style={{width:"32px",height:"32px",borderRadius:"7px",background:"repeating-linear-gradient(45deg,#1b2a20,#1b2a20 4px,#22382a 4px,#22382a 8px)",flexShrink:0,overflow:"hidden"}}>
                            {t.album?.images?.[0]?.url && <img src={t.album.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
                            <div style={{fontSize:"11px",color:"var(--muted)"}}>{t.artists?.[0]?.name}{t.bpm?` · ${Math.round(t.bpm)} BPM`:""}</div>
                          </div>
                          <button onClick={()=>onRemoveTrack(selIdx,ti)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"3px",display:"flex"}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ))}
                      {(stage.tracks||[]).length === 0 && (
                        <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"20px 0"}}>No tracks yet — use DJ This Class or add manually</div>
                      )}
                    </div>
                    <button onClick={()=>setShowPlaylistModal(true)}
                      style={{marginTop:"10px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontWeight:"600",fontSize:"13px",padding:"10px",borderRadius:"9px",cursor:"pointer"}}>
                      + Add tracks
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Exercise Library tab */}
            {subTab==="exercises" && (
              <div style={{flex:1,overflowY:"auto"}}>
                <LibraryBrowserModal onClose={()=>setSubTab(FLAGS.music?"music":"settings")} onAddExercise={handleAddLibraryExercise}/>
              </div>
            )}

            {/* Settings tab */}
            {subTab==="settings" && stage && (
              <div style={{flex:1,padding:"22px",display:"flex",flexDirection:"column",gap:"16px",overflowY:"auto"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>{stage.name} — Settings</div>
                <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                  <div>
                    <label style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage name</label>
                    <input value={stage.name} onChange={e=>onStageChange(selIdx,{...stage,name:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Duration (minutes)</label>
                    <input type="number" min="1" max="60" value={Math.round(stage.dur/60)}
                      onChange={e=>onStageChange(selIdx,{...stage,dur:parseInt(e.target.value||"1")*60})}
                      style={{width:"100%",padding:"8px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage type</label>
                    <select value={stage.type} onChange={e=>onStageChange(selIdx,{...stage,type:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"13px",marginTop:"5px",outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
                      {Object.entries(SCFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RIGHT COLUMN: Auto-DJ panel (desktop only, non-tablet).
            Quarantined — with music off the Builder is two columns, which is
            also what makes it stack cleanly on a phone (audit 2.1 + 1.1). */}
        {FLAGS.music && !isMobile && !isTablet && (
          <AutoDjPanel stages={stages} onDjClass={onDjClass} djProgress={djProgress}/>
        )}
      </div>

      {/* Modals */}
      {showPlaylistModal && (
        <SpotifySearchModal
          onClose={()=>setShowPlaylistModal(false)}
          onSelectTrack={t=>{ onAddTrack(selIdx, t); setShowPlaylistModal(false); }}
        />
      )}
      {showSmart && (
        <div onClick={()=>setShowSmart(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"22px",width:"min(480px,100%)",boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)"}}>Build a class</div>
              <button onClick={()=>setShowSmart(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><X size={18}/></button>
            </div>
            <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"8px"}}>Describe it and Jungle builds the stages + exercises:</div>
            <div style={{display:"flex",gap:"8px",marginBottom:"18px"}}>
              <input autoFocus value={smartPrompt} onChange={e=>setSmartPrompt(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ runSmartBuild(); } }} placeholder="e.g. 45 min HIIT with a strength finisher" style={{flex:1,minWidth:0,padding:"10px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
              <button onClick={()=>{ runSmartBuild(); }} style={{padding:"10px 16px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px",whiteSpace:"nowrap",opacity:smartBusy?0.6:1}} disabled={smartBusy}>{smartBusy?"Building\u2026":"Build"}</button>
            </div>
            <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Or insert a template</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",maxHeight:"240px",overflowY:"auto"}}>
              {Object.entries(WORKOUT_LIBRARY).map(([k,cls])=>(
                <button key={k} onClick={()=>{ const sub=Object.keys(cls.subTypes||{})[0]||null; applyTemplate(k,sub); setShowSmart(false); }} style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:"18px"}}>{cls.icon}</span><span style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{cls.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showLibraryModal && <LibraryBrowserModal onClose={()=>setShowLibraryModal(false)} onAddExercise={handleAddLibraryExercise}/>}
      {FLAGS.music && showDjModal && (
        <DjPlaylistModal
          stages={stages}
          onDjClass={onDjClass}
          djProgress={djProgress}
          onClose={()=>setShowDjModal(false)}
        />
      )}
    </div>
  );
}

// ─── LiveScreen ───────────────────────────────────────────────────────────────
// Honours the OS "reduce motion" setting on the room-facing displays (Fable §3).
// Read at render, matching FloorLiveScreen's existing guard; callers gate any
// looping scale/opacity animation on !reduce so the colour cue still lands.
const prefersReducedMotion = () => (typeof window!=="undefined" && window.matchMedia) ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
// ─── Room TV (workstreams B+C) ────────────────────────────────────────────────
// ONE fullscreen TV surface with three modes, replacing the separate Studio TV /
// Floor TV / coach-Display views: "studio" = pre-class plan overview, "floor" =
// whole-class live board, "coach" = the in-runner coach display. Fable P1/P2:
// the mode switch is a transient overlay (the running surface keeps the whole
// screen) with buttons sized for an across-the-room tap.
function RoomTV({ mode, onMode, onExit, stages, sessionName, liveState, nowPlaying, player, deviceId, spPaused, onPlayPause, canFollow, follow, onFollow, remote }) {
  const reduce = prefersReducedMotion();
  const [ctl, setCtl] = useState(true);
  useEffect(() => {
    if (!ctl) return;
    const t = setTimeout(() => setCtl(false), 4500);
    return () => clearTimeout(t);
  }, [ctl, mode]);
  const wake = () => setCtl(true);
  // Follow mode: mirror the active runner's broadcast instead of local state.
  // A broadcast is live if it arrived within the last 10s (the runner sends 1/s).
  const remoteLive = follow && remote && (Date.now() - (remote.at || 0) < 10_000);
  const S  = remoteLive ? (remote.stages || [])  : stages;
  const SN = remoteLive ? (remote.sessionName || "Class") : sessionName;
  const LS = remoteLive ? (remote.liveState || {playing:false,idx:0,elapsed:0}) : liveState;
  const NP = remoteLive ? remote.nowPlaying : nowPlaying;
  return (
    <div onMouseMove={wake} onTouchStart={wake} style={{position:"relative",flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {mode==="studio" && <OverviewDisplayScreen stages={S} sessionName={SN} liveState={LS} onBack={onExit}/>}
      {mode==="floor"  && <FloorLiveScreen stages={S} liveState={LS} nowPlaying={NP} onBack={onExit}/>}
      {mode==="coach"  && <DisplayScreen stages={S} liveState={LS} onBack={onExit} player={player} deviceId={deviceId} spPaused={spPaused} nowPlaying={NP} onPlayPause={onPlayPause}/>}
      {follow && !remoteLive && (
        <div style={{position:"absolute",bottom:"18px",left:"50%",transform:"translateX(-50%)",zIndex:80,padding:"10px 18px",borderRadius:"10px",background:"rgba(10,14,20,0.72)",border:"1px solid rgba(255,255,255,0.18)",color:"rgba(255,255,255,0.85)",fontSize:"14px",fontWeight:"700"}}>
          Following this room — waiting for the coach's runner to start…
        </div>
      )}
      {ctl && (
        <div style={{position:"absolute",top:"16px",left:"50%",transform:"translateX(-50%)",zIndex:80,display:"flex",gap:"8px",alignItems:"center",background:"rgba(10,14,20,0.72)",backdropFilter:"blur(10px)",padding:"8px 10px",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.18)"}}>
          {[["studio","Plan"],["floor","Floor"],["coach","Coach"]].map(([m,lbl]) => (
            <button key={m} onClick={()=>onMode(m)} style={{padding:"10px 20px",borderRadius:"10px",border:"none",cursor:"pointer",fontSize:"15px",fontWeight:"800",letterSpacing:"0.5px",background:mode===m?"var(--accent)":"transparent",color:mode===m?"var(--on-accent)":"rgba(255,255,255,0.85)"}}>{lbl}</button>
          ))}
          {canFollow && (
            <button onClick={()=>onFollow(!follow)} title="Mirror the runner playing on another device"
              style={{padding:"10px 16px",borderRadius:"10px",border:`1px solid ${follow?"var(--accent)":"rgba(255,255,255,0.25)"}`,cursor:"pointer",fontSize:"14px",fontWeight:"700",background:follow?"color-mix(in srgb, var(--accent) 25%, transparent)":"transparent",color:follow?"var(--accent)":"rgba(255,255,255,0.85)",display:"inline-flex",alignItems:"center",gap:"7px"}}>
              <span style={{width:"9px",height:"9px",borderRadius:"50%",background:remoteLive?"#22C55E":(follow?"#F59E0B":"rgba(255,255,255,0.4)"),display:"inline-block"}}/>
              Follow
            </button>
          )}
          <button onClick={onExit} style={{padding:"10px 16px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.25)",cursor:"pointer",fontSize:"14px",fontWeight:"700",background:"transparent",color:"rgba(255,255,255,0.85)"}}>Exit</button>
        </div>
      )}
    </div>
  );
}

// ─── F4 / N1 — coach roster sweep ───────────────────────────────────────────
// The attendance spine's first capture surface. Design law P6: check-in must cost
// under 5 seconds per member, because above that coaches skip it, no attendance
// accumulates, and the whole retention thesis starves (assumption A7 / kill
// criterion #3). Everything here serves that number: one tap to check someone in,
// a filter box that doubles as the quick-add field, and no form.
//
// NOTE ON CONSENT — deliberate omission. A consent_records row with
// method:'notice' asserts that a notice was shown to that member. In a coach
// sweep, none was. Writing one anyway would fabricate a compliance record, which
// is worse than an empty ledger. store.recordConsent() exists and is wired for
// when a real notice surface ships (QR self-check-in's first screen); it is not
// called from here on purpose.
function CheckInPanel({ sessionName, classType, onClose }) {
  // Idempotent by design, so React 19 StrictMode's double-invoke of this
  // initializer resolves to the SAME occurrence rather than minting two.
  const [ci] = useState(() => store.ensureClassInstance({ name: sessionName, classType }).instance);
  const [members, setMembers]       = useState(() => store.getMembers());
  const [attendance, setAttendance] = useState(() => store.getAttendance());
  const [q, setQ] = useState("");

  // P6 instrumentation (I4). The spec makes ≤5s/member a design law and A7 a kill
  // criterion, and neither was measurable — the product could fail its own kill
  // criterion silently. Refs, not state: recording a timestamp must not re-render
  // the panel a coach is tapping through mid-class.
  const openedAt = useRef(Date.now());
  const stamps   = useRef([]);
  useEffect(() => {
    const opened = openedAt.current, marks = stamps.current;
    // On unmount, not per check-in: one row per class, and no write in the tap path.
    return () => { recordCheckinSession({ classInstanceId: ci.id, openedAt: opened, stamps: marks }); };
  }, [ci.id]);

  const checkedIn = new Set(attendance.filter(a => a.classInstanceId === ci.id).map(a => a.memberId));
  const term  = q.trim().toLowerCase();
  const shown = members.filter(m => !term || (m.name || "").toLowerCase().includes(term));
  // Offer quick-add only when what's typed isn't already somebody — otherwise the
  // coach creates a duplicate roster row for a member who's simply mis-spelled.
  const canAdd = !!term && !members.some(m => (m.name || "").trim().toLowerCase() === term);

  // Only stamp when a check-in was ACTUALLY added. A double-tap on an
  // already-checked-in member returns added:false, and counting it would inflate
  // the member count with a zero-second gap — flattering the P6 number with work
  // that never happened.
  const check = (m) => {
    const r = store.recordAttendance({ classInstanceId: ci.id, memberId: m.id, source: "coach" });
    if (r.added) stamps.current.push(Date.now());
    setAttendance(r.attendance);
  };

  const quickAdd = () => {
    const name = q.trim();
    if (!name) return;
    const { member, members: next } = store.addMember(name);
    setMembers(next);
    const r = store.recordAttendance({ classInstanceId: ci.id, memberId: member.id, source: "coach" });
    if (r.added) stamps.current.push(Date.now());
    setAttendance(r.attendance);
    setQ("");
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",border:`1px solid var(--border)`,borderRadius:"14px",width:"100%",maxWidth:"460px",maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"16px 18px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
            <div>
              <div style={{fontFamily:"var(--display)",fontSize:"17px",fontWeight:"700",color:"var(--text)"}}>Check in</div>
              <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>{sessionName || "Class"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"22px",fontWeight:"800",color:"var(--accent)"}}>{checkedIn.size}</div>
              <div style={{fontSize:"10px",color:"var(--muted)",letterSpacing:"1px",fontWeight:"600"}}>IN ROOM</div>
            </div>
          </div>
          <input
            autoFocus value={q} onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{ if (e.key==="Enter" && canAdd) quickAdd(); }}
            placeholder="Search or type a new name…"
            style={{width:"100%",marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"14px",outline:"none"}}
          />
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {canAdd && (
            <button onClick={quickAdd} style={{width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"13px 12px",marginBottom:"4px",borderRadius:"9px",border:`1px dashed var(--accent)`,background:"transparent",cursor:"pointer",textAlign:"left"}}>
              <Plus size={16} color="var(--accent)"/>
              <span style={{fontSize:"14px",fontWeight:"600",color:"var(--accent)"}}>Add “{q.trim()}” and check in</span>
            </button>
          )}
          {shown.map(m => {
            const inRoom = checkedIn.has(m.id);
            return (
              // 46px tall: a thumb target a coach can hit without looking. P6.
              <button key={m.id} onClick={()=>check(m)} disabled={inRoom}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px",padding:"13px 12px",marginBottom:"4px",borderRadius:"9px",border:`1px solid ${inRoom?"var(--accent)":"var(--border)"}`,background:inRoom?"color-mix(in srgb, var(--accent) 12%, transparent)":"transparent",cursor:inRoom?"default":"pointer",textAlign:"left"}}>
                <span style={{fontSize:"14px",fontWeight:"600",color:"var(--text)"}}>{m.name}</span>
                {inRoom
                  ? <Check size={16} color="var(--accent)"/>
                  : <span style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600"}}>Tap</span>}
              </button>
            );
          })}
          {!shown.length && !canAdd && (
            <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"24px 12px",lineHeight:"1.6"}}>
              {members.length
                ? "No one matches that name."
                : "No members yet — type a name above to add the first one as they walk in."}
            </p>
          )}
        </div>

        <div style={{padding:"12px 18px",borderTop:`1px solid var(--border)`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
          <span style={{fontSize:"11px",color:"var(--muted)"}}>Saved on this device, synced when online</span>
          <Btn variant="ghost" onClick={onClose} style={{padding:"7px 14px"}}>Done</Btn>
        </div>
      </div>
    </div>
  );
}

function LiveScreen({stages, onBack, liveState, onPlayPause, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices, spPaused, nowPlaying, onDisplayMode, onNextStage, onSkipTimer, onAddTrack, sessionName, classType}) {
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
  // Fable §3: the mic button's looping jg-pulse is suppressed under reduced-motion,
  // same as the room displays. This MUST be declared here — the mic button reads it
  // and `micMode && !reduce` only short-circuits while mic mode is OFF, so a missing
  // binding crashed the runner the instant a coach armed the mic.
  const reduce = prefersReducedMotion();

  // F4 roster sweep. The count is re-derived when the panel closes, so the header
  // badge stays honest without the runner subscribing to storage on every tick.
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const closeCheckIn = () => {
    setShowCheckIn(false);
    const ci = store.getClassInstances().slice(-1)[0];
    setCheckedInCount(ci ? store.getAttendance().filter(a => a.classInstanceId === ci.id).length : 0);
  };

  // Feature 7: on-the-fly search overlay
  const [showLiveSearch, setShowLiveSearch] = useState(false);
  const [liveSearchStageIdx, setLiveSearchStageIdx] = useState(liveState.idx);

  // F3: Mic Mode - auto-duck the music while the instructor is speaking (Web Audio mic detection).
  const NORMAL_VOL = 0.8;
  const DUCKED_VOL = 0.2;
  const [micMode, setMicMode] = useState(false);    // armed
  const [micActive, setMicActive] = useState(false); // currently ducking (speech detected)
  const handleMicMode = () => setMicMode(m => !m);
  useEffect(() => {
    if (!micMode) { if (player) player.setVolume(NORMAL_VOL).catch(()=>{}); return; }
    let cancelled=false, stream, ctx, raf, analyser, ducked=false, quiet=0;
    const THRESH=0.055, RELEASE=18;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
    navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } }).then(strm => {
      if (cancelled) { strm.getTracks().forEach(t=>t.stop()); return; }
      stream=strm;
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      analyser=ctx.createAnalyser(); analyser.fftSize=512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf=new Uint8Array(analyser.frequencyBinCount);
      const loop=()=>{
        if (cancelled) return;
        analyser.getByteFrequencyData(buf);
        let sum=0; for (let k=0;k<buf.length;k++){ const v=buf[k]/255; sum+=v*v; }
        const rms=Math.sqrt(sum/buf.length);
        if (rms>THRESH){ quiet=0; if(!ducked){ ducked=true; setMicActive(true); if(player) player.setVolume(DUCKED_VOL).catch(()=>{}); } }
        else if (ducked){ quiet++; if(quiet>RELEASE){ ducked=false; setMicActive(false); if(player) player.setVolume(NORMAL_VOL).catch(()=>{}); } }
        raf=requestAnimationFrame(loop);
      };
      loop();
    }).catch(()=>{});
    return () => {
      cancelled=true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t=>t.stop());
      if (ctx && ctx.state!=="closed") ctx.close().catch(()=>{});
      setMicActive(false);
      if (player) player.setVolume(NORMAL_VOL).catch(()=>{});
    };
  }, [micMode, player]);

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
  const timerColor = ratio > 0.5 ? cfg.color : ratio > 0.25 ? "#F59E0B" : "var(--accent)";
  const isPulsing = remaining <= 10 && remaining > 0 && liveState.playing;
  const hasNoTracks = !stage?.tracks?.length;

  // Use activeDeviceId for playback; fall back to browser SDK device
  const playDeviceId = activeDeviceId || deviceId;

  // Helper: play on the active device. If it's an external device, use REST API directly
  const playOnDevice = (uris) => {
    if (!uris.length) return;
    if (playDeviceId === deviceId && player) {
      // Browser SDK device — use REST API to start (handles track queue properly)
      apiPlay(playDeviceId, uris).catch(()=>{});
    } else if (playDeviceId) {
      // External device (desktop app, phone, etc.) — pure REST
      apiPlay(playDeviceId, uris).catch(()=>{});
    }
  };

  const pauseDevice = () => {
    if (playDeviceId === deviceId && player) {
      player.pause().catch(()=>{});
    } else if (playDeviceId) {
      fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${playDeviceId}`, {
        method:"PUT", headers:{ Authorization:`Bearer ${localStorage.getItem("sp_at")||""}` }
      }).catch(()=>{});
    }
  };

  const resumeDevice = () => {
    if (playDeviceId === deviceId && player) {
      player.resume().catch(()=>{});
    } else if (playDeviceId) {
      fetch(`https://api.spotify.com/v1/me/player/play?device_id=${playDeviceId}`, {
        method:"PUT", headers:{ Authorization:`Bearer ${localStorage.getItem("sp_at")||""}` }
      }).catch(()=>{});
    }
  };

  const handlePlayPause = () => {
    const willPlay = !liveState.playing;
    onPlayPause();
    if (!playDeviceId) return;
    if (willPlay) {
      const uris = stage?.tracks?.map(t=>t.uri).filter(Boolean)||[];
      if (uris.length) {
        const currentUri = nowPlaying?.uri;
        const isStageTrackPlaying = currentUri && uris.includes(currentUri);
        if (isStageTrackPlaying) {
          resumeDevice();
        } else {
          playOnDevice(uris);
        }
      } else {
        resumeDevice();
      }
    } else {
      pauseDevice();
    }
  };

  // Auto-play/pause when stage advances
  useEffect(() => {
    const uris = stage?.tracks?.map(t=>t.uri).filter(Boolean)||[];
    if (!playDeviceId || !liveState.playing) return;
    if (uris.length) {
      const currentUri = nowPlaying?.uri;
      const isAlreadyPlayingStageTrack = currentUri && uris.includes(currentUri);
      if (!isAlreadyPlayingStageTrack) {
        playOnDevice(uris);
      }
    } else {
      pauseDevice();
    }
  }, [liveState.idx]);

  // Pause Spotify when navigating away — but NOT when going to Display Mode
  const goingToDisplayRef = useRef(false);
  const handleDisplayMode = () => { goingToDisplayRef.current = true; onDisplayMode(); };
  useEffect(() => {
    return () => {
      if (!goingToDisplayRef.current) pauseDevice();
      goingToDisplayRef.current = false;
    };
  }, [player, playDeviceId]);

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
        border: isMobile?"none":`1px solid var(--border)`,
        boxShadow: isMobile?"none":"0 30px 80px rgba(0,0,0,.5)",
        display:"flex", flexDirection:"column",
        minHeight: isMobile?"100vh":"auto",
      }}>
        {/* Inner screen */}
        <div style={{
          borderRadius: isMobile?"0":"22px",
          background: "var(--bg)",
          overflow:"hidden",
          display:"flex", flexDirection:"column",
          flex:1,
        }}>
          {showCheckIn && (
            <CheckInPanel sessionName={sessionName || "Class"} classType={classType || ""} onClose={closeCheckIn}/>
          )}
          {/* HEADER */}
          <div style={{height:"64px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <div>
                <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--text)"}}>{stage?.name||"Session"}</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>
                  {stages.length} stages · {fmt(totalDur)} total
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              {/* F4 roster sweep — the attendance spine's capture surface */}
              <button onClick={()=>setShowCheckIn(true)} title="Check in members"
                style={{display:"flex",alignItems:"center",gap:"6px",padding:"7px 12px",borderRadius:"8px",border:`1px solid ${checkedInCount?"var(--accent)":"var(--border)"}`,background:"transparent",cursor:"pointer",color:checkedInCount?"var(--accent)":"var(--muted)",fontSize:"12px",fontWeight:"700",flexShrink:0}}>
                <Users size={14}/>{checkedInCount ? ` ${checkedInCount}` : " Check in"}
              </button>
              {/* Spotify device picker */}
              {FLAGS.music && <SpotifyDevicePicker
                devices={devices}
                activeDeviceId={activeDeviceId}
                setActiveDeviceId={setActiveDeviceId}
                browserDeviceId={deviceId}
                refreshDevices={refreshDevices}
                compact={isMobile}
              />}
              {/* ELAPSED */}
              <div style={{textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:"10px",letterSpacing:"1.5px",color:"var(--muted)",fontWeight:"600"}}>ELAPSED</div>
                <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--text)"}}>{fmt(liveState.elapsed)}</div>
              </div>
              {/* ROUND */}
              <div style={{textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:"10px",letterSpacing:"1.5px",color:"var(--muted)",fontWeight:"600"}}>STAGE</div>
                <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--text)"}}>
                  <span style={{color:"var(--accent)"}}>{liveState.idx+1}</span>/{stages.length}
                </div>
              </div>
            </div>
          </div>

          {/* BODY */}
          <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",minHeight:0,overflow:"hidden"}}>
            {/* MAIN CONTROL: big stage display */}
            <div style={{flex:1.7,display:"flex",flexDirection:"column",borderRight:isMobile?"none":`1px solid var(--border)`,minWidth:0}}>
              {/* Stage type + name */}
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"6px",padding:"24px",position:"relative"}}>
                {/* WORK/REST phase label */}
                <div style={{position:"absolute",top:"20px",left:"50%",transform:"translateX(-50%)",fontSize:"12px",letterSpacing:"5px",color:cfg.color,fontWeight:"700"}}>
                  {cfg.label.toUpperCase()}
                </div>

                {/* Big timer */}
                <div style={{fontFamily:"var(--display)",fontSize:isMobile?"80px":"120px",fontWeight:"700",lineHeight:"1",letterSpacing:"-3px",color:cfg.color,textShadow:`0 0 60px ${cfg.color}40`}}>
                  {fmt(remaining)}
                </div>

                {/* Stage name */}
                <div style={{fontFamily:"var(--display)",fontSize:isMobile?"22px":"28px",fontWeight:"700",color:"var(--text)",textAlign:"center",marginTop:"4px"}}>
                  {stage?.name||"Complete"}
                </div>
                {stage?.exercises?.[0] && (
                  <div style={{fontSize:"15px",color:"var(--muted)"}}>{stage.exercises[0].n}{stage.exercises[0].r?` · ${stage.exercises[0].s||""}×${stage.exercises[0].r}`:""}</div>
                )}

                {/* Skip timer controls */}
                <div style={{display:"flex",gap:"8px",alignItems:"center",marginTop:"12px"}}>
                  {[-30,-10,10,30].map(s=>(
                    <button key={s} onClick={()=>onSkipTimer(s)}
                      style={{padding:isMobile?"10px 14px":"7px 12px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"700",minHeight:"40px"}}>
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
                        <span style={{fontSize:"11px",color:"var(--muted)"}}>{ivState.exName}</span>
                      </div>
                      <p style={{fontSize:"40px",fontWeight:"900",color:ivColor,lineHeight:"1",margin:"0 0 3px"}}>{fmtSec(ivState.phaseRemaining)}</p>
                      <p style={{fontSize:"11px",color:"var(--muted)"}}>Round {ivState.round} of {ivState.totalRounds}</p>
                    </div>
                  );
                })()}
              </div>

              {/* TRANSPORT controls */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:isMobile?"16px":"18px",padding:"0 24px 20px",flexShrink:0}}>
                {/* Prev stage */}
                {liveState.idx > 0 && (
                  <button onClick={onNextStage} style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={"var(--text)"}><path d="M11 19V5l-8 7 8 7Zm9 0V5l-8 7 8 7Z"/></svg>
                  </button>
                )}
                {/* Skip back track */}
                <button onClick={()=>player?.previousTrack()} style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                  <SkipBack size={20}/>
                </button>
                {/* Play/Pause — large accent button */}
                <button onClick={handlePlayPause} style={{width:isMobile?"76px":"84px",height:isMobile?"76px":"84px",borderRadius:"50%",background:"var(--accent)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:`0 0 40px color-mix(in srgb, var(--accent) 25%, transparent)`,flexShrink:0}}>
                  {liveState.playing
                    ? <svg width="30" height="30" viewBox="0 0 24 24" fill={"var(--bg)"}><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                    : <svg width="30" height="30" viewBox="0 0 24 24" fill={"var(--bg)"}><path d="M8 5l11 7-11 7V5z"/></svg>
                  }
                </button>
                {/* Skip forward track */}
                <button onClick={()=>player?.nextTrack()} style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                  <SkipForward size={20}/>
                </button>
                {/* Next stage */}
                {liveState.idx < stages.length - 1 && (
                  <button onClick={onNextStage} style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={"var(--text)"}><path d="M13 5v14l8-7-8-7ZM4 5v14l8-7L4 5Z"/></svg>
                  </button>
                )}
                {/* Mic mode */}
                {player && (
                  <button onClick={handleMicMode} title={micMode ? (micActive ? "Ducking - mic live" : "Mic Mode armed (M)") : "Mic Mode (M)"}
                    style={{width:"44px",height:"44px",borderRadius:"50%",border:`1px solid ${micMode?"#EF4444":"#EF444440"}`,background:micMode?"#EF444420":"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:micMode?"#EF4444":"var(--muted)",animation:(micMode&&!reduce)?"jg-pulse 1s ease-in-out infinite":"none"}}>
                    <Mic size={16}/>
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div style={{height:"4px",background:"var(--navy)",flexShrink:0,position:"relative"}}>
                <div style={{position:"absolute",left:0,top:0,bottom:0,background:cfg.color,width:`${progress*100}%`,transition:"width 0.8s linear",borderRadius:"0 2px 2px 0"}}/>
              </div>
            </div>

            {/* SIDE: Up Next + Music */}
            {!isMobile && (
              <div style={{width:"380px",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
                {/* UP NEXT */}
                <div style={{flex:1,padding:"18px 20px",display:"flex",flexDirection:"column",gap:"10px",overflow:"hidden",borderBottom:`1px solid var(--border)`}}>
                  <div style={{fontSize:"12px",fontWeight:"700",letterSpacing:"0.5px",color:"var(--muted)"}}>UP NEXT</div>
                  {stages.slice(liveState.idx+1, liveState.idx+4).map((s,i)=>{
                    const sCfg = SCFG[s.type]||SCFG.circuit;
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 13px",borderRadius:"11px",background:i===0?"var(--card)":"var(--navy)",border:`1px solid ${i===0?"var(--border)":"var(--border)"}`}}>
                        <span style={{fontSize:"11px",fontWeight:"700",color:sCfg.color,background:`${sCfg.color}18`,padding:"3px 8px",borderRadius:"5px",flexShrink:0}}>{sCfg.label}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"14px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                          <div style={{fontSize:"11px",color:"var(--muted)"}}>{fmt(s.dur)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {stages.slice(liveState.idx+1).length === 0 && (
                    <div style={{fontSize:"12px",color:"var(--muted)",padding:"10px 0"}}>Last stage — session ending soon</div>
                  )}
                </div>

                {/* MUSIC panel. Gated on the flag rather than on `nowPlaying`,
                    because the null branch printed "No music playing" into the
                    coach's runner for the whole class — a permanent status line
                    about a feature the product no longer has (audit 2.1). */}
                {FLAGS.music && <div style={{padding:"16px 20px",background:"var(--card)",flexShrink:0}}>
                  {nowPlaying ? (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
                        <div style={{width:"46px",height:"46px",borderRadius:"9px",background:"repeating-linear-gradient(45deg,#1b2a20,#1b2a20 5px,#22382a 5px,#22382a 10px)",flexShrink:0,overflow:"hidden"}}>
                          {nowPlaying.album?.images?.[0]?.url && <img src={nowPlaying.album.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nowPlaying.name}</div>
                          <div style={{fontSize:"11px",color:"var(--muted)"}}>{nowPlaying.artists?.[0]?.name} · now playing</div>
                        </div>
                        {nowPlaying.bpm && <div style={{textAlign:"center",flexShrink:0}}>
                          <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--accent)"}}>{Math.round(nowPlaying.bpm)}</div>
                          <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"1px"}}>BPM</div>
                        </div>}
                      </div>
                      <div style={{display:"flex",gap:"8px"}}>
                        <button onClick={()=>player?.previousTrack()} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:"var(--navy)",border:`1px solid var(--border)`,fontSize:"12px",fontWeight:"600",color:"var(--text)",cursor:"pointer"}}>
                          <SkipBack size={13}/> Prev
                        </button>
                        <button onClick={handleMicMode} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:micMode?"#EF444420":"var(--navy)",border:`1px solid ${micMode?"#EF4444":"#EF444440"}`,fontSize:"12px",fontWeight:"600",color:micMode?"#EF4444":"var(--muted)",cursor:"pointer"}}>
                          <Mic size={13}/> Mic {micMode?"ON":"Mode"}
                        </button>
                        <button onClick={()=>player?.nextTrack()} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",padding:"10px",borderRadius:"9px",background:"var(--navy)",border:`1px solid var(--border)`,fontSize:"12px",fontWeight:"600",color:"var(--text)",cursor:"pointer"}}>
                          <SkipForward size={13}/> Next
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"8px 0"}}>No music playing</div>
                  )}
                </div>}
              </div>
            )}
          </div>

          {/* Mobile: compact music strip */}
          {isMobile && nowPlaying && (
            <div style={{flexShrink:0,borderTop:`1px solid var(--border)`,background:"var(--card)",padding:"10px 14px",display:"flex",alignItems:"center",gap:"10px"}}>
              {nowPlaying.album?.images?.[0]?.url && (
                <img src={nowPlaying.album.images[0].url} style={{width:"40px",height:"40px",borderRadius:"6px",objectFit:"cover",flexShrink:0}} alt="album"/>
              )}
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:"12px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.name}</p>
                <p style={{fontSize:"10px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.artists?.[0]?.name}</p>
              </div>
              <button onClick={handleMicMode} style={{background:"none",border:"none",cursor:"pointer",color:micMode?"#EF4444":"var(--muted)",padding:"6px",display:"flex"}}>
                <Mic size={18}/>
              </button>
              <button onClick={handleDisplayMode} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"6px",display:"flex"}}>
                <Monitor size={18}/>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live search overlay */}
      {showLiveSearch && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div style={{background:"var(--card)",borderRadius:"16px",padding:"24px",width:"100%",maxWidth:"480px",border:`1px solid var(--border)`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text)"}}>Add track to stage</div>
              <button onClick={()=>setShowLiveSearch(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex"}}>
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
function OverviewDisplayScreen({ stages, sessionName, onBack, liveState }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const totalDur    = stages.reduce((a,s)=>a+s.dur,0);
  const totalTracks = stages.reduce((a,s)=>a+(s.tracks||[]).length, 0);
  const totalExs    = stages.reduce((a,s)=>a+(s.exercises||[]).length, 0);
  // Live current-stage highlight (P1 "now over next"): only when a class is actually
  // running — a static Builder "Preview on TV" must not falsely light up stage 0.
  const curIdx = liveState?.playing ? liveState.idx : -1;
  const isLive = curIdx >= 0;

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
        <div style={{flex:1,background:`radial-gradient(120% 90% at 50% 0%,rgba(123,227,164,.06),transparent),var(--bg)`,borderRadius:isMobile?"0":"10px",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Header row */}
          <div style={{
            flexShrink:0,padding:isMobile?"16px":"22px 26px",
            borderBottom:`1px solid var(--border)`,
            display:"flex",alignItems:isMobile?"flex-start":"center",
            justifyContent:"space-between",flexDirection:isMobile?"column":"row",gap:"12px"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <button onClick={onBack} style={{
                display:"flex",alignItems:"center",gap:"6px",padding:"7px 13px",
                background:"transparent",border:`1px solid var(--border)`,borderRadius:"8px",
                cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",flexShrink:0
              }}>← {!isMobile && <span style={{opacity:0.5,fontSize:"10px"}}>Esc</span>}</button>
              <div>
                <p style={{fontSize:isMobile?"18px":"26px",fontWeight:"700",color:"var(--text)",lineHeight:1,marginBottom:"4px",fontFamily:"var(--display)"}}>
                  {sessionName||"Class Plan Overview"}
                </p>
                {/* "0 tracks" was printed here on the room's TV before a class,
                    in front of members, every time (audit 2.1 / UI-UX §1). */}
                <p style={{fontSize:"12px",color:"var(--muted)"}}>
                  {stages.length} stages · {fmtDur(totalDur)}{FLAGS.music ? ` · ${totalTracks} tracks` : ""} · {totalExs} exercises
                  {isLive && <span style={{color:"var(--accent)",fontWeight:"800"}}> · ● Stage {curIdx+1}/{stages.length}</span>}
                </p>
              </div>
            </div>

            {/* Per-stage duration chips */}
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {stages.map((s,si)=>{
                const cfg = SCFG[s.type]||SCFG.circuit;
                const chipCur = si===curIdx;
                return (
                  <div key={s.id} style={{
                    display:"flex",alignItems:"center",gap:"5px",
                    padding:"5px 10px",
                    background:chipCur?"var(--accent)":`${cfg.color}18`,
                    borderRadius:"999px",
                    border:`1px solid ${chipCur?"var(--accent)":cfg.color+"40"}`
                  }}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:chipCur?"var(--on-accent)":cfg.color}}/>
                    <span style={{fontSize:"11px",fontWeight:"700",color:chipCur?"var(--on-accent)":cfg.color}}>{fmtDur(s.dur)}</span>
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
                const isCur   = si===curIdx;                            // running now
                const isPast  = isLive && si<curIdx;                    // already done
                const isPeak  = si===peakIdx && stages.length>1 && !isLive; // planning cue only when idle
                const firstTrack = trList[0];

                return (
                  <div key={s.id} style={{
                    borderRadius:"14px",overflow:"hidden",display:"flex",flexDirection:"column",
                    opacity:isPast?0.4:1,
                    transition:"opacity .3s ease, box-shadow .3s ease",
                    border:isCur?`3px solid var(--accent)`:isPeak?`2px solid ${cfg.color}`:`2px solid ${cfg.color}40`,
                    background:isCur?`linear-gradient(160deg,color-mix(in srgb,var(--accent) 12%,var(--card)),var(--card))`:isPeak?`linear-gradient(160deg,var(--navy),var(--card))`:`var(--card)`,
                    boxShadow:isCur?`0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent),0 10px 40px color-mix(in srgb,var(--accent) 25%,transparent)`:isPeak?`0 0 0 3px ${cfg.color}18`:"none"
                  }}>

                    {/* Colored header band */}
                    <div style={{background:isCur?`color-mix(in srgb,var(--accent) 22%,transparent)`:`${cfg.color}${isPeak?"28":"18"}`,padding:"14px 18px"}}>
                      {/* Stage label */}
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"8px"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
                        <span style={{fontSize:"10px",fontWeight:"800",color:cfg.color,
                          textTransform:"uppercase",letterSpacing:"1px"}}>
                          {cfg.label}{isPeak?" · PEAK":""}
                        </span>
                        {isCur && <span style={{marginLeft:"auto",fontSize:"11px",fontWeight:"900",letterSpacing:"1px",color:"var(--on-accent)",background:"var(--accent)",padding:"2px 9px",borderRadius:"999px"}}>NOW</span>}
                      </div>
                      {/* Stage name */}
                      <p style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",lineHeight:1.2,marginBottom:"6px",fontFamily:"var(--display)"}}>{s.name}</p>
                      {/* Duration + BPM. The BPM range is a music-matching target;
                          with no music to match it is noise on a member-facing
                          card. TempoGuide is the survivor of the BPM UI — it needs
                          no licence and earns its place on the live display. */}
                      <p style={{fontSize:"12px",color:"var(--muted)",fontWeight:"600"}}>
                        {fmtDur(s.dur)}{FLAGS.music && cfg.bpmMin ? ` · ${cfg.bpmMin}–${cfg.bpmMax} BPM` : ""}
                      </p>
                    </div>

                    {/* Body */}
                    <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column",gap:"7px"}}>
                      {exList.length===0 && trList.length===0 && grpList.length===0 && (
                        <p style={{fontSize:"11px",color:"var(--muted)",fontStyle:"italic"}}>No content added yet</p>
                      )}

                      {/* Exercises */}
                      {exList.map((ex,ei)=>(
                        <div key={ei} style={{
                          paddingLeft:"10px",borderLeft:`3px solid ${cfg.color}`,
                          marginBottom:"4px"
                        }}>
                          <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",lineHeight:1.2,marginBottom:"2px"}}>{ex.n}</p>
                          <p style={{fontSize:"11px",color:"var(--muted)"}}>
                            {[ex.s&&`${ex.s}×`,ex.r,ex.rest&&`· ${ex.rest} rest`].filter(Boolean).join(" ")||"—"}
                          </p>
                        </div>
                      ))}

                      {/* Groups */}
                      {grpList.map((g,gi)=>(
                        <div key={g.id} style={{display:"flex",alignItems:"center",gap:"7px"}}>
                          <div style={{width:"8px",height:"8px",borderRadius:"50%",flexShrink:0,background:grpColor(g.id)}}/>
                          <p style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</p>
                        </div>
                      ))}
                    </div>

                    {/* Music footer. This is a MEMBER-FACING surface: with music
                        off it used to print "No tracks" on every stage card,
                        advertising an internal absence five times to the room
                        (UI-UX §1). Nothing is better than an apology. */}
                    {FLAGS.music && <div style={{
                      flexShrink:0,padding:"10px 18px",
                      borderTop:`1px solid ${cfg.color}25`,
                      display:"flex",alignItems:"center",gap:"8px"
                    }}>
                      <Music size={12} color={cfg.color} style={{flexShrink:0}}/>
                      {firstTrack ? (
                        <p style={{fontSize:"11px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          <span style={{color:"var(--text)",fontWeight:"600"}}>{firstTrack.t}</span>
                          {firstTrack.a && <span> — {firstTrack.a}</span>}
                          {trList.length>1 && <span style={{color:cfg.color}}> +{trList.length-1}</span>}
                        </p>
                      ) : (
                        <p style={{fontSize:"11px",color:"var(--muted)",fontStyle:"italic"}}>No tracks</p>
                      )}
                    </div>}
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
// "Music Focus" (big album art + timer) is filtered out while music is
// quarantined — the preset renders an empty artwork panel with no player
// attached, and it is the room's TV that shows it (audit 2.1).
const DISPLAY_PRESETS = [
  { id:"full",    label:"Full",        desc:FLAGS.music?"Timer + exercises + music":"Timer + exercises" },
  { id:"minimal", label:"Minimal",     desc:"Timer + stage name only"   },
  { id:"timer",   label:"Timer Only",  desc:"Giant full-screen clock"   },
  ...(FLAGS.music ? [{ id:"music", label:"Music Focus", desc:"Big album art + timer" }] : []),
];
const FONT_SCALES = [
  { id:"s",  label:"S",  mult:0.75 },
  { id:"m",  label:"M",  mult:1    },
  { id:"l",  label:"L",  mult:1.4  },
  { id:"xl", label:"XL", mult:1.85 },
];

// Honest floor board derived from the coach's real class plan. No fabricated
// member rosters, headcounts, or HR zones — the core is biometric-free (Fable M3)
// and the roster returns for real once F4 attendance check-in lands.
function buildFloorLayout(stages){
  const src = (stages||[]).filter(Boolean).slice(0,5);
  return src.map((s,i)=>{
    const ex = (s.exercises && s.exercises[0]) || null;
    const cfg = SCFG[s.type] || SCFG.circuit;
    const move = (ex && ex.n) || s.name || cfg.label;
    const scheme = ex ? [ex.s && `${ex.s}×`, ex.r].filter(Boolean).join(" ").trim() : "";
    return { id:"st"+i, type:s.type||"circuit", label:cfg.label, move, scheme, order:i, isStart:i===0, isFinish:i===src.length-1 };
  });
}

function FloorLiveScreen({ stages=[], liveState={elapsed:0,playing:false,idx:0}, nowPlaying=null, onBack }){
  const vw = useWindowWidth(); const isMobile = vw < 700;
  const reduce = prefersReducedMotion();
  const floor = React.useMemo(()=>buildFloorLayout(stages), [stages]);
  useEffect(()=>{ const k=e=>{ if(e.key==="Escape") onBack&&onBack(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onBack]);
  const elapsed = liveState.elapsed||0;
  const rotateEverySec = 180;
  const rotateRemaining = rotateEverySec - (elapsed % rotateEverySec);
  const spotlight = floor.length ? Math.floor(elapsed/6) % floor.length : 0;
  const roundLen=45, restLen=15, cycle=roundLen+restLen;
  const inCycle = elapsed % cycle;
  const phase = inCycle < roundLen ? "WORK" : "REST";
  const phaseRemaining = phase==="WORK" ? roundLen-inCycle : cycle-inCycle;
  const rounds = 8; const currentRound = Math.min(rounds, Math.floor(elapsed/cycle)+1);
  const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,"0")}`;
  const npName = nowPlaying?.name; const npArtist = (nowPlaying?.artists||[]).map(a=>a.name).join(", ");
  const panel = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"16px"};

  return (
    <div style={{flex:1,minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:isMobile?"12px":"20px",display:"flex",flexDirection:"column",gap:"14px",overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
          <BrandLogo size={24} showName/>
          <div style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",letterSpacing:"2px"}}>STUDIO FLOOR · LIVE</div>
        </div>
        <button onClick={onBack} style={{padding:"8px 14px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",cursor:"pointer",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px"}}><ArrowLeft size={13}/> Exit</button>
      </div>

      <div style={{...panel,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"20px",flexWrap:"wrap",background:"linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), var(--card))"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"14px"}}>
          <div style={{fontSize:isMobile?"18px":"24px",fontWeight:"800",letterSpacing:"2px",color:phase==="WORK"?"var(--accent)":"var(--muted)"}}>{phase}</div>
          <div style={{fontFamily:"var(--display)",fontSize:isMobile?"54px":"84px",fontWeight:"900",lineHeight:"0.9",color:phase==="WORK"?"var(--text)":"var(--muted)",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)"}}>{fmt(phaseRemaining)}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"flex-end"}}>
          <div style={{fontSize:"13px",fontWeight:"700",color:"var(--muted)"}}>ROUND <span style={{color:"var(--text)"}}>{currentRound}</span>/{rounds}</div>
          <div style={{display:"flex",gap:"4px"}}>{Array.from({length:rounds}).map((_,i)=><div key={i} style={{width:"14px",height:"6px",borderRadius:"3px",background:i<currentRound?"var(--accent)":"var(--navy)"}}/>)}</div>
          <div style={{fontSize:"12px",color:"var(--muted)"}}>Elapsed {fmt(elapsed)}</div>
        </div>
      </div>

      {floor.length===0 ? (
        <div style={{...panel,textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)",marginBottom:"6px"}}>No stations yet</div>
          <div style={{fontSize:"12px",color:"var(--muted)"}}>Build a class in the Class Builder — its stages light up the floor board here.</div>
        </div>
      ) : (
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${floor.length},1fr)`,gap:"12px"}}>
        {floor.map((st,i)=>{ const c=(SCFG[st.type]||SCFG.circuit).color; const on=i===spotlight;
          return (
          <div key={st.id} style={{background:"var(--card)",border:`2px solid ${on?c:"var(--border)"}`,borderRadius:"14px",padding:"14px",position:"relative",transition:reduce?"none":"transform .3s, box-shadow .3s",transform:on&&!reduce?"scale(1.02)":"none",boxShadow:on?`0 0 24px ${c}55`:"none"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"9px",height:"9px",borderRadius:"50%",background:c}}/><span style={{fontSize:"12px",fontWeight:"800",color:c,letterSpacing:"1px"}}>{st.label.toUpperCase()}</span></div>
              {st.isStart&&<span style={{fontSize:"9px",fontWeight:"800",color:"var(--bg)",background:c,padding:"2px 6px",borderRadius:"4px"}}>START</span>}
              {st.isFinish&&<span style={{fontSize:"9px",fontWeight:"800",color:c,border:`1px solid ${c}`,padding:"2px 6px",borderRadius:"4px"}}>FINISH</span>}
            </div>
            <div style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"26px",fontWeight:"800",color:"var(--text)",marginBottom:"6px",lineHeight:"1.1"}}>{st.move}</div>
            {st.scheme && <div style={{fontSize:"13px",color:"var(--muted)"}}>{st.scheme}</div>}
            {on&&<div style={{position:"absolute",top:"10px",right:"10px",fontSize:"9px",fontWeight:"800",color:c,letterSpacing:"1px"}}>FOLLOW</div>}
          </div>
        );})}
      </div>
      )}

      <div style={{...panel,display:"flex",alignItems:"center",justifyContent:"center",gap:"18px",flexWrap:"wrap"}}>
        <div style={{fontSize:"12px",fontWeight:"800",color:"var(--muted)",letterSpacing:"2px"}}>THE LOOP</div>
        <div style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"var(--text)"}}>Rotate in <span style={{fontFamily:"var(--display)",fontSize:"22px",fontWeight:"800",color:"var(--accent)",fontVariantNumeric:"var(--num)"}}>{fmt(rotateRemaining)}</span></div>
        <div style={{fontSize:"12px",color:"var(--muted)"}}>clockwise · {floor.length} stations</div>
      </div>

      {/* This board faces the FLOOR — members read it mid-class. The NOW PLAYING
          panel printed "No track playing." to the whole room for the entire
          session (audit 2.1). Dropped with music; the grid closes up rather than
          leaving a hole. */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":(FLAGS.music?"1fr 1fr 1fr":"1fr 1fr"),gap:"12px"}}>
        {FLAGS.music && <div style={panel}>
          <div style={{fontSize:"11px",fontWeight:"800",color:"var(--muted)",letterSpacing:"1px",marginBottom:"10px"}}>NOW PLAYING</div>
          {npName ? <div><div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)"}}>{npName}</div><div style={{fontSize:"12px",color:"var(--muted)"}}>{npArtist}</div></div> : <div style={{fontSize:"12px",color:"var(--muted)"}}>No track playing.</div>}
        </div>}
        <div style={panel}>
          <div style={{fontSize:"11px",fontWeight:"800",color:"var(--muted)",letterSpacing:"1px",marginBottom:"10px"}}>BENCHMARK OF THE WEEK</div>
          <div style={{fontSize:"12px",color:"var(--muted)"}}>Set a weekly benchmark WOD to track PRs and attempts on the floor. Coming soon.</div>
        </div>
        <div style={panel}>
          <div style={{fontSize:"11px",fontWeight:"800",color:"var(--muted)",letterSpacing:"1px",marginBottom:"10px"}}>OUTPUT · avg watts</div>
          <div style={{fontSize:"12px",color:"var(--muted)"}}>Connect a wearable/erg feed to show live output.</div>
        </div>
      </div>

    </div>
  );
}

// Tempo guide (Fable §4.2 / N5): the zero-license default that keeps the rhythm
// value when no soundtrack is playing. A silent, visual metronome — one ring
// "pings" outward per beat at the stage's target BPM. No audio, no licensing.
// Honours reduced-motion (static readout, no ping). BPM = midpoint of the
// stage's SCFG range; the ping interval is 60/bpm seconds.
function TempoGuide({ bpm, color, reduce, hasTracks }) {
  const beat = bpm > 0 ? 60 / bpm : 0.5; // seconds per beat
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",gap:"16px"}}>
      <style>{`@keyframes jg-tempo{0%{transform:scale(0.62);opacity:0.85}70%{opacity:0.12}100%{transform:scale(1.32);opacity:0}}`}</style>
      <div style={{position:"relative",width:"128px",height:"128px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {!reduce && <span style={{position:"absolute",inset:"6px",borderRadius:"50%",border:`3px solid ${color}`,animation:`jg-tempo ${beat}s ease-out infinite`}}/>}
        <div style={{width:"92px",height:"92px",borderRadius:"50%",background:`color-mix(in srgb, ${color} 16%, transparent)`,border:`2px solid ${color}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:"32px",fontWeight:"900",color:"var(--text)",lineHeight:"1",fontVariantNumeric:"var(--num)"}}>{bpm}</span>
          <span style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",letterSpacing:"1px"}}>BPM</span>
        </div>
      </div>
      <div>
        <p style={{fontSize:"13px",fontWeight:"800",color,letterSpacing:"1.5px"}}>TEMPO GUIDE</p>
        <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px",maxWidth:"220px",lineHeight:"1.5"}}>
          {hasTracks ? "Press play to start the queued soundtrack — or keep this silent pace cue." : "Silent pace cue at this stage's target tempo — no music or licensing needed."}
        </p>
      </div>
    </div>
  );
}

function DisplayScreen({stages, liveState, onBack, player, deviceId, spPaused, nowPlaying, onPlayPause}) {
  const vw = useWindowWidth();
  const reduce = prefersReducedMotion();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const { skin } = useTheme();
  const stationCue = brandCopy(skin && skin.voice, "stationCue");
  const stage = stages[liveState.idx];
  const dur = stage?.dur||1;
  const remaining = Math.max(0, dur - liveState.elapsed);
  const progress = (liveState.elapsed/dur)*100;
  const cfg = SCFG[stage?.type]||SCFG.circuit;
  const tempoBpm = Math.round(((cfg.bpmMin||100)+(cfg.bpmMax||120))/2);
  const totalDur = stages.reduce((a,s)=>a+s.dur,0);

  // "Now over next": preview the upcoming stage so the room can anticipate. Kept
  // secondary to the current move but sized to read across the floor.
  const nextStage = stages[liveState.idx + 1];
  const nextCfg = nextStage ? (SCFG[nextStage.type]||SCFG.circuit) : null;
  const nextMoves = nextStage ? (nextStage.exercises||[]).map(e=>e.n).filter(Boolean).slice(0,3) : [];

  // Display prefs persisted to localStorage
  // A display that ran before the music quarantine has `preset:"music"` saved in
  // localStorage, and that preset no longer exists — restoring it blindly would
  // put an empty album-art panel on the gym's TV. Fall back to "full".
  const [preset,    setPreset]    = useState(() => {
    const saved = store.getDisplayPrefs().preset;
    return DISPLAY_PRESETS.some(p => p.id === saved) ? saved : "full";
  });
  const [fontScale, setFontScale] = useState(() => store.getDisplayPrefs().fontScale);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    store.saveDisplayPrefs({ preset, fontScale });
  }, [preset, fontScale]);

  // The "Attendee QR" that used to live here promised a member "scan to see
  // today's session on your phone" and encoded the whole class into a URL whose
  // route rendered a component that was never written. A member-facing surface
  // must not make a promise the product cannot keep, so it is gone until the N4
  // magic-link page gives the QR something real to point at (audit 2.2).

  // F15: Esc exits display mode back to live
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scaleMult = FONT_SCALES.find(f=>f.id===fontScale)?.mult || 1;

  // Color-coded timer
  const ratio = remaining / dur;
  const timerColor = ratio > 0.5 ? cfg.color : ratio > 0.25 ? "#F59E0B" : "var(--accent)";
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
    <div style={{position:"absolute",top:"64px",right:isMobile?"8px":"20px",zIndex:200,background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"20px",width:isMobile?"min(260px,calc(100vw-16px))":"260px",boxShadow:"0 12px 40px rgba(0,0,0,0.5)",boxSizing:"border-box"}}>
      <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>Layout Preset</p>
      <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"18px"}}>
        {DISPLAY_PRESETS.map(p => (
          <button key={p.id} onClick={()=>setPreset(p.id)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:preset===p.id?"color-mix(in srgb, var(--accent) 13%, transparent)":"var(--navy)",border:`1px solid ${preset===p.id?"color-mix(in srgb, var(--accent) 38%, transparent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",textAlign:"left"}}>
            <div>
              <p style={{fontSize:"13px",fontWeight:"700",color:preset===p.id?"var(--accent)":"var(--text)",marginBottom:"1px"}}>{p.label}</p>
              <p style={{fontSize:"10px",color:"var(--muted)"}}>{p.desc}</p>
            </div>
            {preset===p.id && <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"var(--accent)"}}/>}
          </button>
        ))}
      </div>
      <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Font Size</p>
      <div style={{display:"flex",gap:"6px"}}>
        {FONT_SCALES.map(f => (
          <button key={f.id} onClick={()=>setFontScale(f.id)}
            style={{flex:1,padding:"8px 0",background:fontScale===f.id?"var(--accent)":"transparent",color:fontScale===f.id?"white":"var(--muted)",border:`1px solid ${fontScale===f.id?"var(--accent)":"var(--border)"}`,borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>
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
              background:isCurrent?sCfg.color+"30":isPast?"color-mix(in srgb, var(--border) 38%, transparent)":"transparent",
              border:`1.5px solid ${isCurrent?sCfg.color:isPast?"color-mix(in srgb, var(--muted) 25%, transparent)":"var(--border)"}`,
              display:"flex",alignItems:"center",gap:"5px",
              opacity:isFuture?0.45:1,
              transition:"all 0.3s",
            }}>
              <div style={{width:compact?"6px":"7px",height:compact?"6px":"7px",borderRadius:"50%",background:isCurrent?sCfg.color:isPast?"#ffffff50":"var(--muted)",flexShrink:0}}/>
              <span style={{fontSize:compact?"9px":"10px",fontWeight:isCurrent?"800":"600",color:isCurrent?sCfg.color:isPast?"var(--muted)":"var(--muted)",whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden",maxWidth:compact?"80px":"120px"}}>
                {isPast?"✓ ":""}{s.name}
              </span>
            </div>
            {i < stages.length-1 && <span style={{color:"var(--muted)",fontSize:"8px",opacity:0.4,flexShrink:0}}>▶</span>}
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
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"8px",background:"color-mix(in srgb, var(--card) 50%, transparent)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"8px 14px",background:"color-mix(in srgb, var(--card) 50%, transparent)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--text)",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:"56px"}}>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <p style={{fontSize:`${Math.round(160*scaleMult)}px`,fontWeight:"900",color:timerColor,lineHeight:"0.9",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",letterSpacing:"-4px"}}>{fmt(remaining)}</p>
          <p style={{fontSize:`${Math.round(20*scaleMult)}px`,color:"var(--muted)",marginTop:"16px",textTransform:"uppercase",letterSpacing:"6px"}}>{stage?.name}</p>
          <p style={{fontSize:"13px",color:"var(--muted)",marginTop:"8px",opacity:0.6}}>Stage {liveState.idx+1} of {stages.length}</p>
        </div>
        <div style={{height:"6px",display:"flex",overflow:"hidden"}}>
          {stages.map((s,i)=>{ const c=SCFG[s.type]?.color||"var(--border)"; return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,background:i<liveState.idx?c+"60":i===liveState.idx?c:"var(--navy)"}}/>; })}
        </div>
      </div>
    );
  }

  // ── Minimal preset ──
  if (preset === "minimal") {
    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:"12px"}}>
          <BrandLogo size={24}/>
          {stationCue && <span style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>{stationCue}</span>}
          <div style={{flex:1,overflow:"hidden"}}>
            <StageJourney compact={true}/>
          </div>
          <div style={{display:"flex",gap:"8px",flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"7px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"7px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--text)",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <h1 style={{fontSize:`${Math.round(52*scaleMult)}px`,fontWeight:"800",color:"var(--text)",marginBottom:"6px",textAlign:"center"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"56px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"28px"}}/>
          <p style={{fontSize:`${Math.round(110*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s"}}>{fmt(remaining)}</p>
          <p style={{fontSize:"15px",color:"var(--muted)",marginBottom:"28px"}}>remaining · Stage {liveState.idx+1} of {stages.length}</p>
          <div style={{width:"min(480px,80%)",height:"8px",background:"var(--navy)",borderRadius:"4px",overflow:"hidden"}}>
            <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
          </div>
          {nextStage
            ? <p style={{fontSize:`${Math.round(20*scaleMult)}px`,color:"var(--muted)",marginTop:"26px"}}>Next: <span style={{color:nextCfg.color,fontWeight:"800"}}>{nextStage.name}</span></p>
            : <p style={{fontSize:`${Math.round(18*scaleMult)}px`,color:cfg.color,fontWeight:"700",marginTop:"26px"}}>Final stage</p>}
        </div>
        <div style={{height:"5px",display:"flex",overflow:"hidden"}}>
          {stages.map((s,i)=>{ const c=SCFG[s.type]?.color||"var(--border)"; return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,background:i<liveState.idx?c+"60":i===liveState.idx?c:"var(--navy)"}}/>; })}
        </div>
      </div>
    );
  }

  // ── Music Focus preset ──
  if (preset === "music") {
    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
        <div style={{padding:"14px 20px",background:"var(--card)",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <BrandLogo size={28} showName/>
          </div>
          <Tag color={cfg.color}>{stage?.name}</Tag>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s)}} style={{padding:"7px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",display:"flex"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button onClick={onBack} style={{padding:"7px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--text)",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px"}}><ArrowLeft size={13}/> Back</button>
          </div>
        </div>
        {showSettings && <SettingsPanel/>}
        <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
        <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",gap:"0",overflow:isMobile?"auto":"hidden"}}>
          {/* Album art left */}
          <div style={{flex:isMobile?"0 0 auto":"0 0 420px",padding:isMobile?"20px 24px":"36px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"var(--card)",borderRight:isMobile?"none":`1px solid var(--border)`,borderBottom:isMobile?`1px solid var(--border)`:"none"}}>
            {nowPlaying?.album?.images?.[0]?.url
              ? <img src={nowPlaying.album.images[0].url} style={{width:"100%",maxWidth:"340px",aspectRatio:"1",borderRadius:"16px",objectFit:"cover",boxShadow:`0 16px 64px ${cfg.color}60`}} alt="album"/>
              : <div style={{width:"300px",height:"300px",background:"var(--navy)",borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={80} color={"var(--border)"}/></div>
            }
            {nowPlaying && <>
              <p style={{fontSize:"20px",fontWeight:"700",color:"var(--text)",marginTop:"20px",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"}}>{nowPlaying.name}</p>
              <p style={{fontSize:"14px",color:"var(--muted)",marginTop:"4px"}}>{nowPlaying.artists?.[0]?.name}</p>
              <div style={{display:"flex",gap:"22px",alignItems:"center",marginTop:"20px"}}>
                <button onClick={()=>player?.previousTrack()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><SkipBack size={28}/></button>
                <button onClick={handlePlayPause} style={{width:"60px",height:"60px",borderRadius:"50%",background:"var(--accent)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>{liveState.playing?<Pause size={24}/>:<Play size={24}/>}</button>
                <button onClick={()=>player?.nextTrack()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><SkipForward size={28}/></button>
              </div>
            </>}
          </div>
          {/* Timer right */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"36px"}}>
            <p style={{fontSize:`${Math.round(96*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",textAlign:"center"}}>{fmt(remaining)}</p>
            <p style={{fontSize:"16px",color:"var(--muted)",marginTop:"10px",marginBottom:"28px"}}>remaining</p>
            <div style={{width:"100%",maxWidth:"360px",height:"8px",background:"var(--navy)",borderRadius:"4px",overflow:"hidden"}}>
              <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
            </div>
            <p style={{fontSize:"13px",color:"var(--muted)",marginTop:"14px"}}>Stage {liveState.idx+1} of {stages.length}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full preset (default) ──
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
      {/* TV Header */}
      <div style={{padding:"14px 28px",background:"var(--card)",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",flexShrink:0}}>
          <BrandLogo size={36} showName/>
        </div>
        {/* Stage journey in header */}
        <div style={{flex:1,overflow:"hidden"}}>
          <StageJourney compact={true}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
          {/* Settings gear */}
          <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}} style={{padding:"8px",background:showSettings?"color-mix(in srgb, var(--accent) 13%, transparent)":"var(--navy)",border:`1px solid ${showSettings?"color-mix(in srgb, var(--accent) 25%, transparent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",color:showSettings?"var(--accent)":"var(--muted)",display:"flex"}}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
          <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--text)",fontSize:"13px",fontWeight:"700"}}><ArrowLeft size={14}/> Back</button>
        </div>
      </div>

      {showSettings && <SettingsPanel/>}

      <div style={{flex:1,display:"flex"}}>
        {/* LEFT: Stage info */}
        <div style={{flex:1,padding:"44px 52px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <h1 style={{fontSize:`${Math.round(54*scaleMult)}px`,fontWeight:"800",color:"var(--text)",marginBottom:"8px",lineHeight:"1"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"64px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"36px",transition:"background 0.5s"}}/>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <p style={{fontSize:`${Math.round(92*scaleMult)}px`,fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",marginBottom:"6px",transition:"color 0.5s",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none"}}>{fmt(remaining)}</p>
          <p style={{fontSize:"16px",color:"var(--muted)",marginBottom:"36px"}}>remaining</p>
          <div style={{width:"100%",height:"8px",background:"var(--navy)",borderRadius:"4px",marginBottom:"24px",overflow:"hidden"}}>
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
                  <p style={{fontSize:`${Math.round(64*scaleMult)}px`,fontWeight:"900",color:ivColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)"}}>{fmtSec(ivState.phaseRemaining)}</p>
                </div>
                <div>
                  <p style={{fontSize:`${Math.round(18*scaleMult)}px`,fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>{ivState.exName}</p>
                  <p style={{fontSize:"13px",color:"var(--muted)"}}>Round {ivState.round} of {ivState.totalRounds} · {ivState.timing === "tabata" ? `${ivState.workSec}s on / ${ivState.restSec}s off` : "EMOM"}</p>
                </div>
              </div>
            );
          })()}

          {/* Group splits in display mode */}
          {stage?.groups?.length > 0 && (
            <div style={{marginBottom:"20px"}}>
              <p style={{fontSize:"13px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>👥 Groups</p>
              <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(stage.groups.length,3)}, 1fr)`,gap:"12px"}}>
                {stage.groups.map((grp,gi) => {
                  const gc = grpColor(grp.id);
                  const exerciseLabel = grp.exercise==="__custom__" ? (grp.customEx||"") : (grp.exercise||"");
                  return (
                    <div key={grp.id} style={{padding:"18px 20px",background:"var(--card)",border:`2px solid ${gc}`,borderRadius:"12px",boxShadow:`0 0 20px ${gc}30`}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                        <div style={{width:"12px",height:"12px",borderRadius:"50%",background:gc,flexShrink:0}}/>
                        <p style={{fontSize:`${Math.round(14*scaleMult)}px`,fontWeight:"800",color:"var(--text)"}}>{grp.name}</p>
                      </div>
                      {exerciseLabel
                        ? <p style={{fontSize:`${Math.round(20*scaleMult)}px`,fontWeight:"700",color:gc,lineHeight:"1.2"}}>{exerciseLabel}</p>
                        : <p style={{fontSize:"12px",color:"var(--muted)",fontStyle:"italic"}}>—</p>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stage?.exercises?.length > 0 && (
            <div>
              <p style={{fontSize:"13px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px"}}>Doing Now</p>
              {/* One movement (e.g. a strength primary) gets the full width and the biggest
                  type; multiple stations share two columns. Sized to read across the floor. */}
              <div style={{display:"grid",gridTemplateColumns:stage.exercises.length===1?"1fr":"1fr 1fr",gap:"12px"}}>
                {stage.exercises.map((ex,i) => {
                  const solo = stage.exercises.length===1;
                  return (
                  <div key={i} style={{padding:"18px 22px",background:"var(--card)",border:`1px solid var(--border)`,borderLeft:`5px solid ${cfg.color}`,borderRadius:"10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px"}}>
                      <p style={{fontSize:`${Math.round((solo?34:24)*scaleMult)}px`,fontWeight:"800",color:"var(--text)",lineHeight:"1.1"}}>{ex.n}</p>
                      {ex.timing && ex.timing!=="none" && <span style={{fontSize:"11px",padding:"2px 7px",background:"#8B5CF620",color:"#8B5CF6",borderRadius:"4px",fontWeight:"700",flexShrink:0}}>{ex.timing==="tabata"?"TABATA":ex.timing==="emom"?"EMOM":`${ex.workSec}s/${ex.restSec}s`}</span>}
                    </div>
                    <p style={{fontSize:`${Math.round((solo?20:16)*scaleMult)}px`,color:"var(--muted)",fontWeight:"600"}}>{[ex.s&&`${ex.s} sets`,ex.r&&(/^\d+(\s*[-–/x×]\s*\d+)*$/.test(String(ex.r).trim())?`${ex.r} reps`:String(ex.r)),ex.rest&&`${ex.rest} rest`,ex.timing&&ex.timing!=="none"&&`${ex.rounds||8} rounds`].filter(Boolean).join(" · ")}</p>
                  </div>
                );})}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: tempo (or the player, if music is ever turned back on).
            The heading has to follow the content — "Now Playing" sitting above a
            silent metronome reads as a player that has failed. */}
        <div style={{flex:"0 0 320px",background:"var(--card)",borderLeft:`1px solid var(--border)`,padding:"44px 28px",display:"flex",flexDirection:"column"}}>
          <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"20px"}}>{nowPlaying ? "Now Playing" : "Tempo"}</p>
          {nowPlaying ? (
            <>
              {nowPlaying.album?.images?.[0]?.url && (
                <img src={nowPlaying.album.images[0].url} style={{width:"100%",aspectRatio:"1",borderRadius:"12px",marginBottom:"20px",objectFit:"cover",boxShadow:`0 8px 32px ${cfg.color}40`}} alt="album"/>
              )}
              <p style={{fontSize:"18px",fontWeight:"700",color:"var(--text)",marginBottom:"5px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.name}</p>
              <p style={{fontSize:"14px",color:"var(--muted)",marginBottom:"28px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.artists?.[0]?.name}</p>
              <div style={{display:"flex",justifyContent:"center",gap:"22px",alignItems:"center"}}>
                <button onClick={()=>player?.previousTrack()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"8px"}}><SkipBack size={26}/></button>
                <button onClick={handlePlayPause} style={{width:"64px",height:"64px",borderRadius:"50%",background:"var(--accent)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>
                  {liveState.playing ? <Pause size={26}/> : <Play size={26}/>}
                </button>
                <button onClick={()=>player?.nextTrack()} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"8px"}}><SkipForward size={26}/></button>
              </div>
            </>
          ) : (
            <TempoGuide bpm={tempoBpm} color={cfg.color} reduce={reduce} hasTracks={!hasNoTracks}/>
          )}
          <div style={{marginTop:"auto",paddingTop:"24px",borderTop:`1px solid var(--border)`}}>
            <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage Progress</p>
            <div style={{display:"flex",height:"6px",borderRadius:"3px",overflow:"hidden",gap:"2px"}}>
              {stages.map((s,i) => {
                const c = SCFG[s.type]?.color||"var(--border)";
                return <div key={s.id} style={{flex:`0 0 ${(s.dur/totalDur)*100}%`,height:"100%",background:i<liveState.idx?c+"80":i===liveState.idx?c:"var(--navy)"}}/>;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* UP NEXT — the "next" half of now-over-next; big enough to read across the floor,
          but clearly secondary to the live stage above it. */}
      <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:"18px",padding:isMobile?"12px 16px":"16px 32px",background:"var(--card)",borderTop:`1px solid var(--border)`,minHeight:0}}>
        <span style={{fontSize:`${Math.round(14*scaleMult)}px`,fontWeight:"800",color:"var(--muted)",letterSpacing:"3px",flexShrink:0}}>UP NEXT</span>
        {nextStage ? (
          <>
            <span style={{width:"14px",height:"14px",borderRadius:"50%",background:nextCfg.color,flexShrink:0,boxShadow:`0 0 12px ${nextCfg.color}80`}}/>
            <span style={{fontSize:`${Math.round(30*scaleMult)}px`,fontWeight:"800",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flexShrink:1,minWidth:0}}>{nextStage.name}</span>
            <span style={{fontSize:`${Math.round(17*scaleMult)}px`,fontWeight:"700",color:nextCfg.color,flexShrink:0}}>{Math.round((nextStage.dur||0)/60)} min</span>
            {nextMoves.length>0 && <span style={{fontSize:`${Math.round(18*scaleMult)}px`,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>· {nextMoves.join("  ·  ")}</span>}
          </>
        ) : (
          <span style={{fontSize:`${Math.round(24*scaleMult)}px`,fontWeight:"800",color:cfg.color}}>Final stage — class wraps after this 🎉</span>
        )}
      </div>
    </div>
  );
}

// ─── Auto-DJ orchestrator ─────────────────────────────────────────────────────
async function runDjOrchestrator(stages, selectedPlaylistIds, setStages, setDjProgress) {
  setDjProgress({ active:true, stage:0, total:stages.length, done:false, error:null });
  let pool = [];
  if (selectedPlaylistIds?.length) {
    for (const pid of selectedPlaylistIds) {
      try { const res = await apiGetPlaylistTracks(pid); if (Array.isArray(res)) pool.push(...res); } catch(_) {}
    }
  }
  pool = await enrichTracksWithBpm(pool);
  const BPM_MAP = {
    warmup:{bpmMin:80,bpmMax:110}, circuit:{bpmMin:110,bpmMax:130},
    strength:{bpmMin:110,bpmMax:130}, cardio:{bpmMin:120,bpmMax:150},
    recovery:{bpmMin:80,bpmMax:100}, stretch:{bpmMin:60,bpmMax:90},
    cooldown:{bpmMin:80,bpmMax:100}, hiit:{bpmMin:120,bpmMax:145},
    boxing:{bpmMin:115,bpmMax:140}, crossfit:{bpmMin:120,bpmMax:145}
  };
  pool = pool.map(t => ({
    id:t.id, name:t.name, uri:t.uri,
    artist:t.artists?.[0]?.name||"", album:t.album?.name||"",
    img:t.album?.images?.[0]?.url||null,
    dur:Math.round((t.duration_ms||210000)/1000),
    bpm:t.bpm||0, camelot:t.camelot||""
  }));
  const usedIds = new Set();
  const newStages = [...stages];
  let prevCamelot = "";
  for (let si = 0; si < stages.length; si++) {
    setDjProgress(p => ({ ...p, stage:si }));
    const stage = stages[si];
    const cfg = BPM_MAP[stage.type] || { bpmMin:100, bpmMax:130 };
    let scored = pool.filter(t=>!usedIds.has(t.id))
      .map(t=>({ ...t, _score:scoreTrackForStage(t, cfg.bpmMin, cfg.bpmMax, prevCamelot) }));
    if (scored.length < 3) {
      try {
        const recs = await apiGetRecommendations({ seedGenres:["workout"], minTempo:cfg.bpmMin, maxTempo:cfg.bpmMax, limit:20 });
        const enriched = await enrichTracksWithBpm(recs);
        enriched.filter(t=>!pool.find(p=>p.id===t.id)).forEach(t => pool.push({
          id:t.id, name:t.name, uri:t.uri, artist:t.artists?.[0]?.name||"",
          album:t.album?.name||"", img:t.album?.images?.[0]?.url||null,
          dur:Math.round((t.duration_ms||210000)/1000), bpm:t.bpm||0, camelot:""
        }));
        scored = pool.filter(t=>!usedIds.has(t.id))
          .map(t=>({ ...t, _score:scoreTrackForStage(t, cfg.bpmMin, cfg.bpmMax, prevCamelot) }));
      } catch(_) {}
    }
    const picked = selectTracksForDuration(scored, stage.dur, stage.type);
    picked.forEach(t=>usedIds.add(t.id));
    if (picked.length) prevCamelot = picked[picked.length-1].camelot || prevCamelot;
    newStages[si] = { ...stage, tracks:picked };
  }
  setStages(newStages);
  setDjProgress({ active:false, stage:stages.length, total:stages.length, done:true, error:null });
  setTimeout(() => setDjProgress(null), 3000);
}

// ─── Coach Personas (workstream D — persona-level planning) ──────────────────
// Persona-first: define/choose a persona, connect historical plans as its
// corpus, view its learned style, then draft a new class "in this style" into
// the Builder (coach edits + approves — the hard gate). Local-first via store;
// syncs to coach_personas / persona_plans once 0005 is applied.

// Map a persona plan's normalized {blocks} → Builder stages. Roles collapse onto
// the Builder's five stage types; scheme/rest inform sets·reps·rest per exercise.
const ROLE_TO_STAGE = { warmup:"warmup", primary_lift:"strength", superset:"strength",
                        circuit:"circuit", finisher:"circuit", cooldown:"cooldown", recovery:"recovery" };
const ROLE_DUR_SEC  = { warmup:300, primary_lift:900, superset:600, circuit:600, finisher:480, cooldown:300, recovery:300 };
// Persona class-type category → Builder class-type key (each must exist in WORKOUT_LIBRARY).
// Item 9: a persona pushed to the Builder lands on the right class type, not "untyped".
const CATEGORY_TO_BUILDER = { strength:"strength", conditioning:"circuit", endurance:"hyrox", mixed:"bootcamp" };
// Two different things are called "category" in this system, so both are named
// explicitly: a CLASS category (what kind of session this is, from classCategory)
// and a MOVEMENT category (what kind of movement this is, from the §9.2 taxonomy).
// CLASS_CATEGORY_LABEL now lives in src/ui/labels.js with the other label maps.
function planToStages(plan) {
  const blocks = plan?.blocks || [];
  return blocks.map(b => {
    const sc = b.scheme || {};
    const restLabel = sc.rest_sec ? `${sc.rest_sec}s` : "";
    // Intensity + scheme qualifiers ride into the Builder on each exercise's notes
    // (stages have no block-level scheme fields).
    const schemeBits = [sc.rir != null ? `RIR ${sc.rir}` : "", sc.rpe != null ? `RPE ${sc.rpe}` : "",
                        sc.note || ""].filter(Boolean);
    const exercises = (b.exercises || []).map(ex => {
      // ex.reps is "" (schema default) when the block scheme's ladder applies —
      // only a non-empty per-exercise value overrides it.
      const reps = (ex.reps != null && String(ex.reps).trim() !== "") ? String(ex.reps)
                 : (Array.isArray(sc.reps) && sc.reps.length ? sc.reps.join("-") : "");
      const notes = [ex.per_side ? "per side" : "", ex.regression ? `regress: ${ex.regression}` : "",
                     ex.equip || "", ex.target ? `target: ${ex.target}` : "", ...schemeBits].filter(Boolean).join(" · ");
      return { n: ex.name || "Movement", s: sc.sets != null ? String(sc.sets) : "",
               r: reps, rest: restLabel, notes };
    });
    return { id: uid(), type: ROLE_TO_STAGE[b.role] || "circuit",
             name: b.label || "Block", dur: ROLE_DUR_SEC[b.role] || 600,
             exercises, tracks: [] };
  });
}

// Shared styling + labels for the persona surfaces.
const P_CARD = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:"12px" };
const P_CHIP = { display:"inline-block", padding:"3px 9px", background:"var(--navy)", color:"var(--muted)", borderRadius:"5px", fontSize:"11px", fontWeight:"600", margin:"0 5px 5px 0" };
// Label maps live in src/ui/labels.js so the "no jargon reaches a coach" rule
// can be unit-tested rather than eyeballed (see labels.test.js).
const KIND_COLOR = { coach:"var(--accent)", format:"#8B5CF6", house:"#3B82F6" };
const ctOf = pl => ((pl.classType || "").trim() || "Uncategorized");
const fmtRest = s => s == null ? "" : (s >= 60 ? `${Math.floor(s/60)}m${s%60?` ${s%60}s`:""}` : `${s}s`);
const fmtScheme = sc => [schemeTypeLabel(sc?.type), sc?.sets!=null?`${sc.sets} sets`:"", sc?.rir!=null?`RIR ${sc.rir}`:"", sc?.rpe!=null?`RPE ${sc.rpe}`:"", sc?.rest_sec!=null?`rest ${fmtRest(sc.rest_sec)}`:""].filter(Boolean).join(" · ");
// Distinct exercise names across a plan's blocks — the novelty signature stored in
// the generation ledger and used to steer the next generation away from repeats.
const blockMovementNames = blocks => { const s = new Set(); (blocks||[]).forEach(b => (b.exercises||[]).forEach(ex => { const n=(ex.name||"").trim(); if (n) s.add(n); })); return [...s]; };
// supabase.functions.invoke wraps every non-2xx in a FunctionsHttpError whose
// message is just "Edge Function returned a non-2xx status code" — the function's
// real { error } body is on error.context (a Response). Read it or debugging is blind.
async function fnErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return String(body.error);
    return JSON.stringify(body);
  } catch { return error?.message || String(error); }
}

// readErrorMessage / READ_ERRORS moved to src/ui/labels.js — see labels.test.js,
// which asserts no message leaks jargon at a coach.

// Free Gemini tiers cap requests-per-minute (e.g. 5/min for 2.5-flash), so a
// deck with many slides trips "quota exceeded … retry in Ns". Recognise those
// so the importer can WAIT OUT the 1-minute window and retry, instead of failing
// — keeping the whole import on the free tier.
const RATE_LIMITED = /quota|rate.?limit|resource.?exhausted|\b429\b|retry in|exceeded your current|high demand|overload|unavailable|try again/i;
function retryAfterSecs(msg) {
  const m = String(msg || "").match(/retry in ([\d.]+)\s*s/i); // Gemini says "Please retry in 58.7s"
  return m ? Math.ceil(Number(m[1])) : 0;
}
// A DAILY quota exhaustion is not a per-minute rate limit and must not be retried:
// Gemini's per-day cap resets on Google's ~midnight-Pacific cycle, so waiting 30s and
// retrying 6 times per slide just turns a dead import into a 30-minute hang before
// failing anyway. Google names the daily quota "…RequestsPerDay…" in the error.
const DAILY_QUOTA_GONE = /per\s?day|daily\s+(quota|limit)|limit:\s*0/i;

// One LLM call per slide drained the free daily quota on a single 18-slide deck, so
// slides are sent in batches. Small enough that one bad batch costs little and the
// response stays inside the output ceiling; big enough to cut quota use ~5x.
const SLIDE_BATCH = 5;

// looksLikeClassSlide lives in src/lib/slidesImport.js (slide logic, and unit-tested
// there — the heuristic is easy to break in a way no manual click would reveal).

// ─── Members & attendance (F4 slice 2) ───────────────────────────────────────
// Replaces the flagged-off `MemberScreen` theatre at the `member` route. Two jobs:
// show the real roster, and backfill historical attendance from a CSV.
//
// The backfill is the point. Phase 2 — cohort curves, at-risk detection,
// revenue-at-risk — is arithmetic over attendance rows, and it is no longer
// blocked on schema (0007 is applied) but on rows EXISTING. A studio arriving
// from another system already has years of them; without an import, the outcome
// tier is months of one-class-at-a-time accumulation away.
//
// Deliberately a TWO-STEP flow: analyze (pure, writes nothing) → preview →
// apply. `attendance` is append-only server-side, so a half-applied import
// cannot be rolled back; the coach sees exactly what will be written first.
function RosterScreen({ onBack }) {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const [members, setMembers] = useState(() => store.getMembers());
  const [attendance, setAttendance] = useState(() => store.getAttendance());
  const [classes, setClasses] = useState(() => store.getClassInstances());
  const [p6, setP6] = useState(() => p6Summary());
  const [csv, setCsv] = useState("");
  const [dayFirst, setDayFirst] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState("");
  const [actions, setActions] = useState(() => store.getRetentionActions());
  const [showHandled, setShowHandled] = useState(false);

  useEffect(() => {
    let alive = true;
    store.hydrateAttendance().then(r => {
      if (!alive || !r) return;
      setMembers(r.members); setAttendance(r.attendance); setClasses(r.classInstances);
      if (r.retentionActions) setActions(r.retentionActions);
    });
    return () => { alive = false; };
  }, []);

  // ── At-risk (N3) — the rules engine finally gets a surface ────────────────
  // Arithmetic, not a model: every flag carries the numbers that produced it so
  // the operator can argue with it rather than merely believe it.
  const retention = retentionSummary(members, attendance);
  const { active: atRiskActive, handled: atRiskHandled } =
    applyRetentionActions(retention.flags, actions, attendance);
  const act = (flag, action) =>
    setActions(store.recordRetentionAction({ memberId: flag.memberId, rule: flag.rule, action }));

  const visitsFor = id => attendance.filter(a => a.memberId === id).length;
  const lastSeen = id => {
    const ts = attendance.filter(a => a.memberId === id).map(a => a.checkedInAt).sort();
    return ts.length ? ts[ts.length - 1].slice(0, 10) : "";
  };
  const term = q.trim().toLowerCase();
  const shown = members
    .filter(m => !term || (m.name || "").toLowerCase().includes(term) || (m.email || "").toLowerCase().includes(term))
    .sort((a, b) => visitsFor(b.id) - visitsFor(a.id) || (a.name || "").localeCompare(b.name || ""));

  const analyze = () => {
    setResult(null);
    setAnalysis(analyzeAttendanceCsv(csv, members, { dayFirst }));
  };
  const apply = () => {
    const r = store.applyAttendanceImport(analysis);
    setResult(r);
    setAnalysis(null);
    setCsv("");
    setMembers(store.getMembers());
    setAttendance(store.getAttendance());
    setClasses(store.getClassInstances());
    setP6(p6Summary());
  };
  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setCsv(String(reader.result || "")); setAnalysis(null); setResult(null); };
    reader.readAsText(f);
  };

  const card = { border:"1px solid var(--border)", borderRadius:"12px", background:"var(--card)", padding:isMobile?"14px":"18px" };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)"}}>Members</h1>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>Your roster and the attendance history behind it</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px"}}>
        <div style={{maxWidth:"1000px",margin:"0 auto",display:"flex",flexDirection:"column",gap:"18px"}}>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:"12px"}}>
            <StatCard label="MEMBERS" value={String(members.length)}/>
            <StatCard label="CHECK-INS" value={String(attendance.length)}/>
            <StatCard label="CLASSES RUN" value={String(classes.length)}/>
          </div>

          {/* At-risk (N3). Same honesty rule as the P6 card below: when we cannot
              tell, say so — never a green all-clear over unmeasured data. */}
          <div style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap",marginBottom:"4px"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>Who&rsquo;s slipping away</div>
              <div style={{fontFamily:"var(--display)",fontSize:"26px",fontWeight:"800",
                           color:retention.atRisk==null?"var(--muted)":atRiskActive.length?"var(--accent)":"var(--green)"}}>
                {retention.atRisk == null ? "—" : String(atRiskActive.length)}
              </div>
            </div>
            <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:atRiskActive.length?"12px":"0"}}>
              {describeRetention(retention, { active: atRiskActive.length, handled: atRiskHandled.length })}
            </p>

            {atRiskActive.map(f => (
              <div key={`${f.memberId}:${f.rule}`} style={{padding:"12px 0",borderTop:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"baseline",gap:"8px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>{f.name || "Unnamed member"}</span>
                  <span style={{fontSize:"11px",color:"var(--muted)"}}>last in {f.daysSince} day{f.daysSince===1?"":"s"} ago · {f.visits} visit{f.visits===1?"":"s"}</span>
                </div>
                {/* The WHY, stated as the rule with its numbers. An operator has to
                    be able to phone a member about this and defend it. */}
                <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.5,margin:"4px 0 8px"}}>{f.reason}</p>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  <Btn onClick={()=>act(f,"acted")} style={{padding:"5px 11px"}}><Check size={13}/> I&rsquo;ve reached out</Btn>
                  <Btn variant="ghost" onClick={()=>act(f,"dismissed")} style={{padding:"5px 11px"}}>Not a concern</Btn>
                </div>
              </div>
            ))}

            {/* Handled work stays visible rather than vanishing — partly so the
                operator can undo, and partly because "we acted on 9 of 11" is the
                measurement A3 actually asks for. */}
            {atRiskHandled.length > 0 && (
              <div style={{marginTop:"12px",paddingTop:"12px",borderTop:"1px solid var(--border)"}}>
                <button onClick={()=>setShowHandled(s=>!s)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px"}}>
                  {showHandled ? "Hide" : "Show"} handled · {atRiskHandled.length}
                </button>
                {showHandled && atRiskHandled.map(f => (
                  <div key={`${f.memberId}:${f.rule}`} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 0",flexWrap:"wrap"}}>
                    <span style={{flex:1,minWidth:"140px",fontSize:"13px",color:"var(--text)"}}>{f.name || "Unnamed member"}</span>
                    <span style={{fontSize:"11px",color:"var(--muted)"}}>
                      {f.action === "acted" ? "Reached out" : "Not a concern"}
                      {f.actionAt ? ` · ${new Date(f.actionAt).toLocaleDateString()}` : ""}
                    </span>
                    <button onClick={()=>act(f,"reopened")} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"600",padding:"3px 8px"}}>Undo</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* P6 instrument (I4). Shown even with no data, and explicitly as "not
              measured yet" rather than a passing tick — the whole reason this
              exists is that an unmeasured design law was indistinguishable from
              a met one. */}
          <div style={{...card,display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:"200px"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>Check-in speed</div>
              <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginTop:"2px"}}>
                {p6.medianSec == null
                  ? `Not measured yet — check members in from the Class Runner and the typical time per member appears here. The target is under ${P6_TARGET_SEC}s.`
                  : `Typical time per member across ${p6.sessions} class${p6.sessions===1?"":"es"} (${p6.members} check-in${p6.members===1?"":"s"}). Target is under ${P6_TARGET_SEC}s; long idle gaps are excluded.`}
              </p>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontFamily:"var(--display)",fontSize:"26px",fontWeight:"800",
                           color:p6.meetsTarget==null?"var(--muted)":p6.meetsTarget?"var(--green)":"var(--accent)"}}>
                {p6.medianSec == null ? "—" : `${p6.medianSec}s`}
              </div>
              <div style={{fontSize:"10px",letterSpacing:"1px",fontWeight:"600",color:"var(--muted)"}}>
                {p6.meetsTarget==null?"NO DATA":p6.meetsTarget?"MEETS TARGET":"OVER TARGET"}
              </div>
            </div>
          </div>

          {/* ── CSV backfill ───────────────────────────────────────────── */}
          <div style={card}>
            <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>Import attendance history</div>
            <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:"12px"}}>
              Bring past check-ins across from your previous system. A CSV with a <strong>member name
              (or email)</strong> and a <strong>date</strong> is enough; a class name, type and coach
              are used when present. Nothing is written until you review what was read.
            </p>

            <div style={{display:"flex",gap:"10px",alignItems:"center",flexWrap:"wrap",marginBottom:"10px"}}>
              <label style={{display:"inline-flex",alignItems:"center",gap:"7px",padding:"8px 14px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>
                <Upload size={14}/> Choose CSV
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{display:"none"}}/>
              </label>
              <label style={{display:"inline-flex",alignItems:"center",gap:"7px",fontSize:"12px",color:"var(--muted)",cursor:"pointer"}}>
                <input type="checkbox" checked={dayFirst} onChange={e=>{setDayFirst(e.target.checked); setAnalysis(null);}}/>
                Dates are day/month (e.g. 03/04 = 3 April)
              </label>
            </div>

            <textarea
              value={csv} onChange={e=>{setCsv(e.target.value); setAnalysis(null); setResult(null);}}
              placeholder={"…or paste CSV here:\n\nMember Name,Email,Date,Class\nSarah Chen,sarah@example.com,2026-03-04,Tuesday 6pm"}
              style={{width:"100%",minHeight:"110px",padding:"10px 12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"12px",fontFamily:"ui-monospace,monospace",outline:"none",resize:"vertical"}}
            />

            <div style={{display:"flex",gap:"8px",marginTop:"10px",flexWrap:"wrap"}}>
              {/* Btn's prop is `variant` (default "primary") — passing a bare
                  `primary` leaks an unknown attribute to the DOM. Once a preview
                  exists, Import is the primary action and the other two step back. */}
              <Btn onClick={analyze} variant={analysis?.ok?"ghost":"primary"} disabled={!csv.trim()}
                   style={!csv.trim()?{opacity:.45,cursor:"not-allowed"}:{}}>Read the file</Btn>
              {analysis?.ok && <Btn onClick={apply}>Import {analysis.rows.length} check-in{analysis.rows.length===1?"":"s"}</Btn>}
              {analysis && <Btn variant="ghost" onClick={()=>{setAnalysis(null);setResult(null);}}>Cancel</Btn>}
            </div>

            {/* Preview. Everything the apply will do, before it does any of it. */}
            {analysis && !analysis.ok && (
              <div style={{marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #F5576C55",background:"#F5576C14",fontSize:"12px",color:"var(--text)",lineHeight:1.6}}>
                {analysis.error}
              </div>
            )}
            {analysis?.ok && (
              <div style={{marginTop:"12px",padding:"12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"var(--bg)",fontSize:"12px",color:"var(--text)",lineHeight:1.7}}>
                <div style={{fontWeight:"700",marginBottom:"6px"}}>{describeImport(analysis)}</div>
                {analysis.newMembers.length > 0 && (
                  <div style={{color:"var(--muted)"}}>
                    New members: {analysis.newMembers.slice(0,8).map(m=>m.name).join(", ")}
                    {analysis.newMembers.length>8?` +${analysis.newMembers.length-8} more`:""}
                  </div>
                )}
                {analysis.problems.length > 0 && (
                  <details style={{marginTop:"6px"}}>
                    <summary style={{cursor:"pointer",color:"var(--accent)"}}>{analysis.problems.length} row(s) couldn’t be read — they will be skipped</summary>
                    <div style={{marginTop:"6px",color:"var(--muted)",maxHeight:"140px",overflowY:"auto"}}>
                      {analysis.problems.slice(0,40).map(p => <div key={p.line}>Line {p.line}: {p.why}</div>)}
                    </div>
                  </details>
                )}
              </div>
            )}
            {result?.ok && (
              <div style={{marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #7BE3A455",background:"#7BE3A414",fontSize:"12px",color:"var(--text)",lineHeight:1.6}}>
                Imported <strong>{result.attendance}</strong> check-in{result.attendance===1?"":"s"} across {result.classes} new class{result.classes===1?"":"es"}
                {result.members>0?`, adding ${result.members} member${result.members===1?"":"s"}`:""}.
                {result.duplicates>0?` ${result.duplicates} were already recorded and were skipped.`:""}
              </div>
            )}
          </div>

          {/* ── Roster ─────────────────────────────────────────────────── */}
          <div style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",marginBottom:"12px",flexWrap:"wrap"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>Roster · {members.length}</div>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search members…"
                style={{padding:"7px 11px",borderRadius:"7px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"12px",outline:"none",minWidth:"180px"}}/>
            </div>
            {members.length === 0 ? (
              <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6}}>
                No members yet. Import a CSV above, or check people in from the Class Runner —
                a name is all that’s needed and the roster row is created for you.
              </p>
            ) : shown.length === 0 ? (
              <p style={{fontSize:"12px",color:"var(--muted)"}}>No member matches “{q}”.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                {shown.slice(0, 200).map(m => (
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 10px",borderRadius:"7px",background:"var(--bg)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.name||"(no name)"}</div>
                      {m.email&&<div style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.email}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"var(--accent)"}}>{visitsFor(m.id)}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)"}}>{lastSeen(m.id)||"never"}</div>
                    </div>
                  </div>
                ))}
                {shown.length > 200 && <p style={{fontSize:"11px",color:"var(--muted)",padding:"8px 10px"}}>Showing the first 200 of {shown.length}.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unsynced-data banner (infra backlog I3) ─────────────────────────────────
// store.js now records EVERY failed background write to a persisted ledger, and
// the hydrate guards stop a stale server copy overwriting local data. But a guard
// that works silently is indistinguishable from no problem at all: the coach's
// data is safe on this device and simply absent everywhere else, with nothing on
// screen saying so. The Personas screen already had a per-domain banner; this is
// the general one, so a failure in ANY domain is visible rather than only in the
// one screen that happened to be instrumented.
//
// Deliberately calm: nothing is lost, retries are automatic, and a coach mid-class
// must not be alarmed by a transient network blip.
const SYNC_DOMAIN_LABELS = {
  class_schedule_rules: "schedule", library_overrides: "exercise library",
  brand_profiles: "branding", user_prefs: "preferences", coach_personas: "coach personas",
  persona_plans: "class plans", persona_movements: "movement catalog",
  persona_generations: "generated classes", members: "members",
  class_instances: "classes", attendance: "attendance", session_history: "session history",
};
function SyncBanner() {
  const [errs, setErrs] = useState(() => store.syncErrors());
  useEffect(() => {
    // Poll rather than subscribe: writes are fire-and-forget from ~30 call sites,
    // and a localStorage read every 15s is far cheaper than threading a callback
    // through all of them.
    const t = setInterval(() => setErrs(store.syncErrors()), 15000);
    return () => clearInterval(t);
  }, []);
  if (!errs.length) return null;
  const names = [...new Set(errs.map(e => SYNC_DOMAIN_LABELS[e.table] || e.table))];
  return (
    <div style={{padding:"9px 24px",background:"#F59E0B14",borderBottom:"1px solid #F59E0B55",fontSize:"12px",color:"var(--text)",lineHeight:1.5}}>
      <strong>Some changes haven’t synced yet</strong> ({names.join(", ")}). They’re saved on this
      device and Jungle keeps retrying, so nothing is lost — but they won’t appear on another
      device until the sync succeeds.
    </div>
  );
}

// Extraction provenance, stored INSIDE persona_plans.plan (free-form jsonb) rather
// than as a new `source` value — persona_plans.source is CHECK-constrained to
// google_slides|manual|jungle, and inventing a fourth value is exactly the mistake
// that silently destroyed a corpus on 2026-07-18. Nothing downstream reads keys
// other than `blocks`, so this rides along safely and makes it possible to tell,
// later, which plans came from the parser and which from the model.
const extractMeta = (via, confidence) => ({
  via,                                   // "parser" | "llm"
  confidence: via === "parser" ? confidence : null,
  parserVersion: via === "parser" ? PARSER_VERSION : null,
  at: new Date().toISOString(),
});

// Coach-first: a persona is a coach; class type (S360 / GC / Enduro…) is a
// dimension within them. Open a coach → tab per class type → that class type's
// derived profile + editable movement catalog + past plans + draft/generate.
// Runs on localStorage; syncs to coach_personas/persona_plans/persona_movements
// once 0005 is applied. LLM generation arrives with the Edge Function (chunk 2).
function PersonasScreen({ onBack, onDraftToBuilder }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const [personas, setPersonas] = useState(() => store.getPersonas());
  const [plans, setPlans]       = useState(() => store.getPersonaPlans());
  const [movements, setMovements] = useState(() => store.getPersonaMovements());
  const [generations, setGenerations] = useState(() => store.getPersonaGenerations());
  const [selectedId, setSelectedId] = useState(() => store.getPersonas()[0]?.id || null);
  const [activeCT, setActiveCT] = useState(null);
  const [form, setForm] = useState({ name:"", kind:"coach", description:"" });
  const [editHead, setEditHead] = useState(false);
  const [headForm, setHeadForm] = useState({ name:"", description:"" });
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ title:"", classType:"", focus:"", json:"" });
  const [planErr, setPlanErr] = useState("");
  const [editingPlan, setEditingPlan] = useState(null);
  // Google Slides import (chunk 3): folder → deck list → per-deck extract.
  const [showSlides, setShowSlides] = useState(false);
  const [slidesFolder, setSlidesFolder] = useState("");
  const [slideDecks, setSlideDecks] = useState(null);   // null = not listed yet
  const [deckSel, setDeckSel] = useState(() => new Set());
  const [slidesBusy, setSlidesBusy] = useState("");     // "" | "list" | "import"
  const [slidesErr, setSlidesErr] = useState("");
  const [slidesProg, setSlidesProg] = useState(null);   // { done, total, current }
  const [planMode, setPlanMode] = useState("json"); // "json" = paste extraction JSON · "text" = paste deck text → LLM extract
  const [planBusy, setPlanBusy] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [brief, setBrief] = useState({ focus:"", durationMin:"45", weekX:"", weekN:"" });

  useEffect(() => {
    let alive = true;
    store.hydratePersonas().then(r => {
      if (!alive || !r) return;
      setPersonas(r.personas); setPlans(r.plans); setMovements(r.movements || []);
      if (r.generations) setGenerations(r.generations);
      setSelectedId(id => id || r.personas[0]?.id || null);
    });
    return () => { alive = false; };
  }, []);

  // Backfill the movement catalog for any persona that has plans but no catalog
  // rows yet — e.g. plans arriving from a bulk import or a fresh load. Runs only
  // when a persona is missing entirely, so it never clobbers curated edits.
  useEffect(() => {
    if (!personas.length || !plans.length) return;
    const have = new Set(movements.map(m => m.personaId));
    const missing = personas.filter(p => !have.has(p.id) && plans.some(pl => pl.personaId === p.id));
    if (!missing.length) return;
    let cat = movements.slice();
    missing.forEach(p => {
      const pplans = plans.filter(pl => pl.personaId === p.id);
      cat = cat.concat(aggregateMovements(pplans, []).map(m => ({ ...m, personaId: p.id })));
    });
    setMovements(store.savePersonaMovements(cat));
  }, [personas, plans]); // movements omitted by design — guard prevents re-runs

  // Recompute a persona's movement catalog from its plans (using the current
  // catalog so alias/name edits fold occurrences together), persist, setState.
  const recompute = (allPlans, catalog, pid) => {
    const untouched = catalog.filter(m => m.personaId !== pid);
    const existing  = catalog.filter(m => m.personaId === pid);
    const pplans    = allPlans.filter(pl => pl.personaId === pid);
    const derived   = aggregateMovements(pplans, existing).map(m => ({ ...m, personaId: pid }));
    const merged = store.savePersonaMovements([...untouched, ...derived]);
    setMovements(merged);
  };

  const commitPersonas = list => { setPersonas(list); store.savePersonas(list); };
  // Sync is fire-and-forget, so re-read the failure ledger shortly after each save
  // to drive the banner. 1.2s comfortably covers a round trip without making the
  // save feel blocking; a slower network just means the banner appears a beat late.
  const [planSyncErr, setPlanSyncErr] = useState(() => store.syncErrorFor("persona_plans"));
  const commitPlans = (list, pid = selectedId) => {
    setPlans(list); store.savePersonaPlans(list);
    if (pid) recompute(list, movements, pid);
    setTimeout(() => setPlanSyncErr(store.syncErrorFor("persona_plans")), 1200);
  };

  const createPersona = () => {
    const name = form.name.trim();
    if (!name) return;
    const p = { id: store.newId(), name, kind: form.kind, description: form.description.trim(),
                styleProfile: {}, profileUpdatedAt: null };
    commitPersonas([...personas, p]);
    setSelectedId(p.id);
    setForm({ name:"", kind:"coach", description:"" });
  };
  const saveHead = () => {
    const name = headForm.name.trim(); if (!name) return;
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, name, description: headForm.description.trim() } : p));
    setEditHead(false);
  };
  const removePersona = id => {
    const r = store.deletePersona(id);
    const moves = store.savePersonaMovements(store.getPersonaMovements().filter(m => m.personaId !== id));
    const gens = store.getPersonaGenerations().filter(g => g.personaId !== id); // server rows cascade via FK
    store.savePersonaGenerations(gens);
    setPersonas(r.personas); setPlans(r.plans); setMovements(moves); setGenerations(gens);
    if (selectedId === id) setSelectedId(r.personas[0]?.id || null);
  };
  const seedSample = () => {
    const now = personas.slice();
    const newPlans = plans.slice();
    const touched = [];
    SEED_PERSONAS.forEach(sp => {
      if (now.some(p => p.name === sp.name)) return; // idempotent by name
      const id = store.newId(); touched.push(id);
      now.push({ id, name: sp.name, kind: sp.kind, description: sp.description,
                 styleProfile: sp.styleProfile || {}, profileUpdatedAt: new Date().toISOString() });
      (sp.plans || []).forEach(pl => newPlans.push({
        id: store.newId(), personaId: id, source: pl.source || "jungle", sourceRef: "",
        title: pl.title, classType: pl.classType || "", focus: pl.focus || "", planDate: "", plan: pl.plan || {},
      }));
    });
    commitPersonas(now);
    setPlans(newPlans); store.savePersonaPlans(newPlans);
    let cat = movements;
    touched.forEach(pid => {
      const pplans = newPlans.filter(pl => pl.personaId === pid);
      const derived = aggregateMovements(pplans, []).map(m => ({ ...m, personaId: pid }));
      cat = [...cat, ...derived];
    });
    setMovements(store.savePersonaMovements(cat));
    setSelectedId(id => id || now[0]?.id || null);
  };

  const addPlan = () => {
    setPlanErr("");
    let parsed;
    try { parsed = JSON.parse(planForm.json); }
    catch (e) { setPlanErr("That doesn't look like a class. Paste the class text instead — Jungle will read it."); return; }
    const planObj = Array.isArray(parsed) ? { blocks: parsed } : (parsed.blocks ? parsed : { blocks: [] });
    if (!Array.isArray(planObj.blocks) || !planObj.blocks.length) { setPlanErr("No exercises found in that text. Check it includes the movements and sets, then try again."); return; }
    const ct = planForm.classType.trim();
    const pl = { id: store.newId(), personaId: selectedId, source: "manual", sourceRef: "",
                 title: planForm.title.trim() || "Untitled plan", classType: ct,
                 focus: planForm.focus.trim(), planDate: "", plan: planObj };
    commitPlans([...plans, pl]);
    setPlanForm({ title:"", classType:"", focus:"", json:"" });
    setShowAddPlan(false);
    if (ct) setActiveCT(ct);
  };
  // Paste raw deck text → the DETERMINISTIC parser first (src/lib/planParser.js),
  // with persona-ai (task:"extract") as the fallback for notation it can't read.
  // See spec §4.3.1: these are house formats — a private grammar repeated weekly —
  // so the model should be the cold-start tool, not the steady-state engine.
  const extractAndAdd = async () => {
    setPlanErr("");
    const text = (planForm.json || "").trim();
    if (!text) { setPlanErr("Paste the class text first."); return; }
    setPlanBusy(true);
    try {
      let data = null, via = "parser", conf = 0;
      const parsed = parsePlanText(text, {
        classTypeHint: planForm.classType.trim(), title: planForm.title.trim(),
        // Same per-coach hints as the Slides import — a pasted deck benefits from
        // the coach's known vocabulary just as much as an imported one.
        hints: deriveHints(plans.filter(pl => pl.personaId === selectedId),
                           movements.filter(m => m.personaId === selectedId)),
      });
      if (parsed.confidence >= PARSE_THRESHOLD) {
        data = parsed; conf = parsed.confidence;
      } else {
        // Below threshold the parser DEFERS rather than guessing. Without the Edge
        // Function there is nothing to defer to, so say what the parser saw — that
        // is more actionable than a bare "extraction needs the function".
        // A coach is never shown a confidence percentage or the name of a
        // service (UI-UX §4). They are told what to DO. The parser's own reason
        // is kept out of the message for the same reason — it is written for us.
        if (!(supabaseEnabled && supabase)) {
          throw new Error("PARTIAL_READ");
        }
        const r = await supabase.functions.invoke("persona-ai", { body: {
          task: "extract", text, classType: planForm.classType.trim(), title: planForm.title.trim(), focus: planForm.focus.trim() } });
        if (r.error) throw new Error(await fnErrorMessage(r.error));
        if (r.data?.error) throw new Error(r.data.error);
        data = r.data; via = "llm";
      }
      const blocks = data?.plan?.blocks || [];
      if (!blocks.length) throw new Error("NO_EXERCISES");
      const ct = (planForm.classType.trim() || data.classType || "").trim();
      // "manual" — the coach supplied the deck text themselves. MUST be one of the
      // three values persona_plans' CHECK constraint allows (see store.planSource);
      // "extract" was silently failing every sync.
      const pl = { id: store.newId(), personaId: selectedId, source: "manual", sourceRef: "",
                   title: planForm.title.trim() || data.title || "Untitled plan", classType: ct,
                   focus: planForm.focus.trim() || data.focus || "", planDate: "",
                   plan: { blocks, _extract: extractMeta(via, conf) } };
      commitPlans([...plans, pl]);
      setPlanForm({ title:"", classType:"", focus:"", json:"" });
      setShowAddPlan(false);
      if (ct) setActiveCT(ct);
    } catch (e) {
      setPlanErr(readErrorMessage(e));
    } finally { setPlanBusy(false); }
  };
  const savePlanEdit = updated => { commitPlans(plans.map(pl => pl.id === updated.id ? updated : pl)); setEditingPlan(null); };
  const removePlan = id => commitPlans(store.deletePersonaPlan(id));

  const changeMovement = updated => {
    const list = movements.map(m => m.id === updated.id ? updated : m);
    recompute(plans, list, selectedId); // re-fold occurrences under any new alias/name
  };
  const deleteMovement = id => setMovements(store.deletePersonaMovement(id));

  const selected = personas.find(p => p.id === selectedId) || null;
  const selPlans = plans.filter(pl => pl.personaId === selectedId);
  const classTypes = classTypesOf(selPlans);
  const curCT = (activeCT && classTypes.includes(activeCT)) ? activeCT : (classTypes[0] || null);
  const ctPlans = selPlans.filter(pl => ctOf(pl) === curCT);
  const prof = curCT ? aggregateClassType(selPlans, curCT) : null;
  const category = curCT ? classCategory(selPlans, curCT) : "mixed";
  const builderClass = CATEGORY_TO_BUILDER[category] || "bootcamp";
  const recentGens = generations.filter(g => g.personaId === selectedId && g.classType === curCT);
  const ctMoves = movements.filter(m => m.personaId === selectedId && (m.classTypes?.[curCT] || 0) > 0);
  const extracted = selected?.styleProfile?.byClassType?.[curCT] || {};
  const countFor = id => plans.filter(pl => pl.personaId === id).length;

  // ── Class shape (§9.1) — the coach's format as an editable object ──────────
  // Derived from their own corpus, then reconciled with whatever they have
  // edited. The edit ALWAYS wins; a divergence rides along as `contradiction`
  // for the card to surface rather than resolve (§13 Q7).
  const derivedBp = curCT ? deriveBlueprint(selPlans, curCT, ctMoves) : null;
  const blueprint = curCT ? reconcileBlueprint(selected?.styleProfile?.blueprints?.[curCT] || null, derivedBp) : null;
  const saveBlueprint = bp => {
    if (!selectedId || !curCT) return;
    // `contradiction` is a transient view concern computed on each reconcile —
    // persisting it would freeze one moment's drift into the coach's own record.
    const { contradiction: _drop, ...clean } = bp || {};
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: {
      ...(p.styleProfile || {}),
      blueprints: { ...((p.styleProfile || {}).blueprints || {}), [curCT]: clean },
    } } : p));
  };
  // Deterministic drafting from the coach's shape — no model involved. The
  // structure is theirs, the movements are theirs, the selection is arithmetic
  // (§9.3). Unlike generateForCT this works with Supabase off.
  const draftFromShape = () => {
    if (!blueprint) return;
    const { blocks } = draftFromBlueprint(blueprint, ctMoves, { classType: curCT, recent: recentGens });
    if (!blocks.length) return;
    const label = `${curCT} — from your class shape`;
    setGenerations(store.appendPersonaGeneration({ personaId: selectedId, classType: curCT, category,
      title: label, focus: "", brief: {}, movements: blockMovementNames(blocks), plan: { blocks } }));
    onDraftToBuilder(planToStages({ blocks }), label, builderClass);
  };

  // Deterministic fallback: seed the Builder from the coach's most recent plan for
  // this class type. Used when the Edge Function is absent or errors.
  const draftFromRecent = () => { const src = ctPlans[0]; if (src) onDraftToBuilder(planToStages(src.plan), `${curCT} — draft`, builderClass); };
  // True in-style generation: persona-ai (task:"generate") grounded on the derived
  // profile + movement catalog + a few past plans + the brief. Falls back to
  // draftFromRecent when Supabase is off or the function errors.
  const generateForCT = async () => {
    if (!curCT || !prof) return;
    setGenErr("");
    if (!(supabaseEnabled && supabase)) { draftFromRecent(); setShowGen(false); return; }
    setGenBusy(true);
    try {
      const payload = {
        task: "generate",
        persona: { name: selected?.name || "", kind: selected?.kind || "coach" },
        classType: curCT,
        category,
        brief: {
          focus: brief.focus.trim(),
          durationMin: Number(brief.durationMin) || undefined,
          weekX: brief.weekX ? Number(brief.weekX) : undefined,
          weekN: brief.weekN ? Number(brief.weekN) : undefined,
        },
        profile: prof,
        // The coach's fixed structure (§9.3): the model fills slots, it does not
        // decide the shape of the class. NOTE: unverified — the generate path
        // needs persona-ai redeployed and cannot be exercised locally at all.
        blueprint: blueprint ? { name: blueprint.name, slots: blueprint.slots } : undefined,
        catalog: ctMoves.map(m => ({ name: m.name, equip: m.equip || "", category: categoryOf(m), aliases: m.aliases || [] })),
        examples: ctPlans.slice(0, 3).map(pl => ({ title: pl.title, focus: pl.focus || "", plan: pl.plan })),
        // Items 6–8: what's already been recommended to THIS coach for THIS class type,
        // so the model produces something meaningfully different.
        recent: generations.filter(g => g.personaId === selectedId && (g.classType || "") === curCT)
                  .slice(0, 6).map(g => ({ title: g.title, focus: g.focus, movements: (g.movements || []).slice(0, 12) })),
      };
      const { data, error } = await supabase.functions.invoke("persona-ai", { body: payload });
      if (error) throw new Error(await fnErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      const blocks = data?.plan?.blocks || [];
      if (!blocks.length) throw new Error("no blocks came back");
      const label = data.title || `${curCT}${brief.focus.trim() ? " — " + brief.focus.trim() : " — generated"}`;
      // Record the recommendation so the next generation for this coach avoids repeating it.
      setGenerations(store.appendPersonaGeneration({ personaId: selectedId, classType: curCT, category,
        title: label, focus: brief.focus.trim(), brief: payload.brief, movements: blockMovementNames(blocks), plan: { blocks } }));
      onDraftToBuilder(planToStages({ blocks }), label, builderClass);
      setShowGen(false);
    } catch (e) {
      setGenErr(`Generation failed: ${e.message || e}. Drafted from the most recent plan instead.`);
      draftFromRecent();
    } finally { setGenBusy(false); }
  };

  // ── Google Slides import (chunk 3) ────────────────────────────────────────
  // The coach's decks live in their own Drive folder: token → list the folder's
  // presentations → per-deck slide text → persona-ai task:"extract" → fold into
  // the corpus. sourceRef carries the presentation id so re-imports dedupe;
  // the folder is remembered on the persona (styleProfile syncs to Supabase).
  // Add class → Paste deck text stays as the manual fallback.
  const importedRefs = new Set(selPlans.map(pl => pl.sourceRef).filter(Boolean));
  const openSlides = () => {
    setShowSlides(s => !s);
    setSlidesErr(""); setSlideDecks(null); setDeckSel(new Set()); setSlidesProg(null);
    setSlidesFolder(selected?.styleProfile?.slidesFolder || "");
  };
  const listSlideDecks = async () => {
    setSlidesErr("");
    if (!parseDriveId(slidesFolder)) { setSlidesErr("Paste the coach's Drive folder link, a Slides deck link, or its ID."); return; }
    setSlidesBusy("list");
    try {
      const token = await getSlidesToken();
      // The pasted link may be a whole folder OR one deck — Drive tells us which.
      const target = await resolveDriveTarget(token, slidesFolder);
      const decks = target.kind === "presentation" ? [target.deck] : await listPresentations(token, target.id);
      setSlideDecks(decks);
      setDeckSel(new Set(decks.filter(d => ![...importedRefs].some(ref => ref === d.id || ref.startsWith(`${d.id}#`))).map(d => d.id)));
      if ((selected?.styleProfile?.slidesFolder || "") !== slidesFolder.trim())
        commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: { ...(p.styleProfile || {}), slidesFolder: slidesFolder.trim() } } : p));
      if (!decks.length) setSlidesErr("No Google Slides decks found in that folder.");
    } catch (e) { setSlidesErr(`Couldn't read that link: ${e.message || e}`); }
    finally { setSlidesBusy(""); }
  };
  const importSlideDecks = async () => {
    // No Supabase check up front any more: the deterministic parser handles most
    // slides with no Edge Function at all, so refusing the whole import here would
    // block work that no longer needs a server. Slides that the parser defers are
    // reported individually below if persona-ai isn't reachable.
    const canDefer = !!(supabaseEnabled && supabase);
    const chosen = (slideDecks || []).filter(d => deckSel.has(d.id));
    if (!chosen.length) { setSlidesErr("Select at least one deck to import."); return; }
    setSlidesErr(""); setSlidesBusy("import");
    const added = []; const failed = []; let skipped = 0; let parsedCount = 0;
    try {
      const token = await getSlidesToken();
      // A deck often holds a whole HISTORY of classes — one class per slide. Pull each
      // deck's text, split it into per-slide class plans, and extract each slide on its
      // own (the extractor handles ONE class at a time; a whole multi-class deck returns
      // no usable plan). Per-slide sourceRef ("<deckId>#s<N>") dedupes at the slide level.
      const units = [];
      for (const d of chosen) {
        let text = "";
        try { ({ text } = await fetchPresentationText(token, d.id)); }
        catch (e) { failed.push(`${d.name} — ${e.message || e}`); continue; }
        const slides = splitDeckSlides(text);
        console.log(`[slides-import] "${d.name}" — ${text.trim().length} chars, ${slides.length} slide(s)`);
        if (!text.trim()) { failed.push(`${d.name} — no readable text (deck may be image-based; the Slides API can't read words inside pictures)`); continue; }
        for (const s of slides) {
          const ref = slides.length > 1 ? `${d.id}#s${s.n}` : d.id;
          units.push({ deck: d, n: s.n, multi: slides.length > 1, text: s.text, ref, date: slideDate(s.text) });
        }
      }
      // Drop already-imported slides, then drop the ones that plainly aren't classes
      // (title cards, hype quotes, playlists) — those used to cost a full LLM call each
      // just to return zero blocks, and the free tier is metered per REQUEST.
      const unseen = units.filter(u => !importedRefs.has(u.ref));
      const classy = unseen.filter(u => looksLikeClassSlide(u.text));
      skipped += unseen.length - classy.length;

      // Turn a plan payload from either path into the corpus row shape.
      const rowFor = (u, data, via = "llm", conf = 0) => ({
        // "google_slides", not "slides" — persona_plans' CHECK constraint allows only
        // google_slides | manual | jungle, and the wrong value made every imported
        // plan fail to sync, then vanish on the next hydrate. See store.planSource.
        id: store.newId(), personaId: selectedId, source: "google_slides", sourceRef: u.ref,
        title: data.title || `${u.deck.name}${u.multi ? ` (slide ${u.n})` : ""}`,
        classType: (data.classType || "").trim(), focus: data.focus || "",
        planDate: u.date || (u.deck.modifiedTime || "").slice(0, 10),
        plan: { blocks: data.plan.blocks, _extract: extractMeta(via, conf) },
      });
      // Persist what's extracted so far. A long import used to hold everything in
      // memory until the very end — closing the tab at slide 15 of 18 lost the lot.
      const flush = () => { if (added.length) commitPlans([...plans, ...added]); };

      // ── DETERMINISTIC PASS (spec §4.3.1 / infra I2) ─────────────────────────
      // These decks are HOUSE FORMATS: S360, GC and Enduro repeat the same private
      // notation every week. Parse each slide locally first and only send what the
      // parser could NOT confidently read to Gemini. Every slide that parses here
      // costs zero quota, returns instantly, and — the point — is REPRODUCIBLE:
      // re-importing a deck yields byte-identical output, so the derived style
      // profile can no longer drift just because the model felt different today.
      //
      // The parser defers rather than guessing, so a low score means "ask the
      // model", never "emit a half-understood plan".
      // Per-coach hints (§4.3.2): this coach's OWN corpus — their movement
      // vocabulary, class types and block labels — is evidence about their
      // notation, so slides the generic rules would defer can often be read for
      // free. The share grows with every import, which is what makes the model a
      // cold-start tool rather than the steady-state engine.
      const hints = deriveHints(plans.filter(pl => pl.personaId === selectedId),
                                movements.filter(m => m.personaId === selectedId));
      const todo = [];
      for (const u of classy) {
        const p = parsePlanText(u.text, { classTypeHint: "", title: u.deck.name, hints });
        if (p.confidence >= PARSE_THRESHOLD && p.plan.blocks.length) {
          added.push(rowFor(u, p, "parser", p.confidence));
          parsedCount++;
        } else {
          todo.push(u);
        }
      }
      if (parsedCount) {
        console.log(`[slides-import] parsed ${parsedCount}/${classy.length} slide(s) locally — ${todo.length} deferred to persona-ai`);
        flush();        // crash-safe: the free slides are already banked
      }
      // Deferred slides with nowhere to defer to. Report them rather than dropping
      // them silently — an unimported slide the coach never hears about is the same
      // class of bug as a plan that syncs into the void.
      if (todo.length && !canDefer) {
        failed.push(`${todo.length} class${todo.length===1?"":"es"} couldn't be read automatically. Open ${todo.length===1?"it":"them"} in Slides, copy the text, and use Add class → Paste class text.`);
        todo.length = 0;
      }
      // Batch WITHIN a deck: slide numbers and the deck title hint are per-deck.
      const batches = [];
      for (const d of chosen) {
        const mine = todo.filter(u => u.deck.id === d.id);
        for (let i = 0; i < mine.length; i += SLIDE_BATCH) batches.push({ deck: d, units: mine.slice(i, i + SLIDE_BATCH) });
      }

      // One call per batch, falling back to one call per slide if the batch fails —
      // so batching is a quota optimisation that can never cost us an import.
      const extractOne = async (u) => {
        const { data, error } = await supabase.functions.invoke("persona-ai", { body: { task: "extract", text: u.text.slice(0, 120000), title: u.deck.name } });
        if (error) throw new Error(await fnErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return (data?.plan?.blocks || []).length ? [{ u, data }] : [];
      };
      const extractBatch = async (b) => {
        if (b.units.length === 1) return extractOne(b.units[0]);
        const { data, error } = await supabase.functions.invoke("persona-ai", { body: {
          task: "extract_batch", title: b.deck.name,
          slides: b.units.map(u => ({ n: u.n, text: u.text.slice(0, 120000) })),
        } });
        if (error) throw new Error(await fnErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.plans)) throw new Error("batch response had no plans array");
        // Map each returned plan back to its slide by number.
        return data.plans.map(p => { const u = b.units.find(x => x.n === p.n); return u ? { u, data: p } : null; }).filter(Boolean);
      };

      let done = 0;
      outer:
      for (let bi = 0; bi < batches.length; bi++) {
        const b = batches[bi];
        const label = b.units.length > 1
          ? `${b.deck.name} · slides ${b.units[0].n}–${b.units[b.units.length - 1].n}`
          : (b.units[0].multi ? `${b.deck.name} · slide ${b.units[0].n}` : b.deck.name);
        setSlidesProg({ done, total: todo.length, current: label });

        let got = null;
        for (let attempt = 0; ; attempt++) {
          try { got = await extractBatch(b); break; }
          catch (e) {
            const msg = e?.message || String(e);
            // Daily cap: every remaining call fails the same way. Stop the whole import
            // now and say so, instead of burning ~3 min of pointless waiting per batch.
            if (DAILY_QUOTA_GONE.test(msg)) {
              failed.push(`free Gemini DAILY quota is exhausted — it resets around midnight US Pacific. ${added.length} plan${added.length === 1 ? "" : "s"} imported before it ran out; re-run the import after the reset and already-imported slides will be skipped automatically`);
              break outer;
            }
            if (RATE_LIMITED.test(msg) && attempt < 6) {
              const wait = (retryAfterSecs(msg) || 30) + 2;
              setSlidesProg({ done, total: todo.length, current: `${label} — free-tier limit, waiting ${wait}s…`, waiting: true });
              await new Promise(r => setTimeout(r, wait * 1000));
              continue;
            }
            // The batch itself failed (bad JSON, truncation, a model hiccup). Retry the
            // slides one at a time so one awkward slide can't sink its four neighbours.
            if (b.units.length > 1) {
              for (const u of b.units) {
                try { const r = await extractOne(u); r.length ? added.push(rowFor(u, r[0].data)) : skipped++; }
                catch (e2) { failed.push(`${b.deck.name} s${u.n} — ${e2?.message || e2}`); }
                await new Promise(r => setTimeout(r, 800));
              }
              got = null;
            } else {
              failed.push(`${b.deck.name}${b.units[0].multi ? ` s${b.units[0].n}` : ""} — ${msg}`);
              got = [];
            }
            break;
          }
        }
        if (got) {
          got.forEach(({ u, data }) => added.push(rowFor(u, data)));
          skipped += b.units.length - got.length;   // slides the model found no workout on
        }
        done += b.units.length;
        flush();                                    // crash-safe: persist each batch
        if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 800)); // gentle pace
      }
    } catch (e) { failed.push(`${e.message || e}`); }
    setSlidesProg(null); setSlidesBusy("");
    if (added.length) {
      commitPlans([...plans, ...added]);
      const ct = added.find(pl => pl.classType)?.classType;
      if (ct) setActiveCT(ct);
      setDeckSel(new Set());
    }
    const skipNote = skipped ? `, skipped ${skipped} non-class slide${skipped === 1 ? "" : "s"}` : "";
    // Report the split. It is the honest accounting of what this import actually
    // cost — and the only place a coach can see that most of their deck was read
    // for free, reproducibly, without a model in the loop.
    const aiCount = added.length - parsedCount;
    const viaNote = parsedCount
      ? ` (${parsedCount} read by the built-in parser${aiCount > 0 ? `, ${aiCount} by AI` : ""}, no AI quota used${aiCount > 0 ? " on those" : ""})`
      : "";
    if (failed.length) setSlidesErr(`Imported ${added.length} plan${added.length === 1 ? "" : "s"}${skipNote}${viaNote}. Failed: ${failed.join(" · ")}`);
    else if (added.length) { setSlidesErr(`Imported ${added.length} plan${added.length === 1 ? "" : "s"}${skipNote}${viaNote}.`); setShowSlides(false); }
    else setSlidesErr(`Nothing imported${skipNote || " — no class plans found in the selected deck(s)"}.`);
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>COACHES</p>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>Every coach's classes, style and formats — Jungle learns them and drafts new classes to match</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px 28px"}}>
        {/* A failed plan sync used to be console-only, so the corpus could silently
            stop persisting. Say it out loud — the plans are safe locally, but the
            coach needs to know they only exist on this device. */}
        {planSyncErr && (
          <div style={{maxWidth:"1200px",margin:"0 auto 16px",padding:"10px 14px",borderRadius:"8px",
                       border:"1px solid #F59E0B55",background:"#F59E0B14",fontSize:"12px",color:"var(--text)",lineHeight:"1.5"}}>
            <strong>These plans haven’t synced to your account yet.</strong> They’re saved on this
            device and Jungle will keep retrying, so nothing is lost — but they won’t appear on
            another device until the sync succeeds. <span style={{color:"var(--muted)"}}>({planSyncErr.msg})</span>
          </div>
        )}
        <div style={{maxWidth:"1200px",margin:"0 auto",display:"grid",gridTemplateColumns:isTablet?"1fr":"320px 1fr",gap:"20px",alignItems:"start"}}>

          {/* ── Left: create + persona list ─────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
            <div style={{...P_CARD,padding:"16px"}}>
              <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"10px"}}>Add a coach</p>
              <Input placeholder="Name — e.g. Coach Mike" value={form.name}
                     onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{marginBottom:"8px"}}/>
              <Select value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value}))} style={{marginBottom:"8px"}}>
                <option value="coach">A coach</option>
                <option value="house">The house style</option>
                <option value="format">A class format</option>
              </Select>
              <Input placeholder="Description (optional)" value={form.description}
                     onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{marginBottom:"10px"}}/>
              <Btn onClick={createPersona} style={{width:"100%",justifyContent:"center"}}><Plus size={14}/> Add coach</Btn>
            </div>

            {personas.length === 0 ? (
              <div style={{...P_CARD,padding:"16px",textAlign:"center"}}>
                <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:"1.6",marginBottom:"12px"}}>No coaches yet. Add one above, or load a sample coach to see how it works.</p>
                <Btn variant="ghost" onClick={seedSample} style={{width:"100%",justifyContent:"center"}}><Zap size={14}/> Load sample coach</Btn>
              </div>
            ) : (
              <div style={{...P_CARD,overflow:"hidden"}}>
                {personas.map(p => {
                  const on = p.id === selectedId;
                  return (
                    <div key={p.id} onClick={()=>{setSelectedId(p.id);setActiveCT(null);setEditHead(false);}}
                      style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 14px",cursor:"pointer",
                              borderBottom:"1px solid var(--border)",
                              background:on?"color-mix(in srgb, var(--accent) 10%, transparent)":"transparent"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"13px",fontWeight:on?"700":"600",color:on?"var(--accent)":"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
                          <span style={{color:KIND_COLOR[p.kind]||"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>{KIND_LABEL[p.kind]||p.kind}</span>
                          {"  ·  "}{countFor(p.id)} class{countFor(p.id)===1?"":"es"}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();removePersona(p.id);}} title="Delete persona"
                        style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={14}/></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: selected coach detail ────────────────────────────── */}
          {!selected ? (
            <div style={{...P_CARD,padding:"40px 24px",textAlign:"center",color:"var(--muted)"}}>
              <Users size={28} style={{opacity:0.5,marginBottom:"10px"}}/>
              <p style={{fontSize:"13px"}}>Pick a coach to see their class types and classes.</p>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
              {/* Persona head (editable) */}
              <div style={{...P_CARD,padding:"18px 20px"}}>
                {editHead ? (
                  <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                    <Input value={headForm.name} onChange={e=>setHeadForm(f=>({...f,name:e.target.value}))} placeholder="Persona name"/>
                    <Input value={headForm.description} onChange={e=>setHeadForm(f=>({...f,description:e.target.value}))} placeholder="Description"/>
                    <div style={{display:"flex",gap:"8px"}}><Btn onClick={saveHead}><Check size={14}/> Save</Btn><Btn variant="ghost" onClick={()=>setEditHead(false)}>Cancel</Btn></div>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
                        <h2 style={{fontSize:"20px",fontWeight:"800",color:"var(--text)",margin:0}}>{selected.name}</h2>
                        <Tag color={KIND_COLOR[selected.kind]||"var(--navy)"}>{KIND_LABEL[selected.kind]||selected.kind}</Tag>
                      </div>
                      {selected.description && <p style={{fontSize:"13px",color:"var(--muted)",lineHeight:"1.6"}}>{selected.description}</p>}
                    </div>
                    <button onClick={()=>{setHeadForm({name:selected.name,description:selected.description||""});setEditHead(true);}}
                      style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"5px 10px"}}>Edit</button>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"14px",flexWrap:"wrap"}}>
                  <Btn variant="ghost" onClick={()=>setShowAddPlan(s=>!s)} style={{padding:"6px 12px"}}><Plus size={13}/> Add class</Btn>
                  <button onClick={openSlides} style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"transparent",border:`1px solid ${showSlides?"var(--accent)":"var(--border)"}`,borderRadius:"6px",cursor:"pointer",color:showSlides?"var(--accent)":"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"6px 12px"}}><Upload size={13}/> Import from Google Slides</button>
                </div>
                {showSlides && (!slidesEnabled ? (
                  <p style={{fontSize:"12px",color:"var(--muted)",marginTop:"10px",lineHeight:"1.6",background:"var(--navy)",borderRadius:"8px",padding:"10px 12px"}}>Google Slides import isn't switched on for this version of Jungle. Use <b>Add class → Paste class text</b> instead — copy the text from your slides and paste it in.</p>
                ) : (
                  <div style={{marginTop:"12px",padding:"14px",background:"var(--navy)",borderRadius:"10px",border:"1px solid var(--border)"}}>
                    <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>Import from this coach's Google Slides</p>
                    <div style={{display:"flex",gap:"8px",flexWrap:isMobile?"wrap":"nowrap"}}>
                      <Input placeholder="Drive folder link or a single deck link — drive.google.com/drive/folders/… or docs.google.com/presentation/d/…" value={slidesFolder}
                             onChange={e=>setSlidesFolder(e.target.value)} style={{flex:"1 1 240px"}}/>
                      <Btn onClick={listSlideDecks} disabled={!!slidesBusy} style={{flexShrink:0}}>
                        {slidesBusy==="list" ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Search size={14}/>} {slidesBusy==="list" ? "Listing…" : "List decks"}
                      </Btn>
                    </div>
                    {slideDecks && slideDecks.length > 0 && (
                      <div style={{marginTop:"10px"}}>
                        <div style={{maxHeight:"220px",overflowY:"auto",border:"1px solid var(--border)",borderRadius:"8px",background:"var(--bg)"}}>
                          {slideDecks.map(d => {
                            const done = importedRefs.has(d.id);
                            const on = deckSel.has(d.id);
                            return (
                              <label key={d.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",opacity:done&&!on?0.55:1}}>
                                <input type="checkbox" checked={on} disabled={slidesBusy==="import"}
                                  onChange={()=>setDeckSel(s=>{const n=new Set(s); if(n.has(d.id)) n.delete(d.id); else n.add(d.id); return n;})}/>
                                <span style={{flex:1,minWidth:0,fontSize:"12px",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}</span>
                                {done && <Tag color="var(--navy)">imported</Tag>}
                                <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0}}>{(d.modifiedTime||"").slice(0,10)}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center",flexWrap:"wrap"}}>
                          <Btn onClick={importSlideDecks} disabled={!!slidesBusy || deckSel.size===0}>
                            {slidesBusy==="import" ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>}
                            {slidesBusy==="import" && slidesProg ? ` Reading class ${slidesProg.done+1} of ${slidesProg.total}…` : ` Import ${deckSel.size} deck${deckSel.size===1?"":"s"}`}
                          </Btn>
                          {slidesBusy==="import" && slidesProg && <span style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"260px"}}>{slidesProg.current}</span>}
                        </div>
                      </div>
                    )}
                    {slidesErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0",lineHeight:"1.5"}}>{slidesErr}</p>}
                    <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>Jungle reads each deck from Google Slides (view-only — nothing is changed) and turns it into classes. Decks you've already brought in are skipped.</p>
                  </div>
                ))}
              </div>

              {showAddPlan && (
                <div style={{...P_CARD,padding:"16px",background:"var(--navy)"}}>
                  <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                    {[["text","Paste class text"],["json","Paste JSON"]].map(([m,lbl]) => {
                      const on = planMode === m;
                      return (
                        <button key={m} onClick={()=>{setPlanMode(m);setPlanErr("");}} style={{
                          padding:"5px 12px",borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:on?"700":"600",
                          border:`1px solid ${on?"var(--accent)":"var(--border)"}`,
                          background:on?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",
                          color:on?"var(--accent)":"var(--muted)"}}>{lbl}</button>
                      );
                    })}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:"8px",marginBottom:"8px"}}>
                    <Input placeholder="Title (optional)" value={planForm.title} onChange={e=>setPlanForm(f=>({...f,title:e.target.value}))}/>
                    <Input placeholder="Class type (S360…)" value={planForm.classType} onChange={e=>setPlanForm(f=>({...f,classType:e.target.value}))}/>
                    <Input placeholder="Focus (optional)" value={planForm.focus} onChange={e=>setPlanForm(f=>({...f,focus:e.target.value}))}/>
                  </div>
                  <textarea placeholder={planMode==="text"
                    ? "Paste the class as text — Jungle reads the exercises, sets and reps for you."
                    : 'For developers: paste a class object — { "blocks": [ { "label":"…", "role":"primary_lift", "scheme":{…}, "exercises":[…] } ] }'}
                    value={planForm.json} onChange={e=>setPlanForm(f=>({...f,json:e.target.value}))}
                    style={{width:"100%",boxSizing:"border-box",minHeight:"120px",padding:"10px 12px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"12px",fontFamily:planMode==="json"?"monospace":"inherit",outline:"none",resize:"vertical"}}/>
                  {planErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0"}}>{planErr}</p>}
                  <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center"}}>
                    {planMode==="text"
                      ? <Btn onClick={extractAndAdd} disabled={planBusy}>{planBusy ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>} {planBusy ? "Reading…" : "Read this class"}</Btn>
                      : <Btn onClick={addPlan}><Check size={14}/> Save class</Btn>}
                    <Btn variant="ghost" onClick={()=>{setShowAddPlan(false);setPlanErr("");}}>Cancel</Btn>
                  </div>
                </div>
              )}

              {classTypes.length === 0 ? (
                <div style={{...P_CARD,padding:"30px 24px",textAlign:"center",color:"var(--muted)"}}>
                  <p style={{fontSize:"13px"}}>No classes yet. Use <b>Add class</b> to bring in this coach's programming — Jungle groups them by the class type you give each one (S360, GC, Enduro…).</p>
                </div>
              ) : (
                <>
                  {/* Class-type tabs */}
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {classTypes.map(ct => {
                      const on = ct === curCT;
                      const n = selPlans.filter(pl => ctOf(pl) === ct).length;
                      return (
                        <button key={ct} onClick={()=>setActiveCT(ct)} style={{
                          padding:"7px 14px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",fontWeight:on?"700":"600",
                          border:`1px solid ${on?"var(--accent)":"var(--border)"}`,
                          background:on?"color-mix(in srgb, var(--accent) 13%, transparent)":"var(--card)",
                          color:on?"var(--accent)":"var(--text)"}}>{ct} <span style={{opacity:0.6,fontWeight:"600"}}>· {n}</span></button>
                      );
                    })}
                  </div>

                  {/* Class-type profile */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",gap:"12px",flexWrap:"wrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                        <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>{curCT} — learned style <span style={{color:"var(--text)"}}>· {prof.planCount} class{prof.planCount===1?"":"es"}</span></p>
                        <Tag color={category==="strength"?"var(--accent)":"#8B5CF6"}>{CLASS_CATEGORY_LABEL[category]}</Tag>
                        <span style={{fontSize:"11px",color:"var(--muted)"}}>Drafts as: <b style={{color:"var(--text)"}}>{WORKOUT_LIBRARY[builderClass]?.label||builderClass}</b></span>
                      </div>
                      <Btn onClick={()=>{setGenErr("");setShowGen(s=>!s);}} style={{padding:"7px 14px"}}><Zap size={14}/> Generate draft</Btn>
                    </div>
                    {showGen && (
                      <div style={{marginBottom:"14px",padding:"14px",background:"var(--navy)",borderRadius:"10px",border:"1px solid var(--border)"}}>
                        <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>New {curCT} class — brief</p>
                        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:"8px",marginBottom:"8px"}}>
                          <Input placeholder="Focus — e.g. Deadlift · Engine · Upper hypertrophy" value={brief.focus} onChange={e=>setBrief(b=>({...b,focus:e.target.value}))}/>
                          <Input placeholder="Duration (min)" type="number" value={brief.durationMin} onChange={e=>setBrief(b=>({...b,durationMin:e.target.value}))}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                          <Input placeholder="Week X (periodized, optional)" type="number" value={brief.weekX} onChange={e=>setBrief(b=>({...b,weekX:e.target.value}))}/>
                          <Input placeholder="of N weeks (optional)" type="number" value={brief.weekN} onChange={e=>setBrief(b=>({...b,weekN:e.target.value}))}/>
                        </div>
                        {genErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0"}}>{genErr}</p>}
                        <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center"}}>
                          <Btn onClick={generateForCT} disabled={genBusy}>{genBusy ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>} {genBusy ? "Generating…" : "Generate in style"}</Btn>
                          <Btn variant="ghost" onClick={draftFromRecent}><Layers size={13}/> Draft from recent</Btn>
                        </div>
                        <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>Grounded on this coach's {curCT} structure, schemes and movement vocabulary. Opens as an editable draft in the Builder.</p>
                      </div>
                    )}
                    <PersonaProfilePanel prof={prof} extracted={extracted}/>
                    {recentGens.length > 0 && (
                      <div style={{marginTop:"14px",paddingTop:"14px",borderTop:"1px solid var(--border)"}}>
                        <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>Recently generated · {recentGens.length}</p>
                        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                          {recentGens.slice(0,4).map(g => (
                            <div key={g.id} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px"}}>
                              <span style={{flex:1,minWidth:0,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.title}</span>
                              <span style={{color:"var(--muted)",fontSize:"11px",flexShrink:0}}>{g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""}</span>
                              <button onClick={()=>onDraftToBuilder(planToStages(g.plan), g.title, builderClass)} title="Re-open this draft in the Builder" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"600",padding:"3px 8px",flexShrink:0}}>Reopen</button>
                            </div>
                          ))}
                        </div>
                        <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>New generations are steered to differ from these.</p>
                      </div>
                    )}
                  </div>

                  {/* Class shape — the coach's format, editable (§9.1) */}
                  <ClassShapeCard blueprint={blueprint} classType={curCT} onSave={saveBlueprint}
                                  onDraft={draftFromShape} draftable={ctMoves.length > 0}/>

                  {/* Movement catalog */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Movements <span style={{color:"var(--text)"}}>· {ctMoves.length}</span>{(() => { const n = ctMoves.filter(m=>!(m.equip&&m.equip.trim())).length; return n>0 ? <span style={{color:"#E0B85B"}}> · {n} need equipment</span> : null; })()}</p>
                    <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"12px"}}>Aggregated from this coach's {curCT} plans. Editable — rename to merge variants, set equipment. Counts &amp; scheme are derived.</p>
                    <MovementCatalog movements={ctMoves} classType={curCT} onChange={changeMovement} onDelete={deleteMovement}/>
                  </div>

                  {/* Plans for this class type */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>{curCT} classes <span style={{color:"var(--text)"}}>· {ctPlans.length}</span></p>
                    {ctPlans.map(pl => {
                      const nBlocks = (pl.plan?.blocks || []).length;
                      return (
                        <div key={pl.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 0",borderTop:"1px solid var(--border)"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{pl.title}</div>
                            {/* "blocks" is our word, not a coach's (UI-UX §4). */}
                            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>{[pl.focus].filter(Boolean).join(" · ")}{pl.focus?"  ·  ":""}{nBlocks} section{nBlocks===1?"":"s"} · {SOURCE_LABEL[pl.source] || pl.source}</div>
                          </div>
                          <button onClick={()=>setEditingPlan(pl)} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"5px 10px"}}>Edit</button>
                          <Btn variant="ghost" onClick={()=>onDraftToBuilder(planToStages(pl.plan), pl.title, builderClass)} style={{padding:"6px 12px"}}><Layers size={13}/> Draft</Btn>
                          <button onClick={()=>removePlan(pl.id)} title="Remove plan" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={14}/></button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {editingPlan && <PersonaPlanEditor plan={editingPlan} onSave={savePlanEdit} onClose={()=>setEditingPlan(null)}/>}
    </div>
  );
}

// Per-class-type derived profile: structure skeleton, scheme mix, defaults, plus
// the qualitative conventions/vocabulary carried from LLM extraction.
function PersonaProfilePanel({ prof, extracted }) {
  const chips = (label, arr) => (Array.isArray(arr) && arr.length) ? (
    <div style={{marginBottom:"12px"}}>
      <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>{label}</div>
      <div>{arr.map((x,i)=><span key={i} style={P_CHIP}>{x}</span>)}</div>
    </div>
  ) : null;
  const restEntries = Object.entries(prof.defaults?.restByRole || {});
  return (
    <div>
      {/* "FOCUS" + value ran together as "FOCUSstrength" — the all-caps label
          needs to read as a label, so it gets a colon and real spacing. */}
      {extracted.focus && <div style={{marginBottom:"12px"}}><span style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginRight:"8px"}}>Focus:</span><span style={{fontSize:"13px",fontWeight:"700",color:"var(--accent)",textTransform:"capitalize"}}>{extracted.focus}</span></div>}
      {prof.structure?.length ? (
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Structure</div>
          <div>{prof.structure.map((s,i)=><span key={i} style={P_CHIP}>{ROLE_LABEL[s.role]||s.role} <span style={{opacity:0.6}}>×{s.plans}</span></span>)}</div>
        </div>
      ) : null}
      {prof.schemes?.length ? (
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Schemes</div>
          <div>{prof.schemes.map((s,i)=><span key={i} style={P_CHIP}>{schemeTypeLabel(s.type)} <span style={{opacity:0.6}}>×{s.count}</span></span>)}</div>
        </div>
      ) : null}
      {chips("Conventions", extracted.conventions)}
      {chips("Vocabulary", extracted.vocabulary)}
      {(prof.defaults?.rir != null || prof.defaults?.rpe != null || restEntries.length) ? (
        <div>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Defaults</div>
          <div>
            {prof.defaults?.rir != null && <span style={P_CHIP}>RIR {prof.defaults.rir}</span>}
            {prof.defaults?.rpe != null && <span style={P_CHIP}>RPE {prof.defaults.rpe}</span>}
            {restEntries.map(([role,sec])=><span key={role} style={P_CHIP}>{ROLE_LABEL[role]||role} rest {fmtRest(sec)}</span>)}
          </div>
        </div>
      ) : null}
      {!prof.structure?.length && !prof.schemes?.length && !extracted.conventions?.length && (
        <p style={{fontSize:"13px",color:"var(--muted)"}}>Add classs for {prof.classType} and the structure, schemes and defaults are learned automatically.</p>
      )}
    </div>
  );
}

// ── Class shape (§9.1) ───────────────────────────────────────────────────────
// A coach's format, held in their hands and changeable. Recommended from their
// own corpus, then theirs — the derivation is a convenience, never an authority.
//
// Called "class shape" on screen, never "blueprint" (§11): the coach reads the
// outcome, not the mechanism.
const SLOT_ROLES = ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"];
const shapeChips = slots => (slots || []).map(s => s.label || s.key).join(" · ");

function ClassShapeCard({ blueprint, classType, onSave, onDraft, draftable }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const start = () => { setRows((blueprint?.slots || []).map(s => ({ ...s, categories: [...(s.categories || [])] }))); setEditing(true); };
  const commit = () => {
    const slots = rows.filter(r => (r.label || r.key || "").trim())
                      .map(r => ({ ...r, key: (r.key || r.label || "").trim(), label: (r.label || r.key || "").trim() }));
    if (!slots.length) return;
    // Saving marks it `edited`, which is what permanently protects it from
    // being regenerated over on the next recompute.
    onSave({ classType, name: blueprint?.name || classType, source: "edited", slots });
    setEditing(false);
  };
  const move = (i, d) => setRows(rs => { const n = [...rs]; const j = i + d; if (j < 0 || j >= n.length) return rs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (i, k, v) => setRows(rs => rs.map((r, x) => x === i ? { ...r, [k]: v } : r));
  const toggleCat = (i, c) => setRows(rs => rs.map((r, x) => x !== i ? r
    : { ...r, categories: (r.categories || []).includes(c) ? r.categories.filter(y => y !== c) : [...(r.categories || []), c] }));

  // Cold start: no corpus and nothing saved. Presets are PICKED, not prompted.
  if (!blueprint && !editing) return (
    <div style={{...P_CARD,padding:"18px 20px"}}>
      <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>{classType} — class shape</p>
      <p style={{fontSize:"12px",color:"var(--muted)",marginBottom:"12px"}}>How this class is built, in order. Start from one of these and change anything — or add plans and it&rsquo;s worked out from them.</p>
      <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
        {BLUEPRINT_PRESETS.map(p => (
          <button key={p.name} onClick={()=>{ setRows(p.slots.map(s=>({...s,categories:[...s.categories]}))); setEditing(true); }}
            style={{textAlign:"left",padding:"10px 12px",borderRadius:"10px",border:"1px solid var(--border)",background:"var(--navy)",cursor:"pointer",maxWidth:"260px"}}>
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
            <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.4"}}>{shapeChips(p.slots)}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{...P_CARD,padding:"18px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap",marginBottom:"6px"}}>
        <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>{classType} — class shape</p>
        {!editing && (
          <div style={{display:"flex",gap:"8px"}}>
            {draftable && <Btn variant="ghost" onClick={onDraft} style={{padding:"6px 12px"}}><Layers size={13}/> Draft from this shape</Btn>}
            <Btn variant="ghost" onClick={start} style={{padding:"6px 12px"}}>Change</Btn>
          </div>
        )}
      </div>

      {!editing && (
        <>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
            {(blueprint.slots || []).map((s,i) => (
              <span key={i} style={{...P_CHIP,background:"var(--navy)",color:"var(--text)",margin:0}}>{s.label || s.key}
                <span style={{color:"var(--muted)",fontWeight:"600"}}> · {ROLE_LABEL[s.role]||s.role}</span></span>
            ))}
          </div>
          {/* Honest provenance: say how much of their history this actually describes. */}
          <p style={{fontSize:"11px",color:"var(--muted)"}}>
            {blueprint.source === "edited" ? "Your shape — saved, and kept as you left it."
              : blueprint.matched != null ? `Suggested from ${blueprint.matched} of your ${blueprint.total} ${classType} class${blueprint.total===1?"":"es"}. Change anything.`
              : "A starting point. Change anything."}
          </p>
          {/* §13 Q7: the edit stands, the divergence is shown, nothing is auto-applied. */}
          {blueprint.contradiction && (
            <div style={{marginTop:"10px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E0B85B",background:"color-mix(in srgb, #E0B85B 10%, transparent)"}}>
              <p style={{fontSize:"12px",color:"var(--text)",fontWeight:"600",marginBottom:"3px"}}>Your recent classes have been running a different shape.</p>
              <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"8px"}}>{shapeChips(blueprint.contradiction.slots)}</p>
              <Btn variant="ghost" onClick={()=>onSave({ ...blueprint.contradiction, source:"edited" })} style={{padding:"4px 10px"}}>Use this instead</Btn>
            </div>
          )}
        </>
      )}

      {editing && (
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {rows.map((r,i) => (
            <div key={i} style={{padding:"10px 12px",background:"var(--navy)",borderRadius:"10px"}}>
              <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"8px"}}>
                <Input value={r.label||""} onChange={e=>patch(i,"label",e.target.value)} placeholder="What this part is called" style={{flex:1}}/>
                <button onClick={()=>move(i,-1)} title="Move up" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",padding:"5px 8px",fontSize:"12px"}}>↑</button>
                <button onClick={()=>move(i,1)} title="Move down" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",padding:"5px 8px",fontSize:"12px"}}>↓</button>
                <button onClick={()=>setRows(rs=>rs.filter((_,x)=>x!==i))} title="Remove" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={13}/></button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"8px"}}>
                <Select value={r.role||"circuit"} onChange={e=>patch(i,"role",e.target.value)}>
                  {SLOT_ROLES.map(x => <option key={x} value={x}>{ROLE_LABEL[x]||x}</option>)}
                </Select>
                <Input type="number" value={r.minutes??""} onChange={e=>patch(i,"minutes",Number(e.target.value)||0)} placeholder="Minutes"/>
                <Input type="number" value={r.movementCount??""} onChange={e=>patch(i,"movementCount",Number(e.target.value)||0)} placeholder="How many moves"/>
              </div>
              <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"5px"}}>What goes in here</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {CATEGORIES.map(c => { const on = (r.categories||[]).includes(c); return (
                  <button key={c} onClick={()=>toggleCat(i,c)} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>{MOVEMENT_CATEGORY_LABEL[c]}</button>
                );})}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <Btn variant="ghost" onClick={()=>setRows(rs=>[...rs,{key:"",label:"",role:"circuit",minutes:10,movementCount:4,schemeDefault:"",categories:[]}])}><Plus size={13}/> Add a part</Btn>
            <Btn onClick={commit}><Check size={13}/> Save shape</Btn>
            <Btn variant="ghost" onClick={()=>setEditing(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// Common equipment for the movement-catalog quick-pick (one tap instead of
// typing). Free-text stays available for anything off-list.
const CATALOG_EQUIP = ["barbell","dumbbell","kettlebell","bodyweight","band","machine","cable","erg","box"];

// Editable movement catalog for one class type. Rename folds variants (old name
// kept as an alias so aggregation re-maps its occurrences); equipment + notes are
// free; the per-class-type count and typical scheme are derived (read-only).
// A filter box appears past a handful of rows; missing equipment is flagged
// because it grounds generation.
function MovementCatalog({ movements, classType, onChange, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ name:"", equip:"", aliases:"", notes:"", category:"" });
  const [q, setQ] = useState("");
  if (!movements.length) return <p style={{fontSize:"13px",color:"var(--muted)"}}>No movements catalogued for {classType} yet — they populate from this class type's plans.</p>;
  const start = m => { setEditId(m.id); setDraft({ name:m.name, equip:m.equip||"", aliases:(m.aliases||[]).join(", "), notes:m.meta?.notes||"", category:categoryOf(m) }); };
  const save = m => {
    const name = draft.name.trim() || m.name;
    const aliases = draft.aliases.split(",").map(s=>s.trim()).filter(Boolean);
    if (name.toLowerCase() !== m.name.toLowerCase() && !aliases.some(a=>a.toLowerCase()===m.name.toLowerCase())) aliases.push(m.name);
    // The category the coach picked is stored as an OVERRIDE in meta, never in
    // the derived `category` field — so re-aggregation refreshes the derivation
    // without ever overwriting their decision. Picking the value the rules
    // already derived is not an override, so it is not recorded as one; that
    // keeps the row free to improve as the rules do.
    const picked = draft.category.trim();
    const meta = { ...(m.meta||{}), notes:draft.notes.trim() };
    if (picked && picked !== m.category) meta.category = picked; else delete meta.category;
    onChange({ ...m, name, equip:draft.equip.trim(), aliases, meta });
    setEditId(null);
  };
  const needle = q.trim().toLowerCase();
  const filtered = needle ? movements.filter(m => {
    const cat = categoryOf(m);
    return (`${m.name} ${(m.aliases||[]).join(" ")} ${m.equip||""} ${cat} ${MOVEMENT_CATEGORY_LABEL[cat]||""}`).toLowerCase().includes(needle);
  }) : movements;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
      {movements.length > 5 && (
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Filter ${movements.length} movements — name, alias, equipment or kind`} style={{flex:1}}/>
          {needle && <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0,whiteSpace:"nowrap"}}>{filtered.length} of {movements.length}</span>}
        </div>
      )}
      {filtered.length === 0 && <p style={{fontSize:"12px",color:"var(--muted)",padding:"8px 0"}}>No movements match “{q}”.</p>}
      {filtered.map(m => editId === m.id ? (
        <div key={m.id} style={{padding:"12px",background:"var(--navy)",borderRadius:"10px",margin:"4px 0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
            <Input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Movement name"/>
            <Input value={draft.equip} onChange={e=>setDraft(d=>({...d,equip:e.target.value}))} placeholder="Equipment"/>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"8px"}}>
            {CATALOG_EQUIP.map(eq => { const on = draft.equip.trim().toLowerCase()===eq; return (
              <button key={eq} onClick={()=>setDraft(d=>({...d,equip:on?"":eq}))} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer",textTransform:"capitalize"}}>{eq}</button>
            );})}
          </div>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"5px"}}>What kind of movement is this?</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"8px"}}>
            {CATEGORIES.map(c => { const on = draft.category===c; return (
              <button key={c} onClick={()=>setDraft(d=>({...d,category:on?"":c}))} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>{MOVEMENT_CATEGORY_LABEL[c]}</button>
            );})}
          </div>
          <Input value={draft.aliases} onChange={e=>setDraft(d=>({...d,aliases:e.target.value}))} placeholder="Aliases (comma-separated)" style={{marginBottom:"8px"}}/>
          <Input value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Notes / cue" style={{marginBottom:"10px"}}/>
          <div style={{display:"flex",gap:"8px"}}><Btn onClick={()=>save(m)}><Check size={13}/> Save</Btn><Btn variant="ghost" onClick={()=>setEditId(null)}>Cancel</Btn></div>
        </div>
      ) : (
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{m.name}{m.equip ? <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{m.equip}</span> : <span style={{fontSize:"10px",fontWeight:"600",color:"#E0B85B",marginLeft:"8px"}}>needs equipment</span>}
              {/* Same amber flag as missing equipment: a blank category is an honest
                  gap the coach can close in one tap, not a wrong guess to discover later. */}
              {categoryOf(m) ? <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{MOVEMENT_CATEGORY_LABEL[categoryOf(m)]}</span> : <span style={{fontSize:"10px",fontWeight:"600",color:"#E0B85B",marginLeft:"8px"}}>needs category</span>}</div>
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
              {(m.classTypes?.[classType]||0)}× in {classType}
              {fmtScheme(m.commonScheme) && <span> · {fmtScheme(m.commonScheme)}</span>}
              {m.meta?.notes && <span> · {m.meta.notes}</span>}
            </div>
          </div>
          <button onClick={()=>start(m)} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"4px 10px"}}>Edit</button>
          <button onClick={()=>onDelete(m.id)} title="Delete movement" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={13}/></button>
        </div>
      ))}
    </div>
  );
}

// Full plan editor (blocks + exercises) — maximal editability before a plan
// grounds generation. Modal over a deep-copied draft; Save writes back the plan.
function PersonaPlanEditor({ plan, onSave, onClose }) {
  const vw = useWindowWidth(); const isMobile = vw < 640;
  const [title, setTitle] = useState(plan.title || "");
  const [classType, setClassType] = useState(plan.classType || "");
  const [focus, setFocus] = useState(plan.focus || "");
  const [blocks, setBlocks] = useState(() => JSON.parse(JSON.stringify(plan.plan?.blocks || [])));
  const upBlock  = (i, patch) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,...patch}:b));
  const upScheme = (i, patch) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,scheme:{...(b.scheme||{}),...patch}}:b));
  const upEx     = (i,k,patch) => setBlocks(bs => bs.map((b,j)=> j===i ? {...b,exercises:(b.exercises||[]).map((e,m)=>m===k?{...e,...patch}:e)} : b));
  const addEx    = i => setBlocks(bs => bs.map((b,j)=>j===i?{...b,exercises:[...(b.exercises||[]),{name:"",reps:""}]}:b));
  const rmEx     = (i,k) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,exercises:(b.exercises||[]).filter((_,m)=>m!==k)}:b));
  const addBlock = () => setBlocks(bs => [...bs,{label:"New block",role:"circuit",scheme:{},exercises:[]}]);
  const rmBlock  = i => setBlocks(bs => bs.filter((_,j)=>j!==i));
  const move     = (i,d) => setBlocks(bs => { const n=[...bs]; const j=i+d; if(j<0||j>=n.length) return n; [n[i],n[j]]=[n[j],n[i]]; return n; });
  const num = v => { const n = parseInt(v,10); return Number.isNaN(n) ? undefined : n; };
  const numF = v => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; }; // RPE allows halves (7.5)
  const iconBtn = { background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"13px",fontWeight:"700",padding:"3px 9px",lineHeight:1 };
  const lbl = { fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"3px" };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:isMobile?"12px":"40px 20px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{...P_CARD,width:"100%",maxWidth:"720px",padding:isMobile?"16px":"24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <h3 style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",margin:0}}>Edit plan</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex"}}><X size={18}/></button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr 1fr",gap:"8px",marginBottom:"16px"}}>
          <div><label style={lbl}>Title</label><Input value={title} onChange={e=>setTitle(e.target.value)}/></div>
          <div><label style={lbl}>Class type</label><Input value={classType} onChange={e=>setClassType(e.target.value)}/></div>
          <div><label style={lbl}>Focus</label><Input value={focus} onChange={e=>setFocus(e.target.value)}/></div>
        </div>

        {blocks.map((b,i) => (
          <div key={i} style={{border:"1px solid var(--border)",borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
            <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"10px"}}>
              <Input value={b.label||""} onChange={e=>upBlock(i,{label:e.target.value})} placeholder="Block label" style={{flex:1}}/>
              <button onClick={()=>move(i,-1)} title="Move up" style={iconBtn}>↑</button>
              <button onClick={()=>move(i,1)} title="Move down" style={iconBtn}>↓</button>
              <button onClick={()=>rmBlock(i)} title="Remove block" style={{...iconBtn,color:"var(--accent)"}}><Trash2 size={13}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1.2fr 1fr 0.6fr 0.6fr 0.6fr 0.8fr",gap:"6px",marginBottom:"10px"}}>
              <div><label style={lbl}>Role</label>
                <Select value={b.role||"circuit"} onChange={e=>upBlock(i,{role:e.target.value})}>
                  {["warmup","primary_lift","superset","circuit","finisher","recovery","cooldown"].map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </div>
              <div><label style={lbl}>Scheme</label>
                <Select value={b.scheme?.type||""} onChange={e=>upScheme(i,{type:e.target.value||undefined})}>
                  <option value="">—</option>
                  {["sets_reps","rounds","time","interval","amrap"].map(t=><option key={t} value={t}>{schemeTypeLabel(t)}</option>)}
                </Select>
              </div>
              <div><label style={lbl}>Sets</label><Input type="number" value={b.scheme?.sets??""} onChange={e=>upScheme(i,{sets:num(e.target.value)})}/></div>
              <div><label style={lbl}>RIR</label><Input type="number" value={b.scheme?.rir??""} onChange={e=>upScheme(i,{rir:num(e.target.value)})}/></div>
              <div><label style={lbl}>RPE</label><Input type="number" step="0.5" value={b.scheme?.rpe??""} onChange={e=>upScheme(i,{rpe:numF(e.target.value)})}/></div>
              <div><label style={lbl}>Rest (s)</label><Input type="number" value={b.scheme?.rest_sec??""} onChange={e=>upScheme(i,{rest_sec:num(e.target.value)})}/></div>
            </div>
            {(b.exercises||[]).map((ex,k) => (
              <div key={k} style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr auto":"1.6fr 1fr 0.9fr 1.2fr auto",gap:"6px",marginBottom:"6px",alignItems:"center"}}>
                <Input value={ex.name||""} onChange={e=>upEx(i,k,{name:e.target.value})} placeholder="Movement"/>
                <Input value={ex.equip||""} onChange={e=>upEx(i,k,{equip:e.target.value})} placeholder="Equip"/>
                <Input value={ex.reps!=null?String(ex.reps):""} onChange={e=>upEx(i,k,{reps:e.target.value})} placeholder="Reps"/>
                {!isMobile && <Input value={ex.regression||""} onChange={e=>upEx(i,k,{regression:e.target.value})} placeholder="Regression"/>}
                <button onClick={()=>rmEx(i,k)} title="Remove" style={{...iconBtn,color:"var(--accent)"}}><X size={13}/></button>
              </div>
            ))}
            <button onClick={()=>addEx(i)} style={{...iconBtn,marginTop:"4px",padding:"5px 10px",fontSize:"12px"}}>+ exercise</button>
          </div>
        ))}

        <Btn variant="ghost" onClick={addBlock} style={{width:"100%",justifyContent:"center",marginBottom:"16px"}}><Plus size={14}/> Add block</Btn>
        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={()=>onSave({ ...plan, title, classType, focus, plan:{ ...(plan.plan||{}), blocks } })}><Check size={14}/> Save plan</Btn>
        </div>
      </div>
    </div>
  );
}

function AppSidebar({ view, onNavigate, onProfile, profile, can=(()=>true) }){
  const nav = [
    {group:"HOME",   items:[{k:"dashboard",l:"Dashboard",Icon:Home}]},
    {group:"BUILD",  items:[{k:"builder",l:"Class Builder",Icon:Layers,cap:"class:view"},{k:"personas",l:"Coaches",Icon:Mic,cap:"class:view"},{k:"templates",l:"Templates",Icon:LayoutGrid,cap:"templates:view"},{k:"library",l:"Exercise Library",Icon:BookOpen,cap:"library:view"},{k:"glossary",l:"Glossary",Icon:List,cap:"glossary:view"}]},
    {group:"RUN",    items:[{k:"live",l:"Class Runner",Icon:PlayCircle,cap:"class:view"}]},
    {group:"MANAGE", items:[{k:"calendar",l:"Schedule",Icon:Calendar,cap:"schedule:view"},{k:"member",l:"Members",Icon:Users,cap:"members:view"},{k:"team",l:"Team",Icon:Users,cap:"members:manage"},{k:"analytics",l:"Analytics",Icon:BarChart2,cap:"analytics:view"}]},
    {group:"GROW",   items:[{k:"brand-studio",l:"Brand Studio",Icon:Palette,cap:"brand:view"},{k:"integrations",l:"Integrations",Icon:Plug,cap:"integrations:manage"}]},
  ].map(g => ({ ...g, items: g.items.filter(it => (!it.cap || can(it.cap)) && isViewEnabled(it.k)) })).filter(g => g.items.length);
  const first = profile?.display_name?.split(" ")?.[0] || "Coach";
  const navBtn=(on)=>({width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"9px 10px",marginBottom:"2px",borderRadius:"8px",border:"none",cursor:"pointer",background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--text)",fontSize:"13px",fontWeight:on?"700":"500",textAlign:"left"});
  return (
    <aside style={{width:"238px",flexShrink:0,background:"var(--card)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0}}>
      <div style={{padding:"18px 18px 14px",borderBottom:"1px solid var(--border)"}}><BrandLogo size={26} showName/></div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
        {nav.map(g=>(
          <div key={g.group} style={{marginBottom:"8px"}}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",letterSpacing:"1px",padding:"8px 10px 4px"}}>{g.group}</div>
            {g.items.map(it=>(<button key={it.k} onClick={()=>onNavigate(it.k)} style={navBtn(view===it.k)}><it.Icon size={16}/> {it.l}</button>))}
          </div>
        ))}
      </div>
      <button onClick={onProfile} style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 16px",borderTop:"1px solid var(--border)",background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
        <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"var(--accent)",color:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"800",flexShrink:0,overflow:"hidden"}}>{profile?.images?.[0]?.url?<img src={profile.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:first[0]}</div>
        <div style={{minWidth:0}}><div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{first}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>View profile</div></div>
      </button>
    </aside>
  );
}

// ─── BottomNav — the phone/tablet navigation (audit 1.1, UI-UX §3) ───────────
// Below COMPACT_NAV_PX the 238px sidebar is replaced by a bottom tab bar.
//
// Why a bar and not the drawer that was here: most of this app is used on a
// phone, in a loud room, mid-class, one-handed. The drawer costs two taps and a
// stretch to the top-left corner — the furthest point from a thumb. The four
// things a coach touches while a class is running sit on the bar itself; the
// rest live behind More.
//
// The breakpoint is 900 rather than 480 because the sidebar was still taking
// 40% of a 600px screen and 31% of a 768px tablet. Measured in the running app:
// at 375px the drawer was already in play, so the band that actually broke was
// 480–900.
const COMPACT_NAV_PX = 900;

// Deliberately four + More. Run and Build are the coach's day; Members is the
// owner's morning number; Brand is what a prospect gets shown. Everything else
// is a considered decision, not a mid-class reach.
const BOTTOM_NAV = [
  { key:"live",         label:"Run",     Icon:PlayCircle, cap:"class:view"   },
  { key:"builder",      label:"Build",   Icon:Layers,     cap:"class:view"   },
  { key:"member",       label:"Members", Icon:Users,      cap:"members:view" },
  { key:"brand-studio", label:"Brand",   Icon:Palette,    cap:"brand:view"   },
];

function BottomNav({ view, onNavigate, onMore, moreOpen, can=(()=>true) }) {
  const items = BOTTOM_NAV.filter(it => (!it.cap || can(it.cap)) && isViewEnabled(it.key));
  const tab = (on) => ({
    flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    gap:"3px", padding:"7px 2px 4px", background:"transparent", border:"none", cursor:"pointer",
    color:on?"var(--accent)":"var(--muted)", fontSize:"10px", fontWeight:on?"700":"600",
    // 44px is the minimum comfortable touch target; the bar is taller so a
    // mis-tap mid-burpee does not change screen.
    minHeight:"52px",
  });
  return (
    <nav style={{
      // Sits ABOVE the More sheet's overlay (z 200). The sheet's scrim spans the
      // whole viewport, so at a lower z-index it swallowed taps on the very
      // button that opened the sheet — More has to be able to close it again.
      position:"fixed", left:0, right:0, bottom:0, zIndex:250,
      display:"flex", alignItems:"stretch",
      background:"var(--card)", borderTop:"1px solid var(--border)",
      // iOS home-indicator inset — without this the last row of tabs sits under
      // the system gesture bar on any modern iPhone.
      paddingBottom:"env(safe-area-inset-bottom, 0px)",
    }}>
      {items.map(it => (
        <button key={it.key} onClick={()=>onNavigate(it.key)} style={tab(view===it.key && !moreOpen)} aria-current={view===it.key?"page":undefined}>
          <it.Icon size={19}/>
          <span>{it.label}</span>
        </button>
      ))}
      <button onClick={onMore} style={tab(moreOpen)} aria-expanded={moreOpen}>
        <List size={19}/>
        <span>More</span>
      </button>
    </nav>
  );
}

// ── Admin: Team management (invite via allowlist + manage member roles) ──────
const TEAM_ROLES = ["admin","manager","coach","frontdesk","member"];
const ROLE_BLURB = {
  admin:"Full access, including team & billing.",
  manager:"Classes, schedule, members & brand.",
  coach:"Build & run classes, library, analytics.",
  frontdesk:"Schedule & member check-in.",
  member:"View workouts, schedule & progress.",
};
function AdminTeamScreen({ onBack }) {
  const auth = useJungleAuth();
  const gymId = auth?.gym?.id;
  const myUid = auth?.user?.id;
  const canManage = auth?.can ? auth.can("members:manage") : false;
  const [members, setMembers] = React.useState(null); // null = loading
  const [invites, setInvites] = React.useState([]);
  const [err, setErr]   = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [invMatch, setInvMatch] = React.useState("");
  const [invRole, setInvRole]   = React.useState("coach");

  const load = React.useCallback(async () => {
    if (!supabase || !gymId) return;
    setErr("");
    const [{ data: mem, error: e1 }, { data: al, error: e2 }] = await Promise.all([
      supabase.from("memberships").select("id,role,status,last_active_at,user_id,profiles(email,name)").eq("gym_id", gymId),
      supabase.from("allowlist_entries").select("*").eq("gym_id", gymId).order("created_at", { ascending:false }),
    ]);
    if (e1 || e2) setErr((e1 || e2).message);
    setMembers(mem || []);
    setInvites(al || []);
  }, [gymId]);
  React.useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const m = invMatch.trim().toLowerCase();
    if (!m) return;
    const kind = m.startsWith("@") ? "domain" : "email";
    if (kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { setErr("Enter a valid email, or a domain like @studio.com"); return; }
    if (kind === "domain" && !/^@[^@\s]+\.[^@\s]+$/.test(m)) { setErr("Domain must look like @studio.com"); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("allowlist_entries").insert({ gym_id:gymId, match:m, kind, role:invRole, invited_by:myUid });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setInvMatch(""); load();
  };
  const patchMember = async (id, patch) => {
    setBusy(true);
    const { error } = await supabase.from("memberships").update(patch).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message); else load();
  };
  const patchInvite = async (id, patch) => {
    setBusy(true);
    const { error } = await supabase.from("allowlist_entries").update(patch).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message); else load();
  };

  const card = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:"12px", padding:"18px" };
  const label = { fontSize:"10px", fontWeight:"700", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"10px" };
  const inp = { padding:"9px 12px", background:"var(--navy)", border:"1px solid var(--border)", borderRadius:"8px", color:"var(--text)", fontSize:"13px" };
  const sel = { ...inp, cursor:"pointer" };
  const chipBtn = (danger) => ({ padding:"5px 10px", background:"transparent", border:`1px solid ${danger?"color-mix(in srgb, #EF4444 40%, transparent)":"var(--border)"}`, color:danger?"#EF4444":"var(--muted)", borderRadius:"7px", cursor:busy?"default":"pointer", fontSize:"11px", fontWeight:"600" });

  if (!supabaseEnabled) return (
    <div style={{ padding:"40px", maxWidth:"640px", margin:"0 auto" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"16px" }}>← Back</button>
      <div style={card}><div style={label}>Team</div><div style={{ fontSize:"13px", color:"var(--muted)", lineHeight:1.6 }}>Team accounts are available on the online version of Jungle.</div></div>
    </div>
  );
  if (!canManage) return (
    <div style={{ padding:"40px", maxWidth:"640px", margin:"0 auto" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"16px" }}>← Back</button>
      <div style={card}><div style={label}>Team</div><div style={{ fontSize:"13px", color:"var(--muted)", lineHeight:1.6 }}>You don't have permission to manage this gym's team.</div></div>
    </div>
  );

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";

  return (
    <div style={{ padding:"clamp(20px,4vw,40px)", maxWidth:"860px", margin:"0 auto", width:"100%", boxSizing:"border-box" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"14px" }}>← Back</button>
      <div style={{ fontSize:"clamp(22px,3vw,28px)", fontWeight:"800", color:"var(--text)", marginBottom:"4px" }}>Team</div>
      <div style={{ fontSize:"13px", color:"var(--muted)", marginBottom:"22px" }}>{auth?.gym?.name || "Your gym"} · invite people and set what they can do.</div>

      {err && <div style={{ background:"color-mix(in srgb, #EF4444 12%, transparent)", border:"1px solid color-mix(in srgb, #EF4444 30%, transparent)", color:"#EF4444", padding:"10px 12px", borderRadius:"8px", fontSize:"12px", marginBottom:"16px" }}>{err}</div>}

      {/* Invite */}
      <div style={{ ...card, marginBottom:"18px" }}>
        <div style={label}>Invite to gym</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", alignItems:"center" }}>
          <input value={invMatch} onChange={e=>setInvMatch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!busy&&invite()} placeholder="person@studio.com  or  @studio.com" style={{ ...inp, flex:"1 1 240px", minWidth:0 }}/>
          <select value={invRole} onChange={e=>setInvRole(e.target.value)} style={sel}>
            {TEAM_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={invite} disabled={busy} style={{ padding:"9px 16px", background:"var(--accent)", color:"var(--bg)", border:"none", borderRadius:"8px", cursor:busy?"default":"pointer", opacity:busy?0.7:1, fontWeight:"700", fontSize:"13px" }}>Send invite</button>
        </div>
        <div style={{ fontSize:"11px", color:"var(--muted)", marginTop:"8px", lineHeight:1.5 }}>{ROLE_BLURB[invRole]} They're granted this role the first time they sign in. Use <b>@domain.com</b> to allow a whole staff domain.</div>
      </div>

      {/* Members */}
      <div style={{ ...card, marginBottom:"18px" }}>
        <div style={label}>Members {members ? `(${members.length})` : ""}</div>
        {members === null ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>No members yet.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {members.map(m => {
              const suspended = m.status !== "active";
              const isMe = m.user_id === myUid;
              return (
                <div key={m.id} style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center", padding:"10px 12px", background:"var(--navy)", borderRadius:"9px", opacity:suspended?0.55:1 }}>
                  <div style={{ minWidth:0, flex:"1 1 200px" }}>
                    <div style={{ fontSize:"13px", fontWeight:"700", color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.profiles?.name || m.profiles?.email || "Unknown"}{isMe && <span style={{ color:"var(--muted)", fontWeight:"500" }}> (you)</span>}</div>
                    <div style={{ fontSize:"11px", color:"var(--muted)" }}>{m.profiles?.email || "—"} · active {fmtDate(m.last_active_at)}</div>
                  </div>
                  <select value={m.role} disabled={busy||isMe} onChange={e=>patchMember(m.id,{ role:e.target.value })} title={isMe?"You can't change your own role":""} style={{ ...sel, opacity:(busy||isMe)?0.6:1 }}>
                    {TEAM_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                  {!isMe && (suspended
                    ? <button onClick={()=>patchMember(m.id,{ status:"active" })} disabled={busy} style={chipBtn(false)}>Reactivate</button>
                    : <button onClick={()=>patchMember(m.id,{ status:"suspended" })} disabled={busy} style={chipBtn(true)}>Suspend</button>)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites */}
      <div style={card}>
        <div style={label}>Invites</div>
        {invites.filter(i=>i.status==="active").length === 0 ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>No pending invites.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {invites.filter(i=>i.status==="active").map(i => (
              <div key={i.id} style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center", padding:"10px 12px", background:"var(--navy)", borderRadius:"9px" }}>
                <div style={{ minWidth:0, flex:"1 1 200px" }}>
                  <div style={{ fontSize:"13px", fontWeight:"700", color:"var(--text)" }}>{i.match} {i.kind==="domain" && <span style={{ fontSize:"10px", color:"var(--muted)", fontWeight:"600" }}>DOMAIN</span>}</div>
                  <div style={{ fontSize:"11px", color:"var(--muted)" }}>invited as {i.role} · {i.last_used_at ? `joined ${fmtDate(i.last_used_at)}` : "not signed in yet"}</div>
                </div>
                <button onClick={()=>patchInvite(i.id,{ status:"revoked" })} disabled={busy} style={chipBtn(true)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Placeholder shown when a mock/theatre view is flagged off (see config/flags.js).
// Keeps a leftover nav route from ever surfacing fabricated data.
function MockDisabledScreen({ title, note, onBack }) {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center",gap:"12px"}}>
      <div style={{fontFamily:"var(--display)",fontSize:"20px",fontWeight:"800",color:"var(--text)"}}>{title} — coming soon</div>
      <div style={{fontSize:"13px",color:"var(--muted)",maxWidth:"420px",lineHeight:1.5}}>{note}</div>
      {onBack&&<button onClick={onBack} style={{marginTop:"6px",padding:"9px 18px",background:"var(--accent)",color:"var(--on-accent,var(--bg))",border:"none",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>Back to dashboard</button>}
    </div>
  );
}

// Shown when a music surface is opened without a connected Spotify account.
// Spotify is optional and post-login (any user for now) — never an entry gate.
function ConnectSpotifyPrompt({ onConnect, onBack }) {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center",gap:"14px"}}>
      <div style={{fontSize:"34px"}}>🎵</div>
      <div style={{fontFamily:"var(--display)",fontSize:"20px",fontWeight:"800",color:"var(--text)"}}>Connect Spotify</div>
      <div style={{fontSize:"13px",color:"var(--muted)",maxWidth:"420px",lineHeight:1.5}}>Music is optional. Connect a Spotify account to power playlists and Auto-DJ. You can use the rest of Jungle without it.</div>
      <div style={{display:"flex",gap:"10px",marginTop:"4px"}}>
        {onConnect&&<button onClick={onConnect} style={{padding:"10px 20px",background:"#1DB954",color:"#fff",border:"none",borderRadius:"9px",cursor:"pointer",fontWeight:"800",fontSize:"13px"}}>Connect Spotify</button>}
        {onBack&&<button onClick={onBack} style={{padding:"10px 20px",background:"transparent",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>Back</button>}
      </div>
    </div>
  );
}

export default function App() {
  // The `?mode=attendee&data=<base64>` route is gone. It decoded a whole class
  // out of the URL and rendered <AttendeeView/> — a component that was never
  // written, so the route would have thrown had the flag ever been turned on.
  // The N4 magic-link member page replaces it (audit 2.2).

  const vw = useWindowWidth();
  const isMobile = vw < 480;
  // `isCompact` drives NAVIGATION only (sidebar vs bottom bar). It is separate
  // from `isMobile`, which drives type/padding inside screens — a 700px tablet
  // wants the bottom bar but not phone-sized text.
  const isCompact = vw < COMPACT_NAV_PX;

  const { token, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices,
          nowPlaying, spPaused, authError, spError, profile, logout } = useSpotify();

  // Account auth (Google via AuthGate) + local-first store wiring. Declared with
  // the other top-level hooks — before any early return below — so the hook
  // order never changes. store.connect() tells store.js the current gym/user so
  // domain writes sync to Postgres in the background (no-op when Supabase off).
  const auth = useJungleAuth();
  store.connect({ gymId: auth?.gym?.id, userId: auth?.user?.id });

  const [pinUnlocked, setPinUnlocked] = useState(() => sessionStorage.getItem("jungle_pin_ok") === "1");
  const [showNav, setShowNav] = React.useState(false);
  const [crossfade, setCrossfade] = useState(() => store.getCrossfade());
  useEffect(() => { store.saveCrossfade(crossfade); }, [crossfade]);

  // ── Skin / Theme ─────────────────────────────────────────────────────────
  const [activeSkinId, setActiveSkinId] = useState(() => store.getSkinId());
  const [customSkinTokens, setCustomSkinTokens] = useState(() => store.getCustomSkinTokens());
  const skinTokens = (activeSkinId === "custom" && customSkinTokens)
    ? customSkinTokens
    : (PRESET_SKINS[activeSkinId]?.tokens || PRESET_SKINS.canopy.tokens);
  // FR-A6: no JS mutation of T — set CSS vars synchronously (pre-paint) so var(--x) reads resolve.
  const _skinF = (PRESET_SKINS[activeSkinId] || PRESET_SKINS.canopy).fonts;
  applySkinCSS(skinTokens, PRESET_SKINS[activeSkinId] || {});
  const activeSkinObj = (activeSkinId === "custom" && customSkinTokens)
    ? { name:"Custom", source:"custom", tokens: customSkinTokens, fonts: _skinF, voice:"credible-community", numeralStyle:"proportional", accentBehaviour:"flat", programs: DEFAULT_PROGRAMS }
    : (PRESET_SKINS[activeSkinId] || PRESET_SKINS.canopy);
  useEffect(() => {
    applySkinCSS(skinTokens, PRESET_SKINS[activeSkinId] || {});
    const skin = PRESET_SKINS[activeSkinId];
    if (skin) injectSkinFonts(skin);
    store.saveSkinId(activeSkinId);
    if (customSkinTokens) store.saveCustomSkinTokens(customSkinTokens);
    else store.clearCustomSkinTokens();
  }, [activeSkinId, customSkinTokens]);

  // ── Gym branding ─────────────────────────────────────────────────────────
  const [gymBranding, setGymBranding] = useState(() => store.getGymBranding());
  useEffect(() => {
    store.saveGymBranding(gymBranding);
  }, [gymBranding]);
  // (legacy gymBranding accent/green override removed - superseded by the skin system)
  // The ONE remaining runtime font fetch, and it cannot be bundled: this is a
  // font the gym picks from the whole Google catalogue in Brand Studio, unknown
  // at build time. It degrades honestly — if the request fails the fontFamily
  // chain falls through to the skin's bundled face and then to system, so an
  // offline display is still styled, just not in the gym's optional override.
  // Every surface a member sees uses the bundled skin fonts.
  useEffect(() => {
    const font = gymBranding?.fontFamily;
    if (!font || font === "system") { const el = document.getElementById("jungle-gfont"); if (el) el.href = ""; return; }
    let link = document.getElementById("jungle-gfont");
    if (!link) { link = document.createElement("link"); link.id = "jungle-gfont"; link.rel = "stylesheet"; document.head.appendChild(link); }
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800;900&display=swap`;
  }, [gymBranding?.fontFamily]);

  // White-label: the browser tab, the bookmark and the home-screen label are all
  // this string. Once a gym has entered their name it is THEIR product, so the
  // tab says so; "Jungle" is only the unbranded default (audit 1.2).
  useEffect(() => {
    const name = gymBranding?.gymName?.trim();
    document.title = name || "Jungle";
  }, [gymBranding?.gymName]);

  // ── State ─────────────────────────────────────────────────────────────────
  // Read the saved draft ONCE, before the three pieces of state it seeds — they
  // must agree with each other, and calling store.getDraftClass() separately in
  // three initialisers would re-read (and could disagree after a mid-init write).
  const savedDraft = useRef(store.getDraftClass()).current;

  const [classChoice, setClassChoice] = useState(() => {
    if (savedDraft?.classChoice?.classType) return savedDraft.classChoice;
    const fc = Object.keys(WORKOUT_LIBRARY)[0];
    return { classType:fc, subType:Object.keys(WORKOUT_LIBRARY[fc]?.subTypes||{})[0]||null };
  });
  const [view,        setView]        = useState("dashboard");
  // Class Runner umbrella (B+C): sub-mode within the runner view, and which of
  // the merged Room TV surfaces is showing.
  const [runnerTab,   setRunnerTab]   = useState("run");     // "run" | "dj"
  const [roomTvMode,  setRoomTvMode]  = useState("studio");  // "studio" | "floor" | "coach"
  // Realtime room: a Room TV on another device can FOLLOW the active runner.
  const [followRoom,  setFollowRoom]  = useState(false);
  const [remoteRoom,  setRemoteRoom]  = useState(null);      // last broadcast { stages, sessionName, liveState, nowPlaying, at }
  const [stages,      setStages]      = useState(() => savedDraft?.stages || mkStages());
  const [sessionName, setSessionName] = useState(() => savedDraft?.name || "My Workout");
  const [liveState,   setLiveState]   = useState({ playing:false, idx:0, elapsed:0 });
  const [showProfile, setShowProfile] = useState(false);
  const [djProgress,  setDjProgress]  = useState(null);
  // Persist the working class on every change, so closing the tab mid-plan is
  // not a data-loss event. Local only — see store.saveDraftClass.
  useEffect(() => {
    store.saveDraftClass({ name: sessionName, stages, classChoice });
  }, [stages, sessionName, classChoice]);

  const [templateTracks, setTemplateTracks] = useState(() => store.getTemplateTracks());
  useEffect(() => { store.saveTemplateTracks(templateTracks); }, [templateTracks]);
  const [sessionHistory, setSessionHistory] = useState(() => store.getHistory());

  // Local-first: on login, pull every domain's server state into localStorage
  // and reflect the App-root-held values (brand / prefs / history). Runs once;
  // no-op when Supabase is off. Child screens read the hydrated localStorage on
  // their own mount; classes hydrate separately in CalendarScreen.
  useEffect(() => {
    let alive = true;
    store.hydrateAll().then(r => {
      if (!alive || !r) return;
      if (r.brand) {
        if (r.brand.skinId) setActiveSkinId(r.brand.skinId);
        setCustomSkinTokens(r.brand.customSkinTokens ?? null);
        setGymBranding(r.brand.branding ?? {});
      }
      if (r.prefs) {
        setCrossfade(r.prefs.crossfade ?? 0);
        setTemplateTracks(r.prefs.templateTracks ?? {});
      }
      if (r.history) setSessionHistory(r.history);
    });
    return () => { alive = false; };
  }, []);

  const saveSession = () => {
    const totalElapsed = stages.slice(0, liveState.idx).reduce((a,s)=>a+s.dur,0) + liveState.elapsed;
    if (totalElapsed < 10) return;
    const record = { date:new Date().toISOString().slice(0,10), name:sessionName, stages:stages.length,
      durMin:Math.round(totalElapsed/60), ts:Date.now(), stageTypes:[...new Set(stages.map(s=>s.type))] };
    const updated = [record, ...sessionHistory].slice(0,100);
    setSessionHistory(updated);
    store.saveHistory(updated);        // local: whole capped array
    store.appendSessionHistory(record); // server: immutable insert of this session
  };

  // ── Session timer ─────────────────────────────────────────────────────────
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;
  const crossfadeRef = useRef(crossfade);
  crossfadeRef.current = crossfade;
  useEffect(() => {
    if (view!=="live"&&view!=="room-tv") return;
    if (!liveState.playing) return;
    const iv = setInterval(() => {
      setLiveState(ls => {
        const ss = stagesRef.current;
        const dur = ss[ls.idx]?.dur||1;
        const next = ls.elapsed+1;
        if (next >= dur) {
          fireSiren();
          if (ls.idx < ss.length-1) return {...ls, idx:ls.idx+1, elapsed:0};
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

  useEffect(() => {
    if (view!=="live"||!liveState.playing) return;
    const uris = (stages[liveState.idx]?.tracks||[]).map(t=>t.uri).filter(Boolean);
    if (!uris.length) return;
    const dev = activeDeviceId||deviceId;
    if (!dev) return;
    apiPlay(dev, uris).catch(()=>{});
    if (crossfadeRef.current > 0 && player) rampVolume(player, 0, 0.8, crossfadeRef.current);
  }, [view, liveState.playing, liveState.idx]);

  // F7: Global Space = play/pause. Prevents Space from clicking whatever button has focus.
  // Live view is owned by LiveScreen's own handler, so skip it here to avoid a double toggle.
  useEffect(() => {
    const onSpace = (e) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (view === "live") return;
      const el = e.target;
      if (el && (["INPUT","TEXTAREA","SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      const willPlay = !liveStateRef.current.playing;
      if (player) { willPlay ? player.resume().catch(()=>{}) : player.pause().catch(()=>{}); }
      setLiveState(ls => ({ ...ls, playing: willPlay }));
    };
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [view, player]);

  // ── Realtime room (B+C): runner broadcasts, a following Room TV mirrors ────
  // Broadcasts ride the 1/s live tick while the runner is playing; tracks are
  // stripped (the TV never needs Spotify URIs) to keep payloads small.
  const roomGymId = auth?.gym?.id;
  useEffect(() => {
    if (!roomGymId || view !== "live" || !liveState.playing) return;
    sendRoomState(roomGymId, {
      sessionName,
      liveState,
      at: Date.now(),
      stages: stagesRef.current.map(s => ({ ...s, tracks: [] })),
      nowPlaying: nowPlaying ? { name: nowPlaying.name, artists: (nowPlaying.artists || []).map(a => ({ name: a.name })) } : null,
    });
  }, [view, liveState, sessionName, roomGymId]);
  useEffect(() => {
    if (!roomGymId || view !== "room-tv" || !followRoom) return;
    return onRoomState(roomGymId, p => setRemoteRoom(p));
  }, [roomGymId, view, followRoom]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddTrack     = (si, t)        => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:[...(n[si].tracks||[]),t]};          return n; });
  const handleRemoveTrack  = (si, ti)       => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:n[si].tracks.filter((_,i)=>i!==ti)};  return n; });
  const handleReorderTrack = (si, from, to) => setStages(ss => { const n=[...ss]; const tr=[...n[si].tracks]; const [mv]=tr.splice(from,1); tr.splice(to,0,mv); n[si]={...n[si],tracks:tr}; return n; });
  const handleAddStage     = ()             => setStages(ss => [...ss, {id:uid(),type:"circuit",name:`Stage ${ss.length+1}`,dur:600,exercises:[],tracks:[]}]);
  const handleRemoveStage  = i             => setStages(ss => ss.filter((_,j)=>j!==i));
  const handleNextStage    = ()             => setLiveState(ls => ls.idx<stages.length-1 ? {...ls,idx:ls.idx+1,elapsed:0} : ls);
  const handleSkipTimer    = secs           => setLiveState(ls => ({...ls, elapsed:Math.max(0,Math.min(ls.elapsed+secs,(stages[ls.idx]?.dur||1)-1))}));
  const handleStageChange   = (i, s)  => setStages(ss => { const n=[...ss]; n[i]=s; return n; });
  const handleReorderStages = arr     => setStages(arr);
  const handleMoveExercise  = (fsi, exIdx, tsi) => {
    setStages(ss => { const n=ss.map(s=>({...s,exercises:[...s.exercises]})); const [mv]=n[fsi].exercises.splice(exIdx,1); n[tsi].exercises.push(mv); return n; });
  };
  const handleDjClass = playlistIds => {
    runDjOrchestrator(stages, playlistIds, setStages, setDjProgress)
      .catch(err => setDjProgress({ active:false, stage:0, total:stages.length, done:false, error:err.message||"DJ failed" }));
  };
  const handleSelectTemplate = t => {
    const saved = templateTracks[t.id]||{};
    setStages(t.stages.map((s,i) => ({...s,id:uid(),tracks:[...(saved[i]||[])],exercises:s.exercises.map(e=>({...e}))})));
    setSessionName(t.name); setView("builder");
  };
  // Workstream D: draft a persona plan's blocks into the Builder as an editable
  // starting session (coach edits + approves — the hard gate before it's a class).
  const handleDraftFromPersona = (draftStages, name, builderClass) => {
    if (!draftStages?.length) return;
    setStages(draftStages);
    setSessionName(name || "Persona draft");
    // Item 9: land on the right Builder class type (strength/circuit/hyrox…) so the
    // header + BPM targets match. Sets the selector only — does NOT apply a template,
    // so the drafted persona stages are preserved.
    if (builderClass && WORKOUT_LIBRARY[builderClass]) {
      const sub = Object.keys(WORKOUT_LIBRARY[builderClass].subTypes || {})[0] || null;
      setClassChoice({ classType: builderClass, subType: sub });
    }
    setView("builder");
  };
  // (`handleSelectClassStyle` and `handleExportTemplate` lived here. Both took a
  //  class/sub-type key and only the Templates screen ever supplied one, so both
  //  went with it. The Builder's own Class/Style selects already cover selecting
  //  a shape; export now works on the open class instead — see below.)

  // Export the class the coach is actually looking at, exercises and all.
  const handleExportClass = () => {
    const data = {
      jungleTemplate: true, version: 1, name: sessionName,
      classType: classChoice.classType, subType: classChoice.subType, stages,
    };
    const slug = (sessionName || "class").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadJson(data, `jungle-class-${slug || "untitled"}.json`);
  };
  const handleImportTemplate = (data) => {
    if(!data || !Array.isArray(data.stages)) { alert("That file isn't a Jungle template (no stages found)."); return; }
    const imported = data.stages.map(s=>({ ...s, id:uid(), exercises:Array.isArray(s.exercises)?s.exercises:[], tracks:Array.isArray(s.tracks)?s.tracks:[] }));
    setStages(imported);
    setSessionName(data.name || "Imported Template");
    if(data.classType) setClassChoice({classType:data.classType, subType:data.subType||null});
    setView("builder");
  };

  if (window.opener&&!window.opener.closed&&new URLSearchParams(window.location.search).get("code")) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)",color:"var(--text)",flexDirection:"column",gap:"16px"}}>
      <div style={{fontSize:"32px"}}>🎵</div>
      <p style={{fontSize:"15px",fontWeight:"700"}}>Connecting to Spotify…</p>
      <p style={{fontSize:"12px",color:"var(--muted)"}}>This window will close automatically.</p>
    </div>;
  }
  // Legacy PIN gate: only meaningful in the no-Supabase (localStorage) build, where
  // AuthGate passes through and this is the sole entry gate. When Supabase is configured,
  // AuthGate already enforces Google/email login + allowlist, so the PIN is redundant — skip it.
  if (!supabaseEnabled && !pinUnlocked) return <PinScreen onUnlock={()=>setPinUnlocked(true)}/>;
  // Spotify no longer gates the app — account auth (Google via AuthGate) is the gate.
  // Spotify becomes an optional post-login connect (Music Hub → ConnectSpotifyPrompt).

  const fontFamily = gymBranding?.fontFamily && gymBranding.fontFamily!=="system"
    ? `'${gymBranding.fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    : (PRESET_SKINS[activeSkinId]?.fonts?.body
        ? `'${PRESET_SKINS[activeSkinId].fonts.body}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
        : "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif");


  // (`primaryNav` lived here — declared, never rendered, and still listing
  //  Templates. Removed rather than updated.)
  const can = auth?.can || (() => true); // no auth (supabase off) \u21d2 show everything
  // Account identity = the signed-in (Google) user, not Spotify. Falls back to the
  // Spotify profile only when there's no account session (e.g. Supabase disabled).
  const gUser = auth?.user;
  const gMeta = gUser?.user_metadata || {};
  const gAvatar = gMeta.avatar_url || gMeta.picture || null;
  const displayProfile = gUser ? {
    ...profile,
    display_name: gMeta.full_name || gMeta.name || auth?.profile?.name || profile?.display_name || gUser.email,
    images: gAvatar ? [{ url: gAvatar }] : (profile?.images || []),
  } : profile;
  const allNavItems = [
    {key:"dashboard",    label:"Dashboard",    icon:"\ud83c\udfe0",  group:"Main"},
    // Was "\ud83c\udffb" \u2014 a lone skin-tone modifier, which renders as a bare
    // colour swatch ("\ud83c\udffbBuilder") because the weightlifter it was meant to
    // modify is not there.
    {key:"builder",      label:"Builder",      icon:"\ud83c\udfcb\ufe0f",  group:"Main",     cap:"class:view"},
    {key:"personas",     label:"Coaches",      icon:"\ud83c\udf99\ufe0f",  group:"Main", cap:"class:view"},
    {key:"templates",    label:"Templates",    icon:"\ud83d\udccb",  group:"Main",     cap:"templates:view"},
    {key:"analytics",    label:"Analytics",    icon:"\ud83d\udcca",  group:"Insights", cap:"analytics:view"},
    {key:"calendar",     label:"Schedule",     icon:"\ud83d\udcc5",  group:"Insights", cap:"schedule:view"},
    {key:"music",        label:"Music Hub",    icon:"\ud83c\udfb5",  group:"Tools",    cap:"music:view"},
    {key:"library",      label:"Library",      icon:"\ud83d\udcda",  group:"Tools",    cap:"library:view"},
    {key:"glossary",     label:"Glossary",     icon:"\ud83d\udcd6",  group:"Tools",    cap:"glossary:view"},
    {key:"member",       label:"Members",      icon:"\ud83d\udc65",  group:"Studio",   cap:"members:view"},
    {key:"team",         label:"Team",         icon:"\ud83d\udee1\ufe0f",  group:"Studio", cap:"members:manage"},
    {key:"integrations", label:"Integrations", icon:"\ud83d\udd0c",  group:"Studio",   cap:"integrations:manage"},
    {key:"brand-studio", label:"Brand Studio", icon:"\ud83c\udfa8",  group:"Studio",   cap:"brand:view"},
  ].filter(n => (!n.cap || can(n.cap)) && isViewEnabled(n.key));
  const isFullscreen = view==="room-tv";
  const navGroups = ["Main","Insights","Tools","Studio"].filter(g => allNavItems.some(n => n.group===g));
  const navTo = key => {
    if ((view==="live"||view==="room-tv") && player) player.pause().catch(()=>{});
    if (view==="live"||view==="room-tv") setLiveState(ls=>({...ls,playing:false}));
    setView(key); setShowNav(false);
  };

  return (
    <ThemeContext.Provider value={{ skin: activeSkinObj, gymBranding }}>
    <div style={{display:"flex",flexDirection:"row",minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily}}>
      {!isFullscreen && !isCompact && <AppSidebar view={view} onNavigate={navTo} onProfile={()=>setShowProfile(true)} profile={displayProfile} can={can}/>}
      {/* Reserve the bar's height so the last card on a screen is not trapped
          underneath it — a scroll container cannot reveal what a fixed element
          covers. */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:"100vh",
                   paddingBottom:(!isFullscreen && isCompact) ? "calc(56px + env(safe-area-inset-bottom, 0px))" : 0}}>

      {/* The "More" sheet. On compact widths it rises from the BOTTOM, next to
          the thumb that opened it, rather than sliding in from the top-left
          corner — the hardest place to reach one-handed. */}
      {/* The overlay is padded up by the bar's height so the sheet sits ABOVE the
          tab bar rather than covering it — the same "More" button has to be able
          to close it again. */}
      {showNav && !isFullscreen && (
        <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:isCompact?"flex-end":"stretch",
                     paddingBottom:isCompact?"calc(56px + env(safe-area-inset-bottom, 0px))":0,boxSizing:"border-box"}}>
          <div onClick={()=>setShowNav(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(2px)"}}/>
          <div style={isCompact
            ? {position:"relative",width:"100%",maxHeight:"72vh",background:"var(--card)",borderTop:`1px solid var(--border)`,borderRadius:"16px 16px 0 0",display:"flex",flexDirection:"column",zIndex:1,overflowY:"auto",paddingBottom:"calc(12px + env(safe-area-inset-bottom, 0px))"}
            : {position:"relative",width:"260px",background:"var(--card)",borderRight:`1px solid var(--border)`,display:"flex",flexDirection:"column",zIndex:1,overflowY:"auto"}}>
            <div style={{padding:"18px 20px 12px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <BrandLogo size={26} showName/>
              </div>
              <button onClick={()=>setShowNav(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex",borderRadius:"5px"}}><X size={18}/></button>
            </div>
            {deviceId && (
              <div style={{padding:"8px 20px",borderBottom:`1px solid var(--border)`}}>
                <span style={{fontSize:"11px",color:"var(--green)",fontWeight:"600",display:"flex",alignItems:"center",gap:"5px"}}><Wifi size={11}/> Spotify Connected</span>
              </div>
            )}
            {navGroups.map(group => (
              <div key={group} style={{padding:"12px 10px 4px"}}>
                <p style={{fontSize:"10px",fontWeight:"700",letterSpacing:"1px",textTransform:"uppercase",color:"var(--muted)",padding:"0 8px 6px"}}>{group}</p>
                {allNavItems.filter(n=>n.group===group).map(n=>(
                  <button key={n.key} onClick={()=>navTo(n.key)} style={{
                    width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"9px 12px",borderRadius:"8px",
                    border:"none",cursor:"pointer",background:view===n.key?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",
                    color:view===n.key?"var(--accent)":"var(--text)",fontSize:"13px",fontWeight:view===n.key?"700":"500",
                    textAlign:"left",marginBottom:"2px",
                  }}>
                    <span style={{fontSize:"15px",width:"20px",textAlign:"center"}}>{n.icon}</span>
                    {n.label}
                    {view===n.key && <div style={{width:"5px",height:"5px",borderRadius:"50%",background:"var(--accent)",marginLeft:"auto"}}/>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isFullscreen && (
        <header style={{display:"flex",alignItems:"center",gap:"8px",padding:isMobile?"10px 14px":"12px 20px",borderBottom:`1px solid var(--border)`,background:"var(--card)",position:"sticky",top:0,zIndex:100}}>
          {/* No hamburger: "More" on the bottom bar is the one way in, so there
              is a single mental model for navigation rather than two. */}
          {isCompact && <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
            <BrandLogo size={22} showName={false} gymBranding={gymBranding}/>
          </div>}
          <div style={{flex:1}}/>
          <div style={{display:"flex",gap:isMobile?"4px":"10px",alignItems:"center",flexShrink:0}}>
            {deviceId&&!isMobile&&<SpBadge><Wifi size={12}/> Spotify Ready</SpBadge>}
            {deviceId&&isMobile&&<Wifi size={13} color={"var(--green)"}/>}
            {/* "Share with Class" minted a base64 URL into a route that no longer
                exists. The N4 member link replaces it (audit 2.2). */}
            <button onClick={()=>setShowProfile(true)} style={{width:"32px",height:"32px",borderRadius:"50%",background:"var(--navy)",border:`1px solid var(--border)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:0,flexShrink:0}}>
              {displayProfile?.images?.[0]?.url?<img src={displayProfile.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/>:<User size={15} color={"var(--muted)"}/>}
            </button>
          </div>
        </header>
      )}

      {spError&&!isFullscreen&&(
        <div style={{padding:"10px 24px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",borderBottom:`1px solid var(--accent)`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <p style={{fontSize:"13px",color:"var(--accent)",fontWeight:"600"}}>⚠️ {spError}</p>
          <button onClick={()=>window.location.reload()} style={{padding:"5px 14px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"5px",cursor:"pointer",fontSize:"12px",fontWeight:"600"}}>Refresh</button>
        </div>
      )}

      {!isFullscreen&&<SyncBanner/>}

      {/* Per-view boundary (I1). The root boundary in main.jsx is the last resort;
          this one keeps the crash INSIDE the screen that threw, so the sidebar and
          nav survive and switching views is itself a recovery path. Keyed on `view`
          so navigating away from a broken screen clears the error automatically. */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <ErrorBoundary key={view} name={VIEW_LABELS[view]||view}>
        {view==="dashboard"&&<DashboardScreen onNavigate={setView} onNewSession={()=>setView("builder")} onProfile={()=>setShowProfile(true)} profile={displayProfile} sessionHistory={sessionHistory} stages={stages} sessionName={sessionName} nowPlaying={nowPlaying} djProgress={djProgress}/>}
        {view==="builder"&&<BuilderScreen onExportClass={handleExportClass} onImportClass={handleImportTemplate} stages={stages} onStageChange={handleStageChange} onAddStage={handleAddStage} onRemoveStage={handleRemoveStage} onRemoveTrack={handleRemoveTrack} onAddTrack={handleAddTrack} onReorderTrack={handleReorderTrack} sessionName={sessionName} onSessionNameChange={setSessionName} onStartSession={()=>{setLiveState({playing:false,idx:0,elapsed:0});setView("live");}} onReorderStages={handleReorderStages} onMoveExercise={handleMoveExercise} onOverviewDisplay={()=>{setRoomTvMode("studio");setView("room-tv");}} classChoice={classChoice} onClassChoiceChange={setClassChoice} onDjClass={handleDjClass} djProgress={djProgress} crossfade={crossfade} onCrossfadeChange={setCrossfade}/>}
        {view==="personas"&&<PersonasScreen onBack={()=>setView("dashboard")} onDraftToBuilder={handleDraftFromPersona}/>}
        {view==="library"&&<LibraryBrowserModal onClose={()=>setView("dashboard")}/>}
        {view==="live"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Class Runner umbrella (B): one nav entry, sub-modes Run / Room TV / Auto-DJ. */}
            <div style={{flexShrink:0,display:"flex",gap:"6px",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--border)",background:"var(--card)"}}>
              {[["run","Run"],...(FLAGS.music?[["dj","Auto-DJ"]]:[])].map(([t,lbl]) => (
                <button key={t} onClick={()=>setRunnerTab(t)} style={{padding:"7px 16px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",fontWeight:runnerTab===t?"700":"600",border:`1px solid ${runnerTab===t?"var(--accent)":"var(--border)"}`,background:runnerTab===t?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",color:runnerTab===t?"var(--accent)":"var(--text)"}}>{lbl}</button>
              ))}
              <button onClick={()=>{setRoomTvMode(liveState.playing?"floor":"studio");setView("room-tv");}} style={{padding:"7px 16px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",fontWeight:"600",border:"1px solid var(--border)",background:"transparent",color:"var(--text)",display:"inline-flex",alignItems:"center",gap:"6px"}}><Monitor size={14}/> Room TV</button>
            </div>
            {runnerTab==="run"&&<LiveScreen stages={stages} onBack={()=>{player?.pause().catch(()=>{}); setLiveState(ls=>({...ls,playing:false})); saveSession(); setView("builder");}} liveState={liveState} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} player={player} deviceId={deviceId} activeDeviceId={activeDeviceId} setActiveDeviceId={setActiveDeviceId} devices={devices} refreshDevices={refreshDevices} spPaused={spPaused} nowPlaying={nowPlaying} onDisplayMode={()=>{setRoomTvMode("coach");setView("room-tv");}} onNextStage={handleNextStage} onSkipTimer={handleSkipTimer} onAddTrack={handleAddTrack} sessionName={sessionName} classType={[classChoice?.classType, classChoice?.subType].filter(Boolean).join(" · ")}/>}
            {FLAGS.music&&runnerTab==="dj"&&(token?<MusicHubScreen onBack={()=>setRunnerTab("run")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>:<ConnectSpotifyPrompt onConnect={redirectToSpotify} onBack={()=>setRunnerTab("run")}/>)}
          </div>
        )}
        {view==="room-tv"&&<RoomTV mode={roomTvMode} onMode={setRoomTvMode} onExit={()=>setView(roomTvMode==="studio"?"builder":"live")} stages={stages} sessionName={sessionName} liveState={liveState} nowPlaying={nowPlaying} player={player} deviceId={deviceId} spPaused={spPaused} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} canFollow={!!roomGymId} follow={followRoom} onFollow={setFollowRoom} remote={remoteRoom}/>}
        {view==="analytics"&&(FLAGS.mockAnalytics?<AnalyticsScreen onBack={()=>setView("dashboard")}/>:<MockDisabledScreen title="Analytics" note="Real analytics land in Phase 2, built on live attendance data." onBack={()=>setView("dashboard")}/>)}
        {view==="calendar"&&<CalendarScreen onBack={()=>setView("dashboard")}/>}
        {view==="music"&&(!FLAGS.music
          ? <MockDisabledScreen title="Music" note="Jungle no longer runs the music. Studio playback needs licences the gym holds directly, so the room's own sound system stays the room's. The tempo guide on the display is unaffected." onBack={()=>setView("dashboard")}/>
          : token?<MusicHubScreen onBack={()=>setView("dashboard")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>:<ConnectSpotifyPrompt onConnect={redirectToSpotify} onBack={()=>setView("dashboard")}/>)}
        {view==="member"&&<RosterScreen onBack={()=>setView("dashboard")}/>}
        {view==="integrations"&&<MockDisabledScreen title="Integrations" note="Booking, payments and wearable integrations land in a later phase. The cards that used to sit here showed services as “connected” that never were." onBack={()=>setView("dashboard")}/>}
        {view==="brand-studio"&&<BrandStudioScreen onBack={()=>setView("dashboard")} gymBranding={gymBranding} onBrandingChange={setGymBranding} activeSkinId={activeSkinId} onSkinChange={id=>setActiveSkinId(id)} customSkinTokens={customSkinTokens} onCustomSkinChange={setCustomSkinTokens}/>}
        {view==="team"&&<AdminTeamScreen onBack={()=>setView("dashboard")}/>}
        </ErrorBoundary>
      </div>

      {/* The footer is desktop-only. On a phone it was one more thing between the
          coach and the class, and the bottom bar now owns that edge. */}
      {!isFullscreen&&!isCompact&&<footer style={{padding:"10px 24px",borderTop:`1px solid var(--border)`,background:"var(--card)",textAlign:"center"}}>
        {/* White-label: a gym paying for this must never read someone else's
            copyright line on their own screens (audit 1.2). Their name leads;
            the Jungle credit is a quiet trailer, and only on staff surfaces. */}
        <p style={{fontSize:"11px",color:"var(--muted)"}}>
          {gymBranding?.gymName ? `${gymBranding.gymName} · ` : ""}Powered by Jungle
        </p>
      </footer>}

      {!isFullscreen&&isCompact&&(
        <BottomNav view={view} onNavigate={k=>{setShowNav(false);navTo(k);}}
          onMore={()=>setShowNav(v=>!v)} moreOpen={showNav} can={can}/>
      )}

      {showProfile&&<ProfileModal profile={displayProfile||{display_name:"Coach"}} onClose={()=>setShowProfile(false)} onLogout={()=>{logout();auth?.signOut?.();setView("dashboard");setShowProfile(false);}} sessionHistory={sessionHistory} gymBranding={gymBranding} onBrandingChange={setGymBranding}/>}
    </div>
    </div>
    </ThemeContext.Provider>
  );
}
