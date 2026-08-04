import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";
// The three scanners moved to ./a11yScan.js in session 17 so the same rules
// could be pointed at interaction-revealed panels (e2e/revealed.spec.js) rather
// than copied. Their behaviour is unchanged; only their address is.
import { NO_WORDS, unnamedButtons, symbolOnlyButtons, namelessFields,
         reportSymbolOnly, reportUnnamed, reportFields } from "./a11yScan.js";

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
test.describe("every control announces itself", () => {
  for (const [label] of SCREENS) {
    test(`${label} has no unnamed buttons`, async ({ page }) => {
      await freshApp(page);
      await nav(page, label);
      const bad = await unnamedButtons(page);
      expect(bad, reportUnnamed(label, bad)).toEqual([]);
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

// ── Round 3: the FORM controls ───────────────────────────────────────────────
//
// Rounds 1 and 2 swept <button> on all nine screens. Neither looked at a single
// <input>, <select> or <textarea>, and that is where the biggest single cluster
// in this app was hiding: Brand Studio's FINE-TUNE TOKENS panel renders eight
// <input type="color"> swatches whose labels sat beside them, unassociated, so
// every one announced as an identical bare "color" control. Choosing the
// background, the accent and the body text are three very different decisions
// and assistive tech could not tell them apart.
//
// Sixteen nameless controls across three screens, including the Builder's
// Class / Style / Preset dropdowns — whose captions are `!isMobile`, so on a
// phone they were not merely unassociated but absent from the page entirely.
//
// A PLACEHOLDER counts here, deliberately. It is a weaker name than a label —
// it disappears the moment the coach types — but it is exposed as the
// accessible name when nothing else is, so treating it as a failure would fail
// the search boxes, which are honestly named. The rule this enforces is the
// same one round 2 set for buttons: a name must EXIST. The stronger
// "distinguishes" rule is enforced by the colour-swatch assertion below, which
// is where identical names actually cost something.
test.describe("every form field announces itself", () => {
  for (const [label] of SCREENS) {
    test(`${label} has no nameless inputs`, async ({ page }) => {
      await freshApp(page);
      await nav(page, label);
      const bad = await namelessFields(page);
      expect(bad, reportFields(label, bad)).toEqual([]);
    });
  }

  // Existing is only half the rule. Eight controls all called "colour" pass the
  // sweep above and still leave a screen-reader user unable to pick one — the
  // same argument as the six identical "Delete" buttons in the library.
  test("Brand Studio's colour swatches say WHICH token they set", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Brand Studio");

    const swatches = page.locator('input[type="color"]');
    const n = await swatches.count();
    // Scanner sanity: if the panel ever stops rendering, an empty set must not
    // pass this test by default.
    expect(n, "the FINE-TUNE TOKENS panel must render colour swatches").toBeGreaterThan(4);

    const names = await swatches.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.filter(Boolean).length, "every swatch needs a name").toBe(n);
    expect(new Set(names).size,
      `colour swatches must name their token, got: ${names.join(", ")}`).toBe(n);
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
