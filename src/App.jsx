import React, { useState, useEffect, useRef, Suspense } from "react";
import { Plus, Monitor, ArrowLeft, LogOut, Search, Wifi, User, BookOpen, BarChart2, Calendar, X, Clock, Home, Layers, Check, Mic, LayoutGrid, List, PlayCircle, Users, Palette, Plug, Zap } from "lucide-react";
import { supabase, supabaseEnabled } from "./supabase.js";
import { useJungleAuth } from "./AuthGate.jsx";
import { FLAGS, isViewEnabled } from "./config/flags.js";
import * as store from "./lib/store.js";
import { uid } from "./lib/ids.js";
import { TEMPLATES } from "./data/templates.js";
import { GLOSSARY } from "./data/glossary.js";
// WORKOUT_LIBRARY is deliberately NOT imported here any more. DEC-16 moved every
// read to `getLibrary()` (the merged catalogue), and the one place that still
// legitimately wants the built-in — "Reset to defaults" — takes it as
// `BUILT_IN_LIBRARY` from libraryAccess. Re-adding it here is how a surface
// quietly goes back to being blind to a gym's own class types.
import { STAGE_LIBRARY_MAP, CLASS_STAGE_TEMPLATES, DEFAULT_STAGE_TEMPLATE } from "./data/library.js";
// personas.seed, personaAggregate, movementTaxonomy, blueprints, generationPresets,
// slidesImport and planParser are no longer imported here AT ALL: the personas
// cluster was their only consumer and it now owns them (I6 stage 4). Deleting the
// import lines is the half of an extraction that is easy to skip and is most of
// the point — a dead `import` still pulls the module into App.jsx's chunk, so
// leaving them would have moved 1,400 lines of source and not one byte of bundle.
// csvImport, retention and winback are no longer imported here at all: RosterScreen
// was their only consumer and it now owns them. checkinMetrics keeps only
// recordSession — p6Summary and P6_TARGET_SEC went with the roster too.
// checkinMetrics, intervalTimer and room.js are no longer imported here at all:
// the Class Runner cluster was their only consumer and it now owns them
// (I6 stage 5). Same rule as the personas and roster extractions — a dead
// `import` still pulls the module into App.jsx's chunk, so deleting the import
// line is the half of the move that actually costs bytes.
import { setupProgress, describeSetup, coachFirstName } from "./lib/setupProgress.js";
import { shareCardModel, drawShareCard, shareCardFilename } from "./lib/shareCard.js";
import { getLibrary, saveLibrary, resetLibrary, BUILT_IN_LIBRARY,
         newClassTypeKey, makeClassType } from "./lib/libraryAccess.js";
// Pure, zero imports — the one place that decides what a stored class type MEANS.
// Read directly rather than through libraryAccess so the Dashboard heals a legacy
// rule by exactly the rule the Schedule heals it by, and not by a second copy.
import { resolveClassType } from "./lib/libraryStore.js";
import { PRESET_SKINS, baseSkin, resolveSkinTokens } from "./lib/skins.js";
// `fmt` and `fmtOccurrence` now live in src/lib/format.js: the Builder (here)
// and the Runner (extracted) both format the same durations, and a copy would
// have let the two disagree about the same number on the same screen.
import { fmt, fmtOccurrence, fmtAgo } from "./lib/format.js";
// Only the field names and the currency table — the arithmetic that reads them
// lives on the Members screen, which is the only surface that shows the figure.
import { PRICE_FIELD, CURRENCY_FIELD, CURRENCIES, DEFAULT_CURRENCY } from "./lib/revenueAtRisk.js";
// rgbToHex / rgbToHsl / hslToRgb are deliberately NOT imported: every one of
// their ~45 call sites was inside a function that moved, so App.jsx no longer
// converts colour spaces itself. That is the shape a good extraction leaves
// behind — the caller keeps the vocabulary it actually speaks.
import { hexA, wcagContrast, nudgeContrast,
         extractPalette, extractDominantColor, DEFAULT_PROGRAMS,
         generateSkinFromPalette, generateThemes, applySkinCSS, inkOn, hueInk } from "./lib/colors.js";
// src/lib/qr.js is intentionally kept but unimported: the N4 member link (Day 5)
// is the QR's first honest destination.
import { ThemeContext, useWindowWidth, Input, Select, SpBadge, JungleLogo, BrandLogo } from "./ui/primitives.jsx";
import { ToastProvider, useToast } from "./ui/toast.jsx";
import { useDialog } from "./ui/dialog.js";
import { useAfterMount } from "./ui/useAfterMount.js";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import { AdminTeamScreen } from "./screens/AdminTeamScreen.jsx";
import { CalendarScreen } from "./screens/CalendarScreen.jsx";
import { RosterScreen } from "./screens/RosterScreen.jsx";
// The Class Runner cluster (I6 stage 5). Deliberately NOT lazy — see the note in
// src/screens/runner/index.js for why this one screen must not wait on a fetch.
import { LiveScreen, RoomTV, useClassRunner } from "./screens/runner/index.js";
// LAZY (I9). Now that the personas cluster is its own module it can be split out
// of the main chunk — which is the whole reason I6 was a prerequisite: a screen
// cannot be `React.lazy`'d while it lives inside the file doing the importing.
// `.then` because the module exports a NAMED symbol and `lazy` wants a default.
const PersonasScreen = React.lazy(() =>
  import("./screens/personas/PersonasScreen.jsx").then(m => ({ default: m.PersonasScreen })));
// NOT lazy, on purpose. FLAGS.mockAnalytics is false and FLAGS is a const of
// literals, so rollup already folds the branch away and this screen is absent
// from the bundle entirely — React.lazy would defeat that folding and emit a
// 13 KB chunk into the SW precache that nothing ever fetches. The header of
// AnalyticsScreen.jsx carries the measurements. It is still the layout target
// for the real screen below, which is the only reason it is kept at all.
import AnalyticsScreen from "./screens/AnalyticsScreen.jsx";
// The REAL analytics (N2), replacing the coming-soon stub on the same route.
// LAZY for the opposite reason to the line above: this branch is live, so its
// bytes are real bytes, and StaffApp had 12.65 kB of budget left.
const RetentionScreen = React.lazy(() =>
  import("./screens/RetentionScreen.jsx").then(m => ({ default: m.RetentionScreen })));
// LAZY (session 28 §2.2). Owner-only, opened rarely, and the sole caller of
// colors.js's palette generator — so the generator leaves the eager bundle with
// it. ⚠️ Its chunk needs its OWN line in check-size.mjs: an unlisted chunk is
// counted in the file total and has no ceiling at all.
const BrandStudioScreen = React.lazy(() =>
  import("./screens/BrandStudioScreen.jsx").then(m => ({ default: m.BrandStudioScreen })));
// The two modals, same reasoning one step further: both are already behind a
// click, so the chunk fetch costs a beat the user has already accepted by
// opening a dialog. ⚠️ `LibraryBrowserModal` is opened from THREE places — the
// Builder's panel, the Builder's toolbar and the `library` nav route — which is
// why the gate on this move is the whole e2e suite, not one spec.
const LibraryBrowserModal = React.lazy(() =>
  import("./screens/LibraryBrowserModal.jsx").then(m => ({ default: m.LibraryBrowserModal })));
const ProfileModal = React.lazy(() =>
  import("./screens/ProfileModal.jsx").then(m => ({ default: m.ProfileModal })));
