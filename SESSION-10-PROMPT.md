# Jungle — Session 10 Build Prompt

Keep building. Clear what's left, and when the named backlog is empty keep going — find more in the
specs, then regression-test aggressively, then ship the good-to-haves. The goal is a full
end-to-end application.

`main = 9cafaf0`, pushed, deployed, tree clean. Gates green:
**`lint:crash` 0 · 573 unit + 1 todo · 78 e2e · build 648 KB**. App.jsx **5,824 lines**.

This file supersedes `SESSION-9-PROMPT.md` (now history) **except its §3C and §4** — the
blocked-on-Dylan list and the open decisions, which are still live and are reproduced in §4/§5 below.

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

Session 9 reconciled every stale claim in the docs and, more usefully, **wrote the trust ranking
into the spec itself (§0)**. Short version:

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. The only claim in this repo that cannot go stale silently. |
| 2 | `SESSION-HANDOFF.md` top block + this file | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | Maintained as work ships. **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | Corrected in session 9, each edit marked inline with its date. These are the sections that drift. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ It is **gitignored**, so its marker is local-only — the spec's §0 table carries the warning in a tracked file. |

**The durable fix is a test, not a tidier document.** Where session 9 could turn a disputed status
into an assertion it did. Keep doing that: if you find yourself arbitrating between two paragraphs,
write the test instead.

---

## 1. What session 9 shipped — `8037b43` → `9cafaf0`, 10 commits, all pushed

**Every unblocked item on session 9's pending list is done.**

