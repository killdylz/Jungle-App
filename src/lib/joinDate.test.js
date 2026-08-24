// ─── S31 §2.4 · a join date is a CALENDAR date ──────────────────────────────
//
// 🔴 WHY THIS FILE SETS A TIMEZONE. The suite runs in UTC, where local and UTC
// dates are identical — so a test written the obvious way passes whether
// `addMember` uses `localDateStr()` or `toISOString().slice(0,10)`, and proves
// nothing. It has to run east (or west) of UTC to tell them apart at all.
//
// Set before anything constructs a Date, and RESTORED after, so the rest of the
// suite is unaffected.
const REAL_TZ = process.env.TZ;
process.env.TZ = "Asia/Singapore";

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { addMember, getMembers } from "./store.js";

afterAll(() => { process.env.TZ = REAL_TZ; });

// 2026-03-03 16:30 UTC is 2026-03-04 00:30 in Singapore. UTC says the 3rd, the
// coach's wall calendar says the 4th. That gap is the whole defect.
const LATE_UTC = new Date("2026-03-03T16:30:00Z");

describe("addMember stamps the local calendar day", () => {
  beforeEach(() => { localStorage.clear(); });

  // POSITIVE CONTROL ON THE TEST'S OWN PRECONDITION. If the TZ did not take —
  // a cached ICU zone, a runner that pins TZ itself — every assertion below
  // becomes trivially true and would pass against the bug. This fails loudly
  // instead of quietly proving nothing.
  it("🔴 really is running east of UTC, or the rest of this file is meaningless", () => {
    expect(LATE_UTC.getTimezoneOffset()).toBe(-480);
    expect(LATE_UTC.toISOString().slice(0, 10)).toBe("2026-03-03");
  });

  it("🔴 records the day the coach's calendar shows, not the UTC day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_UTC);
    try {
      const { member } = addMember("Asha Rahman");
      expect(member.joinedAt).toBe("2026-03-04");
      // And the STORED row, not just the returned one.
      expect(getMembers()[0].joinedAt).toBe("2026-03-04");
    } finally { vi.useRealTimers(); }
  });

  it("an explicitly supplied join date is still respected untouched", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_UTC);
    try {
      const { member } = addMember("Bo Tan", { joinedAt: "2025-01-09" });
      expect(member.joinedAt).toBe("2025-01-09");
    } finally { vi.useRealTimers(); }
  });

  it("is still a plain ISO calendar date — the shape every reader parses", () => {
    const { member } = addMember("Cai Wen");
    expect(member.joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
