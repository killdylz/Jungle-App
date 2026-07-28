# Jungle — Session Handoff

_Last updated: 2026-07-28 (session 20)_

> 📁 **Sessions 6–18 are in `docs/history/HANDOFF-ARCHIVE.md`.** This file keeps the **two
> most recent** blocks, which is the window a new session actually needs. It was 165 KB and
> growing ~18 KB a session — larger than every source file but `App.jsx` — so the first thing
> a new session was told to read had become the biggest thing it would read. Nothing was
> summarised or dropped; the older blocks moved verbatim.

---

## Session 20 — the sweep came back clean, and the roster did not

> **Gates green** at `e81e793`. `lint:crash` **0** · **745 unit** (27 files, no todos) ·
> **239 e2e** (28 spec files, no fixmes) · five-chunk build: index **204.50 KB** + StaffApp
> **338.73 KB** + PersonasScreen **91.04 KB** + ClassSummary **5.81 KB** + summaryApi
> **0.85 KB**. App.jsx **3,382 lines** — one attribute changed, no lines added.
>
> **A12/A13 are still not done**, confirmed with Dylan at the top of the session. N4's two
> Edge Functions and migration 0009 remain **code nobody has run**. Nothing here changes that,
> and no claim below depends on them.

### 🟩 The highest-yield item in the session-20 prompt returned NOTHING, and that is the finding

§4.5 ranked "sweep the other eight screens WITH DATA LOADED" as the top item, on the strength
of session 19's Coaches haul (13 unnamed destructive controls on first render, 29 + 33 in its
worst panel). The expectation was "expect a similar haul".

**There is no haul.** Seeded a populated store — 5 members across all three statuses,
attendance, schedule rules, class instances, session history, gym branding, retention actions —
and ran all three `a11yScan.js` rules over **nine top-level screens** and **fifteen
interaction-revealed panels**. Result: **0 unnamed buttons, 0 symbol-only buttons, 0 nameless
fields.** Members, Schedule and Brand Studio were verifiably populated (button counts
15→29, 51→60, 30→31; content markers asserted) and every per-row control was already named,
and named *distinguishably* — "Edit Regular Rita", "Remove Morning Burn on Mon at 06:00 from…".

Sessions 12, 14 and 16 did that work. **Coaches was the one screen never swept at all**, which
is why it held everything. It was the outlier, not the first of a pattern.

⚠️ **The reason this is trustworthy rather than a scan that quietly measured nothing:** every
screen was scanned **twice**, once against an empty store and once against the fixture, and the
two button counts and a content marker were printed side by side. That is what caught the one
case where the fixture genuinely did NOT land — the Class Runner, whose surface is driven by the
Builder's draft and not by `class_instances` at all. Without the empty-store control, seven
honest zeros and one meaningless zero would have looked identical.

### 🔴 Asking the same question about the ROSTER instead of about names found two real defects

Both on the path a coach walks every single class.

