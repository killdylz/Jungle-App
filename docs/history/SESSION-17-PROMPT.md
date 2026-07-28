# Jungle — Session 17 Build Prompt

Keep building. The named structural backlog is now **empty** — I6 is finished, I9's measurable
wins are banked, and every sweep session 15 and 16 opened has been run to completion. So this
session is mostly **find more in the specs, regression-test aggressively, ship the good-to-haves**.

`main = 1d4abd3`, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 683 unit (no todos) · 144 e2e (no fixme) · build 533.39 KB + 89.89 KB chunk**.
App.jsx **3,183 lines** (`wc -l`) — down from 4,851.

This file supersedes `SESSION-16-PROMPT.md`. **Large parts of that file are now stale**: its
§4.1 (I6), §4.2 (I9), §4.4 (dead symbols, unused props, the Brand Studio a11y one-liner) and
§4.5 (Library, PersonasScreen) are done. Its §0b, §2, §6, §7 and §8 are still the good parts.

**Do not re-raise DEC-12, DEC-13, I6, or the "useSpotify ~2.5 KB" item.** All answered.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged from session 16, and still structural rather than historical. `origin/main` was
untouched through sessions 14, 15 and 16.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- The old advice was "don't race it on App.jsx". App.jsx is now 3,183 lines and no longer the
  obvious collision point — but `src/screens/runner/` and `e2e/screens.spec.js` both grew a lot
  this session, so those are the new shared surfaces.

---

## 🔴 0b. Measurement traps — one NEW one, and it cost three corrections

Carried forward from session 16 §0b, all still true (`Measure-Object -Line` misses blank lines;
a truncated result is not a negative result; check what a measurement measured for a PASS *and*
a FAIL; a tool is not evidence until proven; assert your scanner found something).

🔴 **NEW — the checker is wrong before the code is, and session 16 hit this three times:**

