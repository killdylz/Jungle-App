// ─── PAR-Q · the health screen that gates individualised load ────────────────
//
// The As-Built spec (F2, gap 1) makes this a HARD gate: "PAR-Q must land in the
// same change that introduces individualised load." Until this session there was
// no 1:1 path, so the gate had nothing to guard and was correctly not built. The
// 1:1 screens landing beside this file are that individualised load, so the
// screen lands with them rather than after them.
//
// WHY THE ARITHMETIC IS HERE AND NOT IN THE SCREEN
// The same reason `cohorts.js` exists: the rule that decides whether a coach may
// prescribe load to a named person is the most consequential branch in this
// product, and a branch inside JSX is a branch nothing can unit-test. The screen
// renders `parqStatus()`; it never decides.
//
// 🔴 THIS IS NOT MEDICAL ADVICE AND THE MODULE MUST NOT PRETEND OTHERWISE.
// Every "yes" here means *talk to a doctor*, never "you are unfit to train" and
// never "you are cleared". The one thing Jungle asserts is procedural: whether a
// screen was completed, when, and whether a coach recorded a clearance. The
// wording lives in `PARQ_DISCLAIMER` so there is exactly one copy of it.
//
// The seven questions are the classic PAR-Q (Canadian Society for Exercise
// Physiology). They are reproduced in the industry's own words rather than
// paraphrased: a reworded health question is a different question, and the
// answers are kept as a dated record a coach may one day have to stand behind.

export const PARQ_DISCLAIMER =
  "This is a screening record, not medical advice. Jungle does not decide whether anyone " +
  "is fit to train — it records what was asked, what was answered, and when.";

// ── D5 · the consent this record cannot be collected without ────────────────
//
// 🔴 WHY THIS IS A REAL TICK AND NOT A SILENT WRITE. Session 34's prompt asked
// for `store.recordConsent()` to be called on save with a `health_screen` scope.
// Both halves of that are wrong, and the second one dangerously:
//
//  1. `consent_records.scope` carries a CHECK constraint (0007) listing
//     'roster_attendance', 'biometric_live', 'biometric_store', 'coach_view' and
//     'export'. `health_screen` is not in it, so every such insert would be
//     REJECTED by Postgres — this repo's own recurring data-loss bug, named in
//     retention.js and in 0008's comments, with three prior occurrences. Adding
//     the scope needs a migration, and a migration is Dylan's call.
//
//  2. More importantly, a `consent_records` row asserts that a person consented.
//     `CheckInPanel` refuses to write one for exactly this reason — "in a coach
//     sweep, none was [shown]... writing one anyway would fabricate a compliance
//     record, which is worse than an empty ledger" — and health answers are a
//     special category of data, so a fabricated consent for THEM is the worst
//     version of that mistake, not an acceptable one.
//
// The health screen, unlike the check-in sweep, is a form somebody sits down and
// fills in. That means a notice can actually be shown and actually be agreed to.
// So the consent here is REAL: the words below are on the screen, the coach or
// client ticks the box, and the record is refused without it. That is a consent
// trail worth having, and it is the reason this is the one place in the product
// where such a record can honestly be written today.
export const PARQ_CONSENT_NOTICE =
  "These are health answers, and they are kept as a dated record your coach may have to " +
  "stand behind. They stay on this device, are used only to decide whether a personalised " +
  "programme is safe to write, and can be deleted on request.";

// Which wording was agreed to. Stored with every record, because consent is to a
// SPECIFIC text: if this notice is ever reworded, a record carrying "v1" still
// says truthfully what its subject actually read.
export const PARQ_POLICY_VERSION = "parq-v1";

// `id` is what is STORED, so it must never change once a record exists in the
// wild. The order below is the order asked; `short` is for the summary chip,
// where the full sentence does not fit and truncating it mid-clause would change
// what it says.
export const PARQ_QUESTIONS = [
  { id: "q1", short: "Heart condition",
    text: "Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?" },
  { id: "q2", short: "Chest pain when active",
    text: "Do you feel pain in your chest when you do physical activity?" },
  { id: "q3", short: "Chest pain at rest",
    text: "In the past month, have you had chest pain when you were not doing physical activity?" },
  { id: "q4", short: "Dizziness or blackouts",
    text: "Do you lose your balance because of dizziness, or do you ever lose consciousness?" },
  { id: "q5", short: "Bone or joint problem",
    text: "Do you have a bone or joint problem that could be made worse by a change in your physical activity?" },
  { id: "q6", short: "Blood-pressure or heart medication",
    text: "Is your doctor currently prescribing drugs (for example, water pills) for your blood pressure or heart condition?" },
  { id: "q7", short: "Any other reason",
    text: "Do you know of any other reason why you should not do physical activity?" },
];

