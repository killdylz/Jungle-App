// ─── Colour + skin generation (AUDIT-FINDINGS §3.1, decomposition stage 1) ───
// Lifted out of App.jsx unchanged. Stage 1 is "shared helpers first" because it
// is the only stage where nothing can break behaviourally: these are pure
// functions plus two well-defined side effects (a canvas read, a `:root` write),
// and the one real risk — a missed import — is exactly what `lint:crash` sees.
//
// The point of the stage is the stale-build failure mode, not tidiness: a
// 8,700-line App.jsx is what makes a franken-build both likely and expensive.
//
// BEHAVIOUR IS PRESERVED EXACTLY, including one wart worth naming rather than
// quietly fixing: `hexToRgb` always returns an array (an invalid hex yields
// `[NaN,NaN,NaN]`, never `null`), so the `c ? … : hex` guards in `hexA` and
// `applySkinCSS` are vestigial and never fire. Fixing that changes behaviour on
// malformed input and belongs in its own commit with its own test.

// ── Conversions ─────────────────────────────────────────────────────────────
export function hexToRgb(hex) {
  const h = hex.replace("#","");
  const n = parseInt(h,16);
  return [n>>16&255,(n>>8)&255,n&255];
}
export function rgbToHex(r,g,b) {
  return "#"+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}
// RGB → HSL (0-360, 0-1, 0-1)
export function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min)return[0,0,l];
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min);
  let h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
  return[h*60,s,l];
}
export function hslToRgb(h,s,l){
  h/=360;
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const hue=(t)=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return[Math.round(hue(h+1/3)*255),Math.round(hue(h)*255),Math.round(hue(h-1/3)*255)];
}
export function hexA(hex, a){ const c=hexToRgb(hex); return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : hex; }

// ── WCAG contrast ───────────────────────────────────────────────────────────
// This is the machinery behind Brand Studio's live AA audit — compliance turned
// into a feature (spec §2 F6), so it is load-bearing product, not a utility.
export function relativeLuminance(r,g,b){
  const sRGB=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});
  return 0.2126*sRGB[0]+0.7152*sRGB[1]+0.0722*sRGB[2];
}
export function wcagContrast(hex1,hex2){
  const l1=relativeLuminance(...hexToRgb(hex1));
  const l2=relativeLuminance(...hexToRgb(hex2));
  const lighter=Math.max(l1,l2),darker=Math.min(l1,l2);
  return(lighter+0.05)/(darker+0.05);
}

// `nudgeForContrast` lived here unreferenced from decomposition stage 1 until
// session 18, when Dylan answered the yes/no it had been waiting on since
// session 7. It only ever LIGHTENED, so it could not fix dark ink on a light
// background — `nudgeContrast` below superseded it by being direction-aware.
// git history has it if the one-directional behaviour is ever wanted back.

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

// ── Skin generation ─────────────────────────────────────────────────────────
// FR-H7: default program sub-tints (decorative only).
export const DEFAULT_PROGRAMS = [ { name:"Strength", tint:"#A78BFA" }, { name:"Conditioning", tint:"#F59E0B" }, { name:"Mobility", tint:"#5BD0C0" } ];

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
  text  = nudgeContrast(text,  bg, 7.0);
  muted = nudgeContrast(muted, bg, 4.5);

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

// FR-H8 (sub-brands) was implemented here as `resolveSubBrand` and never wired to
// any surface. Removed in session 18 on Dylan's call. A sub-brand was a child
// theme overriding accent + numeralStyle + voice and inheriting the rest — a
// dozen lines to re-derive from git history if a chain ever needs it, and the
// shape would likely change anyway once a real second brand exists to model it on.

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

// ── Theme-polarity derivations (FR-H6) ──────────────────────────────────────
//
// Both of these existed inline and both assumed a DARK theme. Every skin the
// generator produces satisfies that assumption, so the bug was invisible — until
// a coach hand-builds a LIGHT identity in the Brand Studio's palette editor,
// which is exactly what a boutique/wellness studio does. The editor starts from
// the active skin's tokens and only exposes bg/card/navy/accent/green/text/muted,
// so the dark-theme assumptions came along unchanged.
//
// Measured on a light custom skin (bg #fff7f0, text #1a1014):
//   --on-green on green #ff8ab5 → 2.07:1, where the other candidate gave 8.47:1
//   --on-accent on accent #ff2d78 → 3.36:1, where the other gave 5.23:1
// i.e. the derivation was choosing the LESS readable of the two colours it had.

/**
 * Which ink reads on a surface: the background or the text colour.
 *
 * The old rule was `luminance(surface) > 0.18 ? bg : text` — right whenever `bg`
 * is the dark one, and inverted when it is not. Asking which candidate actually
 * contrasts more is theme-agnostic and cannot invert. On every shipped preset it
 * returns the same answer the old rule did, because there `bg` genuinely is dark.
 */
