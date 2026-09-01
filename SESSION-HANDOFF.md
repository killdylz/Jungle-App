# Jungle — Session Handoff

_Last updated: 2026-09-01 (session 34)_

> 📁 **Sessions 6–25 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 34 — three defects fixed, and three claims in the brief that were not true

> **Gates green.** `lint:crash` **0** · **964 unit** (33 files) · **469 e2e** (45 spec files) ·
> seven-chunk build, **0 over budget**. StaffApp **355.19 / 360 kB** (4.8 kB left, still the
> binding constraint). `PTScreens.js` **34.00 / 36 kB** — ceiling raised from 34 in this commit,
> see below. App.jsx unchanged at **3,857 lines**.

**The brief was session 34's own prompt.** Its §2 is blocked on Dylan; its §5 says so and names the
fallback: *"Build §2.4's D1, D4 and D5 instead; none depend on it."* That is what this session did,
plus the verification §0.1 and §0.3 ask for. **§2.1 and §2.2 were deliberately not actioned** — see
"What is still Dylan's" below.

### 🔴 Three false premises, in order of how much they mattered

The prompt's §0.3 says a prompt is wrong somewhere and §5 says to record it explicitly. It was
wrong in three places, and the first one would have shipped a compliance defect.

1. 🔴 **D5 asked for `store.recordConsent()` with a `health_screen` scope. Both halves are wrong.**
   - `consent_records.scope` carries a CHECK constraint (migration `0007`) listing exactly
     `roster_attendance`, `biometric_live`, `biometric_store`, `coach_view`, `export`.
     **`health_screen` is not in it, so every insert would have been REJECTED by Postgres** — this
     repo's recurring data-loss bug, three prior occurrences, and the reason `RETENTION_RULES`
     exists as one exported constant. Adding the scope needs a migration, which §3 forbids.
   - Worse, and the reason this is not merely a bug: **a `consent_records` row asserts that a person
     consented.** `CheckInPanel` already refuses to write one, in its own words — *"in a coach
     sweep, none was [shown]... writing one anyway would fabricate a compliance record, which is
     worse than an empty ledger."* The prompt's other half ("and so is attendance") asked for
     exactly that fabrication, for health data.

   **So the letter of D5 was refused and its intent was built instead.** The health screen, unlike
   a coach sweep, is a form somebody sits and fills in — so a notice can actually be shown and
   actually agreed to. `PARQ_CONSENT_NOTICE` is on the page, the checkbox starts unticked, and
   `appendParqRecord` **refuses to write health answers without it**. Nothing is sent to a column
   that would reject it. Filed as **DYLAN-QUEUE A16**.

2. 🔴 **§2.3: the sessions 29→33 stack does NOT merge cleanly.** The prompt says *"At `4bf138e` it
   had zero conflict hunks with `main`. That number only goes up."* `main` is still `4bf138e`, so
   nothing decayed — **the measurement was wrong.** The legacy `git merge-tree base ours theirs`
   form emits no conflict markers here, which reads as "clean"; `git merge-tree --write-tree` exits
   **1** and names **seven conflicted files**:

   `CLAUDE.md` · `SESSION-HANDOFF.md` · `docs/history/HANDOFF-ARCHIVE.md` ·
   `e2e/brandTokens.spec.js` · `scripts/check-size.mjs` · `src/App.jsx` · `src/lib/store.js`

   Four are prose and mechanical. **Three are code or config**, and the overlap with §2.2's stated
   PT collision set is not a coincidence: the stack was cut before session 28's PT work landed on
   `main`, so it collides with exactly that. ✅ The prompt's *other* §2.3 claim IS true —
   `gracious-hopper`, `session-29`, `-30` and `-31` are all ancestors of `prompt-32-verification`,
   so it is **one merge, not five**. This session made those three files worse, unavoidably: the
   gate numbers in `CLAUDE.md` and the `PTScreens` ceiling in `check-size.mjs` had to move.

3. **§2.5 undercounts the Dependabot PRs: there are TEN open, not nine.** The prompt lists
   `#2–#6, #8–#11`. **`#1` (actions/checkout 4→7) is also open.** `CLAUDE.md` said ten and was
   right. Still Dylan's call, unchanged.

**And one the prompt flagged as unknowable, now measured:** §0.3 says to test A15 by pushing a
`claude/**` branch and seeing if a PR appears. **That test cannot work yet.** `auto-pr.yml` lives
only on PR #14's branch, and a `push` event runs the workflow files present *on the pushed ref* —
so a branch cut from `main` never triggers it. PR #14's own `open` job did run and went green, but
its log shows it exited early with *"PR #14 is already open… the new commits are on it"* — it never
reached `gh pr create`. **A15's state was therefore unknown — and is now MEASURED, because #14 was merged
later in this session and the next push tested it for real.** The answer is **OFF**. Pushing this
branch ran `auto-pr.yml` from `main` for the first time, and the log says it exactly:

