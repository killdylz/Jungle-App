import { describe, it, expect } from "vitest";
import fs from "node:fs";

// ─── The staff read boundary (0010), guarded at source ───────────────────────
//
// WHY THIS FILE EXISTS
//
// Every read policy written before 0010 is `gym_id in (select user_gym_ids())`,
// and user_gym_ids() has no role filter. membership_role already includes
// 'member'. So the moment a PT client is given a membership row — the obvious
// way to reuse the RBAC model that is already there — that client can SELECT the
// entire roster with email addresses, every attendance row, every consent
// record, and the whole persona corpus.
//
// 0010 installs the rule: A MEMBER READS THEIR GYM'S IDENTITY AND NOTHING ELSE.
// This file is what stops that rule rotting. It parses the migrations, replays
// drop/create in order, and asserts the EFFECTIVE policy set — not the text of
// any one file, because a policy's meaning is decided by the last migration to
// touch its name, which is exactly the thing that is easy to get wrong.
//
// 🔴 IT IS WRITTEN AGAINST TWO REAL BUGS, both made while drafting 0010 itself
// and both caught here rather than in production:
//
//   1. 0010 first rewrote `memberships_rw` and `allowlist_rw`. Those names have
//      not existed since 0002 replaced them with an admin-only split. `drop
//      policy if exists` on a missing name is a SILENT NO-OP, so the create
//      would have ADDED a second permissive policy beside 0002's. Permissive
//      policies are OR'd — every coach and frontdesk user would have regained
//      INSERT/UPDATE/DELETE on memberships, i.e. the ability to make themselves
//      an admin. A hardening migration that escalates privilege.
//
//   2. 0010 first rewrote the persona policies as `_rw`. They are named `_read`
//      and `_write`. Same silent no-op: the leaky `_read` would have survived
//      untouched while the migration looked applied and the diff read correctly.
//
// Both share one shape — a rewrite that does not replace what it thinks it
// replaces — so the invariant below is stated directly: 0010 MAY ONLY REDEFINE
// POLICY NAMES THAT ALREADY EXIST. It is a rewrite migration, not a new-policy
// migration, and a name it invents is a bug by construction.
//
// ⚠️ Every assertion here is paired with a positive control. A scan that matched
// nothing and a scan that found nothing are indistinguishable from the
// assertion's side, and this repo has been fooled by exactly that. The controls
// run the same parser over synthetic SQL that IS leaky, so a parser which
// silently stopped matching fails the suite instead of passing it.

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

const files = () =>
  fs.readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort();

const sqlOf = f => fs.readFileSync(new URL(f, MIGRATIONS), "utf8");

// Comments must go first. 0010's header names `user_gym_ids()` a dozen times
// while explaining why it is being removed, and a scanner that reads prose finds
// violations in the document that fixes them.
const stripComments = sql => sql.replace(/--[^\n]*/g, "");

// One pass, both statement kinds, in source order — because order is the whole
// point. `drop` then `create` under the same name is a replacement; a `create`
// under a name nothing dropped is an addition, and those are different facts.
const STMT =
  /(?:drop\s+policy\s+if\s+exists\s+(\w+)\s+on\s+public\.(\w+)\s*;)|(?:create\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(all|select|insert|update|delete)\b([\s\S]*?);)/gi;

/**
 * Replay every migration in order and return the policies actually in force.
 * Keyed `table.policy_name`, because that is what Postgres keys on: two policies
 * differing only in name are two policies, and both apply.
 */
function effectivePolicies(sources) {
  const live = new Map();
  for (const { file, sql } of sources) {
    const text = stripComments(sql);
    STMT.lastIndex = 0;
    let m;
    while ((m = STMT.exec(text)) !== null) {
      const [, dropName, dropTable, createName, createTable, cmd, body] = m;
      if (dropName) {
        live.delete(`${dropTable}.${dropName}`);
      } else {
        live.set(`${createTable}.${createName}`, {
          file, table: createTable, name: createName,
          cmd: cmd.toLowerCase(), body: body || "",
        });
      }
    }
  }
  return live;
}

const realSources = () => files().map(f => ({ file: f, sql: sqlOf(f) }));

const leaks = live =>
  [...live.values()].filter(p => /user_gym_ids/.test(p.body))
                    .map(p => `${p.table}.${p.name}`).sort();

// The two policies that keep the any-membership predicate on purpose. A client
// app has to resolve which studio it belongs to and which skin to wear (F6);
// neither row holds personal data. Everything else is staff.
const INTENTIONAL = ["brand_profiles.brand_profiles_read", "gyms.gyms_read"];

