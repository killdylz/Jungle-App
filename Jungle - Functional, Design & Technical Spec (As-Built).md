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

### ⚠️ Which part of THIS document to trust

_Added 2026-07-25 (session 9), after a full audit found stale claims in **both directions** — things
marked "not started" that had shipped, and things marked done that were not. Every session since 5
has paid a tax re-deriving this from the code. Rank the sources:_

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. A test is the only claim in this repo that cannot go stale silently. |
| 2 | **`SESSION-HANDOFF.md` (top block)** and the current session prompt | Written against the code, at the end of the session that changed it. |
| 3 | **§3 (design) and §12 (backlog)** of this document | Maintained as work ships. **§12 supersedes §7c.** |
| 4 | **§1, §2, §4, §7b, §7c, §9** | Corrected in session 9, but these are the sections that drift. Each correction is marked inline with its date. |
| 5 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** Analyses App.jsx at 8,059 lines (July 5). Do not plan from it. |

**The durable fix is not a tidier document — it is a test.** Where session 9 could turn a disputed
status into an assertion it did (D3's cold start, D4's presets, B4's idempotency, B5's export), so
the next session reads a test result instead of arbitrating between two paragraphs.

---

## 1. Where we actually are

> **Corrected 2026-07-25 (session 9).** This section had drifted badly and was
> being planned from. It claimed F4's capture UI was unbuilt, App.jsx was ~8,780 lines, and that
> "F4 attendance is unbuilt" governed the roadmap — all three false since session 7. The audit in
> `SESSION-9-PROMPT.md` §0 flagged it; this is that correction. **If you are reading a status claim
> anywhere in this document, prefer §12, then a test, then this section.**

| Fable phase | State | Evidence |
|---|---|---|
| **0 — De-risk** | ✅ Done | All six mock surfaces flagged off (`src/config/flags.js`, all default `false`). Deploy verification in place. Residual: `MusicProvider` shell never built — but N5's user value shipped without it, so it is now a refactor, not a blocker. |
| **0.5 — Split slice** | 🟡 Steps 1–3 done, **step 4 partly** | `src/data/`, `src/lib/store.js`, `src/ui/primitives.jsx` extracted; step 5 (music) **quarantined behind `FLAGS.music`**. Step 4 (screens): `AdminTeamScreen`, `CalendarScreen`, `RosterScreen` are out; personas (stage 4) and Builder/Live/RoomTV behind a `useClassRunner()` hook (stage 5) are open. `App.jsx` is **~5,650 lines**, down from 8,780. |
| **1 — Data foundation ★** | ✅ **Done** | Migrations `0001`–**`0008`** applied; RLS on every table, self-tests for `0001`–`0006` **and** `0007` (11/11) written and run; Realtime room channels live; local-first sync across all 14 domains. F4 capture UI **shipped** (coach sweep + CSV backfill). The one remaining Phase-1 gap is N4, and it is blocked on an Edge Function, not on schema. |
| **2 — Make theatre real** | 🟡 **Unblocked, waiting on volume — for N2 only** | The coach roster sweep and the CSV backfill (`e992d42`) both write real attendance rows, so a studio can bring its whole history across on day one. **N3 at-risk is live UI** with 0008 applied and an append-only action ledger. What is left is not a feature — it is enough rows to compute a cohort curve from. |
| **3 — Experience deepening** | 🟡 Partly done early | P1 PWA ✅, P2 10-foot rule ✅ (viewport-keyed, regression-tested at 1080p and 4K), WCAG-AA in Brand Studio ✅, reduced-motion ✅, tempo guide ✅, mobile layout ✅. BLE spike and Garmin application not started. P7 flips to ✅ only after the physical offline soak. |
| **4–5** | ⛔ Not started | Correctly gated behind consent foundation and validation. |

**The single structural fact that governs the roadmap — RESTATED, because the old one is spent.**
F4 attendance *was* the spine and it is now built: capture, backfill, the at-risk loop, and (session
9) the schedule→`class_instances` generator that gives attendance a dated occurrence to hang off.
Everything downstream of it is now gated on **volume and on Dylan**, not on code:

- **N2 cohort analytics** waits on rows accumulating, which waits on the pilot running.
- **N4 member magic-link** — the only member-facing surface, and the last Phase-1 gap — waits on an
  Edge Function Dylan must deploy. ⛔ Do not build the page first; that is the `<AttendeeView/>` mistake.
- **F1's 1:1 path** waits on a migration decision (and PAR-Q must land in the same change).
- **Backups** — the free tier has none. `LEGAL-AND-SECURITY.md` §3 hole #1, and it is Day 1.

---

## 2. Core functional specification

### F1 — Session/assignment primitive · 🟡 Partial (group only)

**Built:** A class is an array of stages, each with exercises, durations, type and optional
tracks. Classes persist through `store.getUserClasses()/saveUserClasses()` and sync to Postgres.
Completed sessions append to `session_history` (insert-only RLS — history genuinely cannot be
rewritten).

**Not built — and this is the spec's actual acceptance criterion:** there is no
`session_assignments` table and **no 1:1 path at all**. Templates also do not snapshot on
publish; editing a template today does not mutate delivered history only because history is a
separate append-only log, not because a snapshot boundary was designed.

> **Corrected 2026-07-25 (session 9).** This paragraph said "no `class_instances`". That half is
> now false: `class_instances` shipped in `0007`, and since session 9 the Schedule can publish a
> week of recurring rules into dated occurrences (`src/lib/scheduleInstances.js`,
> `store.publishOccurrences`, idempotent on `(name, startsAt)`). So **one side of the XOR now
> exists.** The spec's test — *"`session_assignment` targets a `class_instance` XOR a `member`"* —
> is still unrunnable, but for one reason rather than two.

**Consequence:** the PT/1:1 market and the "one primitive, two lenses" design principle (P5) are
both unreachable until the member side lands. That is a **new migration and therefore Dylan's
call**, and PAR-Q must land in the same change that introduces individualised load.

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

### F4 — Attendance capture · ✅ Built (coach sweep + CSV backfill); 🚫 QR deferred by decision

