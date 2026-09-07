import { describe, it, expect } from "vitest";
import { audit, KNOWN_SEAMS } from "../../scripts/audit-store-writers.mjs";

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

// 🔴 THE ALLOWLIST NOW LIVES IN THE SCRIPT, and is imported rather than copied.
// It used to be duplicated here while `audit-store-writers.mjs` printed three
// `🔴 NO WRITER` lines on every run for the same three keys — so the script's
// loudest signal was permanently wrong, the reasoning lived in a third place
// (`docs/STORE-WRITER-AUDIT.md`), and nothing stopped the two lists drifting.
// One definition, in the file that raises the flag; this file asserts the rule
// about it. See `KNOWN_SEAMS` in the script for what each entry means and for
// why adding one is a product decision rather than a way to green the build.

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
    // Stated a second way, off the script's OWN split, so the CLI's green line
    // and this suite cannot disagree about which keys were explained.
    expect(audit.explained.sort()).toEqual(Object.keys(KNOWN_SEAMS).sort());
  });

  it("🔴 the allowlist has not gone stale — an entry the sweep stops finding", () => {
    // The other direction, and the one an allowlist rots in: a line here that no
    // longer matches anything means either the field grew a control (delete the
    // line) or the parser stopped seeing it (fix the script). Both are silent
    // otherwise, and the second one turns the whole audit into a no-op.
    expect(audit.staleSeams).toEqual([]);
  });

  it("🔴 no store writer accepts a key nothing in src/ can pass", () => {
    // Named in the message, so a failure says WHICH field lost its control
    // rather than only that a count moved.
    expect(audit.unexplained).toEqual([]);
  });

  it("every allowlisted seam carries a reason, not just a name", () => {
    // An allowlist of bare keys is a suppression list. The prose is what makes
    // adding a line a decision somebody has to defend.
    for (const [key, why] of Object.entries(KNOWN_SEAMS)) {
      expect(key, `${key} must be writer.field`).toMatch(/^[A-Za-z]+\.[A-Za-z]+$/);
      expect(String(why).length, `${key} has no reason`).toBeGreaterThan(40);
    }
  });

  it("§2.1's fields stay reachable — the regression this was written for", () => {
    const uc = audit.writers.find(w => w.name === "updateCoach");
    for (const k of ["name", "aliases", "userId", "active", "availability"]) {
      expect(uc.accepts).toContain(k);
      expect(uc.passed).toContain(k);
    }
  });
});
