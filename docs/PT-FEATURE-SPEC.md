# PT-FEATURE-SPEC — 1:1 personal training, and the client-facing app

_Ideation → requirements. Written 2026-08-31 against `30520f2`. **Nothing here is built.**_

> **How to read this.** §1–§4 are decisions and the one blocking prerequisite; read those even if
> you read nothing else. §5–§9 are the buildable spec. §10–§14 are platform, testing, infra and
> sequencing. §15 is what stays out, and §16 is what needs Dylan rather than code.
>
> Every claim about the *existing* code in this document was checked against the tree at
> `30520f2`, not against prose. Where a repo document says something this contradicts, that is
> called out explicitly — see §1.1.

---

## 1. What this is, and what it reverses

Jungle today is the **class OS**: a coach's own programming, on the studio's screens, building an
attendance record. Every table is gym-scoped, members are roster rows with no accounts, and the
only member-facing surface is a signed, anonymous, class-scoped summary link.

This spec adds the **second lens**: 1:1 personal training, and a client-facing app where the
person being trained can see their own record.

### 1.1 Three repo documents say not to build this. Two of them are now out of date.

Honesty first, because this project's own rule is that stale prose gets more confident with each
rewrite:

| Where | What it says | Status |
|---|---|---|
| `docs/PRODUCT-DIRECTION.md` §4 | **"Premature: PT/1:1 (F1)"** | **Superseded by this decision.** It was written 2026-07-19 when there was no attendance data, no member surface and no named customer. Two of those three have changed. |
| `docs/PRODUCT-DIRECTION.md` §6 | **"No consumer app."** | **Deliberately reversed, narrowly.** See §4.1 — a PT client app is not a consumer app in the sense that non-goal meant (a social feed / a D2C fitness product). It is a per-gym, invite-only view of a record the gym already holds. The distinction has to be defended in the schema, not just asserted here. |
| `docs/PRODUCT-DIRECTION.md` §6 | No booking. No payments. No CRM. | **Still holds.** See §15. The session-credit ledger (§7.9) is deliberately a counter, not a calendar, and processes no money. |
| Spec §2 F1 | "no 1:1 path at all … that is a **new migration and therefore Dylan's call**" | **Still true and still Dylan's call.** This document is the argument for that call, not a substitute for it. |
| Spec §2 F2 Gap 1 | "PAR-Q … must land in the same change that introduces [individualised load], not after" | **Adopted as a hard gate.** See §8.1. |

**This is not a bolt-on.** Design principle **P5 — "one primitive, two lenses"** has been marked ⛔
in the spec's own table since it was written, for exactly one reason: the member half of the
session primitive does not exist. `class_instances` shipped in `0007` and is one side of the XOR
the spec demands (`session_assignment targets a class_instance XOR a member`). This feature is the
other side. Building it does not add a principle to the architecture; it finishes one that has
been sitting half-built and marked as such for six weeks.

### 1.2 Why Jungle can win this, when Trainerize and TrueCoach already exist

The incumbent PT tools (Trainerize, TrueCoach, Everfit, Hevy Coach, PT Distinction) are all
**programming-delivery** products built for *online* coaching. They are good at it. They all share
one blindness: **they do not know what happened in the room.** A client's PT record and their
class attendance live in two different systems that never meet.

Jungle already runs the room. So it can do the thing none of them can:

> **One training record per person, whether the session was delivered to twenty people or to one.**

A member who does two PT sessions and three classes a week has one volume history, one adherence
number, one retention curve. The trainer sees the classes. The class coach sees the PT work. The
owner sees one member, not two rows in two products.

Three further assets already in the tree, none of which a competitor can copy quickly:

1. **The persona engine** (`0005`, `persona-ai`, `src/lib/blueprints.js`, `movementTaxonomy.js`)
   already models *how a specific coach programs*, learned from their own history. Pointed at 1:1,
   that is **PT programming generated in the trainer's own voice** — the single most-complained-about
   part of every competitor ("the AI writes programs that aren't mine"). This is mostly reuse.
2. **The movement taxonomy** gives structural discipline — "no ergs in a strength block" enforced
   by rules rather than by asking a model nicely. Applied to 1:1 it becomes "no barbell snatch in a
   week 1 beginner block", structurally.
3. **The white-label brand system** (F6). The client app wears the *studio's* brand, not Jungle's.
   Every competitor's client app is branded as the competitor. For a boutique studio that is the
   difference between a tool and their own product.

**The one-sentence pitch:** *Your trainers' programming, in their own style, on your brand, in your
clients' pockets — and it's the same record as the classes they take.*

---

## 2. The four decisions taken (2026-08-31)

Asked and answered before any design was written, because each one changes the architecture rather
than the feature list.

| # | Decision | Chosen | What it rules out |
|---|---|---|---|
| **D1** | Who is the PT tier sold to? | **Studio-employed PTs first.** PT lives inside the existing gym tenant. | Trainer-as-tenant. Solo self-serve (N12) stays a later tenancy change. No new tenancy shape in v1. |
| **D2** | How native is the client app? | **PWA now, Capacitor wrap next.** Third entry point in this repo, own bundle, own budget line. | Native-from-day-one. Accepts the iOS push gap in v1 — see §10.3, and say so out loud rather than shipping a notification toggle that silently does nothing. |
| **D3** | How deep does nutrition go? | **Coach-authored guidance + habit/photo logging.** No food database. | Calorie/macro arithmetic Jungle has to be right about. Schema stays macro-shaped so a food DB is additive later (§7.7). |
| **D4** | How far into commerce? | **Session-credit ledger, no payment processing.** | Card handling, PCI, merchant accounts, a payment sub-processor in every gym's DPA, refunds, disputes, tax. |

