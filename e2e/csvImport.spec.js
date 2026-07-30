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
