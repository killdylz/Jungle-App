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
import { supabase, supabaseEnabled } from "../supabase.js";
import { useJungleAuth } from "../AuthGate.jsx";
import { rosterCoverage, coachesFreeAt, availabilityState, coachReach,
         formatAliases, coachEditPatch, linkableAccounts, rosterViewerMode,
         selfCoach, askableClasses,
         COACH_AVAIL_STALE_DAYS } from "../lib/coachRoster.js";
// ⚠️ `settleCover` is deliberately NOT imported here any more. The panel used to
// call it directly and write the result; it now goes through
// `store.settleCoverRequest`, which puts the server's conditional update in
// front of it. Calling the pure version from a screen again would restore
// exactly the last-writer-wins approval this session removed.
import { makeCoverRequest, isOpen, openRequestForClass,
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
  const [detailsFor, setDetailsFor] = React.useState(null); // roster id whose edit form is open
  const [draft, setDraft] = React.useState(null);           // { name, aliasText, active, userId }
  const [accounts, setAccounts] = React.useState(null);     // null = not loaded / no server
  const [askClassId, setAskClassId] = React.useState("");
  const [pendingRemove, setPendingRemove] = React.useState(null);
  // Whether `cover_requests` actually exists on this gym's server. Starts
  // optimistic and is corrected by the hydrate below, because a screen that has
  // not looked cannot claim a table is missing — see `deliveryTruth`.
  const [storageReady, setStorageReady] = React.useState(true);

  // ── Pulling both tables, once, on mount (S32 §2.1) ──────────────────────
  //
  // The same shape PersonasScreen uses, and for the same reason: the roster is
  // now a shared object, so the copy this device happens to hold is a cache
  // rather than the truth. `hydrateCoachCover` returns null when there is no
  // server OR when migration 0010 has not been run — in both cases local stands
  // and the truth line below says which world we are in.
  React.useEffect(() => {
    let alive = true;
    store.hydrateCoachCover().then(r => {
      if (!alive) return;
      if (r) { setCoaches(r.coaches); setRequests(r.requests); }
      setStorageReady(!store.tableAbsent("cover_requests"));
    });
    return () => { alive = false; };
  }, []);

  // One clock read for the whole render, so two rows cannot straddle midnight and
  // disagree about whether the same claim is stale. Same reasoning as the grid's
  // `nowMs` above it.
  const nowMs = Date.now();
  const coverage = React.useMemo(() => rosterCoverage(coaches, userClasses), [coaches, userClasses]);

  // ⚠️ DECLARED HERE, ABOVE EVERY READER. It used to sit further down, beside
  // the account-list effect that was its only consumer; the viewer logic below
  // reads it during render, and a `const` read before its declaration is a
  // ReferenceError at runtime that `lint:crash` cannot see — it resolves the
  // identifier fine, because the binding genuinely exists in scope. The whole
  // Schedule screen fell into its error boundary and 17 e2e tests timed out
  // looking for a button that was never rendered.
  const auth = useJungleAuth();
  const gymId = auth?.gym?.id;

  // ── Who is looking at this panel (S32 §2.2) ──────────────────────────────
  //
  // 🔴 UNTIL S31 THIS QUESTION HAD NO ANSWER, and the comment above the Approve
  // buttons below said so. `userId` on a roster entry is what changed, so the
  // panel can finally scope itself to a person instead of trusting whoever is
  // holding the phone. `rosterViewerMode` carries the rule and the reasoning;
  // with no server it returns "manage", which is the build in use today.
  const userId = auth?.user?.id || "";
  const mode = rosterViewerMode({ can: auth?.can, userId, roster: coaches });
  const me = selfCoach(coaches, userId);
  const isManager = mode === "manage";
  const visibleCoaches = isManager ? coaches : (me ? [me] : []);

  const openAsks = (requests || []).filter(isOpen);
  // A coach sees the asks that are ABOUT them — aimed at them to answer, or
  // raised by them to withdraw. A manager sees the gym's.
  const myAsks = isManager ? openAsks
               : openAsks.filter(r => me && (r.toCoachId === me.id || r.fromCoachId === me.id));
  const askable = askableClasses(userClasses, mode, me);
  const askClass = (askable || []).find(c => c.id === askClassId) || null;
  // ⚠️ A CLASS'S OWN COACH IS STILL OFFERED AS COVER FOR IT, AND THAT IS A REAL
  // DEFECT THIS SESSION DECIDED NOT TO FIX HERE. `ask()` takes `fromCoachId`
  // from the class's typed coach, so asking that same person produces a request
  // whose from and to are one id — "Mara asked Mara". The one-line filter was
  // written and reverted: it is a product change nobody asked for, and it turns
  // a 🔴 e2e assertion red (coachCover.spec.js:146 seeds a stale claim on the
  // class's own coach to prove a stale claim is offered WITH its age). Changing
  // that fixture to accommodate an unrequested change is how a test stops
  // proving what it was written for. Written up for its own commit instead.
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

  // ── The account list, and why it is loaded rather than held ──────────────
  //
  // ⚠️ `memberships` is the ONLY list of a gym's people and it lives on the
  // server. There is no local copy and there should not be one: it is the
  // gym's account roster, it changes without this device, and a cached copy
  // would let the picker offer somebody who left. When there is no server
  // there is nobody to pick from, and the form says so instead of rendering
  // an empty select — see `linkNote` below.
  //
  // Loaded once when the first edit form opens, not on mount: most sessions
  // never open one, and this is a network round-trip on a panel that renders
  // on every visit to the Schedule.
  React.useEffect(() => {
    if (!detailsFor || accounts !== null || !supabaseEnabled || !supabase || !gymId) return;
    let alive = true;
    supabase.from("memberships").select("user_id,profiles(email,name)").eq("gym_id", gymId).eq("status", "active")
      .then(({ data }) => { if (alive) setAccounts(data || []); });
    return () => { alive = false; };
  }, [detailsFor, accounts, gymId]);

  const openDetails = (c) => {
    setDetailsFor(c.id);
    setDraft({ name: c.name, aliasText: formatAliases(c.aliases), active: c.active !== false, userId: c.userId || "" });
  };

  const saveDetails = (c) => {
    const patch = coachEditPatch(c, draft);
    // `updateCoach` refuses a blank name and returns the row unchanged. Saying
    // so beats a Save button that silently does nothing.
    if (!patch.name) { toast("A coach needs a name"); return; }
    const r = store.updateCoach(c.id, patch);
    setCoaches(r.coaches);
    setDetailsFor(null);
    setDraft(null);
    const added = patch.aliases.length;
    toast(added
      ? `Saved ${r.coach.name} — also answers to ${patch.aliases.join(", ")}`
      : `Saved ${r.coach.name}`);
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
    // `addCoverRequest`, not `saveCoverRequests`: raising one is an INSERT, and
    // the store keeps those two names apart on purpose — a list upsert here is
    // what could re-open somebody else's settled request. See store.js.
    const next = store.addCoverRequest(req);
    setRequests(next);
    setAskClassId("");
    // ⚠️ NOT "Sent". `deliveryTruth` is the only thing allowed to say what
    // happened, and on a gym whose migration 0010 has not run the answer is
    // still "this device" however many credentials are configured.
    const truth = deliveryTruth({ serverConfigured: supabaseEnabled, storageReady,
                                  toCoach: coaches.find(c => c.id === toCoachId) });
    toast(truth === "device" || truth === "unstored"
      ? `Recorded on this device — ${nameOf(toCoachId)} will not see it`
      : truth === "unreached"
      ? `Recorded — ${nameOf(toCoachId)} has no Jungle account, so ask them yourself`
      : `Waiting for ${nameOf(toCoachId)} to open Jungle`);
  };

  const settle = async (id, next) => {
    // 🔴 THE SERVER DECIDES THIS ONE. `settleCoverRequest` runs the conditional
    // update and only writes locally once Postgres has agreed — so the losing
    // branch below is now a real answer from a real race, not just this device
    // noticing its own double-tap. It falls back to the S30 device-only path
    // when there is no server or no table.
    const r = await store.settleCoverRequest(id, next, { now: nowMs });
    setRequests(store.getCoverRequests());
    if (!r.changed) {
      // Losing the race is REPORTED. This is the branch that stops the product
      // showing an approval that did not happen.
      toast(r.reason === "gone" ? "That request is no longer there"
          : r.reason === "unconfirmed"
            ? "Could not reach the server, so nothing was changed — try again"
            : `Already ${r.reason} — nothing changed`);
      return;
    }

    if (next === "approved") {
      const to = coaches.find(c => c.id === r.request.toCoachId);
      if (to && onAssignCoach) onAssignCoach(r.request.classClientId, to.name);
      // The seam. The no-op is the only implementation, so this always reports
      // that nothing left Jungle — and the coach is told, rather than left to
      // assume a booking system was updated.
      const out = await bookingAdapter().pushCoverApproved(
        coverApprovedPayload({ request: r.request, fromName: nameOf(r.request.fromCoachId), toName: to?.name || "" }));
      // 🔴 SAY THAT IT IS PERMANENT, BECAUSE IT IS. `onAssignCoach` rewrites the
      // RULE's coach field, so approving cover for one ill Monday changes who
      // teaches Strength Lab EVERY Monday until a human edits it back. A cover
      // request carries `classDay` and `classSlot` and no date at all, so there
      // is nowhere else for the assignment to go — see the §2.3 note in
      // SESSION-HANDOFF.md for why a dated version is a feature and not a field.
      // "Dev now teaches Strength Lab" was the whole sentence and it reads as
      // "this Monday" to everyone who has ever asked for cover.
      toast(`${to?.name || "They"} now teaches ${r.request.classLabel}${recurrenceOf(r.request)}. ${out.reason}`);
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

  // How long an approval lasts, in the words of the rule it will rewrite. Empty
  // for a one-off (the rule IS that one occurrence, so there is nothing extra to
  // warn about) and empty when the rule has been deleted underneath the request
  // — claiming a recurrence we can no longer read would be a guess.
  const recurrenceOf = (req) => {
    const rule = (userClasses || []).find(c => c.id === req.classClientId);
    if (!rule || rule.repeat === "once") return "";
    return ` every ${req.classDay} ${req.classSlot} from now on, until you change it back on the class`;
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
        {!supabaseEnabled
          ? <>This roster and every cover request are stored <strong style={{ color: "var(--text)" }}>on this device only</strong>. No one else&rsquo;s Jungle can see them.</>
          : !storageReady
          /* 🔴 CREDENTIALS ARE NOT STORAGE. This gym has a Jungle server and its
             cover tables are not on it (migration 0010). Before S32 this branch
             did not exist and the panel told these gyms their requests were
             waiting for someone — about rows that never left the phone. Present
             tense, and no promise of a date, which is the rule for anything that
             cannot arrive from inside the app. */
          ? <>This roster and every cover request are stored <strong style={{ color: "var(--text)" }}>on this device only</strong>. Your Jungle server is connected but has no coach storage set up, so no one else&rsquo;s Jungle can see them.</>
          : <>Cover requests reach a coach when they next open Jungle. There is no push, email or text &mdash; nobody&rsquo;s phone will ring.</>}
      </div>

      {/* ── A coach whose account nobody has linked yet (S32 §2.2) ─────────── */}
      {/* 🔴 NOT AN ERROR AND NOT AN EMPTY LIST. This is the normal state on the
          day a gym turns the server on: the manager has linked nobody. The
          alternative shapes are both worse — showing the whole roster hands
          every coach the power to delete their colleagues, and showing an empty
          roster says the gym has no coaches, which is a confident wrong answer.
          So it says exactly what is true and who can change it. */}
      {mode === "unlinked" && (
        <div style={{ ...sub, border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px" }}>
          Your account isn&rsquo;t linked to anyone on the coach roster yet, so there is no availability here to set.
          A manager links it from this panel on their own Jungle.
        </div>
      )}

      {/* ── The roster ──────────────────────────────────────────────────────── */}
      {visibleCoaches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
          {visibleCoaches.map(c => (
            <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)" }}>{c.name}</span>
                <span style={{ fontSize: "10px", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: "999px", padding: "2px 8px" }}>
                  {REACH_LABEL[coachReach(c)]}
                </span>
                <span style={{ flex: 1 }} />
                {/* 🔴 NAME, ALIASES, ACCOUNT LINK AND REMOVAL ARE THE GYM'S TO
                    SET, NOT THE COACH'S. A coach renaming their own entry would
                    silently unlink every class typed under the old name, and an
                    account link is the gym deciding who someone is. Availability
                    is the opposite: it is the one thing only the person
                    themselves actually knows. */}
                {isManager && (
                  <button onClick={() => (detailsFor === c.id ? (setDetailsFor(null), setDraft(null)) : openDetails(c))}
                          aria-label={`Edit ${c.name}`}
                          style={btn(detailsFor === c.id)}>Edit</button>
                )}
                <button onClick={() => setEditing(editing === c.id ? null : c.id)}
                        aria-label={isManager ? `Set availability for ${c.name}` : "Set my availability"}
                        style={btn(editing === c.id)}>Availability</button>
                {isManager && (
                  <button onClick={() => setPendingRemove(c.id)} aria-label={`Remove ${c.name} from the roster`}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: "4px" }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ ...sub, marginTop: "3px" }}>
                {availSummary(c)}
                {availabilityState(c, nowMs).state === "stale" &&
                  <strong style={{ color: "var(--text)" }}> &mdash; older than {COACH_AVAIL_STALE_DAYS} days, ask again</strong>}
              </div>

              {detailsFor === c.id && draft && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ ...sub, fontWeight: "700" }} htmlFor={`coach-name-${c.id}`}>Name</label>
                  <input id={`coach-name-${c.id}`} value={draft.name}
                         onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                         style={{ ...field, width: "100%", boxSizing: "border-box" }} />

                  <label style={{ ...sub, fontWeight: "700" }} htmlFor={`coach-aliases-${c.id}`}>Also typed as</label>
                  <input id={`coach-aliases-${c.id}`} value={draft.aliasText}
                         onChange={e => setDraft(d => ({ ...d, aliasText: e.target.value }))}
                         placeholder="Other spellings, comma-separated"
                         style={{ ...field, width: "100%", boxSizing: "border-box" }} />
                  {/* The sentence that says what this is FOR. Without it an alias
                      box is a mystery; with it, a gym looking at "Mara" and
                      "Mara K." counted as two people knows the fix. */}
                  <div style={sub}>
                    Classes are matched to a coach by the name typed on them. Capitals and spacing
                    are already ignored &mdash; add a spelling here when the same person is written a
                    genuinely different way, like &ldquo;Mara K.&rdquo; for Mara.
                  </div>

                  <label style={{ ...sub, display: "flex", alignItems: "center", gap: "7px", cursor: "pointer" }}>
                    {/* `accentColor` so the tick takes the GYM's palette. Without
                        it a native checkbox renders browser-default blue on a
                        white-labelled screen — the same defect class as the demo
                        screen that drew its own controls (commit 8c581d0).
                        ⚠️ Two OTHER checkboxes in this product still have this
                        gap (RosterScreen.jsx:343, PersonasScreen.jsx:1009); they
                        are noted in the handoff rather than fixed here, because
                        widening a commit is how polish arrives untested. */}
                    <input type="checkbox" checked={draft.active}
                           onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
                           style={{ accentColor: "var(--accent)" }}
                           aria-label={`${c.name} still coaches here`} />
                    <span>Still coaches here</span>
                  </label>
                  {!draft.active && (
                    <div style={sub}>
                      They stay on the roster and keep their classes, but they will not be offered
                      when you look for cover.
                    </div>
                  )}

                  {/* ── The account link ─────────────────────────────────────
                      🔴 SERVER-ONLY, AND IT SAYS SO. `memberships` is the only
                      list of a gym's people and it is not on this device. A
                      select with nothing in it would read as "you have no
                      staff"; a sentence reads as what it is. */}
                  <label style={{ ...sub, fontWeight: "700" }} htmlFor={`coach-account-${c.id}`}>Jungle account</label>
                  {supabaseEnabled ? (
                    <>
                      <select id={`coach-account-${c.id}`} value={draft.userId}
                              onChange={e => setDraft(d => ({ ...d, userId: e.target.value }))}
                              style={{ ...field, width: "100%", cursor: "pointer" }}>
                        <option value="">Not linked</option>
                        {linkableAccounts(accounts, coaches, c.id).map(a => (
                          <option key={a.userId} value={a.userId} disabled={!!a.takenBy}>
                            {a.label}{a.takenBy ? ` — already linked to ${a.takenBy}` : ""}
                          </option>
                        ))}
                      </select>
                      <div style={sub}>
                        {accounts === null
                          ? "Loading your team\u2026"
                          : accounts.length === 0
                            ? "Nobody on your team has a Jungle account yet. Invite them from Team."
                            : "Linking a coach to their account is the only thing that lets a cover request reach them."}
                      </div>
                    </>
                  ) : (
                    <div style={sub}>
                      Linking a coach to their Jungle account needs the gym to be online. This device
                      has no server configured, so there are no accounts to link to &mdash; the roster,
                      the availability and the cover requests all stay here.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                    <button onClick={() => saveDetails(c)} style={btn(true)}>Save</button>
                    <button onClick={() => { setDetailsFor(null); setDraft(null); }} style={btn(false)}>Cancel</button>
                  </div>
                </div>
              )}

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
      {isManager && coverage.unknown.length > 0 && (
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

      {isManager && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") addCoach(newName); }}
                 placeholder="Add a coach by name" aria-label="Add a coach by name"
                 style={{ ...field, flex: 1, minWidth: 0 }} />
          <button onClick={() => addCoach(newName)} disabled={!newName.trim()}
                  style={{ ...btn(!!newName.trim()), cursor: newName.trim() ? "pointer" : "default" }}>Add coach</button>
        </div>
      )}

      {/* ── Ask for cover ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>Need cover?</div>
        {coaches.length === 0 ? (
          <div style={sub}>Put a coach on the roster first &mdash; a cover request has to go to somebody.</div>
        ) : askable.length === 0 ? (
          // A coach with no classes on the schedule. Saying so beats a picker
          // that opens onto nothing.
          <div style={sub}>
            None of the classes on the schedule are typed under your name, so there is nothing here to ask cover for.
          </div>
        ) : (
          <>
            <select value={askClassId} onChange={e => setAskClassId(e.target.value)}
                    aria-label="Class that needs cover"
                    style={{ ...field, width: isMobile ? "100%" : "auto", maxWidth: "100%", marginBottom: "8px" }}>
              <option value="">Pick a class&hellip;</option>
              {(askable || []).map(c => (
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
      {myAsks.length > 0 && (
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
          {/* The sentence below used to be unconditional, and it was true: with
              no server there is no signed-in user. It is now the ELSE branch,
              because for a signed-in coach it would be false — and a product
              that keeps apologising for a limitation it no longer has is as
              inaccurate as one that hides a limitation it does have. */}
          <div style={{ ...sub, marginBottom: "10px" }}>
            {mode === "self"
              ? <>You can answer the requests aimed at you, and withdraw the ones you raised.</>
              : userId
              ? <>You are signed in as a manager, so you can answer any of these on the studio&rsquo;s behalf.</>
              : <>Anyone using this device can answer these &mdash; Jungle cannot tell which coach you are
                 until the gym is online.</>}
          </div>
          {myAsks.map(r => (
            <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>
                {r.classDay} {r.classSlot} · {r.classLabel}
              </div>
              <div style={{ ...sub, marginBottom: "8px" }}>
                {nameOf(r.fromCoachId)} asked {nameOf(r.toCoachId)}
                {/* ⚠️ Said BEFORE the button, not only in the toast after it. A
                    cover request has no date, so approving one rewrites the
                    recurring rule — the person deciding has to know that while
                    they are deciding, not once it has happened. */}
                {recurrenceOf(r) && (
                  <div style={{ marginTop: "3px" }}>
                    Approving moves it to them <strong style={{ color: "var(--text)" }}>every {r.classDay} {r.classSlot} from now on</strong> &mdash;
                    Jungle cannot cover a single date yet.
                  </div>
                )}
              </div>
              {/* 🔴 ANSWERING AND WITHDRAWING ARE DIFFERENT PEOPLE'S ACTIONS.
                  Approve/Turn down belong to the coach who was ASKED — it is
                  their yes or no. Withdraw belongs to the one who RAISED it.
                  A manager gets both because they act for the studio; before
                  S32 everyone got both, because the panel could not tell
                  anybody apart. */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(isManager || (me && r.toCoachId === me.id)) && (<>
                  <button onClick={() => settle(r.id, "approved")}
                          aria-label={`Approve cover for ${r.classLabel}`} style={btn(true)}>Approve</button>
                  <button onClick={() => settle(r.id, "rejected")}
                          aria-label={`Turn down cover for ${r.classLabel}`} style={btn(false)}>Turn it down</button>
                </>)}
                {(isManager || (me && r.fromCoachId === me.id)) && (
                  <button onClick={() => settle(r.id, "cancelled")}
                          aria-label={`Withdraw the cover request for ${r.classLabel}`} style={btn(false)}>Withdraw</button>
                )}
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
