# Jungle — Session 27 Build Prompt

**Run this session autonomously. Do not stop to ask.** Every item below is buildable without
Dylan, without a server, and without a migration. Where a choice arises, make it, write the
reasoning in the commit message, and keep going.

---

## 0. Read this first

`CLAUDE.md` is loaded automatically and carries the gates, the shell traps, the CI rules, the
testing traps and the domain rules. **This file does not repeat them.** It carries only the state
and the work queue.

**Last commit `a50f33b`, tree clean, pushed, deploy green.**
Gates: `lint:crash` **0** · **809 unit** (28 files) · **393 e2e** (39 spec files) · 5-chunk build ·
0 over budget. App.jsx **3,420 lines**. StaffApp **343.82 / 360 kB — 16 kB of headroom, and that
is the binding constraint on anything new.**

### The autonomy contract

- **Never block on Dylan.** If an item turns out to need him, write what he needs into
  `DYLAN-QUEUE.md`, say so in the handoff, and move to the next item.
- **Never ask which option to take.** Decide, and put the reasoning in the commit message. A
  decision with its argument written down is worth more than a question.
- **Commit and push after each item lands green.** Do not batch a session's work into one commit.
- **Check CI by workflow name after each push** (`Deploy to GitHub Pages`). `cancelled` runs are
  superseded deploys, not failures — judge the run whose SHA is `HEAD`.
- If a gate is red and the cause is not yours, **re-run once** before investigating.

### 🔴 The rule that mattered most last session

**Verify every item below against the code before building it.** Session 26 found **four** false
premises in its own prompt — a guard for a data loss that could not happen, a three-item list that
was a hundred, a requested assertion that would have pinned a product decision backwards, and an
`aria-live` request that would have made the product worse. Each wrongness was the useful finding.

**Assume this document is wrong somewhere too.** When it is, fixing the document *and saying why
the claim survived* is a better deliverable than the feature would have been.

---

## 1. Where the product actually is

Driven end to end at the close of session 26, with real data rather than fixtures:

- **The coach-persona layer is the wedge and it works.** Loading the sample coach produces a
  learned style — structure, schemes, conventions, vocabulary, per-block rest defaults. "Draft
  from this shape" lands `Warm Up / M1 / A1+A2 / B1+B2 / C1` in the Builder, correctly named,
  ready to run. **Deterministically, no LLM in the steady-state path.**
- **The retention loop works and is honest.** A 13-row CSV import flagged one member with the
  arithmetic shown, three actions, and a WhatsApp draft the coach sends from their own number.
  Jungle stores no phone number — the gym is the organisation contacting its own member.
- **The CSV backfill is the underrated asset**, and item §2.1 below turns on it.

**The commercial gap is not features. Jungle proves its value to the COACH and is sold to the
OWNER.** Class delivery wins daily usage; the owner signs on retention and revenue. Both halves
exist. Nothing connects them with a number.

---

## 🟥 2. The work queue, in order

### 2.1 🔴 Money on the retention screen — the highest-value item in the repo

The at-risk panel says *"1 member needs attention."* An owner buys on *"S$740/month is walking out
the door."* At 200 members × S$150 that is S$750/mo at risk against a S$299 tool, and the ROI
argument writes itself — **but only if the product states the number.**

**What is missing is one input: a membership price.** `getGymBranding()` / `saveGymBranding()` is
the natural home — it already syncs to `brand_profiles`, so no migration is needed. Brand Studio or
the profile modal is the natural place to set it.

Then: every at-risk flag carries a monthly value, and the panel carries the total.

**⚠️ The trap, and it is the whole design.** This product's rule is that *a confident wrong number
is worse than no number*. So:

- With **no price set**, show no money at all — not a zero, not a guess, not a placeholder. The
  panel keeps working exactly as it does today.
- The number is **monthly recurring revenue at risk**, not lifetime value. LTV needs a churn
  assumption the product has not earned; MRR is arithmetic the owner can check in their head.
- State the arithmetic next to the figure, as every other flag on this screen already does.
- One price for the gym is the right first cut. Per-member pricing is a metering problem and
  `docs/GTM-SINGAPORE.md` §2 already rejected it for Jungle's own pricing; do not invent it here.

