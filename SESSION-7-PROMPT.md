# Jungle — Session 7 Build Prompt

_Written 2026-07-20 at the end of session 6. `main` = `0b74333`, **pushed, deployed, CI green on Linux**, tree clean._
_Supersedes `SESSION-6-PROMPT.md`, which is now history._

## The product, in one paragraph

Jungle is a **white-label class operating system for boutique fitness studios** — React + Vite + Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by whether it improves the life of the **trainer** (plans faster, runs the room without fighting software), the **owner** (sees who is slipping away, looks premium), or the **member** (walks into a room that knows them). A feature that improves none of those three is theatre, and this repo deletes theatre.

**Commercial context:** Dylan launches at the Singapore gym he freelances at (The Garage), then sells to other gyms. The USP: *Jungle learns how each coach already programs — from the slides they've been writing for years — and turns that into branded, ready-to-run classes on the studio's own screens, while quietly building the attendance record that shows who's about to quit.*

## Start here

0. **Repo:** `C:\Users\dylan\jungle-app` — request folder access first.
1. **Confirm state:** `git status` (expect clean), `main` = `0b74333` and pushed.
2. **CI is green and needs no attention.** Session 6 confirmed the Playwright-in-CI question that session 5 left open: the deploy workflow runs `lint:crash → test → playwright install → test:e2e → build` and every step passes on the Linux runner. Do not re-investigate this.
3. **Gates:** `npm run lint:crash` (must be 0) → `npm test` (399) → `npm run test:e2e` (35) → `npm run build`.
4. **Read, in this order:**
   1. This file.
   2. `SESSION-HANDOFF.md` — the session-6 block at the top is current. **Read the crash-gate section before you trust a green lint run.**
   3. `AUDIT-FINDINGS.md`, `UI-UX-DIRECTION.md`, `REGRESSION-PLAN.md`, `LEGAL-AND-SECURITY.md` — still the governing direction.
   4. The as-built spec. **`SPEC-PATCHES.md` is now APPLIED and is history — do not re-apply it.**
- **Live site:** https://killdylz.github.io/Jungle-App/ — deploy = push to `main`.

## 🔴 The one thing that will bite you: `lint:crash` cannot see undefined JSX components

**`no-undef` resolves plain identifiers but NOT JSX element names.** `const a = Foo` is caught; `<Foo/>` is not. Verified with a probe file containing both — only the first is reported.

This is the `9f71f61` class of bug the gate was *built* for, in the one form it misses, and it bit twice in session 6. A screen was extracted missing five JSX imports and `lint:crash`, 373 unit tests and `vite build` were **all green** while the Members panel threw `ReferenceError: ArrowLeft is not defined` on open. React's error boundary turned it into a calm "Something broke".

Two consequences:

1. **A liveness check that does not name the error boundary will call a dead screen healthy.** An earlier check in that same session recorded the broken screen as `rendered: true` — the boundary renders, the root has children, and the sidebar still says "Members". `e2e/screens.spec.js` now asserts the boundary is *absent* on all nine screens plus each screen's own content. **If you add a screen, add it to that list.**
2. **⛔ DECISION FOR DYLAN: add `eslint-plugin-react` for `react/jsx-no-undef`?** It is the only way to close the gate itself. New dev dependency, so it was not taken unilaterally.

**A dormant instance is still in the repo, not fixed:** `<SpotifySearchModal/>` is used at `App.jsx:4353` and `:5018` and **defined nowhere**. It never throws only because both call sites sit behind `FLAGS.music`, which is false — exactly how `<AttendeeView/>` hid until session 5 found it. Anyone flipping `FLAGS.music` gets a white screen. It is out of scope while music is deferred, but it must be resolved as part of decomposition stage 3.

## What session 6 did — `f2990b6` → `0b74333`, 12 commits

`lint:crash` 0 · 348 → **399** unit tests · 20+1`fixme` → **35** e2e · App.jsx 8,779 → **7,854** lines · bundle 610 KB.

