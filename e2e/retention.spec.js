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

  // ─── §2.6 · which class types keep members ──────────────────────────────────
  //
  // The join no competitor holds: `class_instances.classType` × `attendance`.
  // These drive the SCREEN; `classTypeRetention.test.js` drives the arithmetic,
  // including every way the number can lie.

  const DAY = 86_400_000;
  const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

  /**
   * A gym whose timetable really does separate. `spec` is
   * `{ type: [triers, returners] }`, every trier's first visit 200 days back so
   * everyone has had the same four weeks.
   *
   * ⚠️ Rows are joined through class_instances exactly as the product writes
   * them, rather than by putting a type on the attendance row — the attendance
   * table has no type column, and a fixture that invented one would test a
   * schema this product does not have.
   */
  function timetable(spec, extra = {}) {
    const members = [], attendance = [], classInstances = [];
    let n = 0;
    for (const [type, [triers, returners]] of Object.entries(spec)) {
      for (let i = 0; i < triers; i++) {
        const id = `${type}-m${i}`;
        members.push({ id, name: NAMES[n % NAMES.length], email: "", status: "active", joinedAt: "", externalRef: "" });
        n++;
        const first = `${type}-ci-a-${i}`;
        classInstances.push({ id: first, classType: type, startsAt: ago(200), name: type, durationMin: 45 });
        attendance.push({ id: `${type}-at-a-${i}`, classInstanceId: first, memberId: id, source: "import", checkedInAt: ago(200) });
        if (i < returners) {
          const back = `${type}-ci-b-${i}`;
          classInstances.push({ id: back, classType: type, startsAt: ago(193), name: type, durationMin: 45 });
          attendance.push({ id: `${type}-at-b-${i}`, classInstanceId: back, memberId: id, source: "import", checkedInAt: ago(193) });
        }
      }
    }
    // Rows the importer really produces: a "Type" column it could not match, so
    // the instance carries no class type at all.
    for (let i = 0; i < (extra.orphans || 0); i++) {
      classInstances.push({ id: `orphan-ci-${i}`, classType: "", startsAt: ago(150), name: "Open Gym", durationMin: 45 });
      attendance.push({ id: `orphan-at-${i}`, classInstanceId: `orphan-ci-${i}`, memberId: `${Object.keys(spec)[0]}-m0`, source: "import", checkedInAt: ago(150) });
    }
    return { members, attendance, classInstances };
  }

  async function seedTimetable(page, fixture) {
    await page.goto("./");
    await page.evaluate((f) => {
      localStorage.clear();
      sessionStorage.setItem("jungle_pin_ok", "1");
      localStorage.setItem("jungle_members", JSON.stringify(f.members));
      localStorage.setItem("jungle_attendance", JSON.stringify(f.attendance));
      localStorage.setItem("jungle_class_instances", JSON.stringify(f.classInstances));
      localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
    }, fixture);
    await page.reload();
  }

  test("a gym sees which class types members come back to, with the population behind each", async ({ page }) => {
    const errors = watchConsole(page);
    await seedTimetable(page, timetable({ hiit: [12, 10], strength: [12, 3] }));
    await nav(page, "Analytics");

    const panel = page.getByTestId("class-type-retention");
    await expect(panel).toBeVisible();
    // The figures, and the POPULATION behind each — a percentage with no
    // denominator is the confident wrong number this product refuses.
    await expect(panel).toContainText("83%");
    await expect(panel).toContainText("10/12");
    await expect(panel).toContainText("25%");
    await expect(panel).toContainText("3/12");

    // 🔴 THE CONTROL: the fixture really produces a RANKING, and the better type
    // is first. Without this, "the panel shows percentages" passes on a screen
    // that lists them in insertion order or shows one type twice.
    const rows = await panel.locator("div[title]").evaluateAll(els => els.map(e => e.getAttribute("title")));
    expect(rows.length, "no ranked rows rendered — this test measures nothing").toBeGreaterThan(1);
    expect(rows[0]).toContain("10 of 12");
    expect(rows[1]).toContain("3 of 12");

    // The studio's own baseline, pooled over members rather than over types.
    await expect(panel).toContainText("studio average 54%");
    expectNoConsoleErrors(errors);
  });

  test("a class type too thin to rank is NAMED as excluded, never silently dropped", async ({ page }) => {
    // An owner who cannot see that Barre was left out reads the list as the whole
    // timetable and concludes Barre has no problem.
    await seedTimetable(page, timetable({ hiit: [12, 9], barre: [3, 0] }));
    await nav(page, "Analytics");

    const panel = page.getByTestId("class-type-retention");
    // "HIIT", not "hiit": the catalogue LABEL is what a human reads and the key
    // is storage — the rule `rawValues.spec.js` exists to enforce. `barre` below
    // renders as itself because the catalogue has no such key, and
    // `resolveClassType` deliberately keeps an unrecognised value rather than
    // mapping it to a near neighbour and inventing programming.
    await expect(panel).toContainText("HIIT");
    const excluded = page.getByTestId("class-type-excluded");
    await expect(excluded).toBeVisible();
    await expect(excluded).toContainText("barre (3)");
    // The threshold is stated, so "not ranked" is checkable rather than a shrug.
    await expect(excluded).toContainText("8 members");
  });

  test("check-ins that cannot be traced to a class type are counted on the screen", async ({ page }) => {
    // A ranking computed over 60% of the data and presented as the whole
    // timetable is precisely what this sentence exists to prevent.
    await seedTimetable(page, timetable({ hiit: [12, 9] }, { orphans: 7 }));
    await nav(page, "Analytics");
    await expect(page.getByTestId("class-type-retention"))
      .toContainText("7 check-ins could not be traced to a class type");
  });

  test("a gym with no history is told what this panel is waiting for, and shown no ranking", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Analytics");
    await expect(page.getByTestId("class-type-not-ready")).toBeVisible();
    // ⚠️ Deliberately NOT the cohort panel's sentence: both render here, and one
    // owner should not be told the same fact twice in two voices. A strict-mode
    // violation is what caught the duplicate.
    await expect(page.getByTestId("class-type-not-ready")).toContainText("Once a few weeks of classes");
    await expect(page.getByTestId("class-type-retention").locator("div[title]")).toHaveCount(0);
  });

  test("the class-type panel holds up on a phone", async ({ page }) => {
    // ⚠️ Viewport BEFORE load — a resize without a reload shows a stale render.
    await page.setViewportSize({ width: 390, height: 780 });
    await seedTimetable(page, timetable({ hiit: [12, 10], strength: [12, 3] }));
    await navAnyWidth(page, ANALYTICS);
    await expect(page.getByTestId("class-type-retention")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the ranking must not push the page sideways on a phone").toBeLessThanOrEqual(1);
  });
});
