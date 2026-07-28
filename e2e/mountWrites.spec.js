import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The write nobody could see ───────────────────────────────────────────────
//
// Sessions 14, 15 and 16 swept keyboard handlers, dead controls and accessible
// names. All three look at MARKUP. An effect that writes to the store on mount
// renders nothing, announces nothing, and is reachable by no click, so none of
// them could ever have found this one.
//
// Six effects across the app had the shape "initialise from storage, persist on
// change":
//
//   const [gymBranding, setGymBranding] = useState(() => store.getGymBranding());
//   useEffect(() => { store.saveGymBranding(gymBranding); }, [gymBranding]);
//
// Locally that is harmless — the mount pass writes back what it just read.
// Against Supabase it is data loss. `store.connect()` runs during the App root's
// render, so `_synced()` is already true when effects run. On a FRESH DEVICE the
// initialisers return DEFAULTS (skin "canopy", branding {}), and the mount pass
// pushes those defaults to `brand_profiles` for the whole gym — the studio's
// logo, name, colours and skin. `hydrateAll()` fires its SELECT from a sibling
// effect at the same moment, so which one wins is a race.
//
// None of that is observable locally, because the no-Supabase build no-ops every
// push. What IS observable is the other half of the same write: `saveSkinId`
// writes localStorage before it pushes. So "did the mount pass write?" can be
// asked precisely, with no network at all — the key is either there or it is
// not, and on a fresh store it should not be.
//
// The positive controls below are not optional. "Never write anything" would
// satisfy every assertion in the first test and break the app completely, so
// each key is also driven through a real UI change and asserted to appear.

// Keys that a fresh, untouched app must not have written. Each is the local half
// of a background push to brand_profiles or user_prefs.
const UNTOUCHED = [
  ["jungle_skin",         "the gym's chosen skin"],
  ["jungle_gym_branding", "the gym's logo, name and colours"],
  ["jungle_crossfade",    "a user pref"],
  ["jungle_tmpl_tracks",  "a user pref"],
];

test.describe("a fresh load does not persist its own defaults", () => {
  test("no brand or prefs key is written just by opening the app", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    // Give every mount effect a chance to run and be wrong.
    await expect(page.getByText(/GOOD MORNING|Dashboard/i).first()).toBeVisible();

    const written = await page.evaluate((keys) =>
      keys.filter((k) => localStorage.getItem(k) !== null),
      UNTOUCHED.map(([k]) => k));

    expect(written,
      `opening the app wrote ${written.join(", ")} without the coach touching ` +
      `anything. On a synced build that same pass pushes these defaults to ` +
      `Postgres for the whole gym, racing the hydrate that would have read the ` +
      `real values.`).toEqual([]);

    expectNoConsoleErrors(errors);
  });

  // Visiting the screens that OWN these values must not write them either — the
  // per-screen effects (Room TV's display prefs) have the same shape.
  test("visiting Brand Studio and the Room TV boards writes nothing", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Brand Studio");
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);

    const written = await page.evaluate(() =>
      ["jungle_skin", "jungle_gym_branding", "jungle_disp_prefs"]
        .filter((k) => localStorage.getItem(k) !== null));
    expect(written, `merely looking at a screen persisted ${written.join(", ")}`).toEqual([]);
  });
});

// ── Positive controls ────────────────────────────────────────────────────────
// Without these, deleting every save call would turn this file green.
test.describe("but a real change still persists", () => {
  test("picking a skin in Brand Studio writes it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Brand Studio");

    expect(await page.evaluate(() => localStorage.getItem("jungle_skin")),
      "precondition: nothing chosen yet").toBeNull();

    // The preset cards are clickable divs in the TEMPLATES column.
    await page.getByText("Electric · HIIT").click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem("jungle_skin")),
      { message: "choosing a preset skin must persist it" }).toBe("pulse");

    expectNoConsoleErrors(errors);
  });

  test("editing the gym name in the profile modal writes the branding", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Dashboard");
    await page.getByRole("button", { name: "Your profile and settings" }).click();
    await page.getByRole("button", { name: /Gym Branding/ }).click();

    expect(await stored(page, "jungle_gym_branding"),
      "precondition: no branding stored yet").toBeNull();

    await page.getByPlaceholder("e.g. Iron House Fitness").fill("The Garage");
    await page.getByRole("button", { name: /Save Branding/ }).click();

    await expect.poll(() => stored(page, "jungle_gym_branding").then(b => b?.gymName),
      { message: "saving branding must persist it" }).toBe("The Garage");
  });

  test("changing the Room TV display preset writes it", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Coach", exact: true }).click();

    expect(await page.evaluate(() => localStorage.getItem("jungle_disp_prefs")),
      "precondition: prefs untouched by navigation").toBeNull();

    // The board's own settings panel is what owns the preset.
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Display settings" }).first().click();
    await expect(page.getByText(/Layout Preset/i)).toBeVisible();
    // Pick whichever preset is NOT the current one, so this is a real change.
    await page.getByRole("button", { name: /Minimal/i }).first().click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem("jungle_disp_prefs")),
      { message: "changing the display preset must persist it" }).not.toBeNull();
  });
});
