# Jungle — Session Handoff

_Last updated: 2026-09-07 (session 38)_

> 📁 **Sessions 6–36 (plus 28-PT) are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 38 — the two boards a member reads, and the seams between screens

> Written in full to `SESSION-38-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

_2026-09-07. Branch `claude/session-38-two-boards-seams-tx19ce`, based on
`claude/session-37-unexplored-surfaces-8pas4o` (both PR #15 and PR #16 were still open and
unmerged, and `main` was still `7508de1`). 10 commits ahead of it._

Position confirmed by gate, not by log: `npm test` reported **1304 unit (46 files)** and
`npx playwright test --list` **567 in 48 files** at the branch point, exactly as the brief said.

**Everything in §3 of the brief landed. Then §4 ran and found six more things, five of which a
gym would have felt.** Three of them were one defect wearing three faces. The largest is that "Smart Distribute" deleted a coach's written class on
one click and reported it as a gain.

---

## 1 · What shipped, per commit

| # | Commit | What |
|---|---|---|
| 1 | `beea8bc` | **The 1:1 screen's "Where this lives" card collapses.** §3.1 |
| 2 | `815b177` | **The Schedule and the availability grid are driven against each other.** §3.2 |
| 3 | `4687f85` | **`TV_MIN_PX` says what it is; the Plan board gets a rule.** §3.3 + §3.4 |
| 4 | `5fb7235` | **The 1:1 card stops promising a roster backup that does not exist.** |
| 5 | `6c45e41` | **Removing a stage is undoable.** |
| 6 | `58e3a1b` | **Smart Distribute is undoable, and says what it did.** |
| 7 | `e1cb9c4` | **The Brand Studio stops selling a contrast ratio as an 8-metre read.** |
| 8 | `72b7867` | **The Build dialog's two doors ask before replacing a class, and the stored class type follows the stages.** |
| 9 | `24ee4d5` | **“Keep Current” keeps the class type as well as the class.** |

Every one carries its mutation in its commit message: the source was broken, the test confirmed
red, the change reverted with the inverse edit, and `grep -rn MUTATION src/ e2e/` is clean at
`HEAD` (the one match is a pre-existing comment in `coachAbsence.test.js`).

### 1.1 `beea8bc` — the honesty notice cost 211px of every day

Measured at 390×844 with two clients on the roster: the card was **211px** of the fold, the client
list started at **y=635**, and its last row ended at **y=911** — 67px past an iPhone 14's viewport.
A coach saw one row of the thing they opened the screen for, under a card they read once.

Collapsed: card **86px**, list top **y=511**, list bottom **y=787** — the whole list inside the fold.

It **collapses and is never dismissed.** This is the only sentence in the product saying 1:1 data
lives on one device, and `SYNC_DISMISS_KEY` in App.jsx already argues why a warning of that class
gets no "never show again". The collapsed state states both claims in one line. The default is
derived from the roster rather than a new storage key — `setupProgress.js`'s "once, without a key
to migrate and get wrong".

Verified at: lint:crash 0 · 1304 unit · 138 e2e across pt/mobile/keyboard/screens/responsive.

### 1.2 `815b177` — the seam between two screens that both name a time

Session 37 removed the duplicated `SLOTS` arrays by construction and pinned it **at the source**.
That test cannot see a screen that renders the shared list differently. Two e2e tests now drive the
Add-class dialog and the availability grid against each other, taking the slot out of the `<select>`
at run time and never typing a time literal, plus a control at a different slot.

**The proof the gap was real:** re-introducing the drift as `RULE_SLOTS.slice(0, -1)` in
`CoachCoverPanel.jsx` leaves all **1304 unit tests** and all 45 `scheduleInstances` tests green. The
new e2e is the only thing in the repo that fails.

### 1.3 `4687f85` — what the floor actually is

The brief asked what the floor should be for a wall read at 8 m. **The answer is that no px number
can be that floor**, and the repo already had the requirement in a unit that can carry it.

    720p wall    11px = 1.53% of screen height
   1080p wall    11px = 1.02%
      4K wall    11px = 0.51%   (for anything not on tvFont)

The Fable spec (`Stress-Test Verdict & Architecture Spec` §3, P2): *"legible at 8 meters … primary
element ~8–12% of screen height, secondary ~3%"*. So `TV_MIN_PX` is under half the spec's own
**secondary** minimum, and not even a constant fraction — which produces an inversion:

🔴 **The same board is smaller in the room on the better projector.** At 720p the Plan board's
exercise names are floored up to 11px = 1.53% of the wall; at 1080p they render at their designed
13px = 1.20%. A studio that upgrades its projector gets less readable exercise names.

Shipped: the constant's comment says what it is (a collapse guard) with the numbers; `display.spec.js`
**imports** it instead of holding a third and fourth copy; the Plan board's siblings that had been
left as px literals moved onto `tvFont` at the same base sizes (byte-identical at 720p and 1080p,
divergent only above the reference); and §3.4's exemption is now a stated rule — the Plan board has
no timer so the 8–12% band cannot be asserted of it, and it is **not** exempt from holding its share
of the wall, which a new e2e asserts at 1080p against 4K.

🔴 **Three elements cannot be fixed yet and the floor is why.** The class summary and each stage's
duration are 12px literals; `tvFont(12)` on a 720p wall comes out at 11px because `TV_MIN_PX` floors
it there, so converting them to win 4K would cost a pixel at 720p on the board this is all about.
Every base below 16 has the same problem. They are named in `KNOWN_LITERAL` in the sweep, checked in
**both** directions — an entry that stops drifting fails too.

### 1.4–1.9

Covered as findings in §4 below, which is where they were found.

---

## 2 · What is still red

**Nothing.** At `HEAD`:

```
lint:crash          0
unit                1304 passed (46 files)      unchanged — every new test is e2e
e2e                 590 passed (48 files)        was 567; +23
build               14 chunks
size                0 over budget
audit-store-writers exit 0 · 0 unexplained
```

Sizes moved only where expected: `PTScreens` 38.41 → **39.31 / 41 kB**, `StaffApp` 332.80 → **333.00 / 360**,
`index` **203.06 / 215**, `BrandStudioScreen` 30.03 → **30.16 / 32**. **No ceiling was raised.**

⚠️ One thing to know about the runs. An intermediate full run reported **566 passed, 1 failed** —
`mobile.spec.js › 1:1 Clients — every marked control is thumb-sized`. That was **my own change**, not
a flake: forcing the collapsed card's header to 44px to satisfy the tap sweep grew the OPEN card by
23px, which pushed the empty screen's "Go to Members" from y=748 to y=771, under the bottom nav. The
sweep caught it, the card was restructured so the open state costs nothing, and it is green. Recorded
because a red count in a log is worth explaining rather than leaving.

---

## 3 · 🟥 Dylan's list — restated in full, unchanged

Nothing here moved this session and nothing here can be moved from inside the app. `DYLAN-QUEUE.md`,
both PR conversations and `git log` were checked at the start: **neither open decision has been
answered.**

| # | What | Blocks a user-visible outcome? |
|---|---|---|
| **A14** | Run `0010_staff_read_boundary.sql` | **YES** |
| **A17** | Run `0011_coach_cover.sql` **and** put Supabase credentials in the build | **YES** |
| **A12 / A13** | Turn on member links (N4) and open one on a phone | **YES** |
| **A20** | Arbitrary class times — now a one-array change, still a decision | **YES, on day one** |
| **A15 / A16 / A18 / A19** | Actions PR checkbox · accent legibility · Mindbody · consent scope | Mostly decisions |

**In words: merging branches does not let coaches find cover; A17 does.** Merging PR #15, PR #16 and
this branch changes nothing about whether a coach can be reached, because the `cover_requests` table
does not exist and the build has no credentials.

**Session 37's sharper version still holds, and this session added to it.** Three of session 37's
seven findings existed only because the deployed build has no server. This session found a **fourth**
— the 1:1 screen was telling every coach their member roster "syncs as it always has" — and a fifth
of a different kind, the Brand Studio selling contrast as legibility. The product now tells the truth
about all of them, and the truth is still a refusal.

**Two decisions still open, in writing since 2026-09-07:**

- `docs/PT-RECONCILIATION.md` §6 — second lens, or a PT product? Nothing was built on either PT
  branch this session, per §2.2 of the brief. `claude/pt-feature-ideation-dhbyfx` drifts one commit
  further behind every time `store.js` changes.
- `DYLAN-QUEUE.md` A20 — arbitrary class times: yes/no, and grid or list.

Also unchanged: **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps. None were
touched.

---

## 4 · Findings, ranked by what they cost a gym

### 4.1 🔴 Smart Distribute deleted the coach's class and called it 11 exercises gained · FIXED (`58e3a1b`)

**What is wrong.** `distributeLibraryExercises` maps every stage to `{...stage, exercises}`. The
coach's own movements are not merged, appended to, or spared when the stage already has something
in it. They are replaced.

**The evidence.** A hand-authored class, driven through the shipped button:

```
before   Warm-Up: ["MY OWN WARMUP"]      The Lift: ["MY OWN LIFT"]
after    Warm-Up: [Jump Rope Drill, PVC Overhead Squat, +3]
         The Lift: [Thruster, Pull-Up (Kipping), +4]
