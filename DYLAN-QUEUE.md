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
| **A13** | **Send yourself a member link and open it on your phone** | 10 min | none |
| **A14** | **A yes/no: does Jungle bend a gym's accent to make it legible?** | 10 min read | none — a decision, no work |
| **A15** | **Run migration 0010** — or the away/cover board stays on one phone | **10 min** | low, fully revertible |
| **A16** | **You said yes. Four facts before anyone signs anything: Mindbody** | 20 min | none — a decision |

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

# PART B — all answered, kept as the record

**Nothing here needs you.** You answered every one of these in session 18; they are
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

**There are no open questions for you right now.** When there are, they go back here.

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

## A DECISION: should Jungle rank COACHES the way it now ranks class types?  ·  added 2026-08-11 (session 28)

**This is yours, not mine, and I have deliberately not built it.**

Session 28 shipped "which of your class types keeps members" (`lib/classTypeRetention.js`, on the
Analytics screen). It joins `class_instances.class_type` to `attendance` and reports, per class
type, the share of members who tried it and came back within four weeks.

**The identical join, with `class_instances.coach_name` instead of `class_type`, produces a coach
league table.** It is four lines of code. The data is already there; nothing is missing. I did not
write those four lines, and here is the case both ways so you can decide rather than discover it
in a demo.

**For:**
- It is the most commercially obvious number in the product. An owner deciding who to give the
  Saturday 9am slot to would pay for it on its own.
- It is *already computable by hand* from data the gym owns, so the question is whether Jungle
  presents it, not whether it exists.
- Coach quality genuinely varies and a studio that cannot see it is running blind on its largest
  controllable cost.

**Against, and this is why I stopped:**
- `GTM-SINGAPORE` §2 prices per LOCATION precisely so coaches are not taxed, because **coaches are
  the adoption engine**. The product's whole route to market is a coach bringing their own deck in
  and their studio following.
- A screen that ranks coaches is a screen a coach will refuse to feed. The moment a coach believes
  their check-in data is being scored, the cheapest defence is to stop checking people in — and
  attendance is the spine every other number in the product stands on, including the at-risk panel
  and the money figure beside it.
- The number would be **wrong in a way that is invisible**: coaches do not get comparable classes.
  A coach given the 6am weekday slot is measured on people who were always going to come; a coach
  given the Sunday beginner intro is measured on people trying a gym for the first time. Class type
  suffers this too, but far less — a type is a *thing the studio chose to programme*, and the whole
  point of ranking types is that the studio can change them. A coach cannot change their slot.
- It is not reversible in the way a feature normally is. Once an owner has seen a coach ranking,
  un-shipping it does not un-see it.

**My recommendation: no, or not without a shape that fixes the third bullet** — e.g. comparing a
coach only against the SAME class type in the SAME slot, and refusing to report at all below a
population where that comparison holds. That is a much larger build than four lines and it should
not be started until you have said you want it.

**What I need from you:** yes / no / "yes but only in the slot-matched shape". Nothing is blocked
on this — the class-type ranking is shipped and stands alone.


---

## A14 · A yes/no: does Jungle bend a gym's accent to make it legible?

**Nothing is blocked on this.** The product now MEASURES and REPORTS both cases below; the
question is only whether it should also fix them, which it cannot do without changing a colour the
gym chose.

Session 29 widened Brand Studio's accessibility audit from five token pairs to fourteen, sharing
its arithmetic with the sweep CI runs. Three things fell out. One was ours and is fixed: the
generator clamped `muted` against `bg` alone, so on a light identity it cleared 4.5:1 against the
lightest surface in the palette and sat at ~4.0:1 on the two darker ones. It now clamps against
every surface, and no generated identity has an unreadable one.

The other two are not ours to fix, because the only repair is to alter the gym's own accent.

**1 · A dark logo produces an accent that cannot be used as a graphic on its own background.**
WCAG 1.4.11 wants 3:1 for a non-text mark. Measured on the generator's own output:

| logo | generated accent on its background |
|---|---|
| navy `#12224A` | **1.25:1** |
| crimson `#B5122C` | **2.86:1** |
| blue `#1D4ED8` | **2.90:1** |

**2 · On a LIGHT identity, a mid-luminance accent has no readable label.** `inkOn` picks whichever
of background/text contrasts more against the fill — the right question, and it cannot invert — but
"more" is not "enough". Violet `#A855F7` gives 3.70:1 against one candidate and 4.13:1 against the
other, so the button label fails AA whichever wins. The blue "Steel" derivation lands at 3.91:1.

**Why I did not just fix them.** `colors.js` already carries the rule, for `--danger`: a colour the
gym chose is not ours to change, because a gym whose accent is red must not get a delete button
that matches its primary action. Nudging a studio's brand accent until it clears 3:1 is the same
move — it makes the app compliant by making it not their brand. And it would be invisible: they
upload a logo, and the colour that comes back is not the one they gave us.

**What the product does today.** Both are reported, in the coach's own words, on the panel where
the palette is chosen. The generated-identity badge used to read "✓ Passes WCAG AA" over the
1.25:1 case — it was reading `contrast.passesAA`, which is `textOnBg >= 4.5` and nothing else. It
now reads the full audit and names the failing pairs.

