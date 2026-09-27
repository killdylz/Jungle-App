import { describe, it, expect } from "vitest";
import { classesWithCheckIns } from "./classesRun.js";

describe("CLASSES RUN counts classes that happened, not classes that were published", () => {
  const classes = [
    { id: "ci1", startsAt: "2026-07-20T06:00:00Z" },   // taught, two check-ins
    { id: "ci2", startsAt: "2026-07-21T18:00:00Z" },   // published, time passed, nobody came
    { id: "ci3", startsAt: "2026-07-22T18:00:00Z" },   // a re-slot's old occurrence
    { id: "ci4", startsAt: "2026-07-23T12:00:00Z" },   // taught, one check-in
  ];
  const attendance = [
    { id: "a1", classInstanceId: "ci1", memberId: "m1" },
    { id: "a2", classInstanceId: "ci1", memberId: "m2" },
    { id: "a3", classInstanceId: "ci4", memberId: "m1" },
    { id: "a4", classInstanceId: "gone", memberId: "m3" },  // points at nothing we hold
  ];

  it("counts each class with a check-in once, and nothing else", () => {
    expect(classesWithCheckIns(classes, attendance)).toBe(2);
  });

  it("a gym that published a week and taught nothing has run nothing", () => {
    expect(classesWithCheckIns(classes, [])).toBe(0);
  });

  it("survives the shapes storage can hand it", () => {
    expect(classesWithCheckIns(undefined, undefined)).toBe(0);
    expect(classesWithCheckIns([null, { id: "ci1" }], [null, { classInstanceId: "ci1" }])).toBe(1);
  });
});
