import { describe, it, expect } from "vitest";
import { WORKOUT_LIBRARY } from "../data/library.js";
import { diffLibrary, mergeLibrary, isLegacyLibraryBlob, LIBRARY_BLOB_VERSION,
         resolveClassType } from "./libraryStore.js";

// DEC-13. The thing under test is not "does a diff work" — it is the PROMISE
// "the studio's movement catalogue, editable per gym". A gym must be able to
// rewrite its own CrossFit main set AND still receive next month's improvement
// to its warm-ups. The old full-snapshot blob broke the second half of that
// silently and permanently, so these tests are written against the promise.

const clone = o => JSON.parse(JSON.stringify(o));
const size = o => JSON.stringify(o).length;

// The real edit the Library modal performs: `{...lib, [cls]:{...cls, subTypes:
// {...subTypes, [sub]:{...sub, [pool]: newList}}}}` (App.jsx updateExerciseList).
function editPool(lib, ck, sk, pool, fn) {
  const next = clone(lib);
  next[ck].subTypes[sk][pool] = fn(next[ck].subTypes[sk][pool]);
  return next;
}

const CK = "crossfit", SK = "wod";

describe("libraryStore — what gets written", () => {
  it("writes nothing at all for an untouched catalogue", () => {
    expect(diffLibrary(WORKOUT_LIBRARY, clone(WORKOUT_LIBRARY))).toBeNull();
  });

  // The headline number. The old format wrote the whole catalogue — every class
  // type — to Postgres for this exact edit.
  it("writes one pool, not the catalogue, when a coach adds one movement", () => {
    const edited = editPool(WORKOUT_LIBRARY, CK, SK, "main", list =>
      [...list, { id: "custom_1", n: "Sandbag Carry", s: "3", r: "40m", rest: "60s", muscles: "Full body", notes: "", timing: "none" }]);
    const delta = diffLibrary(WORKOUT_LIBRARY, edited);

    expect(Object.keys(delta.classes)).toEqual([CK]);
    expect(Object.keys(delta.classes[CK].subTypes)).toEqual([SK]);
    expect(Object.keys(delta.classes[CK].subTypes[SK])).toEqual(["main"]);
    // The whole catalogue is ~59 KB; one pool is a few hundred bytes.
    expect(size(WORKOUT_LIBRARY)).toBeGreaterThan(50_000);
    expect(size(delta)).toBeLessThan(3_000);
  });

  // A coach who deletes a movement and then re-adds it is not "a gym with
  // overrides" — leaving an empty snapshot behind would re-freeze them for good.
  it("collapses back to nothing when an edit is undone", () => {
    const edited  = editPool(WORKOUT_LIBRARY, CK, SK, "main", list => list.slice(1));
    const undone  = editPool(edited, CK, SK, "main", () => clone(WORKOUT_LIBRARY[CK].subTypes[SK].main));
    expect(diffLibrary(WORKOUT_LIBRARY, edited)).not.toBeNull();
    expect(diffLibrary(WORKOUT_LIBRARY, undone)).toBeNull();
  });
});

describe("libraryStore — the round trip", () => {
  // If this ever fails, a coach's edit has been dropped on save.
  it("reproduces the edited catalogue exactly", () => {
    let edited = editPool(WORKOUT_LIBRARY, CK, SK, "main", list => list.slice(0, 1));
    edited = editPool(edited, "spin", "hills", "warmup", list =>
      [...list, { id: "x1", n: "Ankle Circles", s: "1", r: "20", rest: "", muscles: "", notes: "", timing: "none" }]);
    edited.yoga.subTypes.vinyasa.label = "Vinyasa (Level 2)";
    edited.boxing.color = "#ff0000";

    expect(mergeLibrary(WORKOUT_LIBRARY, diffLibrary(WORKOUT_LIBRARY, edited))).toEqual(edited);
  });

  it("carries a class type the built-in catalogue has never heard of", () => {
    const edited = clone(WORKOUT_LIBRARY);
    edited.aerial = { label: "Aerial", icon: "🎪", color: "#8844ff", description: "Silks",
      subTypes: { intro: { label: "Intro", description: "", warmup: [], main: [{ id: "a1", n: "Foot Lock", s: "3", r: "5", rest: "60s", muscles: "", notes: "", timing: "none" }], cooldown: [] } } };
    const delta = diffLibrary(WORKOUT_LIBRARY, edited);
    expect(mergeLibrary(WORKOUT_LIBRARY, delta).aerial).toEqual(edited.aerial);
  });

  it("remembers a removal, which an absent key cannot express", () => {
    const edited = clone(WORKOUT_LIBRARY);
    delete edited.hyrox;
    delete edited[CK].subTypes.emom;
    const merged = mergeLibrary(WORKOUT_LIBRARY, diffLibrary(WORKOUT_LIBRARY, edited));
    expect(merged.hyrox).toBeUndefined();
    expect(merged[CK].subTypes.emom).toBeUndefined();
    expect(merged).toEqual(edited);
  });
});

