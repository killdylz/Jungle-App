# Jungle — Session Handoff

_Last updated: 2026-07-28 (session 21)_

> 📁 **Sessions 6–18 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

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