| Commit | What |
|---|---|
| `ad45510` | **The open `fixme` defect — fixed in the TAXONOMY, not the drafter.** A banded good morning is a primer, not a lift. Marker removed, test unweakened. |
| `f3931ae` | **SPEC-PATCHES applied** (the last untouched WEEK-PLAN item) + **77 mojibake sequences repaired** in the spec. |
| `e95be19` | **Floor board "coming soon" panels cut**, + a real z-index defect the new test found. |
| `dcef7ee` | **Decomposition stage 1** — `src/lib/colors.js` + 19 tests. |
| `d6a99a7` `df59547` | **Decomposition stage 2** — `AdminTeamScreen`, `CalendarScreen`, `RosterScreen` into `src/screens/`, + `e2e/screens.spec.js`. |
| `a3a7f06` | **Constrained-column audit** — `dbConstraints.test.js` reads the MIGRATIONS rather than restating them. |
| `9ac7250` | **M1 Members CRUD.** |
| `fd98b5f` | **I14 hydrate paging** — kills a silent truncation *and* a permanent re-push loop. |

### Judgement calls worth knowing about

- **The `fixme`'s preferred fix (a) was wrong, and the data said so.** Printing the derived slot showed all four categories tie at a count of 1, so no prevalence-based rule can separate `strength` from `mobility` there. Fix (b) — the taxonomy — was simply true.
- **No `deleteMember` in M1, deliberately.** `attendance.member_id` cascades, so deleting a member destroys the history the retention analytics run on. Leaving is `status: 'cancelled'`. Erasure deserves its own PDPA flow.
- **The accessibility clamp in `colors.js` never fires.** The base constants already exceed both targets. The tests assert the *guarantee* (a generated skin is accessible), not either mechanism, because breaking either alone still passes. **The first version of that test passed with the clamp deleted** — a test that looks meaningful and has never been seen to fail is not evidence.
- **Three dead symbols moved-but-flagged, not deleted:** `nudgeForContrast`, `resolveSubBrand` (FR-H8, implemented, never wired) in `colors.js`, and `SLOT_LABELS` in `CalendarScreen`. Relocating is not the moment to decide a feature's fate — but they should not sit flagged forever.

## ⛔ Dylan's queue

**Done:** `git push` ✅ · RLS self-test 0001–0006 ✅ · migration 0008 ✅ · CI/Playwright on Linux ✅

| # | Action | Why it matters |
|---|---|---|
| 1 | **Live sync check ×3** | Still the most important unverified path. **Session 6 gave it MORE to verify:** `fd98b5f` changed `hydrateAttendance` to page with `.range()` and to re-push only rows it can prove the server lacks. That path cannot be exercised locally. Watch that rows land, **and that a second hydrate does not re-push rows already up there** |
| 2 | **Physical offline soak** — router off 5 min mid-class | P7 flips to ✅ only when this passes on real hardware |
| 3 | **Install the PWA** on the phone and the room TV browser | Fastest sanity check of manifest + icons |
| 4 | Cross-device Room TV **Follow** test | **Was blocked by a defect until session 6** — the mode switch sat under the Plan screen at a lower z-index, so Follow was unreachable in the default mode. Now genuinely testable for the first time |
| 5 | Redeploy `persona-ai` (paste v8) | Blocks verifying the blueprint→generate path at all |
| 6 | Staging Supabase project + 0001–0008; prod → **Pro** | Backups. Free tier has none |
| 7 | **Decide: Sentry, yes or no** | A new **sub-processor**; crash payloads carry member names. LEGAL §6 requires it in the gym's DPA |
| 8 | **Decide: `eslint-plugin-react`** | Dev-only dependency, but it changes a CI gate. See the crash-gate section |
| 9 | **Decide: deploy an Edge Function for the member link** | The only thing blocking the other half of N4 |
| 10 | UptimeRobot on the live URL | 5 minutes |
| 11 | Lawyer (IP letter + templates); the gym pilot conversation | Long-lead, runs in parallel |

## Build order for session 7

### 1. Decomposition stage 3 — the music quarantine into `src/music/`

`AUDIT-FINDINGS` §3.1 stage 3, and the natural next step now that stages 1–2 are done. **This is the one place "anything music" is in scope**, because it is a structural move, not a music feature.

It is also where **`<SpotifySearchModal/>` must be resolved** — the dead reference above. Options: delete the two call sites with the surrounding dead UI, or write the component. Given I7's verdict (music is *cut from the sellable product*, `MusicProvider` will not be built), **deleting is almost certainly right** — but say so explicitly rather than by accident.

The audit's warning for this stage: `BuilderScreen`/`LiveScreen` receive `player`/`deviceId`/`djProgress` props — make them optional-null in one commit and render the flag-off state.

### 2. N4 member link — only if Dylan deploys the Edge Function

