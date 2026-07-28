# Jungle — Session 5 Build Prompt (post-audit)

_Paste this whole file as the opening message of the next session._
_It supersedes `NEXT-SESSION-PROMPT.md` — it folds that brief together with the Fable audit
(2026-07-19), whose decisions govern this session. Written against `main` = `1b18442`,
**4 commits unpushed**, `App.jsx` = 9,456 lines._

---

## The product, in one paragraph

Jungle is a **white-label class operating system for boutique fitness studios** — React + Vite +
Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by
whether it improves the life of the **trainer** (plans faster, runs the room without fighting
software), the **owner** (sees who is slipping away, looks premium), or the **member** (walks
into a room that knows them). A feature that improves none of those three is theatre, and this
repo deletes theatre.

**Commercial context:** Dylan launches at the Singapore gym he freelances at (The Garage), then
sells to other gyms. The audit set the USP: *Jungle learns how each coach already programs — from
the slides they've been writing for years — and turns that into branded, ready-to-run classes on
the studio's own screens, while quietly building the attendance record that shows who's about to
quit.* The Slides import is the wedge. Retention is the ~day-90 upsell, not the pitch.

## Start here

- **Repo:** `C:\Users\dylan\jungle-app` (request folder access first).
- **Confirm:** repo access, `git status`, gates green (`lint:crash` → `test` → `build`). Then
  **propose a plan before editing.**
- **Read, in this order:**
  1. This file.
  2. `WEEK-PLAN.md` — the day-by-day build order for this session. **This is the priority list.**
  3. `AUDIT-FINDINGS.md` — what to cut/quarantine/keep, with file:line references (verified at
     `1b18442`; they drift as you edit).
  4. `UI-UX-DIRECTION.md` — §4 is the complete replacement-copy table for the language pass.
  5. `SESSION-HANDOFF.md` — ground truth on what exists and how it got here.
  6. The as-built spec + `SPEC-PATCHES.md` (apply the patches as part of the docs pass).
  7. For direction questions: `PRODUCT-DIRECTION.md`, `TECH-PLAN.md`, `REGRESSION-PLAN.md`,
     `GTM-SINGAPORE.md`, `LEGAL-AND-SECURITY.md`.
- **Where docs disagree:** on the *state of the code*, SESSION-HANDOFF + the code win. On
  *direction*, the audit files win. Update the losing doc when you notice a conflict.
- **Live site:** https://killdylz.github.io/Jungle-App/ — deploy = push to `main`.

## Decisions already made — do not relitigate

1. **Music/Auto-DJ is cut from the sellable product.** Quarantine behind `FLAGS.music=false`
   (default off), move code to `src/music/` untouched, hide every surface (Builder right column,
   runner Auto-DJ tab, Dashboard card). `TempoGuide` survives. Do not spend any budget improving
   music.
2. **Mobile is the top UI priority.** Below 900px the sidebar becomes a bottom tab bar
   (Run · Build · Members · Brand · More). The sticky 238px sidebar at phone width is the
   single largest claim/build gap.
3. **PWA now** (manifest + service worker + **self-hosted fonts** — the Google-Fonts CDN load in
   `App.jsx:34-41` breaks the offline claim). React Native and Tauri are struck from the roadmap;
   BLE, if ever, means Capacitor.
4. **QR self-check-in is deferred, not promised.** Coach sweep is the pilot path. The Edge
   Function design (short-lived HMAC class token + service-role write) is in
   `LEGAL-AND-SECURITY.md` §4 for when a gym asks. **Never loosen RLS to `anon`.**
5. **N4 magic-link member summary is promoted to core** — the only member-visible surface, plus
   a gym-branded share-card PNG export. Build it this session (Day 5).
6. **Templates and Glossary retire as nav destinations.** Starter templates become "Jungle
   presets" in the Builder's class-type picker; real glossary cues fold into the Exercise
   Library. Rename the invented exercises ("Atlas Press"→Overhead Press, "Serpent Row"→
   Single-Arm DB Row, "Primal Squat"→Back Squat, "Cobra Push-Up"→Push-Up) across
   `src/data/library.js`, `templates.js`, `glossary.js`.
7. **White-label leaks get fixed:** footer `© Dylan Rodrigues` (`App.jsx:9448`) → gym brand
   line; `index.html` title "jungle-app" + Vite favicon → "Jungle" + real favicon;
   "Shoreditch · 3 studios" (`App.jsx:2737`) and the dead Demand-heat/Auto-fill buttons go.
8. **Delete flagged-off theatre** (git history keeps it): `MemberScreen` (~`:3178-3454`),
   `IntegrationsScreen` (`:2138-2276`), Discover feed internals, the b64 attendee path
   (`:467-505`, `:9264`), `BASE_SCHEDULE` (`:827-849`).
9. **"Coach Personas" is renamed "Coaches"** everywhere a coach can see, and the full U1
   language pass applies `UI-UX-DIRECTION.md` §4 mechanically — including a `SCHEME_LABEL` map
   so raw enums (`sets_reps`) never render. Rule: **never show a coach the words** parser, JSON,
   corpus, extraction, Edge Function, Supabase, persona-ai, blocks, non-2xx, or a confidence
   percentage. Errors say what to *do*.
