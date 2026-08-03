// Persona aggregation. Every function here fails SILENTLY when it's wrong — a
// miscategorised class type drafts into the wrong Builder format, a lost alias
// splits one movement into two catalog rows, a dropped commonScheme gets clobbered
// to {} on the next sync. All three have actually happened in this codebase.
import { describe, it, expect } from "vitest";
import { classTypesOf, aggregateClassType, classCategory, aggregateMovements,
         renameClassType, renameClassTypeInGenerations } from "./personaAggregate.js";
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

// ── renameClassType ──────────────────────────────────────────────────────────
// A class type is keyed by its NAME in three places at once. Renaming a plan's
// class type used to move only the plan, leaving the coach's saved shape and
// their extracted conventions keyed under a name nothing pointed at — a ghost
// tab on screen and the profile silently blank, with storage correct throughout.
describe("renameClassType", () => {
  const sp = () => ({
    blueprints:  { S360: { source: "edited", slots: [{ key: "M1" }] }, GC: { source: "preset", slots: [] } },
    byClassType: { S360: { focus: "strength", conventions: ["RIR 2 on primary work"] } },
  });

  it("carries the shape and the extracted profile to the new name", () => {
    const out = renameClassType(sp(), "S360", "S360 Strength", [{ classType: "S360 Strength" }]);
    expect(Object.keys(out.blueprints).sort()).toEqual(["GC", "S360 Strength"]);
    expect(out.blueprints["S360 Strength"].source).toBe("edited");
    expect(out.byClassType["S360 Strength"].conventions).toEqual(["RIR 2 on primary work"]);
    expect(out.byClassType.S360).toBeUndefined();
    expect(out.blueprints.GC).toBeDefined();          // an untouched type is untouched
  });

  it("leaves both alone when the old name still has plans — that is a MOVE", () => {
    // The coach re-filed ONE plan out of several. Both class types still exist
    // and each keeps its own identity; carrying the profile would steal it.
    const before = sp();
    const out = renameClassType(before, "S360", "GC", [{ classType: "S360" }, { classType: "GC" }]);
    expect(out).toBe(before);                          // same object: nothing to do
  });

  it("never clobbers a destination that already has its own", () => {
    // Folding a mis-extracted name into a type the coach already coaches keeps
    // the real one. The orphan still goes — nothing points at it any more.
    const out = renameClassType(sp(), "S360", "GC", [{ classType: "GC" }]);
    expect(out.blueprints.GC.source).toBe("preset");   // GC's own shape survives
    expect(out.blueprints.S360).toBeUndefined();
    expect(Object.keys(out.blueprints)).toEqual(["GC"]);
  });

  it("is a no-op for a blank, unchanged or absent class type", () => {
    const before = sp();
    expect(renameClassType(before, "S360", "S360", [])).toBe(before);
    expect(renameClassType(before, "", "S360 Strength", [])).toBe(before);
    expect(renameClassType(before, "Enduro", "Enduro 2", [])).toBe(before);  // no keys under it
    expect(renameClassType(undefined, "S360", "GC", [])).toEqual({});
  });

  it("treats a cleared class type as the Uncategorized bucket, like every other reader", () => {
    // classTypeOf maps "" → "Uncategorized"; the caller normalises through it, so
    // a coach who empties the field lands where the tab and the catalog counts
    // already say they are, rather than under a key nothing reads.
    const out = renameClassType(sp(), "S360", "Uncategorized", [{ classType: "" }]);
    expect(out.byClassType.Uncategorized.focus).toBe("strength");
  });
});

// ── renameClassTypeInGenerations ─────────────────────────────────────────────
// The FOURTH reader of the class type's name, and the one session 23 missed
// while fixing the other three. `recentGens` selects the ledger by
// `g.classType === curCT`, so rows left under the old name disappear from the
// coach's "Recently generated" list — and from the repeat-avoidance that list
// feeds the next draft, which fails silently by handing back a class the coach
// has already been given.
describe("renameClassTypeInGenerations", () => {
  const gens = () => ([
    { id: "g1", personaId: "p1", classType: "S360", title: "S360 — heavier day", movements: ["Back Squat"] },
    { id: "g2", personaId: "p1", classType: "GC",   title: "GC — engine day",    movements: ["Assault Bike"] },
    { id: "g3", personaId: "p2", classType: "S360", title: "another coach's S360", movements: [] },
  ]);

  it("carries this persona's rows to the new name", () => {
    const out = renameClassTypeInGenerations(gens(), "S360", "S360 Strength", [{ classType: "S360 Strength" }], "p1");
    expect(out.find(g => g.id === "g1").classType).toBe("S360 Strength");
    expect(out.find(g => g.id === "g2").classType).toBe("GC");        // another type, untouched
    expect(out.find(g => g.id === "g1").title).toBe("S360 — heavier day");  // the TITLE is history, not a key
  });

  it("leaves another coach's identically-named class type alone", () => {
    // Two coaches may both run something they call S360. The rename is a
    // decision about ONE coach's vocabulary and must not reach across.
    const out = renameClassTypeInGenerations(gens(), "S360", "S360 Strength", [{ classType: "S360 Strength" }], "p1");
    expect(out.find(g => g.id === "g3").classType).toBe("S360");
  });

  it("leaves the ledger alone when the old name still has plans — that is a MOVE", () => {
    // Same rule as renameClassType, and it has to be the same rule: re-filing
    // one plan must not drag the other type's history along with it.
    const before = gens();
    expect(renameClassTypeInGenerations(before, "S360", "GC", [{ classType: "S360" }, { classType: "GC" }], "p1")).toBe(before);
  });

  it("is a no-op for a blank, unchanged or absent class type", () => {
    const before = gens();
    expect(renameClassTypeInGenerations(before, "S360", "S360", [], "p1")).toBe(before);
    expect(renameClassTypeInGenerations(before, "", "S360 Strength", [], "p1")).toBe(before);
    expect(renameClassTypeInGenerations(before, "Enduro", "Enduro 2", [], "p1")).toBe(before);
    expect(renameClassTypeInGenerations(undefined, "S360", "GC", [], "p1")).toEqual(undefined);
  });
});
