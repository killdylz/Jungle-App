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
    // DEC-12 resolved (session 14): "Preview on TV" is now ONE control. It used
    // to be two — the labelled button plus a top-bar chevron wired to the same
    // handler while dressed as Back — so the count is the assertion.
    await expect(page.getByRole("button", { name: "Preview on TV" })).toHaveCount(1);
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

  // DEC-12. The Builder's top-bar chevron sat where every other screen puts
  // Back, drew a back chevron, and opened the Room TV preview instead. A coach
  // reaching for Back got a full-screen display board and had to find their way
  // out of it. Both halves are asserted: the chevron goes back, AND it does not
  // land on the TV — testing only the first would pass if it did both.
  test("the Builder's back chevron goes back, not to the TV", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await nav(page, "Class Builder");
    await expect(page.getByRole("button", { name: "Rename class" })).toBeVisible();

    await page.getByRole("button", { name: "Back", exact: true }).click();

    await expect(page.getByText(/GOOD (MORNING|AFTERNOON|EVENING), COACH/)).toBeVisible();
    // The inverse half. "N stages" is NOT the tell — the Dashboard's resume-
    // building card renders that too, and using it here produced a failing test
    // against correct code. What actually distinguishes the Room TV board is
    // that it is full-screen: the sidebar is gone and its only control is Esc.
    await expect(page.getByRole("button", { name: /Esc/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Class Builder", exact: true })).toBeVisible();

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
    // Identified by the stage card's own Remove control rather than by a bare
    // text match. `getByText("Primary Lift")` used to be unique and stopped
    // being so the moment the Builder grew a move-to-stage dropdown, whose
    // options legitimately carry every other stage's name — it resolved to
    // three elements and failed on strict mode. The Remove button's accessible
    // name is a STRONGER tell anyway: it proves the stage card rendered with
    // its controls, not merely that the string appears somewhere in the DOM.
    const stageCard = page.getByRole("button", { name: "Remove Primary Lift" });
    await expect(stageCard).toBeVisible();

    await page.reload();
    await nav(page, "Class Builder");
    await expect(stageCard).toBeVisible();

    const draft = await stored(page, "jungle_draft_class");
    expect(draft?.name).toBe("Iron Protocol");
    expect(draft.stages.map((s) => s.name)).toContain("Primary Lift");

    expectNoConsoleErrors(errors);
  });
});
