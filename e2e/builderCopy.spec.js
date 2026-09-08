import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, waitForApp, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The Builder's header calls one object by one name ────────────────────────
//
// CLAUDE.md records three nav vocabularies ("Class Builder" / "Builder" /
// "Build") as a trap this repo already pays for. This is the same fault one
// level down and inside a single control: the pencil button announces itself as
// "Rename class", and the `window.prompt` it opens asked for a "Session name:".
// A coach who taps a button called Rename class and is asked for a session name
// has to decide whether they hit the wrong thing.
//
// `session` is this file's variable name (`sessionName`, `saveDraftClass`), not
// the product's word. The screen is the Class Builder, its two file buttons open
// and save a "class file", and the Dashboard says "today's class".
//
// ⚠️ This is a COPY test. The rename ITSELF is well driven — builderDraft,
// dashboard, saveToasts, schedule, reloadSweep and smoke all click this button —
// so nothing here re-tests the rename. What is asserted is the sentence, which
// no test read, and which is why it could disagree with its own button.
//
// ⚠️ The dialog is a native prompt, and CLAUDE.md's first testing trap is that
// Playwright AUTO-DISMISSES those. A test that never registers a handler sees
// the rename cancelled and the message never captured — so the message is
// captured into a variable and the capture itself is the positive control:
// asserting `not.toMatch(/session/i)` against `undefined` would pass on a page
// that never opened a dialog at all.

test.describe("Builder header copy", () => {
  test("the rename dialog names the same object as the button that opens it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await waitForApp(page);
    await nav(page, "Class Builder");

    const renameBtn = page.getByRole("button", { name: "Rename class" });
    await expect(renameBtn, "positive control: the control under test must exist").toBeVisible();

    let message;
    page.once("dialog", (d) => { message = d.message(); return d.accept("Thursday Conditioning"); });
    await renameBtn.click();

    // The rename must actually have happened, or the dialog we read was not the
    // one this button opens.
    await expect.poll(async () => (await stored(page, "jungle_draft_class"))?.name)
      .toBe("Thursday Conditioning");

    expect(message, "the prompt must have opened and been read").toBeTruthy();
    expect(message).toBe("Class name:");
    expect(message, "the button says class; the prompt must not say session")
      .not.toMatch(/session/i);

    expectNoConsoleErrors(errors);
  });
});
