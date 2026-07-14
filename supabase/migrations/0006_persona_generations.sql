-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — Persona generation ledger (workstream D, chunk 2 follow-up: novelty)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- Records every class the persona-generate flow produced for a coach, so future
-- generations are AWARE of what has already been recommended and don't keep
-- suggesting the same structure/movements to the same coach (items 6–8). The
-- `movements` array + `plan` feed the "avoid these recent ones" context sent to
-- the LLM at generate time. Gym-scoped; member read + member write (any coach
-- logs their own recommendations — unlike the admin-curated corpus in 0005).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.persona_generations (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  persona_id  uuid not null references public.coach_personas(id) on delete cascade,
  class_type  text not null default '',
  category    text not null default 'mixed',   -- strength | conditioning | endurance | mixed
  title       text not null default '',
  focus       text not null default '',
  brief       jsonb not null default '{}'::jsonb,   -- the brief used (focus, duration, week X/N)
  movements   text[] not null default '{}',         -- canonical movement names used, for novelty checks
  plan        jsonb not null default '{}'::jsonb,    -- the generated { blocks:[...] }
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_persona_generations_persona on public.persona_generations(persona_id);
create index if not exists idx_persona_generations_gym on public.persona_generations(gym_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Any gym member reads AND writes their gym's ledger (a coach records the classes
-- they generate). Platform admins bypass. Mirrors the gym-scoping of 0005.
alter table public.persona_generations enable row level security;

drop policy if exists persona_generations_read  on public.persona_generations;
drop policy if exists persona_generations_write on public.persona_generations;
create policy persona_generations_read on public.persona_generations for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy persona_generations_write on public.persona_generations for all
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
