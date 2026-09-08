import { test, expect } from "@playwright/test";
import { freshApp, nav, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";
// 🔴 IMPORTED, NOT RETYPED. This file held its own `const TV_MIN_PX = 11` and a
// bare `fs < 11` inside the page evaluate — a third and fourth copy of a number
// whose whole job is to be one number. Raising the floor in displayKit.js would
// have left this suite still asserting the old one, and passing.
import { TV_MIN_PX } from "../src/screens/runner/displayKit.js";

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

// The two boards that run DURING a class and put a clock on the wall.
//
// 🔴 WHAT THE PLAN BOARD IS AND IS NOT EXEMPT FROM, because "no timer, so the
// rule does not apply" was doing too much work. The Fable spec's P2 has two
// halves: the PRIMARY element (current move + timer) holds ~8-12% of screen
// height, and SECONDARY text ~3%. The Plan board has no timer, so it has no
// primary element, so the band below genuinely cannot be asserted of it — that
// part of the exemption is right and stays.
//
// It is not exempt from being read. It is the board a member walks in and looks
// at, and `UI-UX-DIRECTION` §1 ranks it above every staff screen. So the rule it
// DOES get is the invariance property — see "the Plan board holds its share of
// the wall" at the bottom of this file — and the gap between what it renders and
// the spec's ~3% is measured and written up rather than quietly exempted.
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
  // The skin is applied by App, which is a lazy chunk since N4 split the root.
  // Reading :root before it mounts returns "" and every ratio below becomes NaN.
  await waitForApp(page);
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

  // N4 made AuthGate + App a lazily-loaded chunk, which bought a member ~570 KB
  // and cost a window between the first paint and that chunk arriving. For a
  // studio with a light palette that window was a flash of near-black — the
  // exact "whose background do you wear" failure this describe block exists
  // about, just moved earlier in the load.
  //
  // The boot screen therefore wears the colours the app painted LAST time
  // (colors.js: bootColours). Measured by holding the chunk so the boot state
  // stops being a race.
  test("the boot screen wears the gym's background, not a dark default", async ({ page }) => {
    await lightBrandApp(page);            // paints once, so the colours are cached

    await page.route("**/StaffApp.jsx*", route => { /* never fulfilled: hold the app in boot */ });
    await page.reload();

    await expect(page.getByText("Loading…")).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // The gym's cream. Before the cache this was rgb(10, 15, 12).
    expect(bg).toBe("rgb(255, 247, 240)");
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

// ─── The 10-foot rule, measured on the wall ──────────────────────────────────
//
// `displayKit.js` carries the arithmetic and `displayKit.test.js` pins it, but
// neither can see a raw `fontSize:"9px"` in the JSX — and that is how the Floor
// board's START badge came to render at 9px on a 1280 display AND at 9px on a
// 1920 one. This is the guard that reads the rendered board.
//
// ⚠️ 1280×720, deliberately. `tvFont` keys to viewport HEIGHT against a 1080
// reference, so every room-facing size is at its smallest on a 720p panel — a
// projector, or a laptop on an HDMI cable, which is what a boutique studio
// actually plugs in. Measuring on 1080p would measure the case that was fine.
test.describe("nothing on a room-facing board is smaller than the wall allows", () => {
  const STAGES = [
    { id:"s1", type:"warmup",   name:"Warm-Up",       dur:300, exercises:[{n:"World's Greatest Stretch",s:"",r:"5 min",rest:""}], tracks:[] },
    { id:"s2", type:"strength", name:"Strength Block",dur:900, exercises:[{n:"Conventional Deadlift",s:"5",r:"5",rest:"3m"}], tracks:[] },
    { id:"s3", type:"circuit",  name:"Circuit Blast", dur:600, exercises:[{n:"Kettlebell Swing",s:"3",r:"15",rest:"30s"}], tracks:[] },
  ];

  // What each board actually puts on the wall differs — the Floor board shows
  // STATIONS (movements), not stage names — so the "there is a class on this
  // board" anchor has to be per-mode rather than one hopeful string.
  const ANCHOR = { Plan: /Strength Block/, Floor: /Conventional Deadlift/, Coach: /Strength Block|World's Greatest/ };

  for (const mode of ["Plan", "Floor", "Coach"]) {
    test(`${mode} clears ${TV_MIN_PX}px on a 720p wall`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("./");
      await page.evaluate((st) => {
        localStorage.clear();
        sessionStorage.setItem("jungle_pin_ok", "1");
        localStorage.setItem("jungle_draft_class", JSON.stringify({ name: "Sunrise Strength", classChoice: null, stages: st }));
      }, STAGES);
      await page.reload();
      await page.getByRole("button", { name: "Class Runner", exact: true }).click();
      await page.getByRole("button", { name: /^Room TV$/ }).first().click();
      await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`^${mode}$`) }).click();

      const r = await page.evaluate((MIN) => {
        const small = []; let measured = 0;
        document.querySelectorAll("body *").forEach((el) => {
          if (el.children.length) return;
          const t = (el.textContent || "").trim(); if (!t) return;
          const rc = el.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) return;
          measured++;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < MIN) small.push(`${fs}px "${t.slice(0, 30)}"`);
        });
        return { measured, small };
      }, TV_MIN_PX);

      // 🔴 The board must have a class on it. An empty Room TV clears any type
      // floor trivially — this repo has shipped that mistake in this very file's
      // sibling sweep, and a count control only helps if it counts the content.
      expect(r.measured, `${mode}: only ${r.measured} text nodes — the board is empty`).toBeGreaterThan(10);
      await expect(page.getByText(ANCHOR[mode]).first(),
        `${mode} is not showing the seeded class`).toBeVisible();
      expect(r.small, `${mode} renders text below ${TV_MIN_PX}px on a 720p wall:\n${r.small.join("\n")}`).toEqual([]);
    });
  }

  test("the coach's font-scale reaches all three boards, not just one", async ({ page }) => {
    // `FONT_SCALES` lived in DisplayScreen.jsx, so the other two boards could not
    // read it without importing a sibling screen — they called `tvFont` with no
    // `mult` and a coach who chose XL got XL on one surface out of three.
    const sizeOn = async (mode, scale) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("./");
      await page.evaluate(({ st, sc }) => {
        localStorage.clear();
        sessionStorage.setItem("jungle_pin_ok", "1");
        localStorage.setItem("jungle_draft_class", JSON.stringify({ name: "Sunrise Strength", classChoice: null, stages: st }));
        localStorage.setItem("jungle_disp_prefs", JSON.stringify({ preset: "full", fontScale: sc }));
      }, { st: STAGES, sc: scale });
      await page.reload();
      await page.getByRole("button", { name: "Class Runner", exact: true }).click();
      await page.getByRole("button", { name: /^Room TV$/ }).first().click();
      await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`^${mode}$`) }).click();
      return page.evaluate(() => {
        const sizes = [...document.querySelectorAll("body *")]
          .filter(e => !e.children.length && (e.textContent || "").trim() && e.getBoundingClientRect().width > 2)
          .map(e => parseFloat(getComputedStyle(e).fontSize));
        return Math.max(...sizes);
      });
    };
    // ⚠️ WHAT THIS DOES AND DOES NOT PROVE. It proves the setting REACHES each
    // board, which is the defect — it reached one of the three. It does NOT
    // prove every element on a board scales: reverting one of the Plan board's
    // three `tvFont` calls leaves the largest element still scaling and this
    // still passes. A per-element claim needs the elements identified, which is
    // a bigger test than the defect warrants. Said here rather than implied by a
    // name, so the next reader does not over-trust it.
    //
    // The ratio, not merely ">", is what makes it an assertion about the SCALE
    // rather than about a rounding wobble: XL is 1.85×, so a board honouring it
    // grows its largest type by at least half again.
    for (const mode of ["Plan", "Floor", "Coach"]) {
      const m = await sizeOn(mode, "m");
      const xl = await sizeOn(mode, "xl");
      expect(xl / m, `${mode}: the coach chose XL (1.85x) and this board's largest type `
        + `went ${m}px -> ${xl}px`).toBeGreaterThan(1.5);
    }
  });
});