// A screen goes stale. Twelve months is the interval the PAR-Q itself states
// ("if your health changes… tell your fitness professional. Ask whether you
// should change your physical activity plan"), and it is the interval every
// insurer this product will meet expects to see.
export const PARQ_VALID_MONTHS = 12;

// How long before the cliff a valid screen starts SAYING it is about to lapse.
//
// WHY A WARNING WINDOW EXISTS AT ALL. Expiry was a hard cliff and nothing else:
// a screen read `cleared`, and the next morning it read `expired` and load was
// blocked, with no surface anywhere having said it was coming. The coach finds
// out when they try to program someone — which is the worst possible moment,
// because the client is standing in front of them and the only fast way out of
// the block is to re-screen on the spot or skip it.
//
// 30 days because that is the shortest interval in which a client can be asked
// to come in, fill the form and — if a question flags — actually see a doctor
// and bring back a note. A shorter warning would arrive too late to be acted on,
// which makes it a notification rather than a warning.
export const PARQ_EXPIRING_DAYS = 30;

// The six things a record can be, and the ONE of them that is not a state of
// the paperwork: `referred` is a state of the person, so the label says what to
// do rather than what is wrong.
//
// ⚠️ "EXPIRING" IS DELIBERATELY NOT IN THIS LIST, and that is a reversal of what
// session 34's prompt asked for ("a sixth non-blocking 'expiring' state"). The
// reason is `assignPtSession`, which writes `parqStateAtAssign: parq.state` into
// every session row as the audit trail. `cleared` and `gp_cleared` are different
// assurances — one is seven clean answers, the other is a doctor's letter — and
// a year from now which one applied is the whole question. A state that
// OVERWROTE either of them near an expiry date would erase that distinction from
// the record for exactly the sessions taken closest to the edge.
//
// Proximity to expiry is therefore a MODIFIER on the state, not a replacement
// for it: `expiring` and `daysToExpiry` below. Same warning, same tone change,
// same non-blocking behaviour the prompt asked for; the assurance survives.
export const PARQ_STATES = ["unscreened", "incomplete", "cleared", "referred", "gp_cleared", "expired"];

// A blank answer sheet. `null` rather than `false` throughout, because "not
// answered" and "answered no" are different facts and the second one is the
// whole point of the exercise — a sheet defaulted to `false` would read as a
// completed screen with seven clean answers before anybody was asked anything.
export function newParqAnswers() {
  return PARQ_QUESTIONS.reduce((acc, q) => { acc[q.id] = null; return acc; }, {});
}

export function answeredCount(answers) {
  return PARQ_QUESTIONS.filter(q => answers && typeof answers[q.id] === "boolean").length;
}

// Which questions were answered "yes" — the coach needs the list, not the count,
// because "bone or joint problem" and "chest pain at rest" lead to very
// different conversations.
export function flaggedQuestions(answers) {
  return PARQ_QUESTIONS.filter(q => answers && answers[q.id] === true);
}

// Date-only arithmetic, deliberately. A health screen is dated by the DAY it was
// taken — nobody records the minute — and `daysBetween` elsewhere in this repo
// counts local calendar days for the same reason. Adding months rather than 365
// days keeps "12 March" mapping to "12 March", which is what a human reading the
// expiry expects.
export function parqExpiresOn(screenedAt) {
  const d = _asDate(screenedAt);
  if (!d) return "";
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const out = new Date(y, m + PARQ_VALID_MONTHS, day);
  // 29 February + 12 months rolls into 1 March, which is fine and is what
  // `Date` already does. Clamping it back would move an expiry EARLIER than the
  // record allows, which is the wrong direction to be wrong in.
  return _iso(out);
}

function _asDate(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
}
function _iso(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Calendar days from `now` until an ISO date — negative once it is past.
//
// LOCAL CALENDAR DAYS, like `daysBetween` in retention.js and for the same
// reason: the datum is a date and the reader is a human with a calendar. Both
// sides are snapped to local midnight first, so "expires tomorrow" is true all
// day today rather than only until the hour the screen was taken.
//
// Round rather than floor: a DST transition inside the span leaves it 23 or 25
// hours short of a whole multiple, and flooring would quietly drop a day —
// reporting "expires in 29 days" on the day the warning window opens.
const _DAY_MS = 86_400_000;
function _daysUntil(iso, now) {
  const target = _asDate(iso);
  if (!target) return null;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - from.getTime()) / _DAY_MS);
}

