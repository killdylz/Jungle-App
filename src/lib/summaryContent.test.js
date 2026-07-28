import { describe, it, expect } from "vitest";
import { summaryContent, summaryTotals, isPublishable,
         CONTENT_VERSION, MAX_STAGES, MAX_EXERCISES, MAX_TEXT } from "./summaryContent.js";

// A stage exactly as the runner holds one: seconds, an id, and music tracks.
const runnerStage = (over = {}) => ({
  id: "s-abc123",
  type: "circuit",
  name: "Circuit Blast",
  dur: 600,
  exercises: [{ n: "Burpee Complex", s: "3", r: "10", rest: "30s" }],
  tracks: [{ uri: "spotify:track:xyz", name: "Some Song" }],
  ...over,
});

describe("summaryContent — the allow-list", () => {
  it("publishes only the named fields, and drops the runner's own state", () => {
    const [stage] = summaryContent({ stages: [runnerStage()], sessionName: "Thursday Engine" }).stages;
    expect(Object.keys(stage).sort()).toEqual(["durMin", "exercises", "name", "type"]);
    // Named explicitly because both were PRESENT in the input — asserting the
    // absence of a key that was never there proves nothing (session 18, §0b#2).
    expect(stage).not.toHaveProperty("tracks");
    expect(stage).not.toHaveProperty("id");
    expect(Object.keys(stage.exercises[0]).sort()).toEqual(["n", "r", "rest", "s"]);
  });

  it("does not carry a field it has never heard of, even one that looks like member data", () => {
    // The failure this file exists to prevent: someone hangs attendance off a
    // stage, and it rides out to a link that gets pasted into a group chat.
    const doc = summaryContent({
      stages: [runnerStage({ checkedIn: ["Priya", "Sam"], memberNotes: "Sam's knee", coachPin: "080921" })],
      sessionName: "X",
    });
    const asText = JSON.stringify(doc);
    expect(asText).not.toContain("Priya");
    expect(asText).not.toContain("Sam");
    expect(asText).not.toContain("080921");
    expect(doc.stages[0]).not.toHaveProperty("checkedIn");
  });

  it("converts the runner's seconds into the minutes a member reads", () => {
    expect(summaryContent({ stages: [runnerStage({ dur: 600 })] }).stages[0].durMin).toBe(10);
    expect(summaryContent({ stages: [runnerStage({ dur: 300 })] }).stages[0].durMin).toBe(5);
    // Rounded, not floored: a 90-second finisher is "2 min", not "1 min".
    expect(summaryContent({ stages: [runnerStage({ dur: 90 })] }).stages[0].durMin).toBe(2);
  });

  it("omits a duration it does not have rather than publishing zero minutes", () => {
    for (const dur of [0, undefined, null, "", NaN, "abc"]) {
      expect(summaryContent({ stages: [runnerStage({ dur })] }).stages[0], String(dur)).not.toHaveProperty("durMin");
    }
  });

  it("stamps a version, so a future shape change is detectable rather than silent", () => {
    expect(summaryContent({ stages: [runnerStage()] }).v).toBe(CONTENT_VERSION);
  });
});

describe("summaryContent — what it refuses to publish", () => {
  it("drops movements with no name and stages with nothing in them", () => {
    const doc = summaryContent({
      stages: [
        runnerStage({ name: "", exercises: [{ n: "  " }, { n: "" }] }),   // nothing at all → gone
        runnerStage({ name: "Finisher", exercises: [{ n: "" }, { n: "Row" }] }),
      ],
    });
    expect(doc.stages).toHaveLength(1);
    expect(doc.stages[0].name).toBe("Finisher");
    expect(doc.stages[0].exercises).toEqual([{ n: "Row" }]);
  });

  it("keeps a named stage that has no movements yet", () => {
    const doc = summaryContent({ stages: [runnerStage({ name: "Cool-Down", exercises: [] })] });
    expect(doc.stages).toHaveLength(1);
    expect(doc.stages[0].exercises).toEqual([]);
  });

  it("omits empty sets/reps/rest instead of storing blanks", () => {
    const ex = summaryContent({ stages: [runnerStage({ exercises: [{ n: "Easy Walk", s: "", r: "5 min", rest: "" }] })] })
      .stages[0].exercises[0];
    expect(ex).toEqual({ n: "Easy Walk", r: "5 min" });
  });

  it("collapses whitespace and caps runaway text", () => {
    const doc = summaryContent({
      stages: [runnerStage({ name: "  Circuit   Blast \n", exercises: [{ n: "x".repeat(MAX_TEXT + 50) }] })],
      sessionName: "\t Thursday  Engine ",
    });
    expect(doc.title).toBe("Thursday Engine");
    expect(doc.stages[0].name).toBe("Circuit Blast");
    expect(doc.stages[0].exercises[0].n).toHaveLength(MAX_TEXT);
  });

  it("caps the stage count and says how many it dropped", () => {
    const doc = summaryContent({ stages: Array.from({ length: MAX_STAGES + 7 }, (_, i) => runnerStage({ name: `S${i}` })) });
    expect(doc.stages).toHaveLength(MAX_STAGES);
    expect(doc.more).toBe(7);
  });

  it("caps the movement count per stage and says how many it dropped", () => {
    const exercises = Array.from({ length: MAX_EXERCISES + 3 }, (_, i) => ({ n: `Move ${i}` }));
    const stage = summaryContent({ stages: [runnerStage({ exercises })] }).stages[0];
    expect(stage.exercises).toHaveLength(MAX_EXERCISES);
    expect(stage.more).toBe(3);
  });

  it("does not claim a truncation that did not happen", () => {
    const doc = summaryContent({ stages: [runnerStage()] });
    expect(doc).not.toHaveProperty("more");
    expect(doc.stages[0]).not.toHaveProperty("more");
  });

  it("never throws on a draft the Builder should not have produced", () => {
    for (const stages of [null, undefined, "nope", 7, [null], [{}], [{ exercises: "no" }]]) {
      expect(() => summaryContent({ stages }), JSON.stringify(stages)).not.toThrow();
    }
    expect(summaryContent().stages).toEqual([]);
    expect(summaryContent({}).title).toBe("Class");
  });

  it("titles an untitled class rather than publishing a blank headline", () => {
    for (const sessionName of ["", "   ", null, undefined]) {
      expect(summaryContent({ stages: [runnerStage()], sessionName }).title).toBe("Class");
    }
  });
});

describe("summaryTotals / isPublishable", () => {
  it("sums minutes and counts distinct movements across stages", () => {
    const doc = summaryContent({ stages: [
      runnerStage({ dur: 300, exercises: [{ n: "Row" }, { n: "Burpee" }] }),
      runnerStage({ dur: 600, exercises: [{ n: "row" }, { n: "Squat" }] }),   // "row" repeats
    ] });
    expect(summaryTotals(doc)).toEqual({ minutes: 15, stageCount: 2, movementCount: 3 });
  });

  it("reads zeroes off a document with nothing in it, without throwing", () => {
    expect(summaryTotals(summaryContent({}))).toEqual({ minutes: 0, stageCount: 0, movementCount: 0 });
    for (const junk of [null, undefined, {}, { stages: "no" }]) {
      expect(() => summaryTotals(junk), String(junk)).not.toThrow();
    }
  });

  it("refuses to publish a class with no movements, and allows one with any", () => {
    expect(isPublishable(summaryContent({ stages: [runnerStage({ name: "Empty", exercises: [] })] }))).toBe(false);
    expect(isPublishable(summaryContent({ stages: [runnerStage()] }))).toBe(true);
  });
});
