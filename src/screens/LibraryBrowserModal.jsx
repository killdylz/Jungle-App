// ─── The Exercise Library browser ────────────────────────────────────────────
//
// Lifted out of App.jsx whole, unchanged apart from its imports, for the same
// reason as BrandStudioScreen: `StaffApp.js` is the binding constraint on
// everything this product builds next, and a MODAL is the cheapest thing to move
// — it is already behind a click, so lazily loading it costs a beat that the
// user has already accepted by opening a dialog.
//
// ⚠️ It is opened from THREE places (the Builder's panel, the Builder's toolbar
// and the `library` nav route), which is why the full e2e suite is the gate on
// this move rather than one spec.
//
// The Glossary came with it. Nothing else reads `glossaryEntry` — it exists to
// fill the gaps in a gym's own movement rows, which only this screen renders.
import React, { useState, useEffect, useRef } from "react";
import { Plus, Search, X } from "lucide-react";
import { GLOSSARY } from "../data/glossary.js";
import { getLibrary, saveLibrary, resetLibrary, BUILT_IN_LIBRARY,
         makeClassType, newClassTypeKey } from "../lib/libraryAccess.js";
import { inkOn, hueInk } from "../lib/colors.js";
import { useWindowWidth } from "../ui/primitives.jsx";
import { useDialog } from "../ui/dialog.js";
import { useToast } from "../ui/toast.jsx";

// ─── Glossary, folded into the Library (audit 2.3) ───────────────────────────
// The Glossary was its own nav destination showing muscles + a coaching cue for
// ~28 movements. That content is real and worth keeping; a separate screen for
// it was not, because it forced a coach to remember which of two places a
// movement lives in. The cue now rides on the movement's Library row.
//
// Matching is on a normalised name so "Push-Up", "push up" and "Push Up" all
// resolve. A miss returns null and NOTHING renders — the library is per-gym and
// mostly larger than the glossary, so an absent cue is the normal case, not an
// error to apologise for.
const GLOSSARY_BY_NAME = (() => {
  const map = new Map();
  for (const entries of Object.values(GLOSSARY)) {
    for (const e of entries) map.set(normMovementName(e.name), e);
  }
  return map;
})();
function normMovementName(n) {
  return String(n || "").toLowerCase().replace(/[\s\-_]+/g, " ").trim();
}
function glossaryEntry(name) {
  return GLOSSARY_BY_NAME.get(normMovementName(name)) || null;
}

// The library's "are you sure" — a nested dialog. Split out of the render below
// only so it can own a `useDialog` of its own; the markup is unchanged.
function ResetLibraryConfirm({ onCancel, onConfirm }) {
  const dlg = useDialog(onCancel, "Reset the exercise library to defaults?");
  return (
    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,borderRadius:"18px"}}>
      <div {...dlg} style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"24px",maxWidth:"340px",textAlign:"center",outline:"none"}}>
        <p style={{fontSize:"28px",marginBottom:"8px"}}>⚠️</p>
        <p style={{fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"8px"}}>Reset to Defaults?</p>
        <p style={{fontSize:"12px",color:"var(--muted)",marginBottom:"18px",lineHeight:"1.5"}}>All custom exercises will be removed and the built-in library restored.</p>
        <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
          <button onClick={onCancel} style={{padding:"8px 20px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",cursor:"pointer",color:"var(--muted)",fontSize:"12px"}}>Cancel</button>
          <button onClick={onConfirm} style={{padding:"8px 20px",background:"var(--danger)",border:"none",borderRadius:"7px",cursor:"pointer",color:"#FFFFFF",  // white on --danger is 3.76:1 at 12px/700 — see the WOD tab; --danger is a FIXED colour, so `inkOn` against black/white is the rule
          fontSize:"12px",fontWeight:"700"}}>Reset Library</button>
        </div>
      </div>
    </div>
  );
}

