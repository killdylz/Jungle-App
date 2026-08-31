// ─── Health screen (PAR-Q) — F2's gap 1, closed ─────────────────────────────
//
// The As-Built spec has said the same thing about this screen since it was
// written: "⛔ not built… it must land in the same change that introduces
// [individualised load], not after." The 1:1 lens beside this file IS that
// individualised load, so this is that change.
//
// 🔴 THE ONE THING THIS SCREEN MUST NEVER DO is give a verdict about a person.
// Every claim it makes is procedural — what was asked, what was answered, when,
// and whether a coach has recorded a doctor's clearance. A "yes" here means
// *speak to a doctor*, never "you are unfit" and never "you are cleared". The
// disclaimer is a constant in `lib/parq.js` so there is exactly one copy of it,
// and `parqStatus` decides the state so this file cannot invent a sixth one.
//
// The questions are the classic PAR-Q, reproduced in the industry's own words.
// A reworded health question is a different question, and these answers are kept
// as a dated record a coach may one day have to stand behind.

import { useState, useMemo } from "react";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import * as store from "../../lib/store.js";
import {
  PARQ_QUESTIONS, PARQ_DISCLAIMER, PARQ_VALID_MONTHS,
  newParqAnswers, answeredCount, parqStatus, latestParq,
} from "../../lib/parq.js";
import { ptClientRows } from "../../lib/ptClients.js";
import { useWindowWidth, Input, Select } from "../../ui/primitives.jsx";
import { useToast } from "../../ui/toast.jsx";

