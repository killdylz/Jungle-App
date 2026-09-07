import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The two things a coach could not do to their own schedule ──────────────
//
// 1. CLICK AN EMPTY SLOT. Every empty cell rendered a div with `cursor:pointer`
//    and a "+" revealed on hover, wired to onMouseEnter/onMouseLeave and nothing
//    else. It is the most direct way in the product to say "put a class here",
//    and it did nothing. The Add-a-class modal it should open already existed a
//    few lines below, with `day` and `slot` fields nobody was filling in.
//
//    It also could not be reached at all without a mouse: an opacity-0 hover
//    target is invisible to the keyboard, so the only affordance for adding a
//    class at a specific time was mouse-only and inert.
//
// 2. REMOVE A CLASS. `setUserClasses` was only ever appended to. A gym setting
//    up its schedule for the first time — the pilot's literal first hour — could
//    typo a name or pick the wrong slot, and carry it forever.
//
// A fixed clock because the grid is a real week: without it these pass six days
// a week and fail on the seventh, which this repo has already paid for once.

const KEY = "jungle_user_classes";
const MONDAY_NOON = new Date(2026, 6, 20, 12, 0, 0); // Mon 20 July 2026

test.describe("editing the schedule", () => {
  test("clicking an empty slot opens Add-a-class for THAT day and time", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    // The cell names itself, which is what makes 35 of them distinguishable.
    const cell = page.getByRole("button", { name: "Add a class on Wed at 18:00" });
    await expect(cell).toHaveCount(1);
    await cell.click();

    // Pre-filled from the cell, not left on the Mon/06:00 default.
    await expect(page.locator("select").filter({ hasText: "Wed" })).toHaveValue("Wed");
    await expect(page.locator("select").filter({ hasText: "18:00" })).toHaveValue("18:00");

    await page.getByPlaceholder(/class name/i).fill("Wednesday Hyrox");
    await page.getByRole("button", { name: "Add to schedule" }).click();

    // Assert the STORED rule, including the day and slot the cell chose.
    await expect
      .poll(async () => (await stored(page, KEY))?.map(c => `${c.name}|${c.day}|${c.slot}`) ?? [])
      .toContain("Wednesday Hyrox|Wed|18:00");

    expectNoConsoleErrors(errors);
  });

  test("a class can be taken back off the schedule", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    await page.getByRole("button", { name: "Add a class on Thu at 09:00" }).click();
    await page.getByPlaceholder(/class name/i).fill("Typo Clas");
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(1);

    // UNDOABLE, not confirmed. This used to drive `window.confirm` through both
    // branches; removing a rule now happens immediately and offers an undo, on
    // the rule toast.jsx states — the guard scales with what is destroyed, and
    // published occurrences and their attendance survive a rule being removed.
    await page.getByRole("button", { name: /^Remove Typo Clas/ }).click();
    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(0);

    // And the cell goes back to being an empty, addable slot.
    await expect(page.getByRole("button", { name: "Add a class on Thu at 09:00" })).toHaveCount(1);

    // The undo is the guard, so it is the load-bearing assertion. It must restore
    // the STORED rule, not just repaint the cell.
    await expect(page.getByTestId("toast")).toContainText("Removed “Typo Clas”");
    await page.getByTestId("toast-undo").click();
    await expect.poll(async () => (await stored(page, KEY))?.map(c => c.name) ?? []).toContain("Typo Clas");
    await expect(page.getByRole("button", { name: /^Remove Typo Clas/ })).toHaveCount(1);

    expectNoConsoleErrors(errors);
  });

  test("the undo restores the rule's IDENTITY, not a fresh copy of it", async ({ page }) => {
    // A rule's `id` is its identity: `occurrencesForWeek` stamps it onto every
    // occurrence as `ruleId`. An undo that re-founded the rule with a new id would
    // look perfect and quietly break the link from a dated class back to what
    // scheduled it — the same defect the rename tests below exist to catch.
    //
    // ⚠️ No fixed clock here, deliberately. `page.clock.setFixedTime` freezes
    // `Date.now()`, and a re-minted `uc${Date.now()}` would then be IDENTICAL to
    // the original — so this assertion would pass against the very bug it is for.
    await freshApp(page);
    await nav(page, "Schedule");

    await page.getByRole("button", { name: "Add a class on Thu at 09:00" }).click();
    await page.getByPlaceholder(/class name/i).fill("Identity Test");
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(1);
    const before = (await stored(page, KEY))[0].id;
    expect(before, "control: the rule must have an id to compare").toBeTruthy();

    await page.getByRole("button", { name: /^Remove Identity Test/ }).click();
    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(0);
    await page.getByTestId("toast-undo").click();

    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(1);
    expect((await stored(page, KEY))[0].id).toBe(before);
  });
});

