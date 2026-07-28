# Jungle — Session 9 Build Prompt

`main = e4ab933`, pushed, deployed, tree clean. Gates green: **`lint:crash` 0 · 440 unit ·
41 e2e · build 631 KB**. App.jsx **5,989 lines**.

This file supersedes `SESSION-8-PROMPT.md` (now history). It was written after a full audit of
every doc in the repo against the actual code — the pending list in §3 is that audit's output, and
several long-standing doc claims turned out to be **stale in both directions**. Read §0 before
trusting any single document.

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

## 0. 🔴 Read this before trusting the docs

The docs are a **layered archive, not a single source of truth**, and the audit found real conflicts.
Ranked by reliability:

| Rank | Document | Trust |
|---|---|---|
| 1 | `SESSION-HANDOFF.md` (top block) + this file | Current. Written against the code. |
| 2 | As-built spec **§3 (design), §12 (backlog)** | Current — maintained as work ships. |
| 3 | As-built spec **§1, §2 (F1–F6), §4, §7b, §7c** | ⚠️ **STALE IN PLACES.** See below. |
| 4 | `AUDIT-FINDINGS.md`, `UI-UX-DIRECTION.md`, `REGRESSION-PLAN.md`, `PRODUCT-DIRECTION.md`, `LEGAL-AND-SECURITY.md`, `TECH-PLAN.md`, `GTM-SINGAPORE.md` | Dated 2026-07-19 Fable audits. Direction still good; **status columns are stale**. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL — do not plan from it.** Analyses App.jsx at 8,059 lines (July 5). Its "not started" EPICs (Floor TV, Brand Studio, Dashboard) are largely built. |
| — | `SPEC-PATCHES.md`, `SESSION-5/6/7/8-PROMPT.md`, `WEEK-PLAN.md` | Applied/history. Do not re-apply. |

**Specific stale claims caught in this audit — do not act on these without re-checking:**

- **Spec §1 and §2/F4 say "F4 capture UI is not built" and "Blocked on: approval of migration
  0007".** Both false. 0007 is applied, the coach roster sweep, the CSV backfill and Members CRUD
  all shipped. §1's table also still calls Phase 0.5 "steps 1–3 done" and App.jsx "~8,780 lines".
- **LEGAL §3 hole #2, AUDIT 2.4 and REGRESSION §3 #9 all list "I5 RLS tests 0001–0006" as open.**
  It is **DONE** — `supabase/tests/0001_0006_rls_selftest.sql` exists and Dylan has run it. §12 is
  the correct one here.
- **Spec §7c** lists N3 at-risk, "alert dismiss/acted state" and Members CRUD as "not started".
  All three shipped. §7c is the oldest backlog section; **§12 supersedes it.**
- **AUDIT 2.4 says "blueprint-driven parsing — defer, do after pilot"** while **§9/§12 call it the
  main build ahead.** It was **built this session** (`e4ab933`) as additive/zero-risk. ⛔ **The
  ranking disagreement is real and unresolved — see §4 item 1.**

**Recommended first action:** spend 20 minutes reconciling spec §1/§2/§7c against reality, or
mark them `HISTORICAL` like the Delta doc. Every session so far has paid a tax re-deriving this.

---

## 1. What session 8 shipped — `4cfaa16` → `e4ab933`, 9 commits, all pushed

