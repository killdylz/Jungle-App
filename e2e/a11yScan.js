// The three accessible-name scanners, shared.
//
// They were written inline in `screens.spec.js` across sessions 12, 14 and 16,
// where they sweep the nine top-level screens. They live here now because the
// gap those sweeps CANNOT see is the interaction-revealed panel — a modal, an
// edit mode, a tab inside a modal — and the honest fix is for one set of rules
// to be pointed at both, rather than a second, drifting copy.
//
// The rules, and why each is separate:
//   1. unnamedButtons  — a control with NO accessible name is announced as
//      "button". `title` is deliberately not accepted: it is last-resort in the
//      name computation and never reaches a touch device.
//   2. symbolOnlyButtons — "🗑️" IS text, so it passes rule 1 while telling a
//      screen reader nothing but "wastebasket". A name with no letter and no
//      digit is not a name.
//   3. namelessFields  — <input>/<select>/<textarea>. A placeholder counts: it
//      is a weaker name than a label, but it IS exposed as the accessible name
//      when nothing else is, so failing it would fail the honest search boxes.

export const NO_WORDS = /^[^\p{L}\p{N}]*$/u;

export const unnamedButtons = (page) => page.evaluate(() => {
  const named = (el) => {
    if (el.getAttribute("aria-label")?.trim()) return true;
    const by = el.getAttribute("aria-labelledby");
    if (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) return true;
    // `innerText` respects text-transform and hidden content, which is what a
    // screen reader gets; `textContent` would count a visually-hidden node.
    return !!(el.innerText || "").trim();
  };
  return [...document.querySelectorAll("button")]
    .filter(b => b.offsetParent !== null)            // rendered, not display:none
    .filter(b => !named(b))
    .map(b => ({
      title: b.getAttribute("title") || "",
      testid: b.getAttribute("data-testid") || "",
      icon: (b.querySelector("svg")?.innerHTML || "").slice(0, 70),
      near: (b.closest("div")?.innerText || "").replace(/\s+/g, " ").slice(0, 70),
      html: b.outerHTML.replace(/style="[^"]*"/, "").slice(0, 120),
    }));
});

export const symbolOnlyButtons = (page) => page.evaluate(() => {
  const noWords = /^[^\p{L}\p{N}]*$/u;
  const nameOf = (el) => {
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    return (el.innerText || "").trim();
  };
  return [...document.querySelectorAll("button")]
    .filter(b => b.offsetParent !== null)
    .map(b => ({
      name: nameOf(b),
      near: (b.closest("div")?.innerText || "").replace(/\s+/g, " ").slice(0, 70),
    }))
    .filter(x => x.name && noWords.test(x.name));
});

export const namelessFields = (page) => page.evaluate(() => {
  const accName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = document.getElementById(lb);
      if (t?.textContent?.trim()) return t.textContent.trim();
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l?.textContent?.trim()) return l.textContent.trim();
    }
    const wrap = el.closest("label");
    if (wrap?.textContent?.trim()) return wrap.textContent.trim();
    if (el.getAttribute("placeholder")?.trim()) return el.getAttribute("placeholder").trim();
    if (el.getAttribute("title")?.trim()) return el.getAttribute("title").trim();
    return null;
  };
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => el.type !== "hidden" && !accName(el))
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      near: (el.closest("div")?.innerText || "").replace(/\s+/g, " ").slice(0, 60),
      html: el.outerHTML.replace(/style="[^"]*"/, "").slice(0, 110),
    }));
});

export const reportSymbolOnly = (where, bad) =>
  `${where}: ${bad.length} button(s) named only by symbols — a screen reader gets ` +
  `no word for them:\n` + bad.map(b => `  name=${JSON.stringify(b.name)} near=${JSON.stringify(b.near)}`).join("\n");

export const reportUnnamed = (where, bad) =>
  `${where}: ${bad.length} button(s) with no accessible name:\n` +
  bad.map(b => `  title=${JSON.stringify(b.title)} near=${JSON.stringify(b.near)}\n    icon=${b.icon}`).join("\n");

export const reportFields = (where, bad) =>
  `${where}: ${bad.length} form field(s) with no accessible name:\n` +
  bad.map((b) => `  <${b.tag} ${b.type}> near "${b.near}"\n    ${b.html}`).join("\n");
