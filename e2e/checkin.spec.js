import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The check-in sweep, once the roster is old enough to have losses ─────────
//
// Found by asking session 19's question of a different screen: what does this
// look like once it has DATA? The Coaches sweep asked it about accessible names.
// This one asks it about the roster itself, and the answer was that the panel a
// coach taps through mid-class had no view on membership status at all.
//
// Three places in this app model that status, carefully:
//   · `retention.js` refuses to flag a paused or cancelled member, with a
//     comment explaining why for each status.
//   · `RosterScreen` counts only active members — "including cancelled members
//     makes it a flattering [number]" — and dims the rest behind a "Left" badge.
//   · `CheckInPanel` rendered `store.getMembers()` unfiltered.
//
// So an owner read `Roster · 1` on the Members screen, opened the Runner, and
// was offered three identical full-brightness names. Tapping the one who left
// two years ago wrote a real attendance row — for a member the retention engine
// then deliberately declines to analyse. The row is written and never read.
//
// The cost that actually matters is P6, the design law this panel exists to
// serve: under five seconds per member. That budget is spent SCANNING, and the
// list only grows — so the sweep gets slower exactly as the gym gets older and
// its roster gets more valuable.
//
// ⚠️ WHY A FILTER ALONE WOULD HAVE BEEN WORSE THAN THE BUG, and the reason the
// third test here is not optional: `canAdd` refuses quick-add for a name that
// already belongs to somebody, cancelled included. Hide a returning member
// without a way to reach them and there is a person standing in the room who
// can be neither found nor added. Current members by default, search sees
// everyone.

const DAY = 86_400_000;
const day = (d) => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);

const ROSTER = [
  { id: "m1", name: "Regular Rita", email: "", status: "active",    joinedAt: day(200), externalRef: "" },
  { id: "m2", name: "Paused Pat",   email: "", status: "paused",    joinedAt: day(90),  externalRef: "" },
  { id: "m3", name: "Gone Gary",    email: "", status: "cancelled", joinedAt: day(300), externalRef: "" },
  // No status at all. `memberStatus` coerces this to "active" and `retention.js`
  // states its rule as the EXCLUDED set for exactly this case, so a row written
  // by an older build must not vanish out of the check-in list.
  { id: "m4", name: "Legacy Lee",   email: "", joinedAt: day(400), externalRef: "" },
];

async function seedRoster(page, members = ROSTER) {
  await page.goto("./");
  await page.evaluate((m) => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_members", JSON.stringify(m));
  }, members);
  await page.reload();
}

