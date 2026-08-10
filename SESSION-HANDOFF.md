# Jungle — Session Handoff

_Last updated: 2026-08-10 (session 27)_

> 📁 **Sessions 6–25 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 27 — the product finally states a number an owner buys on, and six premises were wrong

> **Gates green at `1a7bce4`.** `lint:crash` **0** · **875 unit** (30 files) · **439 e2e**
> (44 spec files) · six-chunk build: member path **211.57 kB**, staff **557.70 kB**
> (StaffApp **349.46/360 kB** — 10.5 kB left, and it is still the binding constraint).
> App.jsx **3,787 lines**. Seven commits, each pushed and CI-checked. One worktree, no
> concurrent session this time.

**The brief was a queue of eight items with an explicit instruction to verify each against the
code first, and a warning that the document was wrong somewhere.** It was wrong in six places.
Four of those wrongnesses changed what got built; two meant the work was already done. That ratio
is now consistent enough across sessions 26 and 27 to treat as the normal state of a handoff
prompt rather than an unlucky one.

### What shipped

**§2.1 — money on the at-risk panel.** The retention loop was entirely the coach's: it names
members and shows the arithmetic behind each flag. An owner does not buy "4 members need
attention"; they buy "S$600/month is walking out the door". Everything needed to say that was
already computed except what a membership costs, so the feature is one field
(`branding.membershipPrice`, set in Brand Studio, no migration — the blob already round-trips to
`brand_profiles`) and `members × price`.

The absent case is the feature and most of the tests. No price ⇒ **no money anywhere on the
screen** — not a zero, not a placeholder, not a "set a price" nudge. The e2e asserts no currency
symbol appears in the body text at all, deliberately broader than the fixture's own currency,
because a check for "S$" would pass while the screen rendered a pound sign. MRR not LTV, because
LTV needs a tenure assumption no gym's data has earned. Derived from the ACTIVE flags so the money
can never contradict the count beside it — a contradiction that has shipped on this panel once
already.

**§2.2 — N2 cohort analytics, replacing the coming-soon stub on the analytics route.** A real
retention curve from the gym's own rows, a per-cohort table, and a stated half-life. Its own lazy
12 kB chunk.

**§2.3 — the P6 instrument stopped reading as a broken gauge.** It sat under the at-risk list
showing `—` beside `NO DATA` on a fresh install: an unattributed engineering threshold in the
middle of the screen that sells retention. Not deleted — the reason it exists (an unmeasured design
law is indistinguishable from a met one) is still good. Moved last, and rewritten: the target is
named as **Jungle's**, which turns an internal number into a promise the owner can hold us to, and
the consequence is stated in coach-minutes per class from the gym's own median class size.

**§1.3 — the last three `window.confirm`s**, each getting the guard its cost deserves. New class →
undo. Remove a schedule rule → undo. Coach delete → in-app confirm **and** undo, because that one
is an LLM pass over a deck a coach has taught from for years and lives on one device.

**§3.2 — the two saves that were genuinely silent**: the ExerciseDB API key (no visible
consequence at all) and a movement-catalogue edit (aliases, notes and category do not show in the
collapsed row). Everything else stays silent, and that half has the teeth.

**§1.5 — the reload sweep.** Eight writes × (stored value, screen, then both again after a
reload), each row its own test with a control that the check fails before the action.

**§2.5 — the checklist now acknowledges completion, and the greeting cannot shout an email.**

**`_bgDelete` records a failed delete and can retry it**, via a tombstone queue.

### The six false premises, in order of how much they changed

1. 🔴 **§2.2 said "the route already exists, in three nav arrays".** True, and beside the point.
   `flags.js` mapped `analytics` to the `mockAnalytics` flag, so `isViewEnabled("analytics")`
   returned **false** and all three nav arrays filtered the entry straight back out. **The route was
   live and unreachable — nothing in the product could navigate to it.** The nav half of that build
   is deleting one line from `MOCK_VIEW_FLAG`. That is *not* flipping the flag: `FLAGS.mockAnalytics`
   is still false and `AnalyticsScreen`'s invented KPIs are still folded out of the bundle.
   **The lesson: a mock flag doing double duty as a nav gate makes "replace the mock" require a
   flags.js edit that reads exactly like the thing the queue forbade.**

