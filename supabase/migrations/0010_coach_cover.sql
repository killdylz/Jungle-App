-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — coach roster, availability and cover requests (S30 §2.1–§2.3)
--
-- 🔴 UNAPPLIED, AND THE CLIENT DOES NOT WRITE TO IT. This file is written so
-- Dylan has the exact SQL (DYLAN-QUEUE A15) and so the shape is reviewable — it
-- is NOT wired up. `src/lib/store.js` writes the roster to localStorage only,
-- and `_classToRow` is unchanged. That is deliberate and it is the opposite of
-- an oversight: PostgREST rejects an upsert naming a column the database does
-- not have, and it rejects the WHOLE batch, so a client taught about these
-- tables before they exist would stop every class in the gym from syncing and
-- the ledger would only say "class_schedule_rules failed". Two migrations
-- (0005, 0006) are already unapplied; a third that the client depends on would
-- be the first one that breaks a working feature.
--
-- ⚠️ THE THING THIS MIGRATION IS FOR CANNOT WORK WITHOUT IT. A cover request is
-- the first feature in this product that is two people on two devices, so it is
-- the first that has no local-first version at all. Until this runs, the app
-- records a request on the device that raised it and NOTHING else — which is
-- what the UI says, in those words. See SESSION-HANDOFF.md §2.5.
--
-- ── Why the class still carries TEXT ─────────────────────────────────────────
-- There is deliberately no `coach_id` added to `class_schedule_rules`. A gym
-- that has typed coach names for a year must not have them rewritten, and the
-- link is resolved by name (`src/lib/coachRoster.js`, `coachKey`) against this
-- roster instead. That keeps the class row exactly as it is, so nothing about
-- the existing sync path changes, and an unlinked typed name stays a normal
-- state rather than becoming a foreign-key violation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── coach_roster ─────────────────────────────────────────────────────────────
-- The gym's coaching staff as the gym itself names them. One row per PERSON.
--
-- `user_id` is nullable and that is the normal state, not a gap to be filled: a
-- gym can name its coaches long before any of them has an account, and the
-- roster is useful in that state (it deduplicates the schedule and holds
-- availability). What a null `user_id` cannot do is RECEIVE anything, which is
-- why `coachReach()` in coachRoster.js reports three states and not two.
create table if not exists public.coach_roster (
  id         uuid primary key,             -- client-minted, so the local row keeps its id
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  name       text not null,
  -- Other spellings that mean this person. NEVER inferred: `coachKey` folds only
  -- case, whitespace and Unicode composition, and a gym adds "Mara K." to
  -- "Mara" by hand. Auto-merging two names silently reassigns someone's classes.
  aliases    text[] not null default '{}',
  -- set null, not cascade: a coach whose ACCOUNT is removed is still a person
  -- the gym's schedule refers to. Deleting their history is not what happened.
  user_id    uuid references public.profiles(id) on delete set null,
  active     boolean not null default true,
  -- Weekly recurring grid: { "Mon": ["06:00","18:00"], ... }. Same day and slot
  -- vocabulary as class_schedule_rules, so matching a coach to a class is a
  -- lookup and not a parse.
  availability      jsonb not null default '{}'::jsonb,
  -- 🔴 WHEN it was stated, which is half of what availability means. A claim
  -- from March about a coach who left in June is worse than no claim, so the
  -- client shows this date next to every grid and marks it stale past 56 days
  -- (COACH_AVAIL_STALE_DAYS). Nullable: a roster entry that has never stated
  -- availability is different from one that stated "nothing", and the UI says so.
  availability_at   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, id)
);
create index if not exists idx_coach_roster_gym on public.coach_roster(gym_id);
-- One account links to at most one roster entry per gym: two entries claiming
-- the same person is how a request gets sent twice, or to the wrong half.
create unique index if not exists idx_coach_roster_user
  on public.coach_roster(gym_id, user_id) where user_id is not null;

-- ── cover_requests ───────────────────────────────────────────────────────────
-- "I cannot teach this class; can someone take it." One row per ASK.
--
-- `class_client_id` rather than a FK to class_schedule_rules(id): the client
-- knows its own `uc<ts>` id and never learns the server's uuid, exactly as
-- `saveUserClasses` upserts on (gym_id, client_id). A FK would force a lookup
-- the offline path cannot do.
create table if not exists public.cover_requests (
  id            uuid primary key,          -- client-minted
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  class_client_id text not null,
  -- Denormalised ON PURPOSE. The request has to still make sense when the rule
  -- is edited or deleted underneath it — "Mon 06:00 Strength Lab" is what the
  -- recipient agreed to cover, and re-reading it from a since-changed rule would
  -- quietly restate the question after it was answered.
  class_label   text not null,
  class_day     text,
  class_slot    text,
  -- Who asked, and who is being asked. Roster ids, not profile ids: the roster
  -- is the gym's own naming of its staff and an entry may have no account.
  from_coach_id uuid references public.coach_roster(id) on delete set null,
  to_coach_id   uuid references public.coach_roster(id) on delete set null,
  -- MUST stay in step with COVER_STATUSES in src/lib/coverRequests.js — a CHECK
  -- rejecting a client value is this repo's recurring data-loss bug, guarded in
  -- src/lib/dbConstraints.test.js.
  status        text not null default 'open'
                  check (status in ('open','approved','rejected','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  -- When it stopped being open, and by whom. Null while open.
  settled_at    timestamptz,
  settled_by    uuid references public.profiles(id) on delete set null
);
create index if not exists idx_cover_requests_gym on public.cover_requests(gym_id, status, created_at desc);
create index if not exists idx_cover_requests_to  on public.cover_requests(to_coach_id, status);

-- 🔴 ONE APPROVAL PER REQUEST, decided by the DATABASE and not by the client.
-- Two coaches opening the same request on two phones and both pressing Approve
-- is not a rare case; it is the normal case for an urgent 5am ask. A client-side
-- "is it still open?" check cannot decide it, because both clients read `open`
-- and both are right at the moment they read.
--
-- The settle is therefore written as a CONDITIONAL update — the client sends
--
--     update cover_requests set status = 'approved', ...
--      where id = $1 and status = 'open'
--
-- and PostgREST returns the affected rows. A single-row UPDATE takes a row lock,
-- so the second writer blocks, re-evaluates `status = 'open'` against the
-- COMMITTED value, matches nothing, and gets an empty array back. The client
-- that lost is then TOLD it lost, rather than shown a success it did not get.
-- No unique index can express this: the constraint is on the TRANSITION, not on
-- any set of column values.
--
-- (The client half is `settleCover` in src/lib/coverRequests.js, which refuses
-- the same transition locally too — belt and braces, the same doubling as
-- `memberStatus` being applied in both the mapper and the updater.)

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.coach_roster    enable row level security;
alter table public.cover_requests  enable row level security;

drop policy if exists coach_roster_rw on public.coach_roster;
create policy coach_roster_rw on public.coach_roster for all
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));

-- Read and insert for any active member of the gym; UPDATE is allowed because
-- approving IS an update. There is deliberately no DELETE policy: a request that
-- was raised and answered is a record of who covered what, and the way to take
-- one back is `cancelled`, not a hole in the history.
drop policy if exists cover_requests_read   on public.cover_requests;
drop policy if exists cover_requests_insert on public.cover_requests;
drop policy if exists cover_requests_update on public.cover_requests;
create policy cover_requests_read on public.cover_requests for select
  using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy cover_requests_insert on public.cover_requests for insert
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
create policy cover_requests_update on public.cover_requests for update
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
