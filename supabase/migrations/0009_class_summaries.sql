-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — class_summaries (N4, the member magic-link summary)
--
-- WHAT A MEMBER IS ALLOWED TO SEE, AND WHY IT NEEDS A TABLE.
-- class_instances (0007) records that a class HAPPENED — name, time, coach,
-- duration. It has never recorded what was IN it. The stages and movements live
-- in the coach's local draft and reach the server nowhere. So a summary built
-- only from class_instances can say "Sunset Flow, Thursday, 45 min" — which the
-- member already knows, because they were there. The thing worth opening a link
-- for is the work.
--
-- PUBLISHING IS AN ACT, NOT A SIDE EFFECT. A row appears here only when a coach
-- presses "Member link". It is not written by the background sync, and running
-- a class does not create one. That is the point: the gym decides what leaves
-- the building. It also means this table holds a strict SUBSET of what the app
-- knows, so the blast radius of the token in front of it is bounded by what a
-- human chose to publish.
--
-- NO MEMBER DATA. NOT NOW, NOT LATER.
-- `content` holds the class: stages, movements, durations. It must never hold
-- who attended, and the read path (Edge Function `summary-read`) must never
-- join to attendance or members. The token in front of this table is
-- CLASS-scoped precisely so that a leaked link exposes the gym's programming —
-- the same content the share card already publishes to Instagram — and cannot
-- be walked back to a person. Adding a member's name to `content` would turn a
-- link that gets pasted into group chats into a PDPA disclosure, and nothing in
-- the schema would stop it. This comment is the stop.
--
-- jsonb, not columns. Every alternative shape (a class_summary_stages table, an
-- exercises table) is a second schema for the thing src/data/library.js already
-- defines, and it would have to be migrated in step with a JSON structure the
-- client evolves freely. Nothing queries INSIDE this document — it is fetched
-- whole, by primary key, and rendered. There is also no CHECK constraint here
-- and that is deliberate: a constrained column rejecting a client value is this
-- repo's most expensive recurring bug, and a document with no enumerated
-- columns cannot have that failure.
--
-- ⚠️ THE APP MUST WORK WITHOUT THIS TABLE. Until this migration is run, the
-- Edge Function returns the class facts with no movement list and the page
-- renders fine. Nothing in the client's sync path touches this table, so an
-- unapplied 0009 cannot break class_instances the way a new CHECKed column on
-- an existing table would.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.class_summaries (
  -- The occurrence IS the identity: one published summary per class, and
  -- re-publishing replaces it rather than accumulating versions. A coach who
  -- fixes a typo and presses the button again must not mint a second link.
  class_instance_id uuid primary key references public.class_instances(id) on delete cascade,
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  -- { title, stages: [{ name, type, durMin, exercises: [{ n, s, r, rest }] }] }
  -- Shaped by src/lib/summaryContent.js, which is where the shape is pinned.
  content           jsonb not null default '{}'::jsonb,
  -- The gym's palette AS IT WAS when the class was published: { gymName, accent,
  -- bg, text, muted, card, border, display, body }.
  --
  -- A SNAPSHOT, deliberately, and resolved on the coach's device from the live
  -- CSS custom properties rather than looked up here. Two reasons. First, a gym
  -- that built a custom palette in Brand Studio has no entry in any preset table
  -- the server could read, so a server-side resolve would silently downgrade
  -- exactly the studios that cared most about their brand — the share card hit
  -- this and solved it the same way. Second, a link is a record of one night; a
  -- rebrand in March should not repaint a class a member did in January.
  brand             jsonb not null default '{}'::jsonb,
  published_at      timestamptz not null default now(),
  published_by      uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);
create index if not exists idx_class_summaries_gym
  on public.class_summaries(gym_id, published_at desc);

drop trigger if exists trg_class_summaries_updated on public.class_summaries;
create trigger trg_class_summaries_updated before update on public.class_summaries
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Active gym staff read and write their own gym's summaries. There is NO anon
-- policy and there must never be one: the member-facing read goes through the
-- `summary-read` Edge Function, which validates an HMAC and an expiry before it
-- touches Postgres with the service-role key. Loosening this to `anon` would
-- make every gym's programming world-readable by class id and delete the entire
-- reason the token exists. That is the standing rule in LEGAL §4, and this is
-- the table it was written about.
--
-- DELETE is allowed, unlike attendance and consent_records. Those are evidence;
-- this is publication. "Unpublish this class" has to be possible, and the row
-- carries no record anyone has a right to rely on.
alter table public.class_summaries enable row level security;

drop policy if exists class_summaries_rw on public.class_summaries;
create policy class_summaries_rw on public.class_summaries for all
  using      (public.is_platform_admin() or gym_id in (select public.user_gym_ids()))
  with check (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));
