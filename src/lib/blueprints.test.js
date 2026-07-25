// Class Blueprints. The failure modes here are all silent: a blueprint derived
// from a shape no plan actually follows, a coach's edit quietly overwritten by
// re-derivation, or a draft that fills a warm-up slot with deadlifts. None of
// them throw. The §13 Q7 guarantee — an edited blueprint is NEVER regenerated
// over — is the one worth breaking the build for.
import { describe, it, expect } from "vitest";
import { slotKey, deriveBlueprint, reconcileBlueprint, draftFromBlueprint, BLUEPRINT_PRESETS } from "./blueprints.js";
import { CATEGORIES } from "./movementTaxonomy.js";

// Mirrors the real seed corpus shape (data/personas.seed.js): the S360 format is
// Warm Up → M1 → A1+A2 → B1+B2 → C1, with the per-week focus in the suffix.
const s360 = (focus, extra = []) => ({
  classType: "S360",
  plan: { blocks: [
    { label: "Warm Up", role: "warmup", scheme: { type: "time" },
      exercises: [{ name: "Glute Bridge" }, { name: "World's Greatest Stretch" }] },
    { label: `M1 — ${focus}`, role: "primary_lift", scheme: { type: "sets_reps" },
      exercises: [{ name: "Conventional Deadlift" }] },
    { label: "A1 + A2 — Superset", role: "superset", scheme: { type: "rounds" },
      exercises: [{ name: "Romanian Deadlift" }, { name: "Chest-Supported Row" }] },
    ...extra,
  ] },
});

describe("slotKey", () => {
  it("keeps the stable prefix and drops the per-week focus", () => {
    // "M1 — Deadlift" and "M1 — Squat" are the SAME slot in two different weeks.
    // Without this they derive as two separate slots and the shape never repeats.
    expect(slotKey("M1 — Deadlift")).toBe("M1");
    expect(slotKey("M1 — Squat")).toBe("M1");
    expect(slotKey("A1 + A2 — Superset")).toBe("A1 + A2");
  });

  it("handles the hyphen, en-dash and colon variants", () => {
    expect(slotKey("C1 - Finisher")).toBe("C1");
    expect(slotKey("C1 – Finisher")).toBe("C1");
    expect(slotKey("C1: Finisher")).toBe("C1");
  });

  it("passes a bare label through untouched", () => {
    expect(slotKey("Warm Up")).toBe("Warm Up");
    expect(slotKey("C1")).toBe("C1");
  });

  it("does not split a hyphenated word", () => {
    // "Cool-down" is one word, not a slot with a suffix — the separator has to
    // be a SPACED dash for exactly this reason.
    expect(slotKey("Cool-down")).toBe("Cool-down");
  });

  it("is blank for a blank label", () => {
    expect(slotKey("")).toBe("");
    expect(slotKey(null)).toBe("");
  });
});

