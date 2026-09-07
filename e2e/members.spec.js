import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// REGRESSION-PLAN §1, test 4 — at-risk consistency.
//
// Session 4 shipped a card reading "2" beside a list of 3 flagged members. Both
// numbers came from the same engine; the UI derived them twice and the two
// derivations disagreed. Unit tests covered retentionSummary and passed — the
// defect only existed where the screen met the data, which is exactly the seam
// a unit test cannot reach.
//
// The fixture is seeded into localStorage rather than clicked in, so the dates
// are controlled: an absence rule that depends on "14 days ago" cannot be
// exercised by a test that can only create check-ins for today.

const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const day = (daysAgo) => iso(daysAgo).slice(0, 10);

// Three members whose flags are known by construction:
//   Regular  — checked in yesterday. Not at risk.
//   Lapsed   — last seen 30 days ago. ABSENCE.
//   Quiet    — joined 20 days ago, one visit. NEW_MEMBER_LOW_VISITS.
// Regular's recent check-in is load-bearing: the absence rule is gated on the
// studio actually recording attendance, so without it the screen correctly
// reports "not recording" and flags nobody.
const FIXTURE = {
  members: [
    { id: "m-regular", name: "Regular Rita",  email: "", status: "active", joinedAt: day(200), externalRef: "" },
    { id: "m-lapsed",  name: "Lapsed Larry",  email: "", status: "active", joinedAt: day(200), externalRef: "" },
    { id: "m-quiet",   name: "Quiet Quinn",   email: "", status: "active", joinedAt: day(20),  externalRef: "" },
  ],
  attendance: [
    { id: "a1", classInstanceId: "c1", memberId: "m-regular", source: "coach", checkedInAt: iso(1) },
    { id: "a2", classInstanceId: "c2", memberId: "m-regular", source: "coach", checkedInAt: iso(4) },
    { id: "a3", classInstanceId: "c3", memberId: "m-lapsed",  source: "coach", checkedInAt: iso(30) },
    { id: "a4", classInstanceId: "c4", memberId: "m-quiet",   source: "coach", checkedInAt: iso(18) },
  ],
};

async function seedRoster(page) {
  await page.goto("./");
  await page.evaluate((f) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_members", JSON.stringify(f.members));
    localStorage.setItem("jungle_attendance", JSON.stringify(f.attendance));
  }, FIXTURE);
  await page.reload();
}

test.describe("Members — the owner's morning number", () => {
  test("the at-risk headline equals the number of rows it is summarising", async ({ page }) => {
    const errors = watchConsole(page);
    await seedRoster(page);
    await nav(page, "Members");

    await expect(page.getByText("Who’s slipping away")).toBeVisible();
    const body = await page.locator("body").innerText();

    // THREE numbers have to agree, and the session-4 defect was two of them
    // disagreeing: the badge beside the heading, the sentence under it, and the
    // rows themselves. Each flagged row carries a "last in N days ago · N visit"
    // line, so counting those counts the list independently of either number.
    const sentence = Number(body.match(/(\d+)\s+members?\s+need attention/i)?.[1]);
    const rows = (body.match(/last in .*? ago · \d+ visit/g) || []).length;

    expect(rows, "flagged rows rendered").toBe(2);
    expect(sentence, "the sentence must agree with the rows it summarises").toBe(rows);

    // Named explicitly: a count can be right while the list names the wrong
    // people. Rita has been in this week and must not be on it.
    expect(body).toContain("Lapsed Larry");
    expect(body).toContain("Quiet Quinn");
    // ⚠️ Read from the PANEL, not from a fixed-width window of body text. This
    // was `body.slice(indexOf("Who’s slipping away"), +700)`, which only worked
    // while the next 700 characters happened to be the CSV panel's prose. Moving
    // the roster above that panel put every member's name — Rita included —
    // inside the window, and the test failed on its own selector rather than on
    // the thing it tests. The claim was always "Rita is not in the at-risk
    // panel"; now that is what it asks.
    const atRisk = await page.getByTestId("at-risk-panel").innerText();
    expect(atRisk, "the panel under test rendered").toContain("Who’s slipping away");
    expect(atRisk, "a member who came in this week is not slipping away").not.toContain("Regular Rita");

    // The per-flag "why", with its numbers — an owner acts on the reason, not a
    // label, and this is the sentence they act on.
    expect(body).toMatch(/fewer than 4 in their first month/);

    expectNoConsoleErrors(errors);
  });

  test("says nothing about risk when it has nothing to measure", async ({ page }) => {
    // The honest-blank rule at the surface that matters most commercially: an
    // owner must never be shown a reassuring "0 at risk" that only means "no
    // data". retentionSummary returns null for exactly this, and this asserts
    // the screen respects it.
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\b0 (members? )?at risk\b/i);

    expectNoConsoleErrors(errors);
  });
});

