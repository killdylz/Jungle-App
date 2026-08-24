# Jungle — Session Handoff

_Last updated: 2026-08-24 (session 31)_

> 📁 **Sessions 6–29 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 31 — a field nothing can write is not a feature, and the check that finds the next one

> **Gates green at `18e1439`.** `lint:crash` **0** · **1064 unit** (39 files) ·
> **483 e2e** (47 spec files) · 12-chunk build · **0 over budget**.
> `StaffApp.js` **310.73 / 360 kB** (13.7%), `index.js` **203.06 / 215 kB** (5.6%, still the
> tightest). Five commits, each pushed after its own green run.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only, so
> `gh run list` shows nothing for this work. The local suite is the only gate and every number
> above is from it.
> ⚠️ **483 is 482 + one re-run, and the flake is the SAME one session 30 documented.** The full
> run failed one `syncBanner.spec.js` test; all 7 pass when that spec runs alone, and the tell
> the prompt named held exactly — a `waitForAppAnyWidth` timeout whose error context contains
> **zero page snapshots**, meaning the app never mounted and nothing about the banner was
> exercised. The other six in that spec passed in the same run.
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

---

## Session 30 — the first feature that cannot be local-first, and the link that named the wrong person

> **Gates green at `HEAD`.** `lint:crash` **0** · **1019 unit** (36 files, was 935/33) ·
> **478 e2e** (47 spec files, was 466/46) · 12-chunk build · **0 over budget**.
> `StaffApp.js` **307.46 / 360 kB** (14.6% headroom, was 18.6%); `index.js` **unchanged** at
> 203.06 kB — nothing leaked into the entry chunk.
> ⚠️ **CI does not run on this branch** — `Deploy to GitHub Pages` triggers on `main` only.
> The local suite is the only gate and every number above is from it.
> ⚠️ **478 is 477 + one re-run.** Both full runs failed exactly one test in `syncBanner.spec.js`
> — **a different one each time**, on a `waitForApp` timeout with no page snapshot, and all seven
> passed when the spec ran alone. It is load flake on this container, not a regression; the tell
> and the rule are now in `CLAUDE.md`.

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
