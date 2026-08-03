# Jungle — Session 23 Build Prompt

Keep building. Session 22 took §4.5's standing method — **read back the STORED row after every
UI write** — and inverted it. That inversion is the whole session:

> **Read back the SCREEN after every stored write.**

Three surfaces were showing a gym something other than what it had saved. In **every case
storage was correct**, which is exactly why nothing in the suite could see them. A field with
more than one READER drifts precisely the way a column with more than one writer does — and it
is harder to notice, because nothing is corrupted. The coach is simply told the wrong thing.

The sharpest one: **"Apply to all surfaces" applied to none of them.** A studio uploads its
logo, generates an identity, presses a button whose own label promises the thing — and gets its
palette written to storage, previewed correctly on the Brand Studio, and rendered nowhere else
in the product.

**Last commit is `2c83c8b`**, tree clean, **pushed**. Gates green:
**`lint:crash` 0 · 767 unit (28 files, no todos) · 291 e2e (31 spec files, no fixme) ·
build 204.50 KB index + 339.98 KB StaffApp + 91.04 KB PersonasScreen + 5.81 KB ClassSummary +
0.85 KB summaryApi.** App.jsx **3,493 lines** (+111).

This file supersedes `SESSION-22-PROMPT.md`, now in `docs/history/`.

**Do not re-raise:** N4 (built), the eight-screen a11y sweep, the crash gate's JSX blind spot,
the AST `jsx` script, docs hygiene, I10, DEC-12, DEC-13, I6, "useSpotify ~2.5 KB", `SLOT_LABELS`,
`eslint-plugin-react`, the `class_type` vocabulary (closed s21), "member CSV import ↔ the status
model" (premise wrong, closed s21), and **everything in §1 below** — the Dashboard's
`CLASS_COLORS`, the Start→Builder class type, the Brand Studio custom-skin application, Browse
Library's initial class, the Library's empty-pool states, the CSV backfill, and the
import→retention join. All closed, all with tests that fail when reverted.

---

## 🔴 0a. You are probably not alone in this repo

Unchanged and still structural. `origin/main` was untouched through sessions 14–22.

- **`git fetch` before you commit, and check your commit's parent is what you expected.**
- **The system-prompt `gitStatus` snapshot can disagree with a live `git status`.** Trust the
  live one. It was wrong again this session.
- New shared surfaces after session 22:
  - **`src/lib/skins.js`** — `PRESET_SKINS`, `baseSkin(id)`, `resolveSkinTokens(id, custom)`.
    `PRESET_SKINS` **moved out of App.jsx**; if a document says it lives there, that document
    predates `88e4c2c`.
  - **`e2e/rawValueScan.js`** — `rawValues(page)`, `proveScannerLive(page, where)`.
  - `BuilderScreen` takes a new **`scheduledType`** prop; `LibraryBrowserModal` takes
    **`initialClass`**. Both optional, both default to the old behaviour.
  - `getDayClasses` now returns **`typeLabel`** alongside `type`. `CLASS_COLORS` and
    `CLASS_TYPES` are **deleted**.
- **`.gitignore` now ignores `~$*`.** Word writes a lock file beside an open document and one
  appeared at `src/~$ngle_tech_spec.docx`, inside the source tree, two characters from being
  swept into a `git add -A`. **Check `git status --short` before every `git add -A` anyway.**
- Root is **6 `.md`**; `docs/` holds 13; `docs/history/` holds **19**. Sessions 6–**20** of the
  handoff are in `docs/history/HANDOFF-ARCHIVE.md`.

---

## 🔴 0b. Measurement traps

Sessions 16–21's all carry forward. Session 22 added four, and the first two are the important
ones.

### 1. 🔴 THE TOOL THAT LIES TO YOU MAY BE YOUR OWN OUTPUT FILTER

A raw-value sweep reported **nine clean screens**, and its own positive control came back
**empty** — which read as a broken scanner and nearly became a wrong conclusion in both
directions. The scanner was fine. The `Select-String` pattern I piped it through matched the
control's *summary* line and silently dropped the JSON body underneath it.

**"A truncated result is not a negative result" applies to your own filters, not only to tool
output.** Print one finding per line, and never pipe a control's output through a pattern you
have not tested against a known hit.

The same trap, twice in one session: a `Select-String … | Select-Object -First 25` over the
archive's headings stopped before line 1765 and reported session 19's block **absent**. It was
there. That went as far as a written commit message before the guard in a one-shot script
caught it.

