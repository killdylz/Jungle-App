// ─── Attendance CSV backfill (F4 slice 2) ────────────────────────────────────
//
// WHY THIS EXISTS
// Phase 2 (cohort curves, at-risk detection, revenue-at-risk) is arithmetic over
// attendance rows. It is not blocked on schema any more — `0007` is applied — it
// is blocked on rows EXISTING. A studio switching to Jungle already has years of
// attendance in whatever system they are leaving, and every one of those rows is
// a data point the retention instrument needs. Waiting to accumulate them one
// class at a time would put the outcome tier months away.
//
// Design rules, all of which follow from attendance being APPEND-ONLY and
// CHECK-constrained (see store.js / migration 0007):
//   - Parse and validate EVERYTHING before writing anything. A half-applied
//     import of an append-only table cannot be rolled back.
//   - Never invent a member. A name that does not match the roster is either
//     created deliberately or reported — never silently attached to a
//     near-match, because a wrong attribution is invisible downstream and
//     corrupts exactly the per-member history Phase 2 reads.
//   - Report every rejected row with its line number. A backfill that silently
//     drops 200 of 1,000 rows is worse than one that refuses to run.
//
// Pure functions — no I/O, no store access. The caller applies the result.

// ── CSV parsing ──────────────────────────────────────────────────────────────
// Hand-rolled rather than a dependency: the format we accept is small, and the
// awkward parts (quoted fields containing commas or newlines, "" escapes) are
// exactly the parts a naive split(",") gets wrong on real exports.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text || "").replace(/^﻿/, "");   // strip UTF-8 BOM (Excel)
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }     // "" is a literal quote
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
}

// ── Header mapping ───────────────────────────────────────────────────────────
// Exports name these columns a dozen ways. Matching on a set of aliases costs
// nothing and removes the single most common reason an import fails on the first
// try — which, for a coach evaluating Jungle, is a first-run experience worth buying.
const COLUMNS = {
  member:    ["member", "member name", "name", "client", "client name", "attendee", "full name", "customer"],
  email:     ["email", "e-mail", "email address", "member email"],
  date:      ["date", "class date", "attended", "attended at", "checked in", "checked in at", "check-in", "timestamp", "when"],
  className: ["class", "class name", "session", "session name", "activity", "course"],
  classType: ["type", "class type", "format", "category"],
  coach:     ["coach", "instructor", "trainer", "teacher", "staff"],
};
const norm = s => String(s || "").trim().toLowerCase().replace(/[_\s-]+/g, " ");

export function mapHeaders(headerRow) {
  const map = {};
  (headerRow || []).forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COLUMNS)) {
      if (map[key] == null && aliases.includes(n)) { map[key] = i; return; }
    }
  });
  return map;
}

// ── Date parsing ─────────────────────────────────────────────────────────────
// Accepts ISO (unambiguous, preferred) and the common regional forms. Anything
// else is REJECTED rather than guessed — a misparsed date lands a class in the
// wrong week and quietly distorts the retention curve that justifies the price.
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export function parseDate(raw, { dayFirst = true } = {}) {
  const s = String(raw || "").trim();
  if (!s) return null;

  // ISO 8601, with or without a time component.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(m[1], m[2], m[3], m[4], m[5], m[6]);

  // "12 March 2026" / "12 Mar 2026"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo < 0) return null;
    return iso(m[3], mo + 1, m[1]);
  }
  // "March 12, 2026"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo < 0) return null;
    return iso(m[3], mo + 1, m[2]);
  }

  // Slash/dot forms. AMBIGUOUS by nature: 03/04/2026 is 3 April in most of the
  // world and 4 March in the US. `dayFirst` is a CALLER DECISION surfaced in the
  // UI, never a guess made here — and when the numbers settle it (13+), the
  // unambiguous reading wins regardless of the setting.
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:[T ,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    let [, a, b, y, hh, mm] = m;
    y = y.length === 2 ? `20${y}` : y;
    let day, mon;
    if (Number(a) > 12) { day = a; mon = b; }
    else if (Number(b) > 12) { day = b; mon = a; }
    else if (dayFirst) { day = a; mon = b; }
    else { day = b; mon = a; }
    return iso(y, mon, day, hh, mm);
  }
  return null;
}
function iso(y, mo, d, hh, mm, ss) {
  const Y = Number(y), M = Number(mo), D = Number(d);
  if (!Y || M < 1 || M > 12 || D < 1 || D > 31) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D, Number(hh || 12), Number(mm || 0), Number(ss || 0)));
  // Round-trip check rejects impossible dates (31 February) that Date silently rolls over.
  if (dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  return dt.toISOString();
}

