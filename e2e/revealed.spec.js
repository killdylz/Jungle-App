import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { unnamedButtons, symbolOnlyButtons, namelessFields,
         reportSymbolOnly, reportUnnamed, reportFields } from "./a11yScan.js";

// ── The panels no sweep has ever seen ────────────────────────────────────────
//
// `screens.spec.js` runs all three accessible-name rules over the nine
// top-level screens. By construction it only ever sees a screen's FIRST render,
// and this app keeps a lot behind one click: a modal, a tab inside a modal, an
// overlay that auto-hides after 4.5 seconds.
//
// That blind spot has already cost this repo twice — twelve symbol-only buttons
// in the Exercise Library's edit mode (session 16) and, found while writing
// this file, the Schedule's add-class modal shipping three <select>s with no
// accessible name at all. Its type, day and time-slot dropdowns announced as a
// bare "combobox" each, so choosing WHICH DAY a recurring class runs was three
// indistinguishable controls to a screen reader. Round 3 swept the Schedule
// screen and passed it, because none of that markup exists until the button is
// pressed.
//
// The list below is the fix for the general problem rather than those three
// fields: a revealed panel added here is swept by all three rules at once.

const REVEALED = [
  ["Profile modal · Profile tab", async (page) => {
    await nav(page, "Dashboard");
    await page.getByRole("button", { name: "Your profile and settings" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }],

  // A tab INSIDE a modal — two clicks from first render, and the panel that
  // holds the gym's logo upload and brand colours.
  ["Profile modal · Gym Branding tab", async (page) => {
    await nav(page, "Dashboard");
    await page.getByRole("button", { name: "Your profile and settings" }).click();
    await page.getByRole("button", { name: /Gym Branding/ }).click();
  }],

  ["Builder · Build for me", async (page) => {
    await nav(page, "Class Builder");
    await page.getByRole("button", { name: /Build for me/i }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }],

  ["Schedule · Add class", async (page) => {
    await nav(page, "Schedule");
    await page.getByRole("button", { name: /Add class/i }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }],

  ["Class Runner · Check in", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }],

  // The Room TV mode switch is a CONDITIONAL render that auto-hides 4.5s after
  // the last pointer movement, so the wake and the scan have to happen in one
  // test — a wake in one tool call and a click in the next always misses it.
  ["Room TV · mode switch", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);
    await expect(page.getByRole("button", { name: "Coach", exact: true })).toBeVisible();
  }],
];

test.describe("panels that only exist after a click announce themselves", () => {
  for (const [name, open] of REVEALED) {
    test(`${name} has no unnamed or symbol-only buttons`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await open(page);

      // Scanner sanity: a panel that failed to open would make both assertions
      // below vacuously true, because an empty page has no bad buttons.
      const total = await page.locator("button").count();
      expect(total, `${name}: nothing rendered — the panel did not open`).toBeGreaterThan(2);

      const unnamed = await unnamedButtons(page);
      expect(unnamed, reportUnnamed(name, unnamed)).toEqual([]);
      const symbols = await symbolOnlyButtons(page);
      expect(symbols, reportSymbolOnly(name, symbols)).toEqual([]);

      expectNoConsoleErrors(errors);
    });

    test(`${name} has no nameless form fields`, async ({ page }) => {
      await freshApp(page);
      await open(page);
      const bad = await namelessFields(page);
      expect(bad, reportFields(name, bad)).toEqual([]);
    });
  }
});
