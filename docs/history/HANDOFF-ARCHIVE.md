# Jungle — Session Handoff ARCHIVE (sessions 6–23)

_Split out of `SESSION-HANDOFF.md` in session 20, at commit `e81e793`._

**Why this file exists.** `SESSION-HANDOFF.md` had reached **165 KB** — larger than every
source file in the repo except `App.jsx` — and grew 18 KB in a single session. Every session
appended a block and none ever removed one, so the file a new session is told to read first
had become the largest thing it would read, and 90% of it described work shipped months of
sessions ago.

**What moved and what did not.** The live `SESSION-HANDOFF.md` keeps the **two most recent**
session blocks, which is the window a new session actually needs: what just shipped, and what
shipped before it. Everything from session 20 backwards is here, unedited — nothing was
summarised, condensed or dropped, because a handoff block's value is in its specifics and a
summary of a summary is worth nothing.

⚠️ **This is a RECORD, not a live pointer.** Paths, line counts, gate numbers and file
locations in the blocks below were true when written and many are not now — the audit and
strategy docs moved to `docs/` in session 20, for one. Do not follow a path from this file
without checking it still exists. The same caveat the trust ranking puts on
`Jungle - Delta & Backlog Breakdown.md` applies to every line here.

**Where to look instead:** `SESSION-HANDOFF.md` (the last two sessions) · the current
`SESSION-*-PROMPT.md` at repo root · spec §12, which is the backlog of record.

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

## Session 22 — three screens showed a gym something other than what it had saved

> **Gates green.** `lint:crash` **0** · **767 unit** (28 files, no todos) · **291 e2e**
> (31 spec files, no fixmes) · five-chunk build: index **204.50 KB** (byte-identical — the
> member path is untouched) + StaffApp **339.98 KB** (+0.81) + PersonasScreen **91.04 KB** +
> ClassSummary **5.81 KB** + summaryApi **0.85 KB**. App.jsx **3,493 lines** (+111).
>
> **A12/A13 confirmed still not done** at the top of the session — asked before any work, per
> the session-22 prompt §10.5 — so N4 remains code nobody has run and nothing below depends on
> it. **Fourth session running.**

### The method, and what it found

Session 21's rule was *read back the STORED row after every UI write*. Session 22's findings
all came from the inverse: **read back the SCREEN after every stored write.** Three surfaces
were showing a gym something other than what it had saved, and in every case storage was
correct — which is why nothing in the suite could see it.

| # | Where | Stored | Shown |
|---|---|---|---|
| 1 | Builder, after **Start** on the Schedule | `class_type: "gym-barre-…"` ✅ | header, dropdown and plan all say **CrossFit** |
| 2 | Dashboard, "Today's classes" | `type: "gym-barre-ms4pk827"` | `GYM-BARRE-MS4PK827`, and every row the same grey |
| 3 | Brand Studio, **Apply to all surfaces** | the generated palette ✅ | Canopy, on every screen but Brand Studio |

### 🔴 1. Start carried the class's name and not its type

The door session 21 opened — schedule a gym-authored type, press **Start**, run it, check
somebody in — was driven end to end for the first time. The empty movement pools behave: the
skeleton is honest, the toast says "0 exercises loaded", the Live screen runs the timer and
nothing throws.

What it found instead is that `handleStartScheduled` sets `pinnedClass`, `sessionName` and the
view, and **never touches `classChoice`**. So a coach who scheduled Barre and pressed Start got
a Builder whose header read `Barre Flow — 40 min · 5 stages · CrossFit`, whose dropdown said
CrossFit, and whose plan was Back Squat and Burpee Complex. The pinned banner two rows above
said, correctly, "Running Barre Flow from the schedule". Press ▶ Start Session without noticing
and the room gets a CrossFit class.

**Not specific to gym-authored types** — it was true of every class type, and had been since
§3A. It only became FIXABLE in session 21: before `ce96f91` the Schedule's `"HIIT"` was not a
catalogue key and could not have been handed to `classChoice` at all.

**Stated, not applied.** Rebuilding the stages on Start would throw away a plan the coach may
have spent the morning on, at 17:58 with the room filling up — the same confident wrong guess
`handleStartScheduled` already refuses by landing in the Builder instead of the live timer. So
the Class row grows `Scheduled as Barre · [Load Barre]`, routed through the existing
`handleClassChange` so a draft with custom exercises still gets the "replace your stages?"
confirm. It disappears once acted on, and goes with the pin when the coach unpins.

🔴 **The catalogue guard on it is load-bearing, not cosmetic.** Mutating
`scheduledType && LIB[scheduledType]` → `scheduledType` does not produce a dead button — it
produces `TypeError: Cannot read properties of undefined (reading 'label')` and an error
boundary over the whole Builder, for any gym still holding one pre-session-21 `"Mobility"`
rule. `toHaveCount(0)` alone would have passed; the console-error assertion is what catches it.

### 🔴 2. `CLASS_COLORS` was `CAT_COLOR`'s twin, one screen over

Session 21 deleted `CAT_COLOR` from `CalendarScreen`. `App.jsx:199` held the same thing under
another name — eight CAPITALISED display strings to hex — and survived only because nothing in
the file being edited pointed at it.

It had already stopped working. Once the Schedule stored catalogue KEYS, `CLASS_COLORS[uc.type]`
matched nothing, so **every class on every gym's dashboard drew the same grey bar** — and the
type text beside it, added in session 20 precisely so the colour was not the only cue, printed
the stored value raw. `getDayClasses` now reads `getLibrary()` and heals with `resolveClassType`,
by the same rule the Schedule heals on read, so one rule cannot be described two ways by two
screens looking at the same row. A gym-authored type paints its `var(--accent)` neat here —
this row appends no alpha, unlike the grid.

`CLASS_TYPES` (App.jsx:295) went too: a third hardcoded capitalised list, module-local, with no
reader anywhere. 🔴 The linter cannot see it — `eslint.config.js:26` sets
`'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]`, which exempts every
SCREAMING_CASE constant, **every PascalCase component and every `_`-prefixed binding**. That is
the measured size of the hole the `dead` AST script exists to fill.

### 🔴 3. "Apply to all surfaces" applied to none of them

The last of §4.5's named read-back candidates. Two defects stacked, and **both are invisible
without a reload**:

- **`applyGenerated` writes the generated tokens and keeps the skin id `"canopy"`** — on
  purpose, as the BASE. But the App root only honoured overrides when the id was literally
  `"custom"`, while Brand Studio's own swatches merged them over the base. Two answers to one
  question, in two places. So a studio uploaded its logo, pressed the button the label of which
  is *Apply to all surfaces*, and got its identity stored, previewed on the Brand Studio, and
  rendered nowhere. ⚠️ An assertion on the **accent** passes against this — the accent derived
  from Jungle's own icon happens to be Canopy's green. The derived **background** is the
  discriminator.
- **`"custom"` is not a skin.** The Fine-tune panel set the id to it, and
  `PRESET_SKINS["custom"]` is `undefined`, so `applySkinCSS` received `{}` for its `meta` and
  never wrote `--display`, `--body`, `--glow` or `--num`. In-session the previous paint's values
  were still on `:root`, so it looked right — and **a gym on Atelier lost Instrument Serif the
  next time they opened the app.** Pulse lost its glow and its tabular numerals the same way.

**`src/lib/skins.js`** (new, 86 lines) now holds `PRESET_SKINS`, `baseSkin()` and
`resolveSkinTokens()`. The question is not "is the id `custom`", it is "are there override
tokens" — which is the rule the preset highlight (`activeSkinId === p.id && !customSkinTokens`)
had always used. Overrides are a PALETTE on top of the skin the gym chose; the base keeps its
id, its fonts, its voice and its programme tints. `summaryApi.js` had already written the
diagnosis for a different consumer: anything resolving a gym's palette by preset id "silently
downgrades exactly the gyms that cared most about looking like themselves".

🔴 **And fixing it made a latent bug destructive.** The Fine-tune draft re-synced on
`[activeSkinId]` only, so "Apply to all surfaces" never fired it. That was inert while the app
ignored the tokens; the moment the app started wearing them, the screen repainted in the new
identity while the eight swatches below still showed the old one — and a coach who nudged one
and pressed Save would have written the stale draft back over the identity they had just
generated. Dep array fixed, with a test that does **not** reload, because a fresh mount seeds
the draft correctly and reloading is exactly what hides it.

### 4. The Exercise Library under an empty-pool type — mostly right, one thing wrong

§10.2's item, driven. `makeClassType` gives one sub-type with three empty pools, and **no
built-in class type has an empty pool** (walked the whole catalogue — that is the positive
control, and it is why this state had never rendered before DEC-16).

Most of it holds up, and it is now pinned rather than rewritten: browsing says *"No exercises
for this stage yet"*, editing offers the one control that fixes it, and the chip and tab counts
are honest zeroes. **Not every look finds a defect, and saying so is the finding.**

🔴 The one that was wrong: **"Browse Library" from the Builder opened on `classKeys[0]` —
CrossFit — whatever class the coach was building.** One press from adding a movement to a Barre
class, looking at CrossFit's 38. Worst for a gym-authored type, which sorts LAST in a
horizontally-scrolling chip row: the type the gym wrote is the hardest chip to reach from the
one screen where it is the point. `initialClass` now follows the Builder; the nav destination
has no class in hand and still opens on the first, asserted so "follow the Builder" cannot
quietly become "follow nothing".

### 5. …and the defect, generalised into a standing scanner

`e2e/rawValueScan.js` + `e2e/rawValues.spec.js` (14 tests). Four rules over what a human
actually reads: a **UUID**, a **`gym-` catalogue key**, **`snake_case`**, and a **call-site id**
(`custom_1785…`). No user-facing English contains an underscore — which is the giveaway
`labels.js`'s own header names.

It sweeps the nine screens, four revealed panels, **and the member summary page** — with a
payload carrying `classType: "gym-barre-ms4pk827"`, which is what the column actually holds and
what `memberSummary.spec.js`'s own fixture (`"Conditioning"`) cannot express. `ClassSummary`
turns out never to render `classType` at all, so today that page is clean; the test makes it a
**contract** — put the class type on the one page a non-staff person ever sees and you must put
its LABEL there.

🔴 **Why a scanner and not a word list.** `honesty.spec.js` already asserted *"a scheduled class
says its type in words on the Dashboard"* and **passed against this session's defect**: its
fixture seeded `type: "Hyrox"`, the pre-session-21 vocabulary, so the raw stored value happened
to be the human word. The assertion was right; the fixture could not exercise it. §0b#2's rule
about a passing test pinning a defect has a second form — **a passing test whose FIXTURE is
stale tests nothing, and looks identical to one that works.**

Every test carries `proveScannerLive()`, which plants a probe into the page under test, rescans,
and throws unless all four rules fire. A clean page and a scanner that read nothing are the same
observation, and that caught me once this session already (§ method note 6).

### 6. …then the stale fixtures themselves

Grepped every fixture in the repo for the pre-session-21 class-type vocabulary. Most hits are
**deliberate** and carry their own positive control — `schedule.spec.js`'s `seedRules` asserts
`["HIIT","Hyrox","Mobility"]` is what is stored before publishing, and `scheduleEdit.spec.js`
seeds `"Mobility"` precisely to prove an unmappable type survives an edit. Those are the heal
being tested, and they stay.

Two were stale:

- **`honesty.spec.js`** seeded `type: "Hyrox"`. Now `"hyrox"`, and **the test it feeds now
  fails against the defect** — mutating `typeLabel` back reports `element(s) not found`, where
  before it went green. It had been unable to fail for two sessions.
- **`memberSummary.spec.js`** stubbed `classType: "Conditioning"`. Now `"conditioning"`, with a
  note that nothing on that page renders it and `rawValues.spec.js` is what keeps that true.

### 7. The CSV backfill, driven for the first time — and it holds

The THIRD writer of `class_instances.class_type` and the only one whose vocabulary we do not
control. Session 21 gave `applyAttendanceImport` its `lib` parameter and `RosterScreen` passes
`getLibrary()`; `store.test.js` pins the function and **nothing had ever driven the screen**.
`e2e/csvImport.spec.js`, 6 tests.

It holds up completely, and that is the finding: a foreign `"HIIT"` arrives as `hiit`;
`"Mobility"` keeps its own text because no catalogue type answers to it; **a gym that authored
"Barre" absorbs a year of imported "Barre" onto its OWN key rather than beside it** — which is
the entire reason the parameter exists; reading a file writes nothing until the coach presses
Import; a second import of the same file adds nothing and says so; an imported member is
`active` with `joinedAt: ""`, because an importer does not know when somebody joined; and a
file with no date column is refused with the reason and no way to apply it.

Proven by mutation: dropping the `lib` argument — the pre-session-21 behaviour — fails two of
the six with `Expected: "gym-barre-…" / Received: "Barre"`.

This matters more than six tests suggest. It is how a gym's history arrives, it runs **once**,
on a corpus nobody will re-key by hand, and it is what makes N2 possible at all.

### 8. …and the join nobody had made: imported history → who's slipping away

The commercial claim in one journey — *"quietly building the attendance record that shows
who's about to quit."* Both halves were tested and the JOIN was not: `winback.spec.js` seeds
`jungle_attendance` directly, and the import tests stopped at storage. So "does a real gym's
imported history light up the at-risk list" had never been asked, and it is the first thing
that happens at a pilot. Three more tests in `csvImport.spec.js`.

It holds, in all three states a pilot gym meets on day one:

- **A lapse in the imported history is flagged, with its arithmetic.** Import a regular who
  stopped 45 days ago and one still coming: *"1 member needs attention · Larry Tan · Last
  attended 45 days ago, after 3 visits — more than 14 days away"*, and the member who came on
  Tuesday is not on the list.
- 🔴 **Stale history pauses the alerts and says why.** Import a year that ends 40 days ago and
  check nobody in: every member is technically absent, and flagging them all would be the
  confident wrong answer — *the studio stopped recording, the members did not stop coming.*
  The screen says *"absence alerts are paused… they resume once classes are being recorded
  again (last check-in was 40 days ago)"*. An empty panel with no explanation reads as "nobody
  is at risk", which is the opposite of the truth.
