# Jungle — Session Handoff

_Last updated: 2026-08-25 (session 32)_

> 📁 **Sessions 6–29 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

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

---

## Session 31 — a field nothing can write is not a feature, and the check that finds the next one

> **Gates green at `852550c`.** `lint:crash` **0** · **1069 unit** (39 files) ·
> **483 e2e** (47 spec files) · 12-chunk build · **0 over budget**.
> `StaffApp.js` **310.73 / 360 kB** (13.7%), `index.js` **203.06 / 215 kB** (5.6%, still the
> tightest). Seven commits, each pushed after its own green run.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only, so
> `gh run list` shows nothing for this work. The local suite is the only gate and every number
> above is from it.
> ✅ **483 is a CLEAN full run — 483 passed, 0 failed, `syncBanner` included.** Two full runs were
> done. The first failed one `syncBanner.spec.js` test and the tell the prompt named held exactly:
> a `waitForAppAnyWidth` timeout whose error context contained **zero page snapshots**, meaning
> the app never mounted and nothing about the banner was exercised; the other six in that spec
> passed in the same run, and all 7 passed alone. **The second full run passed it outright.** So
> the flake is intermittent rather than one-per-run, and it is not a regression — a real one
> fails the same test twice.
> 🔴 **And the run printed `exit code 0` with a failing test**, exactly as warned. Read the
> count, never the exit code.

**Read this first: the branch was four sessions stale and the prompt's own §0 caught it.**
This session started on `main` at `30520f2`, not on session 30's `fa54c4a` — the third session
in a row to start on the wrong base. Session 30's branch was 20 commits ahead of `main` and a
clean fast-forward, and the fix was confirmed **by a gate, not by the log**: `npm test` returned
**1019 passing, 36 files**, matching the prompt's table exactly. A tree that merely builds is not
proof of where you are; a matching unit count is. **`main` is still four sessions stale and
nothing merges to it** — see standing risks.

---

### What this session was

Session 30 shipped a coach roster whose `updateCoach` accepted five keys while the app passed
exactly one. §2.1 was to finish it; **§2.2 was to build the check that would have caught it**,
and to answer the larger question: what else in this product exists in the model with no way in?

**The answer is: almost nothing.** That is the session's most useful finding and it is a negative
one. Session 30's roster was an outlier, not a pattern, so the next several sessions do **not**
need to be about unreachability.

---

### §2.1 — four fields with no control, and one of them was read (`c42b740`)

**The prompt named two. It is four.** `aliases` and `userId` were the known pair. `name` could be
set at creation and never corrected, so a typo could only be fixed by deleting the coach and
losing their availability with them. And **`active` is the one worth stopping on**: it is not
merely unwritten, it is **read** — `coachesFreeAt` (`coachRoster.js:242`) excludes
`active === false`, with a comment explaining that this is the gym saying a person no longer
coaches here. A documented behaviour, with a live reader, that the product could not reach.

**The `userId` decision went to option (a), and option (b) is the one that had to be argued
down.** Deleting an unsettable field is defensible on its face, but deleting `userId` means
deleting `coachAccountFor`, and `coachAccountFor` is what makes `class_instances.coach_id`
resolve to the coach rather than to whoever pressed publish. That was a real defect fixed in
`2bb2263` that **no test covered**; reverting it to tidy the surface would trade a working
correction for a smaller API.

So both controls exist, and **the account picker is server-only and says so**. `memberships` is
the only list of a gym's people, read live from Supabase, with no local copy — nor should there
be one, since a cached copy would offer somebody who has left. With no server the form says
*"linking a coach to their Jungle account needs the gym to be online"* rather than rendering an
empty select, which would read as *"you have no staff"* — a different and false claim. That is
how `AdminTeamScreen` already behaves under `NEEDS_SERVER`.

