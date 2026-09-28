import { describe, it, expect } from "vitest";
import { winBackMessage, winBackLink, canDraftWinBack, winBackBlockedReason } from "./winback.js";
import { RETENTION_RULES } from "./retention.js";

const member = (over = {}) => ({ id: "m1", name: "Priya Nair", status: "active", ...over });
const flag = (rule) => ({ memberId: "m1", rule });

// Marketing language is what would move these messages out of the
// ongoing-relationship exemption and into the Do-Not-Call regime. Cheap to
// check, expensive to get wrong, and exactly the kind of thing a well-meaning
// copy edit adds later ("...and here's 20% off to welcome you back!").
const MARKETING = /\b(\d+%|discount|offer|deal|promo|sale|free (class|month|week)|limited time|sign up now)\b/i;

describe("win-back drafts stay inside the ongoing-relationship exemption", () => {
  it("drafts for every rule the engine can flag", () => {
    // If a new rule is added to RETENTION_RULES without a draft, a coach gets a
    // blank WhatsApp. Failing here is the reminder.
    RETENTION_RULES.forEach((rule) => {
      const msg = winBackMessage(flag(rule), member(), "The Garage");
      expect(msg, `no draft for rule '${rule}'`).toBeTruthy();
      expect(msg.length).toBeGreaterThan(40);
    });
  });

  it("never reads as marketing", () => {
    RETENTION_RULES.forEach((rule) => {
      const msg = winBackMessage(flag(rule), member(), "The Garage");
      expect(msg, `'${msg}' reads as marketing`).not.toMatch(MARKETING);
    });
  });

  it("references the existing membership, which is what the exemption rests on", () => {
    const absence = winBackMessage(flag("absence"), member(), "The Garage");
    expect(absence).toMatch(/membership/i);
    const nm = winBackMessage(flag("new_member_low_visits"), member(), "The Garage");
    expect(nm).toMatch(/joined us recently/i);
  });

  it("uses the member's first name only", () => {
    const msg = winBackMessage(flag("absence"), member({ name: "Priya Nair" }), "");
    expect(msg).toContain("Priya");
    expect(msg, "surname is not needed to send a friendly message").not.toContain("Nair");
  });

  it("signs off as the gym, because the gym is the sender", () => {
    expect(winBackMessage(flag("absence"), member(), "The Garage")).toContain("The Garage");
  });

  it("degrades without a gym name rather than printing an empty signature", () => {
    const msg = winBackMessage(flag("absence"), member(), "");
    expect(msg).not.toMatch(/—\s*$/);
    expect(msg.trim()).toBe(msg.trim()); // no dangling separator
  });
});

describe("eligibility", () => {
  it("allows a draft for a current member", () => {
    expect(canDraftWinBack(member())).toBe(true);
    expect(winBackBlockedReason(member())).toBeNull();
  });

  it("refuses once membership is no longer active", () => {
    // A promotional-feeling message to an ex-member is exactly what DNC covers.
    // The product stops offering the draft rather than letting a coach send it
    // and discover the rule afterwards.
    for (const status of ["ended", "cancelled", "paused", "", undefined]) {
      const m = member({ status });
      expect(canDraftWinBack(m), `status '${status}' must not be draftable`).toBe(false);
      expect(winBackBlockedReason(m)).toMatch(/isn't active/i);
    }
  });

  it("handles a missing member without throwing at the screen", () => {
    expect(canDraftWinBack(null)).toBe(false);
    expect(winBackBlockedReason(undefined)).toBeTruthy();
  });
});

describe("the link", () => {
  it("carries NO phone number — the coach picks the contact", () => {
    // Data minimisation: Jungle stores no member phone numbers, so none can
    // leak into a URL. wa.me with no recipient is what makes that possible.
    const link = winBackLink(flag("absence"), member(), "The Garage");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(link).not.toMatch(/wa\.me\/\d/);
  });

  it("encodes the message so punctuation survives the URL", () => {
    const link = winBackLink(flag("absence"), member(), "The Garage");
    expect(link).not.toContain(" ");
    expect(decodeURIComponent(link.split("text=")[1])).toBe(
      winBackMessage(flag("absence"), member(), "The Garage"),
    );
  });

  it("returns empty rather than a broken link when there is nothing to draft", () => {
    expect(winBackLink(null, member())).toBe("");
    expect(winBackLink(flag("absence"), null)).toBe("");
  });
});

// ── Session 43 · the draft says how long, and where, truthfully ─────────────
// The absence rule has no ceiling (A21), so the same flag can be 14 days old or
// 400. A message written to be sent unedited has to say which.
describe("the absence draft tells the truth about the absence", () => {
  const absent = (daysSince, over = {}) => ({ memberId: "m1", rule: "absence", daysSince,
                                              visits: 3, classVisits: 3, ptVisits: 0, ...over });
  const msg = f => winBackMessage(f, member(), "The Garage");

  it("keeps the familiar phrasing for the fortnight the rule was written for", () => {
    expect(msg(absent(14))).toContain("missed you in class the past couple of weeks");
    expect(msg(absent(20))).toContain("the past couple of weeks");
  });

  it("🔴 does not tell someone gone for months that it has been a couple of weeks", () => {
    expect(msg(absent(30))).toContain("the past 4 weeks");
    expect(msg(absent(90))).toContain("the past 3 months");
    expect(msg(absent(400))).toContain("in class for over a year");
    [30, 90, 400].forEach(d => expect(msg(absent(d))).not.toContain("couple of weeks"));
  });

  it("🔴 does not say 'in class' to someone who has only ever trained one-to-one", () => {
    expect(msg(absent(20, { classVisits: 0, ptVisits: 5 }))).toContain("missed you at your sessions");
    // A mix is still missed in class — that is where most of their visits were.
    expect(msg(absent(20, { classVisits: 2, ptVisits: 5 }))).toContain("missed you in class");
  });

  it("stays inside the exemption at every length", () => {
    [14, 30, 90, 400].forEach(d => {
      expect(msg(absent(d))).toMatch(/membership/i);
      expect(msg(absent(d))).not.toMatch(MARKETING);
    });
  });
});
