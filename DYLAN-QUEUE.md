# Everything waiting on Dylan

_Written 2026-07-28 at `80d303a` (session 18). Consolidates §5 of the session prompts, LEGAL
§§1–6, TECH-PLAN §§5–6 and the live-verification queue._

**Part A is configuration and testing you can finish on your own** — every step has the exact
clicks, the exact commands, what "it worked" looks like, what to do when it doesn't, and how to
undo it. Nothing in Part A needs me.

**Part B is decisions.** Answering them is your whole job there; the code that follows is mine.

**Delete this file when it is empty.** Spec §12 remains the backlog of record.

> 🔴 **Status check, session 20 (2026-07-28):** confirmed with Dylan that **A12 and A13 are both
> still outstanding**. That means N4 — the member magic-link summary, built in session 19 — is
> still **code that has never executed**: the two Edge Functions have never handled a request and
> migration 0009 has never been run. Nothing in sessions 19 or 20 changes that, and no test in the
> repo can, by construction. **A1 is also still unconfirmed**, and it is the one item on this
> whole list that gets dramatically more expensive the longer it waits — a Supabase project's
> region cannot be changed after creation, and A1 is a five-minute read-only check.

> ⚠️ Supabase moves its dashboard menus occasionally. Where a path has changed, the thing you are
> looking for is named in **bold** — use the dashboard search (`Ctrl+K`) for that word.
> ⚠️ The legal items come from the Fable audit. They are **not legal advice** and I have not
> verified them against current PDPC guidance. The S$ figures are estimates, not quotes.

---
---

# PART A — you can do all of this yourself

| # | Task | Time | Risk |
|---|---|---|---|
| A1 | Confirm the Supabase region | 5 min | none (read-only) |
| A2 | Move the project to Singapore — **only if A1 says you must** | 60–90 min | medium, fully reversible |
| A3 | Supabase Pro + backups | 10 min | none |
| A4 | The restore drill | 45 min | none (staging only) |
| A5 | Redeploy the two Edge Functions | 10 min | low, instantly revertible |
| A6 | Switch persona reasoning to Claude | 10 min | low, revertible |
| A7 | Drive a real deck through Slides import | 30 min | none |
| A8 | UptimeRobot monitors | 15 min | none |
| A9 | Register as DPO | 20 min | none |
| A10 | Brief a lawyer | 1 email | none |
| A11 | The live-verification queue (7 checks) | ~2 h | none |
| **A12** | **Turn on member links (N4)** — 1 secret, 2 functions, 1 migration | **25 min** | low, fully revertible |
| 🔴 **A14** | **Run migration 0010 — the staff read boundary.** A `member`-role account currently reads the whole gym. | **10 min** | low, idempotent |
| **A15** | **Let Actions open pull requests** — one checkbox, so branches stop going unnoticed | **30 sec** | none, revertible |
| **A13** | **Send yourself a member link and open it on your phone** | 10 min | none |
| **A16** | **Decide the `health_screen` consent scope** — one CHECK constraint, and the health screen is already collecting the consent locally | **10 min to decide** | none until you write it |

---

## A1 · Confirm the Supabase region — do this before anything else

**Why first.** PDPA transfer limitation (LEGAL §1) requires the DPA to name where member data
lives, and **a Supabase project's region cannot be changed after creation.** Right now you have no
real member data, so fixing it is a 90-minute rebuild. After the pilot it becomes a data migration.

### Steps
1. Go to <https://supabase.com/dashboard> and sign in.
2. Click your project (the one whose URL matches the `VITE_SUPABASE_URL` GitHub secret).
3. Left sidebar → **Settings** (gear, bottom) → **General**.
4. Find the **Region** row.

### What you want to see
> **Southeast Asia (Singapore)** — `ap-southeast-1`

### What to do next
- **If it says Singapore** → ✅ done. Write the exact string down; item A10 needs it. Skip A2.
- **If it says anything else** (e.g. `us-east-1`, `eu-west-2`, `ap-southeast-2` Sydney) → do A2.

### Also check now, while you are here
On the same page, note the **Project ID** (also called the reference — a 20-character string like
`abcdefghijklmnopqrst`). You will want it in A4.

---

## A2 · Move the project to Singapore — ONLY if A1 said so

Skip entirely if A1 said Singapore.

### First: check whether you have real data
Left sidebar → **SQL Editor** → **New query**. Paste and **Run**:

```sql
select 'members' as t, count(*) from public.members
union all select 'attendance', count(*) from public.attendance
union all select 'class_instances', count(*) from public.class_instances
union all select 'coach_personas', count(*) from public.coach_personas
union all select 'persona_plans', count(*) from public.persona_plans;
```

- **All zeros, or only your own test rows** → take the **Clean rebuild** path. 60 minutes, no risk.
- **Real member names you recognise** → stop and tell me. Do not improvise a data migration;
  I will write you an export/import script. (This is the one place in Part A where you should
  come back to me, and only in this specific case.)

