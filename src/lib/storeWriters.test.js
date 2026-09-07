import { describe, it, expect } from "vitest";
import { audit } from "../../scripts/audit-store-writers.mjs";

// ─── S31 §2.2 · every key a store writer accepts must have a way in ─────────
//
// 🔴 THE DEFECT THIS EXISTS FOR. Session 30 shipped `updateCoach` accepting five
// keys while the app passed exactly one. `name`, `userId`, `active` and `aliases`
// could only be set by editing localStorage by hand. 1019 tests passed, because
// NO TEST CAN NOTICE AN ABSENCE — there is nothing to assert about a control that
// was never built. This is the check that can.
//
// ⚠️ IT IS A RULE ABOUT PATCH-SHAPED WRITERS ONLY. `save*(list)` writers take a
// whole object and are listed by the audit as explicitly unchecked rather than
// silently passed. Widening this to every field of every stored object was tried
// and produced noise: a crude field sweep flagged `weekKey`, which turned out to
// be written at CalendarScreen.jsx:275 via `obj.field = value` — a form the sweep
// could not see. A check that has to be argued with every time it runs gets
// deleted, so this pins only what it can state exactly.

// Keys that legitimately have no control, each with the reason it is not a
// defect. 🔴 ADDING A LINE HERE IS A PRODUCT DECISION, not a way to green the
// build: it says "nothing can set this and that is correct".
const KNOWN_SEAMS = {
  "addCoach.id":          "caller-supplies-id seam (`extra.id || newId()`), used by tests and seeds. No gym types a coach's internal id.",
  "addMember.externalRef": "API symmetry with updateMember. The FIELD has a writer — the CSV import builds the member row directly and `applyAttendanceImport` stores it — just not through this function.",
  "updateMember.externalRef": "Deliberately not hand-editable. The roster form edits the four things a human knows (name, email, joined, status); an external reference is another system's key, and a hand-typed one that does not match that system is a confident wrong answer where a blank was merely empty. Its writer is the CSV import.",
};

describe("store writers — no key without a way in", () => {
  // POSITIVE CONTROL, and it is the allowlist itself. A sweep that matched
  // nothing and a sweep that found nothing are indistinguishable from the
  // assertion's side, and this repo has been fooled by exactly that. If the
  // parser breaks, the path moves, or the writers stop being recognised, these
  // known-unwritten keys stop being found and the suite says so — instead of
  // going green on an audit that is silently reading nothing.
  it("🔴 finds the writers at all — an empty parse must not pass", () => {
    expect(audit.writers.length).toBeGreaterThanOrEqual(4);
    expect(audit.writers.map(w => w.name)).toEqual(
      expect.arrayContaining(["addCoach", "addMember", "updateCoach", "updateMember"]));
    // Every writer resolved at least one accepted key, or the key extraction is
    // broken and every "missing" below would be a false negative.
    for (const w of audit.writers) expect(w.accepts.length).toBeGreaterThan(0);
  });

  it("🔴 still finds the known unwritten keys — the sweep can fail", () => {
    const found = audit.writers.flatMap(w => w.missing.map(k => `${w.name}.${k}`));
    for (const seam of Object.keys(KNOWN_SEAMS)) expect(found).toContain(seam);
  });

  it("🔴 no store writer accepts a key nothing in src/ can pass", () => {
    const offenders = audit.writers.flatMap(w =>
      w.missing.map(k => `${w.name}.${k}`)).filter(k => !(k in KNOWN_SEAMS));
    // Named in the message, so a failure says WHICH field lost its control
    // rather than only that a count moved.
    expect(offenders).toEqual([]);
  });

  it("§2.1's fields stay reachable — the regression this was written for", () => {
    const uc = audit.writers.find(w => w.name === "updateCoach");
    for (const k of ["name", "aliases", "userId", "active", "availability"]) {
      expect(uc.accepts).toContain(k);
      expect(uc.passed).toContain(k);
    }
  });
});
