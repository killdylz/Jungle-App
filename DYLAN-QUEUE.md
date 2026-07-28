# Everything waiting on Dylan

_Written 2026-07-28 at `04cd5fa` (session 18). Consolidates §5 of the session prompts, LEGAL
§§1–6, TECH-PLAN §§5–6 and the live-verification queue into one list with actual steps._

**Delete this file when it is empty.** It is a working checklist, not a spec — the spec's §12 is
still the backlog of record.

Ordered by what unblocks the most. Tier 1 blocks the pilot; Tier 2 unblocks code I cannot write
without you; Tier 3 is answering questions, and answering IS the whole task.

---

## 🔴 Tier 1 — before any real member data exists

### 1. Check the Supabase region FIRST — it may already be wrong

Do this before anything else on this list, because the fix gets impossible once real member data
lands. PDPA transfer limitation (LEGAL §1) requires you to know and name where data lives, and the
DPA has to state it.

1. Supabase dashboard → your project → **Settings → General**.
2. Read **Region**. You want **Southeast Asia (Singapore) · `ap-southeast-1`**.
3. If it is anything else: **you cannot change a project's region in place.** Create a new project
   in `ap-southeast-1`, run migrations `0001`→`0008` into it in order, re-point the two GitHub
   secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), redeploy, and delete the old project.
   That is a ~1 hour job now and a migration-with-live-data job later.

**Tell me the region either way** — the DPA and the customer agreement both need it in writing.

### 2. Supabase Pro + a restore you have actually done

The free tier has **no backups**. This is LEGAL §3 hole #1 and TECH-PLAN §5's first failure point.
US$25/mo.

1. Dashboard → **Settings → Billing → upgrade to Pro**.
2. **Settings → Database → Backups** — confirm daily backups are now listed.
3. **Do the restore drill.** An untested backup is a hope, not a backup:
   - Create a second free project called `jungle-staging` (also `ap-southeast-1`).
   - Download a backup from prod, restore it into staging.
   - Open staging's SQL editor and run `select count(*) from public.attendance;` — confirm it is
     not zero and matches prod.
4. That staging project is also TECH-PLAN §6's staging environment, so this buys two things at
   once. From then on the rule is: **every migration runs on staging first, same day, both
   recorded in SESSION-HANDOFF.**

### 3. The IP letter — start the lawyer this week

LEGAL §2. A gym could contest ownership of software you built while freelancing for them. This is
a 2-page letter, **S$500–1,500**, and days rather than weeks. The audit's words: *do not launch
without it.*

Brief for the lawyer — three points:
- (a) Jungle, its code, designs and derived models are yours/your company's, developed outside the
  scope of the freelance engagement, no gym resources claimed;
- (b) the gym's data and its coaches' programming content remain the gym's, licensed to Jungle
  only to operate the service;
- (c) no exclusivity.

While you have them, scope the rest of the pack (LEGAL §6) — customer agreement, DPA schedule,
member privacy notice, coach-content clause. **S$1,500–3,500 total, 2–4 weeks elapsed**, which is
why it starts now and runs parallel to the build. Two things to hand them: the Supabase region
from item 1, and the sub-processor list — **Supabase, Google (Gemini) and/or Anthropic, GitHub**.

### 4. Register yourself as DPO — free, minutes

LEGAL §1: mandatory for every Singapore organisation regardless of size. PDPC's online form. Do it
in the gap while the lawyer is drafting.

> Items 3 and 4 are from the Fable audit and are explicitly *not* legal advice — they are the map
> of what to ask a lawyer, and I have not verified them against current PDPC guidance.

---

## 🟠 Tier 2 — unblocks code I cannot write without you

### 5. Redeploy `persona-ai` (5 minutes)

The deployed function is v7; the repo has changes past it. This blocks verifying the whole
blueprint→generate path, which blocks B3/D2 below.

1. Dashboard → **Edge Functions → `persona-ai`**.
2. Open `supabase/functions/persona-ai/index.ts` from the repo, paste the whole file in.
3. **Deploy.**
4. Same for `smart-build` if the LLM brand recommendation is not live —
   `supabase/functions/smart-build/index.ts`, same steps.

### 6. I15 — switch persona reasoning off the free tier

Right now persona reasoning runs on free Gemini (`gemini-2.5-flash`). **Do this before ingesting a
large corpus**, or re-extraction costs the quota twice.

Dashboard → **Edge Functions → Manage secrets**, add:

```
PERSONA_LLM_PROVIDER = anthropic
ANTHROPIC_API_KEY    = <your key from console.anthropic.com>
```

Then redeploy `persona-ai` (item 5 does this).

⚠️ **One decision inside this one.** With no third secret, the function falls back to a hardcoded
default of `claude-opus-4-8`, which is a generation behind. Set the model explicitly:

```
PERSONA_LLM_MODEL = claude-opus-5      # best reasoning, highest cost
PERSONA_LLM_MODEL = claude-sonnet-5    # ~the sweet spot for corpus extraction
```

Say the word and I will change the hardcoded default in the repo so it stops being stale — I have
left it alone because it affects what you get billed.

### 7. N4 — the member magic-link summary

**The highest-value item in the entire backlog, and the only member-facing surface in the
product.** The share-card half is shipped; the link half needs an Edge Function.

⛔ **Do not let me build the page first** — a member-facing page with no token behind it is the
kind of thing that ships and then quietly leaks a roster.

What it needs, following the LEGAL §4 pattern that already exists for QR check-in:
- An Edge Function that issues a **signed, class-scoped, short-lived token**
  (`{class_instance_id, gym_id, exp, HMAC}`) using the service-role key.
