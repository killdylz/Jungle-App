# Jungle — Session Handoff

_Last updated: 2026-08-17 (session 29)_

> 📁 **Sessions 6–27 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 29 — the consequences of one defect, and a chunk that was 93% React

> **Gates green at `601332b`.** `lint:crash` **0** · **935 unit** (33 files) · **466 e2e**
> (46 spec files) · 12-chunk build · **0 over budget**. `index.js` **203.06 / 215 kB**
> (5.6% headroom, up from 4.2%). Six commits, each pushed after its own green run.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only, so
> there is no run to judge and `gh run list` shows nothing for this work. The local suite is
> the only gate, and every number above is from it.

**The brief led with the consequences of session 28's generator defect rather than with
features, and that was the right shape.** Six items, all worked. Two turned out to be
measurement tasks whose measurement changed the answer, and the queue was wrong in three
places — one of which reversed what I was about to build.

### What shipped

**§2.1 — the gyms the generator fix arrived too late for.** Session 28 fixed `runAnalysis`;
it does nothing for a studio that had already pressed **Apply to all surfaces**. Their
`jungle_custom_skin` holds Canopy-derived tokens and those tokens are the source of truth.
Brand Studio now offers a re-read, and the restraint is the feature: pressing it writes
NOTHING — only **Apply** does, as the coach's own second click.

🔴 **The queue's suggested heuristic — "accent is exactly `#7BE3A4`" — is wrong in both
directions, and finding that out is most of the value of the item.** The broken path produced
three themes and the coach picked one. Signature and Charge land on mint, but **Steel's accent
is `#aeccba`**, so an accent test never sees that third of the affected gyms. The detector is
the whole eight-token set against two frozen historical sets, and the value that makes it safe
is the derived background: the fallback generates `#0b130e` where Canopy's own preset is
`#0A0F0C`. A studio that hand-picked mint sits on Canopy's surfaces and is never told its brand
is a bug.

**§2.2 — the AA panel was narrower than the gate that judges it.** Five opaque token pairs,
presented to an owner as *"Member-visible text meets WCAG AA"*, while the sweep failed the same
palettes in nine places. Now fourteen rows in `lib/brandAudit.js`, sharing its compositing with
`e2e/contrastScan.js` through `colors.js` — the scanner serialises those exact functions into
the page with `Function.prototype.toString()`, so **one mutation to `compositeOver` turns 5 unit
tests and 4 sweep tests red together**.

**§2.3 — the 350ms transition STAYS, which is the opposite of what I expected.** Of the
elements carrying it, 17–41 per screen are CONTROLS, and outside Brand Studio not one control
declares a transition of its own. It is not a reskin detail that leaked — it is the product's
entire interaction feel, and scoping it would have made every selection and toggle in the app
snap. What was wrong is narrower and not a taste call: it never consulted
`prefers-reduced-motion`, so 145 elements animated for a user who had asked their OS for none.
Now gated behind a media query.

**§2.4 — `AnalyticsScreen.jsx` deleted**, 284 lines of invented KPIs kept as a layout target
that the real screen hit two sessions ago. `FLAGS.mockAnalytics` **stays**: `CalendarScreen`
still gates three mock panels on it, which is exactly what "check whether the flag itself still
has a reader" was asking.

**§2.5 — no keyboard user could see which text field they were in.** `outline:"none"` inline on
the shared `Input`/`Select` primitives and ~16 more fields, beating any stylesheet rule. One
`:focus-visible` rule with `!important` — the one case it is the right tool.

**§2.6 — `index.js` is 93% React.** Attributed by decoding the sourcemap's VLQ mappings:
react-dom alone is 172.40 kB of 201, and **all of our own code in the entry chunk is 11.19 kB**.
The chunk is not tight because app code crept in; the budget was set close to React's floor.

### What was false

**The queue's `#7BE3A4` heuristic** (§2.1) — above. It would have left the Steel gyms wearing
the wrong brand with nothing offered.

