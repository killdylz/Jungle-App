import { describe, it, expect } from "vitest";
import { parseCsv, mapHeaders, parseDate, analyzeAttendanceCsv, describeImport,
         hasTimeOfDay, occurrenceKeyOf } from "./csvImport.js";

const ROSTER = [
  { id: "m1", name: "Sarah Chen", email: "sarah@example.com" },
  { id: "m2", name: "Tom Reed", email: "tom@example.com" },
];

describe("parseCsv", () => {
  it("handles quoted fields containing commas — the case split(',') gets wrong", () => {
    const g = parseCsv('name,class\n"Chen, Sarah",S360\n');
    expect(g[1]).toEqual(["Chen, Sarah", "S360"]);
  });

  it("handles escaped quotes and embedded newlines", () => {
    const g = parseCsv('a,b\n"say ""hi""","line1\nline2"\n');
    expect(g[1]).toEqual(['say "hi"', "line1\nline2"]);
  });

  it("strips the UTF-8 BOM Excel writes", () => {
    expect(parseCsv("﻿name,date\nSarah,2026-01-01")[0][0]).toBe("name");
  });

  it("drops blank lines without dropping rows that have empty cells", () => {
    const g = parseCsv("a,b\n\n1,\n\n,2\n");
    expect(g).toEqual([["a", "b"], ["1", ""], ["", "2"]]);
  });
});

describe("mapHeaders", () => {
  it("matches the many names exports use for the same column", () => {
    expect(mapHeaders(["Client Name", "Checked In At", "Session"]))
      .toEqual({ member: 0, date: 1, className: 2 });
    expect(mapHeaders(["email", "Date", "Instructor"]))
      .toEqual({ email: 0, date: 1, coach: 2 });
  });

  it("is insensitive to case, underscores and extra spaces", () => {
    expect(mapHeaders(["  MEMBER_NAME ", "class_date"])).toEqual({ member: 0, date: 1 });
  });
});

// What counts as ONE class. A studio running a 06:00 and an 18:00 class of the
// same name held two of them; a date-only export cannot tell them apart, so the
// granularity has to follow the data rather than being fixed at either end.
// Fixing it at DAY collapsed the two, dropped the second attendance as a
// "duplicate", and told the coach so — found by the end-to-end sweep in
// store.test.js, which is where the counts are.
describe("hasTimeOfDay", () => {
  it("sees a time when the export states one", () => {
    expect(hasTimeOfDay("2026-03-04T18:30:00")).toBe(true);
    expect(hasTimeOfDay("2026-03-04 18:30")).toBe(true);
    expect(hasTimeOfDay("04/03/2026 18:30")).toBe(true);
    expect(hasTimeOfDay("4.3.2026, 6:00")).toBe(true);
  });

  it("says no to a bare date, so one class per day stays one class", () => {
    expect(hasTimeOfDay("2026-03-04")).toBe(false);
    expect(hasTimeOfDay("04/03/2026")).toBe(false);
    expect(hasTimeOfDay("")).toBe(false);
    expect(hasTimeOfDay(null)).toBe(false);
  });

  // The forms parseDate reads no time out of must not claim one here, or the key
  // would assert a precision the timestamp does not actually have — parseDate
  // defaults those to 12:00 UTC.
  it("does not claim a precision parseDate did not produce", () => {
    expect(hasTimeOfDay("12 March 2026 18:30")).toBe(false);
    expect(hasTimeOfDay("March 12, 2026 6:00")).toBe(false);
    expect(parseDate("12 March 2026 18:30")).toContain("T12:00");
  });
});

describe("occurrenceKeyOf", () => {
  it("keys to the minute when timed and to the day when not", () => {
    const at = "2026-03-04T18:30:00.000Z";
    expect(occurrenceKeyOf("Morning Burn", at, true)).toBe("Morning Burn@2026-03-04T18:30");
    expect(occurrenceKeyOf("Morning Burn", at, false)).toBe("Morning Burn@2026-03-04");
  });
});

