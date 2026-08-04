import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── REGRESSION §1.4 — the fresh-install journey, driven ──────────────────────
//
// `coldstart.spec.js` covers this feature's DECISION reaching the screen, and
// that its CTAs navigate somewhere. It does that by writing localStorage
// directly and reloading, which is the right way to test the Dashboard in
// isolation.
//
// This file asks the question that method cannot: when a real gym does the three
// things the checklist asks for, THROUGH THE UI, does the checklist agree they
// did them?
//
// It is a different claim. The counter reads counts computed in one place from
// writes made in another, and nothing had checked that the two agree on what
// "done" means. A step a gym completes and the checklist does not tick is worse
// than no checklist — the first ten minutes of the product become an argument
// the gym loses.

const CHECKLIST = '[data-testid="setup-checklist"]';
const counter = (page) => page.locator(CHECKLIST).getByText(/^\d \/ 3$/);

test.describe("a new gym's three steps actually tick", () => {
  test("0/3 on arrival, and each real action moves it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await waitForApp(page);

    // POSITIVE CONTROL. Without it, every "the counter reads N/3" below could
    // fail for the boring reason and this names which.
    await expect(page.locator(CHECKLIST), "a fresh install must show the checklist").toBeVisible();
    await expect(counter(page)).toHaveText("0 / 3");

    // ── STEP 1 · bring in your classes ────────────────────────────────────────
    // Any route in counts, deliberately (see SETUP_STEPS). This is the one the
    // product itself offers first.
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    expect((await stored(page, "jungle_persona_plans")).length,
      "the sample coach must actually write plans, or step 1 is untested").toBeGreaterThan(0);

    // No reload. `ownCounts` is a useState initialiser inside DashboardScreen,
    // which unmounts on navigation, so coming back re-samples the store — the
    // tick is immediate. Asserting it WITHOUT a reload is the point: a reload
    // would hide a checklist that only ever agreed with a fresh page load.
    await nav(page, "Dashboard");
    await expect(counter(page), "importing a class must tick step 1").toHaveText("1 / 3");

    // ── STEP 3 (out of order, deliberately) · bring your members across ───────
    // Done before "run a class", because running one REPLACES the checklist —
    // see below — and this is the last chance to watch the counter move.
    await nav(page, "Members");
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page.getByPlaceholder("Name (required)").fill("Sarah Chen");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect
      .poll(async () => (await stored(page, "jungle_members"))?.length ?? 0,
        { message: "adding a member must write to the roster" })
      .toBeGreaterThan(0);

    await nav(page, "Dashboard");
    await expect(counter(page), "adding a member must tick step 3").toHaveText("2 / 3");

    // ── STEP 2 · run your first class ─────────────────────────────────────────
    // `saveSession` discards anything under 10 seconds, so the class has to be
    // genuinely run. The clock is driven rather than waited on — 15 real seconds
    // in a suite that has to stay quick is how a sweep gets switched off.
    await page.clock.install();
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: "Start class" }).click();
    await page.clock.runFor(15_000);
    await page.getByRole("button", { name: "Back to class plan" }).click();

    await expect
      .poll(async () => (await stored(page, "jungle_history"))?.length ?? 0,
        { message: "a class run for 15s must be recorded" })
      .toBeGreaterThan(0);

    // 🔴 NOT "3 / 3", and this is the assertion worth reading twice. Running a
    // class flips `showChecklist` false, because the KPI row now has something
    // real to count. The checklist is a COLD-START SURFACE, not a progress bar:
    // it is replaced, not completed. A test expecting 3/3 here would be
    // asserting a product decision backwards — and §1.4 asked for exactly that
    // test, which is why this one is written the other way round.
    await nav(page, "Dashboard");
    await expect(page.locator(CHECKLIST),
      "once a class has been run the KPI row takes over from the checklist").toHaveCount(0);
    await expect(page.getByTestId("setup-nudge"),
      "and with all three done there is nothing left to nudge about").toHaveCount(0);
    await expect(page.getByText("Day streak", { exact: false }),
      "the KPI row it was standing in for must now be there").toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("a gym that runs classes but imports nothing is told once, quietly", async ({ page }) => {
    // The other half of the same decision, and the one that keeps the checklist
    // from becoming a nag: the switch is SESSIONS, not completion. A gym running
    // classes daily that never imports its old attendance must get its numbers,
    // not a setup card where they belong — plus one line naming what is
    // outstanding.
    await freshApp(page);
    await waitForApp(page);
    await page.clock.install();

    await nav(page, "Class Runner");
    await page.getByRole("button", { name: "Start class" }).click();
    await page.clock.runFor(15_000);
    await page.getByRole("button", { name: "Back to class plan" }).click();
    await expect
      .poll(async () => (await stored(page, "jungle_history"))?.length ?? 0)
      .toBeGreaterThan(0);

    await nav(page, "Dashboard");
    await expect(page.locator(CHECKLIST)).toHaveCount(0);
    const nudge = page.getByTestId("setup-nudge");
    await expect(nudge, "two steps outstanding must still be named").toBeVisible();
    // ONE step, not a list. `nextStep` is deliberately singular.
    await expect(nudge).toContainText(/Bring in your classes/i);
    await expect(nudge).not.toContainText(/Bring your members across/i);
  });
});
