# Jungle — Session Handoff

_Last updated: 2026-08-25 (session 33)_

> 📁 **Sessions 6–29 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

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

---

## Session 32 — the roster leaves the device, and the panel learns who is holding the phone

> **Gates green at `HEAD`.** `lint:crash` **0** · **1109 unit** (40 files) · **488 e2e**
> (47 spec files) · 12-chunk build · **0 over budget**. `StaffApp.js` **315.22 / 360 kB**
> (12.4%), `index.js` **203.06 / 215 kB** (5.6%, still the tightest). Six commits, each pushed
> after its own green run (the sixth is this block plus one last fix, below).
> ⚠️ **The full run was 487 passed / 1 failed, and the failure was the documented mount flake**
> — but it landed on `responsive.spec.js` › "Analytics fits" @390px, **not** on
> `syncBanner.spec.js`, which is where CLAUDE.md had recorded it for three sessions. Error
> context had **zero page snapshots** (the app never mounted) and the spec passed **28/28
> alone**. CLAUDE.md is corrected: the flake is in the app mount under full-suite load, not in
> one spec. The run took **30.4 minutes**.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only. The
> local suite is the only gate and every number here is from it.
> 🔴 **The branch this session started on was `main` at `30520f2`, 20 commits behind — the
> fourth session in a row to pay for it.** `git merge --ff-only 2098cc4` was clean, and the
> position was then confirmed with `npm test` (1069/39, matching the prompt's table) rather
> than with the log, which is the check that actually proves it.

### What this session was

Dylan asked for three things: coaches enter their own availability, the app matches them to a
class that needs cover, and Mindbody updates immediately. Two of those are code, one is not,
and the ordering mattered more than any of them — because everything asked for sat on top of a
sync layer that did not exist.

---

### 🔴 §2.1 — the roster and cover requests had NO sync path, and the queue said otherwise

**Verified before building, and it was the prompt's central claim: `coach_roster` and
`cover_requests` appeared in ZERO push calls and ZERO hydrate reads across the whole of `src/`.**
The only references anywhere were comments. `saveCoaches` and `saveCoverRequests` were plain
`writeJSON` one-liners. Running migration 0010 would have created two empty tables that nothing
ever wrote to or read from, and the roster would have stayed on one phone with a tick next to
it in `DYLAN-QUEUE`.

⚠️ **A15 was less wrong than the prompt said, and wrong in a way that matters more.** It did
carry a note that the settle still needed wiring — the prompt claims it omitted that. What it
got wrong was the FRAMING: a 10-minute migration headlined "run this or coach cover stays on
one phone", with the client half relegated to a footnote about one function. A15 now says what
actually changes on screen when the migration lands, which is the real test rather than two
empty tables.

**The client half is built.** The two tables are written differently and the difference IS the
feature:

- **`coach_roster`** is an ordinary id-keyed list domain on the delta writer every other one
  uses. `removeCoach` deletes explicitly (an upsert of the remaining list cannot express a
  removal), and `_bgDelete`'s `_unmark` makes the toast's undo actually reach Postgres for free.
- **`cover_requests` must NOT use `_bgUpsertDelta`,** and this is the part to read before
  touching it. Device A holds request R as `open`. Device B approves it. Device A hydrates —
  writing no delta marks, because nothing does — then raises an unrelated request. The delta is
  "every row whose fingerprint has no mark", which after a hydrate is ALL OF THEM, so the list
  upsert re-sends R as `open` and the approval is gone. Nothing fails, nothing logs, the ledger
  says the table synced. So a cover request has exactly the two writes its RLS policies allow:
  an INSERT with `ignoreDuplicates` (the append-log shape `attendance` already uses — **the flag
  is load-bearing, not an optimisation**), and the conditional UPDATE that settles it.

**`compareAndSet` has made its first real call.** The settle is the only write in `store.js`
that is not local-first, and the justification is the only one that could be: two coaches both
pressing Approve both read `open` and both are right when they read, so there is no local fact
to be first about. The server decides and the local write follows. The loser is told WHAT won,
with a second read on that branch — "somebody beat you" without saying whether the class is
covered withholds the one fact they came for. A settle that cannot be confirmed writes nothing
at all. It falls back to the S30 device-only path when there is no server or no table, so a gym
using this locally today is not regressed into being unable to settle anything.

#### Hydrate is server-wins for one table and not the other, decided rather than inherited

`_guardList` protects a row the server has never heard of and a row the coach deleted. It does
not protect the third case, which did not exist before coach availability: **a row the server
HAS, whose local copy is newer.** A coach ticks Thursday on the way to the gym and the push is
still in flight; server-wins silently restores the older grid.

⚠️ **The obvious fix is wrong here, and `availabilityAt` sits right there looking like a version
clock.** It is a LOCAL CALENDAR DATE. Two edits on the same day are indistinguishable by it and
two devices in two timezones do not agree which day it is. The signal used instead was already
in the file: a delta mark is written only from `_bgUpsert`'s success path, so "fingerprint ≠
mark" means exactly "the server has never confirmed this content". No clocks, no timezones, no
new storage. Stated plainly it is last-writer-wins **biased toward the device with unsynced
work** — two coaches editing between two hydrates still lose one edit. What it removes is the
case where the losing edit is the one you just typed and watched save.

`cover_requests` stays server-wins with no exception, because a local status is never
legitimately ahead of the server's.

#### A table the database has not got is not a failed write

Both belong in the ledger and both are there. What differs is what the product may CLAIM
meanwhile, and this turned up a shipped honesty defect: **`deliveryTruth` answered "waiting" —
documented as "the row can reach their device when they next open Jungle" — for any gym with
credentials, and that was false for every one of them**, because nothing pushed the row
anywhere. The comment described a push that did not exist. There is now a fourth state,
`unstored`, read from a missing-table observation the hydrate probe records and the first
successful write clears. **It does not suppress the push**: nothing would ever clear a latch
that stopped writing, since the only evidence a migration has run is a write that succeeds.

#### Found while testing

The seed-from-local branch pushed **nothing** when the device held marks the server does not
honour — a gym whose Supabase project was re-provisioned would have kept its roster to itself
for ever, no request made and no error recorded. It drops the marks first now. That is
`restorePersonaCascade`'s lesson arriving from the other direction, and **the same latent hole
exists in `hydratePersonas`' seed branch** (`savePersonas(local)` also goes through the delta
writer). Not touched this session; noted below.

