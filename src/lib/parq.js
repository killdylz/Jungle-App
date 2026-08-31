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

// The four things a record can be, and the ONE of them that is not a state of
// the paperwork: `referred` is a state of the person, so the label says what to
// do rather than what is wrong.
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
  const today = _iso(now instanceof Date ? now : new Date(now));

  if (!record || !record.screenedAt) {
    return {
      state: "unscreened", label: "Not screened", tone: "danger", blocksLoad: true,
      reason: "This client has not completed a health screen. Individualised load stays locked until they do.",
      expiresOn: "", flagged: [], answered: 0, total: PARQ_QUESTIONS.length,
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
    };
  }

  const expiresOn = parqExpiresOn(record.screenedAt);
  const flagged = flaggedQuestions(record.answers);
  const clearance = record.clearance && record.clearance.grantedAt ? record.clearance : null;

  // EXPIRY IS CHECKED BEFORE CLEARANCE, and the order is load-bearing. A GP
  // letter from 2023 attached to a 2023 screen does not clear a 2026 session:
  // the thing that went stale is the health picture, and the clearance was
  // granted against that picture.
  if (expiresOn && expiresOn < today) {
    return {
      state: "expired", label: "Expired", tone: "warn", blocksLoad: true,
      reason: `Screened ${record.screenedAt}, expired ${expiresOn}. Health changes; a screen older than ${PARQ_VALID_MONTHS} months is a record of someone who no longer exists.`,
      expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
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
      };
    }
    return {
      state: "gp_cleared", label: "Cleared by doctor", tone: "ok", blocksLoad: false,
      reason: `Answered yes to ${flagged.length} question${flagged.length === 1 ? "" : "s"}; clearance recorded ${clearance.grantedAt}${clearance.note ? ` — ${clearance.note}` : ""}. Valid until ${expiresOn}.`,
      expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
    };
  }

  return {
    state: "cleared", label: "Cleared", tone: "ok", blocksLoad: false,
    reason: `No answers flagged. Screened ${record.screenedAt}, valid until ${expiresOn}.`,
    expiresOn, flagged, answered, total: PARQ_QUESTIONS.length,
  };
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
