# Jungle — Session Handoff

_Last updated: 2026-08-04 (session 25)_

> 📁 **Sessions 6–23 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 25 — the banner that could not be cleared, two sweeps, and the first undo

> **Gates green.** `lint:crash` **0** · **809 unit** (28 files, no todos) · **381 e2e**
> (35 spec files, no fixmes) · `deadctl` **0 suspect / 73 files** · five-chunk build:
> member path **211.49 KB**, staff **557.10 KB** (StaffApp **346.92/360 KB**, the tightest
> budget in the repo). App.jsx **3,608 lines** (was 3,513). Last commit **`b74cfe3`**.

**The brief had four parts in order: regression depth, remove what is awkward, UI polish with no
new surfaces, then keep going.** Depth and the awkward parts landed. Polish is where 26 starts.

### The banner Dylan asked to delete was telling the truth — and was still bad UI

The four domains it names are **exactly** the tables created by migrations `0005` and `0006`,
and no others. That pattern rules out both cheaper explanations. It is not RLS: `0003`'s
`library_overrides` and `brand_profiles` carry the *identical* write predicate
(`is_platform_admin() or is_gym_admin(gym_id)`) and are not in the ledger, so `is_gym_admin()`
returns true for this user — and `0006`'s `persona_generations` uses a **looser** member-level
policy and still fails. It is not a CHECK constraint: that is per-column and per-table, and this
is four tables at once. What is left is that **the tables are not there**; `0005`'s header still
reads "DRAFT — not yet applied". **Running 0005 and 0006 is Dylan's five-minute action, and the
banner clearing itself is the proof.**

All four of its actual defects are fixed: **Try now** (wired to the `_retryNow({force:true})`
that already existed and had no button), the exact Postgres string in a `<details>`,
"last tried 2 min ago · 14 failed attempts" from the `at`/`attempts` the ledger already stored,
copy and colour that **escalate** past five attempts, and a dismiss keyed on a signature of
table+message.

🔴 **The signature deliberately excludes `at` and `attempts`.** Every failed retry rewrites
both, so a signature including either would resurrect a dismissed banner within 30 seconds and
make the button a lie. A new table, or the same table with a new message, always returns. There
is no "never show again".

### Two defects found while diagnosing, both invisible locally

🔴 **A ledger entry nothing could clear.** `_bgUpsertDelta` makes no request when there is no
delta, and `_clearSyncError` only runs after a *successful* request — so once a table's rows
were confirmed or deleted following a failure, the entry became immortal. The banner named a
domain with nothing left to send, forever, and no coach action could clear it. A warning that
cannot be resolved stops being read as a warning. `_clearLedgerIfSettled` closes it: an empty
delta means every local row carries a server-confirmed fingerprint, so a ledger entry claiming
otherwise is provably stale.

🔴 **`restorePersonaCascade`.** Undoing a coach delete cannot just re-save the four lists.
`deletePersona` removes only the `coach_personas` row server-side; plans, movements and
generations go via **ON DELETE CASCADE** — no client call, so no `_unmark`, so their delta marks
survive, so a re-save computes an **empty delta and pushes nothing**. The coach sees their whole
corpus restored on this device while the server stays empty, and the next server-wins hydrate
takes it away for good. Every local assertion passes through all of that; the only way to see it
is to ask what the next push would send, which is what the unit test does.

### Two sweeps, each with a positive control and each proven able to fail

**§1.1 responsive** — 9 screens × 390/768/1280, fresh render at each width. Two rules kept
separate: the page must not scroll sideways, and no leaf element may cut text off without an
ellipsis. The per-element spill list is a *diagnostic* on the first rule, not a rule — an element
wider than the viewport is legitimate inside a container built to scroll, and failing those would
make the sweep noisy enough to be switched off.

**§1.2 keyboard** — every visible control reachable by Tab, focus never lost to `<body>` before
the screen is walked. Where a dialog is open the expected set scopes to inside it, turning
"everything is reachable" into an assertion that the trap works.