---

## 3. 🔴 The blocking prerequisite: the RLS model does not survive a member account

**This is the most important finding in this document, it is verified against the code, and it must
land BEFORE the first client account exists.**

Every RLS read policy in `0001`, `0003`, `0007`, `0008` and `0009` is written as some variant of:

```sql
using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
```

And `user_gym_ids()` (`0001:104`) is:

```sql
select gym_id from public.memberships where user_id = auth.uid() and status = 'active';
```

**No role filter.** Meanwhile `membership_role` (`0001:13`) already includes `'member'`, and
`ROLE_DEFAULTS.member` already exists in `src/supabase.js` with `progress:view-own`.

So the moment a PT client is given a `memberships` row with role `member` — which is the obvious,
cheap, "reuse what's there" implementation, and the one the RBAC scaffolding is visibly inviting —
that client can `select` **every row of every gym-scoped table**:

- `members` — the entire roster. Names and email addresses of every member of the gym.
- `attendance` — every check-in by every member, ever.
- `consent_records` — every member's consent history.
- `coach_personas` / `persona_plans` / `persona_movements` — the gym's entire programming IP, which
  `docs/GTM-SINGAPORE.md` §3 promises in writing belongs to the coach.
- `class_instances`, `class_schedule_rules`, `session_history`, `brand_profiles`, `library_overrides`.

`members_insert` and `class_instances_rw` mean they can **write**, too.

This is not a bug today, because no member-role user has ever existed. It is a landmine placed
directly under the feature this document specifies, and it is exactly the category this repo calls
worst: **invisible wrongness.** RLS failures look identical to normal operation from inside the app.

### 3.1 The fix, as its own migration, before anything else

`0010_staff_read_boundary.sql`, shipped and self-tested **on its own**, with no PT feature in it:

```sql
-- Staff = anyone whose membership grants operational access. Deliberately the
-- EXCLUDED set is not used here: a role added later must default to NOT staff,
-- because a new role silently gaining read on the whole roster is the failure
-- this function exists to prevent.
create or replace function public.is_gym_staff(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and gym_id = p_gym
      and status = 'active'
      and role in ('admin','manager','coach','frontdesk')
  );
$$;

-- …and a staff-only variant of the set form, so the rewrite is mechanical.
create or replace function public.staff_gym_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select gym_id from public.memberships
  where user_id = auth.uid() and status = 'active'
    and role in ('admin','manager','coach','frontdesk');
$$;
```

Then **every existing policy's `gym_id in (select public.user_gym_ids())` becomes
`gym_id in (select public.staff_gym_ids())`**, and `user_gym_ids()` is either deleted or kept only
where "any membership including member" is genuinely what is meant (nowhere, currently).

**Verification is not optional and not by inspection.** `supabase/tests/0010_rls_selftest.sql`,
following the proven shape of `0007_rls_selftest.sql` (transaction, assertions, rollback), must
prove — with a positive control in the same run, per this repo's sweep rule — that:

1. A `member`-role user reads **zero** rows from `members` other than their own linked row.
2. A `member`-role user reads **zero** rows from `attendance` other than their own.
3. A `member`-role user reads **zero** rows from `coach_personas`, `persona_plans`, `consent_records`.
4. A `member`-role user's `insert` into `members` and `class_instances` is **rejected**.
5. A `coach`-role user in the same gym still reads everything they read before (**the positive
   control** — without it, a test suite that accidentally created no rows passes identically).

> ⚠️ **A test that finds nothing and a test that matched nothing are indistinguishable from the
> assertion's side.** `0007_rls_selftest.sql` is 11/11 green and is the pattern to copy, including
> its habit of asserting the *permitted* case alongside the denied one.

### 3.2 Sequencing consequence

`0005` and `0006` **have still never been applied** (`CLAUDE.md`, and `DYLAN-QUEUE.md`). PT needs
`0010`–`0013`. That is now a queue of six unapplied migrations, and `0010` is a security fix to
policies that are already live in production for gyms `0003`/`0007`/`0008`/`0009` did reach.

**Recommendation: apply `0005`, `0006` and `0010` in one sitting, before any PT code is written.**
`0010` is independently valuable — it is a correct hardening of the current product whether or not
PT is ever built — and it is much cheaper to apply now than to retrofit under a live client app.

---

## 4. Identity: how a roster row becomes an account, without every member becoming one

### 4.1 The narrow reversal

`0007`'s comment on `members` is emphatic and it is right:

> *"Gym members as ROSTER ROWS, not auth users. This is the design decision that makes attendance
> capture work on day one: recording a check-in requires zero member adoption, no signup, no
> password, no app install."*

and `src/lib/classToken.js`:

> *"There are no member accounts and there will not be any."*

**All of that stays true for members.** A PT *client* is different in kind: they have an ongoing,
individual, consented relationship with a named trainer, and a record about their own body that
they have a legal interest in seeing. A class attendee does not.

