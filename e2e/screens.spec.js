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

// ── …and announces itself with a WORD ────────────────────────────────────────
//
// The sweep above accepts `innerText`, and an emoji IS text. So a button whose
// entire content is "🗑️" passes it while telling a screen reader nothing but
// "wastebasket". The Exercise Library shipped six ✏️/🗑️ pairs in a single set
// — one per movement, one of each pair destructive — and every one of them was
// green under the rule above.
//
// A name with no letter and no digit in it is not a name. That is the whole
// rule, and it is deliberately separate from the sweep above so a failure says
// which of the two problems it is.
const NO_WORDS = /^[^\p{L}\p{N}]*$/u;

const symbolOnlyButtons = (page) => page.evaluate(() => {
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

const reportSymbolOnly = (where, bad) =>
  `${where}: ${bad.length} button(s) named only by symbols — a screen reader gets ` +
  `no word for them:\n` + bad.map(b => `  name=${JSON.stringify(b.name)} near=${JSON.stringify(b.near)}`).join("\n");

test.describe("every control announces itself in words", () => {
  for (const [label] of SCREENS) {
    test(`${label} has no symbol-only buttons`, async ({ page }) => {
      await freshApp(page);
      await nav(page, label);
      expect(NO_WORDS.test("🗑️"), "the symbol-only rule must recognise a bare emoji").toBe(true);
      const bad = await symbolOnlyButtons(page);
      expect(bad, reportSymbolOnly(label, bad)).toEqual([]);
    });
  }
});

// ── Past the top-level screen, into a panel that only exists after a click ────
//
// The two sweeps above only ever see a screen's FIRST render. The Exercise
// Library's per-movement edit and delete controls are mounted by pressing
// "Edit", so no sweep in this repo had ever laid eyes on them — which is
// exactly how twelve symbol-only buttons survived session 12's pass.
test.describe("the Exercise Library's edit mode announces itself", () => {
  test("per-movement controls carry a name, and it says which movement", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Exercise Library");

    // The control is "✏️ Edit" before the click and "✏️ Done" after it, so match
    // on the word rather than the whole label.
    await page.getByRole("button", { name: /Edit/ }).first().click();
    await expect(page.getByRole("button", { name: /Done/ }).first()).toBeVisible();

    expect(await unnamedButtons(page), "edit mode: unnamed buttons").toEqual([]);
    const bad = await symbolOnlyButtons(page);
    expect(bad, reportSymbolOnly("Exercise Library edit mode", bad)).toEqual([]);

    // Naming them is only half of it — six identical "Delete" buttons would pass
    // the rule above and still leave the coach unable to tell them apart.
    const deletes = await page.getByRole("button", { name: /^Delete / }).all();
    expect(deletes.length, "edit mode should expose a delete per movement").toBeGreaterThan(1);
    const names = await Promise.all(deletes.map(d => d.getAttribute("aria-label")));
    expect(new Set(names).size, `delete controls must name their movement, got: ${names.join(", ")}`)
      .toBe(names.length);
  });
});

// ── A control that announces itself and does nothing ─────────────────────────
//
// Both sweeps above ask whether a control has a NAME. Neither can ask whether
// the named control DOES anything — the gap session 15 named, and Brand Studio
// is where it bites hardest.
//
// Its LIVE PREVIEW pane is a picture of the gym's own app, ending in a real
// accent-coloured <button>Start Class</button> over invented sample content
// ("Strength Lab · with Priya · 18:30"). A sighted user reads the frame and
// knows it is a mockup. A keyboard user tabs into it, and a screen reader
// announces "Start Class, button" in exactly the voice it uses for the real
// one on the Dashboard — so the only users who cannot tell it is decoration are
// the ones relying on the a11y tree to tell them.
//
// The fix is `inert` on the pane. This test is here because `inert` is the kind
// of attribute that silently does nothing if it fails to serialise, and an
// invisible no-op is precisely what it is guarding against.
//
// WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. The first draft checked
// `getByRole("button", {name:/Start Class/})` toHaveCount(0) and `tabIndex < 0`.
// Both FAILED against correct code, and probing the live page is what showed
// why: `inert` does not rewrite `tabIndex` (the property still reads 0), and
// Playwright's role engine does not model `inert` either, so a role query still
// matches. What the browser really does — verified in the probe — is REFUSE THE
// FOCUS: `btn.focus()` leaves `document.activeElement` untouched. That refusal
// is the guarantee a keyboard user actually experiences, so that is what is
// asserted here. Asserting the other two would have been asserting something
// false about the platform and calling it a bug in the app.
test.describe("the Brand Studio preview is a picture, not a control panel", () => {
  test("the sample Start Class button renders but cannot be reached", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Brand Studio");

    // Scanner sanity FIRST: a selector that matches nothing would make every
    // assertion below vacuously true. Prove the pane and its sample button are
    // actually on the page before asserting anything about their reachability.
    const pane = page.locator("[inert]");
    await expect(pane, "the preview pane must exist and carry inert").toHaveCount(1);
    await expect(
      pane.getByText("Start Class"),
      "the sample button must still RENDER — it is the preview's content, not a bug",
    ).toHaveCount(1);

    const probe = await page.evaluate(() => {
      const el = [...document.querySelectorAll("button")]
        .find(b => /Start Class/.test(b.textContent || ""));
      if (!el) return { found: false };
      const pane = el.closest("[inert]");
      const before = document.activeElement;
      el.focus();
      return {
        found: true,
        insideInertPane: !!pane,
        // The browser's own view of the subtree. If this is false the attribute
        // reached the DOM as a string but the engine is ignoring it.
        paneIsInert: pane ? pane.inert === true : false,
        // The load-bearing one: focus was requested and refused.
        focusRefused: document.activeElement !== el,
        focusWentTo: (document.activeElement?.textContent || "").trim().slice(0, 30),
        focusUnchanged: document.activeElement === before,
      };
    });

    expect(probe.found, "the sample button must exist for this test to mean anything").toBe(true);
    expect(probe.insideInertPane, "the sample button must sit inside the inert pane").toBe(true);
    expect(probe.paneIsInert, "the browser must actually honour inert on the pane").toBe(true);
    expect(
      probe.focusRefused,
      `the preview's sample button took focus — a keyboard user can reach a control that does nothing (focus landed on "${probe.focusWentTo}")`,
    ).toBe(true);
  });
});
