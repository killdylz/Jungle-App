import { describe, it, expect } from "vitest";
import { COVER_STATUSES, makeCoverRequest, settleCover, isOpen,
         inboxFor, requestsForClass, openRequestForClass, deliveryTruth } from "./coverRequests.js";
import { makeCoach } from "./coachRoster.js";

const rule = { id: "uc1", name: "Strength Lab", day: "Mon", slot: "06:00" };
const now = Date.parse("2026-08-24T05:00:00Z");
const req = (over = {}) => ({ ...makeCoverRequest({ id: "r1", classRule: rule, fromCoachId: "a", toCoachId: "b", now }), ...over });

describe("makeCoverRequest", () => {
  it("opens against a real class, in the open state", () => {
    const r = makeCoverRequest({ id: "r1", classRule: rule, fromCoachId: "a", toCoachId: "b", now });
    expect(r).toMatchObject({ id: "r1", classClientId: "uc1", status: "open",
                              classLabel: "Strength Lab", classDay: "Mon", classSlot: "06:00" });
    expect(r.settledAt).toBe("");
  });

  it("🔴 denormalises the class label, so editing the rule cannot restate the question", () => {
    const r = makeCoverRequest({ id: "r1", classRule: { ...rule }, now });
    rule.name = "Renamed";                       // the rule changes underneath it
    expect(r.classLabel).toBe("Strength Lab");   // the ask does not
    rule.name = "Strength Lab";
  });

  it("refuses to exist without an id or a class", () => {
    expect(makeCoverRequest({ classRule: rule, now })).toBeNull();
    expect(makeCoverRequest({ id: "r1", now })).toBeNull();
    expect(makeCoverRequest()).toBeNull();
  });

  it("names an untitled class rather than showing a blank ask", () => {
    expect(makeCoverRequest({ id: "r1", classRule: { id: "uc9", name: "  " }, now }).classLabel)
      .toBe("Untitled class");
  });
});

describe("🔴 settleCover — the race is decided, not discovered", () => {
  it("approves an open request once", () => {
    const r = settleCover([req()], "r1", "approved", { now });
    expect(r.changed).toBe(true);
    expect(r.request.status).toBe("approved");
    expect(r.request.settledAt).not.toBe("");
  });

  it("rejects an open request, and rejection is a settle like any other", () => {
    const r = settleCover([req()], "r1", "rejected", { now });
    expect(r.changed).toBe(true);
    expect(r.request.status).toBe("rejected");
  });

  it("🔴 the SECOND coach to approve is told they lost, and by what", () => {
    const first = settleCover([req()], "r1", "approved", { now });
    const second = settleCover(first.list, "r1", "approved", { now });
    expect(second.changed).toBe(false);
    expect(second.reason).toBe("approved");        // names the status that won
    expect(second.request.status).toBe("approved");
    expect(second.list).toBe(first.list);          // and nothing was rewritten
  });

  it("🔴 approving something the requester already cancelled does not resurrect it", () => {
    const cancelled = settleCover([req()], "r1", "cancelled", { now });
    const late = settleCover(cancelled.list, "r1", "approved", { now });
    expect(late.changed).toBe(false);
    expect(late.reason).toBe("cancelled");
    expect(late.request.status).toBe("cancelled");
  });

  it("a request that is gone is reported as gone, not crashed into", () => {
    const r = settleCover([req()], "nope", "approved", { now });
    expect(r).toMatchObject({ changed: false, reason: "gone", request: null });
  });

  it("refuses a status that is not a settle", () => {
    for (const bad of ["open", "maybe", "", null]) {
      expect(settleCover([req()], "r1", bad, { now }).changed).toBe(false);
    }
  });

  it("every settle status it accepts is one the database allows", () => {
    for (const s of ["approved", "rejected", "cancelled"]) {
      expect(COVER_STATUSES).toContain(s);
      expect(settleCover([req()], "r1", s, { now }).changed).toBe(true);
    }
  });

  it("does not mutate the list it was given", () => {
    const list = [req()];
    settleCover(list, "r1", "approved", { now });
    expect(list[0].status).toBe("open");
  });
});

describe("inboxFor / requestsForClass", () => {
  const open   = req({ id: "r1", toCoachId: "b" });
  const mine   = req({ id: "r2", toCoachId: "c" });
  const done   = req({ id: "r3", toCoachId: "b", status: "approved" });

  it("shows a coach only their own OPEN asks", () => {
    expect(inboxFor([open, mine, done], "b").map(r => r.id)).toEqual(["r1"]);
  });

  it("has nothing to show without a coach", () => {
    expect(inboxFor([open], "")).toEqual([]);
    expect(inboxFor([open], null)).toEqual([]);
  });

  it("finds the open ask against a class, and only one", () => {
    expect(openRequestForClass([done, open], "uc1").id).toBe("r1");
    expect(openRequestForClass([done], "uc1")).toBeNull();
    expect(requestsForClass([done, open], "uc1")).toHaveLength(2);
    expect(requestsForClass([done, open], "other")).toEqual([]);
  });

  it("isOpen means open", () => {
    expect(isOpen(open)).toBe(true);
    expect(isOpen(done)).toBe(false);
    expect(isOpen(undefined)).toBe(false);
  });
});

describe("🔴 deliveryTruth — the product may not say Sent when nothing was sent", () => {
  const withAccount = makeCoach("Dev", { userId: "u1" });
  const noAccount   = makeCoach("Dev");

  it("with no server, a request reaches ONE DEVICE — the shipped state today", () => {
    expect(deliveryTruth({ serverConfigured: false, toCoach: withAccount })).toBe("device");
    expect(deliveryTruth({ serverConfigured: false, toCoach: noAccount })).toBe("device");
    expect(deliveryTruth({})).toBe("device");
  });

  it("with a server but no account on the other end, there is nobody to reach", () => {
    expect(deliveryTruth({ serverConfigured: true, toCoach: noAccount })).toBe("unreached");
    expect(deliveryTruth({ serverConfigured: true, toCoach: null })).toBe("unreached");
  });

  it("with a server AND an account it is waiting — which is still not a notification", () => {
    expect(deliveryTruth({ serverConfigured: true, toCoach: withAccount })).toBe("waiting");
  });

  it("🔴 no state it can return is the word 'sent'", () => {
    const all = [
      deliveryTruth({ serverConfigured: false, toCoach: withAccount }),
      deliveryTruth({ serverConfigured: true,  toCoach: noAccount }),
      deliveryTruth({ serverConfigured: true,  toCoach: withAccount }),
    ];
    expect(new Set(all).size).toBe(3);                     // positive control: three real states
    expect(all).not.toContain("sent");
  });
});
