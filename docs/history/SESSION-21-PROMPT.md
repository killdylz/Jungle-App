# Jungle — Session 21 Build Prompt

Keep building. Session 20 spent itself on the item session 19 ranked highest — **sweep the other
eight screens with data loaded** — and the answer was **nothing**. Zero unnamed buttons, zero
symbol-only buttons, zero nameless fields, across nine populated screens and fifteen revealed
panels. Sessions 12/14/16 had already done that work; **Coaches was the one screen never swept at
all**, which is why it held everything. It was an outlier, not the first of a pattern.

Asking the same question about the **roster** instead of about **names** found two real defects,
both on the path a coach walks every class. Details in `SESSION-HANDOFF.md`, top block.

**Last CODE commit is `e81e793`**; the commit above it is the docs restructure plus this file, so
`HEAD` will not equal `e81e793` when you read this — expected, not drift. Tree clean, **pushed**.
Gates green:
**`lint:crash` 0 · 745 unit (27 files, no todos) · 239 e2e (28 spec files, no fixme) ·
build 204.50 KB index + 338.73 KB StaffApp + 91.04 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,382 lines** — one attribute changed, no lines added.

This file supersedes `SESSION-20-PROMPT.md`, now in `docs/history/`.

**Do not re-raise:** N4 (built), **the eight-screen a11y sweep with data (done, clean — see §1a)**,
the crash gate's JSX blind spot (closed, session 18), the AST `jsx` script (redundant), the docs
hygiene item (done, §4.4), I10, DEC-12, DEC-13, I6, "useSpotify ~2.5 KB", `SLOT_LABELS`,
`eslint-plugin-react`. All shipped or answered.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–20.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- New shared surfaces after session 20: `isCurrentMember` (exported from `src/lib/retention.js`),
  `MEMBER_STATUS_LABEL` (moved to `src/lib/store.js`), `e2e/checkin.spec.js`.
- 🆕 **Docs moved.** Root is **6 `.md`**. The nine audit/strategy files are in `docs/`; sessions
  6–18 of the handoff are in `docs/history/HANDOFF-ARCHIVE.md`. If a path in an older document
  does not resolve, that is why — check `docs/` before concluding a file was deleted.

---

## 🔴 0b. Measurement traps

All of sessions 16–19's carry forward (`Measure-Object -Line` misses blank lines; a truncated
result is not a negative result; check what a measurement measured for a PASS *and* a FAIL; a tool
is not evidence until proven; assert your scanner found something; a frozen clock makes any
`Date.now()`-derived id non-unique; an assertion whose expected state is already the default state
proves nothing; a node script a test imports must guard its side effects behind a run-as-main
check; `checkVisibility()` not `offsetParent`).

### 1. 🔴 A CLEAN SCAN AND A SCAN THAT RAN ON NOTHING LOOK IDENTICAL

Session 20's whole deliverable was a sweep that came back empty. An empty result is the single
easiest thing in this repo to fake by accident — the fixture not landing produces exactly the same
report as a screen with no defects.

What made it trustworthy: **every screen was scanned twice, once against an empty store and once
against the fixture, and the button count, field count and a content marker were printed side by
side.** That is what caught the one screen where the fixture genuinely did not land — the Class
Runner, whose surface comes from the Builder's draft and not from `class_instances` at all
(`marker=false`, `buttons 24→24`). Without the control, seven honest zeros and one meaningless
zero would have been indistinguishable.

**Generalises: a negative result needs a positive control in the same run.** Not in a previous
run, not "I checked the fixture earlier" — the same run, printed next to it.

### 2. 🔴 THE FIX THAT IS WORSE THAN THE BUG

`CheckInPanel` offered every member including those who had left. The obvious fix — filter them
out — would have been **worse than the defect it fixed**, because `canAdd` refuses quick-add for a
name that already exists. A returning member would have been findable by nothing and addable by
nothing: a real person standing in the room, unreachable.

