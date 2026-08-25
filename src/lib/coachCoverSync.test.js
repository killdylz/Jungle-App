// ─── The roster and cover requests actually leaving the device (S32 §2.1) ─────
//
// 🔴 WHY THIS FILE MOCKS `../supabase.js` WHEN NO OTHER STORE TEST DOES.
// Every existing store test drives the PURE half — `_guardList`, `_deltaRows`,
// `_dueRetries` — precisely so it needs no server, and that was right while the
// decisions being pinned were local ones. The decisions in this session are not:
// "the second coach to approve is told they lost" is a claim about two clients
// meeting at Postgres, and it is unfalsifiable from one client's localStorage.
//
// ⚠️ SO READ WHAT THE FAKE DOES AND DOES NOT PROVE. It models PostgREST's
// documented contract — the two assumptions in `compareAndSet.js`'s header, plus
// `ignoreDuplicates` and a missing relation — and nothing else. It does NOT
// prove the contract is right; migration 0010 has never been applied, so nobody
// has run any of this against a real server. What it proves is that OUR code
// does the right thing GIVEN that contract, which is the half that is ours.
// `compareAndSet.js`'s header carries the same warning and it still stands.
//
// The one thing the fake models that a naive stub would not, and the reason it
// exists at all: an UPDATE with a guard is applied to the committed rows, so two
// callers racing the same row genuinely produce one winner and one empty result.
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── The fake server ─────────────────────────────────────────────────────────
const db = { tables: {}, absent: new Set(), calls: [], offline: false };

const missingTable = (t) => ({
  code: "PGRST205",
  message: `Could not find the table 'public.${t}' in the schema cache`,
});

function rowsOf(table) { return (db.tables[table] ||= []); }
function matches(row, filters) { return filters.every(([c, v]) => row[c] === v); }

function run(q) {
  db.calls.push({ table: q.table, op: q.op });
  // A dropped request, which is a different thing from a missing relation and
  // must not be read as one.
  if (db.offline) return { data: null, error: { code: "PGRST000", message: "TypeError: Failed to fetch" } };
  if (db.absent.has(q.table)) return { data: null, error: missingTable(q.table) };
  const rows = rowsOf(q.table);

  if (q.op === "select") return { data: rows.filter(r => matches(r, q.filters)).map(r => ({ ...r })), error: null };

  if (q.op === "upsert") {
    const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
    for (const r of incoming) {
      const i = rows.findIndex(x => x.id === r.id);
      // The property the cover path leans on: with ignoreDuplicates an insert
      // that collides is DROPPED, not merged. Without it, last writer wins.
      if (i >= 0) { if (!q.opts?.ignoreDuplicates) rows[i] = { ...rows[i], ...r }; }
      else rows.push({ ...r });
    }
    return { data: null, error: null };
  }

  if (q.op === "update") {
    // Applied to the committed rows, which is what makes the guard a real
    // mutual exclusion rather than a read-then-write with a gap in it.
    const hit = rows.filter(r => matches(r, q.filters));
    hit.forEach(r => Object.assign(r, q.payload));
    return { data: hit.map(r => ({ ...r })), error: null };
  }

  if (q.op === "delete") {
    db.tables[q.table] = rows.filter(r => !matches(r, q.filters));
    return { data: null, error: null };
  }
  return { data: null, error: null };
}

function from(table) {
  const q = { table, filters: [], op: "select", payload: null, opts: null };
  const api = {
    eq(c, v) { q.filters.push([c, v]); return api; },
    upsert(p, o) { q.op = "upsert"; q.payload = p; q.opts = o; return api; },
    update(p) { q.op = "update"; q.payload = p; return api; },
    delete() { q.op = "delete"; return api; },
    // Assumption 1: `.select()` after an update is what returns a representation.
    select() { if (q.op === "update") return Promise.resolve(run(q)); q.op = "select"; return api; },
    maybeSingle() { const r = run(q); return Promise.resolve({ data: (r.data || [])[0] || null, error: r.error }); },
    then(res, rej) { return Promise.resolve(run(q)).then(res, rej); },
  };
  return api;
}

vi.mock("../supabase.js", () => ({
  supabaseEnabled: true,
  supabase: { from: (t) => from(t) },
}));

const store = await import("./store.js");
const { deliveryTruth, makeCoverForOccurrence } = await import("./coverRequests.js");
const { classesAffectedBy } = await import("./coachAbsence.js");

