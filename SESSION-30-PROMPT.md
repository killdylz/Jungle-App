# Jungle — Session 30 Build Prompt

**Run this session autonomously. Do not stop to ask.** Where a choice arises, make it, write the
reasoning in the commit message, and keep going. Where an item turns out to need Dylan, write what
he needs into `DYLAN-QUEUE.md`, say so in the handoff, and move to the next item.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the
testing traps and the domain rules. **This file does not repeat them.** It carries the state, the
evidence, and the work queue.

**Last commit `3a6e4a0`, tree clean, pushed to `claude/jungle-session-29-build-pleym6`.**

### The regression, run fresh at `3a6e4a0` — measured, not carried forward

| Gate | Result |
|---|---|
| `lint:crash` | **0** |
| unit | **935 passing**, 33 files |
| e2e | **466 passing**, 46 spec files |
| build | 12 JS chunks |
| `npm run size` | **0 over budget** |

```
index.js             203.06 / 215 KB   (5.6% headroom)   ← still the tightest
StaffApp.js          292.93 / 360 KB   (18.6%)
PersonasScreen.js     82.75 / 100 KB
BrandStudioScreen.js  30.03 /  32 KB   (6.2%)
RetentionScreen.js    17.02 /  18 KB   (5.5%)
LibraryBrowserModal.js 19.15 / 20 KB · ProfileModal.js 13.75 / 15 KB
brandGenerator.js      2.93 /   4 KB · ClassSummary.js 5.81 / 8 · summaryApi.js 0.85 / 3
member path 210.05 / 222 KB · staff path 501.67 / 575 KB
```

App.jsx is **2,373 lines**.