2. 🔴 **§2.2 assumed cohorts could be keyed on `joinedAt`. They cannot, and it inverts.**
   `applyAttendanceImport` creates every imported member with `joinedAt: ""` (store.js:1303). So
   the gym that imports two years of history — the exact gym that makes N2 possible — has **zero
   known join dates**, and a join-date analysis would show it an empty screen while showing a gym
   that typed its roster in by hand a full one. A cohort is therefore *the month a member first
   appears in the records*, and the screen says so rather than calling it a join date.
   `retention.js` refuses the same substitution for its rule 1 and is right to: that rule asserts a
   tenure it does not hold, while this describes the data it does.

3. 🔴 **§1.3's list of the last three confirms named `handleReset`.** It is not one and has not
   been for some time — it already has an in-app dialog *and* a toast. The third confirm was the
   **coach delete**, which the queue did not mention at all and which is the most expensive
   destructive action in the product. The item had the wrong end of it.

4. 🔴 **§2.5 said the app "knows the coach's name everywhere else".** It knows it nowhere:
   `display_name` comes from the Google/Supabase session, and the credential-less build — what
   GitHub Pages serves — has no session. "COACH" is the honest output of holding no name, confirmed
   by driving it. The real defect was one step further down the chain: `display_name` falls back to
   `user.email`, and `split(" ")[0]` greeted a coach with **their whole email address** in 12px
   letterspaced accent caps.

5. **§3.7 said lazy chunks show a bare fallback and hydration shows nothing.** Neither survives
   contact. `ScreenLoading` renders a centred "Loading…"; the root fallback in `main.jsx` already
   wears `bootColours()` so a light-palette studio gets its own background rather than a flash of
   near-black, with an ErrorBoundary outside it. And hydration showing nothing is **correct** for a
   local-first app — a spinner would claim the data is not ready when it already is. What remains is
   skeleton screens, which is cosmetic, costs bytes against 10 kB of headroom, and carries the
   item's own warning that moving the `screen-loading` testid silently stops every navigation in the
   suite from waiting. **Deliberately not done. Do not re-raise without a new argument.**

6. **§3 asked for the Node 20 deprecation to be recorded in `DYLAN-QUEUE.md`.** Session 26 wrote it
   up on 2026-08-04. Re-verified rather than re-filed; a status line says so.

### The defects found by building, which no premise predicted

🔴 **My own first cohort curve RISED, and a unit test caught it.** Right censoring's obvious fix is
a per-point denominator — at month k, count only members old enough to be observable that far.
Every point is then individually correct and **the line as a whole lies**: month 7 read 50% after
month 6 read 33%. Nobody came back; those are percentages of different populations, and the members
old enough to be measured at month 7 were a more loyal subset. An owner reads that upturn as "they
return". Fixed with **one population for the whole curve** — the members who have had the full
observed horizon — so `last >= cohort + k` is nested in k and the line is monotonic in fact rather
than in a comment. The same artefact appears in table form and takes the same fix: one denominator
per row.

🔴 **The Brand Studio's three skin presets were `<div onClick>`.** A keyboard-only or screen-reader
user could not choose a skin **at all** — the three primary choices on the white-label screen. It
surfaced only because the reload sweep tried to click one *by role* and waited out its timeout.
Nothing in the suite would ever have caught it: `keyboard.spec.js` asserts every visible CONTROL is
reachable by Tab, and a div with an onClick has no role, so it was never a control to reach — and
every existing test clicks these by their TEXT, which works on a div. **The workaround that made the
tests pass is what hid the defect.** Now `<button aria-pressed>`.

🔴 **`ProfileModal`'s branding Save erased any key set elsewhere.** It wrote its six-field draft
*as* the whole branding blob. Nothing was lost while the blob held only those six; `membershipPrice`
is the first key that would have been, and the symptom would have been a price that "does not save"
with nothing in the console.

