# PT-RECONCILIATION — two 1:1 implementations, and the decision only Dylan can take

_Written 2026-09-07 (session 36). Facts measured against the code on both branches on that date._

There are **two independent 1:1 personal-training implementations in this repository**. Neither
knows about the other. One is merged and live on `main`; the other has never been read by anyone
but the session that wrote it.

This document exists so that the choice between them is **made**, rather than made by default
the next time somebody merges a branch. Session 28 shipped a feature to a branch, opened a PR,
and it sat unnoticed while a second team built the same thing — that is how this situation was
created, and merging either branch without reading the other is how it repeats.

**This document does not recommend one.** It states what each has, what taking each costs, and
the one question that decides it. Where a fact could not be measured it says so.

---

## 0. The two things

| | **Main line** | **Rival branch** |
|---|---|---|
| Where | `main`, and this branch | `claude/pt-feature-ideation-dhbyfx` (7 commits, 9 behind `main`) |
| Status | **Merged and shipping.** Sessions 28-PT and 34 built it, D6 finished the editor | **Never merged, never reviewed.** Last commit 2026-08-31 |
| Screens | `src/screens/pt/PTScreen.jsx` (527 ln), `ParqScreen.jsx` (364 ln) | `src/screens/pt/ClientsScreen.jsx` (506 ln) |
| Domain libs | `lib/parq.js` (365 ln), `lib/ptClients.js` (206 ln) | `lib/progression.js` (353 ln), `lib/ptConstants.js` (81 ln) |
| Store surface | `addPtClient`, `updatePtClient`, `assignPtSession`, `togglePtSessionDone`, `appendParqRecord` | `inviteMemberToApp`, `recordParq`, `createProgram`, `activateProgram`, `createPtSession`, `logSet`, `correctSetLog` (+332 lines in `store.js`) |
| Design doc | none — the reasoning is in commit messages | `docs/PT-FEATURE-SPEC.md`, **906 lines** |
| Tests | `e2e/pt.spec.js`, `ptClients.test.js`, `ptStore.test.js`, `parq.test.js` | `e2e/pt.spec.js` (a different one), `progression.test.js` (341 ln), `ptStore.test.js` (a different one), `rlsBoundary.test.js` (+244 ln) |
| Migrations | none. **All three tables are local-only, deliberately** | `0011`, `0012`, `0013` — 752 lines of SQL, plus a 250-line RLS self-test |
| Capability | `class:view` (§3 below) | `clients:*`, a new capability on `manager` and `coach` |
| Nav key | `pt`, `pt-parq` | `clients` |

---

## 1. Capability-by-capability: which implementation has what

✅ has it · ⚪ does not · ⚠️ has something adjacent that is not the same thing

| Capability | Main | Rival | Notes |
|---|:--:|:--:|---|
| A roster of 1:1 clients drawn from members | ✅ | ✅ | Both refuse a second name field; a 1:1 client **is** a member row |
| Client detail with editable goal / coach / notes / start date | ✅ | ⚪ | D6. The rival has no client-level editor |
| Orphan detection (member row erased, 1:1 record survives) | ✅ | ⚪ | `ptClientRows().orphan`. See §5 — main surfaces it and cannot clear it |
| PAR-Q: 7 questions, answers stored | ✅ | ✅ | |
| PAR-Q: six-state model (`unscreened`/`incomplete`/`cleared`/`referred`/`gp_cleared`/`expired`) | ✅ | ⚪ | Rival has three outcomes: `never-screened`, `expired`, `flagged-uncleared` |
| PAR-Q: expiry **warning** before the cliff | ✅ | ⚪ | D4. Rival expires silently at the boundary |
| PAR-Q: explicit consent before answers are stored | ✅ | ⚪ | D5. `appendParqRecord` refuses without it; each record carries `{grantedAt, policyVersion, method}` |
| PAR-Q: doctor's clearance with a date, evaluated **after** expiry | ✅ | ⚠️ | Rival has `recordParqClearance(id, ref)` with no date and no ordering rule |
| The screening gate enforced **in the store**, not only in JSX | ✅ | ⚠️ | Main: `assignPtSession` refuses. Rival: refused in `ProgrammePanel` **and** by a Postgres trigger in `0013` — but not in the local store |
| Coach sees the raw health **answers** | ✅ | ⚪ | The rival's `ScreeningPanel` renders status only. This is the D2 crux — see §3 |
| Session planning against a client | ✅ | ✅ | |
| Session carries a snapshotted plan (`stages`) | ✅ | ⚪ | Main snapshots the Builder draft so a later edit cannot rewrite a prescribed session |
| Programs (multi-week, draft → active → completed) | ⚪ | ✅ | |
| **Per-set logging** (reps, load, RIR, superseding corrections) | ⚪ | ✅ | The rival's foundation. Main has no concept of a set |
| e1RM, personal bests, volume by movement/category | ⚪ | ✅ | `progression.js`, 341 lines of tests |
| Adherence with a denominator and a confidence floor | ⚪ | ✅ | |
| `suggestNextLoad` | ⚪ | ✅ | |
| Member **accounts** (a roster row may hold a login) | ⚪ | ✅ | `0011_member_identities` + `inviteMemberToApp` |
| A client-facing app | ⚪ | ⚠️ | Specified in detail (§6.3 of the spec), **not built** |
| Body measurements, habits, nutrition, session credits | ⚪ | ⚠️ | Schema exists in `0013`. No UI |
| Server persistence of any kind | ⚪ | ✅ | Main is local-only by an argued decision; see §4 |
| PDPA erasure path for 1:1 data | ⚪ | ⚠️ | Rival's tables cascade on `members` delete. Neither has a UI |

