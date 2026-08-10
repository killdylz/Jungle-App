import { describe, it, expect } from "vitest";
import { setupProgress, describeSetup, coachFirstName, SETUP_STEPS } from "./setupProgress.js";

// The first screen a new gym sees. The thing under test is the DECISION — does
// the KPI row have anything real to say, and if not, which step is named next —
// so every case below is a state a real studio can be in on a given morning.

const brandNew = { classes: 0, sessions: 0, members: 0 };

describe("setupProgress — the cold-start switch", () => {
  it("hides the KPI row for a gym that has never run a class", () => {
    expect(setupProgress(brandNew).showChecklist).toBe(true);
  });

  it("shows the KPI row the moment one class has been run", () => {
    expect(setupProgress({ ...brandNew, sessions: 1 }).showChecklist).toBe(false);
  });

  // The rule that keeps the checklist from becoming a nag: a gym running classes
  // daily but never importing its old roster still gets its own numbers.
  it("keeps the KPI row for a running gym with steps outstanding", () => {
    const p = setupProgress({ classes: 4, sessions: 30, members: 0 });
    expect(p.showChecklist).toBe(false);
    expect(p.complete).toBe(false);
    expect(p.nextStep.key).toBe("members");
  });

  // The inverse trap: plans and members imported, but nothing run yet. There is
  // still nothing to count, so the numbers must not come back early.
  it("still hides the KPI row when only the un-runnable steps are done", () => {
    expect(setupProgress({ classes: 6, sessions: 0, members: 120 }).showChecklist).toBe(true);
  });

  it("defaults every count to zero when called with nothing", () => {
    expect(setupProgress().showChecklist).toBe(true);
    expect(setupProgress().done).toBe(0);
  });
});

describe("setupProgress — which steps are ticked", () => {
  it("ticks nothing for a brand-new gym", () => {
    const p = setupProgress(brandNew);
    expect(p.done).toBe(0);
    expect(p.total).toBe(3);
    expect(p.steps.map(s => s.done)).toEqual([false, false, false]);
    expect(p.nextStep.key).toBe("classes");
  });

  it("ticks classes on any route in — an imported deck or a hand-built plan", () => {
    const p = setupProgress({ classes: 1, sessions: 0, members: 0 });
    expect(p.steps.find(s => s.key === "classes").done).toBe(true);
    expect(p.done).toBe(1);
    expect(p.nextStep.key).toBe("run");
  });

  it("ticks every step and reports complete", () => {
    const p = setupProgress({ classes: 2, sessions: 5, members: 40 });
    expect(p.done).toBe(3);
    expect(p.complete).toBe(true);
    // null, not a placeholder step — the caller renders nothing at all.
    expect(p.nextStep).toBeNull();
  });

  it("does not report complete while one step is missing", () => {
    expect(setupProgress({ classes: 2, sessions: 5, members: 0 }).complete).toBe(false);
    expect(setupProgress({ classes: 0, sessions: 5, members: 3 }).complete).toBe(false);
  });

  // Steps are rendered straight into a nav call, so a typo'd view key would be a
  // dead button on the first screen of the product.
  it("gives every step a title, a body, a CTA and a real view to navigate to", () => {
    const views = ["personas", "live", "member", "builder", "calendar", "brand-studio"];
    for (const s of SETUP_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.cta.length).toBeGreaterThan(0);
      expect(views).toContain(s.view);
    }
  });

  it("does not mutate SETUP_STEPS when marking progress", () => {
    setupProgress({ classes: 1, sessions: 1, members: 1 });
    expect(SETUP_STEPS.every(s => !("done" in s))).toBe(true);
  });
});