### Clean rebuild path

**Step 1 — create the new project.**
1. Dashboard → **New project**.
2. Name: `jungle` (or `jungle-prod`).
3. **Region: Southeast Asia (Singapore) `ap-southeast-1`.** ← the entire point
4. Set a database password. **Save it in your password manager now** — it is shown once.
5. Wait ~2 minutes for provisioning.

**Step 2 — run the migrations, in order, one at a time.**
In the NEW project: **SQL Editor** → **New query**. For each file below, open it from
`C:\Users\dylan\jungle-app\supabase\migrations\`, copy the *entire* contents, paste, **Run**, and
wait for "Success" before starting the next:

```
0001_auth_foundation.sql      ← EDIT THIS ONE FIRST, see below
0002_rbac_write_hardening.sql
0003_phase1_domain_tables.sql
0004_brand_active_skin.sql
0005_coach_personas.sql
0006_persona_generations.sql
0007_attendance_spine.sql
0008_retention_actions.sql
```

> 🔴 **Before running `0001`:** it contains `owner@example.com` in three places (around lines 202,
> 213 and 215). Replace **all three** with your own email — this is what allowlists you as gym
> admin. If you skip it you will be locked out of your own project and have to re-run 0001.
> In your editor: Find & Replace, `owner@example.com` → `dylanrodrigues2710@gmail.com`.

Order matters — later files reference tables the earlier ones create. If you paste one out of
order you will get `relation "public.x" does not exist`; just run the missing earlier file and
carry on.

**Step 3 — configure auth.**
1. **Authentication → Providers → Email** → ensure **Email** is enabled.
2. **Authentication → URL Configuration → Redirect URLs** → add both:
   - `https://killdylz.github.io/Jungle-App/`
   - `http://localhost:5173/`

**Step 4 — copy the new keys.**
**Settings → API**, copy:
- **Project URL** → e.g. `https://<new-ref>.supabase.co`
- **anon public** key (the long one). **Not** `service_role` — that must never reach the browser.

**Step 5 — re-point GitHub.**
1. <https://github.com/killdylz/Jungle-App> → **Settings → Secrets and variables → Actions**.
2. Click `VITE_SUPABASE_URL` → **Update** → paste the new Project URL → **Update secret**.
3. Same for `VITE_SUPABASE_ANON_KEY`.

**Step 6 — redeploy.**
```powershell
cd "C:\Users\dylan\jungle-app"; .\deploy.ps1 -Message "Point at Singapore Supabase project"
```
If the tree is clean it will say "Nothing to deploy". In that case trigger the build by hand:
GitHub → **Actions** → **Deploy to GitHub Pages** → **Run workflow** → branch `main` → **Run**.

**Step 7 — verify.**
1. Wait for the Actions run to go green (~2–3 min).
2. Open <https://killdylz.github.io/Jungle-App/> in a **private window**.
3. You should get the **Sign in** screen. Enter your email → magic link → sign in.
4. You should land as admin. If you see **Not authorized**, the `0001` email edit did not take —
   re-run `0001` with the right email.

**Step 8 — redo the Edge Function setup.** A new project has no functions and no secrets, so
now do **A5 and A6** against the new project before deleting the old one.

**Step 9 — delete the old project.** Only once steps 7 and 8 pass.
Old project → **Settings → General** → scroll to the bottom → **Delete project**.

**Undo at any point:** put the two old secret values back in GitHub and re-run the workflow. The
old project is untouched until step 9.

---

## A3 · Supabase Pro + backups

The free tier has **no backups at all**. This is LEGAL §3's first hole and TECH-PLAN §5's first
failure point. **US$25/month.**

### Steps
1. Dashboard → your project → **Settings → Billing** (or **Organization → Billing**).
2. **Upgrade to Pro** on the organisation that owns the project. Card details, confirm.
3. Go to **Database → Backups**.
4. You should now see **Daily backups** with a retention window (7 days on Pro).

### What "it worked" looks like
The Backups page lists at least one dated entry with a **Download** option. On a fresh upgrade the
first backup can take up to 24 hours to appear — that is normal, come back tomorrow for A4.

### If the Backups page still says the feature needs a paid plan
You upgraded a different organisation from the one owning this project. Dashboard → top-left
**organisation switcher** → confirm which org the project sits in, and upgrade that one.

---

## A4 · The restore drill — do the thing, don't assume it

An untested backup is a hope. This is explicitly part of LEGAL §3 hole #1, and it doubles as your
staging environment (TECH-PLAN §6).

### Step 1 — create the staging project
1. Dashboard → **New project**, name `jungle-staging`.
2. **Same region as prod** (Singapore).
3. Free tier is fine. Save the database password.

### Step 2 — install the Postgres client tools (one-off)
You need `psql`/`pg_restore`. In PowerShell:
```powershell
winget install -e --id PostgreSQL.PostgreSQL.17
```
Then close and reopen PowerShell and check:
```powershell
psql --version
```
Expected: `psql (PostgreSQL) 17.x`.

