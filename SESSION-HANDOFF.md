# Jungle — Session Handoff

_Last updated: 2026-09-27 (session 42)_

> 📁 **Sessions 6–40 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 42 — four skips that were the instrument, and a covered class credited to the coach who was away

> Written in full to `SESSION-42-HANDOFF.md`; this is that file, filed here per the two-block rule.

_2026-09-27. Branch `claude/bold-babbage-r8gz1o` (the branch this environment assigned), based on
`claude/relaxed-knuth-s6p32q` (PR #20). **PRs #15–#20 were all still open**, `main` was still
`7508de1`, none was closed unmerged. All six conversations were read through the GitHub MCP tools:
**#15–#19 have no comments and no reviews**; #20 has session 41's own two comments about the
auto-PR fix and nothing else. That is §0.1's second row. Eight commits ahead._

Position confirmed by gate, not by log: `npm test` reported **1328 unit (50 files)** and
`npx playwright test --list` **624 in 53 files** at the branch point, exactly as the brief said.

> **Gates at HEAD.** `lint:crash` **0** · **1344 unit** (50 files) · **629 e2e in 53 spec files**, one clean
> full run on a quiet machine (**16.1m**) · build ok · `npm run size` **0 over budget** (StaffApp
> **335.46 / 360 kB**, PTScreens **39.42 / 41**) · `node scripts/audit-store-writers.mjs` exit 0,
> 0 unexplained. **The branch point was green too: 624 passed (16.1m), measured on a quiet machine
> before anything else ran.**

---

## 1 · What shipped, per commit

Every commit landed with a test that fails when the change is reverted. Each mutation was made in
the source, run red, and restored (by the inverse edit or a copy of the file taken just before),
with `grep -rn MUTATION src e2e` clean before the commit.

### 1.1 `18fa2e6` — §3.1: the sweep skipped four 1:1 controls because a reload forgot a choice

**Diagnosis.** None of the brief's three candidates, exactly. "Add client" reveals a client card
only because the press **before** it chose a member in the picker. Choosing an option writes
nothing, so it leaves no dirt. But every child of a descent is reached by `reopen`, which
reinstalls the gym. The reload puts the picker back on "Choose someone…", so "Add client" answers
"Pick a member first." and reveals nothing, and all four children were skipped.

NAME_OF contributed a second fault: a `<select>` was named by its options run together, so the
picker was "Choose someone… Raj Kumar Tom Wallace" before the add and "Choose someone… Tom
Wallace" after it. It was the same control under a new name, so the sweep counted it as revealed.

**Fix.** `reopen` replays the select choices in effect when the descent started (`prelude`). Only
select choices: they are the one kind of press that carries state without dirtying anything. A
select is named by its `<label>` (`textContent`, because CSS uppercases the rendered label).
`EXPECT_WALKED.pt` names the three children.

**Honest scope.** The same three controls were already being pressed on Sarah's and Ana's cards.
This recovers a PATH (a client added a moment ago), not a control type nobody had pressed.

1:1 Clients **pressed 23 → 26, skipped 4 → 0**; every other screen unchanged. Mutation
`replay([])` → "pressed 23 · skipped 3", red.

### 1.2 `a049956` — §3.4: "Brand Studio · 1 pressed with force" was a press that delivered no event

**The control is "Start Class"**, at the foot of Brand Studio's live preview. It is a real
`<button>` inside a container marked `inert` on purpose (it is a picture of the gym's app).
Playwright's click fails with "`<div>` intercepts pointer events". The sweep's cover check
accepted `hit.contains(el)`, an **ancestor** at the control's centre, as "the control itself",
so it forced. **Measured: the forced click delivered no click event at all.**

So it was **not** the honest case §3.4 describes. It was a press that did not happen, recorded as
one that did: session 40's §4.1 one layer out. It was harmless to a gym (the button does nothing
by design), but it is the instrument overstating its own coverage.

**Fix.** CANDIDATES skips `[inert]`. An ancestor at the centre is now an obstruction, not the
control. The report names every forced press instead of counting them. `EXPECT_UNPRESSED` says
"Start Class" must never be recorded. Brand Studio 31 → 30. The full sweep now reports **no
forced presses anywhere**. Mutation: either guard alone removed leaves the other holding; both
removed → "1 pressed with force (Start Class)", red.

### 1.3 `a666368` — the 1:1 picker offered a member who had left as if they were current

Found by §3.1's probe. `availableMembers` offers every roster row without a 1:1 record, and the
option was the bare name. "Tom Wallace" had **Left**. Now "Tom Wallace (Left)" / "Ana Ferreira
(Paused)". The member is still addable (a returning member is who a 1:1 often starts with), and
this follows CheckInPanel's rule: reachable, but labelled. Mutation → red on the label.
`pt.spec.js` 30 passed.

### 1.4 `ad629b5` — an import made two members of one person when only some rows had an email

`Sarah Chen,sarah@…` and `Sarah Chen,` in one file → **"3 new members" for two people**, each
holding half the history. An email-less row matched a ROSTER member by name, but not a NEW member
the same file had introduced, whose key was their email. Now an email-less row takes the email
the file gives that exact name, **only when the file gives exactly one** (two emails under one
name stay two people, as before). Four unit tests + one driven e2e. Two mutations, both red.

### 1.5 `3b88bf5` — a cover agreed after the week was published never reached the published class

See §4.1. `diffOccurrences` gains `retag`: a **future** row whose coach differs from the
cover-applied occurrence, and never a blank replacing a name. `publishOccurrences` applies it; the
button counts it ("Publish week · 1"); `describePublish` says so. `startScheduledClass` takes the
named coach onto the row it starts. Five unit tests + one driven e2e; two mutations, both red.
unit 1339 at this commit.

### 1.6 `fe6a883` — two Coaches controls behind a closed `<details>` had never been pressed

The sweep reported "skipped 2: Generate draft › BUTTON (still covered)" on every run. Those two
are **"Generate in style"** and **"Draft from recent"**, inside the "…or write a brief"
`<details>` that "Generate draft" reveals. Chromium gives closed-details content a layout box, so
the sweep counted them as on screen. `innerText` is empty, so they were named by tag, and no
click can land. `summary` was never a candidate, so nothing ever opened them.

CANDIDATES now includes `summary` and drops anything `checkVisibility()` says is not rendered. A
child that is a `<summary>` queues what it reveals as further children, reached by reopening the
parent and opening the same summaries (`via`). This is the one named exception to "one level
down". **Both are now pressed, and both are guarded** (undoable). Coaches 158 → 161, skipped
2 → 0. `EXPECT_NO_SKIPS` makes a skip a failure on 1:1 Clients and Coaches. Three mutations, all
red.

### 1.7 `31ce506` — a week after an absence, "still has nobody" and a button that erased the record

See §4.2. Requests are now split at today (`absenceProgress` / `describeAbsenceProgress`), with
the past said in the past tense. A finished absence with a record shows "· ended" and no "I'm
back". `cancelAbsence` withdraws only asks whose day has not passed. Two existing tests raised
covers on a fixed August clock and cancelled on the real one; they now pass the same clock to the
cancel. That states their scenario and does not loosen an assertion. Three mutations, all red.
unit 1344.

### 1.8 `c17b30c` — the coach roster's header left out every coach who teaches no regular class

"1 named · 0 with an account" sat above two coaches. It counted schedule names that resolve to the
roster, so a sub (the person cover is for) was in neither number. It now reads "2 on the roster ·
1 with an account". Mutation (the old computation) → red. The commit message first said
"26 passed" for a run of 25; amended before anyone could have pulled it (my own branch).

---

## 2 · What is still red, and why

**Nothing.** Branch point: **624 passed (16.1m)** on a quiet machine, the first thing run, with
nothing else on the CPU. HEAD: **629 passed (16.1m)**, same conditions, with every probe spec
deleted first. No flake was seen in either full run. `destructive.spec.js:526` (§4.2 item 6)
passed both times, so there is no new information there.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved. `DYLAN-QUEUE.md` (A20 and A21 unanswered), all six PR conversations (above),
and `git log` (every commit since `7508de1` is Claude-authored) were checked before any work
started.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A21** | When an absent member stops being "revenue at risk" | **YES, on the day a gym imports** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.** And this
session's §4.1 fix makes the cover data *right*; it does not make it reach anyone. A17 still does
that.

**Four decisions are in writing and waiting, none answered:**

- `docs/PT-RECONCILIATION.md` §6 — second lens, or a PT product?
- `DYLAN-QUEUE.md` A20 — arbitrary class times: yes/no, and grid or list.
- `DYLAN-QUEUE.md` A21 — the at-risk ceiling: (a) N days, (b) import-aware, or (c) both.
- `SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw? **Now five sessions old.**

Nothing new for Dylan's list this session. §5 has two new decisions, neither of which blocks
anything today.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 A covered class was recorded as taught by the coach who was away · FIXED (`3b88bf5`)

**What was wrong.** `publishOccurrences` only ever *created* rows, and `startScheduledClass`
returned an existing row as-is. Covers are overlaid on the derived occurrences, never on rows
already on the books. So the normal order of events left the published row naming the absent
coach, and nothing on any screen could change it: publish a week ahead, then agree cover when
someone falls ill.

**Evidence, driven through the shipped UI.** Schedule → Next week → Publish week (Engine Room,
Wed 18:00, Mara). Record Mara away; assign Dev. The grid reads "covering for Mara"; the Publish
button goes **grey** ("Every class on this week is already on the books"). Clock → Wed 17:40,
reload: Dev presses Start. The Runner reads "Running Engine Room from the schedule · today 18:00 —
check-ins land on this class". The stored row: **`coachName: "Mara"`**.

**What it cost a gym.** Every check-in of a covered class was credited to the coach who was not
there. The member link reads that row's `coach_name`, so the member was told "with Mara". The
member's own data export (the PDPA access response) printed Mara in its Coach column.

**Fix.** Two narrow doors (§1.5). Deliberately **future rows only**: a past row keeps the coach the
product believed was teaching, or a permanent change of coach would rewrite every class the old
coach ever taught. **A blank never replaces a name**; `startScheduledClass`'s existing
session-10 test pins exactly that, and it still passes unchanged.

⚠️ Session 41's §5.3 calls `class_instances` "append-only by design". That is about deleting.
Updating a field was always the sync model here (`_bgUpsertDelta`, and 0007's `updated_at`
trigger), and this uses it.

### 4.2 🔴 "I'm back" on a finished absence erased the record that a class went uncovered · FIXED (`31ce506`)

**Evidence.** Mara away Mon–Wed, Dev takes Wednesday, nobody takes Monday. Clock → the following
Tuesday: "1 of 2 covered — **1 still has nobody**. [I'm back]". Present tense about a class seven
days gone. The button calls `cancelAbsence`, which hides the absence and settles Monday's request
as "cancelled". The panel's own comment says that record ("that class went uncovered") is exactly
what should be kept. The same store call did it to an *ongoing* absence: back early on Tuesday
cancelled Monday's missed ask.

**What it cost a gym.** The only record that cover failed was one harmless-looking tap from being
rewritten as "the ask was withdrawn". That record is how an owner learns cover is not working.

### 4.3 🟡 One person became two members on an import with mixed email rows · FIXED (`ad629b5`)

On the **first** import, not the second (§4.2 item 2 asked about the second, and that path is
sound; see §4.7). The two halves split visits and "last in", so the retention rules could flag a
regular as lapsing. Mixed rows are an ordinary export shape: a walk-in entered by hand.

### 4.4 🟡 The 1:1 picker listed a member who had left, unlabelled · FIXED (`a666368`)

A coach picking a name for a new 1:1 client saw a Left member exactly like a current one. With two
similar names, that is a mis-pick, and a health record against the wrong person.

### 4.5 🟢 The roster header left out cover-only coaches · FIXED (`c17b30c`)

### 4.6 🟢 The instrument, three times · FIXED (`18fa2e6`, `a049956`, `fe6a883`)

Every skip and every force the sweep reported this session was the sweep, not the product. After
these commits the full sweep reports **one** skip in total: the Exercise Library's header profile
button, under the library's own modal, which no user can press either. That one is honest and
deliberately left.

### 4.7 🟢 The near-misses — chased and not reported

- **§3.2, the member's page.** Built a real payload from the Builder's own stages through the
  shipped `summaryContent`, stubbed `summary-read`, opened it at 390×844. No overflow; "40 min ·
  9 movements" checks out (5+10+15+5+5; nine distinct names); "3 × 10, rest 30s"; "2 × 30 sec";
  "60 sec each"; no Jungle mark; "Links stay live for a couple of weeks" matches the 14-day TTL.
  **It says nothing about the member, by design** (see §6).
- **§3.3, the Plan and Coach boards with a long class.** At 7 stages (one named "Posterior Chain
  Strength Block", 30 characters), both boards draw **all** stages at 1280×720 and 3840×2160.
  Every number checks: "7 stages · 60m · 9 exercises" (5+10+15+5+5+10+10; 2+2+2+1+2).
  Nothing either board *says* is false. The Coach strip truncates names ("Poster…" at 4K), which
  is known. At **12** stages the Plan board's third row runs off a 720p wall with no marker, but
  the chips above still list all twelve with durations. That belongs with §5.4, not a copy fix.
- **Importing the same CSV twice**, driven again: members, classes, check-ins and every number
  unchanged; "5 were already recorded and were skipped".
- **The Dashboard with a used gym** says "Run your first class" and "No sessions yet" to a gym
  with classes and check-ins on record. Its numbers are all Runner session history, and it says
  so ("your numbers appear on this page as soon as you have run a class"). An imported gym stays
  on the cold-start card; that is a design question, not a false statement. See §5.11.
- **The 1:1 list says "Nothing booked"** for a client whose planned session passed unmarked. I
  first wrote this up as "overdue is computed and never shown", then retracted it: the sentence
  above the list says "N planned sessions are in the past and still unmarked". Honest.
- **The member link for an ad-hoc class** records `coachName` from `displayProfile`, which is null
  in the local build, so the fact is dropped rather than printed as "with Coach". Honest.
- **`node scripts/audit-store-writers.mjs`** — exit 0, 0 unexplained, after every change.
- **"stated -26385 days ago"** on the cover board: my own fixture's `availabilityAt: "2099-…"`
  (the trick coachCover.spec.js documents). Not reported.

---

## 5 · Proposals

### 5.1 🔴 Carried forward, unanswered — A21: when does "at risk" become "gone"? · ~2h after the decision

Session 41 §5.1 verbatim in substance. **Recommendation unchanged: (a) at 60 days**, one constant
that the flag list, the revenue figure and the Analytics copy all pass through, with the argument
beside it the way `MIN_TRIERS = 8` has one.

### 5.2 🟡 NEW — an untimed export followed by a timed re-export duplicates the classes · a decision

Measured on the shipped modules: the same two check-ins imported as `2026-03-04`, then as
`2026-03-04 18:00` → **2 classes, 4 check-ins** for one class and two people. The importer matches
at the file's own precision *on purpose*: an untimed row may already be two classes merged (06:00
and 18:00 of the same name), so there is no safe automatic join. Options:
(a) leave it, and have the preview warn when a timed row lands on a day that already has an
untimed occurrence of the same name; (b) join a timed row to the ONE untimed occurrence of that
name that day when there is exactly one. **Recommendation: (a)**. It says what is happening
without guessing, and it is ~1h.

### 5.3 🟡 NEW — the Away list grows forever · a number

A manager sees every absence ever recorded, newest first. The cover board drops a request once
its day passes ("the list only ever grows and stops being read"), and the same argument applies
here. Dropping ended absences after N days is a number: **30** keeps the last month's "went
uncovered" in view for a monthly review. Yours to accept or replace.

### 5.4 🔴 Carried forward, unanswered: how big should the room boards draw? · ~1 day

Session 38 §5.1, now **five** sessions old. Session 41's §5.2 (the Floor board calls every class a
clockwise station loop) waits on it, and so does this session's 12-stage Plan board (§4.7).

### 5.5 🟡 Carried forward: raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2h after 5.4

### 5.6 🟢 Carried forward: a re-slot's old occurrence stays on the books, empty (session 41 §5.3)

### 5.7 🟡 Carried forward: the Builder's exercise rows on a phone — a design call (session 41 §5.6)

### 5.8 🟢 Carried forward: recommend CLOSING the semicolon-CSV item

Session 41's recommendation, carried as a recommendation rather than as an item: no reason to
believe a pilot gym's export is `;`-separated (Singapore GTM, Mindbody exports commas), and
`b266830` already tells a `;` file what is wrong.

### 5.9 🟢 Carried forward: "A typical class here is 2 members" needs a minimum-sessions floor

Still deliberately not taken: choosing that number is the work.

### 5.10 🟡 Carried forward: the Floor board calls every class a station loop (session 41 §5.2)

Waits on 5.4.

### 5.11 🟢 NEW — the Dashboard of an imported gym stays on the cold-start card

A gym that imports two years of history sees "Run your first class" until someone runs one through
the Runner, because every Dashboard number is Runner session history. It is honest; the question
is whether the Dashboard should say what it *does* have ("412 check-ins across 96 classes on
record") before a Runner session exists. A copy-and-count decision, ~2h.

---

## 6 · What in the session-42 prompt was false, and my own retractions

### ⚠️ §3.2 — "read what it tells them about themselves"

`ClassSummary.jsx` is deliberately class-scoped. Its header says it must never render a member's
name, streak or attendance, because the token is shareable and a personalised page would be a PDPA
disclosure. A used gym changes only the *class content* it shows, so there is nothing about the
member to read. I read what it does say (§4.7), and it is right.

### ⚠️ §3.1 — the three candidate causes

"The NAME_OF function, the revealed-set dedupe, or a control that really cannot be reached" was
**none of them as the cause**. The cause was the reopen forgetting a select choice. NAME_OF was a
real second fault (composite select names), and the brief's reading of the names as "the TEXT of a
composite control" was exactly right. "A skip is a press that did not happen" was true, but those
controls *were* pressed elsewhere, so the gap was a path, not a blind control.

### ⚠️ §3.3 — "what does each board say about a class it cannot fully draw?"

Both boards *can* draw a 7-stage class, fully, at both sizes. Not a defect (§4.7).

### 🟢 What the prompt got exactly right

- §0.1: all six open, `main` at `7508de1`, **1328 / 50** and **624 / 53** to the test.
- §0.2: the chromium block, first try, sixth session running; the full run at **16.1m**.
- §3.4's suspicion: it was the dishonest case, and it was worth checking.
- §4.2's list: items 1 and 2 each led to a real finding within an hour, and item 4 (the sweep's
  blind spots) led to two controls that had never been pressed.

### 🔴 My own retractions

- **"The 1:1 lens computes overdue sessions and never shows them"**: wrong, caught before it
  reached this file (§4.7).
- **A commit-message count**: `c17b30c` first said "coachCover.spec 26 passed" for a run of 25.
  Amended on my own branch.
- **My first NAME_OF fix read the label's `innerText`**, which CSS uppercases ("THIS
  RELATIONSHIP"), and my `EXPECT_WALKED` entry failed on it. Caught by the test, fixed to
  `textContent` before committing.
- **The `checkVisibility` filter was not bitten by any test when first written**: the named
  presses passed with it removed. I added `EXPECT_NO_SKIPS` so it is, rather than claim a guard
  the suite could not see.
- **§3.4's two guards each mask the other.** With one removed the test stays green; only both
  removed turns it red. That is stated in the commit rather than reported as a single mutation.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Unchanged from sessions 38–41.
2. **Decide A21**: the number at which an absent member stops being revenue at risk.
3. **Answer the room-board question (§5.4)**, now five sessions old.

---

## Session 41 — the wedge that would not come back, and three numbers the product said that were not true

> Written in full to `SESSION-41-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-27. Branch `claude/relaxed-knuth-s6p32q` (the branch this environment assigned; the brief
suggested `claude/session-41-<something>`), based on `claude/jungle-session-40-q4batq` — PRs
**#15, #16, #17, #18 and #19 were all still open**, `main` was still `7508de1`, and there were
**zero comments or reviews on #19** (the other four were not re-read comment by comment; their
`updated_at` had not moved since session 40). That is §0.1's second row. Six commits ahead._

