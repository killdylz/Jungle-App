import { test, expect } from "@playwright/test";
import { nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── Money on the at-risk panel ──────────────────────────────────────────────
//
// The feature is one number. The TEST is about the number's absence: this repo's
// standing rule is that a confident wrong number is worse than no number, and a
// revenue figure is the most quotable thing on any screen here — it is what gets
// screenshotted into a pitch. So the first test below is the load-bearing one.
// The priced path is the easy half; the unpriced path is what stops this drifting
// into a fabricated figure the first time someone "improves" the empty state.

const DAY = 86_400_000;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
const day = (d) => iso(d).slice(0, 10);

// Two lapsed members and one recent visitor. The recent visit is not decoration:
// the absence rule is gated on the STUDIO recording lately (retention.js's
// header), so without it nothing is flagged at all and every assertion below
// would pass vacuously against an empty panel — the "an empty screen passes every
// scan trivially" trap, which has bitten this repo twice.
const FIXTURE = {
  members: [
    { id: "m-lapsed-1", name: "Larry Tan",  email: "", status: "active", joinedAt: day(300), externalRef: "" },
    { id: "m-lapsed-2", name: "Gina Lim",   email: "", status: "active", joinedAt: day(300), externalRef: "" },
    { id: "m-recent",   name: "Rita Chua",  email: "", status: "active", joinedAt: day(300), externalRef: "" },
  ],
  attendance: [
    { id: "a1", classInstanceId: "c1", memberId: "m-lapsed-1", source: "coach", checkedInAt: iso(40) },
    { id: "a2", classInstanceId: "c2", memberId: "m-lapsed-2", source: "coach", checkedInAt: iso(30) },
    { id: "a3", classInstanceId: "c3", memberId: "m-recent",   source: "coach", checkedInAt: iso(1) },
  ],
};

async function seed(page, branding = { gymName: "The Garage" }) {
  await page.goto("./");
  await page.evaluate(([f, b]) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_members", JSON.stringify(f.members));
    localStorage.setItem("jungle_attendance", JSON.stringify(f.attendance));
    localStorage.setItem("jungle_gym_branding", JSON.stringify(b));
  }, [FIXTURE, branding]);
  await page.reload();
}

// Any currency symbol followed by digits. Deliberately broader than the fixture's
// own currency: a test that only looked for "S$" would pass while the screen
// rendered "£450", and the point of the unpriced assertion is that NO money
// appears — not that this particular spelling of it does not.
const ANY_MONEY = /(S\$|RM|HK\$|A\$|US\$|£|€|AED|₹|Rp|฿|₱)\s?[\d,]/;

