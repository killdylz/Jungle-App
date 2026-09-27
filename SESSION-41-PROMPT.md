# Jungle — Session 41: the sweep can see further than it does, and one control stops the page

**Run this one on your own**, the same way sessions 36–40 ran. Dylan is out of the loop while you
work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-40-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before you
start.** §4 is three defects that were live in the shipped product — one of them in the *instrument*
the last two sessions built to find defects; §6 is what the last brief got wrong plus **six** of the
last session's own retractions, two of which are cases of it blaming its own change for a fault that
was already there.

### 0.1 🔴 Your base is a stack of FIVE now, and you have to check it

- **PR #15** — `claude/session-36-queue-hunt-ty4q49` → `main`
- **PR #16** — `claude/session-37-unexplored-surfaces-8pas4o` → #15's branch
- **PR #17** — `claude/session-38-two-boards-seams-tx19ce` → #16's branch
- **PR #18** — `claude/session-39-prompt-vl5r13` → #17's branch
- **PR #19 (session 40)** — `claude/jungle-session-40-q4batq` → #18's branch

At the time this file was written all five were open, **with zero comments on any of them**, and
`main` was still `7508de1`.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
```

Then use the GitHub MCP tools (`list_pull_requests`, `pull_request_read`) — **there is no `gh` CLI
in this environment**, which is a change from what older prompts in this repo assume.

| What you find | What you do |
|---|---|
| **All five merged**, `main` moved | `git checkout -B claude/session-41-<something> origin/main` |
| **#19 still open** | base off `claude/jungle-session-40-q4batq`. 🔴 **Do not redo any of its work.** Push to your OWN branch; leave all five existing PRs alone |
| **Some merged, #19 not** | still base off #19's branch — it already contains the others |
| **Any of them closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **Conflicts** | Resolve them ON YOUR BRANCH after basing off #19's. Do not force-push a branch you did not create |

**Confirm position with a gate, not with the log.** `npm test` should report **1321 unit (47
files)** and `npx playwright test --list` **620 in 53 files**. A tree that merely builds is not
proof you are where this prompt thinks you are. ⚠️ If those numbers are higher, somebody has worked
since — read `git log` before assuming this file is current.

### 0.2 🔴 The e2e browser needs a per-session shim, and it is in CLAUDE.md

`@playwright/test` 1.61.1 wants chromium build **1228**; the image ships **1194**, and
`npx playwright install` is refused by the agent proxy. CLAUDE.md carries the shell block that
presents the installed binaries under the name the client looks for. It has now worked verbatim,
first try, in sessions 37, 38, 39 and 40. **`/opt` is writable but ephemeral, so this is a
per-session step. Do it first;** everything in §3 and §4 needs it.

⚠️ **DO NOT EDIT `src/` WHILE A RUN IS IN FLIGHT** — and that includes `npm run size`, which
**builds `dist/`** while the preview web server is serving it. Session 40 threw away two runs, one
to each. **Only a run started on a quiet tree counts.**

⚠️ **A full run is ~15 minutes** (it was ~21 before session 40 cut the destructive sweep from
~13.5m to 4.8m). Start it in the background and do read-only work while it runs; do not sit and
wait, and do not pipe it (`| tail` reports `tail`'s exit code — redirect and grep the count line).

### 0.3 What in this prompt will have rotted

Sessions 26, 27, 34, 35, 36, 37, 38, 39 and 40 each found false premises in their own briefs.
Verify before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| every measurement in §3 and §4 | 🔴 **Re-measure it yourself.** Session 40's brief was wrong about the suite's run time (said ~14 min, it was 21) and offered a fix for §3.5 that is not physically available. **Its own handoff then shipped two wrong numbers in one section and had to correct them in a follow-up commit** — read `c08d99b` before trusting a figure in a handoff |
| A14 / A17 / A20 still outstanding | 🔴 **you cannot check these.** Database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has not answered the three open decisions | ⚠️ **check `DYLAN-QUEUE.md`, all five PR conversations, and `git log` first.** If he answered, §2 changes completely |

---

## 1. Your authority this session

### 1.1 ✅ Pre-authorised — do these without asking

- Write code, tests, comments, docs. Fix defects. Add what §3/§4 name.
- Merge any `claude/**` branch **into another `claude/**` branch**, resolving conflicts.
- Raise a size ceiling **in the commit that needs it**, saying what bought the bytes.
  🔴 **Re-measure after any merge that touches a budgeted chunk.**
- Rename or edit an **unapplied** migration.
- Commit and `git push -u origin claude/**`.
- **Open ONE pull request at the very end**, from your branch, once §5 is written.
- Run every gate as often as you like.

### 1.2 ⛔ Never, this session — no exceptions, and do not ask

- 🔴 **Never push or merge to `main`.** A push to `main` deploys to GitHub Pages. Shipping is
  Dylan's, always. **Never merge PR #15, #16, #17, #18 or #19** — opening one is not permission to
  merge one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo.
- **Never skip, disable, quarantine or allowlist a failing test to get green.**
- **Never raise `test.setTimeout` to make a slow test pass.** Session 40's whole §3.2 exists
  because a sweep grew past its own budget; the answer was to make it cost less, not to move the
  line. If you genuinely need more time, say so in §5 with the measurement behind it.
- **Never claim a Dylan-only item is done.**
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-40-HANDOFF.md` §3 has the table. **Say all of it again in your report even though it is
unchanged**, and say plainly which block a user-visible outcome:

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.**

---

## 2. Phase one — find out what changed, then act on it

### 2.1 Read for answers before you read for work

**Three** decisions are in writing and waiting, none answered as of 2026-09-26:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product?
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list.
- **`SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw?** The most fully costed
  decision in the repo, and now **three sessions old**. Sessions 39 and 40 both carried it forward
  unchanged.

Look in `DYLAN-QUEUE.md`, in all five PR conversations, and in `git log`. **If any is answered, do
that first and let §3 wait** — an answered decision going unbuilt is how this repo came to have two
PT implementations.

---

## 3. Phase two — the named work, each with its own commit

3.1 and 3.2 are one thread and 3.1 blocks 3.2. The rest are independent. Gate green between them.
**Verify each again first** — §0.3.

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | 🔴 **One control leaves the page unable to run ANY `page.evaluate`.** Press the Profile modal's "Sign Out" from the sweep and every subsequent read never returns — no dialog event, no `pageerror`, and a screenshot that looks perfectly normal. Session 40 could not find the cause and bounded the reads instead, so the sweep now fails fast with a sentence rather than timing out at 240s. **That is a bandage.** `logout` is the Spotify stub, `auth?.signOut?.()` is a no-op without Supabase, and there is no `beforeunload` in the tree — so the cause is somewhere nobody has looked. Reproduce it OUTSIDE the sweep first, in a throwaway spec, so you are debugging the app and not the instrument | `src/screens/ProfileModal.jsx`, `src/App.jsx:2641`, `e2e/` | 3 h |
| **3.2** | 🟡 **The sweep cannot descend into a `React.lazy` panel, and never could.** `ProfileModal` and `LibraryBrowserModal` render after `SETTLE_MS`, so a press that opens one is recorded as a press that opened nothing. It reached the Profile modal until session 40 **only by accident**: that click failed its actionability check, waited 1500ms and was forced, which read the revealed set two seconds late. 🔴 **The fix is already written, measured and deliberately not landed** — it recovers the descent on eight screens and then trips 3.1. Land it once 3.1 is understood. The reasoning is in `destructiveSweep.spec.js` above `CANDIDATES` | `e2e/destructiveSweep.spec.js` | 2 h **after 3.1** |
| **3.3** | 🟡 **The 44px rule still has not been asked of most of the product.** Session 40 gave the shared `Select` a 44px box and `data-tap`; the shared `Input` renders **35px**, and **18 raw `<select>` elements** live outside the primitive — App.jsx (5), CalendarScreen (3), CoachCoverPanel (3), AdminTeamScreen (2), LibraryBrowserModal (2), one each in RosterScreen, BrandStudioScreen and PlaylistImportModal. ⚠️ **`data-tap` alone does nothing on a `<select>`** — no `::after` is generated for a replaced element; the box itself must carry it. The judgement worth one line: do text fields belong in the rule at all? | `src/ui/primitives.jsx`, `e2e/tapScan.js`, `e2e/mobile.spec.js` | 2 h |
| **3.4** | 🟢 **Three routes are behind a false flag and nothing has ever read them.** `MOCK_VIEW_FLAG` maps `integrations`, `templates` and `glossary` to `false`. The one flagged-off screen anybody looked at held **six** real mount-write defects. 🔴 **And one of session 39's "four doors" is a door into a room nobody can enter**: `handleSelectTemplate` has no reachable caller — the Builder's presets picker calls `onImportClass`, and the Templates screen that used to reach it is flagged off. Session 29 deleted `AnalyticsScreen` rather than leave a mock behind a flag; that is the precedent | `src/config/flags.js`, `src/App.jsx` | 2 h |
| **3.5** | 🟢 **`parseCsv` and semicolons.** Session 37's, carried by 39 and 40. Sniff the delimiter only when the comma-parse yields exactly one column. ⚠️ **Worth doing if a pilot gym's export is `;`-separated and not otherwise** — if you cannot find a reason to believe that, say so in §5 and skip it rather than building it speculatively | `src/lib/csvImport.js` | half a day |

**If one of these turns out not to be a defect, say so in §5 and move on.** Session 26 refused three
items on its own brief and was right to; sessions 38, 39 and 40 each refused one. **Session 40 also
ADDED a guard nobody asked for, for a state the product cannot reach, and had to remove it in the
same commit** — the tell was that its test passed with the guard mutated away.

⚠️ **The check-in panel's "A typical class here is 2 members" is deliberately NOT on this list**, for
the third session running. Fixing it needs a minimum-sessions floor and **choosing that number is
the work** — `MIN_TRIERS = 8` has an argument behind it and this would need one too. Take it only if
you can write the argument.

---

## 4. Phase three — hunt, and hunt the way sessions 36–40 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method, stated as a method

Session 40's three findings came from this loop and **not one came from a test**:

1. **Seed a gym that has actually been used.** `e2e/usedGym.js` is the shared fixture. An empty
   screen passes every scan trivially — and session 40 found the Health Screen's tap sweep had been
   scanning a screen with no controls on it for four sessions.
2. 🔴 **Copy the fixture's row shapes out of the SOURCE, not out of your head.** Session 40 read
   "0 CLASSES RUN" beside "382 CHECK-INS" as a contradiction the product ships; it was its own
   fixture, because `applyAttendanceImport` creates an instance for every imported class. It
   checked before reporting, which is the only reason that is a near-miss and not a false finding.
3. **Render it and READ IT** — at 1280×900, at 390×844, and for anything room-facing at 1280×720.
   ⚠️ **Then measure what the screenshot made you suspicious of.**
4. **Then check the STORED object.**
5. **Prove it is reachable through the shipped UI before reporting it.**
6. 🔴 **Ask what the product SAYS, not only what it does.** Session 40's retention finding was a
   headline that said "More than half were still training" over a chart reading exactly 50%.

### 4.2 Where to look, in order, and why these

Measured on 2026-09-26. **Re-check before trusting it** (§0.3).

1. 🔴 **Run the sweep's own method by hand on what it still cannot see.** Its header names the
   blind spots and they are a to-do list: a **soft delete** (a scalar change is a write, not a
   loss), anything needing **typing or a file**, and — until 3.2 lands — anything inside a **lazy
   panel**. Session 40 checked the coach `active` toggle (honest, states its consequence in-line)
   and left `member.status` and `ptClient.status` undriven.
2. 🔴 **The other panels nobody has read with real data.** Session 40 read the half-life card and
   the cohort table and found a defect in the first. It did **not** read the class-type return-rate
   panel with a fixture whose check-ins carry types, the Revenue-at-risk screen at 390px, or the
   member summary a member actually opens.
3. **A gym that edits.** Rename a class type that is on the schedule and in history; change a
   class's day and slot after it has been published; rename a coach who has covers agreed. Session
   39 checked the coach rename; 40 checked none of the rest.
4. **The Room TV at 1280×720 with a class actually running.** Nobody has driven the Runner INTO
   the boards mid-class with a seeded gym and read what they say. Carried from session 39
   untouched.
5. **`node scripts/audit-store-writers.mjs` after every change.** It exits 0 with 0 unexplained
   today, so a red line is a finding.
6. **The e2e flakes.** ⚠️ **Not seen since session 33**, and sessions 39 and 40 saw none. 🔴 **But
   session 40 saw two things that LOOK like flakes and are not**: a 240s timeout on an untouched
   tree, and a sweep whose press count was 68, then 50, then 51 across three identical runs while
   passing every time. **If something in that file looks flaky, run it twice and diff the REPORT,
   not the pass/fail.** Session 40 lost two rounds to diagnosing its own changes for a variance
   that was already there.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Do not build a feature Dylan has not asked for because you found a gap; propose it with
a cost.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-41-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 39 moves to the archive, newest-first), and summarise it in the final chat
message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** A red gate you chose to leave is fine; one you did not mention is
   not. 🔴 **And say whether the suite was green at your BRANCH POINT** — session 40's was not, and
   it only found out because it ran the full suite before touching anything.
3. **🟥 Dylan's list** — every item in §1.3, restated even where nothing changed, plus anything new.
   **Repeat, in words: merging branches does not let coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym. **Include the near-misses.**
5. **Proposals** — decidable, not a wish list. 🔴 **Carry forward anything of sessions 38's, 39's
   and 40's §5 that Dylan has not answered**, so an unanswered decision does not quietly fall off
   the list.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something.
   **Include your own retractions** — session 40 recorded six, and then found two more wrong numbers
   in its own finished handoff and corrected them in a follow-up commit rather than leaving them.

Then, and only then, **open one pull request** (§1.1) against `claude/jungle-session-40-q4batq`
(or against `main` if the stack has merged). Do not merge it.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately and
  in full; do not keep working to tidy up first.
- Any of the five open PRs is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for §4,
and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