// ─── 3. CHANGE a class already on the schedule (session 18) ─────────────────
//
// Session 15 added remove and stopped there, so the only way to fix a typo or
// move a class to a different slot was remove-and-re-add. That mints a NEW `id`,
// and the id is the rule's identity: `occurrencesForWeek` stamps it onto every
// occurrence it produces as `ruleId`. Re-founding a class to rename it costs
// nothing today and costs the link from a dated class back to the rule that
// scheduled it the moment anything reads `ruleId`.
//
// So the load-bearing assertion in every test below is on the STORED id, not on
// what the grid renders. A rename that looks right and silently re-founds the
// rule is exactly the defect this feature exists to avoid, and it is invisible
// from the outside.

const idsOf   = async (page) => ((await stored(page, KEY)) ?? []).map(c => c.id);
const ruleOf  = async (page, name) =>
  ((await stored(page, KEY)) ?? []).find(c => c.name === name) ?? null;

// 🔴 THE CLOCK HAS TO MOVE BEFORE AN EDIT, or every id assertion below is
// VACUOUS. A rule's id is `uc${Date.now()}`, and `page.clock.setFixedTime`
// FREEZES `Date.now()` — probed directly: two reads 1.5s apart both returned
// 1784520000000. So a re-founded rule is minted with the *same* id as the one it
// replaced, and "the id survived" passes whether the code preserves it or not.
//
// Found by mutation: making the edit assign a fresh id — the exact defect this
// feature exists to prevent — left all six tests green. Advancing the clock is
// what makes the assertion able to tell the two apart, and the fixed start time
// still has to exist because the grid is a real week (the reason session 15 put
// it there).
//
// The wider point, worth carrying: any id minted from `Date.now()` is
// non-unique under a fixed clock, so any test that freezes time cannot
// distinguish two objects created from it.
const EDIT_TIME = new Date(2026, 6, 20, 12, 5, 0); // same week, 5 min later
const advanceClock = (page) => page.clock.setFixedTime(EDIT_TIME);

async function addClass(page, { cell, name, repeat }) {
  await page.getByRole("button", { name: cell }).click();
  await page.getByPlaceholder(/class name/i).fill(name);
  if (repeat) await page.getByRole("button", { name: repeat, exact: true }).click();
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await expect.poll(async () => (await ruleOf(page, name)) !== null).toBe(true);
}

