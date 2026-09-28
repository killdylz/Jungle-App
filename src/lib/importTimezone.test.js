// ─── Session 43 · an imported time is the gym's wall clock ───────────────────
//
// 🔴 WHY THIS FILE SETS A TIMEZONE. The suite runs in UTC, where "18:00 local"
// and "18:00 UTC" are the same instant, so every importer test passes whether a
// stated time is read as local or as UTC. Jungle's first market is UTC+8. See
// `joinDate.test.js` for why `vi.stubEnv` and not `process.env.TZ =`.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { parseDate, analyzeAttendanceCsv } from "./csvImport.js";
import { applyAttendanceImport, getClassInstances, getAttendance, saveMembers,
         saveClassInstances } from "./store.js";

// No exported writer for attendance by design (recordAttendance mints a live
// check-in stamped now); a seeded row goes straight to the key it lives under.
const saveAttendance = (rows) => localStorage.setItem("jungle_attendance", JSON.stringify(rows));

beforeAll(() => { vi.stubEnv("TZ", "Asia/Singapore"); });
afterAll(() => { vi.unstubAllEnvs(); });

// The Runner writes a real instant: 18:00 in Singapore is 10:00 UTC.
// ⚠️ Literal, not `new Date(2026, 8, 22, 18)`: module scope runs before
// `beforeAll` sets the zone, so a computed value here would be built in UTC.
const RUNNER_ROW = { id: "ci1", name: "Evening Burn", classType: "hiit", coachName: "Dylan",
                     startsAt: "2026-09-22T10:00:00.000Z" };
const SARAH = { id: "m1", name: "Sarah Chen", email: "sarah@example.com", status: "active", joinedAt: "2026-01-01" };
const HEADER = "Member Name,Email,Date,Class,Type,Coach";

describe("the importer reads a stated time on the gym's clock", () => {
  beforeEach(() => localStorage.clear());

  it("🔴 really is running east of UTC, or the rest of this file is meaningless", () => {
    expect(new Date(2026, 8, 22).getTimezoneOffset()).toBe(-480);
    expect(new Date(2026, 8, 22, 18, 0).toISOString()).toBe(RUNNER_ROW.startsAt);
  });

  it("🔴 18:00 in the file is 18:00 in Singapore, not 02:00 the next morning", () => {
    expect(parseDate("2026-09-22 18:00")).toBe("2026-09-22T10:00:00.000Z");
    expect(parseDate("22/09/2026 18:00")).toBe("2026-09-22T10:00:00.000Z");
  });

  it("keeps a bare date on its noon-UTC anchor — it states no time to be wrong about", () => {
    expect(parseDate("2026-09-22")).toBe("2026-09-22T12:00:00.000Z");
  });

  it("honours an offset the file states, and still rejects an impossible date", () => {
    expect(parseDate("2026-09-22T18:00:00Z")).toBe("2026-09-22T18:00:00.000Z");
    expect(parseDate("2026-09-22T18:00:00+08:00")).toBe("2026-09-22T10:00:00.000Z");
    expect(parseDate("2026-02-31T18:00:00Z")).toBeNull();
    expect(parseDate("2026-02-31 18:00")).toBeNull();
  });

  it("🔴 an export of a class Jungle already ran joins Jungle's own row", () => {
    saveMembers([SARAH]);
    saveClassInstances([RUNNER_ROW]);
    saveAttendance([{ id: "a1", classInstanceId: "ci1", memberId: "m1", source: "coach",
                      checkedInAt: "2026-09-22T10:05:00.000Z" }]);
    const csv = `${HEADER}\nSarah Chen,sarah@example.com,2026-09-22 18:00,Evening Burn,HIIT,Dylan`;
    const r = applyAttendanceImport(analyzeAttendanceCsv(csv, [SARAH]));
    expect(r.ok).toBe(true);
    // One class, one visit — not a second "Evening Burn" 8 hours later.
    expect(getClassInstances()).toHaveLength(1);
    expect(getAttendance()).toHaveLength(1);
  });

  it("🔴 an untimed export joins a morning class on its LOCAL day", () => {
    // 06:00 on the 22nd in Singapore is 22:00 UTC on the 21st.
    const dawn = { ...RUNNER_ROW, id: "ci2", name: "Dawn Row", startsAt: new Date(2026, 8, 22, 6, 0).toISOString() };
    expect(dawn.startsAt.slice(0, 10)).toBe("2026-09-21");
    saveMembers([SARAH]);
    saveClassInstances([dawn]);
    const csv = `${HEADER}\nSarah Chen,sarah@example.com,2026-09-22,Dawn Row,HIIT,Dylan`;
    applyAttendanceImport(analyzeAttendanceCsv(csv, [SARAH]));
    expect(getClassInstances()).toHaveLength(1);
    expect(getAttendance()[0].classInstanceId).toBe("ci2");
  });

  it("a file imported BEFORE this fix still de-duplicates on re-import", () => {
    // The old importer stored the file's wall clock as if it were UTC.
    const legacy = { ...RUNNER_ROW, id: "old", startsAt: "2026-09-22T18:00:00.000Z" };
    saveMembers([SARAH]);
    saveClassInstances([legacy]);
    saveAttendance([{ id: "a1", classInstanceId: "old", memberId: "m1", source: "import",
                      checkedInAt: "2026-09-22T18:00:00.000Z" }]);
    const csv = `${HEADER}\nSarah Chen,sarah@example.com,2026-09-22 18:00,Evening Burn,HIIT,Dylan`;
    const r = applyAttendanceImport(analyzeAttendanceCsv(csv, [SARAH]));
    expect(r.ok).toBe(true);
    expect(getClassInstances()).toHaveLength(1);
    expect(getAttendance()).toHaveLength(1);
  });
});
