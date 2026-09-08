// The vocabulary the three room-facing display surfaces share: how big type is
// on a TV, whether to animate, and what colour a group is. Kept separate from
// the surfaces themselves because all three read it and none of them owns it.

// ─── Reduced motion ───────────────────────────────────────────────────────────
// Honours the OS "reduce motion" setting on the room-facing displays (Fable §3).
// Read at render, matching FloorLiveScreen's existing guard; callers gate any
// looping scale/opacity animation on !reduce so the colour cue still lands.
export const prefersReducedMotion = () => (typeof window!=="undefined" && window.matchMedia) ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

// ── P2 · the 10-foot rule ─────────────────────────────────────────────────────
// The member-facing Room TV surfaces (Overview / Floor / Coach display) were
// authored with fixed-px type — `Math.round(N*scaleMult)px`. Fixed px does not
// grow with the viewport, so a "160px" timer is a SMALLER fraction of a 4K wall
// than of 1080p: on 4K it is ~half the share of the screen. That means the Fable
// §3 legibility floor — the primary element (current move + timer) holding
// ~8–12% of screen HEIGHT so it reads at 8m — is not enforced anywhere; the
// presets only gesture at it.
//
// `tvFont` fixes that by keying the size to viewport HEIGHT. The reference height
// is 1080, chosen deliberately: at 1080p the vh term equals `basePx` exactly, so
// the tuned look Dylan checks on does not regress, and it grows from there —
// ~2× on 4K — holding the same fraction of the wall. The `clamp` floor keeps it
// legible on a phone-sized display; the cap guards a freak aspect ratio. `mult`
// carries the coach's S/M/L/XL font-scale preference straight through.
export const DISPLAY_REF_H = 1080;

// The coach's S/M/L/XL font-size preference, and it lived in DisplayScreen.jsx —
// which is exactly why only DisplayScreen honoured it. The other two boards would
// have had to import a sibling SCREEN to read a constant, so they read nothing,
// called `tvFont` with no `mult`, and a coach who set XL got XL on one of the
// three surfaces the setting exists for. It belongs in the module whose own
// header calls itself "the vocabulary the three room-facing surfaces share".
export const FONT_SCALES = [
  { id:"s",  label:"S",  mult:0.75 },
  { id:"m",  label:"M",  mult:1    },
  { id:"l",  label:"L",  mult:1.4  },
  { id:"xl", label:"XL", mult:1.85 },
];
export const scaleMultOf = (fontScale) => FONT_SCALES.find(f => f.id === fontScale)?.mult || 1;
// 🔴 THE FLOOR IS ABSOLUTE, NOT PROPORTIONAL, and that is a fix rather than a
// preference. It was `scaled * 0.7`, described as "a legible floor on small
// displays" — but a floor expressed as a FRACTION of the thing it is protecting
// cannot protect the small end of the scale. It shrinks it by exactly the same
// 30%.
//
// Measured on the Room TV at **1280×720** — a projector, or a laptop on an HDMI
// cable, which is what a boutique studio actually plugs in — every room-facing
// size lands on that floor, because 0.93vh of 720px is less than 10px. The Plan
// board's exercise names are `tvFont(13)`: on a 1080p panel they are 13px, and on
// the 720p wall in the room they render at **9px**. The surface
// `UI-UX-DIRECTION` §1 says must be flawless, read at 8 metres, at nine pixels.
//
// `TV_MIN_PX` is the type scale's own smallest step (§1: 11 = meta). The
// proportional floor is kept as well, so a 160px timer still scales down
// sensibly — this only ever raises, never lowers, and `Math.max` is the whole
// change.
//
// 🔴 WHAT THIS FLOOR IS, AND WHAT IT IS NOT. It used to say here that "text on a
// wall never goes below it, whatever the display", which reads as a legibility
// guarantee and is not one. A px is a SIGNAL pixel: its size in the room depends
// on the panel, so no px number can carry a claim about reading distance. What
// 11px actually buys, measured on the boards at HEAD:
//
//     720p wall   11px = 1.53% of screen height
//    1080p wall   11px = 1.02%
//       4K wall   11px = 0.51%   (for anything NOT on `tvFont`)
//
// The Fable spec states the requirement in the only unit that can carry it
// (`Stress-Test Verdict & Architecture Spec` §3, P2): "legible at 8 meters …
// primary element ~8-12% of screen height, SECONDARY ~3%". So this floor is
// under half the spec's secondary minimum, and it is not even a constant
// fraction — which produces an inversion worth stating plainly:
//
// 🔴 THE SAME BOARD IS SMALLER IN THE ROOM ON THE BETTER PROJECTOR. At 720p the
// Plan board's exercise names are floored up to 11px = 1.53% of the wall; at
// 1080p they render at their designed 13px = 1.20%. A studio that upgrades its
// projector gets less readable exercise names on the same wall. That is what an
// ABSOLUTE floor does at the bottom of a scale keyed to viewport height, and it
// is the argument for putting room-facing text on `tvFont` rather than on a
// literal — see `display.spec.js`'s "holds its share of the wall" sweep.
//
// The floor is still worth having for the case it is actually good at: a board
// mirrored onto something physically small, where a fraction of viewport height
// is a few pixels. It is a collapse guard, not a distance guarantee. Raising it
// to the spec's 3% is a real proposal with a real cost — measured, it truncates
// the Coach board's stage-journey strip — and it is written up in
// SESSION-38-HANDOFF.md rather than taken here.
export const TV_MIN_PX = 11;
export function tvFont(basePx, mult = 1) {
  const scaled = basePx * mult;
  const vh = (scaled / DISPLAY_REF_H) * 100;   // vh that equals `scaled`px at 1080p
  const floor = Math.max(TV_MIN_PX, Math.round(scaled * 0.7));
  const cap = Math.round(scaled * 2.4);         // ~4K reaches ~2×; cap guards freak ratios
  // ⚠️ A clamp whose floor exceeds its cap is INVALID and the browser drops the
  // whole declaration — which is how a legibility floor becomes no size at all.
  // Reachable: `tvFont(9, 0.75)` gives floor 11 and cap 16, fine, but a smaller
  // base would not. The cap is lifted to meet the floor rather than the floor
  // lowered, because the floor is the claim.
  return `clamp(${floor}px, ${vh.toFixed(2)}vh, ${Math.max(floor, cap)}px)`;
}

export const GROUP_PALETTE  = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];
// Stable colour for a group — derived from its id so it never shifts on reorder
export const grpColor = id => GROUP_PALETTE[Math.abs((id||'').split('').reduce((a,c,i)=>a+c.charCodeAt(0)*(i+1),0))%GROUP_PALETTE.length];
