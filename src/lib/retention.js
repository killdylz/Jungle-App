// ─── At-risk detection (N3 / F5) ─────────────────────────────────────────────
//
// The spec is emphatic and it is right: **at-risk v1 is SQL, not LLM.** Two
// transparent rules. The model may later draft a win-back message and explain a
// flag in prose — it does not decide who is at risk. An operator has to trust the
// rule enough to phone a member about it, and a lawyer has to be able to read it.
//
// So everything here is arithmetic over attendance rows, every flag carries the
// numbers that produced it, and `reason` states the rule in plain words rather
// than asserting a conclusion.
//
// THE HONESTY PROBLEM THIS MODULE EXISTS TO AVOID
// A naive absence rule ("last visit >14 days ago") flags EVERY member the moment
// a studio imports historical attendance — the backfill is by definition old. A
// screen of 400 false alarms on day one is worse than no screen: the operator
// learns to ignore it, and A3 ("do operators act on alerts?") is answered "no"
// by our own bug rather than by the market.
//
// So the absence rule is gated on the STUDIO having recent activity. If nothing
// has been recorded lately, that is a fact about the data, not about the members,
// and it is reported as such.

// The rule identifiers, pinned in ONE place. These are written into a Postgres
// CHECK constraint (0008), and a constrained column rejecting a client value is
// this repo's recurring data-loss bug — three occurrences. Nothing may spell
// these strings inline; a unit test asserts these exact contents.
export const RETENTION_RULES = ["new_member_low_visits", "absence"];
// Destructured from the list rather than re-typed, so a flag can never carry a
// rule name the constraint does not know about.
const [RULE_NEW_MEMBER, RULE_ABSENCE] = RETENTION_RULES;

// ── Who is eligible to be flagged at all ────────────────────────────────────
// Both rules ask "is this member drifting away?". That question is meaningless
// for two of the three membership statuses, and both are reachable from the
// Members screen's own dropdown:
//
//   cancelled — they have LEFT. "At risk of leaving" is not a warning about
//               someone who already left; it is the screen failing to notice.
//   paused    — absent BY AGREEMENT (injury, travel, a paused membership). The
//               absence rule fires on precisely the absence the gym agreed to.
//
// Both produced a flag the operator could not act on: `winBackBlockedReason`
// already refuses a draft for anything but "active", so the screen raised an
// alarm and then explained it would not help with it. That is the false-alarm
// failure this file's header exists to prevent, arriving through another door.
//
// Stated as the EXCLUDED set rather than a whitelist of "active" on purpose. A
// status added later (a trial, say) then defaults to being monitored: an extra
// flag is visible and gets argued with, whereas a member silently dropped out of
// at-risk detection is invisible, and invisible wrongness is the kind this repo
// treats as worst. `retention.test.js` asserts this list classifies every value
// in `MEMBER_STATUSES`, so adding one forces the decision rather than defaulting.
export const INACTIVE_STATUSES = ["paused", "cancelled"];
// An unknown or missing status counts as current, matching `memberStatus`'s own
// coercion — a row with no status is a member, not a non-member.
//
// EXPORTED because the check-in sweep asks the same question (session 20). It
// used to answer it by not asking: `CheckInPanel` offered every row in the
// roster, so a member who left two years ago sat in the mid-class list at full
// brightness, indistinguishable from someone standing in the room. Two
// definitions of "is this still one of our members" is exactly the drift that
// makes one screen say `Roster · 1` while another lists three names.
export const isCurrentMember = m => !INACTIVE_STATUSES.includes(String(m?.status || "").toLowerCase());

export const ABSENCE_DAYS = 14;        // spec: 14-day absence
export const NEW_MEMBER_WINDOW_DAYS = 30;
export const NEW_MEMBER_MIN_VISITS = 4; // spec: <4 visits in month one
export const NEW_MEMBER_GRACE_DAYS = 14; // don't judge someone who joined this week

const DAY_MS = 86_400_000;
const dayOf = iso => (iso ? String(iso).slice(0, 10) : "");
const msOf = iso => { const t = Date.parse(iso); return Number.isNaN(t) ? null : t; };
// "Days ago" is a CALENDAR question, not an elapsed-time one. Everything this
// reasons over is a day: an imported check-in carries a date-only value the
// importer anchors at noon UTC, and a coach saying "she was last in three days
// ago" is counting dates off a wall calendar, not 72-hour intervals.
//
// Flooring the raw millisecond difference answered a different question and got
// it wrong twice over. An imported gap of Jun 19 → Aug 3 — 45 days on any
// calendar — read as 44 for every run before 20:00 SGT, because noon UTC is
// 20:00 local and the span was still 44.6 days wide. And a member who trained
// yesterday evening read as "0 days ago". Both are numbers the at-risk panel
// explicitly invites an owner to argue with, so both had to be the number the
// owner would arrive at themselves.
//
// Round, not floor: a DST transition inside the span leaves it 23 or 25 hours
// short of a whole multiple, and a floor would quietly drop a day.
const startOfDay = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);

