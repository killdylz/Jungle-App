import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── §1.5 · every write, after a reload ──────────────────────────────────────
//
// WHAT THIS GENERALISES
// Sessions 21 to 26 each found the same shape of defect a different way: an action
// that clearly worked, on a screen that clearly updated, which had not actually
// been written down. `builderDraft.spec.js` and `destructive.spec.js` each pin one
// instance of it. This is the rule behind them, applied to every write a coach can
// make from the UI, as one table.
//
// Jungle is LOCAL-FIRST: localStorage is the source of truth and Supabase syncs
// behind it. That makes "did it persist" the single most load-bearing question in
// the product, and it is the one question a screen can never answer — React state
// and localStorage agree right up until the moment they do not, and the coach finds
// out the next time they open the app.
//
// ── THREE ASSERTIONS PER ROW, and each catches something the others cannot ────
//
//   1. the STORED value, immediately. Catches a screen that re-rendered from state
//      without writing. This is the one sessions 21-26 kept needing.
//   2. the SCREEN, immediately. Catches a write that landed while the UI showed
//      something else — the "green tests, wrong product" case.
//   3. both again AFTER `page.reload()`. Catches a write that was made and then
//      overwritten by a mount effect, hydration, or a StrictMode double-invoke.
//      Nothing but a reload finds this class, and it is the one that has actually
//      shipped here (`useAfterMount` exists because of it).
//
// ⚠️ Each row is its own test, not one long walk. A single test would let the first
// failure hide the rest, and the failure message has to name WHICH write did not
// survive — that is the whole value of a table.
//
// ⚠️ `screen` runs against a freshly reloaded app too, so it must not depend on any
// state the action left in React. Anything scrolled, expanded or selected is gone
// after a reload; only what came out of storage is still there.

const ROWS = [
  {
    name: "a member added to the roster",
    view: "Members",
    async act(page) {
      await page.getByRole("button", { name: "Add member", exact: true }).click();
      await page.getByPlaceholder("Name (required)").fill("Reload Rita");
      await page.getByRole("button", { name: "Add", exact: true }).click();
    },
    key: "jungle_members",
    check: (v) => (v || []).some((m) => m.name === "Reload Rita"),
    screen: (page) => expect(page.getByText("Reload Rita")).toBeVisible(),
  },
  {
    name: "a class added to the schedule",
    view: "Schedule",
    async act(page) {
      await page.getByRole("button", { name: /^Add a class on/ }).first().click();
      await page.getByPlaceholder(/class name/i).fill("Reload Hyrox");
      await page.getByRole("button", { name: "Add to schedule" }).click();
    },
    key: "jungle_user_classes",
    check: (v) => (v || []).some((c) => c.name === "Reload Hyrox"),
    screen: (page) => expect(page.getByText("Reload Hyrox").first()).toBeVisible(),
  },
  {
    name: "the membership price set in Brand Studio",
    view: "Brand Studio",
    async act(page) {
      await page.getByLabel("Membership price per month").fill("175");
    },
    key: "jungle_gym_branding",
    check: (v) => v?.membershipPrice === "175",
    // Asserted on the field rather than on the Members panel: `screen` runs after a
    // reload too, and the figure only appears there when members are also at risk.
    screen: (page) => expect(page.getByLabel("Membership price per month")).toHaveValue("175"),
  },
  {
    name: "the gym's name",
    view: "Brand Studio",
    async act(page) {
      await page.getByPlaceholder("Your gym name…").fill("Reload Garage");
    },
    key: "jungle_gym_branding",
    check: (v) => v?.gymName === "Reload Garage",
    // The footer, not the input: it proves the value reached the app's own chrome
    // and not merely the field it was typed into.
    screen: (page) => expect(page.getByText(/Reload Garage · Powered by Jungle/)).toBeVisible(),
  },
  {
    name: "the sample coach and their whole corpus",
    view: "Coaches",
    async act(page) {
      await page.getByRole("button", { name: /Load sample coach/ }).click();
      await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    },
    key: "jungle_persona_movements",
    // The MOVEMENTS, not the persona row. The catalogue is re-derived from the
    // plans by an effect on every mount, and `aggregateMovements` has a retention
    // rule for rows carrying a manual edit — so this key is the one where a reload
    // could plausibly rebuild something different from what was stored.
    check: (v) => (v || []).length > 0,
    screen: (page) => expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible(),
  },
  {
    name: "an exercise added to the library",
    view: "Exercise Library",
    async act(page) {
      // The add row only exists in edit mode — it is not a control the browsing
      // view offers, which is why the first version of this row waited 30 seconds
      // for a button that renders behind a toggle.
      await page.getByRole("button", { name: /✏️ Edit/ }).click();
      await page.getByRole("button", { name: "+ Add exercise to this set" }).click();
      // `addNewEx` opens the new row already in its editor, so the name field is
      // the one holding "New Exercise".
      await page.locator('input[value="New Exercise"]').first().fill("Reload Thruster");
      await page.getByRole("button", { name: "Save Exercise" }).click();
    },
    key: "jungle_library_custom",
    check: (v) => JSON.stringify(v || {}).includes("Reload Thruster"),
    // Back in the browsing view after a reload, so this must not depend on edit
    // mode — an exercise the coach added is a normal row.
    screen: (page) => expect(page.getByText("Reload Thruster").first()).toBeVisible(),
  },
  {
    name: "the class draft renamed in the Builder",
    view: "Class Builder",
    async act(page) {
      page.once("dialog", (d) => d.accept("Reload Session"));
      await page.getByRole("button", { name: "Rename class" }).click();
    },
    key: "jungle_draft_class",
    check: (v) => v?.name === "Reload Session",
    screen: (page) => expect(page.getByText("Reload Session").first()).toBeVisible(),
  },
  {
    name: "a skin chosen in Brand Studio",
    view: "Brand Studio",
    async act(page) {
      await page.getByRole("button", { name: /^Pulse/ }).first().click();
    },
    key: "jungle_skin",
    check: (v) => v === "pulse",
    // A skin that is stored but not applied is the exact defect skins.js's header
    // describes: "the one screen a coach checks their branding on was the one
    // screen that lied". So this reads the token off :root, not a label.
    screen: async (page) => {
      await expect.poll(async () => await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase()))
        .toBe("#d6ff3d");
    },
  },
];

// `jungle_skin` holds a bare string, not JSON, so `stored` (which parses) cannot
// read it. Read raw and let each row say which it wants.
const raw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const readKey = async (page, key) =>
  key === "jungle_skin" ? await raw(page, key) : await stored(page, key);

test.describe("every write survives a reload", () => {
  for (const row of ROWS) {
    test(row.name, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await nav(page, row.view);

      // POSITIVE CONTROL: the key must not already satisfy the check, or the whole
      // row is vacuous. A fresh install seeds a draft class and a library, so
      // "check passes" before the action is a live risk here, not a theoretical one.
      expect(row.check(await readKey(page, row.key)),
        `${row.name}: the assertion already passes BEFORE the action — this row proves nothing`)
        .toBe(false);

      await row.act(page);

      // 1. the stored value
      await expect.poll(async () => row.check(await readKey(page, row.key)),
        { message: `${row.name}: the screen changed but ${row.key} did not` }).toBe(true);
      // 2. the screen
      await row.screen(page);

      // 3. both again, cold
      await page.reload();
      await nav(page, row.view);
      expect(row.check(await readKey(page, row.key)),
        `${row.name}: written, then lost on reload — a mount effect or hydration overwrote it`)
        .toBe(true);
      await row.screen(page);

      expectNoConsoleErrors(errors);
    });
  }
});