// ─── A source comment rendered on the wall, in front of paying members ───────
//
// 🔴 WHAT SHIPPED. `DisplayScreen.jsx` carried a bare `/* … */` in the CHILDREN
// of a JSX element, and in JSX that is TEXT, not a comment — braces are what
// make a comment a comment. So the Coach board's Tempo Guide rendered
//
//   "/* a sub-component: no scaleMult in scope, and the absolute floor is what
//    this needed */"
//
// wrapped over eight lines and straight through the BPM ring, on the biggest
// screen in the gym. It compiled, `lint:crash` was 0, and every one of 1290 unit
// and 534 e2e tests passed with it on screen — because nothing looked at what
// the board rendered. It was found by driving the board and READING it.
//
// `src/ui/jsxText.test.js` is the source-level sweep. This is the other half:
// the claim about the SHIPPED SCREEN, which is the one a member is standing in
// front of.
test.describe("nothing on a room board is a note the author left themselves", () => {
  for (const mode of ["Plan", "Floor", "Coach"]) {
    test(`the ${mode} board renders no comment delimiter`, async ({ page }) => {
      const errors = watchConsole(page);
      // 1280x720 — a projector, or a laptop on HDMI. The size a gym's wall
      // actually is, and the one the defect was seen at.
      await page.setViewportSize({ width: 1280, height: 720 });
      await freshApp(page);
      await gotoDisplay(page, mode);

      // POSITIVE CONTROL: the board really rendered. An empty screen contains no
      // comment delimiter either, and this repo has been fooled by that twice.
      const text = await page.locator("body").innerText();
      expect(text.length, `${mode}: the board rendered nothing`).toBeGreaterThan(80);
      await expect(page.getByText(MODES[mode].ready()).first()).toBeVisible();

      expect(text, `${mode} board is rendering a source comment`).not.toMatch(/\/\*|\*\//);
      expectNoConsoleErrors(errors);
    });
  }
});

// ─── §3.5 · the three LAYOUT PRESETS, which nothing had ever rendered ────────
//
// 🔴 A DIFFERENT AXIS FROM THE MODES ABOVE. `gotoDisplay` picks a MODE — Plan,
// Floor or Coach — and everything before this point drives those. Full, Minimal
// and Timer Only are the Coach board's LAYOUT presets, chosen from its own
// settings panel, and until this suite no test had ever selected one and read
// what came back. The single test that touched them (`mountWrites.spec.js`)
// clicks "Minimal" to prove the choice is WRITTEN to localStorage and asserts
// nothing about the board — so a preset that rendered a blank wall would have
// passed it. A coach picking "Timer Only" was putting a screen on the wall
// nothing had ever looked at.
//
// What these assert is the preset's own promise, in both directions: the label
// in `DISPLAY_PRESETS` says what each one shows, and "Timer + stage name ONLY"
// is a claim about what is NOT there. A preset that quietly rendered the full
// board would satisfy every positive assertion.
//
// 1280x720 throughout — a projector or a laptop on HDMI, which is what a
// boutique studio actually plugs in, and where `tvFont` sizes are smallest.
test.describe("the Room TV's layout presets, rendered and read", () => {
  const STAGES = [
    { id:"s1", type:"warmup",   name:"Warm-Up",        dur:300, exercises:[{n:"World's Greatest Stretch",s:"",r:"5 min",rest:""}], tracks:[] },
    { id:"s2", type:"strength", name:"Strength Block", dur:900, exercises:[{n:"Conventional Deadlift",s:"5",r:"5",rest:"3m"}], tracks:[] },
    { id:"s3", type:"circuit",  name:"Circuit Blast",  dur:600, exercises:[{n:"Kettlebell Swing",s:"3",r:"15",rest:"30s"}], tracks:[] },
  ];

  async function seedAndOpenCoach(page, prefs = null) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("./");
    await page.evaluate(({ st, pf }) => {
      localStorage.clear();
      sessionStorage.setItem("jungle_pin_ok", "1");
      localStorage.setItem("jungle_draft_class", JSON.stringify({ name: "Sunrise Strength", classChoice: null, stages: st }));
      if (pf) localStorage.setItem("jungle_disp_prefs", JSON.stringify(pf));
    }, { st: STAGES, pf: prefs });
    await page.reload();
    await page.getByRole("button", { name: "Class Runner", exact: true }).click();
    await page.getByRole("button", { name: /^Room TV$/ }).first().click();
    await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
    await page.getByRole("button", { name: "Coach", exact: true }).click();
  }

  // The settings panel is one click past the board, behind a gear that only
  // appears once the transient mode overlay is awake.
  async function choosePreset(page, label) {
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Display settings" }).first().click();
    await expect(page.getByText(/Layout Preset/i)).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
    // Dismiss the panel by clicking the board itself. ⚠️ NOT Escape — Escape is
    // wired to `onBack` and leaves display mode entirely, which is how the first
    // draft of this suite ended up reading the Class Runner instead of the wall.
    await page.mouse.click(8, 360);
  }

  // What each preset PROMISES, from `DISPLAY_PRESETS`, and what that promise
  // rules out. `absent` is the half that makes these real assertions: every
  // `present` string is also on the Full board, so a preset that silently fell
  // back to Full would pass a positive-only test.
  const PRESETS = [
    { label: "Full",       claim: "Timer + exercises",
      present: [/Warm-Up/, /remaining/, /DOING NOW/i, /World's Greatest Stretch/], absent: [] },
    { label: "Minimal",    claim: "Timer + stage name only",
      present: [/Warm-Up/, /remaining/, /Next: ?/], absent: [/DOING NOW/i, /World's Greatest Stretch/] },
    { label: "Timer Only", claim: "Giant full-screen clock",
      present: [/Warm-Up/i, /Stage 1 of 3/], absent: [/DOING NOW/i, /World's Greatest Stretch/, /remaining/] },
  ];

  for (const p of PRESETS) {
    test(`"${p.label}" renders ${p.claim}`, async ({ page }) => {
      const errors = watchConsole(page);
      await seedAndOpenCoach(page);
      if (p.label !== "Full") await choosePreset(page, p.label);

      // POSITIVE CONTROL: a board rendered at all, and it is showing the SEEDED
      // class rather than an empty runner. An empty screen satisfies every
      // `absent` assertion below trivially — this repo has shipped that mistake
      // in this very file's sibling sweep.
      const text = await page.locator("body").innerText();
      expect(text.length, `${p.label}: the board rendered nothing`).toBeGreaterThan(40);
      await expect(page.getByText(/^5:00$/).first(),
        `${p.label}: no clock on the board`).toBeVisible();

      for (const re of p.present) expect(text, `${p.label} must show ${re}`).toMatch(re);
      for (const re of p.absent)  expect(text, `${p.label} claims "${p.claim}" but shows ${re}`).not.toMatch(re);

      expectNoConsoleErrors(errors);
    });

    test(`"${p.label}" keeps the room's type above the wall floor`, async ({ page }) => {
      // The 11px floor is asserted for the three MODES above, all in the default
      // preset. Two of the three presets had never been measured at all.
      await seedAndOpenCoach(page);
      if (p.label !== "Full") await choosePreset(page, p.label);

      const r = await page.evaluate(() => {
        const small = []; let measured = 0;
        document.querySelectorAll("body *").forEach((el) => {
          if (el.children.length) return;
          const t = (el.textContent || "").trim(); if (!t) return;
          const rc = el.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) return;
          measured++;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 11) small.push(`${fs}px "${t.slice(0, 30)}"`);
        });
        return { measured, small };
      });
      expect(r.measured, `${p.label}: only ${r.measured} text nodes — the board is empty`).toBeGreaterThan(5);
      expect(r.small, `${p.label} renders text below 11px on a 720p wall:\n${r.small.join("\n")}`).toEqual([]);
    });
  }

  test("the clock is the biggest thing on the wall in every preset", async ({ page }) => {
    // P2's 10-foot rule, per preset rather than per mode. The floor is what
    // matters — a member reads the clock from 8m — and "Timer Only" is allowed
    // to be far above it, because a giant full-screen clock is its whole
    // description. The assertion is therefore a FLOOR plus "it is the clock",
    // not a band that would fail the preset for doing its job.
    for (const label of ["Full", "Minimal", "Timer Only"]) {
      await seedAndOpenCoach(page);
      if (label !== "Full") await choosePreset(page, label);
      const biggest = await page.evaluate(() => {
        const vh = window.innerHeight;
        let best = null;
        document.querySelectorAll("*").forEach((el) => {
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!own) return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh) return;
          const fp = parseFloat(getComputedStyle(el).fontSize);
          if (!best || fp > best.fp) best = { fp, text: el.textContent.trim().slice(0, 20) };
        });
        return best ? { ...best, frac: best.fp / vh } : null;
      });
      expect(biggest, `${label}: nothing measurable on the board`).not.toBeNull();
      expect(biggest.text, `${label}: the biggest element is "${biggest.text}", not the clock`).toMatch(/^\d+:\d\d$/);
      expect(biggest.frac, `${label}: clock is ${(biggest.frac * 100).toFixed(1)}% of a 720p wall`).toBeGreaterThan(0.08);
    }
  });

  test("the preset a coach chose is the one the wall comes back in", async ({ page }) => {
    await seedAndOpenCoach(page);
    await choosePreset(page, "Timer Only");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jungle_disp_prefs") || "{}").preset),
      { message: "choosing a preset must persist it" }).toBe("timer");

    // 🔴 And the board RESTORES it. The stored value was already asserted by
    // `mountWrites.spec.js`; what nothing checked is that the wall comes back in
    // that layout after the TV is power-cycled, which is the only reason to
    // store it.
    await seedAndOpenCoach(page, { preset: "timer", fontScale: "m" });
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/Stage 1 of 3/);
    expect(text, "restored board is not Timer Only").not.toMatch(/DOING NOW/i);
  });

  test("a preset that no longer exists falls back to Full, not to a blank wall", async ({ page }) => {
    // 🔴 `preset:"music"` is what a display that ran before the music quarantine
    // has in localStorage. That preset is filtered out of `DISPLAY_PRESETS`, and
    // restoring it blindly would put an empty album-art panel on the gym's TV.
    // The guard has been in the code since the quarantine with a comment saying
    // so and no test behind it.
    await seedAndOpenCoach(page, { preset: "music", fontScale: "m" });
    const text = await page.locator("body").innerText();
    expect(text, "a retired preset must not survive into the room").toMatch(/DOING NOW/i);
    expect(text).toMatch(/World's Greatest Stretch/);
    // The settings panel must not offer it either.
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Display settings" }).first().click();
    await expect(page.getByText(/Layout Preset/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Music Focus/ })).toHaveCount(0);
  });
});

