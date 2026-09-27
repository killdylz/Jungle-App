# Jungle — Session Handoff

_Last updated: 2026-09-27 (session 41)_

> 📁 **Sessions 6–39 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 41 — the wedge that would not come back, and three numbers the product said that were not true

> Written in full to `SESSION-41-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-27. Branch `claude/relaxed-knuth-s6p32q` (the branch this environment assigned; the brief
suggested `claude/session-41-<something>`), based on `claude/jungle-session-40-q4batq` — PRs
**#15, #16, #17, #18 and #19 were all still open**, `main` was still `7508de1`, and there were
**zero comments or reviews on #19** (the other four were not re-read comment by comment; their
`updated_at` had not moved since session 40). That is §0.1's second row. Six commits ahead._

Position confirmed by gate, not by log: `npm test` reported **1321 unit (47 files)** and
`npx playwright test --list` **620 in 53 files** at the branch point, exactly as the brief said.

> **Gates at HEAD.** `lint:crash` **0** · **1328 unit** (50 files) · **624 e2e in 53 spec files**, one clean
> run on a quiet tree, **624 passed (16.4m)** · 14-chunk build · **0 over budget** (StaffApp
> **334.09 / 360 kB**). App.jsx **2,706 lines**.

---

## 1 · What shipped, per commit

| Commit | What | Verified at |
|---|---|---|
| `2036d18` | §3.4 — `handleSelectTemplate` (no caller) and the unreachable Integrations route deleted; `deadHandlers.test.js` | lint:crash 0 · 1323 unit |
| `696ce99` | §3.1 did not reproduce; §3.2's second look landed — the sweep walks into lazy panels | sweep 12 passed (5.4m) |
| `152234b` | §3.3 — every `<select>` is 44px below 900px, one CSS rule | 1323 unit · mobile 22 passed · size 0 over |
| `0c94290` | 🔴 **found** — at 390px the Builder's class-type dropdown was a bare 29px chevron | 1323 unit · size 0 over |
| `7e67f70` | 🔴 **found** — the Floor board printed FINISH on stage 5 of a six-stage class | 1325 unit · display + smoke 39 passed |
| `2e4eeb5` | 🔴 **found** — "CLASSES RUN 10" for a week nobody taught | 1328 unit · 4 specs 43 passed |

Every change has a test that fails when it is reverted; each commit message carries the mutation
and the failure it produced.

### 1.1 `2036d18` — §3.4, two doors nobody could open

Read all three `MOCK_VIEW_FLAG = false` routes. `templates` and `glossary` have **no render
branch** — nothing behind them to read, and `navRoutes.test.js` already pins that. `integrations`
did have one, a `MockDisabledScreen`, and **no way in**: `isViewEnabled` filters it out of all four
navs, no `setView`/`onNavigate` names it, and the view is not restored from storage.
`navRoutes.test.js` cited it as the model honest retirement; it was an honest panel behind a door
nobody can open. Deleted, and added to the test's retired list.

`handleSelectTemplate` — one of session 39's "five whole-class replacements" — had **no caller**.
Deleted, with the `templateTracks` App state whose only reader it was (the store functions stay;
prefs hydrate still round-trips the server column). `deadHandlers.test.js` asserts every
`const handleX =` in App.jsx is referenced outside comments, with a positive control. `npm run
lint` would say the same inside 211 advisory problems nobody reads.

**No mount-write defects to find**: unlike `music`, none of the three has a screen left to mount.

### 1.2 `696ce99` — §3.1 does not reproduce; §3.2 landed

**§3.1.** Reproduced outside the sweep first, as the brief asked: a throwaway spec on a used gym
opened the Profile modal and pressed each of its controls from a fresh load — both tabs, Upload
Logo, Save, Reset, **Sign Out**, Close — then read with `page.evaluate` **and** a raw CDP
`Runtime.evaluate`. Every read answered in well under a second. Then the real sweep with a second
look added: **"Sign Out" pressed ten times across twelve screens, every read answered, 12/12
green.** Session 40's second-look code was never committed, so there is nothing left to test its
wedge against. The likeliest home is the instrument that reached it — that is a guess, and the note
in the file says so. The bounded reads stay; they cost nothing while the page answers.

**§3.2.** The second look is keyed on the one thing only a lazy-panel press does: **it fetches
code**. When a script request started after the press and nothing new is on screen, wait (bounded,
3s) for the scripts to land and read again. A blanket wait after every quiet press would cost ~1.7s
on each of the Schedule's 60 controls. The same look runs after a **reopen**, which reloads the
page and so refetches the chunk — without that half the descent reached the modal and then recorded
"Sign Out" and "Close" as *skipped*, which is exactly what the branch-point run's Class Runner line
says: `skipped 2: Run › Sign Out, Run › Close`.

Descents per screen, branch point → now: Dashboard 0→1, Class Builder 5→7, Coaches 7→8, Schedule
8→9, Members 2→3, Analytics 1→2, 1:1 Clients 4→5, Health Screen 1→2, Brand Studio 4→5. No
guarded/unguarded verdict changed. The Dashboard sweep now asserts it PRESSES "Your profile and
settings › Sign Out" and "› Close" — the modal is walked from nowhere else. Each half of the second
look is mutation-checked separately.

### 1.3 `152234b` — §3.3, every select is 44px on a phone

Measured on a used gym at 390px before touching anything: the Builder's class type / style /
presets **26px**, the Library's class picker **28px**, the Schedule's "Coach who is away" **34px**,
Brand Studio's currency **37px**, the Builder's per-exercise "Move to…" **18px**.

**One CSS rule under 900px** (the bottom-bar line) instead of eighteen inline edits, because an
opt-in rule is exactly how those eighteen went unasked. Desktop is unchanged. `data-dense` opts out
**one** control — the Builder's per-exercise "Move to another stage", which sits in ~30px rows next
to icon buttons that are already deliberately not `data-tap`; growing it alone makes every
exercise row 44px on a phone, which is a Builder redesign (§5.4).

**The judgement the brief asked for, in one line: text fields do not belong in the rule** — a
field is a wide target, a miss lands visibly in the next field instead of doing something, and
several (the Library search) are a borderless input inside a larger pill, so a height rule on the
input would measure the wrong box. The `Input` primitive stays 35px.

### 1.4 `0c94290` — the Builder's class type was unreadable on a phone

Found by **looking at** the screen §1.3 had just made taller. See §4.2.

### 1.5 `7e67f70` — the Floor board and a six-stage class

Found driving §4.2 item 4. See §4.3.

### 1.6 `2e4eeb5` — CLASSES RUN

Found driving §4.2 item 3. See §4.1. ⚠️ **The existing `schedule.spec.js` test asserted the
defect** (`shown === past` published occurrences) and was rewritten, not loosened: it now publishes,
re-slots, republishes, advances a week, asserts the books hold `PER_WEEK + 1` past occurrences, reads
**0**, and then a positive control (two check-ins into one class) reads **1**.

---

## 2 · What is still red, and why

**Nothing is red at HEAD** — see the gate line above.

🔴 **The branch point was green**: the full suite ran before any work, on a quiet tree —
**620 passed (15.7m)**.

⚠️ **One failure, once, under load I caused.** A mid-session full run (at `0c94290`) reported
`622 passed, 1 failed` in 17.9m: `destructive.spec.js:526` "a template tile asks before replacing
a class the coach wrote", failing at its **fixture's positive control** — the seeded draft read back
as the default five stages. I was running worktree specs and a build in parallel at the time. It
passed **15/15** isolated (`--repeat-each 3` of the whole describe), and a deliberate attempt to
force the obvious race (`freshApp` → `setItem` → wait, under 12× CPU throttling) passed 4/4, so I
have no mechanism. Recorded as the brief asks — the REPORT, not the pass/fail — and not as a
finding. **In the final clean run it passed**, as did everything else. If it recurs on a quiet
tree, `seedAuthored` (destructive.spec.js:509) is where to look.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved. `DYLAN-QUEUE.md`, PR #19's conversation and reviews (**none**), and `git log`
(every commit since `7508de1` is Claude-authored) were all checked before any work started.

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
- `SESSION-38-HANDOFF.md` §5.1 — how big should the room boards draw? **Now four sessions old.**

**New this session, and it is a decision (§5.1): at what point does an absent member stop being
"at risk" and start being "gone"?** Today, never — and the revenue figure an owner quotes is the
one it inflates.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 "S$9,540/month at risk" on a gym whose at-risk members left up to 20 months ago · NOT FIXED — §5.1

**What is wrong.** Rule 2 (`retention.js`, absence) has a floor — 14 days — and **no ceiling**. And
`applyAttendanceImport` creates every imported person as `status: "active"`, because an attendance
CSV carries no cancellations. So a gym that imports its history gets every member who ever left
flagged as "at risk", and — once a membership price is set — **priced as monthly revenue at risk**.

**Evidence, gathered myself.** Two passes:

1. Through the UI: imported ~7 months of typed history by CSV, set S$159 in Brand Studio, opened
   Members at 390px: **"38 members need attention · S$6,042/month at risk · 38 members ×
   S$159/month"**, the first rows reading "Last attended 190 days ago, after 1 visit".
2. Through the shipped modules (`retentionSummary` → `revenueAtRisk`), on a realistic two-year
   import — 30 regulars training weekly to yesterday, 60 members who stopped between 60 and 591
   days ago: **"60 members need attention" · `{"members":60,"total":9540,"symbol":"S$"}`.** Every
   one of the 60 is gone; the oldest stopped paying ~20 months ago.

The studio-activity gate that the file's header is proud of does not help: this gym IS recording,
so the absence rule runs — over its whole back catalogue.

**What it costs a gym.** The single most quotable number on the screen — the module's own header
calls it "what gets screenshotted into a pitch and repeated back in a renewal conversation" — is
inflated by every member who left before Jungle arrived. On day one of an import, a coach is
handed dozens of WhatsApp drafts to people who left a year ago.

**What fixing it takes.** A ceiling, and **choosing the number is the work** — which is why it is
§5.1 and not a commit. ~2h once decided.

### 4.2 🔴 At 390px the Builder's class type was a bare chevron · FIXED (`0c94290`)

**What was wrong.** The Builder toolbar holds three dropdowns — class type, style, Jungle presets —
and at 390px each was **~29px wide**: a chevron and a coloured border, no text. The "Class" /
"Style" / "Preset" captions are `!isMobile`, so nothing on a phone said which class type the plan
was under — and that label reaches `class_instances.class_type` through the Runner.

**Evidence.** A screenshot at the branch point (26px tall, ~30px wide, no text), then the same
screen after §1.3 (44px tall, still no text). Cause: the row wraps, but `flex: 1; minWidth: 0` is a
zero-basis item, and a zero-basis item never forces a wrap — it shrinks.

**Fix.** `flex: 1 1 96px; minWidth: 96px` on a phone: the three take the first line (~115px each,
"⚡ CrossFit" / "WOD (Workout…" / "Jungle presets…"), the buttons wrap to the second. Test measures
width; mutation reports `"Class type" is 29px wide at 390px`.

**The lesson worth keeping:** §1.3's own test passed on this screen. Height is not legibility, and
a green tap-size sweep said nothing about a control nobody could read.

### 4.3 🟡 The Floor board printed FINISH with a stage still to come · FIXED (`7e67f70`)

**What was wrong.** `buildFloorLayout` draws at most five stations and marked the last card
**drawn** as the finish. The Builder's "Add stage" has no ceiling, so on a six-stage class — one
click away — the board facing the room printed **FINISH on stage 5** and "clockwise · **5
stations**" under the loop.

**Evidence.** Driven through the shipped UI: Builder → Add stage → Runner → Room TV → Floor at
1280×720.

**Fix.** FINISH marks the class's real last stage; the count reads "showing 5 of 6 stages" when the
board is showing part of the class. Unit + e2e, both mutation-checked.

**Not changed, reported:** see §5.2 — "clockwise", and the board modelling every class as a
station loop.

### 4.4 🟡 "CLASSES RUN 10" for a week nobody taught · FIXED (`2e4eeb5`)

**What was wrong.** The Members header counted every `class_instances` row whose time had passed.
Its own comment excludes the future because "a number that goes up for work not yet done is the
kind of flattering lie this screen exists to avoid" — but "its time has passed" is not "it ran".

**Evidence.** Clock Mon 20 July, usedGym's rules and no history, Publish week → 9 added; edit
"Hyrox Sim" Wed → Tue, publish → 1 added; clock Mon 27 July → **CLASSES RUN 10**. Nothing was
started and nobody was checked in. Nine are published plans whose hour went by; the tenth is the
moved class's old slot, which a re-slot leaves on the books by design.

**Fix.** A check-in is the only record in the product that a class happened (session history
carries no instance id), so the tile counts classes with at least one check-in. A class taught with
nobody checked in goes uncounted — the honest direction to be wrong in. Imported history is
unaffected.

**Not changed, reported:** the re-slot's old occurrence itself stays on the books, empty, forever
(§5.3).

### 4.5 🟢 The near-misses — chased and not reported

- **"last in 190 days ago"** on the at-risk rows read as a typo. It is the idiom ("she was last in
  three days ago"), and `retention.js:75` uses it on purpose.
- **"studio average 61%" above rows whose visible arithmetic is 67.5%** on the class-type return
  panel. The average includes Pilates (4 triers), which the panel excludes from the ranking and
  names as excluded — the average is over every measured trier. Defensible, and it says which types
  are out. Checked by hand: HIIT 14/14, Strength 13/13, Yoga 0/13, Pilates 0/4 → 27/44 = 61%.
- **"HALF GONE BY 2m"** over a curve reading 89% at 1m and 33% at 2m — true: half had gone between
  month 1 and month 2. Session 40's "STILL OVER HALF" fix holds.
- **The cohort table and the curve agree** (9 on the curve + 17 newer = 26 in the table; the
  import's first month excluded and said so).
- **`member.status`** (Active / Paused / Left) — an explicit inline edit with Save and Cancel, the
  row stays visible with a LEFT pill, and Edit is how you reactivate. Honest.
- **`ptClient.status` "ended"** — a status, not erasure (`store.js:1564` says so), reversible.
- **The re-slot rule edit** keeps the rule's `id`, as session 18 designed.
- **Revenue-at-risk at 390px** — no horizontal overflow, the multiplication is on screen, and the
  per-member lines agree with the total. (What it multiplies is §4.1.)
- **The Room TV Plan and Coach boards** at 1280×720 with a class running — read, nothing wrong.
- **`node scripts/audit-store-writers.mjs`** — exit 0, 0 unexplained.
- **"Rename a class type that is on the schedule and in history"** — not a shipped action. See §6.

---

## 5 · Proposals

### 5.1 🔴 NEW — when does "at risk" become "gone"? · ~2h after the decision

§4.1. Options, all cheap to build:

- **(a) A ceiling on rule 2** — e.g. absent more than 60 days is "lapsed", listed separately, and
  **not priced**. The argument for 60: memberships bill monthly, and a member absent two full
  billing cycles who has not been marked Paused has, in almost every case, stopped paying — the
  revenue is not at risk, it is gone. Any number here needs that kind of argument, and it is yours
  to accept or replace.
- **(b) Import-aware**: a member whose LAST check-in is an imported row lapsed before Jungle was
  watching, so is history, not risk. Number-free, but it hides a member imported yesterday who was
  last in 20 days ago — the one a coach most wants to call on day one.
- **(c) Both**: (b) for the revenue figure only, (a) for the list.

**My recommendation is (a) at 60 days**, because it is checkable by an owner in their head and
does not depend on where a row came from. `MIN_TRIERS = 8` is the precedent for writing the
argument down next to the constant.

### 5.2 🟡 NEW — the Floor board calls every class a station loop

"THE LOOP · Next station in 4:56 · clockwise · 5 stations" is drawn under a warm-up → circuit →
strength → recovery → cool-down class where the whole room does the same thing at once.
"Clockwise" is an instruction nothing in the plan sets. This belongs with 5.4 below (how the room
boards draw), not as a copy fix; `display.spec.js` and `smoke.spec.js` use "clockwise · N stations"
as their readiness probe, so the copy change is ~1h once the decision is made.

### 5.3 🟢 NEW — a re-slot's old occurrence stays on the books, empty

After a published class is moved and the week republished, `class_instances` holds both slots. No
screen shows the ghost any more (the grid reads rules; §1.6 stopped the header counting it), but it
syncs to the server, and N4 member links or a future "upcoming classes" list would read it.
`class_instances` is append-only by design, so the fix is a decision: tombstone an unattended
**future** occurrence when its rule moves, or leave it. ~2h after deciding.

### 5.4 🔴 Carried forward, unanswered: how big should the room boards draw? · ~1 day

Session 38 §5.1, sessions 39 and 40 §5.1, **now four sessions old**. Requirement: primary 8–12% of
screen height, secondary ~3%. What ships is 1.0–2.5% on the Plan board. A global floor is not
shippable — the Coach board's stage strip truncates — so the work is per-board. **The decision
needed: should the pre-class Plan board fill the wall the way the timer boards do?** 5.2 is part of
the same decision.

### 5.5 🟡 Carried forward: raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2h after 5.4

Session 38 §5.2, unchanged.

### 5.6 🟡 NEW — the Builder's exercise rows on a phone · ~half a day, a design call

The per-exercise "Move to…" select (18px) and the row's icon buttons are below 44px at 390px
because the rows are ~30px apart. §1.3 opts the select out with `data-dense` rather than make
every row 44px. If the Builder is meant to be used one-handed on a phone, the rows need
redesigning; if it is a desk task on a phone-sized screen, the exemption is right. Your call.

### 5.7 🟢 Carried forward: `parseCsv` and semicolons — **recommend closing it**

Session 37's §5.3, carried by 38, 39 and 40. The brief said to build it only with a reason to
believe a pilot gym's export is `;`-separated. I found none: the go-to-market is Singapore
(`docs/GTM-SINGAPORE.md`), whose Excel locale separates lists with commas, and the named source
system (A18, Mindbody) exports commas. `b266830` already tells a `;` file what is wrong. **Not
built. Propose dropping it from the carried list** unless a pilot says otherwise.

### 5.8 🟢 Carried forward from sessions 39/40

- **"A typical class here is 2 members" from one class** — unchanged and deliberately not taken
  again: it needs a minimum-sessions floor and **choosing that number is the work**.
- Session 40 §5.4 (lazy panels / the wedge) and §5.5 (selects) and §5.7 (flagged-off routes) are
  **done** — §1.1–§1.3.

---

## 6 · What in the session-41 prompt was false, and my own retractions

### ⚠️ §3.1 — the wedge does not reproduce

The brief states it as a fact ("One control leaves the page unable to run ANY `page.evaluate`").
With the modal reached ten times through the sweep and every control pressed by hand outside it,
nothing wedged. It was real to session 40 in whatever its second look was; that code is gone, so
the claim cannot be re-checked, only failed to reproduce.

### ⚠️ §3.4 — "behind a false flag and nothing has ever read them" is two-thirds empty

`templates` and `glossary` have no screen behind the flag at all — there is nothing to read.
`integrations` is the one with something behind it, and what is behind it is the honest
coming-soon panel, not a mock. The dead handler claim was exactly right.

### ⚠️ §4.2 item 3 — "rename a class type that is on the schedule and in history" is not an action

The Exercise Library can **add** and delete a class type, not rename one. The class-type rename
that exists (`renameClassType` in `personaAggregate.js`) renames a coach persona's plan type, which
is not what the schedule or history key on.

### ⚠️ §0.1 — "zero comments on any of them"

Checked for #19 (none). For #15–#18 I relied on their `updated_at` not having moved since session
40 rather than reading each thread — say so rather than claim it.

### 🟢 What the prompt got exactly right

- §0.1's branch table and gate numbers: all five open, `main` at `7508de1`, **1321 / 47** and
  **620 / 53** to the test.
- §0.2's chromium block, verbatim, first try, fifth session running.
- §0.2's ~15-minute full run: **15.7m** on a quiet tree.
- §3.2's diagnosis, and that the fix recovers the descent on eight screens (I measured nine).
- §3.3's inventory: 18 raw selects, `Input` 35px, and that `data-tap` alone does nothing on a select.
- §3.5's condition for building it — and it was not met.

### 🔴 My own retraction: I made a full run unreadable by loading the machine

The mid-session full run (§2) shared four CPUs with worktree specs and a production build I ran in
parallel. Its one failure cannot now be told apart from contention, and I spent time trying to force
a race I could not reproduce. **The worktree protects the files; it does not protect the CPU.** Only
the final clean run, started with nothing else running, counts.

### 🔴 My own retraction: the first measure of §1.3 lied because of my worktree

Run from a git worktree whose `node_modules` was a **symlink** outside the project root, Vite
refused those files with 403, and `mobile.spec.js` reported three console-error failures and two
tap-target failures that did not exist. Replacing the symlink with a hard-linked copy
(`cp -al`) made all of them vanish. Worth knowing for the next session that uses a worktree:
**symlinked `node_modules` is not safe under Vite's `fs.allow`.**

### 🔴 My own retraction: a commit message count

`152234b`'s message first said "mobile.spec 23 passed" for a run that was 22 (the 23rd test belongs
to the next commit). Amended before pushing.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Unchanged from sessions 38, 39 and 40.
2. **Decide §5.1** — the number at which an absent member stops being revenue at risk. It is the
   figure an owner quotes, and today a two-year import makes it up.
3. **Answer the room-board question (§5.4)** — four sessions old now, and §5.2 waits on it.

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
