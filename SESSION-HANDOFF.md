# Jungle — Session Handoff

_Last updated: 2026-07-20 (end of session 6)_

> **▶ STARTING A NEW SESSION? Paste `SESSION-7-PROMPT.md` as your opening message.**
> It supersedes `SESSION-6-PROMPT.md`, now history. Every session-6 build item is done.
>
> **CI is answered: it is GREEN on Linux, Playwright and all.** Session 5's unobserved deploy
> run passed at `14be355`, `6d64aaa` and `f2990b6` — the workflow ran `lint:crash → test →
> playwright install → test:e2e → build`, every step success. That was session 6's first
> question and it needs no further attention.

## 🟢 Shipped SESSION 6 — `f2990b6` → `fd98b5f`, 9 commits, all gates green

**Gates: `lint:crash` 0 · 399 unit tests (was 348) · 35 e2e (was 20 + 1 `fixme`) · build 610 KB.**
App.jsx **8,779 → 7,854** lines (−925). Deployed and CI-green on Linux at `9cd0e08`;
the last three commits push on top of that.

### The three that landed after the first push

| Commit | What |
|---|---|
| `a3a7f06` | **Constrained-column audit** — `dbConstraints.test.js` reads the MIGRATIONS and compares, instead of restating the list in a second copy. |
| `9ac7250` | **M1 Members CRUD** — add, inline edit (name · email · joined · status), active-only count. |
| `fd98b5f` | **I14 hydrate paging** — kills a silent truncation *and* a permanent re-push loop. |

| Commit | What |
|---|---|
| `ad45510` | **The open defect — fixed in the TAXONOMY, not the drafter.** A banded good morning is a primer, not a lift. `test.fixme` removed, unweakened. |
| `f3931ae` | **SPEC-PATCHES applied** (the last untouched WEEK-PLAN item) **+ 77 mojibake sequences repaired** in the as-built spec. |
| `e95be19` | **Floor board cut** — both "coming soon" panels gone, **plus a real z-index defect the new test found.** |
| `dcef7ee` | **Decomposition stage 1** — `src/lib/colors.js` extracted with 19 tests. |
| `d6a99a7` | **Stage 2a** — `AdminTeamScreen` out, **plus a TEAM_ROLES guard** against the DB enum. |
| `df59547` | **Stage 2** — Calendar + Roster out, **plus `e2e/screens.spec.js` closing a hole in the crash gate.** |

### 🔴 READ THIS FIRST: `lint:crash` cannot see undefined JSX components

**`no-undef` resolves plain identifiers but NOT JSX element names.** `const a = Foo` is caught;
`<Foo/>` is not. Verified with a probe file containing both — only the first is reported.

This is the `9f71f61` class of bug the gate was *built* for, in the one form it cannot see, and it
bit during this session: `RosterScreen` was extracted missing five JSX imports, and `lint:crash`,
373 unit tests and `vite build` were all green while the Members panel threw
`ReferenceError: ArrowLeft is not defined` on open. The error boundary turned it into a calm
"Something broke".

**Two things follow, and the second is a decision for Dylan:**

1. **A liveness check that does not name the error boundary will call a dead screen healthy.** An
   earlier check in this same session recorded that broken screen as `rendered: true` — the
   boundary renders, the root has children, and the word "Members" is in the sidebar. `e2e/screens.spec.js`
   now asserts the boundary is *absent* on all nine screens, plus each screen's own content.
2. **⛔ DECISION: add `eslint-plugin-react` for `react/jsx-no-undef`?** It is the only way to close
   the gate itself, and it is a **new dev dependency**, so it was not taken unilaterally. The e2e
   suite covers the same ground with existing tooling and is arguably the better guard (it asserts
   the screen *renders*, not that its identifiers resolve) — but it only covers screens someone
   remembered to list.

### 🟠 A dormant instance of that bug already in the repo — NOT fixed

**`<SpotifySearchModal/>` is used at `App.jsx:4353` and `:5018` and is defined nowhere.** It has
never thrown only because both call sites sit behind `FLAGS.music`, which is false — *exactly* how
`<AttendeeView/>` hid until session 5 found it. Left alone because music is explicitly out of scope,
but it is real, and it is the second confirmed case of the JSX blind spot letting one through.
Anyone flipping `FLAGS.music` should expect a white screen.

### The judgement call the prompt asked for, and why the data changed the answer

The `fixme` offered two fixes and said choosing deliberately was the task. **Option (a) — "stop
the drafter back-filling past a slot's PRIMARY categories" — cannot work**, and that only shows
up if you print the derived slot rather than reasoning about it:

```
Warm Up  role=warmup  want=4  cats=[warmup, mobility, strength, conditioning]
```

**All four categories tie at a count of 1.** There is no prevalence signal separating `strength`
from `mobility` here — the visible ordering comes entirely from the `CATEGORIES` tie-break. Any
rule that keeps a top tier and drops the rest either keeps `strength` (it ties for top) or drops
the coach's real mobility and conditioning warm-up movements with it.

Option (b) was simply true: the taxonomy was wrong. The rule is narrow on purpose — a banded hip
thrust is activation, but a banded *deadlift* is accommodating resistance on a loaded bar. Both
claims are pinned by tests. The warm-up now drafts as exactly the four movements the coach warms
up with, and every other slot fills better as a side effect (B1+B2 and C1 were under-filled
because the warm-up had been eating their movements).

### Defects found this session — again, none by a unit test

1. **The Room TV mode switch was unreachable in its default mode.** `OverviewDisplayScreen`
   ("Plan") renders `position:fixed inset:0` at `zIndex:500`; the mode bar sat at `zIndex:80`, so
   the Plan screen painted over it. Plan is the default whenever a class is not playing, so a
   coach opening Room TV *before* starting the class could not reach Floor, Coach, Follow or
   Exit — only the overview's own "← Esc" worked, making it read as "the switch does nothing".
   **This also made the cross-device Follow toggle unreachable in exactly the state you would set
   it up from — read this before attempting queue item 4.** Fixed at `zIndex:550` (above every
   display surface, below every modal). Found by writing an e2e assertion, not by looking.
2. **A regex bug in my own fix.** `banded?` reads as `"bande"` + optional `"d"` and never matches
   a plain "Band Good Morning". Caught by the unit test before commit; wants `band(?:ed)?`.
3. **The as-built spec was mojibake-corrupted** across §9–§13 — 77 sequences (`â€"`→`—`,
   `âœ…`→`✅`, `Â§`→`§`, `Â·`, `Ã—`, `ðŸŸ¡`) from an earlier session writing UTF-8 through a
   CP1252 round-trip. **The same trap bit live this session**: a PowerShell
   `Get-Content`/`Set-Content` round-trip corrupted `movementTaxonomy.js` mid-edit and had to be
   restored from a byte-exact copy. **Use the editor, not shell round-trips, on UTF-8 source.**
4. **Two dead functions** in the colour code: `nudgeForContrast` (superseded by the
   direction-aware `nudgeContrast`) and `resolveSubBrand` (FR-H8, implemented, never wired).
   Moved flagged rather than deleted — relocating is not the moment to decide a feature's fate.

### What mutation testing showed about the accessibility clamp — worth knowing

The clamp in `generateSkinFromPalette` **currently never fires.** The base construction already
lands text at 14–16:1 and muted at 4.9–6.8:1 for every seed tried, so removing the clamp entirely
changes no output. Breaking the other layer instead (text lightness `0.92 → 0.30`) also passes,
because the clamp then repairs 2.33:1 back to passing.

They are **redundant layers**, so `colors.test.js` asserts the *guarantee* — a generated skin is
accessible — rather than either mechanism. Breaking both fails it loudly. Pinning either
mechanism would break on a legitimate refactor while saying nothing about whether a coach can
read the screen. **The first version of that test passed with the clamp deleted**, which is the
lesson: a test that looks meaningful and has never been seen to fail is not evidence.

### The Room TV floor board — the decision, made

**Both "coming soon" panels are cut.** Same rule as the "No tracks" cut three lines above them in
the same component, and they were the worse offence: both were addressed to the **operator**
("Set a weekly benchmark WOD", "Connect a wearable/erg feed") while being projected at a wall
members read mid-class. Neither idea is deleted — a real benchmark board needs the PR data F1/N2
will produce, and a real output panel needs BLE (N7). When either has something true to say it
earns its panel back. The board now reads as nothing but what is happening in the room.

### Still NOT done

- **N4 magic-link — untouched and still correctly blocked** on the Edge Function. Not started,
  deliberately: building the page first would repeat the `<AttendeeView/>` mistake.
- **Decomposition stages 1 and 2 are COMPLETE.** Stage 1: `src/ui/labels.js` (session 5) +
  `src/lib/colors.js`. Stage 2: `AdminTeamScreen`, `CalendarScreen`, `RosterScreen` in
  `src/screens/`. **Stage 3 (music quarantine into `src/music/`) is next** and is where
  `<SpotifySearchModal/>` above will have to be resolved. Stages 4–5 stay deferred.
- **Two dead functions and one dead const**, moved-but-flagged rather than deleted during the
  extractions: `nudgeForContrast` and `resolveSubBrand` (FR-H8, implemented, never wired) in
  `colors.js`, and `SLOT_LABELS` in `CalendarScreen`. Deleting is a separate decision from
  relocating; they should not sit flagged indefinitely.
- **`TEAM_ROLES` is now guarded** against the `membership_role` Postgres enum by a test that
  READS the migration. That was a fourth unguarded instance of this repo's recurring
  constrained-column data-loss shape. **Worth auditing whether a fifth exists.**
- Sentry and UptimeRobot — still decisions/actions for Dylan, unchanged.
- ~~REGRESSION §1 tests 1, 3, 5 still unwritten.~~ **This was STALE — all six §1 items are
  covered.** 1 = "the movement catalog says what the class actually contains", 2 = "a category
  stored under older rules is re-derived", 3 = "slot keys are the format" + "no lift in the
  warm-up", 4 = the at-risk consistency pair, 5 = "a drafted class arrives in the Builder intact",
  6 = the smoke path. Session 5 wrote most of them and the note was never updated.

