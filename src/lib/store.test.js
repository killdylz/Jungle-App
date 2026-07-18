// persona_plans.source normalization.
//
// This guards a real data-loss bug: migration 0005 constrains the column to
// ('google_slides','manual','jungle'), but the client wrote "slides" for Slides
// imports and "extract" for pasted decks. Because the whole plan list is upserted
// in ONE call, a single bad value failed EVERY plan's sync — and hydratePersonas
// is server-wins, so the next visit to the Personas screen overwrote localStorage
// with a server list that had never received them. The coach's imported corpus
// disappeared with nothing but a console warning.
//
// The values below are not arbitrary strings: they are the exact contents of the
// CHECK constraint. If someone widens or changes it, this test must change with it.
import { describe, it, expect } from "vitest";
import { planSource } from "./store.js";

const ALLOWED = ["google_slides", "manual", "jungle"];

describe("planSource", () => {
  it("passes through every value the CHECK constraint allows", () => {
    ALLOWED.forEach(s => expect(planSource(s)).toBe(s));
  });

  it("maps the legacy values that caused the outage", () => {
    expect(planSource("slides")).toBe("google_slides");   // Google Slides importer
    expect(planSource("extract")).toBe("manual");         // Paste-deck-text path
  });

  it("falls back to a legal value for anything unrecognised", () => {
    // The point is that NOTHING can ever reach the column that the constraint
    // would reject — an unknown source must degrade, never poison the batch.
    expect(planSource("")).toBe("manual");
    expect(planSource(null)).toBe("manual");
    expect(planSource(undefined)).toBe("manual");
    expect(planSource("   ")).toBe("manual");
    expect(planSource("something-nobody-has-written-yet")).toBe("manual");
  });

  it("only ever returns a constraint-legal value", () => {
    const inputs = ["slides", "extract", "", null, undefined, "  ", "jungle", "GOOGLE_SLIDES", 42, {}];
    inputs.forEach(i => expect(ALLOWED).toContain(planSource(i)));
  });
});
