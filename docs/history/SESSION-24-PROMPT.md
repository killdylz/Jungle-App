# Jungle — Session 24 Build Prompt

Keep building. Session 22 inverted §4.5's method into **read back the SCREEN after every stored
write**. Session 23 took that to the two biggest untested surfaces in the product and it paid
twice — both times a correct write and a wrong read, both surviving a reload. The
generalisation is now settled and worth stating once:

> **A key with more than one READER drifts exactly like a column with more than one writer.**

The class type had **three** readers. Renaming it in the plan editor moved one and orphaned two.

And while writing *this* file, driving one more surface turned up a third kind, which is what
session 24 opens on:

> **A write can be correct, visible, persisted, reload-proof — and silently undone later by an
> action that has nothing to do with it.**

Delete a movement from a coach's catalogue. It goes, from screen and storage, and stays gone
through a reload. Then add a note to a **different** movement, and the deleted one is back.

**Last commit is `742e68b`**, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 772 unit (28 files, no todos) · 297 e2e (31 spec files, no fixme) ·
build 204.50 KB index + 340.35 KB StaffApp + 91.44 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,513 lines** (+20).

This file supersedes `SESSION-23-PROMPT.md`, now in `docs/history/`.

**Do not re-raise:** N4 (built), the eight-screen a11y sweep, the crash gate's JSX blind spot,
the AST `jsx` script, docs hygiene, I10, DEC-12, DEC-13, I6, "useSpotify ~2.5 KB", `SLOT_LABELS`,
`eslint-plugin-react`, the `class_type` vocabulary (closed s21), "member CSV import ↔ the status
model" (premise wrong, closed s21), the Dashboard's `CLASS_COLORS`, the Start→Builder class type,
the Brand Studio custom-skin application, Browse Library's initial class, the Library's
empty-pool states, the CSV backfill, the import→retention join (all closed s22), and
**everything in §1 below** — the class-type rename, Smart Recommendation's preset promise, the
AST scripts, `ctOf`'s duplication, `src/test_probe.txt`, the archive ordering, and the
catalogue RENAME path (**checked and correct**, §1d).

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–23.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the
  live one. It has been wrong in three of the last four sessions.
- New shared surfaces after session 23:
  - **`src/lib/personaAggregate.js`** now exports **`classTypeOf`** and **`renameClassType`**.
    `ctOf` is **deleted** from `PersonasScreen.jsx` — it was a byte-identical copy, which is the
    exact drift this module exists to prevent. If a document says the screen has its own, it
    predates `3faa22f`.
  - **`scripts/ast.mjs`** + **`npm run ast`** — five subcommands, §8. It is new, so nothing in
    the repo depends on it yet and you can change its output freely.
  - `PersonasScreen`'s `savePlanEdit` now commits **personas before plans**, deliberately.
- **`.gitignore` ignores `~$*`** (Word lock files). **Check `git status --short` before every
  `git add -A` anyway.**
- Root is **6 `.md`**; `docs/` holds 13; `docs/history/` holds **20**. Sessions 6–**21** of the
  handoff are in `docs/history/HANDOFF-ARCHIVE.md`, **newest-first** — session 23 fixed the
  ordering session 21 broke. Keep it that way.

---

## 🔴 0b. Measurement traps

Sessions 16–22's all carry forward. Session 23 added four.

### 1. 🔴 `getByText` AND `textContent` DISAGREE ABOUT `text-transform`

Playwright's text engine matches **rendered** text, so `getByText("S360 — CLASS SHAPE")` finds a
heading whose markup is `{classType} — class shape` under `textTransform:"uppercase"`. A raw
`locator.textContent()` on the same element returns **`S360 — class shape`**.

A probe that located with one and asserted with the other reported a heading as **missing** that
was on screen the whole time. §7 already said `toContainText` ignores `text-transform`; this is
the sharper form — **the two APIs disagree with each other**, so never locate with one and
assert with the other.

### 2. 🔴 A DELETE THAT STICKS, AND THEN DOES NOT

New in kind. Sessions 21–23 chased wrong reads of correct writes. This is a **correct write that
something else reverts**, and it passes every check you would think to run: the row leaves the
screen, leaves `localStorage`, and is still gone after a reload.

**Verified repro** (§10.2): load the sample coach → delete `Farmer Carry` from the catalogue →
reload, still gone → open **`Kettlebell Swing`**, type a note, Save → `Farmer Carry` is back on
screen and in storage.

