import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ATTENDANCE_SOURCES, RETENTION_ACTIONS, MEMBER_STATUSES,
         PERSONA_PLAN_SOURCES, PERSONA_KINDS, SCHEDULE_REPEATS } from "./store.js";
import { RETENTION_RULES } from "./retention.js";
import { COVER_STATUSES } from "./coverRequests.js";
import { _classToRow, _memberToRow, _coachToRow, _coverToRow, _absenceToRow } from "./store.js";
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
  // ⚠️ WAS AN EXCEPTION TO THIS FILE'S OWN RULE AND IS NO LONGER ONE (S32). It
  // was added while `saveCoverRequests` was localStorage-only, on the argument
  // that a constant and a CHECK living in the same repo can drift silently until
  // the day the migration runs. `settleCoverRequest` now writes this column for
  // real, through `_coverToRow`, so it is an ordinary member of this list — the
  // exception was simply early rather than wrong.
  ["cover_requests.status",   COVER_STATUSES,      () => checkValues("0010_coach_cover.sql", "status")],
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

// ─── The same bug class, one step earlier: a COLUMN the database has not got ──
//
// Everything above guards constrained VALUES. This guards constrained COLUMNS,
// which is the same failure arriving from the other side and is currently how it
// would arrive next.
//
// `store.js`'s row mappers turn a local object into a Postgres row. `updateMember`
// already carries a comment saying unknown keys are dropped "because an extra key
// would ride into _memberToRow and be rejected by Postgres" — correct, and
// nothing enforced it. PostgREST rejects an upsert naming a column that does not
// exist, and it rejects THE WHOLE BATCH: one unknown key would stop every class
// (or every member) in the gym from syncing, and the ledger would only report
// that the table failed.
//
// 🔴 THIS IS THE GUARD FOR SESSION 30'S CENTRAL DECISION. The obvious way to
// link a class to a coach is a `coach_id` on `class_schedule_rules`. Migration
// 0010 is written and UNAPPLIED, so adding that field to `_classToRow` today
// would break class sync for every gym that has a server. The link is resolved
// by NAME instead (`lib/coachRoster.js`) and the class row is untouched — and
// this test is what stops the next session from "finishing the job" by adding
// the column to the mapper before the migration has run.
//
// The sample objects are deliberately OVER-populated: every optional field set,
// so a mapper that only emits a key when its input is present is still caught.
const MAPPER_SAMPLES = [
  ["class_schedule_rules", "0003_phase1_domain_tables.sql", _classToRow,
   { id: "uc1", name: "Strength Lab", type: "S360", coach: "Mara", day: "Mon",
     slot: "06:00", dur: "45m", repeat: "weekly", weekKey: "2026-7-3", fill: 12 }],
  ["members", "0007_attendance_spine.sql", _memberToRow,
   { id: "m1", name: "Ana", email: "a@b.co", status: "active",
     joinedAt: "2026-01-02", externalRef: "ext-1" }],
  // ⚠️ ADDED IN S32, IN THE COMMIT THAT MADE THE CLIENT WRITE THESE TABLES.
  // Both are guarded against a migration that HAS NOT RUN, which is the point:
  // 0010 is unapplied (DYLAN-QUEUE A15), so the file below is the only statement
  // of what these tables will look like, and a mapper that drifts from it would
  // fail every push on the day it is applied — with a message naming only the
  // table. The samples are over-populated for the same reason the two above are.
  ["coach_roster", "0010_coach_cover.sql", _coachToRow,
   { id: "c1", name: "Mara", aliases: ["Mara K."], userId: "u1", active: true,
     availability: { Mon: ["06:00"] }, availabilityAt: "2026-08-24" }],
  ["cover_requests", "0010_coach_cover.sql", _coverToRow,
   { id: "r1", classClientId: "uc1", classLabel: "Strength Lab", classDay: "Mon",
     classSlot: "06:00", classDate: "2026-08-24", absenceId: "a1",
     fromCoachId: "c1", toCoachId: "c2", note: "flu",
     status: "approved", createdAt: "2026-08-24T05:00:00.000Z",
     settledAt: "2026-08-24T05:04:00.000Z", settledBy: "u2" }],
  ["coach_absences", "0010_coach_cover.sql", _absenceToRow,
   { id: "a1", coachId: "c1", from: "2026-08-24", to: "2026-08-28", note: "leave",
     createdAt: "2026-08-20T05:00:00.000Z", cancelledAt: "2026-08-21T05:00:00.000Z" }],
];

