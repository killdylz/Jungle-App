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
// The server does not work yet. `supabase/migrations/0011_coach_cover.sql` is
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
// One definition of "which local day is this occurrence on", shared with the
// absence layer that raises these requests. Two readings of that is how a cover
// and the grid cell it came from would end up on different days.
import { occurrenceDate } from "./coachAbsence.js";

// MUST stay in step with the CHECK on cover_requests.status in
// 0011_coach_cover.sql. Guarded in src/lib/dbConstraints.test.js — a constrained
// column rejecting a client value is this repo's recurring data-loss bug.
// ⚠️ `rejected` WAS HERE AND IS GONE (S33). It belonged to the directed flow —
// one named coach was asked and could say no. A cover is now offered to everyone
// who is free and taken by the first to claim it, and in that world NOT claiming
// something IS declining it: there is no addressee to record a refusal against,
// and a status nothing can ever write is a status `dbConstraints.test.js`
// correctly calls out as one the database allows and the client never produces.
export const COVER_STATUSES = ["open", "approved", "cancelled"];

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
const SETTLED = new Set(["approved", "cancelled"]);

/**
 * A cover request against ONE DATED OCCURRENCE.
 *
 * 🔴 IT TAKES AN OCCURRENCE, NOT A RULE, AND THAT IS THE WHOLE S33 CHANGE. A
 * rule is "Mondays at six"; an occurrence is "Monday the 24th at six". Built
 * from a rule, a cover could only ever mean "from now on", so approving one for
 * a coach who was ill on one Monday moved that class to somebody else EVERY
 * Monday until a human noticed. `classDate` is what makes a cover a fact about
 * one day, and `applyCovers` below is what keeps it to that day.
 *
 * `toCoachId` is deliberately EMPTY here. In the directed flow it was who was
 * being asked; it is now who is COVERING, and nobody is until somebody claims
 * it. One field, one meaning, set at the moment it becomes true.
 */
export function makeCoverForOccurrence({ id, occurrence, fromCoachId = "", absenceId = "",
                                         note = "", now = Date.now() } = {}) {
  const date = occurrence?.date || occurrenceDate(occurrence);
  if (!id || !occurrence?.ruleId || !date) return null;
  return {
    id,
    classClientId: occurrence.ruleId,
    // 🔴 DENORMALISED ON PURPOSE. The request has to keep meaning the same thing
    // when the rule is edited or deleted underneath it. "Mon 06:00 Strength Lab"
    // is what the coverer agreed to take; re-reading it from a since-changed
    // rule would quietly restate the question after it was answered, and re-
    // reading it from a DELETED rule would leave the answer attached to nothing.
    // The DATE is denormalised for the same reason and one stronger: a rule that
    // moves from Monday to Tuesday must not silently move an agreed cover with it.
    classLabel: String(occurrence.name || "").trim() || "Untitled class",
    classDay:  occurrence.day  || "",
    classSlot: occurrence.slot || "",
    classDate: date,
    // Which absence raised this, so a gym can see "Mara is away, four of her six
    // are covered" rather than six unrelated rows. "" for a one-off ask that no
    // absence produced, which is a normal state and not a gap.
    absenceId: String(absenceId || ""),
    fromCoachId,
    toCoachId: "",
    note: String(note || "").trim(),
    status: "open",
    createdAt: new Date(now).toISOString(),
    settledAt: "",
    // WHO settled it, once somebody has. Present from the start and "" until
    // then, for the same reason `availabilityAt` is: a field that only appears
    // once it has been written is a field every reader has to guard against.
    // It carries a PROFILE id (migration 0010: `settled_by uuid references
    // profiles`), not a roster id — the roster says which coach was asked, this
    // says which account pressed the button, and on a shared tablet those are
    // genuinely different questions.
    settledBy: "",
  };
}

