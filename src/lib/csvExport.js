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
// The at-risk rules' own view of who has been in and when. Imported rather than
// recomputed so this file cannot drift from what the screen shows — see the note
// in `rosterCsv`. `retention.js` imports nothing, so there is no cycle.
import { activityIndex } from "./retention.js";

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
// A timestamp in milliseconds as the LOCAL calendar day. `activityIndex` holds
// instants, and a check-in at 01:00 SGT is the 16th to the coach who recorded it
// and the 15th in UTC — `toISOString().slice(0,10)` would silently pick the
// second one, moving a "last seen" date a day earlier for every late class.
const lastSeenDay = ms => {
  if (ms == null) return "";
  const d = new Date(ms), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const isoMinute = ts => {
  if (!ts) return "";
  const s = String(ts);
  return s.length > 16 ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s;
};

const SOURCE_LABEL = { qr: "Self check-in", coach: "Checked in by coach", import: "Imported from previous system" };

// What the gym DID about a flag, in words a member would understand. The raw
// values are the `retention_actions.action` enum (0008); "reopened" is an
// operator undoing their own dismissal, which is still an event about this
// person and is disclosed as such rather than netted out.
const ACTION_LABEL = {
  acted: "Contacted",
  dismissed: "Reviewed and no action taken",
  reopened: "Reopened for follow-up",
};
// The rule that raised the flag, stated the way the rule itself is stated.
const RULE_LABEL = {
  new_member_low_visits: "New member with few visits in their first month",
  absence: "No recorded attendance for over two weeks",
};

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
 * @param opts            { gymName, retentionActions }
 *                        `gymName` — whose record this is, on the document.
 *                        `retentionActions` — the FULL ledger; filtered here by
 *                        member id, exactly as `attendance` is.
 */
export function memberCsv(member, attendance = [], classInstances = [], { gymName = "", retentionActions = [] } = {}) {
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
  // The member's id in whatever system the gym used before Jungle. It is an
  // identifier for this person, it is editable on the roster screen, and it
  // synced to `members.external_ref` — so it is held, and an access request that
  // omits it is answering a narrower question than the one that was asked.
  // Written only when there is one: a blank labelled row invites the reader to
  // wonder what was withheld.
  if (member.externalRef) rows.push(["Reference from previous system", member.externalRef]);
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

  // ── What the gym recorded ABOUT them ───────────────────────────────────────
  // Attendance is what the member did; this is what the gym concluded and did
  // back. `retention_actions` (0008) is an append-only ledger of "we flagged
  // her as at-risk, we phoned her on the 4th, here is the note the coach left",
  // and it is the most consequential personal data in the system — it decides
  // whether someone gets a call. An export that returns the attendance grid and
  // silently omits this answers the easy half of the request.
  //
  // ⚠️ The note is staff free text. PDPA's Fifth Schedule lets an organisation
  // withhold opinion data kept solely for an evaluative purpose, and nothing
  // here can tell "said she's travelling" (plainly factual) from an evaluative
  // remark. That call belongs to the gym, which is the organisation with the
  // duty — so the export shows the note rather than deciding for them, and the
  // section is labelled so it is obvious what is being handed over. Flagged for
  // the lawyer review in LEGAL §7 rather than settled here.
  const theirs = (retentionActions || [])
    .filter(r => r && r.memberId === member.id)
    .sort((a, b) => String(a.occurredAt || "").localeCompare(String(b.occurredAt || "")));

  rows.push([]);
  rows.push(["Membership follow-up recorded by the gym"]);
  rows.push(["Date", "Why they were flagged", "What was done", "Note"]);
  if (!theirs.length) {
    rows.push(["No retention actions have been recorded."]);
  } else {
    for (const r of theirs) {
      rows.push([
        isoDate(r.occurredAt),
        RULE_LABEL[r.rule] || r.rule || "",
        ACTION_LABEL[r.action] || r.action || "",
        r.note || "",
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
export function rosterCsv(members = [], attendance = [], { includeCancelled = true, ptSessions = [] } = {}) {
  // ⚠️ D1 · the SAME index the screen and the at-risk rules use.
  //
  // These two columns are headed "Visits" and "Last seen" — the exact words the
  // Members screen puts beside each row. Counting only `attendance` here while
  // the screen counts 1:1 sessions too would let a gym export a file saying a
  // client has 0 visits and has never been seen, about someone the screen above
  // it shows training twice a week. This artefact is what a gym takes with them
  // when they leave, and what a member gets if they ask what is held about them,
  // so it is the worst place in the product for that disagreement to live.
  const index = activityIndex(attendance, ptSessions);

  const list = (members || []).filter(m => m && (includeCancelled || m.status !== "cancelled"));
  // `Reference` last, after the derived columns: this file is read by humans far
  // more often than it is re-imported, and the previous system's key is the
  // least interesting column to a person and the most important one to a
  // migration. Dropping it made this a readable summary rather than the backup
  // and portability artefact the function exists to be — a gym leaving Jungle
  // could not have rebuilt the link to the system it came from.
  const rows = [["Name", "Email", "Status", "Joined", "Visits", "Last seen", "Reference"]];
  for (const m of list) {
    rows.push([
      m.name || "",
      m.email || "",
      statusLabel(m.status),
      isoDate(m.joinedAt),
      String(index.get(m.id)?.visits || 0),
      lastSeenDay(index.get(m.id)?.lastMs),
      m.externalRef || "",
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
