import { test, expect } from "@playwright/test";
import { nav, navAnyWidth, ALL_SCREENS, waitForApp, waitForAppAnyWidth, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { scanContrast, reportContrast, proveCompositingLive } from "./contrastScan.js";

// ─── The white-label promise, enforced ───────────────────────────────────────
//
// The USP is "your brand on the studio's own screens", and `UI-UX-DIRECTION` §1's rule
// for delivering it — tokens only, no raw hex in components — had nothing enforcing it
// across 44 spec files.
//
// The defect this pins: `--on-accent` is contrast-computed by `inkOn()`, which asks
// which of bg/text reads better against the accent. Four sites in the Brand Studio
// hardcoded Canopy's near-black `#0A0F0C` instead, so on any skin whose correct ink is
// LIGHT they rendered near-black on a dark accent. Measured on a navy accent, where the
// token resolves to #F4F6F2, the selected vibe pill was **1.25:1** — invisible, on the
// screen `PRODUCT-DIRECTION` §3 says the product is demoed from.
//
// ⚠️ WHY A DARK-ACCENT / LIGHT-BACKGROUND SKIN. Every shipped preset is dark, and on a
// dark preset `#0A0F0C` happens to be very close to the correct answer — so the bug is
// invisible on all three. `colors.js` documents this polarity trap in its own header:
// derivations that assume a dark theme are right until a boutique studio hand-builds a
// light identity, which is exactly what the palette editor is for.
const LIGHT_SKIN = {
  bg: "#F4F6F2", card: "#FFFFFF", navy: "#E7ECE6", border: "rgba(0,0,0,.12)",
  accent: "#12224A",           // dark navy: its correct ink is LIGHT, so a hardcoded
  green: "#1E6B4A",            // near-black fails here and nowhere else
  text: "#12181B", muted: "#5A6B60",
};

// The gym the sweep is run against. An EMPTY screen passes every scan trivially
// — this repo has been bitten by that twice in one session, in two different
// files — so every screen the sweep visits has to have something on it. Members,
// Schedule and the Dashboard are all empty on a fresh install; these rows are
// what put chips, pills, badges and a class list in front of the scanner.
const GYM = {
  classes: [
    { id: "uc1", name: "Sunrise Strength", type: "strength", coach: "Mara", day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
    { id: "uc2", name: "Engine Room", type: "hiit", coach: "Dev", day: "Wed", slot: "19:00", dur: "45m", repeat: "weekly" },
  ],
  members: [
    { id: "m-1", name: "Sarah Chen", email: "sarah@example.com", status: "active", joinedAt: "2026-05-02", externalRef: "" },
    { id: "m-2", name: "Ravi Menon", email: "ravi@example.com", status: "active", joinedAt: "2026-06-11", externalRef: "" },
    { id: "m-3", name: "Jo Tan", email: "jo@example.com", status: "paused", joinedAt: "2026-03-20", externalRef: "" },
  ],
};

async function seedSkin(page, { custom = null, preset = null, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("./");
  await page.evaluate(({ skin, presetId, gym }) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    if (skin) localStorage.setItem("jungle_custom_skin", JSON.stringify(skin));
    // ⚠️ `jungle_skin` holds a BARE STRING, not JSON.
    if (presetId) localStorage.setItem("jungle_skin", presetId);
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "Navy Barbell Co" }));
    localStorage.setItem("jungle_user_classes", JSON.stringify(gym.classes));
    localStorage.setItem("jungle_members", JSON.stringify(gym.members));
    const day = 86_400_000;
    const instances = [], rows = [];
    for (let i = 1; i <= 6; i++) {
      const cid = `ci-${i}`;
      instances.push({ id: cid, startsAt: new Date(Date.now() - i * 3 * day).toISOString(),
        name: i % 2 ? "Sunrise Strength" : "Engine Room", classType: i % 2 ? "strength" : "hiit",
        coachName: i % 2 ? "Mara" : "Dev", durationMin: 45 });
      gym.members.forEach((m, j) => {
        if ((i + j) % 3 === 0) return;
        rows.push({ id: `a-${i}-${j}`, classInstanceId: cid, memberId: m.id, source: "coach",
          checkedInAt: new Date(Date.now() - i * 3 * day).toISOString() });
      });
    }
    localStorage.setItem("jungle_class_instances", JSON.stringify(instances));
    localStorage.setItem("jungle_attendance", JSON.stringify(rows));
    // 🔴 A CLASS IN THE BUILDER, so the Room TV has something on it.
    // Without this the board renders its empty state and the scan measures
    // chrome — a sweep of nothing that reads exactly like a clean sweep. Proved
    // the hard way: with no stages, reverting the plan rail's `hueInk` left this
    // spec GREEN. Four DIFFERENT stage types, because the defect is a per-stage
    // hue and one type would exercise one colour.
    localStorage.setItem("jungle_draft_class", JSON.stringify({
      name: "Sunrise Strength", classChoice: null,
      stages: [
        { id:"s1", type:"warmup",   name:"Warm-Up",         dur:300, exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""}], tracks:[] },
        { id:"s2", type:"strength", name:"Strength Block",  dur:900, exercises:[{n:"Back Squat",s:"4",r:"8",rest:"90s"}], tracks:[] },
        { id:"s3", type:"circuit",  name:"Circuit Blast",   dur:600, exercises:[{n:"Burpee Complex",s:"3",r:"10",rest:"30s"}], tracks:[] },
        { id:"s4", type:"recovery", name:"Active Recovery", dur:300, exercises:[{n:"Easy Walk",s:"",r:"5 min",rest:""}], tracks:[] },
      ],
    }));
  }, { skin: custom, presetId: preset, gym: GYM });
  await page.reload();
  if (width >= 900) await waitForApp(page); else await waitForAppAnyWidth(page);
}

