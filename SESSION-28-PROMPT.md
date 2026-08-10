# Jungle — Session 28 Build Prompt

**Run this session autonomously. Do not stop to ask.** Every item below is buildable without
Dylan, without a server, and without a migration. Where a choice arises, make it, write the
reasoning in the commit message, and keep going.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the
testing traps and the domain rules. **This file does not repeat them.** It carries only the state,
the evidence, and the work queue.

**Last commit `8c581d0`, tree clean, pushed.**

⚠️ **This prompt was written at `a7ea434` and then §2.1's proven half was fixed at `8c581d0`, so
§2.1 is marked partly done.** Every line number and gate figure below is from `a7ea434`; the only
things that moved are the four `#0A0F0C` sites in `BrandStudioScreen`, `RosterScreen:390`, and the
addition of `e2e/brandTokens.spec.js` (so e2e is **442 across 45 spec files**, not 440/44).
**Re-derive any line number before cutting.**

### The regression, run fresh at `a7ea434` — this is measured, not carried forward

| Gate | Result |
|---|---|
| `lint:crash` | **0** |
| `npm run lint` (advisory) | **214 problems** (199 errors, 15 warnings) — the baseline, not bugs |
| unit | **875 passing**, 30 files |
| e2e | **440 passing**, 44 spec files |
| build | 6 chunks, `built in 2.69s`, SW precaching 53 files (~1377 KB) |
| `npm run size` | **0 over budget** |

Chunk detail, credential-less build:

```
index.js          204.58 / 215 KB   (4.8% headroom)
StaffApp.js       349.53 / 360 KB   (2.9% headroom)   ← the binding constraint
PersonasScreen.js  95.19 / 100 KB   (4.8% headroom)
RetentionScreen.js 12.04 /  14 KB   (14.0% headroom)
ClassSummary.js     5.81 /   8 KB
summaryApi.js       0.85 /   3 KB
member path       211.57 / 222 KB · staff path 559.79 / 575 KB
```

App.jsx is **3,787 lines**.

### The autonomy contract

- **Never block on Dylan.** If an item turns out to need him, write what he needs into
  `DYLAN-QUEUE.md`, say so in the handoff, and move to the next item.
- **Never ask which option to take.** Decide, and put the reasoning in the commit message.
- **Commit and push after each item lands green.** Do not batch a session's work into one commit.
- **Check CI by workflow name after each push** (`Deploy to GitHub Pages`). `cancelled` runs are
  superseded deploys, not failures — judge the run whose SHA is `HEAD`. Pushing again cancels the
  in-flight run, so if you want a definitive answer on a specific commit, **wait before pushing the
  next one**.
- If a gate is red and the cause is not yours, **re-run once** before investigating.

### 🔴 The rule that keeps earning its place

**Verify every item below against the code before building it.** The rate is now measured across
two sessions: session 26 found **four** false premises in its own prompt, session 27 found **six**
out of eight items. Roughly half of any prompt's specifics are wrong.

Two kinds recur, and the second is the expensive one:

- a claim about the CODE (an item already shipped, a list of three that is really a hundred);
- a claim about **why something is blocked**, which looks like architecture rather than like a
  stale row. Session 27's N2 item was parked behind "waits on rows accumulating" while the CSV
  backfill already supplied them, and its "the route already exists in three nav arrays" was
  literally true while `isViewEnabled` filtered the entry out of all three — the route was live and
  unreachable for months.

**Treat a stated REASON for a block as the least trustworthy sentence in this document.**

⚠️ **This document's own evidence was gathered by a session that made mistakes doing it.** Where a
number below is marked **[measured]** it was verified two ways; where it is marked **[unverified]**
it is a lead, not a finding. §2.1 in particular records a sweep that over-reported by about ten
times, and says why. Do not adopt an unverified number as a target.

---

## 🟥 1. Where the product is

The USP, from `docs/PRODUCT-DIRECTION.md` §1, unchanged and worth re-reading before you touch a
screen:

> Jungle learns how each coach already programs — from the slides they've been writing for years —
> and turns that into branded, ready-to-run classes on the studio's own screens, while quietly
> building the attendance record that shows who's about to quit.

**Session 27 closed the commercial gap that had been open for several sessions.** The owner's screen
now states monthly revenue at risk with its arithmetic (gated so that a gym without a price sees no
money at all), and N2 cohort analytics shipped — so the S$299 "Studio + Insight" tier's three
features all exist. `GTM-SINGAPORE.md` §2 is now describable as built rather than planned.