`ALL_SCREENS` + `navAnyWidth` in `helpers.js` hold all three nav vocabularies (sidebar "Class
Builder" / sheet "Builder" / bar "Build"), and `responsive.spec.js` **checks that list against
the running app's sidebar in both directions** — a hand-written list of screens is exactly the
thing that silently stops matching.

### One toast primitive, and the first undo in the product

§2.1 was accurate: deleting a coach took their corpus, catalogue and generation ledger on one
unguarded click, while deleting a **single exercise** asked "are you sure?". The protection was
inverted, and the thing it failed to protect is the most expensive data in the product.

`src/ui/toast.jsx` — one provider at the staff root, `role="status"` + `aria-live="polite"`,
region **always mounted** (a live region inserted at the same moment as its text is frequently
not announced), 9s for undoable toasts vs 2.5s for plain, and `pointerEvents:none` on the empty
region so it cannot eat taps meant for the bottom bar. The coach delete gets **both** a confirm
and an undo; removing a plan gets undo only.

### Then it kept going: the plan editor, and a hit area a thumb can find

**§3.1 (half).** The plan editor held 35 buttons and 82 fields of local state and had four ways
out — backdrop, Escape, ✕, Cancel — all of which discarded it in silence. It now hands the draft
back through the undo toast, guarded on `dirty` so an untouched open stays instant. **The Builder
is still unguarded and is the bigger of the two.**

**§3.4, plus a real defect underneath it.** `@keyframes spin` lived in `src/App.css`, which
**nothing imports** — `main.jsx` imports `index.css` and only that. Six Loader spinners were
frozen, four of them on the app's slowest network paths, where a still icon and a hung app look
identical. Tap targets: 100 of 186 visible controls were under 44px at 390px; `data-tap` lays a
transparent 44px pseudo-element over the thumb-critical ones so the hit area grows and the
rendering does not.

🔴 **The tap sweep hit-tests the running page rather than measuring rectangles**, because the two
ways the overlay silently dies — an `overflow:hidden` ancestor clipping it, a neighbour's overlay
painting over it — both leave the measured box exactly as it was. A rect-based sweep reports a
false pass on a target that is dead to a thumb. Only the marked controls are proven; **the ~90
unmarked ones are a judgement call, not a backlog item** — marking adjacent controls closer than
44px apart just makes them steal from each other.

### Traps this session paid for

- 🔴 **`blur()` does not reset the tab order.** Chromium keeps a *sequential focus navigation
  starting point* that survives a blur. `document.body.setAttribute("tabindex","-1");
  document.body.focus();` is what resets it. The first keyboard sweep failed on six screens for
  this reason **and the app was correct every time**.
- 🔴 **`nav()` leaves focus on the button it clicked**, so any tab-order test starts halfway down.
- ⚠️ **The Edit tool converts `\uXXXX` in its arguments into real control characters.** Writing a
  literal escape into source needs a guarded one-shot `.mjs`.
- ⚠️ **Screenshots fail unless the Browser pane is displayed.** Geometry reads via
  `javascript_tool` caught the toast's 15px clearance over the bottom bar and the
  "1 class plan, 11 movements" copy defect that all 367 tests passed.
- ⚠️ **`_bgDelete` records no sync error** — a failed DELETE reaches only `console.warn`, never
  the ledger, so it is never retried and never shown. Same class of bug the ledger exists for, in
  the one path never wired to it. **Not fixed**; it needs a decision about what retrying a delete
  means with no local tombstone.
- 🔴 **Never put `git status` and `git add -A` in one shell command.** The status scrolls past
  unread and `-A` sweeps up whatever else is in the tree. It happened here: a commit about the
  plan editor swallowed the entire tap-target body of work plus a throwaway probe spec. Caught
  before pushing and split into `5525f2e` + `b74cfe3`, but only because the file list was checked
  afterwards. **Read the status, then stage explicit paths.**
- ⚠️ **A `*.spec.js` scratch file in `e2e/` runs in CI** — there is no `testMatch` narrowing.
- ⚠️ **`overflow:hidden` clips a `::after` hit-area overlay** back to the visible box, with no
  change to the measured rectangle — it looks exactly like the fix working.

### Eight mutation proofs, all reverted with the inverse edit

The settle step, the signature's blindness to `at`, the null-timestamp guard, the dismissal key,
a 1400px min-width (1010px of sideways scroll), a 12px nowrap container ("53px of text in 20px —
HOME"), `tabIndex={-1}` on the nav (9 of 17 unreachable), an `onFocus` that blurs (0 of 17), the
cascade unmarking, and the coach-delete confirm. One of them caught a real bug before it shipped:
`fmtAgo(null)` rendered **"19675 days ago"**, because `Number(null)` is 0, not NaN.

---

## Session 24 — a delete that never worked, a day that was not a day, and a fourth reader

> **Gates green.** `lint:crash` **0** · **784 unit** (28 files, no todos) · **307 e2e**
> (31 spec files, no fixmes) · five-chunk build: index **204.50 KB** (byte-identical — the
> member path is untouched) + StaffApp **340.43 KB** + PersonasScreen **93.35 KB** +
> ClassSummary **5.81 KB** + summaryApi **0.85 KB**. App.jsx **3,513 lines** (unchanged).
>
> **The local backlog is empty at the end of this session** — see "What is left, honestly".
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

### 🔴 4. The movements a coach edited and stopped using — `b03dd45`

The other half of §1, and what made removing that delete a clean trade rather than a loss.

`aggregateMovements` keeps a zero-occurrence row when it carries a manual edit — **and a
DERIVED equip counts, so most rows qualify** — so a coach who drops a movement from a plan
keeps the equipment, kind, aliases and cue they set on it. Correct. But `ctMoves` renders only
rows WITH occurrences, so those kept rows were **invisible and unreachable**: they accumulated
locally and synced to Postgres with no way to see or remove them, and the coach's own edits
became cruft they could not reach.

They are also the **only** rows where deleting means anything, because nothing re-derives them.
So `store.deletePersonaMovement` returns — **conditional**, with the condition written above it,
since calling it on a row with occurrences reintroduces the original bug and it looks fixed
until you touch something else. Its one caller is a new persona-scoped **"Not in any plan"**
card, outside the Movements card and read-only apart from delete: a zero-occurrence row belongs
to no class type, so filing it under the current tab would be a fiction.

The state is reachable by ordinary use, so no synthetic fixture was needed — **which retired
the warning drafted for it** ("build the fixture first, the sample coach has none"); the fixture
already existed as a test from `b018f6d`.

🔴 **Rendering it at 1280px and 390px caught two copy defects no assertion would have:** the
explainer built a possessive out of the persona name (*"No plan of Example Coach — The Garage's
uses them now"*), and the per-row line restated the card's own heading instead of naming what
deleting would cost. **Look at the screen, not only at the assertions about it.**

### 5. `deadctl` decides the FLAGS question instead of asking you to — `4112f8c`

🔴 **The premise was wrong, which the work found immediately.** The recorded item said all four
suspects "sit inside `FLAGS.mockAnalytics ? [...] : []`". **Only one does.** AnalyticsScreen has
no FLAGS reference outside its header comment — its three buttons are gated CROSS-FILE by
App.jsx. A lexical check would have suppressed one, left three, and looked like it worked.

Three mechanisms: lexical branches, a list a flag empties and then `.map`s, and a component
whose every render site is dead. Everything else still over-reports, and an unreadable
`flags.js` makes it say so and report all four — a suppressor that fails silently is worse than
a noisy report. Flipping `mockAnalytics` moves **seven** findings in **both** directions, which
is the control a blanket suppressor cannot pass.

### 6. Repeat-avoidance is driven at last, and it works — `8704985`

Not broken; uncovered. 🔴 **The sample coach has eleven movements and its shape consumes exactly
eleven**, so with zero slack two drafts are byte-identical whatever the ledger says — a test on
that fixture passes against a completely broken implementation. ⚠️ And seeding a second plan
into `localStorage` was not enough: the catalogue re-derives only on a plan COMMIT, so the probe
measured nothing and passed. The fixture now forces the recompute and asserts the catalogue grew
first. 🔴 Avoidance is **per preset** — only "Something different" avoids; "the usual" repeating
IS the feature.

### 7. `BrandStudioScreen` measured, and declined — no commit

Stubbing its body gives StaffApp 340.43 → 315.70 KB: **24.73 KB raw, 5.89 KB gzip**. Members
gain zero (not on their path); installed staff gain zero and pay an extra request, because
`build-sw` precaches every chunk; only a staff first visit gains, 5.89 KB of ~783 KB. The repo
split `PersonasScreen` at **93.35 KB** — 3.8× larger. **Not every look ends in a change.**

### 8. A size guard, and two pieces of repo hygiene — `76b800c`

Nothing failed on bundle growth before this, and re-measuring found it had already happened:
the **member path was 206.69 kB at session 19 and is 213.13 kB now.** `npm run size` fails the
build past a ceiling, and CI runs it `--prod` after the build.

🔴 **The trap it had to survive is one §4.2 states in prose and prose cannot enforce.** A
credential-less build and a prod-shaped one are DIFFERENT builds — StaffApp is **340.43 kB**
local and **581.02 kB** in CI, because without `VITE_SUPABASE_*` rollup drops the whole
`@supabase` client. So there are two budget sets and the mode is **asserted, not assumed**:
`GoTrueClient` only survives when the client is really bundled, so passing the wrong flag exits
2 instead of passing against numbers that do not describe the build. It also exits 2 on an empty
`dist/assets` — a guard that measured nothing looks exactly like one that passed.

Sizes use **kB = 1000**, matching vite and therefore every figure in these docs. The first
version used KiB and disagreed with the handoff by 2.4%, which is how someone eventually
corrects the wrong number.

Also: `.gitignore` only ignored `*.local`, so `.env` or `.env.production` would have sailed past
it **on a public repo**; and `.github/dependabot.yml` now runs weekly, grouped, React majors
excluded. ⚠️ **Dependabot opened 6 PRs immediately and none are merged** — `actions/setup-node
4 → 7` is a major bump that could break CI, and the React ones touch the toolchain.

**Checked and deliberately NOT changed:** the token-core drift guard is sound. A one-character
edit to a mirrored Edge Function copy fails `classToken.mirror.test.js`, and importing
`sync-token-core.mjs` does not repair what it inspects — `main()` runs only as a command.
Verified by introducing real drift and confirming the file was still mutated afterwards.

### Design decisions worth not re-litigating

- **The catalogue states membership, it does not offer deletion** — except on the one list where
  deleting is true. Same reason as the Smart Recommendation and the Builder's scheduled-type
  notice: stating beats silently applying.
- **"Days ago" is a calendar count.** The datum is a date; the reader is a human with a calendar.
- **A rename carries the ledger; a MOVE does not.** Identical rule to the style profile, and it
  is now literally the same function call.
- **Reopen is a read.** It must never append to the ledger.
- **A zero-occurrence row is kept, not purged.** The coach's edits outlive the plan that used
  the movement; letting go of them is their call, not a cleanup's.
- **`deadctl` over-reports by default** and suppresses only what a literal flag decides. If it
  cannot read the flags it says so and reports everything.
- **Repeat-avoidance is a per-preset preference, not a global filter.**
- **`BrandStudioScreen` stays in App.jsx**, on measured numbers rather than taste.

### What is left, honestly

**Locally: nothing.** Every item this session opened with is closed, structural debt has been
empty for nine sessions, `deadctl` and `dead` both report 0, and there are no TODOs or skipped
tests in the tree.

What remains is not code: **`DYLAN-QUEUE.md` Part A**, and A7 above all — the Slides import is
the feature the whole pitch rests on and has never met a real deck.

**Two undriven surfaces remain, both re-verified against `e2e/` at the end of this session** —
grep them again before believing this, but they were real when written:

1. **The movement editor's equipment / category / alias save.** `changeMovement` is now driven
   for `notes` and for the rename-merge path; the equipment chips, the category chips and the
   alias field are typed into by nothing. Four `e2e` matches for "Equipment"/"Aliases" are all
   comments or assertions about the DERIVED value.
2. **Cold start → rename.** `coldstart.spec.js` fills a class-type name twice and never renames
   one, so §1c's rename has never run against a **preset-sourced** blueprint — the one shape
   where `blueprints[ct]` was written by `startClassTypeFromPreset` rather than by the coach.

⚠️ **And 6 unmerged Dependabot PRs**, opened by this session's own change. They are the only
open items with a clock on them.

---
