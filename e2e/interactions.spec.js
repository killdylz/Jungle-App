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
  /^(dashboard|class builder|coaches|exercise library|class runner|schedule|members|team|brand studio|builder|library|run|build|brand|more|back|home)$/i,
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
};

test.describe("no screen throws when a coach presses things", () => {
  for (const screen of ALL_SCREENS) {
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
