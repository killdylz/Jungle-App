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

// The Coaches screen needs DATA before most of it exists, which is why the
// screen-level sweep in `screens.spec.js` passed it for eighteen sessions: with
// no coach loaded there are exactly two buttons on it. Load the shipped sample
// coach and the same first render grows thirteen icon-only controls — Delete
// persona, eleven Delete movements, Remove plan — every one of them destructive
// and named only by `title`, which is last-resort in the name computation and
// never reaches a touch device.
//
// So "revealed" is not only about a click. A panel can be revealed by a click,
// by a tab, or by there finally being something to show.
const withSampleCoach = async (page) => {
  await nav(page, "Coaches");
  await page.getByRole("button", { name: /Load sample coach/ }).click();
  await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
};

const REVEALED = [
  ["Coaches · with a coach loaded", withSampleCoach],

  // The Class-Shape editor: five slot rows, each with a role dropdown. Before
  // this sweep all five announced as a bare "combobox" — the same defect the
  // Schedule's add-class modal had, where three indistinguishable dropdowns
  // decided which DAY a recurring class ran.
  ["Coaches · Change class shape", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Remove section 1$/ })).toBeVisible();
  }],

  // `PersonaPlanEditor` — a useDialog overlay that no test had ever opened. It
  // was the worst surface in the app by a distance: 29 unnamed buttons and 33
  // nameless fields, one set per section and one per movement.
  ["Coaches · Edit plan", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: /^Edit plan / }).first().click();
    await expect(page.getByRole("dialog", { name: "Edit plan" })).toBeVisible();
  }],

  ["Coaches · Generate draft", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: "Generate draft", exact: true }).click();
    await expect(page.getByTestId("gen-panel")).toBeVisible();
  }],

  // …and the same panel with its written-brief section expanded. Kept SEPARATE
  // from the row above on purpose: a collapsed <details> reports `offsetParent`
  // non-null and a real 162×37 box while `checkVisibility()` says false, so the
  // two states genuinely scan differently and only this one sees those controls.
  ["Coaches · Generate draft · write a brief", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: "Generate draft", exact: true }).click();
    await page.getByText(/write a brief|class — brief/i).click();
    await expect(page.getByRole("button", { name: /Generate in style/ })).toBeVisible();
  }],

  ["Coaches · edit a catalogued movement", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: /^Edit Conventional Deadlift$/ }).click();
    await expect(page.getByPlaceholder(/Aliases/)).toBeVisible();
  }],

  ["Coaches · Import from Google Slides", async (page) => {
    await withSampleCoach(page);
    await page.getByRole("button", { name: /^Import from Google Slides/ }).click();
  }],

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

  // A board is one click PAST the mode switch, and stopping at the switch is
  // what hid four unnamed settings gears — one per board — from this very
  // sweep on its first run.
  ["Room TV · Coach board", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Coach", exact: true }).click();
  }],

  // …and the board's settings panel is one click past THAT.
  ["Room TV · Coach board settings", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Coach", exact: true }).click();
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Display settings" }).first().click();
    await expect(page.getByText(/Layout Preset/i)).toBeVisible();
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
