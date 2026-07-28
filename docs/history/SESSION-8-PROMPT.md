# Jungle — Session 8 Build Prompt

`main = 3eb70f4`, pushed, deployed, CI green on Linux, tree clean. Push any remaining
commits, then keep building features non-stop until you're out of tokens for the night.
You don't need to check in — the direction is set for the week; we do a retrospective after.
Don't stop for today.

## The product, in one paragraph

Jungle is a white-label class operating system for boutique fitness studios — React + Vite +
Supabase, deployed to GitHub Pages. It is an **experience layer**: everything is judged by
whether it improves the life of the **trainer** (plans faster, runs the room without fighting
software), the **owner** (sees who is slipping away, looks premium), or the **member** (walks into
a room that knows them). A feature that improves none of those three is theatre, and this repo
deletes theatre. Commercial context: Dylan launches at the Singapore gym he freelances at (The
Garage), then sells to other gyms. The USP: Jungle learns how each coach already programs — from
the slides they've written for years — and turns that into branded, ready-to-run classes on the
studio's own screens, while quietly building the attendance record that shows who's about to quit.

## Start here

- Repo: `C:\Users\dylan\jungle-app` — request folder access first.
- Confirm state: `git status` (expect clean), `main = 3eb70f4` and pushed.
- **CI is green and needs no attention.** The workflow runs `lint:crash → test → playwright
  install → test:e2e → build`, all passing on Linux. The Playwright-in-CI question is settled
  (session 6). Do not re-investigate.
- Gates: `npm run lint:crash` (must be 0) → `npm test` (**405**) → `npm run test:e2e` (**35**) →
  `npm run build`.
- Read, in this order: this file → `SESSION-HANDOFF.md` (session-6 block; read the crash-gate
  section before trusting a green lint run) → `AUDIT-FINDINGS.md`, `UI-UX-DIRECTION.md`,
  `REGRESSION-PLAN.md`, `LEGAL-AND-SECURITY.md` → the as-built spec. `SPEC-PATCHES.md` is APPLIED
  and is history — do not re-apply it. `SESSION-7-PROMPT.md` is now history too.
- Live site: <https://killdylz.github.io/Jungle-App/> — deploy = push to `main`.

## 🔴 The one thing that will still bite you: `lint:crash` cannot see undefined JSX components

`no-undef` resolves plain identifiers but **not** JSX element names. `const a = Foo` is caught;
`<Foo/>` is not. This is the `9f71f61` class of bug the gate was built for, in the one form it
misses. It bit twice in session 6 and once more in session 7.

**Session 7 RESOLVED the last known live instance of it** — `<SpotifySearchModal/>` (used at two
call sites, defined nowhere, hidden behind `FLAGS.music`). It was standing in for `TrackSearch`, a
finished component that had been orphaned. Both are now wired to `TrackSearch`, and the whole music
subsystem was moved to `src/music/`. **Verified by flipping `FLAGS.music` on and driving the real
app** — Dashboard, Builder (+ the resolved Add-tracks modal), Music Hub and Class Runner all render
with no error boundary and no console errors. The handoff's old warning ("flipping `FLAGS.music`
gets a white screen") is no longer true.

**Two guards, and one is still Dylan's call:**

1. `e2e/screens.spec.js` asserts the error boundary is **absent** on all nine screens (music-off).
   **If you add a screen, add it to that list.** It only covers screens someone remembered to list.
2. There is a **scratch `@babel/parser` probe** in the session scratchpad (`jsx-probe-final.cjs`)
   that resolves every JSX element name to a binding — it caught the extraction cleanly in session
   7. It is NOT committed: it leans on `@babel/parser`, a *transitive* dep (via `@vitejs/plugin-react`
   → `@babel/core`), and committing a gate that depends on a transitive is exactly the fragility the
   repo warns about. **⛔ DECISION FOR DYLAN (still open, queue item 8): add `eslint-plugin-react`
   for `react/jsx-no-undef`?** It's the only in-tooling way to close the gate itself. New dev
   dependency, so not taken unilaterally.

The dormant `<SpotifySearchModal/>` phantom is **gone**. There is no known remaining JSX phantom.

## What session 7 did — `7ada0e8` → `3eb70f4`, 3 commits, all gates green

