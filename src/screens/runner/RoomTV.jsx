import { useState, useEffect } from "react";
import { prefersReducedMotion } from "./displayKit.js";
import { OverviewDisplayScreen } from "./OverviewDisplayScreen.jsx";
import { FloorLiveScreen } from "./FloorLiveScreen.jsx";
import { DisplayScreen } from "./DisplayScreen.jsx";

// ─── Room TV (workstreams B+C) ────────────────────────────────────────────────
// ONE fullscreen TV surface with three modes, replacing the separate Studio TV /
// Floor TV / coach-Display views: "studio" = pre-class plan overview, "floor" =
// whole-class live board, "coach" = the in-runner coach display. Fable P1/P2:
// the mode switch is a transient overlay (the running surface keeps the whole
// screen) with buttons sized for an across-the-room tap.
export function RoomTV({ mode, onMode, onExit, stages, sessionName, liveState, nowPlaying, player, deviceId, onPlayPause, canFollow, follow, onFollow, remote }) {
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
      {mode==="coach"  && <DisplayScreen stages={S} liveState={LS} onBack={onExit} player={player} deviceId={deviceId} nowPlaying={NP} onPlayPause={onPlayPause}/>}
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
