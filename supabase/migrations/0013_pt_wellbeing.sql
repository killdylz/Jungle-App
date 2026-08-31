-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — 0013 PT WELLBEING (PAR-Q gate, measurements, habits, nutrition, credits)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- 🔴 REQUIRES 0010, 0011, 0012. 0012 MUST NOT REACH A REAL GYM WITHOUT THIS FILE:
-- it is what makes individualised load prescription conditional on screening, and
-- the As-Built spec is explicit that PAR-Q "must land in the same change that
-- introduces [individualised load], not after".
--
-- D3 (nutrition): coach-authored guidance plus habit and photo logging. NO food
-- database, NO calorie arithmetic Jungle has to be right about. The macro columns
-- exist and are nullable so a food database is purely additive later — a schema
-- shape that costs nothing today and saves a migration if the decision changes.
--
-- D4 (commerce): a session-credit LEDGER. No payment processing, no card data, no
-- processor as a sub-processor in every gym's DPA.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regclass('public.programs') is null then
    raise exception '0013 requires 0012 (training spine). Apply 0012 first.';
  end if;
end $$;

-- ── consent scopes: two new ones ─────────────────────────────────────────────
--
-- ⚠️ THIS IS THE REPO'S MOST EXPENSIVE BUG CLASS, ARRIVING THROUGH THE FRONT DOOR.
-- consent_records.scope is CHECK-constrained. Widening a CHECK and shipping a
-- client that writes the new value are TWO changes, and doing them in the wrong
-- order is precisely the failure that cost live data on persona_plans.source: the
-- write fails in the background, the ledger records an error, and a server-wins
-- hydrate destroys the only remaining copy.
--
-- So the constraint is widened HERE, ahead of any client that emits either value,
-- and CONSENT_SCOPES in src/lib/store.js is asserted against this file by
-- dbConstraints.test.js. The old scopes are re-listed verbatim — dropping one
-- while widening would silently orphan every historical row that used it.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'consent_records_scope_check') then
    alter table public.consent_records drop constraint consent_records_scope_check;
  end if;
  alter table public.consent_records add constraint consent_records_scope_check
    check (scope in ('roster_attendance','biometric_live','biometric_store','coach_view','export',
                     'health_screening','progress_photos'));
end $$;

