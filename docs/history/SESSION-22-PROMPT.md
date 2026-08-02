# Jungle — Session 22 Build Prompt

Keep building. Session 21 took §4.5's top item — **read back the STORED row after every UI
write** — and it paid on the first thread it pulled. `class_instances.class_type` had **three
writers speaking two taxonomies**, and the column session 20 recorded as fixed was still split.

The sharpest part: **`e2e/schedule.spec.js` was asserting the defect.** It pinned
`classType: "HIIT"` while `e2e/checkin.spec.js` pinned `"hiit"` — same column, contradictory
contracts, both green for several sessions. A green suite is evidence the code matches the
tests, not that the tests match the product.

**Last commit is `ce96f91`**, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 759 unit (27 files, no todos) · 245 e2e (28 spec files, no fixme) ·
build 204.50 KB index + 339.17 KB StaffApp + 91.04 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,382 lines — untouched this session.**

This file supersedes `SESSION-21-PROMPT.md`, now in `docs/history/`.

**Do not re-raise:** N4 (built), the eight-screen a11y sweep (done, clean), the crash gate's JSX
blind spot (closed), the AST `jsx` script (redundant), docs hygiene (done), I10, DEC-12, DEC-13,
I6, "useSpotify ~2.5 KB", `SLOT_LABELS`, `eslint-plugin-react`, **the `class_type` vocabulary
(closed, §1)**, and **"member CSV import ↔ the status model" (§1c — the premise was wrong)**.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–21.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- New shared surfaces after session 21:
  - **`resolveClassType(raw, lib)`** exported from `src/lib/libraryStore.js` (pure, zero imports).
  - **`applyAttendanceImport(analysis, lib)`** — second parameter is NEW and optional. Without
    it the old behaviour is preserved exactly, so no existing caller changed meaning.
  - `CalendarScreen` now imports `getLibrary()`. **`CAT_COLOR` is deleted** — if a document
    mentions it, that document predates `ce96f91`.
- Root is **6 `.md`**; `docs/` holds 13; `docs/history/` holds 18. Sessions 6–**19** of the
  handoff are in `docs/history/HANDOFF-ARCHIVE.md`.

---

## 🔴 0b. Measurement traps

All of sessions 16–20's carry forward. Three new ones, and the first is the important one.

### 1. 🔴 A MUTATION THAT CHANGES NOTHING PROVES NOTHING

Mutating `k.toLowerCase() === want` → `k === want` left **all 757 tests green**, which for a
moment read as a hole in the suite. It was not. `want` is already lowercased and every
catalogue key is lowercase by construction, so the two expressions are *equivalent* — the
mutation never changed behaviour, so no test could have caught it.

Re-mutated on the value that actually carries the behaviour (`want = s.toLowerCase()` →
`want = s`) and **9 tests failed for the right reason**.

**Generalises:** "I mutated the code and nothing failed" has two causes — a missing test, or a
mutation that was a no-op. **Establish which before believing either.** The repo already says
"mutate a VALUE, not a control-flow branch"; this is the other half of the same rule.

### 2. 🔴 A PASSING TEST CAN ENCODE THE DEFECT

Two specs asserted contradictory values for one column and both passed. The trust ranking calls
a passing test "the only claim that cannot go stale silently" — true of its relationship to the
CODE, false of its relationship to the PRODUCT.

**When a field has more than one writer, grep for every spec that asserts on it and read them
side by side before trusting any of them.** If two disagree, that is the finding.

### 3. `Grep`'s output on Windows path-normalises `//` into `\`

Comment lines came back as `\ Local persona shape:` and `{\* Schedule grid` — which read as
syntax errors that could not possibly build. The files were fine. **`Read` shows the real
bytes; do not diagnose source from Grep's rendering.** The tell: mangled lines are the ones
whose path prefix is relative (`src\lib\store.js`) rather than absolute.

### 4. Carried forward, unchanged

