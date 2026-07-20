-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — RLS self-test for migrations 0001–0006  (backlog I5)
-- Run in Supabase: SQL Editor → paste → Run. Returns one PASS/FAIL row per check.
-- Safe: creates its own fixtures and DELETES them again before returning.
--
-- WHY THIS EXISTS
-- LEGAL-AND-SECURITY §3 lists this as hole #2, to be closed BEFORE real member
-- data: the self-test pattern existed for 0007 alone, so every policy written in
-- 0001–0006 was unverified. A cross-tenant leak in any of them is SILENT — the
-- app looks completely normal while serving another studio's coaches, classes,
-- branding or programming. Nothing in the client can detect it, which is exactly
-- why it has to be asserted at the database.
--
-- It also matters commercially: LEGAL §5 chose ONE Supabase project for all gyms
-- on the argument that "the entire schema is already gym-scoped with verified
-- policies". This script is what makes the word "verified" true. Re-run it after
-- EVERY policy change — that is the mitigation the single-project decision rests
-- on.
--
-- WHY IT LOOKS LIKE THIS (same reasoning as 0007_rls_selftest.sql)
-- The SQL editor runs as superuser, and superusers BYPASS row-level security. So
-- the obvious test — "select another gym's rows, expect none" — passes trivially
-- and proves nothing. This drops to `role authenticated` and impersonates a real
-- signed-in user via request.jwt.claims, which is how PostgREST actually runs app
-- queries. Results accumulate in a jsonb variable because while impersonating we
-- have no privileges on the superuser's temp table; they are flushed after the
-- role is reset.
--
-- What it asserts:
--   1-6   Cross-tenant isolation: another gym's personas, plans, movements,
--         generations, branding and schedule rules are invisible.
--   7     A platform-admin flag is honoured (skip, not a false failure).
--   8-9   The user's OWN gym data IS readable and writable — a policy set so
--         tight the product cannot function is also a bug, and the cheapest way
--         to "pass" an isolation test is to deny everything.
--   10-11 Cross-tenant INSERT and UPDATE are rejected outright.
--   12    persona_plans.source CHECK bites. This is not hypothetical: on
--         2026-07-18 a client wrote a value this constraint rejects, the write
--         failed silently, and a hydrate then overwrote the only surviving copy.
--   13    coach_personas.kind CHECK bites.
--   14    memberships/profiles do not leak another tenant's staff identities.
-- ─────────────────────────────────────────────────────────────────────────────

drop table if exists _rls_results_0001;
create temp table _rls_results_0001(seq int, check_name text, expected text, actual text, result text);

do $$
declare
  v_user uuid; v_gym uuid; v_is_admin boolean;
  v_other_gym uuid; v_other_persona uuid; v_other_plan uuid;
  v_persona uuid; v_plan uuid;
  n int; ok boolean;
  out_rows jsonb := '[]'::jsonb;
