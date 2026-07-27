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
import { GENERATION_PRESETS, applyPreset, presetDraftOpts, describePresetEffect,
         presetDraftTitle } from "./lib/generationPresets.js";
import { slidesEnabled, getSlidesToken, parseDriveId, resolveDriveTarget, listPresentations, fetchPresentationText, splitDeckSlides, slideDate, looksLikeClassSlide } from "./lib/slidesImport.js";
import { parsePlanText, deriveHints, PARSE_THRESHOLD, PARSER_VERSION } from "./lib/planParser.js";
// csvImport, retention and winback are no longer imported here at all: RosterScreen
// was their only consumer and it now owns them. checkinMetrics keeps only
// recordSession — p6Summary and P6_TARGET_SEC went with the roster too.
import { recordSession as recordCheckinSession } from "./lib/checkinMetrics.js";
import { calcIntervalState, floorPacer } from "./lib/intervalTimer.js";
import { setupProgress, describeSetup } from "./lib/setupProgress.js";
import { shareCardModel, drawShareCard, shareCardFilename } from "./lib/shareCard.js";
import { onRoomState, sendRoomState } from "./lib/room.js";
// rgbToHex / rgbToHsl / hslToRgb are deliberately NOT imported: every one of
// their ~45 call sites was inside a function that moved, so App.jsx no longer
// converts colour spaces itself. That is the shape a good extraction leaves
// behind — the caller keeps the vocabulary it actually speaks.
import { hexToRgb, hexA, relativeLuminance, wcagContrast, nudgeContrast,
         extractPalette, extractDominantColor, DEFAULT_PROGRAMS,
         generateSkinFromPalette, generateThemes, applySkinCSS, inkOn } from "./lib/colors.js";
// src/lib/qr.js is intentionally kept but unimported: the N4 member link (Day 5)
// is the QR's first honest destination.
import { ThemeContext, useTheme, useWindowWidth, Btn, Input, Select, Tag, SpBadge, JungleLogo, BrandLogo, StatCard } from "./ui/primitives.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import { AdminTeamScreen } from "./screens/AdminTeamScreen.jsx";
import { CalendarScreen } from "./screens/CalendarScreen.jsx";
import { RosterScreen } from "./screens/RosterScreen.jsx";
import { ROLE_LABEL, MOVEMENT_CATEGORY_LABEL, CLASS_CATEGORY_LABEL, SOURCE_LABEL,
         KIND_LABEL, schemeTypeLabel, readErrorMessage } from "./ui/labels.js";
import { SCFG } from "./data/stageConfig.js";
// The music subsystem — decomposition stage 3. Everything Spotify-shaped now
// lives behind src/music/, so "is this music?" is a question a path answers.
// These are the ONLY music identifiers App.jsx still speaks; the rest of the
// subsystem talks to itself. See src/music/index.js for why it is quarantined
// rather than deleted.
import { useSpotify, redirectToSpotify, apiPlay, rampVolume,
         enrichTracksWithBpm, runDjOrchestrator, TrackSearch, MusicHubScreen,
         SpotifyDevicePicker, DjPlaylistModal, AutoDjPanel,
         ConnectSpotifyPrompt } from "./music/index.js";

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

// applySkinCSS moved to src/lib/colors.js (imported above).

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
// hexA and DEFAULT_PROGRAMS moved to src/lib/colors.js (imported above).
function ProgramChip({ name, tint }) {
  const hex = tint || "#7BE3A4";
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:hex,background:hexA(hex,0.14),border:`1px solid ${hexA(hex,0.4)}`,whiteSpace:"nowrap"}}>{name}</span>;
}

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

// Colour utilities, palette extraction and skin generation moved to
// src/lib/colors.js (imported above) — AUDIT-FINDINGS 3.1 decomposition stage 1.

// useWindowWidth moved to src/ui/primitives.jsx (imported above).

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

// ─── General helpers ──────────────────────────────────────────────────────────
let _uid = 1;
const uid = () => `s${_uid++}`;
const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const fmtSec = s => `${s}s`;
// "today 18:00" / "Tue 18:00" — when a scheduled occurrence starts. 24h, because
// the Schedule's own slots are ("06:00", "18:00") and a coach comparing the two
// should not have to translate. Says "today" for the common case rather than
// making someone work out which weekday it is now.
const fmtOccurrence = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const midnight = new Date(); midnight.setHours(0,0,0,0);
  const sameDay = d >= midnight && d < new Date(midnight.getTime() + 864e5);
  return `${sameDay ? "today" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${t}`;
};

// calcIntervalState (the Tabata/EMOM interval sub-timer) moved to
// src/lib/intervalTimer.js so it can be unit-tested — imported above.

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

