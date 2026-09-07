import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// ── The Class Runner's transport ─────────────────────────────────────────────
//
// The coach's primary surface while a room full of people is watching. It had no
// dedicated spec, and the reason it went unnoticed is instructive: every control
// here is icon-only, so until session 12 gave them accessible names there was no
// way for a test to REFER to one. The accessible-name sweep in `screens.spec.js`
// is what made this file writable, and writing it immediately found a defect.
//
// THE DEFECT. The back button was wired to `onNextStage` — the same handler as
// forward. There was no previous-stage handler in the app at all. A coach who
// advanced too early and reached for "back" moved the room ANOTHER stage on, and
// both buttons render a correct-looking arrow either way.

const stageCounter = (page) => page.getByText(/^\d+\/\d+$/).first();

test.describe("the coach can move the class in both directions", () => {
  test("the back button goes back a stage, not forward", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");

    // The default plan: five stages, starting on the first.
    await expect(stageCounter(page)).toHaveText("1/5");
    // Nothing to go back to yet, so the control is absent rather than inert.
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(0);

    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("2/5");

    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("3/5");

    // THE ASSERTION. This read 4/5 before the fix — the room was pushed further
    // into the class by the control that exists to pull it back.
    await page.getByRole("button", { name: "Previous stage" }).click();
    await expect(stageCounter(page)).toHaveText("2/5");

    await page.getByRole("button", { name: "Previous stage" }).click();
    await expect(stageCounter(page)).toHaveText("1/5");
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(0);

    expectNoConsoleErrors(errors);
  });

  test("does not run off either end of the plan", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    // Forward to the last stage; the forward control then disappears too, so
    // neither end can be walked past.
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next stage" }).click();
    await expect(stageCounter(page)).toHaveText("5/5");
    await expect(page.getByRole("button", { name: "Next stage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous stage" })).toHaveCount(1);
  });

  // The play/pause control is the single biggest thing on the screen and had no
  // name at all. A static "Play/pause" would not be enough either: the name has
  // to say which state a press produces, or it describes nothing.
  test("the primary control announces what pressing it will do", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible();
    await page.getByRole("button", { name: "Start class" }).click();
    await expect(page.getByRole("button", { name: "Pause class" })).toBeVisible();
    await page.getByRole("button", { name: "Pause class" }).click();
    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible();
  });

  // The music subsystem is CUT (audit 2.1, FLAGS.music=false), and every visible
  // music surface was removed — but the Runner's "S" keyboard shortcut kept its
  // own way in. Pressing "s" mid-class opened a Spotify track search over the
  // running class: a genre/BPM picker and a "Song, artist, album…" box for a
  // service this product does not use, on the one screen a coach is looking at
  // while a room watches. Invisible to every existing test because no test
  // presses a key that is not on a button.
  //
  // The same missing guard is why 21 KB of Spotify UI could not be folded out of
  // the main chunk — rollup cannot eliminate a component that an unguarded state
  // flag can still reach.
  //
  // SCOPE OF THIS TEST, measured rather than assumed. The fix added TWO
  // independent guards — one on the shortcut, one on the modal mount — and
  // either alone prevents the modal, so removing just one does NOT fail this
  // test. It fails when both are gone, which is the state the defect was
  // actually found in. That is deliberate: the shortcut guard is the behavioural
  // fix and the mount guard is what lets rollup drop the chunk, so they are not
  // redundant copies of one another and neither should be deleted as "already
  // covered".
  test("no keyboard shortcut can reach the cut music subsystem", async ({ page }) => {
    const errors = watchConsole(page);

    // "M" armed mic-mode, whose whole job is ducking the music player's volume.
    // With music cut the player is permanently null, so it asked the coach for
    // MICROPHONE PERMISSION mid-class and then analysed room audio in a rAF loop
    // to duck nothing. Record the request rather than the UI: a permission
    // prompt has no accessible name to assert on, and the browser may or may not
    // surface one depending on policy.
    await page.addInitScript(() => {
      window.__gum = [];
      const md = navigator.mediaDevices;
      if (md && md.getUserMedia) {
        md.getUserMedia = (c) => { window.__gum.push(c); return Promise.reject(new Error("blocked by test")); };
      }
    });

    await freshApp(page);
    await nav(page, "Class Runner");

    await page.keyboard.press("s");
    await expect(page.getByText("Add track to stage")).toHaveCount(0);
    await expect(page.getByPlaceholder("Song, artist, album…")).toHaveCount(0);

    // Uppercase is a separate branch in the handler, so it is a separate press.
    await page.keyboard.press("S");
    await expect(page.getByText("Add track to stage")).toHaveCount(0);

    await page.keyboard.press("m");
    await page.keyboard.press("M");
    expect(await page.evaluate(() => window.__gum.length),
      "pressing M requested the microphone with music cut").toBe(0);

    // The guard must be narrow: the sibling shortcuts in the same handler still
    // have to work, or this "fix" has broken the transport it sits next to.
    await expect(stageCounter(page)).toHaveText("1/5");
    await page.keyboard.press("n");
    await expect(stageCounter(page)).toHaveText("2/5");

    expectNoConsoleErrors(errors);
  });
});

