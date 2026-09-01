// ─── Which of your class types actually keeps members ────────────────────────
//
// WHY THIS IS THE FEATURE, AND WHY NO COMPETITOR CAN SHIP IT
// Every booking system in `GTM-SINGAPORE` §1 — Mindbody, Glofox, Hapana, Zenoti,
// Vibefam — holds *who booked what*. None of them holds WHAT WAS IN THE CLASS,
// because nobody programs a class in a booking system. Jungle holds both: the
// class content (personas, plans, class types) and the attendance record. So it
// can answer a question none of them can, and it is the question an owner acts
// on when they redraw the timetable:
//
//     Which class types do members come back to, and which do they try once?
//
// That is `PRODUCT-DIRECTION` §2's (a)+(c)→(b) loop closed, and it is the number
// that justifies the S$299 tier at renewal.
//
// ── THE MEASURE, and the trap inside the obvious one ────────────────────────
// The obvious metric is "average visits per member per type". It is worthless:
// a type on the timetable twice a week accumulates visits a monthly workshop
// cannot, and the ranking would sort by SLOT COUNT wearing a retention costume.
//
// So this asks a survival question with a fixed clock:
//
//   Of the members whose FIRST visit to type T was at least RETURN_WINDOW_DAYS
//   ago, what fraction came back to T again WITHIN RETURN_WINDOW_DAYS of that
//   first visit?
//
// 🔴 THE WINDOW IS THE WHOLE DESIGN, and `cohorts.js` explains why in a
// different costume. "Did they ever come back" gives a member from two years ago
// two years to answer and a member from last month a month — different
// denominators dressed as one number, which is exactly the per-point-denominator
// error that made session 27's first retention curve RISE. Every member here
// gets the same 28 days, so the figure is comparable across types AND across
// time, and a type cannot look better for being older.
//
// 28 days, not 30: a boutique timetable repeats WEEKLY, so four weeks is four
// chances at the same slot on the same weekday. Thirty days gives some members
// five chances and some four depending on where the month falls.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
// 1. A type with four triers is not a comparison — one person is 25 points. Below
//    MIN_TRIERS a type is EXCLUDED and NAMED, never silently dropped. An owner
//    who cannot see that Yoga was left out will conclude Yoga has no problem.
// 2. An imported check-in may have NO class type: the CSV importer keeps a
//    foreign "Type" column verbatim when it matches nothing and writes `""` when
//    the column is absent. A ranking computed over 60% of the data and presented
//    as the whole timetable is the confident wrong number this product refuses,
//    so `unattributed` is part of the model and the screen states it.
// 3. It does NOT rank coaches. The same join would produce that, and it is a
//    different product decision: coaches are the adoption engine, and a screen
//    that ranks them is a screen a coach will refuse to feed. See DYLAN-QUEUE.md.

const DAY = 86_400_000;

// A member gets four weeks to come back. See the header.
export const RETURN_WINDOW_DAYS = 28;
// Below this a type is named as excluded rather than ranked.
export const MIN_TRIERS = 8;

const msOf = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

/**
 * Every class type's return rate, over one comparable population each.
 *
 * @param attendance      check-in rows: `{ memberId, classInstanceId, checkedInAt }`
 * @param classInstances  the classes those rows point at; `classType` is the key
 * @param opts.now        clock, for tests
 * @param opts.label      key → human name. A key is storage, never copy.
 * @returns see below; `ready:false` always carries a `reason`
 */
