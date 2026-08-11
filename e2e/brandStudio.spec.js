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
// 🔴 THE GENERATOR IGNORED THE LOGO ENTIRELY, AND THE SUITE COULD NOT SEE IT.
//
// `runAnalysis` walks four `setTimeout` steps and generated the identity at the
// last one from `palette` — state set by the extraction at step 1. `advance` is
// a closure built when `runAnalysis` runs, so it captured `palette` as it was
// then: `null`, because `handleFile` had just cleared it. `setPalette`
// re-rendered and made a new closure; the timer chain already in flight kept
// the old one. Final step read `null`, took the `|| ["#7BE3A4"]` fallback, and
// generated from CANOPY'S MINT — every time, for every logo. `luma` was stale
// the same way, so the LIGHT-skin branch of the generator was unreachable in
// production: a studio with a pale identity could not get one.
//
// ⚠️ WHY THE TEST BELOW LOOKED UNNECESSARY. The test above it uses
// `public/icon-512.png` — Jungle's own icon, which IS Canopy green. Its own
// comment says the accent could not be the discriminator and picks `bg`
// instead; but the broken path derives a background too (`#0b130e`, not
// Canopy's `#0A0F0C`), so that assertion passed against the defect as well.
//
// **A fixture whose colour equals the default cannot prove the colour came from
// the fixture.** This drives two logos that are nothing like Canopy and nothing
// like each other, and asserts the outputs DIFFER — which is the only shape of
// assertion the old fixture could never make.
test.describe("the generated identity comes from the gym's logo", () => {
  // A flat square of one colour, made in the page. The extractor reads real
  // pixels through a canvas, so this exercises the same path a real PNG does.
  const logoOf = (page, hex) => page.evaluate((c) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const x = cv.getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 64, 64);
    return cv.toDataURL("image/png");
  }, hex);

  async function generateFrom(page, hex) {
    await openBrandStudio(page);
    const png = await logoOf(page, hex);
    await page.locator('input[type="file"]').first().setInputFiles(
      { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1], "base64") });
    await page.getByRole("button", { name: /Analyse & generate identity/i }).click();
    await expect(page.getByText("GENERATED IDENTITY")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Apply to all surfaces" }).click();
    return stored(page, "jungle_custom_skin");
  }

  // Hue of a hex, 0-360. Comparing hue rather than the literal value: the
  // generator legitimately adjusts saturation and lightness for contrast, and an
  // assertion on the exact hex would pin the generator's arithmetic instead of
  // the claim that the logo reached it.
  const hueOf = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  };
  const hueGap = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)) % 360; return d > 180 ? 360 - d : d; };

  test("two different logos produce two different identities", async ({ page }) => {
    const CRIMSON = "#B5122C", BLUE = "#1D4ED8";
    const red = await generateFrom(page, CRIMSON);
    const blue = await generateFrom(page, BLUE);

    // The defect in one line: these were byte-identical, and both were green.
    expect(blue.accent, "two unrelated logos produced the same accent — the generator "
      + "is not reading the logo at all").not.toBe(red.accent);
    expect(blue.bg).not.toBe(red.bg);

    // …and each one is its OWN logo's colour, not merely different from the
    // other. Without this, a generator that alternated between two wrong answers
    // would pass the assertions above.
    expect(hueGap(red.accent, CRIMSON), `crimson logo gave ${red.accent}`).toBeLessThan(30);
    expect(hueGap(blue.accent, BLUE), `blue logo gave ${blue.accent}`).toBeLessThan(30);

    // CONTROL: Canopy's mint is what the broken path produced, so neither result
    // may be it. Stated separately because "they differ" would still hold if one
    // of them were the fallback.
    for (const [name, skin] of [["crimson", red], ["blue", blue]]) {
      expect(hueGap(skin.accent, PRESET_SKINS.canopy.tokens.accent),
        `${name} landed on Canopy's mint — the fallback, not the logo`).toBeGreaterThan(30);
    }
  });

  test("a pale logo generates a LIGHT identity, which was unreachable before", async ({ page }) => {
    // `luma` was stale in the same closure, so the generator's `mode === "light"`
    // branch never ran in production however pale the mark was — a boutique
    // studio with a cream identity got a near-black app. All of colors.js's
    // light-polarity work (borderOn, inkOn) was live and unreachable.
    const pale = await generateFrom(page, "#D4A017");
    const bgLum = parseInt(pale.bg.replace("#", ""), 16);
    expect(bgLum, `a pale mark produced ${pale.bg}, which is not a light background`)
      .toBeGreaterThan(0x888888);
    // The border polarity has to follow, or every card edge is invisible.
    expect(pale.border, "a light skin needs a dark hairline").toContain("rgba(0,0,0");
  });
});

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

