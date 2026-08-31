-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — 0011 MEMBER IDENTITIES (PT phase 1: a roster row may hold an account)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- 🔴 REQUIRES 0010. Applying this without the staff read boundary hands the first
-- client an account that can read the entire gym. The DO block below refuses to
-- run if staff_gym_ids() is missing, rather than leaving that to discipline.
--
-- ── THE NARROW REVERSAL ──────────────────────────────────────────────────────
-- 0007 says, and is right: "Gym members as ROSTER ROWS, not auth users. This is
-- the design decision that makes attendance capture work on day one: recording a
-- check-in requires zero member adoption, no signup, no password, no app
-- install." classToken.js goes further — "there are no member accounts and there
-- will not be any."
--
-- All of that stays true FOR MEMBERS. A PT client is different in kind: an
-- ongoing individual relationship with a named trainer, and a record about their
-- own body they have a legal interest in seeing. So the reversal is exactly one
-- sentence wide:
--
--   A member row MAY be linked to an auth user, ON INVITATION, and only then.
--
-- Attendance capture still needs zero adoption. The class summary link stays
-- class-scoped and anonymous — nothing in this migration touches it. A gym that
-- never sells PT never creates a row in this table.
--
-- ── WHAT THIS BUYS THAT A `role = 'member'` MEMBERSHIP ALONE DOES NOT ────────
-- A membership says "this user belongs to this gym". It does NOT say WHICH
-- roster row they are, and every client-app query needs exactly that. Without
-- this table the only available scoping is the gym, which is the breach 0010
-- exists to prevent.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regclass('public.members') is null then
    raise exception '0011 requires 0007 (members). Apply 0007 first.';
  end if;
  if to_regproc('public.staff_gym_ids') is null then
    raise exception '0011 requires 0010 (staff read boundary). Apply 0010 first — without it, every client account can read the whole gym.';
  end if;
end $$;

-- ── member_identities ────────────────────────────────────────────────────────
create table if not exists public.member_identities (
  -- member_id is the PK, not a serial. One member, at most one account: a second
  -- invite UPDATES this row rather than creating an ambiguity about which account
  -- owns the training record.
  member_id   uuid primary key references public.members(id) on delete cascade,
  -- Globally unique, not unique-per-gym. One person cannot silently hold two
  -- client identities. D1 puts one gym per client in v1; this constraint is what
  -- makes the multi-gym case a DECISION later rather than a surprise.
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  invited_by  uuid references public.profiles(id) on delete set null,
  invited_at  timestamptz not null default now(),
  -- null until the invite is accepted. The trainer's UI must be able to say
  -- "invited 6 days ago, not opened" rather than implying the client is looking
  -- at their program.
  linked_at   timestamptz,
  -- Revocation is a TIMESTAMP, not a delete. Withdrawing app access must not
  -- touch the training record: the gym still holds the data, the person can no
  -- longer sign in to see it. A delete here would read as "this never happened".
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym_id, user_id)
);
create index if not exists idx_member_identities_user on public.member_identities(user_id);
create index if not exists idx_member_identities_gym  on public.member_identities(gym_id);

drop trigger if exists trg_member_identities_updated on public.member_identities;
create trigger trg_member_identities_updated before update on public.member_identities
  for each row execute function public.set_updated_at();

-- ── own_member_ids() — the predicate the entire client app rests on ─────────
-- SECURITY DEFINER, same pattern and same reason as staff_gym_ids(): the
-- internal read must bypass RLS so it does not recurse against the policies
-- that call it.
--
-- Both conditions are load-bearing. `linked_at is not null` means an invite that
-- was sent but never accepted grants nothing. `revoked_at is null` means access
-- ends the moment it is withdrawn, without deleting the link and with it the
-- record of who invited whom.
create or replace function public.own_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select member_id from public.member_identities
   where user_id = auth.uid()
     and linked_at is not null
     and revoked_at is null;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.member_identities enable row level security;

-- Staff manage invites. A client may READ their own link (the client app needs
-- to know which member row it is) and may never write one — an INSERT here is
-- the act of granting someone access to a person's training record.
drop policy if exists member_identities_staff on public.member_identities;
drop policy if exists member_identities_own   on public.member_identities;
create policy member_identities_staff on public.member_identities for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy member_identities_own on public.member_identities for select
  using (user_id = auth.uid());

-- ── The client's own record: three ADDITIVE policies ─────────────────────────
--
-- ⚠️ ADDITIVE, and that word is doing real work. Postgres OR's permissive
-- policies, which is exactly what made 0010's first draft an escalation. Here
-- it is the intended mechanism rather than an accident: 0010's staff policies
-- stay untouched and unchanged, and these three add a strictly narrower second
-- route scoped to `own_member_ids()`. New NAMES, so nothing is silently
-- replaced; rlsBoundary.test.js asserts 0010's own names are never re-created.
--
-- This is where "one training record per person" stops being a slogan. A client
-- reads their own roster row, their own attendance — including the CLASSES they
-- took, not just their PT sessions — and the class occurrences those attach to.
-- No competitor's client app can show that, because their PT tool never saw the
-- class.

-- Their own roster row: their name, status and join date. Not the roster.
drop policy if exists members_read_own on public.members;
create policy members_read_own on public.members for select
  using (id in (select public.own_member_ids()));

-- Their own attendance. Still INSERT-only for staff and still immutable: this
-- adds a SELECT route and no other command, so the append-only guarantee that
-- makes retention numbers defensible is unchanged.
drop policy if exists attendance_read_own on public.attendance;
create policy attendance_read_own on public.attendance for select
  using (member_id in (select public.own_member_ids()));

-- The class occurrences they actually attended — and nothing else on the
-- schedule. Deliberately NOT "every class in the gym": what classes a studio
-- runs next week is the gym's business, and a client app that leaks the whole
-- timetable is one step from being a booking system (see the no-booking line).
drop policy if exists class_instances_read_own on public.class_instances;
create policy class_instances_read_own on public.class_instances for select
  using (id in (
    select a.class_instance_id from public.attendance a
     where a.member_id in (select public.own_member_ids())
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: supabase/tests/0011_rls_selftest.sql. It asserts a linked client
-- sees exactly their own rows and none of the gym's — and, as the control, that
-- an UNACCEPTED invite (linked_at null) and a REVOKED one both see nothing,
-- because "the policy works" and "the policy is never satisfied" produce the
-- same PASS on a table the test forgot to populate.
-- ─────────────────────────────────────────────────────────────────────────────
