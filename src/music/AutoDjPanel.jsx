// ─── DjPlaylistModal + AutoDjPanel ───────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Select } from "../ui/primitives.jsx";
import { SCFG } from "../data/stageConfig.js";
import { apiGetPlaylists } from "./spotifyApi.js";

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

export { DjPlaylistModal, AutoDjPanel };
