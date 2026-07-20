# AUDIT-FINDINGS — what exists, what is wrong, what to delete, what to combine

_Fable audit, 2026-07-19. Repo at `main` = `1b18442` (4 commits unpushed). App.jsx measured at
**9,456 lines** — note the handoff still says ~8,090/9,200 in places; it has grown._

Ranked by severity. Every item names files and lines. "Cut" means remove from the product;
"quarantine" means flag off and move out of App.jsx without deleting logic.

---

## Severity 1 — contradicts the product's own claims

### 1.1 The app is not usable on a phone. At 375px the sidebar (`AppSidebar`, `App.jsx:8802`)
stays a **sticky 238px column — 63% of the screen** — leaving ~137px for content. No drawer, no
bottom nav, no breakpoint. Verified in the running app at mobile viewport. The brief's own words:
"most of this will be used on a phone in a loud room." This is the single largest gap between
claim and build. **Fix before anything cosmetic** — see UI-UX-DIRECTION §Mobile.

> **CORRECTION (session 5, 2026-07-20).** The measurement above does not reproduce on a fresh
> load, and the correction is worth more than the original finding. `App`'s `isMobile` was
> `vw < 480`, so at **375px a hamburger drawer was already rendering** — no 238px column, no 63%.
> The reading was almost certainly taken **after resizing the window without reloading**:
> `useWindowWidth`'s resize listener does not repaint that component, so the desktop sidebar stays
> on screen at a phone width. The identical stale render appeared while fixing this, which is how
> it was caught. **The real gap was the 480–900px band** — the full sidebar at 40% of a 600px
> screen and 31% of a 768px tablet — plus a hamburger in the top-left, the furthest point from the
> thumb of the hand holding the phone. The prescribed fix (bottom tab bar below 900px) was right
> for both; only the number was wrong. Fixed in `262c83f`.
> **Anyone re-measuring responsive behaviour in this app must reload after resizing.**

### 1.2 White-label surface leaks the founder and the tooling
- `App.jsx:9448` — every screen's footer: **"© 2026 Dylan Rodrigues. All rights reserved."** On a
  white-label product a gym pays for, this is a contradiction in one line. Replace with the gym's
  brand line, or nothing.
- `index.html:5-7` — browser tab reads **"jungle-app"** with the default **Vite favicon**. First
  thing an owner sees when they bookmark it. Set title from gym branding at runtime; ship a real
  favicon + manifest (this is also the PWA prerequisite).
- `App.jsx:34-41` — fonts load from Google Fonts CDN at runtime. Breaks the offline claim (P7)
  and flashes unstyled text on gym Wi-Fi. Self-host the four font families (~200KB, free).

### 1.3 Fabricated location data still leaking on live surfaces
`App.jsx:2737` — Schedule header: **"Shoreditch · 3 studios"** — a hardcoded London district on
what is about to be a Singapore product, on a screen that is NOT flagged off. Same screen:
"Demand heat" (`:2750`) and "Auto-fill week" (`:2756`) buttons whose backing data is mock-gated,
so they render but do nothing meaningful. The `cb6e77f` sales-integrity sweep missed this screen's
header. (Other "Shoreditch"s at `:2338`, `:3402` are behind flags — fine until those screens die.)

### 1.4 Fantasy exercise content presented as coaching reference
- `src/data/glossary.js` — 28 movements including invented names: **"Atlas Press", "Serpent
  Row", "Cobra Push-Up"** presented with muscles/difficulty/cues as if canonical. A real coach
  reads these as noise and downgrades everything else the product says.
