import { test, expect } from "@playwright/test";
import { freshApp, nav, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The reskin transition, and who is allowed to be animated at ─────────────
//
// `applySkinCSS` injects `#root *{transition:background-color .35s …}` once, into
// `<head>`, and never removes it. It exists for FR-A4 — a smooth reskin — and for
// that it is right.
//
// 🔴 IT IS ALSO THE PRODUCT'S ENTIRE INTERACTION FEEL, which is why session 29
// measured it rather than scoping it. Per screen it carries 145–371 elements, of
// which 17–41 are CONTROLS, and outside Brand Studio not one control declares a
// transition of its own. "Scope it to the reskin" would have made every
// selection, toggle and nav change in the app snap — a product decision with a
// human in it, taken invisibly. So the timing is unchanged and deliberately so.
//
// What WAS wrong is not a taste call: the rule never consulted
// `prefers-reduced-motion`. A user who has told their OS they do not want motion
// got 145 animating elements on the Dashboard. The room-facing displays have
// honoured that preference since they were built (`prefersReducedMotion` in
// displayKit.js); the shell was the half that did not.
//
// ⚠️ THESE TESTS ONLY MEAN SOMETHING AS A PAIR. "Nothing animates" is satisfied by
// a screen that never rendered, by a selector that matches nothing, and by a
// stylesheet that failed to inject — this repo has been fooled by all three. The
// default-motion test is the control: it asserts the SAME count on the SAME
// screens is large and non-zero, so the reduce run is measuring an absence rather
// than reporting one.

const SCREENS = ["Dashboard", "Class Builder", "Members"];

// Elements inside #root whose computed transition carries the .35s reskin timing.
const animatedCount = (page) => page.evaluate(() => {
  let n = 0;
  document.querySelectorAll("#root *").forEach((e) => {
    if (/0\.35s/.test(getComputedStyle(e).transition || "")) n++;
  });
  return n;
});

// The rule is injected by `applySkinCSS`, so its presence proves the skin was
// applied at all. Without this a missing stylesheet and an honoured preference
// look identical from the assertion's side.
const ruleInjected = (page) =>
  page.evaluate(() => !!document.getElementById("jungle-reskin-tx"));

test.describe("the reskin transition is still there for everyone who wants motion", () => {
  test("every screen animates by default, and the rule is a media query", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await waitForApp(page);

    expect(await ruleInjected(page), "applySkinCSS did not inject its stylesheet").toBe(true);

    // The rule must be GATED, not merely present — an ungated rule passes the
    // count assertions below and fails the reduce run.
    const css = await page.evaluate(() =>
      document.getElementById("jungle-reskin-tx")?.textContent || "");
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain(".35s");

    for (const screen of SCREENS) {
      await nav(page, screen);
      const n = await animatedCount(page);
      // The control for the reduce test below: this is a big, non-zero number on
      // every screen, so a zero over there is an absence and not an empty page.
      expect(n, `${screen} should animate by default`).toBeGreaterThan(50);
    }
    expectNoConsoleErrors(errors);
  });
});

test.describe("a coach who asked for less motion gets less motion", () => {
  test("no element animates on any screen, and the app still renders", async ({ page }) => {
    const errors = watchConsole(page);
    // `page.emulateMedia`, not `test.use({ reducedMotion })`: the project's `use`
    // is rebuilt by the scratch config this repo needs in the cloud container, and
    // a context option that silently does not apply would leave the assertion
    // below passing for the wrong reason. This is asserted before anything else.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await freshApp(page);
    await waitForApp(page);

    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "precondition: the browser must actually be in reduce mode").toBe(true);
    // The stylesheet is still injected — the media query is what turns it off, so
    // this run is measuring a preference being honoured rather than a skin that
    // failed to apply.
    expect(await ruleInjected(page)).toBe(true);

    for (const screen of SCREENS) {
      await nav(page, screen);
      // The screen genuinely rendered: an empty screen passes every scan
      // trivially, and this repo has shipped that mistake twice.
      const painted = await page.evaluate(() => document.querySelectorAll("#root *").length);
      expect(painted, `${screen} rendered nothing`).toBeGreaterThan(50);
      expect(await animatedCount(page), `${screen} still animates under reduce`).toBe(0);
    }
    expectNoConsoleErrors(errors);
  });
});
