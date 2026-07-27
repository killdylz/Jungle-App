import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The Exercise Library's WRITE paths ──────────────────────────────────────
//
// Session 15 pinned add-to-class, reorder, and the search/reorder interaction.
// It left the three controls that WRITE TO THE GYM'S OWN CATALOGUE unpinned by
// any test: edit, delete, and Reset-to-defaults. Reset is the destructive one —
// it drops every customisation the studio has ever made, behind a confirm
// overlay that nothing in the suite had ever driven.
//
// All three go through `saveLibrary`, which since DEC-13 stores a DELTA against
// WORKOUT_LIBRARY rather than a snapshot, under `jungle_library_custom` and
// (live) `library_overrides`. That makes the stored shape the thing worth
// asserting: a delta that comes out wrong is not a visual bug, it is a gym's
// catalogue silently diverging from what its coaches see.
//
// So every test here reads the STORED object back, and asserts the delta's
// SHAPE, not just that something was written. `{v:2, classes:{…}}` is the
// contract libraryStore.js merges against on the next load and pushes to
// Postgres on the next sync.

const KEY = "jungle_library_custom";

// Open the standalone Library route in edit mode. Deliberately the standalone
// route, not the Builder's tab: it passes no `onAddExercise`, so no Add control
// renders and the row's only buttons are the ones under test.
async function openLibraryEditMode(page) {
  await nav(page, "Exercise Library");
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await expect(page.getByRole("button", { name: /Done/ }).first()).toBeVisible();
}

// The first movement's name, taken from the control rather than hard-coded out
// of src/data/library.js — that catalogue is the gym's to edit, and a test that
// names a movement breaks the moment a coach renames it.
async function firstMovementName(page) {
  const label = await page.getByRole("button", { name: /^Edit / }).first().getAttribute("aria-label");
  return label.replace(/^Edit /, "");
}

test.describe("the Exercise Library writes to the gym's catalogue", () => {
  test("editing a movement stores a v2 delta, not a snapshot of all 330", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);

    // A clean gym has NO override row at all. That is the DEC-13 contract: an
    // untouched catalogue must not pin the gym to today's built-in library.
    expect(await stored(page, KEY), "a fresh gym must store no library override").toBeNull();

    const original = await firstMovementName(page);
    await page.getByRole("button", { name: `Edit ${original}` }).click();

    const renamed = `${original} (coach cue)`;
    await page.getByPlaceholder("Exercise name *").fill(renamed);
    await page.getByPlaceholder("Muscles targeted").fill("posterior chain");
    await page.getByRole("button", { name: "Save Exercise" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    // Rendered.
    await expect(page.getByText(renamed).first()).toBeVisible();

    // Stored — and stored as a DELTA. If this ever becomes a full catalogue
    // dump the gym gets frozen out of future built-in improvements, which is
    // the exact failure DEC-13 was written to prevent.
    const blob = await stored(page, KEY);
    expect(blob, "an edit must write an override row").not.toBeNull();
    expect(blob.v, "the blob must carry the v2 version marker libraryStore merges on").toBe(2);
    expect(Object.keys(blob.classes || {}).length,
      "a single edit must touch a single class, not the whole catalogue").toBe(1);

    // The delta must actually contain the new name somewhere, and must NOT be
    // so large that it is a snapshot wearing a delta's shape. 330 movements
    // serialise to ~58 KB; one edited pool is orders of magnitude smaller.
    const json = JSON.stringify(blob);
    expect(json).toContain(renamed);
    expect(json.length,
      `the delta is ${json.length} bytes — that is a snapshot, not a delta`).toBeLessThan(20000);

    expectNoConsoleErrors(errors);
  });

  test("an edit reverted by hand removes the override row entirely", async ({ page }) => {
    // The other half of the DEC-13 rule, and the one a snapshot implementation
    // gets wrong: a coach who renames a movement and then renames it back is
    // not a customised gym, so the row must be DELETED rather than left as an
    // empty delta. A stale empty row still wins over the built-in catalogue on
    // the next hydrate.
    await freshApp(page);
    await openLibraryEditMode(page);

    const original = await firstMovementName(page);
    await page.getByRole("button", { name: `Edit ${original}` }).click();
    await page.getByPlaceholder("Exercise name *").fill(`${original} TEMP`);
    await page.getByRole("button", { name: "Save Exercise" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    expect(await stored(page, KEY), "the temporary edit must be stored").not.toBeNull();

    // Put it back exactly.
    await page.getByRole("button", { name: `Edit ${original} TEMP` }).click();
    await page.getByPlaceholder("Exercise name *").fill(original);
    await page.getByRole("button", { name: "Save Exercise" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await expect
      .poll(async () => await stored(page, KEY),
        { message: "undoing every edit must DROP the override row, not store an empty delta" })
      .toBeNull();
  });

  test("delete asks first — and cancelling really does keep the movement", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);

    const victim = await firstMovementName(page);
    const countBefore = await page.getByRole("button", { name: /^Delete / }).count();

    // Playwright auto-dismisses dialogs, so a test that ignores the confirm
    // silently exercises the CANCEL path and still passes. Both branches are
    // driven here, dismiss first — the session-15 rule.
    page.once("dialog", d => d.dismiss());
    await page.getByRole("button", { name: `Delete ${victim}` }).click();

    await expect(page.getByText(victim).first(),
      "cancelling the confirm must leave the movement in place").toBeVisible();
    expect(await stored(page, KEY),
      "a cancelled delete must write NOTHING to the gym's catalogue").toBeNull();

    // Now accept it.
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: `Delete ${victim}` }).click();
    await expect(page.getByText("Deleted")).toBeVisible();

    await expect(page.getByRole("button", { name: `Delete ${victim}` }),
      "the deleted movement's controls must be gone").toHaveCount(0);
    expect(await page.getByRole("button", { name: /^Delete / }).count(),
      "exactly one movement should have been removed").toBe(countBefore - 1);

    const blob = await stored(page, KEY);
    expect(blob, "an accepted delete must be persisted").not.toBeNull();
    expect(blob.v).toBe(2);
  });

  test("Reset to Defaults is destructive, asks in its own overlay, and can be refused", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);

    // Make a real customisation to destroy.
    const original = await firstMovementName(page);
    await page.getByRole("button", { name: `Edit ${original}` }).click();
    const custom = `${original} — studio variant`;
    await page.getByPlaceholder("Exercise name *").fill(custom);
    await page.getByRole("button", { name: "Save Exercise" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    expect(await stored(page, KEY), "the customisation must exist before Reset can destroy it").not.toBeNull();

    // ── Refuse it. This overlay had never been driven by any test, and a
    //    destructive confirm whose Cancel does not cancel is the worst kind.
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByText("Reset to Defaults?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Reset to Defaults?"), "Cancel must close the overlay").toHaveCount(0);
    await expect(page.getByText(custom).first(),
      "Cancel must keep the studio's customisation").toBeVisible();
    expect(await stored(page, KEY),
      "Cancel must not touch the stored override").not.toBeNull();

    // ── Now accept it.
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByText("Reset to Defaults?")).toBeVisible();
    // The overlay's confirm is "Reset Library"; the toolbar's is "Reset". They
    // are different controls and only one of them destroys anything.
    await page.getByRole("button", { name: "Reset Library", exact: true }).click();
    await expect(page.getByText("Reset to defaults")).toBeVisible();

    // The row must be REMOVED, not overwritten with an empty object — same
    // reason as the undo case above.
    await expect
      .poll(async () => await stored(page, KEY),
        { message: "Reset must delete the override row so the gym tracks the built-in catalogue again" })
      .toBeNull();
    await expect(page.getByText(custom), "the customisation must be gone from the screen too").toHaveCount(0);
    await expect(page.getByText(original).first()).toBeVisible();
  });
});

