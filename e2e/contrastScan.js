// ─── Contrast, with the alpha actually composited ────────────────────────────
//
// `UI-UX-DIRECTION` §1's white-label rule — tokens only, no raw hex — exists so
// a studio's own palette reaches every surface. Nothing enforced it until
// session 28's `brandTokens.spec.js`, and that first pass deliberately measured
// only OPAQUE text-on-background pairs. That is the honest subset and it is a
// small one: every chip, badge and pill in this product is translucent, so the
// first sweep skipped most of what it was pointed at.
//
// 🔴 WHY SKIPPING WAS THE RIGHT FIRST MOVE, AND WHY IT CANNOT BE THE LAST ONE.
// The scan that found the Brand Studio defect reported **21 violations**; twenty
// of them were false. Every one had the same cause: a chip styled
// `rgba(167,139,250,0.14)` was read as SOLID purple, so purple-on-near-white
// scored 1.0:1. A sweep that guesses at alpha is worse than no sweep — it
// produces a list nobody can act on, and the real defect hides in it.
//
// So this composites. Source-over, layer by layer, from the first opaque
// backdrop up through every translucent ancestor to the text's own colour. Where
// every opacity is 1 — which is nearly everywhere — the arithmetic is exact and
// not an approximation.
//
// ── What it deliberately cannot measure, and says so ────────────────────────
//   background-image   A gradient has no single colour behind a glyph. Counted
//                      and reported rather than guessed at; `skipped.gradient`
//                      is part of every result so a screen that is mostly
//                      gradients cannot look like a screen that is mostly clean.
//   stacking           The backdrop is the DOM ANCESTOR chain, which is what
//                      axe-core uses too. Text sitting over a sibling it does
//                      not descend from (a `position:fixed` overlay) is scored
//                      against its own ancestors.
//   group opacity      `opacity` on an ancestor is folded in as an alpha
//                      multiplier on that layer and on the text. That is exact
//                      for a single translucent layer and a close approximation
//                      when they nest.
//
// ⚠️ AND THE TRANSIENT READ, which produced the other false positive in that
// same run: `applySkinCSS` injects `#root *{transition:background-color .35s}`,
// so for a third of a second after any reskin or view change `getComputedStyle`
// returns a colour that is mid-animation and belongs to neither end. One element
// measured white-on-white and was actually white on `--danger`. Every violation
// here is therefore CONFIRMED on a second read taken after the transition has
// had time to land, and only the intersection is reported.

