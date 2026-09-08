# Jungle — Session 39: the guard that has to find its own next hole

**Run this one on your own**, the same way sessions 36, 37 and 38 ran. Dylan is out of the loop while
you work. Do not ask him anything mid-session, do not stop for confirmation on anything §1
pre-authorises, and do not end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the work.

`SESSION-38-HANDOFF.md` is the session before this one, in full. **Read §4 and §6 of it before you
start.** §4 is five defects that were live in the shipped product; §6 is what the last brief got
wrong plus four of the last session's own retractions. Both are the argument for how this one is
shaped.

### 0.1 🔴 Your base is a stack of three, and you have to check it

There are now **three** unmerged pull requests and they stack:

- **PR #15** — `claude/session-36-queue-hunt-ty4q49` → `main`.
- **PR #16** — `claude/session-37-unexplored-surfaces-8pas4o` → #15's branch.
- **PR #17** — `claude/session-38-two-boards-seams-tx19ce` → #16's branch.

At the time this file was written all three were open and `main` was still `7508de1`.

```bash
git fetch --all --prune
git log --oneline -3 origin/main
gh pr list --repo killdylz/Jungle-App --state open --json number,title,headRefName,mergeStateStatus
```

| What you find | What you do |
|---|---|
| **All three merged**, `main` moved | `git checkout -B claude/session-39-<something> origin/main` |
| **#17 still open** | `git checkout -B claude/session-39-<something> origin/claude/session-38-two-boards-seams-tx19ce`. 🔴 **Do not redo any of its work.** Push to your OWN branch; leave all three existing PRs alone |
| **#15/#16 merged, #17 not** | Still base off #17's branch — it already contains both |
| **Any of them closed unmerged** | Something happened you cannot see. Stop and report — this is a §6 case |
| **Conflicts** | Resolve them ON YOUR BRANCH after basing off #17's. Do not force-push a branch you did not create |

**Confirm position with a gate, not with the log.** `npm test` should report **1304 unit (46
files)** and `npx playwright test --list` **588 in 48 files**. A tree that merely builds is not proof
you are where this prompt thinks you are. ⚠️ If those numbers are higher, somebody has worked since —
read `git log` before assuming this file is current.

### 0.2 🔴 The e2e browser needs a per-session shim, and it is in CLAUDE.md

`@playwright/test` 1.61.1 wants chromium build **1228**; the image ships **1194**, and
`npx playwright install` is refused by the agent proxy. CLAUDE.md carries the shell block that
presents the installed binaries under the name the client looks for — it worked verbatim, first try,
in sessions 37 and 38, and drove every screenshot. **`/opt` is writable but ephemeral, so this is a
per-session step. Do it first;** everything in §3 and §4 needs it.

⚠️ **And read the new line next to it: DO NOT EDIT `src/` WHILE A FULL RUN IS IN FLIGHT.** Playwright
loads the spec files at start while the dev server serves the app over HMR, so later specs run your
new code against the old tests. Session 38 threw away two full runs to this — one reported
`566 passed / 1 failed` for a failure that was real but landed mid-run, and one exited 0 while
meaning nothing. **Only a run started on a quiet tree counts.**

### 0.3 What in this prompt will have rotted

Sessions 26, 27, 34, 35, 36, 37 and 38 each found false premises in their own briefs. Session 38
found three, and retracted four of its own besides. Verify before building:

| Claim | Verify with |
|---|---|
| the gate numbers in §0.1 | `npm test` and `--list`, not this table |
| every "nothing drives X" in §3 and §4 | 🔴 **`grep` it yourself.** Session 38's brief claimed nothing had driven the Exercise Library modal; it is one of the best-covered surfaces in the repo, and half a session could have gone into re-testing it. Every "nothing drives" below was checked against the specs on 2026-09-07 — **check it again** |
| A14 / A17 / A20 still outstanding | 🔴 **you cannot check these.** Database, repo-settings and product-decision state. Assume outstanding, never claim otherwise |
| Dylan has not answered the PT question, A20, or §2.1 below | ⚠️ **check `DYLAN-QUEUE.md`, all three PR conversations, and `git log` first.** If he answered, §2 changes completely |

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
  Dylan's, always. **Never merge PR #15, #16 or #17** — opening one is not permission to merge one.
