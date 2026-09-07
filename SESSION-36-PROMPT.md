# Jungle — Session 36: autonomous queue-clearing, then hunt

**Run this one on your own.** Dylan is deliberately out of the loop while you work. Do not ask
him anything mid-session, do not stop for confirmation on anything §1 pre-authorises, and do not
end a turn to check in. Batch everything into ONE report at the end (§5).

There is exactly one thing that ends the session early, and it is in §6.

---

## 0. Read this first

`CLAUDE.md` loads automatically and holds the gates, shell traps, CI rules, testing traps and
domain rules. **This file does not repeat them.** It carries state, authority and the queue.

### 0.1 🔴 Check what your branch is based on, before anything

```bash
git fetch --all --prune
git log --oneline -3
for b in $(git branch -r --format='%(refname:short)' | grep -v HEAD | grep -v '^origin/main$'); do
  printf "%-56s ahead:%s\n" "$b" "$(git rev-list --count origin/main..$b)"
done
```

**Confirm position with a gate, not with the log.** Run `npm test` and check the count against
the table below. A tree that merely builds is not proof you are where this prompt thinks you are.

**Measured at `f4348ac` (2026-09-01). `main` is `7508de1`.**

| branch | ahead | CI | state |
|---|---|---|---|
| `claude/integrate-coach-cover-s2933` | 43 | ✅ green | **the S29–33 merge + D6. Fully green. This is your base.** |
| `claude/member-add-discoverability-zdbppk` | 1 | ✅ green | §2.4 of the S35 prompt |
| `claude/session-34-prompt-lasku9` | 5 | ✅ green | D1/D4/D5 |
| `claude/prompt-32-verification-m5y12y` | 40 | — | **already inside the integration branch.** Do not merge it again |
| `claude/pt-feature-ideation-dhbyfx` | 7 | — | the rival PT implementation — §3.1, DECISION, do not merge |
| `gracious-hopper` · `session-29` · `-30` · `-31` | 6/14/20/30 | — | ancestors of `prompt-32`, already in. Ignore |
| `pt-function-new-screens` · `rls-staff-read-boundary` | 0 | — | merged (#14, #13). Ignore |
| 10 × `dependabot/**` | 1 each | — | §3.3, **do not merge** |

Gate numbers on the integration branch: **`lint:crash` 0 · 1230 unit (45 files) · 512 e2e ·
14-chunk build · 0 over budget.** StaffApp **327.25 / 360 kB**, PTScreens **34.83 / 36 kB**.

### 0.2 What in this prompt will have rotted

Sessions 26, 27, 34 and 35 each found false premises in their own briefs. Verify before building:

| Claim | Verify with |
|---|---|
| the three branches are still green | `actions_list` on `ci.yml`, filtered by branch |
| the conflict sets in §2.1 | `git merge-tree --write-tree <base> <branch>` — **`--write-tree`, never the legacy 3-arg form, which reads clean here and is wrong** |
| D2/D3/D7 are unfixed | read the code, not this table |
| A14/A15/A17 still outstanding | 🔴 **you cannot check these. They are database and repo-settings state. Assume outstanding, never claim otherwise** |

---

## 1. Your authority this session

### 1.1 ✅ Pre-authorised — do these without asking

- Merge any `claude/**` branch **into another `claude/**` branch**, resolving conflicts.
- Write code, tests, comments, docs. Fix defects. Add features that §3/§4 name.
- Raise a size ceiling **in the commit that needs it**, saying what bought the bytes.
- Rename or edit an **unapplied** migration (a numbering collision, a wrong RLS predicate).
- Commit and `git push -u origin claude/**`.
- Run every gate as often as you like.

### 1.2 ⛔ Never, this session — no exceptions, and do not ask

- 🔴 **Never push or merge to `main`.** A push to `main` deploys to GitHub Pages. Shipping is
  Dylan's, always.
- 🔴 **Never open a pull request.** A15 is off, so nothing opens them automatically either; that
  is fine. Leave branches for him.
- **Never merge a Dependabot PR.** `CLAUDE.md` says ask Dylan, and you are not asking.
- **Never write a NEW migration.** Editing an unapplied one is §1.1; authoring one is not.
- **Never merge `claude/pt-feature-ideation-dhbyfx`.** See §3.1 — merging it decides a product
  question by default, which is the one thing session 28 proved is expensive.
- **Never skip, disable, quarantine or allowlist a failing test to get green.** If a test blocks
  you, either fix the defect it names or leave it red and say so in §5.
- **Never claim a Dylan-only item is done.** You cannot run a migration or tick a repo setting.

### 1.3 🟥 Dylan-only — do NOT work on these, do NOT loop on them, just carry them into §5

Nothing you can write clears any of these. Naming them again in the report is the whole job.

| # | What | Why you cannot |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | It is merged, not run. A `member` account reads the whole gym until it is. No test in this repo can tell you whether it has run |
| **A15** | Tick Settings → Actions → Workflow permissions → allow Actions to create PRs | Measured OFF on 2026-09-01 by a real push: `GraphQL: GitHub Actions is not permitted to create or approve pull requests` |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | Both, or cover stays on one phone. `deliveryTruth()` returns `"device"` and the panel says so |
| **A16 / A18** | Accent legibility; Mindbody | Yes/no decisions, nothing blocked on them |
| — | Merge anything to `main`; merge Dependabot | §1.2 |

---

## 2. Phase one — consolidate (do this first, it is mechanical)

### 2.1 Fold the three green branches into one

Base everything on `claude/integrate-coach-cover-s2933`. Work on a NEW branch off it so the
green one stays untouched if you make a mess:

```bash
git checkout -B claude/session-36-<something> origin/claude/integrate-coach-cover-s2933
```

Then merge, in this order, running the full gate after **each**:

1. `origin/claude/member-add-discoverability-zdbppk` — **1 conflict: `src/screens/RosterScreen.jsx`.**
   Mechanical. That branch moves the roster panel above the CSV panel and adds three testids; the
   integration branch changes three colour tokens inside both moved blocks. Keep both: the new
   order AND the token substitutions.
2. `origin/claude/session-34-prompt-lasku9` — **4 conflicts: `CLAUDE.md`, `DYLAN-QUEUE.md`,
   `SESSION-HANDOFF.md`, `scripts/check-size.mjs`.** All prose and budgets. `check-size.mjs` is a
   UNION again, and session 34 raised `PTScreens` to 36 while this branch raised it to 36/38 for
   D6 — take the higher, and merge the two reasons into one note rather than keeping both.
   ⚠️ Session 34 adds **A16 · the `health_screen` consent scope**, which collides with the A16
   this branch already assigned. Renumber session 34's to **A19** and say so in `DYLAN-QUEUE.md`.

⚠️ **`git merge` stages every non-conflicted file at the moment it runs.** Anything you edit
afterwards stays unstaged and misses the commit — this exact mistake shipped a merge commit that
described a security fix it did not contain. **`git status` before every commit, and diff the
COMMITTED tree, not the working tree**, when the commit message makes a claim.

### 2.2 Reconcile the handoffs, once

The two lines forked after session 27 and both numbered their next session 28. Main's is filed as
`28-PT`. Session 34's block will land as a third. Keep the live file to the two most recent and
archive the rest newest-first, per the archive's own rule. **Never delete a session block.**

### 2.3 Then push, and stop touching it

One green branch carrying everything. That is what Dylan merges. Do not merge it anywhere.

---

## 3. Phase two — the open code items

Do these on top of §2's branch, one commit each, gate green between them.

### 3.1 🔴 The two PT implementations — WRITE, DO NOT MERGE

Unchanged and still blocked. `claude/pt-feature-ideation-dhbyfx` (7 commits) carries
`PT-FEATURE-SPEC.md` (906 lines), `progression.js` (e1RM, PBs, volume, adherence,
`suggestNextLoad`) with 341 lines of tests, `ClientsScreen.jsx`, and `clients:*` as a real
capability. Its §1.1 marks `PRODUCT-DIRECTION` §4 superseded and narrowly reverses §6's
"no consumer app".

**A branch nobody has read must not reverse the product direction by being merged.**

What you CAN do autonomously, and should: **read it properly and write the comparison Dylan needs
to decide.** A file, `docs/PT-RECONCILIATION.md`, covering — for each capability — which
implementation has it, what merging each would cost, what the migrations collide with now that
`0010`/`0011` are taken, whether `progression.js` is portable onto main's `ptClients.js`, and the
one question only he can answer. Facts and trade-offs; **no recommendation dressed as a fact.**

⚠️ Its migrations are `0011_member_identities` / `0012_pt_training_spine` / `0013_pt_wellbeing`,
and **`0011` is now taken by coach cover.** Say so; do not renumber a branch you are not merging.

### 3.2 🟢 The remaining Tier-1 PT defects

D1, D4, D5 shipped in session 34. **D6 shipped on the integration branch.** These are left, and
were verified present on `main` at `7508de1` — **re-verify, do not trust this table:**

| # | Defect | Fix |
|---|---|---|
| **D2** | Every coach reads every client's health answers. Gated on `class:view`; nothing scopes a client to a coach; `coachName` was never set by anything — **it is now, as of D6**, which changes what is possible here | `pt:view` / `pt:manage`. ⚠️ Sequence after 3.1: the rival branch's `clients:*` solves it better, and building the wrong one twice is session 28 |
| **D3** | `frontdesk` cannot see the PT screens at all, yet chases lapsed paperwork. ⚠️ The rival spec deliberately disagrees — health screening is not front-desk data | Resolve as *state without answers*. With D2 |
| **D7** | An orphaned client row renders honestly but cannot be cleared, and its PAR-Q answers survive an erasure request. `store.js` says there is deliberately no `deletePtClient` | A deliberate erasure path — the one place a hard delete is correct. **Read that NOTE first; it is an argument, not an oversight** |

**If D2/D3 turn out to depend on which PT implementation wins, write them up in §3.1's file and
move on.** Do not build both.

### 3.3 What you are NOT doing here

Dependabot (§1.2). The Node 20 deprecation warning every CI run prints is fixed by five of those
major Actions bumps, and it is still not yours.

---

## 4. Phase three — hunt

**When §2 and §3 are done, or blocked for reasons §5 records, do not stop and do not idle.**
Go looking. This is the open-ended half and it is the point of the session.

### 4.1 How to hunt here

The repo's own lessons, which are what separate a finding from noise:

- **Drive the UI and LOOK at it**, at 1280 and 390. Mutation-checked tests have missed real
  defects; reading the rendered screen has caught copy and layout defects that 1200 passing tests
  did not. Screenshots via a throwaway Playwright config — see `CLAUDE.md`'s sandbox note, and
  **never commit that config**.
- **Assert the STORED object, not only what was rendered.**
- **A passing test can pin a defect.** Green means the code matches the tests, not the product.
- **Every sweep carries a positive control in the same run.** A scan that matched nothing and a
  scan that found nothing are indistinguishable from the assertion's side.
- **An empty screen passes every scan trivially.** Seed the fixture; assert the thing you are
  about to measure exists first.
- **`toHaveCount(0)` is not an assertion that something never happens.**
- **Do not report a defect your own fixture manufactured.**
- 🔴 **`ALL_SCREENS` is the nav, not the product.** The Room TV is a fullscreen overlay off the
  Class Runner and no nav sweep visits it. The member link (N4) is the other surface a member
  ever sees, and `UI-UX-DIRECTION` §1 says both must be flawless before any staff screen gets
  polish.

### 4.2 Places worth looking, in rough order

1. **The two member-facing surfaces** — the Room TV and the member link. §1 of the direction doc
   ranks them above everything, and N4's link code **has still never executed** (A12).
2. **`node scripts/audit-store-writers.mjs`** — it found D6. Run it after every change; it is the
   only thing that can see a field with no way in.
3. **The screens the S29–33 stack brought in**, which nobody has driven end to end: the cover
   board, the away board, the coach roster panel, class-type retention. They are green in tests.
   That is not the same as being right.
4. **`docs/STORE-WRITER-AUDIT.md`'s "what the sweep cannot see" section** — it names the shapes
   the audit is blind to. Those are where the next D6 lives.
5. **The e2e flakes `CLAUDE.md` documents** — the mount flake and the slow-render timeout. Both
   are recorded as intermittent and neither has a root cause. Finding one is worth more than a
   feature.
6. **Anything a gym would do on day one** that the product handles badly. Session 35's whole
   finding was that three add-member routes existed and nothing said so.

### 4.3 What counts as a finding worth reporting

Each one needs: **what is wrong, the evidence you gathered yourself, what it costs a gym, and
what fixing it would take.** A finding with no evidence is a hunch, and this repo's handoffs have
been wrong exactly where prose got confident. If you fixed it, say so and point at the commit and
the mutation that proves the test bites. If you did not, say why not.

⚠️ **Fix what is small, in scope and provable. Write up what is large, ambiguous, or a product
decision.** Do not build a feature Dylan has not asked for because you found a gap; propose it.

---

## 5. The report — the only thing he reads

Write it to **`SESSION-36-HANDOFF.md`**, add it as the newest block in `SESSION-HANDOFF.md` per
the two-block rule, and summarise it in the final chat message. Structure:

1. **What shipped**, per commit, with the gate numbers each was verified at.
2. **What is still red, and why.** A red gate you chose to leave is fine; a red gate you did not
   mention is not.
3. **🟥 Dylan's list** — A14, A15, A17, A16, A18, Dependabot, and every branch waiting to merge.
   Say plainly which of these blocks a user-visible outcome. **Repeat, in words: merging branches
   does not let coaches find cover; A17 does.**
4. **Findings** — §4.3's shape, ranked by what they cost a gym.
5. **Proposals** — what you would build next and why, each with a cost. This is the "suggest it
   back to me" half; make it decidable, not a wish list.
6. **Anything in THIS prompt that was false.** Sessions 26, 27, 34 and 35 all found something.
   Say so explicitly with the evidence. That record is worth more than the work it interrupts.

---

## 6. When to stop

Stop and report early **only** if:

- A gate goes red for a reason you cannot explain in one sentence **and** cannot fix.
- You find something that suggests deployed data is being lost or exposed. Report it immediately
  and in full; do not keep working to tidy up first.
- You would have to do something in §1.2 to make progress on everything remaining.

Otherwise: keep going. Running out of §2 and §3 is not a reason to stop — it is the trigger for
§4, and §4 does not run out.

**Do not ask Dylan anything before §5.** If a decision blocks you, write the decision up with its
options in the report and work on something else.