> **Corrected 2026-07-25 (session 9).** This heading read *"capture UI not built"* and the section
> ended *"Blocked on: approval of migration 0007"*. Both were false from session 7 onward — 0007 is
> applied, the sweep and the backfill shipped, and Members CRUD with it. The original text is kept
> below where it still describes the schema and the RLS work accurately; the status claims are
> corrected inline.

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

**✅ Built since — the client side, except QR.** `store.js` domains for all four tables; the coach
roster sweep in the Live runner; CSV backfill (`src/lib/csvImport.js`, preview-then-apply against an
append-only table); Members CRUD (add + inline edit, no delete — see §12); P6 instrumentation
(`src/lib/checkinMetrics.js`); and, session 9, the schedule→occurrence generator
(`src/lib/scheduleInstances.js`) plus member/roster CSV **export** (`src/lib/csvExport.js`, the PDPA
access obligation). **QR self-check-in is deferred by decision, not blocked** — AUDIT 2.4 says
*"defer, do not promise"*; the coach sweep is the pilot path.

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

~~**Blocked on:** approval of migration `0007`.~~ **Cleared 2026-07-18** — 0007 is applied and its
shape is recorded in §4.1 below.

**Design law that must govern the build: P6 — check-in ≤5 seconds per member.** Above that,
coaches skip it, attendance starves, and the thesis is decapitated (A7 / kill criterion #3). This
is a *measured* requirement, not an aspiration: instrument check-in duration from day one and
treat the pilot's check-in rate as the #1 metric.

### F5 — Retention analytics + at-risk loop · 🟡 At-risk ✅ live; cohort analytics waiting on volume

> **Corrected 2026-07-25 (session 9).** This read *"⛔ Blocked on F4"*. F4 is built, and so is the
> at-risk half of F5: `src/lib/retention.js` + `src/lib/winback.js` drive a live panel on the
> Members screen, with migration `0008`'s append-only `retention_actions` ledger behind the
> acted/dismissed/reopened states, so A3 is measurable. What remains is **N2 cohort analytics**, and
> it waits on attendance VOLUME rather than on code.

`AnalyticsScreen` exists but is 🎭 flagged off (`mockAnalytics`) because its KPIs were fabricated.
Keep the layout as the Phase-2 target; rebuild on real data. **It is still entirely hardcoded** —
"Barry's · Shoreditch", 1,284 members, £412/class — which is correct while the flag is false and is
the reason the flag must stay false.

Worth restating because it is easy to get wrong under delivery pressure: **at-risk v1 is SQL, not
LLM.** Two transparent rules (<4 visits in month one; 14-day absence). The LLM drafts the win-back
message and explains the flag — it does not decide who is at risk. An operator must be able to
trust the rule and a lawyer must be able to read it.

### F6 — White-label brand system · ✅ Built for staff surfaces, ⛔ absent for member surfaces

**Built:** Brand Studio (the strongest single asset), preset skins, custom token editing, per-gym
branding and logos, `brand_profiles` sync with `active_skin_id`, and a **live WCAG-AA contrast
audit** on token pairs — compliance turned into a feature, exactly as specified.

**Gap:** the spec's purpose sentence is *"the member experiences the studio's brand"* — and the
member-visible surface is still only half-built. The magic-link view (N4) is unbuilt, blocked on an
Edge Function to issue a signed class token (design in `LEGAL-AND-SECURITY.md` §4); the legacy
b64-in-URL attendee view was **deleted** in the pilot-prep pass, along with the Room TV QR that
pointed at it. The auto-generated per-gym privacy/consent page is also unbuilt. So F6's *acceptance*
is met on staff surfaces and remains untested where it actually matters.

**Shipped since (pilot-prep pass):** the **share card** — a gym-branded 1080×1920 PNG rendered
client-side — is the first genuinely member-facing branded artefact, and it needed no backend. The
in-app white-label leaks AUDIT-FINDINGS 1.2 caught are **fixed**: the `© Dylan Rodrigues` footer,
the `jungle-app` browser title and Vite favicon, and runtime Google-Fonts loading (fonts are now
self-hosted, which is also what makes the PWA work offline).

---

## 3. Design specification

| # | Principle | State | Notes |
|---|---|---|---|
| **P1** | Now over next | ✅ | Current move ≥60% weight on the coach display; UP NEXT peripheral. |
| **P2** | The 10-foot rule | ✅ | Every member-facing display size (Overview / Floor / Coach) is now keyed to viewport **height** via `tvFont` — a `clamp(floor, Nvh, cap)` that reproduces the tuned 1080p px exactly and then grows, so the primary element (move + timer) holds ~8.5% of height on **1080p and 4K** alike, not a shrinking fraction. The floor board's phase timer, previously 7.8% at 1080p (already under the floor) and half that on 4K, now holds ~8.9%. Regression: `e2e/display.spec.js` drives the real Room TV at 1920×1080 **and** 3840×2160 and asserts the primary is 8–12% of height at both plus viewport-invariant; mutation-verified (fixing the timer back to px fails the 4K band and the invariance check). |
| **P3** | Brand-forward, coach-neutral | 🟡 | Staff surfaces neutral ✅; member surfaces don't exist yet, so the half that matters is untested. |
| **P4** | Zero-touch room | ✅ | Auto-advance + phone-as-remote + Realtime Follow. |
| **P5** | One primitive, two lenses | ⛔ | No 1:1 lens (see F1). |
| **P6** | Capture costs <5s | 🚫 | Awaiting F4. **Must be instrumented, not assumed.** |
| **P7** | Degrade gracefully | 🟡 | localStorage-first everywhere, QR generates offline, and the **PWA now ships**: self-hosted fonts, manifest, and a hand-written service worker with build-time precache injection. Proven locally with the preview server stopped — the app boots, both skin fonts report loaded, and a check-in still records. Becomes ✅ only when the **physical gym soak test** (REGRESSION-PLAN §4, router off 5 min mid-class) passes on real hardware. |

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
| `consent_records` | `member_id`, `gym_id`, `scope`, `policy_version`, `method`, `granted_at`, `withdrawn_at` | Append-only. Ships in Phase 1 **even though biometrics don't** — cheap insurance. A **consent ledger, PDPA-first, with graduated scopes** (see `LEGAL-AND-SECURITY.md`). |

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
| 4 | Screens → `src/screens/` | 🟡 **Stage 1 begun.** `App.jsx` ~8,780 lines and shrinking. Leaf-first, per AUDIT-FINDINGS §3.1 — shared helpers (`src/ui/labels.js` ✅) → leaf screens → Calendar → BrandStudio → Displays. Glossary and Templates are **retired**, not pending. Stages 4–5 stay deferred |
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
| Vitest units on pure logic | 🟡 **423 tests.** Broad coverage: slide import, persona aggregation, parser, taxonomy, blueprints, retention, colours, csv, share card, win-back, db-constraints, and now the **interval sub-timer math** (`intervalTimer.test.js`, extracted from App.jsx so it is testable). The Runner's per-stage advance/remaining math and `can()` are still component-embedded and uncovered by units (the e2e smoke exercises the advance path end-to-end). |
| **RLS policy tests** (cross-org reads must fail; member-scope isolation) | ✅ **`supabase/tests/0007_rls_selftest.sql`, 11/11 PASS.** Dashboard-run (no Docker needed); impersonates `role authenticated` because the SQL editor bypasses RLS as superuser. Covers the `0007` tables only — `0001`–`0006` policies are still untested |
| **Attendance-immutability tests** | ✅ Covered by the same suite: `UPDATE`/`DELETE` on `attendance` and `consent_records` both affect zero rows |
| Playwright: plan→publish→run→display, QR check-in | ⛔ |
| Visual snapshots at 1920×1080 / 4K (P2 regression) | ✅ `e2e/display.spec.js` — measures the primary element's height as a fraction of the viewport at both resolutions (not pixel snapshots, which are brittle; measures the actual §3 property) and asserts 8–12% + viewport-invariance. Mutation-verified. |
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
| I6 | ✅ **DONE (`4494b72`, session 16) — all five decomposition stages shipped** | `App.jsx` is **3,183 lines** (`wc -l`), from 8,780. Stage 4 put the personas cluster in `src/screens/personas/`; **stage 5** put `LiveScreen`, `RoomTV`, `CheckInPanel` and the three Room TV display surfaces in `src/screens/runner/` behind `useClassRunner()`, which also absorbed the runner's clock, transport, realtime broadcast and pinned scheduled class. Shared modules `src/lib/format.js` and `src/lib/brandCopy.js` fell out of the seam. **Deliberately not `React.lazy`** — see `src/screens/runner/index.js` for why the runner must not wait on a fetch. It was NOT zero-risk as this row once claimed: the AST `jsx` script found 17 unresolved components the crash gate cannot see, `lint:crash` then found 16 plain-identifier misses the JSX script cannot see, and `FloorLiveScreen`'s shadowing local `fmt` would have been silently "tidied" into a wrong import without the dead-import scan. |
| I7 | **Music: cut from the sellable product** | Licensing exposure plus zero argued value to any of the three lives (trainer, owner, member). Quarantined behind `FLAGS.music` in `src/music/`; **`MusicProvider` will not be built.** TempoGuide survives as the only rhythm feature. Deleting the quarantine outright is a post-pilot decision. |
| I8 | **Three client-side third-party accesses** | Spotify tokens in localStorage (`App.jsx:372–403`), user-supplied RapidAPI key (`:433`, UI `:5537`), client-side Deezer BPM (`:525–533`). A stated architectural constraint currently violated. **The Spotify-token item is resolved by feature removal for v1** (see I7); the RapidAPI key and Deezer BPM calls remain real. |
| I9 | **Code splitting — largely done; what is left is small and must be MEASURED** | Local build is **533.39 KB main + 89.89 KB PersonasScreen chunk** (session 16), from a single 647 KB bundle. The personas cluster is `React.lazy`; the runner deliberately is not. **The wins came from gating, not splitting**: rollup cannot fold a flag that a runtime state variable can reach, so session 14 took 24.15 KB off two keyboard shortcuts and session 16 took 12.7 KB off six ungated call sites into the cut music subsystem. ⚠️ A **~2.5 KB "useSpotify leftover"** carried in earlier backlogs **does not exist** — measured at **0.15 KB**; `spotifyApi.js`, `spotifyAuth.js` and `djOrchestrator.js` were already out, because rollup shakes at **export** granularity, not module granularity. Remaining candidates (`BrandStudioScreen`, `LibraryBrowserModal`, `AdminTeamScreen`) are all weak — and `build-sw` precaches every emitted chunk, so a chunk nothing fetches costs every install. **Measure before splitting.** |
| ~~I10~~ ✅ | **Delta writes instead of whole-list upserts — SHIPPED** | Landed in `224b074` (session 15); this row said otherwise for two sessions and was corrected in session 17 after reading the code. `save*` no longer pushes the whole domain: `_bgUpsertDelta` sends only rows whose fingerprint differs from what the server last **confirmed**, so one bad row can no longer stop every other row in its domain from syncing. `attendance` was already per-row. Pinned by 12 unit tests. |

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

> ## ⚠️ SUPERSEDED BY §12 — corrected 2026-07-25 (session 9)
>
> **This is the OLDEST backlog section in the document and it was wrong in four places.** It listed
> N3 at-risk, "alert dismiss/acted state", Members CRUD and the `class_instances` generator as *not
> started*; all four have shipped. Every session since has re-derived that by reading the code.
>
> **Plan from §12.** The table below is corrected rather than deleted, because the *reasoning* in
> each row is still good and is not repeated in §12.

Grouped by the spec's own numbering so it maps onto the Fable roadmap.

### Phase 1 remainder (the current phase)

| Item | State |
|---|---|
| **F4 slice 2 — CSV backfill** | ✅ **DONE (`e992d42`).** `src/lib/csvImport.js` (parse → validate → preview) + `store.applyAttendanceImport` (materialise in FK order, idempotent, `source='import'`). Two-step by design: analysis writes nothing, because `attendance` is append-only and a half-applied import cannot be rolled back. Ambiguous slash dates are a **coach decision** (`dayFirst` checkbox), never a guess; unparseable dates and unmatched names are reported per line rather than guessed at. |
| **Member data EXPORT** | ✅ **DONE (session 9).** `src/lib/csvExport.js` — one member's own record (the PDPA access obligation) and the whole roster (portability / data return on exit). RFC 4180 quoting pinned by a round-trip through `parseCsv`; leading `= + - @` guarded against spreadsheet formula execution; UTF-8 BOM so Excel does not mangle names. |
| **F4 slice 3 — QR self-check-in** | 🚫 **Deferred by decision, not blocked.** AUDIT 2.4: *"defer, do not promise"* — the coach sweep is the pilot path. Ship the Edge Function only when a gym asks. Never loosen RLS to `anon`. |
| **Members management screen** | ✅ **DONE.** `RosterScreen` at the `member` route: real roster, per-member visit counts and last-seen, CSV backfill **and export**, at-risk panel, P6 instrument, and M1 CRUD (add + inline edit of name/email/joined/status). **No delete, deliberately** — `attendance.member_id` cascades, so deleting a member destroys the history the retention analytics run on. Leaving is `status: 'cancelled'`; erasure deserves its own PDPA flow. |
| **`class_instances` generator** | ✅ **DONE (session 9).** `src/lib/scheduleInstances.js` + `store.publishOccurrences`, surfaced as "Publish week" on the Schedule. Idempotent on `(name, startsAt)` — a duplicated occurrence would split one class's check-ins across two rows. |
| **N4 — member magic-link summary** | ⛔ **Not started, and blocked on Dylan.** **The only member-facing surface**, and the only place F6's white-label premium (A2) can be tested on a member. The share-card half ✅ shipped (needs no backend); the link half needs an Edge Function issuing a signed class token. **Do not build the page first** — that is the `<AttendeeView/>` mistake. |
| **Consent notice surface** | ⛔ Not started. Deliberately: no consent record is written until a real notice exists, because fabricating one is worse than an empty ledger. `recordConsent` exists with **zero callers**, and that is correct. |

### Phase 2 — the outcome tier (unblocked once attendance rows accumulate)

| Item | State |
|---|---|
| **N2 — 90-day cohort curve + benchmark overlay + revenue-at-risk** | ⛔ Not started, and waiting on **volume, not code**. `AnalyticsScreen` exists but is flagged off (its KPIs are fabricated); keep the layout as the target. |
| **N3 — at-risk detection + outreach drafts** | ✅ **DONE.** `src/lib/retention.js` + `src/lib/winback.js`, live on the Members screen. Two transparent rules (<4 visits in month one; 14-day absence), each flag carrying the numbers that produced it so an operator can argue with it. **Arithmetic, not AI** — Jungle drafts the WhatsApp; the human sends it, from their own number, to a contact they pick. |
| **Alert dismiss/acted state** | ✅ **DONE.** Migration `0008`'s append-only `retention_actions` ledger: acted / dismissed / reopened, with handled work staying visible so "we acted on 9 of 11" is computable. A3 is measurable. |

### Phase 3+ / deferred

| Item | State |
|---|---|
| **F1 — session primitive** (`sessions`, `session_assignments`, XOR) | 🟡 Half-blocked. `class_instances` exists and is now generated from the schedule, so one side of the XOR is real; `session_assignments` and the member side are not. **No 1:1/PT path exists**, so P5 ("one primitive, two lenses") is unreachable. Needs a migration — Dylan's call. |
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

## 9. Persona depth — the main build ahead

_Added 2026-07-19. This section is the design brief for the next phase of Workstream D._

The persona system can currently **read** a coach's history and **imitate** it. What it cannot
do is let a coach *hold their format in their hands and change it*. That is the difference
between a clever import tool and the thing a trainer actually wants — and it is the gap this
section exists to close.

### 9.1 Class Blueprints — structure recommended, then editable

**The problem.** A plan today is a flat list of blocks whose structure is whatever extraction
happened to produce. Generation mimics "typical structure" statistically. Nowhere can a coach
say *"my circuit class is a warm-up and two circuits, in that order"* — even though that
sentence is the most stable, most valuable thing they know about their own programming.

**The object.** A `Blueprint` belongs to a coach × class type and is an ordered list of slots:

> **Garage Circuit** — `C1 = Warm-up` · `C2 = Circuit 1` · `C3 = Circuit 2`

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
| **Recommended, then editable** — derived from the coach's own corpus (labels, order, roles, durations) and offered as a starting point they can rename, reorder, add to, delete from | A fixed pipeline is a worse product than no pipeline. The coach's judgement is the asset; the derivation is a convenience, not an authority. `source:"edited"` must never be silently regenerated over. |
| **Presets for cold start** — ship house blueprints (Strength, Circuit, Endurance/Hyrox) | A coach with no corpus currently faces an empty screen, which is exactly when they decide whether this product is for them. |
| **Drives generation** — pick blueprint, fill each slot from the coach's catalog by category, coach approves | Structure is fixed by a human; the model only chooses movements within it. Vastly more controllable, and more trustworthy, than "the AI wrote you a class". |
| **Drives parsing** — a blueprint tells the parser that for *this* coach `C1` is a warm-up | This is precisely the ambiguity §4.3.2 had to disambiguate heuristically (S360's `A1/A2` pair vs GC's `C1/C2/C3` sequence). A blueprint answers it outright, and is the natural successor to the per-coach hints already shipped. |

#### Status — ✅ derive + edit + deterministic drafting built (`src/lib/blueprints.js`)

Stored at `coach_personas.style_profile.blueprints[classType]` — that jsonb column already
existed and already synced, so this needed no migration. Called **"class shape"** on screen,
never "blueprint" (§11).

- **Derivation takes the MODAL SEQUENCE**, not a positional alignment. Plans differ in length
  and in whether an optional block ran; aligning them invents correspondences that are not in
  the data. The card states the honest number: *"Suggested from 6 of your 8 S360 classes."*
- **A slot is named after what RECURS** — the key (`M1`), not the modal full label
  (`M1 — Deadlift`). Naming it from the full label bakes one week's focus into the shape and
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
  selection is arithmetic. This is §9.3 taken to its conclusion, and unlike the persona-ai path
  it works with Supabase off — which is the only reason it could be verified at all.
- **A slot the catalog cannot fill emits an EMPTY block**, and an uncategorised movement is
  never drafted. Same rule as the taxonomy's blank: an honest gap the coach can see beats a
  wrong movement they might not.

**Not done, and worth being plain about:** the blueprint is passed to persona-ai's `generate`
payload but **that path is unverified** — it needs the function redeployed and cannot be
exercised locally. And §9.1's fourth requirement, **blueprint-driven PARSING** (telling the
parser that for this coach `C1` is a warm-up), is not built.