// LoginScreen (Spotify-gated entry) deleted in stage 3. It was never rendered —
// AuthGate.jsx (Google) has been the gate since session 5, when Spotify stopped
// gating the app. It was also the last surface still calling Jungle "elite gym
// workout management with synchronized Spotify integration" and demanding
// "Spotify Premium", a white-label + sales-integrity leak (audit 2.1). Its
// deletion removes the only consumer of the music barrel's IS_CONFIGURED, which
// is why that import is now gone too. git history keeps the screen.

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

  // ── Cold start (B1) ───────────────────────────────────────────────────────
  // All four stats above read the SAME empty array on day one, so a brand-new
  // gym's first impression was "0 · 0.0 · 0 · 0" — four confident numbers saying
  // nothing (UI-UX §2: "reads as a dead product"). Counts are read from the
  // store on mount rather than threaded down: the Dashboard is the only consumer
  // and `hydrateAll` has already landed them in localStorage.
  //
  // `stages` is deliberately NOT counted. It seeds from `mkStages()` — a sample
  // class Jungle invented — so it is non-empty on a fresh install and would tick
  // "bring in your classes" for a coach who has brought in nothing.
  const [ownCounts, setOwnCounts] = useState(() => ({
    classes: store.getPersonaPlans().length + store.getUserClasses().length,
    members: store.getMembers().length,
  }));
  useEffect(() => {
    let alive = true;
    store.hydrateAttendance().then(r => {
      if (alive && r) setOwnCounts(c => ({ ...c, members: (r.members || []).length }));
    });
    return () => { alive = false; };
  }, []);
  const setup = setupProgress({
    classes: ownCounts.classes,
    sessions: sessionHistory.length,
    members: ownCounts.members,
  });

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

          {/* Setup checklist stands where the KPI row goes, and ONLY until there
              is a class to count. Once the gym is running, the numbers come back
              and anything still outstanding drops to the single line below them —
              a cold-start surface, never a nag. */}
          {setup.showChecklist ? (
            <div data-testid="setup-checklist" style={{...card,padding:isMobile?"18px":"24px"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"12px",flexWrap:"wrap",marginBottom:"4px"}}>
                <div style={{fontSize:isMobile?"16px":"18px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)"}}>Get your studio running</div>
                <div style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",fontVariantNumeric:"var(--num)"}}>{setup.done} / {setup.total}</div>
              </div>
              <p style={{fontSize:"13px",color:"var(--muted)",lineHeight:1.6,marginBottom:"16px"}}>{describeSetup(setup)}</p>

              <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                {setup.steps.map((s,i)=>(
                  <div key={s.key} style={{display:"flex",alignItems:"flex-start",gap:"12px",padding:"12px 0",borderTop:i?"1px solid var(--border)":"none",opacity:s.done?0.62:1}}>
                    {/* Done is a filled tick; not-done is a numbered ring rather
                        than an empty box, so the order reads as a sequence. */}
                    <div style={{flexShrink:0,width:"24px",height:"24px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                                 background:s.done?"var(--green)":"transparent",border:s.done?"none":"1px solid var(--border)",
                                 color:s.done?"var(--on-green)":"var(--muted)",fontSize:"11px",fontWeight:"800",marginTop:"1px"}}>
                      {s.done ? <Check size={13}/> : i+1}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",textDecoration:s.done?"line-through":"none"}}>{s.title}</div>
                      {!s.done && <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.55,marginTop:"3px"}}>{s.body}</p>}
                    </div>
                    {!s.done && (
                      <button onClick={()=>onNavigate(s.view)} style={{flexShrink:0,padding:"7px 13px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",
                                     border:"1px solid var(--border)",background:s.key===setup.nextStep?.key?"var(--accent)":"transparent",
                                     color:s.key===setup.nextStep?.key?"var(--on-accent)":"var(--text)"}}>
                        {s.cta}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?"10px":"14px"}}>
                {stats.map((s,i)=>(
                  <div key={i} style={{...card,padding:isMobile?"14px":"18px"}}>
                    <s.Icon size={18} color="var(--accent)"/>
                    <div style={{fontSize:isMobile?"22px":"28px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)",fontVariantNumeric:"var(--num)",margin:"8px 0 2px"}}>{s.value}</div>
                    <div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.label}</div>
                  </div>
                ))}
              </div>
              {setup.nextStep && (
                <div data-testid="setup-nudge" style={{...card,padding:isMobile?"12px 14px":"14px 18px",display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:"180px"}}>
                    <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>Still to do</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginTop:"2px"}}>{setup.nextStep.title}</div>
                  </div>
                  <button onClick={()=>onNavigate(setup.nextStep.view)} style={{flexShrink:0,padding:"7px 13px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",border:"1px solid var(--border)",background:"transparent",color:"var(--accent)"}}>
                    {setup.nextStep.cta}
                  </button>
                </div>
              )}
            </>
          )}

          <div style={{display:"grid",gridTemplateColumns:isNarrow?"1fr":"1.4fr 1fr",gap:isMobile?"14px":"20px"}}>
            <div style={{...card,padding:"18px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}><div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)"}}>Today's classes</div><button onClick={()=>onNavigate("calendar")} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Calendar →</button></div>
              {todayClasses.length===0 && <div style={{fontSize:"12px",color:"var(--muted)",padding:"8px 0"}}>No classes scheduled today.</div>}
              {todayClasses.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<todayClasses.length-1?"1px solid var(--border)":"none"}}>
                  <div style={{width:"3px",height:"34px",borderRadius:"2px",background:c.color,flexShrink:0}}/>
                  <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",width:"48px",flexShrink:0,fontVariantNumeric:"var(--num)"}}>{c.time}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{c.name}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>{[c.coach, c.dur].filter(Boolean).join(" · ")}</div></div>
                  {/* Was `{c.fill||0}%`. Nothing in the product ever SETS `fill`
                      — there is no capacity field and no booking integration —
                      so every class on every gym's dashboard read "0%", which
                      says "nobody came" rather than "we don't know". It returns
                      when a booking source does. In its place: the class TYPE,
                      which until now existed only as the colour of the 3px bar
                      on the left and so was invisible to anyone who does not
                      separate those hues (§3 accessibility). */}
                  {c.type && <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",flexShrink:0,textTransform:"uppercase",letterSpacing:"0.5px"}}>{c.type}</div>}
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
          <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}>
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
// CalendarScreen moved to src/screens/CalendarScreen.jsx (imported above)

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
  //    (--on-accent) is auto-derived, so we mirror that derivation here rather than
  //    treating it as an editable token.
  //
  //    `inkOn` IS that derivation, imported rather than re-implemented: this audit
  //    used to carry its own copy of the luminance rule, so the runtime and the
  //    badge the coach reads could disagree about what colour the button label
  //    would actually be.
  const onAccentFor = (tk) => {
    try { return inkOn(tk.accent, tk.bg, tk.text); }
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
        <button onClick={onBack} aria-label="Back" style={{background:"none",border:`1px solid var(--border)`,borderRadius:"8px",padding:"7px",cursor:"pointer",color:"var(--text)",display:"flex"}}>
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
            {/* "on sample content" is the load-bearing half. The RESKIN is live —
                that part was always true — but the numbers below it are made up,
                and the header said nothing about it. NPS was the worst of them:
                there is no survey anywhere in this product and no path to one, so
                a metric no gym will ever see here was sitting on the screen an
                owner is shown during a sales conversation. Replaced with the
                class length, which Jungle does know. The preview still needs
                content to be a preview — it just has to say that it is sample. */}
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>LIVE PREVIEW · your colours and fonts, on sample content</div>
            <div style={{background:"var(--bg)",borderRadius:"12px",padding:"16px",border:`1px solid var(--border)`}}>
              {/* Mini nav */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                {/* The gym's own name, because this is the white-label preview —
                    showing "JUNGLE" here was the one wordmark it should never be. */}
                <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"15px",fontWeight:"800",color:"var(--accent)",letterSpacing:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"48%"}}>
                  {(gymBranding?.gymName || "JUNGLE").toUpperCase()}
                </div>
                <div style={{display:"flex",gap:"10px"}}>
                  {[["MEMBERS","24"],["RPE","7.4"],["MIN","45"]].map(([l,v])=>(
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
            {/* Was "…with a Discover feed of community packs" — still advertising
                the marketplace after the feed itself was deleted. The Glossary's
                muscles and cues fold in here now, so the copy says that. */}
            <p style={{fontSize:"12px",color:"var(--muted)"}}>The studio's movement catalogue — editable per gym, with muscles and coaching cues</p>
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

function BuilderScreen({stages, onStageChange, onAddStage, onRemoveStage, onRemoveTrack, onAddTrack, onReorderTrack, sessionName, onSessionNameChange, onStartSession, onReorderStages, onMoveExercise, onOverviewDisplay, classChoice, onClassChoiceChange, onDjClass, djProgress, crossfade, onCrossfadeChange, onExportClass, onImportClass, onShareCard}) {
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
          {/* ⚠️ ICON/ACTION MISMATCH — named for what it DOES, not what it looks
              like. The comment above calls this "back" and it draws a left
              chevron, but it calls `onOverviewDisplay` — the same handler as the
              "Preview on TV" button 35 lines below. So the Builder has two
              controls for one action and one of them is dressed as Back. Which
              way to resolve it (make it go back, or drop the duplicate) is a
              design call, so this labels it truthfully and leaves it. */}
          <button onClick={()=>onOverviewDisplay()} aria-label="Preview on TV" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center",flexShrink:0,padding:"4px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"21px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:isMobile?"140px":"320px"}}>{sessionName||"Untitled Session"}</span>
              {/* Icon-only, so it had no accessible name at all — a screen reader
                  announced "button". aria-label and not title: a title does not
                  override text content for a button's accessible name. */}
              <button aria-label="Rename class" onClick={()=>{const n=prompt("Session name:",sessionName);if(n)onSessionNameChange(n);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"2px",display:"flex",flexShrink:0}}>
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
            {/* The gym's own marketing, not ours — the card carries their name
                and colours and no Jungle mark (UI-UX §5). */}
            <button onClick={onShareCard} title="Download a story-sized image of this class, in your gym's colours"
              style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--muted)",fontWeight:"600",fontSize:"13px",padding:"9px 13px",borderRadius:"9px",cursor:"pointer"}}>
              Share card
            </button>
            <button onClick={onOverviewDisplay} style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontWeight:"600",fontSize:"13px",padding:"9px 15px",borderRadius:"9px",cursor:"pointer"}}>
              Preview on TV
            </button>
            {/* Said "Add to schedule" while calling `onStartSession` — it starts
                the class runner and touches the Schedule not at all. Found by
                walking Schedule → Start → Builder → run: the one button on the
                desktop Builder that begins a class was named after a different
                feature, and the Schedule screen has its own real "Add to
                schedule" in the Add class modal, so the same words meant two
                unrelated things. Named for what it does, and matching the mobile
                button, which had it right. */}
            <button onClick={()=>{ onStartSession(); }}
              style={{border:"none",background:"var(--accent)",color:"var(--bg)",fontWeight:"700",fontSize:"13px",padding:"9px 17px",borderRadius:"9px",cursor:"pointer"}}>
              ▶ Start Session
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
                    {/* Through SCFG's label, not the raw key. This rendered
                        "warmup · 5:00" and "primary_lift · 15:00" on the app's
                        most-used screen — a §11 violation hiding in plain sight,
                        because the label map existed and this call site simply
                        did not use it. The colour bar to the left carries the
                        same fact, so this text is also the non-colour cue for
                        it (§3 accessibility). */}
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>{cfg.label || s.type} · {fmt(s.dur)}</div>
                  </div>
                  <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0}}>{(s.exercises||[]).length} ex</span>
                  {/* Named after the stage it deletes. A plan has five of these
                      and a bare "Remove" is five identical controls — the same
                      reasoning as the roster's per-member buttons. */}
                  <button onClick={e=>{e.stopPropagation();onRemoveStage(i);}} aria-label={`Remove ${s.name || cfg.label || "stage"}`} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex",flexShrink:0}}>
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
                          {/* `title` alone is not an accessible name worth
                              relying on — last resort in the computation, and it
                              never reaches a touch device. Named after the
                              movement, since a stage has one of these per row. */}
                          <button onClick={ev=>{ev.stopPropagation(); toggleGif(gkey, ex.n);}} aria-label={`Movement preview for ${ex.n}`} style={{background:"none",border:"none",cursor:"pointer",color:g?"var(--accent)":"var(--muted)",padding:"2px",display:"flex",flexShrink:0}}>
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
      {/* Was <SpotifySearchModal/> — a component referenced here and in LiveScreen
          and DEFINED NOWHERE, the second confirmed case of lint:crash's JSX blind
          spot after <AttendeeView/>. It never threw only because both call sites
          sit behind FLAGS.music. TrackSearch is the real, finished component it
          was standing in for; it was written, then orphaned. Wiring it resolves
          the phantom AND un-orphans 459 lines in one edit. The phantom was
          rendered bare here, so it owed a modal shell — TrackSearch is a panel,
          hence the wrapper. */}
      {showPlaylistModal && (
        <div onClick={()=>setShowPlaylistModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"20px",width:"min(560px,100%)",maxHeight:"86vh",overflowY:"auto",boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)"}}>Add tracks{stage?` — ${stage.name}`:""}</div>
              <button onClick={()=>setShowPlaylistModal(false)} aria-label="Close add tracks" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex"}}><X size={18}/></button>
            </div>
            <TrackSearch
              stageType={stage?.type||null}
              addedIds={(stage?.tracks||[]).map(t=>t.id).filter(Boolean)}
              onAdd={t=>{ onAddTrack(selIdx, t); setShowPlaylistModal(false); }}
            />
          </div>
        </div>
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
      {/* zIndex must clear the DISPLAY SURFACES below it. `OverviewDisplayScreen`
          ("Plan") renders position:fixed inset:0 at zIndex:500, so at the old
          zIndex:80 it painted straight over this bar — and Plan is the DEFAULT
          mode when a class is not playing. The effect was that a coach who opened
          Room TV before starting the class could not reach Floor, Coach, Follow
          or Exit at all; only the overview's own "← Esc" still worked, so it read
          as "the mode switch does nothing" rather than as something covering it.
          Notably this also made the untested cross-device Follow toggle
          unreachable in the exact state you would set it up from.
          550 sits above the display surfaces (max 500) and below every modal
          (600+), which must still be able to cover this bar. */}
      {follow && !remoteLive && (
        <div style={{position:"absolute",bottom:"18px",left:"50%",transform:"translateX(-50%)",zIndex:550,padding:"10px 18px",borderRadius:"10px",background:"rgba(10,14,20,0.72)",border:"1px solid rgba(255,255,255,0.18)",color:"rgba(255,255,255,0.85)",fontSize:"14px",fontWeight:"700"}}>
          Following this room — waiting for the coach's runner to start…
        </div>
      )}
      {ctl && (
        <div style={{position:"absolute",top:"16px",left:"50%",transform:"translateX(-50%)",zIndex:550,display:"flex",gap:"8px",alignItems:"center",background:"rgba(10,14,20,0.72)",backdropFilter:"blur(10px)",padding:"8px 10px",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.18)"}}>
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
function CheckInPanel({ sessionName, classType, durationMin, coachName, classInstanceId, scheduledAt, onClose }) {
  // Idempotent by design, so React 19 StrictMode's double-invoke of this
  // initializer resolves to the SAME occurrence rather than minting two.
  //
  // Duration and coach ride along because this row is PERMANENT and nothing
  // later can recover them: the occurrence the runner mints was landing with
  // `duration_min: null` and `coach_name: ''` while the one B4 publishes from
  // the Schedule carried both, so the same class recorded different amounts of
  // itself depending on which door it came through. `coach_name` is denormalised
  // in 0007 precisely so per-coach analysis is possible over it.
  //
  // `classInstanceId` is set when the coach started this class from the Schedule
  // (§3A). It makes the occurrence CHOSEN rather than matched on a name that had
  // no reason to agree with the schedule's — the difference between check-ins
  // landing on the published row and landing on a second row nobody looks at.
  const [ci] = useState(() => store.ensureClassInstance({ name: sessionName, classType, durationMin, coachName, instanceId: classInstanceId }).instance);
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

  // onClose carries the occurrence id: the runner's badge used to count the LAST
  // row in class_instances, which is only this class by luck — a joined or pinned
  // occurrence sits wherever it was published.
  return (
    <div onClick={()=>onClose(ci.id)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",border:`1px solid var(--border)`,borderRadius:"14px",width:"100%",maxWidth:"460px",maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"16px 18px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
            <div>
              <div style={{fontFamily:"var(--display)",fontSize:"17px",fontWeight:"700",color:"var(--text)"}}>Check in</div>
              {/* Names the OCCURRENCE, not the draft. They are the same thing
                  until a coach renames the plan mid-class, and then the honest
                  label is the row the check-ins are actually written to — with
                  its slot, so which occurrence is being joined is visible before
                  anybody is tapped in. */}
              <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
                {[ci.name || sessionName || "Class", scheduledAt ? fmtOccurrence(scheduledAt) : ""].filter(Boolean).join(" · ")}
              </div>
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
          <Btn variant="ghost" onClick={()=>onClose(ci.id)} style={{padding:"7px 14px"}}>Done</Btn>
        </div>
      </div>
    </div>
  );
}

function LiveScreen({stages, onBack, liveState, onPlayPause, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices, spPaused, nowPlaying, onDisplayMode, onNextStage, onPrevStage, onSkipTimer, onAddTrack, sessionName, classType, coachName, classInstanceId, scheduledAt}) {
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
  // The panel hands back the occurrence it actually used. It used to be read as
  // "the last row in class_instances", which is this class only by luck: a runner
  // that JOINS a published occurrence (or is pinned to one, §3A) counts against a
  // row that was written before every other class on the week, so the badge
  // reported somebody else's attendance — or zero.
  const closeCheckIn = (ciId) => {
    setShowCheckIn(false);
    const id = ciId || classInstanceId || store.getClassInstances().slice(-1)[0]?.id;
    setCheckedInCount(id ? store.getAttendance().filter(a => a.classInstanceId === id).length : 0);
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
          {/* `durationMin` is the planned length from the stages actually
              loaded — the same number the header shows as "total". Rounded to
              whole minutes because `class_instances.duration_min` is an int. */}
          {showCheckIn && (
            <CheckInPanel sessionName={sessionName || "Class"} classType={classType || ""}
              durationMin={Math.round(stages.reduce((a,s)=>a+(s.dur||0),0)/60) || null}
              coachName={coachName || ""} classInstanceId={classInstanceId} scheduledAt={scheduledAt}
              onClose={closeCheckIn}/>
          )}
          {/* HEADER */}
          <div style={{height:"64px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button onClick={onBack} aria-label="Back to class plan" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"4px",display:"flex"}}>
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
                  <button onClick={onPrevStage} aria-label="Previous stage" style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={"var(--text)"}><path d="M11 19V5l-8 7 8 7Zm9 0V5l-8 7 8 7Z"/></svg>
                  </button>
                )}
                {/* Skip back track */}
                <button onClick={()=>player?.previousTrack()} aria-label="Previous track" style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                  <SkipBack size={20}/>
                </button>
                {/* Play/Pause — large accent button. The name has to say which
                    state the press will produce, and it changes with the state:
                    a static "Play/pause" tells a screen-reader user nothing about
                    whether the class is currently running. */}
                <button onClick={handlePlayPause} aria-label={liveState.playing ? "Pause class" : "Start class"} style={{width:isMobile?"76px":"84px",height:isMobile?"76px":"84px",borderRadius:"50%",background:"var(--accent)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:`0 0 40px color-mix(in srgb, var(--accent) 25%, transparent)`,flexShrink:0}}>
                  {liveState.playing
                    ? <svg width="30" height="30" viewBox="0 0 24 24" fill={"var(--bg)"}><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                    : <svg width="30" height="30" viewBox="0 0 24 24" fill={"var(--bg)"}><path d="M8 5l11 7-11 7V5z"/></svg>
                  }
                </button>
                {/* Skip forward track */}
                <button onClick={()=>player?.nextTrack()} aria-label="Next track" style={{width:isMobile?"52px":"50px",height:isMobile?"52px":"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
                  <SkipForward size={20}/>
                </button>
                {/* Next stage */}
                {liveState.idx < stages.length - 1 && (
                  <button onClick={onNextStage} aria-label="Next stage" style={{width:"50px",height:"50px",borderRadius:"50%",border:`1px solid var(--border)`,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text)"}}>
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
            {/* Also <SpotifySearchModal/> until stage 3 — see the Builder call site.
                This one already has its own shell, so TrackSearch goes in bare. */}
            <TrackSearch
              stageType={stages[liveSearchStageIdx]?.type||null}
              addedIds={(stages[liveSearchStageIdx]?.tracks||[]).map(t=>t.id).filter(Boolean)}
              onAdd={t=>{ onAddTrack(liveSearchStageIdx, t); setShowLiveSearch(false); }}
            />
          </div>
        </div>
      )}

      {/* Keyboard shortcut legend */}
      <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
    </div>
  );
}

// ── P2 · the 10-foot rule ─────────────────────────────────────────────────────
// The member-facing Room TV surfaces (Overview / Floor / Coach display) were
// authored with fixed-px type — `Math.round(N*scaleMult)px`. Fixed px does not
// grow with the viewport, so a "160px" timer is a SMALLER fraction of a 4K wall
// than of 1080p: on 4K it is ~half the share of the screen. That means the Fable
// §3 legibility floor — the primary element (current move + timer) holding
// ~8–12% of screen HEIGHT so it reads at 8m — is not enforced anywhere; the
// presets only gesture at it.
//
// `tvFont` fixes that by keying the size to viewport HEIGHT. The reference height
// is 1080, chosen deliberately: at 1080p the vh term equals `basePx` exactly, so
// the tuned look Dylan checks on does not regress, and it grows from there —
// ~2× on 4K — holding the same fraction of the wall. The `clamp` floor keeps it
// legible on a phone-sized display; the cap guards a freak aspect ratio. `mult`
// carries the coach's S/M/L/XL font-scale preference straight through.
const DISPLAY_REF_H = 1080;
function tvFont(basePx, mult = 1) {
  const scaled = basePx * mult;
  const vh = (scaled / DISPLAY_REF_H) * 100;   // vh that equals `scaled`px at 1080p
  const floor = Math.round(scaled * 0.7);       // legible floor on small displays
  const cap = Math.round(scaled * 2.4);         // ~4K reaches ~2×; cap guards freak ratios
  return `clamp(${floor}px, ${vh.toFixed(2)}vh, ${cap}px)`;
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

  // The surround and the bezel are the gym's, not a hardcoded near-black. This is
  // the board a member sees FIRST, walking in before class, so it is the surface
  // the white-label premium is actually sold on — and it used to be the one screen
  // in the room that ignored the brand entirely. Every generated skin is dark, so
  // in practice these stay projector-dark; a hand-built light palette now goes
  // light because the gym chose to, which is the point.
  return (
    <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:500,display:"flex",flexDirection:"column",overflow:"auto",padding:isMobile?"0":"24px"}}>

      {/* TV bezel frame. `--card` rather than `--bg` so the framed-screen device
          survives in both polarities without a literal colour. */}
      <div style={{
        flex:1,background:"var(--card)",borderRadius:isMobile?"0":"16px",
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
              {/* The mark the other two boards already carried. Floor uses the
                  same call, so a member switching modes sees one identity rather
                  than three. Safe here only because the background above is now a
                  brand token: BrandLogo draws the name in `--text`, which on a
                  light brand is dark ink and was invisible on the old near-black. */}
              <BrandLogo size={24} showName/>
              <div>
                <p style={{fontSize:tvFont(26),fontWeight:"700",color:"var(--text)",lineHeight:1,marginBottom:"4px",fontFamily:"var(--display)"}}>
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

            {/* Per-stage chips. The dot's colour carried WHICH stage each chip
                was and only the duration was written, so on a member-facing
                surface the run of the class was unreadable to anyone who does
                not separate those hues — and SCFG's palette does not even
                separate them for everyone else: warmup/power, core/stretch and
                engine/recovery are each a single colour shared by two types.
                The stage's own name is now the carrier and the colour is the
                reinforcement, which is the §3 rule. */}
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
                    border:`1px solid ${chipCur?"var(--accent)":cfg.color+"40"}`,
                    minWidth:0,
                  }}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:chipCur?"var(--on-accent)":cfg.color,flexShrink:0}}/>
                    <span style={{fontSize:"11px",fontWeight:"700",color:chipCur?"var(--on-accent)":cfg.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {s.name || cfg.label} · {fmtDur(s.dur)}
                    </span>
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
                      <p style={{fontSize:tvFont(16),fontWeight:"800",color:"var(--text)",lineHeight:1.2,marginBottom:"6px",fontFamily:"var(--display)"}}>{s.name}</p>
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
                          <p style={{fontSize:tvFont(13),fontWeight:"700",color:"var(--text)",lineHeight:1.2,marginBottom:"2px"}}>{ex.n}</p>
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
  // The real pace of the stage the room is actually on — see floorPacer. `elapsed`
  // is elapsed WITHIN this stage, which is what the interval maths expects.
  const stage = stages[liveState.idx] || null;
  const { mode, phase, phaseRemaining, currentRound, rounds, stageRemaining } = floorPacer(stage, elapsed);
  const isInterval = mode === "interval";
  const isWork = isInterval && phase === "WORK";
  // Highlight the stage that is LIVE. This used to cycle every 6s regardless of
  // where the class actually was, so the FOLLOW badge told the room to follow a
  // station the coach had already left — using data this component already had.
  // A live stage past the 5 the board shows highlights nothing, rather than lying.
  const spotlight = (liveState.idx||0) < floor.length ? (liveState.idx||0) : -1;
  // What the big number means. Interval stages count the work/rest phase down;
  // everything else counts THIS STAGE down, and says so.
  const bigLabel = isInterval ? phase : (stageRemaining!=null ? "TIME LEFT" : "ELAPSED");
  const bigSec   = isInterval ? phaseRemaining : (stageRemaining!=null ? stageRemaining : elapsed);
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
        <div style={{display:"flex",alignItems:"baseline",gap:"14px",flexWrap:"wrap"}}>
          <div style={{fontSize:tvFont(24),fontWeight:"800",letterSpacing:"2px",color:isWork?"var(--accent)":"var(--muted)"}}>{bigLabel}</div>
          {/* PRIMARY member-facing element on the floor board. At the old fixed
              84px it was 7.8% of a 1080p wall — already under the Fable §3 8% floor
              — and half that on 4K. tvFont(96) holds ~8.9% of height on both. */}
          <div style={{fontFamily:"var(--display)",fontSize:tvFont(96),fontWeight:"900",lineHeight:"0.9",color:(isInterval&&!isWork)?"var(--muted)":"var(--text)",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)"}}>{fmt(bigSec)}</div>
          {stage?.name && <div style={{fontSize:"14px",fontWeight:"700",color:"var(--muted)"}}>{stage.name}</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"flex-end"}}>
          {/* Rounds are shown ONLY when the coach's own plan states them. A fixed
              "ROUND 3/8" on a class with no rounds is a number the room believes. */}
          {isInterval && (
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--muted)"}}>ROUND <span style={{color:"var(--text)"}}>{currentRound}</span>/{rounds}</div>
          )}
          {isInterval && (
            <div style={{display:"flex",gap:"4px"}}>{Array.from({length:rounds}).map((_,i)=><div key={i} style={{width:"14px",height:"6px",borderRadius:"3px",background:i<currentRound?"var(--accent)":"var(--navy)"}}/>)}</div>
          )}
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
            <div style={{fontFamily:"var(--display)",fontSize:tvFont(26),fontWeight:"800",color:"var(--text)",marginBottom:"6px",lineHeight:"1.1"}}>{st.move}</div>
            {st.scheme && <div style={{fontSize:"13px",color:"var(--muted)"}}>{st.scheme}</div>}
            {on&&<div style={{position:"absolute",top:"10px",right:"10px",fontSize:"9px",fontWeight:"800",color:c,letterSpacing:"1px"}}>FOLLOW</div>}
          </div>
        );})}
      </div>
      )}

      <div style={{...panel,display:"flex",alignItems:"center",justifyContent:"center",gap:"18px",flexWrap:"wrap"}}>
        <div style={{fontSize:"12px",fontWeight:"800",color:"var(--muted)",letterSpacing:"2px"}}>THE LOOP</div>
        {/* The stations ARE the stages, so the room moves on when the stage does —
            that is the only rotation moment the plan actually expresses. The old
            fixed 180s countdown told the floor to rotate on a cadence nothing set. */}
        {stageRemaining!=null && (
          <div style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"var(--text)"}}>Next station in <span style={{fontFamily:"var(--display)",fontSize:"22px",fontWeight:"800",color:"var(--accent)",fontVariantNumeric:"var(--num)"}}>{fmt(stageRemaining)}</span></div>
        )}
        <div style={{fontSize:"12px",color:"var(--muted)"}}>clockwise · {floor.length} stations</div>
      </div>

      {/* This board faces the FLOOR — members read it mid-class. The NOW PLAYING
          panel printed "No track playing." to the whole room for the entire
          session (audit 2.1). Dropped with music; the grid closes up rather than
          leaving a hole.

          BENCHMARK OF THE WEEK and OUTPUT · avg watts are now cut for the same
          reason, and they were the worse offence: both were addressed to the
          OPERATOR — "Set a weekly benchmark WOD", "Connect a wearable/erg feed"
          — while being projected at a wall members look at mid-class. A room
          full of people spent the session reading a to-do list for the coach and
          an advertisement for two features that do not exist.

          Neither is deleted as an idea: a real benchmark board needs the PR data
          F1/N2 will produce, and a real output panel needs BLE (N7), which is
          gated behind the consent foundation. When either has something true to
          say it earns its panel back. Until then the honest board is the one
          that only shows what is actually happening in the room.

          The whole row therefore renders only when music is on. */}
      {FLAGS.music && <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr",gap:"12px"}}>
        <div style={panel}>
          <div style={{fontSize:"11px",fontWeight:"800",color:"var(--muted)",letterSpacing:"1px",marginBottom:"10px"}}>NOW PLAYING</div>
          {npName ? <div><div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)"}}>{npName}</div><div style={{fontSize:"12px",color:"var(--muted)"}}>{npArtist}</div></div> : <div style={{fontSize:"12px",color:"var(--muted)"}}>No track playing.</div>}
        </div>
      </div>}

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
  // `--bg`, like the screen's other three presets. This was the last hardcoded
  // `#000` on a room board: switching Coach from Full to Timer-Only swapped the
  // gym's background for pure black mid-class, on the same TV.
  if (preset === "timer") {
    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",position:"relative"}} onClick={()=>showSettings&&setShowSettings(false)}>
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
          <p style={{fontSize:tvFont(160,scaleMult),fontWeight:"900",color:timerColor,lineHeight:"0.9",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",letterSpacing:"-4px"}}>{fmt(remaining)}</p>
          <p style={{fontSize:tvFont(20,scaleMult),color:"var(--muted)",marginTop:"16px",textTransform:"uppercase",letterSpacing:"6px"}}>{stage?.name}</p>
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
          <h1 style={{fontSize:tvFont(52,scaleMult),fontWeight:"800",color:"var(--text)",marginBottom:"6px",textAlign:"center"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"56px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"28px"}}/>
          <p style={{fontSize:tvFont(110,scaleMult),fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s"}}>{fmt(remaining)}</p>
          <p style={{fontSize:"15px",color:"var(--muted)",marginBottom:"28px"}}>remaining · Stage {liveState.idx+1} of {stages.length}</p>
          <div style={{width:"min(480px,80%)",height:"8px",background:"var(--navy)",borderRadius:"4px",overflow:"hidden"}}>
            <div style={{height:"100%",background:timerColor,width:`${progress}%`,borderRadius:"4px",transition:"width 0.5s, background 0.5s"}}/>
          </div>
          {nextStage
            ? <p style={{fontSize:tvFont(20,scaleMult),color:"var(--muted)",marginTop:"26px"}}>Next: <span style={{color:nextCfg.color,fontWeight:"800"}}>{nextStage.name}</span></p>
            : <p style={{fontSize:tvFont(18,scaleMult),color:cfg.color,fontWeight:"700",marginTop:"26px"}}>Final stage</p>}
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
            <p style={{fontSize:tvFont(96,scaleMult),fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none",transition:"color 0.5s",textAlign:"center"}}>{fmt(remaining)}</p>
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
          <h1 style={{fontSize:tvFont(54,scaleMult),fontWeight:"800",color:"var(--text)",marginBottom:"8px",lineHeight:"1"}}>{stage?.name||"Complete"}</h1>
          <div style={{width:"64px",height:"4px",background:timerColor,borderRadius:"2px",marginBottom:"36px",transition:"background 0.5s"}}/>
          <style>{`@keyframes jg-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.04)}}`}</style>
          <p style={{fontSize:tvFont(92,scaleMult),fontWeight:"800",color:timerColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)",marginBottom:"6px",transition:"color 0.5s",animation:(isPulsing&&!reduce)?"jg-pulse 0.8s ease-in-out infinite":"none"}}>{fmt(remaining)}</p>
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
                  <p style={{fontSize:tvFont(64,scaleMult),fontWeight:"900",color:ivColor,lineHeight:"1",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)"}}>{fmtSec(ivState.phaseRemaining)}</p>
                </div>
                <div>
                  <p style={{fontSize:tvFont(18,scaleMult),fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>{ivState.exName}</p>
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
                        <p style={{fontSize:tvFont(14,scaleMult),fontWeight:"800",color:"var(--text)"}}>{grp.name}</p>
                      </div>
                      {exerciseLabel
                        ? <p style={{fontSize:tvFont(20,scaleMult),fontWeight:"700",color:gc,lineHeight:"1.2"}}>{exerciseLabel}</p>
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
                      <p style={{fontSize:tvFont(solo?34:24,scaleMult),fontWeight:"800",color:"var(--text)",lineHeight:"1.1"}}>{ex.n}</p>
                      {ex.timing && ex.timing!=="none" && <span style={{fontSize:"11px",padding:"2px 7px",background:"#8B5CF620",color:"#8B5CF6",borderRadius:"4px",fontWeight:"700",flexShrink:0}}>{ex.timing==="tabata"?"TABATA":ex.timing==="emom"?"EMOM":`${ex.workSec}s/${ex.restSec}s`}</span>}
                    </div>
                    <p style={{fontSize:tvFont(solo?20:16,scaleMult),color:"var(--muted)",fontWeight:"600"}}>{[ex.s&&`${ex.s} sets`,ex.r&&(/^\d+(\s*[-–/x×]\s*\d+)*$/.test(String(ex.r).trim())?`${ex.r} reps`:String(ex.r)),ex.rest&&`${ex.rest} rest`,ex.timing&&ex.timing!=="none"&&`${ex.rounds||8} rounds`].filter(Boolean).join(" · ")}</p>
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
        <span style={{fontSize:tvFont(14,scaleMult),fontWeight:"800",color:"var(--muted)",letterSpacing:"3px",flexShrink:0}}>UP NEXT</span>
        {nextStage ? (
          <>
            <span style={{width:"14px",height:"14px",borderRadius:"50%",background:nextCfg.color,flexShrink:0,boxShadow:`0 0 12px ${nextCfg.color}80`}}/>
            <span style={{fontSize:tvFont(30,scaleMult),fontWeight:"800",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flexShrink:1,minWidth:0}}>{nextStage.name}</span>
            <span style={{fontSize:tvFont(17,scaleMult),fontWeight:"700",color:nextCfg.color,flexShrink:0}}>{Math.round((nextStage.dur||0)/60)} min</span>
            {nextMoves.length>0 && <span style={{fontSize:tvFont(18,scaleMult),color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>· {nextMoves.join("  ·  ")}</span>}
          </>
        ) : (
          <span style={{fontSize:tvFont(24,scaleMult),fontWeight:"800",color:cfg.color}}>Final stage — class wraps after this 🎉</span>
        )}
      </div>
    </div>
  );
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
    // A block that states its own length wins; the per-role default is the
    // fallback for parsed plans, which carry no duration at all (blocks have
    // none — only occasional prose in scheme.note hints at one, and parsing that
    // would be a guess dressed as data). A blueprint-drafted block DOES state
    // one, and it is the coach's own number from the class shape.
    const dur = Number(b.minutes) > 0 ? Math.round(Number(b.minutes) * 60)
                                      : (ROLE_DUR_SEC[b.role] || 600);
    return { id: uid(), type: ROLE_TO_STAGE[b.role] || "circuit",
             name: b.label || "Block", dur,
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
// RosterScreen moved to src/screens/RosterScreen.jsx (imported above)

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
  // D3 cold start: the class type a brand-new coach is naming before they have
  // imported anything.
  const [coldCT, setColdCT] = useState("");
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
        // D2 — and the coach's own class SHAPES, keyed by class type. Where hints
        // teach the parser this coach's vocabulary, the blueprint teaches it their
        // structure, so a bare "C1 / C2 / C3" deck is read as the warm-up, circuit
        // and finisher the coach actually programs instead of being guessed at
        // (§4.3.2). Resolves only; never invents a block.
        blueprints: selected?.styleProfile?.blueprints || null,
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
  // Class types come from two places, not one. A coach who has imported classes
  // gets them from those; a BRAND-NEW coach (D3 cold start) has named a class
  // type and picked a shape for it before importing anything, and that shape is
  // stored on the persona. Deriving from plans alone is why a new coach used to
  // see nothing but "import something first".
  const classTypes = [...new Set([
    ...classTypesOf(selPlans),
    ...Object.keys(selected?.styleProfile?.blueprints || {}),
  ])];
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
  // D3 cold start. A coach with zero classes still has to be able to run one:
  // name the class type, pick the shape it usually takes, and get a draft. This
  // writes the preset as that class type's shape and switches to it — from
  // there the screen is identical to a coach who imported a season of decks,
  // except the movement catalog is empty until they add some.
  const startClassTypeFromPreset = (preset) => {
    const name = coldCT.trim();
    if (!selectedId || !name || !preset) return;
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: {
      ...(p.styleProfile || {}),
      blueprints: {
        ...((p.styleProfile || {}).blueprints || {}),
        // `source: "preset"` matters: reconcileBlueprint only defends an
        // "edited" shape from re-derivation, so a preset correctly gives way
        // once the coach's own classes arrive and a real shape can be derived.
        [name]: { ...preset, source: "preset", slots: preset.slots.map(s => ({ ...s, categories: [...s.categories] })) },
      },
    } } : p));
    setActiveCT(name);
    setColdCT("");
  };

  // Deterministic drafting from the coach's shape — no model involved. The
  // structure is theirs, the movements are theirs, the selection is arithmetic
  // (§9.3). Unlike generateForCT this works with Supabase off.
  //
  // D4: a preset is an optional NAMED INTENT layered on top ("heavier day",
  // "short class"). It transforms a COPY of the shape and never the shape
  // itself — pressing "try heavier this week" must not rewrite the format the
  // coach has used for years. See generationPresets.js.
  const draftFromShape = (arg = null) => {
    if (!blueprint) return;
    // A preset, or nothing. Anything else — most plausibly a MouseEvent from a
    // handler passed bare — is treated as "no preset" rather than read for
    // fields it does not have. Cheap, and this component hands `draftFromShape`
    // straight to a Btn.
    const preset = arg && typeof arg.key === "string" && typeof arg.name === "string" ? arg : null;
    const shaped = preset ? applyPreset(blueprint, preset) : blueprint;
    const opts = preset ? presetDraftOpts(preset, { classType: curCT, recent: recentGens })
                        : { classType: curCT, recent: recentGens };
    const { blocks } = draftFromBlueprint(shaped, ctMoves, opts);
    if (!blocks.length) return;
    const label = presetDraftTitle(curCT, preset);
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
        const p = parsePlanText(u.text, { classTypeHint: "", title: u.deck.name, hints,
                                          blueprints: selected?.styleProfile?.blueprints || null });
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
        <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
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
                {store.PERSONA_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
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
                /* D3 cold start. This screen used to be a dead end that told a
                   new coach to go and import something — at exactly the moment
                   they are deciding whether this product is for them. Now they
                   can name the class they teach, pick the shape it takes, and
                   have a draft in the Builder before importing anything. */
                <div style={{...P_CARD,padding:"22px 24px"}}>
                  <p style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>Start with a class this coach teaches</p>
                  <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:"1.6",marginBottom:"14px"}}>
                    Name it however they do — S360, Engine, Saturday Grind. Then pick the shape it usually takes.
                    You can change every part of it afterwards, and it will reshape itself once their real classes come in.
                  </p>
                  <Input placeholder="Class type — e.g. S360" value={coldCT}
                         onChange={e=>setColdCT(e.target.value)} style={{marginBottom:"12px",maxWidth:"320px"}}/>
                  <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                    {BLUEPRINT_PRESETS.map(p => (
                      <button key={p.name} onClick={()=>startClassTypeFromPreset(p)} disabled={!coldCT.trim()}
                        title={coldCT.trim() ? `Use the ${p.name} shape for ${coldCT.trim()}` : "Name the class type first"}
                        style={{textAlign:"left",padding:"12px 14px",borderRadius:"10px",border:"1px solid var(--border)",
                                background:"var(--navy)",cursor:coldCT.trim()?"pointer":"not-allowed",
                                opacity:coldCT.trim()?1:0.5,maxWidth:"260px"}}>
                        <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
                        <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.4"}}>{shapeChips(p.slots)}</div>
                      </button>
                    ))}
                  </div>
                  <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"14px",lineHeight:"1.5"}}>
                    Already have their classes written down? <b>Add class</b> reads them straight in, and Jungle learns the real shape from those instead.
                  </p>
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
                      <div data-testid="gen-panel" style={{marginBottom:"14px",padding:"14px",background:"var(--navy)",borderRadius:"10px",border:"1px solid var(--border)"}}>
                        {/* D4 — pick, never prompt (§9.3). Each card drafts on
                            the spot from the coach's own shape and movements:
                            no model, no network, and the same click twice gives
                            the same class. The effect line under each name is
                            what this asks the coach to trust — a preset that
                            cannot say what it changes is a prompt with a nicer
                            name. Only shown when there IS a shape to transform;
                            without one there is nothing honest to promise. */}
                        {blueprint && (
                          <>
                            <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>New {curCT} class — pick one</p>
                            <div data-testid="gen-presets" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(190px,1fr))",gap:"8px",marginBottom:"12px"}}>
                              {GENERATION_PRESETS.map(p => {
                                const effect = describePresetEffect(p, blueprint);
                                return (
                                  <button key={p.key} onClick={()=>draftFromShape(p)}
                                    style={{textAlign:"left",padding:"11px 13px",borderRadius:"9px",border:"1px solid var(--border)",
                                            background:"var(--card)",cursor:"pointer"}}>
                                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
                                    <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.45"}}>{p.body}</div>
                                    {effect && <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",marginTop:"5px",letterSpacing:"0.3px"}}>{effect}</div>}
                                  </button>
                                );
                              })}
                            </div>
                            {ctMoves.length === 0 && (
                              <p style={{fontSize:"11px",color:"#E0B85B",marginBottom:"10px",lineHeight:"1.5"}}>
                                No movements saved for {curCT} yet, so these open the class named and timed with the sections empty — ready to fill from the Library.
                              </p>
                            )}
                          </>
                        )}

                        {/* The written brief survives, demoted. It is the only
                            way to ask for something the presets do not cover,
                            and it is the path that needs the model — so it is no
                            longer what a coach meets first. */}
                        <details>
                          <summary style={{cursor:"pointer",fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>
                            {blueprint ? "…or write a brief" : `New ${curCT} class — brief`}
                          </summary>
                          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:"8px",margin:"8px 0"}}>
                            <Input placeholder="Focus — e.g. Deadlift · Engine · Upper hypertrophy" value={brief.focus} onChange={e=>setBrief(b=>({...b,focus:e.target.value}))}/>
                            <Input placeholder="Duration (min)" type="number" value={brief.durationMin} onChange={e=>setBrief(b=>({...b,durationMin:e.target.value}))}/>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                            <Input placeholder="Week X (periodized, optional)" type="number" value={brief.weekX} onChange={e=>setBrief(b=>({...b,weekX:e.target.value}))}/>
                            <Input placeholder="of N weeks (optional)" type="number" value={brief.weekN} onChange={e=>setBrief(b=>({...b,weekN:e.target.value}))}/>
                          </div>
                          <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center",flexWrap:"wrap"}}>
                            <Btn onClick={generateForCT} disabled={genBusy}>{genBusy ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>} {genBusy ? "Generating…" : "Generate in style"}</Btn>
                            <Btn variant="ghost" onClick={draftFromRecent}><Layers size={13}/> Draft from recent</Btn>
                          </div>
                          <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>Grounded on this coach's {curCT} structure, schemes and movement vocabulary. Opens as an editable draft in the Builder.</p>
                        </details>
                        {genErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0"}}>{genErr}</p>}
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
                  {/* Draftable whenever there IS a shape, not only once the
                      catalog has movements. A brand-new coach's draft is the
                      shape with empty slots — the class skeleton, named and
                      timed, ready to fill from the Library one click away.
                      Gating this on movements is what made D3 a dead end: the
                      preset could be picked and then did nothing. */}
                  <ClassShapeCard blueprint={blueprint} classType={curCT} onSave={saveBlueprint}
                                  onDraft={draftFromShape} draftable={!!blueprint}
                                  emptyCatalog={ctMoves.length === 0}/>

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
      {/* This line greets a coach whose class type exists but has no plans
          behind it yet — the cold-start path — so it is a first-impression
          surface. It read "Add classs" (three s) until session 9. */}
      {!prof.structure?.length && !prof.schemes?.length && !extracted.conventions?.length && (
        <p style={{fontSize:"13px",color:"var(--muted)"}}>Add {prof.classType} classes and Jungle works out the structure, schemes and defaults from them.</p>
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

function ClassShapeCard({ blueprint, classType, onSave, onDraft, draftable, emptyCatalog = false }) {
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
            {/* Wrapped, NOT passed bare: `onDraft` now takes an optional preset,
                and a bare handler hands it a MouseEvent instead. */}
            {draftable && <Btn variant="ghost" onClick={()=>onDraft()} style={{padding:"6px 12px"}}
              title={emptyCatalog ? "Opens this shape in the Builder with the sections named and timed, ready to fill" : "Fill this shape with this coach's own movements"}>
              <Layers size={13}/> {emptyCatalog ? "Start a class from this shape" : "Draft from this shape"}</Btn>}
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

// AdminTeamScreen, TEAM_ROLES and ROLE_BLURB moved to
// src/screens/AdminTeamScreen.jsx (imported above).

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
    // I13: start the background-retry triggers once. Idempotent, so mounting after
    // an auth change doesn't stack listeners. A failed write now re-pushes on
    // reconnect (and on a slow timer) instead of waiting for the next login hydrate.
    store.startSyncRetry();
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
  // The Runner's back button was wired to `handleNextStage` — the same handler as
  // forward — so a coach who advanced too early and reached for "back" skipped
  // the room ANOTHER stage on. Found by the accessible-name sweep: the control
  // had no name, so nothing in the suite had ever referred to it, and both
  // buttons render a correct-looking icon either way.
  const handlePrevStage    = ()             => setLiveState(ls => ls.idx>0 ? {...ls,idx:ls.idx-1,elapsed:0} : ls);
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
  // ── §3A: the coach starts a class FROM the Schedule ───────────────────────
  // The join between the Schedule and the Runner used to be a name and a clock,
  // and nothing made the Builder's `sessionName` equal the schedule rule's name —
  // so publishing a week and then running that class produced TWO class_instances
  // rows, with the check-ins on the Runner's and the published one stuck at zero
  // attendance forever. Loosening the match would have been worse than the bug:
  // guessing which scheduled occurrence a coach is running attaches attendance to
  // the wrong class, permanently and invisibly.
  //
  // So the occurrence is chosen, not inferred. `pinnedClass` holds it for as long
  // as the coach is running it, and CheckInPanel resolves by that id.
  const [pinnedClass, setPinnedClass] = useState(null);
  const handleStartScheduled = (occ) => {
    const r = store.startScheduledClass(occ);
    if (!r) return;
    setPinnedClass(r.instance);
    // The name follows the schedule, which is the other half of the fix: even if
    // the pin is lost (a reload — this is in-memory state), `sessionName` is
    // persisted with the draft, so the name-and-window join in
    // ensureClassInstance lands on the same published row rather than a new one.
    setSessionName(r.instance.name);
    setLiveState({ playing:false, idx:0, elapsed:0 });
    // The Builder, not the runner: the coach still has to confirm which PLAN this
    // class runs, and dropping them into a live timer over whatever draft happened
    // to be loaded — now wearing the scheduled class's name — would be the
    // confident wrong guess this repo keeps deleting.
    setView("builder");
  };

  // (`handleSelectClassStyle` and `handleExportTemplate` lived here. Both took a
  //  class/sub-type key and only the Templates screen ever supplied one, so both
  //  went with it. The Builder's own Class/Style selects already cover selecting
  //  a shape; export now works on the open class instead — see below.)

  // The gym's share card (UI-UX §5). Colours and fonts are read from the LIVE
  // CSS custom properties rather than from PRESET_SKINS, so the card matches
  // exactly what is on the Room TV right now — including a custom palette a gym
  // built in Brand Studio, which has no entry in the preset table.
  const handleShareCard = () => {
    const model = shareCardModel({ stages, sessionName, gymName: gymBranding?.gymName || "" });
    if (model.isEmpty) { alert("Add some exercises first — a share card with no movements isn't worth posting."); return; }
    const cs = getComputedStyle(document.documentElement);
    const v = (n, f) => (cs.getPropertyValue(n) || "").trim() || f;
    const canvas = document.createElement("canvas");
    drawShareCard(canvas, model,
      { bg:v("--bg","#0A0F0C"), text:v("--text","#E8EFE9"), muted:v("--muted","#8AA294"), accent:v("--accent","#7BE3A4") },
      { display:v("--display","sans-serif"), body:v("--body","sans-serif") });
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href:url, download:shareCardFilename(model) });
      a.click();
      // Revoking immediately can beat the download on some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, "image/png");
  };

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
            <button onClick={()=>setShowProfile(true)} aria-label="Your profile and settings" style={{width:"32px",height:"32px",borderRadius:"50%",background:"var(--navy)",border:`1px solid var(--border)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:0,flexShrink:0}}>
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

      {/* §3A. The pinned scheduled class, stated plainly wherever the coach goes
          next — Builder, Runner or Room TV — because it changes where check-ins
          are recorded, and a silent pin is how attendance ends up on a class the
          coach did not think they were teaching. Unpin is always available: this
          says what it will do, and the coach can say no. */}
      {!isFullscreen&&pinnedClass&&(
        <div data-testid="pinned-class" style={{padding:"9px 20px",background:"color-mix(in srgb, var(--accent) 10%, transparent)",
             borderBottom:`1px solid color-mix(in srgb, var(--accent) 35%, transparent)`,display:"flex",alignItems:"center",
             justifyContent:"space-between",gap:"12px",flexWrap:"wrap"}}>
          <p style={{fontSize:"12px",color:"var(--text)",fontWeight:"600",margin:0}}>
            Running <strong>{pinnedClass.name}</strong> from the schedule · {fmtOccurrence(pinnedClass.startsAt)}
            <span style={{color:"var(--muted)",fontWeight:"500"}}> — check-ins land on this class</span>
          </p>
          <button onClick={()=>setPinnedClass(null)} style={{padding:"4px 12px",background:"transparent",border:`1px solid var(--border)`,
                  borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"700",flexShrink:0}}>
            Unpin
          </button>
        </div>
      )}

      {/* Per-view boundary (I1). The root boundary in main.jsx is the last resort;
          this one keeps the crash INSIDE the screen that threw, so the sidebar and
          nav survive and switching views is itself a recovery path. Keyed on `view`
          so navigating away from a broken screen clears the error automatically. */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <ErrorBoundary key={view} name={VIEW_LABELS[view]||view}>
        {view==="dashboard"&&<DashboardScreen onNavigate={setView} onNewSession={()=>setView("builder")} onProfile={()=>setShowProfile(true)} profile={displayProfile} sessionHistory={sessionHistory} stages={stages} sessionName={sessionName} nowPlaying={nowPlaying} djProgress={djProgress}/>}
        {view==="builder"&&<BuilderScreen onExportClass={handleExportClass} onImportClass={handleImportTemplate} onShareCard={handleShareCard} stages={stages} onStageChange={handleStageChange} onAddStage={handleAddStage} onRemoveStage={handleRemoveStage} onRemoveTrack={handleRemoveTrack} onAddTrack={handleAddTrack} onReorderTrack={handleReorderTrack} sessionName={sessionName} onSessionNameChange={setSessionName} onStartSession={()=>{setLiveState({playing:false,idx:0,elapsed:0});setView("live");}} onReorderStages={handleReorderStages} onMoveExercise={handleMoveExercise} onOverviewDisplay={()=>{setRoomTvMode("studio");setView("room-tv");}} classChoice={classChoice} onClassChoiceChange={setClassChoice} onDjClass={handleDjClass} djProgress={djProgress} crossfade={crossfade} onCrossfadeChange={setCrossfade}/>}
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
            {runnerTab==="run"&&<LiveScreen stages={stages} onBack={()=>{player?.pause().catch(()=>{}); setLiveState(ls=>({...ls,playing:false})); saveSession(); setView("builder");}} liveState={liveState} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} player={player} deviceId={deviceId} activeDeviceId={activeDeviceId} setActiveDeviceId={setActiveDeviceId} devices={devices} refreshDevices={refreshDevices} spPaused={spPaused} nowPlaying={nowPlaying} onDisplayMode={()=>{setRoomTvMode("coach");setView("room-tv");}} onNextStage={handleNextStage} onPrevStage={handlePrevStage} onSkipTimer={handleSkipTimer} onAddTrack={handleAddTrack} sessionName={sessionName} classType={[classChoice?.classType, classChoice?.subType].filter(Boolean).join(" · ")} coachName={displayProfile?.display_name || ""} classInstanceId={pinnedClass?.id||null} scheduledAt={pinnedClass?.startsAt||null}/>}
            {FLAGS.music&&runnerTab==="dj"&&(token?<MusicHubScreen onBack={()=>setRunnerTab("run")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>:<ConnectSpotifyPrompt onConnect={redirectToSpotify} onBack={()=>setRunnerTab("run")}/>)}
          </div>
        )}
        {view==="room-tv"&&<RoomTV mode={roomTvMode} onMode={setRoomTvMode} onExit={()=>setView(roomTvMode==="studio"?"builder":"live")} stages={stages} sessionName={sessionName} liveState={liveState} nowPlaying={nowPlaying} player={player} deviceId={deviceId} spPaused={spPaused} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} canFollow={!!roomGymId} follow={followRoom} onFollow={setFollowRoom} remote={remoteRoom}/>}
        {view==="analytics"&&(FLAGS.mockAnalytics?<AnalyticsScreen onBack={()=>setView("dashboard")}/>:<MockDisabledScreen title="Analytics" note="Real analytics land in Phase 2, built on live attendance data." onBack={()=>setView("dashboard")}/>)}
        {view==="calendar"&&<CalendarScreen onBack={()=>setView("dashboard")} onStartClass={handleStartScheduled}/>}
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
