# Jungle — Session 15 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = 4c0fdfc`, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 669 unit (no todos) · 116 e2e (no fixme) · build 542.72 KB + 89.84 KB chunk**.
App.jsx **4,763 lines** (4,462 non-blank — see the warning in §0b, this distinction has already
corrupted two prompts).

This file supersedes `SESSION-14-PROMPT.md` (now history).

**Both of Dylan's open decisions are ANSWERED and SHIPPED.** DEC-13 (library freeze) and DEC-12
(Builder back-chevron) are done. Do not re-raise them.

---

## 🔴 0a. You are probably not alone in this repo

A second session was committing to `main` as Dylan during session 13. It did **not** reappear in
session 14 — `origin/main` sat at `a10e1d0` untouched for the whole session — but the hazard is
structural, not historical.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- **Do not race it on a large refactor of the same file.** Both sessions reach for the biggest
  item, which is **I6 stage 5 on `src/App.jsx`**. Session 13 stood down from it for this reason;
  session 14 also left it alone. **It is still open and it is now the single largest item.**

If another session is active, say so out loud and pick work in *different files* (§4 has plenty).

---

## 🔴 0b. Three measurement traps that have each produced a wrong document

1. **`Measure-Object -Line` does not count blank lines.** The session-13 and -14 prompts both state
   App.jsx at "4,684 lines" on that basis. The file was really **4,993**. Use `wc -l` or
   `node -e "…split('\n').length"`. Treat every line count written before session 14 as a
   non-blank count.
2. **A truncated tool result is not a negative result.** A `Grep` with `head_limit: 40` once cut
   the row that disproved a conclusion. Raise the limit or narrow the pattern.
3. **Check what a measurement measured — for a PASS and for a FAIL.** Session 12: a fixme fell back
   to `document.body` so a black board over a cream body would have passed. Session 14: an e2e
   assertion used `/\d+ stages/` as the "Room TV" tell and **failed against correct code**, because
   the Dashboard's resume-building card renders that string too.

**New in session 14 — the strongest version of this rule yet: a tool you built is not evidence
until you have proven it.** A bundle-membership checker written this session reported `App.jsx` as
ABSENT from its own bundle, which is impossible. **Its numbers were discarded, not reported.**
Contrast the AST scripts (§8), which were proven against planted defects before being trusted.

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

## 0. 🔴 Read this before trusting any document

Trust ranking lives in the as-built spec's **§0**:

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim here that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c** — but see the ⚠️ below. |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, marker is local-only. |

⚠️ **§12's "Structural debt" paragraph is now measurably stale** and should be fixed by whoever
touches it next. It says App.jsx is "~5,650 lines" (it is 4,763), that I9 is "647 KB / 181 KB
gzip" (it is 542.72 KB / 152.35 KB), and that there is "no `React.lazy` anywhere" (PersonasScreen
has been lazy since session 12).

**Documents decay. The durable fix is a test, not a tidier document.**

---

## 1. What session 14 shipped — `a10e1d0` → `4c0fdfc`, six commits

| Area | What |
|---|---|
| **DEC-13** (`363af31`) | The gym's library was a full-catalogue **snapshot that froze at first edit**. Now a pool-level delta. |
| **DEC-12** (`a614bc5`) | The Builder's back chevron goes back instead of opening the TV. |
| **I9 corrected** (`5626c9c`) | The top-ranked candidate **was already free**, and `React.lazy` made it worse. |
| **Music guards** (`c55acc2`, `2046c33`) | Two keyboard shortcuts reached the cut music subsystem. **−22.35 KB.** |
| **Handoff** (`4c0fdfc`) | The above, plus the measurement traps. |

### The finding that generalises — read this one

Two Class Runner keyboard shortcuts reached the **cut** music subsystem:

- **`S`** opened a Spotify track search — genre/BPM picker, "Song, artist, album…" box — **over the
  class the coach was running**.
