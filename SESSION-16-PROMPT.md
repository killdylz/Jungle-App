# Jungle — Session 16 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = b59f612`, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 674 unit (no todos) · 126 e2e (no fixme) · build 544.29 KB + 89.84 KB chunk**.
App.jsx **4,852 lines** total / 4,550 non-blank (see §0b — this distinction has corrupted two
prompts; every number in this file is `wc -l`).

This file supersedes `SESSION-15-PROMPT.md` (now history).

**Do not re-raise DEC-12 or DEC-13.** Both were answered and shipped in session 14.

---

## 🔴 0a. You are probably not alone in this repo

A second session was committing to `main` as Dylan during session 13. It has **not** reappeared
since — `origin/main` sat untouched through sessions 14 and 15 — but the hazard is structural, not
historical.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live one.
- **Do not race it on a large refactor of the same file.** Both sessions reach for the biggest
  item, which is **I6 stage 5 on `src/App.jsx`**. Sessions 13, 14 and 15 all stood down from it.
  **It is still open, it is now the single largest item, and App.jsx GREW by 89 lines in session
  15.** See §10 — the recommendation this time is to commit to it.

If another session is active, say so out loud and pick work in *different files* (§4 has plenty).

---

## 🔴 0b. Measurement traps that have each produced a wrong document

1. **`Measure-Object -Line` does not count blank lines.** Use `wc -l` or
   `node -e "…split('\n').length"`. Treat every line count written before session 14 as non-blank.
2. **A truncated tool result is not a negative result.** A `Grep` with `head_limit: 40` once cut
   the row that disproved a conclusion. Raise the limit or narrow the pattern.
3. **Check what a measurement measured — for a PASS and for a FAIL.** Session 12: a fixme fell back
   to `document.body`, so a black board over a cream body would have passed. Session 14: an e2e
   assertion used `/\d+ stages/` as the "Room TV" tell and **failed against correct code**, because
   the Dashboard renders that string too. Session 15: an overlap check measured a div's border box
   when the padding was the thing keeping the text clear — it reported a collision that did not
   exist, and re-measuring the *content* edge showed a 5px gap.
4. **A tool you built is not evidence until you have proven it.** Session 14 discarded a
   bundle-membership checker that reported `App.jsx` as absent from its own bundle. Session 15's
   `deadctl` was proven against **6 planted defects and 15 planted non-defects** before a single
   one of its findings was acted on — and it was still wrong in one way (§8).
5. 🔴 **NEW — assert that your scanner found something.** A regex that silently matches nothing
   makes every assertion built on it vacuously true. `src/lib/navRoutes.test.js` has a dedicated
   first test that pins the sizes of its own result sets for exactly this reason. Copy that habit.

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
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** Its "Structural debt" paragraph was corrected in session 15 and is accurate as of `b59f612`. |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, marker is local-only. |

**Documents decay. The durable fix is a test, not a tidier document.**

---

## 1. What session 15 shipped — `4bc1980` → `b59f612`, five commits

One sweep. Five defects, **all of the same kind**, none of which threw, crashed, logged, or failed
a write.

| Commit | What it cost a coach |
|---|---|
| `e691196` | The **Dashboard's second hero button** navigated to `templates` — a view retired at the `isViewEnabled` choke-point with **no render branch left behind**. Sidebar and footer stayed, the content area went blank, no back button, no error. On a fresh store its label is **"New class"**: the second button on the first screen of the product. |
| `8881eac` | `LibraryBrowserModal` **never called `onAddExercise`**. Passed correctly from both Builder call sites, destructured correctly at the other end — only the middle was missing. 330 movements, browse-only. Also removed "+ New class type", a button with no `onClick` at all. |
| `a768d0e` | The library's **⠿ drag handle** was `cursor:grab` with no `draggable` and no handlers, while `libraryStore.js` had *already been built* to store a reorder. |
| `c694c69` | An **empty schedule slot** showed a hover "+" wired to `onMouseEnter`/`onMouseLeave` and nothing else — mouse-only and inert — and **`setUserClasses` was append-only, so a class could never be taken off the schedule.** A typo'd class was permanent, in every week, forever. |
| `b59f612` | Handoff + the spec's stale §12 paragraph (all three numbers were wrong). |