**The one-line summary of the split:** main has the **compliance and gating half** built properly
and no training data model; the rival has the **training data model and the maths** and a much
thinner gate. They are close to complementary, which is what makes this expensive rather than
easy — there is no "the other one is worse".

---

## 2. What merging each would cost

### 2.1 Merging the rival into the current line

**Four hard collisions, in descending order of how much they would cost to get wrong.**

**🔴 1. `jungle_pt_sessions` is the SAME localStorage key on both sides, with incompatible rows.**
This is the expensive one, and it is not a merge conflict — git resolves it silently because the
key is written in two different commits in two different lines.

```
main   { id, clientId, memberId, date, planName, stages, notes, status,
         parqStateAtAssign, createdAt }        status ∈ planned | done
rival  { id, memberId, programId, startsAt, durationMin, notes, status }
                                               status ∈ planned | delivered | cancelled | no_show
```

The product is local-first: localStorage is the source of truth. A gym that runs one build and
then the other reads rows the other cannot understand — `clientId` is absent, `date` is absent,
`stages` is absent, and `done` is not in the rival's vocabulary so `sessionStatus()` coerces every
completed session back to `planned`. **A trainer's delivered-session history would silently read
as unplanned work.** There is no migration path in either direction today and nothing detects it.

**🔴 2. Migration `0011` is taken.** The rival's `0011_member_identities` collides with
`0011_coach_cover.sql`, which is merged on `main` and is what A17 asks Dylan to run. Its `0012`
and `0013` are free. Its `0010_staff_read_boundary.sql` is **byte-identical** to the merged one
(verified by object hash) — the same file, so that one is a no-op rather than a conflict.
The renumber itself is mechanical; the ordering claim inside the file is not. `0011` opens with
`🔴 REQUIRES 0010`, `0012` with `REQUIRES 0010 and 0011`, `0013` with `REQUIRES 0010, 0011, 0012` —
and those are enforced by `DO` blocks that refuse to run, not by comments. Renumbering the files
without renumbering those references produces three migrations that refuse to apply.

**⚠️ 3. Four exported names collide across the two `store.js` surfaces**, with different
signatures and different meanings:

| Name | Main | Rival |
|---|---|---|
| `parqStatus` | `parq.js`: `(record, {now}) → {state, blocksLoad, reason, …}` | `store.js`: `(memberId, now, list) → {ok, reason, expiresAt}` |
| `PARQ_VALID_MONTHS` | `parq.js` | `store.js` — same value (12), two homes |
| `getPtSessions` / `savePtSessions` | `store.js`, main's row shape | `store.js`, the rival's row shape |

Two `parqStatus`es whose truthiness runs opposite ways (`status.blocksLoad === false` means go;
`status.ok === true` means go) in a codebase where one is imported from `store.js` and the other
from `parq.js` is a defect waiting for its first careless import.

**⚠️ 4. `clients:*` vs `class:view`.** The rival adds `clients:*` to `manager` and `coach` and
deliberately withholds it from `frontdesk`. Main gates the same surfaces on `class:view`, which
`coach` and `manager` already have and `frontdesk` does not. **The effective audience is
identical today**; the difference is that the rival's split is *named*, so a future decision to
give front desk one of these screens and not the other is expressible. Merging the rival's
version is not a behaviour change for any existing role.

