import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── Reordering the stages of a class, which is the class ─────────────────────
//
// `handleReorderStages` and the five drag handlers above the stage list had no
// test at all. `builderMove.spec.js` looks like it covers this and does not — it
// moves an EXERCISE between two stages, through `onMoveExercise`, a different
// control with a different handler.
//
// A class's stage order IS the class: warm-up, work, cool-down is not a
// preference. A reorder that silently drops a stage, duplicates one, or leaves
// the rendered order and the stored order disagreeing rewrites somebody's
// Tuesday, and the coach finds out in the room. The draft autosaves on every
// change (`saveDraftClass`), so a wrong order is on disk before anyone can undo
// it — which is why the stored object is asserted here and not only the screen.
//
// ⚠️ The drop handler is index arithmetic in two directions and they are not the
// same code path: `arr.splice(from,1)` shifts every index above `from`, so a
// downward move and an upward move land differently in the raw arithmetic even
// though both are specified to leave the dragged stage AT the target's position.
// Both are driven. So is the `from === null` guard, which is what stops a drop
// that had no drag before it — a file dragged in from the desktop — from
// splicing at index 0 and moving the warm-up somewhere nobody asked for.
//
// ⚠️ Selector note: `[draggable]` in the Builder matches stage cards AND track
// rows. Stage cards are the ones carrying a `Remove <stage name>` button (track
// rows' remove is icon-only), so the order is read off those aria-labels, which
// is also the accessible name a screen-reader user navigates by.

const KEY = "jungle_draft_class";

// Rendered top-to-bottom stage order, read from the accessible names.
const renderedOrder = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[draggable]")]
      .map((el) => el.querySelector("button[aria-label^='Remove ']")?.getAttribute("aria-label"))
      .filter(Boolean)
      .map((label) => label.replace(/^Remove /, "")));

const storedOrder = async (page) =>
  ((await stored(page, KEY))?.stages || []).map((s) => s.name);

async function openBuilder(page) {
  await freshApp(page);
  await waitForApp(page);
  await nav(page, "Class Builder");
}

// The stage cards, in the order they render.
const cards = (page) => page.locator("[draggable]").filter({ has: page.locator("button[aria-label^='Remove ']") });

test.describe("the Builder reorders stages by drag", () => {
  test("dragging a stage down puts it at the target's position, on screen and on disk", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);

    // Positive control. An empty or one-stage Builder passes every reorder
    // assertion trivially, and this repo has been fooled by exactly that twice.
    const before = await renderedOrder(page);
    expect(before.length, "the default draft must have stages to reorder").toBeGreaterThan(3);
    expect(new Set(before).size, "stage names must be distinct or order is unreadable").toBe(before.length);
    expect(await storedOrder(page), "screen and disk must agree BEFORE the drag").toEqual(before);

    // Warm-Up (0) onto Strength Block (2).
    await cards(page).nth(0).dragTo(cards(page).nth(2));

    const expected = [before[1], before[2], before[0], ...before.slice(3)];
    await expect.poll(() => renderedOrder(page)).toEqual(expected);
    // The class on disk is the one the room will run.
    await expect.poll(() => storedOrder(page)).toEqual(expected);
    // A reorder must not lose or duplicate a stage.
    expect([...expected].sort()).toEqual([...before].sort());

    // The stage's CONTENTS travel with it. A reorder that moved the headings and
    // left the exercises behind would satisfy every assertion above.
    const moved = (await stored(page, KEY)).stages[2];
    expect(moved.name).toBe(before[0]);
    expect(moved.exercises.map((e) => e.n)).toContain("Light Jog");

    // Autosaved, so it must survive the reload that a coach's phone will do for
    // them. A reorder held only in React state is a reorder they will lose.
    // ⚠️ A reload lands on the Dashboard, not back in the Builder — `view` is not
    // persisted. Without the nav, `renderedOrder` reads an empty list off a
    // screen with no stage cards on it and every `toEqual` below would be
    // comparing two empty arrays.
    await page.reload();
    await waitForApp(page);
    await nav(page, "Class Builder");
    await expect(cards(page).first()).toBeVisible();
    await expect.poll(() => renderedOrder(page)).toEqual(expected);
    await expect.poll(() => storedOrder(page)).toEqual(expected);

    expectNoConsoleErrors(errors);
  });

  test("dragging a stage up lands it at the target's position too", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);

    const before = await renderedOrder(page);
    expect(before.length).toBeGreaterThan(3);

    // Cool-Down (last) onto Circuit Blast (1) — the other side of the splice.
    const last = before.length - 1;
    await cards(page).nth(last).dragTo(cards(page).nth(1));

    const expected = [before[0], before[last], ...before.slice(1, last)];
    await expect.poll(() => renderedOrder(page)).toEqual(expected);
    await expect.poll(() => storedOrder(page)).toEqual(expected);
    expect([...expected].sort()).toEqual([...before].sort());

    expectNoConsoleErrors(errors);
  });

  test("a drop with no drag before it leaves the class alone", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);

    const before = await renderedOrder(page);
    expect(before.length).toBeGreaterThan(3);

    // The guard under test is `from === null` — the drag index is a ref set by
    // `dragstart`, and anything dropped onto a stage card WITHOUT one (a file
    // from the desktop, a link from another tab, a drag begun and abandoned
    // elsewhere on the page) arrives with it still null. Without the guard,
    // `arr.splice(null, 1)` reads null as 0 and a stray drop silently moves the
    // warm-up to wherever the pointer happened to be.
    //
    // This is the one gesture `dragTo` cannot make, because `dragTo` always
    // fires `dragstart` first — hence a real `DataTransfer` and hand-dispatched
    // events. They must bubble: React listens at the root, not on the card.
    //
    // (A stage dropped onto ITSELF is deliberately not a test. `from === i`
    // returns early, but removing that line changes nothing observable —
    // splice out and splice back in at the same index is the identity — so an
    // assertion about it could not fail and would only look like coverage.)
    await cards(page).nth(2).evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "not a stage");
      for (const type of ["dragover", "drop"]) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    });

    // Read once, after the gesture. `expect.poll` would be satisfied by the
    // first read and prove nothing about a change arriving late; the reload
    // below is what gives the write time to have happened.
    expect(await renderedOrder(page)).toEqual(before);
    expect(await storedOrder(page)).toEqual(before);

    await page.reload();
    await waitForApp(page);
    await nav(page, "Class Builder");
    await expect(cards(page).first()).toBeVisible();
    expect(await renderedOrder(page)).toEqual(before);

    expectNoConsoleErrors(errors);
  });
});
