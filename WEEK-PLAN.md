# WEEK-PLAN — seven days, with the honest boundary stated first

_Fable audit, 2026-07-19._

## The honest boundary

**Seven days is enough to make Jungle *pilot-ready for The Garage*. It is not enough to make it
*commercially launched*, and no plan can make it so** — the legal tail (IP letter, agreement
templates: 2–4 weeks elapsed, mostly waiting on a lawyer) and the trust tail (sync verified 3×,
offline proven in the room, a week of real classes) are calendar time, not build time. The plan
below finishes development for pilot scope in 7 days **provided the cuts in AUDIT-FINDINGS are
accepted** (music quarantined, QR deferred, Templates/Glossary folded). If any cut is rejected,
the plan is >7 days — say so rather than shrink estimates.

**Start the two long-lead items on Day 1, in parallel with the build:** (a) lawyer engaged for
the IP letter + templates; (b) the gym conversation (pilot terms per GTM §3).

Each day ends with the dev server driven + gates green (repo rule). "DYLAN" = only Dylan can.

## Day 0 (today) — unblock  ~1h, all DYLAN
- `git push` (4 commits). Create staging Supabase project (free) + apply 0001–0008 to it; apply
  **0008 to prod**. Redeploy `persona-ai` (paste v8). Upgrade prod Supabase to **Pro** (backups).
- Message the lawyer; message the gym owner for the pilot conversation.

## Day 1 — cut and quarantine (BUILD)
- `FLAGS.music=false`; hide every music surface (Builder right column → class summary panel,
  runner Auto-DJ tab, Dashboard card, TrackSearch entry points). Move music code → `src/music/`
  untouched. Delete dead theatre (AUDIT 2.2): MemberScreen, IntegrationsScreen, Discover feed
  internals, b64 attendee path, BASE_SCHEDULE.
- Fix fabrications: "Shoreditch · 3 studios" header, hide Demand-heat/Auto-fill, footer →
  gym-brand line, index.html title/favicon.
- Retire Templates + Glossary nav (fold per AUDIT 2.3); rename fantasy movements in
  `library.js`/`templates.js`/`glossary.js`.
- Gates + Playwright **smoke #6** (REGRESSION §1) added to CI.

## Day 2 — mobile (BUILD)
- Bottom tab bar <900px (Run · Build · Members · Brand · More); Builder/Personas stack; runner +
  check-in thumb-audit. Manual QA §2.7 on a real phone.

## Day 3 — PWA + offline truth (BUILD)
- Self-host fonts; manifest + service worker (precache bundle/fonts/icons); install-to-homescreen
  verified on iPhone + the TV browser.
- Playwright offline test (REGRESSION §4 automated layer). **DYLAN (evening): physical soak at
  the gym — router off 5 min mid-class.** P7 flips to ✅ only if this passes.

## Day 4 — language + cold start (BUILD)
- Apply the entire U1 copy table (UI-UX §4) incl. `SCHEME_LABEL`, "Coaches" rename, error
  rewrites. Add D3 cold start: new coach → name class type → pick preset shape → ready to draft
  before any import.
- Playwright tests 1–5 (the six-defect suite).

## Day 5 — the member link (BUILD, the one new feature)
- N4 magic-link class summary: Edge Function issues signed token (DYLAN deploys); read-only
  branded page (class, date, movements, gym logo/colours); "share card" PNG export (canvas).
  Link surfaced in runner post-class + Members row.

## Day 6 — trust pass (BUILD + DYLAN)
- I5 RLS tests for 0001–0006 (self-test pattern). Sentry + UptimeRobot. `wa.me` win-back drafts
  from the at-risk screen (with consent-scope check per LEGAL §1).
- DYLAN: live sync check #1 and #2 (real classes, rows in Postgres), cross-device Follow test.

## Day 7 — dress rehearsal (DYLAN + agent fixes)
- Full manual QA script at the gym on their hardware: import a real week of decks, brand it,
  run a real class, sweep check-ins, TV follows, phone offline blip, member link shared to one
  friendly member. Agent fixes what falls out; nothing new starts.
- Update SESSION-HANDOFF + spec status marks (SPEC-PATCHES applied).

## Deferred by this plan (explicitly)
QR self-check-in · booking/payments/wearables integrations · N2 cohort analytics (needs data
volume) · App.jsx stages 4–5 decomposition · code splitting · delta writes (I10, before gym #5)
· Capacitor. **Blocked list:** anything needing a dashboard paste, migration, live-data check,
or signature = DYLAN; the agent must queue, not simulate, those.
