// ─── Session 43 · the member's data export, on the member's clock ─────────────
//
// 🔴 Runs in Asia/Singapore for the reason `importTimezone.test.js` does: in UTC
// a UTC slice and a local reading agree, and the defect is invisible.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { memberCsv, memberCsvFilename } from "./csvExport.js";

beforeAll(() => { vi.stubEnv("TZ", "Asia/Singapore"); });
afterAll(() => { vi.unstubAllEnvs(); });

const SARAH = { id: "m1", name: "Sarah Chen", email: "s@x.com", status: "active", joinedAt: "2026-01-01" };
const CLASSES = [
  { id: "ci1", name: "Evening Burn", classType: "HIIT", coachName: "Dylan", startsAt: "2026-09-22T10:00:00.000Z" },
  { id: "ci2", name: "Dawn Row",     classType: "HIIT", coachName: "Dylan", startsAt: "2026-09-21T22:30:00.000Z" },
  { id: "ci3", name: "Old Class",    classType: "HIIT", coachName: "Mara",  startsAt: "2026-03-04T12:00:00.000Z" },
];
const ATT = [
  // 18:05 on Tuesday the 22nd, Singapore.
  { id: "a1", classInstanceId: "ci1", memberId: "m1", source: "coach",  checkedInAt: "2026-09-22T10:05:00.000Z" },
  // 06:31 on Tuesday the 22nd — 22:31 on the 21st in UTC.
  { id: "a2", classInstanceId: "ci2", memberId: "m1", source: "qr",     checkedInAt: "2026-09-21T22:31:00.000Z" },
  // An imported date with no time: the importer's noon-UTC anchor.
  { id: "a3", classInstanceId: "ci3", memberId: "m1", source: "import", checkedInAt: "2026-03-04T12:00:00.000Z" },
];
const lines = csv => csv.replace(/^\uFEFF/, "").trim().split("\r\n");

describe("memberCsv writes what the member's own calendar says", () => {
  it("🔴 really is running east of UTC, or the rest of this file is meaningless", () => {
    expect(new Date(2026, 8, 22).getTimezoneOffset()).toBe(-480);
  });

  it("🔴 a check-in reads at the local date and time it happened", () => {
    const out = lines(memberCsv(SARAH, ATT, CLASSES));
    expect(out).toContain("2026-09-22,18:05,Evening Burn,HIIT,Dylan,Checked in by coach");
    expect(out).toContain("2026-09-22,06:31,Dawn Row,HIIT,Dylan,Self check-in");
    expect(out.join("\n")).not.toMatch(/2026-09-21,22:31|,10:05,/);
  });

  it("an import with no stated time is given no time, rather than an invented one", () => {
    const out = lines(memberCsv(SARAH, ATT, CLASSES));
    expect(out).toContain("2026-03-04,,Old Class,HIIT,Mara,Imported from previous system");
  });

  it("dates the export, the filename and a follow-up by the local day", () => {
    vi.useFakeTimers();
    // 07:00 on the 23rd in Singapore is 23:00 on the 22nd in UTC.
    vi.setSystemTime(new Date("2026-09-22T23:00:00.000Z"));
    try {
      const out = lines(memberCsv(SARAH, ATT, CLASSES, {
        retentionActions: [{ memberId: "m1", rule: "absence", action: "acted", occurredAt: "2026-09-22T23:30:00.000Z" }],
      }));
      expect(out).toContain("Exported,2026-09-23");
      expect(out.some(l => l.startsWith("2026-09-23,No recorded attendance"))).toBe(true);
      expect(memberCsvFilename(SARAH, new Date())).toBe("Sarah-Chen-data-2026-09-23.csv");
    } finally { vi.useRealTimers(); }
  });
});
