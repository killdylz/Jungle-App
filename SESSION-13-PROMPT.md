# Jungle — Session 13 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = cc4a1b7`, tree clean, **pushed and deployed** (CI run 30234131895 green, live bundle
`index-B1KMLuJn.js` serving, no console errors). Gates green:
**`lint:crash` 0 · 656 unit (no todos) · 104 e2e (no fixme) · build 564.96 KB + 89.21 KB chunk**.
App.jsx **4,965 lines** (was 6,309).

This file supersedes `SESSION-12-PROMPT.md` (now history). **Both of its DEC-11 items are closed** —
Dylan answered both and both are built. The surviving blocked-on-Dylan list is reproduced in §4,
with three new entries session 12 produced.

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

**The durable fix is a test, not a tidier document.** If you find yourself arbitrating between two
paragraphs, write the test instead.

⚠️ **Rank 1 has a caveat session 12 earned the hard way.** A test is only as good as its
measurement. Session 11's `test.fixme` for the Room TV backgrounds read the first `position:fixed`
element at `zIndex>=500` and **fell back to `document.body`** — only one of the three boards has
such an element, so two of them were silently scored on the body, and a board painting itself pure
black over a cream body would have passed. It also compared one board's outer surround against
another's root, which made the disagreement look bigger than it was. **Before trusting a failing
measurement, check what it actually measured.**

---

## 1. What session 12 shipped — `a3e8b72` → `110fb5d`, five commits

| Area | What |
|---|---|
| **DEC-11 · retention** | Rule 1 requires a join date it **holds**. It used to substitute the first imported check-in and state "Joined N days ago" as fact — 9 of 12 of an established roster, each citing a date never in the data. Same 9 still surface, now on the absence rule. A purely historical import now flags **nobody**. |
| **DEC-11 · Room TV** | All three boards wear the gym's brand; Plan gained the mark it never had. Session 11's fixme is **deleted, not disabled** — replaced by a measurement that collects every viewport-covering surface and requires each to be a brand token. |
| **Export sweep** | `externalRef` and the **entire `retention_actions` ledger** were held and not disclosed. The compliance export answered what the member DID and omitted what was concluded about them. |
| **Retention sweep** | The at-risk list flagged **cancelled and paused** members — and they **outranked** real flags, so the list an owner reads first was led by people who had already left. Third gate added. |
| **a11y sweep** | 26 unnamed buttons → 0 across nine screens. |
| **The Runner's back button went FORWARD** | Wired to `onNextStage`; no prev handler existed at all. Found only because naming the controls made the transport testable. |
| **I6 stage 4 + I9** | App.jsx 6,349 → **4,965**. Personas is a lazy chunk: main **653 → 565 KB** plus 89 KB on demand. |
| Found on the same walks | `BrandLogo`'s monogram hardcoded `var(--bg)` on `--accent` — 3.36:1, below AA; the Builder's back-chevron duplicates "Preview on TV". |

### Rules those builds established — do not undo them

- **A retention flag is a claim about a CURRENT member with data behind it.** Three gates now, and
  they are the same idea three times: rule 2 needs the studio to be recording, rule 1 needs a real
  join date, and both need a membership that is still active. Any fourth rule needs its own.
- **`INACTIVE_STATUSES` is stated as the EXCLUDED set, never a whitelist of "active".** A status
  added later then defaults to being monitored — an extra flag is visible and gets argued with; a
  member silently dropped out of at-risk detection is invisible.
- **The compliance export discloses what the gym RECORDED about a member, not only what they did.**
  What it omits is the defect, and an omission renders perfectly.
- **Icon-only controls carry `aria-label`, never `title`.** `title` is the last resort in the name
  computation and never reaches touch. This is now enforced per screen.
- **Deleting the import lines is half of an extraction.** A dead `import` still pulls the module
  into the chunk.
