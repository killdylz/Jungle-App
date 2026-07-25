import { describe, it, expect } from "vitest";
import { GENERATION_PRESETS, presetByKey, applyPreset, presetDraftOpts,
         describePresetEffect, blueprintMinutes, presetDraftTitle } from "./generationPresets.js";
import { draftFromBlueprint } from "./blueprints.js";

// A preset is a promise: "heavier day" has to produce a heavier day, and it has
// to do it without putting a deadlift in the warm-up. Both halves are asserted
// here, the second one hardest — it is the specific bug the category ordering in
// blueprints.js exists to prevent, and a preset is the obvious way to reintroduce it.

// Two circuit-ish slots on purpose, ordered differently: C1 is conditioning-led
// and F1 is strength-led. A bias only PROMOTES, so a fixture where every slot
// already leads with the biased category would make both bias tests pass without
// the bias doing anything — which is how the first version of this file was
// wrong.
const bp = () => ({
  classType: "S360",
  name: "S360",
  source: "recommended",
  slots: [
    { key: "Warm-up", label: "Warm-up",      role: "warmup",       minutes: 6,  movementCount: 3, categories: ["warmup", "mobility"] },
    { key: "M1",      label: "Primary lift", role: "primary_lift", minutes: 16, movementCount: 2, categories: ["strength", "core"] },
    { key: "C1",      label: "Circuit",      role: "circuit",      minutes: 12, movementCount: 4, categories: ["conditioning", "strength"] },
    { key: "F1",      label: "Finisher",     role: "finisher",     minutes: 6,  movementCount: 3, categories: ["strength", "conditioning"] },
    { key: "CD",      label: "Cool-down",    role: "cooldown",     minutes: 6,  movementCount: 2, categories: ["cooldown", "mobility"] },
  ],
});

// Deep enough that "something different" has somewhere to go. `categoryOf`
// derives the category from the name and equipment, so these are real movement
// names rather than tagged fixtures.
const catalog = [
  { name: "Arm Swings",               equip: "",        classTypes: { S360: 9 } },
  { name: "World's Greatest Stretch", equip: "",        classTypes: { S360: 7 } },
  { name: "Cat Cow",                  equip: "",        classTypes: { S360: 5 } },
  { name: "Leg Swings",               equip: "",        classTypes: { S360: 4 } },
  { name: "Hip 90/90 Flow",           equip: "",        classTypes: { S360: 3 } },
  { name: "Back Squat",               equip: "barbell", classTypes: { S360: 9 } },
  { name: "Deadlift",                 equip: "barbell", classTypes: { S360: 8 } },
  { name: "Overhead Press",           equip: "barbell", classTypes: { S360: 6 } },
  { name: "Bench Press",              equip: "barbell", classTypes: { S360: 6 } },
  { name: "Bent Over Row",            equip: "barbell", classTypes: { S360: 5 } },
  { name: "Goblet Squat",             equip: "kettlebell", classTypes: { S360: 5 } },
  { name: "Assault Bike",             equip: "bike",    classTypes: { S360: 8 } },
  { name: "Row",                      equip: "rower",   classTypes: { S360: 7 } },
  { name: "Burpee",                   equip: "",        classTypes: { S360: 6 } },
  { name: "Ski Erg",                  equip: "ski erg", classTypes: { S360: 5 } },
  { name: "Shuttle Run",              equip: "",        classTypes: { S360: 4 } },
  { name: "Sled Push",                equip: "sled",    classTypes: { S360: 4 } },
  { name: "Hollow Hold",              equip: "",        classTypes: { S360: 4 } },
  { name: "Plank",                    equip: "",        classTypes: { S360: 3 } },
];