// An occurrence as the schedule derives one — dated, which is what a cover is
// against as of S33.
const OCC = { ruleId: "uc1", name: "Strength Lab", coachName: "Mara",
              day: "Mon", slot: "06:00", date: "2026-08-24",
              startsAt: "2026-08-24T06:00:00.000Z" };

// A "device" is a fresh localStorage against the same server — which is exactly
// what a second phone is.
function newDevice() {
  localStorage.clear();
  store.connect({ gymId: "g1", userId: "u-me" });
}
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  db.tables = {}; db.absent = new Set(); db.calls = []; db.offline = false;
  newDevice();
});

describe("the roster leaves the device", () => {
  it("a coach added on one device arrives on another", async () => {
    store.addCoach("Mara");
    await flush();
    expect(rowsOf("coach_roster")).toHaveLength(1);

    newDevice();
    expect(store.getCoaches()).toEqual([]);          // the second phone starts empty
    const out = await store.hydrateCoachCover();
    expect(out.coaches.map(c => c.name)).toEqual(["Mara"]);
    expect(store.getCoaches()).toHaveLength(1);
  });

  it("availability survives the round trip as a grid, not as a blob", async () => {
    const { coach } = store.addCoach("Mara");
    store.updateCoach(coach.id, { availability: { Mon: ["06:00", "18:00"] } });
    await flush();

    newDevice();
    const out = await store.hydrateCoachCover();
    expect(out.coaches[0].availability).toEqual({ Mon: ["06:00", "18:00"] });
    // The stamp is half of what availability means, so it has to travel too.
    expect(out.coaches[0].availabilityAt).toBeTruthy();
  });

  it("a removed coach stays removed instead of coming back on the next hydrate", async () => {
    const { coach } = store.addCoach("Mara");
    await flush();
    store.removeCoach(coach.id);
    await flush();
    expect(rowsOf("coach_roster")).toHaveLength(0);

    const out = await store.hydrateCoachCover();
    expect(out.coaches).toEqual([]);
  });

  it("seeds the server from a roster that predates the sync layer", async () => {
    // A gym that has been using the roster locally: rows, no server copy.
    store.saveCoaches([{ id: "c-old", name: "Dev", aliases: [], userId: "", active: true,
                         availability: {}, availabilityAt: "" }]);
    await flush();
    db.tables.coach_roster = [];                     // as if it had never pushed

    await store.hydrateCoachCover();
    await flush();
    expect(rowsOf("coach_roster").map(r => r.name)).toEqual(["Dev"]);
    expect(store.getCoaches()).toHaveLength(1);      // and local is not flickered away
  });
});

describe("hydrate does not discard an edit the server has never seen", () => {
  it("keeps a local availability edit that never reached the server", async () => {
    const { coach } = store.addCoach("Mara");
    await flush();                                    // confirmed on the server

    // Somebody else's older copy is what the server holds...
    rowsOf("coach_roster")[0].availability = { Tue: ["09:00"] };
    // ...and this device has just ticked Thursday with the push not landing.
    db.absent.add("coach_roster");                    // the write cannot get out
    store.updateCoach(coach.id, { availability: { Thu: ["06:00"] } });
    await flush();
    db.absent.delete("coach_roster");

    const out = await store.hydrateCoachCover();
    expect(out.coaches[0].availability).toEqual({ Thu: ["06:00"] });
    await flush();
    // And it is not merely kept locally — it is pushed, so the other device gets it.
    expect(rowsOf("coach_roster")[0].availability).toEqual({ Thu: ["06:00"] });
  });

  // 🔴 THE CONTROL. Without this, the test above passes just as well for a
  // hydrate that always prefers local — which would be a different bug, not a fix.
  it("takes the server's newer copy when this device has nothing outstanding", async () => {
    const { coach } = store.addCoach("Mara");
    store.updateCoach(coach.id, { availability: { Mon: ["06:00"] } });
    await flush();                                    // everything confirmed

    // The other coach edits their grid on their own phone.
    rowsOf("coach_roster")[0].availability = { Fri: ["19:30"] };

    const out = await store.hydrateCoachCover();
    expect(out.coaches[0].availability).toEqual({ Fri: ["19:30"] });
  });
});

