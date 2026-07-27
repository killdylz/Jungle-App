import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The Exercise Library can put a movement INTO the class ──────────────────
//
// `LibraryBrowserModal` accepted an `onAddExercise` prop, both Builder call sites
// passed `handleAddLibraryExercise`, the handler was written and commented
// ("Add an exercise … to the currently-selected stage") — and nothing in the
// modal ever called it. So the one action a coach opens the library FOR did not
// exist: 330 movements, browse-only, retype what you want by hand.
//
// It is invisible to every guard this repo has. Nothing throws, no screen is
// blank, no accessible name is wrong, and the prop is passed correctly from both
// ends. Only the middle is missing. It was found by asking which threaded props
// are never referenced, not by looking for it.
//
// The prop's PRESENCE is the context: the standalone Library route (a nav
// destination with no class in hand) passes none and shows no Add control, which
// is asserted below so that stays true.

test.describe("exercise library → class", () => {
  test("adds a movement to the selected stage and stores it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");

    // Stage 0 ("Warm-Up") is selected by default; the toast names it so a coach
    // looking at a full-screen modal knows where the movement landed.
    const before = (await stored(page, "jungle_draft_class"))?.stages?.[0]?.exercises ?? [];

    await page.getByRole("button", { name: /Browse Library/ }).click();

    // Take the movement from the control itself rather than hard-coding a name
    // out of src/data/library.js — that catalogue is the gym's to edit.
    const addBtn = page.getByRole("button", { name: /^Add .+ to class$/ }).first();
    await expect(addBtn).toBeVisible();
    const label = await addBtn.getAttribute("aria-label");
    const movement = label.replace(/^Add /, "").replace(/ to class$/, "");

    await addBtn.click();
    await expect(page.getByText("Added to Warm-Up")).toBeVisible();

    // Assert what was STORED. A row that appears in the modal and never reaches
    // the draft is this repo's recurring defect shape.
    await expect
      .poll(async () => (await stored(page, "jungle_draft_class"))?.stages?.[0]?.exercises?.map(e => e.n) ?? [])
      .toContain(movement);

    const after = (await stored(page, "jungle_draft_class")).stages[0].exercises;
    expect(after).toHaveLength(before.length + 1);

    expectNoConsoleErrors(errors);
  });

  test("the standalone Library has no Add control — there is no class to add to", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Exercise Library");
    await expect(page.getByRole("button", { name: /^Add .+ to class$/ })).toHaveCount(0);
    // Still the same library, just without the class-context action.
    await expect(page.getByPlaceholder("Search exercises…")).toBeVisible();
  });

  test("no control in the library does nothing when pressed", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Exercise Library");
    // "+ New class type" sat in the left rail with no onClick at all. Removed
    // rather than half-built: the delta store would carry a gym-authored class
    // type, but the Builder's class picker reads the built-in catalogue, so it
    // would have appeared here and in no other surface.
    await expect(page.getByRole("button", { name: /New class type/ })).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });
});
