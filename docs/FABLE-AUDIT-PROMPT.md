# Jungle — Fable Audit & Direction Brief

_Written 2026-07-19, end of session 4. Repo at `main` = `823a492`._
_Paste this whole file to Fable, with repo access._

---

## What you are being asked to do

You are auditing a working product before its first commercial launch. Dylan freelances at a gym
in **Singapore** and intends to (a) launch Jungle there, (b) sell it to other gyms, and (c) offer
B2B services through that first gym. The build is real and tested; the commercial, legal and
experiential layers around it are not.

**Your output has to be directly actionable by a coding agent.** It will be combined with
`NEXT-SESSION-PROMPT.md` to drive the next build session. Structure it so that can happen — see
**Deliverables** at the end.

### The five things to weigh in every recommendation

1. **Costing.** Every recommendation carries a cost. Say what it is in **SGD**, including the cost
   of *not* doing it. Current stack is free-tier only; assume that is the constraint until you
   argue otherwise with numbers.
2. **Uniqueness.** We are building something that does not exist yet, not a cheaper Mindbody.
   Anything that makes Jungle *more like* existing tools should have to justify itself.
3. **Legal.** Singapore-first, PDPA-first. See the legal section.
4. **Infrastructure and scaling.** From one gym to fifty. Where does this break?
5. **Integrations.** What must this talk to for a gym to actually adopt it?

### How to disagree with us

**Do not rubber-stamp.** This repo has a documented culture of deleting things rather than shipping
them, and the most valuable thing you can do is tell us what to cut. Specifically:

- If the **one-week timeline** below is unrealistic, say so plainly and give us the version that is
  real. Do not compress a three-week plan into a week by shrinking the estimates.
- If a feature we are proud of is theatre, say so.
- If the Singapore-first strategy is wrong, say so.
- If our architecture will not survive fifty gyms, say where it breaks and what it costs to fix.

---

## Read these first

| File | What it is |
|---|---|
| `SESSION-HANDOFF.md` | Everything sessions 1–4 shipped, with the defects found and how |
| `NEXT-SESSION-PROMPT.md` | Cold-start brief + the pending human actions |
| `Jungle - Functional, Design & Technical Spec (As-Built).md` | **The living spec.** §9 persona depth, §10 platform, §11 UI language, §12 backlog, §13 open questions |
| `Jungle - Stress-Test Verdict & Architecture Spec (Fable).md` | Your own earlier verdict. Not edited since; say where it has aged badly |
| `supabase/migrations/0001`–`0008` | The real data model. 0008 is written but **NOT YET APPLIED** |
| `src/lib/*.js` | The tested core: parser, taxonomy, blueprints, retention, store, sync |

**The frame that governs every decision:** Jungle is an **experience layer**, judged by whether it
improves the lives of the **trainer**, the **gym owner**, and the **member**. Anything that improves
none of those three is theatre.

---

## Part 1 — Audit what exists

### 1.1 Code and feature audit

Go through the code properly, not just the docs.

- **What should be deleted?** Name files, functions, features, screens. This codebase has a 9,200-line
  `App.jsx` and a Music/Auto-DJ subsystem whose value to the three lives above has never been argued
  in writing. Be specific and be ruthless.
- **What should be combined?** Which features are two half-features that should be one? Candidates
  worth examining: Templates vs Class Blueprints vs the Workout Library (three different answers to
  "what goes in a class"); Builder vs Class Runner; Glossary vs the movement catalog.
- **Where is the duplication?** `src/data/library.js` (864 lines of seed data), `templates.js`, and
  the derived movement catalog all describe movements. Should they?
- **What is half-built and should be finished or killed?** §12 lists these; check the list is honest.
- **`App.jsx` is 9,200 lines.** Give us a concrete, staged decomposition plan — not "split it up",
  but which components move out in what order, and what breaks each time.

### 1.2 UI / UX / look-and-feel audit

**This is the part Dylan cares most about.** Jungle's whole claim is that it transforms the
experience. Audit every surface against that claim.

- Walk the real UI (PIN `080921`, `npm run dev`) and audit **every screen**: Dashboard, Class
  Builder, Coach Personas, Templates, Exercise Library, Glossary, Class Runner, Schedule, Members,
  Team, Brand Studio, Room TV display.
- **Look and feel.** Give concrete, specific direction — typography scale, spacing system, colour
  usage, motion, density, empty states, loading states, error states. What would make this look
  like a premium product a boutique studio is proud to have on the wall? Reference real design
  systems if useful. We want opinion, not options.