// The sentence a coach acts on. Stated as a DEADLINE with the date attached,
// because "expires soon" is a feeling and "book it before 14 March" is a task.
function _expiryNote(days, expiresOn) {
  if (days === 0) return `This screen expires TODAY (${expiresOn}) — after that, individualised load is blocked until it is redone.`;
  if (days === 1) return `This screen expires TOMORROW (${expiresOn}) — after that, individualised load is blocked until it is redone.`;
  return `This screen expires in ${days} days (${expiresOn}). Book the next one before then, or individualised load stops that day — and if a question flags, they may need to see a doctor first.`;
}

// ── The gate ────────────────────────────────────────────────────────────────
//
// One function, and everything downstream reads `blocksLoad` from it. There is
// deliberately no second path to "may I prescribe for this person": the reason
// F2's gap 1 is written as a hard gate is that a *second* answer to that
// question is how a gate stops being one.
//
// `record` is the newest PAR-Q record for the member, or null/undefined if they
// have never been screened. Shape:
//   { screenedAt: "YYYY-MM-DD", answers: {q1..q7: bool|null},
//     clearance: { grantedAt, note } | null }
export function parqStatus(record, { now = new Date() } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = _iso(nowDate);

  if (!record || !record.screenedAt) {
    return {
      state: "unscreened", label: "Not screened", tone: "danger", blocksLoad: true,
      reason: "This client has not completed a health screen. Individualised load stays locked until they do.",
      expiresOn: "", flagged: [], answered: 0, total: PARQ_QUESTIONS.length,
      // Present on EVERY return, never conditionally. A caller reading
      // `status.expiring` must get `false` from a screen that has no expiry, not
      // `undefined` — the two are the same in an `if` and different in a
      // `=== false`, and this object is read by a gate.
      expiring: false, daysToExpiry: null,
    };
  }

  const answered = answeredCount(record.answers);
  if (answered < PARQ_QUESTIONS.length) {
    return {
      state: "incomplete", label: "Part-answered", tone: "danger", blocksLoad: true,
      // The count is stated because "incomplete" alone leaves the coach unable
      // to tell a screen one question short from a blank one — and therefore
      // unable to decide whether to finish it now or book five minutes for it.
      reason: `${answered} of ${PARQ_QUESTIONS.length} questions answered. A part-answered screen is not a screen.`,
      expiresOn: "", flagged: flaggedQuestions(record.answers), answered, total: PARQ_QUESTIONS.length,
      expiring: false, daysToExpiry: null,
    };
  }

  const expiresOn = parqExpiresOn(record.screenedAt);
  const flagged = flaggedQuestions(record.answers);
  const clearance = record.clearance && record.clearance.grantedAt ? record.clearance : null;
  const daysToExpiry = _daysUntil(expiresOn, nowDate);
  // The warning window, and the reason it is a modifier rather than a state is
  // above `PARQ_STATES`. Bounded at BOTH ends: `>= 0` keeps an already-expired
  // screen out of it (that is the `expired` state's job, and a record cannot be
  // both about to lapse and lapsed), and the upper bound is what makes it a
  // window rather than a permanent label on every valid screen.
  const expiring = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= PARQ_EXPIRING_DAYS;

  // EXPIRY IS CHECKED BEFORE CLEARANCE, and the order is load-bearing. A GP
  // letter from 2023 attached to a 2023 screen does not clear a 2026 session:
  // the thing that went stale is the health picture, and the clearance was
  // granted against that picture.
  if (expiresOn && expiresOn < today) {
    return {
      state: "expired", label: "Expired", tone: "warn", blocksLoad: true,
      reason: `Screened ${record.screenedAt}, expired ${expiresOn}. Health changes; a screen older than ${PARQ_VALID_MONTHS} months is a record of someone who no longer exists.`,
      expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
      // Already past the cliff: `expiring` is false because the warning is not
      // pending any more, and `daysToExpiry` stays as the negative number so a
      // caller can say HOW long ago without re-deriving it.
      expiring: false, daysToExpiry,
    };
  }

  if (flagged.length) {
    if (!clearance) {
      return {
        state: "referred", label: "Doctor first", tone: "danger", blocksLoad: true,
        // "Yes to n" rather than "failed": nobody fails a PAR-Q. The next step
        // is named, because a blocked coach with no named next step will find a
        // way around the block.
        reason: `Answered yes to ${flagged.length} question${flagged.length === 1 ? "" : "s"} (${flagged.map(q => q.short).join(", ")}). They should speak to a doctor before a personalised programme. Record the clearance here once they have.`,
        expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
        // Deliberately NOT warned about. This screen already blocks load, and a
        // second deadline underneath a live refusal is noise — the coach's next
        // step is the doctor, not the calendar.
        expiring: false, daysToExpiry,
      };
    }
    return {
      state: "gp_cleared", label: "Cleared by doctor", blocksLoad: false,
      // ⚠️ The doctor's clearance expires WITH the screen, not on its own date.
      // Expiry is evaluated before clearance (see above) for the same reason: the
      // letter was granted against a health picture that goes stale, so the
      // warning here is about the whole record lapsing, not just the answers.
      tone: expiring ? "warn" : "ok",
      reason: `Answered yes to ${flagged.length} question${flagged.length === 1 ? "" : "s"}; clearance recorded ${clearance.grantedAt}${clearance.note ? ` — ${clearance.note}` : ""}. Valid until ${expiresOn}.`
        + (expiring ? ` ${_expiryNote(daysToExpiry, expiresOn)}` : ""),
      expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
      expiring, daysToExpiry,
    };
  }

  return {
    state: "cleared", label: "Cleared", blocksLoad: false,
    // `warn` while expiring, and `blocksLoad` stays FALSE throughout — the whole
    // point is that this is a heads-up, not a gate. A warning that blocked would
    // simply move the cliff 30 days earlier.
    tone: expiring ? "warn" : "ok",
    reason: `No answers flagged. Screened ${record.screenedAt}, valid until ${expiresOn}.`
      + (expiring ? ` ${_expiryNote(daysToExpiry, expiresOn)}` : ""),
    expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
    expiring, daysToExpiry,
  };
}

