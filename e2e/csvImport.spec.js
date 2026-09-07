import { test, expect } from "@playwright/test";
import { freshApp, nav, stored, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ─── The CSV attendance backfill, driven ─────────────────────────────────────
//
// The THIRD writer of `class_instances.class_type`, and the only one whose
// vocabulary we do not control: a foreign system's own "Type" column, verbatim.
// Session 21 gave `applyAttendanceImport` its optional `lib` parameter and
// `RosterScreen` passes `getLibrary()`, so an imported type resolves into the
// same vocabulary the Schedule and the Runner write. `store.test.js` pins that
// function; nothing had ever driven the SCREEN.
//
// It matters more than a test count suggests. This is how a gym's history
// arrives, it is what makes N2's cohort analytics possible at all, and it runs
// once — on a corpus nobody will re-key by hand if it lands wrong. It also
// creates members as a side effect, which is the only place in the product where
// a person's record is created by a file rather than by a coach.

const HEADER = "Member Name,Email,Date,Class,Type,Coach";
const ROWS = [
  "Sarah Chen,sarah@example.com,2026-03-04,Tuesday Burn,HIIT,Dylan",
  "Sarah Chen,sarah@example.com,2026-03-11,Tuesday Burn,HIIT,Dylan",
  "Marcus Lee,marcus@example.com,2026-03-04,Tuesday Burn,HIIT,Dylan",
  // A type the catalogue has never had — the old dropdown offered it and no
  // class type answers to it.
  "Priya K,priya@example.com,2026-03-06,Deep Stretch,Mobility,Mara",
  "Marcus Lee,marcus@example.com,2026-03-06,Deep Stretch,Mobility,Mara",
];
const CSV = [HEADER, ...ROWS].join("\n");

const paste = async (page, csv) => {
  await page.getByPlaceholder(/paste CSV here/i).fill(csv);
  await page.getByRole("button", { name: "Read the file" }).click();
};

test.describe("a gym brings its history across", () => {
  test("reads the file, and writes nothing until the coach says so", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");
    await paste(page, CSV);

    // The preview says exactly what the apply will do.
    await expect(page.getByText(/5 check-ins · 3 classes · 3 new members/)).toBeVisible();
    await expect(page.getByText(/New members: Sarah Chen, Marcus Lee, Priya K/)).toBeVisible();

    // 🔴 …and nothing is on disk yet. "Nothing is written until you review what
    // was read" is the promise the screen makes in its own copy.
    expect(await stored(page, "jungle_members"), "reading a file must not create members").toBeNull();
    expect(await stored(page, "jungle_class_instances")).toBeNull();
    expect(await stored(page, "jungle_attendance")).toBeNull();

    await page.getByRole("button", { name: /^Import 5 check-ins$/ }).click();
    await expect(page.getByText(/Imported 5 check-ins across 3 new classes, adding 3 members/)).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("an imported class type lands in the catalogue's vocabulary", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");
    await paste(page, CSV);
    await page.getByRole("button", { name: /^Import 5 check-ins$/ }).click();

    const ci = await expect.poll(async () => await stored(page, "jungle_class_instances"))
      .not.toBeNull().then(() => stored(page, "jungle_class_instances"));
    const typeOf = (name) => ci.filter(c => c.name === name).map(c => c.classType);

    // THE assertion. The old system wrote "HIIT"; the Runner writes "hiit"; a
    // column holding both is a column no `group by` reunites, and this is the
    // door the history arrives through.
    expect(typeOf("Tuesday Burn"), "a foreign 'HIIT' must arrive as the catalogue key")
      .toEqual(["hiit", "hiit"]);

    // 🔴 And the one that must NOT be mapped. No catalogue class type answers to
    // "Mobility", and inventing a near-neighbour would attribute programming to
    // a gym that it never chose — permanently, in an append-only table.
    expect(typeOf("Deep Stretch"),
      "an unrecognised type keeps its own text rather than being guessed at").toEqual(["Mobility"]);

    // Two dates of the same class name are two occurrences, not one.
    expect(ci.filter(c => c.name === "Tuesday Burn")).toHaveLength(2);
    // A backfilled row is distinguishable from a live check-in forever — which is
    // what stops Phase 2 reporting on data the studio never captured in Jungle.
    const att = await stored(page, "jungle_attendance");
    expect(att).toHaveLength(5);
    expect([...new Set(att.map(a => a.source))]).toEqual(["import"]);
  });

  // 🔴 The whole reason `applyAttendanceImport` takes a catalogue at all.
  //
  // A studio that authored "Barre" in Jungle and is importing a year of Barre
  // classes out of its old software must end up with ONE class type, not two —
  // its own key on the classes it teaches now and the string "Barre" on all the
  // history. `resolveClassType` matches on the LABEL as well as the key, which is
  // what makes a foreign export's own words land on the gym's own type.
  test("a foreign export's words land on the class type the gym authored", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);

    await nav(page, "Exercise Library");
    await page.getByRole("button", { name: /Edit/ }).first().click();
    page.once("dialog", (d) => d.accept("Barre"));
    await page.getByRole("button", { name: "+ New class type" }).click();
    await expect.poll(async () => await stored(page, "jungle_library_custom")).not.toBeNull();
    const gymKey = Object.keys((await stored(page, "jungle_library_custom")).classes)
      .find(k => k.startsWith("gym-"));
    await page.getByRole("button", { name: "Close" }).click();

    await nav(page, "Members");
    await paste(page, [HEADER, "Jo Marsh,jo@example.com,2026-03-07,Reformer Flow,Barre,Priya"].join("\n"));
    await page.getByRole("button", { name: /^Import 1 check-in$/ }).click();

    await expect.poll(async () =>
      (await stored(page, "jungle_class_instances"))?.[0]?.classType,
      { message: "the gym's own type must absorb its own history, not sit beside it" })
      .toBe(gymKey);

    expectNoConsoleErrors(errors);
  });

  // Running the same export twice is the normal case, not the exceptional one —
  // a coach re-exports a wider date range and imports it again. A duplicated
  // check-in would overstate attendance, and a duplicated occurrence would split
  // one class's history across two rows with nothing surfacing the split.
  test("importing the same file again writes nothing and says so", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");
    await paste(page, CSV);
    await page.getByRole("button", { name: /^Import 5 check-ins$/ }).click();
    await expect(page.getByText(/Imported 5 check-ins/)).toBeVisible();

    const before = {
      m: (await stored(page, "jungle_members")).length,
      c: (await stored(page, "jungle_class_instances")).length,
      a: (await stored(page, "jungle_attendance")).length,
    };
    expect(before, "precondition: the first import landed").toEqual({ m: 3, c: 3, a: 5 });

    await paste(page, CSV);
    await page.getByRole("button", { name: /^Import 5 check-ins$/ }).click();

    await expect(page.getByText(/5 were already recorded and were skipped/)).toBeVisible();
    expect({
      m: (await stored(page, "jungle_members")).length,
      c: (await stored(page, "jungle_class_instances")).length,
      a: (await stored(page, "jungle_attendance")).length,
    }, "a second import of the same file must add nothing").toEqual(before);
  });

  // A member created by a file, not by a coach. `joinedAt: ""` is deliberate and
  // documented in `store.test.js`: an importer does not know when somebody
  // joined, and stamping today would be a confident wrong date on every member a
  // gym has ever had.
  test("an imported member is active, and does not claim to have joined today", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");
    await paste(page, CSV);
    await page.getByRole("button", { name: /^Import 5 check-ins$/ }).click();

    const members = await expect.poll(async () => await stored(page, "jungle_members"))
      .not.toBeNull().then(() => stored(page, "jungle_members"));
    expect(members).toHaveLength(3);
    for (const m of members) {
      expect(m.status, `${m.name} must be active`).toBe("active");
      expect(m.joinedAt, `${m.name}: an importer does not know when they joined`).toBe("");
      expect(m.id, `${m.name} needs a real id`).toBeTruthy();
    }

    // …and they are on the roster, which is the only reason a coach did this.
    await expect(page.getByText("Sarah Chen")).toBeVisible();
    await expect(page.getByText("Marcus Lee")).toBeVisible();
  });

  // The preview refuses rather than guesses. A misparsed date lands a class on
  // the wrong day forever, so a file with no date column is rejected whole.
  test("a file it cannot read is refused, with the reason", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");
    await paste(page, "Member Name,Email\nSarah Chen,sarah@example.com");

    await expect(page.getByText(/No date column found/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Import / }),
      "there must be no way to apply a file that was not understood").toHaveCount(0);
    expect(await stored(page, "jungle_members")).toBeNull();

    expectNoConsoleErrors(errors);
  });
});

