import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── "Save to file" and "Open", driven as the round trip they are ─────────────
//
// The Builder's two file buttons had never been pressed by a test.
// `screens.spec.js` asserts that the WORDS "Save to file" and "Open" appear on
// the Class Builder, which is a claim about the header and not about the
// feature: an export that wrote `{}` and an import that dropped every exercise
// would both have kept that spec green.
//
// This is the feature a coach uses to move a class between two gyms, or to send
// one to another coach, or to keep a class they are about to overwrite. It is
// also the only backup the class has: the draft is one localStorage key, and
// there is no server for it in the shipped build.
//
// 🔴 The export carries `classType: classChoice.classType`, and that field is the
// one session 38 found could go stale — `handleExportClass` is listed by name in
// the comment above `applyTemplate` as one of the places a wrong `classChoice`
// travels to. So the round trip is also the regression test for it, and the
// second test below drives the exact gesture that produced the stale value: pick
// a different class type, then DECLINE it.
//
// ⚠️ `handleImportTemplate` answers bad input with a bare `alert()`, and
// CLAUDE.md's first testing trap is that Playwright auto-dismisses dialogs. A
// test that just calls `setInputFiles` with rubbish and asserts "the stages did
// not change" passes whether the guard exists or not, because a dismissed alert
// and no alert look identical from the outside. Both alert paths are therefore
// asserted on the dialog MESSAGE, captured into a variable, with the capture
// itself as the positive control.

const KEY = "jungle_draft_class";

const renderedStages = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[draggable]")]
      .map((el) => el.querySelector("button[aria-label^='Remove ']")?.getAttribute("aria-label"))
      .filter(Boolean)
      .map((label) => label.replace(/^Remove /, "")));

async function openBuilder(page) {
  await freshApp(page);
  await waitForApp(page);
  await nav(page, "Class Builder");
}

async function rename(page, name) {
  page.once("dialog", (d) => d.accept(name));
  await page.getByRole("button", { name: "Rename class" }).click();
  await expect.poll(async () => (await stored(page, KEY))?.name).toBe(name);
}

// The class-type `<select>`, and a value that is not the one already chosen.
async function pickAnotherClassType(page) {
  const sel = page.getByLabel("Class type");
  const current = await sel.inputValue();
  const options = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value));
  const next = options.find((v) => v && v !== current);
  expect(next, "the gym must offer more than one class type for this test to mean anything").toBeTruthy();
  await sel.selectOption(next);
  return { current, next };
}