The share card half shipped. The magic-link page needs a signed class token; design in `LEGAL-AND-SECURITY.md` §4. **Do not build the page before the function exists** — that is exactly the `<AttendeeView/>` mistake. The Room TV's QR also stays removed until the link is real.

### 3. The remaining §3.2 sync edges

`I13 background retry` — failures currently wait for the next hydrate. Not deferred, and now cheaper to reason about since `_mergeAppendLog` is pure and tested. **`I10 delta writes` stays explicitly deferred.**

Note the same caveat as I14: the sync path cannot be exercised locally, so extract the decision into a pure function and test *that*, leaving the I/O thin. This is the repo's established idiom (`_guardList`, `_ciToRow`, `_mergeAppendLog`).

### 4. P2 — the 10-foot rule, currently 🟡

`DISPLAY_PRESETS`/`FONT_SCALES` exist and sizes were raised, but there are **no enforced minimums** and no 1080p/4K snapshot regression. This is member-facing (the room reads it mid-class) and is testable with Playwright at a TV viewport — the kind of gap the new `screens.spec.js` pattern extends to naturally.

### 5. If there is room — clean up the three flagged dead symbols

`nudgeForContrast`, `resolveSubBrand`, `SLOT_LABELS`. Each needs a yes/no, not a relocation.

**Explicitly deferred — do not start:** QR self-check-in · booking/payments/wearables · N2 cohort analytics · App.jsx stages 4–5 · code splitting · **delta writes (I10)** · Capacitor · music as a *feature* (the stage-3 quarantine move is the exception).

## Constraints and gotchas — all of these have bitten

- **`lint:crash` is blind to `<UndefinedComponent/>`.** See the section above. This is the single most important thing on this page.
- **No infra changes** (DB migrations, new services, paid APIs) without asking Dylan. Sentry counts as a service *and* a sub-processor; `eslint-plugin-react` counts as a gate change.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue, never simulate.
- **A constrained column rejecting a client value is this repo's recurring data-loss bug.** `src/lib/dbConstraints.test.js` now guards every client-written value set by **reading the migrations** — add a row there when you write a new one. Note the trap it documents: `members.status` says `cancelled` (two Ls), `entity_status` says `canceled` (one L). Both legal, different columns.
- **Drive the real UI before claiming done, and assert the ERROR BOUNDARY IS ABSENT.** "Root has children" is not evidence.
- **When you add tests, MUTATE THE CODE to prove they can fail, and confirm the mutation applied** by comparing against the original text (not by checking the search string is gone).
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** It corrupted `movementTaxonomy.js` mid-session and had to be restored from a byte-exact copy; the same trap had already silently mangled 77 sequences in the spec. Use the editor tools, or `node -e` with explicit `'utf8'`.
- **RESIZING WITHOUT RELOADING SHOWS A STALE LAYOUT.** Always reload after `resize_window`. Playwright is immune.
- **`Vary: Origin` silently breaks service-worker caching.** `ignoreVary: true` is load-bearing in `public/sw.js`; there is an e2e proving it.
- **The browser tool's console buffer persists across navigations and reloads.** Stale errors from a mid-edit broken state look exactly like current failures — this produced a false alarm in session 6. Assert on the *rendered* state.
- **The Room TV mode switch auto-hides after 4.5s** (deliberate, Fable P1/P2). Wake it with a real mousemove before clicking, or the click lands on a detaching element and reads like a flake.
- **`title` does not override text content for a button's accessible name** — use `aria-label`. All 200 roster rows announced themselves as just "Edit" until session 6.
- Local `vite build` can serve **stale** `App.jsx`. Trust the dev server, e2e and CI, not local `dist/`.
- A second chat often holds 5173. Session 6 used the default; **revert `.claude/launch.json` before committing.**
- Browser-pane **screenshots hang** on this app — use `read_page` / `get_page_text` / `javascript_tool`. React batches state: one PIN digit per call. Local PIN is `080921`; sessionStorage `jungle_pin_ok=1` skips the keypad.
- PowerShell: `npm.cmd` / `npx.cmd`; multi-line commit messages via `git commit -F <file>`. Native-command stderr surfaces as a PowerShell error even on exit 0 — check the actual output.
- The crash gate must be **0** and is NOT the ~215-message style baseline. **Never relax a rule to get a deploy out.** Declaring the correct *environment* is legitimate; so is preferring `import.meta.url` over `process.cwd()` in `src/` tests, which is how session 6 avoided touching the config at all.
- The rule that governs everything, including copy and commercial numbers: **an honest blank beats a confident wrong guess.**