**"25 raw hex literals that every white-label sweep has to be told to ignore"** (§2.4). No sweep
names that file — not `rawValueScan`, not `brandTokens`, not `check-size`. They all measure a
rendered DOM and the screen never rendered. The hexes cost the sweeps nothing, and **the deletion
buys no bytes either**: `StaffApp.js` is byte-identical afterwards, because rollup had already
folded the branch away. The case for deleting it is the one `flags.js` makes — read during every
refactor, one flag from a customer's screen — not size.

**`BrandStudioScreen.jsx`'s header, in writing, for a whole session** (§2.6): "it is the ONLY
caller of `colors.js`'s generator machinery, so the chunk takes that with it." It did not.
`main.jsx` imports ONE function from `colors.js` — `bootColours` — and **rollup places whole
modules**, so that single eager edge kept the generator in the chunk a member downloads.
Corrected in place rather than deleted, because the mistake is easy to repeat. Splitting it out
bought 2.84 kB and is the only app-code lever that exists there.

**Also:** App.jsx imported eleven symbols from `colors.js` and used two. The other nine, the
generator included, had been dead since session 28.

### Three defects the widened audit found immediately

**Fixed.** The generator clamped `muted` against `bg` alone, and on a LIGHT identity `bg` is the
*lightest* surface — so the nudge stopped at 4.5:1 against the easiest thing in the palette and
left secondary text at 3.95–4.08:1 on `card` and `navy`, where most of it sits. Nine light-mode
themes affected. Now clamped against every surface; 60 themes checked, 0 failures. ⚠️ Dark output
is byte-identical, so no shipped preset moved and §2.1's frozen sets are untouched.