**1. `CheckInPanel` had no view on membership status at all.** Three places in this app model
it carefully — `retention.js` refuses to flag a paused or cancelled member and explains why for
each; `RosterScreen` counts only active ones ("including cancelled members makes it a flattering
[number]") and dims the rest behind a "Left" badge — and then the Runner rendered
`store.getMembers()` unfiltered. An owner read **`Roster · 1`** on the Members screen, opened the
Runner, and was offered **three identical full-brightness names**. Tapping the one who left
wrote a real attendance row, for a member the retention engine then declines to analyse: written
and never read.

The cost is **P6**, the design law this panel exists to serve — under five seconds per member.
That budget is spent *scanning*, and the list only grows, so the sweep gets slower exactly as
the gym gets older and its roster gets more valuable.

🔴 **A filter alone would have been WORSE than the bug, and this is the part worth carrying
forward.** `canAdd` refuses quick-add for a name that already belongs to somebody, cancelled
included — so hiding a returning member without a way to reach them strands a real person at the
door, findable by nothing and addable by nothing. The shape is therefore: **current members by
default, search sees everyone, and a surfaced row carries its status as a WORD** (not as
opacity, which announces nothing). `e2e/checkin.spec.js` pins that pairing in its own test, so a
later change that filters the search results too fails with the sentence explaining why.

**2. `App.jsx` was writing a display string into an analytics column.** It handed the Runner
`[classType, subType].join(" · ")` — assembled for a header that **does not exist**, since
`LiveScreen` never renders `classType` and only ever passes it to `ensureClassInstance`. So it
went straight into `class_instances.class_type`, the column N2's cohort analytics group by.

The Runner recorded `"hiit · amrap"` while the Schedule's publish path recorded `"HIIT"` for the
same class: **two doors into one column, two vocabularies, and no query that can ever group
them.** For a gym-authored type it was `"gym-barre-ms4pk827 · general"` — a key with a label
glued on, matching nothing. This is precisely the defect `CheckInPanel`'s own header comment
already describes for `duration_min` and `coach_name` ("the same class recorded different
amounts of itself depending on which door it came through"), in the one field that pass missed.

Found by driving §4.5's other named gap: **a gym's own class type into the Runner and through to
a check-in**, then reading the STORED occurrence back. The path had never been driven. There was
no constraint risk to find (`class_type` is plain `text`, verified session 18) — the defect was
that the value did not survive the journey.

### What shipped

| | |
|---|---|
| `src/screens/runner/CheckInPanel.jsx` | Status-aware sweep list, labelled revealed rows, and an empty state that distinguishes "no members" from "no CURRENT members" (it used to answer "No one matches that name" when nothing had been searched). |
| `src/lib/retention.js` | `isCurrentMember` **exported**. Two definitions of "is this still one of our members" is what let one screen say `Roster · 1` while another listed three names. |
| `src/lib/store.js` | `MEMBER_STATUS_LABEL` moved here beside `MEMBER_STATUSES` for its second UI consumer. ⚠️ `csvExport.js` keeps its own copy **on purpose** — that module has zero imports by design and must not be "fixed" to import the storage seam. |
| `src/App.jsx` | `classType={classChoice?.classType || ""}`. One attribute. |
| `src/screens/runner/LiveScreen.jsx` | The comment saying `classType` is DATA, not a label — the thing whose absence caused the bug. |
| `e2e/checkin.spec.js` | **New, 6 tests.** |
| `src/lib/retention.test.js` | 4 tests pinning `isCurrentMember`'s edges now that it is a shared contract. |

### Method notes worth keeping

- **Five value mutations, each failing the right test for the right reason, each reverted with
  the inverse.** The pairing mutation (filtering the search results as well as the default list)
  failed exactly the two tests written to catch it, with their own messages.
- 🔴 **The badge assertion's first draft pinned `/LEFT/` and failed against CORRECT code.**
  The badge is `text-transform: uppercase`; Playwright's `toContainText` reads `textContent`,
  which ignores it, so the matcher saw `"Left"`. Pinning the case would have pinned a CSS
  choice. The repo already carries "innerText respects text-transform; textContent does not" —
  this is the same trap arriving through an assertion instead of a scan.
- **A recon spec is worth writing and deleting.** Three throwaway specs (`zz-recon*.spec.js`)
  printed counts and every button name per screen rather than asserting. The full picture in one
  run is what made "there is no haul" a finding instead of a guess. All three deleted before
  commit; suite is 28 spec files.
- **A phone gets the bottom bar, and `nav()` is desktop-only** — the documented trap, hit once
  while screenshotting the panel at 390px. The labels are `Run` / `Build` / `Members` / `Brand` /
  `More`, inside `page.locator("nav").first()`.

### Docs — §4.4's item, done

Root is **19 `.md` → 6** (one of which, `Jungle - Delta & Backlog Breakdown.md`, is gitignored
and local-only). `SESSION-HANDOFF.md` is **165 KB → 9.5 KB**. Thirteen audit/strategy files moved
to `docs/`; sessions 6–18 moved verbatim to `docs/history/HANDOFF-ARCHIVE.md`.

⚠️ **Every live cross-reference was repointed** — the As-Built spec (×10), `supabase/SETUP.md`
(→ `../docs/`), `docs/SPEC-PATCHES.md` (→ `../` for the spec) — and verified with a grep that
finds no bare filename left. References inside `docs/history/**` were **deliberately left
alone**: they are records of what was true then, exactly like `FABLE-AUDIT-PROMPT.md`'s stale
`NEXT-SESSION-PROMPT.md` pointer, which §4.4 of the session-20 prompt already ruled on.

---

## Session 19 — N4 is built. The product has a member-facing surface.

> **Gates green.** `lint:crash` **0** · **741 unit** (27 files, no todos) · **219 e2e**
> (27 spec files, no fixmes) · build clean. App.jsx unchanged at **3,382 lines**.
>
> 🟢 **N4 — the member magic-link summary — is BUILT**, in the order the spec insisted on:
> **token and Edge Functions first, page second.** It is the last Phase-1 gap and the only
> screen in Jungle a person without an account can open. ⛔ It goes live when Dylan does
> **`DYLAN-QUEUE.md` A12** — one secret, two function pastes, one migration. ~25 minutes.
>
> ### The structural finding, and it would have shipped broken without it
> `main.jsx` wraps `App` in `AuthGate`, and **with Supabase configured `AuthGate` shows a
> sign-in wall to anyone without a session.** A member tapping their class link would have
> been asked to log into their gym's staff app. No route inside `App` could have fixed
> that, because `App` never renders. **The summary page is therefore routed above
> `AuthGate`.** This is invisible locally — the credential-less build has no wall to hit —
> so `e2e/memberSummary.spec.js` asserts *"no app shell and no sign-in"* rather than merely
> *"the summary is there"*.
>
> ### What the design refuses to do
> - **The token is class-scoped, never member-scoped.** A leaked link exposes one class's
>   programming — the same content the share card already publishes to Instagram — and names
>   nobody. There is no member id in the payload and no join to a person in the read path.
> - **RLS was not loosened to `anon`, and 0007's policies were not touched.** `summary-read`
>   uses the service-role key only *after* an HMAC + expiry check, and only for the one class
>   named in the signature. Pinned by a test that greps the real `.ts` for `members?`,
>   `attendance?`, `consent_records?`, `profiles?`.
> - **`summary-token` never touches the service-role key at all** — it runs under the
>   caller's JWT so *RLS is the authorization check*. A function that cannot escalate cannot
>   be tricked into escalating.
> - **The token lives in the URL fragment, not a query string.** A fragment never leaves the
>   browser; a bearer credential in `?s=` lands in access logs and leaks via `Referer`.
> - **Not JWT.** One algorithm, not named anywhere the token can influence. A format that
>   cannot express `alg: none` cannot be confused into accepting it.
> - **`summaryContent()` is an allow-list, not a cleaner.** A new field on a stage object
>   cannot reach a member by default. That single property is what the class-scoping
>   guarantee actually rests on.
>
> ### 🔴 The lesson this session: A GUARD THAT REPAIRS WHAT IT INSPECTS REPORTS SUCCESS
> The token core is duplicated into both Edge Functions (a function pasted into the Supabase
> dashboard cannot import from `src/`), so `classToken.mirror.test.js` reads the real `.ts`
> files and compares them byte-for-byte. It imported `extractCore` from
> `scripts/sync-token-core.mjs` — **which ran its sync at import time.** Importing the helper
> re-wrote the files, silently repairing the drift a moment before measuring it. I hand-edited
> a copy to `v2`, ran the test, and it passed **and the file was back to `v1`**. Fixed by
> guarding the script's side effects behind a run-as-main check.
> **Fifth session running that the guard was wrong before the code was.** Assume your checker
> is broken until it has failed for the right reason.
>
> ### 🔴 A test that accepts every failure reason asserts nothing
> The token's malformed-input test originally accepted any of `malformed | bad-signature |
> bad-payload` — which is every failure reason there is, so it only proved `ok === false`.
> Tightened to pin the exact reason per input; the loose version **passed** against a mutation
> that removed the version-prefix check entirely. Same family as session 18's "expected state
> is already the default state".
>
> ### The root bundle is now split, and the member pays a fifth of what staff pay
> `main.jsx` lazy-loads `ClassSummary` and `StaffApp` (a new 15-line wrapper pairing `AuthGate`
> with `App` so nothing can import `App` past the auth wall). Measured on a
> **production-shaped build** (dummy `VITE_SUPABASE_*` so rollup keeps the sync paths):
>
> | | before | after |
> |---|---|---|
> | a **member** downloads | 776.85 KB | **206.69 KB** (`index` 198.29 + `ClassSummary` 5.49 + `summaryApi` 2.91) |
> | **staff** download | 776.85 KB | 782.71 KB (`index` + `StaffApp` 584.42) |
>
> **~570 KB off the member path**, 5.9 KB onto staff. Verified by grepping the emitted chunks
> for `GoTrueClient`/`PostgrestClient` — **supabase-js is in `StaffApp`, not in the member
> path.** ⚠️ The credential-less local build strips the sync code and shows *no* supabase in
> *any* chunk, so it cannot answer this question; the dummy-vars build is the one that can.
>
> ### Two real regressions the split caused, both found and fixed
> 1. **A flash of near-black on load.** The skin is applied by `applySkinCSS`, which now runs
>    only once the lazy chunk lands. For a gym with a light palette that is a dark flash —
>    the exact "whose background do you wear" failure `display.spec.js` exists about, moved
>    earlier in the load. Fixed with `bootColours()`: `applySkinCSS` caches the last-painted
>    `bg`/`muted`, and `main.jsx` paints them before React mounts. Measured by holding the
>    chunk with `page.route` so the boot state stops being a race — **`rgb(10,15,12)` before,
>    the gym's `rgb(255,247,240)` after.**
> 2. **Two `display.spec.js` tests read `:root` custom properties before the app mounted** and
>    computed `NaN`. New `waitForApp()` in `e2e/helpers.js`. ⚠️ **Any future test that reads a
>    computed style (rather than asserting on an element, which auto-waits) must call it.**
>
> ### A behaviour worth knowing about
> **Changing only the fragment is a same-document navigation** — the browser does not re-run
> `main.jsx`, so pasting a member link into a tab that already has the app open leaves the app
> on screen and looks exactly like a broken link. The first person to do that would have been
> whoever verified the feature. `main.jsx` now reloads on a `hashchange` that carries a token.
> (Probed directly: `goto('#s=…')` kept the app; `reload()` showed the summary.)
>
> ### Files added
> `src/lib/classToken.js` (+ `.test.js`, `.mirror.test.js`) · `src/lib/summaryContent.js` (+ test)
> · `src/lib/summaryApi.js` (+ test) · `src/screens/ClassSummary.jsx` · `src/StaffApp.jsx` ·
> `src/screens/runner/MemberLinkDialog.jsx` · `e2e/memberSummary.spec.js` ·
> `supabase/functions/summary-token/index.ts` · `supabase/functions/summary-read/index.ts` ·
> `supabase/migrations/0009_class_summaries.sql` · `scripts/sync-token-core.mjs`
>
> ---
>
> ## Session 19, part 2 — the PersonasScreen sweep, and it paid immediately
>
> **Gates: `lint:crash` 0 · 741 unit · 233 e2e · build clean.** (e2e 219 → 233.)
>
> The Coaches screen had never been swept past its first render. It was the worst
> accessibility surface in the app by a distance:
>
> | Surface | unnamed buttons | nameless fields |
> |---|---|---|
> | Base, **with a coach loaded** | **13** — Delete persona, Delete movement ×11, Remove plan | 0 |
> | Change class shape | 18 | **5** role dropdowns |
> | **Edit plan** (`PersonaPlanEditor`) | **29** | **33** |
>
> All now zero, labelled in the house style (`aria-label` naming the item, as
> `members.spec.js` already expects with `/Edit Ada/`). Seven Coaches panels added to
> `e2e/revealed.spec.js`; proven by deleting one label and watching 11 findings appear
> across three panels.
>
> ### 🔴 "Revealed" is not only about a CLICK — it can be about there being DATA
> With no coach loaded the Coaches screen has **two** buttons, which is why
> `screens.spec.js` passed it for eighteen sessions. Load the shipped sample coach and the
> *same first render* grows thirteen icon-only destructive controls. **A screen-level sweep
> against an empty store is a sweep of an empty screen.** Worth re-checking the other eight
> screens in a data-loaded state.
>
> ### 🔴 A scanner false positive, and it nearly made me label two unreachable buttons
> `a11yScan.js` decided visibility with `offsetParent !== null`. Inside a **collapsed
> `<details>`** an element reports `offsetParent` non-null *and a real 162×37 box* — but
> `checkVisibility()` is false and it cannot take focus. Meanwhile the naming rules read
> `innerText`, which correctly returns `""` for unrendered content. **The two halves of the
> scan disagreed: invisible enough to have no name, visible enough to be judged for not
> having one.** Now `offsetParent !== null && checkVisibility()` — an AND, so it can only
> ever remove a finding the browser itself calls invisible. `namelessFields` was
> deliberately left alone: it has no `<details>` false positive and adding a filter there
> could only suppress real findings.
>
> ### Still open after this session
> **A gym class type through the Runner to a check-in** (never driven) · **the other eight
> screens re-swept with data loaded** (see above — this is now a known gap, not a
> hypothesis) · the 147 KB of this file and 9 audit files still at repo root.
> **N2/N3 remain correctly blocked on attendance volume, which is blocked on the pilot.**

---
