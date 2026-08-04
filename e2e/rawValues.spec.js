import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { rawValues, proveScannerLive, reportRawValues } from "./rawValueScan.js";

// ─── No stored value reaches a human raw ─────────────────────────────────────
//
// Session 22's dashboard defect, generalised into a standing guard. `{c.type}`
// printed the catalogue key, so a coach read `GYM-BARRE-MRKHJ2LC` as the name of
// their own class type — and nothing in the suite could see it, because
// `labels.test.js` pins the MAPS rather than the call sites, and
// `honesty.spec.js` checks four named enum words on one screen.
//
// 🔴 And the reason a list of words is not enough: `honesty.spec.js` already
// asserted "a scheduled class says its type in words on the Dashboard", and it
// PASSED against the defect. Its fixture seeded `type: "Hyrox"` — the vocabulary
// the Schedule used before session 21 — so the raw stored value happened to be
// the human word. The assertion was right; the fixture could not exercise it.
// This file seeds what the app actually writes today.

// Seeded so each screen has something to leak: a gym-authored class type
// (the key that started this), a member and an attendance row (UUIDs), and a
// class instance joining them.
const MEMBER_ID = "11111111-2222-4333-8444-555555555555";
const CLASS_ID  = "66666666-7777-4888-8999-aaaaaaaaaaaa";

async function seedRichGym(page) {
  // Through the real UI, so the key is minted the way the product mints it
  // rather than by a fixture that could get the shape wrong.
  await nav(page, "Exercise Library");
  await page.getByRole("button", { name: /Edit/ }).first().click();
  page.once("dialog", (d) => d.accept("Barre"));
  await page.getByRole("button", { name: "+ New class type" }).click();
  await expect.poll(async () => await stored(page, "jungle_library_custom")).not.toBeNull();
  const gymKey = Object.keys((await stored(page, "jungle_library_custom")).classes)
    .find((k) => k.startsWith("gym-"));
  expect(gymKey, "precondition: a gym-authored class type exists").toBeTruthy();
  await page.getByRole("button", { name: "Close" }).click();

  await page.evaluate(({ k, mid, cid }) => {
    localStorage.setItem("jungle_user_classes", JSON.stringify([
      { id: "uc1", name: "Barre Flow", type: k, coach: "Dylan", day: "Mon", slot: "06:00", dur: "45m", repeat: "daily" },
      { id: "uc2", name: "Burn", type: "hiit", coach: "Mara", day: "Mon", slot: "09:00", dur: "45m", repeat: "daily" },
    ]));
    localStorage.setItem("jungle_members", JSON.stringify([
      { id: mid, name: "Sarah Chen", email: "sarah@example.com", status: "active",
        joinedAt: "2026-01-05", externalRef: "" },
    ]));
    localStorage.setItem("jungle_class_instances", JSON.stringify([
      { id: cid, startsAt: new Date(Date.now() - 86_400_000).toISOString(), name: "Barre Flow",
        classType: k, coachName: "Dylan", durationMin: 45 },
    ]));
    localStorage.setItem("jungle_attendance", JSON.stringify([
      { id: "99999999-aaaa-4bbb-8ccc-dddddddddddd", classInstanceId: cid, memberId: mid,
        source: "coach", checkedInAt: new Date(Date.now() - 86_400_000).toISOString() },
    ]));
  }, { k: gymKey, mid: MEMBER_ID, cid: CLASS_ID });
  await page.reload();
  return gymKey;
}

const SCREENS = ["Dashboard", "Class Builder", "Coaches", "Exercise Library",
                 "Class Runner", "Schedule", "Members", "Brand Studio"];

test.describe("no stored value is shown to a coach raw", () => {
  for (const label of SCREENS) {
    test(`${label} shows words, not storage`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await seedRichGym(page);
      await nav(page, label);

      const bad = await rawValues(page);
      expect(bad, reportRawValues(label, bad)).toEqual([]);
      // …and the scan really ran on this page. Same document, same run.
      await proveScannerLive(page, label);

      expectNoConsoleErrors(errors);
    });
  }
});

