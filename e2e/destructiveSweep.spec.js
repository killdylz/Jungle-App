import { test, expect } from "@playwright/test";
import { freshApp, nav, waitForApp, ALL_SCREENS } from "./helpers.js";
import { usedGym, captureSampleCoach, installGym } from "./usedGym.js";

// ── The sweep that goes LOOKING for the next unguarded destructive control ────
//
// `destructive.spec.js` opens with "every destructive action, reversed" and then
// enumerates the ones somebody thought of. Session 38 found FOUR outside that
// list in a single file — the stage removal, Smart Distribute, and both doors of
// the Build dialog — by walking the Class Builder by hand. That is not a gap in
// the list. It is the method failing: an enumeration can only ever contain what
// its author already knew, and the whole point of the rule it enforces is that
// the next control nobody thought of is the dangerous one.
//
// So this file does not name any control. It presses every control on every
// screen and asks one question of each press:
//
//     did the gym LOSE something, and if it did, was it offered back?
//
// ── What counts as a loss ────────────────────────────────────────────────────
//
// Not "the store changed" — adding a member, checking someone in and saving a
// plan all change the store and none of them is destruction. The store is
// compared structurally, and a loss is one of:
//
//   · a row with an `id` that existed before the press and does not after;
//   · a list without ids (a stage's `exercises`, a coach's `aliases`) that lost
//     a member — reordering it is not a loss, the comparison is a multiset;
//   · an array or object replaced by something that is not one.
//
// A scalar changing is deliberately NOT a loss: a counter incrementing, a status
// moving `active → cancelled`, a timestamp being rewritten are all writes rather
// than destruction, and treating them as losses would bury the real finding in
// noise. That is the sweep's biggest blind spot and it is stated here rather
// than discovered later: a SOFT delete — a row flagged `deleted: true` and
// filtered out of every screen — is invisible to this file.
//
// ── What counts as a guard ───────────────────────────────────────────────────
//
//   · the press raised a native dialog (which is DISMISSED, so nothing is lost);
//   · the press put a confirm on screen and wrote nothing yet;
//   · the press destroyed something AND offered `toast-undo`.
//
// A press that destroyed something with neither is the finding.
//
// ⚠️ Playwright auto-dismisses dialogs, and here that is exactly right rather
// than a trap to work around: dismissing is what makes a `window.confirm` behave
// as a guard, so the sweep sees "asked, nothing lost". The trap version would be
// to let it dismiss SILENTLY — the handler below records every dialog, because a
// control that asked and a control that did nothing are otherwise identical.
//
// ⚠️ POSITIVE CONTROL, twice over, because a sweep that found nothing and a
// sweep that ran over nothing are indistinguishable from the assertion's side
// and this repo has been fooled by that twice in one session:
//
//   1. `the loss detector detects a loss` runs the comparator over hand-built
//      before/after pairs, including the three that must NOT count.
//   2. Every screen sweep asserts it actually pressed things, and the screens
//      that are known to hold guarded destructive controls assert that the sweep
//      FOUND them and classified them as guarded. If a seeding change empties
//      the Coaches screen, that test fails instead of passing quietly.

const GYM_KEYS = [
  // The gym's own records. Bookkeeping keys (`jungle_sync_errors`,
  // `jungle_synced_rows`, `jungle_pending_deletes`, `jungle_crash_log`,
  // `jungle_checkin_metrics`, the `dj_*` prefs) are deliberately absent: they
  // churn on their own and a sweep that watched them would report the retry
  // ledger as a data loss.
  "jungle_members", "jungle_class_instances", "jungle_attendance",
  "jungle_retention_actions", "jungle_user_classes", "jungle_draft_class",
  "jungle_coaches", "jungle_coach_absences", "jungle_cover_requests",
  "jungle_personas", "jungle_persona_plans", "jungle_persona_movements",
  "jungle_persona_generations", "jungle_library_custom", "jungle_history",
  "jungle_pt_clients", "jungle_parq_records", "jungle_pt_sessions",
  "jungle_gym_branding",
];

