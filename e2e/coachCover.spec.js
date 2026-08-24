import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── S30 §2.1–§2.3 · the coach roster, availability and cover ────────────────
//
// ⚠️ WHAT THIS SUITE CAN AND CANNOT PROVE, stated up front because the gap is
// the whole point of §2.5. `playwright.config.js` targets the CREDENTIAL-LESS
// build — no Supabase, sync paths no-op — so every assertion here is about ONE
// device. It proves the UI, the stored objects and the state machine. It cannot
// prove delivery to a second person, because in this build there is no second
// person and no server; and it could not prove it against a real server either,
// because `cover_requests` does not exist yet (migration 0010, DYLAN-QUEUE A15).
//
// So the honest thing to assert here is the OPPOSITE: that the product says so.
// The last test in this file is that one, and it is the most important.

const CLASSES = [
  { id: "uc1", name: "Strength Lab", type: "hyrox", coach: "Mara",
    day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
  // Same person, typed the way a phone with autocapitalise off types it. This is
  // the defect §2.1 exists for: three spellings, three coaches, nothing to send
  // anything to.
  { id: "uc2", name: "Engine Room", type: "hyrox", coach: "mara",
    day: "Wed", slot: "18:00", dur: "45m", repeat: "weekly" },
  { id: "uc3", name: "Barbell Club", type: "hyrox", coach: "Dev",
    day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
];

async function seed(page, { coaches = null, requests = null } = {}) {
  await page.evaluate(([cls, co, rq]) => {
    localStorage.setItem("jungle_user_classes", JSON.stringify(cls));
    if (co) localStorage.setItem("jungle_coaches", JSON.stringify(co));
    if (rq) localStorage.setItem("jungle_cover_requests", JSON.stringify(rq));
  }, [CLASSES, coaches, requests]);
  await page.reload();
  await nav(page, "Schedule");
}

const roster = (over = {}) => ({ id: "c-mara", name: "Mara", aliases: [], userId: "",
                                 active: true, availability: {}, ...over });

test.describe("the roster", () => {
  test("names typed on the schedule are offered as roster entries, deduplicated", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page);

    // POSITIVE CONTROL: the panel is on screen and the fixture reached it. An
    // empty screen passes every assertion below trivially, twice over in this
    // repo already.
    await expect(page.getByText("Coach roster", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Put Mara on the roster" })).toBeVisible();

    // 🔴 "Mara" and "mara" are ONE offer carrying two classes, not two offers.
    await expect(page.getByRole("button", { name: /^Put .* on the roster$/ })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Put Mara on the roster" })).toContainText("(2)");
    await expect(page.getByRole("button", { name: "Put Dev on the roster" })).toContainText("(1)");

    await page.getByRole("button", { name: "Put Mara on the roster" }).click();

    // ASSERT THE STORED OBJECT, not only the render.
    const saved = await stored(page, "jungle_coaches");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Mara", userId: "", active: true });

    // And the offer is gone, because the name now resolves.
    await expect(page.getByRole("button", { name: "Put Mara on the roster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Put Dev on the roster" })).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("🔴 the typed name on the class is never rewritten", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page);
    await page.getByRole("button", { name: "Put Mara on the roster" }).click();

    const classes = await stored(page, "jungle_user_classes");
    expect(classes.find(c => c.id === "uc1").coach).toBe("Mara");
    expect(classes.find(c => c.id === "uc2").coach).toBe("mara");   // still lower-case
    // And no link was smuggled onto the rule — the whole §2.1 decision.
    expect(Object.keys(classes[0])).not.toContain("coachId");
    expect(Object.keys(classes[0])).not.toContain("coach_id");
    expectNoConsoleErrors(errors);
  });

  test("a coach with no account is labelled as unreachable, not as linked", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });
    await expect(page.getByText("No account — ask them yourself").first()).toBeVisible();
    await expect(page.getByText("Has a Jungle account")).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("removing a coach is confirmed and undoable", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });

    // ⚠️ Playwright AUTO-DISMISSES dialogs, so a window.confirm would make this
    // test exercise CANCEL while looking like it exercised delete. The panel
    // confirms in-app precisely so both branches can be driven.
    await page.getByRole("button", { name: "Remove Mara from the roster" }).click();
    await expect(page.getByRole("button", { name: "Confirm removing Mara" })).toBeVisible();

    // Branch 1: keep.
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    expect(await stored(page, "jungle_coaches")).toHaveLength(1);

    // Branch 2: remove, then undo.
    await page.getByRole("button", { name: "Remove Mara from the roster" }).click();
    await page.getByRole("button", { name: "Confirm removing Mara" }).click();
    expect(await stored(page, "jungle_coaches")).toHaveLength(0);

    await page.getByTestId("toast-undo").click();
    const back = await stored(page, "jungle_coaches");
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe("Mara");
    expectNoConsoleErrors(errors);
  });
});

