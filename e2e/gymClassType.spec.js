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
