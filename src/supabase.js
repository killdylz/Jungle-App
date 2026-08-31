import { createClient } from "@supabase/supabase-js";

// Configured via build-time env (Vite embeds VITE_* vars).
// When absent, the app runs exactly as before (localStorage + Spotify PIN) —
// so nothing breaks until you provision Supabase and add these vars.
const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && anon);
export const supabase = supabaseEnabled
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// Effective-permission helper (RBAC-SPEC §3). role defaults + grant − deny.
const ROLE_DEFAULTS = {
  admin:     ["*"],
  manager:   ["library:*","glossary:*","templates:*","class:*","schedule:*","music:view","analytics:view","members:manage","brand:view","clients:*"],
  // `clients:*` is NOT `members:*`. A coach has never had members:view — the
  // roster is an admin surface — but a coach IS the person who delivers PT, so
  // gating the Clients screen on members:view would hide it from exactly the
  // people it is for. And frontdesk deliberately has neither: a training record
  // carries health screening and body measurements, and someone checking a
  // member into a spin class has no business reading them. That is the same
  // split 0013 makes in RLS, where parq_responses is admin-and-member only.
  coach:     ["library:*","glossary:*","templates:*","class:*","schedule:*","music:view","analytics:view","clients:*"],
  frontdesk: ["schedule:*","members:view","music:view"],
  member:    ["workout:view","schedule:view","music:view","glossary:view","progress:view-own"],
};

function capMatches(pattern, cap) {
  if (pattern === "*" || pattern === cap) return true;
  if (pattern.endsWith(":*")) return cap.startsWith(pattern.slice(0, -1)); // "library:*" ⇒ "library:"
  return false;
}

export function makeCan(role, permissions, isPlatformAdmin) {
  if (isPlatformAdmin) return () => true;
  const base = ROLE_DEFAULTS[role] || [];
  const grant = permissions?.grant || [];
  const deny  = permissions?.deny  || [];
  const effective = [...base, ...grant];
  return (cap) => {
    if (deny.some((d) => capMatches(d, cap))) return false;
    return effective.some((p) => capMatches(p, cap));
  };
}
