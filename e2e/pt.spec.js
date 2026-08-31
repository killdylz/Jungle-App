import { test, expect } from "@playwright/test";
import { freshApp, waitForApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── PT · the trainer surface, driven end to end ─────────────────────────────
//
// ⚠️ EVERY TEST HERE SEEDS A ROSTER FIRST. An empty screen passes every scan
// trivially, and this repo has been fooled by exactly that twice in one session
// — a tap sweep and an interaction sweep both went green on screens with nothing
// on them. So each test asserts the thing it is about to measure EXISTS before
// measuring it.
//
// The flow under test is the whole PT1–PT4 loop plus PT9's honesty rules:
// add a client, be refused a programme without screening, record screening, log
// a set, and read a number that shows its working.

const ROSTER = [
  { id: "mem-ava", name: "Ava Lim", email: "", status: "active", joinedAt: "2026-01-10", externalRef: "" },
  { id: "mem-ben", name: "Ben Ortiz", email: "", status: "active", joinedAt: "2026-02-01", externalRef: "" },
];

async function seedRoster(page) {
  await page.evaluate((roster) => {
    localStorage.setItem("jungle_members", JSON.stringify(roster));
  }, ROSTER);
  await page.reload();
  await waitForApp(page);
}

async function openClients(page) {
  await freshApp(page);
  await waitForApp(page);
  await seedRoster(page);
  await nav(page, "Clients");
}

// Drive the roster picker. It is a <select>, so the option has to be chosen by
// value rather than clicked — a `click` on an option is a no-op in Chromium.
async function addClient(page, memberId) {
  await page.getByRole("button", { name: "Add client" }).click();
  await page.getByLabel("Add a client from the roster").selectOption(memberId);
}

test("a gym with a roster but no PT says so, and offers the next action", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);

  // The POSITIVE CONTROL for every other test in this file: the screen rendered,
  // and the roster it will offer is genuinely there. Without this, "0 clients"
  // is indistinguishable from a screen that failed to mount.
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByText("0 clients")).toBeVisible();
  await expect(page.getByText(/No one is training one-to-one yet/)).toBeVisible();

  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByLabel("Add a client from the roster")).toBeVisible();
  // The roster IS reachable — proving the empty state above is about PT, not
  // about an empty database.
  await expect(page.getByRole("option", { name: "Ava Lim" })).toHaveCount(1);

  expectNoConsoleErrors(errors);
});

test("adding a client stores them and shows their screening state", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ava");

  await expect(page.getByText("1 client")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ava Lim/ })).toBeVisible();

  // ASSERT THE STORED OBJECT, not only what was rendered. A screen that shows a
  // name it never persisted looks identical until the next reload.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jungle_pt_identities") || "[]"));
  expect(stored).toHaveLength(1);
  expect(stored[0].memberId).toBe("mem-ava");
  expect(stored[0].linkedAt).toBeNull();      // invited, not accepted

  await page.getByRole("button", { name: /Ava Lim/ }).click();
  await expect(page.getByText("No health screening on file yet.")).toBeVisible();
  await expect(page.getByText(/invited .*, not opened yet/)).toBeVisible();

  expectNoConsoleErrors(errors);
});

test("a programme cannot start without screening, and the refusal says why", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ava");
  await page.getByRole("button", { name: /Ava Lim/ }).click();

  await page.getByLabel("New programme name").fill("Base Block 1");
  await page.getByRole("button", { name: "Add programme" }).click();
  await expect(page.getByText("Base Block 1")).toBeVisible();
  // exact: the "Draft created" toast also contains the word, and a substring
  // match resolves to two elements.
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // The gate. Not "could not activate" — the sentence has to name the problem
  // and the action, because a coach reading it is deciding what to do next.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText(/No health screening on file yet\. Record it before starting/)).toBeVisible();

  // And it did NOT write. A refused activation that still changed localStorage
  // would fail 0013's trigger upstream and surface as a sync error instead.
  const programs = await page.evaluate(() => JSON.parse(localStorage.getItem("jungle_pt_programs") || "[]"));
  expect(programs).toHaveLength(1);
  expect(programs[0].status).toBe("draft");

  // Record screening, and the same button now works.
  await page.getByRole("button", { name: "Record screening" }).click();
  await expect(page.getByText(/Current until/)).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Active")).toBeVisible();

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("jungle_pt_programs") || "[]"));
  expect(after[0].status).toBe("active");

  expectNoConsoleErrors(errors);
});

