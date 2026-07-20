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
// A dormant instance of the same bug already exists in App.jsx:
// `<SpotifySearchModal/>` is used at :4353 and :5018 and defined nowhere. It
// never throws only because both call sites sit behind `FLAGS.music`, which is
// false — precisely how `<AttendeeView/>` hid until session 5 found it. Left
// alone here because music is explicitly out of scope, but it is real.

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
