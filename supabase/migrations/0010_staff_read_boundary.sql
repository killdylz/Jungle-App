-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — 0010 STAFF READ BOUNDARY (prerequisite for PT / any member account)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- ⚠️ APPLY THIS BEFORE ANY MEMBER-ROLE USER EXISTS. It is a security fix to
-- policies that are already live, and it is correct hardening of the product as
-- it stands today whether or not PT is ever built.
--
-- ── WHAT IS WRONG TODAY ──────────────────────────────────────────────────────
-- Every read policy written since 0001 is a variant of
--
--     using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
--
-- and user_gym_ids() (0001) is:
--
--     select gym_id from public.memberships
--      where user_id = auth.uid() and status = 'active';
--
-- There is NO ROLE FILTER. Meanwhile membership_role (0001) already includes
-- 'member', and src/supabase.js already carries ROLE_DEFAULTS.member with
-- 'progress:view-own'. So the cheap, obvious way to give a PT client an account
-- — a memberships row with role 'member' — silently grants that client SELECT on
-- every gym-scoped table in the product:
--
--   members          the entire roster, names and email addresses
--   attendance       every check-in by every member, ever
--   consent_records  every member's consent and withdrawal history
--   coach_personas / persona_plans / persona_movements
--                    the gym's whole programming corpus — which the first gym's
--                    agreement promises IN WRITING belongs to the coach
--   profiles         every colleague's email address
--   class_instances, class_schedule_rules, session_history, library_overrides,
--   retention_actions, class_summaries, subscriptions, audit_events
--
-- …plus INSERT, via members_insert and class_instances_rw.
--
-- This is not a bug today, because no member-role user has ever existed. It is a
-- landmine directly under the next feature, and RLS failures are INVISIBLE from
-- inside the app: a leak looks exactly like normal operation until it doesn't.
--
-- ── THE RULE THIS MIGRATION INSTALLS ─────────────────────────────────────────
--
--   A member reads their gym's IDENTITY, and nothing else.
--
-- Two tables keep the any-membership predicate, deliberately:
--
--   gyms            name / slug / active_skin_id. The client app has to know
--                   which studio it belongs to and which skin to wear (F6 —
--                   the member-facing surface is where the white-label promise
--                   is actually tested). None of it is personal data.
--   brand_profiles  the palette and logo. Same reason. Writes were already
--                   admin-only in 0003 and are untouched here.
--
-- EVERYTHING else moves to staff. `staff_gym_ids()` is the same query as
-- `user_gym_ids()` with a role filter, so the rewrite below is mechanical and
-- every policy keeps its existing shape.
--
-- ⚠️ user_gym_ids() is NOT dropped. After this migration it has exactly two
-- callers — gyms_read and brand_profiles_read — and both are intentional. A
-- THIRD caller appearing is the drift this file exists to prevent; the
-- verification query at the bottom finds it, and src/lib/rlsBoundary.test.js
-- fails the unit suite on it.
--
-- ⚠️ 0005 and 0006 have never been applied. The persona blocks below are guarded
-- with to_regclass so this migration is correct against a database that has them
-- and against one that does not. Applying 0005/0006 LATER re-creates their
-- policies with the old predicate — so this file must be re-run after them, and
-- being idempotent is what makes that safe.
--
-- ⚠️ VERIFY AFTER APPLYING: run supabase/tests/0010_rls_selftest.sql. It proves a
-- member-role user is blind AND — the positive control — that a coach still
-- reads everything they read before. A test that only checks the denials passes
-- identically on a database where the fixtures failed to insert.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the internal read of memberships bypasses RLS and does not
-- recurse against the policies below — the same pattern as user_gym_ids() and
-- is_gym_admin(), and for the same reason.
--
-- The role list is ENUMERATED, not expressed as `role <> 'member'`. That is the
-- load-bearing decision in this file: a role added to membership_role later must
-- default to NOT staff. Under the negative form, a new 'guest' or 'client' role
-- would silently inherit read on the entire gym the day it was created, which is
-- precisely the failure being fixed here, arriving through another door.
create or replace function public.staff_gym_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select gym_id from public.memberships
   where user_id = auth.uid()
     and status  = 'active'
     and role in ('admin','manager','coach','frontdesk');
$$;

-- Scalar form, for policies that already take a gym id (mirrors is_gym_admin).
create or replace function public.is_gym_staff(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
     where user_id = auth.uid()
       and gym_id  = p_gym
       and status  = 'active'
       and role in ('admin','manager','coach','frontdesk')
  );
$$;

-- ── 0001 · tenant tables ─────────────────────────────────────────────────────

-- gyms: UNCHANGED on purpose. See the header — a member must be able to resolve
-- their own studio's name and skin, and this row holds nothing else.
-- (Restated rather than skipped, so a reader of this file does not conclude it
-- was forgotten.)
drop policy if exists gyms_read on public.gyms;
create policy gyms_read on public.gyms for select
  using (public.is_platform_admin() or id in (select public.user_gym_ids()));

-- profiles: own row always; colleagues' rows are STAFF-only. A profile carries an
-- email address, so "everyone who shares a gym with you" was the whole staff
-- directory readable by any future client.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (
    public.is_platform_admin()
    or id = auth.uid()
    or id in (select user_id from public.memberships where gym_id in (select public.staff_gym_ids()))
  );

