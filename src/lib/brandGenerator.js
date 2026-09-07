// ─── The brand generator: owner-only, and it was in the member's download ────
//
// Split out of `colors.js` in session 29 after §2.6 measured what is actually in
// `index.js`. Nothing here runs for a coach at 6am or for a member opening a
// class link — `extractPalette` reads a logo through a canvas, and the rest turn
// that palette into an identity. All of it is reachable only from Brand Studio,
// which is owner-only and opened rarely, and from ProfileModal's avatar tint.
//
// 🔴 IT WAS EAGER, AND THE COMMENT THAT SAID OTHERWISE WAS WRONG.
// `BrandStudioScreen.jsx`'s header claimed that because the screen "is the ONLY
// caller of colors.js's generator machinery … the chunk takes that with it".
// It did not. `main.jsx` imports one function from `colors.js` — `bootColours`,
// for the pre-hydration splash — and that single eager edge places the WHOLE
// module in the entry chunk. Rollup splits by module, not by export, once a
// module is reachable eagerly: `generateThemes`' theme names were verifiably in
// `index.js` and absent from `BrandStudioScreen.js`.
//
// Measured worth: 2.84 KB minified off the chunk `check-size.mjs` calls "the
// number that matters commercially". That is 1.3% of its budget and it is the
// ONLY app-code lever there is — index.js is 93% React (see check-size.mjs's
// header for the full attribution), so this is the whole of what moving code
// around can buy.
//
// ⚠️ The shared primitives stay in `colors.js` and are imported from there:
// `applySkinCSS`, `inkOn`, `borderOn` and the conversions are NOT owner-only, and
// duplicating them to make this module standalone would put the bytes back.
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, wcagContrast } from "./colors.js";

export const DEFAULT_PROGRAMS = [ { name:"Strength", tint:"#A78BFA" }, { name:"Conditioning", tint:"#F59E0B" }, { name:"Mobility", tint:"#5BD0C0" } ];

// FR-H6/D4: direction-aware contrast nudge (darkens ink on light bg, lightens on dark bg).
export function nudgeContrast(fgHex, bgHex, target=4.5, maxIter=40){
  let [h,s,l]=rgbToHsl(...hexToRgb(fgHex));
  const [,,bgL]=rgbToHsl(...hexToRgb(bgHex));
  const dir = bgL > 0.5 ? -0.03 : 0.03;
  let iter=0;
  while(wcagContrast(rgbToHex(...hslToRgb(h,s,l)),bgHex)<target && iter<maxIter && l>0.02 && l<0.98){
    l=Math.max(0,Math.min(1,l+dir));iter++;
  }
  return rgbToHex(...hslToRgb(h,s,l));
}

// ── Palette extraction from a logo (canvas) ─────────────────────────────────
// The only DOM dependency here is a detached <canvas>; it is kept with the
// colour code because its output feeds generateThemes directly.
export function extractPalette(imgSrc, callback) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const freq = {};
    let lumaSum = 0, lumaCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      lumaSum += (0.299*r + 0.587*g + 0.114*b)/255; lumaCount++;
      if (r>230&&g>230&&b>230) continue; // near-white
      if (r<20&&g<20&&b<20) continue;    // near-black
      const [,s] = rgbToHsl(r,g,b);
      if (s < 0.15) continue;            // near-grey
      const k = `${Math.round(r/16)*16},${Math.round(g/16)*16},${Math.round(b/16)*16}`;
      freq[k] = (freq[k]||0) + 1;
    }
    const total = Object.values(freq).reduce((a,b)=>a+b,0) || 1;
    const swatches = Object.entries(freq)
      .map(([k,cnt]) => {
        const [r,g,b] = k.split(",").map(Number);
        const [,s] = rgbToHsl(r,g,b);
        return { hex:rgbToHex(r,g,b), score: s * (cnt/total) };
      })
      .sort((a,b)=>b.score-a.score)
      .slice(0,6)
      .map(x=>x.hex);
    callback(swatches.length ? swatches : null, lumaCount ? lumaSum/lumaCount : 0.2);
  };
  img.onerror = () => callback(null, 0.2);
  img.src = imgSrc;
}

// Legacy single-colour extractor (kept for existing callers).
export function extractDominantColor(imgSrc, callback) {
  extractPalette(imgSrc, swatches => callback(swatches ? swatches[0] : null));
}