describe("deriveBlueprint", () => {
  it("derives the shape the coach actually follows", () => {
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360");
    expect(bp.slots.map(s => s.key)).toEqual(["Warm Up", "M1", "A1 + A2"]);
    expect(bp.source).toBe("recommended");
  });

  it("takes the MAJORITY shape and reports how many plans follow it", () => {
    // The honest bit: two plans share a shape, one dissents. The blueprint
    // describes the two and says so, rather than implying it describes all three.
    const odd = { classType: "S360", plan: { blocks: [
      { label: "Warm Up", role: "warmup", exercises: [{ name: "Glute Bridge" }] },
    ] } };
    // The dissenting plan is FIRST on purpose. With it last, "pick the first
    // shape seen" and "pick the modal shape" give the same answer and the test
    // proves nothing — verified by mutation, which passed until this was fixed.
    const bp = deriveBlueprint([odd, s360("Deadlift"), s360("Squat")], "S360");
    expect(bp.slots.map(s => s.key)).toEqual(["Warm Up", "M1", "A1 + A2"]);
    expect(bp.matched).toBe(2);
    expect(bp.total).toBe(3);
  });

  it("names a slot after what RECURS, not after one week's focus", () => {
    // Found by driving the real corpus: the slot was named from the modal full
    // label, so "M1 — Deadlift" became the name of the recurring primary-lift
    // slot and read as a lie the week it was a squat.
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360");
    expect(bp.slots[1].label).toBe("M1");
    expect(bp.slots[1].label).not.toMatch(/Deadlift|Squat/);
  });

  it("keeps multi-word slot keys intact", () => {
    // Slot keys contain spaces and punctuation. Any delimiter-based sequence
    // identity shreds them: joining on a space split "Warm Up" into two slots,
    // and the bug was only invisible because of an unrelated encoding accident.
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360");
    expect(bp.slots.map(s => s.key)).toEqual(["Warm Up", "M1", "A1 + A2"]);
    expect(bp.slots).toHaveLength(3);
  });

  it("aggregates each slot only over the plans following that shape", () => {
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360");
    const [warm, m1, sup] = bp.slots;
    expect(warm.role).toBe("warmup");
    expect(m1.role).toBe("primary_lift");
    expect(m1.movementCount).toBe(1);
    expect(sup.movementCount).toBe(2);
    expect(m1.schemeDefault).toBe("sets_reps");
  });

  it("does not let an off-shape plan pollute a slot it does not share", () => {
    // The discriminating case for "only the matching plans". A dissenting plan
    // whose second block is CONDITIONING sits at the same index as the majority
    // shape's strength lift. Aggregating over all plans quietly adds
    // `conditioning` to the primary-lift slot, which would then draft burpees
    // into it. Role and movementCount are both too robust to catch this — mode
    // and median shrug off one outlier — so categories are what expose it.
    const odd = { classType: "S360", plan: { blocks: [
      { label: "Warm Up", role: "warmup", exercises: [{ name: "Glute Bridge" }] },
      { label: "Z9 — Conditioning", role: "circuit", scheme: { type: "amrap" }, exercises: [{ name: "Burpee" }] },
    ] } };
    const bp = deriveBlueprint([odd, s360("Deadlift"), s360("Squat")], "S360");
    expect(bp.slots[1].key).toBe("M1");
    expect(bp.slots[1].categories).toEqual(["strength"]);
  });

  it("breaks a tie toward the longer shape", () => {
    // A coach who sometimes skips the finisher still programs the finisher. The
    // SHORT shape is listed first so that "keep the first one seen" fails here.
    const short = () => ({ classType: "T", plan: { blocks: [
      { label: "C1", role: "warmup", exercises: [{ name: "Glute Bridge" }] },
    ] } });
    const long = () => ({ classType: "T", plan: { blocks: [
      { label: "C1", role: "warmup", exercises: [{ name: "Glute Bridge" }] },
      { label: "C2", role: "circuit", exercises: [{ name: "Burpee" }] },
    ] } });
    const bp = deriveBlueprint([short(), short(), long(), long()], "T");
    expect(bp.slots.map(s => s.key)).toEqual(["C1", "C2"]);
  });

  it("tells two shapes apart even when their keys concatenate identically", () => {
    // Sequence identity is JSON, not a delimited string. ["A B","C"] and
    // ["A","B C"] are different shapes that join to the same "A B C", so a
    // delimiter-based identity counts them as one and merges their slots.
    // Contrived labels, real property: slot keys carry spaces routinely
    // ("Warm Up", "A1 + A2"), which is what makes a delimiter unsafe here.
    const one = { classType: "X", plan: { blocks: [
      { label: "A B", role: "warmup", exercises: [{ name: "Glute Bridge" }] },
      { label: "C",   role: "circuit", exercises: [{ name: "Burpee" }] },
    ] } };
    const two = { classType: "X", plan: { blocks: [
      { label: "A",   role: "warmup", exercises: [{ name: "Glute Bridge" }] },
      { label: "B C", role: "circuit", exercises: [{ name: "Burpee" }] },
    ] } };
    const bp = deriveBlueprint([one, two], "X");
    expect(bp.matched).toBe(1);          // one plan per shape, not two
    expect(bp.total).toBe(2);
  });

  it("orders a slot's categories by how much of the slot each accounts for", () => {
    // A real warm-up contains the odd strength-ish movement, so the category set
    // is legitimately broad. The ORDER is what stops broad becoming anything-goes.
    const mixed = { classType: "W", plan: { blocks: [
      { label: "Warm Up", role: "warmup", exercises: [
        { name: "Glute Bridge" }, { name: "Band Pull Apart" }, { name: "Inchworm" },  // warmup ×3
        { name: "Conventional Deadlift" },                                             // strength ×1
      ] },
    ] } };
    expect(deriveBlueprint([mixed], "W").slots[0].categories).toEqual(["warmup", "strength"]);
  });

  it("puts prevalence ABOVE the global category order", () => {
    // Discriminating case for the one above, which proves nothing on its own:
    // there `warmup` outranks `strength` in CATEGORIES anyway. Here the slot is
    // mostly strength with one warm-up movement, so prevalence and the global
    // order disagree — and prevalence has to win, or a strength block drafts
    // its warm-up movement first.
    const lift = { classType: "L", plan: { blocks: [
      { label: "M1", role: "primary_lift", exercises: [
        { name: "Back Squat" }, { name: "Deadlift" }, { name: "Bench Press" },  // strength ×3
        { name: "Band Pull Apart" },                                            // warmup ×1
      ] },
    ] } };
    expect(deriveBlueprint([lift], "L").slots[0].categories).toEqual(["strength", "warmup"]);
  });

  it("reads each slot's categories from the movements actually in it", () => {
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360");
    const [warm, m1] = bp.slots;
    expect(warm.categories).toContain("warmup");     // Glute Bridge
    expect(warm.categories).toContain("mobility");   // World's Greatest Stretch
    expect(m1.categories).toEqual(["strength"]);     // Conventional Deadlift
  });

  it("lets a coach's category override on a movement reach the slot", () => {
    // The catalog is the coach's; a slot derived from it must respect their edits.
    const catalog = [{ name: "Conventional Deadlift", meta: { category: "conditioning" } }];
    const bp = deriveBlueprint([s360("Deadlift"), s360("Squat")], "S360", catalog);
    expect(bp.slots[1].categories).toEqual(["conditioning"]);
  });

  it("returns null when there is nothing to derive from", () => {
    // The caller offers presets instead of inventing a shape.
    expect(deriveBlueprint([], "S360")).toBeNull();
    expect(deriveBlueprint([{ classType: "GC", plan: { blocks: [] } }], "S360")).toBeNull();
  });

  it("only reads the requested class type", () => {
    const gc = { classType: "GC", plan: { blocks: [
      { label: "C1", role: "circuit", exercises: [{ name: "Burpee" }] },
    ] } };
    expect(deriveBlueprint([s360("Deadlift"), gc], "GC").slots.map(s => s.key)).toEqual(["C1"]);
  });
});