// A short human label for a row, for the failure message. `id` alone would make
// every finding read "row 1758… gone".
const label = (row) =>
  (row && (row.name || row.title || row.n || row.planName || row.goal || row.id)) ||
  JSON.stringify(row).slice(0, 40);

// ── Census: everything the gym holds under one key, wherever it is nested ─────
//
// 🔴 Counted GLOBALLY per key, not per list, and that is the whole trick. The
// first version compared each array against its counterpart and reported the
// Builder's "Move <exercise> to another stage" as destruction: the exercise DID
// leave the list it was in. It arrived in the next one, and nothing was lost.
// A sweep that cries about a move is a sweep nobody will keep running.
//
// So: two ledgers per key. Rows that carry an `id` are counted by id — a row
// that moves between two lists keeps its id and is not lost. Everything else
// (an exercise, an alias, a category — the things this product stores as plain
// members of a list) is counted as a multiset of its own JSON, so a reorder is
// free, a move is free, and only a element that is nowhere in the gym any more
// is a loss.
function census(v, out = { ids: new Map(), anon: new Map() }) {
  if (Array.isArray(v)) {
    for (const el of v) {
      const ided = el && typeof el === "object" && !Array.isArray(el) && el.id !== undefined;
      if (!ided) {
        const j = JSON.stringify(el);
        out.anon.set(j, (out.anon.get(j) || 0) + 1);
      }
      census(el, out);
    }
    return out;
  }
  if (v && typeof v === "object") {
    if (v.id !== undefined && !out.ids.has(v.id)) out.ids.set(v.id, label(v));
    for (const x of Object.values(v)) census(x, out);
    return out;
  }
  return out;
}

export function lostRows(before, after, path = "") {
  const out = [];
  if (before === null || before === undefined) return out;
  if ((after === null || after === undefined) && typeof before === "object") {
    out.push(`${path}: the whole record was replaced`);
  }
  const B = census(before);
  const A = census(after);
  for (const [id, name] of B.ids) if (!A.ids.has(id)) out.push(`${path}: ${name} is gone`);
  for (const [json, n] of B.anon) {
    if ((A.anon.get(json) || 0) >= n) continue;
    let parsed; try { parsed = JSON.parse(json); } catch { parsed = json; }
    out.push(`${path}: ${label(parsed)} is gone`);
  }
  return out;
}