So the reversal is exactly one sentence wide:

> **A member row MAY be linked to an auth user, on invitation, and only then.**
> Attendance capture still requires zero member adoption. The class summary link stays
> class-scoped and anonymous. Nothing about the group product changes.

### 4.2 `member_identities` — the link table

```sql
create table if not exists public.member_identities (
  member_id   uuid primary key references public.members(id) on delete cascade,
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  invited_by  uuid references public.profiles(id) on delete set null,
  invited_at  timestamptz not null default now(),
  linked_at   timestamptz,                -- null until the invite is accepted
  revoked_at  timestamptz,                -- app access withdrawn; the member row survives
  unique (gym_id, user_id)
);
```

Four things this shape buys, each of which was a mistake avoided rather than a feature added:

- **`member_id` is the PK, not a serial.** One member, at most one account. A second invite updates
  the row rather than creating an ambiguity about which account owns the record.
- **`user_id` is `unique` globally**, so one person cannot silently hold two client identities.
  (D1 means one gym per client in v1; the constraint is what makes the multi-gym case in N12 a
  *decision* rather than a surprise.)
- **`revoked_at`, not a delete.** Withdrawing app access must not touch the training record. The
  gym still holds the data; the person can no longer sign in to see it.
- **`linked_at` null = invited but not accepted**, which the trainer's UI needs to show honestly
  ("invited 6 days ago, not opened") rather than implying the client is looking at their program.

### 4.3 The RLS helper the whole client app rests on

```sql
create or replace function public.own_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select member_id from public.member_identities
  where user_id = auth.uid() and linked_at is not null and revoked_at is null;
$$;
```

Every client-app read policy is `member_id in (select public.own_member_ids())`. Every trainer read
policy is `gym_id in (select public.staff_gym_ids())`. **Two predicates, no third.** A policy that
needs a third predicate is a policy that has not been thought through.

### 4.4 Sign-in

Supabase magic link / Google, same as `AuthGate` — but a **separate gate** (`ClientAuthGate`), because
today's `AuthGate` shows *"Sign in to your studio"* and a "Not authorized" wall to anyone without a
staff membership. A client hitting that wall is the same failure mode `main.jsx` already documents
for the summary link. The client entry point resolves before `AuthGate` renders, exactly as
`summaryToken` does.

**No passwords.** No password reset flow to build, no credential-stuffing surface, no hashing
decisions. The invite email is the enrolment; the magic link is the login.

---

## 5. Data model — the F1 completion

Four migrations, each independently applicable and independently useful.

### `0011_session_primitive.sql` — the XOR the spec has been asking for

```sql
-- ONE session. Group or 1:1. This is P5 in schema.
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  -- THE XOR. Exactly one of these is set, and the constraint is the whole point.
  class_instance_id uuid references public.class_instances(id) on delete cascade,
  member_id         uuid references public.members(id) on delete cascade,
  trainer_id        uuid references public.profiles(id) on delete set null,
  persona_id        uuid references public.coach_personas(id) on delete set null,
  program_id        uuid references public.programs(id) on delete set null,
  starts_at         timestamptz not null,
  duration_min      int,
  status            text not null default 'planned'
                      check (status in ('planned','delivered','cancelled','no_show')),
  notes             text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sessions_target_xor check (
    (class_instance_id is not null and member_id is null) or
    (class_instance_id is null     and member_id is not null)
  )
);
```

> **`status` is a CHECK-constrained column and this repo has lost live data to exactly that
> three times** (`persona_plans.source`, and the two the comments in `store.js` record). Pin
> `SESSION_STATUSES` in **one** exported constant in `src/lib/store.js`, assert it against this
> migration in `dbConstraints.test.js`, and never spell a status inline. Same for every CHECK
> below. This is not a style note; it is the single most repeated defect in the repo's history.

### `0012_pt_prescription_and_log.sql` — what was programmed, and what was done

```sql
-- A multi-week plan assigned to one member. `plan` mirrors persona_plans.plan's
-- proven jsonb shape so the persona generator's output drops straight in.
create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  persona_id    uuid references public.coach_personas(id) on delete set null,
  title         text not null,
  goal          text,
  weeks         int,
  starts_on     date,
  status        text not null default 'draft'
                  check (status in ('draft','active','completed','archived')),
  plan          jsonb not null default '{}'::jsonb,
  version       int not null default 1,
  supersedes_id uuid references public.programs(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- What was PRESCRIBED for one session. Snapshotted at publish (see note below).
create table if not exists public.prescriptions (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  ord          int  not null,
  block_label  text,
  movement     text not null,
  category     text,                       -- movementTaxonomy.js CATEGORIES
  sets         int,
  reps         text,                       -- "8-10", "AMRAP", "30s" — text on purpose
  load_kg      numeric(6,2),
  load_pct_1rm numeric(5,2),
  rir          numeric(3,1),
  tempo        text,
  rest_sec     int,
  notes        text,
  created_at   timestamptz not null default now()
);

-- 🔴 THE PT DATA SPINE. What was actually performed.
-- Corrections are SUPERSEDES, never UPDATE — see §5.1.
create table if not exists public.set_logs (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  movement      text not null,
  set_index     int  not null,
  reps          int,
  load_kg       numeric(6,2),
  rpe           numeric(3,1),
  rir           numeric(3,1),
  duration_sec  int,
  distance_m    numeric(8,2),
  logged_by     uuid references public.profiles(id) on delete set null,
  source        text not null default 'trainer'
                  check (source in ('trainer','client','import')),
  performed_at  timestamptz not null default now(),
  supersedes_id uuid references public.set_logs(id) on delete set null,
  voided        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_set_logs_member_time on public.set_logs(member_id, performed_at desc);
create index if not exists idx_set_logs_member_movement on public.set_logs(member_id, movement, performed_at desc);
```

