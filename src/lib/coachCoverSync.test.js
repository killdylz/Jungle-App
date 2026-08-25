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
const { deliveryTruth, makeCoverRequest } = await import("./coverRequests.js");

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

describe("a cover request reaches the coach it was aimed at", () => {
  const classRule = { id: "uc1", name: "Strength Lab", day: "Mon", slot: "06:00" };

  it("arrives on the other device", async () => {
    const a = store.addCoach("Mara").coach;
    const b = store.addCoach("Dev").coach;
    await flush();
    store.addCoverRequest(makeCoverRequest({ id: store.newId(), classRule,
                                             fromCoachId: a.id, toCoachId: b.id }));
    await flush();

    newDevice();
    const out = await store.hydrateCoachCover();
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0].classLabel).toBe("Strength Lab");
    expect(out.requests[0].toCoachId).toBe(b.id);
    expect(out.requests[0].status).toBe("open");
  });
});

describe("🔴 one approval per request, decided by the database", () => {
  const classRule = { id: "uc1", name: "Strength Lab", day: "Mon", slot: "06:00" };
  let reqId;

  async function twoDevicesHoldingTheSameOpenRequest() {
    const a = store.addCoach("Mara").coach;
    const b = store.addCoach("Dev").coach;
    reqId = store.newId();
    store.addCoverRequest(makeCoverRequest({ id: reqId, classRule, fromCoachId: a.id, toCoachId: b.id }));
    await flush();
    const deviceA = { coaches: store.getCoaches(), requests: store.getCoverRequests() };
    newDevice();
    await store.hydrateCoachCover();                  // device B, same open request
    return deviceA;
  }

  it("the winner is told it won and the loser is told what actually happened", async () => {
    const deviceA = await twoDevicesHoldingTheSameOpenRequest();

    // Device B approves.
    const won = await store.settleCoverRequest(reqId, "approved");
    expect(won.changed).toBe(true);
    expect(won.where).toBe("server");
    expect(rowsOf("cover_requests")[0].status).toBe("approved");

    // Device A, which still believes the request is open, rejects it.
    newDevice();
    store.saveCoaches(deviceA.coaches);
    store.saveCoverRequests(deviceA.requests);
    expect(store.getCoverRequests()[0].status).toBe("open");

    const lost = await store.settleCoverRequest(reqId, "rejected");
    expect(lost.changed).toBe(false);
    // Not just "you lost" — WHAT won, which is the fact the coach came for.
    expect(lost.reason).toBe("approved");
    // And the losing device adopts the truth rather than sitting on a stale open.
    expect(store.getCoverRequests()[0].status).toBe("approved");
    // 🔴 The server was not overwritten by the loser.
    expect(rowsOf("cover_requests")[0].status).toBe("approved");
  });

  it("records who settled it, so a shared tablet is not anonymous", async () => {
    await twoDevicesHoldingTheSameOpenRequest();
    await store.settleCoverRequest(reqId, "approved");
    expect(rowsOf("cover_requests")[0].settled_by).toBe("u-me");
    expect(rowsOf("cover_requests")[0].settled_at).toBeTruthy();
  });

  it("a settle that could not be confirmed is not recorded as a settle", async () => {
    await twoDevicesHoldingTheSameOpenRequest();
    db.absent.add("cover_requests");                  // stands in for any failed write

    const r = await store.settleCoverRequest(reqId, "approved");
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
    await store.settleCoverRequest(reqId, "approved");
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
    store.addCoverRequest(makeCoverRequest({ id: store.newId(), classRule, toCoachId: "c-x" }));
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

    // Before the probe there is no evidence either way, and the honest default
    // is the optimistic one — a caller that has not looked cannot claim absence.
    expect(store.tableAbsent("cover_requests")).toBe(false);

    expect(await store.hydrateCoachCover()).toBe(null);
    expect(store.tableAbsent("cover_requests")).toBe(true);

    const linked = { id: "c2", name: "Dev", userId: "u2" };
    // 🔴 The claim the product used to make, and it was false for every gym with
    // credentials and no migration 0010.
    expect(deliveryTruth({ serverConfigured: true, toCoach: linked })).toBe("waiting");
    expect(deliveryTruth({ serverConfigured: true, toCoach: linked,
                           storageReady: !store.tableAbsent("cover_requests") })).toBe("unstored");
  });

  it("falls back to settling on the device rather than refusing outright", async () => {
    db.absent.add("cover_requests");
    db.absent.add("coach_roster");
    const b = store.addCoach("Dev").coach;
    const id = store.newId();
    store.addCoverRequest(makeCoverRequest({ id, classRule: { id: "uc1", name: "Strength Lab" },
                                             toCoachId: b.id }));
    await store.hydrateCoachCover();                  // learns the table is absent

    const r = await store.settleCoverRequest(id, "approved");
    expect(r.changed).toBe(true);
    expect(r.where).toBe("device");                   // exactly the S30 behaviour
    expect(store.getCoverRequests()[0].status).toBe("approved");
  });

  it("🔴 an outage does not un-learn that the table is missing", async () => {
    db.absent.add("cover_requests");
    db.absent.add("coach_roster");
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
