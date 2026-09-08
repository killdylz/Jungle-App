import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { usedGym, installGym } from "./usedGym.js";

// ── Four doors that replaced the coach's whole class, on one click ───────────
//
// `destructiveSweep.spec.js` is what FOUND these: it presses every control on
// every screen and asks whether anything the gym had is gone with nothing
// offering it back. This file is the other half — it names them, drives each one
// the way a coach reaches it, and asserts the specific thing the fix has to do.
//
// The rule is `handleNewClass`'s and it predates all of this: replacing the
// coach's class is destruction, and destruction is confirmed or undoable. Five
// functions in App.jsx replace `stages` wholesale and exactly one of them
// honoured it.
//
// 🔴 The undo has to return the CLASS TYPE with the stages. Session 38 §4.3: a
// coach's stages under somebody else's class type is a different class, not
// their class back, and the label rides `classChoice` into
// `class_instances.class_type` through the Runner.
//
// ⚠️ The fourth door — "Open" a class file — is deliberately here rather than in
// the sweep. It needs `setInputFiles`, and a sweep that presses controls cannot
// hand the browser a file. A control the sweep structurally cannot reach is
// exactly the kind that goes unnoticed, so it is written down as well as tested.

const KEY = "jungle_draft_class";
const draft = (page) => stored(page, KEY);
const undoBtn = (page) => page.getByTestId("toast-undo");

async function authoredClass(page) {
  page.once("dialog", (d) => d.accept("MY OWN TUESDAY"));
  await page.getByRole("button", { name: "Rename class" }).click();
  await expect.poll(async () => (await draft(page))?.name).toBe("MY OWN TUESDAY");
  const d = await draft(page);
  expect(d.stages.flatMap((s) => s.exercises || []).length,
    "positive control: the class being destroyed must have movements in it").toBeGreaterThan(0);
  return d;
}

// What the coach would lose, in the form the assertions compare.
const fingerprint = (d) => ({
  name: d.name,
  stages: d.stages.map((s) => s.name),
  exercises: d.stages.flatMap((s) => (s.exercises || []).map((e) => e.n)),
  classType: d.classChoice?.classType || null,
});

async function expectReplacedAndUndoable(page, before) {
  const after = await draft(page);
  expect(fingerprint(after), "the class must actually have been replaced, or this test proves nothing")
    .not.toEqual(fingerprint(before));

  // One read, three assertions. A toast with no undo lives 2500ms, so separate
  // `not.toContainText` / `toHaveCount(0)` calls are both satisfied by it having
  // simply expired — session 38's own retraction, and the trap CLAUDE.md names.
  const said = await page.getByTestId("toast").innerText();
  expect(said, "the coach has to be told their class was replaced").toMatch(/replaced \d+ exercises/);
  expect(said).toContain("Undo");

  await undoBtn(page).click();
  await expect.poll(async () => fingerprint(await draft(page))).toEqual(fingerprint(before));
}

async function openBuilder(page) {
  await freshApp(page);
  await waitForApp(page);
  await nav(page, "Class Builder");
}

test.describe("replacing the coach's whole class offers it back", () => {
  test("the Builder's Jungle-presets picker", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);
    const before = await authoredClass(page);

    const sel = page.getByLabel("Start from a ready-made Jungle class");
    const value = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value).find((v) => v));
    await sel.selectOption(value);

    await expectReplacedAndUndoable(page, before);
    expectNoConsoleErrors(errors);
  });

  test("drafting a coach's class shape from the Coaches screen", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);
    const before = await authoredClass(page);

    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    await page.getByRole("button", { name: /Draft from this shape|Start a class from this shape/ }).click();

    await expectReplacedAndUndoable(page, before);
    expectNoConsoleErrors(errors);
  });

  test("opening a 1:1 session in the Builder", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await installGym(page, usedGym());
    await waitForApp(page);
    await nav(page, "Class Builder");
    const before = await authoredClass(page);

    await nav(page, "1:1 Clients");
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
    await page.getByRole("button", { name: "Open in Builder" }).click();

    await expectReplacedAndUndoable(page, before);
    expectNoConsoleErrors(errors);
  });

  test("opening a class file — and the undo brings the class TYPE back too", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await openBuilder(page);
    const before = await authoredClass(page);
    expect(before.classChoice?.classType, "positive control: there must be a class type to lose").toBeTruthy();

    // A file from another gym, carrying a class type that is not this draft's.
    const otherType = await page.getByLabel("Class type").locator("option")
      .evaluateAll((os, mine) => os.map((o) => o.value).find((v) => v && v !== mine),
                   before.classChoice.classType);
    const path = testInfo.outputPath("from-another-gym.json");
    fs.writeFileSync(path, JSON.stringify({
      jungleTemplate: true, version: 1, name: "Someone Else's Class",
      classType: otherType, subType: null,
      stages: [{ id: "x1", name: "Their Warmup", dur: 300, exercises: [{ n: "Their Movement" }], tracks: [] }],
    }));

    await page.getByLabel("Choose a Jungle class file to open").setInputFiles(path);
    await expect.poll(async () => (await draft(page))?.name).toBe("Someone Else's Class");
    expect((await draft(page)).classChoice?.classType).toBe(otherType);

    await expectReplacedAndUndoable(page, before);
    // Said again explicitly, because it is the half that is easy to drop: the
    // stages coming back under the imported gym's class type would be a
    // different class, and it is the label the Runner writes to the database.
    expect((await draft(page)).classChoice?.classType).toBe(before.classChoice.classType);
    expectNoConsoleErrors(errors);
  });
});
