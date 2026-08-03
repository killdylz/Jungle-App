# Jungle — Session 25 Build Prompt

**This session changes direction.** Sessions 21–24 hunted defects one surface at a time and the
local backlog is empty. Dylan's brief for 25 is different and has four parts, in order:

1. **Regression depth** — make the suite catch classes of defect, not instances.
2. **Remove what is awkward**, starting with a banner that never goes away.
3. **UI polish only — no new surfaces.** Every good-to-have that makes the product feel finished.
4. **Then keep going**: build, retest, look again, and keep going until it is genuinely good.

**Last commit is `a5d5177`**, tree clean, **pushed**, **CI green**. Gates:
**`lint:crash` 0 · 784 unit (28 files, no todos) · 307 e2e (31 spec files, no fixme) ·
`deadctl` 0/100 files · build `npm run size --prod`: member path 213.13 kB, staff 791.07 kB.**
App.jsx **3,513 lines**.

⚠️ **10 unmerged Dependabot PRs** (#1–#10), opened at the end of session 24. Five are MAJOR
GitHub-Actions bumps and one is `@vitejs/plugin-react 5→6`, which can change chunking — the size
guard is what would catch that. **Ask Dylan before merging any of them; do not merge them to
tidy up.**

---

## 🔴 0. Read this before deleting the banner

Dylan named this as the thing to remove:

> *"Some changes haven't synced yet (movement catalog, coach personas, class plans, generated
> classes). They're saved on this device and Jungle keeps retrying, so nothing is lost — but they
> won't appear on another device until the sync succeeds."*

That is `SyncBanner`, `src/App.jsx:2853`, rendered on every non-fullscreen view at `:3426`.

**Session 24 traced the mechanism and it does NOT support simply deleting it.** The evidence:

- `SyncBanner` returns `null` when the ledger is empty (`:2862`). It is not unconditional — it is
  on because **there are real, current, repeated write failures** for those four tables.
- The ledger clears on the next SUCCESSFUL write (`_clearSyncError`, `store.js:294`).
- All four persona tables **are** in `_RETRY_PUSHERS` (`store.js:1491–1494`), and
  `startSyncRetry` re-pushes every 30 s with exponential backoff.

**So the retries are firing and still failing.** The banner is telling the truth: the coach's
personas, class plans, movement catalogue and generation ledger — the data the entire wedge
feature is built from — are **not reaching Postgres**. Deleting the banner deletes the only
warning that this is happening.

🔴 **So the first job is diagnosis, not deletion.** The cause is one string away. In the browser
console on the affected machine:

```js
JSON.parse(localStorage.getItem("jungle_sync_errors"))
```

Each entry has `msg` — the exact Postgres/PostgREST error. The three likely causes, in order:

1. **Migrations 0005/0006 not applied** to that Supabase project — the persona tables do not
   exist. `relation "public.coach_personas" does not exist`.
2. **RLS rejecting the write** — the user's membership row is missing or the policy does not
   match. A `new row violates row-level security policy` message.
3. 🔴 **A constrained column rejecting a client value** — *the recurring data-loss bug in this
   repo*, and `src/lib/dbConstraints.test.js` exists because of it. Check `msg` for
   `violates check constraint`.

**Whatever `msg` says, fix THAT.** Then the banner disappears on its own, which is the correct
outcome and proves the fix.

### What is genuinely wrong with the banner, and should be fixed regardless

Even when it is telling the truth, it is a bad piece of UI, and this is the part to build:

- **It is not actionable.** It names domains but never the reason, and offers nothing to press.
  `_retryNow({ force: true })` exists and is exported — there is no button for it.
- **It cannot be dismissed**, so a coach mid-class stares at an amber bar they cannot clear.
- **It never says how long.** "Keeps retrying" with no attempt count or last-tried time reads as
  broken rather than pending, and the ledger already stores `attempts` and `at`.
- **It is the same weight forever.** A blip and a fortnight of divergence look identical.

