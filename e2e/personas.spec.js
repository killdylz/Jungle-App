import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// REGRESSION-PLAN §1, tests 1, 2, 3 and 5 — the persona depth built in session 4,
// where six defects were found by driving the UI and none by unit tests.
//
// The fixture is the app's own sample coach (data/personas.seed.js): one S360
// class with a warm-up, a primary lift, two supersets and a finisher. Using the
// SHIPPED seed rather than a bespoke fixture is deliberate — it is the first
// thing a new gym sees, so a defect in how it renders is a defect in the demo.

async function loadSampleCoach(page) {
  await freshApp(page);
  await nav(page, "Coaches");
  await page.getByRole("button", { name: /Load sample coach/ }).click();
  await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
}

test.describe("Coaches — catalog, shape, draft", () => {
  // ── REGRESSION §1.1 · import → catalog truth ──────────────────────────────
  test("the movement catalog says what the class actually contains", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);

    const body = await page.locator("body").innerText();

    // Equipment and category, per movement. These are the two derived fields a
    // coach is asked to trust, and both had defects in session 4.
    for (const [name, equip, category] of [
      ["Conventional Deadlift", "barbell", "Strength"],
      ["Romanian Deadlift", "barbell", "Strength"],
      ["Chest-Supported Row", "dumbbell", "Strength"],   // a strength row, not the erg
      ["Assault Bike", "erg", "Conditioning"],
      ["Kettlebell Swing", "kettlebell", "Conditioning"],
      ["Glute Bridge", "bodyweight", "Warm-up"],
      ["World's Greatest Stretch", "bodyweight", "Mobility"], // a warm-up flow, not a cool-down
      ["Hanging Knee Raise", "bodyweight", "Core"],           // NOT strength — the generic
    ]) {                                                      // `raise` rule used to eat this
      const row = body.match(new RegExp(`${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[^\\n]*`))?.[0] || "";
      expect(row, `no catalog row for ${name}`).toBeTruthy();
      expect(row, `${name}: wrong equipment`).toContain(equip);
      expect(row, `${name}: wrong category`).toContain(category);
    }

    // No raw enum reached the screen.
    expect(body).not.toMatch(/\b(sets_reps|primary_lift|conditioning|warmup|cooldown)\b/);

    // The STORED catalog must agree with the rendered rows. Session 4's lesson:
    // a screen can be right while the object behind it is wrong, and it is the
    // object that syncs to Postgres.
    const movements = await stored(page, "jungle_persona_movements");
    const byName = Object.fromEntries((movements || []).map((m) => [m.name, m]));
    expect(byName["Conventional Deadlift"]?.equip).toBe("barbell");
    expect(byName["Hanging Knee Raise"]?.category).toBe("core");
    expect(byName["Assault Bike"]?.category).toBe("conditioning");

    expectNoConsoleErrors(errors);
  });

  // ── REGRESSION §1.2 · rules re-derivation ─────────────────────────────────
  test("a category stored under older rules is re-derived, not trusted", async ({ page }) => {
    // Catalogs are only re-aggregated when a coach's PLANS change, so a row
    // written under older rules would keep its stale value forever and no coach
    // would ever see a rules improvement. `categoryOf` reads through the rules
    // at render; this is that behaviour at the screen.
    await loadSampleCoach(page);

    await page.evaluate(() => {
      const key = "jungle_persona_movements";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      const hkr = list.find((m) => m.name === "Hanging Knee Raise");
      hkr.category = "strength";          // what the OLD rules produced
      localStorage.setItem(key, JSON.stringify(list));
    });
    await page.reload();
    await nav(page, "Coaches");

    // Wait for the row itself before the raw text read. `nav` already clears the
    // lazy-chunk fallback, but an `innerText()` snapshot has no auto-waiting of
    // its own, so it is the one read shape that can capture a half-rendered
    // screen — which is exactly what it did when Coaches became a lazy chunk.
    await expect(page.getByText("Hanging Knee Raise").first()).toBeVisible();
    const row = (await page.locator("body").innerText())
      .match(/Hanging Knee Raise[^\n]*/)?.[0] || "";
    expect(row, "a stale stored category was rendered instead of the derived one").toContain("Core");
    expect(row).not.toContain("Strength");
  });

  // ── REGRESSION §1.3 · class shape ─────────────────────────────────────────
  test("slot keys are the format, not one week's focus", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);

    // The shape is a RECURRING format. Session 4 derived slots named
    // "M1 — Deadlift", baking one week's focus into every future class — the
    // next deadlift-free week would still have said Deadlift.
    const body = await page.locator("body").innerText();
    const shape = body.slice(body.indexOf("S360 — CLASS SHAPE"), body.indexOf("MOVEMENTS"));
    expect(shape).toContain("M1");
    expect(shape, "the slot key carries this week's focus").not.toContain("Deadlift");
    expect(shape).toMatch(/Warm.?Up/i);
    expect(shape).toMatch(/A1 \+ A2/);

    expectNoConsoleErrors(errors);
  });

  // Was `fixme` — a real defect that drafted a **Chest-Supported Row into the
  // warm-up**. FIXED in the TAXONOMY, not the drafter, and the reason is worth
  // keeping: the two candidate fixes were not equally good, and the data said so.
  //
  // The chain was: the warm-up slot's categories are derived from the coach's own
  // warm-up block (Assault Bike, Banded Good Morning, Glute Bridge, World's
  // Greatest Stretch); `Banded Good Morning` classified as **strength**; so
  // `strength` became legal for the slot; the slot wants 4 and only 2 were
  // genuinely warm-up movements, so the drafter reached down the list for lifts.
  //
  // The proposed drafter fix — "stop back-filling past the slot's PRIMARY
  // categories" — CANNOT fix this, which only shows up if you print the derived
  // slot. All four categories tie at a count of 1, so there is no prevalence
  // signal separating `strength` from `mobility` here; the visible ordering comes
  // entirely from the CATEGORIES tie-break. Any rule that keeps the top tier and
  // drops the rest either keeps `strength` (it ties for top) or drops the coach's
  // real mobility and conditioning warm-up movements with it.
  //
  // The taxonomy was simply wrong: a BANDED good morning is a primer, not a lift.
  // Correcting it removes `strength` from the slot at source, and the warm-up now
  // drafts as exactly the four movements the coach actually warms up with.
  test("drafting from the shape puts no lift in the warm-up", async ({ page }) => {
    const errors = watchConsole(page);
    await loadSampleCoach(page);

    await page.getByRole("button", { name: /Draft from this shape/ }).click();
    await expect(page.getByRole("button", { name: "Preview on TV" }).first()).toBeVisible();  // two share this action; see smoke.spec.js

    const draft = await stored(page, "jungle_draft_class");
    const warmup = draft.stages.find((s) => /warm/i.test(s.name));
    expect(warmup, "the draft has no warm-up section").toBeTruthy();

    const LIFTS = ["Conventional Deadlift", "Romanian Deadlift", "Walking Lunge", "Chest-Supported Row"];
    const inWarmup = (warmup.exercises || []).map((e) => e.n);
    for (const lift of LIFTS) {
      expect(inWarmup, `${lift} was drafted into the warm-up`).not.toContain(lift);
    }

    expectNoConsoleErrors(errors);
  });

  // ── REGRESSION §1.5 · draft → Builder ─────────────────────────────────────
  test("a drafted class arrives in the Builder intact and correctly typed", async ({ page }) => {
    // "Item 9": a persona pushed to the Builder used to land as "untyped",
    // so Smart Distribute and the stage templates then worked from the wrong
    // class. The stored object is checked, not just the rendering.
    const errors = watchConsole(page);
    await loadSampleCoach(page);

    // Draft the coach's actual saved class rather than a generated one — this is
    // the path that works with Supabase off.
    // Named per plan since session 19 — one "Draft" per saved plan announced
    // identically, exactly as members.spec.js already selects `/Edit Ada/`
    // rather than a bare "Edit". Still the coach's own saved class, not a
    // generated one: that is the path that works with Supabase off.
    await page.getByRole("button", { name: /^Draft .* into the Builder$/ }).first().click();
    await expect(page.getByRole("button", { name: "Preview on TV" }).first()).toBeVisible();  // two share this action; see smoke.spec.js

    const draft = await stored(page, "jungle_draft_class");

    // S360 is a strength format, so it must land on the Builder's strength class
    // type — NOT the first key in WORKOUT_LIBRARY.
    expect(draft.classChoice?.classType).toBe("strength");

    // Every block became a stage, in order, with its label preserved.
    expect(draft.stages.map((s) => s.name)).toEqual([
      "Warm Up", "M1 — Deadlift", "A1 + A2 — Superset", "B1 + B2 — Superset", "C1 — Finisher",
    ]);

    // And the exercises came with them, with the scheme folded onto the row —
    // a stage that arrives with the right name and no work in it is the same
    // defect wearing a disguise.
    const m1 = draft.stages.find((s) => s.name.startsWith("M1"));
    expect(m1.exercises.map((e) => e.n)).toContain("Conventional Deadlift");
    expect(m1.exercises[0].s).toBe("5");          // 5 sets
    expect(m1.exercises[0].rest).toBe("180s");
    expect(m1.exercises[0].notes).toMatch(/RIR 2/);

    expectNoConsoleErrors(errors);
  });
});
