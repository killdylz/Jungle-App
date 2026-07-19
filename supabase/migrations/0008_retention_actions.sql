-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — retention_actions (N3)
--
-- The at-risk rules engine (src/lib/retention.js) has shipped since 73068dc with
-- no surface. This table is what lets the surface be more than a wall-chart: it
-- records what the operator DID about a flag.
--
-- That is not a nicety. A3 — "do operators act on alerts?" — is one of the
-- assumptions the whole retention thesis rests on, and without recorded actions
-- it is unmeasurable: we would be shipping an alert screen and guessing whether
-- anyone used it.
--
-- APPEND-ONLY, following consent_records in 0007 and for the same reason. The
-- obvious design is a mutable `dismissed` boolean on a flag; it is wrong. The
-- question is not "is this flag dismissed" but "was it acted on, by whom, and
-- how long after it fired" — and an UPDATE-in-place destroys exactly that. Each
-- row here is an EVENT; current state is the latest row per (member, rule).
--
-- Re-flagging is deliberately NOT modelled here. Whether an actioned flag comes
-- back is a product judgement that belongs in code where it can be read and
-- tested (applyRetentionActions: an action holds until the member is seen
-- again), not frozen into schema.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.retention_actions (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  -- Cascade on member delete, exactly as attendance does: an erasure request must
  -- actually remove the person's trail, and "append-only" constrains what users
  -- may do through the API, not what a lawful erasure does to the row.
  member_id   uuid not null references public.members(id) on delete cascade,
  -- Which rule fired. MUST stay in step with RETENTION_RULES in
  -- src/lib/retention.js — a CHECK constraint rejecting a client value is this
  -- repo's recurring data-loss bug (three occurrences), so those strings live in
  -- one exported constant with a unit test pinning them.
  rule        text not null
                check (rule in ('new_member_low_visits','absence')),
  -- What the operator did. `reopened` exists so an action can be taken back
  -- without deleting the record of having taken it — undo must be an event too,
  -- or the ledger quietly becomes editable.
  action      text not null
                check (action in ('acted','dismissed','reopened')),
  note        text,                        -- optional: "called, coming Thursday"
  occurred_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_retention_actions_member
  on public.retention_actions(member_id, rule, occurred_at desc);
create index if not exists idx_retention_actions_gym
  on public.retention_actions(gym_id, occurred_at desc);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Read + INSERT for any active gym member; deliberately NO update and NO delete
-- policy. With RLS enabled and no policy for a command, that command matches
-- zero rows for every non-superuser — the same shape attendance and
-- consent_records use, and what makes "the operator acted" a claim rather than
-- an assertion.
alter table public.retention_actions enable row level security;

drop policy if exists retention_actions_read   on public.retention_actions;
drop policy if exists retention_actions_insert on public.retention_actions;
create policy retention_actions_read on public.retention_actions for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy retention_actions_insert on public.retention_actions for insert
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
