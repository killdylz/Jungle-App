// Room TV "Plan" mode — the pre-class overview board.
import { useEffect } from "react";
import { Music } from "lucide-react";
import { FLAGS } from "../../config/flags.js";
import { SCFG } from "../../data/stageConfig.js";
import { BrandLogo, useWindowWidth } from "../../ui/primitives.jsx";
import { tvFont, grpColor } from "./displayKit.js";
import { hueInk } from "../../lib/colors.js";

// ─── OverviewDisplayScreen (pre-class TV overview) ────────────────────────────
export function OverviewDisplayScreen({ stages, sessionName, onBack, liveState }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const totalDur    = stages.reduce((a,s)=>a+s.dur,0);
  const totalTracks = stages.reduce((a,s)=>a+(s.tracks||[]).length, 0);
  const totalExs    = stages.reduce((a,s)=>a+(s.exercises||[]).length, 0);
  // Live current-stage highlight (P1 "now over next"): only when a class is actually
  // running — a static Builder "Preview on TV" must not falsely light up stage 0.
  const curIdx = liveState?.playing ? liveState.idx : -1;
  const isLive = curIdx >= 0;

  useEffect(() => {
    const onKey = e => { if (e.key==="Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtDur = s => {
    const m = Math.floor(s/60), sec = s%60;
    return sec ? `${m}m ${sec}s` : `${m}m`;
  };

  // Find "peak" stage (highest BPM range or most exercises)
  const peakIdx = stages.reduce((best,s,i) => {
    const cfg = SCFG[s.type]||SCFG.circuit;
    const score = (cfg.bpmMax||0) + (s.exercises||[]).length;
    const bestCfg = SCFG[stages[best]?.type]||SCFG.circuit;
    const bestScore = (bestCfg.bpmMax||0) + (stages[best]?.exercises||[]).length;
    return score > bestScore ? i : best;
  }, 0);

  const cols = isMobile ? 1 : isTablet ? Math.min(stages.length, 2) : Math.min(stages.length, 4);

  // The surround and the bezel are the gym's, not a hardcoded near-black. This is
  // the board a member sees FIRST, walking in before class, so it is the surface
  // the white-label premium is actually sold on — and it used to be the one screen
  // in the room that ignored the brand entirely. Every generated skin is dark, so
  // in practice these stay projector-dark; a hand-built light palette now goes
  // light because the gym chose to, which is the point.
  return (
    <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:500,display:"flex",flexDirection:"column",overflow:"auto",padding:isMobile?"0":"24px"}}>

      {/* TV bezel frame. `--card` rather than `--bg` so the framed-screen device
          survives in both polarities without a literal colour. */}
      <div style={{
        flex:1,background:"var(--card)",borderRadius:isMobile?"0":"16px",
        padding:isMobile?"0":"14px",
        boxShadow:isMobile?"none":"0 30px 80px rgba(0,0,0,.6)",
        display:"flex",flexDirection:"column",overflow:"hidden",
        minHeight:isMobile?"100vh":"auto"
      }}>

        {/* Inner screen */}
        <div style={{flex:1,background:`radial-gradient(120% 90% at 50% 0%,rgba(123,227,164,.06),transparent),var(--bg)`,borderRadius:isMobile?"0":"10px",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Header row */}
          <div style={{
            flexShrink:0,padding:isMobile?"16px":"22px 26px",
            borderBottom:`1px solid var(--border)`,
            display:"flex",alignItems:isMobile?"flex-start":"center",
            justifyContent:"space-between",flexDirection:isMobile?"column":"row",gap:"12px"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <button onClick={onBack} style={{
                display:"flex",alignItems:"center",gap:"6px",padding:"7px 13px",
                background:"transparent",border:`1px solid var(--border)`,borderRadius:"8px",
                cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",flexShrink:0
              }}>← {!isMobile && <span style={{opacity:0.5,fontSize:"10px"}}>Esc</span>}</button>
              {/* The mark the other two boards already carried. Floor uses the
                  same call, so a member switching modes sees one identity rather
                  than three. Safe here only because the background above is now a
                  brand token: BrandLogo draws the name in `--text`, which on a
                  light brand is dark ink and was invisible on the old near-black. */}
              <BrandLogo size={24} showName/>
              <div>
                <p style={{fontSize:tvFont(26),fontWeight:"700",color:"var(--text)",lineHeight:1,marginBottom:"4px",fontFamily:"var(--display)"}}>
                  {sessionName||"Class Plan Overview"}
                </p>
                {/* "0 tracks" was printed here on the room's TV before a class,
                    in front of members, every time (audit 2.1 / UI-UX §1). */}
                <p style={{fontSize:"12px",color:"var(--muted)"}}>
                  {stages.length} stages · {fmtDur(totalDur)}{FLAGS.music ? ` · ${totalTracks} tracks` : ""} · {totalExs} exercises
                  {isLive && <span style={{color:"var(--accent)",fontWeight:"800"}}> · ● Stage {curIdx+1}/{stages.length}</span>}
                </p>
              </div>
            </div>

            {/* Per-stage chips. The dot's colour carried WHICH stage each chip
                was and only the duration was written, so on a member-facing
                surface the run of the class was unreadable to anyone who does
                not separate those hues — and SCFG's palette does not even
                separate them for everyone else: warmup/power, core/stretch and
                engine/recovery are each a single colour shared by two types.
                The stage's own name is now the carrier and the colour is the
                reinforcement, which is the §3 rule. */}
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {stages.map((s,si)=>{
                const cfg = SCFG[s.type]||SCFG.circuit;
                const chipCur = si===curIdx;
                return (
                  <div key={s.id} style={{
                    display:"flex",alignItems:"center",gap:"5px",
                    padding:"5px 10px",
                    background:chipCur?"var(--accent)":`${cfg.color}18`,
                    borderRadius:"999px",
                    border:`1px solid ${chipCur?"var(--accent)":cfg.color+"40"}`,
                    minWidth:0,
                  }}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:chipCur?"var(--on-accent)":cfg.color,flexShrink:0}}/>
                    <span style={{fontSize:"11px",fontWeight:"700",color:chipCur?"var(--on-accent)":cfg.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {s.name || cfg.label} · {fmtDur(s.dur)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage cards grid */}
          <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"22px 26px"}}>
            <div style={{
              display:"grid",
              gridTemplateColumns:`repeat(${cols},1fr)`,
              gap:isMobile?"12px":"16px"
            }}>
              {stages.map((s,si)=>{
                const cfg     = SCFG[s.type]||SCFG.circuit;
                const exList  = s.exercises||[];
                const trList  = s.tracks||[];
                const grpList = s.groups||[];
                const isCur   = si===curIdx;                            // running now
                const isPast  = isLive && si<curIdx;                    // already done
                const isPeak  = si===peakIdx && stages.length>1 && !isLive; // planning cue only when idle
                const firstTrack = trList[0];

                return (
                  <div key={s.id} style={{
                    borderRadius:"14px",overflow:"hidden",display:"flex",flexDirection:"column",
                    opacity:isPast?0.4:1,
                    transition:"opacity .3s ease, box-shadow .3s ease",
                    border:isCur?`3px solid var(--accent)`:isPeak?`2px solid ${cfg.color}`:`2px solid ${cfg.color}40`,
                    background:isCur?`linear-gradient(160deg,color-mix(in srgb,var(--accent) 12%,var(--card)),var(--card))`:isPeak?`linear-gradient(160deg,var(--navy),var(--card))`:`var(--card)`,
                    boxShadow:isCur?`0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent),0 10px 40px color-mix(in srgb,var(--accent) 25%,transparent)`:isPeak?`0 0 0 3px ${cfg.color}18`:"none"
                  }}>

                    {/* Colored header band */}
                    <div style={{background:isCur?`color-mix(in srgb,var(--accent) 22%,transparent)`:`${cfg.color}${isPeak?"28":"18"}`,padding:"14px 18px"}}>
                      {/* Stage label */}
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"8px"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
                        <span style={{fontSize:"10px",fontWeight:"800",color:hueInk(cfg.color),
                          textTransform:"uppercase",letterSpacing:"1px"}}>
                          {cfg.label}{isPeak?" · PEAK":""}
                        </span>
                        {isCur && <span style={{marginLeft:"auto",fontSize:"11px",fontWeight:"900",letterSpacing:"1px",color:"var(--on-accent)",background:"var(--accent)",padding:"2px 9px",borderRadius:"999px"}}>NOW</span>}
                      </div>
                      {/* Stage name */}
                      <p style={{fontSize:tvFont(16),fontWeight:"800",color:"var(--text)",lineHeight:1.2,marginBottom:"6px",fontFamily:"var(--display)"}}>{s.name}</p>
                      {/* Duration + BPM. The BPM range is a music-matching target;
                          with no music to match it is noise on a member-facing
                          card. TempoGuide is the survivor of the BPM UI — it needs
                          no licence and earns its place on the live display. */}
                      <p style={{fontSize:"12px",color:"var(--muted)",fontWeight:"600"}}>
                        {fmtDur(s.dur)}{FLAGS.music && cfg.bpmMin ? ` · ${cfg.bpmMin}–${cfg.bpmMax} BPM` : ""}
                      </p>
                    </div>

                    {/* Body */}
                    <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column",gap:"7px"}}>
                      {exList.length===0 && trList.length===0 && grpList.length===0 && (
                        <p style={{fontSize:"11px",color:"var(--muted)",fontStyle:"italic"}}>No content added yet</p>
                      )}

                      {/* Exercises */}
                      {exList.map((ex,ei)=>(
                        <div key={ei} style={{
                          paddingLeft:"10px",borderLeft:`3px solid ${cfg.color}`,
                          marginBottom:"4px"
                        }}>
                          <p style={{fontSize:tvFont(13),fontWeight:"700",color:"var(--text)",lineHeight:1.2,marginBottom:"2px"}}>{ex.n}</p>
                          <p style={{fontSize:"11px",color:"var(--muted)"}}>
                            {[ex.s&&`${ex.s}×`,ex.r,ex.rest&&`· ${ex.rest} rest`].filter(Boolean).join(" ")||"—"}
                          </p>
                        </div>
                      ))}

                      {/* Groups */}
                      {grpList.map((g,gi)=>(
                        <div key={g.id} style={{display:"flex",alignItems:"center",gap:"7px"}}>
                          <div style={{width:"8px",height:"8px",borderRadius:"50%",flexShrink:0,background:grpColor(g.id)}}/>
                          <p style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</p>
                        </div>
                      ))}
                    </div>

                    {/* Music footer. This is a MEMBER-FACING surface: with music
                        off it used to print "No tracks" on every stage card,
                        advertising an internal absence five times to the room
                        (UI-UX §1). Nothing is better than an apology. */}
                    {FLAGS.music && <div style={{
                      flexShrink:0,padding:"10px 18px",
                      borderTop:`1px solid ${cfg.color}25`,
                      display:"flex",alignItems:"center",gap:"8px"
                    }}>
                      <Music size={12} color={cfg.color} style={{flexShrink:0}}/>
                      {firstTrack ? (
                        <p style={{fontSize:"11px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          <span style={{color:"var(--text)",fontWeight:"600"}}>{firstTrack.t}</span>
                          {firstTrack.a && <span> — {firstTrack.a}</span>}
                          {trList.length>1 && <span style={{color:hueInk(cfg.color)}}> +{trList.length-1}</span>}
                        </p>
                      ) : (
                        <p style={{fontSize:"11px",color:"var(--muted)",fontStyle:"italic"}}>No tracks</p>
                      )}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