- Earlier rules that still hold: the Schedule/Runner match is never loosened; a started class keeps
  its SLOT's time; CSV occurrence identity follows the data; colour derivations must not assume a
  dark theme; the Floor board shows rounds only when the plan states them; I10 marks a row synced
  only on server confirmation.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–12 was found by driving a real flow and reading back the stored
object.** Session 12 added four lessons:

1. **A surface with no accessible names has no tests, and therefore has bugs.** The Runner's
   transport was untestable because nothing could refer to a button. The a11y pass was not a
   politeness exercise — it was the thing that made the defect findable.
2. **Check what a failing measurement measured.** See §0's caveat.
3. **A sweep that finds nothing is a result worth writing down.** The win-back re-flag cycle was
   correct. Recording that plainly is what stops the next session re-auditing it.
4. **Ask the generic question, not the enumerated one.** The export sweep drives off the store's
   real member shape and fails when a field is held but not disclosed — a retyped list of fields
   would have gone stale exactly the way the export did.

Still true: read back the **derived** store, not the one you just wrote; re-run a probe before
believing it; and quantify at corpus scale before accepting a tested decision.

---

## 3. 📋 THE PENDING LIST

### 3A. Buildable now — no blocker, no decision needed

| # | Item | Notes |
|---|---|---|
| **I6** | **Decomposition stage 5** | Stage 4 is **done**. Stage 5 = Builder/Live/RoomTV behind `useClassRunner()`. App.jsx is 4,965 lines; the Runner cluster (`LiveScreen`, `RoomTV`, `CheckInPanel`, `OverviewDisplayScreen`, `FloorLiveScreen`, `DisplayScreen`) is the largest remaining block. **Mind §6.** The scan + JSX-resolution scripts session 12 used are described in §7 — rebuild them, they made the move safe. |
| **I9** | More splitting | Now unblocked per screen. `BrandStudioScreen`, `AnalyticsScreen`, `LibraryBrowserModal` and `AdminTeamScreen` are all self-contained and lazy-able **today** — the Suspense boundary and the `nav()` helper already handle it. `src/data/library.js` is 58 KB and `src/music/*` ~22 KB shipped-never-run. |
| **Sweep** | Team/Coaches admin | Never driven end to end. |
| **Sweep** | Exercise Library custom entries | Never driven end to end. |
| **a11y** | The rest of the tree | The sweep covers **buttons on the nine top-level screens**. Not covered: modals and panels that open on interaction, `<a>`/`<input>` elements, and focus order. Extending the sweep to run after opening each modal is the obvious next pass. |
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
| **Brand Studio → Room TV** | ✅ s11 + s12 — dark-theme assumptions, then the board backgrounds. |
| **Member data export (PDPA)** | ✅ s12 — found two omissions. |
| **Win-back → ledger cycle** | ✅ s12 — **clean**. The rule was right. |
| **At-risk eligibility** | ✅ s12 — found cancelled/paused being flagged. |
| **Accessible names (9 screens)** | ✅ s12 — 26 → 0, and found the Runner's back button. |
| **Room TV Follow** | ⛔ **Not reachable locally** — `room.js:16` gates on `supabaseEnabled`. Needs Supabase **and** two devices (§4). |

---

## 4. ⛔ Blocked on Dylan — infra, deploys, decisions

_Session 12 closed both DEC-11 items. Three new entries take their place, all small._

