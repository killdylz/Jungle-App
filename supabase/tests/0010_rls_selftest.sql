-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — RLS self-test for migration 0010 (staff read boundary)
-- Run in Supabase: SQL Editor → paste → Run. Returns one PASS/FAIL row per check.
-- Safe: creates its own fixtures and DELETES them again before returning.
--
-- WHY THIS EXISTS
-- 0010 is the migration that makes a member-role account survivable. Before it,
-- any active membership — role included 'member' — could SELECT the whole gym.
-- An RLS failure is INVISIBLE from inside the app: the screens render, the sync
-- works, and another person's data is simply there. So the boundary is asserted
-- against a live database rather than inferred from reading the policies.
--
-- ── HOW IT GETS A MEMBER-ROLE USER, AND WHY IT DOES IT THIS WAY ──────────────
-- It does NOT create an auth user (auth.users' shape is Supabase's, not ours,
-- and writing there from a test is how a test starts breaking on upgrades). It
-- does NOT temporarily demote the real user's role either — if this script
-- errored midway, that would strand a live operator locked out of their own gym.
--
-- Instead it gives the EXISTING signed-in user a second membership, role
-- 'member', in a throwaway gym it creates and drops. One auth user, two gyms,
-- two roles. That is a sharper test than a role swap: it proves the boundary is
-- decided per MEMBERSHIP ROLE and not per user, which is the property the client
-- app actually rests on. And the worst case on an abort is an orphan gym row
-- named __rls0010_*, which is inert and trivially deleted.
--
-- What it asserts:
--   1-8   As a MEMBER of the throwaway gym: members, class_instances,
--         attendance, consent_records, class_schedule_rules, session_history,
--         retention_actions and coach_personas are all invisible.
--   9-10  …but the gym's own row and its brand_profiles ARE readable. That pair
--         is deliberate (the client app must resolve its studio and its skin),
--         and asserting it stops a future "tighten everything" pass from
--         silently breaking the member surface.
--   11-12 A member cannot INSERT into members or class_instances.
--   13-15 🔴 THE POSITIVE CONTROL. The same user, in the gym where they are
--         staff, still reads members and attendance and can still create a
--         class. Without these three, a database where the fixtures silently
--         failed to insert produces a clean sweep of PASSes and proves nothing —
--         which is the exact way this repo has been fooled before.
-- ─────────────────────────────────────────────────────────────────────────────

drop table if exists _rls0010_results;
create temp table _rls0010_results(seq int, check_name text, expected text, actual text, result text);

do $$
declare
  v_user uuid; v_gym uuid; v_role text; v_is_admin boolean;
  v_tmp_gym uuid; v_tmp_member uuid; v_tmp_ci uuid;
  v_own_member uuid; v_own_ci uuid;
  v_has_personas boolean := to_regclass('public.coach_personas') is not null;
  n int; ok boolean;
  out_rows jsonb := '[]'::jsonb;