**So: after asserting a write landed, do something ELSE and look again.** A test that ends at
"it persisted" cannot see this.

### 3. Your own probe's selectors are part of the measurement

`page.getByPlaceholder("Movement")` matches **substrings**, so it also caught the catalogue's
`Filter 11 movements — name, alias, equipment or kind` box, returning 12 fields where the plan
had 11. The index of the field I wanted happened to still line up, so the probe passed — **by
luck, not by correctness.** Print the values you matched, not just the count.

### 4. Overlapping path arguments double-count

`node scripts/ast.mjs deadctl src src/App.jsx` scanned and reported the same file twice, which
reads as two findings where there is one. Fixed in the tool; the lesson generalises to every
glob you hand a script.

### 5. Carried forward, unchanged

Your own output filter is a tool and it lies (a `Select-String` dropped a control's JSON body
under its summary line) · **a stale FIXTURE hides a defect exactly like a wrong assertion, and
looks fine** · a coincidence can mask a defect — pick the field that cannot agree by chance
(session 23: the accent agreed, the **font** did not) · fixing a defect can arm the one
underneath it · a mutation that changes nothing proves nothing · a passing test can encode the
defect · `Grep` on Windows path-normalises `//` into `\` in its output · `Measure-Object -Line`
misses blank lines · a tool is not evidence until proven · **a negative result needs a positive
control in the same run** · a frozen clock makes any `Date.now()`-derived id non-unique · an
assertion whose expected state is already the default proves nothing · `checkVisibility()` not
`offsetParent` · before you hide or narrow anything a user can also CREATE or EDIT, find that
path and check it.

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
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. ⚠️ **Qualified three times** — s21: a test can pin a defect. s22: a stale FIXTURE exercises nothing. **s23: a test that stops at "it persisted" cannot see a write reverted later** (§0b#2). |
| 2 | **`SESSION-HANDOFF.md` top block + this file** | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `docs/history/**` — including `HANDOFF-ARCHIVE.md` | **RECORDS, not pointers.** |
| 6 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it.** s17 found
I10 ranked top 39 commits after it shipped. s20 found the top item real and empty. s21 found an
item recorded DONE that was half-done. s22 found a bundle chore hiding a product defect.
**Session 23 is the fifth variant, and the cheapest to avoid: two defects were drafted into the
s23 prompt from reading handlers WITHOUT reading the markup thirty lines below, and both were
false.** Reading the code that renders is not optional. The third claim in that same section —
that the panel had no test — was true, and driving it found a real defect the prompt had not
predicted.

🔴 **The same thing happened twice while writing THIS file, in the other direction — claimed
GAPS that were already covered.** A first draft said the D3 cold-start path and the Personas
generate flow were untested. Both were wrong: `coldstart.spec.js:142` drives cold start and
asserts `bp.source === "preset"`, and `presets.spec.js` drives `Generate draft` and reads
`jungle_persona_generations` back in three separate tests. Both were caught by grepping `e2e/`
for the feature before writing the claim down, which takes about fifteen seconds.

**So: `grep -rn "<the feature>" e2e/ src/**/*.test.js` before you write "untested" ANYWHERE, and
before you believe it here.** A prompt that sends a session to re-cover covered ground costs the
whole session, and this document has now produced that error in both directions.

---

## 1. What session 23 shipped — `69966f9` → `742e68b`, four commits

### 1a. 🔴 A renamed class type left its shape and profile behind — `3faa22f`

§10.2's item: the Personas screen, 91 KB, the most stored shapes in the product, and only ever
swept for accessible names and raw values. Nothing had driven an edit and read back what it
stored.

Driving `PersonaPlanEditor` found storage **flawless** — every nested field round-tripped,
including ones the editor never shows (`scheme.reps`, `plan.note`, block `rotation`,
`per_side`). The screen was not.

**A class type has no id. Its NAME is its key, in three places at once:**

| Reader | Key |
|---|---|
| every plan | `plan.classType` |
| the shape the coach saved | `styleProfile.blueprints[ct]` |
| what extraction learned | `styleProfile.byClassType[ct]` |

The editor rewrote only the first. Correcting `"S360"` → `"S360 Strength"` gave a coach a ghost
tab **`S360 · 0`** holding their own saved shape, their conventions and vocabulary **gone** from
the profile, and the shape demoted from *"Your shape — saved"* back to *"suggested from
corpus"*. All three storage keys were individually correct throughout, which is exactly why
nothing in the suite could see it.

This is the ordinary path, not a corner: the class type on an imported plan is the **importer's
guess**, and correcting it is what the field is for. Those conventions cost an LLM pass over a
real deck — **the wedge feature** — and a typo-fix dropped them on the floor.

`renameClassType` distinguishes a **rename** from a **move**: the profile travels only when the
rename empties the old name out. If other plans still sit under it, the coach re-filed one plan
between two class types and both keep their own identity. A destination that already has its
own shape is never clobbered.

### 1b. 🔴 Smart Recommendation promised what a palette cannot carry — `1887295`

§10.3's item, and **not** either phantom that section warned about. A recommendation is a
**palette**: eight colour tokens from `generateSkinFromPalette`. The note read *"Applied to the
swatches below (based on the Atelier preset)"*, and the archetype blurbs promise things only a
**skin** carries.

| Archetype | Its own note promises | What arrived, after a reload |
|---|---|---|
| Luxury / Reformer | "a **serif display face**" | `--display: Space Grotesk` |
| HYROX / Functional | "**tabular numerals and accent glow**" | `--num: normal`, `--glow: none` |

The accent arrived correctly in both cases — which is why any reasonable spot-check passes.
That is §0b#3's "pick the field that cannot agree by chance", applied to the **font** instead of
the colour.

Fonts, glow and numeral style live on the skin, in `applySkinCSS`'s `meta`. That is the split
§1c settled last session: **an override is a palette on top of the skin the gym chose.** So the
note now **offers** the preset instead of claiming it, and taking it layers the recommended
palette over the preset's own — what `resolveSkinTokens` was built for.

### 1c. The AST scripts — `e5b3bbb`

§8, two sessions overdue. `scripts/ast.mjs`, `npm run ast`. Details in §8; the results:

| Report | Result |
|---|---|
| `dead` | **0 findings across `src`'s 100 files** (the run showed 101/101 because a control file was in the tree). The control caught an unused import **and a shadowed one**, and correctly ignored the used one. |
| `deadctl` | 100/100 files, 5 hits, **0 real.** Four `FLAGS.mockAnalytics`-gated; the fifth was Brand Studio's white-label preview inside `<div inert>`. |
| `handlers` | 351 across 100 files — `onClick` 263, `onChange` 52, `onKeyDown` 10, the drag quartet 3 each. |

§4.4 listed deadctl's inert-ancestor and `<details>` holes; the first real run fired one of
each, so both are closed. **`FLAGS` gating is still beyond it** — see §10.4, which is now cheap.

### 1d. The rest — `742e68b`

| | |
|---|---|
| Docs | Session 21's block moved into `HANDOFF-ARCHIVE.md` **above** session 20 — newest-first, which s21 got wrong. Archive retitled 6–21. Done with a guarded one-shot that refuses to run twice and prints its own result. |
| `src/test_probe.txt` | **Deleted.** Tracked since 2026-07-02, nothing imported it, zero bytes. Confirmed unreferenced first. |
| Catalogue RENAME | **Checked and correct.** Renaming `Conventional Deadlift` → `Deadlift` records the old name as an alias, preserves the count (`{S360:1}`) and equipment, creates no duplicate row, and correctly leaves the PLAN saying `Conventional Deadlift` — that is what aliases are for. **Not every look finds a defect.** |
| A recommendation does not repaint before Save | Exactly as its copy says. Now asserted, so it stays true. |

### Design decisions worth not re-litigating

- **Rename vs move.** A class-type rename carries the profile only when it empties the old name
  out. Re-filing one plan among several is a MOVE and must not steal the other's identity.
- **The recommendation states, it does not apply.** Same reason as the Builder's scheduled-type
  notice: silently restyling a gym throws away typography they picked.
- **`deadctl` over-reports on purpose.** Over-reporting is the right direction for a tool nobody
  runs in CI. Every hit needs a reachability check by hand.

---

## 2. 🔬 The method — now three-directional

1. **Ask the generic question, not the enumerated one.**
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI and read back the STORED object.** (Sessions 19–21.)
4. **Then read back the SCREEN.** (Session 22–23. A key with more than one READER drifts.)
5. 🔴 **Then do something else and look again.** (Session 23's new one.) A write can be correct,
   visible, persisted and reload-proof, and still be reverted by an unrelated later action.
   **A test that ends at "it persisted" cannot see this.**
6. **Prove a tool before trusting it** — including your own output filter and your own selectors
   — and **prove a test can fail**, then check the mutation was not a no-op.
7. **A negative result needs a positive control in the same run.**
8. An honest blank beats a confident wrong guess. **And not every look finds a defect — saying
   so is a result** (§1d, the catalogue rename).

---

## 3. 🟦 FEATURES STILL TO BUILD

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. **Still never executed — FIVE sessions running.** |
| **P2** | **Capacitor wrap** | 🟡 Unblocked in principle; **wait until A13 proves a real member opens a real link.** |
| **F6** | Per-gym privacy/consent page | ⛔ Unbuilt. N4 collects nothing, so no consent record is owed — the moment anything member-identifying is added this becomes a blocker. `recordConsent` still has zero callers and **that is still correct**. |

**Outcome tier, none started:** **N2** cohort analytics (waiting on attendance volume → the
pilot), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy
LLM fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`; the token half EXISTS).

