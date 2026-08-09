// ─── N2 · Studio analytics, built on the gym's own rows ──────────────────────
//
// Replaces `MockDisabledScreen` on the `analytics` route. NOT a new surface: the
// route, the nav entries and the `analytics:view` capability all predate this.
//
// ⚠️ `FLAGS.mockAnalytics` stays FALSE and `AnalyticsScreen.jsx` stays dead. That
// screen's KPIs are invented — "1,284 active members", "£412 revenue per class",
// four fabricated churn-risk names — and flipping the flag would ship 24 kB of
// fiction to a paying customer. The flag's own comment keeps it as the layout
// target for this build, which is what it has been used as.
//
// LAZY, and it has to be: `npm run size` had 12.65 kB of StaffApp headroom when
// this was written. Everything numeric lives in `lib/cohorts.js` so this file is
// only markup — which also means the honesty rules are unit-tested rather than
// asserted through a chart.
//
// WHAT THIS SCREEN REFUSES TO DO
// A cohort curve over three members is sampling error with a chart around it. So
// `cohortModel` returns `ready:false` with a sentence naming what is missing, and
// the entire chart is behind that gate. A gym that imported two years of history
// clears it in its first ten minutes; a gym that imported nothing is told what to
// import, and never shown a shape.

import { ArrowLeft } from "lucide-react";
import * as store from "../lib/store.js";
import { useState, useEffect } from "react";
import { cohortModel, describeCohorts, monthLabel, MIN_POINT_N } from "../lib/cohorts.js";
import { useWindowWidth, StatCard } from "../ui/primitives.jsx";

