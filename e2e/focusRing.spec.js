import { test, expect } from "@playwright/test";
import { freshApp, nav, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── Every field a coach can tab to has a visible focus ring ─────────────────
//
// §2.5 asked to widen the contrast sweep to borders, focus rings and icon
// strokes, and warned to expect false positives and ship the honest subset. This
// is that subset, and it is narrower than the ask for two reasons that were
// measured rather than assumed.
//
// 🔴 BORDERS AND ICON STROKES ARE NOT HERE. WCAG 1.4.11 wants 3:1 for a
// non-text CONTROL BOUNDARY, and a control whose fill already distinguishes it
// needs no visible edge at all — so a sweep over `borderColor` reports every
// decorative hairline between two rows and is the twenty-of-twenty-one problem in
// a new costume. The defect `borderOn` exists for (a light palette inheriting a
// dark theme's white 7% overlay) is already asserted on the token in
// `colors.test.js`, and `brandTokens.spec.js` measures the text those surfaces
// carry.
//
// 🔴 THE APP DOES NOT PAINT ITS OWN FOCUS RINGS, so a gym's palette cannot break
// them — with one exception, which is this file. There is no `:focus` styling
// anywhere in `src/`, so buttons get Chrome's default ring; but `outline:"none"`
// was set INLINE on the shared `Input`/`Select` primitives and ~16 more fields,
// and inline styles beat stylesheets. Keyboard users had no focus indicator on
// any text field in the product.
//
// ⚠️ TWO WAYS TO MEASURE THIS WRONG, both hit while writing it:
//
//   1. `el.focus()` does not trigger `:focus-visible`. A programmatic sweep
//      reported 35 of 40 controls on the Builder as ringless, all false. This
//      presses Tab.
//   2. Chrome reports `outline-style: auto` with a computed WIDTH OF 0px. A check
//      for `outlineWidth > 0` therefore calls every default-ringed button a
//      failure. The signal is the STYLE being `none`, not the width.

const FIELD_SCREENS = ["Members", "Brand Studio"];

// A control has an indicator if it draws an outline (including `auto`, which is
// Chrome's own ring) or a box-shadow. See trap 2 above.
const focusState = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    isField: /^(input|select|textarea)$/.test(el.tagName.toLowerCase()),
    name: (el.getAttribute("aria-label") || el.placeholder || el.textContent || "").trim().slice(0, 34),
    outlineStyle: cs.outlineStyle,
    hasIndicator: cs.outlineStyle !== "none" || (!!cs.boxShadow && cs.boxShadow !== "none"),
    key: el.tagName + "|" + (el.getAttribute("aria-label") || el.placeholder || el.textContent || "").slice(0, 22),
  };
});

async function tabThrough(page, limit = 70) {
  // ⚠️ `nav()` leaves focus on the button it clicked, so a tab walk would start
  // halfway down the screen. `blur()` does not reset it — Chromium keeps a
  // sequential focus navigation starting point.
  await page.evaluate(() => {
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
  });
  const seen = new Set(), visited = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const s = await focusState(page);
    if (!s || seen.has(s.key)) break;
    seen.add(s.key);
    visited.push(s);
  }
  return visited;
}

test.describe("a keyboard user can see where they are", () => {
  for (const screen of FIELD_SCREENS) {
    test(`every focusable control on ${screen} shows a focus indicator`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await waitForApp(page);
      await nav(page, screen);

      const visited = await tabThrough(page);

      // The control for the assertion below. A tab walk that reached nothing, or
      // reached no FIELDS, would pass "everything has a ring" trivially — and
      // the fields are the half that was broken.
      expect(visited.length, `${screen}: the tab walk reached nothing`).toBeGreaterThan(8);
      const fields = visited.filter((v) => v.isField);
      expect(fields.length, `${screen}: no text field was reached, so this proves nothing`)
        .toBeGreaterThan(0);

      const blind = visited.filter((v) => !v.hasIndicator);
      expect(blind.map((v) => `<${v.tag}> "${v.name}" (outline-style: ${v.outlineStyle})`)).toEqual([]);
      expectNoConsoleErrors(errors);
    });
  }
});
