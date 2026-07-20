// ─── Win-back drafts (N3 follow-through, LEGAL-AND-SECURITY §1) ──────────────
//
// Jungle DRAFTS. The coach sends, from their own WhatsApp, to a contact they
// pick themselves. That is not a UX preference — it is the legal design:
//
//   • Singapore's Do-Not-Call regime covers marketing messages to SG numbers,
//     WhatsApp included. Messages to a CURRENT member about their existing
//     membership fall under the ongoing-relationship exemption; a promotional
//     message to a lapsed ex-member does not, and would need consent or a paid
//     DNC lookup.
//   • So eligibility is gated on membership being active, and the copy stays
//     firmly on the relationship — no offers, no discounts, no "come back and
//     get 20% off". The moment a draft becomes an ad, the exemption is gone.
//   • The gym is the sender and the organisation responsible. Jungle never sends
//     anything to a member. Do not build automated outbound.
//
// DATA MINIMISATION, deliberately: these links carry NO phone number, because
// Jungle stores none. `wa.me/?text=…` opens WhatsApp with the message ready and
// lets the coach choose the contact from their own address book. Storing member
// phone numbers would add a PDPA liability to hold a field the coach already has
// in their phone.

// Why a member is not eligible, in words the coach can act on. `null` = eligible.
export function winBackBlockedReason(member) {
  if (!member) return "This member's record is missing.";
  // "Active" is the ongoing relationship. Anything else — ended, paused, unknown
  // — leaves the exemption behind, so Jungle stops offering the draft rather
  // than letting a coach paste it and find out later.
  if ((member.status || "").toLowerCase() !== "active")
    return "Membership isn't active, so Jungle won't draft an automatic message — reach out personally if you know them.";
  return null;
}

export function canDraftWinBack(member) {
  return winBackBlockedReason(member) === null;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

// One draft per rule. Written to be SENT AS-IS by a busy coach — if it needs
// editing it will not get sent, and an unsent message is the same as no feature.
// Each one references the existing membership explicitly, which is what keeps it
// inside the exemption, and ends with a question so it opens a conversation
// rather than announcing something.
export function winBackMessage(flag, member, gymName = "") {
  if (!flag || !member) return "";
  const who = firstName(member.name);
  const from = String(gymName || "").trim();
  const sig = from ? ` — ${from}` : "";

  if (flag.rule === "new_member_low_visits") {
    return `Hi ${who}! Just checking in — you joined us recently and I wanted to see how you're getting on. `
      + `Is there a class time that works better for your week? Happy to help you find one${sig}`;
  }
  // absence
  return `Hi ${who}! We've missed you in class the past couple of weeks. `
    + `Your membership's still active — anything we can do to help you get back in?${sig}`;
}

// wa.me deep link with the message pre-filled and NO recipient. Opens the
// coach's own WhatsApp; they choose who it goes to.
export function winBackLink(flag, member, gymName = "") {
  const text = winBackMessage(flag, member, gymName);
  if (!text) return "";
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
