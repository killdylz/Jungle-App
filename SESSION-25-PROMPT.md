# Jungle — Session 25 Build Prompt

Keep building. Session 23 settled that **a key with more than one READER drifts like a column
with more than one writer**, and found three readers of the class type. Session 24 found the
**fourth** — the generation ledger — and two other defects that were not reader-drift at all.
The generalisation this session adds is smaller and sharper:

> **Ask whether the affordance can EVER work, not whether it worked this time.**

The movement catalogue's delete button was described as a write that gets reverted. It was
worse: the list is filtered to rows with at least one occurrence, so **every row the button
appeared on was guaranteed to be re-derived.** There was no case where it worked. That is not a
bug to repair — it is a button to remove, and knowing which took one probe.

The same question applied to a number. Not *"is this 44 or 45 today"* but *"what question is
this arithmetic answering."* It was answering **how many whole 24-hour periods have elapsed**,
which nobody was asking.

**Last commit is `e7c0613`**, tree clean, **pushed**, **CI green**. Gates:
**`lint:crash` 0 · 784 unit (28 files, no todos) · 303 e2e (31 spec files, no fixme) ·
build 204.50 KB index + 340.34 KB StaffApp + 91.46 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,513 lines** (unchanged).

This file supersedes `SESSION-24-PROMPT.md`, now in `docs/history/`.

**Do not re-raise:** N4 (built), the eight-screen a11y sweep, the crash gate's JSX blind spot,
the AST `jsx` script, docs hygiene, I10, DEC-12, DEC-13, I6, "useSpotify ~2.5 KB", `SLOT_LABELS`,
`eslint-plugin-react`, the `class_type` vocabulary, "member CSV import ↔ the status model"
(premise wrong), the Dashboard's `CLASS_COLORS`, the Start→Builder class type, the Brand Studio
custom-skin application, Browse Library's initial class, the Library's empty-pool states, the
CSV backfill, the import→retention join, the class-type rename, Smart Recommendation's preset
promise, the AST scripts, `ctOf`'s duplication, `src/test_probe.txt`, the archive ordering, the
catalogue RENAME path (correct), **and everything in §1 below** — the catalogue delete, the
retention day count, the ledger's fourth reader, `Reopen`, and `GEN_CAP`.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–24.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the
  live one.
- New shared surfaces after session 24:
  - **`src/lib/personaAggregate.js`** now also exports **`renameClassTypeInGenerations`**, and
    the rename-vs-move test lives in **one private `isMove` helper both rename functions call**.
    If you add a fifth thing keyed by class-type name, it calls `isMove` too — do not write a
    third copy of that rule.
  - **`src/lib/retention.js`'s `daysBetween` counts LOCAL CALENDAR DAYS**, not elapsed
    milliseconds. Anything comparing it against a hand-computed ms difference will be wrong.
  - **`store.deletePersonaMovement` is DELETED**, and a comment stands where it was explaining
    why. Do not reintroduce it without reading §1a.
- **`.gitignore` ignores `~$*`. Check `git status --short` before every `git add -A` anyway.**
- Root is **6 `.md`**; `docs/` holds 13; `docs/history/` holds **21**. Sessions 6–**22** of the
  handoff are in `docs/history/HANDOFF-ARCHIVE.md`, **newest-first**. Keep it that way.

---

## 🔴 0b. Measurement traps

Sessions 16–23's all carry forward. Session 24 added six, and the first is the expensive one.

### 1. 🔴 CI WAS RED AND THE PROMPT SAID GREEN

`5854d93` — the session-24 prompt commit, docs only — **failed CI**, and the prompt it
introduced claimed "297 e2e". Nobody had looked. Two `csvImport.spec.js` tests had been failing
for some time.

**So: check CI before you believe a gate line.** One call, no local run needed:

```bash
curl -s "https://api.github.com/repos/killdylz/Jungle-App/actions/runs?per_page=3"
```

### 2. 🔴 A TEST THAT PASSES OR FAILS BY WHAT TIME OF DAY YOU RUN IT

Those two tests were not stale fixtures. They built dates with `daysAgo(n)` off the live clock,
and the app anchored a date-only import at **noon UTC**, so the floored elapsed gap came out one
short for every run before 20:00 SGT. Session 23 ran them in the evening and saw green.