// ── The analysis pass ────────────────────────────────────────────────────────
/**
 * Validate a CSV against the existing roster WITHOUT writing anything.
 * The caller shows this to the coach, who confirms before it is applied.
 *
 * @param text        raw CSV
 * @param members     existing roster [{ id, name, email }]
 * @param existing    existing attendance [{ classInstanceId, memberId }] for dedupe
 * @param opts        { dayFirst }
 * @returns {{ ok, error, rows, newMembers, classes, skipped, problems, headers }}
 */
export function analyzeAttendanceCsv(text, members = [], opts = {}) {
  const grid = parseCsv(text);
  if (!grid.length) return fail("That file has no rows.");
  const headers = grid[0];
  const map = mapHeaders(headers);
  if (map.member == null && map.email == null)
    return fail(`No member column found. Expected one of: ${COLUMNS.member.concat(COLUMNS.email).join(", ")}. Found: ${headers.join(", ")}`);
  if (map.date == null)
    return fail(`No date column found. Expected one of: ${COLUMNS.date.join(", ")}. Found: ${headers.join(", ")}`);

  // Roster index. Email is the strong key (unique per person); name is the weak
  // one and is matched case/space-insensitively but NEVER fuzzily.
  const byEmail = new Map(), byName = new Map();
  members.forEach(m => {
    if (m.email) byEmail.set(norm(m.email), m);
    if (m.name) byName.set(norm(m.name), m);
  });

  const rows = [], problems = [], newMembers = new Map(), classes = new Map();
  const seenPairs = new Set();
  let skipped = 0;

  for (let r = 1; r < grid.length; r++) {
    const line = r + 1;                       // 1-indexed, matching a spreadsheet
    const cell = i => (i == null ? "" : String(grid[r][i] ?? "").trim());
    const name = cell(map.member), email = cell(map.email);
    if (!name && !email) { problems.push({ line, why: "no member name or email" }); continue; }

    const when = parseDate(cell(map.date), opts);
    if (!when) { problems.push({ line, why: `couldn't read the date "${cell(map.date)}"` }); continue; }

    const member = (email && byEmail.get(norm(email))) || (name && byName.get(norm(name))) || null;
    let memberKey;
    if (member) memberKey = member.id;
    else {
      // A name not on the roster becomes a NEW member — created explicitly and
      // counted in the preview, never quietly attached to a similar existing one.
      memberKey = `new:${norm(email) || norm(name)}`;
      if (!newMembers.has(memberKey)) newMembers.set(memberKey, { name: name || email, email: email || "" });
    }

    const className = cell(map.className) || "Imported class";
    const classKey = `${className}@${when.slice(0, 10)}`;
    if (!classes.has(classKey)) {
      classes.set(classKey, { key: classKey, name: className, startsAt: when,
                              classType: cell(map.classType), coachName: cell(map.coach) });
    }

    // Same member, same class occurrence, twice in the file. 0007 has
    // unique(class_instance_id, member_id), so this WILL collide server-side;
    // dropping it here keeps the preview count honest.
    const pair = `${classKey}|${memberKey}`;
    if (seenPairs.has(pair)) { skipped++; continue; }
    seenPairs.add(pair);

    rows.push({ line, memberKey, classKey, checkedInAt: when });
  }

  if (!rows.length)
    return fail(problems.length ? `No usable rows — every one had a problem (first: line ${problems[0].line}, ${problems[0].why}).`
                                : "No attendance rows found in that file.");

  return {
    ok: true, error: "", headers, rows,
    newMembers: [...newMembers.entries()].map(([key, m]) => ({ key, ...m })),
    classes: [...classes.values()],
    skipped, problems,
  };
}
function fail(error) {
  return { ok: false, error, rows: [], newMembers: [], classes: [], skipped: 0, problems: [], headers: [] };
}

// A one-line summary of what applying this import will do. Written for a coach,
// not a developer — this is the sentence they read before committing to a
// write against an append-only table.
export function describeImport(a) {
  if (!a.ok) return a.error;
  const bits = [`${a.rows.length} check-in${a.rows.length === 1 ? "" : "s"}`,
                `${a.classes.length} class${a.classes.length === 1 ? "" : "es"}`];
  if (a.newMembers.length) bits.push(`${a.newMembers.length} new member${a.newMembers.length === 1 ? "" : "s"}`);
  if (a.skipped) bits.push(`${a.skipped} duplicate${a.skipped === 1 ? "" : "s"} skipped`);
  if (a.problems.length) bits.push(`${a.problems.length} row${a.problems.length === 1 ? "" : "s"} that couldn't be read`);
  return bits.join(" · ");
}
