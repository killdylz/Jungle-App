import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── REGRESSION §1.5 — the Builder's draft, mutated then reloaded ─────────────
//
// This file exists to settle a claim, and to stop it being made again.
//
// The polish list has said twice that "the Builder holds a whole class in local
// React state, and navigating away loses it silently" — and proposed a guard on
// `navTo` to fix it. Driven in the running app, that is FALSE in both halves:
//
//   · `stages`, `sessionName` and `classChoice` live at the App ROOT, not in
//     BuilderScreen. Changing `view` swaps which screen renders; it does not
//     unmount the state, so a navigation round trip cannot lose anything.
//   · A `useEffect` on all three calls `store.saveDraftClass` on EVERY change,
//     so the draft is already on disk before the coach can navigate at all.
//
// A guard on `navTo` would therefore have interrupted a coach to protect them
// from a loss that cannot happen. That is worse than no guard: it teaches people
// to click through warnings.
//
// So this is the inverse of a data-loss test — it pins the persistence that
// makes the guard unnecessary. If someone later moves `stages` into
// BuilderScreen, or drops the autosave effect, these go red and the claim
// becomes true again, which is exactly when it should be re-raised.
//
// The shape is §1.5's rule: mutate → assert the STORED object → assert the
// screen → reload → assert both again. A write that is only in React state and a
// write that reached disk are indistinguishable until the reload.

const KEY = "jungle_draft_class";

const stageCount = (page) => page.getByRole("button", { name: /^Remove stage|^Remove / }).count();

async function openBuilder(page) {
  await freshApp(page);
  await waitForApp(page);
  await nav(page, "Class Builder");
}

test.describe("the Builder's draft is not in-memory state", () => {
  test("renaming the class survives a navigation round trip AND a reload", async ({ page }) => {
    const errors = watchConsole(page);
    await openBuilder(page);

    // Positive control: the draft must exist and be non-trivial before
    // "it survived" means anything at all.
    const seeded = await stored(page, KEY);
    expect(seeded?.stages?.length, "the Builder must start with a real draft").toBeGreaterThan(0);

    page.once("dialog", (d) => d.accept("Thursday Conditioning"));
    await page.getByRole("button", { name: "Rename class" }).click();

    await expect.poll(async () => (await stored(page, KEY))?.name).toBe("Thursday Conditioning");
    await expect(page.getByText("Thursday Conditioning", { exact: true })).toBeVisible();

    // The navigation the claim says loses it. Away, and back.
    await nav(page, "Dashboard");
    await nav(page, "Class Builder");
    await expect(page.getByText("Thursday Conditioning", { exact: true })).toBeVisible();

    // And the reload, which is the only thing that proves it reached disk.
    await page.reload();
    await waitForApp(page);
    await nav(page, "Class Builder");
    await expect(page.getByText("Thursday Conditioning", { exact: true })).toBeVisible();
    expect((await stored(page, KEY))?.name).toBe("Thursday Conditioning");

    expectNoConsoleErrors(errors);
  });

  test("adding a stage survives a reload", async ({ page }) => {
    await openBuilder(page);
    const before = (await stored(page, KEY)).stages.length;

    await page.getByRole("button", { name: /Add stage/ }).click();
    await expect.poll(async () => (await stored(page, KEY)).stages.length).toBe(before + 1);

    await page.reload();
    await waitForApp(page);
    await nav(page, "Class Builder");
    expect((await stored(page, KEY)).stages.length,
      "a stage added and then reloaded away is the defect this rules out").toBe(before + 1);
    expect(await stageCount(page)).toBeGreaterThan(0);
  });

  test("the Dashboard offers to resume the draft the Builder wrote", async ({ page }) => {
    // The two screens have to agree about whether a draft exists — the Dashboard
    // reads the same root state, and "Resume building" appearing when there is
    // nothing to resume (or missing when there is) is the visible symptom of
    // this state being held in the wrong place.
    await openBuilder(page);
    page.once("dialog", (d) => d.accept("Saturday Strength"));
    await page.getByRole("button", { name: "Rename class" }).click();
    await expect.poll(async () => (await stored(page, KEY))?.name).toBe("Saturday Strength");

    await page.reload();
    await waitForApp(page);
    await expect(page.getByText("Saturday Strength", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Resume building/ })).toBeVisible();
  });
});
