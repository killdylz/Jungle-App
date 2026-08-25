import { describe, it, expect } from "vitest";
import { coverApprovedPayload, bookingAdapter, NO_BOOKING_SYSTEM,
         coverPushKey, pushCoverApproved, OUTBOX_CAP } from "./bookingAdapter.js";
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

// ─── S32 §2.4 · the outbox, and the double-post it exists to prevent ─────────
describe("coverPushKey", () => {
  const p = () => coverApprovedPayload({ request: approved(), fromName: "Mara", toName: "Dev" });

  it("is stable: the same approval always keys the same", () => {
    expect(coverPushKey(p())).toBe(coverPushKey(p()));
    expect(coverPushKey(p())).toContain("cover.approved");
    expect(coverPushKey(p())).toContain("uc1");
  });

  it("🔴 a LATER approval of the same class is a different event", () => {
    // The whole reason `approvedAt` is in the key. Without it, a class that
    // needed cover twice in a term would look like one event and the second
    // substitution would silently never be recorded.
    const later = { ...p(), approvedAt: "2026-09-01T05:00:00.000Z" };
    expect(coverPushKey(later)).not.toBe(coverPushKey(p()));
  });

  it("a different coach covering the same slot is a different event", () => {
    expect(coverPushKey({ ...p(), newCoach: "Sam" })).not.toBe(coverPushKey(p()));
  });

  it("has no key for something that is not a payload", () => {
    // No key means no record, and no record is better than a record that
    // collides with an unrelated one.
    expect(coverPushKey(null)).toBe("");
    expect(coverPushKey(undefined)).toBe("");
    expect(coverPushKey({ junk: true })).toBe("");
  });
});

describe("🔴 pushing an approval records it, exactly once", () => {
  // A seam standing in for localStorage, plus a COUNTING adapter — the count is
  // the assertion that matters, because "recorded once" and "sent once" are
  // different claims and only the second one costs a gym anything.
  function harness(impl) {
    let box = [];
    let calls = 0;
    const adapter = impl || {
      system: "none",
      async pushCoverApproved() {
        calls += 1;
        return { pushed: false, system: "none", reason: "No booking system is connected, so nothing was sent outside Jungle." };
      },
    };
    return {
      adapter,
      opts: () => ({ read: () => box, write: (l) => { box = l; }, adapter }),
      box: () => box,
      calls: () => calls,
    };
  }
  const payload = () => coverApprovedPayload({ request: approved(), fromName: "Mara", toName: "Dev" });

  it("keeps the exact pinned payload, not a summary of it", async () => {
    const h = harness();
    const r = await pushCoverApproved(payload(), h.opts());
    expect(r.recorded).toBe(true);
    expect(r.pushed).toBe(false);
    expect(h.box()).toHaveLength(1);
    expect(h.box()[0].payload).toEqual(payload());
    expect(h.box()[0].key).toBe(coverPushKey(payload()));
    expect(h.box()[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("🔴 a retry does not reach the adapter a second time", async () => {
    const h = harness();
    await pushCoverApproved(payload(), h.opts());
    expect(h.calls()).toBe(1);

    const again = await pushCoverApproved(payload(), h.opts());
    // THE ASSERTION. A double-posted instructor substitution is the first thing
    // a real integration gets wrong, and it is impossible before there is one.
    expect(h.calls()).toBe(1);
    expect(again.duplicate).toBe(true);
    expect(again.recorded).toBe(false);
    expect(h.box()).toHaveLength(1);
  });

  it("re-reports what happened the first time rather than inventing an answer", async () => {
    const h = harness();
    await pushCoverApproved(payload(), h.opts());
    const again = await pushCoverApproved(payload(), h.opts());
    expect(again.pushed).toBe(false);
    expect(again.reason).toMatch(/already recorded here/i);
    expect(again.reason).toMatch(/nothing was sent outside Jungle/i);
    // The standing rule, applied to every new string: no promise of a future.
    expect(again.reason).not.toMatch(/soon|coming|will be|shortly/i);
  });

  it("a SECOND cover for the same class is a second record, not a duplicate", async () => {
    // The control for the test above. Without it, "does not reach the adapter
    // twice" is equally satisfied by an outbox that never records anything new.
    const h = harness();
    await pushCoverApproved(payload(), h.opts());
    const second = await pushCoverApproved({ ...payload(), approvedAt: "2026-09-01T05:00:00.000Z" }, h.opts());
    expect(second.duplicate).toBe(false);
    expect(h.calls()).toBe(2);
    expect(h.box()).toHaveLength(2);
  });

  it("stays bounded, oldest first", async () => {
    const h = harness();
    for (let i = 0; i < OUTBOX_CAP + 5; i++) {
      await pushCoverApproved({ ...payload(), approvedAt: `2026-09-01T05:00:0${i % 10}.${String(i).padStart(3, "0")}Z` }, h.opts());
    }
    expect(h.box()).toHaveLength(OUTBOX_CAP);
    // The newest survived; the oldest did not.
    expect(h.box()[h.box().length - 1].payload.approvedAt).toContain("204");
  });

  it("🔴 an adapter that throws still leaves the approval intact", async () => {
    // The contract says an implementation never throws. This is what happens
    // when one does anyway, which is the case a third-party adapter will bring.
    const h = harness({ system: "explodes", async pushCoverApproved() { throw new Error("boom"); } });
    const r = await pushCoverApproved(payload(), h.opts());
    expect(r.pushed).toBe(false);
    expect(r.reason).toMatch(/could not be reached/i);
    expect(h.box()).toHaveLength(1);
    expect(h.box()[0].pushed).toBe(false);
  });

  it("🔴 a broken storage seam cannot break a push either", async () => {
    const boom = () => { throw new Error("localStorage is full"); };
    await expect(pushCoverApproved(payload(), { read: boom, write: boom }))
      .resolves.toMatchObject({ pushed: false, recorded: false });
    await expect(pushCoverApproved(payload(), { read: () => [], write: boom }))
      .resolves.toMatchObject({ pushed: false, recorded: false });
  });

  it("with no seam at all it behaves exactly as the bare adapter did", async () => {
    const r = await pushCoverApproved(payload());
    expect(r).toMatchObject({ pushed: false, system: "none", recorded: false });
    expect(r.reason).toMatch(/nothing was sent outside Jungle/i);
    await expect(pushCoverApproved(null)).resolves.toMatchObject({ pushed: false });
  });

  it("records that a REAL push was sent, so the next one is not re-sent", async () => {
    // The shape this has to hold in the world where A16 is answered and an
    // adapter exists. Nothing here can be exercised by the no-op.
    const h = harness({ system: "mindbody", async pushCoverApproved() { return { pushed: true, system: "mindbody", reason: "" }; } });
    const first = await pushCoverApproved(payload(), h.opts());
    expect(first).toMatchObject({ pushed: true, system: "mindbody", recorded: true });

    const again = await pushCoverApproved(payload(), h.opts());
    expect(again.pushed).toBe(true);
    expect(again.duplicate).toBe(true);
    expect(again.reason).toMatch(/already sent, and has not been sent again/i);
  });
});
