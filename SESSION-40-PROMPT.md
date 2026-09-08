# Jungle — Session 40: the instrument exists now, so use it and then go where it cannot

**Run this one on your own**, the same way sessions 36–39 ran. Dylan is out of the loop while you
work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-39-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before you
start.** §4 is three defects that were live in the shipped product, one of them found by a test
written earlier in the same session; §6 is what the last brief got wrong plus five of the last
session's own retractions — including one it had to withdraw from its own report while writing it.

### 0.1 🔴 Your base is a stack of FOUR now, and you have to check it

- **PR #15** — `claude/session-36-queue-hunt-ty4q49` → `main`
- **PR #16** — `claude/session-37-unexplored-surfaces-8pas4o` → #15's branch
- **PR #17** — `claude/session-38-two-boards-seams-tx19ce` → #16's branch
- **PR #18 (session 39)** — `claude/session-39-prompt-vl5r13` → #17's branch

At the time this file was written all four were open and `main` was still `7508de1`.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
```

Then use the GitHub MCP tools (`list_pull_requests`, `pull_request_read`) — **there is no `gh` CLI
in this environment**, which is a change from what older prompts in this repo assume.

| What you find | What you do |
|---|---|
| **All four merged**, `main` moved | `git checkout -B claude/session-40-<something> origin/main` |
| **#18 still open** | base off `claude/session-39-prompt-vl5r13`. 🔴 **Do not redo any of its work.** Push to your OWN branch; leave all four existing PRs alone |
| **Some merged, #18 not** | still base off #18's branch — it already contains the others |
| **Any of them closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **Conflicts** | Resolve them ON YOUR BRANCH after basing off #18's. Do not force-push a branch you did not create |

**Confirm position with a gate, not with the log.** `npm test` should report **1310 unit (46
files)** and `npx playwright test --list` **615 in 53 files**. A tree that merely builds is not proof
you are where this prompt thinks you are. ⚠️ If those numbers are higher, somebody has worked since —
read `git log` before assuming this file is current.

### 0.2 🔴 The e2e browser needs a per-session shim, and it is in CLAUDE.md

`@playwright/test` 1.61.1 wants chromium build **1228**; the image ships **1194**, and
`npx playwright install` is refused by the agent proxy. CLAUDE.md carries the shell block that
presents the installed binaries under the name the client looks for. It has now worked verbatim,
first try, in sessions 37, 38 and 39. **`/opt` is writable but ephemeral, so this is a per-session
step. Do it first;** everything in §3 and §4 needs it.

⚠️ **DO NOT EDIT `src/` WHILE A FULL RUN IS IN FLIGHT.** Playwright loads the spec files at start
while the dev server serves the app over HMR, so later specs run your new code against the old
tests. **Only a run started on a quiet tree counts.**

⚠️ **A full run now takes ~14 minutes**, most of the growth being session 39's destructive sweep
(~4m40s of it). Start it in the background and do read-only work while it runs; do not sit and wait,
and do not pipe it (`| tail` reports `tail`'s exit code — redirect and grep the count line).

### 0.3 What in this prompt will have rotted

Sessions 26, 27, 34, 35, 36, 37, 38 and 39 each found false premises in their own briefs. Verify
before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| every "nothing drives X" in §3 and §4 | 🔴 **`grep` it yourself.** Session 38 lost time to a claim that a well-covered modal was untested; session 39's brief was wrong about how to drive drag-and-drop. Every claim below was checked against the code on 2026-09-08 — **check it again** |
| A14 / A17 / A20 still outstanding | 🔴 **you cannot check these.** Database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has not answered the three open decisions | ⚠️ **check `DYLAN-QUEUE.md`, all four PR conversations, and `git log` first.** If he answered, §2 changes completely |

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
  Dylan's, always. **Never merge PR #15, #16, #17 or #18** — opening one is not permission to merge
  one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo.
- **Never skip, disable, quarantine or allowlist a failing test to get green.**
- **Never claim a Dylan-only item is done.**
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-39-HANDOFF.md` §3 has the table. **Say all of it again in your report even though it is
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

