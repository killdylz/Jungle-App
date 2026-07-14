# Jungle — Session Handoff

_Last updated: 2026-07-14_

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
- **Repo state:** as of 2026-07-14, tree clean, `main` in sync with `origin`. Migrations **`0001`–`0005` ALL applied** to Supabase (`0005` = coach personas + plans + movements, applied this session). Full store.js → Postgres local-first sync is **live + verified** (all domains, incl. the 3 persona tables). `src/data/` monolith split **started**. **Workstream D (coach personas): chunks 1 (UI + aggregation) & 2 (`persona-ai` Edge Function — LLM extract + generate) DONE + LIVE; chunk 3 (Google Slides connector) is the next build.** Workstreams A / B+C still open. (`.claude/` dev config left untracked.)

## ✅ Foundations already in place (earlier sessions)

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

**🎯 Phase 1 local→Postgres storage migration is COMPLETE.** Every store.js domain syncs. This session the user said "go down the list and keep working" + added feature priorities → **four active workstreams**:

**A — Monolith splits (Fable §4.5, zero-risk).** ▸ IN PROGRESS. `TEMPLATES` + `GLOSSARY` extracted to `src/data/` (`c2b5e36`, build-verified, both screens render). NEXT: `WORKOUT_LIBRARY` (App.jsx ~937–1613) + `STAGE_LIBRARY_MAP` (~1614) + `CLASS_STAGE_TEMPLATES` (~1650) → `src/data/library.js` — **big block; move via PowerShell splice on host files, not the Edit tool** (self-verifying method: an exact-match removal proves byte-fidelity). Then shared UI (`Btn/Input/Select/Tag/BrandLogo/StatCard`) → `src/ui/`.

**B + C — Class Runner umbrella + merged Room TV.** ▸ PLANNED, not started. Today the RUN nav = 4 items: Live Runner (`live`→`LiveScreen` 6717), Studio TV (`overview-display`→`OverviewDisplayScreen` 7142), Floor TV (`floor-live`→`FloorLiveScreen` 7352), Auto-DJ. Plus an in-runner `display`→`DisplayScreen` 7453. GOAL (user ask): ONE **Class Runner** nav entry with sub-modes (Run / Room TV / Auto-DJ); **merge OverviewDisplay + FloorLive + Display into one `RoomTV` component** with a mode switch, governed by Fable P1 ("now over next", current move ≥60% visual weight) + P2 ("10-foot rule", legible at 8m). Later: Supabase Realtime room channels so the TV is a separate device from the coach's phone (Fable's "missing organ").

**D — Coach-persona class planning.** ▸ Coach-first Personas UI (chunk 1) BUILT + verified (2026-07-14) — see the dedicated section below.

**Roadmap after these:** F4 attendance spine (QR self-check-in + coach roster sweep) + Realtime channels → F5 analytics. Tighten `class_schedule_rules` RLS to admin/coach once the Calendar UI gates writes (`0003` note). Full phased plan: the Fable spec doc.

## 🧠 Workstream D — Coach-persona class planning (big new capability)

