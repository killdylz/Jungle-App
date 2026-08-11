# Jungle — Session Handoff

_Last updated: 2026-08-11 (session 28)_

> 📁 **Sessions 6–25 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

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

**§2.4 (UI discipline — type scale, spacing, micro-labels, motion) was not done.** It is the one
queue item this session did not reach, and it is the least urgent: the sweeps now cover contrast
and the Room TV, and the type-scale collapse is a large diff that wants a session of its own with
fresh loads at both widths. Two of its findings are already recorded in code — 9px text on the
Brand Studio preset line and the Room TV's exit hint both moved to 11px as a side effect of the
contrast work.

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


## Session 27 — the product finally states a number an owner buys on, and six premises were wrong

> **Gates green at `dc25bf2`.** `lint:crash` **0** · **875 unit** (30 files) · **440 e2e**
> (44 spec files) · six-chunk build: member path **211.57 kB**, staff **557.70 kB**
> (StaffApp **349.46/360 kB** — 10.5 kB left, and it is still the binding constraint).
> App.jsx **3,787 lines**. Nine commits, each pushed and CI-checked. One worktree, no
> concurrent session this time.

**The brief was a queue of eight items with an explicit instruction to verify each against the
code first, and a warning that the document was wrong somewhere.** It was wrong in six places.
Four of those wrongnesses changed what got built; two meant the work was already done. That ratio
is now consistent enough across sessions 26 and 27 to treat as the normal state of a handoff
prompt rather than an unlucky one.

### What shipped

**§2.1 — money on the at-risk panel.** The retention loop was entirely the coach's: it names
members and shows the arithmetic behind each flag. An owner does not buy "4 members need
attention"; they buy "S$600/month is walking out the door". Everything needed to say that was
already computed except what a membership costs, so the feature is one field
(`branding.membershipPrice`, set in Brand Studio, no migration — the blob already round-trips to
`brand_profiles`) and `members × price`.

The absent case is the feature and most of the tests. No price ⇒ **no money anywhere on the
screen** — not a zero, not a placeholder, not a "set a price" nudge. The e2e asserts no currency
symbol appears in the body text at all, deliberately broader than the fixture's own currency,
because a check for "S$" would pass while the screen rendered a pound sign. MRR not LTV, because
LTV needs a tenure assumption no gym's data has earned. Derived from the ACTIVE flags so the money
can never contradict the count beside it — a contradiction that has shipped on this panel once
already.

**§2.2 — N2 cohort analytics, replacing the coming-soon stub on the analytics route.** A real
retention curve from the gym's own rows, a per-cohort table, and a stated half-life. Its own lazy
12 kB chunk.

**§2.3 — the P6 instrument stopped reading as a broken gauge.** It sat under the at-risk list
showing `—` beside `NO DATA` on a fresh install: an unattributed engineering threshold in the
middle of the screen that sells retention. Not deleted — the reason it exists (an unmeasured design
law is indistinguishable from a met one) is still good. Moved last, and rewritten: the target is
named as **Jungle's**, which turns an internal number into a promise the owner can hold us to, and
the consequence is stated in coach-minutes per class from the gym's own median class size.

**§1.3 — the last three `window.confirm`s**, each getting the guard its cost deserves. New class →
undo. Remove a schedule rule → undo. Coach delete → in-app confirm **and** undo, because that one
is an LLM pass over a deck a coach has taught from for years and lives on one device.

**§3.2 — the two saves that were genuinely silent**: the ExerciseDB API key (no visible
consequence at all) and a movement-catalogue edit (aliases, notes and category do not show in the
collapsed row). Everything else stays silent, and that half has the teeth.

**§1.5 — the reload sweep.** Eight writes × (stored value, screen, then both again after a
reload), each row its own test with a control that the check fails before the action.

**§2.5 — the checklist now acknowledges completion, and the greeting cannot shout an email.**

**`_bgDelete` records a failed delete and can retry it**, via a tombstone queue.