~~**Cold-start presets are narrower than §9.1 implies.**~~ **✅ Closed — corrected 2026-07-25
(session 9).** The persona-level surface this asked for exists and was verified end to end by
driving it: a gym with no coaches is told so; adding one lands on *"Start with a class this coach
teaches"*; naming a class type and picking a preset shape stores it as `source: "preset"` (so the
coach's own shape replaces it silently once real classes arrive) and drops them on a working
class-type surface. Two e2e in `e2e/coldstart.spec.js` pin the whole path, so this claim is now
checkable rather than a matter of whose memory is more recent. Driving it also surfaced a typo —
*"Add classs for S360"*, three s, on that exact first-impression screen — now fixed and tested.

### 9.2 Movement taxonomy — the parser must know what KIND of thing it is reading

The parser recognises **structure** but not **meaning**. It cannot currently tell a warm-up
movement from a strength lift from a Hyrox station, which is why blueprint slot filters,
accurate `classCategory`, and structural category discipline are all impossible today.

**Categories:**

| Category | Examples |
|---|---|
| `warmup` / `mobility` | band pull apart, scap push-up, world's greatest stretch |
| `strength` | back squat, bench press, deadlift, overhead press |
| `conditioning` | burpee, wall ball, box jump, KB swing, thruster — **and** the loaded carries: sled push, sled pull, farmers carry, sandbag lunge, ski erg |
| ~~`hyrox`~~ | **Removed — see §13 Q8.** Hyrox is a format, not a movement property; a circuit class can contain Hyrox movements. The stations are `conditioning`; the format lives in the blueprint preset. |
| `core` | plank, hollow hold, pallof press |
| `cooldown` | stretching, breathing |