describe("an absence leaves the device (S33)", () => {
  it("a coach's away dates arrive on another device", async () => {
    const mara = store.addCoach("Mara").coach;
    store.addAbsence({ coachId: mara.id, from: "2026-08-24", to: "2026-08-28", note: "leave" });
    await flush();
    expect(rowsOf("coach_absences")).toHaveLength(1);
    // 🔴 The dates travel as DATES, not as instants — the whole reason the column
    // is `date`. A timestamp would make the answer depend on where the reader is.
    expect(rowsOf("coach_absences")[0].from_date).toBe("2026-08-24");
    expect(rowsOf("coach_absences")[0].to_date).toBe("2026-08-28");

    newDevice();
    const out = await store.hydrateCoachCover();
    expect(out.absences).toHaveLength(1);
    expect(out.absences[0]).toMatchObject({ from: "2026-08-24", to: "2026-08-28", note: "leave" });
    expect(store.getAbsences()).toHaveLength(1);
  });

  it("🔴 withdrawing one updates it rather than deleting it", async () => {
    // The covers already raised against an absence point at its id. Deleting the
    // row would leave them pointing at nothing.
    const mara = store.addCoach("Mara").coach;
    const { absence } = store.addAbsence({ coachId: mara.id, from: "2026-08-24", to: "2026-08-28" });
    await flush();
    await store.cancelAbsence(absence.id);
    await flush();

    expect(rowsOf("coach_absences")).toHaveLength(1);
    expect(rowsOf("coach_absences")[0].cancelled_at).toBeTruthy();
    newDevice();
    const out = await store.hydrateCoachCover();
    expect(out.absences[0].cancelledAt).toBeTruthy();
  });

  it("a range the rules refuse is never written anywhere", async () => {
    const mara = store.addCoach("Mara").coach;
    const r = store.addAbsence({ coachId: mara.id, from: "2026-08-28", to: "2026-08-24" });
    await flush();
    expect(r.absence).toBe(null);
    expect(store.getAbsences()).toEqual([]);
    expect(rowsOf("coach_absences")).toHaveLength(0);
  });

  it("🔴 keeps a local absence the server has an older copy of", async () => {
    const mara = store.addCoach("Mara").coach;
    const { absence } = store.addAbsence({ coachId: mara.id, from: "2026-08-24", to: "2026-08-28" });
    await flush();                                       // confirmed

    rowsOf("coach_absences")[0].to_date = "2026-08-25";   // an older copy on the server
    db.absent.add("coach_absences");                      // this device's edit cannot get out
    await store.cancelAbsence(absence.id);
    await flush();
    db.absent.delete("coach_absences");

    const out = await store.hydrateCoachCover();
    expect(out.absences[0].cancelledAt).toBeTruthy();     // the local edit survived
    await flush();
    expect(rowsOf("coach_absences")[0].cancelled_at).toBeTruthy();   // and was pushed
  });

  it("takes the server's copy when this device has nothing outstanding", async () => {
    // THE CONTROL for the test above.
    const mara = store.addCoach("Mara").coach;
    store.addAbsence({ coachId: mara.id, from: "2026-08-24", to: "2026-08-28" });
    await flush();

    rowsOf("coach_absences")[0].to_date = "2026-09-04";   // edited on the other phone
    const out = await store.hydrateCoachCover();
    expect(out.absences[0].to).toBe("2026-09-04");
  });
});

