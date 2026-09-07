import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hexA,
  wcagContrast, relativeLuminance,
  inkOn, borderOn, hueInk,
  parseCssColor, compositeOver, luminanceRgb, contrastRgb, mixSrgb, DANGER, WARN,
} from "./colors.js";
// The generator moved to its own module in session 29 — it is owner-only, and
// `colors.js` is eager. These tests did not move: what they pin is the same.
import { generateSkinFromPalette, generateThemes, DEFAULT_PROGRAMS,
         nudgeContrast } from "./brandGenerator.js";

// These arrived with decomposition stage 1 (AUDIT-FINDINGS §3.1). The extraction
// itself was mechanical, but it made this module testable in isolation for the
// first time — and the contrast maths is not a utility, it is the product:
// Brand Studio's live AA audit is "compliance turned into a feature" (spec §2 F6),
// and a gym's whole skin is generated through it.
//
// The contrast expectations below are PUBLISHED WCAG reference values, not
// snapshots of what this code currently returns. That distinction is the whole
// point — a snapshot test would happily pin a wrong implementation forever.

describe("WCAG contrast — anchored to published reference values", () => {
  it("black on white is 21:1, the theoretical maximum", () => {
    expect(wcagContrast("#000000", "#ffffff")).toBeCloseTo(21, 4);
  });

  it("a colour against itself is 1:1", () => {
    expect(wcagContrast("#ffffff", "#ffffff")).toBeCloseTo(1, 6);
    expect(wcagContrast("#7BE3A4", "#7BE3A4")).toBeCloseTo(1, 6);
  });

  it("#767676 on white is the canonical AA boundary (4.5)", () => {
    // The greyest grey that still passes AA on white — the value every contrast
    // checker is verified against.
    expect(wcagContrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(wcagContrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("#595959 on white is the canonical AAA boundary (7.0)", () => {
    expect(wcagContrast("#595959", "#ffffff")).toBeCloseTo(7.0, 2);
    expect(wcagContrast("#595959", "#ffffff")).toBeGreaterThanOrEqual(7.0);
  });

  it("is symmetric — order of arguments cannot matter", () => {
    // The formula divides lighter by darker, so a caller passing fg/bg the wrong
    // way round must still get the truth.
    expect(wcagContrast("#123456", "#abcdef")).toBeCloseTo(wcagContrast("#abcdef", "#123456"), 10);
  });
});

describe("colour conversions round-trip", () => {
  it("hex → rgb → hex is lossless", () => {
    for (const hex of ["#7be3a4", "#a78bfa", "#000000", "#ffffff", "#0a0e14"]) {
      expect(rgbToHex(...hexToRgb(hex))).toBe(hex);
    }
  });

  it("hex → hsl → rgb → hex is lossless for the brand palette", () => {
    for (const hex of ["#7be3a4", "#a78bfa", "#f59e0b", "#5bd0c0"]) {
      expect(rgbToHex(...hslToRgb(...rgbToHsl(...hexToRgb(hex))))).toBe(hex);
    }
  });

  it("rgbToHex clamps out-of-range channels instead of emitting bad hex", () => {
    expect(rgbToHex(-40, 300, 128)).toBe("#00ff80");
  });

  it("hexA produces a valid rgba() string", () => {
    expect(hexA("#7be3a4", 0.14)).toBe("rgba(123,227,164,0.14)");
  });
});

describe("nudgeContrast is DIRECTION-AWARE", () => {
  // This is the whole reason it superseded nudgeForContrast, which only ever
  // lightened and so could never fix dark-on-light. A coach on a light skin is
  // the case that broke.
  it("lightens ink on a dark background until it passes", () => {
    const out = nudgeContrast("#333333", "#0a0e14", 4.5);
    expect(wcagContrast(out, "#0a0e14")).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens ink on a light background until it passes", () => {
    const out = nudgeContrast("#cccccc", "#ffffff", 4.5);
    expect(wcagContrast(out, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Specifically: it must have gone DARKER. Lightening here can never succeed,
    // which is exactly the bug the direction-aware version exists to avoid.
    const [, , lIn] = rgbToHsl(...hexToRgb("#cccccc"));
    const [, , lOut] = rgbToHsl(...hexToRgb(out));
    expect(lOut).toBeLessThan(lIn);
  });

  it("leaves a pair that already passes alone", () => {
    const already = "#000000";
    expect(nudgeContrast(already, "#ffffff", 4.5)).toBe(already);
  });
});

describe("generated skins are accessible by construction", () => {
  // A gym uploads a logo and gets a skin. If that skin fails AA, the product has
  // shipped an accessibility problem into a paying studio's room.
  //
  // This asserts the GUARANTEE, not a mechanism, and that is deliberate. Two
  // redundant layers deliver it: the lightness constants in
  // generateSkinFromPalette, and the nudgeContrast clamp beneath them. Mutation
  // testing showed breaking EITHER alone still passes — the clamp repairs bad
  // constants, and good constants make the clamp inert (it never fires today).
  // Breaking both drops contrast to 2.33:1 and fails these tests loudly.
  //
  // Pinning either mechanism instead would be a worse test: it would break on a
  // legitimate refactor while saying nothing about whether a coach can read the
  // screen.
  const AWKWARD = ["#7be3a4", "#ffffff", "#000000", "#f59e0b", "#1a1a1a", "#fefefe"];

  it("clamps body text to AA or better on both polarities", () => {
    for (const seed of AWKWARD) {
      for (const mode of ["dark", "light"]) {
        const skin = generateSkinFromPalette([seed], "natural", mode);
        const c = wcagContrast(skin.tokens.text, skin.tokens.bg);
        expect(c, `${seed} / ${mode} text failed AA at ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("reports its own contrast honestly rather than asserting a pass", () => {
    // `contrast.passesAA` must agree with the measured number — a badge that can
    // disagree with its own metric is worse than no badge.
    for (const seed of AWKWARD) {
      const skin = generateSkinFromPalette([seed], "natural", "dark");
      expect(skin.contrast.passesAA).toBe(skin.contrast.textOnBg >= 4.5);
    }
  });

  it("falls back to a usable accent when handed an empty palette", () => {
    const skin = generateSkinFromPalette([], "natural", "dark");
    expect(skin.tokens.accent).toBe("#7BE3A4");
    expect(wcagContrast(skin.tokens.text, skin.tokens.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("generateThemes — three themes, exactly one recommended", () => {
  it("returns three named themes with a single recommendation", () => {
    const themes = generateThemes(["#7be3a4", "#a78bfa"], 0.2);
    expect(themes).toHaveLength(3);
    expect(themes.map(t => t.name)).toEqual(["Signature", "Charge", "Steel"]);
    expect(themes.filter(t => t.recommended)).toHaveLength(1);
  });

  it("picks light or dark mode from the logo's average luminance", () => {
    expect(generateThemes(["#7be3a4"], 0.9).every(t => t.mode === "light")).toBe(true);
    expect(generateThemes(["#7be3a4"], 0.1).every(t => t.mode === "dark")).toBe(true);
  });

  it("survives a null palette rather than throwing at a gym mid-onboarding", () => {
    for (const bad of [null, undefined, []]) {
      const themes = generateThemes(bad, 0.2);
      expect(themes).toHaveLength(3);
      themes.forEach(t => expect(wcagContrast(t.tokens.text, t.tokens.bg)).toBeGreaterThanOrEqual(4.5));
    }
  });

  it("every theme carries the default programs", () => {
    generateThemes(["#7be3a4"], 0.2).forEach(t => expect(t.programs).toBe(DEFAULT_PROGRAMS));
  });
});

// ── Theme polarity — the assumptions that only break on a light brand ────────
//
// Found by driving Brand Studio → Room TV with a LIGHT hand-built palette, which
// is what a boutique/wellness studio builds. Both derivations below were inline
// luminance thresholds written for a dark theme; every generated skin satisfies
// that assumption, so nothing caught it.
describe("inkOn — which label colour actually reads on a fill", () => {
  const LIGHT = { bg: "#fff7f0", text: "#1a1014" };

  // The measured case. The old rule (`luminance > 0.18 ? bg : text`) chose bg
  // both times, i.e. the LESS readable colour of the two it had.
  it("picks the readable ink on a light brand, where the old threshold inverted", () => {
    expect(inkOn("#ff8ab5", LIGHT.bg, LIGHT.text)).toBe(LIGHT.text);
    expect(wcagContrast(inkOn("#ff8ab5", LIGHT.bg, LIGHT.text), "#ff8ab5")).toBeGreaterThan(8);
    expect(inkOn("#ff2d78", LIGHT.bg, LIGHT.text)).toBe(LIGHT.text);
    // AA for normal text — the old derivation gave 3.36 here.
    expect(wcagContrast(inkOn("#ff2d78", LIGHT.bg, LIGHT.text), "#ff2d78")).toBeGreaterThanOrEqual(4.5);
  });

  it("never returns the worse of the two candidates", () => {
    const surfaces = ["#ff8ab5", "#ff2d78", "#7be3a4", "#0a0f0c", "#ffffff", "#808080"];
    for (const bg of ["#fff7f0", "#0a0f0c"]) {
      for (const text of ["#1a1014", "#e8efe9"]) {
        for (const s of surfaces) {
          const chosen = inkOn(s, bg, text);
          const other = chosen === bg ? text : bg;
          expect(wcagContrast(chosen, s)).toBeGreaterThanOrEqual(wcagContrast(other, s));
        }
      }
    }
  });

  // Non-regression: on a DARK generated skin the new rule must agree with the old
  // one, or every shipped gym's buttons change colour for no reason.
  it("agrees with the old dark-theme rule on every generated skin", () => {
    const old = tk => relativeLuminance(...hexToRgb(tk.accent)) > 0.18 ? tk.bg : tk.text;
    for (const seed of ["#7be3a4", "#ff2d78", "#3b82f6", "#f59e0b", "#8b5cf6", "#ffffff", "#101010"]) {
      for (const vibe of ["natural", "energetic", "bold", "luxury", "calm"]) {
        const { tokens } = generateSkinFromPalette([seed], vibe, "dark");
        expect(inkOn(tokens.accent, tokens.bg, tokens.text)).toBe(old(tokens));
      }
    }
  });
});

describe("borderOn — a hairline that is visible on its own surface", () => {
  it("flips a dark theme's white overlay when the surface is light", () => {
    expect(borderOn("rgba(255,255,255,.07)", "#fff7f0")).toBe("rgba(0,0,0,.07)");
  });

  it("leaves an overlay that already matches its surface alone", () => {
    expect(borderOn("rgba(255,255,255,.07)", "#0a0f0c")).toBe("rgba(255,255,255,.07)");
    expect(borderOn("rgba(0,0,0,.12)", "#fff7f0")).toBe("rgba(0,0,0,.12)");
  });

  it("keeps the alpha the skin chose rather than imposing one", () => {
    expect(borderOn("rgba(255,255,255,0.4)", "#ffffff")).toBe("rgba(0,0,0,0.4)");
  });

  // A deliberate colour is a design decision, not a polarity mistake.
  it("does not touch a border that is not a neutral overlay", () => {
    for (const t of ["#7be3a4", "rgba(123,227,164,.3)", "1px solid red", "", null, undefined]) {
      expect(borderOn(t, "#fff7f0")).toBe(t);
    }
  });

  // Every generated skin already agrees with its own mode, so this must be a
  // no-op there — the fix exists for the hand-edited path.
  it("is a no-op on every generated skin", () => {
    for (const mode of ["light", "dark"]) {
      for (const seed of ["#7be3a4", "#ff2d78", "#3b82f6"]) {
        const { tokens } = generateSkinFromPalette([seed], "natural", mode);
        expect(borderOn(tokens.border, tokens.bg)).toBe(tokens.border);
      }
    }
  });
});

// ─── hueInk: the 60/40 anchor, checked against every hue the product ships ───
//
// `hueInk` is a CSS string, so nothing at runtime can measure it. This is the
// only place the ratio inside it is defended, and it is defended by evaluating
// the mix the browser will perform rather than by pinning the string.
//
// The claim: a hue used as INK on a plate of that same hue at its usual 14%
// tint clears AA on every skin this product can be wearing. If a future edit
// drops the anchor to 50%, the worst pair falls to 3.81:1 and this goes red.
describe("hueInk — a decorative hue made readable on any skin", () => {
  // `color-mix(in srgb, A p%, B)` and `background: rgba(hue, .14)` over a
  // surface, computed the way the compositor will.
  const mix = (a, p, b) => {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(...A.map((v, i) => v * p + B[i] * (1 - p)));
  };
  const over = (top, alpha, bottom) => mix(top, alpha, bottom);

  // Every surface a chip can land on, on every skin a gym can be wearing —
  // including a hand-built LIGHT identity, which is the polarity the presets
  // cannot exercise because all three of them are dark.
  const SKINS = {
    canopy:  { bg: "#0A0F0C", card: "#0F1611", navy: "#141D17", text: "#E8EFE9" },
    pulse:   { bg: "#08090A", card: "#101113", navy: "#17181B", text: "#F4F5F2" },
    atelier: { bg: "#0C0C0E", card: "#131316", navy: "#1A1A1E", text: "#ECEAE6" },
    light:   { bg: "#F4F6F2", card: "#FFFFFF", navy: "#E7ECE6", text: "#12181B" },
  };
  // SCFG's ten stage colours, the three presets' program tints, and the eight
  // archetype accents the Brand Studio recommends. Spelled out rather than
  // imported so a hue added to one of those tables and NOT added here is a
  // visible omission rather than a silently widened claim.
  const HUES = [
    "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#10B981", "#F97316", "#3B82F6",
    "#A78BFA", "#34D399", "#22D3EE", "#FB7185", "#FBBF24", "#38BDF8",
    "#C8A86A", "#D4A5A5", "#9FB4C4", "#FF5A3C", "#D6FF3D", "#F5A623", "#7BE3A4", "#A855F7", "#5BD0C0",
  ];
  const ANCHOR = 0.65;   // the number inside hueInk

  it("clears AA for every shipped hue on every skin and surface", () => {
    let worst = { ratio: Infinity };
    for (const [skinName, skin] of Object.entries(SKINS)) {
      for (const surface of ["bg", "card", "navy"]) {
        for (const hue of HUES) {
          const plate = over(hue, 0.14, skin[surface]);
          const ratio = wcagContrast(mix(skin.text, ANCHOR, hue), plate);
          if (ratio < worst.ratio) worst = { ratio, skinName, surface, hue };
        }
      }
    }
    expect(worst.ratio, `worst pair: ${worst.hue} on ${worst.skinName}/${worst.surface}`)
      .toBeGreaterThanOrEqual(4.5);
  });

  // The degenerate case, and it is reachable: `--green` is a skin token, so a
  // gym can set it to whatever it likes — including its own card colour, which
  // leaves the plate identical to the surface and the tint doing nothing.
  it("clears AA even when the hue IS the surface", () => {
    for (const [skinName, skin] of Object.entries(SKINS)) {
      for (const surface of ["bg", "card", "navy"]) {
        const ratio = wcagContrast(mix(skin.text, ANCHOR, skin[surface]), skin[surface]);
        expect(ratio, `${skinName}/${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // 🔴 The positive control, and it is the reason the anchor is a defensible
  // number rather than a comfortable one. "Every ratio ≥ 4.5" is satisfied just
  // as well by an anchor of 1.0 — plain `--text`, no hue at all — so a test
  // that only checked the floor would keep passing while the feature quietly
  // disappeared into a solid colour. This asserts 65% is at the EDGE: ONE STEP
  // weaker is 60%, which is what this was first written as, and it fails.
  it("fails at a 60% anchor — the ratio is load-bearing, not decorative", () => {
    const ratios = [];
    for (const skin of Object.values(SKINS)) {
      for (const surface of ["bg", "card", "navy"]) {
        for (const hue of HUES) {
          ratios.push(wcagContrast(mix(skin.text, 0.6, hue), over(hue, 0.14, skin[surface])));
        }
      }
    }
    expect(Math.min(...ratios), "a 60% anchor must NOT clear AA, or 65% is arbitrary")
      .toBeLessThan(4.5);
  });

  // And the other edge: enough hue must survive to be SEEN. A mix that is 95%
  // text clears every ratio above and is not a feature.
  //
  // ⚠️ Measured as colour distance, not as contrast, and the difference is not
  // pedantic. Pulse's lime `#D6FF3D` mixed into its near-white `--text` lands at
  // **1.003:1 against that text** — WCAG contrast is a luminance ratio and these
  // two have almost the same luminance — while being an unmistakably different
  // colour. Asserting contrast here would have demanded the hue be made DARKER
  // to prove it was visible, which is the opposite of the point.
  it("keeps the hue visible — the ink is not just --text", () => {
    for (const skin of Object.values(SKINS)) {
      for (const hue of HUES) {
        const a = hexToRgb(mix(skin.text, ANCHOR, hue)), b = hexToRgb(skin.text);
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(dist, `${hue} vanishes into --text`).toBeGreaterThan(20);
      }
    }
  });

  it("emits a color-mix the browser can resolve, with the hue intact", () => {
    expect(hueInk("#F59E0B")).toBe("color-mix(in srgb, var(--text) 65%, #F59E0B)");
    expect(hueInk("var(--green)")).toBe("color-mix(in srgb, var(--text) 65%, var(--green))");
  });
});

// ─── The compositing arithmetic the sweep and the panel now share ────────────
//
// These functions have two readers that cannot see each other: `e2e/contrastScan
// .js` serialises them into a browser, and `lib/brandAudit.js` calls them in the
// app. Before session 29 there were two implementations and the panel's was the
// narrower one — it told owners "Member-visible text meets WCAG AA" about
// palettes the sweep failed in nine places.
describe("compositing — one implementation, two readers", () => {
  // 🔴 THE PROPERTY THE SCANNER DEPENDS ON. `contrastScan.js` injects these into
  // a page as SOURCE TEXT. A reference to any module-scope binding — an import,
  // a constant, another helper in this file — would arrive in the page as a
  // ReferenceError at scan time, and the sweep's own controls would be the only
  // thing standing between that and a silently empty result.
  //
  // `new Function` gives exactly the scope the page gives: globals and nothing
  // else. If this passes, the injection cannot fail for that reason.
  it("survives being evaluated with no module scope at all", () => {
    const src = [parseCssColor, compositeOver, luminanceRgb, contrastRgb, mixSrgb]
      .map((f) => f.toString()).join("\n");
    const isolated = new Function(`${src}
      return {
        ratio: contrastRgb(parseCssColor("#ffffff"), parseCssColor("#000000")),
        chip:  compositeOver({ ...parseCssColor("#7BE3A4"), a: 0.14 }, parseCssColor("#0F1611")),
        mixed: mixSrgb(parseCssColor("#ffffff"), parseCssColor("#000000"), 0.5),
        space: parseCssColor("color(srgb 0.95 0.95 0.95)"),
      };`)();
    expect(isolated.ratio).toBeCloseTo(21, 6);
    expect(isolated.space.r).toBeCloseTo(242.25, 6);
    expect(isolated.mixed.r).toBeCloseTo(127.5, 6);
    expect(isolated.chip.a).toBe(1);
  });

  // The new maths must not disagree with the hex implementation this repo has
  // been shipping — a silent divergence would move every ratio in the product.
  it("agrees with wcagContrast on opaque pairs", () => {
    for (const a of ["#7BE3A4", "#12224A", "#EF4444", "#0A0F0C", "#F4F6F2", "#C8A86A"]) {
      for (const b of ["#0A0F0C", "#FFFFFF", "#12181B", "#D6FF3D"]) {
        expect(contrastRgb(parseCssColor(a), parseCssColor(b)), `${a} on ${b}`)
          .toBeCloseTo(wcagContrast(a, b), 10);
      }
    }
  });

  // 🔴 The colour-space branch, which the scanner got wrong and looked right
  // doing it. `color-mix()` computes to `color(srgb …)` with 0–1 channels;
  // scraped as bytes that reads as near-black and PASSES on white.
  it("reads color(srgb …) as 0–1 channels, not as bytes", () => {
    const c = parseCssColor("color(srgb 0.927 0.826 0.609)");
    expect(c.r).toBeCloseTo(236.385, 3);
    expect(c.g).toBeCloseTo(210.63, 3);
    expect(c.b).toBeCloseTo(155.295, 3);
    // The failure mode in one assertion: bytes would make this near-black.
    expect(luminanceRgb(c)).toBeGreaterThan(0.5);
    expect(parseCssColor("color(srgb 0.1 0.2 0.3 / 0.5)").a).toBe(0.5);
  });

  it("parses every colour form the product can produce", () => {
    expect(parseCssColor("#7BE3A4")).toEqual({ r: 123, g: 227, b: 164, a: 1 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseCssColor("rgba(123,227,164,0.14)").a).toBeCloseTo(0.14, 10);
    expect(parseCssColor("#EF444440").a).toBeCloseTo(0.25098, 4);
    for (const junk of ["none", "", null, undefined, "transparent-ish"]) {
      expect(parseCssColor(junk), String(junk)).toBeNull();
    }
  });

  it("composites source-over, and a fully opaque top wins outright", () => {
    expect(compositeOver({ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }))
      .toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(compositeOver({ r: 255, g: 255, b: 255, a: 0 }, { r: 0, g: 0, b: 0, a: 1 }))
      .toEqual({ r: 0, g: 0, b: 0, a: 1 });
    const half = compositeOver({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
    expect(half.r).toBeCloseTo(127.5, 10);
    // A missing alpha is opaque, not transparent — the safer way round for a
    // scanner reading a computed style that omitted it.
    expect(compositeOver({ r: 9, g: 9, b: 9 }, { r: 0, g: 0, b: 0, a: 1 }).r).toBe(9);
  });

  // `color-mix(in srgb, …)` interpolates GAMMA-ENCODED channels. A linear-light
  // blend would put 50% white/black at 188, not 127.5, and every chip row in the
  // panel would disagree with the browser.
  it("mixes in sRGB the way color-mix does, not in linear light", () => {
    const mid = mixSrgb(parseCssColor("#FFFFFF"), parseCssColor("#000000"), 0.5);
    expect(mid.r).toBeCloseTo(127.5, 10);
    expect(mixSrgb(parseCssColor("#FFFFFF"), parseCssColor("#000000"), 1).r).toBe(255);
    expect(mixSrgb(parseCssColor("#FFFFFF"), parseCssColor("#000000"), 0).r).toBe(0);
  });

  // The two colours that are deliberately not the gym's. Named so Brand Studio's
  // audit and applySkinCSS cannot report on different reds.
  it("names the danger and warning colours once", () => {
    expect(DANGER).toBe("#EF4444");
    expect(WARN).toBe("#F59E0B");
  });
});
