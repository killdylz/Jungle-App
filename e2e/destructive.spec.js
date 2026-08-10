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
//
// That trap is now one fewer: the coach delete's confirm is an IN-APP dialog
// rather than `window.confirm`, so these tests click a real button instead of
// negotiating with a native prompt Playwright would have silently cancelled. The
// warning stays because the Builder's rename is still a `window.prompt` and the
// next native dialog added anywhere will hit it again.

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
// The in-app confirm's own controls. `delete-coach-go` rather than a name match:
// the button says "Delete <coach name>", so matching on text would couple every
// test below to the sample coach's name.
const confirmPanel = (page) => page.getByTestId("delete-coach-confirm");
const confirmGo    = (page) => page.getByTestId("delete-coach-go");

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

    await deleteCoachBtn(page).click();

    const panel = confirmPanel(page);
    await expect(panel, "deleting a coach must ask first — it was one unguarded click").toBeVisible();
    // The confirm has to say what goes with them, or "are you sure?" is a
    // question the coach cannot actually answer. This is the reason it stopped
    // being a native prompt: the cascade inventory IS the guard, and a native
    // dialog renders it as one cramped run of text.
    const asked = await panel.innerText();
    expect(asked).toMatch(/class plan/i);
    expect(asked).toMatch(/movement/i);
    // And that the corpus is not backed up anywhere — a coach weighing this up is
    // entitled to know that (migrations 0005/0006 are still unapplied).
    expect(asked).toMatch(/not yet backed up|nothing else holds a copy/i);

    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toHaveCount(0);

    expect(await stored(page, KEYS.personas)).toEqual(before.personas);
    expect(await stored(page, KEYS.plans)).toEqual(before.plans);
    expect(await stored(page, KEYS.movements)).toEqual(before.movements);
    expectNoConsoleErrors(errors);
  });

  test("accepting deletes the coach, their plans and their catalogue", async ({ page }) => {
    await loadSampleCoach(page);
    const before = await stored(page, KEYS.personas);
    const victim = before[0];

    await deleteCoachBtn(page).click();
    await confirmGo(page).click();

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

    await deleteCoachBtn(page).click();
    await confirmGo(page).click();

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

    await deleteCoachBtn(page).click();
    await confirmGo(page).click();
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

// ── Discarding an unsaved plan edit ──────────────────────────────────────────
//
// The plan editor is 35 buttons and 82 fields of local React state (measured in
// the running app on the sample coach's plan) with four ways out, and all four
// used to throw the lot away in silence. The backdrop is the one with teeth: it
// is the entire screen outside a 720px panel, so hitting it is a miss rather
// than a decision.
//
// Deliberately NOT a confirm. An untouched open — look at a plan, close it —
// must stay instant, so the guard keys on `dirty` and the cost is paid only on
// the path where something is actually at stake.
test.describe("discarding an unsaved plan edit", () => {
  const openEditor = (page) => page.getByRole("button", { name: /^Edit plan / }).first().click();
  const titleField = (page) => page.getByLabel("Plan title");

  test("a backdrop click offers the edits back instead of dropping them", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);
    await openEditor(page);

    const saved = await titleField(page).inputValue();
    expect(saved, "positive control: the editor must open on a real plan").toBeTruthy();
    await titleField(page).fill("EDITED, NOT SAVED");

    // The backdrop, not the ✕ — the corner of the overlay is nowhere near the panel.
    await page.mouse.click(5, 5);
    await expect(page.getByRole("heading", { name: "Edit plan" })).toHaveCount(0);

    const undo = page.getByTestId("toast-undo");
    await expect(undo, "a discarded plan edit must be recoverable").toBeVisible();
    await expect(page.getByTestId("toast")).toContainText(/unsaved/i);
    await undo.click();

    // Back, with the edit intact — not merely reopened on the saved copy, which
    // is what "restore" would look like if the draft were not carried across.
    await expect(page.getByRole("heading", { name: "Edit plan" })).toBeVisible();
    await expect(titleField(page)).toHaveValue("EDITED, NOT SAVED");

    // And it is still only a draft: nothing has been written.
    const plans = await stored(page, KEYS.plans);
    expect(plans.some(pl => pl.title === "EDITED, NOT SAVED"),
      "an undo restores the EDITOR, it must not silently save").toBe(false);
    expectNoConsoleErrors(errors);
  });

  test("Escape and Cancel are guarded too, and Save still writes", async ({ page }) => {
    await loadSampleCoach(page);

    await openEditor(page);
    await titleField(page).fill("VIA ESCAPE");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("toast")).toContainText(/unsaved/i);

    // Restore, then discard the same edits again through Cancel — the draft has
    // to survive a round trip, or the second discard hands back an empty one.
    await page.getByTestId("toast-undo").click();
    await expect(titleField(page)).toHaveValue("VIA ESCAPE");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("toast")).toContainText(/unsaved/i);
    await page.getByTestId("toast-undo").click();

    // Saving from the restored draft writes the edit for real.
    await page.getByRole("button", { name: /Save plan/ }).click();
    await expect.poll(async () => (await stored(page, KEYS.plans)).some(pl => pl.title === "VIA ESCAPE"))
      .toBe(true);
  });

  test("closing an UNTOUCHED editor says nothing at all", async ({ page }) => {
    // The guard has to be free on the common path, or it is just a confirm with
    // extra steps. This is the assertion that stops it drifting into one.
    await loadSampleCoach(page);
    await openEditor(page);
    await expect(page.getByRole("heading", { name: "Edit plan" })).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(page.getByRole("heading", { name: "Edit plan" })).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveCount(0);
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

    await deleteCoachBtn(page).click();
    await confirmGo(page).click();
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
