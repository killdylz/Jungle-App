// Room TV "Floor" mode — the whole-class live board.
// NOTE: this screen declares its OWN `fmt` (below), and it is deliberately not
// the one in src/lib/format.js — the board clamps negatives and floors the
// seconds so a stage that has overrun reads "0:00" rather than "-1:-3". Do not
// "tidy" it into the shared import: they are different functions.
import React, { useEffect } from "react";
import { SCFG } from "../../data/stageConfig.js";
import * as store from "../../lib/store.js";
import { ArrowLeft } from "lucide-react";
import { FLAGS } from "../../config/flags.js";
import { floorPacer } from "../../lib/intervalTimer.js";
import { BrandLogo, useWindowWidth } from "../../ui/primitives.jsx";
import { prefersReducedMotion, tvFont, scaleMultOf } from "./displayKit.js";

// Honest floor board derived from the coach's real class plan. No fabricated
// member rosters, headcounts, or HR zones — the core is biometric-free (Fable M3)
// and the roster returns for real once F4 attendance check-in lands.
export function buildFloorLayout(stages){
  const src = (stages||[]).filter(Boolean).slice(0,5);
  return src.map((s,i)=>{
    const ex = (s.exercises && s.exercises[0]) || null;
    const cfg = SCFG[s.type] || SCFG.circuit;
    const move = (ex && ex.n) || s.name || cfg.label;
    const scheme = ex ? [ex.s && `${ex.s}×`, ex.r].filter(Boolean).join(" ").trim() : "";
    return { id:"st"+i, type:s.type||"circuit", label:cfg.label, move, scheme, order:i, isStart:i===0, isFinish:i===src.length-1 };
  });
}

export function FloorLiveScreen({ stages=[], liveState={elapsed:0,playing:false,idx:0}, nowPlaying=null, onBack }){
  const vw = useWindowWidth(); const isMobile = vw < 700;
  // The coach's stored S/M/L/XL choice. Read here for the first time: these
  // `tvFont` calls passed no `mult`, so the setting did nothing on this board.
  const scaleMult = scaleMultOf(store.getDisplayPrefs().fontScale);
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
          <div style={{fontSize:tvFont(24,scaleMult),fontWeight:"800",letterSpacing:"2px",color:isWork?"var(--accent)":"var(--muted)"}}>{bigLabel}</div>
          {/* PRIMARY member-facing element on the floor board. At the old fixed
              84px it was 7.8% of a 1080p wall — already under the Fable §3 8% floor
              — and half that on 4K. tvFont(96,scaleMult) holds ~8.9% of height on both. */}
          <div style={{fontFamily:"var(--display)",fontSize:tvFont(96,scaleMult),fontWeight:"900",lineHeight:"0.9",color:(isInterval&&!isWork)?"var(--muted)":"var(--text)",fontVariantNumeric:"var(--num)",textShadow:"var(--glow)"}}>{fmt(bigSec)}</div>
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
              {st.isStart&&<span style={{fontSize:tvFont(11,scaleMult),fontWeight:"800",color:"var(--bg)",background:c,padding:"2px 6px",borderRadius:"4px"}}>START</span>}
              {st.isFinish&&<span style={{fontSize:tvFont(11,scaleMult),fontWeight:"800",color:c,border:`1px solid ${c}`,padding:"2px 6px",borderRadius:"4px"}}>FINISH</span>}
            </div>
            <div style={{fontFamily:"var(--display)",fontSize:tvFont(26,scaleMult),fontWeight:"800",color:"var(--text)",marginBottom:"6px",lineHeight:"1.1"}}>{st.move}</div>
            {st.scheme && <div style={{fontSize:"13px",color:"var(--muted)"}}>{st.scheme}</div>}
            {on&&<div style={{position:"absolute",top:"10px",right:"10px",fontSize:tvFont(11,scaleMult),fontWeight:"800",color:c,letterSpacing:"1px"}}>FOLLOW</div>}
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