describe("0010 — staff read boundary", () => {
  it("defines both staff helpers, with the role list ENUMERATED not negated", () => {
    // Stripped, for the same reason the replay is: 0010's header discusses the
    // negated form at length while explaining why it does not use it, and an
    // assertion that reads prose fails on the document that gets it right.
    const sql = stripComments(sqlOf("0010_staff_read_boundary.sql"));
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.staff_gym_ids\(\)/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.is_gym_staff\(p_gym\s+uuid\)/i);

    // Both helpers must list the staff roles explicitly. `role <> 'member'` would
    // read as equivalent and is the opposite of safe: a role added to
    // membership_role later would inherit read on the whole gym the day it was
    // created — the exact failure 0010 exists to fix, through another door.
    const bodies = sql.match(/role\s+in\s*\(([^)]*)\)/gi) || [];
    expect(bodies.length).toBe(2);                       // control: both helpers found
    for (const b of bodies) {
      for (const role of ["admin", "manager", "coach", "frontdesk"]) {
        expect(b).toContain(`'${role}'`);
      }
      expect(b).not.toContain("'member'");
    }
    expect(sql).not.toMatch(/role\s*(<>|!=)\s*'member'/i);
  });

  it("leaves EXACTLY the two intentional policies on user_gym_ids", () => {
    const live = effectivePolicies(realSources());

    // Control: the parser actually read the migrations. Without this, a regex
    // that silently stopped matching reports a perfectly clean boundary.
    expect(live.size).toBeGreaterThan(25);
    expect([...live.keys()]).toContain("attendance.attendance_read");

    expect(leaks(live)).toEqual(INTENTIONAL);
  });

  it("moves every previously-leaking table onto staff_gym_ids", () => {
    const before = effectivePolicies(realSources().filter(s => s.file < "0010"));
    const after = effectivePolicies(realSources());

    const wasLeaking = leaks(before);
    // Control: there was something to fix. If this list is empty the next
    // assertion is vacuous and would pass on a repo where 0010 did nothing.
    expect(wasLeaking.length).toBeGreaterThan(10);

    for (const key of wasLeaking) {
      if (INTENTIONAL.includes(key)) continue;
      const p = after.get(key);
      // A dropped-and-never-recreated policy is not a fix — it is a lockout that
      // takes the staff app down with it.
      expect(p, `${key} lost its policy entirely`).toBeDefined();
      expect(p.body, `${key} still reads on user_gym_ids`).not.toMatch(/user_gym_ids/);
      expect(p.body, `${key} is not scoped to staff`).toMatch(/staff_gym_ids/);
    }
  });

  it("only REDEFINES policy names that already existed — never invents one", () => {
    // The invariant both drafting bugs violated. 0010 is a rewrite migration; a
    // name it creates that nothing before it created is a second permissive
    // policy sitting beside the one it meant to replace.
    const prior = effectivePolicies(realSources().filter(s => s.file < "0010"));
    const priorNames = new Set([...prior.keys()]);

    const text = stripComments(sqlOf("0010_staff_read_boundary.sql"));
    const created = [];
    STMT.lastIndex = 0;
    let m;
    while ((m = STMT.exec(text)) !== null) {
      if (m[3]) created.push(`${m[4]}.${m[3]}`);
    }

    expect(created.length).toBeGreaterThan(10);          // control: found the creates
    const invented = created.filter(k => !priorNames.has(k));
    expect(invented).toEqual([]);
  });

  it("keeps attendance and consent_records append-only through every migration", () => {
    // The invariant is THE ABSENCE OF A MUTATION ROUTE, not a policy count. An
    // earlier version of this test asserted exactly ["insert","select"] and went
    // red when 0011 legitimately added the client's own-attendance read — pinning
    // the shape of the policy set instead of the property that matters, which
    // would have pushed the next author to weaken the test rather than think.
    //
    // What must stay true: with RLS on and NO policy for a command, that command
    // matches zero rows for every non-superuser. So any policy here whose command
    // is update, delete, or `all` hands back the ability to edit the table the
    // retention numbers are priced against — silently, since nothing in the app
    // exercises it.
    const live = effectivePolicies(realSources());
    for (const table of ["attendance", "consent_records", "retention_actions"]) {
      const cmds = [...live.values()].filter(p => p.table === table).map(p => p.cmd);
      expect(cmds.length, `${table} has policies at all`).toBeGreaterThan(0);   // control
      expect(cmds, `${table} must stay readable`).toContain("select");
      expect(cmds, `${table} must stay writable by staff`).toContain("insert");
      for (const forbidden of ["update", "delete", "all"]) {
        expect(cmds, `${table} gained a ${forbidden.toUpperCase()} route`).not.toContain(forbidden);
      }
    }
  });
});

// ─── Positive controls for the detector itself ───────────────────────────────
// Everything above asserts an absence. These assert the scanner can still see a
// presence — so "no leaks found" means the boundary holds, not that the parser
// broke. If a change to the SQL style makes these fail, the assertions above
// have stopped meaning anything and the parser is what needs fixing.
describe("0010 — the scanner can fail", () => {
  const REAL = () => realSources();

  it("reports a leak when a later migration reintroduces one", () => {
    const withLeak = [...REAL(), {
      file: "9999_regression.sql",
      sql: `drop policy if exists members_read on public.members;
            create policy members_read on public.members for select
              using (public.is_platform_admin() or gym_id in (select public.user_gym_ids()));`,
    }];
    expect(leaks(effectivePolicies(withLeak))).toContain("members.members_read");
  });

  it("reports an invented name when a rewrite misses its target", () => {
    // Bug 2, reproduced: `_rw` beside the real `_read`. The leaky original
    // survives, and only the name check sees it.
    const prior = effectivePolicies(REAL());
    const bogus = "coach_personas.coach_personas_rw";
    expect([...prior.keys()]).not.toContain(bogus);

    const withBogus = effectivePolicies([...REAL(), {
      file: "9999_regression.sql",
      sql: `drop policy if exists coach_personas_rw on public.coach_personas;
            create policy coach_personas_rw on public.coach_personas for all
              using (gym_id in (select public.staff_gym_ids()))
              with check (gym_id in (select public.staff_gym_ids()));`,
    }]);
    expect([...withBogus.keys()]).toContain(bogus);
  });

  it("sees a drop that is never followed by a create", () => {
    const gutted = effectivePolicies([...REAL(), {
      file: "9999_regression.sql",
      sql: `drop policy if exists attendance_read on public.attendance;`,
    }]);
    expect([...gutted.keys()]).not.toContain("attendance.attendance_read");
  });
});
