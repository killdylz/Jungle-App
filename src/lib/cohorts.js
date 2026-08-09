// ─── N2 · retention over time, from the gym's own rows ───────────────────────
//
// WHY THIS EXISTS, AND WHY IT WAS NOT BLOCKED
// The backlog has parked N2 behind "rows accumulating, which waits on the pilot
// running" for several sessions. That precondition is already satisfied by the
// feature two screens over: the CSV backfill writes real attendance rows, so a
// studio that brings two years of history across has cohort data in its first ten
// minutes. `docs/GTM-SINGAPORE.md` §2 puts at-risk, win-back and cohort analytics
// in the S$299 tier; the first two shipped, and this is the third.
//
// 🔴 THE PREMISE THAT WAS WRONG, AND IT IS THE WHOLE DESIGN
// The obvious way to build this is to cohort members by `joinedAt`. It cannot be
// done, and the reason is precise: `applyAttendanceImport` creates every imported
// member with `joinedAt: ""` (store.js). So the gym that imports two years of
// history — the exact gym that makes this feature possible — has a roster with
// ZERO known join dates. A join-date cohort analysis would show that gym an empty
// screen and a gym that typed its roster in by hand a full one, which is the
// opposite of the truth about which of them has more data.
//
// So a cohort here is **the month a member FIRST APPEARS in the gym's records**,
// and the screen says exactly that rather than calling it a join date.
//
// ⚠️ `retention.js` explicitly REFUSES that same substitution, and it is right to.
// The difference is what the two claims are about. At-risk rule 1 says "joined 20
// days ago and has been twice" — a claim about one member's tenure, and false for
// an imported member. This says "of the members first seen in March, this fraction
// were still coming in June" — a claim about the RECORDS, which is true of them
// whatever the members' real start dates were. One asserts a fact it does not
// hold; the other describes the data it does.
//
// ── LEFT CENSORING, the residue of that substitution ────────────────────────
// A gym importing Jan 2025 onward has members whose first RECORDED visit is
// January but who joined in 2019. They land in the January cohort, and that
// cohort therefore contains every long-tenured member in the gym — so it looks
// extraordinarily loyal, for a reason that is an artefact of where the export
// began rather than anything the gym did.
//
// The first month of an IMPORTED record is therefore dropped, and the screen says
// so. Detected from `source: "import"` on the rows themselves rather than
// guessed: a studio that has only ever checked in through Jungle has a genuine
// first month, and must keep it. Censoring decays after the boundary month — a
// member already training who happened to first appear in month two is still
// misplaced — which is why the screen names the definition instead of implying
// the number is a join-date cohort.
//
// ── RIGHT CENSORING, and the trap inside the obvious fix ────────────────────
// A member first seen two months ago cannot be measured at six months. Counting
// them as "not retained" is the classic error that makes every recent cohort look
// catastrophic. The obvious fix is to give each point its own denominator — only
// the members old enough to be observable that far.
//
// 🔴 That fix produces a curve that can RISE, and it was written here first. A
// unit test caught month 7 reading 50% after month 6 read 33%. Nobody came back:
// the two points are percentages of DIFFERENT populations, and the members old
// enough to be measured at month 7 happened to be a more loyal subset. An owner
// reading an upturn at month 7 reads "they return" — a confident wrong story, told
// by arithmetic that was individually correct at every point.
//
// So the curve uses ONE population: the members who have had the full observed
// horizon to stay or leave. Every point is that same set, `last >= cohort + k` is
// nested in k, and the line is therefore monotonic in fact and not merely in the
// comment. It costs the newest members their place on the curve, which is correct
// — they have not been members long enough to answer the question it asks — and
// the per-cohort table below is where they do appear.
//
// The trailing partial month is excluded for the same family of reasons: on the
// 9th of the month, "still coming this month" has had nine days to happen.

import { attendanceIndex } from "./retention.js";

// ── The honesty gate. Built first, on purpose ────────────────────────────────
// A retention curve over three members is noise with a chart around it: each
// member is 33 percentage points, so the line moves in absurd jumps and an owner
// reads a shape that is entirely sampling error. A gym that imports two years of
// history clears these instantly; a gym that has imported nothing must be told
// what is missing rather than shown a shape.
export const MIN_MEMBERS = 12;   // members with any recorded check-in
export const MIN_POINT_N = 8;    // members behind a single point, or it is not drawn
export const MAX_OFFSET = 12;    // a year out; beyond that the denominators are thin anyway

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Months are LOCAL calendar months, matching `daysBetween`'s reasoning in
// retention.js: the datum is a date and the reader is a human with a calendar. An
// index rather than a string so arithmetic ("three months after") is addition
// rather than date parsing, which is where month-boundary bugs live.
export const monthIndex = ms => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };
export const monthLabel = idx => `${MONTHS[((idx % 12) + 12) % 12]} ${Math.floor(idx / 12)}`;
// "Q4 2025" for a quarterly group, from the index of its FIRST month.
export const quarterLabel = idx => `Q${Math.floor((((idx % 12) + 12) % 12) / 3) + 1} ${Math.floor(idx / 12)}`;
export const periodLabel = (idx, period) => period === "quarter" ? quarterLabel(idx) : monthLabel(idx);