/**
 * The expiry warning in the few characters a list chip has room for, or "" when
 * there is nothing to warn about.
 *
 * WHY THE SHORT FORM IS TEXT AND NOT A COLOUR. There is no `--warn` token in
 * this product — `colors.js` defines accent, green and danger, and danger is
 * deliberately not skin-derived — so the honest options were to invent a fourth
 * global colour or to say it in words. Words win twice over: WCAG 1.4.1 forbids
 * colour as the ONLY carrier of information, and `brandTokens.spec.js` sweeps
 * opaque text for AA contrast on a hand-built light skin, where a new amber
 * would have to earn 4.5:1 against a white card the way `--danger` (3.8:1)
 * could not.
 *
 * The chip therefore keeps the state it actually has — an expiring screen IS
 * still cleared — and appends the deadline.
 */
export function parqExpiryShort(status) {
  if (!status || !status.expiring) return "";
  const d = status.daysToExpiry;
  if (d === 0) return "expires today";
  if (d === 1) return "expires tomorrow";
  return `expires in ${d}d`;
}

// The newest record for a member. Records are an APPEND-ONLY ledger — re-screening
// someone adds a row rather than editing last year's answers, because last year's
// answers are what a coach acted on last year and overwriting them destroys the
// only evidence of why.
export function latestParq(records, memberId) {
  if (!memberId) return null;
  const mine = (records || []).filter(r => r && r.memberId === memberId && r.screenedAt);
  if (!mine.length) return null;
  // Newest by screening DATE, tie-broken by when the row was written. Two screens
  // on one day is a coach correcting a mistake, and the correction is the one
  // that counts.
  return [...mine].sort((a, b) =>
    String(a.screenedAt).localeCompare(String(b.screenedAt)) ||
    String(a.recordedAt || "").localeCompare(String(b.recordedAt || ""))
  ).pop();
}

// The sentence the 1:1 planner shows when it refuses. Separate from
// `parqStatus().reason` because that one describes the RECORD and this one
// describes the REFUSAL — a coach who cannot see what the block costs them will
// look for a way around it.
//
// ⚠️ IT DELIBERATELY DOES NOT REPEAT `reason`. The first draft did, and reading
// the rendered screen — which 935 passing tests could not do — showed the same
// forty words twice, once in the health-screen panel and again in the sentence
// immediately below it. The panel above owns the WHY; this owns the WHAT IS LOST
// and names where the fix is.
export function describeLoadGate(status) {
  if (!status.blocksLoad) return "";
  return `Locked. A personalised session needs a valid health screen, and this client\u2019s reads `
    + `\u201c${status.label}\u201d. The health-screen panel above is where that gets sorted.`;
}