🔴 **The rename rule is the part that could have shipped broken.** A class carries its coach as
TEXT and `resolveCoach` matches that text against the entry's name and aliases. Renaming "Mara"
to "Mara Kelly" without keeping "Mara" would **silently unlink every class she already teaches**:
the entry still exists, the schedule still says "Mara", and the two quietly stop being the same
person. The old name is carried into the aliases unless the gym already typed it. A change that
only alters case or spacing is not a rename — `coachKey` folds those — so it adds no alias.

An account another entry already holds is **returned and disabled, not filtered out**: a manager
looking for a name that is demonstrably in their Team list needs to be told who has it.

---

### §2.2 — the check, and the one field it found (`b952f81`)

`scripts/audit-store-writers.mjs` parses `store.js` for patch-shaped writers, reads the keys each
ACCEPTS, then parses every non-test file under `src/` for the keys any call site PASSES.
`docs/STORE-WRITER-AUDIT.md` carries the full classified list.

🔴 **The tool caught its own bug on the first run, and that is the whole argument for a positive
control.** A call almost never passes a literal — `updateCoach(id, patch)` builds `patch` two
lines up from `coachEditPatch()` in another file — so the first run read "no keys passed" and
reported §2.1's **brand-new edit form** as four fields with no control. The known-good answer
failing loudly is the only reason it was not believed. Keys now resolve through a local `const`,
a `useState` initial value, and one level of "the object this function returns"; anything deeper
is reported as **opaque**, never as missing.

