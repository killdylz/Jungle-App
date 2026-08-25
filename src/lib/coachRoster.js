// ─── The gym's coach roster: a typed name, resolved to a person ──────────────
//
// 🔴 THE PROBLEM THIS EXISTS FOR. `class_schedule_rules.coach` is `text`
// (0003_phase1_domain_tables.sql) and the Schedule's add/edit dialog renders it
// as a free-text input. So "Mara", "mara" and " Mara " are three coaches to
// every surface that counts them, and none of them is anything a message could
// be sent to. Trainer load cannot balance across a set it cannot deduplicate.
//
// ⚠️ WHY THE LINK IS NOT A COLUMN ON THE CLASS. The obvious shape — a `coach_id`
// on `class_schedule_rules` — is the shape this repo has been burned by four
// times (`persona_plans.source`, `attendance.source`, both retention ledgers).
// `_classToRow` maps a fixed column set, and PostgREST rejects an upsert naming
// a column the migration has not created: not for that row, for the WHOLE batch.
// So a `coach_id` added before migration 0010 lands would not degrade — it would
// stop every class in the gym from syncing, and the ledger would just say
// "class_schedule_rules failed". A local-only field is no better: hydrate is
// server-wins, so the link would be silently dropped on the next load.
//
// So the class keeps carrying TEXT, exactly as it does today, and the roster
// carries the identity. Resolution is by name, which means:
//   · nothing new is written to a class → nothing can be dropped on sync
//   · no migration is needed for the link itself → it works today, unblocked
//   · a gym that has typed names for a year loses nothing and rewrites nothing
//
// ── What is and is not guessed ──────────────────────────────────────────────
// 🔴 NAMES ARE NEVER AUTO-MERGED. `coachKey` folds only differences that are
// the SAME STRING TYPED DIFFERENTLY — case, surrounding and repeated whitespace,
// and Unicode composition. It does NOT decide that "Mara" and "Mara K." are one
// person, because that is a judgement about a gym's staff and this module does
// not have the standing to make it. A gym says so explicitly, by adding the
// second spelling as an ALIAS. A confident wrong merge here silently reassigns
// somebody's classes.

// `RULE_DAYS` and `parseSlot` rather than a second day/slot list: availability
// that cannot be compared to a class without a translation step is availability
// that will eventually disagree with the schedule. `daysBetween` is imported for
// the same reason — one definition of "how long ago", not two.
import { RULE_DAYS, parseSlot } from "./scheduleInstances.js";
import { daysBetween } from "./retention.js";

