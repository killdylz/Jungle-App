// ─── N4: the signed, class-scoped token behind the member summary link ───────
//
// WHAT THIS IS FOR. A member gets a link to the class they just did. There are
// no member accounts and there will not be any — Jungle records what was
// DELIVERED and never becomes the system a member books through (0007's comment
// on class_instances says this in schema). So the link itself has to carry the
// authorisation, and it has to carry it in a form the browser cannot forge.
//
// WHAT IS IN IT, AND WHAT IS DELIBERATELY NOT. The payload is
// {c: class_instance_id, g: gym_id, e: expiry}. It is CLASS-scoped, not
// member-scoped. That is the single decision that makes this safe to hand out:
// a leaked link exposes the gym's programming for one class — the same content
// the share card already publishes to Instagram — and cannot be walked back to
// a person, because no person is named in it. There is no member id, no name,
// no email, no attendance. A member-scoped token would be a PDPA surface in a
// URL, and URLs get pasted into group chats.
//
// WHY NOT JWT. A JWT names its own algorithm in a header the verifier reads,
// and "read the alg the attacker supplied" is the most reliably re-discovered
// vulnerability in the format's history. This has exactly one algorithm, it is
// not written down anywhere the token can influence, and the version prefix is
// checked as a literal. A format that cannot express `alg: none` cannot be
// confused into accepting it.
//
// WHY THE SIGNATURE COVERS THE ENCODED PAYLOAD. We sign the base64url text, not
// the object. Signing an object means agreeing on a canonical serialisation
// (key order, unicode escaping, number formatting), and every place two
// implementations can disagree about that is a place a signature silently stops
// matching. Verify re-signs the exact bytes it was given.
//
// ⚠️ THIS BLOCK IS MIRRORED into both Edge Functions, byte for byte, because a
// function pasted into the Supabase dashboard cannot import from src/. The
// copies are pinned equal by src/lib/classToken.mirror.test.js, which reads the
// real .ts files. Do not edit one copy alone — the test will fail, and if it
// somehow did not, the failure mode is every member link rejecting silently.

// ─── BEGIN SHARED TOKEN CORE ────────────────────────────────────────────────
// Mirrored verbatim in supabase/functions/summary-token/index.ts and
// supabase/functions/summary-read/index.ts. Plain ES module JS on purpose: it
// has to be valid TypeScript too, so no syntax that only one of them accepts.

export const TOKEN_VERSION = "v1";

// 14 days. The QR check-in design in LEGAL §4 uses 15 minutes, and that is
// right for a WRITE path where a photographed QR is an attack. This is a read
// of one class's programming, and a member who opens the link a week later on
// a different phone is the normal case, not the attack. Short enough that a
// link posted somewhere public goes stale within a billing cycle.
export const DEFAULT_TTL_SEC = 14 * 24 * 60 * 60;
// A ceiling, so a typo in a config value cannot mint a link that outlives the
// gym's relationship with the member.
export const MAX_TTL_SEC = 90 * 24 * 60 * 60;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64uFromBytes(bytes) {
  let s = "";
  // A loop rather than String.fromCharCode(...bytes): the spread form throws
  // RangeError on large inputs, and "works until the payload grows" is not a
  // property worth having in a signing path.
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64u(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret, usages) {
  if (!secret || typeof secret !== "string") throw new Error("token secret missing");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

/**
 * Mint a token for one class occurrence.
 * `now` is injectable so a test can put itself either side of an expiry without
 * sleeping — and so the caller, not the clock, decides what "now" means.
 */
export async function signClassToken({ classInstanceId, gymId, secret, ttlSec = DEFAULT_TTL_SEC, now = Date.now() }) {
  if (!classInstanceId || !gymId) throw new Error("classInstanceId and gymId are required");
  const ttl = Math.min(Math.max(Math.floor(Number(ttlSec) || 0), 60), MAX_TTL_SEC);
  const exp = Math.floor(now / 1000) + ttl;
  const payload = b64uFromBytes(enc.encode(JSON.stringify({ c: classInstanceId, g: gymId, e: exp })));
  const signing = `${TOKEN_VERSION}.${payload}`;
  const key = await hmacKey(secret, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(signing)));
  return { token: `${signing}.${b64uFromBytes(sig)}`, expiresAt: exp };
}

/**
 * Check a token and return what it authorises.
 *
 * Never throws — every malformed input a URL can contain resolves to
 * {ok:false, reason}. A verifier that throws on garbage is a verifier whose
 * callers end up wrapping it in a try/catch that swallows the real failures
 * too.
 *
 * The reason is returned so the page can say "this link has expired" rather
 * than "invalid link", which are genuinely different things to a member. It is
 * NOT a hint to an attacker: expiry is visible in the payload anyway, and the
 * signature check happens BEFORE the expiry check so a forged token can never
 * learn anything but "bad-signature".
 */
export async function verifyClassToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !token) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, payload, sig] = parts;
  if (version !== TOKEN_VERSION) return { ok: false, reason: "malformed" };
  if (!payload || !sig) return { ok: false, reason: "malformed" };

  let sigBytes;
  try { sigBytes = bytesFromB64u(sig); } catch (_) { return { ok: false, reason: "malformed" }; }

  let good = false;
  try {
    const key = await hmacKey(secret, ["verify"]);
    // subtle.verify, not a hand-written byte comparison: the comparison is
    // specified to be constant-time, and this is the one place in the codebase
    // where a timing leak would actually mean something.
    good = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${version}.${payload}`));
  } catch (_) {
    return { ok: false, reason: "bad-signature" };
  }
  if (!good) return { ok: false, reason: "bad-signature" };

  let body;
  try { body = JSON.parse(dec.decode(bytesFromB64u(payload))); } catch (_) { return { ok: false, reason: "bad-payload" }; }
  if (!body || typeof body !== "object") return { ok: false, reason: "bad-payload" };
  const { c, g, e } = body;
  if (typeof c !== "string" || !c || typeof g !== "string" || !g || typeof e !== "number" || !Number.isFinite(e)) {
    return { ok: false, reason: "bad-payload" };
  }
  // Signature verified above, so this is a value WE wrote — the check is
  // against the passage of time, not against tampering.
  if (Math.floor(now / 1000) >= e) return { ok: false, reason: "expired", expiresAt: e };

  return { ok: true, classInstanceId: c, gymId: g, expiresAt: e };
}
// ─── END SHARED TOKEN CORE ──────────────────────────────────────────────────

// ─── Client-side helpers (NOT mirrored — the functions have no use for these) ─

// The fragment, not the query string. A bearer token in `?s=…` is sent to the
// server on every request for the page, lands in access logs, and leaks through
// the Referer header to anything the page later links to. A fragment never
// leaves the browser. This is the whole reason the link is shaped this way, and
// it is the sort of thing that gets "simplified" back into a query param by
// someone who reasonably assumes it was arbitrary.
export const SUMMARY_FRAGMENT_KEY = "s";

export function summaryUrl(token, origin = "", basePath = "/") {
  const base = `${origin}${basePath}`.replace(/\/+$/, "/");
  return `${base}#${SUMMARY_FRAGMENT_KEY}=${token}`;
}

/**
 * Pull the token out of a location fragment. Returns "" when there isn't one,
 * which is the normal case for every staff visit to the app.
 */
export function tokenFromFragment(hash = "") {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return "";
  // Tolerates `#s=…` and `#a=1&s=…`; URLSearchParams handles the escaping so a
  // token that happens to contain no reserved characters is not a special case.
  const v = new URLSearchParams(raw).get(SUMMARY_FRAGMENT_KEY);
  return v || "";
}