| Commit | What |
|---|---|
| `4852a36` | **B1 — Dashboard cold start.** Four KPIs all derived from the SAME empty array, so a new gym's first screen read "0 · 0.0 · 0 · 0". Now a three-step checklist, gated on **sessions** rather than checklist completion — a gym running classes daily but never importing its roster gets its numbers plus one quiet line, never a setup card where its numbers belong. `src/lib/setupProgress.js` · 15 unit + 9 e2e |
| `f4efa03` | **B5 — member data export.** PDPA access (one member's record) + portability (whole roster). RFC 4180 quoting pinned by a **round-trip through the importer's own `parseCsv`**; leading `= + - @` guarded against spreadsheet formula execution; UTF-8 BOM. `src/lib/csvExport.js` · 39 unit + 6 e2e |
| `0fee0c1` | **D4 — generation presets.** Five named intents over the coach's own shape, each stating its effect **in numbers** before they commit. `src/lib/generationPresets.js` · 38 unit + 7 e2e |
| `7adadd1` | **B4 — publish a week.** Schedule rules → dated `class_instances`, idempotent on `(name, startsAt)`. `src/lib/scheduleInstances.js` · 33 unit + 6 e2e |
| `4720da2` | **B6 — the no-corpus cold start was already built**; proven by e2e, and a typo fixed on it |
| `a6e8643` | **Docs — every stale status claim reconciled** (the §0 action) |
| `99c2c67` | Regression: the runner's `class_instances` row |
| `701ec59` | **B8 — colour-only audit** + the number nothing ever set |
| `aab934f` · `9511695` | Parser name-pollution fixes · Brand Studio preview honesty |
| `9cafaf0` | Handoff |

### The rules those builds established — do not undo them

- **D4:** a preset may **REORDER** a slot's categories, **never ADD one.** Otherwise "heavier day"
  puts a deadlift in the warm-up — the exact bug the category ordering in `blueprints.js` exists to
  prevent.
- **B4:** publishing is **idempotent**. A duplicated occurrence splits one class's check-ins across
  two rows and nothing surfaces the split.
- **B1:** the KPI row returns when there is a class to **count**, not when setup is complete.
- **B5:** the exporter and importer are two halves of one format; the round-trip test is what stops
  them drifting.

---

## 2. 🔬 The method, and what it found — this is the most important section

**Five defects in session 9. Every one was found by driving the real flow and reading back the
stored object. None was visible to a unit test, and every one rendered perfectly while saying
something false.** That is now true of every defect found in sessions 3–9.

Two refinements worth stealing:

1. **Read back the DERIVED store, not only the one you just wrote.** Pasting a deck and inspecting
   the *plan* looked fine. Inspecting the **movement catalog** it aggregates into exposed two
   parser bugs at `confidence: 1`.
2. **Walk the whole journey in one pass**, not features in isolation. Three of the five were
   disagreements *between* parts: a blueprint field that was write-only end-to-end, two code paths
   writing different amounts of the same row, and a `%` shown everywhere for a field nothing sets.

What they were:

| # | Defect |
|---|---|
| 1 | "Short class" promised *38 → 25 min* and delivered the same length — **the Minutes field on the class shape card was write-only end-to-end** (`draftFromBlueprint` dropped it, `planToStages` fell through to a per-role default) |
| 2 | The Runner's `class_instances` row wrote `duration_min: null` on a class whose own header said "48:00 total". **Two doors into that table writing different amounts of the same permanent row** |
| 3 | **`fill` is never SET anywhere in the product** — no capacity field, no booking integration — so every class on every gym read "0%". That says "nobody came", not "we don't know" |
| 4 | The parser welded schemes onto movement **NAMES** (`Assault Bike 3x30s`, `Conventional Deadlift @RPE8`). The name is the aggregation key for the whole persona thesis, so each split one movement into two |
| 5 | Raw enums on the Builder (`warmup · 5:00`) and colour-only stage identity on the **member-facing** Room TV |

---

## 3. 📋 THE PENDING LIST

### 3A. ⛔ Take this first — the one defect session 9 found and deliberately did not fix

**A block header written `M1 — Deadlift` yields the block label `M1` AND a phantom exercise named
"Deadlift".** A block the coach wrote with one movement comes back with two, and the catalog gains a
movement that was never on a movement line. Reported at **`confidence: 1`** — the parser is fully
confident about output containing something it invented, which is precisely what §4.3.2 says must
never happen.

`slotKey()` in `blueprints.js` already reads that form as *slot M1 plus **this week's focus***, and
its comment says that was **"found by driving the real corpus"** — so the notation is real, it just
isn't in the three test fixtures. Note what that implies: the **LLM extractor** preserves the full
label, the **deterministic parser** flattens it to `M1` — the two extraction paths disagree about
the same deck, and `slotKey` exists to paper over it.

**Repro:** `parsePlanText("S360\nM1 — Deadlift\nConventional Deadlift 4x5")`
**Recorded as** an `it.todo` in `planParser.test.js` so it cannot be lost.

**Why it was deferred and what to do:** the fix changes **block segmentation** — the parser's most
delicate path, shared with D2's blueprint-driven resolution — and could not be checked against The
Garage's real decks. **It belongs with B3 (below); ship them together.**

Session 9 got as far as designing the fix. The investigation, so you don't repeat it:

- `afterLabel()` (`planParser.js:698`) returns whatever follows the slot token, and that becomes
  `rest[0]` — inline content. For `M1 Back Squat 5x5` that is correct and **load-bearing**; for
  `M1 — Deadlift` the separator says the suffix is a theme.
- **The separator alone is not the signal.** The real rule is whether the suffix is the block's
  *only* movement-shaped content. If it is, it IS the movement (never lose the only one). If other
  movement lines follow, it is a focus label.
- Proposed detector, mirroring `slotKey`'s own contract exactly:
  `/^([A-Z])(\d{1,2})\b(?:\s+[—–-]\s+|:\s*)(.+)$/`
- **None of the S360 / GC / ENDURO fixtures match it**, so all 58 existing parser tests should be
  untouched — verify that, it is the safety argument.
- Still run `foldScheme` on the skipped header line so a scheme written there (`M1 — Deadlift 5x5`)
  is not lost.
- Open question worth a decision: should `blockLabelOf` **preserve** the full `M1 — Deadlift` label
  (making the deterministic and LLM paths agree, and letting `slotKey` do the job it was written
  for)? Safe as far as checked — `slotKeyNorm` strips dashes, and the superset fold matches
  `SLOT_RE` at the start of the string — but it changes what every UI shows for these blocks.

**Smaller, same area, also unfixed:** the plan title comes out **"S360 — S360 — Week 4"** when the
deck header already contains the class type.

### 3B. Buildable now — no blocker, no decision needed

| # | Item | Notes |
|---|---|---|
| **B3** | **D2 real-corpus verification** | Drive a real deck through the Slides import with a blueprint saved; confirm `stats.blueprint > 0` on real notation. D2 is "built and unit-proven", **not** "proven on the corpus". **Pair with 3A.** |
| **I10** | **Delta writes** | `save*` pushes the ENTIRE domain list on every change. AUDIT 3.2 wants this **before gym #2** for `persona_plans` + `attendance` — it is why one bad row once poisoned every plan. **The only structural-debt item that is about data loss rather than tidiness.** |
| **I9** | **Code splitting** | **648 KB and still growing**, no `React.lazy` anywhere, loaded by a TV on gym Wi-Fi. Note `src/music/` is shipped to every device and never runs (`FLAGS.music` false) — but `useSpotify` is called unconditionally as a hook, so it is not a trivial lazy-load. Measure before assuming. |
| **I6** | Decomposition stages 4–5 | Stage 4 = personas cluster → `src/screens/personas/`; stage 5 = Builder/Live/RoomTV behind a `useClassRunner()` hook. AUDIT 3.1 says after the pilot. App.jsx 5,824 lines. **If you do this, mind §6 — it is exactly the change that has twice shipped a dead screen past a green gate.** |
| — | Taxonomy LLM fallback (D1 remainder) | Deferred **by design** until a real corpus of blanks exists. Session 9 pinned its visible cost: common warm-up names ("Arm Swings", "Cat Cow") return no category, and the drafter correctly **leaves them out** rather than guessing — so the gap shows up as thinner warm-ups, not wrong ones. |
| — | `sync_incidents` telemetry | TECH-PLAN §6. Post-pilot. |
| — | I8 server-side media proxy | RapidAPI key (coach pastes their own — "unshippable UX") + Deezer BPM. LEGAL §3 suggests hiding the field for the pilot. |

### 3C. ⛔ Blocked on Dylan — infra, deploys, decisions

_Unchanged from session 9 §3C. Nothing here moved, because none of it can move from this machine._

| # | Item | Blocker |
|---|---|---|
| **N4** | **Member magic-link summary** | Edge Function to issue a signed class token (design: LEGAL §4). **The only member-facing surface** and the carrier of the social artefact — PRODUCT-DIRECTION §5 calls it the #1 missing thing, and it is the **last Phase-1 gap**. Share-card half already shipped. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
| **OPS** | **Staging Supabase + prod → Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill** — an untested backup is a hope. |
| **F1 + PAR-Q** | Session primitive / 1:1 path | New migration. `class_instances` now exists **and is generated**, so one side of the XOR is real; `session_assignments` is not. P5 unreachable without it. PAR-Q **must land in the same change** that introduces individualised load. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus — re-extraction costs quota twice. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| **F4-QR** | QR self-check-in | Edge Function. **Deferred and explicitly "do not promise"** (AUDIT 2.4). Never loosen RLS to `anon`. |
| — | Consent notice surface | Deliberately unbuilt: **no consent record may be written until a real notice exists.** `recordConsent` has **zero callers** — that is correct, not a bug. |
| — | N2 cohort analytics | Waiting on attendance **volume**, not code. |
| **DEC** | 3 dead symbols | `nudgeForContrast`, `resolveSubBrand` (FR-H8), `fetchBpmData`. (`SLOT_LABELS` still sits unreferenced in `CalendarScreen`.) Each needs a yes/no. |
| **DEC** | `eslint-plugin-react` | The only in-tooling way to close the JSX blind spot (§6). New dev dep + CI gate change. |
| **DEC** | Sentry | New **sub-processor**; crash payloads carry member names → DPA question (LEGAL §6). |
| **DEC** | Floor-board pacer honesty | §5 item 1 below. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### 3D. Live-verification queue (unexercisable locally — needs Dylan)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push
   without a reload) and **I14** paging.
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified.
4. **Install the PWA** on phone + room TV.

