# Jungle — Session Handoff

_Last updated: 2026-08-24 (session 30)_

> 📁 **Sessions 6–28 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 30 — the first feature that cannot be local-first, and the link that named the wrong person

> **Gates green at `HEAD`.** `lint:crash` **0** · **1019 unit** (36 files, was 935/33) ·
> **478 e2e** (47 spec files, was 466/46) · 12-chunk build · **0 over budget**.
> `StaffApp.js` **307.46 / 360 kB** (14.6% headroom, was 18.6%); `index.js` **unchanged** at
> 203.06 kB — nothing leaked into the entry chunk.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only.
> The local suite is the only gate and every number above is from it.

**The brief was right that this item is different in kind, and right about why.** It is the
first feature in this product that is two people on two devices, so it is the first with no
local-first version at all. What the brief did not know is that the product already contains a
class→person link, that it has been pointing at the wrong person since it was written, and that
nothing could see it.

### 🔴 Before anything else: this branch started 14 commits behind

`git log` showed `30520f2`, not the `3a6e4a0` the prompt names — **`3a6e4a0` was not in the
repository at all.** Session 29's work sat on `claude/jungle-session-29-build-pleym6` and was
never merged to `main`, and this branch was cut from `main`. My branch was a strict ancestor of
session 29's tip (14 behind, 0 ahead), so `git merge --ff-only 31f4aaa` fixed it cleanly.

**This is the third session in a row to hit this**, and session 29's own prompt warns about it
in the same words. It is not a warning problem, it is a process one: **nothing merges these
branches to `main`.** `main` is now four sessions stale. Confirmed the fix took by re-running
the unit gate — 935 tests over 33 files, matching the prompt exactly, which is what proves the
tree is the one the prompt describes rather than something that merely builds.

### What shipped

**§2.1 — a coach becomes a person, without touching the class row.** `class_schedule_rules.coach`
is `text` and the Schedule renders it as a free-text input, so "Mara", "mara" and " Mara " are
three coaches to everything that counts them.

The obvious fix — a `coach_id` on the rule — is the shape this repo has been burned by four
times. `_classToRow` maps a fixed column set, PostgREST rejects an upsert naming a column the
migration has not created, and it rejects **the whole batch**: a `coach_id` added before 0010
runs would not degrade, it would stop every class in the gym from syncing while the ledger said
only "class_schedule_rules failed". A local-only field is no better, because hydrate is
server-wins.

So **the class keeps carrying text, unchanged, and the roster carries identity.** Resolution is
by name. Nothing new is written to a class, no migration is needed for the link itself, and a
gym that has typed names for a year has nothing rewritten. `coachKey` folds only what is the
same string typed differently — case, whitespace, Unicode composition — and **never merges two
different names**, because deciding "Mara" and "Mara K." are one person is a judgement about a
gym's staff and a wrong merge silently reassigns somebody's classes. Aliases are how a gym says
so explicitly.

**🔴 §2.1's real find: `class_instances.coach_id` has been naming the publisher.** That column
already exists — a real FK to `profiles` — and `_ciToRow` was setting it to `_ctx.userId`. One
manager pressing **Add to schedule** once recorded every class in the week, everybody's, as
taught by that manager.

It survived because `coach_name` sits next to it holding the right answer, and every screen
reads the name. The only reader of the id is per-coach analytics, **which is on `DYLAN-QUEUE`
waiting to be built on it.** And the fact it was carrying was already recorded one line below in
`created_by` — so the old value was not merely wrong, it was a duplicate of its neighbour under a
name meaning something else. It now resolves the typed name against the roster and is **NULL
when we do not know**: a nullable FK whose null means "unknown" is worth more than a non-null one
that is confidently wrong.

⚠️ **Note how invisible it was.** 1006 tests passed with the old value in place. Reproducing it
needed a **connected** publisher — `_ctx.userId` is undefined in a bare test, so `|| null` made
the old code look correct. A test that did not call `connect()` would have pinned the bug.