If `psql` is not found, add it to PATH for this session (adjust the version folder if different):
```powershell
$env:PATH += ";C:\Program Files\PostgreSQL\17\bin"; psql --version
```

### Step 3 — download a prod backup
Prod project → **Database → Backups** → newest entry → **Download**. You get a `.backup` or
`.sql.gz` file. Note where it saved (usually `C:\Users\dylan\Downloads`).

### Step 4 — get the staging connection string
Staging project → **Settings → Database** → **Connection string** → **URI** tab.
It looks like:
```
postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```
Replace `[YOUR-PASSWORD]` with the staging DB password you saved.

### Step 5 — restore into staging
For a `.sql.gz`:
```powershell
cd "$env:USERPROFILE\Downloads"
# unzip first (7-Zip, or this if you have gzip):
tar -xzf <filename>.sql.gz
psql "postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" -f <filename>.sql
```
For a `.backup` (custom format):
```powershell
pg_restore --clean --if-exists --no-owner --no-privileges `
  -d "postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" `
  "<filename>.backup"
```

Expect a wall of output and **some errors are normal** — lines mentioning `role "supabase_admin"
does not exist`, `extension ... already exists`, or `must be owner of` are Supabase-managed
objects and can be ignored. What must NOT appear is errors on `public.attendance`,
`public.members`, `public.class_instances`.

### Step 6 — prove it actually restored
Staging project → **SQL Editor** → **New query**:
```sql
select 'members' as t, count(*) from public.members
union all select 'attendance', count(*) from public.attendance
union all select 'class_instances', count(*) from public.class_instances;
```
Run the identical query on **prod**. **The numbers must match.** That is the drill passing.

### If the restore fails entirely
The fallback that still proves something: unzip the dump and search it for a member name you
recognise (`Ctrl+F` in a text editor, or `Select-String -Path dump.sql -Pattern "SomeName"`). If
the data is in the file, the backup is real and only your restore tooling is wrong — which is a
much smaller problem, and worth telling me about.

### After this
Keep `jungle-staging`. New rule from here on: **every migration runs on staging first, then prod,
the same day, both recorded in SESSION-HANDOFF.**

---

## A5 · Redeploy the two Edge Functions

The deployed `persona-ai` is v7; the repo is ahead of it. This blocks A7.

### Steps
1. Dashboard → your project → **Edge Functions** (left sidebar).
2. Click **`persona-ai`**.
3. Find the code editor / **Deploy a new version**.
4. Open `C:\Users\dylan\jungle-app\supabase\functions\persona-ai\index.ts`.
5. Select all (`Ctrl+A`), copy (`Ctrl+C`), and paste over the entire contents in the dashboard.
6. Click **Deploy**. Wait for the success toast.
7. Repeat 2–6 for **`smart-build`** with
   `C:\Users\dylan\jungle-app\supabase\functions\smart-build\index.ts`.

### If there is no `persona-ai` function listed
It was never deployed to this project (expected if you just did A2). Click **Create function**,
name it exactly `persona-ai` (lowercase, hyphen), paste, deploy. Same for `smart-build`.

### How to check it worked
Edge Functions → `persona-ai` → **Invocations** / **Logs**. Then in the app (Coaches screen) do
anything that generates — a new invocation should appear within seconds. A `200` is good. A `500`
here is usually a missing secret → do A6.

### Undo
The Functions page keeps previous versions; you can redeploy an earlier one. There is nothing
persistent to corrupt — functions are stateless.

---

## A6 · Switch persona reasoning to Claude (I15)

Persona reasoning currently runs on **free Gemini** (`gemini-2.5-flash`). Do this **before**
ingesting a large corpus, or re-extraction burns the quota twice.

### Step 1 — get an Anthropic API key
1. <https://console.anthropic.com> → sign in → **API Keys** → **Create Key**.
2. Copy it (starts `sk-ant-`). Shown once.
3. Add credit: **Billing** → add a payment method. Start with US$20; corpus extraction is cheap.

### Step 2 — set three secrets
Dashboard → **Edge Functions → Secrets** (may be under **Settings → Edge Functions**) → **Add new
secret**, three times:

