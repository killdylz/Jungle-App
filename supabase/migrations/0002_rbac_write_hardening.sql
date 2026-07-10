-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — RBAC write hardening (RLS)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- Problem this fixes: 0001's memberships_rw / allowlist_rw policies let ANY
-- active member of a gym read AND write memberships and allowlist entries — the
-- only check was gym_id, not role. So a coach could invite people or change
-- roles via the API even though the UI hides the Team screen from them.
--
-- This splits read vs. write and restricts writes (and sensitive reads) to gym
-- admins/managers — matching the app's can("members:manage") gate.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is the current user an admin or manager of the given gym?
-- SECURITY DEFINER (owned by a superuser in Supabase) so the internal read of
-- memberships bypasses RLS — same pattern as user_gym_ids() / is_platform_admin()
-- in 0001, so it does not recurse against the policies below.
create or replace function public.is_gym_admin(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and gym_id  = p_gym
      and status  = 'active'
      and role in ('admin','manager')
  );
$$;

-- ── memberships ──────────────────────────────────────────────────────────────
-- Read: yourself, or any membership in a gym you administer (for the Team screen).
-- Write: platform admin or gym admin/manager only.
drop policy if exists memberships_rw     on public.memberships;
drop policy if exists memberships_read   on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_read on public.memberships for select
  using (public.is_platform_admin() or user_id = auth.uid() or public.is_gym_admin(gym_id));

create policy memberships_insert on public.memberships for insert
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

create policy memberships_update on public.memberships for update
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

create policy memberships_delete on public.memberships for delete
  using (public.is_platform_admin() or public.is_gym_admin(gym_id));

-- ── allowlist_entries ────────────────────────────────────────────────────────
-- Invite data is admin-only for both read and write.
drop policy if exists allowlist_rw     on public.allowlist_entries;
drop policy if exists allowlist_read   on public.allowlist_entries;
drop policy if exists allowlist_insert on public.allowlist_entries;
drop policy if exists allowlist_update on public.allowlist_entries;
drop policy if exists allowlist_delete on public.allowlist_entries;

create policy allowlist_read on public.allowlist_entries for select
  using (public.is_platform_admin() or public.is_gym_admin(gym_id));

create policy allowlist_insert on public.allowlist_entries for insert
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

create policy allowlist_update on public.allowlist_entries for update
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

create policy allowlist_delete on public.allowlist_entries for delete
  using (public.is_platform_admin() or public.is_gym_admin(gym_id));

-- Note: signup still works — handle_new_user() is SECURITY DEFINER and bypasses
-- these policies when it resolves the allowlist and creates the first membership.