**And, distinctly, what is NOT a movement.** The parser must keep separating movement text from
modifiers — rest wording (`rest 90s`, `walk-back recovery`), intensity markers (`RIR 2`,
`RPE 7-8`, `%1RM`, tempo `31X1`) and structural cues (`3 rounds`, `go to B after`,
`1st set as primer`). It already does this well (see `foldScheme` / `stripSchemeTokens` /
`isBareRoleWord`); **the gap is movement to category, not modifier stripping.**

**How to build it:** deterministic classifier (name + equipment rules, the same ordered-rules
pattern as `inferEquip`), then a **coach-editable override in the movement catalog**, then an
LLM fallback for genuinely unknown names, **batched into one call**. As with equipment, an
honest blank must beat a confident wrong guess: the catalog already surfaces "needs equipment"
and should surface "needs category" the same way.

#### Status — ✅ layers 1 and 2 built (`src/lib/movementTaxonomy.js`)

Deterministic classifier + coach override shipped. The **LLM fallback is deliberately not
built**: it is only worth batching once a real corpus of blanks exists to batch, and the
catalog now surfaces every blank as `needs category` so those blanks are visible rather than
guessed at.

Four things worth carrying forward, all of them corrections to the prose above:

- **`categoryOf()` re-derives at read time; it does not trust the stored `category`.** A
  catalog is only re-aggregated when a persona's *plans* change, so a persisted category is a
  snapshot that goes stale the moment the rules improve — an existing coach would never see the
  improvement. Found by driving the UI, not by unit tests: `Hanging Knee Raise` stayed
  `strength` across reloads after the rules were corrected to `core`.
