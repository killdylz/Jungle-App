# Jungle — Session Handoff

_Last updated: 2026-09-07 (session 36)_

> 📁 **Sessions 6–33 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 36 — the queue is one branch, and four things a gym would have seen

> Written in full to `SESSION-36-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-07. Branch `claude/session-36-queue-hunt-ty4q49`, 58 commits ahead of `main`._

**Gate at HEAD:** `lint:crash` **0** · **1277 unit** (45 files) · **534 e2e** (48 spec files) ·
14-chunk build, **0 over budget**. StaffApp **331.41 / 360 kB**, PTScreens **38.28 / 41 kB**,
RetentionScreen **17.13 / 18 kB**. CI green on every pushed commit that has finished running.

Everything below was measured on this branch on 2026-09-07. Re-measure before trusting it.

---

### 1 · What shipped

Nine commits. The first three are the consolidation; the rest is code.

| # | Commit | What | Gate it was verified at |
|---|---|---|---|
| 1 | `3c44948` | **Merge `member-add-discoverability`** — the roster panel moves above the CSV panel, three testids, new empty-state copy. One conflict in `RosterScreen.jsx`, resolved as *both*: the new order AND the three colour-token substitutions the integration branch made inside the same two moved blocks | 1232 unit · 516 e2e |
| 2 | `b6f24d9` | **Merge `session-34`** — D1, D4, D5. Four conflicts. `check-size.mjs` is a union, not a pick; session 34's **A16** renumbered **A19**; the handoff fork reconciled; `CLAUDE.md`'s gate line un-templated (see §6) | 1261 unit · 519 e2e |
| 3 | `a090243` | **D7 — `erasePtClient`.** A PDPA erasure reached `members` and stopped there, leaving the 1:1 record, its sessions and its seven health answers with no way to reach them. Refuses any client whose member row still exists | 1268 unit · 522 e2e |
| 4 | `87553ef` | **`docs/PT-RECONCILIATION.md`** — the comparison Dylan needs to choose between two PT implementations. Facts and trade-offs, no recommendation | unchanged, re-run |
| 5 | `e4adf54` | **The member link said a 60-minute class was 25 minutes** | 1271 unit · 525 e2e |
| 6 | `de13535` | **A coach typed `-5` and the Room TV said "Warm-Up · -5m"** | 1275 unit · 530 e2e |
| 7 | `a4b9201` | **A second class in one time slot was scheduled, counted, published and invisible** | 1275 unit · 533 e2e |
| 8 | `69d4e38` | **Analytics said "0 with a check-in" under a sentence counting three** | 1277 unit · 534 e2e |
| 9 | this file | The handoff | — |

Every code change landed with a test that was **mutated to red and reverted with the inverse
edit**, and `git diff` was checked before moving on. The mutations are named in each commit
message. One of them found dead code I had just written (see §4.6).

#### The one thing that was not mechanical in the merges

🔴 **PTScreens 36 was wrong for the merged tree, and both branches had agreed on it.** Session 34
raised the ceiling 34 → 36 measuring 34.00; D6 raised it 34 → 36 measuring 34.83. Neither could
see the other. The additions are disjoint and add exactly — 31.63 + 2.37 + 3.20 = **37.19 KB** —
so the merge shipped 1.19 kB over a ceiling both sides had independently called sufficient.

**A size ceiling is not mergeable by taking the max.** That rule is now written into
`check-size.mjs` beside the number. It is the general shape of the problem this repo has with
long-lived branches, not a one-off.

---

### 2 · What is still red

**Nothing.** No gate was left failing, and nothing was skipped, disabled or allowlisted.

Two things that are *not* red but that a reader should not mistake for green:

- **`npm run lint` still reports ~211 advisory problems.** That is the documented baseline;
  `lint:crash` is the gate and it is 0.
- **The e2e suite cannot run in this container without a workaround.** `@playwright/test` 1.61.1
  wants chromium build 1228 and the image ships 1194, so every spec dies at ~2 ms with
  `Executable doesn't exist`. Session 34 documented the fix and it is exact; this session
  re-measured it on a fresh container and wrote it into `CLAUDE.md` with the trap that made it
  cost an hour (§6). **CI is unaffected** — it installs its own browsers, and CI is green.

---

### 3 · 🟥 Dylan's list — what code cannot clear

