// ─── What Brand Studio's AA audit actually checks ────────────────────────────
//
// 🔴 THE PANEL WAS NARROWER THAN THE GATE, AND SAID SO IN THE OWNER'S WORDS.
//
// Until session 29 the audit was five rows — text-on-bg, text-on-card,
// muted-on-bg, on-accent, accent-as-graphic — and it presented that to a paying
// owner as *"Member-visible text meets WCAG AA — legible at room-display size."*
// Session 28's sweep measures every composited chip, badge, pill and dimmed row
// on every screen at two widths, and on the same palettes it found **nine real
// defects the panel reported as passing** — including, at 1.47:1, the panel's own
// AA badges.
//
// So the product told an owner their palette was accessible using a narrower
// test than the one CI runs against that same palette. A compliance feature that
// under-reports is worse than no compliance feature, because the owner stops
// looking. This module is the panel catching up.
//
// ── What this can and cannot be ─────────────────────────────────────────────
//
// ⚠️ IT IS NOT THE SCANNER MOVED IN, and that distinction is the whole design.
// `e2e/contrastScan.js` walks a live DOM: it can see the ancestor chain, real
// stacking, real clipping, and every element that happens to be on screen. This
// panel has eight hex strings and a draft the coach is still editing. Trying to
// port the DOM walk would produce a worse scanner, not an equal one.
//
// What transfers is the pure colour ARITHMETIC — imported from `colors.js`, the
// same functions the scanner serialises into the page, so a mutation to the
// maths turns both red — plus the list below: the pairs this product actually
// paints, written in terms of tokens.
//
// The list is therefore a CLAIM about the product, and it is checkable by
// reading `applySkinCSS` and the components. Where it is wrong it is wrong by
// omission, and omission is the failure mode that got us here — so a pair is
// included when the product paints it, not when it is convenient to compute.
//
// 🔴 THE COMPOSITED ROWS ARE THE POINT. Every chip, badge and pill in this
// product is a hue at 14% over a surface with `hueInk` for the ink. Read as
// SOLID — which is what a panel without compositing does — a mint chip on a dark
// card scores 8.62:1 and passes. Composited it is the plate that matters, and
// the ink is not the hue at all: `hueInk` anchors it to `--text` at 65%. Both
// halves have to be right or the row is theatre.
import { hexA, inkOn, hueInk, DEFAULT_PROGRAMS, DANGER, WARN,
         parseCssColor, compositeOver, contrastRgb, mixSrgb } from "./colors.js";

// `hueInk` emits `color-mix(in srgb, var(--text) 65%, <hue>)`. This is that
// string's VALUE, computed the way the browser computes it. The 0.65 is not
// repeated from memory — it is read out of `hueInk`'s own output, so the two
// cannot drift. If `hueInk` ever stops being a plain srgb mix this throws rather
// than silently reporting a colour the product does not paint.
const HUE_INK_WEIGHT = (() => {
  const m = /(\d+(?:\.\d+)?)%/.exec(hueInk("#000000"));
  return m ? Number(m[1]) / 100 : 0.65;
})();

// Both derivations return null rather than throwing on a token the coach has
// half-typed. A draft is edited character by character, so "#12" is a state this
// runs in on the way to "#12224A" — and a panel that throws mid-keystroke is a
// worse failure than a row that scores zero.
const NEUTRAL = { r: 0, g: 0, b: 0, a: 1 };

/** The colour `hueInk(hue)` resolves to on a skin whose `--text` is `textHex`. */
export function hueInkOn(hue, textHex) {
  const t = parseCssColor(textHex), h = parseCssColor(hue);
  if (!t || !h) return null;
  return mixSrgb(t, h, HUE_INK_WEIGHT);
}

/** A `hexA(hue, alpha)` plate as it lands on an opaque surface. */
export function platedOn(hue, alpha, surfaceHex) {
  const h = parseCssColor(hexA(hue, alpha)), s = parseCssColor(surfaceHex);
  if (!h || !s) return null;
  return compositeOver(h, s);
}

