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
    const slice = body.slice(body.indexOf("Who’s slipping away"), body.indexOf("Who’s slipping away") + 700);
    expect(slice, "a member who came in this week is not slipping away").not.toContain("Regular Rita");

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
