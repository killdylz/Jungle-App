import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hexA,
  wcagContrast, nudgeContrast, relativeLuminance,
  generateSkinFromPalette, generateThemes, DEFAULT_PROGRAMS,
  inkOn, borderOn,
} from "./colors.js";

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
