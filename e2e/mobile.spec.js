import { test, expect } from "@playwright/test";
import { freshApp, watchConsole, expectNoConsoleErrors, ALL_SCREENS, navAnyWidth, waitForAppAnyWidth } from "./helpers.js";
import { tapScan, reportTaps, orphanScan, reportOrphans } from "./tapScan.js";
import { usedGym, installGym } from "./usedGym.js";

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

  // 🔴 A SCREEN WHOSE CONTROLS ONLY EXIST ONCE THE GYM HAS DATA (session 40 §3.5)
  //
  // The per-screen sweeps above run against `freshApp`. The Health Screen with no
  // 1:1 clients renders "A health screen belongs to a 1:1 client, and you have
  // none yet" and NO picker, so its sweep was scanning a screen with nothing on
  // it — the documented trap, and how a 37px control sat under a green sweep.
  //
  // The picker is the first control on the screen and the one a coach uses
  // standing up. It is asserted twice: through the sweep, which is the rule, and
  // by measuring the box, which is what the sweep cannot say — a `<select>` gets
  // no `::after`, so `data-tap` alone would leave it failing and no easier to
  // hit. See the note in `tapScan.js`.
  test("the Health Screen's client picker is thumb-sized once there IS a client", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await page.evaluate(() => {
      localStorage.setItem("jungle_members", JSON.stringify([
        { id: "m1", name: "Sarah Chen", email: "", status: "active", joinedAt: "" }]));
      localStorage.setItem("jungle_pt_clients", JSON.stringify([
        { id: "c1", memberId: "m1", goal: "First pull-up", coachName: "Dylan",
          status: "active", startedAt: "2026-01-01" }]));
    });
    await page.reload();
    await waitForAppAnyWidth(page);
    await navAnyWidth(page, ALL_SCREENS.find((s) => s.key === "pt-parq"));

    // PRECONDITION: the picker exists. Without this the two assertions below are
    // both true of the empty screen this test exists because of.
    const picker = page.locator("#parq-client");
    await expect(picker, "the seeded client must produce a picker to measure").toBeVisible();

    const box = await picker.boundingBox();
    expect(Math.round(box.height),
      `the picker a coach taps standing up is ${Math.round(box.height)}px; the rule is 44`)
      .toBeGreaterThanOrEqual(44);

    const scan = await tapScan(page);
    expect(scan.misses, reportTaps("Health Screen at 390px, with a client", scan)).toEqual([]);
    expect(scan.scanned, "the scan must have matched the picker, not skipped it")
      .toBeGreaterThan(0);
  });

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

// ── Every <select> is 44px on a phone (session 41 §3.3) ──────────────────────
//
// `tapScan` is opt-in (it scans `[data-tap]`) and a `<select>` can never carry a
// working `data-tap` — no `::after` on a replaced element. So eighteen raw
// selects outside the shared primitive had never been measured, and measured
// 18–37px at 390px. This measures the BOX, on every screen, on a gym that has
// been used: the Health Screen and the 1:1 picker only exist once there is a
// client, and an empty screen passes every scan trivially.
const measureSelects = (page) => page.evaluate(() =>
  [...document.querySelectorAll("select")]
    .filter((el) => el.getBoundingClientRect().height > 0 && !el.hasAttribute("data-dense"))
    .map((el) => ({
      name: el.getAttribute("aria-label") || el.id || el.options[el.selectedIndex]?.text || "(unnamed)",
      h: Math.round(el.getBoundingClientRect().height),
    })));

test.describe("every select is thumb-sized on a phone", () => {
  test("at 390px, on every screen of a used gym", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    const seen = [];
    for (const screen of ALL_SCREENS) {
      await installGym(page, usedGym());
      await waitForAppAnyWidth(page);
      await navAnyWidth(page, screen);
      for (const s of await measureSelects(page)) seen.push({ ...s, screen: screen.side });
    }
    // POSITIVE CONTROL: the scan found the raw selects this exists for, not just
    // the primitive that already passed. The Builder's toolbar and the
    // Library's picker are two of the eighteen.
    const names = seen.map((s) => s.name);
    expect(names, "the scan must reach the Builder's raw class-type select").toContain("Class type");
    expect(names, "…and the Exercise Library's").toContain("Class type to browse");
    expect(seen.length, "a scan of a used gym measuring almost nothing is measuring the wrong page")
      .toBeGreaterThanOrEqual(8);

    const small = seen.filter((s) => s.h < 44).map((s) => `${s.screen} › ${s.name}: ${s.h}px`);
    expect(small, "selects under 44px at 390px").toEqual([]);
  });

  test("at 1280px the rule is off — a desk keeps its compact toolbar", async ({ page }) => {
    // The other half of the rule's scope. A 44px select in the Builder's toolbar
    // on a desktop is 16px of header for a mouse that did not need it.
    await page.setViewportSize({ width: 1280, height: 900 });
    await freshApp(page);
    await installGym(page, usedGym());
    await waitForAppAnyWidth(page);
    await navAnyWidth(page, ALL_SCREENS.find((s) => s.key === "builder"));
    const classType = (await measureSelects(page)).find((s) => s.name === "Class type");
    expect(classType, "the Builder's class-type select must be on screen to measure").toBeTruthy();
    expect(classType.h).toBeLessThan(44);
  });
});
