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

// 2 weekly + 7 daily across a seven-day week. Was 8 while the grid had no Sunday
// column — the day picker was built from the same list, so a Sunday class could
// not be created OR displayed anywhere in the product (session 11: confirmed
// unintended, not a product choice).
const PER_WEEK = 9;

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
    expect(ci.filter(c => c.name === "Daily Mobility")).toHaveLength(7);
    // The Sunday one exists and is a real Sunday — the day the grid used to have
    // nowhere to draw, so the occurrence was never generated at all.
    expect(ci.filter(c => new Date(c.startsAt).getDay() === 0)).toHaveLength(1);

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

// There are TWO doors into `class_instances`: publishing a week (above) and the
// Runner minting one when a coach presses Check in. Found by driving the whole
// new-gym journey: the runner's door was recording `durationMin: null` on a class
// whose own header said "48:00 total", so the same class recorded a different
// amount of itself depending on which door it came through. These rows are
// permanent and nothing later can recover the length.
test.describe("both doors into class_instances record the same class", () => {
  test("the runner's occurrence carries the class's real length", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");

    // The length the coach can see on the header, read from the screen rather
    // than assumed, so this test tracks the seeded class rather than a constant.
    const header = await page.locator("body").innerText();
    const [, mm, ss] = header.match(/(\d+):(\d{2}) total/) || [];
    const expected = Number(mm);
    expect(expected).toBeGreaterThan(0);
    expect(ss).toBe("00");

    await page.getByRole("button", { name: /Check in/ }).first().click();
    await page.getByPlaceholder(/Search or type/i).fill("Sarah Chen");
    await page.getByRole("button", { name: /Add .*Sarah Chen/ }).click();

    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(1);
    expect(ci[0].durationMin).toBe(expected);
    expect(ci[0].name).toBeTruthy();
    expect(Number.isNaN(Date.parse(ci[0].startsAt))).toBe(false);

    expectNoConsoleErrors(errors);
  });
});

// ── Sunday · every consumer of the day list ──────────────────────────────────
// The week was Mon–Sat, and because the "Add class" picker was built from the
// same list the product was self-consistently unable to schedule a Sunday class:
// it could not be created, displayed, or published. Confirmed unintended in
// session 11. Driven end to end here because the three consumers are in three
// different places and a unit test sees none of them.
test.describe("a gym that runs Sunday classes can schedule them", () => {
  test("the day picker offers Sunday, and a Sunday class reaches the books", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Schedule");

    // The grid has a column for it — a rule for a day with no column is a rule
    // that silently never appears.
    await expect(page.getByText("SUN")).toBeVisible();

    await page.getByRole("button", { name: "+ Add class" }).click();
    const daySelect = page.locator("select").filter({ has: page.locator('option[value="Mon"]') });
    expect(await daySelect.locator("option").allTextContents())
      .toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    await page.getByPlaceholder("Class name").fill("Sunday Reset");
    await daySelect.selectOption("Sun");
    await page.getByRole("button", { name: "Add to schedule" }).click();

    // Displayed…
    await expect(page.getByText("Sunday Reset")).toBeVisible();
    await expect(page.getByText("1 class this week")).toBeVisible();
    // …and publishable, on a real Sunday.
    await page.locator(PUBLISH).click();
    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(1);
    expect(ci[0].name).toBe("Sunday Reset");
    expect(new Date(ci[0].startsAt).getDay()).toBe(0);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // The SECOND Sunday defect, and the one the day list did not fix. The grid's own
  // week arithmetic was `base.getDate() - base.getDay() + 1`, which is right six
  // days a week: `getDay()` makes Sunday 0, so on a Sunday it resolved to base + 1
  // — TOMORROW — and the Schedule showed next week. Today's row was not on the grid
  // at all, "This week" named the wrong week, and a Sunday class could not be seen
  // or started on the one day it runs.
  //
  // Found by opening the screen on a Sunday, which is the only day it shows. The
  // clock is fixed here for the same reason: a test for a Sunday-only bug that
  // reads the wall clock would assert nothing six days in seven.
  test("shows the week containing today when today is a Sunday", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(new Date(2026, 6, 26, 19, 35, 0));   // Sunday 26 July 2026
    await freshApp(page);
    await page.evaluate(() => {
      localStorage.setItem("jungle_user_classes", JSON.stringify([
        { id: "uc1", name: "Sunday Reset", type: "Mobility", coach: "Dylan",
          day: "Sun", slot: "19:30", dur: "45m", repeat: "weekly" },
      ]));
    });
    await page.reload();
    await nav(page, "Schedule");

    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    // Monday the 20th through Sunday the 26th — not the 27th through the 2nd.
    // Read the header exactly as a coach sees it, dates included.
    const dates = await page.evaluate(() => {
      const m = document.body.innerText.match(
        /MON\s+(\d+)\s+TUE\s+(\d+)\s+WED\s+(\d+)\s+THU\s+(\d+)\s+FRI\s+(\d+)\s+SAT\s+(\d+)\s+SUN\s+(\d+)/);
      return m ? m.slice(1) : null;
    });
    expect(dates).toEqual(["20", "21", "22", "23", "24", "25", "26"]);

    // And today's class is startable — only true if the grid is on the right week,
    // because the occurrence would otherwise be dated a week out and fall outside
    // the window entirely.
    await page.getByLabel("Start Sunday Reset at 19:30").click();
    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(1);
    expect(new Date(ci[0].startsAt).getDate()).toBe(26);
    expect(new Date(ci[0].startsAt).getDay()).toBe(0);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });
});

