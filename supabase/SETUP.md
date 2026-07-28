# Jungle Backend — Setup (Auth + Multi-Tenant Foundation)

This stands up the backend on **Supabase** (Postgres + Auth + row-level security). Until you finish these steps, the live app keeps working exactly as it does today — the auth gate only turns on once the two keys are present.

**What you do vs. what's already written:** all the code (schema, login flow, permission logic, build wiring) is done. You just create the project, run one SQL file, and paste two keys. ~15 minutes.

---

## 1. Create the project
1. Go to https://supabase.com → sign in → **New project**.
2. Name it (e.g. `jungle`), pick a region near your studios, set a database password (save it).
3. Wait for it to finish provisioning.

## 2. Create the database
1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_auth_foundation.sql` from this repo, copy it in.
3. **Before running:** near the bottom, change `owner@example.com` to **your own email** (this allowlists you as the gym admin so your first login works).
4. Click **Run**. You should see "Success". (It's safe to re-run.)

## 3. Configure Auth (magic-link email)
1. **Authentication → Providers → Email**: make sure **Email** is enabled. (Magic link works out of the box; no SMTP needed for testing — Supabase sends the emails.)
2. **Authentication → URL Configuration → Redirect URLs**: add your site URL:
   `https://killdylz.github.io/Jungle-App/`
   (and `http://localhost:5173/` if you run it locally).

## 4. Get your keys
**Project Settings → API**, copy:
- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **anon public** key (the long one under "Project API keys" — the *anon*, not the service_role)

> The anon key is safe to expose in the browser — row-level security is what protects your data. Never put the **service_role** key in the frontend.

## 5. Add the keys to GitHub (so the build embeds them)
In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add two secrets:
- `VITE_SUPABASE_URL` = your Project URL
- `VITE_SUPABASE_ANON_KEY` = your anon public key

## 6. Deploy
Run your normal deploy:
```powershell
cd "C:\Users\dylan\jungle-app"; powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```
The build reads those secrets, and the auth gate turns on. Reload the site — you'll now get a **Sign in** screen instead of going straight in.

## 7. Test it
1. On the site, enter your email (the one you allowlisted in step 2.3) → **Send magic link**.
2. Open the email, click the link → you're signed in as **admin** of "Jungle Gym".
3. If an un-allowlisted email signs in, they'll see **Not authorized** — that's the allowlist gate working.

---

## Adding your team
Everyone gets in through the **allowlist** (the master gate). For now, add entries via SQL Editor:
```sql
-- one coach:
insert into public.allowlist_entries (gym_id, match, kind, role)
select id, 'coach@yourstudio.com', 'email', 'coach' from public.gyms where slug = 'jungle-gym';

-- or a whole staff domain as coaches:
insert into public.allowlist_entries (gym_id, match, kind, role)
select id, '@yourstudio.com', 'domain', 'coach' from public.gyms where slug = 'jungle-gym';
```
Roles: `admin`, `manager`, `coach`, `frontdesk`, `member`. A signed-in user with no matching entry has **no access** to any gym.

---

## Member links (N4) — two Edge Functions and one secret

The member class summary is the only part of Jungle a person without an account can open.
It needs one secret and two functions. **Full click-by-click steps are `DYLAN-QUEUE.md` A12**;
this is the reference version.

**The secret.** Generate 32 random bytes and set it as an Edge Function secret named
`JUNGLE_SUMMARY_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
It never goes in GitHub and never reaches the browser. Both functions read the *same* value —
one signs, the other verifies, so if they differ every member link fails at once.

**The functions.**

| Function | Source | Verify JWT | Why |
|---|---|---|---|
| `summary-token` | `supabase/functions/summary-token/index.ts` | **ON** | Mints links. Only a signed-in coach may call it. Runs entirely under the caller's JWT, so **RLS is the authorization check** — it never uses the service-role key. |
| `summary-read` | `supabase/functions/summary-read/index.ts` | 🔴 **OFF** | Opened by a member with no account. The signed token is the credential. |

**The migration.** `supabase/migrations/0009_class_summaries.sql` creates the table holding
what a member sees. Without it links still work, but show no movement list — and the app
tells the coach so rather than pretending.

> 🔴 **RLS is never loosened to `anon`.** `summary-read` uses the service-role key *after*
> validating an HMAC signature and expiry, and reads only the one class named in that token.
> It never touches `members`, `attendance`, `consent_records` or `profiles` — pinned by
> `src/lib/classToken.mirror.test.js`. See `LEGAL-AND-SECURITY.md` §4.

> ⚠️ The token core is duplicated into both functions because a function pasted into the
> dashboard cannot import from `src/`. **Never edit a copy by hand** — edit
> `src/lib/classToken.js` and run `node scripts/sync-token-core.mjs`.

## What's next (later phases)
This is the foundation (RBAC-SPEC build order steps 1–2: auth + users/memberships/allowlist + tenant scoping). Still to come, on top of this: moving the library/glossary/templates/sessions from `localStorage` into per-gym tables, the member vs staff shell split, the permission-matrix admin UI, and the LLM proxy (an Edge Function that holds the model key server-side).

## Roll back / turn off
Remove the two GitHub secrets and redeploy — the app reverts to the current no-login behavior instantly. Nothing else changes.