/**
 * Per-member attendance facts. Pure; no assumptions about ordering.
 * @returns Map memberId -> { visits, firstMs, lastMs }
 */
export function attendanceIndex(attendance = []) {
  const idx = new Map();
  attendance.forEach(a => {
    const ms = msOf(a?.checkedInAt);
    if (!a?.memberId || ms == null) return;
    const e = idx.get(a.memberId) || { visits: 0, firstMs: ms, lastMs: ms };
    e.visits++;
    if (ms < e.firstMs) e.firstMs = ms;
    if (ms > e.lastMs) e.lastMs = ms;
    idx.set(a.memberId, e);
  });
  return idx;
}

/**
 * Is the studio currently recording attendance at all?
 * Used to gate the absence rule — see the note at the top of this file.
 */
export function studioActivity(attendance = [], now = Date.now()) {
  let latest = null;
  attendance.forEach(a => { const ms = msOf(a?.checkedInAt); if (ms != null && (latest == null || ms > latest)) latest = ms; });
  return {
    lastCheckInMs: latest,
    daysSince: latest == null ? null : daysBetween(now, latest),
    recording: latest != null && daysBetween(now, latest) <= ABSENCE_DAYS,
  };
}

/**
 * The two rules. Returns one flag per at-risk member, most urgent first.
 *
 * Every flag carries the arithmetic that produced it (`visits`, `daysSince`,
 * `since`) so the UI can show the operator WHY, and so the rule can be argued
 * with rather than merely believed.
 */
export function atRiskMembers(members = [], attendance = [], opts = {}) {
  const now = opts.now ?? Date.now();
  const idx = attendanceIndex(attendance);
  const activity = studioActivity(attendance, now);
  const flags = [];

  (members || []).forEach(m => {
    // Gate 3, alongside rule 2's `activity.recording` and rule 1's known join
    // date: a flag is a claim about a CURRENT member. See INACTIVE_STATUSES.
    if (!m?.id || !isCurrentMember(m)) return;
    const e = idx.get(m.id);
    const visits = e?.visits || 0;
    // Rule 1 is a claim about TENURE, so it may only run on a join date we
    // actually hold. It used to fall back to the member's first recorded
    // check-in, which reads as obviously right at n=1 and inverts at corpus
    // scale: an established gym importing a short recent export has a roster
    // whose every "first visit" lands inside the 30-day window, so most of it is
    // announced as new members failing to build a habit — each citing a join date
    // that was never in the data. Measured: 9 of 12. Rule 2 has been gated
    // against exactly this failure since it was written (`activity.recording`);
    // this is rule 1's equivalent gate. `addMember` always sets `joinedAt`, so
    // only CSV-imported members are affected, and they are precisely the members
    // whose tenure is unknown. An honest silence beats a confident wrong date —
    // and a member who really has stopped coming is still caught by rule 2.
    const joinedMs = msOf(m.joinedAt);

    // ── Rule 1: a new member who isn't building a habit.
    // Month one is when a membership is won or lost, so this fires while there is
    // still time to act — but only after a grace period, because "joined three
    // days ago and has been twice" is a good start, not a warning.
    if (joinedMs != null) {
      const age = daysBetween(now, joinedMs);
      if (age >= NEW_MEMBER_GRACE_DAYS && age <= NEW_MEMBER_WINDOW_DAYS && visits < NEW_MEMBER_MIN_VISITS) {
        flags.push({
          memberId: m.id, name: m.name || "", rule: RULE_NEW_MEMBER,
          reason: `Joined ${age} days ago and has attended ${visits} time${visits === 1 ? "" : "s"} — fewer than ${NEW_MEMBER_MIN_VISITS} in their first month.`,
          visits, daysSince: e ? daysBetween(now, e.lastMs) : age,
          since: dayOf(new Date(joinedMs).toISOString()),
          severity: NEW_MEMBER_MIN_VISITS - visits + 2,   // fewer visits = more urgent
        });
        return;   // one flag per member: the more actionable rule wins
      }
    }

    // ── Rule 2: a member who was attending and has stopped.
    // Gated on the studio actually recording — otherwise a historical import
    // flags the entire roster and the alert becomes noise (see the file header).
    if (activity.recording && e && visits > 0) {
      const daysSince = daysBetween(now, e.lastMs);
      if (daysSince >= ABSENCE_DAYS) {
        flags.push({
          memberId: m.id, name: m.name || "", rule: RULE_ABSENCE,
          reason: `Last attended ${daysSince} days ago, after ${visits} visit${visits === 1 ? "" : "s"} — more than ${ABSENCE_DAYS} days away.`,
          visits, daysSince, since: dayOf(new Date(e.lastMs).toISOString()),
          severity: Math.min(10, Math.floor(daysSince / ABSENCE_DAYS) + 1),
        });
      }
    }
  });

  return flags.sort((a, b) => b.severity - a.severity || b.daysSince - a.daysSince
                              || (a.name || "").localeCompare(b.name || ""));
}