// Canonical match key for a typed coach name.
//
// NFC first, then case-fold, then collapse whitespace: an accented name typed on
// two keyboards (composed vs decomposed) is one person, and the difference is
// invisible on screen — exactly the kind that would otherwise split a roster.
// `toLowerCase` rather than `toLocaleLowerCase`: the key is compared against
// other keys from the same build, never displayed, so locale-dependent folding
// would only make the key depend on the reader's device.
export function coachKey(name) {
  return String(name ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Every key an entry answers to: its display name plus its aliases.
// Blank keys are dropped — an empty alias would otherwise match every class
// whose coach field was never filled in, and quietly claim all of them.
export function coachKeys(entry) {
  const all = [entry?.name, ...(entry?.aliases || [])].map(coachKey).filter(Boolean);
  return [...new Set(all)];
}

export function makeCoach(name, extra = {}) {
  return {
    id: extra.id || undefined,          // caller supplies (store mints via newId)
    name: String(name ?? "").trim(),
    aliases: [],
    // The account link. "" is the NORMAL state, not an error: a gym with no
    // server has no accounts to link to, and a roster entry is useful without
    // one — it deduplicates the schedule and carries availability. What it
    // cannot do without a userId is RECEIVE anything, and `coachReach` below is
    // the single place that says so.
    userId: "",
    active: true,
    // Present from the start, and matching the row shape in migration 0010
    // (`availability jsonb not null default '{}'`). A field that only appears
    // once it has been written is a field every reader has to guard against.
    availability: {},
    // "" rather than absent, for the same reason — and it is what makes
    // `availabilityState` able to tell "never asked" from "said none of these".
    availabilityAt: "",
    ...extra,
  };
}

// Resolve a typed coach name to a roster entry, or null.
// Null is a normal answer — an unlinked typed name is a supported state.
export function resolveCoach(roster, typedName) {
  const k = coachKey(typedName);
  if (!k) return null;
  return (roster || []).find(e => e && coachKeys(e).includes(k)) || null;
}

// The distinct coach names actually typed on the schedule, with how many rules
// carry each, most-used first. This is the roster's INPUT: a gym does not build
// a roster from nothing, it names the people already on its own schedule.
//
// Keyed by `coachKey` so the count is per PERSON-AS-TYPED and not per spelling;
// the label shown is the first spelling encountered, and `spellings` carries the
// rest so the UI can say "also typed as…" rather than pretending they are one.
export function coachNamesOnSchedule(classes) {
  const by = new Map();
  for (const c of classes || []) {
    const raw = String(c?.coach ?? "").trim();
    const k = coachKey(raw);
    if (!k) continue;
    const cur = by.get(k) || { key: k, name: raw, count: 0, spellings: [] };
    cur.count += 1;
    if (!cur.spellings.includes(raw)) cur.spellings.push(raw);
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// 🔴 THE THREE STATES, and the reason they are three and not two.
//
//   "unknown"  — a typed name no roster entry answers to. Just text.
//   "roster"   — a person the gym has named. Deduplicated, can hold
//                availability, and CANNOT BE SENT ANYTHING.
//   "account"  — a roster entry linked to a real user (`userId`), which is the
//                only state in which a message could ever reach a human.
//
// Collapsing "roster" and "account" into one "linked" state is the tempting
// simplification and it is the dishonest one: it would let a sub-request screen
// offer a coach it has no way to reach. The distinction is the whole point.
export function coachReach(entry) {
  if (!entry) return "unknown";
  return entry.userId ? "account" : "roster";
}

// Coverage of a gym's schedule by its roster — what the Schedule panel states.
// `unknown` is NOT an error list: it is the normal state of a gym that has typed
// names for a year, and the UI is required to show it without nagging.
export function rosterCoverage(roster, classes) {
  const named = coachNamesOnSchedule(classes);
  const out = { known: [], unknown: [], accounts: 0 };
  for (const n of named) {
    const entry = resolveCoach(roster, n.name);
    if (entry) {
      out.known.push({ ...n, entry, reach: coachReach(entry) });
      if (entry.userId) out.accounts += 1;
    } else {
      out.unknown.push(n);
    }
  }
  return out;
}

// ─── Availability (S30 §2.2) ─────────────────────────────────────────────────
//
// A WEEKLY RECURRING GRID, in the schedule's own day and slot vocabulary:
//
//     { Mon: ["06:00", "18:00"], Wed: ["06:00"] }
//
// ⚠️ WHY A GRID AND NOT DATES. The three candidate shapes are a recurring grid,
// a grid plus dated exceptions, and dates only. Dates-only is honest and
// unusable — nobody re-enters their week every week, so the data would be empty
// within a fortnight and an empty availability screen is worse than none.
// Exceptions ("away this Thursday") are the layer a grid genuinely cannot
// express, and they are a real second layer rather than a field: a dated
// override needs a calendar, a timezone answer and a DST answer. The grid is
// what makes the first useful version exist, and `awayDates` is deliberately NOT
// invented here as a half-version of the second — a half-built exception list
// that silently fails to suppress one Thursday is worse than an absent one,
// because a coach would rely on it.
//
// The vocabulary is `RULE_DAYS` and `parseSlot` from scheduleInstances.js, NOT a
// second list. A rule says `day:"Mon", slot:"06:00"`; availability answers in the
// same words, so matching a coach to a class is a lookup rather than a parse.

// A stated availability goes stale after eight weeks.
//
// 🔴 THE NUMBER IS ARBITRARY AND THE BEHAVIOUR IS NOT. Any threshold is a
// judgement; what matters is that a claim carries its date and that an old one
// stops reading as a current fact. Eight weeks is longer than any single block
// of a gym's schedule and short enough that a coach who left mid-term shows as
// stale within the same term.
export const COACH_AVAIL_STALE_DAYS = 56;

// Drop anything that is not a real day and a real time. A slot that `parseSlot`
// rejects would sort itself to the end of time in the grid and match no class.
export function normaliseAvailability(raw) {
  const out = {};
  for (const day of RULE_DAYS) {
    const slots = raw?.[day];
    if (!Array.isArray(slots)) continue;
    const keep = [...new Set(slots.map(s => String(s ?? "").trim()).filter(s => parseSlot(s)))];
    keep.sort((a, b) => { const A = parseSlot(a), B = parseSlot(b); return A.h - B.h || A.m - B.m; });
    if (keep.length) out[day] = keep;
  }
  return out;
}

// 🔴 "NEVER STATED" AND "STATED NOTHING" ARE DIFFERENT ANSWERS, and collapsing
// them is how a screen implies a whole gym is free. A roster entry with no
// `availabilityAt` has never been asked; one with a date and an empty grid has
// answered "none of these". The first is a gap in what we know, the second is
// information.
export function availabilityState(entry, now = Date.now()) {
  const at = String(entry?.availabilityAt || "");
  // Parsed WITHOUT a "Z": a date a coach typed is a local calendar date, and
  // anchoring it at UTC midnight would make it a day older for every reader east
  // of Greenwich — the exact bug `daysBetween`'s comment in retention.js was
  // written for.
  const ms = at ? Date.parse(`${at}T00:00:00`) : NaN;
  if (Number.isNaN(ms)) return { state: "never", at: "", days: null };
  const days = daysBetween(now, ms);
  return { state: days > COACH_AVAIL_STALE_DAYS ? "stale" : "fresh", at, days };
}

// Does this entry claim to be free at a given day and slot?
export function claimsFree(entry, day, slot) {
  const slots = entry?.availability?.[day];
  return Array.isArray(slots) && slots.includes(slot);
}

// Who could cover a class at `day`/`slot`.
//
// 🔴 THREE THINGS THIS DELIBERATELY DOES NOT DO.
//
// 1. It does not hide a STALE claim. The prompt's rule — a coach who stated
//    availability in March and left in June must not surface as available in
//    July — is satisfied by never calling a stale claim "available", not by
//    deleting it from the screen. A gym whose whole roster is stale would
//    otherwise see an empty list and no reason for it, and would conclude
//    nobody is free rather than that nobody has been asked lately. The caller
//    gets `state` and is required to show it.
// 2. It does not rank by who is "best". It sorts fresh claims above stale ones
//    and leaves the rest alone — any further ordering would be a judgement about
//    a gym's staff dressed as a computation.
// 3. It does not filter by whether the coach can be REACHED. `reach` is
//    returned so the caller can say so; a coach with no account is still the
//    right person to ask, they just have to be asked some other way.
//
// `active === false` DOES exclude: that is the gym saying this person no longer
// coaches here, which is a fact about employment and not a stale claim.
export function coachesFreeAt(roster, { day, slot } = {}, now = Date.now()) {
  if (!day || !slot) return [];
  return (roster || [])
    .filter(e => e && e.active !== false && claimsFree(e, day, slot))
    .map(e => ({ coach: e, reach: coachReach(e), ...availabilityState(e, now) }))
    .sort((a, b) => (a.state === "stale") - (b.state === "stale")
                 || (a.days ?? 0) - (b.days ?? 0)
                 || String(a.coach.name).localeCompare(String(b.coach.name)));
}

// ─── Editing a roster entry (S31 §2.1) ──────────────────────────────────────
//
// 🔴 WHY THESE EXIST AT ALL. `updateCoach` accepts five keys and, until this
// commit, the app passed exactly one of them (`availability`). `name`, `aliases`,
// `userId` and `active` could only be set by editing localStorage by hand — and
// every gate was green, because a field nothing writes breaks nothing. The
// audit in `storeWriters.test.js` is the check that would have caught it.
//
// The parse/patch split is what makes the rename rule testable without a DOM:
// the panel owns the text boxes, this owns the decision about what the text
// means.

// Comma-separated text → a clean alias list. Blanks dropped; ordering kept, so a
// gym that types them in a deliberate order gets them back that way.
// (`updateCoach` still deduplicates by match key — this does not second-guess it.)
export function parseAliases(text) {
  return String(text ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

// The inverse, for seeding the input from a stored entry.
export function formatAliases(list) {
  return (list || []).join(", ");
}

// A draft from the edit form → the patch `updateCoach` should receive.
//
// 🔴 THE RENAME RULE, and it matters more here than it does for a movement.
// A class carries the coach's name as TEXT (`class_schedule_rules.coach`), and
// `resolveCoach` matches it against the entry's name and aliases. So renaming
// "Mara" to "Mara Kelly" without keeping "Mara" would silently unlink every
// class she already teaches — the roster entry would still exist, the schedule
// would still say "Mara", and the two would stop being the same person. The old
// name is therefore carried into the aliases unless the gym already typed it
// there. `PersonasScreen` does the same thing for movements (line ~1520) for
// the weaker version of this reason.
//
// A rename that only changes case or spacing is NOT a rename — `coachKey` folds
// those — so it adds no alias, which is what stops "Mara" → "mara" leaving a
// duplicate behind.
export function coachEditPatch(entry, draft = {}) {
  const name = String(draft.name ?? entry?.name ?? "").trim();
  const aliases = parseAliases(draft.aliasText);
  const old = String(entry?.name || "").trim();
  if (old && coachKey(name) !== coachKey(old) && !aliases.some(a => coachKey(a) === coachKey(old))) {
    aliases.push(old);
  }
  return {
    name,
    aliases,
    active: draft.active !== false,
    userId: String(draft.userId ?? entry?.userId ?? "").trim(),
  };
}

// ─── Who is looking at this roster (S32 §2.2) ───────────────────────────────
//
// 🔴 THE PROBLEM. `CoachCoverPanel` lives on the Schedule screen and renders
// every roster entry with Edit, Availability and Remove. A `coach` role has
// `schedule:*` (supabase.js ROLE_DEFAULTS), so the moment a gym has a server and
// its coaches sign in, every one of them can edit everybody else's availability
// and delete anyone from the roster. Nobody chose that; it is what a panel built
// for one device does when a second person arrives.
//
// ⚠️ AND IT COULD NOT HAVE BEEN FIXED BEFORE NOW. The panel's own comment above
// the Approve buttons says so: "with no server there is no signed-in user, so
// the product genuinely cannot tell who is holding the phone. Scoping the
// buttons would require inventing an identity we do not have." That was true and
// it stopped being true in S31, which built the control that writes `userId` on
// a roster entry. `selfCoach` is the bridge that answers "which of these is me",
// and it is the first time the question has had an answer.
//
// THE THREE MODES, and why "unlinked" is not folded into either neighbour:
//
//   "manage"   — this viewer administers the roster. The panel exactly as it has
//                always been. THIS IS ALSO THE NO-SERVER ANSWER, which is the
//                shipped build: with no identity there is nothing to scope by,
//                and a panel that locked itself down because it could not tell
//                who you are would break the single-device gym for no gain.
//   "self"     — a coach, matched to their own entry. Their row, their grid,
//                their requests. Cannot touch anyone else's.
//   "unlinked" — a coach whose account is not on the roster. NOT "self" (there
//                is no row to show) and NOT "manage" (they may not administer
//                anything). Collapsing it into "manage" is the dangerous
//                simplification: it would hand the full roster to every coach a
//                manager has not linked yet, which is most of them on day one.
//
// The capability is `members:manage`, reused rather than invented. It is what
// already gates the Team screen — the gym's staff ACCOUNTS — so "who may
// administer this gym's people" is a question this product has answered once,
// and answering it a second way is how the two drift apart.

// The roster entry a signed-in account IS, or null. Null is a normal answer:
// most roster entries have no account, and an account may be a manager who does
// not coach. Migration 0010 carries a unique index on (gym_id, user_id), so
// "the first match" is "the only match" by construction rather than by luck.
export function selfCoach(roster, userId) {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  return (roster || []).find(e => e && e.userId === id) || null;
}

// `can` is absent exactly when there is no server to sign in to, and that is
// checked FIRST and deliberately: this function can only ever narrow the panel
// for a viewer it has positively identified, never for one it knows nothing
// about. A bug in the identity link therefore fails toward the behaviour that
// shipped, not toward locking a gym out of its own roster.
export function rosterViewerMode({ can, userId, roster } = {}) {
  if (typeof can !== "function") return "manage";
  if (can("members:manage")) return "manage";
  return selfCoach(roster, userId) ? "self" : "unlinked";
}

// The classes this viewer may raise a cover request FOR. A manager asks on
// behalf of the whole schedule; a coach asks for the classes they teach, which
// is resolved through the same name-and-alias rule as everything else rather
// than a second comparison — "Mara K." teaching a class typed "Mara" is one
// person here or the roster is lying somewhere.
export function askableClasses(classes, mode, me) {
  if (mode === "manage") return classes || [];
  if (!me) return [];
  return (classes || []).filter(c => resolveCoach([me], c?.coach));
}

// The gym's accounts, shaped for the link picker.
//
// ⚠️ AN ACCOUNT ALREADY LINKED TO ANOTHER ENTRY IS RETURNED, NOT DROPPED, and
// carries `takenBy`. Omitting it would leave a manager looking for a name that
// is demonstrably in their Team list with no explanation for its absence; the
// UI disables it and says who has it. Two roster entries pointing at one account
// would make `coachAccountFor` answer with whichever came first in the list,
// which is a coin-flip dressed as an identity.
export function linkableAccounts(memberships, roster, forCoachId) {
  const taken = new Map();
  for (const c of roster || []) {
    if (c && c.userId && c.id !== forCoachId) taken.set(c.userId, c.name || "another coach");
  }
  return (memberships || [])
    .filter(m => m && m.user_id)
    .map(m => ({
      userId: m.user_id,
      label: m.profiles?.name || m.profiles?.email || "Unnamed account",
      email: m.profiles?.email || "",
      takenBy: taken.get(m.user_id) || "",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
