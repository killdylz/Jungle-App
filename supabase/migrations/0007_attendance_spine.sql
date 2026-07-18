-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — F4 attendance spine (members / class_instances / attendance / consent)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- This is the critical path. The Fable spec says it three ways: "capture is F4 and
-- sits on the critical path; dashboards are downstream consumers"; MODIFY pillar M2
-- (own the data spine, never rent it from a booking incumbent); and assumption A7,
-- whose failure is kill criterion #3. Phase 2 analytics (N2/N3), an honest active-
-- members number, the floor-board roster and the member summary (N4) all wait on it.
--
-- SCOPE — deliberately narrow (decided 2026-07-18). Four tables only. The full
-- session primitive (session_templates / sessions / session_assignments with the
-- class_instance XOR member constraint, F1) is NOT here. class_instances is shaped
-- so that layer can be added later WITHOUT altering existing columns: a future
-- session_assignments references class_instances(id) and adds the XOR on its own
-- side. Nothing below needs to change when F1 lands.
--
-- Built on the tenant model from 0001 (gyms/memberships/profiles), the role helpers
-- from 0002 (is_gym_admin), and the append-only RLS pattern proven on
-- session_history in 0003.
--
-- ⚠️ VERIFY AFTER APPLYING: run supabase/tests/0007_rls_selftest.sql in the SQL
-- editor. It asserts cross-gym isolation and attendance/consent immutability inside
-- a transaction it rolls back. RLS failures are invisible from the app — the whole
-- point is that a leak looks exactly like normal operation until it doesn't.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── members ──────────────────────────────────────────────────────────────────
-- Gym members as ROSTER ROWS, not auth users. This is the design decision that
-- makes attendance capture work on day one: recording a check-in requires zero
-- member adoption, no signup, no password, no app install. A member may LATER be
-- given a magic-link view of their own data (N4) — that grants scoped read access,
-- it does not turn this row into an account.
--
-- Data minimisation is deliberate: name, optional email, status, joined date. No
-- phone, no notes, no address, no demographics. Personal data, NOT special-category
-- — and it stays that way until the consent ledger below gates something else.
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  name         text not null,
  email        text,                       -- optional; only for the magic-link summary (N4)
  status       text not null default 'active'
                 check (status in ('active','paused','cancelled')),
  joined_at    date,                       -- drives the first-90-day cohort curve (N2)
  external_ref text,                       -- booking-system/CSV id, for import dedupe
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_members_gym on public.members(gym_id);
create index if not exists idx_members_gym_status on public.members(gym_id, status);
-- Dedupe on re-import. Both are partial so the common case (a roster row with
-- neither an email nor a booking-system id) is never blocked from being created.
create unique index if not exists uq_members_email
  on public.members(gym_id, lower(email)) where email is not null;
create unique index if not exists uq_members_external
  on public.members(gym_id, external_ref) where external_ref is not null;

