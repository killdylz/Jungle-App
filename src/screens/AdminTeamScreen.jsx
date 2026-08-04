// ─── Team / admin screen (AUDIT-FINDINGS §3.1, decomposition stage 2) ────────
// A leaf screen, and the reason this stage is "leaf-first": the whole interface
// is one prop (`onBack`) plus three module-level singletons.
//
// Those singletons are IMPORTED here rather than threaded down as props — the
// trap the audit names for this stage. Threading them would widen exactly the
// interface the extraction exists to keep narrow, and would make every future
// screen extraction harder rather than easier.
//
// Lifted from App.jsx unchanged.

import React from "react";
import { supabase, supabaseEnabled } from "../supabase.js";
import { useJungleAuth } from "../AuthGate.jsx";

// ── Admin: Team management (invite via allowlist + manage member roles) ──────
//
// ⚠️ TEAM_ROLES IS A CONSTRAINED-COLUMN VALUE SET. `memberships.role` and
// `allowlist_entries.role` are the Postgres ENUM `membership_role`
// (0001_auth_foundation.sql), so a value that is legal here and absent there is
// rejected at write time — this repo's recurring data-loss bug, now on its
// fourth column after `persona_plans.source`, `attendance.source` and the
// retention ledgers.
//
// It is pinned in ONE place (here) and `src/lib/dbConstraints.test.js` reads the
// MIGRATION and asserts the two agree, so drift fails a test instead of a save.
// (It is the `memberships.role` row of that file's GUARDED table. There is no
// `AdminTeamScreen.test.js` — this comment named one until 2026-07-27, which
// sent anyone checking the guard to a file that does not exist.)
// Do not spell these strings inline anywhere else — import TEAM_ROLES.
export const TEAM_ROLES = ["admin","manager","coach","frontdesk","member"];
const ROLE_BLURB = {
  admin:"Full access, including team & billing.",
  manager:"Classes, schedule, members & brand.",
  coach:"Build & run classes, library, analytics.",
  frontdesk:"Schedule & member check-in.",
  member:"View workouts, schedule & progress.",
};

