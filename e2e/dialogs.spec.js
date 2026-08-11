import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── A modal that is not modal ────────────────────────────────────────────────
//
// Sessions 14–16 swept keyboard handlers, dead controls and accessible names
// across all nine screens. None of them could ask the question this file asks:
// once an overlay is OPEN, is the user actually in it?
//
// A live probe of every overlay in the app said no, in the same four ways each
// time — no `role="dialog"`, no `aria-modal`, focus never moved in, Tab walked
// straight out the back, and Escape did nothing:
//
//   ProfileModal        focus stayed on the trigger · Tab escaped on step 0
//   Exercise Library    focus stayed on the page     · Tab escaped on step 0
//   Builder smart-build autoFocus put it in          · Tab escaped on step 11
//   Calendar add-class  autoFocus put it in          · Tab escaped on step 7
//
// "Escaped on step 0" is the one that matters. Opening the profile modal left
// focus on the button behind the overlay, so the coach's first Tab landed on
// "Resume building" — one of 17 controls hidden behind the dark backdrop, all
// focusable, all activatable with Enter, none of them visible. The add-class
// modal had 50 such controls behind it. A sighted mouse user could not reach
// any of them; a keyboard user could reach nothing else.
//
// The fix is `src/ui/dialog.js`. This file is the guard, and it asserts the
// behaviour a user experiences (focus lands inside, Tab cycles, Escape closes,
// focus comes back) rather than the mechanism — the same lesson session 16's
// `inert` episode taught, where asserting `tabIndex` and `getByRole` would have
// failed against correct code because the platform does not work how the
// assertion assumed.

// Tab `steps` times and report every moment focus was outside the dialog.
// More steps than the dialog has focusables, deliberately: a trap that holds
// for one lap and leaks on the second is still broken.
async function tabTrail(page, steps, shift = false) {
  await page.evaluate(() => {
    window.__dlg = document.querySelector('[role="dialog"]');
    window.__trail = [];
  });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    await page.evaluate(() => {
      const a = document.activeElement;
      window.__trail.push({
        inside: window.__dlg ? window.__dlg.contains(a) : null,
        el: (a?.getAttribute("aria-label") || a?.getAttribute("placeholder") ||
             a?.innerText || a?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 40),
      });
    });
  }
  return page.evaluate(() => window.__trail);
}

const escaped = (trail) => trail.filter(t => !t.inside);

// [name, how to open it, the control that opens it]
const DIALOGS = [
  ["ProfileModal", async (page) => {
    await nav(page, "Dashboard");
    await page.getByRole("button", { name: "Your profile and settings" }).click();
  }, "Your profile and settings"],

  ["Calendar add-class", async (page) => {
    await nav(page, "Schedule");
    await page.getByRole("button", { name: /Add class/i }).first().click();
  }, "+ Add class"],

  ["Builder smart-build", async (page) => {
    await nav(page, "Class Builder");
    await page.getByRole("button", { name: /Build for me/i }).first().click();
  }, "Build for me"],

  ["Exercise Library", async (page) => { await nav(page, "Exercise Library"); }, null],

  ["Check-in panel", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
  }, null],
];

