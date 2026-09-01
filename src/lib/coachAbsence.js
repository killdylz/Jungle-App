// ─── "I am away these dates" (S33 §1) ────────────────────────────────────────
//
// 🔴 WHY AN ABSENCE IS ITS OWN THING RATHER THAN A FLAG ON A CLASS. Everything
// the cover flow did before this was CLASS-FIRST: pick a class, ask someone,
// done. But being away is a fact about a PERSON OVER A RANGE OF DATES, and a
// coach away next week does not have "a class that needs cover" — they have six
// of them, on four days, and every one of those asks has to be raised, tracked
// and answered separately. The gym then has no single thing to look at that says
// "Mara is away Mon–Fri and two of her classes still have nobody".
//
// So an absence is recorded once and the classes it affects are DERIVED from it.
// That derivation is here, it is pure, and it goes through `occurrencesForWeek`
// rather than re-implementing the repeat rules — a second reading of "which
// classes does this rule produce" is exactly how the grid and the cover board
// would come to disagree about what a coach teaches.
//
// ── Dates, and the trap this module exists inside ───────────────────────────
// 🔴 EVERY DATE HERE IS A LOCAL `YYYY-MM-DD` STRING AND NOTHING IS EVER PARSED
// WITH `new Date(str)`. `new Date("2026-08-22")` is UTC MIDNIGHT, so `.getDate()`
// is 21 anywhere west of Greenwich — the bug `fmtSessionDay` and `retention.js`
// both carry warnings about. Comparison is STRING comparison, which is exact for
// zero-padded ISO dates and needs no clock, no timezone and no Date object at
// all. `localDateStr` (format.js) is the one writer, shared with `updateCoach`'s
// availability stamp so an absence and an availability claim cannot disagree
// about what day it is.

import { occurrencesForWeek, startOfWeek, RULE_DAYS } from "./scheduleInstances.js";
import { resolveCoach } from "./coachRoster.js";
import { localDateStr } from "./format.js";

// A quarter. Not a policy about holidays — a guard on the loop below, which
// walks a week at a time. An absence typed as 2026–2036 would otherwise derive
// half a million occurrences and hang the panel that rendered it.
export const MAX_ABSENCE_DAYS = 92;

// The local calendar date an occurrence falls on. `startsAt` was BUILT local
// (`occurrencesForWeek` uses setHours on a local Date), so reading it back with
// `localDateStr` round-trips exactly. This is the only place that conversion
// happens, so a cover request and the grid cell it came from cannot disagree.
export function occurrenceDate(o) {
  const t = new Date(o?.startsAt || 0).getTime();
  return Number.isFinite(t) && t !== 0 ? localDateStr(t) : "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateStr = (s) => DATE_RE.test(String(s || ""));

// Whole days from `from` to `to` inclusive, or null when either is unreadable.
//
// ⚠️ TWO GUARDS AGAINST THE CLOCKS CHANGING, AND ONLY ONE OF THEM IS DOING THE
// WORK — recorded honestly because the comment here first claimed the wrong one.
// A range spanning a DST transition is 23 or 25 hours per day at one end, so the
// raw division gives 1.958 rather than 2. `Math.round` is what turns that back
// into the right answer; the local-NOON anchor merely makes the division exact
// (twelve hours of slack against a shift that is at most two), so it is
// redundancy rather than the fix. Mutating the anchor to midnight leaves every
// test green, which is how this was found.
//
// Both are kept. The anchor costs nothing and means the arithmetic is exact
// rather than merely rounded to the right place, which is worth having in a
// function whose answer decides how many classes get covered.
//
// ⚠️ Parsing the parts by hand rather than `new Date(str)` is NOT about this —
// a UTC-parsed pair would shift equally and subtract fine. It is so this
// function reads the same way as every other date in the module, which is the
// property that stops the next person reaching for `.getDate()` on one.
export function daysInclusive(from, to) {
  if (!isDateStr(from) || !isDateStr(to)) return null;
  const at = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12).getTime(); };
  const diff = Math.round((at(to) - at(from)) / 86400000);
  return diff < 0 ? null : diff + 1;
}

