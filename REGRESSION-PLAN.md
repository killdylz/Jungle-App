# REGRESSION-PLAN — E2E tooling, manual QA script, the must-fix list, offline proof

_Fable audit, 2026-07-19. Context: 295 mutation-verified unit tests, and still six real defects
in session 4 found only by driving the UI. The lesson is already in the repo's memory: unit
tests pin logic; they cannot see wiring, state, or the stored object._

## 1. Tooling verdict: Playwright, on the localStorage build

| Option | Verdict |
|---|---|
| **Playwright** | **Yes.** Free, runs headless in GitHub Actions, can click the real UI *and* read back `localStorage` (the repo's own rule: verify the STORED object). Setup ~half a day |
| Vitest browser mode | No — component-level, misses cross-screen wiring, still maturing |
| Stay manual | No longer viable alone — the manual walk is 30+ min and skipped under pressure, which is precisely when it's needed |

The no-Supabase PIN build is the test target: deterministic, no network, and it exercises the
same store/UI code paths (sync no-ops cleanly). Sync itself stays a manual live check (§3).

**The suite that would have caught session 4's six defects** (write these first, ~1 day):
1. **Import → catalog truth.** Paste a fixture deck → assert catalog rows: names, equipment,
   *category* (catches the Hanging-Knee-Raise misclass + SkiErg blank), and the stored
   `jungle_persona_movements` object matches the rendered rows.
2. **Rules re-derivation.** Seed localStorage with a stale stored category → open catalog →
   assert display shows the re-derived value (catches the stale-`categoryOf` class).
3. **Class shape.** Derive blueprint from fixtures → assert slot keys are generic (`M1`, not
   `M1 — Deadlift`) and warm-up slot draft contains no `strength`-category movement (catches
   both blueprint defects).
4. **At-risk consistency.** Seed attendance fixture → Members screen → assert the headline count
   equals the number of rendered flag rows (catches the "2 vs 3" defect).
5. **Draft → Builder.** Generate a draft from a persona → assert Builder's `classChoice` and
   stage contents match the stored plan (the item-9 class of bug).
6. **Smoke path.** PIN → Dashboard → Builder → Runner → play → Check-in add name → Room TV
   renders stage text → back. Assert no console errors (this alone catches the white-screen /
   `ReferenceError` class the crash gate can miss when the identifier resolves but throws).
Run in CI after `npm test`, before `build`. Keep it under ~2 min.

## 2. Minimum manual QA script before each release (~12 min, phone + laptop)

1. Live build: Google login works; Personas hydrate (no sync banner).
2. Import one real deck (or paste text) → plans appear → **reload** → still there (the vanish-bug
   class). Check Supabase table editor: rows exist.
3. Run a class 2 min on the phone; sweep two check-ins; confirm rows in Postgres (not just
   localStorage) — this is the twice-failed path; it stays manual until it has passed 3× in a row.
4. Room TV on the laptop: Follow shows green dot; stage advances within 1s of the phone.
5. Kill Wi-Fi on the display for 60s mid-class → timer keeps running → restore → Follow recovers.
6. Brand Studio: switch skin → runner + TV re-skin; WCAG panel all-AA.
7. Mobile width: nav usable, runner usable, check-in usable.

## 3. Must-close before a paying gym touches it (the honest bug list)

| # | Item | State |
|---|---|---|
| 1 | ~~`git push` — 4 commits local~~ → **6 commits local (session 5)** | Session 4's 4 were already pushed when session 5 opened — `origin/main` equalled `1b18442`. This blocker was stale as written |
| 2 | Migration 0008 apply (staging → prod once staging exists) | Dylan, 10 min |
| 3 | **Live sync check ×3** (the path that failed twice) | Dylan + script above §2.3 |
| 4 | Cross-device Room TV Follow | Dylan, 10 min, never done |
| 5 | persona-ai redeploy (v8) → then verify blueprint→generate once | Dylan paste + 15 min |
| 6 | Offline soak (§4) | 1 session |
| 7 | QR self-check-in | **Cut from promises** (design ready in LEGAL §4 when wanted) |
| 8 | ~~Mobile layout (AUDIT 1.1)~~ | **Done** `262c83f` — bottom tab bar below 900px. See the correction in AUDIT 1.1: the 375px/63% measurement did not reproduce; the real gap was 480–900px |
| 9 | ~~I5 RLS tests 0001–0006~~ | ✅ **Done** — `supabase/tests/0001_0006_rls_selftest.sql`, written and run. _Status corrected 2026-07-25._ |

## 4. Testing the offline claim honestly

Two layers, both required before "survives Wi-Fi loss for a full class" is ever said to a buyer:
- **Automated:** Playwright `context.setOffline(true)` mid-runner → advance stages with clock
  control for a simulated 45 min → assert timers/stage state never blank, then `setOffline(false)`
  → assert history write lands and sync ledger drains. Catches regressions forever after.
- **Physical, once, at the gym:** run a real class-length session on the actual TV + phone on gym
  Wi-Fi; pull the router's plug for 5 minutes mid-class; note member-visible effect (should be
  none) and recovery time. **Prerequisite that will fail today:** fonts load from Google's CDN at
  runtime (`App.jsx:34`) and there is no service worker — so a cold-loaded display without
  network does NOT survive. PWA + self-hosted fonts (WEEK-PLAN day 3) is what makes this test
  passable; run the test after, and only then update the spec's P7 row to ✅.

  > **UPDATE (session 5, `77cbb0b`): the prerequisite is now met.** Both CDN font loaders are gone
  > (all six skin families are bundled) and a service worker precaches the bundle, CSS, fonts and
  > icons. Verified locally by **stopping the preview server** and reloading: the app boots, both
  > skin fonts report `loaded`, the PIN unlocks, the Runner renders, and a check-in for a new
  > member writes to localStorage with `source='coach'`.
  > Two bugs had to be fixed to get there, both invisible to reading: `res.clone()` called after
  > the body was read (cache silently stayed empty), and `Vary: Origin` causing every `@font-face`
  > request to miss the precache — offline the app worked *in system sans*, which is exactly the
  > kind of half-working nobody can diagnose from a gym floor.
  > **The physical soak is now the only thing between here and P7 ✅.**
