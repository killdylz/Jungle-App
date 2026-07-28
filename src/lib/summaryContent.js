// ─── N4: what a class publishes to its member link ───────────────────────────
//
// The runner's stage objects are the coach's working state: ids, music tracks,
// whatever the Builder happens to hang off them next. This turns that into the
// document stored in class_summaries.content and served to a member.
//
// IT IS AN ALLOW-LIST, NOT A CLEANER. Every field in the output is named here.
// Nothing is copied wholesale and nothing is deleted by name — so a future
// field added to a stage object cannot reach a member by default, and the
// review question when someone adds one is "should this be published?" rather
// than the much easier-to-lose "did anyone remember to strip this?".
//
// That distinction is the entire privacy design of N4 in one function. The
// token in front of this content is class-scoped so that a leaked link exposes
// programming and not people; that property is worth exactly as much as this
// function's refusal to copy an unrecognised key. If it ever becomes a
// blocklist, the token guarantee becomes a hope.
//
// Pure, so it is testable without a browser — the same reason shareCard.js
// separates its layout maths from its canvas.

export const CONTENT_VERSION = 1;

// Caps, not errors. A malformed draft with 500 stages should publish something
// truncated and honest rather than fail, and it must not put a multi-megabyte
// document through an Edge Function on gym Wi-Fi.
export const MAX_STAGES = 24;
export const MAX_EXERCISES = 40;
export const MAX_TEXT = 140;

const clean = (v, cap = MAX_TEXT) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, cap);

/**
 * Build the publishable document for one class.
 *
 * `stages[].dur` is SECONDS in the runner (shareCard.js divides by 60 for the
 * same reason). It is stored as minutes here because that is what a member
 * reads, and because storing the raw seconds would invite a later reader to
 * assume the wrong unit — which is a bug that survives review.
 */
export function summaryContent({ stages = [], sessionName = "" } = {}) {
  const src = Array.isArray(stages) ? stages : [];
  const kept = [];
  let droppedStages = 0;

  for (const s of src) {
    if (kept.length >= MAX_STAGES) { droppedStages++; continue; }
    const exSrc = Array.isArray(s?.exercises) ? s.exercises : [];
    const exercises = [];
    let droppedEx = 0;
    for (const ex of exSrc) {
      const n = clean(ex?.n);
      // A movement with no name is a blank row in the Builder, not a movement.
      if (!n) continue;
      if (exercises.length >= MAX_EXERCISES) { droppedEx++; continue; }
      // s = sets, r = reps/duration, rest = rest interval. Empty strings are
      // dropped rather than stored: the page renders "—" from absence, and a
      // document full of "" is noise in every log that ever prints it.
      const out = { n };
      const sets = clean(ex?.s, 24); if (sets) out.s = sets;
      const reps = clean(ex?.r, 24); if (reps) out.r = reps;
      const rest = clean(ex?.rest, 24); if (rest) out.rest = rest;
      exercises.push(out);
    }
    const name = clean(s?.name);
    // A stage with neither a name nor a single movement has nothing to show.
    if (!name && !exercises.length) continue;
    const stage = { name, type: clean(s?.type, 32), exercises };
    const durMin = Math.round((Number(s?.dur) || 0) / 60);
    if (durMin > 0) stage.durMin = durMin;
    if (droppedEx > 0) stage.more = droppedEx;
    kept.push(stage);
  }

  const doc = {
    v: CONTENT_VERSION,
    title: clean(sessionName) || "Class",
    stages: kept,
  };
  if (droppedStages > 0) doc.more = droppedStages;
  return doc;
}

/**
 * The headline numbers, derived rather than stored — a stored total is a second
 * source of truth that goes stale the moment a stage is edited.
 */
export function summaryTotals(content) {
  const stages = Array.isArray(content?.stages) ? content.stages : [];
  const movements = new Set();
  let minutes = 0;
  for (const s of stages) {
    minutes += Number(s?.durMin) || 0;
    for (const ex of s?.exercises || []) {
      const n = clean(ex?.n);
      if (n) movements.add(n.toLowerCase());
    }
  }
  return { minutes, stageCount: stages.length, movementCount: movements.size };
}

/** Nothing worth publishing — the caller should say so rather than mint a link. */
export function isPublishable(content) {
  return summaryTotals(content).movementCount > 0;
}