```
pull request create failed: GraphQL: GitHub Actions is not permitted to
create or approve pull requests (createPullRequest)
```

The job then warned and exited **clean**, which is the behaviour `af56d07` designed on purpose — a
workflow that is always red is one everybody learns to ignore, and the next real failure hides
behind it. So **A15 is confirmed outstanding, with the API's own words**, and until Dylan ticks the
box every `claude/**` branch still needs its PR opened by hand.

### What shipped

**D1 — a 1:1 client trained twice a week and was flagged for not turning up.** `addMember` always
stamps `joinedAt`, so rule 1 runs on every hand-added member; 1:1 sessions are deliberately never
written into `attendance`; so `visits` was **0** for someone in the gym twice a week. The flag fired
at the highest severity it carries, and `revenueAtRisk` priced it as money walking out. The member
never sees it, which is what made it expensive — the coach phones someone they trained on Tuesday.

`activityIndex(attendance, ptSessions)` merges both sources; **only DELIVERED sessions count**, because
a booking is an intention and counting it would let a client who books and never turns up look like
the most engaged member on the roster. Every flag's `reason` now names which kind it counted
("all one-to-one", or "1 in class, 2 one-to-one").

Three decisions inside it worth keeping:
- ⚠️ **`studioActivity` stays attendance-only, deliberately.** It answers a question about the
  STUDIO — "would firing the absence rule now produce a wall of false alarms?" — and a gym that
  imported two years of history and then ran one 1:1 must not have its whole back-catalogue flagged
  on the strength of that session. The cost is a silence, and the summary says so on screen.
- The 1:1 log is passed as **raw rows**, not via a helper. `store.js` imports `RETENTION_RULES` from
  `retention.js`, so importing `ptSessionStatus` back would close a cycle; and mapping it in
  `ptClients.js` would put a lazy module on RosterScreen's import graph — the seam CLAUDE.md warns
  about. A mirror test pins that the literal `"done"` matches store.js's own coercion.
- **The same index now feeds the roster rows AND the CSV export.** They used to count attendance
  directly, so a client whose flag said "attended 5 times (all one-to-one)" had `0` and "never"
  beside it, and the export — headed with the same two words, "Visits" and "Last seen" — said the
  same. That artefact is what a gym takes when it leaves and what a member gets when they ask what
  is held about them: the worst place in the product for a disagreement to live.

**D4 — a health screen went valid → blocking overnight.** `expiresOn` fed the hard cliff and nothing
else, so the first thing that ever mentioned an expiry was the refusal, discovered with the client
in the room. There is now a **30-day warning window**: `expiring` + `daysToExpiry`, a `warn` tone, a
deadline sentence with the date on it, a count on the 1:1 roster summary, and the chip saying
"expires in 12d". `blocksLoad` stays **false** throughout — a warning that blocked would just move
the cliff thirty days earlier.

⚠️ **It is a MODIFIER, not the "sixth state" the prompt asked for**, and that is deliberate:
`assignPtSession` writes `parqStateAtAssign: parq.state` as the audit trail, and `cleared` vs
`gp_cleared` are different assurances. A state that overwrote either near an expiry date would erase
which one applied *for exactly the sessions taken closest to the edge*. A test pins `"expiring"` out
of `PARQ_STATES`. (The prompt also miscounts: there were already six states, not five.)

The expiry warning is **text, not colour**. There is no `--warn` token — `colors.js` has accent,
green and danger, and danger is deliberately not skin-derived — so the options were to invent a
fourth global colour or say it in words. Words win twice: WCAG 1.4.1 forbids colour as the only
carrier, and `brandTokens.spec.js` sweeps opaque text for AA on a light skin, where a new amber
would have to earn 4.5:1 against a white card that `--danger` (3.8:1) already cannot.

**D5 — see false premise 1.** The consent is real, local, dated, versioned, and enforced in the
store as well as the screen, because a gate that lives only in JSX is one the next caller walks
through. An **amendment** (`amends`) inherits the prior row's consent rather than asking again —
a doctor's clearance appends a note against answers already given, and the client is not in the
room. A legacy record with no consent **inherits nothing, honestly**: back-filling today's date
would assert an agreement nobody was ever asked for.

### The size ceiling moved, and what bought it