export function classTypeRetention(attendance = [], classInstances = [], opts = {}) {
  const now = opts.now ?? Date.now();
  const label = opts.label || ((k) => k);
  const windowMs = RETURN_WINDOW_DAYS * DAY;

  // instance id → class type. A row pointing at an instance we do not hold is
  // as unattributable as one whose instance has no type, and for the reader it
  // is the same sentence, so they are counted together.
  const typeOf = new Map();
  (classInstances || []).forEach((c) => {
    if (c?.id) typeOf.set(c.id, String(c.classType ?? "").trim());
  });

  // type → member id → sorted visit timestamps
  const byType = new Map();
  let attributed = 0, unattributed = 0, undated = 0;
  (attendance || []).forEach((a) => {
    const ms = msOf(a?.checkedInAt);
    if (!a?.memberId) return;
    if (ms == null) { undated++; return; }
    const t = a?.classInstanceId ? typeOf.get(a.classInstanceId) : "";
    if (!t) { unattributed++; return; }
    attributed++;
    if (!byType.has(t)) byType.set(t, new Map());
    const members = byType.get(t);
    if (!members.has(a.memberId)) members.set(a.memberId, []);
    members.get(a.memberId).push(ms);
  });

  const base = {
    ready: false, types: [], excluded: [], attributed, unattributed, undated,
    windowDays: RETURN_WINDOW_DAYS, minTriers: MIN_TRIERS,
    studioRate: null, studioOf: 0, reason: "",
  };

  if (!attributed) {
    return { ...base, reason: unattributed
      ? `None of your ${unattributed} recorded check-in${unattributed === 1 ? "" : "s"} can be traced to a class type, `
        + "so there is nothing to compare. Check-ins taken through the Class Runner carry their type automatically; "
        + "imported ones carry it only when your export named the class."
      // ⚠️ NOT "no check-ins are recorded yet". The cohort panel below already
      // says that on the same screen, and one owner reading one screen should
      // not be told the same fact twice in two voices. This panel answers a
      // different question, so it says what IT is waiting for.
      : "Once a few weeks of classes have been run or imported, this shows which of them members "
        + "came back to and which they tried once." };
  }

  // ── The panel, per type ───────────────────────────────────────────────────
  // A member whose first visit to T was nine days ago has not had the window to
  // answer the question, so they are not in the denominator OR the numerator.
  // Excluding them from both is what keeps every type's figure the same
  // question; counting them as "did not return" is the error that makes the
  // newest class on the timetable look like the worst one.
  const rows = [];
  let studioReturned = 0, studioOf = 0;
  for (const [type, members] of byType) {
    let triers = 0, returned = 0, tooNew = 0;
    for (const visits of members.values()) {
      const first = Math.min(...visits);
      if (first > now - windowMs) { tooNew++; continue; }
      triers++;
      if (visits.some((v) => v > first && v <= first + windowMs)) returned++;
    }
    // The studio-wide baseline is the SAME population summed, not the mean of
    // the rates — a mean of rates weights a 9-member type equally with a
    // 200-member one and produces a "studio average" no member experienced.
    studioReturned += returned; studioOf += triers;
    rows.push({ type, label: label(type), triers, returned, tooNew,
                pct: triers ? Math.round((returned / triers) * 100) : null });
  }

  const ranked = rows.filter((r) => r.triers >= MIN_TRIERS).sort((a, b) => b.pct - a.pct || b.triers - a.triers);
  // Named, not dropped. Sorted by how close they are to being measurable, so the
  // sentence "two more members and Barre appears here" is readable off the list.
  const excluded = rows.filter((r) => r.triers < MIN_TRIERS).sort((a, b) => b.triers - a.triers);

  if (!ranked.length) {
    const best = excluded[0];
    return { ...base, excluded, reason:
      `A return rate needs at least ${MIN_TRIERS} members who tried a class type more than `
      + `${RETURN_WINDOW_DAYS} days ago, so everyone has had the same four weeks to come back. `
      + (best
          ? `Your closest is ${best.label}, with ${best.triers}. `
          : "")
      + "Import more of your attendance history on the Members screen and this fills in." };
  }

  return { ...base, ready: true, types: ranked, excluded,
           studioRate: studioOf ? Math.round((studioReturned / studioOf) * 100) : null,
           studioOf };
}

/**
 * One sentence naming what was measured and what was left out. Kept beside the
 * arithmetic so the wording and the window cannot drift apart — the same reason
 * `describeCohorts` and `describeRetention` live next to theirs.
 */
export function describeClassTypes(m) {
  if (!m?.ready) return m?.reason || "";
  const excluded = m.excluded.length
    ? ` ${m.excluded.length === 1 ? "One type is" : `${m.excluded.length} types are`} left out for having `
      + `fewer than ${m.minTriers} members who could be measured: `
      + `${m.excluded.map((e) => `${e.label} (${e.triers})`).join(", ")}.`
    : "";
  // 🔴 The unattributed count is not a footnote. A ranking computed over part of
  // the data and read as the whole timetable is the failure this states out of.
  const unattr = m.unattributed
    ? ` ${m.unattributed} check-in${m.unattributed === 1 ? "" : "s"} could not be traced to a class type `
      + `and ${m.unattributed === 1 ? "is" : "are"} in none of these figures.`
    : "";
  return `Of the members who tried each class more than ${m.windowDays} days ago, the share who came back `
    + `to it within four weeks. Everyone is given the same four weeks, so a class that has been running `
    + `longer cannot look better for it.${excluded}${unattr}`;
}