- **`M`** called `getUserMedia` — a real **microphone permission prompt** mid-class — then opened an
  AudioContext and a `requestAnimationFrame` loop analysing room audio on the gym's tablet, to duck
  a player that is permanently `null` when `FLAGS.music` is false.

Neither was reachable from a button, which is why **every sweep so far missed them**: no test in
this repo presses a key that is not attached to a control.

**The rule: a feature flag is only a build-time constant where EVERY path to the flagged code is
itself gated.** Rollup cannot eliminate a component that an unguarded state flag can still reach —
so the same missing guard that let a coach reach dead Spotify UI also pinned **21 KB** of it into
the main chunk. Fixing the bug *was* the bundle win.

### Rules session 14 established — do not undo them

- **Measure a code-split before shipping it. `React.lazy` can make a bundle WORSE.** A dynamic
  import defeats rollup's constant folding, so lazy-loading flag-gated dead code *creates* a chunk
  that the service worker then precaches for every install. AnalyticsScreen: static import is
  byte-identical to no move at all; lazy cost +78 B in main and +13 KB of precache.
- **A delta beats a snapshot for anything a gym can edit.** A snapshot silently freezes that gym
  out of every future improvement. See `src/lib/libraryStore.js`'s header for the full argument.
- **When a fix adds defence in depth, mutate BOTH guards.** Session 14's music tests do not fail
  when only one of the two guards is removed, because either alone prevents the defect. The test
  comment says so explicitly rather than implying per-guard coverage — check this on your own tests.
- **For a permission or an API side effect, assert the CALL, not the UI.** A permission prompt has
  no accessible name and the browser may not surface one under test policy, so a UI assertion would
  be a test that cannot fail. `e2e/runner.spec.js` stubs `getUserMedia` via `addInitScript` and
  asserts it was never invoked.
- Earlier rules that still hold: an accessible name must contain a WORD (never an emoji, never a
  glyph, never `title`); naming a repeated control is half the job — the name must DISTINGUISH; a
  sweep that only sees a screen's first render has not seen the screen; a retention flag is a claim
  about a CURRENT member; `INACTIVE_STATUSES` is stated as the EXCLUDED set; the Schedule/Runner
  match is never loosened; a started class keeps its SLOT's time; colour derivations must not assume
  a dark theme.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–14 was found by driving a real flow and reading back the stored
object.** Session 14's two defects came from **asking the generic question**: not "is the Spotify
button gone?" but *"can any non-button interaction still reach the cut subsystem?"* That question
swept every key handler in the app and found both.

1. **Ask the generic question, not the enumerated one.**
2. **Drive PAST the first render**, and past the buttons entirely — keyboard, focus, and effects.
3. **Drive the UI to check your own inference.** A grep said mic mode had three visible buttons as
   well as the shortcut. Driving the Runner rendered **zero** of them; the grep inference was wrong.
4. **Prove a tool before trusting it** (§0b), and **prove a test can fail** before believing it.
5. Re-run a probe before believing it — a full e2e run once failed broadly and passed 116/116 on
   re-run with no code change (a stale server on the e2e port).
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

_Ranked by what the USP demands. `PRODUCT-DIRECTION.md` §4–§5 is the authority; §6's non-goals are
settled — no booking, no payments, no CRM, no social feed, no consumer app._

### 3.1 🔴 The one real product gap

| # | Feature | State |
|---|---|---|
| **N4** | **Member magic-link summary** | ⛔ **BLOCKED on Dylan** (Edge Function). **The only member-facing surface in the entire product.** The USP says "your brand" and *no member has ever seen a Jungle screen*. `PRODUCT-DIRECTION.md` §5 calls it the #1 missing thing and the last Phase-1 gap; §12 has moved it from "Next" to **core**. Share-card half ✅ shipped (needs no backend); the link half needs an Edge Function to issue a **signed class token** — no member accounts. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake, a route rendering a component nobody wrote. Also gates **P2 Capacitor**, which is explicitly "once N4 exists". |

### 3.2 Outcome tier — real value, none of it started

