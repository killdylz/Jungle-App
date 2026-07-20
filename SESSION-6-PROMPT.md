# Jungle — Session 6 Build Prompt

_Paste this whole file as the opening message of the next session._
_Written 2026-07-20 at the end of session 5. `main` = `14be355`, **pushed**, tree clean._
_Supersedes `SESSION-5-PROMPT.md` and `NEXT-SESSION-PROMPT.md` — both are now history._

---

## The product, in one paragraph

Jungle is a **white-label class operating system for boutique fitness studios** — React + Vite +
Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by whether
it improves the life of the **trainer** (plans faster, runs the room without fighting software),
the **owner** (sees who is slipping away, looks premium), or the **member** (walks into a room that
knows them). A feature that improves none of those three is theatre, and this repo deletes theatre.

**Commercial context:** Dylan launches at the Singapore gym he freelances at (The Garage), then
sells to other gyms. The USP: *Jungle learns how each coach already programs — from the slides
they've been writing for years — and turns that into branded, ready-to-run classes on the studio's
own screens, while quietly building the attendance record that shows who's about to quit.*

## Start here

1. **Confirm state:** `git status` (expect clean), `main` = `14be355` and pushed.
2. **Check CI.** Session 5 added Playwright to `.github/workflows/deploy.yml` and **that CI run has
   never been observed**. It passes locally on Windows; it has never run on a Linux runner. If the
   deploy went red, that is almost certainly why — start there, not with a feature.
3. **Gates:** `npm run lint:crash` (must be 0) → `npm test` (348) → `npm run test:e2e`
   (20 pass + 1 `fixme`) → `npm run build`.
4. **Read, in this order:**
   1. This file.
   2. `SESSION-HANDOFF.md` — the session-5 block at the top is current and includes three
      **corrections to the audit docs**. Read those before trusting `AUDIT-FINDINGS.md`.
   3. `AUDIT-FINDINGS.md`, `UI-UX-DIRECTION.md`, `REGRESSION-PLAN.md`, `LEGAL-AND-SECURITY.md` —
      still the governing direction, with the corrections noted inline.
   4. The as-built spec + `SPEC-PATCHES.md` (still unapplied — see below).
- **Live site:** https://killdylz.github.io/Jungle-App/ — deploy = push to `main`.

## What session 5 did — `1b18442` → `14be355`, 13 commits

All seven days of `WEEK-PLAN.md` except the half of N4 that needs a backend.
App.jsx **9,463 → 8,700 lines** · 295 → **348 unit tests** · **20 Playwright e2e** · bundle
665 KB → **598 KB**.

Cut the theatre and quarantined music behind `FLAGS.music=false`; fixed the white-label leaks;
mobile bottom tab bar below 900px; PWA with self-hosted fonts and a hand-written service worker;
the full U1 language pass with a test that enforces it; D3 cold start; Playwright; the trust pass
(win-back drafts, RLS self-test for 0001–0006, device-local crash log); and the gym-side share card.

**Read `SESSION-HANDOFF.md` for the defect list.** The short version: six real defects, every one
found by driving the UI or by an e2e test, none by a unit test.

## ⛔ Dylan's queue — current as of this file

**Done:** `git push` ✅ · RLS self-test 0001–0006 ✅ · migration 0008 ✅

| # | Action | Why it matters |
|---|---|---|
| 1 | **Live sync check ×3** | Run a class, sweep two names, confirm rows in Postgres. Has failed twice; stays manual until it passes three times in a row. Still the single most important unverified path |
| 2 | **Physical offline soak** — router off 5 min mid-class | **Now possible for the first time.** PWA + self-hosted fonts landed and were proven locally with the server stopped. P7 flips to ✅ only when this passes on real hardware |
| 3 | **Install the PWA** on the phone and the room TV browser | Fastest sanity check of manifest + icons before the soak |
| 4 | Cross-device Room TV **Follow** test (2 signed-in devices) | Coded, never verified |
| 5 | Redeploy `persona-ai` (paste v8) | Blocks verifying the blueprint→generate path at all |
| 6 | Staging Supabase project + 0001–0008; prod → **Pro** | Backups. Free tier has none |
| 7 | **Decide: Sentry, yes or no** | It is a new **sub-processor** and crash payloads can carry member names — LEGAL §6 requires it in the gym's DPA. Not a library choice. The device-local crash log (`jungle_crash_log`, last 5) is the part that needed no third party |
| 8 | **Decide: deploy an Edge Function for the member link** | The only thing blocking the other half of N4 |
| 9 | UptimeRobot on the live URL | 5 minutes |
| 10 | Lawyer (IP letter + templates); the gym pilot conversation | Long-lead, runs in parallel |

## Build order for session 6

### 1. Fix the open defect — it is already written down and failing

`e2e/personas.spec.js` has a `test.fixme` marking a **real, reproducible defect**: drafting the
sample coach's S360 shape puts a **Chest-Supported Row in the warm-up**.

The chain is traced in a comment on the test. Short version: the warm-up slot's categories are
derived from the coach's own warm-up block, which contains `Banded Good Morning`; that classifies
as **strength** (`movementTaxonomy` matches `good morning`); so `strength` becomes legal for that
slot; the slot wants 4 movements and the catalog has only 2 the coach actually warms up with, so
the drafter reaches down the list and takes lifts to fill it.

