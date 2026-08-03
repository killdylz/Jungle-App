# Jungle — Session Handoff

_Last updated: 2026-08-03 (session 24)_

> 📁 **Sessions 6–22 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 24 — a delete that never worked, a day that was not a day, and a fourth reader

> **Gates green.** `lint:crash` **0** · **784 unit** (28 files, no todos) · **303 e2e**
> (31 spec files, no fixmes) · five-chunk build: index **204.50 KB** (byte-identical — the
> member path is untouched) + StaffApp **340.34 KB** + PersonasScreen **91.46 KB** +
> ClassSummary **5.81 KB** + summaryApi **0.85 KB**. App.jsx **3,513 lines** (unchanged).
>
> **A12/A13/A1 confirmed still not done** — asked before any work, per §10.1. N4 is still code
> nobody has run: **sixth session running**, and nothing below depended on it.

### The method

Session 23's rule — *do something ELSE and look again* — found the catalogue delete exactly
where §10.2 predicted. The session's other two findings came from a move worth naming
separately, because it is what turned a bug report into a design decision:

> **Ask whether the affordance can EVER work, not whether it worked this time.**

The prompt described the delete as a write that gets reverted. It was worse than that, and the
difference decided the fix: the list is filtered to rows with at least one occurrence, so
*every* row the button appeared on was guaranteed to be re-derived. There was no case where it
worked. The one case where deleting holds — a zero-occurrence row — is never rendered at all.
A repair was not available; only removal or reinterpretation.

The same question applied to a number: not "is this 44 or 45 today" but "what question is this
arithmetic answering". It was answering *how many whole 24-hour periods have elapsed*, which
nobody was asking.

### 🔴 1. A delete button that never once worked — `b018f6d`

§10.2's item, and the repro held. Delete `Farmer Carry`: gone from screen, gone from
`localStorage`, still gone after a reload. Edit a note on `Kettlebell Swing`, and it is back
in both.

`aggregateMovements` re-derives the catalogue from the plans on every recompute, and any
movement save or plan edit triggers one. There is no tombstone. **But `ctMoves` filters to
`(m.classTypes?.[curCT] || 0) > 0`**, which is what makes this unfixable as drawn — a seeded
zero-count row rendered no row and no delete button, while the control row rendered both.

**The product question, decided rather than patched.** A tombstone would make the button honest
and the LIST dishonest: the catalogue would stop saying what the corpus contains — its entire
promise — while the movement stayed visible in the plan editor. That is the same two-readers
drift as the class-type rename, bought deliberately. So the button is gone, and the list states
where membership comes from: *"a movement leaves this list by leaving the plans that use it."*
`store.deletePersonaMovement` went with it; its only caller was that button.

⚠️ **§10.2's suggested control was wrong**, and checking it is what produced the better fix.
The prompt said to check the zero-count case because "delete may already work there". It does —
and it is unreachable, so keeping a conditional for it would have shipped dead UI.

### 🔴 2. "Days ago" counted 24-hour periods where an owner counts dates — `6ff99c7`

**Two e2e tests in `csvImport.spec.js` were failing on a CLEAN tree at `5854d93`** — the
session-24 prompt's "297 e2e" did not record it. They were not stale. They had always been
**time-of-day flaky**, and session 23 happened to run them in the evening.

The importer anchors a date-only CSV value at **noon UTC**. `daysBetween` floored the raw
millisecond gap, so an imported Jun 19 read against Aug 3 — 45 days on any calendar — came out
as **44** for every run before 20:00 SGT. The same floor told a coach that a member who trained
yesterday evening was last in **"0 days ago"**.

That number is not incidental: the panel's design is that every flag **carries the arithmetic
that produced it so an owner can argue with it**, and this was the one number in the sentence
that was wrong. "Days ago" now counts **local calendar days** — floor both instants to local
midnight, difference those, and **round** rather than floor because a DST transition leaves the
span 23 or 25 hours short of a whole multiple.

**Consequence, stated rather than discovered later: the 14-day absence rule now fires on the
calendar day it crosses, up to a day earlier than before.**

⚠️ **None of the 772 existing unit tests moved.** Their fixtures are whole-day offsets from a
noon-UTC anchor, so both definitions agree on every one — **which is exactly why the defect
survived: the arithmetic was only ever tested at the one time of day where both answers match.**

🔴 And `winback.spec.js` had written the off-by-one down next to the right answer. It advances
the clock twenty days, comments *"Twenty days pass and he stops again"*, and asserted **19**.
Neither was ever questioned. **A test can encode a defect in its prose and its assertion at the
same time and still look like documentation.**