| # | Feature | Notes |
|---|---|---|
| **N2** | **Cohort analytics** — 90-day cohort curve, benchmark overlay, revenue-at-risk | Waiting on attendance **volume**, not code. ⚠️ **`AnalyticsScreen` is a mock**: hardcoded KPIs, `FLAGS.mockAnalytics: false`, kept only as the **layout target** for this. It is now `src/screens/AnalyticsScreen.jsx`. |
| **N3-LLM** | **Win-back message drafting** | The rules layer (`src/lib/winback.js`) is ✅ shipped and swept clean. This adds a model that DRAFTS while the rules DECIDE. Do not invert that. |
| **F1 + PAR-Q** | **Session primitive / the 1:1 path** | ⛔ Needs a migration (`sessions`, `session_assignments`, XOR). **No 1:1/PT path exists at all**, so P5 is unreachable. **PAR-Q must land in the SAME change** that introduces individualised load — a personalised prescription without a health screen is the one place this product could hurt someone. |
| **D1** | **Taxonomy LLM fallback** | Deferred **by design** until a corpus of blanks exists to batch. Visible cost today is *thinner* warm-ups, not wrong ones: "Arm Swings"/"Cat Cow" return no category and the drafter correctly omits them rather than guessing. |
| **F4-QR** | **QR self-check-in** | Deferred, "do not promise" (AUDIT 2.4). Edge Function, service-role write path. **Never loosen RLS to `anon`.** |
| **P2** | **Capacitor wrap** | Explicitly gated behind N4. |

### 3.3 Deliberately unbuilt — do not "fix" these

- **Consent notice surface.** `recordConsent` has **zero callers, and that is correct**: no consent
  record may be written until a real notice exists. Not a bug.
- **Templates screen · Glossary · Discover · Integrations · attendee b64 share.** Retired or folded,
  by audit decision. ⚠️ Note the trap a fold sprang once: retiring the Templates nav orphaned class
  export/import, because that screen was the only route to either. **A fold is not a deletion.**
- **Music / Auto-DJ.** Cut (audit 2.1) — Spotify's consumer ToS prohibits commercial-premises
  playback and SG public performance needs COMPASS/RIPS licences the GYM must hold. Quarantined in
  `src/music/`, **not deleted**, so the decision stays reversible. Session 14 verified the
  quarantine is still reversible: with `FLAGS.music` on, both shortcuts work exactly as before.

---

## 4. 🟧 TECH DEBT

### 4.1 🔴 Structural — the big one

| # | Item | Notes |
|---|---|---|
| **I6** | **Decomposition stage 5 — the Runner cluster** | **The single largest remaining item.** Stage 4 done. Stage 5 = `LiveScreen`, `RoomTV`, `CheckInPanel`, `OverviewDisplayScreen`, `FloorLiveScreen`, `DisplayScreen` behind `useClassRunner()`. App.jsx is **4,763 lines**. **Mind §6 (the JSX blind spot) and §0a (check for a concurrent session first).** The three AST scripts in §8 exist to make this safe — session 14 validated them on a real extraction. |

### 4.2 Bundle / performance

