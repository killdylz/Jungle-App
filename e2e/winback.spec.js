import { test, expect } from "@playwright/test";
import { nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// Win-back drafts (LEGAL-AND-SECURITY §1). The legal design is the feature, so
// the tests are about the legal design: who gets offered a draft, what the link
// carries, and what opening one records.

const DAY = 86_400_000;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
const day = (d) => iso(d).slice(0, 10);

// Realistic "Firstname Lastname" shapes on purpose: the draft greets by FIRST
// name, so a fixture like "Lapsed Larry" would have the message open "Hi
// Lapsed!" and quietly pass a weaker assertion.
const FIXTURE = {
  members: [
    { id: "m-active", name: "Larry Tan", email: "", status: "active", joinedAt: day(200), externalRef: "" },
    // Membership ended: outside the ongoing-relationship exemption, so no draft.
    { id: "m-ended",  name: "Gina Lim",  email: "", status: "ended",  joinedAt: day(200), externalRef: "" },
    { id: "m-recent", name: "Rita Chua", email: "", status: "active", joinedAt: day(200), externalRef: "" },
  ],
  attendance: [
    { id: "a1", classInstanceId: "c1", memberId: "m-recent", source: "coach", checkedInAt: iso(1) },
    { id: "a2", classInstanceId: "c2", memberId: "m-active", source: "coach", checkedInAt: iso(30) },
    { id: "a3", classInstanceId: "c3", memberId: "m-ended",  source: "coach", checkedInAt: iso(40) },
  ],
};

async function seed(page) {
  await page.goto("./");
  await page.evaluate((f) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_members", JSON.stringify(f.members));
    localStorage.setItem("jungle_attendance", JSON.stringify(f.attendance));
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
  }, FIXTURE);
  await page.reload();
}

test.describe("win-back drafts", () => {
  test("offers a draft for a current member and refuses one for a lapsed member", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page);
    await nav(page, "Members");

    // Larry is active and absent → draftable.
    await expect(page.getByRole("button", { name: "Draft a WhatsApp" })).toHaveCount(1);

    // Gina is also absent, but her membership ended. The screen must say why
    // rather than silently omitting the button — a coach who sees nothing
    // assumes a bug; a coach who reads the reason learns the rule.
    await expect(page.getByText(/Membership isn't active/)).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("the link carries the message and no phone number", async ({ page }) => {
    await seed(page);
    await nav(page, "Members");

    // Intercept the popup rather than letting the run navigate to WhatsApp.
    const href = await page.evaluate(() => {
      let captured = null;
      window.open = (u) => { captured = u; return null; };
      const btn = [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Draft a WhatsApp");
      btn.click();
      return captured;
    });

    expect(href).toContain("https://wa.me/?text=");
    // Data minimisation: no recipient in the URL, because no number is stored.
    expect(href).not.toMatch(/wa\.me\/\d/);

    const msg = decodeURIComponent(href.split("text=")[1]);
    expect(msg).toContain("Larry");            // first name…
    expect(msg).not.toContain("Tan");          // …and not the surname
    expect(msg).toContain("The Garage");       // the gym signs it, not Jungle
    expect(msg).toMatch(/membership/i);        // the exemption rests on this
    expect(msg).not.toMatch(/\d+%|discount|offer/i); // never marketing
  });

  test("drafting a message records nothing — the ledger must mean what it says", async ({ page }) => {
    // A3 asks "do operators ACT on alerts?". If opening a draft counted as
    // acting, that number would measure clicks rather than outreach, and the one
    // metric this screen exists to produce would be worthless.
    await seed(page);
    await nav(page, "Members");

    await page.evaluate(() => {
      window.open = () => null;
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Draft a WhatsApp").click();
    });

    const actions = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_retention_actions") || "[]"));
    expect(actions).toHaveLength(0);

    // The explicit click is what records.
    await page.getByRole("button", { name: /I.ve reached out/ }).first().click();
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_retention_actions") || "[]"));
    expect(after).toHaveLength(1);
    expect(after[0].action).toBe("acted");
  });
});
