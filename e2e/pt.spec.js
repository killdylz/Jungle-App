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

// Answer all seven, then save. `only` names the questions to answer YES.
async function completeScreen(page, only = []) {
  for (const short of ["Heart condition", "Chest pain when active", "Chest pain at rest",
                       "Dizziness or blackouts", "Bone or joint problem",
                       "Blood-pressure or heart medication", "Any other reason"]) {
    const word = only.includes(short) ? "Yes" : "No";
    await page.getByRole("button", { name: `${word} — ${short}`, exact: true }).click();
  }
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
});

test.describe("planned sessions", () => {
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
