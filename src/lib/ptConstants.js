// ─── PT: the CHECK-constrained values, pinned in one place ───────────────────
//
// This repo's most expensive bug is a constrained column rejecting a client
// value: the background upsert fails, nothing surfaces, and a later server-wins
// hydrate destroys the only remaining copy. It has happened three times
// (persona_plans.source cost live data on 2026-07-18). The standing rule is that
// legal values live in ONE constant, and that constant is checked against the
// MIGRATION rather than against a second hard-coded copy — see
// src/lib/dbConstraints.test.js, which parses the .sql files.
//
// ZERO IMPORTS, deliberately, and it must stay that way. Every PT surface needs
// these — the store seam, the trainer screens, the client app, the tests — and a
// constants module that imports the localStorage/Supabase seam is a module that
// cannot be pulled into the client bundle without dragging the whole staff app
// behind it. Same reasoning that keeps csvExport.js import-free.
//
// The order of each array is the UI display order. The guard compares sets, so
// ordering here is free and belongs to whoever renders the dropdown.

// ── programs.status (0012) ───────────────────────────────────────────────────
// 'draft' is the default in the schema and the client-read policy refuses it, so
// the coach-approval gate holds in the database rather than in a screen filter.
export const PROGRAM_STATUSES = ["draft", "active", "completed", "archived"];

// ── sessions.status (0012) ───────────────────────────────────────────────────
// ⚠️ NOT a booking vocabulary. There is no 'requested', no 'confirmed', no
// 'waitlisted', and adding one is a product decision rather than a new enum
// value — see the no-booking note on the table itself.
export const SESSION_STATUSES = ["planned", "delivered", "cancelled", "no_show"];

// ── set_logs.source (0012) ───────────────────────────────────────────────────
// Who observed the lift. The client-insert policy pins this to 'client' in the
// database precisely so a client cannot write a row that reads as the trainer's
// own observation.
export const SET_LOG_SOURCES = ["trainer", "client", "import"];

// A normaliser per constrained column, mirroring store.js's planSource() /
// attendanceSource(). The point is not tidiness: it is that a value which came
// from anywhere untrusted — an import, a stale local row, a hand-edited
// localStorage blob — is coerced to something the CHECK accepts BEFORE it
// reaches a background write that would otherwise fail in silence.
//
// Each default is the safest reading of "we do not know":
//   programs   → draft     (invisible to the client; a lost status must never
//                           publish a program to someone's phone)
//   sessions   → planned   (never invents a delivery that did not happen, which
//                           would also spend a session credit)
//   set_logs   → trainer   (matches the column default; the database's own
//                           policy is what stops a client claiming it)
export const programStatus = s => (PROGRAM_STATUSES.includes(s) ? s : "draft");
export const sessionStatus = s => (SESSION_STATUSES.includes(s) ? s : "planned");
export const setLogSource  = s => (SET_LOG_SOURCES.includes(s) ? s : "trainer");

// ── Plain words for the enums a coach reads ─────────────────────────────────
// The UI never shows a raw enum (U1). These live beside the constants so a value
// added to one cannot go blank in the other — the same reason
// MEMBER_STATUS_LABEL sits beside MEMBER_STATUSES in store.js.
//
// "Missed" rather than "No show": the trainer is reading this to a person about
// a person, and the record does not need to sound like an accusation.
export const SESSION_STATUS_LABEL = {
  planned:   "Planned",
  delivered: "Delivered",
  cancelled: "Cancelled",
  no_show:   "Missed",
};

export const PROGRAM_STATUS_LABEL = {
  draft:     "Draft",
  active:    "Active",
  completed: "Completed",
  archived:  "Archived",
};

// Which session statuses have actually consumed a session credit. Delivered
// does; a cancellation does not. 'no_show' is the contested one and it is the
// GYM's policy, not ours — so it is listed here as NOT consuming, and the
// trainer records an adjustment when their own policy says otherwise. A default
// that quietly charged someone for a missed session would be a billing decision
// taken by a schema.
export const CREDIT_CONSUMING_STATUSES = ["delivered"];
