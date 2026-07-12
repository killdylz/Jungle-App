# Jungle — Stress-Test Verdict & Architecture Spec

**Status:** Response to *Architecture Brief & Direction Prompt* · **Date:** 2026-07-11 · **Author:** Fable (staff-architect review) · **Inputs:** the brief, the decision doc, `src/App.jsx` (8,428 lines, inspected)

---

## VERDICT: MODIFY

**Executive recommendation.** The thesis — white-label, software-first experience-and-delivery layer, on top of booking incumbents, instrumented to first-90-day retention — survives as the *destination*. It does not survive as the *opening move*, and it quietly depends on two things you don't control and one thing that's technically shakier than the doc assumes. Modify three ways: **(M1)** land as a tool — the class operating system (programming → in-room delivery → attendance capture) — and sell the retention *outcome* as the upsell tier once the studio's own cohort data exists (~day 90), because you cannot invoice an outcome you cannot yet measure; **(M2)** capture attendance natively at the point of delivery so the retention loop never depends on incumbent booking APIs, which are paid, gated, and owned by companies with every incentive to squeeze you; **(M3)** make the core biometric-free — at-risk detection v1 is attendance arithmetic, not heart rate, and *all* HR (including "light" live in-room display) moves behind the consent/compliance gate, because your legal exposure starts at the first heartbeat rendered on a screen, not at "deep sync," and because live HR from BYO consumer wearables is the weakest technical link in the plan. Everything else holds: the no-CRM line, the session primitive, music demotion, wearable-agnostic via aggregator (later), land-and-expand. The rest of this document specs the modified direction.

---

## PART A — STRESS-TEST

### A.1 The case against the thesis (steelmanned)

Taking the skeptic's chair as instructed. Five attacks, in descending order of force:

**1. You're selling an outcome you can't measure.** The pricing thesis is "price against churn, not features" — but a retention dashboard is empty on day one and says nothing statistically for ~90 days. Early sales are therefore feature sales wearing outcome clothing, to owners who've heard retention promises from every vendor. Myzone can cite the ~40% retention improvement for HR-monitored fitness; Jungle can cite nothing about *itself* for two quarters per customer. The pitch and the product mature on different clocks, and the doc doesn't acknowledge the gap.

**2. Three constituencies, day one, one founder.** Coach (daily tool), operator (buyer, wants proof), member (experience) — each demands real polish before the combined value prop exists at all. The doc names this as risk #3 and calls it "also the moat if pulled off," which is true, but a moat you must fully build before first revenue is indistinguishable from a swamp. Trainerize won by serving exactly one constituency first. OTF controls all three only because it's vertical. A horizontal solo-founder product that needs all three singing simultaneously has the worst execution profile in the comparison set.

**3. "Sits on top of incumbents" assumes the incumbents let you sit.** The retention loop runs on attendance data, and the doc implicitly sources it from booking systems. Mindbody's API is a paid, gated partner program; incumbents sell their own engagement add-ons and can see a "retention layer" as competition. Nowhere does the doc price, sequence, or de-risk this dependency. As written, the wedge's data spine is rented from the party with the most incentive to evict you.

**4. The white-label premium is asserted, not evidenced — and Myzone's traction cuts against it.** Studios adopted Myzone *despite* the screen advertising Myzone's brand, which suggests brand dilution is not a blocking objection for many owners. The counter-evidence is real (franchisees pay OTF six figures partly *for* a branded experience; studios buy branded member apps as add-ons in the $300–800/mo software wallet), but the honest read is: white-label may be a founder-aesthetic value rather than the buyer's first-order value. The buyer's first-order value might just be "Myzone without the hardware capex." The interview plan (§14 of the decision doc) asks about brand importance but never isolates the white-label *premium* — same product, their brand vs. yours, two price points. That's the question that matters.

**5. The $1B proof point is overclaimed.** OTF's valuation includes franchise economics, real estate leverage, and operations — attributing it to the on-screen experience overstates what a software layer captures. Myzone, the cleaner comp, is a solid hardware business, not a software unicorn. Right-sized: this is a credible path to a $10–50M ARR wedge business (share of the $2.2B/10–12% CAGR market, $300–800/mo wallets) with expansion optionality — worth building, but the narrative should not borrow OTF's zeros.

**Sunk-cost audit (as you requested):** yes, the pivot conveniently reuses every asset you've built — Brand Studio, builder, displays. The test for rationalization is whether the thesis survives with the assets removed: if you started from zero targeting studio retention economics (30–50% annual churn, ~50% gone by day 90), would you still build programming + in-room delivery + attendance instrumentation? Mostly yes — the delivery layer genuinely is where the retention lever lives and incumbents genuinely don't build it. The asset reuse is a happy coincidence with one distortion: **music**. ~2,000 of the 8,428 lines (Spotify auth, TrackSearch, MusicHub, DJ/AutoDJ, device picker) serve the dead USP, and the temptation to keep them load-bearing is pure sunk cost. The doc already resists this correctly. Verdict on the audit: bias present, thesis survives it — with the modifications below.

### A.2 Alternatives, steelmanned and scored

Scale 1–5 (5 favorable). *Reg drag: 5 = lightest.*