// ui/labels.js went with the personas cluster — every one of its label MAPS is
// read by that screen and nothing else. Session 25 added coach-facing copy that
// is not a map: the sync banner's sentence, which lives there for the reason
// that module exists — it is the only place in the app where wording is under
// test. That is the one import back, and it is strings, not maps.
import { syncBannerMessage, SYNC_STUCK_AFTER } from "./ui/labels.js";
import { SCFG } from "./data/stageConfig.js";
// The music subsystem — decomposition stage 3. Everything Spotify-shaped now
// lives behind src/music/, so "is this music?" is a question a path answers.
// These are the ONLY music identifiers App.jsx still speaks; the rest of the
// subsystem talks to itself. See src/music/index.js for why it is quarantined
// rather than deleted.
import { useSpotify, redirectToSpotify,
         enrichTracksWithBpm, runDjOrchestrator, TrackSearch, MusicHubScreen,
         DjPlaylistModal, AutoDjPanel,
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

// ─── Theme — preset skins moved to src/lib/skins.js ───────────────────────────
// They went with `resolveSkinTokens`, because the DATA and the rule for reading
// it belong together: this file answered "what tokens is this gym running?" one
// way and BrandStudioScreen answered it another, and a gym that pressed "Apply
// to all surfaces" got the Brand Studio's answer on the Brand Studio and this
// file's answer everywhere else. See that module's header.

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

// hexA and DEFAULT_PROGRAMS moved to src/lib/colors.js (imported above).
// ProgramChip moved to src/screens/BrandStudioScreen.jsx — its only caller.

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


// calcIntervalState (the Tabata/EMOM interval sub-timer) moved to
// src/lib/intervalTimer.js so it can be unit-tested — imported above.


// ─── Data ─────────────────────────────────────────────────────────────────────
// Shared class schedule store (Calendar + Dashboard read the same data)
// `CLASS_COLORS` lived here: a hand-maintained map of eight CAPITALISED display
// strings to hex, i.e. the Schedule's deleted `CAT_COLOR` under another name, on
// another screen. Session 21 deleted that one; this one survived only because
// nothing pointed at it from the file being edited.
//
// It had already stopped working. The Schedule now stores catalogue KEYS
// (`hiit`, `gym-barre-ms4pk827`), so `CLASS_COLORS[uc.type]` matched nothing at
// all and every class on every gym's dashboard drew the same grey bar — the
// colour being the only class-type cue the row had until the type text was added
// beside it. And that text rendered the stored value RAW, which is how a coach
// came to read `GYM-BARRE-MRKHJ2LC` as the name of their own class type.
//
// One catalogue, read the same way everywhere. `#8AA294` stays as the fallback
// for a type the catalogue does not know — a legacy `"Mobility"` rule, which
// `resolveClassType` deliberately leaves alone rather than guessing at.
const UNKNOWN_TYPE_COLOR = "#8AA294";
function getUserClasses(){ return store.getUserClasses(); }
function getDayClasses(dayAbbrev){
  // BASE_SCHEDULE (20 invented classes with invented coaches and fill rates) is
  // deleted — the schedule shows the gym's own classes or nothing (audit 2.2).
  const LIB = getLibrary();
  const out = [];
  getUserClasses().forEach(uc=>{
    const hit = uc.repeat==="daily" || uc.day===dayAbbrev;
    if(!hit) return;
    // Healed on READ, exactly as CalendarScreen heals it, so one rule cannot be
    // described two ways by two screens looking at the same row.
    const type = resolveClassType(uc.type, LIB);
    out.push({time:uc.slot,name:uc.name,coach:uc.coach||"",type,
              typeLabel:LIB[type]?.label||type,dur:uc.dur||"45m",fill:uc.fill||0,
              // Unlike the Schedule grid this appends no alpha, so a gym-authored
              // type's `var(--accent)` is a usable value here and is the gym's
              // own colour — which is what `makeClassType` means by it.
              color:LIB[type]?.color||UNKNOWN_TYPE_COLOR,custom:true});
  });
  return out.sort((a,b)=>String(a.time).localeCompare(String(b.time)));
}
// Smart class picker: match an NLP prompt (or studio default) to a class type.
// Reads the MERGED catalogue (DEC-16), so "build me a barre class" can land on a
// type this gym authored rather than only on the ten built-in ones.
function smartPickClass(prompt){
  const LIB = getLibrary();
  const keys = Object.keys(LIB);
  const pr = (prompt||"").toLowerCase();
  let hit = pr && keys.find(k => pr.includes(k.toLowerCase()) || pr.includes((LIB[k].label||"").toLowerCase()));
  if(!hit && pr){ hit = keys.find(k => (LIB[k].label||"").toLowerCase().split(/[^a-z]+/).some(w=>w.length>2 && pr.includes(w))); }
  const classType = hit || keys[0];
  const subType = Object.keys(LIB[classType]?.subTypes||{})[0] || null;
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

// getLibrary / saveLibrary / resetLibrary moved to src/lib/libraryAccess.js in
// session 18 (DEC-16). They lived here, which meant App.jsx was the only file
// that could see a gym's edits — every other surface read the built-in
// WORKOUT_LIBRARY constant directly. That was the whole seam behind DEC-16.

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
//
// `lib` is the MERGED catalogue. It is what separates "this class type has no
// built-in stage template" from "this class type does not exist": the first is
// every gym-authored type since DEC-16 and must produce a usable skeleton, the
// second is bad input and must still return null so `applyTemplate` bails.
//
// Getting that distinction wrong is what shipped the hour-long regression this
// guards: a gym type fell into the null branch, `applyTemplate` returned early,
// and the Builder silently kept the PREVIOUS class type's stages under the new
// type's name.
function buildStagesFromTemplate(classType, subType, lib) {
  const known = !!(lib || {})[classType];
  const tmpl = CLASS_STAGE_TEMPLATES[classType]?.[subType]
    || (known ? DEFAULT_STAGE_TEMPLATE : null);
  if (!tmpl) return null;
  return tmpl.map(t => ({ id:uid(), name:t.name, type:t.type, dur:t.dur, exercises:[], tracks:[], groups:[] }));
}

// Deep-clone template stages so tracks are fully isolated per session
function cloneTemplateStages(tmpl) {
  return tmpl.stages.map(s => ({ ...s, id:uid(), tracks:[], exercises:s.exercises.map(e=>({...e})) }));
}

// GLOSSARY moved to src/data/glossary.js (imported above).

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// `CLASS_TYPES` — a third hardcoded list of capitalised class-type strings, with
// no reader anywhere in the repo. Module-local and never exported, so nothing
// outside this file could have used it either. It survived because neither
// `no-unused-vars` nor the `dead` script reports an unused UPPERCASE declaration.
// git history keeps it; the catalogue is the list.

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
// ProfileModal moved to src/screens/ProfileModal.jsx (lazy) — with GYM_FONTS,
// its only reader. See the React.lazy near the top of this file.

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
// `djProgress` was threaded in here and never read — a leftover from the music
// cut. Removed in session 18's regression pass; `deadctl` is back to zero unused
// props repo-wide.
function DashboardScreen({onNavigate, onNewSession, profile, sessionHistory=[], stages=[], sessionName="", nowPlaying=null}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isNarrow = vw < 1000;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
  const first = coachFirstName(profile?.display_name);
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
  ].map(g => ({ ...g, items: g.items.filter(it => isViewEnabled(it.k, { supabaseEnabled })) })).filter(g => g.items.length);

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
                {/* Was onNavigate("templates") — a view retired at the
                    isViewEnabled choke-point with no render branch left behind,
                    so it emptied the content area and stranded the coach with no
                    way back. The four nav arrays route through that choke-point;
                    this button did not, which is how a retired screen survived in
                    the one place that is not a menu. With no draft the primary
                    button already says "New class", so the second one is noise. */}
                {hasDraft && <button onClick={onNewSession} style={{padding:"11px 20px",background:"var(--navy)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"14px"}}>New class</button>}
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
              {/* Reaching the end, said once. See `justFinished` in
                  setupProgress.js for why it lives here and not on the checklist:
                  finishing the third step is what HIDES the checklist, so its own
                  "setup is done" line was unreachable. Retires itself when the
                  second class is run — no dismiss button, no key to remember. */}
              {setup.justFinished && (
                <div data-testid="setup-complete" style={{...card,padding:isMobile?"12px 14px":"14px 18px",
                     background:"color-mix(in srgb, var(--green) 8%, transparent)",
                     border:"1px solid color-mix(in srgb, var(--green) 24%, transparent)"}}>
                  <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>
                    <Check size={13} style={{verticalAlign:"-2px"}}/> That&rsquo;s your studio set up, and your first class is in the books.
                  </div>
                  <div style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginTop:"3px"}}>
                    The numbers above are yours now — they fill in as you run classes.
                  </div>
                </div>
              )}
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}><div style={{fontSize:"14px",fontWeight:"800",color:"var(--text)"}}>Today's classes</div><button onClick={()=>onNavigate("calendar")} data-tap style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Calendar →</button></div>
              {todayClasses.length===0 && <div style={{fontSize:"12px",color:"var(--muted)",padding:"8px 0"}}>No classes scheduled today.</div>}
              {todayClasses.map((c,i)=>(
                <div key={i} data-testid="today-class" style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<todayClasses.length-1?"1px solid var(--border)":"none"}}>
                  <div data-testid="today-class-color" style={{width:"3px",height:"34px",borderRadius:"2px",background:c.color,flexShrink:0}}/>
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
                  {/* The catalogue's LABEL. `c.type` is a KEY, and printing it
                      raw put `GYM-BARRE-MRKHJ2LC` on the coach's dashboard.
                      Ellipsised for the same reason the Schedule grid is:
                      "Boxing / Kickboxing" is a real label and this row is
                      already carrying a name, a coach and a duration. */}
                  {c.typeLabel && <div data-testid="today-class-type" style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",flexShrink:0,textTransform:"uppercase",letterSpacing:"0.5px",maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.typeLabel}</div>}
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



// ─── CalendarScreen (Planning & Schedule Board) ───────────────────────────────
// CalendarScreen moved to src/screens/CalendarScreen.jsx (imported above)

// ─── BrandStudioScreen ──────────────────────────────────────────────────────
// Moved to src/screens/BrandStudioScreen.jsx and lazily loaded (see the
// React.lazy near the top of this file). Owner-only, opened rarely, and the
// only caller of colors.js's palette generator — so the chunk takes that with
// it rather than every coach downloading it to run a 6am class.

// ─── LibraryBrowserModal + the Glossary it folds in ─────────────────────────
// Moved to src/screens/LibraryBrowserModal.jsx and lazily loaded. A modal is
// already behind a click, so the chunk fetch costs a beat the user has accepted.

function SmartBuildDialog({ onClose, smartPrompt, setSmartPrompt, runSmartBuild, smartBusy, applyTemplate }) {
  const dlg = useDialog(onClose, "Build a class");
  // DEC-16: the merged catalogue, so "Or insert a template" offers the gym's own
  // class types alongside the built-in ten.
  const LIB = getLibrary();
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"14px",padding:"22px",width:"min(480px,100%)",boxSizing:"border-box",outline:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
          <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",fontFamily:"var(--display)"}}>Build a class</div>
          <button onClick={onClose} aria-label="Close build a class" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><X size={18}/></button>
        </div>
        <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"8px"}}>Describe it and Jungle builds the stages + exercises:</div>
        <div style={{display:"flex",gap:"8px",marginBottom:"18px"}}>
          <input autoFocus value={smartPrompt} onChange={e=>setSmartPrompt(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ runSmartBuild(); } }} placeholder="e.g. 45 min HIIT with a strength finisher" style={{flex:1,minWidth:0,padding:"10px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
          <button onClick={()=>{ runSmartBuild(); }} style={{padding:"10px 16px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px",whiteSpace:"nowrap",opacity:smartBusy?0.6:1}} disabled={smartBusy}>{smartBusy?"Building…":"Build"}</button>
        </div>
        <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Or insert a template</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",maxHeight:"240px",overflowY:"auto"}}>
          {Object.entries(LIB).map(([k,cls])=>(
            <button key={k} onClick={()=>{ const sub=Object.keys(cls.subTypes||{})[0]||null; applyTemplate(k,sub); onClose(); }} style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",textAlign:"left"}}>
              <span style={{fontSize:"18px"}}>{cls.icon}</span><span style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{cls.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuilderScreen({stages, onStageChange, onAddStage, onRemoveStage, onRemoveTrack, onAddTrack, onReorderTrack, sessionName, onSessionNameChange, onStartSession, onReorderStages, onMoveExercise, onOverviewDisplay, onBack, classChoice, onClassChoiceChange, onDjClass, djProgress, crossfade, onCrossfadeChange, onExportClass, onImportClass, onShareCard, scheduledType}) {
  // `showToast` belongs to the Library component, not this one — §3.2's first
  // attempt called it here and it was simply not in scope.
  const { toast } = useToast();
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
    // FLAGS.music first: this was the last ungated reference to
    // enrichTracksWithBpm, and a BPM lookup for a stereo the gym is not allowed
    // to drive is work nobody asked for even when it is free.
    if (!FLAGS.music) return;
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
  // §3.2. The one save in this file with NO visible consequence at all: the field
  // clears and a GIF starts loading, so a key that was stored and a key that was
  // silently dropped look identical — and if the fetch then fails, the coach cannot
  // tell whether their key is wrong or was never saved. That is precisely the
  // "a save and a no-op are indistinguishable" case toast.jsx was built for.
  const saveGifKey = (gkey, name) => {
    const v=(gifKeyDraft||"").trim(); if(!v) return;
    store.saveExerciseDbKey(v);
    setGifKeyDraft("");
    toast("API key saved");
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

  // Class type / sub-type selection. DEC-16: the MERGED catalogue, so a
  // gym-authored type is selectable here and not only visible in the Library.
  // Read per render rather than memoised — that is what makes a type created in
  // the Library modal appear in this dropdown without any cross-component wiring.
  const LIB = getLibrary();
  const classKeys = Object.keys(LIB);
  const selectedClass   = classChoice?.classType || classKeys[0];
  const selectedSubKeys = Object.keys(LIB[selectedClass]?.subTypes || {});
  const selectedSub     = classChoice?.subType || selectedSubKeys[0] || null;

  // ── §3A left the class type behind ────────────────────────────────────────
  // Starting a class from the Schedule pins the occurrence and carries the
  // NAME. It never carried the class TYPE — so pressing Start on a Barre class
  // opened this screen reading CrossFit: the header said CrossFit, the dropdown
  // said CrossFit, and the plan underneath was Back Squat and Burpee Complex,
  // while the pinned banner two rows up correctly said "Running Barre Flow from
  // the schedule". Storage was never wrong (the occurrence keeps its own
  // class_type, §1); the SCREEN was, and the screen is what a coach teaches
  // from. A coach who does not notice presses ▶ Start Session and runs a
  // CrossFit plan in a Barre room.
  //
  // STATED, NOT APPLIED. Rebuilding the stages on Start would throw away a plan
  // the coach may have spent the morning on, at 17:58 with the room filling up —
  // the same confident wrong guess `handleStartScheduled` already refuses when
  // it lands here instead of in the live timer. Offered as one press, routed
  // through `handleClassChange` so a draft carrying custom exercises still gets
  // the existing "replace your stages?" confirm.
  //
  // Only when the catalogue KNOWS the type. A rule saved carrying "Mobility"
  // resolves to no class type at all (deliberately — `resolveClassType` does not
  // guess), and a button offering to load one would be a control that does
  // nothing, which is the failure this repo keeps deleting.
  const schedKey = scheduledType && LIB[scheduledType] ? scheduledType : "";
  const typeMismatch = !!schedKey && schedKey !== selectedClass;

  // Helper: does a stage have any manually-authored exercises?
  const hasCustomExercises = s => (s.exercises||[]).some(e => !e.source || e.source !== "library");
  const anyCustom = stages.some(hasCustomExercises);

  // Apply a template + immediately smart-distribute exercises from the library
  const applyTemplate = (classType, subType) => {
    const newStages = buildStagesFromTemplate(classType, subType, LIB);
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

  // Add a movement from the studio's library to the currently-selected stage.
  // Returns the stage NAME so the modal can say where it landed — the coach is
  // looking at a full-screen modal and cannot see which stage is selected behind
  // it — or null when there is no stage to add to, so the toast never claims an
  // add that did not happen.
  const handleAddLibraryExercise = (ex) => {
    const idx = Math.min(selIdx, stages.length - 1);
    if (idx < 0) return null;
    const s = stages[idx];
    onStageChange(idx, { ...s, exercises: [...(s.exercises||[]), {...ex, id:"disc_"+Date.now()}] });
    return s.name;
  };

  // Handle class type change from the selector
  const handleClassChange = (classType) => {
    const firstSub = Object.keys(LIB[classType]?.subTypes||{})[0]||null;
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
          {/* DEC-12, resolved: this used to call `onOverviewDisplay` — the same
              handler as the "Preview on TV" button 35 lines below — while
              sitting where every other screen puts Back and drawing a back
              chevron. The Builder now goes back like everything else, and
              Preview on TV keeps its own labelled button. */}
          <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center",flexShrink:0,padding:"4px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
              <span style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"21px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:isMobile?"140px":"320px"}}>{sessionName||"Untitled Session"}</span>
              {/* Icon-only, so it had no accessible name at all — a screen reader
                  announced "button". aria-label and not title: a title does not
                  override text content for a button's accessible name. */}
              <button aria-label="Rename class" data-tap onClick={()=>{const n=prompt("Session name:",sessionName);if(n)onSessionNameChange(n);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",padding:"2px",display:"flex",flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            </div>
            {!isMobile && <div style={{fontSize:"12px",color:"var(--muted)"}}>
              {Math.round(totalDur/60)} min · {stages.length} stages · {LIB[selectedClass]?.label||selectedClass} · target RPE 7–8
            </div>}
          </div>
        </div>
        {/* Right: action buttons */}
        {!isMobile && (
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
            <input ref={importFileRef} type="file" accept="application/json,.json" onChange={handleImportFile} aria-label="Choose a Jungle class file to open" style={{display:"none"}}/>
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
        {/* The "Class" / "Style" / "Preset" captions beside these three are
            `!isMobile`, so on a phone they are not merely unassociated — they
            are not on the page at all, and three adjacent unnamed dropdowns is
            what a screen-reader user got. */}
        <select value={selectedClass} onChange={e=>handleClassChange(e.target.value)} aria-label="Class type"
          style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid ${LIB[selectedClass]?.color||"var(--border)"}`,borderRadius:"7px",color:"var(--text)",fontSize:isMobile?"11px":"12px",cursor:"pointer",fontWeight:"600",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
          {classKeys.map(k=><option key={k} value={k}>{LIB[k].icon} {LIB[k].label}</option>)}
        </select>
        {selectedSubKeys.length > 0 && <>
          {!isMobile && <span style={{fontSize:"10px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px",flexShrink:0}}>Style</span>}
          <select value={selectedSub||""} onChange={e=>handleSubChange(e.target.value)} aria-label="Class style"
            style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid ${LIB[selectedClass]?.color||"var(--border)"}`,borderRadius:"7px",color:"var(--text)",fontSize:isMobile?"11px":"12px",cursor:"pointer",flex:isMobile?"1":"0 0 auto",minWidth:0}}>
            {selectedSubKeys.map(sk=><option key={sk} value={sk}>{LIB[selectedClass].subTypes[sk].label}</option>)}
          </select>
        </>}
        {/* What the SCHEDULE says this class is, when the Builder disagrees.
            Placed beside the control it is about rather than in the pinned
            banner: the banner says where check-ins land, this says what the
            coach put on the schedule, and the two are different facts.
            The button's visible text carries the class name, so it needs no
            aria-label — "Load it" would announce as "Load it" beside four other
            controls. */}
        {typeMismatch && (
          <div data-testid="scheduled-type-notice"
            style={{display:"flex",alignItems:"center",gap:"7px",padding:"3px 4px 3px 9px",borderRadius:"7px",
                    background:"color-mix(in srgb, var(--accent) 10%, transparent)",
                    border:"1px solid color-mix(in srgb, var(--accent) 32%, transparent)",flexShrink:0,minWidth:0}}>
            <span style={{fontSize:"11px",color:"var(--text)",fontWeight:"600",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              Scheduled as {LIB[schedKey].label}
            </span>
            <button onClick={()=>handleClassChange(schedKey)}
              title={`Rebuild this class from the ${LIB[schedKey].label} template`}
              style={{padding:"4px 9px",background:"var(--accent)",color:"var(--on-accent)",border:"none",borderRadius:"5px",
                      cursor:"pointer",fontSize:"11px",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0}}>
              Load {LIB[schedKey].label}
            </button>
          </div>
        )}
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
          aria-label="Start from a ready-made Jungle class"
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
          style={{display:"flex",alignItems:"center",gap:"6px",padding:isMobile?"6px 10px":"8px 14px",background:djProgress?.active?"var(--border)":"linear-gradient(135deg,#1DB954,#148a3d)"  /* Spotify green — a third-party brand mark, see PlaylistImportModal */,color:"#fff",border:"none",borderRadius:"8px",cursor:djProgress?.active?"wait":"pointer",fontSize:isMobile?"12px":"13px",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0}}>
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
        <div style={{padding:"10px 24px",background:"color-mix(in srgb, var(--warn) 9%, transparent)",borderBottom:`1px solid var(--warn-border)`,display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{fontSize:"11px",color:"var(--text)",flex:1,minWidth:"200px"}}>
            <span style={{fontWeight:"700",color:hueInk("var(--warn)")}}>⚠️ Apply {LIB[templatePrompt.classType]?.icon} {LIB[templatePrompt.classType]?.label} template?</span>
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
                  <button onClick={e=>{e.stopPropagation();onRemoveStage(i);}} aria-label={`Remove ${s.name || cfg.label || "stage"}`} data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger)",padding:"4px",display:"flex",flexShrink:0}}>
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
                          {/* Move this movement to another stage.
                              `onMoveExercise` was threaded into BuilderScreen
                              and never called: the root's handleMoveExercise
                              was written, wired and had no control anywhere in
                              the app, so a coach who put a movement in the
                              wrong stage had exactly one route — delete it and
                              retype it into the right one.

                              A SELECT, not a drag. The row already renders a
                              six-dot grip glyph that suggests dragging and has
                              never been wired to anything, and dragging between
                              two collapsible stage cards is the gesture most
                              likely to fail on the phone a coach actually plans
                              on. A destination list is keyboard-reachable and
                              touch-reachable without any of that, and it names
                              what it will do.

                              Only rendered when there IS somewhere to move to —
                              a one-stage class shows nothing rather than a
                              dropdown with no options, which is the empty-menu
                              version of a control that refuses the click. */}
                          {onMoveExercise && stages.length > 1 && (
                            <select value="" aria-label={`Move ${ex.n} to another stage`}
                              onClick={ev=>ev.stopPropagation()}
                              onChange={ev=>{
                                ev.stopPropagation();
                                const to = parseInt(ev.target.value, 10);
                                if (Number.isNaN(to)) return;
                                onMoveExercise(i, ei, to);
                                setDistributeToast({msg:`↪ Moved ${ex.n} to ${stages[to]?.name || `stage ${to+1}`}`});
                                setTimeout(()=>setDistributeToast(null), 3000);
                              }}
                              style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"11px",padding:"2px",flexShrink:0,maxWidth:"34px"}}>
                              <option value="">↪</option>
                              {stages.map((ts,ti)=>ti===i?null:(
                                <option key={ts.id||ti} value={ti}>{ts.name || `Stage ${ti+1}`}</option>
                              ))}
                            </select>
                          )}
                          {/* ⚠️ Deliberately NOT `data-tap`, and this is the one
                              place in the app where that decision is interesting.
                              At 390px the exercise rows are ~30px apart, so two
                              44px overlays on adjacent rows overlap and the lower
                              one swallows the upper one's bottom third — the tap
                              sweep caught it and named the thief. The overlay
                              cannot fix a target that is smaller than its own row.
                              The real fix is row height at phone width, which is a
                              layout change to the Builder's densest surface rather
                              than polish, so it is measured and left: 19x19px in a
                              30px row. Mis-tapping opens a neighbouring movement's
                              preview, which is wrong but harmless — the reason
                              this is a follow-up and not a defect. */}
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

            {/* Soundtrack tab.
                Gated on FLAGS.music FIRST, and that order is the whole point.
                `subTab` is runtime state, so `subTab==="music"` alone is a
                condition rollup cannot evaluate — it kept ~200 lines of
                crossfade slider, energy-curve SVG, track list and four
                handleTrackDrag* handlers in the main chunk for a tab that no
                path can reach with music cut. FLAGS.music is a const literal,
                so leading with it lets the branch fold away entirely.

                This is the same shape as the 21 KB found in session 14: a flag
                is only a build-time constant where EVERY path to the flagged
                code is itself gated, and a state variable seeded from a flag
                does not count. */}
            {FLAGS.music && subTab==="music" && (
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
                          <div style={{width:"32px",height:"32px",borderRadius:"7px",background:"repeating-linear-gradient(45deg,#1b2a20,#1b2a20 4px,#22382a 4px,#22382a 8px)"  /* "no album art" hatch, inside the FLAGS.music quarantine */,flexShrink:0,overflow:"hidden"}}>
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
                {/* ⚠️ ITS OWN BOUNDARY, and `null` rather than `ScreenLoading`.
                    This site is INSIDE the Builder, and the per-view Suspense
                    wraps the Builder — so suspending without one replaces the
                    whole screen with "Loading…" for the beat the chunk takes.
                    A modal that has been asked for simply arrives; a Builder
                    that vanishes and comes back is a bug that looks like one. */}
                <Suspense fallback={null}>
                  <LibraryBrowserModal onClose={()=>setSubTab(FLAGS.music?"music":"settings")} onAddExercise={handleAddLibraryExercise} initialClass={selectedClass}/>
                </Suspense>
              </div>
            )}

            {/* Settings tab */}
            {subTab==="settings" && stage && (
              <div style={{flex:1,padding:"22px",display:"flex",flexDirection:"column",gap:"16px",overflowY:"auto"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>{stage.name} — Settings</div>
                <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                  {/* These three already HAD visible <label> elements. None was
                      associated with its field — no htmlFor, and the input is a
                      sibling rather than a child — so the text was decoration
                      and the accessible name was empty. htmlFor rather than
                      aria-label, because it also makes the label clickable,
                      which widens the hit target on the phone this screen has
                      to work on. */}
                  <div>
                    <label htmlFor="stage-name" style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage name</label>
                    <input id="stage-name" value={stage.name} onChange={e=>onStageChange(selIdx,{...stage,name:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label htmlFor="stage-duration" style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Duration (minutes)</label>
                    <input id="stage-duration" type="number" min="1" max="60" value={Math.round(stage.dur/60)}
                      onChange={e=>onStageChange(selIdx,{...stage,dur:parseInt(e.target.value||"1")*60})}
                      style={{width:"100%",padding:"8px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"13px",marginTop:"5px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label htmlFor="stage-type" style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.5px"}}>Stage type</label>
                    <select id="stage-type" value={stage.type} onChange={e=>onStageChange(selIdx,{...stage,type:e.target.value})}
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
      {FLAGS.music && showPlaylistModal && (
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
        <SmartBuildDialog
          onClose={()=>setShowSmart(false)}
          smartPrompt={smartPrompt} setSmartPrompt={setSmartPrompt}
          runSmartBuild={runSmartBuild} smartBusy={smartBusy}
          applyTemplate={applyTemplate}/>
      )}
      {showLibraryModal && (
        <Suspense fallback={null}>
          <LibraryBrowserModal onClose={()=>setShowLibraryModal(false)} onAddExercise={handleAddLibraryExercise} initialClass={selectedClass}/>
        </Suspense>
      )}
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
// Session-scoped dismissal. sessionStorage rather than component state so a
// remount cannot resurrect it, and rather than localStorage so it cannot outlive
// the tab — "hide this for now" is a statement about this sitting, not a
// preference. There is deliberately NO "never show again": the ledger is the
// only warning that data exists on one device only.
const SYNC_DISMISS_KEY = "jungle_sync_banner_dismissed";

function SyncBanner() {
  const [errs, setErrs] = useState(() => store.syncErrors());
  const [dismissedSig, setDismissedSig] = useState(() => {
    try { return sessionStorage.getItem(SYNC_DISMISS_KEY) || ""; } catch (_) { return ""; }
  });
  const [retrying, setRetrying] = useState(false);
  const settle = useRef(null);
  useEffect(() => {
    // Poll rather than subscribe: writes are fire-and-forget from ~30 call sites,
    // and a localStorage read every 15s is far cheaper than threading a callback
    // through all of them.
    const t = setInterval(() => setErrs(store.syncErrors()), 15000);
    return () => { clearInterval(t); if (settle.current) clearTimeout(settle.current); };
  }, []);

  const sig = store.syncErrorSignature(errs);
  if (!errs.length) return null;
  if (sig && sig === dismissedSig) return null;

  const names = [...new Set(errs.map(e => SYNC_DOMAIN_LABELS[e.table] || e.table))];
  // Newest failure across the ledger, and the worst attempt count — "how long has
  // this been going on" is one question, not one per table. `attempts` counts
  // failures AFTER the first (it starts at 0), so the honest number of tries is
  // one more than it.
  // A ledger entry written by an older build may have no `at` at all. Filtering
  // those out rather than defaulting them to 0 keeps the "last tried" line honest
  // — 0 would render as "19000 days ago", which is worse than saying nothing.
  const ats = errs.map(e => Number(e.at)).filter(n => Number.isFinite(n) && n > 0);
  const tries = Math.max(...errs.map(e => (Number(e.attempts) || 0))) + 1;
  const ago = ats.length ? fmtAgo(Math.max(...ats)) : "";
  const when = [ago && `last tried ${ago}`, `${tries} failed ${tries === 1 ? "attempt" : "attempts"}`]
    .filter(Boolean).join(" · ");
  // A blip and a fortnight of divergence must not look the same. Past the
  // threshold the sentence stops promising it will sort itself out, and the
  // colour stops being the app's ordinary "heads up" amber.
  const stuck = tries >= SYNC_STUCK_AFTER;
  // Fixed severity colours, never skin-derived — see `--danger` in colors.js.
  const hue = stuck ? "var(--danger)" : "var(--warn)";

  const tryNow = () => {
    setRetrying(true);
    store._retryNow({ force: true });
    // The push is fire-and-forget, so there is nothing to await. Re-read the
    // ledger after a beat: a success clears the entry and the banner removes
    // itself, which is the outcome this button exists to produce.
    settle.current = setTimeout(() => { setErrs(store.syncErrors()); setRetrying(false); }, 1500);
  };
  const dismiss = () => {
    try { sessionStorage.setItem(SYNC_DISMISS_KEY, sig); } catch (_) { /* private mode */ }
    setDismissedSig(sig);
  };

  const btn = {padding:"0 12px",minHeight:"32px",borderRadius:"6px",cursor:"pointer",
               fontSize:"11px",fontWeight:"700",flexShrink:0};
  return (
    <div data-testid="sync-banner" data-stuck={stuck ? "1" : "0"} role="status" aria-live="polite"
         style={{padding:"9px 24px",
         // ⚠️ `color-mix`, not `${hue}14`. Appending 8-bit hex alpha to a colour
         // STRING only works while that string is 6-digit hex — the moment the
         // severity colours became tokens, `var(--warn)14` stopped being a colour
         // and the banner lost its tint AND its border on both states. The e2e
         // caught it; CalendarScreen's grid documents the same trap.
         background:`color-mix(in srgb, ${hue} 8%, transparent)`,borderBottom:`1px solid color-mix(in srgb, ${hue} 33%, transparent)`,fontSize:"12px",color:"var(--text)",lineHeight:1.5}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:"12px",flexWrap:"wrap"}}>
        <div style={{flex:"1 1 240px",minWidth:0}}>
          <strong>Some changes haven’t synced yet</strong> ({names.join(", ")}). {syncBannerMessage(tries)}
          {when && <div data-testid="sync-banner-when" style={{color:"var(--muted)",marginTop:"2px"}}>{when}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
          <button onClick={tryNow} disabled={retrying} data-testid="sync-banner-retry"
                  style={{...btn,background:"var(--accent)",color:"var(--bg)",border:"none",
                          opacity:retrying?0.6:1,cursor:retrying?"default":"pointer"}}>
            {retrying ? "Trying…" : "Try now"}
          </button>
          <button onClick={dismiss} data-testid="sync-banner-dismiss" aria-label="Hide this warning for now"
                  title="Hide until something new fails"
                  style={{...btn,minWidth:"32px",padding:"0 9px",background:"transparent",
                          border:"1px solid var(--border)",color:"var(--muted)"}}>
            ✕
          </button>
        </div>
      </div>
      {/* The reason, available without shouting it. A coach does not need
          "violates row-level security policy" on screen mid-class; whoever they
          forward it to needs nothing else. */}
      <details data-testid="sync-banner-details" style={{marginTop:"6px"}}>
        <summary style={{cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>What went wrong</summary>
        <ul style={{margin:"6px 0 0",paddingLeft:"18px",color:"var(--muted)",fontSize:"11px"}}>
          {errs.map(e => (
            <li key={e.table} style={{wordBreak:"break-word"}}>
              <strong>{SYNC_DOMAIN_LABELS[e.table] || e.table}</strong> — {e.msg || "unknown error"}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// PersonasScreen and its panels moved to src/screens/personas/PersonasScreen.jsx
// (I6 stage 4). SyncBanner above stays: it is the GENERAL unsynced-data banner,
// not a persona one, and every view uses it.

function AppSidebar({ view, onNavigate, onProfile, profile, can=(()=>true) }){
  const nav = [
    {group:"HOME",   items:[{k:"dashboard",l:"Dashboard",Icon:Home}]},
    {group:"BUILD",  items:[{k:"builder",l:"Class Builder",Icon:Layers,cap:"class:view"},{k:"personas",l:"Coaches",Icon:Mic,cap:"class:view"},{k:"templates",l:"Templates",Icon:LayoutGrid,cap:"templates:view"},{k:"library",l:"Exercise Library",Icon:BookOpen,cap:"library:view"},{k:"glossary",l:"Glossary",Icon:List,cap:"glossary:view"}]},
    {group:"RUN",    items:[{k:"live",l:"Class Runner",Icon:PlayCircle,cap:"class:view"}]},
    {group:"MANAGE", items:[{k:"calendar",l:"Schedule",Icon:Calendar,cap:"schedule:view"},{k:"member",l:"Members",Icon:Users,cap:"members:view"},{k:"team",l:"Team",Icon:Users,cap:"members:manage"},{k:"analytics",l:"Analytics",Icon:BarChart2,cap:"analytics:view"}]},
    {group:"GROW",   items:[{k:"brand-studio",l:"Brand Studio",Icon:Palette,cap:"brand:view"},{k:"integrations",l:"Integrations",Icon:Plug,cap:"integrations:manage"}]},
  ].map(g => ({ ...g, items: g.items.filter(it => (!it.cap || can(it.cap)) && isViewEnabled(it.k, { supabaseEnabled })) })).filter(g => g.items.length);
  const first = coachFirstName(profile?.display_name);
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
  const items = BOTTOM_NAV.filter(it => (!it.cap || can(it.cap)) && isViewEnabled(it.key, { supabaseEnabled }));
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
// The fallback while a lazily-loaded screen's chunk arrives. Says what is
// happening rather than showing a bare white panel — an empty screen and a
// broken screen look identical, and this app has shipped the second one twice.
function ScreenLoading() {
  // The testid, not the words, is what `nav()` in e2e/helpers.js waits to clear.
  // Three other screens render the literal text "Loading…" for their own reasons,
  // and matching on it would make the helper hang on whichever happened to be
  // fetching.
  return (
    <div data-testid="screen-loading" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"40px"}}>
      <p style={{fontSize:"13px",color:"var(--muted)"}}>Loading…</p>
    </div>
  );
}

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
  // Available here because ToastProvider moved up into StaffApp.jsx. Used by
  // handleNewClass, which is this component's only destructive action.
  const { toast } = useToast();

  // `spPaused` is deliberately NOT destructured. useSpotify still returns it —
  // the hook's shape is the quarantine's contract and must not shrink — but the
  // root threaded it through App -> LiveScreen, App -> RoomTV -> DisplayScreen
  // and not one of the three ever read it. A prop list is the honest statement
  // of what a component depends on, and I6 stage 5 leans on exactly that.
  const { token, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices,
          nowPlaying, authError, spError, profile, logout } = useSpotify();

  // Account auth (Google via AuthGate) + local-first store wiring. Declared with
  // the other top-level hooks — before any early return below — so the hook
  // order never changes. store.connect() tells store.js the current gym/user so
  // domain writes sync to Postgres in the background (no-op when Supabase off).
  const auth = useJungleAuth();
  store.connect({ gymId: auth?.gym?.id, userId: auth?.user?.id });

  const [pinUnlocked, setPinUnlocked] = useState(() => sessionStorage.getItem("jungle_pin_ok") === "1");
  const [showNav, setShowNav] = React.useState(false);
  const [crossfade, setCrossfade] = useState(() => store.getCrossfade());
  useAfterMount(() => { store.saveCrossfade(crossfade); }, [crossfade]);

  // ── Skin / Theme ─────────────────────────────────────────────────────────
  const [activeSkinId, setActiveSkinId] = useState(() => store.getSkinId());
  const [customSkinTokens, setCustomSkinTokens] = useState(() => store.getCustomSkinTokens());
  // The gym's base skin and the tokens actually in force. One rule, in
  // skins.js, because this file used to carry a second one — see its header.
  const _base = baseSkin(activeSkinId);
  const skinTokens = resolveSkinTokens(activeSkinId, customSkinTokens);
  // FR-A6: no JS mutation of T — set CSS vars synchronously (pre-paint) so var(--x) reads resolve.
  const _skinF = _base.fonts;
  // 🔴 `_base`, never `PRESET_SKINS[activeSkinId] || {}`. That empty object is
  // what stripped a gym's typography: `applySkinCSS` only writes `--display`,
  // `--body`, `--glow` and `--num` when `meta` HAS them, so an id with no preset
  // behind it left the fonts unset on the first paint of a fresh load. A gym on
  // Atelier who nudged one colour kept Instrument Serif until they next opened
  // the app.
  applySkinCSS(skinTokens, _base);
  // Custom tokens change the PALETTE, not the skin's typography, voice or
  // programme tints — those still come from the base the gym chose. The old
  // branch replaced all of them with a canopy-flavoured hardcoded set.
  const activeSkinObj = customSkinTokens
    ? { ..._base, name: "Custom", source: "custom", tokens: skinTokens }
    : _base;
  // Split deliberately. Applying the CSS variables and injecting the skin's
  // fonts MUST happen on mount — that is what makes the app look like itself.
  // Persisting the skin must NOT, or a fresh device pushes the default "canopy"
  // over the studio's real skin before hydrate can read it (see useAfterMount).
  useEffect(() => {
    applySkinCSS(skinTokens, _base);
    injectSkinFonts(_base);
  }, [activeSkinId, customSkinTokens]);
  useAfterMount(() => {
    store.saveSkinId(activeSkinId);
    if (customSkinTokens) store.saveCustomSkinTokens(customSkinTokens);
    else store.clearCustomSkinTokens();
  }, [activeSkinId, customSkinTokens]);

  // ── Gym branding ─────────────────────────────────────────────────────────
  const [gymBranding, setGymBranding] = useState(() => store.getGymBranding());
  useAfterMount(() => {
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
    // DEC-16: merged, so a gym whose first class type is their own does not get
    // silently reset to the built-in first key on every fresh load.
    const LIB0 = getLibrary();
    const fc = Object.keys(LIB0)[0];
    return { classType:fc, subType:Object.keys(LIB0[fc]?.subTypes||{})[0]||null };
  });
  const [view,        setView]        = useState("dashboard");
  const [stages,      setStages]      = useState(() => savedDraft?.stages || mkStages());
  const [sessionName, setSessionName] = useState(() => savedDraft?.name || "My Workout");
  const [showProfile, setShowProfile] = useState(false);
  const [djProgress,  setDjProgress]  = useState(null);
  // Persist the working class on every change, so closing the tab mid-plan is
  // not a data-loss event. Local only — see store.saveDraftClass.
  useEffect(() => {
    store.saveDraftClass({ name: sessionName, stages, classChoice });
  }, [stages, sessionName, classChoice]);

  const [templateTracks, setTemplateTracks] = useState(() => store.getTemplateTracks());
  useAfterMount(() => { store.saveTemplateTracks(templateTracks); }, [templateTracks]);
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

  // ── The Class Runner (I6 stage 5) ─────────────────────────────────────────
  // The runner's clock, its transport, its realtime broadcast and the pinned
  // scheduled class all live in src/screens/runner/useClassRunner.js. What the
  // root still owns is what more than one cluster needs: the class being
  // planned, the history the Dashboard reads, and the Spotify handles.
  const roomGymId = auth?.gym?.id;
  const {
    liveState, setLiveState, runnerTab, setRunnerTab, roomTvMode, setRoomTvMode,
    followRoom, setFollowRoom, remoteRoom, pinnedClass, setPinnedClass,
    handleNextStage, handlePrevStage, handleSkipTimer, handleStartScheduled, saveSession,
  } = useClassRunner({
    view, setView, stages, sessionName, setSessionName,
    player, deviceId, activeDeviceId, nowPlaying, crossfade,
    sessionHistory, setSessionHistory, gymId: roomGymId,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddTrack     = (si, t)        => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:[...(n[si].tracks||[]),t]};          return n; });
  const handleRemoveTrack  = (si, ti)       => setStages(ss => { const n=[...ss]; n[si]={...n[si],tracks:n[si].tracks.filter((_,i)=>i!==ti)};  return n; });
  const handleReorderTrack = (si, from, to) => setStages(ss => { const n=[...ss]; const tr=[...n[si].tracks]; const [mv]=tr.splice(from,1); tr.splice(to,0,mv); n[si]={...n[si],tracks:tr}; return n; });
  const handleAddStage     = ()             => setStages(ss => [...ss, {id:uid(),type:"circuit",name:`Stage ${ss.length+1}`,dur:600,exercises:[],tracks:[]}]);
  const handleRemoveStage  = i             => setStages(ss => ss.filter((_,j)=>j!==i));
  // (handleNextStage / handlePrevStage / handleSkipTimer moved into
  //  useClassRunner — they only ever move the runner's clock.)
  const handleStageChange   = (i, s)  => setStages(ss => { const n=[...ss]; n[i]=s; return n; });
  const handleReorderStages = arr     => setStages(arr);
  // Reachable for the first time in session 16 — the control that calls this was
  // never built. `exercises` is defaulted because this maps over EVERY stage,
  // not just the two involved: a persona draft (setStages(draftStages)) or an
  // imported file can carry a stage with no exercises array, and spreading
  // undefined here would throw inside a setState updater and blank the Builder
  // for a move that has nothing to do with that stage.
  const handleMoveExercise  = (fsi, exIdx, tsi) => {
    setStages(ss => {
      if (!ss[fsi] || !ss[tsi] || fsi === tsi) return ss;
      const n = ss.map(s => ({...s, exercises:[...(s.exercises||[])]}));
      const [mv] = n[fsi].exercises.splice(exIdx, 1);
      if (!mv) return ss;
      n[tsi].exercises.push(mv);
      return n;
    });
  };
  const handleDjClass = playlistIds => {
    // The only remaining ungated path into djOrchestrator, and therefore into
    // spotifyApi's scoring half. Every UI that can call this is already behind
    // FLAGS.music; this makes the handler itself foldable rather than relying
    // on its callers, which is the rule session 14 wrote after the last leak.
    if (!FLAGS.music) return;
    runDjOrchestrator(stages, playlistIds, setStages, setDjProgress)
      .catch(err => setDjProgress({ active:false, stage:0, total:stages.length, done:false, error:err.message||"DJ failed" }));
  };
  // "New class" on the Dashboard, for a coach who already has a draft. The draft
  // is auto-saved on every change (store.saveDraftClass above), so replacing it is
  // the one destructive action on that screen.
  //
  // It used to be a `window.confirm`, and toast.jsx's own header says why that was
  // the wrong guard: "a confirm dialog interrupts every time, including the 99
  // times the coach meant it, and its cost is paid on the success path". Pressing
  // New class after finishing a session is the overwhelmingly common case, and a
  // modal asking whether you meant it is friction on every single one.
  //
  // So: undo. The guard scales with what is destroyed, and what is destroyed here
  // is one in-progress draft — cheap to hold in a closure, unlike the coach
  // cascade, which keeps BOTH a confirm and an undo.
  //
  // ⚠️ The closure holds the PRIOR LIST, not a rebuilt one. `mkStages()` would
  // produce a fresh default set, and restoring that is not restoring the coach's
  // plan — it is quietly replacing it with a different blank.
  const handleNewClass = () => {
    const before = { stages, sessionName };
    setStages(mkStages());
    setSessionName("My Workout");
    setView("builder");
    // Nothing was lost if there was nothing there, and an undo offering to restore
    // an empty plan is noise. Defence rather than a live path: the Dashboard
    // renders this control only `{hasDraft && ...}`, so an empty plan never reaches
    // here today — which is also why no e2e drives this branch.
    if (!before.stages.length) return;
    toast("Started a new class", { undo: () => {
      setStages(before.stages);
      setSessionName(before.sessionName);
      toast("Your previous plan is back");
    } });
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
    const LIB = getLibrary();
    if (builderClass && LIB[builderClass]) {
      const sub = Object.keys(LIB[builderClass].subTypes || {})[0] || null;
      setClassChoice({ classType: builderClass, subType: sub });
    }
    setView("builder");
  };
  // (§3A — starting a class FROM the Schedule — moved into useClassRunner as
  //  `handleStartScheduled`, along with the `pinnedClass` it sets. The Schedule
  //  still hands the occurrence in via CalendarScreen's `onStartClass` below;
  //  what changed is that the reasoning about which class_instance a check-in
  //  lands on now sits next to the panel that writes it.)

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
      // Canopy's values as the LAST RESORT if a token reads empty — `v` prefers
      // the live custom property every time. A share card with no colours at
      // all is worse than one wearing the default skin.
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
    // `_base`, not a raw `PRESET_SKINS[activeSkinId]` lookup: an id with no
    // preset behind it dropped the shell to the system font stack, which is the
    // same "resolve the gym by preset id" mistake as the `meta` one above.
    : `'${_base.fonts.body}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;


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
  ].filter(n => (!n.cap || can(n.cap)) && isViewEnabled(n.key, { supabaseEnabled }));
  const isFullscreen = view==="room-tv";
  const navGroups = ["Main","Insights","Tools","Studio"].filter(g => allNavItems.some(n => n.group===g));
  const navTo = key => {
    if ((view==="live"||view==="room-tv") && player) player.pause().catch(()=>{});
    if (view==="live"||view==="room-tv") setLiveState(ls=>({...ls,playing:false}));
    setView(key); setShowNav(false);
  };

  return (
    <ThemeContext.Provider value={{ skin: activeSkinObj, gymBranding }}>
    {/* ToastProvider now wraps this component from StaffApp.jsx rather than from
        inside it — see the note there. Still the whole staff app; the difference is
        that App can now toast, which a provider cannot do for itself. */}
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
            {/* The only route to settings, on every screen, and it was a 32px
                circle. The `overflow:hidden` that crops the avatar had to move
                to the inner span: on the button it clipped the data-tap overlay
                straight back to 32px, which looks exactly like the fix working. */}
            <button onClick={()=>setShowProfile(true)} aria-label="Your profile and settings" data-tap style={{width:"32px",height:"32px",borderRadius:"50%",background:"var(--navy)",border:`1px solid var(--border)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
              <span style={{width:"100%",height:"100%",borderRadius:"50%",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {displayProfile?.images?.[0]?.url?<img src={displayProfile.images[0].url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/>:<User size={15} color={"var(--muted)"}/>}
              </span>
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
        {/* Suspense sits INSIDE the boundary so a chunk that fails to load reads
            as "this screen stopped responding" rather than blanking the app. The
            fallback is deliberately quiet: on a studio's wifi this is a few
            hundred milliseconds, and a spinner that flashes is worse than a line
            of text. One boundary for every lazy screen, so stage 5 adds screens
            here without adding plumbing. */}
        <Suspense fallback={<ScreenLoading/>}>
        {view==="dashboard"&&<DashboardScreen onNavigate={setView} onNewSession={handleNewClass} profile={displayProfile} sessionHistory={sessionHistory} stages={stages} sessionName={sessionName} nowPlaying={nowPlaying}/>}
        {view==="builder"&&<BuilderScreen onExportClass={handleExportClass} onImportClass={handleImportTemplate} onShareCard={handleShareCard} stages={stages} onStageChange={handleStageChange} onAddStage={handleAddStage} onRemoveStage={handleRemoveStage} onRemoveTrack={handleRemoveTrack} onAddTrack={handleAddTrack} onReorderTrack={handleReorderTrack} sessionName={sessionName} onSessionNameChange={setSessionName} onStartSession={()=>{setLiveState({playing:false,idx:0,elapsed:0});setView("live");}} onReorderStages={handleReorderStages} onMoveExercise={handleMoveExercise} onOverviewDisplay={()=>{setRoomTvMode("studio");setView("room-tv");}} onBack={()=>setView("dashboard")} classChoice={classChoice} onClassChoiceChange={setClassChoice} scheduledType={pinnedClass?.classType||""} onDjClass={handleDjClass} djProgress={djProgress} crossfade={crossfade} onCrossfadeChange={setCrossfade}/>}
        {view==="personas"&&<PersonasScreen onBack={()=>setView("dashboard")} onDraftToBuilder={handleDraftFromPersona}/>}
        {/* The `library` ROUTE keeps the per-view fallback above, deliberately:
            here the modal IS the screen, and `nav()` in e2e/helpers.js waits on
            the `screen-loading` testid to know a navigation has landed. */}
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
            {runnerTab==="run"&&<LiveScreen stages={stages} onBack={()=>{player?.pause().catch(()=>{}); setLiveState(ls=>({...ls,playing:false})); saveSession(); setView("builder");}} liveState={liveState} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} player={player} deviceId={deviceId} activeDeviceId={activeDeviceId} setActiveDeviceId={setActiveDeviceId} devices={devices} refreshDevices={refreshDevices} nowPlaying={nowPlaying} onDisplayMode={()=>{setRoomTvMode("coach");setView("room-tv");}} onNextStage={handleNextStage} onPrevStage={handlePrevStage} onSkipTimer={handleSkipTimer} onAddTrack={handleAddTrack} sessionName={sessionName} classType={classChoice?.classType || ""} coachName={displayProfile?.display_name || ""} classInstanceId={pinnedClass?.id||null} scheduledAt={pinnedClass?.startsAt||null}/>}
            {FLAGS.music&&runnerTab==="dj"&&(token?<MusicHubScreen onBack={()=>setRunnerTab("run")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>:<ConnectSpotifyPrompt onConnect={redirectToSpotify} onBack={()=>setRunnerTab("run")}/>)}
          </div>
        )}
        {view==="room-tv"&&<RoomTV mode={roomTvMode} onMode={setRoomTvMode} onExit={()=>setView(roomTvMode==="studio"?"builder":"live")} stages={stages} sessionName={sessionName} liveState={liveState} nowPlaying={nowPlaying} player={player} deviceId={deviceId} onPlayPause={()=>setLiveState(ls=>({...ls,playing:!ls.playing}))} canFollow={!!roomGymId} follow={followRoom} onFollow={setFollowRoom} remote={remoteRoom}/>}
        {/* The mock branch is kept, and stays folded away while the flag is false
            — its layout is what this screen was built against. What changed is
            the FALSE arm: it used to be a coming-soon panel, and is now the real
            thing computed from the gym's own attendance rows. */}
        {view==="analytics"&&(FLAGS.mockAnalytics?<AnalyticsScreen onBack={()=>setView("dashboard")}/>:<RetentionScreen onBack={()=>setView("dashboard")} onNavigate={setView}/>)}
        {view==="calendar"&&<CalendarScreen onBack={()=>setView("dashboard")} onStartClass={handleStartScheduled}/>}
        {view==="music"&&(!FLAGS.music
          ? <MockDisabledScreen title="Music" note="Jungle no longer runs the music. Studio playback needs licences the gym holds directly, so the room's own sound system stays the room's. The tempo guide on the display is unaffected." onBack={()=>setView("dashboard")}/>
          : token?<MusicHubScreen onBack={()=>setView("dashboard")} stages={stages} nowPlaying={nowPlaying} liveState={liveState} player={player}/>:<ConnectSpotifyPrompt onConnect={redirectToSpotify} onBack={()=>setView("dashboard")}/>)}
        {view==="member"&&<RosterScreen onBack={()=>setView("dashboard")} onNavigate={setView}/>}
        {view==="integrations"&&<MockDisabledScreen title="Integrations" note="Booking, payments and wearable integrations land in a later phase. The cards that used to sit here showed services as “connected” that never were." onBack={()=>setView("dashboard")}/>}
        {view==="brand-studio"&&<BrandStudioScreen onBack={()=>setView("dashboard")} gymBranding={gymBranding} onBrandingChange={setGymBranding} activeSkinId={activeSkinId} onSkinChange={id=>setActiveSkinId(id)} customSkinTokens={customSkinTokens} onCustomSkinChange={setCustomSkinTokens}/>}
        {view==="team"&&<AdminTeamScreen onBack={()=>setView("dashboard")}/>}
        </Suspense>
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

      {/* Outside the per-view Suspense — see the Builder's library modal. */}
      {showProfile&&<Suspense fallback={null}><ProfileModal profile={displayProfile||{display_name:"Coach"}} onClose={()=>setShowProfile(false)} onLogout={()=>{logout();auth?.signOut?.();setView("dashboard");setShowProfile(false);}} sessionHistory={sessionHistory} gymBranding={gymBranding} onBrandingChange={setGymBranding}/></Suspense>}
    </div>
    </div>
    </ThemeContext.Provider>
  );
}