10. **Playwright lands this session** on the localStorage build: the 6-test suite in
    `REGRESSION-PLAN.md` §1 (it is designed to catch exactly the defect classes unit tests
    missed in session 4), run in CI after `npm test`.
11. **One multi-tenant Supabase project for all gyms.** The free-tier constraint is declared
    over commercially (Supabase Pro for backups is a Dylan action) — but **you still never add
    paid services or migrations without asking Dylan**.
12. **Cold start (D3):** a brand-new coach with zero plans must be able to name a class type,
    pick a preset shape, and draft — before any import.

## ⛔ Blocking — Dylan actions (queue these, never simulate them)

1. `git push` — 4 commits sit local; nothing from session 4 has deployed.
2. Apply migration **0008** (staging first once the staging project exists, then prod).
3. Create the staging Supabase project (free) + apply 0001–0008; upgrade prod to **Pro**.
4. Redeploy `persona-ai` (paste v8) — then the blueprint→generate path can finally be verified.
5. **Live sync check ×3** — run a class, sweep two names, confirm rows in Postgres. This path
   has failed twice; it stays manual until it passes three times.
6. Cross-device Room TV **Follow** test (two signed-in devices). Coded, never verified.
7. Physical offline soak at the gym (router off 5 min mid-class) — only after the PWA ships.
   P7 flips to ✅ only when this passes.
8. Lawyer (IP letter + templates) and the gym pilot conversation — started, long-lead.

## The build order (from WEEK-PLAN.md — one day per block, each ends gates-green + dev-server-driven)

- **Day 1 — cut & quarantine:** decisions 1, 6, 7, 8 above. Add the Playwright smoke test
  (PIN → Dashboard → Builder → Runner → play → Check-in → Room TV; assert no console errors).
- **Day 2 — mobile:** bottom tab bar <900px; Builder/Coaches screens stack; runner + check-in
  thumb-audited on a real phone width.
- **Day 3 — PWA + offline truth:** self-hosted fonts, manifest, service worker; Playwright
  offline test (`context.setOffline(true)` mid-runner → timers never blank → recovery syncs).
- **Day 4 — language + cold start:** full U1 copy table; D3 preset-first flow; Playwright tests
  1–5 (catalog truth, re-derivation, class shape, at-risk count consistency, draft→Builder).
- **Day 5 — the member link (N4):** Edge Function issues a signed token (Dylan deploys);
  read-only gym-branded class page; canvas share-card PNG; link surfaced post-class and on the
  member row.
- **Day 6 — trust pass:** I5 RLS tests for 0001–0006 (copy the 0007 self-test pattern); Sentry
  free tier wired into the existing ErrorBoundary; UptimeRobot; `wa.me` win-back drafts from the
  at-risk screen (drafts only — the coach sends; check the consent scope per
  `LEGAL-AND-SECURITY.md` §1).
- **Day 7 — dress rehearsal:** full manual QA script (`REGRESSION-PLAN.md` §2) at the gym;
  fix fallout only; apply `SPEC-PATCHES.md`; update `SESSION-HANDOFF.md`.

**Explicitly deferred — do not start:** QR Edge Function, booking/payments/wearable
integrations, N2 cohort analytics, App.jsx decomposition stages 4–5 (Builder/Runner cluster),
code splitting, delta writes (I10), Capacitor, anything music.

## Constraints and gotchas — these have all bitten before

- **No infra changes** (DB migrations, new services, paid APIs) without asking Dylan.
- **Edge Functions deploy by Dylan pasting into the Supabase dashboard** — queue, don't assume.
- **A Postgres CHECK constraint rejecting a client value is this repo's recurring data-loss
  bug** (three occurrences). Pin legal values in one shared constant with a unit test. Current:
  `persona_plans.source`, `attendance.source` (`store.js`), `RETENTION_RULES` (`retention.js`),
  `RETENTION_ACTIONS` (`store.js`), `CATEGORIES` (`movementTaxonomy.js`).
- **When you add tests, MUTATE THE CODE to prove they can fail — and confirm the mutation
  actually applied** (two mutations in session 4 silently no-op'd and looked like weak tests).
  Use a helper that hard-errors when its target string is absent.
- **Drive the real UI before claiming done.** Six session-4 defects were found only this way.
  Read back the **STORED** object (`localStorage`), not just the rendered one.
- **Watch for NUL bytes** in written source; scan before committing if anything reads as binary
  to git.
- Local `vite build` can serve **stale** `App.jsx`. Trust the dev server and CI, not local
  `dist/`. Validate syntax with `@babel/parser` / eslint when in doubt.
- A second chat often holds port 5173 — run your own dev server on `--port 5180 --strictPort`,
  and **revert `.claude/launch.json` before committing**.
- Browser-pane **screenshots hang** on this app — use `read_page` / `get_page_text` /
  `javascript_tool`. React batches state updates: one PIN digit per `javascript_tool` call.
  Local build has no Supabase → PIN is `080921`; the sync path is NOT exercisable locally.
- PowerShell: `npm.cmd` / `npx.cmd`; multi-line commit messages via `git commit -F <file>`.
- The crash gate (`npm run lint:crash`) must be **0** and is NOT the ~215-message style
  baseline (`npm run lint`). **Never relax a rule to get a deploy out.**
- The engineering culture rule that governs everything, including copy and commercial numbers:
  **an honest blank beats a confident wrong guess.**