describe("reconcileBlueprint — §13 Q7", () => {
  const edited = { classType: "S360", source: "edited", slots: [{ key: "A" }, { key: "B" }] };
  const derived = { classType: "S360", source: "recommended", slots: [{ key: "A" }, { key: "B" }, { key: "C" }] };

  it("NEVER overwrites a coach's edited blueprint", () => {
    // The guarantee. A fixed pipeline is a worse product than no pipeline: the
    // coach's judgement is the asset, the derivation is a convenience.
    const out = reconcileBlueprint(edited, derived);
    expect(out.slots.map(s => s.key)).toEqual(["A", "B"]);
    expect(out.source).toBe("edited");
  });

  it("surfaces the contradiction rather than reconciling it", () => {
    const out = reconcileBlueprint(edited, derived);
    expect(out.contradiction).toBeDefined();
    expect(out.contradiction.slots.map(s => s.key)).toEqual(["A", "B", "C"]);
  });

  it("raises no contradiction when the corpus agrees", () => {
    const agreeing = { ...derived, slots: [{ key: "A" }, { key: "B" }] };
    expect(reconcileBlueprint(edited, agreeing).contradiction).toBeUndefined();
  });

  it("replaces a merely RECOMMENDED blueprint, which is not a coach decision", () => {
    const recommended = { ...edited, source: "recommended" };
    expect(reconcileBlueprint(recommended, derived).slots).toHaveLength(3);
  });

  it("keeps an edited blueprint when the corpus can no longer derive one", () => {
    expect(reconcileBlueprint(edited, null).slots).toHaveLength(2);
  });
});