export function inkOn(surfaceHex, bgHex, textHex) {
  const vsBg = wcagContrast(bgHex, surfaceHex);
  const vsText = wcagContrast(textHex, surfaceHex);
  // Ties go to `text`: it is the colour the rest of the UI already reads in.
  return vsBg > vsText ? bgHex : textHex;
}

/**
 * A hairline border token whose polarity matches the surface it sits on.
 *
 * The generator gets this right per mode (`rgba(0,0,0,.12)` light,
 * `rgba(255,255,255,.07)` dark). A hand-edited palette does not: it inherits
 * whichever the previously active skin had, so a light identity kept a white 7%
 * overlay on a near-white background — invisible, on every card edge, input
 * outline, divider and grid line in the product, with no way for the coach to
 * fix it because `border` is not an editable token.
 *
 * Only pure black/white overlays are touched — those are the only form the
 * generator emits and the only form that can be polarity-wrong. Anything else is
 * a deliberate colour and is returned untouched. The alpha the skin chose is
 * always preserved.
 */
export function borderOn(borderToken, bgHex) {
  const m = String(borderToken || "").match(/^rgba\(\s*(0|255)\s*,\s*(0|255)\s*,\s*(0|255)\s*,\s*([\d.]+)\s*\)$/);
  if (!m) return borderToken;
  const [, r, g, b, a] = m;
  if (!(r === g && g === b)) return borderToken;      // not a neutral overlay
  const rgb = hexToRgb(bgHex);
  if (!rgb) return borderToken;
  const surfaceIsLight = relativeLuminance(...rgb) > 0.5;
  const want = surfaceIsLight ? "0,0,0" : "255,255,255";
  return `rgba(${want},${a})`;
}

// ── Applying a skin to the document ─────────────────────────────────────────
// Writes CSS custom properties onto :root. The one genuinely stateful function
// in this module; kept here because every token it writes is computed above.
export function applySkinCSS(tokens, meta={}) {
  const r = document.documentElement.style;
  r.setProperty("--bg",     tokens.bg);
  r.setProperty("--card",   tokens.card);
  r.setProperty("--navy",   tokens.navy);
  // Polarity-aware, so a hand-built light palette does not keep a dark theme's
  // invisible hairline. See borderOn.
  r.setProperty("--border", borderOn(tokens.border, tokens.bg));
  r.setProperty("--accent", tokens.accent);
  r.setProperty("--green",  tokens.green);
  r.setProperty("--text",   tokens.text);
  r.setProperty("--muted",  tokens.muted);
  // Label colour on the accent and green fills: whichever of bg/text actually
  // reads on them. See inkOn — this was a luminance threshold that assumed bg
  // was the dark one, and picked the less readable colour on a light skin.
  r.setProperty("--on-accent", inkOn(tokens.accent, tokens.bg, tokens.text));
  r.setProperty("--on-green",  inkOn(tokens.green,  tokens.bg, tokens.text));
  // Alpha variant shortcuts for CSS-only colour transitions
  r.setProperty("--accent-10", tokens.accent + "1A");
  r.setProperty("--accent-20", tokens.accent + "33");
  r.setProperty("--accent-30", tokens.accent + "4D");
  r.setProperty("--accent-40", tokens.accent + "66");
  r.setProperty("--green-20",  tokens.green  + "33");
  r.setProperty("--green-40",  tokens.green  + "66");
  // FR-H4/H5: behavioural tokens -> CSS vars
  const glow = meta.accentBehaviour === "glow";
  r.setProperty("--glow", glow ? `0 0 22px ${tokens.accent}66` : "none");
  const num = meta.numeralStyle || "proportional";
  r.setProperty("--num", (num==="tabular"||num==="mono") ? "tabular-nums" : "normal");
  r.setProperty("--num-font", num==="mono" ? "'Space Mono',ui-monospace,monospace" : "inherit");
  // FR-A5: font tokens (display -> headings, body -> shell)
  if (meta.fonts) {
    r.setProperty("--display", `'${meta.fonts.display}', sans-serif`);
    r.setProperty("--body", `'${meta.fonts.body}', sans-serif`);
    document.body.style.fontFamily = `'${meta.fonts.body}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  }
  // FR-A4: smooth reskin transition (inject once)
  if (!document.getElementById("jungle-reskin-tx")) {
    const _tx = document.createElement("style"); _tx.id = "jungle-reskin-tx";
    _tx.textContent = "#root *{transition:background-color .35s ease,color .35s ease,border-color .35s ease,fill .35s ease;}";
    document.head.appendChild(_tx);
  }
  // Body background keeps in sync with skin
  document.body.style.background = tokens.bg;
}
