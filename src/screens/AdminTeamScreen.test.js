import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { TEAM_ROLES } from "./AdminTeamScreen.jsx";

// This repo's recurring data-loss bug is a constrained column rejecting a client
// value — three occurrences before this one (`persona_plans.source`,
// `attendance.source`, and the retention ledgers). `memberships.role` and
// `allowlist_entries.role` are a Postgres ENUM, which fails exactly the same way
// a CHECK does, and until now nothing guarded it.
//
// The test deliberately READS THE MIGRATION rather than restating the five
// strings. A test that hard-codes the list is just a second copy to drift: it
// would pass while the database rejected every write. Parsing the source of
// truth is what makes this a guard instead of a restatement.

// Resolved from THIS FILE via import.meta.url, not from process.cwd(): it is
// correct regardless of where the runner is invoked, and it needs no Node
// globals, so `lint:crash` stays untouched. (It flagged `process` here, which is
// the rule working — src/ is browser code and only the test runner is Node.)
const MIGRATION = new URL("../../supabase/migrations/0001_auth_foundation.sql", import.meta.url);

function enumValuesFromMigration(name) {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const m = sql.match(new RegExp(`create\\s+type\\s+${name}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, "i"));
  if (!m) throw new Error(`enum ${name} not found in ${MIGRATION}`);
  return m[1].split(",").map(s => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
}

describe("TEAM_ROLES agrees with the membership_role enum", () => {
  it("finds the enum in the migration at all", () => {
    // Guards the parser itself: if the migration is restructured and the regex
    // silently matches nothing, every other assertion here would pass vacuously.
    const values = enumValuesFromMigration("membership_role");
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain("admin");
  });

  it("offers no role the database would reject", () => {
    // The failure that matters: an admin picks a role from the dropdown, the
    // insert fails, and the invite is silently lost.
    const legal = new Set(enumValuesFromMigration("membership_role"));
    const illegal = TEAM_ROLES.filter(r => !legal.has(r));
    expect(illegal, `UI offers roles the DB enum rejects: ${illegal.join(", ")}`).toEqual([]);
  });

  it("offers every role the database allows", () => {
    // The quieter failure: a legal role exists that no admin can ever assign.
    const ui = new Set(TEAM_ROLES);
    const missing = enumValuesFromMigration("membership_role").filter(r => !ui.has(r));
    expect(missing, `DB allows roles the UI never offers: ${missing.join(", ")}`).toEqual([]);
  });

  it("is exactly the same set, order aside", () => {
    // Order is presentational (the UI ranks by privilege, the enum does not), so
    // it is compared as a set on purpose — pinning order would fail on a
    // harmless reordering and teach everyone to ignore this test.
    expect([...TEAM_ROLES].sort()).toEqual(enumValuesFromMigration("membership_role").sort());
  });
});
