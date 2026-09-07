import { describe, it, expect } from "vitest";
import { tvFont, TV_MIN_PX, DISPLAY_REF_H, scaleMultOf, FONT_SCALES } from "./displayKit.js";

// The 10-foot rule, as arithmetic. `tvFont` is a CSS string, so nothing at
// runtime can measure it — this is the only place its claims are defended.

// clamp(FLOORpx, Nvh, CAPpx) -> the three numbers
const parse = (s) => {
  const m = s.match(/clamp\((-?[\d.]+)px,\s*(-?[\d.]+)vh,\s*(-?[\d.]+)px\)/);
  expect(m, `not a clamp: ${s}`).toBeTruthy();
  return { floor: Number(m[1]), vh: Number(m[2]), cap: Number(m[3]) };
};
// What the browser will actually render at a given viewport height.
const at = (s, viewportH) => {
  const { floor, vh, cap } = parse(s);
  return Math.min(cap, Math.max(floor, (vh / 100) * viewportH));
};

describe("tvFont — type on a wall", () => {
  // The reference contract, unchanged and worth pinning: at 1080p the vh term
  // equals basePx exactly, so the look Dylan tuned on does not move.
  it("is exactly basePx at the reference height", () => {
    for (const base of [11, 13, 24, 64, 160]) {
      expect(at(tvFont(base), DISPLAY_REF_H)).toBeCloseTo(base, 0);
    }
  });

  it("grows with the wall — that is the whole point of it", () => {
    const s = tvFont(64);
    expect(at(s, 2160)).toBeGreaterThan(at(s, 1080));
    expect(at(s, 1080)).toBeGreaterThan(at(s, 720));
  });

  // 🔴 THE FIX. The floor was `scaled * 0.7` — a fraction of the thing it was
  // protecting, which cannot protect the small end of the scale at all. On a
  // 1280x720 display (a projector, or a laptop on HDMI) the Plan board's
  // `tvFont(13)` exercise names rendered at 9px, on the surface UI-UX-DIRECTION
  // §1 says must be flawless, read at 8 metres.
  it("never renders room-facing text below the legibility floor, on any display", () => {
    for (const h of [480, 600, 720, 768, 900, 1080, 1440, 2160]) {
      for (const base of [9, 10, 11, 12, 13, 14, 17, 20, 24]) {
        for (const { mult } of FONT_SCALES) {
          const px = at(tvFont(base, mult), h);
          expect(px, `tvFont(${base}, ${mult}) at ${h}px tall rendered ${px}px`)
            .toBeGreaterThanOrEqual(TV_MIN_PX);
        }
      }
    }
  });

  // The positive control: without it the test above is satisfied by a tvFont
  // that returns a constant, and the whole feature could vanish silently.
  it("CONTROL: the OLD proportional floor really did fall below it", () => {
    const oldFloor = (base, mult) => Math.round(base * mult * 0.7);
    expect(oldFloor(13, 1), "the 1280x720 case this fixes").toBeLessThan(TV_MIN_PX);
    // …and the fix must not have flattened the scale: a bigger base is still
    // bigger at every height.
    for (const h of [720, 1080, 2160]) {
      expect(at(tvFont(24), h)).toBeGreaterThan(at(tvFont(13), h));
    }
  });

  // ⚠️ A clamp whose floor exceeds its cap is INVALID CSS and the browser drops
  // the declaration — a legibility floor turning into no size at all. Reachable
  // once the floor stopped being proportional.
  it("never emits a clamp with the floor above the cap", () => {
    for (const base of [1, 4, 5, 9, 10, 160]) {
      for (const { mult } of FONT_SCALES) {
        const { floor, cap } = parse(tvFont(base, mult));
        expect(cap, `tvFont(${base}, ${mult}) is invalid CSS`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("carries the coach's font-scale through, and falls back to 1", () => {
    expect(scaleMultOf("xl")).toBe(1.85);
    expect(scaleMultOf("m")).toBe(1);
    expect(scaleMultOf(undefined)).toBe(1);
    expect(scaleMultOf("nonsense")).toBe(1);
    expect(at(tvFont(64, 1.85), 1080)).toBeGreaterThan(at(tvFont(64, 1), 1080));
  });
});
