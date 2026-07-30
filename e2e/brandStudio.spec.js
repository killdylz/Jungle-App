import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { PRESET_SKINS } from "../src/lib/skins.js";

// ─── What Brand Studio writes, and whether the app wears it ──────────────────
//
// The last of §4.5's named read-back candidates, and the one nothing had ever
// driven. It had two defects on top of each other, and BOTH are invisible to
// anything short of driving the screen and then reloading:
//
//   1. **Apply to all surfaces applied to none of them.** `applyGenerated`
//      writes the generated tokens to `jungle_custom_skin` and keeps the skin id
//      as `"canopy"` — deliberately, as the BASE. But the App root only honoured
//      overrides when the id was literally `"custom"`, while Brand Studio's own
//      swatches merged them over the base. So the studio saw its identity on the
//      one screen it checks branding on, and Canopy everywhere else.
//
//   2. **Saving custom tokens cost the gym its typography.** The Fine-tune
//      panel set the id to `"custom"`, and `"custom"` is not a skin:
//      `PRESET_SKINS["custom"]` is undefined, so `applySkinCSS` got `{}` for its
//      `meta` and never wrote `--display`, `--body`, `--glow` or `--num`. In the
//      same session the previously-set values were still on `:root`, so it
//      looked fine — and a gym on Atelier lost Instrument Serif the next time
//      they opened the app.
//
// 🔴 Every test below reloads. Without that, defect 2 passes.

const cssVars = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => (cs.getPropertyValue(n) || "").trim();
  return { display: g("--display"), body: g("--body"), accent: g("--accent"),
           bg: g("--bg"), card: g("--card"), glow: g("--glow"), num: g("--num") };
});

const skinId = (page) => page.evaluate(() => localStorage.getItem("jungle_skin"));

// A test that reads a computed style has to wait for the staff app to mount —
// it is a lazy chunk, and before it lands `:root` has none of these.
async function openBrandStudio(page) {
  await freshApp(page);
  await waitForApp(page);
  await nav(page, "Brand Studio");
}

const ACCENT = "#ff00aa";
const setAccent = async (page) => {
  await page.getByLabel(/Primary accent colour/i).fill(ACCENT);
  await page.getByRole("button", { name: "Save custom tokens" }).click();
};

test.describe("a gym's own palette survives leaving the app", () => {
  test("fine-tuned tokens reach every screen, and come back after a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await openBrandStudio(page);

    // POSITIVE CONTROL (§0b#1): the default really is Canopy's green. Without
    // it, "the accent is not #ff00aa" and "nothing rendered" look the same.
    expect((await cssVars(page)).accent).toBe(PRESET_SKINS.canopy.tokens.accent);

    await setAccent(page);

    const saved = await stored(page, "jungle_custom_skin");
    expect(saved, "the coach's edit must be written, not only rendered").toBeTruthy();
    expect(saved.accent).toBe(ACCENT);
    // Every token applySkinCSS reads is stored, not just the one that changed —
    // a partial blob would leave the next reader guessing.
    for (const k of ["bg", "card", "navy", "border", "accent", "green", "text", "muted"]) {
      expect(saved[k], `stored token ${k}`).toBeTruthy();
    }

    await page.reload();
    await waitForApp(page);
    expect((await cssVars(page)).accent, "the gym's colour must survive a reload").toBe(ACCENT);

    // …and it is the whole app, not the screen it was set on.
    await nav(page, "Class Runner");
    expect((await cssVars(page)).accent).toBe(ACCENT);

    expectNoConsoleErrors(errors);
  });

  // 🔴 Defect 2. Reload is the whole test: in-session the fonts were still on
  // `:root` from the previous paint, so this passed against the bug.
  test("nudging one colour does not cost the gym its typography", async ({ page }) => {
    const errors = watchConsole(page);
    await openBrandStudio(page);

    await page.getByText("Atelier", { exact: true }).first().click();
    await waitForApp(page);
    const onAtelier = await cssVars(page);
    // PRECONDITION: the preset took, and it is a preset whose fonts differ from
    // the default. A test for "the fonts survived" against Canopy-on-Canopy
    // would measure nothing.
    expect(onAtelier.display).toContain(PRESET_SKINS.atelier.fonts.display);
    expect(onAtelier.display).not.toContain(PRESET_SKINS.canopy.fonts.display);

    await setAccent(page);
    await page.reload();
    await waitForApp(page);

    const after = await cssVars(page);
    expect(after.accent, "precondition: the colour edit took").toBe(ACCENT);
    expect(after.display, "a colour edit must not take the gym's display font with it")
      .toContain(PRESET_SKINS.atelier.fonts.display);
    expect(after.body).toContain(PRESET_SKINS.atelier.fonts.body);
    // The base skin keeps its id, because the override is a palette on top of a
    // skin — not a fourth skin called "custom", which is not a skin at all.
    expect(await skinId(page)).toBe("atelier");

    expectNoConsoleErrors(errors);
  });

  // Pulse is the only preset carrying behavioural tokens, so it is the only one
  // that can show them being lost.
  test("a custom palette keeps the base skin's glow and numerals", async ({ page }) => {
    await openBrandStudio(page);
    await page.getByText("Pulse", { exact: true }).first().click();
    await waitForApp(page);

    const onPulse = await cssVars(page);
    expect(onPulse.glow, "precondition: Pulse glows").not.toBe("none");
    expect(onPulse.num, "precondition: Pulse uses tabular numerals").toBe("tabular-nums");

    await setAccent(page);
    await page.reload();
    await waitForApp(page);

    const after = await cssVars(page);
    expect(after.num, "the numeral style belongs to the skin, not to the palette").toBe("tabular-nums");
    expect(after.glow, "the accent glow must follow the NEW accent, not vanish").toContain(ACCENT);
  });

  // Picking a preset is how a gym backs out of a custom palette. It has to clear
  // the override or the preset would be invisible under it.
  test("choosing a preset clears the custom palette", async ({ page }) => {
    await openBrandStudio(page);
    await setAccent(page);
    expect(await stored(page, "jungle_custom_skin")).toBeTruthy();

    await page.getByText("Pulse", { exact: true }).first().click();
    await page.reload();
    await waitForApp(page);

    expect(await stored(page, "jungle_custom_skin"),
      "a preset that leaves the override behind would render under it").toBeNull();
    expect(await skinId(page)).toBe("pulse");
    expect((await cssVars(page)).accent).toBe(PRESET_SKINS.pulse.tokens.accent);
  });
});

