# Jungle — Next Session Prompt

_Paste this whole file as the opening message of the next session._
_Written 2026-07-19, after session 3. `main` = `a164fb7`._

---

## The product, in one paragraph

Jungle is a **white-label class operating system for boutique fitness studios** — React
+ Vite + Supabase, deployed to GitHub Pages. It is not a scheduling tool with a
dashboard bolted on. **It is an experience layer.** Everything is judged by whether it
makes life better for three people: the **trainer** (plans faster, coaches better, isn't
fighting software mid-class), the **gym owner** (sees who is slipping away in time to act,
and looks premium doing it), and the **member** (walks into a room that knows who they
are and what they're doing). A feature that doesn't improve one of those three lives is
not a feature — it is theatre, and this repo has a documented history of deleting
theatre rather than shipping it.

## Start here

- **Repo:** `C:\Users\dylan\jungle-app` (request folder access first).
- **Confirm:** repo access, `git status`, `main` = `a164fb7`, tree clean, CI green.
  Then **propose a plan before editing.**
- **Read, in this order:**
  1. `SESSION-HANDOFF.md` — cold-start brief + everything sessions 1–3 shipped.
  2. `Jungle - Functional, Design & Technical Spec (As-Built).md` — **current state.**
     §7b (infra backlog), §7c (feature backlog), §4.3.1–4.3.2 (why the parser exists and
     how it works), **§9 (persona depth — the main build ahead)**, **§10 (platform
     strategy)**, **§11 (UI language)**.
  3. `Jungle - Stress-Test Verdict & Architecture Spec (Fable).md` — the dated
     architectural verdict. Not edited; the as-built doc is the living one.
- **Live site:** https://killdylz.github.io/Jungle-App/ — deploy = push to `main`.
- **CI runs three gates:** `lint:crash` → `test` → `build`. The crash gate must be **0**
  and is NOT the style baseline (`npm run lint` is a ~215-message advisory baseline).
  **Never relax a rule to get a deploy out.**
- **When you add tests, MUTATE THE CODE to prove they can fail.** This is not ceremony:
  four tests in this repo have already passed with the logic under test deleted, and the
  mutation run caught every one. 164 tests, ~60 mutations verified so far.
- **Drive the real UI before claiming done.** Mutation-checked unit tests still missed
  four real defects in session 3; all four were found by running the flow and reading
  back the STORED object.

---

## ⭐ THE MAIN BUILD AHEAD: persona depth

This is the priority. Read **§9 of the as-built spec** for the full design; the summary:

### 1. Class Blueprints — structure should be recommended, then editable

Today a class plan is a flat list of blocks and the structure is whatever happened to be
extracted. That is backwards. A coach's format **is** the product of their thinking, and
it should be a first-class, editable object.

A **Blueprint** belongs to a coach × class type and is an ordered list of slots:

> **Garage Circuit** — `C1 = Warm-up` · `C2 = Circuit 1` · `C3 = Circuit 2`

Each slot carries a label, a role, typical minutes, how many movements, a default scheme,
and **which categories of movement belong in it**. Requirements:

- **Recommended, then editable.** Derive the blueprint from the coach's own corpus
  (which labels appear, in what order, with what roles and durations) and present it as a
  starting point they can rename, reorder, add to and delete from. Never a fixed pipeline.
- **Presets for cold start.** Ship a few house blueprints (Strength, Circuit, Endurance /
  Hyrox) so a coach with no corpus isn't staring at an empty screen.
- **Blueprints drive generation.** Pick a blueprint → each slot is filled with movements
  matching its categories from the coach's own catalog → coach approves. Far more
  controllable, and far more trustworthy, than "the AI wrote you a class".
- **Blueprints drive parsing.** A blueprint tells the parser that for *this* coach `C1` is
  a warm-up and `C2` is a circuit. That is exactly the ambiguity that made the
  S360-vs-GC disambiguation hard (see §4.3.2), and it is the natural next step after the
  per-coach hints already shipped.

### 2. Movement taxonomy — the parser must know what KIND of thing it is reading

The parser currently recognises structure but not meaning. It must distinguish:

| Kind | Examples |
|---|---|
| **warm-up / mobility** | band pull apart, scap push-up, world's greatest stretch |
| **strength** | back squat, bench press, deadlift, overhead press |
| **conditioning / circuit** | burpee, wall ball, box jump, KB swing, thruster |
| **hyrox** | sled push, sled pull, farmers carry, sandbag lunge, ski erg, row, run, burpee broad jump — a defined 8-station format, so this set is enumerable |
| **core / accessory** | plank, hollow hold, pallof press |
| **cool-down** | stretching, breathing |

…and must reliably separate all of those from **modifiers, which are not movements**:
rest wording (`rest 90s`, `walk-back recovery`), intensity markers (`RIR 2`, `RPE 7-8`,
`%1RM`, tempo `31X1`), and structural cues (`3 rounds`, `go to B after`,
`1st set as primer`). The parser already strips most modifiers well — the **gap is
movement → category**.

Build it as: deterministic classifier (name + equipment rules) → **coach-editable override
in the movement catalog** → LLM fallback for genuinely unknown names, batched into one
call. Category then feeds blueprint slot filters, sharpens the existing `classCategory`,
and lets "no ergs in a strength block" be enforced *structurally* instead of by asking a
model nicely in a prompt.

### 3. The LLM's proper job

Deterministic structure, model judgement only where judgement is actually needed:

- ✅ classify movements it has never seen (batched, cheap)
- ✅ suggest a blueprint for a coach with no corpus
- ✅ draft a class **within a blueprint the coach fixed** — structure given, not invented
- ✅ explain a flag, draft a win-back message, narrate
- ❌ decide the structure of a class
- ❌ decide who is at risk (already correct — N3 is arithmetic; see `retention.js`)

**Preset configuration** should be explicit and visible: a coach picks a blueprint and a
generation preset rather than typing a prompt.

---

## 🗣️ ONGOING: take the technical language out of the UI

A coach is not a developer. The UI currently leaks implementation vocabulary, and every
instance is a small failure of the experience layer. **Real examples in the code today:**

- `"Add to corpus"`, `"Paste JSON"`, `"Extract & add"`, `"Extracted:"`
- `"Each deck is read via the Google Slides API (read-only) and extracted by persona-ai
  into blocks, schemes and movements."`
- `"the built-in parser only understood 53% of that text and the persona-ai fallback
  isn't available"`
- `"Not valid JSON — paste an extraction object like { \"blocks\": [ … ] }"`
- `"Edge Function returned a non-2xx status code"`, `"no blocks came back"`
- `"New persona"` / `"Coach Personas"` — even the feature name is jargon

Rule of thumb: **name the outcome, not the mechanism.** "Add to corpus" → "Save this
class". "Extract & add" → "Read this class". Confidence percentages, parsers, functions
and JSON should never reach a coach's eyes. Errors should say what to *do*, not what
failed internally. `ROLE_LABEL` in `App.jsx` is the pattern to copy — it already maps
`primary_lift` → "Primary lift"; extend that discipline everywhere.

---

## 📱 ALSO PLANNED: desktop and mobile apps

See **§10** for the full reasoning. Short version, and the recommendation is deliberately
boring because it is nearly free:

1. **PWA first.** Installable on iOS, Android and desktop, no store review, and the
   service worker delivers the offline display cache the spec already demands (P7 / I11 —
   "survives Wi-Fi loss for a full class" is currently an untested assumption). Highest
   value per unit of work by a wide margin.
2. **Capacitor** wrapping the *same* build for the app stores, once there is a
   member-facing surface worth installing (i.e. after N4, the magic-link member view).
   Reuses essentially all of the code.
3. **Tauri, not Electron**, if a true desktop app is ever needed for reception/TV — far
   smaller. Honestly, the PWA probably covers it.
4. **React Native would be a rewrite.** Only justified if BLE heart-rate (N7) demands
   native — which it might. That is the one genuine forcing function; flag it before
   committing to anything.

---

## Recommended order for the next session

1. **Movement taxonomy** (`movementCategory` + catalog override + LLM fallback). It is the
   foundation the blueprints stand on, and it immediately improves parsing and generation.
2. **Class Blueprints** — derive → present → edit → drive generation → feed the parser.
3. **N3 UI** — the rules engine landed in `73068dc` with no surface yet. Needs the at-risk
   list, the "why" per flag, and **dismiss/acted state** (without it, A3 "do operators act
   on alerts?" stays unmeasurable).
4. **UI language pass** — a sweep of every user-facing string.
5. **PWA manifest + service worker** — closes I11/P7 as a side effect.

Then hand to **Fable for review**. Open questions are in **§8** (standing) and **§13** (new,
written for this review) of the as-built spec — add to them as you go. The one worth settling
early, because code hardens around it fast: **is `hyrox` a movement category or a class type?**
It is currently modelled as a category so blueprint slots can request it, but Hyrox is a fixed
8-station format, which argues for a blueprint preset instead. Possibly both.

---

## Constraints and gotchas — these have all bitten before

- **No infra changes** (DB migrations, new services, paid APIs) without asking Dylan.
- **Free tiers only** — no paid Opus/Gemini yet.
- **Edge Functions deploy by Dylan pasting into the Supabase dashboard.**
- **A Postgres CHECK constraint rejecting a client value is this repo's recurring
  data-loss bug** — it has happened three times. When writing ANY constrained column, pin
  the legal values in one shared constant with a unit test. `persona_plans.source` is
  `google_slides | manual | jungle`; `attendance.source` is `qr | coach | import`.
- **QR self-check-in still cannot write through 0007's RLS.** It needs an Edge Function
  with the service-role key validating a short-lived class token. **Do NOT fix this by
  loosening policies to `anon`.**
- Local `vite build` can serve **stale** `App.jsx`. Trust the dev server and CI, not
  local `dist/`.
- A second chat often holds port 5173 — start your own on `--port 5180 --strictPort`,
  then **revert `launch.json` before committing**.
- Browser-pane **screenshots hang** on this app — use `read_page` / `get_page_text` /
  `javascript_tool` computed-style checks.
- The browser console tool **accumulates history across reloads**. Errors carrying an old
  `?t=<hmr-timestamp>` are usually stale mid-edit artifacts — confirm against a fresh load
  plus `npm run lint:crash` before treating one as real.
- Local build has no Supabase → localStorage + PIN build. **PIN is `080921`.** The sync
  path is NOT exercisable locally.
- PowerShell: use `npm.cmd` / `npx.cmd`. Multi-line commit messages via
  `git commit -F <file>`.

## Still pending from Dylan

- ⬜ **LIVE SYNC CHECK (most important).** Run a class, sweep two names in Check in,
  confirm rows reach Postgres — not just localStorage. Claude cannot verify this, and it
  is the exact path that has failed twice.
- ⬜ **Cross-device Room TV Follow test** (2 signed-in devices). Coded, never verified.
- ⬜ Redeploy `persona-ai` (paste `supabase/functions/persona-ai/index.ts` into the
  dashboard) — **now much less urgent**, since most slides never reach the model.
- ⬜ Retry the Google Slides import once that is done.
