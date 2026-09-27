# Jungle — Session Handoff

_Last updated: 2026-09-08 (session 40)_

> 📁 **Sessions 6–38 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 40 — the instrument was lying, and four things the product said that were not true

> Written in full to `SESSION-40-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-08. Branch `claude/jungle-session-40-q4batq`, based on
`claude/session-39-prompt-vl5r13` — PRs **#15, #16, #17 and #18 were all still open**, `main`
was still `7508de1`, and there were **zero comments on all four**. That is §0.1's second row.
Eight commits ahead of it._

Position confirmed by gate, not by log: `npm test` reported **1310 unit (46 files)** and
`npx playwright test --list` **615 in 53 files** at the branch point, exactly as the brief said.

> **Gates.** `lint:crash` **0** · **1321 unit** (47 files) · **620 e2e in 53 spec files** ·
> 14-chunk build · **0 over budget** (StaffApp **334.25 / 360 kB**, index **203.06 / 215**,
> LibraryBrowserModal **20.11 / 21** — raised this session, see §1.4 — RetentionScreen
> **17.23 / 18**, PTScreens **39.31 / 41**). App.jsx **2,708 lines**.
>
> Full suite on the finished tree: **620 passed (15.1m)**, against 21.1m at the branch point.
>
> 🔴 **The branch-point suite was NOT green.** `npm run test:e2e` on the untouched tree
> reported **614 passed / 1 failed** — see §2. Session 39 reported the same suite green, and
> it is green there; the failure is environmental and the fix is §1.1.

**§3 landed in full, all five. §4 then found three things, and the first of them is that the
sweep session 39 shipped had been reporting a clean run over controls it never pressed.**

---

## 1 · What shipped, per commit

### 1.1 `9ed9735` — the destructive sweep pressed 68, then 50, then 51 controls on the same tree

§3.2 asked for the sweep to be made cheaper. Measuring it first found something worse than its
cost, and the two turn out to be the same defect.

`destructiveSweep.spec.js` fell back to `{ force: true }` whenever Playwright's actionability
check failed, reasoning — in its own comment — that the obstruction would be a live toast and
that a forced click "costs nothing and is recorded". Both halves are wrong. A forced click is
delivered to the coordinates regardless of what is painted there. Reading `elementFromPoint` at
the moment each click failed says what was actually covering the control:

```
Back              ← the Profile modal     ("Profile  Gym Branding  YOUR STATS")
Smart Distribute  ← the class-style panel  ("WOD (Workout of the Day) AMRAP EMOM")
Settings          ← the Exercise Library   ("Thruster")
```

All three are panels an EARLIER press left open. So the click landed on the overlay, the press
did nothing, and it was recorded as a press that found no loss. **`Smart Distribute` — one of
the four unguarded doors session 38 found by hand — reported `lost=0 wrote=false` and was
classified harmless.**

It compounds: the modal is still open afterwards, so the descent walks into it and attributes
it to the wrong parent. The Library's 23 controls were swept as children of "Smart Distribute",
which burned the descent signature "Browse Library" would have claimed, so the Library panel was
never walked from that screen at all.

Run the Class Builder screen three times on an untouched tree and it presses **68, then 50, then
51**. Nothing in the report says so, because the presses it loses are recorded as pressed.

**This is session 39's own retraction — "the sweep silently stopped sweeping" — one layer out, in
the file that retraction was written about.**

**Verified the way §3.2 asked.** With the guard taken off one door
(`handleImportTemplate`, the Builder's "Jungle presets…" picker), the sweep goes red and names
it:

```
🔴 Start from a ready-made Jungle class — destroyed with no confirm and no undo:
     Start from a ready-made Jungle class: jungle_draft_class: Warm-Up is gone
