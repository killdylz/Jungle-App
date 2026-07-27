import { test, expect } from "@playwright/test";
import { nav, watchConsole, expectNoConsoleErrors, stored } from "./helpers.js";

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
    // NOTE "ended" is NOT one of MEMBER_STATUSES (active/paused/cancelled) — it
    // is a legacy or imported value, and that is exactly what this row now
    // exercises. Since session 12 a `paused` or `cancelled` membership is not
    // flagged at all, so `winBackBlockedReason` no longer has an ordinary path
    // to it; what remains is this one — a status the vocabulary does not know,
    // arriving from a server row (`_rowToMember` passes status through raw).
    // Outside the ongoing-relationship exemption either way, so no draft.
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

// ── SWEEP (session 12) — the whole re-flag cycle, through the real UI ─────────
//
// `applyRetentionActions` carries the judgement call of the entire feature: when
// does a flag an operator already handled COME BACK? Suppressing forever means a
// member who lapses, is called, returns, and lapses again is never flagged the
// second time — which is exactly the case an operator most wants to know about.
// Re-flagging immediately makes the button useless. The rule is "suppressed
// until the member is SEEN AGAIN".
//
// That rule has unit tests, and it had never been driven. The tests above stop
// at the moment the action is recorded, which is the easy half — the hard half
// is a cycle that spans weeks, and it is unobservable without controlling the
// clock. `page.clock.setFixedTime` is what makes it a test rather than a story.
//
// The whole cycle runs against the REAL screen: the flag is raised by the real
// retention arithmetic, handled with the real button, closed by a real check-in
// through the Class Runner, and read back off the real roster.
const T = new Date(2026, 6, 27, 9, 0, 0);          // Monday, 9am — the coach phones
const at = (ms) => new Date(T.getTime() + ms);
const HOUR = 3_600_000;

