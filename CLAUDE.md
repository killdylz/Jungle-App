# Jungle — working notes for Claude

The class operating system for boutique fitness studios. React 19 + Vite, local-first
(localStorage is the source of truth, Supabase syncs behind it), deployed to GitHub Pages.

**This file is the stuff that is expensive to rediscover.** It is deliberately short so it
actually gets read. The full reasoning behind every decision lives in commit messages and
`SESSION-HANDOFF.md`; this is the operational layer.

---

## Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build && npm run size
```

Green as of `852550c` (session 31): **`lint:crash` 0 · 1069 unit (39 files) · 483 e2e (47 spec
files) · 12-chunk build · 0 over budget.** App.jsx is **2,373 lines**.

⚠️ **`syncBanner.spec.js` flakes under FULL-SUITE load, and has for three sessions running.**
It is INTERMITTENT, not one-per-run: session 31 did two full runs and got one failure and one
clean sweep. When it does fail it is a different test each time, and all 7 pass alone. The tell is a `waitForApp*` timeout whose error context has **zero page snapshots**: the
app never mounted, so nothing about the banner was exercised. **A real regression fails the same
test twice.** Re-run the spec alone before investigating.

🔴 **`npx playwright test` EXITS 0 WITH FAILING TESTS.** Confirmed again in session 31: exit code
0 under a run reporting `1 failed`. **Read the count, never the exit code.**

**⚠️ `index.js` is the binding constraint — 203.06 / 215 kB, 5.6% headroom — and it is 93%
REACT.** Session 29 attributed every byte via the sourcemap: react-dom alone is 172.40 kB, and
**all of our own code in the entry chunk is 11.19 kB**. This ceiling is not app-code creep and
**cannot be fixed by moving app code**; the full table is in `check-size.mjs`'s header. StaffApp
has 13.7% headroom (310.73 / 360 kB after session 31's coach edit form) and is not the constraint.

🔴 **Rollup places whole MODULES, not exports.** `main.jsx` imports one function from `colors.js`
and that put the entire file — the owner-only brand generator included — in the chunk a MEMBER
downloads, while a comment in `BrandStudioScreen.jsx` claimed the opposite for a whole session.
**Any eager import from a module is an import of all of it.** A new screen goes in a `lazy()`
chunk **with its own budget line in `check-size.mjs`**: an unlisted chunk has no ceiling at all.

- `lint:crash` must be **0**. It is NOT the style baseline — `npm run lint` reports a few hundred
  advisory problems and that is expected; judge on runtime. ⚠️ The crash gate is **blind to
  `<UndefinedComponent/>`**: it resolves identifiers, not JSX element names. It is also blind to
  an **unused import** — App.jsx carried nine dead ones for a session — but it does catch a
  duplicate binding, which is the division of labour that config documents.
- ⚠️ **e2e can fail broadly on a stale dev server holding port 5191.** Symptoms are
  `ERR_CONNECTION_REFUSED` or `Failed to fetch dynamically imported module` across many specs.
  **Re-run once before investigating.**
- 🔴 **`syncBanner.spec.js` IS FLAKY UNDER FULL-SUITE LOAD, and it is not a defect.** Session 30
  ran the full suite twice and each run failed **one** test in this file — **a different one each
  time** (line 34, then line 124) — and all seven passed when the spec was run alone. The tell is
  that the failure is a `waitForApp` timeout with **no page snapshot in the error context at all**:
  the app never mounted, so nothing about the banner was ever exercised. A real regression fails
  the SAME test twice. **Re-run the spec alone before reading anything into it.**
- ⚠️ **A REVERTED MUTATION ON AN UNTRACKED FILE DOES NOT SHOW IN `git diff`.** The standing rule
  is to mutate, confirm red, revert, and `git diff` before stopping — but a NEW file is
  untracked, so a failed revert leaves the source mutated and the diff clean. Session 30's
  revert script aborted on an empty-string anchor and left `coachKey` without its
  `.toLowerCase()`. `grep -rn MUTATION src/` does not help either when the mutation is a
  DELETION. **Re-read the function you mutated**, not the diff.
- Raise a size ceiling **only** in the commit that needs it, and say what bought the bytes.
- **No infra changes without asking Dylan.**
- ⚠️ **Do not edit source while the e2e suite is running.** Vite HMR fires, `main.jsx`
  re-executes, and specs fail on `createRoot() on a container that has already been passed to
  createRoot()`. It reads like a real defect and is not. Session 29 lost a 7-minute run to it.

---

## Shell (Windows)

PowerShell 5.1 is primary; a Bash tool exists too. Each has its own syntax and they do not
share a filesystem view.

- **`npm.cmd` / `npx.cmd`**, not `npm` / `npx`.
- **PS 5.1 wraps native stderr as `NativeCommandError`.** A `git push` that reports this and
  prints `abc123..def456 main -> main` **succeeded**. Read the last line, not the error class.
- ⚠️ **PowerShell mangles `node -e` containing `--`.** `var(--muted)` parses as a unary
  operator and the command dies with `Missing expression after unary operator '--'`. Use a Bash
  heredoc writing a `.mjs`, or just use the Edit tool.
- ⚠️ **Git Bash `/tmp` is not Node's `C:\tmp`.** A heredoc written in Bash and read by
  `node -e` fails with `ENOENT`. Use one tool for both halves, or write into the repo and delete.
- ⚠️ **`playwright test -g "a|b"` exits 255** in this shell. Filter by file path instead.
- **Write commit messages to a file and use `git commit -F`.** Multi-line `-m` is painful here.
  ⚠️ Write that file with the **Write tool**, not `printf`/`echo` in Bash. Backticks inside
  double quotes run as command substitution, so a message mentioning a `cancelled` run silently
  loses the word and prints `cancelled: command not found`. A single-quoted heredoc is the other
  safe option; anything double-quoted is not.
  ⚠️ **`Out-File -Encoding utf8` is NOT safe either** — PS 5.1 writes a BOM, which git keeps, so
  the commit subject starts with an invisible U+FEFF and reads as `﻿Subject` in `git log`. Session
  27 shipped one (`b984401`) and left it rather than force-pushing over a cosmetic fault. Use the
  Write tool.
- ⚠️ **`git add -A` before `rm`ing your message file commits the message file.** Prefer
  `git commit -F msg.txt --only <paths>`.
- ⚠️ **The Edit tool converts `\uXXXX` in its arguments into real control characters.** Writing
  a literal escape sequence into source needs a one-shot `.mjs`.

### 🔴 Check what your branch is based on, EVERY time

Three sessions in a row have started behind because the previous session's work was on its own
`claude/…` branch and **nothing merges those to `main`**. Session 29 started five commits behind;
session 30 started **fourteen**, and the commit its prompt named as the baseline did not exist in
the repository at all.

```bash
git log --oneline -3                      # does the top commit match the prompt?
git ls-remote --heads origin              # if not, the work is on another branch
git merge --ff-only <that branch's tip>   # usually a clean fast-forward
```

**Confirm the fix with a gate, not with the log**: run `npm test` and check the count against the
prompt's. A tree that merely builds is not proof you are where the prompt thinks you are.

### More than one session may share this working tree

It has happened, and it is not obvious while it is happening: another session can commit your
uncommitted work, delete a scratch file you are using, and leave a `MUTATION` marker in a source
file that makes your gate run lie.

**If you are sharing a tree** (check `git worktree list` — one entry means everyone is in the
same checkout):

- `git status` before every commit, and stage **only your own paths**. Never `git commit -a`.
- `grep -rn MUTATION src/` before trusting any green gate.
- Prefer new, uniquely-named files over edits to shared ones.

**Better: give each session its own worktree.** Same repo, same history, separate files, so the
collision is structurally impossible rather than something you have to keep noticing:

```bash
git worktree add ../jungle-s27 -b session-27
cd ../jungle-s27 && npm install        # node_modules is not shared
```

Merge back with a normal `git merge session-27`, then `git worktree remove ../jungle-s27`.

### Two sessions cannot share a dev server either

Ports are fixed by default and that is what makes concurrent runs fight. Both are overridable,
and **the defaults are unchanged** so CI is unaffected:

```bash
$env:JUNGLE_E2E_PORT = "5291"; npm run test:e2e
```

`JUNGLE_E2E_PORT` moves the e2e dev server (default 5191); the preview server follows at
`PORT + 1` unless `JUNGLE_PREVIEW_PORT` says otherwise. `.claude/launch.json` carries `dev`
(5173), `dev-alt` (5180) and `dev-alt2` (5181) for the same reason — pick an unused one rather
than fighting for 5173. All three pass `--strictPort`, so a taken port **fails loudly** instead
of Vite silently picking another one that the preview pane then cannot reach.

---

## CI

```bash
gh run list --repo killdylz/Jungle-App --workflow "Deploy to GitHub Pages" --limit 5
```

- **Filter by workflow NAME.** `Deploy to GitHub Pages` is the run that gates this repo. The
  `npm_and_yarn` Dependabot run has been **red since `76b800c`** and is not a build failure.
- ⚠️ **`cancelled` is usually not a failure.** GitHub Pages uses a concurrency group that kills
  an in-flight deploy when a newer push arrives, so several pushes in a row leave one `success`
  and a trail of `cancelled`. **Judge the run whose SHA is `HEAD`.**
- `gh` resolves on `PATH` only in a shell started *after* it was installed; otherwise call
  `"C:\Program Files\GitHub CLI\gh.exe"`. Outside the repo it needs `--repo killdylz/Jungle-App`.

---

## How work is done here

**Before starting any named backlog item, verify it against the code.** Session 26 found three
items on its own prompt that were false — a data-loss guard for a loss that could not happen, a
"three offenders" list that was a hundred, and a requested assertion that would have pinned a
product decision backwards. Prose in a handoff is where stale claims survive and get more
confident with each rewrite.

**Every change lands with a test that fails when the change is reverted.** Mutate the source,
confirm red, revert with the **inverse edit**, and `git diff` before stopping. Polish is exactly
the category that rots silently, because nothing breaks when it regresses.

**Every sweep carries a positive control in the same run.** A scan that matched nothing and a
scan that found nothing are indistinguishable from the assertion's side, and this repo has been
fooled by exactly that. If a sweep cannot be made to fail, delete it.

🔴 **`toHaveCount(0)` is NOT an assertion that something never happens.** It is satisfied the
instant the count is zero, which includes "has not rendered yet". Session 27 proved it: a mutation
making an autosave fire a toast on every write left all three "stays silent" tests green. For any
"X never appears" claim, **observe** — a `MutationObserver` recording every mount, read after the
action — or at minimum poll a store write first so the effect has demonstrably run.
`e2e/saveToasts.spec.js` has the shape.

🔴 **An empty screen passes every scan trivially.** This has now bitten twice in one session, in
two different files: a tap sweep and an interaction sweep both went green on screens that had
nothing on them. Seed the fixture, and assert the thing you are about to measure exists first.

**Drive the UI, and then LOOK at it** — at 1280px and 390px. Mutation-checked tests have still
missed real defects; reading the rendered screen caught copy defects that 367 passing tests did
not. **Assert the STORED object, not only what was rendered.**

**A passing test can pin a defect.** Green means the code matches the tests, not the product.

---

## Testing traps

- ⚠️ **Playwright AUTO-DISMISSES dialogs.** A test that clicks a delete and asserts the row is
  gone is exercising **cancel**. Use `page.once("dialog", d => d.accept())` and drive both paths.
- ⚠️ **`nav()` leaves focus on the button it clicked.** Any test pressing a key, or walking the
  tab order, starts halfway down. `blur()` does **not** reset it — Chromium keeps a sequential
  focus navigation starting point. Use
  `document.body.setAttribute("tabindex","-1"); document.body.focus();`.
- ⚠️ **`navAnyWidth` takes a screen OBJECT from `ALL_SCREENS`, not a string**, and its `aside`
  count is a **one-shot read that races a reload**. Follow `page.reload()` with
  `waitForAppAnyWidth` or a 1280px test silently takes the phone branch and hunts for a "More"
  button that is not there — the failure names "More", which reads as a nav defect and is not one.
- 🔴 **`new Date("2026-08-22")` is UTC MIDNIGHT**, so `.getDate()` is **21** anywhere west of
  UTC. Never parse a stored `YYYY-MM-DD` that way — build `new Date(y, m-1, d)`, which is local
  by construction. `fmtSessionDay` in `format.js` does, and its test demonstrates the trap next
  to the fix. This is the same bug as a UTC write, one layer further out and harder to see,
  because the STORED value is right and only the render is wrong.
- ⚠️ **A test that needs a TIMEZONE must set one, and prove it took.** The suite runs in UTC,
  where local and UTC dates are identical, so any assertion about local-date handling passes
  against the bug. Use `vi.stubEnv("TZ", …)` — **not** `process.env.TZ =`, which is 3 crash-lint
  errors because `process` is not a declared global — and assert the offset FIRST, so a zone that
  did not take fails loudly instead of proving nothing. `src/lib/joinDate.test.js` has the shape.
- ⚠️ **Three nav vocabularies**: sidebar "Class Builder" / More sheet "Builder" / bottom bar
  "Build", and below **900px** there is no sidebar. `ALL_SCREENS` and `navAnyWidth` in
  `e2e/helpers.js` hold all three — use them rather than a fourth list.
- ⚠️ **Resizing without reloading shows a stale render.** Every responsive assertion must be on
  a fresh load at the stated width.
- ⚠️ **A fixed clock freezes `Date.now()`**, so ids derived from it collide across a re-mint.
- ⚠️ **Do not report a defect your own fixture manufactured.** If you had to guess a row's
  shape, a crash on it is not evidence.
- ⚠️ **Apostrophes in the UI are `&rsquo;` — a real U+2019.** `getByText("Who's slipping away")`
  matches nothing, and the test then fails on its selector rather than on the thing it tests.
- ⚠️ **The "Exercise Library" nav entry opens a MODAL, not a screen.** It covers the sidebar and
  traps focus, so any loop visiting every screen must visit it **last**.
- 🔴 **A LEGIBILITY FLOOR MUST BE ABSOLUTE, NOT PROPORTIONAL.** `tvFont`'s floor was
  `scaled * 0.7` — 70% of the thing it was protecting, which shrinks the small end of the scale
  by exactly 30%. On a **1280×720** wall (a projector, or a laptop on HDMI) every room-facing
  size lands on it, so `tvFont(13)` exercise names rendered at **9px**. `TV_MIN_PX` is now an
  absolute minimum. ⚠️ A `clamp()` whose floor exceeds its cap is **invalid CSS and the browser
  drops the declaration** — lift the cap, never lower the floor.
- ⚠️ **`tvFont` is for type on a WALL, not for chrome.** Pushing an 11px label through it makes
  it **7px** on a 720p display. A mechanical conversion of every fixed size on the room boards
  made them worse and was reverted whole.
- 🔴 **`ALL_SCREENS` IS THE NAV, NOT THE PRODUCT.** The Room TV is a fullscreen overlay off the
  Class Runner, so every sweep that iterates `ALL_SCREENS` — a11y, layout, tap, contrast — had
  never once looked at the surface `UI-UX-DIRECTION` §1 calls the one that must be flawless. It
  was painting raw stage hues at **4.22:1 on Canopy**. `brandTokens.spec.js` enters it explicitly;
  any new sweep must too.
- 🔴 **NOT EVERY COMPUTED COLOUR IS `rgb(...)`.** A `color-mix()` computes to
  `color(srgb 0.93 0.31 0.31)` — channels in **0–1, not 0–255**. This cost real time twice in
  one session: a contrast scanner that scraped the numbers read every mixed ink as
  `rgb(1,1,1)` and *silently passed* a screen full of unreadable text, and a `toMatch(/^rgb/)`
  positive control failed on a change that was correct. Parse the `color(` form, and assert
  that a colour **exists** rather than what shape it takes.
- ⚠️ **Appending 8-bit hex alpha (`` `${c}18` ``) only works while `c` is 6-digit hex.**
  `var(--warn)18` is not a colour, and the element loses the tint *and* the border silently.
  A hue used for both a FILL and INK therefore needs **two values** — the raw hex for the
  plate, `hueInk(hex)` for the text. `CalendarScreen`'s `GRID_FALLBACK` documents the same trap.
- ⚠️ **`el.focus()` does NOT trigger `:focus-visible`.** A programmatic focus sweep reported 35
  of 40 controls as ringless; all false. Press Tab.
- ⚠️ **Chrome reports `outline-style: auto` with a computed width of `0px`.** A check for
  `outlineWidth > 0` calls every default-ringed button a failure and buries real hits among
  invented ones. The signal is the STYLE being `none`.
- ⚠️ **A control that opts out cannot measure the rule it opted out of.** An inline
  `transition:all .15s` beats the global reskin rule, so measuring that element says nothing
  about the rule.
- ⚠️ **`test.use({ reducedMotion })` does not apply through a scratch Playwright config, and
  fails OPEN.** Use `page.emulateMedia` and assert the precondition — that is what caught it.
- ⚠️ **`jungle_skin` holds a bare string, not JSON** — the `stored()` helper parses and cannot
  read it.
- ⚠️ **A control that is a `<div onClick>` is invisible to `keyboard.spec.js`**, which sweeps
  elements with a ROLE. Session 27 found the Brand Studio's three skin presets that way — and only
  because a test tried to click one *by role*. Clicking by TEXT works on a div, so the workaround
  that makes tests pass is what hides the defect.
- ⚠️ **Screenshots fail unless the Browser pane is displayed.** Use `read_page`, `get_page_text`
  and `javascript_tool` geometry reads.

---

## Domain rules that are easy to get wrong

- **`daysBetween` counts LOCAL CALENDAR DAYS**, not 24-hour periods. The datum is a date and the
  reader is a human with a calendar.
- **A class type's NAME is its key in FOUR places**, including the generation ledger. A rename
  must carry them; a MOVE must not.
- **`aggregateMovements` re-derives the catalogue from the plans on every recompute** and has no
  tombstone. A zero-occurrence row is KEPT when it carries a manual edit.
- **`deletePersonaMovement` is CONDITIONAL** — safe only for a zero-occurrence row. Read the
  comment above it.
- **`restorePersonaCascade` and `_clearLedgerIfSettled`** (`store.js`) look redundant and are
  not. Both have unit tests saying so. Do not "simplify" them.
- **`--danger` and `--warn` are deliberately not skin-derived.** A gym whose accent is red
  must not get a delete button matching its primary action. Both are FILLS; used as INK they
  still go through `hueInk`.
- **A decorative hue used as INK goes through `hueInk`** (`colors.js`) — `color-mix(in srgb,
  var(--text) 65%, hue)`. The 65% is measured, not chosen: at 60% the worst pair is 4.36:1 and
  `colors.test.js` asserts BOTH the floor and that edge. A **filled** plate is the other case
  and takes `inkOn(hue,"#000000","#FFFFFF")` instead.
- **`isViewEnabled` is the single choke-point** for what appears in a nav — there are four nav
  arrays in `App.jsx`, and a second rule bolted onto one of them is how a screen survives in
  exactly one menu.
- **Destructive actions are CONFIRMED or UNDOABLE**, and the guard scales with what is destroyed.
  An undo holds the **prior list**, not the deleted row — position is part of what was lost.
- **A confident wrong number is worse than no number**, and a panel promising a feature that
  cannot arrive is worse than no panel.
- **`isViewEnabled` maps some views to a MOCK flag**, so "the route exists and is in three nav
  arrays" can be true while the entry renders nowhere. `analytics` was live and unreachable for
  months that way. Replacing a mock with a real screen means removing it from `MOCK_VIEW_FLAG`,
  which is not the same as flipping the flag.
- **Cohorts key on FIRST RECORDED VISIT, never `joinedAt`.** `applyAttendanceImport` writes
  `joinedAt: ""`, so a gym that imported two years of history has zero known join dates — the
  opposite of what a join-date analysis would imply about who has more data. `retention.js`'s rule 1
  refuses the same substitution for a different reason: it asserts a tenure it does not hold.
- **A pooled retention curve with per-point denominators can RISE**, and each point is individually
  correct while the line lies. Use one population for every point (`lib/cohorts.js`).
- **The Brand Studio AA panel and `e2e/brandTokens.spec.js` share ONE implementation** of the
  compositing maths, in `colors.js`; `contrastScan.js` serialises those functions into the page.
  They must stay self-contained — arguments and each other, nothing else — or they arrive with
  undefined bindings. `colors.test.js` asserts that by evaluating them in an empty scope.
- **`contrast.passesAA` is `textOnBg >= 4.5` and NOTHING else.** It is not a verdict on a
  palette: a generated accent can be 1.25:1 on its own background while it reads true. Anything
  showing an AA claim to an owner must read `auditPairs`.
- **A gym's accent is not ours to nudge.** `--danger`'s rule generalises: a colour the gym chose
  is reported, never silently bent. `DYLAN-QUEUE.md` A14 is the open yes/no on the two palettes
  where that leaves it below AA.
- **A failed DELETE needs a tombstone, not a ledger entry.** `_noteSyncError` alone makes the retry
  lie: the pusher's upsert cannot remove a server row, so it succeeds and clears the error. See
  `PENDING_DEL_KEY` in `store.js`.
- 🔴 **A COACH ON A CLASS IS A TYPED NAME AND MUST STAY ONE.** `class_schedule_rules.coach` is
  `text`; there is deliberately no `coach_id` on the rule. Identity lives in the roster
  (`lib/coachRoster.js`) and is resolved BY NAME, so nothing is added to the class row and nothing
  can be dropped by a server-wins hydrate. `coachKey` folds case, whitespace and Unicode
  composition and **never merges two different names** — "Mara" and "Mara K." are one person only
  if a gym says so with an alias.
- 🔴 **`_classToRow` MUST NOT NAME A COLUMN THE MIGRATION HAS NOT CREATED.** PostgREST rejects the
  WHOLE batch, so one unknown key stops every class in the gym syncing while the ledger says only
  that the table failed. `dbConstraints.test.js` now parses each `create table` and guards every
  row mapper against exactly this.
- 🔴 **`class_instances.coach_id` is the person who TEACHES, not the one who published.** It was
  `_ctx.userId` until session 30 — one manager pressing publish recorded every class in the gym as
  theirs. `created_by`, one line below, is where "who wrote this row" belongs. It resolves through
  the roster and is **NULL when unknown**, which is worth more than a non-null value that is wrong.
- 🔴 **THERE IS NO COMPARE-AND-SET IN THIS PRODUCT.** `store.js` contains zero `.update()` calls —
  every write is an unconditional `upsert`, `insert` or `delete`. A cover approval needs
  `set status='approved' where id=$1 and status='open'`; pushed through `_bgUpsertDelta` instead,
  two coaches both approving both succeed and one is shown an approval that did not happen. Build
  the primitive before wiring `cover_requests` to a server.

---

## Where the rest lives

- `SESSION-HANDOFF.md` — the two most recent sessions in full. Read the top block first.
- `docs/history/HANDOFF-ARCHIVE.md` — sessions 6–28.
- `DYLAN-QUEUE.md` — what needs Dylan rather than code.
- Commit messages carry the reasoning. `git log` is the real design record here.

**A field nothing writes breaks nothing, so no test can notice it.** Session 30 shipped four
`updateCoach` keys with no control and 1019 tests passed. `node scripts/audit-store-writers.mjs`
is the check that finds the next one; `docs/STORE-WRITER-AUDIT.md` has the classified list and —
more usefully — what the sweep **cannot** see. Its allowlist in `storeWriters.test.js` is its
positive control: adding a line there is a product decision, not a way to green the build.

🔴 **Outstanding and not code:** `DYLAN-QUEUE.md` **A14** is a yes/no on whether Jungle bends a
gym's accent to make it legible, and **A16** is a yes/no on whether Jungle should write back to a
gym's booking system at all — nothing is blocked on either. **A15** is not optional in the same way:
migration `0010_coach_cover.sql` is what makes a cover request reach a second person, and until it
runs the request is on one phone. ⚠️ The compare-and-set the settle needs now EXISTS
(`src/lib/compareAndSet.js`, session 31) and A15 carries a note for whoever wires it — use it
rather than `_bgUpsertDelta`, which would let two approvals both succeed silently. It has never
made a real request. Migrations `0005_coach_personas.sql` and
`0006_persona_generations.sql` have never been applied either. Until they are, a gym's personas, plans
and movement catalogue exist on **one device with no server copy**. Also **10 unmerged Dependabot
PRs** — five are major GitHub-Actions bumps. **Ask Dylan before merging any of them.**

🔴 **`main` is FOUR sessions stale and nothing merges to it.** Sessions 28–31 live only on their
own `claude/…` branches, and each new session has started on `main` and had to fast-forward.
Check `git log --oneline -3` against the prompt's baseline **and confirm with `npm test`, not the
log** — a matching unit count is proof of position; a tree that merely builds is not.