-- memberships and allowlist_entries are ABSENT FROM THIS MIGRATION, deliberately.
--
-- 0002 already replaced their 0001 policies with an admin-only split
-- (memberships_read/insert/update/delete and allowlist_read/insert/update/delete,
-- all on is_gym_admin, plus `user_id = auth.uid()` for reading your own row).
-- is_gym_admin is admin|manager, so a member-role user is already excluded and
-- there is nothing here to fix.
--
-- 🔴 Rewriting them anyway would have been a PRIVILEGE ESCALATION, not a
-- hardening. The 0001 policy names (memberships_rw, allowlist_rw) no longer
-- exist, so `drop policy if exists ... ; create policy ...` would not have
-- replaced anything — it would have ADDED a second permissive policy beside
-- 0002's. Permissive policies are OR'd, so every coach and frontdesk user would
-- have regained INSERT/UPDATE/DELETE on memberships: the ability to grant
-- themselves admin. Caught before applying; recorded here so the next person
-- resisting the urge to "finish the sweep" has the reason in front of them.

drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists locations_rw on public.locations;
create policy locations_rw on public.locations for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- ── 0003 · domain tables ─────────────────────────────────────────────────────

drop policy if exists class_schedule_rules_rw on public.class_schedule_rules;
create policy class_schedule_rules_rw on public.class_schedule_rules for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists library_overrides_read on public.library_overrides;
create policy library_overrides_read on public.library_overrides for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- brand_profiles READ: UNCHANGED on purpose (see header). The write policy from
-- 0003 is admin-only already and is not touched by this migration.
drop policy if exists brand_profiles_read on public.brand_profiles;
create policy brand_profiles_read on public.brand_profiles for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

drop policy if exists session_history_read   on public.session_history;
drop policy if exists session_history_insert on public.session_history;
create policy session_history_read on public.session_history for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy session_history_insert on public.session_history for insert
  with check (
    (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
    and (user_id is null or user_id = auth.uid())
  );

-- user_prefs is already `user_id = auth.uid()` on both sides. Nothing to do.

-- ── 0005 / 0006 · personas (GUARDED — these migrations are not yet applied) ──
-- ⚠️ THE POLICY NAMES HERE ARE _read / _write, NOT _rw. Dropping a name that does
-- not exist is a silent no-op, so a rewrite under the wrong name would leave the
-- leaky original in place AND add a second permissive policy beside it — the
-- table would still be readable by a member and the migration would look applied.
--
-- 0005's _write policies are is_gym_admin already and are left alone. 0006's
-- _write is `for all` on user_gym_ids, which covers SELECT too, so persona
-- generations needs BOTH halves rewritten.
do $$
begin
  if to_regclass('public.coach_personas') is not null then
    drop policy if exists coach_personas_read on public.coach_personas;
    create policy coach_personas_read on public.coach_personas for select
      using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
  end if;

  if to_regclass('public.persona_plans') is not null then
    drop policy if exists persona_plans_read on public.persona_plans;
    create policy persona_plans_read on public.persona_plans for select
      using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
  end if;

  if to_regclass('public.persona_movements') is not null then
    drop policy if exists persona_movements_read on public.persona_movements;
    create policy persona_movements_read on public.persona_movements for select
      using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
  end if;

  if to_regclass('public.persona_generations') is not null then
    drop policy if exists persona_generations_read  on public.persona_generations;
    drop policy if exists persona_generations_write on public.persona_generations;
    create policy persona_generations_read on public.persona_generations for select
      using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
    create policy persona_generations_write on public.persona_generations for all
      using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
      with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
  end if;
end $$;

-- ── 0007 · attendance spine ──────────────────────────────────────────────────
-- members: DELETE stays admin-only (it cascades attendance) — unchanged from 0007.
drop policy if exists members_read   on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
create policy members_read on public.members for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy members_insert on public.members for insert
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy members_update on public.members for update
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists class_instances_rw on public.class_instances;
create policy class_instances_rw on public.class_instances for all
  using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- attendance stays INSERT + SELECT only. No update, no delete, no policy for
-- them — that absence is what makes a retention number defensible, and this
-- migration must not accidentally restore one by writing `for all`.
drop policy if exists attendance_read   on public.attendance;
drop policy if exists attendance_insert on public.attendance;
create policy attendance_read on public.attendance for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy attendance_insert on public.attendance for insert
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

drop policy if exists consent_records_read   on public.consent_records;
drop policy if exists consent_records_insert on public.consent_records;
create policy consent_records_read on public.consent_records for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy consent_records_insert on public.consent_records for insert
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- ── 0008 · retention actions (append-only; same shape preserved) ─────────────
drop policy if exists retention_actions_read   on public.retention_actions;
drop policy if exists retention_actions_insert on public.retention_actions;
create policy retention_actions_read on public.retention_actions for select
  using (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
create policy retention_actions_insert on public.retention_actions for insert
  with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));

-- ── 0009 · class summaries ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.class_summaries') is not null then
    drop policy if exists class_summaries_rw on public.class_summaries;
    create policy class_summaries_rw on public.class_summaries for all
      using      (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()))
      with check (public.is_platform_admin() or gym_id in (select public.staff_gym_ids()));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run this after applying. It should return EXACTLY two rows:
-- gyms_read and brand_profiles_read. Any other row is a policy that still hands
-- a member-role user read access to something they must not see.
--
--   select tablename, policyname
--     from pg_policies
--    where schemaname = 'public'
--      and (qual like '%user_gym_ids%' or with_check like '%user_gym_ids%')
--    order by tablename, policyname;
--
-- The equivalent source-level check runs in the unit suite on every commit —
-- see src/lib/rlsBoundary.test.js, which reads these .sql files directly.
-- ─────────────────────────────────────────────────────────────────────────────
