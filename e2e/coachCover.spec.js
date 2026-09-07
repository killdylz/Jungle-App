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

async function seed(page, { coaches = null, requests = null, absences = null, classes = CLASSES } = {}) {
  await page.evaluate(([cls, co, rq, ab]) => {
    localStorage.setItem("jungle_user_classes", JSON.stringify(cls));
    if (co) localStorage.setItem("jungle_coaches", JSON.stringify(co));
    if (rq) localStorage.setItem("jungle_cover_requests", JSON.stringify(rq));
    if (ab) localStorage.setItem("jungle_coach_absences", JSON.stringify(ab));
  }, [classes, coaches, requests, absences]);
  await page.reload();
  await nav(page, "Schedule");
}

const roster = (over = {}) => ({ id: "c-mara", name: "Mara", aliases: [], userId: "",
                                 active: true, availability: {}, ...over });

// ⚠️ NEXT WEEK, DERIVED FROM TODAY, AND BOTH HALVES OF THAT ARE DELIBERATE.
//
// Deriving from `new Date()` is what this repo normally refuses to do, and it is
// unavoidable here: the grid draws real weeks, so an absence has to land in one.
// Monday is computed explicitly rather than offset from whatever `getDay()` says
// today is, so the answer does not depend on which day the suite runs — the
// property the rule actually protects.
//
// 🔴 NEXT week rather than this one, and the first draft used this one and broke.
// `raiseCoversForAbsence` skips a class that has already been taught, so on any
// day but Monday half of this week is in the past and the fixture silently
// raised fewer asks than the test expected. Next week is entirely ahead
// whenever the suite runs, which makes the whole file deterministic.
function nextMonday(offsetDays = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

    // It is still OFFERED as cover — hiding a stale claim leaves a gym with an
    // empty list and no reason for it — but it is never called simply "free
    // then". As of S33 that qualifier rides the assign dropdown's option text,
    // which is where a manager actually reads it.
    await seed(page, { coaches: [
      roster({ availability: { Mon: ["06:00"] }, availabilityAt: "2026-01-05" }),
      roster({ id: "c-dev", name: "Dev", availability: {} }),
    ] });
    await page.getByLabel("Coach who is away").selectOption("c-dev");
    await page.getByLabel("First day away").fill(nextMonday());
    await page.getByLabel("Last day away").fill(nextMonday());
    await page.getByRole("button", { name: /Record absence and ask for cover/ }).click();

    const opts = await page.getByLabel(/^Coach to cover Barbell Club/).locator("option").allTextContents();
    expect(opts.some(o => /Mara/.test(o) && /said so \d+ days ago/.test(o))).toBe(true);
    expect(opts.some(o => /Mara/.test(o) && /free then/.test(o) && !/said so/.test(o))).toBe(false);
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

test.describe("being away, and the board that comes from it", () => {
  const two = [roster(), roster({ id: "c-dev", name: "Dev",
                                  availability: { Mon: ["06:00"], Wed: ["18:00"] },
                                  availabilityAt: "2099-01-01" })];

  // `availabilityAt` in the future keeps `daysBetween` negative, so the claim is
  // fresh whenever this suite runs. A fixed clock would freeze `Date.now()` and
  // collide the ids minted from it — the documented trap.

  // ⚠️ THE DATES ARE DERIVED FROM TODAY, WHICH THIS REPO NORMALLY REFUSES TO DO.
  // It is unavoidable and safe here: the grid shows THIS week, so an absence has
  // to fall in it or there is nothing to cover. Monday is computed explicitly
  // (not `getDay()`-relative on the fly), so the result does not depend on which
  // day the suite runs — which is the property the rule actually protects.
  const MON = nextMonday(), WED = nextMonday(2);

  async function markAway(page, { from = MON, to = WED, coach = "Mara" } = {}) {
    await seed(page, { coaches: two });
    await page.getByLabel("Coach who is away").selectOption({ label: coach });
    await page.getByLabel("First day away").fill(from);
    await page.getByLabel("Last day away").fill(to);
    await page.getByRole("button", { name: /Record absence and ask for cover/ }).click();
  }

  test("🔴 one absence puts every class that coach teaches on the board, dated", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page);

    // POSITIVE CONTROL: the board rendered at all.
    await expect(page.getByText("Classes needing cover")).toBeVisible();
    await expect(page.getByTestId("cover-row")).toHaveCount(2);
    await expect(page.getByTestId("cover-row").filter({ hasText: "Strength Lab" })).toBeVisible();
    await expect(page.getByTestId("cover-row").filter({ hasText: "Engine Room" })).toBeVisible();
    // 🔴 THE CONTROL: Dev's class is on the same day and slot as Mara's and must
    // not be swept up. A derivation ignoring the coach would pass everything above.
    await expect(page.getByTestId("cover-row").filter({ hasText: "Barbell Club" })).toHaveCount(0);

    // ASSERT THE STORED OBJECTS, not only the render.
    const reqs = await stored(page, "jungle_cover_requests");
    expect(reqs).toHaveLength(2);
    expect(reqs.map(r => r.classDate).sort()).toEqual([MON, WED]);
    for (const r of reqs) {
      expect(r.status).toBe("open");
      // 🔴 Nobody is covering it yet — it is on a board, not addressed to anyone.
      expect(r.toCoachId).toBe("");
      expect(r.absenceId).toBeTruthy();
    }
    const abs = await stored(page, "jungle_coach_absences");
    expect(abs).toHaveLength(1);
    expect(abs[0]).toMatchObject({ coachId: "c-mara", from: MON, to: WED });
    expectNoConsoleErrors(errors);
  });

  test("🔴 claiming one covers THAT DAY and leaves the recurring class alone", async ({ page }) => {
    // The single most important test in this file. Before S33 approving a cover
    // rewrote the RULE, so covering one ill Monday moved the class every Monday
    // for ever. Nothing writes to the schedule now.
    // ⚠️ THE ASSERTION IS ON ENGINE ROOM (Wed 18:00), NOT STRENGTH LAB, and the
    // reason is a grid limitation this test rediscovered: `uc1` and `uc3` are
    // both Mon 06:00, `effSchedule` is keyed on day-and-slot, and the LAST rule
    // wins — so the Monday cell shows Barbell Club and Strength Lab is not
    // rendered at all. That is documented behaviour, older than this feature,
    // and not something a cover test should be the one to trip over.
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page);

    const row = page.getByTestId("cover-row").filter({ hasText: "Engine Room" });
    await row.getByLabel(/^Coach to cover Engine Room/).selectOption("c-dev");
    await row.getByLabel(/^Assign cover for Engine Room/).click();

    // That class now has somebody; Strength Lab still does not.
    await expect(page.getByTestId("cover-row")).toHaveCount(1);
    await expect(page.getByTestId("cover-row").filter({ hasText: "Engine Room" })).toHaveCount(0);

    // 🔴 THE STORED RULE IS UNTOUCHED. This is the assertion the whole feature
    // exists for: `jungle_user_classes` still says Mara teaches Strength Lab.
    const classes = await stored(page, "jungle_user_classes");
    expect(classes.find(c => c.id === "uc1").coach).toBe("Mara");
    expect(classes.find(c => c.id === "uc2").coach).toBe("mara");

    // ...and the cover is a dated row instead.
    const reqs = await stored(page, "jungle_cover_requests");
    const taken = reqs.find(r => r.classLabel === "Engine Room");
    expect(taken).toMatchObject({ status: "approved", toCoachId: "c-dev", classDate: WED });

    // The covered week's grid shows Dev covering.
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.getByText("Next week", { exact: true })).toBeVisible();
    await expect(page.getByText("covering for Mara").first()).toBeVisible();

    // 🔴 AND THE WEEK AFTER DOES NOT. The other half of "just that day", and the
    // half a rule-rewriting implementation would fail.
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.getByText("Week +2")).toBeVisible();
    await expect(page.getByText("covering for Mara")).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("🔴 the board says that day only — never 'from now on'", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page, { to: MON });

    await expect(page.getByText(/that day only/).first()).toBeVisible();
    // The sentence S32 had to add because approval WAS permanent. It must not
    // survive the change that made it untrue.
    await expect(page.getByText(/from now on/)).toHaveCount(0);
    await expect(page.getByText(/every Mon/)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("a range that runs backwards is refused with a sentence, not a code", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: two });
    await page.getByLabel("Coach who is away").selectOption({ label: "Mara" });
    await page.getByLabel("First day away").fill(WED);
    await page.getByLabel("Last day away").fill(MON);   // backwards on purpose
    await page.getByRole("button", { name: /Record absence and ask for cover/ }).click();

    await expect(page.getByTestId("absence-error")).toContainText(/last day is before the first/i);
    // Nothing was written on the way to being refused.
    expect(await stored(page, "jungle_coach_absences")).toBe(null);
    expect(await stored(page, "jungle_cover_requests")).toBe(null);
    expectNoConsoleErrors(errors);
  });

  test("🔴 withdrawing an absence takes back what nobody took, and keeps what somebody did", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page);
    await expect(page.getByTestId("cover-row")).toHaveCount(2);

    // Somebody takes the Wednesday. (Engine Room rather than Strength Lab for
    // the grid-collision reason documented in the test above.)
    const row = page.getByTestId("cover-row").filter({ hasText: "Engine Room" });
    await row.getByLabel(/^Coach to cover Engine Room/).selectOption("c-dev");
    await row.getByLabel(/^Assign cover for Engine Room/).click();
    await expect(page.getByTestId("cover-row")).toHaveCount(1);

    await page.getByRole("button", { name: /Mara is back/ }).click();

    // 🔴 The open one is withdrawn; the TAKEN one is not. Dev planned their week
    // around it, and un-asking that is a conversation, not a side effect.
    await expect(page.getByTestId("cover-row")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText(/already taken and left in place/);

    const reqs = await stored(page, "jungle_cover_requests");
    expect(reqs.find(r => r.classLabel === "Engine Room").status).toBe("approved");
    expect(reqs.find(r => r.classLabel === "Strength Lab").status).toBe("cancelled");
    // And the covered day still shows Dev, one week forward.
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.getByText("covering for Mara").first()).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("the same absence recorded twice does not double-book the board", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page, { to: MON });
    await expect(page.getByTestId("cover-row")).toHaveCount(1);

    await page.getByLabel("Coach who is away").selectOption({ label: "Mara" });
    await page.getByLabel("First day away").fill(MON);
    await page.getByLabel("Last day away").fill(MON);
    await page.getByRole("button", { name: /Record absence and ask for cover/ }).click();

    // Two open asks for one class is how two coaches both turn up.
    await expect(page.getByTestId("cover-row")).toHaveCount(1);
    expect((await stored(page, "jungle_cover_requests")).filter(r => r.status === "open")).toHaveLength(1);
    expectNoConsoleErrors(errors);
  });

  test("🔴 a claim leaves the exact payload on record, dated, and still claims nothing", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page, { to: MON });

    // POSITIVE CONTROL: nothing recorded before the claim.
    expect(await stored(page, "jungle_booking_outbox")).toBe(null);

    const row = page.getByTestId("cover-row").filter({ hasText: "Strength Lab" });
    await row.getByLabel(/^Coach to cover Strength Lab/).selectOption("c-dev");
    await row.getByLabel(/^Assign cover for Strength Lab/).click();

    await expect.poll(async () => (await stored(page, "jungle_booking_outbox") || []).length,
      { message: "a claimed cover must leave a record of what a booking system would have been handed" })
      .toBe(1);

    const [entry] = await stored(page, "jungle_booking_outbox");
    expect(entry.payload).toMatchObject({
      kind: "cover.approved", classRef: "uc1", classLabel: "Strength Lab",
      date: MON, day: "Mon", slot: "06:00", previousCoach: "Mara", newCoach: "Dev",
    });
    // 🔴 RECORDED IS NOT SENT, and the record says so itself.
    expect(entry.pushed).toBe(false);
    expect(entry.system).toBe("none");
    await expect(page.getByTestId("toast")).toContainText(/nothing was sent outside Jungle/i);
    await expect(page.getByText(/mindbody/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("the board and the absence survive a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await markAway(page);
    await page.reload();
    await nav(page, "Schedule");

    await expect(page.getByTestId("cover-row")).toHaveCount(2);
    await expect(page.getByText(/2 classes, nobody yet/)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});


// ─── S31 §2.1 · the edit path, which did not exist ──────────────────────────
//
// 🔴 WHY THIS SUITE IS HERE. Session 30 shipped `updateCoach` accepting five
// keys, and the app passed exactly one of them. `name`, `aliases`, `userId` and
// `active` had NO CONTROL — they could only be set by editing localStorage by
// hand, which is precisely what the tests above did to reach them. A fixture
// that seeds a field the product cannot write is the tell, and it is why every
// assertion below drives the UI and then reads the STORED entry.

// "Mara K." is the third spelling — the one `coachKey` deliberately will NOT
// fold, because deciding that "Mara" and "Mara K." are one person is a
// judgement about a gym's staff and a wrong merge reassigns somebody's classes.
const CLASSES_WITH_INITIAL = [
  ...CLASSES,
  { id: "uc4", name: "Sunday Long", type: "hyrox", coach: "Mara K.",
    day: "Sun", slot: "09:00", dur: "45m", repeat: "weekly" },
];

test.describe("editing a roster entry", () => {
  test("🔴 an alias makes “Mara K.” the same person as Mara", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()], classes: CLASSES_WITH_INITIAL });

    // POSITIVE CONTROL, twice. The panel is on screen, AND the schedule really
    // does count "Mara K." as somebody nobody has claimed — otherwise the
    // assertion that it stops doing so is passing on an empty screen.
    await expect(page.getByText("Coach roster", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Put Mara K. on the roster" })).toBeVisible();

    await page.getByRole("button", { name: "Edit Mara" }).click();
    await page.getByLabel("Also typed as").fill("Mara K.");
    await page.getByRole("button", { name: "Save" }).click();

    // ASSERT THE STORED OBJECT. The render is checked below, but the roster
    // entry is the thing every other reader resolves through.
    const saved = await stored(page, "jungle_coaches");
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Mara");
    expect(saved[0].aliases).toEqual(["Mara K."]);

    // And the schedule stops counting them separately — the actual point.
    await expect(page.getByRole("button", { name: "Put Mara K. on the roster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Put Dev on the roster" })).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("🔴 renaming a coach does not orphan the classes typed under the old name", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });

    await expect(page.getByRole("button", { name: "Edit Mara" })).toBeVisible();
    await page.getByRole("button", { name: "Edit Mara" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Mara Kelly");
    await page.getByRole("button", { name: "Save" }).click();

    const saved = await stored(page, "jungle_coaches");
    expect(saved[0].name).toBe("Mara Kelly");
    // The old name was carried, so "Mara" on uc1/uc2 still resolves to her.
    expect(saved[0].aliases).toContain("Mara");

    // Proof at the product level: the two classes typed "Mara"/"mara" are still
    // hers, so nothing re-appears as an unclaimed name.
    await expect(page.getByRole("button", { name: "Put Mara on the roster" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Mara Kelly" })).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("a coach who no longer works here stays on the roster and stops being offered cover", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [
      roster(),
      roster({ id: "c-dev", name: "Dev", availability: { Mon: ["06:00"] }, availabilityAt: "2099-01-01" }),
    ] });

    // Mara goes away so uc1 lands on the board and Dev can be offered it.
    await page.getByLabel("Coach who is away").selectOption("c-mara");
    await page.getByLabel("First day away").fill(nextMonday());
    await page.getByLabel("Last day away").fill(nextMonday());
    await page.getByRole("button", { name: /Record absence and ask for cover/ }).click();

    // POSITIVE CONTROL: Dev IS offered before the change. Without this the
    // assertion below is satisfied by a dropdown that never had the option.
    const before = await page.getByLabel(/^Coach to cover Strength Lab/).locator("option").allTextContents();
    expect(before.some(o => /Dev/.test(o))).toBe(true);

    await page.getByRole("button", { name: "Edit Dev" }).click();
    await page.getByLabel("Dev still coaches here").uncheck();
    await page.getByRole("button", { name: "Save" }).click();

    expect((await stored(page, "jungle_coaches")).find(c => c.id === "c-dev").active).toBe(false);

    // Still on the roster — this is not a delete.
    await expect(page.getByRole("button", { name: "Edit Dev" })).toBeVisible();
    // But no longer offered as cover.
    const after = await page.getByLabel(/^Coach to cover Strength Lab/).locator("option").allTextContents();
    expect(after.some(o => /Dev/.test(o))).toBe(false);
    expectNoConsoleErrors(errors);
  });

  test("🔴 with no server the account link says why, instead of an empty picker", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });

    await page.getByRole("button", { name: "Edit Mara" }).click();

    // POSITIVE CONTROL: the form really opened, so "no picker" is not passing
    // because nothing rendered.
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(page.getByText("Jungle account", { exact: true })).toBeVisible();

    // The honest sentence, and NO control that pretends to work.
    await expect(page.getByText(/needs the gym to be online/i)).toBeVisible();
    await expect(page.getByLabel("Jungle account")).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("a blank name is refused rather than silently discarded", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seed(page, { coaches: [roster()] });

    await page.getByRole("button", { name: "Edit Mara" }).click();
    await page.getByLabel("Name", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByTestId("toast")).toContainText(/needs a name/i);
    expect((await stored(page, "jungle_coaches"))[0].name).toBe("Mara");
    expectNoConsoleErrors(errors);
  });
});