// ── M1: Members CRUD ─────────────────────────────────────────────────────────
// The roster could be read and added to, never corrected. A name misspelled
// during a mid-class check-in was permanent, and there was no way to record that
// someone had left — so the members count included people who quit months ago,
// and the at-risk list kept flagging them.
//
// Driven through the UI and asserted on the STORED object, because a form that
// renders the right thing and persists the wrong thing is this repo's recurring
// shape (the Builder's class was never persisted at all until session 5).
test.describe("Members — editing the roster", () => {
  const seedRoster = (page, members) =>
    page.evaluate(m => localStorage.setItem("jungle_members", JSON.stringify(m)), members);

  const stored = (page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem("jungle_members") || "[]"));

  test("corrects a misspelled name and persists it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page, [
      { id: "m1", name: "Ada Lovelacce", email: "ada@example.com", status: "active", joinedAt: "2026-01-05", externalRef: "" },
    ]);
    await page.reload();
    await nav(page, "Members");

    await page.getByRole("button", { name: /Edit Ada/ }).click();
    const name = page.getByPlaceholder("Name", { exact: true });
    await name.fill("Ada Lovelace");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const rows = await stored(page);
    expect(rows[0].name).toBe("Ada Lovelace");
    // A patch, not a replace: the fields the form did not touch must survive.
    expect(rows[0].email).toBe("ada@example.com");
    expect(rows[0].joinedAt).toBe("2026-01-05");
    expect(rows[0].id).toBe("m1");

    expectNoConsoleErrors(errors);
  });

  test("the status dropdown offers only values the database accepts", async ({ page }) => {
    // members.status is CHECK-constrained to ('active','paused','cancelled').
    // This dropdown is precisely where a rejected value would be born, and a
    // rejected write fails silently — the repo's most expensive bug class.
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page, [{ id: "m1", name: "Ada", email: "", status: "active", joinedAt: "", externalRef: "" }]);
    await page.reload();
    await nav(page, "Members");

    await page.getByRole("button", { name: /Edit Ada/ }).click();
    const values = await page.locator("select").first().locator("option").evaluateAll(
      (opts) => opts.map((o) => o.value));
    expect(values).toEqual(["active", "paused", "cancelled"]);

    expectNoConsoleErrors(errors);
  });

  test("marking someone as left takes them out of the active count, and keeps them", async ({ page }) => {
    // The number an owner reads as "how big is my gym" must be able to go DOWN.
    // Nothing is deleted: attendance.member_id cascades, so a delete would
    // destroy the history the retention analytics are computed from.
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page, [
      { id: "m1", name: "Ada", email: "", status: "active", joinedAt: "", externalRef: "" },
      { id: "m2", name: "Sam", email: "", status: "active", joinedAt: "", externalRef: "" },
    ]);
    await page.reload();
    await nav(page, "Members");
    await expect(page.getByText(/Roster · 2/)).toBeVisible();

    await page.getByRole("button", { name: /Edit Ada/ }).click();
    await page.locator("select").first().selectOption("cancelled");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(/Roster · 1/)).toBeVisible();
    await expect(page.getByText(/1 not active/)).toBeVisible();

    const rows = await stored(page);
    expect(rows).toHaveLength(2);                                   // kept, not deleted
    expect(rows.find(r => r.id === "m1").status).toBe("cancelled");
    expect(rows.find(r => r.id === "m2").status).toBe("active");

    expectNoConsoleErrors(errors);
  });

  test("adds a member with only a name", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByPlaceholder("Name (required)").fill("Grace Hopper");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const rows = await stored(page);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Grace Hopper");
    expect(rows[0].status).toBe("active");
    expect(rows[0].id).toBeTruthy();

    expectNoConsoleErrors(errors);
  });

  test("refuses to blank a name, and leaves the roster untouched", async ({ page }) => {
    // A nameless member cannot be found in the check-in list or searched for.
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page, [{ id: "m1", name: "Ada", email: "", status: "active", joinedAt: "", externalRef: "" }]);
    await page.reload();
    await nav(page, "Members");

    await page.getByRole("button", { name: /Edit Ada/ }).click();
    await page.getByPlaceholder("Name", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(/needs a name/i)).toBeVisible();
    expect((await stored(page))[0].name).toBe("Ada");

    expectNoConsoleErrors(errors);
  });
});

