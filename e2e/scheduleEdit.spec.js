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

    // Dismissing the confirm keeps it — removing a recurring rule is destructive.
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: /^Remove Typo Clas/ }).click();
    expect((await stored(page, KEY))?.length).toBe(1);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Remove Typo Clas/ }).click();
    await expect.poll(async () => (await stored(page, KEY))?.length ?? 0).toBe(0);

    // And the cell goes back to being an empty, addable slot.
    await expect(page.getByRole("button", { name: "Add a class on Thu at 09:00" })).toHaveCount(1);

    expectNoConsoleErrors(errors);
  });
});
