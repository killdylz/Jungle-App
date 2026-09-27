import { describe, it, expect } from "vitest";
import { buildFloorLayout, floorStationCount, FLOOR_MAX } from "./FloorLiveScreen.jsx";

// The Floor board faces the room, so what it says is read by every member at
// once. It draws at most FLOOR_MAX stations; a class can have more (the Builder's
// "Add stage" has no ceiling). Session 41 found a six-stage class drawn with
// FINISH on its fifth card and "5 stations" under it.
const stage = (i) => ({ id: `s${i}`, name: `Stage ${i + 1}`, type: "circuit", exercises: [{ n: `Move ${i + 1}` }] });

describe("the Floor board never claims a class is smaller than it is", () => {
  it("FINISH marks the class's LAST stage, not the last card drawn", () => {
    const six = buildFloorLayout(Array.from({ length: 6 }, (_, i) => stage(i)));
    expect(six).toHaveLength(FLOOR_MAX);
    expect(six.filter((st) => st.isFinish), "no card on a six-stage class is its finish").toEqual([]);

    // Positive control: a class that fits still gets its finish station.
    const five = buildFloorLayout(Array.from({ length: 5 }, (_, i) => stage(i)));
    expect(five.map((st) => st.isFinish)).toEqual([false, false, false, false, true]);
  });

  it("the count says when the board is showing part of the class", () => {
    expect(floorStationCount(5, 5)).toBe("5 stations");
    expect(floorStationCount(3, 3)).toBe("3 stations");
    expect(floorStationCount(5, 6)).toBe("showing 5 of 6 stages");
  });
});