`PTScreens.js` measured **34.00 KB against a 34 KB ceiling — passing by ONE BYTE** (33,999 of
34,000). That is a tripwire, not a guard. Raised to **36** (prod 36 → 38, keeping prod two wider as
the file's own note requires). What bought the bytes is prose, on the lazy side of the seam where
this repo wants prose: D4's expiry sentences and D5's consent notice. StaffApp absorbed **+1.03 kB**
(354.16 → 355.19) for `activityIndex` and the export's use of it, and needed no raise.

### The residual D1 does NOT fix, and it is a product decision

Rule 1 asks for **4 visits in the first month**, a threshold written for class attendance. A 1:1
client on a **weekly** cadence has 3 visits at day 21 and is still flagged. The prompt's stated
case — *"training twice a week"* — is fixed (≈5 visits by day 20, no flag), and the count is now
honest either way. But whether a weekly 1:1 cadence should trip a rule calibrated on classes is a
question about the product, not the arithmetic, and inventing a second threshold silently is exactly
the kind of number this repo refuses. **Left for Dylan, stated here rather than guessed at.**

### What is still Dylan's

- **§2.1 was NOT done autonomously — it was put to Dylan first, and he said land them.** The
  prompt's header says *"Do NOT run this session fully autonomously"* and its intro puts all of §2
  on him, and merging to `main` triggers a Pages deploy, so this was asked rather than assumed.
  **#14 is merged** (`bd04de0`), which put `ci.yml` and `auto-pr.yml` on `main` and made A15
  measurable — see above.

  ⚠️ **The prompt's step 2 does not work as written.** `workflow_dispatch` against
  `claude/rls-staff-read-boundary` cannot run `ci.yml`, because a dispatch runs the workflow file
  **from the chosen ref** and that branch was cut before `ci.yml` existed — there is no file there
  to dispatch. What works: merge `main` into it (no history rewritten, migration untouched) and let
  the `push` trigger fire. Done in `ec6cd89`, and **#13 has a running CI check for the first time in
  its life** — the gap the prompt's §2.1 exists to close.

  🔴 **Merging #13 still changes NOTHING on the server.** The policies move when **A14** is run in
  the SQL editor, not when the file lands. Do not report the RLS hole as closed on a merge.
- **§2.2 (which PT implementation survives) is untouched**, as instructed. No PT surface was added;
  D1/D4/D5 are all repairs to what is already on `main`, so none of them is wasted work if the
  rival implementation wins — the PAR-Q gate and the at-risk rules are shared either way.
- **A14 / A15 / B10 / A16** — unchanged, plus A16 is new (the `health_screen` consent scope).
- **`0005` and `0006` still unapplied.** Unchanged for several sessions.

---

## Session 28 — the 1:1 path exists, and the health screen that had to land with it

> **Gates green.** `lint:crash` **0** · **935 unit** (33 files) · **466 e2e** (45 spec files) ·
> seven-chunk build: member path **211.58 kB**, staff **564.43 kB** (StaffApp **354.16/360 kB** —
> 5.8 kB left, and still the binding constraint). New lazy chunk `PTScreens.js` **31.63/34 kB**.
> App.jsx **3,857 lines**.

**The brief was one line: "I would like to see the new screens built for the PT function."** The
branch name said `pt-function-new-screens` and carried no commits, so nothing existed to be shown
and this is the build.

### What "the PT function" turned out to mean

F1 ("session/assignment primitive") has been 🟡 since the spec was written, and its unbuilt half is
the same sentence in six places: **"no 1:1/PT path exists at all"**, so design principle P5 — *one
primitive, two lenses* — was ⛔. F2's gap 1 attaches a condition to closing it: the PAR-Q screen
**"must land in the same change that introduces individualized load, not after"**. So this is one
change, not two.

### The decision that shaped everything: no migration

The spec says F1 "needs a migration — Dylan's call", and CLAUDE.md says no infra changes without
asking. Both hold. So the 1:1 lens is **local-first only**: three new localStorage keys
(`jungle_pt_clients`, `jungle_parq_records`, `jungle_pt_sessions`) and **not one sync call**.

That is not a shortcut, and the comment above `getParqRecords` says why at length. Wiring
`_bgUpsertDelta("pt_clients", …)` against a table that does not exist fails on **every** write,
and the failure is loud in the wrong way: `_noteSyncError` lights the sync banner permanently and
`startSyncRetry` re-pushes the same doomed rows every 30 seconds for the life of the session. A
feature that breaks the banner for every other domain is worse than one that is honest about being
local, and the screen says so in its first card.

⚠️ `members` still syncs. A 1:1 client **is** a member — the same row the roster, the check-in list
and the retention analytics already know — plus a record saying "this person also trains 1:1". The
shared roster stays shared; only the part with no table waits.

### What shipped

**Two screens, one lazy chunk.** `1:1 Clients` (`pt`) and `Health Screen` (`pt-parq`), both in
`src/screens/pt/`, both reached from the sidebar and the More sheet under the SAME word — the
Builder's three vocabularies are a documented trap, not a pattern. Neither is on the four-item
bottom bar; a coach does not open a health screen mid-burpee.

⚠️ **App.jsx lazy-loads ONE barrel (`PTScreens.js`) twice, on purpose.** Two dynamic imports of two
files emit two chunks plus a third for the shared libs — with a generated name that is not in
`check-size.mjs`, which its own ⚠️ says is how a lazy chunk grows with no ceiling at all. One
specifier, one chunk, one budget line.

**The gate is `lib/parq.js`, and it is arithmetic, not markup.** The seven classic PAR-Q questions
in the industry's own words (a reworded health question is a different question), six states, and
one function — `parqStatus()` — that every surface reads `blocksLoad` from. A second answer to
"may I prescribe for this person" is how a hard gate stops being one.

Three rules in it are worth knowing:
- **Unanswered ≠ "no".** `newParqAnswers()` is `null`, not `false`. A sheet defaulted to `false`
  reads as a completed screen with seven clean answers that nobody was ever asked.
- **Expiry is checked BEFORE clearance,** and the order is load-bearing. A 2025 GP letter was
  granted against a 2025 health picture and cannot clear a 2026 session.
- **A clearance with no date is ignored** — undated is a coach ticking a box, which is what the
  gate exists to prevent. Both the store and `parqStatus` refuse it.

**The refusal is enforced twice and shown once.** `store.assignPtSession` will not write a session
without a passing status, and the screen renders the refusal instead of hiding the form — a form
that vanishes teaches nothing, and a coach who cannot see the block will look for a way round it.
Each written session carries `parqStateAtAssign`, because `cleared` and `gp_cleared` are different
assurances and a year from now that is the whole question. Plans are **snapshotted** on assign, so
editing the Builder draft afterwards cannot rewrite what was prescribed to a named person — the
boundary F1 notes classes still do not have.

**1:1 sessions are deliberately NOT written into `class_instances` or `attendance`.** The shapes
fit, and that is the trap: every studio number would quietly start counting one-person sessions as
classes, average class size would fall, the retention curve would move, and nothing on screen would
say why. The banner states it in the owner's words.

### Two defects found by READING the screen, not by running it

935 unit tests and 466 e2e tests were green when both of these were on the page.

1. **The refusal printed the same forty words twice.** `describeLoadGate` restated
   `parqStatus().reason` directly beneath the health-screen panel that had just said it. It now
   says what is LOST and where the fix is; `parq.test.js` pins that it must not contain `reason`.
2. **The health screen scolded a coach who had not asked anything yet.** The live preview read
   *"0 of 7 questions answered. A part-answered screen is not a screen."* on an untouched form —
   about the thing the form is FOR. Hidden until the first answer.

### What the sweeps needed, and the trap under it

Adding two screens grew the existing sweeps by 16 tests automatically (`ALL_SCREENS` is checked
against the running app by `responsive.spec.js`, which is that design working). Two things had to
be done by hand:

- `interactions.spec.js` needed a **seed** for both. An empty 1:1 screen has one button on it and
  would have satisfied the ≥4 positive control by testing nothing — the trap that has now bitten
  three times in this repo.
- The PAR-Q's fourteen Yes/No buttons are **44px in the box, not via a `data-tap` overlay**.
  `index.css` warns that adjacent overlays closer than 44px steal each other's hit area, and these
  sit in pairs eight pixels apart. `pt.spec.js` hit-tests them at 390px with the questions actually
  rendered, because `mobile.spec.js` visits this screen on a fresh app where they do not exist.

Both new screens were also added to `brandTokens.spec.js`, which sweeps opaque text for AA contrast
on a hand-built LIGHT skin. `--danger` (#EF4444) reads at 3.8:1 on a white card, so the blocked
chips carry it as a **border and a dot** and the words carry `--text`.

### What is still Dylan's

Unchanged and now more expensive: **`0005` and `0006` have still never been applied**, and the 1:1
ledgers join the coach corpus in existing on exactly one laptop. The `session_assignments` migration
that F1's acceptance criterion actually names — *`session_assignment` targets a `class_instance`
XOR a `member`* — is still unwritten, so **F1 stays 🟡 and its server half is untouched**. What
changed is that the product now has the 1:1 lens in front of a coach, and the mappers have an
obvious place to go when the table exists: beside `_memberToRow`, replacing three local-only
getters. See `DYLAN-QUEUE.md`.

---

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