test.describe("revenue at risk", () => {
  test("a gym with NO price set sees no money anywhere on the panel", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page);                      // branding has a name and no price
    await nav(page, "Members");

    // Control FIRST. Without it, a fixture that flagged nobody — a fixture one
    // stale date away — would make every assertion below true about an empty
    // panel, and this test would guard nothing.
    await expect(page.getByText("2 members need attention.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft a WhatsApp" })).toHaveCount(2);

    await expect(page.getByTestId("revenue-at-risk")).toHaveCount(0);

    // Not just the strip: no money in ANY form on the screen. A zero, a dash, a
    // "set a price to see revenue" nudge, or a per-flag figure would each pass a
    // check that only looked for the strip.
    const text = await page.locator("body").innerText();
    expect(text, "an unpriced gym must see no currency figure at all").not.toMatch(ANY_MONEY);
    expect(text).not.toMatch(/\/month at risk/);
    expect(text).not.toMatch(/\/mo\b/);

    expectNoConsoleErrors(errors);
  });

  test("a gym WITH a price sees the total and the arithmetic behind it", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page, { gymName: "The Garage", membershipPrice: "150", membershipCurrency: "SGD" });
    await nav(page, "Members");

    const strip = page.getByTestId("revenue-at-risk");
    await expect(strip).toBeVisible();
    // 2 lapsed members × S$150. The count must agree with the headline sentence
    // — a card that says "S$450" beside "3 members" is not one an owner quotes,
    // and that exact contradiction has shipped on this panel once already.
    await expect(strip).toContainText("S$300/month at risk");
    await expect(strip).toContainText("2 members × S$150/month");
    await expect(page.getByText("2 members need attention.")).toBeVisible();

    // Per flag, so the total is checkable row by row.
    await expect(page.getByText(/last in \d+ days ago · 1 visit · S\$150\/mo/).first()).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("handling a member takes their money off the total, not just their row", async ({ page }) => {
    await seed(page, { gymName: "The Garage", membershipPrice: "150" });
    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toContainText("S$300/month at risk");

    await page.getByRole("button", { name: /I.ve reached out/ }).first().click();

    await expect(page.getByTestId("revenue-at-risk")).toContainText("S$150/month at risk");
    await expect(page.getByTestId("revenue-at-risk")).toContainText("1 member × S$150/month");
    await expect(page.getByText("1 member needs attention.")).toBeVisible();

    // And when the last one is handled the strip goes away entirely rather than
    // reading "S$0/month at risk" — zero at risk is good news, and a money card
    // showing zero looks like a broken money card.
    await page.getByRole("button", { name: /I.ve reached out/ }).first().click();
    await expect(page.getByTestId("revenue-at-risk")).toHaveCount(0);
    await expect(page.getByText(/Every flagged member has been handled/)).toBeVisible();
  });

  test("the owner sets the price in Brand Studio and it reaches the panel", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page);
    await nav(page, "Brand Studio");

    await page.getByLabel("Membership price per month").fill("200");
    await page.getByLabel("Currency", { exact: true }).selectOption("MYR");

    // The STORED object, not only what was rendered. The input could be showing
    // "200" out of its own React state while the branding blob holds nothing.
    const branding = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_gym_branding") || "{}"));
    expect(branding.membershipPrice).toBe("200");
    expect(branding.membershipCurrency).toBe("MYR");
    expect(branding.gymName, "writing the price must not drop the gym name").toBe("The Garage");

    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toContainText("RM400/month at risk");

    expectNoConsoleErrors(errors);
  });

  test("clearing the price puts the panel back exactly as it was", async ({ page }) => {
    // The reverse trip matters as much as the forward one: an owner who decides
    // they do not want a revenue figure on screen during a members' meeting must
    // be able to remove it, and an emptied field must not read as a price of 0.
    await seed(page, { gymName: "The Garage", membershipPrice: "150" });
    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toBeVisible();

    await nav(page, "Brand Studio");
    await page.getByLabel("Membership price per month").fill("");
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_gym_branding") || "{}").membershipPrice)).toBe("");

    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(ANY_MONEY);
  });

  test("survives a reload — the price is stored, not held in a component", async ({ page }) => {
    await seed(page, { gymName: "The Garage", membershipPrice: "150" });
    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toContainText("S$300/month at risk");
    await page.reload();
    await nav(page, "Members");
    await expect(page.getByTestId("revenue-at-risk")).toContainText("S$300/month at risk");
  });

  test("no money beside a dash — a figure cannot sit next to 'we cannot tell'", async ({ page }) => {
    // 🔴 The state that produces it, found by reading `atRiskMembers` rather than by
    // any test: `retention.atRisk` is null while the studio is NOT RECORDING (no
    // check-in in 14 days), so the headline shows `—`. But rule 1
    // (`new_member_low_visits`) is gated on a known join date and NOT on recording,
    // so it still fires — the panel renders `—` above a flagged member. A confident
    // "S$150/month at risk" beside an explicit "we cannot tell" is the exact
    // self-contradiction this money is meant to avoid, and the more quotable half.
    const errors = watchConsole(page);
    await seed(page, { gymName: "The Garage", membershipPrice: "150" });
    // One member, joined 20 days ago (inside the first-month window, past the grace
    // period), one visit 20 days ago — so nothing is recent and the studio reads as
    // not recording.
    await page.evaluate(([joined, when]) => {
      localStorage.setItem("jungle_members", JSON.stringify(
        [{ id: "m-new", name: "Nadia Ismail", email: "", status: "active", joinedAt: joined, externalRef: "" }]));
      localStorage.setItem("jungle_attendance", JSON.stringify(
        [{ id: "a1", classInstanceId: "c1", memberId: "m-new", source: "coach", checkedInAt: when }]));
    }, [day(20), iso(20)]);
    await page.reload();
    await nav(page, "Members");

    // CONTROLS: this really is the not-recording state, and it really does flag
    // someone. Without both, "no money" would be true of an empty panel.
    await expect(page.getByText(/absence alerts are paused/)).toBeVisible();
    await expect(page.getByText(/Joined 20 days ago and has attended 1 time/)).toBeVisible();

    await expect(page.getByTestId("revenue-at-risk")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text, "a money figure appeared beside an unmeasurable headline").not.toMatch(ANY_MONEY);

    expectNoConsoleErrors(errors);
  });

  test("the profile modal's branding Save does not erase the price", async ({ page }) => {
    // The bug this pins is not hypothetical: ProfileModal's branding tab saved
    // its own six-field DRAFT as the whole branding blob, so pressing Save there
    // wiped any key set anywhere else. The symptom would have been a price that
    // "does not save", with no error and nothing in the console.
    await seed(page, { gymName: "The Garage", membershipPrice: "150" });

    await page.getByRole("button", { name: "Your profile and settings" }).click();
    await page.getByRole("button", { name: /Gym Branding/ }).click();
    await page.getByRole("button", { name: /Save Branding/i }).click();

    const branding = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_gym_branding") || "{}"));
    expect(branding.membershipPrice).toBe("150");
  });
});