- **Technical jargon on user-facing pages** — a coach is not a developer. Known offenders:
  `"Add to corpus"`, `"Paste JSON"`, `"Extract & add"`, `"Extracted:"`, `"the built-in parser only
  understood 53% of that text"`, `"Edge Function returned a non-2xx status code"`, `"no blocks came
  back"`, `"New persona"` / `"Coach Personas"` (the feature name itself). **Sweep for all of them
  and give the replacement copy**, not just the list. Errors must say what to *do*.
- **The three-life test, per screen.** For each screen, state which of trainer / owner / member it
  serves and how. If the answer is "none clearly", say so.
- **Mobile.** Most of this will be used on a phone in a loud room. Audit for that specifically.

### 1.3 Every touchpoint, trainer → member → social

Dylan's framing: *"If the key is to transform experience we need to finetune all touch points from
trainer to customer to what is posted on their socials."*

Map the **complete journey** and tell us where Jungle should show up and where it should stay out
of the way:

- Trainer: planning the week → walking in → running the class → after.
- Member: discovering the gym → first class → the room itself → after class → between classes →
  the moment they are about to lapse.
- Owner: the morning number they check → the weekly decision → what they show a prospective member.
- **Social.** What does a member post? What does the gym post? Is there a shareable artefact Jungle
  could produce (a class summary, a personal record, a room-screen moment) that is genuinely worth
  posting — and how do we do that without becoming a social app or creating a privacy problem?

### 1.4 Regression test plan

We have 295 tests, all mutation-verified, and **six real defects in session 4 were still found only
by driving the UI**. Unit tests are not catching what matters.

Give us a **concrete regression test plan** that would have caught them:

- What should be an end-to-end / integration test, and with what tooling (weigh Playwright vs
  Vitest browser mode vs staying manual — with costs and setup time)?
- What is the minimum viable manual QA script before each release?
- Which existing bugs and known-broken paths must be closed before a paying gym touches this? The
  known list includes: QR self-check-in cannot write through RLS; sync verified only twice and
  failed twice; cross-device Room TV Follow never tested; offline (P7/I11) is an untested
  assumption; `persona-ai` needs redeploying and the blueprint→generate path is unverified.
- How do we test the **offline** claim honestly? "Survives Wi-Fi loss for a full class" is currently
  an assertion, not a result.

---

## Part 2 — Direction

### 2.1 Product plan and USP

- **What is the one-sentence USP?** Not a feature list. What does Jungle do that Mindbody, Glofox,
  Zenoti, Hapana, ClassPass and a WhatsApp group do not?
- **What is the wedge?** The single thing that gets the first gym to say yes.
- **Which features actually support that USP, and which dilute it?** Rank the current feature set.
- **What is missing** that the USP demands and we have not built?
- Is **"coach persona / class blueprints"** the real product, or is it **retention**, or is it the
  **in-room experience**? Pick one and argue it. We have been building all three.

### 2.2 Singapore go-to-market, operations and monetisation

Be concrete and local. Generic SaaS advice is not useful here.

- **The first gym.** Dylan freelances there. What is the right arrangement — free pilot, revenue
  share, paid deployment, equity, reference customer? What does he ask for in exchange? **Flag the
  IP question explicitly:** software built by a freelancer while engaged at a gym can have a
  contested owner. What must be agreed, in writing, before launch?
- **B2B through that gym.** Dylan wants to offer services through the first gym. What does that
  actually mean commercially — white-labelled resale, referral, a services arm? Model it.
- **Pricing.** Give an actual model in **SGD**: tiers, what is in each, per-gym vs per-coach vs
  per-member, and what the Singapore boutique market will bear. Name comparable pricing.
- **The Singapore market specifically.** How many boutique studios are realistically addressable?
  Which segments (CrossFit boxes, Hyrox-focused, pilates/reformer, boutique strength, PT studios)?
  Who are the incumbents locally and what do they charge?
- **Unit economics.** Cost to serve one gym per month at current architecture. Where does it stop
  being free-tier? Model 1, 5, 20 and 50 gyms with real Supabase / hosting / LLM numbers.
- **Operational cost to launch.** What does Dylan actually need to spend, and on what — company
  registration, insurance, domain, hosting, LLM budget, design help, legal review? Give a number
  and a minimum viable version of that number.
- **What does support look like** when a class is running and something breaks at 07:00?

### 2.3 Legal and compliance — Singapore first

The spec currently references **GDPR and MHMDA**. Singapore's governing law is the **PDPA**. Correct
this properly rather than adding a line.

- **PDPA obligations** that actually bite: consent and notification, purpose limitation, access and
  correction, retention limitation, transfer limitation, the **mandatory data breach notification**
  regime, and the **Data Protection Officer** requirement. What must exist in the product, and what
  must exist as policy?
- **Whose data is it?** The gym is almost certainly the organisation with PDPA obligations to its
  members, and Jungle is a **data intermediary**. Confirm that framing and say what it means for the
  contract and the architecture.
