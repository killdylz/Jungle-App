// ─── Member data export (B5) ─────────────────────────────────────────────────
//
// WHY THIS EXISTS
// PDPA gives an individual the right to ASK the gym what personal data it holds
// about them, and to have it corrected. The gym is the organisation carrying
// that duty (LEGAL §1); Jungle is the intermediary, and an intermediary whose
// data cannot be got back out makes its customer unable to comply. LEGAL §1
// lists "CSV export per member" as the obligation, and the customer agreement's
// data-processing schedule commits to "data return on exit" — so this is a
// contractual promise, not a nice-to-have.
//
// Two exports, because there are two different requests behind them:
//   memberCsv  — ONE person's record: their details, then every check-in.
//                This is what an access request is answered with, and it is
//                deliberately readable by the member, not by a developer.
//   rosterCsv  — the whole roster with visit counts. Portability and the gym's
//                own backup; the mirror image of `analyzeAttendanceCsv`.
//
// Nothing here touches the store or the DOM. The caller reads the lists and
// triggers the download, so this file stays testable and the round-trip
// property below can be asserted directly.

// ── Cell encoding ────────────────────────────────────────────────────────────
// Two separate problems, and conflating them is how a "safe" CSV writer ships
// broken:
//
// 1. RFC 4180 quoting — a field containing a comma, quote or newline must be
//    quoted, with embedded quotes doubled. `parseCsv` in csvImport.js is the
//    reader; the round-trip is pinned by test, so the two can never drift.
//
// 2. FORMULA INJECTION — Excel and Sheets execute a cell beginning `=`, `+`,
//    `-`, `@`, tab or CR. Member names arrive from a CSV the gym imported from
//    its previous system, or from a coach typing mid-class, so this is reachable
//    by anyone who can get a name onto a roster. A leading apostrophe is the
//    standard mitigation: spreadsheets treat the cell as text and hide it, and a
//    plain CSV reader sees one extra character rather than an executed formula.
//    Applied BEFORE quoting so the guard cannot itself be quoted out.
const RISKY_FIRST = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (RISKY_FIRST.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// CRLF per RFC 4180 — it is what Excel expects, and `parseCsv` drops \r anyway.
export function csvRows(rows) {
  return (rows || []).map(r => (r || []).map(csvCell).join(",")).join("\r\n");
}

// Excel reads a CSV as the system codepage unless a BOM says otherwise, which
// turns every non-ASCII name into mojibake — not acceptable in a Singapore gym,
// and doubly not on a document handed to the person whose name it is. The
// importer already strips this on the way back in.
export const BOM = "﻿";

// ── Shared shaping ───────────────────────────────────────────────────────────
const MEMBER_STATUS_LABEL = { active: "Active", paused: "Paused", cancelled: "Left" };
const statusLabel = s => MEMBER_STATUS_LABEL[s] || (s ? String(s) : "Active");

// Dates are written as plain ISO dates, not localised strings: this file gets
// re-imported (by us or by whatever the gym moves to next), and `parseDate`
// treats ISO as the one unambiguous form. A time is included only where the
// exact moment is the point — a check-in.
const isoDate = ts => (ts ? String(ts).slice(0, 10) : "");
const isoMinute = ts => {
  if (!ts) return "";
  const s = String(ts);
  return s.length > 16 ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s;
};

const SOURCE_LABEL = { qr: "Self check-in", coach: "Checked in by coach", import: "Imported from previous system" };

function indexClasses(classInstances) {
  const byId = new Map();
  for (const c of classInstances || []) if (c && c.id) byId.set(c.id, c);
  return byId;
}

// ── One member's record — the answer to an access request ────────────────────
/**
 * @param member          { id, name, email, status, joinedAt }
 * @param attendance      the FULL attendance list; filtered here by member id
 * @param classInstances  for naming each class the check-in belongs to
 * @param opts            { gymName } — whose record this is, on the document
 */
export function memberCsv(member, attendance = [], classInstances = [], { gymName = "" } = {}) {
  if (!member) return null;
  const classes = indexClasses(classInstances);
  const mine = (attendance || [])
    .filter(a => a && a.memberId === member.id)
    .sort((a, b) => String(a.checkedInAt || "").localeCompare(String(b.checkedInAt || "")));

  const rows = [];
  // A header block rather than a bare table: the recipient is a member, and a
  // file that opens with an unlabelled grid answers the request badly even when
  // the data in it is complete.
  rows.push(["Personal data held", gymName ? `${gymName} (via Jungle)` : "via Jungle"]);
  rows.push(["Exported", new Date().toISOString().slice(0, 10)]);
  rows.push([]);
  rows.push(["Field", "Value"]);
  rows.push(["Name", member.name || ""]);
  rows.push(["Email", member.email || ""]);
  rows.push(["Membership status", statusLabel(member.status)]);
  rows.push(["Joined", isoDate(member.joinedAt)]);
  rows.push(["Classes attended", String(mine.length)]);
  rows.push([]);

  rows.push(["Class attendance"]);
  rows.push(["Date", "Time", "Class", "Type", "Coach", "How it was recorded"]);
  if (!mine.length) {
    // An honest blank beats an empty grid the reader has to interpret.
    rows.push(["No class attendance has been recorded."]);
  } else {
    for (const a of mine) {
      const c = classes.get(a.classInstanceId) || {};
      const when = isoMinute(a.checkedInAt);
      rows.push([
        when.slice(0, 10),
        when.slice(11),
        c.name || "",
        c.classType || "",
        c.coachName || "",
        SOURCE_LABEL[a.source] || a.source || "",
      ]);
    }
  }
  return BOM + csvRows(rows) + "\r\n";
}

// ── The whole roster — portability, and the gym's own backup ─────────────────
/**
 * Deliberately a FLAT table with a header row, unlike `memberCsv`: this one is
 * meant to be re-imported, and `analyzeAttendanceCsv`'s header aliases are what
 * the column names below are chosen to match.
 */
export function rosterCsv(members = [], attendance = [], { includeCancelled = true } = {}) {
  const visits = new Map();
  const last = new Map();
  for (const a of attendance || []) {
    if (!a || !a.memberId) continue;
    visits.set(a.memberId, (visits.get(a.memberId) || 0) + 1);
    const cur = last.get(a.memberId) || "";
    if (String(a.checkedInAt || "") > cur) last.set(a.memberId, String(a.checkedInAt || ""));
  }

  const list = (members || []).filter(m => m && (includeCancelled || m.status !== "cancelled"));
  const rows = [["Name", "Email", "Status", "Joined", "Visits", "Last seen"]];
  for (const m of list) {
    rows.push([
      m.name || "",
      m.email || "",
      statusLabel(m.status),
      isoDate(m.joinedAt),
      String(visits.get(m.id) || 0),
      isoDate(last.get(m.id)),
    ]);
  }
  return BOM + csvRows(rows) + "\r\n";
}

// ── Filenames ────────────────────────────────────────────────────────────────
// Every character a filesystem or a Content-Disposition header can choke on is
// stripped, and the result is never allowed to be empty — a download called
// ".csv" is a support ticket.
export function safeFilePart(s, fallback = "export") {
  const out = String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return out || fallback;
}

export function memberCsvFilename(member, today = new Date()) {
  return `${safeFilePart(member?.name, "member")}-data-${today.toISOString().slice(0, 10)}.csv`;
}

export function rosterCsvFilename(gymName = "", today = new Date()) {
  const who = safeFilePart(gymName, "jungle");
  return `${who}-members-${today.toISOString().slice(0, 10)}.csv`;
}
