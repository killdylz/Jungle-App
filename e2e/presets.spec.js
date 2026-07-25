import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── D4 · generation presets (spec §9.3) ──────────────────────────────────────
//
// §9.3's rule is that a coach PICKS, never prompts. `generationPresets.test.js`
// pins the arithmetic; this file pins that picking one produces a real class in
// the Builder, that the class differs the way the card promised, and — the part
// no unit test can reach — that the coach's own shape is not rewritten by the
// act of trying a variation.
//
// Driven against the SHIPPED sample coach, same as personas.spec.js: it is what
// a new gym meets, so its numbers are the ones worth asserting.

async function openPresets(page) {
  await freshApp(page);
  await nav(page, "Coaches");
  await page.getByRole("button", { name: /Load sample coach/ }).click();
  await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
  await page.getByRole("button", { name: /Generate draft/ }).click();
  await expect(page.locator('[data-testid="gen-presets"]')).toBeVisible();
}

const card = (page, name) => page.locator('[data-testid="gen-presets"] button').filter({ hasText: name });

test.describe("a coach picks a class instead of describing one", () => {
  test("offers every preset, each saying what it will change", async ({ page }) => {
    const errors = watchConsole(page);
    await openPresets(page);

    for (const name of ["The usual", "Something different", "Heavier day", "Engine day", "Short class"]) {
      await expect(card(page, name)).toBeVisible();
    }

    // The effect line is what the coach is being asked to trust. A preset that
    // cannot say what it changes is a prompt with a nicer name.
    await expect(card(page, "Short class")).toContainText(/\d+ → \d+ min/);
    await expect(card(page, "Heavier day")).toContainText(/\d+ → \d+ movements/);
    await expect(card(page, "Engine day")).toContainText(/conditioning first in \d+ block/);
    await expect(card(page, "Something different")).toContainText(/avoids your last \d+ drafts/);

    // U1 — none of our vocabulary reaches the card.
    const panel = await page.locator('[data-testid="gen-presets"]').innerText();
    expect(panel).not.toMatch(/blueprint|slot|movementCount|categor(y|ies)|schemeDefault/i);

    expectNoConsoleErrors(errors);
  });

  test("the written brief still exists, but is no longer what you meet first", async ({ page }) => {
    await openPresets(page);
    // Collapsed behind a summary — the presets are the default path, and the
    // brief is for what they do not cover.
    await expect(page.getByText("…or write a brief")).toBeVisible();
    await expect(page.getByPlaceholder(/Focus —/)).not.toBeVisible();
    await page.getByText("…or write a brief").click();
    await expect(page.getByPlaceholder(/Focus —/)).toBeVisible();
  });

  test("picking one lands a real class in the Builder", async ({ page }) => {
    const errors = watchConsole(page);
    await openPresets(page);

    await card(page, "Heavier day").click();

    // The Builder, with the class named after what was asked for.
    await expect(page.getByText("S360 — heavier day").first()).toBeVisible();
    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);

    // Read back the STORED object, not just the screen: it is the object that
    // syncs to Postgres, and session 4's defects were all cases where the two
    // disagreed.
    const gens = await stored(page, "jungle_persona_generations");
    expect(gens).toHaveLength(1);
    expect(gens[0].title).toBe("S360 — heavier day");
    expect(gens[0].plan.blocks.length).toBeGreaterThan(0);
    expect(gens[0].movements.length).toBeGreaterThan(0);

    expectNoConsoleErrors(errors);
  });

  // The promise the whole feature rests on: a preset is a way to DRAFT, not an
  // edit. "Try heavier this week" must not rewrite the format a coach has used
  // for years — and `source: "edited"` is what stops re-derivation overwriting
  // their decisions, so spending it here would be quietly destructive.
  test("never rewrites the coach's own shape", async ({ page }) => {
    await openPresets(page);
    const before = await stored(page, "jungle_personas");

    await card(page, "Engine day").click();
    await expect(page.getByText("S360 — engine day").first()).toBeVisible();

    const after = await stored(page, "jungle_personas");
    expect(after).toEqual(before);
  });

  test("a heavier day and an engine day are not the same class", async ({ page }) => {
    await openPresets(page);
    await card(page, "Heavier day").click();
    await expect(page.getByText("S360 — heavier day").first()).toBeVisible();

    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Generate draft/ }).click();
    await card(page, "Engine day").click();
    await expect(page.getByText("S360 — engine day").first()).toBeVisible();

    const gens = await stored(page, "jungle_persona_generations");
    const byTitle = Object.fromEntries(gens.map(g => [g.title, g]));
    const heavy = byTitle["S360 — heavier day"], engine = byTitle["S360 — engine day"];
    expect(heavy && engine).toBeTruthy();
    // An engine day carries more work per block than a heavier day.
    expect(engine.movements.length).toBeGreaterThan(heavy.movements.length);
  });

  test("a short class is actually shorter", async ({ page }) => {
    await openPresets(page);
    await card(page, "The usual").click();
    const usualMin = await page.locator("body").innerText()
      .then(t => Number(t.match(/(\d+) min ·/)?.[1]));

    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Generate draft/ }).click();
    await card(page, "Short class").click();
    const shortMin = await page.locator("body").innerText()
      .then(t => Number(t.match(/(\d+) min ·/)?.[1]));

    expect(usualMin).toBeGreaterThan(0);
    expect(shortMin).toBeLessThan(usualMin);
  });

  // The button on the shape card passes no preset. It used to be handed to a
  // <Btn> bare, which — once the handler took an argument — would have fed it a
  // MouseEvent where a preset belongs.
  test("the plain 'draft from this shape' button still works and takes no preset", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();

    await page.getByRole("button", { name: /Draft from this shape|Start a class from this shape/ }).click();

    await expect(page.getByText("S360 — from your class shape").first()).toBeVisible();
    const gens = await stored(page, "jungle_persona_generations");
    expect(gens[0].title).toBe("S360 — from your class shape");
    expectNoConsoleErrors(errors);
  });
});
