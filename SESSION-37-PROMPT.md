# Jungle — Session 37: the surfaces nobody has looked at

**Run this one on your own**, the same way session 36 ran. Dylan is out of the loop while you
work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-36-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before
you start** — §4 is what four hours of looking at screens found, and §6 is what the last brief got
wrong. Both are the argument for how this session is shaped.

### 0.1 🔴 Your base depends on something you have to check, not assume

Session 36 opened **PR #15** from `claude/session-36-queue-hunt-ty4q49` into `main` — 59 commits,
CI green on `c7960f5`. At the time this prompt was written it was **open and unmerged**, and `main`
was still `7508de1`.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
gh pr view 15 --repo killdylz/Jungle-App --json state,mergedAt,mergeStateStatus
```

| What you find | What you do |
|---|---|
| **#15 merged**, `main` moved | `git checkout -B claude/session-37-<something> origin/main` |
| **#15 still open** | `git checkout -B claude/session-37-<something> origin/claude/session-36-queue-hunt-ty4q49`. 🔴 **Do not redo any of its work** — everything in `SESSION-36-HANDOFF.md` §1 is already in that branch. Push to your OWN branch; leave #15 alone |
| **#15 closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **#15 has conflicts** | Resolve them ON YOUR BRANCH after basing off it, and say so. Do not force-push #15's branch |

**Confirm position with a gate, not with the log.** `npm test` should report **1277 unit (45
files)** and `npx playwright test --list` **534 in 48 files**. A tree that merely builds is not
proof you are where this prompt thinks you are. ⚠️ If those numbers are higher, somebody has
worked since — read `git log` before assuming this file is current.

### 0.2 What in this prompt will have rotted

Sessions 26, 27, 34, 35 and 36 each found false premises in their own briefs. Session 36's was an
instruction that would have shipped a red gate. Verify before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| the "never driven" list in §4.2 | `grep -rn` it yourself. It was measured on 2026-09-07 and a session since then may have covered one |
| the proposals in §3 are still open | read the code. §3.1's `max="60"` in particular is one line and somebody may have moved it |
| A14 / A15 / A17 / A19 / A20 still outstanding | 🔴 **you cannot check these.** They are database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has NOT answered the PT question or A20 | ⚠️ **check `DYLAN-QUEUE.md` and the PR #15 conversation first.** If he answered, §2 changes completely |

---

## 1. Your authority this session

### 1.1 ✅ Pre-authorised — do these without asking

- Write code, tests, comments, docs. Fix defects. Add what §3/§4 name.
- Merge any `claude/**` branch **into another `claude/**` branch**, resolving conflicts.
- Raise a size ceiling **in the commit that needs it**, saying what bought the bytes.
  🔴 **Re-measure after any merge that touches a budgeted chunk.** Session 36 shipped 1.19 kB over
  a ceiling both merged branches had independently called sufficient. A ceiling is not mergeable
  by taking the max.
- Rename or edit an **unapplied** migration.
- Commit and `git push -u origin claude/**`.
- **Open ONE pull request at the very end**, from your branch, once §5 is written. Dylan asked for
  #15 explicitly and this is the same shape. Nothing else about PRs.
- Run every gate as often as you like.

### 1.2 ⛔ Never, this session — no exceptions, and do not ask

- 🔴 **Never push or merge to `main`.** A push to `main` deploys to GitHub Pages. Shipping is
  Dylan's, always. **Never merge PR #15 either** — opening a PR is not permission to merge one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo. See §2.2.
- **Never skip, disable, quarantine or allowlist a failing test to get green.** If a test blocks
  you, fix the defect it names or leave it red and say so in §5.
- **Never claim a Dylan-only item is done.** You cannot run a migration or tick a repo setting.
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-36-HANDOFF.md` §3 has the full table with what each one blocks. The short version, and
**say all of it again in your report even though it is unchanged**:

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES.** A `member` account reads the whole gym until it runs |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES.** 🔴 **Merging branches does not let coaches find cover. A17 does** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES.** That code has still never executed against a real Edge Function |
| **A15** | Let Actions open pull requests — one checkbox | No |
| **A16 / A18 / A19 / A20** | Accent legibility · Mindbody · `health_screen` consent scope · the Schedule's five fixed times | A20 blocks a gym on day one; the rest are yes/no |
| — | Merge #15; merge Dependabot | §1.2 |

---

## 2. Phase one — find out what changed, then act on it

### 2.1 Read for answers before you read for work

Two decisions were put to Dylan in writing on 2026-09-07. **Both may now have answers**, and if
they do, they are the most valuable work available:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product?
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list?

Look in `DYLAN-QUEUE.md`, in the PR #15 conversation, and in `git log` since `c7960f5`. **If either
is answered, do that first and let §3 wait** — an answered decision going unbuilt is how this repo
came to have two PT implementations.

### 2.2 If the PT question is answered

Follow `docs/PT-RECONCILIATION.md` §2, which already costs both directions. Whichever way it goes,
🔴 **`jungle_pt_sessions` is the same localStorage key on both sides with incompatible rows, git
resolves it silently, and it must be settled before either build reaches a gym.** That is §2.1 of
that document and it is the first thing to fix, not the last.

If it is **not** answered: leave the rival branch alone, and do not build D2 or D3 (both are
written up in §3 of that document and both depend on the answer).

---

## 3. Phase two — the small ones, each with its own commit

All five are from `SESSION-36-HANDOFF.md` §5, already costed, all provable. Gate green between
them. **Verify each against the code first** — §0.2.

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | `max="60"` on the stage-duration input still claims what it does not enforce. `999` stores 16.6 hours. Session 36 floored the input at 1 minute and deliberately left the ceiling, because clamping destroys a coach's legitimate 75. **Warn, do not clamp** — or raise the attribute to something a class could be | `App.jsx` ~1472, `lib/format.js` `stageDurSec` | 1 h |
| **3.2** | The orphan 1:1 row sorts to the TOP of the coach's day. `_byCoachDay` falls through to `localeCompare` on `name`, and an orphan's name is `""` — so the one row a coach can only erase sits above every client they are training | `lib/ptClients.js` | 1 h |
| **3.3** | Teach `audit-store-writers.mjs` its own allowlist. It prints three 🔴 NO WRITER lines on every run and all three are documented false positives; a red flag that is always wrong stops being read. The triage is already written in `docs/STORE-WRITER-AUDIT.md` — move it into the script as a named, commented allowlist. ⚠️ The allowlist is the positive control (`storeWriters.test.js` already treats it that way): adding a line to it is a product decision, not a way to green the build | `scripts/audit-store-writers.mjs` | 2 h |
| **3.4** | Move "Add a 1:1 client" BELOW the client list. The exact shape session 35 fixed on Members and session 36 merged: the panel for the occasional thing sits above the list read every day, and on a 390px phone the list starts below the fold | `screens/pt/PTScreen.jsx` | 2 h |
| **3.5** | 🔴 **The Room TV's three presets have never been rendered by anything.** `display.spec.js` drives the Coach / Floor / Plan *modes*; **Full / Minimal / Timer Only** are a different axis and no test has ever selected one. A coach picking "Timer Only" puts a screen on the wall nothing has looked at. This is a TEST, not a fix — write it, then §4 tells you to go and LOOK at what it renders | `DISPLAY_PRESETS`, `e2e/display.spec.js` | 3 h |

**If one of these turns out not to be a defect, say so in §5 and move on.** Three items on session
26's brief were false and it was right to refuse all three.

---

## 4. Phase three — hunt, and hunt the way session 36 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method that worked, stated as a method

All four of session 36's findings came from the same loop, and **not one came from a test**:

1. **Seed a gym that has actually been used** — members, class instances, attendance, coaches, PT
   clients, a PAR-Q record. An empty screen passes every scan trivially.
2. 🔴 **Copy the fixture's row shapes out of `store.js`, not out of your head.** Session 36
   manufactured two false defects this way — an attendance row keyed `at` instead of `checkedInAt`
   made Analytics look broken, and an absence written straight to localStorage bypassed
   `recordAbsence` and made the away board look wrong. Both were caught; both cost time. **If you
   had to guess a field name, you have not found a defect.**
3. **Render it at 1280 and 390 and READ IT.** Not `toHaveCount`, not a scan — read the words and
   compare them with each other. Two of the four findings were a number disagreeing with the
   sentence next to it.
4. **Then check the STORED object**, because a screen that renders correctly over a wrong store is
   a different defect wearing the same face.
5. **Prove it is reachable through the shipped UI before reporting it.** Session 36's `-5` finding
   is only a finding because a coach can type it; the 07:00 class turned out NOT to be reachable,
   which turned it from a bug into a product limit and changed what to do about it entirely.

Screenshots go through a throwaway Playwright config under the gitignored `/.e2e-scratch/`. See
`CLAUDE.md` for the browser workaround and 🔴 **for the pipe trap — `| tail -N` reports `tail`'s
exit code, which is always 0, and session 36 read a fully red suite as a green baseline that way.**

### 4.2 Where to look, in order, and why these

Measured on 2026-09-07. **Re-check before trusting it** (§0.2).

1. 🔴 **The Room TV, properly.** `UI-UX-DIRECTION` §1 ranks it and the member link above every
   staff screen, and session 36 only glanced at it — it found "Warm-Up · -5m" on the plan strip in
   passing and did not drive the boards themselves. `RoomTV.jsx` has **no spec file named for it**.
   Drive all three presets (§3.5) and all three modes, on a **1280×720 wall** (a projector or a
   laptop on HDMI — the size that produced the `tvFont` floor defect) and at 1920. Read what a
   member standing in the room actually sees.
2. 🔴 **`MemberLinkDialog.jsx` — the coach's half of N4 — has no spec file named for it either.**
   `memberSummary.spec.js` drives the member's side against a stubbed function; nothing drives
   PUBLISHING. It is the one control that makes a gym's programming leave the building, it cannot
   work until A12, and the failure states a coach sees when it does not work have never been read.
3. **The Class Runner end to end, with a real class.** Build, start, check people in, run the
   stages, finish, publish the link. Session 36 never walked it. `smoke.spec.js` does, in 4 tests.
4. **Day one for a gym that has never used Jungle.** The 07:00 finding came from asking "what
   would a studio do first?" Ask it again for: adding a coach, importing a CSV that is nearly but
   not quite right, running a class with nobody checked in, a class type the catalogue does not
   have.
5. **`node scripts/audit-store-writers.mjs` after every change.** It found D6. After §3.3 a clean
   run will mean something.
6. **`docs/STORE-WRITER-AUDIT.md`'s "what the sweep cannot see"** — it names the shapes the audit
   is blind to. That is where the next D6 lives.
7. **The e2e flakes.** ⚠️ Session 36 ran the full suite **six times, all green, all first
   attempt** — the mount flake and the slow-render timeout did not appear once. That is six data
   points, not a fix. If you see one, you have the best chance anyone has had at a root cause.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Session 36's schedule-collision finding is the model: the data loss was fixed by making
the screen say what it was hiding, and the question underneath it — does Jungle model concurrent
classes? — was written up rather than answered. Do not build a feature Dylan has not asked for
because you found a gap; propose it with a cost.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-37-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 34 moves to the archive, newest-first), and summarise it in the final chat
message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** A red gate you chose to leave is fine; one you did not mention
   is not.
3. **🟥 Dylan's list** — every item in §1.3, restated even where nothing changed, plus anything new.
   Say plainly which block a user-visible outcome. **Repeat, in words: merging branches does not
   let coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym. **Include the near-misses**: a
   "defect" you chased and found was your own fixture is worth a paragraph, because the next
   session will chase the same one.
5. **Proposals** — what you would build next and why, each with a cost. Decidable, not a wish list.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something and
   session 36 found an instruction that would have shipped a red gate. Say so explicitly with the
   evidence. **Include your own retractions** — session 36 wrote two claims it had not measured and
   pulled both before pushing; recording that is worth more than the appearance of getting it right
   first time.

Then, and only then, **open one pull request** (§1.1). Do not merge it.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately
  and in full; do not keep working to tidy up first.
- PR #15 is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for
§4, and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