**What that leaves.** `PRODUCT-DIRECTION` §5 lists five things "the USP demands that is missing".
Four are done: N4 is built (undeployed — Dylan), cold start shipped in session 9, mobile layout
shipped, offline is proven. The fifth ("a price") is Jungle's own commercial identity, which is a
GTM decision and not code.

**So the queue below is no longer "finish the feature list".** It is: make the thing that exists
look and feel like a product a studio pays S$299 a month for, and then add the one number no
competitor can compute. Those are §2.1–§2.5 and §2.6 respectively.

---

## 🟥 2. The work queue, in order

### 2.1 🔴 The white-label promise has no enforcement, and it is already broken

**[measured]** The USP says "your brand on the studio's own screens". `docs/UI-UX-DIRECTION.md` §1
states the rule that delivers it — *"Tokens only — no raw hex in JSX outside `src/data`/Brand
Studio"* — and **nothing in the suite enforces it.** There is no contrast sweep and no token sweep;
`brandStudio.spec.js` reads CSS variables but only to assert specific skins.

**[measured]** Live components (excluding `AnalyticsScreen`, which is dead code) hold roughly **170
raw hex literals**. Most are harmless data or documented fallbacks — `UNKNOWN_TYPE_COLOR`,
`ClassSummary`'s `FALLBACK` palette, the Brand Studio's own preset definitions. **Check each before
touching it; several look like defects and are not.**

**[measured, verified twice] The one that is definitely a defect.** `--on-accent` exists and is
contrast-computed by `inkOn()` in `colors.js` — it picks whichever of bg/text reads better on the
accent. Four call sites in `BrandStudioScreen` ignore it and hardcode Canopy's `#0A0F0C` instead
(around App.jsx `:1278`, `:1299`, `:1312`, `:1354`). Driven with a navy accent (`#12224A`), where
`--on-accent` correctly resolved to `#F4F6F2`, the selected "Brand vibe" pill rendered
`rgb(10,15,12)` on `rgb(18,34,74)` — **1.25:1**, effectively invisible. Both colours fully opaque,
so this is not a compositing artefact. `RosterScreen.jsx:390` has the same class of bug with
`#7BE3A455`/`#7BE3A414` where `var(--green)` belongs.

**It is worst in the Brand Studio, which is the demo surface** — `PRODUCT-DIRECTION` §3 says the
first-meeting demo *is* skinning Jungle live in front of the owner.

**⚠️ THE TRAP, and it cost session 27 real time.** A quick contrast sweep reported **21
violations**; independent verification reduced that to **one**. Two reasons, and your sweep must
handle both or it will waste your session the same way:

1. **It did not composite alpha.** A chip styled `rgba(167,139,250,0.14)` was read as *solid*
   purple, so purple-on-near-white was scored 1.0:1. Every "AA" badge, every category chip and
   every `LIVE` pill was a false positive. **Composite every translucent layer against what is
   behind it, all the way to the body.**
2. **A transient read.** One element measured as white-on-white and was actually white on
   `--danger` red. Re-read before believing a single outlier.

**And the sweep needs the positive control the hard way.** Session 27's first two runs reported
"0 violations" from a tab whose `innerWidth` was **0** — every element measured 0×0 and was skipped,
so a scan of nothing looked identical to a clean scan. **Assert a minimum count of text nodes
actually measured, per screen, in the same run.**

**✅ PARTLY DONE ALREADY, at `8c581d0`.** The proven half was fixed rather than left as a known
1.25:1 control on the demo surface. Shipped: the four on-accent hardcodes (the fourth calls `inkOn`
directly against the *generated* skin's tokens, because that button is painted with the theme being
previewed rather than the applied one), `RosterScreen:390`'s mint success panel, and
**`e2e/brandTokens.spec.js`** — the first thing in the suite to enforce the tokens-only rule. It
runs on a hand-built light skin with a dark accent, carries three positive controls including a
per-screen count of text nodes actually measured, and is mutation-checked.

**What is LEFT, and it is the larger half:**

- The spec **skips translucent pairs** rather than guessing at them. That is the honest subset, not
  the finished job — it means every chip, badge and pill in the app is currently unmeasured.
  **Compositing alpha is the work**, and it is what turns this from a spot-check into the sweep.
- It runs at one width and on one skin. It should run at 390px too, and across all three presets
  plus the light custom skin.
