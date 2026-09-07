// ─── The booking-system seam (S30 §2.4) ──────────────────────────────────────
//
// The ask was: when a cover request is approved, update Mindbody, which
// propagates the change to ClassPass. This module is the SEAM for that, and one
// implementation which does nothing. There is no Mindbody code here, no
// endpoint, no credential and no `fetch`, and that is the finished state of this
// session's work on it, not a stub someone forgot to fill in.
//
// ── Why a seam and not an integration ────────────────────────────────────────
//
// 1. IT IS NOT AVAILABLE TO US. The architecture spec's risk A6 records that
//    Mindbody's API is a paid, gated partner program, and §347 lists partner-
//    program costs among the facts to re-verify at the point of commitment.
//    Nobody has verified them. There is no account, no key and no sandbox.
//
// 2. THE CLASSPASS HALF IS AN ASSUMPTION NOBODY HAS TESTED. "Update Mindbody
//    and it pushes to ClassPass" is plausible — they do integrate — but whether
//    an INSTRUCTOR SUBSTITUTION propagates, how fast, and whether ClassPass
//    tells members who already booked are three separate questions and this
//    repo answers none of them. Code that asserts any of them would be a
//    confident wrong number, which this product treats as worse than no number.
//
// 3. 🔴 IT IS THE HALF OF THE FEATURE THAT CROSSES A STRATEGIC LINE. The
//    decision doc holds a "no CRM" line for the first 1–2 years and files
//    Mindbody under "integrate, don't fight". Coach availability and finding
//    cover are staff-side operations and sit comfortably inside that; WRITING
//    BACK to the booking system a member booked through does not obviously. The
//    argument is in SESSION-HANDOFF.md so the next session can disagree with it
//    on the record. The practical blocker and the strategic one happen to point
//    the same way, which is convenient and is not the reason this is a seam.
//
// ⚠️ AND THE ASYMMETRY THAT MAKES IT MATTER, which `lib/classTypeRetention.js`
// states from the other direction: no booking system holds what was IN a class,
// which is why Jungle can compute class-type retention and Mindbody cannot. The
// mirror image is true here. MINDBODY HOLDS THE ROSTER AND THE BOOKINGS AND
// JUNGLE DOES NOT. A cover approval that changes the coach in Jungle and not in
// Mindbody leaves the two systems disagreeing about who is teaching, and
// Mindbody is the one the member booked through. So the product must not tell a
// member their coach changed on Jungle's authority — and with the no-op adapter
// installed it does not tell anyone anything, which is the honest state.

// The payload a cover approval hands to a booking system. Pinned by a contract
// test so the shape is a decision rather than whatever the call site happened to
// have in scope.
//
// Deliberately FLAT and deliberately made of strings a human could read back:
// an adapter for a system we have never called must not be handed our internal
// object graph, because the first real implementation would then be coupled to
// the roster's shape rather than to the event.
export function coverApprovedPayload({ request, fromName = "", toName = "" } = {}) {
  if (!request) return null;
  return {
    kind: "cover.approved",
    classRef:   request.classClientId || "",
    classLabel: request.classLabel || "",
    // 🔴 WHICH DAY, added S33 alongside dated cover. `day` is "Mon" — a property
    // of the recurring rule — and on its own it told a booking system to change
    // an instructor on a class that repeats, which is the permanent
    // reassignment this product spent a session removing. `date` is the one
    // occurrence that actually changed hands. "" only for a request raised
    // before dated cover existed.
    date:       request.classDate || "",
    day:        request.classDay || "",
    slot:       request.classSlot || "",
    previousCoach: String(fromName || ""),
    newCoach:      String(toName || ""),
    approvedAt: request.settledAt || "",
  };
}

// The contract. An implementation returns { pushed, system, reason }.
//
// `pushed:false` is not an error state — it is the correct answer for every
// implementation that exists today, and the caller renders `reason` verbatim.
// There is no `throw` in the contract: a booking push failing must never be able
// to prevent a cover approval from being recorded in Jungle, because the
// approval is the thing the two coaches actually agreed.
export const NO_BOOKING_SYSTEM = {
  system: "none",
  async pushCoverApproved(_payload) {
    return {
      pushed: false,
      system: "none",
      // Shown to a coach verbatim. Present tense, no promise of a future: a
      // panel promising a feature that cannot arrive is worse than no panel.
      reason: "No booking system is connected, so nothing was sent outside Jungle.",
    };
  },
};

// 🔴 THE DEFAULT IS THE NO-OP AND THERE IS DELIBERATELY NO REGISTRY, NO FLAG AND
// NO SETTING TO CHANGE IT. A `FLAGS.mindbody` would be a holding pen with
// nothing to hold — flags.js's own rule — and a settings row offering a
// connection that cannot be made is the "coming soon" panel this repo bans.
// When there is a real adapter there will be something to choose between; until
// then there is one implementation and this is it.
export function bookingAdapter() { return NO_BOOKING_SYSTEM; }


