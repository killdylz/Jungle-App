import { test, expect } from "@playwright/test";
import { freshApp, nav, navAnyWidth, waitForAppAnyWidth, stored, ALL_SCREENS,
         watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { tapScan, reportTaps } from "./tapScan.js";

// ─── The 1:1 path, and the health screen that gates it ───────────────────────
//
// The As-Built spec's F1 has said "no 1:1/PT path exists at all" since it was
// written, and F2's gap 1 says the PAR-Q "must land in the same change that
// introduces individualized load, not after". This file drives both.
//
// 🔴 THE ASSERTION THAT MATTERS is that the gate HOLDS: a coach cannot plan a
// personalised session for someone with no valid health screen. `ptStore.test.js`
// pins the refusal at the store; this pins it through the UI, and — per the repo
// rule — on the STORED object rather than only on what was rendered. A screen
// that shows a refusal and writes the row anyway would pass a render-only test.
//
// ⚠️ Fixtures are dated RELATIVE TO TODAY, never hardcoded. A PAR-Q expires after
// twelve months, so a fixture with a literal date would go green for a year and
// then start failing for a reason that has nothing to do with the code.

const PT = ALL_SCREENS.find(s => s.key === "pt");
const PARQ = ALL_SCREENS.find(s => s.key === "pt-parq");

const day = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Two members on the roster and one of them already a 1:1 client, with NO health
// screen — the state every new client starts in, and the one the gate is about.
async function seedUnscreenedClient(page) {
  await page.evaluate(() => {
    localStorage.setItem("jungle_members", JSON.stringify([
      { id: "m0", name: "Sarah Chen", email: "sarah@example.com", status: "active" },
      { id: "m1", name: "Marcus Lee", email: "marcus@example.com", status: "active" },
    ]));
    localStorage.setItem("jungle_pt_clients", JSON.stringify([
      { id: "c0", memberId: "m0", goal: "First pull-up", status: "active", startedAt: "" },
    ]));
  });
  await page.reload();
  await waitForAppAnyWidth(page);
}

// A gym that has actually been used: two members, both already 1:1 clients, one
// with a session booked. Used by the ordering tests, which need a list with rows
// in it — an empty screen satisfies any ordering claim trivially.
async function seedTwoClients(page) {
  await freshApp(page);
  await page.evaluate(() => {
    localStorage.setItem("jungle_members", JSON.stringify([
      { id: "m0", name: "Sarah Chen", email: "sarah@example.com", status: "active" },
      { id: "m1", name: "Marcus Lee", email: "marcus@example.com", status: "active" },
    ]));
    localStorage.setItem("jungle_pt_clients", JSON.stringify([
      { id: "c0", memberId: "m0", goal: "First pull-up",  status: "active", startedAt: "2026-06-01" },
      { id: "c1", memberId: "m1", goal: "Return to sport", status: "active", startedAt: "2026-07-15" },
    ]));
  });
  await page.reload();
  await waitForAppAnyWidth(page);
  // ⚠️ `navAnyWidth`, not `nav`: below 900px there is no sidebar, and these
  // tests run at 390 as well as 1280. Three nav vocabularies, one helper.
  await navAnyWidth(page, PT);
}

// Answer all seven, then save. `only` names the questions to answer YES.
async function completeScreen(page, only = []) {
  for (const short of ["Heart condition", "Chest pain when active", "Chest pain at rest",
                       "Dizziness or blackouts", "Bone or joint problem",
                       "Blood-pressure or heart medication", "Any other reason"]) {
    const word = only.includes(short) ? "Yes" : "No";
    await page.getByRole("button", { name: `${word} — ${short}`, exact: true }).click();
  }
  // D5: health answers are not written without the consent tick. Part of the
  // helper because it is part of every real screening — the tests that assert
  // the tick is REQUIRED drive it by hand instead.
  await page.getByTestId("parq-consent").locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Save health screen" }).click();
}

test.describe("1:1 clients", () => {
  test("a fresh gym is told what to do, and claims nothing", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "1:1 Clients");

    // The empty state names the next action rather than shrugging.
    await expect(page.getByTestId("pt-summary")).toContainText("No 1:1 clients yet");
    await expect(page.getByRole("button", { name: "Go to Members" })).toBeVisible();

    // And the screen says where the data lives BEFORE anything is read off it.
    // An owner who thinks 1:1 sessions are in the studio numbers draws wrong
    // conclusions from a perfectly correct screen.
    const banner = page.getByTestId("pt-local-only");
    await expect(banner).toContainText("on this device only");
    await expect(banner).toContainText("not counted in studio analytics");

    expectNoConsoleErrors(errors);
  });

  // ── The panel for the occasional thing sat above the list read every day ──
  //
  // The exact shape session 35 fixed on Members: an "Import attendance history"
  // panel rendered above the roster pushed "Add member" below the fold on a
  // laptop. Here it was "Add a 1:1 client" above the client list — a coach takes
  // on a new 1:1 client now and then and reads the list every session.
  //
  // ⚠️ Every string these look for was on the broken screen too. The defect was
  // ORDER, so these assert GEOMETRY: a `toBeVisible` on either panel passed
  // before this change and would pass again if it were reverted.
  test.describe("the client list is what a coach meets first", () => {
    for (const [width, name] of [[1280, "1280px"], [390, "390px"]]) {
      test(`the list sits above "Add a 1:1 client" at ${name}`, async ({ page }) => {
        // ⚠️ Fresh load at the stated width — resizing without reloading shows a
        // stale render, and every responsive claim in this repo is on a reload.
        await page.setViewportSize({ width, height: 800 });
        await seedTwoClients(page);

        // POSITIVE CONTROL. Both panels really rendered, and the list really has
        // clients in it — an empty screen satisfies any ordering claim
        // trivially, and this repo has been fooled by exactly that twice.
        const list = page.getByTestId("pt-list");
        const add  = page.getByTestId("pt-add");
        await expect(list).toBeVisible();
        await expect(add).toBeVisible();
        await expect(list.getByRole("button")).toHaveCount(2);

        const listBox = await list.boundingBox();
        const addBox  = await add.boundingBox();
        expect(listBox).not.toBeNull();
        expect(addBox).not.toBeNull();
        expect(listBox.y, `list ${listBox.y} must be above add ${addBox.y}`).toBeLessThan(addBox.y);
      });
    }

    test("and on a 390px phone the list starts above the fold", async ({ page }) => {
      // The consequence, not the cause. 844 is an iPhone 14's viewport height;
      // the add panel above the list put the first client row past it.
      await page.setViewportSize({ width: 390, height: 844 });
      await seedTwoClients(page);
      const first = page.getByTestId("pt-list").getByRole("button").first();
      await expect(first).toBeVisible();
      const box = await first.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y, `first client row at y=${box?.y} is below the 844px fold`).toBeLessThan(844);
    });

    test("a gym with no 1:1 clients still meets the add panel first", async ({ page }) => {
      // The list only renders when there is one, so the ordering must not hide
      // the only route in from a coach who has never used the screen.
      await freshApp(page);
      await nav(page, "1:1 Clients");
      await expect(page.getByTestId("pt-list")).toHaveCount(0);
      await expect(page.getByTestId("pt-add")).toBeVisible();
    });
  });

  // ── The honesty notice costs a line, not a fold ───────────────────────────
  //
  // The card above the list is a permanent notice a coach reads once and scrolls
  // past every day after. Measured at 390×844 with two clients before this
  // change: the card was 211px, the list started at y=635 and its bottom edge was
  // at y=911 — 67px past the fold, so a coach saw one row of the thing they
  // opened the screen for.
  //
  // 🔴 THESE ARE GEOMETRY ASSERTIONS ON PURPOSE. Every string below was on the
  // old screen too; the defect was SIZE. A `toBeVisible` on the card passed
  // before and passes after, which is precisely why it cannot be the test.
  test.describe("the 'Where this lives' notice", () => {
    test("collapses on a gym with a roster, and the whole list fits the phone", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedTwoClients(page);

      // POSITIVE CONTROL: the card and the list both rendered, and the list has
      // rows. An empty screen clears any height claim trivially.
      const lives = page.getByTestId("pt-local-only");
      const list = page.getByTestId("pt-list");
      await expect(lives).toBeVisible();
      await expect(list.getByRole("button")).toHaveCount(2);

      const livesBox = await lives.boundingBox();
      const listBox = await list.boundingBox();
      // 86px measured; 130 leaves room for a font that renders a hair taller
      // without leaving room for the 211px card coming back.
      expect(livesBox.height,
        `"Where this lives" is ${livesBox.height}px of an 844px fold`).toBeLessThan(130);
      // The consequence, and the one a coach feels: the LAST row of the list is
      // on screen, not just the first.
      expect(listBox.y + listBox.height,
        `the client list ends at y=${listBox.y + listBox.height}, past the 844px fold`).toBeLessThan(844);
    });

    test("still states both claims while collapsed", async ({ page }) => {
      // 🔴 The point of collapsing rather than dismissing. This is the only
      // sentence in the product saying 1:1 data lives on one device; a collapsed
      // state that hid it behind a control would be the defect, not the fix.
      await page.setViewportSize({ width: 390, height: 844 });
      await seedTwoClients(page);
      const short = page.getByTestId("pt-local-only-short");
      await expect(short).toBeVisible();
      await expect(short).toContainText("on this device only");
      await expect(short).toContainText("not counted in studio analytics");
    });

    test("opens on demand, and the detail is all still there", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedTwoClients(page);
      const lives = page.getByTestId("pt-local-only");
      await lives.getByRole("button").click();
      await expect(page.getByTestId("pt-local-only-short")).toHaveCount(0);
      await expect(lives).toContainText("nothing is backed up");
      await expect(lives).toContainText("would move every figure on the");
    });

    // ── The one thing on this screen it said WAS backed up ──────────────────
    //
    // 🔴 The card told every coach "Your member roster is unaffected — it syncs
    // as it always has". `saveMembers` returns before `_bgUpsertDelta` whenever
    // `_synced()` is false, and on the shipped build it always is. So the single
    // sentence on the screen that promised a copy somewhere was the false one,
    // one paragraph below a sentence that is the house standard for saying the
    // opposite.
    //
    // ⚠️ The test is against the CREDENTIAL-LESS build, which is what
    // playwright.config.js targets and what is deployed. The server-connected
    // branch cannot be driven here — there is no server to connect — so it is a
    // source-level claim, said plainly rather than implied by a passing test.
    test("🔴 does not promise a roster backup on a build with no server", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedTwoClients(page);
      const lives = page.getByTestId("pt-local-only");
      await lives.getByRole("button").click();

      // POSITIVE CONTROL: the card really opened and is showing its detail.
      await expect(lives).toContainText("stored");
      await expect(lives).toContainText("on this device only");

      // The claim that was there and could not be true.
      await expect(lives, "the card still promises the member roster syncs")
        .not.toContainText("it syncs as it always has");
      await expect(lives, "the card still implies a server exists")
        .not.toContainText("The server has no table for them yet, so");
      // And it says what IS true, rather than saying nothing.
      await expect(lives).toContainText("No server is connected");
      await expect(lives).toContainText("your member roster included");
    });

    test("a gym with nothing on this screen still gets it in full", async ({ page }) => {
      // The notice lands BEFORE anything is read off the screen, which is what
      // the card has always been for. Collapsing is about the daily read, and a
      // gym with no roster is not having one.
      await page.setViewportSize({ width: 390, height: 844 });
      await freshApp(page);
      // ⚠️ `navAnyWidth`: below 900px there is no sidebar and `nav` clicks a
      // button that is not on the page.
      await navAnyWidth(page, PT);
      const lives = page.getByTestId("pt-local-only");
      await expect(page.getByTestId("pt-local-only-short")).toHaveCount(0);
      await expect(lives).toContainText("nothing is backed up");
      await expect(lives).toContainText("not counted in studio analytics");
      await expect(lives.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    });
  });

  test("a member becomes a 1:1 client, and the roster is not forked", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate(() => localStorage.setItem("jungle_members", JSON.stringify([
      { id: "m0", name: "Sarah Chen", email: "sarah@example.com", status: "active" },
    ])));
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");

    await page.selectOption("#pt-member", { label: "Sarah Chen" });
    await page.getByLabel("What are they working towards?").fill("First pull-up");
    await page.getByRole("button", { name: "Add client" }).click();

    // Assert the STORED object. The 1:1 record points AT the member row; it does
    // not copy the name, because two rosters that disagree is the drift this
    // design exists to avoid.
    const clients = await stored(page, "jungle_pt_clients");
    expect(clients).toHaveLength(1);
    expect(clients[0].memberId).toBe("m0");
    expect(clients[0].goal).toBe("First pull-up");
    expect(clients[0]).not.toHaveProperty("name");
    // …and the roster itself is untouched.
    expect(await stored(page, "jungle_members")).toHaveLength(1);

    // The picker will not offer the same person twice.
    await expect(page.getByTestId("pt-all-added")).toBeVisible();

    expectNoConsoleErrors(errors);
  });
});