| Name | Value |
|---|---|
| `PERSONA_LLM_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (your key) |
| `PERSONA_LLM_MODEL` | `claude-sonnet-5` |

> 🔴 **The third one is not optional.** Without it the function falls back to a hardcoded
> `claude-opus-4-8`, which is a generation behind. Use `claude-sonnet-5` for the quality/cost sweet
> spot on corpus extraction, or `claude-opus-5` if you want maximum reasoning quality and don't
> mind paying several times more per deck.

### Step 3 — redeploy
Secrets are read at invocation, but redeploy anyway so you know exactly what is live:
repeat **A5** for `persona-ai`.

### How to check it worked
Coaches screen → run any generation → Edge Functions → `persona-ai` → **Logs**. You are looking
for a successful call with no `GEMINI_API_KEY not set` or `ANTHROPIC_API_KEY not set`. Then check
<https://console.anthropic.com> → **Usage** — a non-zero token count is proof it reached Anthropic.

### Undo
Delete the `PERSONA_LLM_PROVIDER` secret (or set it to `gemini`). It falls straight back to the
free tier.

---

## A7 · Drive a real deck through Slides import

**This is the most valuable thing in Part A.** The wedge of the entire pitch is "Jungle learns how
each coach already programs, from the slides they've written for years", and it has never been run
against a real corpus. Needs decks only you have. Do A5 first.

### Steps
1. Open the live site, sign in.
2. Go to **Coaches**.
3. Start a **Google Slides import**. Authorise with the Google account that owns the deck when
   prompted (this uses a separate Cloud project from your login OAuth — expect a consent screen
   that says "unverified", which is correct; it is in Testing mode).
4. Pick a **real deck you have actually taught from**. Not a test file.
5. Let it extract. Save a **blueprint**.
6. Generate a class from that blueprint.

### What to record and send me
- Did extraction find the classes, or silently drop slides?
- Is `stats.blueprint > 0`? (If the number is not on screen: F12 → **Application → Local Storage**
  → find `jungle_persona_generations`, look at the newest entry.)
- Does the generated class look like something **you** would teach, or like generic filler?
- A screenshot of the generated class.

Honest answers matter more than a pass. If it produces plausible-looking nonsense from your real
decks, that is the most important bug in the product and I cannot see it from here.

---

## A8 · UptimeRobot — 15 minutes, free

The only thing that will tell you the site is down before a coach does.

1. <https://uptimerobot.com> → free account.
2. **Add New Monitor**:
   - Type **HTTPS**, name `Jungle live`, URL `https://killdylz.github.io/Jungle-App/`,
     interval 5 minutes.
3. **Add New Monitor** again:
   - Type **HTTPS**, name `Jungle Supabase`, URL
     `https://<your-project-ref>.supabase.co/rest/v1/` , interval 5 minutes.
   - This returns `401` without a key, which is a *healthy* response. Under **Advanced → Alert
     when status code is NOT** set it to accept `401`, or use "keyword exists" instead. If the
     free tier will not let you accept a 401, monitor
     `https://<ref>.supabase.co/auth/v1/health` instead, which returns `200`.
4. **My Settings → Alert Contacts** → add your email (and phone if you want SMS).

---

## A9 · Register yourself as DPO

LEGAL §1: mandatory for every Singapore organisation, any size. Free, minutes.

1. Go to the PDPC website (<https://www.pdpc.gov.sg>) and find **DPO registration** — it is filed
   through ACRA's BizFile for a registered entity, or PDPC's own form.
2. Register yourself as the Data Protection Officer for your entity.
3. Record the DPO email you used — the member privacy notice template (A10) needs it.

> I have not verified the current filing route; PDPC has changed it before. If the site sends you
> somewhere different, follow the site — it is authoritative and this document is not.

---

## A10 · Brief a lawyer — one email, this week

The clock is **2–4 weeks** and it runs in parallel with everything else, which is why it starts
now. **S$1,500–3,500** for the full pack; the IP letter alone is **S$500–1,500** and can be days.

The audit's position: *do not launch without the IP letter.*

### Copy-paste brief

> I run a small software product (Jungle — class management for boutique gyms) and I'm about to
> pilot it at a Singapore gym where I also freelance as a trainer. I need, in order of urgency:
>
> 1. **An IP acknowledgment letter** signed by the pilot gym confirming: (a) the software, its
>    designs and derived models are my company's property, developed outside the scope of my
>    freelance engagement with no gym resources claimed; (b) the gym's data and its coaches'
>    programming content remain the gym's, licensed to me only to operate the service; (c) no
>    exclusivity.
> 2. **A SaaS customer agreement** — licence, fees, light SLA, liability cap around 12 months of
>    fees, termination with data return/deletion, and clear allocation that the gym is the
>    "organisation" under PDPA and I am a **data intermediary**.
> 3. **Data-processing terms** as a schedule to (2): scope and purpose, security measures, breach
>    notice to the gym within 48 hours, named sub-processors, where data is stored, deletion on
>    exit.
> 4. **A gym-branded member privacy notice template** — what's collected (name, contact,
>    attendance), purposes, DPO contact, access/correction rights.
> 5. A clause covering **coach content ownership and portability**.
>
> Facts you'll need: member data is stored in Supabase (Postgres) in **[REGION FROM A1]**.
> Sub-processors are **Supabase**, **Anthropic and/or Google (LLM processing of class-planning
> content, not member PII)**, and **GitHub** (static hosting). Attendance records are
> insert-only. I have registered as DPO of my entity.

Fill in `[REGION FROM A1]` before sending. Also ask them the DEC-12b question: **what retention
note needs to appear on a PDPA data export.**

---

## A11 · The live-verification queue

