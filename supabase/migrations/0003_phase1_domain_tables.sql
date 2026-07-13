-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — Phase 1 domain tables (store.js migration seam)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- Gives each src/lib/store.js domain (classes, library, brand/skin, history,
-- prefs incl. DJ settings) a Postgres home, scoped through the existing
-- tenant model from 0001 (gyms/memberships/profiles) and 0002 (is_gym_admin).
-- localStorage is demoted to an offline cache once store.js internals swap
-- to read/write these tables — no App.jsx call sites change in this migration;
-- that swap is the next step, after this schema is applied.
--
-- Reviewed 2026-07-13 against 0001/0002 and the live store.js call sites: every
-- referenced object exists, RLS follows the 0001/0002 patterns, and the column
-- shapes are faithful 1:1 mirrors of the localStorage payloads. Ready to apply.
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── class_schedule_rules ──────────────────────────────────────────────────
-- Mirrors getUserClasses()/saveUserClasses() (jungle_user_classes). These are
-- coach-authored recurring-class RULES (day/slot/repeat), not occurrences —
-- deliberately NOT named/shaped like the roadmap doc's future `class_instances`
-- (org_id, starts_at, coach_id), which is a single dated occurrence feeding
-- attendance (F4). Conflating the two now would force the wrong shape before
-- attendance capture exists. This table is the recurring-rule input that a
-- future `class_instances` generator would read.
create table if not exists public.class_schedule_rules (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  client_id  text not null,              -- app-generated `uc<ts>` id; preserves existing React keys
  name       text not null,
  class_type text not null,              -- was "type" in local shape
  coach      text,
  day        text,                       -- "Mon".."Sun"; irrelevant when repeat='daily'
  slot       text,                       -- "06:00" etc.
  dur        text,                       -- "45m" etc. — kept as text, matches local shape
  repeat     text not null default 'weekly' check (repeat in ('daily','weekly','once')),
  week_key   text,                       -- only set when repeat='once'
  fill       int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, client_id)
);
create index if not exists idx_class_schedule_rules_gym on public.class_schedule_rules(gym_id);

