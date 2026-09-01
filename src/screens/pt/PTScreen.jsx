// ─── 1:1 Clients — the second lens (F1 / P5) ────────────────────────────────
//
// The spec's P5 is "one primitive, two lenses": a session is programmed stages
// assigned to N people; assigned to a class it is a group workout, assigned to
// one person it is PT. P5 has been ⛔ since the spec was written because only the
// group lens existed. This screen and `ParqScreen` are the other lens.
//
// LAZY, and it has to be: `npm run size` had 10.5 kB of StaffApp headroom when
// this was written, and it is the binding constraint on anything new. All of the
// arithmetic lives in `lib/ptClients.js` and `lib/parq.js`, so this file is
// markup and event handlers — which also means the rules that matter (who may be
// prescribed load, what counts as booked) are unit-tested rather than asserted
// through a rendered chip.
//
// 🔴 WHAT THIS SCREEN REFUSES TO DO
//   1. It does not write 1:1 sessions into `class_instances` or `attendance`.
//      They fit, and that is the trap: every studio number would quietly start
//      counting one-person sessions as classes, average class size would fall,
//      and nothing on screen would say why. The banner says so out loud instead.
//   2. It does not let a coach plan a personalised session for someone with no
//      valid health screen. F2's gap 1 makes that a hard gate, and the refusal
//      is in `store.assignPtSession` as well as here — a gate that lives only in
//      JSX is one the next screen walks through.
//   3. It shows no money. There is no PT billing model in this product, and a
//      rate times a session count is exactly the confident wrong number
//      CLAUDE.md calls worse than no number.

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Plus, Check, Trash2, ShieldAlert, ShieldCheck, CalendarPlus } from "lucide-react";
import * as store from "../../lib/store.js";
import {
  ptClientRows, ptRosterSummary, describePtRoster, sessionsForClient,
  availableMembers, sessionMinutes, PT_CLIENT_STATUSES, PT_CLIENT_STATUS_LABEL,
} from "../../lib/ptClients.js";
import { describeLoadGate } from "../../lib/parq.js";
import { useWindowWidth, StatCard, Input, Select } from "../../ui/primitives.jsx";
import { useToast } from "../../ui/toast.jsx";

// The date a coach means by "today", in the input's own format.
const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// The four fields `updatePtClient` accepts. Declared once so the edit form and
// its reset cannot drift apart — a key missing here is a key the form silently
// stops sending, which is the D6 shape all over again.
const EMPTY_DETAIL = { goal: "", coachName: "", startedAt: "", notes: "" };