None of this is reachable from my side: the local build has no Supabase credentials, and the live
site sits behind real Google/email auth — the PIN bypass only exists in the credential-less local
build. All seven need you on the deployed site.

Do them in this order; 1 and 2 are the ones that protect data.

### 1. Live sync round-trip (×3)
1. Sign in on the live site, go to **Exercise Library**.
2. Press **Edit**, rename one movement, press **Done**.
3. Open a **different browser or device**, sign in, go to Exercise Library.
4. ✅ The rename is there.
5. Repeat twice more with a **reorder** and a **delete**.

### 2. Offline → online re-push (I13)
1. On the live site, turn **Wi-Fi off**.
2. Make a library edit. It should save locally with no error.
3. Turn Wi-Fi **back on**. **Do not reload.**
4. Wait ~60 seconds.
5. ✅ On another device, the edit has arrived. If it only appears after a reload, tell me — that
   is I13 failing and it is a real bug.

### 3. Verify a schedule REMOVE syncs
1. Add a class to the schedule, wait ~30s, confirm it appears on a second device.
2. Remove it on device A.
3. Reload device B.
4. ✅ It is gone. **If it comes back, stop and tell me** — a server-wins hydrate against a local
   delete has cost data in this repo before.

### 4. Physical offline soak — P7 only goes ✅ after this
1. Start a class in the Runner.
2. Turn the **router** off for 5 minutes mid-class.
3. Keep using it — check people in, advance stages.
4. Router back on.
5. ✅ Nothing was lost and the check-ins reach the server.

### 5. Cross-device Room TV Follow — coded, never once verified
1. Device A (phone): start a class in the Runner.
2. Device B (TV/laptop): **Class Runner → Room TV**, then move the mouse / tap to wake the bar and
   press **Follow**.
3. ✅ B mirrors A's stage and timer within ~1 second.
4. If B says "Following this room — waiting for the coach's runner to start…" forever, tell me.

### 6. Install the PWA
On your phone (Safari → Share → **Add to Home Screen**) and on the room TV. Confirm it opens
full-screen with the Jungle icon and still works with Wi-Fi off.

### 7. Team admin screen, end to end
**Team** in the sidebar. Add a coach, change a role, remove them. Never driven by anyone. Report
anything that does nothing.

---

## A12 · Turn on member links (N4) — the member-facing half of the product

You approved this in session 18 and it is **built and tested**. What is left is three
paste-jobs on your side. Do A5 first if you have not (same skill, and it warms you up).

Until you do this, the "Member link" button in the Class Runner honestly says links
aren't available. Nothing is broken in the meantime.

### Step 1 — make the signing secret

This is the key that makes a member link unforgeable. It must be random and it must never
leave Supabase. Generate one in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the line it prints. **Do not reuse a password, and do not put it in GitHub** — this
one lives only in Supabase's Edge Function secrets.

### Step 2 — set it as a secret

Dashboard → **Edge Functions → Secrets** (may be under **Settings → Edge Functions**) →
**Add new secret**:

| Name | Value |
|---|---|
| `JUNGLE_SUMMARY_SECRET` | the string from step 1 |

> 🔴 Both functions below read this **same** secret. One signs links, the other checks
> them, so if they ever disagree every member link stops working at once and the error
> looks exactly like a broken link. There is only one secret on purpose.

### Step 3 — deploy the two functions

Same flow as A5. Dashboard → **Edge Functions** → **Create function** for each:

| Function name (exact) | Paste from | **Verify JWT** |
|---|---|---|
| `summary-token` | `supabase\functions\summary-token\index.ts` | **ON** (the default — leave it) |
| `summary-read`  | `supabase\functions\summary-read\index.ts`  | 🔴 **OFF** |

**The JWT setting is the one thing here you must get right.**
- `summary-token` mints links, so only a signed-in coach may call it → **ON**.
- `summary-read` is opened by a member who has no account and never will → **OFF**.
  With it on, every member link returns "not authorised" and the page will say the link
  isn't valid.

The toggle is on the function's own page (**Details** / **Settings**), labelled
**Verify JWT with legacy secret** or **Enforce JWT verification** depending on the
dashboard version.

### Step 4 — run migration 0009

**SQL Editor → New query** → paste the whole of
`C:\Users\dylan\jungle-app\supabase\migrations\0009_class_summaries.sql` → **Run**.
Safe to re-run. If you have done A4, run it on **staging first**, then prod the same day.

This creates the table that holds what a member actually sees — the movement list. Skip
it and links still work, but they show only the class name, time and coach, and the app
will tell the coach that when they create one.

### What "it worked" looks like
See **A13** — the only real test is opening one on a phone.

### If something is wrong
- Coach sees **"Couldn't create the link"** → the secret is missing, or `summary-token`
  was not deployed. Check **Edge Functions → summary-token → Logs**.
- Coach sees **"the studio's database hasn't been set up for published classes"** →
  step 4 was skipped. The link still works; it is just thin.
