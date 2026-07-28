// Jungle — N4 step 1 of 2: PUBLISH a class summary and mint its member link.
//
// Called by a signed-in coach from the Class Runner. Two things happen here and
// the order matters: the caller's own JWT is used to prove they may touch this
// class (RLS does the proving), and only then is a token signed for it.
//
// ⚠️ DEPLOY WITH JWT VERIFICATION **ON** (the Supabase default). This endpoint
// mints credentials; an unauthenticated caller must never reach it. The code
// below re-checks the JWT itself anyway, because "the dashboard toggle is in
// the right position" is not a security control.
//
// Secrets required: JUNGLE_SUMMARY_SECRET (see supabase/SETUP.md for how to
// generate one). SUPABASE_URL and SUPABASE_ANON_KEY are injected by the
// platform. This function deliberately does NOT use the service-role key: it
// has no need to see past RLS, and a function that cannot escalate cannot be
// tricked into escalating.

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

// ─── PostgREST over plain fetch ──────────────────────────────────────────────
// No supabase-js import on purpose. These functions are deployed by pasting a
// single file into the dashboard, and every remote import is one more thing
// that can fail at cold start in a way nobody sees until a coach does.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

async function rest(path: string, jwt: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return r;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const secret = Deno.env.get("JUNGLE_SUMMARY_SECRET") || "";
    if (!secret) return json({ error: "JUNGLE_SUMMARY_SECRET not set" }, 500);

    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Not signed in" }, 401);

    // Independent of the gateway's verify_jwt setting.
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!who.ok) return json({ error: "Not signed in" }, 401);
    const user = await who.json();
    if (!user?.id) return json({ error: "Not signed in" }, 401);

    const { classInstanceId, content, brand } = await req.json();
    if (!classInstanceId || typeof classInstanceId !== "string") {
      return json({ error: "Missing classInstanceId" }, 400);
    }

    // AUTHORIZATION IS THIS QUERY. Run with the caller's JWT, so RLS on
    // class_instances (0007) returns zero rows unless they are an active member
    // of the gym that owns the class. There is no separate permission check to
    // get wrong, and no path where a coach at gym A can publish gym B's class.
    const ciRes = await rest(
      `class_instances?id=eq.${encodeURIComponent(classInstanceId)}&select=id,gym_id&limit=1`, jwt,
    );
    if (!ciRes.ok) return json({ error: "Could not read the class" }, 502);
    const rows = await ciRes.json();
    const ci = Array.isArray(rows) ? rows[0] : null;
    // 404, not 403: telling an unauthorised caller that the class EXISTS but is
    // not theirs is a membership oracle over the whole table.
    if (!ci?.id || !ci?.gym_id) return json({ error: "Class not found" }, 404);

    // Store what a member will see. Still under the caller's JWT — the write is
    // RLS-checked exactly like the read.
    //
    // A failure here is NOT fatal. Until migration 0009 is run this table does
    // not exist, and the honest outcome is a link that shows the class facts
    // without the movement list, plus `stored:false` so the coach is told so.
    // Silently returning a link that leads to a thinner page than they expect is
    // the worse failure.
    let stored = false;
    let storeError = "";
    if (content && typeof content === "object") {
      const up = await rest("class_summaries?on_conflict=class_instance_id", jwt, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          class_instance_id: ci.id,
          gym_id: ci.gym_id,
          content,
          brand: brand && typeof brand === "object" ? brand : {},
          published_by: user.id,
          published_at: new Date().toISOString(),
        }),
      });
      stored = up.ok;
      if (!up.ok) storeError = (await up.text()).slice(0, 300);
    }

    // The gym id is baked into the token from the ROW, never from the request
    // body. A caller who could nominate their own gym_id could mint a token
    // that reads across tenants.
    const { token, expiresAt } = await signClassToken({
      classInstanceId: ci.id, gymId: ci.gym_id, secret,
    });

    return json({ token, expiresAt, stored, storeError }, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
