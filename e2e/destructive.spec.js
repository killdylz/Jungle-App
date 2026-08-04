import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── REGRESSION §1.3 — every destructive action, reversed ─────────────────────
//
// The rule this sweep enforces, and it is a product rule rather than a testing
// one: a destructive action must either be CONFIRMED or be UNDOABLE, and the
// guard must scale with what is being destroyed.
//
// It was inverted. Deleting one exercise from the library asked "are you sure?".
// Deleting a COACH — taking their class corpus, the movement catalogue
// aggregated from it and their generation ledger — was a single unguarded click.
// An imported corpus is an LLM pass over a deck the coach has taught from for
// years; it is the most expensive data in the product and it was the least
// protected thing in it.
//
// ⚠️ PLAYWRIGHT AUTO-DISMISSES DIALOGS. A test that simply clicks a delete and
// asserts the row is gone would exercise CANCEL, see nothing happen, and pass
// for entirely the wrong reason if the confirm were later removed. Both paths
// are driven explicitly below, and the cancel path asserts the data SURVIVED.

const KEYS = {
  personas: "jungle_personas",
  plans: "jungle_persona_plans",
  movements: "jungle_persona_movements",
};

async function loadSampleCoach(page) {
  await freshApp(page);
  await nav(page, "Coaches");
  await page.getByRole("button", { name: /Load sample coach/ }).click();
  await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
}

const deleteCoachBtn = (page) => page.getByRole("button", { name: /^Delete coach / }).first();

test.describe("deleting a coach", () => {
  test("cancelling the confirm keeps the coach and their whole corpus", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);

    // Positive control: the corpus must actually exist before "it survived"
    // means anything. A seed that silently failed would make this pass empty.
    const before = {
      personas: await stored(page, KEYS.personas),
      plans: await stored(page, KEYS.plans),
      movements: await stored(page, KEYS.movements),
    };
    expect(before.personas.length, "the sample coach must load").toBeGreaterThan(0);
    expect(before.plans.length, "the sample coach must bring plans").toBeGreaterThan(0);
    expect(before.movements.length, "the sample coach must bring a catalogue").toBeGreaterThan(0);

    let asked = null;
    page.once("dialog", (d) => { asked = d.message(); d.dismiss(); });
    await deleteCoachBtn(page).click();

    expect(asked, "deleting a coach must ask first — it was one unguarded click").toBeTruthy();
    // The confirm has to say what goes with them, or "are you sure?" is a
    // question the coach cannot actually answer.
    expect(asked).toMatch(/class plan/i);
    expect(asked).toMatch(/movement/i);

    expect(await stored(page, KEYS.personas)).toEqual(before.personas);
    expect(await stored(page, KEYS.plans)).toEqual(before.plans);
    expect(await stored(page, KEYS.movements)).toEqual(before.movements);
    expectNoConsoleErrors(errors);
  });

  test("accepting deletes the coach, their plans and their catalogue", async ({ page }) => {
    await loadSampleCoach(page);
    const before = await stored(page, KEYS.personas);
    const victim = before[0];

    page.once("dialog", (d) => d.accept());
    await deleteCoachBtn(page).click();

    // Assert the STORED object, not just the screen — session 4's defects were
    // mostly cases where those two disagreed.
    await expect.poll(async () => (await stored(page, KEYS.personas)).some(p => p.id === victim.id))
      .toBe(false);
    const plans = await stored(page, KEYS.plans);
    expect(plans.filter(pl => pl.personaId === victim.id)).toEqual([]);
    const moves = await stored(page, KEYS.movements);
    expect(moves.filter(m => m.personaId === victim.id)).toEqual([]);
  });

  test("Undo puts the coach and every cascaded domain back", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);
    const before = {
      personas: await stored(page, KEYS.personas),
      plans: await stored(page, KEYS.plans),
      movements: await stored(page, KEYS.movements),
    };

    page.once("dialog", (d) => d.accept());
    await deleteCoachBtn(page).click();

    const undo = page.getByTestId("toast-undo");
    await expect(undo, "a delete this expensive must offer an undo").toBeVisible();
    await undo.click();

    // Everything back, not just the coach row. Restoring the persona alone would
    // leave an empty shell — the plans and catalogue are the thing that was
    // actually expensive.
    await expect.poll(async () => (await stored(page, KEYS.personas)).length)
      .toBe(before.personas.length);
    expect(await stored(page, KEYS.plans)).toEqual(before.plans);
    expect((await stored(page, KEYS.movements)).map(m => m.id).sort())
      .toEqual(before.movements.map(m => m.id).sort());

    // And the screen agrees with the store.
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("the undo survives a reload — it is a real write, not screen state", async ({ page }) => {
    await loadSampleCoach(page);
    const before = await stored(page, KEYS.plans);

    page.once("dialog", (d) => d.accept());
    await deleteCoachBtn(page).click();
    await page.getByTestId("toast-undo").click();
    await expect.poll(async () => (await stored(page, KEYS.plans)).length).toBe(before.length);

    // §1.5's rule applied to an undo: the only proof a write landed is that it
    // is still there after a reload.
    await page.reload();
    await nav(page, "Coaches");
    expect(await stored(page, KEYS.plans)).toEqual(before);
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
  });
});

test.describe("removing a class plan", () => {
  test("goes straight through, and Undo brings it back", async ({ page }) => {
    // No confirm here, deliberately: one row, visible on screen, cheap to
    // restore. Interrupting every correct deletion to guard the rare wrong one
    // is the trade a confirm makes and it is the wrong one at this size.
    await loadSampleCoach(page);
    const before = await stored(page, KEYS.plans);
    expect(before.length, "the sample coach must bring at least one plan").toBeGreaterThan(0);

    await page.getByRole("button", { name: /^Remove plan / }).first().click();
    await expect.poll(async () => (await stored(page, KEYS.plans)).length).toBe(before.length - 1);

    await page.getByTestId("toast-undo").click();
    await expect.poll(async () => (await stored(page, KEYS.plans)).length).toBe(before.length);
    expect(await stored(page, KEYS.plans)).toEqual(before);
  });
});

// ── The toast itself ─────────────────────────────────────────────────────────
test.describe("the toast primitive", () => {
  test("announces itself to a screen reader without interrupting", async ({ page }) => {
    await loadSampleCoach(page);

    // The live region must be mounted BEFORE the text arrives. A live region
    // inserted at the same moment as its content is frequently not announced at
    // all, which is the failure mode that looks like it works in every test.
    const region = page.getByTestId("toast-region");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("role", "status");

    page.once("dialog", (d) => d.accept());
    await deleteCoachBtn(page).click();
    await expect(page.getByTestId("toast")).toContainText("Deleted");
  });

  test("the empty region never swallows a click meant for the screen", async ({ page }) => {
    // It spans the full width at the bottom of the viewport. With pointer events
    // on, it would eat taps on the mobile bottom bar sitting underneath it.
    await loadSampleCoach(page);
    const pe = await page.getByTestId("toast-region")
      .evaluate(el => getComputedStyle(el).pointerEvents);
    expect(pe).toBe("none");
  });
});