### 🔴 The finding that generalises — read this one

**Every guard in this repo asks whether something is WRONG. Not one of them can see that something
is ABSENT.**

- `lint:crash` resolves identifiers. A valid string literal pointing at a view nobody renders is
  not an unresolved identifier.
- The e2e error-boundary sweep asserts the boundary is absent on all nine screens. It passes on a
  blank route because **React renders nothing at all, which is not a crash** — the boundary's calm
  "Something broke" never appears.
- "The root has children" is satisfied by the shell: sidebar, footer, header.
- The a11y sweeps check that a name **exists** and **distinguishes**. They cannot check that the
  named control **does** anything.

So the assertion that catches this class is not "no error". It is **"the coach LANDED"**, proven by
a control only the destination has. Read the mutation check in `e2e/dashboard.spec.js`: with the
defect restored it fails on the landing assertion and **passes `expectNoConsoleErrors`**. That gap
is the whole reason this survived fourteen sessions.

### Rules session 15 established — do not undo them

- **A retired screen needs either a render branch or no controls pointing at it.** `flags.js` calls
  `isViewEnabled` "the SINGLE choke-point", and all four nav arrays do route through it. **A nav
  array is not the only way to navigate.** `src/lib/navRoutes.test.js` now pins the invariant for
  every view: anything a `setView`/`onNavigate` literal, an enabled nav entry, or the setup
  checklist can reach must have a `view==="…"` branch. `integrations` does this correctly
  (`MockDisabledScreen`); `templates` did not.
- **A filtered list's rendered index is NOT the stored index.** The library's exercise list is
  `rawEx` filtered by the search box. Wiring reorder against the rendered index would splice two
  movements the coach cannot see into the saved pool and write that to the gym's
  `library_overrides`. `canReorder` closes it; the guard is asserted, not just commented.
- **Let a prop's PRESENCE be the context.** The Add control renders when `onAddExercise` is passed.
  The standalone Library route has no class in hand, passes nothing, and shows no Add. One
  condition, not a second flag that can drift out of agreement with the first.
- **Return what the toast needs to be honest.** `handleAddLibraryExercise` returns the *stage name*,
  so the toast says "Added to Warm-Up" — the coach is behind a full-screen modal and cannot see
  which stage is selected — and `null` when there is no stage, so it cannot claim an add that did
  not happen. The mutation check is the point: stubbing the write leaves the toast still saying
  "Added to Warm-Up", and only the stored-object assertion catches it.
- Earlier rules that still hold: a feature flag is only a build-time constant where **every path**
  to the flagged code is itself gated; measure a code-split **before** shipping it (`React.lazy` can
  make a bundle worse); a delta beats a snapshot for anything a gym can edit; when a fix adds
  defence in depth, **mutate BOTH guards**; for a permission or API side effect, assert the CALL,
  not the UI; an accessible name must contain a WORD and must **distinguish**; a sweep that only
  sees a screen's first render has not seen the screen; `INACTIVE_STATUSES` is stated as the
  EXCLUDED set; the Schedule/Runner match is never loosened; a started class keeps its SLOT's time.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–15 was found by driving a real flow and reading back the stored
object.** Session 15's five came from **one generic question**: not "does Add work?" but
*"which rendered controls do nothing, and which threaded props are never called?"* That question
swept every `.jsx` in the repo at once.

1. **Ask the generic question, not the enumerated one.** It is the difference between finding one
   defect and finding the class.
2. **Drive PAST the first render**, and past the buttons entirely — keyboard, focus, hover, effects.
3. **Drive the UI to check your own inference.**
4. **Prove a tool before trusting it** (§0b), and **prove a test can fail** before believing it.
5. Re-run a probe before believing it — a full e2e run once failed broadly and passed on re-run with
   no code change (a stale server on the e2e port). In session 15 an interactive browser session
   silently lost its app state between two tool calls and reported the Dashboard when the Library
   modal had been open; the e2e run is what settled it.
6. An honest blank beats a confident wrong guess.