```

⚠️ **The first attempt at that check proved nothing, and why is worth keeping.** I took the guard
off `handleSelectTemplate` — named in session 39's table as one of the four doors — and the sweep
stayed green. It is not that the sweep missed it: `handleSelectTemplate` has **no reachable
caller**. The Builder's presets picker calls `onImportClass`, and the Templates nav destination
that used to call it is `MOCK_VIEW_FLAG.templates === false`. Session 39's table lists it as a
door; it is a door into a room nobody can enter. See §5.7.

An obstruction is no longer forced past: `press` reports it, the caller reinstalls the gym (a
reload takes every modal, panel and toast with it) and presses again by name. Still covered after
that → `skipped`, in the report. `force` survives only where it is honest — the target IS the
element at its own centre.

Also: **`reopen()` popped `r.pressed` unconditionally**, so it was already taking real presses
off the ledger whenever `press` returned early. And a surviving toast is now dirt (2.5s plain,
9s with an undo), so the next press cannot be covered by it.

### 1.2 `aaaee9f` — a sweep that can hang forever reports a timeout, not a finding

Removing the forced clicks exposed two more things in the same file.

**`page.evaluate` has no timeout, and this file had six of them.** Pressing the Profile modal's
"Sign Out" leaves the page unable to run any `page.evaluate` — no dialog, no page error, a
screenshot that looks perfectly normal, and every read after it never returns. The sweep then
sits in one evaluate until Playwright kills the test at 240s, reporting a timeout that names
`installGym`'s `localStorage.clear()`, a line with nothing to do with it. Every read is bounded
now; `restore` throws a sentence naming what happened.

**And `POST_PRESS` could never settle.** 9ed9735 folded five round trips into one evaluate
returning a Promise, with the work inside a `setTimeout` callback and no `reject`. A throw in
there escapes to the page's error handler and the promise is never settled. My own defect,
introduced and removed in consecutive commits.

`waitUntil: "commit"` on the restore reload is reverted — it made the wedge above arrive one
control earlier.

**Cost: `12 passed (4.8m)`, against ~13.5m and one 240s timeout.**

### 1.3 `c55eef3` — "Could not read that file" was shown for a file it had just read

§3.4, and it is reachable rather than mutation-only, which is where the brief and session 39 were
both one step short. `{"name":"Tuesday","stages":[null]}` is valid JSON and clears
`handleImportTemplate`'s own guard, because `stages` IS an array; the map on the next line reads
`s.exercises` off the null and throws. One `try` wrapped both halves, so the coach was told their
file was unreadable and asked to choose a Jungle class file — which is what they just did.

Two failures, two sentences. The second offers no advice on purpose: "choose a different file" is
exactly what was wrong with the first, and "this is a fault in Jungle" is a claim the catch cannot
make, since a genuinely damaged file reaches it too.

### 1.4 `956f292` — the Builder printed its own class type over somebody else's class

§3.3. `schedKey = scheduledType && LIB[scheduledType] ? scheduledType : ""`, so the notice
appeared only for a type the catalogue still had. Reset the library — which drops every
gym-authored type while the rules keep pointing at them — start that class, and the Builder showed
CrossFit while the schedule said Barre, with nothing on screen saying so.

The comment that produced it is an argument about the BUTTON applied to the whole notice. The
sentence now ships without the button.

⚠️ **A passing test pinned it.** `schedule.spec.js` asserted "says nothing when the scheduled type
is one the catalogue never had". Its reason was the same conflation, so the assertion is changed
and the old sentence is quoted at the test with why only half of it survived.

### 1.5 `ec9b055` — "Reset to Defaults" now says which class types it deletes

§3.1. `DeleteCoachConfirm`'s rule, applied: the inventory IS the guard. `resetCascade` in
`libraryStore.js` counts the gym-authored types and the rules and instances that name one — through
`resolveClassType`, because a pre-session-21 rule stores the LABEL and a key comparison
under-reports.

**LibraryBrowserModal 20 → 21 kB (prod 21 → 22), measured 20.11.** It does not drag `store.js`
into the lazy chunk — store is already eager, so rollup hoists it; StaffApp moved 333.81 → 334.19.

### 1.6 `ab3dec1` — the 44px rule had never once been asked of a select

§3.5. The Health Screen's client picker measures **37px** at 390px. `tapScan` is opt-in and no
`<select>` in the product carried `data-tap`.

🔴 **And `data-tap` alone would have made it worse.** The 44px hit area is a `::after`
pseudo-element, and `<select>` is a replaced element for which Chrome generates none. Probed: the
same rule computes to a used height of `44px` on a `<button>` and stays the unresolved string
`max(100%, 44px)` on a `<select>`. Marking it and leaving the box at 37px gives a control that
now fails the sweep and is no easier to hit.

The shared `Select` primitive carries `minHeight: 44px`. Why four sessions of green sweeps missed
it: `mobile.spec.js` runs against `freshApp`, and the Health Screen with no 1:1 clients renders no
picker at all.

### 1.7 `93d9561` — six mount writes in the one screen no sweep can reach

§4. `MusicHubScreen.jsx` holds six copies of the exact shape `useAfterMount` exists to prevent,
and every one of those writers pushes to `user_prefs`. On a fresh device, opening the screen would
push defaults over the coach's real settings, racing the hydrate.

⚠️ **It ships nothing today** — `FLAGS.music` is `false` and both mount points are gated. A
landmine, not a defect. Which is why no sweep found it: `mountWrites.spec.js` drives the app, and
a flagged-off screen is unreachable **by construction**.

`src/ui/mountWrite.test.js` reads the source instead, and **derives** the dangerous writer set from
`store.js` (an exported `save*` reaching `_bgUpsert`/`_bgDelete`/`supabase`) rather than carrying
an allowlist that rots. `saveDraftClass` is local-only, so App.jsx's raw effect is correctly not
reported.

### 1.8 `aa68352` — "STILL OVER HALF" on a gym where half had stopped after one month

§4. `halfLifeMonths = curve.find(p => p.pct < 50)`. Two ways wrong, both flattering, on what the
code itself calls "the one number an owner will quote":

1. **`<` where the definition is `<=`.** A half-life is when half are GONE. Driven: twelve
   members, six stopping after month one, gives **6/12 = 50.0000%** at every observed month — and
   the screen said *"More than half were still training at 8 months"*, `8m+`, **STILL OVER HALF**.
2. **It compares a ROUNDED value.** A panel of 101 with 50 still training is 49.5% — fewer than
   half — and rounds to 50, which is not below 50.

Now `curve.find(p => p.retained / p.of <= 0.5)`. **The screen's copy did not change and did not
need to**: with this comparison `null` genuinely means more than half were still training, so the
sentence is true whenever it appears. The sentence was never the defect; the test behind it was.

---

## 2 · What is still red, and why

**Nothing, on the tree as it stands.** But the branch point was not green and that has to be
said plainly:

```
npm run test:e2e on 8e50d0b, untouched:   614 passed / 1 failed
  destructiveSweep.spec.js › Class Builder — Test timeout of 240000ms exceeded
```

Not a flake. The sweep's whole-file cost on this machine was **~13.5 minutes**, not the ~4m40s its
header claimed, and Class Builder and Schedule were both at or over their own 240s budget. The
header's number was measured on a faster machine. §1.1 and §1.2 bring the file to **4.8m** and all
twelve screens pass.

⚠️ **A full run here is ~21 minutes at the branch point**, not the ~14 the brief says.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved. `DYLAN-QUEUE.md`, all four PR conversations (**zero comments on #15, #16, #17
or #18**) and `git log` were all checked before any work started.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.**

**Three decisions are in writing and waiting, and none has been answered:**

- `docs/PT-RECONCILIATION.md` §6 — second lens, or a PT product?
- `DYLAN-QUEUE.md` A20 — arbitrary class times: yes/no, and grid or list.
- `SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw? **Now three sessions old.**

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 The sweep reported a clean run over controls it never pressed · FIXED (§1.1)

Above. The cost to a gym is indirect and large: this is the instrument the repo now relies on to
find unguarded destructive controls, and it was silently skipping up to a third of them — including
`Smart Distribute`, which really does destroy a coach's exercises.

**Evidence:** three runs of one screen on an untouched tree pressing 68 / 50 / 51;
`elementFromPoint` at each failed click naming the panel that covered it.

### 4.2 🔴 "STILL OVER HALF" over a gym that had lost half its members · FIXED (§1.8)

**What it costs a gym.** An owner reads the retention headline and concludes the opposite of the
truth. This repo's own rule is that a confident wrong number is worse than no number, and this one
is wrong in the flattering direction on the number the code itself says an owner will quote.