- **The coach's override lives in `persona_movements.meta.category`, not a column.** `meta` is
  unconstrained jsonb and already syncs, so this needed no migration and carries no
  CHECK-constraint risk. Derivation refreshes freely underneath it and can never overwrite it.
- **There is no `hyrox` category.** The examples table above lists one; it was built that way
  and then removed the same day on Dylan's call — *a circuit class can contain Hyrox
  movements*, so the format must not be stamped onto the movement. The stations classify as
  `conditioning`, and `HYROX_STATIONS` belongs to the blueprint preset. See §13 Q8 for the
  full reasoning and the design smell that flagged it. **The live category set is the six in
  `CATEGORIES`: `warmup`, `mobility`, `strength`, `conditioning`, `core`, `cooldown`.**
- **Loaded carries need their own rule anyway**, one row above the strength rules: `Sandbag
  Lunge` is otherwise eaten by the generic `lunge`, and `Sled Push` / `Farmers Carry` match
  nothing in the general conditioning rule and come back blank.
- **`categoryOf()` rejects an override outside `CATEGORIES`.** This is now load-bearing rather
  than defensive: a catalog written by the earlier build can carry `meta.category = "hyrox"`,
  and the guard makes those rows fall back to the derivation instead of poisoning slot filters.
- **The eight stations, corrected.** The prose above lists `run` as a station and omits Wall
  Balls. The race is 8 × 1km run *between* eight stations — the run is connective tissue, not a
  station — and the eighth station is Wall Balls.

**What it unlocks:** blueprint slot filters; a much sharper `classCategory`; and "no ergs in a
strength block" enforced **structurally** rather than by asking a model nicely in a prompt.

### 9.3 The LLM's proper job

The division of labour this whole workstream has been converging on:

| The model SHOULD | The model SHOULD NOT |
|---|---|
| Classify movements it has never seen (batched, cheap) | Decide the structure of a class |
| Suggest a blueprint for a coach with no corpus | Decide who is at risk (already correct — N3 is arithmetic) |
| Draft a class **within a blueprint the coach fixed** | Invent structure the coach did not ask for |
| Explain a flag, draft a win-back message, narrate | Be the steady-state engine for anything deterministic |

**Preset configuration should be explicit and visible.** A coach picks a blueprint and a
generation preset; they do not type a prompt. Prompt-writing is a developer's interface, and
asking a trainer to do it is the same category of error as showing them a confidence percentage.

---

## 10. Platform strategy — web, desktop, mobile