---

## 3. 🟦 FEATURES STILL TO BUILD

_Ranked by what the USP demands. `PRODUCT-DIRECTION.md` §4–§5 is the authority; §6's non-goals are
settled — no booking, no payments, no CRM, no social feed, no consumer app._

### 3.1 🔴 The one real product gap

| # | Feature | State |
|---|---|---|
| **N4** | **Member magic-link summary** | ⛔ **BLOCKED on Dylan** (Edge Function). **The only member-facing surface in the entire product.** The USP says "your brand" and *no member has ever seen a Jungle screen*. `PRODUCT-DIRECTION.md` §5 calls it the #1 missing thing and the last Phase-1 gap. Share-card half ✅ shipped (needs no backend); the link half needs an Edge Function to issue a **signed class token** — no member accounts. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake, a route rendering a component nobody wrote. Also gates **P2 Capacitor**. |

### 3.2 Outcome tier — real value, none of it started

| # | Feature | Notes |
|---|---|---|
| **N2** | **Cohort analytics** — 90-day cohort curve, benchmark overlay, revenue-at-risk | Waiting on attendance **volume**, not code. ⚠️ `src/screens/AnalyticsScreen.jsx` is a mock: hardcoded KPIs, `FLAGS.mockAnalytics: false`, kept only as the **layout target**. Its three handler-less buttons (§4.4) are expected. |
| **N3-LLM** | **Win-back message drafting** | The rules layer (`src/lib/winback.js`) is ✅ shipped and swept clean. This adds a model that DRAFTS while the rules DECIDE. Do not invert that. |
| **F1 + PAR-Q** | **Session primitive / the 1:1 path** | ⛔ Needs a migration (`sessions`, `session_assignments`, XOR). **No 1:1/PT path exists at all**, so P5 is unreachable. **PAR-Q must land in the SAME change** that introduces individualised load — a personalised prescription without a health screen is the one place this product could hurt someone. |
| **D1** | **Taxonomy LLM fallback** | Deferred **by design** until a corpus of blanks exists to batch. Visible cost today is *thinner* warm-ups, not wrong ones. |
| **F4-QR** | **QR self-check-in** | Deferred, "do not promise" (AUDIT 2.4). Edge Function, service-role write path. **Never loosen RLS to `anon`.** |
| **P2** | **Capacitor wrap** | Explicitly gated behind N4. |

### 3.3 🆕 Small gaps session 15 opened or exposed

| # | Item | Notes |
|---|---|---|
| **Gym-authored class type** | The Exercise Library's "+ New class type" was **removed, not built**. `libraryStore.js` *would* carry it (it stores a class key the built-in lacks whole), but the Builder's class-type dropdown, `applyTemplate`, `smartPickClass` and the root's initial `classChoice` all read **`WORKOUT_LIBRARY` directly**, so a gym-authored type would appear in that one modal and nowhere else. **Wiring it means moving those reads to the merged `getLibrary()`** — a real seam, ~10 call sites. Worth doing if a pilot gym runs a class outside the built-in ten. **Dylan's call.** |
| **Move an exercise between stages** | `handleMoveExercise` exists in the root and `onMoveExercise` is threaded into `BuilderScreen` — **and never called.** There is no UI for it. Either build the control or delete the prop; do not leave it. |
| **Edit a scheduled class** | Session 15 added *remove*. There is still no way to **rename or re-slot** an existing class — the only path is remove-and-re-add, which loses nothing today but will lose the rule's identity once occurrences hang off it. |

### 3.4 Deliberately unbuilt — do not "fix" these

- **Consent notice surface.** `recordConsent` has **zero callers, and that is correct**: no consent
  record may be written until a real notice exists. Not a bug.
- **Templates screen · Glossary · Discover · Integrations · attendee b64 share.** Retired or folded,
  by audit decision. ⚠️ The trap a fold sprang, twice now: retiring the Templates nav orphaned class
  export/import, and left the Dashboard hero button pointing at a blank route for ten sessions.
  **A fold is not a deletion.** `navRoutes.test.js` now guards the second half of that.
