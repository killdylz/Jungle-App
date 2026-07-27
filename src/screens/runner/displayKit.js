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
export function tvFont(basePx, mult = 1) {
  const scaled = basePx * mult;
  const vh = (scaled / DISPLAY_REF_H) * 100;   // vh that equals `scaled`px at 1080p
  const floor = Math.round(scaled * 0.7);       // legible floor on small displays
  const cap = Math.round(scaled * 2.4);         // ~4K reaches ~2×; cap guards freak ratios
  return `clamp(${floor}px, ${vh.toFixed(2)}vh, ${cap}px)`;
}

export const GROUP_PALETTE  = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];
// Stable colour for a group — derived from its id so it never shifts on reorder
export const grpColor = id => GROUP_PALETTE[Math.abs((id||'').split('').reduce((a,c,i)=>a+c.charCodeAt(0)*(i+1),0))%GROUP_PALETTE.length];
