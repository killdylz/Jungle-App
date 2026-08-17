# Jungle — Session 29 Build Prompt

**Run this session autonomously. Do not stop to ask.** Every item below is buildable without
Dylan, without a server, and without a migration. Where a choice arises, make it, write the
reasoning in the commit message, and keep going.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the
testing traps and the domain rules. **This file does not repeat them.** It carries only the state,
the evidence, and the work queue.

**Last commit `0ed2811`, tree clean, pushed to `claude/gracious-hopper-quifam`.**

### The regression, run fresh at `0ed2811` — measured, not carried forward

| Gate | Result |
|---|---|
| `lint:crash` | **0** |
| `npm run lint` (advisory) | **233 problems** (218 errors, 15 warnings) — the baseline, not bugs |
| unit | **902 passing**, 32 files |
| e2e | **456 passing**, 44 spec files |
| build | 9 JS chunks |
| `npm run size` | **0 over budget** |

```
index.js             204.72 / 215 KB   (4.8% headroom)   ← now the TIGHTEST
StaffApp.js          292.32 / 360 KB   (18.8% headroom)
PersonasScreen.js     82.75 / 100 KB
RetentionScreen.js    17.02 /  18 KB   (5.5%)
BrandStudioScreen.js  26.55 /  28 KB   (5.2%)
LibraryBrowserModal.js 19.15 / 20 KB   (4.3%)
ProfileModal.js       13.71 /  15 KB
ClassSummary.js        5.81 /   8 KB · summaryApi.js 0.85 / 3 KB
member path 211.72 / 222 KB · staff path 502.73 / 575 KB
```

App.jsx is **2,371 lines** (was 3,787 at the start of session 28).

⚠️ **`StaffApp` is no longer the constraint — `index.js` is**, at 4.8% headroom. Anything added to
the eager entry chunk (a new top-level import in `main.jsx`, a library pulled into `store.js` or
`colors.js`) now hits a ceiling that StaffApp used to hit first. A new screen still goes in a
`lazy()` chunk **with its own budget line in `check-size.mjs`**.

### ⚠️ The environment, and this cost session 28 real time

**Playwright cannot launch out of the box in the cloud container.** `@playwright/test` 1.61.1
wants Chromium r1228; the image ships r1194 at `/opt/pw-browsers` and the CDN is blocked by the
proxy. `npx playwright install` fails with a 403.

Run the suite through a scratch config that points `executablePath` at
`/opt/pw-browsers/chromium` and leaves `playwright.config.js` alone (it is what CI runs — do not
edit it). Session 28's is a five-line wrapper importing the repo config and overriding
`projects[].use.launchOptions`, `testDir`, `outputDir` and `webServer[].cwd`.

🔴 **AND THE TRAP UNDERNEATH IT.** `npx playwright test 2>&1 | tail -30` **exits 0 when nothing
launched at all** — a pipeline's exit code is the last command's. Session 28's "baseline" run
reported success having run zero tests, and the mistake survived an hour. **Read the count, never
the exit code.**

### The autonomy contract

- **Never block on Dylan.** If an item turns out to need him, write what he needs into
  `DYLAN-QUEUE.md`, say so in the handoff, and move to the next item.
- **Never ask which option to take.** Decide, and put the reasoning in the commit message.
- **Commit and push after each item lands green.** Do not batch a session's work into one commit.
- ⚠️ **CI does not run on this branch.** `Deploy to GitHub Pages` triggers on `main` only, so
  there is no run to judge and `gh run list` will show nothing for your work. **The local suite is
  the only gate.** Do not report CI as green; report the suite.
- If a gate is red and the cause is not yours, **re-run once** before investigating.

### 🔴 The rule that keeps earning its place

**Verify every item below against the code before building it.** Session 26 found four false
premises in its own prompt, session 27 found six of eight, session 28 found two — and session 28's
were the expensive kind: **they said something was finished when the thing underneath it had never
worked at all.**

The single most valuable hour of session 28 was not on its queue. §2.3 was billed as "a
measurement task, not a build task" and it found that the white-label generator had been giving
every gym the same identity since it was written. **Driving the product is how you find the things
the tests cannot see, and it is worth doing before you trust any premise in this document.**

Where a number below is marked **[measured]** it was verified two ways; **[unverified]** is a lead,
not a finding.

---

## 🟥 1. Where the product is

