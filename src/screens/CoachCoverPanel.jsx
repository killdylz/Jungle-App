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
         selfCoach,
         COACH_AVAIL_STALE_DAYS } from "../lib/coachRoster.js";
// ⚠️ `settleCover` is deliberately NOT imported here any more. The panel used to
// call it directly and write the result; it now goes through
// `store.settleCoverRequest`, which puts the server's conditional update in
// front of it. Calling the pure version from a screen again would restore
// exactly the last-writer-wins approval this session removed.
import { openCovers, deliveryTruth, reachableCoaches } from "../lib/coverRequests.js";
import { absenceError, classesAffectedBy, absencesFor, isAwayOn } from "../lib/coachAbsence.js";
import { coverApprovedPayload, pushCoverApproved } from "../lib/bookingAdapter.js";
import { RULE_DAYS } from "../lib/scheduleInstances.js";
import { useToast } from "../ui/toast.jsx";
import { localDateStr } from "../lib/format.js";

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

export function CoachCoverPanel({ userClasses, onCoversChanged, isMobile }) {
  const { toast } = useToast();
  const [coaches, setCoaches] = React.useState(() => store.getCoaches());
  const [requests, setRequests] = React.useState(() => store.getCoverRequests());
  const [newName, setNewName] = React.useState("");
  const [editing, setEditing] = React.useState(null);      // roster id whose grid is open
  const [detailsFor, setDetailsFor] = React.useState(null); // roster id whose edit form is open
  const [draft, setDraft] = React.useState(null);           // { name, aliasText, active, userId }
  const [accounts, setAccounts] = React.useState(null);     // null = not loaded / no server
  const [pendingRemove, setPendingRemove] = React.useState(null);
  const [absences, setAbsences] = React.useState(() => store.getAbsences());
  // `coachId` only matters in manager mode; a coach records their own.
  const [absForm, setAbsForm] = React.useState({ coachId: "", from: "", to: "", note: "" });
  const [absError, setAbsError] = React.useState("");
  // Manager mode has no identity to claim on behalf of, so it picks. Keyed by
  // request id so two rows cannot share one selection.
  const [assignTo, setAssignTo] = React.useState({});
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
      if (r) { setCoaches(r.coaches); setRequests(r.requests); setAbsences(r.absences || []); }
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

  // ⚠️ THE BOARD IS THE SAME FOR EVERYONE, which is the whole point of a
  // broadcast. It is NOT filtered to who claims to be free — an availability
  // grid is a claim somebody typed weeks ago, not a rota, and hiding a class
  // from a coach who could have taken it is how it goes uncovered. What the
  // rows carry instead is whether YOU said you were free then, so the ones you
  // can take stand out without the rest disappearing.
  // ⚠️ FROM TODAY ONWARDS. A request whose day has passed without anyone taking
  // it is a fact about the past, not a job — leaving it on the board means the
  // list only ever grows and stops being read. It stays in the absence's count,
  // where "that class went uncovered" is exactly the right thing to record.
  const board = openCovers(requests, { from: localDateStr(nowMs) });
  const myAbsences = me ? absencesFor(absences, me.id) : [];
  // A manager sees the gym's; a coach sees their own.
  const shownAbsences = isManager
    ? (absences || []).filter(a => a && !a.cancelledAt)
        .sort((a, b) => String(b.from).localeCompare(String(a.from)))
    : myAbsences;
  // ⚠️ A CLASS'S OWN COACH IS STILL OFFERED AS COVER FOR IT, AND THAT IS A REAL
  // DEFECT THIS SESSION DECIDED NOT TO FIX HERE. `ask()` takes `fromCoachId`
  // from the class's typed coach, so asking that same person produces a request
  // whose from and to are one id — "Mara asked Mara". The one-line filter was
  // written and reverted: it is a product change nobody asked for, and it turns
  // a 🔴 e2e assertion red (coachCover.spec.js:146 seeds a stale claim on the
  // class's own coach to prove a stale claim is offered WITH its age). Changing
  // that fixture to accommodate an unrequested change is how a test stops
  // proving what it was written for. Written up for its own commit instead.
  const nameOf = id => (coaches.find(c => c.id === id)?.name) || "someone";

  // Who could take one board row: free at that slot, and not themselves away
  // that day. ⚠️ The away check is the one place the two halves of this feature
  // have to know about each other — offering a class to somebody whose own
  // absence covers it is how a gym ends up with two people missing.
  const candidatesFor = (req) => coachesFreeAt(coaches, { day: req.classDay, slot: req.classSlot }, nowMs)
    .filter(f => !isAwayOn(absences, f.coach.id, req.classDate));

  // How much of one absence still has nobody. Counted from the live requests
  // rather than stored on the absence, so withdrawing or claiming one is
  // reflected without a second write that could disagree.
  const absenceProgress = (a) => {
    const mine = (requests || []).filter(r => r && r.absenceId === a.id && r.status !== "cancelled");
    const covered = mine.filter(r => r.status === "approved").length;
    return { total: mine.length, covered };
  };

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

  // A local YYYY-MM-DD rendered for a human. ⚠️ Built with `new Date(y, m-1, d)`,
  // NOT `new Date(str)` — the latter is UTC midnight and prints the day before
  // anywhere west of Greenwich, which is the trap CLAUDE.md records and the one
  // this whole feature would be most embarrassed by.
  const fmtDay = (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return "";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined,
      { weekday: "short", day: "numeric", month: "short" });
  };

  // What the product is allowed to claim about anything raised here.
  const truth = deliveryTruth({ serverConfigured: supabaseEnabled, storageReady,
                                reachableCoaches: reachableCoaches(coaches) });
  const truthTail = truth === "waiting" ? ""
    : truth === "unreached"
      ? " Nobody on the roster has a Jungle account yet, so tell them yourself."
      : " It is on this device only \u2014 no one else\u2019s Jungle can see it.";

  const recordAbsence = async () => {
    const coachId = isManager ? absForm.coachId : me?.id;
    if (!coachId) { setAbsError("Pick which coach is away."); return; }
    const err = absenceError(absForm);
    if (err) { setAbsError(err); return; }
    setAbsError("");

    const { absence, absences: nextAbs } = store.addAbsence({ coachId, from: absForm.from,
                                                              to: absForm.to, note: absForm.note });
    // `addAbsence` refuses the same ranges `absenceError` does; this is the
    // belt for that brace rather than a second opinion about what is legal.
    if (!absence) { setAbsError("That absence could not be recorded."); return; }
    setAbsences(nextAbs);

    // Which classes it takes them away from is DERIVED, never stored — see
    // coachAbsence.js. The roster entry is passed rather than the id because
    // matching is by name and alias, which only the entry knows.
    const coach = coaches.find(c => c.id === coachId);
    const affected = classesAffectedBy(userClasses, coach, absence);
    const r = store.raiseCoversForAbsence(absence, affected);
    setRequests(r.requests);
    if (onCoversChanged) onCoversChanged();
    setAbsForm(f => ({ ...f, from: "", to: "", note: "" }));

    const n = r.created.length;
    toast(n === 0
      ? `Recorded \u2014 ${coach?.name || "they"} teach nothing those days, so there is nothing to cover.`
      : `Recorded. ${n} class${n === 1 ? "" : "es"} ${n === 1 ? "is" : "are"} on the cover board.${truthTail}`);
  };

  const withdrawAbsence = async (id) => {
    const r = await store.cancelAbsence(id);
    setAbsences(r.absences);
    setRequests(store.getCoverRequests());
    if (onCoversChanged) onCoversChanged();
    // 🔴 SAYS WHAT SURVIVED. A cover somebody already agreed to take is NOT
    // withdrawn — they planned their week around it — and a coach who thinks
    // cancelling their leave un-asked everything would turn up to a class
    // somebody else is teaching.
    toast(r.kept
      ? `Back on the schedule. ${r.withdrawn} ask${r.withdrawn === 1 ? "" : "s"} withdrawn; `
        + `${r.kept} already taken and left in place \u2014 talk to them.`
      : `Back on the schedule. ${r.withdrawn} ask${r.withdrawn === 1 ? "" : "s"} withdrawn.`);
  };

  const claim = async (id, coachId) => {
    if (!coachId) { toast("Pick which coach is taking it"); return; }
    // 🔴 THE SERVER DECIDES THIS ONE. `settleCoverRequest` runs the conditional
    // update and only writes locally once Postgres has agreed, so the losing
    // branch is a real answer from a real race rather than this device noticing
    // its own double-tap. It falls back to the device-only path when there is
    // no server or no table.
    const r = await store.settleCoverRequest(id, "approved", { now: nowMs, coachId });
    setRequests(store.getCoverRequests());
    if (onCoversChanged) onCoversChanged();
    if (!r.changed) {
      toast(r.reason === "gone" ? "That class is no longer on the board"
          : r.reason === "unconfirmed"
            ? "Could not reach the server, so nothing was changed \u2014 try again"
            : `Somebody got there first \u2014 ${nameOf(r.request?.toCoachId)} is taking it`);
      return;
    }
    const to = coaches.find(c => c.id === coachId);
    // The seam. The no-op is still the only adapter, so this always reports that
    // nothing left Jungle. The payload is RECORDED, keyed so the same
    // substitution can never be handed over twice.
    const out = await pushCoverApproved(
      coverApprovedPayload({ request: r.request, fromName: nameOf(r.request.fromCoachId),
                             toName: to?.name || "" }),
      { read: store.getBookingOutbox, write: store.saveBookingOutbox });
    // ⚠️ "JUST THAT DAY" IS THE SENTENCE THAT CHANGED. It used to say the class
    // moved every Monday from now on, because it did. Nothing writes to the
    // schedule any more.
    toast(`${to?.name || "They"} teach ${r.request.classLabel} on ${fmtDay(r.request.classDate)} `
        + `\u2014 just that day. ${out.reason}`);
  };

  const withdrawCover = async (id) => {
    const r = await store.settleCoverRequest(id, "cancelled", { now: nowMs });
    setRequests(store.getCoverRequests());
    if (onCoversChanged) onCoversChanged();
    toast(r.changed
      ? `Taken off the board \u2014 ${r.request.classLabel} on ${fmtDay(r.request.classDate)} still needs its usual coach`
      : "That class is no longer on the board");
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

      {/* ── "I'm away" ─────────────────────────────────────────────────────── */}
      {/* 🔴 THE ENTRY POINT CHANGED IN S33 AND THIS IS IT. It used to be "pick a
          class that needs cover", which is class-first: a coach away for a week
          had six separate asks to raise and the gym had nothing that said "Mara
          is away Mon-Fri and two of hers still have nobody". Being away is a
          fact about a PERSON OVER DATES, so that is what gets recorded, and the
          classes are derived from the schedule. */}
      {mode !== "unlinked" && (
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>
          {isManager ? "Record an absence" : "When you’re away"}
        </div>
        {coaches.length === 0 ? (
          <div style={sub}>Put a coach on the roster first &mdash; an absence has to belong to somebody.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {isManager && (
              <select value={absForm.coachId} onChange={e => setAbsForm(f => ({ ...f, coachId: e.target.value }))}
                      aria-label="Coach who is away" style={{ ...field, maxWidth: "100%" }}>
                <option value="">Which coach&hellip;</option>
                {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {/* `type="date"` hands back a local YYYY-MM-DD, which is exactly
                  the vocabulary coachAbsence.js works in. No parsing anywhere. */}
              <label style={{ ...sub, display: "flex", flexDirection: "column", gap: "3px" }}>
                First day away
                <input type="date" value={absForm.from} aria-label="First day away"
                       onChange={e => setAbsForm(f => ({ ...f, from: e.target.value }))}
                       style={{ ...field, colorScheme: "dark" }} />
              </label>
              <label style={{ ...sub, display: "flex", flexDirection: "column", gap: "3px" }}>
                Last day away
                <input type="date" value={absForm.to} aria-label="Last day away"
                       onChange={e => setAbsForm(f => ({ ...f, to: e.target.value }))}
                       style={{ ...field, colorScheme: "dark" }} />
              </label>
            </div>
            <input value={absForm.note} onChange={e => setAbsForm(f => ({ ...f, note: e.target.value }))}
                   placeholder="Why, if it helps (optional)" aria-label="Reason for the absence"
                   style={{ ...field, width: "100%", boxSizing: "border-box" }} />
            {/* The refusal, printed verbatim. `absenceError` returns a sentence
                precisely so this does not have to translate a code. */}
            {absError && (
              <div data-testid="absence-error" style={{ ...sub, color: "var(--warn)" }}>{absError}</div>
            )}
            <div>
              <button onClick={recordAbsence} style={btn(true)}>
                {isManager ? "Record absence and ask for cover" : "I’m away — ask for cover"}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Who is away, and how much of it has nobody ─────────────────────── */}
      {shownAbsences.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "14px" }}>
          <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>Away</div>
          {shownAbsences.map(a => {
            const p = absenceProgress(a);
            return (
              <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: "10px",
                                       padding: "10px 12px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>
                    {nameOf(a.coachId)}
                  </span>
                  <span style={sub}>
                    {fmtDay(a.from)}{a.to !== a.from ? ` – ${fmtDay(a.to)}` : ""}
                    {a.note ? ` · ${a.note}` : ""}
                  </span>
                </div>
                <div style={{ ...sub, marginTop: "3px" }}>
                  {/* Counted from the live requests, so it cannot disagree with
                      the board two inches below it. */}
                  {/* ⚠️ ONE STATEMENT OF ONE FACT. This read "0 of 2 covered —
                      2 still have nobody", which is the same number twice in one
                      sentence and makes a reader stop to check they mean the
                      same thing. Same defect `availSummary` above was fixed for,
                      and found the same way: by rendering the panel and reading
                      it rather than by a test. */}
                  {p.total === 0
                    ? <>No classes still to come those days.</>
                    : p.covered === 0
                      ? <><strong style={{ color: "var(--text)" }}>{p.total} class{p.total === 1 ? "" : "es"}</strong>, nobody yet.</>
                      : p.covered === p.total
                        ? <strong style={{ color: "var(--text)" }}>All {p.total} covered.</strong>
                        : <>{p.covered} of {p.total} covered &mdash;{" "}
                           <strong style={{ color: "var(--text)" }}>{p.total - p.covered} still {p.total - p.covered === 1 ? "has" : "have"} nobody</strong>.</>}
                </div>
                <div style={{ marginTop: "8px" }}>
                  <button onClick={() => withdrawAbsence(a.id)}
                          aria-label={`${nameOf(a.coachId)} is back — withdraw this absence`}
                          style={btn(false)}>I&rsquo;m back</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── The board ──────────────────────────────────────────────────────── */}
      {/* 🔴 EVERY OPEN CLASS, TO EVERYONE. There is no addressee any more: the
          first coach to claim one takes it, and the race is decided by Postgres
          rather than by whoever's screen refreshed last. */}
      {board.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "14px" }}>
          <div style={{ ...h, fontSize: "13px", marginBottom: "8px" }}>Classes needing cover</div>
          <div style={{ ...sub, marginBottom: "10px" }}>
            {mode === "self"
              ? <>Anyone free can take these. The first to claim one gets it.</>
              : userId
              ? <>You can assign any of these on the studio&rsquo;s behalf.</>
              : <>Anyone using this device can assign these &mdash; Jungle cannot tell which coach you are
                 until the gym is online.</>}
          </div>
          {board.map(r => {
            const cands = candidatesFor(r);
            const iAmFree = !!me && cands.some(f => f.coach.id === me.id);
            const iAmAway = !!me && isAwayOn(absences, me.id, r.classDate);
            return (
              <div key={r.id} data-testid="cover-row"
                   style={{ border: "1px solid var(--border)", borderRadius: "10px",
                            padding: "10px 12px", marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>
                  {fmtDay(r.classDate)} {r.classSlot} &middot; {r.classLabel}
                </div>
                <div style={{ ...sub, marginBottom: "8px" }}>
                  {nameOf(r.fromCoachId)} is away
                  {/* ⚠️ ONE DAY. The sentence this replaced said the class moved
                      every Monday from now on, because it did. */}
                  {" "}&mdash; this covers <strong style={{ color: "var(--text)" }}>that day only</strong>.
                  {cands.length === 0 && <> Nobody has said they are free then.</>}
                </div>
                {mode === "self" ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => claim(r.id, me.id)} disabled={iAmAway}
                            aria-label={`Take ${r.classLabel} on ${fmtDay(r.classDate)}`}
                            style={{ ...btn(!iAmAway), cursor: iAmAway ? "default" : "pointer",
                                     opacity: iAmAway ? 0.55 : 1 }}>
                      I&rsquo;ll take it
                    </button>
                    {/* Never hidden, only labelled: see `board` above. */}
                    <span style={sub}>
                      {iAmAway ? "You are away that day too"
                               : iAmFree ? "You said you are free then"
                                         : "You have not said you are free then"}
                    </span>
                    {r.fromCoachId === me?.id && (
                      <button onClick={() => withdrawCover(r.id)}
                              aria-label={`Take ${r.classLabel} on ${fmtDay(r.classDate)} off the board`}
                              style={btn(false)}>Not needed</button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    <select value={assignTo[r.id] || ""} aria-label={`Coach to cover ${r.classLabel} on ${fmtDay(r.classDate)}`}
                            onChange={e => setAssignTo(m => ({ ...m, [r.id]: e.target.value }))}
                            style={{ ...field, maxWidth: "100%" }}>
                      <option value="">Who is taking it&hellip;</option>
                      {/* Free coaches first and labelled as such; everyone else
                          still selectable, because a stale grid is not a rota. */}
                      {cands.map(f => (
                        <option key={f.coach.id} value={f.coach.id}>
                          {f.coach.name} &mdash; {f.state === "stale" ? `said so ${f.days} days ago` : "free then"}
                        </option>
                      ))}
                      {coaches.filter(c => c.active !== false
                                        && !cands.some(f => f.coach.id === c.id)
                                        && !isAwayOn(absences, c.id, r.classDate)).map(c => (
                        <option key={c.id} value={c.id}>{c.name} &mdash; has not said</option>
                      ))}
                    </select>
                    <button onClick={() => claim(r.id, assignTo[r.id])}
                            aria-label={`Assign cover for ${r.classLabel} on ${fmtDay(r.classDate)}`}
                            style={btn(true)}>Assign</button>
                    <button onClick={() => withdrawCover(r.id)}
                            aria-label={`Take ${r.classLabel} on ${fmtDay(r.classDate)} off the board`}
                            style={btn(false)}>Not needed</button>
                  </div>
                )}
              </div>
            );
          })}
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
