-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — 0012 PT TRAINING SPINE (F1 completed: programs, sessions, set logs)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- 🔴 REQUIRES 0010 and 0011.
--
-- This is the migration the As-Built spec has been describing as missing since it
-- was written. Its F1 acceptance criterion — "a session assignment targets a
-- class_instance XOR a member" — has been unrunnable because only one side of the
-- XOR existed. class_instances shipped in 0007. This is the other side, and with
-- it design principle P5 ("one primitive, two lenses") goes from ⛔ to real.
--
-- ⚠️ EVERY CHECK-CONSTRAINED COLUMN BELOW IS THE REPO'S MOST EXPENSIVE BUG CLASS.
-- Three times a client has written a value a CHECK rejected: the background
-- upsert failed silently, the error ledger recorded it, and a server-wins hydrate
-- then destroyed the only surviving copy. Every enum here is pinned in ONE
-- exported constant in src/lib/store.js and asserted against THIS FILE by
-- src/lib/dbConstraints.test.js. Nothing may spell these strings inline.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regproc('public.own_member_ids') is null then
    raise exception '0012 requires 0011 (member identities). Apply 0011 first.';
  end if;
end $$;

-- ── programs ─────────────────────────────────────────────────────────────────
-- A multi-week plan assigned to one member. `plan` mirrors persona_plans.plan's
-- jsonb shape on purpose — the same shape the deck extractor already produces and
-- the Builder already renders — so a persona-generated block drops straight in
-- without a translation layer nobody would keep in sync.
create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  persona_id    uuid,                        -- FK added below, only if 0005 is applied
  title         text not null,
  goal          text,
  weeks         int check (weeks is null or weeks between 1 and 104),
  starts_on     date,
  -- 'draft' is the default and it is load-bearing: the coach-approval gate (F2)
  -- says no generated output reaches a member surface unreviewed. The client-read
  -- policy below refuses drafts, so that gate holds in the DATABASE and not only
  -- in whichever screen happens to publish.
  status        text not null default 'draft'
                  check (status in ('draft','active','completed','archived')),
  plan          jsonb not null default '{}'::jsonb,
  version       int not null default 1,
  supersedes_id uuid references public.programs(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_programs_member on public.programs(member_id, status);
create index if not exists idx_programs_gym on public.programs(gym_id);

do $$ begin
  if to_regclass('public.coach_personas') is not null
     and not exists (select 1 from pg_constraint where conname = 'programs_persona_fk') then
    alter table public.programs
      add constraint programs_persona_fk foreign key (persona_id)
      references public.coach_personas(id) on delete set null;
  end if;
end $$;

-- ── sessions — THE XOR ───────────────────────────────────────────────────────
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  -- Exactly one of these. A session delivered to a room and a session delivered
  -- to one person are the same object seen through two lenses, which is what lets
  -- one analytics path, one offline sync and one persona engine serve both.
  class_instance_id uuid references public.class_instances(id) on delete cascade,
  member_id         uuid references public.members(id) on delete cascade,
  trainer_id        uuid references public.profiles(id) on delete set null,
  program_id        uuid references public.programs(id) on delete set null,
  starts_at         timestamptz not null,
  duration_min      int,
  -- ⚠️ NOT a booking status. There is no 'requested', no 'confirmed', no
  -- 'waitlisted'. `starts_at` records when a session the trainer and client
  -- already agreed happens; it is not a slot anyone reserves. Adding a
  -- client-initiated status here is the first step of a pivot, not a feature —
  -- treat it as a decision, the way 0007 treats a capacity column.
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
create index if not exists idx_sessions_member_time on public.sessions(member_id, starts_at desc);
create index if not exists idx_sessions_gym_time on public.sessions(gym_id, starts_at desc);
create index if not exists idx_sessions_trainer on public.sessions(trainer_id, starts_at desc);

-- ── prescriptions — what was PROGRAMMED for one session ─────────────────────
create table if not exists public.prescriptions (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  ord             int not null,
  block_label     text,
  movement        text not null,
  -- One of movementTaxonomy.js's CATEGORIES, or null when the taxonomy does not
  -- recognise the name. Deliberately NOT constrained by a CHECK: the taxonomy is
  -- client-side and evolves, and a CHECK here would be a fourth place the
  -- category list lives — which is how the list starts disagreeing with itself.
  category        text,
  sets            int,
  -- TEXT, not int. "8-10", "AMRAP", "30s each side" are all real prescriptions a
  -- coach writes, and a numeric column forces the UI to lie or to refuse them.
  reps            text,
  load_kg         numeric(6,2),
  load_pct_1rm    numeric(5,2),
  rir             numeric(3,1),
  tempo           text,
  rest_sec        int,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (session_id, ord)
);
create index if not exists idx_prescriptions_session on public.prescriptions(session_id, ord);

-- ── set_logs — THE PT DATA SPINE ─────────────────────────────────────────────
--
-- WHY THIS IS NOT IMMUTABLE, WHEN ATTENDANCE IS
-- attendance has no update and no delete policy at all, because "a retention
-- claim computed from a table someone can quietly edit is not evidence". Set logs
-- cannot be that: a trainer WILL type 100 for 10 mid-session, and a record saying
-- a beginner deadlifted 100 kg is worse than one that can be corrected.
--
-- But a plain UPDATE throws away the fact that a correction happened, and
-- progression suggestions computed from silently-edited history have exactly
-- attendance's evidential problem. So a correction INSERTS a new row carrying
-- supersedes_id and marks the old one voided. Current truth is the head of each
-- chain; the whole history survives. Same shape consent_records already uses —
-- events, not mutable state — and for the same reason.
create table if not exists public.set_logs (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  movement        text not null,
  set_index       int not null,
  reps            int,
  load_kg         numeric(6,2),
  rpe             numeric(3,1) check (rpe is null or rpe between 0 and 10),
  rir             numeric(3,1) check (rir is null or rir between 0 and 10),
  duration_sec    int,
  distance_m      numeric(8,2),
  logged_by       uuid references public.profiles(id) on delete set null,
  source          text not null default 'trainer'
                    check (source in ('trainer','client','import')),
  performed_at    timestamptz not null default now(),
  supersedes_id   uuid references public.set_logs(id) on delete set null,
  voided          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_set_logs_member_time on public.set_logs(member_id, performed_at desc);
-- The index the progress rollup will read. Shaped now so adding the rollup later
-- is not also a migration that rewrites this table's access pattern.
create index if not exists idx_set_logs_member_movement
  on public.set_logs(member_id, movement, performed_at desc) where voided = false;
create index if not exists idx_set_logs_session on public.set_logs(session_id);

-- ── updated_at maintenance (reuses public.set_updated_at from 0003) ──────────
-- prescriptions and set_logs are excluded: both are append-only in spirit and
-- neither carries an updated_at column to maintain.
drop trigger if exists trg_programs_updated on public.programs;
create trigger trg_programs_updated before update on public.programs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sessions_updated on public.sessions;
create trigger trg_sessions_updated before update on public.sessions
  for each row execute function public.set_updated_at();

-- ── The one legal UPDATE on set_logs ─────────────────────────────────────────
-- RLS scopes ROWS, not columns, so "only `voided` may change" cannot be written
-- as a policy. A trigger can say it exactly, and can say it to every caller
-- including a future Edge Function holding the service-role key — which a
-- column-level GRANT would not.
create or replace function public.set_logs_only_void_may_change()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'voided') <> (to_jsonb(old) - 'voided') then
    raise exception 'set_logs rows are corrected by inserting a superseding row, not by editing. Only `voided` may change.';
  end if;
  return new;
end $$;

drop trigger if exists trg_set_logs_no_edit on public.set_logs;
create trigger trg_set_logs_no_edit before update on public.set_logs
  for each row execute function public.set_logs_only_void_may_change();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.programs      enable row level security;
alter table public.sessions      enable row level security;
alter table public.prescriptions enable row level security;
alter table public.set_logs      enable row level security;

-- Staff: full access within their own gym, exactly as 0010 leaves every other
-- operational table.
drop policy if exists programs_staff on public.programs;
create policy programs_staff on public.programs for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists sessions_staff on public.sessions;
create policy sessions_staff on public.sessions for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists prescriptions_staff on public.prescriptions;
create policy prescriptions_staff on public.prescriptions for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists set_logs_staff on public.set_logs;
create policy set_logs_staff on public.set_logs for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- ── The client's own training record ─────────────────────────────────────────
--
-- 🔴 A DRAFT PROGRAM IS NOT VISIBLE TO THE CLIENT. This is the coach-approval
-- gate expressed where it cannot be bypassed. A trainer half-writing next block
-- on Tuesday must not have it appear in someone's app on Tuesday, and "the screen
-- filters drafts" is one refactor away from being false.
drop policy if exists programs_read_own on public.programs;
create policy programs_read_own on public.programs for select
  using (member_id in (select public.own_member_ids())
         and status in ('active','completed'));

drop policy if exists sessions_read_own on public.sessions;
create policy sessions_read_own on public.sessions for select
  using (member_id in (select public.own_member_ids()));

drop policy if exists prescriptions_read_own on public.prescriptions;
create policy prescriptions_read_own on public.prescriptions for select
  using (session_id in (
    select s.id from public.sessions s
     where s.member_id in (select public.own_member_ids())
  ));

drop policy if exists set_logs_read_own on public.set_logs;
create policy set_logs_read_own on public.set_logs for select
  using (member_id in (select public.own_member_ids()));

-- The one table a client may WRITE to in this migration: their own set logs,
-- for their own sessions, and only ever marked `source = 'client'`.
--
-- That last clause is not cosmetic. Without it a client could insert a row
-- claiming to be trainer-authored, and the trainer's screen — which trusts
-- `source` to say who observed the lift — would show it as their own
-- observation. `logged_by` is pinned to the caller for the same reason.
--
-- INSERT only. No update, no delete policy for clients at all: a correction is a
-- superseding insert, and voiding someone's history is a trainer's act.
drop policy if exists set_logs_insert_own on public.set_logs;
create policy set_logs_insert_own on public.set_logs for insert
  with check (
    member_id in (select public.own_member_ids())
    and source = 'client'
    and logged_by = auth.uid()
    and session_id in (
      select s.id from public.sessions s
       where s.member_id in (select public.own_member_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- KNOWN GAP, recorded rather than discovered later: nothing here enforces that a
-- program may only go active for a member with valid PAR-Q screening. That gate
-- needs parq_responses, which lands in 0013, and it is a TRIGGER there rather
-- than a policy here — a UI-only gate is one refactor from absent, and this is
-- the one carrying physical risk to a person. 0012 must not ship to a real gym
-- without 0013 following it.
-- ─────────────────────────────────────────────────────────────────────────────