begin
  -- ── Pick a STAFF user to impersonate (still superuser here; RLS not in play) ─
  select m.user_id, m.gym_id, m.role::text into v_user, v_gym, v_role
    from public.memberships m
   where m.status = 'active'
     and m.role in ('admin','manager','coach','frontdesk')
   limit 1;

  if v_user is null then
    insert into _rls0010_results values
      (0, 'preflight', 'an active staff membership', 'none found',
       'FAIL — sign in to the app once as staff so a membership exists, then re-run');
    return;
  end if;

  select coalesce(p.is_platform_admin, false) into v_is_admin
    from public.profiles p where p.id = v_user;

  -- ── Fixtures ───────────────────────────────────────────────────────────────
  -- A throwaway gym where this user is a MEMBER, fully populated.
  insert into public.gyms(name, active_skin_id)
    values ('__rls0010_member_scope', 'canopy') returning id into v_tmp_gym;
  insert into public.memberships(user_id, gym_id, role, status)
    values (v_user, v_tmp_gym, 'member', 'active');

  insert into public.brand_profiles(gym_id, branding)
    values (v_tmp_gym, '{"gymName":"__rls0010"}'::jsonb);
  insert into public.members(gym_id, name)
    values (v_tmp_gym, '__rls0010 Someone Else') returning id into v_tmp_member;
  insert into public.class_instances(gym_id, starts_at, name)
    values (v_tmp_gym, now(), '__rls0010 Class') returning id into v_tmp_ci;
  insert into public.attendance(gym_id, class_instance_id, member_id, source)
    values (v_tmp_gym, v_tmp_ci, v_tmp_member, 'coach');
  insert into public.consent_records(gym_id, member_id, scope, granted, policy_version, method)
    values (v_tmp_gym, v_tmp_member, 'roster_attendance', true, 'rls0010', 'notice');
  insert into public.class_schedule_rules(gym_id, client_id, name, class_type)
    values (v_tmp_gym, '__rls0010', '__rls0010 Rule', 'S360');
  insert into public.session_history(gym_id, session_date, name)
    values (v_tmp_gym, current_date, '__rls0010 History');
  insert into public.retention_actions(gym_id, member_id, rule, action)
    values (v_tmp_gym, v_tmp_member, 'absence', 'dismissed');
  if v_has_personas then
    execute 'insert into public.coach_personas(gym_id, name) values ($1, ''__rls0010 Persona'')'
      using v_tmp_gym;
  end if;

  -- The user's REAL gym, for the positive control.
  insert into public.members(gym_id, name)
    values (v_gym, '__rls0010 Own Member') returning id into v_own_member;
  insert into public.class_instances(gym_id, starts_at, name)
    values (v_gym, now(), '__rls0010 Own Class') returning id into v_own_ci;
  insert into public.attendance(gym_id, class_instance_id, member_id, source)
    values (v_gym, v_own_ci, v_own_member, 'coach');

  -- ── Become the app user. Everything below runs under RLS. ──────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    -- 1-8 · as a MEMBER of the throwaway gym, the gym's data is invisible ------
    select count(*) into n from public.members where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',1,'name','members: invisible to a member-role account',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin (sees all gyms by design)'
           when n = 0 then 'PASS' else 'FAIL — ROSTER LEAK: a client can read every member and email' end);

    select count(*) into n from public.class_instances where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',2,'name','class_instances: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK' end);

    select count(*) into n from public.attendance where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',3,'name','attendance: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK: every check-in by every member' end);

    select count(*) into n from public.consent_records where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',4,'name','consent_records: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK: consent history is not theirs to read' end);

    select count(*) into n from public.class_schedule_rules where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',5,'name','class_schedule_rules: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK' end);

    select count(*) into n from public.session_history where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',6,'name','session_history: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK' end);

    select count(*) into n from public.retention_actions where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',7,'name','retention_actions: invisible to a member',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — LEAK' end);

    if v_has_personas then
      execute 'select count(*) from public.coach_personas where gym_id = $1' into n using v_tmp_gym;
      out_rows := out_rows || jsonb_build_object('seq',8,'name','coach_personas: invisible to a member',
        'exp','0 rows','act',n||' rows','res',
        case when v_is_admin then 'SKIP — platform admin'
             when n = 0 then 'PASS' else 'FAIL — LEAK: the coach''s programming corpus' end);
    else
      out_rows := out_rows || jsonb_build_object('seq',8,'name','coach_personas: invisible to a member',
        'exp','0 rows','act','table absent','res','SKIP — 0005 not applied yet');
    end if;

    -- 9-10 · …but the gym's IDENTITY is readable. This pair is deliberate. -----
    select count(*) into n from public.gyms where id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',9,'name','gyms: own gym row IS readable by a member',
      'exp','1 row','act',n||' rows','res',
      case when n = 1 then 'PASS'
           else 'FAIL — the client app cannot resolve which studio it belongs to' end);

    select count(*) into n from public.brand_profiles where gym_id = v_tmp_gym;
    out_rows := out_rows || jsonb_build_object('seq',10,'name','brand_profiles: skin IS readable by a member',
      'exp','1 row','act',n||' rows','res',
      case when n = 1 then 'PASS'
           else 'FAIL — the client app cannot wear the gym''s brand (F6)' end);

    -- 11-12 · a member cannot write ------------------------------------------
    ok := false;
    begin
      insert into public.members(gym_id, name) values (v_tmp_gym, '__rls0010 Injected');
      ok := false;
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',11,'name','members: INSERT rejected for a member',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when v_is_admin then 'SKIP — platform admin'
                  when ok then 'PASS' else 'FAIL — a client can add roster rows' end);

    ok := false;
    begin
      insert into public.class_instances(gym_id, starts_at, name)
        values (v_tmp_gym, now(), '__rls0010 Injected Class');
      ok := false;
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',12,'name','class_instances: INSERT rejected for a member',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when v_is_admin then 'SKIP — platform admin'
                  when ok then 'PASS' else 'FAIL — a client can create classes' end);

    -- 13-15 · 🔴 POSITIVE CONTROL — the same user, where they are staff --------
    -- If these fail, 0010 did not harden the boundary; it broke the product.
    -- If they were absent, every PASS above would also be produced by a database
    -- where the fixtures never inserted.
    select count(*) into n from public.members where gym_id = v_gym;
    out_rows := out_rows || jsonb_build_object('seq',13,'name','CONTROL · staff still reads their own gym''s roster',
      'exp','1 or more rows','act',n||' rows','res',
      case when n > 0 then 'PASS' else 'FAIL — 0010 LOCKED STAFF OUT (or fixtures never landed)' end);

    select count(*) into n from public.attendance where gym_id = v_gym;
    out_rows := out_rows || jsonb_build_object('seq',14,'name','CONTROL · staff still reads their own gym''s attendance',
      'exp','1 or more rows','act',n||' rows','res',
      case when n > 0 then 'PASS' else 'FAIL — 0010 LOCKED STAFF OUT (or fixtures never landed)' end);

    ok := true;
    begin
      insert into public.class_instances(gym_id, starts_at, name)
        values (v_gym, now(), '__rls0010 Control Class');
    exception when others then ok := false;
    end;
    out_rows := out_rows || jsonb_build_object('seq',15,'name','CONTROL · staff can still create a class',
      'exp','insert succeeds','act', case when ok then 'succeeded' else 'rejected' end,
      'res', case when ok then 'PASS' else 'FAIL — 0010 BROKE THE RUNNER' end);

  exception when others then
    out_rows := out_rows || jsonb_build_object('seq',99,'name','unexpected error',
      'exp','no error','act',SQLERRM,'res','FAIL');
  end;

  -- ── Back to superuser: flush results, then remove every fixture ────────────
  execute 'reset role';

  insert into _rls0010_results(seq, check_name, expected, actual, result)
  select (r->>'seq')::int, r->>'name', r->>'exp', r->>'act', r->>'res'
    from jsonb_array_elements(out_rows) r;

  -- The throwaway gym cascades its membership and every fixture inside it.
  delete from public.gyms where id = v_tmp_gym;
  -- The real gym's fixtures are named, so they go individually. Deleting the
  -- member cascades its attendance; the control class is matched by name.
  delete from public.members where id = v_own_member;
  delete from public.class_instances where gym_id = v_gym and name like '__rls0010%';
end $$;

select check_name, expected, actual, result
  from _rls0010_results
 order by seq;