**Bundle:** `ClientsScreen` is a second lazy chunk needing its own ceiling in `check-size.mjs`.
Two PT screens in two lazy files is exactly the shape `CLAUDE.md` warns emits a third,
unbudgeted chunk for the shared libraries — `PTScreens.js` is the barrel that exists to avoid it.
`progression.js` imports only `movementTaxonomy.js` and would land in whichever chunk reaches it.

**Product direction:** the spec's §1.1 marks `PRODUCT-DIRECTION` §4 ("Premature: PT/1:1")
**superseded** and narrowly reverses §6's "No consumer app". §15 keeps every other non-goal. That
reversal is argued in the document and it is not a code change — but merging the branch merges the
document, and a document in `docs/` that says a non-goal is reversed is how the direction changes
without anybody deciding it.

### 2.2 Merging the current line's PT into the rival's shape

The cheaper direction on paper, and it loses the four things main has that the rival does not: the
consent gate, the expiry warning, the six-state PAR-Q model with dated clearance evaluated before
it, and the store-level gate. Three of those four are **compliance surfaces** (D5 and D4 were
built as such), and the rival's Postgres trigger replaces only the fourth — and only once `0012`
and `0013` have been run, which is a Dylan action that has not happened for `0005`, `0006`,
`0010` or `0011` either.

### 2.3 Doing neither

Costs nothing today and keeps two implementations in one repository, which is what produced
this document. The rival branch is 9 commits behind `main` and drifting further; every session
that touches `store.js` makes the eventual merge more expensive.

---

## 3. D2 and D3 — and why they are blocked on this decision

These are the two open Tier-1 defects that depend on the answer, so they are written up here
rather than built. **Both were re-verified against the code on 2026-09-07**, not taken from a
handoff.

### D2 · Every coach reads every client's health answers

**Verified.** `src/App.jsx` gates `pt` and `pt-parq` on `cap:"class:view"` in all three nav
arrays. `src/supabase.js` gives `coach` the pattern `class:*`, which matches. Nothing anywhere
scopes a 1:1 client to a particular coach — `updatePtClient` accepts a `coachName` (and since D6
something finally writes it), but no read path filters on it.

**What a gym gets today:** a studio with six coaches, where a client discloses a cardiac condition
to the one trainer they chose, and all six can read the answer.

**🔴 The important finding, and it is why this is not a small fix:** *the rival branch does not
solve this either.* Its `clients:*` sits on `coach`, so every coach still sees every client. What
it changes is **what is displayed**: the rival's `ScreeningPanel` renders only a status — current
until a date, or flagged-and-cleared — and never the seven answers, while main's `ParqScreen`
renders the answers themselves. Its `0013` RLS goes further and makes `parq_responses` readable by
gym admins and the member only, with a comment saying in as many words that a coach reads it
*through the app*, not from the table.

So D2 is really two questions that have been travelling as one:

1. **Who may open a client at all?** Neither implementation scopes this. Fixing it needs a real
   assignment (`coachName` is a free-text field, and D6 gave it a datalist, not a foreign key).
2. **What does an authorised coach see — the answers, or the verdict?** The two branches have
   already answered this differently, and the rival's answer is the more defensible one under
   PDPA. This is a product decision, not a defect.

**Cost of the narrow fix, whichever branch wins:** introduce `pt:view` / `pt:manage`, put them on
`coach` and `manager`, and gate the two nav entries and the store writers on them. Half a day
with tests. It changes nothing about who can see what until question 1 is answered, which is why
it has not been done as a "quick win" — it would read as a fix and not be one.

### D3 · `frontdesk` cannot see the PT screens at all

**Verified.** `frontdesk: ["schedule:*","members:view","music:view"]` — no `class:*`, so both PT
entries are filtered out of every nav.

The two branches **deliberately disagree**, and both wrote down why:

- Main's framing (D3 as filed): front desk chases lapsed paperwork, so it needs to know a screen
  is missing or expiring.
- The rival's, in `supabase.js`: *"a training record carries health screening and body
  measurements, and someone checking a member into a spin class has no business reading them."*

**These are reconcilable and the shape is stated in D3's own text: _state without answers_.** A
front-desk view that says "Sarah Chen · health screen expired 3 days ago" and offers nothing else
serves the chasing job and discloses nothing clinical. Neither branch has built it. It is a small
build (~1 day) once D2's capability split exists, and it should be built once, on the winning
branch, not twice.

---

## 4. Is `progression.js` portable onto main's `ptClients.js`?

**The module: yes. The data it needs: no — that is the whole gap.**

- **Purity.** `progression.js` imports exactly one thing, `classifyMovement` from
  `movementTaxonomy.js`, which is itself pure. It has no store access, no React, no I/O. Copying
  the file into the current line compiles.
