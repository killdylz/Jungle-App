# Jungle — Session 19 Build Prompt

Keep building. Session 18 cleared the whole named backlog that was mine to clear: DEC-16 shipped,
the crash gate's twelve-session blind spot is closed, edit-a-scheduled-class exists, and the last
unswept interaction surface is swept. **What is left is N4, and then a queue that is mostly
Dylan's.**

`main = 2058625`, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 683 unit (no todos) · 202 e2e (no fixme) · build 537.75 KB + 89.97 KB chunk**.
App.jsx **3,382 lines** (`wc -l`). 26 e2e spec files.

This file supersedes `SESSION-17-PROMPT.md` and `SESSION-18` (there was none — session 18 ran off
the session-17 prompt plus Dylan's decisions). **Parts of session 17's prompt are stale**: its
§4.3 (I10) was wrong, its §4.5 focus-trapping / revealed-panels / mount-writes rows are done, and
its §4.4 dead-symbol and `eslint-plugin-react` rows are done.

**Do not re-raise I10, DEC-12, DEC-13, I6, the "useSpotify ~2.5 KB" item, `SLOT_LABELS`, or
`eslint-plugin-react`.** All answered or shipped.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–18.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- New shared surfaces after session 18: `src/lib/libraryAccess.js`, `src/ui/dialog.js`,
  `src/ui/useAfterMount.js`, and `e2e/a11yScan.js`. Each is imported by several files now.

---

## 🔴 0b. Measurement traps — the two that cost the most in session 18

All of session 16's and 17's carry forward (`Measure-Object -Line` misses blank lines; a truncated
result is not a negative result; check what a measurement measured for a PASS *and* a FAIL; a tool
is not evidence until proven; assert your scanner found something).

🔴 **NEW — a test can be VACUOUS in two different ways, and session 18 hit both:**

1. **A frozen clock makes any `Date.now()`-derived id non-unique.**
   `page.clock.setFixedTime` freezes `Date.now()` outright — two reads 1.5s apart both returned
   `1784520000000`. A schedule rule's id is `` `uc${Date.now()}` ``, so code that *re-founds* a
   rule mints the **same id** as the one it replaced, and "the id survived the edit" passes whether
   the code preserves it or not. Caught only by mutation. **Fix: advance the clock between the two
   actions you are trying to tell apart.** Generalises: *a test that freezes time cannot
   distinguish two objects created from `Date.now()`.*

2. **An assertion whose expected state is already the default state.**
   The first version of the gym-class-type test asserted "the draft has stages, including a warmup
   and a cooldown". A fresh Builder **already** has five stages from `mkStages()` with exactly
   those types, so it was true either way — and it passed against a real, shipped defect.
   **Fix: establish a known-DIFFERENT starting point, then assert the change.** Applying a built-in
   class type first both provides that and doubles as a control.

🔴 **And the standing one, now with a fourth instance: the guard was wrong before the code was.**
Session 16 had three, session 17 had StrictMode defeating a mount-guard ref, session 18 had both
of the above. Assume your checker is wrong until it has failed for the right reason.

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
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** Its I10 row was corrected in session 17, its I9 numbers re-measured. |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, marker is local-only. |

⚠️ **Session 17 proved rank 3 can be wrong for two sessions running.** I10 was ranked the largest
outstanding engineering item 39 commits after it shipped, because each prompt copied the last.
**Verify a named backlog item against the CODE before spending a session on it** — grep the
mechanism, then `git log -S"<symbol>"` to see when it landed.

---

## 1. What session 18 shipped — `c2db26f` → `2058625`, ten commits

| Commit | What it did |
|---|---|
| `34925db` | **The last unswept interaction.** AST scan of every `on*` on an intrinsic element: the app's whole DOM surface is **14 event types across 64 files**. `onPaste` has **zero** occurrences — there were never any paste handlers. Two handlers no test fired (`onTouchStart` on Room TV, `onBlur` on the schedule's empty slot); both correct, now pinned. |
| `4c6e4f5` | **Edit a scheduled class** — rename and re-slot, preserving the rule `id`. Plus the frozen-clock finding. |
| `c29a9c9` | `SLOT_LABELS` removed. |
| `80d303a`·`f806f68` | **`DYLAN-QUEUE.md`** — every blocked item with actual steps, split into "config he can finish alone" and "decisions only". |
| `1d96984` | **Four of Dylan's decisions.** 3 dead symbols deleted; **`eslint-plugin-react` added and the crash gate's JSX blind spot CLOSED**; 12 session prompts → `docs/history/`; stale model default fixed. |
| `09237e5` | **DEC-16 — gym-authored class types.** `getLibrary()` out of App.jsx into `src/lib/libraryAccess.js`; ten call sites moved; the "+ New class type" button restored. |
| `06554cb` | 🔴 **The regression DEC-16 shipped**, found an hour later (below). |
| `2058625` | `deadctl` back to zero. |