1. **A fingerprint that occurs in two files proves nothing.** A bundle-membership check used
   `"Music Hub"` (also a nav label in App.jsx) and `"api.spotify.com/v1/me/player/play"` (also
   LiveScreen's own inline `fetch`). Both would have reported a module as PRESENT when it was
   absent. The fixed checker validates every candidate against the whole `src/` tree and prints
   **"cannot decide"** rather than guessing — it rejected 4 of the first 7 fingerprints.
2. **An assertion can fail against correct code because the PLATFORM does not work how you
   assumed.** `inert` does **not** rewrite `tabIndex` (it still reads 0), and Playwright's role
   engine does **not** model `inert`, so `getByRole` still matches. What the browser actually
   does is **refuse the focus**. Probe the live page before writing the assertion.
3. **A mutation helper must refuse an ambiguous anchor.** It did, twice — once when `ELAPSED`
   appeared twice, once when a mutation itself made `onClick={handleReset}` non-unique and the
   naive revert would have rewritten the wrong button.

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

Unchanged, and lives in the as-built spec's **§0**:

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim here that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** Its I6 and I9 rows were corrected in session 16. |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, marker is local-only. |

**Documents decay. The durable fix is a test, not a tidier document.**

---

## 1. What session 16 shipped — `a863768` → `1d4abd3`, six commits

| Commit | What it did |
|---|---|
| `4494b72` | **I6 stage 5.** The Runner cluster → `src/screens/runner/` behind `useClassRunner()`. App.jsx **4,851 → 3,183 (−34%)**. |
| `a93bfcf` | **I9.** The music quarantine was **nominal in six places**. **545.06 → 532.37 KB**. |
| `fa9f018` | Brand Studio's preview had a **real focusable "Start Class" button** on sample content. `inert`. Four unused props removed. |
| `79c29ab` | The Library's **edit / delete / Reset** write paths pinned, plus that search actually filters. |
| `00e07e9` | **a11y round 3:** 16 nameless form fields, incl. **8 identical unnamed colour swatches**. |
| `1d4abd3` | **Move an exercise between stages** — built the control `onMoveExercise` never had. |

### The finding that generalises

**Session 15's lesson was "a control that does nothing". Session 16's is one level up: a GUARD
that does nothing.** Three checkers and one assertion were each wrong in a way that would have
produced a confident false result, and in every case the tell was cheap to get (a fixture, a
tree-wide uniqueness check, a browser probe) and expensive to skip.

`deadctl` now reports **zero unused props** and **zero live dead controls** repo-wide.

---

## 2. 🔬 The method — unchanged, still the highest-yield thing here

1. **Ask the generic question, not the enumerated one.**
2. **Drive PAST the first render** — keyboard, focus, hover, effects.
3. **Drive the UI to check your own inference.**
4. **Prove a tool before trusting it**, and **prove a test can fail** before believing it.
5. **Re-run a probe before believing it.**
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

### 3.1 🔴 The one real product gap

| # | Feature | State |
|---|---|---|
| **N4** | **Member magic-link summary** | ⛔ **BLOCKED on Dylan** (Edge Function). **Still the only member-facing surface in the entire product**, and the last Phase-1 gap. Share-card half ✅ shipped; the link half needs an Edge Function to issue a **signed class token** — no member accounts. ⛔ **Do not build the page first.** Also gates **P2 Capacitor**. |

### 3.2 Outcome tier — real value, none of it started

Unchanged from session 16 §3.2: **N2** cohort analytics (waiting on attendance volume, not
code), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy
LLM fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`), **P2** (gated behind N4).

### 3.3 Small gaps still open

| # | Item | Notes |
|---|---|---|
| **Gym-authored class type** | **DEC-16, still Dylan's call.** `libraryStore.js` would carry it, but the Builder's dropdown, `applyTemplate`, `smartPickClass` and the root's initial `classChoice` all read `WORKOUT_LIBRARY` directly — so a gym-authored type would appear in one modal and nowhere else. Wiring it means moving ~10 call sites to the merged `getLibrary()`. |
| **Edit a scheduled class** | Session 15 added *remove*, session 16 did not touch this. There is still no way to **rename or re-slot** an existing class; the only path is remove-and-re-add, which loses nothing today but will lose the rule's identity once occurrences hang off it. |
| ~~Move an exercise between stages~~ | ✅ **DONE** (`1d4abd3`). |

### 3.4 Deliberately unbuilt — do not "fix" these

- **Consent notice surface.** `recordConsent` has zero callers, **and that is correct**.
- **Templates · Glossary · Discover · Integrations · attendee b64 share.** Retired or folded.
  `navRoutes.test.js` guards the "a fold is not a deletion" half.
- **Music / Auto-DJ.** Cut (audit 2.1), quarantined in `src/music/`, **not deleted**, so the
  decision stays reversible. Session 16 made the quarantine real at the bundle level — **do not
  undo those `FLAGS.music` gates to "simplify"**; each one is load-bearing for ~12.7 KB.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural

**Empty.** I6 is done, all five stages. This is the first session since the audit with no
large structural item outstanding.

### 4.2 Bundle / performance

| # | Item | Measured |
|---|---|---|
| **I9 leftover** | Remaining candidates are all **weak**: `BrandStudioScreen` (needs a shared module for `PRESET_SKINS`, not a move), `LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves), `AdminTeamScreen` (near-worthless alone). | **Measure before splitting**, and remember `build-sw` precaches every emitted chunk, so a chunk nothing fetches costs every install. |
| — | Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (`storage-js` 22 KB apparently unused but pulled in by the supabase-js constructor — **Dylan's call**) · `src/data/library.js` 58 KB. | |

⚠️ **The build gate still under-reports production by ~37%** (no `VITE_SUPABASE_*` ⇒ rollup drops
every sync path, so a **sync-only commit produces a byte-identical local bundle** — that is not
the stale-`dist/` bug). Last production measurement was of `cc4a1b7`: main 787.2 KB + personas
88.3 KB. **That is now stale by THREE sessions of wins and should be re-measured.**

### 4.3 Sync / data plumbing — now the biggest remaining cluster

| # | Item |
|---|---|
| **I10** 🔴 | **Delta writes** for `persona_plans` + `attendance`. AUDIT 3.2 wants this **before gym #2** — it is why one bad row once poisoned every plan. A row is marked synced only on **server confirmation**. `src/lib/libraryStore.js` is the worked example, and session 16's `e2e/libraryEdit.spec.js` now pins what a correct delta looks like from the outside. |
| **I14** | **Hydrate pagination.** Unexercised locally. |
| **I8** | **Server-side media proxy** — RapidAPI key + Deezer BPM are client-side third-party accesses. LEGAL §3 suggests hiding the field for the pilot. |
| — | **`sync_incidents` telemetry** (TECH-PLAN §6). Post-pilot. |

### 4.4 Tooling and hygiene

| # | Item |
|---|---|
| **§6** | **`lint:crash` cannot see undefined JSX components.** Still true, still needs `eslint-plugin-react` — **Dylan's call**. Session 16 is the strongest evidence yet: the AST script found **17** unresolved components in one refactor that the gate reported as zero. |
| **DEC** | **4 dead symbols** — `nudgeForContrast`, `resolveSubBrand` (`src/lib/colors.js`), `fetchBpmData` (`src/music/spotifyApi.js`), `SLOT_LABELS` (`CalendarScreen.jsx`). Each referenced only by its definition and by comments. Re-verify before acting. |
| ~~5 unused props~~ | ✅ **DONE** — `deadctl` reports **zero** repo-wide. |
| ~~Brand Studio preview a11y~~ | ✅ **DONE** (`fa9f018`). |
| **Docs** | **13 session prompts at root** plus `NEXT-SESSION-PROMPT.md` and a 137 KB `SESSION-HANDOFF.md`. This is now genuinely in the way — the handoff alone is bigger than any source file except App.jsx. **Dylan's call**, but a `docs/history/` folder would cost nothing. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| **Focus order and focus TRAPPING** | 🔴 **The biggest untouched a11y gap.** Rounds 1–3 covered buttons and form fields on all nine screens. **Nothing asserts that a modal traps focus**, so a keyboard user may tab straight out of a dialog into the page behind it. Jungle has several: `ProfileModal`, the Builder's add-tracks and smart-build modals, `LibraryBrowserModal`, the Reset overlay. Probe before assuming it is broken. |
| **Interaction-revealed panels** | The a11y sweeps see a screen's FIRST render. Still unswept: `ProfileModal`, `PlaylistImportModal`, the share-card, the Room TV mode switch. (The Library's edit mode and Brand Studio's preview are now covered.) |
| **Non-button interaction** | Session 14 swept keyboard handlers, 15 swept dead controls, 16 swept form-field names. **Still not swept: paste handlers, `onBlur`/`onFocus` side effects, and `useEffect`s that write to the store on mount.** That last one is the interesting third: an effect that writes on mount is invisible to every sweep so far. |
| **Coaches / Personas** | `deadctl` reports it **clean** (re-run in session 16 with the hover blind spot fixed). It has 6 e2e tests about catalogue derivation, and its interaction-revealed panels are still unswept. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). |