`Measure-Object -Line` misses blank lines · a truncated result is not a negative result · check
what a measurement measured for a PASS *and* a FAIL · a tool is not evidence until proven ·
assert your scanner found something · a frozen clock makes any `Date.now()`-derived id
non-unique · an assertion whose expected state is already the default proves nothing · a node
script a test imports must guard side effects behind a run-as-main check · `checkVisibility()`
not `offsetParent` · **a negative result needs a positive control in the same run** · **before
you hide or narrow anything a user can also CREATE or EDIT, find that path and check it.**

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
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. ⚠️ **Session 21 qualified this** — see §0b#2. A test can pin a defect. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `docs/history/**` — including `HANDOFF-ARCHIVE.md` | **RECORDS, not pointers.** |
| 6 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it.** Session 17
found I10 ranked top 39 commits after it shipped. Session 20 found the top-ranked item real,
well-argued, and empty. **Session 21 is the third variant: an item recorded as DONE that was
half-done**, and the record was written in good faith by the session that did the other half.

---

## 1. What session 21 shipped — `6a51107` → `ce96f91`, one commit

**`class_instances.class_type` now has one vocabulary.** It is what N2's cohort analytics group
by, it is append-only, and nothing recovers it after the fact.

| Door | Offered a coach | Wrote before | Writes now |
|---|---|---|---|
| Builder → Runner | `crossfit … hyrox` (keys) | `"hiit"` ✅ (fixed session 20) | `"hiit"` |
| Schedule publish | `HIIT, Strength, … Mobility` | `"HIIT"`, `"Mobility"` | `"hiit"`, `"Mobility"` |
| CSV backfill | — | the old system's column, verbatim | resolved where it maps |

### 1a. It cost more than analytics, and that half is the product finding

The Schedule's eight capitalised strings came from `CAT_COLOR`, a hand-maintained map that was
**also the only class types a gym could schedule**. So a gym running **CrossFit, Pilates or
Bootcamp could not put one on its own schedule**, and a **gym-authored type (DEC-16) was
invisible there** — the exact "appears in one modal and nowhere else" failure DEC-16 was decided
to prevent. `CAT_COLOR` duplicated colour data the catalogue already holds and **had already
drifted** (Hyrox `#22D3A6` vs `#F59E0B`).

### 1b. What landed

| Piece | Where | State |
|---|---|---|
| `resolveClassType(raw, lib)` | `src/lib/libraryStore.js` | ✅ key→key, legacy label→key, **unrecognised→verbatim**. 12 unit tests. |
| The Schedule's catalogue | `src/screens/CalendarScreen.jsx` | ✅ `CAT_COLOR` deleted; dropdown, colours, grid labels all from `getLibrary()` |
| Legacy heal | `CalendarScreen` | ✅ **on READ**, not a mount-time migration (`mountWrites.spec.js`) |
| The third door | `store.applyAttendanceImport(analysis, lib)` + `RosterScreen` | ✅ 2 unit tests incl. a no-catalogue control |
| Grid tint guard | `CalendarScreen` | ✅ hex-only check — see §7 |

### The design decisions worth not re-litigating

- **`"Mobility"` is deliberately NOT mapped.** The old dropdown offered it; no catalogue type
  answers to it. Mapping it to a near-neighbour would invent programming the gym never chose,
  invisibly. It keeps its own text — same reasoning `retention.js` gives for `INACTIVE_STATUSES`.
- 🔴 **An unrecognised type stays SELECTABLE in the edit dialog.** A `<select>` whose value
  matches no option renders on its **first** option, so a coach opening the dialog to fix a
  *coach's name* would have saved the class as CrossFit with nothing on screen saying so.
  Proven by mutation: `Received: "crossfit"`. This is session 20's §0b#2 arriving from the
  other direction — **narrowing a set of options is hiding, and the edit path is the creation
  path.**
- **Healed on read, not migrated.** The stored rule keeps its old text until next edited; the
  grid and the publish path both see the key regardless.
- **The timing was free and will not be again.** No gym is live (A12/A13 undone), so there are
  **zero production rows** carrying the old vocabulary. Had this been found after the pilot it
  would have been a data migration on an append-only table.

### 1c. Two things that turned out NOT to be defects — do not re-investigate

- **`class_instances` has a fourth writer, `startScheduledClass`, and it is fine.** It delegates
  to `publishOccurrences` rather than mapping its own row ("one mapper from occurrence to row"),
  so it inherited the fix.