-- ── parq_responses — the hard gate, and health data ─────────────────────────
--
-- More sensitive than anything else in the product. Its RLS is NARROWER than
-- staff: gym admins, the member themselves, and — via the sessions/programs join
-- — nobody else. A frontdesk user must not be able to read a member's cardiac
-- history to check them into a spin class.
create table if not exists public.parq_responses (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  form_version  text not null,
  answers       jsonb not null,
  -- Any 'yes' on the risk questions. Computed by the client at completion time
  -- and stored, rather than derived on read: the question set changes between
  -- form versions, and a gate that re-derives risk from an old form with new
  -- rules is a gate that silently changes its mind about someone.
  flagged       boolean not null,
  clearance_ref text,
  cleared_by    uuid references public.profiles(id) on delete set null,
  cleared_at    timestamptz,
  completed_at  timestamptz not null default now(),
  -- Screening expires. A PAR-Q from three years ago is not a statement about the
  -- person in front of you. Set by the client to completed_at + 12 months.
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_parq_member on public.parq_responses(member_id, completed_at desc);

-- ── THE GATE ─────────────────────────────────────────────────────────────────
-- A program may not become active for a member without current screening. In the
-- DATABASE, as a trigger, because a UI-only gate is one refactor away from absent
-- and this is the one that carries physical risk to a person.
create or replace function public.require_parq_before_active()
returns trigger language plpgsql as $$
declare ok boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;
  -- Unchanged status on an already-active program is not a re-activation; without
  -- this, editing the title of a live program whose screening lapsed yesterday
  -- would throw in the trainer's face mid-edit.
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select exists (
    select 1 from public.parq_responses p
     where p.member_id = new.member_id
       and p.expires_at > now()
       and (p.flagged = false or p.cleared_at is not null)
  ) into ok;

  if not ok then
    raise exception 'This member has no current health screening. Complete PAR-Q (and record medical clearance if it is flagged) before starting their program.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_programs_require_parq on public.programs;
create trigger trg_programs_require_parq before insert or update on public.programs
  for each row execute function public.require_parq_before_active();

-- ── measurements ─────────────────────────────────────────────────────────────
-- Note what is ABSENT: no body_fat_pct. Caliper and bioimpedance arithmetic
-- presented as a measurement is a confident wrong number, and this product's
-- standing rule is that one of those is worse than none. Record what was
-- measured; a derived percentage is the gym's to state, not ours to compute.
create table if not exists public.measurements (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null
                check (kind in ('bodyweight_kg','height_cm','waist_cm','hip_cm','chest_cm',
                                'thigh_cm','arm_cm','resting_hr','photo')),
  value       numeric(8,2),
  -- A Storage object path, never a URL. Progress photos are served through
  -- short-lived signed URLs only: a public path in a database column is a public
  -- path forever, and this is the most sensitive data the product will hold.
  photo_path  text,
  taken_on    date not null,
  source      text not null default 'trainer' check (source in ('trainer','client','device')),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_measurements_member on public.measurements(member_id, kind, taken_on desc);

-- ── habits ───────────────────────────────────────────────────────────────────
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  label      text not null,
  cadence    text not null default 'daily' check (cadence in ('daily','weekly')),
  target     numeric(8,2),
  unit       text,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_habits_member on public.habits(member_id) where active;

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  logged_on  date not null,
  value      numeric(8,2),
  done       boolean,
  created_at timestamptz not null default now(),
  -- One log per habit per day. A double-tap on a phone with a flaky connection is
  -- then harmless (ON CONFLICT DO NOTHING), which matters because the client app
  -- is offline-tolerant and WILL retry.
  unique (habit_id, logged_on)
);
create index if not exists idx_habit_logs_member on public.habit_logs(member_id, logged_on desc);

-- ── nutrition (D3: guidance, not a food database) ────────────────────────────
create table if not exists public.nutrition_plans (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  title       text not null,
  guidance    jsonb not null default '{}'::jsonb,
  -- Coach-SET, never computed by us. Jungle does not calculate anyone's calorie
  -- requirement; a trainer who wants to state a target states it.
  kcal_target int,
  protein_g   int,
  carb_g      int,
  fat_g       int,
  status      text not null default 'draft' check (status in ('draft','active','archived')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_nutrition_plans_member on public.nutrition_plans(member_id, status);

create table if not exists public.nutrition_logs (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  logged_at  timestamptz not null default now(),
  meal       text check (meal is null or meal in ('breakfast','lunch','dinner','snack')),
  note       text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_nutrition_logs_member on public.nutrition_logs(member_id, logged_at desc);

-- ── session_credits — a counter, not a calendar ─────────────────────────────
--
-- Append-only. Balance is sum(delta). A package sale is +10; marking a session
-- delivered is -1; a mistake is +1 with reason 'adjustment' and a note, never a
-- delete.
--
-- ⚠️ WHERE THE NO-BOOKING LINE IS. This table counts work delivered. It does not
-- schedule anything, hold a slot, publish availability, or record money. The tell
-- that the line has been crossed is a "book" button in the client app; if that is
-- ever wanted it is a product decision with a schema consequence, argued
-- deliberately — not added in a sprint. There is deliberately no `amount` column.
create table if not exists public.session_credits (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  delta       int not null check (delta <> 0),
  reason      text not null
                check (reason in ('package_added','session_delivered','adjustment','expiry')),
  session_id  uuid references public.sessions(id) on delete set null,
  package_ref text,
  note        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  -- One debit per session. Marking a session delivered twice — two devices, or a
  -- retry after a flaky write — must not cost the client two credits.
  unique (session_id, reason)
);
create index if not exists idx_session_credits_member on public.session_credits(member_id, occurred_at desc);

-- ── updated_at ───────────────────────────────────────────────────────────────
drop trigger if exists trg_nutrition_plans_updated on public.nutrition_plans;
create trigger trg_nutrition_plans_updated before update on public.nutrition_plans
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.parq_responses   enable row level security;
alter table public.measurements     enable row level security;
alter table public.habits           enable row level security;
alter table public.habit_logs       enable row level security;
alter table public.nutrition_plans  enable row level security;
alter table public.nutrition_logs   enable row level security;
alter table public.session_credits  enable row level security;

-- PAR-Q: NARROWER than staff, on purpose. Health data is read by gym
-- admins/managers and by the member. A coach reads it through the app's own
-- screening flow, which runs server-side; a frontdesk user never reads it at all.
drop policy if exists parq_admin on public.parq_responses;
drop policy if exists parq_own   on public.parq_responses;
create policy parq_admin on public.parq_responses for all
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));
create policy parq_own on public.parq_responses for select
  using (member_id in (select public.own_member_ids()));

-- Everything else: staff manage; the client reads their own and writes the four
-- tables that are theirs to write. That asymmetry is the client app's entire
-- threat model and it is meant to fit in one paragraph.
do $$
declare t text;
begin
  foreach t in array array['measurements','habits','habit_logs','nutrition_plans','nutrition_logs','session_credits']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all
         using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
         with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))',
      t || '_staff', t);

    execute format('drop policy if exists %I on public.%I', t || '_read_own', t);
    execute format(
      'create policy %I on public.%I for select
         using (member_id in (select public.own_member_ids()))',
      t || '_read_own', t);
  end loop;