- Member sees **"This link isn't valid"** immediately → `summary-read` still has
  **Verify JWT ON**, or the two functions were given different secrets.

### Undo
Delete the `JUNGLE_SUMMARY_SECRET` secret. Every existing link stops working immediately
and the coach-side button reports an honest error. The table can stay; it holds no
member data. Nothing else in the app is affected.

---

## A13 · Send yourself a member link and open it on your phone

The whole point of N4, and the first time anything in Jungle has been seen by a
non-staff member. Ten minutes, and it needs a phone that is **not** signed in.

1. On the live site, go to **Class Runner** and start a class with some movements in it.
2. Press **Link** in the top bar (next to Check in).
3. Copy the link, send it to yourself on WhatsApp.
4. Open it **on your phone**, ideally in a private tab so there is no session.

### What you should see
Your gym's name and colours, the class name and date, and the movement list. **No
sign-in. No Jungle branding anywhere.**

### What to tell me
- Does it look like *your* studio, or like a generic app?
- Is the movement list what you actually taught?
- Anything a member would find confusing.
- 🔴 **Does it name anybody?** It must not — not the member, not who attended. If any
  person's name other than the coach's appears, stop and tell me immediately.

---
---

## 🔴 A14 — run migration 0010. Do this before anyone gets a client login.

**What is wrong.** Every read policy written since `0001` is `gym_id in (select user_gym_ids())`,
and that function filters on `status = 'active'` but **not on role**. `membership_role` has
included `'member'` since the day it was written. So the obvious way to give a PT client an
account — a `memberships` row with role `'member'` — hands that client `SELECT` on the entire
roster with email addresses, every attendance row, every consent record, and the coach persona
corpus your first gym's agreement says belongs to the coach.

**It is not exploitable today** only because no member-role user has ever existed. That is a fact
about your data, not about your policies, and it stops being true the moment a client portal ships.

**What to do** (10 minutes, idempotent, safe to re-run):

1. Merge the PR titled *0010 — a member-role account could read the entire gym*. That only puts
   the file in the repo; **it changes nothing on the server.**
2. Supabase dashboard → **SQL Editor** → New query.
3. Paste the whole of `supabase/migrations/0010_staff_read_boundary.sql` → **Run**.
4. Expect `Success. No rows returned`.
5. Verify: new query → paste `supabase/tests/0010_rls_selftest.sql` → **Run**. It asserts the
   boundary rather than assuming it, and tells you which policy is wrong if one is.

**If it goes wrong:** the migration only replaces policies, it touches no data. `0010` is written
to be re-runnable, so a partial run is fixed by running it again.


## A15 — let Actions open pull requests. One checkbox.

`auto-pr.yml` turns any pushed `claude/**` branch into a pull request, so work
cannot sit invisible the way 47 commits across six branches did. It is written,
merged and running — and GitHub refuses it:

> `pull request create failed: GraphQL: GitHub Actions is not permitted to create
> or approve pull requests (createPullRequest)`

That is a repository setting, off by default, not a bug in the workflow.

**What to do** (30 seconds):

1. Repo → **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Tick **☑ Allow GitHub Actions to create and approve pull requests**
4. **Save**

**How to check it worked:** push anything to a `claude/**` branch, or re-run the
latest *Open a PR for a claude branch* job. A PR appears within a minute.

**Until you do**, the workflow does not fail — it posts a yellow warning on the
run naming the branch and its commit count, because a workflow that is always red
is one everyone learns to ignore, and the next real failure would hide behind it.
The cost of leaving it off is that you go on opening those PRs by hand.

⚠️ The setting also permits Actions to *approve* PRs. Nothing in this repo does,
and nothing should — approval is a human saying they read it.


# PART B — decisions

**One open question (B10, added session 28).** The rest you answered in session 18; they are
listed so the decisions have somewhere to live until the spec absorbs them.

| # | Question | Your answer | State |
|---|---|---|---|
| B1 | N4 member magic-link summary | **Yes, build it** | ✅ **Built** (session 19). Deploy = **A12**. |
| B2 | 3 dead symbols | **Delete** | ✅ Done |
| B3 | DEC-16 gym-authored class type | **Yes** | ✅ Done |
| B4 | `eslint-plugin-react` | **Yes** | ✅ Done — crash gate now catches `<UndefinedComponent/>` |
| B5 | Sentry | **Not until the lawyer is done** | ⏸ Waiting on A10 |
| B6 | `storage-js` (~22 KB) | **Leave it** | ✅ Closed |
| B7 | Docs cleanup | **Yes** | ✅ Session prompts moved to `docs/history/` |
| B8 | `winBackBlockedReason` | **Keep** | ✅ Closed |
| B9 | `claude-opus-4-8` default | **Yes, update** | ✅ Done — A6 sets it explicitly anyway |
| **B10** | **The 1:1 / PT tables (F1)** | *unanswered* | 🔴 **OPEN — session 28.** See below. |

## B10 — the 1:1 tables. One question, and it is not urgent.