- No member accounts, no login, no member PII in the URL.
- **The standing rule: never loosen RLS to `anon`.** The Edge Function is the boundary.

**What I need from you:** a yes to build it, and then a paste-and-deploy when I hand you the
function. Roughly a day of my work plus your deploy. It also gates P2 (Capacitor).

### 8. B3 / D2 — drive a real deck through Slides import

Needs decks only you have. After item 5 is deployed:

1. Open the Coaches screen → import a real Google Slides deck you have used for a class.
2. Save a blueprint from it.
3. Generate a class from that blueprint.
4. Tell me whether `stats.blueprint > 0` — or just send me the screen.

This is the wedge feature ("Jungle learns how each coach already programs") and it has never been
run against a real corpus. If it fails on your decks, that is the most important bug in the
product and I cannot see it from here.

---

## 🟡 Tier 3 — questions where answering is the whole task

No work beyond a yes/no. Several have been open since session 7.

| # | Question | Recommendation |
|---|---|---|
| 9 | **3 dead symbols.** `nudgeForContrast`, `resolveSubBrand` (`src/lib/colors.js`), `fetchBpmData` (`src/music/spotifyApi.js`). All exported, none called, re-verified dead at `c2db26f`. They stand for features implemented and never wired (FR-H8 sub-brands, Deezer BPM, a superseded contrast nudge). | **Delete all three** (~90 lines). git history keeps them; FR-H8 would be re-derived anyway. |
| 10 | **DEC-16 — can a gym author its own class type?** Today `libraryStore.js` could carry it, but the Builder dropdown, `applyTemplate`, `smartPickClass` and the root's initial `classChoice` all read `WORKOUT_LIBRARY` directly, so a gym-authored type would appear in one modal and nowhere else. | **Not yet.** ~10 call sites move to a merged `getLibrary()`. Worth doing when a gym asks; not before the pilot. |
| 11 | **`eslint-plugin-react`** — closes the crash gate's blind spot for `<UndefinedComponent/>`. Session 16 produced 17 of these at once that the gate reported as zero. | **Yes.** It is a devDependency and a gate change, no runtime effect. The AST script and `screens.spec.js` cover it today, but in-tooling is better. |
| 12 | **Sentry** — the ErrorBoundary currently swallows crashes silently. | **Not before the lawyer.** Crash payloads can carry member names, which makes Sentry a **sub-processor** and puts it in the DPA (LEGAL §6). Cheap to add after; expensive to have added quietly. |
| 13 | **`storage-js`** — ~22 KB pulled into the bundle by the supabase-js constructor, apparently unused. | Low stakes. Leave it unless bundle size becomes the complaint. |
| 14 | **Docs cleanup** — 14 session prompts, a 145 KB `SESSION-HANDOFF.md` and 9 audit files at repo root. | **Yes** — `git mv` the session prompts to `docs/history/`. Costs nothing, and root is now genuinely hard to read. |
| 15 | **DEC-12c** — `winBackBlockedReason` is nearly unreachable. Keep as defence or fold away? | Keep. It is cheap and it is a guard on messaging a lapsed member. |
| 16 | **DEC-12b** — the retention note in a PDPA export. | Not a code change — one line in the lawyer review (LEGAL §7). Fold into item 3. |

---

## 🔵 Tier 4 — only verifiable on the deployed site

The local build has no Supabase credentials, so none of this is reachable from here. The live site
also sits behind real Google/email auth — the PIN bypass only exists in the credential-less local
build, so **driving the deployed app past login needs you.**

1. **Live sync check ×3.** Also exercises I13 (kill Wi-Fi mid-write, restore, confirm it re-pushes
   *without a reload*) and I14 paging. **Cheapest way in: edit or reorder something in the
   Exercise Library** — `e2e/libraryEdit.spec.js` documents exactly what the local half of that
   write looks like, so you can compare. Confirm the DEC-13 delta blob round-trips.
2. **Verify a schedule REMOVE syncs** — and does not come back on the next hydrate. A server-wins
   hydrate against a local delete has cost data here before.
3. **Physical offline soak** — router off 5 minutes mid-class. **P7 only flips to ✅ after this.**
4. **Cross-device Room TV Follow** — coded, never once verified. Note it moved in session 16:
   `sendRoomState`/`onRoomState` are called from `useClassRunner.js` now, not App.
5. **Install the PWA** on your phone and on the room TV.
6. **The Team admin screen, end to end.** Never driven by anyone.
7. **Re-measure the production bundle off the live deploy.** I measured 776.85 KB + 91.19 KB
   locally with dummy credentials, which reproduces production's *shape* but is not the deployed
   artifact.

---

## ⚪ Tier 5 — ops and go-to-market

- **UptimeRobot** — free, 15 minutes. Two monitors: the live site, and a Supabase health probe.
  The only thing that will tell you the site is down before a coach does.
- **Pricing.** GTM §2's hypothesis has never been tested on a real gym. Worth one conversation at
  The Garage before the first invoice.
- **Staff-offboarding note** for the gym runbook: the Google OAuth allowlist (0001) is the tenant
  boundary — remove the email, access ends. One paragraph.

---

## If you only do four things this week

1. **Check the region** (item 1) — 5 minutes, and it is the one that gets expensive to fix.
2. **Email a lawyer** (item 3) — the clock is 2–4 weeks and it runs in parallel with everything.
3. **Upgrade to Pro and do the restore drill** (item 2) — US$25 and an hour.
4. **Redeploy `persona-ai` and drive one real deck through it** (items 5 and 8) — this is the
   feature the whole pitch rests on and it has never met a real corpus.

Items 9–16 are one message of yes/nos whenever you have ten minutes, and several of them unblock
work I can start immediately.