Position confirmed by gate, not by log: `npm test` reported **1321 unit (47 files)** and
`npx playwright test --list` **620 in 53 files** at the branch point, exactly as the brief said.

> **Gates at HEAD.** `lint:crash` **0** · **1328 unit** (50 files) · **624 e2e in 53 spec files**, one clean
> run on a quiet tree, **624 passed (16.4m)** · 14-chunk build · **0 over budget** (StaffApp
> **334.09 / 360 kB**). App.jsx **2,706 lines**.

---

## 1 · What shipped, per commit

| Commit | What | Verified at |
|---|---|---|
| `2036d18` | §3.4 — `handleSelectTemplate` (no caller) and the unreachable Integrations route deleted; `deadHandlers.test.js` | lint:crash 0 · 1323 unit |
| `696ce99` | §3.1 did not reproduce; §3.2's second look landed — the sweep walks into lazy panels | sweep 12 passed (5.4m) |
| `152234b` | §3.3 — every `<select>` is 44px below 900px, one CSS rule | 1323 unit · mobile 22 passed · size 0 over |
| `0c94290` | 🔴 **found** — at 390px the Builder's class-type dropdown was a bare 29px chevron | 1323 unit · size 0 over |
| `7e67f70` | 🔴 **found** — the Floor board printed FINISH on stage 5 of a six-stage class | 1325 unit · display + smoke 39 passed |
| `2e4eeb5` | 🔴 **found** — "CLASSES RUN 10" for a week nobody taught | 1328 unit · 4 specs 43 passed |