- **Never merge a Dependabot PR.**
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`** unless Dylan has answered
  `docs/PT-RECONCILIATION.md` §6 in writing, in the repo.
- **Never skip, disable, quarantine or allowlist a failing test to get green.**
- **Never claim a Dylan-only item is done.**
- **Never force-push a branch you did not create this session.**

### 1.3 🟥 Dylan-only — carry these into §5, do not work on them

`SESSION-38-HANDOFF.md` §3 has the table. **Say all of it again in your report even though it is
unchanged**, and say plainly which block a user-visible outcome:

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.** And add session
38's version: **four of the last two sessions' findings existed only because the deployed build has
no server.** The product now tells the truth about all of them, and the truth is still a refusal.

---

## 2. Phase one — find out what changed, then act on it

### 2.1 Read for answers before you read for work

**Three** decisions are now in writing and waiting:

- **`docs/PT-RECONCILIATION.md` §6** — second lens, or a PT product? Open since 2026-09-07.
- **`DYLAN-QUEUE.md` A20** — arbitrary class times: yes/no, and grid or list.
- **`SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw?** This is new, and it is the
  most fully costed decision in the repo. Session 38 measured every element on all three boards at
  two resolutions, prototyped the fix, and rendered it. Read that section before doing anything with
  it: the answer changes §3.4 below from "nothing" to "a day of work".

Look in `DYLAN-QUEUE.md`, in all three PR conversations, and in `git log`. **If any is answered, do
that first and let §3 wait** — an answered decision going unbuilt is how this repo came to have two
PT implementations.

### 2.2 If the room-board question is answered

`SESSION-38-HANDOFF.md` §5.1 costs it both ways and §5.2 is the follow-on. The short version:

- **"Yes, fill the wall"** → a layout pass on `OverviewDisplayScreen.jsx` targeting the Fable spec's
  ~3% secondary floor, then raise `TV_MIN_PX` to 12 so the three `KNOWN_LITERAL` entries in
  `display.spec.js` can come off the exception list. The sweep to hold it already exists.
  🔴 **A 3% floor applied globally truncates the Coach board's stage-journey strip** — that is
  measured, not predicted. The work is per-board, not in `clamp()`.
- **"No, leave it"** → the exemption becomes a product statement rather than a test comment, and
  `KNOWN_LITERAL` gets a sentence saying it is permanent.

### 2.3 If the PT question is answered

Follow `docs/PT-RECONCILIATION.md` §2, which already costs both directions. 🔴 **`jungle_pt_sessions`
is the same localStorage key on both sides with incompatible rows, git resolves it silently, and it
must be settled before either build reaches a gym.** If it is **not** answered: leave the rival
branch alone, and do not build D2 or D3.

---

## 3. Phase two — the named work, each with its own commit

All four are verified against the code on 2026-09-07 and none needs a decision. Gate green between
them. **Verify each again first** — §0.3.

| # | What | Where | Cost |
|---|---|---|---|
| **3.1** | 🔴 **A sweep that finds the next unguarded destructive control, instead of waiting for someone to walk that screen.** `destructive.spec.js` opens with "every destructive action, reversed" and **enumerates the ones somebody thought of**. Session 38 found **four** outside that list in one file — the stage removal, Smart Distribute, and both doors of the Build dialog. That is not a gap, it is the method failing. Walk every screen, press every control that writes, assert the store changed **and** that something offered it back. ⚠️ It needs a positive control or it proves nothing: the ten actions already guarded must be found and reported as guarded | `e2e/`, new sweep file | 4 h |
| **3.2** | **The class template round trip has never been driven.** "Save to file" writes a `.json` through `handleExportClass` and "Open" reads one through `handleImportTemplate`; `screens.spec.js:38` asserts only that the words appear on screen. 🔴 The export carries `classType: classChoice.classType` — the field session 38 found could go stale — so a round trip is also the regression test for that. `handleImportTemplate` answers bad input with a bare `alert()`, which Playwright auto-dismisses, so **write the test knowing the dialog trap** | `src/App.jsx`, `e2e/` | 3 h |
| **3.3** | **Reordering stages by drag has no test at all.** `handleReorderStages` and the five drag handlers in `BuilderScreen` are undriven — `builderMove.spec.js` moves an *exercise between* stages, which is a different control. A class's stage ORDER is the class; getting it wrong silently reorders somebody's Tuesday. ⚠️ Driving HTML5 drag-and-drop in Playwright needs `dispatchEvent` with a real `DataTransfer`, not `dragTo` | `e2e/`, `src/App.jsx` | 3 h |
| **3.4** | **The Builder's rename says two different words for one thing.** The button is `aria-label="Rename class"`; the `window.prompt` it opens says `Session name:`. CLAUDE.md already records three nav vocabularies as a trap this repo pays for. ⚠️ **The rename itself is fine and IS driven** — six specs click it with `page.once("dialog", …)`. This is a copy fix, not a defect hunt; do not go re-testing the rename | `src/App.jsx` | 20 min |

