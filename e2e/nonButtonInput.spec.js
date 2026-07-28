import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The interaction that is not a click ──────────────────────────────────────
//
// Session 14 swept keyboard handlers, 15 swept dead controls, 16 swept form-field
// names, 17 swept mount-time writes. The gap named for this session was "paste
// handlers, onBlur/onFocus side effects".
//
// Asking the generic version of that question — "which DOM event handlers does no
// test ever fire?" — turned out to be worth more than the enumerated one. An AST
// scan of every `on*` attribute on an intrinsic (lowercase) element found the
// app's ENTIRE DOM event surface is 14 types across 64 files, and that:
//
//   - `onPaste` has ZERO occurrences. There were never any paste handlers to
//     sweep. An honest blank; the item can come off the list.
//   - Exactly two handlers were fired by no test: `onTouchStart` on the Room TV
//     wrapper, and `onBlur` on the schedule's empty-slot "+" button.
//
// Both turned out to be CORRECT when probed, so this file pins behaviour rather
// than fixing a defect. It is here because both are real affordances that
// nothing else in the suite would notice the loss of, and each is the only way
// its user gets at the feature.

// ── Room TV: the wake-on-touch path ──────────────────────────────────────────
//
// A Room TV is a wall-mounted screen or a tablet on a stand — touch is the
// PRIMARY input, not a fallback. The mode switch auto-hides 4.5s after the last
// interaction, so if touch could not wake it a coach would be locked into
// whichever board was showing, unable to reach Floor, Coach, Follow or Exit.
// Every existing Room TV test wakes the bar with `page.mouse.move()`, which is
// the one input a wall-mounted display never receives.
test.describe("the Room TV mode switch wakes on touch", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

  test("a tap brings the bar back after it has auto-hidden", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();

    const bar = page.getByRole("button", { name: "Floor", exact: true });
    // Precondition: it starts visible, so "count 0" below means hidden rather
    // than never-rendered — otherwise the wake assertion proves nothing.
    await expect(bar, "the mode switch should show when Room TV opens").toBeVisible();

    // The auto-hide is 4500ms; wait past it without touching anything.
    await expect(bar, "the mode switch must auto-hide").toHaveCount(0, { timeout: 8000 });

    await page.touchscreen.tap(600, 400);

    await expect(bar,
      "a tap did not wake the mode switch — on a wall-mounted tablet the coach " +
      "is now stuck in this board with no way to reach Floor, Coach or Exit",
    ).toBeVisible();

    expectNoConsoleErrors(errors);
  });
});

// ── The schedule's empty slot: revealed by focus, not only by hover ──────────
//
// Session 15 found this cell as a `cursor:pointer` div wired to
// onMouseEnter/onMouseLeave and nothing else — mouse-only and inert. The fix
// made it a real <button> at `opacity:0` that hover AND focus reveal, so a
// keyboard user can see where they are. The focus half is invisible to every
// other test: the button is present in the DOM either way, and only its computed
// opacity says whether a coach can actually see what they have tabbed onto.
test.describe("the schedule's empty slot answers the keyboard", () => {
  test("focus reveals the + and blur hides it again", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Schedule");

    const add = page.getByRole("button", { name: "Add a class on Mon at 06:00" });
    await expect(add, "the empty-slot control must exist to test it").toHaveCount(1);

    expect(await add.evaluate(el => getComputedStyle(el).opacity),
      "it should start invisible — it is a hover/focus affordance").toBe("0");

    await add.focus();
    expect(await add.evaluate(el => getComputedStyle(el).opacity),
      "focus must reveal the +; without it a keyboard user tabs onto a control " +
      "they cannot see").toBe("1");

    await page.keyboard.press("Tab");
    expect(await add.evaluate(el => getComputedStyle(el).opacity),
      "blur must hide it again, or every slot stays lit once visited").toBe("0");
  });
});