**Evidence:** seeded a year of history, opened Analytics and read it — the half-life card said
"More than half were still training at 8 months" over a chart whose every bar from month 1 read
**50%**. Then reproduced exactly: 6/12 = 50.0000%.

### 4.3 🟡 Six mount writes behind a false flag · FIXED (§1.7)

Costs nothing today and costs a gym its DJ settings the day music is turned on. The value is the
generalisation: **a sweep whose fixture cannot EXIST.** `MOCK_VIEW_FLAG` has three more `false`
entries (`integrations`, `templates`, `glossary`) and nothing behind any of them has been read by
any sweep in this repo.

### 4.4 🟢 The near-misses — chased and not reported

- **A member or 1:1 client deleted with history.** There is deliberately no `deleteMember` and no
  `deletePtClient`, and `store.js` says so at both sites. Closed by design.
- **The coach "Still coaches here" checkbox** — a soft delete the destructive sweep structurally
  cannot see (a scalar change is a write, not a loss). It is honest: the consequence is stated
  in-line, right under the checkbox.
- **`ProfileModal.jsx:186`'s `?.label || key` over stage types** — left alone, correctly: those
  keys are ours and a missing one is our bug to see.
- **"0 CLASSES RUN" beside "382 CHECK-INS"** on the Members header looked like a contradiction. It
  is my fixture: `applyAttendanceImport` creates a class instance for every imported class, so a
  real gym that imports history has instances. Do not report a defect your own fixture made.
- **"41 MEMBERS" (tile) vs "Roster · 37 (4 not active)"** two lines below. Both true, and the
  second discloses the difference. Not the "562 members" shape.
- **The at-risk panel's answer** reads correctly with real data: 6 members × S$159 = S$954/month,
  and the per-member lines agree.
- **`node scripts/audit-store-writers.mjs`** — 0 unexplained, three permanent seams green.

### 4.5 ⚠️ The e2e flakes — what I actually saw

Not the classic flake. What I saw instead, and both are worse because they look like flakes:

1. **A 240s timeout on an untouched tree** (§2), which is a cost problem, not a flake.
2. **A non-deterministic press count** in the sweep — 68 / 50 / 51 across three identical runs.
   Nothing failed; the sweep just did less, silently.

**I spent two rounds diagnosing my own changes for a coverage regression that was the sweep's
pre-existing variance.** If something looks like a flake in this file, check whether it is
deterministic first — run it twice and diff the report, not the pass/fail.

No `syncBanner`/`responsive`-shaped mount flake appeared in any run.

---

## 5 · Proposals

### 5.1 🔴 Carried forward, unanswered: how big should the room boards draw? · ~1 day

Session 38 §5.1, session 39 §5.1, **still waiting and now three sessions old**. Requirement:
primary 8–12% of screen height, secondary ~3%. What ships is 1.0–2.5% on the Plan board. A global
floor is not shippable — the Coach board's stage strip truncates — so the work is per-board.
**The decision needed: should the pre-class Plan board fill the wall the way the timer boards do?**

### 5.2 🟡 Carried forward: raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2h after 5.1

Session 38 §5.2, unchanged.

### 5.3 🟡 Carried forward: `parseCsv` and semicolons · half a day

Session 37's, still open. Worth doing if a pilot gym's export is `;`-separated; not speculatively.

### 5.4 🔴 NEW — the sweep cannot descend into a `React.lazy` panel, and a control wedges the page

The most important thing I could not finish. Two halves:

**(a) The descent is blind to lazy panels.** `ProfileModal` and `LibraryBrowserModal` are
`React.lazy`, so the press that opens one starts a dynamic import and the panel renders long after
`SETTLE_MS`. The old code reached the Profile modal only **by accident** — that press failed its
actionability check, waited 1500ms and was forced, so the revealed set was read nearly two seconds
late. Take the accident away and the Dashboard goes from 1 descent to 0.

I wrote the second look (wait for the control count to move, capped) and **measured it recovering
the descent on eight screens**. It is not in the branch, because:

**(b) It then reaches "Sign Out", and pressing it wedges the page.** After that press, no
`page.evaluate` ever returns — no dialog, no page error, a normal-looking screenshot. I could not
find the cause. `logout` is the Spotify stub, `auth?.signOut?.()` is a no-op with no Supabase, and
there is no `beforeunload` in the tree.

**Cost: ~half a day, and it needs (b) understood first.** The reasoning and the measurements are
in the file where the next person will find them. Until then the sweep has a known hole rather
than an accidental one, and `ProfileModal` is walked from nowhere.

### 5.5 🟡 NEW — the `Input` primitive is 35px, and 18 raw `<select>`s are unmeasured · ~2h

§1.6 fixed the shared `Select`. The shared `Input` renders **35px** at 390px — the same padding
and font size, but an `<input>`'s line box is 2px shorter than a `<select>`'s — with the same
absent `data-tap`. Outside the primitive there are **18 raw `<select>` elements**: App.jsx (5),
CalendarScreen (3), CoachCoverPanel (3), AdminTeamScreen (2), LibraryBrowserModal (2), and one
each in RosterScreen, BrandStudioScreen and PlaylistImportModal. None has ever been measured, for
the same opt-in reason.

⚠️ **Both numbers are measured, and the first draft of this section had both wrong** — "the same
37px", read off the shared padding rather than the rendered box, and "21", from a grep that
counted the word `<select>` inside comments. Corrected in a follow-up commit rather than left,
because a handoff number is a claim.

The work is mechanical; the judgement is whether text fields belong in the 44px rule at all,
which is worth one line of a decision.

### 5.6 🟢 Carried forward from session 39: the Builder/check-in items not taken

- **§5.8, "A typical class here is 2 members" from one class.** Unchanged and deliberately not
  taken again: it needs a minimum-sessions floor and **choosing that number is the work**.
- Session 39 §5.3 (`parseCsv`) is 5.3 above.

### 5.7 🟢 NEW — what is behind a false flag, including one of session 39's "four doors"

