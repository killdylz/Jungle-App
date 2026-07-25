import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── Member data export (B5) ──────────────────────────────────────────────────
//
// The unit tests in `src/lib/csvExport.test.js` pin the FORMAT. This file pins
// that a real click produces a real file with the real store's contents in it —
// which is a separate claim, and the one that matters for a statutory request.
// Playwright downloads the file for us, so what is asserted below is the bytes
// that would land in the gym's Downloads folder, not a string a test built.

async function seedRoster(page) {
  await page.evaluate(() => {
    localStorage.setItem("jungle_members", JSON.stringify([
      { id: "m1", name: "Sarah Chen", email: "sarah@example.com", status: "active",    joinedAt: "2025-11-02" },
      { id: "m2", name: "Raj Kumar",  email: "",                  status: "cancelled", joinedAt: "2026-01-15" },
      // A name a previous system would happily have accepted, and a spreadsheet
      // would happily execute.
      { id: "m3", name: '=HYPERLINK("http://evil.test","clickme")', email: "", status: "active", joinedAt: "2026-02-01" },
    ]));
    localStorage.setItem("jungle_class_instances", JSON.stringify([
      { id: "c1", name: "Tuesday 6pm", classType: "HIIT", coachName: "Dylan", startsAt: "2026-07-14T10:00:00.000Z" },
    ]));
    localStorage.setItem("jungle_attendance", JSON.stringify([
      { id: "a1", classInstanceId: "c1", memberId: "m1", source: "coach",  checkedInAt: "2026-07-14T10:02:00.000Z" },
      { id: "a2", classInstanceId: "c1", memberId: "m2", source: "import", checkedInAt: "2026-07-14T10:03:00.000Z" },
    ]));
    localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
  });
  await page.reload();
  await nav(page, "Members");
}

// Click, catch the download, read it back as text.
async function grab(page, clicker) {
  const [download] = await Promise.all([page.waitForEvent("download"), clicker()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

test.describe("the gym can get its data back out", () => {
  test("exports the whole roster with visits and last-seen", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page);

    const { name, text } = await grab(page, () => page.locator('[data-testid="export-roster"]').click());

    const today = new Date().toISOString().slice(0, 10);
    expect(name).toBe(`The-Garage-members-${today}.csv`);

    const lines = text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Name,Email,Status,Joined,Visits,Last seen");
    expect(lines).toContain("Sarah Chen,sarah@example.com,Active,2025-11-02,1,2026-07-14");
    // Someone who left is still in the export — the history is theirs too.
    expect(lines).toContain("Raj Kumar,,Left,2026-01-15,1,2026-07-14");

    // The file leaves the building and gets opened in Excel. A cell that starts
    // a formula is a security bug in a document we handed over.
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(text).toMatch(/'=HYPERLINK/);

    expectNoConsoleErrors(errors);
  });

  test("starts the file with a BOM so Excel reads names as UTF-8", async ({ page }) => {
    await freshApp(page);
    await seedRoster(page);
    const { text } = await grab(page, () => page.locator('[data-testid="export-roster"]').click());
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  test("offers the export before there is anything to export, but disabled", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");
    // Visible on an empty roster on purpose: an owner evaluating Jungle should
    // see their data can leave before they put any in.
    await expect(page.locator('[data-testid="export-roster"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-roster"]')).toBeDisabled();
  });
});

test.describe("a member can be told what is held about them", () => {
  test("exports one person's record and nobody else's", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await seedRoster(page);

    const { name, text } = await grab(page, () =>
      page.getByRole("button", { name: "Download Sarah Chen's data" }).click());

    expect(name).toMatch(/^Sarah-Chen-data-\d{4}-\d{2}-\d{2}\.csv$/);

    // Named by the organisation that holds it. Jungle is the intermediary; the
    // gym is the one with the duty (LEGAL §1), and the document has to say so.
    expect(text).toMatch(/Personal data held,The Garage \(via Jungle\)/);
    expect(text).toMatch(/Name,Sarah Chen/);
    expect(text).toMatch(/Email,sarah@example\.com/);
    expect(text).toMatch(/Membership status,Active/);
    expect(text).toMatch(/Classes attended,1/);
    expect(text).toMatch(/2026-07-14,10:02,Tuesday 6pm,HIIT,Dylan,Checked in by coach/);

    // The other member checked into the SAME class. One person's access request
    // must not disclose another member.
    expect(text).not.toMatch(/Raj Kumar/);

    expectNoConsoleErrors(errors);
  });

  test("says plainly when a member has never attended", async ({ page }) => {
    await freshApp(page);
    await seedRoster(page);
    const { text } = await grab(page, () =>
      page.getByRole("button", { name: /Download .*'s data/ }).last().click());
    expect(text).toMatch(/Classes attended,0/);
    expect(text).toMatch(/No class attendance has been recorded/);
  });

  // A row's buttons announce themselves by the member they act on, or a 200-row
  // roster is 200 buttons all called "Data".
  test("names each row's button after the member it acts on", async ({ page }) => {
    await freshApp(page);
    await seedRoster(page);
    await expect(page.getByRole("button", { name: "Download Sarah Chen's data" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download Raj Kumar's data" })).toBeVisible();
  });
});
