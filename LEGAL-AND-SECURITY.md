# LEGAL-AND-SECURITY — PDPA position, contracts, security priorities, costs

_Fable audit, 2026-07-19. **None of this is legal advice and none of it has been reviewed by a
Singapore lawyer** — it is the map of what to ask one. Confidence: [H] verified against
PDPC/statute-adjacent sources · [G] estimate._

## 1. PDPA position

**Roles [H]:** the gym is the *organisation* with PDPA obligations to its members; Jungle is a
**data intermediary** processing on the gym's behalf. As intermediary, Jungle's direct statutory
duties are **Protection** (reasonable security) and **Retention Limitation**, plus notifying the
gym without undue delay on discovering a breach; consent/notification/access duties to members
sit with the gym. This must be written into the customer agreement (§6) — it is also the honest
sales answer to "who owns the data": **the gym does; Jungle processes it.**

**Obligations that bite, and where they land:**
| Obligation | What must exist |
|---|---|
| **DPO [H] — mandatory for every org, any size** | Dylan registers himself as DPO of his entity via PDPC's online form (free, minutes). Also: the product should let each *gym* record their DPO/contact — a cheap differentiator field on gym settings. |
| **Breach notification [H]** — notify PDPC ≤3 calendar days after assessing a breach notifiable (significant harm likely, or ≥500 individuals); assessment itself ≤~30 days | A written 1-page incident plan (who assesses, who tells the gym, who files). Product side: the `audit_events` table exists (0001) — make sure access to member data writes to it. |
| **Consent + Notification (gym's duty)** | The member-facing privacy notice the gym shows at sign-up/first check-in. Jungle ships it as a template + the `consent_records` ledger (0007) records scope/version/method — the ledger is well-shaped for exactly this; it needs a real notice before any record is written (the spec's own rule). |
| **Access/correction, retention limitation** | CSV export per member (small build); a retention setting per gym (e.g. purge attendance N years after membership ends) — post-pilot, but put it in the DPA as a commitment. |
| **Transfer limitation [H]** | Supabase region: confirm the project is in Singapore (aws ap-southeast-1) — if it is not, migrate before real member data. The DPA must name where data lives. |

**Win-back messaging vs the Do-Not-Call regime [H]:** DNC covers marketing messages to Singapore
numbers **including WhatsApp/SMS**. Two clean paths, both compatible with the current design:
(1) **ongoing-relationship exemption** — messages to *current* members about their membership
("we've missed you at class, your membership's active") are exempt; (2) **clear consent** —
capture marketing-consent at member creation in `consent_records` (add a `marketing` scope), and
then no DNC check is needed. Lapsed ex-members with no consent = check DNC register (paid,
per-lookup) or don't message — make "membership ended" end automated eligibility. Design already
helps: Jungle drafts, **the coach sends from their own WhatsApp** — the gym is the sender and the
organisation responsible; put that in the agreement. Keep it that way; do not build automated
outbound in v1.

**Biometrics (N7, future):** PDPA has no GDPR-style special-category regime, but PDPC guidance
treats biometric/health data as higher-harm → higher protection standard and explicit, specific
consent. The graduated `consent_records` scopes (`biometric_live`, `biometric_store`) are the
right shape. Nothing to build now; the gate stands. Remove "MHMDA-shaped"/GDPR framing from the
spec (SPEC-PATCHES) — Singapore-first.

## 2. The IP question — settle before launch, in writing

Software built by a freelancer while engaged at a gym can have a contested owner, and the gym's
corpus is entangled with the product's development history. Before the pilot goes live: a short
**IP acknowledgment letter** signed by the gym: (a) Jungle, its code, designs and derived models
are and remain Dylan's/his company's property, developed outside the scope of his freelance
engagement, with no gym resources claimed; (b) the gym's data and its coaches' programming
content remain theirs, licensed to Jungle only to operate the service; (c) no exclusivity. This
is a 2-page letter a lawyer drafts for **[G] S$500–1,500**. It is the cheapest expensive-problem
prevention available this week — do not launch without it.

## 3. Security posture — audit

**Good:** RLS on every table 0001–0008, gym-scoped; 0007 verified 11/11 with real impersonation;
attendance/consent insert-only; Edge Functions hold LLM keys server-side; anon key + RLS is the
correct Supabase model; no member PII in URLs (QR is local now); GitHub Pages serves static only.