// 🔴 THE REFUSALS ARE THE FEATURE. A range that runs backwards, or is absurdly
// long, is a typo — and an absence built from a typo silently raises cover
// requests for classes the coach is going to turn up and teach. Each returns a
// SENTENCE rather than a code, because the panel prints it verbatim and a coach
// cannot act on "ERR_RANGE".
export function absenceError({ from, to } = {}) {
  if (!isDateStr(from) || !isDateStr(to)) return "Pick the first and last day you are away.";
  const n = daysInclusive(from, to);
  if (n === null) return "The last day is before the first day.";
  if (n > MAX_ABSENCE_DAYS) return `That is ${n} days. Record absences up to ${MAX_ABSENCE_DAYS} days at a time.`;
  return "";
}

export function makeAbsence({ id, coachId, from, to, note = "", now = Date.now() } = {}) {
  if (!id || !coachId || absenceError({ from, to })) return null;
  return {
    id,
    coachId,
    from, to,                       // local YYYY-MM-DD, inclusive both ends
    note: String(note || "").trim(),
    createdAt: new Date(now).toISOString(),
    // Withdrawn rather than deleted, for the same reason a cover request is
    // `cancelled` rather than removed: "Mara said she was away and then wasn't"
    // is a thing the gym may need to see, and the covers already raised against
    // it have to be traceable to something.
    cancelledAt: "",
  };
}

export const isActiveAbsence = (a) => !!a && !a.cancelledAt;

// String comparison, deliberately — see the header.
export function coversDate(absence, dateStr) {
  if (!isActiveAbsence(absence) || !isDateStr(dateStr)) return false;
  return absence.from <= dateStr && dateStr <= absence.to;
}

/**
 * Every dated occurrence the schedule produces between two local dates.
 *
 * ⚠️ WALKS WEEK BY WEEK THROUGH `occurrencesForWeek` rather than deciding for
 * itself which rules fire on which day. That function already knows that
 * "daily" means every running day, that "weekly" means one, and that "once"
 * only fires in its own stamped week — and it is the function the GRID draws
 * from. Re-deriving any of that here would give the cover board a second
 * opinion about what a coach teaches.
 */
export function occurrencesInRange(rules, from, to, { days = RULE_DAYS } = {}) {
  const span = daysInclusive(from, to);
  if (span === null || span > MAX_ABSENCE_DAYS) return [];

  const [fy, fm, fd] = from.split("-").map(Number);
  const cursor = startOfWeek(new Date(fy, fm - 1, fd));
  const out = [];
  // +1 so a range ending late in a week still gets that week walked; the date
  // filter below is what actually bounds the result.
  const weeks = Math.ceil(span / 7) + 1;

  for (let i = 0; i < weeks; i++) {
    for (const o of occurrencesForWeek(rules, cursor, { days })) {
      const d = occurrenceDate(o);
      if (d && from <= d && d <= to) out.push({ ...o, date: d });
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.name.localeCompare(b.name));
}

/**
 * The classes one absence actually takes a coach away from.
 *
 * 🔴 MATCHED BY NAME THROUGH `resolveCoach`, not by id, because a class carries
 * TEXT and always will — that is the decision migration 0010's header records
 * and nothing here re-opens it. So a coach whose roster entry answers to "Mara"
 * and "Mara K." is away from classes typed either way, and a class typed under
 * a name nobody claims is nobody's absence.
 */
export function classesAffectedBy(rules, coach, absence, { days = RULE_DAYS } = {}) {
  if (!coach || !isActiveAbsence(absence)) return [];
  return occurrencesInRange(rules, absence.from, absence.to, { days })
    .filter(o => !!resolveCoach([coach], o.coachName));
}

// Absences a coach currently has on record, newest first. Cancelled ones are
// dropped here rather than at the call site: every reader wants the live ones,
// and the one that wants history can filter the raw list itself.
export function absencesFor(list, coachId) {
  if (!coachId) return [];
  return (list || [])
    .filter(a => isActiveAbsence(a) && a.coachId === coachId)
    .sort((a, b) => String(b.from).localeCompare(String(a.from)));
}

// Is this coach away on this date? Used to keep an away coach off the list of
// people offered a class to cover — the one place the two halves of this
// feature have to know about each other.
export function isAwayOn(list, coachId, dateStr) {
  return (list || []).some(a => a && a.coachId === coachId && coversDate(a, dateStr));
}