The two halves are only visible together, and nothing in the file says so. Before you filter,
narrow, or hide anything a user can also CREATE, find the creation path and check what it does
with the thing you are hiding. Session 20 shipped `e2e/checkin.spec.js`'s third test purely to
make that pairing fail loudly for whoever tries it next.

### 3. 🔴 AN ASSERTION CAN PIN A CSS CHOICE INSTEAD OF A BEHAVIOUR

The new status badge is `text-transform: uppercase`. The first draft asserted `toContainText(/LEFT/)`
and **failed against correct code** — Playwright's `toContainText` reads `textContent`, which does
not apply `text-transform`, so it saw `"Left"`.

The repo already carries "innerText respects text-transform; textContent does not" as a *scanner*
note. It is equally an *assertion* note. The claim was "the status reaches the coach as a word";
the case is styling, so the matcher is `/left/i`.

### 4. A RECON SPEC IS WORTH WRITING AND THROWING AWAY

Three throwaway specs (`zz-recon*.spec.js`) that **printed** counts, deltas and every button name
per screen rather than asserting anything. Getting the whole picture in one run is what turned
"there is no haul" from a guess into a finding, and it cost about ten minutes. Delete them before
committing — session 20's suite is **28 spec files** and a stray `zz-` file would be counted
forever after.

---

## The product, in one paragraph

Jungle is a white-label class operating system for boutique fitness studios — React + Vite +
Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by whether
it improves the life of the **trainer** (plans faster, runs the room without fighting software), the
**owner** (sees who is slipping away, looks premium), or the **member** (walks into a room that
knows them). A feature that improves none of those three is theatre, and this repo deletes theatre.
Commercial context: Dylan launches at the Singapore gym he freelances at (The Garage), then sells to
other gyms. The USP: Jungle learns how each coach already programs — from the slides they've written
for years — and turns that into branded, ready-to-run classes on the studio's own screens, while
quietly building the attendance record that shows who's about to quit.

---

## 0. Trust ranking

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim here that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `docs/history/**` — including `HANDOFF-ARCHIVE.md` | **RECORDS, not pointers.** Paths and numbers were true when written. |
| 6 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it** — grep the
mechanism, then `git log -S"<symbol>"` to see when it landed. Session 17 found I10 ranked as the
largest outstanding item 39 commits after it shipped. **Session 20 is the same lesson from the
other side:** the top-ranked item was real, well-argued, and produced nothing, because the
evidence for it came from the one screen that was unlike the others.

---

## 1. What session 20 shipped — `3d062e0` → two commits

| Commit | What it did |
|---|---|
| `e81e793` | **The check-in list's status blindness, and a display string in an analytics column.** 6 new e2e, 4 new unit. |
| _(above)_ | **The docs restructure.** Root 19 `.md` → 6; `SESSION-HANDOFF.md` 165 KB → 9.5 KB. |

### 1a. The sweep, and why it is closed

Nine top-level screens and fifteen revealed panels, scanned with a populated store (5 members
across all three statuses, attendance, schedule rules, class instances, history, branding,
retention actions). **0 / 0 / 0** on all three `a11yScan.js` rules. Members, Schedule and Brand
Studio verifiably populated (15→29, 51→60, 30→31 buttons, content markers asserted) and already
named distinguishably — "Edit Regular Rita", "Remove Morning Burn on Mon at 06:00 from…".

**Do not re-run this as a headline item.** Re-run the scanners after a feature lands (§2.5), which
is cheap and is where the next naming defect will actually come from.

### 1b. The two defects, in the shape they landed

| Piece | Where | State |
|---|---|---|
| Status-aware sweep list | `src/screens/runner/CheckInPanel.jsx` | ✅ current members by default; **search sees everyone**; revealed rows carry `Paused`/`Left` as a WORD |
| Shared predicate | `src/lib/retention.js` → `isCurrentMember` **exported** | ✅ 4 unit tests on its edges |
| Shared label map | `src/lib/store.js` → `MEMBER_STATUS_LABEL` | ✅ second UI consumer; **`csvExport.js` keeps its own copy on purpose** |
| Empty-state honesty | `CheckInPanel` | ✅ "no members" ≠ "no CURRENT members"; it used to say "No one matches that name" when nothing was searched |
| The analytics column | `src/App.jsx` (one attribute) + a comment in `LiveScreen.jsx` | ✅ 2 e2e, incl. the built-in case |