_Added 2026-07-19._ The recommendation is deliberately boring, because the boring option is
nearly free and solves an outstanding spec requirement as a side effect.

| Step | What | Why this order |
|---|---|---|
| **1. PWA** | Manifest + service worker on the existing build | Installable on iOS, Android **and** desktop with no store review; and the service worker delivers the **offline display cache the spec already demands** (P7 / I11 — *"survives Wi-Fi loss for a full class"* is currently an untested assumption, and a room TV on gym Wi-Fi is the exact case). Highest value per unit of work by a wide margin. |
| **2. Capacitor** | Wrap the *same* build for the App Store / Play Store | Reuses essentially all the code. Worth doing once there is a **member-facing** surface worth installing — i.e. after **N4** (magic-link member view). Shipping a store app whose only users are staff is effort with no audience. |

**BLE (N7), if ever needed, forces a wrapper** because iOS has no Web Bluetooth — but that wrapper
is **Capacitor with a BLE plugin around the same build, never a rewrite**. React Native is removed
from the roadmap, and the Tauri desktop row with it: the PWA covers reception and the studio TV,
and building a desktop shell speculatively was never justified.

**Surface-by-surface, what each device is actually for** — worth stating, because "mobile app"
means three different things here:

- **Coach's phone** — the runner and check-in. Needs offline (P7) and speed (P6). PWA covers it.
- **Room TV / desktop** — the display. Needs offline, large type, and to never show browser
  chrome. PWA in fullscreen covers it, and no desktop shell is planned.
- **Member's phone** — the magic-link summary (N4). This is the one that could eventually want a
  store presence, and the one **still blocked on an Edge Function** to issue a signed class token.
  QR self-check-in is **deferred**, not next — design in `LEGAL-AND-SECURITY.md` §4.

---

## 11. UI language — take the implementation out of the coach's way

_Added 2026-07-19. Status updated in the pilot-prep pass._ Jungle is an experience layer. Every
leaked implementation term is a small failure of that promise.

**The rule: name the outcome, not the mechanism.** "Add to corpus" becomes *"Save this class"*;
"Extract & add" becomes *"Read this class"*. Confidence scores, parsers, functions, blocks, schemes
and JSON must never reach a coach's eyes. Errors say what to **do**.

**✅ The U1 pass has since shipped.** The table of offending strings that stood here is gone
because the strings are gone — it described the code as of 2026-07-19 and would now read as a lie.
The complete replacement copy is maintained in **`UI-UX-DIRECTION.md` §4**, which is the
authoritative U1 worklist.

The label maps are extracted to **`src/ui/labels.js`** — `ROLE_LABEL`, `SCHEME_LABEL` and friends,
so a raw enum never surfaces — **with a unit test that enforces the no-jargon rule** rather than
leaving it to discipline. That test is the durable part: it is what stops the next feature
reintroducing "corpus".

---

## 12. Feature backlog — the full remaining picture

_Added 2026-07-19, consolidating §7b and §7c with the new work above._

### Now — persona depth (§9)
| # | Item |
|---|---|
| D1 | **Movement taxonomy** — ✅ deterministic classifier + catalog override **shipped**; batched LLM fallback still open (deferred until there is a real corpus of blanks to batch). Session 9 pinned the visible cost: common warm-up names ("Arm Swings", "Cat Cow") return no category, and the drafter correctly leaves them out of a class rather than guessing — so the gap shows up as thinner warm-ups, not as wrong ones |
| D2 | **Class Blueprints** — ✅ derive, present, edit, drive deterministic drafting **and drive parsing** (`e4ab933`). ⛔ **Still open: parsing is verified against FIXTURES, not against The Garage's real decks.** Drive a real deck through the Slides import with a blueprint saved and confirm `stats.blueprint > 0`. The persona-ai `generate` path is wired but **unverified** — needs a redeploy |
| D3 | **Blueprint presets** — ✅ **DONE (verified session 9).** Reachable both when a class type yields no derivable shape AND at the true no-corpus cold start; the persona-level surface §9.1 asked for exists and is covered by `e2e/coldstart.spec.js` |
| D4 | **Generation presets** — ✅ **DONE (session 9).** Five named intents (the usual · something different · heavier day · engine day · short class), each a deterministic transformation of the coach's own shape, each stating what it will change in numbers before the coach commits. `src/lib/generationPresets.js`. The written brief survives, demoted behind a summary, for what presets do not cover. **The rule that keeps it honest: a preset may REORDER a slot's categories, never ADD one** — otherwise "heavier day" puts a deadlift in the warm-up |

### Now — finishing what is half-built

_Re-ranked to match `WEEK-PLAN.md`. **N4 has moved up from "Next" — it is now core**, see
`PRODUCT-DIRECTION.md` §5._