### 5.1 Why `set_logs` is append-only-with-supersedes, and not immutable like `attendance`

`attendance` has **no update and no delete policy at all**, deliberately, because retention claims
are priced against it and *"a retention claim computed from a table someone can quietly edit is not
evidence."*

Set logs cannot be that. A trainer will type `100` for `10` mid-session, and a training record that
says a beginner deadlifted 100 kg is worse than one that can be corrected. But a plain `UPDATE`
throws away the fact that a correction happened — and progressive-overload suggestions computed
from silently-edited history have the same evidential problem as attendance.

**So: corrections insert a new row with `supersedes_id` pointing at the old one, and set
`voided = true` on the superseded row via the same insert path.** Current truth is the head of each
chain. The full history survives. This is the same shape `consent_records` already uses — events,
not mutable state — and for the same reason.

> The one genuine `update` policy is therefore on `voided` alone, restricted to the row's own gym
> staff, and `0012`'s self-test must prove no other column can be changed.

### `0013_pt_wellbeing.sql` — screening, measurement, habits, nutrition

```sql
-- 🔴 THE HARD GATE. Health data. See §8.1.
create table if not exists public.parq_responses (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  form_version    text not null,
  answers         jsonb not null,
  flagged         boolean not null,          -- any 'yes' on the risk questions
  clearance_ref   text,                      -- medical clearance note reference, if flagged
  cleared_by      uuid references public.profiles(id) on delete set null,
  cleared_at      timestamptz,
  completed_at    timestamptz not null default now(),
  expires_at      timestamptz not null,      -- completed_at + 12 months
  created_at      timestamptz not null default now()
);

create table if not exists public.measurements (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  kind         text not null
                 check (kind in ('bodyweight_kg','height_cm','waist_cm','hip_cm','chest_cm',
                                 'thigh_cm','arm_cm','resting_hr','photo')),
  value        numeric(8,2),
  photo_path   text,                         -- Storage object path; never a public URL
  taken_on     date not null,
  source       text not null default 'trainer' check (source in ('trainer','client','device')),
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  label       text not null,                 -- "10k steps", "Protein at every meal", "Lights out by 11"
  cadence     text not null default 'daily' check (cadence in ('daily','weekly')),
  target      numeric(8,2),
  unit        text,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  logged_on  date not null,
  value      numeric(8,2),
  done       boolean,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_on)               -- idempotent; a double-tap is harmless
);

-- Coach-authored guidance. D3: NO food database, NO calorie arithmetic.
-- Macro columns exist and are nullable so a food DB is additive later (§7.7).
create table if not exists public.nutrition_plans (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  title         text not null,
  guidance      jsonb not null default '{}'::jsonb,   -- meals, swaps, notes, shopping list
  kcal_target   int,                                  -- optional, coach-set, never computed by us
  protein_g     int,
  carb_g        int,
  fat_g         int,
  status        text not null default 'draft' check (status in ('draft','active','archived')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  logged_at   timestamptz not null default now(),
  meal        text check (meal in ('breakfast','lunch','dinner','snack')),
  note        text,
  photo_path  text,
  created_at  timestamptz not null default now()
);

-- Append-only counter. NOT a calendar, NOT a payment record. See §7.9.
create table if not exists public.session_credits (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  delta        int not null check (delta <> 0),   -- +10 sold, -1 delivered, +1 corrected
  reason       text not null
                 check (reason in ('package_added','session_delivered','adjustment','expiry')),
  session_id   uuid references public.sessions(id) on delete set null,
  package_ref  text,                              -- the gym's own reference. No money in this table.
  note         text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  occurred_at  timestamptz not null default now()
);
```

### 5.2 Where the client-app write boundary sits

**Clients may insert into exactly four tables**, and nothing else, ever:
`habit_logs`, `nutrition_logs`, `measurements` (with `source='client'`), and `set_logs` (with
`source='client'`, and only for a session whose `member_id` is theirs).

Everything else — programs, prescriptions, credits, PAR-Q clearance — is staff-write. That
asymmetry is the client app's entire threat model, and it should be legible in one paragraph of
policy, which is why the two-predicate rule in §4.3 matters.

---

## 6. The three surfaces

### 6.1 Trainer surface — inside StaffApp, lazily loaded

A new `clients` view, gated by `isViewEnabled` (§`src/config/flags.js` — **the single choke-point**;
there are four nav arrays in `App.jsx` and a rule bolted onto one of them is how a screen survives
in exactly one menu).

- **Clients list** — name, program, next session, credits left, adherence, last logged. Sorted by
  who needs attention, not alphabetically.
- **Client detail** — program, history, PBs, measurements, habits, notes, credits, messages.
- **Program builder** — reuses the Builder's mental model and the persona generator. A trainer
  picks a blueprint (mesocycle shape), the generator drafts in their own style from
  `persona_movements`, and **every generated program lands as a draft**. The coach-approval gate
  from F2 holds by construction and must not be weakened for PT.