export function AdminTeamScreen({ onBack }) {
  const auth = useJungleAuth();
  const gymId = auth?.gym?.id;
  const myUid = auth?.user?.id;
  const canManage = auth?.can ? auth.can("members:manage") : false;
  const [members, setMembers] = React.useState(null); // null = loading
  const [invites, setInvites] = React.useState([]);
  const [err, setErr]   = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [invMatch, setInvMatch] = React.useState("");
  const [invRole, setInvRole]   = React.useState("coach");

  const load = React.useCallback(async () => {
    if (!supabase || !gymId) return;
    setErr("");
    const [{ data: mem, error: e1 }, { data: al, error: e2 }] = await Promise.all([
      supabase.from("memberships").select("id,role,status,last_active_at,user_id,profiles(email,name)").eq("gym_id", gymId),
      supabase.from("allowlist_entries").select("*").eq("gym_id", gymId).order("created_at", { ascending:false }),
    ]);
    if (e1 || e2) setErr((e1 || e2).message);
    setMembers(mem || []);
    setInvites(al || []);
  }, [gymId]);
  React.useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const m = invMatch.trim().toLowerCase();
    if (!m) return;
    const kind = m.startsWith("@") ? "domain" : "email";
    if (kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { setErr("Enter a valid email, or a domain like @studio.com"); return; }
    if (kind === "domain" && !/^@[^@\s]+\.[^@\s]+$/.test(m)) { setErr("Domain must look like @studio.com"); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("allowlist_entries").insert({ gym_id:gymId, match:m, kind, role:invRole, invited_by:myUid });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setInvMatch(""); load();
  };
  const patchMember = async (id, patch) => {
    setBusy(true);
    const { error } = await supabase.from("memberships").update(patch).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message); else load();
  };
  const patchInvite = async (id, patch) => {
    setBusy(true);
    const { error } = await supabase.from("allowlist_entries").update(patch).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message); else load();
  };

  const card = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:"12px", padding:"18px" };
  const label = { fontSize:"10px", fontWeight:"700", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"10px" };
  const inp = { padding:"9px 12px", background:"var(--navy)", border:"1px solid var(--border)", borderRadius:"8px", color:"var(--text)", fontSize:"13px" };
  const sel = { ...inp, cursor:"pointer" };
  const chipBtn = (danger) => ({ padding:"5px 10px", background:"transparent", border:`1px solid ${danger?"color-mix(in srgb, #EF4444 40%, transparent)":"var(--border)"}`, color:danger?"#EF4444":"var(--muted)", borderRadius:"7px", cursor:busy?"default":"pointer", fontSize:"11px", fontWeight:"600" });

  if (!supabaseEnabled) return (
    <div style={{ padding:"40px", maxWidth:"640px", margin:"0 auto" }}>
      <button onClick={onBack} data-tap style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"16px" }}>← Back</button>
      <div style={card}><div style={label}>Team</div><div style={{ fontSize:"13px", color:"var(--muted)", lineHeight:1.6 }}>Team accounts are available on the online version of Jungle.</div></div>
    </div>
  );
  if (!canManage) return (
    <div style={{ padding:"40px", maxWidth:"640px", margin:"0 auto" }}>
      <button onClick={onBack} data-tap style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"16px" }}>← Back</button>
      <div style={card}><div style={label}>Team</div><div style={{ fontSize:"13px", color:"var(--muted)", lineHeight:1.6 }}>You don't have permission to manage this gym's team.</div></div>
    </div>
  );

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";

  return (
    <div style={{ padding:"clamp(20px,4vw,40px)", maxWidth:"860px", margin:"0 auto", width:"100%", boxSizing:"border-box" }}>
      <button onClick={onBack} data-tap style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"13px", marginBottom:"14px" }}>← Back</button>
      <div style={{ fontSize:"clamp(22px,3vw,28px)", fontWeight:"800", color:"var(--text)", marginBottom:"4px" }}>Team</div>
      <div style={{ fontSize:"13px", color:"var(--muted)", marginBottom:"22px" }}>{auth?.gym?.name || "Your gym"} · invite people and set what they can do.</div>

      {err && <div style={{ background:"color-mix(in srgb, #EF4444 12%, transparent)", border:"1px solid color-mix(in srgb, #EF4444 30%, transparent)", color:"#EF4444", padding:"10px 12px", borderRadius:"8px", fontSize:"12px", marginBottom:"16px" }}>{err}</div>}

      {/* Invite */}
      <div style={{ ...card, marginBottom:"18px" }}>
        <div style={label}>Invite to gym</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", alignItems:"center" }}>
          <input value={invMatch} onChange={e=>setInvMatch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!busy&&invite()} placeholder="person@studio.com  or  @studio.com" style={{ ...inp, flex:"1 1 240px", minWidth:0 }}/>
          <select value={invRole} onChange={e=>setInvRole(e.target.value)} style={sel}>
            {TEAM_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={invite} disabled={busy} style={{ padding:"9px 16px", background:"var(--accent)", color:"var(--bg)", border:"none", borderRadius:"8px", cursor:busy?"default":"pointer", opacity:busy?0.7:1, fontWeight:"700", fontSize:"13px" }}>Send invite</button>
        </div>
        <div style={{ fontSize:"11px", color:"var(--muted)", marginTop:"8px", lineHeight:1.5 }}>{ROLE_BLURB[invRole]} They're granted this role the first time they sign in. Use <b>@domain.com</b> to allow a whole staff domain.</div>
      </div>

      {/* Members */}
      <div style={{ ...card, marginBottom:"18px" }}>
        <div style={label}>Members {members ? `(${members.length})` : ""}</div>
        {members === null ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>No members yet.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {members.map(m => {
              const suspended = m.status !== "active";
              const isMe = m.user_id === myUid;
              return (
                <div key={m.id} style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center", padding:"10px 12px", background:"var(--navy)", borderRadius:"9px", opacity:suspended?0.55:1 }}>
                  <div style={{ minWidth:0, flex:"1 1 200px" }}>
                    <div style={{ fontSize:"13px", fontWeight:"700", color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.profiles?.name || m.profiles?.email || "Unknown"}{isMe && <span style={{ color:"var(--muted)", fontWeight:"500" }}> (you)</span>}</div>
                    <div style={{ fontSize:"11px", color:"var(--muted)" }}>{m.profiles?.email || "—"} · active {fmtDate(m.last_active_at)}</div>
                  </div>
                  <select value={m.role} disabled={busy||isMe} onChange={e=>patchMember(m.id,{ role:e.target.value })} title={isMe?"You can't change your own role":""} style={{ ...sel, opacity:(busy||isMe)?0.6:1 }}>
                    {TEAM_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                  {!isMe && (suspended
                    ? <button onClick={()=>patchMember(m.id,{ status:"active" })} disabled={busy} style={chipBtn(false)}>Reactivate</button>
                    : <button onClick={()=>patchMember(m.id,{ status:"suspended" })} disabled={busy} style={chipBtn(true)}>Suspend</button>)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites */}
      <div style={card}>
        <div style={label}>Invites</div>
        {invites.filter(i=>i.status==="active").length === 0 ? (
          <div style={{ fontSize:"13px", color:"var(--muted)" }}>No pending invites.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {invites.filter(i=>i.status==="active").map(i => (
              <div key={i.id} style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center", padding:"10px 12px", background:"var(--navy)", borderRadius:"9px" }}>
                <div style={{ minWidth:0, flex:"1 1 200px" }}>
                  <div style={{ fontSize:"13px", fontWeight:"700", color:"var(--text)" }}>{i.match} {i.kind==="domain" && <span style={{ fontSize:"10px", color:"var(--muted)", fontWeight:"600" }}>DOMAIN</span>}</div>
                  <div style={{ fontSize:"11px", color:"var(--muted)" }}>invited as {i.role} · {i.last_used_at ? `joined ${fmtDate(i.last_used_at)}` : "not signed in yet"}</div>
                </div>
                <button onClick={()=>patchInvite(i.id,{ status:"revoked" })} disabled={busy} style={chipBtn(true)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