// ── §2.4 — manual add exists three times over, and nothing said so ───────────
//
// This is a DISCOVERABILITY defect, not a missing feature. Add member, the
// inline row edit and the mid-class quick-add were all shipped and all worked;
// what an owner met on opening Members was an "Import attendance history" panel
// with a file picker, rendered above the roster, with the Add member button
// below the fold on a laptop.
//
// ⚠️ Every string these tests look for was present on the broken screen too.
// The defect was ORDER, so these assert geometry and the position of a route
// within a sentence — a `toBeVisible` on "Add member" passed before this change
// and would pass again if it were reverted.
test.describe("adding a member by hand is findable", () => {
  for (const [state, seed] of [
    ["an empty roster", async (page) => { await freshApp(page); }],
    ["a seeded roster", async (page) => { await seedRoster(page); }],
  ]) {
    test(`the roster sits above the CSV import — ${state}`, async ({ page }) => {
      const errors = watchConsole(page);
      await seed(page);
      await nav(page, "Members");

      // Positive control. An empty screen satisfies any ordering claim
      // trivially, and this repo has been fooled by exactly that twice.
      const roster = page.getByTestId("roster-panel");
      const csv = page.getByTestId("csv-import-panel");
      await expect(roster).toBeVisible();
      await expect(csv).toBeVisible();

      const rosterBox = await roster.boundingBox();
      const csvBox = await csv.boundingBox();
      expect(rosterBox).not.toBeNull();
      expect(csvBox).not.toBeNull();
      expect(rosterBox.y).toBeLessThan(csvBox.y);

      // The button is in the panel that comes first, not merely somewhere.
      await expect(roster.getByRole("button", { name: "Add member", exact: true })).toBeVisible();

      expectNoConsoleErrors(errors);
    });
  }

  test("the empty state names the button above it before the import below it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    const empty = page.getByTestId("roster-panel").getByText(/No members yet/);
    await expect(empty).toBeVisible();

    const copy = await empty.innerText();
    // The manual route is named, and named FIRST. The old copy opened with
    // "Import a CSV above" and never mentioned the button at all.
    expect(copy).toContain("Add member");
    expect(copy.indexOf("Add member")).toBeLessThan(copy.search(/import/i));

    // And the direction it gives is the direction the screen is now in. This is
    // the assertion that fails if the panels are reordered without the copy.
    expect(copy).toMatch(/import your old attendance history below/i);
    const rosterBox = await page.getByTestId("roster-panel").boundingBox();
    const csvBox = await page.getByTestId("csv-import-panel").boundingBox();
    expect(csvBox.y).toBeGreaterThan(rosterBox.y);

    expectNoConsoleErrors(errors);
  });
});
