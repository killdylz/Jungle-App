import { test, expect } from "@playwright/test";
import { nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The product in the timezone it is sold in (session 43) ──────────────────
//
// 🔴 EVERY OTHER SPEC RUNS IN UTC, and in UTC a wall-clock time and a UTC time
// are the same instant. So a writer that confuses them passes the whole suite.
// Jungle's first market is Singapore (UTC+8). This file sets the browser there,
// and every test in it failed on the code before the commit that added it.

test.use({ timezoneId: "Asia/Singapore" });

// Wed 23 Sep 2026, 19:00 in Singapore.
const NOW = new Date("2026-09-23T11:00:00.000Z");

async function seed(page, data) {
  await page.clock.setFixedTime(NOW);
  await page.goto("./");
  await page.evaluate((d) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v));
  }, data);
  await page.reload();
}

test("🔴 precondition: the page really is on Singapore time", async ({ page }) => {
  await seed(page, {});
  expect(await page.evaluate(() => new Date().getTimezoneOffset())).toBe(-480);
});

test.describe("importing the booking system's export", () => {
  test("🔴 a class Jungle already ran is joined, not recorded a second time", async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page, {
      jungle_members: [
        { id: "m1", name: "Sarah Chen", email: "sarah@example.com", status: "active", joinedAt: "2026-01-01" },
      ],
      // What the Runner writes for Tuesday's 18:00 class: a real instant.
      jungle_class_instances: [
        { id: "ci1", name: "Evening Burn", classType: "hiit", coachName: "Dylan", startsAt: "2026-09-22T10:00:00.000Z" },
      ],
      jungle_attendance: [
        { id: "a1", classInstanceId: "ci1", memberId: "m1", source: "coach", checkedInAt: "2026-09-22T10:05:00.000Z" },
      ],
    });
    await nav(page, "Members");
    await page.getByPlaceholder(/paste CSV here/i).fill([
      "Member Name,Email,Date,Class,Type,Coach",
      "Sarah Chen,sarah@example.com,2026-09-22 18:00,Evening Burn,HIIT,Dylan",
      "Raj Kumar,raj@example.com,2026-09-09 20:30,Evening Burn,HIIT,Dylan",
    ].join("\n"));
    await page.getByRole("button", { name: "Read the file" }).click();
    await page.getByRole("button", { name: /^Import \d+ check-ins?$/ }).click();
    await expect(page.getByText(/^Imported \d+ check-in/)).toBeVisible();

    // The STORED rows. Before the fix: three classes and three check-ins, with
    // Sarah in Tuesday's class twice.
    const cis = await stored(page, "jungle_class_instances");
    expect(cis.map(c => c.startsAt).sort()).toEqual(["2026-09-09T12:30:00.000Z", "2026-09-22T10:00:00.000Z"]);
    const att = await stored(page, "jungle_attendance");
    expect(att.filter(a => a.memberId === "m1")).toHaveLength(1);

    // And what the screen then says. Raj trained at 20:30 on the 9th; the old
    // importer made that 04:30 on the 10th.
    await page.reload();
    await nav(page, "Members");
    // The rendered positive control comes first, so the absence below is read
    // off a roster that has demonstrably drawn.
    await expect(page.getByText("2026-09-09")).toBeVisible();
    await expect(page.getByText("2026-09-10")).toHaveCount(0);
    await expect(page.getByText("2026-09-22")).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

// Click, catch the download, read it back as text (the shape export.spec.js uses).
async function grab(page, clicker) {
  const [download] = await Promise.all([page.waitForEvent("download"), clicker()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("a member's own data export", () => {
  test("🔴 tells them the date and time they were actually in class", async ({ page }) => {
    await seed(page, {
      jungle_gym_branding: { gymName: "The Garage" },
      jungle_members: [{ id: "m1", name: "Sarah Chen", email: "s@x.com", status: "active", joinedAt: "2026-01-01" }],
      jungle_class_instances: [
        { id: "ci1", name: "Evening Burn", classType: "hiit", coachName: "Dylan", startsAt: "2026-09-22T10:00:00.000Z" },
        { id: "ci2", name: "Dawn Row",     classType: "hiit", coachName: "Dylan", startsAt: "2026-09-21T22:30:00.000Z" },
      ],
      jungle_attendance: [
        { id: "a1", classInstanceId: "ci1", memberId: "m1", source: "coach", checkedInAt: "2026-09-22T10:05:00.000Z" },
        { id: "a2", classInstanceId: "ci2", memberId: "m1", source: "qr",    checkedInAt: "2026-09-21T22:31:00.000Z" },
      ],
    });
    await nav(page, "Members");
    const text = await grab(page, () => page.getByRole("button", { name: "Download Sarah Chen's data" }).click());
    const lines = text.replace(/^﻿/, "").trim().split("\r\n");
    // Before the fix: "2026-09-21,22:31,Dawn Row…" and "2026-09-22,10:05,Evening Burn…".
    expect(lines.some(l => l.startsWith("2026-09-22,06:31,Dawn Row"))).toBe(true);
    expect(lines.some(l => l.startsWith("2026-09-22,18:05,Evening Burn"))).toBe(true);
  });
});