test("a flagged screening blocks until clearance is recorded", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ben");
  await page.getByRole("button", { name: /Ben Ortiz/ }).click();

  await page.getByLabel("Answers flagged a risk").check();
  await page.getByRole("button", { name: "Record screening" }).click();

  await expect(page.getByText(/medical clearance needed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Record medical clearance" })).toBeVisible();

  await page.getByRole("button", { name: "Record medical clearance" }).click();
  await expect(page.getByText(/Flagged, and clearance is on file/)).toBeVisible();

  expectNoConsoleErrors(errors);
});

test("a logged set is stored, and the estimate shows the set it came from", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ava");
  await page.getByRole("button", { name: /Ava Lim/ }).click();

  await page.getByRole("button", { name: /New session/ }).click();
  await expect(page.getByLabel("Movement")).toBeVisible();

  await page.getByLabel("Movement").fill("Back Squat");
  // exact: getByLabel substring-matches, and "Reps in reserve" contains "Reps".
  await page.getByLabel("Reps", { exact: true }).fill("5");
  await page.getByLabel("Load in kilograms").fill("100");
  await page.getByLabel("Reps in reserve").fill("2");
  await page.getByRole("button", { name: "Log", exact: true }).click();

  // exact on the whole row: a substring/regex also matches the row's CONTAINER,
  // whose text is the row plus the "Last:" line beneath it.
  await expect(page.getByText("Back Squat — 5 × 100 kg @ RIR 2", { exact: true })).toBeVisible();

  const logs = await page.evaluate(() => JSON.parse(localStorage.getItem("jungle_pt_set_logs") || "[]"));
  expect(logs).toHaveLength(1);
  // Stored as NUMBERS. A form that persists "100" as text makes every later
  // comparison a string comparison, and "9" > "100" is true.
  expect(logs[0].loadKg).toBe(100);
  expect(logs[0].reps).toBe(5);
  expect(logs[0].voided).toBe(false);

  // 🔴 THE HONESTY RULE, rendered. 5 reps at RIR 2 is a seven-rep effort:
  // 100 × (1 + 7/30) = 123.3 — and it must never appear without its source set.
  await expect(page.getByText("123.3 kg")).toBeVisible();
  await expect(page.getByText(/from 5 × 100 kg @ RIR 2/)).toBeVisible();
  await expect(page.getByText(/Built from 1 of 1 logged sets/)).toBeVisible();

  expectNoConsoleErrors(errors);
});

test("a set that cannot support an estimate is counted and explained, not silently dropped", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ava");
  await page.getByRole("button", { name: /Ava Lim/ }).click();
  await page.getByRole("button", { name: /New session/ }).click();

  // 20 reps: past the ceiling where every rep-max formula stops agreeing.
  await page.getByLabel("Movement").fill("Back Squat");
  // exact: getByLabel substring-matches, and "Reps in reserve" contains "Reps".
  await page.getByLabel("Reps", { exact: true }).fill("20");
  await page.getByLabel("Load in kilograms").fill("60");
  await page.getByLabel("Reps in reserve").fill("1");
  await page.getByRole("button", { name: "Log", exact: true }).click();

  await expect(page.getByText("Back Squat — 20 × 60 kg @ RIR 1", { exact: true })).toBeVisible();
  // …but no number is invented from it, and the screen says why rather than
  // rendering an empty panel.
  await expect(page.getByText(/No set yet that a strength estimate can be built from/)).toBeVisible();
  await expect(page.getByText(/123.3 kg/)).toHaveCount(0);

  expectNoConsoleErrors(errors);
});

test("attendance shows both numerals, and withholds a rate it cannot support", async ({ page }) => {
  const errors = watchConsole(page);
  await openClients(page);
  await addClient(page, "mem-ava");
  await page.getByRole("button", { name: /Ava Lim/ }).click();

  await page.getByRole("button", { name: /New session/ }).click();
  await expect(page.getByText(/0 sets/)).toBeVisible();

  await page.getByRole("button", { name: /Delivered/ }).click();
  // 1 of 1 is 100%, and 100% of one session is not a rate. Both numerals show;
  // the percentage is withheld with a sentence saying so.
  await expect(page.getByText(/1 of 1/)).toBeVisible();
  await expect(page.getByText(/too few sessions to read as a rate yet/)).toBeVisible();
  await expect(page.getByText("· 100%")).toHaveCount(0);

  expectNoConsoleErrors(errors);
});