describe("describeSetup — says where they are without flattering an empty gym", () => {
  it("never calls zero progress a milestone", () => {
    const line = describeSetup(setupProgress(brandNew));
    expect(line).not.toMatch(/0 of 3/);
    expect(line).toMatch(/Three steps/);
  });

  it("counts partial progress explicitly", () => {
    expect(describeSetup(setupProgress({ classes: 1, sessions: 0, members: 0 }))).toMatch(/1 of 3/);
    expect(describeSetup(setupProgress({ classes: 1, sessions: 0, members: 9 }))).toMatch(/2 of 3/);
  });

  it("closes out when everything is ticked", () => {
    expect(describeSetup(setupProgress({ classes: 1, sessions: 2, members: 9 }))).toMatch(/All three steps are done/);
  });

  // 🔴 …and that sentence is UNREACHABLE from the checklist, which is the finding
  // behind `justFinished`. Completing the third step is what hides the card, so a
  // coach can never read it there. It used to say "Run a class and this page starts
  // filling in" — copy only someone who had already run one could ever have seen.
  it("cannot show a completion line on the card that is hidden by completing it", () => {
    for (let sessions = 0; sessions <= 3; sessions++) {
      const p = setupProgress({ classes: 4, sessions, members: 12 });
      expect(p.showChecklist && p.complete,
        `sessions=${sessions}: the checklist and completion are showing together`).toBe(false);
    }
  });
});

describe("reaching the end is said once, after the switch", () => {
  it("fires on the first class with everything else done", () => {
    expect(setupProgress({ classes: 4, sessions: 1, members: 12 }).justFinished).toBe(true);
  });

  it("does not fire while a step is outstanding", () => {
    expect(setupProgress({ classes: 4, sessions: 1, members: 0 }).justFinished).toBe(false);
    expect(setupProgress({ classes: 0, sessions: 1, members: 12 }).justFinished).toBe(false);
  });

  it("retires itself rather than becoming a permanent compliment", () => {
    // No dismiss button and no stored flag: a second class is what stands it down.
    expect(setupProgress({ classes: 4, sessions: 2, members: 12 }).justFinished).toBe(false);
    expect(setupProgress({ classes: 4, sessions: 40, members: 12 }).justFinished).toBe(false);
  });

  it("never fires while the checklist is the thing on screen", () => {
    const p = setupProgress({ classes: 4, sessions: 0, members: 12 });
    expect(p.showChecklist).toBe(true);
    expect(p.justFinished).toBe(false);
  });
});

// ─── What to call the coach ──────────────────────────────────────────────────
// The greeting reads "GOOD AFTERNOON, <name>" in 12px letterspaced accent caps
// across the top of the Dashboard, so whatever this returns is shouted.
describe("coachFirstName", () => {
  it("takes the first name when there is one", () => {
    expect(coachFirstName("Priya Nair")).toBe("Priya");
    expect(coachFirstName("  Marcus  ")).toBe("Marcus");
  });

  it("never greets a coach with their email address", () => {
    // The live path: `display_name` falls back to `user.email` for a Google
    // account with no name set, and the old `split(" ")[0]` returned the whole
    // address. Digits are the giveaway that a local part is not a name.
    expect(coachFirstName("dylanrodrigues2710@gmail.com")).toBe("Coach");
    expect(coachFirstName("dylan.rodrigues@studio.com")).toBe("Dylan");
    expect(coachFirstName("priya_nair@studio.com")).toBe("Priya");
    expect(coachFirstName("coach-mara@studio.com")).toBe("Coach");
  });

  it("capitalises an email-derived name but leaves a real one alone", () => {
    // The sidebar renders this raw; only the Dashboard greeting upper-cases it, so
    // a lower-case "dylan" would show up in the one place nobody looks.
    expect(coachFirstName("dylan@studio.com")).toBe("Dylan");
    // A name the coach typed is theirs.
    expect(coachFirstName("de Souza Fernandes")).toBe("de");
  });

  it("falls back to Coach rather than to nothing", () => {
    // The credential-less build has no session and therefore no name at all.
    // "Coach" there is honest, not a defect — see the note in setupProgress.js.
    for (const v of [undefined, null, "", "   ", "@x.com", "123", "42@x.com"]) {
      expect(coachFirstName(v), `${JSON.stringify(v)}`).toBe("Coach");
    }
  });

  // U1: the coach is never shown our vocabulary.
  it("uses no internal words", () => {
    const banned = /parser|corpus|extraction|persona|blueprint|Supabase|KPI|localStorage/i;
    for (const s of SETUP_STEPS) {
      expect(`${s.title} ${s.body} ${s.cta}`).not.toMatch(banned);
    }
    for (const n of [0, 1, 3]) {
      const p = setupProgress({ classes: n, sessions: n, members: n });
      expect(describeSetup(p)).not.toMatch(banned);
    }
  });
});
