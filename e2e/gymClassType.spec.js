import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── DEC-16: a class type the gym authored ────────────────────────────────────
//
// This feature was blocked for eleven sessions on a decision, and the decision
// was hard because the STORAGE was already finished while the READS were not.
// `libraryStore.js` has always stored a class key the built-in catalogue lacks
// whole, so saving a gym-authored type worked. But the Builder's dropdown,
// `applyTemplate`, `smartPickClass`, the smart-build template list and the App
// root's initial `classChoice` each imported the BUILT-IN `WORKOUT_LIBRARY`
// constant directly — so a gym's own class type would have appeared in the
// Library modal and in no other surface in the product.
//
// The Library modal even shipped a "+ New class type" button with no `onClick`.
// Session 15 deleted it as a dead control, which was right: a button that does
// nothing is worse than either answer.
//
// So the assertion that matters here is NOT "the type was saved" — that always
// worked. It is "the type reaches the surfaces that used to read past it". Every
// test below crosses a component boundary on purpose.

const KEY = "jungle_library_custom";
const TYPE = "Barre";

// Creating a type goes through window.prompt. Playwright AUTO-DISMISSES dialogs,
// so a test that does not handle it silently exercises the Cancel path and still
// passes — the documented trap in this repo, and the reason the cancel case is
// asserted explicitly below rather than assumed.
async function addClassType(page, name) {
  page.once("dialog", (d) => d.accept(name));
  await page.getByRole("button", { name: "+ New class type" }).click();
}

async function openLibraryEditMode(page) {
  await nav(page, "Exercise Library");
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await expect(page.getByRole("button", { name: /Done/ }).first()).toBeVisible();
}

