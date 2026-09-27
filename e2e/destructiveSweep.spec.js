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
  bounded(page.evaluate((keys) => {
    const o = {};
    for (const k of keys) { try { o[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch { o[k] = null; } }
    return o;
  }, GYM_KEYS), null);

function diffGym(before, after) {
  const out = [];
  // A read that could not be taken (see `bounded`) is not an empty gym — it is
  // no answer at all, and treating it as one would report every row as lost.
  if (!before || !after) return out;
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

const NAME_OF = (el) =>
  (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.tagName)
    .trim().replace(/\s+/g, " ").slice(0, 48);

const candidateNames = (page) =>
  bounded(page.evaluate(`(${CANDIDATES.toString()})().map(${NAME_OF.toString()})`), []);

// ── One round trip for everything a press has to be judged on ────────────────
//
// 🔴 THIS FILE'S COST IS A CORRECTNESS PROBLEM, NOT A TIDINESS ONE. A sweep that
// runs longer than its own timeout does not report a defect, it reports a
// timeout — and on 2026-09-08 the Class Builder screen did exactly that inside a
// full run, on a tree nobody had touched. Session 39 measured the file at
// ~4m40s; on the machine that failed it is ~13m, with Schedule alone spending
// 207s of its 240s budget. Measured, per screen:
//
//   Schedule, 182 presses    restore 73.4s (106 × 692ms) · the fixed wait 59.5s
//                            snapshot 13.3s · names 6.2s · confirm 3.9s
//
// The wait half used to be `waitForTimeout(200)` followed by FIVE more round
// trips — unmark, the store, the undo toast, the in-app confirm, the control
// list — each paying ~20ms of CDP on top of its own work. All six happen in one
// evaluate now, inside the page, and the sweep is doing exactly what it did
// before with a fifth of the traffic.
//
// 🔴 THE 200ms IS NOT NEGOTIABLE AND I TRIED. The obvious next step is to make
// the wait adaptive — settle as soon as the store has been quiet for 80ms — and
// it silently costs COVERAGE: the Class Builder went from 68 presses to 47, with
// 23 controls skipped under "Smart Distribute". The 200ms is not only waiting
// for the 50ms `setTimeout` between Smart Distribute's write and its toast, it
// is waiting for a MODAL TO FINISH ARRIVING, and the descent reads its control
// list from this same moment. A settle that watches the store cannot see that.
// A sweep that quietly stops sweeping is the exact failure this file was written
// to avoid, so the wait stays fixed and the saving comes from the round trips.
// ── 🔴 NO `page.evaluate` IN THIS FILE MAY RUN UNBOUNDED ─────────────────────
//
// `page.evaluate` has no timeout. A page that stops answering — and one does,
// reproducibly, after the Profile modal's "Sign Out", which this sweep could
// never reach until the second look below let it — takes the WHOLE test down
// with it: the sweep sits in one evaluate for 240 seconds and Playwright reports
// a timeout naming whatever call was pending, which is never the control that
// caused it. That is the same failure this file exists to avoid, one level below
// the sweep: a timeout is not a finding.
//
// So every read is bounded. A read that cannot be taken returns the fallback,
// the press is recorded as skipped, and the report says so — an answer the next
// session can act on, instead of a stack trace pointing at `localStorage.clear`.
const READ_MS = 8000;
const bounded = (promise, fallback) =>
  Promise.race([promise, new Promise((res) => setTimeout(() => res(fallback), READ_MS))])
    .catch(() => fallback);

const SETTLE_MS = 200;

// ── ⚠️ THE SWEEP CANNOT DESCEND INTO A `React.lazy` PANEL, AND NEVER COULD ───
//
// `ProfileModal` and `LibraryBrowserModal` are `React.lazy` (App.jsx:93-96), so
// the press that opens one starts a dynamic import and the panel renders only
// when the chunk lands — well after `SETTLE_MS`. The revealed set is empty and
// the press is recorded as having opened nothing.
//
// The old code reached the Profile modal only BY ACCIDENT: that press failed its
// actionability check, waited 1500ms and was then forced, so its revealed set
// was read nearly two seconds late. Removing the forced path (above) took the
// accident away, which is how this was found.
//
// 🔴 A SECOND LOOK WAS WRITTEN AND REMOVED, and the reason is worth more than the
// code was. Waiting for the control count to move recovers the descent on eight
// screens — and it then reaches the Profile modal's "Sign Out", which no run of
// this sweep had ever pressed. Pressing it leaves the page unable to run ANY
// `page.evaluate`: no dialog, no page error, a screenshot that looks perfectly
// normal, and every subsequent read hangs until Playwright kills the test at
// 240s. `installGym`'s `localStorage.clear()` is where it lands, which is why
// the failure names a line that has nothing to do with it.
//
// That is a real defect in something — the sweep, the modal, or the dev server —
// and it is not this commit's to chase. It is written up in the handoff with the
// evidence. Until it is understood, the descent into a lazy panel stays missing,
// which is a known gap rather than an accident.


// ⚠️ `reject` IS NOT OPTIONAL HERE, and leaving it out cost a 240s timeout.
// Everything below runs inside a `setTimeout` callback, so a throw in it — a
// detached node, a bad regexp source, anything — escapes to the page's error
// handler and the promise is NEVER SETTLED. `page.evaluate` has no timeout of
// its own, so the sweep sits in one evaluate until Playwright kills the test,
// and the failure it reports names whatever call happened to be pending. The
// old code asked these questions in five separate evaluates, each of which
// rejected promptly on a throw; folding them into one took that away.
const POST_PRESS = ({ keys, confirmSrc, candSrc, nameSrc, waitMs }) =>
  new Promise((resolve, reject) => setTimeout(() => {
  try {
    document.querySelector("[data-sweep-target]")?.removeAttribute("data-sweep-target");
    const store = {};
    for (const k of keys) {
      try { store[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch { store[k] = null; }
    }
    const re = new RegExp(confirmSrc, "i");
    const confirmUp = [...document.querySelectorAll("div, section, p, span, h1, h2, h3")].some((el) => {
      if (el.children.length > 6) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && re.test(el.innerText || "");
    });
    const u = document.querySelector("[data-testid=toast-undo]");
    const undo = !!u && u.getBoundingClientRect().width > 0 &&
      (typeof u.checkVisibility !== "function" || u.checkVisibility());
    // eslint-disable-next-line no-eval
    const names = eval(`(${candSrc})`)().map(eval(`(${nameSrc})`));
    resolve({ store, confirmUp, undo, names, toast: !!document.querySelector("[data-testid=toast]") });
  } catch (e) { reject(new Error(String((e && e.message) || e))); }
  }, waitMs));

const postPress = (page) =>
  page.evaluate(POST_PRESS, {
    keys: GYM_KEYS, confirmSrc: CONFIRM_TEXT.source,
    candSrc: CANDIDATES.toString(), nameSrc: NAME_OF.toString(),
    waitMs: SETTLE_MS,
  });

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

  // ⚠️ Bounded like every other read, and for a sharper reason: `installGym`
  // opens with a `page.evaluate`, so a wedged page hangs HERE, and the timeout
  // Playwright then reports names `localStorage.clear()` — a line that has
  // nothing to do with the control that caused it. Failing fast and saying so is
  // worth more than four minutes of waiting and a misleading stack.
  const restore = async () => {
    const ok = await bounded(installGym(page, blob).then(() => true), false);
    if (!ok) throw new Error(
      "the page stopped answering page.evaluate, so the gym could not be reinstalled — " +
      "the press before this one wedged it; see the note above CANDIDATES");
    await waitForApp(page);
    await nav(page, screen.side);
  };

  const r = { pressed: [], guarded: [], unguarded: [], skipped: [], descended: [], forced: [], obstructed: [] };

  // Press the nth candidate and say what it did to the gym. Returns null when
  // the control could not be pressed at all.
  async function press(i, name, { allowRepeat = true } = {}) {
    const before = await snapshot(page);
    // ⚠️ A snapshot that could not be TAKEN is not a gym with nothing in it.
    // Comparing against `{}` would report every row in the gym as lost.
    if (!before) return null;
    dialogs.length = 0;

    // A `<select>` is a control that writes too, and the Builder's "Jungle
    // presets…" — one of the four doors this file found — IS one. Its press is
    // choosing an option, not a click.
    const marked = await bounded(page.evaluate(([src, idx]) => {
      // eslint-disable-next-line no-eval
      const el = eval(`(${src})`)()[idx];
      if (!el) return null;
      el.setAttribute("data-sweep-target", "1");
      if (el.tagName !== "SELECT") return { kind: "click" };
      const other = [...el.options].map((o) => o.value).find((v) => v && v !== el.value);
      return { kind: "select", value: other || null };
    }, [CANDIDATES.toString(), i]), null);
    if (!marked) return null;

    const unmark = () =>
      page.evaluate(() => document.querySelector("[data-sweep-target]")?.removeAttribute("data-sweep-target"));

    // ── 🔴 FORCING A CLICK PAST AN OBSTRUCTION IS A PRESS THAT DID NOT HAPPEN ──
    //
    // This used to fall back to `{ force: true }` whenever the actionability
    // check failed, on the reasoning that the obstruction was a live toast and a
    // forced click "costs nothing and is recorded". Both halves were wrong, and
    // the cost was the sweep's coverage.
    //
    // Run the Class Builder screen three times on an untouched tree and it
    // presses 68, then 50, then 51 controls. The report never says so, because
    // the presses it loses are recorded as pressed. What is actually covering the
    // control is usually not a toast but a PANEL AN EARLIER PRESS LEFT OPEN —
    // measured, by reading `elementFromPoint` at the moment the click failed:
    //
    //   Back              ← the Profile modal   ("👤 Profile  🎨 Gym Branding")
    //   Smart Distribute  ← the class-style panel ("WOD (Workout of the Day)…")
    //   Settings          ← the Exercise Library  ("Thruster")
    //
    // `force: true` then delivers the click to those coordinates regardless of
    // what is painted there, so the press lands on the overlay, does nothing, and
    // reports `lost=0 wrote=false`. The sweep believes the control is harmless.
    // Worse, the modal is still open afterwards, so the descent walks into it and
    // attributes it to the WRONG parent — burning the signature the real parent
    // would have claimed, which is how "Smart Distribute" came to have the
    // Library's 23 controls as its children while the Library itself was never
    // walked.
    //
    // This is session 39's own retraction — "the sweep silently stopped
    // sweeping" — one layer out, and it is the same lesson: a sweep that reports
    // a clean run over controls it never pressed is worse than no sweep.
    //
    // So an obstruction is no longer forced past. It is REPORTED to the caller,
    // which reinstalls the gym (a reload takes every modal and every toast with
    // it) and presses again by name. A press still obstructed after that is
    // `skipped`, in the report, where it can be read. `force` survives for the
    // one case it is honest in: the target IS the element at its own centre and
    // the click failed for some other reason (mid-animation, say).
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
      // What is actually at the control's own centre? Anything that is not the
      // control, and not inside it, is something painted over it.
      const covering = await bounded(page.evaluate(() => {
        const el = document.querySelector("[data-sweep-target]");
        if (!el) return "the control is gone";
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!hit) return "nothing (outside the viewport)";
        if (hit === el || el.contains(hit) || hit.contains(el)) return null;
        const text = (hit.innerText || "").trim().replace(/\s+/g, " ").slice(0, 44);
        return `<${hit.tagName.toLowerCase()}> ${JSON.stringify(text)}`;
      }), "could not be read");
      if (covering) { await unmark().catch(() => {}); return { obstructed: covering }; }
      try { await attempt(true); r.forced.push(name); }
      catch { await unmark().catch(() => {}); return null; }
    }
    // The settle, the unmark, the store, the undo toast, the in-app confirm and
    // the control list, in ONE evaluate — see POST_PRESS for why, and for what
    // the 200ms is still protecting.
    // ⚠️ And a backstop, because "never settles" is not a state the try/catch
    // above can cover on its own — a page whose main thread is wedged never runs
    // the callback at all. A press whose reads cannot be taken is `null`, which
    // the caller already records as skipped.
    const settled = await bounded(postPress(page), null);
    if (!settled) { await unmark().catch(() => {}); return null; }

    const after = settled.store;
    const lost = diffGym(before, after);
    const asked = dialogs.length > 0;
    const undo = settled.undo;
    const confirmUp = lost.length === 0 ? settled.confirmUp : false;
    const wrote = JSON.stringify(before) !== JSON.stringify(after);
    const names = settled.names;

    r.pressed.push(name);
    if (lost.length === 0) {
      if (asked || confirmUp) r.guarded.push({ name, how: asked ? "asked (native)" : "asked (in-app)" });
      return { lost, wrote, asked: asked || confirmUp, undo, names, toast: settled.toast };
    }
    if (undo) { r.guarded.push({ name, how: `undoable · ${lost.length} lost` }); return { lost, wrote, asked, undo, names, toast: settled.toast }; }

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
      if (again && diffGym(before, again.store ?? await snapshot(page)).length === 0) {
        r.guarded.push({ name, how: "reversible by pressing it again (a toggle)" });
        return { lost, wrote, asked, undo, names: again.names, toast: again.toast, toggle: true };
      }
    }
    r.unguarded.push({ name, lost });
    return { lost, wrote, asked, undo, names, toast: settled.toast };
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
  // ── 🔴 A TOAST FROM THE PREVIOUS PRESS IS AN OBSTRUCTION, AND THIS FILE USED
  // TO RACE IT ──────────────────────────────────────────────────────────────
  //
  // A toast sits at the bottom of the viewport with `pointerEvents: auto` and
  // lives 2.5s, or 9s when it carries an Undo (`PLAIN_MS` / `UNDO_MS` in
  // `src/ui/toast.jsx`). Whatever is under it cannot be clicked, so the press
  // fell back to `{ force: true }` — which delivers the click to the point
  // regardless of what is painted there. A forced click that lands on the toast
  // is a press that DID NOT HAPPEN, recorded as a press that did.
  //
  // That was tolerable only because the sweep was slow: at ~1.2s a press the
  // 2.5s toasts had usually gone by the next one. Removing four CDP round trips
  // per press (see POST_PRESS) brought presses close enough together that they
  // had not, and the Class Builder went from 68 presses to 47 — "Smart
  // Distribute" was forced onto a toast, did nothing, reported no loss, and the
  // sweep then walked DOWN into a modal that was still open from two presses
  // earlier. The sweep did not fail. It quietly swept less, which is the exact
  // failure this file exists to avoid, and it was caused by making it faster.
  //
  // So a surviving toast is now DIRT, like a write or an open modal, and it is
  // cleared the same way — by reinstalling the gym, which reloads the page and
  // takes the toast with it. A press that wrote already forces that restore, so
  // this only adds one for a toast with no write behind it (the Builder's "No
  // exercises found — try a different class or style" is the shape).
  let toastDirty = false;

  // Cleaning up costs three different amounts and the sweep finishes or times
  // out on which one it picks. A modal closes on Escape; a screen that was
  // navigated away from comes back with two nav clicks; only a press that WROTE
  // needs the whole gym reinstalled and the page reloaded. The Schedule has 59
  // controls and 35 of them open the same form — paying a reload for each one
  // is the difference between a 40-second sweep and a timeout.
  const reset = async () => {
    if (storeDirty || toastDirty) { await restore(); viewDirty = false; storeDirty = false; toastDirty = false; return; }
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
    viewDirty = false; storeDirty = false; toastDirty = false;
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
    if (viewDirty || storeDirty || toastDirty) await reset();
    const nth = baseline.slice(0, i).filter((n) => n === baseline[i]).length;
    let at = occurrenceOf(await candidateNames(page), baseline[i], nth);
    if (at === -1) {
      await restore();
      at = occurrenceOf(await candidateNames(page), baseline[i], nth);
      if (at === -1) { r.skipped.push(baseline[i]); continue; }
    }
    const i0 = at;

    let outcome = await press(i0, baseline[i]);
    // An obstruction means the screen is not what the sweep thinks it is. A
    // reload is the only thing that reliably takes a modal, a panel and a toast
    // away at once, so pay for one and press the same control again by name.
    if (outcome && outcome.obstructed) {
      r.obstructed.push(`${baseline[i]} ← ${outcome.obstructed}`);
      await restore();
      viewDirty = false; storeDirty = false; toastDirty = false;
      const retryAt = occurrenceOf(await candidateNames(page), baseline[i], nth);
      outcome = retryAt === -1 ? null : await press(retryAt, baseline[i]);
      if (outcome && outcome.obstructed) {
        r.skipped.push(`${baseline[i]} (still covered by ${outcome.obstructed})`);
        viewDirty = true;
        continue;
      }
    }
    if (!outcome) { r.skipped.push(baseline[i]); viewDirty = true; continue; }
    if (outcome.lost.length || outcome.wrote) storeDirty = true;
    if (outcome.asked) viewDirty = true;
    if (outcome.toast) toastDirty = true;

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
    // ── 🔴 THE DESCENT READS ITS OWN LIST, ONE ROUND TRIP LATER ──────────────
    //
    // `outcome.names` is right here and free, and using it COSTS DESCENTS. It is
    // captured inside POST_PRESS at exactly `SETTLE_MS`; this call lands 20-40ms
    // after that. A modal still arriving at 200ms has no buttons yet, so the
    // revealed set is empty and the press is recorded as having opened nothing.
    //
    // Measured: reading `outcome.names` here took the Dashboard from 1 descent to
    // 0 — the Profile modal, which is not in `ALL_SCREENS` and is walked from
    // nowhere else — and the Exercise Library from 13 to 12. ~16ms a press
    // against a descent the sweep would otherwise never make is not a trade.
    //
    // ⚠️ So `outcome.names` exists for the cheap comparisons only (is the screen
    // still at baseline), never for deciding what to walk into.
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
        // ⚠️ Guarded, not unconditional. `press` returns without recording
        // anything when the control could not be marked, when the click failed
        // outright, and now when it was covered — so an unguarded pop takes a
        // REAL press off the ledger and the report undercounts itself.
        if (r.pressed[r.pressed.length - 1] === `${baseline[i]} (reopen)`) r.pressed.pop();
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
      let child = await press(at, `${baseline[i]} › ${childName}`);
      if (child && child.obstructed) {
        r.obstructed.push(`${baseline[i]} › ${childName} ← ${child.obstructed}`);
        if (!(await reopen())) break;
        const retryAt = occurrenceOf(await candidateNames(page), childName, childNth);
        child = retryAt === -1 ? null : await press(retryAt, `${baseline[i]} › ${childName}`);
        if (child && child.obstructed) {
          r.skipped.push(`${baseline[i]} › ${childName} (still covered)`);
          child = null;
        }
      }
      // `child.toast` for the same reason as the top-level loop: a toast left by
      // one child covers the next one, and `reopen` reloads it away.
      if (child && (child.lost.length || child.wrote || child.asked || child.toast)) {
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
      (r.forced.length ? ` · ${r.forced.length} pressed with force` : "") +
      (r.obstructed.length ? `\n   ⚠️ covered on the first attempt, reloaded and pressed again:\n       ${r.obstructed.join("\n       ")}` : "") +
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