// ─── Two labels in one corner, on the board the room reads ──────────────────
//
// 🔴 WHAT SHIPPED, and it was the DEFAULT state at the start of every class.
// The Floor board's station card laid out its `START` / `FINISH` badge in a
// `space-between` header row — so the badge sits at the card's right edge — and
// then drew `FOLLOW` at `position:absolute; top:10px; right:10px`. The same
// corner. Station 1 is the START station AND the live station at the moment a
// class begins, so the studio floor board opened every class with "START" and
// "FOLLOW" printed on top of each other, both in the stage's own colour, 45px
// of overlap wide. Neither was readable. The finish station collides the same
// way on the last stage.
//
// Found by driving the Floor board at 1280x720 and looking at the screenshot;
// no assertion in this repo could have noticed, because every one of those
// strings was present and visible — they were simply in the same place.
//
// ⚠️ THE SWEEP IS DELIBERATELY NARROW: leaf elements that directly contain
// text, overlapping by more than 2px on BOTH axes. Measured across all three
// boards before it was written — Plan and Coach were already clean and Floor had
// exactly this one hit — so it is a rule with a known-zero baseline rather than
// a threshold picked to fit.
test.describe("no two labels on a room board are drawn in the same place", () => {
  const OVERLAP_SCAN = () => {
    const leaves = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length) return;
      const t = (el.textContent || "").trim(); if (!t) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") return;
      leaves.push({ t: t.slice(0, 30), x: r.x, y: r.y, w: r.width, h: r.height });
    });
    const hits = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) hits.push(`"${a.t}" x "${b.t}" (${Math.round(ox)}x${Math.round(oy)}px)`);
      }
    }
    return { count: leaves.length, hits };
  };

  for (const mode of ["Plan", "Floor", "Coach"]) {
    test(`${mode}, at the moment a class starts`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await freshApp(page);
      await gotoDisplay(page, mode);
      // ⚠️ WAIT FOR THE MODE PILL TO GO. `gotoDisplay` ends one click after
      // waking the transient Plan/Floor/Coach control, and that pill floats OVER
      // the stage-journey strip by design — it is a control the coach summons
      // with a mouse move and it hides itself after 4.5s. Scanning while it is
      // up measures the overlay, not the board, and reports five hits on a Coach
      // board that is fine. What a member looks at is the board after it goes.
      await expect(page.getByRole("button", { name: /^Plan$/ })).toBeHidden({ timeout: 8_000 });

      const r = await page.evaluate(OVERLAP_SCAN);
      // POSITIVE CONTROL: an empty board has no overlapping labels either. The
      // three boards render 21-22 text leaves on the seeded class.
      expect(r.count, `${mode}: only ${r.count} text nodes — the board is empty`).toBeGreaterThan(10);
      await expect(page.getByText(MODES[mode].ready()).first()).toBeVisible();

      expect(r.hits, `${mode} draws two labels in the same place:\n${r.hits.join("\n")}`).toEqual([]);
      expectNoConsoleErrors(errors);
    });
  }

  test("the Floor board's live station shows FOLLOW and START side by side", async ({ page }) => {
    // The specific claim, stated as itself so a future refactor that merely
    // hides one of them cannot pass the overlap sweep above.
    await page.setViewportSize({ width: 1280, height: 720 });
    await freshApp(page);
    await gotoDisplay(page, "Floor");
    await expect(page.getByRole("button", { name: /^Plan$/ })).toBeHidden({ timeout: 8_000 });

    const follow = page.getByText("FOLLOW", { exact: true }).first();
    const start  = page.getByText("START", { exact: true }).first();
    await expect(follow).toBeVisible();
    await expect(start).toBeVisible();

    const f = await follow.boundingBox();
    const s = await start.boundingBox();
    expect(f).not.toBeNull();
    expect(s).not.toBeNull();
    const ox = Math.min(f.x + f.width, s.x + s.width) - Math.max(f.x, s.x);
    expect(ox, `FOLLOW and START overlap by ${Math.round(ox)}px`).toBeLessThanOrEqual(0);
  });
});