export function PTScreen({ onBack, onNavigate, onLoadSession }) {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const { toast } = useToast();

  const [members, setMembers] = useState(() => store.getMembers());
  const [clients, setClients] = useState(() => store.getPtClients());
  const [parqs, setParqs] = useState(() => store.getParqRecords());
  const [sessions, setSessions] = useState(() => store.getPtSessions());
  const [selectedId, setSelectedId] = useState("");

  const [pickMember, setPickMember] = useState("");
  const [goal, setGoal] = useState("");
  const [addErr, setAddErr] = useState("");

  const [planDate, setPlanDate] = useState(today);
  const [planName, setPlanName] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [useDraft, setUseDraft] = useState(true);
  const [planErr, setPlanErr] = useState("");

  // Members sync; the 1:1 ledgers do not (see the block above `getParqRecords`
  // in store.js). So the hydrate here is the same shape as RosterScreen's —
  // local first, server behind it — and it touches only the roster.
  useEffect(() => {
    let alive = true;
    store.hydrateAttendance().then(r => {
      if (!alive || !r) return;
      setMembers(r.members);
    });
    return () => { alive = false; };
  }, []);

  // `useMemo` on the clock rather than a bare call: `ptClientRows` evaluates
  // every client's PAR-Q expiry against `now`, and a fresh `new Date()` on every
  // keystroke in the goal field is work nobody asked for.
  const rows = useMemo(
    () => ptClientRows(clients, members, parqs, sessions, { now: new Date() }),
    [clients, members, parqs, sessions]);
  const summary = ptRosterSummary(rows);
  const selected = rows.find(r => r.id === selectedId) || null;
  const pickable = availableMembers(members, clients);
  const draft = store.getDraftClass();

  const card = { border:"1px solid var(--border)", borderRadius:"12px", background:"var(--card)", padding:isMobile?"14px":"18px" };
  const h = { fontFamily:"var(--display)", fontSize:"15px", fontWeight:"700", color:"var(--text)" };
  const note = { fontSize:"12px", color:"var(--muted)", lineHeight:1.6 };
  const label = { fontSize:"10px", fontWeight:"700", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"1px", display:"block", marginBottom:"5px" };
  const primary = { padding:"9px 15px", borderRadius:"8px", border:"none", background:"var(--accent)", color:"var(--on-accent)", fontSize:"12px", fontWeight:"700", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:"6px" };
  const ghost = { padding:"8px 13px", borderRadius:"8px", border:"1px solid var(--border)", background:"transparent", color:"var(--text)", fontSize:"12px", fontWeight:"600", cursor:"pointer" };

  const addClient = () => {
    const r = store.addPtClient({ memberId: pickMember, goal });
    if (r.error) { setAddErr(r.error); return; }
    setAddErr(""); setClients(r.clients); setSelectedId(r.client.id);
    setPickMember(""); setGoal("");
    toast(`${members.find(m => m.id === r.client.memberId)?.name || "Client"} added to 1:1`);
  };

  const setStatus = (id, status) => setClients(store.updatePtClient(id, { status }).clients);

  // ── D6 · the four fields the store accepted and nothing could set ─────────
  //
  // 🔴 `updatePtClient` has always taken `goal`, `coachName`, `notes` and
  // `startedAt`. The only call in the app sent `{ status }`, so a goal typed
  // once when the client was added was PERMANENT — a typo in it could not be
  // corrected from anywhere in the product — and `coachName` and `notes` were
  // stored fields no screen rendered at all. No test could notice: there is
  // nothing to assert about a control that was never built.
  // `scripts/audit-store-writers.mjs` is what named them; `storeWriters.test.js`
  // is the check that fails until every one of them has a way in.
  //
  // Keyed on the client id rather than a bare boolean, matching RosterScreen:
  // an `editing` flag survives a click onto a DIFFERENT client and offers one
  // person's form under another person's name.
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(EMPTY_DETAIL);

  // Suggestions only. ⚠️ A coach is a TYPED NAME and must stay one — identity
  // lives in the roster and resolves by name (`lib/coachRoster.js`), so nothing
  // here writes an id. The datalist just keeps what a coach types in step with
  // the roster, because `resolveCoach` matches on the string.
  const coachNames = useMemo(
    () => store.getCoaches().map(c => c && c.name).filter(Boolean), []);

  const startEdit = (row) => {
    setEditId(row.id);
    setDetail({ goal: row.goal, coachName: row.coachName, startedAt: row.startedAt, notes: row.notes });
  };
  const saveDetail = (id) => {
    setClients(store.updatePtClient(id, detail).clients);
    setEditId(null);
    toast("Details saved");
  };

  const plan = () => {
    if (!selected) return;
    const r = store.assignPtSession({
      clientId: selected.id, memberId: selected.memberId, date: planDate,
      planName: planName || draft?.name || "",
      // The Builder's current draft, snapshotted at assign time. `store` deep-copies
      // it, so editing the draft afterwards cannot rewrite a session that was
      // already prescribed to a named person — the snapshot-on-publish boundary
      // F1 says classes still do not have.
      stages: useDraft && draft ? draft.stages : null,
      notes: planNotes,
    }, selected.parq);
    if (r.error) { setPlanErr(r.error); return; }
    setPlanErr(""); setSessions(r.sessions); setPlanNotes("");
    toast(`Session planned for ${selected.name || "this client"} on ${r.session.date}`);
  };

  const removeSession = (s) => {
    const { sessions: after, undo } = store.removePtSession(s.id);
    setSessions(after);
    // The PRIOR LIST, not the row: position is part of what was lost.
    toast(`Removed ${s.planName}`, { undo: () => setSessions(store.savePtSessions(undo)) });
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          {/* One vocabulary. The sidebar, the More sheet and this heading all say
              "1:1 Clients" — this repo already carries three names for the
              Builder and it is a documented trap. */}
          <h1 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)"}}>1:1 Clients</h1>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>Programming for one person at a time</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px"}}>
        <div style={{maxWidth:"1000px",margin:"0 auto",display:"flex",flexDirection:"column",gap:"18px"}}>

          {/* ── What this data is, before anything is read off it ────────────
              An owner who thinks 1:1 sessions are in the studio numbers will draw
              wrong conclusions from a perfectly correct screen. Stated first,
              once, rather than footnoted under each panel. */}
          <div style={{...card,background:"var(--bg)"}} data-testid="pt-local-only">
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:"8px"}}>Where this lives</div>
            <p style={note}>
              1:1 clients, health screens and 1:1 sessions are stored <strong>on this device only</strong>.
              The server has no table for them yet, so they do not sync between devices and are not
              in your backups. Your member roster is unaffected &mdash; it syncs as it always has.
            </p>
            <p style={{...note,marginTop:"6px"}}>
              1:1 sessions are also <strong>not counted in studio analytics</strong>. A one-person session
              is not a class, and folding it into the class numbers would move every figure on the
              Analytics screen with nothing saying why.
            </p>
          </div>

          {/* ── The numbers, and the sentence that reads them ─────────────── */}
          <div style={card} data-testid="pt-summary">
            <div style={h}>Your 1:1 roster</div>
            <p style={{...note,margin:"4px 0 14px"}}>{describePtRoster(summary)}</p>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:"12px"}}>
              <StatCard label="TRAINING 1:1" value={String(summary.training)}/>
              <StatCard label="SESSION BOOKED" value={String(summary.booked)}/>
              <StatCard label="HEALTH SCREEN DUE" value={String(summary.blocked)}/>
              <StatCard label="ON RECORD" value={String(summary.total)}/>
            </div>
          </div>

          {/* ── Add a client ─────────────────────────────────────────────────
              From the roster, never a second name field. A 1:1 client IS a
              member; letting a coach type a name here would give the gym two
              rosters that disagree, which is the drift `isCurrentMember` exists
              to prevent one screen at a time. */}
          <div style={card} data-testid="pt-add">
            <div style={h}>Add a 1:1 client</div>
            {!members.length ? (
              <>
                <p style={{...note,marginTop:"6px"}}>
                  Your roster is empty, and a 1:1 client is someone already on it. Add people on the
                  Members screen first &mdash; that keeps one list of who trains here rather than two.
                </p>
                {onNavigate && (
                  <button onClick={()=>onNavigate("member")} data-tap style={{...primary,marginTop:"12px"}}>Go to Members</button>
                )}
              </>
            ) : !pickable.length ? (
              <p style={{...note,marginTop:"6px"}} data-testid="pt-all-added">
                Everyone on your roster already has a 1:1 record. To restart with someone who
                finished, set them back to Training below rather than adding a second record &mdash;
                their session history is on the first one.
              </p>
            ) : (
              <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:"10px",alignItems:isMobile?"stretch":"flex-end",marginTop:"12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <label style={label} htmlFor="pt-member">Member</label>
                  <Select id="pt-member" value={pickMember} onChange={e=>setPickMember(e.target.value)}>
                    <option value="">Choose someone&hellip;</option>
                    {pickable.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <label style={label} htmlFor="pt-goal">What are they working towards?</label>
                  <Input id="pt-goal" value={goal} placeholder="First pull-up" onChange={e=>setGoal(e.target.value)}/>
                </div>
                <button onClick={addClient} data-tap style={primary}><Plus size={14}/> Add client</button>
              </div>
            )}
            {addErr && <p style={{...note,color:"var(--text)",marginTop:"10px"}} role="alert">{addErr}</p>}
          </div>

          {/* ── The list ─────────────────────────────────────────────────── */}
          {rows.length > 0 && (
            <div style={card} data-testid="pt-list">
              <div style={h}>Clients</div>
              <p style={{...note,margin:"4px 0 12px"}}>
                Ordered the way a coach reads a day: training first, whoever is booked soonest at
                the top, then the ones still needing a decision.
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {rows.map(r => (
                  <button key={r.id} onClick={()=>setSelectedId(r.id === selectedId ? "" : r.id)}
                    aria-label={`${r.name || "Client"} — ${r.parq.label}`}
                    style={{textAlign:"left",width:"100%",padding:"11px 13px",borderRadius:"10px",cursor:"pointer",
                            border:`1px solid ${r.id===selectedId?"var(--accent)":"var(--border)"}`,
                            background:r.id===selectedId?"color-mix(in srgb, var(--accent) 10%, transparent)":"var(--bg)",
                            display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:"140px"}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>
                        {r.orphan
                          /* Never a blank name: a nameless row reads as a
                             rendering bug and gets ignored, and this one is a
                             real state — the member was erased under PDPA and
                             the cascade knows nothing about this local ledger. */
                          ? "Member record deleted"
                          : (r.name || "Unnamed member")}
                      </div>
                      <div style={{fontSize:"11px",color:"var(--muted)"}}>
                        {r.goal || "No goal recorded"}
                        {r.status !== "active" && ` · ${PT_CLIENT_STATUS_LABEL[r.status]}`}
                      </div>
                    </div>
                    <ParqChip status={r.parq}/>
                    <div style={{fontSize:"11px",color:"var(--muted)",minWidth:"104px",textAlign:"right"}}>
                      {r.nextPlanned ? `Next ${r.nextPlanned}` : r.lastDone ? `Last ${r.lastDone}` : "Nothing booked"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── One client ───────────────────────────────────────────────── */}
          {selected && (
            <div style={card} data-testid="pt-detail">
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"10px",flexWrap:"wrap"}}>
                <div style={h}>{selected.orphan ? "Member record deleted" : (selected.name || "Unnamed member")}</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>
                  {selected.startedAt ? `1:1 since ${selected.startedAt}` : "No start date recorded"}
                  {` · ${selected.sessionsDone} delivered`}
                </div>
              </div>

              {/* ── The gate, stated before anything that depends on it ───── */}
              <div style={{marginTop:"12px",padding:"12px",borderRadius:"10px",background:"var(--bg)",
                           border:`1px solid ${selected.parq.blocksLoad ? "var(--danger-border)" : "var(--border)"}`}}
                   data-testid="pt-parq-state">
                <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                  {selected.parq.blocksLoad
                    ? <ShieldAlert size={15} color="var(--danger)"/>
                    : <ShieldCheck size={15} color="var(--green)"/>}
                  <span style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>Health screen: {selected.parq.label}</span>
                </div>
                <p style={{...note,marginTop:"6px"}}>{selected.parq.reason}</p>
                {onNavigate && (
                  <button onClick={()=>onNavigate("pt-parq", { memberId: selected.memberId })} data-tap
                    style={{...ghost,marginTop:"10px"}}>
                    {selected.parq.state === "unscreened" ? "Start health screen" : "Open health screen"}
                  </button>
                )}
              </div>

              {/* ── Plan a session ───────────────────────────────────────────
                  Rendered as a REFUSAL WITH A REASON, not hidden. A form that
                  vanishes teaches nothing; a coach who cannot see why they may
                  not program will look for another way to do it. */}
              <div style={{marginTop:"16px"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"8px"}}>Plan a 1:1 session</div>
                {selected.parq.blocksLoad ? (
                  <p style={note} data-testid="pt-plan-locked">{describeLoadGate(selected.parq)}</p>
                ) : (
                  <>
                    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"140px 1fr",gap:"10px"}}>
                      <div>
                        <label style={label} htmlFor="pt-date">Date</label>
                        <Input id="pt-date" type="date" value={planDate} onChange={e=>setPlanDate(e.target.value)}/>
                      </div>
                      <div>
                        <label style={label} htmlFor="pt-plan-name">Session name</label>
                        <Input id="pt-plan-name" value={planName} placeholder={draft?.name || "Pull strength"} onChange={e=>setPlanName(e.target.value)}/>
                      </div>
                    </div>
                    <div style={{marginTop:"10px"}}>
                      <label style={label} htmlFor="pt-plan-notes">Notes for this session</label>
                      <Input id="pt-plan-notes" value={planNotes} placeholder="Cue the left knee on split squats" onChange={e=>setPlanNotes(e.target.value)}/>
                    </div>
                    {/* The Builder draft, named rather than implied. A checkbox
                        saying "use the current draft" with nothing saying WHICH
                        draft is a coach guessing what they are about to attach. */}
                    <label style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"12px",cursor:draft?"pointer":"default"}}>
                      <input type="checkbox" checked={!!draft && useDraft} disabled={!draft} onChange={e=>setUseDraft(e.target.checked)}/>
                      <span style={{fontSize:"12px",color:draft?"var(--text)":"var(--muted)"}}>
                        {draft
                          ? `Attach the Builder's current plan — ${draft.name || "Untitled"}, ${draft.stages.length} stage${draft.stages.length===1?"":"s"}, ${sessionMinutes(draft.stages)} min`
                          : "No plan open in the Builder to attach"}
                      </span>
                    </label>
                    <div style={{display:"flex",gap:"10px",marginTop:"12px",flexWrap:"wrap"}}>
                      <button onClick={plan} data-tap style={primary}><CalendarPlus size={14}/> Plan session</button>
                    </div>
                    {planErr && <p style={{...note,color:"var(--text)",marginTop:"10px"}} role="alert">{planErr}</p>}
                  </>
                )}
              </div>

              {/* ── This client's sessions ───────────────────────────────── */}
              <div style={{marginTop:"18px"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"8px"}}>Sessions</div>
                {(() => {
                  const mine = sessionsForClient(sessions, selected.id);
                  if (!mine.length) return <p style={note}>Nothing planned or delivered yet.</p>;
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                      {mine.map(s => (
                        <div key={s.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 11px",
                                                borderRadius:"9px",border:"1px solid var(--border)",background:"var(--bg)",flexWrap:"wrap"}}>
                          <button onClick={()=>setSessions(store.togglePtSessionDone(s.id))} data-tap
                            aria-label={s.status === "done" ? `Mark ${s.planName} as not delivered` : `Mark ${s.planName} as delivered`}
                            style={{width:"20px",height:"20px",flexShrink:0,borderRadius:"6px",cursor:"pointer",
                                    display:"flex",alignItems:"center",justifyContent:"center",
                                    border:`1px solid ${s.status==="done"?"var(--green)":"var(--border)"}`,
                                    background:s.status==="done"?"var(--green)":"transparent"}}>
                            {s.status === "done" && <Check size={13} color="var(--on-green)"/>}
                          </button>
                          <div style={{flex:1,minWidth:"120px"}}>
                            <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)"}}>{s.planName}</div>
                            <div style={{fontSize:"11px",color:"var(--muted)"}}>
                              {s.date}
                              {s.stages ? ` · ${s.stages.length} stage${s.stages.length===1?"":"s"} · ${sessionMinutes(s.stages)} min` : " · no plan attached"}
                              {s.notes ? ` · ${s.notes}` : ""}
                            </div>
                          </div>
                          {/* Loading a delivered session back into the Builder is
                              how the 1:1 lens reaches the Runner: the Runner runs
                              whatever the Builder holds, and this is a session
                              that was prescribed to this person. */}
                          {s.stages && onLoadSession && (
                            <button onClick={()=>onLoadSession({ name: s.planName, stages: s.stages })} style={ghost}>Open in Builder</button>
                          )}
                          {s.status !== "done" && (
                            <button onClick={()=>removeSession(s)} data-tap aria-label={`Remove ${s.planName}`}
                              style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger)",display:"flex",padding:"4px"}}>
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* ── Details (D6) ─────────────────────────────────────────────
                  Read-only until asked for, like the roster row. Every field is
                  shown even when empty, and says so in words: "No goal recorded"
                  is information, a blank is an unanswered question. */}
              <div style={{marginTop:"18px"}} data-testid="pt-details">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px",flexWrap:"wrap",marginBottom:"8px"}}>
                  <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>Details</div>
                  <button data-tap style={ghost}
                    onClick={()=> editId === selected.id ? setEditId(null) : startEdit(selected)}>
                    {editId === selected.id ? "Cancel" : "Edit details"}
                  </button>
                </div>

                {editId === selected.id ? (
                  <>
                    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"10px"}}>
                      <div>
                        <label style={label} htmlFor="pt-edit-goal">Working towards</label>
                        <Input id="pt-edit-goal" value={detail.goal} placeholder="First pull-up"
                          onChange={e=>setDetail(d=>({...d,goal:e.target.value}))}/>
                      </div>
                      <div>
                        <label style={label} htmlFor="pt-edit-coach">Coach</label>
                        <Input id="pt-edit-coach" value={detail.coachName} placeholder="Who runs these sessions"
                          list="pt-coach-names"
                          onChange={e=>setDetail(d=>({...d,coachName:e.target.value}))}/>
                        <datalist id="pt-coach-names">
                          {coachNames.map(n => <option key={n} value={n}/>)}
                        </datalist>
                      </div>
                      <div>
                        <label style={label} htmlFor="pt-edit-started">1:1 since</label>
                        <Input id="pt-edit-started" type="date" value={detail.startedAt}
                          onChange={e=>setDetail(d=>({...d,startedAt:e.target.value}))}/>
                      </div>
                    </div>
                    <div style={{marginTop:"10px"}}>
                      <label style={label} htmlFor="pt-edit-notes">Notes about this client</label>
                      <textarea id="pt-edit-notes" value={detail.notes}
                        onChange={e=>setDetail(d=>({...d,notes:e.target.value}))}
                        placeholder="Anything a coach picking this up would need to know"
                        style={{padding:"9px 12px",background:"var(--navy)",border:"1px solid var(--border)",
                                borderRadius:"6px",color:"var(--text)",fontSize:"13px",outline:"none",width:"100%",
                                boxSizing:"border-box",minHeight:"64px",resize:"vertical",fontFamily:"inherit"}}/>
                    </div>
                    <button onClick={()=>saveDetail(selected.id)} style={{...primary,marginTop:"10px"}} data-tap>
                      <Check size={13}/> Save details
                    </button>
                  </>
                ) : (
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"8px 16px"}}>
                    <div><span style={label}>Working towards</span>
                      <span style={{fontSize:"12px",color:"var(--text)"}}>{selected.goal || "No goal recorded"}</span></div>
                    <div><span style={label}>Coach</span>
                      <span style={{fontSize:"12px",color:"var(--text)"}}>{selected.coachName || "Nobody named"}</span></div>
                    <div><span style={label}>1:1 since</span>
                      <span style={{fontSize:"12px",color:"var(--text)"}}>{selected.startedAt || "No start date recorded"}</span></div>
                    <div style={{gridColumn:isMobile?"auto":"1 / -1"}}><span style={label}>Notes</span>
                      <span style={{fontSize:"12px",color:"var(--text)",whiteSpace:"pre-wrap"}}>{selected.notes || "None"}</span></div>
                  </div>
                )}
              </div>

              {/* ── Status ───────────────────────────────────────────────────
                  Three states and no delete, matching the roster's own rule: the
                  sessions delivered under a 1:1 relationship are the record of
                  work the gym was paid for, and a trash icon beside a name is how
                  a gym loses it. */}
              <div style={{marginTop:"18px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                <label style={{...label,marginBottom:0}} htmlFor="pt-status">This relationship</label>
                <Select id="pt-status" value={selected.status} onChange={e=>setStatus(selected.id, e.target.value)} style={{width:"auto",minWidth:"150px"}}>
                  {PT_CLIENT_STATUSES.map(s => <option key={s} value={s}>{PT_CLIENT_STATUS_LABEL[s]}</option>)}
                </Select>
                <span style={{fontSize:"11px",color:"var(--muted)"}}>Ending a 1:1 keeps every session on this page.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The status chip. Reads `label`, never `state` — the state strings are storage
// (`gp_cleared`), and `rawValueScan.js` exists because a stored value reaching a
// human as-is is how a coach came to read a database key as the name of their
// own class type.
//
// The colour is a BORDER and a dot, not the text: `--danger` is #EF4444, which
// on a light gym palette reads at 3.8:1 against a white card — below AA for body
// text. The word carries `--text` so it is legible on every skin a gym can build.
function ParqChip({ status }) {
  const bad = status.blocksLoad;
  return (
    <span data-testid="pt-parq-chip"
      style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"4px 9px",borderRadius:"999px",
              border:`1px solid ${bad ? "var(--danger-border)" : "var(--border)"}`,
              background:"var(--card)",fontSize:"11px",fontWeight:"700",color:"var(--text)",whiteSpace:"nowrap"}}>
      <span aria-hidden="true" style={{width:"7px",height:"7px",borderRadius:"50%",flexShrink:0,
                   background:bad ? "var(--danger)" : "var(--green)"}}/>
      {status.label}
    </span>
  );
}
