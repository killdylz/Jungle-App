# Which store fields can the product actually write?

**Session 31 §2.2.** Run it yourself: `node scripts/audit-store-writers.mjs`.
The rule it generalises into is pinned by `src/lib/storeWriters.test.js`.

## Why this exists

Session 30 shipped `updateCoach` accepting five keys while the app passed exactly
one. `name`, `userId`, `active` and `aliases` could only be set by editing
`localStorage` by hand. **1019 tests passed**, because no test can notice an
absence — there is nothing to assert about a control that was never built.

`active` is the one that shows why this matters. It is not merely unwritten, it is
**read**: `coachesFreeAt` (`coachRoster.js:242`) excludes `active === false`, with a
comment explaining that this is the gym saying a person no longer coaches here. A
documented behaviour, with a live reader, that the product could not reach.

## The answer to the big question

**§2.2 asked what else in this product exists in the model with no way in. The
answer is: almost nothing. Session 30's roster was an outlier, not a pattern.**

That is worth stating plainly, because the prompt asked for the opposite finding
to be escalated. Across 4 patch-shaped writers (11 accepted keys) and 31 fields
named in the store's own "Local shape" comments, the sweep found **one** field
with a live reader and no writer: `externalRef`. Everything else was either
written by a control, written by an import path, or a reasoned seam.

So the next sessions do **not** need to be about unreachability.

## The list

| Key | Verdict |
|---|---|
| `updateCoach.name` / `.aliases` / `.userId` / `.active` | **was missing control** — fixed in §2.1 (`c42b740`) |
| `addMember.externalRef` | **written elsewhere** — the CSV import builds the member row directly; `applyAttendanceImport` stores it |
| `updateMember.externalRef` | **deliberately not hand-editable** — see below |
| `addCoach.id` | **seam** — `extra.id \|\| newId()`, for tests and seeds. No gym types a coach's internal id |
| `updateMember.name` / `.email` / `.joinedAt` / `.status` | written by RosterScreen's edit form |
| `updateCoach.availability` | written by the availability grid |
| `addMember.email` / `.joinedAt` | written by RosterScreen's add form |

### `externalRef` — the one real finding

Never written by anything. Always `""`. And **read**: `csvExport.js:224` emits it as
a **"Reference"** column in the members CSV, so every gym's export carried a blank
column promising a reference to their previous system. (`csvExport.js:131` is
self-suppressing and was fine.) It also round-trips to the real server column
`external_ref`.

Fixed by giving it its writer on the one path where the value actually exists: a
column in the file the old system exported. `COLUMNS.externalRef` in `csvImport.js`,
carried through `newMembers` into `applyAttendanceImport`.

**Not** given a hand-edit control in the roster form. That form edits the four
things a human knows; an external reference is another system's key, and a
hand-typed one that does not match that system is a confident wrong answer where a
blank was merely empty.

**Not deleted**, either — deleting it would pre-empt `DYLAN-QUEUE` **A16** (should
Jungle write back to a gym's booking system at all?), which is explicitly not this
session's to answer.

## What the sweep cannot see

Stated so the output is not over-trusted:

- `save*(list)` writers take a whole object or array rather than a patch. They are
  **listed as explicitly unchecked** rather than silently omitted.
- Resolution follows two hops — a local `const`, a `useState` initial value, and one
  level of "the object this function returns". Anything deeper is reported as
  **opaque**, never as missing.
- A field written as `obj.field = value` rather than in an object literal.
  **This produced the sweep's only false positive**: a crude field-level grep
  flagged `weekKey` as unwritten, and it is written at `CalendarScreen.jsx:275`.
  Caught by reading the result, not by trusting the count — which is the entire
  reason this file says "audit first, test second".

## The positive control

A sweep that matched nothing and a sweep that found nothing are indistinguishable
from the assertion's side, and this repo has been fooled by exactly that.

`storeWriters.test.js` carries the control in the same run: **the allowlist is the
control.** The known-unwritten keys must still be found, every writer must resolve
at least one accepted key, and at least four writers must be located. If the parser
breaks or a path moves, those assertions fail rather than the suite going green on
an audit that is reading nothing.

Verified end to end: run against `fa54c4a` (the commit before §2.1) the audit
reports exactly `active, aliases, name, userId` on `updateCoach` — the known-good
answer — and at `HEAD` it reports none. Re-introducing session 30's defect fails
the test and **names the four fields**.