- ~165 raw hex literals remain in live components. Most are fine; each needs a token or a comment
  saying why it cannot be one.
- Only opaque *text* pairs are checked. Borders, focus rings and icon strokes are not.

**Done when:** the sweep composites alpha, runs at both widths on a dark preset and a light custom
skin, and every raw hex left in a live component is either a token or carries a comment saying why
it cannot be.

---

### 2.2 🔴 StaffApp has 10.5 kB left, and that is the constraint on everything after it

**[measured]** `StaffApp.js` is **349.53 / 360 kB**. Session 27 spent 5.7 kB of it and had to put
`RetentionScreen` in its own lazy chunk to fit. **The next feature does not fit.** This is not
hygiene — it is the enabler for §2.6 and for anything a later session wants.

**[measured]** The cold screens still in the main chunk, with line spans in App.jsx:

| Component | Starts at | Lines | Why it can go lazy |
|---|---|---|---|
| `BrandStudioScreen` | App.jsx `:972` | **693** | Owner-only, opened rarely, and it drags the whole of `colors.js`'s generator machinery with it |
| `LibraryBrowserModal` | App.jsx `:1692` | **445** | A modal, already behind a click |
| `ProfileModal` | App.jsx `:342` | **269** | A modal, already behind a click |

(Each span runs to the next top-level `function` declaration — `normMovementName` `:1665`,
`SmartBuildDialog` `:2137` and `PinScreen` `:611` respectively. Re-derive these before cutting;
every line number in this document is from `a7ea434` and App.jsx moves every session.)

`BuilderScreen` (`:2167`–`:3016`, 849 lines) and `DashboardScreen` (`:710`–`:967`) must stay eager —
the Builder is the hot path and the Dashboard is the landing screen.

**⚠️ The pattern is established and has two traps.** `PersonasScreen` and `RetentionScreen` show the
shape (`React.lazy` + `.then(m => ({default: m.X}))` for a named export). But:

- ⚠️ **A new lazy chunk needs its own budget line in `check-size.mjs`.** An unlisted chunk is
  counted in the file total and has **no ceiling at all** — it can grow forever without failing the
  guard. Session 27 hit this.
- ⚠️ **`nav()` in `e2e/helpers.js` waits on the `screen-loading` testid.** Making a screen lazy for
  the first time is fine; changing that testid silently stops every navigation in the suite from
  waiting.
- ⚠️ **A component cannot be lazily loaded while it lives in the file doing the importing.** These
  three have to move to their own modules first, which is the I6 decomposition pattern.

**Done when:** StaffApp is comfortably under budget with the freed number stated in the commit
message, each new chunk has a budget line, and the full e2e suite is green — the modals in
particular, because they are reached from several screens.

---

### 2.3 🔴 Drive the DEMO, end to end, as one continuous flow

`PRODUCT-DIRECTION` §3 names the exact fifteen minutes the company is sold in:

> Brand Studio skins Jungle with their logo live → import a coach's deck → their own class, their
> brand, on the TV.

**Nobody has driven that as one flow.** Every session drives the screens it touched. This item is a
**measurement task, not a build task**, and the deliverable is the list of what breaks — then fix
what you find.

Walk it exactly as a prospect would, at 1280px and then at 390px, on a **fresh install**:

1. Brand Studio → upload a logo → generate → apply a theme. Does the whole app take the skin? Does
   anything keep Canopy's colours? (§2.1 says yes, and expects more.)
2. Coaches → import a deck (the sample coach is the stand-in for a real one) → is a learned style
   legible without Jungle's internal vocabulary? `UI-UX-DIRECTION` §4 has the copy rules: a coach
   is **never** shown the words parser, JSON, corpus, extraction, Edge Function, Supabase, blocks,
   or a confidence percentage.
3. "Draft from this shape" → Builder → is the class correct and named correctly?
4. Class Runner → Room TV. Is the room-facing screen flawless? `UI-UX-DIRECTION` §1 sets the bar:
   *"the Room TV and the member link are the two surfaces a member ever sees. They must be flawless
   before any staff screen gets polish."*
5. Check a few members in → Members → is the at-risk panel telling the owner something true, with
   the money figure §2.1 of session 27 added?

**⚠️ Do not report a defect your own fixture manufactured**, and **[unverified]** everything in
this list is a question rather than a claim — the flow may well be clean. A clean walk, reported as
clean with what you checked, is a real result.

