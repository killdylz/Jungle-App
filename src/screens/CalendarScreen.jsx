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
import { useWindowWidth } from "../ui/primitives.jsx";

export function CalendarScreen({onBack}) {
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

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];
  const SLOTS = ["06:00","09:00","12:00","18:00","19:30"];
  // UNREFERENCED — the grid labels slots by time, not by name. Left in place
  // because this extraction is mechanical; delete it in a cleanup pass.
  const SLOT_LABELS = ["Morning","Mid-Morning","Lunch","Evening","Late"];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay() + 1);
  const weekKey = `${startOfWeek.getFullYear()}-${startOfWeek.getMonth()}-${startOfWeek.getDate()}`;

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

  const fillColor = f => f >= 90 ? "var(--accent)" : f >= 70 ? "#E0B85B" : "#8AA294";

  const visibleDays = isMobile ? DAYS.slice(0,4) : DAYS;

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"12px":"24px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"18px",flexWrap:"wrap",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"16px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Planning & schedule</h2>
            {/* Was "Shoreditch · 3 studios" — a hardcoded London district on a
                Singapore product (audit 1.3). The only honest facts here are the
                gym's own name and how many classes are actually on the week. */}
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"1px"}}>
              {[store.getGymBranding()?.gymName, `${Object.keys(schedule).length} classes`].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          {/* Week nav */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",border:`1px solid var(--border)`,borderRadius:"9px",overflow:"hidden"}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",padding:"0 4px"}}>
              {weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":`Week ${weekOffset>0?"+":""}${weekOffset}`}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>›</button>
          </div>
          {/* "Demand heat", "Publish week" and "Auto-fill week" were dead buttons —
              rendered, clickable, backed by nothing (audit 1.3). They return when
              there is real demand data and a class_instances table to publish to. */}
          <button onClick={()=>setShowAddClass(true)} style={{padding:"8px 14px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",color:"var(--on-accent)",fontSize:"12px",fontWeight:"700"}}>
            + Add class
          </button>
        </div>
      </div>

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

      {/* Schedule grid */}
      <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",overflow:"hidden",marginBottom:"16px"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid var(--border)`}}>
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
          <div key={slot} style={{display:"grid",gridTemplateColumns:`80px repeat(${visibleDays.length},1fr)`,borderBottom:`1px solid var(--border)`,minHeight:"80px"}}>
            <div style={{padding:"10px 12px",background:"color-mix(in srgb, var(--navy) 40%, transparent)",display:"flex",flexDirection:"column",justifyContent:"center",borderRight:`1px solid var(--border)`}}>
              <div style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>{slot}</div>
            </div>
            {visibleDays.map(day=>{
              const key = `${day}-${slot}`;
              const cls = effSchedule[key];
              const sug = suggested.find(s=>s.day===day && s.slot===slot);
              return (
                <div key={day} style={{padding:"6px",borderLeft:`1px solid var(--border)`,position:"relative"}}>
                  {cls && (
                    <div style={{
                      padding:"7px 8px",
                      background:`${CAT_COLOR[cls.type]||"var(--accent)"}18`,
                      border:`1px solid ${CAT_COLOR[cls.type]||"var(--accent)"}40`,
                      borderRadius:"8px",
                      cursor:"pointer",
                      height:"calc(100% - 2px)",
                      boxSizing:"border-box",
                    }}>
                      <div style={{fontSize:isMobile?"9px":"11px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls.name}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{cls.coach} · {cls.dur}</div>
                      <div style={{marginTop:"4px",display:"flex",alignItems:"center",gap:"4px"}}>
                        <div style={{flex:1,height:"3px",background:"var(--navy)",borderRadius:"2px"}}>
                          <div style={{width:`${cls.fill}%`,height:"100%",background:fillColor(cls.fill),borderRadius:"2px"}}/>
                        </div>
                        <span style={{fontSize:"9px",color:fillColor(cls.fill),fontWeight:"700"}}>{cls.fill}%</span>
                      </div>
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