The USP, from `docs/PRODUCT-DIRECTION.md` §1:

> Jungle learns how each coach already programs — from the slides they've been writing for years —
> and turns that into branded, ready-to-run classes on the studio's own screens, while quietly
> building the attendance record that shows who's about to quit.

**Session 28 found that the first clause of that sentence was not true in the product.** The
generator read the logo, showed its colours correctly in one panel, and then generated the identity
from a stale `null` — Canopy's mint, every time, for every gym. `luma` was stale in the same
closure, so the light-skin branch of the generator was **unreachable in production**: a studio with
a pale mark could not get a light app however pale it was. Both are fixed.

**What that changes about how to read this file.** Four sessions of white-label polish sat on top
of a generator that ignored its input, and every one of them passed a full suite. The queue below
leads with the consequences of that rather than with new features, because the most valuable thing
this product can do next is make sure what it already claims is actually true.

`PRODUCT-DIRECTION` §5's five missing things: four are built (N4 built-not-deployed, cold start,
mobile, offline); the fifth is a price, which is a GTM decision and not code.

---

## 🟥 2. The work queue, in order

### 2.1 🔴 The generator fix is NOT retroactive, and somebody is wearing the wrong brand

**[measured]** Session 28 fixed `runAnalysis` so a generated identity comes from the gym's logo.
It does nothing for a gym that already pressed **Apply to all surfaces** before the fix: their
`jungle_custom_skin` holds Canopy-derived tokens, written from the `["#7BE3A4"]` fallback, and
those tokens are the source of truth. The app will keep painting them forever. Nothing prompts a
re-generate, and the Brand Studio shows the stored palette as if the gym had chosen it.

**This is the highest-value item in the file and it is small.** Decide what to do and do it.

**The shape of the decision, and none of these is obviously right:**

- **Detect and offer.** A stored custom skin whose accent is exactly `#7BE3A4` while a logo is
  stored is *almost certainly* the defect — a gym that genuinely wanted Canopy's mint would have
  taken the preset, not generated. Offer a one-click "regenerate from your logo".
  ⚠️ **It is a heuristic and it can be wrong.** A boutique wellness studio whose logo really is
  mint would be told its brand is a bug. Whatever you build must be an OFFER a coach can decline,
  never a silent rewrite of a stored palette — the same rule the rest of this product follows about
  destructive-and-invisible changes.
- **Say nothing and let them re-generate.** Cheapest, and defensible only if you can show the
  affected state is rare. You cannot: there is no telemetry.
- **Regenerate on next Brand Studio open.** Silent. Rejected on sight — it rewrites a stored
  decision without asking.

**Done when:** a gym carrying a Canopy-derived generated skin plus a stored logo is offered a
regenerate it can decline; a gym that deliberately chose mint is not told it is broken; the
detection is unit-tested with a control proving it does NOT fire on a hand-picked mint palette;
and nothing rewrites `jungle_custom_skin` without a click.

⚠️ Read `applyGenerated` first — it sets `activeSkinId` to `"canopy"` deliberately and layers the
generated tokens over it. `skins.js`'s header explains why, and a detector keyed on the skin ID
rather than the tokens will get this exactly backwards.

---

### 2.2 🔴 The Brand Studio's AA audit checks five token pairs and no chips

**[measured]** `a11yChecks` in `BrandStudioScreen.jsx:276` is five rows: text-on-bg, text-on-card,
muted-on-bg, on-accent, and accent-as-graphic. That is the whole audit, and it is presented to the
owner as *"Member-visible text meets WCAG AA — legible at room-display size."*

**Session 28's sweep now measures far more than that** — every composited chip, badge, pill and
dimmed row, on every screen, at two widths — and it found **nine real defects that this panel
reported as passing**, including the panel's own AA badges at 1.47:1.

So the product tells an owner their palette is accessible using a narrower test than the one CI
runs against the same palette. **A compliance feature that under-reports is worse than no
compliance feature**, because the owner stops looking.

**The build:** teach the in-app audit what the sweep knows. `e2e/contrastScan.js` has the
compositing arithmetic; the parts that matter (source-over, the `color(srgb …)` branch, the
alpha-times-opacity fold) are pure functions and belong in `colors.js` where both can read them.