---

## 4. ⛔ Open decisions that need Dylan's call

1. **The Floor board's fabricated pacer.** `FloorLiveScreen` shows a WORK/REST countdown, round
   counter and rotation timer from **hardcoded** cadences (45s/15s, 8 rounds, 180s), *not* the
   coach's plan. For a non-interval class the room reads a **fake clock** — the same
   member-facing-honesty problem as the "No tracks"/"coming soon" panels that were cut. The maths is
   extracted to a tested `floorPacer()`, so the fix has a clean seam: feed it `calcIntervalState`'s
   real phase for interval stages, and show a neutral honest state otherwise.
2. **Pricing.** Still yours. GTM §2's hypothesis is untested.
3. **Should `blockLabelOf` preserve the `M1 — Deadlift` label?** See §3A.

---

## 5. What is DONE that older docs may still call open

Session 9 corrected these in the docs, but they are worth stating plainly so nobody re-derives them:

- **F4 attendance is BUILT** — coach sweep, CSV backfill, Members CRUD, P6 instrumentation, and now
  export. Phase 1 is done except N4.
- **I5 RLS tests for `0001`–`0006`** — `supabase/tests/0001_0006_rls_selftest.sql` exists and has
  been run. Three separate docs called this open.
- **N3 at-risk + the acted/dismissed ledger** — live, with `0008` applied.
- **D3 cold start (both levels)** — proven by e2e.
- **B7 (ENERGY CURVE truncation) is MOOT** — verified: it lives inside `subTab === "music"`,
  reachable only when `FLAGS.music` is true. Note the curve is also a **hardcoded decorative SVG,
  identical for every class**, under a label reading "peak intensity" — theatre, if music ever
  un-quarantines.

