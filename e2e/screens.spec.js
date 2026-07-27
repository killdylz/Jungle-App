import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── Every navigable screen actually renders ──────────────────────────────────
//
// THIS SUITE EXISTS BECAUSE THE CRASH GATE HAS A HOLE, and the hole shipped a
// dead screen past a fully green run.
//
// Decomposition stage 2 moved RosterScreen into its own module and left
// `<ArrowLeft/>`, `<StatCard/>`, `<Btn/>`, `<Check/>` and `<Upload/>` unimported.
// `lint:crash` reported ZERO: eslint's `no-undef` resolves plain identifiers but
// NOT JSX element names, so `const a = Foo` is caught and `<Foo/>` is not.
// Verified directly — a probe file with both forms reports only the first. So
// the Members panel threw `ReferenceError: ArrowLeft is not defined` on open,
// the error boundary swallowed it into a polite "Something broke", and unit
// tests, the crash gate and `vite build` were all happy.
//
// Closing the gate properly needs `eslint-plugin-react` (`react/jsx-no-undef`),
// which is a new dependency and therefore Dylan's call. This suite closes it
// with the tooling already here, and is arguably the better guard anyway: it
// asserts the screen RENDERS, not merely that its identifiers resolve.
//
// The dormant `<SpotifySearchModal/>` this note used to warn about is GONE —
// decomposition stage 3 removed both call sites, and the only occurrences of that
// name and of `<AttendeeView/>` left in App.jsx are inside comments describing
// them. Verified in session 12 by extracting every capitalised JSX element name
// in each source file and checking it resolves to an import or a local
// declaration: zero unresolved across App.jsx and all four screen modules.

const SCREENS = [
  // [ sidebar label, something only that screen renders ]
  ["Dashboard",       /Resume building|New class|Dashboard/i],
  ["Class Builder",   /stages?|Save to file|Open/i],
  ["Coaches",         /coach|persona|class shape/i],
  ["Exercise Library",/librar|movement|exercise/i],
  ["Class Runner",    /Room TV|Check in|Run/i],
  ["Schedule",        /Planning & schedule/i],
  ["Members",         /Your roster and the attendance history behind it/i],
  ["Team",            /Team/i],
  ["Brand Studio",    /Upload your brand|TEMPLATES/i],
];

test.describe("every screen renders", () => {
  for (const [label, marker] of SCREENS) {
    test(`${label} opens without breaking`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await nav(page, label);

      // The error boundary is the specific thing being hunted: it renders a calm
      // message, so a broken screen LOOKS like a working one to any assertion
      // that merely checks the page is not blank. Assert its absence explicitly.
      await expect(
        page.getByText(/Something broke|stopped responding/i),
        `${label} rendered the error boundary — the panel threw`,
      ).toHaveCount(0);

      // And assert the screen's own content, so a silently-empty render fails too.
      await expect(page.getByText(marker).first()).toBeVisible();

      expectNoConsoleErrors(errors);
    });
  }
});

// ── Every control announces itself ───────────────────────────────────────────
//
// An icon-only button with no accessible name is announced as "button" — a
// screen reader user hears the same word for play, skip, rename and delete, and
// a voice-control user has nothing to say to reach it. It is invisible to every
// other test in this suite, because the icon renders perfectly.
//
// `title` is deliberately NOT accepted. It is the last resort in the accessible
// name computation, it never reaches a touch device, and this repo has already
// fixed one button (the Builder's rename, session 11) by replacing exactly that.
// The rule is `aria-label`, so that is what this asserts.
//
// The nine screens are the same list as above, so a screen added to SCREENS is
// swept here too without anyone remembering to.
const unnamedButtons = (page) => page.evaluate(() => {
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
      // Enough markup to FIND it. These buttons are icon-only and inline-styled,
      // so the style block is noise and the svg path is the identity — the
      // failure message has to be actionable without a screenshot.
      icon: (b.querySelector("svg")?.innerHTML || "").slice(0, 70),
      // The nearest surrounding text is what actually identifies the control to
      // a human reading this failure — an icon path does not.
      near: (b.closest("div")?.innerText || "").replace(/\s+/g, " ").slice(0, 70),
      html: b.outerHTML.replace(/style="[^"]*"/, "").slice(0, 120),
    }));
});

test.describe("every control announces itself", () => {
  for (const [label] of SCREENS) {
    test(`${label} has no unnamed buttons`, async ({ page }) => {
      await freshApp(page);
      await nav(page, label);
      const bad = await unnamedButtons(page);
      expect(bad, `${label}: ${bad.length} button(s) with no accessible name:\n` +
        bad.map(b => `  title=${JSON.stringify(b.title)} near=${JSON.stringify(b.near)}\n    icon=${b.icon}`).join("\n")).toEqual([]);
    });
  }
});