**A fixture built from `Date.now()` is not automatically deterministic.** If the code under test
floors, rounds or buckets a duration, the answer depends on the hour you ran it.

### 3. 🔴 A TEST CAN ENCODE THE DEFECT IN ITS PROSE *AND* ITS ASSERTION

`winback.spec.js` advances its clock twenty days, comments **"Twenty days pass and he stops
again"**, and asserted **19**. The right answer was sitting in the comment above the wrong one
and neither was ever questioned. **When a test's narrative and its number disagree, the number
is not automatically the truth.**

### 4. `beforeEach` is scoped to its `describe`

Four new `store.test.js` cases first reported **51 rows for a two-row expectation**, because
`beforeEach(() => localStorage.clear())` lives inside a different `describe` block. **Your own
probe's setup is part of the measurement** — the same lesson as session 23's selectors, one
layer up.

### 5. `getByText(...).textContent()` did not just disagree — it hung

Session 23 found the two APIs disagree about `text-transform`. Chaining them timed out a probe
at 30s and closed the page, which reads like an app failure and is not. Locate and assert with
the same engine, or `expect(...).toBeVisible()` on the rendered string.

### 6. Carried forward, unchanged

Your own output filter is a tool and it lies · **a stale FIXTURE hides a defect and looks
fine** · a coincidence can mask a defect — pick the field that cannot agree by chance · fixing a
defect can arm the one underneath it (session 24: the calendar fix immediately failed
`winback`) · a mutation that changes nothing proves nothing · **a passing test can encode the
defect** · `Grep` on Windows path-normalises `//` into `\` in its output · `Measure-Object
-Line` misses blank lines · a tool is not evidence until proven · **a negative result needs a
positive control in the same run** · a frozen clock makes any `Date.now()`-derived id
non-unique · an assertion whose expected state is already the default proves nothing ·
`checkVisibility()` not `offsetParent` · before you hide or narrow anything a user can also
CREATE or EDIT, find that path and check it.

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
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. ⚠️ **Qualified four times** — s21: a test can pin a defect. s22: a stale FIXTURE exercises nothing. s23: a test that stops at "it persisted" cannot see a write reverted later. **s24: a test can be green only because of the hour you ran it, and can state the right answer in prose while asserting the wrong one.** |
| 2 | **`SESSION-HANDOFF.md` top block + this file** | Written against the code at the end of the session that changed it. ⚠️ **And the gate line can still be stale — check CI (§0b#1).** |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `docs/history/**` — including `HANDOFF-ARCHIVE.md` | **RECORDS, not pointers.** |
| 6 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it.** s17 found
I10 ranked top 39 commits after it shipped. s20 found the top item real and empty. s21 found an
item recorded DONE that was half-done. s22 found a bundle chore hiding a product defect. s23's
prompt carried two false defect claims drafted from reading handlers without reading the markup.

🔴 **Session 24 adds the sixth variant, and it is the subtlest: a prompt's SUGGESTED CONTROL was
wrong.** §10.2 said to check the zero-count catalogue row because "delete may already work
there". It does — and the row is **unreachable**, which inverted the fix. Checking the control
is what produced the right answer; believing it would have shipped dead UI.

**So: `grep -rn "<the feature>" e2e/ src/**/*.test.js` before you write "untested" ANYWHERE,
and re-derive a suggested control rather than adopting it.** Session 24 used this and it paid:
"two generations in a row is untested" turned out to be **half wrong** — see §4.5.

---

## 1. What session 24 shipped — `5854d93` → `e7c0613`, four commits

### 1a. 🔴 A delete button that never once worked — `b018f6d`

§10.2's item, and the repro held exactly. Delete `Farmer Carry` from the catalogue: gone from
the screen, gone from `localStorage`, still gone after a reload. Add a note to **`Kettlebell
Swing`** and it is back in both.

`aggregateMovements` re-derives the catalogue from the plans on every recompute, and any
movement save or plan edit triggers one. There is no tombstone. **But `ctMoves` filters to
`(m.classTypes?.[curCT] || 0) > 0`** — so a seeded zero-count row rendered **no row and no
delete button**, while the control row rendered both. Every row the button could reach was
guaranteed to come back.

**The product question, decided rather than patched.** A tombstone would make the button honest
and the LIST dishonest: the catalogue would stop saying what the corpus contains — its entire
promise — while the movement stayed visible in the plan editor. So the button is gone and the
list states where membership comes from: *"a movement leaves this list by leaving the plans that
use it."* `store.deletePersonaMovement` went with it.

Two tests, mutated in opposite directions: re-adding a delete control fails the first and not
the second; loosening `> 0` to `>= 0` fails the second and not the first.

### 1b. 🔴 "Days ago" counted 24-hour periods where an owner counts dates — `6ff99c7`

The importer anchors a date-only CSV value at **noon UTC**; `daysBetween` floored the raw
millisecond gap. An imported Jun 19 read against Aug 3 — **45 days on any calendar** — came out
as **44** before 20:00 SGT. The same floor told a coach that a member who trained yesterday
evening was last in **"0 days ago"**.

The panel's design is that every flag **carries the arithmetic that produced it so an owner can
argue with it**. This was the one number in the sentence that was wrong. It now counts **local
calendar days**, rounding rather than flooring so a DST transition cannot drop one.

**Consequence, stated rather than discovered later: the 14-day absence rule now fires on the
calendar day it crosses, up to a day earlier than before.**

⚠️ **None of the 772 existing unit tests moved.** Their fixtures are whole-day offsets from a
noon-UTC anchor, so both definitions agree on every one — **which is why the defect survived:
the arithmetic was only ever tested at the one time of day where both answers match.**

### 1c. 🔴 The class type had a FOURTH reader — `aa0e96f`

Session 23 moved three. Every generation-ledger row also carries `classType`, and `recentGens`
selects on `g.classType === curCT`, so a rename does not mis-file those rows — it makes them
**unreachable**.

| | ledger | "Recently generated" | Reopen |
|---|---|---|---|
| before rename | `S360` | visible | 1 |
| after `S360` → `S360 Strength` | still `S360` | **gone** | **0** |

Two things break and **only one is visible**. The quiet half: that list is what
`presetDraftOpts` receives as `recent`. Steered away from an empty list, the next draft can hand
back the class it produced last time — **no error, no blank panel, just a generator that has
silently stopped varying.**

`renameClassTypeInGenerations` carries the rows, scoped to one persona. **The rename-vs-move
rule now lives in one `isMove` helper both functions call** — a second copy of a shared rule is
how the fourth reader came to be missed. The generation's TITLE is deliberately not rewritten.

**Also closed:** `Reopen` (three assertions — it lands the RECORDED plan under the right Builder
class, it does **not** append a second ledger row, and it survives a rename) and **`GEN_CAP`**
(55 generations in; the assertion that earns its keep is that the cap counts **per persona**).

### 1d. Docs — `e7c0613`

Handoff back to two blocks (24, 23); session 22 moved into the archive **above** session 21.
Done with a guarded one-shot that refuses to run twice (verified), prints its result, and counts
U+FFFD via `String.fromCharCode` — both files 0.

### Design decisions worth not re-litigating

- **The catalogue states membership, it does not offer deletion.**
- **"Days ago" is a calendar count.** The datum is a date; the reader is a human with a calendar.
- **A rename carries the ledger; a MOVE does not** — literally the same `isMove` call.
- **Reopen is a read.** It must never append to the ledger.

---

## 2. 🔬 The method

1. **Ask the generic question, not the enumerated one.**
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI and read back the STORED object.**
4. **Then read back the SCREEN.** A key with more than one READER drifts.
5. **Then do something else and look again.** A write can be correct, visible, persisted and
   reload-proof, and still be reverted by an unrelated later action.
6. 🔴 **Then ask whether the control could EVER have worked.** (Session 24's.) A repair is not
   always available, and finding that out changes the fix rather than delaying it.
7. **Prove a tool before trusting it** — your output filter, your selectors, **your setup** —
   and **prove a test can fail**, then check the mutation was not a no-op and that it
   DISCRIMINATES.
8. **A negative result needs a positive control in the same run.**
9. An honest blank beats a confident wrong guess. **And not every look finds a defect — saying
   so is a result.**

---

## 3. 🟦 FEATURES STILL TO BUILD

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. **Still never executed — SIX sessions running.** |
| **P2** | **Capacitor wrap** | 🟡 Unblocked in principle; **wait until A13 proves a real member opens a real link.** |
| **F6** | Per-gym privacy/consent page | ⛔ Unbuilt. N4 collects nothing, so no consent record is owed. `recordConsent` still has zero callers and **that is still correct**. |

**Outcome tier, none started:** **N2** cohort analytics (waiting on attendance volume → the
pilot), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy
LLM fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`; the token half EXISTS).

