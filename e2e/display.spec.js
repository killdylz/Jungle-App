import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// P2 · the 10-foot rule — the regression the Fable spec (§3) demands and the repo
// did not have.
//
// The member-facing Room TV surfaces were authored with FIXED px type. Fixed px
// does not grow with the viewport, so a "92px" timer is 8.5% of a 1080p wall but
// only ~4.3% of a 4K wall — below the §3 legibility floor (the primary element,
// current move + timer, must hold ~8–12% of screen HEIGHT to read at 8m). Nothing
// enforced that: the presets only gestured at it.
//
// `tvFont` keys the size to viewport height, so the primary element holds the
// SAME fraction of the screen on 1080p and 4K. This suite pins both halves of the
// claim:
//   1. the band  — the primary timer is 8–12% of height at 1080p AND at 4K, and
//   2. invariance — the two fractions are within a hair of each other (the exact
//      property fixed px lacked; on the old code the 4K fraction was ~half).
//
// Playwright is used precisely because it is immune to the "resize without
// reload" trap (memory: measuring responsive layout without reloading shows a
// stale render and produced a wrong finding in the Fable audit). Each viewport
// is a fresh load.

// The primary element is defined by the design as the single biggest thing on the
// wall. Rather than couple the test to a selector, find it the way the eye does:
// the on-screen element that DIRECTLY contains text and has the largest computed
// font-size. On the coach display that is the timer.
async function primaryFraction(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    let best = null;
    document.querySelectorAll("*").forEach((el) => {
      const hasOwnText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      if (!hasOwnText) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.bottom <= 0 || r.top >= vh) return; // off-screen
      const fontPx = parseFloat(getComputedStyle(el).fontSize);
      if (!best || fontPx > best.fontPx) {
        best = {
          fontPx,
          rectH: r.height,
          text: el.textContent.trim().slice(0, 24),
          tag: el.tagName,
        };
      }
    });
    if (!best) return { vh, found: false };
    return {
      vh,
      found: true,
      fontPx: best.fontPx,
      rectH: best.rectH,
      text: best.text,
      tag: best.tag,
      fontFrac: best.fontPx / vh, // how big the TYPE is vs. the screen
      rectFrac: best.rectH / vh, // how big the rendered BOX is vs. the screen
    };
  });
}

async function gotoCoachDisplay(page) {
  await nav(page, "Class Runner");
  await page.getByRole("button", { name: /Room TV/ }).click();
  // The mode switch is a transient overlay that hides after 4.5s (Fable P1/P2).
  // Wake it with a real mouse move the way a coach does, then pick Coach.
  await page.mouse.move(640, 400);
  await page.getByRole("button", { name: "Coach", exact: true }).click();
  // The coach display's timer reads "remaining" beneath it — wait for the surface.
  await expect(page.getByText("remaining").first()).toBeVisible();
}

const VIEWPORTS = [
  { name: "1080p", width: 1920, height: 1080 },
  { name: "4K", width: 3840, height: 2160 },
];

test.describe("P2 · the 10-foot rule — the primary element holds its share of the wall", () => {
  for (const vp of VIEWPORTS) {
    test(`coach-display timer is 8–12% of height at ${vp.name}`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await freshApp(page);
      await gotoCoachDisplay(page);

      // The white-screen guard: a display that threw would render the error
      // boundary, not a timer. Assert its absence explicitly.
      await expect(
        page.getByText(/Something broke|stopped responding/i),
      ).toHaveCount(0);

      const m = await primaryFraction(page);
      expect(m.found, "no text element found on the display").toBe(true);

      // The biggest element on the coach wall must BE the timer (M:SS). If the
      // stage title or anything else outgrows it, the primary has regressed — that
      // is exactly what fixing the timer back to px does on 4K.
      expect(m.text, `biggest display element was "${m.text}", not the timer`).toMatch(
        /\d{1,2}:\d\d/,
      );

      // The type itself, as a fraction of the wall's height, is the honest measure
      // of "how big it looks at 8m" — and it is deterministic (not font-metric
      // dependent), so the band can be tight without flaking.
      expect(
        m.fontFrac,
        `primary type ${m.fontPx}px is ${(m.fontFrac * 100).toFixed(1)}% of ${m.vh}px height (want 8–12%) — "${m.text}"`,
      ).toBeGreaterThanOrEqual(0.08);
      expect(m.fontFrac).toBeLessThanOrEqual(0.12);

      // The rendered box (what the spec literally names) tracks the type; allow a
      // little slack for line-box metrics on either side of the band.
      expect(m.rectFrac).toBeGreaterThanOrEqual(0.075);
      expect(m.rectFrac).toBeLessThanOrEqual(0.13);

      expectNoConsoleErrors(errors);
    });
  }

  test("the primary fraction is invariant across 1080p and 4K", async ({ page }) => {
    // This is the property fixed px lacked and the whole point of tvFont: the same
    // fraction of the screen on both walls. On the pre-fix code the 4K fraction was
    // roughly HALF the 1080p one — this assertion fails loudly there.
    const fracs = {};
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await freshApp(page);
      await gotoCoachDisplay(page);
      const m = await primaryFraction(page);
      fracs[vp.name] = m.fontFrac;
    }
    expect(
      Math.abs(fracs["1080p"] - fracs["4K"]),
      `1080p=${(fracs["1080p"] * 100).toFixed(2)}%  4K=${(fracs["4K"] * 100).toFixed(2)}% — should be viewport-invariant`,
    ).toBeLessThan(0.012);
  });
});