🔴 **The Dashboard checklist's congratulation was unreachable code.** `describeSetup` has always had
a "Setup is done" branch. `showChecklist` is `sessions === 0`; the `run` step is done at
`sessions > 0`. The conditions are exact opposites, so **completing the third step is what hides the
card carrying the congratulation** and the ceiling a coach can see is "2 / 3". The old copy also told
them to run a class they must already have run to get there. The acknowledgement moved to the other
side of the switch (`justFinished = complete && sessions === 1`), retiring itself on the second class
so it needs neither a dismiss button nor a stored flag.

🔴 **`_bgDelete`: the obvious fix would have been worse than the silence.** A failed delete only hit
`console.warn`, so it never entered the ledger, was never retried, and the next hydrate put the row
back. But simply calling `_noteSyncError` makes the retry machinery **lie**: `_RETRY_PUSHERS[table]`
is `save*(get*())` for every id-keyed domain, an upsert cannot remove a row the server has and local
does not, so the retry SUCCEEDS, `_clearSyncError` fires, and the ledger reports a healthy table
whose deletion never happened.

**What retrying a delete means with no local tombstone — the decision.** It means nothing, which is
why the tombstone must exist. `jungle_pending_deletes` holds `{table, col, val, at}` and does two
jobs: it is the retry's *argument* (what the local list threw away), and it *suppresses the
resurrection* so hydrate drops a row the coach already deleted instead of adopting it. Job 2 is the
one the coach feels. `_clearSyncError` now refuses while a tombstone is outstanding — one choke-point
rather than a rule repeated at every call site.

⚠️ **One table already had this right and is why the shape is worth copying.**
`library_overrides`' pusher is `if (d) saveLibraryCustom(d); else resetLibraryCustom()` — it MIRRORS
whichever operation failed, because "no overrides" is derivable from local (DEC-13). A blob table
needs no tombstone; the absence IS the tombstone. **That table was one ledger entry from correct,
and it is the only one of the four whose bug is reachable today** — resetting the exercise library
offline left the server's overrides in place and the next hydrate wrote them back. The three persona
tables are latent only because 0005/0006 are unapplied.

### Traps paid for, in order of how much time they cost

🔴 **`expect(toast).toHaveCount(0)` IS NOT AN ASSERTION OF SILENCE.** It is satisfied the instant the
count is zero, which includes "has not rendered yet". **Proved, not reasoned:** a mutation making the
Schedule's autosave toast on every write left all three silence tests GREEN. It is a scan that ran on
nothing, in a different costume. Silence is now *observed* — a `MutationObserver` records every toast
that ever mounts and the assertion reads the record afterwards. **Any future "X never happens" test
in this repo needs this shape.**

⚠️ **A component cannot consume a context it provides.** `ToastProvider` was rendered inside App's own
JSX, so App could not toast — which blocked turning its `window.confirm` into an undo, because the
state to restore lives in App. Moved up into `StaffApp.jsx`. Still wraps the whole staff app; the
toast is `position: fixed`, so its place in the tree does not affect where it appears.

⚠️ **`Who&rsquo;s slipping away` is a real U+2019.** A locator using an ASCII apostrophe matches
nothing, so a layout test failed on its selector rather than on the layout.

⚠️ **Toasting from inside a `setState` updater fires twice under StrictMode.** Read the prior list
from state instead.

⚠️ **The "Exercise Library" nav entry opens a MODAL, not a screen.** It covers the sidebar and traps
focus, so any loop that visits it mid-sweep cannot click the next nav entry. Visit it last.

⚠️ **`jungle_skin` holds a bare string, not JSON**, so the `stored()` helper cannot read it.

⚠️ **An unlisted chunk in `check-size.mjs` has no ceiling at all** — it is counted in the file total
and never fails. A new lazy chunk that nobody adds can grow forever. `RetentionScreen` now has one.

