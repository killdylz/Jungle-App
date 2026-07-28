# TECH-PLAN — architecture, decomposition, platform, integrations, scaling, observability

_Fable audit, 2026-07-19._

## 1. Architecture verdict

The 2026-07-11 target architecture holds. What has aged in it: (a) the music/`MusicProvider`
lane is now a **quarantine-and-cut**, not a build; (b) "aggregator spike / Garmin application"
phases are dead weight for a Singapore pilot — strike them from active planning; (c) the
validation plan (interviews-first) is superseded by a named pilot gym; (d) React Native never
needs to happen — see §4.

**Local-first + Supabase sync stays.** It has cost two data-loss incidents, but every incident
came from the same bug class (server-wins hydrate vs failed background push), and I3's guards +
ledger now cover all domains. The architecture is sound *because* attendance — the data that
matters — is append-only with merge-hydrate, which is structurally immune to that bug class.
Rework is not needed; hardening is (§5).

## 2. Decomposition

Full staged plan in AUDIT-FINDINGS §3.1 (helpers → leaf screens → music quarantine → personas →
runner cluster). This week: stages 1–3 only.

## 3. Integrations — table stakes / differentiator / distraction

| Integration | Verdict | Effort/cost |
|---|---|---|
| **Google Slides import** | Differentiator — the wedge. Built. Needs the persona-ai redeploy (Dylan) | 0 |
| **CSV attendance import** | Table stakes. Built | 0 |
| **WhatsApp** | Table stakes for SG comms — but v1 = `wa.me` deep links from the at-risk screen (prefilled draft, coach's phone sends). No Business API, no cost, PDPA-clean (LEGAL §1) | ~half day |
| **Calendar (.ics)** | Nice — export class schedule as .ics feed. Post-pilot | 1 day |
| **Instagram** | Not an API integration — the share-card artefact (UI-UX §5). Post-N4 | 1–2 days |
| **Booking systems (Vibefam/Glofox/Mindbody)** | Distraction for v1. CSV covers backfill; roster sync via API is gated/paid partner programs. Revisit at 5+ gyms with real demand, Vibefam first (local, likely friendliest) | defer |
| **Payments (Stripe/PayNow)** | Out of scope. The gym keeps billing. Jungle's own subscription billing: Stripe invoice manually for pilots; automate at ~10 gyms | defer |
| **Wearables (Garmin/Whoop/Apple Health)** | Distraction. Gated behind consent phase as specified | defer |
| **Spotify / music** | Cut from product (AUDIT 2.1). Licensing position confirmed bad: consumer-account ToS forbids commercial premises; SG public-performance needs the gym's own COMPASS/RIPS licences | 0 (quarantine ~1 day) |

## 4. Platform — §10 stress-tested

PWA-first **stands**, sharpened:
- **PWA now** (manifest + service worker + self-hosted fonts): installs on the coach's phone and
  the TV, and closes P7/I11. SG device mix is iPhone-heavy, and iOS PWA is fine for staff use
  (no push notifications needed in v1 — nothing in v1 sends any).
- **Member surface does not change the answer** — N4 is a link, not an app. No store presence
  needed for members at all in this phase; a member installing anything is friction the design
  avoids on purpose.
- **Correction to §10:** React Native is not the BLE fallback. If N7 (BLE HR) ever happens,
  **Capacitor** wraps the same build and provides BLE via community plugins — iOS Safari/PWA has
  no Web Bluetooth, so *some* wrapper is forced, but never a rewrite. Strike the RN row.
- Tauri: strike. The PWA covers reception/TV.

## 5. Scaling — where it actually breaks, in order

1. **Backups (day 1)** — free tier has none → Supabase Pro before real member data.
2. **`attendance` hydrate cap (I14)** — 2,000 rows ≈ under a year of one busy studio. Fix:
   paginate hydrate + only pull last 120 days into the client; analytics queries move server-side
   (SQL views) rather than client aggregation. Do at first paying gym.
3. **Whole-list blob upserts (I10)** — `persona_plans`/classes push the full list per save; one
   bad row once poisoned all. Delta writes per row for list domains. Do before gym #5.
4. **Realtime rooms** — broadcast-only, ~2–5 connections per gym; free tier caps 200 concurrent,
   Pro raises it. Non-issue to ~50 gyms.
5. **Edge Function LLM quotas** — solved by paid keys (GTM §5); the retry/batch machinery built
   for free-tier survival remains useful, not load-bearing.
6. **GitHub Pages** — static hosting scales; the single 665KB bundle is the real cost on gym
   Wi-Fi → route splitting after the screens split.

## 6. Observability + CI/CD (there is essentially none — minimum set, all free)

- **Sentry free tier** in the client (error + release tracking). The ErrorBoundary exists;
  today it swallows silently — report there. ~1 hour.
- **UptimeRobot free**: live-site + a Supabase health probe. 15 min.
- **Sync-failure telemetry**: the `SyncBanner` ledger is client-only — mirror failures to a
  `sync_incidents` table so Dylan sees them across gyms without asking. ~half day, post-pilot.
- **Staging**: second free Supabase project (schema applied by the same migration files) + a
  `staging` branch deployed to Cloudflare Pages free (previews per branch). This finally makes a
  "run the migration on staging first" rule enforceable. ~half day. CI gates stay:
  `lint:crash → test → build` + Playwright smoke (REGRESSION-PLAN) once it exists.
- **Migration discipline**: 0008 applies to staging, then prod, same day, recorded in
  SESSION-HANDOFF. The written-but-not-applied drift (0008 today) is exactly how staging pays.