---

### §2.2 — a coach editing their own availability, and the identity that finally exists

**Verified: `ROLE_DEFAULTS.coach` has `schedule:*`,** the panel lives on the Schedule screen,
and every roster entry rendered Edit / Availability / Remove for whoever was looking. So the
moment a gym turns its server on, every coach can edit everyone's availability and delete their
colleagues.

⚠️ **This could not have been fixed before now, and the panel's own comment said so:** "with no
server there is no signed-in user, so the product genuinely cannot tell who is holding the
phone. Scoping the buttons would require inventing an identity we do not have." True — and it
stopped being true in S31, which built the control that writes `userId`.

`rosterViewerMode` has three answers. **"manage" is also the no-server answer, checked first
and deliberately:** a panel that locked itself down because it could not tell who you are would
break the single-device gym to protect it from a second person who does not exist. A bug in the
identity link therefore fails toward what shipped. **"unlinked" is not folded into "manage"** —
on day one a manager has linked nobody, so that fold would hand every coach the full roster.

The split is one line: name, aliases, account link and removal are the gym's to set (a coach
renaming their own entry would silently unlink every class typed under the old name);
availability is the one thing only the person themselves knows. Approve/Turn down now belong to
the coach who was ASKED, Withdraw to the one who RAISED it. The capability is `members:manage`,
reused rather than invented — it already gates the Team screen.