// ─── The search box ──────────────────────────────────────────────────────────
//
// Search is asserted in libraryReorder.spec.js only as a REORDER GUARD — that
// dragging is disabled while a filter is active. Nothing has ever asserted the
// thing it is for: that typing in it actually narrows the list to matches.
test.describe("the Exercise Library's search box", () => {
  test("filters to matching movements and restores the full list when cleared", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Exercise Library");

    const rows = page.getByRole("button", { name: /^Add | to class$/ });
    // The standalone route has no Add control, so count the movement names via
    // the edit affordance instead. Enter edit mode purely to get a countable,
    // per-movement control — the assertions below are about the FILTER.
    await page.getByRole("button", { name: /Edit/ }).first().click();
    const allRows = page.getByRole("button", { name: /^Edit / });

    const total = await allRows.count();
    // Scanner sanity: a filter test against an empty list passes for the wrong
    // reason. Prove there is something to filter first.
    expect(total, "the library must render movements before filtering means anything").toBeGreaterThan(2);

    const target = await firstMovementName(page);
    // A distinctive fragment of the first movement's name.
    const needle = target.slice(0, Math.min(6, target.length));

    await page.getByPlaceholder("Search exercises…").fill(needle);

    const filtered = await allRows.count();
    expect(filtered, "searching must actually narrow the list").toBeLessThan(total);
    expect(filtered, "the movement that matches must survive its own search").toBeGreaterThan(0);

    // Every surviving row must match the needle — in its name or its muscles,
    // which is what the filter reads.
    const survivors = await allRows.evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
    for (const s of survivors) {
      expect(s.toLowerCase(), `"${s}" survived a search for "${needle}" — the filter let a non-match through`)
        .toContain(needle.toLowerCase());
    }

    // A needle that cannot match anything must empty the list rather than
    // silently ignoring the filter.
    await page.getByPlaceholder("Search exercises…").fill("zzzzz-no-such-movement");
    await expect(allRows, "an impossible search must show no movements").toHaveCount(0);

    // And clearing restores everything.
    await page.getByPlaceholder("Search exercises…").fill("");
    await expect(allRows).toHaveCount(total);

    expectNoConsoleErrors(errors);
  });
});