### ⛔ Dylan queue — unchanged from session 5 except where noted

Nothing was completed on Dylan's behalf; the list below is still the one that matters.
**One correction:** item 4 (cross-device Follow) was **blocked by the z-index defect above** and is
only now genuinely testable. **`git push` is NOT done — session 6's six commits are unpushed.**

**One item added:** decide on `eslint-plugin-react` (see the crash-gate section above). It is a
dev-only dependency, not a sub-processor like the Sentry question, so it is a much smaller call —
but it changes a CI gate, so it is still a call.

**⚠️ Item 1 (live sync check ×3) now has MORE to verify, not less.** `fd98b5f` changed how
`hydrateAttendance` fetches: it pages with `.range()` instead of `.limit(2000)`, and it only
re-pushes rows it can prove the server lacks. That path **cannot be exercised locally** — it needs a
live Supabase — so the pure merge decision is unit-tested and the I/O around it is not. When you run
the sync check, watch that attendance rows still land AND that a second hydrate does not re-push
rows that are already up there.

---

## 🟢 Shipped SESSION 5 — `1b18442` → `14be355`, 13 commits, all gates green, **PUSHED**

**All seven days of `WEEK-PLAN.md`, except the half of N4 that needs an Edge Function.**
App.jsx **9,463 → 8,700 lines**; 295 → **348 unit tests**, plus **16 Playwright e2e**;
bundle 665 KB → **598 KB**.

| Commit | What |
|---|---|
| `a125536` | **Day 1 — cut & quarantine.** Deleted MemberScreen, IntegrationsScreen, DiscoverTab + the fake packs rail, BASE_SCHEDULE, and the b64 attendee route. Music quarantined behind `FLAGS.music=false`. White-label leaks fixed (footer, title, favicon, "Shoreditch"). Fantasy movements renamed. Templates + Glossary retired from nav. |
| `5bb0392` | **Folds + a data-loss fix.** Templates → "Jungle presets" in the Builder picker; Glossary cues → Library rows. **The Builder's class was never persisted** — planned a class, closed the tab, lost it. `store.getDraftClass/saveDraftClass`. |
| `262c83f` | **Day 2 — mobile.** Bottom tab bar below 900px (Run · Build · Members · Brand · More), bottom sheet, safe-area insets. |
| `77cbb0b` | **Day 3 — PWA.** Self-hosted fonts (both CDN loaders gone), manifest, icons, hand-written service worker + build-time precache injection. |
| `9a83cc5` | **Day 4a — U1 language pass.** Label maps extracted to `src/ui/labels.js` **with a test that enforces the no-jargon rule**. "Coaches" rename, `SCHEME_LABEL`, all error rewrites. |
| `ee29861` | **Day 4b — D3 cold start.** A coach with zero classes can name a class type, pick a preset shape, and land in the Builder. |
| `a652a3e` `32f706d` | Docs, audit corrections, and a stale Library subtitle found on a smoke walk. |
| `6a12123` | **Day 1b — Playwright.** 16 e2e tests, ~17s, in CI after `npm test`. Smoke path, at-risk consistency, mobile, and offline against the **production** build. |
| `8ea9517` | **Day 6 — trust pass.** `wa.me` win-back drafts, RLS self-test for 0001–0006 (I5), device-local crash log. |
| `f03a207` | **Day 5 (half) — share card.** Gym-branded 1080×1920 PNG, client-side. |

### ⚠️ Three things in the audit docs that were WRONG — corrected here

1. **"4 commits unpushed" (SESSION-5-PROMPT ⛔ item 1, REGRESSION §3 item 1) was already false.**
   `origin/main` equalled `1b18442` at the start of this session. Session 4 *was* deployed.
   **Session 5's six commits are the ones now unpushed.**
2. **AUDIT-FINDINGS 1.1's headline measurement does not reproduce.** It says the 238px sidebar
   "stays a sticky 238px column — 63% of the screen" at 375px. It does not: `isMobile` was
   `vw < 480`, so at 375px a hamburger drawer was already in play. The reading almost certainly
   came from **resizing the window without reloading** — `useWindowWidth`'s listener did not
   repaint that component, and the same stale render appeared here before reloading. The real gap
   was the **480–900px band** (40% of a 600px screen, 31% of a 768px tablet) plus a top-left
   hamburger being the wrong corner for a thumb. The prescribed fix was right; the number was not.
3. **Retiring the Templates nav orphaned class export/import** — that screen was the only route to
   either. Caught by re-reading the diff, fixed in `5bb0392` (now "Save to file" / "Open" in the
   Builder). A worked example of the audit's own point that a fold is not the same as a deletion.

### Defects found by driving the UI (again, none by unit tests)

1. **The Builder's working class was never persisted.** Plan a class, reload, gone — behind a
   Dashboard button offering to "Resume building" it. Every other domain already persisted.
2. **`<AttendeeView/>` was referenced but never written.** Behind `FLAGS.attendeeShare=false`, so
   it had never thrown — and the Room TV's "Attendee QR" pointed at that route, promising members
   "scan to see today's session on your phone".
3. **Service worker `res.clone()` was called after the body was read**, so the asset cache stayed
   silently empty. Cloning must be synchronous.
4. **`Vary: Origin` broke font caching.** Precache entries are stored from a request with no
   `Origin`; the browser fetches `@font-face` in CORS mode *with* one, so every font missed the
   cache. Offline the app rendered perfectly **in system sans** — the worst kind of half-working.
   Fixed with `caches.match(..., { ignoreVary: true })`.
5. **The Builder nav icon was `🏻`** — a lone skin-tone modifier, rendering as a bare colour
   swatch reading "Builder".
6. **D3's preset could be picked and then did nothing**, because drafting was gated on the
   movement catalog, which is empty by definition for a new coach.

### Still NOT done, and the two that need a DECISION rather than time

- **N4 magic-link member page — the only genuinely blocked item.** It needs an Edge Function to
  issue a signed token (design in LEGAL §4's shape), which only Dylan can deploy. Building the
  page now would mean a route pointing at something that does not exist — exactly the
  `<AttendeeView/>` mistake deleted this session. **The share card half shipped** (`f03a207`),
  because it needs no backend. The Room TV's QR also stays removed until the link is real.
- **Sentry — a decision, not a task.** It would be a new **sub-processor**, and a crash payload
  can carry member names straight out of component props; LEGAL §6 requires sub-processors to be
  named in the gym's DPA. Not added unilaterally. The device-local crash log (`8ea9517`,
  `jungle_crash_log`, last 5) is the part that needed no third party — ask a coach to read it out.
- **UptimeRobot** — 5 minutes of Dylan's time on a live URL; nothing to build.
- `SPEC-PATCHES.md` not yet applied to the as-built spec.
- Room TV floor board still shows two "coming soon" panels (Benchmark, Output) to the room. Out of
  scope for the music cut, but the same member-facing-absence problem — worth a decision.
- REGRESSION §1 tests 1, 3 and 5 (import→catalog truth, class-shape derivation, draft→Builder)
  are not written; 2, 4 and 6 are, plus mobile, offline, win-back and share-card suites.

### The e2e suite — what it is for

`npm run test:e2e` · 16 tests · ~17s · runs in CI after `npm test`.
Every test asserts **no console errors**, which is the assertion that catches the white-screen
class: an identifier that resolves and then throws, which `lint:crash` cannot see and
`vite build` compiles happily. All four suites were mutation-verified — flipping `FLAGS.music`,
removing draft persistence, removing `ignoreVary` from the service worker, and putting an
undefined identifier in `e2e/helpers.js` each failed the right test.

### Verified this session, in the running app

PIN → Dashboard → Builder → preset → Runner → Room TV → Check-in, at 375 / 600 / 1280px, no
console errors. **Offline proven with the preview server stopped**: app boots, both skin fonts
report loaded, PIN unlocks, Runner renders, and a check-in for a new member writes to localStorage
with `source='coach'`. The sync path is still not exercisable locally.

### ⛔ Dylan queue, as of end of session 5 — supersedes the list in `SESSION-5-PROMPT.md`

| # | Action | Note |
|---|---|---|
| ~~1~~ | ~~`git push`~~ | ✅ **Done** — pushed at `14be355` |
| ~~1b~~ | ~~Run `0001_0006_rls_selftest.sql`~~ | ✅ **Done** |
| ~~2~~ | ~~Apply migration 0008~~ | ✅ **Done** — the at-risk action ledger now persists, so A3 is measurable |
| 3 | **LIVE SYNC CHECK ×3** | Unchanged, still the most important. Has failed twice; stays manual until it passes 3× |
| 4 | **Physical offline soak** — router off 5 min mid-class | **Now worth doing**: the PWA + self-hosted fonts landed, so this can pass for the first time. P7 flips to ✅ only after it does |
| 5 | Cross-device Room TV **Follow** test | Unchanged, coded and never verified |
| 6 | Redeploy `persona-ai` (v8) | Unchanged. Blocks verifying the blueprint→generate path |
| 7 | Staging Supabase project + 0001–0008; prod → Pro | Unchanged |
| 8 | Lawyer (IP letter + templates); gym pilot conversation | Unchanged, long-lead |
| 9 | **Decide on Sentry** | It is a sub-processor with member data in crash payloads — a DPA question, not a library choice |
| 10 | **Deploy a `checkin-token`-style Edge Function** if the member link matters for the pilot | The only thing blocking the other half of N4 |

