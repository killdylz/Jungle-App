// ─── Schedule rules → dated occurrences (backlog B4, spec §7c) ───────────────
//
// WHY THIS EXISTS
// There are two different things called "a class" and until now only one of them
// could be created:
//
//   class_schedule_rules — "Tuesday 6pm HIIT, weekly". A RULE. Migration 0003
//     says so explicitly: "the recurring-rule input that a future
//     `class_instances` generator would read."
//   class_instances — "the Tuesday 6pm HIIT of 14 July 2026". One dated
//     occurrence, and the thing attendance actually hangs off (0007).
//
// Nothing turned the first into the second. The Runner minted an occurrence ad
// hoc via `ensureClassInstance` when a coach pressed play, which works for the
// class in front of you and leaves the schedule as a drawing: the grid could not
// be published, an occurrence could not be looked up before it ran, and "which
// of my classes is dying" had no per-slot spine to compute over.
//
// Pure functions. No I/O, no ids — the store assigns those, and keeping id
// generation out of here is what lets the caller dedupe against what already
// exists rather than minting a duplicate every time the button is pressed.

// The Schedule grid's own week: Monday-first, six days. Mirrors CalendarScreen's
// DAYS so a rule saved from the grid can always be placed.
export const RULE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "45m" · "1h" · "1h15m" · "90" — the free-text `dur` column, read leniently
// because it is typed by a human and the value only affects a display estimate.
// Returns null rather than a guess when it cannot be read: a wrong duration on a
// dated occurrence would silently mis-state a class's length forever.
export function parseDurationMin(raw) {
  const s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!s) return null;
  const hm = s.match(/^(\d+)\s*h(?:ours?|rs?)?(?:\s*(\d+)\s*m(?:in(?:ute)?s?)?)?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] || 0);
  const m = s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/);
  if (m) return Number(m[1]);
  const bare = s.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);
  return null;
}

// "06:00" → { h, m }. Rejects anything that is not a real time of day, so a
// typo cannot land an occurrence at 25:00 and sort itself to the end of time.
export function parseSlot(raw) {
  const m = String(raw == null ? "" : raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

// The Monday of the week containing `d`, at local midnight.
export function startOfWeek(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun. Monday-first means Sunday belongs to the week that started
  // six days earlier, not to the one about to begin.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

// The key CalendarScreen stamps on a `repeat: "once"` rule. Reproduced here
// EXACTLY — it is `${year}-${monthIndex}-${date}` of the week's Monday, which is
// neither ISO nor padded, and inventing a tidier format here would silently stop
// matching every one-off already saved.
export function weekKeyOf(monday) {
  return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
}

/**
 * Every dated occurrence a set of recurring rules produces in one week.
 *
 * @param rules  local `userClasses`: { id, name, type, coach, day, slot, dur, repeat, weekKey }
 * @param monday any date inside the target week; normalised to its Monday
 * @param opts   { days } — which weekdays the gym runs. Defaults to the six the
 *               Schedule grid shows, so a "daily" rule does not invent a Sunday
 *               class the grid has nowhere to display.
 * @returns occurrences sorted by time, each { ruleId, name, classType, coachName, durationMin, startsAt }
 */
export function occurrencesForWeek(rules, monday, { days = RULE_DAYS.slice(0, 6) } = {}) {
  const wk = startOfWeek(monday);
  const key = weekKeyOf(wk);
  const out = [];

  for (const r of rules || []) {
    if (!r || !r.name) continue;               // a rule with no name has nothing to publish
    const at = parseSlot(r.slot);
    if (!at) continue;                          // unreadable time — skip, never guess

    let onDays;
    if (r.repeat === "daily") onDays = days;
    else if (r.repeat === "once") onDays = r.weekKey === key ? [r.day] : [];
    else onDays = [r.day];                      // "weekly", and the default for anything unknown

    for (const day of onDays) {
      const i = days.indexOf(day);
      if (i < 0) continue;                      // a day the gym does not run
      const dt = new Date(wk);
      dt.setDate(wk.getDate() + RULE_DAYS.indexOf(day));
      dt.setHours(at.h, at.m, 0, 0);
      out.push({
        ruleId: r.id || "",
        name: r.name,
        // `type` locally, `class_type` in Postgres. Named for the destination.
        classType: r.type || "",
        coachName: r.coach || "",
        durationMin: parseDurationMin(r.dur),
        startsAt: dt.toISOString(),
      });
    }
  }

  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.name.localeCompare(b.name));
}

// Identity of an occurrence: the same class, at the same moment, is the same
// class. Used to make publishing idempotent — a coach pressing the button twice,
// or after adding one class to a published week, must not duplicate a week of
// occurrences and split each one's attendance across two rows.
//
// Name is normalised but NOT the time: two classes genuinely can start at once
// (two studios), and they differ by name.
export function occurrenceKey(o) {
  return `${String(o?.name || "").trim().toLowerCase()}@${o?.startsAt || ""}`;
}

/**
 * Split a week's occurrences into the ones that need creating and the ones
 * already on the books. The caller writes only `create`.
 */
export function diffOccurrences(occurrences, existing = []) {
  const have = new Set((existing || []).map(occurrenceKey));
  const create = [], already = [];
  const seen = new Set();
  for (const o of occurrences || []) {
    const k = occurrenceKey(o);
    // Two rules can collide onto one slot — a "daily" and a "weekly" at the same
    // time and name. Deduped here so one press cannot insert the same occurrence
    // twice in a single batch.
    if (seen.has(k)) continue;
    seen.add(k);
    (have.has(k) ? already : create).push(o);
  }
  return { create, already };
}

/**
 * What the button did, in a sentence a coach reads. Written for the case that
 * actually happens most — pressing it again on a week already published.
 */
export function describePublish({ created = 0, already = 0 } = {}) {
  if (!created && !already) return "There are no classes on this week's schedule yet.";
  if (!created) return `This week is already on the books — all ${already} class${already === 1 ? "" : "es"}.`;
  const tail = already ? ` ${already} ${already === 1 ? "was" : "were"} already there.` : "";
  return `Added ${created} class${created === 1 ? "" : "es"} to the books.${tail}`;
}