test.describe("the health screen gates individualised load", () => {
  test("an unscreened client cannot be given a session, and nothing is stored", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();

    // POSITIVE CONTROL: the client really is on screen and really is unscreened.
    // Without this, every assertion below is satisfied by a screen that failed to
    // render the detail panel at all.
    await expect(page.getByTestId("pt-parq-state")).toContainText("Not screened");

    // The refusal is SHOWN, not hidden. A form that vanishes teaches nothing, and
    // a coach who cannot see why they may not program will look for another way.
    const locked = page.getByTestId("pt-plan-locked");
    await expect(locked).toContainText(/locked/i);
    // What is lost, and where the fix is — not a second copy of the reason the
    // panel above already carries.
    await expect(locked).toContainText("Not screened");
    await expect(page.getByRole("button", { name: "Plan session" })).toHaveCount(0);

    // 🔴 And the store is empty — the claim this test exists to make.
    expect(await stored(page, "jungle_pt_sessions")).toBeNull();

    expectNoConsoleErrors(errors);
  });

  test("completing the screen unlocks it, and the session records which gate let it through", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "Health Screen");

    await page.selectOption("#parq-client", { label: "Sarah Chen" });
    await completeScreen(page);

    // The ledger got a row, and it carries BOTH dates: the day it was taken and
    // the instant it was written.
    const records = await stored(page, "jungle_parq_records");
    expect(records).toHaveLength(1);
    expect(records[0].memberId).toBe("m0");
    expect(Object.values(records[0].answers).every(v => v === false)).toBe(true);
    expect(records[0].recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await expect(page.getByTestId("pt-parq-state")).toContainText("Cleared");

    await page.fill("#pt-date", day(3));
    await page.fill("#pt-plan-name", "Pull strength");
    await page.getByRole("button", { name: "Plan session" }).click();

    const sessions = await stored(page, "jungle_pt_sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].planName).toBe("Pull strength");
    expect(sessions[0].date).toBe(day(3));
    expect(sessions[0].status).toBe("planned");
    // WHICH assurance let this through, kept with the row. "cleared" and
    // "gp_cleared" are different claims and a year from now that is the whole
    // question.
    expect(sessions[0].parqStateAtAssign).toBe("cleared");

    expectNoConsoleErrors(errors);
  });

  test("a flagged answer refers to a doctor and keeps the gate shut until a clearance is recorded", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "Health Screen");

    await page.selectOption("#parq-client", { label: "Sarah Chen" });
    await completeScreen(page, ["Bone or joint problem"]);

    const onFile = page.getByTestId("parq-on-file");
    await expect(onFile).toContainText("Doctor first");
    // Nobody fails a PAR-Q, and the copy must not say they did.
    await expect(onFile).not.toContainText(/fail|unfit/i);
    await expect(onFile).toContainText("Bone or joint problem");

    // Still locked on the 1:1 screen…
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await expect(page.getByTestId("pt-plan-locked")).toBeVisible();
    expect(await stored(page, "jungle_pt_sessions")).toBeNull();

    // …until the doctor's answer is recorded, with a date.
    await nav(page, "Health Screen");
    await page.selectOption("#parq-client", { label: "Sarah Chen" });
    await page.fill("#parq-clearance-date", day(0));
    await page.fill("#parq-clearance-note", "Cleared for resistance training");
    await page.getByRole("button", { name: "Record clearance" }).click();

    // Appended, never edited onto the old row: the answers survive beside it.
    const records = await stored(page, "jungle_parq_records");
    expect(records).toHaveLength(2);
    expect(records[0].clearance).toBeNull();
    expect(records[1].clearance.grantedAt).toBe(day(0));
    expect(records[1].answers.q5).toBe(true);

    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await expect(page.getByTestId("pt-parq-state")).toContainText("Cleared by doctor");
    await page.fill("#pt-date", day(2));
    await page.getByRole("button", { name: "Plan session" }).click();

    const sessions = await stored(page, "jungle_pt_sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].parqStateAtAssign).toBe("gp_cleared");

    expectNoConsoleErrors(errors);
  });

  test("a part-answered screen is refused and nothing is written", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "Health Screen");
    await page.selectOption("#parq-client", { label: "Sarah Chen" });

    await page.getByRole("button", { name: "No — Heart condition", exact: true }).click();
    await page.getByRole("button", { name: "Save health screen" }).click();

    await expect(page.getByRole("alert")).toContainText("still unanswered");
    expect(await stored(page, "jungle_parq_records")).toBeNull();

    expectNoConsoleErrors(errors);
  });

  test("an expired screen locks the gate again", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    // Thirteen months ago — past the twelve-month validity, relative to today so
    // the fixture cannot rot.
    await page.evaluate((screenedAt) => {
      const clean = ["q1","q2","q3","q4","q5","q6","q7"].reduce((a, k) => { a[k] = false; return a; }, {});
      localStorage.setItem("jungle_parq_records", JSON.stringify([
        { id: "p0", memberId: "m0", screenedAt, answers: clean, clearance: null,
          screenedBy: "Dylan", recordedAt: new Date().toISOString() },
      ]));
    }, day(-400));
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();

    await expect(page.getByTestId("pt-parq-state")).toContainText("Expired");
    await expect(page.getByTestId("pt-plan-locked")).toBeVisible();
    expect(await stored(page, "jungle_pt_sessions")).toBeNull();

    expectNoConsoleErrors(errors);
  });

  // ─── D4 · the cliff has a warning in front of it now ──────────────────────
  test("a screen about to expire warns without blocking", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    // Screened eleven and a half months ago: ~15 days of validity left, inside
    // the 30-day warning window. Relative to today, so the fixture cannot rot.
    await page.evaluate((screenedAt) => {
      const clean = ["q1","q2","q3","q4","q5","q6","q7"].reduce((a, k) => { a[k] = false; return a; }, {});
      localStorage.setItem("jungle_parq_records", JSON.stringify([
        { id: "p0", memberId: "m0", screenedAt, answers: clean, clearance: null,
          screenedBy: "Dylan", recordedAt: new Date().toISOString() },
      ]));
    }, day(-350));
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");

    // The list chip carries it, so a coach sees it while scanning rather than
    // only after opening the client.
    await expect(page.getByTestId("pt-parq-chip").first()).toContainText("expires in");

    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    // 🔴 The load-bearing half: still cleared, still programmable. A warning
    // that blocked would just move the cliff thirty days earlier.
    await expect(page.getByTestId("pt-parq-state")).toContainText("Cleared");
    await expect(page.getByTestId("pt-plan-locked")).toHaveCount(0);
    await expect(page.getByTestId("pt-parq-state")).toContainText("expires in");

    expectNoConsoleErrors(errors);
  });
});