---

## 5. ⛔ Blocked on Dylan

| # | Item | Blocker |
|---|---|---|
| **N4** 🔴 | Member magic-link summary | Edge Function to issue a signed class token (LEGAL §4). **The highest-value item in the whole backlog.** |
| **OPS** 🔴 | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| **DEC-16** | Should a gym author its own class type? | §3.3. Yes ⇒ ~10 call sites move to `getLibrary()`. |
| **DEC-12b** | The retention note in a PDPA export | **A line in the lawyer review** (LEGAL §7), not a code change. |
| **DEC-12c** | `winBackBlockedReason` is nearly unreachable | Keep as defence, or fold away. Low stakes. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| **B3 / D2** | Real-corpus verification | **Needs decks only Dylan has.** Drive a real deck through Slides import with a blueprint saved and confirm `stats.blueprint > 0`. |
| **DEC** | `eslint-plugin-react` · Sentry · storage-js · docs cleanup | Gate change · new **sub-processor** (crash payloads carry member names → DPA, LEGAL §6) · dependency call · §4.4. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### Live-verification queue (unexercisable locally)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm
   re-push without a reload) and **I14** paging. **I10's delta writes are on this path.**
   **Verify DEC-13's delta blob round-trips through Supabase.** A library **reorder** or an
   **edit** is the cheapest way to exercise it, and `e2e/libraryEdit.spec.js` now documents
   exactly what the local half of that write looks like.