// Settle a request. Pure: takes the list, returns a new one.
//
// `changed:false` is a normal outcome and callers must handle it — it is what
// losing the race looks like, and the whole point is that it is reported rather
// than swallowed.
// `coachId` is the ROSTER id of whoever is claiming it, recorded only on an
// approval — a cancellation has no coverer. `by` is the PROFILE id of the
// account that pressed the button, which on a shared tablet is a different
// question. Both travel through the one transition rather than through two
// functions, because the server half is a single conditional UPDATE and two
// client paths onto one server path is how they drift.
export function settleCover(list, id, next, { now = Date.now(), by = "", coachId = "" } = {}) {
  const rows = list || [];
  const i = rows.findIndex(r => r && r.id === id);
  if (i < 0) return { list: rows, request: null, changed: false, reason: "gone" };

  const cur = rows[i];
  if (!SETTLED.has(next)) return { list: rows, request: cur, changed: false, reason: "illegal" };
  // Already settled — by the other device, or by this one twice.
  if (cur.status !== "open") return { list: rows, request: cur, changed: false, reason: cur.status };

  const updated = { ...cur, status: next, settledAt: new Date(now).toISOString(),
                    // Only ever set alongside a real transition, so a row that
                    // says who settled it is a row that was settled.
                    settledBy: String(by || "") };
  // Who is now teaching it. Set ONLY on an approval: a cancelled request has no
  // coverer, and writing one would make `applyCovers` hand a class to somebody
  // who never agreed to take it.
  if (next === "approved") updated.toCoachId = String(coachId || "");
  const out = rows.slice();
  out[i] = updated;
  return { list: out, request: updated, changed: true, reason: "" };
}

export const isOpen = r => r?.status === "open";

// ─── The board (S33) ────────────────────────────────────────────────────────
//
// 🔴 `inboxFor` IS GONE AND THIS IS ITS REPLACEMENT. An inbox belonged to the
// directed flow: one named coach was asked, so there was a list that was theirs.
// A cover is now offered to EVERYONE and taken by the first to claim it, so
// there is one board that every coach sees the same way. Named `openCovers`
// rather than `available` because the honest reading is "these classes have
// nobody", which is a fact about the gym, not an offer to an individual.
//
// ⚠️ IT DOES NOT FILTER BY WHO IS FREE, and that is the same decision
// `coachesFreeAt` documents from the other end. An availability grid is a claim
// somebody typed weeks ago, not a rota: a coach whose grid says Tuesday may
// still be able to take a Thursday, and hiding the class from them means it goes
// uncovered while somebody who could have taken it never saw it. The caller
// SORTS by who claims to be free; it does not hide the rest.
export function openCovers(list, { from = "", to = "" } = {}) {
  return (list || [])
    .filter(r => isOpen(r) && r.classDate)
    .filter(r => (!from || r.classDate >= from) && (!to || r.classDate <= to))
    .sort((a, b) => a.classDate.localeCompare(b.classDate)
                 || String(a.classSlot).localeCompare(String(b.classSlot))
                 || String(a.classLabel).localeCompare(String(b.classLabel)));
}

// Every request ever raised against one dated occurrence — open, taken or
// withdrawn. The date is part of the identity now: the same class next week is
// a different thing to cover.
export function requestsForOccurrence(list, classClientId, dateStr) {
  if (!classClientId || !dateStr) return [];
  return (list || []).filter(r => r && r.classClientId === classClientId && r.classDate === dateStr);
}

// This occurrence already has an open ask. Raising a second is a double-tap, and
// two open asks for one class on one day is how two coaches both turn up.
export function openCoverForOccurrence(list, classClientId, dateStr) {
  return requestsForOccurrence(list, classClientId, dateStr).find(isOpen) || null;
}

// The approved cover for one dated occurrence, or null. This is the lookup that
// makes a cover mean one day: nothing anywhere rewrites the recurring rule.
export function coverForOccurrence(list, classClientId, dateStr) {
  return requestsForOccurrence(list, classClientId, dateStr)
    .find(r => r.status === "approved" && r.toCoachId) || null;
}

/**
 * Overlay approved covers onto a week (or range) of derived occurrences.
 *
 * 🔴 THIS IS WHY NOTHING WRITES TO THE SCHEDULE ANY MORE. Before S33, approving
 * a cover called back into the Calendar and rewrote the RULE's coach field —
 * which is permanent, because a rule has no dates. One ill Monday moved a class
 * for good. Occurrences are derived fresh on every render, so a cover applied
 * HERE lasts exactly as long as the day it names and the rule is never touched.
 *
 * ⚠️ A cover by somebody no longer on the roster is left alone rather than
 * blanked. The class still happened and somebody still taught it; replacing a
 * name we can no longer resolve with an empty string would quietly tell the gym
 * the class had no coach.
 */
