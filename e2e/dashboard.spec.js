import { test, expect } from "@playwright/test";
import { freshApp, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The Dashboard's hero buttons actually go somewhere ─────────────────────
//
// The second one called `onNavigate("templates")`. That view was retired — folded
// into the Builder's class-type picker — and correctly filtered out of all four
// nav arrays by `isViewEnabled`, but no render branch was left behind and this
// button is not a nav array. Clicking it set `view` to a string nothing matches:
// the sidebar and footer stayed put and the whole content area went blank, with
// no back button and no error.
//
// Every existing guard passed it. `lint:crash` sees a valid string. The
// error-boundary sweep in screens.spec.js passes because nothing throws — React
// renders nothing, which is not a crash. "The root has children" is satisfied by
// the shell. So the assertion here is not "no error": it is that the coach LANDS
// on a screen, checked by a control only that screen has.
//
// `src/lib/navRoutes.test.js` pins the same invariant statically for every view;
// this drives the one a coach actually clicks.

test.describe("dashboard hero controls", () => {
  // A fresh store starts with mkStages()' five-stage class, so `hasDraft` is true
  // and both hero buttons render.
  test("\"New class\" lands on the Builder, not a blank screen", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await expect(page.getByText(/GOOD (MORNING|AFTERNOON|EVENING), COACH/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume building" })).toBeVisible();

    // Replacing an auto-saved plan is destructive, so it confirms first.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "New class", exact: true }).click();

    // Landing is proven by a control unique to the Builder. Asserting on the
    // shell — a sidebar, a footer, "root has children" — is exactly what the
    // blank screen already satisfied.
    await expect(page.getByRole("button", { name: "Preview on TV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Smart Distribute" })).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("\"New class\" replaces the plan; dismissing the confirm keeps it", async ({ page }) => {
    await freshApp(page);

    // Rename the draft so the stored object can distinguish "replaced" from
    // "still the same five stages I started with". Rename is a window.prompt.
    await page.getByRole("button", { name: "Resume building" }).click();
    page.once("dialog", (d) => d.accept("Thursday Hyrox"));
    await page.getByRole("button", { name: "Rename class" }).click();
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("Thursday Hyrox");

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();

    // Dismissed: the coach keeps their work.
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "New class", exact: true }).click();
    await expect(page.getByText(/GOOD (MORNING|AFTERNOON|EVENING), COACH/)).toBeVisible();
    expect((await stored(page, "jungle_draft_class"))?.name).toBe("Thursday Hyrox");

    // Accepted: a fresh class, and the coach is in the Builder to edit it.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "New class", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preview on TV" })).toBeVisible();
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("My Workout");
  });

  test("retired screens are absent from the sidebar", async ({ page }) => {
    await freshApp(page);
    // The choke-point's job. If one of these comes back, it comes back through
    // flags.js with a render branch — not because a menu drifted.
    for (const label of ["Templates", "Glossary", "Integrations"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });
});
