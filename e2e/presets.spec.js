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

// ── The ledger is keyed by the class type's NAME — the FOURTH reader ─────────
// Session 23 found three readers of that name and moved all three. This is the
// fourth. `recentGens` selects the ledger with `g.classType === curCT`, so rows
// left under the old name are not merely mis-filed — they are unreachable.
//
// Two things break at once, and only one of them is visible. The coach loses
// their "Recently generated" list and its Reopen buttons; and that same list is
// what `presetDraftOpts` is handed as `recent`, so the next draft is steered
// away from nothing and can hand back the class it produced last time. The
// second failure has no symptom on screen at all.
test.describe("the generation ledger follows a class type that gets renamed", () => {
  const renameTo = async (page, name) => {
    await page.getByRole("button", { name: /^Edit plan / }).first().click();
    await page.getByLabel("Class type").fill(name);
    await page.getByRole("button", { name: /Save plan/ }).click();
  };

  test("a rename carries the ledger, on screen and in storage", async ({ page }) => {
    const errors = watchConsole(page);
    await openPresets(page);
    await card(page, "Heavier day").click();
    await nav(page, "Coaches");

    // Precondition, stated rather than assumed: the ledger row exists and is
    // reachable. Without this the assertions below would pass on a coach who had
    // never generated anything.
    await expect(page.getByText(/Recently generated · 1/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen" })).toHaveCount(1);
    expect((await stored(page, "jungle_persona_generations"))[0].classType).toBe("S360");

    await renameTo(page, "S360 Strength");
    await expect(page.getByText("S360 STRENGTH — CLASS SHAPE")).toBeVisible();

    // Still reachable under the new name — this is what used to vanish.
    await expect(page.getByText(/Recently generated · 1/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen" })).toHaveCount(1);

    // And the STORED row moved, not just the view. The title is history and is
    // deliberately NOT rewritten — it records what the coach was handed.
    const gens = await stored(page, "jungle_persona_generations");
    expect(gens[0].classType).toBe("S360 Strength");
    expect(gens[0].title).toBe("S360 — heavier day");

    // §2.5 — through a reload, because storage being right and the screen being
    // right are separate questions and this defect had storage right throughout.
    await page.reload();
    await nav(page, "Coaches");
    await expect(page.getByText(/Recently generated · 1/)).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("re-filing one plan among several is a MOVE and leaves the ledger alone", async ({ page }) => {
    // The discriminating case, mirroring the pair session 23 built for the style
    // profile: if the old name still has plans under it, its history belongs to
    // it. A fix that carried the ledger unconditionally would pass the test
    // above and steal another class type's history here.
    const errors = watchConsole(page);
    await openPresets(page);
    await card(page, "Heavier day").click();
    await nav(page, "Coaches");

    // Add a SECOND plan under S360 so the name survives the edit below.
    await page.evaluate(() => {
      const plans = JSON.parse(localStorage.getItem("jungle_persona_plans") || "[]");
      plans.push({ ...JSON.parse(JSON.stringify(plans[0])), id: "plan-two", title: "S360 — second plan" });
      localStorage.setItem("jungle_persona_plans", JSON.stringify(plans));
    });
    await page.reload();
    await nav(page, "Coaches");

    await renameTo(page, "GC");

    // S360 still exists, so its generation stays with it.
    const gens = await stored(page, "jungle_persona_generations");
    expect(gens[0].classType, "a move must not drag the old type's history along").toBe("S360");

    expectNoConsoleErrors(errors);
  });
});

// ── Reopen ───────────────────────────────────────────────────────────────────
// Had zero coverage — no spec mentioned it. It is the only way back to a class
// the coach has already been given, and it hands the Builder a class type
// derived from the CURRENT tab rather than from the generation's own record.
test.describe("Reopen puts a past generation back in the Builder", () => {
  test("re-opens the recorded plan under the right Builder class", async ({ page }) => {
    const errors = watchConsole(page);
    await openPresets(page);
    await card(page, "Heavier day").click();
    await nav(page, "Coaches");

    const gens = await stored(page, "jungle_persona_generations");
    const recorded = gens[0];

    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByRole("button", { name: "Preview on TV" }).first()).toBeVisible();

    const draft = await stored(page, "jungle_draft_class");
    // S360 is a strength format, so it must land on the Builder's strength type
    // — the same assertion the first-generation path makes, now for the way back.
    expect(draft.classChoice?.classType).toBe("strength");
    // What came back is what was RECORDED, not a fresh draft wearing its name.
    expect(draft.stages.flatMap(s => (s.exercises || []).map(e => e.n)).length).toBeGreaterThan(0);
    expect(recorded.plan?.blocks?.length).toBeGreaterThan(0);
    expect(draft.stages).toHaveLength(recorded.plan.blocks.length);

    // Reopening is a READ. It must not append a second ledger row, or the
    // repeat-avoidance list would fill up with classes the coach never re-ran.
    expect(await stored(page, "jungle_persona_generations")).toHaveLength(1);

    expectNoConsoleErrors(errors);
  });

  test("still reaches the Builder after the class type has been renamed", async ({ page }) => {
    // The concern that opened this: `builderClass` is derived from the CURRENT
    // class type, not from the one the generation was created under. Now that a
    // rename re-keys the ledger the two agree — this pins that they do, because
    // the failure mode is a silently wrong Builder class rather than an error.
    const errors = watchConsole(page);
    await openPresets(page);
    await card(page, "Heavier day").click();
    await nav(page, "Coaches");

    await page.getByRole("button", { name: /^Edit plan / }).first().click();
    await page.getByLabel("Class type").fill("S360 Strength");
    await page.getByRole("button", { name: /Save plan/ }).click();
    await expect(page.getByText("S360 STRENGTH — CLASS SHAPE")).toBeVisible();

    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByRole("button", { name: "Preview on TV" }).first()).toBeVisible();

    const draft = await stored(page, "jungle_draft_class");
    expect(draft.classChoice?.classType, "the renamed type is still a strength format").toBe("strength");

    expectNoConsoleErrors(errors);
  });
});
