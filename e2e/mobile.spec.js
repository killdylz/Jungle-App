import { test, expect } from "@playwright/test";
import { freshApp, watchConsole, expectNoConsoleErrors, ALL_SCREENS, navAnyWidth, waitForAppAnyWidth } from "./helpers.js";
import { tapScan, reportTaps, orphanScan, reportOrphans } from "./tapScan.js";

// The phone layout (audit 1.1). "Most of this will be used on a phone in a loud
// room", so the navigation a coach uses mid-class gets its own tests.
//
// These also pin the correction recorded in AUDIT-FINDINGS 1.1: the original
// finding measured the sidebar at 375px WITHOUT RELOADING after a resize, which
// shows a stale layout. Playwright sets the viewport before navigating, so
// every assertion here is on a fresh render at the stated width — the trap is
// structurally impossible in this suite, which is the point.

const PHONE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("mobile navigation", () => {
  test("a phone gets the bottom bar, never the 238px sidebar", async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(PHONE);
    await freshApp(page);

    await expect(page.locator("aside")).toHaveCount(0);
    const bar = page.locator("nav").first();
    await expect(bar).toBeVisible();

    await expect(bar.getByRole("button", { name: "Run" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Build" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Members" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Brand" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toBeVisible();

    // Nothing may scroll sideways on a phone.
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows, "page scrolls horizontally at 375px").toBe(false);

    // Touch targets. 44px is the comfortable minimum; a mis-tap mid-burpee must
    // not change screen.
    const boxes = await bar.getByRole("button").all();
    for (const b of boxes) {
      const box = await b.boundingBox();
      expect(box.height, "tab height").toBeGreaterThanOrEqual(44);
    }

    expectNoConsoleErrors(errors);
  });

  test("the 480-900px band gets the bottom bar too", async ({ page }) => {
    // THE ACTUAL DEFECT. At 768px the sidebar was taking 31% of the screen, and
    // at 600px, 40%. This band is what AUDIT 1.1 missed by measuring at 375px.
    await page.setViewportSize(TABLET);
    await freshApp(page);
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("nav").first().getByRole("button", { name: "Run" })).toBeVisible();
  });

  test("desktop keeps the sidebar", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await freshApp(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("nav").first().getByRole("button", { name: "More" })).toHaveCount(0);
  });

  test("More opens a sheet, and the same button closes it", async ({ page }) => {
    // Found by driving it: the sheet's scrim spans the viewport, so at a lower
    // z-index than the bar it swallowed taps on the very button that opened the
    // sheet. More could open and never close.
    const errors = watchConsole(page);
    await page.setViewportSize(PHONE);
    await freshApp(page);

    const more = page.locator("nav").first().getByRole("button", { name: "More" });
    await more.click();
    await expect(page.getByRole("button", { name: /Brand Studio/ })).toBeVisible();

    await more.click();
    await expect(page.getByRole("button", { name: /Brand Studio/ })).toHaveCount(0);

    // And a sheet item navigates, closing the sheet behind it.
    await more.click();
    await page.getByRole("button", { name: /Brand Studio/ }).click();
    await expect(page.getByRole("button", { name: /Brand Studio/ })).toHaveCount(0);
    await expect(page.getByText(/Upload your brand/)).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("the runner and check-in are usable one-handed", async ({ page }) => {
    // The two surfaces actually touched mid-class.
    const errors = watchConsole(page);
    await page.setViewportSize(PHONE);
    await freshApp(page);

    await page.locator("nav").first().getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("ELAPSED")).toBeVisible();

    await page.getByRole("button", { name: /Check in/ }).first().click();
    await expect(page.getByPlaceholder(/name/i).first()).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows, "check-in overflows at 375px").toBe(false);

    expectNoConsoleErrors(errors);
  });
});

