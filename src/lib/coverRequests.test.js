import { describe, it, expect } from "vitest";
import { makeCoverForOccurrence, settleCover, isOpen, COVER_STATUSES,
         openCovers, requestsForOccurrence, openCoverForOccurrence,
         coverForOccurrence, applyCovers, deliveryTruth, reachableCoaches } from "./coverRequests.js";

const now = Date.parse("2026-08-24T05:00:00Z");

// An occurrence as `occurrencesForWeek` / `occurrencesInRange` produce one.
const occ = (over = {}) => ({
  ruleId: "uc1", name: "Strength Lab", classType: "hyrox", coachName: "Mara",
  durationMin: 45, startsAt: "2026-08-24T06:00:00.000Z",
  day: "Mon", slot: "06:00", date: "2026-08-24", ...over,
});
const raise = (over = {}, o = occ()) =>
  makeCoverForOccurrence({ id: "r1", occurrence: o, fromCoachId: "c-mara", now, ...over });

const ROSTER = [
  { id: "c-mara", name: "Mara", aliases: [], userId: "u-mara", active: true },
  { id: "c-dev",  name: "Dev",  aliases: [], userId: "",       active: true },
];

describe("makeCoverForOccurrence", () => {
  it("opens against ONE DATED occurrence", () => {
    expect(raise()).toMatchObject({
      classClientId: "uc1", classLabel: "Strength Lab",
      classDay: "Mon", classSlot: "06:00", classDate: "2026-08-24",
      status: "open", fromCoachId: "c-mara",
    });
  });

  it("🔴 has nobody covering it yet, because nobody has claimed it", () => {
    // `toCoachId` used to mean "who is being asked" and now means "who is
    // covering". Empty at creation is the whole difference between the two.
    expect(raise().toCoachId).toBe("");
    expect(raise().settledAt).toBe("");
  });

  it("🔴 denormalises the label, day, slot AND date", () => {
    // The date for a reason one stronger than the label's: a rule that moves
    // from Monday to Tuesday must not silently move an agreed cover with it.
    const r = raise();
    expect(r.classDate).toBe("2026-08-24");
    expect(r.classLabel).toBe("Strength Lab");
    expect(r.classDay).toBe("Mon");
  });

  it("derives the date from the occurrence when it does not carry one", () => {
    const bare = { ...occ() };
    delete bare.date;
    expect(raise({}, bare).classDate).toBe(
      new Date(bare.startsAt).getFullYear() + "-" +
      String(new Date(bare.startsAt).getMonth() + 1).padStart(2, "0") + "-" +
      String(new Date(bare.startsAt).getDate()).padStart(2, "0"));
  });

  it("records which absence raised it, and tolerates none", () => {
    expect(raise({ absenceId: "a1" }).absenceId).toBe("a1");
    expect(raise().absenceId).toBe("");
  });

  it("refuses to exist without an id, a rule or a date", () => {
    expect(makeCoverForOccurrence({ occurrence: occ(), now })).toBe(null);
    expect(makeCoverForOccurrence({ id: "r1", now })).toBe(null);
    const undated = { ...occ(), startsAt: "", date: "" };
    expect(makeCoverForOccurrence({ id: "r1", occurrence: undated, now })).toBe(null);
  });

  it("names an untitled class rather than showing a blank ask", () => {
    expect(raise({}, occ({ name: "" })).classLabel).toBe("Untitled class");
  });
});

describe("🔴 COVER_STATUSES", () => {
  it("no longer carries `rejected`, because nobody is asked any more", () => {
    // Not claiming IS declining once a cover goes to everyone. A status nothing
    // can write is one dbConstraints.test.js correctly flags as unreachable.
    expect(COVER_STATUSES).toEqual(["open", "approved", "cancelled"]);
  });
});

