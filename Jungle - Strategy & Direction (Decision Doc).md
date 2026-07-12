# Jungle — Strategy & Direction (Decision Doc)

**Status:** Draft for decision · **Date:** 2026-07-11 · **Owner:** Dylan

> Purpose: put the direction on record before committing build effort. This doc replaces the original "synchronized Spotify" USP with a validated, defensible thesis and sequences the work so we lead with proven demand and defer the highest-compliance, least-validated pieces.

---

## 1. The decision in one paragraph

Jungle stops being "a gym app with synced Spotify" and becomes **the white-label, software-first experience-and-delivery layer for coaching — group and 1:1 — that helps coaches plan, run, and execute, informs the member on-screen and (later) on their wearable, and is instrumented to the outcome operators actually pay to fix: first-90-day retention.** It sits **on top of** the booking/billing incumbents (Mindbody, Glofox, PushPress), not against them. Music is demoted from headline to an optional, legal touchpoint. We lead with the proven core (programming + in-room experience + retention loop + brand) and defer deep bidirectional wearable/health-data sync until the core is winning and the compliance foundation exists.

**Why this changed:** the original USP is both technically capped (Spotify's 5-account dev-mode limit; Extended Quota is org-only) and legally unusable in a commercial gym (Spotify ToS + PRO/public-performance law, enforced by ASCAP/BMI/SESAC/GMR field audits — statutory damages to $150k/work). The music layer cannot carry the product.

---

## 2. What Jungle is today (honest inventory)

Single-file React app (`src/App.jsx`, ~8,400 lines), Vite + Supabase, 16 screens.

**Strong and real:**
- **Brand Studio** — white-label skinning engine (presets + fine-tune tokens + LLM brand recommendation + logo/branding). Most differentiated asset.
- **Class/workout builder** — stage/exercise programming, templates, LLM "smart build," exercise data from wger (open-source) + ExerciseDB (RapidAPI).
- **Live + display screens** — Live runner, Display, Overview, Floor TV. The in-room experience layer.
- **RBAC + multi-tenant scaffold** — roles/allowlist/memberships in Supabase (recently shipped).

**Dying USP:**
- **Music** — Spotify auth + Web Playback SDK + DJ + BPM (BPM already sourced from Deezer, not Spotify). Playback is the unusable part.

**Cosmetic / not wired to data (risk if demoed as real):**
- **Analytics** — entirely hardcoded (fake KPIs, attendance). Theatre.
- **Members** — demo data ("would come from a backend").

**Data reality:** almost everything real (classes, library, history, branding) lives in **localStorage**, not the cloud. Only auth/membership is in Supabase. No true cross-device/multi-user data yet.

---

## 3. The problem we're solving

Boutique studios run **30–50% annual churn**, front-loaded: **~50% of new members quit within 90 days**, and a member attending **<4× in month one has an ~80% chance of cancelling**. For a $360k studio, ~half of revenue is lost and re-acquired every year.

Incumbents own the **transaction** (booking, billing, CRM) and — by their own admission — don't surface or act on disengagement. The thing a member actually pays for — a great, branded, well-delivered class — has almost no software supporting its creation and delivery. **The class experience is the retention lever, and no one builds software for it.**

Coaches, in parallel, want tooling weighted toward **delivery and client experience**, not more back-office CRM — and programming week after week (for group *and* 1:1) is a time sink where quality drifts between coaches.

---

## 4. Market & competitive landscape

**Market:** gym-management software ≈ **$2.2B, ~10–12% CAGR**. Boutique studios spend **$300–800/mo** on software and already buy add-ons (branded apps, AI tiers). Money moves in this space.

**The stack has four layers:**

| Layer | Who owns it | Our stance |
|---|---|---|
| Transaction / back-office | Mindbody, Glofox, PushPress, TeamUp, ClubOS | **Integrate, don't fight** |
| Remote 1:1 coaching | Trainerize, TrueCoach, TrainHeroic | Overlap; we do group + in-room too |
| Group-class content | Wodify, SugarWOD, BOX12 | Dated, niche, not white-label |
| Wearable / data | Garmin, Strava, Apple Health, Whoop; aggregators Terra/Thryve | Consume via aggregator |
| **In-room experience + delivery** | **Partially: Myzone, Virtuagym, eGym** | **Our wedge (see §5)** |

**Two proof points that the experience layer is worth money:**
- **Orangetheory** — built a ~$1B franchise essentially on the on-screen heart-rate experience. HR-monitored group fitness retains **~40% better** than conventional. The experience layer is the most valuable thing in the building.
- **Myzone** — sells "the OTF effect" horizontally to independent studios (in-room HR screens, effort-points currency, at-risk-member insight). Proves independent studios *buy* an experience/engagement add-on and a third party can sell it.

**Honest correction:** the experience layer is **not empty**. Myzone/Virtuagym/eGym occupy part of it. The gap is narrower and sharper than "nobody does this."

---

## 5. The gap & positioning (the defensible wedge)

Look at what the incumbents **structurally cannot be**:

- **Myzone is hardware-first and its own brand.** The screen sells belts/watches; the experience and effort-points are *Myzone-branded*; it needs their hardware; it's thin on **programming** and weak on **1:1**. A studio on Myzone reinforces Myzone's brand, not its own.
- **Orangetheory is vertical.** You can get the full experience only by *becoming an OTF franchise*. There is no "OTF experience on my own brand."

**The gap:** a **white-label, software-first experience-and-delivery layer** that:
1. runs on the **studio's own brand**,
2. integrates **programming → in-room delivery → member touchpoints** in one flow,
3. covers **group and 1:1** on the same primitives, and
4. is **wearable-agnostic** (BYO device via aggregator), not locked to one hardware line.

No competitor offers this combination — and the moat is made of **their** business-model constraints (Myzone can't white-label without cannibalizing hardware; OTF can't unbundle without breaking franchising). That's the most durable kind of moat.

**Positioning line:** *"Your own Orangetheory-grade experience — on your brand, AI-programmed, working with the wearables your members already own — without franchising or committing to one hardware vendor."*

---

## 6. Why now

- **AI programming** (our LLM class-builder) is the fresh lever OTF/Myzone lack — "every class expertly programmed and on-brand, automatically."
- **AI retention insight** — research says current software doesn't automate at-risk-member detection; that's an open, wanted feature.
- **OTF is reportedly hitting franchise fatigue** — the incumbent experience model looks tired at the moment a software-first, brandable alternative could appear.

---

## 7. How to exploit it

- **Wedge, don't storm.** Land as the experience/retention layer **on top of** the existing booking system, integrated. Sell what they don't have, not a worse version of what they do.
- **Price against churn, not features.** A studio bleeds ~half of $360k/yr to churn; a few retention points is worth thousands/month — dwarfing a $50–150/mo subscription. Sell the **outcome** (a retention dashboard), priced against the loss. This beats add-on fatigue.
- **Beachhead:** independent boutique + PT studios that want the OTF/Myzone effect **on their own brand**, plus **multi-location independents** wanting OTF-style cross-site consistency **without franchising**.
- **Own the high-frequency touchpoint.** Incumbents own the low-frequency transaction (book/pay monthly). We own the **daily** engagement (class, screen, workout) and the member data. High-frequency beats low-frequency in platform wars.

**On "phasing out other applications" (land-and-expand):** legitimate as a long-term endgame, dangerous as an opening move.
- **Hold the "no CRM" line for the first 1–2 years.** The moment we bolt on scheduling/payments early, we become a worse Mindbody and lose the wedge.
- **Earn the right to expand.** Owning the member's daily experience + data is what later makes migrating their booking/payments a small step — and makes the incumbent the removable piece. Expand **from strength**, later.

---

## 8. Music, resolved

The point was always **on-screen clarity of "what am I doing right now,"** not audio. Keep the synced-display concept; make audio optional:
- **Commercial gyms** → licensed source (Soundtrack Your Brand has a business-grade API) or "bring your own sound system."
- **Individual coaches / at-home** → personal Spotify is legal (non-commercial); the existing integration is fine for this segment only.
- Route the music backend by **account type**. The licensing problem dissolves because we're no longer the party performing music.

---

## 9. Technical considerations

**Session model (build once):** a *session* = programmed stages + exercises, **assigned to N people**. Assigned to a class = group; assigned to one person = 1:1. This single abstraction serves both markets without forking.

**Wearables — two directions:**
- **Push (plan → device):** "workout of the day to your Garmin." **Garmin Training API** publishes workouts/plans to Garmin Connect → device follows steps on-wrist. Requires Garmin Connect Developer Program approval (days–weeks). **Strava does not accept pushed/planned workouts** — activity ingestion only.
- **Pull (execute → record):** ingest completed activity (HR, duration, calories). Garmin Activity/Health API (Health API is partner-gated, server-side). **Apple HealthKit is on-device only** — no server pull; needs a real iOS app on the member's phone.
- **Use an aggregator** (Terra / Thryve / Rook / Vital) — one OAuth, one normalized schema, 300–500+ devices — over per-vendor integrations. Cost + adds a data processor (privacy implication).

**Strava is a trap as a data source (not a destination):** 2024–25 API changes forbid displaying a user's Strava data to anyone but that user (kills coach-sees-client and Strava-fed leaderboards), **forbid AI/ML use of Strava data** (kills feeding our LLM), cap storage at 7 days, and impose design constraints. Treat Strava strictly as an **export destination** ("post my session to Strava"), never an input.

**Architecture consequences:**
- Wearable OAuth + sync **must be server-side** (Edge Functions/backend) — same lesson as Spotify/Soundtrack. Browser can't hold these tokens.
- **Phase 1 (cloud data) becomes non-negotiable and upgrades to a health-data store** — per-member workout/HR records, real multi-tenant isolation (extends RLS), encryption, retention/deletion policies.
- The 8,400-line `App.jsx` cannot absorb this — modular split moves from nice-to-have to prerequisite.

---

## 10. Legal & compliance (the real step-change)

Touching wearable/HR/workout data makes Jungle a **regulated health-data platform**. Design it in from the schema, not bolted on.

- **Special-category data.** Under **GDPR** (any EU/UK member) health + biometric data requires **explicit consent** and a lawful basis — strictest tier.
- **HIPAA almost certainly does NOT apply** (gyms/consumer apps sit outside it) — but the consumer-health-data laws that fill the gap are aggressive against small companies:
  - **Washington My Health My Data Act (MHMDA):** applies if we touch **any** WA resident regardless of our size/location; requires a distinct consumer-health-data policy + specific consent; has a **private right of action** (individuals can sue directly).
  - **California (CMIA/CCPA), Nevada SB370, Connecticut CTDPA** — similar.
  - **FTC Health Breach Notification Rule (amended 2024):** notify users within 60 days of a health-data breach; covers fitness apps.
- **Per actor:**
  - **Member:** granular consent to collect/sync data, plain-language policy, view/withdraw/delete, control over who sees it. Data minimization by default.
  - **Coach:** viewing sensitive client data → gate behind RBAC, bind via terms, explicit "not medical advice."
  - **Operator:** typically the **controller** (we're the **processor**) → **Data Processing Agreement** per gym; breach-liability allocation; **injury/duty-of-care** exposure from LLM-generated programming → waivers, "consult a physician," PAR-Q-style screen before individualized load.
- **Third-party API terms are a second legal layer:** Apple HealthKit (no advertising use, user-controlled), Garmin partner terms, Strava display/AI bans — contractual, enforced by loss of access.

---

## 11. Risks — what would kill this

1. **Myzone/Virtuagym/eGym respond, or "good enough" wins.** Mitigation: the white-label + programming + AI + BYO-wearable combo they can't match — must be sayable in one sentence to an owner.
2. **Wearable deep-integration is the most speculative AND most compliance-expensive piece.** Mitigation: **do not lead with it.** Start light (in-room HR via aggregator, export-to-Strava); add bidirectional health-data sync after the core wins.
3. **Three constituencies at once** — coach (tool), operator (buyer, wants retention proof), member (experience). Hard; also the moat if pulled off.
4. **White-label willingness-to-pay is unvalidated.** The thesis rests on studios wanting their *own* branded OTF experience enough to adopt. Belief, not fact — cheap to test (see §14).
5. **Scope creep into CRM** (the "phase out" trap) — see §7.

---

## 12. Core vs speculative (what to build when)

- **CORE — proven demand, build now:** programming + in-room experience/displays + retention loop (real analytics) + white-label brand + the group/1:1 session model.
- **SPECULATIVE + high-compliance — sequence later, behind validation and the health-data-grade data model:** deep bidirectional wearable health-data sync, push-to-Garmin.

---

## 13. Roadmap (full-commit sequence)

- **Phase 0 — De-risk (now, small):** finish deploy verification; put mock Analytics/Members behind a feature flag so they're never demoed as real; introduce a `MusicProvider` abstraction so Spotify isn't hardwired.
- **Phase 1 — Data foundation (keystone):** move classes/sessions/library/skins/history from localStorage → Supabase with RLS, per gym; build the **session/assignment model** and a **health-data-grade schema** (consent, isolation, deletion). Everything else depends on this.
- **Phase 2 — Make the theatre real:** rebuild Analytics + Members on actual session/attendance data; add at-risk-member detection.
- **Phase 3 — Experience + light wearables:** in-room HR display via aggregator; export-to-Strava; tempo-guidance mode; licensed music integration for gyms.
- **Phase 4 — Architecture health:** split `App.jsx` into per-screen modules (ideally a slice of this *before* Phase 1 so the migration lands clean); add tests around builder/RBAC/session model.
- **Phase 5 — Expand:** deep bidirectional wearable sync (push-to-Garmin) behind the compliance foundation; open coach + consumer tiers; only then evaluate absorbing scheduling/payments from a position of strength.

**Critical path spine:** Phase 1.

---

## 14. Validation plan (do before the big build)

Two weeks, ~zero code. Interview **8–10 real studio/PT owners**. Core question:

> *"Would you pay $X/month for your own branded, AI-programmed, retention-instrumented class experience that works with the wearables your members already own — sitting on top of your current booking system?"*

Lean-in → build with conviction + a pricing anchor. Shrug → saved a year.

**10-question owner script:**
1. Walk me through what happens from when a new member signs up to their 5th class — where do you lose people?
2. What are you doing today to keep members past the first month? How's it working?
3. What software do you pay for now, and what do you wish it did that it doesn't?
4. How do your coaches program classes? How consistent is quality across coaches?
5. How much does your brand/experience matter to why members choose you vs. the gym down the road?
6. Have you used Myzone / heart-rate screens / Orangetheory-style tech? What did/didn't work?
7. If every class were auto-programmed on-brand and members saw exactly what to do on-screen, what would that be worth to you?
8. Would members value their workout landing on their own Garmin/Apple Watch/Strava? Do they ask for that?
9. If a tool could show you which classes/coaches/formats actually retain members, would you use it to make decisions?
10. What would you realistically pay per month for the above as an add-on to what you already run — and what would make it a no?

**Signals to watch:** unprompted mentions of retention/churn as their #1 pain; frustration with generic un-branded member apps; willingness to name a number for a retention outcome; Myzone tried-and-lapsed (validates the white-label/programming gap).

---

## 15. Open decisions (need Dylan's call)

1. **Validate before build, or build the core in parallel with interviews?** (Recommendation: run interviews while doing Phase 0 + the `App.jsx` split, which are low-regret regardless.)
2. **Hide vs. rebuild** the mock Analytics/Members in the short term. (Recommendation: hide behind a flag now, rebuild in Phase 2.)
3. **`App.jsx` split before or after** the data migration. (Recommendation: a slice before, so the migration lands in clean modules.)
4. **Beachhead segment** — lead with independent boutiques, PT studios, or multi-location independents? (Affects the interview list.)

---

*This is a living document — update as validation data comes in.*
