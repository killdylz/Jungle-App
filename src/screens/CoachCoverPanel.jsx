// ─── Coach roster, availability and cover (S30 §2.1–§2.3) ────────────────────
//
// Lives on the Schedule screen, and that is a decision rather than a default.
//
// 🔴 THIS PRODUCT ALREADY HAS TWO THINGS CALLED "COACHES" AND THIS IS THE THIRD.
// `ALL_SCREENS`' `personas` entry is labelled "Coaches" in the sidebar and the
// mobile sheet, and it opens `PersonasScreen` — a coach's PROGRAMMING PERSONA,
// their style and movement catalogue, not their employment. (0005's own comment
// gives "The Garage — S360" and "House Strength" as example persona names: one
// of them is a gym.) `AdminTeamScreen` is the third, labelled "Team", and it is
// the gym's ACCOUNTS — hidden entirely when there is no server, which is the
// shipped state.
//
// So this adds NO nav entry and NO fourth vocabulary. It is a panel on the
// screen where coach names are actually typed, under the heading "Coach roster",
// and the word "Coaches" is deliberately not reused. `CLAUDE.md` records the
// three-nav-vocabularies trap for exactly this reason.

import React from "react";
import { X } from "lucide-react";
import * as store from "../lib/store.js";
import { supabaseEnabled } from "../supabase.js";
import { rosterCoverage, coachesFreeAt, availabilityState, coachReach,
         COACH_AVAIL_STALE_DAYS } from "../lib/coachRoster.js";
import { makeCoverRequest, settleCover, isOpen, openRequestForClass,
         deliveryTruth } from "../lib/coverRequests.js";
import { coverApprovedPayload, bookingAdapter } from "../lib/bookingAdapter.js";
import { RULE_DAYS } from "../lib/scheduleInstances.js";
import { useToast } from "../ui/toast.jsx";

const SLOTS = ["06:00", "09:00", "12:00", "18:00", "19:30"];

