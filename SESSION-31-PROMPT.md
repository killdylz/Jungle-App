# Jungle — Session 31 Build Prompt

**Run this session autonomously. Do not stop to ask.** Where a choice arises, make it, write the reasoning in the commit message, and keep going. Where an item turns out to need Dylan, write what he needs into `DYLAN-QUEUE.md`, say so in the handoff, and move to the next item.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the testing traps and the domain rules. **This file does not repeat them.** It carries the state, the evidence, and the work queue.

**Last commit `2379e8e`, tree clean, pushed to `claude/jungle-session-30-build-s0lgz1`.**

### 🔴 Before you read the numbers: check what your branch is based on

This has now cost **three sessions in a row**, and it is not a warning problem — **nothing merges these branches to `main`, and `main` is four sessions stale.** Session 29 started five commits behind. Session 30 started **fourteen** behind, and `3a6e4a0` — the commit its own prompt named as the baseline — did not exist in the repository at all.

```bash
git log --oneline -3                      # does the top commit match 2379e8e?
git ls-remote --heads origin              # if not, the work is on another claude/… branch
git merge --ff-only <that branch's tip>   # it has always been a clean fast-forward so far
```

🔴 **Then confirm the fix with a GATE, not with the log.** Run `npm test` and check the count against the table below. A tree that merely builds is not proof you are where this file thinks you are; a matching unit count is.

### The regression, run fresh at `2379e8e` — measured, not carried forward

| Gate | Result |
|---|---|
| `lint:crash` | **0** |
| unit | **1019 passing**, 36 files |
| e2e | **478 passing**, 47 spec files |
| build | 12 JS chunks |
| `npm run size` | **0 over budget** |

```
index.js             203.06 / 215 KB   (5.6% headroom)   ← still the tightest
StaffApp.js          307.65 / 360 KB   (14.5%)
PersonasScreen.js     82.75 / 100 KB
BrandStudioScreen.js  30.03 /  32 KB   (6.2%)
RetentionScreen.js    17.02 /  18 KB   (5.5%)
LibraryBrowserModal.js 19.15 / 20 KB · ProfileModal.js 13.75 / 15 KB
brandGenerator.js      2.93 /   4 KB · ClassSummary.js 5.81 / 8 · summaryApi.js 0.85 / 3
member path 210.19 / 222 KB · staff path 516.53 / 575 KB
```

App.jsx is **2,373 lines**. `store.js` is **1,905**. `CalendarScreen.jsx` is **701**. `CoachCoverPanel.jsx` is **383**.

⚠️ **478 is 477 + one re-run.** Both of session 30's full runs failed exactly one test in `syncBanner.spec.js` — **a different one each time** — and all seven passed when that spec ran alone. `CLAUDE.md` carries the tell: a `waitForApp` timeout whose error context has **no page snapshot at all** means the app never mounted, so nothing about the banner was exercised. A real regression fails the same test twice.

⚠️ **`index.js` is 93% REACT and cannot be fixed by moving app code.** Session 29 attributed every byte via the sourcemap. **Do not spend this session on it.**

### ⚠️ The environment