// ── The actual point of DEC-13 ───────────────────────────────────────────────
describe("libraryStore — a gym that edits is not frozen", () => {
  // "Next month's src/data/library.js": a better cue on an untouched pool, a new
  // movement in another class, and a brand-new class type.
  function improvedLibrary() {
    const next = clone(WORKOUT_LIBRARY);
    next[CK].subTypes[SK].warmup[0].notes = "Improved coaching cue";
    next.spin.subTypes.hills.main.push({ id: "new-spin", n: "Seated Grind", s: "3", r: "2 min", rest: "60s", muscles: "Quads", notes: "", timing: "none" });
    next.mobility = { label: "Mobility", icon: "🧘", color: "#22aa88", description: "", subTypes: {} };
    return next;
  }

  const gymEdit = lib => editPool(lib, CK, SK, "main", list =>
    [...list, { id: "custom_2", n: "House Special", s: "5", r: "5", rest: "90s", muscles: "", notes: "", timing: "none" }]);

  it("delivers improvements to every pool the gym did not touch", () => {
    const delta  = diffLibrary(WORKOUT_LIBRARY, gymEdit(WORKOUT_LIBRARY));
    const merged = mergeLibrary(improvedLibrary(), delta);

    expect(merged[CK].subTypes[SK].warmup[0].notes).toBe("Improved coaching cue");
    expect(merged.spin.subTypes.hills.main.some(e => e.n === "Seated Grind")).toBe(true);
    expect(merged.mobility).toBeDefined();
  });

  it("still keeps the gym's own edit to the pool it did rewrite", () => {
    const delta  = diffLibrary(WORKOUT_LIBRARY, gymEdit(WORKOUT_LIBRARY));
    const merged = mergeLibrary(improvedLibrary(), delta);
    expect(merged[CK].subTypes[SK].main.some(e => e.n === "House Special")).toBe(true);
  });

  // The old behaviour, kept as a test so the regression is named. Under the v1
  // snapshot the improved warm-up cue could never reach this gym.
  it("is exactly what the old full-snapshot blob could not do", () => {
    const snapshot = gymEdit(WORKOUT_LIBRARY);          // v1 wrote this whole thing
    const underV1  = mergeLibrary(improvedLibrary(), snapshot);
    expect(underV1[CK].subTypes[SK].warmup[0].notes).not.toBe("Improved coaching cue");
  });
});

describe("libraryStore — blobs written before DEC-13", () => {
  const legacy = () => {
    const snap = clone(WORKOUT_LIBRARY);
    snap[CK].subTypes[SK].main = [{ id: "old_1", n: "Legacy Movement", s: "3", r: "8", rest: "45s", muscles: "", notes: "", timing: "none" }];
    return snap;
  };

  it("recognises one", () => {
    expect(isLegacyLibraryBlob(legacy())).toBe(true);
    expect(isLegacyLibraryBlob({ v: LIBRARY_BLOB_VERSION, classes: {} })).toBe(false);
    expect(isLegacyLibraryBlob(null)).toBe(false);
  });

  it("reads one exactly as the old code did, so no gym loses an edit", () => {
    expect(mergeLibrary(WORKOUT_LIBRARY, legacy())[CK].subTypes[SK].main)
      .toEqual([expect.objectContaining({ n: "Legacy Movement" })]);
  });

  // The migration: the next save converts v1 → v2. It must be LOSSLESS, or the
  // upgrade silently reverts whatever that gym had customised.
  it("converts to a delta with nothing lost", () => {
    const asRead    = mergeLibrary(WORKOUT_LIBRARY, legacy());
    const converted = diffLibrary(WORKOUT_LIBRARY, asRead);
    expect(mergeLibrary(WORKOUT_LIBRARY, converted)).toEqual(asRead);
    expect(size(converted)).toBeLessThan(size(legacy()) / 10);
  });

  it("treats junk as no overrides rather than throwing", () => {
    expect(mergeLibrary(WORKOUT_LIBRARY, null)).toBe(WORKOUT_LIBRARY);
    expect(mergeLibrary(WORKOUT_LIBRARY, "nonsense")).toBe(WORKOUT_LIBRARY);
    expect(mergeLibrary(WORKOUT_LIBRARY, [1, 2])).toBe(WORKOUT_LIBRARY);
    expect(diffLibrary(WORKOUT_LIBRARY, null)).toBeNull();
  });
});

