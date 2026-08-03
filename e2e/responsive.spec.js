import { test, expect } from "@playwright/test";
import { freshApp, navAnyWidth, waitForAppAnyWidth, ALL_SCREENS,
         watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { layoutScan, reportOverflow, reportClipped } from "./layoutScan.js";

// ── REGRESSION §1.1 — every screen, at every width, on a fresh render ─────────
//
// The suite had 307 tests because someone wrote one per defect. This is the
// other kind: a rule swept over every screen, which catches the NEXT layout
// defect rather than the last one. Three widths, because the repo has already
// been bitten in the band between them — the sidebar was taking 40% of a 600px
// screen while a 375px test passed, since 375px was already in drawer territory.
//
// ⚠️ THE TRAP THIS IS BUILT AROUND. Measuring responsive layout without
// reloading shows a STALE render, and that produced a wrong finding in a
// previous audit. Playwright sets the viewport before navigating, and every
// screen below is reached after a fresh load at the stated width, so the trap is
// structurally impossible here rather than merely avoided.

const WIDTHS = [
  { label: "390px phone",   width: 390,  height: 844 },
  { label: "768px tablet",  width: 768,  height: 1024 },
  { label: "1280px desktop", width: 1280, height: 800 },
];

for (const vp of WIDTHS) {
  test.describe(`layout at ${vp.label}`, () => {
    for (const screen of ALL_SCREENS) {
      test(`${screen.side} fits`, async ({ page }) => {
        const errors = watchConsole(page);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await freshApp(page);
        await waitForAppAnyWidth(page);
        await navAnyWidth(page, screen);

        // The error boundary renders a calm message, so a screen that threw
        // looks like a working one to a layout scan. Rule it out first.
        await expect(
          page.getByText(/Something broke|stopped responding/i),
          `${screen.side} rendered the error boundary at ${vp.label}`,
        ).toHaveCount(0);

        const scan = await layoutScan(page);

        // POSITIVE CONTROL. A scan that matched nothing and a scan that found
        // nothing are indistinguishable from the assertions below, and this repo
        // has been fooled by exactly that. A real screen renders far more than
        // 20 boxes; if this ever trips, the sweep is measuring an empty page and
        // every "pass" beneath it is worthless.
        expect(scan.scanned,
          `${screen.side} at ${vp.label}: the scan saw only ${scan.scanned} elements — it is measuring nothing`)
          .toBeGreaterThan(20);

        expect(scan.pageOverflow, reportOverflow(`${screen.side} at ${vp.label}`, scan))
          .toBeLessThanOrEqual(0);

        expect(scan.clipped, reportClipped(`${screen.side} at ${vp.label}`, scan))
          .toEqual([]);

        expectNoConsoleErrors(errors);
      });
    }
  });
}

// ── The inventory cannot go stale ────────────────────────────────────────────
//
// ALL_SCREENS is a hand-written list, and a hand-written list of screens is
// exactly the thing that silently stops matching the app — config/flags.js calls
// itself "the SINGLE choke-point" for which views appear in a nav precisely
// because four separate arrays had already drifted apart.
//
// So the sweep does not trust its own list. If a screen is added to the sidebar,
// or a flag flips one back on, this fails and the sweep grows by one rather than
// quietly continuing to cover the old set.
test("the sweep covers every screen the app actually offers", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshApp(page);
  await waitForAppAnyWidth(page);

  // The sidebar is [brand] [scrolling nav] [profile]. Only the middle child's
  // buttons are screens; the profile row is an account control, not a
  // destination. Scoped structurally so that if the sidebar is restructured this
  // test fails loudly rather than starting to compare against nothing.
  const navRegion = page.locator("aside > div").nth(1);
  const inSidebar = await navRegion.getByRole("button").evaluateAll(
    els => els.map(e => (e.innerText || "").trim()).filter(Boolean));

  // Scanner sanity: an empty read would make both directions below vacuous.
  expect(inSidebar.length,
    `read ${inSidebar.length} sidebar destinations — the locator is not finding the nav`)
    .toBeGreaterThan(4);

  const swept = ALL_SCREENS.map(s => s.side);

  // Direction 1: everything swept still exists. A renamed screen would otherwise
  // make navAnyWidth fail with a confusing timeout instead of saying why.
  const missing = swept.filter(s => !inSidebar.includes(s));
  expect(missing, `ALL_SCREENS names screens the sidebar no longer offers: ${missing.join(", ")}`).toEqual([]);

  // Direction 2, the one that matters: everything the app offers is swept. This
  // is what stops a new screen — or a flag flipped back on in config/flags.js —
  // from being invisible to the 390/768/1280 sweep.
  const unswept = inSidebar.filter(l => !swept.includes(l));
  expect(unswept,
    `these screens are in the sidebar but not swept at 390/768/1280: ${unswept.join(", ")}`).toEqual([]);
});
