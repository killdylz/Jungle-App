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

// ── The Class Builder's stage removal — the one that had no guard at all ─────
//
// 🔴 THE SWEEP ABOVE MISSED IT FOR TWENTY SESSIONS, and the shape of the miss is
// worth more than the fix. This file enumerates the destructive actions somebody
// thought of; a stage removal that writes straight to `jungle_draft_class` was
// never on the list, so "every destructive action, reversed" was true of the list
// and not of the product.
//
// `handleRemoveStage` was one line — `setStages(ss => ss.filter((_,j)=>j!==i))`
// — thirty lines above `handleNewClass`, which carries a paragraph explaining why
// destroying ONE draft needs an undo. Removing a stage destroys part of that same
// draft plus every exercise in it, on a single click, with no confirm, no undo
// and no toast. It survived a reload.
//
// ⚠️ THE POSITION IS THE ASSERTION. An undo that restores the stage to the END of
// the class has not restored the class — the repo's rule is that the closure
// holds the PRIOR LIST, not the deleted row, and a test that only counted stages
// would pass on the version that appends.
test.describe("removing a stage from the Class Builder", () => {
  const names = (d) => (d.stages || []).map(s => s.name);

  test("🔴 says what it took, and Undo puts it back where it was", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");

    // POSITIVE CONTROL: the default class really is on screen, and the stage
    // about to be removed really has exercises in it.
    const before = await stored(page, "jungle_draft_class");
    expect(names(before)).toEqual(["Warm-Up", "Circuit Blast", "Strength Block", "Active Recovery", "Cool-Down"]);
    expect(before.stages[2].exercises.length).toBe(2);

    await page.getByRole("button", { name: "Remove Strength Block" }).click();

    // It NAMES what went, and counts what went with it. "Removed Strength Block"
    // and "Removed Strength Block and its 2 exercises" are different amounts of
    // alarm and only the second is true.
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Strength Block");
    await expect(toast).toContainText("2 exercises");

    const after = await stored(page, "jungle_draft_class");
    expect(names(after)).toEqual(["Warm-Up", "Circuit Blast", "Active Recovery", "Cool-Down"]);

    await toast.getByRole("button", { name: "Undo" }).click();

    // 🔴 IN ITS OWN PLACE, third of five. An undo that appends passes a count.
    const back = await stored(page, "jungle_draft_class");
    expect(names(back)).toEqual(["Warm-Up", "Circuit Blast", "Strength Block", "Active Recovery", "Cool-Down"]);
    expect(back.stages[2].exercises.map(e => e.n)).toEqual(["Back Squat", "Overhead Press"]);
    expectNoConsoleErrors(errors);
  });

  test("the removal is a real write, and so is the undo", async ({ page }) => {
    // The store, across a reload, on both sides. A removal held only in React
    // state would look identical until the coach came back to it.
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");

    await page.getByRole("button", { name: "Remove Cool-Down" }).click();
    await page.reload();
    await nav(page, "Class Builder");
    expect(names(await stored(page, "jungle_draft_class"))).not.toContain("Cool-Down");

    // And the undo, taken before a reload, survives one.
    await page.getByRole("button", { name: "Remove Warm-Up" }).click();
    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await page.reload();
    await nav(page, "Class Builder");
    const back = names(await stored(page, "jungle_draft_class"));
    expect(back[0]).toBe("Warm-Up");
    expectNoConsoleErrors(errors);
  });

  test("a stage with nothing in it is not accused of holding exercises", async ({ page }) => {
    // The count is real arithmetic, not a fixed sentence. A new stage is empty,
    // and "and its 0 exercises" would be the confident wrong number this repo
    // ranks below no number at all.
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");
    await page.getByRole("button", { name: "Add stage" }).click();

    const added = await stored(page, "jungle_draft_class");
    const last = added.stages[added.stages.length - 1];
    expect(last.exercises).toEqual([]);          // positive control

    await page.getByRole("button", { name: `Remove ${last.name}` }).click();
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText(last.name);
    await expect(toast).not.toContainText("exercise");
    expectNoConsoleErrors(errors);
  });
});