**Deliberately unbuilt — do not "fix" these:** consent notice surface · Templates · Glossary ·
Discover · Integrations · attendee b64 share · **Music / Auto-DJ** (cut, quarantined in
`src/music/`, **do not undo the `FLAGS.music` gates** — each is load-bearing for ~12.7 KB) ·
member data on the summary page.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural
**Empty.** Seventh session running. App.jsx is 3,513 lines (+20, all of it `savePlanEdit`'s
rename handling and the recommendation note).

### 4.2 Bundle / performance
`I9` leftovers. **`BrandStudioScreen` now has a concrete answer** rather than a guess —
`npm run ast scan src/App.jsx BrandStudioScreen` reports it needs 6 import sources and leans on
exactly **three** same-file declarations (`GYM_ARCHETYPES`, `ProgramChip`, `recommendArchetype`),
of which **zero** are used by the rest of the file. So it moves as a self-contained unit of four
declarations with **no shared module required** — verified independently by grep, not taken on
the tool's word. `LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves) and
`AdminTeamScreen` remain. **Measure before splitting**; `build-sw` precaches every emitted chunk,
so a chunk nothing fetches costs every install. Fixed costs: `react-dom` 177 KB ·
`@supabase/*` ~198 KB (`storage-js` 22 KB unused — **Dylan said leave it**) ·
`src/data/library.js` 58 KB.