// ── §3.4 · every marked tap target, on every screen, at phone width ───────────
//
// Measuring the app at 390px found 100 of 186 visible controls under 44px. The
// ones a trainer actually misses are the small SQUARE ones — an 18px back arrow,
// a 19px movement preview, the 32px avatar that is the only route to settings on
// every screen — so those carry `data-tap` and get a 44px hit area laid over
// them without changing how they look.
//
// This sweep exists because that mechanism has two silent failure modes (an
// `overflow:hidden` ancestor clips the overlay; a neighbour's overlay paints on
// top of it) and BOTH leave the element's measured box exactly as it was. So it
// hit-tests the running page instead of measuring rectangles. See tapScan.js.
test.describe("tap targets at phone width", () => {
  for (const screen of ALL_SCREENS) {
    test(`${screen.side} — every marked control is thumb-sized`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await freshApp(page);
      await waitForAppAnyWidth(page);
      await navAnyWidth(page, screen);

      const scan = await tapScan(page);
      expect(scan.misses, reportTaps(`${screen.side} at 390px`, scan)).toEqual([]);

      // ...and no overlay may have swallowed the control NEXT to it. This is the
      // direction that actually shipped a bug, and it surfaces three files away
      // from the change, so it belongs in the same sweep as the change.
      const orphans = await orphanScan(page);
      expect(orphans.orphans, reportOrphans(`${screen.side} at 390px`, orphans)).toEqual([]);
    });
  }

  test("the sweep is actually looking at something", async ({ page }) => {
    // POSITIVE CONTROL, and the only assertion here that can catch the sweep
    // being switched off by accident. Every `misses: []` above is equally true
    // of a page with no [data-tap] on it at all — a renamed attribute, a
    // dropped stylesheet import, or a screen that failed to render would turn
    // the whole describe block green while testing nothing.
    //
    // The header avatar is on all nine screens, so a total of zero is proof the
    // scan matched nothing rather than proof the app is clean.
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await waitForAppAnyWidth(page);

    const scan = await tapScan(page);
    expect(scan.scanned, "the tap scan matched no controls — it is measuring nothing")
      .toBeGreaterThan(0);
  });

  test("the 44px overlay is a hit area, not a bigger button", async ({ page }) => {
    // The whole design claim in one assertion: the avatar still LOOKS like a
    // 32px circle. If someone "fixes" a tap-target failure by growing the box,
    // this fails and the review is about the header's layout, which is the
    // conversation worth having.
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await waitForAppAnyWidth(page);

    const avatar = page.getByRole("button", { name: "Your profile and settings" });
    const box = await avatar.boundingBox();
    expect(Math.round(box.height), "the avatar's VISIBLE box must stay 32px").toBe(32);

    // ...and it opens from a point OUTSIDE that box. 32px inside a 44px target
    // leaves 6px of overlay on each side, so 4px past the right edge is in the
    // hit area and nowhere near the button — which is the entire claim.
    await page.mouse.click(box.x + box.width + 4, box.y + box.height / 2);
    await expect(page.getByRole("dialog", { name: /profile/i })).toBeVisible();
  });
});

// ── The gap the empty-fixture sweep leaves ───────────────────────────────────
//
// The nine screen sweeps above run on a FRESH app, and a fresh app has an empty
// schedule — no class cards, so neither the Edit pencil nor the Remove ✕ exists
// to be scanned. That is how a `data-tap` overlay that covered the pencil got
// past the sweep and was caught instead by nine tests in scheduleEdit.spec.js,
// under the symptom "the edit dialog never opens".
//
// An empty screen passes every scan trivially. So this one seeds a real class
// first, and it is the schedule grid specifically because that cell is the
// tightest cluster of controls in the product: two icon buttons 14px apart.
test("the schedule grid's icon buttons stay clickable once there IS a class", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 6, 20, 12, 0, 0));   // Mon 20 July 2026
  await page.setViewportSize({ width: 390, height: 844 });
  await freshApp(page);
  await waitForAppAnyWidth(page);
  await navAnyWidth(page, ALL_SCREENS.find(s => s.key === "calendar"));

  await page.getByRole("button", { name: "Add a class on Wed at 18:00" }).click();
  await page.getByPlaceholder(/class name/i).fill("Wednesday Hyrox");
  await page.getByRole("button", { name: "Add to schedule" }).click();

  // POSITIVE CONTROL — both controls must actually be on the page, or the scan
  // below is measuring the same empty grid that missed this the first time.
  const pencil = page.getByRole("button", { name: /^Edit Wednesday Hyrox on Wed/ });
  const cross  = page.getByRole("button", { name: /^Remove Wednesday Hyrox on Wed/ });
  await expect(pencil).toHaveCount(1);
  await expect(cross).toHaveCount(1);

  const orphans = await orphanScan(page);
  expect(orphans.orphans, reportOrphans("Schedule (populated) at 390px", orphans)).toEqual([]);

  // And the behavioural proof, which is what the coach actually cares about:
  // the pencil still opens the edit dialog rather than deleting the class.
  await pencil.click();
  await expect(page.getByRole("dialog", { name: "Edit class" })).toBeVisible();
});
