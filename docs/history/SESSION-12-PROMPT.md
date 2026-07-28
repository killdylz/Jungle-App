# Jungle — Session 12 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = a09d18b`, pushed, deployed, tree clean. Gates green:
**`lint:crash` 0 · 644 unit (no todos) · 85 e2e + 1 fixme · build 651 KB**. App.jsx **6,309 lines**.

This file supersedes `SESSION-11-PROMPT.md` (now history). Its §3A is **done** and both of its live
decisions are **closed** — the surviving blocked-on-Dylan list is reproduced in §4 below, with two
new entries session 11 measured.

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

---

## 1. What session 11 shipped — `2ace140` → `a09d18b`, one commit, pushed

Two decisions from Dylan, then the two surfaces that had never been driven end to end.

| Area | What |
|---|---|
| **§3A — the Schedule/Runner join** | The occurrence is now **chosen, not inferred**. A grid cell offers **Start** inside the 4h join window; `store.startScheduledClass` resolves the row by identity and dates it to the **slot**; the id travels into `ensureClassInstance({ instanceId })`. A banner states the pin, with Unpin. |
| **Sunday** | Seven days in `DAYS`, `RULE_DAYS`, the `occurrencesForWeek` default and the day picker. |
| **The Sunday-only week bug** | `CalendarScreen`'s `base.getDate() - base.getDay() + 1` resolved to **tomorrow** when `getDay()` was 0, so on a Sunday the grid showed **next week** and today's row was absent. Now shares `startOfWeek`/`weekKeyOf` with the generator. |
| **CSV sweep** | Two same-name classes on one day were collapsed into one occurrence, and the second member check-in was **dropped and reported as a duplicate**. The key now follows the data — minute when the export states a time, day when it does not. |
| **Brand sweep** | Two dark-theme assumptions. `--on-green` 2.07 → **8.47**, `--on-accent` 3.36 → **5.23** (was failing AA), `--border` invisible → visible. |
| Found on the same walks | The desktop Builder's start button said "Add to schedule"; the check-in badge counted the last row in `class_instances`; the phone grid hid Fri and Sat; the rename button had no accessible name. |

### Rules those builds established — do not undo them

- **The Schedule/Runner match is never loosened.** Guessing which scheduled occurrence a coach is
  running attaches attendance to the wrong class, permanently and invisibly. `CLASS_WINDOW_MS` is
  **one** exported constant precisely so the Start button and the join cannot drift apart.
- **A started class keeps its SLOT's time**, never the moment Start was pressed — otherwise
  publishing the week afterwards writes the same class a second time.
- **CSV occurrence identity follows the data**: minute when the export gives a time, day when it
  does not. The analysis and the apply step must always match at the same precision.
- **Colour derivations must not assume a dark theme.** Every generated skin is dark, so a
  dark-theme assumption is invisible until a coach hand-builds a light palette. `inkOn` picks by
  measured contrast, not by a luminance threshold.
- Earlier rules that still hold: the parser's focus-suffix and bare-count rules, the Floor board
  showing rounds **only** when the coach's plan states them, and I10 marking a row synced **only on
  server confirmation**.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–11 was found by driving a real flow and reading back the stored
object. None was visible to a unit test, and every one rendered perfectly while saying something
false.**

Session 11 added three sharp lessons:

1. **Drive it on the day the bug happens.** The Sunday week-arithmetic defect was found by opening
   the Schedule on an actual Sunday. No amount of reading would have shown it; the code looks
   correct, and it *is* correct six days in seven.
2. **Write the sweep's expectations FIRST, then run it.** The CSV sweep failed five ways before the
   fix. That is stronger evidence than a mutation — the test was written to describe correct
   behaviour, not to describe what the code did.
3. **Quantify at corpus scale before accepting a tested decision.** The retention join-date
   fallback is deliberate and pinned by a test — at n=1 it looks obviously right. At corpus scale it
   flags three quarters of an established roster (§4). A passing test is rank 1, but a test written
   at n=1 has only ever been asked an easy question.