**Session 28 built the PT function**: a `1:1 Clients` screen, a `Health Screen` (PAR-Q), planned
and delivered 1:1 sessions, and the hard gate the spec requires — a coach cannot plan a
personalised session for someone without a valid health screen. It works today, end to end.

**It is stored on ONE DEVICE.** Three localStorage keys (`jungle_pt_clients`,
`jungle_parq_records`, `jungle_pt_sessions`) and no server table, because F1's
`session_assignments` migration is your call and I did not make it. If the coach's laptop dies,
the 1:1 records and every health screen with it are gone. Nothing else in the product is affected —
the member roster syncs exactly as it always has, and a 1:1 client is a member.

**I deliberately did NOT write sync code against tables that do not exist.** It would fail on every
write, light the sync banner permanently, and make the retry loop re-push the same doomed rows every
30 seconds — breaking the banner for classes, personas and attendance too.

**The question:** do you want the migration written? It is three tables (1:1 clients, PAR-Q records,
1:1 sessions) plus RLS, and — because PAR-Q answers are health data under PDPA — it is the first
thing in this product that stores a special category of personal data on a server. That is worth
putting in front of the lawyer in **A10** at the same time, which is the real reason this is a
question rather than a task.

Either answer is fine and neither blocks anything: **"not yet"** leaves it exactly as it is, working
and local, with the screen telling the gym so in its first card.

**There are no other open questions for you right now.** When there are, they go back here.

---

# PART B (archive of the original wording)

Kept only because the reasoning is sometimes worth re-reading. Skip it.

<details>
<summary>Original Part B</summary>


Reply with a line each. Several unblock work I can start the same day. Nothing here needs you to
touch a dashboard.

| # | Question | My recommendation |
|---|---|---|
| B1 | **N4 — member magic-link summary.** The only member-facing surface in the product and the last Phase-1 gap. Needs an Edge Function issuing a signed, class-scoped, short-lived token — no member accounts, no login, no PII in the URL, and RLS never loosened to `anon`. Roughly a day of my work, then one paste-and-deploy from you (same as A5). | **Yes, build it.** It is the highest-value item in the backlog and it also gates P2 (Capacitor). |
| B2 | **3 dead symbols** — `nudgeForContrast`, `resolveSubBrand` (`src/lib/colors.js`), `fetchBpmData` (`src/music/spotifyApi.js`). All exported, none called, re-verified dead. They stand for features built and never wired (FR-H8 sub-brands, Deezer BPM, a superseded contrast nudge). | **Delete all three** (~90 lines). git history keeps them. |
| B3 | **DEC-16 — can a gym author its own class type?** Today it would appear in one modal and nowhere else: the Builder dropdown, `applyTemplate`, `smartPickClass` and the root's `classChoice` all read `WORKOUT_LIBRARY` directly. | **Not yet.** ~10 call sites move to a merged `getLibrary()`. Do it when a gym asks. |
| B4 | **`eslint-plugin-react`** — closes the crash gate's blind spot for `<UndefinedComponent/>`. Session 16 produced 17 at once that the gate reported as zero. | **Yes.** devDependency + gate change, no runtime effect. |
| B5 | **Sentry** — the ErrorBoundary swallows crashes silently today. | **Not until the lawyer is done.** Crash payloads can carry member names, making Sentry a **sub-processor** that belongs in the DPA (LEGAL §6). Add it right after A10 lands. |
| B6 | **`storage-js`** — ~22 KB pulled in by the supabase-js constructor, apparently unused. | Leave it. Not worth the risk for 22 KB. |
| B7 | **Docs cleanup** — 14 session prompts, a 145 KB `SESSION-HANDOFF.md` and 9 audit files at repo root. | **Yes** — `git mv` the session prompts into `docs/history/`. |
| B8 | **DEC-12c** — `winBackBlockedReason` is nearly unreachable. Keep or fold away? | **Keep.** Cheap, and it guards against messaging a lapsed member. |
| B9 | **Should I update the hardcoded `claude-opus-4-8` default** in `persona-ai`? | **Yes** — but A6 sets `PERSONA_LLM_MODEL` explicitly, so it stops mattering either way. |

</details>

---

## If you only do four things this week

1. **A1 — check the region.** 5 minutes, and it is the only item that gets dramatically more
   expensive the longer it waits.
2. **A10 — email the lawyer.** The 2–4 week clock starts the day you send it.
3. **A3 + A4 — Pro and the restore drill.** US$25 and about an hour, and it removes the single
   worst failure mode you currently have.
4. **A5 + A7 — redeploy and put one real deck through it.** This is the feature the whole pitch
   rests on and it has never met a real corpus.

**A12 + A13 are the fun ones** — 35 minutes, and at the end of them there is something you can
show a member. They do not block anything else, so do them when you want a win rather than a
chore. Part B is empty; there is nothing waiting on an answer from you.

---

## Node 20 deprecation on the GitHub Actions runners  ·  added 2026-08-04 (session 26)

