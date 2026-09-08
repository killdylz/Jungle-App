# Session 38 — the two boards a member reads, and the seams between screens

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
e2e                 588 passed (48 files)        was 567; +21
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
