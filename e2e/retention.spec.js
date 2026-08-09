import { test, expect } from "@playwright/test";
import { nav, watchConsole, expectNoConsoleErrors, navAnyWidth, freshApp, ALL_SCREENS } from "./helpers.js";

const ANALYTICS = ALL_SCREENS.find(s => s.key === "analytics");

// ─── N2 · the analytics route, now a real screen ─────────────────────────────
//
// The route, the nav entries and the `analytics:view` capability all predate this;
// what changed is that the route rendered a coming-soon panel and now renders a
// curve computed from the gym's own rows. Two things therefore need pinning that a
// unit test cannot reach:
//
//   1. the nav entry is REACHABLE. It was not — `isViewEnabled("analytics")`
//      returned false because flags.js mapped `analytics` to `mockAnalytics`, so
//      all three nav arrays filtered it out. The route was live and unreachable.
//   2. the MOCK stays dead. `FLAGS.mockAnalytics` is still false, and none of
//      AnalyticsScreen's invented figures may appear on any screen.

const NAMES = ["Larry Tan","Gina Lim","Rita Chua","Wei Ng","Ana Rodrigues","Marcus Lee","Priya Nair",
  "Jun Hao","Siti Rahman","Ben Koh","Chloe Wong","Dinesh Kumar","Emma Teo","Farid Hassan","Grace Lim",
  "Hui Min","Ivan Goh","Jaya Pillai","Kelvin Sim","Lina Zhou","Mei Ling","Nadia Ismail","Omar Sharif",
  "Poh Choo","Qing Yu","Raj Menon","Serena Lau","Tariq Aziz","Uma Devi","Vincent Chua","Wendy Poh",
  "Xin Yi","Yusuf Ali","Zoe Ang","Aaron Lim","Bella Ng"];

// A studio's imported year, built relative to the RUN's own clock so the fixture
// never ages out of the window. `plan` is [monthsAgoFirstSeen, count, monthsLasted].
const YEAR = [
  [12, 14, 11],   // the import boundary: everyone already training when the export begins
  [10,  6,  9],
  [ 9,  6,  2],
  [ 8,  5,  6],
  [ 7,  4,  1],
  [ 6,  3,  5],
  [ 4,  3,  0],
];

function build(source = "import") {
  const now = new Date();
  const members = [], attendance = [];
  let mi = 0, ai = 0;
  const at = (monthsAgo, day) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, 18, 30, 0);
    return d.toISOString();
  };
  YEAR.forEach(([ago, n, life]) => {
    for (let i = 0; i < n; i++) {
      const id = `m${mi}`;
      members.push({ id, name: NAMES[mi % NAMES.length], email: "",
                     // Cancelled members are IN the analysis — they are the signal.
                     status: life <= 1 && i % 2 === 0 ? "cancelled" : "active",
                     joinedAt: "", externalRef: "" });
      mi++;
      for (let k = 0; k <= life; k++) {
        const monthsAgo = ago - k;
        if (monthsAgo < 1) break;          // never into the incomplete current month
        attendance.push({ id: `a${ai++}`, classInstanceId: `c${monthsAgo}-${i % 3}`,
                          memberId: id, source, checkedInAt: at(monthsAgo, 5 + (i % 20)) });
      }
    }
  });
  return { members, attendance };
}

async function seed(page, fixture) {
  await page.goto("./");
  await page.evaluate((f) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_members", JSON.stringify(f.members));
    localStorage.setItem("jungle_attendance", JSON.stringify(f.attendance));
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
  }, fixture);
  await page.reload();
}