| # | Item | Blocker |
|---|---|---|
| **DEC-12** | **The Builder's back-chevron does not go back** | The top-bar left chevron calls `onOverviewDisplay` — the same handler as the "Preview on TV" button 35 lines below — while sitting exactly where every other screen puts Back and drawing that icon. Two controls, one action, one dressed as navigation. Labelled truthfully for now, which made four tests need `.first()`. Options: (a) drop the chevron; (b) wire it to real back-navigation (the Builder has no `onBack` prop today); (c) leave it. |
| **DEC-12** | **The retention note in a PDPA export** | The access export now discloses the `retention_actions` ledger including the coach's free-text note. PDPA's Fifth Schedule lets an organisation withhold **opinion data kept solely for an evaluative purpose**, and nothing in code can tell "said she's travelling" from an evaluative remark. Jungle is the intermediary; the gym carries the duty — so the export shows the note and labels the section. **Worth a line in the lawyer review** (LEGAL §7) rather than a code change. |
| **DEC-12** | **`winBackBlockedReason` is nearly unreachable** | With paused/cancelled members no longer flagged, its non-null branch only fires for a status outside `MEMBER_STATUSES` arriving from a server row (`_rowToMember` passes status through raw). Keep as a defence, or fold it away. Low stakes; noted so it is not mistaken for dead code. |
| **N4** | **Member magic-link summary** | Edge Function to issue a signed class token (LEGAL §4). **The only member-facing surface**; PRODUCT-DIRECTION §5 calls it the #1 missing thing and the last Phase-1 gap. Share-card half already shipped. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
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
5. ~~Measure the production split.~~ **DONE** at the end of session 12 — see §5.

---

## 5. 📏 I9 — production is now measured

**Measured off the live deploy of `cc4a1b7`:**

| | Local build | Production (live) |
|---|---|---|
| main chunk | 564.96 KB | **787.2 KB** |
| PersonasScreen chunk | 89.21 KB | **88.3 KB** |
| first load | 565 KB | **787 KB** (down from ~890 KB pre-split, **−103 KB / −11.5%**) |

⚠️ **A prediction made earlier in session 12 was wrong, and the correction is the useful part.**
The personas chunk was expected to be much larger in production because it imports `supabase`. It
is **within 1 KB of the local size**. `supabase` is a *shared* dependency, so rollup keeps it in the
common chunk — which means **the entire ~240 KB local-vs-production delta sits in the MAIN chunk**,
and splitting a screen out moves only that screen's own code. Plan stage 5 on that basis: extracting
a screen buys you roughly what the screen's local chunk weighs, not a share of the supabase mass.

Verified live: on first load the browser fetches only `index-*.js` + CSS; `PersonasScreen-*.js` is
not requested until Coaches is opened.

⚠️ **The build gate still under-reports production by ~37%.** With no `VITE_SUPABASE_*` vars,
`supabaseEnabled` folds to `false` and rollup eliminates every sync path. A sync-only commit
produces a **byte-identical local bundle** — which looks exactly like this repo's documented
stale-`dist/` bug and is not it.

To measure: build with dummy credentials, `npx vite build --sourcemap`, attribute bytes via the
`.map`, then **delete `dist/` and rebuild without the vars** so no dummy URL stays baked in.
(`npm run build -- --sourcemap` does **not** work — the flag lands on `build-sw.mjs`.)

**The 235 KB App.jsx figure in the session-12 prompt is now stale.** App.jsx is 4,965 lines, not
5,849, and the personas cluster left it entirely. Re-attribute before planning stage 5.