**Done when:** the walk is written up step by step with what you saw, and everything you found is
either fixed or recorded with a reason.

---

### 2.4 The UI discipline the direction doc asked for and never got

`UI-UX-DIRECTION` §1 is specific, and these are the parts that are cheap to enforce and were never
enforced. **[unverified]** — measure each before believing it:

- **Type scale.** A fixed 6-step scale: 11 (meta), 13 (body), 15 (emphasis), 20 (card title), 28
  (screen title), 44+ (display surfaces, already governed by `FONT_SCALES`). Everything currently
  between 10–16px should collapse onto 11/13/15. A sweep counting distinct `fontSize` values per
  screen makes this measurable; do that before hand-editing anything.
- **Spacing.** 4px base grid, card padding 20, gap 16, section gap 32. The doc says the Builder's
  right column and the Personas cards drift.
- **One all-caps micro-label per card.** They are part of the identity; several per card is noise.
- **Motion.** Exactly two additions: 120ms ease-out on card hover/press, 200ms fade on view change.
  Nothing else, and `prefers-reduced-motion` is already honoured — keep it that way.

⚠️ **Type-scale collapsing is a large, low-risk-looking diff that can break layout at 390px.** Every
change here needs a fresh load at both widths, because **resizing without reloading shows a stale
render** — a documented trap that has produced a wrong finding in this repo before.

**Skip anything that is already done.** The doc is from 2026-07-19 and several of its per-screen
items have shipped since; its own table marks some ✅ and is not fully up to date.

---

### 2.5 §3.7's skeleton states — DECIDED AGAINST in session 27, and here is the argument

**Do not build these without a new argument.** Both of the premises the old item rested on are
false at `a7ea434`:

- `ScreenLoading` is not bare — it renders a centred "Loading…", and the **root** fallback
  (`Booting` in `main.jsx`, which is the one that matters because it is the first paint) already
  wears `bootColours()` so a light-palette studio gets its own background rather than a flash of
  near-black, with an `ErrorBoundary` outside it.
- "Hydration shows nothing" is **correct** for a local-first app. localStorage is the source of
  truth and the screen renders complete from it; a spinner would claim the data is not ready when it
  already is.

What remains is skeleton cards in place of a centred "Loading…" on two lazy chunks: cosmetic, real
bytes against a 10.5 kB budget, and it carries the `screen-loading` testid risk in §2.2. **Recorded
here so it is not rediscovered as an open item.** If §2.2 frees a lot of budget and the demo walk in
§2.3 shows the fallback is actually visible on a slow connection, that is a new argument — say so.

---

### 2.6 🟢 THE NEW FEATURE: which of your classes keeps members

This is the recommendation, and it is the only genuinely new build in this prompt.

**The argument.** Every competitor in `GTM-SINGAPORE` §1 — Mindbody, Glofox, Hapana, Zenoti,
Vibefam — is booking/billing-first. They hold *who booked what*. **They do not hold what was in the
class**, because nobody programs a class in them. Jungle holds both: the class content (personas,
plans, class types) and the attendance record. So Jungle can answer a question none of them can:

> **Which of your class types actually keeps members, and which ones do people try once?**

That is the (a)+(c)→(b) loop `PRODUCT-DIRECTION` §2 describes, closed. It is also the number that
justifies the S$299 tier at renewal, because it tells an owner what to put on the timetable.

**[measured] The data already joins, locally, with no migration.** `class_instances` rows carry
`classType` (written by `publishOccurrences`, by `startScheduledClass`, and by
`applyAttendanceImport` via `resolveClassType`), and `attendance` rows carry `classInstanceId`. Both
are localStorage keys. `lib/cohorts.js` already has the month arithmetic and the observability
rules, and `resolveClassType` already normalises a foreign system's vocabulary onto the gym's
catalogue.

**⚠️ Three honesty constraints, and the first is the whole feature.**

1. **A class type with four attendees is not a comparison.** Session 27's `cohorts.js` learned this
   the hard way: a per-point denominator produced a curve that **rose**, because each point was a
   percentage of a different population and every point was individually correct. Read that file's
   header before writing any of this. Whatever the metric is, it must be over **one comparable
   population per class type**, and a type below the minimum must be **named as excluded, not
   silently dropped** — an owner who cannot see that Yoga was left out will conclude Yoga has no
   problem.
