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

// ─── The duration box, and the "-5m" it put on the room's TV ─────────────────
//
// 🔴 `<input type="number" min="1" max="60">` DOES NOT CLAMP. min and max are
// validation hints; nothing stops the value reaching `e.target.value`, and the
// handler was `parseInt(e.target.value || "1") * 60` — which defends the empty
// string and nothing else. Typing `-5` stored `dur: -300`.
//
// The reason this is an e2e and not only a unit test is that the unit test
// cannot see where the number GOES. Driven and measured before the fix:
// the Builder header read "30 min · 5 stages" for a class whose five stages are
// 35 minutes of work — a negative stage silently subtracts from every total —
// and the Room TV, one of the two surfaces `UI-UX-DIRECTION` §1 ranks above
// every staff screen, rendered "Warm-Up · -5m" in front of the room.
test.describe("a stage's duration cannot be zero, negative, or NaN", () => {
  const setFirstStage = async (page, value) => {
    await nav(page, "Class Builder");
    const box = page.locator("#stage-duration");
    await expect(box).toBeVisible();
    await box.fill(value);
    await box.blur();
    // A store write, not a timeout: the assertions below read the STORED object,
    // so they must run after the write has demonstrably happened.
    await expect
      .poll(async () => (await stored(page, "jungle_draft_class"))?.stages?.[0]?.dur)
      .not.toBe(undefined);
  };

  for (const [typed, why] of [["-5", "negative"], ["0", "zero"], ["", "cleared"]]) {
    test(`typing ${JSON.stringify(typed)} (${why}) floors the stage at one minute`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);

      // POSITIVE CONTROL. The seeded draft really is the five-stage CrossFit
      // class, and its first stage really is five minutes — without this, every
      // assertion below would pass against an empty Builder.
      await nav(page, "Class Builder");
      const before = (await stored(page, "jungle_draft_class"))?.stages || [];
      expect(before.length).toBe(5);
      expect(before[0].dur).toBe(300);

      await setFirstStage(page, typed);

      const after = (await stored(page, "jungle_draft_class")).stages;
      // 🔴 The stored object, which is where -300 actually lived.
      expect(after[0].dur).toBe(60);
      expect(after[0].dur).toBeGreaterThan(0);
      // Nothing else moved.
      expect(after.slice(1).map(s => s.dur)).toEqual([600, 900, 300, 300]);

      expectNoConsoleErrors(errors);
    });
  }

  test("a long stage is kept, because 75 minutes is a class a studio runs", async ({ page }) => {
    await freshApp(page);
    await setFirstStage(page, "75");
    // ⚠ In the SAME run as the refusals above, so "floors at 60" cannot quietly
    // become "clamps everything to the control's max".
    expect((await stored(page, "jungle_draft_class")).stages[0].dur).toBe(4500);
    // 🔴 …and it is left UNREMARKED. Session 37's long-stage warning was
    // written at a one-hour threshold and fired here, on the exact value session
    // 36 refused to clamp. A warning that cries on a legitimate open-gym block
    // is the same defect as a ceiling that lies, one screen later.
    await expect(page.getByTestId("stage-duration-note")).toHaveCount(0);
    // The room gets the real number, not a rounded-down one.
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);
    await expect(page.locator("body")).toContainText("Warm-Up · 75m");
  });

  // ── The ceiling that was not a ceiling ─────────────────────────────────────
  //
  // Session 36 floored this box and left `max="60"` on it deliberately, saying
  // so out loud: clamping destroys a coach's legitimate 75. That left the
  // attribute as the last thing on the control claiming something nothing
  // enforced — 999 sailed past it and stored 16h 39m with nothing on screen
  // saying a word. Session 37 removed the attribute and made the box speak.
  test("999 minutes is kept, and the box says out loud that it is 16h 39m", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    // POSITIVE CONTROL, twice over. The field exists, and BEFORE the long value
    // it says nothing — without this the assertion below passes on a note that
    // was always there, and on a Builder that never rendered.
    await nav(page, "Class Builder");
    await expect(page.locator("#stage-duration")).toBeVisible();
    await expect(page.getByTestId("stage-duration-note")).toHaveCount(0);
    expect((await stored(page, "jungle_draft_class")).stages[0].dur).toBe(300);

    await setFirstStage(page, "999");

    // The value is KEPT — the whole reason a clamp was refused.
    expect((await stored(page, "jungle_draft_class")).stages[0].dur).toBe(59940);
    // And the coach is told what they just stored, in the unit they can read.
    await expect(page.getByTestId("stage-duration-note")).toContainText("16h 39m");
    // The note is attached to the field, not merely near it.
    await expect(page.locator("#stage-duration")).toHaveAttribute("aria-describedby", "stage-duration-note");

    // 🔴 The attribute that made the claim is gone. Raising it to another
    // unenforced number would have been the same defect with a bigger digit.
    expect(await page.locator("#stage-duration").getAttribute("max")).toBeNull();
    // …while `min`, which `stageDurSec` genuinely enforces, stays.
    await expect(page.locator("#stage-duration")).toHaveAttribute("min", "1");

    expectNoConsoleErrors(errors);
  });

  test("and the Room TV never shows a negative stage", async ({ page }) => {
    await freshApp(page);
    await setFirstStage(page, "-5");

    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Room TV/ }).click();
    await page.mouse.move(640, 400);

    // POSITIVE CONTROL: the board really rendered its plan strip.
    const board = page.locator("body");
    await expect(board).toContainText(/\d+ stages · \d+m/);
    await expect(board).toContainText("Circuit Blast · 10m");

    // 🔴 What shipped: "Warm-Up · -5m", on the biggest screen in the gym.
    await expect(board).toContainText("Warm-Up · 1m");
    await expect(board).not.toContainText("-5m");
    // And the class total is the sum of five real stages, not five minutes short.
    await expect(board).not.toContainText("· 30m ·");
  });
});