describe("🔴 an absence raises the covers, and withdrawing it takes them back", () => {
  // Mara teaches Mon 06:00 and Wed 18:00; Dev teaches Mon 06:00 too.
  const RULES = [
    { id: "uc1", name: "Strength Lab", coach: "Mara", day: "Mon", slot: "06:00", repeat: "weekly" },
    { id: "uc2", name: "Engine Room",  coach: "Mara", day: "Wed", slot: "18:00", repeat: "weekly" },
    { id: "uc3", name: "Barbell Club", coach: "Dev",  day: "Mon", slot: "06:00", repeat: "weekly" },
  ];
  const AWAY = { from: "2026-08-24", to: "2026-08-28" };
  // ⚠️ A CLOCK BEFORE THE FIXTURE'S DATES. `raiseCoversForAbsence` skips a class
  // that has already started, so with the real clock these fixtures would raise
  // nothing at all and every assertion here would be about an empty list. Passed
  // explicitly rather than faked globally: a fixed `Date.now()` collides the ids
  // minted from it, which is the documented trap.
  const BEFORE = Date.parse("2026-08-20T00:00:00Z");

  async function awayWeek() {
    const mara = store.addCoach("Mara").coach;
    store.addCoach("Dev");
    const { absence } = store.addAbsence({ coachId: mara.id, ...AWAY });
    const hit = classesAffectedBy(RULES, store.getCoaches().find(c => c.id === mara.id), absence);
    const r = store.raiseCoversForAbsence(absence, hit, { now: BEFORE });
    await flush();
    return { mara, absence, hit, created: r.created };
  }

  it("puts every class the coach is away from on the board, dated", async () => {
    const { created } = await awayWeek();
    expect(created.map(r => `${r.classDate} ${r.classLabel}`))
      .toEqual(["2026-08-24 Strength Lab", "2026-08-26 Engine Room"]);
    // 🔴 THE CONTROL: not Dev's class, on the same day and slot as one of them.
    expect(created.map(r => r.classLabel)).not.toContain("Barbell Club");
    expect(rowsOf("cover_requests")).toHaveLength(2);
  });

  it("is idempotent — running it again puts nothing on the board twice", async () => {
    const { absence, hit } = await awayWeek();
    const again = store.raiseCoversForAbsence(absence, hit, { now: BEFORE });
    expect(again.created).toEqual([]);
    expect(store.getCoverRequests()).toHaveLength(2);
  });

  it("withdrawing the absence takes the unclaimed asks back", async () => {
    const { absence } = await awayWeek();
    const r = await store.cancelAbsence(absence.id);
    await flush();
    expect(r.withdrawn).toBe(2);
    expect(r.kept).toBe(0);
    expect(store.getCoverRequests().every(q => q.status === "cancelled")).toBe(true);
  });

  it("🔴 but leaves a cover somebody already agreed to take", async () => {
    // "Mara is back after all" cancels the QUESTION. It does not cancel Dev
    // having agreed to teach Wednesday and planned their week around it.
    const { absence } = await awayWeek();
    const dev = store.getCoaches().find(c => c.name === "Dev");
    const wed = store.getCoverRequests().find(q => q.classLabel === "Engine Room");
    await store.settleCoverRequest(wed.id, "approved", { coachId: dev.id });

    const r = await store.cancelAbsence(absence.id);
    await flush();
    expect(r.withdrawn).toBe(1);
    expect(r.kept).toBe(1);
    const after = store.getCoverRequests().find(q => q.id === wed.id);
    expect(after.status).toBe("approved");
    expect(after.toCoachId).toBe(dev.id);
  });

  it("a coach who withdrew one ask can raise it again", async () => {
    const { absence, hit } = await awayWeek();
    const mon = store.getCoverRequests().find(q => q.classLabel === "Strength Lab");
    await store.settleCoverRequest(mon.id, "cancelled");
    const again = store.raiseCoversForAbsence(absence, hit, { now: BEFORE });
    expect(again.created.map(r => r.classLabel)).toEqual(["Strength Lab"]);
  });

  it("🔴 does not ask anyone to cover a class that has already been taught", async () => {
    // Found by rendering the panel on a Tuesday: a coach marking themselves away
    // Mon–Fri got MONDAY's 06:00 put on the board. An ask nobody can act on is
    // worse than no ask — it sits there, counts against the absence, and teaches
    // people to ignore the board.
    const { absence, hit } = await awayWeek();
    store.saveCoverRequests([]);                       // clear what awayWeek raised

    // Wednesday lunchtime: Monday is gone, Wednesday 18:00 has not started.
    const wedNoon = Date.parse("2026-08-26T12:00:00Z");
    const r = store.raiseCoversForAbsence(absence, hit, { now: wedNoon });
    expect(r.created.map(q => q.classLabel)).toEqual(["Engine Room"]);
    // The absence itself still records the whole week — they WERE away Monday.
    expect(store.getAbsences()[0]).toMatchObject({ from: "2026-08-24", to: "2026-08-28" });
  });
});

