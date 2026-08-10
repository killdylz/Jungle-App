import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── §3.2 · which saves speak, and which must stay silent ────────────────────
//
// The interesting half of this is the SILENCE. toast.jsx's rule is that a toast on
// a write the coach did not ask for becomes noise people learn to ignore — and
// this app autosaves nearly everything, so the opportunities to get it wrong
// outnumber the opportunities to get it right.
//
// The criterion for a toast, taken from toast.jsx's own header, is "a save and a
// no-op are indistinguishable". If pressing Save visibly changes the screen, the
// screen is the acknowledgement. If it does not, silence means the coach finds out
// whether it worked the next time they open the screen.

const toast = (page) => page.getByTestId("toast");

// 🔴 `expect(toast).toHaveCount(0)` IS NOT AN ASSERTION OF SILENCE. It is satisfied
// the instant the count is zero, which includes "the toast has not rendered yet" —
// so it passes for the same reason a scan that ran on nothing passes. Proved: a
// mutation that made the Schedule's AUTOSAVE toast on every write left all three
// tests below green.
//
// So silence is observed rather than sampled. A MutationObserver records every
// toast that ever mounts, and the assertion reads the record afterwards. It must be
// installed after the load it is watching and survive to the assertion — a reload
// clears it, which is why nothing below reloads mid-test.
async function watchToasts(page) {
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      const t = document.querySelector('[data-testid="toast"]');
      if (t) window.__toasts.push(t.innerText.replace(/\s+/g, " ").trim());
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const toastsSeen = (page) => page.evaluate(() => [...new Set(window.__toasts || [])]);

test.describe("saves that must stay silent", () => {
  test("editing the Builder autosaves without a word", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Builder");
    await watchToasts(page);

    page.once("dialog", (d) => d.accept("Silent Save Test"));
    await page.getByRole("button", { name: "Rename class" }).click();
    // A positive control that the autosave really happened — otherwise "no toast
    // appeared" is also true of a screen that saved nothing, and this test would
    // be asserting that an inert button is quiet.
    await expect.poll(async () => await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_draft_class") || "{}").name)).toBe("Silent Save Test");

    // …and no toast for it. The coach did not ask for a save; they typed a name.
    expect(await toastsSeen(page)).toEqual([]);
    expectNoConsoleErrors(errors);
  });

  test("scheduling a class does not narrate itself", async ({ page }) => {
    // The Schedule autosaves `userClasses` in an effect. Adding a class is a
    // coach-initiated write, and its result — the class appearing in the cell it
    // was added to — IS the acknowledgement, so it stays silent too.
    await freshApp(page);
    await nav(page, "Schedule");
    await watchToasts(page);

    await page.getByRole("button", { name: /^Add a class on/ }).first().click();
    await page.getByPlaceholder(/class name/i).fill("Quiet Class");
    await page.getByRole("button", { name: "Add to schedule" }).click();

    // The autosave effect has demonstrably run before silence is judged.
    await expect.poll(async () => await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_user_classes") || "[]").map(c => c.name)))
      .toContain("Quiet Class");
    await expect(page.getByText("Quiet Class").first()).toBeVisible();

    expect(await toastsSeen(page)).toEqual([]);
  });

  test("opening a screen with real data in it says nothing", async ({ page }) => {
    // SEEDED, deliberately. On a fresh install the mount effects have nothing to
    // write, so a silence test over an empty store proves only that nothing
    // happened — the "an empty screen passes every scan trivially" trap. With a
    // coach, a corpus and a schedule present, hydration and the catalogue-seeding
    // effect both really do write on mount.
    await freshApp(page);
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
    await nav(page, "Schedule");
    await page.getByRole("button", { name: /^Add a class on/ }).first().click();
    await page.getByPlaceholder(/class name/i).fill("Seeded Class");
    await page.getByRole("button", { name: "Add to schedule" }).click();
    await expect(page.getByText("Seeded Class").first()).toBeVisible();

    // Watching starts now, so the seeding above is not what is being judged.
    await watchToasts(page);
    for (const screen of ["Coaches", "Members", "Analytics", "Schedule", "Dashboard"]) {
      await nav(page, screen);
    }

    // ⚠️ "Exercise Library" comes LAST: that nav entry opens `LibraryBrowserModal`,
    // not a screen. It covers the sidebar and traps focus, so a loop that visits it
    // mid-sweep cannot click the next nav entry — which is how the first version of
    // this test failed, 30 seconds into waiting for "Schedule". Existing intended
    // behaviour, not a defect; the modal's exit is its own Close.
    await nav(page, "Exercise Library");

    expect(await toastsSeen(page), "a screen narrated its own mount").toEqual([]);
  });
});

test.describe("saves that must speak", () => {
  test("a movement edit is acknowledged, because the row does not show it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();

    // Edit only the NOTES — the field whose absence from the collapsed row is the
    // whole argument. Name and equipment would be visible either way, so an
    // assertion on those would not distinguish a toast from the row updating.
    const row = page.getByRole("button", { name: /^Edit / }).first();
    await row.click();
    const notes = page.getByPlaceholder("Notes / cue");
    await expect(notes, "control: the editor must be open").toBeVisible();
    await notes.fill("Chest to floor, no bouncing");

    await page.getByRole("button", { name: /^Save$/ }).first().click();
    await expect(toast(page)).toContainText("Saved");

    // The STORED object, not the toast. A toast that fires without a write is
    // worse than silence — it is a false acknowledgement.
    await expect.poll(async () => await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_persona_movements") || "[]")
        .some(m => m.meta?.notes === "Chest to floor, no bouncing"))).toBe(true);

    expectNoConsoleErrors(errors);
  });
});