describe("the preset list", () => {
  it("gives every preset a key, a name a coach would say, and a description", () => {
    for (const p of GENERATION_PRESETS) {
      expect(p.key).toMatch(/^[a-z]+$/);
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.body.length).toBeGreaterThan(10);
    }
  });

  it("has no duplicate keys", () => {
    const keys = GENERATION_PRESETS.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("looks a preset up by key, and returns null for one that does not exist", () => {
    expect(presetByKey("heavy").name).toBe("Heavier day");
    expect(presetByKey("nonsense")).toBeNull();
    expect(presetByKey(undefined)).toBeNull();
  });

  // U1 again: the coach never reads our vocabulary.
  it("uses no internal words in anything a coach reads", () => {
    const banned = /blueprint|slot|preset|category|catalog|parser|persona|corpus/i;
    for (const p of GENERATION_PRESETS) expect(`${p.name} ${p.body}`).not.toMatch(banned);
  });
});

describe("applyPreset — the coach's shape is never mutated", () => {
  it("returns a new object and leaves the original untouched", () => {
    const original = bp();
    const snapshot = JSON.parse(JSON.stringify(original));
    const out = applyPreset(original, presetByKey("heavy"));
    expect(original).toEqual(snapshot);
    expect(out).not.toBe(original);
    expect(out.slots[0]).not.toBe(original.slots[0]);
  });

  // `source: "edited"` is what stops re-derivation overwriting a coach's
  // decisions. Spending it on "try heavier this week" would freeze whatever
  // shape happened to be current the first time they pressed a preset.
  it("never marks the shape as edited", () => {
    for (const p of GENERATION_PRESETS) {
      expect(applyPreset(bp(), p).source).toBe("recommended");
    }
  });

  it("passes a missing blueprint or preset straight through", () => {
    expect(applyPreset(null, presetByKey("heavy"))).toBeNull();
    const b = bp();
    expect(applyPreset(b, null)).toBe(b);
  });
});

describe("applyPreset — bias promotes, never introduces", () => {
  it("moves the biased category to the front where the slot already has it", () => {
    const out = applyPreset(bp(), presetByKey("heavy"));
    // The circuit legitimately contains strength work, so strength leads there.
    expect(out.slots[2].categories).toEqual(["strength", "conditioning"]);
  });

  // THE important one. The warm-up has no strength in it, so a "heavier day"
  // must not create somewhere for a deadlift to land.
  it("leaves a slot alone when it does not already contain the biased category", () => {
    const out = applyPreset(bp(), presetByKey("heavy"));
    expect(out.slots[0].categories).toEqual(["warmup", "mobility"]);
    expect(out.slots[4].categories).toEqual(["cooldown", "mobility"]);
  });

  it("never lengthens any slot's category list", () => {
    for (const p of GENERATION_PRESETS) {
      const before = bp(), after = applyPreset(before, p);
      after.slots.forEach((s, i) => {
        expect(s.categories.length).toBe(before.slots[i].categories.length);
        expect([...s.categories].sort()).toEqual([...before.slots[i].categories].sort());
      });
    }
  });

  it("promotes conditioning for an engine day, in the blocks that have it", () => {
    const out = applyPreset(bp(), presetByKey("engine"));
    // The strength-led finisher flips; the primary lift has no conditioning in
    // it at all and is left exactly as the coach programs it.
    expect(out.slots[3].categories).toEqual(["conditioning", "strength"]);
    expect(out.slots[1].categories).toEqual(["strength", "core"]);
  });
});

describe("applyPreset — volume and length", () => {
  it("trims a movement from each block on a heavier day", () => {
    const out = applyPreset(bp(), presetByKey("heavy"));
    expect(out.slots.map(s => s.movementCount)).toEqual([2, 1, 3, 2, 1]);
  });

  it("adds one to each block on an engine day", () => {
    expect(applyPreset(bp(), presetByKey("engine")).slots.map(s => s.movementCount)).toEqual([4, 3, 5, 4, 3]);
  });

  it("never drops a block below one movement", () => {
    const thin = { slots: [{ key: "x", minutes: 5, movementCount: 1, categories: ["core"] }] };
    expect(applyPreset(thin, presetByKey("heavy")).slots[0].movementCount).toBe(1);
  });

  it("caps runaway volume rather than emitting a block nobody could run", () => {
    const fat = { slots: [{ key: "x", minutes: 5, movementCount: 8, categories: ["core"] }] };
    expect(applyPreset(fat, presetByKey("engine")).slots[0].movementCount).toBe(8);
  });

  it("compresses every block for a short class without dropping one", () => {
    const before = bp(), after = applyPreset(before, presetByKey("short"));
    expect(after.slots).toHaveLength(before.slots.length);
    expect(blueprintMinutes(after)).toBeLessThan(blueprintMinutes(before));
    expect(after.slots.map(s => s.minutes)).toEqual([4, 10, 8, 4, 4]);
  });

  it("never compresses a block below two minutes", () => {
    const tiny = { slots: [{ key: "x", minutes: 2, movementCount: 2, categories: ["core"] }] };
    expect(applyPreset(tiny, presetByKey("short")).slots[0].minutes).toBe(2);
  });

  it("leaves length and volume alone for the usual", () => {
    const before = bp(), after = applyPreset(before, presetByKey("usual"));
    expect(after.slots.map(s => s.minutes)).toEqual(before.slots.map(s => s.minutes));
    expect(after.slots.map(s => s.movementCount)).toEqual(before.slots.map(s => s.movementCount));
  });
});

describe("presetDraftOpts — repeating a preset does not hand back the same class", () => {
  const recent = Array.from({ length: 12 }, (_, i) => ({ movements: [`Move ${i}`] }));

  it("passes nothing recent for a preset that does not avoid repeats", () => {
    expect(presetDraftOpts(presetByKey("usual"), { classType: "S360", recent }).recent).toEqual([]);
  });

  it("passes the last N drafts for one that does", () => {
    const opts = presetDraftOpts(presetByKey("fresh"), { classType: "S360", recent });
    expect(opts.recent).toHaveLength(8);
    expect(opts.classType).toBe("S360");
  });

  it("survives no history at all", () => {
    expect(presetDraftOpts(presetByKey("fresh"), {}).recent).toEqual([]);
    expect(presetDraftOpts(null, {}).recent).toEqual([]);
  });
});

describe("end to end through the real drafter", () => {
  // The point of the whole feature: a picked preset produces a different, still
  // sane, class. Asserted through draftFromBlueprint rather than by inspecting
  // the transformed blueprint, because that is what the coach actually receives.
  it("drafts the coach's whole shape for every preset, in order", () => {
    for (const p of GENERATION_PRESETS) {
      const { blocks } = draftFromBlueprint(applyPreset(bp(), p), catalog, presetDraftOpts(p, { classType: "S360" }));
      expect(blocks).toHaveLength(5);
      expect(blocks.map(b => b.label)).toEqual(["Warm-up", "Primary lift", "Circuit", "Finisher", "Cool-down"]);
      // Every block the catalog CAN fill is filled. The cool-down is deliberately
      // excluded below — see the next test.
      expect(blocks.slice(0, 4).every(b => b.exercises.length > 0)).toBe(true);
    }
  });

  // Found by running this rather than by reasoning about it. Nothing in the
  // catalog classifies as a cool-down, so that block comes back EMPTY under
  // every preset — the drafter's documented behaviour, and the right one: the
  // coach sees a gap they can fill, where a wrong movement they might not. A
  // preset must not paper over it by widening the slot.
  it("leaves a block the catalog cannot fill empty rather than filling it wrongly", () => {
    for (const p of GENERATION_PRESETS) {
      const { blocks } = draftFromBlueprint(applyPreset(bp(), p), catalog, presetDraftOpts(p, { classType: "S360" }));
      expect(blocks[4].label).toBe("Cool-down");
      expect(blocks[4].exercises).toEqual([]);
    }
  });

  // The regression that matters. A "heavier day" leans on strength; it does not
  // relocate strength into the warm-up.
  it("keeps barbell work out of the warm-up on a heavier day", () => {
    const { blocks } = draftFromBlueprint(applyPreset(bp(), presetByKey("heavy")), catalog, { classType: "S360" });
    const warmup = blocks[0].exercises.map(e => e.name);
    expect(warmup).not.toContain("Deadlift");
    expect(warmup).not.toContain("Back Squat");
    // Only what the warm-up slot's own categories allow. "Arm Swings", "Cat Cow"
    // and "Leg Swings" are in the catalog but the taxonomy returns no category
    // for them, so the drafter leaves them out entirely rather than guessing —
    // D1's still-open LLM fallback for blanks is exactly this gap. Pinned here
    // so a preset is never the thing that starts placing unknowns.
    expect(warmup.every(n => ["World's Greatest Stretch", "Hip 90/90 Flow"].includes(n))).toBe(true);
  });

  it("turns the strength-led finisher into a conditioning one on an engine day", () => {
    const usual  = draftFromBlueprint(applyPreset(bp(), presetByKey("usual")),  catalog, { classType: "S360" });
    const engine = draftFromBlueprint(applyPreset(bp(), presetByKey("engine")), catalog, { classType: "S360" });
    const first = b => b.blocks[3].exercises[0].name;
    expect(first(usual)).not.toBe(first(engine));
    expect(["Assault Bike", "Row", "Burpee", "Ski Erg", "Shuttle Run", "Sled Push"]).toContain(first(engine));
  });

  it("gives a different class the second time when asked for something different", () => {
    const first = draftFromBlueprint(applyPreset(bp(), presetByKey("usual")), catalog, { classType: "S360" });
    const history = [{ movements: first.blocks.flatMap(b => b.exercises.map(e => e.name)) }];
    const second = draftFromBlueprint(
      applyPreset(bp(), presetByKey("fresh")), catalog,
      presetDraftOpts(presetByKey("fresh"), { classType: "S360", recent: history }));
    const names = d => d.blocks.flatMap(b => b.exercises.map(e => e.name)).join();
    expect(names(second)).not.toBe(names(first));
  });

  // The honest limit, pinned so nobody "fixes" it later by reaching outside the
  // slot. "Something different" can only be different if the coach HAS something
  // different; with a thin catalog it returns the same class, and that is right.
  it("returns the same class when the catalog has nothing else to offer", () => {
    const thin = [
      { name: "Arm Swings", equip: "", classTypes: { S360: 9 } },
      { name: "Back Squat", equip: "barbell", classTypes: { S360: 9 } },
    ];
    const shape = { classType: "S360", slots: [
      { key: "M1", label: "Primary lift", role: "primary_lift", minutes: 15, movementCount: 1, categories: ["strength"] },
    ] };
    const once = draftFromBlueprint(applyPreset(shape, presetByKey("usual")), thin, { classType: "S360" });
    const again = draftFromBlueprint(
      applyPreset(shape, presetByKey("fresh")), thin,
      presetDraftOpts(presetByKey("fresh"), { classType: "S360", recent: [{ movements: ["Back Squat"] }] }));
    expect(again.blocks[0].exercises.map(e => e.name)).toEqual(["Back Squat"]);
    expect(again).toEqual(once);
  });

  it("is deterministic — the same preset on the same shape twice is the same class", () => {
    const once  = draftFromBlueprint(applyPreset(bp(), presetByKey("heavy")), catalog, { classType: "S360" });
    const twice = draftFromBlueprint(applyPreset(bp(), presetByKey("heavy")), catalog, { classType: "S360" });
    expect(once).toEqual(twice);
  });
});

describe("describePresetEffect — says what it will do, in numbers, first", () => {
  it("states the length change for a short class", () => {
    expect(blueprintMinutes(bp())).toBe(46);
    expect(describePresetEffect(presetByKey("short"), bp())).toMatch(/46 → 30 min/);
  });

  it("states the volume change", () => {
    expect(describePresetEffect(presetByKey("engine"), bp())).toMatch(/14 → 19 movements/);
    expect(describePresetEffect(presetByKey("heavy"),  bp())).toMatch(/14 → 9 movements/);
  });

  it("counts only the blocks the bias can actually reach", () => {
    // Strength is in M1, C1 and F1 — not in the warm-up or the cool-down.
    expect(describePresetEffect(presetByKey("heavy"), bp())).toMatch(/strength first in 3 blocks/);
    // Conditioning is in C1 and F1 only.
    expect(describePresetEffect(presetByKey("engine"), bp())).toMatch(/conditioning first in 2 blocks/);
  });

  // Claiming a bias the shape cannot honour would be visibly false on the very
  // next screen.
  it("makes no bias claim over a shape that has none of that category", () => {
    const noStrength = { slots: [{ key: "x", minutes: 10, movementCount: 3, categories: ["conditioning"] }] };
    expect(describePresetEffect(presetByKey("heavy"), noStrength)).not.toMatch(/strength first/);
  });

  it("says nothing measurable for the usual", () => {
    expect(describePresetEffect(presetByKey("usual"), bp())).toBe("");
  });

  it("mentions avoiding repeats when that is what the preset does", () => {
    expect(describePresetEffect(presetByKey("fresh"), bp())).toMatch(/avoids your last 8 drafts/);
  });

  it("returns empty rather than throwing on a missing shape", () => {
    expect(describePresetEffect(presetByKey("heavy"), null)).toBe("");
    expect(describePresetEffect(null, bp())).toBe("");
    expect(describePresetEffect(presetByKey("heavy"), { slots: [] })).toBe("");
  });
});

describe("presetDraftTitle — what lands in the coach's plan list forever", () => {
  it("keeps the existing wording for the plain draft", () => {
    expect(presetDraftTitle("S360", presetByKey("usual"))).toBe("S360 — from your class shape");
    expect(presetDraftTitle("S360", null)).toBe("S360 — from your class shape");
  });

  it("names the preset for the others", () => {
    expect(presetDraftTitle("S360", presetByKey("heavy"))).toBe("S360 — heavier day");
    expect(presetDraftTitle("Hyrox", presetByKey("short"))).toBe("Hyrox — short class");
  });

  it("never produces a title starting with a dash", () => {
    expect(presetDraftTitle("", presetByKey("heavy"))).toBe("Class — heavier day");
    expect(presetDraftTitle("   ", presetByKey("heavy"))).toBe("Class — heavier day");
  });
});