**Holes, prioritised before real member data:**
1. **Supabase Pro + backups** — free tier has none. US$25/mo. Day 1. Restore drill: actually
   download a backup and restore it to the staging project once (an untested backup is a hope).
2. ~~**RLS tests for 0001–0006 (I5)**~~ — ✅ **DONE.** `supabase/tests/0001_0006_rls_selftest.sql`
   exists and Dylan has run it, alongside `0007_rls_selftest.sql` (11/11). _Corrected 2026-07-25:
   this hole was listed as open here, in `AUDIT-FINDINGS.md` 2.4 and in `REGRESSION-PLAN.md` §3 #9
   long after it closed; spec §12 was the only doc that had it right._
3. **Google OAuth allowlist hygiene** — the allowlist gate (0001) is the tenant boundary; add a
   staff-offboarding note to the gym runbook (remove email → access ends).
4. **Spotify tokens in localStorage** (`App.jsx:416-427`) — resolved for v1 by the music
   quarantine (feature off = no tokens written). The Vault/server-side OAuth work is deferred
   with the feature, not forgotten.
5. **RapidAPI key + Deezer client-side** — same: RapidAPI UI is in Library (media nicety — hide
   the field for pilot); Deezer goes with music.
6. **Secrets in CI** — fine today (Supabase URL/anon are public-by-design; Slides client ID
   public by design). Keep service-role key out of the client forever — it exists only in Edge
   Function env.

## 4. QR self-check-in — the correct Edge Function design (when it's built)

Do **not** loosen RLS to `anon` (standing rule). Design: (1) runner requests a **class token**
from Edge Function `checkin-token` (auth'd staff JWT): `{class_instance_id, gym_id, exp: +15min,
HMAC}` — rendered into the room-screen QR locally; (2) member's phone opens
`checkin?t=…` (no login), picks their name from a **first-name-only** roster list (data
minimisation) fetched via Edge Function using the token; (3) Edge Function `checkin-write`
validates HMAC + expiry + gym match, then inserts attendance with the **service-role key**,
`source='qr'`, rate-limited per token. Token is class-scoped and short-lived, so a leaked QR
photo goes stale in minutes. ~1 day of work + a deploy — **defer until a gym asks**; the coach
sweep is the pilot path.

## 5. Multi-tenancy: one project or one per gym?

**One Supabase project for all gyms, RLS-isolated.** Argument: the entire schema is already
gym-scoped with verified policies; per-gym projects would mean N× migrations, N× Pro fees
(US$25×N/mo), N× Edge deploys, and no cross-gym ops view — operationally impossible for one
person at 20 gyms. The real risk of shared tenancy is an RLS policy bug → mitigated by I5 tests +
the 0007-style self-test run after every policy change. Revisit single-tenant only if a chain
demands contractual isolation — then it's a premium deployment they pay for.

## 6. Contracts needed before the first *paying* gym

| Doc | Contents | Lawyer or template | Cost [G] |
|---|---|---|---|
| IP acknowledgment (gym #1) | §2 above | **Lawyer** | S$500–1,500 |
| Customer agreement (SaaS) | licence, fees, SLA-lite, liability cap ≈ 12 mo fees, termination + data return/deletion, gym-is-organisation/Jungle-is-intermediary | Template + lawyer review | S$1,000–2,500 |
| Data-processing terms (schedule to the above) | scope/purpose, security measures, breach notice to gym ≤48h, sub-processors (Supabase, Anthropic/Google, GitHub/Cloudflare), SG storage, deletion on exit | Template + same review | included above |
| Member privacy notice (gym-branded template) | what's collected (name, contact, attendance), purposes, DPO contact, access/correction | Good template; lawyer skim | S$0–500 |
| Coach content terms (clause in customer agreement) | coach corpus ownership/portability (GTM §3) | Same review | included |

**Total legal, minimum path: [G] ≈ S$1,500–3,500, 2–4 weeks elapsed.** Start the lawyer this
week (it runs parallel to the build); the IP letter alone can be days. Cost of not doing it: the
IP dispute scenario prices in weeks of a litigator instead.