Every change has a test that fails when it is reverted; each commit message carries the mutation
and the failure it produced.

### 1.1 `2036d18` — §3.4, two doors nobody could open

Read all three `MOCK_VIEW_FLAG = false` routes. `templates` and `glossary` have **no render
branch** — nothing behind them to read, and `navRoutes.test.js` already pins that. `integrations`
did have one, a `MockDisabledScreen`, and **no way in**: `isViewEnabled` filters it out of all four
navs, no `setView`/`onNavigate` names it, and the view is not restored from storage.
`navRoutes.test.js` cited it as the model honest retirement; it was an honest panel behind a door
nobody can open. Deleted, and added to the test's retired list.

`handleSelectTemplate` — one of session 39's "five whole-class replacements" — had **no caller**.
Deleted, with the `templateTracks` App state whose only reader it was (the store functions stay;
prefs hydrate still round-trips the server column). `deadHandlers.test.js` asserts every
`const handleX =` in App.jsx is referenced outside comments, with a positive control. `npm run
lint` would say the same inside 211 advisory problems nobody reads.

**No mount-write defects to find**: unlike `music`, none of the three has a screen left to mount.

### 1.2 `696ce99` — §3.1 does not reproduce; §3.2 landed

**§3.1.** Reproduced outside the sweep first, as the brief asked: a throwaway spec on a used gym
opened the Profile modal and pressed each of its controls from a fresh load — both tabs, Upload
Logo, Save, Reset, **Sign Out**, Close — then read with `page.evaluate` **and** a raw CDP
`Runtime.evaluate`. Every read answered in well under a second. Then the real sweep with a second
look added: **"Sign Out" pressed ten times across twelve screens, every read answered, 12/12
green.** Session 40's second-look code was never committed, so there is nothing left to test its
wedge against. The likeliest home is the instrument that reached it — that is a guess, and the note
in the file says so. The bounded reads stay; they cost nothing while the page answers.