**Goal:** ingest years of historical class plans (the user's gym stores them in **Google Slides**) and let Jungle plan new classes at a **persona level** — recognizing exercises, rep/set schemes, and structure across class types, per coach. Maps to Fable **F2** (AI programming) deepened with personas.

**Decisions locked (2026-07-14):**
- **Model approach = "both, phased":** **extract → RAG now** (structured extraction + persona/style context fed to the LLM at generate time), fine-tuning kept as a *later* option once the corpus is big + clean. NOT fine-tuning first.
- **Persona-FIRST workflow:** you DEFINE/CHOOSE a persona up front, then CONNECT data to it — no auto-inference from folder names or clustering. `kind` = `coach | format | house`.
- **Ingestion:** Google Slides API is **free** (only the LLM extraction costs tokens). Slide text is baked into slide graphics → the **Slides API** (structured text runs per shape) beats OCR. Manual/paste import is fine for prototyping first.

**Prototype PROVEN on 6 real "The Garage" decks:** parsed cleanly into structured JSON; detected **3 house formats** — **S360** (strength: `Warm Up 5min → M1 barbell primary w/ DB regression + ladder|5×5 + "1st set as primer" + RIR 2 + rest 3min → A1+A2 & B1+B2 antagonist supersets, 3 rounds, "go to B/A after" → C1 finisher, rest 90s`), **GC (Fundamental)** (conditioning: `C1 warmup → C2/C3` interval / AMRAP / rep-target circuits, erg-heavy), **Garage Enduro** (periodized endurance, "Week X of 24", runs+ergs+sled, RPE-driven). Extraction captured rep-ladders (`12-10-10-8`), RIR, rest, superset rotation, regressions, per-side, rep targets, intervals, AMRAP, erg distances, RPE. Generated a NEW on-style **"S360 (Deadlift — Peak Strength)"** as proof.

**Extraction shape** (what a deck becomes): `{ facility, class_type, focus, date, blocks:[ { label, role:"warmup|primary_lift|superset|finisher|circuit", rotation, scheme:{ type:"sets_reps|rounds|time|interval|amrap", sets, reps:[], rir, rest_sec, note }, exercises:[ { name, equip, reps, per_side, regression, target } ] } ] }`.

**Schema:** `supabase/migrations/0005_coach_personas.sql` (`f69d8fd`, **DRAFT — not applied**) — `coach_personas` (name, kind, `style_profile` jsonb, aggregated from the corpus) + `persona_plans` (the corpus; `plan` jsonb holds the `{blocks}` extraction; dedupe on `source_ref`). Gym-scoped, admin-write RLS (mirrors 0003). Uses `public.set_updated_at()` from 0003.

**Model locked (2026-07-14): COACH-FIRST.** A persona is an individual coach (they plan their own classes in their **own personal Google Slides folder**). **Class type (S360 / GC / Enduro…) is a dimension WITHIN a coach**, carried on `persona_plans.class_type`. Ingestion is source-agnostic but **Google Slides is the first-class path**. Build order = 3 chunks: **(1) UI + aggregation** [DONE], **(2) extraction + generation Edge Function** [I write code, user deploys], **(3) Google Slides connector** [user does Google Cloud OAuth scopes + verification, I wire client].

**D — next steps (in order):**
1. ✅ **`0005` APPLIED (2026-07-14).** `coach_personas` + `persona_plans` + `persona_movements` live in Supabase (member-read / admin-write RLS). Persona sync is ON.
2. ✅ **CHUNK 1 DONE + LIVE (2026-07-14) — coach-first Personas UI.** `src/App.jsx`: `PersonasScreen` (coach → **class-type tabs** → per-CT derived profile + editable movement catalog + plans), `PersonaProfilePanel`, `MovementCatalog` (rename folds a variant into `aliases`; equip/notes editable; counts+scheme derived), `PersonaPlanEditor` (full block/exercise editor). `src/lib/personaAggregate.js`: `classTypesOf` / `aggregateClassType` / `aggregateMovements` — derived-profile + catalog logic the Edge Function will mirror server-side. `src/lib/store.js`: `persona_movements` domain + `hydratePersonas` pulls all 3 tables. Plus a **catalog auto-build** effect (imports/loads without movements build their catalog on open, guarded so it never clobbers edits). Verified live on the real 5-deck corpus: 3 class-type tabs (S360×3, GC×1, Enduro×1), 52 movements with correct per-CT counts + rest medians, rename-folds-alias, plan editor add-exercise → catalog recompute, auto-build on load, Draft/Generate into Builder. Host build clean.
3. ✅ **CHUNK 2 DONE + LIVE (2026-07-14) — persona LLM extract + generate.** ONE JWT-verified Edge Function `supabase/functions/persona-ai/index.ts` (folded the two-function "persona-extract + persona-generate" sketch into a single deployable with a `task` switch, mirroring `smart-build`). `task:"extract"`: deck text → `{ title, classType, focus, plan:{blocks} }`. `task:"generate"`: `{ persona, classType, brief, profile, catalog, examples }` → new on-style `{ title, plan:{blocks} }`. Client (`App.jsx`): **Generate draft** opens a brief (focus/duration/week X-of-N) → `persona-generate` grounded on the derived CT profile + movement catalog + up to 3 few-shot plans → `planToStages` → Builder; **Add plan → Paste deck text** → `persona-extract` → folds into corpus + recomputes catalog. Both have deterministic fallbacks (draft-from-recent / paste-JSON) when the function is absent or errors. Also added the missing `@keyframes spin` in `App.css`. **LLM cost: intentionally on the FREE Gemini 2.5 Flash path during testing** — provider resolves `PERSONA_LLM_PROVIDER` → shared `LLM_PROVIDER` → `gemini`, reusing the existing `GEMINI_API_KEY`. Upgrade persona to Opus 4.8 later with two secrets (`PERSONA_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`) — does NOT touch `smart-build`. LLM fires only on explicit button clicks. Verified live on the sample coach 2026-07-14.
4. ⭐ **CHUNK 3 — Google Slides connector** ← NEXT BUILD (user's Google Cloud infra, I wire client). Enable Slides + Drive API; add `presentations.readonly` + `drive.readonly` to the OAuth consent screen — ⚠️ **sensitive scopes → likely re-triggers Google verification** on the already-published login OAuth app. Per-coach consent (personal accounts/folders). Client: the "Import from Google Slides" button on a persona → pick folder → pull each deck's text → `persona-ai` (task:"extract"). Until then, the low-friction path is **Add plan → Paste deck text** (copy a deck's text → LLM extracts it).

**Real Garage corpus (private):** the user's 5 real decks (S360 Shoulder-Hypertrophy 11 Jul, S360 Deadlift-Hypertrophy 3 Jul, S360 Shoulder-Peak Strength 13 Jun, GC Fundamental 11 Jul, Garage Enduro Wk11/24) were extracted to the normalized shape and verified, but **deliberately NOT committed** (they'd ship in the public bundle). They're in a private one-time browser-console loader at `…\scratchpad\load-garage-decks.js` (creates a `house` persona "The Garage" + the 5 plans; catalog auto-builds; syncs to the user's Supabase). If that scratchpad file is gone in a new session, re-ask the user for the decks. The committed `src/data/personas.seed.js` is only the illustrative "Example Coach" sample.

## Deferred / notes

- `IntegrationsScreen` is still full mock theatre (fake ClassPass/Stripe/Wearables "connected" cards) — flag or rebuild before demoing it.
- The legacy PIN screen still gates entry ahead of Google — redundant now; consider removing.
- Carryover: redeploy the `smart-build` Edge Function (Supabase → Edge Functions → paste `supabase/functions/smart-build/index.ts` → Deploy) if the LLM brand recommendation isn't live.
