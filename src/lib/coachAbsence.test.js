import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { occurrenceDate, isDateStr, daysInclusive, absenceError, makeAbsence,
         coversDate, occurrencesInRange, classesAffectedBy, absencesFor,
         isAwayOn, MAX_ABSENCE_DAYS } from "./coachAbsence.js";

// Monday 2026-08-24 is the week these fixtures live in.
const RULES = [
  { id: "uc1", name: "Strength Lab", type: "hyrox", coach: "Mara",   day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
  { id: "uc2", name: "Engine Room",  type: "hyrox", coach: "mara",   day: "Wed", slot: "18:00", dur: "45m", repeat: "weekly" },
  { id: "uc3", name: "Barbell Club", type: "hyrox", coach: "Dev",    day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
  { id: "uc4", name: "Open Gym",     type: "hyrox", coach: "Mara K.",day: "Fri", slot: "12:00", dur: "60m", repeat: "weekly" },
  { id: "uc5", name: "Sunrise",      type: "hyrox", coach: "Mara",   day: "Tue", slot: "06:00", dur: "45m", repeat: "daily"  },
];
const MARA = { id: "c-mara", name: "Mara", aliases: ["Mara K."], userId: "", active: true, availability: {} };
const DEV  = { id: "c-dev",  name: "Dev",  aliases: [], userId: "", active: true, availability: {} };

describe("dates are strings, and the comparisons never build a Date", () => {
  it("recognises a padded ISO calendar date and nothing else", () => {
    expect(isDateStr("2026-08-24")).toBe(true);
    expect(isDateStr("2026-8-24")).toBe(false);      // unpadded is a different vocabulary
    expect(isDateStr("24/08/2026")).toBe(false);
    expect(isDateStr("")).toBe(false);
    expect(isDateStr(null)).toBe(false);
  });

  it("counts whole days inclusive of both ends", () => {
    expect(daysInclusive("2026-08-24", "2026-08-24")).toBe(1);   // one day away is one day
    expect(daysInclusive("2026-08-24", "2026-08-28")).toBe(5);
    expect(daysInclusive("2026-08-28", "2026-08-24")).toBe(null); // backwards
    expect(daysInclusive("nonsense", "2026-08-24")).toBe(null);
  });

  it("an absence covers both of its end days", () => {
    const a = makeAbsence({ id: "a1", coachId: "c-mara", from: "2026-08-24", to: "2026-08-28" });
    expect(coversDate(a, "2026-08-24")).toBe(true);    // first day
    expect(coversDate(a, "2026-08-28")).toBe(true);    // last day
    expect(coversDate(a, "2026-08-23")).toBe(false);
    expect(coversDate(a, "2026-08-29")).toBe(false);
  });
});

describe("🔴 the refusals, because an absence built from a typo raises real asks", () => {
  it("refuses a range that runs backwards", () => {
    expect(absenceError({ from: "2026-08-28", to: "2026-08-24" }))
      .toMatch(/last day is before the first/i);
  });

  it("refuses an absurd range rather than deriving half a million classes", () => {
    expect(absenceError({ from: "2026-01-01", to: "2036-01-01" }))
      .toMatch(new RegExp(`${MAX_ABSENCE_DAYS} days`));
  });

  it("refuses a missing or malformed date", () => {
    expect(absenceError({ from: "", to: "2026-08-24" })).toMatch(/first and last day/i);
    expect(absenceError({})).toMatch(/first and last day/i);
  });

  it("accepts a single day, which is the commonest absence there is", () => {
    expect(absenceError({ from: "2026-08-24", to: "2026-08-24" })).toBe("");
  });

  it("🔴 every refusal is a sentence a coach can act on, not a code", () => {
    for (const bad of [{}, { from: "2026-08-28", to: "2026-08-24" }, { from: "2026-01-01", to: "2036-01-01" }]) {
      const msg = absenceError(bad);
      expect(msg).not.toBe("");
      expect(msg).toMatch(/^[A-Z].*[.]$/);            // a sentence
      expect(msg).not.toMatch(/ERR|_|null|undefined/);
    }
  });

  it("makeAbsence returns null rather than a row it had to guess at", () => {
    expect(makeAbsence({ id: "a1", coachId: "c1", from: "2026-08-28", to: "2026-08-24" })).toBe(null);
    expect(makeAbsence({ id: "a1", from: "2026-08-24", to: "2026-08-24" })).toBe(null);   // no coach
    expect(makeAbsence({ coachId: "c1", from: "2026-08-24", to: "2026-08-24" })).toBe(null); // no id
  });
});

describe("which classes an absence actually takes a coach away from", () => {
  const away = (from, to) => makeAbsence({ id: "a1", coachId: "c-mara", from, to });

  it("finds every occurrence in the range, dated", () => {
    // Mon 24th to Fri 28th August 2026.
    const hit = classesAffectedBy(RULES, MARA, away("2026-08-24", "2026-08-28"));
    expect(hit.map(o => `${o.date} ${o.name}`)).toEqual([
      // Sorted by START TIME then name, not grouped by rule: this is the order
      // a coach reads their own week in, and 06:00 comes before 18:00 whatever
      // the class is called.
      "2026-08-24 Strength Lab",   // Mon 06:00 weekly
      "2026-08-24 Sunrise",        // Mon 06:00 daily (same slot, later name)
      "2026-08-25 Sunrise",
      "2026-08-26 Sunrise",        // Wed 06:00
      "2026-08-26 Engine Room",    // Wed 18:00, typed "mara"
      "2026-08-27 Sunrise",
      "2026-08-28 Sunrise",        // Fri 06:00
      "2026-08-28 Open Gym",       // Fri 12:00, typed "Mara K." — the alias
    ]);
  });

  it("🔴 matches the typed name however it was typed, including by alias", () => {
    const hit = classesAffectedBy(RULES, MARA, away("2026-08-26", "2026-08-28"));
    expect(hit.map(o => o.name)).toContain("Engine Room");   // "mara", lower case
    expect(hit.map(o => o.name)).toContain("Open Gym");      // "Mara K.", an alias
  });

  it("🔴 does not take anyone else's classes away", () => {
    // THE CONTROL. Without it, a derivation that ignored the coach entirely
    // would satisfy every assertion above.
    const hit = classesAffectedBy(RULES, MARA, away("2026-08-24", "2026-08-28"));
    expect(hit.map(o => o.name)).not.toContain("Barbell Club");

    const devs = classesAffectedBy(RULES, DEV, away("2026-08-24", "2026-08-28"));
    expect(devs.map(o => o.name)).toEqual(["Barbell Club"]);
  });

  it("a one-off only counts in the week it was stamped for", () => {
    const once = [{ id: "uc9", name: "Charity Row", coach: "Mara", day: "Thu", slot: "18:00",
                    repeat: "once", weekKey: "2026-7-24" }];   // unpadded month index: August
    expect(classesAffectedBy(once, MARA, away("2026-08-24", "2026-08-28")).map(o => o.name))
      .toEqual(["Charity Row"]);
    expect(classesAffectedBy(once, MARA, away("2026-08-31", "2026-09-04"))).toEqual([]);
  });

  it("a range spanning several weeks keeps counting", () => {
    const hit = classesAffectedBy(RULES, MARA, away("2026-08-24", "2026-09-06"));
    expect(hit.filter(o => o.name === "Strength Lab").map(o => o.date))
      .toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("a cancelled absence takes nothing away", () => {
    const a = { ...away("2026-08-24", "2026-08-28"), cancelledAt: "2026-08-23T10:00:00.000Z" };
    expect(classesAffectedBy(RULES, MARA, a)).toEqual([]);
    expect(coversDate(a, "2026-08-25")).toBe(false);
  });

  it("refuses to derive anything from a range it already refused", () => {
    expect(occurrencesInRange(RULES, "2026-01-01", "2036-01-01")).toEqual([]);
    expect(occurrencesInRange(RULES, "2026-08-28", "2026-08-24")).toEqual([]);
  });
});

describe("absencesFor / isAwayOn", () => {
  const list = [
    makeAbsence({ id: "a1", coachId: "c-mara", from: "2026-08-24", to: "2026-08-28" }),
    makeAbsence({ id: "a2", coachId: "c-mara", from: "2026-09-14", to: "2026-09-18" }),
    makeAbsence({ id: "a3", coachId: "c-dev",  from: "2026-08-24", to: "2026-08-24" }),
    { ...makeAbsence({ id: "a4", coachId: "c-mara", from: "2026-10-01", to: "2026-10-02" }),
      cancelledAt: "2026-09-30T00:00:00.000Z" },
  ];

  it("returns one coach's live absences, newest first", () => {
    expect(absencesFor(list, "c-mara").map(a => a.id)).toEqual(["a2", "a1"]);
  });

  it("drops cancelled ones and other people's", () => {
    expect(absencesFor(list, "c-mara").map(a => a.id)).not.toContain("a4");
    expect(absencesFor(list, "c-dev").map(a => a.id)).toEqual(["a3"]);
    expect(absencesFor(list, "")).toEqual([]);
  });

  it("🔴 knows who is away on a given day, so they are not offered cover", () => {
    expect(isAwayOn(list, "c-mara", "2026-08-25")).toBe(true);
    expect(isAwayOn(list, "c-mara", "2026-08-29")).toBe(false);
    expect(isAwayOn(list, "c-dev",  "2026-08-25")).toBe(false);
    // A cancelled absence does not make anyone away.
    expect(isAwayOn(list, "c-mara", "2026-10-01")).toBe(false);
  });
});

// ─── DST: a REGRESSION guard, and honest about being only that ──────────────
//
// ⚠️ THIS BLOCK IS NOT MUTATION-CHECKED AND CANNOT BE, which is worth saying
// rather than dressing it in a 🔴. It was written to prove the local-noon anchor
// in `daysInclusive` earns its place, and it does not: mutating the anchor back
// to midnight leaves all three assertions green, because `Math.round` absorbs
// the missing hour. So does rewriting the parse as `new Date(str)`, since a
// UTC-parsed pair shifts equally and subtracts fine. Only both mistakes together
// fail it.
//
// It is kept because what it pins is BEHAVIOUR a coach depends on — an absence
// spanning a clock change covers the days the calendar says it does — and that
// is worth a guard even when no single edit breaks it. It was also written
// first WITHOUT a timezone, where it was genuinely vacuous: the suite runs in
// UTC and UTC has no DST at all.
describe("day counting survives the clocks changing", () => {
  beforeAll(() => { vi.stubEnv("TZ", "Europe/London"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  // POSITIVE CONTROL ON THE PRECONDITION, and it is doing more work here than
  // usual: this asserts the zone took AND that these particular dates really do
  // straddle a transition. A zone with no DST, or dates on the wrong weekend,
  // would make the two assertions below trivially true.
  it("🔴 really does change offset on these dates, or the rest is meaningless", () => {
    expect(new Date(2026, 2, 28, 12).getTimezoneOffset()).toBe(0);     // GMT
    expect(new Date(2026, 2, 30, 12).getTimezoneOffset()).toBe(-60);   // BST — sprang forward
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-60);   // BST
    expect(new Date(2026, 9, 26, 12).getTimezoneOffset()).toBe(0);     // GMT — fell back
  });

  it("a range spanning spring-forward is still the number of days on the calendar", () => {
    // 47 real hours, not 48. The answer a coach needs is 3 either way.
    expect(daysInclusive("2026-03-28", "2026-03-30")).toBe(3);
  });

  it("and so is one spanning the autumn change", () => {
    expect(daysInclusive("2026-10-24", "2026-10-26")).toBe(3);
  });
});

// ─── 🔴 The timezone half, which is the half that silently passes ────────────
//
// The suite runs in UTC, where a local date and a UTC date are the same string,
// so every assertion above would hold just as well against a module that built
// its dates with `toISOString().slice(0,10)`. This block runs west of Greenwich,
// where the two genuinely differ, and it is the only thing here that can tell
// them apart.
describe("occurrence dates are LOCAL calendar dates", () => {
  beforeAll(() => { vi.stubEnv("TZ", "America/Los_Angeles"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  // POSITIVE CONTROL ON THE PRECONDITION. A zone that did not take makes every
  // assertion below trivially true, which is worse than a failure.
  it("🔴 really is running west of UTC, or the rest of this block is meaningless", () => {
    expect(new Date(2026, 7, 24, 18, 0).getTimezoneOffset()).toBe(420);   // PDT, UTC-7
  });

  it("🔴 an evening class is dated the day it is taught, not the UTC day", () => {
    // Mon 24 Aug 2026, 18:00 in Los Angeles is 01:00 on TUESDAY the 25th in UTC.
    // A date read off `toISOString()` would put this class on the wrong day, and
    // an absence covering only Monday would then miss it entirely.
    const evening = [{ id: "uc1", name: "Engine Room", coach: "Mara", day: "Mon", slot: "18:00", repeat: "weekly" }];
    const hit = classesAffectedBy(evening, MARA,
      makeAbsence({ id: "a1", coachId: "c-mara", from: "2026-08-24", to: "2026-08-24" }));

    expect(hit).toHaveLength(1);
    expect(hit[0].date).toBe("2026-08-24");
    // And the raw ISO really does say the 25th, so the assertion above is doing work.
    expect(hit[0].startsAt.slice(0, 10)).toBe("2026-08-25");
    expect(occurrenceDate(hit[0])).toBe("2026-08-24");
  });
});