// ── resolveClassType: one vocabulary for class_instances.class_type ──────────
//
// The column N2 groups by had three writers and two taxonomies. The Schedule
// wrote its own capitalised display strings ("HIIT", "Mobility") from a
// hand-maintained map; the Builder → Runner door writes catalogue KEYS
// ("hiit", "gym-barre-ms4pk827"). One gym running one class type through both
// doors produced two values no `group by` can reunite, and class_instances is
// append-only, so nothing recovers it afterwards.
//
// These pin the exact contract the Schedule now relies on, INCLUDING the case
// that must NOT be mapped.
describe("resolveClassType — the schedule and the runner must agree", () => {
  it("passes a catalogue key through untouched", () => {
    expect(resolveClassType("hiit", WORKOUT_LIBRARY)).toBe("hiit");
    expect(resolveClassType("crossfit", WORKOUT_LIBRARY)).toBe("crossfit");
  });

  // The whole point: every type the old Schedule dropdown could produce, except
  // Mobility, is one of these. Before this, publishing wrote the left column.
  it.each([
    ["HIIT", "hiit"], ["Strength", "strength"], ["Hyrox", "hyrox"],
    ["Circuit", "circuit"], ["Spin", "spin"], ["Yoga", "yoga"], ["Boxing", "boxing"],
  ])("heals the legacy display string %s to the key %s", (legacy, key) => {
    expect(resolveClassType(legacy, WORKOUT_LIBRARY)).toBe(key);
  });

  // Labels, not just keys — "Strength Training" is the catalogue's label for a
  // key that is only "strength", so a value copied off the screen still lands.
  it("matches a catalogue label as well as a key", () => {
    expect(resolveClassType("Strength Training", WORKOUT_LIBRARY)).toBe("strength");
    expect(resolveClassType("Boxing / Kickboxing", WORKOUT_LIBRARY)).toBe("boxing");
    expect(resolveClassType("  crossfit  ", WORKOUT_LIBRARY)).toBe("crossfit");
  });

  // 🔴 THE ONE THAT MUST NOT MAP. The old dropdown offered "Mobility" and the
  // catalogue has no class type that answers to it. Mapping it to a
  // near-neighbour would invent programming the gym never chose, and the gym
  // cannot tell that happened. It keeps its own text and stays visible.
  it("keeps an unrecognised type verbatim rather than guessing", () => {
    expect(resolveClassType("Mobility", WORKOUT_LIBRARY)).toBe("Mobility");
    expect(resolveClassType("Aerial Silks", WORKOUT_LIBRARY)).toBe("Aerial Silks");
  });

  // A gym-authored key (DEC-16) is a first-class type, not an unknown.
  it("passes a gym-authored key through", () => {
    const lib = { ...WORKOUT_LIBRARY, "gym-barre-x1": { label: "Barre", subTypes: {} } };
    expect(resolveClassType("gym-barre-x1", lib)).toBe("gym-barre-x1");
    expect(resolveClassType("Barre", lib)).toBe("gym-barre-x1");
  });

  it("survives junk without throwing", () => {
    expect(resolveClassType("", WORKOUT_LIBRARY)).toBe("");
    expect(resolveClassType(null, WORKOUT_LIBRARY)).toBe("");
    expect(resolveClassType(undefined, WORKOUT_LIBRARY)).toBe("");
    expect(resolveClassType("hiit", null)).toBe("hiit");
    expect(resolveClassType("hiit", {})).toBe("hiit");
  });
});