describe("parseDate", () => {
  it("reads ISO with and without a time", () => {
    expect(parseDate("2026-03-04")).toContain("2026-03-04");
    expect(parseDate("2026-03-04T18:30:00")).toContain("2026-03-04T18:30");
  });

  it("reads written-out month forms", () => {
    expect(parseDate("12 March 2026")).toContain("2026-03-12");
    expect(parseDate("Mar 12, 2026")).toContain("2026-03-12");
  });

  it("respects dayFirst for genuinely ambiguous slash dates", () => {
    expect(parseDate("03/04/2026", { dayFirst: true })).toContain("2026-04-03");
    expect(parseDate("03/04/2026", { dayFirst: false })).toContain("2026-03-04");
  });

  it("lets the NUMBERS settle it when they can, whatever dayFirst says", () => {
    // 13 can only be a day, so this is 13 April in both conventions.
    expect(parseDate("13/04/2026", { dayFirst: false })).toContain("2026-04-13");
    expect(parseDate("04/13/2026", { dayFirst: true })).toContain("2026-04-13");
  });

  it("REJECTS rather than guesses on anything else", () => {
    // A misparsed date lands a class in the wrong week and silently distorts the
    // retention curve, so refusing is the correct behaviour.
    expect(parseDate("last Tuesday")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("analyzeAttendanceCsv", () => {
  const CSV = `Member Name,Email,Date,Class,Type,Coach
Sarah Chen,sarah@example.com,2026-03-04,Tuesday 6pm,S360,Mara
Tom Reed,tom@example.com,2026-03-04,Tuesday 6pm,S360,Mara
Priya Patel,priya@example.com,2026-03-04,Tuesday 6pm,S360,Mara
Sarah Chen,sarah@example.com,2026-03-06,Thursday 6pm,GC,Mara`;

  it("matches roster members and flags only genuinely new ones", () => {
    const a = analyzeAttendanceCsv(CSV, ROSTER);
    expect(a.ok).toBe(true);
    expect(a.rows).toHaveLength(4);
    expect(a.newMembers.map(m => m.name)).toEqual(["Priya Patel"]);
    expect(a.rows.filter(r => r.memberKey === "m1")).toHaveLength(2);
  });

  it("groups check-ins into one class occurrence per class+date", () => {
    const a = analyzeAttendanceCsv(CSV, ROSTER);
    expect(a.classes).toHaveLength(2);
    expect(a.classes[0]).toMatchObject({ name: "Tuesday 6pm", classType: "S360", coachName: "Mara" });
  });

  it("matches by email even when the name is spelled differently", () => {
    const a = analyzeAttendanceCsv("name,email,date\nS. Chen,sarah@example.com,2026-03-04", ROSTER);
    expect(a.newMembers).toHaveLength(0);
    expect(a.rows[0].memberKey).toBe("m1");
  });

  it("never fuzzy-matches a name onto a near-identical roster member", () => {
    // "Sara Chen" is one character from "Sarah Chen". Attaching it would put one
    // person's history on another's record, invisibly, forever.
    const a = analyzeAttendanceCsv("name,date\nSara Chen,2026-03-04", ROSTER);
    expect(a.rows[0].memberKey).not.toBe("m1");
    expect(a.newMembers.map(m => m.name)).toEqual(["Sara Chen"]);
  });

  it("skips a duplicate member+class pair, which 0007's unique index would reject", () => {
    const dup = "name,date,class\nSarah Chen,2026-03-04,Tuesday 6pm\nSarah Chen,2026-03-04,Tuesday 6pm";
    const a = analyzeAttendanceCsv(dup, ROSTER);
    expect(a.rows).toHaveLength(1);
    expect(a.skipped).toBe(1);
  });

  it("reports every unreadable row WITH its line number instead of dropping it", () => {
    const messy = `name,date
Sarah Chen,2026-03-04
Tom Reed,sometime last week
,2026-03-05`;
    const a = analyzeAttendanceCsv(messy, ROSTER);
    expect(a.rows).toHaveLength(1);
    expect(a.problems).toHaveLength(2);
    expect(a.problems[0]).toMatchObject({ line: 3 });   // spreadsheet line numbers
    expect(a.problems[1]).toMatchObject({ line: 4 });
  });

  it("refuses a file with no member column, naming what it looked for", () => {
    const a = analyzeAttendanceCsv("date,class\n2026-03-04,Tuesday", ROSTER);
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/member column/i);
    expect(a.rows).toHaveLength(0);
  });

  it("refuses a file with no date column", () => {
    const a = analyzeAttendanceCsv("name,class\nSarah Chen,Tuesday", ROSTER);
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/date column/i);
  });

  it("refuses a file where NOTHING parsed rather than importing zero rows quietly", () => {
    const a = analyzeAttendanceCsv("name,date\nSarah Chen,whenever", ROSTER);
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/line 2/);
  });

  it("writes nothing — analysis is pure", () => {
    const before = JSON.stringify(ROSTER);
    analyzeAttendanceCsv(CSV, ROSTER);
    expect(JSON.stringify(ROSTER)).toBe(before);
  });
});

describe("describeImport", () => {
  it("summarises the write a coach is about to commit to", () => {
    const a = analyzeAttendanceCsv(`name,date,class
Sarah Chen,2026-03-04,Tuesday 6pm
Priya Patel,2026-03-04,Tuesday 6pm
Priya Patel,2026-03-04,Tuesday 6pm
Tom Reed,nope,Tuesday 6pm`, ROSTER);
    const s = describeImport(a);
    expect(s).toContain("2 check-ins");
    expect(s).toContain("1 class");
    expect(s).toContain("1 new member");
    expect(s).toContain("1 duplicate");
    expect(s).toContain("1 row that couldn't be read");
  });
});

// ─── S31 §2.2 · the reference to the gym's previous system ──────────────────
describe("externalRef — the field that had a reader and no writer", () => {
  it("recognises the columns an old system actually names", () => {
    expect(mapHeaders(["Client ID", "Member", "Date"]).externalRef).toBe(0);
    expect(mapHeaders(["Member", "Date", "Customer ID"]).externalRef).toBe(2);
    expect(mapHeaders(["Member", "Date", "Member Ref"]).externalRef).toBe(2);
  });

  it("🔴 does NOT claim a bare “ID” column — that is as likely to be a row number", () => {
    expect(mapHeaders(["ID", "Member", "Date"]).externalRef).toBeUndefined();
  });

  it("🔴 never takes a header an earlier column already answers to", () => {
    // "Client Name" belongs to `member`, and adding externalRef must not move it.
    const m = mapHeaders(["Client Name", "Date", "Client ID"]);
    expect(m.member).toBe(0);
    expect(m.externalRef).toBe(2);
  });

  it("carries the reference onto a new member the import creates", () => {
    const csv = "Member,Date,Client ID\nAsha,2026-03-04,MB-4471\n";
    const a = analyzeAttendanceCsv(csv, []);
    expect(a.ok).toBe(true);
    expect(a.newMembers).toHaveLength(1);
    expect(a.newMembers[0].externalRef).toBe("MB-4471");
  });

  it("is empty, not undefined, when the file has no such column", () => {
    const a = analyzeAttendanceCsv("Member,Date\nAsha,2026-03-04\n", []);
    expect(a.newMembers[0].externalRef).toBe("");
  });
});