describe("a cover request reaches the coach it was aimed at", () => {
  it("arrives on the other device, carrying the day it is for", async () => {
    const a = store.addCoach("Mara").coach;
    store.addCoach("Dev");
    await flush();
    store.addCoverRequest(makeCoverForOccurrence({ id: store.newId(), occurrence: OCC,
                                                   fromCoachId: a.id }));
    await flush();

    newDevice();
    const out = await store.hydrateCoachCover();
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0].classLabel).toBe("Strength Lab");
    expect(out.requests[0].classDate).toBe("2026-08-24");
    // 🔴 Nobody is covering it yet — it is on the board, not addressed to anyone.
    expect(out.requests[0].toCoachId).toBe("");
    expect(out.requests[0].status).toBe("open");
  });
});

describe("🔴 one approval per request, decided by the database", () => {
  let reqId, devId;

  async function twoDevicesHoldingTheSameOpenRequest() {
    const a = store.addCoach("Mara").coach;
    devId = store.addCoach("Dev").coach.id;
    reqId = store.newId();
    store.addCoverRequest(makeCoverForOccurrence({ id: reqId, occurrence: OCC, fromCoachId: a.id }));
    await flush();
    const deviceA = { coaches: store.getCoaches(), requests: store.getCoverRequests() };
    newDevice();
    await store.hydrateCoachCover();                  // device B, same open request
    return deviceA;
  }

  it("the winner is told it won and the loser is told what actually happened", async () => {
    const deviceA = await twoDevicesHoldingTheSameOpenRequest();

    // Device B claims it.
    const won = await store.settleCoverRequest(reqId, "approved", { coachId: devId });
    expect(won.changed).toBe(true);
    expect(won.where).toBe("server");
    expect(rowsOf("cover_requests")[0].status).toBe("approved");
    // 🔴 The claim wrote WHO is covering, through the same conditional update
    // that decided the race.
    expect(rowsOf("cover_requests")[0].to_coach_id).toBe(devId);

    // Device A, which still believes the class has nobody, tries to claim it too.
    newDevice();
    store.saveCoaches(deviceA.coaches);
    store.saveCoverRequests(deviceA.requests);
    expect(store.getCoverRequests()[0].status).toBe("open");

    const lost = await store.settleCoverRequest(reqId, "approved", { coachId: "c-someone-else" });
    expect(lost.changed).toBe(false);
    // Not just "you lost" — WHAT won, which is the fact the coach came for.
    expect(lost.reason).toBe("approved");
    // And the losing device adopts the truth rather than sitting on a stale open
    // — including WHO actually took it, which is the fact the coach came for.
    expect(store.getCoverRequests()[0].status).toBe("approved");
    expect(store.getCoverRequests()[0].toCoachId).toBe(devId);
    // 🔴 The server was not overwritten by the loser.
    expect(rowsOf("cover_requests")[0].status).toBe("approved");
  });

  it("records who settled it, so a shared tablet is not anonymous", async () => {
    await twoDevicesHoldingTheSameOpenRequest();
    await store.settleCoverRequest(reqId, "approved", { coachId: devId });
    expect(rowsOf("cover_requests")[0].settled_by).toBe("u-me");
    expect(rowsOf("cover_requests")[0].settled_at).toBeTruthy();
  });

  it("a settle that could not be confirmed is not recorded as a settle", async () => {
    await twoDevicesHoldingTheSameOpenRequest();
    db.absent.add("cover_requests");                  // stands in for any failed write

    const r = await store.settleCoverRequest(reqId, "approved", { coachId: devId });
    expect(r.changed).toBe(false);
    expect(r.reason).toBe("unconfirmed");
    // 🔴 THE PHANTOM APPROVAL. Local must not show an approval the server refused.
    expect(store.getCoverRequests()[0].status).toBe("open");
    expect(store.syncErrors().map(e => e.table)).toContain("cover_requests");
  });

  // 🔴 THE REGRESSION THIS DESIGN EXISTS TO PREVENT, and the reason
  // `_bgUpsertDelta` is not used for this table. A device holding a stale `open`
  // re-pushing its list must not be able to re-open a settled request.
  it("re-pushing a stale list cannot un-approve a settled request", async () => {
    const deviceA = await twoDevicesHoldingTheSameOpenRequest();
    await store.settleCoverRequest(reqId, "approved", { coachId: devId });
    expect(rowsOf("cover_requests")[0].status).toBe("approved");

    // Device A holds the stale `open`, and needs a FAILED WRITE OF ITS OWN before
    // the retry driver will touch this table at all.
    //
    // ⚠️ THIS SETUP IS THE TEST. Written the obvious way — stale list, call
    // `_retryNow`, assert the server is still approved — it passed against a
    // mapper with `ignoreDuplicates` REMOVED, because `_retryNow` only pushes
    // tables in the ledger and the ledger was empty. It asserted nothing and
    // said so in green. The positive control below is what stops that recurring.
    newDevice();
    store.saveCoaches(deviceA.coaches);
    store.saveCoverRequests(deviceA.requests);        // stale: says "open"
    db.absent.add("cover_requests");
    store.addCoverRequest(makeCoverForOccurrence({ id: store.newId(),
      occurrence: { ...OCC, ruleId: "uc9", date: "2026-08-31", startsAt: "2026-08-31T06:00:00.000Z" } }));
    await flush();
    expect(store.syncErrors().map(e => e.table)).toContain("cover_requests");
    db.absent.delete("cover_requests");

    const before = db.calls.length;
    store._retryNow({ force: true });
    await flush();

    // POSITIVE CONTROL: the pusher really ran, and really sent the whole list —
    // the new request landed on a server that had never seen it.
    const pushes = db.calls.slice(before).filter(c => c.table === "cover_requests" && c.op === "upsert");
    expect(pushes.length).toBeGreaterThan(0);
    expect(rowsOf("cover_requests")).toHaveLength(2);

    // 🔴 AND THE SETTLED ROW IS UNTOUCHED. This is the assertion; everything
    // above exists so that it is capable of failing.
    expect(rowsOf("cover_requests").find(r => r.id === reqId).status).toBe("approved");
  });
});