⚠️ **StaffApp is at 349.46 / 360 kB — 10.5 kB of headroom, and it is the binding constraint on
anything new.** The trainer surface goes in `src/screens/pt/`, behind `React.lazy()`, **with its own
budget line in `scripts/check-size.mjs`.** An unlisted chunk has no ceiling at all.

### 6.2 Floor surface — the trainer's phone, mid-session

This is where PT products live or die and where most of them are bad.

**The design law, mirroring P6 (`capture costs <5s`): logging one set costs under 3 seconds, one
thumb, no scroll, no keyboard where a stepper will do.** Prescribed load and reps are pre-filled
from the prescription; the common case is one tap on a big "done" target. Deviations are two taps.

Non-negotiables, all of them inherited from existing rules in this repo:

- **Works fully offline.** A PT session in a basement has no signal. This is `store.js`'s home turf
  — the same localStorage-first seam, the same background push, the same sync-error ledger and
  tombstones. Do not invent a second sync mechanism.
- **Screen stays awake** (`navigator.wakeLock`), because a phone that sleeps between sets is a
  phone the trainer stops using.
- **Rest timer** with a haptic/audible cue, running in the page, surviving a lock.
- **Last time** shown against every movement — "last: 4×8 @ 60kg, RIR 2". This one line is the
  single highest-value element on the screen and the reason trainers stop using paper.
- **No dialogs.** Playwright auto-dismisses them and, more importantly, a trainer with chalk on
  their hands should not be reading a modal.

### 6.3 Client app — a new entry point

A third branch in `src/main.jsx`, resolved at module scope alongside `summaryToken`, lazy-loaded so
neither audience pays for the other:

```
index.js         shared boot + colours + router branch
├── ClassSummary  (existing, anonymous, token-scoped)
├── StaffApp      (existing, staff auth)
└── ClientApp     (new — client auth, own bundle, own budget line)
```

Screens, in priority order — the first three are the product, the rest are why they keep it:

1. **Today** — what to do, or what you did. If there's a session today, the program. If not, the
   habits and the next session's date.
2. **Program** — the current block, week by week, with the trainer's notes.
3. **History** — every session, every set, PBs. The record they came for.
4. **Progress** — measurements, charts, and §9's honesty rules applied hard.
5. **Nutrition** — the trainer's guidance, and the photo/habit log.
6. **Messages** — trainer thread. Scoped, PDPA-aware, and see §16 Q4.
7. **Profile** — PAR-Q status, consents (each individually withdrawable), data export, delete.

**The client app wears the gym's brand** (F6), which is the first real test of the white-label
thesis on a surface that matters. `readBrandTokens()` in `summaryApi.js` already reads live CSS
custom properties rather than resolving a preset — reuse it, and do not resolve a preset by id, or
every studio with a custom palette silently gets the default.

---

## 7. Feature specification — PT1…PT12

Ranked. **PT1–PT6 are v1**; PT7–PT9 are the second release; PT10–PT12 are the ones that get talked
about in a sales meeting and should not be built until the first six are used daily by a real
trainer.

| # | Feature | Ships | Notes |
|---|---|---|---|
| **PT1** | **Client roster + invite** | v1 | `member_identities`, magic-link invite, revoke. The "invited, not opened" state must be visible. |
| **PT2** | **PAR-Q screening gate** | v1 | §8.1. Blocks PT3 structurally. Not a warning — a gate. |
| **PT3** | **Program authoring + assignment** | v1 | Blueprint → persona draft → trainer edits → publish. Draft-by-default. |
| **PT4** | **Session delivery + set logging** | v1 | §6.2. Offline-first. The spine. |
| **PT5** | **Client app: Today / Program / History** | v1 | The three screens that justify an install. |
| **PT6** | **Session-credit ledger** | v1 | §7.9. A counter, not a calendar. |
| **PT7** | Habits + measurements + photos | v2 | Consent-gated, see §8.3. |
| **PT8** | Nutrition guidance + photo log | v2 | D3. No food DB. |
| **PT9** | Progress analytics (e1RM, volume, PBs, adherence) | v2 | §9. Deterministic. Honesty-gated. |
| **PT10** | Trainer↔client messaging | v3 | PDPA + DNC implications, §16 Q4. |
| **PT11** | Auto-progression suggestions | v3 | Rule-based. §7.11. |
| **PT12** | Wearable/health import (HealthKit, Google Fit) | v3 | Needs the Capacitor wrap (D2) and a consent scope. Gated behind the consent foundation exactly as N7–N11 already are. |

### 7.9 The session-credit ledger, and exactly where the no-booking line sits

`session_credits` is append-only; the balance is `sum(delta)`. A package sale is `+10`. Marking a
session delivered writes `-1` in the same transaction as `sessions.status = 'delivered'`. A
mistake is `+1` with `reason='adjustment'` and a note — never a delete.

**This is not booking, and the distinction has to survive the next three sessions of feature
pressure**, because `0007`'s comment on `class_instances` warns that adding capacity "is the first
step of a pivot, not a feature":

