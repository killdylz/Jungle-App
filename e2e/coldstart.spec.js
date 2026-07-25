import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

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
