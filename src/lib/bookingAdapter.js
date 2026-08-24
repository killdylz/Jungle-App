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