describe("BLUEPRINT_PRESETS", () => {
  it("ships the three cold-start shapes", () => {
    expect(BLUEPRINT_PRESETS.map(p => p.name)).toEqual(["Strength", "Circuit", "Endurance / Hyrox"]);
  });

  it("only uses categories from the legal set", () => {
    // A preset naming a category that no longer exists would filter to nothing
    // and silently draft empty blocks — exactly what happened to `hyrox`.
    BLUEPRINT_PRESETS.forEach(p => p.slots.forEach(s =>
      s.categories.forEach(c => expect(CATEGORIES).toContain(c))));
  });

  it("gives every slot something to fill", () => {
    BLUEPRINT_PRESETS.forEach(p => p.slots.forEach(s => {
      expect(s.movementCount).toBeGreaterThan(0);
      expect(s.categories.length).toBeGreaterThan(0);
    }));
  });
});

describe("draftFromBlueprint", () => {
  const catalog = [
    { name: "Glute Bridge",   equip: "bodyweight", classTypes: { S360: 5 } },
    { name: "Band Pull Apart", equip: "band",      classTypes: { S360: 3 } },
    { name: "Back Squat",     equip: "barbell",    classTypes: { S360: 9 } },
    { name: "Deadlift",       equip: "barbell",    classTypes: { S360: 7 } },
    { name: "Burpee",         equip: "bodyweight", classTypes: { S360: 4 } },
  ];
  const bp = { classType: "S360", source: "edited", slots: [
    { key: "W",  label: "Warm-up", role: "warmup",       movementCount: 1, schemeDefault: "time",      categories: ["warmup"] },
    { key: "M1", label: "Main",    role: "primary_lift", movementCount: 2, schemeDefault: "sets_reps", categories: ["strength"] },
  ] };

  it("fills each slot only from that slot's categories", () => {
    // The structural guarantee the taxonomy was built for: no ergs in a strength
    // block, enforced by arithmetic rather than by asking a model nicely.
    const { blocks } = draftFromBlueprint(bp, catalog);
    expect(blocks[0].exercises.map(e => e.name)).toEqual(["Glute Bridge"]);
    expect(blocks[1].exercises.map(e => e.name)).toEqual(["Back Squat", "Deadlift"]);
  });

  // Found by driving a "short class" preset through the real Builder: the class
  // came back the SAME length as the full one, because the slot's minutes were
  // dropped here and planToStages fell through to a per-role default. The coach
  // has always been able to set a slot's minutes in the class shape card — the
  // number simply reached nothing.
  it("carries each slot's own length onto the block", () => {
    const timed = { classType: "S360", slots: [
      { key: "W",  label: "Warm-up", role: "warmup",       minutes: 8,  movementCount: 1, categories: ["warmup"] },
      { key: "M1", label: "Main",    role: "primary_lift", minutes: 18, movementCount: 1, categories: ["strength"] },
    ] };
    const { blocks } = draftFromBlueprint(timed, catalog);
    expect(blocks.map(b => b.minutes)).toEqual([8, 18]);
  });

  it("omits minutes entirely when the slot has none, so parsed plans are unaffected", () => {
    const { blocks } = draftFromBlueprint(bp, catalog);
    for (const b of blocks) expect("minutes" in b).toBe(false);
  });

  it("ignores a zero or nonsense length rather than emitting a zero-second block", () => {
    const bad = { classType: "S360", slots: [
      { key: "W", label: "Warm-up", role: "warmup", minutes: 0,    movementCount: 1, categories: ["warmup"] },
      { key: "X", label: "Odd",     role: "circuit", minutes: "abc", movementCount: 1, categories: ["conditioning"] },
    ] };
    const { blocks } = draftFromBlueprint(bad, catalog);
    for (const b of blocks) expect("minutes" in b).toBe(false);
  });

  it("respects the slot's movement count and keeps the coach's structure", () => {
    const { blocks } = draftFromBlueprint(bp, catalog);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].exercises).toHaveLength(1);
    expect(blocks[1].exercises).toHaveLength(2);
    expect(blocks[1].label).toBe("Main");
    expect(blocks[1].role).toBe("primary_lift");
    expect(blocks[1].scheme).toEqual({ type: "sets_reps" });
  });

  it("fills a slot from its DOMINANT category before topping up from the rest", () => {
    // The defect that only appeared when the thing was actually run: the warm-up
    // slot's categories legitimately included `strength`, and alphabetical order
    // put a Conventional Deadlift in the warm-up. Category fit has to outrank
    // both usage and name.
    const warmSlot = { classType: "S360", slots: [{
      key: "W", label: "Warm-up", role: "warmup", movementCount: 2,
      categories: ["warmup", "strength"],   // ordered by prevalence in the slot
    }] };
    const cat = [
      { name: "Back Squat",      classTypes: { S360: 99 } },   // strength, heavily used
      { name: "Glute Bridge",    classTypes: { S360: 1 } },    // warmup, barely used
      { name: "Band Pull Apart", classTypes: { S360: 1 } },    // warmup, barely used
    ];
    const { blocks } = draftFromBlueprint(warmSlot, cat);
    expect(blocks[0].exercises.map(e => e.name)).toEqual(["Band Pull Apart", "Glute Bridge"]);
    expect(blocks[0].exercises.map(e => e.name)).not.toContain("Back Squat");
  });

  it("still reaches into a later category when the first cannot fill the slot", () => {
    // Ordering is a preference, not a hard filter — a slot that asks for 3 and
    // has only 1 warm-up movement should still come back full.
    const warmSlot = { classType: "S360", slots: [{
      key: "W", label: "Warm-up", role: "warmup", movementCount: 2, categories: ["warmup", "strength"],
    }] };
    const cat = [
      { name: "Back Squat",   classTypes: { S360: 9 } },
      { name: "Glute Bridge", classTypes: { S360: 1 } },
    ];
    const { blocks } = draftFromBlueprint(warmSlot, cat);
    expect(blocks[0].exercises.map(e => e.name)).toEqual(["Glute Bridge", "Back Squat"]);
  });

  it("ranks by how much the coach actually uses the movement", () => {
    const { blocks } = draftFromBlueprint(bp, catalog);
    expect(blocks[1].exercises[0].name).toBe("Back Squat");   // 9 uses beats Deadlift's 7
  });

  it("never repeats a movement within one class", () => {
    const twice = { ...bp, slots: [bp.slots[1], { ...bp.slots[1], key: "M2" }] };
    const { blocks } = draftFromBlueprint(twice, catalog);
    const all = blocks.flatMap(b => b.exercises.map(e => e.name));
    expect(new Set(all).size).toBe(all.length);
  });

  it("de-prioritises what it recommended last time", () => {
    // Items 6–8: a second draft must not be the first one again.
    const recent = [{ movements: ["Back Squat"] }];
    const { blocks } = draftFromBlueprint(bp, catalog, { recent });
    expect(blocks[1].exercises[0].name).toBe("Deadlift");
  });

  it("emits an EMPTY block rather than an out-of-category movement", () => {
    // An honest gap the coach can see and fill beats a wrong movement they might
    // not notice — the same rule as the taxonomy's blank category.
    const cooldownOnly = { ...bp, slots: [{ key: "CD", label: "Cool-down", role: "cooldown", movementCount: 3, categories: ["cooldown"] }] };
    const { blocks } = draftFromBlueprint(cooldownOnly, catalog);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].exercises).toEqual([]);
  });

  it("never drafts a movement the coach has not categorised", () => {
    // Uncategorised means we do not know what it is. Slotting it would be the
    // confident wrong guess the whole taxonomy exists to avoid.
    // "Nonesuch Press" is deliberately fictional — it must never be renamed to a
    // real movement, or this assertion silently stops testing anything.
    const unknown = [{ name: "Nonesuch Press", equip: "", classTypes: { S360: 99 } }];
    const { blocks } = draftFromBlueprint(bp, unknown);
    expect(blocks.flatMap(b => b.exercises)).toEqual([]);
  });

  it("returns no blocks for an empty blueprint", () => {
    expect(draftFromBlueprint(null, catalog).blocks).toEqual([]);
    expect(draftFromBlueprint({ slots: [] }, catalog).blocks).toEqual([]);
  });
});