describe("a table the database has not got is not claimed as delivery", () => {
  it("the hydrate probe records the absence and the UI stops saying 'waiting'", async () => {
    db.absent.add("cover_requests");
    db.absent.add("coach_roster");
    db.absent.add("coach_absences");

    // Before the probe there is no evidence either way, and the honest default
    // is the optimistic one — a caller that has not looked cannot claim absence.
    expect(store.tableAbsent("cover_requests")).toBe(false);

    expect(await store.hydrateCoachCover()).toBe(null);
    expect(store.tableAbsent("cover_requests")).toBe(true);

    // 🔴 The claim the product used to make, and it was false for every gym with
    // credentials and no migration 0010.
    expect(deliveryTruth({ serverConfigured: true, reachableCoaches: 1 })).toBe("waiting");
    expect(deliveryTruth({ serverConfigured: true, reachableCoaches: 1,
                           storageReady: !store.tableAbsent("cover_requests") })).toBe("unstored");
  });

  it("falls back to settling on the device rather than refusing outright", async () => {
    db.absent.add("cover_requests");
    db.absent.add("coach_roster");
    db.absent.add("coach_absences");
    const b = store.addCoach("Dev").coach;
    const id = store.newId();
    store.addCoverRequest(makeCoverForOccurrence({ id, occurrence: OCC }));
    await store.hydrateCoachCover();                  // learns the table is absent

    const r = await store.settleCoverRequest(id, "approved", { coachId: b.id });
    expect(r.changed).toBe(true);
    expect(r.where).toBe("device");                   // exactly the S30 behaviour
    expect(store.getCoverRequests()[0].status).toBe("approved");
  });

  it("🔴 an outage does not un-learn that the table is missing", async () => {
    db.absent.add("cover_requests");
    db.absent.add("coach_roster");
    db.absent.add("coach_absences");
    await store.hydrateCoachCover();
    expect(store.tableAbsent("cover_requests")).toBe(true);

    // The gym's wifi drops. A failed request is NOT evidence that Dylan ran the
    // migration, and treating it as such would put "waiting for Dev to open
    // Jungle" back on screen for the length of the outage — a claim that was
    // false either way.
    db.offline = true;
    expect(await store.hydrateCoachCover()).toBe(null);
    db.offline = false;

    expect(store.tableAbsent("cover_requests")).toBe(true);
    expect(store.tableAbsent("coach_roster")).toBe(true);
  });

  it("clears the absence the moment a write succeeds", async () => {
    db.absent.add("coach_roster");
    store.addCoach("Mara");
    await flush();
    expect(store.tableAbsent("coach_roster")).toBe(true);

    db.absent.delete("coach_roster");                 // Dylan runs the migration
    store._retryNow({ force: true });
    await flush();
    expect(store.tableAbsent("coach_roster")).toBe(false);
    expect(rowsOf("coach_roster")).toHaveLength(1);
  });
});