### 2. 🔴 A STALE FIXTURE HIDES A DEFECT EXACTLY LIKE A WRONG ASSERTION, AND LOOKS FINE

`e2e/honesty.spec.js` asserted *"a scheduled class says its type in words on the Dashboard"* —
the right assertion, on the right screen — and it **passed against session 22's defect for two
sessions.** Its fixture seeded `type: "Hyrox"`, the vocabulary the Schedule stopped writing in
session 21, so the raw stored value *happened to be* the human word. A screen printing storage
and a screen looking up a label were indistinguishable.

Session 21's §0b#2 said a passing test can encode the defect. **This is its second form: a
passing test whose FIXTURE is stale exercises nothing.** When a stored vocabulary changes,
**grep the fixtures, not only the assertions.** `memberSummary.spec.js` had the same problem
(`classType: "Conditioning"` in a payload built from a column that holds keys).

### 3. A coincidence can mask a defect — pick the field that cannot agree by chance

"Apply to all surfaces" survived because the accent derived from Jungle's own green icon
**equals Canopy's accent**. Any reasonable spot-check picks the accent. The derived *background*
(`#0b130e` vs `#0A0F0C`) is what exposed it.

### 4. Fixing a defect can arm the one underneath it

The Fine-tune draft re-synced on `[activeSkinId]` only, so "Apply to all surfaces" never fired
it. Harmless while the app **ignored** custom tokens. The moment the app started wearing them,
the screen repainted in the new identity while the swatches below still showed the old one —
and a coach nudging one afterwards would overwrite the identity they had just generated.
**After every fix, ask what was inert only because the thing above it was broken.**

### 5. Carried forward, unchanged