- **The new-member rule stays silent on unknown tenure.** An imported member has
  `joinedAt: ""`, so rule 1 can never fire for them. That is correct — inferring a join date
  from the first imported check-in would call a five-year regular a new member — but a pilot
  gym meets it immediately and it looks like a missing feature, so it is now written down.

Proven by mutation: `ABSENCE_DAYS` 14 → 90 fails all three, and the third fails on **its own
control** (`"control: the at-risk panel is working in this very run"`), which is the control
doing exactly the job it was put there for.

### Also done

- **a11y sweep over three surfaces no scan had ever reached** (`revealed.spec.js`): the
  Schedule **with classes on it** — every Edit, Remove and Start control the grid grows from a
  rule, which `screens.spec.js` cannot see because it sweeps an empty week; the **edit** dialog
  and its conditional legacy `<option>`; and the Builder as reached **from** the Schedule.
  All clean — and proven to be scanning, by mutating one `aria-label` away and watching it
  report all three cells.
- **`revealed.spec.js`'s nameless-fields test had no positive control of its own.** It lived
  only in the sibling button test, and two of the openers end without an assertion. Added.
- **Archive order and title fixed.** Session 21 moved session 19's block here correctly but
  APPENDED it below everything, and the archive still called itself "sessions 6–18". Session 19
  now sits under session 20 where the newest-first order says it goes, and the title reads
  6–20. Nothing was edited on the way — the blocks are verbatim.
  ⚠️ I nearly filed this as "session 21 DELETED the block": a heading scan capped at 25 results
  stopped before line 1765 and reported it absent. **A truncated result is not a negative
  result** — the oldest rule in §0b, and it still cost a wrong conclusion mid-session.

### 🔬 Method notes for next session

1. 🔴 **Read back the SCREEN, not only the stored row.** Session 21's rule caught writes;
   these three were all correct writes and wrong reads. A field with more than one READER
   drifts exactly like a column with more than one writer.
2. 🔴 **A coincidence can mask a defect.** The generated accent equalling Canopy's accent is
   why "Apply to all surfaces" survived: any reasonable spot-check picks the accent. Pick the
   field that CANNOT agree by chance.
3. 🔴 **Fixing a defect can arm the one underneath it.** The stale fine-tune draft was harmless
   for as long as the app ignored custom tokens. After the fix it overwrites a gym's identity.
   **After every fix, ask what was inert only because the thing above it was broken.**
4. **A probe that reads the wrong key looks exactly like a clean result.** The first Brand
   Studio probe read `jungle_skin_id`; the key is `jungle_skin`. It reported `null` and would
   have supported a confident wrong finding. Print the key you read.
5. **Reload before believing a branding assertion.** Both Brand Studio defects pass in-session,
   because `:root` still carries the previous paint's custom properties.
6. 🔴 **The tool that lied to me this session was the `Select-String` FILTER, not the scanner.**
   A raw-value sweep reported nine clean screens and its own positive control came back empty —
   which read as a broken scanner. It was not: my grep pattern matched the control's summary
   line and dropped the JSON body under it. **A truncated result is not a negative result**
   applies to your own output filters, not only to tool output. Print one finding per line.
7. **A stale FIXTURE hides a defect exactly like a wrong assertion does, and looks fine.**
   Two specs asserted the right thing about the Dashboard and the member page and neither could
   fail, because both seeded a vocabulary the app stopped writing in session 21. When a stored
   vocabulary changes, **grep the fixtures, not only the assertions.**

---

## Session 21 — the column session 20 called fixed still had two vocabularies

> **Gates green.** `lint:crash` **0** · **759 unit** (27 files, no todos) · **245 e2e**
> (28 spec files, no fixmes) · five-chunk build: index **204.50 KB** (unchanged — the member
> path is untouched) + StaffApp **339.17 KB** + PersonasScreen **91.04 KB** + ClassSummary
> **5.81 KB** + summaryApi **0.85 KB**. App.jsx **not touched**.
>
> **A12/A13 confirmed still not done** at the top of the session, so N4 remains code nobody
> has run and nothing below depends on it.

### 🔴 The finding: `class_instances.class_type` had THREE writers and TWO taxonomies

Session 20 fixed the Runner's half of this column (it was writing `"hiit · amrap"`, a display
string) and recorded that **"both doors now write the same vocabulary."** They did not. The
separator went away; the mismatch did not. Driving both doors in one run and reading the
stored row back:

| Door | Offered a coach | Wrote |
|---|---|---|
| Builder → Runner | `crossfit, spin, circuit, strength, hiit, yoga, boxing, pilates, bootcamp, hyrox` | `"hiit"`, `"gym-barre-…"` |
| Schedule publish | `HIIT, Strength, Hyrox, Circuit, Spin, Yoga, Boxing, Mobility` | `"HIIT"`, `"Mobility"` |
| CSV backfill | — | the old system's own column, verbatim |

So one gym running one class type through two doors wrote `"hiit"` and `"HIIT"`, which no
`group by` reunites, in an append-only table nothing recovers afterwards. **N2's cohort
grouping was still permanently broken.**

🔴 **`e2e/schedule.spec.js` was PINNING the defect** — `expect(burn).toMatchObject({classType:
"HIIT"})` — while `e2e/checkin.spec.js` pinned the lowercase key. Two specs, one column,
contradictory contracts, both green.

### It cost more than analytics, and this is the half a coach actually feels

The Schedule's eight capitalised strings came from `CAT_COLOR`, a hand-maintained map that was
**also the only class types a gym could schedule**. So:

- A gym running **CrossFit, Pilates or Bootcamp could not put one on the schedule at all.**
- A **gym-authored type (DEC-16) was invisible here** — the exact "appears in one modal and
  nowhere else" failure DEC-16 was decided to prevent.
- `CAT_COLOR` was a duplicate of colour data the catalogue already holds, and **had already
  drifted**: Hyrox was `#22D3A6` there and `#F59E0B` in `library.js`.

### What shipped

| | |
|---|---|
| `src/lib/libraryStore.js` | **`resolveClassType(raw, lib)`** — key → key, legacy display string → key (by key then by label), **unrecognised → verbatim**. 12 unit tests. |
| `src/screens/CalendarScreen.jsx` | `CAT_COLOR` **deleted**. Dropdown, colours and grid labels all read `getLibrary()`. Legacy rule types healed **on read** (not migrated on mount — `mountWrites.spec.js`). |
| `src/lib/store.js` | `applyAttendanceImport(analysis, lib)` — the third door. `lib` optional, so no existing caller changes meaning. |
| `src/screens/RosterScreen.jsx` | Passes `getLibrary()` into the import. |
| `e2e/schedule.spec.js` | The `"HIIT"` assertion corrected + 3 new tests. |
| `e2e/scheduleEdit.spec.js` | 3 new tests on the legacy-type pairing below. |

### The decisions worth not re-litigating

- **`"Mobility"` is NOT mapped.** The old dropdown offered it and no catalogue type answers to
  it. Mapping it to a near-neighbour would invent programming the gym never chose, invisibly.
  It keeps its own text — the same reasoning `retention.js` gives for `INACTIVE_STATUSES`.
- 🔴 **An unrecognised type stays SELECTABLE in the edit dialog.** This is session 20's §0b#2
  trap arriving from the other side: a `<select>` whose value matches no option renders on its
  **first** option, so a coach opening the dialog to fix a *coach's name* would have saved the
  class as CrossFit with nothing on screen saying so. Proven by mutation — `Received:
  "crossfit"`. Before you narrow a set of options, check what the edit path does with a value
  that is no longer in it.
- **Healed on READ, not migrated on load.** The stored rule keeps its old text until the coach
  next edits it; both the grid and the publish path see the key regardless.
- **Rules stay in `resolveClassType`'s "raw" fallback rather than being dropped.** A silently
  dropped class type is invisible wrongness.

### Method notes

- 🔴 **The read-back caught my own half-fix.** I normalised the grid's copy of the rules and
  left `occurrencesForWeek(userClasses, …)` reading the raw ones. The grid showed the healed
  value while the stored occurrence still said `"HIIT"` — **visually correct, wrong in
  storage**, which is exactly the shape of both session-20 defects.
- **A mutation that changes nothing proves nothing.** `k.toLowerCase() === want` → `k === want`
  left all 757 tests green, because `want` is already lowercased and every catalogue key is
  lowercase by construction. That is redundant defensive code, not a test gap — but for a
  moment it looked like a hole in the suite. Re-mutated on the value that actually carries the
  behaviour (`want = s.toLowerCase()` → `want = s`) and **9 tests failed for the right reason.**
- **The e2e suite could not have found this**, because a spec was asserting the wrong value.
  A green suite is evidence the code matches the tests, not that the tests match the product.
- 🔴 **`Grep`'s output on Windows path-normalises `//` into `\`.** Comment lines came back as
  `\ Local persona shape:` and `{\* Schedule grid`, which read as syntax errors that could not
  possibly build. `Read` shows the real text. **Do not diagnose source from Grep's rendering.**
- **A recon spec, written and deleted** (`zz-recon-classtype.spec.js`), printed what each door
  wrote plus a positive control. Suite is back to **28 spec files**.
- Five value mutations, each reverted with the inverse, never `git checkout`.

### Still open

The grid tints a cell by appending hex alpha (`${c}18`), so a **non-hex** colour produced
`var(--accent)18` — not a colour — and the cell lost its background *and* border. Fixed with a
hex guard, which now matters because gym-authored types (`makeClassType` → `color:
"var(--accent)"`) can finally be scheduled. Verified by screenshot across all five cases.

---

## Session 20 — the sweep came back clean, and the roster did not

> **Gates green** at `e81e793`. `lint:crash` **0** · **745 unit** (27 files, no todos) ·
> **239 e2e** (28 spec files, no fixmes) · five-chunk build: index **204.50 KB** + StaffApp
> **338.73 KB** + PersonasScreen **91.04 KB** + ClassSummary **5.81 KB** + summaryApi
> **0.85 KB**. App.jsx **3,382 lines** — one attribute changed, no lines added.
>
> **A12/A13 are still not done**, confirmed with Dylan at the top of the session. N4's two
> Edge Functions and migration 0009 remain **code nobody has run**. Nothing here changes that,
> and no claim below depends on them.

### 🟩 The highest-yield item in the session-20 prompt returned NOTHING, and that is the finding

§4.5 ranked "sweep the other eight screens WITH DATA LOADED" as the top item, on the strength
of session 19's Coaches haul (13 unnamed destructive controls on first render, 29 + 33 in its
worst panel). The expectation was "expect a similar haul".

**There is no haul.** Seeded a populated store — 5 members across all three statuses,
attendance, schedule rules, class instances, session history, gym branding, retention actions —
and ran all three `a11yScan.js` rules over **nine top-level screens** and **fifteen
interaction-revealed panels**. Result: **0 unnamed buttons, 0 symbol-only buttons, 0 nameless
fields.** Members, Schedule and Brand Studio were verifiably populated (button counts
15→29, 51→60, 30→31; content markers asserted) and every per-row control was already named,
and named *distinguishably* — "Edit Regular Rita", "Remove Morning Burn on Mon at 06:00 from…".

Sessions 12, 14 and 16 did that work. **Coaches was the one screen never swept at all**, which
is why it held everything. It was the outlier, not the first of a pattern.

⚠️ **The reason this is trustworthy rather than a scan that quietly measured nothing:** every
screen was scanned **twice**, once against an empty store and once against the fixture, and the
two button counts and a content marker were printed side by side. That is what caught the one
case where the fixture genuinely did NOT land — the Class Runner, whose surface is driven by the
Builder's draft and not by `class_instances` at all. Without the empty-store control, seven
honest zeros and one meaningless zero would have looked identical.

### 🔴 Asking the same question about the ROSTER instead of about names found two real defects

Both on the path a coach walks every single class.