// The page-side half. Injected rather than passed as a function so the same
// definitions are available to the positive control below.
const SCANNER = `(() => {
  // 🔴 NOT EVERY COMPUTED COLOUR IS \`rgb()\`.
  //
  // \`color-mix(in srgb, …)\` — which is how this product makes a decorative hue
  // readable on any skin — computes to \`color(srgb 0.927 0.826 0.609)\`, with
  // channels in 0–1 rather than 0–255. A scanner that scrapes the numbers out
  // and treats them as bytes reads that as \`rgb(1, 1, 1)\`: near-black.
  //
  // That is not a harmless imprecision, it is a scanner that INVENTS failures
  // and hides real ones. Pointed at Canopy it reported eleven violations on the
  // Brand Studio, every one of them a chip that had just been fixed; pointed at
  // a light skin the same misreading scored those chips as near-black on white
  // and passed them. Both wrong, in opposite directions, from one missing
  // branch — and the light run's PASS is the more dangerous of the two.
  const parse = (c) => {
    const s = String(c || "");
    const m = s.match(/[-\\d.]+(?=[\\s,)/])|[-\\d.]+/g);
    if (!m) return null;
    const n = m.map(Number);
    // \`color(srgb r g b [/ a])\` and \`color(display-p3 …)\`: 0–1 channels.
    if (/^color\\(/.test(s)) {
      const [r, g, b] = n.slice(0, 3);
      return { r: r * 255, g: g * 255, b: b * 255, a: n.length > 3 ? n[3] : 1 };
    }
    const [r, g, b] = n.slice(0, 3);
    return { r, g, b, a: n.length > 3 ? n[3] : 1 };
  };
  // Source-over. \`top\` carries the alpha; \`bottom\` is assumed opaque.
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const p = [r, g, b].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  };
  window.__ratio = (fg, bg) => {
    const s = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (s[0] + 0.05) / (s[1] + 0.05);
  };
  window.__rgbStr = (c) => \`rgb(\${Math.round(c.r)}, \${Math.round(c.g)}, \${Math.round(c.b)})\`;

  // The opaque colour a glyph in \`el\` is actually painted onto, and the text
  // colour as it actually lands. Returns \`{ skip }\` when it cannot be known.
  window.__pair = (el) => {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    const styles = chain.map((n) => getComputedStyle(n));

    // Opacity multiplies everything inside it. Suffix products so layer i's
    // effective alpha accounts for every ancestor above it in one lookup.
    const opacityFrom = new Array(chain.length).fill(1);
    for (let i = chain.length - 1; i >= 0; i--) {
      const o = parseFloat(styles[i].opacity);
      opacityFrom[i] = (Number.isFinite(o) ? o : 1) * (i + 1 < chain.length ? opacityFrom[i + 1] : 1);
    }
    if (!(opacityFrom[0] > 0)) return { skip: "opacity" };

    // Walk out to the first layer that is genuinely opaque.
    let baseAt = -1;
    for (let i = 0; i < chain.length; i++) {
      if (styles[i].backgroundImage && styles[i].backgroundImage !== "none") return { skip: "gradient" };
      const c = parse(styles[i].backgroundColor);
      if (c && c.a * opacityFrom[i] >= 0.999) { baseAt = i; break; }
    }
    // Nothing opaque in the chain: the browser canvas is white, and the app
    // paints \`document.body\` from the skin, so this is the true bottom layer.
    let acc = baseAt >= 0 ? parse(styles[baseAt].backgroundColor) : { r: 255, g: 255, b: 255, a: 1 };
    acc = { r: acc.r, g: acc.g, b: acc.b, a: 1 };
    // …then paint every translucent layer back down onto it, outermost first.
    for (let i = (baseAt >= 0 ? baseAt : chain.length) - 1; i >= 0; i--) {
      const c = parse(styles[i].backgroundColor);
      if (!c || c.a === 0) continue;
      acc = over({ ...c, a: Math.min(1, c.a * opacityFrom[i]) }, acc);
    }

    const fgRaw = parse(styles[0].color);
    if (!fgRaw) return { skip: "no-color" };
    const fgA = fgRaw.a * opacityFrom[0];
    if (fgA <= 0.02) return { skip: "invisible-text" };
    return { fg: over({ ...fgRaw, a: Math.min(1, fgA) }, acc), bg: acc };
  };

  // WCAG 1.4.3 exempts "inactive user interface components" from the contrast
  // minimum, and this product uses the convention on purpose: Import is dimmed
  // until a CSV is pasted, Recommend while it is thinking. Reporting those is
  // not a stricter sweep, it is a sweep nobody can act on — the fix would be to
  // stop signalling "you cannot press this yet".
  //
  // ⚠️ The exemption is read from the DISABLED STATE, never from the dimming.
  // A control that merely LOOKS disabled while remaining pressable is a defect
  // and stays in the results.
  const inactive = (el) => !!el.closest("[disabled],[aria-disabled='true']");

  // One pass over everything a person can read on this screen.
  window.__scanContrast = () => {
    const bad = [], skipped = { gradient: 0, tiny: 0, invisible: 0, disabled: 0, other: 0 };
    let measured = 0;
    document.querySelectorAll("body *").forEach((el) => {
      if (el.children.length) return;                       // leaf text only
      const t = (el.textContent || "").trim();
      if (!t) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) { skipped.tiny++; return; }
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") { skipped.invisible++; return; }
      if (inactive(el)) { skipped.disabled++; return; }
      const p = window.__pair(el);
      if (p.skip) { skipped[p.skip === "gradient" ? "gradient" : p.skip === "invisible-text" ? "invisible" : "other"]++; return; }
      measured++;
      const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
      const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
      const ratio = window.__ratio(p.fg, p.bg);
      if (ratio < need) {
        bad.push({
          key: t.slice(0, 40) + "|" + Math.round(r.top) + "," + Math.round(r.left),
          text: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, need,
          fg: window.__rgbStr(p.fg), bg: window.__rgbStr(p.bg),
          size: Math.round(size), tag: el.tagName.toLowerCase(),
        });
      }
    });
    return { measured, skipped, bad };
  };
})()`;