A mutation that changes nothing proves nothing (establish which) · a passing test can encode the
defect · `Grep` on Windows path-normalises `//` into `\` in its output — `Read` shows the real
bytes · `Measure-Object -Line` misses blank lines · check what a measurement measured for a PASS
*and* a FAIL · a tool is not evidence until proven · assert your scanner found something · a
frozen clock makes any `Date.now()`-derived id non-unique · an assertion whose expected state is
already the default proves nothing · a node script a test imports must guard side effects behind
a run-as-main check · `checkVisibility()` not `offsetParent` · **a negative result needs a
positive control in the same run** · before you hide or narrow anything a user can also CREATE
or EDIT, find that path and check it.

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

## 0. Trust ranking

| Rank | Source | Why |
|---|---|---|
| 1 | **A passing test** | `e2e/` drives the real UI; `src/lib/*.test.js` pins the arithmetic. ⚠️ **Qualified twice now** — session 21: a test can pin a defect (§0b#2). Session 22: a test whose FIXTURE is stale exercises nothing, and looks identical to one that works. |
| 2 | **`SESSION-HANDOFF.md` top block + this file** | Written against the code at the end of the session that changed it. |
| 3 | As-built spec **§3 (design), §12 (backlog)** | **§12 supersedes §7c.** |
| 4 | As-built spec §1, §2, §4, §7b, §7c, §9 | These drift. |
| 5 | `docs/history/**` — including `HANDOFF-ARCHIVE.md` | **RECORDS, not pointers.** |
| 6 | `Jungle - Delta & Backlog Breakdown.md` | **HISTORICAL.** ⚠️ gitignored, local-only. |

⚠️ **Verify a named backlog item against the CODE before spending a session on it.** Session 17
found I10 ranked top 39 commits after it shipped. Session 20 found the top item real and empty.
Session 21 found an item recorded DONE that was half-done. **Session 22 is the fourth variant:
an item recorded as a bundle-splitting chore (`BrandStudioScreen` "needs a shared module for
`PRESET_SKINS`") that was actually hiding a product defect** — the shared module was the fix,
and the reason to build it had nothing to do with bundle size.

---

## 1. What session 22 shipped — `302eadf` → `2c83c8b`, seven commits

### 1a. 🔴 Start carried the class's NAME and not its TYPE

Driving §10.1's door — schedule a gym-authored type, press **Start**, run it, check somebody in
— found that the empty movement pools behave fine and that `handleStartScheduled` **never
touches `classChoice`**. A coach who scheduled Barre and pressed Start got a Builder whose
header read `Barre Flow — 40 min · 5 stages · CrossFit`, whose dropdown said CrossFit, and whose
plan was Back Squat and Burpee Complex. The pinned banner two rows above correctly said
"Running Barre Flow from the schedule". Press ▶ Start Session without noticing and the room gets
a CrossFit class.

True of **every** class type, since §3A. Only *fixable* since `ce96f91`: before that the
Schedule's `"HIIT"` was not a catalogue key and could not have been handed to `classChoice`.

**Stated, not applied** — the Class row grows `Scheduled as Barre · [Load Barre]`, routed
through the existing `handleClassChange` so a draft with custom exercises still gets the
replace-your-stages confirm. Rebuilding silently would throw away a plan the coach may have
spent the morning on, at 17:58 with the room filling up.

🔴 The catalogue guard on it is **load-bearing, not cosmetic**: mutating
`scheduledType && LIB[scheduledType]` → `scheduledType` produces `TypeError: Cannot read
properties of undefined (reading 'label')` and an error boundary over the whole Builder, for any
gym still holding one pre-session-21 `"Mobility"` rule.

### 1b. `CLASS_COLORS` was `CAT_COLOR`'s twin, one screen over

Session 21 deleted `CAT_COLOR` from `CalendarScreen`. `App.jsx` held the same eight capitalised
display strings under another name, and it had already stopped working: once the Schedule stored
keys, **every class on every gym's dashboard drew the same grey bar**, and the type text beside
it printed the stored value raw — `GYM-BARRE-MRKHJ2LC` as the name of a coach's own class type.
`getDayClasses` now reads `getLibrary()` and heals with `resolveClassType`. `CLASS_TYPES` went
too: a third hardcoded list with no reader anywhere, invisible to the linter because
`eslint.config.js` sets `varsIgnorePattern: '^[A-Z_]'` on `no-unused-vars` — see §8.4, which is
the whole reason the `dead` script is worth the hour.

### 1c. 🔴 "Apply to all surfaces" applied to none of them

Two defects stacked, **both invisible without a reload**:

- `applyGenerated` writes the generated tokens and keeps the skin id `"canopy"` — deliberately,
  as the BASE. But the App root honoured overrides only when the id was literally `"custom"`,
  while Brand Studio's own swatches merged them over the base. **Two answers to one question,
  in two places.**
- **`"custom"` is not a skin.** `PRESET_SKINS["custom"]` is `undefined`, so `applySkinCSS`
  received `{}` for its `meta` and never wrote `--display`, `--body`, `--glow` or `--num`.
  In-session the previous paint's values were still on `:root`, so it looked right — and **a gym
  on Atelier lost Instrument Serif the next time they opened the app.** Pulse lost its glow and
  its tabular numerals.

`src/lib/skins.js` now owns the question. It is not "is the id `custom`", it is "are there
override tokens" — the rule the preset highlight (`activeSkinId === p.id && !customSkinTokens`)
always used. Overrides are a **palette on top of the skin the gym chose**; the base keeps its
id, fonts, voice and programme tints.

⚠️ **This is why A13 is now worth more than it was.** `summaryApi.readBrandTokens` reads the
live CSS custom properties, so before this fix a member link from a gym that used the logo
generator would have carried **Canopy's** palette. The member-facing page could not have looked
like the studio.

### 1d. The rest

| | |
|---|---|
| Browse Library | Opened on `classKeys[0]` — CrossFit — whatever class the coach was building. `initialClass` now follows the Builder; the nav destination has no class in hand and still opens on the first, asserted. |
| Empty-pool Library | **Checked and correct.** Browsing says "No exercises for this stage yet"; editing offers the one control; chip and tab counts are honest zeroes. **No built-in type has an empty pool** — that is the control, and it is why this state had never rendered before DEC-16. Not every look finds a defect. |
| `e2e/rawValues.spec.js` | The defect generalised: 4 rules (UUID, `gym-` key, `snake_case`, call-site id) over 9 screens, 4 revealed panels and **the member summary page**. Every test carries `proveScannerLive()`. |
| `e2e/csvImport.spec.js` | The CSV backfill driven for the first time, and it **holds** — including a gym that authored "Barre" absorbing imported "Barre" onto its own key. Plus the import→retention join: a lapse is flagged with its arithmetic, stale history **pauses the alerts and says why**, and the new-member rule stays silent on unknown tenure. |
| a11y | Three surfaces no scan had reached: the Schedule **with classes on it**, the edit dialog's conditional legacy `<option>`, and the Builder reached **from** the Schedule. `revealed.spec.js`'s nameless-fields test had no positive control of its own; added. |
| Docs | Session 19's archive block moved into newest-first order; archive title now "6–20". |

### Design decisions worth not re-litigating

- **The scheduled-type notice states, it does not apply.** Non-destructive by design.
- **An override is a palette, not a fourth skin.** "Save custom tokens" no longer writes
  `jungle_skin: "custom"`; a store that already holds it resolves to the canopy base, same as
  before.
- **`joinedAt: ""` on an imported member is correct** and now tested: rule 1 is a claim about
  TENURE and inferring one from the first imported check-in would call a five-year regular a
  new member.

---

## 2. 🔬 The method — now two-directional

1. **Ask the generic question, not the enumerated one.**
2. **Drive PAST the first render** — keyboard, focus, hover, touch, effects, *and data*.
3. **Drive the UI and read back the STORED object.** (Sessions 19–21's rule. Still true.)
4. 🔴 **Then read back the SCREEN.** Session 22's three defects were all correct writes and
   wrong reads. **A field with more than one READER drifts exactly like a column with more than
   one writer**, and it is harder to spot because nothing is corrupted.
5. **Prove a tool before trusting it** — including your own output filter (§0b#1) — and **prove
   a test can fail**, then check the mutation was not a no-op.
6. **A negative result needs a positive control in the same run.**
7. An honest blank beats a confident wrong guess. **And not every look finds a defect — saying
   so is a result** (§1d, the empty-pool Library).

---

## 3. 🟦 FEATURES STILL TO BUILD

| # | Feature | State |
|---|---|---|
| ~~N4~~ | ~~Member magic-link summary~~ | ✅ **BUILT (session 19).** ⛔ Deploy = `DYLAN-QUEUE.md` **A12**. **Still never executed — FOUR sessions running.** |
| **P2** | **Capacitor wrap** | 🟡 Unblocked in principle; **wait until A13 proves a real member opens a real link.** |
| **F6** | Per-gym privacy/consent page | ⛔ Unbuilt. N4 collects nothing, so no consent record is owed — the moment anything member-identifying is added this becomes a blocker. `recordConsent` still has zero callers and **that is still correct**. |

**Outcome tier, none started:** **N2** cohort analytics (waiting on attendance volume → the
pilot; **its grouping column is consistent across all three writers and now driven end to end,
§1**), **N3-LLM** win-back drafting (rules decide, model drafts — do not invert), **F1 + PAR-Q**
(needs a migration; PAR-Q must land in the SAME change as individualised load), **D1** taxonomy
LLM fallback (deferred by design), **F4-QR** (never loosen RLS to `anon`; the token half EXISTS).

**Deliberately unbuilt — do not "fix" these:** consent notice surface · Templates · Glossary ·
Discover · Integrations · attendee b64 share · **Music / Auto-DJ** (cut, quarantined in
`src/music/`, **do not undo the `FLAGS.music` gates** — each is load-bearing for ~12.7 KB) ·
member data on the summary page.

---

## 4. 🟧 TECH DEBT — what is actually left

### 4.1 Structural
**Empty.** Sixth session running. App.jsx is 3,493 lines and **grew 111 this session** — the
first growth in five sessions, all of it the scheduled-type notice and its reasoning.

### 4.2 Bundle / performance
`I9` leftovers are **weaker than they look, and session 22 is the cautionary tale**: the
`BrandStudioScreen` item was recorded as "needs a shared module for `PRESET_SKINS`", and
building that module turned out to be the fix for a product defect that had nothing to do with
bundle size. `LibraryBrowserModal` (its 58 KB of data STAYS — only the JSX leaves) and
`AdminTeamScreen` remain. **Measure before splitting**; `build-sw` precaches every emitted
chunk, so a chunk nothing fetches costs every install. Fixed costs: `react-dom` 177 KB ·
`@supabase/*` ~198 KB (`storage-js` 22 KB unused — **Dylan said leave it**) ·
`src/data/library.js` 58 KB.

📏 Production shape last measured session 19 at `777492d`: a **member** downloads **206.69 KB**,
staff 782.71 KB. Quote absolutes, never percentages. ⚠️ The credential-less local build and the
prod-shaped build disagree on `index` (204.50 vs 198.29 KB) — both real, never compare across.
**Session 22 left `index` byte-identical across all seven commits**; the member path was not
touched.

### 4.3 Sync / data plumbing
**I14** hydrate pagination (do at first paying gym) · **I8** server-side media proxy (the
RapidAPI key field is the last client-side third-party access) · `sync_incidents` telemetry
(post-pilot) · **`class_summaries` is NOT in the sync path, deliberately** — publishing is an
act, not a side effect.

### 4.4 Tooling and hygiene
| # | Item |
|---|---|
| **The AST scripts** | §8. **Not rebuilt in session 22** — still the standing cheap item. |
| **`deadctl` blind spots** | Cannot evaluate `FLAGS.*` gating, **lacks an inert-ancestor check**, and has **no `<details>` awareness**. Over-reporting is the right direction, but **every hit needs a reachability check**. |
| **`sync-token-core.mjs`** | Run `node scripts/sync-token-core.mjs` after ANY edit to `src/lib/classToken.js`. `--check` exits 1 if stale. |
| **Docs** | ✅ Root 6 `.md`; `docs/` 13; `docs/history/` 19. **Keep `SESSION-HANDOFF.md` to two session blocks** — move the third into `HANDOFF-ARCHIVE.md` **in newest-first order**, which session 21 did not (it appended). |
| **`src/test_probe.txt`** | One line, `test456_EDITED`, **tracked**, committed 2026-07-02 in two `Auto-deploy:` commits — someone testing the deploy pipeline a month before session 1. Nothing imports it, so Vite never emits it and it costs zero bytes; it is simply a stray in the source tree. Delete it in passing. Left alone in session 22 only because it had nothing to do with the commit in hand. |

### 4.5 Test coverage gaps — where the next defect is

| Area | Gap |
|---|---|
| 🔴 **The Personas screen, read back** | **The highest-yield item now.** 91 KB, the most stored shapes in the product, and `PersonaPlanEditor` is the app's worst surface by control count (29 unnamed buttons and 33 nameless fields when first swept). Only ever swept for names and raw values — **never driven with a read-back of what it STORES**. See §10.2. |
| **Brand Studio's recommendation path** | The last Brand Studio surface with no test. `runRecommend` → `applyRecommendation` sets `draftTokens` only. ⚠️ **That is NOT a defect** — the panel says so twice, in its own copy ("straight into the swatches below" and "Applied to the swatches below … Tweak, then Save"), and `generateSkinFromPalette` returns all eight tokens. Both phantoms were drafted into this prompt and removed by reading the code; **do not re-raise either.** §10.3. |
| **Read back the SCREEN after every stored write** | The new standing method. `rawValues.spec.js` covers one class of it (storage vocabulary reaching a human); the general form is any value with two readers. |
| **N4's Edge Functions** | ⛔ Not reachable locally, by construction. `DYLAN-QUEUE.md` A12/A13. |
| **Team admin · Room TV Follow** | ⛔ Not reachable locally (`!supabaseEnabled` / `room.js:16`). `DYLAN-QUEUE.md` A11. |

---

## 5. ⛔ Blocked on Dylan — `DYLAN-QUEUE.md`

**`DYLAN-QUEUE.md` at repo root is the live list**, with exact dashboard clicks, commands,
expected output, failure modes and undo steps. **Part B is EMPTY.** Read it and ask what has
moved. **Confirmed at the top of session 22: A12 and A13 are both still undone.**

- 🔴 **A12 — turn on member links.** One secret (`JUNGLE_SUMMARY_SECRET`), two function pastes
  (`summary-token` **JWT ON**, `summary-read` 🔴 **JWT OFF**), migration 0009. ~25 min.
  **Until this is done, N4 is code nobody has run. FOUR sessions now.**
- 🔴 **A13 — open a member link on a phone.** The first time anything in Jungle is seen by a
  non-staff person — and **worth more than it was**: before session 22's skin fix, a gym that
  built its identity from its logo would have had the member page render in Canopy. The
  question "does it look like *your* studio?" only became answerable this session.
- **A1 Supabase region check** — never confirmed as `ap-southeast-1`, and a project's region
  cannot be changed in place. **Still the one item that gets dramatically more expensive with
  time**, and it is a five-minute read-only check.
- **A3/A4 Pro + a real restore drill** · **A10 the lawyer** (2–4 weeks, runs in parallel) ·
  **A5/A6 redeploy `persona-ai` + switch to Claude** · **A7 drive a real deck through Slides
  import** (the wedge feature, never once run against a real corpus) · **A11 the seven live checks**.

---

## 6. What the crash gate still cannot see

`react/jsx-no-undef` catches `<Foo/>` where `Foo` is undefined. Two things it does **not** catch:

1. **A screen that is ABSENT rather than undefined.** `src/lib/navRoutes.test.js` guards this
   half. **Drive the real UI and assert the coach LANDED**, by a control only the destination has.
2. **An identifier that resolves and then throws.** `e2e/screens.spec.js` asserts the error
   boundary is **absent** on all nine screens. **If you add a screen, add it to `SCREENS`.**

⚠️ **`ClassSummary` is deliberately NOT in `SCREENS`** — not a nav destination, renders outside
`App`, has its own spec. Adding it would break every sweep because `nav()` cannot reach it.

**Related:** a `{/* comment */}` as the **first child inside `&& ( … )`** is a JSX parse error.
Same for a comment between `return (` and the root element; put it above the `return`.

---

## 7. Constraints and gotchas — all of these have bitten

**New in session 22:**

- 🔴 **Your own output filter is a tool, and it lies.** §0b#1.
- 🔴 **A stale FIXTURE hides a defect exactly like a wrong assertion.** §0b#2.
- **A branding assertion means nothing without a reload.** Both Brand Studio defects pass
  in-session, because `:root` still carries the previous paint's custom properties.
- **`applySkinCSS(tokens, meta)` writes `--display` / `--body` / `--glow` / `--num` ONLY when
  `meta` has them.** Pass a real skin object, never `PRESET_SKINS[id] || {}` — an id with no
  preset behind it silently strips a gym's typography on the next load.
- **`resolveSkinTokens(activeSkinId, customSkinTokens)` is the single answer to "what palette is
  this gym running".** Anything resolving a gym's palette by preset id downgrades exactly the
  gyms that cared most about looking like themselves — `summaryApi.js` said so first.
- **A gym-authored type's colour is `var(--accent)`.** Fine where it is used neat (the Dashboard
  bar); **fatal where 8-bit hex alpha is appended** (`${c}18` on the Schedule grid). Any new
  colour source needs the hex guard `typeColor` has.
- **`class_instances.class_type` takes a type KEY. THREE doors write it** (Runner, Schedule
  publish, CSV import) and a fourth delegates (`startScheduledClass`). All three are now driven
  end to end.
- **Appending to a UTF-8 source file with PowerShell `Out-File -Append -Encoding utf8` is safe**
  (it does not read the file back) — but it writes **CRLF**, so git warns on commit. Harmless.
  **`Get-Content`/`Set-Content` round-trips are still forbidden.** For doc surgery, write a
  one-shot `.mjs` in the repo with explicit `readFileSync(f, "utf8")` / `writeFileSync`, **give
  it guards that refuse to run twice**, print the result in the same run, then delete it.

**Carried forward — all still true:**

- **No infra changes without asking Dylan.** Sentry = sub-processor; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue them, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` reads the MIGRATIONS and compares — **add a row when you write
  a new one.** Trap: `members.status = cancelled` (two Ls) vs `entity_status = canceled` (one L).
- **Mutate the code to prove a test can fail, and CONFIRM the mutation applied. Revert with the
  INVERSE mutation, never `git checkout <file>`.** **Anchor mutations on unique text.** Mutate a
  VALUE, not a control-flow branch — `if (false && x) y;` inside a `for...of` breaks esbuild.
  ⚠️ **A mutation left in the tree is a live defect.** Session 22 ended a turn with
  `ABSENCE_DAYS = 90` uncommitted; check `git diff` before you stop.
- **StrictMode defeats a "have I mounted yet" ref** — dev-only. `src/ui/useAfterMount.js`.
- **A hook cannot be called from inside `{cond && …}`.** Six components exist for this reason.
- **`page.clock.setFixedTime` freezes `Date.now()`.** Advance it between actions whose identity
  you need to distinguish. It **survives `page.reload()`**, which is what makes a seeded
  Start-button fixture work.
- **Changing only the URL fragment is a same-document navigation.** In Playwright, open a member
  link via `about:blank` then `goto`; an explicit `page.reload()` RACES the app's own reload.
- **A test that reads a computed style must call `waitForApp(page)` first** — the app is a lazy
  chunk. Assertions on *elements* auto-wait and are unaffected.
- **Chromium logs its own "Failed to load resource" for every non-2xx** — filter exactly that
  rather than dropping `expectNoConsoleErrors`.
- **Reaching for `window` inside a lib function makes unit failures unreadable.** Inject the origin.
- **`getLibrary()` is read per render, deliberately.** Do not "optimise" it into a `useMemo([])`.
  `CalendarScreen` and `getDayClasses` both depend on this.
- **The Exercise Library is a full-screen modal at `zIndex:600`, so `nav()` cannot be called
  while it is open.** Close it first.
- **`window.prompt`/`window.confirm` need `page.once("dialog", …)`, and Playwright
  AUTO-DISMISSES**, so a test that ignores the dialog silently exercises the *cancel* path and
  still passes.
- **`toContainText` reads `textContent` and ignores `text-transform`.** The Schedule's grid
  chips and the Dashboard's type chip are `uppercase`; match case-insensitively.
- **`innerText` returns "" for content inside some scroll containers** — the Library modal's
  panel reads blank that way. Use `textContent` when you are extracting, `innerText` when you
  are asserting what a human sees.
- **A phone gets the bottom bar** (`Run` / `Build` / `Members` / `Brand` / `More`, inside
  `page.locator("nav").first()`). `nav()` is desktop-only.
- **Write commit messages to a file and use `git commit -F`.**
- **`inert` is asserted by focus REFUSAL**, not by `getByRole` or `tabIndex`.
- **Rollup shakes at EXPORT granularity, not module granularity.**
- **Playwright's `dragTo` drives HTML5 drag-and-drop in Chromium.**
- **Date-dependent fixtures:** `page.clock.setFixedTime` before `freshApp`, or build every
  instant relative to now.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`.** PowerShell's
  console also *displays* mojibake for UTF-8 — that is the terminal, not the file. Verify with
  `node -e` counting `�`.
- **A JSX attribute added via a shell one-liner loses its quotes.** Use the editor.
- **PowerShell tore apart a `node -e` one-liner containing quotes.** Write a `.mjs` and run it.
  ⚠️ **A `.mjs` in the scratchpad cannot resolve the repo's `node_modules`** — put it in the
  repo, run it, delete it.
- **A `Buffer` reference in a test file fails `lint:crash`.** For a file-upload fixture, point
  `setInputFiles` at a real path in `public/` — `public/icon-512.png` is what the Brand Studio
  spec uses.
- **Resizing without reloading shows a stale layout.** Playwright is immune.
- **The Room TV mode switch auto-hides after 4.5s.** Wake and act in the SAME test.
  ⚠️ `gotoDisplay` starts from the app shell, so **reload between boards**.
- **The browser console buffer persists across reloads AND dev-server restarts.**
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e and CI — not local `dist/`.
- **Screenshots via the browser tools hang** — use `read_page` / `get_page_text` /
  `javascript_tool`, wrapping snippets in an IIFE. **For a real screenshot, drive Playwright
  directly** (session 22 shot the Dashboard card and the Builder's notice that way, clipping to
  a `getBoundingClientRect`). PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it. Base path
  is `/Jungle-App/`.
- **A second chat usually holds :5173.** Use a fixed alt port (`--port` + `--strictPort`); e2e
  has 5191/5192, and `playwright test` starts and reuses its own server on 5191 —
  **`--workers=1` when a probe prints a lot**, or the output interleaves.
  **Revert `.claude/launch.json` before committing.**
- **PowerShell:** `npm.cmd` / `npx.cmd`. PS 5.1 wraps native stderr as `NativeCommandError` —
  `git push` and `vite build` "errors" that still report success are that, not failures. `gh` is
  **not installed**; use the GitHub REST API via `Invoke-RestMethod`
  (`api.github.com/repos/killdylz/Jungle-App/actions/runs?per_page=5` for CI status).
  ⚠️ `vitest --reporter=basic` is **not valid in vitest 4**. Omit the flag.
- **The crash gate must be 0 and is NOT the style baseline.** The ~215 full-eslint messages are
  an advisory baseline. Never relax a rule to get a deploy out.
- **An honest blank beats a confident wrong guess.**

---

## 8. The AST scripts — rebuild them, they are cheap

**Still not done.** All use `@babel/parser` + `@babel/traverse` (present transitively) via
`createRequire` pointed at the repo's `package.json`. **Anchor slices on declaration NAMES, not
line numbers.**

1. **`outline <file>`** — every top-level declaration with its line span.
2. **`scan <file> <Decl,…>`** — what imports the moved code needs, which same-file declarations
   it leans on, which of those the rest of the file still uses (⇒ shared module, not a move).
   **Run it transitively.**
3. ~~**`jsx`**~~ — **redundant**; `react/jsx-no-undef` is in the crash gate.
4. **`dead <file…>`** — imported bindings never used. 🔴 **This is the script's whole
   justification, and session 22 measured the hole exactly:** `eslint.config.js:26` sets
   `'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]`. That pattern exempts every
   SCREAMING_CASE constant, **every PascalCase component, and every `_`-prefixed binding** from
   the unused check. `CLASS_TYPES` — a dead hardcoded class-type list — sat in App.jsx
   unreported until someone read it by eye. An unused `<Component>` or a stale `_baseSkin`
   would go the same way. **End it with a `scanned N/M` line and exit non-zero on zero.**
5. **`deadctl <file…>`** — dead controls, passive-only, fake affordances, unused props. §4.4 for
   blind spots.
6. **`handlers`** — every `on*` attribute on an **intrinsic (lowercase)** element, bucketed by
   event type.

⚠️ **A dead named import costs ZERO bytes** — rollup tree-shakes it. Removing them buys an
accurate reading of what a file depends on.
⚠️ **Beware a local declaration that shadows an import** — `FloorLiveScreen`'s own `fmt`.

---

## 9. Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

Expect **0 crash findings · 767 unit (28 files, no todos) · 291 e2e (31 spec files, no fixme) ·
a five-chunk build** (index ~204.50 KB · StaffApp ~339.98 KB · PersonasScreen ~91.04 KB ·
ClassSummary ~5.81 KB · summaryApi ~0.85 KB, credential-less). CI runs the same chain on Linux;
the Playwright-in-CI question was settled in session 6 — **do not re-investigate**.

⚠️ e2e can fail broadly on a stale server holding the e2e port. **Re-run once before investigating.**

---

## 10. Suggested order for session 23

1. **Ask Dylan about A12/A13 and A1 first.** Four sessions. If A12 is done, verifying N4 against
   the real functions displaces everything below — it is the only part of the product untested
   *by construction*, and session 22 made A13 more informative than it has ever been (§1c).
2. 🔴 **The Personas screen, driven with a read-back.** 91 KB — the largest lazy chunk after
   StaffApp — the most stored shapes in the product (`jungle_personas`, `jungle_persona_plans`,
   `jungle_persona_movements`, `jungle_persona_generations`), and `PersonaPlanEditor` is the
   app's worst surface by control count (29 unnamed buttons and 33 nameless fields when first
   swept). It has **only ever been swept for accessible names and raw values**. Nothing has
   driven an edit and read back what it STORED. Apply §2.3 *and* §2.4 — this is the biggest
   surface in the product where neither has been done.

   It is also the surface behind the wedge: `A7` puts a real deck through Slides import, and
   what it lands in is this.

