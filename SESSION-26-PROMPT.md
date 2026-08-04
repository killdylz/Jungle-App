# Jungle — Session 26 Build Prompt

**Session 25 kept the direction and got through the first two-thirds of it.** The brief was:
regression depth → remove what is awkward → UI polish, no new surfaces → keep going. Depth and
the awkward parts are done. **Polish is where 26 starts, and there is a real list.**

**Last commit `b74cfe3`**, tree clean, pushed. Gates:
**`lint:crash` 0 · 809 unit (28 files, no todos) · 381 e2e (35 spec files, no fixme) ·
`deadctl` 0 suspect / 73 files · build: member path 211.49 kB, staff 557.10 kB
(StaffApp 346.92/360 kB — 3.6% headroom, the tightest budget in the repo).**
App.jsx **3,608 lines** (was 3,513).

> 📌 **Session 25 ran on past this document being written.** Two of the eight polish items below
> — §3.1 (half) and §3.4 — shipped after it, in `5525f2e` and `b74cfe3`, and the entries are
> struck through and annotated rather than deleted so the reasoning stays readable. **Read the
> annotations: §3.1 is only half done, and §3.4 opened a follow-up question.**

⚠️ **Still 10 unmerged Dependabot PRs** (#1–#10), unchanged since session 24. Five are MAJOR
GitHub-Actions bumps (#1–#5), one is `@vitejs/plugin-react 5→6` (#6) which can change chunking,
and #9/#10 are React itself. **Ask Dylan before merging any of them.** ⚠️ The `npm_and_yarn`
Dependabot run is RED and has been since `76b800c` — that is a Dependabot-owned run, **not** the
`Deploy to GitHub Pages` workflow, which is the one that gates this repo. Do not report the wrong
green (session 24 did) and do not report this red as a build failure.

---

## 🔴 0. The one thing that needs Dylan, not code

The sync banner names four domains: **coach personas, class plans, movement catalog, generated
classes**. Session 25 diagnosed it and the answer is not in the client.

**Those four tables are exactly what migrations `0005_coach_personas.sql` and
`0006_persona_generations.sql` create, and no others.** That pattern rules out both cheaper
explanations:

- **Not RLS.** `0003`'s `library_overrides` and `brand_profiles` carry the *identical* write
  predicate — `is_platform_admin() or is_gym_admin(gym_id)` — and are **not** in the ledger. So
  `is_gym_admin()` returns true for this user. And `0006`'s `persona_generations` uses a
  **looser** member-level policy and still fails, which no membership problem explains.
- **Not a CHECK constraint.** That is a per-column, per-table failure. This is four tables at
  once, and `planSource` already guards the one constrained column that has bitten before.

What is left is that **the tables are not there**. `0005`'s own header still reads
*"DRAFT — not yet applied"*, and `DYLAN-QUEUE.md` lists both files in the paste-in-order list.

### Dylan: 5 minutes

Supabase → **SQL Editor → New query** → paste the whole of
`supabase/migrations/0005_coach_personas.sql` → **Run**. Then the same for `0006`. Both are
idempotent and safe to re-run.

**Then confirm it worked without being told:** the banner clears itself on the next retry (≤30s),
because the ledger clears on the next successful write. That is the proof, and it is why the
banner was rebuilt rather than deleted.

**If it does NOT clear**, open the banner's **What went wrong** — it now shows the exact Postgres
string — and paste that line. The three remaining candidates are a different message, and the
message names which.

🔴 **Worth saying plainly:** if those writes have been failing on Dylan's machine, his personas,
plans and movement catalogue exist on **exactly one device** with no server copy. That is a live
single-point-of-failure on the most expensive data in the product, and it has been true for some
time. It is not lost — the hydrate guards prevent that — but it is one laptop away from being.

---

## 1. What session 25 shipped — do not redo any of it

Four commits. Read the commit messages, not the diffs; the reasoning is in them.

| Commit | What |
|---|---|
| `3b607fa` | **The sync banner earns its place.** Try now (wired to the `_retryNow` that already existed and had no button), the real Postgres error in a `<details>`, "last tried 2 min ago · 14 failed attempts", escalating copy + colour past 5 attempts, and a dismiss keyed on a signature of table+message. |
| `9f9f156` | **Two sweeps** — §1.1 responsive (9 screens × 390/768/1280) and §1.2 keyboard (reachability + focus never lost). |
| `7277d8f` | **One toast primitive and the first undo in the product** — plus the coach delete's confirm, and `restorePersonaCascade`. |

**Three things in there that will bite the next person if they are not known:**

1. 🔴 **`_clearLedgerIfSettled`** (`store.js`). `_bgUpsertDelta` makes no request when there is no
   delta, and `_clearSyncError` only runs after a *successful* request — so a ledger entry could
   become immortal once its rows were confirmed or deleted. The banner named a domain with
   nothing left to send, forever, with no coach action able to clear it. Fixed; do not "simplify"
   the empty-delta branch back into a bare `return`.
2. 🔴 **`restorePersonaCascade`** (`store.js`). Undoing a coach delete cannot just re-save the
   four lists. `deletePersona` deletes only the `coach_personas` row server-side; plans,
   movements and generations go via **ON DELETE CASCADE**, so no `_unmark` runs, so their delta
   marks survive, so a re-save computes an **empty delta and pushes nothing**. Local looks
   perfect and the server stays empty until the next hydrate takes it away. The unmarking is the
   whole point of that function.
3. **The dismiss signature deliberately excludes `at` and `attempts`.** Retries rewrite both
   every 30s; including either would resurrect a dismissed banner within half a minute and make
   the button a lie. A new table, or a new message, always returns.

---

## 🟧 2. Regression depth — what is left of §1

§1.1, §1.2 and the coach/plan half of §1.3 are done. **Three sweeps remain, and they are the
three that generalise the most.**

| # | Sweep | Why it is still worth building |
|---|---|---|
| **1.5** | **Reload after every mutating action.** A table of (action → storage key → screen assertion), run twice: immediately, and after `page.reload()`. | 🔴 **The highest-value one left.** It generalises sessions 21–24's entire method into a rule. `destructive.spec.js` already does this for exactly one action ("the undo survives a reload") and that single test is the shape — the sweep is that, over every mutation. |
| **1.4** | **Fresh-install journey.** Drive the Dashboard's 3-step checklist and assert the counter reaches 3/3. | It is literally the first thing a gym sees and nothing covers it. `setupProgress.js` + `setup-checklist`/`setup-nudge` testids already exist. |
| **1.6** | **Console-error sweep extended to INTERACTIONS.** | `screens.spec.js` asserts the boundary is absent on nine screens *at rest*. Nothing asserts it stays absent after clicking things. The new `ALL_SCREENS` + `navAnyWidth` helpers make "click every button on every screen and watch the console" cheap to write — but ⚠️ see §5 on which buttons are safe to click blind. |

**§1.3 is half done.** The coach delete and plan removal are covered. Still unswept, and each
should be either confirmed or undoable by the rule the session established:

- `deleteEx` — Exercise Library, still a `window.confirm`. **Should become an undo** (§2.3's
  stated preference: a confirm interrupts, an undo does not, and one exercise is cheap to hold).
- `removeClass` — `CalendarScreen.jsx:282`, still a `window.confirm`.
- `handleReset` — "Reset to defaults" on the library, which discards every gym override.
- `handleNewClass` — replaces the whole Builder plan.
- `deletePersonaMovement` — ⚠️ **conditional**, safe only for a zero-occurrence row. Do not give
  this one a blind undo without reading the comment above it.

**The rules that make a sweep worth having, unchanged and now proven twice:**

- **Every sweep carries a positive control in the same run.** All four new sweeps do; copy it.
- **Prove each can fail.** Mutate, confirm red, revert with the **inverse** edit, `git diff`
  before stopping. Session 25 did this eight times and one of them (`fmtAgo(null)` →
  `"19675 days ago"`) caught a real bug before it shipped.
- **A sweep that only ever passes is a cost.** If it cannot be made to fail, delete it.

---

## 🟦 3. UI polish — THE MAIN EVENT, and the list is concrete

**Scope decision stands: POLISH ONLY, NO NEW SURFACES.** No new screens, no nav entries, no
product concepts. Four of the ten are now done or half-done. Here are the eight as written,
re-verified against the code, highest value first — with §3.1 and §3.4 annotated where session 25
overtook them.

### 3.1 ✅ Unsaved-changes guard — DONE, and the Builder half was a false premise

✅ **The plan editor is done** (`5525f2e`). It had four ways out — backdrop, Escape, ✕, Cancel —
and all four silently discarded 35 buttons and 82 fields of local state. It now hands the draft
back through the undo toast, guarded on `dirty` so an untouched open stays instant and silent.
Mutation-checked in both directions: forcing a silent discard and forcing always-dirty each turn
a different test red.

🔴 **The Builder needs NO guard, and an earlier draft of this section was wrong to ask for one.**
The claim — "it holds a whole class in local React state and navigating away loses it silently",
with a guard proposed on `navTo` — was **driven in the running app and is false in both halves**:

- `stages`, `sessionName` and `classChoice` live at the **App root** (`App.jsx:3184`, `:3193`,
  `:3194`), not in `BuilderScreen`. `navTo` only changes `view`, which swaps which screen renders.
  The state is never unmounted, so a navigation round trip cannot lose it.
- A `useEffect` on all three calls `store.saveDraftClass` on **every change**, so the draft is on
  disk before the coach can navigate at all. A rename survives a full `page.reload()`.

**A guard on `navTo` would have interrupted a coach to protect them from a loss that cannot
happen** — which is worse than no guard, because it teaches people to click through warnings.

`e2e/builderDraft.spec.js` now pins the persistence that makes the guard unnecessary: mutate →
assert the stored object → reload → assert again, three times over. Deleting the autosave effect
turns all three red, so if someone later moves `stages` into `BuilderScreen` the claim becomes
true again and the suite says so. **That is the condition for re-raising this, and nothing less
is.**

⚠️ **The lesson, which is the reusable part:** this item was carried across two session documents
and restated more confidently each time, without once being run. The repo rule already covers it
— *verify the backlog against the code before starting any named item* — and prose in a handoff is
exactly the place that rule is hardest to remember to apply.

### 3.2 Save confirmation — the primitive now exists, wire it up

`useToast()` is available from any screen. Saves are still silent, so a coach cannot tell a save
from a no-op. Every `save*` that a coach initiates deliberately should say so. **A quiet toast,
not a modal** — and the primitive already handles the timing.

⚠️ Do NOT toast writes the coach did not ask for (autosave, aggregation recompute). A toast that
fires on its own teaches people to ignore toasts.

### 3.3 Class Runner keyboard shortcuts

Space = start/pause, ←/→ = stage, plus an on-screen legend. This is the screen used under time
pressure with the coach's hands busy. ⚠️ `useDialog` already binds Escape at capture phase and
stops propagation specifically so the Runner's shortcuts do not fight a dialog — read that
comment before adding a `keydown` listener.

### 3.4 ✅ Touch-target audit at 390px — DONE (`b74cfe3`), with one question left open

The full measurement was **100 of 186 visible controls under 44px** at 390px. The mechanism is
`data-tap`: a transparent 44px pseudo-element over the control's centre, so the hit area grows
and the rendering does not. `e2e/tapScan.js` + the sweep in `mobile.spec.js` enforce it by
**hit-testing the running page**, because the two ways this silently fails (`overflow:hidden`
clipping the overlay, a neighbour's overlay painting over it) both leave the measured rectangle
untouched — a rect-based sweep would report a false pass on a target that is dead to a thumb.

It also turned up a real defect: **`@keyframes spin` lived in `src/App.css`, which nothing
imports.** Six Loader spinners were frozen, four of them on the app's slowest network paths,
where a still icon and a hung app look identical.

🔴 **THE OPEN QUESTION, and it is a judgement call rather than a task.** Only the controls
someone judged thumb-critical carry `data-tap`. The sweep therefore proves *the marked ones work*
— it says nothing about the other ~90. **Do not reflexively mark all of them**: `data-tap` on
adjacent controls closer than 44px apart makes their overlays overlap and steal from each other,
which the sweep will catch but which has no good fix beyond spacing them. The honest next step is
to re-run the measurement, look at what is still small, and decide per control — not to chase the
number to zero.

### 3.5 Empty states rewritten as actions (§2.2, re-verify each — the list is from session 24)

| Screen | Text | The rule to apply |
|---|---|---|
| Schedule | *"Jungle Intelligence — Scheduling suggestions appear here once Jungle has live attendance & demand data."* | A branded panel advertising a feature that does not exist. Cut it, or make it "add your first class". |
| Schedule | *"Trainer load balances here once classes are scheduled…"* | Same shape. |
| Members | *"Check-in speed — Not measured yet… The target is under 5s."* | An internal engineering target shown to a gym owner. They did not set it and cannot act on it. |
| Members | `—` and `NO DATA` tiles | Read as errors. An empty stat should read as "nothing yet", not a fault. |
| Team | *"Team accounts are available on the online version of Jungle."* | A nav destination whose whole content says it does not work. Hide it when `!supabaseEnabled` via `isViewEnabled`, or say what to do. |

**The rule: an empty state names the ONE action that fills it, and is a button.** The Dashboard's
3-step checklist already does this well — copy its voice.

⚠️ If Team is hidden behind `isViewEnabled`, **`responsive.spec.js`'s inventory guard will fail**
— by design. Update `ALL_SCREENS` in the same commit; that failure is the guard working.

### 3.6 `aria-live` on what changes without a click

The sync banner and the toast have it now. Still silent to a screen reader: the **Runner's stage
and timer**, and the **at-risk count** on Members.

### 3.7 Loading and skeleton states

Lazy chunks show a bare `screen-loading` fallback; hydration shows nothing. ⚠️ `nav()` in
`helpers.js` already waits on `screen-loading` — if the testid moves, every navigation in the
suite silently stops waiting.

⚠️ **The spinners themselves are now fixed** (`b74cfe3` — the keyframes were in an unimported
stylesheet and every Loader was frozen). So a "the app looks hung" report from here on is a
missing state, not a dead animation.

### 3.8 Consistent destructive styling

Delete controls are `var(--muted)` and look identical to Edit. Now that undo exists the stakes
are lower, but the coach still cannot tell the two apart at a glance.

**⚠️ Every one of these must land with a test that fails when it is reverted.** Polish is exactly
the category that rots silently, because nothing breaks when it regresses.

---

## 4. Claude's suggestions — for Dylan to accept or cut

Carried from 25, none started, plus two new:

- **NEW: fold the Exercise Library's local `showToast` into the shared primitive.** Five call
  sites in `App.jsx`. Deliberately left out of `7277d8f` because there is no defect behind it and
  it does not belong in a commit about undo. Small, tidy, no user-visible change except position.
- **NEW: `_bgDelete` records no sync error.** A failed DELETE only reaches `console.warn` — it
  never enters the ledger, so the banner cannot show it and `startSyncRetry` will never retry it.
  A failed delete means a row the coach removed is still on the server and will come back on the
  next hydrate. This is the same class of bug the ledger was built for, in the one path that was
  never wired to it. **Not fixed in 25** — it needs a decision about what "retry a delete" means
  when there is no local tombstone, and that is Dylan's call.
- **"GOOD AFTERNOON, COACH"** — the app knows the coach's name everywhere else.
- **The Dashboard checklist never celebrates.** Reaching 3/3 should say so, once.
- **A "what changed" line on the class summary** — the member page shows the class and nothing
  about them.
- **Print / PDF a plan.** ⚠️ Arguably a NEW surface — ask before building.

---

## 5. Traps this session paid for — read before writing tests

Everything in `SESSION-HANDOFF.md` still holds, plus:

- 🔴 **`blur()` does not reset the tab order.** Chromium keeps a *sequential focus navigation
  starting point* that survives a blur, so the next Tab resumes from wherever the last click
  left off. `document.body.setAttribute("tabindex","-1"); document.body.focus();` is what
  actually resets it. The first keyboard sweep failed on six screens because of this **and the
  app was correct every time**.
- 🔴 **`nav()` leaves focus on the button it clicked.** Any test that walks the tab order must
  reset first or it starts halfway down and reads the wrap as focus loss.
- ⚠️ **Playwright AUTO-DISMISSES dialogs.** A test that clicks a delete and asserts the row is
  gone is exercising **cancel**. Use `page.once("dialog", d => d.accept())` and assert both paths.
- ⚠️ **Three nav vocabularies.** Sidebar "Class Builder" / More sheet "Builder" / bottom bar
  "Build", and below **900px** (`COMPACT_NAV_PX`) there is no sidebar at all. `ALL_SCREENS` and
  `navAnyWidth` in `helpers.js` hold all three; use them rather than a fourth list.
- ⚠️ **The Edit tool converts `\uXXXX` in its arguments into real control characters.** Writing a
  literal escape sequence into source needs a one-shot `.mjs` (write it, run it, print the
  before/after, delete it). `store.js`'s `syncErrorSignature` has two.
- ⚠️ **Screenshots fail unless the Browser pane is displayed** ("not compositing frames"). Use
  `read_page`, `get_page_text` and `javascript_tool` geometry reads instead — they caught the
  toast/bottom-bar clearance (15px) and the `"1 class plan, 11 movements"` copy defect that every
  assertion passed.
- 🔴 **NEVER put `git status` and `git add -A` in the same shell command.** Session 25 did, so
  the status scrolled past unread and `-A` swept up a second, concurrent body of work plus a
  throwaway probe spec — committed under a message describing neither. It was caught and split
  into `5525f2e` + `b74cfe3` before pushing, but only because the file list was checked
  afterwards. **Read the status, then stage explicit paths.**
- ⚠️ **A `*.spec.js` scratch file in `e2e/` runs in CI.** There is no `testMatch` narrowing —
  `playwright.config.js` takes the whole directory. A probe left behind is a live test.
- ⚠️ **`overflow: hidden` clips a `::after` hit-area overlay** back to the visible box, and the
  element's measured rectangle does not change — so it looks exactly like the fix working.
- ⚠️ **The e2e ports (5191/5192) can still be held by the previous run's server shutting down.**
  The failure reads as `Port 5192 is already in use` plus a wall of `ERR_CONNECTION_REFUSED`.
  Check `Get-NetTCPConnection -LocalPort 5191,5192 -State Listen`; if both are free, just re-run.
- **`git fetch` before you commit**, and check CI by **workflow name** — filter for
  `Deploy to GitHub Pages`, not whatever ran last.
- **Write commit messages to a file and use `git commit -F`.** PowerShell: `npm.cmd`/`npx.cmd`;
  PS 5.1 wraps native stderr as `NativeCommandError`, so a `git push` that reports success is a
  success. ⚠️ `playwright test -g "a|b"` exits 255 in this shell.
- **Still true:** `daysBetween` counts LOCAL CALENDAR DAYS · `deletePersonaMovement` is
  CONDITIONAL · `aggregateMovements` re-derives on every recompute with no tombstone · the class
  type's NAME is its key in FOUR places · raise a size ceiling only in the commit that needs it,
  and say what bought the bytes · **no infra changes without asking Dylan**.

---

## 6. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build && npm run size
```

**0 crash · 809 unit · 381 e2e · 5-chunk build · 0 over budget.** CI runs the same chain plus
`size --prod`. ⚠️ e2e can fail broadly on a stale server holding port 5191 or 5192 — **re-run
once before investigating.**

---

## 7. The loop, and when to stop

1. Highest item still open in §2 → §3, in that order.
2. Build it. Add the test. **Prove the test fails without the change.**
3. Run the gates. Commit with the reasoning, not the diff.
4. **Then drive the surface you just touched and LOOK at it**, at 1280px and 390px. This found a
   copy defect in session 25 that 367 passing tests did not.
5. Cross off what is genuinely done. Re-verify before acting — this document has been wrong in
   both directions before.

🔴 **Stopping conditions — respect them.**

- **If the remaining items are all theatre, stop and say so.** An honest "this is finished" is a
  result.
- **Never add a feature to have something to do.**
- **If A12/A13/A1 move, drop everything.** Verifying N4 against real Edge Functions outranks all
  polish — it is the only part of the product untested by construction.

---

## 8. Do NOT

- **Do not delete the sync banner.** It is now actionable, escalating and dismissible, and it is
  the only warning that a coach's corpus exists on one device.
- **Do not add a new screen, nav entry or product concept.**
- **Do not merge the Dependabot PRs** without asking.
- **Do not "simplify"** `_clearLedgerIfSettled`'s empty-delta branch or `restorePersonaCascade`'s
  unmarking. Both look redundant and are not; both have a unit test that says so.
- **Do not replace the tap sweep's hit-testing with a `boundingClientRect` check.** It is the
  obvious simplification and it is wrong in both directions — see `e2e/tapScan.js`'s header.
- **Do not "fix" a tap-target failure by growing the visible box.** A test asserts the avatar
  stays 32px precisely so that change has to be argued for rather than slipped in.
- **Do not re-raise:** N4, the a11y sweep, the crash gate's JSX blind spot, I10, DEC-12/13, I6,
  the `class_type` vocabulary, the CSV backfill, the class-type rename, the recommendation panel,
  the catalogue delete, the orphaned-row card, `Reopen`, `GEN_CAP`, `deadctl`'s FLAGS gating,
  same-preset repeat avoidance, or `BrandStudioScreen`.
- **Do not start N2/N3/P2, or undo the `FLAGS.music` gates.**
