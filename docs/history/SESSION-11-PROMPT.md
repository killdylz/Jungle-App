# Jungle — Session 11 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = 044e3f5`, pushed, deployed, tree clean. Gates green:
**`lint:crash` 0 · 609 unit + 1 todo · 78 e2e · build 648 KB**. App.jsx **5,849 lines**.

This file supersedes `SESSION-10-PROMPT.md` (now history) **except its §3C** — the blocked-on-Dylan
list, which is still live and reproduced in §4 below.

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

## 1. What session 10 shipped — `f4449c1` → `044e3f5`, 5 commits + 2 handoffs, all pushed

| Commit | What |
|---|---|
| `5e45726` | **§3A — the block label that invented a movement.** `M1 — Deadlift` yielded label `M1` **and** a phantom exercise "Deadlift", at `confidence: 1`. Four-week S360 corpus: catalog **10 → 7**. Also fixed the doubled title ("S360 — S360 — Week 4"). The `it.todo` session 9 left is now 8 passing tests. |
| `8de5ed1` | **The Floor board's fabricated pacer** (open decision, decided). Interval stages take their real phase from `calcIntervalState`; every other stage gets an honest steady state with **no round counter at all**. `FLOOR_PACE` deleted. |
| `224b074` | **I10 — delta writes.** Six id-keyed domains push only changed rows. |
| `e8f450d` | **The rep count that made a new movement every week.** `Wall Ball 15` welded the count to the NAME. Four weeks of GC notation, three real movements → catalog of **14**. Now 5. |
| `044e3f5` | The Schedule/Runner join measured + an e2e that only failed on Sundays. |

### Rules those builds established — do not undo them

- **Parser:** a block label's focus suffix is a theme, **unless it is the block's only
  movement-shaped content** — then it IS the movement. Never lose the only one.
- **Parser:** a trailing bare count is reps only when the block does **not** state sets×reps, and
  only up to 100. In a strength block that number is load; past 100 it is a distance.
- **Floor board:** rounds are shown **only** when the coach's own plan states them.
- **I10:** a row is marked synced **only on server confirmation**. The old full-list push was
  accidentally self-healing and every `_RETRY_PUSHERS` thunk still leans on that.

---

## 2. 🔬 The method — still the highest-yield thing in this repo

**Every defect in sessions 3–10 was found by driving a real flow and reading back the stored
object. None was visible to a unit test, and every one rendered perfectly while saying something
false.**

Session 10's sharpest lesson: **`e8f450d` was found by the COMPOSITION, not the parts.** Every
per-function test in `slidesImport.test.js` passed. Driving a whole deck through
split → gate → date → parse and asserting on the **stored plans** is what exposed it. That sweep is
now a permanent test.

Three refinements worth stealing:

1. **Read back the DERIVED store**, not the one you just wrote. The plan looked fine; the
   **movement catalog** it aggregates into was where both parser defects were visible.
2. **Quantify the defect over a multi-week corpus.** "Catalog 14 → 5" is what turned a tidy-looking
   parser nit into an obvious must-fix. Defects that scale with corpus size hide at n=1.
3. **Re-run a probe before believing it.** Session 10's first Schedule/Runner probe appeared to
   prove the join never works. It was the fixture's 09:00 slot against a 21:34 clock — the window,
   not the name match. The corrected run said something quite different.

---

## 3. 📋 THE PENDING LIST

### 3A. ⛔ Take this first — the Schedule/Runner join

**Nothing makes the Builder's `sessionName` equal the schedule rule's name**, so a coach who
publishes a week and then runs that class gets **two `class_instances` rows**. Check-ins land on
the Runner's; the published row keeps zero attendance forever.

Measured (`store.test.js`, "joins the occurrence the Schedule already published"):

| Scenario | Occurrences |
|---|---|
| same name, running at slot time | **1** (joined) |
| same name, 10 min after the slot | **1** (joined) |
| same name, 5h after the slot | 2 — outside the 4h window, acceptable |
| Builder name differs ("S360" vs "S360 — Week 4") | **2** |
| default `sessionName` "My Workout" | **2** |

**The join mechanism WORKS** — on name, inside `CI_WINDOW_MS` (4h) — and the first two rows are
pinned as passing tests, including that the Runner joins without overwriting the `coachName` and
`durationMin` the Schedule wrote. The gap is only that the two names come from unrelated places:
`sessionName` comes from the draft, a template or a persona and defaults to `"My Workout"`
(`App.jsx:2767`, and every `setSessionName` call site).

**⛔ Do NOT "fix" this by loosening the match.** Guessing which scheduled occurrence a coach is
running would attach attendance to the **wrong class**, permanently and invisibly. The honest fix is
to let the coach start a class **from the Schedule**, so the occurrence is chosen rather than
inferred — which is a product decision, hence §4.

**Scope, so nobody over-estimates it:** `retention.js` reads only `attendance` and never
`class_instances`, so the **at-risk instrument is unaffected**. What is affected is per-class
analytics and the schedule-vs-actual picture.

Recorded as `it.todo("carries the Schedule's occurrence into the Runner…")` in `store.test.js`.

### 3B. Buildable now — no blocker, no decision needed