| Direction | Prize | Defensibility | Time-to-rev | Build cost | Founder/asset fit | Reg drag | Verdict |
|---|---|---|---|---|---|---|---|
| **Proposed: white-label experience/retention layer** | 4 | 4 | 2 | 2 | 5 | 3 | Right destination, wrong entry sequencing |
| (a) Remote 1:1 coaching (vs. Trainerize/TrueCoach) | 3 | 1 | 3 | 3 | 2 | 4 | No. Red ocean, mature incumbents, and the differentiated assets (Brand Studio, Floor TV, live runner) are irrelevant remotely |
| (b) Pure AI-programming engine, licensed out | 2 | 1 | 4 | 4 | 3 | 4 | No as a company — zero moat, every incumbent adds an "AI programming" button, price collapses to API cost. **Strong as a feature inside Jungle** |
| (c) Resell/partner with Myzone or an aggregator | 1 | 1 | 4 | 5 | 1 | 5 | No. An agency, not a product. Myzone white-labeling would cannibalize its own hardware moat — the partnership you'd need is the one they can't give |
| (d) Consumer/prosumer app (personal Spotify legal) | 3 | 1 | 2 | 3 | 1 | 3 | No. Consumer fitness CAC graveyard, worse churn than the studios you'd be fleeing, and the multi-tenant/white-label/RBAC assets are wasted |
| (e) Verticalize — become the studio concept | 4 | 3 | 1 | 1 | 1 | 2 | No. Capital-intensive, real-estate-and-operations business, different founder |
| **(f) Narrow in-room display + programming wedge** | 3→4 | 3→4 | 4 | 4 | 5 | 5 | **Yes — as the entry point.** Not an alternative to the thesis; the correct door into it. Adoptable in an afternoon, demoable in 15 minutes, generates the attendance data the retention tier later monetizes |
| (g) Coach-first PLG tool (sell the coach, not the studio) | 3 | 2 | 4 | 4 | 3 | 4 | Not the lead — abandons Brand Studio and collides with Trainerize gravity — but survives as the self-serve coach tier later (Phase 5) |

**Reading:** (f) dominates the proposed direction on time-to-revenue, build cost, and regulatory drag while sacrificing nothing long-term — it *is* the proposed direction, entered through the narrow end. This is the core of the MODIFY verdict. (b) and (g) fold in as a feature and a later tier respectively. The rest lose on asset fit or defensibility.

### A.3 Load-bearing assumptions, ranked (likelihood false × damage)

| # | Assumption | P(false) | Damage | Falsifier / test |
|---|---|---|---|---|
| A1 | Studios will adopt a delivery-layer tool into *weekly coach workflow* alongside existing software | Med-High | Critical | 5–10 design partners: if they stop running ≥3 classes/week through it within 4 weeks even free, dead |
| A7 | Attendance capture friction is solvable (coaches/members actually check in) | Med | Critical | Pilot check-in rate <70% of heads-in-room = the data spine, and everything priced on it, starves. *Created by M2 — named honestly* |
| A2 | A white-label **premium** exists (owners pay more for *their* brand vs. a cheaper Myzone-alike) | Med | High | Interviews: same product, their brand vs. ours, two prices. Premium <20% or shrugs = reposition as "Myzone without hardware" |
| A3 | Operators *act* on at-risk alerts (the loop closes only if intervention happens) | Med | High | Pilot: ≥50% of alerts ignored in 30 days = dashboard is shelfware; ship outreach drafts, not just flags |
| A5 | Live in-room HR from BYO consumer wearables is viable at class scale | High | Med (was High — M3 demotes it) | Bench test: 15+ concurrent BLE HR broadcasts into one display device. Most consumer wearables don't stream live; Apple Watch needs a companion app; Myzone ships belts *because* of this |
| A6 | Incumbent booking APIs accessible on acceptable terms | Med-High | Med (was High — M2 demotes it) | Mindbody/Glofox/PushPress partner-program quotes. PushPress likely friendliest; treat any yes as upside |
| A4 | Coaches accept AI-assisted programming | Low-Med | Med | Edit-rate and time-saved telemetry in pilot; >80% rewrite rate = the LLM drafts, coach curates positioning failed |

Direct answer to the brief's explicit question — *do independents want a white-label OTF/Myzone alternative badly enough, given Myzone exists?* Genuinely unknown, and it's A2. Evidence for: franchise fees prove branded-experience value; studios already buy branded apps; your own signal list ("Myzone tried-and-lapsed") describes a reachable cohort. Evidence against: Myzone's traction happened despite brand dilution. The MODIFY verdict deliberately makes the wedge *not depend on A2*: the entry tool sells on programming + delivery + attendance even to an owner indifferent to white-label, and the brand layer prices as premium where it lands. A2 becomes upside, not foundation.

### A.4 Kill criteria

1. **A1 fails:** ≥3 design partners abandon weekly use within a month, free. (The tool isn't wanted; no amount of retention framing fixes it.)
2. **No price signal:** 0 of 10 interviewed owners names ≥$100/mo for the branded, AI-programmed, instrumented experience. (Below that, CAC in this fragmented market never pays back.)
3. **A7 unsolvable:** check-in can't be made <5 seconds/member or coaches won't do it → no attendance → no retention instrument → thesis decapitated.
4. **Myzone (or eGym/Virtuagym) ships a white-label, software-only, BYO-device tier at scale.** Watch, but unlikely: it inverts Myzone's hardware economics — which is exactly why the doc's moat logic is sound.

**Are any true today? No.** But #1 and #2 are testable for ~zero code in 30–60 days, which is why the verdict is MODIFY-and-validate-in-parallel, not PROCEED.

### A.5 Distribution & GTM reality

This is the thesis's weakest leg and the strongest argument for M1. Selling to boutique studios is a grind — fragmented, busy non-technical owners, realistic entry ACV $100–300/mo — and the *platform* version of the pitch ("experience-and-retention layer across your coaches, members, and screens") demands change management no cold email survives. The *tool* version fits the motion a solo founder can actually run: a 15-minute demo with a genuine wow (Brand Studio skins the product with *their* logo live in the meeting → LLM generates tonight's class → it's running on a TV), adoptable without touching booking/billing. Sequence: 8–10 owner interviews (the doc's §14 script, plus the A2 isolation question and "what would make you drop Myzone?"), recruit 5–10 design partners *from* those interviews at a nominal price — charge something; free pilots don't validate willingness-to-pay — then integration marketplaces (PushPress partner directory first; Mindbody's program when revenue justifies its cost) and studio-owner communities. Multi-location independents are the second act (real ACV, cross-site consistency need), not the first call. Consumer/self-serve does not rescue distribution — see alternative (d) — but the coach tier (g) later adds a genuinely self-serve motion. Verdict: viable *only* with the narrow wedge; the doc's GTM was underspecified for the platform it proposed.

