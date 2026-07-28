import { useState, useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
import { Btn } from "../../ui/primitives.jsx";
import { useDialog } from "../../ui/dialog.js";
import * as store from "../../lib/store.js";
import { recordSession as recordCheckinSession } from "../../lib/checkinMetrics.js";
import { fmtOccurrence } from "../../lib/format.js";

// ─── F4 / N1 — coach roster sweep ───────────────────────────────────────────
// The attendance spine's first capture surface. Design law P6: check-in must cost
// under 5 seconds per member, because above that coaches skip it, no attendance
// accumulates, and the whole retention thesis starves (assumption A7 / kill
// criterion #3). Everything here serves that number: one tap to check someone in,
// a filter box that doubles as the quick-add field, and no form.
//
// NOTE ON CONSENT — deliberate omission. A consent_records row with
// method:'notice' asserts that a notice was shown to that member. In a coach
// sweep, none was. Writing one anyway would fabricate a compliance record, which
// is worse than an empty ledger. store.recordConsent() exists and is wired for
// when a real notice surface ships (QR self-check-in's first screen); it is not
// called from here on purpose.
export function CheckInPanel({ sessionName, classType, durationMin, coachName, classInstanceId, scheduledAt, onClose }) {
  // Idempotent by design, so React 19 StrictMode's double-invoke of this
  // initializer resolves to the SAME occurrence rather than minting two.
  //
  // Duration and coach ride along because this row is PERMANENT and nothing
  // later can recover them: the occurrence the runner mints was landing with
  // `duration_min: null` and `coach_name: ''` while the one B4 publishes from
  // the Schedule carried both, so the same class recorded different amounts of
  // itself depending on which door it came through. `coach_name` is denormalised
  // in 0007 precisely so per-coach analysis is possible over it.
  //
  // `classInstanceId` is set when the coach started this class from the Schedule
  // (§3A). It makes the occurrence CHOSEN rather than matched on a name that had
  // no reason to agree with the schedule's — the difference between check-ins
  // landing on the published row and landing on a second row nobody looks at.
  const [ci] = useState(() => store.ensureClassInstance({ name: sessionName, classType, durationMin, coachName, instanceId: classInstanceId }).instance);
  const [members, setMembers]       = useState(() => store.getMembers());
  const [attendance, setAttendance] = useState(() => store.getAttendance());
  const [q, setQ] = useState("");

  // P6 instrumentation (I4). The spec makes ≤5s/member a design law and A7 a kill
  // criterion, and neither was measurable — the product could fail its own kill
  // criterion silently. Refs, not state: recording a timestamp must not re-render
  // the panel a coach is tapping through mid-class.
  const openedAt = useRef(Date.now());
  const stamps   = useRef([]);
  useEffect(() => {
    const opened = openedAt.current, marks = stamps.current;
    // On unmount, not per check-in: one row per class, and no write in the tap path.
    return () => { recordCheckinSession({ classInstanceId: ci.id, openedAt: opened, stamps: marks }); };
  }, [ci.id]);

  // Escape closes through the same id-carrying path as the backdrop click below,
  // so a keyboard exit cannot land the runner's badge on the wrong occurrence.
  const dlg = useDialog(() => onClose(ci.id), "Check in");

  const checkedIn = new Set(attendance.filter(a => a.classInstanceId === ci.id).map(a => a.memberId));
  const term  = q.trim().toLowerCase();
  const shown = members.filter(m => !term || (m.name || "").toLowerCase().includes(term));
  // Offer quick-add only when what's typed isn't already somebody — otherwise the
  // coach creates a duplicate roster row for a member who's simply mis-spelled.
  const canAdd = !!term && !members.some(m => (m.name || "").trim().toLowerCase() === term);

  // Only stamp when a check-in was ACTUALLY added. A double-tap on an
  // already-checked-in member returns added:false, and counting it would inflate
  // the member count with a zero-second gap — flattering the P6 number with work
  // that never happened.
  const check = (m) => {
    const r = store.recordAttendance({ classInstanceId: ci.id, memberId: m.id, source: "coach" });
    if (r.added) stamps.current.push(Date.now());
    setAttendance(r.attendance);
  };

  const quickAdd = () => {
    const name = q.trim();
    if (!name) return;
    const { member, members: next } = store.addMember(name);
    setMembers(next);
    const r = store.recordAttendance({ classInstanceId: ci.id, memberId: member.id, source: "coach" });
    if (r.added) stamps.current.push(Date.now());
    setAttendance(r.attendance);
    setQ("");
  };

  // onClose carries the occurrence id: the runner's badge used to count the LAST
  // row in class_instances, which is only this class by luck — a joined or pinned
  // occurrence sits wherever it was published.
  return (
    <div onClick={()=>onClose(ci.id)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",border:`1px solid var(--border)`,borderRadius:"14px",width:"100%",maxWidth:"460px",maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",outline:"none"}}>
        <div style={{padding:"16px 18px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
            <div>
              <div style={{fontFamily:"var(--display)",fontSize:"17px",fontWeight:"700",color:"var(--text)"}}>Check in</div>
              {/* Names the OCCURRENCE, not the draft. They are the same thing
                  until a coach renames the plan mid-class, and then the honest
                  label is the row the check-ins are actually written to — with
                  its slot, so which occurrence is being joined is visible before
                  anybody is tapped in. */}
              <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
                {[ci.name || sessionName || "Class", scheduledAt ? fmtOccurrence(scheduledAt) : ""].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"var(--display)",fontSize:"22px",fontWeight:"800",color:"var(--accent)"}}>{checkedIn.size}</div>
              <div style={{fontSize:"10px",color:"var(--muted)",letterSpacing:"1px",fontWeight:"600"}}>IN ROOM</div>
            </div>
          </div>
          <input
            autoFocus value={q} onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{ if (e.key==="Enter" && canAdd) quickAdd(); }}
            placeholder="Search or type a new name…"
            style={{width:"100%",marginTop:"12px",padding:"10px 12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"14px",outline:"none"}}
          />
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {canAdd && (
            <button onClick={quickAdd} style={{width:"100%",display:"flex",alignItems:"center",gap:"10px",padding:"13px 12px",marginBottom:"4px",borderRadius:"9px",border:`1px dashed var(--accent)`,background:"transparent",cursor:"pointer",textAlign:"left"}}>
              <Plus size={16} color="var(--accent)"/>
              <span style={{fontSize:"14px",fontWeight:"600",color:"var(--accent)"}}>Add “{q.trim()}” and check in</span>
            </button>
          )}
          {shown.map(m => {
            const inRoom = checkedIn.has(m.id);
            return (
              // 46px tall: a thumb target a coach can hit without looking. P6.
              <button key={m.id} onClick={()=>check(m)} disabled={inRoom}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px",padding:"13px 12px",marginBottom:"4px",borderRadius:"9px",border:`1px solid ${inRoom?"var(--accent)":"var(--border)"}`,background:inRoom?"color-mix(in srgb, var(--accent) 12%, transparent)":"transparent",cursor:inRoom?"default":"pointer",textAlign:"left"}}>
                <span style={{fontSize:"14px",fontWeight:"600",color:"var(--text)"}}>{m.name}</span>
                {inRoom
                  ? <Check size={16} color="var(--accent)"/>
                  : <span style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600"}}>Tap</span>}
              </button>
            );
          })}
          {!shown.length && !canAdd && (
            <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"24px 12px",lineHeight:"1.6"}}>
              {members.length
                ? "No one matches that name."
                : "No members yet — type a name above to add the first one as they walk in."}
            </p>
          )}
        </div>

        <div style={{padding:"12px 18px",borderTop:`1px solid var(--border)`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
          <span style={{fontSize:"11px",color:"var(--muted)"}}>Saved on this device, synced when online</span>
          <Btn variant="ghost" onClick={()=>onClose(ci.id)} style={{padding:"7px 14px"}}>Done</Btn>
        </div>
      </div>
    </div>
  );
}