### The finding that generalises

**Session 15's lesson was "a control that does nothing". Session 16's was "a guard that does
nothing". Session 18's is: _the feature you just shipped is the most likely place to find the next
defect, and your own new test is the least likely thing to catch it._**

DEC-16 moved every catalogue READ to the merged library and shipped green. An hour later,
regression-testing it found that `applyTemplate` builds its stage skeleton from
`CLASS_STAGE_TEMPLATES` — a **separate** built-in constant that can never hold a `gym-` key. So
selecting a gym's own type returned early and **left the previous class type's stages in place**:
the dropdown said Barre, the Builder showed CrossFit. Worse than "nothing happens", because the
label and the content disagreed silently.

The first test written for it passed against the bug (§0b #2).

---

## 2. 🔬 The method — unchanged, still the highest-yield thing here

1. **Ask the generic question, not the enumerated one.** Session 18: "which DOM handlers does no
   test fire?" beat "do the paste handlers work?" — and answered that there are no paste handlers.
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects.
3. **Drive the UI to check your own inference.** Session 18 twice reasoned to a wrong conclusion
   and was corrected by a 30-second probe.
4. **Prove a tool before trusting it**, and **prove a test can fail** before believing it.
5. **Re-run the scanners AFTER a feature lands, not only before one.** Both real `deadctl` hits in
   session 18 were created by that session's own work.
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

### 3.1 🔴 The one real product gap — and it is APPROVED

| # | Feature | State |
|---|---|---|
| **N4** | **Member magic-link summary** | 🟢 **APPROVED by Dylan in session 18: build now, he deploys when `DYLAN-QUEUE.md` Part A is green.** Still the only member-facing surface in the product and the last Phase-1 gap. **This is the next thing to build.** |

**What N4 needs.** An Edge Function issuing a **signed, class-scoped, short-lived token**
(`{class_instance_id, gym_id, exp, HMAC}`), plus the member-facing summary page. No member
accounts, no login, no PII in the URL, and **never loosen RLS to `anon`** — the Edge Function is
the boundary. Follow the LEGAL §4 design that already exists for QR check-in.

⛔ **Do not build the page first.** That is the `<AttendeeView/>` mistake, and it is in the spec
twice for a reason.

Two things session 18 established that de-risk it:
- The token is **class-scoped, not member-scoped**, so the page shows what the class *was* — the
  same content the share-card already publishes. A leaked link exposes gym programming, not member
  PII. That is materially lower risk than the QR design.
- The per-gym privacy/consent page is **also unbuilt** (spec §F6). N4 collects nothing so it does
  not trip the "no consent record before a real notice" rule, but it is the first member-visible
  surface and worth saying so out loud.

### 3.2 Outcome tier — real value, none of it started

**N2** cohort analytics (waiting on attendance volume, not code — which waits on the pilot
running), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy LLM
fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`), **P2** (gated behind N4).

### 3.3 Small gaps still open

| # | Item | Notes |
|---|---|---|
| ~~Gym-authored class type~~ | ✅ **DONE** (`09237e5` + `06554cb`). |
| ~~Edit a scheduled class~~ | ✅ **DONE** (`4c6e4f5`). |
| **Per-gym privacy/consent page** | Unbuilt (spec §F6). `recordConsent` still has zero callers, **and that is still correct** — the rule is no consent record before a real notice exists. Becomes relevant with N4. |

### 3.4 Deliberately unbuilt — do not "fix" these

- **Consent notice surface.** `recordConsent` has zero callers, **and that is correct**.
- **Templates · Glossary · Discover · Integrations · attendee b64 share.** Retired or folded.
  `navRoutes.test.js` guards the "a fold is not a deletion" half.
- **Music / Auto-DJ.** Cut (audit 2.1), quarantined in `src/music/`, **not deleted**. **Do not undo
  the `FLAGS.music` gates to "simplify"** — each is load-bearing for ~12.7 KB. Note that
  `deadctl` reports the fake toggle at `App.jsx:2509` and several `FLAGS.mockAnalytics` controls as
  dead; they are **cut code, not live code** (§4.4).

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural

**Empty.** Second session running.

### 4.2 Bundle / performance

| # | Item | Measured |
|---|---|---|
| **I9 leftover** | Remaining candidates are all **weak**: `BrandStudioScreen` (needs a shared module for `PRESET_SKINS`), `LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves), `AdminTeamScreen`. | **Measure before splitting**; `build-sw` precaches every emitted chunk, so a chunk nothing fetches costs every install. |
| — | Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (`storage-js` 22 KB unused — **Dylan said leave it**) · `src/data/library.js` 58 KB. | |