-- ── library_overrides ─────────────────────────────────────────────────────
-- Mirrors getLibraryCustom()/saveLibraryCustom()/resetLibraryCustom()
-- (jungle_library_custom). One jsonb blob per gym, matching the current
-- deep-merge-over-WORKOUT_LIBRARY shape exactly — NOT the roadmap doc's
-- normalized `exercises_custom` (org_id, name, media_ref, cues). Normalizing
-- requires decomposing WORKOUT_LIBRARY client-side first; that's a separate,
-- larger refactor. This table is the faithful 1:1 mirror so the store.js
-- swap lands without also rewriting the library screen's data shape.
create table if not exists public.library_overrides (
  gym_id     uuid primary key references public.gyms(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── brand_profiles ────────────────────────────────────────────────────────
-- Mirrors jungle_skin (reuses gyms.active_skin_id, already a column from
-- 0001 — no duplicate column here), jungle_custom_skin, and
-- jungle_gym_branding. One row per gym.
create table if not exists public.brand_profiles (
  gym_id             uuid primary key references public.gyms(id) on delete cascade,
  custom_skin_tokens jsonb,                          -- null unless activeSkinId === "custom"
  branding           jsonb not null default '{}'::jsonb,  -- logo/colors/fontFamily etc.
  updated_at         timestamptz not null default now()
);

-- ── session_history ───────────────────────────────────────────────────────
-- Mirrors getHistory()/saveHistory() (jungle_history). DECIDED 2026-07-13:
-- append-only — one immutable insert per completed session, capped to 100 at
-- read time (not the whole-array rewrite localStorage does today). Matches the
-- roadmap's "sessions never mutate" principle; the insert-only RLS below
-- enforces it. This changes the saveHistory(...) call-site contract during the
-- store.js swap: an append, not a full overwrite. Note also that the local
-- `ts` is epoch millis (Date.now()); convert with to_timestamp(ts/1000.0) when
-- the swap writes here (the column is timestamptz, not a bigint).
create table if not exists public.session_history (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  session_date date not null,
  name        text,
  stage_count int,
  dur_min     int,
  stage_types text[],
  ts          timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_session_history_gym_ts on public.session_history(gym_id, ts desc);

-- ── user_prefs ────────────────────────────────────────────────────────────
-- Mirrors jungle_disp_prefs, jungle_crossfade, jungle_tmpl_tracks,
-- jungle_exdb_key, and the dj_* DJ-deck settings. These were never gym-scoped
-- locally (just per-browser) — kept per-user here, not per-gym, to match
-- that reality. One row per user.
create table if not exists public.user_prefs (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  display_preset      text not null default 'full',
  display_font_scale  text not null default 'm',
  crossfade           int  not null default 0,
  exercise_db_key     text,
  template_tracks     jsonb not null default '{}'::jsonb,
  dj_energy           text not null default 'High',
  dj_bpm_min          int  not null default 120,
  dj_bpm_max          int  not null default 142,
  dj_transition       text not null default 'Beat-match',
  dj_follow_structure boolean not null default true,
  dj_take_requests    boolean not null default true,
  dj_clean_edits      boolean not null default true,
  updated_at          timestamptz not null default now()
);

-- ── updated_at maintenance ───────────────────────────────────────────────────
-- Keep updated_at trustworthy without relying on every writer to set it.
-- session_history is intentionally excluded — it's append-only (immutable).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_class_schedule_rules_updated on public.class_schedule_rules;
create trigger trg_class_schedule_rules_updated before update on public.class_schedule_rules
  for each row execute function public.set_updated_at();

drop trigger if exists trg_library_overrides_updated on public.library_overrides;
create trigger trg_library_overrides_updated before update on public.library_overrides
  for each row execute function public.set_updated_at();

drop trigger if exists trg_brand_profiles_updated on public.brand_profiles;
create trigger trg_brand_profiles_updated before update on public.brand_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_prefs_updated on public.user_prefs;
create trigger trg_user_prefs_updated before update on public.user_prefs
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.class_schedule_rules enable row level security;
alter table public.library_overrides    enable row level security;
alter table public.brand_profiles       enable row level security;
alter table public.session_history      enable row level security;
alter table public.user_prefs           enable row level security;

-- class_schedule_rules: any active member of the gym can read/write — matches
-- today's client behavior (no role gate exists yet in the Calendar UI).
-- Tightening to admin/coach-only once the UI actually gates it is a follow-up
-- (swap the `using`/`with check` gym_id clause below for is_gym_admin(gym_id)).
drop policy if exists class_schedule_rules_rw on public.class_schedule_rules;
create policy class_schedule_rules_rw on public.class_schedule_rules for all
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- library_overrides / brand_profiles: everyone in the gym reads (skin/library
-- affect what every screen renders); only gym admins/managers write — same
-- split 0002 uses for memberships/allowlist.
drop policy if exists library_overrides_read  on public.library_overrides;
drop policy if exists library_overrides_write on public.library_overrides;
create policy library_overrides_read on public.library_overrides for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy library_overrides_write on public.library_overrides for all
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

drop policy if exists brand_profiles_read  on public.brand_profiles;
drop policy if exists brand_profiles_write on public.brand_profiles;
create policy brand_profiles_read on public.brand_profiles for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy brand_profiles_write on public.brand_profiles for all
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

-- session_history: any active gym member reads (feeds gym-wide analytics
-- later); insert-only, and only as yourself — no update/delete, matching the
-- roadmap's "sessions never mutate" snapshot principle.
drop policy if exists session_history_read   on public.session_history;
drop policy if exists session_history_insert on public.session_history;
create policy session_history_read on public.session_history for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy session_history_insert on public.session_history for insert
  with check (
    (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
    and (user_id is null or user_id = auth.uid())
  );

-- user_prefs: strictly personal — read/write only your own row.
drop policy if exists user_prefs_rw on public.user_prefs;
create policy user_prefs_rw on public.user_prefs for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