| Commit | What |
|---|---|
| `689abf7` | **P2 — the 10-foot rule. DONE, and 🟡→✅.** Every member-facing display size (Overview/Floor/Coach) keyed to viewport **height** via `tvFont(basePx, mult)` = `clamp(floor, Nvh, cap)`. The vh term reproduces `basePx` **exactly at 1080p** (tuned look preserved) and grows ~2× on 4K. Fixes the real gap: fixed px made a "92px" timer 8.5% of a 1080p wall but ~4.3% of 4K. Floor board's phase timer was 84px — 7.8% at 1080p, already **under** the §3 floor — now ~8.9%. |
| `60a3f3c` | **Constrained-column audit CLOSED** (session 8's open question). Three synced columns — `persona_plans.source`, `coach_personas.kind`, `class_schedule_rules.repeat` — sat in the test's "not yet written" list but *are* written. No illegal value reached the DB, but that is the 2026-07-18 incident's exact shape. All three pinned in `store.js` constants the producing UI now maps over. |
| `a40cef1` | P2 regression extended to the **Floor board** at both resolutions. |
| `6f278fb` | **Interval sub-timer math covered** — `calcIntervalState` extracted to `src/lib/intervalTimer.js` + 18 exact-value tests (the spec's named "timer/stage math" gap). |
| `5dab0ae` | e2e wiring guard — the coach display renders a live Tabata overlay. |
| `503c534` | **Floor pacer extracted** to `floorPacer()` + 8 tests. Behaviour identical; prepares the seam for the honesty decision (§4 item 3). |
| `66488e2`, `e5cd3c5` | Handoff blocks. |
| `e4ab933` | **D2 — blueprint-driven parsing.** See §2. |

**Verified in the running app, not just tests:** P2 stress-checked at **375px / 1080p / 3840×2160**
on all three display surfaces — no horizontal overflow, no error boundary, primary element always
~8–9% of height (72px → 96px → 192px).

### The P2 regression, and why it is the template for future ones
`e2e/display.spec.js` drives the **real Room TV** at 1920×1080 **and** 3840×2160, finds the primary
element the way the eye does (largest on-screen text), and asserts it holds 8–12% of viewport height
at both **plus viewport-invariance**. It measures the §3 *property* rather than taking pixel
snapshots (which are brittle and prove nothing about legibility). Playwright is immune to the
"resize without reload" trap. **Mutation-verified**: fixing the timer back to px fails the 4K band
and the invariance check while 1080p still passes.

---

## 2. D2 — what shipped, and the one thing left in it

**Shipped (`e4ab933`):** `deriveHints` taught the parser a coach's *vocabulary*; the blueprint now
teaches it their *structure*. The case it fixes: a deck whose slots carry no role words. To the
letter rule `C1 / C2 / C3` is one superset; to the coach it is a warm-up, a circuit and a finisher
in sequence — and folding them collapses the class into a single block.

Applied **exactly where the parser would otherwise guess**:
- **AFTER** the slide's own explicit words (a slide saying "C1 Finisher" is *this* class; the
  blueprint is only the usual shape, so the slide always wins),
- **BEFORE** the structural fallbacks (letter/scheme/position),
- and it **vetoes the same-letter superset fold** when the blueprint names each member as its own
  non-superset slot — otherwise roles would be resolved onto a block that no longer exists.

It only ever *resolves* a block already on the slide — never invents, renames or creates one; a
malformed role is `ROLES`-checked and ignored. **Wired at both call sites** (paste-deck + Slides
import). `stats.blueprint` reports how many blocks it resolved, mirroring `stats.hinted`.
9 tests; both mechanisms mutation-verified; no blueprint ⇒ byte-identical output (pinned by test).

**⛔ Not done — the honest caveat:** this is verified against **fixtures**, not against The Garage's
real decks. The blueprint path only bites when a coach has a saved blueprint AND a deck with bare
slots. **Next session should drive a real deck through the Slides import with a blueprint saved and
confirm `stats.blueprint > 0` on real notation.** Until then D2 is "built and unit-proven", not
"proven on the corpus".

---

## 3. 📋 THE FULL PENDING LIST (the audit's output)

### 3A. Buildable now — no blocker, no decision needed

| # | Item | Source | Notes |
|---|---|---|---|
| **B1** | **Dashboard cold-start state** | UI-UX §2, Delta EPIC I | **Best next build.** `DashboardScreen` (`App.jsx:695`) computes 4 real stats from `sessionHistory` — so a brand-new gym sees **"0 · 0.0 · 0 · 0"**, which UI-UX §2 calls "reads as a dead product". Replace the pre-data KPI row with a **setup checklist** (bring in classes → run first class → import attendance). Pure client work; the empty-state pattern to copy is already in `RosterScreen`. |
| **B2** | **D4 — generation presets** | §12 "Now" | "Pick a blueprint and a preset, never type a prompt" (§9.3: presets are picked, not prompted). `draftFromBlueprint` already exists and is deterministic — this is the UI over it. Removes the last prompt-typing surface. |
| **B3** | **D2 real-corpus verification** | §2 above | Drive a real deck + saved blueprint through the import; confirm `stats.blueprint > 0`. |
| **B4** | **`class_instances` generator** | §7c | Nothing turns `class_schedule_rules` (recurring) into dated occurrences; the runner creates one ad hoc via `ensureClassInstance`. Needed before Schedule means anything. |
| **B5** | **Member CSV export** | LEGAL §1 | PDPA **access/correction** obligation. Import exists (`csvImport.js`); export does not. Small, and it is a compliance commitment in the DPA. |
| **B6** | **D3 completion** | §12, §9.1 | Class-type cold start shipped; the **persona-level** no-corpus surface is still open. |
| **B7** | Minor UI debt | UI-UX §2 | ENERGY CURVE bar labels truncate ("WARM-U", "CIRCUI") — rotate or dot-label. |
| **B8** | Accessibility open items | Spec §3 | No colourblind-safe palette reserved for future HR zones; no formal audit of info-encoded-by-colour outside the timer. |

### 3B. Structural debt — real, and explicitly deferred by session 8's prompt

| # | Item | Notes |
|---|---|---|
| **I6** | Decomposition stages **4–5** | Stage 4 = personas cluster → `src/screens/personas/`; stage 5 = Builder/Live/RoomTV behind a `useClassRunner()` hook. AUDIT 3.1 says "4–5 after the pilot". App.jsx is 5,989 lines. |
| **I9** | Code splitting | 631 KB single bundle, **no `React.lazy` anywhere**, loaded by a TV on gym Wi-Fi. AUDIT 3.3 says route-splitting is "nearly free" after the screens split. |
| **I10** | Delta writes | `save*` pushes the ENTIRE domain list on every change. AUDIT 3.2 wants this "before gym #2" for `persona_plans` + `attendance` — it is why one bad row once poisoned every plan. |
| **I8** | Client-side third-party access | RapidAPI key (coach pastes their own — F2 Gap 2 calls it "unshippable UX") + Deezer BPM. Needs a **server-side media proxy**; LEGAL §3 suggests hiding the field for the pilot. |
| — | Taxonomy LLM fallback (D1 remainder) | Deferred **by design** until a real corpus of blanks exists to batch. |
| — | `sync_incidents` telemetry | TECH-PLAN §6 — mirror SyncBanner failures server-side. Post-pilot. |

### 3C. Blocked on Dylan — infra, deploys, decisions

| # | Item | Blocker |
|---|---|---|
| **N4** | **Member magic-link summary** | Edge Function to issue a signed class token (design: LEGAL §4). **The only member-facing surface** and the carrier of the social artefact — PRODUCT-DIRECTION §5 calls it the #1 missing thing. Share-card half already shipped. ⛔ **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
| **F4-QR** | QR self-check-in | Edge Function. **Deferred and explicitly "do not promise"** (AUDIT 2.4) — the coach sweep is the pilot path. Never loosen RLS to `anon`. |
| **F1 + PAR-Q** | Session primitive / 1:1 path | New migration. P5 ("one primitive, two lenses") is unreachable without it. PAR-Q **must land in the same change** that introduces individualised load. |
| **I15** | persona LLM quality ceiling | Two secrets switch persona reasoning to Opus 4.8. Do it **before** ingesting a large corpus — re-extraction costs quota twice. |
| — | persona-ai **v8 redeploy** | Blocks verifying the blueprint→generate path. |
| — | Consent notice surface | Deliberately unbuilt: **no consent record may be written until a real notice exists**. Needs the legal template first. `recordConsent` exists and has **zero callers** — that is correct, not a bug. |
| — | N2 cohort analytics | Waiting on attendance **volume**, not on code. |
| **DEC** | 4 dead symbols | `nudgeForContrast`, `resolveSubBrand` (FR-H8), `SLOT_LABELS`, `fetchBpmData`. Each needs a yes/no; they should not sit flagged indefinitely. |
| **DEC** | `eslint-plugin-react` | The only in-tooling way to close the JSX blind spot (§5). New dev dep + CI gate change. |
| **DEC** | Sentry | New **sub-processor**; crash payloads carry member names → DPA question (LEGAL §6). |
| **DEC** | Floor-board pacer honesty | §4 item 3 below. |
| **OPS** | Staging Supabase + prod → **Pro** | Free tier has **no backups**. LEGAL §3 hole #1, "Day 1". Includes an actual **restore drill**. |
| **OPS** | UptimeRobot · lawyer (IP letter) · pricing | 5 min · S$1.5–3.5k, 2–4 wks · GTM §2 hypothesis untested. |

### 3D. Live-verification queue (unexercisable locally — needs Dylan)

1. **Live sync check ×3** — also exercises **I13** (kill Wi-Fi mid-write, restore, confirm re-push without a reload) and **I14** paging.
2. **Physical offline soak** — router off 5 min mid-class. **P7 flips to ✅ only after this.**
3. **Cross-device Room TV Follow** — coded, never verified; genuinely testable since the session-6 z-index fix.
4. **Install the PWA** on phone + room TV.

---

## 4. ⛔ Open decisions that need Dylan's call

1. **Is blueprint-driven parsing (D2) correctly ranked?** AUDIT 2.4 said defer-until-after-pilot;
   §9/§12 called it the main build. It shipped this session (additive, zero-risk). **If AUDIT 2.4
   was the live ranking, say so** — the next-best item is B1 (Dashboard cold start), and D4 would
   move up too.
2. **What is the actual next priority — polish the pilot path, or extend it?** PRODUCT-DIRECTION §5
   says the missing things are N4, cold start, mobile, offline proof, and a price. Mobile and
   offline-in-code are done; **N4 is blocked on you**, cold start is B1/B6, and pricing is yours.
3. **The Floor board's fabricated pacer.** `FloorLiveScreen` shows a WORK/REST countdown, round
   counter and rotation timer from **hardcoded** cadences (45s/15s, 8 rounds, 180s), *not* the
   coach's plan. For a non-interval class the room reads a **fake clock** — arguably the same
   member-facing-honesty problem as the "No tracks"/"coming soon" panels you cut. The maths is now
   extracted to a tested `floorPacer()`, so the fix has a clean seam either way: feed it
   `calcIntervalState`'s real phase for interval stages, and show a neutral honest state otherwise.

---

## 5. 🔴 The one thing that will still bite you: `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. This is the `9f71f61` class of bug the gate was built for, in the one form it
misses. It bit twice in session 6 and once in session 7.

**There is no known remaining JSX phantom** — session 7 resolved the last one
(`<SpotifySearchModal/>` → `TrackSearch`). Two guards:

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens.
   **If you add a screen, add it to that list.**
2. A scratch `@babel/parser` probe exists but is **not committed** (it leans on a *transitive* dep).
   Closing the gate in-tooling needs `eslint-plugin-react` — Dylan's call (§3C).

**Drive the real UI and assert the error boundary is ABSENT.** "Root has children" is not evidence:
the boundary renders a calm "Something broke", so a dead screen looks healthy to any weaker check.

---

## 6. Constraints and gotchas — all of these have bitten

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
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` once and mangled 77 sequences in the spec. Use editor tools or
  `node -e` with explicit `'utf8'`.
- **Resizing without reloading shows a stale layout** (produced a wrong finding in the Fable audit).
  Playwright is immune — it is why the P2 regression is trustworthy.
- **The Room TV mode switch auto-hides after 4.5s** (deliberate). Wake it with a real
  `page.mouse.move` first, or the click lands on a detaching element and reads like a flake. A JS
  `dispatchEvent` on `document.body` does **not** work — dispatch on `elementFromPoint`.
- **The browser console buffer persists across reloads.** Stale errors look current.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **`title` does not override text content for a button's accessible name** — use `aria-label`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`. One PIN digit per
  call. PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it.
- **PowerShell:** `npm.cmd` / `npx.cmd`; commit messages via `git commit -F -` + heredoc.
- **Revert `.claude/launch.json` before committing** if you change the port (a 2nd chat can hold
  :5173). It is currently correct at 5173.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are an
  advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

## 7. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 440 unit · 41 e2e · build ~631 KB**. CI runs the same chain on Linux
and is green; the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

## 8. Suggested order for session 9

1. **B1 — Dashboard cold-start state.** Highest value/risk ratio left that is unblocked: it is the
   first screen of every new gym, it is named in two separate audit docs, and it is pure client work.
2. **B2 — D4 generation presets.** Finishes the persona-depth arc (§9) and kills the last
   prompt-typing surface.
3. **B3 — D2 on a real deck**, if a corpus is to hand.
4. **B4/B5** — `class_instances` generator, member CSV export (compliance).
5. If Dylan unblocks anything in §3C, that jumps the queue — especially **N4**.
6. Otherwise: **aggressive regression testing**. The method that keeps working in this repo is
   *drive the real flow and read back the STORED object* — mutation-checked unit tests still missed
   4 real defects; every defect found in sessions 3–8 came from driving the UI, never from a unit
   test.
