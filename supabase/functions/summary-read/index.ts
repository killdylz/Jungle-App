// Jungle — N4 step 2 of 2: READ a published class summary from a member link.
//
// This is the only endpoint in Jungle a person with no account can reach, so
// it is worth being precise about what it can and cannot do.
//
// ⚠️ DEPLOY WITH JWT VERIFICATION **OFF** for this function only. A member has
// no account and never will — the token IS the credential. That is also exactly
// why everything below is narrow.
//
// WHAT GUARDS IT. An HMAC-SHA256 signature over {class, gym, expiry}, minted by
// `summary-token` for a coach who was already proven (by RLS) to belong to that
// gym. Nothing here trusts a value from the request except the token, and the
// token's contents are only trusted after the signature verifies.
//
// WHY THE SERVICE-ROLE KEY IS ACCEPTABLE HERE. RLS is never loosened to `anon`
// — that is a standing rule (LEGAL §4) and this function is the reason it can
// stay standing. The escalation is bounded by three things: it happens only
// after a valid signature, it reads only the single class named IN that
// signature, and it touches four tables none of which contain a member. It
// never reads `members`, `attendance`, `consent_records` or `profiles`, and
// there is no request shape that can make it.
//
// WHAT A LEAKED LINK COSTS. One class's programming, for up to 14 days — the
// same content the gym's share card already publishes to Instagram. It cannot
// be walked back to a person, because no person is named anywhere in the
// payload. That is the whole reason the token is class-scoped rather than
// member-scoped.
//
// Secrets required: JUNGLE_SUMMARY_SECRET (must MATCH summary-token's).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Every read goes through here, and every read is scoped by BOTH ids from the
// token. The gym filter is redundant given the signature covers the pair — and
// it stays, because the cost is one query parameter and the thing it defends
// against is a future edit that changes how the class id is chosen.
async function svc(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const secret = Deno.env.get("JUNGLE_SUMMARY_SECRET") || "";
    if (!secret) return json({ error: "JUNGLE_SUMMARY_SECRET not set" }, 500);

    // POST, not GET with ?t=. The token would otherwise land in the platform's
    // own request logs and in any proxy between the member and here — the same
    // reason the client keeps it in the URL fragment rather than the query
    // string. A bearer credential should appear in as few logs as possible.
    const { token } = await req.json().catch(() => ({ token: "" }));

    const v = await verifyClassToken(token, secret);
    if (!v.ok) {
      // The reason is safe to return and useful to a member: "this link has
      // expired" and "this link is not valid" are different problems with
      // different fixes. It leaks nothing — a forgery only ever learns
      // "bad-signature", because the signature is checked before the expiry.
      return json({ error: "invalid", reason: v.reason }, 401);
    }

    const ciId = encodeURIComponent(v.classInstanceId);
    const gymId = encodeURIComponent(v.gymId);

    const ci = await svc(
      `class_instances?id=eq.${ciId}&gym_id=eq.${gymId}&select=id,name,class_type,starts_at,coach_name,duration_min&limit=1`,
    );
    // The class was deleted after the link went out. Not an error the member
    // can do anything about, but it must not render as an empty success.
    if (!ci) return json({ error: "not-found" }, 404);

    // Tolerates 0009 not being applied: svc() returns null on any non-2xx, so a
    // missing table degrades to "no movement list" rather than a 500.
    const summary = await svc(
      `class_summaries?class_instance_id=eq.${ciId}&gym_id=eq.${gymId}&select=content,brand,published_at&limit=1`,
    );
    const gym = await svc(`gyms?id=eq.${gymId}&select=name&limit=1`);

    // NOTHING member-shaped is assembled here. Read the field list above and
    // below: class facts, gym name, published class content. No join reaches a
    // person, and adding one would need a new query, not just a new field.
    return json({
      gym: { name: summary?.brand?.gymName || gym?.name || "" },
      brand: summary?.brand || {},
      klass: {
        name: ci.name || "",
        classType: ci.class_type || "",
        startsAt: ci.starts_at || null,
        coachName: ci.coach_name || "",
        durationMin: ci.duration_min || null,
      },
      content: summary?.content || null,
      publishedAt: summary?.published_at || null,
      expiresAt: v.expiresAt,
    }, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
