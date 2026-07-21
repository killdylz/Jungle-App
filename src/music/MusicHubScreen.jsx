// ─── MusicHubScreen ──────────────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import * as store from "../lib/store.js";
import { FLAGS } from "../config/flags.js";
import { useWindowWidth } from "../ui/primitives.jsx";
import { SCFG } from "../data/stageConfig.js";
import { apiGetPlaylists } from "./spotifyApi.js";

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

export { MusicHubScreen };