2. **Verify a schedule REMOVE syncs.** Confirm the deleted rule does not come back on the next
   hydrate — a server-wins hydrate against a local delete has cost data here before.
3. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
4. **Cross-device Room TV Follow** — coded, never verified. Note the runner cluster moved in
   session 16; `sendRoomState`/`onRoomState` are now called from `useClassRunner.js`, not App.
5. **Install the PWA** on phone + room TV.
6. **The Team admin screen, end to end.** Never driven.
7. **Re-measure production bundle** — 787.2 KB predates sessions 14, 15 and 16.

⚠️ **The live site sits behind real Google/email auth.** The PIN bypass only exists in the
credential-less local build, so driving the deployed app past login **needs Dylan**.

---

## 6. 🔴 `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. It bit twice in session 6, once in session 7, and session 16 produced **17 at
once** during the runner extraction — every one invisible to the gate.

Three guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to `SCREENS`** — all THREE a11y sweeps now read that list.
2. The JSX-resolution script (§8). **Run it after any move.** And run `lint:crash` too — they
   are complementary, and session 16 needed both (17 unresolved components vs 16 plain-identifier
   misses, with no overlap).
3. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call.

🔴 **Its sibling: a screen that is ABSENT rather than undefined.** `src/lib/navRoutes.test.js`
guards that half. **Drive the real UI and assert the coach LANDED** — by a control only the
destination has. "Root has children" is satisfied by the shell.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error.
Same for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 16:**

- 🔴 **A JSX attribute added via a shell one-liner loses its quotes.** PowerShell stripped the
  quotes from `aria-label="colour"` twice, producing invalid JSX that failed the dev server
  rather than the test. **Use the editor for any mutation involving quotes.**
- **`inert` is the right tool for a decorative pane, and it is NOT `aria-hidden` + `tabIndex`.**
  `tabIndex={-1}` takes the container out of the tab order and leaves every descendant in;
  `aria-hidden` over a focusable element is itself a violation. React 19 passes `inert` through.
  Assert it by **focus refusal**, not by `getByRole` or `tabIndex` (§0b).
- **Rollup shakes at EXPORT granularity, not module granularity.** "Is this module in the
  bundle?" is often the wrong question — half of `spotifyAuth.js` is in and half is out.
- **A destination `<select>` puts every stage name into the DOM many times over**, which broke
  a `getByText` in `smoke.spec.js` that had been unique for eleven sessions. Prefer a
  role+name selector over a bare text match for anything structural.
- **`nav()` is DESKTOP-ONLY** (its own docstring says so). A phone gets the bottom bar; use
  `page.locator("nav").first().getByRole("button", { name: "Build" })`.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` =
  gate change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write
  a new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text**; a helper
  that refuses unless the anchor appears exactly once has now caught silent no-ops in three
  sessions, including one where the mutation itself made the anchor ambiguous.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`.** Playwright auto-dismisses,
  so a test that ignores the dialog silently exercises the *cancel* path and still passes.
  **Assert both branches.**
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures.** Use `page.clock.setFixedTime` installed before `freshApp`, or
  build every instant relative to now (see `src/lib/format.test.js`).
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** Use editor
  tools or `node -e` with explicit `'utf8'`. PowerShell's console display also shows mojibake
  for UTF-8 — that is the terminal, not the file.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** It is a **conditional render**, so a
  wake-then-click across two tool calls always misses. Use `page.mouse.move()` then click in the
  same test. ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.** Prefer a fresh
  e2e run with `expectNoConsoleErrors`.
- **`innerText` respects `text-transform`; `textContent` does not.** Note a `<select>`'s
  `innerText` includes its `<option>` text.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`build-sw` precaches everything in `dist`**, so an emitted chunk costs every install even if
  nothing ever fetches it.
