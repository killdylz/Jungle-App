// The Class Runner itself — the surface a coach drives the room from.
import { useState, useEffect, useRef } from "react";
import { SkipForward, SkipBack, Monitor, Users, Mic } from "lucide-react";
import { FLAGS } from "../../config/flags.js";
import { SCFG } from "../../data/stageConfig.js";
import * as store from "../../lib/store.js";
import { calcIntervalState } from "../../lib/intervalTimer.js";
import { apiPlay, TrackSearch, SpotifyDevicePicker } from "../../music/index.js";
import { useWindowWidth } from "../../ui/primitives.jsx";
import { fmt, fmtSec } from "../../lib/format.js";
import { prefersReducedMotion } from "./displayKit.js";
import { CheckInPanel } from "./CheckInPanel.jsx";

export function LiveScreen({stages, onBack, liveState, onPlayPause, player, deviceId, activeDeviceId, setActiveDeviceId, devices, refreshDevices, spPaused, nowPlaying, onDisplayMode, onNextStage, onPrevStage, onSkipTimer, onAddTrack, sessionName, classType, coachName, classInstanceId, scheduledAt}) {
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
    // FLAGS.music guard, and this one is about more than bytes. Every action
    // below is `player.setVolume(...)` behind `if (player)`, and with music cut
    // `player` is permanently null — so without this the effect asked a coach
    // for MICROPHONE PERMISSION mid-class, opened an AudioContext and ran a
    // requestAnimationFrame loop analysing room audio on a tablet, to duck a
    // player that does not exist. A privacy prompt is not a thing to raise for
    // a feature that cannot act.
    if (!FLAGS.music || !micMode) { if (player) player.setVolume(NORMAL_VOL).catch(()=>{}); return; }
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

  // F15: Keyboard shortcuts — Space=play/pause, N=next stage, ←/→=skip ±10s, Esc=back.
  // S=track search and M=mic mode are BOTH music-only and both now gated. They
  // were the last two ways into the cut subsystem, and neither was reachable
  // from a button, which is why every sweep so far missed them.
  // S: it had no guard, so with music
  // cut a coach who pressed "s" mid-class got a Spotify search modal over the
  // class they were running — the exact theatre audit 2.1 removed everywhere
  // else. It is also why 21 KB of Spotify UI could not be folded out of the
  // bundle: rollup cannot eliminate a component reachable from an unguarded
  // state flag.
  useEffect(() => {
    const onKey = (e) => {
      // Ignore if user is typing in an input/textarea/select
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); handlePlayPause(); }
      else if (e.key === "n" || e.key === "N") { onNextStage(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onSkipTimer(10); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); onSkipTimer(-10); }
      else if (FLAGS.music && (e.key === "s" || e.key === "S")) { setLiveSearchStageIdx(liveState.idx); setShowLiveSearch(true); }
      else if (FLAGS.music && (e.key === "m" || e.key === "M")) { handleMicMode(); }
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
      {FLAGS.music && showLiveSearch && (
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
