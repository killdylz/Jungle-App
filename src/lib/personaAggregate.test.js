// Persona aggregation. Every function here fails SILENTLY when it's wrong — a
// miscategorised class type drafts into the wrong Builder format, a lost alias
// splits one movement into two catalog rows, a dropped commonScheme gets clobbered
// to {} on the next sync. All three have actually happened in this codebase.
import { describe, it, expect } from "vitest";
import { classTypesOf, aggregateClassType, classCategory, aggregateMovements } from "./personaAggregate.js";
import { categoryOf } from "./movementTaxonomy.js";

// Shapes mirror the real Garage corpus: S360 = strength, GC = conditioning,
// Enduro = periodized endurance.
const s360 = {
  classType: "S360",
  plan: { blocks: [
    { label: "Warm Up", role: "warmup", scheme: { type: "time", rest_sec: 0 }, exercises: [{ name: "Light Jog", equip: "" }] },
    { label: "M1", role: "primary_lift", scheme: { type: "sets_reps", sets: 5, reps: [5], rir: 2, rest_sec: 180 },
      exercises: [{ name: "Back Squat", equip: "barbell" }] },
    { label: "A1+A2", role: "superset", scheme: { type: "sets_reps", sets: 3, reps: [12, 10, 10, 8], rir: 2, rest_sec: 90 },
      exercises: [{ name: "DB Bench", equip: "DB" }, { name: "Bent Row", equip: "DB" }] },
  ] },
};
const gc = {
  classType: "GC",
  plan: { blocks: [
    { label: "C1", role: "warmup", scheme: { type: "time" }, exercises: [{ name: "Row", equip: "erg", target: "400m" }] },
    { label: "C2", role: "circuit", scheme: { type: "amrap", note: "AMRAP 12min" },
      exercises: [{ name: "Burpee", equip: "bodyweight" }, { name: "KB Swing", equip: "KB" }] },
    { label: "C3", role: "finisher", scheme: { type: "rounds" }, exercises: [{ name: "Ski", equip: "erg", target: "500m" }] },
  ] },
};

describe("classTypesOf", () => {
  it("lists distinct class types in first-seen order", () => {
    expect(classTypesOf([s360, gc, { ...s360 }])).toEqual(["S360", "GC"]);
  });

  it("buckets a missing or blank class type as Uncategorized", () => {
    expect(classTypesOf([{ plan: { blocks: [] } }, { classType: "   ", plan: { blocks: [] } }])).toEqual(["Uncategorized"]);
  });

  it("handles no plans", () => {
    expect(classTypesOf([])).toEqual([]);
    expect(classTypesOf(null)).toEqual([]);
  });
});