🔴 **THE E2E GAP, and it is real.** `playwright.config.js` targets the credential-less build, so
`AuthGate` never mounts and there is no signed-in user to be. **The harness can drive "manage"
and cannot drive "self" or "unlinked" at all.** Inventing an identity for a test to hold would
be inventing the exact thing the panel spent two sessions refusing to invent. So the decision is
a pure function pinned exhaustively in unit tests, and what went into e2e is the branch that
ships. Neither half is sufficient alone. **If a future session gives the e2e target a way to be
signed in, these two modes are the first thing to point it at.**

---

### §2.3 — the matcher needed nothing, and approval was doing something worse than the prompt said

**`coachesFreeAt` is correct and needs no work.** It matches on the grid, sorts fresh above
stale, excludes `active === false`, returns `reach`. Read against the code and its tests; the
three things its header says it deliberately does not do are each right.

🔴 **What I found instead: `onAssignCoach` rewrites the RULE's coach field.** Approving cover
for one ill Monday moves Strength Lab to Dev **every Monday, for ever**, until a human notices.
The mechanism is deliberate and correctly tested, and there is nowhere else the assignment could
go — `class_instances` carries `coach_name` but only exists for a class already published or
started. **What was wrong is the sentence.** "Dev now teaches Strength Lab" was the whole
message, and everyone who has ever asked for cover reads that as "this Monday".

The recurrence is now stated on the request card BEFORE the button and in the toast after. A
one-off rule gets neither, and that control is what proves the warning is derived rather than
printed unconditionally.

**Dated cover was considered and deliberately not built.** It is a feature, not a field:
there is no per-occurrence coach override anywhere (future occurrences are DERIVED by
`occurrencesForWeek`), the column would have to go into the migration this session just made
the client depend on and Dylan has not yet run, and CLAUDE.md's rule about the sibling feature
applies with more force — a cover that LOOKS one-off and silently is not is worse than one
honestly permanent.

---

### §2.4 — the outbox, and why it is not a second adapter

**Nothing calls Mindbody. No endpoint, no credential, no `fetch`, no panel.** Dylan's yes is
recorded in A16 as answering the decision and not the four facts, with **question 3 marked as
free to answer and decisive**: if instructor substitution is cancel-and-recreate only, approving
a cover deletes members' existing bookings, which is worse than never integrating.

Every approval now leaves a durable record of the exact payload, keyed so the same substitution
can never be posted twice.

🔴 **It is NOT the "second adapter implementation" §2.4 asked for, and `bookingAdapter.test.js`
already said why:** "shipping a fake adapter in the bundle would put a second implementation one
import away from being wired up by accident". A second implementation also forces
`bookingAdapter()` to choose between two, needing the registry its header bans in capitals.
Recording is a ledger OF pushes, not an alternative way of pushing, so it wraps the call. When a
real adapter lands it keeps working and starts recording real pushes — which is where a
double-post has to be stopped anyway.

**Idempotency now rather than later**, because a key added afterwards has to be back-filled onto
records written without one. It is DERIVED from the pinned payload (`approvedAt` is what makes
two approvals of the same class distinct, and `settleCover` guarantees it) rather than minted,
and the request id is deliberately not added to the payload — that would widen a pinned contract
for our own bookkeeping. On a duplicate the adapter is not called again and the PRIOR outcome is
re-reported, because a call that was never made has no new answer.

⚠️ **No screen for it, deliberately.** "3 changes waiting to reach Mindbody" is the coming-soon
panel this repo bans, on a queue that may never be sent at all.

---

### Traps paid for, in the order they cost time

1. 🔴 **`lint:crash` is BLIND to the temporal dead zone.** Reading `auth` above its
   `useJungleAuth()` declaration put the whole Schedule screen into its error boundary and timed
   out all 17 coachCover specs looking for a button that never rendered — with `lint:crash` at
   0 and 1095 unit tests green. It resolves identifiers, and the binding genuinely exists in
   scope. **A broad e2e failure in ONE spec file, right after a render-order change, is a crash
   and not the stale-dev-server flake** — the tell is `Something went wrong` / an error-boundary
   heading in the page snapshot, and the fastest route to the cause is a throwaway spec with
   `page.on("pageerror")`, not the trace viewer.