// ── The logo generator · "Apply to all surfaces" ─────────────────────────────
//
// The wedge of this whole screen — upload your mark, get your identity — and the
// button says what it promises in its own label. It wrote the identity to
// storage, showed it in the panel above, and left every screen on Canopy.
test.describe("Apply to all surfaces applies to all surfaces", () => {
  test("a generated identity reaches the app, and survives a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await openBrandStudio(page);

    // A real PNG the repo already ships, rather than a synthesised one: the
    // extractor reads actual pixels through a canvas, so a fixture with no
    // colours in it would exercise the `img.onerror` path instead.
    await page.locator('input[type="file"]').first().setInputFiles("public/icon-512.png");
    await page.getByRole("button", { name: /Analyse & generate identity/i }).click();
    await expect(page.getByText("GENERATED IDENTITY")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Apply to all surfaces" }).click();
    const generated = await stored(page, "jungle_custom_skin");
    expect(generated, "the generated identity must be stored").toBeTruthy();

    // 🔴 `bg`, not `accent`. The accent derived from Jungle's own icon happens to
    // BE Canopy's green, so an assertion on the accent alone passes against the
    // defect — which is how this went unnoticed. The derived background does not
    // match Canopy's, and that is the discriminator.
    expect(generated.bg,
      "precondition: the generator produced a background of its own")
      .not.toBe(PRESET_SKINS.canopy.tokens.bg);

    await page.reload();
    await waitForApp(page);
    const after = await cssVars(page);
    expect(after.bg, "the gym's generated background must be what the app renders")
      .toBe(generated.bg);
    expect(after.card).toBe(generated.card);

    // It also keeps the logo, which is the other half of "apply".
    expect(String((await stored(page, "jungle_gym_branding"))?.logo || ""))
      .toMatch(/^data:image\//);

    expectNoConsoleErrors(errors);
  });

  // 🔴 The wrinkle the fix above EXPOSED, and the reason it needed its own test.
  //
  // The Fine-tune panel's draft re-synced on `[activeSkinId]` only. "Apply to
  // all surfaces" changes the tokens and NOT the base skin id, so it never
  // fired. That was inert while the app ignored the tokens; the moment the app
  // started wearing them it became destructive — the studio's screen repaints in
  // its new identity while the eight swatches below still show the old one, and
  // a coach who nudges one and presses Save writes the stale draft back over the
  // identity they just generated.
  //
  // No reload here, deliberately: on a fresh mount `useState(currentTokens)`
  // seeds the draft correctly, so reloading is exactly what hides this.
  test("the fine-tune swatches follow a generated identity without a reload", async ({ page }) => {
    await openBrandStudio(page);
    const swatches = () => page.locator('input[type="color"]').evaluateAll(
      els => els.map(e => e.value.toLowerCase()));

    const before = await swatches();
    expect(before.length, "precondition: the fine-tune panel is on screen").toBeGreaterThan(4);

    await page.locator('input[type="file"]').first().setInputFiles("public/icon-512.png");
    await page.getByRole("button", { name: /Analyse & generate identity/i }).click();
    await expect(page.getByText("GENERATED IDENTITY")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Apply to all surfaces" }).click();

    const generated = await stored(page, "jungle_custom_skin");
    await expect.poll(swatches, { message: "the swatches must show the identity now in force" })
      .toContain(generated.bg.toLowerCase());
    expect(await swatches(), "…and not the palette it replaced")
      .not.toContain(PRESET_SKINS.canopy.tokens.bg.toLowerCase());
  });
});