test.describe("planned sessions", () => {
  // ── D6 · the four fields that had no way in ────────────────────────────────
  //
  // 🔴 `updatePtClient` accepted `goal`, `coachName`, `notes` and `startedAt`
  // from the day it was written, and the app's only call sent `{ status }`. So a
  // goal typed once at add time was permanent, and `coachName` and `notes` were
  // stored fields no screen rendered. `storeWriters.test.js` proves a CALL SITE
  // exists; it cannot prove the form works. This drives it and reads the STORED
  // row, which is the repo rule and the only thing that separates "a control was
  // added" from "a control writes what it says it writes".
  test("every detail a 1:1 client carries can be corrected, and it is what gets stored", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();

    // POSITIVE CONTROL. The panel is really on screen, showing the seeded goal
    // and saying — in words, not as a blank — what is not recorded yet.
    const details = page.getByTestId("pt-details");
    await expect(details).toContainText("First pull-up");
    await expect(details).toContainText("Nobody named");
    await expect(details).toContainText("No start date recorded");

    await page.getByRole("button", { name: "Edit details" }).click();
    await page.locator("#pt-edit-goal").fill("First strict pull-up");
    await page.locator("#pt-edit-coach").fill("Mara K.");
    await page.locator("#pt-edit-started").fill(day(-30));
    await page.locator("#pt-edit-notes").fill("Left shoulder — keep overhead volume low.");
    await page.getByRole("button", { name: "Save details" }).click();

    // 🔴 THE STORED ROW. All four, in one write.
    const clients = await stored(page, "jungle_pt_clients");
    expect(clients).toHaveLength(1);
    expect(clients[0].goal).toBe("First strict pull-up");
    expect(clients[0].coachName).toBe("Mara K.");
    expect(clients[0].startedAt).toBe(day(-30));
    expect(clients[0].notes).toBe("Left shoulder — keep overhead volume low.");
    // The relationship itself is untouched: an edit is not a status change.
    expect(clients[0].status).toBe("active");
    expect(clients[0].memberId).toBe("m0");

    // And the panel reads back what was written, rather than the form's own state.
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await expect(page.getByTestId("pt-details")).toContainText("First strict pull-up");
    await expect(page.getByTestId("pt-details")).toContainText("Mara K.");

    expectNoConsoleErrors(errors);
  });

  // ⚠️ The bug an `editing` boolean produces, pinned so it cannot come back: the
  // form is keyed on the CLIENT ID, so clicking a different person while editing
  // must not offer the first person's values under the second person's name.
  test("an open edit form does not follow you onto another client", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    // A second client, so there is somewhere else to click.
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem("jungle_pt_clients"));
      list.push({ id: "c1", memberId: "m1", goal: "Deadlift 100kg", status: "active", startedAt: "" });
      localStorage.setItem("jungle_pt_clients", JSON.stringify(list));
    });
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");

    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.locator("#pt-edit-goal").fill("EDITED BUT NEVER SAVED");

    // Switch client. The form must close, not travel.
    await page.getByRole("button", { name: /^Marcus Lee/ }).click();
    await expect(page.locator("#pt-edit-goal")).toHaveCount(0);
    await expect(page.getByTestId("pt-details")).toContainText("Deadlift 100kg");
    await expect(page.getByTestId("pt-details")).not.toContainText("EDITED BUT NEVER SAVED");

    // And nothing was written by abandoning the form.
    const clients = await stored(page, "jungle_pt_clients");
    expect(clients.find(c => c.id === "c0").goal).toBe("First pull-up");

    expectNoConsoleErrors(errors);
  });

  test("a session is marked done, and removing a planned one can be undone", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await page.evaluate(() => {
      const clean = ["q1","q2","q3","q4","q5","q6","q7"].reduce((a, k) => { a[k] = false; return a; }, {});
      localStorage.setItem("jungle_parq_records", JSON.stringify([
        { id: "p0", memberId: "m0", screenedAt: new Date().toISOString().slice(0, 10),
          answers: clean, clearance: null, screenedBy: "Dylan", recordedAt: new Date().toISOString() },
      ]));
    });
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();

    await page.fill("#pt-date", day(4));
    await page.fill("#pt-plan-name", "Pull strength");
    await page.getByRole("button", { name: "Plan session" }).click();
    await expect.poll(async () => (await stored(page, "jungle_pt_sessions"))?.length).toBe(1);

    // Marking done is not destructive and toggles back — that IS the undo.
    await page.getByRole("button", { name: "Mark Pull strength as delivered" }).click();
    expect((await stored(page, "jungle_pt_sessions"))[0].status).toBe("done");
    await page.getByRole("button", { name: "Mark Pull strength as not delivered" }).click();
    expect((await stored(page, "jungle_pt_sessions"))[0].status).toBe("planned");

    // Removing a planned session offers an undo that restores the PRIOR LIST.
    await page.getByRole("button", { name: "Remove Pull strength" }).click();
    expect(await stored(page, "jungle_pt_sessions")).toEqual([]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await stored(page, "jungle_pt_sessions"))?.length).toBe(1);

    expectNoConsoleErrors(errors);
  });
});