test.describe("availability", () => {
  test("a slot is stored against the day it was set on, and survives a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });

    await expect(page.getByText("Availability not set").first()).toBeVisible();  // positive control
    await page.getByRole("button", { name: "Set availability for Mara" }).click();
    await page.getByRole("button", { name: "Mara free Mon 06:00" }).click();

    const saved = await stored(page, "jungle_coaches");
    expect(saved[0].availability).toEqual({ Mon: ["06:00"] });
    // Stamped by the store, not by the caller, and as a LOCAL calendar date.
    expect(saved[0].availabilityAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.reload();
    await nav(page, "Schedule");
    await expect(page.getByRole("button", { name: "Set availability for Mara" })).toBeVisible();
    expect((await stored(page, "jungle_coaches"))[0].availability).toEqual({ Mon: ["06:00"] });
    expectNoConsoleErrors(errors);
  });

  test("🔴 a stale claim is shown WITH its age, not silently trusted or hidden", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster({ availability: { Mon: ["06:00"] }, availabilityAt: "2026-01-05" })] });

    await expect(page.getByText(/older than 56 days, ask again/).first()).toBeVisible();
    // It is still offered for cover — hiding it would leave a gym with an empty
    // list and no reason for it — but it is never called simply "free then".
    await page.getByLabel("Class that needs cover").selectOption("uc1");
    await expect(page.getByText(/said so \d+ days ago/).first()).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("an empty roster gets an honest empty state, not an empty grid", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page);
    await expect(page.getByText(/Put a coach on the roster first/).first()).toBeVisible();
    await expect(page.getByLabel("Class that needs cover")).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });
});

test.describe("cover requests", () => {
  const two = [roster(), roster({ id: "c-dev", name: "Dev",
                                  availability: { Mon: ["06:00"] }, availabilityAt: "2099-01-01" })];

  // `availabilityAt` in the future keeps `daysBetween` negative, so the claim is
  // fresh whenever this suite runs. A fixed clock would freeze `Date.now()` and
  // collide the ids minted from it — the documented trap.
  async function raise(page) {
    await seed(page, { coaches: two });
    await page.getByLabel("Class that needs cover").selectOption("uc1");
    await page.getByRole("button", { name: /^Ask Dev to cover / }).click();
  }

  test("🔴 approving reassigns the class; the STORED rule carries the new coach", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await raise(page);

    let reqs = await stored(page, "jungle_cover_requests");
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ classClientId: "uc1", status: "open",
                                    classLabel: "Strength Lab", classDay: "Mon", classSlot: "06:00" });

    await page.getByRole("button", { name: "Approve cover for Strength Lab" }).click();

    reqs = await stored(page, "jungle_cover_requests");
    expect(reqs[0].status).toBe("approved");
    expect(reqs[0].settledAt).not.toBe("");

    // ⚠️ POLLED, not read once. The reassignment goes through React state and
    // CalendarScreen's `useAfterMount` persist effect, so a straight read can
    // win the race against the write and report the OLD coach — a failure that
    // would look like the feature not working.
    await expect.poll(async () =>
      (await stored(page, "jungle_user_classes")).find(c => c.id === "uc1").coach,
      { message: "the approved cover must reach the stored rule, not only the screen" })
      .toBe("Dev");

    // And ONLY that class. `uc2` is the same person under a different spelling
    // and must be untouched — reassigning by NAME could plausibly have caught it.
    const classes = await stored(page, "jungle_user_classes");
    expect(classes.find(c => c.id === "uc2").coach).toBe("mara");
    expect(classes.find(c => c.id === "uc3").coach).toBe("Dev");   // unchanged: it was already Dev
    expectNoConsoleErrors(errors);
  });

  test("🔴 turning one down leaves the class exactly where it was", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await raise(page);

    await page.getByRole("button", { name: "Turn down cover for Strength Lab" }).click();

    await expect.poll(async () => (await stored(page, "jungle_cover_requests"))[0].status)
      .toBe("rejected");
    // The class is NOT reassigned — the half a test that only drives approve
    // would never see. Asserted AFTER the settle has demonstrably landed, so
    // "still Mara" cannot pass merely because nothing has happened yet.
    expect((await stored(page, "jungle_user_classes")).find(c => c.id === "uc1").coach).toBe("Mara");
    // ⚠️ NOT `toHaveCount(0)` on its own — that is satisfied the instant the
    // count is zero, which includes "has not rendered yet". The polled status
    // above is what proves the settle actually ran first, so this now means
    // "the section went away", not "the section has not arrived".
    await expect(page.getByText("Open cover requests")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText(/turned down .*still has no cover/i);
    expectNoConsoleErrors(errors);
  });

  test("both settle paths survive a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await raise(page);
    await page.getByRole("button", { name: "Approve cover for Strength Lab" }).click();

    await expect.poll(async () =>
      (await stored(page, "jungle_user_classes")).find(c => c.id === "uc1").coach).toBe("Dev");

    await page.reload();
    await nav(page, "Schedule");
    expect((await stored(page, "jungle_cover_requests"))[0].status).toBe("approved");
    expect((await stored(page, "jungle_user_classes")).find(c => c.id === "uc1").coach).toBe("Dev");
    expectNoConsoleErrors(errors);
  });

  test("a class cannot collect two open asks", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await raise(page);
    await page.getByLabel("Class that needs cover").selectOption("uc1");
    await page.getByRole("button", { name: /^Ask Dev to cover / }).click();
    expect(await stored(page, "jungle_cover_requests")).toHaveLength(1);
    await expect(page.getByTestId("toast")).toContainText(/already has an open cover request/);
    expectNoConsoleErrors(errors);
  });
});

