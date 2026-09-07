# Session 37 — the surfaces nobody had rendered, and what was on them

_2026-09-07. Branch `claude/session-37-unexplored-surfaces-8pas4o`, based on
`claude/session-36-queue-hunt-ty4q49` (PR #15 was still open and unmerged), 14 commits ahead of it._

**Gate at HEAD:** `lint:crash` **0** · **1304 unit** (46 files) · **567 e2e** (48 spec files) ·
14-chunk build, **0 over budget**. StaffApp **332.80 / 360 kB** (7.6% headroom), PTScreens
**38.41 / 41**, RetentionScreen **17.13 / 18**, index **203.06 / 215**. App.jsx is **2,462 lines**.
`node scripts/audit-store-writers.mjs` exits **0** with no red line.

The full e2e suite ran green **first attempt**, twice — once at `3ac08a6` and once at HEAD.

**Seven defects, none of them on the brief, and six were found by driving a screen and looking at
it. Not one was found by a test, and every one was live in the shipped product.** Two were on the
Room TV, which `UI-UX-DIRECTION` §1 ranks above every staff screen and which no test had ever read.

---

## 1 · What shipped, per commit

Every change landed with a test mutated to red and reverted with the inverse edit; each commit
message names its mutation and the counts it produced.

| Commit | What | Gate at that commit |
|---|---|---|
| `d4a7e3e` | **§3.1** `max="60"` removed from the stage-duration input; `stageDurNote` warns instead | 1285 unit |
| `2a630fc` | **§3.2** the orphan 1:1 row sorts last instead of first | 1288 unit |
| `78a056d` | **§3.3** `audit-store-writers.mjs` owns its allowlist; stale-entry check; non-zero exit | 1290 unit |
| `7467e41` | **§3.4** "Add a 1:1 client" moved below the client list (+ `.e2e-scratch` lint ignore) | 1290 unit |
| `1238149` | 🔴 **the Room TV rendered a source comment in body copy** | 1293 unit (46 files) |
| `0c88db3` | **§3.5** the three layout presets, driven and read, at 1280×720 | 553 e2e |
| `d852b8d` | 🔴 **every class opened with START and FOLLOW printed on top of each other** | display.spec 32 |
| `fcdc288` | 🔴 **the shipped build tells every online coach to reconnect** | 1295 unit |
| `100be9f` | 🔴 **two files each held their own copy of the five class times** | 1298 unit |
| `83e2a57` | A20's scope in `DYLAN-QUEUE.md` corrected to name the second file | docs only |
| `a9fb39c` | 🔴 **the check-in panel promised a backup that does not exist** | 1300 unit |
| `3ac08a6` | 🔴 **a class run to its end recorded nothing; the sidebar lost it too** | **full e2e 567 green, first attempt** |
| `b266830` | 🔴 **a semicolon CSV was told to rename its columns** | 1304 unit |

### The one config line I touched, and why

`.e2e-scratch/` is now in the `globalIgnores` of **both** eslint configs (`7467e41`). That
directory is gitignored and is where §4.1 tells a session to put the throwaway Playwright config
it uses to look at rendered screens. One `process.env.JUNGLE_E2E_PORT` in mine turned `lint:crash`
**red** — the gate whose entire meaning is "zero means nothing crashes in the shipped product".

A directory git will never carry cannot reach a user, so linting it can only ever produce a false
red, and a false red on that gate is worse than no gate. `dist` is already ignored for the same
reason. Verified both ways: `npm run lint` reports **236 problems before and after**, so no real
file stopped being linted. Flagged here because CLAUDE.md says no infra changes without asking
Dylan, and this is the closest thing to one in the branch.

---

## 2 · What is still red

**Nothing.** Every gate is green at HEAD and was green at every commit. No test was skipped,
disabled, quarantined or allowlisted.

Two environment notes for the next session, neither of them a product problem:

- 🔴 **The cloud image's Playwright browser is now TWO versions behind the pinned client.**
  `@playwright/test` 1.61.1 wants chromium build **1228** (Chrome 149); `/opt/pw-browsers` ships
  **1194** (Chromium 141). CLAUDE.md still describes the fix as an `executablePath` in a scratch
  config — that no longer works for the *main* suite, which has to run against the committed
  config. `npx playwright install` is refused by the proxy (`403 … host "cdn.playwright.dev"`).
  What worked, and what the whole suite in this session ran on:

  ```bash
  mkdir -p /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64
  ln -sf /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
         /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
  # …and every sibling file in that directory, plus the same for chromium-1194 → chromium-1228/chrome-linux64
  touch /opt/pw-browsers/chromium{,_headless_shell}-1228/{INSTALLATION_COMPLETE,DEPENDENCIES_VALIDATED}
  ```

  Chromium 141 ran all 567 tests with no protocol trouble. **CI is unaffected** — it installs its
  own browsers.

- ⚠️ **`npm run lint` reports 236 problems, not the "a few hundred" CLAUDE.md implies and not the
  211 older docs quote.** Measured at the branch point (`cabf487`) and at HEAD: identical. This
  session added none.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged unless noted

**Merging branches does not let coaches find cover. A17 does.** Nothing in this branch, and
nothing in PR #15, moves any of the items below; they are database state, repo settings and
product decisions, and no test in this repo can tell you whether they are done.

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES.** A `member`-role account reads the whole gym until it runs. Merged is not run |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES.** Until then a cover request is written to one phone and read by nobody |
| **A12 / A13** | Turn on member links (N4), then open one on a phone | **YES.** That code has still never executed against a real Edge Function |
| **A15** | Let Actions open pull requests — one checkbox | No |
| **A16** | Accent legibility: does Jungle bend a gym's accent to make it readable? | A decision |
| **A18** | Mindbody — four facts before anyone signs | A decision |
| **A19** | `health_screen` consent scope — one CHECK constraint | A decision |
| **A20** | Arbitrary class times: yes/no, and grid or list | **YES, on day one.** ⚠️ Its scope was wrong; see below |
| — | Merge PR #15; merge this branch; 10 Dependabot PRs | Not mine to do |

### 🔴 A12/A17 are no longer only about cover — they are about what the product SAYS

Three of this session's findings are the same defect wearing three faces, and all three exist
**because the deployed build has no credentials**:

- the member-link dialog told every coach on perfect wifi to **reconnect and try again**;
- the check-in panel promised attendance was **"synced when online"** when nothing could sync;
- the class a coach taught reached no server either, because there is none.

The first two are reachable with one tap, on the live site, today.

All three are fixed — the product now says what is true. **But the honest sentence is still a
refusal.** A gym on the deployed build cannot publish a member link at all, and its attendance
exists on one phone. A12 and A17 are what change that, and nothing else does.

### 🟥 A20's written scope was wrong, and I corrected it in the queue (`83e2a57`)

A20 said the work "touches `CalendarScreen`, `lib/scheduleInstances.js` and `lib/coachRoster.js`"
and that "there is no other writer of a schedule rule's `slot` anywhere". The second part is true
and was not the whole picture: **`CoachCoverPanel.jsx:40` held a second copy of the same five
times**, and it is the list a coach's *availability* is stated against — `coachesFreeAt` compares a
rule's slot to it. Built to the scope as written, A20 would have shipped a Schedule that accepts
07:00 and an availability grid with no 07:00 column.

The duplicate is consolidated (`100be9f`) into `RULE_SLOTS`, beside `RULE_DAYS`, with a test that
fails if either screen grows its own copy again. **The decision is still yours and is untouched;
the work behind it is smaller and can no longer half-land.**

### Neither open question had been answered

`docs/PT-RECONCILIATION.md` §6 and `DYLAN-QUEUE` A20 were both checked first, as §2.1 instructs —
in `DYLAN-QUEUE.md`, in the PR #15 conversation (which has **zero comments**), and in `git log`
since `c7960f5` (which has exactly one commit, the session 37 prompt). Both are still open, so
§2.2 did not apply: `claude/pt-feature-ideation-dhbyfx` was left alone and D2/D3 were not built.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 A class run to its end recorded nothing, and the sidebar lost it too · FIXED (`3ac08a6`)

**What is wrong.** The Dashboard tells a new gym, in its three-step onboarding, that "the class
history — and every number on this page — writes itself from here." It did not.

Two independent defects:

1. **`saveSession` read its own state out of a stale closure.** The timer effect depends on
   `[view, liveState.playing, player]`, so the `saveSession` its interval captured is the one from
   the render where playback *started* — `idx: 0, elapsed: 0`. `totalElapsed` was therefore 0, the
   ten-second floor threw the class away, and a class run to its natural end was never written.
   `sessionHistory` was stale by the same mechanism.
2. **`navTo` did not save.** It already knew it was leaving the runner — it pauses the stereo and
   stops the clock — and wrote nothing. Nor did the Room TV Plan board's Esc, which exits to the
   Builder exactly as the Back arrow does.

**The evidence.** A two-stage class of seven seconds each, driven to completion: the board read
"Stage 2 of 2", the transport had stopped of its own accord, and `jungle_history` was `[]`. Then
one class, five exits, measured one at a time:

| Exit | Recorded? |
|---|---|
| Back arrow | ✅ one row |
| Escape | ✅ one row |
| **Sidebar → Dashboard** | ❌ nothing |
| **Room TV Plan board → Esc** | ❌ nothing |
| **Natural end (class finishes)** | ❌ nothing |

**What it costs a gym.** The record feeds the Dashboard's Recent Sessions, the coach's streak in
`ProfileModal`, and the server insert in `appendSessionHistory`. What hid it is that the Back arrow
works — so a coach who backs out gets their session and a coach who lets the class end does not,
which is the harder case to notice because it is the *normal* one.

**The fix.** `saveSession` reads the refs the file already had for exactly this; every exit calls
it. That gives it two live callers, so it also needed `savedRunRef` — one record per run — or a
finished-then-closed class would be counted **twice**. Four mutations, each driven and reverted.

### 4.2 🔴 The Room TV rendered a source comment, in body copy, in front of the room · FIXED (`1238149`)

**What is wrong.** `DisplayScreen.jsx` carried

```jsx
<span …>BPM</span>  /* a sub-component: no scaleMult in scope, and the absolute floor is what this needed */
```

A `/* … */` in the **children** of a JSX element is not a comment. It is text.

**The evidence.** The Coach board at 1280×720 rendered that sentence, wrapped over eight lines,
straight through the BPM ring of the Tempo Guide. Screenshot taken before the fix; the string is in
the board's `innerText`.

**What it costs a gym.** It is on the biggest screen in the room, in front of paying members,
on the surface `UI-UX-DIRECTION` §1 ranks above every staff screen. It compiled, `lint:crash` was
0, and 1290 unit and 534 e2e tests passed with it on screen, because nothing had ever read what
the board rendered.

**The fix and the check.** Braces. Plus two sweeps: `src/ui/jsxText.test.js` parses every
non-test `.js`/`.jsx` under `src/` and fails on a comment delimiter surviving into a `JSXText`
node — with its own positive control, running the detector against the shape that shipped and
against the correct `{/* */}` form before trusting it to report zero — and an e2e asserting the
same of all three rendered room boards. **Swept the whole of `src/`: this was the only one.**

### 4.3 🔴 Every class opened with START and FOLLOW printed on top of each other · FIXED (`d852b8d`)

**What is wrong.** The Floor board's station card lays its `START`/`FINISH` badge out in a
`space-between` header row — right edge — and then drew `FOLLOW` at `position:absolute; top:10px;
right:10px`. The same corner.

**The evidence.** Station 1 is the start station **and** the live station the moment a class
begins, so the two collide by **45×10px**, both in the stage's own amber. Read out of the DOM:

```
{ text:"START",  x:368, y:190, w:45, h:18, color:"rgb(10,15,12)",   bg:"rgb(245,158,11)" }
{ text:"FOLLOW", x:365, y:186, w:52, h:14, color:"rgb(245,158,11)", bg:"transparent" }
```

The finish station collides identically on the last stage.

**What it costs a gym.** It is the default state of a default class on the board members read while
they train. No configuration is needed to reach it. What a member sees is a smear.

**The fix and the check.** All three badges are flex siblings in one row, so the collision is
structurally impossible rather than something the next badge has to remember. The check is an
overlap sweep across all three boards — leaf elements with their own text, overlapping >2px on both
axes — with a **known-zero baseline measured before it was written**: Plan and Coach were already
clean, Floor had exactly this one hit.

⚠️ The sweep waits for the transient Plan/Floor/Coach pill to retract first. That control floats
over the stage-journey strip **by design**, and scanning while it is up reports five hits on a
Coach board that is fine.

### 4.4 🔴 The check-in panel promised a backup that does not exist · FIXED (`a9fb39c`)

**What is wrong.** The dialog's footer read "Saved on this device, synced when online",
unconditionally. `CheckInPanel.jsx` does not import `supabase` and never asked whether a server
exists. On the deployed build none does.

**What it costs a gym.** It is the one claim in this product it costs most to get wrong: a coach
who believes attendance is backed up does not worry about the device. It is also the **outlier** —
the 1:1 screen's "Where this lives" card, the persona delete confirmation and the plan-sync banner
all say plainly when data is local-only.

**The fix.** `store.syncEnabled()` is exported and the footer asks it. ⚠️ It is `_synced()`, not
`supabaseEnabled` — a build *with* credentials that has not resolved a gym syncs nothing either,
and a screen keyed on the env var alone would make the same promise one layer further in.

### 4.5 🔴 The shipped build tells every online coach to reconnect · FIXED (`fcdc288`)

**What is wrong.** `publishSummary` returned `reason: "offline-only"` when `supabaseEnabled` is
false — and that is a **build-time constant** that never consults the network. The member-link
dialog therefore answered "Not available offline · Member links are created by your studio's
server. Reconnect and try again."

**The evidence.** With the dialog open, `navigator.onLine` is `true`. That precondition is asserted
inside the new test, in the same run, so the claim is about a misdiagnosis rather than about copy.
The "Link" button on the Class Runner is unconditional, so every coach can reach it.

**What it costs a gym.** It is the deployed product's *only* answer today. The coach reconnects,
retries, and gets it again forever. A remedy that cannot work is worse than saying there is nothing
to do from here.

**The fix.** Two failures, two names. `not-configured` gets honest copy; `offline` keeps the
original sentence for the case it actually fits (a studio that *has* a server and a device that
cannot see it — a branch nothing used to reach). ⚠️ `not-configured` wins when both are true.

The old unit test was called *"says offline rather than failing obscurely when the studio has no
server"* — the defect written down as a name.

### 4.6 🔴 Two files each held their own copy of the five class times · FIXED (`100be9f`)

Covered in §3 above. The part that matters as a *finding*: **no behavioural test could have caught
it**, because the two arrays are identical today — there is no failing case to write. The only
assertion that bites is about the source, so that is what the test asserts.

### 4.7 🔴 A semicolon CSV was told to rename its columns · FIXED (`b266830`)

**What is wrong.** Excel writes `;`-separated CSVs in most of Europe. Such a file parses as one
column called `Name;Date`, and the header check answered *"No member column found. Expected one
of: member, member name, name, client, …"* — twelve suggestions, none of which can fix a
separator.

**What it costs a gym.** It is the first thing a studio evaluating Jungle does with its old data,
and the product sends them down a path that cannot work.

**The fix.** The message names the separator and the remedy. ⚠️ **Not a parser change** — accepting
semicolons is a different decision, and a delimiter guessed wrong would split member names
containing the guess. The file is still refused; only the sentence changed. The guard requires two
non-empty parts after the split, so a genuine one-column file is not accused of anything.

### 4.8 🟢 §3.1–§3.5, all five verified against the code and all five real

None of the five named in the brief turned out to be false. Notes on two:

- **§3.1** — I wrote the long-stage warning at a **one-hour** threshold first, and the e2e caught
  it firing on **75 minutes**, the exact value session 36 refused to clamp because a studio really
  does programme a 75-minute open-gym block. A warning that cries on a legitimate value is the same
  defect as a ceiling that lies, one screen later. The threshold is two hours, which still catches
  every extra-digit slip (30→300, 45→450, 60→600, 999).
- **§3.3** — the allowlist moved into the script *and* gained the opposite check: `audit.staleSeams`
  names any entry the sweep no longer finds. An allowlist rots in that direction silently, and a
  parser that stopped seeing anything would otherwise report success.

### 4.9 🟢 The near-misses — things I checked that were NOT defects

Recorded because the next session will look at the same places.

- **The "Coaches" nav entry opens personas, not the cover roster.** Looks like a day-one trap; it
  is a documented decision. `CoachCoverPanel.jsx`'s header explains that this product already has
  three things called "coaches" and that the roster deliberately adds no fourth nav entry. Reading
  *why* is what led to the second `SLOTS` array, so the dead end was worth walking.
- **`ELAPSED 0:00` on a class at stage 5 of 5.** My fixture's fault — I never started the clock.
- **The CSV import's other six near-misses are all answered correctly**: an unknown header, an
  unparseable date, no header row, a header with no rows, an empty file (the button simply stays
  disabled), and a BOM + CRLF file, which imports cleanly. Only the delimiter case misdiagnosed.
- **A duplicate session record.** I predicted `saveSession` would double-write on a
  finished-then-closed class *before* the fix, and drove it: it did not, because the natural-end
  call was already failing silently. The duplicate only became possible once §4.1 was fixed —
  which is why `savedRunRef` landed in the same commit.
- **The Plan and Floor boards leave the bottom half of a 720p wall empty**, and the Plan board's
  largest type is ~2.8% of height. That is not a defect — `display.spec.js` explicitly exempts the
  Plan board from the 10-foot rule as a pre-class overview — but see §5.2.

### 4.10 🟢 The e2e flakes did not appear, again

The full suite ran **567 passed, first attempt**, twice — once mid-session and once at HEAD —
plus perhaps twenty single-spec runs, all green. Session 36 saw six clean full runs. That is
**eight consecutive clean full runs across two sessions**, which is data and not a fix — the mount flake and the slow-render
timeout are recorded in CLAUDE.md as intermittent, and neither has been seen since session 33.
The next session that does see one has the best chance anyone has had at a root cause.

---

## 5 · Proposals

### 5.1 🔴 Answer A20 — it is now a one-array change · ~1.5 days if "keep the grid"

Unchanged as a decision, cheaper as work, and it can no longer half-land. See §3.

### 5.2 🟡 The room boards use half of a 720p wall · ~1 day

Measured, not guessed. On a 1280×720 wall the Plan board's content ends at y≈330 and the Floor
board's at y≈350; the bottom **half** of the screen is empty, and the Plan board's largest type is
~2.8% of height where the timer boards hold 8.9–15.6%.

`display.spec.js` exempts Plan from the 10-foot rule because it has no timer, and that reasoning is
sound as far as it goes — but the Plan board is what a member *walks in and reads*, and 11px
exercise names on a wall at 8 metres are not read by anyone. The `TV_MIN_PX = 11` floor is the
value the boards happen to render, which makes that test a description rather than a requirement.

**This is a design decision, not a defect, so it is written up rather than taken.** The question is
whether the pre-class boards should fill the wall the way the timer boards do.

### 5.3 🟡 Should `parseCsv` accept semicolons? · half a day

§4.7 fixed the message and deliberately not the parser. Sniffing the delimiter is a real
improvement for European gyms and a real risk — a delimiter guessed wrong splits member names.
A safe version exists: sniff only when the comma-parse yields exactly one column, which is the
same condition the new message already uses. Worth doing if a pilot gym's export is `;`-separated;
not worth doing speculatively.

### 5.4 🟢 The "Where this lives" card is 200px of a 390px fold · ~2 hours

Now that §3.4 moved the add panel below the list, the 1:1 client list starts at y≈630 on a phone —
because two explanatory cards sit above it. The first is a permanent honesty notice a coach reads
once and scrolls past every day thereafter. Collapsing it after first read (or moving it under the
list, as the add panel just went) would put the daily read at the top. It is the same argument
§3.4 makes and the same argument session 35 made on Members, one card further along.

### 5.5 🟢 Give the coach-availability grid a test that spans both screens · ~3 hours

§4.6 removed the drift by construction, but nothing yet asserts that a class scheduled at a time
and a coach free at that time actually *meet* — `coachesFreeAt` is unit-tested against its own
fixtures, not against what the two screens render. One e2e that schedules a class, marks a coach
free in that slot, and reads the cover board would pin the seam end to end.

---

## 6 · What in the session-37 prompt, and in this repo's docs, was false

Every session since 26 has found something. Three here, plus two of my own.

### ⚠️ §3.5's "no test has ever selected one" is not quite true

`mountWrites.spec.js:132` clicks **"Minimal"**. It asserts only that the choice reaches
`localStorage` and says nothing whatever about the board, so a preset that rendered a blank wall
would have passed it — the *substance* of the finding stands, and Full and Timer Only had genuinely
never been selected by anything. But the sentence as written is wrong, and I would have missed the
existing test if I had taken it at face value.

### ⚠️ §4.2.2's "nothing drives PUBLISHING" is half true

`memberSummary.spec.js` already had a **"the coach's side of the link"** block with three tests:
the dialog opens and reports the local truth, Escape closes it, and it mints exactly one occurrence
and reuses it on reopen.

What is genuinely undriven is the **ready** state, the `not-stored` warning and the Copy button —
and that is **structural, not an oversight**: those need `supabase.functions.invoke` to return, and
a credential-less build has no client to intercept. The member's half can be stubbed with
`page.route` because `fetchSummary` uses plain `fetch`; the coach's half cannot. Those three paths
are covered as units in `summaryApi.test.js`. Saying so here rather than papering over it.

### ⚠️ CLAUDE.md's advisory-lint figure and A20's scope

`npm run lint` is **236** problems, not the 211 older docs quote; measured identical at the branch
point and at HEAD. And A20's file list was missing `CoachCoverPanel.jsx` — §3 above, corrected in
the queue itself.

### 🔴 My own retraction: the long-stage threshold

I wrote §3.1's warning at **one hour** and it fired on a legitimate 75-minute open-gym block —
the exact value session 36's commit message says it refused to clamp. I had read that comment
and chose the threshold anyway. The e2e caught it, not the reading; it is at two hours now, and
the test that catches it is in the file with a 🔴 next to it. Recording this because "a warning
that cries on a legitimate value is the same defect as a ceiling that lies" is the lesson, and I
committed the first version of it.

### 🔴 My own near-miss: I nearly reported a duplicate-record bug that did not exist

Before fixing §4.1 I predicted that a class ending naturally and then being closed would write
**two** records, because `saveSession` had two callers. I drove it: one record, not two. The reason
is that the natural-end call was already failing silently — the very defect I was about to fix. The
duplicate only became reachable *after* the fix, which is why the guard shipped in the same commit.
Had I written the prediction up without driving it, it would have been a confident wrong finding.

### 🟢 What the prompt got exactly right

- **§4.2.1 ranking the Room TV first.** Two of the seven findings were on it, both member-facing,
  both invisible to every existing test.
- **§4.1's method, step by step.** Six findings came from seed → render → *read* → check the store.
  The two that came closest to being missed (the JSX comment, the badge collision) were both
  invisible to every assertion in the repo and obvious in a screenshot.
- **§4.1.5, "prove it is reachable through the shipped UI".** It is what turned the member-link and
  check-in copy from "wrong string" into "wrong string every coach sees today", and it is what
  stopped the Coaches/personas confusion from becoming a finding.
- **§0.2's warning that the prompt itself would have rotted.** Two of its claims had.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Three of this session's findings exist only because the
   deployed build has no server; the product now tells the truth about that, and the truth is still
   a refusal.
2. **Answer A20.** It is a decision, it blocks a gym on day one, and it is now a one-array change.
3. **Merge PR #15, then this branch.** Neither has been merged; `main` is five sessions stale and
   nothing merges to it on its own.
