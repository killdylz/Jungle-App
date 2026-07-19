// Movement taxonomy. This layer decides what KIND of thing every movement in the
// corpus is, and three things downstream trust it silently: blueprint slot
// filters, classCategory, and structural "no ergs in a strength block"
// discipline. A wrong category here is invisible — it does not throw, it just
// quietly puts a deadlift in a warm-up slot — which is exactly why the honest-
// blank guarantee below is tested as hard as the positive cases.
import { describe, it, expect } from "vitest";
import { CATEGORIES, HYROX_STATIONS, classifyMovement, categoryOf } from "./movementTaxonomy.js";

describe("CATEGORIES", () => {
  // Pinned in one place on purpose: a constrained value rejected downstream is
  // this repo's recurring data-loss bug (three occurrences). If this test fails,
  // every consumer of the set has to be checked before it is changed.
  it("is exactly the legal set, in order", () => {
    expect(CATEGORIES).toEqual(["warmup", "mobility", "strength", "conditioning", "core", "cooldown"]);
  });

  it("has no `hyrox` category — Hyrox is a format, not a movement property", () => {
    // A circuit class can own a sled without being Hyrox in any sense. Tagging
    // the movement with the format would mislabel every ordinary circuit that
    // uses one. The format lives in the blueprint preset (HYROX_STATIONS).
    expect(CATEGORIES).not.toContain("hyrox");
  });

  it("only ever emits a category from the legal set", () => {
    const names = ["Back Squat", "Sled Push", "Plank", "Burpee", "Couch Stretch", "Band Pull Apart", "Thoracic CAR"];
    names.forEach(n => expect(CATEGORIES).toContain(classifyMovement(n)));
  });
});

describe("HYROX_STATIONS", () => {
  it("is the complete eight", () => {
    expect(HYROX_STATIONS).toHaveLength(8);
    expect(HYROX_STATIONS).toContain("Wall Balls");   // the real 8th station
    expect(HYROX_STATIONS).not.toContain("Run");      // the run connects stations, it is not one
  });
});

describe("classifyMovement — loaded carries and sled work", () => {
  // Every one of these is a Hyrox station, and every one classifies as plain
  // conditioning. That is the point: the movement is what it is regardless of
  // the format it appears in, and a circuit class that owns a sled is not Hyrox.
  it.each([
    "Sled Push", "Sled Pull", "Heavy Sled Drag", "Prowler Push",
    "Farmers Carry", "Farmer's Walk", "Suitcase Carry",
    "Sandbag Lunge", "Sandbag Carry",
    "Burpee Broad Jump", "Ski Erg", "SkiErg",
    "Wall Balls", "Row", "400m Run",
  ])("classifies %s as conditioning", name => {
    expect(classifyMovement(name)).toBe("conditioning");
  });

  it("never emits `hyrox` for any of the eight stations", () => {
    // The regression guard for §13 Q8. HYROX_STATIONS exists for the blueprint
    // preset; it must not leak back into the taxonomy as a category.
    HYROX_STATIONS.forEach(s => expect(classifyMovement(s)).not.toBe("hyrox"));
  });
});

describe("classifyMovement — categories", () => {
  it.each([
    // strength
    ["Back Squat", "strength"],
    ["Front Squat", "strength"],
    ["Deadlift", "strength"],
    ["Romanian Deadlift", "strength"],
    ["Bench Press", "strength"],
    ["Overhead Press", "strength"],
    ["Power Clean", "strength"],
    ["Pull-Up", "strength"],
    ["Walking Lunge", "strength"],
    // conditioning
    ["Burpee", "conditioning"],
    ["Box Jump", "conditioning"],
    ["KB Swing", "conditioning"],
    ["Thruster", "conditioning"],
    ["Assault Bike", "conditioning"],
    ["Double Unders", "conditioning"],
    // core
    ["Plank", "core"],
    ["Hollow Hold", "core"],
    ["Pallof Press", "core"],
    ["Dead Bug", "core"],
    ["Toes to Bar", "core"],
    // warmup
    ["Band Pull Apart", "warmup"],
    ["Scap Push-Up", "warmup"],
    ["Banded Glute Bridge", "warmup"],
    ["Inchworm", "warmup"],
    // mobility
    ["World's Greatest Stretch", "mobility"],
    ["Hip 90/90 Flow", "mobility"],
    ["Shoulder CARs", "mobility"],
    ["Hamstring Floss", "mobility"],
    // cooldown
    ["Couch Stretch", "cooldown"],
    ["Pigeon Stretch", "cooldown"],
    ["Thoracic Foam Roll", "cooldown"],
    ["Child's Pose", "cooldown"],
    ["Box Breathing", "cooldown"],
  ])("classifies %s as %s", (name, cat) => {
    expect(classifyMovement(name)).toBe(cat);
  });
});

