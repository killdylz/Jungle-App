# UI-UX-DIRECTION — design direction, per-screen audit, and the full replacement copy

_Fable audit, 2026-07-19. Walked in the running dev build (localStorage build, PIN 080921),
desktop and 375px mobile. Line references against `App.jsx` at `1b18442`._

---

## 1. The design direction (opinion, not options)

Jungle already has a real identity: the Canopy skin (Space Grotesk display / Hanken Grotesk body,
deep green-black, mint accent) is distinctive and the Brand Studio proves the token system works.
The gap is not taste — it is **discipline and states**. Concrete direction:

**Type scale.** Adopt a fixed 6-step scale and stop free-handing px values: 11 (meta), 13 (body),
15 (emphasis), 20 (card title), 28 (screen title), 44+ (display surfaces, already governed by
`FONT_SCALES`). Everything currently between 10–16px collapses onto 11/13/15. All-caps micro-labels
(the current `label` style) stay — they are part of the identity — but only one per card.

**Spacing.** 4px base grid, card padding 20, gap between cards 16, section gap 32. The screens
mostly do this already; the Builder's right column and Personas cards drift — bring them back.

**Colour.** Tokens only — no raw hex in JSX outside `src/data`/Brand Studio (there are dozens:
`CLASS_COLORS` `:826` is fine as data; inline `#8B5CF6`s in components are not). One accent per
screen; type-colour dots (already good on UP NEXT) carry category, never text colour alone.

**Motion.** Keep what exists (pulse on timers, reduced-motion honoured). Add exactly two things:
120ms ease-out on card hover/press, and a 200ms fade on view change. Nothing else. No springs.

**Density.** Coach surfaces are information-dense and should stay so (the Personas profile card is
right). Owner surfaces (Dashboard, Members) want more air: fewer, bigger numbers.