- **Music / Auto-DJ.** Cut (audit 2.1) — Spotify's consumer ToS prohibits commercial-premises
  playback and SG public performance needs COMPASS/RIPS licences the GYM must hold. Quarantined in
  `src/music/`, **not deleted**, so the decision stays reversible.

---

## 4. 🟧 TECH DEBT

### 4.1 🔴 Structural — the big one, deferred three times

| # | Item | Notes |
|---|---|---|
| **I6** | **Decomposition stage 5 — the Runner cluster** | **The single largest remaining item.** Stage 4 done. Stage 5 = `LiveScreen`, `RoomTV`, `CheckInPanel`, `OverviewDisplayScreen`, `FloorLiveScreen`, `DisplayScreen` behind `useClassRunner()`. App.jsx is **4,852 lines and grew in session 15**. Sessions 13, 14 and 15 each deferred it. **Mind §6 (the JSX blind spot) and §0a (check for a concurrent session first).** The AST scripts in §8 exist to make this safe and have now been validated on two real extractions. |

### 4.2 Bundle / performance

| # | Item | Measured |
|---|---|---|
| 🆕 **I9 — the Soundtrack panel** | **The best-measured candidate on this list, and it is a repeat of session 14's 21 KB.** The Builder's Soundtrack panel is gated on **`subTab==="music"`** (`App.jsx:2366`) — a **state flag, not `FLAGS.music`** — so rollup cannot fold it. It is unreachable (every path that sets `subTab` to `"music"` *is* `FLAGS.music`-gated, so this is dead weight and not a live defect), but it carries the crossfade slider, the energy-curve SVG, the whole track list, four `handleTrackDrag*` handlers and a fake toggle. **Gate line 2366 on `FLAGS.music` and measure.** |
| **I9 leftover** | `useSpotify()` is still called **unconditionally** (`App.jsx:4285`), dragging `spotifyAuth.js` + part of `spotifyApi.js` into the main chunk. | **~2.5 KB.** `api.spotify.com` still appears in the main chunk, some of it from **App.jsx's own inline Spotify code** — that inline code is the other half of this item. |
| **I9 candidates** | `BrandStudioScreen` (sole user of six `colors.js` exports; needs `GYM_ARCHETYPES`, `PRESET_SKINS`, `ProgramChip`, and `PRESET_SKINS` is also used by the root, so it wants a **shared module**, not a move). `LibraryBrowserModal` (**weakest**: its 58 KB of data STAYS, since `WORKOUT_LIBRARY` is referenced throughout App.jsx; only the JSX leaves). `AdminTeamScreen` (near-worthless alone). | **Measure before splitting** (§1). |
| — | Fixed costs: `react-dom` 177 KB · `@supabase/*` ~198 KB (auth-js 96, realtime+phoenix 55 — `room.js` Follow is real, so it stays; storage-js 22 apparently unused but pulled in by the supabase-js constructor — **Dylan's call**) · `src/data/library.js` 58 KB. | |

⚠️ **The build gate under-reports production by ~37%.** With no `VITE_SUPABASE_*` vars,
`supabaseEnabled` folds to `false` and rollup eliminates every sync path, so **a sync-only commit
produces a byte-identical local bundle** — which looks exactly like this repo's documented
stale-`dist/` bug and is not it. Last production measurement (of `cc4a1b7`): main 787.2 KB +
personas 88.3 KB. **That is stale by two sessions of wins and should be re-measured.**

### 4.3 Sync / data plumbing

| # | Item |
|---|---|
| **I10** | **Delta writes** for `persona_plans` + `attendance`. AUDIT 3.2 wants this **before gym #2** — it is why one bad row once poisoned every plan. A row is marked synced only on **server confirmation**. DEC-13 has done exactly this shape of work for `library_overrides`; `src/lib/libraryStore.js` is a worked example. |
| **I14** | **Hydrate pagination.** Unexercised locally. |
| **I8** | **Server-side media proxy** — RapidAPI key + Deezer BPM are client-side third-party accesses. LEGAL §3 suggests hiding the field for the pilot. |
| — | **`sync_incidents` telemetry** (TECH-PLAN §6). Post-pilot. |

### 4.4 Tooling and hygiene

| # | Item |
|---|---|
| **§6** | **`lint:crash` cannot see undefined JSX components.** Re-verified in session 14: a planted `<PhantomComponent/>` and `<Missing.Deep.Thing/>` in the real App.jsx were found by the AST script while `lint:crash` reported **zero**. Closing it in-tooling needs `eslint-plugin-react` — **Dylan's call**. |
| **DEC** | **4 dead symbols, all re-verified at `b59f612`**: `nudgeForContrast` and `resolveSubBrand` (`src/lib/colors.js`), `fetchBpmData` (`src/music/spotifyApi.js`, its own comment says DEAD), `SLOT_LABELS` (`CalendarScreen.jsx`, its own comment says delete it in a cleanup pass). Each is referenced only by its definition and by comments. |
| **DEC** | **5 unused props**, all reported by `deadctl`: `DashboardScreen({ onProfile, djProgress })`, `BuilderScreen({ onMoveExercise })` (§3.3), `LiveScreen({ spPaused })`, `DisplayScreen({ spPaused })`. Zero bytes; removing them buys an accurate reading of what a component depends on, which is what I6 leans on. |
| **A11y** | **The Brand Studio's LIVE PREVIEW pane** contains a focusable `<button>Start Class</button>` on sample content. Correct as a preview, wrong in the a11y tree. `aria-hidden` + `tabIndex={-1}` on the preview is a one-liner for the next a11y pass. |
| **Docs** | This repo now has **12 session prompts** at root plus `NEXT-SESSION-PROMPT.md`. Consider whether they still earn their place. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| **Exercise Library — the rest of it** | Session 15 pinned **add-to-class**, **reorder** and the **search/reorder interaction**. **Still unpinned by any test: edit, delete, and Reset-to-defaults** — all three of which WRITE to the gym's catalogue — **and the search box itself** (only asserted as a reorder guard, never that it filters correctly). Reset is destructive and has a confirm overlay; nothing drives it. |
| **a11y — the rest of the tree** | Rounds 1–2 covered **buttons** on all nine screens plus the Library's edit mode. **Still uncovered: `<a>` and `<input>` elements, focus order, focus trapping**, and the interaction-revealed panels — Builder modals, `ProfileModal`, `PlaylistImportModal`, the share-card, the Room TV mode switch. |
| **Non-button interaction** | Session 14 swept keyboard handlers (2 defects). Session 15 swept dead controls, fake affordances and unused props (5 defects). **Not yet swept: paste handlers, `onBlur`/`onFocus` side effects, and `useEffect`s that write to the store on mount.** Note there are currently **no** `onPaste`/`onBlur`/`onFocus` handlers in `src/` outside session 15's own additions — so this sweep is cheap and may come back empty, which is a fine result. |
| **Coaches / Personas** | `PersonasScreen` has 6 e2e tests about catalogue derivation and drafting, but **has never been swept end to end** for dead controls, fake affordances or a11y. It is 99.6 KB — the largest file after App.jsx — and locally drivable. **Run `deadctl` on it first; it reported clean, which makes it a good place to test whether `deadctl`'s blind spot (§8) is hiding something.** |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). |

---

## 5. ⛔ Blocked on Dylan

| # | Item | Blocker |
|---|---|---|
| **N4** 🔴 | Member magic-link summary | Edge Function to issue a signed class token (LEGAL §4). **The highest-value item in the whole backlog.** |
| **OPS** 🔴 | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| 🆕 **DEC-16** | **Should a gym be able to author its own class type?** | §3.3. The store already supports it; the Builder's reads are the seam. Yes ⇒ ~10 call sites move from `WORKOUT_LIBRARY` to `getLibrary()`. No ⇒ nothing to do, the dead button is already gone. |
| **DEC-12b** | The retention note in a PDPA export | PDPA's Fifth Schedule permits withholding **opinion data kept solely for an evaluative purpose**, and nothing in code can tell "said she's travelling" from an evaluative remark. **A line in the lawyer review** (LEGAL §7), not a code change. |
| **DEC-12c** | `winBackBlockedReason` is nearly unreachable | Its non-null branch only fires for a status outside `MEMBER_STATUSES` arriving from a server row. Keep as a defence, or fold it away. Low stakes. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus, or re-extraction costs quota twice. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| **B3 / D2** | Real-corpus verification | **Needs decks only Dylan has.** Parsing is verified against FIXTURES, not against The Garage's real decks. Drive a real deck through Slides import with a blueprint saved and confirm `stats.blueprint > 0`. |
| **DEC** | `eslint-plugin-react` · Sentry · storage-js | Gate change · new **sub-processor** (crash payloads carry member names → DPA question, LEGAL §6) · dependency call. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### Live-verification queue (unexercisable locally)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push
   without a reload) and **I14** paging. **I10's delta writes are on this path.**
   **Verify DEC-13's delta blob round-trips through Supabase** — `library_overrides` now stores a
   `{v:2, classes:{…}}` delta, and no live write has happened yet. 🆕 **Session 15's reorder writes
   through this same path**, so a reorder is now the cheapest way to exercise it.
