import { test, expect } from "@playwright/test";
import { freshApp, navAnyWidth, waitForAppAnyWidth, ALL_SCREENS,
         watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── REGRESSION §1.6 — every screen, after being TOUCHED ──────────────────────
//
// `screens.spec.js` asserts the error boundary is absent on every screen at
// rest. Nothing asserted it stays absent once a coach starts pressing things,
// and "at rest" is the state a crash is least likely to be in: the bugs this
// repo has actually shipped were a handler that resolved and then threw, which
// is invisible until the handler runs.
//
// 🔴 WHY THE CONSOLE AND NOT THE SCREEN. React's error boundary makes a crash
// LOOK handled — the coach gets a calm "something broke" card and the stack only
// exists in the console. So a sweep that only looked at the DOM would pass on a
// screen that had just died. Both are checked, and the console is the one with
// teeth.
//
// ── WHAT IS DELIBERATELY NOT CLICKED, and why the list is a denylist ─────────
//
// A blind click sweep on a real app either destroys its own fixture or spends
// its time asserting that navigation navigates. Four exclusions, each for a
// different reason:
//
//   · DESTRUCTIVE — delete/remove/reset/discard. Clicking these is the job of
//     destructive.spec.js, which drives both branches of each one properly. Here
//     they would silently empty the fixture and make every later click a test of
//     an empty screen, which passes.
//   · NAVIGATION — the sidebar, the bottom bar, the More sheet, Back. These move
//     the sweep off the screen it is meant to be sweeping; `screens.spec.js`
//     already covers that every one of them lands somewhere real.
//   · SUBMIT — anything that writes a row. Same fixture-destruction problem, and
//     the write paths have their own specs that assert what was STORED.
//   · FILE PICKERS — they open an OS dialog Playwright cannot dismiss, and the
//     test would hang rather than fail.
//
// Everything else gets pressed: tabs, filters, toggles, expanders, "add" buttons
// that open a form, dialog openers, chips, and the dozens of small icon controls
// that no test names individually. That is the population where an unhandled
// throw hides.

const SKIP = [
  // Destructive — driven properly elsewhere.
  /delete/i, /remove/i, /reset/i, /discard/i, /clear/i,
  // Navigation — moves the sweep off the screen under test.
  // `analytics` joined this list when the N2 screen replaced the flagged-off
  // stub. Without it, every OTHER screen's sweep clicks the sidebar's Analytics
  // entry and navigates away mid-sweep — a nav entry that becomes visible has to
  // be added here as well as to ALL_SCREENS.
  /^(dashboard|class builder|coaches|exercise library|class runner|schedule|members|team|brand studio|analytics|builder|library|run|build|brand|more|back|home)$/i,
  // The 1:1 pair. Each screen links to the other and to Members, so without
  // these the sweep of every OTHER screen navigates away mid-run — the same
  // reason `analytics` is on this list.
  /^(1:1 clients|health screen|go to members|go to 1:1 clients|back to 1:1 clients)$/i,
  /^(start health screen|open health screen)$/i,
  /^back/i, /go back/i, /^← /,
  // Writes a row, or leaves the app entirely.
  /^add to schedule$/i, /^save/i, /^publish/i, /^export/i, /^import/i,
  /load sample coach/i, /^read the file$/i, /choose csv/i, /^start class$/i,
  // Opens an OS file dialog Playwright cannot close.
  /upload/i, /choose file/i,
];

const skipped = (name) => !name || SKIP.some((re) => re.test(name.trim()));

// ── Screens that are EMPTY on a fresh install ────────────────────────────────
//
// Coaches and Members render three controls each until they have content, so the
// sweep would press an empty state and report a pass. That is the same trap the
// tap sweep hit — an empty screen satisfies every assertion trivially — and the
// positive control below is what surfaced it here rather than letting two of the
// eight screens quietly test nothing.
//
// Seeded, therefore, and seeded to the state a working gym is actually in: a
// coach with a real corpus, and a roster with people on it. That is also the
// state where these screens render the most controls, which is the point.
// A gym with a 1:1 practice: two members, both 1:1 clients, one already screened
// so the session planner is unlocked and the other still blocked so the refusal
// renders too. Seeded rather than driven because the sweep's job is to press
// controls, not to re-test the add flow — and because an empty 1:1 screen has
// one button on it and would satisfy every assertion below trivially.
const seed1to1 = (page) => page.evaluate(() => {
  const clean = ["q1","q2","q3","q4","q5","q6","q7"].reduce((a, k) => { a[k] = false; return a; }, {});
  const day = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  localStorage.setItem("jungle_members", JSON.stringify([
    { id: "m0", name: "Sarah Chen", email: "sarah@example.com", status: "active" },
    { id: "m1", name: "Marcus Lee", email: "marcus@example.com", status: "active" },
  ]));
  localStorage.setItem("jungle_pt_clients", JSON.stringify([
    { id: "c0", memberId: "m0", goal: "First pull-up", status: "active", startedAt: day(-60) },
    { id: "c1", memberId: "m1", goal: "Return to sport", status: "active", startedAt: day(-10) },
  ]));
  // Screened TODAY, so this fixture cannot expire and start failing the sweep
  // twelve months after it was written.
  localStorage.setItem("jungle_parq_records", JSON.stringify([
    { id: "p0", memberId: "m0", screenedAt: day(0), answers: clean, clearance: null,
      screenedBy: "Dylan", recordedAt: new Date().toISOString() },
  ]));
  localStorage.setItem("jungle_pt_sessions", JSON.stringify([
    { id: "s0", clientId: "c0", memberId: "m0", date: day(3), planName: "Pull strength",
      stages: [{ id: "st0", name: "Warm-Up", dur: 300, exercises: [{ n: "Light Jog" }] }],
      notes: "", status: "planned", parqStateAtAssign: "cleared", createdAt: new Date().toISOString() },
  ]));
});

const SEED = {
  personas: async (page) => {
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
  },
  member: async (page, screen) => {
    await page.evaluate(() => {
      // Members only. An attendance row was seeded here at first and it rendered
      // the error boundary — but the fixture had `at` as a NUMBER while
      // checkinMetrics.recordSession writes an ISO STRING, so the crash was as
      // likely to be my invented shape as the app's fragility. A sweep must not
      // report a defect it manufactured, and a fixture whose shape you had to
      // guess is not evidence. Left out; the roster alone gives this screen
      // plenty to press.
      localStorage.setItem("jungle_members", JSON.stringify(
        ["Sarah Chen", "Marcus Lee", "Priya Nair"].map((name, i) => ({
          id: `m${i}`, name, email: `m${i}@example.com`, status: "active",
        }))));
    });
    await page.reload();
    await waitForAppAnyWidth(page);
    await navAnyWidth(page, screen);
  },
  pt: async (page, screen) => {
    await seed1to1(page);
    await page.reload();
    await waitForAppAnyWidth(page);
    await navAnyWidth(page, screen);
    // Open a client, or the detail panel — the gate, the planner and the session
    // list — is not on the page and the sweep presses a summary and an add form.
    await page.getByRole("button", { name: /^Sarah Chen/ }).click();
  },
  "pt-parq": async (page, screen) => {
    await seed1to1(page);
    await page.reload();
    await waitForAppAnyWidth(page);
    await navAnyWidth(page, screen);
    // The questions only render once the coach has said whose screen this is —
    // deliberately, because a questionnaire with no name on it is a form rather
    // than a record. Without this the sweep sees a picker and a Back arrow.
    await page.selectOption("#parq-client", { label: "Marcus Lee" });
  },
};

// ── Screens with nothing to press, and why that is allowed ───────────────────
//
// This sweep's positive control demands four clickable controls, and it FIRED on
// Analytics the moment that screen became reachable — which is the control doing
// its job, not a defect to route around. Analytics is a read-only report: a
// headline, a column chart of divs, and a table. Its only buttons are Back and
// (on the empty state) "Import attendance history", both of which this file's
// denylist correctly excludes as navigation.
//
// The wrong fix would be to add controls to the screen so a sweep has something
// to click. What this sweep exists to catch on that screen — an unhandled throw
// and a console error — is asserted by `retention.spec.js`, which drives it with
// three different fixtures (empty, thin, a full imported year) and watches the
// console on every one. The exemption is therefore a statement about the screen's
// shape, and it is named rather than achieved by leaving it out of ALL_SCREENS,
// because that list is checked against the app by responsive.spec.js.
const REPORT_ONLY = new Set(["analytics"]);

test.describe("no screen throws when a coach presses things", () => {
  for (const screen of ALL_SCREENS.filter(s => !REPORT_ONLY.has(s.key))) {
    test(`${screen.side} survives being clicked`, async ({ page }) => {
      const errors = watchConsole(page);
      // Any window.confirm/alert a handler raises is cancelled, not accepted —
      // an accepted confirm is a destructive action, which is exactly what the
      // denylist above is avoiding. Registered for the whole test because a
      // `once` handler leaves the SECOND dialog to hang the run.
      page.on("dialog", (d) => d.dismiss().catch(() => {}));

      await page.setViewportSize({ width: 1280, height: 800 });
      await freshApp(page);
      await waitForAppAnyWidth(page);
      await navAnyWidth(page, screen);

      if (SEED[screen.key]) await SEED[screen.key](page, screen);

      const boundary = page.getByText(/Something broke|stopped responding/i);
      await expect(boundary, `${screen.side} rendered the boundary at rest`).toHaveCount(0);

      // Snapshot the names first. Collecting Locators instead would hand every
      // later click a handle into a DOM that the earlier clicks have re-rendered.
      const names = (await page.getByRole("button").evaluateAll((els) =>
        els.map((e) => (e.getAttribute("aria-label") || e.innerText || "")
          .replace(/\s+/g, " ").trim()),
      )).filter((n) => !skipped(n));

      // POSITIVE CONTROL. Every assertion in the loop is vacuously true when the
      // loop does not run, and a screen that failed to render, or a denylist that
      // grew too greedy, produces exactly that. Four is low enough not to be
      // brittle and high enough that an empty screen cannot pass.
      expect(names.length,
        `${screen.side}: only ${names.length} clickable controls survived the denylist — ` +
        `the sweep is testing nothing`).toBeGreaterThanOrEqual(4);

      const pressed = [];
      for (const name of names) {
        const btn = page.getByRole("button", { name, exact: true }).first();
        // A click may have re-rendered the page out from under this name; that
        // is not a failure, there is simply nothing left to press.
        if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) continue;

        await btn.click({ timeout: 2000 }).catch(() => {});
        pressed.push(name);

        // THE ASSERTION, made after every single click rather than once at the
        // end — so the failure message names the control that did it instead of
        // handing over a screen and forty suspects.
        expect(errors, `${screen.side}: clicking ${JSON.stringify(name)} logged a console error`)
          .toEqual([]);
        await expect(boundary,
          `${screen.side}: clicking ${JSON.stringify(name)} rendered the error boundary`)
          .toHaveCount(0);

        // Close anything modal before the next press, or every remaining click
        // lands on a backdrop and the sweep quietly stops testing.
        if (await page.getByRole("dialog").count()) {
          await page.keyboard.press("Escape").catch(() => {});
        }
      }

      expect(pressed.length, `${screen.side}: nothing was actually pressed`).toBeGreaterThan(0);
      expectNoConsoleErrors(errors);
    });
  }
});
