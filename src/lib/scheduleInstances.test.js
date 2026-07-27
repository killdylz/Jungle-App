import { describe, it, expect } from "vitest";
import { occurrencesForWeek, diffOccurrences, occurrenceKey, describePublish,
         parseDurationMin, parseSlot, startOfWeek, weekKeyOf, RULE_DAYS,
         isStartable, CLASS_WINDOW_MS } from "./scheduleInstances.js";

// The bridge between a RULE ("Tuesday 6pm, weekly") and an OCCURRENCE ("the
// Tuesday 6pm of 14 July"). Attendance hangs off the occurrence, so a duplicate
// splits one class's check-ins across two rows and a missing one loses them —
// both invisible until an owner asks why the numbers are wrong.

// Wednesday 15 July 2026, 10:00 local. Its Monday is the 13th.
const midWeek = () => new Date(2026, 6, 15, 10, 0, 0, 0);
const MONDAY = () => new Date(2026, 6, 13, 0, 0, 0, 0);

const rule = (over = {}) => ({
  id: "uc1", name: "Tuesday Burn", type: "HIIT", coach: "Dylan",
  day: "Tue", slot: "18:00", dur: "45m", repeat: "weekly", ...over,
});

// Local wall-clock reading of an ISO instant, so assertions survive the runner's
// timezone — the generator builds local times and serialises to UTC.
const localOf = iso => {
  const d = new Date(iso);
  return { day: RULE_DAYS[(d.getDay() + 6) % 7], date: d.getDate(), h: d.getHours(), m: d.getMinutes() };
};

describe("parseDurationMin", () => {
  it("reads the forms a coach actually types", () => {
    expect(parseDurationMin("45m")).toBe(45);
    expect(parseDurationMin("45 min")).toBe(45);
    expect(parseDurationMin("60 minutes")).toBe(60);
    expect(parseDurationMin("1h")).toBe(60);
    expect(parseDurationMin("1h15m")).toBe(75);
    expect(parseDurationMin("2 hrs")).toBe(120);
    expect(parseDurationMin("90")).toBe(90);
    expect(parseDurationMin("45M")).toBe(45);
  });

  // A wrong duration would mis-state a class's length on a permanent record.
  it("returns null rather than guessing at something it cannot read", () => {
    for (const bad of ["", null, undefined, "about an hour", "abc", "-30", "45mins-ish"]) {
      expect(parseDurationMin(bad)).toBeNull();
    }
  });
});

describe("parseSlot", () => {
  it("reads a time of day", () => {
    expect(parseSlot("06:00")).toEqual({ h: 6, m: 0 });
    expect(parseSlot("19:30")).toEqual({ h: 19, m: 30 });
    expect(parseSlot("6:05")).toEqual({ h: 6, m: 5 });
  });

  it("rejects an impossible or unreadable time", () => {
    for (const bad of ["25:00", "12:60", "600", "6pm", "", null, "18:0"]) {
      expect(parseSlot(bad)).toBeNull();
    }
  });
});

describe("startOfWeek / weekKeyOf", () => {
  it("finds the Monday of the week containing a date", () => {
    expect(startOfWeek(midWeek()).getDate()).toBe(13);
    expect(startOfWeek(new Date(2026, 6, 13, 23, 59)).getDate()).toBe(13);   // Monday itself
  });

  // Monday-first: Sunday belongs to the week that STARTED, not the one about to.
  it("puts Sunday at the end of its week, not the start of the next", () => {
    expect(startOfWeek(new Date(2026, 6, 19)).getDate()).toBe(13);           // Sun 19 → Mon 13
  });

  it("clears the time so two dates in one week key identically", () => {
    expect(weekKeyOf(startOfWeek(midWeek()))).toBe(weekKeyOf(startOfWeek(new Date(2026, 6, 17, 22))));
  });

  // Reproduces CalendarScreen's own format exactly — unpadded, month INDEX, not
  // ISO. Tidying it here would stop matching every one-off already saved.
  it("uses the grid's own unpadded month-index key", () => {
    expect(weekKeyOf(MONDAY())).toBe("2026-6-13");
  });
});