// ─── The Smart Recommendation panel ──────────────────────────────────────────
//
// §10.3's item: the last surface on this screen with no test at all. Driving it
// found that the panel kept a promise it had no way to keep.
//
// A recommendation is a PALETTE — eight colour tokens out of
// `generateSkinFromPalette`. The note under it used to read "Applied to the
// swatches below (based on the Atelier preset)", and the archetype blurbs above
// it promise things only a SKIN carries: Atelier's "serif display face", Pulse's
// "tabular numerals and accent glow". `applyRecommendation` never touched the
// preset, so a pilates studio was told in the app's own words that it was
// getting a serif display face, pressed Save, reloaded, and had Space Grotesk.
//
// Storage was right the whole time. Only the screen was wrong — which is why
// every test here reloads before believing anything.
test.describe("Smart Recommendation says what it actually does", () => {
  test("a recommendation reaches the swatches and survives a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await openBrandStudio(page);

    // The panel's own copy: "straight into the swatches below". It does NOT
    // repaint the app until saved, and asserting that is what keeps the note
    // honest in the other direction too.
    await page.getByRole("button", { name: /Boxing \/ Combat/ }).click();
    await expect(page.getByLabel(/Primary accent colour/i)).toHaveValue("#ef4444");
    expect((await cssVars(page)).accent, "a recommendation repainted the app before Save")
      .toBe(PRESET_SKINS.canopy.tokens.accent);

    await page.getByRole("button", { name: "Save custom tokens" }).click();
    await page.reload();
    await waitForApp(page);

    // All eight tokens persisted, not just the accent — the recommendation is a
    // whole palette and a partial write would show up as a mismatched surface.
    const saved = await stored(page, "jungle_custom_skin");
    expect(Object.keys(saved).sort()).toEqual(
      ["accent", "bg", "border", "card", "green", "muted", "navy", "text"]);
    const v = await cssVars(page);
    expect(v.accent.toLowerCase()).toBe("#ef4444");
    expect(v.bg.toLowerCase()).toBe(saved.bg.toLowerCase());
    // The base skin is untouched: an override is a palette, never a fourth skin.
    expect(await skinId(page)).not.toBe("custom");

    expectNoConsoleErrors(errors);
  });

  // The two archetypes whose blurbs name a font, a glow and a numeral style —
  // the fields that cannot agree with a palette by chance (§0b#3).
  for (const [chip, preset, promises] of [
    [/Luxury \/ Reformer/, "atelier", "serif display face"],
    [/HYROX \/ Functional/, "pulse", "tabular numerals and accent glow"],
  ]) {
    test(`taking the ${preset} preset delivers what the note promised (${promises})`, async ({ page }) => {
      await openBrandStudio(page);
      await page.getByRole("button", { name: chip }).click();

      // The note must not claim the palette is already "based on" the preset.
      const note = page.locator("text=/The palette is in the swatches below/");
      await expect(note).toContainText(`${PRESET_SKINS[preset].name} preset`);
      await expect(note).toContainText("separate choice");

      const recommended = await page.getByLabel(/Primary accent colour/i).inputValue();
      await page.getByRole("button", { name: /type & finish, keep this palette/ }).click();
      await page.reload();
      await waitForApp(page);

      // The skin's own half arrived…
      const v = await cssVars(page);
      expect(v.display).toContain(PRESET_SKINS[preset].fonts.display);
      if (PRESET_SKINS[preset].accentBehaviour === "glow") expect(v.glow).not.toBe("none");
      if (PRESET_SKINS[preset].numeralStyle === "tabular") expect(v.num).toBe("tabular-nums");

      // …and the recommended palette rode on top of it rather than being
      // replaced by the preset's own — §1c's rule, and §0b#4's trap: the
      // fine-tune re-sync fires on this very change.
      expect(v.accent.toLowerCase()).toBe(recommended.toLowerCase());
      expect(await skinId(page)).toBe(preset);
      await nav(page, "Brand Studio");
      await expect(page.getByLabel(/Primary accent colour/i)).toHaveValue(recommended);
    });
  }

  test("the offer is absent when the gym is already on that preset", async ({ page }) => {
    // Positive control for the assertion above: prove the button can be found at
    // all on this screen, so its absence here means something.
    await openBrandStudio(page);
    await page.getByRole("button", { name: /HYROX \/ Functional/ }).click();
    await expect(page.getByRole("button", { name: /type & finish, keep this palette/ })).toHaveCount(1);

    await page.getByRole("button", { name: /type & finish, keep this palette/ }).click();
    await page.getByRole("button", { name: /HYROX \/ Functional/ }).click();
    await expect(page.getByRole("button", { name: /type & finish, keep this palette/ })).toHaveCount(0);
  });
});