**1. `CheckInPanel` had no view on membership status at all.** Three places in this app model
it carefully — `retention.js` refuses to flag a paused or cancelled member and explains why for
each; `RosterScreen` counts only active ones ("including cancelled members makes it a flattering
[number]") and dims the rest behind a "Left" badge — and then the Runner rendered
`store.getMembers()` unfiltered. An owner read **`Roster · 1`** on the Members screen, opened the
Runner, and was offered **three identical full-brightness names**. Tapping the one who left
wrote a real attendance row, for a member the retention engine then declines to analyse: written
and never read.

The cost is **P6**, the design law this panel exists to serve — under five seconds per member.
That budget is spent *scanning*, and the list only grows, so the sweep gets slower exactly as
the gym gets older and its roster gets more valuable.

🔴 **A filter alone would have been WORSE than the bug, and this is the part worth carrying
forward.** `canAdd` refuses quick-add for a name that already belongs to somebody, cancelled
included — so hiding a returning member without a way to reach them strands a real person at the
door, findable by nothing and addable by nothing. The shape is therefore: **current members by
default, search sees everyone, and a surfaced row carries its status as a WORD** (not as
opacity, which announces nothing). `e2e/checkin.spec.js` pins that pairing in its own test, so a
later change that filters the search results too fails with the sentence explaining why.

**2. `App.jsx` was writing a display string into an analytics column.** It handed the Runner
`[classType, subType].join(" · ")` — assembled for a header that **does not exist**, since
`LiveScreen` never renders `classType` and only ever passes it to `ensureClassInstance`. So it
went straight into `class_instances.class_type`, the column N2's cohort analytics group by.

The Runner recorded `"hiit · amrap"` while the Schedule's publish path recorded `"HIIT"` for the
same class: **two doors into one column, two vocabularies, and no query that can ever group
them.** For a gym-authored type it was `"gym-barre-ms4pk827 · general"` — a key with a label
glued on, matching nothing. This is precisely the defect `CheckInPanel`'s own header comment
already describes for `duration_min` and `coach_name` ("the same class recorded different
amounts of itself depending on which door it came through"), in the one field that pass missed.

Found by driving §4.5's other named gap: **a gym's own class type into the Runner and through to
a check-in**, then reading the STORED occurrence back. The path had never been driven. There was
no constraint risk to find (`class_type` is plain `text`, verified session 18) — the defect was
that the value did not survive the journey.

### What shipped

| | |
|---|---|
| `src/screens/runner/CheckInPanel.jsx` | Status-aware sweep list, labelled revealed rows, and an empty state that distinguishes "no members" from "no CURRENT members" (it used to answer "No one matches that name" when nothing had been searched). |
| `src/lib/retention.js` | `isCurrentMember` **exported**. Two definitions of "is this still one of our members" is what let one screen say `Roster · 1` while another listed three names. |
| `src/lib/store.js` | `MEMBER_STATUS_LABEL` moved here beside `MEMBER_STATUSES` for its second UI consumer. ⚠️ `csvExport.js` keeps its own copy **on purpose** — that module has zero imports by design and must not be "fixed" to import the storage seam. |
| `src/App.jsx` | `classType={classChoice?.classType || ""}`. One attribute. |
| `src/screens/runner/LiveScreen.jsx` | The comment saying `classType` is DATA, not a label — the thing whose absence caused the bug. |
| `e2e/checkin.spec.js` | **New, 6 tests.** |
| `src/lib/retention.test.js` | 4 tests pinning `isCurrentMember`'s edges now that it is a shared contract. |

### Method notes worth keeping

- **Five value mutations, each failing the right test for the right reason, each reverted with
  the inverse.** The pairing mutation (filtering the search results as well as the default list)
  failed exactly the two tests written to catch it, with their own messages.
- 🔴 **The badge assertion's first draft pinned `/LEFT/` and failed against CORRECT code.**
  The badge is `text-transform: uppercase`; Playwright's `toContainText` reads `textContent`,
  which ignores it, so the matcher saw `"Left"`. Pinning the case would have pinned a CSS
  choice. The repo already carries "innerText respects text-transform; textContent does not" —
  this is the same trap arriving through an assertion instead of a scan.
- **A recon spec is worth writing and deleting.** Three throwaway specs (`zz-recon*.spec.js`)
  printed counts and every button name per screen rather than asserting. The full picture in one
  run is what made "there is no haul" a finding instead of a guess. All three deleted before
  commit; suite is 28 spec files.
- **A phone gets the bottom bar, and `nav()` is desktop-only** — the documented trap, hit once
  while screenshotting the panel at 390px. The labels are `Run` / `Build` / `Members` / `Brand` /
  `More`, inside `page.locator("nav").first()`.

### Docs — §4.4's item, done

Root is **19 `.md` → 6** (one of which, `Jungle - Delta & Backlog Breakdown.md`, is gitignored
and local-only). `SESSION-HANDOFF.md` is **165 KB → 9.5 KB**. Thirteen audit/strategy files moved
to `docs/`; sessions 6–18 moved verbatim to `docs/history/HANDOFF-ARCHIVE.md`.

⚠️ **Every live cross-reference was repointed** — the As-Built spec (×10), `supabase/SETUP.md`
(→ `../docs/`), `docs/SPEC-PATCHES.md` (→ `../` for the spec) — and verified with a grep that
finds no bare filename left. References inside `docs/history/**` were **deliberately left
alone**: they are records of what was true then, exactly like `FABLE-AUDIT-PROMPT.md`'s stale
`NEXT-SESSION-PROMPT.md` pointer, which §4.4 of the session-20 prompt already ruled on.

---

## Session 19 — N4 is built. The product has a member-facing surface.

> **Gates green.** `lint:crash` **0** · **741 unit** (27 files, no todos) · **219 e2e**
> (27 spec files, no fixmes) · build clean. App.jsx unchanged at **3,382 lines**.
>
> 🟢 **N4 — the member magic-link summary — is BUILT**, in the order the spec insisted on:
> **token and Edge Functions first, page second.** It is the last Phase-1 gap and the only
> screen in Jungle a person without an account can open. ⛔ It goes live when Dylan does
> **`DYLAN-QUEUE.md` A12** — one secret, two function pastes, one migration. ~25 minutes.
>
> ### The structural finding, and it would have shipped broken without it
> `main.jsx` wraps `App` in `AuthGate`, and **with Supabase configured `AuthGate` shows a
> sign-in wall to anyone without a session.** A member tapping their class link would have
> been asked to log into their gym's staff app. No route inside `App` could have fixed
> that, because `App` never renders. **The summary page is therefore routed above
> `AuthGate`.** This is invisible locally — the credential-less build has no wall to hit —
> so `e2e/memberSummary.spec.js` asserts *"no app shell and no sign-in"* rather than merely
> *"the summary is there"*.
>
> ### What the design refuses to do
> - **The token is class-scoped, never member-scoped.** A leaked link exposes one class's
>   programming — the same content the share card already publishes to Instagram — and names
>   nobody. There is no member id in the payload and no join to a person in the read path.
> - **RLS was not loosened to `anon`, and 0007's policies were not touched.** `summary-read`
>   uses the service-role key only *after* an HMAC + expiry check, and only for the one class
>   named in the signature. Pinned by a test that greps the real `.ts` for `members?`,
>   `attendance?`, `consent_records?`, `profiles?`.
> - **`summary-token` never touches the service-role key at all** — it runs under the
>   caller's JWT so *RLS is the authorization check*. A function that cannot escalate cannot
>   be tricked into escalating.
> - **The token lives in the URL fragment, not a query string.** A fragment never leaves the
>   browser; a bearer credential in `?s=` lands in access logs and leaks via `Referer`.
> - **Not JWT.** One algorithm, not named anywhere the token can influence. A format that
>   cannot express `alg: none` cannot be confused into accepting it.
> - **`summaryContent()` is an allow-list, not a cleaner.** A new field on a stage object
>   cannot reach a member by default. That single property is what the class-scoping
>   guarantee actually rests on.
>
> ### 🔴 The lesson this session: A GUARD THAT REPAIRS WHAT IT INSPECTS REPORTS SUCCESS
> The token core is duplicated into both Edge Functions (a function pasted into the Supabase
> dashboard cannot import from `src/`), so `classToken.mirror.test.js` reads the real `.ts`
> files and compares them byte-for-byte. It imported `extractCore` from
> `scripts/sync-token-core.mjs` — **which ran its sync at import time.** Importing the helper
> re-wrote the files, silently repairing the drift a moment before measuring it. I hand-edited
> a copy to `v2`, ran the test, and it passed **and the file was back to `v1`**. Fixed by
> guarding the script's side effects behind a run-as-main check.
> **Fifth session running that the guard was wrong before the code was.** Assume your checker
> is broken until it has failed for the right reason.
>
> ### 🔴 A test that accepts every failure reason asserts nothing
> The token's malformed-input test originally accepted any of `malformed | bad-signature |
> bad-payload` — which is every failure reason there is, so it only proved `ok === false`.
> Tightened to pin the exact reason per input; the loose version **passed** against a mutation
> that removed the version-prefix check entirely. Same family as session 18's "expected state
> is already the default state".
>
> ### The root bundle is now split, and the member pays a fifth of what staff pay
> `main.jsx` lazy-loads `ClassSummary` and `StaffApp` (a new 15-line wrapper pairing `AuthGate`
> with `App` so nothing can import `App` past the auth wall). Measured on a
> **production-shaped build** (dummy `VITE_SUPABASE_*` so rollup keeps the sync paths):
>
> | | before | after |
> |---|---|---|
> | a **member** downloads | 776.85 KB | **206.69 KB** (`index` 198.29 + `ClassSummary` 5.49 + `summaryApi` 2.91) |
> | **staff** download | 776.85 KB | 782.71 KB (`index` + `StaffApp` 584.42) |
>
> **~570 KB off the member path**, 5.9 KB onto staff. Verified by grepping the emitted chunks
> for `GoTrueClient`/`PostgrestClient` — **supabase-js is in `StaffApp`, not in the member
> path.** ⚠️ The credential-less local build strips the sync code and shows *no* supabase in
> *any* chunk, so it cannot answer this question; the dummy-vars build is the one that can.
>
> ### Two real regressions the split caused, both found and fixed
> 1. **A flash of near-black on load.** The skin is applied by `applySkinCSS`, which now runs
>    only once the lazy chunk lands. For a gym with a light palette that is a dark flash —
>    the exact "whose background do you wear" failure `display.spec.js` exists about, moved
>    earlier in the load. Fixed with `bootColours()`: `applySkinCSS` caches the last-painted
>    `bg`/`muted`, and `main.jsx` paints them before React mounts. Measured by holding the
>    chunk with `page.route` so the boot state stops being a race — **`rgb(10,15,12)` before,
>    the gym's `rgb(255,247,240)` after.**
> 2. **Two `display.spec.js` tests read `:root` custom properties before the app mounted** and
>    computed `NaN`. New `waitForApp()` in `e2e/helpers.js`. ⚠️ **Any future test that reads a
>    computed style (rather than asserting on an element, which auto-waits) must call it.**
>
> ### A behaviour worth knowing about
> **Changing only the fragment is a same-document navigation** — the browser does not re-run
> `main.jsx`, so pasting a member link into a tab that already has the app open leaves the app
> on screen and looks exactly like a broken link. The first person to do that would have been
> whoever verified the feature. `main.jsx` now reloads on a `hashchange` that carries a token.
> (Probed directly: `goto('#s=…')` kept the app; `reload()` showed the summary.)
>
> ### Files added
> `src/lib/classToken.js` (+ `.test.js`, `.mirror.test.js`) · `src/lib/summaryContent.js` (+ test)
> · `src/lib/summaryApi.js` (+ test) · `src/screens/ClassSummary.jsx` · `src/StaffApp.jsx` ·
> `src/screens/runner/MemberLinkDialog.jsx` · `e2e/memberSummary.spec.js` ·
> `supabase/functions/summary-token/index.ts` · `supabase/functions/summary-read/index.ts` ·
> `supabase/migrations/0009_class_summaries.sql` · `scripts/sync-token-core.mjs`
>
> ---
>
> ## Session 19, part 2 — the PersonasScreen sweep, and it paid immediately
>
> **Gates: `lint:crash` 0 · 741 unit · 233 e2e · build clean.** (e2e 219 → 233.)
>
> The Coaches screen had never been swept past its first render. It was the worst
> accessibility surface in the app by a distance:
>
> | Surface | unnamed buttons | nameless fields |
> |---|---|---|
> | Base, **with a coach loaded** | **13** — Delete persona, Delete movement ×11, Remove plan | 0 |
> | Change class shape | 18 | **5** role dropdowns |
> | **Edit plan** (`PersonaPlanEditor`) | **29** | **33** |
>
> All now zero, labelled in the house style (`aria-label` naming the item, as
> `members.spec.js` already expects with `/Edit Ada/`). Seven Coaches panels added to
> `e2e/revealed.spec.js`; proven by deleting one label and watching 11 findings appear
> across three panels.
>
> ### 🔴 "Revealed" is not only about a CLICK — it can be about there being DATA
> With no coach loaded the Coaches screen has **two** buttons, which is why
> `screens.spec.js` passed it for eighteen sessions. Load the shipped sample coach and the
> *same first render* grows thirteen icon-only destructive controls. **A screen-level sweep
> against an empty store is a sweep of an empty screen.** Worth re-checking the other eight
> screens in a data-loaded state.
>
> ### 🔴 A scanner false positive, and it nearly made me label two unreachable buttons
> `a11yScan.js` decided visibility with `offsetParent !== null`. Inside a **collapsed
> `<details>`** an element reports `offsetParent` non-null *and a real 162×37 box* — but
> `checkVisibility()` is false and it cannot take focus. Meanwhile the naming rules read
> `innerText`, which correctly returns `""` for unrendered content. **The two halves of the
> scan disagreed: invisible enough to have no name, visible enough to be judged for not
> having one.** Now `offsetParent !== null && checkVisibility()` — an AND, so it can only
> ever remove a finding the browser itself calls invisible. `namelessFields` was
> deliberately left alone: it has no `<details>` false positive and adding a filter there
> could only suppress real findings.
>
> ### Still open after this session
> **A gym class type through the Runner to a check-in** (never driven) · **the other eight
> screens re-swept with data loaded** (see above — this is now a known gap, not a
> hypothesis) · the 147 KB of this file and 9 audit files still at repo root.
> **N2/N3 remain correctly blocked on attendance volume, which is blocked on the pilot.**

---

## Session 18

_Last updated: 2026-07-28 (session 18, second half)_

> Gates at `2058625`: **`lint:crash` 0 · 683 unit · 202 e2e ·
> build 537.75 KB + 89.97 KB**. App.jsx **3,382 lines**.
>
> 🟢 **Dylan answered all nine Part B decisions.** Six shipped in session 18's second half:
> 3 dead symbols deleted · **`eslint-plugin-react` added, closing the crash gate's twelve-session
> JSX blind spot** (proven: a planted `<ThisComponentDoesNotExist/>` fails the gate) · 12 session
> prompts moved to `docs/history/` · the stale `claude-opus-4-8` default fixed · **DEC-16 built** ·
> Sentry deferred until the lawyer, `storage-js` left alone.
>
> 🔴 **AND DEC-16 SHIPPED A REGRESSION THAT I FOUND AN HOUR LATER.** Wiring the catalogue READS was
> only half the job: `applyTemplate` builds its stage skeleton from `CLASS_STAGE_TEMPLATES`, a
> SEPARATE built-in constant that can never hold a `gym-` key. Selecting a gym's own class type
> returned early and **left the previous type's stages in place** — the dropdown said Barre and the
> Builder showed CrossFit. Worse than "nothing happens", because the label and the content
> disagreed silently. Fixed by `DEFAULT_STAGE_TEMPLATE` (`06554cb`).
>
> **The generalisable lesson: the feature you just shipped is the most likely place to find the
> next defect, and your own new test is the least likely thing to catch it.**
>
> 🔴 **TWO WAYS A TEST WAS VACUOUS THIS SESSION — both passed against real defects:**
> 1. **A frozen clock makes any `Date.now()`-derived id non-unique.** `page.clock.setFixedTime`
>    freezes `Date.now()` outright (two reads 1.5s apart both returned `1784520000000`), so a
>    re-founded schedule rule gets the SAME id and "the id survived" passes either way. Fix:
>    advance the clock between the actions you are distinguishing.
> 2. **An assertion whose expected state is already the default state.** "The draft has stages
>    including a warmup and a cooldown" — a fresh Builder already has exactly that from
>    `mkStages()`. Fix: establish a known-DIFFERENT starting point, then assert the change.
>
> 🟢 **`DYLAN-QUEUE.md`** is the live blocked-on-Dylan list — exact dashboard clicks, commands,
> expected output, failure modes and undo steps, split into "config he can finish alone" (11 tasks)
> and "decisions only". Two things it surfaced that were on no previous list: **the Supabase region
> has never been confirmed as `ap-southeast-1`** (and cannot be changed in place), and
> `persona-ai`'s Anthropic branch defaulted to a two-generation-stale model.
>
> **Shipped session 18** — `c2db26f` → `2058625`, ten commits. Full table in `SESSION-19-PROMPT.md` §1.
>
> **Next:** N4 (approved — Edge Function and token FIRST, page second), then the PersonasScreen
> revealed-panel sweep, then a gym class type driven through the Runner.

> **▶ SESSION 18 (first half) CONTEXT.** Read this block, then the session-17 block below it, then spec
> **§0**'s trust ranking and **§12**. Gates at `c29a9c9`: **`lint:crash` 0 · 683 unit (no todos) ·
> 195 e2e (no fixme) · build 536.86 KB + an 89.97 KB PersonasScreen chunk**.
>
> 🟢 **A coach can finally CHANGE a class on the schedule.** Session 15 added remove and stopped
> there, so fixing a typo meant remove-and-re-add — which mints a new `id`, and the id is the
> rule's identity, stamped onto every occurrence as `ruleId`. Each cell now has an Edit beside its
> Remove. An edit **deliberately does not rewrite already-published occurrences**: a rule is a
> template, publishing stamps a copy, and `class_instances` is the append-only spine attendance
> hangs off — the same principle `removeClass` states. A rename on a published week therefore makes
> that week publishable again, and **"Publish week · N" lighting back up IS the disclosure** — it
> is computed from the same `diffOccurrences` the publish path uses, so it cannot drift from what
> publishing would do.
>
> 🔴 **A FIXED CLOCK MAKES ANY `Date.now()`-DERIVED ID TEST VACUOUS.** The load-bearing assertion
> for the above is "the stored id survived". Mutating the edit to assign a fresh id — the exact
> defect the feature prevents — left **all six tests green**. Probed: `page.clock.setFixedTime`
> **freezes `Date.now()`** (two reads 1.5s apart both returned `1784520000000`), and a rule's id is
> `uc${Date.now()}`, so a re-founded rule is minted with the *same id* as the one it replaced.
> Fixed by advancing the clock between the add and the edit; both tests now fail under the
> mutation. **Generalise it: a test that freezes time cannot tell two objects created from
> `Date.now()` apart.** (It also means `uc${Date.now()}` can collide for two rules made in the same
> millisecond — not reachable by hand today, and left alone rather than switched to `store.newId()`
> because the id format crosses the sync boundary that is unverifiable locally.)
>
> 🟢 **The non-button interaction sweep is DONE, and `onPaste` never existed.** Asking the generic
> question — "which DOM event handlers does no test ever fire?" — beat the enumerated one. An AST
> scan of every `on*` on an **intrinsic (lowercase)** element (60% of `on*` attributes in this app
> are component props like `onClose`/`onBack`, which are deadctl's territory) found the app's whole
> DOM surface is **14 event types across 64 files**. **`onPaste` has zero occurrences — there were
> never any paste handlers to sweep**; take it off the list. Exactly two handlers were fired by no
> test: `onTouchStart` on the Room TV wrapper and `onBlur` on the schedule's empty-slot "+". Both
> were CORRECT when probed, so `e2e/nonButtonInput.spec.js` pins behaviour rather than fixing a
> bug — each is the only way its user reaches the feature (a Room TV is a wall-mounted tablet, and
> every existing Room TV test wakes the bar with `page.mouse.move()`, the one input such a display
> never receives).
>
> ⚠️ **`onTouchStart` is not strictly load-bearing** — Chromium synthesizes `mousemove` after
> `touchstart` (probed: `pointerdown, touchstart, mousemove, mousedown, click` all fire on a tap).
> It fires first and is the only path on an engine that does not synthesize, so it stays.
>
> **Shipped session 18** — `c2db26f` → `c29a9c9`, three commits:
> `34925db` the event-handler sweep + `e2e/nonButtonInput.spec.js` ·
> `4c6e4f5` edit-a-scheduled-class (6 tests) + the fixed-clock finding ·
> `c29a9c9` `SLOT_LABELS` removed.
>
> ⛔ **Three dead symbols remain, and they are still Dylan's yes/no** — re-verified dead at
> `c2db26f`: `nudgeForContrast`, `resolveSubBrand` (`src/lib/colors.js`), `fetchBpmData`
> (`src/music/spotifyApi.js`, still in its export list). All three are exported module API standing
> for features implemented and never wired (FR-H8 sub-brands, Deezer BPM, a superseded contrast
> nudge), so deleting one is a product decision, not a cleanup. **`SLOT_LABELS` was removed** —
> it was never the same kind of thing: not exported, not a feature, an unreferenced local const
> whose own comment asked for exactly that cleanup pass.
>
> **Still open, in the order I'd take them:** N4 (⛔ Dylan, Edge Function — still the only
> member-facing surface) · OPS backups (⛔ Dylan) · the live-verification queue (§5, unexercisable
> locally) · I14 hydrate pagination · I8 media proxy · DEC-16 gym-authored class type · the 14
> session prompts + 145 KB handoff at repo root (`docs/history/`, Dylan's call).

> **▶ SESSION 17 CONTEXT (retained).** Read this block, then spec **§0**'s trust ranking and **§12**.
> `SESSION-17-PROMPT.md` carries the blocked-on-Dylan list, but **its §4.3 (I10) is wrong** —
> see below. Read its **§0a** first; `git log` taken at session start goes stale.
> Gates at `e0f62ac`: **`lint:crash` 0 · 683 unit (no todos) · 189 e2e (no fixme) ·
> build 535.94 KB + an 89.97 KB PersonasScreen chunk**. App.jsx **3,337 lines** (`wc -l`), up
> from 3,183 — the three dialog components extracted out of `{cond && …}` blocks cost ~150 lines
> of markup that moved rather than grew. ⚠️ `(Get-Content).Count` matches `wc -l` here;
> `Measure-Object -Line` reports 3,076 because it skips blank lines (§0b).
>
> 🔴 **THE BIGGEST FIND: six effects pushed the app's DEFAULTS over the gym's real branding.**
> Six places had the shape `useState(() => store.getX())` + `useEffect(() => store.saveX(x), [x])`.
> Locally harmless — the mount pass writes back what it just read. Against Supabase it is data
> loss: `store.connect()` runs during the App root's RENDER, so `_synced()` is already true when
> effects run, and on a **fresh device** the initialisers return DEFAULTS (skin `"canopy"`,
> branding `{}`). The mount pass pushed those to `brand_profiles` for the whole gym — the
> studio's logo, name, colours and skin — while `hydrateAll()` fired its SELECT from a sibling
> effect. **Which one won was a race.** The I3 guards do not cover it: `_blobStale` re-pushes
> when the last write FAILED; here the write SUCCEEDS.
> Fixed by `src/ui/useAfterMount.js`, pinned by `e2e/mountWrites.spec.js`.
>
> 🔴 **…and the obvious version of that guard is WRONG.** A "have I mounted yet" ref — which is
> what CalendarScreen had carried since F5 — is defeated by `<StrictMode>` (src/main.jsx). React
> remounts in dev to surface non-idempotent effects; the ref survives the cycle, so the second
> pass performs exactly the write the guard prevents. **Worse than failing: StrictMode is
> dev-only, so the naive guard works in production and fails in dev** — correctness the tests
> can never observe. The hook now asks "has this value CHANGED since first render?" instead of
> counting mounts, and `armed` latches so an A→B→A edit is not silently dropped.
> This is session 16's "the tool was wrong before the code was", for the fourth session running.
>
> 🟢 **Seven modals were never modal.** A live probe of every overlay found the same four
> failures in each: no `role="dialog"`, no `aria-modal`, focus never entered, Tab walked out the
> back, Escape did nothing. Opening the profile modal left focus on the trigger BEHIND the
> overlay, so the first Tab landed on "Resume building" — one of **17 controls hidden behind the
> backdrop**, all focusable and activatable. The add-class modal had **50**. Fixed by
> `src/ui/dialog.js`; 24 tests in `e2e/dialogs.spec.js`, including the nested reset-confirm case.
>
> ⚠️ **I10 IS DONE and three documents said otherwise.** It landed in `224b074` (session 15),
> 39 commits before session 17 started, yet the session-17 prompt ranked it the largest remaining
> engineering item. `persona_plans` routes through `_bgUpsertDelta`; `attendance` was always
> per-row. 12 unit tests already pinned it. store.js:1409 and both spec §12 entries corrected.
> **Verify a backlog item against the CODE before spending a session on it.**
>
> 📏 **Production bundle re-measured** (was three sessions stale at 787.2 KB): **776.85 KB main +
> 91.19 KB chunk = 868 KB, 214.43 KB gzip**, built with dummy `VITE_SUPABASE_*` vars so rollup
> keeps the sync paths. The local gate build strips **~241 KB** off the main chunk — quote that
> delta, not a percentage: the spec's long-carried "~37%" is ambiguous about which side you
> divide by (241/776.85 = 31%, 241/535.94 = 45%), and it meant neither consistently.
>
> **Shipped session 17** — `a85120c` → `e0f62ac`, four commits:
> `fae0ab9` dialog semantics + focus trapping on all seven live overlays ·
> `a948d0b` interaction-revealed a11y sweep (scanners shared into `e2e/a11yScan.js`); found the
> profile modal's Gym Branding tab shipping **nameless brand colour swatches and font select** ·
> `843547d` the mount-write fix, plus **four unnamed Room TV settings gears** found when the
> sweep was extended past the mode switch onto a board ·
> `e0f62ac` I10 correction + bundle re-measure.
>
> **Still open, in the order I'd take them:** N4 (⛔ Dylan, Edge Function — still the only
> member-facing surface) · OPS backups (⛔ Dylan) · the live-verification queue (§5, unexercisable
> locally — and I10's delta blob round-trip is now the interesting one) · I14 hydrate pagination ·
> I8 media proxy · DEC-16 gym-authored class type · edit-a-scheduled-class (rename/re-slot) ·
> the 13 session prompts + 143 KB handoff at repo root (`docs/history/`, Dylan's call).
>
> ⚠️ **`SESSION-16-PROMPT.md` is superseded.** Its §4.1/§4.2/§4.4/§4.5 were done in session 16;
> `SESSION-17-PROMPT.md` §4.3's I10 row and §4.5's focus-trapping / revealed-panels /
> mount-writes rows are done here.

> **▶ SESSION 16 CONTEXT (retained).** `SESSION-16-PROMPT.md` carries the pending list and the
> blocked-on-Dylan items — but **its §4.1 (I6), §4.2 (I9), §4.4 (dead symbols / unused props /
> a11y) and §4.5 (Library, PersonasScreen) are now DONE**; see "Shipped session 16" below for
> what is actually left. Read its **§0a first** — a second session was committing to `main`
> during session 13, and `git log` taken at session start goes stale. Then spec **§0's trust
> ranking** and **§12**.
> Gates: **`lint:crash` 0 · 683 unit (no todos) · 144 e2e (no fixme) · build 533.39 KB
> + an 89.89 KB PersonasScreen chunk**. App.jsx **3,183 lines** (`wc -l`), down from 4,851.
>
> 🟢 **SESSION 16 CLEARED THE BIG ONE. I6 stage 5 is done** — the Runner cluster now lives in
> `src/screens/runner/` behind `useClassRunner()`, and App.jsx lost **1,668 lines (−34%)**.
> Deferred by sessions 13, 14 and 15; the AST tooling made it safe, and the smoke test proved
> it (a planted mutation in the extracted `FloorLiveScreen` fails `smoke.spec.js` on exactly
> its landing assertion, so the suite is provably driving the extracted code).
>
> 🔴 **THE TOOL WAS WRONG BEFORE THE CODE WAS.** Three separate times this session a checker
> or an assertion had to be fixed before its finding could be believed:
> 1. **`deadctl`'s hover blind spot**, fixed and re-proven against **6 planted defects and 18
>    planted non-defects** before a single finding was acted on.
> 2. **A bundle-membership fingerprint that lied.** "Music Hub" is also a nav label;
>    `api.spotify.com/v1/me/player/play` is also LiveScreen's own inline fetch. The checker now
>    validates every candidate against the whole `src/` tree and reports **"cannot decide"**
>    rather than guessing.
> 3. **An `inert` a11y assertion that failed against CORRECT code.** `inert` does not rewrite
>    `tabIndex`, and Playwright's role engine does not model it. What the browser actually
>    does is **refuse the focus** — that is the only honest assertion, and it took a probe to
>    find out. Session 14's trap, hit again and caught in time.
>
> ⚠️ **A backlog number was wrong and is now measured.** The prompt carried I9-leftover as
> "`useSpotify()` drags spotifyAuth + spotifyApi into the main chunk, **~2.5 KB**". Stubbing
> both imports and rebuilding saves **0.15 KB** — those modules were already out. The bytes
> were in **six ungated call sites**, which is where the real **12.7 KB** came from.
>
> 🔴 **Session 15 found five defects of ONE kind: a control that renders, invites a press,
> and does nothing.** Not one of them threw, crashed, logged, or failed a write — which is
> why fourteen sessions of error-boundary sweeps, accessible-name sweeps and `lint:crash`
> all passed them. In order of what it cost a coach:
>
> 1. **The Dashboard's second hero button emptied the screen.** It navigated to `templates`,
>    a view retired at the `isViewEnabled` choke-point with no render branch left behind.
>    Sidebar and footer stayed, the content area went blank, no back button. On a fresh
>    store its label is **"New class"** — the second button on the first screen.
> 2. **The Exercise Library was browse-only.** `onAddExercise` was accepted as a prop,
>    passed from both Builder call sites, and never called. 330 movements, no way to put
>    one into the class being built.
> 3. **A class could never be taken OFF the schedule.** `setUserClasses` was only ever
>    appended to — a typo'd class was permanent, in every week, forever.
> 4. **An empty schedule slot refused the click.** `cursor:pointer` and a hover "+", wired
>    to `onMouseEnter`/`onMouseLeave` and nothing else. Mouse-only and inert.
> 5. **The Library's ⠿ drag handle never moved anything.** `cursor:grab`, no `draggable`,
>    no handlers — while `libraryStore.js` had already been built to store reorder.
>
> **The generic question that found them all: "which rendered controls do nothing, and which
> threaded props are never called?"** — not "is feature X working?". §2's method again, and
> the highest-yield hour in this repo so far.
>
> ⚠️ **`onMouseEnter` counts as a handler to a naive `/^on[A-Z]/` check.** That is exactly
> why the schedule "+" survived the first automated pass — hover is not activation. It was
> found by reading, not by the tool. Whoever extends that checker should split activation
> handlers from passive ones.
>
> ✅ **DEC-13 and DEC-12 are both ANSWERED and SHIPPED** (session 14). The library no longer
> freezes at first edit. Do not re-raise either.
>
> 🔴 **Session 14's main chunk drop was NOT a refactor — it was a bug.** Two keyboard
> shortcuts in the Class Runner reached the cut music subsystem: **S** opened a Spotify
> search over the running class, and **M** asked the coach for **microphone permission** to
> duck a player that is permanently null. Guarding them took **24.15 KB (−4.3%)** off the
> main chunk, because rollup cannot eliminate a component an unguarded state flag can reach.
> **The lesson generalises: a feature flag is only a build-time constant where every path to
> the flagged code is itself gated.** Neither was reachable from a button, which is why every
> sweep so far missed them.
>
> ⚠️ **`Measure-Object -Line` does not count blank lines.** The session-13 and -14 prompts
> both report App.jsx at "4,684 lines" on that basis; the file was really **4,993**. It is
> **4,852** now. Use `wc -l` or node, and treat any line count in these documents written
> before session 14 as a non-blank count.
>
> ⚠️ **The build gate number CHANGED in session 12** (was 651 KB, one chunk). The personas
> cluster is now lazy-loaded, so the main chunk is 565 KB and Coaches fetches its own 89 KB.
>
> ⚠️ **Both are LOCAL numbers and they under-report production by ~37%.** With no
> `VITE_SUPABASE_*` vars, rollup eliminates every sync path. **Production is now MEASURED** off
> the live deploy of `cc4a1b7`: **main 787.2 KB + personas 88.3 KB = 875.5 KB**, against a
> pre-split single bundle of ~890 KB. So first load dropped **~103 KB (−11.5%)**.
>
> The personas chunk is **88.3 KB in production vs 89.21 KB locally — essentially identical**,
> which corrected an expectation written earlier the same session: that chunk imports `supabase`,
> so it was assumed to be much larger in production. It is not. `supabase` is a shared dependency
> and rollup keeps it in the common chunk, so the whole ~240 KB delta between local and production
> sits in the MAIN chunk. Verified live: on first load the browser fetches only
> `index-*.js` + CSS, and `PersonasScreen-*.js` is not requested until Coaches is opened.

---

## 🟢 Shipped SESSION 16

`a863768` → `1d4abd3`, six commits. The refactor the last three sessions deferred, plus the
sweep line kept running alongside it.

| Commit | What it did |
|---|---|
| `4494b72` | **I6 stage 5.** `LiveScreen`, `RoomTV`, `CheckInPanel`, `OverviewDisplayScreen`, `FloorLiveScreen`, `DisplayScreen`, a shared `displayKit`, and `useClassRunner()` all move to `src/screens/runner/`. App.jsx **4,851 → 3,183**. New shared modules `src/lib/format.js` and `src/lib/brandCopy.js` fell out of the seam. |
| `a93bfcf` | **I9.** The music quarantine was **nominal in six places** — the Builder's Soundtrack panel gated on a state flag, the BPM-enrichment effect, `handleDjClass`, LiveScreen's three transport helpers, DisplayScreen's play/pause, and the runner's autoplay effect. **545.06 → 532.37 KB**; `api.spotify.com` occurrences 6 → 2. |
| `fa9f018` | Brand Studio's **LIVE PREVIEW pane had a real, focusable `<button>Start Class</button>`** on sample content — reachable only by the users least able to tell it was decoration. Fixed with `inert`. Four unused props removed (`spPaused` ×3, `onProfile`). |
| `79c29ab` | The Library's three **write paths** pinned: edit, delete, Reset-to-defaults — plus the search box, which nothing had ever asserted actually *filters*. |
| `00e07e9` | **a11y round 3, the form fields.** Sixteen nameless controls, including **eight identical unnamed colour swatches** in Brand Studio. New sweep over all nine screens. |
| `1d4abd3` | **Move an exercise between stages** — `onMoveExercise` was threaded in and never called, so a misplaced movement had to be deleted and retyped. `deadctl` now reports **zero** unused props repo-wide. |

### What the runner extraction is, beyond a file move

`useClassRunner()` is the half that is not carpentry. "What happens when a stage ends" was
four `useEffect`s scattered between the skin loader and the share-card handler in App's root;
reading them in order meant reading the whole root. They are now adjacent, with the reasoning
about **which `class_instance` a check-in lands on** (`pinnedClass`, `handleStartScheduled`)
sitting next to the panel that writes it. What stays in App and is passed IN is what more than
one cluster needs: the class being planned, the history the Dashboard reads, the Spotify
handles, and routing.

**Deliberately NOT `React.lazy`.** That would put a network fetch between a coach tapping
"Start class" and the room seeing a timer, on the one screen that has to work when the studio
wifi does not. The barrel says so, so the next session does not "optimise" it.

### Two traps this extraction sprang, both worth keeping

- **`FloorLiveScreen` declares its OWN `fmt`** that clamps negatives and floors seconds, so an
  overrun stage reads `0:00` on a wall a room is looking at. It **shadows** the module import.
  A grep would have "tidied" it into the shared `fmt` and been silently wrong; the AST
  dead-import scan caught it. `src/lib/format.test.js` now pins that as an executable
  **negative** — `fmt(-1)` must NOT be `"0:00"` — rather than as a comment a future tidy-up
  would delete along with the shadowing local.
- **The `jsx` and `lint:crash` checkers are complementary and you need both.** The AST script
  found **17 unresolved components** in the new modules that `lint:crash` cannot see (§6); the
  crash gate then found **16 plain-identifier misses** the JSX script cannot see.

### Not defects — do not re-open

`deadctl`'s remaining 7 findings are all behind flags that are `false`, so none can render:
AnalyticsScreen's three handler-less buttons (already known), **CalendarScreen's "Jungle
Intelligence" tip action and its SUGGESTED slot chip** (both inside
`FLAGS.mockAnalytics ? [...] : []`), and two inside the now-gated Soundtrack panel.

---

## 🟢 Shipped SESSION 15

`4bc1980` → `c694c69`, four commits, all pushed. One sweep, five defects, all of the same
kind: **a control that renders, invites a press, and does nothing.**

| Commit | What it cost a coach |
|---|---|
| `e691196` | The Dashboard's second hero button navigated to the retired `templates` view. **Blank content area, no back button, no error.** Now starts a fresh class, which is what its label says, with a confirm because the draft is auto-saved. Also retires `onNewSession`, a prop passed and never called. |
| `8881eac` | `LibraryBrowserModal` never called `onAddExercise`, so the studio's 330 movements were **browse-only** — the one reason a coach opens it from the Builder. Each row now has an Add control; the handler returns the STAGE NAME so the toast says where it landed. Also removed "+ New class type", a button with no `onClick` at all. |
| `a768d0e` | The library's ⠿ handle was `cursor:grab` with **no `draggable` and no handlers**. Wired, with the search filter closed off — the rendered index is not the stored index while searching, and writing it back would scramble the gym's catalogue. |
| `c694c69` | An empty schedule slot showed a hover "+" wired to `onMouseEnter`/`onMouseLeave` **and nothing else**, and `setUserClasses` was append-only so **a class could never be removed**. Both closed; the "+" is a real, keyboard-reachable button that pre-fills the day and slot. |

**New guard, and the durable part of this session:** `src/lib/navRoutes.test.js` reads App.jsx the
way `dbConstraints.test.js` reads the migrations and pins the invariant for **every** view —
anything a `setView`/`onNavigate` literal, an enabled nav entry, or the setup checklist can reach
must have a render branch. It asserts the scanner found something first, so a regex that quietly
matches nothing cannot make it vacuously true.

**Why nothing caught these.** `lint:crash` sees valid identifiers. The e2e error-boundary sweep
passes because **nothing throws** — React renders nothing at all, which is not a crash, and the
boundary's calm "Something broke" never appears. "The root has children" is satisfied by the shell.
The a11y sweeps check that a name exists and distinguishes, not that the control *does* anything.
Every guard was asking whether something was **wrong**; these were **absent**.

### Tooling: a fourth AST checker, proven before use

`deadctl` (scratchpad, rebuild it — §8 style) reports three things across all `.jsx`:
dead controls (interactive tag/role, no handler), **fake affordances** (`cursor:pointer`/`grab`
with no handler and no wired ancestor), and props destructured by a component and never referenced.
Proven against a fixture of **6 planted defects and 15 planted non-defects** before its output was
believed — including a wired ancestor, a `{...spread}`, a `draggable`, and a child of a `<button>`.

⚠️ **Its known blind spot, which cost a finding:** `onMouseEnter` satisfies a naive `/^on[A-Z]/`
handler test, so the schedule "+" read as wired. **Hover is not activation.** Split activation
handlers (`onClick`, `onKeyDown`, `onPointerDown`, `onDrop`, …) from passive ones before trusting
it on a fresh file. The remaining reported-but-correct hits are all `<summary>` (natively
interactive) and the mock/flag-gated screens.

### Deliberately NOT fixed, with reasons

- **`AnalyticsScreen`'s Export / Message all / Contact** — three handler-less buttons, but the
  screen only renders under `FLAGS.mockAnalytics`, which is `false`. It is the N2 layout target.
- **The Brand Studio's "Start Class"** in the LIVE PREVIEW pane — sample content by design, and
  labelled as such. It is still a focusable no-op in the a11y tree; making the preview inert
  (`aria-hidden` + `tabIndex={-1}`) is a tidy one-liner for the next a11y pass.
- **The Soundtrack panel's "Match music to structure" toggle** — a `cursor:pointer` pill with no
  handler, permanently ON. Unreachable (`subTab==="music"` needs `FLAGS.music`), but note it is a
  **state flag, not `FLAGS.music`**, so rollup cannot fold that whole panel — the same shape as
  session 14's 21 KB. Gating line ~2287 on `FLAGS.music` is a measurable I9 candidate.
- **`BuilderScreen({ onMoveExercise })`** — threaded from the root, never called. There is no UI to
  move an exercise between stages. Dead prop, or a missing feature; Dylan's call.
- **`LiveScreen`/`DisplayScreen`({ spPaused })** and `DashboardScreen({ onProfile, djProgress })` —
  unused props, music/profile leftovers, zero bytes. Cleanup, not defects.

### Open question for Dylan

**"New class type" in the Exercise Library** — removed rather than half-built. `libraryStore.js`
*would* carry a gym-authored class type (it stores a key the built-in lacks whole), but the
Builder's class-type dropdown and `applyTemplate` read `WORKOUT_LIBRARY` **directly**, so a new
type would appear in that one modal and nowhere else. Wiring it means moving those reads to the
merged library — a real seam, worth doing if a pilot gym runs a class type outside the built-in ten.

---

## 🟢 Shipped SESSION 14

`a10e1d0` → `2046c33`, five commits. Both open decisions closed, and the I9 backlog corrected
twice — once about which candidate wins, once about why.

### DEC-13 — the gym's library was a snapshot that froze at first edit (`363af31`)

Adding one movement wrote the whole catalogue (10 class types, 27 sub-types, 330 exercises,
**59,154 bytes**) to localStorage and upserted it to `library_overrides`. Worse than the payload:
`getLibrary()` merged with `subTypes: {...built, ...saved}`, and because the blob held every class
type, **the gym's snapshot won everywhere** — so no later improvement to `src/data/library.js`
could ever reach a gym that had once pressed Save.

`src/lib/libraryStore.js` stores only what changed, at POOL granularity (one sub-type's
warmup/main/cooldown). Driven through the real modal: **1,082 chars instead of 59,154, −98.2%**.
Then proven end-to-end — with a gym edit already saved, a simulated future catalogue improvement
to an *untouched* pool arrived (CrossFit 39→40, warm-up 5→6) while the gym's own main-set edit
stayed. **Backward compatible**: a v1 blob reads by the old rules verbatim, and the next save
migrates it losslessly (verified: planted v1 blob → v2 at 355 chars, legacy movement intact).

Two things fell out: editing back to the built-in state now **deletes** the row rather than
storing an empty snapshot, and `_RETRY_PUSHERS` no longer upserts `data: null` over a failed
delete.

### DEC-12 — the Builder's back chevron now goes back (`a614bc5`)

It called `onOverviewDisplay`, the same handler as "Preview on TV". Now `onBack`, matching the
ten other screens. The e2e guard asserts both halves — reaches the dashboard, does **not** reach
the TV.

⚠️ The first version of that inverse assertion used `/\d+ stages/` as the Room TV tell and
**failed against correct code**: the Dashboard's resume-building card renders that string too.
The board's real tell is that it is full-screen — no sidebar, only an Esc control.

### I9 — the top-ranked candidate was already free (`5626c9c`)

The backlog said AnalyticsScreen "ships to every device and never renders". **It does not ship.**
`FLAGS` is a module-level const of literals, so rollup folds `FLAGS.mockAnalytics` to false and
drops the branch; none of its strings are in the main chunk before or after.

`React.lazy` was built first and made it **worse** — the dynamic import defeats the folding, so a
13.48 KB chunk got emitted and added to the SW precache (48 files/1366 KB → 49/1379 KB) for a
screen nobody renders. As a plain **static** import the rebuild is byte-identical, same hash, and
App.jsx loses 252 lines. Verified it still renders by flipping the flag on — no test can, since
with the flag off it never mounts.

### The two shortcuts into the cut music subsystem (`c55acc2`, `2046c33`)

See the header block. **S** → Spotify search over the running class; **M** → `getUserMedia`
microphone prompt to duck a null player, plus an AudioContext and a rAF loop analysing room audio
on the gym's tablet. Both guarded at two points each (shortcut + mount/effect).

Measured decomposition of the music mass, by stubbing the barrel and rebuilding rather than
reading source: **UI components 21,153 B · hook+api layer 2,607 B · shared ~5,300 B.** So the
backlog's framing was inverted — it said music "needs a real seam" because `useSpotify` is a hook
that cannot be lazy-loaded, but the hook is 2.5 KB and the 21 KB was plain components behind a
missing guard. **What remains is the small part** (~2.5 KB): `useSpotify()` is still called
unconditionally at `App.jsx:4190`.

⚠️ A grep said mic mode had three visible buttons as well as the shortcut. **Driving the Runner
rendered zero of them** — the shortcut was the only reachable path. The grep inference was wrong
and the UI corrected it.

### Tooling — the three AST scripts are rebuilt, and proven

`scan` / `jsx` / `dead`, `@babel/parser` + `@babel/traverse` via `createRequire`, anchored on
declaration NAMES. **Proven before being trusted**: the JSX checker found a planted
`<PhantomComponent/>` and `<Missing.Deep.Thing/>` in the real App.jsx while `lint:crash` reported
zero — **§6's blind spot is still exactly as documented** — while correctly ignoring a component
named in a line comment, in a JSX comment, in a string, lowercase intrinsics, and
`<React.Fragment>`. Repo is clean on both checks.

⚠️ One tool written this session was **discarded rather than trusted**: a "which source files
reach the bundle" checker based on unique string literals reported `App.jsx` as ABSENT from the
bundle, which is impossible. Its numbers were not used. The reliable method is a genuinely
distinctive marker (`api.spotify.com`) plus a stub-and-rebuild delta.

---

## 🟢 Shipped SESSION 13

`078a55a` → `0e373de`, two commits. Two sweeps, and a correction to a rule the prompt states.

### 🧹 An emoji is text, so twelve buttons passed the name sweep saying nothing (`0e373de`)

Session 12's rule is `named()` — aria-label, aria-labelledby, or non-empty `innerText`. **An emoji
satisfies the third one.** The Exercise Library's edit mode shipped six ✏️/🗑️ pairs, one per
movement, all green: a screen reader announced them "pencil" and "wastebasket", six identical pairs
in one set, one of each pair destructive, with nothing saying WHICH movement was about to go.

Those controls are mounted by pressing **Edit**, so no test in this repo had ever seen them —
§3A's stated gap ("modals and panels that open on interaction") hiding a real defect on its first
inspection.

**Writing the new rule generally found a second defect nobody was looking for.** "A name with no
letter and no digit is not a name", applied across all nine screens, immediately failed the
**Schedule's `‹` / `›` week navigation**. Both now say which way time moves. (§2.4's "ask the
generic question, not the enumerated one", again.)

Two new guards, both mutation-checked: the symbol-only rule per screen, and one that drives INTO
edit mode and additionally requires the delete labels be **distinct** — six identical "Delete"
buttons would satisfy the rule and still leave the coach unable to tell them apart. When the delete
label is removed again, the edit-mode test fails **and the per-screen sweep still passes**, which
is the blind spot recorded as a result rather than as prose. e2e **104 → 114**.

### 🧹 23 dead imports both lint gates are blind to — and a correction (`fc4a82e`)

`no-unused-vars` ignores `/^[A-Z_]/`, so an unused UPPERCASE import is invisible to `lint` AND
`lint:crash`. Parsed every source file (babel, not regex) and found **23 dead bindings across 10
files** — nine in App.jsx alone, including eight lucide icons and `StatCard`, which moved to
`primitives.jsx` in an earlier stage and was never unimported. Every remaining textual hit is a
string ("Sun" in a weekday array, "Upload Logo" on a button), which is how they survived a grep.

⚠️ **CORRECTION to §7.** It says to hunt these down "or the module stays in the chunk". For
tree-shakeable **named** imports that is not true: a clean rebuild after removing all 23 is
**byte-identical, same hashes**. Rollup had already eliminated every one. The rule holds only for
side-effectful or namespace imports. The cleanup buys an accurate reading of what a file depends
on — which is what any extraction leans on — and **zero bytes**.

### 🔎 Found, NOT fixed — the "custom" library blob is a snapshot, not a delta

Driving the Exercise Library end to end (add a custom movement, read back the stored object): the
entry persists correctly, but **`jungle_library_custom` is 59,162 bytes after adding ONE exercise**
— the whole catalogue, all ten class types. `saveLibraryCustom` upserts that same blob to Supabase
`library_overrides` on **every** edit. Two consequences:

- **Payload** — 59 KB to Postgres per keystroke-ish save, the concern `store.js:207` already names
  for personas.
- **The freeze** — `getLibrary()` merges saved over built-in with
  `subTypes:{...WORKOUT_LIBRARY[k].subTypes, ...saved[k].subTypes}`. Because the saved blob contains
  every class type, the gym's snapshot wins **everywhere**, so any future improvement to
  `src/data/library.js` never reaches a gym that has ever pressed Save. "Editable per gym" quietly
  becomes "frozen at first edit".

The fix is a delta format plus a backward-compatible read. It changes what is written to a **synced
table**, so it is flagged rather than done. Natural home is a new `src/lib/libraryStore.js` — which
the `LibraryBrowserModal` extraction wants anyway.

### 🔎 The Team sweep is NOT buildable now — it belongs in the live queue

§3A lists "Sweep: Team/Coaches admin" under *buildable now*. It is not. `AdminTeamScreen` returns
early on `!supabaseEnabled` and renders only *"Team accounts are available on the online version of
Jungle."* Verified by driving the real UI — the invite form, member list and invites list never
mount. **Blocked exactly like Room TV Follow.** The item also conflates two surfaces: "Team"
(`AdminTeamScreen`) is blocked; "Coaches" (`PersonasScreen`) is a different screen and is drivable.

Also corrected: `AdminTeamScreen.jsx` promised `AdminTeamScreen.test.js` guards `TEAM_ROLES`
against the migration enum. **No such file exists.** The guard is real but lives in the
`memberships.role` row of `src/lib/dbConstraints.test.js`; the comment now names the file that does.

### 🛠 Tooling worth rebuilding (§7's two scripts, plus one)

Rebuilt as throwaway node scripts (babel AST, so comments and strings cannot create false hits):
a **scan** that reports for a set of declarations what imports it needs, what same-file
declarations it leans on, and what the rest of the file still uses; a **JSX-resolution** check
(§6 — clean across all 15 source files, and proven to catch a planted `<Phantom/>` and a
`<Missing.Deep.Thing/>` while ignoring one in a comment); and a **dead-import** finder, which is
what produced the 23 above.

⚠️ **`WORKOUT_LIBRARY` is referenced throughout App.jsx** (Builder, class picker, root), so
`src/data/library.js`'s 58 KB stays in the main chunk no matter what happens to
`LibraryBrowserModal`. That kills the largest theoretical I9 win — worth knowing before spending
effort on it.

### 📏 I9 — retarget it. The best candidates are the surfaces that never run.

§3A names Brand Studio, Analytics, Library and Team as the lazy-load list. Measured against what
each actually buys, that ordering is wrong:

| Candidate | Verdict |
|---|---|
| **AnalyticsScreen** (~268 lines) | **Best target.** `FLAGS.mockAnalytics` is **false**, so it is shipped to every device and **never rendered** — pure critical-path waste, the same category as `src/music/*`. It also has **zero App.jsx-local dependencies**: the cleanest extraction on the list. |
| **`src/music/*`** (~22 KB) | Same category (`FLAGS.music` false, never run), but **not trivial**: App.jsx imports `useSpotify`, and a hook cannot be conditionally lazy-loaded. Needs a real seam, not a `React.lazy`. |
| **BrandStudioScreen** (~564 lines) | Real win — it is the sole user of six `colors.js` exports, which would leave with it. Needs `GYM_ARCHETYPES`, `PRESET_SKINS`, `ProgramChip`; `PRESET_SKINS` is used by the root component too, so it wants a shared module rather than moving. |
| **LibraryBrowserModal** (~299 lines) | Weakest. Its 58 KB of data **stays** (above); only the JSX leaves. |
| **AdminTeamScreen** (168 lines) | Near-worthless alone — its imports (`supabase`, `AuthGate`) are already in main, so it would trade ~4 KB for an extra request. |

A component defined inside App.jsx **cannot** be `React.lazy`'d from App.jsx, so the bottom four
each need extracting to a file first. The `Suspense` boundary and `nav()` already handle it.

⚠️ **A concurrent session was committing to this repo during session 13** (`078a55a` is not mine).
Large App.jsx surgery was deliberately deferred rather than raced — two agents rewriting the same
4,700-line file is a conflict nobody wins. Check `git log` before starting stage 5.

---

## 🟢 Shipped SESSION 12

`a3e8b72` → `110fb5d`, five commits. Both DEC-11 decisions built, three surfaces swept, and the
structural change the bundle work was waiting on.

### Both DEC-11 decisions — Dylan answered, both built (`6ad2fd7`)

**Retention rule 1 now requires a join date it actually holds.** The CSV export carries none, so
the rule used to substitute the member's **first imported check-in** and then state "Joined N days
ago" as fact. At n=1 that looks obviously right. At corpus scale it inverted: **9 of 12** members
of an established gym announced as new members failing to build a habit, each citing a date that
was never in the data. Rule 2 has been gated against exactly this since it was written
(`activity.recording`); this is rule 1's equivalent gate. `addMember` always sets `joinedAt`, so
only imported members are affected — precisely the ones whose tenure is unknown.

The instrument is not silenced, it says the true thing instead: **the same 9 members still
surface, now on the absence rule**, on evidence the file carries. And a purely historical import
now flags **nobody**, which is a stronger claim than the old test could make.

**The three Room TV boards wear the gym's brand.** Plan — the DEFAULT board, the one a member sees
walking in — painted a hardcoded `#050705` surround and carried no brand mark at all; Coach's
Timer-Only preset painted `#000` while its other three presets used `var(--bg)`, so switching
preset mid-class went black on the same TV. Both now use brand tokens and Plan gained the mark
Floor already had.

⚠️ **Session 11's fixme mismeasured this**, and the correction matters: it read the first
`position:fixed` element at `zIndex>=500` and **fell back to `document.body`**. Only Plan has one,
so Floor and Coach were both scored on the BODY — a board could have painted itself pure black over
a cream body and passed. Plan's *inner* screen was already `var(--bg)`; the surround and bezel were
the literal ones. The replacement collects every element covering the viewport and requires all of
them to be the gym's own tokens, read from live CSS rather than retyped.

**Found on the same walk:** `BrandLogo`'s monogram tile hardcoded `var(--bg)` as its ink on the
`--accent` fill — the exact dark-theme assumption session 11 removed from `--on-accent` itself,
reintroduced at every placement of the mark. **3.36:1 on the light brand, below AA**, against 5.23.

### 🧹 Three sweeps (`e9c81bd`, `4c6ed57`, `d5ce182`)

| Surface | Result |
|---|---|
| **Member data export (B5 / PDPA)** | **Two omissions.** `externalRef` — the member's id in the gym's previous system, editable and synced — was absent from BOTH exports; in the roster export that is worse than incomplete, since that function exists to be portability and a gym leaving Jungle could not rebuild the link to where it came from. And **the entire `retention_actions` ledger** — the gym's own record of deciding this person was at risk, phoning them, and what the coach wrote down — was not disclosed at all. The export returned what the member DID and omitted what was concluded about them. |
| **Win-back → ledger re-flag cycle** | **Correct, and now driven.** Recorded as plainly as a defect would be. An action suppresses its flag until the member is seen again; the full cycle (flag → "I've reached out" → real check-in through the Class Runner → 20 days → flagged again, ACTIVE) now runs end to end with `page.clock`. The ledger keeps July's action unmutated. |
| **Accessible names, nine screens** | **26 buttons had no accessible name** — every one announced as "button". Now zero, guarded by a test walking the same `SCREENS` list `screens.spec.js` already maintains. |

**The at-risk list was flagging members who had already left.** Both rules asked "is this member
drifting away?" of every roster row without asking whether they were still a member. `cancelled`
members have LEFT — "at risk of leaving" is the screen failing to notice. `paused` members are
absent BY AGREEMENT. Both produced flags the operator could not act on (`winBackBlockedReason`
already refuses a draft for anything but active), and worse, **they outranked real flags**: someone
who left 50 days ago sorts above a current member who lapsed 30 days ago, so the list an owner
reads first was led by people who had already gone. Third gate added, stated as the EXCLUDED set so
a status added later defaults to being monitored, with a test asserting it classifies every value
in `MEMBER_STATUSES`.

⚠️ **Consequence:** `winBackBlockedReason`'s non-null branch no longer has an ordinary path to it.
Its remaining job is a status the vocabulary does not know arriving from a server row —
`_rowToMember` passes status through raw rather than through `memberStatus`.

**The a11y sweep found a functional defect.** The Class Runner's **back button was wired to
`onNextStage`** — the same handler as forward; there was no previous-stage handler in the app at
all. A coach who advanced too early and reached for "back" moved the room ANOTHER stage on,
mid-class. It survived because every control on that surface was icon-only, so **no test could
refer to one** and the Runner's transport had no spec. Naming the controls is what made
`e2e/runner.spec.js` writable, and writing it found this immediately.

**Also flagged, not resolved:** the Builder's top-bar left-chevron calls `onOverviewDisplay` — the
same handler as the "Preview on TV" button 35 lines below — while sitting exactly where every other
screen puts Back. Two controls, one action, one dressed as navigation it does not perform. Labelled
truthfully; whether to drop it or wire it to real back-navigation is a design call (§4).

### 🏗 I6 stage 4 + the I9 win it was gating (`110fb5d`)

**App.jsx 6,349 → 4,965 lines.** The personas cluster moved to
`src/screens/personas/PersonasScreen.jsx` (1,424 lines) and became a **lazy chunk**.

**Main chunk 653.06 → 564.96 KB, plus an 89.21 KB PersonasScreen chunk** fetched only when a coach
opens Coaches. Gzip 183.6 → 157.4 KB.

**Deleting the imports is most of the point.** Seven modules — personas.seed, personaAggregate,
movementTaxonomy, blueprints, generationPresets, slidesImport, planParser — plus `ui/labels.js` are
no longer imported by App.jsx at all. A dead `import` still pulls the module into the chunk, so
leaving those lines would have moved 1,400 lines of source and **not one byte of bundle**.
⚠️ `no-unused-vars` found 27 of them but **does NOT report unused UPPERCASE names** (the rule
ignores `/^[A-Z_]/`), so the constant imports had to be checked by hand. That is the trap.

`uid` moved to `src/lib/ids.js` rather than being copied — two modules each with `_uid = 1` would
both mint `"s1"`, and React reconciling two different stages as the same node is a bug that looks
like state corruption.

**§6's blind spot, closed for this change:** every capitalised JSX element name in App.jsx and all
four screen modules was extracted and checked against that file's imports and local declarations —
**zero unresolved**. That also retired a stale warning in `screens.spec.js`: the
`<SpotifySearchModal/>` phantom it described was removed by stage 3, and only comments mention it.

**The lazy boundary broke one test, honestly.** `personas.spec.js` reads `body.innerText()` raw,
with no auto-waiting, and captured the Suspense fallback. `nav()` in `e2e/helpers.js` now waits for
the fallback's **testid** (not the words "Loading…" — three other screens render exactly that text
and `nav` would hang on whichever was fetching) so no test needs to know which screens are split.

---

## 🟢 Shipped SESSION 11

### §3A — the Schedule/Runner join, closed the honest way

Dylan's call: **yes, the coach starts a class from the Schedule.** So the occurrence is now
**chosen, not inferred** — the match was never loosened.

- A grid cell grows a **Start** button, and only inside the same 4h window the Runner joins on
  (`CLASS_WINDOW_MS`, now one exported constant so the button and the join cannot drift apart).
  At most one or two cells on a whole week qualify.
- `store.startScheduledClass(occ)` returns the row the Schedule published, or publishes it if the
  week never was — **dated to the SLOT, never to when Start was pressed**, so publishing afterwards
  still recognises it instead of writing the same class six minutes later.
- The pinned occurrence's id travels App → LiveScreen → CheckInPanel, and
  `ensureClassInstance({ instanceId })` short-circuits the name match. A banner states the pin
  wherever the coach goes next, with **Unpin**.
- Losing the pin (a reload — it is in-memory) degrades to the name-and-window join, which now
  matches because starting from the Schedule sets `sessionName`. Pinned by a test.

The test that pins the point: publish "S360", start it, **rename the draft to "S360 — Week 4"**,
run it, check somebody in — one occurrence, and the check-in is on the published row.

### 🔴 The Sunday decision, and the second bug it uncovered

Dylan's call: **add Sunday.** `DAYS` and `RULE_DAYS` are both seven days, `occurrencesForWeek`
defaults to all seven, and the day picker offers Sunday — the three consumers that made the old
exclusion self-consistent and therefore invisible.

Then **driving the screen on an actual Sunday found a second, independent defect the day list did
not fix.** `CalendarScreen`'s own week arithmetic was
`base.getDate() - base.getDay() + 1`, which is right six days a week: `getDay()` makes Sunday 0, so
on a Sunday it resolved to **tomorrow** and the Schedule showed **next week**. Today's row was not
on the grid, "This week" named the wrong week, and a Sunday class could not be seen or started on
the one day it runs. It now uses the shared `startOfWeek`/`weekKeyOf`, so the week the grid **draws**
and the week it **publishes** cannot disagree. Guarded by an e2e with the clock fixed to a Sunday.

### Two more found on the same walk

- **The desktop Builder's only start button said "Add to schedule"** while calling
  `onStartSession()` — it starts the runner and touches the Schedule not at all, and the Schedule
  screen has its own real "Add to schedule". Named for what it does.
- **The runner's check-in badge counted the LAST row in `class_instances`**, which is this class
  only by luck: a runner that joins a published occurrence counts against a row written before
  every other class on the week. The panel now hands its occurrence id back on close.
- Mobile: the grid was `DAYS.slice(0,4)` on a phone, silently hiding Fri and Sat — the missing
  Sunday in miniature. All seven columns always render and the grid scrolls sideways instead.
  Verified at 375px: Sunday column reachable and aligned, page body does not scroll horizontally.
- `aria-label` added to the Builder's icon-only rename button, which had no accessible name.

### 🧹 The two never-swept surfaces — both swept, both found something

| Surface | Result |
|---|---|
| **CSV backfill → members → retention** | **Swept, and it found a data-loss defect.** The analysis keyed a class occurrence by `name@YYYY-MM-DD`, so a studio running a **06:00 and an 18:00 class of the same name** had them collapsed into one occurrence — and because 0007 has `unique(class_instance_id, member_id)`, a member who attended both had their second check-in **dropped and reported to the coach as a "duplicate"**. Two real classes, one row. The key now follows the data: minute when the export states a time, day when it does not (`hasTimeOfDay` / `occurrenceKeyOf`), and the apply step matches at the same precision — a day-only index would have handed the evening class's check-ins to the morning one on re-import. |
| **Brand Studio → Room TV** | **Swept, and it found two dark-theme assumptions.** Both invisible until a coach hand-builds a **light** palette, which is what a boutique/wellness studio does — the editor only exposes bg/card/navy/accent/green/text/muted, so a dark skin's other tokens come along unchanged. |

**The CSV sweep is now a permanent test** (`store.test.js`, "SWEEP — a real attendance export, end to end"):
a multi-week corpus through analyse → apply → stored rows → the retention instrument, asserting
15 check-ins / 14 classes / 1 duplicate / 1 unreadable row, referential integrity, idempotence on
re-import, and the derived at-risk list (Ana and Dan correctly clean).
_Session 12 note: that list read `[Cara sev 4, Ben sev 3]` when written. Rule 1's join-date gate
changed it to `[Ben sev 3 absence, Cara sev 2 absence]` — Cara is still surfaced, on the rule the
data can actually support. The test asserts the new values._
It failed five ways before the fix.

**The two brand defects, measured on a light brand** (bg `#fff7f0`, text `#1a1014`):

| Token | Was | Now |
|---|---|---|
| `--on-green` on green `#ff8ab5` | **2.07:1** | **8.47:1** |
| `--on-accent` on accent `#ff2d78` | **3.36:1** (fails AA) | **5.23:1** |
| `--border` on `#fff7f0` | `rgba(255,255,255,.07)` — invisible | `rgba(0,0,0,.07)` |

The contrast rule was `luminance(accent) > 0.18 ? bg : text`, which is right only when `bg` is the
dark one — so it was **choosing the less readable of the two colours it already had**. `inkOn` asks
which actually contrasts more; a test proves it returns the identical answer on 35 generated dark
skins, so no shipped gym changes. The border token is polarity-corrected at apply time (`borderOn`),
a proven no-op on every generated skin — it exists for the hand-edited path, where `border` is not
even an editable field. The Brand Studio's own AA audit now imports `inkOn` instead of carrying its
own copy of the rule, so the badge the coach reads cannot disagree with the runtime.

### ⛔ Two things measured and deliberately NOT fixed — both need Dylan

1. **Rule 1 fires on a join date it does not have.** The CSV export carries no join date, so
   `applyAttendanceImport` leaves `joinedAt: ""` (honest), and `retention.js:91` substitutes the
   member's **first imported check-in** — then the reason line states "Joined N days ago" as fact.
   That substitution is deliberate and pinned by `retention.test.js:68`, and at n=1 it looks right.
   **At corpus scale it inverts:** an established gym importing a short recent export has a roster
   whose every "first visit" is inside the 30-day window. Measured, as a passing test: **9 of 12
   members — three quarters of the roster — flagged as new members failing to build a habit, on day
   one, each asserting a join date that was never in the data.** Rule 2 is explicitly gated against
   exactly this (`activity.recording`); rule 1 has no equivalent gate. Not changed unilaterally
   because it alters what the retention instrument reports.
2. **The three Room TV boards answer "whose background?" three different ways.** Plan
   (`OverviewDisplayScreen`, the **default** mode, the board a member sees walking in) hardcodes
   `#050705` and carries **no brand mark at all**; Floor uses `var(--bg)` with the gym's name and
   monogram; Coach hardcodes `#000`. Measured live: Plan on `rgb(5,7,5)` while Floor on
   `rgb(255,247,240)` for the same gym. Recorded as a `test.fixme` in `display.spec.js` with both
   defensible resolutions written out. Note the ordering constraint — adding the brand mark to Plan
   only works after the background is settled, because `BrandLogo` draws the name in `var(--text)`.

---

## 🟢 Shipped SESSION 10 — `f4449c1` → `e8f450d`, 4 commits + handoff, all pushed

| Commit | What |
|---|---|
| `5e45726` | **§3A — the block label that invented a movement.** `M1 — Deadlift` yielded the label `M1` **and** a phantom exercise "Deadlift", at `confidence: 1`. Over a four-week S360 corpus the derived catalog went **10 movements → 7**; the three removed (Deadlift, Press, Squat) were never on a movement line, and each shadowed the specific movement it came from (Conventional Deadlift, Overhead Press, Back Squat). Also fixed the doubled title ("S360 — S360 — Week 4"). 8 tests; the `it.todo` is gone. |
| `8de5ed1` | **The Floor board's fabricated pacer (open decision #1, decided).** The board members read mid-class ran on invented constants — 45s/15s, 8 rounds, 180s rotation. Interval stages now take their real phase from `calcIntervalState`; every other stage gets an honest steady state with **no round counter at all**. `FLOOR_PACE` is deleted. 8 pinning tests replaced by 11 honest ones. |
| `224b074` | **I10 — delta writes.** Six id-keyed domains now push only changed rows instead of the whole list, so one bad row can no longer fail every other row in its domain. 18 tests. |
| `e8f450d` | **The rep count that made a new movement every week.** `Wall Ball 15` under an AMRAP kept the count welded to the NAME and dropped it as data. Coaches vary rep counts weekly, so **this one scales with the corpus**: four weeks of GC notation with three real movements produced a catalog of **14** (Wall Ball 12/15/18/20, and the same fan-out for Box Jump and Burpees). Now 5. 11 tests. |

### What the method turned up this time

- **The phantom fix had a trap worth keeping**: the separator alone is not the signal. If the
  suffix is the block's **only** movement-shaped content, it IS the movement — dropping it loses
  the only one the coach wrote, which is worse than the phantom. The decision is deferred until
  the rest of the block is read.
- **I10's real risk was invisible until stated**: the full-list push was *accidentally
  self-healing* — a failed row got another chance on every later save, and every
  `_RETRY_PUSHERS` thunk leans on that. A row is therefore marked synced **only on server
  confirmation**, and a test pins exactly that.
- **Writing those tests found a live hole**: `_bgDelete` removed a row server-side but kept its
  fingerprint, so deleting a row and re-adding the same id with identical content would look
  synced and never push. `_bgDelete` now unmarks any id-keyed delete.
- **The Floor spotlight was not merely fabricated, it contradicted data already in hand.** It
  cycled stations every 6s while `liveState.idx` held the stage the class was actually on — the
  FOLLOW badge pointed the room at a station the coach had left.

### 🧹 The three unswept surfaces from §9.5 — two swept, one still unreachable

| Surface | Result |
|---|---|
| **Google Slides import** | **Swept, and it found `e8f450d`.** Every per-function test passed; the COMPOSITION did not. The sweep is now a permanent test in `slidesImport.test.js` that drives a realistic mixed deck (title card, hype quote, two real classes, coach bio) through split → gate → date → parse and asserts on the **stored plans**: both classes kept and the furniture dropped, each filed under its own slide's date, GC's C1/C2/C3 kept as separate stages while S360's A1+A2 folds, and the catalog containing only movements the coach actually wrote. That last assertion is the one that failed. |
| **Share card** | **Swept, clean — no defect.** Driven in the real UI by recording what the canvas actually draws rather than trusting the model. Gym name resolves from branding; 38 min / 4 sections computed correctly; a movement appearing in two stages is listed **once**; 15 movements render as 12 + "+3 more"; "1 section" is correctly singular; an empty class refuses to draw and says why (nothing drawn, no download, no error boundary). |
| **Room TV Follow** | **Not reachable from this machine, and it is not a matter of effort.** `room.js` gates every path on `supabaseEnabled` (`room.js:16`), which is false in the local no-credentials build, so the broadcast no-ops. It needs Supabase **and** two devices — it stays in §3D as Dylan's to verify. |

**Note for whoever sweeps next:** the browser console buffer persists across reloads *and across
dev-server restarts*, so a syntax probe run earlier in a session leaves "Failed to reload" errors
for every importer of the probed file that look current for the rest of the session. Confirm
health against the live DOM (all nine screens, error boundary absent), never the console buffer.

### 📏 I9 — measured, and the premise was wrong

Production bundle attributed via sourcemap (build with dummy `VITE_SUPABASE_*`, then delete
`dist/`). **Do not plan I9 off the 648 KB local number.**

| Share | What |
|---|---|
| **235 KB (27%)** | `src/App.jsx` — one eager file, the single biggest item |
| 177 KB (20%) | `react-dom` — unavoidable |
| **198 KB (23%)** | `@supabase/*` — auth-js 96, realtime-js+phoenix 55, storage-js 22, postgrest 16 |
| 58 KB (7%) | `src/data/library.js` — pure data |
| ~22 KB | `src/music/*` — shipped to every device, never runs (`FLAGS.music` false) |

**The headline finding: App.jsx at 235 KB cannot be `React.lazy`'d while it is one file, so I9's
biggest win is gated behind I6 (decomposition), not on any lazy-loading trick.** The next
cleanest targets are independent of that: `realtime-js` + `phoenix` (55 KB) is used only by
`room.js` for Room TV Follow, and `storage-js` (22 KB) appears to be used by nothing at all.

---

## 🟢 Shipped SESSION 9 — `8037b43` → `9511695`, 9 commits, all pushed

**Every unblocked item on session 9's pending list is done.** What is left in §3A is B3 alone
(D2 on a real deck), which needs decks only Dylan has.

| Commit | What |
|---|---|
| `4852a36` | **B1 — Dashboard cold start.** The four KPIs all derive from the SAME empty array, so a new gym's first screen read "0 · 0.0 · 0 · 0". Replaced pre-data by a three-step checklist. Gates on **sessions**, not on checklist completion — a gym running classes daily but never importing its roster gets its numbers plus one quiet line, never a setup card where its numbers belong. `src/lib/setupProgress.js`, 15 unit + 9 e2e. |
| `f4efa03` | **B5 — member data export.** PDPA access (one member's own record) and portability (the whole roster). RFC 4180 quoting pinned by a **round-trip through the importer's own `parseCsv`**; leading `= + - @` guarded against spreadsheet formula execution; UTF-8 BOM. 39 unit + 6 e2e. |
| `0fee0c1` | **D4 — generation presets.** Five named intents, each a deterministic transformation of the coach's own shape, each stating what it will change **in numbers** before they commit. The rule that keeps it honest: a preset may REORDER a slot's categories, **never ADD one**. 38 unit + 7 e2e. |
| `7adadd1` | **B4 — publish a week.** The Schedule's recurring rules become dated `class_instances`, idempotently on `(name, startsAt)`. "Publish week" returns from the 2.2 audit's dead-button cut, because the table it waited for now exists. 33 unit + 6 e2e. |
| `4720da2` | **B6 — the no-corpus cold start was already built**; now proven by two e2e, and a typo on it fixed ("Add class**s** for S360", three s, on a first-impression screen). |
| `a6e8643` | **Docs — every stale status claim reconciled.** See below; this is the §0 action the prompt asked for. |
| `99c2c67` | **Regression: the runner's `class_instances` row.** Found by driving the whole journey. |
| `701ec59` | **B8 — the colour-only audit** + the number nothing ever set. |
| `aab934f` · `9511695` | **Parser name-pollution fixes** + the Brand Studio preview's honesty. |

### The four defects found by DRIVING, not by reading — the method still works

Every one of these renders perfectly and says the wrong thing. None was visible to a unit test.

1. **"Short class" promised "38 → 25 min" and delivered a class the same length.**
   `draftFromBlueprint` dropped each slot's `minutes` and `planToStages` fell through to a per-role
   default — so **the Minutes field the class shape card has always offered was WRITE-ONLY.** A
   coach setting an 8-minute warm-up silently got the house 5. Fixed at both ends.
2. **The runner's occurrence recorded less of the class than the schedule's.** There are two doors
   into `class_instances`; the runner's wrote `duration_min: null` and `coach_name: ''` on a class
   whose own header said "48:00 total". These rows are permanent.
3. **`fill` is never SET anywhere in the product.** No capacity field, no booking integration — so
   every class on every gym's Dashboard read "0%", and every Schedule cell drew an empty bar reading
   "0%". That says "nobody came", not "we don't know". Removed from both.
4. **The parser welded schemes onto movement NAMES.** "Assault Bike 3x30s" kept every character
   while "Burpee 3x10" beside it cleaned up perfectly (`\b` cannot sit between `0` and `s`), and
   "Conventional Deadlift 4x5 @RPE8" recorded RPE twice — once in the scheme, once in the name. The
   name is the **aggregation key for the entire persona thesis**, so each of these split one
   movement into two and neither half had the coach's full history.

Plus two U1/accessibility leaks: the Builder rendered raw enums (**"warmup · 5:00"**) on the app's
most-used screen, and the **Room TV** — a member-facing surface — left a coloured dot to say which
stage each chip was. `SCFG`'s palette does not even carry that uniquely: **warmup/power,
core/stretch and engine/recovery are each one colour shared by two types.** Documented at the
definition, with the reason widening the palette is not the fix.

### ⛔ ONE DEFECT FOUND AND DELIBERATELY NOT FIXED — take this first if you touch the parser

A block header written **`M1 — Deadlift`** yields the block label `M1` **and a phantom exercise
named "Deadlift"** — so a block the coach wrote with one movement comes back with two, and the
catalog gains a movement that was never on a movement line. Reported at `confidence: 1`.
`slotKey()` in `blueprints.js` already reads that form as *slot M1 plus this week's focus*, so the
two halves of the codebase disagree.

Not fixed here because the fix changes **block segmentation** — the parser's most delicate path,
shared with D2's blueprint-driven resolution — and it cannot be checked against The Garage's real
decks from this machine. **It belongs with B3, where it can be.** Recorded as an `it.todo` in
`planParser.test.js` so it cannot be forgotten. Repro:
`parsePlanText("S360\nM1 — Deadlift\nConventional Deadlift 4x5")`.

Smaller, same area, also unfixed: the plan title comes out **"S360 — S360 — Week 4"** when the deck
header already contains the class type.

### Docs — what was actually wrong, and the durable fix

The audit found the docs stale **in both directions**. Corrected inline with dates: spec §1 (claimed
F4 unbuilt, App.jsx ~8,780 lines), §2/F4 ("Blocked on: approval of migration 0007" — applied
2026-07-18), §2/F1, §2/F5 ("⛔ Blocked on F4"), §7c (**wrong in four places**, now headed SUPERSEDED
BY §12), §9.1, §12; LEGAL §3 / AUDIT 2.4 / REGRESSION §3 #9 (all three listed I5 RLS tests as open —
`supabase/tests/0001_0006_rls_selftest.sql` exists and has been run); UI-UX §2.

**Spec §0 now carries a trust ranking**, headed by the thing that actually fixes this:
**a passing test is the only claim in this repo that cannot go stale silently.** Where this session
could turn a disputed status into an assertion it did.

⚠️ `Jungle - Delta & Backlog Breakdown.md` is **gitignored** — its HISTORICAL marker is local-only.
The spec's §0 table carries the same warning in a tracked file.

### Verified in the running app, not just in tests
All nine screens at 1280 and 375 (no error boundary, **zero horizontal overflow anywhere**); the
More sheet and every destination behind it; publish-week and the roster export on a phone; the
check-in chain's member → attendance → occurrence links; the paste-deck path **working offline**
(the deterministic parser handles it with Supabase off — worth knowing).

### Still true, still worth knowing
- **`lint:crash` cannot see undefined JSX components.** Unchanged. It *does* catch a JSX parse
  error — I made the same one twice this session (a `{/* comment */}` as the first child inside
  `&& ( … )`) and the gate caught it both times.
- **B7 (ENERGY CURVE truncation) is MOOT** — verified: it lives inside `subTab === "music"`,
  reachable only when `FLAGS.music` is true. Also: that curve is a **hardcoded decorative SVG,
  identical for every class**, under a label reading "peak intensity". Theatre, if music ever
  un-quarantines.
- **The Floor board's fabricated pacer is still Dylan's call** (SESSION-9-PROMPT §4 item 3).

### Suggested order for session 10

1. **Anything Dylan has unblocked** — `SESSION-9-PROMPT.md` §3C is still the live list.
   **N4** (member magic-link) is the highest-value item in the product and needs an Edge Function;
   **OPS: Supabase Pro + a restore drill** is Day 1 and the free tier has no backups.
2. **B3 — D2 on a real deck**, *with* the `M1 — Deadlift` segmentation fix above. They are the same
   piece of work and neither should ship without the other.
3. **I10 delta writes** — AUDIT 3.2 wants this before gym #2; it is why one bad row once poisoned
   every plan. Unblocked, and the only §3B item that is about data loss rather than tidiness.
4. **I9 code splitting** — the bundle is **648 KB and still growing**, loaded by a TV on gym Wi-Fi,
   with no `React.lazy` anywhere.
5. Otherwise keep driving flows and reading back stored objects. It found four defects today and
   has now found every defect in sessions 3–9.

---

## 🟢 Shipped SESSION 8 — `4cfaa16` → (latest), pushed, all gates green

**P2 (the 10-foot rule) is DONE and is the headline.** Plus a closed constrained-column audit and
the first unit coverage of the Runner's interval math.

| Commit | What |
|---|---|
| `689abf7` | **P2 — the 10-foot rule.** Every member-facing display size (Overview / Floor / Coach) now keyed to viewport **height** via `tvFont(basePx, mult)` — a `clamp(floor, Nvh, cap)` whose vh term reproduces `basePx` **exactly at 1080p** (no regression to the tuned look) and grows ~2× on 4K, holding the same fraction of the wall. Fixes the real gap: fixed px made a "92px" timer 8.5% of a 1080p wall but ~4.3% of 4K. The Floor board's phase timer was a fixed 84px — 7.8% at 1080p, already under the §3 floor — now `tvFont(96)` → ~8.9%. Regression `e2e/display.spec.js` drives the real Room TV (Coach + Floor) at 1920×1080 **and** 3840×2160, measures the primary element's height fraction, asserts 8–12% + viewport-invariance. **Mutation-verified** (px timer fails 4K + invariance, passes 1080p). |
| `60a3f3c` | **Constrained-column audit closed (the handoff's open "is there a fifth?" question).** Three columns the client writes and syncs — `persona_plans.source`, `coach_personas.kind`, `class_schedule_rules.repeat` — were wrongly in the test's "not yet written" list. **No illegal value reaches the DB today** (dropdowns only offer legal values; `planSource` normalises), so no live loss — but unguarded synced columns are the 2026-07-18 incident's shape. All three now pinned in `store.js` constants the producing UI shares, checked against the migrations. Mutation-verified. |
| `a40cef1` | **P2 regression extended to the Floor board** (the surface members read mid-class) at both resolutions. |
| `6f278fb` | **Interval sub-timer math covered.** `calcIntervalState` (Tabata/EMOM) extracted from App.jsx to `src/lib/intervalTimer.js` and pinned with **18 exact-value tests** — the spec's named "timer/stage math" gap. Mutation-verified. |
| `5dab0ae` | **e2e wiring guard** — the coach display renders a live Tabata overlay (WORK · Round 1 of 8 · 20s on / 10s off), a path no other test reaches. |
| `503c534` | **Floor-board ambient pacer extracted** to `floorPacer()` (verbatim) + 8 tests. Behaviour unchanged; gives the flagged "fabricated pacer" decision a clean, covered seam. 431 unit. |
| `e4ab933` | **D2 — blueprint-driven parsing** (spec §9/§12's "main build ahead"; the open half of §4.3.2). The coach's own class shape now resolves block roles the parser previously guessed, and vetoes the same-letter superset fold when the blueprint declares a sequence — the `C1/C2/C3` case that collapsed a whole class into one block. Applied AFTER the slide's explicit words and BEFORE the structural fallbacks; resolves only, never invents. Wired at both call sites; `stats.blueprint` makes its contribution measurable. 9 tests, both mechanisms mutation-verified. **440 unit.** ⚠️ Verified on fixtures, NOT yet on a real deck — and note AUDIT 2.4 ranked this "defer until after pilot" while §9/§12 called it the main build (see SESSION-9-PROMPT §4). |

App.jsx unchanged in size to speak of (P2 was in-place edits; `calcIntervalState` extraction is ~−20 lines).

### Verified in the running app (not just tests)
- P2 stress-checked at **375px, 1080p, 3840×2160** on all three display surfaces: **no horizontal
  overflow, no error boundary**, primary always ~8–9% of height (72px mobile → 96px 1080p → 192px 4K).
- The constant-driven controls render: coach-kind dropdown (Coach/House style/Class format) and the
  Calendar repeat control (This week/Weekly/Every day).
- The interval overlay renders correct WORK/round/cadence for a real Tabata stage.

### Findings NOT acted on (judgement calls / for a decision)
- **FloorLiveScreen's phase pacer is a hardcoded 45s-work/15s-rest, 8-round loop** unrelated to the
  coach's actual plan. For a non-interval class (e.g. a strength block) the room sees a WORK/REST
  countdown and round counter that are **fabricated** — arguably the same member-facing-honesty
  problem as the "No tracks"/"coming soon" leaks that were cut. Making it honest is a floor-board
  redesign, not a bug fix, so it's **Dylan's call — spawned as a task chip**. The maths is now
  extracted to `floorPacer()` (tested, verbatim), so whichever way the decision lands it has a
  clean seam: for interval stages, feed it `calcIntervalState`'s phase; otherwise show a neutral
  honest state instead of the fake round counter.
- **FloorLiveScreen empty state** ("Build a class in the Class Builder") is a coach-directed
  instruction facing the room, but only in the zero-stage edge a live class never hits. Low value.
- The Runner's per-stage **auto-advance tick** (App.jsx ~5640) is still component-embedded and
  unit-uncovered. Deliberately left: it is 6 lines of demonstrably-correct logic inside the class's
  single most critical loop, and the e2e smoke exercises it end-to-end — a poor risk/reward to rewire.
- **Dylan's queue is unchanged.** The dead symbols (`nudgeForContrast`, `resolveSubBrand`,
  `SLOT_LABELS`, `fetchBpmData`) still await his yes/no — not deleted unilaterally. N4 still blocked
  on the Edge Function. `eslint-plugin-react` still his call.

---

### (prior) Session-7 pointer
> Session 7 shipped stage-3 music quarantine (`e291c35`), the dead-LoginScreen deletion (`ded748c`)
> and I13 background retry (`3eb70f4`). `SESSION-8-PROMPT.md` supersedes `SESSION-7-PROMPT.md`.
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

**All seven days of `docs/WEEK-PLAN.md`, except the half of N4 that needs an Edge Function.**
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
- `docs/SPEC-PATCHES.md` not yet applied to the as-built spec.
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

> ### 👉 STARTING A NEW SESSION? Read `SESSION-20-PROMPT.md`.
> _(This line used to point at `NEXT-SESSION-PROMPT.md`, which was the **session 5** prompt from
> 2026-07-19 and fifteen sessions stale. It is now `docs/history/NEXT-SESSION-PROMPT-session5.md`.
> Everything below this line is a historical record of session 4 and is kept for its findings, not
> its instructions.)_
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

**⭐ RECOMMENDED NEXT** _(as of session 4 — historical; the live list is `SESSION-20-PROMPT.md` §10)_:
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

---

_Blocks arrive here one per session, newest first, as `SESSION-HANDOFF.md` is kept to its two
most recent. Session 19's arrived in session 21 and was appended below this line rather than
placed in order; session 22 moved it up to sit under session 20, where the ordering says it
goes. Nothing was edited on the way._

---

