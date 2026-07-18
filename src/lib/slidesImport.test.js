// Slides-import pure logic. These functions decide what reaches the extractor and
// how a deck maps back to plans — get one wrong and the failure is SILENT: a coach's
// class is quietly missing from the corpus, or a plan lands under the wrong date.
// No amount of clicking through the UI surfaces that, which is why they're tested.
import { describe, it, expect } from "vitest";
import { parseDriveId, splitDeckSlides, slideDate, looksLikeClassSlide } from "./slidesImport.js";

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
