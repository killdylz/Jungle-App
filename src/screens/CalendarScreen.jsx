// ─── Planning & schedule (AUDIT-FINDINGS §3.1, decomposition stage 2) ────────
// A leaf screen: one prop (`onBack`), and everything else it needs it imports.
//
// Its constants (DAYS, SLOTS) are LOCAL to the component and came with it —
// nothing else in the app referenced them, which is what made this a leaf
// despite its size. `CAT_COLOR` was the third; it is gone, because being a leaf
// is not a reason to keep a private copy of the gym's class-type catalogue.
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
import { ArrowLeft, X, Pencil } from "lucide-react";
import { FLAGS } from "../config/flags.js";
import * as store from "../lib/store.js";
import { occurrencesForWeek, diffOccurrences, describePublish, isStartable,
         startOfWeek as mondayOf, weekKeyOf } from "../lib/scheduleInstances.js";
import { useWindowWidth } from "../ui/primitives.jsx";
import { useToast } from "../ui/toast.jsx";
import { useDialog } from "../ui/dialog.js";
import { useAfterMount } from "../ui/useAfterMount.js";
import { getLibrary } from "../lib/libraryAccess.js";
import { resolveClassType } from "../lib/libraryStore.js";

// Its own component only so it can hold a `useDialog` — a hook cannot be called
// from inside the `{showAddClass && …}` that used to render this markup inline.
// Before this, the overlay had no dialog role, and Tab walked out of it into the
// 50 focusable controls of the schedule grid behind it.
// DAYS / SLOTS stay component-local (see the file header) and are passed in,
// rather than hoisted to module scope to suit this extraction. `classTypes`
// comes the same way, but from `getLibrary()` rather than from a constant.
//
// One dialog for both add and edit. The fields are identical — an edit IS the
// add form with the rule's current values in it — so a second component would be
// the same markup twice, and the second copy is where the day dropdown quietly
// stops matching the first.
function AddClassDialog({ onClose, addForm, setAddForm, addClass, days, slots, classTypes, editing }) {
  const title = editing ? "Edit class" : "Add class";
  // 🔴 A rule whose type the catalogue does not have — `Mobility`, which the old
  // hard-coded list offered and no class type answers to — must still be
  // SELECTABLE, or opening this dialog to fix a coach's name would quietly
  // re-type the class to whichever option happens to be first. Hiding a value a
  // user can also edit, without giving them a way to keep it, is the failure
  // session 20's check-in list nearly shipped in the other direction.
  const opts = !addForm.type || classTypes.some(t => t.value === addForm.type)
    ? classTypes
    : [...classTypes, { value: addForm.type, label: addForm.type }];
  const dlg = useDialog(onClose, title);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"22px",width:"min(420px,100%)",boxSizing:"border-box",outline:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <div style={{fontSize:"16px",fontWeight:"800",color:"var(--text)"}}>{title}</div>
          <button onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><X size={18}/></button>
        </div>
        <input autoFocus value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="Class name" style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",marginBottom:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"14px"}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
          <select aria-label="Class type" value={addForm.type} onChange={e=>setAddForm(f=>({...f,type:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{opts.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <input value={addForm.coach} onChange={e=>setAddForm(f=>({...f,coach:e.target.value}))} placeholder="Coach" style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
          <select aria-label="Day" value={addForm.day} onChange={e=>setAddForm(f=>({...f,day:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select>
          <select aria-label="Time slot" value={addForm.slot} onChange={e=>setAddForm(f=>({...f,slot:e.target.value}))} style={{padding:"10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}>{slots.map(sl=><option key={sl} value={sl}>{sl}</option>)}</select>
        </div>
        <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Repeat</div>
        <div style={{display:"flex",gap:"6px",marginBottom:"18px"}}>
          {store.SCHEDULE_REPEATS.map(val=>[val,{once:"This week",weekly:"Weekly",daily:"Every day"}[val]]).map(([val,lbl])=>(
            <button key={val} onClick={()=>setAddForm(f=>({...f,repeat:val}))} style={{flex:1,padding:"9px 0",background:addForm.repeat===val?"var(--accent)":"transparent",color:addForm.repeat===val?"var(--on-accent)":"var(--muted)",border:`1px solid ${addForm.repeat===val?"var(--accent)":"var(--border)"}`,borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>{lbl}</button>
          ))}
        </div>
        <button onClick={addClass} disabled={!addForm.name.trim()} style={{width:"100%",padding:"12px",background:addForm.name.trim()?"var(--accent)":"var(--border)",color:addForm.name.trim()?"var(--on-accent)":"var(--muted)",border:"none",borderRadius:"9px",cursor:addForm.name.trim()?"pointer":"not-allowed",fontSize:"14px",fontWeight:"700"}}>{editing ? "Save changes" : "Add to schedule"}</button>
      </div>
    </div>
  );
}

export function CalendarScreen({onBack, onStartClass}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [viewMode, setViewMode] = React.useState("grid"); // "grid" | "heat"
  const [dismissedTips, setDismissedTips] = React.useState([]);
  const { toast } = useToast();
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
  // This was the repo's ONLY guarded persist-effect and the hand-rolled ref it
  // used is now `useAfterMount`, shared with the six that had no guard at all.
  useAfterMount(() => {
    store.saveUserClasses(userClasses);
  }, [userClasses]);
  const [showAddClass, setShowAddClass] = React.useState(false);
  // `type` starts empty rather than at a hard-coded `"HIIT"`: the catalogue is
  // the gym's, so the default has to come from it (see `blankForm` below).
  const [addForm, setAddForm] = React.useState({name:"",type:"",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});

  // Seven days. This list was Mon–Sat, and because the "Add class" day picker is
  // built from it too, the product was self-consistently unable to schedule a
  // Sunday class — invisible rather than broken. Confirmed with Dylan in session
  // 11 as unintended: a gym that runs Sunday classes could not use the Schedule
  // at all. Kept in the same order as `RULE_DAYS`, which is what dates an
  // occurrence, so the two can never disagree about which column Sunday is.
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const SLOTS = ["06:00","09:00","12:00","18:00","19:30"];
  // `SLOT_LABELS` (["Morning","Mid-Morning","Lunch","Evening","Late"]) lived here
  // unreferenced from decomposition stage 2 until session 18. The grid labels
  // slots by time, not by name, and nothing ever read it. Its own comment asked
  // for exactly this cleanup pass. git history keeps it if a named-slot UI is
  // ever wanted.

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

  // ── The gym's catalogue, not a second copy of it ──────────────────────────
  // This screen used to carry `CAT_COLOR` — a hand-maintained map of eight
  // display strings to hex colours, which was BOTH the grid's palette and the
  // "Class type" dropdown's entire vocabulary. It was a duplicate of data the
  // catalogue already holds (`WORKOUT_LIBRARY[k].color`) and it had already
  // drifted: Hyrox was `#22D3A6` here and `#F59E0B` there.
  //
  // Two costs, and the second is the expensive one:
  //   1. The dropdown offered a DIFFERENT set of class types from the Builder's.
  //      A gym running CrossFit, Pilates or Bootcamp could not put it on the
  //      schedule at all, and a gym-authored type (DEC-16) was invisible here —
  //      the exact "appears in one modal and nowhere else" failure DEC-16 was
  //      decided to avoid.
  //   2. It wrote its display string into `class_instances.class_type`, which is
  //      what N2 groups by. See `resolveClassType`.
  //
  // Read per render like every other `getLibrary()` caller, deliberately: a
  // coach who adds a class type in the Library modal sees it here immediately.
  const LIB = getLibrary();
  const classTypes = Object.entries(LIB).map(([value, c]) => ({
    value, label: `${c.icon || ""} ${c.label || value}`.trim(),
  }));
  // The grid tints a cell by appending 8-bit hex alpha (`${c}18`, `${c}40`), so
  // the value MUST be 6-digit hex. Two types are not: one the catalogue lacks
  // (a legacy "Mobility" rule) and — since the dropdown now offers them — a
  // gym-authored type, which `makeClassType` gives `color: "var(--accent)"`.
  // Either produced `var(--accent)18`, which is not a colour, so the cell lost
  // its background AND its border and stopped reading as a class at all.
  const GRID_FALLBACK = "#7A8A94";
  const typeColor = t => {
    const c = LIB[t]?.color || "";
    return /^#[0-9a-f]{6}$/i.test(c) ? c : GRID_FALLBACK;
  };

  // Only the gym's own classes appear — the mock base schedule is gone (audit 2.2).
  const schedule = {};

  // Rules saved before the above hold a display string (`"HIIT"`). Healed on
  // READ rather than migrated on load — `mountWrites.spec.js` exists to keep a
  // screen from persisting anything just by being opened, and `getPersonas()`
  // already sets the precedent of normalising a stored shape on the way out.
  // The stored rule keeps its old text until the coach next edits it, and both
  // the grid and the publish path below see the key regardless.
  const rules = userClasses.map(uc => ({ ...uc, type: resolveClassType(uc.type, LIB) }));

  // F5: merge user classes (with recurrence) onto the base schedule for the viewed week
  const effSchedule = { ...schedule };
  rules.forEach(uc => {
    // `id` carries through so a cell can name the RULE it came from. Without it
    // the grid could only ever add (see removeClass below).
    const entry = { id:uc.id, name:uc.name, coach:uc.coach||"", fill:uc.fill||0, type:uc.type, dur:uc.dur||"45m", custom:true, repeat:uc.repeat };
    if (uc.repeat === "daily") { DAYS.forEach(d => { effSchedule[`${d}-${uc.slot}`] = entry; }); }
    else if (uc.repeat === "weekly") { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
    else if (uc.weekKey === weekKey) { effSchedule[`${uc.day}-${uc.slot}`] = entry; }
  });
  // ── Edit a rule in place (session 18) ─────────────────────────────────────
  // Session 15 gave the grid a remove; there was still no way to RENAME or
  // RE-SLOT a class. The only path was remove-and-re-add, which mints a new
  // `id` — and the id is the rule's identity, carried onto every occurrence
  // `occurrencesForWeek` produces as `ruleId`. Losing it costs nothing today
  // and costs the link from a dated class back to the rule that scheduled it
  // the moment anything reads `ruleId`. A coach fixing a typo should not
  // silently re-found the class.
  //
  // WHAT AN EDIT DOES NOT DO, deliberately: it does not rewrite occurrences
  // already published. Those are dated history and `class_instances` is the
  // append-only spine attendance hangs off — the same principle `removeClass`
  // below already states. A rule is a template; publishing stamps a copy.
  //
  // So a rename or a re-slot on an ALREADY-PUBLISHED week leaves the old
  // occurrence on the books and makes the edited rule publishable again —
  // `occurrenceKey` is `name@startsAt`, so a changed name or time is a new
  // occurrence by identity. That is visible without inventing a warning for
  // it: "Publish week · N" lights back up, because it is computed from the
  // same `diffOccurrences` the publish path uses.
  const [editingId, setEditingId] = React.useState(null);

  const blankForm = () => ({name:"",type:classTypes[0]?.value||"",coach:"",day:"Mon",slot:"06:00",dur:"45m",repeat:"weekly"});

  const closeClassDialog = () => {
    setShowAddClass(false);
    setEditingId(null);
    setAddForm(blankForm());
  };

  // The grid renders a DERIVED entry that carries no day/slot/weekKey, so the
  // form is filled from the rule itself rather than from the cell.
  const openEdit = (id) => {
    const rule = userClasses.find(c => c.id === id);
    if (!rule) return;
    setAddForm({
      // Normalised on the way IN as well as on the way out, so saving an edit
      // writes the key even for a rule stored before this change.
      name: rule.name || "", type: resolveClassType(rule.type, LIB) || classTypes[0]?.value || "",
      coach: rule.coach || "",
      day: rule.day || "Mon", slot: rule.slot || "06:00",
      dur: rule.dur || "45m", repeat: rule.repeat || "weekly",
    });
    setEditingId(id);
    setShowAddClass(true);
  };

  const addClass = () => {
    if (!addForm.name.trim()) return;
    if (editingId) {
      setUserClasses(list => list.map(c => {
        if (c.id !== editingId) return c;
        // Spread the rule FIRST so `id` survives — that is the whole point of
        // editing rather than remove-and-re-add.
        const next = { ...c, ...addForm };
        // `weekKey` only means anything on a one-off. Stamp it when the rule
        // becomes one (a one-off is editable only from the week it sits in, so
        // the viewed week is the right one), and DROP it when the rule stops
        // being one — a stale weekKey on a weekly rule is inert today and is
        // exactly the kind of leftover that reads as a bug later.
        if (addForm.repeat === "once") next.weekKey = weekKey; else delete next.weekKey;
        return next;
      }));
    } else {
      const uc = { id:`uc${Date.now()}`, ...addForm };
      if (addForm.repeat === "once") uc.weekKey = weekKey;
      setUserClasses(list => [...list, uc]);
    }
    closeClassDialog();
  };
  // `setUserClasses` was only ever appended to — there was no way to take a
  // class OFF the schedule. A gym setting one up for the first time (the pilot's
  // literal first hour) could typo a name, schedule the wrong slot, or stop
  // running a class, and the grid would carry it forever. The class card even
  // had `cursor:pointer` promising the interaction that did not exist.
  //
  // Removing a RULE, not an occurrence: a daily rule paints seven cells and one
  // remove clears all seven, so the confirm says which class rather than which
  // cell. Published occurrences and their attendance are untouched — those are
  // dated history, and a class that ran did run.
  //
  // UNDO rather than a confirm, following toast.jsx's rule: the guard scales with
  // what is destroyed, and what is destroyed here is one scheduling RULE. Published
  // occurrences and their attendance survive untouched — a class that ran did run —
  // so the loss is a row a coach can put back in fifteen seconds by hand, and can
  // now put back in one click without having read a modal first.
  //
  // ⚠️ The closure holds the PRIOR LIST, not the removed row. Position is part of
  // what was lost: the grid paints in list order, so re-appending a restored rule
  // can move it relative to another class sharing its slot. This is the rule
  // CLAUDE.md states and it is not hypothetical here.
  //
  // ⚠️ `before` is read from state, NOT captured inside the `setUserClasses`
  // updater. An updater is called twice under StrictMode, so toasting from inside
  // one fires two toasts in dev and one in prod — the same class of trap as the
  // mount-guard ref this repo already documents.
  const removeClass = (id, name) => {
    if (!id) return;
    const before = userClasses;
    if (!before.some(c => c.id === id)) return;
    setUserClasses(before.filter(c => c.id !== id));
    toast(name ? `Removed “${name}” from the schedule` : "Removed from the schedule",
      { undo: () => { setUserClasses(before); toast(name ? `“${name}” is back` : "Restored"); } });
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

  // `rules`, not `userClasses` — this is the door onto `class_instances`, so it
  // must see the normalised type. Driving the UI and reading the stored row back
  // is what caught this: the grid above was already showing the healed value
  // while the published occurrence still carried `"HIIT"`.
  const weekOccurrences = occurrencesForWeek(rules, startOfWeek, { days: DAYS });
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
          <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
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
          {/* No `overflow:hidden` on this pill. It was here to keep children
              inside the 9px radius, but both children are transparent text
              buttons so it clipped nothing visible — while clipping the two
              arrows' data-tap overlays back to a 31px-tall strip. The tap sweep
              caught it; see the ⚠️ in index.css. */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",border:`1px solid var(--border)`,borderRadius:"9px"}}>
            {/* A guillemet is text, so these passed the "no unnamed buttons"
                sweep while announcing as "‹" and "›". The label says which way
                time moves, because "previous" and "next" are the whole meaning
                of the control and the glyph carries none of it. */}
            <button onClick={()=>setWeekOffset(w=>w-1)} aria-label="Previous week" data-tap style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>‹</button>
            <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",padding:"0 4px"}}>
              {weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":`Week ${weekOffset>0?"+":""}${weekOffset}`}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} aria-label="Next week" data-tap style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontWeight:"700"}}>›</button>
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
          <button onClick={()=>{setAddForm(blankForm());setShowAddClass(true);}} style={{padding:"8px 14px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",color:"var(--on-accent)",fontSize:"12px",fontWeight:"700"}}>
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
        <AddClassDialog onClose={closeClassDialog} addForm={addForm}
          setAddForm={setAddForm} addClass={addClass} editing={!!editingId}
          days={DAYS} slots={SLOTS} classTypes={classTypes}/>
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
                      background:`${typeColor(cls.type)}18`,
                      border:`1px solid ${typeColor(cls.type)}40`,
                      borderRadius:"8px",
                      position:"relative",
                      // minHeight, not height: the cell still fills its row, but a
                      // Start button can make it taller instead of overflowing.
                      minHeight:"calc(100% - 2px)",
                      boxSizing:"border-box",
                    }}>
                      {/* Named for the class AND the slot: a weekly class paints
                          one cell but a daily one paints seven, and "Remove"
                          alone would be seven identical controls. */}
                      {cls.id && (
                        <button aria-label={`Edit ${cls.name} on ${day} at ${slot}`}
                          onClick={()=>openEdit(cls.id)}
                          style={{position:"absolute",top:"2px",right:"16px",background:"transparent",border:"none",padding:"2px",cursor:"pointer",color:"var(--muted)",lineHeight:0,opacity:0.55}}>
                          <Pencil size={10}/>
                        </button>
                      )}
                      {/* ⚠️ The ✕ below is deliberately NOT `data-tap`. It was,
                          briefly, and it made the Pencil above UNCLICKABLE — the
                          two sit 14px apart (right:16px and right:2px) inside a
                          grid cell, so a 44px overlay on this one covers that one
                          completely. Nine e2e tests went red on the EDIT flow and
                          not one of them mentions tap targets, which is the
                          point: an overlay that eats a neighbour shows up as the
                          neighbour being broken, three files away. `orphanScan`
                          in tapScan.js now fails on exactly this, so the next
                          attempt is caught by the sweep rather than by the
                          schedule suite. */}
                      {cls.id && (
                        <button aria-label={`Remove ${cls.name} on ${day} at ${slot} from the schedule`}
                          onClick={()=>removeClass(cls.id, cls.name)}
                          style={{position:"absolute",top:"2px",right:"2px",background:"transparent",border:"none",padding:"2px",cursor:"pointer",color:"var(--muted)",lineHeight:0,opacity:0.55}}>
                          <X size={11}/>
                        </button>
                      )}
                      <div style={{fontSize:isMobile?"9px":"11px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:"28px"}}>{cls.name}</div>
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
                      {/* The cell shows the catalogue's LABEL; `cls.type` is now
                          a key, and a gym-authored one reads `gym-barre-ms4pk827`. */}
                      {cls.type && <div style={{fontSize:"9px",color:"var(--muted)",fontWeight:"700",marginTop:"3px",textTransform:"uppercase",letterSpacing:"0.4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{LIB[cls.type]?.label || cls.type}</div>}
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
                  {/* An empty slot invited a click and refused it. This was a
                      div with a pointer cursor and a "+" revealed on hover,
                      wired to onMouseEnter/onMouseLeave and NOTHING ELSE — the
                      most direct way to say "put a class here" in the whole
                      product, and it did nothing. The Add-a-class modal it
                      should open already existed, three lines below, with `day`
                      and `slot` fields that this now fills in.

                      A button, not a div: an opacity-0 hover target is not
                      reachable by keyboard at all, so focus reveals it the same
                      way the mouse does, and the name says which cell it is —
                      thirty-five identical "Add" buttons would distinguish
                      nothing. */}
                  {!cls && !sug && (
                    <button
                      onClick={()=>{ setAddForm(f=>({...f, day, slot})); setShowAddClass(true); }}
                      aria-label={`Add a class on ${day} at ${slot}`}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="0"}
                      onFocus={e=>e.currentTarget.style.opacity="1"}
                      onBlur={e=>e.currentTarget.style.opacity="0"}
                      style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,background:"transparent",border:"none",padding:0}}>
                      <span style={{fontSize:"18px",color:"var(--muted)"}} aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom: AI tips + Trainer load */}
      {/* ─── UI-POLISH §3.5 · two panels that could never fill ────────────────
          `aiTips` and `trainers` are both `FLAGS.mockAnalytics ? [...] : []` and
          the flag is false, so BOTH cards rendered their empty state
          permanently — a branded panel with an icon telling a paying gym owner
          that "scheduling suggestions appear here once Jungle has live
          attendance & demand data", for a feature with no implementation behind
          it. Not "empty for now": empty forever, on the screen a gym looks at
          most.

          §3.5's rule is that an empty state names the ONE action that fills it
          and is a button. Neither of these has an action that fills it, so the
          rule's other branch applies and they are not rendered at all. The
          markup stays inside the same flag the data already uses, so turning
          `mockAnalytics` on brings the panels back with it — one switch, not
          two, which is the mistake that let the data and its packaging drift
          apart in the first place. */}
      {FLAGS.mockAnalytics && (
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
      )}
    </div>
  );
}