`MOCK_VIEW_FLAG` maps `integrations`, `templates` and `glossary` to `false`. §1.7 found six real
defects in the one flagged-off screen anybody looked at, and §1.1's verification turned up
another: **`handleSelectTemplate` has no reachable caller.** Session 39's table names it as one
of the four whole-class replacements it guarded; the Builder's presets picker calls
`onImportClass` instead, and the Templates screen that used to reach it is flagged off. The guard
on it is correct and costs nothing — but a reader counting doors from that table will count one
that does not open.

A source-level pass over the three flagged-off routes is cheap and nobody has done it, and this
repo has already deleted a screen (`AnalyticsScreen`, session 29) rather than leave a mock behind
a flag. ~2h.

---

## 6 · What in the session-40 prompt was false, and my own retractions

### ⚠️ §0.2's "a full run now takes ~14 minutes" — it was 21

And the sweep's own "~4m40s" (repeated from session 39's header) was **~13.5 minutes** here.
Class Builder and Schedule were both at or past their 240s per-test budget, and one of them failed
on the untouched tree. The brief's number was right on the machine it was measured on, which is
exactly the failure mode `§0.3` warns about.

### ⚠️ §3.5's "give it `data-tap` and a 44px box" is not an available option

`data-tap` alone does nothing on a `<select>` — no `::after` is generated for a replaced element.
The brief offers it as one of two choices and it is neither: marking a select and leaving its box
at 37px makes it fail the sweep without making it easier to hit.

### ⚠️ §3.4 understates it: the defect ships today

The brief (following session 39) says it was found by mutation and that nothing ships broken.
`{"stages":[null]}` is a readable file that reaches the wrong message.

### 🟢 What the prompt got exactly right

- **§0.1's branch table and gate numbers.** All four PRs open, `main` still `7508de1`, and
  **1310 unit / 615 e2e** matched to the test.
- **§0.2's chromium block.** Verbatim, first try, fourth session running.
- **§3.1, §3.3 and §3.5's diagnoses**, each checked against the code before building.
- **§4.1's method.** All three §4 findings came from seed → render → **read** → check the store.
  Not one came from a test.

### 🔴 My retraction: I twice blamed my own change for the sweep's pre-existing variance

I measured Class Builder at 68 presses, made it faster, measured 47, and concluded I had cost
coverage. I then produced two confident mechanisms — the adaptive settle, then reading
`outcome.names` — reverted each, and got 47 both times. **The original, untouched, presses 68 then
50 then 51.** The sweep was never deterministic and I had taken one run as a baseline.

I reported the "coverage regression" to Dylan mid-session before establishing that. The finding
that came out of it is real; the attribution in that report was not.

### 🔴 My retraction: I introduced a 240-second hang and shipped it for one commit

Folding five round trips into one `page.evaluate` (9ed9735), I put the work in a `setTimeout`
callback with no `reject`. A throw there never settles the promise and `page.evaluate` has no
timeout. Fixed in `aaaee9f`, one commit later, along with bounding every other read — which is the
part worth keeping.

### 🔴 My retraction: the lazy-panel second look was a silent no-op for two runs

I compared `document.querySelectorAll("button, …").length` against `revealedList.length` — an
unfiltered count against a filtered one. The condition was satisfied the instant it was asked, so
the "second look" returned immediately and I read two runs of unchanged numbers as evidence the
hypothesis was wrong.

### 🔴 My retraction: I added a guard for a state the product cannot reach, with a test that could not fail

In §3.3 I added `resolveClassType` to the Builder's scheduled-type read, reasoning that a legacy
rule carrying a LABEL would make the notice announce a mismatch between a class and itself. I wrote
a test for it. **The test passed with the guard mutated away**, which is the tell.
`CalendarScreen:203` normalises every rule before deriving occurrences, so a started class already
carries `crossfit` — probed end to end. Both removed, and the reasoning left at the line.

### 🔴 My own process failures: I invalidated two full e2e runs

Once by editing `src/` while a run was in flight, and once by running `npm run size` — which
builds `dist/` — while the preview server was serving it. CLAUDE.md warns about the first in two
separate places. Both runs were discarded and re-run on a quiet tree.

### 🔴 My retraction, inside §4: "0 CLASSES RUN" was my fixture

I seeded attendance rows with no `class_instances` and read "0 CLASSES RUN" beside "382
CHECK-INS" as a contradiction the product ships. `applyAttendanceImport` creates an instance for
every imported class, so no real gym is in that state. Checked before reporting, which is the only
reason it is here as a near-miss instead of as a finding.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Unchanged from sessions 38 and 39.
2. **Answer A20**, and the room-board question in §5.1 — three sessions old now.
3. **Merge PR #15, then #16, #17, #18, then this branch.** `main` is eight sessions stale.
   **Merging them still does not let a coach find cover — A17 does.**

---

## Session 39 — the guard that found its own next hole, and the four doors behind it