Nothing in this session touched any of these, and nothing in a future session can.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES, and it is a data-exposure one.** The migration is merged; it has not been run. Until it is, a `member`-role account reads the whole gym. No test in this repository can tell you whether it has run |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES.** 🔴 **Merging branches does not let coaches find cover. A17 does.** The away board, the cover board and the roster all work — on ONE PHONE. `deliveryTruth()` returns `"device"` and the panel says so, in as many words, to the coach who just asked for cover. Both halves are needed: the migration without credentials still delivers nothing |
| **A15** | Settings → Actions → Workflow permissions → allow Actions to create PRs | No user-visible outcome. It is why branches go unnoticed, which is how this session's queue happened |
| **A12 / A13** | Turn on member links (N4), then send yourself one | **YES.** The member link is one of the two member-facing surfaces and its code **has still never executed against a real Edge Function.** This session fixed a defect in it (§4.1) and could only do so against a stubbed response |
| **A16** | Accent legibility — a yes/no | No |
| **A18** | Mindbody — a decision and four facts | No |
| **A19** | The `health_screen` consent scope — a yes/no (renumbered from A16 this session) | No. The consent is real and local today; only the server mirror waits |
| **A20** | **NEW.** A gym cannot enter a 07:00 class — the Schedule supports five fixed times. A decision, then ~2 days | **YES, on day one.** See §4.5 |
| — | **10 Dependabot PRs**, five of them major GitHub-Actions bumps | No. Five of them fix the Node 20 deprecation warning every CI run prints. Not merged, per standing instruction |

#### Branches waiting