- `src/data/library.js` (864 lines) and `src/data/templates.js` — same invented names ("Primal
  Squat", "Atlas Press") inside the default class and starter templates. The default "My Workout"
  puts *Primal Squat* and *Atlas Press* on the Room TV.
**Action:** rename invented movements to their real equivalents (Atlas Press → Overhead Press,
Serpent Row → Single-Arm DB Row, Primal Squat → Back Squat, Cobra Push-Up → Push-Up) — a
find/replace across three data files — and cut the Glossary as a nav destination (fold anything
worth keeping into the Exercise Library detail view).

## Severity 2 — dead weight and duplication

### 2.1 The music/Auto-DJ subsystem: quarantine now, cut from the sellable product
~2,000 lines serving a feature whose value to trainer/owner/member has never been argued in
writing, whose legal position is bad (Spotify consumer ToS prohibits commercial-premises playback;
public performance in Singapore needs COMPASS/RIPS licences the gym must hold), and which renders
half-dead without a Spotify login. Locations in `App.jsx`:
- `:43-45` Spotify client ID/redirect · `:376-474` scopes, PKCE, token save/clear (the
  localStorage-token deprecation violation) · `:506-675` BPM caches, Camelot matching, track
  scoring, Deezer calls (`:545-561`) · `:675-772` `useSpotify` · `:441-466` `rampVolume` ·
  `:795-812` `fireSiren` · `:1363-1441` `TrackItem` · `:1441-1821` `TrackSearch` ·
  `:2921-3178` `MusicHubScreen` · `:3999-4339` `PlaylistImportModal` · `:4868-4943`
  `SpotifyDevicePicker` · `:4943-5050` `DjPlaylistModal` · `:5050-5215` `AutoDjPanel` — plus the
  Builder's entire right column (Soundtrack/Energy curve/Tracks/Auto-DJ panels inside
  `BuilderScreen` `:5215-5798`), the runner's Auto-DJ tab, and the Dashboard "AUTO-DJ" card.
