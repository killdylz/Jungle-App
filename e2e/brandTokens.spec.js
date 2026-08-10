import { test, expect } from "@playwright/test";
import { nav, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The white-label promise, enforced ───────────────────────────────────────
//
// The USP is "your brand on the studio's own screens", and `UI-UX-DIRECTION` §1's rule
// for delivering it — tokens only, no raw hex in components — had nothing enforcing it
// across 44 spec files.
//
// The defect this pins: `--on-accent` is contrast-computed by `inkOn()`, which asks
// which of bg/text reads better against the accent. Four sites in the Brand Studio
// hardcoded Canopy's near-black `#0A0F0C` instead, so on any skin whose correct ink is
// LIGHT they rendered near-black on a dark accent. Measured on a navy accent, where the
// token resolves to #F4F6F2, the selected vibe pill was **1.25:1** — invisible, on the
// screen `PRODUCT-DIRECTION` §3 says the product is demoed from.
//
// ⚠️ WHY A DARK-ACCENT / LIGHT-BACKGROUND SKIN. Every shipped preset is dark, and on a
// dark preset `#0A0F0C` happens to be very close to the correct answer — so the bug is
// invisible on all three. `colors.js` documents this polarity trap in its own header:
// derivations that assume a dark theme are right until a boutique studio hand-builds a
// light identity, which is exactly what the palette editor is for.
const LIGHT_SKIN = {
  bg: "#F4F6F2", card: "#FFFFFF", navy: "#E7ECE6", border: "rgba(0,0,0,.12)",
  accent: "#12224A",           // dark navy: its correct ink is LIGHT, so a hardcoded
  green: "#1E6B4A",            // near-black fails here and nowhere else
  text: "#12181B", muted: "#5A6B60",
};

async function seedLightSkin(page) {
  await page.goto("./");
  await page.evaluate((skin) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    localStorage.setItem("jungle_custom_skin", JSON.stringify(skin));
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "Navy Barbell Co" }));
  }, LIGHT_SKIN);
  await page.reload();
  await waitForApp(page);
}

// WCAG relative luminance and contrast ratio.
//
// ⚠️ This deliberately handles OPAQUE colours only, and every element it is pointed at
// is checked to be opaque first. A general sweep must composite alpha — a chip styled
// `rgba(167,139,250,0.14)` read as SOLID purple produced twenty false positives in the
// scan that found this defect, and only one of the twenty-one was real.
const CONTRAST = `(() => {
  const lum = (c) => {
    const p = c.match(/[\\d.]+/g).map(Number).slice(0, 3).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  };
  window.__opaque = (c) => /^rgb\\(/.test(c);
  window.__contrast = (a, b) => {
    const s = [lum(a), lum(b)].sort((x, y) => y - x);
    return (s[0] + 0.05) / (s[1] + 0.05);
  };
})()`;

test.describe("brand tokens carry the gym's palette, not Canopy's", () => {
  test("the accent token's INK is computed, never hardcoded", async ({ page }) => {
    const errors = watchConsole(page);
    await seedLightSkin(page);
    await nav(page, "Brand Studio");
    await page.evaluate(CONTRAST);

    // CONTROL 1: the skin really is applied, and `--on-accent` really did resolve to
    // the light ink. Without this the assertion below could pass on a screen still
    // wearing Canopy, where `#0A0F0C` is nearly correct.
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { accent: cs.getPropertyValue("--accent").trim(), onAccent: cs.getPropertyValue("--on-accent").trim() };
    });
    expect(tokens.accent.toLowerCase()).toBe("#12224a");
    expect(tokens.onAccent.toLowerCase(), "inkOn must pick the LIGHT ink for a dark accent").toBe("#f4f6f2");

    // The vibe pills: exactly one is selected and painted with var(--accent).
    const pills = page.getByRole("button", { name: /^(Natural|Bold|Luxury|Clinical|Electric|Vibrant|Warm|Cool|Minimal)/ });
    // CONTROL 2: there are pills to measure. An empty locator makes every
    // per-element assertion below vacuously true.
    expect(await pills.count(), "no brand-vibe pills found — this test measures nothing").toBeGreaterThan(1);

    const measured = await pills.evaluateAll((els) => els.map((el) => {
      const cs = getComputedStyle(el);
      return { label: el.textContent.trim().slice(0, 20), color: cs.color, bg: cs.backgroundColor,
               opaque: window.__opaque(cs.color) && window.__opaque(cs.backgroundColor),
               ratio: window.__contrast(cs.color, cs.backgroundColor) };
    }));

    // CONTROL 3: at least one pill is on the accent, i.e. the selected state exists.
    const onAccent = measured.filter(m => m.bg === "rgb(18, 34, 74)");
    expect(onAccent.length, "no pill is painted with the accent — the selected state is not rendering").toBeGreaterThan(0);

    for (const m of measured) {
      if (!m.opaque) continue;            // see the note on CONTRAST above
      expect(m.ratio, `"${m.label}" reads at ${m.ratio.toFixed(2)}:1 on this skin `
        + `(${m.color} on ${m.bg}) — a hardcoded ink has bypassed --on-accent`).toBeGreaterThanOrEqual(4.5);
    }

    expectNoConsoleErrors(errors);
  });

  test("no live surface paints text in Canopy's near-black on a light skin", async ({ page }) => {
    // The generalisation, scoped to what can be measured safely: any OPAQUE
    // text-on-background pair, on every screen, must clear AA. Alpha-composited pairs
    // are skipped rather than guessed at — that guess is what produced twenty false
    // positives in the scan that found this.
    await seedLightSkin(page);
    await page.evaluate(CONTRAST);

    const SCREENS = ["Dashboard", "Brand Studio", "Members", "Analytics", "Schedule", "Class Builder"];
    for (const screen of SCREENS) {
      await nav(page, screen);
      const result = await page.evaluate(() => {
        const bad = []; let measured = 0;
        const effBg = (el) => {
          let n = el;
          while (n && n !== document.documentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
            n = n.parentElement;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        document.querySelectorAll("body *").forEach((el) => {
          if (el.children.length) return;                     // leaf text only
          const t = (el.textContent || "").trim(); if (!t) return;
          const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.opacity === "0") return;
          const bg = effBg(el);
          if (!window.__opaque(cs.color) || !window.__opaque(bg)) return;   // skip translucent
          measured++;
          const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
          const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
          const ratio = window.__contrast(cs.color, bg);
          if (ratio < need) bad.push(`"${t.slice(0, 34)}" ${ratio.toFixed(2)}:1 (need ${need}) ${cs.color} on ${bg}`);
        });
        return { measured, bad };
      });

      // 🔴 THE CONTROL THAT MATTERS. The first two runs of the scan that found this
      // defect reported "0 violations" from a tab whose innerWidth was 0 — every
      // element measured 0x0 and was skipped, so a scan of nothing was indistinguishable
      // from a clean scan. Assert what was actually measured, per screen, in this run.
      expect(result.measured, `${screen}: only ${result.measured} opaque text nodes measured — `
        + `this screen was not really scanned`).toBeGreaterThan(8);
      expect(result.bad, `${screen} has text below AA on a light skin:\n${result.bad.join("\n")}`).toEqual([]);
    }
  });
});
