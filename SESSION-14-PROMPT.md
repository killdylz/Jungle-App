# Jungle — Session 14 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = c5a9ed8`, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 656 unit (no todos) · 114 e2e (no fixme) · build 565.07 KB + 89.21 KB chunk**.
App.jsx **4,684 lines**. (The session-13 prompt said 4,965; that figure was already wrong when it
was written — measured, not estimated, from here on.)

This file supersedes `SESSION-13-PROMPT.md` (now history).

---

## 🔴 0a. READ THIS FIRST — you are probably not alone in this repo

**A second session was committing to `main` during session 13, authoring as Dylan.** `078a55a`
appeared mid-session, *after* this session's own `git log` had shown a different HEAD. It had been
given the same prompt, so it went for the same §9 item and did the production measurement
independently — same numbers, duplicated effort.

Consequences, all of which bit or nearly bit:

- **`git log` / `git status` taken at session start go stale.** `git fetch` before you commit, and
  check your commit's parent is what you expected.
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the live
  one. (In session 13 the snapshot listed ten modified files against a genuinely clean tree.)
- **Do not race it on a large refactor of the same file.** Both sessions reach for the biggest item
  in §9 — which is I6 stage 5 on `src/App.jsx`. Two agents rewriting the same 4,684-line file is a
  conflict nobody wins. **Session 13 deliberately stood down from stage 5 for this reason.**

If you find another session is active, say so out loud and pick work in *different files* — new e2e
specs, sweeps, leaf modules. There is plenty (§3A).

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

The trust ranking lives in the as-built spec's **§0**. Short version:

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim in this repo that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | Maintained as work ships. **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These are the sections that drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, so its marker is local-only. |

⚠️ **Rank 1's caveat, earned in session 12: check what a failing measurement MEASURED.** A fixme for
the Room TV backgrounds fell back to `document.body` for two of three boards, so a board painting
itself pure black over a cream body would have passed.