Still true from session 10: read back the **derived** store, not the one you just wrote; and re-run
a probe before believing it.

---

## 3. 📋 THE PENDING LIST

### 3A. ⛔ Take this first — decide, or route around

The two items in §4 marked **DEC-11** are session 11's measurements. Neither is a bug report; both
are quantified, both have the "do nothing" option written out, and both are cheap to build once
answered. If Dylan answers, build them. **If he does not, do not guess** — the retention one changes
what the instrument reports, and the Room TV one changes the member-facing surface.

### 3B. Buildable now — no blocker, no decision needed

| # | Item | Notes |
|---|---|---|
| **I6** | Decomposition stages 4–5 | Stage 4 = personas cluster → `src/screens/personas/`; stage 5 = Builder/Live/RoomTV behind `useClassRunner()`. The biggest structural win and the only route to I9's 235 KB. **Mind §6** — this is exactly the change that has twice shipped a dead screen past a green gate. App.jsx is now **6,309 lines**, up ~460 this session. |
| **Sweep** | Member data export (B5) → the PDPA path | `csvExport.js` has unit tests and `e2e/export.spec.js` drives some of it, but the per-member access export and the whole-roster portability export have not been driven end to end against a real corpus with the stored rows read back. This is a **compliance** surface: what it omits is the defect. |
| **Sweep** | Win-back draft → `retention_actions` ledger | 0008 is applied and the ledger is **append-only**; `applyRetentionActions` decides when an actioned flag returns (on the member being seen again). That re-flag rule has never been driven through the real UI across an action → check-in → lapse cycle. |
| **a11y** | Icon-only buttons with no accessible name | The runner's play/pause and transport controls (`-30s`/`+30s` have text; the 84px primary does not). Session 11 fixed the Builder's rename button the same way — `aria-label`, never `title`. A sweep of icon-only buttons across the nine screens is a contained, testable pass. |
| **I9** | Code splitting | Only the I6-independent slivers are reachable: `realtime-js`+`phoenix` (55 KB, used by `room.js` for Follow — a real feature, so it stays) and `storage-js` (22 KB, apparently used by nothing but pulled in by the supabase-js constructor, so dropping it means restructuring imports — Dylan's call). See §5. |
| — | Taxonomy LLM fallback (D1 remainder) | Deferred **by design** until a corpus of blanks exists. Visible cost: common warm-up names return no category and the drafter correctly leaves them out — thinner warm-ups, not wrong ones. |
| — | `sync_incidents` telemetry | TECH-PLAN §6. Post-pilot. |
| — | I8 server-side media proxy | RapidAPI key + Deezer BPM. LEGAL §3 suggests hiding the field for the pilot. |
| **B3** | D2 real-corpus verification | Drive a real deck through the Slides import with a blueprint saved; confirm `stats.blueprint > 0`. **Needs decks only Dylan has.** |

### 3C. Surfaces swept end to end

| Surface | State |
|---|---|
| **Google Slides import** | ✅ Swept (s10) — found the rep-count defect. Permanent test. |
| **Share card** | ✅ Swept (s10), clean. |
| **Attendance spine** | ✅ Swept (s10) — found §3A. |
| **CSV backfill → members → retention** | ✅ Swept (s11) — found the collapsed same-day class. Permanent test: `store.test.js`, "SWEEP — a real attendance export, end to end". |
| **Brand Studio → Room TV** | ✅ Swept (s11) — found two dark-theme assumptions. Permanent tests in `colors.test.js` + `display.spec.js`. |
| **Room TV Follow** | ⛔ **Not reachable locally.** `room.js:16` gates on `supabaseEnabled`, false in the local build, so the broadcast no-ops. Needs Supabase **and** two devices — §4. |

**Candidates not yet swept** (in the order I would take them): member data export, the win-back →
ledger cycle, Team/Coaches admin, and the Exercise Library's custom entries.

---

## 4. ⛔ Blocked on Dylan — infra, deploys, decisions

_Session 11 closed two: the Schedule→Runner affordance (built) and Sunday (added). Two new
measurements take their place._

| # | Item | Blocker |
|---|---|---|
| **DEC-11** | **Retention rule 1 asserts a join date it does not have** | The CSV export carries no join date, so `applyAttendanceImport` leaves `joinedAt: ""` (honest) and `retention.js:91` substitutes the member's **first imported check-in**, then the reason line states "Joined N days ago" as fact. Deliberate, and pinned by `retention.test.js:68`. **Measured at corpus scale (passing test in `store.test.js`): 9 of 12 members of an established gym — three quarters of the roster — flagged as new members failing to build a habit on day one, each citing a date that was never in the data.** Rule 2 is explicitly gated against exactly this (`activity.recording`); rule 1 has no equivalent gate. Options: (a) require a known `joinedAt` for rule 1 — `addMember` always sets one, so only imported members are affected; (b) keep the fallback and reword the reason to "First seen N days ago"; (c) leave it. |
| **DEC-11** | **The three Room TV boards disagree about whose background they wear** | Plan (`OverviewDisplayScreen`, the **default** mode, the board a member sees walking in) hardcodes `#050705` and carries **no brand mark at all**; Floor uses `var(--bg)` with the gym's name and monogram; Coach hardcodes `#000`. Measured live: Plan on `rgb(5,7,5)` while Floor on `rgb(255,247,240)` for the same gym. Recorded as a `test.fixme` in `display.spec.js`. Options: (a) room displays are deliberately dark for projector legibility — then Floor is the odd one out and the choice becomes ONE named token; (b) they are the gym's brand on the biggest screen they own — then Plan and Coach use `var(--bg)` and Plan gains the brand mark. ⚠️ **Ordering constraint:** the brand mark on Plan only works AFTER the background is settled — `BrandLogo` draws the name in `var(--text)`, invisible on a near-black board for a light brand. |
| **N4** | **Member magic-link summary** | Edge Function to issue a signed class token (LEGAL §4). **The only member-facing surface**; PRODUCT-DIRECTION §5 calls it the #1 missing thing and the last Phase-1 gap. Share-card half already shipped. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
| **OPS** | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| **F1 + PAR-Q** | Session primitive / 1:1 path | New migration. `class_instances` exists and is generated; `session_assignments` is not. PAR-Q **must land in the same change** that introduces individualised load. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus — re-extraction costs quota twice. |
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
   without a reload) and **I14** paging. **I10's delta writes are on this path** — confirm a second
   save pushes only the changed row.
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified.
4. **Install the PWA** on phone + room TV.

