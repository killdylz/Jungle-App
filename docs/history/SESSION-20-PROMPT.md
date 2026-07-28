# Jungle — Session 20 Build Prompt

Keep building. Session 19 closed the last Phase-1 gap: **N4, the member magic-link summary, is
built** — token, two Edge Functions, migration, page, coach-side control, 75 new tests. The
product now has a member-facing surface for the first time. It is **not live**: it waits on Dylan
pasting two functions and one migration (`DYLAN-QUEUE.md` **A12**), and until he does, **no code
in this repo has ever executed against those functions.** That caveat is the single most
important thing on this page.

Session 19 also swept the Coaches screen for the first time and found the worst accessibility
surface in the app — 13 unnamed destructive buttons on a screen that had passed every previous
sweep. Remember to update the documentation that is pending items on me as well.

**Last CODE commit is `ee52b5e`**; the commit above it is this file plus a docs move, so `HEAD`
will not equal `ee52b5e` when you read this — that is expected, not drift. Tree clean, **pushed**.
Gates green:
**`lint:crash` 0 · 741 unit (27 files, no todos) · 233 e2e (27 spec files, no fixme) ·
build 204.50 KB index + 338.25 KB StaffApp + 91.04 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,382 lines** (`wc -l`) — untouched this session.

This file supersedes `SESSION-19-PROMPT.md` and `SESSION-17-PROMPT.md`, both now in
`docs/history/`.

**Do not re-raise: N4 (built), the crash gate's JSX blind spot (closed, session 18), the AST
`jsx` script (redundant), I10, DEC-12, DEC-13, I6, the "useSpotify ~2.5 KB" item, `SLOT_LABELS`,
`eslint-plugin-react`.** All shipped or answered.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–19.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- New shared surfaces after session 19: `src/lib/classToken.js`, `src/lib/summaryContent.js`,
  `src/lib/summaryApi.js`, `src/StaffApp.jsx`, `scripts/sync-token-core.mjs`, and
  `waitForApp()` in `e2e/helpers.js`. `e2e/a11yScan.js` changed behaviour — see §0b.

---

## 🔴 0b. Measurement traps — the four that cost the most in session 19

All of sessions 16–18's carry forward (`Measure-Object -Line` misses blank lines; a truncated
result is not a negative result; check what a measurement measured for a PASS *and* a FAIL; a tool
is not evidence until proven; assert your scanner found something; a frozen clock makes any
`Date.now()`-derived id non-unique; an assertion whose expected state is already the default state
proves nothing).

### 1. 🔴 A GUARD THAT REPAIRS WHAT IT INSPECTS REPORTS SUCCESS

The token core is duplicated into both Edge Functions (a function pasted into the Supabase
dashboard cannot import from `src/`), so `src/lib/classToken.mirror.test.js` reads the real `.ts`
files and compares them byte-for-byte. It imported `extractCore` from
`scripts/sync-token-core.mjs` — **and that script ran its sync at IMPORT time.** Importing the
helper re-wrote both functions, silently repairing the drift a moment before the assertions
measured it.

Proof it was broken: hand-edit a copy's `TOKEN_VERSION` to `"v2"`, run the test — it **passed**,
and the file was back at `"v1"`. Fixed by guarding the script behind a run-as-main check.

**Generalises: any node script a test imports must keep its side effects behind
`process.argv[1]`-guarded `main()`.** And: this is the *fifth* session running where the guard was
wrong before the code was. Assume your checker is broken until it has failed for the right reason.

### 2. 🔴 A TEST THAT ACCEPTS EVERY FAILURE REASON ASSERTS NOTHING

The token's malformed-input test originally accepted any of
`malformed | bad-signature | bad-payload` — which is every failure reason there is, so it only
proved `ok === false`. Tightened to pin the exact reason per input. **The loose version passed
against a mutation that removed the version-prefix check entirely.**

Same family as session 18's "expected state is already the default state". Both are: *the
assertion is satisfied by the bug.*

### 3. 🔴 A SWEEP AGAINST AN EMPTY STORE IS A SWEEP OF AN EMPTY SCREEN

The Coaches screen has **two** buttons with no coach loaded, which is exactly why
`screens.spec.js` passed it for eighteen sessions. Load the shipped sample coach and the **same
first render** grows thirteen icon-only destructive controls.

