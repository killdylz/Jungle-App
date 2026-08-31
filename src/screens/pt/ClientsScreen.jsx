// ─── PT · the trainer's surface ──────────────────────────────────────────────
//
// PT1–PT4 and PT9 in one screen: who your clients are, whether they are screened,
// what they are running, what they lifted, and what that means.
//
// LAZY, and it has to be. `npm run size` had 10.16 kB of StaffApp headroom when
// this was written, and this chunk carries its own budget line in
// scripts/check-size.mjs — an UNLISTED chunk has no ceiling at all, which is the
// trap the size guard's own header warns about.
//
// EVERY NUMBER ON THIS SCREEN COMES FROM lib/progression.js, which is pure and
// unit-tested with its thresholds pinned. Nothing here computes anything. That
// is deliberate and it is the same split RetentionScreen uses: the honesty rules
// are testable arithmetic, and this file is markup that renders a refusal as
// readily as it renders a value.
//
// WHAT THIS SCREEN REFUSES TO DO
//   · It never shows an estimated 1RM without the set it came from.
//   · It never shows an adherence percentage without both numerals.
//   · It never lets a program start without current screening, and when it
//     refuses it says which screening problem and what to do about it.
//   · It never edits a logged set. A correction supersedes; both rows survive.

import { useState } from "react";
import { ArrowLeft, ShieldCheck, ShieldAlert, Smartphone, Plus, Check } from "lucide-react";
import * as store from "../../lib/store.js";
import { useWindowWidth } from "../../ui/primitives.jsx";
import { useToast } from "../../ui/toast.jsx";
import { SESSION_STATUS_LABEL, PROGRAM_STATUS_LABEL } from "../../lib/ptConstants.js";
// setLogsForSession lives in store.js, not here: it reads the local list and is
// part of the seam, while progression.js is pure arithmetic over rows it is
// handed. Importing it from the wrong module fails the BUILD rather than the
// tests, and the size guard then reports the chunk as missing — which is both
// gates behaving correctly on a bad import.
import {
  bestEstimate1RM, personalBests, adherence, volumeByMovement,
} from "../../lib/progression.js";

// ── Copy for every state a number can be in ─────────────────────────────────
// U1: no raw enum reaches a coach, and no refusal reads as an error. Each of
// these says what is MISSING and what would fix it, rather than naming a rule.
const SCREENING_COPY = {
  "never-screened":    "No health screening on file yet.",
  "expired":           "Health screening has expired.",
  "flagged-uncleared": "Screening flagged a health risk — medical clearance needed.",
};
const E1RM_COPY = {
  "no-sets":            "Nothing logged yet.",
  "no-eligible-sets":   "No set yet that a strength estimate can be built from.",
};
const E1RM_SKIP_COPY = {
  "reps-too-high":       "over 10 reps",
  "no-effort-marker":    "no effort recorded",
  "too-far-from-failure":"too far from failure",
  "no-load":             "bodyweight",
  "no-reps":             "no reps",
};

