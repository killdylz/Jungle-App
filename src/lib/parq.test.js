import { describe, it, expect } from "vitest";
import {
  PARQ_QUESTIONS, PARQ_VALID_MONTHS, newParqAnswers, answeredCount,
  flaggedQuestions, parqExpiresOn, parqStatus, latestParq, describeLoadGate,
} from "./parq.js";

// The gate that F2's "gap 1" describes. Every assertion below is about one
// question: MAY a coach prescribe individualised load to this person, and does
// the app say why not in words the coach can act on.

const NOW = new Date(2026, 7, 31);          // 2026-08-31, local
const clean = () => PARQ_QUESTIONS.reduce((a, q) => { a[q.id] = false; return a; }, {});
const rec = (over = {}) => ({ memberId: "m1", screenedAt: "2026-08-01", answers: clean(), clearance: null, ...over });

describe("PAR-Q question set", () => {
  it("is the seven classic questions, each with a stable id", () => {
    expect(PARQ_QUESTIONS).toHaveLength(7);
    expect(PARQ_QUESTIONS.map(q => q.id)).toEqual(["q1","q2","q3","q4","q5","q6","q7"]);
    // Every question carries the full sentence AND a short form; the chip uses
    // the short one and truncating the long one mid-clause would change it.
    for (const q of PARQ_QUESTIONS) {
      expect(q.text.length).toBeGreaterThan(30);
      expect(q.short.length).toBeGreaterThan(0);
    }
  });

  it("starts unanswered, not answered-no", () => {
    const a = newParqAnswers();
    expect(Object.values(a).every(v => v === null)).toBe(true);
    // The trap this pins: a sheet defaulted to `false` is a completed screen
    // with seven clean answers that nobody was ever asked.
    expect(answeredCount(a)).toBe(0);
    expect(flaggedQuestions(a)).toEqual([]);
  });
});

describe("expiry", () => {
  it("adds twelve calendar months, keeping the day of the month", () => {
    expect(PARQ_VALID_MONTHS).toBe(12);
    expect(parqExpiresOn("2026-03-12")).toBe("2027-03-12");
    expect(parqExpiresOn("2025-12-31")).toBe("2026-12-31");
  });
  it("returns nothing for a date it cannot read, rather than a wrong date", () => {
    expect(parqExpiresOn("")).toBe("");
    expect(parqExpiresOn("not a date")).toBe("");
    expect(parqExpiresOn(undefined)).toBe("");
  });
});