**A panel is "revealed" not only by a click but by there finally being DATA.** This is now a named
gap for the other eight screens — see §4.5, and it is the highest-yield item in this prompt.

### 4. 🔴 A SCANNER FALSE POSITIVE THAT NEARLY BECAME A FIX

`e2e/a11yScan.js` decided visibility with `offsetParent !== null`. Inside a **collapsed
`<details>`** an element reports `offsetParent` non-null **and a real 162×37 box** — but
`checkVisibility()` is false and it cannot take focus. Meanwhile the naming rules read
`innerText`, which correctly returns `""` for unrendered content. The two halves of the scan
disagreed: *invisible enough to have no name, visible enough to be judged for not having one.*

It reported two unreachable buttons as defects. Labelling them would have been pure noise dressed
as a fix. Now `offsetParent !== null && checkVisibility()` — an **AND**, so it can only ever drop
a finding the browser itself calls invisible.

⚠️ `namelessFields` was **deliberately left without a visibility filter**. It has no `<details>`
false positive, and adding one could only suppress real findings. Do not "make it consistent".

---

## The product, in one paragraph

Jungle is a white-label class operating system for boutique fitness studios — React + Vite +
Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by whether
it improves the life of the **trainer** (plans faster, runs the room without fighting software), the
**owner** (sees who is slipping away, looks premium), or the **member** (walks into a room that
knows them). A feature that improves none of those three is theatre, and this repo deletes theatre.
Commercial context: Dylan launches at the Singapore gym he freelances at (The Garage), then sells to
other gyms. The USP: Jungle learns how each coach already programs — from the slides they've written
for years — and turns that into branded, ready-to-run classes on the studio's own screens, while
quietly building the attendance record that shows who's about to quit.

---

## 0. Trust ranking

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim here that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** Its N4 row was rewritten in session 19. |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, marker is local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it** — grep the
mechanism, then `git log -S"<symbol>"` to see when it landed. Session 17 found I10 ranked as the
largest outstanding item 39 commits after it shipped, because each prompt copied the last.

---

## 1. What session 19 shipped — `a35375b` → `ee52b5e`, two commits

| Commit | What it did |
|---|---|
| `777492d` | **N4 — the member magic-link summary.** Token core + two Edge Functions + migration 0009 + the member page + the coach's "Member link" control + the root bundle split. 58 unit tests, 17 e2e. |
| `ee52b5e` | **The PersonasScreen sweep.** The worst single view held **29 unnamed buttons + 33 nameless fields**; the base screen (just a coach loaded) held **13**, all destructive. Six button sites and eight field sites fixed; 7 Coaches panels added to `e2e/revealed.spec.js`; an `a11yScan.js` false positive fixed. |

### 1a. N4, in the shape it actually landed

| Piece | Where | State |
|---|---|---|
| Token format | `src/lib/classToken.js` | ✅ 20 unit tests, incl. an **independent re-derivation** of the signature from the documented format |
| Drift guard | `src/lib/classToken.mirror.test.js` | ✅ reads the real `.ts` files; 8 tests |
| Content allow-list | `src/lib/summaryContent.js` | ✅ 17 unit tests |
| Client API | `src/lib/summaryApi.js` | ✅ 13 unit tests |
| Member page | `src/screens/ClassSummary.jsx` | ✅ 17 e2e |
| Route above AuthGate | `src/main.jsx` + `src/StaffApp.jsx` | ✅ |
| Coach control | `src/screens/runner/MemberLinkDialog.jsx` | ✅ (offline path only, locally) |
| `summary-token` fn | `supabase/functions/summary-token/index.ts` | ⛔ **NEVER EXECUTED** |
| `summary-read` fn | `supabase/functions/summary-read/index.ts` | ⛔ **NEVER EXECUTED** |
| Migration 0009 | `supabase/migrations/0009_class_summaries.sql` | ⛔ **NEVER RUN** |

🔴 **The bottom three rows are the honest state of N4.** The token algorithm, the payload shaping
and every state of the page are tested. The functions' request handling is *reasoned, not run*.
Do not describe N4 as "verified" anywhere until A12 and A13 are done.

### The design decisions worth not re-litigating

- **The page is routed ABOVE `AuthGate`** in `main.jsx`. It has to be: with Supabase configured,
  `AuthGate` shows a sign-in wall to anyone without a session, so a member tapping their link
  would be asked to log into their gym's staff app. No route inside `App` could fix that, because
  `App` never renders. **This is invisible locally** — the credential-less build has no wall — so
  `e2e/memberSummary.spec.js` asserts *"no app shell and no sign-in"*, not *"the summary is there"*.
