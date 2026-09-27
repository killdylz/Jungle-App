# Jungle — Session 42: four controls the sweep has skipped every run, and the member's own page

**Run this one on your own**, the same way sessions 36–41 ran. Dylan is out of the loop while you
work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-41-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before you
start.** §4 is three numbers the product said that were not true, plus one it still says (§4.1);
§6 is what the last brief got wrong, including a claimed page-wedge that did not reproduce, and
three of the session's own retractions.

### 0.1 🔴 Your base is a stack of SIX now, and you have to check it

- **PR #15** — `claude/session-36-queue-hunt-ty4q49` → `main`
- **PR #16** — `claude/session-37-unexplored-surfaces-8pas4o` → #15's branch
- **PR #17** — `claude/session-38-two-boards-seams-tx19ce` → #16's branch
- **PR #18** — `claude/session-39-prompt-vl5r13` → #17's branch
- **PR #19** — `claude/jungle-session-40-q4batq` → #18's branch
- **PR #20 (session 41)** — `claude/relaxed-knuth-s6p32q` → #19's branch

When this file was written all six were open and `main` was still `7508de1`. The only comments
session 41 knows of are its own two on #20, about the auto-PR fix; it did not re-read #15–#18
thread by thread. Read all six.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
```

Then use the GitHub MCP tools (`list_pull_requests`, `pull_request_read`); **there is no `gh` CLI
in this environment.**

| What you find | What you do |
|---|---|
| **All six merged**, `main` moved | `git checkout -B <your branch> origin/main` |
| **#20 still open** | base off `claude/relaxed-knuth-s6p32q`. 🔴 **Do not redo any of its work.** Push to your OWN branch; leave all six existing PRs alone |
| **Some merged, #20 not** | still base off #20's branch — it already contains the others |
| **Any of them closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **Conflicts** | Resolve them ON YOUR BRANCH after basing off #20's. Do not force-push a branch you did not create |

⚠️ **The environment may assign you a branch name** (session 41's was `claude/relaxed-knuth-…`).
Use it. Any `claude/**` name satisfies §1.1.

**Confirm position with a gate, not with the log.** `npm test` should report **1328 unit (50
files)** and `npx playwright test --list` **624 in 53 files**. ⚠️ If those numbers are higher,
somebody has worked since — read `git log` before assuming this file is current.

### 0.2 🔴 The e2e browser needs a per-session shim, and it is in CLAUDE.md

Same block, sixth session running: it presents the installed chromium 1194 under the 1228 name the
client wants. **`/opt` is ephemeral, so do it first;** everything in §3 and §4 needs it.

⚠️ **DO NOT EDIT `src/` WHILE A RUN IS IN FLIGHT**, and that includes `npm run size`, which builds
`dist/` while the preview server serves it.

🔴 **A worktree protects the FILES, not the CPU.** Session 41 edited in a second worktree while
the full suite ran in the first, and ran specs and a build there too. The full run came back
`622 passed, 1 failed` on a fixture positive-control that then passed 15/15 alone. That run meant
nothing. **A full run counts only when nothing else is running on the machine.** And if you use a
worktree, **`cp -al` its `node_modules`, never symlink it**: Vite answers 403 and the e2e reports
failures that do not exist (CLAUDE.md has both).

⚠️ **A full run is ~16 minutes** (16.4m at session 41's HEAD). Start it in the background and do
read-only work while it runs. Redirect to a file and grep the count line; never pipe it.

### 0.3 What in this prompt will have rotted

Sessions 26, 27 and 34–41 each found false premises in their own briefs. Verify before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| every measurement in §3 and §4 | 🔴 **Re-measure it yourself.** Session 41's brief stated a page-wedge as fact and it did not reproduce; its §4.2 asked for a class-type rename the product does not have |
| A14 / A17 / A20 still outstanding | 🔴 **you cannot check these.** Database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has not answered the open decisions | ⚠️ **check `DYLAN-QUEUE.md` (A20, A21), all six PR conversations, and `git log` first.** If he answered, §2 changes completely |

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
  Dylan's, always. **Never merge PRs #15–#20** — opening one is not permission to merge one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo.
- **Never skip, disable, quarantine or allowlist a failing test to get green.**
- **Never raise `test.setTimeout` to make a slow test pass.** If you need more time, say so in §5
  with the measurement behind it.
- **Never change a workflow file.** Dylan authorised session 41's one-line `auto-pr.yml` fix by
  name; that does not carry forward. CLAUDE.md: no infra changes without asking.
- **Never claim a Dylan-only item is done.**
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-41-HANDOFF.md` §3 has the table. **Say all of it again in your report even though it is
unchanged**, and say plainly which block a user-visible outcome:

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A21** | When an absent member stops being "revenue at risk" — NEW in session 41 | **YES, on the day a gym imports** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.**

---

## 2. Phase one — find out what changed, then act on it

**Four** decisions are in writing and waiting, none answered as of 2026-09-27:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product?
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list.
- **`DYLAN-QUEUE.md` A21** — the at-risk ceiling: (a) N days, (b) import-aware, or (c) both.
- **`SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw?** Four sessions old.
  Session 41's §5.2 (the Floor board calls every class a clockwise station loop) waits on it too.

Look in `DYLAN-QUEUE.md`, in all six PR conversations, and in `git log`. **If any is answered, do
that first and let §3 wait.** 🔴 **A21 is the one most likely to be answered, and the cheapest to
build**: the flag list, the revenue figure and the Analytics copy each read `retention.js`, so a
ceiling has to be ONE constant that all three pass through, with the argument written beside it the
way `MIN_TRIERS = 8` has one. `revenueAtRisk.js` must price only what the list calls at risk, or the
panel contradicts itself (its header already says why).

---

## 3. Phase two — the named work, each with its own commit

The items are independent. Gate green between them. **Verify each again first** — §0.3.

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | 🔴 **The sweep has skipped the same four controls on every run, and nobody has asked why.** Both of session 41's full runs, and the branch-point run, report for 1:1 Clients: `skipped 4: Add client › Choose someone… Tom Wallace, Add client › Start health screen, Add client › Edit details, Add client › Training Paused Ended`. A skip is a press that did not happen. The names are themselves a clue: three look like the TEXT of a composite control rather than one button ("Choose someone… Tom Wallace" is a `<select>` with its options read as its name; "Training Paused Ended" is three segmented buttons read as one). Find out, for each, whether it is the NAME_OF function, the revealed-set dedupe, or a control that really cannot be reached. Recover the presses or state in the file why not | `e2e/destructiveSweep.spec.js`, `src/screens/pt/` | 2 h |
| **3.2** | 🟡 **The member's own page has never been read with a used gym.** `ClassSummary.jsx` is the one surface a MEMBER opens (the member path, `summaryApi.js`), and sessions 40 and 41 both carried "the member summary a member actually opens" unread. Seed a member with real history, open their page at 390×844, and read what it tells them about themselves. This is the one screen whose reader cannot ask the coach what it meant | `src/screens/ClassSummary.jsx`, `src/lib/summaryApi.js`, member path budget in `check-size.mjs` | 2 h |
| **3.3** | 🟡 **Session 41 fixed the Floor board's cap and did not look at the other two boards with a long class.** The Floor board drew 5 of a 6-stage class and called stage 5 the finish. Do the same drive for the **Plan** and **Coach** boards: Builder → add stages until there are 7, give one a 30-character name → Runner → Room TV at 1280×720 and 3840×2160. What does each board say about a class it cannot fully draw? ⚠️ CLAUDE.md already knows the Coach board's stage strip truncates; the question is whether anything it SAYS is false, not whether it is cramped | `src/screens/runner/OverviewDisplayScreen.jsx`, `DisplayScreen.jsx`, `e2e/display.spec.js` | 2 h |
| **3.4** | 🟢 **`Brand Studio · 1 pressed with force` is in every sweep report.** Force survives in the sweep for exactly one honest case: the target IS the element at its own centre and the click failed for another reason. Confirm that is what happens on Brand Studio, and say which control. If it is not the honest case, it is a press that did not happen reported as one that did, which is session 40's §4.1 over again | `e2e/destructiveSweep.spec.js`, `src/screens/BrandStudioScreen.jsx` | 1 h |

**If one of these turns out not to be a defect, say so in §5 and move on.** Session 41 refused one
item on its brief (the wedge) and dropped another (semicolon CSV) for want of a reason to build it.
Both were the right call. A guard that passes its test with the guard mutated away is not a guard.

⚠️ **Still deliberately NOT on this list:** "A typical class here is 2 members" (needs a
minimum-sessions floor, and choosing that number is the work), the re-slot's empty old occurrence
(session 41 §5.3: a decision on an append-only table), and the Builder's 30px exercise rows on a
phone (§5.6: a design call). Take one only if you can write the argument for the number or the
decision it needs, and put that argument in §5 instead of building it.

---

## 4. Phase three — hunt, and hunt the way sessions 36–41 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method, stated as a method

Session 41's four findings came from this loop and **not one came from a test**. Two of them
(the Floor board, CLASSES RUN) came from doing something a gym does, rather than seeding the end
state; one (the Builder chevron) came from looking at a screenshot a test had already passed.

1. **Seed a gym that has actually been used.** `e2e/usedGym.js` is the shared fixture. For
   anything historical, **import a CSV through the Members screen** instead of seeding rows: it is
   the real path, and it is how `applyAttendanceImport`'s choices (every member `active`,
   `joinedAt: ""`, an instance per imported class) reach the screen.
2. 🔴 **Copy the fixture's row shapes out of the SOURCE, not out of your head.**
3. **Render it and READ IT** — at 1280×900, at 390×844, and for anything room-facing at 1280×720.
   ⚠️ **Then measure what the screenshot made you suspicious of.** Height is not legibility.
4. **Then check the STORED object.**
5. **Prove it is reachable through the shipped UI before reporting it.**
6. 🔴 **Ask what the product SAYS, not only what it does.** Then do the arithmetic yourself.
7. 🔴 **Advance the clock.** Session 41's CLASSES RUN finding needed a week to pass
   (`page.clock.setFixedTime`, reload). A number that is right on the day you publish can be wrong
   a week later.

### 4.2 Where to look, in order, and why these

Measured on 2026-09-27. **Re-check before trusting it** (§0.3).

1. 🔴 **The coach-cover board with a used gym and a week that has passed.** Covers are one day
   (CLAUDE.md), derived from occurrences recomputed every render. Nobody has advanced the clock past
   an agreed cover and read what the board, the Schedule grid and `publishWeek` then say about it.
2. 🔴 **Import the same CSV twice.** `applyAttendanceImport` says it reuses an existing occurrence
   "so re-running an" import does not duplicate it (`store.js`, step 2). Check the members, the check-ins,
   the class instances, and every number on Members and Analytics after the second import, not
   the first.
3. **The Dashboard and the 1:1 lens with a used gym.** Session 41 read Members, Analytics, the
   Schedule, the Builder and the Room TV. It did not read the Dashboard's "today" or a 1:1 client's
   session history with a week of real sessions behind it.
4. **The sweep's remaining blind spots**, from its own header: a soft delete, anything needing
   typing or a file, and anything two levels down. `member.status` and `ptClient.status` were read
   by hand in session 41 and are honest; nothing else in that class has been.
5. **`node scripts/audit-store-writers.mjs` after every change.** Exit 0 and 0 unexplained today.
6. **The e2e flakes.** One unexplained failure in session 41, and it was under load that session
   caused (§0.2). If you see `destructive.spec.js:526` fail on a QUIET tree, that is new
   information: `seedAuthored` (destructive.spec.js:509) is where to start, and CLAUDE.md's "the
   tell is an empty page snapshot" is how you tell a mount failure from a race.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** When the fix needs a NUMBER nobody has argued for, it is a decision: write the argument
and the options, do not pick silently.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-42-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 40 moves to the archive, **newest-first**, above session 39, and the
archive's header line gains "session 40 in session 42"), update CLAUDE.md's "Green as of" line
from a clean run, and summarise it in the final chat message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** 🔴 **And say whether the suite was green at your BRANCH POINT**,
   measured on a quiet machine.
3. **🟥 Dylan's list** — every item in §1.3, restated even where nothing changed, plus anything new.
   **Repeat, in words: merging branches does not let coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym. **Include the near-misses.**
5. **Proposals** — decidable, not a wish list. 🔴 **Carry forward anything of sessions 38's–41's
   §5 that Dylan has not answered**, so an unanswered decision does not quietly fall off the list.
   Session 41 recommended **closing** the semicolon-CSV item; carry that recommendation, not the item.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something.
   **Include your own retractions.**

Then, and only then, **open one pull request** (§1.1) against `claude/relaxed-knuth-s6p32q` (or
against `main` if the stack has merged). Do not merge it. ⚠️ `auto-pr.yml` will NOT open one for
you: A15 (the repo setting) is still off, and the job warns and exits clean when it is.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately and
  in full; do not keep working to tidy up first.
- Any of the six open PRs is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for §4,
and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
