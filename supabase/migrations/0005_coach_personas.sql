-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — Coach personas + plan corpus (workstream D: persona-level planning)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- Persona-FIRST model (per the product decision): a persona is defined/chosen up
-- front, then historical class plans are CONNECTED to it (imported from Google
-- Slides, entered manually, or authored in Jungle). The persona's style_profile
-- is aggregated from its attached plans and used as LLM context at generation
-- time (RAG). Scoped through the existing gyms/RLS model (0001/0002).
--
-- DRAFT — not yet applied. Reviewing before landing. Extraction/generation Edge
-- Functions + the Slides connector are the next step, after this schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── coach_personas ───────────────────────────────────────────────────────────
-- The unit you choose before connecting data. kind lets one persona be a coach,
-- a class format, or a whole-facility "house" voice.
create table if not exists public.coach_personas (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  name          text not null,                 -- "Coach Mike", "The Garage — S360", "House Strength"
  kind          text not null default 'coach'  -- coach | format | house
                  check (kind in ('coach','format','house')),
  description   text,
  style_profile jsonb not null default '{}'::jsonb,  -- aggregated learned style (formats, conventions,
                                                     -- exercise frequency, rep/rest defaults, vocabulary)
  profile_updated_at timestamptz,               -- when style_profile was last recomputed from the corpus
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (gym_id, name)
);
create index if not exists idx_coach_personas_gym on public.coach_personas(gym_id);

-- ── persona_plans ────────────────────────────────────────────────────────────
-- The corpus: one row per historical/authored class plan, attached to a persona.
-- `plan` holds the normalized extraction ({ blocks:[{label, role, scheme, exercises[]}] })
-- — the exact shape proven on the six sample decks (S360 / GC / Enduro).
create table if not exists public.persona_plans (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  persona_id  uuid not null references public.coach_personas(id) on delete cascade,
  source      text not null default 'manual'   -- google_slides | manual | jungle
                check (source in ('google_slides','manual','jungle')),
  source_ref  text,                             -- slide/file id or URL, for re-sync + dedupe
  title       text,                             -- "S360 (Shoulder - Hypertrophy)"
  class_type  text,                             -- "S360" | "GC" | "Enduro" ...
  focus       text,                             -- "Shoulder — Hypertrophy"
  plan_date   date,
  plan        jsonb not null default '{}'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_persona_plans_persona on public.persona_plans(persona_id);
create index if not exists idx_persona_plans_gym on public.persona_plans(gym_id);
-- Dedupe re-imports of the same source deck into the same persona.
create unique index if not exists uq_persona_plans_source
  on public.persona_plans(persona_id, source, source_ref) where source_ref is not null;

-- ── updated_at trigger (reuses public.set_updated_at from 0003) ───────────────
drop trigger if exists trg_coach_personas_updated on public.coach_personas;
create trigger trg_coach_personas_updated before update on public.coach_personas
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Any gym member reads personas + plans (a coach browses the library / generates);
-- only gym admins/managers write (import + curate), matching library/brand in 0003.
alter table public.coach_personas enable row level security;
alter table public.persona_plans  enable row level security;

drop policy if exists coach_personas_read  on public.coach_personas;
drop policy if exists coach_personas_write on public.coach_personas;
create policy coach_personas_read on public.coach_personas for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy coach_personas_write on public.coach_personas for all
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));

drop policy if exists persona_plans_read  on public.persona_plans;
drop policy if exists persona_plans_write on public.persona_plans;
create policy persona_plans_read on public.persona_plans for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy persona_plans_write on public.persona_plans for all
  using      (public.is_platform_admin() or public.is_gym_admin(gym_id))
  with check (public.is_platform_admin() or public.is_gym_admin(gym_id));
