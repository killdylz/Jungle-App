import { describe, it, expect, vi } from "vitest";
import { publishSummary, fetchSummary } from "./summaryApi.js";

// ─── The half of N4 the e2e suite cannot reach ───────────────────────────────
//
// e2e runs against the credential-less local build, where supabaseEnabled is
// false — so the only publish path a browser test can drive is the honest
// "not available offline" one. Everything that happens when a studio IS
// configured (what gets sent, what comes back, what a failure looks like) has
// to be pinned here, with the client injected.
//
// That injection is why publishSummary takes `supabase` and `supabaseEnabled`
// as arguments rather than importing them: a module-level import would make
// this file need a mock of the whole auth client, and the member read path
// would have gained a dependency it has no use for.

const CI = "11111111-2222-4333-8444-555555555555";

const stages = [
  { id: "a", type: "warmup", name: "Warm-Up", dur: 300, tracks: [{ uri: "spotify:x" }],
    exercises: [{ n: "Light Jog", r: "5 min" }] },
  { id: "b", type: "circuit", name: "Circuit", dur: 600,
    exercises: [{ n: "Burpee Complex", s: "3", r: "10", rest: "30s" }] },
];

// A stand-in for supabase.functions.invoke that records what it was called with.
function fakeSupabase(response) {
  const calls = [];
  return {
    calls,
    client: {
      functions: {
        invoke: async (name, opts) => { calls.push({ name, ...opts }); return response; },
      },
    },
  };
}

describe("publishSummary", () => {
  it("sends the allow-listed content and the brand snapshot, and returns a fragment link", async () => {
    const fake = fakeSupabase({ data: { token: "v1.aaa.bbb", expiresAt: 1_900_000_000, stored: true }, error: null });
    const r = await publishSummary({
      classInstanceId: CI, stages, sessionName: "Thursday Engine", gymName: "The Garage",
      supabase: fake.client, supabaseEnabled: true,
      origin: "https://killdylz.github.io", basePath: "/Jungle-App/",
    });

    expect(r.ok).toBe(true);
    expect(r.stored).toBe(true);
    // The exact string a coach hands out. The fragment, not the query string —
    // pinned here as well as in classToken.test.js because this is the one a
    // human copies.
    expect(r.url).toBe("https://killdylz.github.io/Jungle-App/#s=v1.aaa.bbb");
    expect(r.url).not.toContain("?");

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.name).toBe("summary-token");
    expect(call.body.classInstanceId).toBe(CI);
    // The runner's own state must not travel: `tracks` and `id` were on the
    // input stages, so their absence here is a real assertion.
    const sent = JSON.stringify(call.body.content);
    expect(sent).not.toContain("spotify:x");
    expect(sent).not.toContain("tracks");
    expect(call.body.content.stages[1].exercises[0].n).toBe("Burpee Complex");
    expect(call.body.brand.gymName).toBe("The Garage");
  });

  it("passes stored:false through, so the coach is told the link will be thin", async () => {
    // What comes back before migration 0009 has been run. A link that works but
    // shows no movements is not a failure, and it is not a success either.
    const fake = fakeSupabase({ data: { token: "v1.aaa.bbb", stored: false }, error: null });
    const r = await publishSummary({ classInstanceId: CI, stages, sessionName: "X", supabase: fake.client, supabaseEnabled: true });
    expect(r.ok).toBe(true);
    expect(r.stored).toBe(false);
  });

  it("refuses to mint a link for a class with no movements", async () => {
    const fake = fakeSupabase({ data: { token: "nope" }, error: null });
    const r = await publishSummary({
      classInstanceId: CI, stages: [{ name: "Empty", dur: 300, exercises: [] }],
      sessionName: "X", supabase: fake.client, supabaseEnabled: true,
    });
    expect(r).toEqual({ ok: false, reason: "empty" });
    // And it did not call the function — a link nobody should share is not worth
    // a round trip, and would leave an empty published row behind.
    expect(fake.calls).toHaveLength(0);
  });

  it("says offline rather than failing obscurely when the studio has no server", async () => {
    expect(await publishSummary({ classInstanceId: CI, stages, supabaseEnabled: false }))
      .toEqual({ ok: false, reason: "offline-only" });
    expect(await publishSummary({ classInstanceId: CI, stages, supabase: null, supabaseEnabled: true }))
      .toEqual({ ok: false, reason: "offline-only" });
  });

  it("reports a function error instead of handing back a broken link", async () => {
    const withError = fakeSupabase({ data: null, error: { message: "JUNGLE_SUMMARY_SECRET not set" } });
    const a = await publishSummary({ classInstanceId: CI, stages, sessionName: "X", supabase: withError.client, supabaseEnabled: true });
    expect(a.ok).toBe(false);
    expect(a.reason).toBe("failed");
    expect(a.detail).toContain("SUMMARY_SECRET");

    // A 200 with no token is still a failure, and used to be the easiest thing
    // to mistake for success.
    const noToken = fakeSupabase({ data: { error: "Class not found" }, error: null });
    const b = await publishSummary({ classInstanceId: CI, stages, sessionName: "X", supabase: noToken.client, supabaseEnabled: true });
    expect(b.ok).toBe(false);
    expect(b.detail).toBe("Class not found");
  });

  it("survives the client throwing", async () => {
    const thrower = { functions: { invoke: async () => { throw new Error("network down"); } } };
    const r = await publishSummary({ classInstanceId: CI, stages, sessionName: "X", supabase: thrower, supabaseEnabled: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("failed");
  });
});

describe("fetchSummary", () => {
  const ok = (body) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  const bad = (status, body) => vi.fn(async () => ({ ok: false, status, json: async () => body }));

  it("posts the token in the body, never in the URL", async () => {
    const f = ok({ gym: { name: "The Garage" } });
    await fetchSummary("v1.aaa.bbb", f);
    const [url, init] = f.mock.calls[0];
    expect(url).not.toContain("v1.aaa.bbb");
    expect(url).not.toContain("?");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: "v1.aaa.bbb" });
  });

  it("returns the payload on success", async () => {
    const r = await fetchSummary("t", ok({ gym: { name: "The Garage" }, content: { title: "X" } }));
    expect(r.ok).toBe(true);
    expect(r.gym.name).toBe("The Garage");
  });

  it("carries the token verdict through from a 401", async () => {
    for (const reason of ["expired", "bad-signature", "malformed", "bad-payload"]) {
      expect(await fetchSummary("t", bad(401, { error: "invalid", reason })))
        .toEqual({ ok: false, reason });
    }
    // A 401 with no reason still has to say something.
    expect((await fetchSummary("t", bad(401, {}))).reason).toBe("invalid");
  });

  it("distinguishes a deleted class from a bad link", async () => {
    expect(await fetchSummary("t", bad(404, { error: "not-found" }))).toEqual({ ok: false, reason: "not-found" });
  });

  it("calls a dropped connection a network problem, not an invalid link", async () => {
    // These are the two a member can actually act on, and telling someone their
    // link is invalid when their train went into a tunnel is the wrong advice.
    const thrower = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await fetchSummary("t", thrower)).toEqual({ ok: false, reason: "network" });

    const r = await fetchSummary("t", bad(500, { error: "boom" }));
    expect(r.reason).toBe("network");
    expect(r.detail).toBe("boom");
  });

  it("does not call the server for an empty token", async () => {
    const f = ok({});
    expect(await fetchSummary("", f)).toEqual({ ok: false, reason: "malformed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats a 200 that is not JSON as a network problem", async () => {
    const html = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } }));
    expect(await fetchSummary("t", html)).toEqual({ ok: false, reason: "network" });
  });
});