- **The token is class-scoped, never member-scoped.** A leaked link exposes one class's
  programming — the same content the share card already publishes to Instagram — and names
  nobody.
- **RLS was not loosened to `anon`**, and 0007's policies were not touched. `summary-token` runs
  entirely under the caller's JWT so **RLS is the authorization check**, and never touches the
  service-role key. `summary-read` uses that key only *after* an HMAC + expiry check.
- **Not JWT.** One algorithm, not named anywhere the token can influence.
- **Fragment, not query string.** A fragment never leaves the browser; `?s=` lands in access logs
  and leaks via `Referer`.
- **`summaryContent()` is an allow-list, not a cleaner.** A new field on a stage object cannot
  reach a member by default. That property is what the class-scoping guarantee rests on — if it
  ever becomes a blocklist, the guarantee becomes a hope.
- **TTL is 14 days**, deliberately unlike LEGAL §4's 15 minutes for QR. This is a read of
  programming; that is a write of attendance. **Do not copy the number across.**

### 1b. The root bundle is split — and what it cost

`main.jsx` lazy-loads `ClassSummary` and `StaffApp`. Measured on a **production-shaped build**
(dummy `VITE_SUPABASE_*` so rollup keeps the sync paths), at `777492d`:

| | before | after |
|---|---|---|
| a **member** downloads | 776.85 KB | **206.69 KB** (`index` 198.29 + `ClassSummary` 5.49 + `summaryApi` 2.91) |
| **staff** download | 776.85 KB | 782.71 KB (`index` + `StaffApp` 584.42) |

**~570 KB off the member path, 5.9 KB onto staff.** Verified by grepping the emitted chunks for
`GoTrueClient`/`PostgrestClient` — supabase-js is in `StaffApp`, not the member path.

⚠️ **The credential-less local build cannot answer this question**: it strips the sync code and
shows no supabase in *any* chunk. Use dummy vars, and grep the chunks rather than assuming.
⚠️ The local and prod-shaped builds also disagree on `index` (204.50 vs 198.29 KB). Both are real;
they are different builds. Do not compare a number from one against a number from the other.

**Two real regressions the split caused, both fixed:**
1. The skin is applied by `applySkinCSS`, which now runs only once the lazy chunk lands — a flash
   of near-black for any gym with a light palette. Fixed with `bootColours()`; `main.jsx` paints
   the last-used colours before React mounts. Measured by holding the chunk with `page.route` so
   the boot state stopped being a race.
2. Two `display.spec.js` tests read `:root` custom properties before mount and computed `NaN`.
   **New `waitForApp()` in `e2e/helpers.js` — any test reading a computed style must call it.**

---

## 2. 🔬 The method — unchanged, still the highest-yield thing here

1. **Ask the generic question, not the enumerated one.** Session 19: "what does this screen look
   like once it has DATA?" beat any list of panels to check.
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI to check your own inference.** Session 19's hash-navigation behaviour, the
   `<details>` visibility question, and the boot-colour fix were each settled by a 30-second probe
   after reasoning got it wrong or half-right.
4. **Prove a tool before trusting it**, and **prove a test can fail** before believing it.
5. **Re-run the scanners AFTER a feature lands, not only before one.**
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

### 3.1 The Phase-1 gap is closed — what replaces it

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. |
| **P2** | **Capacitor wrap** | 🟡 **Unblocked in principle** — the spec gated it on "a member-facing surface worth installing", which now exists. **Still wait until A13 proves a real member opens a real link.** Shipping a store app for an unverified surface is the same mistake in a new wrapper. |
| **F6 privacy/consent page** | Per-gym privacy notice | ⛔ Unbuilt. **Now more relevant than it was**: N4 is the first member-visible surface. It collects nothing, so it does not trip the "no consent record before a real notice" rule — but the moment anything member-identifying is added, this becomes a blocker. `recordConsent` still has zero callers and **that is still correct**. |

### 3.2 Outcome tier — real value, none of it started

**N2** cohort analytics (waiting on attendance volume, not code — which waits on the pilot
running), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy LLM
fallback (deferred by design), **F4-QR** (never loosen RLS to `anon` — and note the token half now
EXISTS, see §7), **P2** (see above).