**§3.2.** The second look is keyed on the one thing only a lazy-panel press does: **it fetches
code**. When a script request started after the press and nothing new is on screen, wait (bounded,
3s) for the scripts to land and read again. A blanket wait after every quiet press would cost ~1.7s
on each of the Schedule's 60 controls. The same look runs after a **reopen**, which reloads the
page and so refetches the chunk — without that half the descent reached the modal and then recorded
"Sign Out" and "Close" as *skipped*, which is exactly what the branch-point run's Class Runner line
says: `skipped 2: Run › Sign Out, Run › Close`.

Descents per screen, branch point → now: Dashboard 0→1, Class Builder 5→7, Coaches 7→8, Schedule
8→9, Members 2→3, Analytics 1→2, 1:1 Clients 4→5, Health Screen 1→2, Brand Studio 4→5. No
guarded/unguarded verdict changed. The Dashboard sweep now asserts it PRESSES "Your profile and
settings › Sign Out" and "› Close" — the modal is walked from nowhere else. Each half of the second
look is mutation-checked separately.

### 1.3 `152234b` — §3.3, every select is 44px on a phone

Measured on a used gym at 390px before touching anything: the Builder's class type / style /
presets **26px**, the Library's class picker **28px**, the Schedule's "Coach who is away" **34px**,
Brand Studio's currency **37px**, the Builder's per-exercise "Move to…" **18px**.