// ── The sweeps that an empty screen would pass trivially ─────────────────────
//
// `mobile.spec.js` visits both of these screens on a FRESH app, where the only
// marked controls are the back arrow and the header avatar. The fourteen Yes/No
// buttons — fourteen controls eight pixels apart, which is exactly the geometry
// index.css warns overlapping hit areas about — do not exist there.
test("the health screen's answer buttons are thumb-sized and do not steal each other's hit area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshApp(page);
  await seedUnscreenedClient(page);
  await navAnyWidth(page, PARQ);
  await page.selectOption("#parq-client", { label: "Sarah Chen" });

  // POSITIVE CONTROL — the questions really rendered. A tap scan of a screen
  // showing only a picker reports a clean sweep of nothing.
  const yes = page.getByRole("button", { name: /^Yes — / });
  expect(await yes.count(), "the seven questions did not render — this scan is measuring nothing").toBe(7);

  // 44px in the box, not via a `data-tap` overlay: see the note at the control.
  const boxes = await yes.evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  for (const h of boxes) expect(h).toBeGreaterThanOrEqual(44);

  const scan = await tapScan(page);
  expect(scan.misses, reportTaps("Health Screen with questions at 390px", scan)).toEqual([]);
});

test("the 1:1 screen's session row survives a thumb at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshApp(page);
  await seedUnscreenedClient(page);
  await page.evaluate(() => {
    const clean = ["q1","q2","q3","q4","q5","q6","q7"].reduce((a, k) => { a[k] = false; return a; }, {});
    localStorage.setItem("jungle_parq_records", JSON.stringify([
      { id: "p0", memberId: "m0", screenedAt: new Date().toISOString().slice(0, 10),
        answers: clean, clearance: null, screenedBy: "Dylan", recordedAt: new Date().toISOString() },
    ]));
    localStorage.setItem("jungle_pt_sessions", JSON.stringify([
      { id: "s0", clientId: "c0", memberId: "m0", date: "2099-01-01", planName: "Pull strength",
        stages: [{ id: "st0", name: "Warm-Up", dur: 300, exercises: [{ n: "Light Jog" }] }],
        notes: "", status: "planned", parqStateAtAssign: "cleared", createdAt: new Date().toISOString() },
    ]));
  });
  await page.reload();
  await waitForAppAnyWidth(page);
  await navAnyWidth(page, PT);
  await page.getByRole("button", { name: /^Sarah Chen/ }).click();

  // POSITIVE CONTROL: the row's two icon controls — the tightest cluster on this
  // screen — are actually on the page.
  await expect(page.getByRole("button", { name: "Mark Pull strength as delivered" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Pull strength" })).toBeVisible();

  const scan = await tapScan(page);
  expect(scan.misses, reportTaps("1:1 Clients with a session at 390px", scan)).toEqual([]);
});

// ─── D5 · health answers are not collected without a consent trail ───────────
//
// The store refuses too (`ptStore.test.js`), because a gate that lives only in
// JSX is one the next caller walks through. This drives the surface: the notice
// is on screen, the tick is required, and — per the repo rule — the assertion is
// on the STORED object, not only on what was rendered.
test.describe("health-screen consent", () => {
  test("refuses to record health answers until the client agrees", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "Health Screen");
    await page.selectOption("#parq-client", { label: "Sarah Chen" });

    // The notice is actually on the page. A consent record whose notice was
    // never shown is the fabricated compliance record this change exists to
    // avoid, so the words being present is part of the assertion.
    await expect(page.getByTestId("parq-consent")).toContainText("These are health answers");

    for (const short of ["Heart condition", "Chest pain when active", "Chest pain at rest",
                         "Dizziness or blackouts", "Bone or joint problem",
                         "Blood-pressure or heart medication", "Any other reason"]) {
      await page.getByRole("button", { name: `No — ${short}`, exact: true }).click();
    }
    // Every question answered, consent NOT ticked.
    const box = page.getByTestId("parq-consent").locator("input[type=checkbox]");
    await expect(box).not.toBeChecked();
    await page.getByRole("button", { name: "Save health screen" }).click();

    await expect(page.getByRole("alert")).toContainText("agree");
    // Nothing written. This is the assertion that matters — a screen that shows
    // a refusal and writes the row anyway would pass a render-only test.
    expect(await stored(page, "jungle_parq_records")).toBeNull();

    // 🔴 THE CONTROL. Without this the test above passes on a form that is
    // broken for some entirely different reason, which is how a "nothing was
    // written" assertion goes green by accident.
    await box.check();
    await page.getByRole("button", { name: "Save health screen" }).click();
    const records = await stored(page, "jungle_parq_records");
    expect(records).toHaveLength(1);
    expect(records[0].consent.grantedAt).toBe(day(0));
    expect(records[0].consent.method).toBe("explicit_opt_in");
    expect(records[0].consent.policyVersion).toBe("parq-v1");

    expectNoConsoleErrors(errors);
  });

  test("the consent box is reachable and operable by keyboard", async ({ page }) => {
    // Session 27 found the Brand Studio's three skin presets were `<div onClick>`
    // — unreachable by keyboard, and invisible to `keyboard.spec.js` because a
    // div has no role. A consent control a keyboard user cannot reach is a
    // consent nobody can give, so this drives it with the keyboard only.
    const errors = watchConsole(page);
    await freshApp(page);
    await seedUnscreenedClient(page);
    await nav(page, "Health Screen");
    await page.selectOption("#parq-client", { label: "Sarah Chen" });

    const box = page.getByTestId("parq-consent").locator("input[type=checkbox]");
    await expect(box).toHaveCount(1);
    await box.focus();
    await expect(box).toBeFocused();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();

    expectNoConsoleErrors(errors);
  });
});

