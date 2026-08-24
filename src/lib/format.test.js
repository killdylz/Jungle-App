import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fmt, fmtSec, fmtOccurrence, fmtAgo, localDateStr } from "./format.js";

// These three became a SHARED module in I6 stage 5. Before that they were
// module-scope consts in App.jsx, read by the Builder and the Runner alike, and
// untested — which was survivable while one file owned them and is not now that
// two clusters import them across a boundary.
//
// The most important thing this file pins is a NEGATIVE: `fmt` does not clamp.
// src/screens/runner/FloorLiveScreen.jsx deliberately declares its own `fmt`
// that floors and clamps at zero, because an overrun stage must read "0:00" on
// a wall a room full of members is looking at. The two functions look identical
// at a glance and are not, so the difference is asserted here rather than
// described in a comment that a future tidy-up would delete along with the
// shadowing local.

describe("fmt — m:ss for the Builder and the Runner", () => {
  it("pads seconds to two digits", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(5)).toBe("0:05");
    expect(fmt(59)).toBe("0:59");
  });

  it("rolls over into minutes", () => {
    expect(fmt(60)).toBe("1:00");
    expect(fmt(61)).toBe("1:01");
    expect(fmt(600)).toBe("10:00");
    expect(fmt(3599)).toBe("59:59");
  });

  it("keeps counting past an hour rather than wrapping", () => {
    // A 90-minute open-gym block is a real thing a coach can build, and "30:00"
    // for 90 minutes would be a confident wrong answer.
    expect(fmt(3600)).toBe("60:00");
    expect(fmt(5400)).toBe("90:00");
  });

  it("does NOT clamp negatives — the floor board's own fmt does that, not this one", () => {
    // If this ever starts returning "0:00", FloorLiveScreen's local `fmt` has
    // probably just been "tidied" into an import of this one. It must not be:
    // see the note at the top of that file.
    expect(fmt(-1)).not.toBe("0:00");
  });
});

describe("fmtSec", () => {
  it("labels a raw second count", () => {
    expect(fmtSec(0)).toBe("0s");
    expect(fmtSec(20)).toBe("20s");
  });
});

describe("fmtOccurrence — when a scheduled class starts", () => {
  // Date-dependent by nature, and `honesty.spec.js` once passed six days a week
  // and failed on Sunday. Every case below builds its instant RELATIVE to now,
  // so there is no wall-clock date that can make this file red on its own.
  const at = (dayOffset, h, m) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  it('says "today" for the common case rather than naming the weekday', () => {
    expect(fmtOccurrence(at(0, 18, 0))).toBe("today 18:00");
    expect(fmtOccurrence(at(0, 6, 5))).toBe("today 06:05");
  });

  it("names the weekday for any other day", () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(fmtOccurrence(at(1, 18, 0))).toBe(`${days[tomorrow.getDay()]} 18:00`);
  });

  it("uses 24h, because the Schedule's own slots are 24h", () => {
    // A coach comparing "6:00 PM" here with "18:00" on the Schedule grid has to
    // translate, and that is the moment attendance lands on the wrong class.
    expect(fmtOccurrence(at(0, 18, 30))).toContain("18:30");
    expect(fmtOccurrence(at(0, 0, 0))).toContain("00:00");
  });

  it("returns an empty string for an unparseable date instead of 'Invalid Date'", () => {
    expect(fmtOccurrence("not-a-date")).toBe("");
    expect(fmtOccurrence("")).toBe("");
    expect(fmtOccurrence(undefined)).toBe("");
  });
});

// ── fmtAgo — "how long has this been failing" ────────────────────────────────
// Exists for the sync banner. The banner's defect was that a blip and a
// fortnight of divergence read identically; this is the function that lets them
// differ, so the boundaries are pinned rather than eyeballed.
describe("fmtAgo", () => {
  const NOW = 1_700_000_000_000;
  const agoBy = ms => fmtAgo(NOW - ms, NOW);

  it("says 'just now' below a minute, because the retry timer ticks every 30s", () => {
    // A figure in seconds would imply a precision the mechanism does not have.
    expect(agoBy(0)).toBe("just now");
    expect(agoBy(59_000)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(agoBy(60_000)).toBe("1 min ago");
    expect(agoBy(59 * 60_000)).toBe("59 min ago");
    expect(agoBy(60 * 60_000)).toBe("1 h ago");
    expect(agoBy(23 * 3600_000)).toBe("23 h ago");
    expect(agoBy(24 * 3600_000)).toBe("1 day ago");
    expect(agoBy(14 * 24 * 3600_000)).toBe("14 days ago");
  });

  it("singularises one day and only one day", () => {
    expect(agoBy(24 * 3600_000)).toBe("1 day ago");
    expect(agoBy(2 * 24 * 3600_000)).toBe("2 days ago");
  });

  it("absorbs a clock that has gone backwards rather than saying '-3 min ago'", () => {
    // Two devices, two clocks; a timestamp from the future is not worth a
    // nonsense string on screen.
    expect(fmtAgo(NOW + 30_000, NOW)).toBe("just now");
  });

  it("returns '' — not 'just now' — for a missing timestamp", () => {
    // The caller omits the phrase entirely. An older build wrote ledger entries
    // with no `at`, and "just now" would be a confident claim that the retry is
    // healthy when we simply do not know.
    expect(fmtAgo(undefined, NOW)).toBe("");
    expect(fmtAgo(null, NOW)).toBe("");
    expect(fmtAgo("nonsense", NOW)).toBe("");
  });
});

// ─── S31 §2.4 · localDateStr, shared so a writer and its reader cannot drift ──
describe("localDateStr", () => {
  beforeAll(() => { vi.stubEnv("TZ", "Asia/Singapore"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  // POSITIVE CONTROL on the precondition: in UTC every assertion below is
  // trivially true and would pass against the bug this helper exists to fix.
  it("🔴 really is running east of UTC, or this describe proves nothing", () => {
    expect(new Date("2026-03-03T16:30:00Z").getTimezoneOffset()).toBe(-480);
  });

  it("🔴 gives the calendar day the reader is living in, not the UTC one", () => {
    const lateUtc = Date.parse("2026-03-03T16:30:00Z");   // 2026-03-04 00:30 in SG
    expect(localDateStr(lateUtc)).toBe("2026-03-04");
    expect(new Date(lateUtc).toISOString().slice(0, 10)).toBe("2026-03-03");
  });

  it("pads month and day, so the strings sort and compare as dates", () => {
    expect(localDateStr(Date.parse("2026-01-05T04:00:00Z"))).toBe("2026-01-05");
    expect(localDateStr(Date.parse("2026-11-30T04:00:00Z"))).toBe("2026-11-30");
  });

  it("🔴 stepping a local day and formatting agree — the streak loop's contract", () => {
    // ProfileModal walks back with `d.setDate(d.getDate()-1)` and labels each
    // step with this. If the two used different calendars the walk would skip or
    // repeat a day at the boundary, which is what mixing them used to risk.
    const d = new Date(Date.parse("2026-03-03T16:30:00Z"));  // 04 Mar in SG
    const seen = [];
    for (let i = 0; i < 3; i++) { seen.push(localDateStr(d.getTime())); d.setDate(d.getDate() - 1); }
    expect(seen).toEqual(["2026-03-04", "2026-03-03", "2026-03-02"]);
  });
});