// The Exercise Library is a full-screen modal at zIndex 600, so the sidebar is
// genuinely unreachable while it is open — verified by probe:
// `document.elementFromPoint` over the sidebar returns one of the modal's own
// class-type buttons. `nav()` therefore cannot be called until it is closed, and
// closing it is part of the journey being tested anyway: the coach adds a type
// in the Library and then goes to the Builder to use it.
async function closeLibrary(page) {
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("a gym can author its own class type", () => {
  test("the new type is stored WHOLE, not as an override of a built-in", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);

    expect(await stored(page, KEY), "a fresh gym stores no override").toBeNull();

    await addClassType(page, TYPE);

    const blob = await expect.poll(async () => await stored(page, KEY)).not.toBeNull()
      .then(() => stored(page, KEY));
    const gymKeys = Object.keys(blob.classes).filter(k => k.startsWith("gym-"));
    expect(gymKeys, "the type must be stored under a gym- prefixed key").toHaveLength(1);

    // The prefix is not cosmetic. `mergeLibrary` treats a key the built-in lacks
    // as gym-owned and stores it WHOLE; a key that collided with a built-in one
    // would instead be read as an override and silently lose the gym's type on
    // the next catalogue improvement.
    expect(gymKeys[0]).toMatch(/^gym-barre-/);
    expect(blob.classes[gymKeys[0]].label).toBe(TYPE);
    expect(blob.classes[gymKeys[0]].subTypes, "a type with no subTypes crashes the Builder")
      .toBeTruthy();

    expectNoConsoleErrors(errors);
  });

  test("cancelling the prompt creates nothing", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);

    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "+ New class type" }).click();
    await page.waitForTimeout(300);
    expect(await stored(page, KEY), "Cancel must not create a class type").toBeNull();

    // An empty name is a separate branch from Cancel and must also create nothing —
    // an unnamed class type is unselectable in a dropdown that shows only labels.
    page.once("dialog", (d) => d.accept("   "));
    await page.getByRole("button", { name: "+ New class type" }).click();
    await page.waitForTimeout(300);
    expect(await stored(page, KEY), "a blank name must not create a class type").toBeNull();
  });

  // 🔴 The load-bearing test. This is the exact thing that was impossible before:
  // the Builder read the built-in constant, so this dropdown could not contain a
  // gym's type no matter what the Library had saved.
  test("the new type appears in the BUILDER's class dropdown", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    await closeLibrary(page);

    await nav(page, "Class Builder");

    const dropdown = page.locator("select").first();
    await expect(dropdown,
      "the gym's own class type must be selectable in the Builder, not only " +
      "visible in the Library",
    ).toContainText(TYPE);

    // And selecting it must actually take — a dropdown that lists it and refuses
    // it is the same defect one layer down.
    const optionValue = await dropdown.locator("option")
      .filter({ hasText: TYPE }).getAttribute("value");
    expect(optionValue).toMatch(/^gym-barre-/);
    await dropdown.selectOption(optionValue);
    await expect(dropdown).toHaveValue(optionValue);

    expectNoConsoleErrors(errors);
  });

  test("the new type appears in smart-build's template list", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    await closeLibrary(page);

    await nav(page, "Class Builder");
    await page.getByRole("button", { name: /Build for me/i }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);

    await expect(page.getByRole("dialog").getByRole("button", { name: new RegExp(TYPE) }),
      "'Or insert a template' must offer the gym's own types too").toHaveCount(1);
  });

  // The gym's type survives a reload, which is what makes it a catalogue entry
  // rather than a session artefact — and proves the read path, not just the write.
  test("the new type survives a reload", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();

    await page.reload();
    // A reload lands back on the dashboard, so no modal is in the way here.
    await nav(page, "Class Builder");
    await expect(page.locator("select").first()).toContainText(TYPE);
  });

  // 🔴 REGRESSION, found by regression-testing the feature an hour after
  // shipping it. Wiring the READS was only half the job: `applyTemplate` builds
  // its stage skeleton from `CLASS_STAGE_TEMPLATES`, a separate BUILT-IN
  // constant that can never contain a `gym-` key. So `buildStagesFromTemplate`
  // returned null, `applyTemplate` returned early, and selecting a gym's own
  // type did NOTHING — silently, with no toast and no error.
  //
  // That is precisely the defect class sessions 15–17 were built around: a
  // control that renders, invites a press, and does nothing. Making the type
  // selectable everywhere without this would have been worse than leaving
  // DEC-16 unbuilt, because the coach would have had a class type that looked
  // real and could not be used.
  // ⚠️ THE FIRST VERSION OF THIS TEST PASSED AGAINST THE BUG. It asserted "the
  // draft has stages, including a warmup and a cooldown" — and a fresh Builder
  // ALREADY has five default stages from `mkStages()` with exactly those types,
  // so it was true either way. The discriminator has to be that the stages
  // CHANGED, which needs a known different starting point. Applying a built-in
  // type first gives one, and doubles as the control: if the built-in apply
  // stops working, this test fails on its precondition rather than silently
  // measuring nothing.
  const stagesOf = async (page) =>
    ((await stored(page, "jungle_draft_class"))?.stages || []).map(s => `${s.type}:${s.name}`);

  test("a gym type builds real stages — it is not a dead selection", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    await closeLibrary(page);

    await nav(page, "Class Builder");
    const dropdown = page.locator("select").first();
    const gymValue = await dropdown.locator("option").filter({ hasText: TYPE }).getAttribute("value");

    // ── Control: a built-in type rebuilds the stage list. A fresh Builder's
    //    default exercises carry no `source`, so `anyCustom` is true and the
    //    change is routed through the "Apply template?" confirm.
    await dropdown.selectOption("crossfit");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect.poll(() => stagesOf(page),
      { message: "precondition: a BUILT-IN type must rebuild the stages" })
      .toContain("circuit:WOD");
    const builtInStages = await stagesOf(page);

    // ── The gym's own type. Its exercises now all carry source:"library", so
    //    `anyCustom` is false and applyTemplate is called directly.
    await dropdown.selectOption(gymValue);

    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.classChoice?.classType,
      { message: "selecting the gym's type must take" }).toBe(gymValue);

    await expect.poll(() => stagesOf(page),
      { message: "the gym's type left the PREVIOUS type's stages in place — the " +
                 "dropdown says Barre and the Builder is still showing CrossFit" })
      .not.toEqual(builtInStages);

    // …and what replaced them has to be usable, not merely different.
    const stages = (await stored(page, "jungle_draft_class")).stages;
    expect(stages.map(s => s.type), "the default skeleton needs a warmup and a cooldown")
      .toEqual(expect.arrayContaining(["warmup", "cooldown"]));
    expect(stages.every(s => s.name && s.dur > 0),
      "every stage needs a name and a duration").toBe(true);

    expectNoConsoleErrors(errors);
  });

  // 🔴 THE JOURNEY SESSION 21 MADE POSSIBLE, driven for the first time.
  //
  // Before `ce96f91` a gym-authored type could not be put on the Schedule at
  // all — the dropdown was `CAT_COLOR`'s eight hardcoded display strings. Now it
  // can, and that opened a path nobody had walked: schedule a gym's own type →
  // press Start → run a class whose movement pools are EMPTY (`makeClassType`
  // gives one sub-type with `warmup: [], main: [], cooldown: []`) → check
  // somebody in.
  //
  // What it found is not the empty pools. Those behave: the skeleton is honest,
  // the toast says "0 exercises loaded", the Live screen runs the timer and
  // nothing throws. It is that Start carried the class's NAME and not its TYPE,
  // so the Builder opened on CrossFit under the heading "Barre Flow" — covered
  // by its own test in `schedule.spec.js`; asserted here because a gym-authored
  // type is the case where the disagreement is loudest, and because this is the
  // only test that walks the whole thing to a stored attendance row.
  test("a gym's own type: scheduled, started, run and checked into", async ({ page }) => {
    const errors = watchConsole(page);
    // A Start button exists only inside the 4h window either side of the slot,
    // so the clock is fixed or this passes most of the day and fails at 02:00.
    await page.clock.setFixedTime(new Date(2026, 6, 14, 18, 5, 0));   // Tue, 18:05
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    const gymKey = Object.keys((await stored(page, KEY)).classes).find(k => k.startsWith("gym-"));
    await closeLibrary(page);

    // ── 1. It can be put on the schedule. This is the whole of §1a.
    await nav(page, "Schedule");
    await page.getByRole("button", { name: "+ Add class" }).click();
    await page.getByPlaceholder("Class name").fill("Barre Flow");
    await page.getByLabel("Class type").selectOption(gymKey);
    await page.locator("select").filter({ has: page.locator('option[value="Mon"]') }).selectOption("Tue");
    await page.locator("select").filter({ has: page.locator('option[value="18:00"]') }).selectOption("18:00");
    await page.getByRole("button", { name: "Add to schedule" }).click();

    const rule = (await stored(page, "jungle_user_classes")).find(r => r.name === "Barre Flow");
    expect(rule, "precondition: the rule must have been created").toBeTruthy();
    expect(rule.type, "the rule stores the gym's KEY, not its label").toBe(gymKey);

    // ── 2. The grid names it by LABEL, not by the key. `toContainText` reads
    //      textContent and ignores the cell's uppercase transform, so this is
    //      checked case-insensitively.
    await expect(page.getByText(/^Barre$/i)).toBeVisible();
    await expect(page.getByText(gymKey), "the storage key must never reach a coach's screen")
      .toHaveCount(0);

    // ── 3. Start. The occurrence records the gym's own key — which is what makes
    //      N2 able to count this gym's own class type at all.
    await page.getByLabel("Start Barre Flow at 18:00").click();
    const published = await stored(page, "jungle_class_instances");
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ name: "Barre Flow", classType: gymKey });

    // ── 4. …and the Builder says so rather than claiming CrossFit.
    await expect(page.getByTestId("scheduled-type-notice")).toContainText(`Scheduled as ${TYPE}`);
    await page.getByRole("button", { name: `Load ${TYPE}` }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByLabel("Class type")).toHaveValue(gymKey);

    // ── 5. The empty pools. A gym-authored type has no movements, so the honest
    //      outcome is a usable skeleton and a count of zero — not a silent
    //      failure, and not somebody else's exercises.
    await expect.poll(async () =>
      ((await stored(page, "jungle_draft_class"))?.stages || []).map(s => (s.exercises || []).length),
      { message: "a gym type's stages come up empty, by construction" }).toEqual([0, 0, 0]);
    const stages = (await stored(page, "jungle_draft_class")).stages;
    expect(stages.map(s => s.type), "the skeleton still needs a warm-up and a cool-down")
      .toEqual(expect.arrayContaining(["warmup", "cooldown"]));
    expect(stages.every(s => s.name && s.dur > 0)).toBe(true);

    // ── 6. Run it and check somebody in. An empty class is still a class that
    //      happened, and this is the record the gym is actually paying for.
    await page.getByRole("button", { name: /Start Session/i }).click();
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await page.getByPlaceholder(/Search or type/i).fill("Sarah Chen");
    await page.getByRole("button", { name: /Add .*Sarah Chen/ }).click();

    // THE assertion, on the STORED rows. No second occurrence, the check-in on
    // the row the Schedule published, and the append-only class_type column
    // carrying the gym's own key rather than a display string or a stray
    // "crossfit" picked up on the way through the Builder.
    const ci = await stored(page, "jungle_class_instances");
    expect(ci, "one class was run, so there is one occurrence").toHaveLength(1);
    expect(ci[0].classType).toBe(gymKey);
    const att = await stored(page, "jungle_attendance");
    expect(att).toHaveLength(1);
    expect(att[0].classInstanceId).toBe(published[0].id);

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // ── The Exercise Library under a class type with nothing in it ─────────────
  //
  // `makeClassType` gives one sub-type with `warmup: [], main: [], cooldown: []`,
  // and NO built-in class type has an empty pool — verified by walking the whole
  // catalogue, and it is why this state had never been rendered before DEC-16.
  //
  // Most of it turned out to be right, and that is worth pinning rather than
  // rewriting: browsing says so in words, editing offers the one control that
  // fixes it, and the counts on the chips and tabs are honest zeroes. The test
  // exists because nothing had ever LOOKED.
  test("an empty pool says it is empty, and offers the way out of it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();

    const dialog = page.getByRole("dialog");
    // The chip counts what the type actually holds — zero, and it says zero
    // rather than showing a chip that looks like the others.
    await expect(dialog.getByRole("button", { name: new RegExp(`^${TYPE}\\s*0$`) })).toBeVisible();
    for (const stage of ["Warm-up", "Main set", "Cool-down"]) {
      await expect(dialog.getByRole("button", { name: new RegExp(`^${stage} 0$`) })).toBeVisible();
    }

    // In EDIT mode the affordance carries the meaning: there is exactly one
    // thing to do and the button says it.
    await expect(dialog.getByRole("button", { name: /Add exercise to this set/i })).toBeVisible();

    // Leaving edit mode, a browsing coach is TOLD, rather than shown a blank
    // panel they have to interpret.
    await page.getByRole("button", { name: /Done/ }).first().click();
    await expect(dialog.getByText(/No exercises for this stage yet/i)).toBeVisible();

    // CONTROL (§0b#1): the same panel on a type that HAS movements. Without it,
    // "the empty state rendered" and "the panel renders nothing either way"
    // are the same observation.
    await dialog.getByRole("button", { name: /^CrossFit/ }).click();
    await expect(dialog.getByText(/No exercises for this stage yet/i)).toHaveCount(0);
    await expect(dialog.getByText("Thruster")).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  // Adding the first movement to a type that has none has to reach STORAGE, not
  // just the screen — this is the gym writing its own catalogue for the first
  // time, and `updateExerciseList` rebuilds a nested path four levels deep.
  test("the first movement added to a gym's type is stored under it", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    const gymKey = Object.keys((await stored(page, KEY)).classes).find(k => k.startsWith("gym-"));

    await page.getByRole("dialog").getByRole("button", { name: /Add exercise to this set/i }).click();

    await expect.poll(async () =>
      (await stored(page, KEY)).classes[gymKey]?.subTypes?.general?.main?.length,
      { message: "the movement must land under the GYM's type, not a built-in one" }).toBe(1);
    const sub = (await stored(page, KEY)).classes[gymKey].subTypes.general;

    expect(sub.main, "the default stage tab is Main set, so that is where it goes").toHaveLength(1);
    expect(sub.warmup, "and it must not be duplicated into the other pools").toHaveLength(0);
    expect(sub.cooldown).toHaveLength(0);
    expect(sub.main[0].n).toBeTruthy();
    // The built-in catalogue is untouched — a gym editing its own type must not
    // write into CrossFit's pools.
    expect((await stored(page, KEY)).classes.crossfit).toBeUndefined();
  });

  // 🔴 "Browse Library" from the Builder opened on `classKeys[0]` — CrossFit —
  // whatever class the coach was building. So a coach one press from adding a
  // movement to their Barre class was looking at CrossFit's 38, and the gym's
  // OWN type sorts last in a horizontally-scrolling chip row: the hardest chip
  // to reach, from the one screen where it is the point.
  test("Browse Library opens on the class the coach is building", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    const gymKey = Object.keys((await stored(page, KEY)).classes).find(k => k.startsWith("gym-"));
    await closeLibrary(page);

    await nav(page, "Class Builder");
    await page.getByLabel("Class type").selectOption(gymKey);
    const confirm = page.getByRole("button", { name: "Apply", exact: true });
    if (await confirm.count()) await confirm.click();
    await expect(page.getByLabel("Class type"), "precondition: the Builder is on the gym's type")
      .toHaveValue(gymKey);

    await page.getByRole("button", { name: /Browse Library/i }).click();
    const dialog = page.getByRole("dialog");
    // The gym's type is the one showing, which is only observable through what
    // the panel holds: an empty pool for Barre, CrossFit's movements otherwise.
    await expect(dialog.getByText(/No exercises for this stage yet/i)).toBeVisible();
    await expect(dialog.getByText("Thruster"),
      "opening on CrossFit is the defect — its movements must not be what is on screen")
      .toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  // The nav destination has no class in hand, so it keeps opening on the first
  // one. Asserted because "follow the Builder" must not become "follow nothing".
  test("the Exercise Library nav destination still opens on the first class", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Exercise Library");
    await expect(page.getByRole("dialog").getByText("Thruster")).toBeVisible();
  });

  // The dashboard is the fourth surface that had its own copy of the catalogue's
  // colours (`CLASS_COLORS`, App.jsx) and the only one that printed the stored
  // value straight onto the screen. A coach read `GYM-BARRE-MRKHJ2LC` there.
  test("the gym's type reads as its own name on the dashboard, not as a key", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();
    const gymKey = Object.keys((await stored(page, KEY)).classes).find(k => k.startsWith("gym-"));
    await closeLibrary(page);

    // `daily`, so this does not depend on what day the suite runs.
    await page.evaluate(k => {
      localStorage.setItem("jungle_user_classes", JSON.stringify([
        { id: "d1", name: "Barre Flow", type: k, coach: "", day: "Mon", slot: "06:00", dur: "45m", repeat: "daily" },
      ]));
    }, gymKey);
    await page.reload();

    await expect(page.getByTestId("today-class")).toHaveCount(1);
    await expect(page.getByTestId("today-class-type")).toHaveText(TYPE);
    await expect(page.getByText(gymKey)).toHaveCount(0);

    // A gym-authored type has no hex of its own — `makeClassType` gives it
    // `var(--accent)`, the gym's colour, which is exactly right here. The
    // Schedule grid cannot use it because it appends 8-bit alpha; this row
    // paints it neat.
    await expect(page.getByTestId("today-class-color"))
      .toHaveAttribute("style", /var\(--accent\)/);
  });

  // Reset means the BUILT-IN catalogue. If `handleReset` read the merged library
  // it would reset to whatever the gym currently has, i.e. to nothing.
  test("Reset to defaults removes the gym's type", async ({ page }) => {
    await freshApp(page);
    await openLibraryEditMode(page);
    await addClassType(page, TYPE);
    await expect.poll(async () => await stored(page, KEY)).not.toBeNull();

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByText("Reset to Defaults?")).toBeVisible();
    await page.getByRole("button", { name: "Reset Library" }).click();

    await expect.poll(async () => await stored(page, KEY),
      { message: "reset must drop the override row entirely" }).toBeNull();

    // Reset leaves the Library open, so it still has to be closed before the
    // sidebar is reachable.
    await closeLibrary(page);
    await nav(page, "Class Builder");
    await expect(page.locator("select").first()).not.toContainText(TYPE);
  });
});