// Column names from a `create table` block. A continuation line (`check (...)`,
// `on delete ...`) and a table constraint (`unique (...)`) are not columns, so a
// line only counts when its second token is a TYPE — which is also what stops
// this parser from inventing a column called "unique" and passing vacuously.
const COLUMN_LINE = /^([a-z_][a-z0-9_]*)\s+(uuid|text|int|integer|bigint|boolean|jsonb|json|date|timestamptz|numeric|real|text\[\])\b/i;
function tableColumns(file, table) {
  const m = sqlOf(file).match(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  if (!m) throw new Error(`no create table for ${table} in ${file}`);
  const cols = new Set();
  for (const raw of m[1].split("\n")) {
    const line = raw.replace(/--.*$/, "").trim();
    const hit = line.match(COLUMN_LINE);
    if (hit) cols.add(hit[1].toLowerCase());
  }
  return cols;
}

describe("🔴 row mappers only name columns the database actually has", () => {
  it.each(MAPPER_SAMPLES)("%s", (table, file, mapper) => {
    const cols = tableColumns(file, table);

    // Guards the parser twice over: a restructured migration that matched
    // nothing, or matched only junk, would make the real assertion vacuous.
    expect(cols.size, `parsed no columns for ${table} — the parser, not the code, is wrong`).toBeGreaterThan(3);
    expect(cols.has("gym_id"), `parsed columns for ${table} look wrong: ${[...cols].join(", ")}`).toBe(true);

    const sample = MAPPER_SAMPLES.find(r => r[0] === table)[3];
    const emitted = Object.keys(mapper(sample));
    expect(emitted.length, "the mapper emitted nothing — it cannot be judged").toBeGreaterThan(3);

    const unknown = emitted.filter(k => !cols.has(k.toLowerCase()));
    expect(unknown,
      `${table}: the mapper would send column(s) the migration has not created: ${unknown.join(", ")}. `
      + `PostgREST rejects the WHOLE batch, so this stops the entire table syncing.`).toEqual([]);
  });

  // POSITIVE CONTROL 2 (S32). The mappers above are the first two written
  // against a migration that has never run, so "the parser read 0010 at all" is
  // load-bearing in a way it was not for 0003 and 0007 — a typo'd filename or a
  // restructured `create table` would throw rather than pass vacuously, but a
  // parser that matched a DIFFERENT table would not. This pins that the columns
  // being compared are really the roster's, and that a plausible wrong key is
  // caught rather than shrugged at.
  it("the 0010 mappers are judged against 0010's own columns", () => {
    const roster = tableColumns("0010_coach_cover.sql", "coach_roster");
    const cover  = tableColumns("0010_coach_cover.sql", "cover_requests");
    const absent = tableColumns("0010_coach_cover.sql", "coach_absences");

    // 🔴 S33's two new columns. A cover with no `class_date` is a cover that
    // means "from now on", which is the defect dated cover exists to remove —
    // so the column being in the migration is load-bearing, not incidental.
    expect(cover.has("class_date")).toBe(true);
    expect(cover.has("absence_id")).toBe(true);
    expect(absent.has("from_date")).toBe(true);
    expect(absent.has("to_date")).toBe(true);
    expect(absent.has("class_label")).toBe(false);   // not a cover request

    // Columns only this table has, so the two cannot be silently swapped.
    expect(roster.has("availability_at")).toBe(true);
    expect(roster.has("class_label")).toBe(false);
    expect(cover.has("class_label")).toBe(true);
    expect(cover.has("availability_at")).toBe(false);

    // 🔴 The one that would actually be written by mistake. A roster row carries
    // the LOCAL field name `availabilityAt`; emitting it unconverted is a single
    // slip and would stop the whole roster syncing.
    const slip = { ..._coachToRow({ id: "c1", name: "Mara" }), availabilityAt: "2026-08-24" };
    expect(Object.keys(slip).filter(k => !roster.has(k))).toEqual(["availabilityAt"]);
  });

  // POSITIVE CONTROL. Without it, a parser that returned every identifier in the
  // file would pass every assertion above while guarding nothing — and the
  // specific thing it must catch is `coach_id`, the column migration 0010
  // defines and has not created.
  it("catches the coach_id that session 30 deliberately did not add", () => {
    const cols = tableColumns("0003_phase1_domain_tables.sql", "class_schedule_rules");
    expect(cols.has("coach")).toBe(true);        // the text column that IS there
    expect(cols.has("coach_id")).toBe(false);    // and the link that is not

    const wouldBreakSync = { ..._classToRow({ id: "uc1", name: "x", type: "t" }), coach_id: "abc" };
    const unknown = Object.keys(wouldBreakSync).filter(k => !cols.has(k));
    expect(unknown).toEqual(["coach_id"]);
  });
});
