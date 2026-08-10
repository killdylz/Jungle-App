// ─── Members / roster (AUDIT-FINDINGS §3.1, decomposition stage 2) ───────────
// A leaf screen: `onBack` in, everything else imported.
//
// This is the owner's morning screen — the at-risk list and the "why" behind
// each flag — so its imports are the retention and check-in libraries rather
// than anything visual. M1 (roster CRUD) is still open: it reads but cannot
// edit, with no member status and no joined date.
//
// Lifted from App.jsx unchanged.

import { useState, useEffect } from "react";
import * as store from "../lib/store.js";
import { MEMBER_STATUSES, MEMBER_STATUS_LABEL, memberStatus } from "../lib/store.js";
import { retentionSummary, describeRetention, applyRetentionActions } from "../lib/retention.js";
import { membershipPrice, revenueAtRisk, describeRevenueAtRisk, fmtMoney } from "../lib/revenueAtRisk.js";
import { winBackLink, winBackBlockedReason } from "../lib/winback.js";
import { analyzeAttendanceCsv, describeImport } from "../lib/csvImport.js";
import { getLibrary } from "../lib/libraryAccess.js";
import { memberCsv, rosterCsv, memberCsvFilename, rosterCsvFilename } from "../lib/csvExport.js";
import { p6Summary, P6_TARGET_SEC, describeCheckinSpeed } from "../lib/checkinMetrics.js";
import { useWindowWidth, Btn, StatCard } from "../ui/primitives.jsx";
// NOTE: `lint:crash` CANNOT see these. `no-undef` resolves plain identifiers but
// not JSX element names, so a missing icon import compiles, lints clean, and
// throws `ReferenceError` the moment a coach opens the screen. That is exactly
// what happened here — the extraction shipped a dead Members panel past a green
// gate. The e2e added alongside this commit is what actually catches it.
import { ArrowLeft, Check, Upload, Download } from "lucide-react";

const EMPTY_FORM = { name: "", email: "", joinedAt: "", status: "active" };