3. **Drive Brand Studio's recommendation path** — the last surface on that screen with no test.
   Smaller than it looks, and the write-up is a worked example of §0's rule.

   ⚠️ **Two phantoms I drafted into this item and then removed by reading the code.** Do not
   re-raise either:
   - *"`applyRecommendation` sets `draftTokens` and never saves, and nothing tells the coach."*
     **False.** The panel says it twice in its own copy — *"straight into the swatches below"*,
     and after a recommendation lands, *"Applied to the swatches below (based on the Canopy
     preset). Tweak, then Save."* I had asserted a defect from reading a handler without
     reading the markup thirty lines below it.
   - *"`setDraftTokens({ ...skin.tokens })` is a replace, so a generator that omits `border`
     would write a partial blob."* **False.** `generateSkinFromPalette` returns
     `tokens: { bg, card, navy, border, accent, green, text, muted }` — all eight, in both the
     light and dark branches.

   What is left is honest and modest: **the panel has no test at all.** Drive it, confirm the
   recommendation reaches the swatches and that Save persists the whole set, and reload before
   believing it (§0b#3). Note that the LLM branch is unreachable locally (`supabaseEnabled` is
   false), so only the curated matcher runs — say that rather than claiming both.
4. **Rebuild the AST scripts (§8) and run `dead` + `deadctl`** with a reachability check on
   every hit. Two sessions overdue and genuinely cheap. `CLASS_TYPES` is proof the `dead` script
   would have earned its keep — and §8.4 now records the exact size of the hole it fills.
5. **Do not re-run the eight-screen a11y sweep, the empty-pool Library check, or the CSV
   backfill** as headline items. Done, clean, and now covered by tests that fail when reverted.
6. **Do not start N2/N3.** They wait on attendance volume → the pilot → `DYLAN-QUEUE.md` Part A.
7. **Do not start P2 (Capacitor)** until A13 proves a real member opened a real link.
8. **Keep `SESSION-HANDOFF.md` to two session blocks.** Move session 21's into
   `docs/history/HANDOFF-ARCHIVE.md` **above session 20** — newest first. Session 21 appended
   instead and it took a session to notice.
