import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, supabaseEnabled, makeCan } from "./supabase.js";

const AuthContext = createContext(null);
export const useJungleAuth = () => useContext(AuthContext);

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0F0C", color: "#E8EFE9", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: "24px" };
const card = { width: "min(400px,100%)", background: "#0F1611", border: "1px solid rgba(255,255,255,.08)", borderRadius: "16px", padding: "32px", textAlign: "center" };
const input = { width: "100%", boxSizing: "border-box", padding: "12px 14px", background: "#141D17", border: "1px solid rgba(255,255,255,.1)", borderRadius: "9px", color: "#E8EFE9", fontSize: "14px", marginBottom: "12px" };
const btn = { width: "100%", padding: "12px", background: "#7BE3A4", color: "#0A0F0C", border: "none", borderRadius: "9px", fontWeight: 800, fontSize: "14px", cursor: "pointer" };

const googleBtn = { width: "100%", padding: "12px", background: "#fff", color: "#1F1F1F", border: "none", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" };
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17Z"/>
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46Z"/>
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7Z"/>
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07Z"/>
  </svg>
);

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const signInGoogle = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    // On success the browser redirects to Google, so we only reach here on error.
    if (error) { setErr(error.message); setBusy(false); }
  };
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
        <button style={{ ...googleBtn, opacity: busy ? 0.6 : 1 }} onClick={signInGoogle} disabled={busy}>
          <GoogleIcon /> Continue with Google
        </button>
        {!showEmail ? (
          <button style={{ background: "none", border: "none", color: "#8AA294", fontSize: "12px", cursor: "pointer", marginTop: "14px" }} onClick={() => setShowEmail(true)}>
            or sign in with an email link
          </button>
        ) : (<>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "16px 0 12px" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.1)" }} />
            <div style={{ fontSize: "11px", color: "#8AA294" }}>OR</div>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.1)" }} />
          </div>
          <input style={input} type="email" placeholder="you@studio.com" value={email}
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={send} disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button>
        </>)}
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
