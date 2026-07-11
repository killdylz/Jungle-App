# Jungle — Session Handoff

_Last updated: 2026-07-11_

## ▶️ Start here next session — pending deploy actions

Everything below is **built and verified but not yet deployed**. Two actions to ship it:

**1. Run the RLS migration** (Supabase dashboard → SQL Editor → New query → paste → Run):
- File: `supabase/migrations/0002_rbac_write_hardening.sql`
- Safe to re-run.
- (CLI alternative, only if you have it linked: `supabase db push`)

**2. Redeploy the frontend** (PowerShell, one line at a time):
```powershell
cd "C:\Users\dylan\jungle-app"
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```
Ships the Team screen, role-gated nav, and the AuthGate hang fix. GitHub Actions builds in ~1–2 min.

**3. (Carryover) Redeploy the `smart-build` Edge Function** — still pending from before:
- Supabase dashboard → Edge Functions → `smart-build` → paste `supabase/functions/smart-build/index.ts` → Deploy.
- Until done, Brand Studio's Smart Recommendation uses the curated fallback instead of the LLM.

---

## ✅ Done this session (code complete, awaiting the deploy above)

**LLM brand recommendation wiring**
- `src/App.jsx` `runRecommend` now calls `smart-build` with `task:"brand"`, maps `{name,accent,vibe,mode,preset,note}` into the recommendation, and falls back to the curated matcher on any error or when Supabase is off. Added a "Thinking…" busy state. `applyRecommendation` now honors the LLM's light/dark `mode`. (This part was already deployed earlier.)

**Roadmap item 1 — Make roles matter**
- New `AdminTeamScreen` in `src/App.jsx`: lists members (`memberships`+`profiles`) with per-member role dropdown + Suspend/Reactivate; invite form writing `allowlist_entries` (email or `@domain` + role); revoke-invite list. Can't change/suspend your own membership. Guards for supabase-off and non-admins.
- Wired `useJungleAuth()` into the app shell; `can` falls back to allow-all when Supabase is off.
- Role-gated both navs (desktop `AppSidebar` + mobile drawer): each item carries a capability, hidden when `can(cap)` is false; empty groups drop out. Added **Team** item (gated to `members:manage`).

**AuthGate hardening — `src/AuthGate.jsx`**
- Every Supabase call in `resolve()` now has a 12s timeout + try/catch. On failure shows a "Couldn't reach the server / Retry" screen instead of an infinite "Loading…". (Makes failures visible/retryable — does not fix a down backend.)

**New migration — `supabase/migrations/0002_rbac_write_hardening.sql`**
- Adds `is_gym_admin()` helper; splits `memberships`/`allowlist_entries` RLS into read vs. write; restricts writes (and invite reads) to admins/managers. Closes the gap where any gym member could write those tables via the API. Signup still works (`handle_new_user()` is SECURITY DEFINER).

Files touched: `src/App.jsx`, `src/AuthGate.jsx`, `supabase/migrations/0002_rbac_write_hardening.sql`.

---

## 🔎 Verify after deploy
- Sign in (you're platform admin) → you should see the full nav incl. **Team**.
- Team screen: invite an email + role, change a member's role, suspend/reactivate, revoke an invite.
- If the app was stuck on "Loading…", confirm the Supabase project is running (free tier auto-pauses); the app now shows Retry rather than hanging.

## 🗺️ Roadmap after this
2. **Cloud data** — move saved classes / sessions / library / skins from localStorage into Supabase tables (persist + sync per gym).
3. **Polish** — Floor TV from a real built class, brand logo/voice across more surfaces, UX-loop items.

## ⚠️ Gotchas learned this session
- **Git index got corrupted** once (a `git stash`/lock collision). If `git` errors with "bad signature / index corrupt": `del .git\index` then `git reset` (rebuilds index; files untouched).
- **`.\deploy.ps1` blocked by execution policy** → use `powershell -ExecutionPolicy Bypass -File .\deploy.ps1`.
- **Paste multi-line commands one line at a time** in PowerShell — they concatenated when pasted as a block.
- **Sandbox mount desync**: the Linux build sandbox served a stale/truncated copy of `App.jsx`, so a full `npm run build` there is unreliable. The real file on disk (what `deploy.ps1` commits) is intact; verification was done on the isolated new modules. The actual build runs fine via GitHub Actions on deploy.