**§2.2 — availability is a weekly grid in the schedule's own vocabulary.** `RULE_DAYS` and
`parseSlot` from `scheduleInstances.js`, not a second list, so matching a coach to a class is a
lookup and not a parse. Dated exceptions ("away this Thursday") are deliberately **not** half-built:
a grid is what makes the first useful version exist, and an exception list that silently fails to
suppress one Thursday is worse than an absent one because a coach would rely on it.

A claim is stamped with the local calendar date it was made on — by the store, not the caller, so
a grid cannot arrive undated — and goes stale after **56 days**. The number is arbitrary and the
behaviour is not: **a stale claim is kept and labelled, never hidden.** A gym whose whole roster
is stale would otherwise see an empty list and conclude nobody is free, rather than that nobody
has been asked lately. "Never stated" and "stated nothing" stay different answers.

**§2.3 — the loop, and the copy that stops it lying.** A request is raised against a real class,
offered to the coaches free at that day and slot, and approved or turned down; approval reassigns
the class and rejection provably does not. The race is **decided rather than discovered**: two
coaches both pressing Approve is the normal case for a 5am ask, so `settleCover` is
first-settle-wins and the loser is told which status won.

**§2.4 is a seam.** One adapter, a payload pinned by a contract test, one implementation that does
nothing and says so. No Mindbody code, no endpoint, no credential, no `fetch`, no coming-soon
panel, and deliberately no flag — a flag here would be a holding pen with nothing to hold.

### 🔴 §2.5 — the honest answer, which is no

**The round trip cannot be proven in this environment, and it cannot be proven in any environment
today.** Four independent reasons, each verified against the code:

1. **`playwright.config.js` targets the credential-less build on purpose** — "no network, no auth,
   a fixed PIN, and sync paths that no-op cleanly". So the entire existing suite, and every test I
   added, runs where `supabaseEnabled` is false and sync does nothing. A cover-request test in that
   harness proves the UI and the stored object. It cannot prove delivery.
2. **There is no table.** `cover_requests` and `coach_roster` do not exist. Migration 0010 is
   written and unapplied, joining 0005 and 0006.
3. **There is nothing to notify with.** `notification|web-push|onesignal|sendgrid|resend|twilio`
   matches the toast component and nothing else in `src/` or `supabase/`. The service worker is
   offline precaching only.
4. **🔴 And the finding I did not expect: the store cannot express a safe approval even after
   0010 runs.** `store.js` contains **zero `.update()` calls** — every write is an unconditional
   `upsert`, `insert` or `delete`. The only `.update()`s in the whole app are in `AuthGate` and
   `AdminTeamScreen`, and neither is conditional on a prior value. **There is no compare-and-set
   anywhere in this product.** An approval needs exactly that: `set status='approved' where
   id=$1 and status='open'`. Wire cover requests through `_bgUpsertDelta` and two coaches both
   approving both succeed, last writer wins, and one of them is shown an approval that did not
   happen.

So the answer to "can two devices agree" is **not yet, and the missing piece is a primitive, not
a table.** 0010 writes the conditional UPDATE into the schema comments so whoever wires it up
cannot reach for the upsert by habit.

**What was built anyway, and why that is not theatre.** The flow is real and exercised end to end
on one device, and the day 0010 runs the only thing that changes is where the rows live. What
must never happen in the meantime is the UI implying delivery — so `deliveryTruth()` is the only
thing allowed to describe what happened, it has three states, **none of them is "sent"**, and on
the shipped build the answer is "this device, and nobody else will see it". The last test in
`coachCover.spec.js` asserts the product never claims otherwise, and it goes red the moment the
toast says Sent.

### On §1.2 — the strategy line, answered on the record

