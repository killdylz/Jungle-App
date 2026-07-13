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
- **Unpushed local commit:** as of 2026-07-13 the tree is clean but `main` is one commit ahead of `origin` — the `0003` schema migration (`ef05f76`). `git push origin main` when ready (harmless: SQL-only, no app-code change, so the live build is unaffected).

## ✅ Done this session

- **Google login is LIVE and working** (Supabase Auth + Google OAuth). Allowlist gate in `supabase/migrations/0001_auth_foundation.sql`; admin email allowlisted. Google OAuth app published to production (no "unverified" warning).
- **Spotify is no longer an app gate** — removed the `if (!token) return <LoginScreen>` gate. Spotify is optional, connected post-login from Music Hub via `ConnectSpotifyPrompt` (any user for now; PT-only gating deferred).
- **Mock/theatre surfaces flagged OFF** via new `src/config/flags.js` (`mockAnalytics`, `mockMembers`, `mockSchedule`, `attendeeShare`) — Analytics KPIs, Members app, hardcoded `BASE_SCHEDULE`, calendar suggestions/leaderboard, DJ demo requests, attendee share view. Nav items hidden + render blocked with a "coming soon" placeholder.
- **Account identity fix** — sidebar/header/dashboard/profile avatar + name now use the Google identity (`displayProfile`), Spotify only as fallback. Log out now ends the account session (`auth.signOut()`), not just Spotify.

Files touched: `src/App.jsx`, `src/AuthGate.jsx`, `src/config/flags.js` (new).

## ⚠️ Environment gotchas

- **Sandbox mount is byte-capped** — the Linux bash mirror serves TRUNCATED copies of large files (`App.jsx`, `AuthGate.jsx`), so `npm run build` / `cat` on the mount are unreliable. The **Read/Edit tools see the true host files — trust those.**
- **Validate JSX edits** by parsing isolated snippets with `@babel/parser` in the sandbox, not by building the whole app locally. **CI is the real full-build check.**
- **PowerShell:** `npm`/`.ps1` blocked by execution policy → use `npm.cmd ...` or `powershell -ExecutionPolicy Bypass -File .\deploy.ps1`. Paste multi-line commands **one line at a time**.
- **Git index corruption** (rare): if git errors "bad signature / index corrupt" → `del .git\index` then `git reset` (rebuilds index; files untouched).

## 🗺️ Next steps (from the roadmap)

- ✅ **DONE — `src/lib/store.js` repository seam** (`f9f8514`). One module wraps every domain localStorage key (classes, library, brand/skin, history, prefs, DJ); ~30 App.jsx call sites route through it. Spotify tokens + derived caches intentionally excluded.
- ✅ **DONE — Phase 1 domain schema drafted + committed** as `supabase/migrations/0003_phase1_domain_tables.sql` (`ef05f76`). A Postgres home for each store.js domain, built on the 0001/0002 tenant + RLS model. Reviewed against 0001/0002 and the live call sites; `session_history` confirmed **append-only** (insert-only RLS). **NOT yet applied** — apply manually in Supabase SQL Editor (paste → Run; idempotent).

1. **Apply `0003` in Supabase** (SQL Editor → paste `0003_phase1_domain_tables.sql` → Run) so the tables exist before the swap.
2. **`store.js` → Supabase swap (the big one)** — change store.js internals from sync localStorage to async Supabase reads/writes (no App.jsx call-site shape change beyond going async). Threads `gym_id`/auth context, adds loading/offline handling. Note the two shape changes baked into `0003`: `type`→`class_type`, and `saveHistory` becomes an **append** (single insert, `ts` = `to_timestamp(Date.now()/1000)`), not a full-array overwrite.
3. Extract data constants → `src/data/`; shared UI → `src/ui/` (zero-risk splits).
4. Phase 1 spine continues: Realtime room channels, QR/roster attendance capture (F4).

Full phased plan + task list: see the Fable spec doc and the build-plan doc.

## Deferred / notes

- `IntegrationsScreen` is still full mock theatre (fake ClassPass/Stripe/Wearables "connected" cards) — flag or rebuild before demoing it.
- The legacy PIN screen still gates entry ahead of Google — redundant now; consider removing.
- Carryover: redeploy the `smart-build` Edge Function (Supabase → Edge Functions → paste `supabase/functions/smart-build/index.ts` → Deploy) if the LLM brand recommendation isn't live.
