// ─── The words a coach actually reads (U1, UI-UX-DIRECTION §4) ───────────────
// Every internal enum that reaches a screen is translated here, in one place.
//
// THE RULE, and it is a product rule rather than a style preference: a coach is
// never shown the words parser, JSON, corpus, extraction, Edge Function,
// Supabase, persona-ai, blocks, non-2xx, or a confidence percentage. Errors name
// the outcome and the next action, never the mechanism.
//
// This module exists so that rule can be TESTED. While these maps lived inside
// App.jsx's 8,500 lines they could only be checked by eye, and `sets_reps`
// rendered raw on the profile card and every catalog row for a whole session
// without anyone noticing. labels.test.js now fails if a mapping is missing or
// a message leaks jargon.

// Block roles (§9.1).
export const ROLE_LABEL = {
  warmup: "Warm-up", primary_lift: "Primary lift", superset: "Superset",
  circuit: "Circuit", finisher: "Finisher", recovery: "Recovery", cooldown: "Cool-down",
};

// Movement categories (§9.2) — must cover CATEGORIES from movementTaxonomy.js.
export const MOVEMENT_CATEGORY_LABEL = {
  warmup: "Warm-up", mobility: "Mobility", strength: "Strength",
  conditioning: "Conditioning", core: "Core", cooldown: "Cool-down",
};

// Class categories, as derived by personaAggregate.classCategory.
export const CLASS_CATEGORY_LABEL = {
  strength: "Strength", conditioning: "Conditioning", endurance: "Endurance", mixed: "Mixed",
};

// What a "coach" entry actually represents. The stored key is `kind`; it was
// rendering raw, so a card read "Example Coach — The Garage / coach".
export const KIND_LABEL = { coach: "Coach", house: "House style", format: "Class format" };

// persona_plans.source is a CHECK-constrained enum — readable labels so the
// class list never shows a raw database value.
export const SOURCE_LABEL = { google_slides: "Google Slides", manual: "Manual", jungle: "Jungle" };

// Scheme types. `sets_reps` is the one that kept escaping: the underscore is the
// giveaway that a stored value reached the screen.
export const SCHEME_LABEL = {
  sets_reps: "Sets × reps", amrap: "AMRAP", rounds: "Rounds", time: "For time",
  interval: "Intervals", emom: "EMOM", tabata: "Tabata", ladder: "Ladder",
};

// An unknown scheme de-underscores rather than disappearing: a chip that reads
// oddly gets reported, a chip that silently vanishes does not.
export function schemeTypeLabel(t) {
  if (!t) return "";
  return SCHEME_LABEL[t] || String(t).replace(/_/g, " ");
}

// ── Failures, as instructions ────────────────────────────────────────────────
// Internal throws use short sentinel codes rather than prose, so the wording
// lives here and cannot drift as call sites are edited.
export const READ_ERRORS = {
  PARTIAL_READ:
    "Jungle couldn't read parts of this class. Tidy the text (one exercise per line works best) and try again — or add the exercises by hand.",
  NO_EXERCISES:
    "No exercises found in that text. Check it includes the movements and sets, then try again.",
  NOT_A_CLASS:
    "That doesn't look like a class. Paste the class text instead — Jungle will read it.",
};

// Anything unrecognised gets the generic line. Showing a raw exception is how
// "Edge Function returned a non-2xx status code" reached a coach in the first
// place. The reassurance is deliberate: their first fear is losing what they
// just pasted.
export const GENERIC_READ_ERROR =
  "Jungle's reading service didn't respond. Check your connection and try again — your text is still here.";

export function readErrorMessage(e) {
  const raw = String(e?.message ?? e ?? "");
  if (READ_ERRORS[raw]) return READ_ERRORS[raw];
  // The coach gets the plain line; WE still need the real cause, or the next
  // bug report is "it said it didn't respond" with nothing behind it.
  if (raw) console.warn("[read] unmapped failure:", raw);
  return GENERIC_READ_ERROR;
}

// ── The unsynced-data banner's sentence ──────────────────────────────────────
// Two states, because one was the defect. "Jungle keeps retrying, so nothing is
// lost" is reassuring on attempt one and misleading on attempt forty: a blip and
// a fortnight of divergence read identically, so a coach could not tell "wait a
// moment" from "this is never going to fix itself" — and the second case is the
// one where their whole corpus exists on a single device.
//
// The threshold is ATTEMPTS rather than elapsed time. Retries back off toward a
// five-minute cap, so five failures already means several minutes of trying, and
// attempts is the number the banner shows — a coach can reconcile the sentence
// with the count beside it instead of taking it on faith.
export const SYNC_STUCK_AFTER = 5;

export function syncBannerMessage(tries) {
  if (tries >= SYNC_STUCK_AFTER) {
    // No invented support desk and no mechanism: it says what is true, what the
    // risk actually is, and where the reason is.
    return `Jungle has retried ${tries} times without success, so this is not a passing connection problem. ` +
           `The changes are safe on this device but exist nowhere else — open “What went wrong” below for the reason.`;
  }
  return "They’re saved on this device and Jungle keeps retrying, so nothing is lost — but they won’t " +
         "appear on another device until the sync succeeds.";
}