### A.6 Sequencing sanity check

The brief asks whether deferring wearables/health-data defers the actual moat. **No — the deferral is correct, and should go further (M3).** Defensibility here accrues in this order: (1) becoming system-of-record for the *delivered experience* — programming, attendance, in-room — which no incumbent captures; (2) white-label switching costs — the studio's member-facing identity runs through you; (3) proprietary retention data → at-risk models that improve with every studio; (4) only then, wearable depth as amplifier. Wearables are the moat's *decoration*, not its foundation — and they carry the entire regulatory payload (GDPR special-category, WA MHMDA with private right of action, FTC HBNR). Every month the core runs biometric-free is a month of moat-building with near-zero compliance drag. One correction to the doc's own sequencing: it treats compliance as arriving with Phase 5 "deep sync," but **the consumer-health-data regime attaches at the first live HR value displayed** (Phase 3 as drafted) — MHMDA's definition of collection is broad enough to cover ephemeral processing. So either the compliance gate moves earlier, or live HR moves later. M3 chooses the latter.

### A.7 Verdict, restated precisely

**MODIFY.** The surviving direction: *the white-label class operating system for boutique fitness — plan, run, and deliver the in-room experience on the studio's own brand — instrumented from day one to attendance, with the retention outcome sold as the data matures, and biometrics sequenced strictly behind a consent-grade foundation.*

- **M1 — Land as tool, monetize outcome later.** Entry SKU: programming + in-room delivery + attendance ($99–199/mo hypothesis). Outcome tier: retention dashboard + at-risk loop (~$349–499/mo hypothesis), offered when the studio's own 90-day cohort exists. Poetic symmetry: the upsell arrives on the same clock as the churn it addresses. *(Fixes attacks 1 & 2.)*
- **M2 — Native attendance capture at point of delivery.** QR self-check-in on the room screen + coach roster tap in the Live runner. Booking-system integration becomes an opportunistic enhancement, never the spine. *(Fixes attack 3.)*
- **M3 — Biometric-free core.** At-risk v1 = attendance math (the <4-visits-in-month-one → ~80% cancel signal *is your own industry data* — no HR required). In-room shared experience v1 = stage clarity + timers + RPE effort cues + brand. All HR — including live display — behind the consent gate, entering via studio-owned BLE straps (the technically honest path) before BYO-wearable aggregation. *(Fixes A5's fragility and the compliance-timing error; preserves the OTF-effect roadmap without betting the core on it.)*

What explicitly survives unmodified: no-CRM for 1–2 years; the session/assignment primitive; music demoted behind a `MusicProvider`; aggregator over per-vendor integrations (when wearables arrive); land-and-expand from strength; the beachhead.

---

## 1. RECOMMENDED DIRECTION & ARCHITECTURE

**Direction (one paragraph, decisive).** Jungle is the **class operating system for boutique fitness**: coaches plan (AI-drafted, coach-approved programming), run (live runner + coach remote), and deliver (branded room displays + member touchpoints) — and every delivered session writes attendance into a retention instrument that becomes the operator's reason to pay more. Group and 1:1 ride one session primitive. It sits beside booking/billing incumbents without needing them (M2), carries zero biometric data until the consent foundation exists (M3), and treats music as an optional, routed, legally-segmented touchpoint. The white-label brand layer wraps every member-visible surface, because the studio's brand — not Jungle's — is what the member experiences (the structural gap Myzone/OTF can't close).

### Target architecture

```
┌─ Studio App (SPA) ──────────┐  ┌─ Room Displays ─────────────┐  ┌─ Member Surface ────────────┐
│ coach + operator            │  │ Floor TV / Display / Overview│  │ magic-link web view → PWA   │
│ Builder, Live runner/remote,│  │ display-mode client, joined  │  │ (native iOS deferred — §9)  │
│ Analytics, Brand Studio,    │  │ to a room channel, caches    │  │ session card, summary page, │
│ Admin/RBAC                  │  │ session locally (offline-ok) │  │ consent & data controls     │
└──────────────┬──────────────┘  └──────────────┬───────────────┘  └──────────────┬──────────────┘
               │        Supabase Realtime — per-room channels (live session state)│
               └───────────────────────┬──────────────────────────────────────────┘
┌─ Supabase (system of record) ────────┴───────────────────────────────────────────────────────┐
│ Auth: staff accounts (RBAC) · member magic-links (no password, scoped JWT)                   │
│ Postgres + RLS: org_id on every row; role policies; member-scope policies                    │
│ Edge Functions:                                                                              │
│   • llm/        class-gen, brand-gen (existing smart-build pattern), outreach drafts        │
│   • music/      MusicProvider router → Soundtrack | personal-Spotify | tempo-guide | off    │
│   • media/      exercise-media proxy (server-held key, cached) — replaces user RapidAPI key │
│   • wearables/  (Phase 4+) aggregator webhooks, normalization                               │
│ Vault: ALL provider OAuth tokens server-side (today sp_at/sp_rt sit in localStorage — fix)  │
│ Storage: logos, brand assets                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
        │ Phase 4+: aggregator (pull) │ Soundtrack API │ Garmin Training API (push, Phase 5) │ Strava (export-ONLY)
```

**Why this shape:**

- **Realtime room channels are the missing organ.** Inspection of `App.jsx` shows no `BroadcastChannel`, no storage-event listeners — today's "displays" (`FloorLiveScreen` 7337, `DisplayScreen` 7438, `OverviewDisplayScreen` 7127) can only mirror state inside one browser. A real studio runs the coach's device and the room TV as *separate machines*. Supabase Realtime (already in your stack) gives per-room pub/sub without new infrastructure. This single change converts the displays from demo theatre into the product.
- **Postgres-as-system-of-record, localStorage demoted to cache.** Everything real currently lives in localStorage (`jungle_user_classes`, `jungle_library_custom`, `jungle_skin`, `jungle_gym_branding`, `jungle_history`, …) — five `supabase.from` calls in 8,428 lines. Multi-tenant, multi-device, and any retention claim all require the flip. Displays keep a local session cache so a Wi-Fi blip never kills a class in progress (Principle P7, §3).
- **Members ≠ users.** A member is a roster row (name + optional email), not an auth account. This is what makes M2 work day one: attendance capture requires zero member adoption. Magic-link tokens later give members a branded view of *their* data without passwords.
- **Edge Functions as the only token holders** — the stated constraint, currently violated by the Spotify PKCE flow storing `sp_at`/`sp_rt`/`pkce_v` client-side. The `smart-build` function proves the pattern; extend it.

