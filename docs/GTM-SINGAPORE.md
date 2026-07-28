# GTM-SINGAPORE — market, pricing, the first gym, B2B, unit economics

_Fable audit, 2026-07-19. FX assumed ≈ S$1.35/US$ (approximate — check at decision time).
Confidence is marked per claim: **[H]** verified/high, **[M]** sourced but low-trust aggregator,
**[G]** my estimate — treat as a guess to confirm._

## 1. The market

- **[M]** ~1,200+ registered fitness clubs/gyms in Singapore; boutique (<3,000 sq ft) is the
  fastest-growing segment; 150+ yoga/pilates studios in the central region alone; boutique
  segment ≈ S$100M revenue growing ~18–25%/yr. Sources are stats aggregators (zipdo, gitnux,
  wifitalents) — directionally credible, numerically soft.
- **Addressable for Jungle v1** (group classes with programmed workouts — CrossFit/functional
  boxes, HIIT/bootcamp, Hyrox-focused, boxing, strength studios): **[G] ~150–300 studios**.
  Pilates/reformer and yoga are real but need a different content model — second act, not first.
  **How to confirm cheaply:** count ClassPass Singapore listings by category + Google Maps sweep
  of "CrossFit|HIIT|bootcamp|strength" — a half-day exercise, worth doing before printing a TAM
  on any deck.
- **Incumbents in SG:** Mindbody (**[H]** US$129–349+/mo ≈ S$175–470), Glofox (**[H]** ~US$110–350
  ≈ S$150–470), Hapana (used by larger SG chains; quote-only **[G]**), Zenoti (enterprise,
  quote-only), and **Vibefam — the local one to respect: [H] from S$89/mo**, SG-localised
  (PayNow, local support), actively converting studios from Mindbody/Glofox. Every one of them is
  booking/billing-first. **Jungle should not compete on booking — it should coexist**: "keep
  Vibefam for bookings; Jungle runs the classes." That sentence disarms the "we already have
  software" objection and keeps Jungle out of a knife-fight with a cheaper local incumbent.

## 2. Pricing (hypothesis to test at gyms #2–5, in SGD)

| Tier | Price | What's in it |
|---|---|---|
| **Studio** | **S$149/mo per location** | Coaches (personas) + Slides import, Builder, Runner + Room TV, check-in + CSV history, Brand Studio, member class links, unlimited coaches (per-location, not per-coach — coaches are the adoption engine; don't tax them) |
| **Studio + Insight** | **S$299/mo** | Everything above + at-risk list with reasons, win-back drafts, cohort/retention analytics (N2) — sellable only once ~90 days of the gym's own data exists |
| Founding-customer rate | **S$99/mo locked for life** | For gyms #1–5, in exchange for case-study rights |

Rationale: sits above Vibefam's S$89 (different category — don't anchor to it), well under
Mindbody's real cost, and inside my earlier US$99–199 tool-tier hypothesis (D2 in the 2026-07-11
review — converted to SGD and held). Per-member pricing: no — punishes growth and requires
metering. Kill criterion #2 stands: if no owner among the first ten will name ≥S$135/mo
(≈US$100), the wedge pricing thesis fails.

## 3. The first gym — the arrangement

**Recommend: free 3-month pilot → founding rate, paid in paper, not equity.** Specifically:
- Jungle deploys free for 3 months at The Garage. In writing, in exchange: (1) an **IP
  acknowledgment** — the gym agrees Jungle and everything in it is Dylan's/his company's,
  built outside his freelance engagement (see LEGAL-AND-SECURITY §2 — this is the single most
  important piece of paper of the launch); (2) reference-customer + case-study rights; (3) a
  named operator contact and a weekly 30-min feedback slot; (4) permission to import historical
  data under the gym's PDPA authority.