2. **🆕 Verify a schedule REMOVE syncs.** `saveUserClasses` now receives a shorter list. Confirm the
   deleted rule does not come back on the next hydrate — a server-wins hydrate against a local
   delete is exactly the shape that has cost data here before.
3. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
4. **Cross-device Room TV Follow** — coded, never verified.
5. **Install the PWA** on phone + room TV.
6. **The Team admin screen, end to end** — invite by email and by `@domain`, role change,
   suspend/reactivate, revoke. Never driven.
7. **Re-measure production bundle** — the 787.2 KB figure predates sessions 14 and 15.

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

🔴 **And now its sibling, from session 15: a screen that is ABSENT rather than undefined.** The
boundary-absent sweep cannot see it, because nothing throws. `src/lib/navRoutes.test.js` is the
guard for that half. **Drive the real UI and assert the coach LANDED — by a control only the
destination has.** "Root has children" is satisfied by the shell.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error — the
gate *does* catch that one. Same for a comment between `return (` and the root element; put it above
the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 15:**

- 🔴 **`onMouseEnter` satisfies a naive `/^on[A-Z]/` handler test.** **Hover is not activation.** The
  schedule "+" read as wired to the checker and was found by reading. Split activation handlers
  (`onClick`, `onKeyDown`, `onPointerDown`, `onDrop`, `onSubmit`, `onChange`) from passive ones
  (`onMouseEnter`, `onMouseLeave`, `onMouseOver`) before trusting §8's `deadctl` on a fresh file.