**And a defect in §2.1 that only appeared after it shipped**, found by re-reading
`atRiskMembers` rather than by any test: `retentionSummary` returns `atRisk: null` in the
"not-recording" state and the panel renders `—`, but rule 1 (`new_member_low_visits`) is gated on a
known join date and NOT on `activity.recording`, so it still fires. A gym whose last check-in was
three weeks ago, with a hand-added member in their first month, showed `—` as the count and
**"S$150/month at risk" beside it** — a confident figure next to an explicit "we cannot tell",
which is exactly the self-contradiction the money exists to avoid. Both the total and the per-flag
figure are now gated on the headline being a NUMBER, not merely on a price existing. **The panel
rendering flag rows under a `—` predates this work; putting a currency total there did not.**

### The six false premises, in order of how much they changed

1. 🔴 **§2.2 said "the route already exists, in three nav arrays".** True, and beside the point.
   `flags.js` mapped `analytics` to the `mockAnalytics` flag, so `isViewEnabled("analytics")`
   returned **false** and all three nav arrays filtered the entry straight back out. **The route was
   live and unreachable — nothing in the product could navigate to it.** The nav half of that build
   is deleting one line from `MOCK_VIEW_FLAG`. That is *not* flipping the flag: `FLAGS.mockAnalytics`
   is still false and `AnalyticsScreen`'s invented KPIs are still folded out of the bundle.
   **The lesson: a mock flag doing double duty as a nav gate makes "replace the mock" require a
   flags.js edit that reads exactly like the thing the queue forbade.**

2. 🔴 **§2.2 assumed cohorts could be keyed on `joinedAt`. They cannot, and it inverts.**
   `applyAttendanceImport` creates every imported member with `joinedAt: ""` (store.js:1303). So
   the gym that imports two years of history — the exact gym that makes N2 possible — has **zero
   known join dates**, and a join-date analysis would show it an empty screen while showing a gym
   that typed its roster in by hand a full one. A cohort is therefore *the month a member first
   appears in the records*, and the screen says so rather than calling it a join date.
   `retention.js` refuses the same substitution for its rule 1 and is right to: that rule asserts a
   tenure it does not hold, while this describes the data it does.

3. 🔴 **§1.3's list of the last three confirms named `handleReset`.** It is not one and has not
   been for some time — it already has an in-app dialog *and* a toast. The third confirm was the
   **coach delete**, which the queue did not mention at all and which is the most expensive
   destructive action in the product. The item had the wrong end of it.

4. 🔴 **§2.5 said the app "knows the coach's name everywhere else".** It knows it nowhere:
   `display_name` comes from the Google/Supabase session, and the credential-less build — what
   GitHub Pages serves — has no session. "COACH" is the honest output of holding no name, confirmed
   by driving it. The real defect was one step further down the chain: `display_name` falls back to
   `user.email`, and `split(" ")[0]` greeted a coach with **their whole email address** in 12px
   letterspaced accent caps.

5. **§3.7 said lazy chunks show a bare fallback and hydration shows nothing.** Neither survives
   contact. `ScreenLoading` renders a centred "Loading…"; the root fallback in `main.jsx` already
   wears `bootColours()` so a light-palette studio gets its own background rather than a flash of
   near-black, with an ErrorBoundary outside it. And hydration showing nothing is **correct** for a
   local-first app — a spinner would claim the data is not ready when it already is. What remains is
   skeleton screens, which is cosmetic, costs bytes against 10 kB of headroom, and carries the
   item's own warning that moving the `screen-loading` testid silently stops every navigation in the
   suite from waiting. **Deliberately not done. Do not re-raise without a new argument.**

6. **§3 asked for the Node 20 deprecation to be recorded in `DYLAN-QUEUE.md`.** Session 26 wrote it
   up on 2026-08-04. Re-verified rather than re-filed; a status line says so.

### The defects found by building, which no premise predicted

🔴 **My own first cohort curve RISED, and a unit test caught it.** Right censoring's obvious fix is
a per-point denominator — at month k, count only members old enough to be observable that far.
Every point is then individually correct and **the line as a whole lies**: month 7 read 50% after
month 6 read 33%. Nobody came back; those are percentages of different populations, and the members
old enough to be measured at month 7 were a more loyal subset. An owner reads that upturn as "they
return". Fixed with **one population for the whole curve** — the members who have had the full
observed horizon — so `last >= cohort + k` is nested in k and the line is monotonic in fact rather
than in a comment. The same artefact appears in table form and takes the same fix: one denominator
per row.