**Not urgent, but it now has a clock on it.** Every `Deploy to GitHub Pages` run prints:

> Node.js 20 is deprecated. `actions/checkout@v4`, `actions/setup-node@v4`,
> `actions/upload-artifact@v4`, `actions/deploy-pages@v4` target Node.js 20 but are being
> **forced to run on Node.js 24**.

The deploy is green today because GitHub is overriding the runtime for us. When they stop, those
four actions break and the deploy stops — and the deploy is what publishes the app.

**These are exactly Dependabot PRs #1–#5**, open since 3 August. So the bumps are no longer a
version-hygiene nag; they are the fix for a dated warning.

**Recommended:** merge #1–#5 in a session where they are the ONLY change, so a red run has exactly
one suspect. Major Actions bumps break CI in ways only a real run reveals, and bundling them with
product work is how you spend a day bisecting.

Left for Dylan per the standing rule: no infra changes, and no Dependabot merges, without asking.

> **Still true at `1a7bce4` (session 27, 2026-08-10).** Session 27's prompt asked for this to be
> recorded here as if it were new; it was already written up above by session 26 on 2026-08-04, and
> nothing has changed except that the warning is now a week older. Every deploy in this session
> printed it. Re-verified rather than re-filed.

---

## A copy string that must be deleted when 0005/0006 are applied  ·  added 2026-08-10 (session 27)

**Not a decision — a coupling to remember, and it will not announce itself.**

The coach-delete confirm (session 27, `PersonasScreen.jsx` → `DeleteCoachConfirm`) tells the coach:

> Coach data is not yet backed up to a server, so nothing else holds a copy.

That is true today and it is why the dialog exists at all — a persona cascade is the most
expensive data in the product and, with `0005_coach_personas.sql` and `0006_persona_generations.sql`
unapplied, it lives on one device. **The moment you apply those two migrations the sentence becomes
a lie**, and it is a lie that makes a coach more frightened of a reversible action than they need
to be.

**When A-whatever-number applying 0005/0006 gets done: delete that sentence.** Nothing will fail.
No test asserts it is absent, because a test that did would be asserting a fact about your Supabase
project rather than about the code. `e2e/destructive.spec.js` asserts it is PRESENT, so removing the
string means updating that assertion in the same commit — which is the reminder, if you are reading
the test output.


---

## A16 · The `health_screen` consent scope  ·  added 2026-09-01 (session 34)

**⚠️ Numbering note:** PR #14 adds an **A14** (run migration `0010`) and an **A15** (the auto-PR
repository setting) to this file. This entry is numbered **A16** to sit after them rather than
collide. If #14 has not merged when you read this, A14 and A15 will not be above — they are in that
branch, not lost.

### The decision

`consent_records.scope` (migration `0007`) carries a CHECK constraint listing exactly five values:

```
'roster_attendance', 'biometric_live', 'biometric_store', 'coach_view', 'export'
```

The health screen collects **health answers** — a special category of data under the PDPA — and none
of those five describes that. Adding a sixth, `health_screen`, is a one-line migration. **Whether to
write it is yours**, on the same standing rule as every other schema change.

### What session 34 did in the meantime, and why it is not a workaround

Session 34's own prompt asked for `store.recordConsent()` to be called on save with a `health_screen`
scope. **That was refused, for two reasons, and the second is the important one:**

1. The scope is not in the constraint, so **every insert would have been rejected by Postgres.** A
   constrained column rejecting a client value is this repo's recurring data-loss bug — three prior
   occurrences, and the reason `RETENTION_RULES` exists as a single exported constant.

2. A `consent_records` row **asserts that a person consented.** `CheckInPanel` already refuses to
   write one for check-ins, in its own words: *"in a coach sweep, none was [shown]... writing one
   anyway would fabricate a compliance record, which is worse than an empty ledger."* Fabricating
   that record for **health** answers would be the worst version of that mistake, not an acceptable
   one.

So the consent is now **real and local**: `PARQ_CONSENT_NOTICE` is displayed on the health screen,
there is a checkbox that starts unticked, and `store.appendParqRecord` **refuses to write health
answers without it**. Each record carries `{ grantedAt, policyVersion, method: 'explicit_opt_in' }`.

`explicit_opt_in` is already one of the four values 0007's `method` constraint allows. So the rows
being written today are **shaped to be mirrored** the day the scope exists — the only missing piece
is the scope itself.

### If you decide yes

The migration is one statement (drop and recreate the CHECK with the sixth value). Then
`appendParqRecord` can mirror to `consent_records` beside the local write. **Do not** back-fill the
records written before then: they carry an honest `grantedAt` from the day the client actually
ticked, and inventing server rows for the ones that predate the field would be the fabrication this
entry exists to refuse.

⚠️ The PAR-Q ledger itself is still **local-only and unsynced** (`jungle_parq_records`), so mirroring
consent alone would put a consent trail on a server for health answers that are not there. Sequence
this **after** the 1:1 tables (B10), not before.