-- ── class_instances ──────────────────────────────────────────────────────────
-- ONE dated occurrence of a class — the thing attendance attaches to.
--
-- Explicitly NOT booking. There is no capacity, no reservation, no waitlist, no
-- payment, no member-facing sign-up. That absence IS the no-CRM line expressed in
-- schema: Jungle records what was DELIVERED, and never becomes the system a member
-- books through. Adding a capacity column here is the first step of a pivot, not a
-- feature — treat it as a decision, not a chore.
--
-- 0003 deliberately kept class_schedule_rules (recurring RULES: day/slot/repeat)
-- distinct from occurrences for exactly this moment. rule_id records that a given
-- occurrence was generated from a rule, so the generator can be idempotent.
create table if not exists public.class_instances (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  starts_at    timestamptz not null,
  name         text,
  class_type   text,
  coach_id     uuid references public.profiles(id) on delete set null,
  coach_name   text,                       -- denormalised: class_schedule_rules.coach is free text
  rule_id      uuid references public.class_schedule_rules(id) on delete set null,
  duration_min int,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_class_instances_gym_starts on public.class_instances(gym_id, starts_at desc);
-- Generating next week's occurrences twice must not create duplicates.
create unique index if not exists uq_class_instances_rule_slot
  on public.class_instances(gym_id, rule_id, starts_at) where rule_id is not null;

-- ── attendance ───────────────────────────────────────────────────────────────
-- THE DATA SPINE. Immutable: insert-only RLS below, no update or delete policy at
-- all. A retention claim computed from a table someone can quietly edit is not
-- evidence, and this is the table the entire outcome tier is priced against.
--
-- ⚠️ `source` is a CHECK-constrained enum. On 2026-07-18 the equivalent constraint
-- on persona_plans.source cost us a live data-loss bug: the client wrote a value the
-- constraint rejected, the background upsert failed silently, and a server-wins
-- hydrate then deleted the only copy. When the client writes here, it MUST emit
-- exactly 'qr' | 'coach' | 'import' — pin those three values in one shared constant
-- with a unit test, the way src/lib/store.js planSource() now does.
create table if not exists public.attendance (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  class_instance_id uuid not null references public.class_instances(id) on delete cascade,
  -- Cascade on member delete is intentional and required: GDPR/MHMDA erasure must
  -- actually remove the person's attendance, and "immutable" constrains what USERS
  -- may do through the API, not what a lawful erasure does to the row.
  member_id         uuid not null references public.members(id) on delete cascade,
  source            text not null check (source in ('qr','coach','import')),
  checked_in_at     timestamptz not null default now(),
  recorded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- One check-in per member per class. Makes a double-scan and a coach sweeping a
  -- roster after a member already self-scanned both harmless (ON CONFLICT DO NOTHING),
  -- which matters because P6 (<5s) means the two paths WILL race in a busy room.
  unique (class_instance_id, member_id)
);
create index if not exists idx_attendance_gym_time on public.attendance(gym_id, checked_in_at desc);
create index if not exists idx_attendance_member on public.attendance(member_id, checked_in_at desc);
create index if not exists idx_attendance_class on public.attendance(class_instance_id);

-- ── consent_records ──────────────────────────────────────────────────────────
-- Append-only consent ledger. Ships now even though NO biometrics do — the spec
-- calls this "cheap insurance, MHMDA-shaped", and it is far cheaper to have an
-- empty ledger than to reconstruct consent history retroactively.
--
-- DEVIATION FROM THE SPEC, deliberate: the spec sketches columns granted_at AND
-- withdrawn_at on one row. That cannot be append-only — recording a withdrawal
-- would require an UPDATE. Here each row is an EVENT (`granted` true or false), and
-- current state is the latest row per (member, scope). Same information, actually
-- immutable, and it preserves the full history a regulator would ask for.
--
-- Scopes are graduated exactly as specified: roster_attendance is notice-level and
-- is all that Phase 1 needs; every biometric scope is explicit opt-in and unused
-- until Phase 4.
create table if not exists public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  scope          text not null
                   check (scope in ('roster_attendance','biometric_live','biometric_store','coach_view','export')),
  granted        boolean not null,          -- false = withdrawal event
  policy_version text not null,             -- which notice/policy text they saw
  method         text not null
                   check (method in ('notice','explicit_opt_in','import','withdrawal')),
  occurred_at    timestamptz not null default now(),
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_consent_member_scope on public.consent_records(member_id, scope, occurred_at desc);
create index if not exists idx_consent_gym on public.consent_records(gym_id);

-- ── updated_at maintenance (reuse public.set_updated_at from 0003) ───────────
-- attendance and consent_records are intentionally excluded — both are append-only
-- and have no updated_at column to maintain.
drop trigger if exists trg_members_updated on public.members;
create trigger trg_members_updated before update on public.members
  for each row execute function public.set_updated_at();

drop trigger if exists trg_class_instances_updated on public.class_instances;
create trigger trg_class_instances_updated before update on public.class_instances
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.members         enable row level security;
alter table public.class_instances enable row level security;
alter table public.attendance      enable row level security;
alter table public.consent_records enable row level security;

-- members: any active gym member reads and may add/correct a roster row — a coach
-- must be able to create a walk-in at the point of check-in without waiting for an
-- admin, or P6 (<5s) is unachievable and the instrument starves (A7). DELETE is
-- admin-only: removing a member cascades their attendance, so it is the one
-- genuinely destructive operation here.
drop policy if exists members_read   on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_read on public.members for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy members_insert on public.members for insert
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy members_update on public.members for update
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy members_delete on public.members for delete
  using (public.is_platform_admin() or public.is_gym_admin(gym_id));

-- class_instances: any active gym member reads and writes — a coach starting a
-- class creates the occurrence. Mirrors class_schedule_rules in 0003.
drop policy if exists class_instances_rw on public.class_instances;
create policy class_instances_rw on public.class_instances for all
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- attendance: read by any active gym member (feeds analytics); INSERT ONLY.
-- There is deliberately NO update and NO delete policy — with RLS enabled and no
-- policy for a command, that command matches zero rows for every non-superuser.
-- This is the same shape session_history uses in 0003, and it is what makes the
-- retention numbers defensible.
drop policy if exists attendance_read   on public.attendance;
drop policy if exists attendance_insert on public.attendance;
create policy attendance_read on public.attendance for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy attendance_insert on public.attendance for insert
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- consent_records: same append-only shape. A consent ledger that can be edited is
-- worse than none — it would be evidence of tampering rather than of consent.
drop policy if exists consent_records_read   on public.consent_records;
drop policy if exists consent_records_insert on public.consent_records;
create policy consent_records_read on public.consent_records for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy consent_records_insert on public.consent_records for insert
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- KNOWN GAP, recorded here so it is not discovered late:
--
-- QR SELF-CHECK-IN CANNOT WRITE THROUGH THESE POLICIES. Every policy above
-- requires an authenticated staff user (user_gym_ids()). A member scanning the room
-- screen's QR is on their own phone and is NOT an auth user — that is the whole
-- point of members-as-roster-rows. So source='qr' needs a server-side write path:
-- an Edge Function holding the service-role key that validates a short-lived,
-- class-scoped token minted by the room display, then inserts on the member's
-- behalf. Do NOT solve this by loosening the policies to anon.
--
-- source='coach' (the roster sweep in the Live runner) and source='import' (CSV
-- backfill) both work against these policies today, so F4 can ship its first slice
-- — and the coach sweep may well be the real <5s path anyway (spec §8 Q2).
-- ─────────────────────────────────────────────────────────────────────────────
