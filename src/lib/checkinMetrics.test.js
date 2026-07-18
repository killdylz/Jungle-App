import { describe, it, expect, beforeEach } from "vitest";
import {
  summarize, recordSession, getSessions, clearSessions, p6Summary,
  median, IDLE_GAP_MS, P6_TARGET_SEC,
} from "./checkinMetrics.js";

const T0 = 1_700_000_000_000;
const at = sec => T0 + sec * 1000;

describe("median", () => {
  it("is the middle value, and the mean of the middle two when even", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns null rather than 0 for no data — an unmeasured value is not zero", () => {
    expect(median([])).toBeNull();
    expect(median([NaN, undefined, null])).toBeNull();
  });
});

describe("summarize", () => {
  it("measures the first check-in from the panel opening", () => {
    // Finding the first name is real cost that P6 has to cover.
    const s = summarize(T0, [at(4)]);
    expect(s.medianSec).toBe(4);
    expect(s.count).toBe(1);
  });

  it("measures subsequent check-ins as the gap from the previous one", () => {
    const s = summarize(T0, [at(3), at(6), at(9)]);   // gaps 3,3,3
    expect(s.medianSec).toBe(3);
    expect(s.count).toBe(3);
  });

  it("EXCLUDES an idle stretch and reports that it did", () => {
    // The coach checks two people in, coaches for ten minutes, then a latecomer
    // arrives. That ten minutes is not check-in effort — counting it would make a
    // fast interaction look catastrophically slow.
    const s = summarize(T0, [at(2), at(4), at(610)]);
    expect(s.medianSec).toBe(2);
    expect(s.idleSkipped).toBe(1);
    expect(s.count).toBe(3);               // the member still counts as checked in
  });

  it("keeps a gap just under the idle threshold", () => {
    const s = summarize(T0, [at(1), T0 + 1000 + IDLE_GAP_MS - 1]);
    expect(s.idleSkipped).toBe(0);
  });

  it("uses the MEDIAN so one fumbled search doesn't swamp the sample", () => {
    // Nine 2s taps and one 30s hunt for an unusual spelling.
    const stamps = [];
    for (let i = 1; i <= 9; i++) stamps.push(at(i * 2));
    stamps.push(at(18 + 30));
    const s = summarize(T0, stamps);
    expect(s.medianSec).toBe(2);
  });

  it("reports nothing measurable for a panel opened and closed with no check-ins", () => {
    expect(summarize(T0, [])).toMatchObject({ count: 0, medianSec: null });
  });

  it("ignores clock skew rather than crediting a negative gap", () => {
    // A stamp before the panel opened (device clock adjusted mid-class). The only
    // real gap here is the 7s between the two stamps; a negative gap must be
    // DROPPED, not averaged in — pulling the median down would make check-in look
    // faster than it is, which is the one direction this metric must never lie in.
    const s = summarize(T0, [T0 - 5000, at(2)]);
    expect(s.medianSec).toBe(7);
    expect(s.count).toBe(2);
  });
});

describe("recordSession / p6Summary", () => {
  beforeEach(() => { localStorage.clear(); clearSessions(); });

  it("does not record a session with no check-ins", () => {
    expect(recordSession({ classInstanceId: "c1", openedAt: T0, stamps: [] })).toBeNull();
    expect(getSessions()).toHaveLength(0);
  });

  it("accumulates sessions and judges them against P6", () => {
    recordSession({ classInstanceId: "c1", openedAt: T0, stamps: [at(2), at(4), at(6)] });
    recordSession({ classInstanceId: "c2", openedAt: T0, stamps: [at(3), at(6)] });
    const p = p6Summary();
    expect(p.sessions).toBe(2);
    expect(p.members).toBe(5);
    expect(p.medianSec).toBe(2.5);          // median of per-session medians (2, 3)
    expect(p.meetsTarget).toBe(true);
  });

  it("fails the target when check-in is genuinely slow", () => {
    recordSession({ classInstanceId: "c1", openedAt: T0, stamps: [at(9), at(18), at(27)] });
    const p = p6Summary();
    expect(p.medianSec).toBe(9);
    expect(p.meetsTarget).toBe(false);
    expect(p.medianSec).toBeGreaterThan(P6_TARGET_SEC);
  });

  it("reports meetsTarget as NULL — never true — when nothing has been measured", () => {
    // This is the entire point of the module. An unmeasured design law reading as
    // a passing one is the exact failure mode I4 exists to remove.
    const p = p6Summary();
    expect(p.meetsTarget).toBeNull();
    expect(p.medianSec).toBeNull();
    expect(p.meetsTarget).not.toBe(true);
  });

  it("weights each session equally, so one huge class can't outvote twenty ordinary ones", () => {
    // A 40-member class at 1s/member, and one ordinary class at 8s/member.
    const many = [];
    for (let i = 1; i <= 40; i++) many.push(at(i));
    recordSession({ classInstanceId: "big", openedAt: T0, stamps: many });
    recordSession({ classInstanceId: "slow", openedAt: T0, stamps: [at(8), at(16)] });
    // Median of per-session medians (1, 8) = 4.5 — not dragged to ~1 by row count.
    expect(p6Summary().medianSec).toBe(4.5);
  });

  it("survives corrupted localStorage without throwing", () => {
    localStorage.setItem("jungle_checkin_metrics", "{not json");
    expect(getSessions()).toEqual([]);
    expect(p6Summary().meetsTarget).toBeNull();
  });
});