// ─── The outbox: what WOULD have been pushed (S32 §2.4) ──────────────────────
//
// Dylan has said he wants Mindbody updated when a cover is approved. That answers
// the first half of DYLAN-QUEUE A16 — yes, Jungle should write back to a booking
// system — and it does not answer the four facts that decide whether it is safe
// to build, of which question 3 is the one that could make the feature actively
// HARMFUL: if changing a class's instructor requires cancel-and-recreate, then
// pushing a cover approval DELETES THE MEMBERS' EXISTING BOOKINGS for that class.
// Nobody has confirmed an instructor-substitution endpoint exists. So there is
// still no endpoint, no credential and no `fetch` in this file.
//
// What can be built without answering any of that is the RECORD. Every approval
// now leaves a durable, inspectable copy of the exact payload a booking system
// would have been handed, which does two things a contract test cannot: it
// exercises the pinned shape against real approvals made by real people, and it
// means the day an adapter exists there is a queue to drain rather than a
// standing start.
//
// 🔴 WHY THIS IS NOT "A SECOND ADAPTER IMPLEMENTATION", which is how §2.4 asked
// for it. This file's own test suite says the reason, and it is right: "shipping
// a fake adapter in the bundle would put a second implementation one import away
// from being wired up by accident". A second implementation also forces
// `bookingAdapter()` to CHOOSE between two, which needs the registry or flag the
// header above bans in capitals. Recording is not an alternative way of pushing
// — it is a ledger of pushes — so it wraps the call instead of competing with
// it. When a real adapter lands, this keeps working unchanged and starts
// recording real pushes, which is exactly where a double-post must be stopped.
//
// ⚠️ AND THERE IS DELIBERATELY NO SCREEN FOR IT. A panel headed "3 changes
// waiting to reach Mindbody" is the "coming soon" panel this repo bans: it would
// promise a drain that cannot happen, on a queue that may never be sent at all
// if A16 question 3 comes back the wrong way. The record is for the next
// implementer and for anyone auditing what Jungle would have said. The coach is
// told what actually happened, in the toast, in present tense.
export const OUTBOX_CAP = 200;

// 🔴 THE IDEMPOTENCY KEY, and it is derived rather than minted. A retry that
// double-posts an instructor substitution is the first thing a real integration
// will get wrong, and it must be impossible BEFORE there is a real integration
// to get it wrong with — a key added later would have to be back-filled onto
// records written without one.
//
// Every field comes from the pinned payload. `date` is what makes covering the
// same class on two different days two different events — before S33 the key
// could not express that at all, because neither could the payload. `approvedAt`
// is what makes two approvals of the SAME occurrence distinct (raised, withdrawn,
// raised again), and `settleCover` guarantees it: a
// request only ever acquires `settledAt` alongside a real transition, so the
// same approval retried carries the same stamp and a later approval of the same
// class carries a different one.
//
// ⚠️ THE REQUEST ID IS DELIBERATELY NOT IN THE PAYLOAD AND IS NOT ADDED HERE.
// It would be a tidier key. It would also mean widening a contract that is
// pinned as a decision, for the benefit of our own bookkeeping rather than
// anything the receiving system needs — and `classRef` plus a timestamp already
// identifies the event uniquely.
export function coverPushKey(payload) {
  if (!payload || !payload.kind) return "";
  return [payload.kind, payload.classRef, payload.date, payload.day, payload.slot,
          payload.newCoach, payload.approvedAt].join("|");
}

// Hand a payload to whatever adapter is installed, and record the attempt.
//
// `read` and `write` are INJECTED rather than imported. This module has zero
// imports by design — the same reasoning as `csvExport.js` — and pulling in the
// localStorage seam would drag the whole store into a file whose entire job is
// to describe an event. With no seam supplied it still calls the adapter and
// still returns its answer; it simply keeps no record, which is what every
// existing caller and every contract test does today.
export async function pushCoverApproved(payload, { read, write, now = Date.now, adapter } = {}) {
  const impl = adapter || bookingAdapter();
  const key = coverPushKey(payload);
  const canRecord = !!key && typeof read === "function" && typeof write === "function";

  let list = [];
  if (canRecord) {
    try { list = read() || []; }
    catch (_) {
      // An unreadable outbox means we cannot tell whether this is a retry, so we
      // must not claim it was recorded — but the push itself still happens and
      // is still reported. A bookkeeping failure never becomes a product failure.
      const out = await _attempt(impl, payload);
      return { ...out, duplicate: false, recorded: false };
    }
    const prior = list.find(e => e && e.key === key);
    // 🔴 THE ADAPTER IS NOT CALLED AGAIN, which is the entire point. Returning
    // the PRIOR outcome rather than a fresh one is deliberate too: re-reporting
    // what happened the first time is the truth, and inventing a new answer for
    // a call that was never made would be a confident wrong number.
    if (prior) {
      return { pushed: !!prior.pushed, system: prior.system || impl.system,
               reason: prior.pushed
                 ? "This cover was already sent, and has not been sent again."
                 : "This cover was already recorded here, and nothing was sent outside Jungle.",
               duplicate: true, recorded: false };
    }
  }

  const out = await _attempt(impl, payload);
  if (!canRecord) return { ...out, duplicate: false, recorded: false };

  try {
    const entry = { key, payload, at: new Date(now()).toISOString(),
                    system: out.system, pushed: !!out.pushed };
    // Bounded, oldest-first: an outbox that grows for ever is a localStorage
    // quota bug that only shows up for the gym that has used this the most.
    write([...list, entry].slice(-OUTBOX_CAP));
  } catch (_) { return { ...out, duplicate: false, recorded: false }; }

  return { ...out, duplicate: false, recorded: true };
}

// The contract says an implementation never throws. This is the belt for that
// brace: a booking push failing must never be able to prevent a cover approval
// from being recorded in Jungle, because the approval is what the two coaches
// actually agreed — and a third-party adapter is exactly the code most likely
// to break the rule it was told about in a comment.
async function _attempt(impl, payload) {
  try {
    const out = await impl.pushCoverApproved(payload);
    return out && typeof out === "object"
      ? { pushed: !!out.pushed, system: out.system || impl.system || "unknown", reason: out.reason || "" }
      : { pushed: false, system: impl.system || "unknown", reason: "" };
  } catch (e) {
    return { pushed: false, system: impl.system || "unknown",
             reason: "The booking system could not be reached, so nothing was sent outside Jungle." };
  }
}