📏 Production shape last measured session 19 at `777492d`: a **member** downloads **206.69 KB**,
staff 782.71 KB. Quote absolutes, never percentages. ⚠️ The credential-less local build and the
prod-shaped build disagree on `index` (204.50 vs 198.29 KB) — both real, never compare across.
**Session 23 left `index` byte-identical across all four commits**; the member path was not
touched.

### 4.3 Sync / data plumbing
**I14** hydrate pagination (do at first paying gym) · **I8** server-side media proxy (the
RapidAPI key field is the last client-side third-party access) · `sync_incidents` telemetry
(post-pilot) · **`class_summaries` is NOT in the sync path, deliberately** — publishing is an
act, not a side effect.

### 4.4 Tooling and hygiene
| # | Item |
|---|---|
| ~~The AST scripts~~ | ✅ **BUILT session 23.** `scripts/ast.mjs`, `npm run ast`. §8. |
| 🔴 **`deadctl` cannot evaluate `FLAGS.*`** | **The one remaining blind spot, and now the cheap one.** Four of its five hits were `FLAGS.mockAnalytics`-gated code that folds to `[]`. `src/config/flags.js` is a module-level const of **literals**, so the script can read it and resolve `FLAGS.x ? […] : []` for real. §10.4. |
| **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if stale. |
| **Docs** | ✅ Root 6 `.md`; `docs/` 13; `docs/history/` 20. **Keep `SESSION-HANDOFF.md` to two session blocks** — move the third into `HANDOFF-ARCHIVE.md` **in newest-first order**. Session 23 did this correctly; copy its guarded-one-shot approach (§7). |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| 🔴 **The movement catalogue's WRITE paths** | **The highest-yield item now, and one defect is already verified** (§10.2). `revealed.spec.js` OPENS the movement editor to check accessible names and **never saves**. Nothing drives `changeMovement` or `deleteMovement` and reads back. Delete is broken; the rename path is correct (§1d); the equipment/category/alias/notes save is unchecked. |
| 🔴 **The generation LEDGER's edges** | ⚠️ **The generate flow itself is well covered** — `presets.spec.js` drives `Generate draft`, lands classes in the Builder, and reads `jungle_persona_generations` back in three tests. **Do not re-raise it.** Three edges are genuinely uncovered: (a) **`Reopen` has zero coverage** — no spec mentions it, and it hands `builderClass` derived from the CURRENT class type rather than the one the generation was created under; (b) the **50-per-persona `GEN_CAP`** in `appendPersonaGeneration` — no test generates enough to reach it; (c) repeat-avoidance across **successive** generations at the UI level (the arithmetic is unit-tested in `blueprints.test.js`, the two-generations-in-a-row path is not). |
| **Cold start (D3) — the INTERACTION, not the path** | ⚠️ **The path itself is covered** — `coldstart.spec.js` drives "no coaches at all → a named class shape" and asserts the blueprint stores `source: "preset"`. Do not re-raise that. What is untested is that `startClassTypeFromPreset` writes `blueprints[name]`, **the same key §1a just proved has three readers**: a coach who names a class type at cold start and later retypes that name in the plan editor exercises §1a's rename against a preset-sourced shape, which nothing covers. |
| **Slides import** | Unreachable locally (`slidesEnabled` false). Say so rather than claiming coverage. `DYLAN-QUEUE.md` A7. |
| **N4's Edge Functions** | ⛔ Not reachable locally, by construction. `DYLAN-QUEUE.md` A12/A13. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). `DYLAN-QUEUE.md` A11. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands,
expected output, failure modes and undo steps. **Part B is EMPTY.** Read it and ask what has
moved. **Confirmed at the top of session 23: A12, A13 and A1 are all still undone.**