const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function ParqScreen({ onBack, onNavigate, memberId: initialMemberId = "" }) {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const { toast } = useToast();

  const [members] = useState(() => store.getMembers());
  const [clients] = useState(() => store.getPtClients());
  const [parqs, setParqs] = useState(() => store.getParqRecords());
  const [memberId, setMemberId] = useState(initialMemberId);
  const [answers, setAnswers] = useState(newParqAnswers);
  const [screenedAt, setScreenedAt] = useState(today);
  const [screenedBy, setScreenedBy] = useState("");
  const [clearanceAt, setClearanceAt] = useState("");
  const [clearanceNote, setClearanceNote] = useState("");
  const [err, setErr] = useState("");

  const rows = useMemo(
    () => ptClientRows(clients, members, parqs, [], { now: new Date() }),
    [clients, members, parqs]);
  const row = rows.find(r => r.memberId === memberId) || null;
  const onFile = latestParq(parqs, memberId);
  const onFileStatus = memberId ? parqStatus(onFile, { now: new Date() }) : null;

  // The status of what is on SCREEN, which is not yet what is on file. A coach
  // half way through the form needs to see where the answers are heading — and
  // in particular that a "yes" leads to a conversation, not a rejection — before
  // they commit the record.
  const draftStatus = parqStatus({ screenedAt, answers, clearance: null }, { now: new Date() });
  const answered = answeredCount(answers);
  const complete = answered === PARQ_QUESTIONS.length;

  const card = { border:"1px solid var(--border)", borderRadius:"12px", background:"var(--card)", padding:isMobile?"14px":"18px" };
  const h = { fontFamily:"var(--display)", fontSize:"15px", fontWeight:"700", color:"var(--text)" };
  const note = { fontSize:"12px", color:"var(--muted)", lineHeight:1.6 };
  const label = { fontSize:"10px", fontWeight:"700", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"1px", display:"block", marginBottom:"5px" };
  const primary = { padding:"9px 15px", borderRadius:"8px", border:"none", background:"var(--accent)", color:"var(--on-accent)", fontSize:"12px", fontWeight:"700", cursor:"pointer" };
  const ghost = { padding:"8px 13px", borderRadius:"8px", border:"1px solid var(--border)", background:"transparent", color:"var(--text)", fontSize:"12px", fontWeight:"600", cursor:"pointer" };

  const answer = (id, value) => setAnswers(a => ({ ...a, [id]: value }));

  const save = () => {
    if (!memberId) { setErr("Choose whose health screen this is."); return; }
    if (!complete) { setErr(`${PARQ_QUESTIONS.length - answered} question${PARQ_QUESTIONS.length - answered === 1 ? " is" : "s are"} still unanswered. A part-answered screen is not a screen.`); return; }
    const list = store.appendParqRecord({ memberId, answers, screenedAt, screenedBy });
    setParqs(list); setErr("");
    setAnswers(newParqAnswers());
    toast("Health screen recorded");
  };

  const recordClearance = () => {
    if (!onFile) { setErr("There is no health screen to attach a clearance to yet."); return; }
    if (!clearanceAt) { setErr("A clearance needs the date the doctor gave it."); return; }
    // Appended against the SAME answers, not edited onto the old row. The ledger
    // is append-only: last year's record is what the coach acted on last year.
    const list = store.appendParqRecord({
      memberId, answers: onFile.answers, screenedAt: onFile.screenedAt,
      screenedBy: onFile.screenedBy, note: onFile.note,
      clearance: { grantedAt: clearanceAt, note: clearanceNote },
    });
    setParqs(list); setErr(""); setClearanceAt(""); setClearanceNote("");
    toast("Doctor’s clearance recorded");
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)"}}>Health Screen</h1>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>The seven PAR-Q questions, before anyone is programmed for individually</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px"}}>
        <div style={{maxWidth:"820px",margin:"0 auto",display:"flex",flexDirection:"column",gap:"18px"}}>

          {/* ── What this is, before a single question ─────────────────────── */}
          <div style={{...card,background:"var(--bg)"}} data-testid="parq-disclaimer">
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:"8px"}}>Read this first</div>
            <p style={note}>{PARQ_DISCLAIMER}</p>
            <p style={{...note,marginTop:"6px"}}>
              A &ldquo;yes&rdquo; is not a refusal. It means the client should speak to a doctor before a
              personalised programme, and that you record what the doctor said here. A screen is
              good for {PARQ_VALID_MONTHS} months, because health changes.
            </p>
          </div>

          {/* ── Whose screen is this ────────────────────────────────────────
              A questionnaire with no name attached is a form, not a record, so
              this comes before the questions rather than under a Save button. */}
          <div style={card} data-testid="parq-who">
            <div style={h}>Whose screen is this?</div>
            {!rows.length ? (
              <>
                <p style={{...note,marginTop:"6px"}}>
                  A health screen belongs to a 1:1 client, and you have none yet. Add one first &mdash;
                  the screen is what unlocks planning individual sessions for them.
                </p>
                {onNavigate && <button onClick={()=>onNavigate("pt")} data-tap style={{...primary,marginTop:"12px"}}>Go to 1:1 Clients</button>}
              </>
            ) : (
              <div style={{marginTop:"10px"}}>
                <label style={label} htmlFor="parq-client">Client</label>
                <Select id="parq-client" value={memberId} onChange={e=>{ setMemberId(e.target.value); setAnswers(newParqAnswers()); setErr(""); }}>
                  <option value="">Choose a client&hellip;</option>
                  {rows.map(r => <option key={r.id} value={r.memberId}>{r.orphan ? "Member record deleted" : (r.name || "Unnamed member")}</option>)}
                </Select>
                {onFileStatus && (
                  <div style={{marginTop:"12px",padding:"11px",borderRadius:"10px",background:"var(--bg)",
                               border:`1px solid ${onFileStatus.blocksLoad ? "var(--danger-border)" : "var(--border)"}`}}
                       data-testid="parq-on-file">
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                      {onFileStatus.blocksLoad
                        ? <ShieldAlert size={15} color="var(--danger)"/>
                        : <ShieldCheck size={15} color="var(--green)"/>}
                      <span style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>On file: {onFileStatus.label}</span>
                    </div>
                    <p style={{...note,marginTop:"6px"}}>{onFileStatus.reason}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── The questions ───────────────────────────────────────────────
              Real <button>s with `aria-pressed`, not a styled <div>. This repo
              found three unreachable skin presets exactly because clicking by
              TEXT works on a div while `keyboard.spec.js` sweeps by ROLE — the
              workaround that makes a test pass is what hides the defect. */}
          {memberId && (
            <div style={card} data-testid="parq-questions">
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"10px",flexWrap:"wrap"}}>
                <div style={h}>The seven questions</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>{answered} of {PARQ_QUESTIONS.length} answered</div>
              </div>
              <p style={{...note,margin:"4px 0 14px"}}>
                Ask them out loud and record what you hear. Leaving one blank is not the same as a
                &ldquo;no&rdquo;, and Jungle treats it as unanswered.
              </p>

              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {PARQ_QUESTIONS.map((q, i) => (
                  <div key={q.id} style={{padding:"11px 13px",borderRadius:"10px",border:"1px solid var(--border)",background:"var(--bg)",
                                          display:"flex",gap:"12px",alignItems:"flex-start",flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:"200px"}}>
                      <div style={{fontSize:"12px",color:"var(--text)",lineHeight:1.5}}>
                        <strong>{i + 1}.</strong> {q.text}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:"6px",flexShrink:0}}>
                      {[["Yes", true], ["No", false]].map(([word, value]) => {
                        const on = answers[q.id] === value;
                        return (
                          <button key={word} onClick={()=>answer(q.id, value)} aria-pressed={on}
                            aria-label={`${word} — ${q.short}`}
                            /* 44px in the BOX, not via a `data-tap` overlay.
                               These sit in fourteen pairs eight pixels apart, and
                               index.css's own warning is that adjacent overlays
                               overlap and steal each other's hit area. A form a
                               coach fills in standing next to a client is also
                               the one place a chunky control is the right
                               design, so the target is real rather than laid on
                               top. */
                            style={{padding:"7px 15px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",
                                    minWidth:"58px",minHeight:"44px",
                                    border:`1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                                    background:on ? "var(--accent)" : "transparent",
                                    color:on ? "var(--on-accent)" : "var(--text)"}}>
                            {word}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"160px 1fr",gap:"10px",marginTop:"14px"}}>
                <div>
                  <label style={label} htmlFor="parq-date">Date screened</label>
                  <Input id="parq-date" type="date" value={screenedAt} onChange={e=>setScreenedAt(e.target.value)}/>
                </div>
                <div>
                  <label style={label} htmlFor="parq-by">Screened by</label>
                  <Input id="parq-by" value={screenedBy} placeholder="Coach name" onChange={e=>setScreenedBy(e.target.value)}/>
                </div>
              </div>

              {/* Where these answers are heading, before they are committed. The
                  state comes from the same function the gate uses, so the preview
                  cannot disagree with the record it is about to write.
                  ⚠️ Hidden until the first answer. On an untouched form it read
                  "0 of 7 questions answered. A part-answered screen is not a
                  screen." — scolding a coach for not having asked anything yet,
                  which is what the form is FOR. Caught by reading the screen. */}
              {answered > 0 && (
                <div style={{marginTop:"14px",padding:"11px",borderRadius:"10px",background:"var(--bg)",border:"1px solid var(--border)"}}
                     data-testid="parq-preview">
                  <p style={note}>{draftStatus.reason}</p>
                </div>
              )}

              <div style={{display:"flex",gap:"10px",marginTop:"14px",flexWrap:"wrap"}}>
                <button onClick={save} data-tap style={primary}>Save health screen</button>
                {onNavigate && <button onClick={()=>onNavigate("pt")} style={ghost}>Back to 1:1 Clients</button>}
              </div>
              {err && <p style={{...note,color:"var(--text)",marginTop:"10px"}} role="alert">{err}</p>}
            </div>
          )}

          {/* ── The doctor's clearance ─────────────────────────────────────
              Only offered where it means something: a screen with a flagged
              answer and no clearance yet. Offering it everywhere would make it
              look like a way to skip the questions. */}
          {onFileStatus && onFileStatus.state === "referred" && (
            <div style={card} data-testid="parq-clearance">
              <div style={h}>Record a doctor&rsquo;s clearance</div>
              <p style={{...note,margin:"4px 0 12px"}}>
                Once {row?.name || "this client"} has spoken to a doctor and been cleared to train,
                record it here with the date they were given it. This does not change their answers &mdash;
                it is appended beside them, and it expires with the screen it belongs to
                ({onFileStatus.expiresOn}).
              </p>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"160px 1fr",gap:"10px"}}>
                <div>
                  <label style={label} htmlFor="parq-clearance-date">Date cleared</label>
                  <Input id="parq-clearance-date" type="date" value={clearanceAt} onChange={e=>setClearanceAt(e.target.value)}/>
                </div>
                <div>
                  <label style={label} htmlFor="parq-clearance-note">What the doctor said</label>
                  <Input id="parq-clearance-note" value={clearanceNote} placeholder="Cleared for resistance training, no overhead loading" onChange={e=>setClearanceNote(e.target.value)}/>
                </div>
              </div>
              <button onClick={recordClearance} data-tap style={{...primary,marginTop:"12px"}}>Record clearance</button>
            </div>
          )}

          {/* ── The ledger ─────────────────────────────────────────────────
              Every screen this client has ever had, newest first. Append-only, so
              this is a history rather than a current value — which is the point:
              a coach may one day have to show what was asked and when. */}
          {memberId && (
            <div style={card} data-testid="parq-history">
              <div style={h}>Screening history</div>
              {(() => {
                const mine = parqs.filter(r => r.memberId === memberId)
                  .sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")));
                if (!mine.length) return <p style={{...note,marginTop:"6px"}}>No health screen on record for this client yet.</p>;
                return (
                  <div style={{overflowX:"auto",marginTop:"10px"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",minWidth:"340px"}}>
                      <thead>
                        <tr>
                          {["Screened", "Flagged", "By", "Clearance"].map((t, i) => (
                            <th key={t} style={{textAlign:i?"right":"left",padding:"6px 8px",borderBottom:"1px solid var(--border)",
                                                fontSize:"10px",letterSpacing:"0.8px",textTransform:"uppercase",color:"var(--muted)",fontWeight:"700",whiteSpace:"nowrap"}}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mine.map(r => {
                          const s = parqStatus(r, { now: new Date() });
                          return (
                            <tr key={r.id}>
                              <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",color:"var(--text)",whiteSpace:"nowrap"}}>{r.screenedAt}</td>
                              <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",textAlign:"right",color:"var(--muted)"}}>
                                {s.flagged.length ? s.flagged.map(q => q.short).join(", ") : "None"}
                              </td>
                              <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",textAlign:"right",color:"var(--muted)"}}>{r.screenedBy || "—"}</td>
                              <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",textAlign:"right",color:"var(--muted)"}}>
                                {r.clearance?.grantedAt || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