toast    "⚡ 11 exercises across 2 stages"
undo     none
```

**What it costs a gym.** One click, in the Builder's main toolbar, on a control whose whole promise
is convenience. The sentence is what makes it worse than a plain data loss: it describes a **gain**,
so a coach who has just lost their Tuesday reads a number going up.

🔴 **The Builder already knew how to tell.** Forty lines above the button:

```js
const hasCustomExercises = s => (s.exercises||[]).some(e => !e.source || e.source !== "library");
const anyCustom = stages.some(hasCustomExercises);
```

`handleClassChange` and the style picker both consult it and raise a "replace your stages?" confirm.
The button between those two pickers consulted neither. **This was never a rule nobody had — it is a
rule this component holds and applied to two of its three overwriting controls.**

**The fix.** An undo rather than that confirm, because the pickers also retype the class and rebuild
its stages while Distribute keeps the coach's stages, names and durations. `Replaced 2 exercises with
11 from the library, across 2 stages [Undo]`. Filling **empty** stages still reads as a gain and
offers no undo — `handleNewClass`'s rule that "an undo offering to restore an empty plan is noise".
The bespoke `distributeToast` is gone; it rendered `pointerEvents:"none"` so it could never have
carried an Undo whatever the copy said, and its other three callers moved to the shared `toast()`.

### 4.2 🔴 Two more doors replaced the class, and one of them mislabelled it into the database · FIXED (`72b7867`)

**What is wrong.** `applyTemplate` replaces the whole stage list. `handleClassChange` checked
`anyCustom` first and raised a "replace your stages?" bar. **Three other callers went straight past
it**: `runSmartBuild`'s fallback, every tile under "Or insert a template" in `SmartBuildDialog`, and
the prompt's own Apply button (which should).

⚠️ **The fallback is not an edge case — it is the only reachable Build-for-me path on the shipped
build.** The branch above it needs `supabaseEnabled && supabase` to invoke a `smart-build` edge
function, and the deployed build has neither, so pressing **Build** always lands in
`smartPickClass` → `applyTemplate`.

**The evidence.** Driven on the same hand-authored class as §4.1:

```
tile "Yoga"     → 5-stage Yoga template   confirm: none   undo: none
type + "Build"  → 5-stage Yoga template   confirm: none   undo: none
the class PICKER, for comparison         → confirm shown, stages untouched
```

🔴 **And the label did not follow the stages.** `classChoice` was written by `handleClassChange` and
by nothing else, so both dialog doors left a five-stage Yoga class stored as
`{classType:"crossfit", subType:"wod"}`. That is not cosmetic. It reaches `LiveScreen` as
`classType`, which `ensureClassInstance` writes to **`class_instances.class_type`** — so a Yoga class
run after Build-for-me entered the gym's own attendance history under the wrong type, which is the
input `classTypeRetention.js` and the Analytics screen read. It also rides `handleExportClass` into
the saved `.json`, and it is what Smart Distribute reads, so the two buttons beside each other
disagreed about what class was on screen.

**What it costs a gym.** A coach loses a written class with no way back, and the gym's retention
numbers quietly attribute that class to the wrong type for ever — a wrong number that no screen can
show as wrong.

**The fix.** The guard moves to the choke-point every caller has to pass through, with `confirmed`
as the Apply button's way of saying it has already asked. This is CLAUDE.md's own
`parqStatus`/`blocksLoad` rule in another costume: *a gate that lives only in one caller is one the
next caller walks through.* `applyTemplate` also sets `classChoice` itself, which is idempotent for
the picker path and corrective for the other three, and the undo restores **both** — putting the
stages back under the new label would be a different class, not the coach's one back.

### 4.3 🔴 "Keep Current" kept the class and renamed it anyway · FIXED (`24ee4d5`)

**What is wrong.** The third instance of §4.1/§4.2's defect, and the worst of them, because it
arrives through the one control that exists to decline.

Both pickers set `classChoice` **before** raising the "replace your stages?" bar — deliberately, so
the `<select>` the coach just moved does not snap back while the bar underneath asks about it.
`Keep Current` was `setTemplatePrompt(null)` and nothing else.

**The evidence.** A CrossFit draft, driven:

```
pick "Yoga" → press "Keep Current"
  stages   MY OWN WARMUP             kept
  header   "Yoga · target RPE 7–8"   🔴
  stored   classChoice.classType: "yoga"