| Branch | State after this session |
|---|---|
| **`claude/session-36-queue-hunt-ty4q49`** | **This one. 58 ahead of `main`, CI green. It carries everything below except the rival.** This is what you merge |
| `claude/integrate-coach-cover-s2933` | Now fully contained in the above |
| `claude/member-add-discoverability-zdbppk` | Merged in (commit 1) |
| `claude/session-34-prompt-lasku9` | Merged in (commit 2) |
| `claude/prompt-32-verification-m5y12y` · `gracious-hopper` · `session-29/30/31` | Ancestors, already in. Nothing to do |
| `claude/pt-feature-ideation-dhbyfx` | **Untouched, and deliberately.** See `docs/PT-RECONCILIATION.md`. It drifts one commit further behind `main` every time `store.js` changes |
| `pt-function-new-screens` · `rls-staff-read-boundary` | Merged (#14, #13). Ignore |
| 10 × `dependabot/**` | Not merged |

---

### 4 · Findings

Ranked by what they cost a gym. Each was found by driving the running product and reading it —
**not one of them was found by a test**, and every test passed before and after the defect existed.

#### 4.1 🔴 The member link told a member their 60-minute class was 25 minutes · FIXED

**What is wrong.** `durMin` is optional per stage — `summaryContent` writes it only when a
stage's seconds round to at least a minute — and `summaryTotals` summed it as if it were not.
The fallback to the class's own `durationMin` fired only when the sum was exactly **zero**, so a
class with *no* durations reported correctly and a class with *some* reported a partial sum
wearing a total's label.

**Evidence.** Driven against a payload shaped exactly like `summary-read`'s response
(`index.ts:212–223`): a 60-minute class with a timed warm-up (10), an untimed stage, and a timed
conditioning block (15) rendered **"25 min · 4 movements · with Priya"**. Thirty-five minutes
short, with `klass.durationMin: 60` unused in the same payload.

**What it costs a gym.** This is the only page in the product a member ever sees, and
`UI-UX-DIRECTION` §1 ranks it above every staff screen. A member reads a false fact about a class
they were in.

**Fix.** The stage sum is offered as the class length only when *every* stage is timed; otherwise
the class's own duration; otherwise the fact is dropped rather than guessed. 3 unit + 3 e2e.

⚠️ My first commit message for this claimed a coach "leaves the strength block untimed" as
ordinary programming. **That was wrong and I amended it.** Every stage-creation path in the app
sets a duration. The way in is §4.2.

#### 4.2 🔴 A coach typed `-5` and the Room TV said "Warm-Up · -5m" · FIXED

**What is wrong.** `<input type="number" min="1" max="60">` does not clamp — `min`/`max` are
validation hints, not limits on what reaches `e.target.value`. The handler was
`parseInt(e.target.value || "1") * 60`, which defends the empty string and nothing else.

**Evidence.** Driven through the real Builder control, then followed to each place the number
surfaces:

| typed | stored | consequence |
|---|---|---|
| `-5` | `dur: -300` | Builder header read **"30 min · 5 stages"** for 35 minutes of stages. Room TV rendered **"Warm-Up · -5m"** in the plan strip and as the running stage |
| `0` | `dur: 0` | `summaryContent` drops the key — this is the route into §4.1 |
| `999` | `dur: 59940` | 16.6 hours. Absurd but not wrong |

**What it costs a gym.** A typo in a number field puts a negative duration on the biggest screen
in the room, in front of paying members, and silently shortens the class total everywhere it is
summed. Nothing on screen names the stage responsible.

**Fix.** `stageDurSec` in `lib/format.js`, floored at one minute. **No ceiling, deliberately** — a
75-minute open-gym block is real, and rewriting a coach's 75 to 60 destroys input rather than
rejecting it. 4 unit + 5 e2e, one of which asserts the Room TV board itself.

#### 4.3 🔴 A second class in one time slot was scheduled, counted, published — and invisible · SURFACED

**What is wrong.** `effSchedule` is an object keyed on `day-slot`, so merging rules onto it is
last-wins. Nothing prevents a second rule on a taken cell: day and slot are `<select>`s with no
uniqueness check.

**Evidence.** Driven through the real Add-class form, twice into Mon 06:00:

```
stored rules             2      both, correctly
"N classes this week"    2      counted from occurrencesForWeek, not the grid
"Publish week · N"       2      it WILL publish the hidden one
drawn on the grid        1      the second; the first is gone
```

**What it costs a gym.** A studio with two rooms — an ordinary boutique timetable — loses a class
from the only screen that shows the timetable, on day one. It cannot be seen, edited, removed or
started, while every count says it is there. A coach who adds it, sees nothing and adds it again
ends up with three rules and one cell.

**Fix, and what is deliberately NOT fixed.** Drawing several classes per cell is a product
decision (see §5.2) — there is no room or studio concept for two concurrent classes to belong to.
The **silence** is not a decision: the screen now names every rule the grid could not draw, with
which cell and what is in front of it. 3 e2e, all driving the real form.

#### 4.4 🔴 Analytics said "0 with a check-in" two inches under a sentence counting three · FIXED

**What is wrong.** `cohortModel` sets `measured: withRows.length` in `base` and then overwrites it
with `cohortMembers.length` in `mid`. The gate's stat card kept the label **"WITH A CHECK-IN"**
while carrying the second number.

**Evidence.** Rendered on a gym whose members all arrived in the import boundary month:

```
3 MEMBERS ON ROSTER    0 WITH A CHECK-IN    7 FULL MONTHS

"A retention curve needs at least 12 members with a recorded check-in. None do yet
 (3 more were first seen in Feb 2026, …)"
```

Three members had checked in. The card said none had, the sentence said none had, and the
parenthetical inside the same sentence counted three.

**What it costs a gym.** On the one screen whose entire job is numbers an owner can trust, two
elements six inches apart contradict each other. An owner who notices stops trusting the screen;
one who does not concludes their import failed.

**Fix.** `withCheckIn` is its own field and the card carries it; the requirement is reworded to
what it measures — "members whose first class can be dated". 2 unit + 1 e2e comparing the card
with the sentence, which is the comparison nothing was making.

#### 4.5 🟡 The Schedule supports exactly five class times · NOT FIXED, see §5.1

`const SLOTS = ["06:00","09:00","12:00","18:00","19:30"]` is hardcoded in `CalendarScreen`, and it
is both the grid's rows and the Add-class form's options. **A gym cannot schedule a 07:00 class.**
Verified: there is no other writer of a schedule rule's `slot` anywhere in `src/`.

This is a hard product limit, not a bug, which is why nothing was changed. It is the single most
likely thing to stop a studio on day one — most boutique timetables run 07:00, 07:30, 17:30 and
19:00. Costed in §5.1 and filed for decision as **A20** in `DYLAN-QUEUE.md`.

#### 4.6 🟢 The e2e flakes did not reproduce, and the store-writer audit cries wolf

Two things §4.2 of the prompt pointed at, measured rather than assumed:

- **The mount flake and the slow-render timeout did not appear once.** Six full-suite runs on this
  branch, 516 → 534 tests, all green, all first-attempt. That is not evidence they are fixed —
  they are recorded as intermittent — but it is six data points and they are worth recording
  rather than re-describing.
- **`audit-store-writers.mjs` reports three 🔴 NO WRITER lines on every run, and all three are
  documented false positives** (`addCoach.id` is a test seam; `addMember`/`updateMember`'s
  `externalRef` is written by `applyAttendanceImport`, which the sweep classifies as unchecked).
  `docs/STORE-WRITER-AUDIT.md` §"What the sweep cannot see" already triages all three. The tool is
  correct and its output is not: a red flag that is always wrong is a red flag that stops being
  read. Costed in §5.5.

#### 4.7 🟢 Two things I checked that turned out to be my own fixture

Recorded because "do not report a defect your own fixture manufactured" is only useful if the
near-misses are written down too.

- **The away board's "No classes still to come those days"** for a coach who teaches on those days.
  My fixture wrote an absence straight into localStorage, bypassing `recordAbsence` →
  `raiseCoversForAbsence`, so no cover requests existed and the count was honestly zero. Driven
  through the real form, the board reads **"2 classes, nobody yet"** and correctly resolves the
  lowercase `mara` alias to the same coach. **The S30–33 cover stack holds up.**
- **Analytics reporting "no check-ins" on a seeded gym.** My attendance rows used `at` instead of
  `checkedInAt`. The screen was right.

---

### 5 · Proposals

Each with a cost, so it is decidable rather than a wish.

#### 5.1 🔴 Let a gym enter its own class times · ~2 days

The five hardcoded slots (§4.5) are the most likely day-one blocker in the product. A studio
whose 07:00 class cannot be entered has not been onboarded.

**Shape:** the grid stops being a fixed `SLOTS × DAYS` matrix and derives its rows from the
distinct times the gym's own rules use, with the current five as the seed for an empty gym; the
Add-class form's `<select>` becomes a `type="time"` input. Touches `CalendarScreen`,
`scheduleInstances.js` and `coachRoster.js`'s availability matching (which answers in
`day`/`slot` pairs). No migration — `class_rules.slot` is already a free-text column.