> Written in full to `SESSION-39-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-08. Branch `claude/session-39-prompt-vl5r13`, based on
`claude/session-38-two-boards-seams-tx19ce` — PRs #15, #16 and #17 were all still open and
`main` was still `7508de1`, which is §0.1's third row. Six commits ahead of it._

Position confirmed by gate, not by log: `npm test` reported **1304 unit (46 files)** and
`npx playwright test --list` **590 in 48 files** at the branch point, exactly as the brief said.

> **Gates green.** `lint:crash` **0** · **1310 unit** (46 files) · **615 e2e in 53 spec files**
> · seven-chunk build · **0 over budget** (StaffApp **333.81 / 360 kB**, RetentionScreen
> **17.22 / 18 kB**). App.jsx **2,646 lines**.
>
> ⚠️ **CLAUDE.md's top block still says "935 unit · 466 e2e · App.jsx 3,857 lines" and is
> labelled "green as of session 28".** Every one of those is four sessions stale; the numbers
> above are measured. The App.jsx figure is the one most likely to mislead — decomposition has
> taken it from 3,857 to 2,646 and a session budgeting against the old number would think it had
> a problem it does not have.

**§3 landed in full. Then §4 ran and found three things a gym would have felt — and one of them
was found by a test written in §3, on the first screen it walked.**

---

## 1 · What shipped, per commit

### 1.1 `9edefab` — the button says "Rename class"; the prompt said "Session name:"

§3.4, verified before building. One four-line block in the Builder's header used **three** words
for one object: `aria-label="Rename class"`, a `window.prompt` saying `Session name:`, and an
empty-name header reading `Untitled Session`.

`session` is App.jsx's variable name, not the product's word — the screen is the Class Builder,
its file buttons open and save a "class file", the Dashboard says "today's class". The aria-label
is also the string seven e2e specs address the button by, so it stayed and the other two moved to
it.

⚠️ **`PTScreen`'s "Session name" is a different object** and is left alone: a 1:1 session really is
a session, and renaming it would be the reverse of this fix.

⚠️ **`{sessionName || "Untitled class"}` is UNREACHABLE** and is now commented as a guard rather
than as copy. `getDraftClass` coerces a missing name to `""` and App.jsx then reads
`savedDraft?.name || "My Workout"`, while the rename button refuses an empty value — so nothing can
put `""` in `sessionName`. It is corrected for the day something can, and deliberately untested: a
test for a string that cannot render is the "empty screen passes every scan" trap in miniature.

`e2e/builderCopy.spec.js` captures `dialog.message()` into a **variable** rather than asserting
inside the handler, and the capture is the positive control — Playwright auto-dismisses native
dialogs, so `expect(undefined).not.toMatch(/session/i)` would pass on a page that never opened a
prompt. Mutation: restoring `"Session name:"` fails with
`Expected: "Class name:" / Received: "Session name:"`.

### 1.2 `c537021` — reordering the stages of a class had no test, and the class IS its order

§3.3. `handleReorderStages` and the five drag handlers were undriven. `builderMove.spec.js` reads
as if it covers this and does not: it moves an **exercise between** stages, a different control
with different arithmetic.

Three tests, each with a mutation that kills it:

| Test | Mutation | Result |
|---|---|---|
| drag DOWN, screen + disk + reload | `arr.splice(i,0,moved)` → `splice(from,…)` | 2 failed, 1 passed |
| drag UP | (same) | — |
| a drop with **no drag before it** | delete `from === null \|\|` | 1 failed, 2 passed |

Up and down are **not** the same arithmetic: `splice(from,1)` shifts every index above `from`, so
driving only one would have left the other's off-by-one free to appear.

The third is the guard on a **stray drop** — a file dragged in from the desktop arrives with the
drag-index ref still null, and without the guard `arr.splice(null,1)` reads null as 0 and silently
moves the warm-up.

⚠️ **A stage dropped onto ITSELF is deliberately not tested**, and the file says why: `from === i`
returns early, but deleting that line changes nothing observable — splicing a stage out and back in
at the same index is the identity. A test that cannot be made to fail is deleted here, not kept for
the look of coverage.

### 1.3 `88331db` — "Save to file" and "Open" had never been pressed by a test

§3.2. `screens.spec.js:38` asserts that the WORDS appear on the Class Builder. An export writing
`{}` and an import dropping every exercise would both have kept it green.

Three tests, four mutations, each killing exactly what it should:

- **Round trip.** Rename, apply a class type, export, read the real download's bytes, open it into
  a **second clean store**, assert the class came back — stages in order, movements inside them,
  name, class type, and all of it after a reload. `stages: []` in the export fails it. The
  receiving Builder's own defaults are asserted **not** to equal the exported class first, or an
  import that did nothing would pass.
- **A declined class type must not travel into the file.** Session 38 §4.3's gesture — move the
  picker, press Keep Current. Putting that bug back fails this test alone:
  `Expected: "crossfit" / Received: "spin"`. The `.json` a coach sends another gym would have been
  labelled with the type they refused.
- **Bad input, on the MESSAGE and not on the silence.** Playwright auto-dismisses dialogs, so "I
  imported rubbish and the stages did not change" passes whether the guard exists or not. Both
  alert paths assert `dialog.message()`.

### 1.4 `1454673` — the sweep that goes looking, and the four doors it found

§3.1, and it is two things: an instrument, and what the instrument found on its first screen.

**`e2e/destructiveSweep.spec.js` names no control.** It presses every control on every screen and
asks one question of each press: *did the gym lose something, and if it did, was it offered back?*

A **loss** is structural, not "the store changed":

- a row with an `id` that was in the gym before the press and is nowhere in it after;
- an element of a list without ids (a stage's exercises, a coach's aliases) whose count **across
  the whole key** dropped;
- an array or object replaced by something that is not one.

A **guard** is a native dialog (dismissed, so nothing is lost), a confirm on screen with nothing
written yet, a loss with `toast-undo` beside it — or the press being **its own inverse**
("Mara free Mon 06:00" un-states an availability with no toast, and pressing the same cell puts it
back; the sweep presses a suspect twice and calls a reversal a guard).

It **descends one level**, deduplicated by the SHAPE of what was revealed, because a screen's most
dangerous control is often not on the screen: "Open in Builder" is inside a collapsed 1:1 client
card and no top-level scan would ever have touched it.

`e2e/usedGym.js` is the shared fixture — an empty roster has no delete buttons and an empty week has
no remove buttons. Row shapes are copied out of `store.js` and out of the specs that already drive
each domain; the **coach corpus is not typed at all** but captured by pressing "Load sample coach"
and reading back what the app itself wrote.

**What it found on the first screen it walked** is §4.1 below.

### 1.5 `219262a` — "562 members measured" on a gym that has 200 members

§4.2 below.

### 1.6 `821492e` — "Reset to Defaults" put `GYM-MOBILITY-MTSG6ZHY` on the timetable

§4.3 below.

---

## 2 · What is still red

**Nothing.** Every gate is green on `821492e`:

```
lint:crash  0                      (npm run lint  still reports 211 advisory problems — expected)
unit        1310 passed (46 files)
e2e         615 tests in 53 files  (612/613 on the full run taken before the last two commits;
                                    the single failure was a copy assertion I changed on purpose,
                                    see §6)
