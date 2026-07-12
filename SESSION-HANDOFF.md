# Jungle — Session Handoff

_Last updated: 2026-07-12_

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
- **Possible pending push:** the Google-avatar/logout change may be uncommitted — check `git status` and push if so.

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

1. **`src/lib/store.js` repository seam (highest-leverage)** — wrap every localStorage key behind one module (`getClasses/saveClasses`, library, brand, history, prefs, caches). This is the migration seam everything in Phase 1 depends on. **Do NOT start the Postgres schema before this seam exists.**
2. Extract data constants → `src/data/`; shared UI → `src/ui/` (zero-risk splits).
3. Phase 1: Postgres schema + RLS, Realtime room channels, QR/roster attendance capture (F4 — the data spine).

Full phased plan + task list: see the Fable spec doc and the build-plan doc.

## Deferred / notes

- `IntegrationsScreen` is still full mock theatre (fake ClassPass/Stripe/Wearables "connected" cards) — flag or rebuild before demoing it.
- The legacy PIN screen still gates entry ahead of Google — redundant now; consider removing.
- Carryover: redeploy the `smart-build` Edge Function (Supabase → Edge Functions → paste `supabase/functions/smart-build/index.ts` → Deploy) if the LLM brand recommendation isn't live.