// ── Smart Distribute — the control that overwrote a written class ────────────
//
// 🔴 THE BIGGEST OF THE THREE, and the one whose copy was actively misleading.
// `distributeLibraryExercises` maps EVERY stage to `{...stage, exercises}`: a
// coach's own movements are not merged, appended to, or spared when the stage is
// non-empty. They are replaced. The toast said "⚡ 11 exercises across 2 stages",
// which is a sentence about a gain, for a click that had just deleted their
// class.
//
// The Builder already knew how to tell: `hasCustomExercises` / `anyCustom` sit
// forty lines above the button and gate BOTH the class-type picker and the style
// picker behind a confirm before replacing stages. The button between those two
// pickers consulted neither.
test.describe("Smart Distribute over a class the coach wrote", () => {
  const authored = {
    name: "Dylan’s Tuesday", classChoice: { classType: "crossfit", subType: "wod" },
    stages: [
      { id:"s1", type:"warmup",   name:"Warm-Up",  dur:300, exercises:[{ n:"MY OWN WARMUP", s:"", r:"5 min", rest:"" }], tracks:[] },
      { id:"s2", type:"strength", name:"The Lift", dur:900, exercises:[{ n:"MY OWN LIFT",   s:"5", r:"5", rest:"3m" }], tracks:[] },
    ],
  };
  const exOf = (d) => (d.stages || []).map(s => (s.exercises || []).map(e => e.n));

  async function seedAuthored(page) {
    await freshApp(page);
    await page.evaluate((c) => localStorage.setItem("jungle_draft_class", JSON.stringify(c)), authored);
    await page.reload();
    await nav(page, "Class Builder");
  }

  test("🔴 says it REPLACED them, and Undo gives them back", async ({ page }) => {
    const errors = watchConsole(page);
    await seedAuthored(page);

    // POSITIVE CONTROL: the authored class really loaded.
    expect(exOf(await stored(page, "jungle_draft_class"))).toEqual([["MY OWN WARMUP"], ["MY OWN LIFT"]]);

    await page.getByRole("button", { name: "Smart Distribute" }).click();

    const toast = page.getByTestId("toast");
    // The word that was missing. "11 exercises across 2 stages" is true and reads
    // as an addition; a coach who has just lost their class needs the verb.
    await expect(toast).toContainText("Replaced 2 exercises");
    await expect(toast).toContainText("from the library");

    const after = await stored(page, "jungle_draft_class");
    expect(after.stages[0].exercises.length).toBeGreaterThan(1);
    expect(exOf(after).flat()).not.toContain("MY OWN WARMUP");

    await toast.getByRole("button", { name: "Undo" }).click();

    // Their own movements, in their own stages, in order.
    expect(exOf(await stored(page, "jungle_draft_class"))).toEqual([["MY OWN WARMUP"], ["MY OWN LIFT"]]);
    expectNoConsoleErrors(errors);
  });

  test("the undo is a real write, not screen state", async ({ page }) => {
    const errors = watchConsole(page);
    await seedAuthored(page);
    await page.getByRole("button", { name: "Smart Distribute" }).click();
    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await page.reload();
    await nav(page, "Class Builder");
    expect(exOf(await stored(page, "jungle_draft_class"))).toEqual([["MY OWN WARMUP"], ["MY OWN LIFT"]]);
    expectNoConsoleErrors(errors);
  });

  test("filling EMPTY stages is still reported as a gain, with no undo", async ({ page }) => {
    // 🔴 THE CONTROL, and a product rule rather than a technicality:
    // `handleNewClass` says "an undo offering to restore an empty plan is noise".
    // Nothing was taken here, so the sentence must not claim anything was, and
    // no Undo may appear — a version that always says "Replaced 0 exercises"
    // would pass the test above and be wrong every time a coach starts empty.
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate(() => localStorage.setItem("jungle_draft_class", JSON.stringify({
      name: "Blank", classChoice: { classType: "crossfit", subType: "wod" },
      stages: [{ id:"s1", type:"warmup", name:"Warm-Up", dur:300, exercises:[], tracks:[] }],
    })));
    await page.reload();
    await nav(page, "Class Builder");
    expect(exOf(await stored(page, "jungle_draft_class"))).toEqual([[]]);   // positive control

    await page.getByRole("button", { name: "Smart Distribute" }).click();

    // 🔴 ONE READ, NOT THREE ASSERTIONS, and the reason is this file's own
    // subject. A toast with no undo lives 2500ms; `not.toContainText("Replaced")`
    // and `toHaveCount(0)` on the Undo button, evaluated a moment later, are both
    // satisfied by the toast having EXPIRED. That is CLAUDE.md's toHaveCount(0)
    // trap in its "already gone" form, and it would go green on exactly the
    // version this test exists to catch. `innerText()` auto-waits for the element,
    // so a toast that never rendered fails instead of passing quietly, and the
    // three claims are read off one snapshot. The Undo button is a child of
    // `[data-testid="toast"]`, so its label is in that text if it is there at all.
    const said = await page.getByTestId("toast").innerText();
    expect(said, "the toast did not report the fill").toContain("exercises across 1 stage");
    expect(said).not.toContain("Replaced");
    expect(said).not.toContain("Undo");
    expect(exOf(await stored(page, "jungle_draft_class"))[0].length).toBeGreaterThan(1);
    expectNoConsoleErrors(errors);
  });
});