**The decision underneath it:** whether the grid stays a grid. A gym running eleven distinct
times gets an eleven-row wall. A day-column list ordered by time would scale better and is a
bigger change.

#### 5.2 🟡 Decide whether Jungle models concurrent classes · ~3 days if yes

§4.3 is surfaced, not fixed. Two coherent answers:

- **Yes.** A cell becomes a list; the edit, remove, `cellKey` occurrence lookup and Start button
  all become per-class. Probably wants a room or studio field so the two are distinguishable, and
  that IS a migration.
- **No.** The Add-class form refuses a taken slot and says which class holds it. Half a day, and
  it makes the limit explicit rather than merely stated — but it removes a capability a two-room
  studio needs.

Doing nothing is also coherent now that the screen says what it is hiding.

#### 5.3 🟢 `max="60"` on the stage duration still claims what it does not enforce · 1 hour

§4.2 floored the input and deliberately left the ceiling. `999` still stores 16.6 hours. Either
raise the attribute to something a class could be, or warn above 60 rather than silently
accepting. A clamp is the wrong answer — it destroys a coach's 75.

#### 5.4 🟢 Move "Add a 1:1 client" below the client list · 2 hours

The exact shape session 35 fixed on Members and this session merged: the panel for the thing you
do occasionally sits above the list you read every day. On a 390px phone the client list starts
below the fold. Same argument, same fix, same test shape. Not done here because it is a design
judgement and applying one screen's ruling to another is Dylan's call, not a defect.

#### 5.5 🟢 Teach the store-writer audit its own allowlist · 2 hours

§4.6. `docs/STORE-WRITER-AUDIT.md` already contains the triage for all three permanent false
positives. Moving it into the script as a named, commented allowlist — with the allowlist itself
as the positive control, which `storeWriters.test.js` already does — makes a clean run mean
something. Today it means "the same three as always", which is indistinguishable from a
regression.

#### 5.6 🟡 D2 and D3 are blocked on the PT decision, not on effort