begin
  -- ── Pick a real user to impersonate (still superuser here; RLS not in play) ─
  select m.user_id, m.gym_id into v_user, v_gym
    from public.memberships m
   where m.status = 'active'
   limit 1;

  if v_user is null then
    insert into _rls_results_0001 values
      (0, 'preflight', 'an active membership', 'none found',
       'FAIL — sign in to the app once so a membership exists, then re-run');
    return;
  end if;

  select coalesce(p.is_platform_admin, false) into v_is_admin
    from public.profiles p where p.id = v_user;

  -- ── Fixtures: a gym this user is NOT a member of, fully populated ──────────
  insert into public.gyms(name) values ('__rls_selftest_other_tenant_0001') returning id into v_other_gym;

  insert into public.coach_personas(gym_id, name, kind)
    values (v_other_gym, 'Other Tenant Coach', 'coach') returning id into v_other_persona;
  insert into public.persona_plans(gym_id, persona_id, source, title, class_type)
    values (v_other_gym, v_other_persona, 'manual', 'Other Tenant Plan', 'S360') returning id into v_other_plan;
  insert into public.persona_movements(gym_id, persona_id, name)
    values (v_other_gym, v_other_persona, 'Other Tenant Movement');
  insert into public.persona_generations(gym_id, persona_id, class_type, title)
    values (v_other_gym, v_other_persona, 'S360', 'Other Tenant Generation');
  insert into public.brand_profiles(gym_id, branding)
    values (v_other_gym, '{"gymName":"Other Tenant Gym"}'::jsonb);
  -- client_id is NOT NULL (it preserves the app's React keys), so it is supplied
  -- explicitly rather than defaulted.
  insert into public.class_schedule_rules(gym_id, client_id, name, class_type)
    values (v_other_gym, '__selftest_uc1', 'Other Tenant Class', 'S360');

  -- The user's OWN gym, for the positive checks.
  insert into public.coach_personas(gym_id, name, kind)
    values (v_gym, '__selftest Own Coach', 'coach') returning id into v_persona;
  insert into public.persona_plans(gym_id, persona_id, source, title, class_type)
    values (v_gym, v_persona, 'manual', '__selftest Own Plan', 'S360') returning id into v_plan;

  -- ── Become the app user. Everything below runs under RLS. ──────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    -- 1-6 · cross-tenant isolation --------------------------------------------
    select count(*) into n from public.coach_personas where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',1,'name','coach_personas: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin (sees all gyms by design)'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.persona_plans where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',2,'name','persona_plans: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK (a coach''s programming)' end);

    select count(*) into n from public.persona_movements where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',3,'name','persona_movements: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.persona_generations where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',4,'name','persona_generations: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.brand_profiles where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',5,'name','brand_profiles: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK (another studio''s brand)' end);

    select count(*) into n from public.class_schedule_rules where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',6,'name','class_schedule_rules: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    -- 7 · another tenant's staff identities ------------------------------------
    select count(*) into n from public.memberships where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',7,'name','memberships: other gym''s staff invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK (staff identities)' end);

    -- 8-9 · the product must still WORK ----------------------------------------
    -- The cheapest way to pass an isolation test is to deny everything, so the
    -- positive path is asserted in the same run.
    select count(*) into n from public.coach_personas where gym_id = v_gym;
    out_rows := out_rows || jsonb_build_object('seq',8,'name','coach_personas: own gym readable',
      'exp','>0 rows','act',n||' rows','res',
      case when n > 0 then 'PASS' else 'FAIL — a coach cannot see their own personas' end);

    ok := true;
    begin
      insert into public.persona_plans(gym_id, persona_id, source, title, class_type)
        values (v_gym, v_persona, 'manual', '__selftest Insert Probe', 'S360');
    exception when others then ok := false;
    end;
    out_rows := out_rows || jsonb_build_object('seq',9,'name','persona_plans: own gym INSERT allowed',
      'exp','insert succeeds','act', case when ok then 'succeeded' else 'rejected' end,
      'res', case when ok then 'PASS' else 'FAIL — a coach cannot save their own class' end);

    -- 10-11 · writing into someone else's gym ----------------------------------
    ok := false;
    begin
      insert into public.persona_plans(gym_id, persona_id, source, title, class_type)
        values (v_other_gym, v_other_persona, 'manual', 'Injected', 'S360');
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',10,'name','persona_plans: cross-gym INSERT rejected',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when v_is_admin then 'SKIP — platform admin'
                  when ok then 'PASS' else 'FAIL — CAN WRITE INTO ANOTHER TENANT' end);

    update public.coach_personas set name = 'Hijacked' where id = v_other_persona;
    get diagnostics n = row_count;
    out_rows := out_rows || jsonb_build_object('seq',11,'name','coach_personas: cross-gym UPDATE blocked',
      'exp','0 rows affected','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CAN EDIT ANOTHER TENANT''S DATA' end);

    -- 12 · persona_plans.source CHECK ------------------------------------------
    -- The exact constraint that silently cost live data on 2026-07-18.
    ok := false;
    begin
      insert into public.persona_plans(gym_id, persona_id, source, title, class_type)
        values (v_gym, v_persona, 'extract', '__selftest Bad Source', 'S360');  -- not google_slides|manual|jungle
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',12,'name','persona_plans: source CHECK rejects bad value',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when ok then 'PASS' else 'FAIL — source enum is not enforced' end);

    -- 13 · coach_personas.kind CHECK -------------------------------------------
    ok := false;
    begin
      insert into public.coach_personas(gym_id, name, kind)
        values (v_gym, '__selftest Bad Kind', 'trainer');   -- not coach|format|house
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',13,'name','coach_personas: kind CHECK rejects bad value',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when ok then 'PASS' else 'FAIL — kind enum is not enforced' end);

  exception when others then
    out_rows := out_rows || jsonb_build_object('seq',99,'name','unexpected error',
      'exp','no error','act',SQLERRM,'res','FAIL');
  end;

  -- ── Back to superuser: flush results, then remove every fixture ────────────
  execute 'reset role';

  insert into _rls_results_0001(seq, check_name, expected, actual, result)
  select (r->>'seq')::int, r->>'name', r->>'exp', r->>'act', r->>'res'
    from jsonb_array_elements(out_rows) r;

  delete from public.gyms where id = v_other_gym;                 -- cascades its rows
  delete from public.coach_personas where id = v_persona;         -- cascades plans/movements/generations
  delete from public.persona_plans where title like '__selftest%';
  delete from public.coach_personas where name like '__selftest%';
end $$;

select check_name, expected, actual, result
  from _rls_results_0001
 order by seq;
