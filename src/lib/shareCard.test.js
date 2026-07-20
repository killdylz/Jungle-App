import { describe, it, expect } from "vitest";
import {
  cardMovements, shareCardModel, shareCardFilename, wrapLines, fitFontSize,
  MAX_MOVEMENTS, CARD_W, CARD_H,
} from "./shareCard.js";

const stage = (name, exercises, dur = 600) => ({ name, dur, exercises });

const CLASS = [
  stage("Warm-up", [{ n: "Light Jog" }, { n: "Arm Swings" }], 300),
  stage("Circuit", [{ n: "Burpee Complex" }, { n: "Box Jump" }], 600),
  // Deliberate repeat: a circuit that comes back to Burpees must not list them
  // twice — the card is a poster, not a spec sheet.
  stage("Circuit 2", [{ n: "Burpee Complex" }, { n: "Wall Balls" }], 600),
];

// A minimal 2D-context stand-in. Canvas is nearly untestable in a unit runner,
// but the layout maths — which is what actually loses information — is pure.
// Width is proportional to length, which is enough to exercise fitting/wrapping.
const fakeCtx = (perChar = 10) => ({
  font: "",
  measureText: (t) => ({ width: String(t).length * perChar }),
});

describe("what goes on the card", () => {
  it("lists each movement once, in the order it is first programmed", () => {
    expect(cardMovements(CLASS)).toEqual([
      "Light Jog", "Arm Swings", "Burpee Complex", "Box Jump", "Wall Balls",
    ]);
  });

  it("ignores blank and whitespace-only movement names", () => {
    const s = [stage("x", [{ n: "" }, { n: "   " }, { n: null }, { n: "Row" }])];
    expect(cardMovements(s)).toEqual(["Row"]);
  });

  it("de-duplicates case-insensitively", () => {
    const s = [stage("x", [{ n: "Back Squat" }, { n: "back squat" }])];
    expect(cardMovements(s)).toEqual(["Back Squat"]);
  });

  it("survives a malformed class without throwing at the coach", () => {
    expect(cardMovements(null)).toEqual([]);
    expect(cardMovements([{ }, { exercises: null }])).toEqual([]);
  });
});

describe("the model", () => {
  it("carries the facts a poster needs", () => {
    const m = shareCardModel({
      stages: CLASS, sessionName: "Friday Burn", gymName: "The Garage",
      date: new Date("2026-07-24T10:00:00Z"),
    });
    expect(m.gymName).toBe("The Garage");
    expect(m.title).toBe("Friday Burn");
    expect(m.minutes).toBe(25);
    expect(m.stageCount).toBe(3);
    expect(m.movements).toHaveLength(5);
    expect(m.overflow).toBe(0);
    expect(m.isEmpty).toBe(false);
  });

  it("never renders an untitled card", () => {
    // A card with no headline is worse than a generic one.
    expect(shareCardModel({ stages: CLASS }).title).toBe("Today's class");
    expect(shareCardModel({ stages: CLASS, sessionName: "   " }).title).toBe("Today's class");
  });

  it("caps the list and SAYS how many it dropped", () => {
    // Silently truncating would misrepresent the class. "+N more" is the honest
    // version, and it is the same rule as everywhere else in this codebase.
    const many = [stage("x", Array.from({ length: 20 }, (_, i) => ({ n: `Move ${i}` })))];
    const m = shareCardModel({ stages: many });
    expect(m.movements).toHaveLength(MAX_MOVEMENTS);
    expect(m.overflow).toBe(20 - MAX_MOVEMENTS);
  });

  it("reports an empty class rather than producing a beautiful empty poster", () => {
    const m = shareCardModel({ stages: [stage("Warm-up", [])], sessionName: "Nothing" });
    expect(m.isEmpty).toBe(true);
  });

  it("carries NO member data — this is the gym-side card", () => {
    // The member variant (streak, check-in) belongs with the N4 magic-link page.
    // Keeping identity out is what makes this shippable with zero PDPA surface.
    const m = shareCardModel({ stages: CLASS, sessionName: "Friday Burn", gymName: "The Garage" });
    expect(Object.keys(m).sort()).toEqual([
      "dateLabel", "gymName", "isEmpty", "minutes", "movements", "overflow", "stageCount", "title",
    ]);
  });
});

describe("text fitting", () => {
  it("shrinks a long headline down to the floor and no further", () => {
    const ctx = fakeCtx();
    expect(fitFontSize(ctx, "Short", 1000, 108, 56)).toBe(108);
    // 60 chars * 10 = 600px at any size in the stub, so a narrow box forces the
    // floor rather than an infinite loop or a zero-size font.
    expect(fitFontSize(ctx, "x".repeat(60), 100, 108, 56)).toBe(56);
  });

  it("wraps rather than overflowing the card edge", () => {
    const ctx = fakeCtx();
    const lines = wrapLines(ctx, "Friday Night Burn With The Whole Crew", 200, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    lines.forEach((l) => expect(l.length * 10).toBeLessThanOrEqual(220));
  });

  it("elides instead of dropping text off the end silently", () => {
    const ctx = fakeCtx();
    const lines = wrapLines(ctx, Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "), 200, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("never loses a single unbreakable word", () => {
    const ctx = fakeCtx();
    const lines = wrapLines(ctx, "Supercalifragilistic", 50, 3);
    expect(lines.join(" ")).toContain("Supercalifragilistic");
  });
});

describe("the file a coach ends up with", () => {
  it("is findable on a phone", () => {
    const m = shareCardModel({ stages: CLASS, sessionName: "Friday Burn", gymName: "The Garage" });
    expect(shareCardFilename(m)).toBe("the-garage-friday-burn.png");
  });

  it("degrades to something valid when nothing is branded", () => {
    const m = shareCardModel({ stages: CLASS });
    expect(shareCardFilename(m)).toMatch(/^[a-z0-9-]+\.png$/);
  });
});

describe("canvas dimensions", () => {
  it("is a 9:16 story", () => {
    expect(CARD_W / CARD_H).toBeCloseTo(9 / 16, 3);
  });
});