---

## 5. 📏 I9 — measured. Do not plan it off the 651 KB gate number.

⚠️ **The build gate under-reports production by ~37%.** With no `VITE_SUPABASE_*` vars,
`supabaseEnabled` folds to `false` and rollup eliminates every sync path. The real deployed bundle
is **~890 KB**. A sync-only commit therefore produces a **byte-identical local bundle** — which
looks exactly like this repo's documented stale-`dist/` bug and is not it.

To measure: build with dummy credentials, `npx vite build --sourcemap`, attribute bytes via the
`.map`, then **delete `dist/` and rebuild without the vars** so no dummy URL stays baked in.
(`npm run build -- --sourcemap` does **not** work — the flag lands on `build-sw.mjs`.)

| Share | What |
|---|---|
| **235 KB (27%)** | `src/App.jsx` — one eager file, the single biggest item |
| 177 KB (20%) | `react-dom` — unavoidable |
| **198 KB (23%)** | `@supabase/*` — auth-js 96, realtime-js+phoenix 55, storage-js 22, postgrest 16 |
| 58 KB (7%) | `src/data/library.js` — pure data |
| ~22 KB | `src/music/*` — shipped to every device, never runs (`FLAGS.music` false) |

**The headline: App.jsx cannot be `React.lazy`'d while it is one file, so I9's biggest win is gated
behind I6 — not reachable by any lazy-loading trick.** (These shares were measured at 5,849 lines;
App.jsx is now 6,309, so its share has grown.)