describe("occurrencesForWeek — recurrence", () => {
  it("places a weekly rule on its own day, at its own time", () => {
    const [o] = occurrencesForWeek([rule()], midWeek());
    expect(localOf(o.startsAt)).toEqual({ day: "Tue", date: 14, h: 18, m: 0 });
    expect(o).toMatchObject({ ruleId: "uc1", name: "Tuesday Burn", classType: "HIIT", coachName: "Dylan", durationMin: 45 });
  });

  // Seven, not six. The default was Mon–Sat to match a grid that had no Sunday
  // column, which meant a gym running Sunday classes silently published none.
  it("places a daily rule on every day of the week, Sunday included", () => {
    const out = occurrencesForWeek([rule({ repeat: "daily", slot: "06:00" })], midWeek());
    expect(out).toHaveLength(7);
    expect(out.map(o => localOf(o.startsAt).day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  // Sunday belongs to the week that STARTED on Monday, not the one about to
  // begin — the same rule `startOfWeek` applies. A Sunday rule landing seven days
  // early would publish a class into a week the coach was not looking at.
  it("dates a Sunday rule to the end of its own week", () => {
    const [o] = occurrencesForWeek([rule({ day: "Sun", slot: "09:00" })], midWeek());
    expect(localOf(o.startsAt)).toEqual({ day: "Sun", date: 19, h: 9, m: 0 });
  });

  it("does not invent a class on a day the gym does not run", () => {
    const out = occurrencesForWeek([rule({ repeat: "daily" })], midWeek(), { days: ["Mon", "Wed", "Fri"] });
    expect(out.map(o => localOf(o.startsAt).day)).toEqual(["Mon", "Wed", "Fri"]);
  });

  it("places a one-off only in its own week", () => {
    const once = rule({ repeat: "once", weekKey: weekKeyOf(MONDAY()) });
    expect(occurrencesForWeek([once], midWeek())).toHaveLength(1);
    // The following week: gone, not repeated.
    expect(occurrencesForWeek([once], new Date(2026, 6, 22))).toHaveLength(0);
  });

  it("treats an unknown repeat as weekly rather than dropping the class", () => {
    expect(occurrencesForWeek([rule({ repeat: "fortnightly" })], midWeek())).toHaveLength(1);
  });

  it("returns the same occurrences from any day inside the week", () => {
    const from = d => occurrencesForWeek([rule({ repeat: "daily" })], d).map(o => o.startsAt);
    expect(from(new Date(2026, 6, 13))).toEqual(from(new Date(2026, 6, 19, 23, 30)));
  });
});

describe("occurrencesForWeek — refusing to guess", () => {
  it("skips a rule with no name", () => {
    expect(occurrencesForWeek([rule({ name: "" }), rule({ name: null })], midWeek())).toHaveLength(0);
  });

  it("skips a rule whose time cannot be read, and keeps the others", () => {
    const out = occurrencesForWeek([rule({ slot: "6pm" }), rule({ id: "uc2", name: "Ok", slot: "07:00" })], midWeek());
    expect(out.map(o => o.name)).toEqual(["Ok"]);
  });

  it("skips a rule for a day that is not a day", () => {
    expect(occurrencesForWeek([rule({ day: "Funday" })], midWeek())).toHaveLength(0);
  });

  it("carries a null duration through rather than inventing 45 minutes", () => {
    expect(occurrencesForWeek([rule({ dur: "" })], midWeek())[0].durationMin).toBeNull();
    expect(occurrencesForWeek([rule({ dur: "about an hour" })], midWeek())[0].durationMin).toBeNull();
  });

  it("survives junk in the list", () => {
    expect(() => occurrencesForWeek([null, undefined, {}, rule()], midWeek())).not.toThrow();
    expect(occurrencesForWeek([null, {}, rule()], midWeek())).toHaveLength(1);
  });

  it("returns nothing for an empty or missing schedule", () => {
    expect(occurrencesForWeek([], midWeek())).toEqual([]);
    expect(occurrencesForWeek(null, midWeek())).toEqual([]);
  });
});

describe("occurrencesForWeek — ordering", () => {
  it("sorts the week by time, so the list reads like the week", () => {
    const out = occurrencesForWeek([
      rule({ id: "a", name: "Late",  day: "Fri", slot: "19:30" }),
      rule({ id: "b", name: "Early", day: "Mon", slot: "06:00" }),
      rule({ id: "c", name: "Mid",   day: "Wed", slot: "12:00" }),
    ], midWeek());
    expect(out.map(o => o.name)).toEqual(["Early", "Mid", "Late"]);
  });

  it("breaks a same-instant tie by name, so the output is deterministic", () => {
    const out = occurrencesForWeek([
      rule({ id: "a", name: "Studio B" }),
      rule({ id: "b", name: "Studio A" }),
    ], midWeek());
    expect(out.map(o => o.name)).toEqual(["Studio A", "Studio B"]);
  });
});

describe("diffOccurrences — publishing twice must not duplicate a week", () => {
  const week = () => occurrencesForWeek([rule(), rule({ id: "uc2", name: "Morning", day: "Mon", slot: "06:00" })], midWeek());

  it("creates everything against an empty book", () => {
    const { create, already } = diffOccurrences(week(), []);
    expect(create).toHaveLength(2);
    expect(already).toHaveLength(0);
  });

  // The one that matters. Attendance hangs off the occurrence, so a duplicate
  // splits one class's check-ins across two rows.
  it("creates nothing the second time", () => {
    const existing = week();
    const { create, already } = diffOccurrences(week(), existing);
    expect(create).toHaveLength(0);
    expect(already).toHaveLength(2);
  });

  it("creates only what is new when a class is added to a published week", () => {
    const existing = week().slice(0, 1);
    const { create, already } = diffOccurrences(week(), existing);
    expect(create).toHaveLength(1);
    expect(already).toHaveLength(1);
  });

  // Two rules can collide onto one slot — a "daily" and a "weekly" at the same
  // name and time. One press must not insert the same occurrence twice.
  it("collapses two rules that land on the same class at the same moment", () => {
    const collide = occurrencesForWeek([
      rule({ id: "a" }),
      rule({ id: "b", repeat: "daily" }),
    ], midWeek());
    const { create } = diffOccurrences(collide, []);
    const keys = create.map(occurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches an existing occurrence whose name differs only in case or spacing", () => {
    const { create } = diffOccurrences(week(), [{ name: "  tuesday burn ", startsAt: week()[1].startsAt }]);
    expect(create.map(o => o.name)).toEqual(["Morning"]);
  });

  // Two studios genuinely can run at the same minute; they differ by name.
  it("does not collapse two different classes that start at the same moment", () => {
    const two = occurrencesForWeek([rule({ id: "a", name: "Studio A" }), rule({ id: "b", name: "Studio B" })], midWeek());
    expect(diffOccurrences(two, []).create).toHaveLength(2);
  });

  it("survives a missing existing list", () => {
    expect(diffOccurrences(week()).create).toHaveLength(2);
    expect(diffOccurrences(null, []).create).toEqual([]);
  });
});

describe("describePublish — what the coach reads afterwards", () => {
  it("says nothing was scheduled when the grid is empty", () => {
    expect(describePublish({ created: 0, already: 0 })).toMatch(/no classes on this week's schedule/i);
    expect(describePublish()).toMatch(/no classes/i);
  });

  it("reports a first publish", () => {
    expect(describePublish({ created: 6, already: 0 })).toBe("Added 6 classes to the books.");
    expect(describePublish({ created: 1, already: 0 })).toBe("Added 1 class to the books.");
  });

  // The case that happens most: pressing it again.
  it("says so plainly when nothing was left to do", () => {
    expect(describePublish({ created: 0, already: 6 })).toMatch(/already on the books — all 6 classes/);
    expect(describePublish({ created: 0, already: 1 })).toMatch(/all 1 class\b/);
  });

  it("reports a partial publish honestly", () => {
    expect(describePublish({ created: 2, already: 4 })).toBe("Added 2 classes to the books. 4 were already there.");
    expect(describePublish({ created: 1, already: 1 })).toBe("Added 1 class to the books. 1 was already there.");
  });
});

// ── §3A: which cell the Schedule may offer a Start button on ─────────────────
// The grid shows a whole week. A Start button on next Thursday's class would
// date real attendance to a class that has not happened, so the affordance is
// bounded by the SAME window the Runner joins on — if it were wider, pressing it
// would mint a second occurrence for a class already published, which is the
// split the window exists to prevent.
describe("isStartable", () => {
  const at = (ms) => ({ startsAt: new Date(ms).toISOString() });
  const NOW = new Date(2026, 6, 14, 18, 0, 0, 0).getTime();

  it("offers the class running right now", () => {
    expect(isStartable(at(NOW), NOW)).toBe(true);
  });

  it("still offers it a few minutes either side of the slot", () => {
    expect(isStartable(at(NOW - 10 * 60_000), NOW)).toBe(true);
    expect(isStartable(at(NOW + 10 * 60_000), NOW)).toBe(true);
  });

  it("refuses a class the wrong side of the join window", () => {
    expect(isStartable(at(NOW - 5 * 60 * 60_000), NOW)).toBe(false);
    expect(isStartable(at(NOW + 5 * 60 * 60_000), NOW)).toBe(false);
  });

  // The boundary is the join window itself, not a number that happens to match.
  it("uses exactly the window the Runner joins on", () => {
    expect(isStartable(at(NOW + CLASS_WINDOW_MS - 1000), NOW)).toBe(true);
    expect(isStartable(at(NOW + CLASS_WINDOW_MS), NOW)).toBe(false);
  });

  // An unreadable date must not read as the epoch — `new Date(0)` is a real
  // instant, and treating a missing one as startable-in-1970 is the kind of quiet
  // nonsense that only shows up in a test.
  it("refuses rather than guessing at an unreadable date", () => {
    for (const bad of [null, undefined, {}, { startsAt: "" }, { startsAt: "soon" }, { startsAt: 0 }]) {
      expect(isStartable(bad, NOW)).toBe(false);
    }
  });
});

// The Schedule has to find the occurrence behind a grid cell. It could re-derive
// day and slot from `startsAt`, but two derivations of one fact is how a cell and
// its occurrence come to disagree — so the generator carries them.
describe("occurrencesForWeek — locating the cell an occurrence came from", () => {
  it("carries the day and slot the rule was drawn on", () => {
    const [o] = occurrencesForWeek([rule()], midWeek());
    expect(o).toMatchObject({ day: "Tue", slot: "18:00" });
  });

  it("gives a daily rule the day of each occurrence, not the rule's own", () => {
    const out = occurrencesForWeek([rule({ repeat: "daily", day: "Mon", slot: "12:00" })], midWeek());
    expect(out.map(o => o.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(new Set(out.map(o => o.slot))).toEqual(new Set(["12:00"]));
  });

  // The grid keys its cells on the rule's raw slot string, so this must be that
  // string and not a tidied version of it, or the lookup silently misses.
  it("reports the slot exactly as the rule stores it", () => {
    expect(occurrencesForWeek([rule({ slot: "6:05" })], midWeek())[0].slot).toBe("6:05");
  });
});
