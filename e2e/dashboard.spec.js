import { test, expect } from "@playwright/test";
import { freshApp, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";
// The catalogue itself, so these assertions cannot drift from it. The failure
// being guarded is "this screen does not read the catalogue at all", and a test
// that hardcoded #F59E0B would go on passing the day HIIT's colour changed while
// the dashboard kept drawing the old one.
import { WORKOUT_LIBRARY } from "../src/data/library.js";

// ─── The Dashboard's hero buttons actually go somewhere ─────────────────────
//
// The second one called `onNavigate("templates")`. That view was retired — folded
// into the Builder's class-type picker — and correctly filtered out of all four
// nav arrays by `isViewEnabled`, but no render branch was left behind and this
// button is not a nav array. Clicking it set `view` to a string nothing matches:
// the sidebar and footer stayed put and the whole content area went blank, with
// no back button and no error.
//
// Every existing guard passed it. `lint:crash` sees a valid string. The
// error-boundary sweep in screens.spec.js passes because nothing throws — React
// renders nothing, which is not a crash. "The root has children" is satisfied by
// the shell. So the assertion here is not "no error": it is that the coach LANDS
// on a screen, checked by a control only that screen has.
//
// `src/lib/navRoutes.test.js` pins the same invariant statically for every view;
// this drives the one a coach actually clicks.

test.describe("dashboard hero controls", () => {
  // A fresh store starts with mkStages()' five-stage class, so `hasDraft` is true
  // and both hero buttons render.
  test("\"New class\" lands on the Builder, not a blank screen", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await expect(page.getByText(/GOOD (MORNING|AFTERNOON|EVENING), COACH/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume building" })).toBeVisible();

    // No confirm any more: replacing an auto-saved plan is UNDOABLE instead. See
    // the test below for why, and toast.jsx's header for the rule.
    await page.getByRole("button", { name: "New class", exact: true }).click();

    // Landing is proven by a control unique to the Builder. Asserting on the
    // shell — a sidebar, a footer, "root has children" — is exactly what the
    // blank screen already satisfied.
    await expect(page.getByRole("button", { name: "Preview on TV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Smart Distribute" })).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("\"New class\" replaces the plan, and the undo brings the coach's work back", async ({ page }) => {
    // This used to drive a `window.confirm` through both branches. The confirm is
    // gone: toast.jsx's own reasoning is that a confirm "interrupts every time,
    // including the 99 times the coach meant it", and pressing New class after
    // finishing a session is overwhelmingly the common case. The undo is what
    // replaces it, so the undo is what this test drives.
    await freshApp(page);

    // Rename the draft so the stored object can distinguish "replaced" from
    // "still the same five stages I started with". Rename is a window.prompt.
    await page.getByRole("button", { name: "Resume building" }).click();
    page.once("dialog", (d) => d.accept("Thursday Hyrox"));
    await page.getByRole("button", { name: "Rename class" }).click();
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("Thursday Hyrox");

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "New class", exact: true }).click();

    // Replaced, and the coach is in the Builder to edit the new one.
    await expect(page.getByRole("button", { name: "Preview on TV" })).toBeVisible();
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("My Workout");

    // The undo survived the navigation to the Builder — the toast region is fixed
    // and mounted at the root, which is the whole reason it can.
    await expect(page.getByTestId("toast")).toContainText("Started a new class");
    await page.getByTestId("toast-undo").click();

    // The STORED draft is back, name and all. Asserting the rendered stage list
    // would pass on a re-render that never wrote anything.
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("Thursday Hyrox");
    await expect(page.getByTestId("toast")).toContainText("Your previous plan is back");
  });

  // NOT TESTED, and deliberately: `handleNewClass` skips the undo toast when there
  // was no draft to lose, and that branch is unreachable from the UI. The
  // Dashboard renders the button that calls it only `{hasDraft && ...}` — with an
  // empty plan the hero's primary button says "New class" and goes straight to the
  // Builder without touching this handler. The guard stays as defence for a future
  // second call site; a test driving it would have to fake a control that does not
  // exist, and a test of an invented path is worse than no test.

  test("retired screens are absent from the sidebar", async ({ page }) => {
    await freshApp(page);
    // The choke-point's job. If one of these comes back, it comes back through
    // flags.js with a render branch — not because a menu drifted.
    for (const label of ["Templates", "Glossary", "Integrations"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });
});

// ── "Today's classes" · the fourth copy of the catalogue's colours ───────────
//
// `CLASS_COLORS` lived in App.jsx: a hand-maintained map of eight CAPITALISED
// display strings to hex, i.e. the Schedule's `CAT_COLOR` under another name on
// another screen. Session 21 deleted that one; this one survived only because
// nothing in the file being edited pointed at it.
//
// It had already stopped working by then. Once the Schedule started storing
// catalogue KEYS, `CLASS_COLORS[uc.type]` matched nothing at all, so every class
// on every gym's dashboard drew the same grey bar — and the type text beside it,
// added precisely so the colour was not the only cue, rendered the stored value
// RAW. A coach with a gym-authored type read `GYM-BARRE-MRKHJ2LC` as the name of
// their own class.
//
// Nothing in the suite could see either half: the dashboard's class rows had
// never been asserted on, and both defects render perfectly happily.
const rgbOf = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
};

// `repeat: "daily"` deliberately: `getDayClasses` returns a daily rule whatever
// today is, so this fixture needs no fixed clock and cannot pass or fail on the
// day of the week — the shape of the bug that made honesty.spec.js fail only on
// Sundays.
async function seedTodayClasses(page) {
  await page.evaluate(() => {
    localStorage.setItem("jungle_user_classes", JSON.stringify([
      // A key, as the Schedule has stored them since session 21.
      { id: "d1", name: "Burn",       type: "hiit",     coach: "", day: "Mon", slot: "06:00", dur: "45m", repeat: "daily" },
      // A label whose catalogue label is NOT its key — the case that proves the
      // label is read rather than the key being prettified.
      { id: "d2", name: "Ring Work",  type: "boxing",   coach: "", day: "Mon", slot: "09:00", dur: "45m", repeat: "daily" },
      // A rule saved BEFORE session 21, holding the old display string. Healed
      // on read here exactly as the Schedule heals it.
      { id: "d3", name: "Old HIIT",   type: "HIIT",     coach: "", day: "Mon", slot: "12:00", dur: "45m", repeat: "daily" },
      // 🔴 And the one that must NOT be mapped: the old dropdown offered
      // "Mobility" and no catalogue type answers to it.
      { id: "d4", name: "Legacy Mob", type: "Mobility", coach: "", day: "Mon", slot: "18:00", dur: "45m", repeat: "daily" },
    ]));
  });
  await page.reload();
}

const rowByName = (page, name) =>
  page.getByTestId("today-class").filter({ hasText: name });

// React normalises an inline hex to `rgb(...)`, so read the inline value the
// component actually set rather than the computed one — a computed read would
// also succeed on a colour inherited from somewhere else entirely.
const barOf = async (page, name) =>
  rowByName(page, name).getByTestId("today-class-color").evaluate(el => el.style.background);

test.describe("today's classes name a class type the way the catalogue does", () => {
  test("shows the catalogue's LABEL, never the stored key", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedTodayClasses(page);

    // POSITIVE CONTROL (§0b#1): the rows exist at all. Without it, a fixture
    // that never landed and a screen that renders nothing look identical.
    await expect(page.getByTestId("today-class")).toHaveCount(4);

    // `boxing`'s label is "Boxing / Kickboxing" — nothing about the key produces
    // that string, so this can only pass by reading the catalogue.
    await expect(rowByName(page, "Ring Work").getByTestId("today-class-type"))
      .toHaveText(WORKOUT_LIBRARY.boxing.label);
    await expect(rowByName(page, "Burn").getByTestId("today-class-type"))
      .toHaveText(WORKOUT_LIBRARY.hiit.label);

    // A rule stored before session 21 holds "HIIT" and must read as the same
    // class as `hiit` does — two screens describing one gym's rules two ways is
    // the whole defect §1 closed.
    await expect(rowByName(page, "Old HIIT").getByTestId("today-class-type"))
      .toHaveText(WORKOUT_LIBRARY.hiit.label);

    // 🔴 And the unrecognised one keeps its own text rather than being guessed
    // at, the same judgement `resolveClassType` makes everywhere else.
    await expect(rowByName(page, "Legacy Mob").getByTestId("today-class-type"))
      .toHaveText("Mobility");

    expectNoConsoleErrors(errors);
  });

  test("colours the row from the catalogue, not from a second copy of it", async ({ page }) => {
    await freshApp(page);
    await seedTodayClasses(page);

    expect(await barOf(page, "Burn")).toBe(rgbOf(WORKOUT_LIBRARY.hiit.color));
    expect(await barOf(page, "Ring Work")).toBe(rgbOf(WORKOUT_LIBRARY.boxing.color));
    expect(await barOf(page, "Old HIIT"),
      "a legacy rule must colour as the class it is, not as an unknown type")
      .toBe(rgbOf(WORKOUT_LIBRARY.hiit.color));

    // Distinct hues, because "every row is the same grey" is exactly what this
    // screen did and every assertion above would still hold if the two colours
    // happened to be equal.
    expect(await barOf(page, "Burn")).not.toBe(await barOf(page, "Ring Work"));

    // The type the catalogue does not know gets the one grey there is, and the
    // point of asserting it is that it is DIFFERENT from the known ones.
    const unknown = await barOf(page, "Legacy Mob");
    expect(unknown).not.toBe(await barOf(page, "Burn"));
    expect(unknown).not.toBe(await barOf(page, "Ring Work"));
  });
});