end $$;

-- A draft nutrition plan is no more visible to the client than a draft program.
-- The loop above gave every table the same own-read policy; this narrows the one
-- that needs it, by replacing that policy rather than adding beside it.
drop policy if exists nutrition_plans_read_own on public.nutrition_plans;
create policy nutrition_plans_read_own on public.nutrition_plans for select
  using (member_id in (select public.own_member_ids()) and status = 'active');

-- The client's write surface: habit logs, nutrition logs, and their own
-- measurements. NOT habits (a trainer sets the habits), NOT plans, NOT credits —
-- a client must never be able to write themselves a session balance.
drop policy if exists habit_logs_insert_own on public.habit_logs;
create policy habit_logs_insert_own on public.habit_logs for insert
  with check (member_id in (select public.own_member_ids()));

drop policy if exists nutrition_logs_insert_own on public.nutrition_logs;
create policy nutrition_logs_insert_own on public.nutrition_logs for insert
  with check (member_id in (select public.own_member_ids()));

drop policy if exists measurements_insert_own on public.measurements;
create policy measurements_insert_own on public.measurements for insert
  with check (member_id in (select public.own_member_ids()) and source = 'client');

-- A habit log is a tick that can be untucked the same day, so the client may
-- update and delete their OWN logs. Nothing else in this migration gives a client
-- an update or delete route.
drop policy if exists habit_logs_update_own on public.habit_logs;
create policy habit_logs_update_own on public.habit_logs for update
  using      (member_id in (select public.own_member_ids()))
  with check (member_id in (select public.own_member_ids()));

drop policy if exists habit_logs_delete_own on public.habit_logs;
create policy habit_logs_delete_own on public.habit_logs for delete
  using (member_id in (select public.own_member_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- PDPA notes that are NOT satisfied by schema alone, recorded so they are not
-- mistaken for done:
--   · Progress photos need an explicit opt-in consent row (scope
--     'progress_photos') before the client app offers the camera, and a stated
--     retention period in the gym's DPA.
--   · PAR-Q answers need scope 'health_screening' recorded at completion.
--   · Erasure: every table here cascades from members, so deleting a member
--     removes their record. The Storage objects behind photo_path DO NOT
--     cascade — deleting them is application work, and it is the one erasure
--     path a database migration cannot promise.
-- ─────────────────────────────────────────────────────────────────────────────