| A ledger does | Booking would |
|---|---|
| The trainer records a session they agreed with the client. | The client requests a slot from published availability. |
| `sessions.starts_at` is a note of when it happened / will happen. | There is a calendar with capacity, conflicts and a waitlist. |
| The count goes down when work is delivered. | Money changes hands, or a slot is held. |

**The tell that the line has been crossed: the client app grows a "book" button.** If that is ever
wanted, it is a product decision with a schema consequence, taken deliberately, and it should be
argued in a document like this one rather than added in a sprint.

### 7.11 Auto-progression must be arithmetic, not a model

`src/lib/retention.js` states the rule this repo already lives by: *"at-risk v1 is SQL, not LLM …
an operator has to trust the rule enough to phone a member about it, and a lawyer has to be able to
read it."*

A trainer has to trust a suggestion enough to **put that weight on a bar with a human under it.**
The bar is higher, not lower. So progression suggestions are:

- Deterministic (double-progression, RIR-based autoregulation, percentage-of-e1RM), in
  `src/lib/progression.js`, pure functions, no I/O, unit-tested with mutation checks.
- Always shown **with the numbers that produced them** — "last three sessions at RIR 2–3, +2.5 kg"
  — never as a bare assertion.
- **A suggestion, never an assignment.** The trainer approves, exactly as they approve a generated
  class. The LLM may later phrase a suggestion in prose. It does not decide load.

---

## 8. Compliance — the parts that are not optional

Jungle is a **data intermediary**; the gym is the organisation holding PDPA obligations
(`docs/LEGAL-AND-SECURITY.md` §1). PT does not change that, but it dramatically changes **what**
is being processed.

### 8.1 PAR-Q is a structural gate, not a form

Spec §2 F2 Gap 1: *"a hard gate before any individualized load prescription … it must land in the
same change that introduces one, not after."*

**Implementation:**
- `programs.status` cannot move `draft → active` for a member without a `parq_responses` row where
  `expires_at > now()` and (`flagged = false` **or** `cleared_at is not null`).
- Enforced by a **database trigger**, not by UI. A UI-only gate is one refactor away from being
  absent, and this is the one that carries physical risk to a person.