---

## 6. 🔴 The thing that will still bite you: `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. It bit twice in session 6 and once in session 7.

**There is no known remaining JSX phantom.** Two guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to that list.**
2. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call (§4).

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to any weaker check.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error — the
gate *does* catch that one. The same is true of a comment placed between `return (` and the root
element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied** by diffing the
  source. **Revert with the INVERSE mutation, never `git checkout <file>`** — that reverts to HEAD
  and silently destroys the session's uncommitted work in that file (cost real time in session 11).
  Write the mutation to a script file that reads its needle from a FILE, not from argv, and have it
  print whether the anchor was found.
- **Date-dependent fixtures.** `honesty.spec.js` passed six days a week and failed on Sunday, on a
  commit that had not touched `src/`. Session 11's Start button is only offered inside a 4h window,
  so a wall-clock fixture would have passed all day and failed between 23:30 and 02:00. **Use
  `page.clock.setFixedTime` (Playwright ≥1.45) for anything time-dependent** — it is installed
  before `freshApp` and the whole app sees the fixed date.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once and mangled 77 sequences in the spec. Use editor tools or `node -e`
  with explicit `'utf8'`. PowerShell's *console display* also shows mojibake for UTF-8 — that is
  the terminal, not the file. Verify with node before believing it.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s** (deliberate, `ctl` in App.jsx). It is a
  **conditional render**, so once hidden the buttons do not exist — and **a wake-then-click across
  two tool calls always misses**, because the round trip exceeds 4.5s. In Playwright use
  `page.mouse.move()` then click in the same test (see `gotoDisplay` in `display.spec.js`); in the
  browser tools, take a real path into the mode you want instead.
- **The browser console buffer persists across reloads AND across dev-server restarts.** An error
  logged from a half-finished edit looks current for the rest of the session. **Confirm health
  against the live DOM**, never the buffer — and prefer a fresh e2e run with
  `expectNoConsoleErrors`, which starts from a clean page.
- **`innerText` respects `text-transform`; `textContent` does not.** A day header rendered as "SUN"
  has `textContent === "Sun"`. Cost a wrong "element missing" conclusion in session 11.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`title` does not override text content for a button's accessible name** — use `aria-label`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it.
- **A second chat usually holds :5173.** Start your own on a fixed alt port (`--port` +
  `--strictPort`); e2e has its own 5191/5192 and is unaffected. **Revert `.claude/launch.json`
  before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write to a file and `git commit -F
  <file>`.** PS 5.1 wraps native stderr as `NativeCommandError` — `git push` and `vite build`
  "errors" that still report success are that, not failures.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.** Applied throughout sessions 9–11 (the four
  zeros, the `0%` fill, the brand-preview NPS, the Floor board's rounds, the rep count above 100,
  and `isStartable` refusing an unreadable date rather than reading it as the epoch). Keep applying
  it — and note that both of §4's DEC-11 items are the same principle pointed at a guess the product
  is currently making.

## 8. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 644 unit (no todos) · 85 e2e + 1 fixme · build ~651 KB**. CI runs the
same chain on Linux and is green; the Playwright-in-CI question was settled in session 6 — **do not
re-investigate**.

The one `test.fixme` is deliberate: `display.spec.js`, "the three room boards agree on whose
background they wear". It is the DEC-11 measurement, carried in the suite rather than in a document
so it cannot be forgotten. **Delete it or make it pass — do not let it become furniture.**

## 9. Suggested order for session 12

1. **Answer or route around the two DEC-11 items.** Both are cheap once decided; both are wrong to
   guess at.
2. **Keep sweeping.** Member data export first — it is the compliance surface, and what a
   compliance export *omits* is the defect. Then the win-back → ledger cycle.
3. **I6** if you want the big structural win — it unblocks I9's 235 KB, and App.jsx grew again this
   session. Mind §6.
4. If Dylan unblocks anything in §4 it jumps the queue — especially **N4** and **OPS/backups**.