// ── The transport's keyboard shortcuts ───────────────────────────────────────
//
// The Runner binds its shortcuts on `window`, which is right for a screen whose
// whole premise is that the coach's hands are busy — but `window` hears
// everything, including keys pressed inside a dialog on top of it.
//
// 🔴 THE DEFECT. `useDialog` stops propagation for Escape ONLY, so every other
// key reached the transport while the check-in panel was open. Focusing its
// "Done" button and pressing Space — simply how you activate a focused button —
// STARTED THE CLASS. Pressing "n" advanced the room a stage. Both happen behind
// a dialog the coach is looking at, with a room watching, and neither is
// recoverable in the moment.
//
// ⚠️ Two ways to write this test wrongly, both of which pass against the bug:
// pressing the key with focus on the dialog's INPUT (already guarded, and has
// been since session 12), or asserting the dialog is still open (it is either
// way — the damage is behind it). Focus has to be on a BUTTON, and the assertion
// has to be about the transport.
test.describe("keyboard shortcuts", () => {
  const isPlaying = (page) => page.getByRole("button", { name: "Pause class" }).count();

  // The POSITIVE CONTROL for the two tests below, kept as its own test rather
  // than a preamble inside them. Without it, "the key did nothing while a dialog
  // was open" is equally true of a shortcut that never worked at all.
  test("Space starts and pauses the class", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");
    // ⚠️ `nav()` leaves focus on the button it clicked, so Space would activate
    // the sidebar's "Class Runner" as well as firing the shortcut. Chromium
    // keeps a sequential-focus starting point that blur() does not reset; this
    // is what does.
    await page.evaluate(() => {
      document.body.setAttribute("tabindex", "-1");
      document.body.focus();
    });

    await page.keyboard.press("Space");
    await expect.poll(() => isPlaying(page), { message: "Space must start the class" }).toBe(1);
    await page.keyboard.press("Space");
    await expect.poll(() => isPlaying(page), { message: "Space must pause it again" }).toBe(0);
  });

  test("a dialog swallows the transport keys instead of passing them through", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");

    const before = await stageCounter(page).textContent();
    const openCheckIn = async () => {
      await page.getByRole("button", { name: /Check in/ }).first().click();
      const d = page.getByRole("dialog", { name: "Check in" });
      await expect(d).toBeVisible();
      // "Done" — the dialog's first control, and the one a coach's Space is
      // actually aimed at.
      await d.getByRole("button").first().focus();
      return d;
    };

    // SPACE. It activates the focused button, which closes the dialog — that is
    // the button working and is expected. What must NOT also happen is the
    // class starting behind it.
    await openCheckIn();
    await page.keyboard.press("Space");
    expect(await isPlaying(page), "Space on a dialog button must not start the class").toBe(0);

    // N / P / arrows do not activate a button, so the dialog stays open and both
    // halves are assertable: it is still there, and the room has not moved.
    const dialog = await openCheckIn();
    await page.keyboard.press("n");
    await page.keyboard.press("p");
    await page.keyboard.press("ArrowRight");
    await expect(dialog, "a plain letter key must not dismiss the dialog either").toBeVisible();
    expect(await stageCounter(page).textContent(),
      "a key pressed inside a dialog must not move the room").toBe(before);

    expectNoConsoleErrors(errors);
  });

  test("P goes back a stage — N shipped without a partner", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    await expect(stageCounter(page)).toHaveText("1/5");
    await page.keyboard.press("n");
    await expect(stageCounter(page)).toHaveText("2/5");
    await page.keyboard.press("p");
    await expect(stageCounter(page)).toHaveText("1/5");
  });

  test("the shortcuts are written down where the coach can see them", async ({ page }) => {
    // A shortcut nobody is told about is not a feature. The legend is desktop
    // only — there is no keyboard at 390px, and advertising keys that cannot be
    // pressed is the same dishonest furniture as a panel that can never fill.
    await freshApp(page);
    await nav(page, "Class Runner");
    for (const k of ["Space", "N", "P", "← →"]) {
      await expect(page.getByRole("group").or(page.locator("kbd")).filter({ hasText: k }).first(),
        `the legend must name ${k}`).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await page.locator("nav").first().getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator("kbd")).toHaveCount(0);
  });
});