- **A `Buffer` reference in a test file fails `lint:crash`.** Use string length or `TextEncoder`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
  ⚠️ Wrap `javascript_tool` snippets in an IIFE — top-level `const` persists between calls.
- **A second chat usually holds :5173.** Start your own on a fixed alt port (`--port` +
  `--strictPort`); e2e has its own 5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write to a file and `git commit -F
  <file>`.** PS 5.1 wraps native stderr as `NativeCommandError` — `git push` and `vite build`
  "errors" that still report success are that, not failures. `gh` is **not installed**; use the
  GitHub REST API via `curl`/`Invoke-WebRequest` for CI status.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are
  an advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The five AST scripts — rebuild them, they are cheap

All use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at
the repo's `package.json`. **Anchor slices on declaration NAMES, not line numbers.**

1. **`outline <file>`** 🆕 — every top-level declaration with its line span. The map you read
   before planning any extraction.
2. **`scan <file> <Decl,…>`** — what imports the moved code needs, which same-file declarations
   it leans on, which of those the rest of the file still uses (⇒ shared module, not a move),
   and which imports go dead after the move. **Run it transitively** — adding the helpers it
   reports as movable can pull in their own dependencies.
3. **`jsx <file…>`** — unresolved JSX component names (§6). Must ignore lowercase intrinsics,
   comments, strings, and member expressions whose root IS declared.
4. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report
   unused UPPERCASE imports, so eslint is silent about every constant and component.
5. **`deadctl <file…>`** — **dead controls** (interactive tag or `role`, no ACTIVATION handler),
   **passive-only** (wired to `onMouseEnter`/`onMouseLeave` only — hover is not activation),
   **fake affordances** (`cursor:pointer`/`grab`, nothing wired, no wired ancestor), and **props
   destructured and never referenced**.

**Session 16 fixed `deadctl`'s two known blind spots** and re-proved it against **6 planted
defects and 18 planted non-defects** — all 6 found, all 18 silent. Activation handlers are now
split from passive ones, and `<summary>`/`<details>`/`<label>`/`<option>` no longer false-positive.
**Keep the fixture.** A checker you have not re-proven after editing is not evidence.

A sixth is worth rebuilding if you touch the bundle: an **in-bundle fingerprint checker** that
validates its fingerprints against the whole `src/` tree and refuses to answer where a string is
not unique (§0b).

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an
accurate reading of what a file depends on. The "module stays in the chunk" warning applies only
to **side-effectful or namespace** imports.
⚠️ **Read the scan output before acting on it**, and beware a **local declaration that shadows an
import** — `FloorLiveScreen`'s own `fmt` is the worked example.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 683 unit (no todos) · 144 e2e (no fixme) · main chunk ~533.39 KB +
an ~89.89 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI
question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 17

1. **`git fetch` and read §0a.**
2. **If Dylan has unblocked N4 or OPS/backups, they jump the queue.** N4 is the only
   member-facing surface in the product and the last Phase-1 gap; backups are LEGAL §3 hole #1.
3. 🔴 **I10 — delta writes for `persona_plans` and `attendance`.** This is now the largest
   remaining engineering item and AUDIT 3.2 wants it **before gym #2**. `libraryStore.js` is the
   worked example and `e2e/libraryEdit.spec.js` shows what to assert. Unlike I6 this one
   protects **data**, which is the only thing in this product that cannot be rebuilt.
4. **Then focus trapping** (§4.5) — the biggest untouched a11y gap, and the one that most
   directly locks a keyboard user out of a dialog. **Probe first**: session 16's `inert` episode
   is the standing warning that the platform may not behave how the assertion assumes.
5. **Then the `useEffect`-writes-on-mount sweep** (§4.5). An effect that writes to the store on
   mount is invisible to every sweep run so far, and this repo's worst defects have all been
   writes nobody could see.
6. **Then the interaction-revealed panels** — `ProfileModal`, the share-card, the Room TV mode
   switch.
7. **Then re-measure the production bundle** (§4.2) — the 787.2 KB figure is three sessions stale,
   and three sessions of wins have gone into it unverified.
