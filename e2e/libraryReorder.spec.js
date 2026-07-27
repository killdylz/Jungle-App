import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The library's drag handle was an affordance with nothing behind it ──────
//
// Every movement row rendered a ⠿ handle styled `cursor:grab`. The row had no
// `draggable` attribute and no drag handlers anywhere. The pointer turned into a
// grab hand and the row would not move — in browse mode, in edit mode, and while
// searching alike.
//
// `libraryStore.js` had already been built for this. It stores a POOL (one
// subType's warmup/main/cooldown list) as the unit of change specifically
// "because those lists are ordered and reorder is a real editing operation". The
// persistence was designed for a gesture that did not exist.
//
// The trap in wiring it is the search filter: the rendered list is `rawEx`
// filtered by the search box, so while a search is active the rendered index is
// NOT the stored index, and a drop would splice the wrong two movements in the
// saved list. That is silent corruption of the gym's own catalogue, which is why
// the guard is asserted here and not just commented.

const KEY = "jungle_library_custom";

async function movementNames(page) {
  return page.evaluate(() => {
    const heads = [...document.querySelectorAll("div")].filter(d =>
      d.getAttribute("draggable") === "true");
    return heads.map(d => d.querySelector("p")?.textContent?.trim()).filter(Boolean);
  });
}

test.describe("exercise library reorder", () => {
  test("dragging a movement reorders the pool and stores it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Exercise Library");

    // Reorder is an edit, and lives with add/rename/delete rather than being the
    // one mutation a browsing coach can trigger by accident.
    await expect(page.locator("[draggable=true]")).toHaveCount(0);
    await page.getByRole("button", { name: /Edit/ }).first().click();

    const before = await movementNames(page);
    expect(before.length).toBeGreaterThan(2);

    const rows = page.locator("[draggable=true]");
    await rows.nth(0).dragTo(rows.nth(1));

    // Rendered order moved.
    await expect.poll(async () => (await movementNames(page))[0]).toBe(before[1]);
    const after = await movementNames(page);
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    // A reorder must not lose or duplicate a movement.
    expect([...after].sort()).toEqual([...before].sort());

    // And it reached the stored delta, which is what syncs to the gym's row.
    await expect
      .poll(async () => {
        const blob = await stored(page, KEY);
        if (!blob) return null;
        const pool = blob?.classes?.crossfit?.subTypes?.wod?.main;
        return Array.isArray(pool) ? pool.map(e => e.n).slice(0, 2) : null;
      })
      .toEqual([before[1], before[0]]);

    // Still a v2 delta, not a re-frozen snapshot (DEC-13).
    expect((await stored(page, KEY))?.v).toBe(2);

    expectNoConsoleErrors(errors);
  });

  test("a filtered list cannot be dragged — the index would be a lie", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Exercise Library");
    await page.getByRole("button", { name: /Edit/ }).first().click();
    await expect(page.locator("[draggable=true]").first()).toBeVisible();

    // While searching, the rendered index is a filtered artefact and writing it
    // back into the stored pool would scramble movements the coach cannot see.
    const first = (await movementNames(page))[0];
    await page.getByPlaceholder("Search exercises…").fill(first.slice(0, 4));
    await expect(page.locator("[draggable=true]")).toHaveCount(0);

    // Clearing the search restores the gesture.
    await page.getByPlaceholder("Search exercises…").fill("");
    await expect(page.locator("[draggable=true]").first()).toBeVisible();
  });
});