const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" };
const h    = { fontFamily: "var(--display)", fontSize: "14px", fontWeight: "700", color: "var(--text)" };
const sub  = { fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" };
const btn  = (on) => ({ padding: "6px 11px", borderRadius: "7px", cursor: "pointer", fontSize: "11px", fontWeight: "700",
                        background: on ? "var(--accent)" : "transparent", color: on ? "var(--on-accent)" : "var(--muted)",
                        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}` });
const field = { padding: "8px 10px", background: "var(--navy)", border: "1px solid var(--border)",
                borderRadius: "8px", color: "var(--text)", fontSize: "12px" };

// What a reach state is called on screen. Three words a coach can act on, not
// three enum keys — `honesty.spec.js` fails a surface that names a state in a
// vocabulary only the code uses.
// Only the two states a ROSTER ENTRY can be in. "unknown" is a property of a
// typed name, not of an entry, and it has its own section below — giving it a
// label here would put a third string one typo away from being rendered on a
// person who is demonstrably on the roster.
const REACH_LABEL = {
  account: "Has a Jungle account",
  roster:  "No account — ask them yourself",
};

export function CoachCoverPanel({ userClasses, onAssignCoach, isMobile }) {
  const { toast } = useToast();
  const [coaches, setCoaches] = React.useState(() => store.getCoaches());
  const [requests, setRequests] = React.useState(() => store.getCoverRequests());
  const [newName, setNewName] = React.useState("");
  const [editing, setEditing] = React.useState(null);      // roster id whose grid is open
  const [askClassId, setAskClassId] = React.useState("");
  const [pendingRemove, setPendingRemove] = React.useState(null);

  // One clock read for the whole render, so two rows cannot straddle midnight and
  // disagree about whether the same claim is stale. Same reasoning as the grid's
  // `nowMs` above it.
  const nowMs = Date.now();
  const coverage = React.useMemo(() => rosterCoverage(coaches, userClasses), [coaches, userClasses]);
  const openAsks = (requests || []).filter(isOpen);
  const askClass = (userClasses || []).find(c => c.id === askClassId) || null;
  const free = askClass ? coachesFreeAt(coaches, { day: askClass.day, slot: askClass.slot }, nowMs) : [];
  const nameOf = id => (coaches.find(c => c.id === id)?.name) || "someone";

  const addCoach = (name) => {
    const n = String(name || "").trim();
    if (!n) return;
    const r = store.addCoach(n);
    setCoaches(r.coaches);
    setNewName("");
    toast(`${r.coach.name} added to the roster`);
  };

  const removeCoach = (id) => {
    const label = nameOf(id);
    setPendingRemove(null);
    const { coaches: after, before } = store.removeCoach(id);
    setCoaches(after);
    if (editing === id) setEditing(null);
    // The PRIOR LIST, not the row: position is part of what was lost, and an undo
    // that appends the coach at the end has not restored what was on screen.
    toast(`Removed ${label}`, { undo: () => { store.saveCoaches(before); setCoaches(before); toast(`${label} restored`); } });
  };

  const toggleSlot = (id, day, slot) => {
    const cur = coaches.find(c => c.id === id)?.availability || {};
    const have = (cur[day] || []).includes(slot);
    const next = { ...cur, [day]: have ? (cur[day] || []).filter(s => s !== slot) : [...(cur[day] || []), slot] };
    const r = store.updateCoach(id, { availability: next });
    setCoaches(r.coaches);
  };

  const ask = (toCoachId) => {
    if (!askClass) return;
    if (openRequestForClass(requests, askClass.id)) { toast("That class already has an open cover request"); return; }
    const from = coverage.known.find(k => k.name === askClass.coach)?.entry?.id || "";
    const req = makeCoverRequest({ id: store.newId(), classRule: askClass, fromCoachId: from, toCoachId, now: nowMs });
    const next = [...requests, req];
    store.saveCoverRequests(next);
    setRequests(next);
    setAskClassId("");
    // ⚠️ NOT "Sent". `deliveryTruth` is the only thing allowed to say what
    // happened, and on the shipped build the answer is "this device".
    const truth = deliveryTruth({ serverConfigured: supabaseEnabled, toCoach: coaches.find(c => c.id === toCoachId) });
    toast(truth === "device"
      ? `Recorded on this device — ${nameOf(toCoachId)} will not see it`
      : `Waiting for ${nameOf(toCoachId)} to open Jungle`);
  };

  const settle = async (id, next) => {
    const r = settleCover(requests, id, next, { now: nowMs });
    if (!r.changed) {
      // Losing the race is REPORTED. This is the branch that stops the product
      // showing an approval that did not happen.
      setRequests(store.getCoverRequests());
      toast(r.reason === "gone" ? "That request is no longer there"
                                : `Already ${r.reason} — nothing changed`);
      return;
    }
    store.saveCoverRequests(r.list);
    setRequests(r.list);

    if (next === "approved") {
      const to = coaches.find(c => c.id === r.request.toCoachId);
      if (to && onAssignCoach) onAssignCoach(r.request.classClientId, to.name);
      // The seam. The no-op is the only implementation, so this always reports
      // that nothing left Jungle — and the coach is told, rather than left to
      // assume a booking system was updated.
      const out = await bookingAdapter().pushCoverApproved(
        coverApprovedPayload({ request: r.request, fromName: nameOf(r.request.fromCoachId), toName: to?.name || "" }));
      toast(`${to?.name || "They"} now teaches ${r.request.classLabel}. ${out.reason}`);
    } else {
      // Two different events, and a shared sentence would misreport one of them:
      // a rejection is the ASKED coach saying no, a withdrawal is the ASKER
      // taking it back. Both leave the class uncovered, which is the part the
      // coach has to act on, so both say so.
      toast(next === "rejected"
        ? `${nameOf(r.request.toCoachId)} turned down ${r.request.classLabel} — it still has no cover`
        : `Withdrew the request for ${r.request.classLabel} — it still has no cover`);
    }
  };

  const availSummary = (c) => {
    const st = availabilityState(c, nowMs);
    const n = Object.values(c.availability || {}).reduce((a, s) => a + s.length, 0);
    if (st.state === "never") return "Availability not set";
    // ONE unit for both branches. This read "3 slots · stated 4d ago" directly
    // above "1 slot · stated 204 days ago" — the same fact in two notations, in
    // one column, which makes a reader stop and work out whether they mean the
    // same thing. Found by rendering the panel and reading it, not by a test.
    const when = st.days === 0 ? "stated today"
               : st.days === 1 ? "stated yesterday"
               : `stated ${st.days} days ago`;
    return `${n === 0 ? "No slots" : `${n} slot${n === 1 ? "" : "s"}`} · ${when}`;
  };

  return (
    <div style={{ ...card, marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
        <div style={h}>Coach roster</div>
        <div style={{ ...sub, fontWeight: "700" }}>{coverage.known.length} named · {coverage.accounts} with an account</div>
      </div>

      {/* 🔴 THE TRUTH LINE. Not a disclaimer bolted on — it is the most important
          sentence on the panel, because everything below it looks like it works.
          See SESSION-HANDOFF.md §2.5 and migration 0010. */}
      <div style={{ ...sub, marginBottom: "14px", padding: "9px 11px", background: "var(--navy)",
                    border: "1px solid var(--border)", borderRadius: "8px" }}>
        {supabaseEnabled
          ? <>Cover requests reach a coach when they next open Jungle. There is no push, email or text &mdash; nobody&rsquo;s phone will ring.</>
          : <>This roster and every cover request are stored <strong style={{ color: "var(--text)" }}>on this device only</strong>. No one else&rsquo;s Jungle can see them.</>}
      </div>

      {/* ── The roster ──────────────────────────────────────────────────────── */}
      {coaches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
          {coaches.map(c => (
            <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)" }}>{c.name}</span>
                <span style={{ fontSize: "10px", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: "999px", padding: "2px 8px" }}>
                  {REACH_LABEL[coachReach(c)]}
                </span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setEditing(editing === c.id ? null : c.id)}
                        aria-label={`Set availability for ${c.name}`}
                        style={btn(editing === c.id)}>Availability</button>
                <button onClick={() => setPendingRemove(c.id)} aria-label={`Remove ${c.name} from the roster`}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: "4px" }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ ...sub, marginTop: "3px" }}>
                {availSummary(c)}
                {availabilityState(c, nowMs).state === "stale" &&
                  <strong style={{ color: "var(--text)" }}> &mdash; older than {COACH_AVAIL_STALE_DAYS} days, ask again</strong>}
              </div>

              {editing === c.id && (
                <div style={{ marginTop: "10px", overflowX: "auto" }}>
                  <table aria-label={`${c.name}\u2019s availability`}
                         style={{ borderCollapse: "collapse", fontSize: "10px" }}>
                    <thead><tr>
                      {/* The corner cell has no heading to give, and an empty <th>
                          is read out as one. `scope="col"` with an explicit empty
                          name would be worse; the TABLE carries the name instead. */}
                      <th style={{ padding: "3px 6px" }} />
                      {SLOTS.map(s => <th key={s} style={{ padding: "3px 6px", color: "var(--muted)", fontWeight: "700" }}>{s}</th>)}
                    </tr></thead>
                    <tbody>
                      {RULE_DAYS.map(day => (
                        <tr key={day}>
                          <td style={{ padding: "3px 6px", color: "var(--muted)", fontWeight: "700" }}>{day}</td>
                          {SLOTS.map(slot => {
                            const on = (c.availability?.[day] || []).includes(slot);
                            return (
                              <td key={slot} style={{ padding: "2px 3px" }}>
                                {/* A BUTTON, not a div. `keyboard.spec.js` sweeps
                                    elements with a ROLE, so a `<div onClick>`
                                    here would be invisible to it — the exact
                                    defect session 27 found in Brand Studio. */}
                                <button onClick={() => toggleSlot(c.id, day, slot)}
                                        aria-pressed={on}
                                        aria-label={`${c.name} free ${day} ${slot}`}
                                        style={{ width: "34px", height: "22px", borderRadius: "5px", cursor: "pointer",
                                                 background: on ? "var(--accent)" : "transparent",
                                                 border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                                                 color: on ? "var(--on-accent)" : "var(--muted)", fontSize: "10px", fontWeight: "700" }}>
                                  {on ? "✓" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Names typed on the schedule that nobody has claimed ─────────────── */}
      {/* NOT an error list. A gym that has typed names for a year is in a normal
          state, and this offers the one action that changes it rather than
          nagging about the ones it has not taken. */}
      {coverage.unknown.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ ...sub, marginBottom: "6px" }}>
            On your schedule, not yet on the roster:
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {coverage.unknown.map(u => (
              <button key={u.key} onClick={() => addCoach(u.name)}
                      aria-label={`Put ${u.name} on the roster`} style={btn(false)}>
                {/* ⚠️ NO `opacity` ON THIS COUNT. It was `opacity: 0.7`, which took
                    `--muted` from a token designed to clear AA down to 3.9:1
                    against 4.5 — caught by `brandTokens.spec.js` on two skins at
                    two widths. Opacity is invisible to a palette that was chosen
                    to be readable: it re-tints a token AFTER the contrast the
                    generator guaranteed. The parentheses already de-emphasise it. */}
                + {u.name} <span>({u.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
               onKeyDown={e => { if (e.key === "Enter") addCoach(newName); }}
               placeholder="Add a coach by name" aria-label="Add a coach by name"
               style={{ ...field, flex: 1, minWidth: 0 }} />
        <button onClick={() => addCoach(newName)} disabled={!newName.trim()}
                style={{ ...btn(!!newName.trim()), cursor: newName.trim() ? "pointer" : "default" }}>Add coach</button>
      </div>

      {/* ── Ask for cover ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>Need cover?</div>
        {coaches.length === 0 ? (
          <div style={sub}>Put a coach on the roster first &mdash; a cover request has to go to somebody.</div>
        ) : (
          <>
            <select value={askClassId} onChange={e => setAskClassId(e.target.value)}
                    aria-label="Class that needs cover"
                    style={{ ...field, width: isMobile ? "100%" : "auto", maxWidth: "100%", marginBottom: "8px" }}>
              <option value="">Pick a class&hellip;</option>
              {(userClasses || []).map(c => (
                <option key={c.id} value={c.id}>{c.day} {c.slot} · {c.name}{c.coach ? ` · ${c.coach}` : ""}</option>
              ))}
            </select>
            {askClass && (
              <div>
                {free.length === 0 ? (
                  <div style={sub}>
                    Nobody has said they are free {askClass.day} at {askClass.slot}. Set availability above, or ask around
                    &mdash; Jungle will not find someone you have not told it about.
                  </div>
                ) : free.map(f => (
                  <div key={f.coach.id} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "7px 0" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>{f.coach.name}</span>
                    <span style={sub}>
                      {f.state === "stale" ? `said so ${f.days} days ago` : "free then"} · {REACH_LABEL[f.reach]}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => ask(f.coach.id)} aria-label={`Ask ${f.coach.name} to cover ${askClass.name}`}
                            style={btn(true)}>Ask</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Open requests ──────────────────────────────────────────────────── */}
      {openAsks.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "14px" }}>
          <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>Open cover requests</div>
          {/* 🔴 SAYING THE QUIET PART. The panel shows "Mara asked Dev" and then
              offers Approve to whoever is looking at it. That is not a bug that
              can be fixed here: with no server there is no signed-in user, so the
              product genuinely cannot tell who is holding the phone. Scoping the
              buttons would require inventing an identity we do not have. So it
              says so, in the same spirit as the notice at the top — a control
              that looks like it knows who you are, and does not, is the failure
              this panel exists to avoid. */}
          <div style={{ ...sub, marginBottom: "10px" }}>
            Anyone using this device can answer these &mdash; Jungle cannot tell which coach you are
            until the gym is online.
          </div>
          {openAsks.map(r => (
            <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>
                {r.classDay} {r.classSlot} · {r.classLabel}
              </div>
              <div style={{ ...sub, marginBottom: "8px" }}>
                {nameOf(r.fromCoachId)} asked {nameOf(r.toCoachId)}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button onClick={() => settle(r.id, "approved")}
                        aria-label={`Approve cover for ${r.classLabel}`} style={btn(true)}>Approve</button>
                <button onClick={() => settle(r.id, "rejected")}
                        aria-label={`Turn down cover for ${r.classLabel}`} style={btn(false)}>Turn it down</button>
                <button onClick={() => settle(r.id, "cancelled")}
                        aria-label={`Withdraw the cover request for ${r.classLabel}`} style={btn(false)}>Withdraw</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm, in-app. A window.confirm is auto-dismissed by Playwright, so a
          test clicking delete and asserting the row is gone would be exercising
          CANCEL — the trap CLAUDE.md names. Removing a coach also destroys their
          availability, so it is confirmed AND undoable. */}
      {pendingRemove && (
        <div style={{ marginTop: "12px", padding: "12px 14px", border: "1px solid var(--danger)", borderRadius: "10px" }}>
          <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.5", marginBottom: "10px" }}>
            Remove <strong>{nameOf(pendingRemove)}</strong> from the roster? Their availability goes with them.
            Classes keep the name typed on them.
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => removeCoach(pendingRemove)} aria-label={`Confirm removing ${nameOf(pendingRemove)}`}
                    style={{ ...btn(false), color: "var(--danger)", borderColor: "var(--danger)" }}>Remove</button>
            <button onClick={() => setPendingRemove(null)} style={btn(false)}>Keep</button>
          </div>
        </div>
      )}
    </div>
  );
}