### 3.3 Deliberately unbuilt — do not "fix" these

- **Consent notice surface.** `recordConsent` has zero callers, **and that is correct**.
- **Templates · Glossary · Discover · Integrations · attendee b64 share.** Retired or folded.
  `navRoutes.test.js` guards the "a fold is not a deletion" half.
- **Music / Auto-DJ.** Cut (audit 2.1), quarantined in `src/music/`, **not deleted**. **Do not undo
  the `FLAGS.music` gates to "simplify"** — each is load-bearing for ~12.7 KB.
- **Member data on the summary page.** `ClassSummary.jsx` renders an allow-list. Adding a member's
  name or streak turns a link that gets pasted into group chats into a PDPA disclosure, and needs
  a different token design plus a privacy notice first.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural

**Empty.** Third session running. (App.jsx is 3,382 lines and was not touched in session 19.)

### 4.2 Bundle / performance

| # | Item | Measured |
|---|---|---|
| **I9 leftover** | Remaining candidates are all **weak**: `BrandStudioScreen` (needs a shared module for `PRESET_SKINS`), `LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves), `AdminTeamScreen`. | **Measure before splitting**; `build-sw` precaches every emitted chunk (52 files, ~1350 KB), so a chunk nothing fetches costs every install. |
| — | Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (`storage-js` 22 KB unused — **Dylan said leave it**) · `src/data/library.js` 58 KB. | |
| 🆕 | **`PRESET_SKINS` extraction is now worth more than it was.** `ClassSummary` needed the gym's palette and got it via a **brand snapshot** resolved from live CSS vars at publish time — which is correct and handles custom palettes, but a second consumer would tip the balance toward a shared `src/data/skinTokens.js`. | Don't do it speculatively. |

📏 **Production shape re-measured session 19 at `777492d`** — see §1b. Quote absolutes, never
percentages; the spec carried "~37%" for three sessions and it was ambiguous about which side you
divide by.

### 4.3 Sync / data plumbing

| # | Item |
|---|---|
| **I14** | **Hydrate pagination.** Unexercised locally. TECH-PLAN §5: do at first paying gym. |
| **I8** | **Server-side media proxy** — the RapidAPI key field is the last client-side third-party access. LEGAL §3 suggests hiding the field for the pilot. |
| — | **`sync_incidents` telemetry** (TECH-PLAN §6). Post-pilot. |
| 🆕 | **`class_summaries` is NOT in the sync path, deliberately.** It is written only by the Edge Function when a coach presses "Member link". Do not add it to `store.js`'s domain list — publishing is an act, not a side effect, and keeping it out is what bounds the blast radius of the token. |

### 4.4 Tooling and hygiene

| # | Item |
|---|---|
| **`deadctl` blind spots** | Cannot evaluate `FLAGS.*` gating (anything behind a false flag reports dead) and **lacks an inert-ancestor check**. Over-reporting is the right failure direction, but **every hit needs a reachability check** — session 18 triaged 5 of 7 as not-defects. ⚠️ **It also has no `<details>` awareness** — see §0b#4; assume the same class of false positive. |
| 🆕 **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if the copies are stale. The mirror test enforces it, but the script is the fix. |
| **Docs** | 🔴 **`SESSION-HANDOFF.md` is 165 KB and grew 18 KB in one session — bigger than every source file except App.jsx. It is now the worst hygiene problem in the repo.** Root is down to **19 `.md`** (session 19 moved `SESSION-17-PROMPT`, `SESSION-19-PROMPT` and the 15-session-stale `NEXT-SESSION-PROMPT` into `docs/history/`, which now holds 15). What remains at root: 9 audit/strategy files, the spec, `DYLAN-QUEUE.md`, `SESSION-HANDOFF.md`, this file. ⚠️ `docs/FABLE-AUDIT-PROMPT.md` still references `NEXT-SESSION-PROMPT.md` by its old path; left alone deliberately, it is a record of what was asked of Fable in July, not a live pointer. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| 🔴 **The other eight screens, with DATA loaded** | **The highest-yield item in this prompt.** Coaches was swept for the first time in session 19 and produced 60 unnamed controls and 38 nameless fields, entirely because the previous sweep ran against an empty store. `screens.spec.js` sweeps all nine screens on `freshApp` — i.e. all nine empty. **Members, Schedule, Exercise Library, Brand Studio, Team and Dashboard all render list rows with per-row icon controls once they have content.** Expect a similar haul. |
| **A gym class type end-to-end** | Seven tests cover creation → Builder → smart-build → reload → reset. **Not covered: running one in the Runner and checking in against it.** `class_instances.class_type` is plain `text` with **no CHECK constraint** (verified session 18), so there is no rejection risk — but the path has never been driven, and empty movement pools are a state that did not exist before session 18. |
| **The Builder's own modals** | `LibraryBrowserModal`'s edit mode is covered; its **add-exercise and per-movement panels under a gym-authored class type** (empty pools) are not. |
| **N4's Edge Functions** | ⛔ Not reachable locally, by construction. `DYLAN-QUEUE.md` A12/A13. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). `DYLAN-QUEUE.md` A11. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands,
expected output, failure modes and undo steps. **Part B is now EMPTY** — every decision was
answered in session 18 and the table is kept only as a record. Do not duplicate Part A here; read
it and ask what has moved.

Headlines, in the order that matters:

- 🆕 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min. **Until
  this is done, N4 is code nobody has run.**
- 🆕 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person. Asks him to confirm it names nobody but the coach.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. Still the one item that gets dramatically more expensive with time.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** (the wedge feature, never once run against a real corpus) · **A11 the seven live checks**.

---

## 6. What the crash gate still cannot see

`react/jsx-no-undef` has been in the gate since session 18 and catches `<Foo/>` where `Foo` is
undefined. Two things it does **not** catch, both of which have shipped defects before:

1. **A screen that is ABSENT rather than undefined** — a route whose render branch was removed.
   `src/lib/navRoutes.test.js` guards this half. **Drive the real UI and assert the coach LANDED**,
   by a control only the destination has. "Root has children" is satisfied by the shell.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error boundary
   is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`** — all three a11y
   sweeps read that list.

