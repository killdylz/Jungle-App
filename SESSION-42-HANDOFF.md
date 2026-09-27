# Session 42 — four skips that were the instrument, and a covered class credited to the coach who was away

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
