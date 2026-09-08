# Session 39 — the guard that found its own next hole, and the four doors behind it

_2026-09-08. Branch `claude/session-39-prompt-vl5r13`, based on
`claude/session-38-two-boards-seams-tx19ce` — PRs #15, #16 and #17 were all still open and
`main` was still `7508de1`, which is §0.1's third row. Six commits ahead of it._

Position confirmed by gate, not by log: `npm test` reported **1304 unit (46 files)** and
`npx playwright test --list` **590 in 48 files** at the branch point, exactly as the brief said.

> **Gates green.** `lint:crash` **0** · **1310 unit** (46 files) · **615 e2e in 53 spec files**
> · 14-chunk build · **0 over budget** (StaffApp **333.81 / 360 kB**, RetentionScreen
> **17.22 / 18 kB**). App.jsx **2,646 lines**.
>
> CLAUDE.md's gate block is updated to these numbers in the report commit. It was correct for
> session 38 — see §6 for the version of this paragraph I had to withdraw.

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
build       14 chunks
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

### 🔴 My own retraction: I called CLAUDE.md's gate block stale, and it was not

The first draft of this document's header said CLAUDE.md still claimed "935 unit · 466 e2e ·
App.jsx 3,857 lines". Those numbers ARE in CLAUDE.md — inside the ⚠️ paragraph that describes them
as the wrong ones a previous session left on `main`. The line above it, which is the one a session
is told to check its position against, said **1304 unit · 590 e2e · App.jsx 2,565** and was right
for session 38 in every figure. I read the warning and reported it as the claim. That is the same
misreading the paragraph exists to prevent, made while writing the report about it.

The block is updated to this session's measurements — 1310 / 615 / 2,646 — which is maintenance, not
a correction.

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