⚠️ 🆕 **`ClassSummary` is deliberately NOT in `SCREENS`.** It is not a nav destination and it
renders outside `App`. It has its own spec (`e2e/memberSummary.spec.js`) including an a11y scan.
Adding it to `SCREENS` would break every sweep, because `nav()` cannot reach it.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error. Same
for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 19:**

- 🔴 **A node script imported by a test must guard its side effects behind a run-as-main check.**
  See §0b#1. This is the whole lesson of the session.
- 🔴 **Changing only the URL fragment is a same-document navigation** — the browser does not re-run
  `main.jsx`. Pasting a member link into a tab that already has the app open used to look exactly
  like a broken link. `main.jsx` now reloads on a `hashchange` that carries a token. **In
  Playwright, open a member link via `about:blank` then `goto` — a bare hash-only `goto` leaves the
  previous document running, and an explicit `page.reload()` afterwards RACES the app's own reload
  and times out.**
- 🔴 **`checkVisibility()`, not `offsetParent`, for "is this on screen".** A collapsed `<details>`
  defeats `offsetParent` and `getBoundingClientRect` together. See §0b#4.
- **A test that reads a computed style must call `waitForApp(page)` first** — the app is a lazy
  chunk now. Assertions on *elements* auto-wait and are unaffected.
- **Chromium logs its own "Failed to load resource" line for every non-2xx**, so a test that
  deliberately stubs a 401/404 always produces one. Filter exactly that rather than dropping
  `expectNoConsoleErrors` — the guard that the error path did not *also* throw is the valuable half.
- **Reaching for `window` inside a lib function makes unit failures unreadable.** `publishSummary`
  built its URL from `window.location.origin`; in the node test runner the reference threw and the
  catch turned a perfectly good publish into `{reason:"failed"}`. Inject the origin.
- **A mutation that creates dead code can break the minifier, not the test.**
  `if (false && x) y;` inside a `for...of` made esbuild fail with *"Cannot use a declaration in a
  single-statement context"*, which looks like a real build break. Mutate a VALUE (rename a key,
  point at a different property), not a control-flow branch.
