// The "no jargon reaches a coach" rule (U1, UI-UX-DIRECTION §4), as a test
// rather than a habit.
//
// These label maps lived inside App.jsx's 8,500 lines, where the only check was
// someone noticing. `sets_reps` rendered raw on the profile card and on every
// movement row for an entire session before anyone did. A missing mapping is a
// silent defect: nothing throws, the screen just shows a database value.
import { describe, it, expect, vi } from "vitest";
import {
  ROLE_LABEL, MOVEMENT_CATEGORY_LABEL, CLASS_CATEGORY_LABEL, SOURCE_LABEL, KIND_LABEL,
  SCHEME_LABEL, schemeTypeLabel, READ_ERRORS, GENERIC_READ_ERROR, readErrorMessage,
} from "./labels.js";
import { CATEGORIES } from "../lib/movementTaxonomy.js";

// The exact vocabulary the audit bans from any coach-facing string. "block" is
// matched on a word boundary so "Blocked" or a stray substring does not trip it.
const BANNED = [
  /\bparser\b/i, /\bJSON\b/, /\bcorpus\b/i, /\bextract(ion|ed|ing)?\b/i,
  /\bEdge Function\b/i, /\bSupabase\b/i, /persona-ai/i, /\bblocks?\b/i,
  /non-2xx/i, /\bpersona\b/i, /\d+%/,
];
const leaks = (s) => BANNED.filter((re) => re.test(s)).map(String);

describe("label maps cover every value the app can store", () => {
  // The taxonomy pins its legal categories in ONE place precisely so a new one
  // cannot be added without the UI noticing. This is the UI noticing.
  it("labels every movement category in CATEGORIES", () => {
    CATEGORIES.forEach((c) => {
      expect(MOVEMENT_CATEGORY_LABEL[c], `no label for movement category '${c}'`).toBeTruthy();
    });
  });

  it("labels every block role the plan schema uses", () => {
    ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"]
      .forEach((r) => expect(ROLE_LABEL[r], `no label for role '${r}'`).toBeTruthy());
  });

  it("labels every persona_plans.source the CHECK constraint allows", () => {
    ["google_slides", "manual", "jungle"]
      .forEach((s) => expect(SOURCE_LABEL[s], `no label for source '${s}'`).toBeTruthy());
  });

  it("labels every class category classCategory can return", () => {
    ["strength", "conditioning", "endurance", "mixed"]
      .forEach((c) => expect(CLASS_CATEGORY_LABEL[c], `no label for class category '${c}'`).toBeTruthy());
  });

  it("labels every coach kind the add form can create", () => {
    ["coach", "house", "format"]
      .forEach((k) => expect(KIND_LABEL[k], `no label for kind '${k}'`).toBeTruthy());
  });

  it("labels every scheme type the plan editor offers", () => {
    // Mirrors the editor's <option> list — if that list grows, this fails.
    ["sets_reps", "rounds", "time", "interval", "amrap"]
      .forEach((t) => expect(SCHEME_LABEL[t], `no label for scheme '${t}'`).toBeTruthy());
  });
});

describe("no label reads like a database value", () => {
  it("never shows a raw snake_case key", () => {
    const all = [ROLE_LABEL, MOVEMENT_CATEGORY_LABEL, CLASS_CATEGORY_LABEL, SOURCE_LABEL, KIND_LABEL, SCHEME_LABEL]
      .flatMap((m) => Object.values(m));
    all.forEach((label) => expect(label, `'${label}' still looks like a key`).not.toMatch(/_/));
  });

  it("de-underscores an unknown scheme rather than dropping it", () => {
    // A chip that reads oddly gets reported; a chip that silently vanishes does
    // not, and the coach never learns the class was misread.
    expect(schemeTypeLabel("death_by")).toBe("death by");
    expect(schemeTypeLabel("sets_reps")).toBe("Sets × reps");
    expect(schemeTypeLabel("")).toBe("");
    expect(schemeTypeLabel(null)).toBe("");
    expect(schemeTypeLabel(undefined)).toBe("");
  });
});

describe("errors say what to do, not what broke", () => {
  it("leaks none of the banned vocabulary", () => {
    [...Object.values(READ_ERRORS), GENERIC_READ_ERROR].forEach((msg) => {
      expect(leaks(msg), `"${msg}" leaks ${leaks(msg).join(", ")}`).toEqual([]);
    });
  });

  it("gives the coach an action in every message", () => {
    [...Object.values(READ_ERRORS), GENERIC_READ_ERROR].forEach((msg) => {
      expect(msg, `"${msg}" tells the coach nothing to do`)
        .toMatch(/try again|add the exercises|paste|check/i);
    });
  });

  it("maps a sentinel throw to its instruction", () => {
    expect(readErrorMessage(new Error("PARTIAL_READ"))).toBe(READ_ERRORS.PARTIAL_READ);
    expect(readErrorMessage(new Error("NO_EXERCISES"))).toBe(READ_ERRORS.NO_EXERCISES);
  });

  it("never passes a raw exception through to the screen", () => {
    // This is the exact string Supabase produced, verbatim, on a coach's screen.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = "Edge Function returned a non-2xx status code";
    const shown = readErrorMessage(new Error(raw));
    expect(shown).toBe(GENERIC_READ_ERROR);
    expect(leaks(shown)).toEqual([]);
    // ...but it must still reach US, or the next bug report has nothing behind it.
    expect(warn).toHaveBeenCalledWith("[read] unmapped failure:", raw);
    warn.mockRestore();
  });

  it("handles a thrown non-Error without crashing the screen it is reporting on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readErrorMessage(undefined)).toBe(GENERIC_READ_ERROR);
    expect(readErrorMessage("boom")).toBe(GENERIC_READ_ERROR);
    expect(readErrorMessage({ nope: 1 })).toBe(GENERIC_READ_ERROR);
    warn.mockRestore();
  });
});