The brief asked for a ruling. **I agree with it: this sits inside the "no CRM" line, except the
Mindbody write-back, which does not.** Coach availability and finding cover are staff operations
on the daily-frequency side the strategy doc says Jungle should own; nothing here books a member
or takes a payment. Writing back to the booking system a member booked through is the part that
makes Jungle a thing that edits Mindbody, which is the direction the line was drawn against —
and `classTypeRetention.js`'s header cuts both ways: **Mindbody holds the roster and the bookings
and Jungle does not**, so an approval that changes the coach in Jungle and not in Mindbody leaves
the two disagreeing about who is teaching. The seam and the queue entry are the whole of what
should ship until Dylan answers A16.

### What was false in the brief

- **The baseline commit.** `3a6e4a0` was not in this repository. See the top block.
- **"A migration is Dylan's… either carry the link in an existing blob column that already
  round-trips."** There is no such column. `class_schedule_rules` has no jsonb at all, and the
  per-gym blobs that do round-trip (`library_overrides.data`, `brand_profiles.branding`) are
  written whole by their own screens — putting a staff roster in `branding` means the next Brand
  Studio save silently drops the gym's entire coaching staff. The third option, resolving by
  name, is the one that works and the brief did not list it.
- **"Coaches can already be real users with accounts."** True of the schema, misleading in
  practice: the roster lives only in `memberships`, which is read live by `AdminTeamScreen`, and
  that screen is hidden entirely when Supabase is unconfigured — the shipped state. **With no
  server there is no list of people at all**, which is why the roster had to be local-first with
  the account link as an optional field rather than the other way round.

### Traps paid for

- ⚠️ **A revert that did not revert, on an untracked file.** A mutation script reverted by
  string-replacing the new value back to the old; when the "new value" was the empty string it
  matched 12,451 times and the revert aborted. `coachKey` sat without its `.toLowerCase()` and
  `git diff --stat` showed nothing, **because the file was new and therefore untracked.** Caught
  by re-reading the function rather than trusting the diff. `grep -rn MUTATION src/` would not
  have caught this one either — the mutation was a deletion, not a marker.
- ⚠️ **`| tail` exits 0 with 8 failing tests.** The brief says read the count not the exit code;
  worth restating that the failing run *and* the passing run both printed `[exited with code 0]`.
- ⚠️ **`useToast()` returns `{ toast }`, not `toast`.** Cost one 12-test e2e run.
- ⚠️ **This container is ~4× slower than the one the brief was written on.** A full e2e run takes
  **28–32 minutes**, not 7, and it appears to throttle between tool calls. Budget for three or
  four full runs in a session, not ten, and lean on `npm test` (4 seconds) and single-spec runs.
- ⚠️ **Playwright launch**, exactly as the brief describes: a five-line scratch config in
  `.e2e-scratch/` pointing `executablePath` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  `playwright.config.js` is untouched. **The directory is not committed.**

### What is genuinely left

- 🔴 **A15 — run migration 0010.** Until then a cover request reaches one phone. The product says
  so, but it is a real limit.
- 🔴 **A16 — the Mindbody decision and the four facts behind it.** Nothing is blocked; nothing
  should be built until it is answered.
- 🔴 **A compare-and-set primitive in `store.js`**, which A15 does not provide. This is code, not
  Dylan, and it is the first thing the next session should build if 0010 has run.
- ⚠️ **Nobody's phone rings, and the urgent case is the case this feature is for.** In-app only.
  Email would need a sender, a domain and about a day; it is written up in A15 and deliberately
  not assumed.
- ⚠️ **`main` is four sessions stale.** See the top block.
- ⚠️ **`addMember` stamps `joinedAt` with `toISOString().slice(0,10)`**, which is UTC and is a
  different calendar day from the coach's for part of every day. Not touched — it is a different
  field on a different path — but it is the same bug `daysBetween`'s comment exists for, and
  `localDateStr` in `store.js` is now the correct helper sitting right next to it.

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
