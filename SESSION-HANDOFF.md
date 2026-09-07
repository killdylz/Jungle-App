# Jungle — Session Handoff

_Last updated: 2026-09-01 (session 34)_

> 📁 **Sessions 6–32 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
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

> 🔴 **THE SESSION NUMBERING IS FORKED, AND BOTH HALVES ARE REAL.** `main` and the S29–33 stack
> diverged after session 27 and each numbered its next session **28**: main's built the 1:1 /
> PAR-Q path, the stack's rebuilt the white-label generator. Neither knew about the other. On
> merging, main's is filed in the archive as **`28-PT`** and the stack's keeps **28**. If a
> handoff, prompt or commit refers to "session 28", check which of the two it means — the commit
> is the only unambiguous reference. Sessions 29–33 are the stack's alone.

## Session 33 — cover stops being permanent, and starts with "I'm away" instead of "cover this class"

> **Gates green at `HEAD`.** `lint:crash` **0** · **1162 unit** (41 files) · **486 e2e**
> (47 spec files) · 12-chunk build · **0 over budget**. `StaffApp.js` **322.76 / 360 kB**
> (10.3%), `index.js` **203.06 / 215 kB** (5.6%, still the tightest). Five commits, each pushed
> after its own green run.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only.
> ⚠️ **TWO full runs, 484/2 each, and the two pairs of failures share no test between them** —
> `responsive` + `schedule` in one, `display` + `responsive`-at-a-different-width in the other.
> Every one passed on its own. That is the load flake, and the fact that it moved between runs
> is the strongest evidence available that it is not a regression. See trap 5 below: one of the
> four was NOT the known mount flake and the documented check for it misreads that case.
> ⚠️ Running two specs together straight after a full run failed **36 of 44** — the stale
> dev-server pattern CLAUDE.md names. The identical re-run passed 44/44. Re-run once before
> reading anything into a broad failure.

### What Dylan asked for, and the four decisions that shaped it

"A scheduler all coaches can use to get a sub if they are away." Most of the flow already
existed after sessions 30–32; what it could not do was the thing the sentence actually
describes. Four choices, made explicitly:

| | chosen | over |
|---|---|---|
| Entry point | **"I'm away these dates"** | pick one class at a time |
| Who is asked | **everyone free, first to claim** | one named coach |
| What a cover changes | **that day only** | the recurring class |
| Notifying | **in-app only for now** | email (needs a domain + sender, ~a day) |

---

### 🔴 The defect underneath all of it: approving a cover was permanent

`onAssignCoach` rewrote the RULE's coach field. A rule has no dates, so covering one ill Monday
moved that class to somebody else **every** Monday until a human noticed and edited it back.
S32 found this and could only fix the SENTENCE — there was nowhere else for the assignment to
go, because a cover request carried `classDay` and `classSlot` and no date at all.

**Now nothing writes to the schedule.** A request is raised against an OCCURRENCE, carries
`classDate`, and `applyCovers` overlays approved covers onto the derived occurrences. Since
occurrences are re-derived on every render, a cover lasts exactly as long as the day it names.
`assignCoach` is gone from `CalendarScreen` and its absence is the feature.

The grid shows the OCCURRENCE's coach rather than the rule's — the same name on every ordinary
day, and on a covered day the person actually teaching, with "covering for Mara" under it.
`publishWeek` reads the same covered occurrences, so a week published after a cover was agreed
writes the right `coach_name` into `class_instances` and attendance credits the right person.

### An absence is a person over dates, not a flag on a class

A coach away next week does not have "a class that needs cover" — they have six, and the gym
had nothing that said "Mara is away Mon–Fri and two of hers still have nobody". One absence is
recorded and the affected classes are **derived**, walking `occurrencesForWeek` week by week
rather than re-reading the repeat rules: a second opinion about which classes a rule produces
is how the grid and the board would come to disagree about what a coach teaches.

⚠️ **The classes are deliberately NOT stored on the absence.** Storing the list would freeze
it — a class added or moved afterwards would be missing from a list that looked complete. The
cover requests carry their own denormalised copy because those are answers somebody agreed to;
the absence stays a question.

### Broadcast: `to_coach_id` changed meaning and the column did not

It was "who is being asked", set at creation. It is now "who is covering", NULL until somebody
claims it. One field, one meaning, set at the moment it becomes true. `inboxFor` is gone — an
inbox needs an addressee — and `openCovers` replaces it with one board everyone sees the same.

⚠️ **The board does not hide classes from coaches whose grid says they are busy.** Same decision
`coachesFreeAt` documents from the other end: a grid is a claim somebody typed weeks ago, not a
rota, and hiding a class from someone who could have taken it is how it goes uncovered. Rows
carry whether *you* said you were free; nothing is filtered out.

`rejected` is gone from `COVER_STATUSES` and from the migration's CHECK — with a board, not
claiming something IS declining it, and a value the client can never write is exactly what
`dbConstraints.test.js` reports as drift.

### Migration 0010, amended rather than followed by an 0011

