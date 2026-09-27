# Session 40 — the instrument was lying, and four things the product said that were not true

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
