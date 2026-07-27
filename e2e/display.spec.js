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

// Both member-facing live surfaces reach their display the same way — enter Room
// TV, wake the transient mode overlay with a real mouse move (it hides after 4.5s;
// Fable P1/P2 gives the running surface the whole screen), pick the mode. `ready`
// is a marker unique to that surface so the measurement runs after it paints.
const MODES = {
  Coach: { ready: () => /remaining/ }, // coach display: timer + "remaining"
  Floor: { ready: () => /clockwise · \d+ stations/ }, // floor board members read
  // The DEFAULT mode — the board a member sees walking in, before a class starts.
  // Its summary line is the marker: "N stages · Nm · N exercises".
  Plan: { ready: () => /\d+ stages · / },
};

async function gotoDisplay(page, mode) {
  await nav(page, "Class Runner");
  await page.getByRole("button", { name: /Room TV/ }).click();
  await page.mouse.move(640, 400);
  await page.getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByText(MODES[mode].ready()).first()).toBeVisible();
}

const VIEWPORTS = [
  { name: "1080p", width: 1920, height: 1080 },
  { name: "4K", width: 3840, height: 2160 },
];

// The two boards that run DURING a class and put a clock on the wall. Plan is a
// pre-class overview with no timer, so the 10-foot rule below does not apply to
// it — it navigates like the others (MODES) but is not one of the timer surfaces.
const TIMER_MODES = ["Coach", "Floor"];

test.describe("P2 · the 10-foot rule — the primary element holds its share of the wall", () => {
  for (const mode of TIMER_MODES) {
  for (const vp of VIEWPORTS) {
    test(`${mode}-display timer is 8–12% of height at ${vp.name}`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await freshApp(page);
      await gotoDisplay(page, mode);

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
  }

  test("the interval sub-timer overlay renders a live Tabata block", async ({ page }) => {
    // calcIntervalState was extracted to src/lib/intervalTimer.js; this is the
    // wiring guard for the OTHER half — that the coach display actually renders
    // its result. The default class carries no timed exercise, so this overlay is
    // never reached by any other test. Seed a class whose first stage is a Tabata.
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await freshApp(page);
    await page.evaluate(() => {
      localStorage.setItem("jungle_draft_class", JSON.stringify({
        name: "Interval Test",
        stages: [{
          id: "s1", type: "circuit", name: "Tabata Block", dur: 600,
          exercises: [{ n: "Burpees", timing: "tabata", workSec: 20, restSec: 10, rounds: 8 }],
          tracks: [],
        }],
      }));
    });
    await page.reload();
    await gotoDisplay(page, "Coach");

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    // At elapsed 0 the block opens in WORK, round 1 of 8, 20-on/10-off.
    await expect(page.getByText("WORK").first()).toBeVisible();
    await expect(page.getByText(/Round 1 of 8/)).toBeVisible();
    await expect(page.getByText(/20s on \/ 10s off/)).toBeVisible();
    await expect(page.getByText("Burpees").first()).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("the primary fraction is invariant across 1080p and 4K", async ({ page }) => {
    // This is the property fixed px lacked and the whole point of tvFont: the same
    // fraction of the screen on both walls. On the pre-fix code the 4K fraction was
    // roughly HALF the 1080p one — this assertion fails loudly there.
    const fracs = {};
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await freshApp(page);
      await gotoDisplay(page, "Coach");
      const m = await primaryFraction(page);
      fracs[vp.name] = m.fontFrac;
    }
    expect(
      Math.abs(fracs["1080p"] - fracs["4K"]),
      `1080p=${(fracs["1080p"] * 100).toFixed(2)}%  4K=${(fracs["4K"] * 100).toFixed(2)}% — should be viewport-invariant`,
    ).toBeLessThan(0.012);
  });
});

// ── SWEEP · Brand Studio → Room TV token propagation ─────────────────────────
//
// The gym's identity has to survive the trip to the only screen a MEMBER looks at.
// Every skin the generator produces is dark, so the two derivations that assumed a
// dark theme were invisible until a coach hand-builds a LIGHT palette in the
// Brand Studio's editor — which only exposes bg/card/navy/accent/green/text/muted,
// so a dark skin's other tokens came along unchanged.
//
// This is the light brand a boutique/wellness studio actually builds.
const LIGHT_BRAND = {
  bg: "#fff7f0", card: "#ffffff", navy: "#f3e9e0",
  // The polarity-wrong token the editor cannot reach: a dark theme's white
  // hairline, inherited onto a near-white surface.
  border: "rgba(255,255,255,.07)",
  accent: "#ff2d78", green: "#ff8ab5", text: "#1a1014", muted: "#7a6a70",
};

async function lightBrandApp(page) {
  await page.goto("./");
  await page.evaluate((tk) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_custom_skin", JSON.stringify(tk));
    // A bare string, not JSON — `store.getSkinId` reads it with readStr.
    localStorage.setItem("jungle_skin", "custom");
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "Iron Habit" }));
  }, LIGHT_BRAND);
  await page.reload();
}

