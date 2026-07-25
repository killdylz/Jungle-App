import { describe, it, expect } from "vitest";
import { setupProgress, describeSetup, SETUP_STEPS } from "./setupProgress.js";

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
    expect(describeSetup(setupProgress({ classes: 1, sessions: 2, members: 9 }))).toMatch(/Setup is done/);
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