**What stays:** `TempoGuide` (`:6729-6751`) — zero-licence, already the display's no-music state.
**Action this week:** add `FLAGS.music` (default **false**), hide every music surface behind it,
and move the code to `src/music/` untouched (§4.5 step 5 — quarantine, don't refactor). Delete
after the pilot if nobody asks where it went. Do not spend LLM/UI budget on it again.
**Cost of not doing it:** the Builder demos with a half-dead right column; one licensing question
from a gym owner ends the sales conversation; 2,000 lines keep taxing every refactor.

### 2.2 Flagged-off theatre that should now be deleted, not just hidden
These have real-data replacements or no plausible future. Git history preserves them.
- `MemberScreen` `App.jsx:3178-3454` (~276 lines) — superseded by `RosterScreen`.
- `IntegrationsScreen` `:2138-2276` — fake "connected" cards.
- `DiscoverTab` `:4350-4525` — fake marketplace feed (keep the honest coming-soon stub).
- `getAttendeePayload`/`ATTENDEE_PAYLOAD` `:467-505` + the b64 share path `:9264` — dead link
  minting; N4 magic-link is the replacement design.
- `BASE_SCHEDULE` `:827-849` — mock schedule.
Keep `AnalyticsScreen` (`:2276-2529`) flagged off as the N2 layout target, as the spec says.

### 2.3 Three overlapping answers to "what goes in a class" — collapse to two
Today: `WORKOUT_LIBRARY` stage templates (`src/data/library.js` + `buildStagesFromTemplate`
`App.jsx:956`), `TEMPLATES` starter classes (`src/data/templates.js`, its own nav entry), and
Class Blueprints (`src/lib/blueprints.js`, per-coach, on the Personas screen). A coach cannot
hold three mental models. Collapse to:
1. **Class shapes** (blueprints) — the coach's own, plus Jungle presets for cold start. This is
   the persona thesis and the keeper.
2. **The movement library** — per-gym movement catalogue (Exercise Library), which the persona
   catalog should eventually merge into (per-coach view of a per-gym library).
**Action:** retire the Templates nav entry; surface the 6 starter templates as "Jungle presets"
inside the Builder's class-type picker (the picker already exists at `BuilderScreen`); leave
`CLASS_STAGE_TEMPLATES` as the preset backing data. Glossary merges into Library (2.1.4 above).

### 2.4 Half-built items — finish/kill verdicts on the §12 list
| Item | Verdict |
|---|---|
| D3 cold start (no-plans coach) | **Finish** — it is the first 10 minutes of every new gym |
| U1 language pass | **Finish** (UI-UX-DIRECTION has the full copy) |
| M1 Members CRUD | **Finish minimally** (edit name/status/joined; no more) |
| F4-QR self-check-in | **Defer, do not promise.** Coach sweep is the pilot path (P6 evidence: sweep is faster than member-phone-scan in a cold room). Ship the Edge Function only when a gym asks |
| N4 magic-link member view | **Build in week 1** — it is the only member-visible surface and the social artefact carrier (see PRODUCT-DIRECTION) |
| Blueprint-driven parsing | Defer — hints already cover most of it; do after pilot |
| Taxonomy LLM fallback | Defer until a real corpus of blanks exists (as designed) |
| F1 session primitive / PT path | Defer — no pilot customer needs 1:1 yet |
| I5 RLS tests 0001–0006 | **Finish before member data** (see LEGAL-AND-SECURITY) |

## Severity 3 — structural debt (unchanged verdicts, sharpened order)

### 3.1 App.jsx decomposition — the staged plan
Current: 9,456 lines, one file. Order chosen so each stage is mechanical and independently
shippable; **what breaks** is named per stage.
1. **Shared helpers out first** (`hexToRgb`…`generateThemes` `:182-375`, `applySkinCSS` `:96`,
   `P_CARD`/`P_CHIP`/labels `:7278-7307`) → `src/lib/colors.js`, `src/ui/labels.js`. Breaks:
   nothing — pure functions; the risk is a missed import, which `lint:crash` catches.
2. **Leaf screens** → `src/screens/`: Glossary (`:2529`, or delete), Templates (`:1942`, or
   retire), Calendar (`:2645`), AdminTeam (`:8840`), Roster (`:7341`). Breaks: props are already
   narrow (`onBack`); the known trap is components reading module-level singletons (`store`,
   flags) — import them, don't thread them.
3. **Music quarantine** → `src/music/` (2.1 above). Breaks: `BuilderScreen`/`LiveScreen` receive
   `player`/`deviceId`/`djProgress` props — make them optional-null in one commit and render the
   flag-off state.
4. **Personas cluster** → `src/screens/personas/` (PersonasScreen `:7668`, ProfilePanel `:8476`,
   ClassShapeCard `:8527`, MovementCatalog `:8644`, PlanEditor `:8723`). Breaks: nothing external;
   it is already self-contained.
5. **Builder + Live + RoomTV + displays last** (`:5215-7242`) — they share timer/liveState/
   remote state held in `App()`. Extract as one folder with a `useClassRunner()` hook. Breaks:
   the space-bar/timer effects re-gated on `view` — test the runner end-to-end after.
Each stage lands as its own commit with the dev server driven before push (this repo's rule).
**Do stages 1–3 this week; 4–5 after the pilot.** The stale-build gotcha is the reason to do any
of this now: smaller files make the franken-build failure mode less likely and less costly.

### 3.2 Sync architecture — sound shape, two hard edges before more gyms
The local-first + guard design (I3) is right and has earned its scars. Before gym #2:
- **I10 delta writes** for `persona_plans` and `attendance` at minimum — whole-list upserts are
  why one bad row once poisoned every plan.
- **I14 hydrate pagination** — the 2,000-row attendance cap silently truncates a busy studio
  within a year (20 classes/wk × 12 heads ≈ 12,500 rows/yr).
- **I13 background retry** — failures currently wait for the next hydrate.

### 3.3 Bundle and boot
665KB single bundle (166KB gzip), no `React.lazy`, loaded by a TV on gym Wi-Fi. Route-level
splitting after the screens split (stage 2 makes it nearly free). Not this week.

## What is genuinely good (so it doesn't get "fixed")
- The parser/taxonomy/blueprints/retention core in `src/lib/` — tested, mutation-verified, honest
  about blanks. This is the moat. Don't let UI work leak complexity back into it.
- The Members screen copy (`RosterScreen`) — plain-language, says what to do. It is the house
  style the rest of the app should be brought up to.
- Check-in flow: name-typeahead + "Saved on this device, synced when online" is the right P6 UX.
- Brand Studio incl. live WCAG-AA audit — the demo wow. Keep.
- The flags discipline and the crash gate — keep enforcing.