Written up in `docs/PT-RECONCILIATION.md` §3 rather than built. The short version: **the rival
branch does not fix D2 either** — its `clients:*` sits on `coach`, so every coach still sees every
client on both implementations. What differs is what is *displayed*. D2 is two questions wearing
one number, and only the first is a defect. Building the wrong one twice is what session 28 cost.

#### 5.7 🟢 The orphan 1:1 row sorts to the top of the coach's day · 1 hour

`_byCoachDay` falls through to `localeCompare` on `name`, and an orphan's name is `""` — so the
one row a coach can now only erase sits above every client they are actually training. Sorting
orphans last is a one-line change plus a test. Cosmetic, and it is on a screen a trainer opens
daily.

---

### 6 · What in this prompt, and in this repo's own docs, was false

Sessions 26, 27, 34 and 35 each found something. So did this one, and the largest is an
instruction that would have shipped a broken tree.

#### 🔴 §2.1's "take the higher" would have shipped a tree over budget

> *"`check-size.mjs` is a UNION again, and session 34 raised `PTScreens` to 36 while this branch
> raised it to 36/38 for D6 — take the higher"*

The two branches raised it to **the same pair** (36 credential-less / 38 prod), so "take the
higher" resolves to 36 — and the merged tree measures **37.19 KB**. Following the instruction as
written produces a red `npm run size`. The instruction was reasoning about the numbers rather than
about what bought them; the additions are disjoint and add up. Raised to 39/41 with the general
rule recorded beside it.

#### 🔴 `CLAUDE.md`'s gate line was unsubstituted template placeholders

On `claude/integrate-coach-cover-s2933` the line a session is told to check its position against
read, literally:

```
Green as of the S29-33 merge: **`lint:crash` 0 · @@UNIT@@ unit (@@UNITF@@ files) · @@E2E@@ e2e
(@@E2EF@@ spec files) · @@CHUNKS@@-chunk build · 0 over budget.** App.jsx is **@@APPLINES@@ lines**.
```

Introduced by `d6c0270`, the S29–33 merge commit, which wrote the line as a template and
substituted nothing. **The prompt's own numbers were correct and the repo's were not** — §0.1's
`1230 unit (45 files) · 512 e2e · 14-chunk build · StaffApp 327.25 · PTScreens 34.83` all verified
exactly. Filled in, with the failure named so the next merge does not repeat it.

And the line still on `main` — **935 unit (33 files), 466 e2e (45 spec files), a 7-chunk build,
App.jsx at 3,857 lines, StaffApp 354.16/360** — is wrong in every figure. It is 1277 / 534 / 48 /
14 / **2,425** / 331.41. App.jsx is 1,432 lines shorter than the file claims, because the screens
were extracted and nobody updated the sentence.

#### 🔴 `npm run test:e2e | tail -25` reports the exit code of `tail`, which is always 0

**I read a fully red suite as a green baseline.** Every spec was failing at ~2 ms on the missing
chromium build; the pipe swallowed the exit code and the tail showed only test names. Caught on
the next run only because that one wrote to a file instead of a pipe. Now in `CLAUDE.md`: redirect,
never pipe, and grep the count line — a summary that does not say `N passed` is not a pass.

#### ⚠️ §3.2's "the rival branch's `clients:*` solves it better" is half true and misleading

It solves the *naming* better — the split is expressible, and `frontdesk` is deliberately excluded
with an argument. It does **not** solve the scoping: `clients:*` sits on `coach`, so every coach
still reads every client. Reading it as "the rival fixes D2" would have deferred a defect to a
branch that does not fix it. Full comparison in `docs/PT-RECONCILIATION.md` §3.

#### ⚠️ Session 34's Playwright note is exact, and my correction to it was wrong

I wrote into `CLAUDE.md` that the `executablePath` override must go per-project because
`defineConfig` merges project `use` over the top level. **I had not tested that.** I did, it is
false, the documented top-level form works, and I removed the claim before committing. Recorded
because the repo's whole discipline is not writing a confident sentence you have not measured, and
I nearly shipped one into the file that teaches it.

#### ⚠️ My own overclaim in `e4adf54`, amended before push

The first draft of §4.1's commit message said a coach leaving a strength block untimed is ordinary
programming. Every stage-creation path in the app sets a duration; the real route is §4.2's input.
Amended. The fix is unchanged and correct either way — the payload schema makes `durMin` optional
regardless of which client version wrote it.

#### 🟢 Things in the prompt that were exactly right

