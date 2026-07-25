import { describe, it, expect } from "vitest";
import { parsePlanText, parseExercise, inferEquip, deriveHints, PARSE_THRESHOLD, _internal } from "./planParser.js";

// Fixtures follow the three house formats documented in the spec (S360 strength,
// GC Fundamental conditioning, Garage Enduro), in the notation those decks use.
// They are the whole point of the parser: a private grammar repeated weekly.

const S360 = `S360
11 July 2026
Shoulder — Hypertrophy

Warm Up 5min
Band Pull Apart x15
Scap Push Up x10

M1 Barbell Overhead Press
5x5 @ RIR 2
1st set as primer
Rest 3min
(DB Press regression)

A1 DB Bench Press 12-10-10-8
A2 Chest Supported Row 12-10-10-8
3 rounds, rest 90s

C1 Finisher
Farmers Carry 40m`;

const GC = `GC
Fundamental

C1 Warm Up
Row 500m
Air Squat x10

C2 AMRAP 12min
10 Wall Balls
15 Cal Row
20 Walking Lunge each side

C3 Finisher
Burpee x20
Rest 90s`;

const ENDURO = `Garage Enduro
Week 11 of 24

Warm Up
Jog 800m

M1 Run 3km @ RPE 6
Rest 3min

C1 Erg 2000m
Sled Push 20m
3 rounds`;

describe("scheme token parsing", () => {
  it("reads sets x reps", () => {
    expect(_internal.parseSetsReps("5x5")).toEqual({ sets: 5, reps: [5], note: "" });
    expect(_internal.parseSetsReps("3 x 10")).toEqual({ sets: 3, reps: [10], note: "" });
  });

  it("keeps a rep RANGE as a note and pins the floor — '4 x 8-10' is not a 4-rung ladder", () => {
    const r = _internal.parseSetsReps("4 x 8-10");
    expect(r.sets).toBe(4);
    expect(r.reps).toEqual([8]);
    expect(r.note).toBe("8-10 reps");
    // and it must NOT be read as a ladder
    expect(_internal.parseLadder("4 x 8-10")).toBeNull();
  });

  it("reads a rep ladder only at 3+ rungs", () => {
    expect(_internal.parseLadder("12-10-10-8")).toEqual([12, 10, 10, 8]);
    expect(_internal.parseLadder("8-10")).toBeNull();
  });

  it("converts rest to SECONDS in every notation the decks use", () => {
    expect(_internal.parseRest("Rest 3min")).toBe(180);
    expect(_internal.parseRest("rest 90s")).toBe(90);
    expect(_internal.parseRest("Rest: 2:00")).toBe(120);
    expect(_internal.parseRest("R: 45 sec")).toBeNull(); // not the deck notation — must not guess
  });

  it("lands an RPE range on its midpoint (matching the extractor prompt)", () => {
    expect(_internal.parseRpe("@ RPE 7-8")).toBe(7.5);
    expect(_internal.parseRpe("RPE 6")).toBe(6);
    expect(_internal.parseRir("RIR 2")).toBe(2);
  });

  it("recognises tempo codes without turning them into numbers", () => {
    expect(_internal.parseTempo("@ 31X1")).toBe("31X1");
    expect(_internal.parseTempo("3-1-X-1")).toBe("3-1-X-1");
  });
});

describe("equipment inference", () => {
  it("prefers explicit equipment markers over movement-name heuristics", () => {
    // The ordering bug this pins: both lines contain "row", but neither is an erg.
    expect(inferEquip("Chest Supported Row")).not.toBe("erg");
    expect(inferEquip("DB Row")).toBe("DB");
    expect(inferEquip("Barbell Row")).toBe("barbell");
  });

  it("still identifies genuine cardio", () => {
    expect(inferEquip("Row 500m")).toBe("erg");
    expect(inferEquip("15 Cal Row")).toBe("erg");
    expect(inferEquip("Ski Erg")).toBe("erg");
    expect(inferEquip("Sled Push 20m")).toBe("sled");
  });

  it("identifies the common families", () => {
    expect(inferEquip("KB Swing")).toBe("KB");
    expect(inferEquip("Back Squat")).toBe("barbell");
    expect(inferEquip("Scap Push Up")).toBe("bodyweight");
  });
});