// ── "Build for me" and "Or insert a template" — the doors past the confirm ────
//
// 🔴 THE GUARD EXISTED AND THREE CALLERS WALKED PAST IT. `applyTemplate` replaces
// the whole stage list. `handleClassChange` checked `anyCustom` first and raised
// a "replace your stages?" bar; `runSmartBuild`'s fallback and every tile under
// "Or insert a template" called `applyTemplate` directly and did not.
//
// ⚠️ The fallback is not an edge case — it is the ONLY reachable Build-for-me
// path on the shipped build. The branch above it needs `supabaseEnabled &&
// supabase` to invoke a `smart-build` edge function, and the deployed build has
// neither, so pressing Build always lands in `smartPickClass` → `applyTemplate`.
//
// 🔴 AND THE LABEL DID NOT FOLLOW THE STAGES. `classChoice` was written by
// `handleClassChange` and by nothing else, so both dialog doors left a five-stage
// Yoga class stored as `{classType:"crossfit"}`. That is not cosmetic: it reaches
// `LiveScreen` as `classType` and `ensureClassInstance` writes it to
// `class_instances.class_type`, so the class ran into the gym's attendance
// history under the wrong type — the input `classTypeRetention.js` and Analytics
// read. It also rides `handleExportClass` into the saved .json, and Smart
// Distribute reads it, so the two buttons beside each other disagreed about what
// class was on screen.
test.describe("replacing the whole class from the Build dialog", () => {
  const AUTHORED = {
    name: "Dylan’s Tuesday", classChoice: { classType: "crossfit", subType: "wod" },
    stages: [
      { id:"s1", type:"warmup",   name:"Warm-Up",  dur:300, exercises:[{ n:"MY OWN WARMUP", s:"", r:"5 min", rest:"" }], tracks:[] },
      { id:"s2", type:"strength", name:"The Lift", dur:900, exercises:[{ n:"MY OWN LIFT", s:"5", r:"5", rest:"3m" }], tracks:[] },
    ],
  };
  const names = (d) => (d.stages || []).map(s => s.name);

  async function seedAuthored(page, draft = AUTHORED) {
    await freshApp(page);
    await page.evaluate((c) => localStorage.setItem("jungle_draft_class", JSON.stringify(c)), draft);
    await page.reload();
    await nav(page, "Class Builder");
  }

  // Both doors, same claim. The template tile is the one a coach reaches by
  // accident; the Build button is the one they reach on purpose and which cannot
  // do what its dialog says on a build with no server.
  for (const [door, open] of [
    ["a template tile", async (page) => page.getByRole("button", { name: /Yoga/ }).click()],
    ["the Build button", async (page) => {
      await page.getByPlaceholder(/45 min HIIT/).fill("45 min yoga flow");
      await page.getByRole("button", { name: "Build", exact: true }).click();
    }],
  ]) {
    test(`🔴 ${door} asks before replacing a class the coach wrote`, async ({ page }) => {
      const errors = watchConsole(page);
      await seedAuthored(page);
      // POSITIVE CONTROL: the authored class really loaded.
      expect(names(await stored(page, "jungle_draft_class"))).toEqual(["Warm-Up", "The Lift"]);

      await page.getByRole("button", { name: /Build for me/ }).click();
      await open(page);

      await expect(page.getByText(/Apply .* template\?/)).toBeVisible();
      // Nothing is written until they say so. A confirm that fires AFTER the
      // write is decoration.
      const held = await stored(page, "jungle_draft_class");
      expect(names(held)).toEqual(["Warm-Up", "The Lift"]);
      expect(held.stages[0].exercises[0].n).toBe("MY OWN WARMUP");
      expectNoConsoleErrors(errors);
    });
  }

  test("🔴 Apply moves the stages and the stored class type together", async ({ page }) => {
    const errors = watchConsole(page);
    await seedAuthored(page);
    await page.getByRole("button", { name: /Build for me/ }).click();
    await page.getByRole("button", { name: /Yoga/ }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    const after = await stored(page, "jungle_draft_class");
    expect(names(after)).toContain("Sun Salutation");          // it really applied
    // 🔴 THE HALF THAT REACHED THE DATABASE. A Yoga class stored as crossfit is
    // what `ensureClassInstance` writes to `class_instances.class_type`.
    expect(after.classChoice.classType,
      "the stages are Yoga's and the stored class type is still the old one").toBe("yoga");
    expectNoConsoleErrors(errors);
  });

  test("and Undo returns the class AND its label, not one of them", async ({ page }) => {
    const errors = watchConsole(page);
    await seedAuthored(page);
    await page.getByRole("button", { name: /Build for me/ }).click();
    await page.getByRole("button", { name: /Yoga/ }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("replaced 2");
    await toast.getByRole("button", { name: "Undo" }).click();

    const back = await stored(page, "jungle_draft_class");
    expect(names(back)).toEqual(["Warm-Up", "The Lift"]);
    expect(back.stages[0].exercises[0].n).toBe("MY OWN WARMUP");
    // Restoring the stages under the new label would be a different class, not
    // the coach's one back.
    expect(back.classChoice.classType).toBe("crossfit");
    expect(back.classChoice.subType).toBe("wod");
    expectNoConsoleErrors(errors);
  });

  test("a draft with nothing in it applies straight through, unasked", async ({ page }) => {
    // 🔴 THE CONTROL. `anyCustom` is the whole point: a coach shaping an empty
    // draft is the overwhelmingly common case and must not be interrupted, and a
    // version that always confirmed would pass every test above.
    const errors = watchConsole(page);
    await seedAuthored(page, { name: "Blank", classChoice: { classType: "crossfit", subType: "wod" },
      stages: [{ id:"s1", type:"warmup", name:"Warm-Up", dur:300, exercises:[], tracks:[] }] });

    await page.getByRole("button", { name: /Build for me/ }).click();
    await page.getByRole("button", { name: /Yoga/ }).click();

    await expect(page.getByText(/Apply .* template\?/)).toHaveCount(0);
    const after = await stored(page, "jungle_draft_class");
    expect(names(after)).toContain("Sun Salutation");
    expect(after.classChoice.classType).toBe("yoga");
    // Nothing was lost, so nothing is offered back. One read — see the note in
    // "filling EMPTY stages" above for why three assertions here would pass on a
    // toast that had simply gone.
    const said = await page.getByTestId("toast").innerText();
    expect(said, "the toast did not report the template load").toContain("loaded");
    expect(said).not.toContain("replaced");
    expect(said).not.toContain("Undo");
    expectNoConsoleErrors(errors);
  });
});

// ── "Keep Current" is the one control that exists to say no ──────────────────
//
// 🔴 IT KEPT THE STAGES AND RENAMED THE CLASS. The two pickers set `classChoice`
// BEFORE raising the confirm — deliberately, so the `<select>` the coach just
// moved does not snap back while the bar underneath asks about it. But the
// button was `setTemplatePrompt(null)` and nothing else, so pressing the one
// control that means "do not touch my class" left the draft holding its own
// stages under the new type's name.
//
// Driven on a CrossFit draft: pick Yoga, press Keep Current, and the Builder
// header reads "Yoga · target RPE 7–8" above "MY OWN WARMUP". It is the same
// field and the same route to the database as the Build-dialog finding above —
// `classChoice` reaches `LiveScreen`, `ensureClassInstance` writes it to
// `class_instances.class_type`, and `classTypeRetention.js` reads it there.
test.describe("declining a template change", () => {
  const AUTHORED = {
    name: "Dylan’s Tuesday", classChoice: { classType: "crossfit", subType: "wod" },
    stages: [{ id:"s1", type:"warmup", name:"Warm-Up", dur:300,
               exercises:[{ n:"MY OWN WARMUP", s:"", r:"5 min", rest:"" }], tracks:[] }],
  };

  test("🔴 Keep Current keeps the class AND the class type", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate((c) => localStorage.setItem("jungle_draft_class", JSON.stringify(c)), AUTHORED);
    await page.reload();
    await nav(page, "Class Builder");

    // POSITIVE CONTROL: the authored draft loaded and the picker really moved.
    expect((await stored(page, "jungle_draft_class")).classChoice.classType).toBe("crossfit");
    await page.locator("select").first().selectOption("yoga");
    await expect(page.getByText(/Apply .* template\?/)).toBeVisible();

    await page.getByRole("button", { name: "Keep Current" }).click();
    await expect(page.getByText(/Apply .* template\?/)).toHaveCount(0);

    const after = await stored(page, "jungle_draft_class");
    expect(after.stages[0].exercises[0].n).toBe("MY OWN WARMUP");   // the stages, obviously
    // 🔴 The half that used to change anyway, and the half that reaches the
    // gym's attendance history.
    expect(after.classChoice.classType,
      "Keep Current kept the stages and renamed the class").toBe("crossfit");
    expect(after.classChoice.subType).toBe("wod");
    // And the picker agrees with the store, so the coach is not looking at a
    // control that disagrees with what it controls.
    expect(await page.locator("select").first().inputValue()).toBe("crossfit");
    expectNoConsoleErrors(errors);
  });

  test("Apply still applies — declining is a choice, not a broken button", async ({ page }) => {
    // The control. A "Keep Current" that reverted everything unconditionally, or
    // a prompt that could no longer apply, would pass the test above.
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate((c) => localStorage.setItem("jungle_draft_class", JSON.stringify(c)), AUTHORED);
    await page.reload();
    await nav(page, "Class Builder");

    await page.locator("select").first().selectOption("yoga");
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    const after = await stored(page, "jungle_draft_class");
    expect(after.classChoice.classType).toBe("yoga");
    expect((after.stages || []).map(s => s.name)).toContain("Sun Salutation");
    expectNoConsoleErrors(errors);
  });
});