describe("classCategory", () => {
  it("reads a barbell/superset class as strength", () => {
    // This drives CATEGORY_TO_BUILDER. Getting it wrong drafts a strength persona
    // into a circuit Builder type — the original item-9 bug.
    expect(classCategory([s360], "S360")).toBe("strength");
  });

  it("reads an erg/AMRAP class as conditioning", () => {
    expect(classCategory([gc], "GC")).toBe("conditioning");
  });

  it("lets block ROLE decide when the scheme type points the other way", () => {
    // Discriminating case: every block is a superset (strength role) but scored with
    // "rounds" (a conditioning scheme). Only the role weighting can carry this to
    // "strength" — without it the scheme mix wins and it reads as conditioning.
    // Verified by mutation: zeroing the role weight flips this to "conditioning".
    const roleLed = { classType: "R", plan: { blocks: [
      { role: "superset", scheme: { type: "rounds" }, exercises: [{ name: "DB Press", equip: "DB" }] },
      { role: "superset", scheme: { type: "rounds" }, exercises: [{ name: "Chin Up", equip: "bodyweight" }] },
    ] } };
    expect(classCategory([roleLed], "R")).toBe("strength");
  });

  it("lets the MOVEMENTS decide when the block container says otherwise", () => {
    // Discriminating case for the §9.2 taxonomy vote, and the reason it exists:
    // role and scheme describe the CONTAINER, not the contents. This class is
    // labelled circuit + AMRAP throughout (cond 4) but every movement in it is a
    // barbell lift (strength 4) — a strength session a coach happened to score
    // for time. Only reading what the movements ARE can carry it to "strength".
    // Verified by mutation: removing the taxonomy vote flips this to "conditioning".
    const contentsLed = { classType: "H", plan: { blocks: [
      { role: "circuit", scheme: { type: "amrap" }, exercises: [{ name: "Back Squat", equip: "barbell" }, { name: "Deadlift", equip: "barbell" }] },
      { role: "circuit", scheme: { type: "amrap" }, exercises: [{ name: "Bench Press", equip: "barbell" }, { name: "Overhead Press", equip: "barbell" }] },
    ] } };
    expect(classCategory([contentsLed], "H")).toBe("strength");
  });

  it("scores loaded carries as conditioning even in a strength-shaped block", () => {
    // Carry and sled work is often programmed like a lift — primary_lift role,
    // sets/reps scheme — which votes strength 3 on container signals alone. Four
    // loaded carries are still conditioning, and only the taxonomy knows that.
    // Verified by mutation: removing the conditioning vote flips this to "strength".
    const hyroxy = { classType: "HX", plan: { blocks: [
      { role: "primary_lift", scheme: { type: "sets_reps" }, exercises: [
        { name: "Sled Push" }, { name: "Sled Pull" }, { name: "Farmers Carry" }, { name: "Sandbag Lunge" },
      ] },
    ] } };
    expect(classCategory([hyroxy], "HX")).toBe("conditioning");
  });

  it("only scores the requested class type", () => {
    // Both plans present, but each class type must be judged on its own blocks.
    expect(classCategory([s360, gc], "S360")).toBe("strength");
    expect(classCategory([s360, gc], "GC")).toBe("conditioning");
  });

  it("falls back to mixed when there is nothing to judge", () => {
    expect(classCategory([], "S360")).toBe("mixed");
    expect(classCategory([{ classType: "X", plan: { blocks: [] } }], "X")).toBe("mixed");
  });
});

describe("aggregateClassType", () => {
  it("derives structure in canonical role order, not source order", () => {
    const p = aggregateClassType([s360], "S360");
    expect(p.structure.map(s => s.role)).toEqual(["warmup", "primary_lift", "superset"]);
    expect(p.planCount).toBe(1);
  });

  it("derives RIR and per-role rest medians", () => {
    const p = aggregateClassType([s360], "S360");
    expect(p.defaults.rir).toBe(2);
    expect(p.defaults.restByRole.primary_lift).toBe(180);
    expect(p.defaults.restByRole.superset).toBe(90);
  });

  it("parses RPE out of a legacy scheme note when there is no rpe field", () => {
    // Pre-increment-3 corpora put RPE in the note. Without the fallback, every
    // historical plan silently contributes no RPE default.
    const legacy = { classType: "E", plan: { blocks: [
      { role: "primary_lift", scheme: { type: "sets_reps", note: "@ RPE 7-8" }, exercises: [] },
    ] } };
    expect(aggregateClassType([legacy], "E").defaults.rpe).toBe(7.5); // range → midpoint
  });

  it("ranks the scheme mix by frequency", () => {
    const p = aggregateClassType([s360], "S360");
    expect(p.schemes[0]).toEqual({ type: "sets_reps", count: 2 });
  });
});