**One CSS rule under 900px** (the bottom-bar line) instead of eighteen inline edits, because an
opt-in rule is exactly how those eighteen went unasked. Desktop is unchanged. `data-dense` opts out
**one** control — the Builder's per-exercise "Move to another stage", which sits in ~30px rows next
to icon buttons that are already deliberately not `data-tap`; growing it alone makes every
exercise row 44px on a phone, which is a Builder redesign (§5.4).

**The judgement the brief asked for, in one line: text fields do not belong in the rule** — a
field is a wide target, a miss lands visibly in the next field instead of doing something, and
several (the Library search) are a borderless input inside a larger pill, so a height rule on the
input would measure the wrong box. The `Input` primitive stays 35px.

### 1.4 `0c94290` — the Builder's class type was unreadable on a phone

Found by **looking at** the screen §1.3 had just made taller. See §4.2.

### 1.5 `7e67f70` — the Floor board and a six-stage class

Found driving §4.2 item 4. See §4.3.

### 1.6 `2e4eeb5` — CLASSES RUN

Found driving §4.2 item 3. See §4.1. ⚠️ **The existing `schedule.spec.js` test asserted the
defect** (`shown === past` published occurrences) and was rewritten, not loosened: it now publishes,
re-slots, republishes, advances a week, asserts the books hold `PER_WEEK + 1` past occurrences, reads
**0**, and then a positive control (two check-ins into one class) reads **1**.