test.describe("every overlay behaves like a dialog", () => {
  for (const [name, open] of DIALOGS) {
    test(`${name} announces itself as a dialog`, async ({ page }) => {
      await freshApp(page);
      await open(page);

      const dlg = page.getByRole("dialog");
      await expect(dlg, `${name} must expose role="dialog"`).toHaveCount(1);
      await expect(dlg).toHaveAttribute("aria-modal", "true");
      // A dialog with no name is announced as "dialog" and nothing else.
      const label = await dlg.getAttribute("aria-label");
      expect(label?.trim(), `${name} needs an aria-label`).toBeTruthy();
    });

    test(`${name} puts focus inside on open`, async ({ page }) => {
      await freshApp(page);
      await open(page);
      // ⚠️ WAIT FOR THE DIALOG BEFORE READING FOCUS. `page.evaluate` does not
      // auto-wait the way a locator assertion does, so this read raced the
      // render — invisibly, while every dialog mounted synchronously. Session
      // 28 made ProfileModal and the library modal lazy, and the read then
      // landed in the beat before the chunk arrived and reported focus outside
      // a dialog that did not exist yet.
      //
      // This is not a weaker assertion: it is the same claim, synchronised.
      // Focus is set in `useDialog`'s effect, which React runs in the commit
      // that inserts the element — so once the element exists, focus has moved.
      // The two sibling tests here never failed because a locator assertion is
      // the first thing they do.
      await expect(page.getByRole("dialog")).toHaveCount(1);
      const inside = await page.evaluate(() =>
        document.querySelector('[role="dialog"]')?.contains(document.activeElement));
      expect(inside, `${name}: focus stayed outside the dialog on open — the ` +
        `first Tab lands on a control hidden behind the backdrop`).toBe(true);
    });

    test(`${name} traps Tab and Shift+Tab`, async ({ page }) => {
      await freshApp(page);
      await open(page);

      // Scanner sanity: if this selector ever stops matching, `tabTrail`
      // records `inside: null` and every assertion below passes vacuously.
      await expect(page.getByRole("dialog")).toHaveCount(1);

      const fwd = await tabTrail(page, 24);
      expect(fwd.some(t => t.inside === null), "the dialog must be findable").toBe(false);
      expect(escaped(fwd), `${name}: Tab left the dialog — reached ` +
        `${escaped(fwd).map(t => JSON.stringify(t.el)).join(", ")}`).toEqual([]);

      const back = await tabTrail(page, 24, true);
      expect(escaped(back), `${name}: Shift+Tab left the dialog — reached ` +
        `${escaped(back).map(t => JSON.stringify(t.el)).join(", ")}`).toEqual([]);
    });

    test(`${name} closes on Escape`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await open(page);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog"),
        `${name}: Escape did not close it`).toHaveCount(0);
      expectNoConsoleErrors(errors);
    });
  }
});

// Closing is only half a round trip. Without a restore, dismissing a modal drops
// focus onto <body> and the coach's next Tab restarts from the top of the page —
// which on this app means the whole sidebar before anything they were doing.
test.describe("focus comes back to whatever opened the dialog", () => {
  for (const [name, open, opener] of DIALOGS.filter(d => d[2])) {
    test(`${name} returns focus to ${opener}`, async ({ page }) => {
      await freshApp(page);
      await open(page);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const active = await page.evaluate(() =>
        (document.activeElement?.getAttribute("aria-label") ||
         document.activeElement?.innerText || "").replace(/\s+/g, " ").trim());
      expect(active, `${name}: focus went to "${active}" instead of the control ` +
        `that opened it`).toContain(opener.replace("+ ", ""));
    });
  }
});

// ── The nested case ──────────────────────────────────────────────────────────
//
// The Exercise Library's "Reset to Defaults?" confirm renders INSIDE the library
// dialog. Two independent Escape listeners would close both at once, so
// cancelling a destructive confirm would also throw away the screen behind it —
// and the coach would have no idea whether the reset had happened. `useDialog`
// keeps a stack and only the topmost dialog answers the keyboard.
test.describe("a dialog inside a dialog", () => {
  test("Escape cancels the reset confirm and leaves the library open", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Exercise Library");
    await expect(page.getByRole("dialog")).toHaveCount(1);

    // Reset lives in edit mode, same door `libraryEdit.spec.js` uses.
    await page.getByRole("button", { name: /Edit/ }).first().click();
    await expect(page.getByRole("button", { name: /Done/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("dialog"),
      "the confirm must be a dialog too, nested in the library's").toHaveCount(2);

    // Focus must be in the CONFIRM, not left in the library behind it.
    const inConfirm = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const confirm = dialogs.find(d => /Reset to Defaults/.test(d.innerText || ""));
      return !!confirm?.contains(document.activeElement);
    });
    expect(inConfirm, "focus must move into the nested confirm").toBe(true);

    await page.keyboard.press("Escape");

    // Exactly one closes. Both closing is the bug this guards.
    await expect(page.getByRole("dialog"),
      "Escape closed the library too — a cancelled confirm threw away the screen")
      .toHaveCount(1);
    await expect(page.getByText(/Reset to Defaults/)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-label", "Exercise library");

    expectNoConsoleErrors(errors);
  });
});