// ─── The Plan board holds its share of the wall ──────────────────────────────
//
// 🔴 THE DEFECT THIS PINS, and it is one line of reasoning applied to one span
// and not to its neighbours. `OverviewDisplayScreen.jsx` already carried the
// rule in a comment beside the stage-type label:
//
//     room-facing: tvFont so it holds its share of the wall
//
// and every sibling on the same card — the stage's duration, the exercise's
// sets and reps, the "NOW" badge, the header chips, the class summary — was a
// fixed px literal. So on the board a member walks in and reads, the exercise
// NAME grew with the wall and the prescription under it did not.
//
// ⚠️ 1080p AND 4K, NOT 720p, and that is the whole design of this test. Below
// the 1080 reference `TV_MIN_PX` takes over and floors everything to the same
// 11px, which HIDES the defect: at 720p a fixed 11px and a tvFont(11) render
// identically. The divergence only appears above the reference, where tvFont
// doubles and a literal does not. Measured before the fix: the Plan board's
// exercise prescription was 1.02% of the wall at 1080p and 0.51% at 4K.
//
// This is deliberately NOT an assertion that the board meets the spec's ~3%
// secondary floor. It does not — its largest element is 2.4% — and closing that
// gap is a layout decision with a measured cost (a 3% floor truncates the Coach
// board's stage-journey strip). Written up in SESSION-38-HANDOFF.md §5. What is
// asserted here is the property that is unambiguously broken and unambiguously
// fixable: a wall is a wall, and the same board must present the same type at
// the same share of it.
test.describe("the Plan board holds its share of the wall", () => {
  const STAGES = [
    { id:"s1", type:"warmup",   name:"Warm-Up",        dur:300, exercises:[{n:"World's Greatest Stretch",s:"",r:"5 min",rest:""}], tracks:[] },
    { id:"s2", type:"strength", name:"Strength Block", dur:900, exercises:[{n:"Conventional Deadlift",s:"5",r:"5",rest:"3m"}], tracks:[] },
  ];

  // Every text element the BOARD draws, keyed by its text so the two viewports
  // can be lined up. Chrome is excluded by the `data-tv-chrome` marker the
  // component carries, not by a list of strings here: the back control and the
  // brand mark are things a coach clicks and a logo, not the class.
  async function share(page, w, h) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("./");
    await page.evaluate((st) => {
      localStorage.clear();
      sessionStorage.setItem("jungle_pin_ok", "1");
      localStorage.setItem("jungle_draft_class", JSON.stringify({ name: "Sunrise Strength", classChoice: null, stages: st }));
    }, STAGES);
    await page.reload();
    await page.getByRole("button", { name: "Class Runner", exact: true }).click();
    await page.getByRole("button", { name: /^Room TV$/ }).first().click();
    await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Plan$/ }).click();
    await expect(page.getByText(/\d+ stages · /).first()).toBeVisible();
    return page.evaluate(() => {
      const vh = window.innerHeight;
      const out = {};
      // The board's own subtree: the transient Plan/Floor/Coach pill and the
      // Exit button belong to RoomTV, float over the board, and are not it.
      document.querySelectorAll("body *").forEach((el) => {
        if (el.children.length) return;
        if (el.closest("[data-tv-chrome]")) return;
        const t = (el.textContent || "").trim(); if (!t) return;
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
        if (r.top >= vh) return;
        out[t] = +((parseFloat(getComputedStyle(el).fontSize) / vh) * 100).toFixed(3);
      });
      return out;
    });
  }

  test("🔴 every line on it is the same share of the screen at 1080p and at 4K", async ({ page }) => {
    const hd = await share(page, 1920, 1080);
    const uhd = await share(page, 3840, 2160);

    // POSITIVE CONTROL. The board really rendered a class both times, and the
    // things this is about are on it. An empty board agrees with itself.
    for (const probe of ["Sunrise Strength", "Warm-Up", "Conventional Deadlift", "5× 5 · 3m rest"]) {
      expect(Object.keys(hd), `"${probe}" is not on the 1080p board`).toContain(probe);
      expect(Object.keys(uhd), `"${probe}" is not on the 4K board`).toContain(probe);
    }
    expect(Object.keys(hd).length).toBeGreaterThan(10);

    // ── The three that CANNOT be fixed yet, named rather than skipped ────────
    //
    // 🔴 THE FLOOR BLOCKS ITS OWN FIX. These render at a 12px literal, and
    // `tvFont(12)` on a 720p wall comes out at 11px because TV_MIN_PX floors it
    // there — so moving them onto the scale to win 4K would cost a pixel on the
    // projector this repo actually measures on, on the board a member reads.
    // Every base below 16 has the same problem. They stay literals until the
    // floor question in SESSION-38-HANDOFF.md §5 is answered.
    //
    // ⚠️ THE LIST IS CHECKED IN BOTH DIRECTIONS. An allowlist rots silently
    // downward: if one of these is fixed, or its copy changes, the sweep would
    // keep excusing a name that no longer exists and nobody would notice. So an
    // entry that is NOT drifting fails too — the same shape as
    // `audit.staleSeams` in scripts/audit-store-writers.mjs.
    const KNOWN_LITERAL = [
      /^\d+ stages · /,     // the class summary under the class name
      /^\d+m$/,             // each stage's duration on its card header
    ];
    const excused = t => KNOWN_LITERAL.some(re => re.test(t));

    const drift = [], excusedButFixed = [];
    for (const [text, pct] of Object.entries(hd)) {
      const other = uhd[text];
      if (other === undefined) continue;          // wrapped differently; not a size claim
      // 2% relative slack for subpixel rounding at two very different heights.
      const moved = Math.abs(other - pct) / pct > 0.02;
      if (moved && !excused(text)) drift.push(`"${text}" ${pct}% at 1080p, ${other}% at 4K`);
      if (!moved && excused(text)) excusedButFixed.push(`"${text}" holds ${pct}% — take it off KNOWN_LITERAL`);
    }
    expect(drift, `the Plan board changes size relative to the wall:\n${drift.join("\n")}`).toEqual([]);
    expect(excusedButFixed, excusedButFixed.join("\n")).toEqual([]);
    // And the list must still MATCH something, or it is excusing nothing and
    // proving nothing.
    expect(Object.keys(hd).filter(excused).length,
      "KNOWN_LITERAL matched nothing — the copy changed and the exclusion is dead")
      .toBeGreaterThan(1);
  });

  test("and the class's own words are never the smallest thing on it", async ({ page }) => {
    // The control for the test above, which a board rendering EVERYTHING at one
    // size would also satisfy. The class name is the biggest, and the movements
    // a member is here to read outrank the chrome around them.
    const hd = await share(page, 1920, 1080);
    const nameShare = hd["Sunrise Strength"];
    const move = hd["Conventional Deadlift"];
    expect(nameShare).toBeGreaterThan(move);
    expect(move, "the movement name is smaller than the fixed 11px it used to be")
      .toBeGreaterThanOrEqual(11 / 1080 * 100);
  });
});