**Deliberately unbuilt — do not "fix" these:** consent notice surface · Templates · Glossary ·
Discover · Integrations · attendee b64 share · **Music / Auto-DJ** (cut, quarantined in
`src/music/`, **do not undo the `FLAGS.music` gates**) · member data on the summary page.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural
**Empty.** Eighth session running. App.jsx is 3,513 lines, unchanged this session.

### 4.2 Bundle / performance
`I9` leftovers. **`BrandStudioScreen` has a concrete answer, still unexecuted** —
`npm run ast scan src/App.jsx BrandStudioScreen` reports 6 import sources and exactly **three**
same-file declarations (`GYM_ARCHETYPES`, `ProgramChip`, `recommendArchetype`), of which **zero**
are used by the rest of the file. It moves as a self-contained unit of four declarations with
**no shared module required** — verified by grep, not taken on the tool's word.
`LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves) and `AdminTeamScreen`
remain. **Measure before splitting**; `build-sw` precaches every emitted chunk, so a chunk
nothing fetches costs every install. Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB
(`storage-js` 22 KB unused — **Dylan said leave it**) · `src/data/library.js` 58 KB.

📏 Production shape last measured session 19 at `777492d`: a **member** downloads **206.69 KB**,
staff 782.71 KB. Quote absolutes, never percentages. ⚠️ The credential-less local build and the
prod-shaped build disagree on `index` (204.50 vs 198.29 KB) — both real, never compare across.
**Session 24 left `index` byte-identical across all four commits**; the member path was untouched.

### 4.3 Sync / data plumbing
**I14** hydrate pagination (do at first paying gym) · **I8** server-side media proxy · 
`sync_incidents` telemetry (post-pilot) · **`class_summaries` is NOT in the sync path,
deliberately** — publishing is an act, not a side effect.

### 4.4 Tooling and hygiene
| # | Item |
|---|---|
| 🔴 **`deadctl` cannot evaluate `FLAGS.*`** | **The one remaining blind spot, and still the cheap one — §10.2.** Verified this session: it reports **4** suspects (`AnalyticsScreen` ×3, `CalendarScreen:581`), and **all four are `FLAGS.mockAnalytics`-gated** — each sits inside `FLAGS.mockAnalytics ? [...] : []`, which folds to `[]`. `src/config/flags.js` is a module-level const of **literal booleans**, so the script can read it and resolve them for real. |
| **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if stale. |
| **Docs** | ✅ Root 6 `.md`; `docs/` 13; `docs/history/` 21. **Keep `SESSION-HANDOFF.md` to two session blocks** — move the third into `HANDOFF-ARCHIVE.md` **newest-first**, with a guarded one-shot (§7). |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| 🔴 **The orphaned catalogue row** | **The most product-shaped item left.** A movement the coach EDITED and then removed from every plan is retained in storage with counts zeroed — correct, so their edits are never lost — but `ctMoves` renders only rows with occurrences, so **it is invisible and unreachable forever**, and it syncs to Postgres. Pinned by a test so a cleanup cannot silently delete it. §10.3. |
| 🔴 **Repeat-avoidance across generations, SAME preset** | ⚠️ **Half of this is already covered and the prompt that said otherwise was wrong.** `presets.spec.js:96` DOES drive two generations in a row and reads both back — but with **different presets** (heavier vs engine), which would differ whether or not the ledger fed back. **The uncovered case is two generations with the SAME preset**, where the second must avoid the first's movements. The arithmetic is unit-tested in `blueprints.test.js`; that specific UI path is not. |
| **Movement editor's remaining save fields** | `changeMovement` is now driven for notes and for the rename-merge path, and delete is gone. The **equipment / category / alias** save is still unchecked end to end. |
| **Cold start (D3) → rename** | `coldstart.spec.js` covers the path and asserts `source: "preset"`. What is untested is that a coach who names a class type at cold start and later retypes it exercises §1c's rename against a **preset-sourced** shape. |
| **Slides import** | Unreachable locally (`slidesEnabled` false). Say so. `DYLAN-QUEUE.md` A7. |
| **N4's Edge Functions · Team admin · Room TV Follow** | ⛔ Not reachable locally, by construction. A11/A12/A13. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list.** **Part B is EMPTY.** Read it and ask what has
moved. **Confirmed at the top of session 24: A12, A13 and A1 are all still undone.**

- 🔴 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min.
  **Until this is done, N4 is code nobody has run. SIX sessions now.**
- 🔴 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. **Still the one item that gets dramatically more expensive with
  time**, and it is a five-minute read-only check.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** · **A11 the seven live checks**.

---

## 6. What the crash gate still cannot see

`react/jsx-no-undef` catches `<Foo/>` where `Foo` is undefined. Two things it does **not** catch:

1. **A screen that is ABSENT rather than undefined.** `src/lib/navRoutes.test.js` guards this
   half. **Drive the real UI and assert the coach LANDED**, by a control only the destination has.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error
   boundary is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`.**

