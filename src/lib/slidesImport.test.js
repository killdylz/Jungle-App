// Slides-import pure logic. These functions decide what reaches the extractor and
// how a deck maps back to plans — get one wrong and the failure is SILENT: a coach's
// class is quietly missing from the corpus, or a plan lands under the wrong date.
// No amount of clicking through the UI surfaces that, which is why they're tested.
import { describe, it, expect } from "vitest";
import { parseDriveId, splitDeckSlides, slideDate, looksLikeClassSlide } from "./slidesImport.js";
import { parsePlanText, PARSE_THRESHOLD } from "./planParser.js";

describe("parseDriveId", () => {
  it("accepts the link shapes coaches actually paste", () => {
    // Folder link — the documented happy path.
    expect(parseDriveId("https://drive.google.com/drive/folders/1AbC_def-123")).toBe("1AbC_def-123");
    // A deck link, which is what coaches paste far more often than a folder link.
    expect(parseDriveId("https://docs.google.com/presentation/d/1XyZ_deck-99/edit#slide=id.p")).toBe("1XyZ_deck-99");
    expect(parseDriveId("https://drive.google.com/open?id=1Query_id-77")).toBe("1Query_id-77");
    expect(parseDriveId("1BareIdentifier_x")).toBe("1BareIdentifier_x");
    expect(parseDriveId("  1WhitespaceWrapped_y  ")).toBe("1WhitespaceWrapped_y");
  });

  it("returns empty for input that isn't an id, rather than guessing", () => {
    expect(parseDriveId("")).toBe("");
    expect(parseDriveId(null)).toBe("");
    expect(parseDriveId("not a link")).toBe("");
    expect(parseDriveId("short")).toBe("");   // under the 10-char floor
  });
});

describe("splitDeckSlides", () => {
  const deck = [
    "--- Slide 1 ---", "S360 Warm Up 5min",
    "", "--- Slide 2 ---", "M1 Back Squat 5x5",
    "", "--- Slide 3 ---", "C1 Finisher AMRAP 8min",
  ].join("\n");

  it("splits a multi-class deck back into per-slide classes", () => {
    const out = splitDeckSlides(deck);
    expect(out.map(s => s.n)).toEqual([1, 2, 3]);
    expect(out[0].text).toBe("S360 Warm Up 5min");
    expect(out[2].text).toBe("C1 Finisher AMRAP 8min");
  });

  it("keeps the real slide numbers, not array positions", () => {
    // Blank slides are dropped upstream, so numbering has gaps. A plan's sourceRef
    // is "<deckId>#s<N>", so a renumbered slide would break import dedupe.
    const gappy = "--- Slide 4 ---\nM1 Deadlift 5x3\n\n--- Slide 9 ---\nC1 Row 500m";
    expect(splitDeckSlides(gappy).map(s => s.n)).toEqual([4, 9]);
  });

  it("treats an unmarked deck as a single class", () => {
    expect(splitDeckSlides("Just one class, no markers")).toEqual([{ n: 1, text: "Just one class, no markers" }]);
  });

  it("returns nothing for empty input", () => {
    expect(splitDeckSlides("")).toEqual([]);
    expect(splitDeckSlides(null)).toEqual([]);
  });
});

describe("slideDate", () => {
  it("reads the slide's own date so a plan keeps its real date", () => {
    // Without this the plan inherits the DECK's modifiedTime — so an 18-session
    // historical deck would collapse to 18 plans all dated the day it was last saved,
    // destroying the chronology the persona profile is derived from.
    expect(slideDate("S360 — 11 July 2026\nM1 Back Squat")).toBe("2026-07-11");
    expect(slideDate("3 July 2026")).toBe("2026-07-03");   // zero-pads single digits
    expect(slideDate("13 JUNE 2026")).toBe("2026-06-13");  // case-insensitive
  });

  it("returns empty when there's no date to read", () => {
    expect(slideDate("M1 Back Squat 5x5")).toBe("");
    expect(slideDate("")).toBe("");
  });
});