describe("parqStatus — the load gate", () => {
  it("blocks a client who has never been screened", () => {
    const s = parqStatus(null, { now: NOW });
    expect(s.state).toBe("unscreened");
    expect(s.blocksLoad).toBe(true);
    expect(s.reason).toMatch(/has not completed a health screen/i);
  });

  it("blocks a part-answered screen AND says how far short it is", () => {
    const answers = clean();
    answers.q7 = null;
    const s = parqStatus(rec({ answers }), { now: NOW });
    expect(s.state).toBe("incomplete");
    expect(s.blocksLoad).toBe(true);
    // The count is the point: "incomplete" alone cannot tell a coach whether
    // they are one question or seven from being able to program.
    expect(s.answered).toBe(6);
    expect(s.reason).toContain("6 of 7");
  });

  it("clears a complete screen with no flags, and dates the clearance", () => {
    const s = parqStatus(rec(), { now: NOW });
    expect(s.state).toBe("cleared");
    expect(s.blocksLoad).toBe(false);
    expect(s.expiresOn).toBe("2027-08-01");
    expect(describeLoadGate(s)).toBe("");
  });

  it("refers a yes-answer to a doctor, names which questions, and blocks", () => {
    const answers = clean(); answers.q3 = true; answers.q5 = true;
    const s = parqStatus(rec({ answers }), { now: NOW });
    expect(s.state).toBe("referred");
    expect(s.blocksLoad).toBe(true);
    expect(s.flagged.map(q => q.id)).toEqual(["q3", "q5"]);
    // Named, not counted — "chest pain at rest" and "bone or joint problem"
    // lead to different conversations.
    expect(s.reason).toContain("Chest pain at rest");
    expect(s.reason).toContain("Bone or joint problem");
    // Nobody fails a PAR-Q, and the copy must not say they did.
    expect(s.reason).not.toMatch(/fail|unfit|not allowed/i);
    // The refusal says what is LOST and where the fix is. It must NOT restate
    // `reason`: the health-screen panel directly above it already carries those
    // forty words, and the first draft printed them twice on one screen.
    const gate = describeLoadGate(s);
    expect(gate).toMatch(/locked/i);
    expect(gate).toContain(s.label);
    expect(gate, "the refusal must not repeat the reason shown above it").not.toContain(s.reason);
  });

  it("unblocks a referred client once a doctor's clearance is recorded", () => {
    const answers = clean(); answers.q1 = true;
    const s = parqStatus(rec({ answers, clearance: { grantedAt: "2026-08-10", note: "Cardiology sign-off" } }), { now: NOW });
    expect(s.state).toBe("gp_cleared");
    expect(s.blocksLoad).toBe(false);
    expect(s.reason).toContain("2026-08-10");
    expect(s.reason).toContain("Cardiology sign-off");
  });

  it("expires a screen older than twelve months", () => {
    const s = parqStatus(rec({ screenedAt: "2025-08-30" }), { now: NOW });
    expect(s.state).toBe("expired");
    expect(s.blocksLoad).toBe(true);
    expect(s.expiresOn).toBe("2026-08-30");
  });

  it("is still valid on the expiry day itself", () => {
    // The boundary, in the direction that matters: a coach turning someone away
    // on the last valid day is a support ticket, and off-by-one on an expiry is
    // the classic way to cause it.
    const s = parqStatus(rec({ screenedAt: "2025-08-31" }), { now: NOW });
    expect(s.expiresOn).toBe("2026-08-31");
    expect(s.state).toBe("cleared");
    expect(s.blocksLoad).toBe(false);
  });

  it("expiry beats a clearance letter, not the other way round", () => {
    // The order inside parqStatus is load-bearing: a 2025 GP letter was granted
    // against a 2025 health picture, so it cannot clear a 2026 session.
    const answers = clean(); answers.q1 = true;
    const s = parqStatus(
      rec({ screenedAt: "2025-01-05", answers, clearance: { grantedAt: "2025-01-20", note: "ok" } }),
      { now: NOW });
    expect(s.state).toBe("expired");
    expect(s.blocksLoad).toBe(true);
  });

  it("ignores a clearance with no date on it", () => {
    // A clearance is a dated record or it is nothing — an undated one is a coach
    // ticking a box, which is precisely what the gate exists to prevent.
    const answers = clean(); answers.q2 = true;
    const s = parqStatus(rec({ answers, clearance: { note: "he said it's fine" } }), { now: NOW });
    expect(s.state).toBe("referred");
    expect(s.blocksLoad).toBe(true);
  });
});

describe("latestParq", () => {
  const ledger = [
    { memberId: "m1", screenedAt: "2024-01-01", answers: clean(), recordedAt: "2024-01-01T09:00:00Z" },
    { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), recordedAt: "2026-08-01T09:00:00Z" },
    { memberId: "m2", screenedAt: "2026-08-20", answers: clean(), recordedAt: "2026-08-20T09:00:00Z" },
  ];
  it("returns the newest record for that member and nobody else's", () => {
    expect(latestParq(ledger, "m1").screenedAt).toBe("2026-08-01");
    expect(latestParq(ledger, "m2").screenedAt).toBe("2026-08-20");
  });
  it("returns null for an unscreened member, and for no member at all", () => {
    expect(latestParq(ledger, "m3")).toBeNull();
    expect(latestParq(ledger, "")).toBeNull();
    expect(latestParq([], "m1")).toBeNull();
  });
  it("prefers the later-written of two screens on the same day", () => {
    // A same-day re-screen is a coach correcting a mistake; the correction wins.
    const sameDay = [
      { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), recordedAt: "2026-08-01T09:00:00Z", note: "first" },
      { memberId: "m1", screenedAt: "2026-08-01", answers: clean(), recordedAt: "2026-08-01T18:00:00Z", note: "corrected" },
    ];
    expect(latestParq(sameDay, "m1").note).toBe("corrected");
  });
});