// ─── LibraryBrowserModal ──────────────────────────────────────────────────────
export function LibraryBrowserModal({ onClose, onAddExercise=null, initialClass=null }) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 900;

  const [libData, setLibData] = useState(() => getLibrary());
  const classKeys = Object.keys(libData);

  // Opened FROM the Builder, this lands on the class being built. It used to
  // always open on `classKeys[0]` — CrossFit — so a coach building a Barre class
  // pressed "Browse Library" and got CrossFit's 38 movements, one press away
  // from adding a Back Squat to a Barre class. Worst for a gym-authored type,
  // which sorts LAST in a horizontally-scrolling chip row: the type the gym
  // wrote is the hardest one to reach from the screen where it gets used.
  //
  // Guarded against a key the catalogue no longer has, so a deleted or reset
  // class type opens on something rather than on an empty panel. Nothing is
  // hidden — every chip is still there, this only decides which one starts
  // selected. As a nav destination (no `initialClass`) it still opens on the
  // first class, because there is no class in hand to prefer.
  const [selClass,     setSelClass]     = useState(
    initialClass && libData[initialClass] ? initialClass : classKeys[0]);
  const [selSub,       setSelSub]       = useState(null);
  const [selStage,     setSelStage]     = useState("main");
  const [search,       setSearch]       = useState("");
  const [editMode,     setEditMode]     = useState(false);
  const [editingId,    setEditingId]    = useState(null);
  const [draftEx,      setDraftEx]      = useState({});
  const [resetConfirm, setResetConfirm] = useState(false);

  const cls      = libData[selClass];
  const subKeys  = cls ? Object.keys(cls.subTypes) : [];
  useEffect(() => { setSelSub(subKeys[0]||null); setEditingId(null); }, [selClass]);

  const sub       = cls && selSub ? cls.subTypes[selSub] : null;
  const rawEx     = sub ? (sub[selStage]||[]) : [];
  const exercises = search
    ? rawEx.filter(e=>e.n.toLowerCase().includes(search.toLowerCase())||(e.muscles||"").toLowerCase().includes(search.toLowerCase()))
    : rawEx;
  const classColor = libData[selClass]?.color || "var(--accent)";

  const persist = updated => { setLibData(updated); saveLibrary(updated); };
  const updateExerciseList = newList => persist({...libData,[selClass]:{...cls,subTypes:{...cls.subTypes,[selSub]:{...sub,[selStage]:newList}}}});

  const startEdit  = ex => { setEditingId(ex.id); setDraftEx({...ex}); };
  const cancelEdit = ()  => { setEditingId(null); setDraftEx({}); };
  const saveEdit   = ()  => { updateExerciseList(rawEx.map(e=>e.id===editingId?{...draftEx}:e)); setEditingId(null); showToast("Saved"); };
  // ── REGRESSION §1.3 · the last inverted guard ──────────────────────────────
  //
  // This asked "Delete this exercise?" while deleting a COACH — their whole
  // class corpus, movement catalogue and generation ledger — was one unguarded
  // click, until session 25 fixed that end. Now that the expensive deletion is
  // protected, the cheap one being MORE protected is the leftover half of the
  // same inversion.
  //
  // A confirm taxes every correct deletion to catch the rare wrong one. One
  // exercise is a handful of fields, visible on screen, and the coach can see
  // instantly whether they hit the right row — so the trade goes the other way
  // here, exactly as it does for removing a class plan.
  //
  // The undo closure holds the LIST as it was, not the deleted row: restoring by
  // re-appending would put the exercise back at the end, and this list is
  // hand-ordered by the coach (libraryReorder.spec.js exists because that order
  // is a real thing they set). Position is part of what was destroyed.
  const deleteEx   = id  => {
    const before = rawEx;
    const victim = rawEx.find(e => e.id === id);
    updateExerciseList(rawEx.filter(e=>e.id!==id));
    toast(victim?.n ? `Deleted ${victim.n}` : "Exercise deleted",
          { undo: () => { updateExerciseList(before); toast(victim?.n ? `${victim.n} restored` : "Restored"); } });
  };
  const addNewEx   = ()  => {
    const ex = {id:"custom_"+Date.now(),n:"New Exercise",s:"3",r:"10",rest:"30s",muscles:"",notes:"",timing:"none"};
    updateExerciseList([...rawEx,ex]);
    startEdit(ex);
  };

  // DEC-16: a class type this gym authored. The key is prefixed and
  // timestamp-suffixed (`newClassTypeKey`) so it can never collide with a
  // built-in one — `mergeLibrary` treats a key the built-in lacks as gym-owned
  // and stores it WHOLE, so a collision would silently turn the gym's type into
  // an override of a built-in and lose it on the next catalogue improvement.
  //
  // `makeClassType` supplies the shape rather than the call site building it,
  // because a type missing `subTypes` would crash the Builder's dropdown on the
  // next render, and that is exactly the kind of thing a second author forgets.
  const addClassType = () => {
    const label = window.prompt("Name this class type (e.g. Barre, Reformer, Kids)");
    if (label === null) return;                 // Cancel — not the same as empty
    const name = label.trim();
    if (!name) return;
    const key = newClassTypeKey(name);
    persist({ ...libData, [key]: makeClassType(name) });
    setSelClass(key);
    showToast(`Added ${name}`);
  };
  // BUILT_IN_LIBRARY, deliberately, not getLibrary(): "reset to defaults" means
  // the built-in catalogue. Reading the merged one here would reset to whatever
  // the gym currently has, i.e. to nothing.
  const handleReset = () => { resetLibrary(); setLibData(BUILT_IN_LIBRARY); setResetConfirm(false); showToast("Reset to defaults"); };

  // ── Reordering a pool ──────────────────────────────────────────────────────
  // The row rendered a ⠿ handle with `cursor:grab` and no `draggable` and no
  // handlers: the pointer changed to a grab hand and the row would not move.
  // libraryStore.js already stores a pool (one subType's warmup/main/cooldown
  // list) as the unit of change precisely "because those lists are ordered and
  // reorder is a real editing operation", so the persistence for this was
  // designed before the gesture existed.
  //
  // `canReorder` carries the one trap. `exercises` is `rawEx` FILTERED BY
  // SEARCH, so while a search is active the rendered index is not the stored
  // index — dropping row 2 onto row 0 of a filtered view would splice the wrong
  // two movements in the saved list and silently scramble the gym's catalogue.
  // With no search the two lists are the same array, so indices agree. Reorder
  // is also an edit, and lives in edit mode with add/rename/delete rather than
  // being the one mutation a browsing coach can trigger by accident.
  const canReorder = editMode && !search && !!sub;
  const exDragIdx = useRef(null);
  const [exDragOver, setExDragOver] = useState(null);
  const handleExDragStart = (e, i) => { exDragIdx.current = i; e.dataTransfer.effectAllowed = "move"; };
  const handleExDragOver  = (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setExDragOver(i); };
  const handleExDrop      = (e, i) => {
    e.preventDefault();
    setExDragOver(null);
    const from = exDragIdx.current;
    exDragIdx.current = null;
    if (from === null || from === i) return;
    const arr = [...rawEx];
    const [moved] = arr.splice(from, 1);
    arr.splice(i, 0, moved);
    updateExerciseList(arr);
  };
  const handleExDragEnd = () => { setExDragOver(null); exDragIdx.current = null; };
  // Folded into the shared primitive. A local `setToast` + setTimeout cannot
  // host a button, so the delete's undo needed the real one — and once one
  // action in this screen toasts from the bottom of the viewport while four
  // others toast from the top of the modal, the coach is watching two places for
  // the same kind of message. One primitive, one position.
  //
  // Safe from behind this modal: the library overlay is zIndex 600 and the
  // toast region is 900, so the toast paints above it rather than under it.
  const { toast } = useToast();
  const showToast = msg => toast(msg);

  const stageLabels = {warmup:"Warm-up",main:"Main set",cooldown:"Cool-down"};
  const dlg = useDialog(onClose, "Exercise library");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:600,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?"0":"20px"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div {...dlg} style={{
        background:"var(--card)",borderRadius:isMobile?"14px 14px 0 0":"18px",
        border:`1px solid var(--border)`,
        width:"100%",maxWidth:isTablet?"700px":"1200px",
        height:isMobile?"96vh":"88vh",
        display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
        boxShadow:"0 30px 80px rgba(0,0,0,.45)",outline:"none"
      }}>

        {/* (The local toast div is gone — see `showToast` above. It rendered
             inside this modal, so it could never carry the delete's Undo.) */}

        {/* ── Top page header ── */}
        <div style={{flexShrink:0,padding:isMobile?"12px 16px":"16px 22px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
          <div>
            <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>EXERCISE LIBRARY</p>
            {/* Was "…with a Discover feed of community packs" — still advertising
                the marketplace after the feed itself was deleted. The Glossary's
                muscles and cues fold in here now, so the copy says that. */}
            <p style={{fontSize:"12px",color:"var(--muted)"}}>The studio's movement catalogue — editable per gym, with muscles and coaching cues</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:`1px solid var(--border)`,borderRadius:"8px",padding:"6px 12px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
            <X size={13}/> Close
          </button>
        </div>

        {/* ── Body: 3 columns (or stacked on mobile) ── */}
        <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden",minHeight:0}}>

          {/* ── LEFT RAIL: class type list ── */}
          {!isMobile && (
            <div style={{width:"220px",flexShrink:0,borderRight:`1px solid var(--border)`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <p style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",padding:"14px 18px 8px"}}>CLASS TYPE</p>
              <div style={{flex:1,overflowY:"auto"}}>
                {classKeys.map(k=>{
                  const c = libData[k];
                  const totalCount = Object.values(c.subTypes||{}).reduce((a,sub)=>a+(sub.warmup?.length||0)+(sub.main?.length||0)+(sub.cooldown?.length||0),0);
                  const isActive = selClass===k;
                  return (
                    <button key={k} onClick={()=>setSelClass(k)}
                      style={{
                        width:"100%",textAlign:"left",padding:"10px 18px",border:"none",
                        background:isActive?"var(--navy)":"transparent",cursor:"pointer",
                        display:"flex",alignItems:"center",gap:"10px",
                        borderLeft:isActive?`3px solid ${c.color}`:"3px solid transparent",
                        transition:"background 0.15s"
                      }}>
                      <div style={{width:"9px",height:"9px",borderRadius:"3px",flexShrink:0,background:c.color}}/>
                      <span style={{flex:1,fontSize:"13px",fontWeight:isActive?"700":"500",color:isActive?"var(--text)":"var(--muted)"}}>{c.label}</span>
                      <span style={{fontSize:"11px",color:"var(--muted)"}}>{totalCount}</span>
                    </button>
                  );
                })}
              </div>
              {/* DEC-16, answered yes in session 18. This button existed once
                  with no onClick — it rendered, it was focusable, a coach could
                  press it, and nothing happened — so session 15 deleted it. The
                  delta store could always carry a gym-authored type
                  (`libraryStore.js` stores a key the built-in lacks whole); what
                  was missing was that every other surface read the BUILT-IN
                  catalogue, so the type would have appeared here and nowhere
                  else. Those reads now go through `getLibrary()`, so the button
                  comes back — and this time it is only here because it works. */}
              {editMode && (
                <button onClick={addClassType}
                  style={{width:"100%",marginTop:"8px",padding:"9px",background:"transparent",border:`1px dashed var(--border)`,borderRadius:"9px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"700"}}>
                  + New class type
                </button>
              )}
            </div>
          )}

          {/* ── CENTER: library / discover content ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

            {/* Center toolbar */}
            <div style={{flexShrink:0,padding:isMobile?"10px 14px":"12px 18px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
              {/* Mobile: class type select */}
              {isMobile && (
                <select value={selClass} onChange={e=>setSelClass(e.target.value)} aria-label="Class type to browse"
                  style={{padding:"5px 8px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"7px",color:"var(--text)",fontSize:"12px",cursor:"pointer"}}>
                  {classKeys.map(k=><option key={k} value={k}>{libData[k].icon} {libData[k].label}</option>)}
                </select>
              )}

              {/* The "Discover" tab and its right-rail packs feed are gone: the tab
                  browsed a third-party exercise API the gym never asked for, and
                  the packs were fabricated authors and import counts (audit 2.2).
                  The library is now the one movement home. */}
              <>
                  {/* Search */}
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:"7px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",padding:"7px 12px",minWidth:"120px"}}>
                    <Search size={13} color={"var(--muted)"}/>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search exercises…"
                      style={{background:"none",border:"none",outline:"none",color:"var(--text)",fontSize:"12px",width:"100%"}}/>
                  </div>
                  {/* Edit toggle */}
                  <button onClick={()=>{setEditMode(v=>!v);setEditingId(null);}}
                    style={{padding:"7px 14px",background:editMode?classColor+"22":"var(--navy)",border:`1px solid ${editMode?classColor:"var(--border)"}`,borderRadius:"8px",cursor:"pointer",color:editMode?classColor:"var(--muted)",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
                    ✏️ {editMode?"Done":"Edit"}
                  </button>
                  {editMode && <button onClick={()=>setResetConfirm(true)} style={{padding:"7px 12px",background:"transparent",border:"1px solid var(--danger-border)",borderRadius:"8px",cursor:"pointer",color:"var(--danger)",fontSize:"11px",fontWeight:"700",flexShrink:0}}>Reset</button>}
              </>
            </div>

            <>
                {/* Sub-type filter chips */}
                <div style={{flexShrink:0,padding:"8px 18px",borderBottom:`1px solid var(--border)`,display:"flex",gap:"6px",overflowX:"auto",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
                  {subKeys.map(sk=>{
                    const s = cls.subTypes[sk];
                    const isActive = selSub===sk;
                    return (
                      <button key={sk} onClick={()=>{setSelSub(sk);setEditingId(null);}}
                        style={{flexShrink:0,padding:"5px 14px",borderRadius:"999px",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"700",whiteSpace:"nowrap",
                          background:isActive?classColor:"transparent",
                          // ⚠️ A FILLED plate, so `hueInk` is the wrong tool — the
                          // plate is the catalogue colour and owes nothing to the
                          // skin. `inkOn` against pure black/white for the same
                          // reason. White on the WOD red measured 3.76:1.
                          color:isActive?inkOn(classColor,"#000000","#FFFFFF"):"var(--muted)",
                          outline:isActive?"none":`1px solid var(--border)`,
                          transition:"background 0.15s"}}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {/* Stage tabs */}
                <div style={{flexShrink:0,padding:"0 18px",borderBottom:`1px solid var(--border)`,display:"flex",gap:"0",alignItems:"center"}}>
                  {[["warmup","Warm-up"],["main","Main set"],["cooldown","Cool-down"]].map(([stage,lbl])=>{
                    const cnt = (sub?.[stage]||[]).length;
                    const isActive = selStage===stage;
                    return (
                      <button key={stage} onClick={()=>{setSelStage(stage);setEditingId(null);}}
                        style={{
                          padding:"12px 16px",background:"none",border:"none",cursor:"pointer",
                          fontSize:"13px",fontWeight:"600",whiteSpace:"nowrap",
                          color:isActive?classColor:"var(--muted)",
                          borderBottom:isActive?`2px solid ${classColor}`:"2px solid transparent",
                          transition:"color 0.15s,border-color 0.15s"
                        }}>
                        {lbl} <span style={{fontSize:"11px",color:"var(--muted)"}}>{cnt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Exercise list */}
                <div style={{flex:1,overflowY:"auto",padding:"12px 18px",display:"flex",flexDirection:"column",gap:"6px"}}>
                  {exercises.length===0 && !editMode && (
                    <div style={{textAlign:"center",padding:"40px",color:"var(--muted)"}}>
                      <p style={{fontSize:"24px",marginBottom:"8px"}}>🔍</p>
                      <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>No exercises found</p>
                      <p style={{fontSize:"11px"}}>{search?"Try a different search":"No exercises for this stage yet"}</p>
                    </div>
                  )}

                  {exercises.map((ex,exIdx)=>{
                    const isEditing = editMode && editingId===ex.id;
                    return (
                      <div key={ex.id}
                        draggable={canReorder && !isEditing}
                        onDragStart={canReorder?e=>handleExDragStart(e,exIdx):undefined}
                        onDragOver={canReorder?e=>handleExDragOver(e,exIdx):undefined}
                        onDrop={canReorder?e=>handleExDrop(e,exIdx):undefined}
                        onDragEnd={canReorder?handleExDragEnd:undefined}
                        style={{
                        background:isEditing?classColor+"12":"var(--navy)",
                        border:`1px solid ${isEditing?classColor+"60":exDragOver===exIdx?classColor:"var(--border)"}`,
                        opacity:exDragOver===exIdx?0.6:1,
                        borderRadius:"10px",padding:"12px 14px",
                        transition:"border-color 0.15s,background 0.15s"
                      }}>
                        {isEditing ? (
                          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                            <input value={draftEx.n||""} onChange={e=>setDraftEx(d=>({...d,n:e.target.value}))} placeholder="Exercise name *"
                              style={{padding:"6px 10px",background:"var(--card)",border:`1px solid ${classColor}60`,borderRadius:"6px",color:"var(--text)",fontSize:"13px",fontWeight:"700",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                              {[["s","Sets","60px"],["r","Reps / Duration","110px"],["rest","Rest","80px"]].map(([f,p,w])=>(
                                <input key={f} value={draftEx[f]||""} onChange={e=>setDraftEx(d=>({...d,[f]:e.target.value}))} placeholder={p}
                                  style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:w,boxSizing:"border-box"}}/>
                              ))}
                              <select value={draftEx.timing||"none"} aria-label="Timing format for this movement" onChange={e=>setDraftEx(d=>({...d,timing:e.target.value}))}
                                style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",cursor:"pointer"}}>
                                {["none","emom","tabata","amrap","for time"].map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <input value={draftEx.muscles||""} onChange={e=>setDraftEx(d=>({...d,muscles:e.target.value}))} placeholder="Muscles targeted"
                              style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                            <textarea value={draftEx.notes||""} onChange={e=>setDraftEx(d=>({...d,notes:e.target.value}))} placeholder="Coaching notes (optional)" rows={2}
                              style={{padding:"5px 8px",background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"6px",color:"var(--text)",fontSize:"11px",outline:"none",width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            <div style={{display:"flex",gap:"6px",justifyContent:"flex-end"}}>
                              <button onClick={cancelEdit} style={{padding:"5px 14px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>Cancel</button>
                              <button onClick={saveEdit} disabled={!draftEx.n?.trim()} style={{padding:"5px 14px",background:classColor,border:"none",borderRadius:"6px",cursor:"pointer",color:inkOn(classColor,"#000000","#FFFFFF"),fontSize:"11px",fontWeight:"700",opacity:!draftEx.n?.trim()?0.5:1}}>Save Exercise</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                            {/* Drag handle — only where the gesture exists. It
                                used to render always, so a browsing coach got a
                                grab cursor on a row that could not move, and a
                                searching coach got one on a row whose position
                                is a filtered artefact. */}
                            {canReorder && <div style={{color:"var(--muted)",fontSize:"14px",flexShrink:0,cursor:"grab",opacity:0.4}}>⠿</div>}
                            {/* Info. `g` is the folded-in Glossary entry (or null).
                                It only fills gaps — a gym's own muscles text and
                                notes always win over the built-in reference. */}
                            <div style={{flex:1,minWidth:0}}>
                              <p style={{fontSize:"14px",fontWeight:"600",color:"var(--text)",marginBottom:"2px"}}>{ex.n}</p>
                              {(ex.muscles || glossaryEntry(ex.n)?.muscles) && (
                                <p style={{fontSize:"11px",color:"var(--muted)"}}>{ex.muscles || glossaryEntry(ex.n).muscles}</p>
                              )}
                              {/* No second dim on top of `--muted` — see the Brand
                                  Studio preset line for the same fix and the numbers. */}
                              {(ex.notes || glossaryEntry(ex.n)?.cues) && (
                                <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"3px",lineHeight:"1.45"}}>
                                  {ex.notes || glossaryEntry(ex.n).cues}
                                </p>
                              )}
                            </div>
                            {/* Tags */}
                            <div style={{display:"flex",gap:"5px",flexShrink:0,alignItems:"center"}}>
                              {ex.timing&&ex.timing!=="none" && (
                                <span style={{fontSize:"10px",padding:"3px 8px",background:classColor+"20",color:classColor,borderRadius:"999px",fontWeight:"700"}}>{ex.timing} work</span>
                              )}
                              {ex.r && <span style={{fontSize:"10px",color:"var(--muted)"}}>×{ex.r}{ex.s?` · ${ex.s}×`:""}</span>}
                              {/* The reason a coach opens this from the Builder.
                                  `onAddExercise` was accepted as a prop, passed
                                  from both Builder call sites, and never called —
                                  so the studio's whole movement catalogue was
                                  browse-only and the plan had to be retyped by
                                  hand. The prop's PRESENCE is the context: the
                                  standalone Library route passes none, because
                                  there is no class to add to from there.
                                  The name carries the movement — six identical
                                  "Add" buttons in a set otherwise announce the
                                  same thing and distinguish nothing. */}
                              {onAddExercise && !editMode && (
                                <button onClick={()=>{const where=onAddExercise(ex);showToast(where?`Added to ${where}`:"Add a stage first");}}
                                  aria-label={`Add ${ex.n} to class`}
                                  style={{background:"transparent",border:`1px solid ${classColor}60`,borderRadius:"6px",padding:"4px 10px",cursor:"pointer",color:classColor,fontSize:"11px",fontWeight:"700",display:"flex",alignItems:"center",gap:"4px",flexShrink:0}}>
                                  <Plus size={11}/> Add
                                </button>
                              )}
                              {editMode && (
                                <>
                                  {/* An emoji IS the accessible name when nothing
                                      else is given, so these announced as
                                      "pencil" and "wastebasket" — six identical
                                      pairs in a set, one of them destructive,
                                      with no way to tell which movement any of
                                      them acted on. The name carries the
                                      exercise for the same reason every other
                                      icon-only control in this repo does. */}
                                  <button onClick={()=>startEdit(ex)} aria-label={`Edit ${ex.n}`} style={{background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",padding:"4px 8px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>✏️</button>
                                  <button onClick={()=>deleteEx(ex.id)} aria-label={`Delete ${ex.n}`} style={{background:"transparent",border:"1px solid var(--danger-border)",borderRadius:"6px",padding:"4px 8px",cursor:"pointer",color:"var(--danger)",fontSize:"11px"}}>🗑️</button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add exercise dashed row */}
                  {editMode && sub && !search && (
                    <button onClick={addNewEx} style={{padding:"14px",background:"transparent",border:`2px dashed ${classColor}40`,borderRadius:"10px",cursor:"pointer",color:classColor,fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",marginTop:"4px"}}>
                      + Add exercise to this set
                    </button>
                  )}
                </div>
            </>
          </div>

          {/* The 300px "Discover packs" rail is gone. It advertised a community
              marketplace that does not exist — fabricated authors and import
              counts when flagged on, and a permanent coming-soon billboard when
              flagged off. A column that only announces an absence earns none of
              its width (audit 2.2). The Glossary cues claim this space instead. */}
        </div>

        {/* Reset overlay. Its own component so `useDialog` mounts and unmounts
            WITH the confirm — a hook cannot be called from inside a `&&`. This
            one nests inside the library dialog above, which is the case the
            hook's topmost-wins stack exists for: Escape must cancel the confirm
            and leave the library open. */}
        {resetConfirm && (
          <ResetLibraryConfirm onCancel={()=>setResetConfirm(false)} onConfirm={handleReset}/>
        )}
      </div>
    </div>
  );
}

// The Builder's "Build for me" overlay. Extracted for the same single reason as
// ResetLibraryConfirm — a `useDialog` needs a component to mount with. The
// markup and behaviour below are unchanged, including the `autoFocus` that the
// hook deliberately does not override.