test.describe("changing a class already on the schedule", () => {
  test("renaming keeps the SAME rule — it does not re-found the class", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    await addClass(page, { cell: "Add a class on Tue at 18:00", name: "Strenght Lab" });
    const [originalId] = await idsOf(page);
    expect(originalId, "precondition: the rule must have an id to preserve").toBeTruthy();

    await advanceClock(page);
    await page.getByRole("button", { name: "Edit Strenght Lab on Tue at 18:00" }).click();

    // The form opens on the rule's CURRENT values, not the Mon/06:00 default —
    // otherwise "edit" silently re-slots every class it touches.
    await expect(page.getByPlaceholder(/class name/i)).toHaveValue("Strenght Lab");
    await expect(page.getByLabel("Day")).toHaveValue("Tue");
    await expect(page.getByLabel("Time slot")).toHaveValue("18:00");

    await page.getByPlaceholder(/class name/i).fill("Strength Lab");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(async () => (await ruleOf(page, "Strength Lab"))?.id)
      .toBe(originalId);
    expect(await idsOf(page), "an edit must not add a second rule").toHaveLength(1);
    await expect(page.getByRole("button", { name: /^Edit Strength Lab/ })).toHaveCount(1);

    expectNoConsoleErrors(errors);
  });

  test("re-slotting moves the class and keeps its id", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    await addClass(page, { cell: "Add a class on Mon at 06:00", name: "Sunrise HIIT" });
    const [originalId] = await idsOf(page);

    await advanceClock(page);
    await page.getByRole("button", { name: "Edit Sunrise HIIT on Mon at 06:00" }).click();
    await page.getByLabel("Day").selectOption("Thu");
    await page.getByLabel("Time slot").selectOption("19:30");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(async () => {
      const r = await ruleOf(page, "Sunrise HIIT");
      return r ? `${r.day}|${r.slot}|${r.id}` : null;
    }, { message: "the rule must move to Thu 19:30 and keep its id" })
      .toBe(`Thu|19:30|${originalId}`);

    // The grid must agree: the old cell is empty and addable again, the new one
    // holds the class. Asserting only the store would miss a render that kept
    // painting the class where it used to be.
    await expect(page.getByRole("button", { name: "Add a class on Mon at 06:00" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Edit Sunrise HIIT on Thu at 19:30" })).toHaveCount(1);

    expectNoConsoleErrors(errors);
  });

  test("switching a one-off to weekly drops its weekKey, and back again stamps it", async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    // "This week" is the `once` repeat, which is the only one that carries a
    // weekKey. A stale weekKey left on a weekly rule is inert today and is
    // exactly the leftover that reads as a bug later.
    await addClass(page, { cell: "Add a class on Fri at 12:00", name: "Pop-up Yoga", repeat: "This week" });
    const oneOff = await ruleOf(page, "Pop-up Yoga");
    expect(oneOff.repeat).toBe("once");
    expect(oneOff.weekKey, "a one-off must carry the week it belongs to").toBeTruthy();
    const stampedWeek = oneOff.weekKey;

    await page.getByRole("button", { name: "Edit Pop-up Yoga on Fri at 12:00" }).click();
    await page.getByRole("button", { name: "Weekly", exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(async () => {
      const r = await ruleOf(page, "Pop-up Yoga");
      return r && r.repeat === "weekly" && !("weekKey" in r);
    }, { message: "weekly rules must not keep a weekKey" }).toBe(true);

    await page.getByRole("button", { name: "Edit Pop-up Yoga on Fri at 12:00" }).click();
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(async () => (await ruleOf(page, "Pop-up Yoga"))?.weekKey)
      .toBe(stampedWeek);
  });

  test("editing a published week makes it publishable again rather than silently diverging", async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await nav(page, "Schedule");

    await addClass(page, { cell: "Add a class on Wed at 09:00", name: "Old Name" });

    const publish = page.getByTestId("publish-week");
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(publish, "the week is now on the books").toBeDisabled();

    // A rename changes the occurrence's identity (`name@startsAt`), so the
    // edited rule is unpublished again. The button saying so IS the disclosure —
    // it is computed from the same diffOccurrences the publish path uses, so it
    // cannot drift from what publishing would actually do.
    await page.getByRole("button", { name: "Edit Old Name on Wed at 09:00" }).click();
    await page.getByPlaceholder(/class name/i).fill("New Name");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(publish,
      "after a rename the week must read as having something left to publish",
    ).toBeEnabled();

    // And the already-published occurrence is untouched — a class that ran did
    // run, which is the same rule removeClass states.
    const instances = await stored(page, "jungle_class_instances");
    expect(instances.map(i => i.name)).toContain("Old Name");
  });
});

// ── The legacy type an edit must not silently rewrite ────────────────────────
//
// The Schedule's class-type dropdown used to be a hand-maintained list of eight
// capitalised display strings, one of which was "Mobility" — a class type the
// catalogue does not have. The dropdown now offers catalogue KEYS, which is what
// makes `class_instances.class_type` one vocabulary (see schedule.spec.js).
//
// 🔴 That change had a way of being WORSE than the defect it fixed. A rule
// stored as "Mobility" has no matching <option>, and a <select> whose value
// matches nothing renders on its FIRST option — so a coach opening this dialog
// to correct a typo in the coach's name would have saved the class as CrossFit,
// with nothing on screen saying so. Hiding a value the user can also edit,
// without giving them a way to keep it, is the same trap session 20's check-in
// list nearly shipped in the other direction: filter without a creation path.
//
// So an unrecognised type stays SELECTABLE and stays SELECTED.
test.describe("a class type the catalogue lacks survives an edit", () => {
  test("keeps Mobility through an unrelated edit instead of re-typing the class", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await page.evaluate((k) => {
      localStorage.setItem(k, JSON.stringify([
        { id: "uc-mob", name: "Deep Stretch", type: "Mobility", coach: "Mara",
          day: "Tue", slot: "18:00", dur: "30m", repeat: "weekly" },
      ]));
    }, KEY);
    await page.reload();
    await nav(page, "Schedule");

    // POSITIVE CONTROL: the rule really is stored with the unmappable type.
    expect((await stored(page, KEY))[0].type,
      "precondition: the rule must start on a type the catalogue lacks").toBe("Mobility");

    await page.getByRole("button", { name: "Edit Deep Stretch on Tue at 18:00" }).click();

    // The dialog shows it rather than falling back to the first option.
    await expect(page.getByLabel("Class type")).toHaveValue("Mobility");

    // An edit to a DIFFERENT field — the case where a silent re-type would be
    // invisible, because the coach never went near the type dropdown.
    // ⚠️ `exact: true`. `getByPlaceholder` is a SUBSTRING match, so this used to
    // resolve to any control on the Schedule whose placeholder merely CONTAINS
    // "Coach" — the coach roster's "Add a coach by name" made it two elements and
    // a strict-mode violation. The dialog's field is placeholder="Coach"
    // exactly, which is what this line always meant; narrowing it cannot hide a
    // defect, because a missing dialog field still fails.
    await page.getByPlaceholder("Coach", { exact: true }).fill("Priya");
    await page.getByRole("button", { name: "Save changes" }).click();

    const rule = (await stored(page, KEY))[0];
    expect(rule.coach, "precondition: the edit must have been saved").toBe("Priya");
    expect(rule.type, "an unrelated edit must not re-type the class").toBe("Mobility");
  });

  // And the coach can still move it onto a real catalogue type when they choose
  // to — the legacy value is a way back, not a trap of its own.
  test("lets the coach move a legacy type onto a catalogue one", async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await page.evaluate((k) => {
      localStorage.setItem(k, JSON.stringify([
        { id: "uc-mob", name: "Deep Stretch", type: "Mobility", coach: "",
          day: "Tue", slot: "18:00", dur: "30m", repeat: "weekly" },
      ]));
    }, KEY);
    await page.reload();
    await nav(page, "Schedule");

    await page.getByRole("button", { name: "Edit Deep Stretch on Tue at 18:00" }).click();
    await page.getByLabel("Class type").selectOption("yoga");
    await page.getByRole("button", { name: "Save changes" }).click();

    expect((await stored(page, KEY))[0].type).toBe("yoga");
  });

  // A rule stored as "HIIT" is healed, so saving an unrelated edit writes the
  // key — the stored rule catches up with the column without a migration.
  test("writes the catalogue key when a legacy display string is edited", async ({ page }) => {
    await page.clock.setFixedTime(MONDAY_NOON);
    await freshApp(page);
    await page.evaluate((k) => {
      localStorage.setItem(k, JSON.stringify([
        { id: "uc-h", name: "Sunrise Burn", type: "HIIT", coach: "",
          day: "Tue", slot: "18:00", dur: "45m", repeat: "weekly" },
      ]));
    }, KEY);
    await page.reload();
    await nav(page, "Schedule");

    expect((await stored(page, KEY))[0].type, "precondition: stored as the display string").toBe("HIIT");

    await page.getByRole("button", { name: "Edit Sunrise Burn on Tue at 18:00" }).click();
    await expect(page.getByLabel("Class type")).toHaveValue("hiit");
    await page.getByPlaceholder("Coach", { exact: true }).fill("Dylan");
    await page.getByRole("button", { name: "Save changes" }).click();

    expect((await stored(page, KEY))[0].type).toBe("hiit");
  });
});