- **An `opacity: 0` hover target is invisible to the keyboard.** If hover reveals it, focus must too.
- **`<summary>` is natively interactive** — `deadctl` reports it as a fake affordance. Three known
  false positives (`PersonasScreen`, `RosterScreen`, `ErrorBoundary`). Fix the checker or expect them.
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium** — no manual mouse-event dance.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`.** Playwright auto-dismisses by
  default, so a test that ignores the dialog silently exercises the *cancel* path and still passes.
  Assert both branches — session 15's schedule-remove test dismisses first, then accepts.
- **The interactive browser can lose app state between two tool calls.** A `read_page` showed the
  Library modal open and the very next `javascript_tool` reported the Dashboard. Prefer an e2e run
  for anything you intend to write down.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`** — that reverts to HEAD and destroys the session's
  uncommitted work in that file. **Anchor mutations on unique text**; a helper that refuses unless
  the anchor appears exactly once has now caught silent no-ops in two sessions.
- **Date-dependent fixtures.** `honesty.spec.js` passed six days a week and failed on Sunday. **Use
  `page.clock.setFixedTime`**, installed before `freshApp`. The Schedule grid is a real week —
  `e2e/scheduleEdit.spec.js` pins Mon 20 July 2026 for exactly this reason.
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
- **`build-sw` precaches everything in `dist`**, so an emitted chunk costs every install even if
  nothing ever fetches it.