| # | Item | Measured |
|---|---|---|
| **I9 leftover** | `useSpotify()` is still called **unconditionally** (search `= useSpotify()`; `App.jsx:4206` at time of writing), dragging `spotifyAuth.js` + part of `spotifyApi.js` into the main chunk. | **~2.5 KB.** ⚠️ The backlog's framing was **inverted** and is now corrected: it said music "needs a real seam" because a hook cannot be lazy-loaded. Measured by stubbing the barrel and rebuilding: **UI components 21,153 B · hook+api 2,607 B · shared ~5,300 B.** The 21 KB was components behind a missing guard (fixed). **What remains is the small part.** `api.spotify.com` still appears 6× in the main chunk, **2 of those from App.jsx's own inline Spotify code** — that inline code is the other half of this item. |
| **I9 candidates** | `BrandStudioScreen` (~564 lines, sole user of six `colors.js` exports; needs `GYM_ARCHETYPES`, `PRESET_SKINS`, `ProgramChip`, and `PRESET_SKINS` is also used by the root component so it wants a **shared module**, not a move). `LibraryBrowserModal` (~299 lines — **weakest**: its 58 KB of data STAYS, since `WORKOUT_LIBRARY` is referenced throughout App.jsx; only the JSX leaves). `AdminTeamScreen` (168 lines — near-worthless alone, trades ~4 KB for a request). | **Measure before splitting** (§1). |
| — | Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (auth-js 96, realtime+phoenix 55 — `room.js` Follow is real, so it stays; storage-js 22 apparently unused but pulled in by the supabase-js constructor — **Dylan's call**) · `src/data/library.js` 58 KB. | |

⚠️ **The build gate under-reports production by ~37%.** With no `VITE_SUPABASE_*` vars,
`supabaseEnabled` folds to `false` and rollup eliminates every sync path, so **a sync-only commit
produces a byte-identical local bundle** — which looks exactly like this repo's documented
stale-`dist/` bug and is not it. Last production measurement (of `cc4a1b7`): main 787.2 KB +
personas 88.3 KB. **That is now stale by −22 KB of local wins and should be re-measured.**

### 4.3 Sync / data plumbing

| # | Item |
|---|---|
| **I10** | **Delta writes** for `persona_plans` + `attendance`. AUDIT 3.2 wants this **before gym #2** — it is why one bad row once poisoned every plan. A row is marked synced only on **server confirmation**. Note DEC-13 has now done exactly this shape of work for `library_overrides`; `src/lib/libraryStore.js` is a worked example. |
| **I14** | **Hydrate pagination.** Unexercised locally. |
| **I8** | **Server-side media proxy** — RapidAPI key + Deezer BPM are client-side third-party accesses. LEGAL §3 suggests hiding the field for the pilot. |
| — | **`sync_incidents` telemetry** (TECH-PLAN §6). Post-pilot. |

### 4.4 Tooling and hygiene

| # | Item |
|---|---|
| **§6** | **`lint:crash` cannot see undefined JSX components.** Re-verified in session 14 with the AST script: a planted `<PhantomComponent/>` and `<Missing.Deep.Thing/>` in the real App.jsx were found by the script while `lint:crash` reported **zero**. Closing it in-tooling needs `eslint-plugin-react` — **Dylan's call** (new dev dep + gate change). |
| **DEC** | **3 dead symbols**: `nudgeForContrast`, `resolveSubBrand` (FR-H8), `fetchBpmData`. (`SLOT_LABELS` still unreferenced in `CalendarScreen`.) |
| **Docs** | **Spec §12's "Structural debt" paragraph is stale** — three wrong numbers, listed in §0. Fix it when you touch it. |
| **Docs** | This repo has **11 session prompts** at root. Consider whether they still earn their place. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| **a11y — the rest of the tree** | Rounds 1–2 covered **buttons** on all nine screens plus the Library's edit mode. **Still uncovered: `<a>` and `<input>` elements, focus order, focus trapping**, and the interaction-revealed panels — Builder modals, `ProfileModal`, `PlaylistImportModal`, the share-card, the Room TV mode switch. Each is a candidate for exactly the defect found in the Library. |
| **Non-button interaction** | Session 14 swept **keyboard handlers** and found two defects. The equivalent sweeps **not yet done**: drag-and-drop (stage/exercise reorder), paste handlers, focus/blur side effects, and anything in a `useEffect` that touches a device API. **The mic defect was an effect, not a control.** |
| **Exercise Library** | Session 13 drove *add a custom movement*; session 14 drove *add* again plus the v1→v2 migration. **Not driven: edit, delete, reorder, "New class type", Reset-to-defaults, and search.** ⚠️ Note **"New class type" has no `onClick` handler at all** — a button that does nothing, in the left rail of the Library modal (search the string; `App.jsx:1609` at time of writing). |
| **Coaches / Personas** | `PersonasScreen` is locally drivable and **has never been swept end to end**. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). |

---

## 5. ⛔ Blocked on Dylan