**What I need from you, pick one:**

- **(a) Leave it.** Report and let the studio decide. Cheapest, and defensible: it is their brand.
- **(b) Offer a nudged accent as a SUGGESTION** the coach can take or decline — the shape §2.1's
  re-read offer uses, and the one I would pick. It never rewrites, and it gives a studio with a
  navy mark a way out that does not involve them knowing what 3:1 means.
- **(c) Clamp it silently.** I would not: it is the invisible-change failure mode this product has
  a standing rule against.

---

## A15 · Run migration 0010 — or coach cover stays on one phone

**This is the one item on this list that a shipped feature is already waiting on.**

> ### 🔴 Session 33: the file changed, and you have not run it, so nothing is broken
>
> `0010_coach_cover.sql` now also creates **`coach_absences`** and adds two columns to
> `cover_requests` (`class_date`, `absence_id`), because cover is now recorded as *"I am away
> these dates"* rather than *"please cover this class"*. **You have never run this file, so
> there is nothing to undo — just use the current version.**
>
> ⚠️ **If you DID run an earlier copy of it at some point**, re-run the current file anyway.
> `create table if not exists` does not add a column to a table that already exists, so an
> earlier run would leave `cover_requests` without `class_date` and every cover push would then
> fail. The file now ends with `alter table … add column if not exists` for exactly that case;
> it is a no-op on a fresh database and the fix on a stale one. Re-running is safe either way.
>
> ⚠️ **Corrected, session 32 (2026-08-25).** This item used to be a 10-minute migration with a
> note at the bottom saying the settle still needed wiring. That undersold it badly: the client
> did not write to these tables **at all** — `coach_roster` and `cover_requests` appeared in
> zero save calls and zero load calls anywhere in the app, so running this migration would have
> created two empty tables that nothing ever touched, and the roster would have stayed on one
> phone with the ✅ next to it. **That half is now built** (session 32). Running this migration
> now genuinely does what the line above says it does, and the 10 minutes is the whole job.

Session 30 built the coach roster, availability, and cover requests: a coach says which days
and slots they can work, and when a class needs covering the app offers the coaches who are
free and records who agreed to take it.

🔴 **Every other feature in Jungle is one gym, one device, one person.** A coach builds a class
and the same coach runs it, so the browser's own storage can be the source of truth and the
server catches up whenever. **A cover request is two people on two phones.** Coach A asks,
coach B answers, and neither phone can see the other's storage. There is no offline version of
that — it is the first thing Jungle does that only works if the server does.

**Right now the server has no table for it.** So on the build your gym runs today, a cover
request is saved on the phone that raised it and **nobody else will ever see it.** The app says
exactly that on screen rather than showing a hopeful "Sent" — but it is a real limit, not a
cosmetic one.

### Steps
1. Go to <https://supabase.com/dashboard>, open your project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste the whole of `supabase/migrations/0010_coach_cover.sql` → **Run**.
   Safe to re-run: every statement is `if not exists` or `drop policy … / create policy`.
4. If you have done **A4** (the restore drill), run it on **staging** first, then prod the
   same day.

### What "it worked" looks like
**Table Editor** shows three new tables — `coach_roster`, `cover_requests` and
`coach_absences` — all empty.

Then, on your own phone or laptop, open **Schedule**. The notice at the top of the Coach roster
panel changes. Before you run this it says the roster is *"stored on this device only — your
Jungle server is connected but has no coach storage set up"*; afterwards it says cover requests
*"reach a coach when they next open Jungle"*. **That sentence is the real test**, not the empty
tables — it is the app telling you it can see the storage. Add a coach on one device and open
Jungle on another; they should both show the same roster.

### What the feature actually does now (session 33)
A coach records **"I'm away, Monday to Friday"** once. Jungle works out every class of theirs
in those days and puts each one on a **board** that every coach sees. The first coach to claim
one takes it, and **the claim covers that day only** — the recurring class goes back to its
usual coach the following week, and nothing is written to your schedule.

⚠️ **Two things this still does not do**, both unchanged and both worth knowing before you tell
a coach about it:
- **Nobody's phone rings.** A coach sees the board when they next open Jungle. Fine for "can
  somebody take next Thursday", no use at all for "I am ill and my class is in an hour". Adding
  email is a sender (Resend or Postmark, roughly S$0–30/month at your size), a domain to send
  from, and about a day. **Not built, and I have not assumed you want it.**
- **A coach only sees their own availability once their account is linked** to their roster
  entry — you do that from this panel, per coach. Until then they see a note saying so rather
  than the whole roster.

### ⚠️ Two things that are still true afterwards, so you are not surprised
- **0005 and 0006 are still unapplied.** Personas, plans and the movement catalogue remain on
  one device with no server copy. 0010 does not change that. (⚠️ And when you do run 0005/0006,
  note that the coach-delete dialog currently *tells* the coach their personas are device-only;
  that sentence becomes untrue and needs changing in the same session.)
