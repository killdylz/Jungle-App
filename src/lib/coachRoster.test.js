import { describe, it, expect } from "vitest";
import { coachKey, coachKeys, makeCoach, resolveCoach,
         coachNamesOnSchedule, coachReach, rosterCoverage,
         normaliseAvailability, availabilityState, claimsFree, coachesFreeAt,
         COACH_AVAIL_STALE_DAYS } from "./coachRoster.js";

// A roster entry as the store mints it, minus the id ceremony.
const coach = (name, extra = {}) => ({ ...makeCoach(name, extra), id: extra.id || name });

describe("coachKey — folds only what is objectively the same string", () => {
  it("folds case, because a phone with autocapitalise off is not a second coach", () => {
    expect(coachKey("Mara")).toBe(coachKey("mara"));
    expect(coachKey("MARA")).toBe(coachKey("Mara"));
  });

  it("folds surrounding and repeated whitespace", () => {
    expect(coachKey("  Mara  K.  ")).toBe("mara k.");
    expect(coachKey("Mara\tK.")).toBe("mara k.");
  });

  it("folds Unicode composition, which is invisible on screen", () => {
    // "José" composed (U+00E9) vs decomposed (e + U+0301). Identical rendered,
    // different bytes — the split a roster would never be able to explain.
    const composed   = "Jos\u00E9";        // e-acute as ONE code point
    const decomposed = "Jose\u0301";        // "e" + combining acute
    expect(composed).not.toBe(decomposed);          // positive control: really different
    expect(composed.length).toBe(4);
    expect(decomposed.length).toBe(5);
    expect(coachKey(composed)).toBe(coachKey(decomposed));
  });

  it("🔴 does NOT merge different names — that is a judgement it has no standing to make", () => {
    expect(coachKey("Mara")).not.toBe(coachKey("Mara K."));
    expect(coachKey("Dev")).not.toBe(coachKey("Dev R."));
  });

  it("treats null/undefined/blank as no name at all", () => {
    expect(coachKey(null)).toBe("");
    expect(coachKey(undefined)).toBe("");
    expect(coachKey("   ")).toBe("");
  });
});

describe("coachKeys — an entry answers to its name and its aliases", () => {
  it("includes aliases, so a gym can say Mara K. IS Mara", () => {
    const e = coach("Mara", { aliases: ["Mara K.", "mara k"] });
    expect(coachKeys(e)).toEqual(["mara", "mara k.", "mara k"]);
  });

  it("🔴 drops a blank alias, which would otherwise claim every coachless class", () => {
    const e = coach("Mara", { aliases: ["", "   "] });
    expect(coachKeys(e)).toEqual(["mara"]);
    expect(resolveCoach([e], "")).toBeNull();
    expect(resolveCoach([e], "   ")).toBeNull();
  });

  it("de-duplicates an alias that only differs by case", () => {
    expect(coachKeys(coach("Mara", { aliases: ["MARA"] }))).toEqual(["mara"]);
  });
});

describe("resolveCoach", () => {
  const roster = [coach("Mara", { aliases: ["Mara K."] }), coach("Dev")];

  it("resolves an exact and a case-folded name", () => {
    expect(resolveCoach(roster, "Mara").name).toBe("Mara");
    expect(resolveCoach(roster, "  mara ").name).toBe("Mara");
  });

  it("resolves through an alias", () => {
    expect(resolveCoach(roster, "Mara K.").name).toBe("Mara");
  });

  it("returns null for an unknown name — a supported state, not an error", () => {
    expect(resolveCoach(roster, "Priya")).toBeNull();
  });

  it("survives an empty or absent roster", () => {
    expect(resolveCoach([], "Mara")).toBeNull();
    expect(resolveCoach(undefined, "Mara")).toBeNull();
  });
});

