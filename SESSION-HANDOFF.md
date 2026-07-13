# Jungle — Session Handoff

_Last updated: 2026-07-13_

You're continuing work on **Jungle** — a white-label class operating system for boutique fitness studios (React + Vite + Supabase, deployed to GitHub Pages). This file is the cold-start brief: read it, confirm repo access, report `git status`, then propose a plan before editing.

## ▶️ Start here

- **Repo:** `C:\Users\dylan\jungle-app` (request folder access to this path first).
- **Main file:** `src/App.jsx` (~8,400-line monolith). Also `src/AuthGate.jsx`, `src/supabase.js`, `src/config/flags.js`.
- **Live site:** https://killdylz.github.io/Jungle-App/
- **Deploy** = git push to `main` (GitHub Actions builds + deploys). A **failed CI build does NOT touch the live site.**
  ```
  cd C:\Users\dylan\jungle-app
  git add -A
  git commit -m "..."
  git push origin main
  ```
- **Deep context / roadmap:** read `Jungle - Stress-Test Verdict & Architecture Spec (Fable).md` in the repo root.
- **Repo state:** as of 2026-07-13 the tree is clean and `main` is in sync with `origin`. Migrations `0003` + `0004` are applied to Supabase; the **full store.js → Postgres local-first sync is live and verified** (all domains) — see Next steps. (`.claude/launch.json`, a dev-server config, is left untracked.)

## ✅ Done this session

- **Google login is LIVE and working** (Supabase Auth + Google OAuth). Allowlist gate in `supabase/migrations/0001_auth_foundation.sql`; admin email allowlisted. Google OAuth app published to production (no "unverified" warning).
- **Spotify is no longer an app gate** — removed the `if (!token) return <LoginScreen>` gate. Spotify is optional, connected post-login from Music Hub via `ConnectSpotifyPrompt` (any user for now; PT-only gating deferred).
- **Mock/theatre surfaces flagged OFF** via new `src/config/flags.js` (`mockAnalytics`, `mockMembers`, `mockSchedule`, `attendeeShare`) — Analytics KPIs, Members app, hardcoded `BASE_SCHEDULE`, calendar suggestions/leaderboard, DJ demo requests, attendee share view. Nav items hidden + render blocked with a "coming soon" placeholder.
- **Account identity fix** — sidebar/header/dashboard/profile avatar + name now use the Google identity (`displayProfile`), Spotify only as fallback. Log out now ends the account session (`auth.signOut()`), not just Spotify.

Files touched: `src/App.jsx`, `src/AuthGate.jsx`, `src/config/flags.js` (new).

## ⚠️ Environment gotchas

- **Sandbox mount is byte-capped** — the Linux bash mirror serves TRUNCATED copies of large files (`App.jsx`, `AuthGate.jsx`), so `npm run build` / `cat` on the mount are unreliable. The **Read/Edit tools see the true host files — trust those.**
- **Validate edits with the HOST build, not the sandbox one.** `npm.cmd run build` in **PowerShell** runs against the true host files and is a reliable full-compile check (it caught a real duplicate-declaration + surfaced the path to a hook bug this session). Only the *bash sandbox* build is unreliable (truncated mirror). `@babel/parser` on isolated snippets is a fast pre-check; the host `vite build` is the authoritative one, ahead of CI.
- **PowerShell:** `npm`/`.ps1` blocked by execution policy → use `npm.cmd ...` or `powershell -ExecutionPolicy Bypass -File .\deploy.ps1`. Paste multi-line commands **one line at a time**.
- **Git index corruption** (rare): if git errors "bad signature / index corrupt" → `del .git\index` then `git reset` (rebuilds index; files untouched).

## 🗺️ Next steps (from the roadmap)

- ✅ **DONE — `src/lib/store.js` repository seam** (`f9f8514`). One module wraps every domain localStorage key (classes, library, brand/skin, history, prefs, DJ); ~30 App.jsx call sites route through it. Spotify tokens + derived caches intentionally excluded.
- ✅ **DONE — Phase 1 domain schema applied** (`0003_phase1_domain_tables.sql`, `ef05f76`). Applied to Supabase and verified (5 tables + RLS; `session_history` is **append-only**, insert-only RLS). Built on the 0001/0002 tenant model. Idempotent — safe to re-run.
- ✅ **DONE + LIVE — user-classes Supabase sync** (`1640587`). First domain through a **local-first sync layer** — this is the CHOSEN architecture, **not** a full async rewrite:
  - `store.js` keeps its **sync API**. localStorage stays the instant/offline read layer; each `save*` also fires a **background upsert**; `hydrate*()` pulls server → local once on mount (**server wins**; seeds server from local when the server is empty). Every sync path no-ops when Supabase is off or no gym is resolved, so the plain-localStorage build is unchanged.
  - Wiring: `store.connect({gymId,userId})` at the App root (top-level, before early returns); the screen calls `store.hydrateXxx()` on mount and **skips its initial save** so stale/empty local never clobbers server data pre-hydrate.
  - Also fixed a pre-existing Rules-of-Hooks bug (`useJungleAuth()` was after the PIN early-return → App hook count changed on unlock). Verified live: add-class persists to Postgres.

- ✅ **DONE + LIVE — remaining domains synced** (`c3b2e2d`), all via the same local-first pattern; verified live 2026-07-13:
  - **`library_overrides`** (per-gym, admin-write) — upsert blob on save, delete on reset.
  - **`brand_profiles`** (per-gym, admin-write) — partial upserts for skin id / custom tokens / branding. Skin id lives in **`brand_profiles.active_skin_id`** (migration `0004`, applied) because `gyms.active_skin_id` is read-only under RLS.
  - **`session_history`** (append) — `appendSessionHistory()` inserts one row per session; hydrate **merges** server+local by `ts` (never drops offline sessions), caps 100.
  - **`user_prefs`** (per-user) — disp prefs, crossfade, template tracks, exdb key, all `dj_*`.
  - Wiring differs from classes: a single **`store.hydrateAll()`** runs once at the App root, writes every domain into localStorage, and setStates the App-root-held values (brand/prefs/history). Child screens + on-demand readers pick up the hydrated localStorage on their own mount — no child call-site changes.

**🎯 Phase 1 local→Postgres storage migration is COMPLETE.** Every store.js domain now syncs. Next up the roadmap:
1. Extract data constants → `src/data/`, shared UI → `src/ui/` (zero-risk splits of the 8.4k-line monolith).
2. Phase 1 spine: Realtime room channels, QR/roster attendance capture (F4 — the data spine).
3. Tighten `class_schedule_rules` RLS to admin/coach-only once the Calendar UI gates it (currently any gym member can write — see the note in `0003`).

Full phased plan + task list: see the Fable spec doc and the build-plan doc.

## Deferred / notes

- `IntegrationsScreen` is still full mock theatre (fake ClassPass/Stripe/Wearables "connected" cards) — flag or rebuild before demoing it.
- The legacy PIN screen still gates entry ahead of Google — redundant now; consider removing.
- Carryover: redeploy the `smart-build` Edge Function (Supabase → Edge Functions → paste `supabase/functions/smart-build/index.ts` → Deploy) if the LLM brand recommendation isn't live.