What is known: `react-dom` 177 KB is unavoidable; `@supabase/*` ~198 KB (auth-js 96, realtime+phoenix
55 — `room.js` Follow is a real feature so it stays, storage-js 22 apparently unused but pulled in by
the supabase-js constructor — Dylan's call); `src/data/library.js` 58 KB; `src/music/*` ~22 KB
shipped to every device and never run (`FLAGS.music` false).

---

## 6. 🔴 `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. It bit twice in session 6 and once in session 7.

**Verified clean as of session 12.** Every capitalised JSX name in App.jsx and all four screen
modules was extracted and checked against that file's imports and local declarations: zero
unresolved. The `<SpotifySearchModal/>` phantom earlier notes warned about was removed by stage 3 —
only comments mention it now.

Three guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to that list** — the a11y sweep reads the same list.
2. The JSX-resolution script (§7). Cheap to rebuild, and the right thing to run after any move.
3. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call (§4).

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to any weaker check.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error — the
gate *does* catch that one. The same is true of a comment placed between `return (` and the root
element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 12:**

- **`no-unused-vars` does NOT report unused UPPERCASE imports** — the rule ignores `/^[A-Z_]/`. After
  an extraction, eslint will list the lowercase dead imports and stay silent about every constant.
  Check those by hand or the module stays in the chunk.
- **A lazily-loaded screen breaks any raw `innerText()` read.** Assertions like `toBeVisible` auto-wait;
  a text snapshot does not, and it captured the Suspense fallback. `nav()` in `e2e/helpers.js` now
  waits for the fallback's **testid** — not the words "Loading…", because three other screens render
  exactly that text and `nav` would hang on whichever was fetching.
- **Two scripts made the extraction safe. Rebuild them for stage 5.** (a) a *scan* that reports, for
  a line range: which imports it needs, which App.jsx-local declarations it depends on, and what it
  declares that the rest of the file still uses; (b) a *JSX-resolution* check that extracts every
  `<Capitalised` name and verifies it resolves. Anchor the slice on **file content, not line
  numbers** — the file shifts under your own edits mid-session.
- **A naive identifier scan counts comments.** The first scan reported 60 "shared" imports because
  module names appear in prose. Trust eslint for usage, not a regex.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied.** **Revert with the
  INVERSE mutation, never `git checkout <file>`** — that reverts to HEAD and silently destroys the
  session's uncommitted work in that file.
- **Date-dependent fixtures.** `honesty.spec.js` passed six days a week and failed on Sunday, on a
  commit that had not touched `src/`. **Use `page.clock.setFixedTime` for anything time-dependent** —
  install it before `freshApp`. Session 12's re-flag sweep spans a month this way.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once. Use editor tools or `node -e` with explicit `'utf8'`. PowerShell's
  *console display* also shows mojibake for UTF-8 — that is the terminal, not the file.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** It is a **conditional render**, so once hidden
  the buttons do not exist — and **a wake-then-click across two tool calls always misses**. In
  Playwright use `page.mouse.move()` then click in the same test (`gotoDisplay` in `display.spec.js`).
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards** — a fullscreen board has
  no sidebar to navigate from.
- **The browser console buffer persists across reloads AND dev-server restarts.** Confirm health
  against the live DOM, or prefer a fresh e2e run with `expectNoConsoleErrors`.
- **`innerText` respects `text-transform`; `textContent` does not.** "SUN" has `textContent === "Sun"`.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`title` does not override text content for a button's accessible name** — use `aria-label`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it.
- **A second chat usually holds :5173.** Start your own on a fixed alt port (`--port` +
  `--strictPort`); e2e has its own 5191/5192. **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write to a file and `git commit -F
  <file>`.** PS 5.1 wraps native stderr as `NativeCommandError` — `git push` and `vite build`
  "errors" that still report success are that, not failures.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.** Applied throughout sessions 9–12 — most
  recently rule 1 declining to invent a join date, and the export refusing to omit what it holds.

## 8. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 656 unit (no todos) · 104 e2e (no fixme) · main chunk ~565 KB + an
~89 KB PersonasScreen chunk**. CI runs the same chain on Linux; the Playwright-in-CI question was
settled in session 6 — **do not re-investigate**.

✅ **Session 12 is pushed and deployed.** `a3e8b72..cc4a1b7`, six commits, CI green on Linux.

## 9. Suggested order for session 13

1. **Push, and confirm the deploy is healthy.** Then measure the **production** split — the 565/89
   numbers are local and the personas chunk imports `supabase`.
2. **I6 stage 5** — the Runner cluster behind `useClassRunner()`. Biggest remaining block, and §7
   now describes the two scripts that made stage 4 safe. Mind §6.
3. **Lazy-load the four screens that are already self-contained** (Brand Studio, Analytics, Library,
   Team). The Suspense boundary and `nav()` already handle it; this is cheap bytes.
4. **Keep sweeping** — Team/Coaches admin, then the Exercise Library's custom entries. And extend
   the a11y sweep past top-level buttons into modals, links and focus order.
5. If Dylan unblocks anything in §4 it jumps the queue — especially **N4** and **OPS/backups**.