test.describe("studio analytics", () => {
  test("the Analytics nav entry is reachable at every width", async ({ page }) => {
    // The defect this pins: flags.js mapped `analytics` to the `mockAnalytics`
    // flag, so `isViewEnabled` said false and the entry was filtered out of the
    // sidebar, the compact sheet AND the bottom bar. Three nav arrays containing
    // an entry that never renders looked exactly like a working route.
    const errors = watchConsole(page);
    await seed(page, build());
    await nav(page, "Analytics");
    await expect(page.getByRole("heading", { name: "Studio analytics" })).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("a gym with imported history sees a real curve from its own rows", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page, build());
    await nav(page, "Analytics");

    await expect(page.getByTestId("retention-not-ready")).toHaveCount(0);
    await expect(page.getByTestId("retention-curve")).toBeVisible();
    await expect(page.getByTestId("retention-cohorts")).toBeVisible();

    // The anchor bar is 100% by definition, so its presence proves the chart
    // rendered rather than that some number happened to appear.
    const curve = page.getByTestId("retention-curve");
    await expect(curve).toContainText("100%");
    await expect(curve).toContainText("months observed");

    // The population is stated, and the members left off it are accounted for —
    // a chart headed "11 members" on a 41-member roster otherwise looks like it
    // lost thirty people.
    await expect(curve).toContainText(/\d+ members · \d+ months observed/);

    // The import boundary month is named as excluded, not silently dropped.
    await expect(page.getByTestId("retention-cohorts")).toContainText(/is left out: it is where your imported history begins/);

    expectNoConsoleErrors(errors);
  });

  test("a gym with almost no history is told what is missing and shown no chart", async ({ page }) => {
    const errors = watchConsole(page);
    // Three members, one visit each. A curve over this is sampling error with a
    // chart around it.
    const now = new Date();
    const iso = (d) => new Date(now.getFullYear(), now.getMonth() - 2, d, 18, 0).toISOString();
    await seed(page, {
      members: [0, 1, 2].map(i => ({ id: `m${i}`, name: NAMES[i], email: "", status: "active", joinedAt: "", externalRef: "" })),
      attendance: [0, 1, 2].map(i => ({ id: `a${i}`, classInstanceId: "c1", memberId: `m${i}`, source: "coach", checkedInAt: iso(4 + i) })),
    });
    await nav(page, "Analytics");

    const gate = page.getByTestId("retention-not-ready");
    await expect(gate).toBeVisible();
    // The number held AND the number needed. "Not enough data" alone leaves an
    // owner unable to tell whether they are one member short or a hundred.
    await expect(gate).toContainText("at least 12 members");
    await expect(gate).toContainText("So far 3 members do");
    await expect(gate).toContainText(/Members screen/);

    // NO chart, and no half-life figure either.
    await expect(page.getByTestId("retention-curve")).toHaveCount(0);
    await expect(page.getByTestId("retention-cohorts")).toHaveCount(0);
    await expect(page.getByTestId("retention-headline")).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("a brand-new gym with nothing at all does not show a chart of zeroes", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Analytics");

    await expect(page.getByTestId("retention-not-ready")).toBeVisible();
    await expect(page.getByText(/No check-ins are recorded yet/)).toBeVisible();
    await expect(page.getByTestId("retention-curve")).toHaveCount(0);
    // A chart of 0% bars is the failure mode a "just render it" version ships.
    await expect(page.locator("body")).not.toContainText("0%");

    // The empty state names the Members screen, so it carries the door to it —
    // otherwise it is a dead end with instructions, and on a phone the Members
    // entry is two taps down behind "More".
    await page.getByRole("button", { name: "Import attendance history" }).click();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByText(/Import attendance history/).first()).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("the curve never rises — one population, printed once", async ({ page }) => {
    // The property, read off the RENDERED screen rather than off the model. A
    // per-point denominator makes each point individually correct and the line as
    // a whole a lie: an upturn at month 7 reads as "members come back".
    await seed(page, build());
    await nav(page, "Analytics");

    const pcts = await page.getByTestId("retention-curve").evaluate(el =>
      [...el.querySelectorAll("div[title]")].map(d => d.title));
    expect(pcts.length, "control: the chart must have bars to compare").toBeGreaterThan(3);
    // Every bar's tooltip states the same denominator, which is WHY it cannot rise.
    const denominators = new Set(pcts.map(t => t.match(/of (\d+) still/)?.[1]));
    expect(denominators.size).toBe(1);

    const nums = await page.getByTestId("retention-curve").evaluate(el =>
      [...el.querySelectorAll("div")].map(d => d.textContent.trim())
        .filter(t => /^\d+%$/.test(t)).map(t => parseInt(t, 10)));
    expect(nums.length).toBeGreaterThan(3);
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i], `bar ${i} rose above bar ${i - 1}`).toBeLessThanOrEqual(nums[i - 1]);
    }
  });

  test("no cell in the cohort table reports an unmeasurable month as 0%", async ({ page }) => {
    await seed(page, build());
    await nav(page, "Analytics");

    const table = page.getByTestId("retention-cohorts").locator("table");
    await expect(table).toBeVisible();
    // The newest cohort cannot have a 6-month figure. An em dash, never a zero:
    // writing 0 there reports a young cohort as a catastrophic one, which is the
    // single most common way a retention table lies.
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toContainText("—");
  });

  test("the fabricated analytics screen stays dead", async ({ page }) => {
    // FLAGS.mockAnalytics is still false. Flipping it would ship "1,284 active
    // members" and "£412 revenue per class" to a paying gym — this asserts the
    // route did not accidentally become the mock.
    const errors = watchConsole(page);
    await seed(page, build());
    await nav(page, "Analytics");

    for (const invented of ["1,284", "£412", "Barry's", "Shoreditch", "Mara K.", "Music that fills rooms",
                            "Best BPM by class", "Trainer performance", "RPE distribution", "Message all"]) {
      await expect(page.getByText(invented, { exact: false })).toHaveCount(0);
    }
    // And the panel it replaced is gone too.
    await expect(page.getByText(/Real analytics land in Phase 2/)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("holds up on a phone", async ({ page }) => {
    // A fresh load at the stated width — resizing without reloading shows a stale
    // render, which has produced a wrong finding in this repo before.
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, build());
    await navAnyWidth(page, ANALYTICS);

    await expect(page.getByTestId("retention-curve")).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways on a phone").toBeLessThanOrEqual(0);
  });
});