### 🔴 3. The class type had a FOURTH reader — `aa0e96f`

Session 23 found three readers of a class type's name and moved all three. There were four.
Every generation-ledger row carries `classType`, and `recentGens` selects on
`g.classType === curCT`, so a rename does not mis-file those rows — it makes them
**unreachable**.

| | ledger | "Recently generated" | Reopen |
|---|---|---|---|
| before rename | `S360` | visible | 1 |
| after `S360` → `S360 Strength` | still `S360` | **gone** | **0** |

Two things break at once and **only one is visible**. The coach loses their history and every
way back into a class they were handed. The quiet half: that same list is what
`presetDraftOpts` receives as `recent` — the record of what has already been recommended.
Steered away from an empty list, the next draft can hand back the class it produced last time.
**No error, no blank panel, just a generator that has silently stopped varying.**

`renameClassTypeInGenerations` carries the rows, scoped to one persona. The rename-vs-move
rule now lives in **one `isMove` helper both functions call** — a second copy of a shared rule
is how the fourth reader came to be missed. The generation's TITLE is deliberately not
rewritten: it records what the coach was handed.

**Also closed from §10.3:** `Reopen` had zero coverage and now has three assertions that
matter — it lands the RECORDED plan (same block count) under the right Builder class, it does
**not** append a second ledger row (reopening is a read; a write would pollute repeat-avoidance
with classes the coach never re-ran), and it survives a rename. `GEN_CAP` had no test; 55
generations now go in, and the assertion that earns its keep is that the cap counts **per
persona**, so a busy coach cannot evict a quiet one's history.

### Design decisions worth not re-litigating

- **The catalogue states membership, it does not offer deletion.** Same reason as the Smart
  Recommendation and the Builder's scheduled-type notice: stating beats silently applying.
- **"Days ago" is a calendar count.** The datum is a date; the reader is a human with a calendar.
- **A rename carries the ledger; a MOVE does not.** Identical rule to the style profile, and it
  is now literally the same function call.
- **Reopen is a read.** It must never append to the ledger.

### What is left, honestly

- **§10.4 — teach `deadctl` the `FLAGS` literals. NOT DONE.** Still the one blind spot, still
  cheap: `src/config/flags.js` is a module-level const of literal booleans.
- **§10.5 — `BrandStudioScreen` out of App.jsx (I9). NOT STARTED.** §4.2 still has the concrete
  answer: four declarations, nothing shared back. **Measure before splitting.**
- **The orphaned catalogue row.** A movement the coach EDITED and then removed from every plan
  is retained in storage with its counts zeroed — correct, so their edits are never lost — but
  `ctMoves` renders only rows with occurrences, so it is invisible and unreachable forever.
  Pinned by a test so a future cleanup cannot delete it silently. Surfacing those rows is the
  one thing that would give a delete button a real home.

---

## Session 23 — a value with two readers drifts, and the class type had three

> **Gates green.** `lint:crash` **0** · **772 unit** (28 files, no todos) · **297 e2e**
> (31 spec files, no fixmes) · five-chunk build: index **204.50 KB** (byte-identical — the
> member path is untouched) + StaffApp **340.35 KB** (+0.37) + PersonasScreen **91.44 KB**
> (+0.40) + ClassSummary **5.81 KB** + summaryApi **0.85 KB**. App.jsx **3,513 lines** (+20).
>
> **A12/A13/A1 confirmed still not done** — asked before any work, per §10.1. N4 is still code
> nobody has run: **fifth session running**, and nothing below depends on it.

### The method

Session 22's rule — *read back the SCREEN after every stored write* — carried forward and paid
twice. Both findings were correct writes and wrong reads, both survived a reload, and neither
was reachable by any test that only checks storage.

The generalisation is worth keeping: **a key with more than one READER drifts exactly like a
column with more than one writer, and it is harder to notice because nothing is corrupted.**
The class type turned out to have three readers.

### 🔴 1. A renamed class type left its shape and profile behind — `3faa22f`

§10.2's item: the Personas screen, 91 KB and the most stored shapes in the product, had only
ever been swept for accessible names and raw values. Nothing had driven an edit and read back
what it stored.

Driving `PersonaPlanEditor` found that storage was flawless — every nested field round-tripped
(`scheme.reps`, `plan.note`, block `rotation`, `per_side`). The screen was not.

**A class type has no id. Its NAME is its key, in three places at once:**

| Reader | Key |
|---|---|
| every plan | `plan.classType` |
| the shape the coach saved | `styleProfile.blueprints[ct]` |
| what extraction learned | `styleProfile.byClassType[ct]` |

