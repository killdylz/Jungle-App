import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── B8 · colour-only meaning, and numbers nothing sets ───────────────────────
//
// Two rules this repo already holds elsewhere, applied to the places that had
// slipped past them:
//
//   §3 accessibility — information must never be carried by hue alone. SCFG's
//     palette does not even carry it uniquely for a sighted user:
//     warmup/power, core/stretch and engine/recovery are each ONE colour shared
//     by two stage types.
//   §11 / audit 2.2 — a confident wrong number is worse than no number. This is
//     the judgement that deleted BASE_SCHEDULE and flagged off the mock KPIs.
//
// Found by driving the app, not by reading it: all three defects below render
// perfectly and say the wrong thing.

async function seedWeek(page) {
  await page.evaluate(() => {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
    localStorage.setItem("jungle_user_classes", JSON.stringify([
      { id: "ucT", name: "Saturday Grind", type: "Hyrox", coach: "Dylan", day, slot: "09:00", dur: "45m", repeat: "weekly" },
    ]));
  });
  await page.reload();
}

test.describe("nothing important is carried by colour alone", () => {
  // The Builder's stage rows read "warmup · 5:00" and "primary_lift · 15:00" —
  // the raw SCFG key, on the app's most-used screen. The label map existed; this
  // call site simply did not use it.
  test("the Builder names each stage type in words, not enum keys", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\b(warmup|cooldown|primary_lift|sets_reps)\b/);
    // The seeded sample class opens with a warm-up, so the human label must be there.
    expect(body).toMatch(/Warm-Up · \d+:\d\d/);

    expectNoConsoleErrors(errors);
  });

  // The Room TV is a MEMBER-facing surface. Its per-stage chips wrote only the
  // duration and left the colour dot to say which stage each one was, so the run
  // of the class was unreadable to anyone who does not separate those hues.
  test("the Room TV chips name each stage, not just its length", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");
    await page.getByRole("button", { name: /Preview on TV/ }).click();

    const body = await page.locator("body").innerText();
    // Name · duration, for the sample class's own stage names.
    expect(body).toMatch(/Warm-Up · \d+m/i);
    expect(body).toMatch(/Cool-Down · \d+m/i);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("a scheduled class says its type in words on the Dashboard", async ({ page }) => {
    await freshApp(page);
    await seedWeek(page);
    // The 3px bar on the left carried the type and nothing wrote it.
    await expect(page.getByText("Saturday Grind")).toBeVisible();
    // "Hyrox" in the DOM, uppercased by CSS. Asserting the DOM text is the right
    // level: it is what a screen reader announces.
    await expect(page.getByText("Hyrox", { exact: true }).first()).toBeVisible();
  });
});

test.describe("no number the product cannot know", () => {
  // `fill` is never SET anywhere in the product — no capacity field, no booking
  // integration — so it read 0 for every class on every gym. "0%" beside a class
  // says "nobody came", not "we don't know".
  test("the Dashboard shows no fill percentage for today's classes", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedWeek(page);

    const row = page.getByText("Saturday Grind").locator("xpath=ancestor::div[1]/..");
    await expect(row).not.toContainText("%");

    expectNoConsoleErrors(errors);
  });

  test("the Schedule grid shows no fill bar or percentage", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedWeek(page);
    await nav(page, "Schedule");

    await expect(page.getByText("Saturday Grind")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\d+%/);

    expectNoConsoleErrors(errors);
  });

  // The whole point: the cell keeps saying something useful, it just stops
  // saying something false.
  test("the Schedule cell still names the class, coach and type", async ({ page }) => {
    await freshApp(page);
    await seedWeek(page);
    await nav(page, "Schedule");

    await expect(page.getByText("Saturday Grind")).toBeVisible();
    await expect(page.getByText("Dylan · 45m")).toBeVisible();
    // "Hyrox" in the DOM, uppercased by CSS. Asserting the DOM text is the right
    // level: it is what a screen reader announces.
    await expect(page.getByText("Hyrox", { exact: true }).first()).toBeVisible();
  });
});