// ── §3.6 · the screen that advances itself, announced ────────────────────────
//
// The Runner changes on a clock, and none of it reached a screen reader. A coach
// running the room from a phone in their pocket with VoiceOver on got silence
// between pressing play and looking down — the one thing this screen exists to
// avoid.
//
// 🔴 The polish list asked for the STAGE AND TIMER to be live, and the timer half
// is a trap worth keeping written down. `remaining` changes every second, so a
// live region around it queues ~1,800 announcements in a 30-minute class and
// talks over everything else the coach's phone needs to say. Worse than silence.
// The region carries what is DISCRETE and changes when something has actually
// happened.
test.describe("the runner announces itself", () => {
  const region = (page) => page.getByTestId("runner-live-region");

  test("the stage change is announced; the ticking timer is not", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    const live = region(page);
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveAttribute("role", "status");

    // It names where in the plan the coach is, not just the stage's title —
    // "Warm-Up" alone does not say whether the class has started or is ending.
    await expect(live).toContainText("Stage 1 of 5");
    const first = await live.textContent();

    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(live).toContainText("Stage 2 of 5");
    expect(await live.textContent(),
      "the announcement must change when the stage does").not.toBe(first);

    // THE TIMER MUST NOT BE IN IT. This is the assertion that stops a later
    // "improvement" turning the region into a per-second announcement — the
    // failure mode is invisible to every other test and only audible to the
    // person it hurts.
    await expect(live, "the region must not carry a value that ticks")
      .not.toContainText(/\d+:\d\d/);
  });

  test("the region is mounted before it has anything to say", async ({ page }) => {
    // A live region inserted into the DOM at the same moment as its text is
    // frequently not announced at all — assistive tech has to be observing the
    // node before the content changes. Same rule as the toast primitive.
    await freshApp(page);
    await nav(page, "Class Runner");
    await expect(region(page)).toHaveCount(1);

    // And it is invisible: this is an announcement, not a caption.
    const box = await region(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(2);
    expect(box.height).toBeLessThanOrEqual(2);
  });
});

