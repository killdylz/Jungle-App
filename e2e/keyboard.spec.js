import { test, expect } from "@playwright/test";
import { freshApp, nav, ALL_SCREENS, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── REGRESSION §1.2 — keyboard-only traversal of every screen ────────────────
//
// dialogs.spec.js proves the five OVERLAYS trap Tab correctly. Nothing proved
// anything about the screens themselves, and the screen is where a coach spends
// the other 95% of the session.
//
// Two rules, swept over every screen, both aimed at a CLASS of defect rather
// than a known instance:
//
//   1. Every visible control is REACHABLE by Tab. A control that renders, reads
//      correctly and cannot be reached without a mouse is invisible to every
//      other test in this suite — the a11y sweeps ask whether a button has a
//      name, never whether anyone can get to it. This also catches a trap by
//      construction: something that holds focus stops everything after it from
//      being reached, and the failure names exactly which controls went missing.
//
//   2. Focus is never LOST. Landing on <body> mid-screen means the next Tab
//      restarts from the top of the page, which on this app means the entire
//      sidebar before the coach gets back to what they were doing.
//
// ⚠️ WHEN A DIALOG IS OPEN THE RULE INVERTS. The Exercise Library IS a
// full-screen modal, so its screen has ~40 focusable controls sitting behind an
// overlay that focus must NOT reach. Where a dialog is present the expected set
// is scoped to inside it — which turns rule 1 into an assertion that the trap
// works, rather than a false failure against correct code.

// Stamp every focusable the user should be able to reach, then walk the tab
// order and record what was actually reached.
//
// The selector is the one src/ui/dialog.js uses, deliberately: if the two ever
// disagree about what "focusable" means, the trap and this sweep would be
// arguing about different sets of elements.
async function tabSurvey(page, maxSteps) {
  const expected = await page.evaluate(() => {
    const SEL = [
      "a[href]", "area[href]", "button:not([disabled])", "input:not([disabled])",
      "select:not([disabled])", "textarea:not([disabled])", "[contenteditable]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    // `offsetParent` is null for anything position:fixed, which is most of a
    // modal, so visibility is measured by box size — same as dialog.js.
    const visible = (el) => !el.closest("[inert]") &&
      (el.offsetWidth > 0 || el.offsetHeight > 0) &&
      getComputedStyle(el).visibility !== "hidden";

    // A modal owns the keyboard while it is open; the screen behind it is not
    // supposed to be reachable and asserting otherwise would fail correct code.
    const dlg = document.querySelector('[role="dialog"]');
    const root = dlg || document.body;

    const list = [...root.querySelectorAll(SEL)].filter(visible);
    list.forEach((el, i) => el.setAttribute("data-kbd", String(i)));

    // ⚠️ START THE WALK FROM THE TOP OF THE DOCUMENT. Reaching a screen means
    // CLICKING its nav button, so focus is already sitting on a control partway
    // down the order and everything before it appears only after the order wraps
    // past <body> — which reads exactly like focus being lost mid-screen. The
    // first draft of this sweep failed on six screens for that reason and the
    // app was correct every time.
    //
    // `blur()` is NOT enough, which is the part worth writing down: Chromium
    // keeps a "sequential focus navigation starting point" that survives a blur,
    // so the next Tab carries on from where the click left off. Focusing <body>
    // itself is what actually resets it. Verified by dumping the real trail
    // before and after — with blur alone the walk still started at control 1.
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    return list.map((el, i) => ({
      i,
      name: (el.getAttribute("aria-label") || el.getAttribute("placeholder") ||
             el.innerText || el.value || el.tagName).replace(/\s+/g, " ").trim().slice(0, 40),
    }));
  });

  const trail = [];
  for (let step = 0; step < Math.min(maxSteps, expected.length + 4); step++) {
    await page.keyboard.press("Tab");
    trail.push(await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { kbd: null, onBody: true, name: "<body>" };
      return {
        kbd: a.getAttribute("data-kbd"),
        onBody: false,
        name: (a.getAttribute("aria-label") || a.getAttribute("placeholder") ||
               a.innerText || a.tagName).replace(/\s+/g, " ").trim().slice(0, 40),
      };
    }));
  }
  return { expected, trail };
}

test.describe("keyboard-only traversal", () => {
  for (const screen of ALL_SCREENS) {
    test(`${screen.side}: every control is reachable by Tab`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await nav(page, screen.side);

      const { expected, trail } = await tabSurvey(page, 200);

      // POSITIVE CONTROL. A screen whose focusables all failed to stamp would
      // make "everything was reached" trivially true. Every screen in this app
      // has a nav, a header and its own controls; fewer than five means the
      // survey is measuring nothing.
      expect(expected.length,
        `${screen.side}: found only ${expected.length} focusable controls — the survey is measuring nothing`)
        .toBeGreaterThan(4);

      const reached = new Set(trail.map(t => t.kbd).filter(k => k !== null));
      const missed = expected.filter(e => !reached.has(String(e.i)));

      expect(missed.map(m => m.name),
        `${screen.side}: ${missed.length} of ${expected.length} controls cannot be reached with the ` +
        `keyboard. Either the tab order skips them or something before them holds focus.`)
        .toEqual([]);

      expectNoConsoleErrors(errors);
    });

    test(`${screen.side}: focus is never dropped onto the page body`, async ({ page }) => {
      await freshApp(page);
      await nav(page, screen.side);

      const { expected, trail } = await tabSurvey(page, 200);
      expect(expected.length, `${screen.side}: nothing to traverse`).toBeGreaterThan(4);

      // Focus reaching <body> AFTER the whole set has been visited is the tab
      // order wrapping past the last control, which is the browser working
      // normally. Losing focus BEFORE that is the defect: it means a control in
      // the middle of the screen handed focus nowhere.
      const reachedAll = new Set();
      let lostEarly = null;
      for (const t of trail) {
        if (t.onBody && reachedAll.size < expected.length) { lostEarly = { ...t, after: reachedAll.size }; break; }
        if (t.kbd !== null) reachedAll.add(t.kbd);
      }
      expect(lostEarly,
        `${screen.side}: focus fell to <body> after only ${lostEarly?.after} of ${expected.length} ` +
        `controls — the next Tab restarts at the top of the page`).toBeNull();
    });
  }
});