describe("classifyMovement — ordering is load-bearing", () => {
  // Each of these is a name that matches TWO rules. The more specific one has to
  // win, and it only does because of rule order — the same trap EQUIP_RULES
  // documents at planParser.js:242.
  it("reads Sandbag Lunge as conditioning, not a lunge", () => {
    // The carry rules sit above the strength rule precisely for this: the
    // generic `lunge` would otherwise claim it as leg strength.
    expect(classifyMovement("Sandbag Lunge")).toBe("conditioning");
    expect(classifyMovement("Walking Lunge")).toBe("strength");   // the general case still works
  });

  it("reads Sled Push as conditioning, not a press", () => {
    expect(classifyMovement("Sled Push")).toBe("conditioning");
    expect(classifyMovement("Bench Press")).toBe("strength");
  });

  it("reads Burpee Broad Jump as conditioning, like a plain burpee", () => {
    expect(classifyMovement("Burpee Broad Jump")).toBe("conditioning");
    expect(classifyMovement("Burpee")).toBe("conditioning");
  });

  it("reads Pallof Press as core, not a press", () => {
    expect(classifyMovement("Pallof Press")).toBe("core");
  });

  it("splits the raise family between core and strength", () => {
    // Found by driving the real sample corpus, not by unit tests: "Hanging Knee
    // Raise" came back `strength` because the generic `raise` rule took it.
    expect(classifyMovement("Hanging Knee Raise")).toBe("core");
    expect(classifyMovement("Leg Raise")).toBe("core");
    expect(classifyMovement("Calf Raise")).toBe("strength");     // still strength
    expect(classifyMovement("Lateral Raise")).toBe("strength");  // still strength
  });

  it("reads Couch Stretch as cooldown, not leg strength", () => {
    expect(classifyMovement("Couch Stretch")).toBe("cooldown");
  });

  it("reads Air Squat as conditioning, not a squat lift", () => {
    expect(classifyMovement("Air Squat")).toBe("conditioning");
    expect(classifyMovement("Back Squat")).toBe("strength");
  });

  it("separates a strength row from an erg row", () => {
    // The exact trap inferEquip hit: a bare "Row" is the erg; a qualified row is
    // a lift. Getting this backwards puts the erg in every strength block.
    expect(classifyMovement("Chest Supported Row")).toBe("strength");
    expect(classifyMovement("Bent Over Row")).toBe("strength");
    expect(classifyMovement("DB Row")).toBe("strength");
    expect(classifyMovement("Row")).toBe("conditioning");
    expect(classifyMovement("Row", "erg")).toBe("conditioning");
  });

  it("reads every erg variant as conditioning", () => {
    expect(classifyMovement("Ski Erg")).toBe("conditioning");
    expect(classifyMovement("Assault Bike")).toBe("conditioning");
  });
});

describe("classifyMovement — the honest blank", () => {
  // An unmatched name returns "" and the catalog flags it "needs category" for
  // the coach. A confident wrong guess would skew aggregation with nothing to
  // flag it — the same reasoning as inferEquip's "Chest Supported Row" → "".
  it("returns blank for a movement it does not recognise", () => {
    expect(classifyMovement("Atlas Press")).toBe("");
    expect(classifyMovement("Serpent Row Variation Two")).toBe("");
    expect(classifyMovement("Zombie Walk")).toBe("");
  });

  it("returns blank for empty input", () => {
    expect(classifyMovement("")).toBe("");
    expect(classifyMovement(null)).toBe("");
    expect(classifyMovement(undefined, undefined)).toBe("");
  });

  it("never classifies a MODIFIER as a movement", () => {
    // These are scheme/intensity/structure tokens. The parser already strips
    // them, but anything that leaks through must not acquire a category and
    // ride into the catalog as if it were a movement.
    ["rest 90s", "walk-back recovery", "RIR 2", "RPE 7-8", "%1RM", "31X1",
     "3 rounds", "go to B after", "1st set as primer", "AMRAP 12min",
    ].forEach(mod => expect(classifyMovement(mod)).toBe(""));
  });
});

describe("categoryOf", () => {
  it("prefers the coach's override over the derived value", () => {
    // The coach's judgement is the asset; derivation is a convenience.
    expect(categoryOf({ name: "Row", category: "conditioning", meta: { category: "strength" } })).toBe("strength");
  });

  it("falls back to the derived value when there is no override", () => {
    expect(categoryOf({ name: "Row", category: "conditioning", meta: {} })).toBe("conditioning");
    expect(categoryOf({ name: "Row", category: "conditioning" })).toBe("conditioning");
  });

  it("re-derives rather than trusting a STALE stored category", () => {
    // Found by driving the UI: a catalog is only re-aggregated when a persona's
    // plans change, so a row written under older rules keeps its old value
    // forever. "Hanging Knee Raise" was stored as `strength` and stayed strength
    // across reloads even after the rules were corrected to `core`. Reading
    // through the rules is what makes the improvement actually reach a coach.
    expect(categoryOf({ name: "Hanging Knee Raise", category: "strength" })).toBe("core");
  });

  it("still lets an override beat a stale stored value", () => {
    expect(categoryOf({ name: "Hanging Knee Raise", category: "strength", meta: { category: "strength" } })).toBe("strength");
  });

  it("ignores an override that is not a legal category", () => {
    // Guards against a stale or hand-edited meta blob poisoning slot filters —
    // including `hyrox`, which WAS a legal category before §13 Q8 was settled,
    // so a catalog written by the earlier build can still carry one.
    expect(categoryOf({ name: "Row", category: "conditioning", meta: { category: "cardio" } })).toBe("conditioning");
    expect(categoryOf({ name: "Sled Push", category: "conditioning", meta: { category: "hyrox" } })).toBe("conditioning");
  });

  it("returns blank when nothing is known", () => {
    expect(categoryOf({ name: "Atlas Press" })).toBe("");
    expect(categoryOf(null)).toBe("");
  });
});