**Build:** a "Try now" button wired to `_retryNow({ force: true })`; the actual error on demand
(a `<details>`, so it is available without shouting); "last tried 2 min ago · 14 attempts" from
the ledger; and a dismiss that hides it for the session but **returns on the next failure** —
dismissal must never be able to hide a NEW problem. **Do not add a "never show again."**

---

## 🔴 1. Regression depth — the actual first deliverable

The suite is strong on instances and thin on classes. 307 e2e tests exist because someone wrote
one per defect. What Dylan is asking for is coverage that catches the NEXT defect, not the last
one. Build these as sweeps, each driven over every screen:

| # | Sweep | Why it catches a class |
|---|---|---|
| 1.1 | **Every screen at 390 / 768 / 1280 px, reloaded between each** | ⚠️ §7: resizing without reloading shows a stale layout. Nothing may scroll horizontally; no text may clip. Session 24 found two copy defects by LOOKING that no assertion caught. |
| 1.2 | **Keyboard-only traversal of every screen** | Tab to every control, activate with Enter/Space, assert focus is never lost to `<body>` and never trapped. `useDialog` exists; nothing proves every dialog returns focus to its opener. |
| 1.3 | **Every destructive action, reversed** | §2 below. For each: do it, assert the store, then assert the UI agrees. |
| 1.4 | **Fresh-install journey, end to end** | The Dashboard's 3-step checklist IS the intended first run. Drive all three steps and assert the counter reaches 3/3. Nothing covers this and it is literally the first thing a gym sees. |
| 1.5 | **Reload after every mutating action** | Generalises sessions 21–24's whole method. A table of (action → storage key → screen assertion), run twice: once immediately, once after `page.reload()`. |
| 1.6 | **Console-error sweep already exists — extend it to every INTERACTION** | `screens.spec.js` asserts the boundary is absent on nine screens at rest. Nothing asserts it stays absent after clicking things. |

**Rules that make these worth having, not just numerous:**

- **Every sweep needs a positive control in the same run.** A sweep that silently matched zero
  elements is indistinguishable from a passing one, and this repo has been fooled by that.
- **Prove each new sweep can fail.** Mutate, confirm the mutation applied, confirm the sweep
  goes red, revert with the INVERSE edit, check `git diff` before stopping.
- **A sweep that only ever passes is a cost.** If one cannot be made to fail, delete it.

---

## 🟧 2. What is awkward — verified, with the evidence

Everything here was seen on screen or read in the code during session 24. **Re-verify before
acting** — this document has been wrong in both directions before.

### 2.1 🔴 Deleting a coach is one unconfirmed click

`removePersona` (`PersonasScreen.jsx`) takes a coach **and their plans, movement catalogue and
generation ledger** with no confirmation and no undo. `removePlan` is the same. Meanwhile
`window.confirm` guards *deleting a single exercise* (`App.jsx:1637`) and *removing one class
from the schedule* (`CalendarScreen.jsx:282`).

**The protection is inverted: the cheapest actions are confirmed and the most expensive is not.**
This is the highest-value item in this section. An imported corpus is an LLM pass over a real
deck — it is the most expensive data in the product.

⚠️ **Playwright AUTO-DISMISSES dialogs** (§7), so a test that ignores the dialog exercises
*cancel* and passes. Use `page.once("dialog", d => d.accept())` and assert BOTH paths.

### 2.2 Empty states that describe absence instead of offering the next step

| Screen | Text | Problem |
|---|---|---|
| Schedule | *"Jungle Intelligence — Scheduling suggestions appear here once Jungle has live attendance & demand data."* | A branded panel advertising a feature that does not exist. By this repo's own definition that is theatre. Either cut it or make it the "add your first class" call to action. |
| Schedule | *"Trainer load balances here once classes are scheduled with assigned coaches."* | Same shape. |
| Members | *"Check-in speed — Not measured yet… The target is under 5s."* | Exposes an internal engineering target to a gym owner. They did not set it and cannot act on it. |
| Members | `—` and `NO DATA` tiles | Read as errors. An empty stat should read as "nothing yet", not as a fault. |
| Team | *"Team accounts are available on the online version of Jungle."* | A nav destination whose entire content says it does not work. Either hide it when `!supabaseEnabled` or make it say what to do. |

