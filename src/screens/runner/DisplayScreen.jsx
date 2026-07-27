// Room TV "Coach" mode — the in-runner coach display.
import { useState, useEffect } from "react";
import { Play, Pause, ArrowLeft, Music, SkipBack, SkipForward } from "lucide-react";
import { FLAGS } from "../../config/flags.js";
import * as store from "../../lib/store.js";
import { SCFG } from "../../data/stageConfig.js";
import { calcIntervalState } from "../../lib/intervalTimer.js";
import { apiPlay } from "../../music/index.js";
import { useTheme, BrandLogo, Tag, useWindowWidth } from "../../ui/primitives.jsx";
import { fmt, fmtSec } from "../../lib/format.js";
import { brandCopy } from "../../lib/brandCopy.js";
import { prefersReducedMotion, tvFont, grpColor } from "./displayKit.js";

// ─── DisplayScreen (TV mode) ──────────────────────────────────────────────────
// "Music Focus" (big album art + timer) is filtered out while music is
// quarantined — the preset renders an empty artwork panel with no player
// attached, and it is the room's TV that shows it (audit 2.1).
export const DISPLAY_PRESETS = [
  { id:"full",    label:"Full",        desc:FLAGS.music?"Timer + exercises + music":"Timer + exercises" },
  { id:"minimal", label:"Minimal",     desc:"Timer + stage name only"   },
  { id:"timer",   label:"Timer Only",  desc:"Giant full-screen clock"   },
  ...(FLAGS.music ? [{ id:"music", label:"Music Focus", desc:"Big album art + timer" }] : []),
];
export const FONT_SCALES = [
  { id:"s",  label:"S",  mult:0.75 },
  { id:"m",  label:"M",  mult:1    },
  { id:"l",  label:"L",  mult:1.4  },
  { id:"xl", label:"XL", mult:1.85 },
];

// Tempo guide (Fable §4.2 / N5): the zero-license default that keeps the rhythm
// value when no soundtrack is playing. A silent, visual metronome — one ring
// "pings" outward per beat at the stage's target BPM. No audio, no licensing.
// Honours reduced-motion (static readout, no ping). BPM = midpoint of the
// stage's SCFG range; the ping interval is 60/bpm seconds.
export function TempoGuide({ bpm, color, reduce, hasTracks }) {
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

export function DisplayScreen({stages, liveState, onBack, player, deviceId, spPaused, nowPlaying, onPlayPause}) {
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