- **§4.5's "member CSV import ↔ the status model" premise was wrong.** `csvImport.js` is an
  **attendance** importer. It has no status column and no member-status concept at all — it
  creates members as a side effect with `status: "active"`, which is the right default. There is
  no round-trip to lose. **Item closed.**
- **`members`' three writers agree on `status`.** `addMember` and `applyAttendanceImport` both
  write `"active"`. Their `joinedAt` differs (today vs `""`) and that is **deliberate and
  already documented** in `store.test.js` — an importer does not know when someone joined.

---

## 2. 🔬 The method — unchanged, still the highest-yield thing here

1. **Ask the generic question, not the enumerated one.** Session 21: "does this value survive
   the journey from the screen to storage?" beat any list of screens.
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI and read back the STORED object.** 🔴 This caught session 21's *own half-fix*:
   the grid was showing the healed value while `publishOccurrences` still received the raw rules
   — **visually correct, wrong in storage**, which is the shape of all three of the last
   sessions' defects.
4. **Prove a tool before trusting it**, and **prove a test can fail** — then check the mutation
   was not a no-op (§0b#1).
5. **A negative result needs a positive control in the same run.**
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. **Still never executed — three sessions running.** |
| **P2** | **Capacitor wrap** | 🟡 Unblocked in principle; **wait until A13 proves a real member opens a real link.** |
| **F6** | Per-gym privacy/consent page | ⛔ Unbuilt. N4 collects nothing, so no consent record is owed — but the moment anything member-identifying is added this becomes a blocker. `recordConsent` still has zero callers and **that is still correct**. |

**Outcome tier, none started:** **N2** cohort analytics (waiting on attendance volume, which
waits on the pilot — **its grouping column is now genuinely consistent, §1**), **N3-LLM**
win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q** (needs a
migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy LLM
fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`; the token half EXISTS).

**Deliberately unbuilt — do not "fix" these:** consent notice surface · Templates · Glossary ·
Discover · Integrations · attendee b64 share · **Music / Auto-DJ** (cut, quarantined in
`src/music/`, **do not undo the `FLAGS.music` gates** — each is load-bearing for ~12.7 KB) ·
member data on the summary page.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural
**Empty.** Fifth session running. App.jsx is 3,382 lines.

### 4.2 Bundle / performance
`I9` leftovers are all **weak**: `BrandStudioScreen` (needs a shared module for `PRESET_SKINS`),
`LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves), `AdminTeamScreen`.
**Measure before splitting**; `build-sw` precaches every emitted chunk, so a chunk nothing
fetches costs every install. Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB
(`storage-js` 22 KB unused — **Dylan said leave it**) · `src/data/library.js` 58 KB.

📏 Production shape last measured session 19 at `777492d`: a **member** downloads **206.69 KB**,
staff 782.71 KB. Quote absolutes, never percentages. ⚠️ The credential-less local build and the
prod-shaped build disagree on `index` (204.50 vs 198.29 KB) — both real, never compare across.
**Session 21 left `index` byte-identical**; the member path was not touched.

### 4.3 Sync / data plumbing
**I14** hydrate pagination (do at first paying gym) · **I8** server-side media proxy (the
RapidAPI key field is the last client-side third-party access) · `sync_incidents` telemetry
(post-pilot) · **`class_summaries` is NOT in the sync path, deliberately** — publishing is an
act, not a side effect.

### 4.4 Tooling and hygiene
| # | Item |
|---|---|
| **`deadctl` blind spots** | Cannot evaluate `FLAGS.*` gating, **lacks an inert-ancestor check**, and has **no `<details>` awareness**. Over-reporting is the right direction, but **every hit needs a reachability check**. |
| **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if stale. |
| **Docs** | ✅ Root is 6 `.md`; `docs/` 13; `docs/history/` 18. **Keep `SESSION-HANDOFF.md` to two session blocks** — move the third into `HANDOFF-ARCHIVE.md` as you add yours. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| 🔴 **A gym-authored class type, scheduled and STARTED** | **The highest-yield item now, and session 21 created it.** See §10.1. |
| 🔴 **Read back the STORED row after every UI write** | Still the standing method. The named candidate never driven: **what Brand Studio writes to `jungle_custom_skin`**. (`MemberLinkDialog`'s payload is unit-tested but unreachable end-to-end by construction — A12.) |
| **The Builder's modals under a gym-authored class type** | Empty movement pools — `LibraryBrowserModal`'s add-exercise and per-movement panels. Now reachable from a second direction. |
| **Re-run the scanners after session 21's change** | `a11yScan.js` over the Schedule's **new** dropdown, its conditional legacy `<option>`, and the relabelled grid cells. Cheap, and §1a's rule says this is where naming defects actually come from. |
| **N4's Edge Functions** | ⛔ Not reachable locally, by construction. `DYLAN-QUEUE.md` A12/A13. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). `DYLAN-QUEUE.md` A11. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands,
expected output, failure modes and undo steps. **Part B is EMPTY.** Read it and ask what has
moved. **Confirmed at the top of session 21: A12 and A13 are both still undone.**

- 🔴 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min.
  **Until this is done, N4 is code nobody has run. Three sessions now.**
- 🔴 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. **Still the one item that gets dramatically more expensive with
  time**, and it is a five-minute read-only check.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** (the wedge feature, never once run against a real corpus) · **A11 the seven live checks**.

---

## 6. What the crash gate still cannot see

`react/jsx-no-undef` catches `<Foo/>` where `Foo` is undefined. Two things it does **not** catch:

1. **A screen that is ABSENT rather than undefined.** `src/lib/navRoutes.test.js` guards this
   half. **Drive the real UI and assert the coach LANDED**, by a control only the destination has.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error
   boundary is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`.**

⚠️ **`ClassSummary` is deliberately NOT in `SCREENS`** — not a nav destination, renders outside
`App`, has its own spec. Adding it would break every sweep because `nav()` cannot reach it.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error.
Same for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 21:**

- 🔴 **A mutation that changes nothing proves nothing.** §0b#1.
- 🔴 **A passing test can encode the defect.** §0b#2.
- **`Grep` on Windows normalises `//` → `\` in its output.** §0b#3. Confirm with `Read`.
- **The Schedule grid tints a cell by appending 8-bit hex alpha** (`${c}18`, `${c}40`), so the
  value MUST be 6-digit hex. `var(--accent)18` is not a colour — the cell silently loses its
  background **and** its border. This now matters because gym-authored types
  (`makeClassType` → `color: "var(--accent)"`) can finally be scheduled. Guarded by a regex in
  `typeColor`; **any new colour source needs the same check.**
- **`class_instances.class_type` takes a type KEY. THREE doors write it** (Runner, Schedule
  publish, CSV import) and a fourth delegates (`startScheduledClass`). Anything that writes a
  display string there breaks N2's cohort grouping permanently.
- **Appending to a UTF-8 source file with PowerShell `Out-File -Append -Encoding utf8` is
  safe** (it does not read the file back) — but it writes **CRLF**, so git warns on commit.
  Harmless; git normalises. **`Get-Content`/`Set-Content` round-trips are still forbidden.**

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write
  a new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.** Mutate a
  VALUE, not a control-flow branch — `if (false && x) y;` inside a `for...of` breaks esbuild.
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js`.
- **A hook cannot be called from inside `{cond && …}`.** Six components exist for this reason.
- **`page.clock.setFixedTime` freezes `Date.now()`.** Advance it between actions whose identity
  you need to distinguish.
- **Changing only the URL fragment is a same-document navigation.** In Playwright, open a member
  link via `about:blank` then `goto`; an explicit `page.reload()` RACES the app's own reload.
- **A test that reads a computed style must call `waitForApp(page)` first** — the app is a lazy
  chunk. Assertions on *elements* auto-wait and are unaffected.
- **Chromium logs its own "Failed to load resource" for every non-2xx** — filter exactly that
  rather than dropping `expectNoConsoleErrors`.
- **Reaching for `window` inside a lib function makes unit failures unreadable.** Inject the origin.
- **`getLibrary()` is read per render, deliberately.** Do not "optimise" it into a `useMemo([])`.
  `CalendarScreen` now depends on this: a coach adding a class type sees it on the Schedule.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called
  while it is open.** Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright
  AUTO-DISMISSES**, so a test that ignores the dialog silently exercises the *cancel* path and
  still passes.
- **`toContainText` reads `textContent` and ignores `text-transform`.** The Schedule's grid
  chips are `uppercase`; match case-insensitively.
- **A phone gets the bottom bar** (`Run` / `Build` / `Members` / `Brand` / `More`, inside
  `page.locator("nav").first()`). `nav()` is desktop-only.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures:** `page.clock.setFixedTime` before `freshApp`, or build every
  instant relative to now.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** PowerShell's
  console also *displays* mojibake for UTF-8 — that is the terminal, not the file. Verify with
  `node -e` counting `�`.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **PowerShell tore apart a `node -e` one-liner containing quotes.** Write a `.mjs` and run it.
  ⚠️ **A `.mjs` in the scratchpad cannot resolve the repo's `node_modules`** — put it in the
  repo, run it, delete it.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Wake and act in the SAME test.
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.**
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **A `Buffer` reference in a test file fails `lint:crash`.** Use string length or `TextEncoder`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`, wrapping snippets in an IIFE. **For a real screenshot, drive Playwright
  directly** (session 21 shot the Schedule grid across five class-type cases that way).
  PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e
  has 5191/5192, and `playwright test` starts and reuses its own server on 5191.
  **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `curl`/`Invoke-WebRequest`.
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4**. Omit the flag.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are
  an advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — rebuild them, they are cheap

All use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at
the repo's `package.json`. **Anchor slices on declaration NAMES, not line numbers.**

1. **`outline <file>`** — every top-level declaration with its line span.
2. **`scan <file> <Decl,…>`** — what imports the moved code needs, which same-file declarations
   it leans on, which of those the rest of the file still uses (⇒ shared module, not a move).
   **Run it transitively.**
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report
   unused UPPERCASE imports. **End it with a `scanned N/M` line and exit non-zero on zero.**
5. **`deadctl <file…>`** — dead controls, passive-only, fake affordances, unused props. §4.4 for
   blind spots.
6. **`handlers`** — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed by
   event type.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an
accurate reading of what a file depends on.
⚠️ **Beware a local declaration that shadows an import** — `FloorLiveScreen`'s own `fmt`.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 759 unit (27 files, no todos) · 245 e2e (28 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~339.17 KB · PersonasScreen ~91.04 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less). CI runs the same chain on Linux;
the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 22

1. 🔴 **Drive a gym-authored class type through the door session 21 just opened.** This is the
   top item and it exists *because of* the last commit. Before `ce96f91` a gym-authored type
   could not be put on the Schedule at all; now it can — and `makeClassType` gives one
   `subTypes: { general: { warmup: [], main: [], cooldown: [] } }`, i.e. **empty movement
   pools**. The Schedule also has a **Start** button (`isStartable` → `startScheduledClass`).
   So the path *schedule a gym-authored type → press Start → run a class whose pools are empty
   → check somebody in* is **brand new and has never been driven once**. Read back
   `jungle_class_instances` and `jungle_attendance` at the end of it. If the Runner renders an
   empty class badly, that is a coach standing in front of a room.
2. **Then the Builder's modals under that same empty-pool type** (§4.5) — same state, second
   surface, and now reachable from two directions.
3. **Re-run the a11y scanners over the Schedule's changed surfaces** (§4.5). Cheap, and §1a's
   rule is that this is where naming defects actually come from — the dropdown, the conditional
   legacy `<option>`, and the relabelled grid cells are all new markup.
4. **Then Brand Studio → `jungle_custom_skin`** — the last named read-back candidate never driven.
5. **Ask Dylan about A12/A13 first, before any of the above.** If A12 is done, verifying N4
   against the real functions displaces everything here: it is the only part of the product that
   is untested *by construction*, and it has been waiting three sessions.
6. **Do not re-run the eight-screen a11y sweep as a headline item.** Done and clean.
7. **Do not start N2/N3.** They wait on attendance volume → the pilot → `DYLAN-QUEUE.md` Part A.
8. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link.
9. **Keep `SESSION-HANDOFF.md` to two session blocks.** Move session 20's into
   `docs/history/HANDOFF-ARCHIVE.md` as you add yours. A minute if you do it every time.