`blueprints.test.js` already pins the intended principle — *"emits an EMPTY block rather than an
out-of-category movement"*. Under-filling a warm-up is honest; a barbell row in it is not.

Two candidate fixes, and **choosing deliberately is the task**:
- **(a) Drafter** — stop back-filling past a slot's PRIMARY categories; emit fewer movements
  instead. Safer and general; matches the existing empty-block principle.
- **(b) Taxonomy** — a *banded* good morning is activation, not a lift. Narrow the `good morning`
  rule to unbanded/barbell so `strength` never enters the slot at source. Also true, and helps
  other coaches.

Both may be right. **Delete the `fixme` marker when it's fixed — do not weaken the test.**

### 2. N4 member link — only if Dylan deploys the Edge Function

The share card half shipped (`f03a207`). The magic-link page needs a signed class token; the design
shape is in `LEGAL-AND-SECURITY.md` §4. **Do not build the page before the function exists** — that
is exactly the `<AttendeeView/>` mistake deleted on Day 1 of session 5: a route pointing at a
component nobody wrote, invisible behind a false flag. The Room TV's QR also stays removed until
the link is real.

### 3. `SPEC-PATCHES.md` — still unapplied

The only WEEK-PLAN item never touched. Mechanical; do it early while context is cheap.

### 4. Room TV floor board — a decision, not a bug

The floor board still shows two "coming soon" panels to the room (Benchmark of the Week, Output ·
avg watts). This is the same member-facing-absence problem the "No tracks" cut solved, on a surface
members read mid-class. Out of scope for the music cut; worth an explicit call now.

### 5. If there is room — App.jsx decomposition stages 1–2

`AUDIT-FINDINGS.md` §3.1. Stage 1 (shared helpers → `src/lib/colors.js`) is partly done — session 5
extracted `src/ui/labels.js`. Stage 2 is the leaf screens. Stages 4–5 stay deferred.

**Explicitly deferred — do not start:** QR self-check-in · booking/payments/wearables · N2 cohort
analytics · App.jsx stages 4–5 · code splitting · delta writes (I10) · Capacitor · anything music.

## Constraints and gotchas — all of these have bitten

- **No infra changes** (DB migrations, new services, paid APIs) without asking Dylan. Sentry counts
  as a service *and* a sub-processor.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue, never simulate.
- **A Postgres CHECK constraint rejecting a client value is this repo's recurring data-loss bug**
  (three occurrences). Pin legal values in one shared constant with a unit test. Current:
  `persona_plans.source`, `attendance.source`, `RETENTION_RULES`, `RETENTION_ACTIONS`, `CATEGORIES`.
- **Drive the real UI before claiming done.** Still true after adding e2e — the share card's
  "does the canvas actually draw anything" check exists because a blank card passes every pure test.
- **When you add tests, MUTATE THE CODE to prove they can fail, and confirm the mutation applied.**
  Session 5's mutation helper had its own bug: it verified persistence by checking the search string
  was gone, which is wrong whenever the replacement *contains* it (`"x = "` → `"x = undef || "`).
  Compare against the original text instead.
- **RESIZING WITHOUT RELOADING SHOWS A STALE LAYOUT.** `useWindowWidth`'s listener does not repaint
  the components that read it under the test harness. This produced a **wrong finding in the audit**
  (AUDIT 1.1's "63% at 375px") and nearly a second one. Always reload after `resize_window`.
  Playwright is immune because it sets the viewport before navigating.
- **`Vary: Origin` silently breaks service-worker caching.** Precache entries are stored from a
  request with no `Origin`; the browser fetches `@font-face` in CORS mode *with* one, so fonts miss
  the cache and the app renders offline in system sans while everything else works. `ignoreVary: true`
  is load-bearing in `public/sw.js` — there is an e2e test proving it.
- **The browser tool's console buffer persists across navigations and reloads.** Stale HMR errors
  from a mid-edit broken state will look like current failures. Assert on the *rendered* state
  (`errorBoundaryShown`, root has children) rather than trusting the log.
- Local `vite build` can serve **stale** `App.jsx`. Trust the dev server, e2e and CI, not local `dist/`.
- A second chat often holds 5173. Session 5 used 5180 (dev), 5190 (preview), 5191/5192 (Playwright).
  **Revert `.claude/launch.json` before committing.**
- Browser-pane **screenshots hang** on this app — use `read_page` / `get_page_text` / `javascript_tool`.
  React batches state: one PIN digit per call. Local PIN is `080921`; sessionStorage
  `jungle_pin_ok=1` skips the keypad.
- **Watch for NUL bytes** in written source; scan before committing if anything reads as binary.
- PowerShell: `npm.cmd` / `npx.cmd`; multi-line commit messages via `git commit -F <file>`.
  Native-command stderr surfaces as a PowerShell error even on exit 0 — check the actual output.
- The crash gate must be **0** and is NOT the ~215-message style baseline. **Never relax a rule to
  get a deploy out.** It is legitimate to declare the correct *environment* (session 5 added Node
  globals for `e2e/**` and `scripts/**`) — that is not relaxing it, and there is a check proving
  `no-undef` still fires there.
- The rule that governs everything, including copy and commercial numbers:
  **an honest blank beats a confident wrong guess.**
