import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ATTENDANCE_SOURCES, RETENTION_ACTIONS, MEMBER_STATUSES,
         PERSONA_PLAN_SOURCES, PERSONA_KINDS, SCHEDULE_REPEATS } from "./store.js";
import { RETENTION_RULES } from "./retention.js";
import { TEAM_ROLES } from "../screens/AdminTeamScreen.jsx";

// ─── The recurring data-loss bug, guarded in one place ───────────────────────
//
// This repo's most expensive bug class is a constrained column rejecting a client
// value: the write fails in the background, nothing surfaces, and a later
// server-wins hydrate destroys the only remaining copy. It has happened three
// times (`persona_plans.source` cost live data on 2026-07-18).
//
// The standing rule is "pin legal values in ONE shared constant with a unit
// test". That was being followed, but the tests RESTATED the list:
//
//     expect(RETENTION_ACTIONS).toEqual(["acted", "dismissed", "reopened"])
//
// which pins the constant against a second hard-coded copy. It catches a typo in
// the source, and is blind to the failure that actually costs data — the constant
// and the DATABASE disagreeing. A migration can change and every such test still
// passes while every write fails.
//
// So this file PARSES THE MIGRATIONS and compares. It is the only honest version
// of the rule, and it scales: adding a constrained column here is one row.
//
// Audited 2026-07-20 across migrations 0001-0008, RE-AUDITED 2026-07-23. The
// second pass found the "not yet written" list had gone stale: three of its
// columns — `persona_plans.source`, `coach_personas.kind` and
// `class_schedule_rules.repeat` — ARE written by the client (they sync via
// `_planToRow`/`_personaToRow`/`saveUserClasses`). None could emit an ILLEGAL
// value today (the dropdowns only offer legal ones; `planSource` normalises), so
// there was no live data loss — but an unguarded synced column against a CHECK is
// exactly the shape that caused the 2026-07-18 incident, so all three are moved
// into GUARDED, each reading a constant the producing UI now shares.
//
// Columns the client does NOT write are deliberately absent — a guard on an
// unwritten column is noise.

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const sqlOf = (file) => fs.readFileSync(new URL(file, MIGRATIONS), "utf8");

const splitValues = (s) => s.split(",").map(v => v.trim().replace(/^'|'$/g, "")).filter(Boolean);

// `check (col in ('a','b'))` — the column may be named on an earlier line.
function checkValues(file, column) {
  const m = sqlOf(file).match(new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, "i"));
  if (!m) throw new Error(`no CHECK for ${column} in ${file}`);
  return splitValues(m[1]);
}

// `create type name as enum ('a','b')`
function enumValues(file, name) {
  const m = sqlOf(file).match(new RegExp(`create\\s+type\\s+${name}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, "i"));
  if (!m) throw new Error(`no enum ${name} in ${file}`);
  return splitValues(m[1]);
}

// [ label, client constant, values actually in the database ]
const GUARDED = [
  ["attendance.source",       ATTENDANCE_SOURCES, () => checkValues("0007_attendance_spine.sql", "source")],
  ["members.status",          MEMBER_STATUSES,     () => checkValues("0007_attendance_spine.sql", "status")],
  ["retention_actions.action", RETENTION_ACTIONS,  () => checkValues("0008_retention_actions.sql", "action")],
  ["retention_actions.rule",  RETENTION_RULES,     () => checkValues("0008_retention_actions.sql", "rule")],
  ["memberships.role",        TEAM_ROLES,          () => enumValues("0001_auth_foundation.sql", "membership_role")],
  ["persona_plans.source",    PERSONA_PLAN_SOURCES, () => checkValues("0005_coach_personas.sql", "source")],
  ["coach_personas.kind",     PERSONA_KINDS,       () => checkValues("0005_coach_personas.sql", "kind")],
  ["class_schedule_rules.repeat", SCHEDULE_REPEATS, () => checkValues("0003_phase1_domain_tables.sql", "repeat")],
];

describe("client value sets match the database constraints", () => {
  it.each(GUARDED)("%s", (label, clientValues, dbValues) => {
    const db = dbValues();

    // Guards the parser: a restructured migration that silently matches nothing
    // would make every other assertion here pass vacuously.
    expect(db.length, `parsed no values for ${label} — the parser, not the code, is wrong`).toBeGreaterThan(0);

    // The failure that costs data: the UI offers something the DB rejects.
    const illegal = clientValues.filter(v => !db.includes(v));
    expect(illegal, `${label}: client would write values the DB rejects: ${illegal.join(", ")}`).toEqual([]);

    // The quieter failure: a legal value the client can never produce.
    const unreachable = db.filter(v => !clientValues.includes(v));
    expect(unreachable, `${label}: DB allows values the client never writes: ${unreachable.join(", ")}`).toEqual([]);
  });
});

describe("the two spellings of cancel are not accidentally unified", () => {
  // `members.status` says "cancelled" (two Ls); the `entity_status` enum says
  // "canceled" (one L). Both are load-bearing in their own column. This is
  // exactly the kind of inconsistency someone "fixes" in passing, so it is
  // pinned as INTENTIONAL rather than left to be discovered by a failed write.
  it("members.status uses the two-L spelling", () => {
    expect(checkValues("0007_attendance_spine.sql", "status")).toContain("cancelled");
    expect(MEMBER_STATUSES).toContain("cancelled");
  });

  it("entity_status uses the one-L spelling", () => {
    expect(enumValues("0001_auth_foundation.sql", "entity_status")).toContain("canceled");
  });
});

describe("columns the client does not yet write", () => {
  // Recorded so the next person adding one of these features knows a constraint
  // is waiting, and does not rediscover it through a silent failed write. If you
  // start writing one of these, move it into GUARDED above.
  // Only the two consent_records columns remain genuinely unwritten: `recordConsent`
  // exists and is correct, but nothing in the app calls it (a member-consent
  // capture surface is still to be built — see the local-consent-ledger note in the
  // handoff). The moment a call site appears, move these into GUARDED.
  it.each([
    ["consent_records.scope",       () => checkValues("0007_attendance_spine.sql", "scope")],
    ["consent_records.method",      () => checkValues("0007_attendance_spine.sql", "method")],
  ])("%s still has a CHECK worth respecting", (_label, read) => {
    expect(read().length).toBeGreaterThan(0);
  });
});
