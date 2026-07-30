import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";
import { unnamedButtons, symbolOnlyButtons, namelessFields } from "./a11yScan.js";

// ── N4 — the member magic-link summary ───────────────────────────────────────
//
// The only member-facing surface in the product, and the only screen in the app
// that renders for somebody with no account. Two things are being tested here
// and the first one is structural:
//
//   1. THE PAGE RENDERS AT ALL. main.jsx branches on the URL fragment BEFORE
//      AuthGate. Get that wrong and, on the live site, a member tapping their
//      link is shown a staff login wall — which is invisible locally, because
//      the credential-less build has no AuthGate wall to hit. So the assertion
//      is "no app shell, and no sign-in", not just "the summary is there".
//   2. EVERY FAILURE STATE SAYS SOMETHING TRUE. A member cannot debug a link.
//      Expired, forged, deleted and offline are four different problems and
//      three of them have different remedies.
//
// The Edge Function cannot run locally (no Supabase, and functions deploy by
// Dylan pasting them into a dashboard), so its RESPONSES are stubbed here. The
// function's own logic is covered by the token unit tests and the mirror test;
// what these tests own is everything downstream of the response.

const TOKEN = "v1.ZmFrZS1wYXlsb2Fk.ZmFrZS1zaWc";

const PAYLOAD = {
  gym: { name: "The Garage" },
  brand: { gymName: "The Garage", bg: "#120A0A", accent: "#FF6B35", text: "#F5EDE9", muted: "#9A8A84" },
  klass: {
    // The catalogue KEY, because that is what `summary-read` selects out of
    // `class_instances.class_type` and hands to this page. It read
    // "Conditioning" — a display string the column has not held since session 21
    // — which meant this fixture could never have shown a raw key reaching a
    // member. Nothing here renders `classType` today; `e2e/rawValues.spec.js`
    // is what keeps that true, with a `gym-` key in the payload.
    name: "Thursday Engine", classType: "conditioning",
    startsAt: "2026-07-23T18:00:00.000Z", coachName: "Priya", durationMin: 45,
  },
  content: {
    v: 1,
    title: "Thursday Engine",
    stages: [
      { name: "Warm-Up", type: "warmup", durMin: 5, exercises: [{ n: "Light Jog", r: "5 min" }] },
      { name: "Circuit Blast", type: "circuit", durMin: 10,
        exercises: [{ n: "Burpee Complex", s: "3", r: "10", rest: "30s" }, { n: "Box Jump", s: "3", r: "8" }] },
    ],
  },
  publishedAt: "2026-07-23T19:05:00.000Z",
  expiresAt: 1_900_000_000,
};

