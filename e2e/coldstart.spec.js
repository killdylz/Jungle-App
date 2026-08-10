import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── Dashboard cold start (B1) ────────────────────────────────────────────────
//
// `freshApp` clears localStorage, so every test in this file starts as a gym
// that signed up thirty seconds ago — which is the state this feature exists
// for and the one no other suite covers.
//
// The unit tests in `src/lib/setupProgress.test.js` prove the DECISION; this
// file proves the decision reaches the screen and that the buttons on it go
// somewhere. The repo's recurring lesson is that those are different claims:
// every defect found in sessions 3-8 came from driving the flow, and a
// checklist whose CTA navigates nowhere would pass every unit test written.

const CHECKLIST = '[data-testid="setup-checklist"]';
const NUDGE     = '[data-testid="setup-nudge"]';

// Write history the way `saveSession` does, then reload. Seeding the store
// rather than running a real 10-second class keeps this test about the
// Dashboard; `smoke.spec.js` already drives the Runner end to end.
async function seed(page, { sessions = 0, plans = 0, members = 0 } = {}) {
  await page.evaluate(({ sessions, plans, members }) => {
    const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    if (sessions) localStorage.setItem("jungle_history", JSON.stringify(
      mk(sessions, i => ({ date: "2026-07-24", name: `Class ${i}`, stages: 5, durMin: 45, ts: Date.now() - i * 86400000 }))));
    if (plans) localStorage.setItem("jungle_persona_plans", JSON.stringify(
      mk(plans, i => ({ id: `p${i}`, title: `Plan ${i}`, personaId: "c1", blocks: [] }))));
    if (members) localStorage.setItem("jungle_members", JSON.stringify(
      mk(members, i => ({ id: `m${i}`, name: `Member ${i}`, status: "active" }))));
  }, { sessions, plans, members });
  await page.reload();
}

test.describe("a brand-new gym never sees four zeros", () => {
  test("shows the setup checklist instead of the KPI row", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await expect(page.locator(CHECKLIST)).toBeVisible();

    // The actual regression: the four stats all read the same empty array, so
    // "0 · 0.0 · 0 · 0" is what shipped before this. Assert the labels are gone,
    // not merely that the checklist is present — both could be true at once.
    await expect(page.getByText("Sessions this week", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Day streak", { exact: false })).toHaveCount(0);

    await expect(page.getByText(/Get your studio running/i)).toBeVisible();
    await expect(page.locator(CHECKLIST).getByText("0 / 3")).toBeVisible();

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // Each CTA is rendered straight from a step's `view` key into `onNavigate`. A
  // typo there is a dead button on the first screen of the product, and it would
  // pass the unit tests, the crash gate and the build.
  //
  // Each marker below must be text ONLY that screen renders. The obvious choice
  // for the Coaches screen — /Coaches/ — is the sidebar button, which is on
  // every screen: with it, sending "Add a class" to the Schedule instead passed.
  // Verified by mutation, which is the only reason that is known.
  const CTAS = [
    ["Add a class",       /Every coach's classes, style and formats/],
    ["Open Class Runner", /Room TV|Check in/],
    ["Import members",    /Your roster and the attendance history behind it/],
  ];
  for (const [cta, landed] of CTAS) {
    test(`"${cta}" navigates somewhere real`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);

      await page.locator(CHECKLIST).getByRole("button", { name: cta, exact: true }).click();

      await expect(page.getByText(landed).first()).toBeVisible();
      await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
      expectNoConsoleErrors(errors);
    });
  }

  test("ticks a step off once the gym has done it", async ({ page }) => {
    await freshApp(page);
    await seed(page, { plans: 2 });

    await expect(page.locator(CHECKLIST).getByText("1 / 3")).toBeVisible();
    // A done step loses its CTA — there is nothing left to do on it.
    await expect(page.locator(CHECKLIST).getByRole("button", { name: "Add a class" })).toHaveCount(0);
    await expect(page.locator(CHECKLIST).getByRole("button", { name: "Open Class Runner" })).toBeVisible();
  });

  // The trap the `showChecklist` rule exists to avoid: plans and roster imported
  // but nothing run yet. There is still nothing to count, so the numbers must
  // not come back early.
  test("keeps the checklist while there is still nothing to count", async ({ page }) => {
    await freshApp(page);
    await seed(page, { plans: 3, members: 40 });

    await expect(page.locator(CHECKLIST)).toBeVisible();
    await expect(page.locator(CHECKLIST).getByText("2 / 3")).toBeVisible();
    await expect(page.getByText("Total sessions", { exact: false })).toHaveCount(0);
  });
});

test.describe("a running gym gets its numbers back", () => {
  test("swaps the checklist for the KPI row after one class", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { sessions: 1, plans: 1, members: 5 });

    await expect(page.locator(CHECKLIST)).toHaveCount(0);
    await expect(page.getByText("Total sessions", { exact: false })).toBeVisible();
    // Setup is complete, so not even the one-line nudge remains.
    await expect(page.locator(NUDGE)).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  // The anti-nag rule. A gym running classes daily but never importing its old
  // roster must NOT be shown a setup card where its numbers belong.
  test("shows numbers plus a single quiet line when a step is outstanding", async ({ page }) => {
    await freshApp(page);
    await seed(page, { sessions: 12, plans: 4 });

    await expect(page.locator(CHECKLIST)).toHaveCount(0);
    await expect(page.getByText("Total sessions", { exact: false })).toBeVisible();

    await expect(page.locator(NUDGE)).toBeVisible();
    await expect(page.locator(NUDGE).getByText(/Bring your members across/)).toBeVisible();
    await page.locator(NUDGE).getByRole("button", { name: "Import members", exact: true }).click();
    await expect(page.getByText(/Your roster and the attendance history behind it/).first()).toBeVisible();
  });
});

// ── The other cold start: a coach with nothing (D3 / B6) ─────────────────────
//
// Spec §9.1 Status says a coach with no plans at all "has no class type, so no
// card and no presets — §9.1's empty screen case is still open". Driving it says
// otherwise: the path exists and works. This suite is what makes that claim
// checkable rather than a matter of whose memory is more recent, and it is why
// the spec entry is now corrected rather than carried forward again.
test.describe("a coach with nothing can still get to a class", () => {
  test("goes from no coaches at all to a named class shape", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Coaches");

    // 1. No coaches. Says so, and says what to do about it.
    await expect(page.getByText(/No coaches yet/i)).toBeVisible();

    // 2. Add one.
    await page.getByPlaceholder(/Name — e.g./).fill("Dylan");
    await page.getByRole("button", { name: "Add coach", exact: true }).click();

    // 3. A coach with zero plans is offered the class-type cold start, not a
    //    dead end telling them to go and import something first.
    await expect(page.getByText(/Start with a class this coach teaches/i)).toBeVisible();
    await page.getByPlaceholder(/Class type — e.g./).fill("S360");

    // 4. Pick a shape.
    await page.getByRole("button", { name: /^Circuit/ }).click();

    // 5. They land on a real class-type surface with a real shape behind it.
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start a class from this shape/ })).toBeVisible();

    // And it is STORED as a preset, not as an edit — so the coach's own shape
    // replaces it silently once their real classes arrive.
    const personas = await stored(page, "jungle_personas");
    const bp = personas[0].styleProfile.blueprints.S360;
    expect(bp.source).toBe("preset");
    expect(bp.slots.map(s => s.label)).toEqual(["Warm-up", "Circuit 1", "Circuit 2", "Cool-down"]);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // Found by driving the above: this line greets every coach on the cold-start
  // path and read "Add classs for S360" — three s, on a first-impression screen.
  test("spells the invitation to add classes correctly", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Coaches");
    await page.getByPlaceholder(/Name — e.g./).fill("Dylan");
    await page.getByRole("button", { name: "Add coach", exact: true }).click();
    await page.getByPlaceholder(/Class type — e.g./).fill("S360");
    await page.getByRole("button", { name: /^Circuit/ }).click();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/classs/i);
    expect(body).toMatch(/Add S360 classes and Jungle works out the structure/);
  });
});