⚠️ **`ClassSummary` is deliberately NOT in `SCREENS`** — not a nav destination, renders outside
`App`, has its own spec.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error.
Same for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 24:**

- 🔴 **`daysBetween` in `retention.js` counts LOCAL CALENDAR DAYS.** Floor to local midnight,
  difference, round. Do not "simplify" it back to an elapsed-ms floor.
- 🔴 **A date-only import is anchored at NOON UTC.** Any arithmetic against it must be
  calendar-based or it is timezone- and time-of-day-dependent.
- 🔴 **`ctMoves` renders only rows with `> 0` occurrences in the current class type.** A
  zero-count row exists in storage and is invisible. Anything you add to that list inherits this.
- **The rename-vs-move rule is `isMove` in `personaAggregate.js`.** Call it; do not re-express it.
- **`beforeEach` is per-`describe`.** `store.test.js` has several; a new block needs its own.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write
  a new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **`aggregateMovements` re-derives the catalogue from the plans on EVERY recompute.** A row is
  kept only if it looks manually edited (`aliases`, `equip`, `meta` keys, `glossaryRef`) — and a
  DERIVED `equip` counts, so most rows are "manual". **There is no tombstone.**
- **A `styleProfile` sub-key and every generation row are addressed by the class type's NAME.**
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.** Mutate a
  VALUE, not a control-flow branch. ⚠️ **A mutation left in the tree is a live defect** — check
  `git diff` before you stop. A good mutation DISCRIMINATES.
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js`.
- **A hook cannot be called from inside `{cond && …}`.** Six components exist for this reason.
- **`page.clock.setFixedTime` freezes `Date.now()`.** It **survives `page.reload()`**.
- **Changing only the URL fragment is a same-document navigation.**
- **A test that reads a computed style must call `waitForApp(page)` first.**
- **A branding assertion means nothing without a reload.**
- **`applySkinCSS(tokens, meta)` writes `--display`/`--body`/`--glow`/`--num` ONLY when `meta`
  has them.** Pass a real skin object, never `PRESET_SKINS[id] || {}`.
- **`resolveSkinTokens(activeSkinId, customSkinTokens)` is the single answer to "what palette is
  this gym running".**
- **A gym-authored type's colour is `var(--accent)`** — fatal where 8-bit hex alpha is appended.
- **`class_instances.class_type` takes a type KEY. THREE doors write it.**
- **Chromium logs its own "Failed to load resource" for every non-2xx** — filter exactly that.
- **`getLibrary()` is read per render, deliberately.** Do not "optimise" into `useMemo([])`.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called
  while it is open.**
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright
  AUTO-DISMISSES**, so a test that ignores the dialog exercises *cancel* and still passes.
- **`getByPlaceholder` matches substrings.** Print what you matched.
- **A phone gets the bottom bar.** `nav()` is desktop-only.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL.**
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** For doc
  surgery write a one-shot `.mjs` **in the repo**, with guards that refuse to run twice, print
  the result, then delete it. ⚠️ Write the U+FFFD check as `String.fromCharCode(0xFFFD)`,
  **never as a literal**.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **PowerShell tore apart a `node -e` one-liner containing quotes.** Write a `.mjs` and run it.
  ⚠️ **A `.mjs` in the scratchpad cannot resolve the repo's `node_modules`** — put it in the repo.
- **A `Buffer` reference in a test file fails `lint:crash`.**
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** ⚠️ `gotoDisplay` starts from the app shell.
- **The browser console buffer persists across reloads AND dev-server restarts.**
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`. **For a real screenshot, drive Playwright directly.** PIN `080921`;
  `sessionStorage jungle_pin_ok=1` skips it. Base path `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port; e2e has 5191/5192, and
  `playwright test` starts and reuses its own server on 5191 — **`--workers=1` when a probe
  prints a lot.** **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `Invoke-RestMethod` or `curl`.
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4**. Omit the flag.
  ⚠️ **`playwright test -g "a|b"` exited 255 in this shell** — run the spec and filter the output.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are
  an advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — `scripts/ast.mjs`

```bash
npm run ast outline  src/lib/skins.js
npm run ast scan     src/App.jsx BrandStudioScreen
npm run ast dead     src
npm run ast deadctl  src
npm run ast handlers src
```

**Every report ends with `scanned N/M · K findings` and exits non-zero when it scanned nothing** —
zero findings is a pass, zero files is a broken invocation.

1. **`outline`** — top-level declarations with line spans. **Anchor slices on NAMES.**
2. **`scan <file> <Decl,…>`** — the answer to "move it, or make it a shared module?".
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead`** — imported bindings never used, via babel's binding resolution. **0 findings.**
5. **`deadctl`** — `<button>`/`<a>` with no handler, href or spread. 🔴 **Still cannot evaluate
   `FLAGS.*`** — §10.2. Currently 4 suspects, **0 real**.
