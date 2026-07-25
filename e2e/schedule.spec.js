import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── B4 · publishing a week of the schedule ───────────────────────────────────
//
// The Schedule grid holds RULES ("Tuesday 6pm, weekly"). Attendance hangs off
// dated OCCURRENCES, and nothing turned one into the other — the Runner minted
// an occurrence ad hoc when a coach pressed play, which works for the class in
// front of you and leaves the schedule as a drawing.
//
// `scheduleInstances.test.js` pins the recurrence arithmetic. What is asserted
// here is what a unit test cannot reach: that a real press writes real rows,
// that a SECOND press writes none, and that publishing next week does not
// inflate the number of classes the gym has actually run.

const PUBLISH = '[data-testid="publish-week"]';
const RESULT  = '[data-testid="publish-result"]';

async function seedRules(page) {
  await page.evaluate(() => {
    localStorage.setItem("jungle_user_classes", JSON.stringify([
      { id: "uc1", name: "Morning Burn",   type: "HIIT",     coach: "Dylan", day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
      { id: "uc2", name: "Hyrox Sim",      type: "Hyrox",    coach: "Mara",  day: "Wed", slot: "18:00", dur: "1h",  repeat: "weekly" },
      { id: "uc3", name: "Daily Mobility", type: "Mobility", coach: "",      day: "Mon", slot: "12:00", dur: "30m", repeat: "daily" },
    ]));
  });
  await page.reload();
  await nav(page, "Schedule");
}

// 2 weekly + 6 daily across a Mon–Sat gym.
const PER_WEEK = 8;

test.describe("a drawn schedule becomes classes on the books", () => {
  test("publishes the week and writes real dated occurrences", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRules(page);

    await expect(page.locator(PUBLISH)).toBeEnabled();
    await expect(page.locator(PUBLISH)).toContainText(`· ${PER_WEEK}`);
    await page.locator(PUBLISH).click();

    await expect(page.locator(RESULT)).toContainText(`Added ${PER_WEEK} classes to the books`);

    // Read back the STORED objects, not the message. These rows are what
    // attendance will reference and what syncs to Postgres.
    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(PER_WEEK);
    for (const c of ci) {
      expect(c.id).toBeTruthy();
      expect(Number.isNaN(Date.parse(c.startsAt))).toBe(false);
      expect(c.name).toBeTruthy();
    }
    // Each rule's own details survive onto its occurrence.
    const burn = ci.find(c => c.name === "Morning Burn");
    expect(burn).toMatchObject({ classType: "HIIT", coachName: "Dylan", durationMin: 45 });
    expect(ci.find(c => c.name === "Hyrox Sim").durationMin).toBe(60);
    expect(ci.filter(c => c.name === "Daily Mobility")).toHaveLength(6);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // THE one that matters. A duplicated occurrence splits one class's check-ins
  // across two rows and nothing surfaces the split.
  test("pressing publish again adds nothing", async ({ page }) => {
    await freshApp(page);
    await seedRules(page);

    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText("Added");
    expect(await stored(page, "jungle_class_instances")).toHaveLength(PER_WEEK);

    // Disabled once there is nothing left to do — with a reason, not silently.
    await expect(page.locator(PUBLISH)).toBeDisabled();
    await expect(page.locator(PUBLISH)).toHaveAttribute("title", /already on the books/i);

    // And forcing it through anyway still writes nothing.
    await page.locator(PUBLISH).evaluate(b => { b.disabled = false; b.click(); });
    expect(await stored(page, "jungle_class_instances")).toHaveLength(PER_WEEK);
  });

  test("adds only what is new when a class joins a published week", async ({ page }) => {
    await freshApp(page);
    await seedRules(page);
    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText("Added");

    await page.getByRole("button", { name: "+ Add class" }).click();
    await page.getByPlaceholder("Class name").fill("Friday Finisher");
    await page.getByRole("button", { name: "Add to schedule" }).click();

    await expect(page.locator(PUBLISH)).toContainText("· 1");
    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText(`Added 1 class to the books. ${PER_WEEK} were already there.`);
    expect(await stored(page, "jungle_class_instances")).toHaveLength(PER_WEEK + 1);
  });

  test("says so rather than offering a button that does nothing on an empty week", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Schedule");

    await expect(page.locator(PUBLISH)).toBeDisabled();
    await expect(page.locator(PUBLISH)).toHaveAttribute("title", /Add a class to this week first/i);
    await expect(page.getByText("0 classes this week")).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("counts the week actually being viewed, not a deleted mock", async ({ page }) => {
    await freshApp(page);
    await seedRules(page);
    // The old header read `Object.keys(schedule).length` — the deleted mock base
    // schedule, permanently {} — so it said "0 classes" whatever the gym ran.
    await expect(page.getByText(`${PER_WEEK} classes this week`)).toBeVisible();
  });
});

test.describe("publishing ahead does not inflate what the gym has done", () => {
  // A number that goes up for work not yet done is the flattering lie the
  // Members screen exists to avoid — it is why the roster counts ACTIVE members
  // rather than list length.
  test("classes run counts only classes that have happened", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRules(page);
    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText("Added");

    // Now publish a week that is entirely in the future.
    await page.getByRole("button", { name: "›", exact: true }).click();
    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText("Added");

    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(PER_WEEK * 2);
    const past = ci.filter(c => new Date(c.startsAt) <= new Date()).length;
    expect(past).toBeLessThan(ci.length);

    await nav(page, "Members");
    const body = await page.locator("body").innerText();
    const shown = Number(body.match(/(\d+)\s*\n*\s*CLASSES RUN/)?.[1]);
    expect(shown).toBe(past);
    expect(shown).toBeLessThan(ci.length);

    expectNoConsoleErrors(errors);
  });
});
