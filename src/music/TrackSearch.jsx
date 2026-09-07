// ─── TrackItem + TrackSearch ─────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, Music, Search, Loader, ChevronRight } from "lucide-react";
import { Input } from "../ui/primitives.jsx";
import { SCFG } from "../data/stageConfig.js";
import { openSpotifyAuthPopup } from "./spotifyAuth.js";
import { SPOTIFY_GENRES, bpmColor, bpmMismatch, getBpmCache, saveBpmCache, normTrack, normSpTrack,
         enrichTracksWithBpm, getAudioFeatures, searchTracks, searchPlaylists,
         apiGetPlaylists, apiGetPlaylistTracks } from "./spotifyApi.js";

// A track's mm:ss duration. App.jsx has the same one-liner for stage durations;
// duplicating one line is the honest price of not inventing a shared module for it.
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
              style={{fontSize:"10px",fontWeight:"700",padding:"1px 6px",borderRadius:"3px",background:bc+"25",color:bc,border:`1px solid ${mismatch?"var(--warn-border)":"transparent"}`,cursor:"pointer",userSelect:"none"}}>
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

export { TrackItem, TrackSearch };
