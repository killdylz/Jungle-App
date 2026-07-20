# PRODUCT-DIRECTION — USP, wedge, feature ranking, what's missing, what to cut

_Fable audit, 2026-07-19._

## 1. The one-sentence USP

**Jungle learns how each coach already programs — from the slides they've been writing for years —
and turns that into branded, ready-to-run classes on the studio's own screens, while quietly
building the attendance record that shows who's about to quit.**

Shorter, for the website: *"Your coaches' classes. Your brand on the screen. And you see who's
slipping away."*

What Mindbody/Glofox/Zenoti/Hapana/ClassPass do: booking, billing, CRM, marketing. What a
WhatsApp group does: comms. **None of them touch the 45 minutes the product is actually about**
— planning the class, running the room, and knowing who was in it. That delivery layer is
Jungle's ground and nobody in the Singapore market occupies it (Vibefam included — it is
booking/payments-first). This was the M1/M2 verdict in my 2026-07-11 review and it has aged well;
what has aged badly there is the assumption the wedge needed 8–10 cold interviews before building
— Dylan now has a named first gym and a real corpus, which converts the validation plan from
interviews to a live pilot.

## 2. Which of the three is the product?

We have been building three: (a) persona/blueprints, (b) retention, (c) in-room experience.
**Pick: (a)+(c) are ONE product — the coach's class OS — and (b) is the owner-facing outcome
tier that its data exhaust feeds.** Argument:
- (a) without (c) is a document tool; (c) without (a) is a pretty timer. Together they are the
  demo that sells: *import the coach's own deck → it's on the TV in the gym's brand in minutes.*
- (b) cannot exist on day one (empty database — the M1 finding, unchanged) and must not lead the
  pitch. It becomes real ~90 days after capture starts, which is exactly when the upsell
  conversation happens.
So: sell the class OS; instrument attendance from day one; sell retention when it has teeth.

## 3. The wedge for the first gym

**The Slides import is the wedge.** The Garage's real corpus already parses (S360 0.88, GC 1.0,
zero model calls). The first-meeting demo: Brand Studio skins Jungle with their logo live →
import a coach's deck → their own class, their brand, on the TV. Fifteen minutes, all real data.
Nothing in the market can follow that demo.

## 4. Feature ranking against the USP

**Core (invest):** Personas/Coaches + blueprints + parser · Builder · Class Runner + Room TV ·
Check-in (coach sweep + CSV) · Brand Studio · Members/at-risk · N4 member summary (missing, see
§5).
**Support (keep, minimal):** Schedule (only as class_instances once real) · Exercise Library
(one movement home) · Team/roles · Sync/offline plumbing.
**Dilutes (cut or quarantine):** Auto-DJ/Spotify (quarantine now — AUDIT 2.1) · Glossary (merge)
· Templates screen (fold into Builder) · Discover marketplace (stub stays) · Integrations screen
(dead) · attendee b64 share (dead).
**Premature:** PT/1:1 (F1), wearables/BLE, booking-system integrations, payments, native apps.

## 5. What the USP demands that is missing

1. **N4 magic-link member summary** — the USP says "your brand" but no member ever sees a Jungle
   surface today. Also the carrier of the social artefact (UI-UX §5). One day of work: a read-only
   route rendering class + brand tokens from a signed token (Edge Function issues link; no member
   accounts).
2. **Cold start for a coach with zero plans** (D3 gap) — name a class type, pick a preset shape,
   then import later. Without it, every gym after The Garage opens to an empty screen.
3. **Mobile layout** — the coach's phone is the primary device (AUDIT 1.1).
4. **Offline confidence** — P7 proven, not asserted (REGRESSION-PLAN §4).
5. **A price** — the product has no commercial identity yet (GTM-SINGAPORE).

## 6. Explicit non-goals (write these down and stop revisiting)
No booking. No payments. No CRM. No social feed. No consumer app. No music licensing business.
No AI that decides structure or risk (the model drafts within human-fixed structure — this
discipline is now a differentiator worth stating in sales copy: "your coaches stay the authors").