- 🔴 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min.
  **Until this is done, N4 is code nobody has run. FIVE sessions now.**
- 🔴 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person. Since s22's skin fix the member page finally renders in the gym's own
  palette, so the question *"does it look like your studio?"* is answerable — and since s23's
  recommendation fix, a gym that got its palette from the Smart Recommendation is carrying the
  colours it was actually promised.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. **Still the one item that gets dramatically more expensive with
  time**, and it is a five-minute read-only check.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** (the wedge feature, never once run against a real corpus — and §1a is exactly the
  kind of damage a real import's guessed class-type names would have caused) · **A11 the seven
  live checks**.

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

**New in session 23:**

- 🔴 **`getByText` and `textContent` disagree about `text-transform`.** §0b#1. Never locate with
  one and assert with the other.
- 🔴 **A persisted, reload-proof write can still be reverted later.** §0b#2.
- **`getByPlaceholder` matches substrings.** It caught a filter box alongside the fields I
  wanted. Print what you matched.
- **`aggregateMovements` re-derives the catalogue from the plans on EVERY recompute**, and
  `changeMovement`, `commitPlans` and the backfill effect all call it. A row is kept across
  re-derivation only if it looks manually edited (`aliases`, `equip`, `meta` keys, `glossaryRef`)
  — note that a DERIVED `equip` counts, so most rows are "manual". There is **no tombstone**,
  which is why a delete does not survive (§10.2).
- **A `styleProfile` sub-key is addressed by the class type's NAME.** Anything that writes a
  class type must consider `blueprints[ct]` and `byClassType[ct]` (§1a).

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write
  a new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.** Mutate a
  VALUE, not a control-flow branch. ⚠️ **A mutation left in the tree is a live defect** — check
  `git diff` before you stop. A good mutation also DISCRIMINATES: session 23's rename mutation
  failed the rename test while the *move* test stayed green, which is what proved the pair.
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js`.
- **A hook cannot be called from inside `{cond && …}`.** Six components exist for this reason.
- **`page.clock.setFixedTime` freezes `Date.now()`.** Advance it between actions whose identity
  you need to distinguish. It **survives `page.reload()`**.
- **Changing only the URL fragment is a same-document navigation.** In Playwright, open a member
  link via `about:blank` then `goto`; an explicit `page.reload()` RACES the app's own reload.
- **A test that reads a computed style must call `waitForApp(page)` first** — the app is a lazy
  chunk. Assertions on *elements* auto-wait and are unaffected.
- **A branding assertion means nothing without a reload.** `:root` still carries the previous
  paint's custom properties.
- **`applySkinCSS(tokens, meta)` writes `--display`/`--body`/`--glow`/`--num` ONLY when `meta`
  has them.** Pass a real skin object, never `PRESET_SKINS[id] || {}`.
- **`resolveSkinTokens(activeSkinId, customSkinTokens)` is the single answer to "what palette is
  this gym running".**
- **A gym-authored type's colour is `var(--accent)`.** Fine used neat; **fatal where 8-bit hex
  alpha is appended** (`${c}18`). Any new colour source needs `typeColor`'s hex guard.
- **`class_instances.class_type` takes a type KEY. THREE doors write it**, all driven end to end.
- **Chromium logs its own "Failed to load resource" for every non-2xx** — filter exactly that.
- **Reaching for `window` inside a lib function makes unit failures unreadable.** Inject the origin.
- **`getLibrary()` is read per render, deliberately.** Do not "optimise" into `useMemo([])`.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called
  while it is open.** Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright
  AUTO-DISMISSES**, so a test that ignores the dialog exercises *cancel* and still passes.
- **`innerText` returns "" for content inside some scroll containers.** Use `textContent` to
  extract, `innerText` to assert what a human sees — but see §0b#1 first.
- **A phone gets the bottom bar** (`Run`/`Build`/`Members`/`Brand`/`More`). `nav()` is desktop-only.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** For doc
  surgery write a one-shot `.mjs` in the repo with explicit `readFileSync(f,"utf8")` /
  `writeFileSync`, **guards that refuse to run twice**, print the result in the same run, then
  delete it. Session 23's `docs-surgery.mjs` is the worked example — it also counted U+FFFD
  (the replacement character) in its own output to prove no mojibake. ⚠️ Write that check as a
  `String.fromCharCode(0xFFFD)` lookup, **never as a literal in the file** — pasting the
  character in as prose makes the document fail its own scan, which is how this very paragraph
  first scored 1. `Out-File -Append -Encoding utf8` is safe but writes CRLF.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **PowerShell tore apart a `node -e` one-liner containing quotes.** Write a `.mjs` and run it.
  ⚠️ **A `.mjs` in the scratchpad cannot resolve the repo's `node_modules`** — put it in the repo.
- **A `Buffer` reference in a test file fails `lint:crash`.** For a file-upload fixture point
  `setInputFiles` at a real path in `public/` — `public/icon-512.png` is what brandStudio uses.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Wake and act in the SAME test.
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.**
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`, wrapping snippets in an IIFE. **For a real screenshot, drive Playwright
  directly.** PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e
  has 5191/5192, and `playwright test` starts and reuses its own server on 5191 —
  **`--workers=1` when a probe prints a lot.** **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `Invoke-RestMethod`
  (`api.github.com/repos/killdylz/Jungle-App/actions/runs?per_page=5` for CI status).
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4**. Omit the flag.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are
  an advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — BUILT, `scripts/ast.mjs`

```bash
npm run ast outline  src/lib/skins.js
npm run ast scan     src/App.jsx BrandStudioScreen
npm run ast dead     src
npm run ast deadctl  src
npm run ast handlers src
```

Babel is resolved through the repo's own `package.json` (it is transitive, not a direct
dependency). **Every report ends with `scanned N/M · K findings` and exits non-zero when it
scanned nothing** — zero findings is a pass, zero files is a broken invocation, and this repo
has read one as the other.