_DEC-12 and DEC-13 are **closed**. What remains:_

| # | Item | Blocker |
|---|---|---|
| **N4** 🔴 | Member magic-link summary | Edge Function to issue a signed class token (LEGAL §4). **The highest-value item in the whole backlog.** |
| **OPS** 🔴 | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| **DEC-12b** | The retention note in a PDPA export | The access export discloses `retention_actions` including the coach's free-text note. PDPA's Fifth Schedule permits withholding **opinion data kept solely for an evaluative purpose**, and nothing in code can tell "said she's travelling" from an evaluative remark. **A line in the lawyer review** (LEGAL §7), not a code change. |
| **DEC-12c** | `winBackBlockedReason` is nearly unreachable | Its non-null branch only fires for a status outside `MEMBER_STATUSES` arriving from a server row. Keep as a defence, or fold it away. Low stakes. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus, or re-extraction costs quota twice. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| **B3 / D2** | Real-corpus verification | **Needs decks only Dylan has.** Parsing is verified against FIXTURES, not against The Garage's real decks. Drive a real deck through Slides import with a blueprint saved and confirm `stats.blueprint > 0`. |
| **DEC** | `eslint-plugin-react` · Sentry · storage-js | Gate change · new **sub-processor** (crash payloads carry member names → DPA question, LEGAL §6) · dependency call. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### Live-verification queue (unexercisable locally)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push
   without a reload) and **I14** paging. **I10's delta writes are on this path.**
   **NEW: also verify DEC-13's delta blob round-trips through Supabase** — `library_overrides` now
   stores a `{v:2, classes:{…}}` delta instead of a full catalogue, and no live write has happened yet.
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified.
4. **Install the PWA** on phone + room TV.
5. **The Team admin screen, end to end** — invite by email and by `@domain`, role change,
   suspend/reactivate, revoke. Never driven.
6. **Re-measure production bundle** — the 787.2 KB figure predates session 14's −22 KB.

⚠️ **The live site sits behind real Google/email auth.** The PIN bypass only exists in the
credential-less local build, so driving the deployed app past login **needs Dylan**.

---

## 6. 🔴 `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. It bit twice in session 6 and once in session 7.

**Re-verified in session 14** by planting `<PhantomComponent/>` and `<Missing.Deep.Thing/>` in the
real `src/App.jsx`: the AST script found both, `lint:crash` reported **0**.

Three guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to `SCREENS`** — both a11y sweeps read the same list.
2. The JSX-resolution script (§8). **Run it after any move.**
3. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call.

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to a weaker check.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error — the
gate *does* catch that one. Same for a comment between `return (` and the root element; put it above
the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 14:**

- **`Measure-Object -Line` omits blank lines** (§0b).
- **`React.lazy` can defeat rollup's constant folding** and make the bundle worse. Measure.
- **`FLAGS` is a module-level const of literals, so rollup folds `FLAGS.x` at build time** — which
  means flag-gated code is often *already* eliminated and "split it out" buys nothing. But the
  folding only reaches code whose every path is gated (§1).
- **`build-sw` precaches everything in `dist`**, so an emitted chunk costs every install even if
  nothing ever fetches it.
