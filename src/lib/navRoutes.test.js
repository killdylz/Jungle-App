import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { isViewEnabled } from "../config/flags.js";

// ─── Every control that navigates must land on a screen ─────────────────────
//
// `src/config/flags.js` calls itself "the SINGLE choke-point" for which views may
// appear in a nav, because there are four separate nav arrays in App.jsx and
// "hand-editing each one is how a retired screen survives in exactly one menu".
// That reasoning is right and the four arrays do all route through
// `isViewEnabled`. The hole is that a nav array is not the only way to navigate.
//
// The Dashboard's second hero button called `onNavigate("templates")` directly.
// `templates` was retired (folded into the Builder's class-type picker), so it
// was correctly filtered out of all four navs — and no `view==="templates"`
// render branch was ever left behind. Clicking it set the view to a string
// nothing renders: the sidebar and footer stayed, the entire content area went
// empty, and there was no back button. The coach was stranded on a blank screen.
//
// Nothing caught it. `lint:crash` sees a valid string literal. The e2e
// error-boundary sweep passes because no error is thrown — React renders nothing
// at all, which is not a crash. And "the root has children" is satisfied by the
// shell. It is the §6 blind spot in a different costume: a screen that is absent
// rather than undefined.
//
// So this pins the invariant instead of the document: EVERY view a control can
// navigate to has a `view==="…"` branch that renders it. It reads App.jsx the way
// dbConstraints.test.js reads the migrations — comparing two things that must
// agree, rather than restating one of them in a second hard-coded list.
//
// Retiring a screen is still fine. It means removing the controls that point at
// it, or leaving an honest branch behind — which is exactly what `integrations`
// does (`MockDisabledScreen`), and what `templates` did not.

const APP = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

// Comments are prose, not behaviour: the fix for the bug above left a note
// naming `onNavigate("templates")`, and a scanner that cannot tell a comment
// from a call site would report the explanation as the defect.
const SRC = APP
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const VIEW_KEY = /"([a-z][a-z-]*)"/g;

// `{view==="live"&&<LiveScreen…>}` — the screens that actually render.
const rendered = new Set(
  [...SRC.matchAll(/\bview\s*===\s*"([a-z][a-z-]*)"/g)].map(m => m[1])
);

// `setView("builder")`, `onNavigate("calendar")`, and the one ternary form
// `setView(roomTvMode==="studio"?"builder":"live")`. Comparison operands are
// stripped first so `roomTvMode==="studio"` does not read as a navigation to a
// view called "studio".
const navigated = new Set(
  [...SRC.matchAll(/(?:setView|onNavigate)\(([^)]*)\)/g)].flatMap(m =>
    [...m[1].replace(/[!=]==?\s*"[^"]*"/g, "").matchAll(VIEW_KEY)].map(x => x[1])
  )
);

// The four nav arrays reach `onNavigate(it.k)` with a key from a data object:
// `{k:"builder",l:"Class Builder",Icon:Layers}` and
// `{key:"live",label:"Run",Icon:PlayCircle}`. The icon sibling is what makes it a
// nav entry rather than any other `key:`-shaped record — the Brand Studio's
// colour tokens are `{key:"bg",label:"Background"}` and must not be read as a
// menu pointing at a screen called "bg".
const navKeys = new Set(
  [...SRC.matchAll(/[{,]\s*k(?:ey)?\s*:\s*"([a-z][a-z-]*)"[^}]*?\bicon\s*:/gi)].map(m => m[1])
);

// The cold-start checklist navigates to `step.view` from its own module.
const SETUP = fs.readFileSync(new URL("./setupProgress.js", import.meta.url), "utf8");
const setupViews = new Set(
  [...SETUP.matchAll(/\bview:\s*"([a-z][a-z-]*)"/g)].map(m => m[1])
);

describe("navigation targets", () => {
  it("finds the render branches and the call sites (guards the scanner itself)", () => {
    // A scanner that silently matched nothing would make every assertion below
    // vacuously true — the failure mode §0b of the session prompt calls out.
    expect(rendered.size).toBeGreaterThan(8);
    expect(navigated.size).toBeGreaterThan(3);
    expect(navKeys.size).toBeGreaterThan(8);
    expect(rendered).toContain("dashboard");
    expect(navigated).toContain("builder");
    expect(navKeys).toContain("live");
    expect(setupViews.size).toBe(3);
  });

  it("renders every view a literal setView/onNavigate call can reach", () => {
    for (const target of navigated) {
      expect(
        rendered.has(target),
        `App.jsx navigates to "${target}" but has no view==="${target}" branch — ` +
        `that click empties the content area and strands the coach.`
      ).toBe(true);
    }
  });

  it("renders every view an enabled nav entry can reach", () => {
    for (const key of navKeys) {
      if (!isViewEnabled(key)) continue; // retired or flagged off: never shown
      expect(
        rendered.has(key),
        `nav entry "${key}" is enabled by isViewEnabled but App.jsx has no ` +
        `view==="${key}" branch to render it.`
      ).toBe(true);
    }
  });

  it("renders every view the setup checklist points at", () => {
    for (const key of setupViews) {
      expect(
        rendered.has(key),
        `setupProgress.js sends the coach to "${key}", which App.jsx does not render.`
      ).toBe(true);
    }
  });

  it("keeps a retired view unreachable from the navs", () => {
    // The choke-point's own promise. `templates` and `glossary` are folded away;
    // if either is ever given a render branch again it should come back through
    // flags.js, not by a nav array quietly disagreeing with it.
    for (const key of ["templates", "glossary"]) {
      expect(isViewEnabled(key), `${key} is retired in flags.js`).toBe(false);
      expect(
        rendered.has(key),
        `${key} is retired but App.jsx renders it — un-retire it in flags.js instead.`
      ).toBe(false);
    }
  });
});
