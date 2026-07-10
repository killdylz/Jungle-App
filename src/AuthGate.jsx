import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, supabaseEnabled, makeCan } from "./supabase.js";

const AuthContext = createContext(null);
export const useJungleAuth = () => useContext(AuthContext);

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0F0C", color: "#E8EFE9", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: "24px" };
const card = { width: "min(400px,100%)", background: "#0F1611", border: "1px solid rgba(255,255,255,.08)", borderRadius: "16px", padding: "32px", textAlign: "center" };
const input = { width: "100%", boxSizing: "border-box", padding: "12px 14px", background: "#141D17", border: "1px solid rgba(255,255,255,.1)", borderRadius: "9px", color: "#E8EFE9", fontSize: "14px", marginBottom: "12px" };
const btn = { width: "100%", padding: "12px", background: "#7BE3A4", color: "#0A0F0C", border: "none", borderRadius: "9px", fontWeight: 800, fontSize: "14px", cursor: "pointer" };

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "4px", marginBottom: "6px" }}>JUNGLE</div>
      <div style={{ fontSize: "13px", color: "#8AA294", marginBottom: "22px" }}>Sign in to your studio</div>
      {sent ? (
        <div style={{ fontSize: "14px", lineHeight: 1.6 }}>Check <b>{email}</b> for a magic link to sign in.</div>
      ) : (<>
        <input style={input} type="email" placeholder="you@studio.com" value={email}
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={send} disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button>
        {err && <div style={{ color: "#EF4444", fontSize: "12px", marginTop: "10px" }}>{err}</div>}
      </>)}
    </div></div>
  );
}

function NotAuthorized({ email, onSignOut }) {
  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>Not authorized</div>
      <div style={{ fontSize: "13px", color: "#8AA294", lineHeight: 1.6, marginBottom: "22px" }}>
        <b>{email}</b> isn't on any studio's allowlist yet. Ask your gym admin to add you, then sign in again.
      </div>
      <button style={{ ...btn, background: "#141D17", color: "#E8EFE9", border: "1px solid rgba(255,255,255,.1)" }} onClick={onSignOut}>Sign out</button>
    </div></div>
  );
}

export default function AuthGate({ children }) {
  // Supabase not configured → app behaves exactly as before.
  if (!supabaseEnabled) return children;

  const [state, setState] = useState({ loading: true, error: null, session: null, membership: null, gym: null, profile: null });
  const [retry, setRetry] = useState(0);

  // withTimeout: never let a stalled Supabase call hang the whole app.
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out — server unreachable`)), ms)),
  ]);

  const load = () => {
    let alive = true;
    const resolve = async (session) => {
      try {
        if (!session) { if (alive) setState({ loading: false, error: null, session: null, membership: null, gym: null, profile: null }); return; }
        const uid = session.user.id;
        const [{ data: profile }, { data: memberships }] = await withTimeout(Promise.all([
          supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
          supabase.from("memberships").select("*").eq("user_id", uid).eq("status", "active"),
        ]), 12000, "Sign-in check");
        const membership = (memberships || [])[0] || null;
        let gym = null;
        if (membership) {
          const { data } = await withTimeout(supabase.from("gyms").select("*").eq("id", membership.gym_id).maybeSingle(), 12000, "Loading gym");
          gym = data;
          supabase.from("memberships").update({ last_active_at: new Date().toISOString() }).eq("id", membership.id).then(() => {});
        }
        if (alive) setState({ loading: false, error: null, session, membership, gym, profile });
      } catch (e) {
        if (alive) setState({ loading: false, error: e?.message || "Couldn't reach the server", session, membership: null, gym: null, profile: null });
      }
    };
    withTimeout(supabase.auth.getSession(), 12000, "Session")
      .then(({ data }) => resolve(data.session))
      .catch((e) => { if (alive) setState({ loading: false, error: e?.message || "Couldn't reach the server", session: null, membership: null, gym: null, profile: null }); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => resolve(session));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  };
  useEffect(load, [retry]);

  const signOut = () => supabase.auth.signOut();

  if (state.loading) return <div style={wrap}><div style={{ color: "#8AA294" }}>Loading…</div></div>;
  if (state.error && !state.session) return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>Couldn't reach the server</div>
      <div style={{ fontSize: "13px", color: "#8AA294", lineHeight: 1.6, marginBottom: "22px" }}>{state.error}. Check your connection or that the Supabase project is running, then retry.</div>
      <button style={btn} onClick={() => { setState((s) => ({ ...s, loading: true, error: null })); setRetry((n) => n + 1); }}>Retry</button>
    </div></div>
  );
  if (!state.session) return <Login />;
  if (!state.membership) return <NotAuthorized email={state.session.user.email} onSignOut={signOut} />;

  const isPA = !!state.profile?.is_platform_admin;
  const value = {
    user: state.session.user,
    profile: state.profile,
    gym: state.gym,
    role: state.membership.role,
    isPlatformAdmin: isPA,
    can: makeCan(state.membership.role, state.membership.permissions, isPA),
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