- **A `Buffer` reference in a test file fails `lint:crash`** (`no-undef` — node globals are not in
  the crash config's env). Use string length or `TextEncoder`.
- **Anchor mutations on unique text.** Session 14's mutate helper refuses to run unless the anchor
  appears **exactly once**, which caught three would-be silent no-ops (`<button onClick={onBack}
  aria-label="Back"` appears in three screens).

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`** — that reverts to HEAD and destroys the session's
  uncommitted work in that file.
- **Date-dependent fixtures.** `honesty.spec.js` passed six days a week and failed on Sunday. **Use
  `page.clock.setFixedTime`**, installed before `freshApp`.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once. Use editor tools or `node -e` with explicit `'utf8'`. PowerShell's
  *console display* also shows mojibake for UTF-8 — that is the terminal, not the file.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** It is a **conditional render**, so once hidden
  the buttons do not exist — and **a wake-then-click across two tool calls always misses**. Use
  `page.mouse.move()` then click in the same test (`gotoDisplay`). ⚠️ `gotoDisplay` starts from the
  app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.** Prefer a fresh e2e
  run with `expectNoConsoleErrors`.
- **`innerText` respects `text-transform`; `textContent` does not.** "SUN" has `textContent === "Sun"`.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path is `/Jungle-App/`.
  ⚠️ Wrap `javascript_tool` snippets in an IIFE — top-level `const` persists between calls and the
  second call fails with "already declared".
- **A second chat usually holds :5173.** Start your own on a fixed alt port (`--port` +
  `--strictPort`); e2e has its own 5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write to a file and `git commit -F
  <file>`.** PS 5.1 wraps native stderr as `NativeCommandError` — `git push` and `vite build`
  "errors" that still report success are that, not failures. `gh` is **not installed**; use the
  GitHub REST API via `curl`/`Invoke-WebRequest` for CI status.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The three AST scripts — rebuild them, they are cheap and they make extraction safe

All three use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed
at the repo's `package.json` if the script lives outside the repo. **Anchor slices on declaration
NAMES, not line numbers** — the file shifts under your own edits.

1. **`scan <file> <Decl,…>`** — what imports the moved code needs, what same-file declarations it
   leans on, which of those the rest of the file still uses (⇒ needs a shared module, not a move),
   and which imports go dead after the move.
2. **`jsx <file…>`** — unresolved JSX component names (§6). Must ignore lowercase intrinsics,
   comments, strings, and member expressions whose root IS declared.
3. **`dead <file…>`** — imported bindings never used. ⚠️ **`no-unused-vars` does NOT report unused
   UPPERCASE imports** (`/^[A-Z_]/`), so eslint lists the lowercase dead imports and stays silent
   about every constant and every component.

**Prove them before trusting them** (§0b). Session 14's proof: a fixture containing a planted
`<PhantomComponent/>`, a `<Missing.Deep.Thing/>`, a component named in a line comment, one in a JSX
comment, one inside a string, lowercase intrinsics, and `<React.Fragment>` — the checker must find
exactly the first two.

⚠️ **A dead named import costs ZERO bytes** — rollup already tree-shakes it. Removing them buys an
accurate reading of what a file depends on, which is what extraction leans on. The "module stays in
the chunk" warning applies only to **side-effectful or namespace** imports.
⚠️ **Read the scan output before acting on it.** Session 13 deleted `import React` from a file whose
scan said only `useState`/`useEffect` were dead — the file calls `React.useState` directly.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 669 unit (no todos) · 116 e2e (no fixme) · main chunk ~542.72 KB + an
~89.84 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI question was
settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 15

1. **`git fetch` and read §0a.** If another session is live, pick work in different files and say so.
2. **If Dylan has unblocked N4 or OPS/backups, they jump the queue.** N4 is the only member-facing
   surface in the product and the last Phase-1 gap; backups are LEGAL §3 hole #1.
3. **I6 stage 5 — the Runner cluster.** The largest remaining item, twice deferred for fear of a
   concurrent session. The AST scripts (§8) are proven and App.jsx is 230 lines lighter than when
   stage 5 was first proposed. **Check §0a first, then commit to it.**
4. **Keep sweeping the non-button surface (§4.5).** Session 14's two defects were a keyboard
   shortcut and a `useEffect` — the sweeps that have never run are drag-and-drop, paste, focus/blur,
   and effects that touch device APIs. That is where the next one is.
5. **Then the a11y remainder** (`<a>`/`<input>`, focus order, focus trapping, the panels), then the
   rest of the Exercise Library (edit, delete, reorder, **"New class type" — which has no handler at
   all**, Reset, search), then Coaches/Personas.
6. **Then the I9 leftovers** — the ~2.5 KB `useSpotify` seam and App.jsx's own inline Spotify code.
   **Measure first** (§1); the last two candidates on the list both turned out to be worth less than
   the backlog claimed.
