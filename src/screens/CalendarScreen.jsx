// ─── Planning & schedule (AUDIT-FINDINGS §3.1, decomposition stage 2) ────────
// A leaf screen: one prop (`onBack`), and everything else it needs it imports.
//
// All of its constants (DAYS, SLOTS, CAT_COLOR) are LOCAL to the component and
// came with it — nothing else in the app referenced them, which is what made
// this a leaf despite its size.
//
// The mock analytics below (suggested slots, trainer load, "AI tips") are gated
// behind `FLAGS.mockAnalytics`, which is false: they evaluate to empty arrays
// and render nothing. They are fabricated numbers about a gym's staff and
// demand, so the flag is the only thing that makes them acceptable to keep.
//
// Lifted from App.jsx unchanged.

import React from "react";
// Both icons matter equally and neither is visible to `lint:crash` — it cannot
// resolve JSX element names, only plain identifiers. See RosterScreen.jsx.
import { ArrowLeft, X } from "lucide-react";
import { FLAGS } from "../config/flags.js";
import * as store from "../lib/store.js";
import { occurrencesForWeek, diffOccurrences, describePublish, isStartable,
         startOfWeek as mondayOf, weekKeyOf } from "../lib/scheduleInstances.js";
import { useWindowWidth } from "../ui/primitives.jsx";