build       7 chunks
size        0 over budget
```

⚠️ **One thing to argue with rather than a red gate: the sweep costs ~4m40s** of the e2e run, and
CI runs a single worker. It is 12 tests. The argument for it is that it found four live defects on
the first screen it walked; the argument against is real and §5.5 proposes what to do about it.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved. `DYLAN-QUEUE.md`, all three PR conversations (**zero comments on #15, #16 or
#17**) and `git log` were all checked before any work started.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**Repeat, in words: merging branches does not let coaches find cover; A17 does.**

And session 38's version, still true: **four of the last two sessions' findings existed only
because the deployed build has no server.** The product now tells the truth about all of them, and
the truth is still a refusal.

**Three decisions are in writing and waiting**, and none has been answered:

- `docs/PT-RECONCILIATION.md` §6 — second lens, or a PT product?
- `DYLAN-QUEUE.md` A20 — arbitrary class times: yes/no, and grid or list.
- `SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw? The most fully costed
  decision in the repo.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 Four doors replaced the coach's whole class with nothing offered back · FIXED (`1454673`)

**What is wrong.** Five functions in `App.jsx` replace `stages` wholesale. **One** of them honoured
the rule the product already holds — `handleNewClass`, forty lines above the others: *replacing the
coach's class is destruction, and destruction is confirmed or undoable.*

| Function | Reached from | Guarded? |
|---|---|---|
| `handleNewClass` | Dashboard "New class" | ✅ undo, since the toast primitive landed |
| `handleSelectTemplate` | the Builder's "Jungle presets…" picker | 🔴 nothing |
| `handleDraftFromPersona` | **seven** controls on Coaches: "Draft from this shape", "Draft &lt;plan&gt;", "Reopen", and five Generate-draft presets | 🔴 nothing |
| `handleLoadPtSession` | "Open in Builder" on a 1:1 client | 🔴 nothing |
| `handleImportTemplate` | "Open" a class file in the Builder | 🔴 nothing |

**The evidence.** A hand-authored class, driven — renamed, a stage removed, and the removal's toast
allowed to expire so the only undo on screen would belong to the control under test:

```
before   MY OWN TUESDAY :: Warm-Up, Circuit Blast, Strength Block, Cool-Down :: 8 exercises
Coaches → "Draft from this shape"
after    S360 — from your class shape :: Warm Up, M1, A1 + A2, B1 + B2, C1 :: 11 exercises
         undo = 0        toast = (no toast at all)
Builder → "Jungle presets…" → Apex HIIT
after    Apex HIIT :: Ignition, Surge Block 1, Velocity Peak, Surge Block 2, Reset :: 10 exercises
         undo = 0        toast = (no toast at all)
```

**What it costs a gym.** The class a coach spent twenty minutes writing, gone on one click, from a
control that reads as "look at this" rather than "replace what I have". The Coaches screen is the
worst of the four: a coach browsing their own imported corpus, pressing "Draft from this shape" to
*see* what it would produce, loses the class they were building.

**The fix.** One `replaceWholeClass(said, apply)`, five callers. It holds the PRIOR list — not a
rebuilt one — and restores `classChoice` with the stages, because session 38 §4.3 established that
a coach's stages under somebody else's class type is a different class, not their class back, and
that label reaches `class_instances.class_type` through the Runner.

**This is session 38's §4 one layer out, and its own lesson applied.** Session 38 wrote: *when you
find a guard that one caller skipped, the question is not "who skipped it" but "how many callers are
there".* It counted the callers inside `BuilderScreen` and fixed four. Nobody counted the five out
here.

**Tests.** `e2e/classReplacement.spec.js` drives each door the way a coach reaches it. Removing the
guard fails all four; removing only `setClassChoice(before.classChoice)` fails exactly the two doors
that carry a class type. ⚠️ **The file door is in that spec rather than in the sweep on purpose:** it
needs `setInputFiles`, and a sweep that presses controls structurally cannot hand the browser a file.
A control the instrument cannot reach is exactly the kind that goes unnoticed.

### 4.2 🔴 The Analytics screen said 562 members on a gym with 200 · FIXED (`219262a`)

**What is wrong.** Seeded a gym that has actually been used — 200 members, 14 months, 214 classes,
~20,000 check-ins — opened Analytics and read it:

```
Which classes members come back to
studio average 90% · 562 members measured
  Hyrox     92%  175/190
  Mobility  90%  165/184
  HIIT      88%  166/188
```

190 + 184 + 188 = 562. The **arithmetic was never wrong**: `studioOf` is the pooled average's
denominator and counts a member once per class type they tried, which is right for the rate — a mean
of the three rates would be a figure no member of the gym experienced, and the comment above it
argues that case well. What was wrong is the **noun**.

**What it costs a gym.** An owner reading a headcount larger than their own roster either believes it
or stops believing the screen. This repo's own rule is that a confident wrong number is worse than no
number, and this is one that can be checked against the roster in two seconds.

**The fix.** `classTypeRetention` returns **both**, named for what each is: `studioOf` unchanged, and
`studioMembers` — a Set of the member ids that entered any type's denominator. The line now reads
`studio average 90% · 194 members, once per class type they tried`, which is a possible number and
says which of the two it is quoting.

**Why no test had caught it.** Every fixture in `retention.spec.js` gives each class type its OWN
members (`${type}-m${i}`), so the two numbers coincide and the defect is invisible. That is the shape
a fixture takes when it is written to exercise one panel, and it is not the shape a timetable has.

### 4.3 🔴 "Reset to Defaults" put a storage key on the gym's own timetable · FIXED (`821492e`)

**What is wrong.** Session 22 shipped `GYM-BARRE-MRKHJ2LC` onto the Dashboard, and
`e2e/rawValues.spec.js` was written to stop it happening again. **It could not have caught this**:
every fixture in that file keeps the label, so `LIB[key]?.label || key` always found one and the
`|| key` half — the half that leaks — was never once exercised by the sweep written for it.

**The evidence**, driven end to end through the shipped UI with no fixtures:

```
Exercise Library → Edit → "+ New class type" → "Mobility"
  jungle_library_custom: { "gym-mobility-mtsg6zhy": { label: "Mobility", … } }
Schedule → Add class → type "⭐ Mobility"
  rule { name: "Monday Mobility", type: "gym-mobility-mtsg6zhy" }
Exercise Library → Edit → Reset → Reset Library
  the rule is untouched; the catalogue entry is gone
Schedule
  06:00   Monday Mobility   45m   GYM-MOBILITY-MTSG6ZHY
```