/**
 * Everything the retention screen renders, or the reason it renders nothing.
 *
 * @param members     the roster — used only to report who has no rows at all
 * @param attendance  the check-in spine; `source` is read for censoring
 * @returns see the fields below; `ready:false` always carries a `reason`
 */
export function cohortModel(members = [], attendance = [], opts = {}) {
  const now = opts.now ?? Date.now();
  const nowMonth = monthIndex(now);
  const idx = attendanceIndex(attendance);

  // ⚠️ Every member with rows, INCLUDING cancelled and paused ones. This is the
  // exact opposite of `atRiskMembers`, which excludes them, and the opposite
  // reason applies: a member who left is not noise in a retention curve, they are
  // the entire signal. Filtering to current members would compute the retention
  // of the people who stayed and report it as the retention of everyone — a curve
  // that sits near 100% forever and flatters the gym into ignoring the problem
  // the screen exists to show.
  const roster = (members || []).length;
  const withRows = [];
  idx.forEach((e, memberId) => {
    withRows.push({ memberId, cohort: monthIndex(e.firstMs), last: monthIndex(e.lastMs), visits: e.visits });
  });

  const base = {
    ready: false, measured: withRows.length, roster,
    noRows: Math.max(0, roster - withRows.length),
    window: null, curve: [], cohorts: [], halfLifeMonths: null,
    censoredMonth: null, imported: false, excluded: 0,
    horizon: 0, curveOf: 0, curveTooNew: 0, period: "month",
  };

  if (!withRows.length) {
    return { ...base, reason: "No check-ins are recorded yet, so there is no history to measure. "
      + "Import your attendance from your previous system on the Members screen, or check a class in from the Class Runner." };
  }

  const firstMonth = Math.min(...withRows.map(m => m.cohort));
  const lastMonth = Math.max(...withRows.map(m => m.last));
  // The current month is still being lived. Clamped rather than trusted: a CSV
  // with a mistyped year can hand us a future date, and a denominator computed
  // against it would silently drop every real member out of the analysis.
  const lastFull = Math.min(lastMonth, nowMonth - 1);

  // Is the record's start an import boundary or the gym's actual beginning?
  const imported = (attendance || []).some(a => a?.source === "import");
  const firstMonthIsImported = (attendance || []).some(a =>
    a?.source === "import" && Number.isFinite(Date.parse(a?.checkedInAt))
    && monthIndex(Date.parse(a.checkedInAt)) === firstMonth);
  const censoredMonth = firstMonthIsImported ? firstMonth : null;

  const cohortMembers = censoredMonth == null ? withRows : withRows.filter(m => m.cohort !== censoredMonth);
  const window = { firstMonth, lastMonth, lastFull, months: lastFull - firstMonth + 1 };
  const mid = { ...base, window, imported, censoredMonth, measured: cohortMembers.length,
                excluded: withRows.length - cohortMembers.length };

  if (cohortMembers.length < MIN_MEMBERS) {
    // The number that IS held, next to the number needed. "Not enough data" on
    // its own leaves an owner unable to tell whether they are one member short or
    // a hundred, and therefore unable to decide whether to bother importing.
    const short = censoredMonth != null
      ? ` (${withRows.length - cohortMembers.length} more were first seen in ${monthLabel(censoredMonth)}, `
        + "the month your import starts, and cannot be told apart from members who were already training then)"
      : "";
    const held = cohortMembers.length === 0 ? "None do yet"
      : `So far ${cohortMembers.length} ${cohortMembers.length === 1 ? "member does" : "members do"}`;
    return { ...mid, reason: `A retention curve needs at least ${MIN_MEMBERS} members with a recorded check-in. `
      + `${held}${short}. `
      + "Import more of your attendance history on the Members screen and this fills in." };
  }

  // ── The curve ─────────────────────────────────────────────────────────────
  // "Retained at month k" means the member's LAST recorded visit is in month k
  // after their first, or later — a survival question, not an attendance one. A
  // member who trains every five weeks has empty calendar months and has not left;
  // asking "did they visit in month 3 exactly" would report them as churned and
  // then report them back.
  //
  // How far out the curve can go: the furthest horizon at which enough members
  // have had the whole span to stay or leave. Observability only shrinks as k
  // grows, so this walks out until it runs thin and then stops.
  let horizon = 0;
  for (let k = 1; k <= MAX_OFFSET; k++) {
    if (cohortMembers.filter(m => m.cohort + k <= lastFull).length < MIN_POINT_N) break;
    horizon = k;
  }
  // ONE population for every point — see the header. `panel` is the set with a
  // full `horizon` months of observable history, so its N is printed once rather
  // than per point, and the line cannot rise.
  const panel = cohortMembers.filter(m => m.cohort + horizon <= lastFull);

  if (horizon < 1) {
    return { ...mid, horizon: 0, curveOf: 0,
      reason: `Your records cover ${window.months} full month${window.months === 1 ? "" : "s"}. `
      + `A curve needs at least one full month after a member's first class, measured across ${MIN_POINT_N} or more members. `
      + "It appears here as the history builds." };
  }

  const curve = [];
  for (let k = 0; k <= horizon; k++) {
    const retained = panel.filter(m => m.last >= m.cohort + k).length;
    curve.push({ offset: k, retained, of: panel.length, pct: Math.round((retained / panel.length) * 100) });
  }

  // The one number an owner will quote. The first month where fewer than half are
  // still coming — NOT an extrapolation. If the curve never crosses 50% inside
  // the observed window the answer is `null` and the screen says the data does not
  // reach far enough yet, because a projected half-life is precisely the confident
  // wrong number this product refuses.
  const halfLifeMonths = curve.find(p => p.pct < 50)?.offset ?? null;

  // ── Per-cohort detail ─────────────────────────────────────────────────────
  // The pooled curve above answers "how long do members stay"; this answers "is
  // it getting better or worse", which is the question an owner acts on.
  //
  // ⚠️ MONTHLY OR QUARTERLY, chosen from the data. Monthly is the better reading
  // when the gym is big enough for it, and useless when it is not: a 36-member
  // studio adding two or three members a month produces a whole table of two-person
  // cohorts, where one person is 50 percentage points. Written monthly-only, every
  // row of that table carried the "read this as a direction, not a measurement"
  // footnote — a table that is entirely caveat is the thing this screen refuses,
  // arriving as a table instead of as a chart.
  //
  // So: monthly if at least two months clear MIN_POINT_N, otherwise quarters. The
  // period is reported, because "Q4 2025" and "Nov 2025" are different claims and
  // the reader has to know which one they are looking at.
  const OFFSETS = [1, 3, 6];
  const group = (period) => {
    const key = period === "quarter" ? (c => Math.floor(c / 3) * 3) : (c => c);
    const by = new Map();
    cohortMembers.forEach(m => {
      const k = key(m.cohort);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(m);
    });
    return by;
  };
  const monthly = group("month");
  const useQuarters = [...monthly.values()].filter(l => l.length >= MIN_POINT_N).length < 2;
  const period = useQuarters ? "quarter" : "month";
  const groups = useQuarters ? group("quarter") : monthly;

  const cohorts = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])                        // newest first: it is the one being judged
    .map(([start, list]) => {
      // ONE denominator for the whole row — the same rule the curve follows, for
      // the same reason. A per-cell denominator would let the 3-month figure sit
      // above the 1-month one, because the members observable that far are a
      // different (older, more loyal) subset. Measured from each member's OWN
      // first month, so a quarterly group whose members started in different
      // months is still asking "n months after THEIR first class".
      const youngest = Math.max(...list.map(m => m.cohort));
      return {
        month: start, label: periodLabel(start, period), size: list.length,
        points: OFFSETS.map(k => youngest + k > lastFull
          ? { offset: k, pct: null }                    // not observable yet — empty, never 0
          : { offset: k, pct: Math.round((list.filter(m => m.last >= m.cohort + k).length / list.length) * 100) }),
      };
    });

  return { ...mid, ready: true, reason: "", curve, halfLifeMonths, cohorts, period,
           horizon, curveOf: panel.length,
           // Members left off the CURVE for being too new — they are still in the
           // per-cohort table. Surfaced because a screen that says "20 members"
           // over a chart while the roster says 60 looks like it lost forty.
           curveTooNew: cohortMembers.length - panel.length };
}