**Playwright cannot launch out of the box.** `@playwright/test` 1.61.1 wants Chromium r1228; the image ships r1194 and the CDN is proxy-blocked. Use a scratch config that imports the repo config and overrides `projects[].use.launchOptions.executablePath` to `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, plus `testDir`, `outputDir` and `webServer[].cwd`. **Do not edit `playwright.config.js`** — it is what CI runs. Session 30's scratch config lived in `.e2e-scratch/` and was deleted before the final push; it is not in the repo, so **you will need to write it again** (five lines).

🔴 **THIS CONTAINER IS ~4× SLOWER THAN THE ONE THESE PROMPTS ARE WRITTEN ON.** A full e2e run takes **35–36 minutes**, not 7. Session 30 burned roughly an hour on this before adapting. Plan for it:

- **Budget three or four full runs**, not ten. Lean on `npm test` (4 seconds) and single-spec runs (20–30 seconds).
- ⚠️ **Background `sleep` loops get cut short here** — the container appears to throttle between tool calls, so a backgrounded waiter returns long before the thing it is waiting for is done. What works is a **foreground blocking wait**: `timeout 580 bash -c 'while pgrep -f "playwright test" >/dev/null; do sleep 20; done'`, repeated. It advances real time properly.
- ⚠️ **Do not pipe a long run through `tail`** — the pipe buffers everything, so the log is empty for 35 minutes and you cannot see progress or an early failure. Redirect to a file and poll it.

🔴 **`npx playwright test 2>&1 | tail -30` EXITS 0 WITH EIGHT FAILING TESTS.** Session 30 saw a run print `[exited with code 0]` under a list of eight failures. **Read the count, never the exit code.**

⚠️ **Do not edit source while the e2e suite is running.** Vite HMR fires, `main.jsx` re-executes, and specs fail on `createRoot() on a container that has already been passed to createRoot()`.

### The autonomy contract

- **Never block on Dylan.** Write what he needs into `DYLAN-QUEUE.md` and move on.
- **Never ask which option to take.** Decide, and put the reasoning in the commit message.
- **Commit and push after each item lands green.** Do not batch a session into one commit.
- ⚠️ **CI does not run on this branch.** `Deploy to GitHub Pages` triggers on `main` only, so `gh run list` will show nothing. **The local suite is the only gate.** Do not report CI as green; report the suite.
- If a gate is red and the cause is not yours, **re-run once** before investigating.

### 🔴 The rule that keeps earning its place

**Verify every item below against the code before building it.** Session 26 found four false premises in its own prompt, 27 found six of eight, 28 found two, 29 found three, 30 found three — including the baseline commit not existing.

Where a number below is marked **[measured]** it was verified against the code while this file was written. **[unverified]** is a lead, not a finding.

---

## 🟥 1. What this session is

**Session 30 built the coach roster, availability and cover requests. It shipped a three-state model in which the third state cannot be reached, and a delivery path that is now waiting on Dylan rather than on code.**

This session is not a new feature. It is **finishing the thing that was started, and then asking the question session 30 could not**: what else in this product exists in the model with no way in?

That last question is the real content. §2.1 is one instance of it, found by accident. **§2.2 is the systematic version**, and it is the item most likely to change what the next three sessions build.

---

## 🟥 2. The work queue, in order

### 2.1 🔴 The account link and the aliases have no way in

**[measured] This is session 30's own gap and it is the first thing to fix or delete.**

`updateCoach(id, patch)` accepts `name`, `userId`, `active`, `aliases` and `availability`. **[measured] It is called from exactly one place in the app — `CoachCoverPanel.jsx:97` — and always with `{ availability }` and nothing else.** So:

- **`userId` can only be set by editing `localStorage` by hand.** That is the field `coachAccountFor()` reads, the field `class_instances.coach_id` now resolves through, and the field that decides whether a cover request could ever reach a person. `coachReach()` returns `"account"` for it — **a state the product cannot enter.** Session 30's own e2e reaches it only by seeding the store directly, which is the tell.
- **`aliases` can only be set the same way.** [measured] Nothing under `src/screens/` writes a roster entry's aliases. And this one is worse than it looks: §2.1's stated problem was *"Mara", "mara" and "Mara K." are three coaches*. `coachKey` folds the first two. **The third needs an alias, and there is no control that makes one** — so the headline problem is two-thirds solved and the product cannot express the remaining third.

**⚠️ Before building either control, notice why they are not symmetrical.**

`aliases` is pure local text. A control for it is small, testable, and there is already a pattern to copy — [measured] `PersonasScreen.jsx:1563` is a comma-separated `Input` for movement aliases, with the "don't lose the old name" rule at 1519–1520 worth reading before you copy it.

`userId` is not local. **[measured] The only list of a gym's people is `memberships`, read live from Supabase in exactly two places** — `AuthGate.jsx:126` (your own membership) and `AdminTeamScreen.jsx:56` (the gym's roster) — and the Team screen is hidden entirely by `NEEDS_SERVER` when Supabase is unconfigured, which is the shipped state. **So with no server there is nobody to pick from, and an account picker would render an empty list.**

That makes §2.1 a decision, not a build order. At least three defensible answers:

- **(a) Build both, and let the account picker be server-only** — present when `supabaseEnabled`, absent (with a sentence saying why) when not. Consistent with how Team already behaves.
- **(b) Build aliases, and DELETE `userId`.** If it cannot be set, it is not a feature. That means deleting `coachAccountFor`, reverting `class_instances.coach_id` to null-always, and dropping `coach_reach`'s third state. **This is a real option and session 30 would not have argued against it** — but note it also deletes the fix for `coach_id` naming the publisher, so read that commit (`2bb2263`) before choosing it.
- **(c) Build aliases, keep `userId` as a documented server-only field**, and make the UI say "linking a coach to their Jungle account needs the gym online" rather than showing a control that cannot work.

**Decide it, write the reasoning in the commit, and do not leave a field that nothing can write.**

**Done when:** every field `updateCoach` accepts either has a way in or is gone; a gym can say "Mara K. is Mara" and the schedule stops counting them separately; and an e2e drives the alias path and asserts the STORED roster entry, not just the render.

---

### 2.2 The sweep §2.1 is one instance of: what else has no way in?

🔴 **This is the item worth the session.** §2.1 was found by accident, while reading a grep for something else. Two fields shipped in one session with no control behind them, and every gate was green — because a field nothing writes breaks nothing.

**Build the check that would have caught it.** The shape is roughly: for each `update*`/`save*` in `store.js`, what keys does it accept, and which of those does any call site under `src/screens/` or `src/App.jsx` actually pass? A key with no writer is either dead or a missing control.

⚠️ **This is an AUDIT first and a test second.** Write the audit, read the results yourself, and decide case by case — plenty of fields are legitimately written by import paths, seeds or migrations rather than by a control, and a test that flags those is noise that will be deleted in two sessions. **Only pin a rule where one actually falls out.**

⚠️ **A sweep that matches nothing and a sweep that finds nothing are indistinguishable.** Carry a positive control in the same run: `aliases` and `userId` are the known-good answers as of this commit, so the sweep must find them before you trust anything else it says.

**Done when:** there is a written list of every store field with no writer, each marked as "missing control", "written elsewhere (where)", or "dead — delete it"; the dead ones are deleted; and whatever rule genuinely generalises is a test with a positive control.

---

### 2.3 The compare-and-set primitive — build it, or argue that it is premature

**[measured] `store.js` contains ZERO `.update()` calls.** Every write is an unconditional `upsert`, `insert` or `delete`. [measured] The only `.update()`s in the whole app are `AuthGate.jsx:133` and `AdminTeamScreen.jsx:79`/`85`, and neither is conditional on a prior value. **There is no compare-and-set anywhere in this product.**

A cover approval needs exactly one: `set status='approved' where id=$1 and status='open'`. Pushed through `_bgUpsertDelta` instead, two coaches both approving both succeed, last writer wins, and one of them is shown an approval that did not happen. Migration `0010_coach_cover.sql` writes the conditional UPDATE into its schema comments for this reason.

**⚠️ And here is the argument against building it now, which you should take seriously.** This repo already carries two pieces of code that have never run in anger — the N4 Edge Functions (ten sessions) and migrations 0005/0006. A sync primitive that cannot be exercised against a real server would be the third, and a primitive that is *wrong* is worse than one that is absent, because the next session will trust it.

**My recommendation is to build it and to be honest about its status** — it is pure client code, unit-testable against a fake, and it is the thing that makes 0010 safe to wire the day it runs. But the counter-argument is real. **Decide, and put the reasoning in the commit.**

If you build it: it must not be wired to anything (`cover_requests` does not exist), its test must drive the LOSING branch, and its header must say plainly that it has never made a real request.

---

### 2.4 `addMember` stamps a join date in the wrong timezone

**[measured] `store.js:1197`** — `joinedAt: extra.joinedAt || new Date().toISOString().slice(0, 10)`. That is **UTC**, and it is a different calendar day from the coach's for part of every day. A member added at 8am Tuesday in Singapore is recorded as joining on Monday.

**[measured] The correct helper is eleven hundred lines above it in the same file**: `localDateStr()` at `store.js:62`, added by session 30, whose comment (from line 57) says exactly this.

⚠️ **This is small, and the reason it is on the queue is that `daysBetween`'s comment in `retention.js` exists for this precise bug** — the repo has already paid for it once, in the at-risk panel. `joinedAt` feeds the first-90-day cohort curve.

⚠️ **Check the blast radius before changing it.** `applyAttendanceImport` writes `joinedAt: ""`, and `cohorts.js` keys on first recorded visit rather than `joinedAt` — so the number of gyms this actually affects may be small, and that is worth measuring rather than assuming in either direction. [unverified] whether any test pins the UTC behaviour; if one does, read it before changing it, because it may be pinning something deliberate.

**Done when:** the stamp is a local calendar date, a test fails when it is reverted, and the handoff says how many readers of `joinedAt` there actually are.

---

### 2.5 Dated availability exceptions — only if the queue above is done

Session 30 built the weekly grid and **deliberately did not build** the dated exception layer, on the grounds that a half-built exception list which silently fails to suppress one Thursday is worse than an absent one, because a coach would rely on it. That reasoning stands. This is here as the next honest increment, not as unfinished business.

⚠️ **It grows a calendar UI, a timezone answer and a DST answer**, and `daysBetween` counts LOCAL CALENDAR DAYS. If you cannot make "away this Thursday" actually suppress that Thursday in `coachesFreeAt`, **do not ship half of it** — say so and move on.

---

## 3. Do NOT

- **Do not apply migrations, merge Dependabot PRs, or change infra.** All three are Dylan's. **Do not edit `playwright.config.js`.**
- **Do not build member-facing booking, payments, or a self-serve tier.** That is the "no CRM" line.
- **Do not call a real Mindbody or ClassPass endpoint**, add credentials, or commit a key. §2.4 of session 30 is a seam and `DYLAN-QUEUE` **A16** is the open decision — **do not answer it yourself.**
- **Do not spend the session on `index.js`.** It is 93% React and session 29 measured every byte.
- **Do not "simplify"** `_clearLedgerIfSettled`, `restorePersonaCascade`, the conditional in `deletePersonaMovement`, `_clearSyncError`'s refusal-while-tombstones-exist, or `settleCover`'s refusal to move a settled request.
- 🔴 **Do not add a `coach_id` to `class_schedule_rules`, or any column to a row mapper that its migration has not created.** PostgREST rejects the whole batch. `dbConstraints.test.js` now guards this; if it fails, it is right and you are wrong.
- **Do not add a screen without a budget line in `check-size.mjs`.** An unlisted chunk has no ceiling at all.
- ⚠️ **Do not add a fourth thing called "Coaches".** The product already has three: `personas` (sidebar "Coaches"), `AdminTeamScreen` ("Team"), and the roster panel ("Coach roster").
- ⚠️ **Do not push chrome through `tvFont`.** It is a display-scale function.

---

## 4. Standing risks — carry these into the handoff unchanged until they move

- 🔴 **`main` is four sessions stale and nothing merges to it.** Sessions 28, 29 and 30 all live only on their own branches. This is the process risk that has cost three sessions.
- 🔴 **`DYLAN-QUEUE` A15 — migration `0010_coach_cover.sql` is unapplied.** Until it runs, a cover request reaches one phone. The product says so on screen, but it is a real limit and it is the only queue item a shipped feature is waiting on.
- 🔴 **A16 is open and is a decision, not work:** should Jungle write back to a gym's booking system at all? Nothing is blocked; nothing should be built until it is answered.
- 🔴 **Migrations `0005` and `0006` have never been applied.** Personas, plans and the movement catalogue exist on one device with no server copy. ⚠️ The coach-delete dialog *tells* the coach that, and `e2e/destructive.spec.js` asserts the string — so applying them makes a shipped sentence a lie.
- 🔴 **N4 member links are built and undeployed — eleven sessions.** `DYLAN-QUEUE` A12/A13, 35 minutes of Dylan's time.
- 🔴 **Nobody's phone rings.** There is no push, email or SMS anywhere in this product. Cover is in-app only, which is no use for the case it exists for — a coach ill at 5am. Written up in A15 and deliberately not assumed.
- ⚠️ **A14 is open and is a yes/no**: does Jungle bend a gym's accent to make it legible? Nothing is blocked on it.
- ⚠️ **A1 — the Supabase region has never been confirmed.** Five-minute read-only check, and the only item that gets dramatically more expensive with age.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps.
- ⚠️ **A second Claude session may share this working tree.** `git status` before every commit, stage only your own paths, and `grep -rn MUTATION src/` before trusting any green gate — but note that grep does **not** catch a mutation that was a DELETION, and a failed revert on an **untracked** file leaves a clean `git diff`. Re-read the function you mutated.

---

## 5. When to stop

1. Work the queue in order. Verify, build, test, **prove the test can fail**, run the gates, commit with the reasoning, push.
2. **Then drive the surface you touched and LOOK at it**, at 1280px and 390px, on a fresh load. Session 28 found the largest defect in the product this way; 29 found three; **30 found three more on an item its own prompt had already called done** — two date notations in one column, an unnamed table, and a control that looked like it knew who you were. None broke a test.
3. Keep going until the tokens run out.

🔴 **§2.1 and §2.2 are the two that must land.** A field nothing can write is not a feature, and the check that finds the next one is worth more than the fix for this one.

🔴 **If §2.2's audit finds that a lot of this product is unreachable, STOP AND SAY SO** rather than fixing them one at a time. That would be a finding about how this codebase grows, and it would change what the next several sessions are for.

**Finish with a `SESSION-HANDOFF.md` block** in the established shape: what shipped, what was found to be false, the traps paid for, and what is genuinely left. Lead with the reasoning, not the diff. ⚠️ The live file keeps the **two most recent** blocks — move session 29's to `docs/history/HANDOFF-ARCHIVE.md`, **newest-first**, which is not where a naive append puts it.