const snapshot = (page) =>
  page.evaluate((keys) => {
    const o = {};
    for (const k of keys) { try { o[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch { o[k] = null; } }
    return o;
  }, GYM_KEYS);

function diffGym(before, after) {
  const out = [];
  for (const k of GYM_KEYS) {
    if (before[k] === null || before[k] === undefined) continue;
    out.push(...lostRows(before[k], after[k], k));
  }
  return out;
}

// Every pressable control that is NOT navigation. The sidebar and the bottom bar
// move between screens rather than writing, and pressing them would turn this
// into a navigation test with a sweep bolted on.
const CANDIDATES = () =>
  [...document.querySelectorAll("button, [role=button], select")]
    .filter((el) => {
      if (el.disabled) return false;
      if (el.closest("aside") || el.closest("nav")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

const candidateNames = (page) =>
  page.evaluate(`(${CANDIDATES.toString()})().map(el =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.tagName)
      .trim().replace(/\\s+/g, " ").slice(0, 48))`);

// Confirms that live in the app rather than in a native dialog. Detected by what
// they SAY, because that is the only thing they have in common — there is no
// shared confirm component to key on, which is itself worth knowing.
// Controls that take you to another screen rather than writing anything. The
// sweep still PRESSES them — a "Back" that ate the draft would be a finding —
// but it does not walk into what they reveal, because that is another screen's
// test.
const NAVIGATION = /^(Back|Close|Calendar →|Go to .*|Open the Class Runner|Open Class Runner|Room TV|Back to class plan|Preview on TV|▶ Start Session|Start Class|Start class|Add members|Resume building|Add a class)$/;

const CONFIRM_TEXT = /are you sure|cannot be undone|can.t be undone|permanently|delete .{0,40}\?|remove .{0,40}\?|reset .{0,40}\?|apply .{0,40}\?|discard/i;

async function confirmOnScreen(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, "i");
    return [...document.querySelectorAll("div, section, p, span, h1, h2, h3")]
      .some((el) => {
        if (el.children.length > 6) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && re.test(el.innerText || "");
      });
  }, CONFIRM_TEXT.source);
}

async function sweepScreen(page, screen) {
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

  const corpus = await captureSampleCoach(page, { freshApp, nav, expect });
  const blob = { ...usedGym(), ...corpus };

  const restore = async () => {
    await installGym(page, blob);
    await waitForApp(page);
    await nav(page, screen.side);
  };

  const r = { pressed: [], guarded: [], unguarded: [], skipped: [], descended: [], forced: [] };

  // Press the nth candidate and say what it did to the gym. Returns null when
  // the control could not be pressed at all.
  async function press(i, name, { allowRepeat = true } = {}) {
    const before = await snapshot(page);
    dialogs.length = 0;

    // A `<select>` is a control that writes too, and the Builder's "Jungle
    // presets…" — one of the four doors this file found — IS one. Its press is
    // choosing an option, not a click.
    const marked = await page.evaluate(([src, idx]) => {
      // eslint-disable-next-line no-eval
      const el = eval(`(${src})`)()[idx];
      if (!el) return null;
      el.setAttribute("data-sweep-target", "1");
      if (el.tagName !== "SELECT") return { kind: "click" };
      const other = [...el.options].map((o) => o.value).find((v) => v && v !== el.value);
      return { kind: "select", value: other || null };
    }, [CANDIDATES.toString(), i]);
    if (!marked) return null;

    const unmark = () =>
      page.evaluate(() => document.querySelector("[data-sweep-target]")?.removeAttribute("data-sweep-target"));

    // ⚠️ A live toast sits at the bottom of the viewport with `pointerEvents:
    // auto` and lives NINE seconds when it carries an Undo, so it covers whatever
    // control is under it and Playwright's actionability check turns a real
    // button into a "skipped" line — the sweep quietly stops sweeping, which is
    // the failure mode this whole file exists to avoid. Waiting it out costs nine
    // seconds a press and reloading to clear it costs a second; a forced second
    // attempt costs nothing and is recorded, so the report says when a press was
    // delivered past an obstruction rather than pretending it was a normal click.
    const attempt = async (force) => {
      const el = page.locator("[data-sweep-target]");
      if (marked.kind === "select") {
        if (!marked.value) throw new Error("no other option");
        await el.selectOption(marked.value, { timeout: force ? 3000 : 1500 });
      } else {
        await el.click({ timeout: force ? 3000 : 1500, noWaitAfter: true, force });
      }
    };
    try {
      await attempt(false);
    } catch {
      try { await attempt(true); r.forced.push(name); }
      catch { await unmark().catch(() => {}); return null; }
    }
    // 50ms of `setTimeout` sits between Smart Distribute's write and its toast,
    // so a read that is too eager sees neither the loss nor the undo.
    await page.waitForTimeout(200);
    await unmark().catch(() => {});

    const after = await snapshot(page);
    const lost = diffGym(before, after);
    const asked = dialogs.length > 0;
    const undo = await page.locator("[data-testid=toast-undo]").isVisible().catch(() => false);
    const confirmUp = lost.length === 0 ? await confirmOnScreen(page) : false;
    const wrote = JSON.stringify(before) !== JSON.stringify(after);

    r.pressed.push(name);
    if (lost.length === 0) {
      if (asked || confirmUp) r.guarded.push({ name, how: asked ? "asked (native)" : "asked (in-app)" });
      return { lost, wrote, asked: asked || confirmUp, undo };
    }
    if (undo) { r.guarded.push({ name, how: `undoable · ${lost.length} lost` }); return { lost, wrote, asked, undo }; }

    // ⚠️ A TOGGLE IS ITS OWN UNDO, and without this the sweep says otherwise.
    // "Mara free Mon 06:00" un-states an availability the coach stated, which is
    // a row leaving the store with no toast — and pressing the same cell again
    // puts it straight back. Demanding a separate undo of a checkbox would be
    // demanding the wrong product, so a press whose exact repeat reverses it is
    // guarded, and named as such rather than quietly excused.
    if (!asked && allowRepeat) {
      const again = await press(i, `${name} (repeat)`, { allowRepeat: false });
      // The repeat is an instrument, not a finding: whatever it recorded about
      // itself comes straight back off both ledgers.
      if (r.pressed[r.pressed.length - 1] === `${name} (repeat)`) r.pressed.pop();
      if (r.unguarded.length && r.unguarded[r.unguarded.length - 1].name === `${name} (repeat)`) r.unguarded.pop();
      if (r.guarded.length && r.guarded[r.guarded.length - 1].name === `${name} (repeat)`) r.guarded.pop();
      if (again && diffGym(before, await snapshot(page)).length === 0) {
        r.guarded.push({ name, how: "reversible by pressing it again (a toggle)" });
        return { lost, wrote, asked, undo, toggle: true };
      }
    }
    r.unguarded.push({ name, lost });
    return { lost, wrote, asked, undo };
  }

  await restore();
  const baseline = await candidateNames(page);
  const known = new Set(baseline);
  const descendedSignatures = new Set();
  // Two kinds of dirty, because they cost different amounts to clean up. A press
  // that only opened a modal is undone by Escape; a press that WROTE needs the
  // whole gym reinstalled, and the Schedule's thirty-five slot buttons make the
  // difference between a sweep that finishes and one that times out.
  let viewDirty = false;
  let storeDirty = false;

  // Cleaning up costs three different amounts and the sweep finishes or times
  // out on which one it picks. A modal closes on Escape; a screen that was
  // navigated away from comes back with two nav clicks; only a press that WROTE
  // needs the whole gym reinstalled and the page reloaded. The Schedule has 59
  // controls and 35 of them open the same form — paying a reload for each one
  // is the difference between a 40-second sweep and a timeout.
  const reset = async () => {
    if (storeDirty) { await restore(); viewDirty = false; storeDirty = false; return; }
    if (viewDirty) {
      await page.keyboard.press("Escape").catch(() => {});
      let back = await candidateNames(page);
      if (back.join("|") !== baseline.join("|")) {
        try {
          await nav(page, "Dashboard");
          await nav(page, screen.side);
          back = await candidateNames(page);
        } catch { back = []; }
        if (back.join("|") !== baseline.join("|")) await restore();
      }
    }
    viewDirty = false; storeDirty = false;
  };

  // ⚠️ Controls are located by NAME, not by position. A press that removes a row
  // shortens the list and every index after it shifts, and the first version of
  // this loop compared `now[i]` with `baseline[i]` and gave up: it skipped 28 of
  // the Schedule's 59 controls and reported it as a clean sweep. A sweep that
  // silently stops sweeping is worse than no sweep.
  const occurrenceOf = (list, name, nth) => {
    let seen = 0;
    for (let k = 0; k < list.length; k++) {
      if (list[k] !== name) continue;
      if (seen === nth) return k;
      seen++;
    }
    return -1;
  };

  for (let i = 0; i < baseline.length; i++) {
    if (viewDirty || storeDirty) await reset();
    const nth = baseline.slice(0, i).filter((n) => n === baseline[i]).length;
    let at = occurrenceOf(await candidateNames(page), baseline[i], nth);
    if (at === -1) {
      await restore();
      at = occurrenceOf(await candidateNames(page), baseline[i], nth);
      if (at === -1) { r.skipped.push(baseline[i]); continue; }
    }
    const i0 = at;

    const outcome = await press(i0, baseline[i]);
    if (!outcome) { r.skipped.push(baseline[i]); viewDirty = true; continue; }
    if (outcome.lost.length || outcome.wrote) storeDirty = true;
    if (outcome.asked) viewDirty = true;

    // ── One level down ───────────────────────────────────────────────────────
    // A screen's most dangerous controls are frequently NOT on the screen: they
    // are inside a card the coach expands, a modal a button opens, or a form a
    // slot reveals. "Open in Builder" — one of the four doors this file found —
    // lives inside a collapsed 1:1 client card and is invisible to a top-level
    // scan. So a press that revealed controls gets those pressed too.
    //
    // ⚠️ Deduplicated by the SHAPE of what was revealed, not by the parent: the
    // Schedule has thirty-five "Add a class on <day> at <time>" buttons opening
    // one identical form, and descending into each would be thirty-four
    // repetitions of the same walk for no extra coverage.
    if (outcome.lost.length) continue;
    const revealedList = await candidateNames(page);
    const revealedIdx = revealedList
      .map((n, j) => [n, j])
      .filter(([n]) => n && !known.has(n));
    if (!revealedIdx.length) continue;
    viewDirty = true;
    // ⚠️ Not into navigation. "Back", "Calendar →" and "Go to Members" reveal
    // another SCREEN's controls, which that screen's own test already walks —
    // descending would triple the run to re-find what is already covered.
    if (NAVIGATION.test(baseline[i])) continue;
    const signature = revealedIdx.map(([n]) => n).join("|");
    if (descendedSignatures.has(signature)) continue;
    descendedSignatures.add(signature);
    r.descended.push(`${baseline[i]} → ${revealedIdx.length}`);

    const revealedNames = revealedIdx.map(([n]) => n);
    for (let c = 0; c < revealedNames.length; c++) {
      const childName = revealedNames[c];
      const childNth = revealedNames.slice(0, c).filter((n) => n === childName).length;
      const reopen = async () => {
        await restore();
        const back = occurrenceOf(await candidateNames(page), baseline[i], nth);
        if (back === -1) return false;
        await press(back, `${baseline[i]} (reopen)`);
        r.pressed.pop();
        // A reopen that re-raises the same confirm must not be counted twice.
        if (r.guarded.length && r.guarded[r.guarded.length - 1].name.endsWith("(reopen)")) r.guarded.pop();
        return true;
      };
      let at = occurrenceOf(await candidateNames(page), childName, childNth);
      if (at === -1) {
        if (!(await reopen())) break;
        at = occurrenceOf(await candidateNames(page), childName, childNth);
        if (at === -1) { r.skipped.push(`${baseline[i]} › ${childName}`); continue; }
      }
      const child = await press(at, `${baseline[i]} › ${childName}`);
      if (child && (child.lost.length || child.wrote || child.asked)) {
        if (!(await reopen())) break;
      }
    }
  }

  return { ...r, baseline };
}

function report(screen, r) {
  const lines = [
    `${screen.side}: pressed ${r.pressed.length} (${r.baseline.length} on the screen, ` +
      `${r.descended.length} opened something worth walking into)` +
      (r.forced.length ? ` · ${r.forced.length} pressed past a toast` : "") +
      (r.skipped.length ? ` · skipped ${r.skipped.length}: ${r.skipped.join(", ")}` : ""),
    ...r.guarded.map((g) => `   ✅ ${g.name} — ${g.how}`),
    ...r.unguarded.map((u) => `   🔴 ${u.name} — destroyed with no confirm and no undo:\n       ${u.lost.slice(0, 6).join("\n       ")}`),
  ];
  return lines.join("\n");
}

test.describe("no control destroys the gym's data unguarded", () => {
  test("the loss detector detects a loss — and does not cry about a write", () => {
    // 1. A row deleted.
    expect(lostRows([{ id: "m1", name: "Sarah" }, { id: "m2", name: "Raj" }],
                    [{ id: "m2", name: "Raj" }], "members"))
      .toEqual(["members: Sarah is gone"]);
    // 2. A list without ids, emptied — Smart Distribute's shape.
    expect(lostRows({ stages: [{ id: "s1", name: "Warm", exercises: [{ n: "Jog" }] }] },
                    { stages: [{ id: "s1", name: "Warm", exercises: [] }] }, "draft"))
      .toEqual(["draft: Jog is gone"]);
    // 3. The whole key replaced.
    expect(lostRows([{ id: "a", name: "A" }], null, "k"))
      .toEqual(["k: the whole record was replaced", "k: A is gone"]);

    // And the four that must NOT read as losses, or every real finding drowns in
    // them. The last is the one that actually bit: the first version of this
    // comparator reported the Builder's "Move <exercise> to another stage" as
    // destruction, because it compared each list against its counterpart and the
    // exercise really had left the first one.
    expect(lostRows([{ id: "m1", name: "Sarah" }],
                    [{ id: "m1", name: "Sarah" }, { id: "m2", name: "Raj" }], "members")).toEqual([]);
    expect(lostRows({ ex: [{ n: "A" }, { n: "B" }] }, { ex: [{ n: "B" }, { n: "A" }] }, "d")).toEqual([]);
    expect(lostRows([{ id: "m1", status: "active", visits: 3 }],
                    [{ id: "m1", status: "cancelled", visits: 4 }], "members")).toEqual([]);
    expect(lostRows(
      { stages: [{ id: "s1", exercises: [{ n: "Jog" }] }, { id: "s2", exercises: [] }] },
      { stages: [{ id: "s1", exercises: [] }, { id: "s2", exercises: [{ n: "Jog" }] }] }, "draft"))
      .toEqual([]);

    // …but a move is not a licence to lose a duplicate. Two "Jog"s in, one out.
    expect(lostRows(
      { stages: [{ id: "s1", exercises: [{ n: "Jog" }, { n: "Jog" }] }] },
      { stages: [{ id: "s1", exercises: [{ n: "Jog" }] }] }, "draft"))
      .toEqual(["draft: Jog is gone"]);
  });

  // Screens with known destructive controls must FIND them. The number is a
  // floor, not a fingerprint: a new guarded control should not fail a test.
  const EXPECT_GUARDED = {
    builder: 1,   // the stage removals, Smart Distribute, the Build dialog doors
    personas: 1,  // delete coach, remove plan, delete movement
    calendar: 1,  // remove a class from the week
    library: 1,   // delete a movement, Reset to Defaults
  };

  for (const screen of ALL_SCREENS) {
    test(`${screen.side} — every control pressed, nothing lost without a way back`, async ({ page }) => {
      test.setTimeout(240_000);
      const r = await sweepScreen(page, screen);
      // eslint-disable-next-line no-console
      console.log(report(screen, r));

      expect(r.pressed.length, `${screen.side}: the sweep must actually press something`)
        .toBeGreaterThanOrEqual(1);

      const floor = EXPECT_GUARDED[screen.key];
      if (floor) {
        expect(r.guarded.length,
          `${screen.side} is known to hold guarded destructive controls and the sweep found none — ` +
          `the fixture or the selector is what broke, not the product`).toBeGreaterThanOrEqual(floor);
      }

      expect(r.unguarded.map((u) => `${u.name}: ${u.lost[0]}`),
        `${screen.side}: destroyed data with no confirm and no undo`).toEqual([]);
    });
  }
});