// The screens above are first renders. These are the panels that hold the most
// stored data, and two of them are where `labels.js` says the leaks historically
// were — `sets_reps` rendered raw on a profile card and every catalog row for a
// whole session before anyone noticed.
const REVEALED = [
  ["Coaches · with a coach loaded", async (page) => {
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
  }],
  ["Coaches · Edit plan", async (page) => {
    await nav(page, "Coaches");
    await page.getByRole("button", { name: /Load sample coach/ }).click();
    await page.getByRole("button", { name: /^Edit plan / }).first().click();
    await expect(page.getByRole("dialog", { name: "Edit plan" })).toBeVisible();
  }],
  ["Class Runner · Check in", async (page) => {
    await nav(page, "Class Runner");
    await page.getByRole("button", { name: /Check in/ }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  }],
  ["Builder · on the gym's own class type", async (page, gymKey) => {
    await nav(page, "Class Builder");
    await page.getByLabel("Class type").selectOption(gymKey);
    const confirm = page.getByRole("button", { name: "Apply", exact: true });
    if (await confirm.count()) await confirm.click();
    await expect(page.getByLabel("Class type")).toHaveValue(gymKey);
  }],
];

test.describe("nor in a panel that only exists after a click", () => {
  for (const [name, open] of REVEALED) {
    test(`${name} shows words, not storage`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      const gymKey = await seedRichGym(page);
      await open(page, gymKey);

      const bad = await rawValues(page);
      expect(bad, reportRawValues(name, bad)).toEqual([]);
      await proveScannerLive(page, name);

      expectNoConsoleErrors(errors);
    });
  }
});

// 🔴 The one that matters most, and the one whose own fixture hides it.
//
// `memberSummary.spec.js` stubs the Edge Function with `classType:
// "Conditioning"` — a display string, and not what the column holds. The real
// payload is built from `class_instances.class_type`, which since session 21 is
// a catalogue KEY: `hiit`, or `gym-barre-ms4pk827` for a gym's own type.
//
// So the question "would a member see the key" cannot be answered by that
// spec's fixture. Asked here with the value the server would actually send.
// Today the answer is that `ClassSummary` never renders `classType` at all —
// which is fine, and is now a CONTRACT: put the class type on this page and you
// must put its label there, not its key. This is the only surface in the product
// a non-staff person ever sees.
const TOKEN = "v1.ZmFrZS1wYXlsb2Fk.ZmFrZS1zaWc";
const REAL_SHAPED_PAYLOAD = {
  gym: { name: "The Garage" },
  brand: { gymName: "The Garage", bg: "#120A0A", accent: "#FF6B35", text: "#F5EDE9", muted: "#9A8A84" },
  klass: {
    name: "Barre Flow",
    // What the column actually holds.
    classType: "gym-barre-ms4pk827",
    startsAt: "2026-07-23T18:00:00.000Z", coachName: "Priya", durationMin: 45,
  },
  content: {
    v: 1, title: "Barre Flow",
    stages: [
      { name: "Warm-Up", type: "warmup", durMin: 5, exercises: [{ n: "Light Jog", r: "5 min" }] },
      { name: "Main Set", type: "circuit", durMin: 25, exercises: [{ n: "Plie Pulse", s: "3", r: "20" }] },
    ],
  },
  publishedAt: "2026-07-23T19:05:00.000Z",
  expiresAt: 1_900_000_000,
};

test.describe("nor to a member, on the one page they ever see", () => {
  test("the class summary shows no catalogue key and no database id", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.route("**/functions/v1/summary-read", (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
                      body: JSON.stringify(REAL_SHAPED_PAYLOAD) }));

    // A member opens the link cold: about:blank first, so the second goto is a
    // real document load rather than a same-document fragment change.
    await page.goto("about:blank");
    await page.goto(`./#s=${TOKEN}`);
    await expect(page.getByTestId("summary-ready"),
      "precondition: the summary rendered, so there is something to scan").toBeVisible();
    await expect(page.getByText("Barre Flow").first()).toBeVisible();

    const bad = await rawValues(page);
    expect(bad, reportRawValues("member summary", bad)).toEqual([]);
    await proveScannerLive(page, "member summary");

    expectNoConsoleErrors(errors);
  });
});