export function RetentionScreen({ onBack, onNavigate }) {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const [members, setMembers] = useState(() => store.getMembers());
  const [attendance, setAttendance] = useState(() => store.getAttendance());

  // Same hydration shape as RosterScreen: local first, server behind it.
  useEffect(() => {
    let alive = true;
    store.hydrateAttendance().then(r => {
      if (!alive || !r) return;
      setMembers(r.members); setAttendance(r.attendance);
    });
    return () => { alive = false; };
  }, []);

  const m = cohortModel(members, attendance);

  const card = { border:"1px solid var(--border)", borderRadius:"12px", background:"var(--card)", padding:isMobile?"14px":"18px" };
  const h = { fontFamily:"var(--display)", fontSize:"15px", fontWeight:"700", color:"var(--text)" };
  const note = { fontSize:"12px", color:"var(--muted)", lineHeight:1.6 };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          {/* "Studio analytics" matches the nav label "Analytics" in all three nav
              arrays. This repo already carries three vocabularies for the Builder
              and it is a documented trap; a fourth was not worth a better title. */}
          <h1 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"22px",fontWeight:"800",color:"var(--text)"}}>Studio analytics</h1>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>How long members stay, from your own attendance</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px"}}>
        <div style={{maxWidth:"1000px",margin:"0 auto",display:"flex",flexDirection:"column",gap:"18px"}}>

          {/* ── The gate ─────────────────────────────────────────────────────
              First thing rendered and the only thing rendered when it fails.
              The sentence carries the number held AND the number needed, because
              "not enough data" leaves an owner unable to tell whether they are
              one member short or a hundred — and therefore unable to decide
              whether importing is worth an afternoon. */}
          {!m.ready ? (
            <div style={card} data-testid="retention-not-ready">
              <div style={h}>Not enough history yet</div>
              <p style={{...note,marginTop:"6px"}}>{m.reason}</p>
              {/* What IS held, so the sentence above is checkable. */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:"12px",marginTop:"14px"}}>
                <StatCard label="MEMBERS ON ROSTER" value={String(m.roster)}/>
                <StatCard label="WITH A CHECK-IN" value={String(m.measured)}/>
                <StatCard label="FULL MONTHS" value={m.window ? String(m.window.months) : "0"}/>
              </div>
              {/* The sentence above names the Members screen; this is the door to
                  it. An empty state that says what to do and then makes the owner
                  go and find it is a dead end with instructions — and on a phone
                  the Members entry is two taps down behind "More". */}
              {onNavigate && (
                <button onClick={()=>onNavigate("member")} data-tap
                  style={{marginTop:"14px",padding:"9px 15px",borderRadius:"8px",border:"none",
                          background:"var(--accent)",color:"var(--on-accent)",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>
                  Import attendance history
                </button>
              )}
            </div>
          ) : <>

            {/* ── The one number an owner quotes ─────────────────────────────
                `null` when the curve never crosses half inside the observed
                window — a projected half-life is precisely the confident wrong
                number this product refuses, and a loyal gym is not a gym whose
                data is broken. */}
            <div style={{...card,display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}} data-testid="retention-headline">
              <div style={{flex:1,minWidth:"220px"}}>
                <div style={h}>How long members stay</div>
                <p style={{...note,marginTop:"2px"}}>
                  {/* "Half of them" was the first draft, and "them" had nothing to
                      refer to at the top of a screen — caught by reading it, not
                      by a test. The subject is named instead. */}
                  {m.halfLifeMonths == null
                    ? `More than half were still training at ${m.horizon} month${m.horizon===1?"":"s"} — the furthest your records reach. There is no half-life to report yet, and Jungle will not estimate one. Measured on ${m.curveOf} members.`
                    : `Half of the ${m.curveOf} members Jungle can measure had stopped by month ${m.halfLifeMonths}. Each of them had ${m.horizon} month${m.horizon===1?"":"s"} to stay or leave.`}
                </p>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"var(--display)",fontSize:"26px",fontWeight:"800",
                             color:m.halfLifeMonths==null?"var(--green)":"var(--accent)"}}>
                  {m.halfLifeMonths == null ? `${m.horizon}m+` : `${m.halfLifeMonths}m`}
                </div>
                <div style={{fontSize:"10px",letterSpacing:"1px",fontWeight:"600",color:"var(--muted)"}}>
                  {m.halfLifeMonths == null ? "STILL OVER HALF" : "HALF GONE BY"}
                </div>
              </div>
            </div>

            {/* ── The curve ─────────────────────────────────────────────────
                One population across every bar, so the line cannot rise — see
                the header of cohorts.js for the defect that rule fixes. The N is
                therefore printed ONCE, above the chart, rather than per bar. */}
            <div style={card} data-testid="retention-curve">
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"10px",flexWrap:"wrap",marginBottom:"4px"}}>
                <div style={h}>Still training, month by month</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>{m.curveOf} members · {m.horizon} months observed</div>
              </div>
              <p style={{...note,marginBottom:"14px"}}>
                Every bar is the same {m.curveOf} members — the ones whose first class was long enough ago
                to have had all {m.horizon} months to stay or leave. A member counts as still training in
                month <em>n</em> if they came back in month <em>n</em> or later.
                {m.curveTooNew > 0 && ` ${m.curveTooNew} newer member${m.curveTooNew===1?" is":"s are"} not on this chart — ${m.curveTooNew===1?"they have":"they have"} not been here long enough to answer the question. ${m.curveTooNew===1?"They appear":"They appear"} in the table below.`}
              </p>

              {/* A column chart in flexbox, not a charting library: the whole
                  screen has to fit in ~12 kB of headroom, and eleven divs with a
                  height are cheaper than any dependency. */}
              <div style={{display:"flex",alignItems:"flex-end",gap:isMobile?"3px":"6px",height:"140px"}}>
                {m.curve.map(p => (
                  <div key={p.offset} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",gap:"4px",height:"100%"}}>
                    <div style={{fontSize:isMobile?"9px":"10px",fontWeight:"700",color:"var(--text)"}}>{p.pct}%</div>
                    <div title={`${p.retained} of ${p.of} still training at month ${p.offset}`}
                      style={{width:"100%",borderRadius:"3px 3px 0 0",minHeight:"2px",
                              height:`${Math.max(2,(p.pct/100)*104)}px`,
                              background:"linear-gradient(to top, color-mix(in srgb, var(--accent) 85%, transparent), color-mix(in srgb, var(--green) 45%, transparent))"}}/>
                    <div style={{fontSize:"9px",color:"var(--muted)"}}>{p.offset === 0 ? "start" : `${p.offset}m`}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Per cohort ────────────────────────────────────────────────
                The pooled curve answers "how long do members stay". This answers
                "is it getting better or worse", which is the one an owner acts
                on. Newest first, because that is the cohort being judged. */}
            <div style={card} data-testid="retention-cohorts">
              {/* The heading names the PERIOD, because "Q4 2025" and "Nov 2025"
                  are different claims and a reader has to know which they are
                  looking at. Quarters appear when a gym is too small for monthly
                  groups to mean anything — see the note in cohorts.js. */}
              <div style={h}>By the {m.period === "quarter" ? "quarter" : "month"} members first appeared</div>
              {/* All of the wording lives in cohorts.js next to the arithmetic
                  that decides it — including which period was used. Two places
                  describing one grouping is how the heading and the prose came to
                  disagree in the first draft. */}
              <p style={{...note,margin:"4px 0 12px"}}>{describeCohorts(m)}</p>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",minWidth:"340px"}}>
                  <thead>
                    <tr>
                      {["First seen","Members","1 month","3 months","6 months"].map((t,i) => (
                        <th key={t} style={{textAlign:i?"right":"left",padding:"6px 8px",borderBottom:"1px solid var(--border)",
                                            fontSize:"10px",letterSpacing:"0.8px",textTransform:"uppercase",color:"var(--muted)",fontWeight:"700",whiteSpace:"nowrap"}}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.cohorts.map(c => (
                      <tr key={c.month}>
                        <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",color:"var(--text)",whiteSpace:"nowrap"}}>{c.label}</td>
                        <td style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",textAlign:"right",color:"var(--muted)"}}>{c.size}</td>
                        {c.points.map(p => (
                          /* An unobservable cell is EMPTY, never 0%. A cohort two
                             months old has no six-month figure, and writing 0
                             there would report a young cohort as a catastrophic
                             one — the single most common way a retention table
                             lies. An en dash with a title saying why. */
                          <td key={p.offset} title={p.pct == null ? `${c.label} is not ${p.offset} months old yet` : undefined}
                              style={{padding:"7px 8px",borderBottom:"1px solid var(--border)",textAlign:"right",
                                      color:p.pct==null?"var(--muted)":"var(--text)",fontWeight:p.pct==null?"400":"600"}}>
                            {p.pct == null ? "—" : `${p.pct}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Cohorts smaller than the curve's own threshold are still listed —
                  hiding a thin month would make the table disagree with the
                  member count above it — but the reader is told which they are. */}
              {m.cohorts.some(c => c.size < MIN_POINT_N) && (
                <p style={{...note,marginTop:"10px",fontSize:"11px"}}>
                  A month with fewer than {MIN_POINT_N} members moves in big steps — each person is a large
                  slice of the percentage. Read those rows as a direction, not a measurement.
                </p>
              )}
            </div>

            {/* ── What this is NOT ─────────────────────────────────────────
                The definition, in the owner's words, on the screen rather than
                only in a comment. A cohort here is the month a member first
                appears in the records — which is NOT their join date, because
                `applyAttendanceImport` writes no join date for an imported
                member. Saying so is what keeps the number honest; an owner who
                thinks these are join dates would draw wrong conclusions from a
                perfectly correct chart. */}
            <div style={{...card,background:"var(--bg)"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:"8px"}}>How this is counted</div>
              <ul style={{...note,paddingLeft:"18px",display:"flex",flexDirection:"column",gap:"5px"}}>
                <li>A member&rsquo;s month is the one they <strong>first appear in your records</strong> — not the day they joined. Imported history carries no join dates, so this is the honest version of the question.</li>
                <li>Members who cancelled or paused are <strong>included</strong>. Leaving them out would measure the retention of the people who stayed and call it everyone&rsquo;s.</li>
                <li>The current month is left out until it finishes, so nobody counts as lapsed for not yet training this week.</li>
                {m.censoredMonth != null && (
                  <li>{monthLabel(m.censoredMonth)} is excluded: it is where your imported history starts, so every member already training then is indistinguishable from a brand-new one.</li>
                )}
              </ul>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