| Commit | What |
|---|---|
| `e291c35` | **Decomposition stage 3 — music quarantine into `src/music/`.** App.jsx **7,855 → 5,970** lines (−1,885). Everything Spotify-shaped now sits behind one barrel (`src/music/index.js`); `SCFG` moved to `src/data/stageConfig.js` because both sides read it (a cycle otherwise). The phantom `<SpotifySearchModal/>` resolved to `TrackSearch`, un-orphaning 476 lines in the same edit. Pure verbatim move — every range copied byte-for-byte. |
| `ded748c` | **Deleted the dead Spotify-gated `LoginScreen`** — never rendered since AuthGate (Google) became the entry gate, and the last surface still calling Jungle "elite gym workout management with synchronized Spotify integration" / demanding "Spotify Premium" (a white-label + sales-integrity leak). It was the sole consumer of the barrel's `IS_CONFIGURED`, so that import went too. |
| `3eb70f4` | **I13 background retry.** A failed write no longer waits for the next login-time hydrate: the browser `online` event retries every ledgered table immediately, and a 30s timer catches writes that failed while online. The decision — `_dueRetries(errors, {online, now})` — is pure, unit-tested, and mutation-checked (exponential backoff, 5s base → 5min cap, keyed on a new `attempts` counter). **405 unit tests** (was 399). |

App.jsx is now **5,985 lines**. Bundle ~631 KB.

### Judgement calls worth knowing

- **The music move was pure.** No behaviour change; the barrel exports only what App.jsx actually
  consumes plus the true public API. `TempoGuide` deliberately stayed in App.jsx — it needs no
  licence and is the display's honest no-music state, not "music".
- **`fetchBpmData` (Deezer) moved flagged, not deleted.** It has no caller anywhere. It joins the
  dead-symbol list (see below) awaiting a yes/no — same rule session 6 used for `nudgeForContrast`.
- **I13 re-pushes each domain's CURRENT local state, not the failed payload** (the ledger doesn't
  retain it). Safe because every push is idempotent — lists/blobs upsert on a stable key, append
  logs insert with `ignoreDuplicates`. Scoping to just the failed rows is what I10 (delta writes,
  deferred) would buy. **`consent_records` is deliberately NOT retried**: `recordConsent` keeps no
  local copy, so a blind retry has nothing to push. That's a separate gap (needs a local consent
  ledger), not something a retry can honestly close — worth a note for a future session.
- The I13 reconnect I/O **cannot be exercised locally** (needs a live Supabase), so — exactly like
  I14 — the pure decision is tested and the thin wiring around it is not.

## ⛔ Dylan's queue

Unchanged from session 7 except: **I13 is now DONE** (was not on Dylan's list — it was a build
item). The live-verification items still matter and now have even more to check.

| # | Action | Why |
|---|---|---|
| 1 | **Live sync check ×3** | Now also exercises **I13**: kill Wi-Fi mid-write, restore, and confirm the row re-pushes on reconnect *without* waiting for a reload — plus I14's paging (rows land; a 2nd hydrate doesn't re-push what's already up). Unexercisable locally. |
| 2 | Physical offline soak — router off 5 min mid-class | P7 flips to ✅ only after this |
| 3 | Install the PWA on phone + room TV | Fastest manifest/icon check |
| 4 | Cross-device Room TV Follow test | Genuinely testable since the session-6 z-index fix |
| 5 | Redeploy persona-ai (v8) | Blocks the blueprint→generate path |
| 6 | Staging Supabase + 0001–0008; prod → Pro | Free tier has no backups |
| 7 | Decide: Sentry | New sub-processor; crash payloads carry member names |
| 8 | **Decide: `eslint-plugin-react`** | Dev-only, but changes a CI gate — the only way to close the JSX blind spot in-tooling |
| 9 | Decide: Edge Function for the member link | Only thing blocking N4's other half |
| 10 | UptimeRobot | 5 minutes |
| 11 | Lawyer; gym pilot conversation | Long-lead |

## Build order for session 8