describe("🔴 settleCover — the race is decided, not discovered", () => {
  const list = () => [raise()];

  it("a claim records WHO is covering, not just that it was taken", () => {
    const r = settleCover(list(), "r1", "approved", { now, by: "u-dev", coachId: "c-dev" });
    expect(r.changed).toBe(true);
    expect(r.request.status).toBe("approved");
    expect(r.request.toCoachId).toBe("c-dev");     // the roster id — who teaches
    expect(r.request.settledBy).toBe("u-dev");     // the profile id — who pressed
    expect(r.request.settledAt).not.toBe("");
  });

  it("🔴 a cancellation records no coverer", () => {
    // The control for the line above. Writing one would make `applyCovers` hand
    // the class to somebody who never agreed to take it.
    const r = settleCover(list(), "r1", "cancelled", { now, by: "u-mara", coachId: "c-dev" });
    expect(r.changed).toBe(true);
    expect(r.request.toCoachId).toBe("");
  });

  it("🔴 the SECOND coach to claim is told they lost, and by what", () => {
    const first = settleCover(list(), "r1", "approved", { now, coachId: "c-dev" });
    const second = settleCover(first.list, "r1", "approved", { now, coachId: "c-sam" });
    expect(second.changed).toBe(false);
    expect(second.reason).toBe("approved");
    expect(second.list).toBe(first.list);
    // And the first claimer still holds it.
    expect(second.request.toCoachId).toBe("c-dev");
  });

  it("🔴 claiming something the asker already withdrew does not resurrect it", () => {
    const gone = settleCover(list(), "r1", "cancelled", { now });
    const late = settleCover(gone.list, "r1", "approved", { now, coachId: "c-dev" });
    expect(late.changed).toBe(false);
    expect(late.reason).toBe("cancelled");
    expect(late.request.toCoachId).toBe("");
  });

  it("a request that is gone is reported as gone, not crashed into", () => {
    expect(settleCover(list(), "nope", "approved", { now }))
      .toMatchObject({ changed: false, reason: "gone", request: null });
  });

  it("refuses a status that is not a settle", () => {
    expect(settleCover(list(), "r1", "open", { now }).changed).toBe(false);
    expect(settleCover(list(), "r1", "rejected", { now }).changed).toBe(false);   // gone as of S33
  });

  it("every settle status it accepts is one the database allows", () => {
    for (const st of ["approved", "cancelled"]) {
      expect(COVER_STATUSES).toContain(st);
      expect(settleCover(list(), "r1", st, { now }).changed).toBe(true);
    }
  });

  it("does not mutate the list it was given", () => {
    const l = list();
    settleCover(l, "r1", "approved", { now, coachId: "c-dev" });
    expect(l[0].status).toBe("open");
    expect(l[0].toCoachId).toBe("");
  });
});

describe("the board", () => {
  const mon = raise({ id: "r1" });
  const wed = raise({ id: "r2" }, occ({ ruleId: "uc2", name: "Engine Room", day: "Wed",
                                        slot: "18:00", date: "2026-08-26",
                                        startsAt: "2026-08-26T18:00:00.000Z" }));
  const early = raise({ id: "r3" }, occ({ ruleId: "uc3", name: "Barbell Club", day: "Wed",
                                          slot: "06:00", date: "2026-08-26",
                                          startsAt: "2026-08-26T06:00:00.000Z" }));
  const taken = settleCover([raise({ id: "r4" }, occ({ date: "2026-08-25" }))],
                            "r4", "approved", { now, coachId: "c-dev" }).list[0];
  const all = [wed, mon, early, taken];

  it("shows only what still has nobody, soonest first", () => {
    expect(openCovers(all).map(r => r.id)).toEqual(["r1", "r3", "r2"]);
  });

  it("🔴 a claimed class is off the board", () => {
    expect(openCovers(all).map(r => r.id)).not.toContain("r4");
  });

  it("can be bounded to a date range", () => {
    expect(openCovers(all, { from: "2026-08-26" }).map(r => r.id)).toEqual(["r3", "r2"]);
    expect(openCovers(all, { to: "2026-08-24" }).map(r => r.id)).toEqual(["r1"]);
  });

  it("drops a legacy request that has no date at all", () => {
    // Rows raised before S33 carry no `classDate`. They cannot be placed on a
    // board that is ordered by day, and inventing one would be a guess.
    expect(openCovers([{ id: "old", status: "open", classLabel: "x" }])).toEqual([]);
  });

  it("finds the open ask against one dated occurrence, and only that one", () => {
    expect(openCoverForOccurrence(all, "uc1", "2026-08-24").id).toBe("r1");
    // 🔴 The SAME class a day later is a different thing to cover.
    expect(openCoverForOccurrence(all, "uc1", "2026-08-25")).toBe(null);
    expect(requestsForOccurrence(all, "uc1", "2026-08-25").map(r => r.id)).toEqual(["r4"]);
  });

  it("isOpen means open", () => {
    expect(isOpen(mon)).toBe(true);
    expect(isOpen(taken)).toBe(false);
  });
});