- **PowerShell tore apart a `node -e` one-liner containing quotes** — again, the documented trap.
  **Write a `.mjs` to the scratchpad and run it.** Same rule as `git commit -F`.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** (0009 needs none: `content` and `brand` are `jsonb` with no CHECK, deliberately.)
  Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.**
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js` guards on
  value change instead.
- **A hook cannot be called from inside `{cond && …}`.** Six components have been extracted for
  exactly this reason (`MemberLinkDialog` is the newest). Expect to do it again.
- **`page.clock.setFixedTime` freezes `Date.now()`.** Advance the clock between actions whose
  identity you need to distinguish.
- **`getLibrary()` is read per render, deliberately** — not memoised. Do not "optimise" it into a
  `useMemo([])`.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called while
  it is open.** Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright AUTO-DISMISSES**,
  so a test that ignores the dialog silently exercises the *cancel* path and still passes.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **`nav()` is DESKTOP-ONLY.** A phone gets the bottom bar.
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures.** `page.clock.setFixedTime` before `freshApp`, or build every instant
  relative to now.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** Use editor tools
  or `node` with explicit `'utf8'`. PowerShell's console also *displays* mojibake for UTF-8 —
  that is the terminal, not the file.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Wake and act in the SAME test.
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.** Prefer a fresh
  e2e run with `expectNoConsoleErrors`.
- **`innerText` respects `text-transform`; `textContent` does not.**
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **A `Buffer` reference in a test file fails `lint:crash`.** Use string length or `TextEncoder`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`. ⚠️ Wrap `javascript_tool` snippets in an IIFE. **For a real screenshot, drive
  Playwright directly** (session 19 rendered the member page on a 390px viewport that way, in both
  a dark and a light brand, and it took 9 seconds).
  PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e has
  5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `curl`/`Invoke-WebRequest`.
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4** — it fails at startup. Omit the flag.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — rebuild them, they are cheap

All use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at
the repo's `package.json`. **Anchor slices on declaration NAMES, not line numbers.**

1. **`outline <file>`** — every top-level declaration with its line span.
2. **`scan <file> <Decl,…>`** — what imports the moved code needs, which same-file declarations it
   leans on, which of those the rest of the file still uses (⇒ shared module, not a move). **Run it
   transitively.**
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report unused
   UPPERCASE imports, so eslint is silent about every constant and component. **Rebuilt and proven
   in session 19** (planted two dead imports, both caught); ran clean over all ten new/changed
   files. **End it with a `scanned N/M` line and exit non-zero on zero** — a scanner that silently
   parsed nothing reports a clean bill of health.
5. **`deadctl <file…>`** — dead controls, passive-only, fake affordances, unused props. See §4.4
   for its blind spots.
6. **`handlers`** — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed by
   event type. Established that the app's DOM surface is 14 event types across 64 files.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an accurate
reading of what a file depends on.
⚠️ **Beware a local declaration that shadows an import** — `FloorLiveScreen`'s own `fmt`.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 741 unit (27 files, no todos) · 233 e2e (27 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~338.25 KB · PersonasScreen ~91.04 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less). CI runs the same chain on Linux;
the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 20

1. **`git fetch` and read §0a.** Then read `DYLAN-QUEUE.md` and **ask Dylan whether A12 and A13
   are done.** If A12 is done, the first job is verifying N4 against the real functions — that is
   the only untested part of it, and it is untested by construction.
2. 🔴 **Sweep the other eight screens WITH DATA LOADED** (§4.5, §0b#3). Session 19 proved this is
   where the defects are: the Coaches screen went from "passes every sweep" to **13 unnamed
   destructive controls on first render and 29 + 33 in its worst view**, entirely because every
   previous sweep ran against an empty store. Members, Schedule, Exercise Library, Brand Studio
   and Team all render per-row icon controls once they have content. **This is the
   highest-expected-value item in the prompt and it is a direct extension of a technique that just
   paid.**
3. **Then drive a gym-authored class type through the RUNNER** to a check-in (§4.5). No constraint
   risk (verified), but the path has never been run.
4. **Then the docs.** 19 `.md` at root and a **165 KB** `SESSION-HANDOFF.md` that grew 18 KB in one
   session. It is now the worst hygiene problem in the repo. Proposal worth putting to Dylan:
   keep the top *two* session blocks in `SESSION-HANDOFF.md` and move the rest to
   `docs/history/HANDOFF-ARCHIVE.md`, plus move the 9 audit/strategy files into `docs/`.
5. **Do not start N2/N3.** They wait on attendance volume, which waits on the pilot running, which
   waits on `DYLAN-QUEUE.md` Part A. Building them now is building on a guess.
6. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link. The spec
   gated it on a member-facing surface *existing*; the honest gate is a member-facing surface
   *working*.
