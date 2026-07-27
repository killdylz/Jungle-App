import { test, expect } from "@playwright/test";
import { freshApp, enterPin, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// REGRESSION-PLAN §1, test 6 — the smoke path.
//
// "PIN → Dashboard → Builder → Runner → play → Check-in → Room TV, assert no
// console errors." It is listed last in the plan and written first here, because
// it is the one that catches the white-screen class of failure: an identifier
// that resolves and then throws at render, which `lint:crash` cannot see and
// `vite build` compiles happily. That exact failure has reached the live site.

test.describe("smoke: the path a coach walks every class", () => {
  test("PIN → Dashboard → Builder → Runner → Check-in → Room TV", async ({ page }) => {
    const errors = watchConsole(page);

    // ── PIN ──
    await freshApp(page, { pin: true });
    await expect(page.getByText("Enter your PIN to continue")).toBeVisible();
    await enterPin(page);

    // ── Dashboard ──
    await expect(page.getByText(/GOOD (MORNING|AFTERNOON|EVENING), COACH/)).toBeVisible();

    // The music quarantine is part of the product now, so the smoke path guards
    // it: an accidental FLAGS.music=true would put a dead Auto-DJ card back on
    // the first screen a gym owner sees.
    await expect(page.getByText("AUTO-DJ")).toHaveCount(0);

    // ── Builder ──
    await nav(page, "Class Builder");
    // `.first()`: the Builder has TWO controls for this one action — the labelled
    // button, and a top-bar left-chevron wired to the same handler while dressed
    // as the Back button every other screen puts in that exact spot. The chevron
    // was invisible to this suite until session 12's sweep gave it a name, which
    // is how the duplication surfaced. Left in place; whether to drop it or make
    // it navigate is a design call (see the note at its definition in App.jsx).
    await expect(page.getByRole("button", { name: "Preview on TV" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /DJ This Class/ })).toHaveCount(0);

    // ── Runner ──
    await nav(page, "Class Runner");
    await expect(page.getByText("ELAPSED")).toBeVisible();
    // `exact` matters: "STAGE" also matches "5 stages · 40:00 total".
    await expect(page.getByText("STAGE", { exact: true })).toBeVisible();
    // The runner's Auto-DJ tab and its permanent "No music playing" status line.
    await expect(page.getByRole("button", { name: "Auto-DJ" })).toHaveCount(0);
    await expect(page.getByText("No music playing")).toHaveCount(0);

    // ── Check-in: the attendance spine's capture surface ──
    await page.getByRole("button", { name: /Check in/ }).first().click();
    const name = "Smoke Test Member";
    await page.getByPlaceholder(/name/i).first().fill(name);
    await page.getByRole("button", { name: new RegExp(`Add .*${name}`) }).click();

    // Assert the STORED object, not the rendered one. A check-in that shows on
    // screen and never reaches localStorage is precisely the defect shape this
    // repo keeps producing, and it is invisible to a rendered-text assertion.
    await expect
      .poll(async () => (await stored(page, "jungle_members"))?.map((m) => m.name) ?? [])
      .toContain(name);
    const attendance = await stored(page, "jungle_attendance");
    expect(attendance).toHaveLength(1);
    // `source` is CHECK-constrained in Postgres. A wrong value here syncs into a
    // rejection — this repo's recurring data-loss bug, three occurrences.
    expect(attendance[0].source).toBe("coach");

    await page.getByRole("button", { name: "Done" }).click();

    // ── Room TV: the surface a MEMBER sees ──
    await page.getByRole("button", { name: /Room TV/ }).click();
    // Stage text from the default class must actually render on the display —
    // "the TV shows the plan" is the whole product promise in one assertion.
    await expect(page.getByText("Warm-Up").first()).toBeVisible();
    await expect(page.getByText(/\d+ stages/)).toBeVisible();

    // Nothing on a member-facing screen may advertise an internal absence.
    await expect(page.getByText(/No tracks|0 tracks/)).toHaveCount(0);

    // ── The FLOOR board, which is the surface members actually read mid-class ──
    // It used to carry two panels promising features that do not exist, both
    // phrased as instructions to the COACH ("Set a weekly benchmark WOD",
    // "Connect a wearable/erg feed") while facing a room full of members. Same
    // rule as the "No tracks" cut above, on the surface where it matters most.
    // The mode switch is a TRANSIENT overlay that hides itself after 4.5s (Fable
    // P1/P2 — the running surface keeps the whole screen). That is deliberate, so
    // wake it the way a coach does rather than working around it: without this the
    // click lands on a detaching element and the failure reads like a flake.
    await page.mouse.move(640, 400);
    await page.getByRole("button", { name: "Floor", exact: true }).click();
    await expect(page.getByText(/clockwise · \d+ stations/)).toBeVisible();

    for (const promise of [/coming soon/i, /benchmark of the week/i, /avg watts/i,
                           /connect a wearable/i, /set a weekly benchmark/i]) {
      await expect(page.getByText(promise)).toHaveCount(0);
    }

    expectNoConsoleErrors(errors);
  });

  test("the class a coach built survives a reload", async ({ page }) => {
    // Session 5 found `stages`/`sessionName` were plain useState with no
    // persistence: plan a class, close the tab, lose it — behind a Dashboard
    // button offering to "Resume building" it. Unit tests cover the store; this
    // covers the wiring, which is where it was actually broken.
    const errors = watchConsole(page);
    await freshApp(page);

    await nav(page, "Class Builder");
    // Selected by option VALUE (the preset's id), not its label: the label
    // carries an emoji, and matching emoji in a selector is a flake waiting to
    // happen the first time someone changes one.
    await page.getByTitle(/ready-made Jungle class/).selectOption("t2");
    await expect(page.getByText("Primary Lift")).toBeVisible();

    await page.reload();
    await nav(page, "Class Builder");
    await expect(page.getByText("Primary Lift")).toBeVisible();

    const draft = await stored(page, "jungle_draft_class");
    expect(draft?.name).toBe("Iron Protocol");
    expect(draft.stages.map((s) => s.name)).toContain("Primary Lift");

    expectNoConsoleErrors(errors);
  });
});
