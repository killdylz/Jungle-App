// ─── N4: the client half of the member summary link ──────────────────────────
//
// Two calls, two very different trust positions:
//
//   publishSummary()  — a signed-in coach. Goes through supabase.functions
//                       .invoke so the session JWT rides along; the function
//                       uses that JWT to let RLS decide whether they may touch
//                       this class.
//   fetchSummary()    — a member with no account, no session, and no supabase
//                       client. Plain fetch, POST, token in the body.
//
// fetchSummary deliberately does NOT import ./supabase.js. Nothing about
// reading a summary needs an auth client, and keeping the member path free of
// it means the page can be split away from the app later without unpicking a
// dependency first.

import { summaryContent, isPublishable } from "./summaryContent.js";
import { summaryUrl } from "./classToken.js";

// Vite folds `import.meta.env.VITE_SUPABASE_URL` to a literal at build time, so
// in a credential-less build this collapses to the relative path — which keeps
// the request code alive (rollup cannot drop it) and 404s locally instead of
// disappearing. That is what lets the e2e suite drive every state of this page
// on a build with no Supabase at all.
const FN_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : "/functions/v1";

/**
 * The gym's palette as it is on screen RIGHT NOW, read from the live CSS custom
 * properties rather than from a preset table.
 *
 * Same approach as handleShareCard, and for the same reason: a studio that
 * built a custom palette in Brand Studio has no entry in PRESET_SKINS, so
 * anything that resolves a preset by id silently downgrades exactly the gyms
 * that cared most about looking like themselves.
 */
export function readBrandTokens(gymName = "", doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return { gymName };
  const cs = getComputedStyle(doc.documentElement);
  const v = (n, f) => (cs.getPropertyValue(n) || "").trim() || f;
  return {
    gymName,
    bg: v("--bg", "#0A0F0C"),
    card: v("--card", "#0F1611"),
    text: v("--text", "#E8EFE9"),
    muted: v("--muted", "#8AA294"),
    accent: v("--accent", "#7BE3A4"),
    border: v("--border", "rgba(255,255,255,.07)"),
    display: v("--display", "sans-serif"),
    body: v("--body", "sans-serif"),
  };
}

/**
 * Publish this class and get back the member link.
 *
 * Returns {ok:false, reason} rather than throwing, because every failure here
 * is something a coach mid-class needs told in one sentence, not a stack trace
 * behind an ErrorBoundary.
 */
export async function publishSummary({
  classInstanceId, stages, sessionName, gymName, supabase, supabaseEnabled,
  // Injected rather than read off `window` inside the function. Reaching for a
  // global here made every failure look identical: in a unit runner the
  // reference threw, the catch below turned it into {reason:"failed"}, and a
  // perfectly good publish reported as a server error.
  origin = typeof window !== "undefined" ? window.location.origin : "",
  basePath = import.meta.env.BASE_URL || "/",
}) {
  if (!supabaseEnabled || !supabase) return { ok: false, reason: "offline-only" };
  if (!classInstanceId) return { ok: false, reason: "no-class" };

  const content = summaryContent({ stages, sessionName });
  if (!isPublishable(content)) return { ok: false, reason: "empty" };

  try {
    const { data, error } = await supabase.functions.invoke("summary-token", {
      body: { classInstanceId, content, brand: readBrandTokens(gymName) },
    });
    if (error) return { ok: false, reason: "failed", detail: error.message || String(error) };
    if (!data?.token) return { ok: false, reason: "failed", detail: data?.error || "no token returned" };
    return {
      ok: true,
      token: data.token,
      expiresAt: data.expiresAt,
      // `stored:false` means the link works but shows the class facts with no
      // movement list — migration 0009 has not been run. The coach is told,
      // rather than handed a link that is quietly thinner than they expect.
      stored: !!data.stored,
      url: summaryUrl(data.token, origin, basePath),
    };
  } catch (e) {
    return { ok: false, reason: "failed", detail: e?.message || String(e) };
  }
}

/**
 * Read a published summary. No auth, no client, no session — the token is the
 * whole credential.
 */
export async function fetchSummary(token, fetchImpl = typeof fetch !== "undefined" ? fetch : null) {
  if (!token) return { ok: false, reason: "malformed" };
  if (!fetchImpl) return { ok: false, reason: "network" };
  let r;
  try {
    r = await fetchImpl(`${FN_BASE}/summary-read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Sent when we have one. With verify_jwt off the function does not need
        // it; the platform gateway is happier with it present.
        ...(import.meta.env.VITE_SUPABASE_ANON_KEY
          ? { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
          : {}),
      },
      body: JSON.stringify({ token }),
    });
  } catch (_) {
    // A phone that lost signal between tapping the link and the page loading.
    return { ok: false, reason: "network" };
  }

  let body = null;
  try { body = await r.json(); } catch (_) { /* falls through to the status check */ }

  if (!r.ok) {
    // 401 carries the token verdict from the function; anything else is ours to
    // name honestly rather than dress up as an invalid link.
    if (r.status === 401) return { ok: false, reason: body?.reason || "invalid" };
    if (r.status === 404) return { ok: false, reason: "not-found" };
    return { ok: false, reason: "network", detail: body?.error || `HTTP ${r.status}` };
  }
  if (!body || typeof body !== "object") return { ok: false, reason: "network" };
  return { ok: true, ...body };
}