- **A `Buffer` reference in a test file fails `lint:crash`** (node globals are not in the crash
  config's env). Use string length or `TextEncoder`.
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

## 8. The four AST scripts — rebuild them, they are cheap and they make extraction safe

All use `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at the
repo's `package.json` if the script lives outside the repo. **Anchor slices on declaration NAMES, not
line numbers** — the file shifts under your own edits.

1. **`scan <file> <Decl,…>`** — what imports the moved code needs, what same-file declarations it
   leans on, which of those the rest of the file still uses (⇒ needs a shared module, not a move),
   and which imports go dead after the move.
2. **`jsx <file…>`** — unresolved JSX component names (§6). Must ignore lowercase intrinsics,
   comments, strings, and member expressions whose root IS declared.
3. **`dead <file…>`** — imported bindings never used. ⚠️ `no-unused-vars` does **not** report unused
   UPPERCASE imports (`/^[A-Z_]/`), so eslint lists the lowercase dead imports and stays silent
   about every constant and every component.
4. 🆕 **`deadctl <file…>`** — session 15's, and the highest-yield of the four so far. Reports:
   **dead controls** (interactive tag or `role`, no handler — excluding `type=submit`, `disabled`,
   `<a href>`, named inputs, `{...spread}`); **fake affordances** (`cursor:pointer`/`grab` with no
   handler, no `draggable`/`href`, and **no wired ancestor**); and **props destructured by a
   component and never referenced** (via `scope.getBinding(name).references === 0`, components only —
   an uppercase name — so lowercase helpers do not report).

**Prove them before trusting them** (§0b). `deadctl`'s fixture had 6 planted defects and 15 planted
non-defects: a wired ancestor, a wired self, a `{...spread}`, a `draggable`, a child of a `<button>`,
`readOnly`/`disabled`/named inputs, `<label>`/`<option>`, and a lowercase helper with an unused param.

🔴 **`deadctl`'s known blind spot cost a real finding — fix it first:** it treats any `/^on[A-Z]/`
attribute as a handler, so an element wired only to `onMouseEnter`/`onMouseLeave` reads as honest.
That is how the schedule "+" survived the automated pass. It also reports `<summary>` (natively
interactive) as a fake affordance.

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

Expect **0 crash findings · 674 unit (no todos) · 126 e2e (no fixme) · main chunk ~544.29 KB + an
~89.84 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI question was
settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 16

1. **`git fetch` and read §0a.** If another session is live, pick work in different files and say so.
2. **If Dylan has unblocked N4 or OPS/backups, they jump the queue.** N4 is the only member-facing
   surface in the product and the last Phase-1 gap; backups are LEGAL §3 hole #1.
3. 🔴 **I6 stage 5 — the Runner cluster. Commit to it this time.** The recommendation has changed
   and here is the reasoning, so you can disagree with it on evidence rather than by default: the
   sweep line has outperformed the refactor for three sessions running, but **session 15 closed and
   tooled its richest seam** — dead controls, fake affordances and unused props are now swept
   repo-wide and guarded by a test — so the *next* sweep's expected yield is genuinely lower. Against
   that, App.jsx **grew** in session 15, stage 5 has been deferred three times, and the AST tooling
   that makes it safe is now proven on two real extractions. Do the refactor while the tooling is
   warm.
4. **Then the cheap I9 win: gate the Soundtrack panel** (`App.jsx:2366`) on `FLAGS.music` and
   **measure**. It is the same shape as session 14's 21 KB and is the best-characterised candidate
   on the list. Then the `useSpotify()` seam and App.jsx's own inline Spotify code.
5. **Then finish the Exercise Library** (§4.5): **edit, delete, and Reset-to-defaults are unpinned by
   any test and all three write to the gym's catalogue.** Reset is destructive and has a confirm
   overlay nothing drives. Also pin that search actually *filters*, which no test asserts.
6. **Then sweep `PersonasScreen` end to end** — 99.6 KB, locally drivable, never swept. Fix
   `deadctl`'s hover blind spot (§8) *before* you run it, or you will repeat the schedule-"+" miss on
   the largest unswept file in the repo.
7. **Then the a11y remainder** — `<a>`/`<input>`, focus order, focus trapping, the
   interaction-revealed panels — and the Brand Studio preview's focusable sample button (§4.4).
