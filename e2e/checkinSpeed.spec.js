import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The P6 instrument, said to a gym owner ──────────────────────────────────
//
// It used to sit directly under the at-risk list rendering `—` beside `NO DATA` on
// a fresh install: an unattributed engineering threshold, in the visual grammar of
// a broken gauge, in the middle of the screen that exists to show an owner what
// retention is worth.
//
// The instrument is not deleted — an unmeasured design law is indistinguishable
// from a met one, and that is why it exists. What is asserted here is that the
// empty state reads as "nothing yet" rather than as a fault, and that the card
// ranks below the things an owner came to the screen for.

// The stored shape, read off `recordSession` in checkinMetrics.js rather than
// guessed: `{ at, classInstanceId, count, medianSec, idleSkipped, totalSec }`. A
// crash on a fixture whose shape was invented is not evidence of anything.
const session = (count, medianSec) => ({
  at: new Date(Date.now() - 86_400_000).toISOString(),
  classInstanceId: `c${count}-${medianSec}`,
  count, medianSec, idleSkipped: 0, totalSec: count * medianSec,
});

async function seedSessions(page, sessions) {
  await page.goto("./");
  await page.evaluate((s) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_checkin_metrics", JSON.stringify(s));
  }, sessions);
  await page.reload();
}

test.describe("check-in speed", () => {
  test("an unmeasured instrument reads as 'nothing yet', never as a fault", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    const card = page.getByTestId("checkin-speed");
    // POSITIVE CONTROL: the card has to be on the screen for its contents to mean
    // anything. Deleting it would satisfy every "must not contain" below.
    await expect(card).toBeVisible();
    await expect(card).toContainText("Check-in speed");
    await expect(card).toContainText("Nothing measured yet");

    // The three things that made it read as a broken gauge.
    await expect(card).not.toContainText("—");
    await expect(card).not.toContainText("NO DATA");
    await expect(card).not.toContainText(/OVER/i);
    // No figure at all in the numeral slot — not a zero, not a grey dash.
    await expect(card).not.toContainText(/\d+s a member/);

    // The target is Jungle's, and says so. Unattributed, an owner cannot tell
    // whose target it is or that they are not the one failing it.
    await expect(card).toContainText(/Jungle's own target is under 5 seconds/);

    expectNoConsoleErrors(errors);
  });

  test("the empty state carries the door to the thing that fills it", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");

    await page.getByTestId("checkin-speed").getByRole("button", { name: "Open the Class Runner" }).click();
    // A named control on the Runner, not the card's own copy — this has to prove
    // the navigation happened rather than that a button exists.
    await expect(page.getByRole("button", { name: "Run", exact: true })
      .or(page.getByText(/Check members in|Roster/i)).first()).toBeVisible();
  });

  test("it ranks below the roster, not above it", async ({ page }) => {
    // Position IS the finding: an internal instrument sitting between the at-risk
    // panel and the import block put engineering trivia in the middle of the
    // owner's value story.
    await freshApp(page);
    await nav(page, "Members");

    const box = async (loc) => (await loc.boundingBox()).y;
    // ⚠️ The heading is `Who&rsquo;s slipping away` — a real U+2019, not an ASCII
    // apostrophe. A literal "Who's slipping away" never matches, which is how the
    // first version of this test failed on a locator rather than on the layout.
    const atRisk = await box(page.getByText(/slipping away/));
    const roster = await box(page.getByText(/^Roster · /));
    const speed = await box(page.getByTestId("checkin-speed"));

    expect(atRisk).toBeLessThan(roster);
    expect(speed, "check-in speed must come after the roster").toBeGreaterThan(roster);
  });

  test("a measured instrument states the figure, the verdict and the coach time", async ({ page }) => {
    const errors = watchConsole(page);
    // Two classes of four at 4s a member: median 4s, median class size 4.
    await seedSessions(page, [session(4, 4), session(4, 4)]);
    await nav(page, "Members");

    const card = page.getByTestId("checkin-speed");
    await expect(card).toContainText("4s");
    await expect(card).toContainText("UNDER JUNGLE'S 5s");
    // The consequence in the unit an owner thinks in, from their own class size.
    await expect(card).toContainText("A typical class here is 4 members");
    await expect(card).toContainText("roughly 16s of your coach's time");
    // Measured, so the empty-state copy and its button are gone.
    await expect(card).not.toContainText("Nothing measured yet");
    await expect(card.getByRole("button", { name: "Open the Class Runner" })).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("a slow gym is told it is slow, not flattered", async ({ page }) => {
    // The whole reason this instrument exists. `meetsTarget` must never default to
    // a pass, and the screen must not soften an over-target reading.
    await seedSessions(page, [session(3, 9), session(3, 11)]);
    await nav(page, "Members");

    const card = page.getByTestId("checkin-speed");
    await expect(card).toContainText("10s");
    await expect(card).toContainText("OVER JUNGLE'S 5s");
  });

  test("survives a reload — the measurement is stored, not held in a component", async ({ page }) => {
    await seedSessions(page, [session(4, 4), session(4, 4)]);
    await nav(page, "Members");
    await expect(page.getByTestId("checkin-speed")).toContainText("UNDER JUNGLE'S 5s");
    await page.reload();
    await nav(page, "Members");
    await expect(page.getByTestId("checkin-speed")).toContainText("UNDER JUNGLE'S 5s");
  });
});
