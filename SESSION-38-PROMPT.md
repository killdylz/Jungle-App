# Jungle — Session 38: the two boards a member reads, and the seams between screens

**Run this one on your own**, the same way sessions 36 and 37 ran. Dylan is out of the loop while
you work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-37-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before you
start.** §4 is seven defects that were live in the shipped product and that no test could see; §6
is what the last brief got wrong, including two retractions of the last session's own work. Both
are the argument for how this session is shaped.

### 0.1 🔴 Your base depends on something you have to check, not assume

There are now **two** unmerged pull-request-shaped things, and they stack:

- **PR #15** — `claude/session-36-queue-hunt-ty4q49` into `main`, 60 commits.
- **session 37's branch** — `claude/session-37-unexplored-surfaces-8pas4o`, 14 commits **on top of
  #15's branch**, with its own PR.

At the time this file was written both were open, and `main` was still `7508de1`.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
gh pr list --repo killdylz/Jungle-App --state open --json number,title,headRefName,mergeStateStatus
```

| What you find | What you do |
|---|---|
| **Both merged**, `main` moved | `git checkout -B claude/session-38-<something> origin/main` |
| **Session 37's PR still open** | `git checkout -B claude/session-38-<something> origin/claude/session-37-unexplored-surfaces-8pas4o`. 🔴 **Do not redo any of its work.** Push to your OWN branch; leave both existing PRs alone |
| **#15 merged, 37's not** | Still base off 37's branch — it already contains #15 |
| **Either closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **Conflicts** | Resolve them ON YOUR BRANCH after basing off 37's. Do not force-push a branch you did not create |

**Confirm position with a gate, not with the log.** `npm test` should report **1304 unit (46
files)** and `npx playwright test --list` **567 in 48 files**. A tree that merely builds is not
proof you are where this prompt thinks you are. ⚠️ If those numbers are higher, somebody has
worked since — read `git log` before assuming this file is current.

### 0.2 🔴 The e2e browser does not work out of the box, and the old workaround is not enough

`@playwright/test` 1.61.1 wants chromium build **1228**; the image ships **1194**. The
`executablePath`-in-a-scratch-config trick that sessions 34–36 recorded only ever fixed a
**throwaway** run — the gate runs the committed `playwright.config.js`, which has no hook for it,
and `npx playwright install` is refused by the proxy. **CLAUDE.md now carries the shell block that
actually works** (present the 1194 binaries under the 1228 names). `/opt` is writable but
ephemeral, so this is a per-session step. Do it first; everything in §3 and §4 needs it.

### 0.3 What in this prompt will have rotted

Sessions 26, 27, 34, 35, 36 and 37 each found false premises in their own briefs. Session 37 found
two, and retracted two of its own claims besides. Verify before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| every "no test covers X" in §3 and §4 | 🔴 **`grep` it yourself.** Session 37's brief said "no test has ever selected a preset" and "nothing drives publishing"; **both were wrong**, and in both cases a test existed that asserted the wrong half. Finding the existing test is part of the work |
| A14 / A15 / A17 / A19 / A20 still outstanding | 🔴 **you cannot check these.** Database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has NOT answered the PT question or A20 | ⚠️ **check `DYLAN-QUEUE.md`, both PR conversations, and `git log` first.** If he answered, §2 changes completely |

---

## 1. Your authority this session

### 1.1 ✅ Pre-authorised — do these without asking

- Write code, tests, comments, docs. Fix defects. Add what §3/§4 name.
- Merge any `claude/**` branch **into another `claude/**` branch**, resolving conflicts.
- Raise a size ceiling **in the commit that needs it**, saying what bought the bytes.
  🔴 **Re-measure after any merge that touches a budgeted chunk.** A ceiling is not mergeable by
  taking the max.
- Rename or edit an **unapplied** migration.
- Commit and `git push -u origin claude/**`.
- **Open ONE pull request at the very end**, from your branch, once §5 is written.
- Run every gate as often as you like.

### 1.2 ⛔ Never, this session — no exceptions, and do not ask

- 🔴 **Never push or merge to `main`.** A push to `main` deploys to GitHub Pages. Shipping is
  Dylan's, always. **Never merge PR #15 or session 37's PR** — opening one is not permission to
  merge one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo.
- **Never skip, disable, quarantine or allowlist a failing test to get green.**
- **Never claim a Dylan-only item is done.**
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-37-HANDOFF.md` §3 has the table with what each one blocks. **Say all of it again in your
report even though it is unchanged**, and say plainly which block a user-visible outcome:

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — now a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.** And add session
37's sharper version: **three of its seven findings existed only because the deployed build has no
credentials.** The product now tells the truth about that, and the truth is still a refusal.

---

## 2. Phase one — find out what changed, then act on it

### 2.1 Read for answers before you read for work

Two decisions have been in writing since 2026-09-07 and were still unanswered at the end of
session 37:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product?
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list. ⚠️ Session 37
  corrected its scope; re-read it, the entry changed.

Look in `DYLAN-QUEUE.md`, in both PR conversations, and in `git log`. **If either is answered, do
that first and let §3 wait** — an answered decision going unbuilt is how this repo came to have two
PT implementations.

### 2.2 If the PT question is answered

Follow `docs/PT-RECONCILIATION.md` §2, which already costs both directions. Whichever way it goes,
🔴 **`jungle_pt_sessions` is the same localStorage key on both sides with incompatible rows, git
resolves it silently, and it must be settled before either build reaches a gym.**

If it is **not** answered: leave the rival branch alone, and do not build D2 or D3.

---

## 3. Phase two — the small ones, each with its own commit

All four are from `SESSION-37-HANDOFF.md` §5, already costed and all provable. Gate green between
them. **Verify each against the code first** — §0.3, and note what that table says about "no test
covers X".

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | The 1:1 screen's "Where this lives" card is ~200px of a 390px fold. Session 37 moved the add panel below the list; the list still starts at y≈630 because two explainer cards sit above it. The first is a permanent honesty notice a coach reads once and scrolls past daily forever. Collapse it after first read, or move it below the list as the add panel went. **Same argument session 35 made on Members and session 37 made one card further along** | `screens/pt/PTScreen.jsx` | 2 h |
| **3.2** | Nothing asserts that a class scheduled at a time and a coach free at that time actually **meet**. Session 37 removed the two-copies-of-`SLOTS` drift by construction, but `coachesFreeAt` is unit-tested against its own fixtures, not against what the two screens render. One e2e: schedule a class, mark a coach free in that slot, read the cover board | `e2e/`, `lib/coachRoster.js` | 3 h |
| **3.3** | 🔴 **`TV_MIN_PX = 11` is the value the boards happen to render, which makes that test a description rather than a requirement.** Decide what the floor should actually be for a wall read at 8 m and either raise it (fixing what fails) or write down why 11 is right. ⚠️ **A legibility floor must be ABSOLUTE, not proportional** — CLAUDE.md records why, and the `clamp()` trap that comes with raising one | `e2e/display.spec.js`, `screens/runner/displayKit.js` | 3 h |
| **3.4** | The Room TV's **Plan board** is exempt from the 10-foot rule in `display.spec.js` because it has no timer. It is also the board **a member walks in and reads**. Either the exemption is right and should say so in the product's own terms, or the board needs the rule. This is §3.3 one level up and they should be decided together | `e2e/display.spec.js` | costed in 3.3 |

**If one of these turns out not to be a defect, say so in §5 and move on.** Session 26 refused
three items on its own brief and was right to.

---

## 4. Phase three — hunt, and hunt the way sessions 36 and 37 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method, stated as a method

Session 37's seven findings came from this loop and **not one came from a test**:

1. **Seed a gym that has actually been used** — members, class instances, attendance, coaches, PT
   clients, a PAR-Q record. An empty screen passes every scan trivially.
2. 🔴 **Copy the fixture's row shapes out of `store.js`, not out of your head.** If you had to
   guess a field name, you have not found a defect.
3. **Render it and READ IT** — at 1280×900, at 390×844, and for anything room-facing at
   **1280×720**, which is a projector or a laptop on HDMI and the size that produced the `tvFont`
   floor defect. 🔴 **Take the screenshot and look at it.** Two of session 37's findings — a source
   comment rendered as body copy, and two labels drawn in the same 45px — were invisible to every
   assertion in the repo and obvious in a picture.
4. **Then check the STORED object.** A screen that renders correctly over a wrong store is a
   different defect wearing the same face. Session 37's largest finding (a finished class recording
   nothing) was only visible in `localStorage`.
5. **Prove it is reachable through the shipped UI before reporting it.** It is what turned two
   copy defects into "what every coach sees today", and what stopped a dead end from becoming a
   finding.
6. 🔴 **Ask what the product SAYS, not only what it does.** Three of session 37's seven were
   sentences that were false on the deployed build: "synced when online" with no server, "reconnect
   and try again" to an online coach, "no member column found" for a semicolon file. **A remedy
   that cannot work is worse than no remedy**, and this class of defect is invisible to every test
   that asserts a string is present.

### 4.2 Where to look, in order, and why these

Measured on 2026-09-07. **Re-check before trusting it** (§0.3).

1. 🔴 **Every other sentence the product says about a server it does not have.** Session 37 found
   three and fixed them one at a time; it did not sweep. `grep` the UI for claims about syncing,
   backups, sharing, "your account", "another device", and check each against `store.syncEnabled()`
   — which session 37 exported for exactly this. **A sweep here has a positive control available**:
   the three that were fixed.
2. 🔴 **The Class Builder end to end, which nobody has walked.** Sessions 36 and 37 walked the
   Runner, the Room TV and Members. Build a class from nothing: add stages, reorder them, add
   exercises from the library, set a class type, name it, save it, put it on the schedule. Read
   what each step writes.
3. **The Exercise Library modal.** ⚠️ It covers the sidebar and traps focus, so every sweep that
   iterates `ALL_SCREENS` visits it **last** — which is exactly the shape that left the Room TV
   unexamined for thirty sessions. Nothing has driven it end to end.
4. **The Brand Studio, at 390px and on a light palette.** `brandTokens.spec.js` checks contrast;
   nothing has read the screen.
5. **Day two for a gym that used Jungle yesterday.** Session 37 did day one. Day two is: yesterday's
   class in Recent Sessions, a member who did not come back, an edited class type, a coach who
   called in sick.
6. **`node scripts/audit-store-writers.mjs` after every change.** It exits non-zero now and prints
   its three permanent seams green, so a red line is a finding.
7. **`docs/STORE-WRITER-AUDIT.md`'s "what the sweep cannot see"** — it names the shapes the audit is
   blind to. That is where the next D6 lives.
8. **The e2e flakes.** ⚠️ **Eight consecutive clean full runs across sessions 36 and 37.** The mount
   flake and the slow-render timeout have not appeared since session 33. That is data, not a fix.
   If you see one, you have the best chance anyone has had at a root cause — and if you get to the
   end of the session having seen none, **say so**, because the ninth clean run is when the entry
   in CLAUDE.md starts to look like folklore.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Session 37's CSV finding is the model: the *message* was wrong and was fixed; whether
`parseCsv` should accept semicolons is a different decision and was written up with a cost. Do not
build a feature Dylan has not asked for because you found a gap; propose it with a cost.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-38-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 36 moves to the archive, newest-first), and summarise it in the final chat
message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** A red gate you chose to leave is fine; one you did not mention
   is not.
3. **🟥 Dylan's list** — every item in §1.3, restated even where nothing changed, plus anything new.
   Say plainly which block a user-visible outcome. **Repeat, in words: merging branches does not let
   coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym. **Include the near-misses**: a
   "defect" you chased and found was your own fixture is worth a paragraph, because the next session
   will chase the same one.
5. **Proposals** — what you would build next and why, each with a cost. Decidable, not a wish list.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something; session
   37 found two and retracted two of its own besides. **Include your own retractions** — recording
   a threshold you had to move, or a prediction that did not survive being driven, is worth more
   than the appearance of getting it right first time.

Then, and only then, **open one pull request** (§1.1). Do not merge it.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately
  and in full; do not keep working to tidy up first.
- Either open PR is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for §4,
and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
