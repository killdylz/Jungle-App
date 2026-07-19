# Jungle — Functional, Design & Technical Specification (As-Built)

**Status:** Living document · **Last verified against the codebase:** 2026-07-19 (`main` = `73068dc`)

**Contents:** §1 where we are · §2 Functional (F1–F6) · §3 Design (P1–P7) · §4 Technical
(incl. **§4.3.1 why extraction uses an LLM and why it mostly shouldn't**, **§4.3.2 how the
parser works**) · §5 deprecations · §6 N1–N12 · §7 next moves · **§7b infra backlog** ·
**§7c feature backlog** · §8 open questions · **§9 persona depth — the main build ahead** ·
**§10 platform strategy (web/desktop/mobile)** · **§11 UI language** ·
**§12 full feature backlog** · **§13 open questions for the Fable review**

> **The one-line frame for everything below:** Jungle is an **experience layer**. Every item is
> judged by whether it makes life better for the **trainer**, the **gym owner** or the **member**.
> A feature that improves none of those three lives is theatre — and this codebase has a
> documented history of deleting theatre rather than shipping it (`cb6e77f`).
**Companion to:** `Jungle - Stress-Test Verdict & Architecture Spec (Fable).md` (2026-07-11, Fable)

---

## 0. How to read this document

The Fable spec is the **architectural verdict** — the MODIFY direction, the reasoning, the
assumptions, the kill criteria. It is a dated review artifact and is **not edited**; its §2/§3/§4
describe the product as *specified*.

This document describes the product as *built*, section-for-section against those same headings,
so the two can be diffed directly. Where the build has diverged from the spec, the divergence is
stated with its reason rather than quietly normalized.

**Status vocabulary — used precisely:**

| Mark | Meaning |
|---|---|
| ✅ **Built** | Implemented and exercised. Verification noted where it isn't obvious. |
| 🟡 **Partial** | Real code, real value, but the spec's acceptance criteria are not all met. What's missing is named. |
| ⛔ **Not started** | No implementation. |
| 🚫 **Gated** | Deliberately not built — waiting on a decision, a migration, or an earlier phase. |
| 🎭 **Flagged off** | Built as mock/theatre, hidden behind a flag so it cannot be demoed as real. |

**A standing caution for anyone using this doc to plan:** a screen existing is not a feature
working. Six of this codebase's surfaces rendered convincingly while presenting fabricated data,
and were flagged off in `cb6e77f` for that reason. Status marks here refer to *honest, real-data*
functionality.

---

## 1. Where we actually are