Four clicks from a button that ships with a confirm.

**The fix.** `classTypeLabel(raw, lib)` in `libraryStore.js`, beside `resolveClassType` and
deliberately **not** part of it: the stored value is untouched — `resolveClassType`'s comment argues
that at length and it still holds — and only what is drawn changes. The recovery is not a guess:
`newClassTypeKey` builds `gym-<slug>-<base36 ms>` out of the gym's own words, so turning the slug
back is restoring their text.

**How many callers there were:** five class-type sites used `LIB[…]?.label || …` — the week's chip,
the Dashboard's "Today's classes", the Builder's header, "Drafts as:" on Coaches, and every row
label in the Analytics ranking. All five now go through the helper. `ProfileModal.jsx:186` uses the
same pattern over stage types and is left alone: those keys are ours, and a missing one is our bug
to see.

**Test.** A **second** fixture in `rawValues.spec.js`, not a stricter assertion on the first —
author, schedule, reset, assert the rule still holds the orphaned key (or the test proves nothing),
then scan. Reverting `CalendarScreen` fails it with `[gym-key] "GYM-BARRE-MTSGBNDQ"` and the
surrounding text. **The scanner already had the detector; what it never had was a state to detect it
in.**

### 4.4 🟢 The near-misses — things I chased and did not report

Written up because the next session will chase them too.