⚠️ **Making a nav entry visible breaks two sweeps, both by design.** `ALL_SCREENS` is checked against
the running app by `responsive.spec.js`, so omitting the new entry failed loudly — the ⚠️ above that
list, working. And `interactions.spec.js` needed `analytics` in its navigation denylist, or every
other screen's sweep clicks it and navigates away mid-sweep. Its four-control positive control also
**fired correctly** on the screen itself: Analytics is a read-only report whose only buttons are Back
and an import link, both already denied. The wrong fix is adding controls so a sweep has something to
click; it is exempted by name with the reasoning recorded.

### One test deleted rather than fixed

`handleNewClass` skips the undo when there was no draft to lose, and that branch is **unreachable** —
the Dashboard renders the control only `{hasDraft && ...}`. The guard stays as defence for a future
call site. A test of an invented path is worse than no test, and this repo's own rule is not to
report a defect a fixture manufactured.

### What is genuinely left

- 🔴 **Migrations `0005` and `0006` have never been applied.** Unchanged for several sessions and
  still the most expensive data in the product: a gym's personas, plans and movement catalogue exist
  on **one device with no server copy**. The coach-delete dialog now *says so* to the coach, which
  means **that sentence becomes a lie the moment you apply them** — recorded in `DYLAN-QUEUE.md`
  with the test that will remind you.
- 🔴 **N4 member links are built and undeployed** — seven sessions now. Still the only member-facing
  surface and the only place the white-label story can be proven on an actual member.
- ⚠️ **10 unmerged Dependabot PRs**, five of them major GitHub-Actions bumps that are also the fix
  for the Node 20 deprecation warning printed by every deploy in this session. Dylan's call.
- **§3.7 skeleton states** — decided against, with the argument above. Not an open item.
- **StaffApp has 10.5 kB of headroom.** Anything new goes in a lazy chunk with its own budget line.

### The honest assessment

The commercial gap the prompt named — "Jungle proves its value to the COACH and is sold to the
OWNER; both halves exist and nothing connects them with a number" — is closed. The owner's screen now
states monthly revenue at risk with its arithmetic, and the S$299 tier's third feature exists rather
than being parked behind a precondition the product already satisfied.

What is left in the queue is not theatre, but it is thinner than what came off it. The next session's
highest-value work is almost certainly **not on this list**: it is getting 0005/0006 and N4 in front
of a real gym, both of which need Dylan and neither of which any amount of code will move.


## Session 26 — three premises that were false, and the two defects underneath them

> **Gates green.** `lint:crash` **0** · **809 unit** (28 files, no todos) · **395 e2e**
> (38 spec files, no fixmes) · five-chunk build: member path **211.57 kB**, staff **554.22 kB**
> (StaffApp **343.82/360 kB**). App.jsx **3,386 lines** — the prompt said 3,602, then 3,608. Both
> were wrong, which set the tone for the session.
>
> ⚠️ **A SECOND CLAUDE SESSION WAS WORKING THE SAME TREE.** Not the same port — the same files. It
> committed uncommitted work, deleted a scratch file mid-use, left a live `MUTATION` marker in
> `src/index.css` that would have made a gate run lie, and tore down the shared dev server on 5191
> repeatedly. See `concurrent-session-shares-worktree` in memory. Stage only your own paths
> (`git commit --only <paths>`) and grep for `MUTATION` before trusting any gate result.

### The method: every named item was driven before it was built

**Three items on the polish list were wrong, and each wrongness was the useful finding.**

1. 🔴 **§3.1 said the Builder loses a class on navigation, and wanted a guard on `navTo`.** It does
   not. `stages`/`sessionName`/`classChoice` live at the **App root**, so navigation never unmounts
   them, and a `useEffect` autosaves on every change — a rename survives a full `page.reload()`.
   The guard would have interrupted a coach to prevent a loss that cannot happen, which is worse
   than no guard: an interruption that is never right teaches people to click through the one that
   is. `e2e/builderDraft.spec.js` pins the persistence instead; deleting the autosave reds all
   three tests. **That is the condition for re-raising this, and nothing less is.** The *plan
   editor* loss was real — four dismiss paths, all silent — and now hands the draft back through
   the undo toast, guarded on `dirty` so an untouched open stays instant.