- After 3 months: S$99/mo founding rate. **Charge — even the founding rate exists to prove
  willingness-to-pay** (D3 from my earlier review: free pilots don't validate WTP).
- **Do not do equity or revenue share** with gym #1 — it entangles the IP question it must settle.

**Coach data boundary to put in writing now:** persona corpora come from coaches' own Slides.
The agreement should state the coach's programming content is licensed to the gym's Jungle
workspace for operating classes, and a departing coach can take their corpus. Cheap to promise
now; a poison pill to retrofit after a coach dispute.

## 4. "B2B through the first gym" — model it as referral, nothing fancier

Options considered: white-label resale (gym resells Jungle) — no: makes the gym a competitor and
a support layer; services arm (Dylan consults via the gym) — no: it converts product time into
billable hours. **Recommend: reference + referral.** The Garage is the showroom (prospects watch
a live class), and gets one free month per referred gym that converts. Simple, PDPA-clean, no
contract complexity. Revisit only if a genuine multi-gym operator wants a franchise-style deal.

## 5. Unit economics

Cost to serve, one Supabase org (multi-tenant — see LEGAL-AND-SECURITY §5):

| Gyms | Infra | LLM (Opus 4.8 API) | Total /mo | Per gym |
|---|---|---|---|---|
| 1 (pilot) | Supabase Pro **[H] US$25** + domain amortised | **[H-derived]** imports+generation ≈ US$5–15 | ≈ **S$45–55** | S$45–55 |
| 5 | Pro still fits | ~US$25–50 | ≈ S$70–100 | S$15–20 |
| 20 | Pro + compute bump (**[G]** +US$50–100) | ~US$100–200 | ≈ S$250–450 | S$12–22 |
| 50 | Pro/Team + compute + egress (**[G]** US$200–400) | ~US$250–500 | ≈ S$600–1,200 | S$12–25 |

LLM arithmetic **[H]** from current API pricing (Opus 4.8 US$5/US$25 per Mtok): a deck import is
a handful of calls only for slides the deterministic parser defers on; a generation ≈ 4K in + 1K
out ≈ US$0.045. Even 300 generations + 20 imports per gym-month ≈ US$15. **Conclusion: at
S$149/mo the gross margin is >85% from gym #1, and the free-tier constraint the project has been
living under is over ~S$40/month — stop letting it shape engineering decisions.** (Sonnet 5 at
US$3/US$15 would halve an already-trivial number; not worth a second code path.)

**Where free tier actually dies:** the day real member data exists — the free tier has **no
backups** and pauses after a week's inactivity. Supabase Pro (US$25/mo, daily backups) is
non-optional at pilot start, not at scale.

## 6. Operational cost to launch

| Item | Minimum viable | Proper |
|---|---|---|
| Entity | **[H]** sole prop S$115/yr | Pte Ltd S$315 + secretary/filing **[G]** ~S$600–900/yr — do this before the first *paying* gym (liability shield; PDPA fines attach to the org) |
| Domain + email | **[H]** ~S$25/yr + free tier | ~S$100/yr |
| Hosting | GitHub/Cloudflare Pages free + Supabase Pro **[H]** S$34/mo | + staging project S$0 (2nd free project) |
| LLM | S$25/mo budget | S$50/mo |
| Legal (see LEGAL-AND-SECURITY §6) | S$1,500–3,000 (IP letter + reviewed templates) **[G]** | S$5,000–8,000 full set **[G]** |
| Insurance (PI/cyber) | defer to first paying gym; **[G]** S$600–1,200/yr | same |
| Design help | none (this audit + taste) | S$2,000 one-off brand polish |
| **Launch total** | **≈ S$2,100–3,600 + ~S$60/mo** | ≈ S$9,000–12,000 + ~S$120/mo |

## 7. Support at 07:00 when a class is running

The product's own architecture is the first line: local-first means a Supabase outage does not
stop a class (localStorage runs the room; sync catches up). Commit to that in writing as the
support story: **"a class never depends on the internet."** Then: a WhatsApp support line (Dylan)
with a 15-min response target during class hours for pilot gyms; a printed one-page "if the screen
dies" runbook (reload → offline build still runs → phone screencast to TV as last resort); status
page via UptimeRobot free. At 20+ gyms this becomes a real on-call cost — price the Insight tier
knowing it funds support, and revisit at 10 gyms. What must be true for this promise: the offline
soak test in REGRESSION-PLAN §4 passes. Until it does, do not make the promise.