// ─── …and the history becomes the thing the gym is paying for ────────────────
//
// The commercial claim, in one journey: "quietly building the attendance record
// that shows who's about to quit." Both halves were tested and the JOIN was not
// — `winback.spec.js` seeds `jungle_attendance` directly, and the tests above
// stop at storage. So "does a real gym's imported history light up the at-risk
// list" had never been asked, and it is the first thing that happens at a pilot.
//
// Everything below passes. That is the finding: this path holds, including the
// two states a pilot gym will actually hit on day one.

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const importCsv = async (page, lines) => {
  await paste(page, lines.join("\n"));
  await page.getByRole("button", { name: /^Import \d+ check-ins?$/ }).click();
  await expect(page.getByText(/^Imported \d+ check-in/)).toBeVisible();
};

// Read the at-risk panel itself. ⚠️ This was `body.innerText.slice(i, i + 400)`
// from the "Who’s slipping away" heading, which was only ever a proxy for "the
// at-risk panel" — it worked while the next 400 characters happened to be the
// CSV panel's prose. The roster now renders directly below the at-risk card, so
// that window picked up every member's name and both callers failed on their own
// selector rather than on the rule they test.
const atRiskText = (page) => page.getByTestId("at-risk-panel").innerText();

test.describe("history becomes the thing the gym is paying for", () => {
  test("an imported lapse is flagged, with the numbers behind it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    await importCsv(page, [
      HEADER,
      // Still coming — must NOT be flagged.
      `Rita Chua,rita@example.com,${daysAgo(2)},Tuesday Burn,HIIT,Dylan`,
      `Rita Chua,rita@example.com,${daysAgo(9)},Tuesday Burn,HIIT,Dylan`,
      `Rita Chua,rita@example.com,${daysAgo(16)},Tuesday Burn,HIIT,Dylan`,
      // Was a regular, stopped 45 days ago — the whole point of the product.
      `Larry Tan,larry@example.com,${daysAgo(45)},Tuesday Burn,HIIT,Dylan`,
      `Larry Tan,larry@example.com,${daysAgo(52)},Tuesday Burn,HIIT,Dylan`,
      `Larry Tan,larry@example.com,${daysAgo(59)},Tuesday Burn,HIIT,Dylan`,
    ]);

    await expect(page.getByText(/1 member needs attention/)).toBeVisible();

    // The flag CARRIES ITS ARITHMETIC, which is the design: an owner has to be
    // able to argue with it rather than merely believe it.
    await expect(page.getByText(/Last attended 45 days ago, after 3 visits/)).toBeVisible();
    await expect(page.getByText(/more than 14 days away/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft a WhatsApp" })).toHaveCount(1);

    // And the member who is still turning up is not on the list. The count above
    // is the control for this: "nobody is flagged" and "the panel is broken"
    // would otherwise look the same.
    const panel = await atRiskText(page);
    expect(panel, "precondition: the at-risk panel rendered").toContain("Larry Tan");
    expect(panel, "a member who came 2 days ago is not slipping away").not.toContain("Rita Chua");

    expectNoConsoleErrors(errors);
  });

  // 🔴 The state a pilot gym hits on day one: import a year of history, check
  // nobody in yet. Every member is technically "absent", and flagging all of
  // them would be the confident wrong answer — the studio stopped recording, the
  // members did not stop coming.
  //
  // `studioActivity.recording` is the guard, and what matters here is that the
  // screen SAYS SO. An empty at-risk panel with no explanation reads as "nobody
  // is at risk", which is the opposite of the truth.
  test("stale history pauses the alerts and says why, rather than going quiet", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Members");

    await importCsv(page, [
      HEADER,
      `Rita Chua,rita@example.com,${daysAgo(40)},Tuesday Burn,HIIT,Dylan`,
      `Larry Tan,larry@example.com,${daysAgo(95)},Tuesday Burn,HIIT,Dylan`,
      `Larry Tan,larry@example.com,${daysAgo(102)},Tuesday Burn,HIIT,Dylan`,
    ]);

    // POSITIVE CONTROL: the import landed, so the panel has data to reason over.
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
    expect(await stored(page, "jungle_attendance")).toHaveLength(3);

    await expect(page.getByText(/absence alerts are paused/i)).toBeVisible();
    await expect(page.getByText(/resume once classes are being recorded again/i)).toBeVisible();
    // Naming the number is what turns "paused" from a shrug into an instruction.
    await expect(page.getByText(/last check-in was 40 days ago/i)).toBeVisible();
    // …and nobody is accused in the meantime.
    await expect(page.getByRole("button", { name: "Draft a WhatsApp" })).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  // A consequence of `joinedAt: ""` worth recording, because a pilot gym meets it
  // immediately and it looks like a missing feature: the NEW-MEMBER rule
  // ("fewer than 4 visits in month one") can never fire for an imported member.
  // Rule 1 is a claim about TENURE and may only run on a join date we actually
  // hold — an importer does not have one, and inferring it from the first
  // imported check-in would call a five-year regular a new member.
  //
  // The lapsed member in the same run is the control: the panel IS working.
  test("the new-member rule stays silent on a member whose tenure is unknown", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Members");

    await importCsv(page, [
      HEADER,
      // Two visits, most recent 2 days ago: inside the absence window, and few
      // enough visits that rule 1 would fire IF a join date were known.
      `Nia Ong,nia@example.com,${daysAgo(2)},Tuesday Burn,HIIT,Dylan`,
      `Nia Ong,nia@example.com,${daysAgo(6)},Tuesday Burn,HIIT,Dylan`,
      // The control.
      `Larry Tan,larry@example.com,${daysAgo(45)},Tuesday Burn,HIIT,Dylan`,
    ]);

    expect((await stored(page, "jungle_members")).every(m => m.joinedAt === ""),
      "precondition: an imported member has no join date").toBe(true);

    const panel = await atRiskText(page);
    expect(panel, "control: the at-risk panel is working in this very run").toContain("Larry Tan");
    expect(panel, "a member of unknown tenure must not be called a lapsing newcomer")
      .not.toContain("Nia Ong");
  });
});
