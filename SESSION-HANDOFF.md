# Jungle — Session Handoff

_Last updated: 2026-07-30 (session 22)_

> 📁 **Sessions 6–20 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

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