describe("🔴 applyCovers — a cover lasts exactly one day", () => {
  const week = [
    { ruleId: "uc1", name: "Strength Lab", coachName: "Mara", day: "Mon", slot: "06:00",
      startsAt: "2026-08-24T06:00:00.000Z", date: "2026-08-24" },
    { ruleId: "uc1", name: "Strength Lab", coachName: "Mara", day: "Mon", slot: "06:00",
      startsAt: "2026-08-31T06:00:00.000Z", date: "2026-08-31" },
    { ruleId: "uc3", name: "Barbell Club", coachName: "Dev", day: "Mon", slot: "06:00",
      startsAt: "2026-08-24T06:00:00.000Z", date: "2026-08-24" },
  ];
  const covered = settleCover([raise()], "r1", "approved", { now, coachId: "c-dev" }).list;

  it("moves the covered occurrence to the coach who claimed it", () => {
    const out = applyCovers(week, covered, ROSTER);
    expect(out[0].coachName).toBe("Dev");
    expect(out[0].coveringFor).toBe("Mara");
    expect(out[0].coverId).toBe("r1");
  });

  it("🔴 and leaves the SAME class the following week alone", () => {
    // The entire point. Before S33 approving a cover rewrote the rule, so this
    // occurrence changed hands too — permanently.
    const out = applyCovers(week, covered, ROSTER);
    expect(out[1].date).toBe("2026-08-31");
    expect(out[1].coachName).toBe("Mara");
    expect(out[1].coveringFor).toBeUndefined();
  });

  it("🔴 and does not touch a different class on the same day", () => {
    expect(applyCovers(week, covered, ROSTER)[2].coachName).toBe("Dev");
    expect(applyCovers(week, covered, ROSTER)[2].coveringFor).toBeUndefined();
  });

  it("ignores a cover nobody has claimed", () => {
    const out = applyCovers(week, [raise()], ROSTER);
    expect(out[0].coachName).toBe("Mara");
  });

  it("ignores a withdrawn one", () => {
    const pulled = settleCover([raise()], "r1", "cancelled", { now }).list;
    expect(applyCovers(week, pulled, ROSTER)[0].coachName).toBe("Mara");
  });

  it("🔴 leaves the original name when the coverer is no longer on the roster", () => {
    // The class still happened and somebody still taught it. Blanking the name
    // would quietly tell the gym it had no coach.
    const out = applyCovers(week, covered, [ROSTER[0]]);      // Dev removed
    expect(out[0].coachName).toBe("Mara");
  });

  it("returns the occurrences untouched when there is nothing to apply", () => {
    expect(applyCovers(week, [], ROSTER)).toBe(week);
    expect(applyCovers(week, null, ROSTER)).toBe(week);
  });

  it("finds the approved cover behind an occurrence", () => {
    expect(coverForOccurrence(covered, "uc1", "2026-08-24").toCoachId).toBe("c-dev");
    expect(coverForOccurrence(covered, "uc1", "2026-08-31")).toBe(null);
  });
});

describe("🔴 deliveryTruth — the product may not say Sent when nothing was sent", () => {
  it("with no server, a request reaches ONE DEVICE — the shipped state today", () => {
    expect(deliveryTruth({ serverConfigured: false, reachableCoaches: 3 })).toBe("device");
  });

  it("with a server but no coach storage, it is still one device", () => {
    expect(deliveryTruth({ serverConfigured: true, storageReady: false, reachableCoaches: 3 }))
      .toBe("unstored");
  });

  it("🔴 with a board nobody can open, nothing is reached", () => {
    expect(deliveryTruth({ serverConfigured: true, reachableCoaches: 0 })).toBe("unreached");
  });

  it("one linked coach is enough to make it waiting — a weaker claim, deliberately", () => {
    expect(deliveryTruth({ serverConfigured: true, reachableCoaches: 1 })).toBe("waiting");
  });

  it("🔴 no state it can return is the word 'sent'", () => {
    const states = [
      deliveryTruth({ serverConfigured: false }),
      deliveryTruth({ serverConfigured: true, storageReady: false }),
      deliveryTruth({ serverConfigured: true, reachableCoaches: 0 }),
      deliveryTruth({ serverConfigured: true, reachableCoaches: 2 }),
    ];
    expect(new Set(states).size).toBe(4);
    for (const s of states) expect(s).not.toMatch(/sent|delivered|notified/i);
  });

  it("counts who could open the board through coachReach, not by hand", () => {
    expect(reachableCoaches(ROSTER)).toBe(1);
    expect(reachableCoaches([])).toBe(0);
    expect(reachableCoaches(null)).toBe(0);
  });
});