Worth saying, so the corrections above are readable as corrections rather than as a pattern: the
conflict sets in §2.1 (both, precisely, including which files and why), the base branch's gate
numbers, the A16 collision, the handoff fork and its `28-PT` filing, D2/D3/D7 all still unfixed on
arrival, and `git merge-tree --write-tree` being the form that tells the truth.

---

### 7 · If you only do three things

1. **Run `0010`** (A14). A `member` account reads the whole gym until you do, and nothing in this
   repository can tell you whether you have.
2. **Run `0011` and put the Supabase credentials in the build** (A17). Merging this branch does
   not let a coach find cover. A17 does.
3. **Read `docs/PT-RECONCILIATION.md` §6 and answer the one question.** Everything else about PT
   is blocked behind it, including two defects that are written up rather than built.

---

## Session 34 — three defects fixed, and three claims in the brief that were not true

> **Gates green.** `lint:crash` **0** · **964 unit** (33 files) · **469 e2e** (45 spec files) ·
> seven-chunk build, **0 over budget**. StaffApp **355.19 / 360 kB** (4.8 kB left, still the
> binding constraint). `PTScreens.js` **34.00 / 36 kB** — ceiling raised from 34 in this commit,
> see below. App.jsx unchanged at **3,857 lines**.

**The brief was session 34's own prompt.** Its §2 is blocked on Dylan; its §5 says so and names the
fallback: *"Build §2.4's D1, D4 and D5 instead; none depend on it."* That is what this session did,
plus the verification §0.1 and §0.3 ask for. **§2.1 and §2.2 were deliberately not actioned** — see
"What is still Dylan's" below.

### 🔴 Three false premises, in order of how much they mattered

The prompt's §0.3 says a prompt is wrong somewhere and §5 says to record it explicitly. It was
wrong in three places, and the first one would have shipped a compliance defect.

1. 🔴 **D5 asked for `store.recordConsent()` with a `health_screen` scope. Both halves are wrong.**
   - `consent_records.scope` carries a CHECK constraint (migration `0007`) listing exactly
     `roster_attendance`, `biometric_live`, `biometric_store`, `coach_view`, `export`.
     **`health_screen` is not in it, so every insert would have been REJECTED by Postgres** — this
     repo's recurring data-loss bug, three prior occurrences, and the reason `RETENTION_RULES`
     exists as one exported constant. Adding the scope needs a migration, which §3 forbids.
   - Worse, and the reason this is not merely a bug: **a `consent_records` row asserts that a person
     consented.** `CheckInPanel` already refuses to write one, in its own words — *"in a coach
     sweep, none was [shown]... writing one anyway would fabricate a compliance record, which is
     worse than an empty ledger."* The prompt's other half ("and so is attendance") asked for
     exactly that fabrication, for health data.

   **So the letter of D5 was refused and its intent was built instead.** The health screen, unlike
   a coach sweep, is a form somebody sits and fills in — so a notice can actually be shown and
   actually agreed to. `PARQ_CONSENT_NOTICE` is on the page, the checkbox starts unticked, and
   `appendParqRecord` **refuses to write health answers without it**. Nothing is sent to a column
   that would reject it. Filed as **DYLAN-QUEUE A16**.

2. 🔴 **§2.3: the sessions 29→33 stack does NOT merge cleanly.** The prompt says *"At `4bf138e` it
   had zero conflict hunks with `main`. That number only goes up."* `main` is still `4bf138e`, so
   nothing decayed — **the measurement was wrong.** The legacy `git merge-tree base ours theirs`
   form emits no conflict markers here, which reads as "clean"; `git merge-tree --write-tree` exits
   **1** and names **seven conflicted files**:

   `CLAUDE.md` · `SESSION-HANDOFF.md` · `docs/history/HANDOFF-ARCHIVE.md` ·
   `e2e/brandTokens.spec.js` · `scripts/check-size.mjs` · `src/App.jsx` · `src/lib/store.js`

   Four are prose and mechanical. **Three are code or config**, and the overlap with §2.2's stated
   PT collision set is not a coincidence: the stack was cut before session 28's PT work landed on
   `main`, so it collides with exactly that. ✅ The prompt's *other* §2.3 claim IS true —
   `gracious-hopper`, `session-29`, `-30` and `-31` are all ancestors of `prompt-32-verification`,
   so it is **one merge, not five**. This session made those three files worse, unavoidably: the
   gate numbers in `CLAUDE.md` and the `PTScreens` ceiling in `check-size.mjs` had to move.