---

## 2 · What is still red, and why

**Nothing is red at HEAD** — see the gate line above.

🔴 **The branch point was green**: the full suite ran before any work, on a quiet tree —
**620 passed (15.7m)**.

⚠️ **One failure, once, under load I caused.** A mid-session full run (at `0c94290`) reported
`622 passed, 1 failed` in 17.9m: `destructive.spec.js:526` "a template tile asks before replacing
a class the coach wrote", failing at its **fixture's positive control** — the seeded draft read back
as the default five stages. I was running worktree specs and a build in parallel at the time. It
passed **15/15** isolated (`--repeat-each 3` of the whole describe), and a deliberate attempt to
force the obvious race (`freshApp` → `setItem` → wait, under 12× CPU throttling) passed 4/4, so I
have no mechanism. Recorded as the brief asks — the REPORT, not the pass/fail — and not as a
finding. **In the final clean run it passed**, as did everything else. If it recurs on a quiet
tree, `seedAuthored` (destructive.spec.js:509) is where to look.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved. `DYLAN-QUEUE.md`, PR #19's conversation and reviews (**none**), and `git log`
(every commit since `7508de1` is Claude-authored) were all checked before any work started.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.**

**Three decisions are in writing and waiting, and none has been answered:**

- `docs/PT-RECONCILIATION.md` §6 — second lens, or a PT product?
- `DYLAN-QUEUE.md` A20 — arbitrary class times: yes/no, and grid or list.
- `SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw? **Now four sessions old.**

**New this session, and it is a decision (§5.1): at what point does an absent member stop being
"at risk" and start being "gone"?** Today, never — and the revenue figure an owner quotes is the
one it inflates.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 "S$9,540/month at risk" on a gym whose at-risk members left up to 20 months ago · NOT FIXED — §5.1

**What is wrong.** Rule 2 (`retention.js`, absence) has a floor — 14 days — and **no ceiling**. And
`applyAttendanceImport` creates every imported person as `status: "active"`, because an attendance
CSV carries no cancellations. So a gym that imports its history gets every member who ever left
flagged as "at risk", and — once a membership price is set — **priced as monthly revenue at risk**.

**Evidence, gathered myself.** Two passes:

1. Through the UI: imported ~7 months of typed history by CSV, set S$159 in Brand Studio, opened
   Members at 390px: **"38 members need attention · S$6,042/month at risk · 38 members ×
   S$159/month"**, the first rows reading "Last attended 190 days ago, after 1 visit".
2. Through the shipped modules (`retentionSummary` → `revenueAtRisk`), on a realistic two-year
   import — 30 regulars training weekly to yesterday, 60 members who stopped between 60 and 591
   days ago: **"60 members need attention" · `{"members":60,"total":9540,"symbol":"S$"}`.** Every
   one of the 60 is gone; the oldest stopped paying ~20 months ago.

The studio-activity gate that the file's header is proud of does not help: this gym IS recording,
so the absence rule runs — over its whole back catalogue.

**What it costs a gym.** The single most quotable number on the screen — the module's own header
calls it "what gets screenshotted into a pitch and repeated back in a renewal conversation" — is
inflated by every member who left before Jungle arrived. On day one of an import, a coach is
handed dozens of WhatsApp drafts to people who left a year ago.

**What fixing it takes.** A ceiling, and **choosing the number is the work** — which is why it is
§5.1 and not a commit. ~2h once decided.

### 4.2 🔴 At 390px the Builder's class type was a bare chevron · FIXED (`0c94290`)

**What was wrong.** The Builder toolbar holds three dropdowns — class type, style, Jungle presets —
and at 390px each was **~29px wide**: a chevron and a coloured border, no text. The "Class" /
"Style" / "Preset" captions are `!isMobile`, so nothing on a phone said which class type the plan
was under — and that label reaches `class_instances.class_type` through the Runner.

**Evidence.** A screenshot at the branch point (26px tall, ~30px wide, no text), then the same
screen after §1.3 (44px tall, still no text). Cause: the row wraps, but `flex: 1; minWidth: 0` is a
zero-basis item, and a zero-basis item never forces a wrap — it shrinks.

**Fix.** `flex: 1 1 96px; minWidth: 96px` on a phone: the three take the first line (~115px each,
"⚡ CrossFit" / "WOD (Workout…" / "Jungle presets…"), the buttons wrap to the second. Test measures
width; mutation reports `"Class type" is 29px wide at 390px`.

**The lesson worth keeping:** §1.3's own test passed on this screen. Height is not legibility, and
a green tap-size sweep said nothing about a control nobody could read.

### 4.3 🟡 The Floor board printed FINISH with a stage still to come · FIXED (`7e67f70`)

**What was wrong.** `buildFloorLayout` draws at most five stations and marked the last card
**drawn** as the finish. The Builder's "Add stage" has no ceiling, so on a six-stage class — one
click away — the board facing the room printed **FINISH on stage 5** and "clockwise · **5
stations**" under the loop.

**Evidence.** Driven through the shipped UI: Builder → Add stage → Runner → Room TV → Floor at
1280×720.

**Fix.** FINISH marks the class's real last stage; the count reads "showing 5 of 6 stages" when the
board is showing part of the class. Unit + e2e, both mutation-checked.

**Not changed, reported:** see §5.2 — "clockwise", and the board modelling every class as a
station loop.

### 4.4 🟡 "CLASSES RUN 10" for a week nobody taught · FIXED (`2e4eeb5`)

**What was wrong.** The Members header counted every `class_instances` row whose time had passed.
Its own comment excludes the future because "a number that goes up for work not yet done is the
kind of flattering lie this screen exists to avoid" — but "its time has passed" is not "it ran".

**Evidence.** Clock Mon 20 July, usedGym's rules and no history, Publish week → 9 added; edit
"Hyrox Sim" Wed → Tue, publish → 1 added; clock Mon 27 July → **CLASSES RUN 10**. Nothing was
started and nobody was checked in. Nine are published plans whose hour went by; the tenth is the
moved class's old slot, which a re-slot leaves on the books by design.

**Fix.** A check-in is the only record in the product that a class happened (session history
carries no instance id), so the tile counts classes with at least one check-in. A class taught with
nobody checked in goes uncounted — the honest direction to be wrong in. Imported history is
unaffected.

**Not changed, reported:** the re-slot's old occurrence itself stays on the books, empty, forever
(§5.3).

### 4.5 🟢 The near-misses — chased and not reported

- **"last in 190 days ago"** on the at-risk rows read as a typo. It is the idiom ("she was last in
  three days ago"), and `retention.js:75` uses it on purpose.
- **"studio average 61%" above rows whose visible arithmetic is 67.5%** on the class-type return
  panel. The average includes Pilates (4 triers), which the panel excludes from the ranking and
  names as excluded — the average is over every measured trier. Defensible, and it says which types
  are out. Checked by hand: HIIT 14/14, Strength 13/13, Yoga 0/13, Pilates 0/4 → 27/44 = 61%.
- **"HALF GONE BY 2m"** over a curve reading 89% at 1m and 33% at 2m — true: half had gone between
  month 1 and month 2. Session 40's "STILL OVER HALF" fix holds.
- **The cohort table and the curve agree** (9 on the curve + 17 newer = 26 in the table; the
  import's first month excluded and said so).
- **`member.status`** (Active / Paused / Left) — an explicit inline edit with Save and Cancel, the
  row stays visible with a LEFT pill, and Edit is how you reactivate. Honest.
- **`ptClient.status` "ended"** — a status, not erasure (`store.js:1564` says so), reversible.
- **The re-slot rule edit** keeps the rule's `id`, as session 18 designed.
- **Revenue-at-risk at 390px** — no horizontal overflow, the multiplication is on screen, and the
  per-member lines agree with the total. (What it multiplies is §4.1.)
- **The Room TV Plan and Coach boards** at 1280×720 with a class running — read, nothing wrong.
- **`node scripts/audit-store-writers.mjs`** — exit 0, 0 unexplained.
- **"Rename a class type that is on the schedule and in history"** — not a shipped action. See §6.

---

## 5 · Proposals

### 5.1 🔴 NEW — when does "at risk" become "gone"? · ~2h after the decision

§4.1. Options, all cheap to build:

- **(a) A ceiling on rule 2** — e.g. absent more than 60 days is "lapsed", listed separately, and
  **not priced**. The argument for 60: memberships bill monthly, and a member absent two full
  billing cycles who has not been marked Paused has, in almost every case, stopped paying — the
  revenue is not at risk, it is gone. Any number here needs that kind of argument, and it is yours
  to accept or replace.
- **(b) Import-aware**: a member whose LAST check-in is an imported row lapsed before Jungle was
  watching, so is history, not risk. Number-free, but it hides a member imported yesterday who was
  last in 20 days ago — the one a coach most wants to call on day one.
- **(c) Both**: (b) for the revenue figure only, (a) for the list.

**My recommendation is (a) at 60 days**, because it is checkable by an owner in their head and
does not depend on where a row came from. `MIN_TRIERS = 8` is the precedent for writing the
argument down next to the constant.

### 5.2 🟡 NEW — the Floor board calls every class a station loop

"THE LOOP · Next station in 4:56 · clockwise · 5 stations" is drawn under a warm-up → circuit →
strength → recovery → cool-down class where the whole room does the same thing at once.
"Clockwise" is an instruction nothing in the plan sets. This belongs with 5.4 below (how the room
boards draw), not as a copy fix; `display.spec.js` and `smoke.spec.js` use "clockwise · N stations"
as their readiness probe, so the copy change is ~1h once the decision is made.

### 5.3 🟢 NEW — a re-slot's old occurrence stays on the books, empty

After a published class is moved and the week republished, `class_instances` holds both slots. No
screen shows the ghost any more (the grid reads rules; §1.6 stopped the header counting it), but it
syncs to the server, and N4 member links or a future "upcoming classes" list would read it.
`class_instances` is append-only by design, so the fix is a decision: tombstone an unattended
**future** occurrence when its rule moves, or leave it. ~2h after deciding.

### 5.4 🔴 Carried forward, unanswered: how big should the room boards draw? · ~1 day

Session 38 §5.1, sessions 39 and 40 §5.1, **now four sessions old**. Requirement: primary 8–12% of
screen height, secondary ~3%. What ships is 1.0–2.5% on the Plan board. A global floor is not
shippable — the Coach board's stage strip truncates — so the work is per-board. **The decision
needed: should the pre-class Plan board fill the wall the way the timer boards do?** 5.2 is part of
the same decision.

### 5.5 🟡 Carried forward: raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2h after 5.4

Session 38 §5.2, unchanged.

### 5.6 🟡 NEW — the Builder's exercise rows on a phone · ~half a day, a design call

The per-exercise "Move to…" select (18px) and the row's icon buttons are below 44px at 390px
because the rows are ~30px apart. §1.3 opts the select out with `data-dense` rather than make
every row 44px. If the Builder is meant to be used one-handed on a phone, the rows need
redesigning; if it is a desk task on a phone-sized screen, the exemption is right. Your call.

### 5.7 🟢 Carried forward: `parseCsv` and semicolons — **recommend closing it**

Session 37's §5.3, carried by 38, 39 and 40. The brief said to build it only with a reason to
believe a pilot gym's export is `;`-separated. I found none: the go-to-market is Singapore
(`docs/GTM-SINGAPORE.md`), whose Excel locale separates lists with commas, and the named source
system (A18, Mindbody) exports commas. `b266830` already tells a `;` file what is wrong. **Not
built. Propose dropping it from the carried list** unless a pilot says otherwise.

### 5.8 🟢 Carried forward from sessions 39/40

- **"A typical class here is 2 members" from one class** — unchanged and deliberately not taken
  again: it needs a minimum-sessions floor and **choosing that number is the work**.
- Session 40 §5.4 (lazy panels / the wedge) and §5.5 (selects) and §5.7 (flagged-off routes) are
  **done** — §1.1–§1.3.

---

## 6 · What in the session-41 prompt was false, and my own retractions

### ⚠️ §3.1 — the wedge does not reproduce

The brief states it as a fact ("One control leaves the page unable to run ANY `page.evaluate`").
With the modal reached ten times through the sweep and every control pressed by hand outside it,
nothing wedged. It was real to session 40 in whatever its second look was; that code is gone, so
the claim cannot be re-checked, only failed to reproduce.

### ⚠️ §3.4 — "behind a false flag and nothing has ever read them" is two-thirds empty

`templates` and `glossary` have no screen behind the flag at all — there is nothing to read.
`integrations` is the one with something behind it, and what is behind it is the honest
coming-soon panel, not a mock. The dead handler claim was exactly right.

### ⚠️ §4.2 item 3 — "rename a class type that is on the schedule and in history" is not an action

The Exercise Library can **add** and delete a class type, not rename one. The class-type rename
that exists (`renameClassType` in `personaAggregate.js`) renames a coach persona's plan type, which
is not what the schedule or history key on.

### ⚠️ §0.1 — "zero comments on any of them"

Checked for #19 (none). For #15–#18 I relied on their `updated_at` not having moved since session
40 rather than reading each thread — say so rather than claim it.

### 🟢 What the prompt got exactly right

- §0.1's branch table and gate numbers: all five open, `main` at `7508de1`, **1321 / 47** and
  **620 / 53** to the test.
- §0.2's chromium block, verbatim, first try, fifth session running.
- §0.2's ~15-minute full run: **15.7m** on a quiet tree.
- §3.2's diagnosis, and that the fix recovers the descent on eight screens (I measured nine).
- §3.3's inventory: 18 raw selects, `Input` 35px, and that `data-tap` alone does nothing on a select.
- §3.5's condition for building it — and it was not met.

### 🔴 My own retraction: I made a full run unreadable by loading the machine

The mid-session full run (§2) shared four CPUs with worktree specs and a production build I ran in
parallel. Its one failure cannot now be told apart from contention, and I spent time trying to force
a race I could not reproduce. **The worktree protects the files; it does not protect the CPU.** Only
the final clean run, started with nothing else running, counts.

### 🔴 My own retraction: the first measure of §1.3 lied because of my worktree

Run from a git worktree whose `node_modules` was a **symlink** outside the project root, Vite
refused those files with 403, and `mobile.spec.js` reported three console-error failures and two
tap-target failures that did not exist. Replacing the symlink with a hard-linked copy
(`cp -al`) made all of them vanish. Worth knowing for the next session that uses a worktree:
**symlinked `node_modules` is not safe under Vite's `fs.allow`.**

### 🔴 My own retraction: a commit message count

`152234b`'s message first said "mobile.spec 23 passed" for a run that was 22 (the 23rd test belongs
to the next commit). Amended before pushing.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Unchanged from sessions 38, 39 and 40.
2. **Decide §5.1** — the number at which an absent member stops being revenue at risk. It is the
   figure an owner quotes, and today a two-year import makes it up.
3. **Answer the room-board question (§5.4)** — four sessions old now, and §5.2 waits on it.