**The one real finding: `externalRef`.** Never written by anything, always `""`, and **read** —
`csvExport.js:224` emits it as a **"Reference"** column in the members CSV, so every gym's export
carried a blank column promising a reference to their previous system. Given its writer on the
one path where the value exists: a column in the file the old system exported. Aliases
deliberately exclude a bare **"ID"** — a spreadsheet's "ID" is as likely to be a row number, and
a row number in `external_ref` is a confident wrong answer where a blank was merely empty.
**Not** hand-editable (another system's key is not something a human should type), and **not
deleted** (that would pre-empt A16).

⚠️ **The sweep's own false positive is in the doc on purpose.** A crude field-level grep flagged
`weekKey` as unwritten; it is written at `CalendarScreen.jsx:275` in the `obj.field = value` form
the grep could not see. Caught by reading the result, not by trusting the count.

**The rule pinned is narrow on purpose.** `storeWriters.test.js` covers patch-shaped writers
only. Widening it to every field of every stored object was tried and produced noise, and a check
that has to be argued with every time it runs gets deleted. **The allowlist IS the positive
control**: the known seams must still be *found*, every writer must resolve at least one accepted
key, and at least four writers must be located — so a broken parser fails rather than going green
on a scan reading nothing. Verified end to end: run against `fa54c4a` it reports exactly
`active, aliases, name, userId`; at HEAD, none. Re-introducing session 30's defect fails the test
and **names the four fields**.

---

### §2.4 — two timezone defects, and one that was not (`fec9a75`, `63e9e43`)

`addMember` stamped `joinedAt` with `toISOString().slice(0,10)` — UTC. ⚠️ **The prompt's
illustration is off by the size of the bug**: Singapore is UTC+8, so 8am local is exactly
midnight UTC and lands on the right day. The window is **before** 8am, which is when a gym signs
people up.

**Blast radius, measured.** `joinedAt` has four readers: `retention.js:157` (rule 1's tenure
gate), both CSV exports, and RosterScreen's date input. `cohorts.js` deliberately does not read
it, and `applyAttendanceImport` writes `""` — so an importing gym is unaffected and the gyms this
reaches are the ones adding members by hand, which is the shipped path. **[unverified] in the
prompt, now settled: no test pinned the UTC behaviour** — `store.test.js:87` asserts only the
format, which is why it survived 1019 tests.

🔴 **The test had to change timezone to mean anything.** The suite runs in UTC, where the two are
identical, so the obvious test passes against the bug. Both new describes assert the offset is
`-480` **first** — a positive control on their own precondition, because otherwise every
assertion becomes trivially true.

**Found while measuring the blast radius:** `useClassRunner.js` wrote a session's `date` in UTC
and `ProfileModal.jsx:184` **displays** it, so a coach teaching at 7am in Singapore saw yesterday
against the class they had just finished. ⚠️ **The streak above it was NOT broken** — I probed it
in a non-UTC zone across three scenarios and it counted correctly, because writer and reader
shared the convention. Reporting it as broken would have been a defect manufactured by my own
fixture. Both halves moved together (changing either alone breaks the count), and `localDateStr`
moved to `format.js` rather than being copied a third time. **No migration**: a stored date string
has no time in it, so the zone it was written in cannot be recovered, and guessing would be a
confident wrong answer.

---

### §2.3 — the compare-and-set primitive, built with its status made undeniable (`18e1439`)

Verified first: **`store.js` contains zero `.update()` calls**, and the only three in the app are
unconditional. **The argument against building was taken seriously** — the repo already carries
two never-run pieces of code, and a wrong primitive is worse than an absent one. What tips it is
that the alternative is not "no primitive": it is `_bgUpsertDelta`, which is what the next person
will reach for, and which is wrong in the worst way available — two coaches both approving both
succeed, last writer wins, and one is shown an approval that did not happen, with nothing logged.

It is **not imported by anything** (confirmed absent from every built chunk), its header opens by
saying it has never made a real request, and the two PostgREST behaviours it depends on are
written down **as assumptions**. Three outcomes, not a boolean: losing a race is a normal outcome
a coach must be told about; a failed request is not. Two refusals are the point of it — an
**empty guard** (an unconditional update wearing this function's name) and **more than one
matched row** (a schema fault, not a win). Mutation-checked by dropping the guard: 6 of 13 fail.

---

### §2.5 — dated availability exceptions: NOT shipped, and the reason is structural

§2.5 says not to ship half of it. **It cannot be shipped at all yet, and the blocker is one level
down from the calendar UI.** `coachesFreeAt` takes a weekday NAME and a slot. A cover request
carries `classDay: "Thu"` and `classSlot` and **no date anywhere** — deliberately denormalised
from a weekly rule, which has no single date to carry. So "away this Thursday" has nothing to
match against: a coach could mark themselves away on a date and `coachesFreeAt`, receiving only
"Thu", could not suppress it. That is exactly the silent half-feature §2.5 warns about.

**The prerequisite is that cover requests target a dated occurrence rather than a rule.**
`occurrencesForWeek` already produces dated occurrences, so the machinery exists, but rewiring
the ask flow changes the request shape whose denormalisation has a deliberate comment explaining
itself. That is its own piece of work and should be its own item.

---

### Found by looking, and fixed (`852550c`)

**The Dashboard header said "Monday 24 Aug" and "Recent sessions", three cards below it, said
"2026-08-24".** The same day in two notations on one screen — the shape session 30 found in the
availability column — and machine notation shown to a coach besides. No test failed and none
would have: both strings were correct, and correctness was not the complaint. `fmtSessionDay`
now says "today" / "yesterday" / "Sat 22 Aug", used by the only two renderers of a stored
session date (`App.jsx:666`, `ProfileModal.jsx:184`).

🔴 **And it is parsed BY PARTS.** `new Date("2026-08-22").getDate()` is **21** in New York,
because a date-only string is UTC midnight by specification. Formatting this the obvious way
would have reintroduced §2.4's bug **in the renderer** — one layer further out and harder to
see, because the stored value would have been right. The test demonstrates the trap next to the
fix.

### Found and not fixed

- **Two checkboxes still render browser-default blue on a gym's own palette** —
  `RosterScreen.jsx:343` and `PersonasScreen.jsx:1009` lack `accentColor: "var(--accent)"`. The
  new one in `CoachCoverPanel.jsx:287` has it. Same defect class as `8c581d0` (the demo screen
  drawing its own controls on a gym's palette). Left out of this session's commits because
  widening a commit is how polish arrives untested — it wants its own change with a token test.
- **`+ Mara K. (1)` sits directly below the alias box while editing Mara**, and the obvious click
  adds her as a SECOND coach — which is the wrong action if they are the same person. Nothing
  connects the offer to the control that merges them. Noticed by rendering the panel and reading
  it; not a test failure.

### Traps paid for this session

- ⚠️ **I shipped `fec9a75` with `lint:crash` at 3 and had to fix it in the next commit.** The
  §2.4 test set `process.env.TZ` directly and `process` is not a declared global in
  `eslint.crash.config.js`. Caught by *running* the gate rather than assuming the earlier green
  still held. Now via `vi.stubEnv`, since the eslint config is infra.
- ⚠️ **`navAnyWidth` takes a screen OBJECT from `ALL_SCREENS`, not a string**, and its
  `aside` count is a **one-shot read that races a reload** — follow `page.reload()` with
  `waitForAppAnyWidth` or a 1280px test goes down the phone branch and hunts for a "More" button
  that is not there.
- ⚠️ **`localeCompare` puts "nameless@…" before "Unnamed account"** — an ICU collation, not a
  bug. My expectation was wrong, not the code.
- The Playwright scratch config had to be rewritten again (image ships Chromium r1194, the CDN is
  proxy-blocked). It lives in `.e2e-scratch/` and is **not committed**, so session 32 will need
  it once more.

---

### What is genuinely left

1. **§2.5 needs its prerequisite first** — cover requests on a dated occurrence, not a rule.
2. **The two un-skinned checkboxes**, with a token test.
3. **The alias/offer adjacency** in the roster panel.
4. **`updateMember.externalRef` stays deliberately unwritten** — recorded in
   `storeWriters.test.js`'s allowlist with its reason. Revisit only if A16 is answered yes.

### Standing risks — carried forward, with what MOVED marked

- 🔴 **`main` is four sessions stale and nothing merges to it.** Sessions 28–31 all live only on
  their own branches. **This is now the oldest unaddressed process risk in the repo** and it has
  cost four sessions the same twenty minutes. A prompt can only tell the next session to work
  around it; it cannot merge the branches. **This one is Dylan's or it is nobody's.**
- 🔴 **A15 — migration `0010_coach_cover.sql` is unapplied.** A cover request reaches one phone.
  The product says so on screen. ✅ **MOVED in part:** the compare-and-set primitive A15 needs
  now exists (`src/lib/compareAndSet.js`) and A15 carries a note for whoever wires it. **It has
  never made a real request** — that gap does not close until 0010 runs.
- 🔴 **A16 is open and is a decision, not work.** Should Jungle write back to a gym's booking
  system at all? Nothing is blocked; nothing should be built until it is answered. §2.2
  deliberately did **not** delete `externalRef` for this reason.
- 🔴 **Migrations `0005` and `0006` have never been applied.** Personas, plans and the movement
  catalogue exist on one device with no server copy. ⚠️ The coach-delete dialog *tells* the coach
  that and `e2e/destructive.spec.js` asserts the string — applying them makes a shipped sentence
  a lie, in the same session.
- 🔴 **N4 member links are built and undeployed — twelve sessions.** A12/A13, 35 minutes.
- 🔴 **Nobody's phone rings.** No push, email or SMS anywhere in the product. Cover is in-app
  only, which is no use for the case it exists for — a coach ill at 5am.
- ⚠️ **A14 is open and is a yes/no**: does Jungle bend a gym's accent to make it legible?
- ⚠️ **A1 — the Supabase region has never been confirmed.** Five-minute read-only check, and the
  only item that gets dramatically more expensive with age.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps. Ask Dylan first.
- ✅ **MOVED: `addMember`'s UTC `joinedAt`** — fixed this session, with a test that needs a
  non-UTC timezone to mean anything.
- ⚠️ **The container is ~4× slower than the one these prompts are written on.** A full e2e run is
  **33 minutes**. Budget three or four, and lean on `npm test` (4s) and single-spec runs (20–30s).
  A **foreground blocking wait** advances real time properly; a backgrounded sleep loop does not.
- ⚠️ **`.e2e-scratch/` is not committed**, so the Playwright launch workaround needs rewriting
  again next session. `playwright.config.js` is untouched, as it must be.