### The design decisions worth not re-litigating

- **A member who left is still checkable in, deliberately.** People come back. What changed is
  that it is a labelled row a coach reached for by name, not an anonymous one they can mis-tap.
- **The badge is a WORD, not opacity.** `RosterScreen` can dim a "Left" row because it is being
  *read*; the check-in row is being *tapped*, mid-class, at arm's length — and dimming announces
  nothing to a screen reader.
- **`INACTIVE_STATUSES` stays an EXCLUDED set, not an `active` whitelist.** A status added later
  (a trial, say) defaults to being SHOWN. A member silently dropped out of the check-in list is
  invisible, and invisible wrongness is the worst kind. Same reasoning `retention.js` already
  gave for flagging.
- **`csvExport.js` must not import `store.js`.** It has zero imports by design; importing the
  label map would drag the whole localStorage + Supabase seam into a pure formatter. The
  duplication is the cheaper of the two costs and `store.js` says so in a comment.
- **`class_instances.class_type` holds the TYPE KEY.** Both doors — the Runner and the Schedule's
  publish path — now write the same vocabulary. Anything that writes a display string there
  breaks N2's cohort grouping permanently, and the column is not recoverable after the fact.

---

## 2. 🔬 The method — unchanged, still the highest-yield thing here

1. **Ask the generic question, not the enumerated one.** Session 20: "what does this screen do
   WRONG once it has data?" beat "which screen has unnamed buttons?" — the second was already
   answered, and asking it took most of the session to find out.
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI to check your own inference**, and **read back the STORED object.** Both
   session-20 defects were found by reading `jungle_class_instances` and `jungle_attendance`
   after a UI action, not by looking at the screen.
4. **Prove a tool before trusting it**, and **prove a test can fail** before believing it.
5. **A negative result needs a positive control in the same run.**
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. Still never executed. |
| **P2** | **Capacitor wrap** | 🟡 Unblocked in principle; **wait until A13 proves a real member opens a real link.** |
| **F6** | Per-gym privacy/consent page | ⛔ Unbuilt. N4 collects nothing, so no consent record is owed — but the moment anything member-identifying is added this becomes a blocker. `recordConsent` still has zero callers and **that is still correct**. |

**Outcome tier, none started:** **N2** cohort analytics (waiting on attendance volume, which waits
on the pilot — and note its grouping column is only now consistent, §1b), **N3-LLM** win-back
drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q** (needs a migration; PAR-Q
must land in the SAME change as individualised load), **D1** taxonomy LLM fallback (deferred by
design), **F4-QR** (never loosen RLS to `anon`; the token half now EXISTS).

**Deliberately unbuilt — do not "fix" these:** consent notice surface · Templates · Glossary ·
Discover · Integrations · attendee b64 share · **Music / Auto-DJ** (cut, quarantined in
`src/music/`, **do not undo the `FLAGS.music` gates** — each is load-bearing for ~12.7 KB) ·
member data on the summary page.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural
**Empty.** Fourth session running. App.jsx is 3,382 lines.