describe("exercise line parsing", () => {
  it("peels reps, target, per-side and regression into their own fields", () => {
    const ex = parseExercise("Walking Lunge x12 each side (scale to Split Squat)");
    expect(ex.name).toBe("Walking Lunge");
    expect(ex.reps).toBe("12");
    expect(ex.per_side).toBe(true);
    expect(ex.regression).toBe("Split Squat");
  });

  it("reads a leading rep count (the GC convention)", () => {
    const ex = parseExercise("10 Wall Balls");
    expect(ex.name).toBe("Wall Balls");
    expect(ex.reps).toBe("10");
  });

  it("does NOT read a leading distance as a rep count", () => {
    const ex = parseExercise("500 m Row");
    expect(ex.reps).toBe("");
    expect(ex.target).toBe("500m");
    expect(ex.equip).toBe("erg");
    expect(ex.name).toBe("Row");
  });

  it("keeps a rep ladder on the exercise", () => {
    expect(parseExercise("DB Bench Press 12-10-10-8").reps).toBe("12-10-10-8");
  });
});

describe("S360 — strength house format", () => {
  const r = parsePlanText(S360);

  it("parses confidently enough to skip the LLM", () => {
    expect(r.confidence).toBeGreaterThanOrEqual(PARSE_THRESHOLD);
  });

  it("reads the class type and focus off the header", () => {
    expect(r.classType).toBe("S360");
    expect(r.focus).toBe("Shoulder — Hypertrophy");
  });

  it("assigns roles from the coach's own notation", () => {
    const roles = r.plan.blocks.map(b => b.role);
    expect(roles[0]).toBe("warmup");
    expect(roles).toContain("primary_lift");
    expect(roles).toContain("superset");
    expect(roles[roles.length - 1]).toBe("finisher");
  });

  it("puts M1's numbers in their FIELDS, not in prose", () => {
    const m1 = r.plan.blocks.find(b => b.label === "M1");
    expect(m1.scheme.sets).toBe(5);
    expect(m1.scheme.reps).toEqual([5]);
    expect(m1.scheme.rir).toBe(2);
    expect(m1.scheme.rest_sec).toBe(180);
    expect(m1.scheme.note).toContain("1st set as primer");
    expect(m1.exercises[0].name).toBe("Barbell Overhead Press");
    expect(m1.exercises[0].regression).toBe("DB Press");
  });

  it("folds A1 + A2 into ONE superset block carrying both movements", () => {
    const sup = r.plan.blocks.find(b => b.role === "superset");
    expect(sup.label).toBe("A1+A2");
    expect(sup.exercises.map(e => e.name)).toEqual(["DB Bench Press", "Chest Supported Row"]);
    expect(sup.scheme.reps).toEqual([12, 10, 10, 8]);
    expect(sup.scheme.rest_sec).toBe(90);
    expect(sup.rotation).toContain("A1+A2");
  });
});

describe("GC — conditioning house format", () => {
  const r = parsePlanText(GC);

  it("parses confidently", () => {
    expect(r.confidence).toBeGreaterThanOrEqual(PARSE_THRESHOLD);
  });

  it("lets the WORD 'warm up' beat the lettered-slot rule (GC labels its warmup C1)", () => {
    expect(r.plan.blocks[0].label).toBe("C1");
    expect(r.plan.blocks[0].role).toBe("warmup");
  });

  it("types an AMRAP block as amrap and keeps its window", () => {
    const c2 = r.plan.blocks.find(b => b.label === "C2");
    expect(c2.scheme.type).toBe("amrap");
    expect(c2.scheme.note).toContain("AMRAP 12min");
    expect(c2.role).toBe("circuit");
    // "15 Cal Row" normalises to the MOVEMENT plus its target, which is what the
    // extractor prompt asks for too — calories belong in `target`, not the name.
    expect(c2.exercises.map(e => e.name)).toEqual(["Wall Balls", "Row", "Walking Lunge"]);
    expect(c2.exercises[1].target).toBe("15cal");
    expect(c2.exercises[2].per_side).toBe(true);
  });

  it("does not fold C1/C2/C3 into a superset — they are sequential circuits, not a pair", () => {
    expect(r.plan.blocks.map(b => b.label)).toEqual(["C1", "C2", "C3"]);
  });
});