| # | Item |
|---|---|
| **Mobile layout** | ✅ **Shipped.** Bottom tab bar below 900px (Run · Build · Members · Brand · More), bottom sheet, safe-area insets. The real gap was the **480–900px band**, not 375px — see the AUDIT 1.1 correction in `SESSION-HANDOFF.md` |
| P1 | **PWA** — ✅ **shipped**: self-hosted fonts, manifest, hand-written service worker + build-time precache injection. Closes I11 in code; P7 flips to ✅ only after the physical soak |
| U1 | **UI language pass** (§11) — ✅ **shipped**, enforced by a test (`src/ui/labels.js`) |
| D3 | **Cold start** — ✅ **shipped**: a coach with zero classes can name a class type, pick a preset shape, and land in the Builder. Verified end to end in session 9 and covered by `e2e/coldstart.spec.js` |
| B1 | **Dashboard cold start** — ✅ **shipped (session 9).** The four KPIs all derive from the same empty array, so a new gym's first screen was "0 · 0.0 · 0 · 0". The KPI row is replaced by a three-step checklist until there is a class to count; after that the numbers return and anything outstanding drops to one quiet line. `src/lib/setupProgress.js` |
| B4 | **`class_instances` generator** — ✅ **shipped (session 9).** "Publish week" turns the Schedule's recurring rules into dated occurrences, idempotently. `src/lib/scheduleInstances.js`. Consequence handled in the same change: "CLASSES RUN" now counts only classes that have actually happened, so publishing next week cannot inflate it |
| B4b | **Schedule → Runner join** — ✅ **shipped (session 11).** Publishing a week and then running that class produced **two** `class_instances` rows: the join was keyed on name and nothing made the Builder's `sessionName` equal the schedule rule's name, so check-ins landed on the Runner's row and the published one kept zero attendance forever. **Not fixed by loosening the match** — guessing which occurrence a coach is running attaches attendance to the wrong class permanently. A grid cell now offers **Start** inside the 4h join window (`CLASS_WINDOW_MS`, one constant shared by the button and the join), `store.startScheduledClass` resolves the occurrence by identity and dates it to the **slot** rather than to when Start was pressed, and its id travels into `ensureClassInstance({ instanceId })` so the names cannot diverge. `retention.js` was never affected — it reads only `attendance` |
| — | **Sunday** — ✅ **decided and shipped (session 11).** The Schedule was a six-day week (`DAYS = Mon..Sat`, and the day picker built from the same list), so a Sunday class could not be created, displayed or published. Self-consistent, hence invisible; Dylan confirmed it was **not** intended. Now seven days everywhere. Driving the screen **on an actual Sunday** then found a second, independent defect: the grid's own `base.getDate() - base.getDay() + 1` resolved to *tomorrow* when `getDay()` was 0, so on Sundays the Schedule showed next week and today's row was absent. It now shares `startOfWeek`/`weekKeyOf` with the generator |
| B5 | **Member data export** — ✅ **shipped (session 9).** Per-member (PDPA access) and whole-roster (portability / data return on exit). `src/lib/csvExport.js` |
| N4 | **Member magic-link summary** — the only member-facing surface, and the only place F6's white-label premium (A2) can be tested on a member. **Share-card half ✅ shipped** (needs no backend); the link half is **blocked on an Edge Function** to issue a signed class token |
| I5 | **RLS tests for `0001`-`0006`** — ✅ **shipped** and run by Dylan |
| N3-UI | ✅ **Built**, and migration **0008 is now APPLIED** — the append-only action ledger (`retention_actions`) persists, so A3 is measurable |
| M1 | **Members CRUD** — ✅ **shipped.** Add, inline edit (name · email · joined date · status), and a roster count that reads ACTIVE members rather than list length, so it can go down. Status is `MEMBER_STATUSES`, pinned against 0007's CHECK. **No delete, deliberately:** `attendance.member_id` cascades, so deleting a member destroys the attendance history the retention analytics run on — leaving is `status: 'cancelled'`, and erasure deserves its own PDPA flow |

### Next — platform + reach (§10)
| # | Item |
|---|---|
| P2 | **Capacitor** wrap, once N4 exists |

### Then — the outcome tier
| # | Item |
|---|---|
| N2 | 90-day cohort curve + benchmark overlay + revenue-at-risk |
| N3-LLM | Win-back message drafting (model drafts; rules decide) |
| F1 | Session primitive (`sessions`, `session_assignments`, XOR) — **no 1:1/PT path exists at all**, so P5 is unreachable |
| PAR-Q | Must land in the same change that introduces individualised load |

### Structural debt (still real)
`I6` screens split (`App.jsx` **4,852 lines** total, `wc -l`; down from 8,780; stage 4 ✅ done — the personas
cluster moved to `src/screens/personas/`; **stage 5 open** — Builder/Live/RoomTV behind
`useClassRunner()`) · `I7` music **cut**, quarantined behind `FLAGS.music` · `I8` three client-side
third-party accesses (Spotify token resolved by removal; RapidAPI key and Deezer BPM still need a
server-side media proxy) · `I9` code splitting (**544.29 KB / 152.88 KB gzip** local, measured
2026-07-27; `PersonasScreen` has been lazy since session 12 and is an 89.84 KB chunk. ⚠️ The LOCAL
build under-reports production by **~241 KB on the main chunk** — quote that delta, not a
percentage, because "~37%" was carried here for three sessions and is ambiguous about which side
you divide by (241/776.85 = 31%, 241/535.94 = 45%). With no `VITE_SUPABASE_*` vars `supabaseEnabled` folds to
`false` and rollup drops every sync path, so a sync-only commit produces a byte-identical bundle.
**Re-measured session 17 at `843547d`: 776.85 KB main + 91.19 KB PersonasScreen (868 KB total),
214.43 KB gzip**, by building with dummy `VITE_SUPABASE_*` vars set so the sync paths survive —
down 10.35 KB on main from the 787.2 KB recorded at `cc4a1b7`, three sessions earlier. That is a
local reproduction of production's SHAPE, not the deployed artifact; the CI-built bundle remains
the authority, and the dummy URL/key differ from the real ones by a handful of bytes) ·
~~`I10` delta writes~~ ✅ **shipped** in `224b074` (session 15), verified session 17. Every id-keyed
`save*` routes through `_bgUpsertDelta`, including `persona_plans`; `attendance` was already
per-row (`recordAttendance` pushes `[row]`). A row is marked synced only on **server confirmation**,
so a failed push stays in the next delta and the self-healing survives. 12 unit tests pin
`_deltaRows` / `_markSynced` / `_unmark`. Two retry thunks are still whole-payload by design —
`attendance` (append-only insert with `ignoreDuplicates`, no per-row marks) and
brand_profiles/user_prefs (no single "save current state" setter). ·
~~`I13` background retry~~ ✅ **shipped** (retry on reconnect + slow timer; the physical soak still
owes the proof) · `I14` hydrate pagination · `I15` persona LLM quality ceiling (two secrets switch
persona reasoning to Opus 4.8 — do it **before** ingesting a large corpus, or re-extraction costs
quota twice)