3. **§2.5 undercounts the Dependabot PRs: there are TEN open, not nine.** The prompt lists
   `#2–#6, #8–#11`. **`#1` (actions/checkout 4→7) is also open.** `CLAUDE.md` said ten and was
   right. Still Dylan's call, unchanged.

**And one the prompt flagged as unknowable, now measured:** §0.3 says to test A15 by pushing a
`claude/**` branch and seeing if a PR appears. **That test cannot work yet.** `auto-pr.yml` lives
only on PR #14's branch, and a `push` event runs the workflow files present *on the pushed ref* —
so a branch cut from `main` never triggers it. PR #14's own `open` job did run and went green, but
its log shows it exited early with *"PR #14 is already open… the new commits are on it"* — it never
reached `gh pr create`. **A15's state was therefore unknown — and is now MEASURED, because #14 was merged
later in this session and the next push tested it for real.** The answer is **OFF**. Pushing this
branch ran `auto-pr.yml` from `main` for the first time, and the log says it exactly:

```
pull request create failed: GraphQL: GitHub Actions is not permitted to
create or approve pull requests (createPullRequest)
```

The job then warned and exited **clean**, which is the behaviour `af56d07` designed on purpose — a
workflow that is always red is one everybody learns to ignore, and the next real failure hides
behind it. So **A15 is confirmed outstanding, with the API's own words**, and until Dylan ticks the
box every `claude/**` branch still needs its PR opened by hand.

### What shipped

**D1 — a 1:1 client trained twice a week and was flagged for not turning up.** `addMember` always
stamps `joinedAt`, so rule 1 runs on every hand-added member; 1:1 sessions are deliberately never
written into `attendance`; so `visits` was **0** for someone in the gym twice a week. The flag fired
at the highest severity it carries, and `revenueAtRisk` priced it as money walking out. The member
never sees it, which is what made it expensive — the coach phones someone they trained on Tuesday.

`activityIndex(attendance, ptSessions)` merges both sources; **only DELIVERED sessions count**, because
a booking is an intention and counting it would let a client who books and never turns up look like
the most engaged member on the roster. Every flag's `reason` now names which kind it counted
("all one-to-one", or "1 in class, 2 one-to-one").

Three decisions inside it worth keeping:
- ⚠️ **`studioActivity` stays attendance-only, deliberately.** It answers a question about the
  STUDIO — "would firing the absence rule now produce a wall of false alarms?" — and a gym that
  imported two years of history and then ran one 1:1 must not have its whole back-catalogue flagged
  on the strength of that session. The cost is a silence, and the summary says so on screen.
- The 1:1 log is passed as **raw rows**, not via a helper. `store.js` imports `RETENTION_RULES` from
  `retention.js`, so importing `ptSessionStatus` back would close a cycle; and mapping it in
  `ptClients.js` would put a lazy module on RosterScreen's import graph — the seam CLAUDE.md warns
  about. A mirror test pins that the literal `"done"` matches store.js's own coercion.
- **The same index now feeds the roster rows AND the CSV export.** They used to count attendance
  directly, so a client whose flag said "attended 5 times (all one-to-one)" had `0` and "never"
  beside it, and the export — headed with the same two words, "Visits" and "Last seen" — said the
  same. That artefact is what a gym takes when it leaves and what a member gets when they ask what
  is held about them: the worst place in the product for a disagreement to live.

**D4 — a health screen went valid → blocking overnight.** `expiresOn` fed the hard cliff and nothing
else, so the first thing that ever mentioned an expiry was the refusal, discovered with the client
in the room. There is now a **30-day warning window**: `expiring` + `daysToExpiry`, a `warn` tone, a
deadline sentence with the date on it, a count on the 1:1 roster summary, and the chip saying
"expires in 12d". `blocksLoad` stays **false** throughout — a warning that blocked would just move
the cliff thirty days earlier.

⚠️ **It is a MODIFIER, not the "sixth state" the prompt asked for**, and that is deliberate:
`assignPtSession` writes `parqStateAtAssign: parq.state` as the audit trail, and `cleared` vs
`gp_cleared` are different assurances. A state that overwrote either near an expiry date would erase
which one applied *for exactly the sessions taken closest to the edge*. A test pins `"expiring"` out
of `PARQ_STATES`. (The prompt also miscounts: there were already six states, not five.)