**Three** decisions are in writing and waiting, none answered as of 2026-09-08:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product?
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list.
- **`SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw?** The most fully costed
  decision in the repo, and now two sessions old. `SESSION-39-HANDOFF.md` §5.1 carries it forward
  unchanged.

Look in `DYLAN-QUEUE.md`, in all four PR conversations, and in `git log`. **If any is answered, do
that first and let §3 wait** — an answered decision going unbuilt is how this repo came to have two
PT implementations.

---

## 3. Phase two — the named work, each with its own commit

All five come from `SESSION-39-HANDOFF.md` §5, where each was costed but not taken. None needs a
decision. Gate green between them. **Verify each again first** — §0.3.

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | 🔴 **"Reset to Defaults" does not say what it orphans.** It removes the gym's own class types and leaves every schedule rule pointing at a key with no entry. Session 39 fixed what the timetable then SHOWS (`classTypeLabel`); it did not warn the coach. The coach-delete confirm sets the precedent and its own comment states the principle — *"the cascade inventory IS the guard"*. Count the rules and instances that reference a gym-authored key and put that sentence in the confirm | `src/screens/LibraryBrowserModal.jsx`, `e2e/` | 2 h |
| **3.2** | 🟡 **Make the destructive sweep cheaper.** It costs **~4m40s** and CI runs one worker. Two thirds of that is the restore after a destructive press (reinstall the gym, reload, re-navigate ≈ 1.2 s). Session 39's own ranking: **(b)** restore by writing localStorage and re-navigating without a full reload is the real win, **(a)** capping the descent costs coverage, **(c)** splitting the file is cheapest and rots easiest. 🔴 **Whatever you do, the sweep must still find the four doors** — put the guard back on one caller, confirm the sweep goes red, revert | `e2e/destructiveSweep.spec.js` | 3 h |
| **3.3** | 🟢 **The Builder says nothing when the schedule names a class type the library lacks.** `schedKey = scheduledType && LIB[scheduledType] ? scheduledType : ""`, so the "Scheduled as X · Load X" notice appears only for a type still in the catalogue. Start a class whose type was reset away and the Builder prints its OWN class type with no notice. There is no template to offer, which is not a reason to say nothing | `src/App.jsx` (~line 846 and ~1125) | 1 h |
| **3.4** | 🟢 **`handleImportFile` blames the file for an error in the import.** One `try` wraps both `JSON.parse` and `onImportClass(...)`, so anything thrown inside the import is reported as *"Could not read that file"*. ⚠️ Narrowing the catch ALONE trades a wrong message for **no** message — the second half needs one of its own | `src/App.jsx` (~line 742) | 30 min |
| **3.5** | 🟢 **The Health Screen's client picker is 37px tall on a phone.** `tapScan` is opt-in — it scans `[data-tap]` — and a `<select>` carries none, so the 44px rule has never been asked of it. Either give it `data-tap` and a 44px box, or decide selects are out of scope and **write that down where the scanner is defined** | `src/screens/pt/`, `e2e/tapScan.js` | 1 h |

**If one of these turns out not to be a defect, say so in §5 and move on.** Session 26 refused three
items on its own brief and was right to; sessions 38 and 39 each refused one.

⚠️ **Session 39 §5.8 is deliberately NOT on this list.** The check-in panel says "A typical class
here is 2 members" after one class. Fixing it needs a minimum-sessions floor, and **choosing that
number is the work** — `MIN_TRIERS = 8` has an argument behind it and this would need one too. Take
it only if you can write the argument.

---

## 4. Phase three — hunt, and hunt the way sessions 36–39 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method, stated as a method

Session 39's three findings came from this loop and **not one came from a test** — though one came
from a test it had written an hour earlier, which is the same thing from the other end:

1. **Seed a gym that has actually been used.** `e2e/usedGym.js` now exists for this and is meant to
   be shared. An empty screen passes every scan trivially.
2. 🔴 **Copy the fixture's row shapes out of the SOURCE, not out of your head.** Session 39 keyed a
   PAR-Q fixture by readable names when `parq.js` keys by `q1…q7`, and nearly reported the resulting
   "Part-answered" as a product defect.
3. **Render it and READ IT** — at 1280×900, at 390×844, and for anything room-facing at 1280×720.
   ⚠️ **Then measure what the screenshot made you suspicious of.** A full-page screenshot renders a
   scrolling container at its natural width, which looks exactly like clipping and is not.
4. **Then check the STORED object.**
5. **Prove it is reachable through the shipped UI before reporting it.** Session 39's third finding
   took four clicks from a shipped button; it wrote the click path out before believing it.
6. 🔴 **Ask what the product SAYS, not only what it does.** Two of session 39's three findings were
   NOUNS — "562 members measured" over a number that counts member-class pairs, and a storage key in
   the slot where a class name goes.

### 4.2 Where to look, in order, and why these

Measured on 2026-09-08. **Re-check before trusting it** (§0.3).

1. 🔴 **Run the sweep's own method by hand on what it cannot see.** Its header names three blind
   spots and they are a to-do list: a **soft delete** (a scalar change is a write, not a loss, so a
   row flagged and filtered out is invisible), anything needing **typing or a file**, and controls
   **more than one level** below a screen. Grep for `status`/`active`/`archived` writers and ask
   which of them a coach would call a delete.
2. 🔴 **Every other `?.label || key` in the product.** Session 39 fixed the five class-type sites.
   `ProfileModal.jsx:186` does the same over stage types and was deliberately left; check whether
   any OTHER map can lose an entry while rows still point at it. The generalisation in CLAUDE.md is
   the lead: *a sweep whose fixture cannot reach the failing state is a sweep that will pass
   forever* — so go looking for the other sweeps with that shape.
3. **Analytics and Retention with enough history to produce a number.** Session 39 seeded 200
   members and 14 months and read the class-type panel; it did **not** read the cohort table, the
   "How long members stay" half-life card or the Revenue-at-risk screen with that data. Those are
   three more panels whose refusals are well tested and whose ANSWERS are not.
4. **A gym that edits.** Rename a class type that is on the schedule and in history; delete a member
   with attendance; change a class's day and slot after it has been published. Session 39 checked the
   coach rename (guarded, `coachEditPatch` adds the old name as an alias) and left the rest.
5. **The Room TV at 1280×720 with a class actually running.** Session 38 measured the boards; nobody
   has driven the Runner INTO them mid-class with a seeded gym and read what they say.
6. **`node scripts/audit-store-writers.mjs` after every change.** It exits 0 with 0 unexplained
   today, so a red line is a finding.
7. **The e2e flakes.** ⚠️ **Not seen since session 33**, and session 39 explicitly reported seeing
   none across a full run and six sweeps. Treat the entry as folklore; if you see one, you have the
   best chance anyone has had. If you get to the end having seen none, **say so**.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Do not build a feature Dylan has not asked for because you found a gap; propose it with
a cost.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-40-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 38 moves to the archive, newest-first), and summarise it in the final chat
message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** A red gate you chose to leave is fine; one you did not mention is
   not.
3. **🟥 Dylan's list** — every item in §1.3, restated even where nothing changed, plus anything new.
   **Repeat, in words: merging branches does not let coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym. **Include the near-misses.**
5. **Proposals** — decidable, not a wish list. 🔴 **Carry forward anything of sessions 38's and 39's
   §5 that Dylan has not answered**, so an unanswered decision does not quietly fall off the list.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something.
   **Include your own retractions** — session 39 recorded six, one of them a claim it had to withdraw
   from its own report while writing it.

Then, and only then, **open one pull request** (§1.1) against `claude/session-39-prompt-vl5r13`
(or against `main` if the stack has merged). Do not merge it.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately and
  in full; do not keep working to tidy up first.
- Any of the four open PRs is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for §4,
and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