⚠️ **Session 13 added the inverse: check what a measurement measured before believing a PASS, and
before believing your own truncated output.** A `Grep` with `head_limit: 40` returned paginated
results, the row that mattered was below the cut, and the conclusion drawn from it ("`TEAM_ROLES` is
guarded by nothing") was flatly wrong — the guard is `dbConstraints.test.js:66`. **A truncated tool
result is not a negative result.**

⚠️ **Three documents were found stating things that were not true.** All three are now fixed, but
the lesson is that prose in this repo — including these prompt files — decays:

| Said | Actually |
|---|---|
| §7: a dead import "keeps the module in the chunk" | Only for side-effectful / namespace imports. Removing 23 dead **named** imports produced a **byte-identical rebuild, same hashes**. |
| §3A: "Sweep Team/Coaches admin" is *buildable now* | Supabase-gated; renders one card locally. And the item conflates two different screens. |
| `AdminTeamScreen.jsx`: `AdminTeamScreen.test.js` guards `TEAM_ROLES` | No such file has ever existed. |

**The durable fix is a test, not a tidier document.**

---

## 1. What session 13 shipped — `078a55a` → `c5a9ed8`, four commits

| Area | What |
|---|---|
| **a11y sweep, round 2** (`0e373de`) | **An emoji is text.** Session 12's `named()` rule accepts non-empty `innerText`, so twelve buttons passed it while saying nothing. |
| **Dead imports** (`fc4a82e`) | 23 bindings across 10 files that **both** lint gates are blind to. Bought **zero bytes**, and that correction is the point. |
| **Handoff** (`6394e3d`, `c5a9ed8`) | Session-13 findings + I9 retargeted with measured per-candidate verdicts. |

### The a11y defect, in detail — because the shape of it recurs

The Exercise Library's edit mode shipped six ✏️/🗑️ pairs, one per movement, **all green under the
session-12 sweep**. A screen reader announced them "pencil" and "wastebasket": six identical pairs in
one set, one of each pair destructive, with nothing saying *which* movement was about to go.

They are mounted by pressing **Edit** — so no test in this repo had ever seen them. That is §3A's
own stated gap ("modals and panels that open on interaction") hiding a real defect on first look.

**Writing the rule generically found a second defect nobody was looking for.** "A name with no
letter and no digit is not a name", applied across all nine screens, immediately failed the
**Schedule's `‹` / `›` week navigation**. Two independent surfaces, one generic question.

Two guards added, both mutation-checked. The edit-mode one also requires delete labels be
**distinct** — six identical "Delete" buttons would satisfy the rule and still leave the coach unable
to tell them apart. When the label is removed again the edit-mode test fails **and the per-screen
sweep still passes**, which is the blind spot recorded as a result rather than as prose.

### Rules those builds established — do not undo them

- **An accessible name must contain a WORD.** `aria-label`, never `title`, never an emoji, never a
  glyph. Both e2e rules walk the same `SCREENS` list, so a new screen is swept without anyone
  remembering to.
- **Naming a repeated control is half the job — the name must DISTINGUISH.** Six "Delete" buttons
  are as useless as six unnamed ones.
- **A sweep that only sees a screen's first render has not seen the screen.** Drive into the panels.
- Earlier rules that still hold: a retention flag is a claim about a CURRENT member with data behind
  it; `INACTIVE_STATUSES` is stated as the EXCLUDED set; the compliance export discloses what the gym
  RECORDED, not only what the member did; deleting the import lines is half of an extraction; the
  Schedule/Runner match is never loosened; a started class keeps its SLOT's time; colour derivations
  must not assume a dark theme; I10 marks a row synced only on server confirmation.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–13 was found by driving a real flow and reading back the stored
object.** Session 13 reinforced two and added one:

1. **Ask the generic question, not the enumerated one.** The symbol-only rule was written as a rule,
   not as a list of known-bad buttons — which is the only reason it found the Schedule.
2. **Drive PAST the first render.** Every remaining a11y defect in this repo is behind a click.
3. **NEW — a truncated tool result is not a negative result.** See §0.
4. Still true: re-run a probe before believing it (a full e2e run failed broadly and passed 114/114
   on re-run with no code change — a stale server on the e2e port); quantify at corpus scale before
   accepting a tested decision; an honest blank beats a confident wrong guess.

---

## 3. 📋 THE PENDING LIST

### 3A. Buildable now — no blocker, no decision needed

| # | Item | Notes |
|---|---|---|
| **I6** | **Decomposition stage 5** | Stage 4 done. Stage 5 = the Runner cluster (`LiveScreen`, `RoomTV`, `CheckInPanel`, `OverviewDisplayScreen`, `FloorLiveScreen`, `DisplayScreen`) behind `useClassRunner()`. Largest remaining block. **Mind §6, and mind §0a — check for a concurrent session first.** The three scripts §7 describes make this safe; rebuild them. |
| **I9** | **Lazy-load — RETARGETED, see §5** | The prompt's old ordering was wrong. **AnalyticsScreen first**: `FLAGS.mockAnalytics` is false so it ships to every device and never renders, and it has **zero App.jsx-local dependencies**. |
| **a11y** | The rest of the tree | Round 2 covered *buttons*, all nine screens, plus the Library's edit mode. **Still uncovered:** `<a>` and `<input>` elements, focus order and focus trapping, and the other interaction-revealed panels — Builder modals, `ProfileModal`, `PlaylistImportModal`, the share-card, the Room TV mode switch. Each is a candidate for exactly the defect found in the Library. |
| **Sweep** | Exercise Library — the rest | Session 13 drove *add a custom movement* (persists correctly). **Not driven:** edit, delete, reorder, "New class type", Reset-to-defaults, and search. See the §4 finding before touching Reset. |
| **Sweep** | Coaches / Personas | The §3A item said "Team/Coaches"; **Team is blocked** (§4). Coaches is `PersonasScreen`, is locally drivable, and has never been swept end to end. |
| — | Taxonomy LLM fallback (D1 remainder) | Deferred **by design** until a corpus of blanks exists. |
| — | `sync_incidents` telemetry | TECH-PLAN §6. Post-pilot. |
| — | I8 server-side media proxy | RapidAPI key + Deezer BPM. LEGAL §3 suggests hiding the field for the pilot. |
| **B3** | D2 real-corpus verification | **Needs decks only Dylan has.** |

### 3B. Surfaces swept end to end

| Surface | State |
|---|---|
| **Google Slides import** | ✅ s10 — found the rep-count defect. |
| **Share card** | ✅ s10, clean. |
| **Attendance spine** | ✅ s10 — found §3A. |
| **CSV backfill → members → retention** | ✅ s11 — found the collapsed same-day class. |
| **Brand Studio → Room TV** | ✅ s11 + s12 — dark-theme assumptions, then board backgrounds. |
| **Member data export (PDPA)** | ✅ s12 — found two omissions. |
| **Win-back → ledger cycle** | ✅ s12 — **clean**. The rule was right. |
| **At-risk eligibility** | ✅ s12 — found cancelled/paused being flagged. |
| **Accessible names — buttons, 9 screens** | ✅ s12 (26 → 0) + **s13** (12 → 0 symbol-only, 2 surfaces). |
| **Exercise Library — add custom movement** | ✅ s13 — storage correct; **found the snapshot-blob issue (§4)**. |
| **Team admin** | ⛔ **Not reachable locally** — `!supabaseEnabled` returns one card. Moved to §4. |
| **Room TV Follow** | ⛔ **Not reachable locally** — `room.js:16` gates on `supabaseEnabled`. |

---

## 4. ⛔ Blocked on Dylan — infra, deploys, decisions

_The three DEC-12 items are still open — Dylan has not answered them. One new DEC-13, and it is the
most consequential item on this list._

| # | Item | Blocker |
|---|---|---|
| **DEC-13** 🔴 | **The gym's library is a SNAPSHOT, not a delta — and it freezes** | Adding **one** exercise writes **59,162 bytes** to `jungle_library_custom` (the whole catalogue, all ten class types), and `saveLibraryCustom` upserts that same blob to Supabase `library_overrides` on **every** edit. Two consequences. **(a) Payload:** 59 KB to Postgres per keystroke-ish save — the concern `store.js:207` already names for personas. **(b) The freeze:** `getLibrary()` merges saved over built-in with `subTypes:{...WORKOUT_LIBRARY[k].subTypes, ...saved[k].subTypes}`; because the blob holds every class type, the gym's snapshot wins **everywhere**, so **any future improvement to `src/data/library.js` never reaches a gym that has ever pressed Save.** "Editable per gym" quietly becomes "frozen at first edit". Fix = delta format + backward-compatible read. It changes what is written to a **synced table**, hence Dylan's call. Natural home: a new `src/lib/libraryStore.js` (which the `LibraryBrowserModal` extraction wants anyway). **No production gyms exist yet, so the migration cost is near zero TODAY and rises the moment the pilot starts.** |
| **DEC-12** | **The Builder's back-chevron does not go back** | The top-bar left chevron calls `onOverviewDisplay` — the same handler as "Preview on TV" 35 lines below — while sitting where every screen puts Back and drawing that icon. Options: (a) drop it; (b) wire real back-navigation (no `onBack` prop today); (c) leave it. |
| **DEC-12** | **The retention note in a PDPA export** | The access export discloses the `retention_actions` ledger including the coach's free-text note. PDPA's Fifth Schedule lets an organisation withhold **opinion data kept solely for an evaluative purpose**, and nothing in code can tell "said she's travelling" from an evaluative remark. **A line in the lawyer review** (LEGAL §7), not a code change. |
| **DEC-12** | **`winBackBlockedReason` is nearly unreachable** | Its non-null branch only fires for a status outside `MEMBER_STATUSES` arriving from a server row. Keep as a defence, or fold it away. Low stakes. |
| **N4** | **Member magic-link summary** | Edge Function to issue a signed class token (LEGAL §4). **The only member-facing surface**; PRODUCT-DIRECTION §5 calls it the #1 missing thing and the last Phase-1 gap. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
| **OPS** | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| **F1 + PAR-Q** | Session primitive / 1:1 path | New migration. PAR-Q **must land in the same change** that introduces individualised load. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| **F4-QR** | QR self-check-in | Edge Function. Deferred, "do not promise" (AUDIT 2.4). Never loosen RLS to `anon`. |
| — | Consent notice surface | Deliberately unbuilt: **no consent record may be written until a real notice exists.** `recordConsent` has zero callers — correct, not a bug. |
| — | N2 cohort analytics | Waiting on attendance **volume**, not code. |
| **DEC** | 3 dead symbols | `nudgeForContrast`, `resolveSubBrand` (FR-H8), `fetchBpmData`. (`SLOT_LABELS` still unreferenced in `CalendarScreen`.) |
| **DEC** | `eslint-plugin-react` | The only in-tooling way to close the JSX blind spot (§6). New dev dep + CI gate change. |
| **DEC** | Sentry | New **sub-processor**; crash payloads carry member names → DPA question (LEGAL §6). |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### Live-verification queue (unexercisable locally)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push
   without a reload) and **I14** paging. **I10's delta writes are on this path.**
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified.
4. **Install the PWA** on phone + room TV.
5. **NEW — the Team admin screen, end to end.** Invite by email and by `@domain`, role change,
   suspend/reactivate, revoke. Never driven; unreachable without Supabase.