### Deferred
**F4-QR — QR self-check-in Edge Function.** Moved here from "Next": a service-role write path,
blocked on a hand-deploy, and **not** required for the pilot. Design in `LEGAL-AND-SECURITY.md` §4.
**Do not loosen RLS to `anon`.**
**Templates screen + Glossary retired** (AUDIT 2.3) — folded into the Builder picker ("Jungle
presets") and Library rows rather than deleted. Note the trap this sprang: retiring the Templates
nav orphaned class export/import, because that screen was the only route to either. A fold is not
the same as a deletion.
N6 soundtrack routing · tempo-guide extensions · N7-N11 (BLE HR, aggregator, Strava, Garmin,
iOS) — correctly gated behind the consent foundation · N12 coach self-serve tier

---

## 13. Open questions for the Fable review (2026-07-19)

In addition to §8, which stands:

7. ~~**Blueprint vs. corpus authority.**~~ **Settled 2026-07-19 (Dylan): the edit always wins,
   and the contradiction is surfaced.** Built in `reconcileBlueprint` — an `edited` blueprint is
   returned untouched and the freshly derived shape rides along as `contradiction` only when it
   actually differs, so the card can say *"Your recent classes have been running a different
   shape"* with a **Use this instead** action. Never auto-applied, never silently reconciled.
8. ~~**Is `hyrox` a movement category or a class type?**~~ **Settled 2026-07-19 (Dylan):
   NEITHER — Hyrox is a format, and there is no `hyrox` movement category.** The reasoning is
   Dylan's and it is decisive: *a circuit class can contain Hyrox movements.* A sled push is a
   loaded carry whoever is pushing it, so tagging the movement with the format would mislabel
   every ordinary circuit class that happens to own a sled. The stations classify as
   `conditioning` like anything else. `HYROX_STATIONS` survives as an exported list belonging
   to the Hyrox **blueprint preset** (§9.1), which is where the format legitimately lives.

   _(An earlier pass the same day shipped `hyrox` as a category and had already begun
   contorting itself — only five of the eight stations were tagged, because Row, Run and Wall
   Balls are obviously everyday conditioning. That carve-out was the design telling us the
   category was wrong. Recorded because the smell is reusable: when a category needs
   exceptions to avoid mislabelling ordinary cases, the category is the problem.)_
9. ~~**Does the member app need to exist before a store presence is worth anything?**~~
   **Settled: the member surface is a magic link, and there is no store presence.** Nothing about
   the member experience needs an installed app — a link a member opens once after class is the
   whole surface, and it is also the only version that respects PDPA-first data minimisation.
   Capacitor stays on the roadmap for one reason only: **if BLE ever ships.**
10. ~~**Should BLE be spiked cheaply now to de-risk the mobile direction?**~~ **Folds into Q9 —
    no spike needed.** The question only mattered while the answer could force a *rewrite*. It
    cannot: iOS has no Web Bluetooth, so BLE needs a wrapper, but that wrapper is **Capacitor
    around the same build**. Since the cost of being wrong is now a wrapper rather than a
    rewrite, there is nothing to de-risk in advance.
11. ~~**How much structure should a preset impose on a brand-new coach?**~~ **Answered: presets
    are scaffolding, not opinion.** They are shown *only* at a zero-corpus cold start, and are
    always editable. Jungle's opinion never overwrites a derived or edited shape — the same
    authority rule as Q7. The preset exists to get a coach to a first class; the moment they have
    a corpus, their own shape replaces it.


---

## 14. Commercial context — Singapore launch (added 2026-07-19)

_New as of session 4. This section exists because it changes what "done" means, and because two
things in this document are now factually wrong for the market we are launching into._

### 14.1 The plan

Dylan freelances at a gym in **Singapore** and intends to (a) launch Jungle there as the first
deployment, (b) sell it to other gyms as a product, and (c) offer B2B services through that first
gym. Target: development finished and the USP sharpened **within a week** of 2026-07-19.

This is the first time the product has had a named customer, and it promotes several things from
"good practice" to "blocking":

| Was | Now |
|---|---|
| Sync verified twice, failed twice | **Blocking.** A gym's attendance cannot be lost. |
| Offline (P7/I11) an untested assumption | **Blocking.** A real class will lose Wi-Fi. |
| QR self-check-in blocked on RLS | **Blocking or cut.** Ship the Edge Function or remove the promise. |
| Technical jargon in the UI (§11) | **Blocking.** A paying customer's staff will read these strings. |
| No backups, no staging, no observability | **Blocking before member data is real.** |

### 14.2 The compliance framing — corrected for Singapore

**§4.1 used to describe `consent_records` as "MHMDA-shaped", and the migrations still reference
GDPR erasure.** Those are US and EU instruments. Singapore's governing law is the **Personal Data
Protection Act (PDPA)**, and the differences are material — notably the **mandatory data breach
notification** regime, the **Data Protection Officer** requirement, and the **Do Not Call**
provisions, which bear directly on the win-back messaging feature (N3/N5) because that feature
contacts members who have stopped attending.

§4.1's wording is now corrected to "consent ledger, PDPA-first, scopes graduated". **The migration
comments still say GDPR and have not been rewritten** — they are inert prose, but they are the
remaining instance of the wrong framing in the repo.

**Resolved framing: the gym is the organisation; Jungle is a data intermediary.** The gym holds the
obligations to its members; Jungle processes on the gym's instructions. That determines the
contract, the retention policy and parts of the architecture, and it is now written down — with the
DPO, breach-notification and Do Not Call specifics — in **`LEGAL-AND-SECURITY.md`**, which is
authoritative for all of it. Two consequences that reach into the code: a **sub-processor must be
named in the gym's DPA** (which is why adding Sentry is a legal decision, not a library choice —
crash payloads can carry member names), and DNC bears directly on win-back messaging (N3/N5).

**Nothing here should be read as legal advice, and none of it has been reviewed by a Singapore
lawyer** — that review is still outstanding and is on Dylan's queue.

### 14.3 The IP question, which is not a technical one

Software built by a freelancer while engaged at a gym can have a **contested owner**. This needs to
be agreed in writing with the first gym *before* launch, not after it succeeds. Recorded here
because it is the kind of thing that is cheap to settle early and expensive to settle late.

### 14.4 Where the commercial numbers live

Pricing, unit economics, the addressable Singapore market, and the first-gym commercial arrangement
are maintained in **`GTM-SINGAPORE.md`**, which is authoritative for all of them. **Each number
carries its confidence tag there** — sourced, estimated, or guess — rather than being restated here
where the tag would drift loose from the figure.

The rule that governs this document applies to commercial figures too, and is the reason for the
tagging discipline: **an honest blank beats a confident wrong guess.**