**If one of these turns out not to be a defect, say so in §5 and move on.** Session 26 refused three
items on its own brief and was right to; session 38 refused one.

---

## 4. Phase three — hunt, and hunt the way sessions 36, 37 and 38 did

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**

### 4.1 The method, stated as a method

Session 38's five findings came from this loop and **not one came from a test**:

1. **Seed a gym that has actually been used** — members, class instances, attendance, coaches, a
   hand-authored class. An empty screen passes every scan trivially.
2. 🔴 **Copy the fixture's row shapes out of `store.js`, not out of your head.** If you had to guess
   a field name, you have not found a defect.
3. **Render it and READ IT** — at 1280×900, at 390×844, and for anything room-facing at **1280×720**.
   🔴 **Take the screenshot and look at it.** ⚠️ And then **measure the thing the screenshot made you
   suspicious of**: session 38 nearly reported a colour defect that was `--muted` rendering exactly
   as specified.
4. **Then check the STORED object.** A screen that renders correctly over a wrong store is a
   different defect wearing the same face. Session 38's `classChoice` finding was invisible on
   screen and reached `class_instances.class_type`.
5. **Prove it is reachable through the shipped UI before reporting it.** ⚠️ Reachable on the
   *credential-less* build: the Build-for-me API branch is dead code there, and its fallback is the
   only path a gym can hit.
6. 🔴 **Ask what the product SAYS, not only what it does.** Five of the last two sessions' findings
   were sentences that were false on the deployed build. **A remedy that cannot work is worse than no
   remedy**, and this class of defect is invisible to every test that asserts a string is present.

### 4.2 Where to look, in order, and why these

Measured on 2026-09-07. **Re-check before trusting it** (§0.3).

1. 🔴 **A sentence that has already been caught over-claiming once.** Session 38's Brand Studio
   finding was the *second* time that same sentence was too confident — `brandAudit.js`'s own header
   records the first. Grep the repo's comments for admissions of a previous over-claim and re-read
   what those sentences say now. This is a lead nobody has followed.
2. 🔴 **The Class Runner and the check-in path, end to end, on a gym mid-week.** Sessions 36–38
   walked the Runner's exits, the Room TV, Members and the Builder. Nobody has driven a class from
   the Schedule → check members in → finish → read what the Dashboard, Analytics and the member's
   own record say afterwards, in one sitting.
3. **Analytics and Retention with enough history to produce a number.** Every session has seeded a
   gym too young for those screens to say anything, so their refusals are well tested and their
   **answers** are not. Seed 14 months and 200 members and read what it claims.
4. **The Health Screen (PAR-Q) at 390px.** `pt.spec.js` drives the gate hard; nothing has read the
   screen.
5. **Day three: a gym that edits.** Rename a class type that is already on the schedule and in
   history; rename a coach who has classes; delete a member with attendance. CLAUDE.md warns a class
   type's NAME is its key in four places — nobody has driven a rename through all four.
6. **`node scripts/audit-store-writers.mjs` after every change.** It exits non-zero now and prints
   its three permanent seams green, so a red line is a finding.
7. **`docs/STORE-WRITER-AUDIT.md`'s "what the sweep cannot see"** — it names the shapes the audit is
   blind to, and the biggest is `save*(list)` whole-object writers. That is where the next D6 lives.
8. **The e2e flakes.** ⚠️ **Not seen since session 33.** CLAUDE.md now says to treat that entry as
   folklore rather than defend against it. If you see one you have the best chance anyone has had;
   if you get to the end having seen none, **say so**.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and what
fixing it would take.** If you fixed it, point at the commit and the mutation that proves the test
bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Session 38's room-board measurement is the model: the arithmetic and the prototype were
done, the fix was **not** taken because it breaks a third board, and it went into §5 with its cost.
Do not build a feature Dylan has not asked for because you found a gap; propose it with a cost.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-39-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per the
two-block rule (session 37 moves to the archive, newest-first), and summarise it in the final chat
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
   🔴 **Carry forward anything of session 38's §5 that Dylan has not answered**, so an unanswered
   decision does not quietly fall off the list after one session.
6. **Anything in THIS prompt that was false.** Every session since 26 has found something.
   **Include your own retractions** — session 38 recorded four, including a screenshot it read wrong
   and a regression it shipped and had caught by an existing sweep. Recording a threshold you had to
   move is worth more than the appearance of getting it right first time.

Then, and only then, **open one pull request** (§1.1). Do not merge it.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately
  and in full; do not keep working to tidy up first.
- Any of the three open PRs is closed unmerged, or `main` has moved in a way you cannot account for.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for §4,
and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write it up with its options in
the report and work on something else.