**Empty states.** The pattern is already in the codebase at its best on RosterScreen ("No members
yet. Import a CSV above, or check people in from the Class Runner — a name is all that's needed").
Every empty state must do those three things: say what's missing, why, and the one action that
fills it. The Dashboard's four zero-KPIs fail this — see §2.

**Error states.** Every error names the outcome and the next action, never the mechanism. The full
rewrite table is §4. Rule: **a coach is never shown the words** parser, JSON, corpus, extraction,
Edge Function, Supabase, persona-ai, blocks, non-2xx, or a confidence percentage.

**Loading states.** Skeleton cards (not spinners) on Dashboard/Members/Personas; the only spinner
that survives is inside buttons ("Reading deck 3 of 5…" style progress text beside it).

**What "premium a studio is proud of" means here:** the Room TV and the member link are the two
surfaces a member ever sees. They must be flawless before any staff screen gets polish. The Room
TV currently prints "No tracks"/"0 tracks" on every stage card — a member-facing surface
advertising an internal absence five times. Remove track UI from member surfaces entirely when
`FLAGS.music` is off.

**Reference points:** Linear (density + type discipline), Vercel dashboard (empty states),
Whoop/Ladder app (fitness tone without bro-slop). Not Mindbody — that is the look being escaped.

## 2. Per-screen audit (three-life test: T=trainer, O=owner, M=member)

| Screen | Serves | Verdict + specific fixes |
|---|---|---|
| **Dashboard** `:1821` | T (weak) | Zeros-everywhere on day one ("0 · 0.0 · 0 · 0") reads as a dead product. Replace KPI row pre-data with a setup checklist card (bring in classes → run first class → import attendance). Cut the AUTO-DJ card (music quarantine). "GOOD EVENING, COACH" is good — keep. |
| **Class Builder** `:5215` | T | Left 60% is strong. Right column is music theatre (cut per AUDIT 2.1) — replace with the class summary + "Preview on TV". ENERGY CURVE bar labels truncate ("WARM-U", "CIRCUI") — if the curve stays (it is nice), rotate or dot-label it. |
| **Coach Personas** `:7668` | T | The deepest screen and the USP carrier, buried under jargon (§4) and enum leaks: scheme chips render raw `sets_reps` (`fmtScheme`/chips in `PersonaProfilePanel` `:8476`); "FOCUSstrength" label runs together; "→ builds as Strength Training" is dev-speak (say "Drafts as: Strength Training"). Rename the whole surface **"Coaches"** (nav) — a persona is just a coach. |
| **Templates** `:1942` | T | Retire as a nav destination (AUDIT 2.3). Content moves into Builder presets. |
| **Exercise Library** `:4525` area | T | Keep; becomes the one movement home after Glossary merges in. Fix fantasy names. Discover tab: honest coming-soon is fine. |
| **Glossary** `:2529` | none clearly | Cut from nav; merge real cues into Library detail. |
| **Class Runner** `:5964` | T | Best screen in the app. Keep. Auto-DJ tab goes with the quarantine; "🔊 Browser" device chip goes with it. |
| **Room TV** `:5798` | M | The member-facing surface. Remove "No tracks"/"0 tracks"/BPM chips when music is off; stage cards otherwise strong. The 4.5s overlay is good. |
| **Check in panel** `:5856` | T/O | Copy is house-best. Keep exactly. |
| **Schedule** `:2645` | O (weak) | "Shoreditch · 3 studios" fabricated header (AUDIT 1.3). Hide "Demand heat"/"Auto-fill week" until real. The grid itself is fine; it needs `class_instances` to mean anything — keep minimal. |
| **Members** `:7341` | O | The model screen. When at-risk fires, this is the owner's morning number — consider making it the owner's landing view. |
| **Team** `:8840` | O | Local-build message leaks stack: "Team management needs the Supabase backend. It's disabled in local mode." → "Team accounts are available on the online version." |
| **Brand Studio** `:3469` | O | The demo wow. "I will suggest a contrast-safe scheme" — drop first person ("Get a suggested palette that passes accessibility checks"). Otherwise ship as is. |
| **Profile/Login/PIN** | T | PIN screen fine for local build. |

## 3. Mobile (the priority fix)

One layout change unlocks the phone: below 900px, `AppSidebar` becomes a **bottom tab bar with 4
entries + "More" sheet**: Run · Build · Members · Brand → More (everything else). The runner and
check-in — the two things actually used mid-class — become thumb-reachable. Implementation:
`useWindowWidth` already exists in `src/ui/primitives.jsx`; render `AppSidebar` xor `BottomNav` on
the same nav data. Then per-screen: Builder stacks columns (music column is gone anyway); Personas
cards stack; type scale unchanged. Estimated one focused day, and it is Day 2 of WEEK-PLAN.

## 4. The complete replacement copy (U1) — apply mechanically

Rule everywhere: **name the outcome, not the mechanism; errors say what to do.**

| Location | Today | Replace with |
|---|---|---|
| `VIEW_LABELS` `:27` | "Coach Personas" | **"Coaches"** |
| Personas header `:~7770` | "COACH PERSONAS / Pick a coach, connect their class plans, then draft a new class in their style" | "COACHES / Every coach's classes, style and formats — Jungle learns them and drafts new classes to match" |
| New-persona form | "New persona" · kinds "Coach — an individual / House — whole-facility style / Format — a single class type" | "Add a coach" · "A coach / The house style / A class format" |
| `:8359` | "Add to corpus" | "Save class" |
| `:8358` | "Extract & add" / "Extracting…" | "Read this class" / "Reading…" |
| `:8334` | tabs "Paste deck text" / "Paste JSON" | "Paste class text" / hide the JSON tab behind a "for developers" disclosure (or cut) |
| `:8351` | "Paste the deck's text / coach notes — persona-ai extracts the blocks, schemes and movements…" | "Paste the class as text — Jungle reads the exercises, sets and reps for you." |
| `:8352` | 'Paste extraction JSON — { "blocks": … }' | (goes with the hidden JSON tab) |
| `:7801` | "Not valid JSON — paste an extraction object like { \"blocks\": [ … ] }." | "That doesn't look like a class. Paste the class text instead — Jungle will read it." |
| `:7803` | "No blocks found in that JSON." | "No exercises found in that text. Check it includes the movements and sets, then try again." |
| `:7838` | "the built-in parser only understood 53% of that text and the persona-ai fallback isn't available (…)" | "Jungle couldn't read parts of this class. Tidy the text (one exercise per line works best) and try again — or add the exercises by hand." |
| `:7861` | "Extraction failed: {e}. Switch to Paste JSON to add it manually." | "Couldn't read that class. Tidy the text and try again, or add the exercises by hand." |
| `:8082` | "N slide(s) used notation the built-in parser couldn't read confidently, and persona-ai isn't available to fall back on — import them via Add plan → Paste deck text" | "N classes couldn't be read automatically. Open them in Slides, copy the text, and use Add class → Paste class text." |
| `:8326` | "Each deck is read via the Google Slides API (read-only) and extracted by persona-ai into blocks, schemes and movements. Already-imported decks are detected and skipped by default." | "Jungle reads each deck from Google Slides (view-only — nothing is changed) and turns it into classes. Decks you've already brought in are skipped." |
| `fnErrorMessage` fallback `:7294-7307` | "Edge Function returned a non-2xx status code" | "Jungle's reading service didn't respond. Check your connection and try again — your text is still here." |
| Scheme chips (`PersonaProfilePanel`, catalog rows) | raw `sets_reps`, `amrap`, `rounds`, `time` | Label map like `ROLE_LABEL`: "Sets × reps", "AMRAP", "Rounds", "For time" — add `SCHEME_LABEL` next to `ROLE_LABEL` `:7280` |
| Profile card | "FOCUSstrength" (run-on) | "Focus: strength" (spacing bug) |
| Profile card | "→ builds as Strength Training" | "Drafts as: Strength Training" |
| Class shape card `:8584` | "Your shape — saved, and kept as you left it." | Keep — this one is good. |
| Team screen `:8899` | "Team management needs the Supabase backend. It's disabled in local mode." | "Team accounts are available on the online version of Jungle." |
| Brand Studio `:~3550` | "Describe your gym or pick a type - I will suggest a contrast-safe scheme…" | "Describe your gym or pick a type — get a suggested palette that passes accessibility checks." |
| Brand Studio `:3748` | "Extracted:" (palette from logo) | "From your logo:" |
| Sync banner labels `SYNC_DOMAIN_LABELS` `:7623` | already plain ("class plans", "movement catalog") | Keep. |
| Footer `:9448` | "© 2026 Dylan Rodrigues. All rights reserved." | Gym name + "Powered by Jungle" (staff surfaces); nothing on member surfaces |
| `index.html` title | "jungle-app" | "Jungle" (runtime: gym name once branded) |

Pattern to copy for all label maps: `ROLE_LABEL` / `MOVEMENT_CATEGORY_LABEL` (`App.jsx:7280-7283`).

## 5. Touchpoint map — where Jungle shows up, trainer → member → social

**Trainer week:** plan (Sunday, laptop — Coaches screen + Builder) → walk in (phone — today's
class one tap from Dashboard) → run (phone as remote + Room TV) → after (check-in sweep already
done in-class; history writes itself). Jungle should be invisible after the class — no admin tail.

**Member journey:** discovers gym (not Jungle's job) → first class: the Room TV in gym brand is
the first impression → between classes: **the magic-link class summary (N4) is the only presence**
— what we did, PRs/benchmarks when they exist, next class time, gym-branded → about to lapse: the
gym reaches out (coach's WhatsApp, drafted by Jungle from the at-risk screen — human sends it).
Jungle never contacts a member directly; it arms the human relationship.

**Owner:** morning number = Members screen (at-risk count + check-in trend). Weekly decision =
which classes are dying (needs N2 — post-pilot). What they show a prospect = Brand Studio + the
Room TV running their brand.

**Social.** One artefact, done well: the **class summary card** — a 1080×1920 gym-branded image
generated client-side (canvas, free) from the magic-link page: class name, the workout, the
member's check-in streak. Member posts it to their story themselves; the gym's brand (not
Jungle's) does the marketing. No feed, no accounts, no likes — Jungle is not a social app, and
PDPA exposure stays near zero because the member chooses to share their own card. Gym-side: the
same card sans member data ("tonight's class") for the gym's own Instagram. Build after N4 —
it is a rendering of data N4 already has.