/**
 * One sentence naming what the analysis was computed over. Kept next to the
 * arithmetic so the wording and the window cannot drift apart — the same reason
 * `describeRetention` lives in retention.js.
 */
export function describeCohorts(m) {
  if (!m?.ready) return m?.reason || "";
  const w = m.window;
  const span = `${monthLabel(w.firstMonth)} – ${monthLabel(w.lastFull)}`;
  // Names the period it actually used. The first version said "the month" while
  // the table showed quarters — the two sentences sat one line apart on screen
  // and contradicted each other, which reading it is what caught.
  const quarterly = m.period === "quarter"
    ? " Grouped by quarter because month-by-month groups would be a handful of people each, where one person moves the figure by tens of percent."
    : "";
  const censored = m.censoredMonth != null
    ? ` ${monthLabel(m.censoredMonth)} is left out: it is where your imported history begins, so everyone already training then looks like a new member.`
    : "";
  const noRows = m.noRows > 0
    ? ` ${m.noRows} member${m.noRows === 1 ? " has" : "s have"} no recorded check-in and ${m.noRows === 1 ? "is" : "are"} not counted.`
    : "";
  return `${m.measured} members, grouped by the ${m.period === "quarter" ? "quarter" : "month"} `
    + `they first appear in your records (${span}).${quarterly}${censored}${noRows}`;
}