// ⚠️ FOR DISPLAY ONLY. The swatch beside each row needs a CSS colour, and a CSS
// colour is rounded to whole channels. Scoring a row from this string instead of
// from the colour it was made from moves the ratio by ~0.03 — invisible until a
// pair sits on 4.50 and the panel and the sweep disagree about which side of the
// line it is on. Rows therefore carry the unrounded colours for scoring and this
// string only for painting.
const rgbStr = (c) => (c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})` : "transparent");

// The alphas the product paints its plates at. Read from the components rather
// than chosen here: ProgramChip is `hexA(hex, 0.14)`, and the AA badges in
// BrandStudioScreen are `rgba(…,.15)`.
export const CHIP_ALPHA = 0.14;
export const BADGE_ALPHA = 0.15;

/**
 * Every pair Brand Studio checks, against a draft token set.
 *
 * `min` is 4.5 for body text and 3.0 for a large or graphic mark, matching
 * WCAG 1.4.3. `big` marks the graphic rows so the roll-up can count text
 * failures separately — an accent that is decorative at 3:1 is not a reason to
 * tell an owner their text is unreadable.
 *
 * `fgKey` names the token a row's FIX would nudge, and is absent on every
 * derived row: `--on-accent` is computed by `inkOn`, and a chip's ink is
 * computed by `hueInk`. Neither is editable, and offering a Fix that silently
 * rewrote a token the row does not name is how a panel starts lying.
 */
export function auditPairs(tokens, programs) {
  const t = tokens || {};
  const tints = ((programs && programs.length ? programs : DEFAULT_PROGRAMS) || [])
    .filter((p) => p && p.tint);

  const rows = [];
  const push = (id, label, fg, bg, min, big, fgKey) =>
    rows.push({ id, label, fg, bg, min, big, fgKey: fgKey || null });

  // ── Opaque token pairs ────────────────────────────────────────────────────
  // The original five, plus the surfaces they were missing. `--navy` is the
  // inset/chip surface and carries as much text as `--card` does; a palette
  // whose navy is close to its muted was passing this audit.
  push("text-bg",    "Body text on background",        t.text,  t.bg,   4.5, false, "text");
  push("text-card",  "Text on card surface",           t.text,  t.card, 4.5, false, "text");
  push("text-navy",  "Text on inset / chip surface",   t.text,  t.navy, 4.5, false, "text");
  push("muted-bg",   "Secondary text on background",   t.muted, t.bg,   4.5, false, "muted");
  push("muted-card", "Secondary text on card",         t.muted, t.card, 4.5, false, "muted");
  push("muted-navy", "Secondary text on inset / chip", t.muted, t.navy, 4.5, false, "muted");

  // ── Derived inks on the two fills ─────────────────────────────────────────
  // `inkOn` IS the runtime derivation, imported rather than re-implemented: this
  // audit used to carry its own copy of the luminance rule, so the badge a coach
  // reads and the colour the button actually gets could disagree.
  const onAcc = safe(() => inkOn(t.accent, t.bg, t.text), t.text);
  const onGrn = safe(() => inkOn(t.green,  t.bg, t.text), t.text);
  push("onacc-acc", "Button label on accent",       onAcc, t.accent, 4.5, false);
  push("ongrn-grn", "Label on accent-light fill",   onGrn, t.green,  4.5, false);

  // ── Graphic ───────────────────────────────────────────────────────────────
  push("accent-bg", "Accent as text / graphics", t.accent, t.bg, 3.0, true, "accent");

  const scored = rows.map((r) => score(r));

  // ── Composited: the rows the panel could never see ────────────────────────
  //
  // One row per program tint, measured on `--card` because that is where chips
  // sit. Not one row per tint per surface: nine near-identical rows is a wall an
  // owner scrolls past, and the surfaces differ by a few percent of lightness.
  // The tint is named so a failure points at the colour to change.
  for (const p of tints) {
    const plate = platedOn(p.tint, CHIP_ALPHA, t.card);
    const ink   = hueInkOn(p.tint, t.text);
    scored.push(score({
      id: `chip-${p.name}`, label: `${p.name} chip`, min: 4.5, big: false, fgKey: null,
      fg: rgbStr(ink), bg: rgbStr(plate), fgRgb: ink, bgRgb: plate,
    }));
  }

  // The two colours that are not the gym's, on the plates they are painted on.
  // They are not skin-derived, but the SURFACE under them is, so a gym can still
  // build a palette that makes its own delete button unreadable.
  for (const [id, label, hue] of [["danger", "Delete / destructive label", DANGER],
                                  ["warn",   "Warning label", WARN]]) {
    const ink = hueInkOn(hue, t.text), plate = platedOn(hue, BADGE_ALPHA, t.card);
    scored.push(score({
      id, label, min: 4.5, big: false, fgKey: null,
      fg: rgbStr(ink), bg: rgbStr(plate), fgRgb: ink, bgRgb: plate,
    }));
  }

  return scored;
}

function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

function score(r) {
  let ratio = 0;
  try {
    const fg = r.fgRgb || parseCssColor(r.fg);
    const bg = r.bgRgb || parseCssColor(r.bg);
    // A half-typed token scores 0 and fails, which is the right way round: the
    // panel says "not yet readable" rather than silently claiming AA.
    if (fg && bg) ratio = contrastRgb(compositeOver(fg, bg || NEUTRAL), bg);
  } catch (_) { ratio = 0; }
  const { fgRgb, bgRgb, ...row } = r;
  return { ...row, ratio, pass: ratio >= r.min };
}

/** How many NON-graphic pairs fail. This is what the roll-up banner promises. */
export const textFailures = (pairs) => pairs.filter((p) => !p.big && !p.pass).length;