// ─── 🔴 §2.5 · the assertion this whole feature is judged by ─────────────────
//
// Everything above proves one device behaves. This proves the product does not
// CLAIM anything more than that. The failure it guards is not a crash — it is a
// screen that says "Sent" over a row nobody will ever read, which is the same
// defect class as the AA panel that reported "passes" on a palette it had not
// checked, and this repo has shipped that once already.
test("🔴 the product never says a cover request was sent anywhere", async ({ page }) => {
  const errors = watchConsole(page);
  await freshApp(page);
  await page.evaluate((cls) => {
    localStorage.setItem("jungle_user_classes", JSON.stringify(cls));
    localStorage.setItem("jungle_coaches", JSON.stringify([
      { id: "c-dev", name: "Dev", aliases: [], userId: "", active: true,
        availability: { Mon: ["06:00"] }, availabilityAt: "2099-01-01" },
    ]));
  }, CLASSES);
  await page.reload();
  await nav(page, "Schedule");

  // The panel states the truth BEFORE anything is raised.
  await expect(page.getByText(/stored .*on this device only/i).first()).toBeVisible();

  await page.getByLabel("Class that needs cover").selectOption("uc1");
  await page.getByRole("button", { name: /^Ask Dev to cover / }).click();

  // POSITIVE CONTROL: a request really was raised, so "no false claim" is not
  // passing because nothing happened.
  expect(await stored(page, "jungle_cover_requests")).toHaveLength(1);

  // What the coach is told is that it reached this device and no further.
  await expect(page.getByTestId("toast")).toContainText(/Dev will not see it/);

  // 🔴 And nowhere on the screen does the product claim delivery. Read from the
  // rendered text rather than asserted per-element: a count of zero on a
  // selector is satisfied by "has not rendered yet", which is the trap
  // CLAUDE.md names — this reads the text that IS there.
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).toContain("cover");                      // positive control
  expect(body).not.toMatch(/\bsent\b/);
  expect(body).not.toMatch(/\bnotified\b/);
  expect(body).not.toMatch(/\bdelivered\b/);

  await page.getByRole("button", { name: "Approve cover for Strength Lab" }).click();
  // The booking seam reports, in words, that nothing left Jungle.
  await expect(page.getByTestId("toast")).toContainText(/No booking system is connected/);

  const after = (await page.locator("body").innerText()).toLowerCase();
  expect(after).not.toMatch(/\bmindbody\b/);
  expect(after).not.toMatch(/\bclasspass\b/);
  expect(after).not.toMatch(/coming soon/);
  expectNoConsoleErrors(errors);
});