describe("Enduro — endurance house format", () => {
  const r = parsePlanText(ENDURO);

  it("parses confidently", () => {
    expect(r.confidence).toBeGreaterThanOrEqual(PARSE_THRESHOLD);
  });

  it("captures distance targets and RPE", () => {
    const m1 = r.plan.blocks.find(b => b.label === "M1");
    expect(m1.scheme.rpe).toBe(6);
    expect(m1.exercises[0].target).toBe("3km");
    expect(m1.exercises[0].equip).toBe("erg");
  });

  it("treats 'Week 11 of 24' as header noise, not a movement", () => {
    const names = r.plan.blocks.flatMap(b => b.exercises.map(e => e.name));
    expect(names.join(" ")).not.toMatch(/week/i);
  });
});

// ── The contract: DEFER, never guess ─────────────────────────────────────────
describe("confidence gating", () => {
  it("refuses a slide with no block structure", () => {
    const r = parsePlanText("Welcome to The Garage\nToday we go hard\nLet's move");
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
    expect(r.plan.blocks).toHaveLength(0);
  });

  it("refuses a branding / title slide", () => {
    const r = parsePlanText("THE GARAGE\nStrength in numbers\n@thegarage");
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
  });

  it("drops below threshold when prose it cannot read is mixed into a block", () => {
    const messy = `S360
Warm Up
Band Pull Apart x15

M1 Back Squat 5x5
Remember that the hips should track over the mid foot throughout, and if anyone
Ask Sarah about her shoulder before she loads the bar today please
Whoever is on the far rack needs the safety pins reset to hole seven`;
    const r = parsePlanText(messy);
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
    expect(r.reasons.some(x => x.startsWith("unparsed"))).toBe(true);
  });

  // Isolates the unparsed-line PENALTY specifically. The suite's other gating
  // tests are carried by the coverage ratio alone, so removing the penalty left
  // them green — a vacuous test the mutation harness caught. This fixture has
  // high coverage (13 of 15 lines claimed) and would sit ABOVE threshold on
  // coverage alone; only the penalty pushes it under.
  it("penalises unreadable lines even when coverage is otherwise high", () => {
    const mostlyGood = `S360
Squat — Strength

Warm Up
Band Pull Apart x15
Scap Push Up x10
Air Squat x10

M1 Back Squat
5x5 @ RIR 2
Rest 3min
Whoever is on the far rack needs the safety pins reset to hole seven

A1 DB Bench Press 12-10-10-8
A2 Chest Supported Row 12-10-10-8
3 rounds, rest 90s
Ask Sarah about her shoulder before she loads the bar today please`;
    const r = parsePlanText(mostlyGood);
    expect(r.reasons.filter(x => x.startsWith("unparsed"))).toHaveLength(2);
    // Coverage alone would clear the bar; the penalty is what defers this slide.
    expect(r.stats.lines - 2).toBeGreaterThanOrEqual(Math.ceil(r.stats.lines * 0.85));
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
  });

  it("keeps an inline scheme OUT of the movement name", () => {
    // "Back Squat 5x5" and "Back Squat" must aggregate as the SAME movement.
    const r = parsePlanText("S360\nM1 Back Squat 5x5\nRest 3min");
    const m1 = r.plan.blocks.find(b => b.label === "M1");
    expect(m1.exercises[0].name).toBe("Back Squat");
    expect(m1.scheme.sets).toBe(5);
    expect(m1.scheme.reps).toEqual([5]);
  });

  it("never emits blocks with zero exercises as a confident parse", () => {
    const r = parsePlanText("S360\nM1\n5x5\nRest 3min");
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
  });

  it("is DETERMINISTIC — the same input parses identically every time", () => {
    const a = parsePlanText(S360), b = parsePlanText(S360);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// Every case below was found by importing the S360 fixture through the real UI and
// reading what actually landed in localStorage — none was caught by the unit
// fixtures above, which is the argument for exercising the wired path.
describe("regressions found in live import output", () => {
  it("an explicit DB marker beats the movement-name rule ('DB Bench Press' is not barbell)", () => {
    expect(inferEquip("DB Bench Press")).toBe("DB");
    expect(inferEquip("KB Deadlift")).toBe("KB");
    // and a bare movement name still resolves to barbell
    expect(inferEquip("Bench Press")).toBe("barbell");
  });

  it("a bare role word under a slot label is not a movement", () => {
    const r = parsePlanText("S360\nC1 Finisher\nFarmers Carry 40m");
    const c1 = r.plan.blocks.find(b => b.label === "C1");
    expect(c1.role).toBe("finisher");
    expect(c1.exercises.map(e => e.name)).toEqual(["Farmers Carry"]);
  });

  it("a STATED round count beats a set count inferred from ladder length", () => {
    const r = parsePlanText(`S360
A1 DB Bench Press 12-10-10-8
A2 Chest Supported Row 12-10-10-8
3 rounds, rest 90s`);
    const sup = r.plan.blocks.find(b => b.role === "superset");
    expect(sup.scheme.reps).toEqual([12, 10, 10, 8]);   // ladder preserved
    expect(sup.scheme.sets).toBe(3);                     // the deck said 3, not 4
  });

  it("still infers sets from the ladder when the coach states no count", () => {
    const r = parsePlanText("S360\nM1 Back Squat\n12-10-10-8\nRest 3min");
    expect(r.plan.blocks.find(b => b.label === "M1").scheme.sets).toBe(4);
  });

  it("never leaks the internal _setsInferred flag into the stored shape", () => {
    [S360, GC, ENDURO].forEach(fx => {
      parsePlanText(fx).plan.blocks.forEach(b => {
        expect(Object.keys(b.scheme)).not.toContain("_setsInferred");
      });
    });
  });

  // ── Session 9: found by pasting a real-shaped deck through the UI ──────────
  // The movement NAME is the aggregation key for the whole persona thesis: the
  // catalog, the derived blueprint's categories, and what draftFromBlueprint
  // picks from. Anything left clinging to a name splits one movement into two
  // and neither half has the coach's full history.
  it("strips a TIME-suffixed rep count out of the movement name", () => {
    const r = parsePlanText("S360\nC1\nAssault Bike 3x30s\nBurpee 3x10");
    const c1 = r.plan.blocks.find(b => b.label === "C1");
    // "Burpee 3x10" always cleaned up; "Assault Bike 3x30s" kept every
    // character, because `\b` cannot sit between `0` and `s`. The catalog then
    // held "Assault Bike" and "Assault Bike 3x30s" as two different movements.
    expect(c1.exercises.map(e => e.name)).toEqual(["Assault Bike", "Burpee"]);
  });

  it("accepts the spelled-out time units too", () => {
    const names = t => parsePlanText(`S360\nC1\n${t}`).plan.blocks[0].exercises.map(e => e.name);
    expect(names("Row 3x30 sec")).toEqual(["Row"]);
    expect(names("Plank 3x45secs")).toEqual(["Plank"]);
    expect(names("Ski Erg 4x2min")).toEqual(["Ski Erg"]);
  });

  // A bare `m` is metres at least as often as minutes, and TARGET_RE owns
  // distance — so an unrecognised unit must leave the line ALONE rather than
  // strip half of it and hand back a name like "Farmer Carry kg".
  it("leaves an unrecognised unit alone rather than half-stripping the name", () => {
    const r = parsePlanText("S360\nC1\nFarmer Carry 3x30kg");
    expect(r.plan.blocks[0].exercises[0].name).toBe("Farmer Carry 3x30kg");
  });

  it("strips an intensity qualifier the block scheme has already recorded", () => {
    const r = parsePlanText("S360\nM1 — Deadlift\nConventional Deadlift 4x5 @RPE8");
    const m1 = r.plan.blocks.find(b => b.label === "M1");
    // Recorded once, in the scheme...
    expect(m1.scheme.rpe).toBe(8);
    // ...and not a second time, welded to the movement name.
    expect(m1.exercises.map(e => e.name)).toContain("Conventional Deadlift");
    expect(m1.exercises.every(e => !/RPE/i.test(e.name))).toBe(true);
  });

  it("strips RIR the same way", () => {
    const r = parsePlanText("S360\nM1\nBack Squat 4x6 RIR 2");
    expect(r.plan.blocks[0].exercises[0].name).toBe("Back Squat");
  });

  // A block header written "M1 — Deadlift" names the slot AND this week's focus,
  // which is exactly how `slotKey()` in blueprints.js already reads it. Parsing
  // that suffix as a movement invented an exercise the coach never wrote on a
  // movement line, and fed it into the catalog personaAggregate builds — at
  // confidence 1, which §4.3.2 says must never happen.
  it("does not turn a block label's focus suffix into a phantom movement (M1 — Deadlift)", () => {
    const r = parsePlanText("S360\nM1 — Deadlift\nConventional Deadlift 4x5");
    const m1 = r.plan.blocks.find(b => b.label === "M1");
    expect(m1.exercises.map(e => e.name)).toEqual(["Conventional Deadlift"]);
  });

  it("reads the colon form as a focus suffix too", () => {
    const r = parsePlanText("S360\nM1: Deadlift\nConventional Deadlift 4x5");
    expect(r.plan.blocks[0].exercises.map(e => e.name)).toEqual(["Conventional Deadlift"]);
  });

  // The separator alone is NOT the signal. When the suffix is the block's only
  // movement-shaped content it IS the movement — dropping it would lose the only
  // one the coach wrote, which is worse than the phantom it replaces.
  it("keeps the suffix when it is the block's only movement", () => {
    const r = parsePlanText("S360\nM1 — Deadlift\nB1 Bench Press 3x5");
    expect(r.plan.blocks.find(b => b.label === "M1").exercises.map(e => e.name)).toEqual(["Deadlift"]);
  });

  // Unseparated inline content is load-bearing and must be untouched by all this.
  it("still treats unseparated inline content as the movement", () => {
    const r = parsePlanText("S360\nM1 Back Squat 5x5");
    expect(r.plan.blocks[0].exercises.map(e => e.name)).toEqual(["Back Squat"]);
  });

  // A scheme written on the header line must survive the label being dropped.
  it("keeps a scheme stated on the header line", () => {
    const r = parsePlanText("S360\nM1 — Deadlift 5x5\nRomanian Deadlift 3x8");
    const m1 = r.plan.blocks[0];
    expect(m1.exercises.map(e => e.name)).toEqual(["Romanian Deadlift"]);
    expect(m1.scheme.sets).toBe(3);
  });

  // A role word as the suffix is block furniture, not a movement — the same rule
  // that stops a bare "Finisher" line entering the catalog.
  it("does not promote a role-word suffix to a movement", () => {
    const r = parsePlanText("S360\nC1 — Warm Up\nArm Swings");
    expect(r.plan.blocks[0].exercises.map(e => e.name)).toEqual(["Arm Swings"]);
  });
});

describe("plan title", () => {
  // The deck names the class type twice — once alone, once leading the focus line
  // — and the join produced "S360 — S360 — Week 4".
  it("does not repeat a class type the focus line already leads with", () => {
    expect(parsePlanText("S360\nS360 — Week 4\nM1 Back Squat 5x5").title).toBe("S360 — Week 4");
  });

  it("still joins a focus that does not lead with the class type", () => {
    expect(parsePlanText("GC\nGCX — Week 4\nM1 Back Squat 5x5").title).toBe("GC — GCX — Week 4");
  });
});

describe("output shape compatibility with the LLM extractor", () => {
  it("emits exactly the block/scheme/exercise fields personaAggregate consumes", () => {
    const b = parsePlanText(S360).plan.blocks[0];
    expect(Object.keys(b).sort()).toEqual(["exercises", "label", "role", "rotation", "scheme"]);
    expect(Object.keys(b.scheme).sort()).toEqual(["note", "reps", "rest_sec", "rir", "rpe", "sets", "type"]);
    expect(Object.keys(b.exercises[0]).sort()).toEqual(["equip", "name", "per_side", "regression", "reps", "target"]);
  });

  it("only ever emits roles the schema allows", () => {
    [S360, GC, ENDURO].forEach(fx => {
      parsePlanText(fx).plan.blocks.forEach(b => expect(_internal.ROLES).toContain(b.role));
    });
  });

  it("only ever emits scheme types the schema allows", () => {
    const legal = ["sets_reps", "rounds", "time", "interval", "amrap"];
    [S360, GC, ENDURO].forEach(fx => {
      parsePlanText(fx).plan.blocks.forEach(b => expect(legal).toContain(b.scheme.type));
    });
  });
});

// ── Per-coach parse hints (§4.3.2) ───────────────────────────────────────────
// A coach's own corpus is EVIDENCE about their notation. Feeding it back turns
// slides the generic rules would defer into slides that parse for free — which
// is what makes the LLM a cold-start tool rather than the steady-state engine.
describe("deriveHints", () => {
  it("collects movement vocabulary from both the catalog and past plans", () => {
    const h = deriveHints(
      [{ classType: "S360", plan: { blocks: [{ label: "M1", exercises: [{ name: "Zercher Squat" }] }] } }],
      [{ name: "Sandbag Carry", aliases: ["Bag Carry"] }],
    );
    expect(h.movements).toContain("zercher squat");
    expect(h.movements).toContain("sandbag carry");
    expect(h.movements).toContain("bag carry");     // aliases count as vocabulary
    expect(h.classTypes).toEqual(["S360"]);
    expect(h.labels).toContain("M1");
  });

  it("survives an empty or malformed corpus", () => {
    expect(deriveHints()).toEqual({ movements: [], classTypes: [], labels: [] });
    expect(deriveHints([{}, null], [null, {}])).toEqual({ movements: [], classTypes: [], labels: [] });
  });
});

describe("hint-assisted parsing", () => {
  // A real movement name long enough to fail the deliberately strict generic
  // heuristic (it caps a movement line at 9 words, so prose doesn't reach the
  // catalog). Coaches genuinely write names this descriptive.
  const MOVE = "Half Kneeling Single Arm Landmine Press With Pause At Top";
  const ODD = `Fundamental
C1 Conditioning
${MOVE} x8
Row 500m`;

  it("defers this slide WITHOUT hints", () => {
    const r = parsePlanText(ODD);
    expect(r.plan.blocks[0].exercises.map(e => e.name)).not.toContain(MOVE);
    expect(r.reasons.some(x => x.startsWith("unparsed"))).toBe(true);
  });

  it("parses it once the coach's own corpus names that movement", () => {
    const hints = deriveHints([], [{ name: MOVE }]);
    const r = parsePlanText(ODD, { hints });
    const names = r.plan.blocks.flatMap(b => b.exercises.map(e => e.name));
    expect(names).toContain(MOVE);
    expect(r.stats.hinted).toBeGreaterThan(0);
  });

  it("raises confidence — the hinted line is genuinely accounted for, not waved through", () => {
    const hints = deriveHints([], [{ name: MOVE }]);
    expect(parsePlanText(ODD, { hints }).confidence)
      .toBeGreaterThan(parsePlanText(ODD).confidence);
  });

  it("recognises a class type this coach uses that the generic rule would miss", () => {
    const hints = deriveHints([{ classType: "Fundamental" }], []);
    expect(parsePlanText(ODD, { hints }).classType).toBe("Fundamental");
    expect(parsePlanText(ODD).classType).not.toBe("Fundamental");
  });

  it("hints RECOGNISE, they do not wave everything through", () => {
    // The safety property that keeps "never silently guess" true. With a vocabulary
    // loaded, prose sitting in the same block as a known movement must STILL be
    // unparsed — if hints made every line acceptable, coaching notes and logistics
    // would enter the coach's movement catalog as exercises they never programmed.
    const hints = deriveHints([], [{ name: MOVE }]);
    const r = parsePlanText(`Fundamental
C1 Conditioning
${MOVE} x8
Whoever is on the far rack needs the safety pins reset to hole seven please`, { hints });
    const names = r.plan.blocks.flatMap(b => b.exercises.map(e => e.name));
    expect(names).toContain(MOVE);
    expect(names.join(" ")).not.toMatch(/safety pins/i);
    expect(r.reasons.some(x => x.startsWith("unparsed"))).toBe(true);
  });

  it("hints NEVER invent structure — an empty slide stays empty and still defers", () => {
    const hints = deriveHints([], [{ name: "Back Squat" }, { name: "Row" }]);
    const r = parsePlanText("THE GARAGE\nStrength in numbers\n@thegarage", { hints });
    expect(r.plan.blocks).toHaveLength(0);
    expect(r.confidence).toBeLessThan(PARSE_THRESHOLD);
  });

  it("hints do not change a slide that already parsed cleanly", () => {
    const hints = deriveHints([], [{ name: "Back Squat" }]);
    const withHints = parsePlanText(S360, { hints });
    const without = parsePlanText(S360);
    expect(withHints.plan).toEqual(without.plan);
  });
});

// ── D2 · blueprint-driven parsing (§4.3.2, §9.1) ─────────────────────────────
//
// Hints taught the parser a coach's VOCABULARY. A blueprint teaches it their
// STRUCTURE — which is the half §4.3.2 said the parser has to guess at.
//
// The case that matters is a deck whose slots carry no role words at all. To a
// naive letter rule "C1 / C2 / C3" is one superset (same letter, three members,
// all plain); to the coach it is a warm-up, a circuit and a finisher in sequence.
// Folding them destroys the class structure. The coach's own blueprint is the
// evidence that settles it — and it settles it WITHOUT the parser inventing
// anything, because every block it names already exists on the slide.
describe("D2 — the coach's blueprint resolves what the parser would guess", () => {
  // Bare lettered slots: no "Warm Up", no "AMRAP", no "Finisher" anywhere.
  const BARE = `GC
Fundamental

C1
Row 500m
Air Squat x10

C2
10 Wall Balls
15 Cal Row

C3
Burpee x20`;

  const BLUEPRINT = {
    classType: "GC",
    slots: [
      { key: "C1", role: "warmup" },
      { key: "C2", role: "circuit" },
      { key: "C3", role: "finisher" },
    ],
  };

  it("without a blueprint the bare slots fold into ONE superset — the defect", () => {
    // Pinned deliberately: this is the behaviour the blueprint exists to correct,
    // and if it ever changes on its own the test below stops proving anything.
    const r = parsePlanText(BARE);
    expect(r.plan.blocks).toHaveLength(1);
    expect(r.plan.blocks[0].role).toBe("superset");
  });

  it("with the coach's blueprint they stay three blocks, in the coach's roles", () => {
    const r = parsePlanText(BARE, { blueprint: BLUEPRINT });
    expect(r.plan.blocks.map(b => b.label)).toEqual(["C1", "C2", "C3"]);
    expect(r.plan.blocks.map(b => b.role)).toEqual(["warmup", "circuit", "finisher"]);
  });

  it("reports how many blocks the blueprint resolved, so its value is visible", () => {
    expect(parsePlanText(BARE, { blueprint: BLUEPRINT }).stats.blueprint).toBe(3);
    expect(parsePlanText(BARE).stats.blueprint).toBe(0);
  });

  it("resolves the blueprint from a per-class-type map on the detected class type", () => {
    const r = parsePlanText(BARE, { blueprints: { GC: BLUEPRINT, S360: { slots: [] } } });
    expect(r.plan.blocks.map(b => b.role)).toEqual(["warmup", "circuit", "finisher"]);
  });

  it("does NOT override what the coach wrote on the slide itself", () => {
    // The blueprint calls C1 a warm-up; this week's slide says C1 is the finisher.
    // The slide is this class; the blueprint is the usual shape. The slide wins.
    const bp = { slots: [{ key: "C1", role: "warmup" }] };
    const r = parsePlanText("GC\nC1 Finisher\nFarmers Carry 40m", { blueprint: bp });
    expect(r.plan.blocks[0].role).toBe("finisher");
    expect(r.stats.blueprint).toBe(0);   // not counted — the slide resolved it
  });

  it("never injects a role that is not a real role", () => {
    const bp = { slots: [{ key: "C1", role: "nonsense" }, { key: "C2", role: "circuit" }] };
    const r = parsePlanText(BARE, { blueprint: bp });
    r.plan.blocks.forEach(b => expect(_internal.ROLES).toContain(b.role));
  });

  it("still folds a GENUINE superset the blueprint declares as one", () => {
    const bp = { slots: [{ key: "A1", role: "superset" }, { key: "A2", role: "superset" }] };
    const r = parsePlanText(S360, { blueprint: bp });
    expect(r.plan.blocks.some(b => b.label === "A1+A2" && b.role === "superset")).toBe(true);
  });

  it("changes NOTHING about the plan on a deck that states its own structure", () => {
    // The output is what matters, and it is byte-identical.
    //
    // Note the counter still reads 1 here, and that is correct rather than a leak:
    // GC's "C2 AMRAP 12min" names a SCHEME, not a role, so the slide never says
    // what that block IS — without a blueprint its role comes from the amrap→circuit
    // fallback. The blueprint supplies it directly and happens to agree. Counting it
    // is the honest reading of "roles the blueprint resolved rather than guessed".
    const withBp = parsePlanText(GC, { blueprint: BLUEPRINT });
    expect(withBp.plan).toEqual(parsePlanText(GC).plan);
    expect(withBp.stats.blueprint).toBe(1);
  });

  it("a blueprint only ever RESOLVES a block — it cannot create one", () => {
    const bp = { slots: [{ key: "C1", role: "warmup" }, { key: "Z9", role: "finisher" }] };
    const r = parsePlanText(BARE, { blueprint: bp });
    expect(r.plan.blocks.map(b => b.label)).not.toContain("Z9");
  });
});