const seedLightSkin = (page) => seedSkin(page, { custom: LIGHT_SKIN });

// WCAG relative luminance and contrast ratio.
//
// ⚠️ This deliberately handles OPAQUE colours only, and every element it is pointed at
// is checked to be opaque first. A general sweep must composite alpha — a chip styled
// `rgba(167,139,250,0.14)` read as SOLID purple produced twenty false positives in the
// scan that found this defect, and only one of the twenty-one was real.
const CONTRAST = `(() => {
  const lum = (c) => {
    const p = c.match(/[\\d.]+/g).map(Number).slice(0, 3).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  };
  window.__opaque = (c) => /^rgb\\(/.test(c);
  window.__contrast = (a, b) => {
    const s = [lum(a), lum(b)].sort((x, y) => y - x);
    return (s[0] + 0.05) / (s[1] + 0.05);
  };
})()`;

test.describe("brand tokens carry the gym's palette, not Canopy's", () => {
  test("the accent token's INK is computed, never hardcoded", async ({ page }) => {
    const errors = watchConsole(page);
    await seedLightSkin(page);
    await nav(page, "Brand Studio");
    await page.evaluate(CONTRAST);

    // CONTROL 1: the skin really is applied, and `--on-accent` really did resolve to
    // the light ink. Without this the assertion below could pass on a screen still
    // wearing Canopy, where `#0A0F0C` is nearly correct.
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { accent: cs.getPropertyValue("--accent").trim(), onAccent: cs.getPropertyValue("--on-accent").trim() };
    });
    expect(tokens.accent.toLowerCase()).toBe("#12224a");
    expect(tokens.onAccent.toLowerCase(), "inkOn must pick the LIGHT ink for a dark accent").toBe("#f4f6f2");

    // The vibe pills: exactly one is selected and painted with var(--accent).
    const pills = page.getByRole("button", { name: /^(Natural|Bold|Luxury|Clinical|Electric|Vibrant|Warm|Cool|Minimal)/ });
    // CONTROL 2: there are pills to measure. An empty locator makes every
    // per-element assertion below vacuously true.
    expect(await pills.count(), "no brand-vibe pills found — this test measures nothing").toBeGreaterThan(1);

    const measured = await pills.evaluateAll((els) => els.map((el) => {
      const cs = getComputedStyle(el);
      return { label: el.textContent.trim().slice(0, 20), color: cs.color, bg: cs.backgroundColor,
               opaque: window.__opaque(cs.color) && window.__opaque(cs.backgroundColor),
               ratio: window.__contrast(cs.color, cs.backgroundColor) };
    }));

    // CONTROL 3: at least one pill is on the accent, i.e. the selected state exists.
    const onAccent = measured.filter(m => m.bg === "rgb(18, 34, 74)");
    expect(onAccent.length, "no pill is painted with the accent — the selected state is not rendering").toBeGreaterThan(0);

    for (const m of measured) {
      if (!m.opaque) continue;            // see the note on CONTRAST above
      expect(m.ratio, `"${m.label}" reads at ${m.ratio.toFixed(2)}:1 on this skin `
        + `(${m.color} on ${m.bg}) — a hardcoded ink has bypassed --on-accent`).toBeGreaterThanOrEqual(4.5);
    }

    expectNoConsoleErrors(errors);
  });

  // ── The sweep ───────────────────────────────────────────────────────────────
  //
  // Every readable leaf on every screen, at both widths, on a dark preset and on
  // a hand-built light skin — with the alpha COMPOSITED rather than skipped. The
  // first version of this test measured opaque pairs only, which is most of the
  // app's text and almost none of its chips, badges and pills. `contrastScan.js`
  // carries the arithmetic and the reasons it is not a guess.
  //
  // ⚠️ THE LIBRARY IS VISITED LAST, always: "Exercise Library" opens a MODAL that
  // covers the sidebar and traps focus, so nothing can be navigated to after it.
  const SWEEP_SCREENS = [
    ...ALL_SCREENS.filter((s) => s.key !== "library"),
    ALL_SCREENS.find((s) => s.key === "library"),
  ];

  // Why these two skins and not one. Every shipped preset is DARK, and on a dark
  // preset most of this product's palette accidents are invisible — a hardcoded
  // near-black ink is nearly right, a hardcoded near-white text is nearly right.
  // The light custom skin is where a hand-built boutique identity actually lives
  // and where those accidents show. Canopy is carried alongside it so a fix that
  // only works on light skins fails here rather than in a studio.
  const SKINS = [
    { name: "a hand-built light skin", seed: { custom: LIGHT_SKIN } },
    { name: "the Canopy preset",       seed: { preset: "canopy" } },
  ];

  for (const skin of SKINS) {
    for (const width of [1280, 390]) {
      // ⚠️ A FRESH LOAD at the stated width, never a resize: resizing without
      // reloading shows a stale render, and this repo has produced a wrong
      // finding that way before.
      test(`every readable surface clears AA on ${skin.name} at ${width}px`, async ({ page }) => {
        test.setTimeout(90_000);
        await seedSkin(page, { ...skin.seed, width });

        // 🔴 The control, run on the real document before anything is asserted:
        // a translucent pair that composites to a FAILING ratio must be caught,
        // and one that composites to a PASSING ratio must not be. The first half
        // proves the scanner is alive and compositing; the second proves it is
        // not simply flagging every rgba it sees, which is what made the earlier
        // sweep report twenty-one violations of which one was real.
        const control = await proveCompositingLive(page);
        expect(control.caughtBad, "the scanner did not catch a planted 1.2:1 translucent pair — "
          + "it is not compositing alpha, so a clean result here means nothing").toBe(true);
        expect(control.falselyCaughtGood, "the scanner reported a planted translucent pair that "
          + "composites to ~13:1 — it is reading rgba as solid").toEqual([]);
        expect(control.caughtColorSpace, "the scanner missed a planted `color(srgb …)` value — "
          + "it is reading 0–1 channels as 0–255, which is exactly how it scored every "
          + "`color-mix()` ink in this product as near-black").toBe(true);

        const failures = [];
        // 🔴 THE ROOM TV FIRST, because it is the surface that matters most and
        // the one every sweep in this suite was blind to. `UI-UX-DIRECTION` §1:
        // "the Room TV and the member link are the two surfaces a member ever
        // sees. They must be flawless before any staff screen gets polish." It is
        // a fullscreen overlay off the Class Runner, not a nav destination, so it
        // is not in `ALL_SCREENS` and no screen sweep has ever visited it —
        // which is how the plan rail came to paint raw stage hues as ink there.
        // Found by DRIVING the demo (§2.3). A sweep over the nav is a sweep over
        // the staff app.
        await navAnyWidth(page, ALL_SCREENS.find(s => s.key === "live"));
        const tv = page.getByRole("button", { name: /^Room TV$/ });
        expect(await tv.count(), "no Room TV button — the most important surface "
          + "in the product is not being scanned").toBe(1);
        await tv.first().click();
        await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
        // 🔴 THE BOARD MUST HAVE A CLASS ON IT. An empty Room TV passes this scan
        // trivially — proved, not assumed: with no seeded stages, reverting the
        // plan rail's `hueInk` left this spec GREEN. The rail is where the
        // per-stage hues are, so if it is not on screen nothing here is measured.
        await expect(page.getByText("Strength Block · 15m"),
          "the Room TV is showing no class — this scan measures chrome").toBeVisible();
        const tvRes = await scanContrast(page);
        expect(tvRes.measured, `Room TV at ${width}px: only ${tvRes.measured} text nodes measured`)
          .toBeGreaterThan(8);
        if (tvRes.bad.length) failures.push(reportContrast("Room TV", tvRes));
        await page.keyboard.press("Escape");

        for (const screen of SWEEP_SCREENS) {
          await navAnyWidth(page, screen);
          const res = await scanContrast(page);
          // The per-screen count of what was actually measured, in the same run.
          // A scan of nothing and a clean scan are the same observation from the
          // assertion's side; two earlier runs of this sweep reported "0
          // violations" from a tab whose innerWidth was 0.
          expect(res.measured, `${screen.side} at ${width}px: only ${res.measured} text nodes `
            + `measured — this screen was not really scanned`).toBeGreaterThan(8);
          if (res.bad.length) failures.push(reportContrast(screen.side, res));
        }
        expect(failures, `below AA on ${skin.name} at ${width}px:\n\n${failures.join("\n\n")}`).toEqual([]);
      });
    }
  }
});
