import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The Class Runner's transport ─────────────────────────────────────────────
//
// The coach's primary surface while a room full of people is watching. It had no
// dedicated spec, and the reason it went unnoticed is instructive: every control
// here is icon-only, so until session 12 gave them accessible names there was no
// way for a test to REFER to one. The accessible-name sweep in `screens.spec.js`
// is what made this file writable, and writing it immediately found a defect.
//
// THE DEFECT. The back button was wired to `onNextStage` — the same handler as
// forward. There was no previous-stage handler in the app at all. A coach who
// advanced too early and reached for "back" moved the room ANOTHER stage on, and
// both buttons render a correct-looking arrow either way.

const stageCounter = (page) => page.getByText(/^\d+\/\d+$/).first();

test.describe("the coach can move the class in both directions", () => {
  test("the back button goes back a stage, not forward", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");

    // The default plan: five stages, starting on the first.
    await expect(stageCounter(page)).toHaveText("1/5");
    // Nothing to go back to yet, so the control is absent rather than inert.
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(0);

    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("2/5");

    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("3/5");

    // THE ASSERTION. This read 4/5 before the fix — the room was pushed further
    // into the class by the control that exists to pull it back.
    await page.getByRole("button", { name: "Previous stage" }).click();
    await expect(stageCounter(page)).toHaveText("2/5");

    await page.getByRole("button", { name: "Previous stage" }).click();
    await expect(stageCounter(page)).toHaveText("1/5");
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("does not run off either end of the plan", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    // Forward to the last stage; the forward control then disappears too, so
    // neither end can be walked past.
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("5/5");
    await expect(page.getByRole("button", { name: "Next stage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(1);
  });

  // The play/pause control is the single biggest thing on the screen and had no
  // name at all. A static "Play/pause" would not be enough either: the name has
  // to say which state a press produces, or it describes nothing.
  test("the primary control announces what pressing it will do", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible();
    await page.getByRole("button", { name: "Start class" }).click();
    await expect(page.getByRole("button", { name: "Pause class" })).toBeVisible();
    await page.getByRole("button", { name: "Pause class" }).click();
    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible();
  });
});