### 4.2 Bundle / performance
`I9` leftovers are all **weak**: `BrandStudioScreen` (needs a shared module for `PRESET_SKINS`),
`LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves), `AdminTeamScreen`.
**Measure before splitting**; `build-sw` precaches every emitted chunk, so a chunk nothing fetches
costs every install. Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (`storage-js` 22 KB
unused — **Dylan said leave it**) · `src/data/library.js` 58 KB.

📏 Production shape last measured session 19 at `777492d`: a **member** downloads **206.69 KB**,
staff 782.71 KB. Quote absolutes, never percentages. ⚠️ The credential-less local build and the
prod-shaped build disagree on `index` (204.50 vs 198.29 KB) — both real, different builds, never
compare across.

### 4.3 Sync / data plumbing
**I14** hydrate pagination (do at first paying gym) · **I8** server-side media proxy (the
RapidAPI key field is the last client-side third-party access) · `sync_incidents` telemetry
(post-pilot) · **`class_summaries` is NOT in the sync path, deliberately** — publishing is an act,
not a side effect.

### 4.4 Tooling and hygiene
| # | Item |
|---|---|
| **`deadctl` blind spots** | Cannot evaluate `FLAGS.*` gating, **lacks an inert-ancestor check**, and has **no `<details>` awareness**. Over-reporting is the right direction, but **every hit needs a reachability check**. |
| **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if stale. |
| **Docs** | ✅ **Done, session 20.** Root is 6 `.md`; `docs/` holds 13; `docs/history/` holds 16 (15 prompts + `HANDOFF-ARCHIVE.md`). Live cross-references repointed and grep-verified. ⚠️ References inside `docs/history/**` were left alone deliberately — records, not pointers. **Keep `SESSION-HANDOFF.md` to two session blocks**; that is the whole point of the split. |

### 4.5 Test coverage gaps — where the next defect is
| Area | Gap |
|---|---|
| 🔴 **Read back the STORED row after every UI write** | **The highest-yield item now.** Both session-20 defects were invisible on screen and obvious in `localStorage`. The Runner's `class_type` was wrong for **every gym since the feature shipped** and no test looked. Candidates never read back: what `MemberLinkDialog` publishes · what the Schedule's edit-class modal writes vs the add path · what a CSV import stores for a member with an unknown status · what Brand Studio writes to `jungle_custom_skin`. |
| **The Builder's modals under a gym-authored class type** | Empty movement pools — a state that did not exist before session 18. `LibraryBrowserModal`'s add-exercise and per-movement panels. |
| **Member CSV import ↔ the status model** | `csvImport`/`csvExport` round-trip a member's status through the words "Active/Paused/Left". Now that three surfaces read status, a round-trip that loses it costs more than it did. Untested end-to-end. |
| **N4's Edge Functions** | ⛔ Not reachable locally, by construction. `DYLAN-QUEUE.md` A12/A13. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). `DYLAN-QUEUE.md` A11. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands, expected
output, failure modes and undo steps. **Part B is EMPTY.** Read it and ask what has moved.
**Confirmed at the top of session 20: A12 and A13 are both still undone.**

- 🔴 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min.
  **Until this is done, N4 is code nobody has run.** Two sessions now.
- 🔴 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. **Still the one item that gets dramatically more expensive with
  time**, and it is a five-minute read-only check.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** (the wedge feature, never once run against a real corpus) · **A11 the seven live checks**.

---

## 6. What the crash gate still cannot see

`react/jsx-no-undef` catches `<Foo/>` where `Foo` is undefined. Two things it does **not** catch:

1. **A screen that is ABSENT rather than undefined.** `src/lib/navRoutes.test.js` guards this half.
   **Drive the real UI and assert the coach LANDED**, by a control only the destination has.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error
   boundary is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`.**

⚠️ **`ClassSummary` is deliberately NOT in `SCREENS`** — not a nav destination, renders outside
`App`, has its own spec. Adding it would break every sweep because `nav()` cannot reach it.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error.
Same for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 20:**

- 🔴 **Before hiding anything a user can also CREATE, check the creation path.** §0b#2.
- 🔴 **A negative result needs a positive control in the same run.** §0b#1.
- **`toContainText` reads `textContent` and ignores `text-transform`.** §0b#3.
- **A phone gets the bottom bar, whose labels are `Run` / `Build` / `Members` / `Brand` / `More`,
  inside `page.locator("nav").first()`.** `nav()` is desktop-only — documented, still catchable.
- **`class_instances.class_type` takes a type KEY, never a display string.** Two doors write it.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.** Mutate a
  VALUE, not a control-flow branch — `if (false && x) y;` inside a `for...of` breaks esbuild and
  looks like a real build failure.
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js`.
- **A hook cannot be called from inside `{cond && …}`.** Six components exist for this reason.
- **`page.clock.setFixedTime` freezes `Date.now()`.** Advance it between actions whose identity
  you need to distinguish.
- **Changing only the URL fragment is a same-document navigation.** In Playwright, open a member
  link via `about:blank` then `goto`; an explicit `page.reload()` RACES the app's own reload.
- **A test that reads a computed style must call `waitForApp(page)` first** — the app is a lazy
  chunk. Assertions on *elements* auto-wait and are unaffected.
- **Chromium logs its own "Failed to load resource" for every non-2xx** — filter exactly that
  rather than dropping `expectNoConsoleErrors`.
- **Reaching for `window` inside a lib function makes unit failures unreadable.** Inject the origin.
- **`getLibrary()` is read per render, deliberately.** Do not "optimise" it into a `useMemo([])`.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called while
  it is open.** Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright AUTO-DISMISSES**,
  so a test that ignores the dialog silently exercises the *cancel* path and still passes.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures:** `page.clock.setFixedTime` before `freshApp`, or build every instant
  relative to now.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** Use editor tools,
  `node` with explicit `'utf8'`, or `sed` in Git Bash. PowerShell's console also *displays* mojibake
  for UTF-8 — that is the terminal, not the file.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **PowerShell tore apart a `node -e` one-liner containing quotes.** Write a `.mjs` and run it.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Wake and act in the SAME test.
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.**
- **`innerText` respects `text-transform`; `textContent` does not.** Both halves now matter — §0b#3.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **A `Buffer` reference in a test file fails `lint:crash`.** Use string length or `TextEncoder`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`, wrapping snippets in an IIFE. **For a real screenshot, drive Playwright
  directly** (session 20 shot the check-in panel at 390px that way, in 9 seconds).
  PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e has
  5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `curl`/`Invoke-WebRequest`.
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4**. Omit the flag.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — rebuild them, they are cheap

All use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at
the repo's `package.json`. **Anchor slices on declaration NAMES, not line numbers.**

1. **`outline <file>`** — every top-level declaration with its line span.
2. **`scan <file> <Decl,…>`** — what imports the moved code needs, which same-file declarations it
   leans on, which of those the rest of the file still uses (⇒ shared module, not a move). **Run it
   transitively.**
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report unused
   UPPERCASE imports. **End it with a `scanned N/M` line and exit non-zero on zero.**
5. **`deadctl <file…>`** — dead controls, passive-only, fake affordances, unused props. §4.4 for blind spots.
6. **`handlers`** — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed by event type.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an accurate
reading of what a file depends on.
⚠️ **Beware a local declaration that shadows an import** — `FloorLiveScreen`'s own `fmt`.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 745 unit (27 files, no todos) · 239 e2e (28 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~338.73 KB · PersonasScreen ~91.04 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less). CI runs the same chain on Linux;
the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 21

1. **`git fetch` and read §0a.** Then read `DYLAN-QUEUE.md` and **ask Dylan whether A12 and A13 are
   done.** They were not at the start of session 20. If A12 is done, verifying N4 against the real
   functions is the first job — it is the only untested part of it, and untested by construction.
2. 🔴 **Read back the STORED row after every UI write** (§4.5). This is where session 20's defects
   actually were: both were invisible on screen and plain in `localStorage`, and one had been wrong
   for every gym since the feature shipped. Start with `MemberLinkDialog`'s published payload and
   the Schedule's edit-vs-add write paths.
3. **Then the member CSV round-trip against the status model** (§4.5) — three surfaces now read
   `members.status`, so a round-trip that loses it costs more than it used to.
4. **Do not re-run the eight-screen a11y sweep as a headline item.** It is done and clean (§1a).
   Re-run the scanners *after* a feature lands, which is cheap.
5. **Do not start N2/N3.** They wait on attendance volume, which waits on the pilot, which waits on
   `DYLAN-QUEUE.md` Part A.
6. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link.
7. **Keep `SESSION-HANDOFF.md` to two session blocks.** Move the third into
   `docs/history/HANDOFF-ARCHIVE.md` as you add yours. That is the whole point of the split, and it
   takes about a minute if you do it every time and an afternoon if you do not.