test.describe("SWEEP — an actioned flag comes back when the member lapses again", () => {
  test("acted → returns to class → lapses again → flagged a second time", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(T);
    await page.goto("./");
    await page.evaluate((t) => {
      localStorage.clear();
      sessionStorage.setItem("jungle_pin_ok", "1");
      localStorage.setItem("jungle_members", JSON.stringify([
        { id: "m-larry", name: "Larry Tan", email: "", status: "active", joinedAt: "2025-01-05", externalRef: "" },
        // Keeps the studio "recording" — rule 2 is gated on it, and without a
        // current member the absence rule is correctly suppressed for everyone.
        { id: "m-rita",  name: "Rita Chua", email: "", status: "active", joinedAt: "2025-01-05", externalRef: "" },
      ]));
      localStorage.setItem("jungle_attendance", JSON.stringify([
        { id: "a1", classInstanceId: "c1", memberId: "m-larry", source: "coach",
          checkedInAt: new Date(t - 30 * 86400000).toISOString() },
        { id: "a2", classInstanceId: "c1", memberId: "m-rita", source: "coach",
          checkedInAt: new Date(t - 86400000).toISOString() },
      ]));
      localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
    }, T.getTime());
    await page.reload();

    // ── 1. Larry has lapsed. The arithmetic raises the flag. ────────────────
    await nav(page, "Members");
    await expect(page.getByText(/Last attended 30 days ago/)).toBeVisible();

    // ── 2. The coach phones him and says so. ───────────────────────────────
    await page.getByRole("button", { name: /I.ve reached out/ }).first().click();

    const ledger1 = await stored(page, "jungle_retention_actions");
    expect(ledger1).toHaveLength(1);
    expect(ledger1[0]).toMatchObject({ memberId: "m-larry", rule: "absence", action: "acted" });

    // Off the active list, onto the handled one — not deleted. The work stays visible.
    await expect(page.getByText(/Last attended 30 days ago/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /handled · 1/ })).toBeVisible();

    // ── 3. He comes to the evening class. A REAL check-in, not a seeded row. ─
    await page.clock.setFixedTime(at(9 * HOUR));   // same day, 6pm
    await page.reload();
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await page.getByRole("button", { name: "Larry Tan" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    const att = await stored(page, "jungle_attendance");
    expect(att.filter(a => a.memberId === "m-larry")).toHaveLength(2);

    // Seen today, so there is no flag at all to suppress or show.
    await nav(page, "Members");
    await expect(page.getByText(/Last attended/)).toHaveCount(0);

    // ── 4. Twenty days pass and he stops again. ────────────────────────────
    await page.clock.setFixedTime(at(20 * 86400000));
    await page.reload();
    // The gym is still running classes, so the absence rule stays live.
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await page.getByRole("button", { name: "Rita Chua" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await nav(page, "Members");

    // ── THE ASSERTION ──────────────────────────────────────────────────────
    // The flag is back, and it is ACTIVE. If July's phone call still suppressed
    // it, the operator would never learn that the member they saved has gone
    // quiet a second time — the single case this feature exists to catch.
    await expect(page.getByText(/Last attended 19 days ago/)).toBeVisible();
    await expect(page.getByRole("button", { name: /I.ve reached out/ })).toHaveCount(1);

    // Append-only: the ledger still holds July's action, unmutated. A "current
    // state" row would have been overwritten here, destroying the very history
    // that answers whether operators act on alerts (A3).
    const ledger2 = await stored(page, "jungle_retention_actions");
    expect(ledger2).toHaveLength(1);
    expect(ledger2[0].id).toBe(ledger1[0].id);
    expect(ledger2[0].occurredAt).toBe(ledger1[0].occurredAt);

    expectNoConsoleErrors(errors);
  });
});

// The same gate, on the real screen. The arithmetic is pinned by
// `retention.test.js`; this asserts the ROSTER a coach actually reads, because a
// rule that is right in the library and wrong on the screen is the shape this
// repo keeps finding.
test.describe("SWEEP — the at-risk list only names current members", () => {
  test("a paused and a cancelled membership are not called at-risk", async ({ page }) => {
    const errors = watchConsole(page);
    await page.clock.setFixedTime(T);
    await page.goto("./");
    await page.evaluate((t) => {
      localStorage.clear();
      sessionStorage.setItem("jungle_pin_ok", "1");
      const ago = d => new Date(t - d * 86400000).toISOString();
      localStorage.setItem("jungle_members", JSON.stringify([
        { id: "m-rita",  name: "Rita Chua",  email: "", status: "active",    joinedAt: "2025-01-05", externalRef: "" },
        { id: "m-larry", name: "Larry Tan",  email: "", status: "active",    joinedAt: "2025-01-05", externalRef: "" },
        // Away by agreement — injury, travel, a paused membership.
        { id: "m-pam",   name: "Pam Ong",    email: "", status: "paused",    joinedAt: "2025-01-05", externalRef: "" },
        // Gone. Not at risk of leaving; already left.
        { id: "m-cara",  name: "Cara Ng",    email: "", status: "cancelled", joinedAt: "2025-01-05", externalRef: "" },
      ]));
      localStorage.setItem("jungle_attendance", JSON.stringify([
        { id: "a1", classInstanceId: "c1", memberId: "m-rita",  source: "coach", checkedInAt: ago(1) },
        { id: "a2", classInstanceId: "c1", memberId: "m-larry", source: "coach", checkedInAt: ago(30) },
        { id: "a3", classInstanceId: "c1", memberId: "m-pam",   source: "coach", checkedInAt: ago(40) },
        { id: "a4", classInstanceId: "c1", memberId: "m-cara",  source: "coach", checkedInAt: ago(50) },
      ]));
      localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
    }, T.getTime());
    await page.reload();
    await nav(page, "Members");

    // Larry, and only Larry. Pam and Cara have been absent LONGER, so before the
    // gate they outranked him and led the list an owner reads first.
    await expect(page.getByText(/1 member needs attention/)).toBeVisible();
    await expect(page.getByRole("button", { name: /I.ve reached out/ })).toHaveCount(1);
    await expect(page.getByText(/Last attended 30 days ago/)).toBeVisible();
    await expect(page.getByText(/Last attended 40 days ago/)).toHaveCount(0);
    await expect(page.getByText(/Last attended 50 days ago/)).toHaveCount(0);

    // They are still ON the roster — nothing is hidden or deleted, they are just
    // not described as at risk of leaving.
    await expect(page.getByText("Pam Ong")).toBeVisible();
    await expect(page.getByText("Cara Ng")).toBeVisible();

    expectNoConsoleErrors(errors);
  });
});