The expiry warning is **text, not colour**. There is no `--warn` token — `colors.js` has accent,
green and danger, and danger is deliberately not skin-derived — so the options were to invent a
fourth global colour or say it in words. Words win twice: WCAG 1.4.1 forbids colour as the only
carrier, and `brandTokens.spec.js` sweeps opaque text for AA on a light skin, where a new amber
would have to earn 4.5:1 against a white card that `--danger` (3.8:1) already cannot.

**D5 — see false premise 1.** The consent is real, local, dated, versioned, and enforced in the
store as well as the screen, because a gate that lives only in JSX is one the next caller walks
through. An **amendment** (`amends`) inherits the prior row's consent rather than asking again —
a doctor's clearance appends a note against answers already given, and the client is not in the
room. A legacy record with no consent **inherits nothing, honestly**: back-filling today's date
would assert an agreement nobody was ever asked for.

### The size ceiling moved, and what bought it

`PTScreens.js` measured **34.00 KB against a 34 KB ceiling — passing by ONE BYTE** (33,999 of
34,000). That is a tripwire, not a guard. Raised to **36** (prod 36 → 38, keeping prod two wider as
the file's own note requires). What bought the bytes is prose, on the lazy side of the seam where
this repo wants prose: D4's expiry sentences and D5's consent notice. StaffApp absorbed **+1.03 kB**
(354.16 → 355.19) for `activityIndex` and the export's use of it, and needed no raise.

### The residual D1 does NOT fix, and it is a product decision

Rule 1 asks for **4 visits in the first month**, a threshold written for class attendance. A 1:1
client on a **weekly** cadence has 3 visits at day 21 and is still flagged. The prompt's stated
case — *"training twice a week"* — is fixed (≈5 visits by day 20, no flag), and the count is now
honest either way. But whether a weekly 1:1 cadence should trip a rule calibrated on classes is a
question about the product, not the arithmetic, and inventing a second threshold silently is exactly
the kind of number this repo refuses. **Left for Dylan, stated here rather than guessed at.**

### What is still Dylan's

- **§2.1 was NOT done autonomously — it was put to Dylan first, and he said land them.** The
  prompt's header says *"Do NOT run this session fully autonomously"* and its intro puts all of §2
  on him, and merging to `main` triggers a Pages deploy, so this was asked rather than assumed.
  **#14 is merged** (`bd04de0`), which put `ci.yml` and `auto-pr.yml` on `main` and made A15
  measurable — see above.

  ⚠️ **The prompt's step 2 does not work as written.** `workflow_dispatch` against
  `claude/rls-staff-read-boundary` cannot run `ci.yml`, because a dispatch runs the workflow file
  **from the chosen ref** and that branch was cut before `ci.yml` existed — there is no file there
  to dispatch. What works: merge `main` into it (no history rewritten, migration untouched) and let
  the `push` trigger fire. Done in `ec6cd89`, and **#13 has a running CI check for the first time in
  its life** — the gap the prompt's §2.1 exists to close.

  🔴 **Merging #13 still changes NOTHING on the server.** The policies move when **A14** is run in
  the SQL editor, not when the file lands. Do not report the RLS hole as closed on a merge.
- **§2.2 (which PT implementation survives) is untouched**, as instructed. No PT surface was added;
  D1/D4/D5 are all repairs to what is already on `main`, so none of them is wasted work if the
  rival implementation wins — the PAR-Q gate and the at-risk rules are shared either way.
- **A14 / A15 / B10 / A16** — unchanged, plus A16 is new (the `health_screen` consent scope).
- **`0005` and `0006` still unapplied.** Unchanged for several sessions.

---

> 🔴 **THE SESSION NUMBERING IS FORKED, AND BOTH HALVES ARE REAL.** `main` and the S29–33 stack
> diverged after session 27 and each numbered its next session **28**: main's built the 1:1 /
> PAR-Q path, the stack's rebuilt the white-label generator. Neither knew about the other. On
> merging, main's is filed in the archive as **`28-PT`** and the stack's keeps **28**. If a
> handoff, prompt or commit refers to "session 28", check which of the two it means — the commit
> is the only unambiguous reference. Sessions 29–33 are the stack's alone.
