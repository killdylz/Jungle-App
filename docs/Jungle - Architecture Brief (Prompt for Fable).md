# Jungle — Architecture Brief & Direction Prompt (for Fable)

> **How to use this:** paste everything below the line into Fable. If possible, also attach `src/App.jsx` and `Jungle - Strategy & Direction (Decision Doc).md` for full fidelity. The prompt is self-contained — all key facts are embedded — but the attachments let Fable reason against the real code.

---

## ROLE

You are a **staff-level product architect and technical lead** advising on the strategic and technical direction of **Jungle**, a fitness software product mid-pivot. You combine three lenses: (1) fitness-industry product strategy, (2) SaaS architecture and data modeling, and (3) privacy/compliance for health data. Be **opinionated and decisive** — I want a recommended direction with reasoning, not a menu of neutral options. Push back where my framing is weak. Tie every major recommendation to the industry data provided or to a stated architectural principle.

## MISSION

Jungle's original USP ("group fitness with synchronized Spotify") is dead — both technically capped and illegal for commercial gym use (details below). We have a proposed pivot thesis (below). **Your job has two steps, in order:**

1. **STRESS-TEST THE DIRECTION FIRST.** Do not assume the thesis is correct. Challenge it hard, steelman the strongest alternatives, and deliver a verdict (proceed / modify / abandon) with reasoning. See the **STRESS-TEST MANDATE** section — this is the first thing you produce.
2. **THEN architect.** Only after the stress-test, produce the full architecture and direction spec (deliverables in the OUTPUT section) — built around whatever direction survives your stress-test, not necessarily the one I proposed. If your verdict is "modify," spec the modified direction and say so explicitly.

Treat the thesis below as **a hypothesis to be tested, not a brief to be executed.** I would rather you talk me out of a wrong direction now than build the wrong thing.

---

## THE THESIS / USP TO ARCHITECT AROUND

**Jungle is the white-label, software-first experience-and-delivery layer for coaching — group classes and 1:1 — that lets coaches plan, run, and execute, informs the member on-screen and (later) on their wearable, and is instrumented to the outcome operators pay to fix: first-90-day retention. It sits ON TOP of booking/billing incumbents (Mindbody, Glofox, PushPress), not against them.**

Positioning line: *"Your own Orangetheory-grade experience — on your brand, AI-programmed, working with the wearables your members already own — without franchising or committing to one hardware vendor."*

Key strategic commitments (treat as fixed constraints unless you make a strong case otherwise):
- **Not a CRM.** Do not rebuild booking, billing, payments, or memberships. Integrate with incumbents. Hold this line for the first 1–2 years.
- **Land-and-expand, not storm.** Win the experience/retention layer first; only later, from a position of owning the member relationship + data, consider absorbing adjacent scope.
- **Music is demoted** from headline to an optional, legal touchpoint (on-screen clarity is the real value, not audio).
- **Group and 1:1 share one primitive:** a *session* = programmed stages/exercises assigned to N people. Group = assigned to a class; 1:1 = assigned to one client.
- **Wearable-agnostic** via an aggregator, not locked to one hardware vendor.

---

## WHY THE PIVOT (constraints that killed the old USP)

- **Spotify technical cap:** developer mode allows only ~5 authenticating accounts (was 25); Extended Quota Mode is org-only (requires registered business + ~250k MAU) — unattainable for us.
- **Spotify legal:** personal Spotify in a commercial gym violates Spotify ToS *and* public-performance copyright law. Enforcement is via PROs (ASCAP/BMI/SESAC/GMR) through field audits; statutory damages up to **$150,000 per work**. Spotify itself barely enforces; the PROs bill/sue the gym.
- Conclusion: the music layer cannot carry the product. It becomes an optional, licensed/segmented feature.

---

## INDUSTRY DATA (use these to justify recommendations)

**The problem (retention):**
- Boutique studios run **30–50% annual churn**.
- **~50% of new members quit within 90 days.**
- A member attending **<4× in month one has ~80% chance of cancelling.**
- A $360k/yr studio loses ~half of revenue to churn and re-acquires it yearly.
- Incumbent software owns the transaction (booking/billing/CRM) and, by its own admission, does **not** automate disengagement/at-risk detection.

**The proof the experience layer is worth money:**
- **Orangetheory** built a ~**$1B franchise** essentially on the on-screen heart-rate experience. HR-monitored group fitness retains **~40% better** than conventional.
- **Myzone** sells "the OTF effect" horizontally to independent studios (in-room HR screens, effort-points currency, at-risk insights) — proving studios *buy* an experience add-on and a 3rd party can sell it. **Myzone/Virtuagym/eGym already occupy part of this layer** (the layer is NOT empty).

**Market:**
- Gym-management software ≈ **$2.2B, ~10–12% CAGR**.
- Boutique studios spend **$300–800/mo** on software and already buy add-ons (branded apps, AI tiers).