const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px" };
const label = { fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 };
const muted = { color: "var(--muted)", fontSize: "13px" };
const btn = (variant = "primary") => ({
  padding: "9px 14px", borderRadius: "9px", border: variant === "primary" ? "none" : "1px solid var(--border)",
  background: variant === "primary" ? "var(--accent)" : "transparent",
  color: variant === "primary" ? "var(--bg)" : "var(--text)",
  fontWeight: 700, fontSize: "13px", cursor: "pointer",
  // A button in a flex row beside a full-width input gets squeezed to its text's
  // wrap width — "Add programme" broke across two lines at every viewport,
  // including 1280px where there was plenty of room. Neither is a layout bug the
  // e2e can see: the button is found, clicked, and works.
  whiteSpace: "nowrap", flex: "none",
});
const field = { padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", fontSize: "13px", width: "100%", boxSizing: "border-box" };

const dateOf = iso => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export function ClientsScreen({ onBack }) {
  const vw = useWindowWidth();
  const isMobile = vw < 860;
  // Destructured, not held as an object. `useToast()` returns
  // { toast, dismissToast }; calling `toast.show(...)` on it is a silent no-op —
  // every confirmation on this screen would simply never appear, and nothing
  // would fail. e2e/pt.spec.js asserts one of these actually renders.
  const { toast } = useToast();

  // One state bump re-reads every PT domain. These lists are small — a trainer
  // has tens of clients, not thousands — and a single source beats five
  // useStates that can disagree about whether a write landed.
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const members = store.getMembers();
  const programs = store.getPrograms();
  const sessions = store.getPtSessions();
  const setLogs = store.getSetLogs();
  const identities = store.getMemberIdentities();

  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);

  // A "client" is anyone with PT attached to them — a program, a session, or an
  // app invite. Deliberately derived rather than stored: a `isClient` flag on
  // the member row would be a fourth thing to keep in sync, and it would go
  // stale the moment a trainer archived someone's last program.
  const clientIds = new Set([
    ...programs.map(p => p.memberId),
    ...sessions.map(s => s.memberId),
    ...identities.filter(i => !i.revokedAt).map(i => i.memberId),
  ]);
  const clients = members.filter(m => clientIds.has(m.id));
  const selected = clients.find(c => c.id === selectedId) || null;

  const addClient = (memberId) => {
    const r = store.inviteMemberToApp(memberId);
    if (r.ok) { setAdding(false); setSelectedId(memberId); refresh(); toast("Client added"); }
  };

  return (
    <div style={{ padding: isMobile ? "16px" : "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
        <button onClick={onBack} aria-label="Back" style={{ ...btn("ghost"), padding: "8px 10px" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? "20px" : "26px", fontWeight: 800 }}>Clients</h1>
          <div style={muted}>One-to-one training. Their classes count too.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile || !selected ? "1fr" : "320px 1fr", gap: "16px", alignItems: "start" }}>
        <ClientList
          clients={clients} members={members} selectedId={selectedId}
          onSelect={setSelectedId} programs={programs} sessions={sessions}
          identities={identities} adding={adding} setAdding={setAdding} onAdd={addClient}
          hide={isMobile && !!selected}
        />
        {/* ⚠️ ClientDetail is KEYED ON THE CLIENT ONLY, never on `tick`. Putting
            the counter in the key remounts the subtree on every write, which
            resets child state — opening a session and then logging a set into it
            closed the logger again, because `refresh()` bumped the key. The
            parent re-render is already enough: these components read the store on
            each render rather than holding copies of it. */}
        {selected && (
          <ClientDetail
            key={selected.id}
            member={selected} programs={programs} sessions={sessions} setLogs={setLogs}
            identities={identities} onChange={refresh} onClose={() => setSelectedId(null)}
            isMobile={isMobile} toast={toast}
          />
        )}
      </div>
    </div>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────
function ClientList({ clients, members, selectedId, onSelect, programs, sessions, identities, adding, setAdding, onAdd, hide }) {
  if (hide) return null;
  const notClients = members.filter(m => !clients.some(c => c.id === m.id));

  return (
    <div style={{ ...card, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 10px" }}>
        <div style={label}>{clients.length} {clients.length === 1 ? "client" : "clients"}</div>
        {/* "Add client", not "Add". The programme panel has its own Add, and two
            buttons sharing an accessible name is ambiguous for a screen reader
            before it is ambiguous for a test. */}
        <button style={{ ...btn("ghost"), padding: "6px 10px", fontSize: "12px" }}
                onClick={() => setAdding(a => !a)}>
          <Plus size={13} style={{ verticalAlign: "-2px" }} /> Add client
        </button>
      </div>

      {adding && (
        <div style={{ padding: "8px 6px 12px", borderBottom: "1px solid var(--border)", marginBottom: "8px" }}>
          {notClients.length === 0
            ? <div style={muted}>Everyone on the roster is already a client.</div>
            : (
              <select style={field} defaultValue="" aria-label="Add a client from the roster"
                      onChange={e => e.target.value && onAdd(e.target.value)}>
                <option value="" disabled>Choose someone from the roster&hellip;</option>
                {notClients.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
        </div>
      )}

      {clients.length === 0 && !adding && (
        // The empty state names the next action rather than the absence.
        <div style={{ ...muted, padding: "10px 6px 14px" }}>
          No one is training one-to-one yet. Add someone from your roster to start.
        </div>
      )}

      {clients.map(c => {
        const access = store.memberAppAccess(c.id, identities);
        const screening = store.parqStatus(c.id);
        const active = programs.find(p => p.memberId === c.id && p.status === "active");
        const next = sessions
          .filter(s => s.memberId === c.id && s.status === "planned")
          .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
        const on = c.id === selectedId;
        return (
          <button key={c.id} onClick={() => onSelect(c.id)}
            style={{ width: "100%", textAlign: "left", padding: "10px 10px", marginBottom: "4px",
                     borderRadius: "10px", border: "none", cursor: "pointer",
                     background: on ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: on ? "var(--accent)" : "var(--text)" }}>{c.name}</span>
              {/* Screening is a shield, not a colour alone — the timer's rule about
                  never encoding meaning in hue applies here too. */}
              {screening.ok
                ? <ShieldCheck size={13} aria-label="Screening current" style={{ color: "var(--accent)" }} />
                : <ShieldAlert size={13} aria-label="Screening needed" style={{ color: "var(--danger)" }} />}
              {access.state === "linked" && <Smartphone size={12} aria-label="Using the app" style={{ color: "var(--muted)" }} />}
            </div>
            <div style={{ ...muted, fontSize: "12px", marginTop: "2px" }}>
              {active ? active.title : "No active programme"}
              {next ? ` · next ${dateOf(next.startsAt)}` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── The detail ───────────────────────────────────────────────────────────────
function ClientDetail({ member, programs, sessions, setLogs, identities, onChange, onClose, isMobile, toast }) {
  const screening = store.parqStatus(member.id);
  const access = store.memberAppAccess(member.id, identities);
  const mine = programs.filter(p => p.memberId === member.id);
  const mySessions = sessions.filter(s => s.memberId === member.id)
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const myLogs = setLogs.filter(l => l.memberId === member.id && !l.voided);

  const [openSession, setOpenSession] = useState(null);

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {isMobile && (
        <button style={{ ...btn("ghost"), justifySelf: "start" }} onClick={onClose}>
          <ArrowLeft size={14} style={{ verticalAlign: "-2px" }} /> All clients
        </button>
      )}

      <ScreeningPanel member={member} screening={screening} access={access} onChange={onChange} toast={toast} />
      <ProgrammePanel member={member} programs={mine} screening={screening} onChange={onChange} toast={toast} />
      <SessionsPanel member={member} sessions={mySessions} programs={mine} setLogs={setLogs}
                     openSession={openSession} setOpenSession={setOpenSession} onChange={onChange} toast={toast} />
      <ProgressPanel logs={myLogs} sessions={mySessions} />
    </div>
  );
}

function ScreeningPanel({ member, screening, access, onChange, toast }) {
  const [flagged, setFlagged] = useState(false);
  const responses = store.getParqResponses().filter(p => p.memberId === member.id);
  const latest = responses.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

  return (
    <section style={card}>
      <div style={label}>Health screening</div>
      <div style={{ margin: "8px 0 12px", fontSize: "14px" }}>
        {screening.ok
          ? <>Current until <b>{new Date(screening.expiresAt).toLocaleDateString()}</b>.
              {screening.flagged ? " Flagged, and clearance is on file." : ""}</>
          : <span style={{ color: "var(--danger)", fontWeight: 600 }}>{SCREENING_COPY[screening.reason]}</span>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <label style={{ ...muted, display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={flagged} onChange={e => setFlagged(e.target.checked)} />
          Answers flagged a risk
        </label>
        <button style={btn()} onClick={() => {
          store.recordParq({ memberId: member.id, flagged });
          setFlagged(false); onChange();
          toast("Screening recorded");
        }}>Record screening</button>

        {screening.reason === "flagged-uncleared" && latest && (
          <button style={btn("ghost")} onClick={() => {
            store.recordParqClearance(latest.id, "Recorded by coach");
            onChange(); toast("Clearance recorded");
          }}>Record medical clearance</button>
        )}
      </div>

      <div style={{ ...muted, marginTop: "12px", fontSize: "12px" }}>
        App access: {access.state === "linked" ? "using the app"
          : access.state === "invited" ? `invited ${dateOf(access.row.invitedAt)}, not opened yet`
          : "not invited"}
      </div>
    </section>
  );
}

function ProgrammePanel({ member, programs, screening, onChange, toast }) {
  const [title, setTitle] = useState("");
  return (
    <section style={card}>
      <div style={label}>Programme</div>
      {programs.length === 0 && <div style={{ ...muted, margin: "8px 0" }}>Nothing written yet.</div>}

      <div style={{ margin: "8px 0" }}>
        {programs.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0",
                                   borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontWeight: 600, fontSize: "14px", flex: 1 }}>{p.title}</span>
            <span style={muted}>{PROGRAM_STATUS_LABEL[p.status]}</span>
            {p.status === "draft" && (
              <button style={btn()} onClick={() => {
                const r = store.activateProgram(p.id);
                // The gate, surfaced. A refusal says which screening problem and
                // what to do — never "could not activate".
                if (!r.ok) toast(r.reason === "parq"
                  ? `${SCREENING_COPY[r.screening.reason]} Record it before starting this programme.`
                  : "Could not start this programme.");
                else toast("Programme started");
                onChange();
              }}>Start</button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <input style={field} value={title} placeholder="New programme name" aria-label="New programme name"
               onChange={e => setTitle(e.target.value)} />
        <button style={btn("ghost")} disabled={!title.trim()} onClick={() => {
          const r = store.createProgram({ memberId: member.id, title });
          if (r.ok) { setTitle(""); onChange(); toast("Draft created"); }
        }}>Add programme</button>
      </div>
      {!screening.ok && (
        <div style={{ ...muted, marginTop: "10px", fontSize: "12px" }}>
          A programme can be written now and started once screening is on file.
        </div>
      )}
    </section>
  );
}

function SessionsPanel({ member, sessions, programs, setLogs, openSession, setOpenSession, onChange, toast }) {
  const activeProgram = programs.find(p => p.status === "active");
  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={label}>Sessions</div>
        <button style={{ ...btn("ghost"), padding: "6px 10px", fontSize: "12px" }} onClick={() => {
          const r = store.createPtSession({ memberId: member.id, startsAt: new Date().toISOString(),
                                            programId: activeProgram?.id || null });
          if (r.ok) { setOpenSession(r.session.id); onChange(); }
        }}>
          <Plus size={13} style={{ verticalAlign: "-2px" }} /> New session
        </button>
      </div>

      {sessions.length === 0 && <div style={{ ...muted, margin: "10px 0 0" }}>No sessions yet.</div>}

      {sessions.map(s => {
        const logs = store.setLogsForSession(s.id, setLogs);
        const open = openSession === s.id;
        return (
          <div key={s.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer",
                               fontWeight: 600, fontSize: "14px", padding: 0 }}
                      onClick={() => setOpenSession(open ? null : s.id)}>
                {dateOf(s.startsAt)} · {logs.length} {logs.length === 1 ? "set" : "sets"}
              </button>
              <span style={{ ...muted, flex: 1 }}>{SESSION_STATUS_LABEL[s.status]}</span>
              {s.status === "planned" && (
                <button style={btn("ghost")} onClick={() => {
                  store.setPtSessionStatus(s.id, "delivered"); onChange();
                  toast("Session marked delivered");
                }}><Check size={13} style={{ verticalAlign: "-2px" }} /> Delivered</button>
              )}
            </div>
            {open && <SetLogger session={s} member={member} logs={logs} onChange={onChange} />}
          </div>
        );
      })}
    </section>
  );
}

// ── The hot path ─────────────────────────────────────────────────────────────
// A trainer's thumb between sets. Prefilled from the last set of the same
// movement, because the common case is "same again" and re-typing it is the
// thing that sends people back to a notebook.
function SetLogger({ session, member, logs, onChange }) {
  const [movement, setMovement] = useState("");
  const [reps, setReps] = useState("");
  const [loadKg, setLoad] = useState("");
  const [rir, setRir] = useState("");

  const last = [...logs].reverse().find(l => l.movement.toLowerCase() === movement.trim().toLowerCase());

  const submit = () => {
    const r = store.logSet({
      sessionId: session.id, memberId: member.id, movement,
      setIndex: logs.filter(l => l.movement === movement.trim()).length + 1,
      reps: reps === "" ? null : Number(reps),
      loadKg: loadKg === "" ? null : Number(loadKg),
      rir: rir === "" ? null : Number(rir),
    });
    if (r.ok) { setReps(""); setLoad(""); setRir(""); onChange(); }
  };

  return (
    <div style={{ marginTop: "10px", paddingLeft: "10px", borderLeft: "2px solid var(--border)" }}>
      {logs.map(l => (
        <div key={l.id} style={{ ...muted, fontSize: "12.5px", padding: "3px 0" }}>
          {l.movement} — {l.reps ?? "?"} × {l.loadKg == null ? "bodyweight" : `${l.loadKg} kg`}
          {l.rir == null ? "" : ` @ RIR ${l.rir}`}
        </div>
      ))}

      {/* "Last time" is the single highest-value element here and the reason a
          trainer stops using paper. Only shown once the movement is named. */}
      {last && (
        <div style={{ ...muted, fontSize: "12px", margin: "6px 0" }}>
          Last: {last.reps} × {last.loadKg == null ? "bodyweight" : `${last.loadKg} kg`}
          {last.rir == null ? "" : ` @ RIR ${last.rir}`}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "6px", marginTop: "8px" }}>
        <input style={field} value={movement} placeholder="Movement" aria-label="Movement"
               onChange={e => setMovement(e.target.value)} />
        <input style={field} value={reps} placeholder="Reps" aria-label="Reps" inputMode="numeric"
               onChange={e => setReps(e.target.value)} />
        <input style={field} value={loadKg} placeholder="kg" aria-label="Load in kilograms" inputMode="decimal"
               onChange={e => setLoad(e.target.value)} />
        <input style={field} value={rir} placeholder="RIR" aria-label="Reps in reserve" inputMode="numeric"
               onChange={e => setRir(e.target.value)} />
        <button style={btn()} disabled={!movement.trim()} onClick={submit}>Log</button>
      </div>
    </div>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────
// Everything here is a render of lib/progression.js. Where it refuses, this
// prints the refusal — which is the point, and the thing every competitor's
// screen does not do.
function ProgressPanel({ logs, sessions }) {
  const best = bestEstimate1RM(logs);
  const pbs = personalBests(logs);
  const adh = adherence(sessions);
  const vol = volumeByMovement(logs);

  return (
    <section style={card}>
      <div style={label}>Progress</div>

      <div style={{ margin: "10px 0", fontSize: "14px" }}>
        <div style={{ ...muted, fontSize: "12px" }}>Best estimated one-rep max</div>
        {best.ok ? (
          <>
            <div style={{ fontSize: "22px", fontWeight: 800 }}>{best.value} kg</div>
            {/* The set it came from, always. An estimate without its basis is
                the confident wrong number this screen exists not to show. */}
            <div style={muted}>
              from {best.basis.reps} × {best.basis.loadKg} kg @ RIR {best.basis.rir} · {best.method}
            </div>
            <div style={{ ...muted, fontSize: "12px", marginTop: "2px" }}>
              Built from {best.usable} of {best.considered} logged sets
              {Object.keys(best.skipped).length
                ? ` — the rest were ${Object.entries(best.skipped).map(([k, n]) => `${n} ${E1RM_SKIP_COPY[k] || k}`).join(", ")}.`
                : "."}
            </div>
          </>
        ) : <div style={muted}>{E1RM_COPY[best.reason] || "Not enough to estimate from yet."}</div>}
      </div>

      <div style={{ margin: "14px 0" }}>
        <div style={{ ...muted, fontSize: "12px" }}>Attendance</div>
        {adh.ok ? (
          <div style={{ fontSize: "14px" }}>
            {/* Both numerals, always. Below the threshold the percentage is
                withheld and only the fraction shows — 100% of two is not 100%. */}
            <b>{adh.delivered} of {adh.planned}</b> sessions delivered
            {adh.confident ? ` · ${adh.value}%` : " · too few sessions to read as a rate yet"}
          </div>
        ) : <div style={muted}>No sessions planned yet.</div>}
      </div>

      {pbs.size > 0 && (
        <div style={{ marginTop: "14px" }}>
          <div style={{ ...muted, fontSize: "12px", marginBottom: "4px" }}>Best sets</div>
          {[...pbs.values()].map(pb => (
            <div key={pb.movement} style={{ fontSize: "13.5px", padding: "2px 0" }}>
              {pb.movement} — <b>{pb.reps} × {pb.loadKg} kg</b>
              {vol.get(pb.movement)
                ? <span style={muted}> · {Math.round(vol.get(pb.movement).kg).toLocaleString()} kg total</span>
                : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
