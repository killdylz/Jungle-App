import { describe, it, expect } from "vitest";
import {
  signClassToken, verifyClassToken, summaryUrl, tokenFromFragment,
  TOKEN_VERSION, DEFAULT_TTL_SEC, MAX_TTL_SEC,
} from "./classToken.js";

// ─── The token is the only thing standing between a URL and a gym's data ─────
//
// Everything else in N4 is a rendering problem. This file is the security
// boundary, so it is tested against a SECOND, independent implementation of the
// format (below) rather than only against itself. A round-trip test proves
// sign and verify agree with each other — including agreeing on something
// wrong. Re-deriving the signature from the spec catches the case where both
// halves drifted together.

const SECRET = "test-secret-do-not-use-anywhere-real";
const CI  = "11111111-2222-4333-8444-555555555555";
const GYM = "99999999-8888-4777-8666-555555555555";
const T0  = 1_800_000_000_000;   // a fixed instant; every test states its own offsets

// An independent HMAC, written from the format comment rather than from the
// implementation: base64url( HMAC-SHA256( "v1." + payloadB64 ) ).
const b64u = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function independentSign(payloadObj, secret = SECRET) {
  const payload = b64u(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${TOKEN_VERSION}.${payload}`)));
  return `${TOKEN_VERSION}.${payload}.${b64u(sig)}`;
}

describe("classToken — format", () => {
  it("round-trips the class and gym it was minted for", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    const r = await verifyClassToken(token, SECRET, T0);
    expect(r.ok).toBe(true);
    expect(r.classInstanceId).toBe(CI);
    expect(r.gymId).toBe(GYM);
  });

  it("matches a signature derived independently from the documented format", async () => {
    const exp = Math.floor(T0 / 1000) + DEFAULT_TTL_SEC;
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    expect(token).toBe(await independentSign({ c: CI, g: GYM, e: exp }));
  });

  it("is URL-safe: no padding, no + or / in any segment", async () => {
    // Minted across many ids so the base64 alphabet is actually exercised —
    // a single sample can miss `+` and `/` entirely by luck.
    for (let i = 0; i < 40; i++) {
      const { token } = await signClassToken({
        classInstanceId: `${CI.slice(0, -2)}${String(i).padStart(2, "0")}`,
        gymId: GYM, secret: SECRET, now: T0 + i * 1000,
      });
      expect(token).not.toMatch(/[+/=]/);
      expect(token.split(".")).toHaveLength(3);
    }
  });

  it("puts the expiry ttlSec into the future and reports it", async () => {
    const { token, expiresAt } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, ttlSec: 3600, now: T0 });
    expect(expiresAt).toBe(Math.floor(T0 / 1000) + 3600);
    expect((await verifyClassToken(token, SECRET, T0)).expiresAt).toBe(expiresAt);
  });

  it("clamps a ttl above the ceiling and below the floor", async () => {
    const hi = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, ttlSec: 10 * 365 * 24 * 3600, now: T0 });
    expect(hi.expiresAt).toBe(Math.floor(T0 / 1000) + MAX_TTL_SEC);
    const lo = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, ttlSec: 1, now: T0 });
    expect(lo.expiresAt).toBe(Math.floor(T0 / 1000) + 60);
  });

  it("refuses to mint a token that authorises nothing", async () => {
    await expect(signClassToken({ gymId: GYM, secret: SECRET })).rejects.toThrow(/required/);
    await expect(signClassToken({ classInstanceId: CI, secret: SECRET })).rejects.toThrow(/required/);
  });

  it("refuses to mint without a secret", async () => {
    await expect(signClassToken({ classInstanceId: CI, gymId: GYM, secret: "" })).rejects.toThrow(/secret/);
  });
});

describe("classToken — rejection", () => {
  it("rejects a payload edited after signing", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    const [v, payload, sig] = token.split(".");
    // Re-encode a payload pointing at a DIFFERENT gym — the attack this exists
    // to stop: one gym's link edited into a read of another gym's class.
    const forged = b64u(new TextEncoder().encode(JSON.stringify({ c: CI, g: "00000000-0000-4000-8000-000000000000", e: 9e9 })));
    expect(forged).not.toBe(payload);
    const r = await verifyClassToken(`${v}.${forged}.${sig}`, SECRET, T0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects a flipped signature", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    const [v, payload, sig] = token.split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const r = await verifyClassToken(`${v}.${payload}.${flipped}`, SECRET, T0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: "the-other-gyms-secret", now: T0 });
    const r = await verifyClassToken(token, SECRET, T0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });

  it("rejects an expired token, and accepts it one second earlier", async () => {
    const { token, expiresAt } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, ttlSec: 3600, now: T0 });
    const expMs = expiresAt * 1000;
    expect((await verifyClassToken(token, SECRET, expMs - 1000)).ok).toBe(true);
    const dead = await verifyClassToken(token, SECRET, expMs);
    expect(dead.ok).toBe(false);
    expect(dead.reason).toBe("expired");
    // The page tells a member WHEN it lapsed, so the expiry rides along.
    expect(dead.expiresAt).toBe(expiresAt);
  });

  it("reports bad-signature, never expired, for a forgery that has also lapsed", async () => {
    // Order matters: checking expiry first would let anyone probe whether a
    // guessed class id had ever existed by watching the reason change.
    const forged = await independentSign({ c: CI, g: GYM, e: Math.floor(T0 / 1000) - 10 }, "wrong-secret");
    expect((await verifyClassToken(forged, SECRET, T0)).reason).toBe("bad-signature");
  });

  it("rejects a correctly-signed token whose payload is the wrong shape", async () => {
    // Signature valid, contents nonsense. Guards the case where the secret
    // leaks into something that mints its own payloads, and the case where a
    // future version of this file writes a different shape.
    for (const body of [
      { c: 42, g: GYM, e: 9e9 },
      { c: CI, g: "", e: 9e9 },
      { c: CI, g: GYM, e: "soon" },
      { c: CI, g: GYM },
      {},
    ]) {
      const r = await verifyClassToken(await independentSign(body), SECRET, T0);
      expect(r.ok, JSON.stringify(body)).toBe(false);
      expect(r.reason, JSON.stringify(body)).toBe("bad-payload");
    }
  });

  it("returns malformed — never throws — for anything a URL can contain", async () => {
    // Each case pins its EXACT reason. An earlier version of this test accepted
    // any of the three failure reasons, which is every reason there is, so it
    // asserted nothing beyond ok===false and would have passed against a
    // verifier that had stopped checking the version prefix entirely.
    const junk = [
      ["", "malformed"], ["   ", "malformed"], ["abc", "malformed"],
      ["v1", "malformed"], ["v1.abc", "malformed"], ["a.b.c.d", "malformed"],
      [".", "malformed"], ["..", "malformed"],
      [`v2.${"x".repeat(20)}.${"y".repeat(20)}`, "malformed"],   // wrong version, caught before any crypto
      ["v1..sig", "malformed"], ["v1.payload.", "malformed"],
      ["v1.YWJj.!!!", "malformed"],                              // signature segment is not base64url
      // Garbage in the PAYLOAD is bad-signature, not malformed, and that is
      // correct: the payload is never decoded until the HMAC over it matches.
      ["v1.!!!not-base64!!!.zzz", "bad-signature"],
      ["v1.YWJj.YWJj", "bad-signature"],                         // well-formed, signed by nobody
      [null, "malformed"], [undefined, "malformed"], [12345, "malformed"],
      [{}, "malformed"], [[], "malformed"],
    ];
    for (const [t, reason] of junk) {
      const r = await verifyClassToken(t, SECRET, T0);
      expect(r.ok, String(t)).toBe(false);
      expect(r.reason, String(t)).toBe(reason);
    }
  });

  it("rejects rather than crashing when the verifier has no secret", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    const r = await verifyClassToken(token, "", T0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-signature");
  });
});

describe("summary link shape", () => {
  it("puts the token in the fragment, never the query string", () => {
    const url = summaryUrl("v1.aaa.bbb", "https://gym.example", "/Jungle-App/");
    expect(url).toBe("https://gym.example/Jungle-App/#s=v1.aaa.bbb");
    expect(url).not.toContain("?");
  });

  it("does not double the slash between origin and base path", () => {
    expect(summaryUrl("t", "https://x.test", "/Jungle-App/")).toBe("https://x.test/Jungle-App/#s=t");
    expect(summaryUrl("t", "https://x.test", "/")).toBe("https://x.test/#s=t");
  });

  it("reads the token back out of a fragment", () => {
    expect(tokenFromFragment("#s=v1.aaa.bbb")).toBe("v1.aaa.bbb");
    expect(tokenFromFragment("s=v1.aaa.bbb")).toBe("v1.aaa.bbb");
    expect(tokenFromFragment("#a=1&s=v1.aaa.bbb")).toBe("v1.aaa.bbb");
  });

  it("is empty for every fragment a staff visit produces", () => {
    for (const h of ["", "#", "#/", "#access_token=xyz", "#other=1", undefined, null]) {
      expect(tokenFromFragment(h), String(h)).toBe("");
    }
  });

  it("survives a round trip through a real URL", async () => {
    const { token } = await signClassToken({ classInstanceId: CI, gymId: GYM, secret: SECRET, now: T0 });
    const u = new URL(summaryUrl(token, "https://killdylz.github.io", "/Jungle-App/"));
    expect(tokenFromFragment(u.hash)).toBe(token);
    expect((await verifyClassToken(tokenFromFragment(u.hash), SECRET, T0)).ok).toBe(true);
  });
});