// Click, catch the download, read it back. Same shape as `export.spec.js`.
async function grab(page, clicker) {
  const [download] = await Promise.all([page.waitForEvent("download"), clicker()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

const saveToFile = (page) => page.getByRole("button", { name: "Save to file", exact: true });
const fileInput  = (page) => page.getByLabel("Choose a Jungle class file to open");

test.describe("a class survives being written to a file and opened again", () => {
  test("the file carries the class the coach is looking at, and opening it puts that class back", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await openBuilder(page);

    await rename(page, "Thursday Engine");

    // Give the class a shape that is NOT the default draft, so "the import did
    // something" is distinguishable from "the import did nothing and the new
    // gym's own default happened to match".
    const { next } = await pickAnotherClassType(page);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect.poll(async () => (await stored(page, KEY))?.classChoice?.classType).toBe(next);

    const authored = await renderedStages(page);
    expect(authored.length, "the applied template must have produced stages").toBeGreaterThan(1);

    const { name: filename, text } = await grab(page, () => saveToFile(page).click());
    const file = JSON.parse(text);

    // The bytes that land in the coach's Downloads folder.
    expect(filename).toBe("jungle-class-thursday-engine.json");
    expect(file.jungleTemplate).toBe(true);
    expect(file.version).toBe(1);
    expect(file.name).toBe("Thursday Engine");
    expect(file.classType).toBe(next);
    expect(file.stages.map((s) => s.name)).toEqual(authored);
    // Stages without their exercises would be a shell of a class, and every
    // assertion above would still pass.
    expect(file.stages.some((s) => (s.exercises || []).length > 0),
      "the file must carry the movements, not only the stage headings").toBe(true);

    const path = testInfo.outputPath("thursday-engine.json");
    fs.writeFileSync(path, text);

    // A second gym — a clean store, its own default draft.
    await openBuilder(page);
    const defaults = await renderedStages(page);
    expect(defaults, "positive control: the receiving Builder must NOT already hold the exported class")
      .not.toEqual(authored);

    await fileInput(page).setInputFiles(path);

    await expect.poll(() => renderedStages(page)).toEqual(authored);
    await expect.poll(async () => (await stored(page, KEY))?.name).toBe("Thursday Engine");
    // The class type travels too — the header, the Room TV and
    // `class_instances.class_type` all read it.
    expect((await stored(page, KEY))?.classChoice?.classType).toBe(next);

    const landed = (await stored(page, KEY)).stages;
    expect(landed.map((s) => (s.exercises || []).map((e) => e.n)))
      .toEqual(file.stages.map((s) => (s.exercises || []).map((e) => e.n)));

    // Ids are re-minted on import, deliberately: two classes opened from two
    // files must not collide on React keys or on a stage id. Distinct, and not
    // the file's.
    const ids = landed.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toEqual(file.stages.map((s) => s.id));

    // And it is on disk, not only in React state.
    await page.reload();
    await waitForApp(page);
    await nav(page, "Class Builder");
    await expect.poll(() => renderedStages(page)).toEqual(authored);

    expectNoConsoleErrors(errors);
  });

  test("a class type the coach DECLINED does not travel into the file", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);
    await rename(page, "Declined");

    const before = (await stored(page, KEY))?.classChoice?.classType;
    expect(before, "positive control: there must be a class type to keep").toBeTruthy();

    // The gesture from session 38 §4.3: move the picker, then refuse the change.
    // Both pickers set `classChoice` BEFORE raising the bar, on purpose, so the
    // `<select>` does not snap back while the bar underneath asks about it —
    // which means "Keep Current" has to put the old value back, and the export
    // is one of the four places a wrong one ends up.
    const { next } = await pickAnotherClassType(page);
    await page.getByRole("button", { name: "Keep Current" }).click();
    await expect.poll(async () => (await stored(page, KEY))?.classChoice?.classType).toBe(before);

    const { text } = await grab(page, () => saveToFile(page).click());
    const file = JSON.parse(text);
    expect(file.classType, "the file must say what the coach kept, not what they refused").toBe(before);
    expect(file.classType).not.toBe(next);

    expectNoConsoleErrors(errors);
  });

  test("a file that is not a Jungle class is refused, and says so", async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await openBuilder(page);
    const before = await renderedStages(page);
    expect(before.length).toBeGreaterThan(1);

    // Valid JSON, wrong document — an export from something else entirely.
    const notATemplate = testInfo.outputPath("not-a-template.json");
    fs.writeFileSync(notATemplate, JSON.stringify({ hello: "world", stages: "five" }));

    let said;
    page.once("dialog", (d) => { said = d.message(); return d.accept(); });
    await fileInput(page).setInputFiles(notATemplate);
    await expect.poll(() => said, { message: "the guard must SAY something" }).toBeTruthy();
    expect(said).toMatch(/isn.t a Jungle template/i);
    expect(await renderedStages(page)).toEqual(before);

    // Not JSON at all — the `JSON.parse` catch, a different message and a
    // different code path in a different component.
    const notJson = testInfo.outputPath("not-json.json");
    fs.writeFileSync(notJson, "this is a photo of a whiteboard, not a class");

    let said2;
    page.once("dialog", (d) => { said2 = d.message(); return d.accept(); });
    await fileInput(page).setInputFiles(notJson);
    await expect.poll(() => said2).toBeTruthy();
    expect(said2).toMatch(/Could not read that file/i);
    expect(await renderedStages(page)).toEqual(before);
    expect((await stored(page, KEY))?.stages?.map((s) => s.name)).toEqual(before);

    expectNoConsoleErrors(errors);
  });
});