2. 🔴 **A test that could not fail, caught by mutating for it.** "Re-pushing a stale list cannot
   un-approve a settled request", written the obvious way, passed with `ignoreDuplicates`
   REMOVED — `_retryNow` only pushes tables in the ledger, the ledger was empty, so nothing was
   pushed and nothing was asserted, in green. It now fails a write first so the pusher really
   runs, and carries a positive control that the whole list really was re-sent. **Every one of
   this session's claims was mutation-checked; this is the one that was hollow.**
3. ⚠️ **`navAnyWidth` opens with `sidebar.count()`, which does NOT auto-wait.** A scratch probe
   reading the panel straight after `page.reload()` decided there was no sidebar at 1280px and
   went looking for a "More" button. Wait for `aside, nav` first.
4. ⚠️ **A scratch spec needs its own config**, not `--testDir` (not a Playwright flag) and not a
   path argument against a config whose `testDir` is `e2e/`.

---

### What is genuinely left

- 🔴 **`main` is SIX sessions stale.** 28–32 live only on their own branches. Five sessions have
  now paid the same twenty minutes at startup. **A session cannot fix this from inside.**
- 🔴 **A15 is now a real 10-minute unblock** — the client half exists, so running 0010 does what
  the queue says. Until then a gym with credentials sees "your Jungle server is connected but
  has no coach storage set up", which is the honest version of what it used to claim.
- ✅ **One late fix, after the full run:** the hydrate probe cleared a known-missing table on
  ANY error, so an outage would have put "waiting for Dev to open Jungle" back on screen for a
  gym that has never run 0010 — a claim that was false either way. Absence is now asserted only
  by the error that means it, and only a successful read clears it. Mutation-checked.
- 🔴 **`compareAndSet` still has not run against a real Postgres.** Everything asserted about it
  — including this session's settle — is against a fake modelling PostgREST's documented
  contract. The first real race will be the first real run; the two assumptions to check are at
  the top of the file.
- 🔴 **A16 question 3 is unanswered and free to answer**, and it decides whether §2.4 ever
  becomes an integration or stays an outbox permanently.
- 🔴 **0005 and 0006 have never been applied.** ⚠️ The coach-delete dialog TELLS the coach so and
  `e2e/destructive.spec.js` asserts the string — applying them makes a shipped sentence a lie in
  the same session.
- 🔴 **N4 member links are built and undeployed — thirteen sessions.** A12/A13, 35 minutes.
- 🔴 **Nobody's phone rings.** After 0010 a cover request reaches the other coach only when they
  next open Jungle. **This is now the binding limit on the feature**, not the storage.
- ⚠️ **`hydratePersonas`' seed branch has the same delta hole §2.1 fixed for the roster** —
  `savePersonas(local)` sends a delta, so a re-provisioned server would not be seeded. One
  `_unmark` loop, and a test that the seed actually pushes.
- ⚠️ **A class's own coach is still offered as cover for it**, producing a request whose from
  and to are one id. The one-line filter was written and REVERTED: it turns a 🔴 e2e assertion
  red (`coachCover.spec.js` seeds a stale claim on the class's own coach to prove a stale claim
  is offered WITH its age). It needs its own commit and its own fixture decision.
- ⚠️ **"self" and "unlinked" have no e2e** and cannot have one against the credential-less build.
- ⚠️ A14 is open and is a yes/no. **A1 — the Supabase region — has never been confirmed**, and
  it is the only item that gets dramatically more expensive with age.
- ⚠️ **10 unmerged Dependabot PRs**, five major GitHub-Actions bumps. Ask Dylan first.
- ⚠️ **Two checkboxes render browser-default blue on a gym's palette** — `RosterScreen.jsx:343`,
  `PersonasScreen.jsx:1009`. Wants its own change with a token test.