**The rule to apply:** an empty state should name the ONE action that fills it, and be a button.
The Dashboard's 3-step checklist already does this well — copy its voice.

### 2.3 Inconsistent confirmation and no undo anywhere

There is no shared toast/undo primitive. Every destructive action is immediate. **Prefer undo
over confirmation** where the data can be held for a few seconds — a confirm dialog interrupts,
an undo does not — but §2.1's coach delete is expensive enough to deserve both.

---

## 🟦 3. UI polish — the whole point of the session

**Dylan's scope decision: POLISH ONLY, NO NEW SURFACES.** No new screens, no new nav entries, no
new product concepts. Everything here makes an existing surface better for the trainer, the owner
or the member. If a candidate helps none of those three, it is theatre and this repo deletes it.

Highest value first, roughly:

1. **Undo on every destructive action** (§2.1, §2.3). One primitive, used everywhere.
2. **Unsaved-changes guard.** The Builder holds a whole class in local state; navigating away
   loses it silently. Same for the plan editor.
3. **Keyboard shortcuts in the Class Runner.** A coach's hands are busy: space = start/pause,
   ←/→ = stage, and an on-screen legend. This is the screen used under time pressure.
4. **Focus management everywhere a dialog opens or closes.** Return focus to the opener; trap
   inside while open. Partly there via `useDialog` — finish and prove it.
5. **Save confirmation.** Saves are silent, so a coach cannot tell a save from a no-op. A quiet
   toast, not a modal.
6. **Loading and skeleton states.** Lazy chunks show a bare fallback; hydration shows nothing.
7. **Empty states rewritten as actions** (§2.2).
8. **`aria-live` on the things that change without a click** — the Runner's stage/timer, the
   sync banner, the at-risk count. A screen reader currently learns none of them.
9. **Touch-target audit at 390 px.** The repo is mobile-first; several icon buttons are 13 px
   glyphs with 4 px padding, which is well under the 44 px guidance.
10. **Consistent destructive styling.** Delete controls are currently `var(--muted)` and look
    identical to Edit.

⚠️ **Every one of these must land with a test that fails when it is reverted.** "Polish" is
exactly the category that rots silently, because nothing breaks when it regresses.

---

## 💡 4. Claude's own suggestions — for Dylan to accept or cut

Not started, not assumed. Flagged because they came up while reading the product:

- 🔴 **The sync failure in §0 may be a live data-loss condition at The Garage.** If those writes
  have been failing on Dylan's own machine, his personas exist on exactly one device. Worth
  checking before anything else in this file.
- **The Team screen should probably not be in the nav when `!supabaseEnabled`.** `isViewEnabled`
  is the existing choke-point for exactly this.
- **"GOOD AFTERNOON, COACH"** — the app knows the coach's name everywhere else.
- **A "what changed" line on the class summary.** The member page is the only member-facing
  surface; it currently shows the class and nothing about them.
- **Print / PDF a plan.** Coaches still put paper on a clipboard. Cheap via `@media print`.
  ⚠️ This is arguably a NEW surface — ask before building.
- **The Dashboard checklist never celebrates.** Reaching 3/3 should say so, once.

---

## 🔁 5. The loop — how to keep going without inventing work

Dylan asked for continued iteration toward "perfection". The way that stays honest here:

1. Pick the highest item still open in §1 → §2 → §3, in that order.
2. Build it. Add the test. **Prove the test fails without the change.**
3. Run the gates. Commit with the reasoning, not the diff.
4. **Then drive the surface you just touched and LOOK at it** — at 1280 px and 390 px. Session
   24 shipped two copy defects that every assertion passed and one screenshot caught.
5. Re-read §2 and §3 and cross off what is genuinely done.
6. Repeat.