---

## 6. 🔴 The thing that will still bite you: `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. This is the `9f71f61` class of bug the gate was built for, in the one form it
misses. It bit twice in session 6 and once in session 7.

**There is no known remaining JSX phantom.** Two guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to that list.**
2. Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call (§3C).

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to any weaker check.

**Related, and it caught me twice in session 9:** a `{/* comment */}` as the **first child inside
`&& ( … )`** is a JSX parse error — the gate *does* catch that one. Put the comment above the `{`.

---

## 7. Constraints and gotchas — all of these have bitten

- **No infra changes without asking Dylan.** Sentry = sub-processor; `eslint-plugin-react` = gate
  change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write a
  new one.** Trap it documents: `members.status = cancelled` (two Ls) vs
  `entity_status = canceled` (one L). Only `consent_records.{scope,method}` remain unguarded, and
  correctly so — nothing calls `recordConsent` yet.
- **Mutate the code to prove a test can fail**, and confirm the mutation applied by comparing
  against the original text. A mutation that did not apply looks exactly like a weak test.
  Session 9 caught a **worthless test** this way: the Coaches-screen marker was `/Coaches/`, which
  matches the **sidebar button present on every screen** — sending "Add a class" to the Schedule
  instead passed cleanly. Pick a marker only that screen renders.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once and mangled 77 sequences in the spec. Use editor tools or
  `node -e` with explicit `'utf8'`. (PowerShell's *console display* also shows mojibake for UTF-8 —
  that is the terminal, not the file. Verify with node before believing it.)
- **Resizing without reloading shows a stale layout** (produced a wrong finding in the Fable audit).
  Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s** (deliberate). Wake it with a real
  `page.mouse.move` first. A JS `dispatchEvent` on `document.body` does **not** work — dispatch on
  `elementFromPoint`.
- **The browser console buffer persists across reloads.** Stale errors look current.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`title` does not override text content for a button's accessible name** — use `aria-label`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it.
- **PowerShell:** `npm.cmd` / `npx.cmd`. **Commit messages: write the message to a file and use
  `git commit -F <file>`** — piping a here-string into `git commit -F -` fails in this shell.
- **Revert `.claude/launch.json` before committing** if you change the port. Currently correct at 5173.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.** Session 9 applied this three times (the four
  zeros, the `0%` fill, the NPS in the brand preview). Keep applying it.

## 8. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 573 unit + 1 todo · 78 e2e · build ~648 KB**. CI runs the same chain on
Linux and is green; the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

## 9. Suggested order for session 10

1. **3A + B3 together** — the `M1 — Deadlift` phantom movement, verified against a real deck. It is
   a live correctness defect on the USP, the design work is done, and the two halves need each other.
2. **I10 — delta writes.** The only unblocked structural item that is about data loss.
3. **I9 — code splitting.** Measure first; the music quarantine is not as easy a win as it looks.
4. If Dylan unblocks anything in §3C it jumps the queue — especially **N4** and **OPS/backups**.
5. Otherwise: **keep driving flows and reading back stored objects.** It found five defects in
   session 9 and has found every defect in sessions 3–9. Surfaces not yet swept end to end:
   the **Google Slides import** path, **share card** generation, and the **Room TV Follow** path.
