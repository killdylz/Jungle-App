-- ─────────────────────────────────────────────────────────────────────────────
-- Jungle — RLS self-test for migration 0007 (attendance spine)
-- Run in Supabase: SQL Editor → paste → Run. Returns one PASS/FAIL row per check.
-- Safe: creates its own fixtures and DELETES them again before returning.
--
-- WHY THIS EXISTS, AND WHY IT LOOKS THE WAY IT DOES
--
-- The Supabase SQL editor runs as a superuser, and superusers BYPASS row-level
-- security. So the obvious version of this test — "select another gym's rows and
-- check you get nothing" — passes trivially and proves nothing at all. This script
-- therefore drops to `role authenticated` and impersonates a real signed-in user
-- via request.jwt.claims, which is how PostgREST actually executes app queries.
--
-- Results are accumulated in a jsonb variable rather than written straight to a
-- table: while impersonating `authenticated` we have no privileges on a temp table
-- the superuser created, so writing as we go would abort the run instead of
-- reporting it. They're flushed to the temp table after the role is reset.
--
-- What it asserts:
--   1-4  Cross-tenant isolation — another gym's members / classes / attendance /
--        consent are invisible. A leak here is SILENT; the app looks entirely
--        normal while serving another studio's roster.
--   5    An ordinary gym member CAN record attendance (policies aren't so tight
--        that F4 cannot function).
--   6-9  attendance and consent_records are genuinely APPEND-ONLY: update and
--        delete affect zero rows because no such policy exists. This is what makes
--        a retention number defensible rather than merely asserted.
--   10   A cross-tenant INSERT is rejected outright.
--   11   The `source` CHECK rejects an illegal value — the constraint class that,
--        on persona_plans.source, silently cost live data on 2026-07-18.
-- ─────────────────────────────────────────────────────────────────────────────

drop table if exists _rls_results;
create temp table _rls_results(seq int, check_name text, expected text, actual text, result text);

do $$
declare
  v_user uuid; v_gym uuid; v_is_admin boolean;
  v_other_gym uuid; v_other_member uuid; v_other_ci uuid;
  v_member uuid; v_member2 uuid; v_member3 uuid; v_ci uuid; v_att uuid;
  n int; ok boolean;
  -- PL/pgSQL variable assignments survive a subtransaction rollback, so results
  -- recorded before an unexpected error are still reported rather than lost.
  out_rows jsonb := '[]'::jsonb;
