// ─── PlaylistImportModal ─────────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import { useState, useEffect } from "react";
import { ArrowLeft, Music, Loader, X } from "lucide-react";
import { useWindowWidth } from "../ui/primitives.jsx";
import { SCFG } from "../data/stageConfig.js";
import { openSpotifyAuthPopup } from "./spotifyAuth.js";
import { getBpmCache, enrichTracksWithBpm, apiGetPlaylists, apiGetPlaylistTracks } from "./spotifyApi.js";

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

export { PlaylistImportModal };