2. 🔴 **§3.4 listed three touch-target offenders. Measured, it was 100 of 186 controls under 44px
   at 390px.** The list came from wherever the last person happened to look, not from a sweep.

3. 🔴 **§1.4 asked for "assert the counter reaches 3/3". It must not.** Running a class flips
   `showChecklist` false — the checklist is a cold-start surface that is REPLACED, not completed.
   Writing the requested test would have pinned a product decision backwards.

**And §3.6 asked for the timer to be `aria-live`.** `remaining` ticks every second: ~1,800
announcements in a 30-minute class, over everything else the coach's phone must say. An
accessibility feature can be actively hostile. The region carries what is DISCRETE instead, and a
test asserts it never contains `/\d+:\d\d/`.

### Two defects found underneath the polish, neither on any list

🔴 **Every loading spinner in the app was frozen.** `@keyframes spin` lived in `src/App.css` — Vite
scaffolding **nothing imports**. Six `animation: spin` call sites resolved to nothing. Four are on
live, network-bound paths (Slides listing and import, reading a pasted class, generating in a
coach's style), so on the app's four slowest journeys **"working" and "hung" looked identical**.
Nothing throws, and a screenshot of a still spinner looks exactly like a moving one.

🔴 **A dialog could start the class behind it.** The Runner binds shortcuts on `window`, and
`useDialog` stops propagation for **Escape only**, deliberately. So with the check-in panel open —
the one dialog opened mid-class — focusing "Done" and pressing Space **started the class**, and
"n" advanced the room a stage, behind a dialog the coach is looking at. `isDialogOpen()` now
exposes the stack `useDialog` already kept.

### The tap-target mechanism, and the one control it could not fix

`data-tap` lays a transparent 44px pseudo-element over a small control: the hit area grows, the
visible box does not. **`tapScan.js` hit-tests the running page rather than measuring rectangles**,
because both failure modes leave the element's rect identical:

- **An `overflow:hidden` ancestor clips the overlay** — caught on the Calendar's week-nav pill.
- 🔴 **An overlay eats its NEIGHBOUR**, and this one shipped in `40b31cb`. Marking the schedule's
  Remove ✕ covered the Edit pencil 14px away and made it unclickable. **Nine tests went red on the
  EDIT flow and not one mentions tap targets**: an overlay that eats a neighbour presents as the
  neighbour being broken, three files away. `orphanScan` closes it.

⚠️ **Adding `orphanScan` to the nine screen sweeps did not catch the mutation** — the sweeps run on
a fresh app, a fresh app has an empty schedule, and neither button existed to scan. **An empty
screen passes every scan trivially.** There is now one test that seeds a class first. That property
is true of all nine sweeps above it, and is worth remembering before trusting the next one.

**Two controls are deliberately left small, with the measurement written above them:** the
Builder's 19px movement preview (a 44px target cannot fit a 30px row) and the schedule ✕ (14px from
its neighbour). Pretending otherwise costs the neighbour.

### Also shipped

- **Two Schedule panels that could never fill.** "Jungle Intelligence" and "Trainer load" are
  `FLAGS.mockAnalytics ? [...] : []` with the flag false, so both rendered their EMPTY state
  permanently, promising a feature with no implementation behind it. Gated on the flag their data
  already uses — one switch, not two. Took a hard-coded *"Mara is near weekly cap"* with them.
- **`deleteEx` becomes an undo**, the last half of the inverted guard. The undo holds the **LIST**,
  not the row: re-appending would put the movement back at the end of an order the coach set by
  hand. The library's local `showToast` folded into the shared primitive — it structurally cannot
  host a button, and two toast positions on one screen is worse than either.
- **`--danger`**, deliberately NOT skin-derived: a gym whose accent is red would get a delete
  button matching its primary action. The test asserts it differs from `--accent` too, because
  "differs from muted" alone is satisfied by exactly that mistake.
