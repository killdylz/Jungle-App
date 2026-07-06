-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — Auth & Multi-Tenant Foundation (RBAC-SPEC §7)
-- Run this in your Supabase project: SQL Editor → paste → Run.
-- Supabase manages auth.users; this adds the app's tenant + membership model
-- with row-level security so every gym's data is isolated.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type membership_role as enum ('admin','coach','manager','frontdesk','member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_kind as enum ('email','domain');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entity_status as enum ('active','suspended','revoked','past_due','canceled');
exception when duplicate_object then null; end $$;

-- ── Tables ───────────────────────────────────────────────────────────────────

-- Gym = the tenant.
create table if not exists public.gyms (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique,
  active_skin_id text,
  created_at     timestamptz not null default now()
);

create table if not exists public.locations (
  id       uuid primary key default gen_random_uuid(),
  gym_id   uuid not null references public.gyms(id) on delete cascade,
  name     text not null,
  address  text
);

-- Profile = one identity (mirrors auth.users). is_platform_admin = L0.
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  name              text,
  is_platform_admin boolean not null default false,
  status            text not null default 'active',
  created_at        timestamptz not null default now()
);

-- Membership = a user's access to one gym (role + per-user permission overrides).
create table if not exists public.memberships (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  role           membership_role not null default 'coach',
  permissions    jsonb not null default '{"grant":[],"deny":[]}'::jsonb,
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  last_active_at timestamptz,
  unique (user_id, gym_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_gym  on public.memberships(gym_id);

-- Allowlist = the master gate. No membership is created unless an entry matches.
create table if not exists public.allowlist_entries (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  match       text not null,            -- "coach@gym.com" or "@gym.com"
  kind        entry_kind not null,
  role        membership_role not null default 'coach',
  status      entity_status not null default 'active',
  invited_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_allowlist_gym on public.allowlist_entries(gym_id);

create table if not exists public.subscriptions (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references public.gyms(id) on delete cascade,
  plan      text not null default 'starter',   -- starter | studio | chain
  seats     int  not null default 3,
  status    entity_status not null default 'active',
  renews_at timestamptz
);

create table if not exists public.audit_events (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references public.gyms(id) on delete cascade,
  actor_id  uuid references public.profiles(id),
  action    text not null,
  entity    text,
  entity_id text,
  before    jsonb,
  after     jsonb,
  ts        timestamptz not null default now()
);
create index if not exists idx_audit_gym on public.audit_events(gym_id);

-- ── Helper: gyms the current user belongs to (for RLS) ───────────────────────
create or replace function public.user_gym_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select gym_id from public.memberships where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- ── Signup → allowlist resolution ────────────────────────────────────────────
-- On new auth user: create a profile, then for every matching ACTIVE allowlist
-- entry (specific email beats domain), ensure a membership with that role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text := '@' || split_part(new.email, '@', 2);
  v_entry  record;
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  -- Specific-email entries first, then domain entries.
  for v_entry in
    select * from public.allowlist_entries
    where status = 'active' and (
      (kind = 'email'  and lower(match) = lower(new.email)) or
      (kind = 'domain' and lower(match) = lower(v_domain))
    )
    order by (kind = 'email') desc
  loop
    insert into public.memberships (user_id, gym_id, role)
    values (new.id, v_entry.gym_id, v_entry.role)
    on conflict (user_id, gym_id) do nothing;
    update public.allowlist_entries set last_used_at = now() where id = v_entry.id;
  end loop;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.gyms              enable row level security;
alter table public.locations         enable row level security;
alter table public.profiles          enable row level security;
alter table public.memberships       enable row level security;
alter table public.allowlist_entries enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.audit_events      enable row level security;

-- Gyms: members can read their gym; platform admin reads all.
drop policy if exists gyms_read on public.gyms;
create policy gyms_read on public.gyms for select
  using (public.is_platform_admin() or id in (select public.user_gym_ids()));

-- Profiles: read own + profiles who share a gym with you.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (
    public.is_platform_admin()
    or id = auth.uid()
    or id in (select user_id from public.memberships where gym_id in (select public.user_gym_ids()))
  );
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid());

-- Memberships / allowlist / subscriptions / audit / locations: scoped to your gyms.
drop policy if exists memberships_rw on public.memberships;
create policy memberships_rw on public.memberships for all
  using (public.is_platform_admin() or user_id = auth.uid() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

drop policy if exists allowlist_rw on public.allowlist_entries;
create policy allowlist_rw on public.allowlist_entries for all
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

drop policy if exists locations_rw on public.locations;
create policy locations_rw on public.locations for all
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- ── SEED (edit the email, then it's safe to re-run) ──────────────────────────
-- Creates your first gym + allowlists YOUR email as its admin, so your first
-- login is granted admin automatically. Change 'owner@example.com' below.
do $$
declare v_gym uuid;
begin
  select id into v_gym from public.gyms where slug = 'jungle-gym';
  if v_gym is null then
    insert into public.gyms (name, slug, active_skin_id) values ('Jungle Gym','jungle-gym','canopy') returning id into v_gym;
    insert into public.subscriptions (gym_id, plan, seats) values (v_gym, 'studio', 10);
  end if;

  insert into public.allowlist_entries (gym_id, match, kind, role)
  select v_gym, 'owner@example.com', 'email', 'admin'
  where not exists (
    select 1 from public.allowlist_entries where gym_id = v_gym and lower(match) = lower('owner@example.com')
  );
end $$;
