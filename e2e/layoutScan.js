// Layout scanners, shared by the responsive sweep.
//
// Written for REGRESSION §1.1, whose point is that the suite is thick with tests
// for individual defects and thin on rules that catch the NEXT one. Two rules
// here, and they are separate because a failure should say which problem it is:
//
//   1. The PAGE must not scroll sideways. Asserted at the document, not per
//      element: an element wider than the viewport is fine inside a container
//      built to scroll (a wide table, a chip row), and flagging those would make
//      the sweep noisy enough to be turned off. The per-element list is a
//      DIAGNOSTIC that names the likely culprit when the document check fails.
//
//   2. No text may be silently cut off. `overflow: hidden` with no
//      `text-overflow: ellipsis` gives a coach a word ending mid-letter with no
//      indication anything is missing — an ellipsis is a deliberate truncation
//      and is not reported.
//
// Both return a `scanned` count. A scan that matched nothing and a scan that
// found nothing look identical from the assertion's side, and this repo has been
// fooled by exactly that, so the count travels with the result and the spec
// asserts on it.

export const layoutScan = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute("data-testid") || "",
    cls: (typeof el.className === "string" ? el.className : "").slice(0, 40),
    text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
  });

  const out = {
    vw,
    // The load-bearing number: how far the whole document can be scrolled right.
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scanned: 0,
    spill: [],
    clipped: [],
  };

  for (const el of document.querySelectorAll("body *")) {
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.scanned++;

    if (r.right > vw + 1) out.spill.push({ ...describe(el), right: Math.round(r.right) });

    // Leaf text nodes only: an element with element children reports its
    // children's scroll extent, and a cropped image has no text to lose.
    //
    // ⚠️ ...and never a 1px box. The visually-hidden live-region pattern
    // (1×1, overflow:hidden, clip-rect) is text that is DELIBERATELY not
    // rendered — it exists to be spoken, not read — so it clips by design and
    // trips this rule every time. The Class Runner's stage announcement failed
    // all three widths on the day it was added. An ellipsis on it would silence
    // the sweep and mean nothing, since nobody ever sees the truncation; the
    // honest fix is that this rule is about text a HUMAN READS, and a 1px box
    // is not that.
    const srOnly = r.width <= 1 || r.height <= 1;
    if (!srOnly && el.children.length === 0 && (el.innerText || "").trim()) {
      const cs = getComputedStyle(el);
      const hides = cs.overflowX === "hidden" || cs.overflow === "hidden";
      if (hides && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1) {
        out.clipped.push({ ...describe(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
  }
  return out;
});

export const reportOverflow = (where, scan) =>
  `${where}: the page scrolls sideways by ${scan.pageOverflow}px at ${scan.vw}px wide.\n` +
  (scan.spill.length
    ? `Elements past the right edge:\n` +
      scan.spill.slice(0, 8).map(s =>
        `  <${s.tag}${s.testid ? ` data-testid="${s.testid}"` : ""}> right=${s.right} text=${JSON.stringify(s.text)}`
      ).join("\n")
    : "  (no single element is past the edge — suspect a margin, a gap, or a fixed width on a container)");

export const reportClipped = (where, scan) =>
  `${where}: ${scan.clipped.length} element(s) cut text off with no ellipsis at ${scan.vw}px:\n` +
  scan.clipped.map(c =>
    `  <${c.tag}> ${c.scrollW}px of text in ${c.clientW}px — ${JSON.stringify(c.text)}`
  ).join("\n");