// ─── D7 · the orphan a PDPA erasure left behind ──────────────────────────────
//
// `ptClientRows` has computed `orphan: !member` since this screen shipped and the
// list has always rendered it honestly as "Member record deleted". What it could
// not do was ACT on it: erasure cascades `attendance` and knows nothing about the
// three local 1:1 ledgers, so the gym had deleted the person and kept their goal,
// their session history and their seven health answers, with no path to any of it.
//
// 🔴 BOTH DIALOG PATHS ARE DRIVEN, and that is not optional here. Playwright
// AUTO-DISMISSES dialogs, so a test that clicks "Erase" and asserts the row is
// gone is exercising CANCEL — and would pass just as happily against a build with
// no confirm at all. The cancel path is asserted first, on the STORED object, so
// the accept path cannot be read as "something happened".
test.describe("erasing a 1:1 record whose member was deleted (D7)", () => {
  // A client, two health screens and two sessions — and NO member row, which is
  // what an erasure that reached `members` and stopped there leaves behind.
  async function seedOrphan(page) {
    await freshApp(page);
    await page.evaluate((d) => {
      localStorage.setItem("jungle_members", JSON.stringify([
        { id: "m9", name: "Marcus Lee", email: "marcus@example.com", status: "active" },
      ]));
      localStorage.setItem("jungle_pt_clients", JSON.stringify([
        { id: "c0", memberId: "gone", goal: "First pull-up", status: "active", startedAt: d.past },
        { id: "c1", memberId: "m9", goal: "Back squat", status: "active", startedAt: d.past },
      ]));
      localStorage.setItem("jungle_parq_records", JSON.stringify([
        { id: "p0", memberId: "gone", screenedAt: d.past, answers: {}, clearance: null },
        { id: "p1", memberId: "gone", screenedAt: d.recent, answers: {}, clearance: null },
        { id: "p2", memberId: "m9",   screenedAt: d.recent, answers: {}, clearance: null },
      ]));
      localStorage.setItem("jungle_pt_sessions", JSON.stringify([
        { id: "s0", clientId: "c0", memberId: "gone", date: d.soon, planName: "1:1 session", status: "planned" },
        { id: "s1", clientId: "c0", memberId: "gone", date: d.soon, planName: "1:1 session", status: "planned" },
        { id: "s2", clientId: "c1", memberId: "m9",   date: d.soon, planName: "1:1 session", status: "planned" },
      ]));
    }, { past: day(-200), recent: day(-10), soon: day(3) });
    await page.reload();
    await waitForAppAnyWidth(page);
    await nav(page, "1:1 Clients");
  }

  // 🔴 The orphan sorted to the TOP of the coach's day. `_byCoachDay` fell
  // through to `localeCompare` on `name`, an orphan's name is "", and "" sorts
  // before every real name — so on a screen a trainer opens daily, the one row
  // they can only erase sat above every client they are actually training.
  test("the orphan is the LAST row, not the first one a coach reads", async ({ page }) => {
    await seedOrphan(page);

    // POSITIVE CONTROL: both rows really rendered, and this fixture really is
    // the case that produced the defect — same status, same booked date, so the
    // name tiebreak is what decides the order.
    const list = page.getByTestId("pt-list").getByRole("button");
    await expect(list).toHaveCount(2);
    const names = await list.evaluateAll(els => els.map(e => e.textContent || ""));
    expect(names.some(n => n.includes("Marcus Lee")), names.join(" | ")).toBe(true);
    expect(names.some(n => n.includes("Member record deleted")), names.join(" | ")).toBe(true);

    // What shipped: "Member record deleted" was names[0].
    expect(names[0]).toContain("Marcus Lee");
    expect(names[1]).toContain("Member record deleted");

    // …and the list says where it put them, rather than leaving a coach to
    // notice that one row moved.
    await expect(page.getByTestId("pt-list"))
      .toContainText("Records whose member was deleted sit at the bottom");
  });

  test("and a gym with no erased record is not told about erased records", async ({ page }) => {
    await seedOrphan(page);
    // Erase the orphan, which is the only one, and the sentence must go with it.
    await expect(page.getByTestId("pt-list"))
      .toContainText("Records whose member was deleted sit at the bottom");
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: /Member record deleted/ }).click();
    await page.getByTestId("pt-orphan-erase").getByRole("button", { name: /Erase/ }).click();
    await expect(page.getByRole("button", { name: /Member record deleted/ })).toHaveCount(0);
    await expect(page.getByTestId("pt-list"))
      .not.toContainText("Records whose member was deleted sit at the bottom");
  });

  test("the orphan says what happened, and offers the one action that fixes it", async ({ page }) => {
    const errors = watchConsole(page);
    await seedOrphan(page);

    // POSITIVE CONTROL. Both rows are really on screen — an empty list would
    // pass every assertion below trivially.
    await expect(page.getByRole("button", { name: /Member record deleted/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Marcus Lee — / })).toBeVisible();

    // 🔴 And the orphan row is selectable BY ITS OWN VISIBLE NAME, which is the
    // half this used to get wrong: the `aria-label` fell back to `r.name ||
    // "Client"`, and `r.name` is "" for precisely this row, so a screen reader
    // announced "Client" on the one row that means the client is gone.
    // Selecting it by text instead of by role would have hidden that.

    // The erase offer does NOT exist for the live client.
    await page.getByRole("button", { name: /^Marcus Lee — / }).click();
    await expect(page.getByTestId("pt-detail")).toBeVisible();
    await expect(page.getByTestId("pt-orphan-erase")).toHaveCount(0);

    // And it DOES for the orphan. Same locator, opposite answer, one run —
    // which is what makes the count above an assertion rather than a shrug.
    await page.getByRole("button", { name: /Member record deleted/ }).click();
    const panel = page.getByTestId("pt-orphan-erase");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("health answers are still here");

    expectNoConsoleErrors(errors);
  });

  test("CANCEL erases nothing — the dialog is a guard, not a formality", async ({ page }) => {
    const errors = watchConsole(page);
    await seedOrphan(page);
    await page.getByRole("button", { name: /Member record deleted/ }).click();

    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); d.dismiss(); });
    await page.getByRole("button", { name: /Erase this record permanently/ }).click();

    // The dialog NAMED what it would take, in both numbers. A confirm that says
    // "are you sure?" is a click-through, not a guard.
    expect(asked).toContain("2 sessions");
    expect(asked).toContain("2 health screens");
    expect(asked).toContain("cannot be undone");

    // 🔴 The STORED object, not the render. All three ledgers untouched.
    expect(await stored(page, "jungle_pt_clients")).toHaveLength(2);
    expect(await stored(page, "jungle_parq_records")).toHaveLength(3);
    expect(await stored(page, "jungle_pt_sessions")).toHaveLength(3);
    await expect(page.getByRole("button", { name: /Member record deleted/ })).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("ACCEPT takes the record, its sessions and its health answers — and nobody else's", async ({ page }) => {
    const errors = watchConsole(page);
    await seedOrphan(page);
    await page.getByRole("button", { name: /Member record deleted/ }).click();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Erase this record permanently/ }).click();

    await expect(page.getByRole("button", { name: /Member record deleted/ })).toHaveCount(0);

    // 🔴 The assertion this test exists for: the health answers are GONE from
    // storage. A screen that stopped rendering the row while leaving seven
    // health answers in localStorage would pass a render-only test and fail the
    // erasure request that prompted it.
    const parq = await stored(page, "jungle_parq_records");
    expect(parq).toHaveLength(1);
    expect(parq[0].memberId).toBe("m9");

    const clients = await stored(page, "jungle_pt_clients");
    expect(clients.map(c => c.id)).toEqual(["c1"]);
    const sessions = await stored(page, "jungle_pt_sessions");
    expect(sessions.map(s => s.id)).toEqual(["s2"]);

    // The live client is still there and still complete — an erasure that took a
    // neighbour would be a worse defect than the one it fixed.
    await expect(page.getByTestId("pt-summary")).toBeVisible();

    expectNoConsoleErrors(errors);
  });
});