- **Nobody's phone will ring.** Jungle has no push notifications, no email sending and no SMS —
  there is no such code anywhere in the product. After 0010, a cover request reaches the other
  coach **when they next open Jungle**, which is fine for "can you take Thursday" and no use at
  all for "I am ill, my class is in an hour". If the urgent case matters to you, say so and it
  becomes a real piece of work: a sender (Resend or Postmark for email, roughly S$0–30/month at
  your size), a domain to send from, and about a day. **It is not built and I have not assumed
  you want it.**

### ⚠️ One thing to watch the first time it runs (session 32)
Two coaches both pressing **Approve** on the same 5am request is the normal case, not an edge
case, and it is decided by a **conditional** update — `set status='approved' where id=$1 and
status='open'` — so that one of them wins and the other is told who got it. That is wired now
(`src/lib/compareAndSet.js`, used by `settleCoverRequest`), and it is tested hard.

🔴 **But it has still never made a real request against a real Postgres, because there is no
table to make it against yet — this migration is that table.** Everything asserted about it is
asserted against a fake that models what PostgREST is documented to do. So the first time two
people race a real request, that is genuinely the first run. If a settle ever behaves oddly —
both sides shown a success, or a success reported as a loss — the two assumptions to check are
written at the top of `compareAndSet.js`. **Nothing for you to do here**; it is a note about
where the one remaining unknown lives.

### Undo
`drop table public.cover_requests; drop table public.coach_roster;` — nothing else references
them, and the app keeps working exactly as it does today.

---

## A16 · A decision, and four facts I cannot look up: Mindbody

**Nothing is blocked on this, and nothing has been built against it.** The ask was that an
approved cover push through to Mindbody, which propagates to ClassPass. Session 30 built the
**seam** — one adapter with a pinned payload, and one implementation that does nothing and says
so. There is no Mindbody code, no endpoint, no key, and no "coming soon" panel.

> ### 🔴 Session 32: you have answered the decision, and it does not unblock the build
>
> You said you want Mindbody updated when a cover is approved. **That answers the decision
> below — the "no CRM" question — and it is recorded as a yes.** It does not answer questions
> 1–4, and question 3 is the one that could make this feature *actively harmful* rather than
> merely absent: **if the only way to change a class's instructor is cancel-and-recreate, then
> approving a cover would delete your members' existing bookings for that class.** Losing real
> bookings is worse than never integrating. So nothing calls Mindbody, and nothing will until
> question 3 has an answer.
>
> **What session 32 did build, because it needs none of those answers:** every approved cover
> now leaves a durable record of the exact payload a booking system would have been handed,
> with an idempotency key so the same substitution can never be posted twice. It exercises the
> payload shape against real approvals instead of only against a test, and the day an adapter
> exists there is a queue rather than a standing start. **It is not a queue that will drain on
> its own and there is deliberately no screen showing it as pending** — that would promise a
> send that may never happen. Nothing about it claims anything reached Mindbody.
>
> **Question 3 is free to answer** and it is the whole decision:
> <https://developers.mindbodyonline.com> — is there an endpoint that substitutes a class's
> instructor, or is cancel-and-recreate the only route?

### Why it stopped there
- The architecture spec's risk **A6** records that Mindbody's API is a **paid, gated partner
  program**, and its §347 lists partner-program costs among the facts to re-verify at the point
  of commitment. Nobody has verified them. There is no account and no sandbox.
- **"Mindbody pushes it to ClassPass" is an assumption.** They do integrate. Whether an
  *instructor substitution* propagates, how fast, and whether ClassPass tells members who
  already booked are three separate questions, and this repo answers none of them. A studio
  that tells its members "your coach changed" on Jungle's authority and is wrong has a worse
  problem than one that never claimed it.

### 🔴 First, the decision — this one is yours and it is not technical
Your own decision doc holds the **"no CRM" line for the first 1–2 years**: *"the moment we bolt
on scheduling/payments early, we become a worse Mindbody and lose the wedge."*

My reading is that coach availability and finding cover sit **inside** that line — they are
staff operations, nothing books a member and nothing takes a payment — but that **writing back
to Mindbody is the part that genuinely crosses it.** It makes Jungle a thing that edits the
booking system, which is the direction the line was drawn against.

**So: do you want Jungle writing to a gym's booking system at all?** If the answer is no, the
seam stays a seam, nothing is wasted, and the four questions below do not matter.

### If the answer is yes, these are the four facts
1. **Partner-program status and cost.** Apply at <https://developers.mindbodyonline.com>. What
   tier, what monthly cost, what per-call cost, and how long approval takes.
2. **Which API.** Public API v6 or the newer Platform API — they are different products with
   different access rules. Which one is a substitution available on?
3. **What a staff substitution actually is.** Is there an endpoint that changes a class's
   instructor, or does it require cancel-and-recreate? Cancel-and-recreate would drop existing
   bookings, which would make this feature actively harmful.
4. **Sandbox.** Is there a free test site, and does it accept substitution calls?

**Do not sign anything before question 3 has an answer.** If the only way to change an
instructor is to cancel the class, the honest product decision is not to integrate.