| # | Item | Notes |
|---|---|---|
| **B3** | **D2 real-corpus verification** | Drive a real deck through the Slides import with a blueprint saved; confirm `stats.blueprint > 0`. Both session-10 parser fixes are proven against synthetic corpora **matching the real notation**, but not against The Garage's decks. **Needs decks only Dylan has.** |
| **I9** | **Code splitting — measured, and the premise was wrong** | See §5. The biggest win is gated behind I6. |
| **I6** | Decomposition stages 4–5 | Stage 4 = personas cluster → `src/screens/personas/`; stage 5 = Builder/Live/RoomTV behind `useClassRunner()`. **Mind §6** — this is exactly the change that has twice shipped a dead screen past a green gate. |
| — | Taxonomy LLM fallback (D1 remainder) | Deferred **by design** until a corpus of blanks exists. Visible cost: common warm-up names return no category and the drafter correctly leaves them out — thinner warm-ups, not wrong ones. |
| — | `sync_incidents` telemetry | TECH-PLAN §6. Post-pilot. |
| — | I8 server-side media proxy | RapidAPI key + Deezer BPM. LEGAL §3 suggests hiding the field for the pilot. |

### 3C. Surfaces swept end to end — and the one that cannot be

| Surface | State |
|---|---|
| **Google Slides import** | ✅ Swept — found `e8f450d`. Sweep is now a permanent test. |
| **Share card** | ✅ Swept, clean. Driven by recording what the canvas actually draws. De-dup, overflow (12 + "+3 more"), singular/plural, and the empty-class refusal all behave. |
| **Attendance spine** | ✅ Swept — found §3A. |
| **Room TV Follow** | ⛔ **Not reachable locally, and not for want of effort.** `room.js:16` gates on `supabaseEnabled`, false in the local build, so the broadcast no-ops. Needs Supabase **and** two devices — §4. |

**Not yet swept:** the CSV attendance backfill → members → retention chain, and Brand Studio →
Room TV token propagation.

---

## 4. ⛔ Blocked on Dylan — infra, deploys, decisions

_Unchanged from session 10 §3C except where noted._

| # | Item | Blocker |
|---|---|---|
| **DEC** | **Schedule → Runner (new, §3A)** | Should the coach start a class **from the Schedule**? That is the honest fix and it needs a UI affordance. |
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
| **DEC** | **Sunday** | The product is a **six-day week**: `DAYS = Mon..Sat` in `CalendarScreen`, and the "Add class" day picker is built from the same list, so a Sunday class cannot be created or displayed. Self-consistent, so it is a **product choice, not a bug** — but a gym that runs Sunday classes cannot use the Schedule. Confirm it is intended. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### Live-verification queue (unexercisable locally)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push
   without a reload) and **I14** paging. **I10's delta writes are now on this path** — confirm a
   second save pushes only the changed row.
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified.
4. **Install the PWA** on phone + room TV.

---

## 5. 📏 I9 — measured. Do not plan it off the 648 KB gate number.

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

**The headline: App.jsx at 235 KB cannot be `React.lazy`'d while it is one file, so I9's biggest
win is gated behind I6 — not reachable by any lazy-loading trick.** The I6-independent targets are
`realtime-js` + `phoenix` (55 KB, used only by `room.js` for Follow — a real feature, so it stays)
and `storage-js` (22 KB, apparently used by nothing, but bundled by the supabase-js client
constructor, so dropping it means restructuring imports — Dylan's call).

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
gate *does* catch that one. Put the comment above the `{`.

---

## 7. Constraints and gotchas — all of these have bitten

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied** by diffing the
  source. A mutation that silently did not apply looks exactly like a weak test — this happened
  twice in session 10, both times from PowerShell mangling quotes in `node -e`. **Write the
  mutation to a script file, or use the editor**, and have it print whether the anchor was found.
- **Date-dependent fixtures.** `honesty.spec.js` passed six days a week and failed on Sunday, on a
  commit that had not touched `src/` at all. If a fixture derives a weekday from `new Date()`, it
  will eventually land on a day the product does not support.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once and mangled 77 sequences in the spec. Use editor tools or `node -e`
  with explicit `'utf8'`. PowerShell's *console display* also shows mojibake for UTF-8 — that is
  the terminal, not the file. Verify with node before believing it.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s** (deliberate, `ctl` in App.jsx). It is a
  **conditional render**, so once hidden the buttons do not exist. Wake it with a real mouse move,
  or dispatch `mousemove` on `elementFromPoint` — **not** on `document.body` — and read the DOM in
  a **separate call**, because React re-renders asynchronously.
- **The browser console buffer persists across reloads AND across dev-server restarts.** A syntax
  probe run earlier in a session leaves "Failed to reload" errors for every importer of the probed
  file, looking current for the rest of the session. **Confirm health against the live DOM**, never
  the buffer.
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
- **An honest blank beats a confident wrong guess.** Applied five times across sessions 9–10 (the
  four zeros, the `0%` fill, the brand-preview NPS, the Floor board's rounds, and the rep count
  above 100). Keep applying it.

## 8. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 609 unit + 1 todo · 78 e2e · build ~648 KB**. CI runs the same chain on
Linux and is green; the Playwright-in-CI question was settled in session 6 — **do not
re-investigate**.

## 9. Suggested order for session 11

1. **§3A** — but read §4 first: the honest fix needs Dylan's call on starting a class from the
   Schedule. If he answers, build it; if not, do not loosen the match.
2. **Keep sweeping.** The CSV attendance backfill → members → retention chain, and Brand Studio →
   Room TV token propagation, are the two surfaces never driven end to end. This method has found
   every defect in sessions 3–10, including two in session 10 that unit tests could not see.
3. **I6** if you want the big structural win — it unblocks I9's 235 KB. Mind §6.
4. If Dylan unblocks anything in §4 it jumps the queue — especially **N4** and **OPS/backups**.
