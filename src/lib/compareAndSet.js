// ─── Compare-and-set against PostgREST (S31 §2.3) ────────────────────────────
//
// 🔴🔴 THIS HAS NEVER MADE A REAL REQUEST. Nothing in the product calls it, and
// nothing can: the table it was written for (`cover_requests`, migration
// `0010_coach_cover.sql`) has never been applied — DYLAN-QUEUE A15. Every
// assertion about it in `compareAndSet.test.js` is against a FAKE that models
// what PostgREST is documented to do. Treat it as a specification with a test
// suite, not as code that is known to work, and the first time it runs for real,
// check the two contract assumptions named below before trusting the result.
//
// WHY IT EXISTS AT ALL, given that. `store.js` contains ZERO `.update()` calls —
// every write is an unconditional `upsert`, `insert` or `delete`, and the only
// three `.update()`s in the app (AuthGate, AdminTeamScreen) are unconditional
// too. So there is no compare-and-set anywhere in this product, and the day 0010
// runs, whoever wires the settle will reach for `_bgUpsertDelta` because that is
// the pattern the file is full of. That would be wrong in the worst way
// available: two coaches both approving would BOTH succeed, last writer wins,
// and one of them is shown an approval that did not happen. Nothing would log,
// nothing would fail, and the ledger would say the table synced.
//
// ⚠️ THE ARGUMENT AGAINST BUILDING THIS IS REAL and was taken seriously. The repo
// already carries two pieces of code that have never run in anger (the N4 Edge
// Functions, migrations 0005/0006), and a primitive that is WRONG is worse than
// one that is absent, because the next session will trust it. What tips it is
// that the alternative is not "no primitive" — it is `_bgUpsertDelta`, which is
// definitely wrong here. A written, tested, explicitly-unverified spec is a
// better thing to inherit than a silent misuse of the wrong tool.
//
// ── THE TWO CONTRACT ASSUMPTIONS ────────────────────────────────────────────
// Both are what PostgREST documents. Both are the things to check first if this
// ever behaves oddly against a real server, and both are pinned by the tests.
//
//   1. `.update(patch).eq(...).select()` RETURNS THE ROWS IT CHANGED. Without
//      the `.select()`, PostgREST returns no representation and `data` is null —
//      which this code would read as "lost the race" on a write that actually
//      won. The `.select()` is load-bearing, not decoration.
//
//   2. AN UPDATE MATCHING NOTHING IS NOT AN ERROR. It returns `data: []` with
//      `error: null`. So an empty array is the LOSING branch, and it must never
//      be conflated with the error branch — losing a race is a normal outcome
//      the caller has to render; a failed request is not.
//
// 🔴 AND THE REASON THIS IS SAFE WHERE AN UPSERT IS NOT: a single-row UPDATE
// takes a row lock, so a second writer BLOCKS and then re-evaluates its guard
// against the committed value. That is what makes "where status = 'open'" an
// actual mutual exclusion rather than a read-then-write with a gap in it. 0010's
// own schema comments (lines 112–118) say the same thing.

// The three outcomes, named rather than booleaned, because "false" would have to
// mean both "somebody else got there first" and "the request failed" — and those
// need different words on screen. `settleCover` already draws this distinction
// locally; this is the server-side half of the same idea.
export const CAS_WON  = "won";     // the guard held and the row is ours
export const CAS_LOST = "lost";    // the guard did not hold — somebody else settled it
export const CAS_FAIL = "failed";  // the request itself did not complete

/**
 * Conditionally update one row: set `patch` on `table` where `id` matches AND
 * every column in `guard` still holds its expected value.
 *
 * @param client   a Supabase client (or anything with the same `.from()` chain)
 * @param table    table name
 * @param id       primary key value
 * @param guard    { column: expectedValue } — ALL must still hold
 * @param patch    columns to write
 * @returns { outcome: CAS_WON | CAS_LOST | CAS_FAIL, row, error }
 */
export async function compareAndSet(client, table, id, guard, patch) {
  if (!client) return { outcome: CAS_FAIL, row: null, error: "no client" };
  if (!id) return { outcome: CAS_FAIL, row: null, error: "no id" };
  if (!guard || Object.keys(guard).length === 0)
    // An empty guard is an UNCONDITIONAL update wearing this function's name,
    // which is the one way this primitive could quietly become the bug it
    // exists to prevent. Refused rather than allowed through.
    return { outcome: CAS_FAIL, row: null, error: "compareAndSet needs a guard" };

  try {
    let q = client.from(table).update(patch).eq("id", id);
    for (const [col, val] of Object.entries(guard)) q = q.eq(col, val);

    // Assumption 1. Without `.select()` there is no representation to count.
    const { data, error } = await q.select();

    if (error) return { outcome: CAS_FAIL, row: null, error: error.message || String(error) };

    // Assumption 2. Zero rows is the guard failing, NOT an error.
    const rows = data || [];
    if (rows.length === 0) return { outcome: CAS_LOST, row: null, error: "" };

    // More than one row means the `id` filter did not identify a single row —
    // a missing primary key, or an `id` column that is not unique. That is a
    // schema fault, and reporting it as a win would hand the caller one
    // arbitrary row out of several it silently changed.
    if (rows.length > 1)
      return { outcome: CAS_FAIL, row: null,
               error: `compareAndSet matched ${rows.length} rows on ${table}.id — not a unique key` };

    return { outcome: CAS_WON, row: rows[0], error: "" };
  } catch (e) {
    return { outcome: CAS_FAIL, row: null, error: e?.message || String(e) };
  }
}