begin
  -- ── Pick a real user to impersonate (still superuser here; RLS not in play) ─
  select m.user_id, m.gym_id into v_user, v_gym
    from public.memberships m
   where m.status = 'active'
   limit 1;

  if v_user is null then
    insert into _rls_results values
      (0, 'preflight', 'an active membership', 'none found',
       'FAIL — sign in to the app once so a membership exists, then re-run');
    return;
  end if;

  select coalesce(p.is_platform_admin, false) into v_is_admin
    from public.profiles p where p.id = v_user;

  -- ── Fixtures ───────────────────────────────────────────────────────────────
  -- A gym this user is NOT a member of, fully populated.
  insert into public.gyms(name) values ('__rls_selftest_other_tenant') returning id into v_other_gym;
  insert into public.members(gym_id, name) values (v_other_gym, 'Other Tenant Member') returning id into v_other_member;
  insert into public.class_instances(gym_id, starts_at, name) values (v_other_gym, now(), 'Other Tenant Class') returning id into v_other_ci;
  insert into public.attendance(gym_id, class_instance_id, member_id, source)
    values (v_other_gym, v_other_ci, v_other_member, 'coach');
  insert into public.consent_records(gym_id, member_id, scope, granted, policy_version, method)
    values (v_other_gym, v_other_member, 'roster_attendance', true, 'selftest', 'notice');

  -- The user's OWN gym, for the positive and immutability checks.
  insert into public.members(gym_id, name) values (v_gym, '__selftest Member A') returning id into v_member;
  insert into public.members(gym_id, name) values (v_gym, '__selftest Member B') returning id into v_member2;
  insert into public.members(gym_id, name) values (v_gym, '__selftest Member C') returning id into v_member3;
  insert into public.class_instances(gym_id, starts_at, name) values (v_gym, now(), '__selftest Class') returning id into v_ci;
  insert into public.attendance(gym_id, class_instance_id, member_id, source)
    values (v_gym, v_ci, v_member, 'coach') returning id into v_att;
  insert into public.consent_records(gym_id, member_id, scope, granted, policy_version, method)
    values (v_gym, v_member, 'roster_attendance', true, 'selftest', 'notice');

  -- ── Become the app user. Everything below runs under RLS. ──────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    -- 1-4 · cross-tenant isolation -------------------------------------------
    select count(*) into n from public.members where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',1,'name','members: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — this user is a platform admin (sees all gyms by design)'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.class_instances where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',2,'name','class_instances: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.attendance where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',3,'name','attendance: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    select count(*) into n from public.consent_records where gym_id = v_other_gym;
    out_rows := out_rows || jsonb_build_object('seq',4,'name','consent_records: other gym invisible',
      'exp','0 rows','act',n||' rows','res',
      case when v_is_admin then 'SKIP — platform admin'
           when n = 0 then 'PASS' else 'FAIL — CROSS-TENANT LEAK' end);

    -- 5 · a normal gym member can actually record attendance ------------------
    ok := true;
    begin
      insert into public.attendance(gym_id, class_instance_id, member_id, source)
        values (v_gym, v_ci, v_member2, 'coach');
    exception when others then ok := false;
    end;
    out_rows := out_rows || jsonb_build_object('seq',5,'name','attendance: own-gym INSERT allowed',
      'exp','insert succeeds','act', case when ok then 'succeeded' else 'rejected' end,
      'res', case when ok then 'PASS' else 'FAIL — F4 cannot record check-ins' end);

    -- 6-7 · attendance is append-only -----------------------------------------
    update public.attendance set source = 'import' where id = v_att;
    get diagnostics n = row_count;
    out_rows := out_rows || jsonb_build_object('seq',6,'name','attendance: UPDATE blocked',
      'exp','0 rows affected','act',n||' rows','res',
      case when n = 0 then 'PASS' else 'FAIL — ATTENDANCE IS MUTABLE' end);

    delete from public.attendance where id = v_att;
    get diagnostics n = row_count;
    out_rows := out_rows || jsonb_build_object('seq',7,'name','attendance: DELETE blocked',
      'exp','0 rows affected','act',n||' rows','res',
      case when n = 0 then 'PASS' else 'FAIL — ATTENDANCE IS DELETABLE' end);

    -- 8-9 · consent ledger is append-only --------------------------------------
    update public.consent_records set granted = false
      where gym_id = v_gym and policy_version = 'selftest';
    get diagnostics n = row_count;
    out_rows := out_rows || jsonb_build_object('seq',8,'name','consent_records: UPDATE blocked',
      'exp','0 rows affected','act',n||' rows','res',
      case when n = 0 then 'PASS' else 'FAIL — CONSENT LEDGER IS EDITABLE' end);

    delete from public.consent_records
      where gym_id = v_gym and policy_version = 'selftest';
    get diagnostics n = row_count;
    out_rows := out_rows || jsonb_build_object('seq',9,'name','consent_records: DELETE blocked',
      'exp','0 rows affected','act',n||' rows','res',
      case when n = 0 then 'PASS' else 'FAIL — CONSENT LEDGER IS DELETABLE' end);

    -- 10 · writing into someone else's gym is rejected --------------------------
    ok := false;
    begin
      insert into public.attendance(gym_id, class_instance_id, member_id, source)
        values (v_other_gym, v_other_ci, v_other_member, 'coach');
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',10,'name','attendance: cross-gym INSERT rejected',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when v_is_admin then 'SKIP — platform admin'
                  when ok then 'PASS' else 'FAIL — CAN WRITE INTO ANOTHER TENANT' end);

    -- 11 · the source CHECK actually bites --------------------------------------
    -- Guards the exact bug class that hit persona_plans.source: a client writing a
    -- value the constraint rejects, failing silently, losing data downstream.
    ok := false;
    begin
      insert into public.attendance(gym_id, class_instance_id, member_id, source)
        values (v_gym, v_ci, v_member3, 'scan');   -- 'scan' is NOT one of qr|coach|import
    exception when others then ok := true;
    end;
    out_rows := out_rows || jsonb_build_object('seq',11,'name','attendance: source CHECK rejects bad value',
      'exp','rejected','act', case when ok then 'rejected' else 'ACCEPTED' end,
      'res', case when ok then 'PASS' else 'FAIL — source enum is not enforced' end);

  exception when others then
    out_rows := out_rows || jsonb_build_object('seq',99,'name','unexpected error',
      'exp','no error','act',SQLERRM,'res','FAIL');
  end;

  -- ── Back to superuser: flush results, then remove every fixture ────────────
  execute 'reset role';

  insert into _rls_results(seq, check_name, expected, actual, result)
  select (r->>'seq')::int, r->>'name', r->>'exp', r->>'act', r->>'res'
    from jsonb_array_elements(out_rows) r;

  delete from public.gyms    where id = v_other_gym;                       -- cascades its rows
  delete from public.members where id in (v_member, v_member2, v_member3); -- cascades attendance/consent
  delete from public.class_instances where id = v_ci;
end $$;

select check_name, expected, actual, result
  from _rls_results
 order by seq;