**Done when:** an owner who sets a price sees a total on the at-risk panel and a figure per flag;
an owner who sets none sees exactly today's screen; both paths are tested, and the test for the
second one is the one that stops this drifting into a fabricated number.

---

### 2.2 🔴 N2 cohort analytics — NOT blocked, and the spec contradicts itself about it

The spec says both of these, nine lines apart:

> line 78 — the CSV backfill writes real attendance rows *"so a studio can bring its whole history
> across on day one"*
> line 87 — *"N2 cohort analytics waits on rows accumulating, which waits on the pilot running"*

**Both cannot be true.** A gym that imports two years of history has cohort data in its first ten
minutes; that is what the backfill is *for*. N2 has been parked behind a precondition the product
already satisfies, and the claim has been carried forward unchecked for several sessions.

This matters commercially: `docs/GTM-SINGAPORE.md` puts at-risk + win-back + cohort analytics in
the **S$299 tier**. Two of the three are built and live. **The tier that doubles ARPU is
two-thirds done and the missing third is not blocked.**

**It is fully client-side.** `jungle_attendance` and `jungle_members` are localStorage keys, and
`retention.js`'s `attendanceIndex()` already returns `memberId → { visits, firstMs, lastMs }`,
which is the foundation a cohort curve needs. No server, no migration, no Dylan.

**⚠️ Three constraints, all verified, all easy to get wrong:**

1. **Do NOT flip `FLAGS.mockAnalytics`.** `AnalyticsScreen`'s KPIs are fabricated, and its own
   header records that rollup currently drops the whole component because `FLAGS` is a literal
   const. Flipping the flag ships 24.7 kB of invented numbers to a paying customer. Build a real
   screen and route to it; leave the flag false and let the mock stay dead.
2. **StaffApp has ~16 kB of headroom.** A new screen must be `lazy()`-loaded into its own chunk,
   the way `PersonasScreen` and `ClassSummary` already are, or `npm run size` fails — correctly.
3. **The route already exists.** `analytics` is in three nav arrays with `cap:"analytics:view"`,
   and `App.jsx:3617` renders `MockDisabledScreen` today. This is replacing a stub, **not adding a
   surface** — so the no-new-surfaces rule is satisfied.

**⚠️ And the honesty rule bites hardest here.** A cohort curve computed from three members is
noise with a chart around it. Decide a **minimum-N below which the screen states what it needs
instead of drawing a line**, and make that the first thing you build. A gym that imports two years
of data crosses it instantly; a gym that imported nothing must not be shown a shape.

`attendanceIndex` reads `a.checkedInAt` — confirm the field name against a row the importer
actually wrote before building on it.

**Done when:** a gym with imported history sees a real retention curve derived from its own rows;
a gym without enough data sees a stated reason and no chart; the arithmetic is unit-tested; and
`npm run size` still passes.

---

### 2.3 The engineering instrument in the middle of the owner's value story

Directly under the at-risk panel, a gym owner currently reads:

> **Check-in speed** — *"Not measured yet — check members in from the Class Runner and the typical
> time per member appears here. The target is under 5s."* · **—** · **NO DATA**

That is the P6 instrument: an internal engineering target, shown to an owner who did not set it
and cannot act on it, in the middle of the screen that is supposed to sell retention. `—` and
`NO DATA` read as a fault.

**This is §3.5's last open item and the code is in `RosterScreen.jsx` around the `p6` block.**
Decide between: making it an owner-legible statement with an action, or moving it behind something
the owner opted into. **Do not simply delete it** — it exists because an unmeasured design law was
indistinguishable from a met one, and that reasoning is still good. Whatever you choose, the empty
state must read as *"nothing yet"*, never as a fault.

---

### 2.4 The rest of the polish list, in value order

Each still open, each verified present at `a50f33b`:

| # | Item | Note |
|---|---|---|
| **§3.2** | **Save confirmations.** `useToast()` is available everywhere; the plan editor and the coach delete already use it. Several coach-initiated `save*` calls are still silent. | ⚠️ Never toast a write the coach did not ask for — autosave and aggregation recompute must stay silent, or the toast becomes noise people learn to ignore. |
| **§1.3** | `removeClass` (`CalendarScreen`), `handleReset` (library), `handleNewClass` — the last three `window.confirm`s. | Apply the established rule: **confirmed or undoable, and the guard scales with what is destroyed.** `handleReset` discards every gym override and probably deserves to stay a confirm; say so if you conclude that. |
| **§3.7** | Loading and skeleton states. Lazy chunks show a bare `screen-loading`; hydration shows nothing. | ⚠️ `nav()` in `e2e/helpers.js` waits on the `screen-loading` testid. If it moves, every navigation in the suite silently stops waiting. |
| **§1.5** | The reload sweep — a table of (action → storage key → screen assertion), run immediately and after `page.reload()`. | `builderDraft.spec.js` and `destructive.spec.js` are the shape. This generalises sessions 21–26's whole method into one rule. |

---

### 2.5 If everything above is done

- **"GOOD AFTERNOON, COACH"** — the app knows the coach's name everywhere else.
- **The Dashboard checklist never celebrates.** Reaching the end should say so, once.
- **`_bgDelete` records no sync error.** A failed DELETE reaches only `console.warn`, so it never
  enters the ledger, is never retried, and the row the coach deleted comes back on the next
  hydrate. ⚠️ This one needs a decision about what retrying a delete means with no local tombstone
  — make the decision, write it down, and implement it, or record why not.

---

## 3. Do NOT

- **Do not apply migrations, merge Dependabot PRs, or change infra.** All three are Dylan's.
  ⚠️ The deploy log now warns that `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`
  and `deploy-pages@v4` are being **forced onto Node 24** because Node 20 is deprecated. That is
  PRs #1–#5 and it has a real clock on it — **record it in `DYLAN-QUEUE.md`, do not merge it.**
- **Do not build billing, signup or a self-serve tier.** At 5–20 gyms, manual onboarding is
  correct and is where the customer conversations come from. Gym-#20 problem.
- **Do not flip `FLAGS.mockAnalytics`** (see §2.2) **or undo the `FLAGS.music` gates.**
- **Do not add a new screen or nav entry.** §2.2 replaces an existing routed stub; that is the
  only surface change sanctioned here.
- **Do not "simplify"** `_clearLedgerIfSettled`, `restorePersonaCascade`, or the conditional in
  `deletePersonaMovement`. All three look redundant and are not; all three have tests saying so.
- **Do not re-raise** N4, the crash gate's JSX blind spot, the class-type vocabulary, the
  catalogue delete, `Reopen`, `GEN_CAP`, or `BrandStudioScreen`'s size.

---

## 4. Standing risks — carry these into the handoff unchanged until they move

- 🔴 **Migrations `0005` and `0006` have never been applied.** Until they are, a gym's personas,
  plans and movement catalogue exist on **one device with no server copy.** Unchanged for several
  sessions and the most expensive data in the product.
- 🔴 **N4 member links are built and undeployed** — six sessions. The only member-facing surface,
  and the only place the white-label story can be proven on an actual member.
- ⚠️ **A second Claude session may share this working tree.** It has committed uncommitted work,
  deleted a scratch file mid-use, and left a `MUTATION` marker in a source file. `CLAUDE.md` has
  the survival rules and the worktree fix.

---

## 5. When to stop

1. Work the queue in order. Verify, build, test, prove the test can fail, run the gates, commit
   with the reasoning, push, check CI.
2. **Then drive the surface you touched and LOOK at it**, at 1280px and 390px. This found copy
   defects in sessions 24, 25 and 26 that passing suites did not.
3. Keep going until the tokens run out.

🔴 **If the remaining items are all theatre, stop and say so.** An honest "this is finished" is a
result. **Never add a feature to have something to do.**

**Finish with a `SESSION-HANDOFF.md` block** in the established shape: what shipped, what was
found to be false, the traps paid for, and what is genuinely left. Lead with the reasoning, not
the diff — the next session reads that block first.