- **Biometrics.** N7 (BLE heart rate) and any future camera work. What is the consent bar, and does
  the existing `consent_records` ledger meet it? It was built for exactly this.
- **Contracts needed before the first paying gym:** the customer agreement, the data processing
  terms, the IP assignment/ownership position with the first gym, and the privacy notice members see.
  List them, say what each must contain, and say which need a Singapore lawyer versus a good template.
- **Marketing and member communication.** Win-back messages to lapsing members — what does PDPA's
  Do Not Call regime and consent framework permit? This is a core feature and it must be lawful.
- **Cost and time** for the legal work. Ballpark SGD.

### 2.4 Security

- Audit the current posture: Supabase RLS across 0001–0008, the auth model, the PIN-based local
  build, secret handling, Edge Functions, and the GitHub Pages deployment.
- **The known hole:** QR self-check-in cannot write through 0007's RLS and must not be fixed by
  loosening policies to `anon`. Specify the Edge Function design properly.
- What is required before a real gym's member data is in production? Give a prioritised list.
- Multi-tenancy: one Supabase project for all gyms, or one per gym? Argue it, with costs.
- Backup, restore and incident response. There is none today.

### 2.5 Platform — web, desktop, mobile

§10 currently recommends: PWA → Capacitor → Tauri, with React Native as a rewrite only BLE could
justify. **Stress-test that.** In particular: does the member-facing surface change the answer, and
does the Singapore market's device mix change it?

### 2.6 Integrations

What must Jungle talk to for a gym to actually adopt it? Assess and prioritise, with effort and cost:

- **Booking / membership systems** already in Singapore gyms (which ones, actually?), for roster and
  attendance import.
- **Payments** — Stripe vs local rails; is this even in scope, or does the gym keep billing?
- **Calendar**, **WhatsApp** (dominant in SG for gym comms), **Instagram**, wearables (Garmin, Whoop,
  Apple Health), music (Spotify — the Auto-DJ subsystem exists and its licensing position is unclear
  and worth checking), and Google Slides (already built).
- For each: is it table stakes, a differentiator, or a distraction?

### 2.7 Infrastructure and scaling

- Where does the current architecture break as gyms are added? Be specific about which table, which
  query, which sync path.
- Local-first + Supabase sync has already caused **two data-loss incidents**. Is the architecture
  sound, or does it need rework before more gyms make failures unrecoverable?
- What does observability look like? There is essentially none.
- CI/CD is GitHub Pages on push to `main`, with no staging environment. What should it be?

---

## Part 3 — The week

Dylan wants development finished and the USP and features sharpened **within a week**.

Give a **day-by-day plan for seven days** that a coding agent can execute, ordered by dependency,
with each day's work checkable. Mark clearly:

- what is **build**, what is **cut**, what is **defer**;
- what needs **Dylan** rather than the agent (applying migrations, legal, gym conversations);
- what is **blocked** and on what.

**If seven days is not enough, say so and give the honest plan.** A plan that looks achievable and
is not is worse than no plan — that is exactly the failure mode this repo's culture exists to
prevent.

---

## Deliverables

Produce these as **separate, clearly-headed sections** so they can be split into files and fed back
to the coding agent alongside `NEXT-SESSION-PROMPT.md`:

1. **`AUDIT-FINDINGS.md`** — what exists, what is wrong, what to delete, what to combine. Ranked by
   severity, with file paths.
2. **`UI-UX-DIRECTION.md`** — the design direction, the per-screen audit, and the **complete
   replacement copy** for every piece of technical jargon.
3. **`PRODUCT-DIRECTION.md`** — USP, wedge, feature ranking, what is missing, what to cut.
4. **`GTM-SINGAPORE.md`** — market, pricing in SGD, the first-gym arrangement, B2B model, unit
   economics, operational costing.
5. **`LEGAL-AND-SECURITY.md`** — PDPA position, contracts needed, security priorities, costs.
6. **`TECH-PLAN.md`** — architecture, decomposition, integrations, platform, scaling, observability.
7. **`REGRESSION-PLAN.md`** — the test plan, tooling recommendation, manual QA script, bug list.
8. **`WEEK-PLAN.md`** — the seven-day plan, or the honest alternative.
9. **`SPEC-PATCHES.md`** — the specific edits to make to the as-built spec, as
   *"replace section X with Y"*, so the agent can apply them mechanically.

**Style:** be concrete, name files and line numbers, give numbers in SGD, and state confidence where
you are uncertain. Where you are guessing about the Singapore market, say you are guessing and say
what would confirm it. **We would rather have an honest "I don't know, here's how to find out" than
a confident number that is wrong** — the entire engineering culture of this repo is built on that
preference, and the product's core design rule is that an honest blank beats a confident wrong guess.