// ── §3A · the Schedule/Runner join ───────────────────────────────────────────
// Publishing a week and then running that class used to produce TWO
// class_instances rows: the join was keyed on name, and nothing made the
// Builder's `sessionName` equal the schedule rule's name — it comes from a draft,
// a template or a persona and defaults to "My Workout". Check-ins landed on the
// Runner's row and the published one kept zero attendance forever.
//
// The fix is that the coach starts the class FROM the Schedule, so the occurrence
// is chosen rather than inferred. `store.test.js` pins the resolution; what is
// asserted here is the whole journey, ending on the STORED attendance row — the
// only place the defect was ever visible.
//
// The clock is fixed. A Start button only exists inside the 4h window either side
// of a slot, so a fixture that took its time from the wall clock would pass most
// of the day and fail between 23:30 and 02:00 — exactly the shape of the bug that
// made honesty.spec.js fail only on Sundays.
const NOON_ISH = () => new Date(2026, 6, 14, 18, 5, 0);   // Tuesday, five past six

async function seedForStart(page) {
  await page.clock.setFixedTime(NOON_ISH());
  await freshApp(page);
  await page.evaluate(() => {
    localStorage.setItem("jungle_user_classes", JSON.stringify([
      { id: "uc1", name: "S360",         type: "HIIT", coach: "Dylan", day: "Tue", slot: "18:00", dur: "45m", repeat: "weekly" },
      { id: "uc2", name: "Morning Burn", type: "HIIT", coach: "Mara",  day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
    ]));
  });
  await page.reload();
  await nav(page, "Schedule");
}

test.describe("a class run from the Schedule keeps the occurrence it was published as", () => {
  test("check-ins land on the published row even when the Builder renames the class", async ({ page }) => {
    const errors = watchConsole(page);
    await seedForStart(page);

    await page.locator(PUBLISH).click();
    const published = await stored(page, "jungle_class_instances");
    expect(published).toHaveLength(2);
    const target = published.find(c => c.name === "S360");
    expect(target).toBeTruthy();

    // Only the class actually about to run offers Start — Monday's 06:00 is on the
    // same week and must not, or a coach could record attendance for a class two
    // days in the past.
    await expect(page.locator('[data-testid="start-class"]')).toHaveCount(1);
    await page.getByLabel("Start S360 at 18:00").click();

    // The pin is stated wherever the coach goes next. A silent pin is how
    // attendance ends up on a class the coach did not think they were teaching.
    await expect(page.getByTestId("pinned-class")).toContainText("S360");
    await expect(page.getByTestId("pinned-class")).toContainText("today 18:00");

    // Now make the names diverge as badly as they do in real use — this is the
    // exact case that produced a second row, and the reason the id has to travel.
    page.once("dialog", d => d.accept("S360 — Week 4"));
    await page.getByRole("button", { name: "Rename class" }).click();
    await expect(page.getByText("S360 — Week 4")).toBeVisible();

    await page.getByRole("button", { name: /Start Session/i }).click();
    await page.getByRole("button", { name: /Check in/ }).first().click();
    // The panel names the occurrence being joined before anybody is tapped in.
    await expect(page.getByText("S360 · today 18:00")).toBeVisible();

    await page.getByPlaceholder(/Search or type/i).fill("Sarah Chen");
    await page.getByRole("button", { name: /Add .*Sarah Chen/ }).click();

    // THE assertion. No third row, and the check-in is on the row the Schedule
    // published — not on one minted under the Builder's name.
    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(2);
    const att = await stored(page, "jungle_attendance");
    expect(att).toHaveLength(1);
    expect(att[0].classInstanceId).toBe(target.id);
    // And the published row still says what the Schedule said, not what the
    // Builder was renamed to.
    expect(ci.find(c => c.id === target.id)).toMatchObject({ name: "S360", coachName: "Dylan", durationMin: 45 });

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // Starting a class the coach never pressed "Publish week" for must put it on the
  // books rather than refuse — and at its SLOT, so publishing afterwards
  // recognises it instead of writing the same class a second time.
  test("starting an unpublished class puts it on the books at its slot", async ({ page }) => {
    const errors = watchConsole(page);
    await seedForStart(page);
    expect(await stored(page, "jungle_class_instances")).toBeNull();

    await page.getByLabel("Start S360 at 18:00").click();
    const ci = await stored(page, "jungle_class_instances");
    expect(ci).toHaveLength(1);
    expect(ci[0].name).toBe("S360");
    // 18:00, not the 18:05 the button was pressed at.
    expect(new Date(ci[0].startsAt).getHours()).toBe(18);
    expect(new Date(ci[0].startsAt).getMinutes()).toBe(0);

    // Publishing the week now sees it as already there.
    await nav(page, "Schedule");
    await page.locator(PUBLISH).click();
    await expect(page.locator(RESULT)).toContainText("1 was already there");
    expect(await stored(page, "jungle_class_instances")).toHaveLength(2);

    expectNoConsoleErrors(errors);
  });

  // The affordance is bounded by the window the Runner joins on. A Start button on
  // a class four days out would date real attendance to a class that has not
  // happened — the confident wrong record this repo keeps deleting.
  test("offers no Start button on a week nobody is teaching yet", async ({ page }) => {
    await seedForStart(page);
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.locator('[data-testid="start-class"]')).toHaveCount(0);
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
    await page.getByRole("button", { name: "Next week", exact: true }).click();
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