/**
 * Apply the operator's own actions to a set of flags.
 *
 * The actions ledger is append-only (0008), so "current state" is the LATEST
 * event per (member, rule) — the same shape consent_records uses, and for the
 * same reason: A3 asks whether operators act on alerts, and a mutable row would
 * destroy the very history that answers it.
 *
 * WHEN DOES AN ACTIONED FLAG COME BACK? This is the judgement call in the whole
 * feature. Suppressing forever means a member who lapses, is called, returns,
 * and lapses again is never flagged the second time — which is exactly the case
 * an operator most wants to know about. Re-flagging immediately makes the
 * dismiss button useless.
 *
 * So: an action suppresses its flag until the member is SEEN AGAIN. A check-in
 * after the action closes that episode; a later lapse is a genuinely new one.
 * A member who never returns stays suppressed, which is correct — the operator
 * already dealt with them and does not need reminding forever.
 *
 * @returns { active, handled } — handled flags keep their action so the UI can
 *          show what was done and when, rather than hiding the work.
 */
export function applyRetentionActions(flags = [], actions = [], attendance = [], opts = {}) {
  const idx = opts.index || attendanceIndex(attendance);
  const latest = new Map();
  (actions || []).forEach(a => {
    if (!a?.memberId || !a?.rule) return;
    const ms = msOf(a.occurredAt);
    if (ms == null) return;
    const k = `${a.memberId}::${a.rule}`;
    const prev = latest.get(k);
    if (!prev || ms > prev.ms) latest.set(k, { ...a, ms });
  });

  const active = [], handled = [];
  (flags || []).forEach(f => {
    const act = latest.get(`${f.memberId}::${f.rule}`);
    if (!act || act.action === "reopened") { active.push(f); return; }
    const lastSeenMs = idx.get(f.memberId)?.lastMs ?? null;
    // Seen since the action → the episode closed and this flag is a new one.
    if (lastSeenMs != null && lastSeenMs > act.ms) { active.push(f); return; }
    handled.push({ ...f, action: act.action, actionAt: act.occurredAt, actionNote: act.note || "" });
  });
  return { active, handled };
}

/**
 * What the operator should be told, INCLUDING when the answer is "we can't tell".
 * `state` is one of:
 *   "no-data"      — nothing recorded; say so rather than showing a green all-clear
 *   "not-recording"— rows exist but none recently; the absence rule is suppressed
 *   "ok"           — recording, no members flagged
 *   "flagged"      — recording, and these members meet a rule
 */
export function retentionSummary(members = [], attendance = [], opts = {}) {
  const now = opts.now ?? Date.now();
  const activity = studioActivity(attendance, now);
  const flags = atRiskMembers(members, attendance, { now });

  let state;
  if (!attendance.length) state = "no-data";
  else if (!activity.recording) state = "not-recording";
  else state = flags.length ? "flagged" : "ok";

  return {
    state, flags, activity,
    members: (members || []).length,
    // Never claim a healthy roster we haven't measured. `null` means unknown,
    // and the UI must render that differently from zero.
    atRisk: state === "no-data" || state === "not-recording" ? null : flags.length,
  };
}

// Human-readable one-liner for the UI. Kept here so the wording that explains a
// rule lives next to the rule itself.
//
// `counts` carries the post-action figures from applyRetentionActions. Without
// them this sentence describes raw flags while the headline number describes
// active ones, and the card says "2" next to "3 members meet an at-risk rule" —
// caught by driving it. A screen that contradicts itself is not one an operator
// will trust enough to phone a member about.
export function describeRetention(s, counts = {}) {
  const active = counts.active ?? s.flags.length;
  const handled = counts.handled ?? 0;
  switch (s.state) {
    case "no-data":
      return "No attendance recorded yet — at-risk detection starts once members are checked in.";
    case "not-recording":
      return `No check-ins in the last ${ABSENCE_DAYS} days, so absence alerts are paused. They resume once classes are being recorded again${s.activity.daysSince != null ? ` (last check-in was ${s.activity.daysSince} days ago)` : ""}.`;
    case "ok":
      return "No members currently meet an at-risk rule.";
    default: {
      const done = handled ? ` ${handled} already handled.` : "";
      // Everything flagged has been dealt with — say THAT, not "0 members".
      if (active === 0) return `Every flagged member has been handled${handled ? ` (${handled})` : ""}.`;
      return `${active} member${active === 1 ? "" : "s"} need${active === 1 ? "s" : ""} attention.${done}`;
    }
  }
}