- **`layoutScan` skips 1px boxes.** The visually-hidden live region clips by design. The exemption
  is itself mutation-checked — clipping "ELAPSED" into 20px still fails with "52px of text in
  20px" — so the rule is narrowed, not weakened.

### Traps this session paid for

- ⚠️ **PowerShell mangles `node -e` containing `var(--muted)`** — `--` parses as a unary operator.
  Use a bash heredoc `.mjs`, or the Edit tool.
- ⚠️ **Git Bash `/tmp` is not Node's `C:\tmp`.** A heredoc written in bash and read by `node -e`
  fails with ENOENT. Use one tool for both halves.
- ⚠️ **`nav()` leaves focus on the button it clicked**, so a bare `Space` in a Runner test
  re-activates the sidebar as well as firing the shortcut. Reset via body tabindex/focus.
- ⚠️ **A JSX comment cannot be the first child of `{cond && (`** — it is not an expression. The
  symptom is a broad e2e failure that reads exactly like a dev-server flake.
- ⚠️ **The check-in dialog's first button is "Done"**, so Space closes it. A test asserting the
  dialog stays open after Space is asserting that the button is broken.

### Two more that landed after the block above was written

- **§3.5 Team.** With Supabase unconfigured its entire content was *"Team accounts are available on
  the online version of Jungle."* It is no longer offered. The decision goes through
  `isViewEnabled`, which now takes runtime context — **all four nav arrays pass it**, because an
  `&& supabaseEnabled` bolted onto one of them is exactly how a screen survives in a single menu.
  ⚠️ Production is unaffected (`supabaseEnabled` is true there); this changes the credential-less
  build, which is what e2e, an offline demo and the PIN-gated mode all see. Removing Team from
  `ALL_SCREENS` is **not** a workaround — the inventory guard checks that list against the running
  sidebar both ways, and the mutation reds the guard *and* the new test, for different reasons.

- **§1.6 the interaction sweep** (`e2e/interactions.spec.js`). Presses every non-destructive,
  non-navigating control on all eight screens and checks the **console** after each click — React's
  boundary makes a crash look handled, so a DOM-only sweep passes on a screen that just died. The
  denylist is the design, and its four exclusions each have a different reason.
  🔴 **Its positive control fired immediately: Coaches and Members render three controls each on a
  fresh install, so both would have swept an empty state and reported a pass** — the same trap the
  tap sweep hit an hour earlier in a different file. Both are seeded now.
  ⚠️ One thing deliberately NOT reported: an attendance row in the Members seed rendered the error
  boundary, but the fixture had `at` as a **number** where `recordSession` writes an **ISO string**,
  so the crash was as likely mine as the app's. **A sweep must not report a defect it manufactured.**
  If the app really is fragile there, it needs a fixture built from a real check-in.

### Still open

§3.2 save toasts (partial), §3.5's Members "Check-in speed" panel, §3.7 skeletons, sweep §1.5, and
§1.3's `removeClass` / `handleReset` / `handleNewClass`. **Everything is pushed and the deploy is
green** — `main` at `68ac39a`, `Deploy to GitHub Pages` **success**.

⚠️ **Cancelled deploy runs in this repo are usually NOT failures.** Four pushes inside sixteen
minutes produced one `success` and three `cancelled`: GitHub Pages uses a concurrency group that
cancels an in-flight deploy the moment a newer push arrives, so only the last one needs to finish.
Reading one of those as a red build is the mirror image of session 24's mistake. Judge the run
whose SHA is `HEAD`, by workflow **name**, and ignore superseded ones.

`gh` **is now installed and authenticated** (2.97.0, as `killdylz`) — the earlier note that it was
missing is obsolete. ⚠️ It resolves on `PATH` only in a shell started *after* the install; an
older session must call `"C:\Program Files\GitHub CLI\gh.exe"` by full path, and `gh` outside the
repo needs `--repo killdylz/Jungle-App` or it cannot infer the base repo.

§0 is unchanged: migrations `0005` and `0006` still need running, and until then the coach corpus
exists on exactly one laptop.

---