describe("coachNamesOnSchedule — the roster's input is the gym's own schedule", () => {
  it("counts per person, not per spelling, and keeps the spellings", () => {
    const out = coachNamesOnSchedule([
      { coach: "Mara" }, { coach: "mara" }, { coach: "Mara" }, { coach: "Dev" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Mara", count: 3 });
    expect(out[0].spellings).toEqual(["Mara", "mara"]);
    expect(out[1]).toMatchObject({ name: "Dev", count: 1 });
  });

  it("ignores rules with no coach typed at all", () => {
    expect(coachNamesOnSchedule([{ coach: "" }, { coach: "  " }, {}, { coach: null }])).toEqual([]);
  });

  it("orders by how much of the schedule a name actually carries", () => {
    const out = coachNamesOnSchedule([{ coach: "A" }, { coach: "B" }, { coach: "B" }]);
    expect(out.map(n => n.name)).toEqual(["B", "A"]);
  });
});

describe("🔴 coachReach — three states, because two would let the UI lie", () => {
  it("a name no entry answers to is unknown", () => {
    expect(coachReach(null)).toBe("unknown");
  });

  it("a roster entry with no account is known but UNREACHABLE", () => {
    expect(coachReach(coach("Mara"))).toBe("roster");
  });

  it("only an account-linked entry could ever receive anything", () => {
    expect(coachReach(coach("Mara", { userId: "u1" }))).toBe("account");
  });
});

describe("rosterCoverage", () => {
  const classes = [{ coach: "Mara" }, { coach: "mara" }, { coach: "Dev" }, { coach: "Priya" }];

  it("splits the schedule's names into known and unknown, and counts accounts", () => {
    const roster = [coach("Mara", { userId: "u1" }), coach("Dev")];
    const cov = rosterCoverage(roster, classes);
    expect(cov.known.map(k => k.name)).toEqual(["Mara", "Dev"]);
    expect(cov.unknown.map(u => u.name)).toEqual(["Priya"]);
    expect(cov.accounts).toBe(1);
    expect(cov.known.find(k => k.name === "Mara").reach).toBe("account");
    expect(cov.known.find(k => k.name === "Dev").reach).toBe("roster");
  });

  it("an empty roster makes every typed name unknown, and that is not an error", () => {
    const cov = rosterCoverage([], classes);
    expect(cov.known).toEqual([]);
    expect(cov.unknown.map(u => u.name)).toEqual(["Mara", "Dev", "Priya"]);
    expect(cov.accounts).toBe(0);
  });

  it("an empty schedule has nothing to cover", () => {
    expect(rosterCoverage([coach("Mara")], [])).toEqual({ known: [], unknown: [], accounts: 0 });
  });
});

// ─── Availability ────────────────────────────────────────────────────────────

describe("normaliseAvailability", () => {
  it("keeps real days and real slots, sorted by time of day", () => {
    expect(normaliseAvailability({ Mon: ["18:00", "06:00"], Wed: ["09:00"] }))
      .toEqual({ Mon: ["06:00", "18:00"], Wed: ["09:00"] });
  });

  it("drops a day that is not a day and a slot that is not a time", () => {
    expect(normaliseAvailability({ Mon: ["06:00", "25:00", "6pm", ""], Funday: ["06:00"] }))
      .toEqual({ Mon: ["06:00"] });
  });

  it("drops a day left empty, so {} means the same thing however it was reached", () => {
    expect(normaliseAvailability({ Mon: [], Tue: ["nope"] })).toEqual({});
  });

  it("de-duplicates a slot listed twice", () => {
    expect(normaliseAvailability({ Mon: ["06:00", "06:00"] })).toEqual({ Mon: ["06:00"] });
  });

  it("survives junk without throwing", () => {
    expect(normaliseAvailability(null)).toEqual({});
    expect(normaliseAvailability({ Mon: "06:00" })).toEqual({});
  });
});

describe("🔴 availabilityState — never-stated is not the same answer as stated-nothing", () => {
  // A fixed clock. ⚠️ Dates are parsed as LOCAL midnight, so every expectation
  // here is in calendar days and holds in any timezone the suite runs in.
  const now = Date.parse("2026-08-24T09:00:00");

  it("an entry that has never stated availability says so", () => {
    expect(availabilityState(coach("Mara"), now)).toEqual({ state: "never", at: "", days: null });
  });

  it("an entry that stated NOTHING today is fresh, not never", () => {
    const e = coach("Mara", { availability: {}, availabilityAt: "2026-08-24" });
    expect(availabilityState(e, now)).toMatchObject({ state: "fresh", at: "2026-08-24", days: 0 });
  });

  it("is fresh right up to the threshold", () => {
    const e = coach("Mara", { availabilityAt: "2026-06-29" }); // 56 days before
    const s = availabilityState(e, now);
    expect(s.days).toBe(COACH_AVAIL_STALE_DAYS);
    expect(s.state).toBe("fresh");
  });

  it("is stale one day past it", () => {
    const e = coach("Mara", { availabilityAt: "2026-06-28" }); // 57 days before
    const s = availabilityState(e, now);
    expect(s.days).toBe(COACH_AVAIL_STALE_DAYS + 1);
    expect(s.state).toBe("stale");
  });

  it("the March-coach-who-left case reads as stale, with its date", () => {
    const s = availabilityState(coach("Mara", { availabilityAt: "2026-03-02" }), now);
    expect(s.state).toBe("stale");
    expect(s.at).toBe("2026-03-02");
    expect(s.days).toBeGreaterThan(170);
  });

  it("an unparseable date is treated as never stated, not as ancient", () => {
    expect(availabilityState(coach("M", { availabilityAt: "soon" }), now).state).toBe("never");
  });
});

describe("coachesFreeAt", () => {
  const now = Date.parse("2026-08-24T09:00:00");
  const today = "2026-08-24";
  const long  = "2026-01-05";

  const mara  = coach("Mara",  { availability: { Mon: ["06:00", "18:00"] }, availabilityAt: today, userId: "u1" });
  const dev   = coach("Dev",   { availability: { Mon: ["06:00"] },          availabilityAt: long });
  const priya = coach("Priya", { availability: { Tue: ["06:00"] },          availabilityAt: today });
  const gone  = coach("Gone",  { availability: { Mon: ["06:00"] },          availabilityAt: today, active: false });
  const roster = [dev, mara, priya, gone];

  it("offers only coaches who claim that exact day and slot", () => {
    const out = coachesFreeAt(roster, { day: "Mon", slot: "06:00" }, now);
    expect(out.map(o => o.coach.name)).toEqual(["Mara", "Dev"]);   // fresh first
  });

  it("does not offer a slot the coach did not claim", () => {
    expect(coachesFreeAt(roster, { day: "Mon", slot: "09:00" }, now)).toEqual([]);
    expect(coachesFreeAt(roster, { day: "Sun", slot: "06:00" }, now)).toEqual([]);
  });

  it("🔴 excludes a coach the gym marked inactive — that is employment, not staleness", () => {
    expect(coachesFreeAt(roster, { day: "Mon", slot: "06:00" }, now).map(o => o.coach.name))
      .not.toContain("Gone");
  });

  it("🔴 keeps a stale claim but never calls it available — it is labelled and ranked below", () => {
    const out = coachesFreeAt(roster, { day: "Mon", slot: "06:00" }, now);
    const devRow = out.find(o => o.coach.name === "Dev");
    expect(devRow.state).toBe("stale");
    expect(devRow.at).toBe(long);
    expect(out[out.length - 1].coach.name).toBe("Dev");
  });

  it("reports reach, so the caller can say who could actually be told", () => {
    const out = coachesFreeAt(roster, { day: "Mon", slot: "06:00" }, now);
    expect(out.find(o => o.coach.name === "Mara").reach).toBe("account");
    expect(out.find(o => o.coach.name === "Dev").reach).toBe("roster");
  });

  it("needs both a day and a slot to answer at all", () => {
    expect(coachesFreeAt(roster, { day: "Mon" }, now)).toEqual([]);
    expect(coachesFreeAt(roster, {}, now)).toEqual([]);
    expect(coachesFreeAt(roster, undefined, now)).toEqual([]);
  });
});