⚠️ **The live site sits behind real Google/email auth.** The PIN bypass only exists in the
credential-less local build, so driving the deployed app past login **needs Dylan**.

---

## 5. 📏 I9 — production measured, and the target list corrected

**Measured off the live deploy:**

| | Local build | Production (live) |
|---|---|---|
| main chunk | 564.96 KB | **787.2 KB** |
| PersonasScreen chunk | 89.21 KB | **88.3 KB** |
| first load | 565 KB | **787 KB** (down from ~890 KB pre-split, **−103 KB / −11.5%**) |

⚠️ `supabase` is a **shared** dependency, so rollup keeps it in the common chunk. The entire ~240 KB
local-vs-production delta sits in the **MAIN** chunk, and splitting a screen out moves only that
screen's own code — **not a share of the supabase mass.**

⚠️ **The build gate still under-reports production by ~37%.** With no `VITE_SUPABASE_*` vars,
`supabaseEnabled` folds to `false` and rollup eliminates every sync path. A sync-only commit produces
a **byte-identical local bundle** — which looks exactly like this repo's documented stale-`dist/` bug
and is not it.

### The candidate list, re-ranked by what each actually buys

| Candidate | Verdict |
|---|---|
| **AnalyticsScreen** (~268 lines) | **Take this first.** `FLAGS.mockAnalytics` is **false** — shipped to every device, **never rendered**. Pure critical-path waste, same category as `src/music/*`. And **zero App.jsx-local dependencies**: the cleanest extraction available. |
| **`src/music/*`** (~22 KB) | Same category (`FLAGS.music` false, never run) but **not a `React.lazy`**: App.jsx imports `useSpotify`, and a hook cannot be conditionally lazy-loaded. Needs a real seam. |
| **BrandStudioScreen** (~564 lines) | Real win — sole user of six `colors.js` exports, which leave with it. Needs `GYM_ARCHETYPES`, `PRESET_SKINS`, `ProgramChip`; `PRESET_SKINS` is also used by the root component, so it wants a **shared module**, not a move. |
| **LibraryBrowserModal** (~299 lines) | **Weakest, not strongest.** Its 58 KB of data **stays** — `WORKOUT_LIBRARY` is referenced throughout App.jsx (Builder, class picker, root). Only the JSX leaves. |
| **AdminTeamScreen** (168 lines) | Near-worthless alone — `supabase` and `AuthGate` are already in main, so it trades ~4 KB for an extra request. |