The plan editor lets a coach retype that name and rewrote only the first. After correcting
"S360" to "S360 Strength", a coach saw a ghost tab `S360 · 0` holding their own saved shape,
their conventions and vocabulary gone from the profile, and the shape demoted from *"Your shape
— saved"* back to *"suggested from corpus"*. All three storage keys were individually correct
the whole time.

This is the ordinary path, not a corner: the class type on an imported plan is the importer's
guess, and correcting it is what the field is for. Those conventions cost an LLM pass over a
real deck — **the wedge feature** — and a typo-fix dropped them on the floor.

`renameClassType` in `personaAggregate.js` now owns it, and distinguishes a **rename** from a
**move**: the profile travels only when the rename empties the old name out. If other plans
still sit under it the coach re-filed one plan between two class types, and both keep their own
identity. A destination that already has its own shape is never clobbered.

`ctOf` in PersonasScreen was a byte-identical copy of `classTypeOf` — two readers of the very
question this defect is about. Deleted.

### 🔴 2. Smart Recommendation promised what a palette cannot carry — `1887295`

§10.3's item, and it was not the phantom the prompt warned about. A recommendation is a
**palette**: eight colour tokens. The note read *"Applied to the swatches below (based on the
Atelier preset)"*, and the archetype blurbs promise things only a **skin** carries.

| Archetype | Its note promises | What arrived, after a reload |
|---|---|---|
| Luxury / Reformer | "a serif display face" | `--display: Space Grotesk` |
| HYROX / Functional | "tabular numerals and accent glow" | `--num: normal`, `--glow: none` |

The accent arrived correctly in both cases — which is why a spot-check would have passed.
§0b#3's rule about picking the field that cannot agree by chance, applied to the font.

Fonts, glow and numeral style live on the skin, in `applySkinCSS`'s meta. That is the split
§1c settled: **an override is a palette on top of the skin the gym chose.** So the note now
OFFERS the preset instead of claiming it, and taking it layers the recommended palette over the
preset's own — what `resolveSkinTokens` was built for. Stated, not applied, for §1a's reason:
silently restyling a gym would throw away typography they picked.

### 3. The AST scripts, rebuilt — `e5b3bbb`

§8/§10.4, two sessions overdue. `scripts/ast.mjs`, five subcommands (`outline`, `scan`,
`dead`, `deadctl`, `handlers`), babel resolved through the repo's own `package.json`.

`dead` uses babel's **binding resolution** rather than a name sweep, which buys the two things
`varsIgnorePattern: '^[A-Z_]'` gives up: a JSX element name counts as a reference, and
shadowing resolves for free.

**Every result carries a positive control in the same run.**

| Report | Result |
|---|---|
| `dead` | 101/101 files, **0 findings in real source**. Control caught an unused import *and* a shadowed one, ignored the used one. |
| `deadctl` | 100/100 files, 5 hits, **0 real**. Four `FLAGS.mockAnalytics`-gated; the fifth was Brand Studio's preview inside `<div inert>`. |
| `handlers` | 351 across 100 files — onClick 263, onChange 52, onKeyDown 10. |

§4.4 listed deadctl's inert-ancestor and `<details>` holes and the first run fired one of each,
so both are closed: an `inert` or `<form>` ancestor suppresses the hit. **`FLAGS` gating is
still beyond it** and every hit says so.

`scan`'s answer for `BrandStudioScreen` (3 same-file deps — `GYM_ARCHETYPES`, `ProgramChip`,
`recommendArchetype`; **0 shared** with the rest of the file, so it moves as a unit with no
shared module) was verified independently by grep before being believed.

### What did NOT find anything — saying so is a result

- **The plan editor's storage.** Every field round-tripped, including the nested ones the
  editor never shows. Only the readers were wrong.
- **A recommendation does not repaint before Save**, exactly as its copy says. Asserted, so it
  stays true.
- **Zero dead imports across 101 files**, with a control proving the scanner was live.

### Carried into the next session

1. 🔴 **A12/A13 — five sessions.** Still the only part of the product untested by construction.
2. **`deadctl` cannot evaluate `FLAGS.*`.** Four of its five hits were that. Worth teaching it
   the flag constants, since they are literals in one module.
3. **The remaining I9 items now have a real answer**: `BrandStudioScreen` moves cleanly out of
   App.jsx as a unit of four declarations. Measure before doing it — `build-sw` precaches every
   emitted chunk.
4. **`src/test_probe.txt` is gone**, swept in passing as §4.4 asked.

---
