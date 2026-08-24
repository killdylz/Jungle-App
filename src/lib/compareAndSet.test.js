import { describe, it, expect } from "vitest";
import { compareAndSet, CAS_WON, CAS_LOST, CAS_FAIL } from "./compareAndSet.js";

// ─── S31 §2.3 ───────────────────────────────────────────────────────────────
//
// 🔴 EVERY TEST HERE IS AGAINST A FAKE. `cover_requests` does not exist (0010 is
// unapplied, DYLAN-QUEUE A15), so there is no server to check the real contract
// against. What these prove is that the primitive behaves correctly GIVEN the
// two documented PostgREST behaviours named in compareAndSet.js — they do not
// prove those behaviours. That distinction is the whole reason the module says
// it has never made a real request.
//
// The fake models one table of rows and the PostgREST semantics that matter:
// `update` applies to rows matching every `.eq()`, and `.select()` returns
// exactly the rows that changed.
function fakeClient(rows, { failWith = null } = {}) {
  const calls = [];
  return {
    calls,
    rows,
    from(table) {
      const filters = [];
      let patch = null;
      const q = {
        update(p) { patch = p; return q; },
        eq(col, val) { filters.push([col, val]); return q; },
        async select() {
          calls.push({ table, patch, filters: [...filters] });
          if (failWith) return { data: null, error: { message: failWith } };
          const hit = rows.filter(r => filters.every(([c, v]) => r[c] === v));
          for (const r of hit) Object.assign(r, patch);
          return { data: hit, error: null };
        },
      };
      return q;
    },
  };
}

const open = () => [{ id: "r1", status: "open", to_coach_id: "c2", note: "" }];

describe("compareAndSet — the win", () => {
  it("writes the patch and reports the row when the guard holds", async () => {
    const rows = open();
    const c = fakeClient(rows);
    const r = await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "approved" });
    expect(r.outcome).toBe(CAS_WON);
    expect(r.row.status).toBe("approved");
    expect(rows[0].status).toBe("approved");
  });

  it("🔴 sends the guard as a filter, not as part of the patch", async () => {
    const c = fakeClient(open());
    await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "approved" });
    // The whole primitive rests on this: the guard has to reach the server as a
    // WHERE clause. A guard folded into the patch would be an unconditional
    // write that merely looked conditional.
    expect(c.calls[0].filters).toEqual([["id", "r1"], ["status", "open"]]);
    expect(c.calls[0].patch).toEqual({ status: "approved" });
  });

  it("carries every column of a multi-column guard", async () => {
    const c = fakeClient(open());
    await compareAndSet(c, "cover_requests", "r1",
      { status: "open", to_coach_id: "c2" }, { status: "approved" });
    expect(c.calls[0].filters).toEqual([["id", "r1"], ["status", "open"], ["to_coach_id", "c2"]]);
  });
});

// 🔴 THE BRANCH THIS PRIMITIVE EXISTS FOR. §2.3 requires the LOSING path to be
// driven, because the winning path is what an unconditional upsert already does
// — losing is the only behaviour that is actually new.
describe("🔴 compareAndSet — the loss, which is the point", () => {
  it("reports LOST, not won, when another writer already settled the row", async () => {
    const rows = [{ id: "r1", status: "approved", to_coach_id: "c2" }];   // somebody got there first
    const c = fakeClient(rows);
    const r = await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "rejected" });
    expect(r.outcome).toBe(CAS_LOST);
    expect(r.row).toBeNull();
  });

  it("🔴 leaves the row EXACTLY as the winner left it", async () => {
    const rows = [{ id: "r1", status: "approved", to_coach_id: "c2" }];
    await compareAndSet(fakeClient(rows), "cover_requests", "r1", { status: "open" }, { status: "rejected" });
    // The failure this guards is a second approver overwriting the first and
    // being shown a settlement that did not happen.
    expect(rows[0].status).toBe("approved");
  });

  it("🔴 a loss is NOT an error — they need different words on screen", async () => {
    const rows = [{ id: "r1", status: "cancelled" }];
    const r = await compareAndSet(fakeClient(rows), "cover_requests", "r1", { status: "open" }, { status: "approved" });
    expect(r.outcome).toBe(CAS_LOST);
    expect(r.error).toBe("");
  });

  it("reports LOST for a row that is not there at all", async () => {
    const r = await compareAndSet(fakeClient([]), "cover_requests", "gone", { status: "open" }, { status: "approved" });
    expect(r.outcome).toBe(CAS_LOST);
  });
});

describe("compareAndSet — the refusals", () => {
  it("🔴 refuses an empty guard — that is an unconditional update in disguise", async () => {
    const rows = open();
    const r = await compareAndSet(fakeClient(rows), "cover_requests", "r1", {}, { status: "approved" });
    expect(r.outcome).toBe(CAS_FAIL);
    expect(r.error).toMatch(/guard/);
    // And it did not write anything on the way to refusing.
    expect(rows[0].status).toBe("open");
  });

  it("refuses a missing client or id rather than throwing", async () => {
    expect((await compareAndSet(null, "t", "r1", { status: "open" }, {})).outcome).toBe(CAS_FAIL);
    expect((await compareAndSet(fakeClient([]), "t", "", { status: "open" }, {})).outcome).toBe(CAS_FAIL);
  });

  it("reports a transport failure as FAILED, never as a loss", async () => {
    const c = fakeClient(open(), { failWith: "network is unreachable" });
    const r = await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "approved" });
    expect(r.outcome).toBe(CAS_FAIL);
    expect(r.error).toMatch(/unreachable/);
  });

  it("survives a client that throws instead of resolving", async () => {
    const throwing = { from() { throw new Error("client exploded"); } };
    const r = await compareAndSet(throwing, "t", "r1", { status: "open" }, {});
    expect(r.outcome).toBe(CAS_FAIL);
    expect(r.error).toMatch(/exploded/);
  });

  it("🔴 refuses when `id` matched more than one row — that is a schema fault", async () => {
    // Two rows sharing an id means no primary key. Calling that a win would hand
    // back one arbitrary row out of several it silently changed.
    const rows = [{ id: "r1", status: "open" }, { id: "r1", status: "open" }];
    const r = await compareAndSet(fakeClient(rows), "cover_requests", "r1", { status: "open" }, { status: "approved" });
    expect(r.outcome).toBe(CAS_FAIL);
    expect(r.error).toMatch(/not a unique key/);
  });
});

// The scenario 0010's schema comments describe, end to end: two coaches approve
// the same request. Exactly one wins, and the loser is TOLD.
describe("🔴 two coaches approving the same cover request", () => {
  it("settles once, and the second is told it already went", async () => {
    const rows = open();
    const c = fakeClient(rows);
    const first  = await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "approved" });
    const second = await compareAndSet(c, "cover_requests", "r1", { status: "open" }, { status: "rejected" });

    expect(first.outcome).toBe(CAS_WON);
    expect(second.outcome).toBe(CAS_LOST);
    expect(rows[0].status).toBe("approved");
    // POSITIVE CONTROL: the second call really was attempted, so "lost" is not
    // passing because nothing ran.
    expect(c.calls).toHaveLength(2);
  });
});