- **Its honesty rules already match this repo's.** Every function returns
  `{ok:true, value, unit, method, basis}` or `{ok:false, reason, need?, have?}`; `estimate1RM`
  refuses above 10 reps or without an effort marker; `adherence` returns both numerals and a
  `confident` flag below four sessions; `trend` refuses below four points. There is deliberately
  no `totalVolume()` and no `bodyFat()`. This is the same discipline `retention.js` and
  `lib/cohorts.js` already enforce, written by someone who had read them.
- **🔴 But it consumes rows that do not exist on this line.** `estimate1RM`, `bestEstimate1RM`,
  `volumeByMovement`, `volumeByCategory` and `personalBests` all take **set logs** —
  `{movement, reps, loadKg, rir|rpe, voided}`. Main has no set primitive at all: a 1:1 session
  carries a snapshotted `stages` array from the class Builder, which describes what was
  *prescribed*, never what was *lifted*. Nothing in the current line records a rep or a kilo.
- **And `adherence(sessions)` reads a status vocabulary this line does not use.** It counts
  `delivered` and excludes `cancelled`; main's sessions are `planned` | `done`, with no
  cancellation state, so on today's rows it would return 0% for every client.

**So porting `progression.js` alone buys nothing.** What makes it valuable is the set-logging
primitive underneath it, and that is `0012_pt_training_spine` plus a logging UI — the largest
single piece of the rival branch. Adapting `adherence` to `planned`/`done` is a ten-line change;
everything above it needs the data model.

---

## 5. One thing neither branch has, and it is not a decision

The **PDPA erasure path**. `ptClientRows()` already computes `orphan: !member` — a 1:1 record
whose member row was erased — and `ptRosterSummary` counts them. The screen shows them honestly.
There is no way to clear one, and the PAR-Q answers keyed on that erased member id survive in
`jungle_parq_records` indefinitely.

The rival's `0012`/`0013` cascade on `members` delete, which handles the **server** copy it would
create. It does not touch the local ledgers, and the local ledgers are the source of truth.

This is D7. It is small, it is independent of which implementation wins, and it is the one place
in this product where a hard delete is correct. **Session 36 shipped it**: `store.erasePtClient`
takes the client row, its sessions and its PAR-Q answers together, and refuses any client whose
member row still exists — a live relationship is still `status: 'ended'`, which is what the note
above `getPtClients` argues and what this function will not do for you. Whichever branch wins, the
erasure is already in the line that survives.

---

## 6. The question only Dylan can answer

Everything above is a fact or a cost. This is the part that is not:

> **Is Jungle adding 1:1 personal training as a second lens on the class product — or is it
> adding a personal-training product, with client accounts, per-set logging, and an app the
> client installs?**

The two branches are the two answers, already built.

- **Second lens.** The current line. Local-first, no accounts, no new tables, PAR-Q as a
  compliance gate before individualised load, and 1:1 sessions deliberately kept out of studio
  analytics so an owner is not shown a one-person session in a class number. Cheap to keep.
  Cannot ever tell a trainer whether their client got stronger.
- **PT product.** The rival branch. Member accounts, an RLS model rewritten to survive them, a
  training spine, the maths, and a client-facing app that is specified and not built. It reverses
  a stated non-goal, it needs three migrations run, and `PT-FEATURE-SPEC` §16 lists seven further
  questions — Q2 ("does The Garage have PTs, and will one pilot this?") being the one that decides
  whether it has a user at all.

**Nothing is blocked on the answer today.** The current line ships and works. What the answer
unblocks is D2's real fix, D3's front-desk view, and whether the next session that touches PT is
extending one implementation or reconciling two.

**What is blocked, and getting worse:** the rival branch drifts one commit further behind `main`
every time `store.js` changes. If the answer is "not now", the branch should be **read and
closed** with the spec kept in `docs/` — the 906-line document is the valuable artefact and it
survives its branch. If the answer is "yes", the four collisions in §2.1 are the work, and the
`jungle_pt_sessions` key collision has to be settled **before** either build reaches a real gym,
not after.

---

_Companion to `docs/PT-FEATURE-SPEC.md` (on `claude/pt-feature-ideation-dhbyfx`, not in this
tree) and `docs/PRODUCT-DIRECTION.md`. Where this document states a measurement, it was taken on
2026-09-07 against `claude/session-36-queue-hunt-ty4q49` and `claude/pt-feature-ideation-dhbyfx`;
re-measure before trusting it, on this repo's own standing rule._