| Fable phase | State | Evidence |
|---|---|---|
| **0 — De-risk** | ✅ Done | All six mock surfaces flagged off (`src/config/flags.js`, all default `false`). Deploy verification in place. Residual: `MusicProvider` shell never built — but N5's user value shipped without it, so it is now a refactor, not a blocker. |
| **0.5 — Split slice** | 🟡 Steps 1–3 done | `src/data/`, `src/lib/store.js`, `src/ui/primitives.jsx` all extracted. Steps 4 (screens) and 5 (music quarantine) open. `App.jsx` is **~8,090 lines**. |
| **1 — Data foundation ★** | 🟡 ~90% | Migrations `0001`–**`0007`** applied; RLS on every table (`0007`'s verified 11/11); Realtime room channels live; local-first sync across all 14 domains. **F4 schema is in — its capture UI is not.** Magic-link member view (N4) still missing. |
| **2 — Make theatre real** | 🟡 **Unblocked, waiting on volume** | The blocker is gone: the coach roster sweep (slice 1) and the CSV backfill (slice 2, `e992d42`) both write real attendance rows, and a studio can now bring its whole history across on day one instead of accumulating it a class at a time. What N2/N3 wait on is no longer a feature — it is enough rows to compute a curve from. |
| **3 — Experience deepening** | 🟡 Partly done early | P1/P2 display work ✅, WCAG-AA in Brand Studio ✅, reduced-motion ✅, tempo guide ✅. BLE spike and Garmin application not started. |
| **4–5** | ⛔ Not started | Correctly gated behind consent foundation and validation. |

**The single structural fact that governs the roadmap:** F4 attendance is unbuilt, and it is the
spine. Fable states it three ways — *"capture is F4 and sits on the critical path; dashboards are
downstream consumers"*, MODIFY pillar **M2**, and assumption **A7** whose failure is kill
criterion #3. Everything in Phase 2, the entire $349–499 outcome tier, an honest active-members
number, the floor-board roster, and the member summary all wait on it.

---

## 2. Core functional specification

### F1 — Session/assignment primitive · 🟡 Partial (group only)

**Built:** A class is an array of stages, each with exercises, durations, type and optional
tracks. Classes persist through `store.getUserClasses()/saveUserClasses()` and sync to Postgres.
Completed sessions append to `session_history` (insert-only RLS — history genuinely cannot be
rewritten).

**Not built — and this is the spec's actual acceptance criterion:** there is no
`session_assignments` table, no `class_instances`, and **no 1:1 path at all**. The spec's test —
*"`session_assignment` targets a `class_instance` XOR a `member` — no parallel tables"* — cannot
currently be run because neither side of the XOR exists. Templates also do not snapshot on
publish; editing a template today does not mutate delivered history only because history is a
separate append-only log, not because a snapshot boundary was designed.

**Consequence:** the PT/1:1 market and the "one primitive, two lenses" design principle (P5) are
both unreachable until this lands. It arrives naturally with the F4 migration, since
`class_instances` is on both critical paths.

### F2 — Programming & builder (AI-drafted, coach-approved) · ✅ Built, with two gaps

**Built:**
- Class Builder with stage/exercise editing, `WORKOUT_LIBRARY` (`src/data/library.js`), class-type
  stage templates, and a template library (`src/data/templates.js`).
- **`smart-build` Edge Function** — server-held key, thin client. LLM class-gen and brand-gen.
- **Coach personas (workstream D)** — the deepest divergence from the original spec, and a
  favourable one. A persona is an individual coach; class type (S360/GC/Enduro) is a dimension
  within them. `persona-ai` extracts a coach's historical decks into a structured block/scheme
  corpus, derives a per-class-type style profile and movement catalog, and generates new plans
  in that coach's style with category discipline and novelty steering against a generation ledger.
- **Google Slides connector** — reads a coach's own Drive folder, splits multi-class decks per
  slide, extracts each independently.
- **Coach-approval gate holds by construction:** every generated plan lands in the Builder as a
  draft. Nothing auto-publishes and no LLM output reaches a member surface unreviewed.

**Gap 1 — PAR-Q screen: ⛔ not built.** The spec makes this a hard gate before any *individualized*
load prescription. It is not currently load-bearing because there is no 1:1 path (F1) — but it
must land in the same change that introduces one, not after.

**Gap 2 — exercise media: 🟡 still on the user's own API key.** `App.jsx:5537` still asks the
coach to *"Paste your ExerciseDB (RapidAPI) key"*, and `App.jsx:433/441` calls RapidAPI directly
from the browser. The spec calls this "unshippable UX" and specifies a server-side media proxy.
Still open.

### F3 — In-room delivery · ✅ Built (strongest area)

- **Live runner** — stage control, timers, auto-advance, ±10s/±30s nudges, keyboard control.
- **`RoomTV`** — one fullscreen surface, three modes (Plan / Floor / Coach), transient overlay
  with 10-foot-sized controls that auto-hides after 4.5s.
- **Realtime room channels** (`src/lib/room.js`) — the organ Fable identified as missing. The
  runner broadcasts state on a 1/s tick over a `room:{gymId}` channel; a TV on another device
  joins with **Follow** (green dot = receiving, amber = waiting, staleness banner past 10s).
  *Not yet verified cross-device — needs two signed-in devices. This is the one claim in F3 that
  is coded but unproven.*
- **P1 "now over next"** — current move at 24px/800 (34px solo), "Doing Now" heading, UP NEXT
  band with next stage, colour dot, minutes and up to 3 upcoming moves.
- **Reduced-motion** — `prefersReducedMotion()` suppresses looping pulse animations across
  RoomTV, DisplayScreen, FloorLive and the Live runner.
- **Tempo guide (N5)** — silent visual metronome pulsing at the stage's target BPM when nothing
  is streaming. Zero licensing exposure, which is the entire point.

**Gap:** the spec requires a display to *"survive Wi-Fi loss for a full class (local cache)"*.
localStorage holds the class, but there is **no explicit display-side session cache with a
reconnect path**, and no soak test. Treat P7 as unproven for displays.

### F4 — Attendance capture · 🟡 Schema APPLIED + RLS verified; capture UI not built

**Applied 2026-07-18 — migration `0007`.** `members`, `class_instances`, `attendance`
(insert-only) and `consent_records` (append-only) are live, gym-scoped and RLS-protected.

**RLS verified against the real project, not assumed.** `supabase/tests/0007_rls_selftest.sql`
impersonates a real signed-in user via `role authenticated` + `request.jwt.claims` — necessary
because the SQL editor runs as a superuser and *bypasses RLS*, so the naive form of this test
passes trivially and proves nothing. **11/11 PASS, zero SKIP** (the account is not a platform
admin, so the cross-tenant checks genuinely executed): cross-gym isolation on all four tables;
a normal gym member can still record attendance; `UPDATE`/`DELETE` on attendance and consent
affect zero rows; a cross-gym insert is rejected; the `source` CHECK bites.

*Not covered by that suite, so it isn't mistaken for total coverage:* the `members_delete`
admin-only policy, multi-gym membership, and the QR/anon write path (see the gap below).

**Still to build — the whole client side:** `store.js` domains for the four tables, QR
self-check-in, the coach roster sweep in the Live runner, and CSV backfill.

**⚠️ Known gap, documented in the migration:** QR self-check-in **cannot write through these
policies**. Every policy requires an authenticated staff user, and a member scanning the room
screen is on their own phone — not an auth user, which is the entire point of
members-as-roster-rows. `source='qr'` needs an Edge Function holding the service-role key that
validates a short-lived, class-scoped token. **The wrong fix is loosening the policies to
`anon`.** `source='coach'` (roster sweep) and `source='import'` (CSV) work against these
policies today, so F4's first slice is not blocked — and the coach sweep may be the real <5s
path anyway (§8 Q2).

**Prerequisite now cleared (2026-07-18):** QR codes generate **locally** (`src/lib/qr.js`,
`qrcode` package), replacing `api.qrserver.com`. This was a deprecation-list item precisely
because a third party must not sit in the check-in path and no member-identifying payload should
transit someone else's URL. Verified in-browser: 240×240 PNG data URL, correct brand palette,
works offline.

**Blocked on:** approval of migration `0007`. Proposed shape in §4.1 below.

**Design law that must govern the build: P6 — check-in ≤5 seconds per member.** Above that,
coaches skip it, attendance starves, and the thesis is decapitated (A7 / kill criterion #3). This
is a *measured* requirement, not an aspiration: instrument check-in duration from day one and
treat the pilot's check-in rate as the #1 metric.

### F5 — Retention analytics + at-risk loop · ⛔ Blocked on F4

`AnalyticsScreen` exists but is 🎭 flagged off (`mockAnalytics`) because its KPIs were fabricated.
Keep the layout as the Phase-2 target; rebuild on real data.

Worth restating because it is easy to get wrong under delivery pressure: **at-risk v1 is SQL, not
LLM.** Two transparent rules (<4 visits in month one; 14-day absence). The LLM drafts the win-back
message and explains the flag — it does not decide who is at risk. An operator must be able to
trust the rule and a lawyer must be able to read it.

### F6 — White-label brand system · ✅ Built for staff surfaces, ⛔ absent for member surfaces

**Built:** Brand Studio (the strongest single asset), preset skins, custom token editing, per-gym
branding and logos, `brand_profiles` sync with `active_skin_id`, and a **live WCAG-AA contrast
audit** on token pairs — compliance turned into a feature, exactly as specified.

**Gap:** the spec's purpose sentence is *"the member experiences the studio's brand"* — and there
is **no member-visible surface at all** today. The magic-link view (N4) is unbuilt and the legacy
b64-in-URL attendee view is flagged off. The auto-generated per-gym privacy/consent page is also
unbuilt. So F6's *acceptance* is met on staff surfaces and untested where it actually matters.

---

## 3. Design specification

| # | Principle | State | Notes |
|---|---|---|---|
| **P1** | Now over next | ✅ | Current move ≥60% weight on the coach display; UP NEXT peripheral. |
| **P2** | The 10-foot rule | 🟡 | `DISPLAY_PRESETS`/`FONT_SCALES` exist and sizes were raised, but there are **no enforced minimums** and no 1080p/4K snapshot regression. Still "gestures at" the rule, as Fable put it. |
| **P3** | Brand-forward, coach-neutral | 🟡 | Staff surfaces neutral ✅; member surfaces don't exist yet, so the half that matters is untested. |
| **P4** | Zero-touch room | ✅ | Auto-advance + phone-as-remote + Realtime Follow. |
| **P5** | One primitive, two lenses | ⛔ | No 1:1 lens (see F1). |
| **P6** | Capture costs <5s | 🚫 | Awaiting F4. **Must be instrumented, not assumed.** |
| **P7** | Degrade gracefully | 🟡 | localStorage-first everywhere and QR now generates offline; but no display-side session cache with a verified reconnect path. |

**Accessibility — built:** WCAG-AA contrast enforced at token-selection time in Brand Studio;
reduced-motion honoured on every looping animation across all four display surfaces; timer state
carries a colour cue *and* position/shape, not hue alone.

**Accessibility — open:** no colourblind-safe palette reserved for future HR zones; no formal
audit of information-encoded-by-colour outside the timer; display font minimums unenforced.

---

## 4. Technical specification

### 4.1 Data model — as applied

**Applied and live (migrations `0001`–`0006`).** Every table is gym-scoped with RLS.

| Migration | Tables |
|---|---|
| `0001` auth foundation | `gyms`, `locations`, `profiles`, `memberships`, `allowlist_entries`, `subscriptions`, `audit_events` |
| `0002` RBAC write hardening | Per-verb policies on `memberships` + `allowlist_entries` |
| `0003` Phase-1 domain | `class_schedule_rules`, `library_overrides`, `brand_profiles`, `session_history` *(insert-only)*, `user_prefs` |
| `0004` | `brand_profiles.active_skin_id` |
| `0005` coach personas | `coach_personas`, `persona_plans`, `persona_movements` |
| `0006` | `persona_generations` (recommendation ledger) |
| `0007` **the F4 spine** | `members`, `class_instances`, `attendance` *(insert-only)*, `consent_records` *(append-only)* — applied + RLS-verified 2026-07-18 |

**Specified but NOT yet applied:** `session_templates`, `sessions`, `session_assignments`,
`exercises_custom`, `music_prefs`, `device_connections`, `biometric_samples`, `export_jobs`.

**Migration `0007` — APPLIED 2026-07-18. Scope deliberately narrow (§8 Q1, decided):** four
tables only. The session primitive (`sessions` / `session_assignments` with the
`class_instance` XOR `member` constraint, F1) is **not** included; `class_instances` is shaped so
that layer can be added later *without altering existing columns*.

| Table | Key fields | Notes |
|---|---|---|
| `members` | `gym_id`, `name`, `email?`, `status`, `joined_at` | **Roster rows, not auth users.** This is what makes attendance capture require zero member adoption. |
| `class_instances` | `gym_id`, `starts_at`, `coach_id`, `format` | A class *occurrence*. Explicitly **not booking** — no reservation, no payment. The no-CRM line in schema form. |
| `attendance` | `class_instance_id`, `member_id`, `source: qr\|coach\|import`, `checked_in_at` | **Immutable** — insert-only RLS, same pattern as `session_history`. |
| `consent_records` | `member_id`, `gym_id`, `scope`, `policy_version`, `method`, `granted_at`, `withdrawn_at` | Append-only. Ships in Phase 1 **even though biometrics don't** — cheap insurance, MHMDA-shaped. |

*Design note carried from Fable:* graduated consent scopes. `roster/attendance` is notice-level
now; `biometric_live`, `biometric_store`, `coach_view`, `export` are explicit opt-in later.

### 4.2 Local-first sync architecture — ✅ built, and worth stating precisely

This is the chosen architecture and **not** a staging post toward an async rewrite:

- `store.js` keeps a **synchronous** API. localStorage is the instant, offline read layer.
- Every `save*` additionally fires a **background upsert** to Postgres.
- `hydrate*()` pulls server → local once on mount. **Server wins**; an empty server is seeded
  from local.
- Every sync path **no-ops** when Supabase is off or no gym is resolved — so the plain
  localStorage build is byte-for-byte unaffected. This is what makes the no-Supabase build a
  genuine test path rather than a degraded one.

14 domains route through it: `jungle_user_classes`, `jungle_library_custom`, `jungle_skin`,
`jungle_custom_skin`, `jungle_gym_branding`, `jungle_history`, `jungle_disp_prefs`,
`jungle_tmpl_tracks`, `jungle_exdb_key`, `jungle_crossfade`, `jungle_personas`,
`jungle_persona_plans`, `jungle_persona_movements`, `jungle_persona_generations`.

**Deliberately excluded:** Spotify tokens and derived caches — see the deprecation status below,
where their exclusion is a known violation rather than a design choice.

### 4.3 LLM services — ✅ built

Two JWT-verified Edge Functions, both holding their keys server-side:

- **`smart-build`** — class-gen and brand-gen.
- **`persona-ai`** — `task:"extract"` (deck text → structured plan), `task:"extract_batch"`
  (N slides in one call), `task:"generate"` (in-style new plan).

**Provider routing:** `PERSONA_LLM_PROVIDER` → shared `LLM_PROVIDER` → `gemini`. Currently on the
**free Gemini 2.5 Flash** path with a fallback sweep (2.5-flash → 2.0-flash → 2.0-flash-lite; each
model has its own quota) plus time-budgeted retry with backoff inside the ~150s gateway window.
Upgrading persona reasoning to Opus 4.8 is a two-secret change (`PERSONA_LLM_PROVIDER=anthropic`
+ `ANTHROPIC_API_KEY`) that does not touch `smart-build`.

**Extraction economics — the constraint that shapes the design.** The free tier meters per
*request*, not per token. One call per slide meant an 18-slide deck cost 18 calls and drained the
daily quota in a single import. Current design:

1. **Batch** ~5 slides per call (`extract_batch`, 32k output ceiling), falling back to per-slide
   if a batch fails — so batching is an optimisation that can never cost an import.
2. **Pre-filter** non-class slides client-side before spending a call. Conservative by
   construction: a scheme word keeps a slide at *any* length, because a real slide can be 34
   characters and a naive length floor silently discards it.
3. **Fast-fail on daily exhaustion**, distinguished from a per-minute rate limit — the latter is
   worth waiting out, the former resets at ~midnight Pacific and retrying just hangs the import.
4. **Commit per batch**, so a long import is crash-safe.

**Hard rules that remain non-negotiable:** coach approval before any member-visible output;
PAR-Q before individualized load; prompt-injection hygiene on member-supplied text entering
prompts; **at-risk scoring is SQL, not LLM**.

#### 4.3.1 Why extraction uses an LLM at all — and why it mostly shouldn't

Worth stating plainly, because "importing from Google Slides" sounds like it should be a data
transfer and is not.

**The Slides API returns text, not data.** A deck is a bag of text runs with positions. Every
fact that makes a slide *structured* — that `M1` is the primary lift, that `A1`/`A2` are a
superset pair, that `5x5` is sets×reps, that `12-10-10-8` is a rep ladder, that `3min` is 180
seconds, that `DB` means dumbbell — lives only in the coach's typographic convention. Something
must infer structure from prose. Today the LLM does **all** of it.

**Most of it does not need an LLM.** Walking the rules in `EXTRACT_SYSTEM`, the majority are
pattern-matching a parser handles deterministically: rep ladders, `3x10`, minutes→seconds, RIR,
RPE (including range→midpoint), A1/A2 pairing by label prefix, role assignment from label +
keyword, per-side and regression markers. Non-programming slides are *already* filtered
client-side by `looksLikeClassSlide` without any model.

**The decisive fact: these are HOUSE FORMATS.** S360, GC and Enduro are the same notation
repeated weekly across dozens of decks. This is not arbitrary natural language — it is a
consistent private grammar, which is the textbook case for a parser rather than a language model.

**What the current design costs:**

| Cost | Detail |
|---|---|
| Quota | Every slide (now every batch) spends a metered free-tier request |
| Latency | A network round trip and model inference per batch, vs. microseconds |
| **Non-determinism** | **The real problem.** Re-importing the same deck can yield different output than last time. The corpus feeds a derived *style profile*, so extraction drift becomes persona drift — the coach's "learned style" quietly changes without the coach changing anything |
| Testability | A model's output can't be pinned by a unit test; a parser's can |

**Recommended architecture — deterministic-first, LLM fallback.** A parser attempts each slide
and emits a **confidence**; only low-confidence slides fall through to Gemini. Expect ~70–90% of
slides in an established house format to parse for free, instantly, reproducibly and under unit
test, with the model reserved for genuinely idiosyncratic notation. Critically, the parser must
**never silently guess** — below threshold it defers rather than inventing structure.

A further step once a coach has a corpus: their notation is now *known*, so per-coach parse
hints can be derived from already-extracted plans, pushing the deterministic share higher over
time. The LLM becomes the cold-start tool it is good at being, not the steady-state engine.

#### 4.3.2 ✅ BUILT (2026-07-18, `fadf318`) — how the parser actually works

`src/lib/planParser.js`. Pure functions, no I/O, importable by the Edge Function later.

**Pipeline.** Header pass (class type / focus / date) → block segmentation on label notation
(`Warm Up`, `M1`, `A1`, `C3`, `AMRAP 12min`) → per-block scheme folding and exercise parsing →
same-letter slot folding into supersets → confidence scoring.

**Confidence is coverage-accounted**, which is what makes "never silently guess" enforceable
rather than aspirational: every input line is either claimed by a rule or recorded in `reasons`
as unclaimed, and unclaimed lines carry a penalty. Structural checks stack on top (a block with
no exercises hard-zeros the score). Below `PARSE_THRESHOLD` the caller **must** defer.

**Two disambiguations do most of the work**, and both were wrong in the first draft:

| Ambiguity | Resolution |
|---|---|
| `A1`/`A2` (an S360 superset **pair**) vs `C1`/`C2`/`C3` (a GC **sequence**) — identical shape to a naive letter rule, opposite meaning | A run folds into a superset only if it is 2–3 members, **all "plain"** (no member names its own role, e.g. `C1 Warm Up`), and all carry movements. Folding GC's three stages into one superset destroyed the entire class structure. |
| Role assignment | Keyword **first**, then scheme type, then the lettered-slot convention. GC labels its warmup `C1`, so the word "warm up" has to beat the letter rule. |

**Testing.** 40 unit tests. Every behaviour was mutation-checked — and it mattered twice. One
test was **vacuous**: the unparsed-line penalty could be deleted with the suite still green,
because the coverage ratio alone carried the assertion. Isolating it also surfaced a real bug
(coverage double-counted exercise lines, pinning half-understood slides at 1.0). Separately,
driving the **real UI** found three defects no fixture caught — `DB Bench Press` tagged
`barbell`, a bare `Finisher` line entering the movement catalog as an exercise, and a set count
inferred from ladder length overriding the coach's stated "3 rounds".

**Deliberate non-goal: blank beats a guess.** Unresolvable equipment stays `""`. The movement
catalog already flags blank equipment as "needs equipment" for the coach to fill in, which is
strictly better than a confident wrong value silently skewing aggregation.

**✅ Per-coach parse hints — BUILT (`9bb39e9`).** `deriveHints(plans, catalog)` collects a
coach's movement vocabulary (catalog names + aliases + past plans' exercise names), class types
and block labels, and both extraction call sites pass them in. Two effects: a movement the coach
is known to program **overrides** the deliberately strict `looksLikeMovement` gate (which
otherwise rejects real movements written descriptively), and a class type they already use is
recognised even when it isn't ALL-CAPS-shaped.

Hints only ever let the parser **recognise** more — never invent. A hinted line still has to
exist in the source, confidence is still coverage-accounted, and prose beside a known movement is
still left unparsed. ⚠️ **That last property had no test until the mutation run caught it**:
making `hintedMovement` return `true` for every line left the suite green, which would have
turned coaching notes into catalog exercises. `stats.hinted` reports how many lines parsed only
because of the corpus, so the contribution is measured rather than assumed.

Demonstrated end-to-end: the same deck text deferred at **53%** against the sample coach, then
parsed at **1.0** once the movement was in their corpus.

### 4.4 Modularization status (§4.5 of the Fable spec)

| Step | Target | State |
|---|---|---|
| 1 | Data constants → `src/data/` | ✅ `library.js`, `templates.js`, `glossary.js`, `personas.seed.js` |
| 2 | Repository seam → `src/lib/store.js` | ✅ The migration seam; ~30 call sites route through it |
| 3 | Shared UI → `src/ui/primitives.jsx` | ✅ Incl. `ThemeContext`/`useTheme`/`useWindowWidth` |
| 4 | Screens → `src/screens/` | ⛔ **Open.** `App.jsx` ~8,090 lines. Leaf-first: Glossary → Templates → Calendar → BrandStudio → Displays |
| 5 | Music quarantine → `src/music/` | ⛔ **Open.** ~2,000 lines of Spotify/DJ still inline; `MusicProvider` never built |

Step 4 is mechanical and zero-risk, and it directly reduces the recurring stale-build and
merge pain this file causes.

### 4.5 Quality gates and testing — the weakest area

**Built (2026-07-18):** a **CI crash gate**. `eslint.crash.config.js` is a small, must-be-zero
rule set (`no-undef`, `no-const-assign`, `no-dupe-keys`, `no-unsafe-optional-chaining`, …) run
before `npm run build` in `deploy.yml`.

*Why it exists:* commit `9f71f61` shipped a `ReferenceError` to production. `vite build` never
resolves identifiers, so the bundle compiled clean and CI deployed green; the Live runner then
crashed the moment a coach armed Mic Mode mid-class. The full lint config *did* catch it, but
reports ~215 style/hooks messages, so the one message that mattered was invisible. The lesson
generalizes: **a quality signal nobody can act on is not a quality signal.** The narrow gate is
enforced; the broad baseline stays advisory.

**Built (2026-07-18):** a **Vitest suite**, run in CI before the build (`npm test`). 29 tests
across `src/lib/slidesImport.test.js` and `src/lib/personaAggregate.test.js`.

*Selection principle — these cover the functions whose failures are* ***silent***: a
miscategorised class type drafts into the wrong Builder format; a lost movement alias splits one
movement into two half-counted catalog rows; a `commonScheme` emitted in the wrong case gets
clobbered to `{}` on the next sync; a slide is quietly dropped before extraction. All four have
actually happened in this codebase, and none is visible by clicking through the UI.

*The suite was mutation-checked, not just run.* Zeroing `classCategory`'s role weighting initially
failed to break any test — the fixture's scheme types carried the result on their own. A
discriminating fixture (superset blocks scored with a conditioning scheme) was added; breaking the
role weighting now fails exactly that test and restoring it goes green. **A test that passes on
first write is not yet evidence of anything.**

| Required | State |
|---|---|
| Vitest units on pure logic | 🟡 **Runner installed; 29 tests.** Covers slide import + persona aggregation. Timer/stage math and `can()` still uncovered |
| **RLS policy tests** (cross-org reads must fail; member-scope isolation) | ✅ **`supabase/tests/0007_rls_selftest.sql`, 11/11 PASS.** Dashboard-run (no Docker needed); impersonates `role authenticated` because the SQL editor bypasses RLS as superuser. Covers the `0007` tables only — `0001`–`0006` policies are still untested |
| **Attendance-immutability tests** | ✅ Covered by the same suite: `UPDATE`/`DELETE` on `attendance` and `consent_records` both affect zero rows |
| Playwright: plan→publish→run→display, QR check-in | ⛔ |
| Visual snapshots at 1920×1080 / 4K (P2 regression) | ⛔ |
| Realtime soak: 30 subscribers per room channel | ⛔ |

**Honest read:** CI now runs three gates — crash lint, unit tests, build. That is a real floor,
but it covers pure functions only. Every claim about *screens, sync and RLS* still rests on manual
verification. Before F4 ships — where the failure mode is silently wrong attendance data — the RLS
and immutability tests must exist, because that is precisely the class of bug this harness was
built to catch and currently cannot.

---

## 5. Deprecation list — current status

| Item | Spec action | State |
|---|---|---|
| `api.qrserver.com` QR generation | Replace with local lib | ✅ **Done 2026-07-18** — `src/lib/qr.js` |
| Mock Analytics | Flag off | ✅ `mockAnalytics` |
| Mock Members + hardcoded `BASE_SCHEDULE` | Flag off | ✅ `mockMembers`, `mockSchedule` |
| Legacy b64-in-URL attendee view | Replace with magic-link | ✅ Flagged off (`attendeeShare`); replacement unbuilt |
| localStorage as system-of-record | Demote to cache | ✅ All 14 domains sync to Postgres |
| Monolithic `App.jsx` | Split per §4.5 | 🟡 Steps 1–3 done, 4–5 open |
| Spotify as commercial playback | Demote to `PersonalSpotifyProvider` | ⛔ `MusicProvider` never built; still inline and unrouted |
| **`sp_at`/`sp_rt`/`pkce_v` in localStorage** | Remove → Edge Function + Vault | ⛔ **Still open** (`App.jsx:372–403`). A stated architectural constraint, currently violated. |
| **User-supplied RapidAPI key** (`jungle_exdb_key`) | Remove → server-side media proxy | ⛔ **Still open** (`App.jsx:433`, UI at `:5537`) |
| **Deezer BPM client-side calls** | Move behind server proxy; verify ToS | ⛔ **Still open** (`App.jsx:525–533`, `gsb_bpm_cache`) |

The bottom three cluster: all are **client-side third-party access that should be server-side**,
and all three would be resolved by the same `src/music/` + media-proxy work. They are the reason
"no provider tokens in the browser" is currently an aspiration rather than a property.

---

## 6. New features (N1–N12)

| # | Feature | State |
|---|---|---|
| N1 | Native attendance capture (QR + roster sweep) | 🟡 **Schema + RLS done (`0007`).** Client is the next build. Local QR generation ✅; QR *write path* needs an Edge Function (see F4) |
| N2 | 90-day cohort curve + benchmark overlay + revenue-at-risk | ⛔ Blocked on N1 |
| N3 | At-risk detection (2 SQL rules) + LLM outreach drafts | ⛔ Blocked on N2 |
| N4 | Member magic-link session summary | ⛔ The only member-facing surface; unbuilt |
| N5 | Tempo-guidance mode (BPM cues, no audio) | ✅ **Shipped** on the coach display's no-music state. Floor board has the identical gap |
| N6 | Soundtrack (commercial) + personal Spotify routing | ⛔ Needs `MusicProvider` |
| N7–N11 | BLE HR, aggregator, Strava, Garmin, iOS | ⛔ Correctly gated behind consent foundation |
| N12 | Coach self-serve tier | ⛔ Post-validation |

---

## 7. Recommended next moves

**Ranked by critical-path value, with cost and risk stated honestly.**

1. ✅ **F4 attendance spine (N1)** — schema `0007` applied + RLS-verified; slice 1 (store layer +
   coach roster sweep) shipped. **Remaining: CSV backfill, then the QR Edge Function.**
2. ✅ **RLS + attendance-immutability tests** — done for `0007` (11/11). Extend the same pattern
   to `0001`–`0006` (I5).
3. **Error boundary (I1)** — promoted to the top of what's left. There is none, so any render
   throw white-screens the whole app; this has already happened once in production.
4. **Instrument check-in duration (I4)** — P6 (<5s) is a design law and A7 is a kill criterion,
   and neither is currently measurable. Cheap now, retrofitted awkwardly later.
5. **Deterministic Slides parser with LLM fallback (I2)** — see §4.3.1. Most quota use disappears
   and extraction becomes reproducible, which matters because the corpus feeds a derived profile.
6. **Screens split (§4.5 step 4)** — mechanical, zero-risk, attacks recurring stale-build pain.
7. **`MusicProvider` shell + music quarantine (step 5)** — closes the last Phase-0 item and is
   the natural home for fixing the three client-side-token deprecations at once.
8. **Member magic-link summary (N4)** — the only surface where the white-label thesis (F6, and
   assumption A2) can be tested on an actual member. F6 is currently validated only on surfaces
   members never see.
9. **Display P7 hardening** — an explicit display-side session cache and reconnect path, so
   "survives Wi-Fi loss for a full class" becomes a tested claim rather than an assumption.

---

## 7b. Infrastructure & fine-tuning backlog

Everything here is **free** (no new paid service) unless marked. Ordered by value per unit of
risk, not by size.

### Tier 1 — cheap, high leverage, would have prevented real incidents

| # | Item | Why it matters |
|---|---|---|
| I1 | ✅ **DONE (`e447f92`) — React error boundary** | `src/ui/ErrorBoundary.jsx`, wired twice: root (`main.jsx`, outside `AuthGate` so its async mount can throw safely) and **per-view in `App.jsx`, keyed on `view`** — the latter is the one that matters, since the crash stays inside the screen that threw and the nav survives, making "navigate away" a recovery path. "Try again" re-mounts via a key bump; "Reload" is safe because store.js is local-first. Verified with a temporary throw in `GlossaryScreen`. |
| I2 | ✅ **DONE (`fadf318`) — Deterministic Slides parser, LLM fallback** | `src/lib/planParser.js` — pure, no I/O, emits the extractor's exact shape plus `confidence` + `reasons`; **defers below `PARSE_THRESHOLD` (0.72) rather than guessing**. Wired into BOTH extraction call sites: the Slides import parses locally first and only batches deferred slides to persona-ai, and **the paste-deck path no longer needs Supabase at all**. Provenance rides in `persona_plans.plan._extract` (free-form jsonb) — deliberately NOT a new `source` value, which is CHECK-constrained. 40 unit tests, 15 mutations verified to fail the suite. Measured on the house-format fixtures: S360 → 0.88, GC → 1.0, both with zero model calls. |
| I3 | ✅ **DONE (`d0651cf`) — sync guard generalised to every domain** | Two guards, because the domains have two shapes. **`_guardList`** (id-keyed) keeps rows the server never received and re-pushes them — now on `class_schedule_rules`, `coach_personas`, `persona_plans`, `persona_movements`, `persona_generations`, `members`, `class_instances`. **`_blobStale`** (single-row-per-gym/user: `library_overrides`, `brand_profiles`, `user_prefs`) has no per-row ids to diff, so it asks only "did our last write land?" — if not, the server row is stale and would silently revert the user's newest change. Also: `saveUserClasses` recorded **nothing** (console.warn only), so its hydrate could never know. New **`SyncBanner`** at the app root — a guard that works silently is indistinguishable from no problem at all. |
| I4 | ✅ **DONE (`f3fda97`) — check-in duration instrumented** | `src/lib/checkinMetrics.js`, surfaced on `RosterScreen`. Measures the **gap between consecutive check-ins** (the first from panel-open), because the naive "panel open → close ÷ members" counts the ten minutes a coach spends coaching between a sweep and a latecomer. Gaps >60s are excluded **and reported**, so the exclusion is visible rather than a filter that flatters the number. Median, not mean, and a median of per-session medians so one 40-member class can't outvote twenty ordinary ones. **With no data `meetsTarget` is `null`, never `true`** — an unmeasured design law reading as a met one is precisely the failure mode this removes. Local-only; persisting it needs a migration and isn't worth one yet. |
| I5 | **RLS tests for `0001`–`0006`** | The self-test pattern exists and works; only `0007` is covered. Cross-tenant leaks are invisible from the app. |

### Tier 2 — structural debt with compounding cost

| # | Item | Why it matters |
|---|---|---|
| I6 | **Screens split (§4.5 step 4)** | `App.jsx` is **8,279 lines**. Mechanical, zero-risk, and it attacks the recurring stale-build/merge pain directly. |
| I7 | **Music quarantine + `MusicProvider` (§4.5 step 5)** | ~2,000 lines, and the natural home for fixing I8 in one pass. Closes the last Phase-0 item. |
| I8 | **Three client-side third-party accesses** | Spotify tokens in localStorage (`App.jsx:372–403`), user-supplied RapidAPI key (`:433`, UI `:5537`), client-side Deezer BPM (`:525–533`). A stated architectural constraint currently violated. |
| I9 | **Code splitting** | Single **606 KB** bundle (166 KB gzip), no `React.lazy` anywhere. Route-level splitting would cut first paint materially — the room display is loaded on a TV over gym Wi-Fi. |
| I10 | **Delta writes instead of whole-list upserts** | `save*` pushes the ENTIRE domain list on every change. Fine at today's volume; quadratic-feeling as a corpus grows, and it is why one bad row poisoned every plan. |

### Tier 3 — correctness gaps to close before real users

| # | Item | Why it matters |
|---|---|---|
| I11 | **Display offline cache (P7)** | "Survives Wi-Fi loss for a full class" is an assumption, not a tested claim. |
| I12 | **Cross-device Realtime test** | Coded, never verified with two devices. |
| I13 | **Retry loop for failed syncs** | Failures are recorded, but only retried on the next hydrate. A background retry would close the loop. |
| I14 | **Hydrate pagination** | `attendance` hydrate caps at 2,000 rows; a busy studio passes that inside a year and silently truncates. |
| I15 | **Persona LLM quality ceiling** *(free→paid)* | Extraction fidelity is bounded by free Gemini. Two secrets switch persona reasoning to Opus 4.8. Do it *before* ingesting a large corpus — re-extraction costs quota again. |

---

## 7c. Feature backlog — what has NOT been built

Grouped by the spec's own numbering so it maps onto the Fable roadmap.

### Phase 1 remainder (the current phase)

| Item | State |
|---|---|
| **F4 slice 2 — CSV backfill** | ✅ **DONE (`e992d42`).** `src/lib/csvImport.js` (parse → validate → preview) + `store.applyAttendanceImport` (materialise in FK order, idempotent, `source='import'`). Two-step by design: analysis writes nothing, because `attendance` is append-only and a half-applied import cannot be rolled back. Ambiguous slash dates are a **coach decision** (`dayFirst` checkbox), never a guess; unparseable dates and unmatched names are reported per line rather than guessed at. |
| **F4 slice 3 — QR self-check-in** | Not started. **Blocked on an Edge Function** (service-role write path; see F4's known gap). Needs a hand-deploy. |
| **Members management screen** | 🟡 **Partly built (`e992d42`) — `RosterScreen`** at the `member` route (which is no longer flagged theatre). Shows the real roster with per-member visit counts and last-seen, plus the CSV backfill. **Still missing:** edit/delete, status, joined date — i.e. CRUD. Quick-add still covers walk-ins. |
| **`class_instances` generator** | Not started. Nothing turns `class_schedule_rules` (recurring rules) into dated occurrences yet — the runner creates one ad hoc. |
| **N4 — member magic-link summary** | Not started. **The only member-facing surface**, and the only place F6's white-label premium (A2) can actually be tested on a member. |
| **Consent notice surface** | Not started. Deliberately: no consent record is written until a real notice exists, because fabricating one is worse than an empty ledger. |

### Phase 2 — the outcome tier (unblocked once attendance rows accumulate)

| Item | State |
|---|---|
| **N2 — 90-day cohort curve + benchmark overlay + revenue-at-risk** | Not started. `AnalyticsScreen` exists but is flagged off (its KPIs were fabricated); keep the layout as the target. |
| **N3 — at-risk detection + outreach drafts** | Not started. Two SQL rules (<4 visits in month one; 14-day absence). **Arithmetic, not AI** — the LLM only drafts the message and explains the flag. |
| **Alert dismiss/acted state** | Not started. Without it, A3 (do operators *act*?) is unmeasurable. |

### Phase 3+ / deferred

| Item | State |
|---|---|
| **F1 — session primitive** (`sessions`, `session_assignments`, XOR) | Not started. Deliberately excluded from `0007`. **No 1:1/PT path exists at all**, so P5 ("one primitive, two lenses") is unreachable. |
| **PAR-Q screen** | Not started. Must land in the same change that introduces individualized load. |
| **Server-side exercise media proxy** | Not started (see I8). |
| **N6 — Soundtrack / personal-Spotify routing** | Not started; needs `MusicProvider`. |
| **Tempo-guide extensions** | Floor board's no-music slot, Builder per-stage preview, tap-tempo. |
| **N7–N11 — BLE HR, aggregator, Strava, Garmin, iOS** | Not started. Correctly gated behind the consent foundation. |
| **N12 — coach self-serve tier** | Not started. Post-validation. |

### Known-broken / honesty debt

| Item | State |
|---|---|
| **Flagged-off mock surfaces** | `mockAnalytics`, `mockMembers`, `mockSchedule`, `attendeeShare`, `mockIntegrations`, `mockDiscover` — all default OFF and must each be replaced by real-data implementations, not merely re-enabled. |
| **Brand Studio "LIVE PREVIEW" dashboard** | Intentionally illustrative; labelled. Leave as is. |

---

## 8. Open questions for the Design and Fable loops

These are the decisions this document cannot settle from the code alone.

1. **F1's scope at F4 time.** `class_instances` is on both the F1 and F4 critical paths. Do we
   land the full `sessions` / `session_assignments` primitive with migration `0007` — more design
   risk now, but it's the moment the XOR is cheapest to get right — or ship `class_instances`
   narrowly for attendance and retrofit the primitive later, accepting a migration we know we'll
   have to revisit?
2. **P6 at 5 seconds — is the QR self-scan actually the fast path?** A member scanning, loading a
   page and tapping their name may exceed 5s in a cold, crowded room. The coach roster sweep may
   dominate in practice. Which is the primary path, and which the fallback? This changes what we
   build first and what we optimise.
3. **Does the outcome tier need a member surface to be sellable?** F6's premium (A2) is asserted
   on surfaces the member never sees. N4 is the only place the white-label claim becomes real —
   should it move ahead of some Phase-2 analytics work?
4. **Testing floor before F4.** Is "RLS + immutability tests only" an acceptable minimum, or does
   attendance warrant the Playwright happy path too, given the data is the product?
5. **Persona LLM upgrade timing.** Extraction fidelity is currently bounded by free Gemini. Do we
   move persona reasoning to Opus 4.8 (two secrets, no code change) before ingesting the full
   historical corpus, given re-extraction later costs quota again?
6. **The three client-side-token deprecations.** They're a stated constraint currently violated.
   Are they a pre-revenue blocker, or acceptable while the only user is the founder? The answer
   determines whether step 5 jumps the queue.

---

*Verification note: every status mark in this document was checked against the working tree at
`758878e` — migrations read from `supabase/migrations/`, flags from `src/config/flags.js`, store
domains from `src/lib/store.js`, and deprecation items confirmed by line reference in
`src/App.jsx`. Where something is marked coded-but-unproven (Realtime cross-device, display
offline cache), that distinction is deliberate.*

---

## 9. Persona depth â€” the main build ahead

_Added 2026-07-19. This section is the design brief for the next phase of Workstream D._

The persona system can currently **read** a coach's history and **imitate** it. What it cannot
do is let a coach *hold their format in their hands and change it*. That is the difference
between a clever import tool and the thing a trainer actually wants â€” and it is the gap this
section exists to close.

### 9.1 Class Blueprints â€” structure recommended, then editable

**The problem.** A plan today is a flat list of blocks whose structure is whatever extraction
happened to produce. Generation mimics "typical structure" statistically. Nowhere can a coach
say *"my circuit class is a warm-up and two circuits, in that order"* â€” even though that
sentence is the most stable, most valuable thing they know about their own programming.

**The object.** A `Blueprint` belongs to a coach Ã— class type and is an ordered list of slots:

> **Garage Circuit** â€” `C1 = Warm-up` Â· `C2 = Circuit 1` Â· `C3 = Circuit 2`

```
Blueprint {
  id, personaId, classType, name,
  source: "recommended" | "edited",     // never silently overwrite an edited one
  slots: [
    { key:"C1", label:"Warm-up",   role:"warmup",  minutes:8,  movementCount:4,
      schemeDefault:{ type:"rounds", sets:2 }, categories:["warmup","mobility"] },
    { key:"C2", label:"Circuit 1", role:"circuit", minutes:12, movementCount:5,
      schemeDefault:{ type:"amrap" },          categories:["conditioning","hyrox"] },
    { key:"C3", label:"Circuit 2", role:"circuit", minutes:12, movementCount:5,
      schemeDefault:{ type:"amrap" },          categories:["conditioning","hyrox"] },
  ]
}
```

**Four things it must do.**

| Requirement | Why it matters |
|---|---|
| **Recommended, then editable** â€” derived from the coach's own corpus (labels, order, roles, durations) and offered as a starting point they can rename, reorder, add to, delete from | A fixed pipeline is a worse product than no pipeline. The coach's judgement is the asset; the derivation is a convenience, not an authority. `source:"edited"` must never be silently regenerated over. |
| **Presets for cold start** â€” ship house blueprints (Strength, Circuit, Endurance/Hyrox) | A coach with no corpus currently faces an empty screen, which is exactly when they decide whether this product is for them. |
| **Drives generation** â€” pick blueprint, fill each slot from the coach's catalog by category, coach approves | Structure is fixed by a human; the model only chooses movements within it. Vastly more controllable, and more trustworthy, than "the AI wrote you a class". |
| **Drives parsing** â€” a blueprint tells the parser that for *this* coach `C1` is a warm-up | This is precisely the ambiguity Â§4.3.2 had to disambiguate heuristically (S360's `A1/A2` pair vs GC's `C1/C2/C3` sequence). A blueprint answers it outright, and is the natural successor to the per-coach hints already shipped. |

#### Status â€” âœ… derive + edit + deterministic drafting built (`src/lib/blueprints.js`)

Stored at `coach_personas.style_profile.blueprints[classType]` â€” that jsonb column already
existed and already synced, so this needed no migration. Called **"class shape"** on screen,
never "blueprint" (Â§11).

- **Derivation takes the MODAL SEQUENCE**, not a positional alignment. Plans differ in length
  and in whether an optional block ran; aligning them invents correspondences that are not in
  the data. The card states the honest number: *"Suggested from 6 of your 8 S360 classes."*
- **A slot is named after what RECURS** â€” the key (`M1`), not the modal full label
  (`M1 â€” Deadlift`). Naming it from the full label bakes one week's focus into the shape and
  reads as a lie the week it is a squat. Found by driving the real corpus.
- **A slot's categories are ordered by prevalence within that slot, and that order is
  load-bearing.** A real warm-up contains the odd strength-ish movement, so the category set is
  legitimately broad; the ordering is what stops broad becoming anything-goes. Drafting reads
  it as priority and only reaches down the list to top up. Found by running it: the first draft
  put a Conventional Deadlift in the warm-up.
- **`minutes` is NOT derived.** Blocks carry no duration and only occasional prose in
  `scheme.note` hints at one; parsing that would be a guess dressed as data. It starts from the
  house `ROLE_DUR_SEC` map and is the coach's to set.
- **Deterministic drafting** (`draftFromBlueprint`) fills each slot from the coach's own
  catalog by category. No model: the structure is theirs, the movements are theirs, the
  selection is arithmetic. This is Â§9.3 taken to its conclusion, and unlike the persona-ai path
  it works with Supabase off â€” which is the only reason it could be verified at all.
- **A slot the catalog cannot fill emits an EMPTY block**, and an uncategorised movement is
  never drafted. Same rule as the taxonomy's blank: an honest gap the coach can see beats a
  wrong movement they might not.

**Not done, and worth being plain about:** the blueprint is passed to persona-ai's `generate`
payload but **that path is unverified** â€” it needs the function redeployed and cannot be
exercised locally. And Â§9.1's fourth requirement, **blueprint-driven PARSING** (telling the
parser that for this coach `C1` is a warm-up), is not built.

**Cold-start presets are narrower than Â§9.1 implies.** They appear when a class type exists but
no shape can be derived from it â€” e.g. a pasted plan whose blocks carry no labels. A coach with
*no plans at all* has no class type, so no card and no presets: Â§9.1's "empty screen" case is
still open. Serving it properly means letting a coach name a class and choose its shape
*before* importing anything, which is a persona-level surface that does not exist yet.

### 9.2 Movement taxonomy â€” the parser must know what KIND of thing it is reading

The parser recognises **structure** but not **meaning**. It cannot currently tell a warm-up
movement from a strength lift from a Hyrox station, which is why blueprint slot filters,
accurate `classCategory`, and structural category discipline are all impossible today.

**Categories:**

| Category | Examples |
|---|---|
| `warmup` / `mobility` | band pull apart, scap push-up, world's greatest stretch |
| `strength` | back squat, bench press, deadlift, overhead press |
| `conditioning` | burpee, wall ball, box jump, KB swing, thruster â€” **and** the loaded carries: sled push, sled pull, farmers carry, sandbag lunge, ski erg |
| ~~`hyrox`~~ | **Removed â€” see Â§13 Q8.** Hyrox is a format, not a movement property; a circuit class can contain Hyrox movements. The stations are `conditioning`; the format lives in the blueprint preset. |
| `core` | plank, hollow hold, pallof press |
| `cooldown` | stretching, breathing |

**And, distinctly, what is NOT a movement.** The parser must keep separating movement text from
modifiers â€” rest wording (`rest 90s`, `walk-back recovery`), intensity markers (`RIR 2`,
`RPE 7-8`, `%1RM`, tempo `31X1`) and structural cues (`3 rounds`, `go to B after`,
`1st set as primer`). It already does this well (see `foldScheme` / `stripSchemeTokens` /
`isBareRoleWord`); **the gap is movement to category, not modifier stripping.**

**How to build it:** deterministic classifier (name + equipment rules, the same ordered-rules
pattern as `inferEquip`), then a **coach-editable override in the movement catalog**, then an
LLM fallback for genuinely unknown names, **batched into one call**. As with equipment, an
honest blank must beat a confident wrong guess: the catalog already surfaces "needs equipment"
and should surface "needs category" the same way.

#### Status â€” âœ… layers 1 and 2 built (`src/lib/movementTaxonomy.js`)

Deterministic classifier + coach override shipped. The **LLM fallback is deliberately not
built**: it is only worth batching once a real corpus of blanks exists to batch, and the
catalog now surfaces every blank as `needs category` so those blanks are visible rather than
guessed at.

Four things worth carrying forward, all of them corrections to the prose above:

- **`categoryOf()` re-derives at read time; it does not trust the stored `category`.** A
  catalog is only re-aggregated when a persona's *plans* change, so a persisted category is a
  snapshot that goes stale the moment the rules improve â€” an existing coach would never see the
  improvement. Found by driving the UI, not by unit tests: `Hanging Knee Raise` stayed
  `strength` across reloads after the rules were corrected to `core`.
- **The coach's override lives in `persona_movements.meta.category`, not a column.** `meta` is
  unconstrained jsonb and already syncs, so this needed no migration and carries no
  CHECK-constraint risk. Derivation refreshes freely underneath it and can never overwrite it.
- **There is no `hyrox` category.** The examples table above lists one; it was built that way
  and then removed the same day on Dylan's call â€” *a circuit class can contain Hyrox
  movements*, so the format must not be stamped onto the movement. The stations classify as
  `conditioning`, and `HYROX_STATIONS` belongs to the blueprint preset. See Â§13 Q8 for the
  full reasoning and the design smell that flagged it. **The live category set is the six in
  `CATEGORIES`: `warmup`, `mobility`, `strength`, `conditioning`, `core`, `cooldown`.**
- **Loaded carries need their own rule anyway**, one row above the strength rules: `Sandbag
  Lunge` is otherwise eaten by the generic `lunge`, and `Sled Push` / `Farmers Carry` match
  nothing in the general conditioning rule and come back blank.
- **`categoryOf()` rejects an override outside `CATEGORIES`.** This is now load-bearing rather
  than defensive: a catalog written by the earlier build can carry `meta.category = "hyrox"`,
  and the guard makes those rows fall back to the derivation instead of poisoning slot filters.
- **The eight stations, corrected.** The prose above lists `run` as a station and omits Wall
  Balls. The race is 8 Ã— 1km run *between* eight stations â€” the run is connective tissue, not a
  station â€” and the eighth station is Wall Balls.

**What it unlocks:** blueprint slot filters; a much sharper `classCategory`; and "no ergs in a
strength block" enforced **structurally** rather than by asking a model nicely in a prompt.

### 9.3 The LLM's proper job

The division of labour this whole workstream has been converging on:

| The model SHOULD | The model SHOULD NOT |
|---|---|
| Classify movements it has never seen (batched, cheap) | Decide the structure of a class |
| Suggest a blueprint for a coach with no corpus | Decide who is at risk (already correct â€” N3 is arithmetic) |
| Draft a class **within a blueprint the coach fixed** | Invent structure the coach did not ask for |
| Explain a flag, draft a win-back message, narrate | Be the steady-state engine for anything deterministic |

**Preset configuration should be explicit and visible.** A coach picks a blueprint and a
generation preset; they do not type a prompt. Prompt-writing is a developer's interface, and
asking a trainer to do it is the same category of error as showing them a confidence percentage.

---

## 10. Platform strategy â€” web, desktop, mobile

_Added 2026-07-19._ The recommendation is deliberately boring, because the boring option is
nearly free and solves an outstanding spec requirement as a side effect.

| Step | What | Why this order |
|---|---|---|
| **1. PWA** | Manifest + service worker on the existing build | Installable on iOS, Android **and** desktop with no store review; and the service worker delivers the **offline display cache the spec already demands** (P7 / I11 â€” *"survives Wi-Fi loss for a full class"* is currently an untested assumption, and a room TV on gym Wi-Fi is the exact case). Highest value per unit of work by a wide margin. |
| **2. Capacitor** | Wrap the *same* build for the App Store / Play Store | Reuses essentially all the code. Worth doing once there is a **member-facing** surface worth installing â€” i.e. after **N4** (magic-link member view). Shipping a store app whose only users are staff is effort with no audience. |
| **3. Tauri (not Electron)** | Desktop app for reception / studio TV | Far smaller than Electron. Honestly, the PWA probably covers this â€” do not build it speculatively. |
| **4. React Native** | Full native | **This is a rewrite.** Only justified if BLE heart-rate (N7) genuinely demands native access. That is the one real forcing function and should be settled *before* anyone commits to a mobile direction. |

**Surface-by-surface, what each device is actually for** â€” worth stating, because "mobile app"
means three different things here:

- **Coach's phone** â€” the runner and check-in. Needs offline (P7) and speed (P6). PWA covers it.
- **Room TV / desktop** â€” the display. Needs offline, large type, and to never show browser
  chrome. PWA in fullscreen covers it; a Tauri shell is a nicety.
- **Member's phone** â€” QR self-check-in and the magic-link summary (N4). This is the one that
  eventually wants a store presence, and the one **still blocked on the QR Edge Function**.

---

## 11. UI language â€” take the implementation out of the coach's way

_Added 2026-07-19._ Jungle is an experience layer. Every leaked implementation term is a small
failure of that promise, and they have accumulated. **Currently in the code:**

| Shown to a coach today | The problem |
|---|---|
| `"Add to corpus"`, `"Paste JSON"`, `"Extract & add"`, `"Extracted:"` | Names the mechanism, not the outcome |
| `"Each deck is read via the Google Slides API (read-only) and extracted by persona-ai into blocks, schemes and movements."` | Three implementation nouns and a service name in one sentence |
| `"the built-in parser only understood 53% of that text and the persona-ai fallback isn't available"` | A confidence percentage and two internal components |
| `"Not valid JSON â€” paste an extraction object like { blocks: [ ... ] }"` | Asks a trainer to write JSON |
| `"Edge Function returned a non-2xx status code"`, `"no blocks came back"` | Says what failed internally, not what to do |
| `"New persona"` / `"Coach Personas"` | Even the feature name is jargon |

**The rule: name the outcome, not the mechanism.** "Add to corpus" becomes *"Save this class"*.
"Extract & add" becomes *"Read this class"*. Confidence scores, parsers, functions, blocks,
schemes and JSON should never reach a coach's eyes. Errors should say what to **do**.

`ROLE_LABEL` in `App.jsx` is the pattern to copy â€” it already maps `primary_lift` to
"Primary lift" so the raw enum never surfaces. Extend that discipline to every string.

---

## 12. Feature backlog â€” the full remaining picture

_Added 2026-07-19, consolidating Â§7b and Â§7c with the new work above._

### Now â€” persona depth (Â§9)
| # | Item |
|---|---|
| D1 | **Movement taxonomy** â€” âœ… deterministic classifier + catalog override **shipped**; batched LLM fallback still open (deferred until there is a real corpus of blanks to batch) |
| D2 | **Class Blueprints** â€” âœ… derive, present, edit **and drive deterministic drafting**. Still open: blueprint-driven **parsing**, and the persona-ai `generate` path is wired but **unverified** |
| D3 | **Blueprint presets** â€” ðŸŸ¡ built and reachable when a class type yields no derivable shape; the true no-corpus cold start still needs a persona-level surface (Â§9.1 Status) |
| D4 | **Generation presets** â€” pick a blueprint and a preset, never type a prompt |

### Now â€” finishing what is half-built
| # | Item |
|---|---|
| N3-UI | At-risk list + per-flag "why" + **dismiss/acted state** (without it A3 is unmeasurable). Engine shipped `73068dc`, no surface yet |
| U1 | **UI language pass** (Â§11) |
| M1 | **Members CRUD** â€” `RosterScreen` reads but cannot edit; no status, no joined date |
| I5 | **RLS tests for `0001`-`0006`** (only `0007` is covered) |

### Next â€” platform + reach (Â§10)
| # | Item |
|---|---|
| P1 | **PWA** â€” manifest + service worker; closes I11/P7 |
| N4 | **Member magic-link summary** â€” the only member-facing surface, and the only place F6's white-label premium (A2) can be tested on a member |
| F4-QR | **QR self-check-in Edge Function** â€” service-role write path. **Blocked on a hand-deploy.** Do not loosen RLS to `anon` |
| P2 | **Capacitor** wrap, once N4 exists |

### Then â€” the outcome tier
| # | Item |
|---|---|
| N2 | 90-day cohort curve + benchmark overlay + revenue-at-risk |
| N3-LLM | Win-back message drafting (model drafts; rules decide) |
| F1 | Session primitive (`sessions`, `session_assignments`, XOR) â€” **no 1:1/PT path exists at all**, so P5 is unreachable |
| PAR-Q | Must land in the same change that introduces individualised load |

### Structural debt (unchanged, still real)
`I6` screens split (`App.jsx` ~8,600 lines) Â· `I7` music quarantine Â· `I8` three client-side
third-party accesses Â· `I9` code splitting (~630 KB, no `React.lazy`) Â· `I10` delta writes Â·
`I13` background retry Â· `I14` hydrate pagination Â· `I15` persona LLM quality ceiling

### Deferred
N6 soundtrack routing Â· tempo-guide extensions Â· N7-N11 (BLE HR, aggregator, Strava, Garmin,
iOS) â€” correctly gated behind the consent foundation Â· N12 coach self-serve tier

---

## 13. Open questions for the Fable review (2026-07-19)

In addition to Â§8, which stands:

7. ~~**Blueprint vs. corpus authority.**~~ **Settled 2026-07-19 (Dylan): the edit always wins,
   and the contradiction is surfaced.** Built in `reconcileBlueprint` â€” an `edited` blueprint is
   returned untouched and the freshly derived shape rides along as `contradiction` only when it
   actually differs, so the card can say *"Your recent classes have been running a different
   shape"* with a **Use this instead** action. Never auto-applied, never silently reconciled.
8. ~~**Is `hyrox` a movement category or a class type?**~~ **Settled 2026-07-19 (Dylan):
   NEITHER â€” Hyrox is a format, and there is no `hyrox` movement category.** The reasoning is
   Dylan's and it is decisive: *a circuit class can contain Hyrox movements.* A sled push is a
   loaded carry whoever is pushing it, so tagging the movement with the format would mislabel
   every ordinary circuit class that happens to own a sled. The stations classify as
   `conditioning` like anything else. `HYROX_STATIONS` survives as an exported list belonging
   to the Hyrox **blueprint preset** (Â§9.1), which is where the format legitimately lives.

   _(An earlier pass the same day shipped `hyrox` as a category and had already begun
   contorting itself â€” only five of the eight stations were tagged, because Row, Run and Wall
   Balls are obviously everyday conditioning. That carve-out was the design telling us the
   category was wrong. Recorded because the smell is reusable: when a category needs
   exceptions to avoid mislabelling ordinary cases, the category is the problem.)_
9. **Does the member app need to exist before a store presence is worth anything?** Â§10 assumes
   yes (Capacitor waits for N4). If the coach-facing PWA is enough to sell, the order changes.
10. **BLE heart-rate is the one thing that could force a native rewrite (N7).** Should that be
    spiked cheaply *now* to de-risk the mobile direction, even though the feature itself is
    correctly gated behind consent and sits in a much later phase?
11. **How much structure should a preset impose on a brand-new coach?** A strong preset gets them
    to value in one click but teaches them Jungle's opinion rather than capturing theirs â€” which
    cuts against the entire persona thesis.

