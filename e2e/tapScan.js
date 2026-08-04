// Tap-target scanner, for the mobile sweep.
//
// The rule this enforces is a product one: a control a trainer uses on a phone,
// mid-class, with one hand, must be hittable without aiming. 44px is the number
// Apple and Google both landed on and it is what the bottom nav already meets.
//
// ── WHY THIS HIT-TESTS INSTEAD OF MEASURING ──────────────────────────────────
//
// The obvious sweep reads `getBoundingClientRect()` and asserts 44×44. It would
// be wrong in both directions here:
//
//   · FALSE FAIL — `data-tap` deliberately leaves the visible box small and lays
//     a 44px transparent overlay over it. The box is 18px and the target is 44px,
//     and a rect measurement cannot tell the difference.
//   · FALSE PASS — and this is the one that matters. An overlay only works if
//     nothing paints on top of it. A sticky header, a neighbouring overlay, or
//     an `overflow:hidden` ancestor can swallow it, and every one of those leaves
//     the rect exactly as it was. The overlay would be measured as present and
//     be dead to a thumb.
//
// So this asks the page the question the thumb asks: at this point, what would I
// hit? `elementFromPoint` walks the real paint order, real stacking contexts and
// real clipping, which is the only thing that can answer it.
//
// Eight compass points on the 44px square rather than the four corners: a
// horizontal neighbour eats E/W while N/S stay clean, and knowing WHICH side was
// stolen is most of the diagnosis.

export const tapScan = (page, minPx = 44) => page.evaluate((MIN) => {
  const out = { scanned: 0, obscured: 0, misses: [] };
  const R = MIN / 2 - 1;                       // 1px in, so we test inside the edge

  const describe = (el) => el
    ? `<${el.tagName.toLowerCase()}${el.getAttribute("data-tap") !== null ? " data-tap" : ""}` +
      `${el.getAttribute("aria-label") ? ` aria-label=${JSON.stringify(el.getAttribute("aria-label"))}` : ""}` +
      `${el.getAttribute("data-testid") ? ` testid=${el.getAttribute("data-testid")}` : ""}>`
    : "(nothing — outside the document)";

  for (const el of document.querySelectorAll("[data-tap]")) {
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    // A control whose own CENTRE is not its own is covered by something — the
    // Exercise Library's full-screen modal sits over the header avatar, and that
    // is the modal being modal, not a tap target being small. Counted separately
    // so the sweep still reports it rather than quietly dropping it.
    const self = document.elementFromPoint(cx, cy);
    if (!self || !(self === el || el.contains(self))) { out.obscured++; continue; }
    out.scanned++;
    const points = [
      ["N", cx, cy - R], ["S", cx, cy + R], ["W", cx - R, cy], ["E", cx + R, cy],
      ["NW", cx - R, cy - R], ["NE", cx + R, cy - R],
      ["SW", cx - R, cy + R], ["SE", cx + R, cy + R],
    ];

    const dead = [];
    for (const [dir, x, y] of points) {
      // Off-screen is not the control's fault — a header scrolled half out of
      // view would otherwise report as an unreachable button.
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) {
        // What DID win the point. Nearly always names the cause outright: a
        // neighbouring [data-tap], or the ancestor that is clipping.
        dead.push({ dir, stolenBy: describe(hit) });
      }
    }

    if (dead.length) {
      out.misses.push({
        name: el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 30) || "(unnamed)",
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        dead,
      });
    }
  }
  return out;
}, minPx);

export const reportTaps = (where, scan, minPx = 44) =>
  `${where}: ${scan.misses.length} of ${scan.scanned} tap targets are smaller than ${minPx}px in practice.\n` +
  scan.misses.map(m =>
    `  ${JSON.stringify(m.name)} (box ${m.box}) — dead at ${m.dead.map(d => `${d.dir} → ${d.stolenBy}`).join(", ")}`
  ).join("\n");