1. **P2 — the 10-foot rule (IN PROGRESS, started session 7, no code committed yet).** Still 🟡.
   The member-facing Room TV surfaces must be legible at 8m: **primary element (current
   exercise + timer) ~8–12% of screen height, secondary ~3%** (Fable spec §3 / as-built §P2).
   - **The actual gap:** every display font size is a **fixed px** value — `Math.round(N*scaleMult)px`
     — so it does **not** grow with the viewport. On a 4K TV the "160px" timer is a smaller
     *fraction* of the screen than on 1080p, so "8–12% of height" is not enforced anywhere; the
     presets/scales only "gesture at" it. Fix = **enforced minimums**, most cleanly by keying the
     key member-facing sizes to viewport height (`vh`/`vmin`/`clamp()` with a floor) instead of
     fixed px, so the primary element holds ≥~8% of height across 1080p **and** 4K.
   - Surfaces: `FloorLiveScreen` (`floor` mode — the member-facing live board, ~L3467),
     `DisplayScreen` (`coach` mode, full/minimal/timer/interval sub-layouts, ~L3593),
     `OverviewDisplayScreen` (`studio`/plan overview, ~L3232). `DISPLAY_PRESETS`/`FONT_SCALES` at
     ~L3440. **`SCFG` now lives in `src/data/stageConfig.js`**, not App.jsx — imported.
   - **The regression the spec demands and does not have:** Playwright at **1920×1080 and a 4K
     viewport**, asserting the primary element's measured height is within the band. Playwright is
     immune to the "resize without reload" trap (memory), so drive the Room TV, wake the mode
     overlay with a real mousemove, and measure `getBoundingClientRect().height / innerHeight`.
     Mutate a size down and confirm the test fails before trusting it.
2. **Resolve the flagged dead symbols — now FOUR.** Each needs a yes/no:
   `nudgeForContrast` and `resolveSubBrand` (FR-H8) in `src/lib/colors.js`, `SLOT_LABELS` in
   `CalendarScreen`, and now **`fetchBpmData`** in `src/music/spotifyApi.js`. They should not sit
   flagged indefinitely.
3. **N4 member link — only if Dylan deploys the Edge Function.** Design in `LEGAL-AND-SECURITY.md`
   §4. **Do not build the page first** — that's the `<AttendeeView/>` mistake.

**Explicitly deferred:** QR self-check-in · booking/payments/wearables · N2 cohort analytics ·
App.jsx decomposition stages 4–5 · code splitting · **I10 delta writes** · Capacitor · music as a
feature · a local consent ledger for `consent_records` retry.

## Constraints and gotchas — all have bitten

- **`lint:crash` is blind to `<UndefinedComponent/>`.** Most important line on this page. Drive the
  real UI and assert the **error boundary is ABSENT** — "root has children" is not evidence.
- **No infra changes without asking Dylan.** Sentry = service + sub-processor; `eslint-plugin-react`
  = gate change; a new table/migration = his call.
- **Edge Functions deploy by Dylan pasting into the dashboard** — queue, never simulate.
- **A constrained column rejecting a client value is the recurring data-loss bug.**
  `src/lib/dbConstraints.test.js` guards every client value set by reading the migrations — add a
  row when you write a new one. Trap it documents: `members.status = cancelled` (two Ls),
  `entity_status = canceled` (one L).
- **Mutate the code to prove tests can fail**, and confirm the mutation applied by comparing against
  the original text.
- **NEVER round-trip UTF-8 source through PowerShell `Get-Content`/`Set-Content`** — it corrupted
  `movementTaxonomy.js` mid-session once and mangled 77 sequences in the spec. Use editor tools or
  `node -e` with explicit `'utf8'`.
- **Resizing without reloading shows a stale layout** (produced a wrong finding in the Fable audit).
  Playwright is immune. This matters directly for the P2 regression.
- **`Vary: Origin` breaks SW caching** — `ignoreVary: true` is load-bearing in `public/sw.js`.
- **The browser console buffer persists across reloads.** Stale errors look current (false alarm in
  session 6).
- **The Room TV mode switch auto-hides after 4.5s** (deliberate). Wake it with a real mousemove
  first, or the click lands on a detaching element and reads like a flake.
- **`title` does not override text content for a button's accessible name** — use `aria-label`.
- **Local vite build can serve stale App.jsx.** Trust the dev server, e2e, and CI — not local `dist/`.
- **Revert `.claude/launch.json` before committing** (session 7 used port 5199 + `--strictPort`
  because a 2nd chat can hold :5173; it's already reverted to the committed 5173).
- **Screenshots hang** — use `read_page`/`get_page_text`/`javascript_tool`. One PIN digit per call.
  PIN `080921`; `sessionStorage jungle_pin_ok=1` skips it.
- **PowerShell:** `npm.cmd`/`npx.cmd`; commit messages via `git commit -F <file>` (or a heredoc).
- **The crash gate must be 0 and is NOT the style baseline.** Never relax a rule to get a deploy out.
- An honest blank beats a confident wrong guess.