export const installContrast = (page) => page.evaluate(SCANNER);

/**
 * Scan the screen in front of us. Any violation is re-read after the reskin
 * transition has had time to settle and only survivors are returned — see the
 * transient-read note above.
 */
export async function scanContrast(page) {
  await installContrast(page);
  const first = await page.evaluate(() => window.__scanContrast());
  if (!first.bad.length) return first;
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => window.__scanContrast());
  const stillBad = new Set(second.bad.map((b) => b.key));
  return { ...second, bad: second.bad.filter((b) => stillBad.has(b.key) && first.bad.some((f) => f.key === b.key)) };
}

export const reportContrast = (screen, res) =>
  `${screen}: ${res.bad.length} below AA of ${res.measured} measured `
  + `(skipped ${res.skipped.gradient} gradient / ${res.skipped.tiny} tiny / `
  + `${res.skipped.invisible} invisible / ${res.skipped.disabled} disabled)\n`
  + res.bad.map((b) => `  ${b.ratio}:1 (needs ${b.need}) ${b.fg} on ${b.bg} — <${b.tag}> ${b.size}px "${b.text}"`).join("\n");

// 🔴 THE POSITIVE CONTROL, and it has to be a PAIR.
//
// A scan reporting nothing and a scan that ran on nothing are the same
// observation from the assertion's side, and this repo has been fooled by
// exactly that twice — most recently by a tab whose `innerWidth` was 0, where
// every element measured 0×0 and was skipped.
//
// But "the scanner is alive" is not enough here. The specific thing that must be
// proved is that ALPHA IS COMPOSITED, in both directions:
//
//   bad   a translucent pair that composites to a failing ratio is CAUGHT
//         (a scanner that skips translucency reports nothing and looks clean)
//   good  a translucent pair that composites to a passing ratio is NOT caught
//         (a scanner that reads rgba as solid reports it, which is the twenty
//          false positives that made the first sweep unusable)
//
// Planted into the live document, scanned, and removed.
export async function proveCompositingLive(page) {
  await installContrast(page);
  return page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "__contrast_control__";
    // An opaque near-white plate, so both probes composite against something
    // known rather than against whatever the screen happens to be wearing.
    host.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#FFFFFF;padding:8px";
    // BAD: 14%-alpha grey text on white composites to ~#E2E2E2 → about 1.2:1.
    const bad = document.createElement("span");
    bad.textContent = "control-should-fail";
    bad.style.cssText = "display:block;font-size:13px;color:rgba(30,30,30,0.14);background:rgba(0,0,0,0)";
    // GOOD: 14%-alpha green PLATE with fully-readable ink on it. Read as solid
    // green this scores about 1.5:1 and is reported; composited it is ~13:1.
    const good = document.createElement("span");
    good.textContent = "control-should-pass";
    good.style.cssText = "display:block;font-size:13px;color:#111111;background:rgba(123,227,164,0.14)";
    // 🔴 THE COLOUR-SPACE CONTROL, and it is here because the scanner got this
    // wrong and looked right doing it. `color-mix()` — which is how this product
    // makes a decorative hue readable — computes to `color(srgb 0.95 0.95 0.95)`,
    // channels in 0–1. Scraped as bytes that reads `rgb(1, 1, 1)`: near-black,
    // 21:1 on white, silently PASSING. Written as a probe that must be CAUGHT,
    // so the failure mode is a red test rather than a clean report.
    const space = document.createElement("span");
    space.textContent = "control-srgb-space";
    space.style.cssText = "display:block;font-size:13px;color:color(srgb 0.95 0.95 0.95);background:#FFFFFF";
    host.append(bad, good, space);
    document.body.appendChild(host);
    const res = window.__scanContrast();
    host.remove();
    return {
      caughtBad: res.bad.some((b) => b.text.includes("control-should-fail")),
      caughtColorSpace: res.bad.some((b) => b.text.includes("control-srgb-space")),
      falselyCaughtGood: res.bad.filter((b) => b.text.includes("control-should-pass")),
    };
  });
}