export function RosterScreen({ onBack, onNavigate }) {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const [members, setMembers] = useState(() => store.getMembers());
  const [attendance, setAttendance] = useState(() => store.getAttendance());
  const [classes, setClasses] = useState(() => store.getClassInstances());
  const [p6, setP6] = useState(() => p6Summary());
  const [csv, setCsv] = useState("");
  const [dayFirst, setDayFirst] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState("");
  const [actions, setActions] = useState(() => store.getRetentionActions());
  const [showHandled, setShowHandled] = useState(false);
  const [editId, setEditId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    let alive = true;
    store.hydrateAttendance().then(r => {
      if (!alive || !r) return;
      setMembers(r.members); setAttendance(r.attendance); setClasses(r.classInstances);
      if (r.retentionActions) setActions(r.retentionActions);
    });
    return () => { alive = false; };
  }, []);

  // ── At-risk (N3) — the rules engine finally gets a surface ────────────────
  // Arithmetic, not a model: every flag carries the numbers that produced it so
  // the operator can argue with it rather than merely believe it.
  const retention = retentionSummary(members, attendance);
  const { active: atRiskActive, handled: atRiskHandled } =
    applyRetentionActions(retention.flags, actions, attendance);
  const act = (flag, action) =>
    setActions(store.recordRetentionAction({ memberId: flag.memberId, rule: flag.rule, action }));
  // The win-back draft is signed by the GYM, because the gym is the sender and
  // the organisation responsible for it. Read from the store rather than
  // threaded as a prop, matching the other components that need branding.
  const branding = store.getGymBranding() || {};
  const gymName = branding.gymName || "";
  // ── The owner's half of this panel ────────────────────────────────────────
  // `null` when the gym has set no membership price, and every render below is
  // gated on it — so a gym without one sees the screen exactly as it was. That
  // absence is the feature, not a gap: a revenue figure is the most quotable
  // thing here, so a guessed one would be the most damaging. See revenueAtRisk.js.
  //
  // Derived from `atRiskActive`, the same list the headline number counts, so the
  // money can never disagree with the count beside it.
  const price = membershipPrice(branding);
  const revenue = revenueAtRisk(atRiskActive, price);
  // The P6 card's whole sentence, verdict included, comes from the library that
  // does the arithmetic — the screen never decides "meets target" itself.
  const speed = describeCheckinSpeed(p6);

  const visitsFor = id => attendance.filter(a => a.memberId === id).length;
  const lastSeen = id => {
    const ts = attendance.filter(a => a.memberId === id).map(a => a.checkedInAt).sort();
    return ts.length ? ts[ts.length - 1].slice(0, 10) : "";
  };
  const term = q.trim().toLowerCase();
  const shown = members
    .filter(m => !term || (m.name || "").toLowerCase().includes(term) || (m.email || "").toLowerCase().includes(term))
    .sort((a, b) => visitsFor(b.id) - visitsFor(a.id) || (a.name || "").localeCompare(b.name || ""));

  const analyze = () => {
    setResult(null);
    setAnalysis(analyzeAttendanceCsv(csv, members, { dayFirst }));
  };
  const apply = () => {
    // The catalogue comes from here rather than from inside the store, so a
    // backfilled class type lands in the same vocabulary the Schedule and the
    // Runner write. See `resolveClassType`.
    const r = store.applyAttendanceImport(analysis, getLibrary());
    setResult(r);
    setAnalysis(null);
    setCsv("");
    setMembers(store.getMembers());
    setAttendance(store.getAttendance());
    setClasses(store.getClassInstances());
    setP6(p6Summary());
  };
  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setCsv(String(reader.result || "")); setAnalysis(null); setResult(null); };
    reader.readAsText(f);
  };

  // ── B5: getting the data back out ─────────────────────────────────────────
  // PDPA gives a member the right to ask what is held about them, and the DPA
  // commits to data return on exit (LEGAL §1). Both are answered with a file the
  // person receiving it can actually read — see csvExport.js for why the
  // per-member shape differs from the roster one.
  const download = (text, filename) => {
    try {
      // text/csv;charset=utf-8 alongside the BOM: between them, Excel, Numbers
      // and Sheets all open a name with an accent in it correctly.
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) { /* a blocked download is not worth breaking the screen over */ }
  };
  const exportRoster = () => download(rosterCsv(members, attendance), rosterCsvFilename(gymName));
  const exportMember = (m) => {
    // `actions` too, not just attendance: the retention ledger is personal data
    // held about this member — the gym's own record of flagging and contacting
    // them — and an access request that returns only what they DID, omitting
    // what was concluded about them, answers the easy half. memberCsv filters it
    // by member id the same way it filters attendance.
    const csv = memberCsv(m, attendance, classes, { gymName, retentionActions: actions });
    if (csv) download(csv, memberCsvFilename(m));
  };

  const card = { border:"1px solid var(--border)", borderRadius:"12px", background:"var(--card)", padding:isMobile?"14px":"18px" };
  const fieldStyle = { padding:"7px 10px", borderRadius:"7px", border:`1px solid var(--border)`, background:"var(--card)", color:"var(--text)", fontSize:"12px", outline:"none", flex:"1 1 140px", minWidth:0 };
  const primaryBtn = { padding:"7px 14px", borderRadius:"7px", border:"none", background:"var(--accent)", color:"var(--on-accent)", fontSize:"12px", fontWeight:"700", cursor:"pointer", flexShrink:0 };
  const ghostBtn   = { padding:"6px 11px", borderRadius:"7px", border:`1px solid var(--border)`, background:"transparent", color:"var(--muted)", fontSize:"11px", fontWeight:"600", cursor:"pointer", flexShrink:0 };

  // ── M1: add / edit ────────────────────────────────────────────────────────
  // The roster was read-only: a name misspelled during a mid-class check-in was
  // permanent, and nobody could be marked as having left — so "members" counted
  // people who quit months ago and the at-risk list flagged them forever.
  const startEdit = (m) => {
    setAdding(false); setFormErr("");
    setEditId(m.id);
    setForm({ name: m.name || "", email: m.email || "", joinedAt: m.joinedAt || "", status: memberStatus(m.status) });
  };
  const cancelForm = () => { setEditId(null); setAdding(false); setFormErr(""); setForm(EMPTY_FORM); };

  const submitEdit = (id) => {
    const res = store.updateMember(id, form);
    if (!res.member) { setFormErr(res.error || "That change could not be saved."); return; }
    setMembers(res.members);
    cancelForm();
  };
  const submitAdd = () => {
    const name = form.name.trim();
    if (!name) { setFormErr("A member needs a name."); return; }
    const res = store.addMember(name, { email: form.email.trim(), joinedAt: form.joinedAt || undefined });
    setMembers(res.members);
    cancelForm();
  };

  // Counted on `status`, not on list length. This is the number an owner reads as
  // "how big is my gym", and including cancelled members makes it a flattering
  // lie that never goes down.
  const activeCount = members.filter(m => memberStatus(m.status) === "active").length;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)"}}>Members</h1>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>Your roster and the attendance history behind it</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px"}}>
        <div style={{maxWidth:"1000px",margin:"0 auto",display:"flex",flexDirection:"column",gap:"18px"}}>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:"12px"}}>
            <StatCard label="MEMBERS" value={String(members.length)}/>
            <StatCard label="CHECK-INS" value={String(attendance.length)}/>
            {/* Only classes that have actually HAPPENED. Publishing a week from
                the Schedule (B4) creates dated occurrences ahead of time, and
                counting those here would make "classes run" climb every time an
                owner published next week — a number that goes up for work not
                yet done is the kind of flattering lie this screen exists to
                avoid. Same reasoning as counting ACTIVE members below. */}
            <StatCard label="CLASSES RUN" value={String(classes.filter(c => !c.startsAt || new Date(c.startsAt) <= new Date()).length)}/>
          </div>

          {/* At-risk (N3). Same honesty rule as the P6 card below: when we cannot
              tell, say so — never a green all-clear over unmeasured data. */}
          <div style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap",marginBottom:"4px"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>Who&rsquo;s slipping away</div>
              <div style={{fontFamily:"var(--display)",fontSize:"26px",fontWeight:"800",
                           color:retention.atRisk==null?"var(--muted)":atRiskActive.length?"var(--accent)":"var(--green)"}}>
                {retention.atRisk == null ? "—" : String(atRiskActive.length)}
              </div>
            </div>
            <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:atRiskActive.length?"12px":"0"}}>
              {describeRetention(retention, { active: atRiskActive.length, handled: atRiskHandled.length })}
            </p>

            {/* ── What it is worth, if the gym has told us ────────────────────
                An owner does not buy "1 member needs attention"; they buy a
                figure they can hold against a subscription price. This is the
                only thing on the screen that was missing to state it.

                MONTHLY recurring revenue, not lifetime value — LTV needs a
                tenure assumption no gym's data has earned yet, and this number
                has to be one the owner can check in their head. So the
                arithmetic sits next to it, exactly as every flag's `reason`
                does: `3 members × S$150/month`.

                Rendered only when `revenue` is non-null, which requires a price
                the owner set AND at least one active flag. `--accent`, not
                `--danger`: this is the panel's own emphasis colour, and the
                figure is a prompt to act, not a destructive control. */}
            {revenue && (
              <div data-testid="revenue-at-risk"
                   style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"10px",flexWrap:"wrap",
                           padding:"10px 12px",marginBottom:"12px",borderRadius:"8px",
                           background:"color-mix(in srgb, var(--accent) 8%, transparent)",
                           border:"1px solid color-mix(in srgb, var(--accent) 22%, transparent)"}}>
                <div style={{fontFamily:"var(--display)",fontSize:"17px",fontWeight:"800",color:"var(--accent)"}}>
                  {fmtMoney(revenue.total, price)}<span style={{fontSize:"12px",fontWeight:"600"}}>/month at risk</span>
                </div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>{describeRevenueAtRisk(revenue, price)}</div>
              </div>
            )}

            {atRiskActive.map(f => (
              <div key={`${f.memberId}:${f.rule}`} style={{padding:"12px 0",borderTop:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"baseline",gap:"8px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>{f.name || "Unnamed member"}</span>
                  <span style={{fontSize:"11px",color:"var(--muted)"}}>
                    last in {f.daysSince} day{f.daysSince===1?"":"s"} ago · {f.visits} visit{f.visits===1?"":"s"}
                    {/* Per flag, and the same figure on every row on purpose:
                        one price per gym is the first cut (per-member pricing is
                        a metering problem — GTM §2), so this is the unit the
                        total is built from rather than a per-member valuation.
                        Repeating it is what makes the total checkable. */}
                    {price && <> · {fmtMoney(price.amount, price)}/mo</>}
                  </span>
                </div>
                {/* The WHY, stated as the rule with its numbers. An operator has to
                    be able to phone a member about this and defend it. */}
                <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.5,margin:"4px 0 8px"}}>{f.reason}</p>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
                  {/* Jungle DRAFTS; the coach sends, from their own WhatsApp, to
                      a contact they pick. The link carries no phone number
                      because Jungle stores none (LEGAL §1). Opening a draft
                      records NOTHING — writing the message is not reaching out,
                      and the ledger has to mean what it says, so "I've reached
                      out" stays a separate, deliberate click. */}
                  {(() => {
                    const m = members.find(x => x.id === f.memberId);
                    const blocked = winBackBlockedReason(m);
                    return blocked ? (
                      <span title={blocked} style={{fontSize:"11px",color:"var(--muted)",maxWidth:"320px",lineHeight:1.4}}>{blocked}</span>
                    ) : (
                      <Btn variant="ghost" onClick={()=>window.open(winBackLink(f, m, gymName), "_blank", "noopener")}
                           style={{padding:"5px 11px"}} title="Opens WhatsApp with a message ready — you choose who it goes to">
                        Draft a WhatsApp
                      </Btn>
                    );
                  })()}
                  <Btn onClick={()=>act(f,"acted")} style={{padding:"5px 11px"}}><Check size={13}/> I&rsquo;ve reached out</Btn>
                  <Btn variant="ghost" onClick={()=>act(f,"dismissed")} style={{padding:"5px 11px"}}>Not a concern</Btn>
                </div>
              </div>
            ))}

            {/* Handled work stays visible rather than vanishing — partly so the
                operator can undo, and partly because "we acted on 9 of 11" is the
                measurement A3 actually asks for. */}
            {atRiskHandled.length > 0 && (
              <div style={{marginTop:"12px",paddingTop:"12px",borderTop:"1px solid var(--border)"}}>
                <button onClick={()=>setShowHandled(s=>!s)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px"}}>
                  {showHandled ? "Hide" : "Show"} handled · {atRiskHandled.length}
                </button>
                {showHandled && atRiskHandled.map(f => (
                  <div key={`${f.memberId}:${f.rule}`} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 0",flexWrap:"wrap"}}>
                    <span style={{flex:1,minWidth:"140px",fontSize:"13px",color:"var(--text)"}}>{f.name || "Unnamed member"}</span>
                    <span style={{fontSize:"11px",color:"var(--muted)"}}>
                      {f.action === "acted" ? "Reached out" : "Not a concern"}
                      {f.actionAt ? ` · ${new Date(f.actionAt).toLocaleDateString()}` : ""}
                    </span>
                    <button onClick={()=>act(f,"reopened")} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"600",padding:"3px 8px"}}>Undo</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── CSV backfill ───────────────────────────────────────────── */}
          <div style={card}>
            <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>Import attendance history</div>
            <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:"12px"}}>
              Bring past check-ins across from your previous system. A CSV with a <strong>member name
              (or email)</strong> and a <strong>date</strong> is enough; a class name, type and coach
              are used when present. Nothing is written until you review what was read.
            </p>

            <div style={{display:"flex",gap:"10px",alignItems:"center",flexWrap:"wrap",marginBottom:"10px"}}>
              <label style={{display:"inline-flex",alignItems:"center",gap:"7px",padding:"8px 14px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>
                <Upload size={14}/> Choose CSV
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{display:"none"}}/>
              </label>
              <label data-tap style={{display:"inline-flex",alignItems:"center",gap:"7px",fontSize:"12px",color:"var(--muted)",cursor:"pointer"}}>
                <input type="checkbox" checked={dayFirst} onChange={e=>{setDayFirst(e.target.checked); setAnalysis(null);}}/>
                Dates are day/month (e.g. 03/04 = 3 April)
              </label>
            </div>

            <textarea
              value={csv} onChange={e=>{setCsv(e.target.value); setAnalysis(null); setResult(null);}}
              placeholder={"…or paste CSV here:\n\nMember Name,Email,Date,Class\nSarah Chen,sarah@example.com,2026-03-04,Tuesday 6pm"}
              style={{width:"100%",minHeight:"110px",padding:"10px 12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"12px",fontFamily:"ui-monospace,monospace",outline:"none",resize:"vertical"}}
            />

            <div style={{display:"flex",gap:"8px",marginTop:"10px",flexWrap:"wrap"}}>
              {/* Btn's prop is `variant` (default "primary") — passing a bare
                  `primary` leaks an unknown attribute to the DOM. Once a preview
                  exists, Import is the primary action and the other two step back. */}
              <Btn onClick={analyze} variant={analysis?.ok?"ghost":"primary"} disabled={!csv.trim()}
                   style={!csv.trim()?{opacity:.45,cursor:"not-allowed"}:{}}>Read the file</Btn>
              {analysis?.ok && <Btn onClick={apply}>Import {analysis.rows.length} check-in{analysis.rows.length===1?"":"s"}</Btn>}
              {analysis && <Btn variant="ghost" onClick={()=>{setAnalysis(null);setResult(null);}}>Cancel</Btn>}
            </div>

            {/* Preview. Everything the apply will do, before it does any of it. */}
            {analysis && !analysis.ok && (
              <div style={{marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #F5576C55",background:"#F5576C14",fontSize:"12px",color:"var(--text)",lineHeight:1.6}}>
                {analysis.error}
              </div>
            )}
            {analysis?.ok && (
              <div style={{marginTop:"12px",padding:"12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"var(--bg)",fontSize:"12px",color:"var(--text)",lineHeight:1.7}}>
                <div style={{fontWeight:"700",marginBottom:"6px"}}>{describeImport(analysis)}</div>
                {analysis.newMembers.length > 0 && (
                  <div style={{color:"var(--muted)"}}>
                    New members: {analysis.newMembers.slice(0,8).map(m=>m.name).join(", ")}
                    {analysis.newMembers.length>8?` +${analysis.newMembers.length-8} more`:""}
                  </div>
                )}
                {analysis.problems.length > 0 && (
                  <details style={{marginTop:"6px"}}>
                    <summary style={{cursor:"pointer",color:"var(--accent)"}}>{analysis.problems.length} row(s) couldn’t be read — they will be skipped</summary>
                    <div style={{marginTop:"6px",color:"var(--muted)",maxHeight:"140px",overflowY:"auto"}}>
                      {analysis.problems.slice(0,40).map(p => <div key={p.line}>Line {p.line}: {p.why}</div>)}
                    </div>
                  </details>
                )}
              </div>
            )}
            {result?.ok && (
              <div style={{marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #7BE3A455",background:"#7BE3A414",fontSize:"12px",color:"var(--text)",lineHeight:1.6}}>
                Imported <strong>{result.attendance}</strong> check-in{result.attendance===1?"":"s"} across {result.classes} new class{result.classes===1?"":"es"}
                {result.members>0?`, adding ${result.members} member${result.members===1?"":"s"}`:""}.
                {result.duplicates>0?` ${result.duplicates} were already recorded and were skipped.`:""}
              </div>
            )}
          </div>

          {/* ── Roster ─────────────────────────────────────────────────── */}
          <div style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",marginBottom:"12px",flexWrap:"wrap"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>
                Roster · {activeCount}
                {members.length !== activeCount &&
                  <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"7px"}}>
                    ({members.length - activeCount} not active)
                  </span>}
              </div>
              <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search members…"
                  style={{padding:"7px 11px",borderRadius:"7px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"12px",outline:"none",minWidth:"180px"}}/>
                {/* The gym's own copy of its roster. Disabled rather than hidden
                    on an empty roster: an owner evaluating Jungle should be able
                    to see that their data can leave, before they put any in. */}
                <button onClick={exportRoster} disabled={!members.length} data-testid="export-roster"
                  title="Download every member and their visit history as a CSV"
                  style={{...ghostBtn,display:"inline-flex",alignItems:"center",gap:"6px",...(members.length?{}:{opacity:.45,cursor:"not-allowed"})}}>
                  <Download size={12}/> Export CSV
                </button>
                <button onClick={()=>{ setAdding(a=>!a); setEditId(null); setFormErr(""); }}
                  style={{padding:"7px 12px",borderRadius:"7px",border:`1px solid var(--border)`,background:adding?"var(--accent)":"transparent",color:adding?"var(--on-accent)":"var(--text)",fontSize:"12px",fontWeight:"600",cursor:"pointer"}}>
                  {adding ? "Cancel" : "Add member"}
                </button>
              </div>
            </div>

            {/* Add. Only a name is required — the same bar as the mid-class
                quick-add, because a roster the owner refuses to start is worse
                than one with blank emails. */}
            {adding && (
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center",padding:"10px",borderRadius:"8px",background:"var(--bg)",marginBottom:"10px"}}>
                <input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&submitAdd()} placeholder="Name (required)" style={fieldStyle}/>
                <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&submitAdd()} placeholder="Email (optional)" style={fieldStyle}/>
                <input type="date" value={form.joinedAt} onChange={e=>setForm(f=>({...f,joinedAt:e.target.value}))}
                  title="Joined" style={fieldStyle}/>
                <button onClick={submitAdd} style={primaryBtn}>Add</button>
              </div>
            )}
            {formErr && <div style={{fontSize:"12px",color:"#EF4444",marginBottom:"10px"}}>{formErr}</div>}

            {members.length === 0 ? (
              <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6}}>
                No members yet. Import a CSV above, or check people in from the Class Runner —
                a name is all that’s needed and the roster row is created for you.
              </p>
            ) : shown.length === 0 ? (
              <p style={{fontSize:"12px",color:"var(--muted)"}}>No member matches “{q}”.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                {shown.slice(0, 200).map(m => editId === m.id ? (
                  /* ── Editing ── an inline row, not a modal: the owner is
                     usually correcting a name they can see misspelled in the
                     list, and a dialog would hide the thing being compared. */
                  <div key={m.id} style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center",padding:"10px",borderRadius:"7px",background:"var(--bg)",border:`1px solid var(--accent)`}}>
                    <input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                      onKeyDown={e=>{ if(e.key==="Enter") submitEdit(m.id); if(e.key==="Escape") cancelForm(); }}
                      placeholder="Name" style={fieldStyle}/>
                    <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                      onKeyDown={e=>{ if(e.key==="Enter") submitEdit(m.id); if(e.key==="Escape") cancelForm(); }}
                      placeholder="Email" style={fieldStyle}/>
                    <input type="date" value={form.joinedAt} onChange={e=>setForm(f=>({...f,joinedAt:e.target.value}))}
                      title="Joined" style={fieldStyle}/>
                    {/* Options come from MEMBER_STATUSES, never spelled inline —
                        members.status is CHECK-constrained and this dropdown is
                        exactly where a value the DB rejects would be born. */}
                    <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                      title="Status" style={{...fieldStyle,cursor:"pointer",flex:"0 0 auto"}}>
                      {MEMBER_STATUSES.map(s => <option key={s} value={s}>{MEMBER_STATUS_LABEL[s]}</option>)}
                    </select>
                    <button onClick={()=>submitEdit(m.id)} style={primaryBtn}>Save</button>
                    <button onClick={cancelForm} style={ghostBtn}>Cancel</button>
                  </div>
                ) : (
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 10px",borderRadius:"7px",background:"var(--bg)",opacity:m.status&&m.status!=="active"?0.62:1}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {m.name||"(no name)"}
                        {/* Only NON-active states are badged. Tagging every row
                            "active" is noise on the common case. */}
                        {m.status && m.status !== "active" && (
                          <span style={{marginLeft:"7px",fontSize:"9px",fontWeight:"800",letterSpacing:"0.5px",textTransform:"uppercase",padding:"2px 6px",borderRadius:"4px",border:`1px solid var(--border)`,color:"var(--muted)"}}>
                            {MEMBER_STATUS_LABEL[m.status] || m.status}
                          </span>
                        )}
                      </div>
                      {m.email&&<div style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.email}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"var(--accent)"}}>{visitsFor(m.id)}</div>
                      <div style={{fontSize:"10px",color:"var(--muted)"}}>{lastSeen(m.id)||"never"}</div>
                    </div>
                    {/* aria-label, not title: a title does NOT override text
                        content for the accessible name, so every one of these
                        buttons announced itself as just "Edit" — indistinguishable
                        in a 200-row roster to a screen reader, and ambiguous to
                        any test. The label names who is being edited. */}
                    {/* One member's own record, for when they ask what is held
                        about them (PDPA access). aria-label for the same reason
                        as Edit below: `title` does NOT override text content for
                        an accessible name, so 200 rows would all announce
                        themselves as "Data". */}
                    <button onClick={()=>exportMember(m)} aria-label={`Download ${m.name||"member"}'s data`}
                      title={`Download everything held about ${m.name||"this member"}`}
                      style={{...ghostBtn,display:"inline-flex",alignItems:"center",gap:"5px"}}>
                      <Download size={11}/> Data
                    </button>
                    <button onClick={()=>startEdit(m)} aria-label={`Edit ${m.name||"member"}`} style={ghostBtn}>Edit</button>
                  </div>
                ))}
                {shown.length > 200 && <p style={{fontSize:"11px",color:"var(--muted)",padding:"8px 10px"}}>Showing the first 200 of {shown.length}.</p>}
              </div>
            )}
          </div>

          {/* ── P6 instrument (I4), MOVED and REWRITTEN ──────────────────────
              It used to sit directly under the at-risk panel — an internal
              engineering threshold, in the middle of the screen that exists to
              show an owner what retention is worth, rendering `—` and `NO DATA`
              on a fresh install. `—` next to `NO DATA` is the visual grammar of a
              broken gauge; an owner reads it as a fault they caused.

              Not deleted: the reason it exists is that an unmeasured design law
              is indistinguishable from a met one, and that reasoning is still
              good. Two things changed instead.

              Position: it is now last. Operational detail about coach time ranks
              below who is leaving, what that costs, and the roster itself. That is
              the ordering an owner reads the screen in.

              Wording: `describeCheckinSpeed` owns it, and names the target as
              JUNGLE'S — which turns an unattributed threshold into a promise the
              owner is entitled to see measured — plus the consequence in coach
              minutes per class, from the gym's own median class size. The empty
              state carries no number, no dash and no verdict at all, so it reads
              as a feature that has not started rather than one that has failed. */}
          <div style={{...card,display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}} data-testid="checkin-speed">
            <div style={{flex:1,minWidth:"200px"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"15px",fontWeight:"700",color:"var(--text)"}}>Check-in speed</div>
              <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginTop:"2px"}}>{speed.detail}</p>
            </div>
            {/* Only rendered once there IS a measurement. The alternative — a
                greyed-out figure — is what read as a fault. */}
            {speed.state !== "unmeasured" && (
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"var(--display)",fontSize:"26px",fontWeight:"800",
                             color:speed.state==="meets"?"var(--green)":"var(--accent)"}}>
                  {p6.medianSec}s
                </div>
                <div style={{fontSize:"10px",letterSpacing:"1px",fontWeight:"600",color:"var(--muted)"}}>
                  {speed.state==="meets"?`UNDER JUNGLE'S ${P6_TARGET_SEC}s`:`OVER JUNGLE'S ${P6_TARGET_SEC}s`}
                </div>
              </div>
            )}
            {/* The empty state names the Class Runner, so it carries the door to
                it. Same rule as the analytics gate: an empty state that says what
                to do and then makes the owner go and find it is a dead end with
                instructions. */}
            {speed.state === "unmeasured" && onNavigate && (
              <button onClick={()=>onNavigate("live")} data-tap
                style={{...ghostBtn,padding:"8px 14px",fontSize:"12px",color:"var(--text)"}}>
                Open the Class Runner
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