🔴 **The Brand Studio's three skin presets were `<div onClick>`.** A keyboard-only or screen-reader
user could not choose a skin **at all** — the three primary choices on the white-label screen. It
surfaced only because the reload sweep tried to click one *by role* and waited out its timeout.
Nothing in the suite would ever have caught it: `keyboard.spec.js` asserts every visible CONTROL is
reachable by Tab, and a div with an onClick has no role, so it was never a control to reach — and
every existing test clicks these by their TEXT, which works on a div. **The workaround that made the
tests pass is what hid the defect.** Now `<button aria-pressed>`.

🔴 **`ProfileModal`'s branding Save erased any key set elsewhere.** It wrote its six-field draft
*as* the whole branding blob. Nothing was lost while the blob held only those six; `membershipPrice`
is the first key that would have been, and the symptom would have been a price that "does not save"
with nothing in the console.

🔴 **The Dashboard checklist's congratulation was unreachable code.** `describeSetup` has always had
a "Setup is done" branch. `showChecklist` is `sessions === 0`; the `run` step is done at
`sessions > 0`. The conditions are exact opposites, so **completing the third step is what hides the
card carrying the congratulation** and the ceiling a coach can see is "2 / 3". The old copy also told
them to run a class they must already have run to get there. The acknowledgement moved to the other
side of the switch (`justFinished = complete && sessions === 1`), retiring itself on the second class
so it needs neither a dismiss button nor a stored flag.

🔴 **`_bgDelete`: the obvious fix would have been worse than the silence.** A failed delete only hit
`console.warn`, so it never entered the ledger, was never retried, and the next hydrate put the row
back. But simply calling `_noteSyncError` makes the retry machinery **lie**: `_RETRY_PUSHERS[table]`
is `save*(get*())` for every id-keyed domain, an upsert cannot remove a row the server has and local
does not, so the retry SUCCEEDS, `_clearSyncError` fires, and the ledger reports a healthy table
whose deletion never happened.

**What retrying a delete means with no local tombstone — the decision.** It means nothing, which is
why the tombstone must exist. `jungle_pending_deletes` holds `{table, col, val, at}` and does two
jobs: it is the retry's *argument* (what the local list threw away), and it *suppresses the
resurrection* so hydrate drops a row the coach already deleted instead of adopting it. Job 2 is the
one the coach feels. `_clearSyncError` now refuses while a tombstone is outstanding — one choke-point
rather than a rule repeated at every call site.

⚠️ **One table already had this right and is why the shape is worth copying.**
`library_overrides`' pusher is `if (d) saveLibraryCustom(d); else resetLibraryCustom()` — it MIRRORS
whichever operation failed, because "no overrides" is derivable from local (DEC-13). A blob table
needs no tombstone; the absence IS the tombstone. **That table was one ledger entry from correct,
and it is the only one of the four whose bug is reachable today** — resetting the exercise library
offline left the server's overrides in place and the next hydrate wrote them back. The three persona
tables are latent only because 0005/0006 are unapplied.

### Traps paid for, in order of how much time they cost

🔴 **`expect(toast).toHaveCount(0)` IS NOT AN ASSERTION OF SILENCE.** It is satisfied the instant the
count is zero, which includes "has not rendered yet". **Proved, not reasoned:** a mutation making the
Schedule's autosave toast on every write left all three silence tests GREEN. It is a scan that ran on
nothing, in a different costume. Silence is now *observed* — a `MutationObserver` records every toast
that ever mounts and the assertion reads the record afterwards. **Any future "X never happens" test
in this repo needs this shape.**

⚠️ **A component cannot consume a context it provides.** `ToastProvider` was rendered inside App's own
JSX, so App could not toast — which blocked turning its `window.confirm` into an undo, because the
state to restore lives in App. Moved up into `StaffApp.jsx`. Still wraps the whole staff app; the
toast is `position: fixed`, so its place in the tree does not affect where it appears.