async function openCheckIn(page) {
  await nav(page, "Class Runner");
  await page.getByRole("button", { name: /Check in/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Check in" })).toBeVisible();
}

// The member rows only. "Done" and the quick-add row are in the same dialog and
// are not people.
const memberRows = (page) =>
  page.getByRole("dialog", { name: "Check in" }).getByRole("button")
    .filter({ hasNotText: /^Done$/ }).filter({ hasNotText: /^Add / });

test.describe("the check-in sweep offers the room, not the archive", () => {
  test("a member who left is not in the default list, and one with no status is", async ({ page }) => {
    const errors = watchConsole(page);
    await seedRoster(page);

    // The number the OWNER is given for the same roster, read first so the two
    // screens are compared rather than asserted separately. This is the
    // disagreement the whole file is about.
    await nav(page, "Members");
    await expect(page.getByText(/Roster · 2/)).toBeVisible();
    await expect(page.getByText(/2 not active/)).toBeVisible();

    await openCheckIn(page);

    // Scanner sanity: a dialog that failed to render its list would make every
    // absence assertion below vacuously true.
    await expect(memberRows(page), "the sweep list must render its members")
      .toHaveCount(2);

    await expect(page.getByRole("button", { name: /Regular Rita/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Legacy Lee/ }),
      "a row with no status is a member, not a non-member").toBeVisible();

    // THE ASSERTION. Both of these were tappable, at full opacity, before.
    await expect(page.getByRole("button", { name: /Gone Gary/ }),
      "a member who has LEFT was offered in the mid-class sweep list").toHaveCount(0);
    await expect(page.getByRole("button", { name: /Paused Pat/ }),
      "a member absent BY AGREEMENT was offered in the mid-class sweep list").toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("searching finds someone who left, says so, and still checks them in", async ({ page }) => {
    const errors = watchConsole(page);
    await seedRoster(page);
    await openCheckIn(page);

    await page.getByPlaceholder("Search or type a new name…").fill("Gone");

    const row = page.getByRole("button", { name: /Gone Gary/ });
    await expect(row, "a returning member has to be reachable by name").toBeVisible();

    // The status has to reach the coach as a WORD. Dimming alone announces
    // nothing to a screen reader, and this repo has already fixed one screen for
    // exactly that.
    //
    // Case-insensitive on purpose: the badge is styled `text-transform:
    // uppercase`, and whether a matcher sees "Left" or "LEFT" depends on whether
    // it reads `textContent` or `innerText` — Playwright's `toContainText` reads
    // `textContent`, so it sees the unstyled "Left". Pinning the case here would
    // pin a CSS choice, not the behaviour, and the first draft of this line did
    // exactly that and failed against correct code.
    await expect(row).toContainText(/left/i);

    await row.click();

    // Checking them in is ALLOWED — a member can come back, and refusing would
    // strand a real person at the door. What changed is that it is now a
    // deliberate act on a labelled row rather than a mis-tap on an anonymous one.
    const att = await stored(page, "jungle_attendance");
    expect(att, "checking in a returning member must still record").toHaveLength(1);
    expect(att[0].memberId).toBe("m3");
    expect(att[0].source).toBe("coach");

    expectNoConsoleErrors(errors);
  });

  // 🔴 The pairing that makes the filter safe. If a later change ever filters
  // the SEARCH results too, this fails and says why — which is the only warning
  // anyone would get before a returning member became unreachable.
  test("quick-add refuses a name that already exists, so search must surface them", async ({ page }) => {
    await seedRoster(page);
    await openCheckIn(page);

    await page.getByPlaceholder("Search or type a new name…").fill("Gone Gary");

    await expect(page.getByRole("button", { name: /Add .Gone Gary. and check in/ }),
      "quick-add must not mint a duplicate roster row for someone who already exists")
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: /Gone Gary/ }),
      "…which is precisely why the search has to reach them").toBeVisible();

    // The control: a name nobody has DOES offer quick-add, so the assertion
    // above is measuring the duplicate guard rather than a missing feature.
    await page.getByPlaceholder("Search or type a new name…").fill("Brand New Bea");
    await expect(page.getByRole("button", { name: /Add .Brand New Bea. and check in/ }))
      .toBeVisible();
  });

  test("a roster with nobody current says why, instead of answering a question nobody asked", async ({ page }) => {
    await seedRoster(page, ROSTER.filter(m => m.status && m.status !== "active"));
    await openCheckIn(page);

    await expect(memberRows(page)).toHaveCount(0);
    // The old copy for this state was "No one matches that name." — a reply to a
    // search that never happened, which hides the actual reason the list is empty.
    await expect(page.getByRole("dialog", { name: "Check in" }))
      .toContainText(/No current members/);
    await expect(page.getByRole("dialog", { name: "Check in" }))
      .not.toContainText(/No one matches that name/);

    // …and the empty ROSTER keeps its own, different sentence.
    await seedRoster(page, []);
    await openCheckIn(page);
    await expect(page.getByRole("dialog", { name: "Check in" }))
      .toContainText(/No members yet/);
  });
});

// ── §4.5: a gym-authored class type, run and checked in against ──────────────
//
// `gymClassType.spec.js` covers creation → Builder → smart-build → reload →
// reset. It stops at the Builder. Nothing had ever taken a `gym-` class type
// into the Runner and recorded attendance against it, and that is the end of the
// path where the type stops being a catalogue entry and becomes a permanent row.
//
// `class_instances.class_type` is plain `text` with no CHECK constraint
// (verified session 18), so there is no rejection risk to hunt here — the point
// is that the value SURVIVES the journey. An occurrence that recorded the class
// type as "" would lose, permanently and silently, the one field that says what
// kind of class the gym actually ran.
//
// 🔴 AND IT DID NOT SURVIVE. Driving this found that App.jsx handed the Runner
// `[classType, subType].join(" · ")` — a display string, written into the column
// analytics group by. Every gym was affected, not only ones authoring types, so
// the first test below is the built-in case and is the more important of the two.
test.describe("a gym's own class type reaches the attendance record", () => {
  // The general case. `scheduleInstances.js` writes the bare rule type into
  // `class_type` when a week is published; the Runner has to agree with it, or
  // the same class is two different cohorts depending on which door the coach
  // came through — and nothing surfaces the split.
  test("the occurrence records the class TYPE, not a display string", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate(() => localStorage.setItem("jungle_members", JSON.stringify(
      [{ id: "m1", name: "Regular Rita", email: "", status: "active", joinedAt: "2026-01-01", externalRef: "" }])));
    await page.reload();

    await nav(page, "Class Builder");
    // A style, so `subType` is non-empty. Without this the composite and the
    // bare key are the same string and the test would pass against the bug —
    // the precondition below is what stops it measuring nothing.
    const style = page.locator("select").nth(1);
    const styleValue = await style.locator("option").nth(1).getAttribute("value");
    await style.selectOption(styleValue);

    const choice = await expect.poll(
      async () => (await stored(page, "jungle_draft_class"))?.classChoice,
      { message: "precondition: the Builder must persist a class choice" },
    ).toBeTruthy().then(() => stored(page, "jungle_draft_class").then(d => d.classChoice));
    expect(choice.subType,
      "precondition: this test is vacuous unless a subType is actually set").toBeTruthy();

    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Check in" })).toBeVisible();
    await page.getByRole("button", { name: /Regular Rita/ }).click();

    const instances = await stored(page, "jungle_class_instances");
    expect(instances).toHaveLength(1);
    // THE ASSERTION. Read `"crossfit · general"` before the fix.
    expect(instances[0].classType,
      "the occurrence must record the class type, not the header's label")
      .toBe(choice.classType);
    expect(instances[0].classType,
      "a separator in this column means a display string reached the database")
      .not.toContain("·");

    expectNoConsoleErrors(errors);
  });

  test("running one and checking in stores the gym's type on the occurrence", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate(() => localStorage.setItem("jungle_members", JSON.stringify(
      [{ id: "m1", name: "Regular Rita", email: "", status: "active", joinedAt: "2026-01-01", externalRef: "" }])));
    await page.reload();

    // Author the type in the Library. window.prompt, which Playwright
    // auto-dismisses — so the handler is required, not optional.
    await nav(page, "Exercise Library");
    await page.getByRole("button", { name: /Edit/ }).first().click();
    page.once("dialog", (d) => d.accept("Barre"));
    await page.getByRole("button", { name: "+ New class type" }).click();
    await expect.poll(async () => await stored(page, "jungle_library_custom")).not.toBeNull();
    // The Library is a full-screen modal at zIndex 600, so nav() cannot be
    // called until it is closed.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await nav(page, "Class Builder");
    const dropdown = page.locator("select").first();
    const gymValue = await dropdown.locator("option").filter({ hasText: "Barre" }).getAttribute("value");
    expect(gymValue, "precondition: the gym's type must be selectable").toMatch(/^gym-barre-/);
    await dropdown.selectOption(gymValue);
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.classChoice?.classType,
      { message: "precondition: selecting the gym's type must take" }).toBe(gymValue);

    // …and now run it. This is the leg that had never been driven.
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Check in" })).toBeVisible();
    await page.getByRole("button", { name: /Regular Rita/ }).click();

    const instances = await stored(page, "jungle_class_instances");
    expect(instances, "running a class must mint exactly one occurrence").toHaveLength(1);
    // THE ASSERTION. The occurrence is permanent and nothing later can recover
    // this field.
    expect(instances[0].classType,
      "the gym's own class type must survive onto the attendance record").toBe(gymValue);

    const att = await stored(page, "jungle_attendance");
    expect(att).toHaveLength(1);
    expect(att[0].classInstanceId, "the check-in must hang off that same occurrence")
      .toBe(instances[0].id);

    expectNoConsoleErrors(errors);
  });
});