```

**What it costs a gym.** The same route to the database as §4.2 — `classChoice` reaches
`LiveScreen`, `ensureClassInstance` writes it to `class_instances.class_type`, and
`classTypeRetention.js` reads it there. A coach who **declined** a class-type change would have had
every class they ran afterwards attributed to the type they refused.

**The fix.** The prompt carries `revertTo` — what the picker overwrote — and Keep Current puts it
back. It is null for the two Build-dialog doors, which never set `classChoice`, so this is a no-op
for them.

⚠️ **And two of my own control tests were hardened in the same commit**, for a reason that belongs
in this list rather than in a footnote. They asserted a toast across three separate calls:
`toContainText` to prove it rendered, then `not.toContainText("Replaced")` and `toHaveCount(0)` on
the Undo button. A toast with no undo lives 2500ms, so **both negatives are satisfied by the toast
having expired** — CLAUDE.md's `toHaveCount(0)` trap in its "already gone" form, and it would have
gone green on exactly the regression those tests exist to catch. One `innerText()` read now, three
assertions on one snapshot.

### 4.4 🔴 Removing a stage took its exercises with it, on one click, with no way back · FIXED (`6c45e41`)

**What is wrong.** `handleRemoveStage` was one line:

```js
const handleRemoveStage = i => setStages(ss => ss.filter((_,j)=>j!==i));
```

No confirm, no undo, no toast. Written straight through to `jungle_draft_class` and confirmed by a
reload.

**What it costs a gym.** It was **the only destructive action in this product with no guard of any
kind.** The Schedule's class removal has an undo, the Exercise Library's has an undo, the 1:1 session
removal has an undo, the coach roster has an in-app confirm, the coach cascade keeps both, and
erasing a 1:1 record uses `window.confirm`. Thirty lines below this one, `handleNewClass` carries a
paragraph on why destroying **one draft** earns an undo.

🔴 **How it survived, which is worth more than the fix.** `e2e/destructive.spec.js` opens with
"REGRESSION §1.3 — every destructive action, reversed" and enumerates the ones somebody thought of.
A stage removal was never on the list, so the claim was true of the list and not of the product. A
stale comment helped: `const { toast } = useToast()` was annotated *"used by handleNewClass, which is
this component's only destructive action"* — accurate when written, and it reads as permission not to
look. Both corrected in place.

### 4.5 🔴 The one sentence on the 1:1 screen that promised a backup was the false one · FIXED (`5fb7235`)

**What is wrong.** The "Where this lives" card ended with *"Your member roster is unaffected — it
syncs as it always has."* `saveMembers` writes localStorage and then returns before reaching
`_bgUpsertDelta` whenever `_synced()` is false, and on the shipped build it always is.

**What it costs a gym.** A coach who reads the whole card comes away believing 1:1 data is at risk
and the roster is safe. The rest of that card is this product's **model** of saying the opposite
plainly — session 37 cited it as the house standard when fixing the check-in footer. Same class of
defect, one screen along and one paragraph away from the sentence the earlier fix was modelled on.
The first sentence had the same shape: *"The server has no table for them yet"* tells a gym with no
server that it has one.

**The fix.** Both branch on `store.syncEnabled()`. ⚠️ Not `supabaseEnabled` — session 37's note: a
build with credentials that has not resolved a gym syncs nothing either.

**The sweep this came from** (§4.2.1 of the brief): every sentence in the JSX claiming syncing,
backups, sharing or another device, read against `_synced()`. The rest came back clean.

### 4.6 🔴 The Brand Studio sold a contrast ratio as a wall you can read from eight metres · FIXED (`e1cb9c4`)

**What is wrong.** The accessibility panel ticked green and said *"Member-visible text meets WCAG AA
— legible at room-display size"*, with a note that passing *"keeps every branded member surface —
including the room TV read at 8 m — legible"*. **WCAG AA is a contrast ratio.** It says nothing about
type size, and size is the half that decides whether a wall reads from the floor.

**What it costs a gym.** It is on the screen where an owner decides what this product is worth, and
the gap is not hypothetical — §4.5 below measures it. A gym can pass every row in that panel (all
three shipped presets do) and still have a board nobody at the back can read.

**The fix.** Say what contrast covers and name the other half. ⚠️ `brandAudit.js`'s own header records
this exact sentence being too confident **once before** — until session 29 the audit was five rows
wide and presented that as "member-visible text" while a nine-defect sweep passed through it. Same
sentence, the other axis. **A sentence already caught over-claiming once is where to look second.**

### 4.7 🟡 The Plan board's largest type is 2.4% of a wall the spec wants at 3% minimum

Measured, on the class that seeds `display.spec.js`, at two resolutions:

| board | content ends at | largest element | smallest |
|---|---|---|---|
| **Plan** @1280×720 | 273 / 720 | 2.5% ("Sunrise Strength") | 1.53% |
| **Plan** @1920×1080 | 290 / 1080 | 2.41% | 1.02% |
| **Floor** @1280×720 | 336 / 720 | 9.31% (timer) | 1.53% |
| **Coach** @1280×720 | 704 / 720 | 8.89% (timer) | 1.53% |

The two timer boards clear the primary band. The Plan board — the one a **member walks in and
reads** — has nothing on it that reaches even the spec's **secondary** floor, and leaves 62% of the
wall empty. This is §5.1 below rather than a defect taken here, because closing it has a measured
cost.

### 4.8 🟢 The near-misses — things I chased that were not defects

Recorded because the next session will look at the same places.

- **I read a screenshot wrong and nearly reported it.** The 1:1 card's expanded paragraphs looked
  green in the PNG while the collapsed line looked grey. Measured: both are `rgb(138,162,148)`,
  which is `--muted`, which is a desaturated green in Canopy. Nothing to fix. **Take the
  screenshot, then measure the thing the screenshot made you suspicious of.**
- **"0 SESSIONS THIS WEEK" beside "RECENT SESSIONS · yesterday"** on a day-two Dashboard. My fixture
  put the class on a Sunday and the suite ran on a Monday; the week starts Monday. My fixture's
  fault, not the product's.
- **`class_schedule_rules.fill` has no writer** and is sent as `0` on every sync. Already documented
  at `App.jsx:640` — "Nothing in the product ever SETS `fill`" — and removing it would break the
  fixed-column upsert. Not a finding.
- **`CoachCoverPanel`'s local-only notice** already branches three ways (no credentials / credentials
  but no coach tables / connected), and `PersonasScreen`'s plan-sync banner only renders when there
  is a sync error to have, which needs a server. Both clean.
- **Day two read honestly on all four screens.** Dashboard, Analytics, Members and Schedule were
  seeded with yesterday's class, a member who did not come back, a coach with stated availability and
  a real attendance history. Analytics refuses every number it cannot support and says why; Members'
  "Who's slipping away" correctly reports 0 rather than inventing one; the Schedule's roster panel
  says where the data lives. Nothing wrong on any of them.
- **`node scripts/audit-store-writers.mjs` exits 0** with `5 patch-shaped writers · 3 accepted keys
  with no writer and explained · 0 unexplained`. Its three permanent seams still resolve.

### 4.9 🟢 The e2e flakes did not appear — and one lesson about how I ran the suite

**No flake of any kind, in any run, plus perhaps forty single-spec runs.** With session 36's six
clean full runs and session 37's two, and this session's, the mount flake and the slow-render
timeout have now not been seen **since session 33**.

**Saying so plainly, as the brief asked:** the CLAUDE.md entries describing them are supported by
nothing anyone has observed in five sessions. That is not proof they are fixed — nobody found a root
cause — so the entry now says to treat them as folklore until something reproduces them rather than
spending a session defending against them. The next session that DOES see one still has the best
chance anyone has had.

⚠️ **Two of my three full runs were worthless and it was my fault, not the suite's.** Playwright
loads the spec files at start but the app is served by the dev server with HMR, so **editing `src/`
during a full run means later specs run new code against old tests**. My first run reported
`566 passed / 1 failed` for exactly that reason — the failing test was real (§2) but it failed
because a change landed mid-run — and my second I discarded unread for the same reason even though
it exited 0. Only a run started on a quiet tree means anything. Worth adding to the shell notes if
it catches anyone else.

---

## 5 · Proposals

### 5.1 🔴 Decide how big the room boards draw · ~1 day, and it is measured rather than guessed

This is session 37's §5.2 with the arithmetic done and a prototype driven.

**The requirement exists and is written down:** primary 8–12% of screen height, secondary ~3%
(Fable §3, P2). **What ships is 1.0–2.5%** on the Plan board and 1.0–1.8% for everything on the other
two that is not the timer.

**I prototyped the obvious fix** — a 3% floor keyed to viewport height instead of a px constant — and
rendered all three boards at 1280×720:

- **Plan**: much better. Exercise names and stage names become genuinely readable; content ends at
  323/720 with room to spare. The screenshots are the strongest argument in this document.
- **Floor**: fine. Badges and station names legible, nothing truncated.
- **Coach**: 🔴 **breaks.** The stage-journey strip truncates to `• War… ▶ • Stren… ▶ • Circui…`.

So a global floor is **not** shippable, and that is the finding: the requirement has to be met by the
boards' own layout, not by `clamp()`. The Plan board has 62% of the wall spare and is the one a member
reads, so it is where the work belongs and where it is worth most.

**The decision this needs from you:** should the pre-class Plan board fill the wall the way the timer
boards do? If yes, it is a layout pass on one file (`OverviewDisplayScreen.jsx`) with the numbers
above as the target, and `display.spec.js` already has the sweep to hold it. If no, say so and the
exemption becomes a product statement rather than a test comment.

### 5.2 🟡 Raise `TV_MIN_PX` so the floor stops blocking its own fix · ~2 hours after 5.1

Three elements on the Plan board are stuck as px literals because `tvFont(12)` renders at 11px on a
720p wall — converting them would cost a pixel where it matters most. Raising the floor to 12 makes
every room-facing literal convertible with nothing regressing anywhere, at the cost of finding and
lifting the three remaining sub-12px raw values across the three boards. **Worth doing as part of 5.1,
not before it** — the right floor falls out of that decision.

### 5.3 🟡 `parseCsv` and semicolons · half a day — session 37's, unchanged and still open

Sniff the delimiter only when the comma-parse yields exactly one column, which is the condition the
message already uses. Worth doing if a pilot gym's export is `;`-separated; not worth doing
speculatively.

### 5.4 🟢 Sweep the remaining destructive actions the way §4.2 was found · ~3 hours

`destructive.spec.js` enumerates what somebody thought of, and two controls were missing from it
this session. A sweep that walks every screen, presses every control that writes, and asserts the
store changed **and** something offered it back would find the next one instead of waiting for
someone to walk that screen. It needs a positive control — the six actions already guarded.

---

## 6 · What in the session-38 prompt, and in this repo's docs, was false

Every session since 26 has found something. Three here, plus five of my own.

### ⚠️ §4.2.3's "nothing has driven the Exercise Library modal end to end" is wrong

It is one of the better-covered surfaces in the repo. `library.spec.js` drives adding a movement to
the selected stage and asserts the store; `libraryEdit.spec.js` covers editing (as a v2 delta, not a
snapshot), an edit reverted by hand removing the override row, **delete with undo**, the undo
surviving a reload, "Reset to Defaults" asking in its own overlay and being refusable, and the search
box; `libraryReorder.spec.js` covers dragging and refuses to drag a filtered list. I went looking on
the brief's word and found the tests instead. **Grepping first is not optional** — session 37 said the
same thing about two of its own claims.

### ⚠️ §3.2 is right about the seam and wrong about which half was undriven

"`coachesFreeAt` is unit-tested against its own fixtures, not against what the two screens render" —
the **availability grid** is driven: `coachCover.spec.js:151` clicks "Mara free Mon 06:00" and asserts
the store. What had never been driven is the **Add-class dialog**: every class in that file is a
localStorage fixture with `slot: "06:00"` typed by hand. The substance of §3.2 stands and the test I
wrote is the one it asked for, but the sentence names the wrong half.

### ⚠️ §3.3's question was a false binary

"Either raise it or write down why 11 is right" offers two answers and the true one is a third: **no
px value can be a legibility floor at all**, because a px is a signal pixel and its size in the room
is a property of the panel. `TV_MIN_PX` is correct as what it mechanically is and was wrong in what
its comment claimed. Answering the question as asked would have produced either a broken Coach board
or a defence of a number that cannot carry the claim.

### 🔴 My own retraction: "two of its three overwriting controls" was wrong

`58e3a1b`'s message says the Builder "holds a rule and applied it to two of its three overwriting
controls". There are **four**, and the rule was applied to two: the class picker and the style
picker check `anyCustom`; Smart Distribute did not (fixed there) and **neither did either door of
the Build dialog** (fixed in `72b7867`). I wrote that sentence after reading `handleClassChange` and
the Distribute handler and stopping — I had the right insight and I had not counted the callers.
Grepping for `applyTemplate(` would have taken ten seconds and found all four.

It is the same shape as the defect it describes. The lesson that generalises: **when you find a
guard that one caller skipped, the question is not "who skipped it" but "how many callers are
there".**

### 🔴 My own retraction: I read a screenshot wrong

I looked at the expanded 1:1 card and reported to myself that its paragraphs were rendering in the
accent colour. They are `--muted`, in both states, and `--muted` in Canopy is a desaturated green.
Measuring took one probe. **A screenshot is where to get suspicious, not where to conclude.**

### 🔴 My own retraction: the coach-cover control test asserted the wrong product

The control for §3.2 first asserted that a coach who is NOT free at the slot is absent from the
assign dropdown. He is not absent — `CoachCoverPanel` keeps every active coach selectable, and says
why in its own comment: *"a stale grid is not a rota"*. What changes is the label, "free then" versus
"has not said". The test asserts both halves now, which is a stronger control than the one I meant to
write.

### 🔴 My own regression: I pushed a CTA under the bottom nav

The first version of the collapsible card forced its header to 44px in both states to satisfy the tap
sweep. That grew the OPEN card by 23px and pushed the empty screen's "Go to Members" from y=748 to
y=771, under the bottom nav at 390×844. `mobile.spec.js` caught it in a full run. The card now carries
`data-tap` only while collapsed — where it is 86px of its own accord — and the open state costs the
empty screen nothing.

### 🔴 My own repeat of session 37's defect, caught by session 37's sweep

My first draft of the `KNOWN_LITERAL` note went into `OverviewDisplayScreen.jsx` as an **unbraced**
`/* … */` in JSX children. That is exactly §4.2 of session 37: a comment delimiter in children is
text, and it rendered on the Room TV as body copy. `src/ui/jsxText.test.js` failed before I had looked
at a single board. **The sweep earned its place within one session of being written**, which is worth
recording — it is the only evidence anyone will get that a preventative test works.

### 🟢 What the prompt got exactly right

- **§0.1's branch table.** Both PRs were still open, the gate numbers matched to the test, and basing
  off session 37's branch was correct.
- **§0.2's chromium block.** It worked verbatim, first try, and everything in §3 and §4 needed it.
- **§4.1's method.** Six of this session's seven changes came from seed → render → **read** → check
  the store. The two largest findings (Smart Distribute, the stage removal) came from walking the
  Class Builder, which §4.2.2 named, and neither was visible to any test in the repo.
- **§4.1.6, "ask what the product SAYS".** Two of the four hunt findings are sentences that were
  false on the deployed build, and one of them had already been caught over-claiming once before.
- **§0.3's warning that the prompt would have rotted.** Two of its claims had.

---

## 7 · If you only do three things

1. **Run `0011_coach_cover.sql` and put Supabase credentials in the build (A17), then
   `0010_staff_read_boundary.sql` (A14).** Four of the last two sessions' findings exist only because
   the deployed build has no server.
2. **Answer A20.** It is a decision, it blocks a gym on day one, and it is now a one-array change.
3. **Merge PR #15, then PR #16, then this branch.** `main` is six sessions stale and nothing merges to
   it on its own. **Merging them still does not let a coach find cover — A17 does.**

---

## Session 37 — the surfaces nobody had rendered, and what was on them

> Written in full to `SESSION-37-HANDOFF.md`; this is that file, filed here per the
> two-block rule.

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

### 4.4 🔴 The Room TV rendered a source comment, in body copy, in front of the room · FIXED (`1238149`)

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

### 4.5 🔴 Every class opened with START and FOLLOW printed on top of each other · FIXED (`d852b8d`)

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

### 4.6 🔴 The check-in panel promised a backup that does not exist · FIXED (`a9fb39c`)

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

### 4.7 🔴 The shipped build tells every online coach to reconnect · FIXED (`fcdc288`)

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

### 4.8 🔴 Two files each held their own copy of the five class times · FIXED (`100be9f`)

Covered in §3 above. The part that matters as a *finding*: **no behavioural test could have caught
it**, because the two arrays are identical today — there is no failing case to write. The only
assertion that bites is about the source, so that is what the test asserts.

### 4.9 🔴 A semicolon CSV was told to rename its columns · FIXED (`b266830`)

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

### 4.9 🟢 §3.1–§3.5, all five verified against the code and all five real

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