📏 **Production, re-measured session 17 at `843547d`: 776.85 KB main + 91.19 KB chunk = 868 KB,
214.43 KB gzip.** Taken by building with dummy `VITE_SUPABASE_*` vars so rollup keeps the sync
paths. **Quote the gap as an absolute — ~241 KB stripped from the main chunk — not a percentage;**
the spec carried "~37%" for three sessions and it was ambiguous about which side you divide by.
That reproduces production's *shape*; the CI-built bundle is still the authority.

### 4.3 Sync / data plumbing

| # | Item |
|---|---|
| ~~**I10**~~ | ✅ **SHIPPED** in `224b074` (session 15), verified session 17. Do not re-raise. |
| **I14** | **Hydrate pagination.** Unexercised locally. TECH-PLAN §5: do at first paying gym. |
| **I8** | **Server-side media proxy** — the RapidAPI key field is the last client-side third-party access (Deezer left with `fetchBpmData` in session 18). LEGAL §3 suggests hiding the field for the pilot. |
| — | **`sync_incidents` telemetry** (TECH-PLAN §6). Post-pilot. |

### 4.4 Tooling and hygiene

| # | Item |
|---|---|
| ~~**§6 crash-gate JSX hole**~~ | ✅ **CLOSED** (`1d96984`). `react/jsx-no-undef` is in the gate and **proven** — a planted `<ThisComponentDoesNotExist/>` fails it. The AST `jsx` script is now redundant; `screens.spec.js` and `navRoutes.test.js` still cover what the rule cannot (a screen that is ABSENT rather than undefined). |
| ~~4 dead symbols~~ | ✅ **DONE.** All four cleared. |
| **`deadctl` blind spot** | The rebuilt scanner **cannot evaluate `FLAGS.*` gating**, so anything behind a false flag reports as dead, and it **lacks an inert-ancestor check** (the Brand Studio preview's sample button reports as a dead control). Over-reporting is the right failure direction, but **every hit needs a reachability check before it is believed** — session 18 triaged 5 of 7 as not-defects. |
| **Docs** | Root is much better: 12 session prompts moved to `docs/history/`. Still at root: a **147 KB `SESSION-HANDOFF.md`**, 9 audit files, `NEXT-SESSION-PROMPT.md`, and now `DYLAN-QUEUE.md`. The handoff is bigger than any source file except App.jsx. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| **Interaction-revealed panels** | Six are swept (`e2e/revealed.spec.js`). **Still unswept: `PersonasScreen`'s panels** — `deadctl` reports it clean but its revealed surfaces have never been driven. Session 18 found four unnamed Room TV gears purely by extending that sweep one click further, so the pattern pays. |
| **The Builder's own modals** | `LibraryBrowserModal`'s edit mode is covered; its **add-exercise and per-movement panels under a gym-authored class type** (empty pools) are not. An empty pool is a new state as of session 18. |
| **Coaches / Personas** | 6 e2e tests on catalogue derivation. Its interaction-revealed panels are still unswept, and `PersonaPlanEditor` now has a `useDialog` that no test drives. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). In `DYLAN-QUEUE.md` A11. |
| **A gym class type end-to-end** | Seven tests cover creation → Builder → smart-build → reload → reset. **Not covered: running one in the Runner and checking in against it.** `class_instances.class_type` is plain `text` with **no CHECK constraint** (verified session 18), so there is no rejection risk — but the path has never been driven. |

---

## 5. ⛔ Blocked on Dylan — now in `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands, expected
output, failure modes and undo steps. Do not duplicate it here; read it and ask what has moved.

Headlines: **A1 Supabase region check** (never confirmed as `ap-southeast-1`, and a project's region
cannot be changed in place — the one item that gets dramatically more expensive with time) ·
**A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
**A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides import**
(the wedge feature, never once run against a real corpus) · **A11 the seven live checks**.

Decisions already answered in session 18: N4 **yes**, dead symbols **delete**, DEC-16 **yes**,
`eslint-plugin-react` **yes**, docs **yes**, model default **yes**, Sentry **after the lawyer**,
`storage-js` **leave**, `winBackBlockedReason` **keep**.

---

## 6. 🔴 The crash gate's JSX hole is CLOSED — here is what it still cannot see

`react/jsx-no-undef` now catches `<Foo/>` where `Foo` is undefined. Two things it does **not** catch,
and both have shipped defects before:

1. **A screen that is ABSENT rather than undefined** — a route whose render branch was removed.
   `src/lib/navRoutes.test.js` guards this half. **Drive the real UI and assert the coach LANDED**,
   by a control only the destination has. "Root has children" is satisfied by the shell.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error boundary
   is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`** — all three a11y
   sweeps read that list.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error. Same
for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 18:**

- 🔴 **`page.clock.setFixedTime` freezes `Date.now()`** (§0b #1). Advance the clock between actions
  whose identity you need to distinguish.
- 🔴 **A hook cannot be called from inside `{cond && …}`.** Session 17 and 18 extracted five
  components (`ResetLibraryConfirm`, `SmartBuildDialog`, `AddClassDialog`, plus two) for exactly
  this reason and no other. Expect to do it again for any new `useDialog`/`useAfterMount` site.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called while
  it is open** — the sidebar is genuinely covered (probed: `elementFromPoint` over it returns one of
  the modal's own class buttons). Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright AUTO-DISMISSES**,
  so a test that ignores the dialog silently exercises the *cancel* path and still passes.
  **Assert both branches** — and a blank/whitespace input is a *third* branch worth asserting.
- **Write commit messages to a file and use `git commit -F`.** Session 18 passed one inline and
  PowerShell tore it apart on the quotes. This is documented and I still did it.
- **`getLibrary()` is read per render, deliberately** — not memoised. That is what makes a class
  type created in the Library appear in the Builder with no cross-component plumbing. Do not
  "optimise" it into a `useMemo([])`.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.**
- **StrictMode defeats a "have I mounted yet" ref** — dev-only, so the naive guard works in prod and
  fails in dev. `src/ui/useAfterMount.js` guards on value change instead.
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **`nav()` is DESKTOP-ONLY.** A phone gets the bottom bar.
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures.** `page.clock.setFixedTime` before `freshApp`, or build every instant
  relative to now.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** Use editor tools
  or `node -e` with explicit `'utf8'`. PowerShell's console also *displays* mojibake for UTF-8 —
  that is the terminal, not the file.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Conditional render — wake and act in the SAME
  test. ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.** Prefer a fresh
  e2e run with `expectNoConsoleErrors`.
- **`innerText` respects `text-transform`; `textContent` does not.** This cost two wrong markers in
  session 17 ("YOUR STATS", "REPEAT").
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`build-sw` precaches everything in `dist`.**
- **A `Buffer` reference in a test file fails `lint:crash`.** Use string length or `TextEncoder`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
  ⚠️ Wrap `javascript_tool` snippets in an IIFE.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e has
  5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `curl`/`Invoke-WebRequest`.
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
3. ~~**`jsx <file…>`**~~ — **now redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report unused
   UPPERCASE imports, so eslint is silent about every constant and component. This found the
   `WORKOUT_LIBRARY` import DEC-16 orphaned.
5. **`deadctl <file…>`** — dead controls, passive-only, fake affordances, unused props. **Rebuilt in
   session 18**; see §4.4 for its two known blind spots. It reported 7, of which 5 were
   flag-gated or `inert`.
6. **`handlers`** 🆕 — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed by
   event type, cross-referenced against the Playwright APIs the suite calls. Filtering to lowercase
   matters: ~60% of `on*` attributes in this app are component props (`onClose`, `onBack`), which
   are deadctl's territory. This is what established the DOM surface is 14 types and that `onPaste`
   does not exist.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an accurate
reading of what a file depends on.
⚠️ **Beware a local declaration that shadows an import** — `FloorLiveScreen`'s own `fmt`.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 683 unit (no todos) · 202 e2e (no fixme) · main chunk ~537.75 KB + an
~89.97 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI question was
settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 19

1. **`git fetch` and read §0a.** Then read `DYLAN-QUEUE.md` and ask Dylan what has moved — several
   Part A items unblock verification you cannot otherwise do.
2. 🔴 **N4 — the member magic-link summary.** Approved, and it is the last Phase-1 gap and the only
   member-facing surface in the product. **Edge Function and token FIRST, page second.** Hand Dylan
   the function to paste when Part A is green.
3. **Then the PersonasScreen revealed-panel sweep** (§4.5) — the one screen the interaction sweep
   has never reached, and session 18 showed that extending a sweep one click further is reliably
   productive.
4. **Then drive a gym-authored class type through the RUNNER** (§4.5) — creation through to a
   check-in. No constraint risk (verified), but the path has never been run, and empty pools are a
   state that did not exist before session 18.
5. **Then `docs/history/` for the rest of the root docs** if Dylan agrees — the 147 KB handoff is
   the remaining problem.
6. **Do not start N2/N3.** They wait on attendance volume, which waits on the pilot running, which
   waits on `DYLAN-QUEUE.md` Part A. Building them now is building on a guess.
