# Jungle — Session 34 Build Prompt

**Do NOT run this session fully autonomously.** Unlike sessions 25–28, the top of this queue is
blocked on decisions that are Dylan's, and two of them are product reversals rather than
engineering choices. Everything in §3 is buildable without him; everything in §2 is not. Read §0.1
before you touch anything.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the
testing traps and the domain rules. **This file does not repeat them.** It carries the state, the
evidence, and the queue.

**Main is `4bf138e`. Written at `af56d07` on `claude/pt-function-new-screens-jly29x`.**

### 0.1 🔴 BEFORE ANY OTHER WORK: check the branches

```bash
git fetch --all --prune
for b in $(git branch -r --format='%(refname:short)' | grep -v HEAD | grep -v '^origin/main$'); do
  printf "%-58s ahead:%s\n" "$b" "$(git rev-list --count origin/main..$b)"
done
```

Session 28 skipped this and it was the most expensive mistake in the project's history. It audited
`main` and the working tree, concluded *"no 1:1/PT path exists at all"*, and built one — while
`claude/pt-feature-ideation-dhbyfx` already held a better one, with the migrations, the load maths,
and a 906-line spec. Two parallel PT implementations now exist and one of them is deployed.

`CLAUDE.md`'s CI section now carries this as a rule and `auto-pr.yml` enforces it mechanically, but
**the tooling is not yet merged** (PR #14). Until it is, this check is manual and it is not optional.

### 0.2 The session numbering has forked, and this is not a mistake

`SESSION-HANDOFF.md` on `main` ends at session 28. The unmerged stack
`claude/prompt-32-verification-m5y12y` contains handoffs for **sessions 29, 30, 31, 32 and 33**.
Both are real. This prompt is numbered 34 to avoid colliding with either. If that stack is merged,
reconcile the handoff files rather than picking one.

### 0.3 What in this prompt will have rotted

The repo's own rule is that a prompt is wrong somewhere. Sessions 26 and 27 each found three false
premises in their own briefs. The most likely candidates here, in order:

| Claim | Verify with |
|---|---|
| PRs #13 and #14 are open and unmerged | `gh pr list` |
| A14 (migration 0010) has not been run | Ask Dylan. **No test in this repo can tell you.** |
| A15 (the auto-PR checkbox) is still off | Push a `claude/**` branch and see if a PR appears |
| `prompt-32-verification` merges cleanly | `git merge-tree` — it was true at `4bf138e` and decays |
| The eight defects D1–D8 are unfixed | Read the code, not the artifact |

---

## 1. 🟥 Waiting on Dylan — no amount of code moves these

Chase these at the START of the session, not the end. Three of them block §2 entirely.

| # | What | Where |
|---|---|---|
| **A14** | 🔴 **Run migration `0010` in the Supabase SQL editor.** A `member`-role account can currently read the entire gym: full roster with emails, every attendance row, every consent record, the coach persona corpus. `user_gym_ids()` has no role filter. Not exploitable only because no member-role user exists — which stops being true the moment any client login ships. | `DYLAN-QUEUE.md` A14, PR #13 |
| **A15** | Tick **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests.** Without it `auto-pr.yml` warns and exits instead of opening PRs. | `DYLAN-QUEUE.md` A15 |
| **B10** | The 1:1 tables. Superseded in practice by the migrations on `pt-feature-ideation`, but the *decision* is still his. | `DYLAN-QUEUE.md` B10 |
| **NEW** | **Which PT implementation survives**, and — separately — whether he accepts that branch's §1.1 **reversal of `PRODUCT-DIRECTION` §6's "no consumer app"**. A branch nobody has read should not reverse the product direction by being merged. | §2.2 below |

---

## 2. 🟥 The queue, in order. Items 2.1–2.3 are sequenced, not parallel.

### 2.1 🔴 Land the two open PRs, and get a real check onto #13

**#14** (`ci.yml` + `auto-pr.yml`) has a green CI run — the first check on any PR in this repo's
history. **#13** (migration `0010`) has **no check at all**: its branch was cut before `ci.yml`
existed. Session 28 ran `lint:crash` and 943 unit tests on it locally and did **not** run e2e.

Order matters:

1. Merge **#14** first. That puts `ci.yml` on `main`.
2. `workflow_dispatch` CI against `claude/rls-staff-read-boundary` for a genuine green.
3. Then merge **#13**.

⚠️ Merging #13 **changes nothing on the server.** The policies do not move until A14 is run. Do not
report the security hole as closed on the strength of a merge.

⚠️ **Never push an empty commit to kick CI.** Use `workflow_dispatch`.

### 2.2 🔴 Reconcile the two PT implementations — BLOCKED on §1's NEW item

Do not write PT code until this is answered. Building more of the losing implementation is the same
mistake as session 28's, with less excuse.

- **Live on `main`:** `src/screens/pt/` — 3 localStorage keys, PAR-Q gate, no server, no load capture,
  no client surface.
- **`claude/pt-feature-ideation-dhbyfx`** (7 commits): `PT-FEATURE-SPEC.md` (906 lines, four dated
  decisions), migrations `0010`–`0013` (12 tables, the F1 XOR), `progression.js` (e1RM, PBs, volume,
  adherence, trend, `suggestNextLoad`) + 341 lines of tests, `ClientsScreen.jsx`, `clients:*` as a
  real capability wired into `manager` and `coach`.

They collide on exactly six files: `src/lib/store.js`, `src/App.jsx`, `scripts/check-size.mjs`,
`e2e/pt.spec.js`, `e2e/helpers.js`, `src/lib/ptStore.test.js`. On five of them the branch supersedes
what is live.

**Session 28's assessment, for you to disagree with:** theirs should be the implementation of record;
mine shipped first and that is its only argument. The one part of `main`'s version worth keeping is
the **standalone Health Screen route with its visible screening ledger** — theirs folds PAR-Q into
the Clients screen.

⚠️ Read §1.1, §2 and §15 of that spec yourself before acting. §1.1 marks `PRODUCT-DIRECTION` §4
(*"Premature: PT/1:1"*) **superseded**, and narrowly reverses §6's *"no consumer app"*. Those are
product reversals with reasoning attached, and they are the reason this item is blocked rather than
merely difficult.

### 2.3 🔴 The sessions 29→33 stack — 40 commits, and it decays

`claude/prompt-32-verification-m5y12y` contains `gracious-hopper`, `session-29`, `session-30` and
`session-31` as ancestors, so it is **one merge, not five**. At `4bf138e` it had **zero conflict
hunks** with `main`. That number only goes up.

What is in it: coach availability and cover/sub requests, an away board, *"which of your classes
members come back to"*, the brand-generator logo defect (its own commit calls it *"the biggest defect
in the product"*), a white-label sweep that now composites alpha and found nine real defects, two
Singapore-timezone date bugs, keyboard and AA fixes.

**Verify before merging** — none of this was read closely in session 28, only its commit subjects:
does the gate pass on that branch, and do its handoff/gate numbers match reality?

### 2.4 🟢 The Tier 1 defects — buildable now, no decision needed

From session 28's own audit of the code (not of a handoff). All eight are on `main` today.

| # | Defect | Fix |
|---|---|---|
| **D1** | 🔴 A PT-only client is flagged **at-risk** while training twice a week. `addMember` always stamps `joinedAt`; retention rule 1 fires at 14–30 days with <4 visits; 1:1 sessions write no attendance. `revenueAtRisk` then prices the false flag as money walking out. | Pass the 1:1 log into `atRiskMembers` as a second activity source. The flag's `reason` must say which kind of session it counted. |
| **D2** | 🔴 Every coach reads every client's health answers. Gated on `class:view`; nothing scopes a client to a coach; `coachName` is never set by anything. | `pt:view`/`pt:manage` — **or adopt `clients:*` from the rival branch, which already solves this better.** Sequence after 2.2. |
| **D3** | `frontdesk` cannot see the PT screens at all, yet chases lapsed paperwork. ⚠️ The rival spec deliberately disagrees — health screening and body measurements are not front-desk data. Resolve as *state without answers*. | With D2. |
| **D4** | A health screen goes valid → blocking overnight. `expiresOn` feeds only the hard cliff. | A sixth non-blocking "expiring" state in `parqStatus`. Pure, fully unit-testable. |
| **D5** | 🔴 `store.recordConsent()` has **zero call sites in the entire app**. Health data is stored with no consent trail, and so is attendance. | Call it on save with a `health_screen` scope. Cannot be backfilled honestly later. |
| **D6** | `updatePtClient` accepts `goal`, `notes`, `coachName`, `startedAt`; the UI only ever sends `{ status }`. A typo in a goal is permanent. | Surface the four fields. |
| **D7** | An orphaned client row renders honestly but cannot be cleared, and its PAR-Q answers survive an erasure request. | A deliberate erasure path — the one place a hard delete is correct. |
| **D8** | One device, no backup. | = B10 / 2.2. |

**If 2.2 lands the rival implementation, D2, D6 and D7 may evaporate.** Check before building them.

### 2.5 The Dependabot backlog

Nine open PRs (#2–#6, #8–#11), five of them major GitHub-Actions bumps. `CLAUDE.md` says **ask Dylan
before merging any of them**. That has not changed. ⚠️ Note that #2–#5 bump the very actions
`ci.yml` and `deploy.yml` now both use, so they touch two files instead of one.

---

## 3. Do NOT

- **Do not build more PT surface before §2.2 is decided.** This is the whole lesson of session 28.
- **Do not write a migration.** Still Dylan's call. `0010`–`0013` already exist on a branch; use them
  rather than authoring rivals.
- **Do not add auto-merge.** `auto-pr.yml` opens PRs and deliberately does not merge them. The morning
  of 2026-08-31 is the argument: blanket auto-merge would have landed a rival PT implementation on top
  of the one that had just gone live.
- **Do not move `ci.yml` to a `pull_request` trigger.** A PR opened by `GITHUB_TOKEN` never fires
  `pull_request` workflows, so every auto-opened PR would silently stop being checked. The header of
  `ci.yml` explains it; read it before "improving" it.
- **Do not report the RLS hole closed because #13 merged.** Merging ships a file. A14 changes the
  policies.
- **Do not trust the numbers in this file.** See §0.3.

---

## 4. Standing risks — carry into the handoff unchanged until they move

1. **`0005` and `0006` have still never been applied.** A gym's personas, plans and movement
   catalogue exist on one device with no server copy. Now joined by the 1:1 ledgers.
2. **`0010` is a live-policy hole until A14 is run.**
3. **`recordConsent` has never recorded anything**, for any scope, since it was written.
4. **StaffApp is at 354.16 / 360 kB.** 5.8 kB left, and it binds everything. Two screens sharing
   libraries want ONE barrel module lazy-imported twice; a definition `store.js` needs must live on
   the eager side of that seam.
5. **N4 member links are still code that has never executed** (A12).
6. **The `npm_and_yarn` Dependabot run has been red since `76b800c`** and is not a build failure.

---

## 5. When to stop

Stop and report — do not push through — when:

- §2.2 needs Dylan and he has not answered. Build §2.4's D1, D4 and D5 instead; none depend on it.
- A gate goes red for a reason you cannot explain in one sentence.
- You find a claim in this file that is false. **Say so in the handoff explicitly**, with the
  evidence, the way sessions 26 and 27 did. That record is worth more than the work it interrupts.

**Three artifacts from session 28 carry detail this file compresses:** the eight defects and an
18-item four-tier backlog; a 27-artboard Claude Design brief for the end-to-end PT flow; and the
side-by-side of the two PT implementations. Ask Dylan for the links — they are not in the repo.