export function applyCovers(occurrences, requests, roster) {
  const byKey = new Map();
  for (const r of requests || []) {
    if (r?.status !== "approved" || !r.classDate || !r.toCoachId) continue;
    byKey.set(`${r.classClientId}@${r.classDate}`, r);
  }
  if (!byKey.size) return occurrences || [];

  return (occurrences || []).map(o => {
    const date = o?.date || occurrenceDate(o);
    const hit = date ? byKey.get(`${o.ruleId}@${date}`) : null;
    if (!hit) return o;
    const name = (roster || []).find(c => c && c.id === hit.toCoachId)?.name || "";
    if (!name) return o;
    return {
      ...o,
      coachName: name,
      // Kept so a screen can say "Dev, covering for Mara" rather than silently
      // showing a different name in a slot the gym knows as somebody else's.
      coveringFor: o.coachName || "",
      coverId: hit.id,
    };
  });
}

// 🔴 THE ONE FUNCTION THAT IS ALLOWED TO SAY WHAT HAPPENED TO A REQUEST.
//
// Three outcomes, and only the third is delivery:
//
//   "device"   — no server is configured. The request exists on this phone and
//                nowhere else. Nobody will ever see it. This is the SHIPPED
//                state today and it is the default answer.
//   "unstored" — a server is configured, but `cover_requests` is not there:
//                migration 0010 has never been run (DYLAN-QUEUE A15). Added in
//                S32, and it is a CORRECTION rather than a new case. Before the
//                sync layer landed, this function answered "waiting" for any
//                gym with credentials — and "the row can reach their device"
//                was false for every one of them, because nothing pushed the
//                row anywhere. The comment below described a push that did not
//                exist. Same outcome as "device", different cause, and the
//                cause is the half a gym can act on.
//   "unreached"— a server is configured and the table is there, but NOT ONE
//                coach on the roster has an account, so the board exists and
//                nobody can open it. ⚠️ S33 widened this from "the coach being
//                asked" to "anybody at all", which is the right question once a
//                cover goes to everyone rather than to one named person — and
//                it is a WEAKER claim: one linked coach out of ten makes this
//                "waiting", and the nine who cannot see it are a fact the
//                roster shows per person rather than something this collapses.
//   "waiting"  — all of the above are satisfied. The row IS on the server and
//                reaches their device WHEN THEY NEXT OPEN JUNGLE. There is no
//                push, no email and no SMS anywhere in this product, so even
//                this is not a notification — it is a message in a bottle that
//                happens to have an addressee.
//
// ⚠️ THE ORDER OF THE TESTS IS THE MEANING. Storage is checked before reach
// because accounts are irrelevant when the row has nowhere to live: a screen
// saying "nobody has an account" about a request that could not have been stored
// either way sends the gym off to fix the wrong thing.
//
// ⚠️ `storageReady` DEFAULTS TO TRUE, and that is the honest default rather than
// a lenient one: a caller that has not probed the server cannot claim the table
// is missing, and every caller that HAS probed passes the answer. `store.js`'s
// `tableAbsent("cover_requests")` is that answer, written by the hydrate and by
// any failed push.
//
// ⚠️ "waiting" IS STILL NOT GOOD ENOUGH FOR THE CASE THIS FEATURE EXISTS FOR.
// A coach who is ill at 5am and needs cover for a 6am class needs the other
// person's phone to make a noise. Nothing here makes a noise. The UI says that
// in words rather than implying otherwise with a hopeful tick.
export function deliveryTruth({ serverConfigured, storageReady = true, reachableCoaches = 0 } = {}) {
  if (!serverConfigured) return "device";
  if (!storageReady) return "unstored";
  return reachableCoaches > 0 ? "waiting" : "unreached";
}

// How many people on the roster could actually open the board. Counted through
// `coachReach` rather than by reading `userId` here, so "can this person be
// reached at all" keeps having exactly one definition — the one whose three
// states coachRoster.js argues for.
export function reachableCoaches(roster) {
  return (roster || []).filter(c => coachReach(c) === "account").length;
}