6. **`handlers`** — every `on*` attribute on an intrinsic element, bucketed.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 784 unit (28 files, no todos) · 303 e2e (31 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~340.34 KB · PersonasScreen ~91.46 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less).

⚠️ **CI runs the same chain on Linux and it can be RED while this file says green — check it
(§0b#1).** The Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 25

1. **Ask Dylan about A12/A13 and A1 first.** Six sessions. If A12 is done, verifying N4 against
   the real functions displaces everything below — it is the only part of the product untested
   *by construction*.

2. **Teach `deadctl` the `FLAGS` literals.** Cheap, and verified feasible this session:
   `src/config/flags.js` is a module-level const of literal booleans, and **all four** current
   suspects sit inside `FLAGS.mockAnalytics ? [...] : []`. Parse the flags once and resolve that
   ternary. Keep the tool over-reporting everywhere else. **Give it a control that proves the new
   gating logic can still report a live control** — a flag-gated fixture AND an ungated one in
   the same run, or you have built something that reports nothing and looks clean.

3. 🔴 **The orphaned catalogue row.** Session 24 proved it exists: seed a manual row with
   `classTypes: {}` and it persists through every recompute while rendering nowhere. A movement
   the coach edited and then removed from every plan is in that state permanently, and it syncs.
   **This is the one change that would give a delete button a real home** — surface those rows
   ("no longer in any plan · N") and delete works there, because nothing re-derives them.
   Check the count first: on the sample coach it is zero, so **build the fixture before you
   build the UI**, or you will ship a section nobody can see (§0b, twice over).

4. **Repeat-avoidance with the SAME preset.** ⚠️ Read §4.5 first: two-generations-in-a-row IS
   driven by `presets.spec.js:96`, but with *different* presets, which proves nothing about the
   ledger. Drive **the same preset twice** and assert the second avoids the first's movements.
   The ledger feeds `movements: blockMovementNames(blocks)` back as "what has already been
   recommended", and session 24 showed a broken ledger degrades this **silently**.

5. **Consider `BrandStudioScreen` out of App.jsx (I9).** §4.2 has the concrete answer: four
   declarations, nothing shared back. **Measure first** — `build-sw` precaches every emitted
   chunk, and this screen is not on the member path.

6. **Do not re-run** the eight-screen a11y sweep, the empty-pool Library check, the CSV backfill,
   the class-type rename, the recommendation panel, the catalogue delete, or `Reopen`/`GEN_CAP`
   as headline items. Done, clean, covered by tests that fail when reverted.

7. **Do not start N2/N3.** They wait on attendance volume → the pilot → `DYLAN-QUEUE.md` Part A.

8. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link.

9. **Keep `SESSION-HANDOFF.md` to two session blocks.** Move session 23's into
   `docs/history/HANDOFF-ARCHIVE.md` **above session 22** — newest first, with a guarded
   one-shot.