describe("looksLikeClassSlide", () => {
  it("keeps real class slides", () => {
    expect(looksLikeClassSlide("S360 — 11 July 2026\nWarm Up 5min\nM1 Back Squat 5x5 RIR 2 rest 3min")).toBe(true);
    expect(looksLikeClassSlide("GC Fundamental\nC2 AMRAP 12min: 10 burpees, 15 KB swings")).toBe(true);
    expect(looksLikeClassSlide("Garage Enduro — Week 11 of 24\nRun 3km @ RPE 6\nSled push 6 x 20m")).toBe(true);
  });

  it("keeps a SHORT slide that carries a scheme signal", () => {
    // The regression this test exists for: at 34 chars this is under any sane length
    // floor, but it is unmistakably a class. An earlier version dropped it.
    expect(looksLikeClassSlide("M1 Deadlift 5x3 @ RPE 8, rest 3min")).toBe(true);
  });

  it("keeps a movement-only slide with no numbers at all", () => {
    expect(looksLikeClassSlide("Mobility flow: thoracic opener, hip 90/90, ankle rock, cool down")).toBe(true);
  });

  it("skips slides that are plainly not programming", () => {
    expect(looksLikeClassSlide("THE GARAGE")).toBe(false);
    expect(looksLikeClassSlide("Let's go!!")).toBe(false);
    expect(looksLikeClassSlide("@thegaragegym")).toBe(false);
    expect(looksLikeClassSlide("Coach Mara")).toBe(false);
    expect(looksLikeClassSlide("")).toBe(false);
    expect(looksLikeClassSlide(null)).toBe(false);
  });
});

// ── The whole import journey, in one pass ────────────────────────────────────
// Every test above pins ONE function. Three of session 9's five defects were
// disagreements BETWEEN parts, which per-function tests cannot see by
// construction. This drives a realistic mixed deck the whole way —
// splitDeckSlides -> looksLikeClassSlide -> slideDate -> parsePlanText -> the
// plan that gets STORED — because that composition is what a coach's import
// actually is, and its failures are silent: a class quietly missing from the
// corpus, or a plan filed under the wrong date.
describe("a real deck, end to end", () => {
  const slide = (n, text) => `--- Slide ${n} ---\n${text}`;
  const DECK = [
    slide(1, "THE GARAGE\nS360 PROGRAMMING\nWeek 4"),
    slide(2, '"Discipline is choosing between what you want now\nand what you want most."'),
    slide(3, "S360\n11 July 2026\nWarm Up\nWorld's Greatest Stretch 2x5\nM1 — Deadlift\n" +
             "Conventional Deadlift 4x5 @RPE8\nA1 Bench Press 3x8\nA2 Barbell Row 3x8\nFinisher\nAssault Bike 3x30s"),
    slide(4, "COACH DYLAN\nStrength & conditioning"),
    slide(5, "GC\n18 July 2026\nC1 Warm Up\nBand Pull Apart 2x15\nC2 AMRAP 12min\n" +
             "Wall Ball 15\nBox Jump 12\nC3 Finisher\nRow 500m"),
  ].join("\n");

  const imported = () => splitDeckSlides(DECK)
    .filter(s => looksLikeClassSlide(s.text))
    .map(s => ({ n: s.n, date: slideDate(s.text), ...parsePlanText(s.text) }));

  it("keeps both real classes and drops the title card and the bio", () => {
    expect(imported().map(p => p.n)).toEqual([3, 5]);
  });

  it("files each class under the date on its OWN slide, not the deck's", () => {
    expect(imported().map(p => p.date)).toEqual(["2026-07-11", "2026-07-18"]);
  });

  it("parses both without falling through to the LLM", () => {
    imported().forEach(p => expect(p.confidence).toBeGreaterThanOrEqual(PARSE_THRESHOLD));
  });

  // The catalog every persona claim is aggregated from. A movement here that the
  // coach never wrote on a movement line poisons that aggregation at the source —
  // which is exactly what the "M1 — Deadlift" block label used to do.
  it("stores only movements the coach actually wrote", () => {
    const names = imported().flatMap(p => p.plan.blocks.flatMap(b => b.exercises.map(e => e.name)));
    expect(names).toEqual([
      "World's Greatest Stretch", "Conventional Deadlift", "Bench Press", "Barbell Row", "Assault Bike",
      "Band Pull Apart", "Wall Ball", "Box Jump", "Row",
    ]);
    expect(names).not.toContain("Deadlift");   // the block label's focus suffix
    expect(names).not.toContain("Warm Up");    // the role word in "C1 Warm Up"
    expect(names).not.toContain("Finisher");
  });

  // GC writes "C1 / C2 / C3" as a SEQUENCE of stages; S360 writes "A1 / A2" as a
  // superset. Same shape to a naive letter rule, opposite meaning — folding GC's
  // three stages into one block destroys the class.
  it("keeps GC's C1/C2/C3 as separate stages while folding S360's A1+A2", () => {
    const [s360, gc] = imported();
    expect(s360.plan.blocks.map(b => b.label)).toEqual(["Warm Up", "M1", "A1+A2", "Finisher"]);
    expect(gc.plan.blocks.map(b => b.label)).toEqual(["C1", "C2", "C3"]);
  });
});