export function generateSkinFromPalette(swatches, vibe="natural", mode="dark") {
  const accent = swatches[0] || "#7BE3A4";
  const [ah,as,al] = rgbToHsl(...hexToRgb(accent));

  // FR-H6: bg/text polarity from the detected mode
  let bg, card, navy, text, muted, green, border;
  if (mode === "light") {
    bg   = rgbToHex(...hslToRgb(ah, Math.min(as*0.25,0.10), 0.97));
    card = rgbToHex(...hslToRgb(ah, Math.min(as*0.30,0.12), 0.93));
    navy = rgbToHex(...hslToRgb(ah, Math.min(as*0.35,0.14), 0.88));
    text = rgbToHex(...hslToRgb(ah, 0.18, 0.14));
    muted= rgbToHex(...hslToRgb(ah, 0.12, 0.40));
    green= rgbToHex(...hslToRgb(ah, Math.max(0,as-0.05), Math.max(0.30, al-0.18)));
    border = "rgba(0,0,0,.12)";
  } else {
    bg   = rgbToHex(...hslToRgb(ah, Math.min(as*0.6,0.25), 0.06));
    card = rgbToHex(...hslToRgb(ah, Math.min(as*0.55,0.22), 0.09));
    navy = rgbToHex(...hslToRgb(ah, Math.min(as*0.5,0.20), 0.12));
    text = rgbToHex(...hslToRgb(ah, 0.08, 0.92));
    muted= rgbToHex(...hslToRgb(ah, 0.05, 0.60));
    green= rgbToHex(...hslToRgb(ah, Math.max(0,as-0.1), Math.min(0.95,al+0.22)));
    border = "rgba(255,255,255,.07)";
  }

  // Accessibility clamp.
  //
  // Measured 2026-07-20: this currently NEVER FIRES for any palette. The base
  // construction above already lands text at 14–16:1 and muted at 4.9–6.8:1 for
  // every seed tried, because the lightness constants (0.92 on a 0.06 bg, 0.14 on
  // a 0.97 bg) are far apart by design. Removing the clamp entirely changes no
  // output.
  //
  // Keep it anyway, and know why: it is the safety net under those constants, not
  // decoration. Proven by mutation — dropping the text lightness to 0.30 sends
  // contrast to 2.33:1, and the clamp silently repairs it to pass. The two are
  // redundant layers, and colors.test.js asserts the GUARANTEE (a generated skin
  // is accessible) rather than either mechanism, so it fails only if both break.
  // That is the correct thing to pin: a gym uploads a logo and must get a usable
  // room, whichever layer delivers it.
  // 🔴 CLAMPED AGAINST EVERY SURFACE, NOT JUST `bg` — session 29.
  //
  // Clamping on `bg` alone is right only if `bg` is the hardest surface to read
  // on, and on a LIGHT identity it is the easiest: `bg` sits at l=0.97 while
  // `card` is 0.93 and `navy` 0.88. So the nudge stopped the moment `muted`
  // cleared 4.5:1 against the lightest thing in the palette and left it below AA
  // on the two darker ones — which is where most secondary text in this product
  // actually sits.
  //
  // Measured across the generator's own output at avgLuma 0.7: nine of the
  // light-mode themes tried landed muted at 4.85–4.98:1 on `bg` and 3.95–4.08:1
  // on `navy`. A gold logo (#D4A017) gave 4.93 / 4.52 / 4.05. Brand Studio's
  // widened audit is what surfaced it; nothing before measured `muted` anywhere
  // but on `bg`.
  //
  // ⚠️ This does NOT bend the gym's brand. `text` and `muted` are DERIVED text
  // colours the generator already clamps — the accent and the hues are untouched,
  // for `--danger`'s reason. Applying the nudge per surface is the same safety
  // net doing what it already claimed to do.
  //
  // Sequential rather than "pick the worst surface once": each call moves the ink
  // away from one surface, which can change which surface is now closest, so
  // taking them in turn converges where a single pass does not. On DARK themes
  // every call after the first is a no-op — `bg` is the hardest surface there —
  // so no dark identity, including the three shipped presets, moves by a byte.
  for (const surface of [bg, card, navy]) {
    text  = nudgeContrast(text,  surface, 7.0);
    muted = nudgeContrast(muted, surface, 4.5);
  }

  // Font pair by vibe
  const fontPairs = {
    energetic: { display:"Anton",             body:"Archivo" },
    luxury:    { display:"Instrument Serif",  body:"Manrope" },
    bold:      { display:"Space Grotesk",     body:"Inter Tight" },
    natural:   { display:"Space Grotesk",     body:"Hanken Grotesk" },
    calm:      { display:"Space Grotesk",     body:"Hanken Grotesk" },
  };
  const fonts = fontPairs[vibe] || fontPairs.natural;

  // Contrast metrics
  const contrast = {
    textOnBg:   wcagContrast(text,   bg),
    mutedOnBg:  wcagContrast(muted,  bg),
    accentOnBg: wcagContrast(accent, bg),
    passesAA:   wcagContrast(text, bg) >= 4.5,
  };

  return {
    name:"Custom — Generated",
    source:"generated",
    vibe,
    mode,
    tokens:{ bg, card, navy, border, accent, green, text, muted },
    fonts,
    contrast,
  };
}

// FR-H1: one palette -> three independently contrast-clamped themes (one recommended).
export function generateThemes(swatches, avgLuma){
  const pal = (swatches && swatches.length) ? swatches : ["#7BE3A4"];
  const mode = (avgLuma != null && avgLuma >= 0.5) ? "light" : "dark";
  const a0 = pal[0];
  const a1 = pal[1] || a0;
  const [h,sat,l] = rgbToHsl(...hexToRgb(a0));
  const steel = rgbToHex(...hslToRgb(h, Math.max(0.08, sat*0.35), Math.min(0.74, l+0.06)));
  const mk = (acc, vibe, name, voice, num, glow) => {
    const sk = generateSkinFromPalette([acc], vibe, mode);
    sk.name = name; sk.mode = mode; sk.voice = voice; sk.numeralStyle = num; sk.accentBehaviour = glow; sk.programs = DEFAULT_PROGRAMS;
    return sk;
  };
  return [
    { ...mk(a0, "natural", "Signature", "credible-community", "proportional", "flat"), recommended:true },
    mk(a1, "energetic", "Charge", "competitive-measurable", "tabular", "glow"),
    mk(steel, "bold", "Steel", "technical-considered", "tabular", "flat"),
  ];
}