// ─── §2.5 · reaching the end is said, once ───────────────────────────────────
//
// 🔴 THE FINDING, and it is structural rather than a missing message. The
// checklist's own "setup is done" line could never be read: `showChecklist` is
// `sessions === 0` and the `run` step is done at `sessions > 0`, so completing the
// third step is exactly what hides the card carrying the congratulation. The most
// a coach could ever see there was "2 / 3".
//
// So the acknowledgement lives on the other side of the switch, where they
// actually arrive.
test.describe("finishing setup is acknowledged", () => {
  const COMPLETE = '[data-testid="setup-complete"]';

  test("appears with the first class once every step is done", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { sessions: 1, plans: 2, members: 6 });

    // Control: this is the KPI side of the switch, not the checklist.
    await expect(page.locator(CHECKLIST)).toHaveCount(0);
    await expect(page.getByText("Day streak", { exact: false })).toBeVisible();

    await expect(page.locator(COMPLETE)).toBeVisible();
    await expect(page.locator(COMPLETE)).toContainText(/first class is in the books/);
    // Not a nag: nothing is still outstanding, so no "Still to do" beside it.
    await expect(page.locator(NUDGE)).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("retires itself on the second class rather than becoming a permanent compliment", async ({ page }) => {
    await freshApp(page);
    await seed(page, { sessions: 2, plans: 2, members: 6 });
    await expect(page.getByText("Day streak", { exact: false })).toBeVisible();
    await expect(page.locator(COMPLETE)).toHaveCount(0);
  });

  test("stays away while a step is still outstanding", async ({ page }) => {
    // One class run, no roster. This gym gets its numbers and a quiet nudge — it
    // has not finished, and telling it otherwise would be the flattering lie the
    // whole cold-start surface exists to avoid.
    await freshApp(page);
    await seed(page, { sessions: 1, plans: 2, members: 0 });
    await expect(page.locator(COMPLETE)).toHaveCount(0);
    await expect(page.locator(NUDGE)).toBeVisible();
  });

  test("never shows on the checklist itself, however complete the rest is", async ({ page }) => {
    await freshApp(page);
    await seed(page, { sessions: 0, plans: 4, members: 12 });
    await expect(page.locator(CHECKLIST)).toBeVisible();
    await expect(page.locator(COMPLETE)).toHaveCount(0);
    // And the card tops out at 2/3, which is the reason this feature exists.
    await expect(page.locator(CHECKLIST).getByText("2 / 3")).toBeVisible();
  });
});

test.describe("the checklist survives a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("renders at 375px with no horizontal overflow", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await expect(page.locator(CHECKLIST)).toBeVisible();
    await expect(page.locator(CHECKLIST).getByRole("button", { name: "Add a class", exact: true })).toBeVisible();

    // The card holds three CTAs beside three paragraphs; on a narrow phone that
    // is exactly the shape that pushes the page sideways.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page scrolls sideways on a phone").toBeLessThanOrEqual(0);

    expectNoConsoleErrors(errors);
  });
});