const cssVars = page => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const g = k => cs.getPropertyValue(k).trim();
  const hex = h => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const lum = ([r, gg, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
  const ratio = (a, b) => (Math.max(lum(hex(a)), lum(hex(b))) + 0.05) / (Math.min(lum(hex(a)), lum(hex(b))) + 0.05);
  return {
    bg: g("--bg"), border: g("--border"),
    onAccent: ratio(g("--on-accent"), g("--accent")),
    onGreen: ratio(g("--on-green"), g("--green")),
  };
});

test.describe("a light brand survives the trip to the room", () => {
  test("the tokens the room renders with are readable, not just the ones the coach picked", async ({ page }) => {
    const errors = watchConsole(page);
    await lightBrandApp(page);
    const v = await cssVars(page);

    // The label colour on the accent and green fills. The old rule
    // (`luminance > 0.18 ? bg : text`) picked `bg` — near-white — giving 3.36:1
    // and 2.07:1, when the other candidate it already had gave 5.23 and 8.47.
    expect(v.onAccent).toBeGreaterThanOrEqual(4.5);
    expect(v.onGreen).toBeGreaterThanOrEqual(4.5);

    // The hairline. `rgba(255,255,255,.07)` on `#fff7f0` is invisible, and it is
    // every card edge, input outline, divider and schedule grid line in the app.
    expect(v.border).toMatch(/^rgba\(0,0,0/);
    expect(v.bg).toBe(LIGHT_BRAND.bg);

    expectNoConsoleErrors(errors);
  });

  // The Floor board is the mid-class member-facing surface and it is fully
  // branded: the gym's own background, its name and its monogram.
  test("the Floor board wears the gym's own background and name", async ({ page }) => {
    const errors = watchConsole(page);
    await lightBrandApp(page);
    await gotoDisplay(page, "Floor");

    await expect(page.getByText("IRON HABIT")).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(255, 247, 240)");

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // ✅ MEASURED (session 11), DECIDED AND FIXED (session 12, Dylan's call).
  //
  // The three Room TV boards used to answer "what colour is a room display?"
  // three different ways, and the one a member sees FIRST ignored the brand:
  //
  //   Plan  (OverviewDisplayScreen, the DEFAULT mode before a class starts)
  //         hardcoded #050705, and NO brand mark at all
  //   Floor (FloorLiveScreen)   var(--bg) — the gym's own, with name + monogram
  //   Coach (DisplayScreen)     var(--bg) on three presets, hardcoded #000 on the
  //                             fourth, so switching to Timer-Only went black
  //
  // Measured live with the light brand above: Plan rendered on rgb(5,7,5) while
  // Floor rendered on rgb(255,247,240). On one TV, a member walking in saw
  // near-black, then the gym's cream as the class started.
  //
  // The decision: room displays are the gym's brand on the biggest screen they
  // own. Every generated skin is dark, so these stay projector-dark in practice —
  // a light board now happens only because a coach built a light palette.
  //
  // HOW THIS MEASURES. Session 11's version read the first `position:fixed`
  // element with `zIndex>=500` and fell back to `document.body`. Only Plan has
  // one, so Floor and Coach were both scored on the BODY — a board could paint
  // itself pure black over a cream body and still pass. It also compared Plan's
  // outer surround against Floor's root, which is why it read as a bigger
  // disagreement than it was: Plan's inner screen was already `var(--bg)`; the
  // surround and the bezel were the literal ones.
  //
  // So: collect every element that covers the viewport and paints something, and
  // require all of them to be the gym's own tokens. That is the real invariant —
  // no full-screen surface on a room board may be a colour the gym did not pick —
  // and it is blind to which element happens to be the root.
  test("the three room boards agree on whose background they wear", async ({ page }) => {
    const errors = watchConsole(page);
    await lightBrandApp(page);

    const paintsOf = async (mode) => {
      // Back to the app shell first: a board is fullscreen, so `gotoDisplay`'s
      // "Class Runner" nav button does not exist while one is open. Reload rather
      // than Escape — the brand lives in localStorage and survives, and the three
      // boards do not all exit the same way.
      await page.reload();
      await gotoDisplay(page, mode);
      return page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)")) out.push(bg);
        }
        return out;
      });
    };

    const cs = await page.evaluate(() => {
      const g = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
      return { bg: g("--bg"), card: g("--card"), navy: g("--navy") };
    });
    // Read from the tokens rather than retyped, so this cannot drift from the skin.
    const asRgb = hex => { const h = hex.replace("#", ""); const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return `rgb(${n.join(", ")})`; };
    const brand = new Set([cs.bg, cs.card, cs.navy].map(asRgb));

    for (const mode of ["Plan", "Floor", "Coach"]) {
      const paints = await paintsOf(mode);
      expect(paints.length, `${mode} paints no full-screen surface`).toBeGreaterThan(0);
      paints.forEach(p =>
        expect(brand, `${mode} paints ${p}, which is not one of the gym's tokens`).toContain(p));
    }
    expectNoConsoleErrors(errors);
  });

  // The other half of the decision. A background alone is not a brand: Plan was
  // the only board carrying no mark, and it is the one a member looks at longest.
  test("the Plan board a member walks in to carries the gym's name", async ({ page }) => {
    const errors = watchConsole(page);
    await lightBrandApp(page);
    await gotoDisplay(page, "Plan");

    await expect(page.getByText("IRON HABIT")).toBeVisible();
    // Visible, not merely present: the ordering constraint that made this unsafe
    // before the background was settled. BrandLogo draws the name in `--text`,
    // which on this brand is near-black ink and was invisible on the old board.
    const ink = await page.getByText("IRON HABIT").evaluate(el => getComputedStyle(el).color);
    expect(ink).toBe("rgb(26, 16, 20)");

    await expect(page.getByText(/Something broke|stopped responding/i)).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  // The monogram tile hardcoded `var(--bg)` as its ink on the `--accent` fill —
  // the exact dark-theme assumption session 11 removed from `--on-accent` itself,
  // reintroduced at every placement of the mark. On this brand that is near-white
  // on hot pink: 3.36:1, below AA, against 5.23:1 for the token.
  test("the brand monogram uses the readable ink, not the background colour", async ({ page }) => {
    await lightBrandApp(page);
    await gotoDisplay(page, "Plan");

    const tile = page.getByText("I", { exact: true }).first();
    const seen = await tile.evaluate(el => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    expect(seen.bg).toBe("rgb(255, 45, 120)");     // --accent
    expect(seen.color).toBe("rgb(26, 16, 20)");    // --text, via --on-accent
    expect(seen.color).not.toBe("rgb(255, 247, 240)");
  });
});