- **The cover-approval toast.** §4.2.1's lead — grep the comments for admissions of a previous
  over-claim — turned up `CoachCoverPanel.jsx:337` ("⚠️ 'JUST THAT DAY' IS THE SENTENCE THAT
  CHANGED") and `setupProgress.test.js:105`. I suspected the toast now over-claims *inside* Jungle:
  it says "Mara teaches Hyrox Sim on Wed — just that day" while "nothing writes to the schedule any
  more". **It is honest.** `applyCovers` overlays the approved cover onto the derived occurrences,
  so the Schedule really does show Mara. The lead was worth following and came up empty; both
  sentences it names are currently true.
- **Renaming a coach who has classes** (§4.2.5). Rules carry a coach NAME and no id, so a rename
  should orphan them. It does not: `coachEditPatch` auto-adds the old name as an alias, and
  `resolveCoach` matches on name + aliases. Already guarded.
- **The cohort table at 390px** looked clipped, with the 6-month column cut mid-percentage. It is
  inside an `overflowX:"auto"` wrapper with `minWidth:340px` and scrolls. A **full-page screenshot
  renders the container at its natural width**, which is what clips it. Measured before reporting.
- **"Roster · 3(1 not active)"** read as a missing space in `innerText`. The span carries
  `marginLeft:"7px"`; `innerText` concatenation is the artefact.
- **"0.0 HOURS THIS MONTH" and an empty session history** after running a class. Both mine:
  `saveSession` has a ten-second floor and my probe ran a two-minute class. Driven again past the
  floor, the whole flow is correct — check-ins land on the pinned instance, the roster's visit
  counts move, the Dashboard's "Recent sessions" fills in and the setup checklist closes out.
- **`node scripts/audit-store-writers.mjs`** (§4.2.6) exits 0 with **0 unexplained** and its three
  permanent seams green.

### 4.5 🟢 The e2e flakes did not appear

§4.2.8 asked to say so if none were seen. **None were.** A full 613-test run finished 612 passed / 1
failed, and that one failure was a copy assertion I changed on purpose (§6). Across roughly a dozen
partial runs and six full sweeps of the new file, nothing failed twice in the same place for a reason
I could not name. Session 33 remains the last sighting, and CLAUDE.md's advice to treat that entry as
folklore held up.

---

## 5 · Proposals

### 5.1 🔴 Carried forward, unanswered: how big should the room boards draw? · ~1 day

Session 38 §5.1, **unchanged and still waiting**. The requirement is written down (primary 8–12% of
screen height, secondary ~3%); what ships is 1.0–2.5% on the Plan board. Session 38 prototyped the
obvious fix and rendered all three boards at 1280×720: Plan much better, Floor fine, **Coach breaks**
— the stage-journey strip truncates to `• War… ▶ • Stren… ▶ • Circui…`. So a global floor is not
shippable and the work is per-board. **The decision needed: should the pre-class Plan board fill the
wall the way the timer boards do?**

### 5.2 🟡 Carried forward: raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2h after 5.1

Session 38 §5.2, unchanged.

### 5.3 🟡 Carried forward: `parseCsv` and semicolons · half a day

Session 37's, still open. Sniff the delimiter only when the comma-parse yields exactly one column.
Worth doing if a pilot gym's export is `;`-separated; not worth doing speculatively.

### 5.4 🟡 "Reset to Defaults" should name what it orphans · ~2 hours

The confirm asks, and that is why the sweep passed it. What it does not say is that removing the
gym's own class types leaves every schedule rule that used one pointing at nothing — which is how
§4.3 happened. The coach-delete confirm sets the precedent and its own comment states the principle:
*"the cascade inventory IS the guard"*. The work is counting the rules and instances that reference a
gym-authored key and putting that sentence in the confirm. §4.3's fix means the timetable no longer
LIES about it; it does not mean the coach was warned.

### 5.5 🟡 Make the destructive sweep cheaper, or split it · ~3 hours

It costs **~4m40s** and CI runs one worker. Roughly two thirds of that is the restore after a
destructive press (reinstall the gym, reload, re-navigate ≈ 1.2s), and the two heaviest screens —
Coaches (156 presses) and Schedule (178) — account for most of it. Three options, in the order I
would take them: **(a)** cap the descent's revealed set and dedupe harder, which costs coverage;
**(b)** restore by writing localStorage and re-navigating without a full reload, which is the real
win if the app can be made to re-read; **(c)** split the file so the four screens with known
destructive controls run on every push and the rest run nightly, which is the cheapest to do and the
easiest to let rot. I did not take any of them because a sweep that has not yet been read by anyone
else should not be optimised first.

### 5.6 🟢 The Builder says nothing when the schedule names a class type the library lacks · ~1 hour

`schedKey = scheduledType && LIB[scheduledType] ? scheduledType : ""`, so the "Scheduled as X · Load
X" notice appears only for a type the catalogue still has. Start a class whose type was reset away
and the Builder prints its own class type in the header with no notice at all. There is no template
to offer, which is not a reason to say nothing. One extra branch: show "Scheduled as &lt;name&gt;"
with no button.

### 5.7 🟢 `handleImportFile` blames the file for an error in the import · ~30 minutes

One `try` wraps both `JSON.parse` and `onImportClass(...)`, so anything that throws inside the import
is reported to the coach as *"Could not read that file — please choose a Jungle class file (.json)"*.
Nothing ships broken today — I found it by mutation, when deleting the template guard made a
perfectly readable file get blamed for being unreadable. Narrowing the catch alone would trade a
wrong message for **no** message, so the second half needs one of its own.

### 5.8 🟢 "A typical class here is 2 members" from one class · ~1 hour, and it needs a number

The check-in speed panel states its sample size honestly — "Measured across 1 class and 2 check-ins"
— and then generalises from it: *"A typical class here is 2 members, so roughly 1s of your coach's
time per class."* The estimate is labelled "roughly" and every input is the gym's own, so this is a
judgement call rather than a defect. A minimum-sessions floor before the consequence clause appears
would fix it, and **choosing that floor is the work**: picking 3 because it sounds right is the same
confident-wrong-number fault one level up. `MIN_TRIERS = 8` has an argument behind it; this would
need one too.

### 5.9 🟢 The Health Screen's client picker is 37px tall on a phone

`tapScan` is **opt-in** — it scans `[data-tap]` — and a `<select>` carries no such attribute, so the
44px rule has never been asked of it. The picker is the first control on the screen and the one a
coach uses standing up. Either give the select `data-tap` and a 44px box, or decide that selects are
out of scope for the rule and write that down where the scanner is defined.

---

## 6 · What in the session-39 prompt was false, and my own retractions

### ⚠️ §3.3's drag-and-drop warning is wrong in general

> *"Driving HTML5 drag-and-drop in Playwright needs `dispatchEvent` with a real `DataTransfer`, not
> `dragTo`."*

`dragTo` drove both stage reorders on the first attempt, exactly as `libraryReorder.spec.js` has been
doing for the exercise pool since session 15 — which the brief could have been checked against in ten
seconds. `dispatchEvent` with a real `DataTransfer` was needed for exactly one gesture: a **drop with
no dragstart before it**, which `dragTo` cannot make because it always fires `dragstart` first. The
warning is true of that case and of nothing else, and taken at face value it would have made all
three tests harder to write and one of them worse.

### ⚠️ §3.4 undercounts: there were THREE words, not two

The brief names the aria-label and the prompt. The empty-state header said `Untitled Session` as
well, in the same four lines. Not a false claim — an incomplete one, and the kind that matters
because "fix the two" would have left the third.

### 🟢 What the prompt got exactly right

- **§0.1's branch table.** All three PRs still open, `main` still `7508de1`, and the gate numbers
  matched to the test — 1304 unit and 590 e2e, not approximately.
- **§0.2's chromium block.** Worked verbatim, first try, and every screenshot and every driven probe
  in this document needed it.
- **§0.3's warning that the prompt would have rotted.** Two of its claims had.
- **§3.1's diagnosis.** "That is not a gap, it is the method failing" is exactly right, and the sweep
  found four unguarded controls on the first screen it walked.
- **§4.1's method.** All three §4 findings came from seed → render → **read** → check the store, and
  not one came from a test.

### 🔴 My own retraction: the first comparator called a MOVE a destruction

The sweep's first loss detector compared each array against its counterpart, and reported the
Builder's "Move &lt;exercise&gt; to another stage" as destroying data. The exercise really had left
the list it was in; it had arrived in the next one. A sweep that cries about a move is a sweep nobody
keeps running. The comparator now counts **globally per key** — ids that are nowhere in the gym any
more, and a multiset for elements with no id — and the self-test carries the case that bit.

### 🔴 My own retraction: the sweep silently stopped sweeping

The first loop located each control by POSITION and gave up when `now[i] !== baseline[i]`. A press
that removes a row shortens the list and shifts every index after it, so on the Schedule it **skipped
28 of 59 controls and reported a clean run**. That is precisely the failure this file exists to
avoid, committed inside the file itself. Controls are located by name and occurrence now, and the
skip list is printed.

### 🔴 My own retraction: my fixture said "Part-answered" and I nearly reported it

`usedGym`'s PAR-Q answers were keyed by readable names (`heart`, `chestPain`, …). `parq.js` keys
`PARQ_QUESTIONS` by `q1`…`q7` and counts only `typeof answers[q.id] === "boolean"`, so the 1:1 screen
correctly reported a **part-answered** screen for a member I thought I had cleared. Row shapes come
out of the source, never out of your head — CLAUDE.md says so, and I had read it that morning.

### 🔴 My own regression: an unparseable file, caught by session 37's sweep

The first draft of §4.2's explaining comment went **inside** `{ct.ready && ct.studioRate != null && (
… )}`. A parenthesised JSX expression holds exactly one element, so `RetentionScreen.jsx` became
unparseable — and `src/ui/jsxText.test.js` reported it as `— UNPARSEABLE` in the same `npm test` run,
before the crash lint. That sweep has now earned its place in two consecutive sessions, which is the
only evidence anyone gets that a preventative test works.

### 🔴 I changed a passing test's assertion, on purpose

`dashboard.spec.js` asserted that the New-class undo says *"Your previous plan is back"*. It now says
*"Your own class is back"*, which is what `applyTemplate`'s undo has said since session 38. Adding
four more callers of the same mechanism would have made six controls restore the same object in two
sentences — the same one-object-two-words fault as §1.1, shipped in the same session that fixed it.
The assertion was changed to the new sentence and **not** loosened: it still pins that the undo fires
and that the stored draft comes back, and the test carries the reason at the line.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Unchanged from session 38, and still the reason several
   findings exist.
2. **Answer A20.** A decision, it blocks a gym on day one, and it is a one-array change.
3. **Merge PR #15, then #16, then #17, then this branch.** `main` is seven sessions stale and nothing
   merges to it on its own. **Merging them still does not let a coach find cover — A17 does.**
