# Jungle — Next Session Prompt (session 5)

_Paste this whole file as the opening message of the next session._
_Written 2026-07-19, after session 4. `main` = `823a492`, **4 commits unpushed**._

> **If you are also holding Fable's audit response**, read `FABLE-AUDIT-PROMPT.md` first to see
> what was asked, then treat Fable's answer as the priority order for this session and this file
> as the ground truth about what actually exists. Where they disagree about the *state of the
> code*, this file and the code win; where they disagree about *direction*, Fable's answer wins
> and this file should be updated to match.

---

## The product, in one paragraph

Jungle is a **white-label class operating system for boutique fitness studios** — React + Vite +
Supabase, deployed to GitHub Pages. It is not a scheduling tool with a dashboard bolted on. **It is
an experience layer.** Everything is judged by whether it makes life better for three people: the
**trainer** (plans faster, coaches better, isn't fighting software mid-class), the **gym owner**
(sees who is slipping away in time to act, and looks premium doing it), and the **member** (walks
into a room that knows who they are and what they're doing). A feature that doesn't improve one of
those three lives is not a feature — it is theatre, and this repo has a documented history of
deleting theatre rather than shipping it.

**Commercial context, new as of session 4:** Dylan intends to launch this at the Singapore gym he
currently freelances at, then sell it to other gyms, and offer B2B services through that first gym.
That changes what "done" means — see `FABLE-AUDIT-PROMPT.md`.

## Start here

- **Repo:** `C:\Users\dylan\jungle-app` (request folder access first).
- **Confirm:** repo access, `git status`, `main` = `823a492`, tree clean, gates green.
  Then **propose a plan before editing.**
- **Read, in this order:**
  1. `NEXT-SESSION-PROMPT.md` — this file.
  2. `SESSION-HANDOFF.md` — cold-start brief + everything sessions 1–4 shipped.
  3. `Jungle - Functional, Design & Technical Spec (As-Built).md` — **current state.**
     §9.1–9.2 (blueprints + taxonomy, both now carrying a **Status** block recording what actually
     shipped and what did not), §10 (platform), §11 (UI language), §12 (backlog), §13 (open
     questions — Q7 and Q8 are now settled and marked as such).
  4. `FABLE-AUDIT-PROMPT.md` — what Fable is being asked to decide.
- **Live site:** https://killdylz.github.io/Jungle-App/ — deploy = push to `main`.
- **Three gates:** `lint:crash` → `test` → `build`. The crash gate must be **0** and is NOT the
  style baseline (`npm run lint` is a ~215-message advisory baseline). **Never relax a rule to get
  a deploy out.**

## ⛔ Do these first — they are blocking

1. **`git push`.** Four commits sit local; nothing from session 4 has deployed.
2. **APPLY MIGRATION 0008** (`supabase/migrations/0008_retention_actions.sql`) by pasting it into
   the Supabase dashboard. Until then the at-risk action ledger is local-only and **A3 ("do
   operators act on alerts?") stays unmeasurable** — which was the entire point of building it.
3. **LIVE SYNC CHECK (still pending from session 3).** Run a class, sweep two names in Check in,
   confirm rows reach Postgres — not just localStorage. Claude cannot verify this; it is the exact
   path that has failed twice.
4. **Cross-device Room TV Follow test** (2 signed-in devices). Coded, never verified.

## What session 4 built — `fd75fb0` → `823a492`

| Commit | What |
|---|---|
| `c54d184` | **D1 — movement taxonomy.** `src/lib/movementTaxonomy.js`: `CATEGORIES`, `classifyMovement`, `categoryOf`. Ordered rules copied from `inferEquip`; unknowns return `""` and surface as **"needs category"**. Wired into `aggregateMovements` and `classCategory`; the catalog gains a category picker. |
| `4dd0e25` | **Dropped the `hyrox` category** on Dylan's call — *a circuit class can contain Hyrox movements*. Hyrox is a format, not a movement property. `HYROX_STATIONS` survives for the blueprint preset. Settles §13 Q8. |
| `275099f` | **D2 — Class Blueprints ("class shape").** Derive → present → edit → **deterministic local drafting** from the coach's own catalog. Stored in `style_profile.blueprints` (no migration). Settles §13 Q7. |
| `823a492` | **N3 UI.** At-risk list on Members, per-flag "why" with its numbers, append-only action ledger. **Migration 0008 written but NOT APPLIED.** |

164 → **295 tests**, every new test mutation-verified.

**Six defects were found by driving the real UI, none by unit tests.** Two more were found by
mutation testing catching *weak tests* rather than weak code. Both patterns are covered in the
gotchas below — they are the most transferable lessons from the session.

## Recommended order for session 5

**If Fable's audit has come back, its priorities replace this list.** Otherwise:

1. **UI language pass (U1, §11).** The biggest remaining gap between what this is and what it
   feels like. Real leaks still in the code: `"Add to corpus"`, `"Paste JSON"`, `"Extract & add"`,
   `"Extracted:"`, `"the built-in parser only understood 53% of that text"`, `"Edge Function
   returned a non-2xx status code"`, `"no blocks came back"`, `"New persona"` / `"Coach Personas"`.
   **Name the outcome, not the mechanism.** `ROLE_LABEL` / `MOVEMENT_CATEGORY_LABEL` in `App.jsx`
   are the pattern to copy. Errors say what to *do*.
2. **PWA manifest + service worker (§10).** Installable on iOS/Android/desktop with no store
   review, and the service worker closes **P7/I11** — "survives Wi-Fi loss for a full class" is
   still an untested assumption, and a room TV on gym Wi-Fi is the exact case.
3. **Blueprint-driven parsing** (§9.1's fourth requirement, not built). A blueprint tells the
   parser that for *this* coach `C1` is a warm-up — exactly the ambiguity §4.3.2 guesses at today.
4. **Cold start for a coach with NO plans.** Presets exist but are only reachable when a class type
   yields no derivable shape. A coach with zero plans has no class type, so no card at all. Needs a
   persona-level surface: name a class, pick a shape, *then* import.
5. **Members CRUD (M1)** — `RosterScreen` reads but cannot edit; no status, no joined date.

## Constraints and gotchas — these have all bitten before

- **No infra changes** (DB migrations, new services, paid APIs) without asking Dylan.
- **Free tiers only** — no paid Opus/Gemini yet.
- **Edge Functions deploy by Dylan pasting into the Supabase dashboard.**
- **A Postgres CHECK constraint rejecting a client value is this repo's recurring data-loss bug** —
  three occurrences. Pin legal values in one shared constant with a unit test. Current ones:
  `persona_plans.source`, `attendance.source` (`store.js`), `RETENTION_RULES` (`retention.js`),
  `RETENTION_ACTIONS` (`store.js`), `CATEGORIES` (`movementTaxonomy.js`).
- **QR self-check-in still cannot write through 0007's RLS.** Needs an Edge Function with the
  service-role key validating a short-lived class token. **Do NOT fix by loosening policies to
  `anon`.**
- **When you add tests, MUTATE THE CODE to prove they can fail** — and **confirm the mutation
  actually applied.** Two mutations in session 4 silently did not (the substitution found no
  match) and looked exactly like weak tests. Use a helper that hard-errors when its target string
  is absent.
- **Drive the real UI before claiming done.** Six real defects in session 4 were found this way and
  zero by unit tests. Read back the **STORED** object (`localStorage`), not the rendered one.
- **Watch for NUL bytes.** Session 4 had seven written into a source file where spaces were
  intended, and the resulting `join("\0")` *masked a real design bug*. Scan tracked source before
  committing if anything reads as binary to git.
- Local `vite build` can serve **stale** `App.jsx`. Trust the dev server and CI, not local `dist/`.
- A second chat often holds port 5173 — start your own on `--port 5180 --strictPort`, then
  **revert `.claude/launch.json` before committing**.
- Browser-pane **screenshots hang** — use `read_page` / `get_page_text` / `javascript_tool`.
- **React batches state updates**: clicking six PIN digits in one `javascript_tool` call fails.
  One click per call.
- Local build has no Supabase → localStorage + PIN build. **PIN is `080921`.** The sync path is NOT
  exercisable locally.
- PowerShell: `npm.cmd` / `npx.cmd`. Multi-line commit messages via `git commit -F <file>`.

## Still pending from Dylan

- ⬜ **`git push`** — 4 commits unpushed.
- ⬜ **Apply migration 0008.**
- ⬜ **LIVE SYNC CHECK** (most important).
- ⬜ Cross-device Room TV Follow test.
- ⬜ Redeploy `persona-ai` — needed before the blueprint-driven `generate` path can be verified at
  all. Still less urgent than it looks, since most slides never reach the model.
- ⬜ Retry the Google Slides import once that's done.