**Install the PWA when you next open the live site** (Add to Home Screen on the phone, and on the
room TV's browser) — that is the fastest way to sanity-check the manifest and icons on real
hardware before the soak test.

---

## 🟢 Shipped SESSION 4 — `fd75fb0` → `823a492`, 4 commits, all gates green, **NOT PUSHED**

Persona depth, end to end. 164 → **295 tests**, every new test mutation-verified.

| Commit | What |
|---|---|
| `c54d184` | **D1 — movement taxonomy.** `src/lib/movementTaxonomy.js`: `CATEGORIES`, `classifyMovement`, `categoryOf`. Ordered rules copied from `inferEquip`; unknowns return `""` and surface as **"needs category"**. Wired into `aggregateMovements` and `classCategory`; catalog gains a category picker. |
| `4dd0e25` | **Dropped the `hyrox` category** on Dylan's call — *a circuit class can contain Hyrox movements*. Hyrox is a format, not a movement property. `HYROX_STATIONS` survives for the blueprint preset. Settles §13 Q8. |
| `275099f` | **D2 — Class Blueprints ("class shape").** Derive → present → edit → **deterministic local drafting** from the coach's own catalog. Stored in `style_profile.blueprints` (no migration). Settles §13 Q7. |
| `823a492` | **N3 UI.** At-risk list on Members, per-flag "why" with its numbers, append-only action ledger. **Migration 0008 written but NOT APPLIED.** |

**Six defects were found by driving the real UI, none by unit tests** — consistent with session 3's
lesson. Two more were found by mutation testing catching *weak tests*, not weak code:

1. `Hanging Knee Raise` classified as strength (generic `raise` rule ate it).
2. `categoryOf` trusted a stored value that goes stale forever — catalogs only re-aggregate when
   *plans* change, so an existing coach would never see a rules improvement. It now re-derives.
3. Blueprint slots were named `M1 — Deadlift`, baking one week's focus into a recurring slot.
4. **The first blueprint draft put a Conventional Deadlift in the warm-up.** Slot categories are
   legitimately broad; they are now ordered by prevalence and drafting reads that as priority.
5. The at-risk card showed "2" beside "3 members meet an at-risk rule".
6. `SkiErg` as one word returned blank after a refactor.

**Two process notes worth carrying forward:**

- **A mutation that appears "not caught" may simply not have applied.** Two did not, and looked
  like weak tests. The helper now hard-errors when its target string is absent. Always confirm the
  mutation landed before concluding a test is weak.
- **Seven NUL bytes were written into `blueprints.js`** where spaces were intended, and the
  resulting `join("\0")` *masked a real design bug* — slot keys contain spaces, so a real space
  separator would have shredded them. Sequence identity is now JSON. A repo-wide NUL scan is part
  of the pre-commit check now; re-run it if anything looks binary to git.

> ### 👉 STARTING A NEW SESSION? Paste `NEXT-SESSION-PROMPT.md` as your opening message.
> It is the cold-start brief: what Jungle is, what shipped, **the persona-depth build that is
> next** (editable Class Blueprints + a movement taxonomy), the UI-language pass, the
> desktop/mobile plan, and every gotcha. This file is the detailed history behind it.
>
> **The frame that governs every decision here:** Jungle is an **experience layer**. It is judged
> by whether it improves the lives of **trainers**, **gym owners** and **members**. Anything that
> improves none of those three is theatre, and gets deleted rather than shipped.

## 🧭 WHERE THIS IS GOING NEXT (read before picking up work)

Sessions 1–3 built the machinery: a deterministic parser, an attendance spine, sync guards, an
error boundary, retention rules. **The next phase is about giving that machinery back to the
coach as something they can hold and change.** Full design in as-built spec **§9**; the shape:

1. **Class Blueprints (D2).** A coach's format should be a first-class, *editable* object —
   `Garage Circuit = C1 Warm-up · C2 Circuit 1 · C3 Circuit 2` — **recommended from their own
   corpus, then edited by them**, never a fixed pipeline. Blueprints then drive generation (fill
   slots from their catalog) *and* parsing (the blueprint tells the parser that `C1` is a warm-up
   for this coach — exactly the ambiguity §4.3.2 had to guess at).
2. **Movement taxonomy (D1).** The parser reads structure but not meaning. It must tell a warm-up
   movement from a strength lift from a conditioning move from a **Hyrox** station — and keep all
   of those separate from modifiers (rest wording, RIR, RPE, tempo, "3 rounds"). Deterministic
   classifier → coach-editable override → batched LLM fallback for unknowns.
3. **The LLM's proper job.** Classify unknown movements, suggest a blueprint at cold start, draft
   *within* a blueprint the coach fixed, explain and narrate. **Not** decide structure, and not
   decide who is at risk. Presets are picked, not prompted.
4. **Take the technical language out of the UI (U1, §11).** "Add to corpus", "Paste JSON",
   "Extract & add", "the parser only understood 53%", "Edge Function returned a non-2xx status
   code" — a coach is not a developer. Name the outcome, not the mechanism.
5. **Desktop + mobile (§10).** PWA first (free, installable everywhere, and its service worker
   closes the untested offline-display assumption P7/I11) → Capacitor for the stores once N4 gives
   members a reason to install → Tauri only if a real desktop app is ever needed. React Native is
   a rewrite and only BLE heart-rate (N7) could justify it.

Full remaining feature list: spec **§12**. Fable review questions: **§13**.

## 🟢 Shipped SESSION 3 — `63e0f2b` → `73068dc`, 12 commits, all CI-green

Brief was: **build the parser first, LLM as fallback** — plus keep shipping from the
backlog. Four commits, each verified in the dev server before pushing.

1. **I1 — React error boundary** (`e447f92`). There was none, so any render throw
   white-screened the whole app — exactly what the Mic Mode `ReferenceError` did to the
   Live runner mid-class. Two boundaries: root (`main.jsx`, outside `AuthGate`) and
   **per-view in `App.jsx` keyed on `view`**. The second is the one that matters — the
   crash stays inside the screen that threw, the nav survives, and navigating away is
   itself a recovery path. Verified with a temporary throw in `GlossaryScreen`.

2. **⭐ I2 — DETERMINISTIC SLIDES PARSER, LLM DEMOTED TO FALLBACK** (`fadf318`). The
   session's headline. `src/lib/planParser.js`: pure, emits the extractor's exact shape
   plus a **confidence** and **reasons**, and **defers below `PARSE_THRESHOLD` (0.72)
   rather than guessing**. Wired into BOTH extraction call sites — the Slides import
   parses locally first and only batches deferred slides to persona-ai, and **the
   paste-deck path no longer needs Supabase at all** (it used to hard-fail without it).
   Measured on the house-format fixtures: **S360 → 0.88, GC → 1.0, zero model calls.**
   Provenance rides in `persona_plans.plan._extract`, deliberately NOT a new `source`
   value. See spec **§4.3.2** for how it works and which two disambiguations do the work.

3. **I3 — sync guard generalised to every domain** (`d0651cf`). The `_bgUpsert`-fails +
   server-wins-hydrate pairing had cost live data three times in one day, and the fix
   only covered `persona_plans`. Now two shared guards (`_guardList` for id-keyed lists,
   `_blobStale` for single-row blobs) cover all of them, `saveUserClasses` finally
   records failures at all (it console.warn'd only), and a new **`SyncBanner`** surfaces
   any unsynced domain — a guard that works silently looks identical to no problem.

4. **F4 slice 2 — CSV backfill + a real Members screen** (`e992d42`). `csvImport.js`
   (parse → validate → preview) + `store.applyAttendanceImport` (FK order, idempotent,
   `source='import'`). **`RosterScreen` replaces the flagged-off `MemberScreen` theatre**,
   so `mockMembers` no longer gates a nav entry. Two-step by design: analysis writes
   nothing, because `attendance` is append-only and a half-applied import can't be undone.

**Testing: 44 → 164 tests.** Every behaviour was mutation-checked (~60 mutations, all
verified to fail the suite). That process earned its keep three times:
- One test was **vacuous** — the unparsed-line penalty could be deleted with the suite
  still green. Isolating it exposed a real bug (coverage double-counted exercise lines).
- **Driving the real UI** caught three parser defects no fixture did: `DB Bench Press`
  tagged `barbell`, a bare `Finisher` line entering the movement catalog as an exercise,
  and a ladder-inferred set count overriding the coach's stated "3 rounds".
- The same UI pass caught `<Btn primary>` leaking an unknown attribute to the DOM.

5. **I4 — check-in duration instrumented** (`f3fda97`). P6 (<5s/member) and A7 (a kill
   criterion) were both unmeasurable. `checkinMetrics.js` measures the gap between
   consecutive check-ins, excludes-and-reports idle stretches >60s, and uses medians so
   one fumbled search can't swamp the sample. **With no data it reads "NO DATA", never a
   passing tick** — that was the whole point. Verified by driving a real 2s-cadence
   sweep: recorded `medianSec 2.002`, surfaced as "2s · MEETS TARGET". Local-only;
   persisting it needs a migration.

6. **Per-coach parse hints** (`9bb39e9`). The §4.3.2 follow-on: `deriveHints` feeds a
   coach's own movement vocabulary / class types back into the parser, so their notation
   stops being unknown and the deterministic share grows with every import. Demonstrated
   live: the same deck deferred at **53%**, then parsed at **1.0** once the movement was
   in the coach's corpus. Hints only ever *recognise* more — never invent; the mutation
   run caught that this safety property was untested.

7. **N3 — at-risk detection rules engine** (`73068dc`). `src/lib/retention.js`. Two
   transparent rules (**<4 visits in month one**, **14-day absence**) — **arithmetic, not
   AI**, exactly as the spec insists: an operator must trust the rule enough to phone a
   member about it, and a lawyer must be able to read it. Every flag carries the numbers
   that produced it. **The failure it is built around:** a naive absence rule flags the
   ENTIRE roster the moment a studio imports history, because a backfill is old by
   definition — 400 false alarms on day one teaches the operator to ignore the screen, and
   A3 ("do operators act on alerts?") gets answered by our bug instead of the market. So
   absence is gated on the studio recording recently; if it isn't, that's reported as a
   fact about the *data* ("alerts paused"), and `atRisk` is `null` — never `0`.
   ⚠️ **Engine only — no UI yet.** That's the first thing to finish (N3-UI in §12).

**⭐ RECOMMENDED NEXT** — see the top of this file and `NEXT-SESSION-PROMPT.md`:
1. **D1 — movement taxonomy.** The foundation blueprints stand on; immediately improves
   parsing and generation.
2. **D2/D3 — Class Blueprints + presets.** The main build.
3. **N3-UI** — at-risk list, per-flag "why", and **dismiss/acted state** (without it A3
   stays unmeasurable). The engine is already in.
4. **U1 — UI language pass** (spec §11).
5. **P1 — PWA** manifest + service worker; closes I11/P7 as a side effect.
6. **I5 — RLS tests for `0001`–`0006`** (only `0007` is covered).
7. **M1 — Members CRUD** — `RosterScreen` reads but can't edit; no status or joined date.

⚠️ **The QR self-check-in gap is UNCHANGED** — still needs an Edge Function with the
service-role key. Do not fix it by loosening `0007`'s policies to `anon`.

> 📘 **READ THE AS-BUILT SPEC FIRST:** `Jungle - Functional, Design & Technical Spec (As-Built).md`
> It now also carries **§7b (infra/fine-tuning backlog, I1–I15)**, **§7c (feature backlog — what
> has NOT been built)**, and **§4.3.1 — why the Slides import uses an LLM at all, and why it
> mostly shouldn't**. Those three sections answer "what's left and what should we improve"
> without re-deriving it from the code.
> — new this session. It mirrors the Fable spec's §2/§3/§4 headings section-for-section with
> verified build status per item (✅ built / 🟡 partial / ⛔ not started / 🎭 flagged off), the
> proposed `0007` schema, the full deprecation-list status, and §8 open questions written
> specifically for the **Design and Fable loops**. The Fable doc stays unedited as the dated
> review artifact; the as-built doc is the living one. Update it as you ship.

## ✅ MIGRATION 0007 IS APPLIED (2026-07-18) — F4 is unblocked

`supabase/migrations/0007_attendance_spine.sql` is **live**: `members`, `class_instances`,
`attendance` (insert-only), `consent_records` (append-only). Scope is deliberately **narrow** —
the F1 session primitive is NOT included, and `class_instances` is shaped so it can be added
later without altering existing columns.

**RLS verified 11/11 PASS, zero SKIP** via `supabase/tests/0007_rls_selftest.sql`. Re-run that
script in the SQL editor after ANY future policy change — it impersonates `role authenticated`
because the SQL editor runs as superuser and **bypasses RLS**, so a naive test passes trivially.
(Supabase warns about "destructive operations" and an RLS-less table — both benign: the deletes
are its own fixtures, and `_rls_results` is a temp table. Choose **Run without RLS**.)

⚠️ **NOT covered by that suite:** the `members_delete` admin-only policy, multi-gym membership,
and the `0001`–`0006` policies. Don't read 11/11 as "RLS is fully tested".

🚨 **KNOWN GAP — QR self-check-in cannot write through these policies.** Every `0007` policy
requires an authenticated staff user; a member scanning the room screen is on their own phone and
is NOT an auth user (that's the point of members-as-roster-rows). `source='qr'` needs an Edge
Function holding the service-role key that validates a short-lived, class-scoped token. **Do NOT
fix this by loosening the policies to `anon`.** `source='coach'` (roster sweep) and
`source='import'` (CSV) work today, so the first slice isn't blocked.

**✅ F4 CLIENT SLICE 1 SHIPPED** — `store.js` domains + the coach roster sweep. `ATTENDANCE_SOURCES`
is pinned in ONE place with a unit test (the persona_plans outage was exactly this constraint
class). Two things differ from every other store domain, deliberately: `attendance` is
**append-only** (the server has no update/delete policy, so a whole-list upsert would compile to
ON CONFLICT DO UPDATE and silently affect 0 rows — pushes use `ignoreDuplicates` = DO NOTHING),
and its hydrate **merges** rather than server-wins, because an offline check-in is the only copy
that exists.

**➡️ NEXT — F4 slice 2:** CSV backfill, then the QR Edge Function (see the gap above). A Members
management screen and the `class_instances` generator off `class_schedule_rules` are both still
unbuilt.

## 🔴 PENDING USER ACTIONS — check these first

> ⚠️ **Re-read #0 and #1 below in light of session 3's parser.** They are both now
> **much less urgent**: most slides never reach persona-ai at all any more, so the
> quota pressure that made `extract_batch` important has largely gone, and a Slides
> import no longer stalls on an exhausted daily quota unless a deck uses notation the
> parser defers on. Still worth doing — just not blocking.

0. ⬜ **Redeploy `persona-ai`** (Supabase → Edge Functions → paste
   `supabase/functions/persona-ai/index.ts` → Deploy) to activate **`task:"extract_batch"`**
   (v:8). This is the fix for the quota drain: the client now sends **5 slides per call**
   instead of 1, so an 18-slide deck costs ~4 calls instead of 18. **Safe to defer** — until
   it's deployed the batch call fails and the client falls back to per-slide automatically, so
   imports keep working exactly as before, just at the old quota cost. Detect the deploy with a
   `task:"extract_batch"` call with no `slides` → it returns `{"v":8}`.

1. ⬜ **Retry the Google-Slides import once the free Gemini quota resets.** The import feature is **CODE-COMPLETE and verified** — `persona-ai` is deployed at **v7** (Claude confirmed `"v":7` live) and the client splits a multi-class deck into one plan per slide. The ONLY reason it isn't finishing right now: extensive Claude-side testing on 2026-07-17 **drained the project's shared free-tier daily Gemini quota** (every model returned `limit: 0`). It resets on Google's daily cycle (~midnight US Pacific); after that, open Coach Personas → the coach → Slides import → List decks → Import, and the 18-slide "S360" deck imports as 18 dated plans. If it still stalls on quota, either wait longer or (optional, still free) swap `GEMINI_API_KEY` for a fresh key from a different Google project. Deep detail below in the Workstream-D section. **The whole Slides saga (v5 JSON-parse fix → v6 quota handling → v7 valid model chain → client per-slide split) is DONE and pushed; nothing to code there — just quota.**
2. ✅ **Legacy PIN screen — RESOLVED (2026-07-17).** Gated on build mode: `if (!supabaseEnabled && !pinUnlocked)` — the redundant PIN is dropped on the live (Supabase/Google-login) build, but kept as the sole gate on the no-Supabase (localStorage) build. Verified: offline build still shows the PIN; the Supabase build is gated upstream by AuthGate (login + allowlist), so the PIN can never be the sole gate there. (`App.jsx` PIN gate now ~`:8309`, `PinScreen` `:1248`, dev PIN `080921`.)
3. ⬜ **Cross-device Room TV test** — phone: Class Runner → play; laptop/TV: Class Runner → Room TV → **Follow** (green dot = receiving). If nothing arrives, check Supabase → Realtime enabled.

## 🟢 Shipped 2026-07-18 SESSION 2 — infra audit, P0 crash fix, extract hardening, as-built spec

`main`: `c8bc503` → `758878e`. Session brief was: audit infra for **free** improvements to the
extract pipeline and general feature health, then **update the Functional / Design / Technical
specs** ahead of running the Design and Fable loops.

1. **🔴 P0 — fixed a live crash** (`2b86e97`). `reduce` was **undefined in `LiveScreen`**:
   `9f71f61` added `prefersReducedMotion()` to RoomTV / DisplayScreen / FloorLive but **not** to
   LiveScreen, whose mic button reads it. `micMode && !reduce` short-circuits while mic mode is
   OFF, so it threw `ReferenceError` **the instant a coach armed the mic — crashing the runner
   mid-class**. Only reachable with Spotify connected, which is why last session's regression
   walk (local build, no `player`) never rendered the button.
2. **CI crash gate** (`2b86e97`) — *why the above shipped green:* `vite build` never resolves
   identifiers and CI runs only the build. New **`eslint.crash.config.js`** is a small
   must-be-zero rule set (`no-undef`, `no-const-assign`, `no-dupe-keys`, …) run **before** the
   build in `deploy.yml` (`npm run lint:crash`). The main config stays the unenforced ~215-message
   style baseline. ⚠️ **If this gate ever fails, it is real breakage — never relax it to ship.**
   Verified green in CI on `2b86e97`.
3. **Slides extract hardening** (`2b86e97`) — the quota drain was structural, not bad luck. Free
   Gemini meters **per request**, and one call per slide made an 18-slide deck cost 18 calls:
   - `persona-ai` gains **`task:"extract_batch"`** (N slides, one call, 32k output ceiling);
     client sends 5/call and **falls back to per-slide if a batch fails**, so batching can never
     cost an import. ⚠️ **needs your redeploy — see PENDING #0.**
   - **Client-side pre-filter** skips title/branding/playlist slides before spending a call.
     Deliberately conservative: a scheme word keeps a slide at *any* length — a unit test caught
     that a naive 40-char floor discarded a real slide (`"M1 Deadlift 5x3 @ RPE 8, rest 3min"`).
   - **Daily-quota exhaustion now aborts the import immediately** instead of retrying 6×30s per
     slide (which turned a dead import into a ~30-min hang before failing anyway).
   - **Plans commit per batch** — closing the tab at slide 15 of 18 no longer loses the lot.
4. **Local QR generation** (`758878e`) — `src/lib/qr.js` (`qrcode` dep, 0 vulns) replaces
   `api.qrserver.com`. Deprecation-list item and **F4 prerequisite**: a third party must not sit
   in the check-in path, and at F4 the payload identifies a member. Verified in-browser: 240×240
   PNG data URL, `#060D18` corner, `#EEEEEE` finder interior.
5. **📘 As-built specification** — `Jungle - Functional, Design & Technical Spec (As-Built).md`.
   See the banner at the top of this file.
6. **🧪 Vitest harness + 29 tests** (`889009e`) — the project had **no test runner at all**.
   `npm test` now runs in CI between the crash gate and the build, so there are **three gates**:
   `lint:crash` → `test` → `build`. Coverage is deliberately aimed at **silent** failures —
   `slidesImport` (link parsing, real slide numbers for `sourceRef` dedupe, per-slide dates, the
   pre-filter) and `personaAggregate` (`classCategory` → Builder type, alias folding,
   `commonScheme` camelCase, manual-edit preservation). All four of those have actually broken
   here before and none is visible by clicking.
   ⚠️ **The suite was mutation-checked, and it mattered:** zeroing `classCategory`'s role
   weighting initially broke **no test** — the fixture's scheme types carried the result alone,
   so the test was vacuous. A discriminating fixture was added; the mutation now fails exactly
   that test. **When you add tests here, mutate the code to prove they can fail.**
   `looksLikeClassSlide` moved from `App.jsx` → `src/lib/slidesImport.js` to be testable.

7. **🔴 Fixed a SILENT DATA-LOSS bug in Coach Personas** (`796debe`) — reported by Dylan: an
   imported class showed up fine, then **vanished after leaving the page**. Root cause was a
   schema/client mismatch: `0005` constrains `persona_plans.source` to
   `('google_slides','manual','jungle')`, but the client wrote **`"slides"`** (Slides importer)
   and **`"extract"`** (paste-deck path). Chain: local write succeeds → the upsert fails the
   CHECK → `_bgUpsert` swallows it to `console.warn` → `hydratePersonas` is **server-wins** and
   overwrites localStorage with a server list that never got the rows. Because the whole plan
   list upserts in ONE call, one bad row also blocked *valid* manual plans from syncing.
   Fixes: both call sites emit legal values; **`store.planSource()`** normalizes on write **and
   on read** (so a corpus imported before the fix heals itself); a **persisted sync-failure
   ledger** now stops `hydratePersonas` discarding local plans the server never received (it
   keeps + re-pushes them); the Personas screen shows a **warning banner** when plans haven't
   synced; plan rows show readable labels ("Google Slides") instead of raw enum values.
   **No migration needed** — `google_slides` is the schema's own name for that path.
   ⚠️ **Lesson worth generalising: any `_bgUpsert` failure + a server-wins `hydrate*` = silent
   data loss.** `persona_plans` is now guarded; the other domains still have the same shape.

**Audit findings NOT yet fixed** (all documented in the as-built spec §5): `sp_at`/`sp_rt`/`pkce_v`
still in localStorage (`App.jsx:372–403`); user-supplied RapidAPI key still in the UI
(`App.jsx:433`, `:5537`); Deezer BPM still called client-side (`App.jsx:525–533`). All three are
the same shape — client-side third-party access that the spec requires to be server-side — and
all three would be resolved by the `src/music/` + media-proxy work (§4.5 step 5).

**Also worth knowing:** the project has **no test runner at all**. The crash gate is the only
automated quality signal. The spec calls RLS + attendance-immutability tests "non-negotiable", and
F4 is precisely the feature whose failure mode (silently wrong attendance) manual clicking cannot
detect. Strongly recommend adding Vitest *with* migration `0007`, not after.

## 🟢 Shipped earlier on 2026-07-18 (session 1 — all client-only / free / no-infra, dev-server-verified)

`main`: `48838df` → `e9fd92f`, tree clean, in sync with origin, **all 4 CI deploys green**. Session = a full end-to-end regression pass (found the app crash-free; 6 defects, all data-honesty or polish) + 3 roadmap features. Commits:

1. **Regression pass — remove fabricated data + fix display/UX bugs** (`cb6e77f`). 6 defects the regression walk surfaced:
   - Dashboard: dropped the hardcoded **"248 Active members"** KPI (no members source until F4) → real all-time **"Total sessions"** from history.
   - Schedule "Jungle Intelligence": `aiTips` was hardcoded + **ungated**, asserting fake demand ("+34%") and coach load ("Mara 14/16"). Gated behind `mockAnalytics` (like its siblings `suggested`/`trainers`); both bottom panels now show honest empty states (old code also wrongly showed "All suggestions reviewed" when the list was empty).
   - Exercise Library **Discover packs**: fake gyms / import counts + a **no-op Import** button → new `mockDiscover` flag (default off) + honest "coming soon" marketplace state.
   - **"Share with Class"** minted `?mode=attendee` links but `AttendeeView` is gated off → the copied link was dead. Gated all three Share buttons on `attendeeShare`.
   - Coach floor display (`DisplayScreen`) appended " reps" to every rep field → duration moves read "5 min reps". Now only bare counts/ladders (10, 8-12, 12-10-10-8) get "reps"; durations render as-is.
   - `ProfileModal` was a **dead button in the local/no-Supabase build** (`displayProfile` null → early return). Pass a fallback identity so it opens (Branding tab + stats work offline); live Google-login build unchanged.
2. **Reduced-motion on room displays (Fable §3)** (`9f71f61`) — new module-level `prefersReducedMotion()` helper (FloorLiveScreen refactored onto it); RoomTV + DisplayScreen now render the looping `jg-pulse` scale/opacity animation (countdown-timer final-seconds urgency + mic button) as `"none"` under `prefers-reduced-motion`. Colour cue (timer→red) still lands.
3. **Persona movement catalog UX (Fable F2)** (`fbb5498`) — `MovementCatalog` gains a **filter box** (past 5 rows; matches name/alias/equipment, "X of N" count + no-match state), **equipment quick-pick chips** (barbell…erg…box; one tap sets/clears, free-text still available), and a **coverage nudge** (movements missing equipment flagged inline "needs equipment" + summed in the header "· N need equipment") since equipment grounds generation.
4. **Tempo guide (Fable §4.2 / N5)** (`e9fd92f`) — the zero-license default that keeps rhythm value. The coach room display's Now-Playing panel, when nothing is streaming (the common no-license case), now shows a **`TempoGuide`**: a silent visual metronome that pings one ring per beat at the stage's target BPM (SCFG midpoint), stage-coloured, big BPM readout. No audio / no licensing; honours reduced-motion. First additive slice of the MusicProvider→tempo-guide item; the Spotify quarantine can follow without touching this.

_(Previous session — 2026-07-17, `5892a14`/`e94ee7e`/`eec038f` — shipped RoomTV Plan current-stage highlight + build-mode PIN gate, Brand Studio WCAG-AA audit, and the Floor-board honesty pass. See git log.)_

You're continuing work on **Jungle** — a white-label class operating system for boutique fitness studios (React + Vite + Supabase, deployed to GitHub Pages). This file is the cold-start brief: read it, confirm repo access, report `git status`, then propose a plan before editing.

## ▶️ Start here

- **Repo:** `C:\Users\dylan\jungle-app` (request folder access to this path first).
- **Main file:** `src/App.jsx` (~8,080-line monolith). Also `src/AuthGate.jsx`, `src/supabase.js`, `src/config/flags.js`, `src/lib/` (`store.js`, `qr.js`, `room.js`, `slidesImport.js`, `personaAggregate.js` — the last two have test suites next to them).
- **Live site:** https://killdylz.github.io/Jungle-App/
- **Deploy** = git push to `main` (GitHub Actions builds + deploys). A **failed CI build does NOT touch the live site.**
  ```
  cd C:\Users\dylan\jungle-app
  git add -A
  git commit -m "..."
  git push origin main
  ```
- **Deep context / roadmap:** two docs. `Jungle - Functional, Design & Technical Spec (As-Built).md` = **current state**, read first. `Jungle - Stress-Test Verdict & Architecture Spec (Fable).md` = the dated architectural verdict and reasoning (unedited by design).
- **Repo state:** as of 2026-07-18 (session 2), tree clean, `main` = `889009e` in sync with `origin`, all CI deploys green. **CI now runs three gates: `lint:crash` → `test` → `build`.** Migrations **`0001`–`0006` ALL applied**; `0007` (F4 attendance) **proposed, not approved** — schema in the as-built spec §4.1. Full store.js → Postgres local-first sync live + verified. **Workstream D (coach personas): COMPLETE through increment 3** — chunks 1–3 (UI+aggregation, `persona-ai` extract/generate, Google Slides connector) + increments 1–3 (class-type correctness, recommendation memory/novelty, recognition depth w/ first-class RPE) all built, pushed, client deployed. Deployed `persona-ai` is **v7**; the repo holds **v8** (adds `extract_batch`) awaiting your dashboard paste — see PENDING #0. Until then the client falls back to per-slide extraction automatically, so imports still work. **Workstream A (monolith splits): DONE** — `src/data/library.js` (WORKOUT_LIBRARY + stage maps), `src/data/templates.js`, `src/data/glossary.js`, `src/ui/primitives.jsx` (Btn/Input/Select/Tag/SpBadge/logos/StatCard + ThemeContext/useTheme/useWindowWidth); App.jsx is ~8,300 lines (was 9,237). **Workstreams B+C chunks 1+2: DONE** — one Class Runner nav entry (Run/Auto-DJ tabs + Room TV button), merged fullscreen `RoomTV` (Plan/Floor/Coach modes, transient overlay), and a Realtime room channel (`src/lib/room.js`) with a Follow toggle so a TV mirrors the runner from another device (cross-device test pending — see above). `IntegrationsScreen` mock theatre flagged off (`mockIntegrations`). ⚠️ Historical: commit `c859589` swept in more than its message says (a second chat ran in this folder 2026-07-14); don't trust old commit messages blindly.

## ✅ Foundations already in place (earlier sessions)

- **Google login is LIVE and working** (Supabase Auth + Google OAuth). Allowlist gate in `supabase/migrations/0001_auth_foundation.sql`; admin email allowlisted. Google OAuth app published to production (no "unverified" warning).
- **Spotify is no longer an app gate** — removed the `if (!token) return <LoginScreen>` gate. Spotify is optional, connected post-login from Music Hub via `ConnectSpotifyPrompt` (any user for now; PT-only gating deferred).
- **Mock/theatre surfaces flagged OFF** via new `src/config/flags.js` (`mockAnalytics`, `mockMembers`, `mockSchedule`, `attendeeShare`) — Analytics KPIs, Members app, hardcoded `BASE_SCHEDULE`, calendar suggestions/leaderboard, DJ demo requests, attendee share view. Nav items hidden + render blocked with a "coming soon" placeholder.
- **Account identity fix** — sidebar/header/dashboard/profile avatar + name now use the Google identity (`displayProfile`), Spotify only as fallback. Log out now ends the account session (`auth.signOut()`), not just Spotify.

Files touched: `src/App.jsx`, `src/AuthGate.jsx`, `src/config/flags.js` (new).

## ⚠️ Environment gotchas

- 🚨 **The crash gate is NOT the style baseline — don't confuse them.** `npm run lint:crash`
  (`eslint.crash.config.js`) must be **0**, and CI enforces it. It exists because a
  `ReferenceError` deployed green and crashed the Live runner. **A failure there is real,
  user-visible breakage — never relax a rule to get a deploy out.** Separately, `npm run lint` is
  the ~215-message advisory baseline (unused vars, hooks, style); that one is expected to be
  noisy and is NOT enforced. Keep it from growing, but judge on runtime.
- 🧪 **`npm test` runs in CI too.** When adding tests, **mutate the code to prove the test can
  fail** — the first version of the `classCategory` test passed even with the logic zeroed out.

- **Sandbox mount is byte-capped** — the Linux bash mirror serves TRUNCATED copies of large files (`App.jsx`, `AuthGate.jsx`), so `npm run build` / `cat` on the mount are unreliable. The **Read/Edit tools see the true host files — trust those.**
- **Validate edits with the HOST build, not the sandbox one.** `npm.cmd run build` in **PowerShell** runs against the true host files and is a reliable full-compile check (it caught a real duplicate-declaration + surfaced the path to a hook bug this session). Only the *bash sandbox* build is unreliable (truncated mirror). `@babel/parser` on isolated snippets is a fast pre-check; the host `vite build` is the authoritative one, ahead of CI.
- ⚠️ **2026-07-15: even the host `vite build` served STALE content for App.jsx** — freshly-edited regions mid-file compiled as their pre-edit versions (mixed-age "franken-view"), producing byte-identical bundles after real edits, with or without sandbox. `git`/`node -e`/Read all saw the true file. **Trust instead:** `node -e` + `@babel/parser` full-file parse for syntax, `npx eslint` for undefined refs, the **dev server** (a fresh `vite dev` served current code correctly), and the **CI build** (verify pushed content via the GitHub commits API — `raw.githubusercontent` can be CDN-stale for minutes — then check the live bundle for markers). Local `dist/` output is NOT proof.
- **PowerShell:** `npm`/`.ps1` blocked by execution policy → use `npm.cmd ...` or `powershell -ExecutionPolicy Bypass -File .\deploy.ps1`. Paste multi-line commands **one line at a time**.
- **Git index corruption** (rare): if git errors "bad signature / index corrupt" → `del .git\index` then `git reset` (rebuilds index; files untouched).
- **Read-tool escape artifact:** the Read tool occasionally renders a forward slash `/` as a backslash `\` in dense expression lines (hit 2026-07-18 on `App.jsx:1000` `Math.round(totalMinutes/totalSessions)`, which displayed as `…\…`). A literal backslash there would be a parse error and the app wouldn't load — so if you see a suspicious `\` that "should" be `/`, confirm the real byte via PowerShell (`(Get-Content file)[n-1]` + `.ToCharArray() | %{[int]$_}`) before "fixing" a non-bug.

## 🗺️ Next steps (from the roadmap)

> ✅ **RoomTV "now over next" (B+C chunk 3) — 3 increments DONE + verified + pushed (2026-07-17).** All client-only, all dev-server-verified. Commits `d81f609`, `00d8f94`, `5eab44c`:
> 1. **UP NEXT preview** on the coach `DisplayScreen` — a legible bottom band in the **Full** preset (next stage name + type-color dot + minutes + up to 3 upcoming moves; "Final stage — class wraps after this" on the last) and a compact **Next: <stage>** line in the **minimal** preset. New `nextStage`/`nextCfg`/`nextMoves` vars in `DisplayScreen`. Verified: coach display showed `UP NEXT · Circuit Blast · 10 min · Burpee Complex · Box Jump`.
> 2. **Current move enlarged** (Full preset) — "Exercises"→"Doing Now"; move name 16px→24px/800, a solo movement full-width at 34px; roomier cards. Verified: move computes to 24px.
> 3. **Floor board** (`FloorLiveScreen`) — station move 20px→26px; removed **fabricated** "Workout of the Week" data ("The Gauntlet · best today 12:40 · 9 attempts") → honest "Benchmark of the Week — coming soon". Verified: station computes to 26px, no fake data in DOM.
>
> **Verify RoomTV in the preview:** PIN `080921` → Resume building → **Preview on TV** → then switch modes. Fullscreen RoomTV **screenshots HANG** — use `get_page_text`/`read_page` (text) + `javascript_tool` computed-style checks instead. The mode overlay auto-hides in 4.5s and read→click round-trips are too slow; wake it AND click the mode button in ONE `javascript_tool` call: dispatch `mousemove` up the ancestor chain from `elementFromPoint(640,300)`, `await ~200ms`, then `.click()` the button whose text is "Coach"/"Floor" (a returned Promise may log "Promise was collected" but the click still lands — check with `get_page_text`).
>
> ✅ **RoomTV Plan-view current-stage highlight — DONE + verified + pushed (2026-07-17).** `RoomTV` studio branch now threads the follow-aware `liveState` into `OverviewDisplayScreen` (Follow now works on the Plan view too). The Plan view shows the running stage with a 3px accent border + accent glow + `NOW` badge, past stages dimmed to 0.4, future stages normal, a live `● Stage X/N` header line, and an accent-filled duration chip. Guarded on `liveState.playing` so a static "Preview on TV" shows no false highlight. Verified in the dev server via computed + inline-style checks (screenshots hang on this app). ✅ **Legacy PIN screen — DONE (build-mode gated, see PENDING #2).**
>
> ✅ **Brand Studio WCAG-AA contrast audit (Fable F6) — DONE (`e94ee7e`).** ✅ **Floor board honesty pass (Fable M3) — DONE (`eec038f`).** See "Shipped this session" at the top.
>
> ## 🎯 WHERE WE ACTUALLY ARE vs. THE FABLE ROADMAP (re-derived from the spec, 2026-07-18)
>
> | Fable phase | State |
> |---|---|
> | **0 — De-risk** | ✅ **DONE.** All mock/theatre surfaces flagged OFF (last 4 leaks closed `cb6e77f`). Deploy verification in place. *(Only leftover: the `MusicProvider` shell — but N5's user-facing value already shipped without it, so it's now a refactor, not a blocker.)* |
> | **0.5 — Split slice** | ✅ **DONE** for §4.5 steps 1–3 (`src/data/`, `src/lib/store.js` seam, `src/ui/primitives.jsx`). Steps 4 (screens) + 5 (music quarantine) still open — optional, mechanical. |
> | **1 — Data foundation ★** | 🟡 **~80%.** Schema+RLS (`0001`–`0006`) ✅, Realtime room channels ✅, localStorage→Postgres local-first sync ✅. **MISSING: F4 attendance capture (N1) + magic-link member view (N4).** |
> | **2 — Make theatre real** | ⛔ **BLOCKED on F4.** N2 (cohort analytics) and N3 (at-risk + outreach) cannot start without attendance rows. |
> | **3 — Experience deepening** | 🟢 Mostly done early: P1/P2 display polish ✅, WCAG-AA in Brand Studio (F6) ✅, reduced-motion ✅, tempo-guide (N5) ✅ first slice. |
>
> ### ⭐ THE NEXT BUILD IS **F4 / N1 — native attendance capture**. It needs Dylan's go-ahead (new migration).
>
> The spec is emphatic and repeats it three ways: *"Critical-path spine: Phase 1 → F4 attendance → F5 analytics — everything else hangs off it"*; *"capture is F4 and sits on the critical path; dashboards are downstream consumers"*; *"this feature is the entire retention thesis's oxygen supply."* It is also **M2**, one of the three MODIFY pillars, and **A7** — the assumption whose failure is a kill criterion (#3).
>
> **What it unlocks (all currently impossible):** real cohort/at-risk analytics (N2/N3 = the $349–499 outcome tier), the honest "active members" number I had to delete from the Dashboard this session, the floor-board's real roster + the "Find me / you're up" cue removed in `eec038f`, and the member magic-link summary (N4).
>
> **Scope when approved:** migration `0007` for `members`, `class_instances`, `attendance` (immutable, `source: qr|coach|import`), `consent_records` (append-only — the spec ships this in Phase 1 *even though biometrics don't*, as "cheap insurance"); QR self-check-in on the room screen; coach roster sweep in the Live runner; CSV backfill. **Design law P6: check-in ≤5s/member** — above that coaches skip it and the instrument starves (A7). QR must be generated **locally, not via `api.qrserver.com`** (deprecation list — no member data through a third-party URL).
>
> ### Free / no-infra work that can proceed in parallel (ranked)
> 1. ✅ **DONE 2026-07-18 (session 2) — Local QR generation** (`758878e`, `src/lib/qr.js`). The F4 prerequisite is cleared.
> 1b. **NEW — add a test runner (Vitest) + RLS and attendance-immutability tests.** Promoted to the top of this list by the session-2 audit: there is currently **zero** automated testing, and the spec calls these two suites non-negotiable. Cheapest moment is immediately *before* migration `0007`, since F4's failure mode is silently-wrong data that manual testing cannot surface.
> 2. **Screens split, §4.5 step 4** — `App.jsx` is ~8,590 lines again. Extract leaf-first (Glossary → Templates → Calendar → BrandStudio → Displays) into `src/screens/`. Zero-risk, mechanical, and directly reduces the recurring stale-build/merge pain.
> 3. **`MusicProvider` shell + music quarantine (§4.5 step 5)** — move ~2,000 lines of Spotify/DJ into `src/music/` behind the interface (`Soundtrack | PersonalSpotify | TempoGuide | Null`). Closes the last Phase-0 item. Quarantine, don't refactor internals.
> 4. **Tempo-guide extensions (N5)** — `TempoGuide` ships in the coach display's no-music state (`e9fd92f`). Additive follow-ups: the Floor board's "No track playing" slot has the identical gap; a Builder per-stage preview; optional tap-tempo override of the SCFG midpoint.
> 5. **Persona brief-flow polish (F2)** — the Generate brief is four bare inputs; add one-tap **focus chips derived from the coach's own corpus** (past plan/generation foci) and remember the last duration.
>
> **Infra-gated (ASK DYLAN FIRST — needs a migration / paid tier):** F4 attendance spine (QR self-check-in + coach roster sweep — this is what brings the *real* floor-board roster and the "Find me / you're up" cue back) → F5 retention analytics; tighten `class_schedule_rules` RLS; upgrade persona LLM off free Gemini.

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

**A — Monolith splits (Fable §4.5, zero-risk).** ▸ IN PROGRESS. `TEMPLATES` + `GLOSSARY` extracted to `src/data/` (`c2b5e36`). ✅ **`WORKOUT_LIBRARY` + `STAGE_LIBRARY_MAP` + `CLASS_STAGE_TEMPLATES` → `src/data/library.js` DONE (2026-07-14)** via assertion-guarded PowerShell splice (App.jsx 9237→8383 lines; diff exactly 4 insertions / 858 deletions; build clean; Exercise Library, Builder class/style lists and stage templates all verified rendering in the preview). `getLibrary()/saveLibrary()` stay in App.jsx (they touch `store`). ✅ **Shared UI → `src/ui/primitives.jsx` DONE (2026-07-14)**: `Btn/Input/Select/Tag/SpBadge/JungleLogo/BrandLogo/StatCard` **plus `ThemeContext`/`useTheme`/`useWindowWidth`** (the context object must live in the shared module so App's provider and extracted consumers reference the same instance). Verbatim moves, build clean, app + BrandLogo render verified in preview. Workstream A's listed splits are complete — further splits (screens themselves) are optional future work.

**B + C — Class Runner umbrella + merged Room TV.** ✅ **CHUNK 1 DONE (2026-07-15, preview-verified):** RUN nav is now ONE **Class Runner** entry (`live`). The runner view has a slim tab bar — **Run** (LiveScreen) / **Auto-DJ** (MusicHub, Spotify prompt if unconnected) / **Room TV** button. New **`RoomTV`** component = fullscreen surface with three modes replacing the old separate views: `studio` (plan overview, ex-OverviewDisplayScreen), `floor` (live board, ex-FloorLiveScreen), `coach` (ex-DisplayScreen); a transient overlay (auto-hides 4.5s, wakes on pointer/touch, 10-ft-sized buttons) switches Plan/Floor/Coach/Exit. View keys `overview-display` / `floor-live` / `display` are GONE — entry points now set `roomTvMode` + `setView("room-tv")` (Builder "Preview on TV" → studio; LiveScreen display button → coach; runner Room TV button → floor if playing else studio). Timer/nav/space-bar effects re-gated on `live`/`room-tv`. The three inner screens still exist unchanged inside RoomTV — visual P1/P2 rework of their layouts is the NEXT B+C chunk. ✅ **CHUNK 2 (2026-07-15): Realtime room channel BUILT** — new `src/lib/room.js` (broadcast-only Supabase Realtime channel `room:{gymId}`, no migration): while the runner is playing it broadcasts `{stages (tracks stripped), sessionName, liveState, nowPlaying-lite}` on the 1/s tick; RoomTV gains a **Follow** overlay toggle (green dot = receiving, amber = waiting; shown only when a gym is resolved) that mirrors the broadcast instead of local state, with a "waiting for the coach's runner" banner when stale >10s. No-ops cleanly without Supabase (verified in preview). **NOT yet verified cross-device** — needs two signed-in devices: phone → Class Runner → play; TV/laptop → Class Runner → Room TV → Follow. If nothing arrives, check Supabase → Settings → API → Realtime is enabled for the project.

**D — Coach-persona class planning.** ▸ Coach-first Personas UI (chunk 1) BUILT + verified (2026-07-14) — see the dedicated section below.

**Roadmap after these (next builds, in rough order):** (1) **B+C chunk 3** — P1/P2 visual rework of the RoomTV inner surfaces ("now over next": current move ≥60% visual weight; 10-foot legibility at 8m) — the three screens still render their pre-merge layouts inside RoomTV. (2) **F4 attendance spine** (QR self-check-in + coach roster sweep; needs a new migration) → F5 analytics. (3) Tighten `class_schedule_rules` RLS to admin/coach once the Calendar UI gates writes (`0003` note). (4) Consider removing the legacy PIN screen (redundant ahead of Google login). Full phased plan: the Fable spec doc.

## 🧠 Workstream D — Coach-persona class planning (big new capability)

### ✅ DEPLOYS COMPLETE (2026-07-14) — Increments 1 + 2 fully live

The two server-side steps are DONE and VERIFIED: migration `0006` applied (`persona_generations` queryable via REST), `persona-ai` redeployed. Verified programmatically: a `task:"generate"` smoke call with a Deadlift entry in `recent` returned HTTP 200 with a well-formed plan that deliberately chose a **different primary lift** (Back Squat) — NOVELTY + CATEGORY DISCIPLINE confirmed active. In-app verification (Generate draft → right class type; second generate differs; "Recently generated" lists both) can be done any time.

**Goal:** ingest years of historical class plans (the user's gym stores them in **Google Slides**) and let Jungle plan new classes at a **persona level** — recognizing exercises, rep/set schemes, and structure across class types, per coach. Maps to Fable **F2** (AI programming) deepened with personas.

**Decisions locked (2026-07-14):**
- **Model approach = "both, phased":** **extract → RAG now** (structured extraction + persona/style context fed to the LLM at generate time), fine-tuning kept as a *later* option once the corpus is big + clean. NOT fine-tuning first.
- **Persona-FIRST workflow:** you DEFINE/CHOOSE a persona up front, then CONNECT data to it — no auto-inference from folder names or clustering. `kind` = `coach | format | house`.
- **Ingestion:** Google Slides API is **free** (only the LLM extraction costs tokens). Slide text is baked into slide graphics → the **Slides API** (structured text runs per shape) beats OCR. Manual/paste import is fine for prototyping first.

**Prototype PROVEN on 6 real "The Garage" decks:** parsed cleanly into structured JSON; detected **3 house formats** — **S360** (strength: `Warm Up 5min → M1 barbell primary w/ DB regression + ladder|5×5 + "1st set as primer" + RIR 2 + rest 3min → A1+A2 & B1+B2 antagonist supersets, 3 rounds, "go to B/A after" → C1 finisher, rest 90s`), **GC (Fundamental)** (conditioning: `C1 warmup → C2/C3` interval / AMRAP / rep-target circuits, erg-heavy), **Garage Enduro** (periodized endurance, "Week X of 24", runs+ergs+sled, RPE-driven). Extraction captured rep-ladders (`12-10-10-8`), RIR, rest, superset rotation, regressions, per-side, rep targets, intervals, AMRAP, erg distances, RPE. Generated a NEW on-style **"S360 (Deadlift — Peak Strength)"** as proof.

**Extraction shape** (what a deck becomes): `{ facility, class_type, focus, date, blocks:[ { label, role:"warmup|primary_lift|superset|finisher|circuit", rotation, scheme:{ type:"sets_reps|rounds|time|interval|amrap", sets, reps:[], rir, rest_sec, note }, exercises:[ { name, equip, reps, per_side, regression, target } ] } ] }`.

**Schema:** `supabase/migrations/0005_coach_personas.sql` (**APPLIED**) — `coach_personas` (name, kind, `style_profile` jsonb) + `persona_plans` (the corpus; `plan` jsonb holds the `{blocks}` extraction; dedupe on `source_ref`) + `persona_movements` (movement catalog). Gym-scoped, member-read / admin-write RLS. Plus `supabase/migrations/0006_persona_generations.sql` (**⚠️ NOT YET APPLIED**) — the recommendation ledger (`persona_generations`), gym-scoped, **member read + write** (a coach logs their own generated classes).

**Model locked (2026-07-14): COACH-FIRST.** A persona is an individual coach (they plan their own classes in their **own personal Google Slides folder**). **Class type (S360 / GC / Enduro…) is a dimension WITHIN a coach**, carried on `persona_plans.class_type`. Ingestion is source-agnostic but **Google Slides is the first-class path**. Build order = 3 chunks: **(1) UI + aggregation** [DONE], **(2) extraction + generation Edge Function** [I write code, user deploys], **(3) Google Slides connector** [user does Google Cloud OAuth scopes + verification, I wire client].

**D — next steps (in order):**
1. ✅ **`0005` APPLIED (2026-07-14).** `coach_personas` + `persona_plans` + `persona_movements` live in Supabase (member-read / admin-write RLS). Persona sync is ON.
2. ✅ **CHUNK 1 DONE + LIVE (2026-07-14) — coach-first Personas UI.** `src/App.jsx`: `PersonasScreen` (coach → **class-type tabs** → per-CT derived profile + editable movement catalog + plans), `PersonaProfilePanel`, `MovementCatalog` (rename folds a variant into `aliases`; equip/notes editable; counts+scheme derived), `PersonaPlanEditor` (full block/exercise editor). `src/lib/personaAggregate.js`: `classTypesOf` / `aggregateClassType` / `aggregateMovements` — derived-profile + catalog logic the Edge Function will mirror server-side. `src/lib/store.js`: `persona_movements` domain + `hydratePersonas` pulls all 3 tables. Plus a **catalog auto-build** effect (imports/loads without movements build their catalog on open, guarded so it never clobbers edits). Verified live on the real 5-deck corpus: 3 class-type tabs (S360×3, GC×1, Enduro×1), 52 movements with correct per-CT counts + rest medians, rename-folds-alias, plan editor add-exercise → catalog recompute, auto-build on load, Draft/Generate into Builder. Host build clean.
3. ✅ **CHUNK 2 DONE + LIVE (2026-07-14) — persona LLM extract + generate.** ONE JWT-verified Edge Function `supabase/functions/persona-ai/index.ts` (folded the two-function "persona-extract + persona-generate" sketch into a single deployable with a `task` switch, mirroring `smart-build`). `task:"extract"`: deck text → `{ title, classType, focus, plan:{blocks} }`. `task:"generate"`: `{ persona, classType, brief, profile, catalog, examples }` → new on-style `{ title, plan:{blocks} }`. Client (`App.jsx`): **Generate draft** opens a brief (focus/duration/week X-of-N) → `persona-generate` grounded on the derived CT profile + movement catalog + up to 3 few-shot plans → `planToStages` → Builder; **Add plan → Paste deck text** → `persona-extract` → folds into corpus + recomputes catalog. Both have deterministic fallbacks (draft-from-recent / paste-JSON) when the function is absent or errors. Also added the missing `@keyframes spin` in `App.css`. **LLM cost: intentionally on the FREE Gemini 2.5 Flash path during testing** — provider resolves `PERSONA_LLM_PROVIDER` → shared `LLM_PROVIDER` → `gemini`, reusing the existing `GEMINI_API_KEY`. Upgrade persona to Opus 4.8 later with two secrets (`PERSONA_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`) — does NOT touch `smart-build`. LLM fires only on explicit button clicks. Verified live on the sample coach 2026-07-14.
4. 🔨 **INCREMENT 1 — BUILT, PENDING DEPLOY — class-type correctness (user items 9 + 10).** `src/lib/personaAggregate.js` gains `classCategory(plans, classType)` → `strength | conditioning | endurance | mixed`, derived from block roles, scheme mix and movement equipment/targets. `App.jsx`: `CATEGORY_TO_BUILDER` maps that to a real `WORKOUT_LIBRARY` key (`strength`→`strength`, `conditioning`→`circuit`, `endurance`→`hyrox`, `mixed`→`bootcamp`); **`handleDraftFromPersona` now sets `classChoice`** so a persona pushed to the Builder lands on the right class type (it previously set stages only — that was the item-9 bug). It sets the selector ONLY (does not call `applyTemplate`), so drafted stages survive. Profile card shows `S360 · [Strength] → builds as Strength`. Item 10: `persona-ai` `GENERATE_SYSTEM` gained a **CATEGORY DISCIPLINE** block (no ergs/runs/bike in a strength class's `primary_lift`/`superset` blocks; conditioning/endurance keeps strength as accessory only); client sends the derived `category`.
5. 🔨 **INCREMENT 2 — BUILT, PENDING DEPLOY — recommendation memory + novelty (user items 5–8).** New `supabase/migrations/0006_persona_generations.sql` ledger. `store.js`: `persona_generations` domain (`getPersonaGenerations` / `appendPersonaGeneration` / `savePersonaGenerations`, capped 50 per persona) and `hydratePersonas` pulls it **defensively** — wrapped in its own try/catch so an unapplied `0006` can never break core persona hydration (returns `generations` in the result). `App.jsx`: every successful generate is recorded (title, focus, category, `movements` signature via `blockMovementNames`, plan) and the payload now carries **`recent`** (last 6 for this coach+class-type). `persona-ai` `GENERATE_SYSTEM` gained a **NOVELTY** block: produce something meaningfully different from `recent` — different primary lift/focus, rotated movements, no repeated titles. UI shows "Recently generated · N" with a **Reopen** button per entry.
6. ✅ **CHUNK 3 — Google Slides connector — BUILT + PUSHED (2026-07-14), awaiting live OAuth test.** New `src/lib/slidesImport.js` (GIS token-client loader, in-memory token cache, `parseFolderId` — accepts a raw ID or any Drive folder URL, Drive `files.list` w/ pagination, Slides `presentations.get` → per-slide text incl. tables, grouped elements and speaker notes). `App.jsx` `PersonasScreen`: the placeholder button is now a real panel — folder link input (remembered per persona in `styleProfile.slidesFolder`, which syncs to Supabase `style_profile`) → **List decks** (OAuth popup on first use) → checkbox list (already-imported decks detected via `sourceRef` = presentation id and unchecked by default) → **Import N decks** = per-deck Slides text → `persona-ai task:"extract"` → plans folded into the corpus + catalog recompute, per-deck failures collected without aborting the batch. `VITE_GOOGLE_SLIDES_CLIENT_ID` is set as a **literal in `.github/workflows/deploy.yml`** (client IDs are public by design — no GitHub secret needed) and in gitignored `.env.local` for local dev. Client ID: `752012094269-2egmufghtkmoiem8r923edublm4i4n3o.apps.googleusercontent.com` (dedicated Cloud project, consent screen in **Testing** mode w/ coaches as test users, scopes `presentations.readonly` + `drive.readonly`). **Live-tested by the user 2026-07-15/16 — the whole pipeline works up to extraction.** What the testing found + fixed (all deployed):
   - Google 401 "no registered origin / invalid_client" → user added the **Authorized JavaScript origins** (`https://killdylz.github.io`, `http://localhost:5173`) in the Slides-import Cloud project. RESOLVED.
   - "Insufficient authentication scopes" → Google's consent popup shows a **checkbox per scope** and the Drive one was unticked; a partial-grant token broke every Drive call. Client now checks `hasGrantedAllScopes`, refuses/never caches partial tokens, and tells the user which boxes to tick (`9ac990b`).
   - Users paste **deck links, not folder links** → `parseDriveId` accepts folder URLs, presentation URLs, `?id=` links or bare IDs; `resolveDriveTarget` asks Drive `files.get` whether it's a folder or a single deck; single decks import as a one-item list (`3383586`).
   - The generic "Edge Function returned a non-2xx status code" hid the real error → `fnErrorMessage` reads `error.context` at all three `persona-ai` call sites; deck text capped at 120k chars (`c6997c6`).
   - **Root cause of the actual import failure:** long-deck extraction ran **110s** (measured on a 34-slide synthetic) into the ~150s gateway timeout — the v4 function fix is committed (`dcf7aaa`) but **awaits the user's dashboard paste (PENDING USER ACTIONS)**. **Add plan → Paste deck text** remains the manual fallback. Note: the Slides API can't read text baked into images (would need OCR) — decks that are pure photos won't extract.
7. ✅ **INCREMENT 3 — recognition depth (items 2–4) — BUILT + verified locally (2026-07-14). ⚠️ Needs ONE more `persona-ai` redeploy** (Supabase → Edge Functions → paste `supabase/functions/persona-ai/index.ts` → Deploy) to activate the new extraction rules. Degrades gracefully until then (see below). What landed:
   - **`scheme.rpe` is first-class** across the whole chain: `BLOCK_SCHEMA` in `persona-ai` (a range like "RPE 7-8" → midpoint 7.5), `aggregateClassType` defaults (`defaults.rpe`), `commonScheme`, `fmtScheme`, the profile Defaults chips, and an RPE input (step 0.5, parseFloat) in `PersonaPlanEditor`. A **fallback parser** (`rpeOf` in `personaAggregate.js`) still reads "RPE 7"/"RPE 7-8" out of `scheme.note`, so pre-increment-3 corpora AND extractions from the not-yet-redeployed function feed RPE defaults anyway.
   - **Extraction prompt tightened** (item 2): numbers land in their fields not notes (rest→`rest_sec`, RIR→`rir`, RPE→`rpe`, tempo codes→note); "3x10"→sets 3 reps [10]; A1/A2 pairs detected without the word "superset"; one movement line = one exercise, source order, never merged/split; distances/cals/time-caps→`target`; per-side/regression capture; non-programming slides (branding, hype, playlists) ignored; abbreviations like DB/KB expanded but names otherwise kept as the coach wrote them.
   - **`planToStages` fidelity**: RIR / RPE / scheme note now ride into the Builder on each exercise's notes, and a bug was fixed where `ex.reps === ""` (the schema default) suppressed the block's rep ladder — extracted plans previously reached the Builder with empty reps.
   - **Catalog scheme bug fixed**: `aggregateMovements` emitted `common_scheme` (snake) where the local shape is `commonScheme` (camel) — the derived "typical scheme" never displayed AND `savePersonaMovements` clobbered it to `{}` on sync. Data self-heals on the next catalog recompute (any plan edit / import).
   - Verified in the local preview: RPE field in the plan editor → save → Defaults chip "RPE 7.5" + catalog row "sets_reps · 5 sets · RIR 2 · RPE 7.5 · rest 3m". Host build clean.

**Real Garage corpus (private):** the user's 5 real decks (S360 Shoulder-Hypertrophy 11 Jul, S360 Deadlift-Hypertrophy 3 Jul, S360 Shoulder-Peak Strength 13 Jun, GC Fundamental 11 Jul, Garage Enduro Wk11/24) were extracted to the normalized shape and verified, but **deliberately NOT committed** (they'd ship in the public bundle). They're in a private one-time browser-console loader at `…\scratchpad\load-garage-decks.js` (creates a `house` persona "The Garage" + the 5 plans; catalog auto-builds; syncs to the user's Supabase). If that scratchpad file is gone in a new session, re-ask the user for the decks. The committed `src/data/personas.seed.js` is only the illustrative "Example Coach" sample.

## Deferred / notes

- ✅ `IntegrationsScreen` mock theatre is now flagged OFF (`mockIntegrations` in `src/config/flags.js`, 2026-07-15) — hidden from navs, coming-soon screen at the choke-point.
- ✅ Legacy PIN screen — build-mode gated (2026-07-17, `5892a14`); see PENDING #2.
- ✅ Floor-board fabricated data (fake members / HR zones / loads) removed (2026-07-17, `eec038f`).
- ✅ **Sales-integrity sweep (2026-07-18, `cb6e77f`)** — the last four ungated fabricated-data leaks are gone: Dashboard "248 members" KPI → real "Total sessions"; Schedule "Jungle Intelligence" AI tips gated behind `mockAnalytics`; Exercise Library Discover packs (fake gyms / import counts / no-op Import) gated behind the **new `mockDiscover` flag**; dead "Share with Class" links gated behind `attendeeShare`. **Flags now covering all mock/theatre surfaces:** `mockAnalytics`, `mockMembers`, `mockSchedule`, `attendeeShare`, `mockIntegrations`, `mockDiscover` — all default OFF. No known ungated fabricated data remains on live surfaces (the Brand-Studio "LIVE PREVIEW" dashboard is a labelled theming preview, intentionally illustrative).
- Carryover: redeploy the `smart-build` Edge Function (Supabase → Edge Functions → paste `supabase/functions/smart-build/index.ts` → Deploy) if the LLM brand recommendation isn't live.
- **Dev-server note (recurring):** a second chat often holds port 5173 in this folder; start your own on a fixed alt port (`launch.json` → `--port 5180 --strictPort`, `autoPort:false`) and navigate to `http://localhost:5180/Jungle-App/`, then revert `launch.json` to `port:5173` before committing. Vite ignores the harness `PORT` env; Browser-pane screenshots hang on this app — verify with `read_page`/`get_page_text`/`javascript_tool` computed-style checks.