**Reported, not fixed — `DYLAN-QUEUE.md` A14, a yes/no.** A dark logo generates an accent that
cannot be used as a graphic on its own background (navy `#12224A` → **1.25:1**, blue 2.90,
crimson 2.86, against 1.4.11's 3:1). And on a light identity a mid-luminance accent has no
readable label: `inkOn` picks the better of bg/text, but violet `#A855F7` gives 3.70 and 4.13, so
both lose. Neither is fixable without bending a colour the gym chose, which is the rule
`--danger` already states. **The generated-identity badge was reading `contrast.passesAA` —
`textOnBg >= 4.5` and nothing else — so it rendered "✓ Passes WCAG AA" over the 1.25:1 accent.**
It now reads the full audit.

### Traps paid for

⚠️ **Editing source during an e2e run costs you the run.** Three specs failed on
`createRoot() on a container that has already been passed to createRoot()` — Vite HMR firing
because I touched `colors.js` mid-suite. Not a code defect; 7 minutes to re-run and confirm.

⚠️ **`el.focus()` does not trigger `:focus-visible`.** A programmatic sweep reported 35 of 40
controls on the Builder as ringless. All false. Press Tab.

⚠️ **Chrome reports `outline-style: auto` with a computed width of `0px`.** A check for
`outlineWidth > 0` calls every default-ringed button a failure and buries the real hits in
invented ones. The signal is the STYLE being `none`.

⚠️ **A control that opts out cannot measure the rule it opted out of.** The first attempt at
§2.3 measured the Brand Studio's vibe pill and found no difference — that pill is one of nine
elements declaring `transition:all .15s` inline, and inline beats a stylesheet.

⚠️ **`test.use({ reducedMotion })` did not apply through the scratch Playwright config** the
cloud container needs, and it failed OPEN. Only the explicit precondition assertion caught it.
`page.emulateMedia` instead.

⚠️ **A score computed from a rounded display string is not the same number.** Rows in the audit
carry unrounded colours for scoring and the CSS string only for painting — the difference is
~0.03, invisible until a pair sits on 4.50.

### Environment

**Playwright cannot launch out of the box** — @playwright/test 1.61.1 wants Chromium r1228, the
image ships r1194 at `/opt/pw-browsers`, and the CDN is proxy-blocked. A five-line scratch config
importing the repo config and overriding `projects[].use.launchOptions.executablePath`,
`testDir`, `outputDir` and `webServer[].cwd` works; **`playwright.config.js` was not touched**.
🔴 The trap underneath it is real: a piped `playwright test … | tail` **exits 0 when nothing
launched**. Read the count. Every count in this block was read from the run.

⚠️ **The branch started 5 commits behind.** Session 28's work is on
`claude/gracious-hopper-quifam`, not `main`, and this branch pointed at `main`. The prompt's
baseline `0ed2811` did not exist here until it was fast-forwarded. Worth checking first: every
number in the brief was correct once the branch was on the right base, and all six matched.

### What is genuinely left

Nothing on this queue. The remaining items need Dylan, not code:

- 🔴 **A14 is new and it is a yes/no**, not work — does Jungle bend a gym's accent to make it
  legible? My recommendation is (b), offer a nudge the coach can decline, the shape §2.1 uses.
- 🔴 **Migrations `0005` / `0006` still unapplied.** Personas, plans and the movement catalogue
  exist on ONE DEVICE with no server copy. ⚠️ The coach-delete dialog tells the coach that, and
  `e2e/destructive.spec.js` asserts the string — so applying them makes a shipped sentence a lie.
- 🔴 **N4 member links built and undeployed — ten sessions.** A12/A13, 35 minutes of Dylan's
  time. It is the only member-facing surface, and the only place the white-label story can be
  proven on an actual member.
- ⚠️ **A1, the Supabase region, still unconfirmed.** Five-minute read-only check, and the only
  item that gets dramatically more expensive with age.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps.

**If `index.js` ever has to shrink again, it is not a refactor.** It is React itself — a
preact/compat swap, which is infra and Dylan's — or raising the ceiling and saying so. The
measurement is in `check-size.mjs`'s header so the next session does not re-derive it.

---

## Session 28 — the white-label generator gave every gym the same identity, and nothing could see it

> **Gates green.** `lint:crash` **0** · **896 unit** (31 files) · **452 e2e** (44 spec files) ·
> eleven-chunk build: member path **211.72 kB**, staff **502.49 kB** (StaffApp **292.06 / 360 kB**
> — **68 kB of headroom**, up from 10.5, and it is no longer the binding constraint).
> App.jsx **2,371 lines**, down from 3,787. Four commits, each pushed. One worktree.

**The brief was §2.1 through §2.6 with the standing instruction to verify each item first.** Two
of its premises were wrong, and both were wrong in the direction that costs the most: they said
something was *finished* when the thing underneath it had never worked at all.

### The one that matters, and it was not on the list

🔴 **"Upload your brand — Jungle designs the identity" designed ONE identity, for everybody.**
Three logos — crimson `#B5122C`, blue `#1D4ED8`, gold `#D4A017` — driven through upload → analyse
→ apply produced **byte-identical skins**, all of them Canopy's mint.

`runAnalysis` walks four `setTimeout` steps and generates at the last one from `palette`, a state
variable the extraction sets at step 1. `advance` is a closure built when `runAnalysis` runs, so it
captured `palette` as it was then — `null`, cleared by `handleFile` a moment earlier. `setPalette`
re-rendered and made a new closure; the timer chain already in flight kept the old one. Final step
read `null`, took the `|| ["#7BE3A4"]` fallback. Every time, for every gym, on the screen
`PRODUCT-DIRECTION` §3 says the company is sold from.

**`luma` was stale in the same closure, and that is the half nobody would have found later.**
Polarity is detected from the mark's luminance, so with `luma` frozen at its initial `0.2` the
generator's `mode === "light"` branch was **unreachable in production**. A boutique studio with a
cream identity could not get a light app however pale their logo. Every hour of light-polarity work
in `colors.js` — `borderOn`, `inkOn`, this session's `hueInk` — was live and could not be reached
through the door the product opens. The fix is one argument threaded down the chain.

⚠️ **Why the suite could not see it, and the lesson is about fixtures.** The existing test uses
`public/icon-512.png` — Jungle's own icon, which IS Canopy green. Its own comment says the accent
cannot be the discriminator and picks `bg` instead; but the broken path derives a background too
(`#0b130e`, not Canopy's `#0A0F0C`), so **that assertion passed against the defect as well**. A
fixture whose colour equals the default cannot prove the colour came from the fixture. The new test
drives two logos that are nothing like Canopy and nothing like each other, asserts the outputs
DIFFER, then asserts each accent's HUE matches its own logo — so a generator alternating between
two wrong answers still fails.

**It was found by DRIVING the demo, which is §2.3, which was billed as a measurement task.**

### What shipped

**§2.1 — the contrast sweep composites alpha, and found nine real defects.** The half that landed
at `8c581d0` measured opaque pairs only; every chip, badge, pill and dimmed row in the product was
unmeasured. `e2e/contrastScan.js` now composites source-over from the first opaque backdrop through
every translucent ancestor, folds `opacity` in, runs at 1280 AND 390 on Canopy AND a hand-built
light skin, and confirms every violation on a second read so a mid-transition colour cannot be
reported.

The defects, and the worst one is on the shipped default: **a paused member's row carried
`opacity: 0.62`**, which dimmed their email, last-seen date, status badge and the Edit button that
reactivates them from 6.72:1 to **3.36:1 on Canopy**. Four readouts below AA at once. It now recedes
by losing its plate. Also: the Class Runner's 120px countdown at 1.97:1 on a light skin, the Brand
Studio's own **AA badges at 1.47:1** — the accessibility audit failing the accessibility rule, on
the demo surface — `--muted` dimmed a second time by an opacity in three places, and `#fff` on a
class-type plate at 3.76:1.

**`hueInk` is the rule underneath all of them.** A decorative hue used as INK becomes
`color-mix(in srgb, var(--text) 65%, hue)`: anchor to the colour this skin reads in, let the hue
tint it. Pure CSS, re-resolves on a reskin with no re-render. **65 is measured, not chosen** — at
60% the worst pair is 4.36:1, and `colors.test.js` asserts both the floor and that edge, so the
anchor cannot be weakened silently. A *filled* plate is the other case and takes
`inkOn(hue,"#000000","#FFFFFF")`.

`--warn` joins `--danger` on the same terms: not skin-derived, because a gym whose accent is amber
must not get a warning banner matching its primary action.

**§2.2 — StaffApp 350 → 292 kB.** `BrandStudioScreen` (26.5 kB), `LibraryBrowserModal` (19.2) and
`ProfileModal` (13.7) moved to their own modules and lazy chunks. Brand Studio first not for its
size but because it is the sole caller of `colors.js`'s palette generator, so the chunk takes that
machinery with it and a coach opening the Builder at 6am stops downloading it.

**§2.6 — which of your classes members come back to.** The join no booking system holds:
`class_instances.classType` × `attendance`. Of the members whose first visit to a type was at least
28 days ago, the share who came back within 28 days of it. One clock for everyone, so a class
cannot look better for being older — the same rule `cohorts.js` learned when its first curve rose.
A type below eight measurable members is **named as excluded**, and unattributable check-ins are
counted on screen. It does not rank coaches; the argument both ways is in `DYLAN-QUEUE.md` as a
decision for Dylan.

**§2.3 — the demo walk, and it also found the Room TV.**

### The premise that was false, and the blind spot it exposed

🔴 **Every screen sweep in this suite has been sweeping the staff app and calling it the product.**
The Room TV is a fullscreen overlay off the Class Runner, not a nav destination, so it is not in
`ALL_SCREENS` — and a11y, layout, tap and contrast sweeps all iterate `ALL_SCREENS`.
`UI-UX-DIRECTION` §1 says the Room TV and the member link "must be flawless before any staff screen
gets polish", and no sweep had ever looked at it.

On it: the plan rail painted raw stage hues as ink — **4.22:1 on Canopy**, 1.85:1 on a light skin —
the exit hint sat at 2.04:1, and the panel's glow was `rgba(123,227,164,.06)`, Canopy's mint
hardcoded, hazing the room-facing board of a gym whose brand is anything else.

### Traps paid for, in order of how much they cost

🔴 **NOT EVERY COMPUTED COLOUR IS `rgb()`.** `color-mix()` computes to
`color(srgb 0.93 0.31 0.31)` — channels in **0–1, not 0–255**. A scanner that scrapes the numbers
reads that as `rgb(1,1,1)`. Pointed at Canopy it invented eleven Brand Studio violations, all of
them chips that had just been fixed; pointed at a light skin the same misreading scored those chips
as near-black on white and **passed** them. Both wrong, in opposite directions, from one missing
branch — and the passing run is the more dangerous, because a green sweep is what stops you looking.
It bit twice: `syncBanner.spec.js`'s positive control asserted `/^rgb/` and failed on a change that
was correct. **Assert that a colour EXISTS, not what shape it takes.**

🔴 **Two more scans of nothing, and they are the same failure as the tab whose `innerWidth` was 0.**
(a) With no class seeded, the Room TV renders its empty state and the scan measures chrome —
reverting the plan rail fix left the spec GREEN. (b) The scanner bailed on any ancestor with a
`background-image`, and the Room TV's panel is a 6%-alpha gradient over `var(--bg)`, so every glyph
on the board was skipped while the per-screen count passed on the chrome outside it. A count
control only helps if it counts the thing you care about.

⚠️ **Appending 8-bit hex alpha (`` `${c}18` ``) only works while `c` is 6-digit hex.**
`var(--warn)18` is not a colour and the element loses its tint *and* its border, silently. A hue
used for both a FILL and INK needs **two values**. Caught by `syncBanner.spec.js`.

⚠️ **`page.evaluate` does not auto-wait.** `dialogs.spec.js`'s focus test read `document.activeElement`
immediately after opening a dialog — invisible while every dialog mounted synchronously, and a
failure the moment two became lazy. Its two sibling tests never failed because a locator assertion
is the first thing they do.

⚠️ **A JSX comment cannot sit beside the element inside a `&&(…)` or a ternary arm** — that makes
two children of one expression. Three build failures. Put it in JS position, or inside the style
object where `//` is legal.

⚠️ **`lint:crash` resolves identifiers, not module exports.** `import { resolveClassType } from
"../lib/libraryAccess.js"` passed the crash gate and failed the build; it lives in `libraryStore.js`.

### What is genuinely left

**§2.4 was measured before it was touched, and three of its four claims did not survive that.**
The type scale's biggest single value is 10px used **97 times** — one consistent micro-label
idiom, a design language rather than drift, and collapsing it is a 340-node diff that changes a
decision. The spacing claim ("4px grid, card padding 20, gap 16") is false: 10px is the most-used
value in the app (×329) and this product is built on a ~2px grid. The micro-label detector
over-reports, so acting on it would be acting on a number I do not trust. Motion needs nothing
added. **All of that is recorded rather than churned.**

What §2.4 *did* find is a real defect and it was not on its list: **`tvFont`'s legibility floor was
`scaled * 0.7`** — a fraction of the thing it protects, which cannot protect the small end of a
scale. On a **1280×720** wall the Plan board's exercise names rendered at **9px**. The floor is now
absolute (`TV_MIN_PX`), eight raw sub-11px literals across the three boards went through `tvFont`,
and **the coach's S/M/L/XL setting — which did nothing on two of the three boards, because
`FONT_SCALES` lived inside `DisplayScreen.jsx` — now reaches all three.**

⚠️ An earlier pass converted every fixed size on those boards to `tvFont` mechanically and made it
**worse**: `tvFont(11)` resolves to 7px on a 720p wall, because chrome pushed through a
display-scale function inherits its shrink. Reverted whole. `tvFont` is for type on a wall.

**The standing risks are unchanged and all three still need Dylan:** migrations `0005`/`0006`
unapplied, N4 built and undeployed for eight sessions, ten Dependabot PRs. Add one: the per-coach
retention decision, written up in `DYLAN-QUEUE.md`.

**The honest read on where the product is.** The queue was "make what exists look and feel like a
product a studio pays S$299 a month for". The most expensive thing found this session says that was
the right instruction and the wrong assumption underneath it: the white-label promise was not
imperfect, it was **not being kept at all**, and four sessions of polish sat on top of a generator
that ignored its input. The lesson is the one this repo keeps re-learning in new costumes — a
passing suite tells you the code matches the tests, and only driving the product tells you the tests
matched the product.