⚠️ **Do not simply move the scanner in.** The sweep walks a live DOM; this panel has draft TOKENS
and no DOM. What transfers is the compositing maths plus a list of the PAIRS this product actually
paints — a hue chip at 14% over each surface, a `--danger` plate, an accent fill — checked against
`hueInk`'s output rather than the raw hue.

**Done when:** the panel's verdict cannot say "passes" for a palette `brandTokens.spec.js` would
fail, the shared arithmetic has one home and one set of unit tests, and a mutation to the
compositing turns both the panel's test and the sweep red.

---

### 2.3 The 350ms transition on every element, forever

**[measured]** `applySkinCSS` injects `#root *{transition:background-color .35s ease,color .35s
ease,border-color .35s ease,fill .35s ease;}` once, into `<head>`, and never removes it. Measured
across the app: **1,730 elements** carrying a 0.35s transition. Everything else in the product
totals about forty.

It exists for FR-A4 — a smooth reskin — and for that it is right. But it is not scoped to the
reskin: every colour change in the product animates over a third of a second, forever. Session 28's
contrast scanner needs a 500ms settle-and-reread solely because of it, and session 27 recorded a
transient white-on-white read from the same cause.

**[unverified] Whether this is a defect is a real question, and answer it before touching it.**
It may be the reason the app feels calm. Drive the Builder, the Runner and the check-in flow with
it scoped down and compare. If it is load-bearing, **say so and stop** — a paragraph explaining why
this stays is a good result and stops the next session rediscovering it.

If it is not: the fix is to add the rule when a skin changes and remove it a beat later, which also
lets the contrast sweep drop its settle wait.

⚠️ `prefers-reduced-motion` is honoured on the room-facing displays via `prefersReducedMotion()`
but this global rule does not consult it. Check that before assuming the current behaviour is
correct.

---

### 2.4 `AnalyticsScreen.jsx` — 284 lines of fiction kept as a layout target

**[measured]** It is 284 lines, imported by `App.jsx:78`, rendered only behind
`FLAGS.mockAnalytics` (false), and folded out of the bundle by rollup. Its own header and
`RetentionScreen.jsx:6` both say it is kept as "the layout target for the real screen".

**The real screen shipped in session 27 and grew a second panel in session 28.** The target has
been hit. What remains is 284 lines of invented KPIs — "1,284 active members", "£412 revenue per
class", four fabricated churn-risk names — one flag away from a paying customer's screen, and 25
raw hex literals that every white-label sweep has to be told to ignore.

**Verify before deleting** — this is exactly the kind of claim that is stale. If something still
reads it, say what and leave it. If nothing does: delete it, delete the import, delete the
`FLAGS.mockAnalytics` branch on the `analytics` route, and check whether the flag itself still has
a reader.

⚠️ `flags.js`'s `MOCK_VIEW_FLAG` is a separate mechanism and session 27's handoff explains how it
made a live route unreachable for months. Read that before touching either.

---

### 2.5 Widen the contrast sweep to borders, focus rings and icon strokes

**[measured]** `brandTokens.spec.js` measures TEXT pairs only. Borders, focus rings and icon
strokes are unmeasured — stated plainly in session 28's own done-when, so this is a known edge
rather than a discovered one.

It matters for one specific reason already proven in this codebase: **`borderOn` exists because a
hand-built light palette inherited a dark theme's white 7% overlay and every card edge, input
outline, divider and grid line in the product went invisible.** That fix is asserted by unit tests
on the token, and by nothing on the rendered page.

WCAG 1.4.11 wants 3:1 for a non-text control boundary. The scanner already composites; pointing it
at `borderColor` and `outlineColor` is mostly plumbing.

⚠️ **Expect false positives and budget for triaging them.** A decorative hairline between two rows
is not a control boundary, and a sweep that reports every one of them is the twenty-of-twenty-one
problem again in a new costume. Scope it to elements with a ROLE, or to focus rings only, rather
than every border in the DOM — and if the honest subset is small, ship the small one and say what
it excludes.

---

### 2.6 `index.js` is now the tightest chunk

**[measured]** 204.72 / 215 KB, 4.8% headroom. It was never the binding constraint before because
StaffApp hit its ceiling first; StaffApp now has 18.8%.

This is not urgent and it is not hygiene-for-its-own-sake: it is the thing that will block the
session after next. `index.js` is what a MEMBER downloads to look at one class — the number
`check-size.mjs`'s own header calls "the number that matters commercially".