// ─── The class a coach just taught, and whether it was written down ─────────
//
// 🔴 TWO DEFECTS, ONE CONSEQUENCE. The Dashboard tells a new gym, in its
// three-step onboarding, that "the class history — and every number on this
// page — writes itself from here". Measured in the running app, it did not.
//
//   1. A CLASS RUN TO ITS NATURAL END RECORDED NOTHING. `saveSession` read
//      `liveState` out of a closure, and the timer effect that calls it depends
//      on `[view, liveState.playing, player]` — so the copy the interval
//      captured is the one from the render where playback STARTED: idx 0,
//      elapsed 0. `totalElapsed` was 0 and the ten-second floor threw the class
//      away. Driven on a two-stage class: the board said "Stage 2 of 2", the
//      transport had stopped, and `jungle_history` was `[]`.
//   2. LEAVING BY THE SIDEBAR RECORDED NOTHING. The Back arrow and Escape both
//      call `saveSession`; `navTo` — which already knew it was leaving the
//      runner, since it pauses the stereo and stops the clock — did not. Nor did
//      the Plan board's Esc, which exits to the Builder exactly as Back does.
//
// What hid both is that the Back arrow works. A coach who backs out gets their
// session; a coach who lets the class end, or who taps "Dashboard", does not.
//
// ⚠️ These assert the STORED array, not a rendered list. The record feeds the
// Dashboard's Recent Sessions, ProfileModal's streak and the server insert in
// `appendSessionHistory`, and a screen that renders correctly over a missing
// row is a different defect wearing the same face.
test.describe("the session a coach taught is written down", () => {
  const history = (page) => page.evaluate(() =>
    JSON.parse(localStorage.getItem("jungle_history") || "[]"));

  // Two stages of seven seconds. Long enough to clear `saveSession`'s
  // ten-second floor (14s), short enough to run to its natural end in a test.
  const TINY = [
    { id:"a", type:"warmup",   name:"A", dur:7, exercises:[{n:"X",r:"1"}], tracks:[] },
    { id:"b", type:"cooldown", name:"B", dur:7, exercises:[{n:"Y",r:"1"}], tracks:[] },
  ];

  async function openRunner(page, stages = null) {
    await freshApp(page);
    if (stages) {
      await page.evaluate((st) => localStorage.setItem("jungle_draft_class",
        JSON.stringify({ name: "Tiny", classChoice: null, stages: st })), stages);
      await page.reload();
    }
    await nav(page, "Class Runner");
    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible();
  }

  // Advance one whole stage so `totalElapsed` clears the floor without waiting.
  async function advanceOneStage(page) {
    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(page.locator("body")).toContainText("Stage 2 of 5");
  }

  test("🔴 a class run to its natural end is recorded", async ({ page }) => {
    await openRunner(page, TINY);
    expect(await history(page), "precondition: nothing recorded yet").toEqual([]);

    await page.getByRole("button", { name: "Start class" }).click();
    // POSITIVE CONTROL: the class really finished — last stage, and the
    // transport is back to "Start class" because the runner stopped itself.
    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("body")).toContainText("Stage 2 of 2");

    const h = await history(page);
    expect(h, "the class ended and nothing was written").toHaveLength(1);
    expect(h[0].name).toBe("Tiny");
    expect(h[0].stages).toBe(2);
  });

  test("🔴 finishing and then closing writes ONE record, not two", async ({ page }) => {
    // The other side of the same fix: `saveSession` now has two live callers, so
    // without a per-run guard a finished class would be counted twice — in
    // Recent Sessions, in the streak, and on the server.
    await openRunner(page, TINY);
    await page.getByRole("button", { name: "Start class" }).click();
    await expect(page.getByRole("button", { name: "Start class" })).toBeVisible({ timeout: 25_000 });
    expect(await history(page)).toHaveLength(1);

    await page.getByRole("button", { name: "Back to class plan" }).click();
    expect(await history(page), "the finished class was recorded twice").toHaveLength(1);
  });

  for (const [name, leave] of [
    ["the Back arrow", async (page) => page.getByRole("button", { name: "Back to class plan" }).click()],
    ["Escape",         async (page) => page.keyboard.press("Escape")],
    ["the sidebar",    async (page) => nav(page, "Dashboard")],
    ["the Room TV plan board", async (page) => {
      await page.getByRole("button", { name: /Room TV/ }).click();
      await expect(page.getByRole("button", { name: /^Exit$/ })).toBeVisible();
      await page.keyboard.press("Escape");
    }],
  ]) {
    test(`leaving the runner by ${name} records the class`, async ({ page }) => {
      await openRunner(page);
      await advanceOneStage(page);
      expect(await history(page), "precondition: nothing recorded yet").toEqual([]);

      await leave(page);
      await expect.poll(() => history(page).then(h => h.length),
        { message: `leaving by ${name} lost the class` }).toBe(1);
    });
  }

  test("opening the runner and leaving again records nothing", async ({ page }) => {
    // The ten-second floor still holds. A coach who looks at the plan and walks
    // away has not taught a class, and a row saying they did is worse than none.
    await openRunner(page);
    await nav(page, "Dashboard");
    await page.waitForTimeout(300);
    expect(await history(page)).toEqual([]);
  });
});