⚠️ **`index.js` is 93% REACT and cannot be fixed by moving app code.** Session 29 attributed every
byte via the sourcemap: react-dom alone is 172.40 kB and *all* of our own code in the entry chunk
is 11.19 kB. The full table is in `check-size.mjs`'s header. **Do not spend this session trying to
shrink it** — the only remaining levers are React itself (infra, Dylan's) or raising the ceiling.

### ⚠️ The environment

**Playwright cannot launch out of the box.** `@playwright/test` 1.61.1 wants Chromium r1228; the
image ships r1194 at `/opt/pw-browsers` and the CDN is proxy-blocked. Run the suite through a
scratch config that points `executablePath` at `/opt/pw-browsers/chromium` and leaves
`playwright.config.js` alone (it is what CI runs — do not edit it). A five-line wrapper importing
the repo config and overriding `projects[].use.launchOptions`, `testDir`, `outputDir` and
`webServer[].cwd` works.

🔴 **`npx playwright test 2>&1 | tail -30` EXITS 0 WHEN NOTHING LAUNCHED** — a pipeline's exit code
is the last command's. **Read the count, never the exit code.**

⚠️ **Do not edit source while the e2e suite is running.** Vite HMR fires, `main.jsx` re-executes,
and specs fail on `createRoot() on a container that has already been passed to createRoot()`. It
reads like a real defect and is not. Session 29 lost a 7-minute run to exactly this.

⚠️ **Check what your branch is based on before trusting these numbers.** Session 29 started five
commits behind because session 28's work was on `claude/gracious-hopper-quifam`, not `main`, and
the branch pointed at `main`. `git log --oneline -3` should show `3a6e4a0` at the top.

### The autonomy contract

- **Never block on Dylan.** Write what he needs into `DYLAN-QUEUE.md` and move on.
- **Never ask which option to take.** Decide, and put the reasoning in the commit message.
- **Commit and push after each item lands green.** Do not batch a session into one commit.
- ⚠️ **CI does not run on this branch.** `Deploy to GitHub Pages` triggers on `main` only, so there
  is no run to judge and `gh run list` will show nothing. **The local suite is the only gate.** Do
  not report CI as green; report the suite.
- If a gate is red and the cause is not yours, **re-run once** before investigating.

### 🔴 The rule that keeps earning its place

**Verify every item below against the code before building it.** Session 26 found four false
premises in its own prompt, 27 found six of eight, 28 found two, 29 found three — including one
where the codebase had been asserting the opposite of the truth in a comment for a whole session.

Where a number below is marked **[measured]** it was verified against the code while this file was
written. **[unverified]** is a lead, not a finding — and this prompt has more unverified claims in
it than any before it, because this feature reaches outside the repo for the first time.

---

## 🟥 1. What this session is, and the two things that make it different

**The ask:** coaches enter their availability across days and slots; when someone needs a sub, the
available coaches are surfaced, a request is sent, and the recipient approves or rejects. On
approval the change is pushed to Mindbody, which propagates to ClassPass.

Two things make this unlike any previous session, and both need to be understood before any code
is written.

### 1.1 🔴 This is the first feature that CANNOT be local-first, and that is bigger than the feature

Every screen in this product is local-first: `localStorage` is the source of truth and Supabase
syncs behind it. That works because **every existing feature is one gym, one device, one person at
a time.** A coach builds a class; the same coach runs it.

**A sub request is two people on two devices.** Coach A requests, coach B approves, and neither
device can see the other's `localStorage`. There is no local-first version of this. It is the first
feature whose correctness *depends on the server actually working*.

🔴 **And the server has never been proven.** [measured] `supabase/migrations/` contains nine
migrations; `CLAUDE.md` records that **`0005_coach_personas.sql` and `0006_persona_generations.sql`
have never been applied**, and the N4 member-link Edge Functions have never handled a request in
nine sessions. So the sync path this feature stands on is code that has been written and never run
in anger.

**This is the real content of the session and it should be treated as such.** Build the feature, but
do not let "does the round trip actually work between two clients" be an assumption. §2.5 exists
for that and it is not optional.

### 1.2 ⚠️ There is a recorded strategic decision that points the other way, and it deserves a hearing

[measured] `docs/Jungle - Strategy & Direction (Decision Doc).md` line 105:

> **Hold the "no CRM" line for the first 1–2 years.** The moment we bolt on scheduling/payments
> early, we become a worse Mindbody and lose the wedge.

And line 56 files Mindbody under **"Integrate, don't fight"**, while the architecture spec's M2 is
titled *"own the data spine; never rent it from Mindbody."*

**I do not think this item violates that line, and here is the argument, so the next session can
disagree with it on the record rather than by accident.** The line is about **member-facing booking
and payments** — the transaction Jungle deliberately does not own. Coach availability and finding a
sub is **staff-side operations**: it is a coach's problem, on the daily-frequency side the strategy
doc says Jungle should own, and `GTM-SINGAPORE` §2 already calls coaches "the adoption engine."
Nothing here books a member or takes a payment.

🔴 **The Mindbody WRITE-BACK is the part that genuinely crosses the line**, and it is also the part
that is blocked on credentials anyway. §2.4 keeps it behind a seam for that reason — the argument
and the practical constraint happen to agree, which is convenient but is not why the seam is there.

**If, on reading the strategy docs, you conclude this is off-wedge — say so in the handoff and
build §2.1–§2.3 anyway.** They are useful whatever the answer, and a written disagreement is worth
more than a silent one.

---

## 🟥 2. The work queue, in order

### 2.1 🔴 A coach is a STRING on a class, and a sub request has to reach a PERSON

**[measured] This is the foundation and nothing else in the queue works without it.**

`class_schedule_rules.coach` is `text` (`0003_phase1_domain_tables.sql`), and `CalendarScreen`'s
add/edit dialog renders it as a **free-text `<input>` with placeholder "Coach"**. So the coach on a
class is a typed name — "Mara", "mara", "Mara K." are three coaches — and there is nothing to send
a notification to.

**The good news, and verify it before relying on it:** [measured] the pieces are already there.
`membership_role` is a Postgres enum `('admin','coach','manager','frontdesk','member')`
(`0001_auth_foundation.sql`), `memberships` links a profile to a gym with a role, and `makeCan` in
`src/supabase.js` already grants `schedule:*` to `coach`, `manager` and `frontdesk`. **Coaches can
already be real users with accounts and the right capability.** Nobody has connected that to a
class.

🔴 **"Coaches" IN THE NAV IS NOT THE STAFF ROSTER.** [measured] `ALL_SCREENS`' `personas` entry is
labelled "Coaches" in the sidebar and the mobile sheet, and it opens `PersonasScreen` — which is
about a coach's **programming persona** (their style, their movement catalogue), not their
employment. `0005_coach_personas.sql`'s own comment gives example names: *"Coach Mike", "The Garage
— S360", "House Strength"* — a persona is not a person and one of those examples is a gym.

**This product therefore already has two different things called "Coaches" and you are about to add
a third.** `CLAUDE.md` records the three-nav-vocabularies trap for exactly this reason. Decide the
naming deliberately, write it down, and use `ALL_SCREENS` — do not invent a fourth list.

**The build:** a real link from a class to a membership. Keep the free-text field working — a gym
that has typed names for a year must not lose them — and let a rule additionally carry a
`coach_id`. An unlinked name is a normal state, not an error, and the UI has to say which coaches
are linked without nagging about the ones that are not.

⚠️ **A migration is Dylan's.** `CLAUDE.md`: *no infra changes without asking Dylan*, and two
migrations are already unapplied. **Do not add `0010_*.sql` and assume it runs.** Either carry the
link in an existing blob column that already round-trips, or write the migration AND put it in
`DYLAN-QUEUE.md` as a blocked item with the exact SQL — and make the feature degrade honestly
without it.

**Done when:** a class can name a coach who is a real member of the gym; typed names still work and
are not silently rewritten; `dbConstraints.test.js`'s discipline is extended to any new constrained
value; and the screen states which is which.

---

### 2.2 Availability: which coaches can work which days and slots

**Verify the surface before designing it.** [measured] `CalendarScreen.jsx` is the Schedule screen
(`ALL_SCREENS` key `calendar`, sidebar "Schedule"). `class_schedule_rules` stores recurring RULES
(`day` "Mon".."Sun", `slot` "06:00", `repeat` daily/weekly/once) and `lib/scheduleInstances.js`
generates dated occurrences from them. **Availability should use the same day/slot vocabulary as
the classes it has to match against**, or every comparison becomes a parsing exercise.

**The shape to decide, and none is obviously right:**

- **A weekly recurring grid** — "I am free Mon/Wed/Fri mornings" — matches how the schedule already
  thinks and is cheap to enter. It cannot express "not this Thursday, I am away."
- **Dated exceptions on top of a grid** — the standard answer, and the one that grows a calendar UI
  and a whole class of timezone and DST questions.
- **Dates only, no recurrence** — honest and unusable: nobody re-enters their week every week.

**My recommendation is the grid first, with a dated exception list as the smallest possible second
layer** — but decide it yourself against the code, and put the reasoning in the commit.

⚠️ **`daysBetween` counts LOCAL CALENDAR DAYS, not 24-hour periods** (`CLAUDE.md`), and a fixed
clock in a test freezes `Date.now()` so ids derived from it collide. Both bite here.

⚠️ **Availability is a claim about a person, and a stale one is worse than none.** A coach who set
their availability in March and left in June must not surface as available in July. Decide what
makes an availability record stale and say so on the screen.

**Done when:** a coach can state availability in the vocabulary the schedule already uses; it
persists and survives a reload; it is visible to whoever is looking for a sub; and a gym that has
entered nothing sees an honest empty state rather than an empty grid implying everyone is free.

---

### 2.3 The sub request: ask, notify, approve or reject

**The loop the feature exists for.** A class needs cover; the coaches whose availability matches
that day and slot are offered; a request goes to one (or several); they approve or reject; the
class's coach changes on approval.

🔴 **"They will get notified" is the hard part and the product has NOTHING to notify with.**
[measured] there is no push, no email, no web-push, no service worker messaging, no third-party
sender anywhere in `src/` or `supabase/` — grep for `notification|web-push|onesignal|sendgrid|
resend|twilio` returns nothing but the toast component. The service worker exists for offline
precaching only.

**So decide what "notified" means, and be honest in the UI about it:**

- **In-app only** — a pending-requests surface the coach sees when they next open Jungle. Buildable
  today, entirely. ⚠️ **And useless for the urgent case**, which is the case this feature is for: a
  coach is ill at 5am and needs cover for a 6am class. Say that out loud in the product rather than
  implying a request has been *delivered*.
- **Email or push** — needs infra, a sender, a domain and a Dylan decision. **`DYLAN-QUEUE.md`, not
  this session.** Write down exactly what you would need.

**Build the in-app loop, and make the copy tell the truth about latency.** A request that says
"Sent" when it is sitting in a database waiting for someone to open an app is the same class of
defect as the AA panel that said "passes" — a confident claim the system cannot back.

⚠️ **Destructive-or-outward-facing actions are CONFIRMED or UNDOABLE** (`CLAUDE.md`), and the guard
scales with what is destroyed. Approving a sub reassigns someone's class. Rejecting one may leave a
class uncovered. Decide the guard for each and do not treat them as symmetrical.

⚠️ **A request has a race and you must decide it, not discover it.** Two coaches accept the same
request; or the requester cancels while the recipient is approving; or the class is deleted
underneath both. `store.js`'s `PENDING_DEL_KEY` and `_clearSyncError` exist because this repo has
already lost that argument once with deletes.

**Done when:** a request can be raised against a real class, reaches a real person, can be approved
AND rejected, both paths are driven in the e2e (⚠️ **Playwright AUTO-DISMISSES dialogs** — a test
that clicks and asserts is exercising *cancel*), the class's coach actually changes on approval and
does not on rejection, and the state survives a reload on both devices.

---

### 2.4 The Mindbody write-back, and the seam it lives behind

**[unverified — every claim in this section needs checking at the point of commitment.]**

The ask is: on approval, update Mindbody, which propagates to ClassPass.

**What the repo already believes about this, which is not nothing:**

- [measured] `docs/…Stress-Test Verdict & Architecture Spec (Fable).md` risk **A6**: *"Incumbent
  booking APIs accessible on acceptable terms"* — likelihood **Med-High**, and the body says
  **"Mindbody's API is a paid, gated partner program"** and recommends *"Mindbody's program when
  revenue justifies its cost."*
- [measured] The same doc's §347 explicitly lists *"Mindbody/Glofox/PushPress partner-program
  costs"* among facts **to re-verify at the point of commitment**.
- [measured] There is **no Mindbody or ClassPass code anywhere in this repo** — no client, no
  endpoint, no credential, no adapter. Every mention is prose: the strategy docs, and one comment
  worth reading before you design the seam. `src/lib/classTypeRetention.js`'s header argues that
  **no booking system can ship Jungle's retention feature**, because *"none of them holds WHAT WAS
  IN THE CLASS — nobody programs a class in a booking system."* That is the asymmetry the product
  is built on, and it cuts both ways here: **Mindbody holds the roster and the bookings, and Jungle
  does not.** A sub-approval that changes the coach in Jungle and not in Mindbody leaves the two
  disagreeing about who is teaching, and Mindbody is the one the member booked through.

**[unverified] The ClassPass half of the ask is an assumption worth testing separately.** "Update
Mindbody and it pushes to ClassPass" is plausible — ClassPass does integrate with Mindbody — but
whether an **instructor substitution** propagates, how fast, and whether ClassPass surfaces it to
members who already booked, are three different questions and none is answered in this repo. **Do
not write code that asserts any of them.** A studio that tells its members "your coach changed" on
Jungle's authority and is wrong has a worse problem than one that never claimed it.

**So this session does not integrate. It builds the SEAM:**

- A single adapter module with a named, documented contract — "here is what a sub-approval needs to
  say to a booking system" — and **one implementation that is a no-op**, plus a fake for tests.
- The feature works completely with the adapter off. **Off is the default and the honest state**:
  the product says the change is recorded in Jungle and NOT pushed anywhere, because that is true.
- 🔴 **No credentials, no network calls, no `fetch` to a Mindbody host, and no "coming soon" panel
  promising a feature that cannot arrive** — `CLAUDE.md`: *a panel promising a feature that cannot
  arrive is worse than no panel.*
- `DYLAN-QUEUE.md` gets a new item with what is actually needed: partner-program status and cost,
  which API (Public API vs Platform), what a staff-substitution call looks like, whether ClassPass
  propagation covers it, and what a sandbox costs.

⚠️ **`FLAGS` is a HOLDING PEN, not a filing cabinet** (`flags.js`), and session 29 deleted 284
lines that had sat behind a false flag for two sessions past its purpose. If you gate this, write
down the condition under which the gate is removed.

**Done when:** the approval path calls one adapter with a typed payload; the no-op implementation is
the default; a contract test pins the payload shape; the UI states plainly that nothing was pushed
to a booking system; and `DYLAN-QUEUE.md` carries the questions.

---

### 2.5 🔴 Prove the round trip between two clients, or the feature is theatre

**This is not a test task appended to the build. It is the item most likely to change what gets
built, and §1.1 is why.**

Everything above assumes coach A's request reaches coach B. **Nothing in this repo has ever proven
that two clients converge**, because until now no feature needed it: `localStorage` is the source of
truth and Supabase syncs behind it.

**What to actually establish, in order:**

1. **Does the local build even reach a server?** [measured] `playwright.config.js` targets the
   **credential-less** build deliberately — *"no network, no auth, a fixed PIN, and sync paths that
   no-op cleanly."* **So the entire existing e2e suite runs against a build where sync does
   nothing.** A sub-request test in that harness proves the UI, not the delivery.
2. **What happens with no server at all** — which is the shipped state today, since 0005/0006 have
   never been applied. A coach raises a request and nobody ever sees it. **That is the default
   behaviour and the product must say so** rather than showing a hopeful "Sent".
3. **What happens when two devices disagree.** `store.js`'s `_blobStale` re-pushes local over
   server for brand data. Applied to a sub request, last-writer-wins means an approval can be
   silently reverted by the other device's stale copy. **Read `_blobStale`, `restorePersonaCascade`
   and `_clearLedgerIfSettled` before designing this** — `CLAUDE.md` says twice not to "simplify"
   them and both have unit tests explaining why.

**A finding that the round trip cannot be proven in this environment is a real result** — say so
precisely, and say what would prove it.

---

## 3. Do NOT

- **Do not apply migrations, merge Dependabot PRs, or change infra.** All three are Dylan's.
  **Do not edit `playwright.config.js`** — use a scratch config (§0).
- **Do not build member-facing booking, payments, or a self-serve tier.** That is the "no CRM" line
  in §1.2 and it is the one part of the ask that clearly sits the wrong side of it.
- **Do not call a real Mindbody or ClassPass endpoint**, or add credentials, or commit a key.
- **Do not spend the session on `index.js`.** It is 93% React and session 29 measured every byte;
  the finding is in `check-size.mjs`'s header. Re-deriving it is a day for nothing.
- **Do not re-raise** the §2.4 UI-discipline items from session 28 (the 4px-grid premise is false,
  the type-scale collapse is one deliberate idiom used 97 times), the Node 20 deprecation, per-coach
  retention (`DYLAN-QUEUE.md`, awaiting Dylan), or the crash gate's JSX blind spot.
- **Do not "simplify"** `_clearLedgerIfSettled`, `restorePersonaCascade`, the conditional in
  `deletePersonaMovement`, or `_clearSyncError`'s refusal-while-tombstones-exist.
- ⚠️ **Do not push chrome through `tvFont`.** It is a display-scale function and makes an 11px
  label 7px on a 720p wall.
- **Do not add a screen without a budget line in `check-size.mjs`.** An unlisted chunk has no
  ceiling at all — session 29 shipped one by accident and caught it in the same commit.

---

## 4. Standing risks — carry these into the handoff unchanged until they move

- 🔴 **Migrations `0005` and `0006` have never been applied.** Personas, plans and the movement
  catalogue exist on **one device with no server copy**. ⚠️ The coach-delete dialog *tells the coach
  that*, and `e2e/destructive.spec.js` asserts the string — so applying them makes a shipped
  sentence a lie. **This is now also load-bearing for §2.5.**
- 🔴 **N4 member links are built and undeployed — ten sessions.** Two Edge Functions that have never
  handled a request. `DYLAN-QUEUE.md` A12/A13, 35 minutes of Dylan's time.
- 🔴 **A14 is open and is a yes/no**, not work: does Jungle bend a gym's accent to make it legible?
  Session 29 measured generated accents at 1.25:1 on their own background and chose to report
  rather than repair. Nothing is blocked on it.
- ⚠️ **A1 — the Supabase region has never been confirmed.** Five-minute read-only check, and the
  only item that gets dramatically more expensive with age.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps.
- ⚠️ **A second Claude session may share this working tree.** `git status` before every commit,
  stage only your own paths, and `grep -rn MUTATION src/` before trusting any green gate.

---

## 5. When to stop

1. Work the queue in order. Verify, build, test, **prove the test can fail**, run the gates, commit
   with the reasoning, push.
2. **Then drive the surface you touched and LOOK at it**, at 1280px and 390px, on a fresh load.
   Session 28 found the largest defect in the product this way, on an item its own prompt called a
   measurement task; session 29 found three more the same way.
3. Keep going until the tokens run out.

🔴 **§2.1 and §2.5 are the two that must land.** A coach who is a real person, and an honest answer
about whether two devices can agree. §2.2 and §2.3 are the visible feature and they are worth
nothing on top of a string. §2.4 is a seam and a queue entry, not an integration.

🔴 **If the honest conclusion is that this feature cannot work until the server is proven, stop and
say that.** It is a better result than a request flow that looks complete and delivers nothing —
and it is exactly the failure mode this product has already shipped once, when the generator
ignored its input for four sessions while every test passed.

**Finish with a `SESSION-HANDOFF.md` block** in the established shape: what shipped, what was found
to be false, the traps paid for, and what is genuinely left. Lead with the reasoning, not the diff.
⚠️ The live file keeps the **two most recent** blocks — move session 28's to
`docs/history/HANDOFF-ARCHIVE.md`, **newest-first**, which is not where a naive append puts it.