⚠️ **`Who&rsquo;s slipping away` is a real U+2019.** A locator using an ASCII apostrophe matches
nothing, so a layout test failed on its selector rather than on the layout.

⚠️ **Toasting from inside a `setState` updater fires twice under StrictMode.** Read the prior list
from state instead.

⚠️ **The "Exercise Library" nav entry opens a MODAL, not a screen.** It covers the sidebar and traps
focus, so any loop that visits it mid-sweep cannot click the next nav entry. Visit it last.

⚠️ **`jungle_skin` holds a bare string, not JSON**, so the `stored()` helper cannot read it.

⚠️ **An unlisted chunk in `check-size.mjs` has no ceiling at all** — it is counted in the file total
and never fails. A new lazy chunk that nobody adds can grow forever. `RetentionScreen` now has one.

⚠️ **Making a nav entry visible breaks two sweeps, both by design.** `ALL_SCREENS` is checked against
the running app by `responsive.spec.js`, so omitting the new entry failed loudly — the ⚠️ above that
list, working. And `interactions.spec.js` needed `analytics` in its navigation denylist, or every
other screen's sweep clicks it and navigates away mid-sweep. Its four-control positive control also
**fired correctly** on the screen itself: Analytics is a read-only report whose only buttons are Back
and an import link, both already denied. The wrong fix is adding controls so a sweep has something to
click; it is exempted by name with the reasoning recorded.

### One test deleted rather than fixed

`handleNewClass` skips the undo when there was no draft to lose, and that branch is **unreachable** —
the Dashboard renders the control only `{hasDraft && ...}`. The guard stays as defence for a future
call site. A test of an invented path is worse than no test, and this repo's own rule is not to
report a defect a fixture manufactured.

### Verified on the DEPLOYED bundle, not just locally

The local build is credential-less, so rollup drops every sync path and a local `dist/` cannot
answer "did this ship". `sw.js` is the precache manifest and lists every hashed asset, so from a tab
on the live origin one loop fetches them all and greps them. Result at `d3578a2`:

- `RetentionScreen-*.js` **is** in the deployment — N2 shipped.
- there is **no `Analytics*` chunk at all** — `FLAGS.mockAnalytics` stayed false and the mock is
  folded out of the PROD bundle, which the local build could not have told us. **The absent chunk
  is the assertion.**
- **none** of seven invented strings from that mock ("1,284", "£412", "Shoreditch", "Mara K.", …)
  appear anywhere in the deployed JS, and the retired "Real analytics land in Phase 2" panel is
  gone; all three N2 honesty strings are present.

⚠️ **The live staff app cannot be DRIVEN** — it sits behind the Supabase sign-in wall. Drive on the
dev server; verify shipping on the bundle. The recipe is in memory under `vite-build-stale-reads`.

### What is genuinely left

- 🔴 **Migrations `0005` and `0006` have never been applied.** Unchanged for several sessions and
  still the most expensive data in the product: a gym's personas, plans and movement catalogue exist
  on **one device with no server copy**. The coach-delete dialog now *says so* to the coach, which
  means **that sentence becomes a lie the moment you apply them** — recorded in `DYLAN-QUEUE.md`
  with the test that will remind you.
- 🔴 **N4 member links are built and undeployed** — seven sessions now. Still the only member-facing
  surface and the only place the white-label story can be proven on an actual member.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps that are also the fix
  for the Node 20 deprecation warning printed by every deploy in this session. Dylan's call.
- **§3.7 skeleton states** — decided against, with the argument above. Not an open item.
- **StaffApp has 10.5 kB of headroom.** Anything new goes in a lazy chunk with its own budget line.

### The honest assessment

The commercial gap the prompt named — "Jungle proves its value to the COACH and is sold to the
OWNER; both halves exist and nothing connects them with a number" — is closed. The owner's screen now
states monthly revenue at risk with its arithmetic, and the S$299 tier's third feature exists rather
than being parked behind a precondition the product already satisfied.

What is left in the queue is not theatre, but it is thinner than what came off it. The next session's
highest-value work is almost certainly **not on this list**: it is getting 0005/0006 and N4 in front
of a real gym, both of which need Dylan and neither of which any amount of code will move.