**[unverified]** Nobody has looked at what is actually in it. Do that before moving anything:
`main.jsx`, `store.js`, `colors.js`, `flags.js` and everything they pull. Report the top ten
contributors with sizes. A finding that it is all load-bearing is a real result.

---

## 3. Do NOT

- **Do not apply migrations, merge Dependabot PRs, or change infra.** All three are Dylan's.
  **Do not edit `playwright.config.js`** — it is what CI runs; use a scratch config (§0).
- **Do not re-file the Node 20 deprecation.** Sessions 26 and 27 both wrote it up. It is in
  `DYLAN-QUEUE.md`.
- **Do not build billing, signup or a self-serve tier.** Gym-#20 problem.
- **Do not flip `FLAGS.mockAnalytics`** or undo the `FLAGS.music` gates.
- **Do not build per-coach retention.** The argument both ways is in `DYLAN-QUEUE.md` awaiting
  Dylan's yes/no. §2.6 of session 28 explains why the same join is four lines and still wrong.
- **Do not "simplify"** `_clearLedgerIfSettled`, `restorePersonaCascade`, the conditional in
  `deletePersonaMovement`, or `_clearSyncError`'s refusal-while-tombstones-exist.
- **Do not re-raise** §3.7 skeletons, N4, the crash gate's JSX blind spot, `GEN_CAP`, `Reopen`, or
  `--navy` not being skin-derived.
- 🔴 **Do not re-raise the §2.4 UI-discipline items from session 28.** All four were MEASURED and
  the numbers are in commit `0ed2811`: the "4px spacing grid" premise is false (10px is the
  most-used value in the app, ×329, on a ~2px grid); the type-scale collapse is 340 nodes of which
  the biggest group is one deliberate micro-label idiom used 97 times; the micro-label detector
  over-reports; motion needs nothing added. **Re-deriving these is a whole session for nothing.**
- ⚠️ **Do not push chrome through `tvFont`.** It is a display-scale function and it makes an 11px
  label 7px on a 720p wall. Session 28 did it mechanically, made the room boards worse, and
  reverted the pass whole.

---

## 4. Standing risks — carry these into the handoff unchanged until they move

- 🔴 **Migrations `0005` and `0006` have never been applied.** A gym's personas, plans and movement
  catalogue exist on **one device with no server copy**. ⚠️ The coach-delete dialog now *tells the
  coach that*, so that sentence becomes a lie the moment they are applied;
  `e2e/destructive.spec.js` asserts the string is present, which is the reminder.
- 🔴 **N4 member links are built and undeployed — nine sessions.** Two Edge Functions that have
  never handled a request. `DYLAN-QUEUE.md` A12/A13, 35 minutes of his time. It is the only
  member-facing surface, and after session 28 it is also the only place the white-label story can
  be proven on an actual member.
- ⚠️ **A1 — the Supabase region has never been confirmed.** Five-minute read-only check, and the
  only item on the whole list that gets dramatically more expensive with age: a project's region
  cannot be changed after creation.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps.
- ⚠️ **A second Claude session may share this working tree.** `git status` before every commit,
  stage only your own paths, and `grep -rn MUTATION src/` before trusting any green gate.

---

## 5. When to stop

1. Work the queue in order. Verify, build, test, **prove the test can fail**, run the gates, commit
   with the reasoning, push.
2. **Then drive the surface you touched and LOOK at it**, at 1280px and 390px, on a fresh load.
   This is not a formality: it is how session 28 found the largest defect in the product, on an
   item its own prompt called a measurement task.
3. Keep going until the tokens run out.

🔴 **If the remaining items are all theatre, stop and say so.** An honest "this is finished" is a
result. **Never add a feature to have something to do** — this document contains no new features,
deliberately, because session 28 ended with the queue worked and the highest-value remaining work
needing Dylan rather than code. §2.1 and §2.2 are both consequences of a defect rather than
additions, and that is the right shape for this session.

**Finish with a `SESSION-HANDOFF.md` block** in the established shape: what shipped, what was found
to be false, the traps paid for, and what is genuinely left. Lead with the reasoning, not the diff.
⚠️ The live file keeps the **two most recent** blocks — move session 27's to
`docs/history/HANDOFF-ARCHIVE.md`, **newest-first**, which is not where a naive append puts it.
