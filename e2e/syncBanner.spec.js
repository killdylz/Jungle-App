import { test, expect } from "@playwright/test";
import { freshApp, waitForApp, waitForAppAnyWidth, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// The unsynced-data banner, rebuilt in session 25.
//
// It was telling the truth and was still bad UI: it named domains but never the
// reason, offered nothing to press, could not be dismissed, and read the same on
// minute one as on day fourteen. A warning a coach can neither act on nor clear
// stops being read as a warning, and this one guards the only signal that a
// coach's corpus exists on exactly one device.
//
// The local build has no Supabase, so no write can fail here — the ledger is
// seeded directly. That is not a shortcut around the real thing: `syncErrors()`
// reads this exact localStorage key and nothing else, so seeding it puts the
// component in precisely the state a real failure produces.

const KEY = "jungle_sync_errors";

async function seedLedger(page, ledger) {
  await page.evaluate(([k, l]) => localStorage.setItem(k, JSON.stringify(l)), [KEY, ledger]);
  await page.reload();
  await waitForAppAnyWidth(page);
}

// The state the session-25 brief opens on: the four persona tables failing.
const PERSONA_OUTAGE = (agoMs = 2 * 60_000, attempts = 13) => ({
  coach_personas:      { msg: 'relation "public.coach_personas" does not exist', at: Date.now() - agoMs, attempts },
  persona_plans:       { msg: 'relation "public.persona_plans" does not exist',  at: Date.now() - agoMs, attempts },
  persona_movements:   { msg: 'relation "public.persona_movements" does not exist', at: Date.now() - agoMs, attempts },
  persona_generations: { msg: 'relation "public.persona_generations" does not exist', at: Date.now() - agoMs, attempts },
});

test.describe("sync banner — honest, actionable, dismissible", () => {
  test("names the domains, how long it has been failing, and offers a retry", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await waitForApp(page);

    // Positive control: with an empty ledger there must be NO banner. Without
    // this, every assertion below could be passing against a component that
    // renders unconditionally.
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);

    await seedLedger(page, PERSONA_OUTAGE());
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();

    // It still says which data, in the coach's words rather than table names.
    await expect(banner).toContainText("coach personas");
    await expect(banner).toContainText("class plans");
    await expect(banner).toContainText("movement catalog");

    // New: how long, and how many tries. `attempts` counts failures AFTER the
    // first, so 13 in the ledger is 14 actual attempts.
    await expect(page.getByTestId("sync-banner-when")).toContainText("last tried 2 min ago");
    await expect(page.getByTestId("sync-banner-when")).toContainText("14 failed attempts");

    // New: something to press.
    await expect(page.getByTestId("sync-banner-retry")).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("the actual Postgres error is available on demand, not shouted", async ({ page }) => {
    await freshApp(page);
    await waitForApp(page);
    await seedLedger(page, PERSONA_OUTAGE());

    // Closed by default: a coach mid-class does not need this on screen.
    const details = page.getByTestId("sync-banner-details");
    await expect(details).not.toHaveAttribute("open", /.*/);
    await expect(page.getByText(/relation "public\.coach_personas" does not exist/)).toBeHidden();

    await details.getByText("What went wrong").click();
    // Open, and carrying the one string that identifies the cause — this is what
    // makes the banner diagnosable rather than merely alarming.
    await expect(page.getByText(/relation "public\.coach_personas" does not exist/)).toBeVisible();
  });

  test("Try now re-pushes and clears the banner when the write succeeds", async ({ page }) => {
    await freshApp(page);
    await waitForApp(page);
    await seedLedger(page, PERSONA_OUTAGE());
    await expect(page.getByTestId("sync-banner")).toBeVisible();

    // There is no Supabase here, so the retry itself cannot succeed. What is
    // asserted is the wiring either side of it: the button re-reads the ledger
    // after the push, so a ledger that HAS been settled disappears from the UI
    // without a reload. Emptying the key mid-flight stands in for the write
    // landing — the component cannot tell the difference, which is the point.
    await page.getByTestId("sync-banner-retry").click();
    await page.evaluate(k => localStorage.removeItem(k), KEY);
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);
  });

  test("dismiss hides it for the session but a NEW failure brings it back", async ({ page }) => {
    await freshApp(page);
    await waitForApp(page);
    await seedLedger(page, PERSONA_OUTAGE());

    await page.getByTestId("sync-banner-dismiss").click();
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);

    // Survives a reload — dismissal is a statement about this sitting, and a
    // banner that came straight back on the next navigation would be no better
    // than the one that could not be dismissed at all.
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);

    // Still hidden when the SAME failure fails again — the retry rewrites `at`
    // and bumps `attempts` every 30s, and if that resurrected the banner the
    // dismiss button would be a lie.
    await seedLedger(page, PERSONA_OUTAGE(5_000, 40));
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);

    // 🔴 The property that lets dismissal exist at all: a DIFFERENT table now
    // failing is a new problem, and no earlier dismissal may hide it.
    await seedLedger(page, { ...PERSONA_OUTAGE(), members: { msg: "violates row-level security policy", at: Date.now(), attempts: 0 } });
    await expect(page.getByTestId("sync-banner")).toBeVisible();
    await expect(page.getByTestId("sync-banner")).toContainText("members");
  });

  test("the same table failing for a NEW reason also returns", async ({ page }) => {
    await freshApp(page);
    await waitForApp(page);
    await seedLedger(page, { coach_personas: { msg: "relation does not exist", at: Date.now(), attempts: 2 } });
    await page.getByTestId("sync-banner-dismiss").click();
    await expect(page.getByTestId("sync-banner")).toHaveCount(0);

    // Same domain, different cause: the migration landed and it is now RLS. The
    // coach has not read this one.
    await seedLedger(page, { coach_personas: { msg: "violates row-level security policy", at: Date.now(), attempts: 2 } });
    await expect(page.getByTestId("sync-banner")).toBeVisible();
  });

  test("a blip and a fortnight of divergence do not look the same", async ({ page }) => {
    await freshApp(page);
    await waitForApp(page);

    // One failure: calm, and honest that retrying is likely to fix it.
    await seedLedger(page, { coach_personas: { msg: "network", at: Date.now(), attempts: 0 } });
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toHaveAttribute("data-stuck", "0");
    await expect(banner).toContainText("nothing is lost");
    const calm = await banner.evaluate(el => getComputedStyle(el).borderBottomColor);

    // Forty: it has plainly stopped being a connection blip, and the promise
    // that nothing is lost is no longer one we can make — the data is on one
    // device and that device is the only copy.
    await seedLedger(page, { coach_personas: { msg: "network", at: Date.now(), attempts: 39 } });
    await expect(banner).toHaveAttribute("data-stuck", "1");
    await expect(banner).not.toContainText("nothing is lost");
    await expect(banner).toContainText("retried 40 times");
    const alarmed = await banner.evaluate(el => getComputedStyle(el).borderBottomColor);

    // Positive control: both reads returned a real colour, so "they differ" is
    // not two empty strings passing each other.
    expect(calm).toMatch(/^rgb/);
    expect(alarmed).toMatch(/^rgb/);
    expect(alarmed, "the banner must not be the same weight forever").not.toBe(calm);
  });

  test("does not overflow a 390px phone", async ({ page }) => {
    // ⚠️ Viewport BEFORE load. Resizing an already-rendered page measures a
    // stale layout, which produced a wrong finding in a previous audit.
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await waitForAppAnyWidth(page);
    await seedLedger(page, PERSONA_OUTAGE());

    // Positive control first: measuring overflow on a page with no banner would
    // pass for the wrong reason.
    await expect(page.getByTestId("sync-banner")).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow at 390px").toBeLessThanOrEqual(0);
  });
});