🔴 **Stopping conditions — respect them.** "Keep going" does not mean "never stop":

- **If the remaining items are all theatre, stop and say so.** An honest "this is finished" is a
  result. This repo's §1d precedent: *not every look finds a defect, and saying so is a result.*
- **Never add a feature to have something to do.** That is the one thing the product paragraph
  forbids.
- **If A12/A13/A1 move, drop everything.** Verifying N4 against real Edge Functions outranks all
  polish — it is the only part of the product untested by construction.

---

## 6. Carried forward — all still true

**Everything in `SESSION-HANDOFF.md`'s session-24 block**, and:

- 🔴 **`git fetch` before you commit**; the system-prompt `gitStatus` snapshot can disagree with
  a live `git status`. **And check CI — it can be RED while a doc says green** (it was, at
  `5854d93`): `curl -s ".../actions/runs?per_page=3"`. ⚠️ Filter by workflow NAME; session 24
  read a Dependabot run and briefly reported the wrong green.
- **`daysBetween` counts LOCAL CALENDAR DAYS.** Do not "simplify" it to an elapsed-ms floor.
- **`store.deletePersonaMovement` is CONDITIONAL** — safe only for a zero-occurrence row.
- **`aggregateMovements` re-derives the catalogue on EVERY recompute; there is no tombstone.**
- **The class type's NAME is its key in FOUR places.** Anything new keyed by it calls `isMove`.
- **`npm run size`** — two budget sets, mode asserted. CI runs `--prod`. Raise a ceiling only in
  the same commit as the change that needs it, and say what bought the bytes.
- **Mutate to prove a test can fail; revert with the INVERSE mutation, never `git checkout`.**
  ⚠️ A mutation left in the tree is a live defect — check `git diff` before you stop.
- **`getByText` and `.textContent()` disagree about `text-transform`** — and chaining them hung a
  probe for 30 s. **`getByPlaceholder` matches substrings.** **`beforeEach` is per-`describe`.**
- **The Exercise Library is a full-screen modal at `zIndex:600`** — `nav()` cannot be called
  while it is open. This ate a probe in session 24.
- **A phone gets the bottom bar; `nav()` is desktop-only**, and the sheet's labels carry emoji,
  so match with a regex, not `exact: true`.
- **No infra changes without asking Dylan.** Sentry = sub-processor. A new table/migration = his
  call. Edge Functions deploy by him pasting.
- **Write commit messages to a file and use `git commit -F`.** **PowerShell:** `npm.cmd`/
  `npx.cmd`; PS 5.1 wraps native stderr as `NativeCommandError` — a `git push` that reports
  success is a success. ⚠️ `playwright test -g "a|b"` exited 255 in this shell.
- **NEVER round-trip UTF-8 through PowerShell `Get-Content`/`Set-Content`** — write a guarded
  one-shot `.mjs` in the repo, print its result, delete it.
- **An honest blank beats a confident wrong guess.**

---

## 7. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build && npm run size
```

**0 crash · 784 unit · 307 e2e · 5-chunk build.** CI runs the same chain plus `size --prod`.
⚠️ e2e can fail broadly on a stale server holding the e2e port — **re-run once before
investigating.**

---

## 8. Do NOT

- **Do not delete `SyncBanner` before reading §0.** It is currently telling the truth.
- **Do not add a new screen, nav entry or product concept.** Dylan scoped this to polish.
- **Do not merge the Dependabot PRs** without asking.
- **Do not re-raise:** N4, the a11y sweep, the crash gate's JSX blind spot, I10, DEC-12/13, I6,
  the `class_type` vocabulary, the CSV backfill, the class-type rename, the recommendation panel,
  the catalogue delete, the orphaned-row card, `Reopen`, `GEN_CAP`, `deadctl`'s FLAGS gating,
  same-preset repeat avoidance, or `BrandStudioScreen` (measured and declined, §4.2 of the
  previous prompt — now in `docs/history/`).
- **Do not start N2/N3/P2, or undo the `FLAGS.music` gates.**