- The trainer sees why, in plain words, with the action ("Sarah's screening expired on 14 Aug —
  send it again") — never a raw enum, per U1.

### 8.2 PAR-Q answers are health data

They are more sensitive than anything currently in the product. Therefore:
- `parq_responses` RLS is **not** `staff_gym_ids()`. It is the assigned trainer, gym admins, and the
  member themselves. A frontdesk role must not read a member's cardiac history.
- Add consent scope `health_screening` to `consent_records`.
- ⚠️ **`consent_records.scope` is a CHECK-constrained column.** Adding a scope means altering the
  CHECK **and** the client-side constant in the same change. This is the repo's most-repeated
  data-loss bug — three occurrences — and the failure mode is silent: the write fails, the ledger
  records an error, and a server-wins hydrate then deletes the only copy.

### 8.3 Progress photos are the most sensitive thing the product will ever hold

- Private Supabase Storage bucket. **Signed URLs only**, short TTL. Never a public path, never in a
  shareable link, never in the share card.
- Explicit opt-in consent scope (`progress_photos`), separate from every other scope, withdrawable
  in one tap from the client's Profile screen.
- Client-deletable, and deletion means the object is gone, not hidden.
- **Never included in an export a trainer can take with them**, and never in a crash report — which
  is a live constraint, since `docs/LEGAL-AND-SECURITY.md` already notes that adding Sentry is a
  legal decision because crash payloads can carry member names.

### 8.4 Erasure, export, and the departing client

PDPA access and correction obligations become real the moment a person has an account and can see
their own record. The client Profile screen needs a genuine **export** (their sessions, sets,
measurements, habits — as CSV/JSON, reusing `csvExport.js`'s shape) and a **delete** request path.
`members`' existing `on delete cascade` already carries attendance; `set_logs`, `measurements`,
`nutrition_logs` and `habit_logs` must cascade identically, and `0012`/`0013` must be checked for
that rather than assumed.

### 8.5 Messaging (PT10) touches Do Not Call

`docs/LEGAL-AND-SECURITY.md` flags DNC for win-back messaging. In-app messaging between a trainer
and a consenting client is a different thing from marketing outreach — but the moment a message
becomes a push notification or an SMS, the analysis changes. **PT10 is deferred partly for this
reason**, and needs the same review N3/N5 needs.

---

## 9. The honesty rules for every derived number

This repo's stated law: **"A confident wrong number is worse than no number, and a panel promising
a feature that cannot arrive is worse than no panel."** PT analytics is the richest available source
of confident wrong numbers, and every competitor ships them. Not shipping them is a differentiator.

| Number | The lie it wants to tell | The rule |
|---|---|---|
| **e1RM** | "Your 1RM is 142.5 kg" from a set of 12. | Epley/Brzykci degrade badly above ~10 reps. Compute only from sets of ≤10 with RIR ≤3; otherwise show the set, not an estimate. State the formula and the source set. |
| **Volume load** | Summing kg×reps across a barbell squat and a band pull-apart. | Report per movement and per `movementTaxonomy` category. Never one gym-wide "total volume" number. |
| **"You're 12% stronger"** | Trend from three data points. | Minimum-N gate, stated. Below it: "not enough sessions yet to show a trend" — the shape `cohortModel` already uses, which states what is missing instead of drawing a line. |
| **Body-fat %** | Caliper/BIA arithmetic presented as a measurement. | Do not compute it. Record the measurements taken. If a gym wants a number, it is theirs to state, not ours to derive. |
| **Adherence %** | 100% because only two sessions were ever scheduled. | Show `sessions delivered / sessions planned` with both numerals visible. A percentage without its denominator is the same defect `lib/cohorts.js` exists to prevent. |
| **PBs** | A PB every session because the movement name changed spelling. | Resolve through `persona_movements.aliases`. A "Back Squat"/"Backsquat" PB is a bug, not a celebration. |

⚠️ `daysBetween` counts **local calendar days**. Every "days since last session" in the client app
is a date-to-a-human, not a 24-hour period.

---

## 10. Platform and bundle

### 10.1 Entry points and budgets

Per D2: PWA now, Capacitor next. Three entry points, four lazy chunks, each with its own ceiling in
`scripts/check-size.mjs`:

| Chunk | Why it needs a line |
|---|---|
| `ClientApp.js` | New. Carries supabase-js (auth), so the prod-shaped number will be large. **It needs a new `client` entry in `PATHS`, not a share of `staff`** — the two builds' numbers are not comparable, which `check-size.mjs`'s own header explains at length. |
| `PTScreens.js` | The trainer surface. StaffApp has 10.5 kB of headroom; this must not be in it. |
| `progression.js` | If it grows. Pure functions, shared by both. |

**Raise a ceiling only in the commit that needs it, and say what bought the bytes.**

### 10.2 The client app is the PWA's real audience

Spec §10 already says the Capacitor wrap is *"worth doing once there is a member-facing surface
worth installing — shipping a store app whose only users are staff is effort with no audience."*
**PT5 is that surface.** This feature is what makes the store presence make sense, and the order in
§10 was right before there was a reason to act on it.

### 10.3 Say the iOS push gap out loud

Web push works on Android and desktop. On iOS it works **only** when the app is installed to the
Home Screen (16.4+), and even then it is delivered less reliably than a native push.

**So v1 does not ship a notification settings screen.** Reminders are in-app and by email. A toggle
labelled "remind me" that silently does nothing on half the client base is precisely the
"panel promising a feature that cannot arrive" failure. Push arrives with the Capacitor wrap, and
that is the honest sequencing.

---

## 11. Testing — what this feature specifically will get wrong

Everything in `CLAUDE.md` applies. These are the traps this feature walks into by its nature:

1. **🔴 The RLS self-test is the highest-stakes test in the feature.** §3.1. With a positive control.
   RLS failures are invisible from inside the app.
2. **An empty client app passes every scan trivially.** This has already bitten twice in one
   session, in two different files. Every client-app e2e seeds a member, a program, a session and
   three set logs **first**, and asserts they rendered, before measuring anything.
3. **`toHaveCount(0)` is not an assertion that something never happens.** "The client never sees
   another member's data" must be observed — a `MutationObserver` recording every mount, read after
   a navigation — not counted.
4. **Playwright auto-dismisses dialogs.** The revoke-access and delete-account paths must drive
   `page.once("dialog", d => d.accept())` and both branches.
5. **A fixed clock freezes `Date.now()`**, and `newId()` derives from `crypto.randomUUID` — but
   `program.version` chains and `supersedes_id` ordering are time-ordered. Test the supersede chain
   with an explicit ordinal, not a timestamp.
6. **Mutation-check the progression math.** Change `+2.5` to `+5` in `progression.js` and confirm a
   test goes red. If none does, the test is decorative.
7. **Drive the client app and LOOK at it**, at 390px, on a seeded fixture. The repo's own record is
   that reading the rendered screen caught copy defects that 367 passing tests did not.
8. **Assert the STORED object.** A set log that renders "60 kg" and stores `"60"` as text is a bug
   that only a store-level assertion finds.

---

## 12. Infrastructure and scaling

**Volume.** A trainer running six sessions a day at ~25 logged sets is ~150 rows/day. Twenty gyms ×
five trainers ≈ 15,000 rows/day ≈ 5.5M/year. Postgres does not care. Two things do:

- **The client's History screen must paginate from day one.** "Every set I've ever done" is an
  unbounded query on a phone on mobile data.
- **Progress charts need a rollup**, not a full scan. A `member_progress_weekly` materialized view
  (or a nightly aggregate table) keyed on `(member_id, iso_week, movement)`. Build it when a real
  client crosses ~6 months, not before — but shape `set_logs`' indexes for it now, which is what
  `idx_set_logs_member_movement` is for.

**Storage is the real cost, and it is photos.** At ~2 MB/photo, weekly, per client: ~100 MB/client/
year. A hundred PT clients ≈ 10 GB/year, growing and never shrinking. Decisions needed before PT7:
client-side downscale to ~1600px before upload (cuts it by ~4×), and a stated retention period in
the gym's DPA.

**Supabase Pro is already non-optional** — `docs/GTM-SINGAPORE.md` §5 says the free tier dies "the
day real member data exists", and it has no backups. PT client accounts are that day, emphatically.

**Cost impact of PT on unit economics is small and worth stating:** program generation reuses the
existing `persona-ai` path at roughly the same per-call cost (≈US$0.045/generation). Storage and
egress are the new line items, and at S$149/mo per location the margin thesis in GTM §5 survives
intact.

**Two things that must exist before a client account does**, both already on the queue and both now
promoted from "good practice" to blocking by the presence of an end user who is not staff:
daily backups (Pro), and an error boundary + observability decision. The Sentry question is a legal
one (sub-processor in the DPA), and PT makes it more urgent, not less.

---

## 13. Build order

Each phase is independently shippable and independently valuable. Nothing in phase N depends on a
decision deferred to phase N+1.

| Phase | What | Gate to the next |
|---|---|---|
| **0** | Apply `0005`, `0006`. Ship **`0010_staff_read_boundary.sql`** + self-test. | 11/11 green, member-role user proven blind. **No PT code before this.** |
| **1** | `0011` sessions XOR + `member_identities`. Trainer client list, invite, revoke. | A real trainer can invite a real client and the client can sign in and see an empty, correct, branded shell. |
| **2** | PT2 PAR-Q gate (+ trigger, + consent scope). | A program cannot be activated without valid screening. Proven by test, not by clicking. |
| **3** | PT3 program authoring (persona-drafted, trainer-approved) + PT4 set logging, offline-first. | A trainer runs a full week of real sessions on it and does not reach for paper. |
| **4** | PT5 client app: Today / Program / History. | A real client opens it twice in a week unprompted. |
| **5** | PT6 credits. | Trainer stops counting sessions in WhatsApp. |
| **6** | PT7–PT9: habits, measurements, photos, nutrition, progress analytics. | §9's honesty gates hold on real, sparse data. |
| **7** | Capacitor wrap → push, then PT10–PT12. | — |

**The phase-4 gate is the honest one.** Everything before it is measurable by tests; that one is
measurable only by a person choosing to open the app. If they don't, phases 5–7 are building on
sand and the right response is to find out why rather than to add features.

---

## 14. What would make this fail

Written down now, so it is not rediscovered as a surprise:

1. **The trainer keeps using paper.** Logging must be faster than a notebook or it loses. This is
   the P6 lesson: *must be instrumented, not assumed.* Instrument time-to-log-a-set from day one.
2. **The client installs it once and never returns.** The three v1 client screens have to be worth
   opening on their own. "Your program is here" is not a reason; "here is what you lifted last time
   and what you're beating today" is.
3. **The RLS boundary leaks.** §3. One incident here ends the Singapore pilot and probably the
   product. It is also the single most preventable item on this list.
4. **Scope drift into booking and payments.** §7.9. Each individual step will be reasonable.
5. **A confident wrong number in the client's hand.** §9. A client showing their trainer a graph
   that says they got 12% stronger, when they didn't, is worse than a blank screen.

---

## 15. Non-goals — revised, and still binding

Unchanged from `docs/PRODUCT-DIRECTION.md` §6 except where stated:

- **No booking.** No availability, no client-initiated requests, no waitlist, no capacity. (§7.9)
- **No payments.** No card handling, no processor, no invoices. (D4)
- **No CRM.** No pipeline, no lead capture, no marketing automation.
- **No social feed.** No client-to-client anything. Clients cannot see each other exist.
- **No food database, no calorie arithmetic.** (D3)
- **No AI that decides structure or risk.** The model drafts inside human-fixed structure; the
  trainer approves every program and every load. This is now a *safety* property, not only a
  product one.
- ~~**No consumer app.**~~ **Revised (§4.1):** an invite-only, gym-branded, per-client view of a
  record the gym already holds. Not a D2C product, not installable by the public, no discovery, no
  sign-up without an invite.

---

## 16. Open questions — Dylan's, not code's

| # | Question | Why it blocks |
|---|---|---|
| **Q1** | Apply `0005`, `0006`, and `0010`? | Nothing PT-shaped can start before `0010`. `0005`/`0006` have been unapplied since session ~14, which means personas exist on one device with no server copy. |
| **Q2** | Does The Garage have PTs, and will one of them pilot this? | Phase 3's gate is "a real trainer runs a week on it". Without a named trainer this is a spec for a product with no user. |
| **Q3** | Price. Add-on to Studio (say +S$49/mo, or per-trainer), or a new tier? | Changes whether PT is an upsell to the existing pipeline or a separate sale. GTM §2's "per-location, not per-coach — don't tax the adoption engine" argument may or may not transfer to PTs. |
| **Q4** | Messaging (PT10) — in-app only, or does it notify? | The moment it notifies, DNC and PDPA analysis applies. Deferring PT10 defers this, but not forever. |
| **Q5** | Progress photos at all? | The single most sensitive data class in the product, and PT7 is fine without it. Worth an explicit yes rather than a default. |
| **Q6** | Who owns a departing trainer's programs? | GTM §3 already promises a coach can take their persona corpus. A client's *program* is a different object with a client attached to it, and the same promise may not be the right one. Cheap to settle now, poisonous later. |
| **Q7** | Does a PT client's data count toward the gym's PDPA notice as it stands? | Almost certainly needs a revised notice. Health screening and photos are new categories. |

---

_Companion to `docs/PRODUCT-DIRECTION.md` and `Jungle - Functional, Design & Technical Spec (As-Built).md`.
Where this document and those disagree about the future, this one is newer. Where they disagree
about the **present**, check the code — that is the rule this repo already runs on._