export function CalendarScreen({onBack, onStartClass}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [viewMode, setViewMode] = React.useState("grid"); // "grid" | "heat"
  const [dismissedTips, setDismissedTips] = React.useState([]);
  // F5: user-created recurring classes
  const [userClasses, setUserClasses] = React.useState(() => store.getUserClasses());
  // Local-first: pull the gym's classes from Postgres once on mount (server
  // wins / seeds from local). store.connect() already ran at the App root.
  React.useEffect(() => {
    let alive = true;
    store.hydrateUserClasses().then(rows => { if (alive && rows) setUserClasses(rows); });
    return () => { alive = false; };
  }, []);
  // Persist on change (local write + background push). Skip the initial mount so
  // we never push stale/empty local over server data before hydrate reconciles.
  const _ucInit = React.useRef(false);
  React.useEffect(() => {
    if (!_ucInit.current) { _ucInit.current = true; return; }
    store.saveUserClasses(userClasses);
  }, [userClasses]);
  const [showAddClass, setShowAddClass] = React.useState(false);
  const [addForm, setAddForm] = React.useState({name:"",type:"HIIT",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});

  // Seven days. This list was Mon–Sat, and because the "Add class" day picker is
  // built from it too, the product was self-consistently unable to schedule a
  // Sunday class — invisible rather than broken. Confirmed with Dylan in session
  // 11 as unintended: a gym that runs Sunday classes could not use the Schedule
  // at all. Kept in the same order as `RULE_DAYS`, which is what dates an
  // occurrence, so the two can never disagree about which column Sunday is.
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const SLOTS = ["06:00","09:00","12:00","18:00","19:30"];
  // UNREFERENCED — the grid labels slots by time, not by name. Left in place
  // because this extraction is mechanical; delete it in a cleanup pass.
  const SLOT_LABELS = ["Morning","Mid-Morning","Lunch","Evening","Late"];

  // ⚠ This was `startOfWeek.setDate(base.getDate() - base.getDay() + 1)`, which is
  // right six days a week and wrong on the seventh. `getDay()` makes Sunday 0, so
  // on a Sunday it resolved to base + 1 — TOMORROW — and the Schedule showed next
  // week: today's own row was not on the grid at all, "This week" named the wrong
  // week, and a Sunday class could not be seen or started on the one day it runs.
  // Found by opening the screen on a Sunday, which is the only way it shows.
  //
  // Now the shared `startOfWeek`/`weekKeyOf` from scheduleInstances.js — the same
  // pair `occurrencesForWeek` normalises with, so the week the grid DRAWS and the
  // week it PUBLISHES can no longer disagree. `weekKeyOf` reproduces this screen's
  // original unpadded `${year}-${monthIndex}-${date}` format exactly, so one-off
  // rules already saved still match.
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const startOfWeek = mondayOf(baseDate);
  const weekKey = weekKeyOf(startOfWeek);

  const dayDates = DAYS.map((d,i)=>{
    const dt = new Date(startOfWeek);
    dt.setDate(startOfWeek.getDate() + i);
    return dt.getDate();
  });

  const CAT_COLOR = {HIIT:"#F59E0B",Strength:"#8B5CF6",Hyrox:"#22D3A6",Circuit:"#F97316",Spin:"#3B82F6",Yoga:"#10B981",Boxing:"#EC4899",Mobility:"#5BD0C0"};

  // Only the gym's own classes appear — the mock base schedule is gone (audit 2.2).
  const schedule = {};

  // F5: merge user classes (with recurrence) onto the base schedule for the viewed week
  const effSchedule = { ...schedule };
  userClasses.forEach(uc => {
    const entry = { name:uc.name, coach:uc.coach||"", fill:uc.fill||0, type:uc.type, dur:uc.dur||"45m", custom:true, repeat:uc.repeat };
    if (uc.repeat === "daily") { DAYS.forEach(d => { effSchedule[`${d}-${uc.slot}`] = entry; }); }
    else if (uc.repeat === "weekly") { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
    else if (uc.weekKey === weekKey) { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
  });
  const addClass = () => {
    if (!addForm.name.trim()) return;
    const uc = { id:`uc${Date.now()}`, ...addForm };
    if (addForm.repeat === "once") uc.weekKey = weekKey;
    setUserClasses(list => [...list, uc]);
    setShowAddClass(false);
    setAddForm({name:"",type:"HIIT",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});
  };
  // ── B4: publish this week ─────────────────────────────────────────────────
  // The grid holds RULES ("Tuesday 6pm, weekly"). Attendance hangs off dated
  // OCCURRENCES, and until now nothing turned one into the other — the Runner
  // minted an occurrence ad hoc when a coach pressed play, which works for the
  // class in front of you and leaves the schedule as a drawing.
  //
  // "Publish week" was deleted in the 2.2 audit as a dead button; `class_instances`
  // (0007) is what it was waiting for. It is idempotent, so the honest thing to
  // show is what it actually did, including "nothing, this week is already done".
  const [instances, setInstances] = React.useState(() => store.getClassInstances());
  const [published, setPublished] = React.useState("");
  React.useEffect(() => { setPublished(""); }, [weekOffset]);

  const weekOccurrences = occurrencesForWeek(userClasses, startOfWeek, { days: DAYS });
  const pending = diffOccurrences(weekOccurrences, instances);
  const publishWeek = () => {
    const r = store.publishOccurrences(weekOccurrences);
    setInstances(r.instances);
    setPublished(describePublish(r));
  };

  // ── §3A: start a class FROM the schedule ──────────────────────────────────
  // The occurrence behind each grid cell, keyed on exactly what the cell shows —
  // day, slot AND name. Keying on day+slot alone would be enough almost always,
  // but two rules can land on one cell (the grid shows the last one) and the
  // occurrence list is sorted by time-then-name, so the two could pick different
  // classes: the cell would say "Hyrox Sim" and Start would open S360. Matching
  // the name means the button can only ever start the class being pointed at.
  const cellKey = (day, slot, name) => `${day}-${slot}-${String(name||"").trim().toLowerCase()}`;
  const occByCell = {};
  weekOccurrences.forEach(o => { occByCell[cellKey(o.day, o.slot, o.name)] = o; });
  // One clock read for the whole render, so two cells cannot straddle the window
  // boundary and disagree about what time it is.
  const nowMs = Date.now();

  const suggested = FLAGS.mockAnalytics ? [
    {day:"Tue",slot:"18:00",name:"Strength Lab",reason:"high demand · +34% this slot"},
    {day:"Thu",slot:"09:00",name:"Mobility",    reason:"try 12:00 — lunchtime demand"},
  ] : [];

  const trainers = FLAGS.mockAnalytics ? [
    {name:"Mara K.",  classes:14, cap:16, color:"#F59E0B"},
    {name:"Dev R.",   classes:11, cap:14, color:"#22D3A6"},
    {name:"Priya S.", classes:8,  cap:12, color:"#8B5CF6"},
    {name:"Jo M.",    classes:5,  cap:10, color:"#3B82F6"},
  ] : [];

  const aiTips = FLAGS.mockAnalytics ? [
    {id:0, text:"Tue 18:00 demand is up 34% — add a second Strength Lab. Likely 90%+ fill.", action:"Add it"},
    {id:1, text:"Thu 09:00 Mobility under-fills. Try moving to 12:00 — matches lunchtime demand.", action:"Move it"},
    {id:2, text:"Mara is near weekly cap (14/16). Shift Fri Burn to Jo to balance load.", action:"Reassign"},
  ] : [];

  // `fillColor` went with the fill bar it coloured — see the grid cell below.
  // It thresholded a number nothing ever set, so it only ever returned grey.

  // Every day is always rendered. This used to be `DAYS.slice(0,4)` on a phone,
  // which silently hid Fri and Sat — the same failure as the missing Sunday, in
  // miniature, and worse on a seven-day week. A phone scrolls the grid sideways
  // instead: a column you can reach beats a column that does not exist.
  const visibleDays = DAYS;
  const dayCol = isMobile ? "minmax(64px,1fr)" : "1fr";
  const gridCols = `${isMobile?"56px":"80px"} repeat(${visibleDays.length},${dayCol})`;

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"12px":"24px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"18px",flexWrap:"wrap",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Planning & schedule</h2>
            {/* Was "Shoreditch · 3 studios" — a hardcoded London district on a
                Singapore product (audit 1.3). The only honest facts here are the
                gym's own name and how many classes are actually on the week. */}
            {/* Counted from the week actually being viewed, not from `schedule`
                — which is the deleted mock base and is permanently `{}`, so this
                line has always read "0 classes" no matter what the gym runs. */}
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"1px"}}>
              {[store.getGymBranding()?.gymName,
                `${weekOccurrences.length} class${weekOccurrences.length===1?"":"es"} this week`,
                pending.already.length ? `${pending.already.length} on the books` : "",
               ].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          {/* Week nav */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",border:`1px solid var(--border)`,borderRadius:"9px",overflow:"hidden"}}>
            {/* A guillemet is text, so these passed the "no unnamed buttons"
                sweep while announcing as "‹" and "›". The label says which way
                time moves, because "previous" and "next" are the whole meaning
                of the control and the glyph carries none of it. */}
            <button onClick={()=>setWeekOffset(w=>w-1)} aria-label="Previous week" style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",padding:"0 4px"}}>
              {weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":`Week ${weekOffset>0?"+":""}${weekOffset}`}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} aria-label="Next week" style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>›</button>
          </div>
          {/* "Demand heat" and "Auto-fill week" are still absent — they were dead
              buttons backed by nothing (audit 1.3) and there is still no real
              demand data. "Publish week" is back, because the thing it was
              waiting for now exists: class_instances (0007). Disabled with a
              reason rather than hidden, so the schedule explains itself. */}
          <button onClick={publishWeek} disabled={!pending.create.length} data-testid="publish-week"
            title={weekOccurrences.length === 0
              ? "Add a class to this week first"
              : pending.create.length === 0
                ? "Every class on this week is already on the books"
                : `Put ${pending.create.length} class${pending.create.length===1?"":"es"} on the books, ready to check people into`}
            style={{padding:"8px 14px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"8px",
                    cursor:pending.create.length?"pointer":"not-allowed",color:pending.create.length?"var(--text)":"var(--muted)",
                    fontSize:"12px",fontWeight:"700",opacity:pending.create.length?1:0.55}}>
            Publish week{pending.create.length ? ` · ${pending.create.length}` : ""}
          </button>
          <button onClick={()=>setShowAddClass(true)} style={{padding:"8px 14px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",color:"var(--on-accent)",fontSize:"12px",fontWeight:"700"}}>
            + Add class
          </button>
        </div>
      </div>

      {/* What publishing actually did. Says "nothing left to do" as readily as
          it says "added 6" — pressing the button again is the common case. */}
      {published && (
        <div data-testid="publish-result" style={{marginBottom:"14px",padding:"10px 13px",borderRadius:"9px",
             border:"1px solid var(--border)",background:"var(--card)",fontSize:"12px",color:"var(--text)",lineHeight:1.6}}>
          {published}
        </div>
      )}

      {/* F5: Add class modal */}
      {showAddClass && (
        <div onClick={()=>setShowAddClass(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"22px",width:"min(420px,100%)",boxSizing:"border-box"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)"}}>Add class</div>
              <button onClick={()=>setShowAddClass(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><X size={18}/></button>
            </div>
            <input autoFocus value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="Class name" style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",marginBottom:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"14px"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
              <select value={addForm.type} onChange={e=>setAddForm(f=>({...f,type:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{Object.keys(CAT_COLOR).map(t=><option key={t} value={t}>{t}</option>)}</select>
              <input value={addForm.coach} onChange={e=>setAddForm(f=>({...f,coach:e.target.value}))} placeholder="Coach" style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
              <select value={addForm.day} onChange={e=>setAddForm(f=>({...f,day:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
              <select value={addForm.slot} onChange={e=>setAddForm(f=>({...f,slot:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{SLOTS.map(sl=><option key={sl} value={sl}>{sl}</option>)}</select>
            </div>
            <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Repeat</div>
            <div style={{display:"flex",gap:"6px",marginBottom:"18px"}}>
              {store.SCHEDULE_REPEATS.map(val=>[val,{once:"This week",weekly:"Weekly",daily:"Every day"}[val]]).map(([val,lbl])=>(
                <button key={val} onClick={()=>setAddForm(f=>({...f,repeat:val}))} style={{flex:1,padding:"9px 0",background:addForm.repeat===val?"var(--accent)":"transparent",color:addForm.repeat===val?"var(--on-accent)":"var(--muted)",border:`1px solid ${addForm.repeat===val?"var(--accent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>{lbl}</button>
              ))}
            </div>
            <button onClick={addClass} disabled={!addForm.name.trim()} style={{width:"100%",padding:"12px",background:addForm.name.trim()?"var(--accent)":"var(--border)",color:addForm.name.trim()?"var(--on-accent)":"var(--muted)",border:"none",borderRadius:"9px",cursor:addForm.name.trim()?"pointer":"not-allowed",fontSize:"14px",fontWeight:"700"}}>Add to schedule</button>
          </div>
        </div>
      )}

      {/* Schedule grid. `overflowX:auto` is what lets a phone reach all seven
          days; both inner grids share `gridCols`, so they scroll as one piece and
          the date headers stay over their own columns. */}
      <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",overflowX:"auto",overflowY:"hidden",marginBottom:"16px"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:gridCols,borderBottom:`1px solid var(--border)`}}>
          <div style={{padding:"10px 12px",background:"var(--navy)"}}/>
          {visibleDays.map((d,i)=>(
            <div key={d} style={{padding:"10px 8px",background:"var(--navy)",borderLeft:`1px solid var(--border)`,textAlign:"center"}}>
              <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</div>
              <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--text)"}}>{dayDates[i]}</div>
            </div>
          ))}
        </div>

        {/* Time slot rows */}
        {SLOTS.map(slot=>(
          <div key={slot} style={{display:"grid",gridTemplateColumns:gridCols,borderBottom:`1px solid var(--border)`,minHeight:"80px"}}>
            <div style={{padding:isMobile?"10px 6px":"10px 12px",background:"color-mix(in srgb, var(--navy) 40%, transparent)",display:"flex",flexDirection:"column",justifyContent:"center",borderRight:`1px solid var(--border)`}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>{slot}</div>
            </div>
            {visibleDays.map(day=>{
              const key = `${day}-${slot}`;
              const cls = effSchedule[key];
              const sug = suggested.find(s=>s.day===day && s.slot===slot);
              // The dated occurrence behind this cell, and whether it is close
              // enough to now to run. At most one or two cells on a whole week
              // qualify, which is the point: the grid grows a Start button only
              // on the class that is actually about to happen.
              const occ = cls ? occByCell[cellKey(day, slot, cls.name)] : null;
              const startable = !!(occ && onStartClass && isStartable(occ, nowMs));
              return (
                <div key={day} style={{padding:"6px",borderLeft:`1px solid var(--border)`,position:"relative"}}>
                  {cls && (
                    <div style={{
                      padding:"7px 8px",
                      background:`${CAT_COLOR[cls.type]||"var(--accent)"}18`,
                      border:`1px solid ${CAT_COLOR[cls.type]||"var(--accent)"}40`,
                      borderRadius:"8px",
                      cursor:"pointer",
                      // minHeight, not height: the cell still fills its row, but a
                      // Start button can make it taller instead of overflowing.
                      minHeight:"calc(100% - 2px)",
                      boxSizing:"border-box",
                    }}>
                      <div style={{fontSize:isMobile?"9px":"11px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls.name}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{[cls.coach, cls.dur].filter(Boolean).join(" · ")}</div>
                      {/* The fill bar and its "%" are gone. Nothing in the
                          product ever SETS `fill` — no capacity field, no
                          booking integration — so every cell on every gym's
                          week rendered an empty bar reading "0%", which says
                          "nobody came" rather than "we don't know". Same
                          judgement that removed BASE_SCHEDULE (audit 2.2): a
                          confident wrong number is worse than no number. The
                          class TYPE takes the space, which also gives the cell
                          a non-colour cue for what the border hue means. */}
                      {cls.type && <div style={{fontSize:"9px",color:"var(--muted)",fontWeight:"700",marginTop:"3px",textTransform:"uppercase",letterSpacing:"0.4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls.type}</div>}
                      {/* §3A. Pressing this is what makes the Runner's check-ins
                          land on the occurrence the Schedule published, instead
                          of on a second row nobody looks at: the occurrence is
                          CHOSEN here rather than guessed later from a name.
                          `aria-label` and not `title` — a title does not override
                          a button's text content for its accessible name, so
                          every one of these would otherwise just be "Start". */}
                      {startable && (
                        <button data-testid="start-class"
                          aria-label={`Start ${cls.name} at ${slot}`}
                          onClick={()=>onStartClass(occ)}
                          style={{marginTop:"5px",width:"100%",padding:"5px 0",background:"var(--accent)",color:"var(--on-accent)",
                                  border:"none",borderRadius:"6px",cursor:"pointer",fontSize:"10px",fontWeight:"800",
                                  textTransform:"uppercase",letterSpacing:"0.5px"}}>
                          Start
                        </button>
                      )}
                    </div>
                  )}
                  {!cls && sug && (
                    <div style={{
                      padding:"7px 8px",
                      background:"rgba(123,227,164,.06)",
                      border:`1px dashed color-mix(in srgb, var(--accent) 38%, transparent)`,
                      borderRadius:"8px",
                      cursor:"pointer",
                    }}>
                      <div style={{fontSize:"9px",fontWeight:"700",color:"var(--accent)",letterSpacing:"0.5px",textTransform:"uppercase"}}>SUGGESTED</div>
                      <div style={{fontSize:isMobile?"9px":"10px",fontWeight:"600",color:"var(--text)",marginTop:"1px"}}>{sug.name}</div>
                    </div>
                  )}
                  {!cls && !sug && (
                    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="0"}>
                      <span style={{fontSize:"18px",color:"var(--muted)"}}>+</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom: AI tips + Trainer load */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.4fr 1fr",gap:"14px"}}>
        {/* Jungle Intelligence */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
            <div style={{width:"28px",height:"28px",borderRadius:"8px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={"var(--accent)"} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Jungle Intelligence</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {aiTips.filter(t=>!dismissedTips.includes(t.id)).map((tip,i)=>(
              <div key={tip.id} style={{padding:"12px 14px",background:"var(--navy)",border:`1px solid color-mix(in srgb, var(--accent) 19%, transparent)`,borderRadius:"10px",position:"relative"}}>
                <div style={{fontSize:"12px",color:"var(--text)",lineHeight:"1.5",paddingRight:"20px"}}>{tip.text}</div>
                <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
                  <button style={{padding:"5px 12px",background:"var(--accent)",border:"none",borderRadius:"6px",cursor:"pointer",color:"var(--on-accent)",fontSize:"11px",fontWeight:"700"}}>{tip.action}</button>
                  <button onClick={()=>setDismissedTips(d=>[...d,tip.id])} style={{padding:"5px 12px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Dismiss</button>
                </div>
              </div>
            ))}
            {aiTips.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--muted)",fontSize:"13px",lineHeight:"1.5"}}>Scheduling suggestions appear here once Jungle has live attendance &amp; demand data.</div>
            ) : dismissedTips.length===aiTips.length && (
              <div style={{textAlign:"center",padding:"24px",color:"var(--muted)",fontSize:"13px"}}>All suggestions reviewed ✓</div>
            )}
          </div>
        </div>

        {/* Trainer load */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Trainer load · this week</div>
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {trainers.map((t,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
                  <span style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{t.name}</span>
                  <span style={{fontSize:"12px",color:t.classes/t.cap>0.85?"#F59E0B":"var(--muted)",fontWeight:"600"}}>{t.classes} classes{t.classes/t.cap>0.85?" ⚠":""}</span>
                </div>
                <div style={{height:"7px",background:"var(--navy)",borderRadius:"4px",overflow:"hidden"}}>
                  <div style={{width:`${(t.classes/t.cap)*100}%`,height:"100%",background:t.classes/t.cap>0.85?"#F59E0B":t.color,borderRadius:"4px",transition:"width 0.4s"}}/>
                </div>
                <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{t.classes}/{t.cap} capacity</div>
              </div>
            ))}
            {trainers.length===0 && (
              <div style={{textAlign:"center",padding:"20px 4px",color:"var(--muted)",fontSize:"13px",lineHeight:"1.5"}}>Trainer load balances here once classes are scheduled with assigned coaches.</div>
            )}
          </div>
          {trainers.some(t=>t.classes/t.cap>0.85) && (
            <div style={{marginTop:"14px",padding:"10px 12px",background:"#F59E0B15",border:"1px solid #F59E0B40",borderRadius:"8px",fontSize:"11px",color:"#F59E0B",lineHeight:"1.5"}}>
              ⚠ Mara is near weekly cap. Shift Fri Burn to Jo to balance load.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