**Pushback (on the brief's framing):** the thesis says "instrumented to first-90-day retention" as if instrumentation were a feature. It's a *data supply chain* — capture (M2) → store (Phase 1 schema) → analyze (cohorts/at-risk) → act (outreach). The doc specs the analyze step and assumes the capture step. This spec inverts that priority: capture is F4 and sits on the critical path; dashboards are downstream consumers.

---

## 2. CORE FUNCTIONAL SPECIFICATION

**F1 — Session/assignment primitive** *(the doc's §9 commitment, kept)*
Purpose: one model serves group and 1:1 so the product never forks.
Stories: coach builds a session from a template and assigns it to Tuesday 6pm class; the same coach assigns a variant to one PT client for Thursday; operator sees both in one history.
Acceptance: `session_assignment` targets a `class_instance` XOR a `member` — no parallel tables; editing a template never mutates delivered history (sessions snapshot on publish); a 1:1 session renders as a client card from the same data that renders a Floor TV.
Rationale: Trainerize/TrueCoach do 1:1-remote, Wodify does group-content; nothing spans in-room group + 1:1 on one primitive — the structural gap in the brief's own landscape table.

**F2 — Programming & builder (AI-drafted, coach-approved)**
Purpose: kill the weekly programming time sink and quality drift between coaches (decision doc §3).
Stories: coach picks format + duration + equipment → LLM drafts stages/exercises on-brand → coach edits → publishes; operator locks house formats as templates.
Acceptance: **no AI-generated program reaches a member surface without explicit coach approval** (duty-of-care principle — this is a hard gate, not UX polish); PAR-Q-style screen gates any *individualized* load prescription; library = wger + org-custom exercises via server-side media proxy (user-supplied RapidAPI key eliminated); draft→publish ≤5 minutes.
Rationale: "AI programming is the fresh lever OTF/Myzone lack" (brief) — but liability rides with it, so approval gates are part of the feature, not an appendix.

**F3 — In-room delivery (Live runner, coach remote, branded displays)**
Purpose: the experience layer itself — "what am I doing right now," on the studio's brand.
Stories: coach starts session from phone; room TV auto-advances stages with timers; coach pauses/extends/skips from the remote; member glances mid-burpee and knows exercise, reps, and time left.
Acceptance: display joins a room channel and survives Wi-Fi loss for a full class (local cache); stage changes propagate <1s; every member-visible pixel consumes brand tokens; readable at 8m (P2, §3).
Rationale: OTF built ~$1B on the in-room screen; HR-monitored group retains ~40% better — the screen is the retention lever's handle. V1 delivers the *clarity and brand* half; the HR half arrives Phase 4 (M3).

**F4 — Attendance capture at point of delivery (M2 — new, critical path)**
Purpose: own the data spine; never rent it from Mindbody.
Stories: member scans the QR on the room screen and taps their name (first visit: name + notice = one screen); coach sweeps the roster in the Live runner in <30s; front desk imports a CSV from the booking system as backfill (enhancement, not dependency).
Acceptance: check-in ≤5 seconds per member (P6 — above this, coaches skip it and the instrument starves: A7); works offline, syncs later; attendance rows immutable with source (`qr | coach | import`); QR generated locally, not via `api.qrserver.com` (reliability + no member data leaking through a third-party URL).
Rationale: the <4-visits-in-month-one → ~80% cancel signal is *attendance* math. This feature is the entire retention thesis's oxygen supply.

**F5 — Retention analytics + at-risk loop** *(the outcome tier)*
Purpose: the thing operators actually pay to fix, made visible and actionable.
Stories: operator sees the first-90-day cohort curve for her studio vs. industry benchmark; Monday morning she gets 4 flagged members with reasons ("2 visits in 3 weeks — 80% cancel risk") and one-tap outreach drafts; she filters retention by class format and coach.
Acceptance: at-risk v1 = two transparent rules — <4 visits in month one; 14-day absence — **arithmetic, not AI** (resist LLM-washing the math; the LLM's job is drafting the win-back message and explaining the flag); benchmark overlays (30–50% churn, 50%@90d) make the dashboard useful on day 3, not month 6 (cold-start mitigation); revenue-at-risk = flagged members × avg membership fee, turning the "$360k studio loses half to churn" stat into a live number; every alert has a dismiss/acted state so the loop is measurable (A3).
Rationale: incumbents admit they don't automate disengagement detection — this is the open, wanted feature, priced against the loss.

**F6 — White-label brand system across member touchpoints**
Purpose: the moat Myzone structurally can't build — the member experiences *the studio's* brand.
Stories: owner runs Brand Studio (exists — strongest asset) once; every display, member magic-link page, session summary, and consent page renders in her brand; multi-location operator applies one brand across sites.
Acceptance: brand tokens are the only styling path for member-visible surfaces; Brand Studio gains a live WCAG-AA contrast checker on token pairs (compliance as a white-label feature); per-gym privacy/consent page auto-generated in-brand.
Rationale: A2 (white-label premium) is unproven — so the brand layer is priced as premium and demoed as the 15-minute wow, but the wedge sells even to the brand-indifferent owner on F2–F4.

---

## 3. DESIGN SPECIFICATION

**Principles (named — cited throughout this spec):**

- **P1 · Now over next.** The current exercise owns ≥60% of visual weight; next-up is peripheral; everything else disappears during work intervals. This *is* the product's stated core value ("on-screen clarity of what am I doing right now").
- **P2 · The 10-foot rule.** Legible at 8 meters mid-workout: primary element (exercise + timer) ~8–12% of screen height, secondary ~3%. Test at 1080p from the back of a real room, sweating. `DISPLAY_PRESETS`/`FONT_SCALES` (App.jsx 7311–7337) already gesture at this — formalize into enforced minimums.
- **P3 · Brand-forward, coach-neutral.** Member-visible surfaces are fully skinned by brand tokens; coach/admin surfaces stay neutral and fast. The member should never see Jungle's brand; the coach doesn't need the studio's.
- **P4 · Zero-touch room.** Sessions auto-advance; the coach's phone is a remote (pause/extend/skip), never a laptop-jockeying station mid-class.
- **P5 · One primitive, two lenses.** Group display = shared stage state; 1:1 = client card. Same session data renders both (F1).
- **P6 · Data capture costs <5 seconds.** Any check-in flow slower than a tap-or-scan dies in a busy room, and F5 starves (A7).
- **P7 · Degrade gracefully.** Displays cache the running session locally; connectivity loss mid-class is invisible to members.

**Core flow intents (plan → run → execute → review), group and 1:1:**

- **Plan (Builder):** template or format pick → LLM draft → coach edit → publish to class instance / assign to client. Group and 1:1 differ only at the assignment step (P5).
- **Run (Live runner + remote):** coach view = roster (check-in sweep, F4) + stage control + timers. 1:1: same runner, one-person roster, client card view.
- **Execute (Floor TV / Display / member view):** P1/P2 govern. Group: shared stages, station groups (`GROUP_PALETTE` exists), interval clock. 1:1: client card on coach's tablet or member's magic-link page. Tempo-guide cue (BPM pulse) when enabled — rhythm without audio liability.
- **Review:** member gets a branded session summary (magic link — the white-label touchpoint members actually see and share); operator gets attendance rolled into cohorts (F5); coach sees session log (real `jungle_history` successor).

**Accessibility & large-display:** WCAG-AA contrast enforced *in Brand Studio* at token-selection time (warn on failing pairs at display sizes — turns compliance into a feature, F6); no information encoded by color alone; colorblind-safe palette reserved for future HR zones; reduced-motion mode for displays; timer states distinguishable by shape + position, not hue.

---

## 4. TECHNICAL SPECIFICATION

### 4.1 Data model (health-data-grade from day one, biometric tables deferred)

| Table | Purpose | Key fields | Compliance notes | Phase |
|---|---|---|---|---|
| `orgs` | Tenant root | id, name, plan, settings | DPA per org (gym = controller, Jungle = processor) | 1 |
| `org_users` | Staff RBAC | org_id, user_id, role: owner·admin·coach·front_desk | Drives `can()` capability gating (exists in scaffold) | 1 |
| `members` | Gym members — roster rows, **not auth users** | org_id, name, email?, status, joined_at | Personal data, not special-category; minimization by default | 1 |
| `consent_records` | Append-only consent ledger | member_id, org_id, scope, policy_version, method, granted_at, withdrawn_at | Scopes graduated: `roster/attendance` (notice) now; `biometric_live`, `biometric_store`, `coach_view`, `export` (explicit opt-in) later. Ships in Phase 1 *even though biometrics don't* — cheap insurance, MHMDA-shaped | 1 |
| `session_templates` | Reusable programs | org_id, stages(jsonb), format, version | Versioned; templates never mutate history | 1 |
| `sessions` | Published snapshots | org_id, template_id?, stages(jsonb, frozen), created_by | Snapshot-on-publish (F1 acceptance) | 1 |
| `session_assignments` | **The primitive** | session_id, class_instance_id XOR member_id | One table serves group + 1:1 | 1 |
| `class_instances` | A class occurrence (run-sheet) | org_id, starts_at, coach_id, format | **Not booking** — no member-facing reservation/payment; the no-CRM line in schema form | 1 |
| `attendance` | The data spine | class_instance_id, member_id, source: qr·coach·import, checked_in_at | Immutable; feeds F5 | 1 |
| `exercises_custom` | Org library extensions | org_id, name, media_ref, cues | Replaces `jungle_library_custom` | 1 |
| `brand_profiles` | Brand tokens | org_id, tokens(jsonb), logo_refs, version | Replaces `jungle_skin`/`jungle_custom_skin`/`jungle_gym_branding` | 1 |
| `music_prefs` | Provider routing | org_id, provider: soundtrack·personal·tempo·none, account_type | Commercial-premises attestation routes legality (§8 of decision doc) | 2 |
| `audit_log` | Access log for sensitive reads | actor, action, target, at | Coach-views-member gated + logged | 2 |
| `device_connections` | Wearable links | member_id, provider, aggregator_ref, scopes | Tokens in Vault, never in tables | 4 |
| `biometric_samples` | HR etc. | member_id, session_id?, type, ts, value | Partitioned; retention policy (auto-purge); explicit-consent gated; encrypted | 4 |
| `export_jobs` | Strava/Garmin outbound | member_id, dest, status | Strava = destination only, per its 2024–25 API terms | 4–5 |

**Cross-cutting:** `org_id` + RLS on every table (policies per role; member-scope policies keyed to magic-link JWT claims); soft-delete → scheduled hard-delete (GDPR/MHMDA deletion rights); per-org export (DPA support); provider tokens exclusively in Supabase Vault via Edge Functions (fixes `sp_at`/`sp_rt` in localStorage); Supabase at-rest encryption + column-level for anything biometric.

### 4.2 `MusicProvider` abstraction

```
MusicProvider { id, capabilities: { playback, tempoOnly, licensedForCommercial },
                connect(org), play(ctx), syncToStage(stage), bpm(track) }
```

Implementations: **SoundtrackProvider** (commercial gyms — licensed, server-side OAuth; verify current Soundtrack Your Brand API terms/pricing before committing), **PersonalSpotifyProvider** (individual coaches/at-home ONLY — quarantines the existing ~2,000 lines of Spotify/DJ code, feature-flagged by `account_type`; never offered to commercial premises), **TempoGuideProvider** (no audio: BPM pulse/metronome visuals — the zero-license default that keeps rhythm value with no PRO exposure), **NullProvider**. Deezer BPM lookups move behind a server proxy with cache (currently client-side `gsb_bpm_cache`); verify Deezer API ToS for commercial use. Routing by onboarding attestation: commercial premises → personal Spotify not even visible. The $150k-per-work statutory exposure belongs to whoever performs music — this architecture makes that party never-Jungle.

### 4.3 Wearable integration (Phase 4+, sequenced behind consent)

> **Pushback (two points where this spec overrides the decision doc):** (1) Your Phase 3 lists "in-room HR display via aggregator" as *light* wearables. It is neither light nor reliably possible: aggregator realtime streaming covers a minority of consumer devices, Apple Watch won't broadcast without a companion app, and the compliance regime (MHMDA, GDPR special-category) attaches at the first displayed heartbeat, not at "deep sync." This spec moves all HR to Phase 4, behind consent, entering via BLE straps. (2) Your §7 makes the retention dashboard the lead SKU ("sell the outcome, priced against the loss"). Right north star, wrong opening — the outcome is unmeasurable in an empty database; it's the ~day-90 upsell (M1).

- **In-room live HR (first biometric feature):** studio-owned **BLE straps** (standard HR profile, ~$30–60/unit, no member account required) → room receiver. *Reality check (A5):* one BLE adapter handles ~5–10 concurrent connections; a 20-person class needs an ANT+ USB dongle or a small hub app on the display device — **this is exactly why Myzone ships proprietary receivers.** Run a bench spike (15+ straps, one receiver) before promising class-scale HR to anyone. Consent: explicit opt-in screen at first strap pairing even in display-only mode; display-without-storage drastically reduces retention/breach surface but does not remove notice/consent duties (MHMDA breadth).
- **Post-hoc sync (pull):** **aggregator, not per-vendor** — one OAuth, one normalized schema, hundreds of devices vs. 3–4 partner programs each with approval gates. Default candidate: Terra-class vendor; final pick after a 2-week spike scoring realtime coverage, EU residency, DPA quality, webhook reliability, and pricing at 1k members (aggregator pricing shifts; don't hard-commit in a doc). Wrap it in a `WearableProvider` interface — same lesson as `MusicProvider`.
- **Push (plan → device):** aggregators are pull-mostly; push is vendor-specific. **Garmin Training API direct** for workout push (file the Developer Program application in Phase 3 — approval is days–weeks and free to start early). **Strava: export-only, forever** — its terms forbid showing a user's data to coaches, forbid AI/ML use, cap storage at 7 days. **Apple HealthKit: on-device only** → requires native iOS; deferred (§9, Q5).

### 4.4 LLM services

Keep the existing `smart-build` Edge Function pattern (server-side key, thin client): extend to class-gen (F2) and outreach drafts (F5). Hard rules: coach approval gate before any member-visible output (duty-of-care); PAR-Q screen before individualized load; prompt-injection hygiene on any member-supplied text entering prompts; log generations for audit. **At-risk scoring is SQL, not LLM** (F5) — transparent rules an operator can trust and a lawyer can read.

### 4.5 Modularization plan for `App.jsx` (grounded in the actual file)

Split a **thin slice first, then migrate data through the seam** (answers Open Question 1 — rationale: migrating localStorage→Supabase inside the monolith means 16 screens touching storage directly; extracting a repository seam first turns the migration into swapping one module's internals).

| Step | Extract | From (lines) | Into | Effort |
|---|---|---|---|---|
| 1 | Data constants: `WORKOUT_LIBRARY` (934–1612), `STAGE_LIBRARY_MAP` + `CLASS_STAGE_TEMPLATES` (1612–1858), `TEMPLATES`, `PRESET_SKINS`, `GYM_FONTS`, `GLOSSARY` | ~1,700 lines | `src/data/` | Trivial, zero-risk |
| 2 | **Repository seam**: wrap every localStorage key (`jungle_user_classes`, `jungle_library_custom`, `jungle_skin`, `jungle_custom_skin`, `jungle_gym_branding`, `jungle_history`, `jungle_disp_prefs`, `jungle_tmpl_tracks`, caches) behind `src/lib/store.js` | scattered | `getClasses()/saveClasses()`… | **The migration seam — do not skip** |
| 3 | Shared UI (`Btn`, `Input`, `Select`, `Tag`, `BrandLogo`, `StatCard`) | 1903–1990 | `src/ui/` | Small |
| 4 | Screens, leaf-first: Glossary (3540), Analytics (3287), Templates (2953), Calendar (3654), Members (4169), Admin (7936); then BrandStudio (4460–4915), Builder (6129–6702), Live (6702–7127), Displays (7127–7898) | ~5,000 lines | `src/screens/` | Mechanical once 1–3 done |
| 5 | **Music quarantine**: `SP_SCOPES` (360), TrackItem/TrackSearch (2374–2832), MusicHub (3912–4169), SpotifyDevicePicker/DjPlaylistModal/AutoDjPanel (5782–6129) | ~2,000 lines | `src/music/` behind `MusicProvider` | Quarantine, don't refactor internals |

Then Phase 1 swaps `store.js` internals per domain (classes → library → brand → history) to Supabase repos, localStorage demoted to offline cache. Existing single-device data: one-time upload migration on first login post-update.

### 4.6 Testing strategy

Extract pure logic (session ops, at-risk rules, timer/stage math, `can()`) → Vitest units. RLS policy tests on Supabase local (cross-org reads must fail; member-scope isolation; run per policy, in CI). Playwright: plan→publish→run→display happy path + QR check-in. Contract mocks for `MusicProvider`/`WearableProvider`. Visual snapshots of Floor TV at 1920×1080 and 4K (P2 regression). Realtime soak: 30 subscribers per room channel. Test priority mirrors risk: RLS and attendance-immutability tests are non-negotiable; UI snapshots are nice-to-have.

---

## 5. DEPRECATION LIST

| Item | Action | Why | Migration note |
|---|---|---|---|
| Spotify as commercial playback + Web Playback SDK as core dependency | **Demote** → `PersonalSpotifyProvider`, individual tier only, feature-flagged | ToS + PRO law ($150k/work); 5-account dev cap | Quarantine ~2,000 lines into `src/music/` (step 5 above); hide from commercial onboarding |
| Per-user Spotify allowlist model | **Remove** | Dead by the 5-account cap; Extended Quota unattainable | Delete allowlist flow; provider routing replaces it |
| `sp_at`/`sp_rt`/`pkce_v` tokens in localStorage | **Remove** — server-side OAuth via Edge Function + Vault | Stated constraint; browser can't hold provider tokens | Applies to every future provider (Soundtrack, aggregator, Garmin) |
| Mock Analytics (`AnalyticsScreen`, hardcoded KPIs) | **Flag OFF now**; rebuild on real data in Phase 2 | Sales-integrity risk if ever demoed as real | Keep layout as the Phase-2 target |
| Mock Members (`ATTENDEE_PAYLOAD`, demo data) + hardcoded `BASE_SCHEDULE` | **Flag OFF now**; replace with `members` + `class_instances` in Phase 1 | Same theatre risk; schedule must be org data | Roster import (CSV) eases first-day setup |
| User-supplied RapidAPI key (`jungle_exdb_key`) for ExerciseDB GIFs | **Remove** → server-side media proxy with org-level key + cache, or wger-only + curated set | Unshippable UX ("bring your own API key"); check ExerciseDB media licensing for commercial use | Cache media refs in `exercises_custom` |
| `api.qrserver.com` external QR generation | **Replace** with local QR lib | Check-in (F4) can't depend on a third party; no member data via external URLs | Trivial swap |
| localStorage as system-of-record | **Demote to offline cache** after Phase 1 | Single-device, single-user; blocks the entire thesis | Per-domain swap through `store.js`; one-time upload migration |
| Monolithic `App.jsx` (8,428 lines) | **Split** per §4.5, thin slice before data migration | Prerequisite (both docs agree); the seam order is the decision | See §4.5 table |
| Deezer BPM client-side calls | **Move** behind server proxy; verify commercial ToS | Consistency with token/key policy | Keep the cache, relocate it |

---

## 6. NEW FEATURES (sequenced)

| # | Feature | Value | Depends on | Compliance weight |
|---|---|---|---|---|
| N1 | Native attendance capture (QR + roster sweep) (F4) | The data spine; M2 | Phase 1 schema | Low (personal data, notice-level; consent ledger ships anyway) |
| N2 | Real analytics: 90-day cohort curve + benchmark overlay + revenue-at-risk | Makes churn visible in $ | N1 | Low |
| N3 | At-risk detection (2 SQL rules) + LLM outreach drafts | The outcome tier's core; closes the loop (A3) | N2 | Low-Med (profiling-adjacent; keep rules transparent) |
| N4 | Member magic-link session summary (branded) | The white-label touchpoint members actually see/share | Phase 1 | Low |
| N5 | Tempo-guidance mode (BPM cues, no audio) | Rhythm value, zero licensing | `MusicProvider` shell | None |
| N6 | Licensed music via Soundtrack (commercial) + personal Spotify (individual tier) | Music resolved legally, by routing | `MusicProvider`; verify SYB API terms | Low *by design* |
| N7 | In-room live HR via studio-owned BLE straps | The OTF-effect visual; retention amplifier (~40% stat) | Bench spike (A5); consent UX; `biometric_*` tables | **High — first biometric touch: GDPR special-category, MHMDA, FTC HBNR** |
| N8 | Aggregator post-hoc sync (BYO wearables) | "Works with what members own" | N7 foundation; aggregator spike + DPA | High |
| N9 | Export-to-Strava (destination only) | Member delight, social proof | N8 or direct | Med-low (outbound, user-initiated; never ingest) |
| N10 | Push-to-Garmin planned workouts | 1:1/hybrid differentiator | Garmin dev approval (file Phase 3); compliance foundation | High |
| N11 | Native iOS (HealthKit pull) | Apple-ecosystem depth | Demand evidence (see Q5) | High |
| N12 | Coach self-serve tier (alternative (g) resurfacing) | Second GTM motion | Core proven; F1 already supports it | Low |

---

## 7. PHASED ROADMAP

**Critical-path spine: Phase 1 → F4 attendance → F5 analytics.** Everything else hangs off it. (The decision doc said "Phase 1 is the spine" — agreed, with attendance capture promoted into it.)

| Phase | ~Weeks | Builds | Exit criteria | Compliance |
|---|---|---|---|---|
| **0 — De-risk** *(parallel: interviews)* | 0–2 | Feature-flag mocks OFF; `MusicProvider` shell; deploy verification. **Interviews (8–10 owners) run concurrently** — incl. the A2 white-label isolation question | Mocks can't be demoed as real; 10 interviews booked | None |
| **0.5 — Split slice** | 1–3 | §4.5 steps 1–3 (constants, store seam, shared UI); screens as capacity allows | `store.js` is the only localStorage touchpoint | None |
| **1 — Data foundation** ★ | 3–8 | Postgres schema (§4.1 phase-1 tables) + RLS; Realtime room channels; magic-link member view; localStorage migration; QR/roster check-in (F4) | Two devices, one class, real attendance rows in Postgres; RLS tests green | Consent ledger live (cheap insurance) |
| **2 — Make the theatre real** | 8–12 | Analytics on real data (N2); at-risk + outreach (N3); design partners live (5–10, *paying something*) | An operator acts on an at-risk alert; cohort curve renders from real data | DPA template in use |
| **3 — Experience deepening** | 12–20 | Display polish (P1/P2 formalized); tempo-guide (N5); Soundtrack pilot (N6); member summary (N4); **BLE bench spike (A5)**; **file Garmin dev application**; consent UX v2 | Wedge SKU sellable end-to-end; spike verdict on class-scale HR | Consent UX built *before* biometrics ship |
| **4 — Biometrics, gated** | 20+ | In-room HR via straps (N7); aggregator sync (N8); export-to-Strava (N9) | First studio running HR classes under explicit consent | **The step-change: MHMDA/GDPR-special/HBNR active** |
| **5 — Expand** | validation-gated | Push-to-Garmin (N10); iOS decision (Q5); coach tier (N12); *only then* evaluate absorbing booking/payments — hold the no-CRM line to here | Outcome tier converting; expansion from strength (doc §7) | Sustained |

**Core vs. speculative:** CORE = Phases 0–2 (proven demand: programming, delivery, attendance, retention loop, brand). SPECULATIVE + high-compliance = Phases 4–5, gated on: ≥5 design partners weekly-active, ≥1 paid outcome-tier conversion, and the BLE spike passing. Timeboxes assume current (solo/small) capacity — flag if that's wrong.

---

## 8. RISKS & OPEN DECISIONS

### What kills this, and mitigations

1. **Wedge adoption fails (A1)** — coaches won't change weekly workflow. *Mitigation:* design partners in 60 days; kill criterion #1 is cheap to hit or clear.
2. **Attendance friction (A7)** — the instrument starves. *Mitigation:* P6 as a design law; measure check-in rate as the pilot's #1 metric; CSV backfill as a crutch, never the plan.
3. **Outcome tier doesn't convert (M1's second act)** — tool revenue alone caps the business. *Mitigation:* benchmark overlays + revenue-at-risk make the dashboard persuasive early; price tests in interviews.
4. **Myzone/eGym ships white-label software-only** — kill criterion #4. *Mitigation:* their hardware economics resist it; monitor; speed is the real defense.
5. **Incumbents bundle "good enough" experience screens.** *Mitigation:* Mindbody's product velocity is historically slow; our attendance independence (M2) means they can't cut off our air supply while we're small.
6. **LLM programming injury/liability.** *Mitigation:* coach-approval hard gate + PAR-Q + "not medical advice" throughout (constraint honored in F2); insurance review before 1:1 individualized load ships.
7. **Compliance surprise** — MHMDA breadth (any WA resident, private right of action). *Mitigation:* consent ledger from Phase 1; biometric-free core (M3); distinct consumer-health-data policy drafted before Phase 4; FTC HBNR 60-day breach plan written *before* first biometric byte.
8. **Aggregator/vendor terms shift** (Strava already proved this pattern). *Mitigation:* provider-agnostic wrappers everywhere (`MusicProvider`, `WearableProvider`); no vendor's data enters the LLM path without terms review.
9. **Design-partner overfit** — 10 studios' quirks ≠ market. *Mitigation:* timebox bespoke asks; second-wave sales must be cold.

### The brief's five open questions — answered

1. **Split before or parallel with migration?** Before — but only the thin slice (§4.5 steps 1–3, ~2 weeks). The repository seam is the point; full-beauty refactor is procrastination. Migration then lands through the seam.
2. **Aggregator vs. direct?** Aggregator for pull (one OAuth, normalized schema, hundreds of devices vs. per-vendor approval queues); **Garmin direct for push** (aggregators are pull-mostly). Default candidate Terra-class; commit only after the 2-week spike (§4.3) — pricing and realtime coverage move too fast to hard-code in a strategy doc. Strava: export-only, forever.
3. **Minimum viable retention analytics an operator pays for, from empty data?** Three things: 90-day cohort curve with **industry benchmark overlay** (useful day 3, not month 6); the two-rule at-risk list with reasons; revenue-at-risk in dollars (flagged members × avg fee). It sells because it converts the doc's own stats (50% quit by day 90; <4 visits → 80% cancel; half of $360k lost) into *her* numbers.
4. **Consent model without crushing UX?** Graduated scopes in an append-only `consent_records` ledger: roster/attendance = one notice screen at first check-in; each biometric capability = one explicit opt-in at first use (strap pairing, wearable link), per-scope toggles in the member's branded portal (view/withdraw/delete self-serve). Gym = controller, Jungle = processor, DPA per gym; deletion cascades include aggregator revoke + Vault purge. GDPR explicit consent and MHMDA's distinct-policy requirement satisfied in two well-timed screens, not fourteen checkboxes.
5. **Native iOS for HealthKit — core or defer?** Defer. The core loop (plan → run → attend → retain) needs zero HealthKit. Triggers to revisit: paying studios where Apple-Watch-primary members demand auto-sync, or the 1:1 tier needing recovery data. Until then Apple users get the magic-link summary. An App Store surface + health entitlements is a tax the core doesn't need to pay.

### Decisions Dylan must make

- **D1 — Beachhead:** recommend independent boutique group-class studios as primary interview pool (they feel churn + already buy experience add-ons), with 2–3 multi-location independents mixed in. PT studios come via the 1:1 primitive later.
- **D2 — Price anchors to test:** tool tier $99–199/mo; outcome tier $349–499/mo (interviews Q7/Q10 calibrate). Both sit comfortably inside the $300–800/mo wallet.
- **D3 — Design-partner terms:** charge (even $49–99/mo). Free pilots don't validate willingness-to-pay, and WTP is the thesis's most-contested assumption (A2).
- **D4 — Wedge naming/positioning:** the platform line ("your own Orangetheory-grade experience…") stays as vision; the entry pitch is narrower — *"run your best classes, on your brand, and know who's about to quit."* Decide which line leads the website.
- **D5 — Soundtrack partnership timing** (Phase 3 pilot recommended; verify API terms first).
- **D6 — Garmin Developer Program application** — file in Phase 3; cheap, slow, and only matters if Phase 5 happens.

---

*Verification flags (external facts asserted by the source docs and carried here, to re-verify at the point of commitment: Soundtrack Your Brand API availability/terms; aggregator pricing and realtime coverage; ExerciseDB media licensing; Deezer commercial ToS; Mindbody/Glofox/PushPress partner-program costs; current Garmin program approval times.)*

