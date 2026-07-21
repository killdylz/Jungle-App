// ─── Auto-DJ orchestrator ────────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import { enrichTracksWithBpm, apiGetPlaylistTracks, apiGetRecommendations,
         scoreTrackForStage, selectTracksForDuration } from "./spotifyApi.js";
import { SCFG } from "../data/stageConfig.js";

// ─── Auto-DJ orchestrator ─────────────────────────────────────────────────────
async function runDjOrchestrator(stages, selectedPlaylistIds, setStages, setDjProgress) {
  setDjProgress({ active:true, stage:0, total:stages.length, done:false, error:null });
  let pool = [];
  if (selectedPlaylistIds?.length) {
    for (const pid of selectedPlaylistIds) {
      try { const res = await apiGetPlaylistTracks(pid); if (Array.isArray(res)) pool.push(...res); } catch(_) {}
    }
  }
  pool = await enrichTracksWithBpm(pool);
  const BPM_MAP = {
    warmup:{bpmMin:80,bpmMax:110}, circuit:{bpmMin:110,bpmMax:130},
    strength:{bpmMin:110,bpmMax:130}, cardio:{bpmMin:120,bpmMax:150},
    recovery:{bpmMin:80,bpmMax:100}, stretch:{bpmMin:60,bpmMax:90},
    cooldown:{bpmMin:80,bpmMax:100}, hiit:{bpmMin:120,bpmMax:145},
    boxing:{bpmMin:115,bpmMax:140}, crossfit:{bpmMin:120,bpmMax:145}
  };
  pool = pool.map(t => ({
    id:t.id, name:t.name, uri:t.uri,
    artist:t.artists?.[0]?.name||"", album:t.album?.name||"",
    img:t.album?.images?.[0]?.url||null,
    dur:Math.round((t.duration_ms||210000)/1000),
    bpm:t.bpm||0, camelot:t.camelot||""
  }));
  const usedIds = new Set();
  const newStages = [...stages];
  let prevCamelot = "";
  for (let si = 0; si < stages.length; si++) {
    setDjProgress(p => ({ ...p, stage:si }));
    const stage = stages[si];
    const cfg = BPM_MAP[stage.type] || { bpmMin:100, bpmMax:130 };
    let scored = pool.filter(t=>!usedIds.has(t.id))
      .map(t=>({ ...t, _score:scoreTrackForStage(t, cfg.bpmMin, cfg.bpmMax, prevCamelot) }));
    if (scored.length < 3) {
      try {
        const recs = await apiGetRecommendations({ seedGenres:["workout"], minTempo:cfg.bpmMin, maxTempo:cfg.bpmMax, limit:20 });
        const enriched = await enrichTracksWithBpm(recs);
        enriched.filter(t=>!pool.find(p=>p.id===t.id)).forEach(t => pool.push({
          id:t.id, name:t.name, uri:t.uri, artist:t.artists?.[0]?.name||"",
          album:t.album?.name||"", img:t.album?.images?.[0]?.url||null,
          dur:Math.round((t.duration_ms||210000)/1000), bpm:t.bpm||0, camelot:""
        }));
        scored = pool.filter(t=>!usedIds.has(t.id))
          .map(t=>({ ...t, _score:scoreTrackForStage(t, cfg.bpmMin, cfg.bpmMax, prevCamelot) }));
      } catch(_) {}
    }
    const picked = selectTracksForDuration(scored, stage.dur, stage.type);
    picked.forEach(t=>usedIds.add(t.id));
    if (picked.length) prevCamelot = picked[picked.length-1].camelot || prevCamelot;
    newStages[si] = { ...stage, tracks:picked };
  }
  setStages(newStages);
  setDjProgress({ active:false, stage:stages.length, total:stages.length, done:true, error:null });
  setTimeout(() => setDjProgress(null), 3000);
}

export { runDjOrchestrator };