1. **`outline`** — top-level declarations with line spans. **Anchor slices on NAMES, not line
   numbers**; the spans move the moment anything above them changes.
2. **`scan <file> <Decl,…>`** — imports the closure needs, same-file declarations it leans on
   (transitively), and **which of those the rest of the file still uses** — the answer to
   "move it, or make it a shared module?". §4.2 has the `BrandStudioScreen` result.
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead`** — imported bindings never used. Uses babel's **binding resolution**, not a name
   sweep, which buys the two things `varsIgnorePattern: '^[A-Z_]'` gives up: a JSX element name
   counts as a reference (usually the ONLY use a PascalCase import gets), and **shadowing
   resolves for free** — `FloorLiveScreen`'s own `fmt` is the live case. Currently **0 findings
   across 101 files**, proven with a control.
5. **`deadctl`** — `<button>`/`<a>` with no handler, href or spread. Suppresses hits under an
   `inert` or `<form>` ancestor, annotates `<details>`. 🔴 **Still cannot evaluate `FLAGS.*`** —
   §10.4.
6. **`handlers`** — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an
accurate reading of what a file depends on.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 772 unit (28 files, no todos) · 297 e2e (31 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~340.35 KB · PersonasScreen ~91.44 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less). CI runs the same chain on Linux;
the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 24

1. **Ask Dylan about A12/A13 and A1 first.** Five sessions. If A12 is done, verifying N4 against
   the real functions displaces everything below — it is the only part of the product untested
   *by construction*.

2. 🔴 **The catalogue delete that does not stick.** Already verified, repro in §0b#2, and it is
   small. `deleteMovement` removes the row; the next `recompute` — triggered by editing **any
   other movement**, or any plan change — re-derives the catalogue from the plans and brings it
   straight back. There is no tombstone.

   **This one has a genuine product question, so decide it deliberately rather than reaching for
   the first fix.** Two honest answers:
   - **A tombstone** (`meta.deleted`, respected by `aggregateMovements`) makes the button mean
     what it says. But a movement that is still IN a plan and absent from the catalogue is its
     own kind of lie, and the catalogue's whole promise is that it reflects the corpus.
   - **Change the affordance**: the movement is in N plans, so say so — "in 1 plan; remove it
     there to drop it from the catalogue" — and drop the delete for rows with occurrences,
     keeping it only for the zero-count manual rows where it already works.

   The second is smaller and more honest, and matches this repo's standing preference for
   stating over silently applying. **Check the zero-count case before you assume**: a row with
   `classTypes: {}` has no occurrences to resurrect it, so delete may already work there — that
   is the control that tells you which fix you are actually writing.

3. 🔴 **The generation ledger's three uncovered edges.** ⚠️ **Read §4.5 before starting: the
   generate flow itself is well covered by `presets.spec.js` and is NOT the item.** These three
   are:
   - **`Reopen`** — zero coverage, no spec mentions it. It hands `builderClass` derived from the
     CURRENT class type, not the one the generation was created under. `recentGens` is filtered
     by `curCT` so they *should* agree — **check that they do**, because §1a was exactly this
     shape, and now check it against a class type that was RENAMED after the generation was
     recorded, where `g.classType` is the old string.
   - the **50-per-persona `GEN_CAP`** — `appendPersonaGeneration` filters with a running
     counter. Drive past it rather than trusting the arithmetic; seeding the ledger directly in
     `localStorage` is the cheap way in.
   - **two generations in a row.** The ledger feeds `movements: blockMovementNames(blocks)` back
     as "what has already been recommended", so a wrong write quietly degrades every later
     draft. The arithmetic is unit-tested; the UI path is not.

   The LLM branch is unreachable locally (`supabaseEnabled` false) — **say so** rather than
   claiming both were covered.

4. **Teach `deadctl` the `FLAGS` literals.** Cheap now, and four of five hits were that.
   `src/config/flags.js` is a module-level const of literal booleans, so parse it once and
   resolve `FLAGS.x ? […] : []`. Keep the tool over-reporting everywhere else. **Give it a
   control that proves the new gating logic can still report a live control** — a flag-gated
   fixture AND an ungated one in the same run.

5. **Consider `BrandStudioScreen` out of App.jsx (I9).** §4.2 has the concrete answer: four
   declarations, nothing shared back. **Measure first** — `build-sw` precaches every emitted
   chunk, so a chunk nothing fetches costs every install, and this screen is not on the member
   path.

6. **Do not re-run** the eight-screen a11y sweep, the empty-pool Library check, the CSV backfill,
   the class-type rename, or the recommendation panel as headline items. Done, clean, covered by
   tests that fail when reverted.

7. **Do not start N2/N3.** They wait on attendance volume → the pilot → `DYLAN-QUEUE.md` Part A.

8. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link.

9. **Keep `SESSION-HANDOFF.md` to two session blocks.** Move session 22's into
   `docs/history/HANDOFF-ARCHIVE.md` **above session 21** — newest first. Session 23 did this
   correctly with a guarded one-shot; copy that approach rather than editing by hand.
