import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── Moving a movement between stages ────────────────────────────────────────
//
// `handleMoveExercise` was written in App's root and `onMoveExercise` was
// threaded into BuilderScreen — correctly, from a correct handler — and nothing
// ever called it. There was no control anywhere in the app, so a coach who put
// a movement in the wrong stage had exactly one route: delete it and retype it
// into the right one.
//
// Same family as session 15's five findings, and invisible to every guard here
// for the same reason: nothing throws, nothing is blank, no name is wrong. It
// was found by asking which threaded props are never referenced.
//
// The control is a SELECT rather than a drag. The row already renders a six-dot
// grip glyph that has never been wired to anything, and dragging between two
// collapsible stage cards is the gesture most likely to fail on the phone a
// coach actually plans on.

const DRAFT = "jungle_draft_class";

// The Builder's stage cards collapse; open the first one so its exercise rows
// (and their move controls) are mounted.
async function openFirstStage(page) {
  await page.getByText("Warm-Up", { exact: true }).first().click();
}

test.describe("the Builder can move a movement to another stage", () => {
  test("moves it, stores it, and says where it went", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");
    await openFirstStage(page);

    const before = await stored(page, DRAFT);
    const fromBefore = before.stages[0].exercises.map(e => e.n);
    // Scanner sanity: a move test against an empty stage would pass for the
    // wrong reason.
    expect(fromBefore.length, "the first stage must start with movements to move").toBeGreaterThan(0);

    const movement = fromBefore[0];
    const mover = page.getByRole("combobox", { name: `Move ${movement} to another stage` });
    await expect(mover, "every exercise row needs a move control").toHaveCount(1);

    // Take the destination from the control itself rather than hard-coding a
    // stage name — the coach owns those names.
    const options = await mover.locator("option").evaluateAll(
      els => els.map(e => ({ value: e.value, label: e.textContent })).filter(o => o.value !== ""));
    expect(options.length, "a 5-stage class must offer 4 destinations").toBe(before.stages.length - 1);
    // The current stage must NOT be offered — moving a movement onto itself is
    // a no-op dressed as an action.
    expect(options.map(o => o.label)).not.toContain(before.stages[0].name);

    const dest = options[1];               // "Strength Block" in the default class
    await mover.selectOption(dest.value);

    await expect(page.getByText(`Moved ${movement} to ${dest.label}`)).toBeVisible();

    // Assert the STORED draft, not the rendered list.
    const after = await stored(page, DRAFT);
    const destIdx = Number(dest.value);
    expect(after.stages[0].exercises.map(e => e.n),
      "the movement must LEAVE the stage it came from").not.toContain(movement);
    expect(after.stages[destIdx].exercises.map(e => e.n),
      "the movement must ARRIVE in the stage the coach picked").toContain(movement);

    // Nothing may be duplicated or lost in transit — the failure mode that
    // makes a coach's plan quietly wrong rather than visibly broken.
    const countAll = s => s.stages.reduce((a, st) => a + (st.exercises || []).length, 0);
    expect(countAll(after), "a move must conserve the total number of movements")
      .toBe(countAll(before));
    expect(after.stages[destIdx].exercises.filter(e => e.n === movement).length,
      "the moved movement must appear exactly once at the destination").toBe(1);

    expectNoConsoleErrors(errors);
  });

  test("a one-stage class offers no move control at all", async ({ page }) => {
    // An empty destination menu is the dropdown version of a control that
    // refuses the click, so it must not render rather than render empty.
    await freshApp(page);
    await nav(page, "Class Builder");

    // Strip the class down to a single stage by removing the rest.
    const removeButtons = () => page.getByRole("button", { name: /^Remove / });
    let n = await removeButtons().count();
    expect(n, "the default class must have several stages to remove").toBeGreaterThan(1);
    while (n > 1) {
      await removeButtons().last().click();
      n = await removeButtons().count();
    }

    await openFirstStage(page);
    const stages = (await stored(page, DRAFT)).stages;
    expect(stages.length, "exactly one stage should remain").toBe(1);
    expect((stages[0].exercises || []).length,
      "the remaining stage must still have a movement, or this proves nothing").toBeGreaterThan(0);

    await expect(page.getByRole("combobox", { name: /^Move .+ to another stage$/ }),
      "with nowhere to move to, the control must be absent").toHaveCount(0);
  });
});