**The defensible gap (why us, given Myzone/OTF exist):**
- Myzone is **hardware-first and its own brand** (screen sells belts; effort points are Myzone's; needs their hardware; thin on programming; weak on 1:1).
- OTF is **vertical** — full experience only by becoming a franchise.
- Neither can offer a **white-label, software-first, programming-integrated, group+1:1, wearable-agnostic** experience layer. The moat is *their* business-model constraints.

**Why now:** AI programming + AI retention insight are the fresh levers OTF/Myzone lack, arriving as OTF hits franchise fatigue.

---

## WHAT EXISTS TODAY (inventory + honest state)

Single-file React app: `src/App.jsx` (~8,400 lines), React 19 + Vite + Supabase. 16 screens. External APIs: Spotify (music+Web Playback SDK), Deezer (BPM), ExerciseDB via RapidAPI (needs user-supplied key), wger (open-source exercises), QR server, Google Fonts.

**Strong / real:**
- **Brand Studio** — white-label skinning (presets + fine-tune tokens + LLM brand recommendation via a Supabase `smart-build` Edge Function + logo/branding). Most differentiated asset.
- **Class/workout builder** — stage/exercise programming, templates, LLM "smart build," exercise data from wger + ExerciseDB.
- **Live + display screens** — Live runner, Display, Overview, Floor TV (in-room experience).
- **RBAC + multi-tenant scaffold** — roles/allowlist/memberships in Supabase (recently shipped); capability-based `can()` gating.

**Dying USP:**
- **Music** — Spotify auth (PKCE), Web Playback SDK, DJ/auto-DJ, BPM (already sourced from **Deezer**, not Spotify).

**Cosmetic / not wired to data (currently theatre):**
- **Analytics** — hardcoded fake KPIs/attendance.
- **Members** — demo data.

**Data reality:** almost everything real (classes, library, history, branding, skins) lives in **localStorage**; only auth/membership is in Supabase. No true cross-device/multi-user data yet.

---

## CONSTRAINTS & GUARDRAILS (must respect)

**Technical:**
- Wearable/music OAuth + sync **must be server-side** (Edge Functions/backend); browser cannot hold these tokens.
- **Strava is a data-source trap:** 2024–25 API terms forbid displaying a user's Strava data to anyone but that user (kills coach-sees-client + Strava leaderboards), **forbid AI/ML use of Strava data**, cap storage at 7 days, impose design constraints. Use Strava ONLY as an export destination, never an input.
- **Wearable push:** Garmin **Training API** can publish planned workouts to Garmin Connect → device (requires Developer Program approval). **Strava does not accept planned/pushed workouts.** **Apple HealthKit is on-device only** (needs a native iOS app for pull).
- Prefer a **wearable aggregator** (Terra/Thryve/Rook/Vital) over per-vendor integrations.
- The single 8,400-line `App.jsx` must be modularized; treat a per-screen split as a prerequisite for the data migration.

**Legal / compliance (health data):**
- Wearable/HR/workout data = **special-category** under GDPR → explicit consent + lawful basis.
- **HIPAA generally does NOT apply** (gyms sit outside it), but consumer-health-data laws do and are aggressive: **Washington MHMDA** (applies to any WA resident, **private right of action**), California CMIA/CCPA, Nevada SB370, Connecticut CTDPA; **FTC Health Breach Notification Rule** (60-day notice).
- Per actor: **member** needs granular consent + view/withdraw/delete + control of who sees data; **coach** access gated by RBAC + "not medical advice"; **operator** is controller (we're processor) → **DPA per gym** + breach-liability allocation + injury/duty-of-care (waivers, PAR-Q-style screen before individualized load).
- Third-party API terms (Apple/Garmin/Strava) are a second, contractual legal layer.

**Business:**
- Price against the **retention outcome**, not features (a few retention points ≫ a $50–150/mo subscription).
- Beachhead: independent boutique + PT studios wanting the OTF/Myzone effect **on their own brand**; multi-location independents wanting cross-site consistency **without franchising**.

---

## STRESS-TEST MANDATE (produce this FIRST, before any spec)

Before architecting anything, rigorously challenge the proposed direction. Assume I am biased by sunk cost — the pivot conveniently reuses the assets I've already built (Brand Studio, class builder, displays), which is exactly the kind of rationalization that produces wrong strategy. Your job here is to be the skeptic I don't want but need.

Address all of the following explicitly:

1. **Attack the core thesis.** Is "white-label, software-first experience/retention layer, sold on top of incumbents" actually the best opportunity for these assets and this founder — or is it a comfortable story? Give the strongest case *against* it.
2. **Steelman 3–5 alternative directions** and score each vs. the proposed one on: size of prize, defensibility, time-to-revenue, build cost, founder/asset fit, and regulatory drag. Candidates to consider (add your own): (a) go all-in on **remote 1:1 coaching** (compete with Trainerize/TrueCoach); (b) pure **AI programming/content engine** licensed to studios and coaches; (c) **resell/partner with Myzone/aggregators** rather than build the experience layer; (d) **consumer/prosumer** app where personal Spotify is legal and there's no B2B sales motion; (e) **verticalize** (become the branded studio concept, à la OTF) instead of selling software; (f) narrow **in-room display/Floor-TV** tool as a wedge.
3. **Name the load-bearing assumptions** the proposed thesis depends on, rank them by "most likely to be false × most damaging if false," and state what evidence would falsify each. Explicitly assess: *do independent studios want a white-label OTF/Myzone alternative badly enough to adopt and pay, given Myzone already exists?*
4. **Kill criteria.** What would have to be true for this to be a clear no-go? Are any of those already true?
5. **Distribution & go-to-market reality.** The thesis assumes we can reach and sell to boutique studios. Is that motion viable for this founder, or is the product idea gated by a sales problem we can't solve? Weigh this against consumer/self-serve alternatives.
6. **Sequencing sanity check.** Is "experience layer now, wearables/health-data later" the right order, or does the real defensibility live in a piece I'm proposing to defer (or vice versa)?

**Deliver a verdict:** PROCEED (thesis holds), MODIFY (thesis holds with specific changes — name them), or PIVOT AGAIN (a named alternative beats it — make the case). Then, and only then, spec the surviving direction below.

## WHAT I NEED YOU TO PRODUCE (deliverables, AFTER the stress-test verdict)

Produce a single structured document. Lead with the stress-test above and its verdict, then these sections — architected around the **surviving** direction:

1. **Recommended direction & architecture (decisive).** State the target architecture in a diagram-in-text (client, backend/Edge Functions, data layer, integration/aggregator layer, LLM services). Justify the shape against the thesis and constraints. Call out anything in my thesis you'd change and why.

2. **Core functional specification.** The must-build features for the proven core: the **session/assignment model** (group + 1:1 on one primitive), programming/builder, in-room delivery/displays, retention loop (real analytics + at-risk-member detection), white-label brand across member touchpoints. For each: purpose, key user stories (coach / operator / member), acceptance criteria, and the retention/industry rationale.

3. **Design specification.** UX principles for an "experience layer" (on-screen clarity of *what am I doing now*, shared/gamified in-room experience à la OTF, brand-forward, minimal cognitive load in-room). Screen-by-screen intent for the core flows (plan → run → execute) across group and 1:1. Accessibility and large-display (Floor TV) considerations.

4. **Technical specification.** Data model (health-data-grade: tenancy isolation, RLS, consent records, retention/deletion, encryption); the `MusicProvider` abstraction (Soundtrack for gyms / Spotify for individuals / tempo-guidance mode); the wearable integration architecture (aggregator choice, push vs pull, server-side token handling, Strava as export-only); LLM services (class + brand generation, at-risk detection); modularization plan for `App.jsx`; testing strategy.

5. **Deprecation list.** What to remove or demote, with migration notes. (Candidates to assess: Spotify-as-commercial-playback + in-browser Web Playback SDK as a core dependency; the per-user Spotify allowlist model; mock Analytics/Members as if real; user-supplied RapidAPI key for GIFs; localStorage as system-of-record; the monolithic single file.)

6. **New features to reach the next level.** Sequenced net-new: real retention analytics + at-risk detection, light wearables (in-room HR via aggregator, export-to-Strava), tempo-guidance, licensed music integration, then deep bidirectional wearable sync (push-to-Garmin) behind the compliance foundation; consent/health-data layer; coach + consumer tiers. For each: value, dependency, and compliance weight.

7. **Phased roadmap** with an explicit **critical-path spine** and a core-vs-speculative split (core = proven demand, build now; speculative + high-compliance = defer behind validation).

8. **Risks & open decisions** — what would kill this, mitigations, and the decisions I must make.

## OUTPUT FORMAT

- Lead with the **STRESS-TEST verdict** (PROCEED / MODIFY / PIVOT AGAIN) and a 1-paragraph executive recommendation. If MODIFY or PIVOT AGAIN, make the rest of the document reflect that surviving direction — do not spec the original thesis out of politeness.
- Then the 8 sections above, in order, with clear headers.
- Use tables for the data model, deprecation list, and roadmap.
- Every major recommendation cites either an industry data point above or a named architectural principle.
- Be concrete enough to hand to engineers; flag assumptions explicitly.
- Where you disagree with my thesis or constraints, say so in a short "Pushback" callout with your reasoning.

## OPEN QUESTIONS FOR YOU TO RESOLVE OR FLAG

1. Should the `App.jsx` modular split happen **before** or **in parallel with** the Supabase data migration?
2. Aggregator vs. direct wearable integrations — pick one and justify (cost, coverage, compliance, speed).
3. What is the **minimum** viable retention-analytics feature that an operator would pay for, given data starts empty?
4. How should consent + data-sharing (member ↔ coach ↔ gym) be modeled so it satisfies GDPR + MHMDA without crushing UX?
5. Native iOS app (for Apple HealthKit pull) — necessary for the core, or defer? Justify.