// Stub the Edge Function. `status`/`body` per test; `onRequest` lets a test
// inspect what actually went over the wire.
async function stubSummary(page, { status = 200, body = PAYLOAD, abort = false, onRequest } = {}) {
  await page.route("**/functions/v1/summary-read", async (route) => {
    onRequest?.(route.request());
    if (abort) return route.abort("failed");
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

// A member opens the link COLD — from a chat app, into a fresh tab. That has to
// be a real document load: changing only the fragment is a same-document
// navigation, so `goto` alone leaves the previously-loaded app running and the
// summary page never mounts. Probed and confirmed, and it is the reason
// main.jsx also reloads on a hashchange that carries a token.
// Via about:blank so the second goto is a real DOCUMENT load. Going straight
// from the app to `./#s=…` changes only the fragment, which is a same-document
// navigation — main.jsx never re-runs. (An explicit page.reload() afterwards
// races the app's own hashchange reload and times out, so this is the version
// that is both honest and stable.)
const openLink = async (page, token = TOKEN) => {
  await page.goto("about:blank");
  await page.goto(`./#s=${token}`);
};

test.describe("a member opens their class link", () => {
  test("renders the class with no sign-in and no app shell", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await stubSummary(page);
    await openLink(page);

    await expect(page.getByTestId("summary-ready")).toBeVisible();

    // 🔴 THE STRUCTURAL ASSERTION. On the live site AuthGate would otherwise
    // intercept this. Nothing belonging to the staff app may be on screen.
    await expect(page.getByRole("button", { name: "Class Runner", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Schedule", exact: true })).toHaveCount(0);
    await expect(page.getByText(/sign in/i)).toHaveCount(0);

    // The class, as a member reads it.
    await expect(page.getByRole("heading", { level: 1, name: "Thursday Engine" })).toBeVisible();
    await expect(page.getByText("The Garage")).toBeVisible();
    await expect(page.getByText(/with Priya/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Circuit Blast" })).toBeVisible();
    await expect(page.getByText("Burpee Complex")).toBeVisible();
    await expect(page.getByText("3 × 10, rest 30s")).toBeVisible();
    // Box Jump has sets and reps but no rest — the detail line must not invent one.
    await expect(page.getByText("3 × 8", { exact: true })).toBeVisible();

    // 15 minutes across two stages, three... two distinct movements.
    await expect(page.getByText(/15 min/)).toBeVisible();
    await expect(page.getByText(/3 movements/)).toBeVisible();

    expectNoConsoleErrors(errors);
  });

  test("wears the gym's colours, not Jungle's", async ({ page }) => {
    await freshApp(page);
    await stubSummary(page);
    await openLink(page);
    await expect(page.getByTestId("summary-ready")).toBeVisible();

    const bg = await page.getByTestId("summary-ready").evaluate(el => getComputedStyle(el).backgroundColor);
    // #120A0A from the payload's brand snapshot, NOT the #0A0F0C fallback. If the
    // brand were ignored this would be the default and the white-label claim
    // would be false on the one screen a member sees.
    expect(bg).toBe("rgb(18, 10, 10)");

    // Whose page this is. A Jungle mark here would be us taking the gym's
    // audience — the same rule the share card follows.
    await expect(page.getByText(/jungle/i)).toHaveCount(0);
  });

  test("never puts the token in a URL, and posts it in the body", async ({ page }) => {
    let seen = null;
    await freshApp(page);
    await stubSummary(page, { onRequest: (req) => { seen = { url: req.url(), method: req.method(), body: req.postData() }; } });
    await openLink(page);
    await expect(page.getByTestId("summary-ready")).toBeVisible();

    expect(seen).not.toBeNull();
    expect(seen.method).toBe("POST");
    // A bearer credential in a query string lands in server logs and leaks via
    // the Referer header. This is the assertion that keeps it out of both.
    expect(seen.url).not.toContain(TOKEN);
    expect(seen.url).not.toContain("?");
    expect(JSON.parse(seen.body).token).toBe(TOKEN);
  });

  test("shows nothing about any person, even when the response carries some", async ({ page }) => {
    await freshApp(page);
    // A response with member-shaped fields the page has no business rendering.
    // The page is an allow-list of known fields; this proves that in the DOM
    // rather than in a comment.
    await stubSummary(page, { body: {
      ...PAYLOAD,
      attendees: ["Priya Menon", "Sam Wu"],
      members: [{ name: "Priya Menon", email: "priya@example.com" }],
      content: { ...PAYLOAD.content, checkedIn: ["Priya Menon"] },
    } });
    await openLink(page);
    await expect(page.getByTestId("summary-ready")).toBeVisible();

    const text = await page.locator("body").innerText();
    expect(text).not.toContain("Priya Menon");
    expect(text).not.toContain("Sam Wu");
    expect(text).not.toContain("priya@example.com");
    // The coach's name IS shown — it is on the schedule already and is not what
    // this test is about. Asserting it here stops the test passing because the
    // page rendered nothing at all.
    expect(text).toContain("Priya");
  });

  test("still shows the class when no breakdown was published", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    // What a link looks like before migration 0009 is run.
    await stubSummary(page, { body: { ...PAYLOAD, content: null } });
    await openLink(page);

    await expect(page.getByTestId("summary-no-content")).toBeVisible();
    // The facts that live on class_instances survive; only the movements are gone.
    await expect(page.getByRole("heading", { level: 1, name: "Thursday Engine" })).toBeVisible();
    await expect(page.getByText(/45 min/)).toBeVisible();
    await expect(page.getByText("Burpee Complex")).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("has no unnamed controls or nameless fields", async ({ page }) => {
    await freshApp(page);
    await stubSummary(page);
    await openLink(page);
    await expect(page.getByTestId("summary-ready")).toBeVisible();

    expect(await unnamedButtons(page)).toEqual([]);
    expect(await symbolOnlyButtons(page)).toEqual([]);
    expect(await namelessFields(page)).toEqual([]);
  });
});

test.describe("a link that cannot be honoured says which problem it is", () => {
  const cases = [
    ["expired",   { status: 401, body: { error: "invalid", reason: "expired" } },        /expired/i,        "summary-error-expired"],
    ["forged",    { status: 401, body: { error: "invalid", reason: "bad-signature" } },  /isn't valid/i,    "summary-error-bad-signature"],
    ["malformed", { status: 401, body: { error: "invalid", reason: "malformed" } },      /isn't valid/i,    "summary-error-malformed"],
    ["deleted",   { status: 404, body: { error: "not-found" } },                          /no longer available/i, "summary-error-not-found"],
  ];

  for (const [label, stub, copy, testid] of cases) {
    test(`${label}`, async ({ page }) => {
      const errors = watchConsole(page);
      await freshApp(page);
      await stubSummary(page, stub);
      await openLink(page);

      await expect(page.getByTestId(testid)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy);
      // Not the success page wearing an error hat.
      await expect(page.getByTestId("summary-ready")).toHaveCount(0);
      // Only the network case offers a retry — retrying an expired token forever
      // is a control that cannot work.
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
      // Chromium logs its own line for every non-2xx response, so a DELIBERATE
      // 401/404 always produces one. Filtering just that keeps the assertion
      // that the error path did not additionally throw — which is the thing
      // worth guarding, and would otherwise have to be dropped entirely.
      expectNoConsoleErrors(errors.filter(e => !/Failed to load resource/.test(e)));
    });
  }

  test("a dropped connection offers a retry, and the retry works", async ({ page }) => {
    await freshApp(page);
    await stubSummary(page, { abort: true });
    await openLink(page);

    await expect(page.getByTestId("summary-error-network")).toBeVisible();
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();

    // Signal comes back. The retry must actually re-fetch — a button that only
    // re-renders the same failed state is a fake affordance.
    await page.unroute("**/functions/v1/summary-read");
    await stubSummary(page);
    await retry.click();
    await expect(page.getByTestId("summary-ready")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Thursday Engine" })).toBeVisible();
  });
});

test.describe("the fragment does not leak into the staff app", () => {
  test("no token means the normal app, untouched", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.goto("./");
    // The app, not the summary page.
    await expect(page.getByTestId("summary-ready")).toHaveCount(0);
    await nav(page, "Class Runner");
    expectNoConsoleErrors(errors);
  });

  test("pasting a link into a tab that already has the app open still works", async ({ page }) => {
    await freshApp(page);
    await stubSummary(page);
    await nav(page, "Class Runner");

    // Same-document navigation: the browser does not re-run main.jsx, so
    // without the hashchange reload this leaves the coach staring at the Runner
    // and concluding the link is broken. Whoever verifies this feature will do
    // exactly this before they try it on a phone.
    await page.evaluate((t) => { window.location.hash = `s=${t}`; }, TOKEN);

    await expect(page.getByTestId("summary-ready")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Thursday Engine" })).toBeVisible();
  });

  test("an unrelated fragment does not hijack the app", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    // Supabase's own magic-link redirect puts #access_token=… on the URL. If the
    // fragment parser were loose, signing in would drop a coach onto a member
    // page instead of into the app.
    await page.goto("./#access_token=abc123&type=magiclink");
    await expect(page.getByTestId("summary-ready")).toHaveCount(0);
    await nav(page, "Schedule");
    expectNoConsoleErrors(errors);
  });
});

test.describe("the coach's side of the link", () => {
  test("the Runner can open the member link dialog and it reports the local truth", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await nav(page, "Class Runner");

    await page.getByRole("button", { name: "Member link" }).click();

    // This build has no Supabase, so the honest answer is that links cannot be
    // minted — not a spinner forever, and not a link that goes nowhere.
    await expect(page.getByTestId("memberlink-error-offline-only")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Member link" })).toBeVisible();

    // Escape closes it through useDialog, like every other overlay.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Member link" })).toHaveCount(0);
    expectNoConsoleErrors(errors);
  });

  test("opening the dialog mints exactly one occurrence, and reopening reuses it", async ({ page }) => {
    await freshApp(page);
    await nav(page, "Class Runner");

    const ids = async () => page.evaluate(() =>
      JSON.parse(localStorage.getItem("jungle_class_instances") || "[]").map(c => c.id));

    expect(await ids()).toEqual([]);
    await page.getByRole("button", { name: "Member link" }).click();
    await expect(page.getByTestId("memberlink-error-offline-only")).toBeVisible();
    const first = await ids();
    expect(first).toHaveLength(1);

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Member link" }).click();
    await expect(page.getByTestId("memberlink-error-offline-only")).toBeVisible();
    // A second row here would split one class's check-ins across two
    // occurrences — the exact failure ensureClassInstance exists to prevent.
    expect(await ids()).toEqual(first);
  });
});
