-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — brand_profiles.active_skin_id (store.js brand sync)
-- Run in Supabase: SQL Editor → paste → Run. Safe to re-run (idempotent).
--
-- 0003 planned to reuse gyms.active_skin_id for the active skin, but gyms has
-- only a SELECT policy (0001) — it's read-only under RLS, so the client can't
-- write the active skin there. Give brand_profiles its own column instead; the
-- existing admin-write RLS on brand_profiles (0003) already covers it, so
-- store.js saveSkinId() can sync with no new policy. gyms.active_skin_id stays
-- as the seed default and is simply no longer the write target.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brand_profiles add column if not exists active_skin_id text;