A component defined **inside** App.jsx cannot be `React.lazy`'d from App.jsx, so the bottom four each
need extracting to a file first. The `Suspense` boundary and `nav()` already handle it.

Known fixed costs: `react-dom` 177 KB unavoidable; `@supabase/*` ~198 KB (auth-js 96,
realtime+phoenix 55 — `room.js` Follow is a real feature so it stays; storage-js 22 apparently
unused but pulled in by the supabase-js constructor — Dylan's call); `src/data/library.js` 58 KB.

---

## 6. 🔴 `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. It bit twice in session 6 and once in session 7.

**Re-verified clean in session 13** across all 15 source files, with a babel-AST check (not a regex —
see §7). The check was itself proven against a planted `<PhantomComponent/>` and a
`<Missing.Deep.Thing/>`, while correctly ignoring one named in a comment, one in a string, and a
lowercase intrinsic.

Three guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to `SCREENS`** — both a11y sweeps read the same list.
2. The JSX-resolution script (§7). Cheap to rebuild, and the right thing to run after any move.
3. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call (§4).

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to any weaker check.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error — the
gate *does* catch that one. Same for a comment between `return (` and the root element; put it above
the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 13:**

- **Rebuild the three AST scripts. They are cheap and they make extraction safe.** All three use
  `@babel/parser` + `@babel/traverse` (present transitively) via `createRequire` pointed at the
  repo's `package.json` if the script lives outside the repo. (a) a **scan**: for a set of
  declarations, what imports it needs, what same-file declarations it leans on, what the rest of the
  file still uses, and what imports go dead after the move. (b) a **JSX-resolution** check (§6).
  (c) a **dead-import** finder. **Anchor slices on declaration NAMES, not line numbers** — the file
  shifts under your own edits.
- **A dead named import costs ZERO bytes** — rollup already tree-shakes it. Removing them buys an
  accurate reading of what a file depends on, which is what extraction leans on. The "module stays
  in the chunk" warning applies only to **side-effectful or namespace** imports.
- **`no-unused-vars` does NOT report unused UPPERCASE imports** (`/^[A-Z_]/`) — so eslint lists the
  lowercase dead imports and stays silent about every constant and every component.
- **Read the scan output before acting on it.** Session 13 deleted `import React` from a file whose
  scan said only `useState`/`useEffect` were dead — the file calls `React.useState` directly. The
  crash gate caught it.
- **A truncated `Grep` is not a negative result.** `head_limit` silently cut the row that disproved
  a conclusion. Raise the limit or narrow the pattern.
- **Adding an `aria-label` CHANGES the accessible name, which breaks name-based locators.** Two
  schedule tests located the week button by `name: "›"`. Expect this and update the locators — the
  label is the improvement, the locator follows it.

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
- **A second chat usually holds :5173.** Start your own on a fixed alt port (`--port` +
  `--strictPort`); e2e has its own 5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write to a file and `git commit -F
  <file>`.** PS 5.1 wraps native stderr as `NativeCommandError` — `git push` and `vite build`
  "errors" that still report success are that, not failures. `gh` is **not installed**; use the
  GitHub REST API via `Invoke-WebRequest` for CI status.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 656 unit (no todos) · 114 e2e (no fixme) · main chunk ~565 KB + an
~89 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI question was
settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating** —
a full run failed and then passed 114/114 with no code change in session 13.

---

## 9. Suggested order for session 14

1. **`git fetch` and read §0a.** If another session is live, pick work in different files and say so.
2. **DEC-13 is the highest-value thing on this list and it gets more expensive with time.** If Dylan
   answers it, do it first — the library freeze is invisible, permanent for the affected gym, and
   free to fix today because no production gyms exist yet.
3. **I9: AnalyticsScreen out and lazy.** Cheapest real win, zero local deps, and it validates the
   extraction scripts before stage 5 leans on them.
4. **I6 stage 5** — the Runner cluster. Biggest remaining block. Mind §6 and §0a.
5. **Keep sweeping.** The a11y work is half done: `<a>`/`<input>`, focus order, and the panels listed
   in §3A. Then the rest of the Exercise Library (edit, delete, reorder, new class type, Reset), then
   Coaches/Personas.
6. If Dylan unblocks anything else in §4 it jumps the queue — especially **N4** and **OPS/backups**.
