import { describe, it, expect } from "vitest";
import { coverApprovedPayload, bookingAdapter, NO_BOOKING_SYSTEM } from "./bookingAdapter.js";
import { makeCoverRequest, settleCover } from "./coverRequests.js";

const now = Date.parse("2026-08-24T05:00:00Z");
const approved = () => settleCover(
  [makeCoverRequest({ id: "r1", classRule: { id: "uc1", name: "Strength Lab", day: "Mon", slot: "06:00" },
                      fromCoachId: "a", toCoachId: "b", now })],
  "r1", "approved", { now }).request;

describe("coverApprovedPayload — the contract, pinned", () => {
  it("is the shape a booking system would be handed", () => {
    expect(coverApprovedPayload({ request: approved(), fromName: "Mara", toName: "Dev" })).toEqual({
      kind: "cover.approved",
      classRef: "uc1",
      classLabel: "Strength Lab",
      day: "Mon",
      slot: "06:00",
      previousCoach: "Mara",
      newCoach: "Dev",
      approvedAt: approved().settledAt,
    });
  });

  it("🔴 carries no internal object — an adapter must not be coupled to our roster's shape", () => {
    const p = coverApprovedPayload({ request: approved(), fromName: "Mara", toName: "Dev" });
    for (const v of Object.values(p)) expect(typeof v).toBe("string");
    // The ids that mean something only inside Jungle stay inside Jungle.
    expect(JSON.stringify(p)).not.toContain("fromCoachId");
    expect(Object.keys(p)).not.toContain("toCoachId");
  });

  it("names missing coaches as empty strings rather than inventing them", () => {
    const p = coverApprovedPayload({ request: approved() });
    expect(p.previousCoach).toBe("");
    expect(p.newCoach).toBe("");
  });

  it("has nothing to say about a request that is not there", () => {
    expect(coverApprovedPayload({})).toBeNull();
    expect(coverApprovedPayload()).toBeNull();
  });
});

describe("🔴 the default adapter does nothing, and says so", () => {
  it("is the no-op", () => {
    expect(bookingAdapter()).toBe(NO_BOOKING_SYSTEM);
    expect(bookingAdapter().system).toBe("none");
  });

  it("reports pushed:false with a reason a coach can read", async () => {
    const r = await bookingAdapter().pushCoverApproved(coverApprovedPayload({ request: approved() }));
    expect(r.pushed).toBe(false);
    expect(r.system).toBe("none");
    expect(r.reason).toMatch(/nothing was sent outside Jungle/i);
  });

  it("🔴 does not throw, ever — a booking push must never be able to undo an approval", async () => {
    await expect(bookingAdapter().pushCoverApproved(null)).resolves.toMatchObject({ pushed: false });
    await expect(bookingAdapter().pushCoverApproved(undefined)).resolves.toMatchObject({ pushed: false });
    await expect(bookingAdapter().pushCoverApproved({ junk: true })).resolves.toMatchObject({ pushed: false });
  });

  it("🔴 promises nothing about the future — no 'soon', no 'coming', no 'will'", async () => {
    const r = await bookingAdapter().pushCoverApproved(null);
    expect(r.reason).not.toMatch(/soon|coming|will be|shortly|pending/i);
  });
});

// A FAKE, kept here rather than in the module: shipping a fake adapter in the
// bundle would put a second implementation one import away from being wired up
// by accident, and the only thing it is for is this file.
describe("the contract is implementable — a fake satisfies it", () => {
  const fake = {
    system: "fake",
    sent: [],
    async pushCoverApproved(payload) {
      this.sent.push(payload);
      return { pushed: true, system: "fake", reason: "" };
    },
  };

  it("receives exactly the pinned payload and reports a push", async () => {
    const payload = coverApprovedPayload({ request: approved(), fromName: "Mara", toName: "Dev" });
    const r = await fake.pushCoverApproved(payload);
    expect(r).toEqual({ pushed: true, system: "fake", reason: "" });
    expect(fake.sent).toEqual([payload]);
  });
});