describe("aggregateMovements", () => {
  it("counts each movement per class type", () => {
    const cat = aggregateMovements([s360, gc]);
    const squat = cat.find(m => m.name === "Back Squat");
    expect(squat.classTypes).toEqual({ S360: 1 });
    expect(squat.equip).toBe("barbell");
  });

  it("folds an alias into its canonical movement instead of splitting the row", () => {
    // A coach renaming "Conv Deadlift" → "Deadlift" records an alias. If aliases
    // were ignored, the corpus would show two half-counted movements.
    const plans = [{ classType: "S360", plan: { blocks: [
      { role: "primary_lift", scheme: { type: "sets_reps" }, exercises: [{ name: "Conv Deadlift", equip: "barbell" }] },
    ] } }];
    const existing = [{ id: "m1", name: "Deadlift", aliases: ["Conv Deadlift"], equip: "barbell", meta: {} }];
    const out = aggregateMovements(plans, existing);
    expect(out.filter(m => /deadlift/i.test(m.name))).toHaveLength(1);
    expect(out[0].name).toBe("Deadlift");
    expect(out[0].classTypes).toEqual({ S360: 1 });
  });

  it("emits commonScheme in camelCase", () => {
    // Regression guard: this once emitted snake_case common_scheme, which hid the
    // derived scheme in the UI AND let savePersonaMovements clobber it to {}.
    const squat = aggregateMovements([s360]).find(m => m.name === "Back Squat");
    expect(squat).toHaveProperty("commonScheme");
    expect(squat).not.toHaveProperty("common_scheme");
    expect(squat.commonScheme).toMatchObject({ type: "sets_reps", sets: 5, rir: 2, rest_sec: 180 });
  });

  it("preserves a manually-edited row that no longer appears in any plan", () => {
    // Coach edits must never be silently dropped by a recompute.
    const edited = [{ id: "m9", name: "Retired Lift", aliases: ["Old Name"], equip: "barbell", meta: {} }];
    const out = aggregateMovements([s360], edited);
    const kept = out.find(m => m.name === "Retired Lift");
    expect(kept).toBeDefined();
    expect(kept.classTypes).toEqual({});   // counts zeroed, row retained
  });

  it("sorts by total usage so the coach's vocabulary leads", () => {
    const twice = { classType: "S360", plan: { blocks: [
      { role: "primary_lift", scheme: { type: "sets_reps" }, exercises: [{ name: "Back Squat", equip: "barbell" }] },
    ] } };
    expect(aggregateMovements([s360, twice])[0].name).toBe("Back Squat");
  });

  // ── Movement category (§9.2) ───────────────────────────────────────────────
  it("derives a category for each movement", () => {
    const cat = aggregateMovements([s360, gc]);
    expect(cat.find(m => m.name === "Back Squat").category).toBe("strength");
    expect(cat.find(m => m.name === "Burpee").category).toBe("conditioning");
    expect(cat.find(m => m.name === "KB Swing").category).toBe("conditioning");
  });

  it("leaves the category blank when the movement is not recognised", () => {
    // An honest blank the catalog can flag, never a confident wrong guess.
    // "Nonesuch Press" is deliberately fictional — never rename it to a real
    // movement, or this assertion silently stops testing anything.
    const plans = [{ classType: "S360", plan: { blocks: [
      { role: "circuit", scheme: {}, exercises: [{ name: "Nonesuch Press", equip: "" }] },
    ] } }];
    expect(aggregateMovements(plans)[0].category).toBe("");
  });

  it("keeps the coach's category override through a recompute", () => {
    // The whole point of storing the override in meta rather than in the derived
    // `category` field: re-aggregation refreshes the derivation and must not
    // touch the coach's decision. categoryOf() resolves the override at read time.
    const plans = [{ classType: "GC", plan: { blocks: [
      { role: "circuit", scheme: {}, exercises: [{ name: "Row", equip: "erg" }] },
    ] } }];
    const existing = [{ id: "m4", name: "Row", aliases: [], equip: "erg", meta: { category: "strength" } }];
    const row = aggregateMovements(plans, existing).find(m => m.name === "Row");
    expect(row.meta.category).toBe("strength");     // override survives
    expect(row.category).toBe("conditioning");      // derivation still refreshes
    expect(categoryOf(row)).toBe("strength");       // and the override is what wins
  });

  it("retains a row whose only edit is a category override", () => {
    // A category-only edit is a manual edit. If it did not count as one, the row
    // would vanish on the next recompute and take the coach's decision with it.
    const edited = [{ id: "m5", name: "Retired Move", aliases: [], equip: "", meta: { category: "core" } }];
    const kept = aggregateMovements([s360], edited).find(m => m.name === "Retired Move");
    expect(kept).toBeDefined();
    expect(categoryOf(kept)).toBe("core");
  });
});