2. **An imported row may have NO class type.** The CSV importer keeps a foreign "Type" column
   verbatim when it matches nothing, and writes `""` when the column is absent. So the screen must
   state how many check-ins could not be attributed. A ranking computed over 60% of the data and
   presented as the whole timetable is the confident wrong number this product refuses.
3. **Do not build a per-COACH version of this.** The same join would produce it, and it is a
   different product decision: coaches are the adoption engine (`GTM-SINGAPORE` §2 prices
   per-location precisely so coaches are not taxed), and a screen that ranks them is a screen a
   coach will refuse to feed. **If you think it is worth it, write the argument into
   `DYLAN-QUEUE.md` as a decision for him — do not ship it.**

**⚠️ Where it goes.** `RetentionScreen` has **1.96 kB** of budget left, so this either raises that
ceiling in the same commit with a note saying what bought the bytes, or lands as its own lazy chunk
with its own budget line. It is the same route (`analytics`) — **do not add a nav entry**.

**Done when:** a gym with imported history sees which class types retain and which do not, with the
population behind each figure and the unattributed count stated; a gym without enough data per type
sees which types were excluded and why; the arithmetic is unit-tested with a control proving the
fixture really produces a ranking; and `npm run size` passes.

---

## 3. Do NOT

- **Do not apply migrations, merge Dependabot PRs, or change infra.** All three are Dylan's. The
  Node 20 deprecation is already written up in `DYLAN-QUEUE.md` — session 27 was asked to record it
  and found session 26 had already done so. **Do not file it a third time.**
- **Do not build billing, signup or a self-serve tier.** Gym-#20 problem.
- **Do not flip `FLAGS.mockAnalytics`** or undo the `FLAGS.music` gates. The mock's invented KPIs
  are verified absent from the deployed bundle — keep them that way.
- **Do not add a new screen or nav entry.** §2.6 extends an existing route.
- **Do not "simplify"** `_clearLedgerIfSettled`, `restorePersonaCascade`, the conditional in
  `deletePersonaMovement`, or session 27's `_clearSyncError` refusal-while-tombstones-exist. All
  have tests saying why.
- **Do not build per-coach retention** (§2.6, constraint 3).
- **Do not re-raise** §3.7 skeletons (§2.5), N4, the crash gate's JSX blind spot, the class-type
  vocabulary, the catalogue delete, `Reopen`, `GEN_CAP`, or `--navy` not being skin-derived — that
  last one was investigated in session 27 and is a **fixture artefact**: `navy` IS a skin token, all
  three presets define it, and the custom-token editor exposes it as "Inset / chip".

---

## 4. Standing risks — carry these into the handoff unchanged until they move

- 🔴 **Migrations `0005` and `0006` have never been applied.** A gym's personas, plans and movement
  catalogue exist on **one device with no server copy** — the most expensive data in the product.
  ⚠️ The coach-delete dialog now *tells the coach that*, so **that sentence becomes a lie the moment
  they are applied**; `DYLAN-QUEUE.md` carries the note and `e2e/destructive.spec.js` asserts the
  string is present, which is the reminder.
- 🔴 **N4 member links are built and undeployed** — seven sessions. The only member-facing surface,
  and the only place the white-label story can be proven on an actual member.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps that are also the fix
  for the Node 20 warning every deploy prints.
- ⚠️ **A second Claude session may share this working tree.** `git status` before every commit, stage
  only your own paths, and `grep -rn MUTATION src/` before trusting any green gate.

---

## 5. When to stop

1. Work the queue in order. Verify, build, test, **prove the test can fail**, run the gates, commit
   with the reasoning, push, check CI.
2. **Then drive the surface you touched and LOOK at it**, at 1280px and 390px, on a fresh load.
   This found copy and contrast defects in sessions 24 through 27 that passing suites did not.
3. Keep going until the tokens run out.

🔴 **If the remaining items are all theatre, stop and say so.** An honest "this is finished" is a
result. **Never add a feature to have something to do** — and note that §2.6 is the only feature in
this document, deliberately, because session 27 ended with the queue genuinely worked and the
highest-value remaining work needing Dylan rather than code.

**Finish with a `SESSION-HANDOFF.md` block** in the established shape: what shipped, what was found
to be false, the traps paid for, and what is genuinely left. Lead with the reasoning, not the diff.
⚠️ The live file keeps the **two most recent** blocks only — session 27 found three and moved the
oldest to `docs/history/HANDOFF-ARCHIVE.md`, **newest-first**, which is not where a naive append
puts them.
