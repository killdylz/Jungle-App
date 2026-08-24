// ─── Cover requests: "I cannot teach this; can someone take it" ──────────────
//
// 🔴 READ THIS BEFORE BELIEVING ANYTHING THIS MODULE APPEARS TO DO.
//
// Every other feature in this product is one gym, one device, one person: a
// coach builds a class and the same coach runs it, so `localStorage` can be the
// source of truth and Supabase can sync behind it at its leisure. A COVER
// REQUEST IS TWO PEOPLE ON TWO DEVICES. Coach A raises it, coach B answers it,
// and neither device can see the other's `localStorage`. There is no
// local-first version of that. It is the first feature in this repo whose
// correctness depends on the server actually working.
//
// The server does not work yet. `supabase/migrations/0010_coach_cover.sql` is
// written and unapplied (DYLAN-QUEUE A15), joining 0005 and 0006, and the
// shipped build has no Supabase credentials at all. So on the build a gym runs
// today, a request raised here is written to ONE PHONE and read by nobody.
//
// ⚠️ THIS MODULE THEREFORE DOES NOT USE THE WORD "SENT" ANYWHERE, and neither
// may its callers. `deliveryTruth()` below is the single place that says what
// actually happened to a request, and the screen is required to print it. A
// product that says "Sent" over a row sitting in one device's localStorage is
// the same defect as the AA panel that said "passes" — a confident claim the
// system cannot back — and this repo has already shipped that once.

import { coachReach } from "./coachRoster.js";

// MUST stay in step with the CHECK on cover_requests.status in
// 0010_coach_cover.sql. Guarded in src/lib/dbConstraints.test.js — a constrained
// column rejecting a client value is this repo's recurring data-loss bug.
export const COVER_STATUSES = ["open", "approved", "rejected", "cancelled"];

// Only `open` can become anything else, and nothing can leave a settled state.
//
// 🔴 THIS IS THE RACE, AND IT IS DECIDED HERE RATHER THAN DISCOVERED LATER.
// Two coaches open the same 5am request and both press Approve; or the
// requester cancels while the recipient is approving. Both are the NORMAL case
// for an urgent ask, not an edge case. The rule is first-settle-wins and the
// loser is TOLD — `settleCover` returns `changed:false` with the status that
// actually won, so the caller can say "Dev already took this" instead of
// showing an approval that did not happen.
//
// The server half is the same rule expressed as a conditional UPDATE
// (`... where id = $1 and status = 'open'`), which Postgres decides under a row
// lock. See the migration. Both halves exist deliberately: the local one keeps
// a single device self-consistent while offline, the server one is what makes
// it true across two.
const SETTLED = new Set(["approved", "rejected", "cancelled"]);

export function makeCoverRequest({ id, classRule, fromCoachId = "", toCoachId = "", note = "", now = Date.now() } = {}) {
  if (!id || !classRule?.id) return null;
  return {
    id,
    classClientId: classRule.id,
    // 🔴 DENORMALISED ON PURPOSE. The request has to keep meaning the same thing
    // when the rule is edited or deleted underneath it. "Mon 06:00 Strength Lab"
    // is what the recipient agreed to cover; re-reading it from a since-changed
    // rule would quietly restate the question after it was answered, and re-
    // reading it from a DELETED rule would leave the answer attached to nothing.
    classLabel: String(classRule.name || "").trim() || "Untitled class",
    classDay:  classRule.day  || "",
    classSlot: classRule.slot || "",
    fromCoachId, toCoachId,
    note: String(note || "").trim(),
    status: "open",
    createdAt: new Date(now).toISOString(),
    settledAt: "",
  };
}

// Settle a request. Pure: takes the list, returns a new one.
//
// `changed:false` is a normal outcome and callers must handle it — it is what
// losing the race looks like, and the whole point is that it is reported rather
// than swallowed.
export function settleCover(list, id, next, { now = Date.now() } = {}) {
  const rows = list || [];
  const i = rows.findIndex(r => r && r.id === id);
  if (i < 0) return { list: rows, request: null, changed: false, reason: "gone" };

  const cur = rows[i];
  if (!SETTLED.has(next)) return { list: rows, request: cur, changed: false, reason: "illegal" };
  // Already settled — by the other device, or by this one twice.
  if (cur.status !== "open") return { list: rows, request: cur, changed: false, reason: cur.status };

  const updated = { ...cur, status: next, settledAt: new Date(now).toISOString() };
  const out = rows.slice();
  out[i] = updated;
  return { list: out, request: updated, changed: true, reason: "" };
}

export const isOpen = r => r?.status === "open";

// Open requests aimed at one coach — what that coach would see if they opened
// the app. Named `inboxFor` rather than `notificationsFor` because nothing is
// notified: this is a list you have to come and look at.
export function inboxFor(list, coachId) {
  if (!coachId) return [];
  return (list || []).filter(r => isOpen(r) && r.toCoachId === coachId);
}

export function requestsForClass(list, classClientId) {
  if (!classClientId) return [];
  return (list || []).filter(r => r && r.classClientId === classClientId);
}

// A class already has an open ask — raising a second one against it is almost
// always a double-tap, and two open asks for one class is how two coaches both
// turn up.
export function openRequestForClass(list, classClientId) {
  return requestsForClass(list, classClientId).find(isOpen) || null;
}

// 🔴 THE ONE FUNCTION THAT IS ALLOWED TO SAY WHAT HAPPENED TO A REQUEST.
//
// Three outcomes, and only the third is delivery:
//
//   "device"   — no server is configured. The request exists on this phone and
//                nowhere else. Nobody will ever see it. This is the SHIPPED
//                state today and it is the default answer.
//   "unreached"— a server is configured, but the coach being asked has no
//                account, so there is no person for the row to reach.
//   "waiting"  — a server is configured and the coach has an account. The row
//                can reach their device WHEN THEY NEXT OPEN JUNGLE. There is no
//                push, no email and no SMS anywhere in this product, so even
//                this is not a notification — it is a message in a bottle that
//                happens to have an addressee.
//
// ⚠️ "waiting" IS STILL NOT GOOD ENOUGH FOR THE CASE THIS FEATURE EXISTS FOR.
// A coach who is ill at 5am and needs cover for a 6am class needs the other
// person's phone to make a noise. Nothing here makes a noise. The UI says that
// in words rather than implying otherwise with a hopeful tick.
export function deliveryTruth({ serverConfigured, toCoach } = {}) {
  if (!serverConfigured) return "device";
  return coachReach(toCoach) === "account" ? "waiting" : "unreached";
}
