import { test, expect } from "@playwright/test";

// REGRESSION-PLAN §4, automated layer — the offline claim.
//
// "Survives Wi-Fi loss for a full class" was said before it was true. Runs
// against the PRODUCTION build (see playwright.config.js): the service worker
// registers only in prod, so testing this against the dev server would prove
// nothing while looking green.
//
// Both defects this catches were found by hand and neither is visible by
// reading the worker:
//   1. res.clone() called after the body was read — the asset cache silently
//      stayed empty.
//   2. `Vary: Origin` — precache entries are stored from a request with no
//      Origin header, but the browser fetches @font-face in CORS mode WITH one,
//      so every font missed the cache. Offline the app rendered perfectly IN
//      SYSTEM SANS, which is the kind of half-working nobody can diagnose from a
//      gym floor.

// The worker takes over on the load AFTER it installs, so a first-visit reload
// is required before the page is controlled. Doing this explicitly (rather than
// hoping) is what makes the test deterministic.
async function installWorkerAndWarmCache(page) {
  await page.goto("./");
  await page.evaluate(async () => {
    // Start from no worker and no caches so the test never inherits a previous
    // run's state — a stale cache would make an offline pass meaningless.
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    sessionStorage.setItem("jungle_pin_ok", "1");
  });
  await page.reload();                       // installs
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForFunction(async () => {
    const c = await caches.open("jungle-v1-shell");
    return (await c.keys()).length > 10;     // precache landed, not just the shell
  }, null, { timeout: 15_000 });
}

test.describe("offline — the router dies mid-class", () => {
  test("the app still boots, in the gym's own type", async ({ page, context }) => {
    await installWorkerAndWarmCache(page);

    await context.setOffline(true);
    await page.reload();

    // 1. It renders at all. Before the worker this was the dinosaur.
    await expect(page.locator("#root")).not.toBeEmpty();

    // 2. It renders in the SKIN's fonts, not a fallback. This is the assertion
    //    that would have failed on the Vary bug while everything else passed —
    //    document.fonts.load() rejects with NetworkError when the woff2 is not
    //    in the cache, so a resolved `true` here means the bytes really came
    //    from the precache.
    const fonts = await page.evaluate(async () => {
      const out = {};
      for (const spec of ['400 16px "Hanken Grotesk"', '700 16px "Space Grotesk"']) {
        try { await document.fonts.load(spec); out[spec] = document.fonts.check(spec); }
        catch (e) { out[spec] = `THREW ${e.name}`; }
      }
      return out;
    });
    expect(fonts['400 16px "Hanken Grotesk"'], "body font offline").toBe(true);
    expect(fonts['700 16px "Space Grotesk"'], "display font offline").toBe(true);

    await context.setOffline(false);
  });

  test("a check-in taken while offline is still recorded", async ({ page, context }) => {
    // The actual gym scenario: the class is running, the router drops, and the
    // coach still sweeps the room. Losing those names would be the worst
    // possible failure of the attendance spine — it is the data the retention
    // engine, and therefore the entire owner-facing pitch, is built on.
    await installWorkerAndWarmCache(page);
    await context.setOffline(true);
    await page.reload();

    await page.getByRole("button", { name: "Class Runner", exact: true }).click();
    await page.getByRole("button", { name: /Check in/ }).first().click();

    const name = "Offline Odette";
    await page.getByPlaceholder(/name/i).first().fill(name);
    await page.getByRole("button", { name: new RegExp(`Add .*${name}`) }).click();

    const stored = await page.evaluate(() => ({
      members: JSON.parse(localStorage.getItem("jungle_members") || "[]").map((m) => m.name),
      attendance: JSON.parse(localStorage.getItem("jungle_attendance") || "[]"),
    }));
    expect(stored.members).toContain(name);
    expect(stored.attendance).toHaveLength(1);
    expect(stored.attendance[0].source).toBe("coach");

    await context.setOffline(false);
  });
});