It has never been applied, and a second migration the client depends on is a second thing that
can be half-run. It gains `coach_absences`, `cover_requests.class_date`, `.absence_id`, the
narrowed CHECK and a board index.

🔴 **`create table if not exists` DOES NOT ADD A COLUMN** to a table that already exists, so a
project that ran the S32 copy would silently keep a `cover_requests` with no `class_date` and
then fail every cover push with a message naming only the table. The file now ends with
`alter table … add column if not exists` for both columns and a rebuild of the CHECK: a no-op
on a fresh database, the fix on a stale one.

---

### Four things the tests found that reading the code did not

1. 🔴 **Withdrawing an absence lost withdrawals.** `cancelAbsence` fired a settle per open cover
   without awaiting them, so each read `getCoverRequests()` before any of them wrote and each
   saved a list containing only its own change — last write wins, one class silently left on
   the board, no error anywhere. With a server every settle is a round trip, so the race is
   wide open and completely invisible on a fast connection. Sequential and awaited now.
2. 🔴 **The DST test proved nothing, twice over.** Written without a timezone it was vacuous
   (the suite runs in UTC, which has no DST). Moved into `Europe/London` it *still* could not
   be made to fail: mutating `daysInclusive`'s local-noon anchor back to midnight leaves it
   green, because `Math.round` absorbs the missing hour, and so does rewriting the parse as
   `new Date(str)` since a UTC-parsed pair shifts equally. The comment claiming the anchor was
   the fix is corrected to name `Math.round`, and the test block says in its own header that it
   is a regression guard and not mutation-checked. Kept, because the behaviour a coach depends
   on is worth a guard even when no single edit breaks it.
3. ⚠️ **My own e2e fixtures broke on my own fix.** Once past classes stopped being asked about,
   a fixture anchored on *this* Monday raised fewer asks than the test expected on every day but
   Monday. Moved to next week, which is entirely ahead whenever the suite runs.
4. ⚠️ **The grid shows only one class per cell**, and the shared fixture has two at Mon 06:00, so
   Strength Lab is not rendered at all there. Documented behaviour older than this feature; the
   grid assertions moved to an uncontested slot rather than a cover test being the thing that
   trips over it.
5. 🔴 **THE FULL-SUITE FLAKE HAS A SECOND SHAPE, and the documented check for the first one
   misreads it.** This run failed two specs. `responsive.spec.js` was the known mount flake —
   error context with no page content at all. `schedule.spec.js` › "unpinning takes the
   scheduled-type notice" was NOT: its snapshot showed a fully rendered app, the click had
   landed, and a 5-second `expect.timeout` was simply not enough for the next screen under two
   workers on a loaded box. **A populated snapshot means it is not the mount flake**, so it is
   either a slow render or a real defect and only the spec run separates them — both passed
   alone (28/28 and 18/18). CLAUDE.md's `grep -c "ref="` recipe also had to be corrected: not
   every snapshot carries `ref=` attributes, so an empty count proved nothing. Match on page
   content.

### Two defects found by rendering the panel and reading it — the seventh session running

- 🔴 **The board offered cover for a class that had already been taught.** On a Tuesday, a coach
  marking themselves away Mon–Fri got Monday's 06:00 put on the board. An ask nobody can act on
  is worse than no ask: it sits there, counts against the absence, and teaches people to ignore
  the board. Skipped now; the absence still records Monday, because they were away on Monday.
- The progress line read **"0 of 2 covered — 2 still have nobody"** — the same number twice in
  one sentence. Exactly the defect `availSummary` was fixed for two sessions ago.

---

### What is genuinely left

- 🔴 **A15 is now a bigger unblock than it was**, and still ten minutes. Until 0010 runs, an
  absence and its board live on one device and the panel says so.
- 🔴 **Nobody's phone rings.** After 0010 a coach sees the board when they next open Jungle.
  **This is now the only thing between the feature and the case it exists for** — a coach ill at
  5am. Email is a sender, a domain and about a day; it is written up in A15 and not assumed.
- 🔴 **`compareAndSet` still has not run against a real Postgres** — and it now decides who gets
  a class, not just a status. The first real race will be the first real run.
- 🔴 **A16 question 3 is unanswered and free to answer.** The booking payload now carries `date`,
  so a real adapter would push one occurrence rather than a recurring change — which makes the
  cancel-and-recreate question *more* answerable, not less.
- ⚠️ **"self" and "unlinked" panel modes still have no e2e** and cannot, against the
  credential-less build. The claim path is exercised through manager mode only.
- ⚠️ **A coach cannot cover part of a day.** An absence is whole days; a coach who can't make
  their 06:00 but can teach their 18:00 has to withdraw one ask by hand afterwards. The
  "Not needed" button does that, and it is the honest seam rather than a half-built one.
- ⚠️ **`hydratePersonas`' seed branch still has the delta hole** §2.1 fixed for the roster.
- ⚠️ **`main` is SEVEN sessions stale.** 28–33 live only on their own branches.
- ⚠️ 0005 and 0006 unapplied; N4 member links built and undeployed; A1 region unconfirmed; A14
  open; 10 Dependabot PRs; two checkboxes still browser-default blue.
