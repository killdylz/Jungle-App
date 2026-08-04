import { expect } from "@playwright/test";

// The local build's fixed PIN. Only meaningful when Supabase is unconfigured,
// which is exactly the state these tests run in.
export const PIN = "080921";

// ── Console-error capture ────────────────────────────────────────────────────
// The single most valuable assertion in this suite, and the reason REGRESSION §1
// lists it on every test rather than one. `lint:crash` catches an identifier
// that does not resolve; it cannot catch one that resolves and then throws, and
// that is the class of bug that has twice reached the live site as a white
// screen. React's error boundary makes it WORSE for a human — the screen shows a
// polite message and the crash only exists in the console.
//
// React logs component errors via console.error, so this catches a boundary
// catching something too.
export function watchConsole(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Vite's HMR chatter during a dev-server restart is not the app failing.
    if (text.includes("[vite]")) return;
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export function expectNoConsoleErrors(errors) {
  expect(errors, `console errors:\n${errors.join("\n---\n")}`).toEqual([]);
}

// ── Entry ────────────────────────────────────────────────────────────────────
// Every test starts from a known-empty store. Without this the suite passes or
// fails depending on what the previous run left in localStorage — and this app
// persists nearly everything, including (as of session 5) the Builder's class.
export async function freshApp(page, { pin = false } = {}) {
  // The origin has to exist before localStorage is reachable, hence the load
  // before the clear, then a reload into the clean state.
  await page.goto("./");
  await page.evaluate((skipPin) => {
    localStorage.clear();
    sessionStorage.clear();
    if (skipPin) sessionStorage.setItem("jungle_pin_ok", "1");
  }, !pin);
  await page.reload();
}

// Enter the PIN one digit at a time. React batches state updates, so the digits
// must land as separate events — this is the documented trap in this repo.
export async function enterPin(page, pin = PIN) {
  for (const d of pin.split("")) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
}

// Left sidebar navigation. Desktop viewport only — the mobile bottom bar has its
// own labels and is covered by its own test.
export async function nav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  // Screens split into their own chunk (I9) render a Suspense fallback for a
  // beat after the click. Assertions like `toBeVisible` absorb that on their
  // own, but a raw `innerText()` read does not — it captured "Loading…" and
  // reported a stale category the app had never rendered. Waiting here means no
  // test needs to know which screens are lazy, and adding a lazy screen later
  // cannot silently make an existing test flaky.
  await expect(page.getByTestId("screen-loading")).toHaveCount(0);
}

// Wait until the staff app has actually MOUNTED.
//
// Needed since N4 split the root: AuthGate + App are a lazily-loaded chunk, so
// for a beat after `load` the document is the Suspense fallback and the skin's
// CSS custom properties are not on :root yet. Any test that reads a computed
// style (rather than asserting on an element, which auto-waits) has to come
// through here first — otherwise it reads "" and computes NaN.
export async function waitForApp(page) {
  await expect(page.getByRole("button", { name: "Class Runner", exact: true })).toBeVisible();
}

// Ready at ANY width. `waitForApp` keys on the 238px sidebar, which does not
// exist below 900px — a phone-width test using it waits 5s and then fails on a
// perfectly healthy page. Below that breakpoint the bottom bar's "Run" is the
// equivalent landmark, so this accepts either and lets a responsive sweep use
// one readiness check across every viewport it visits.
export async function waitForAppAnyWidth(page) {
  const desktop = page.getByRole("button", { name: "Class Runner", exact: true });
  const phone = page.locator("nav").first().getByRole("button", { name: "Run", exact: true });
  await expect(desktop.or(phone).first()).toBeVisible();
}

// ── The screen inventory, and reaching a screen at any width ─────────────────
//
// The three navigations use DIFFERENT words for the same screen: the sidebar
// says "Class Builder", the More sheet says "Builder", the bottom bar says
// "Build". Below 900px (COMPACT_NAV_PX) there is no sidebar at all, so a sweep
// that visits every screen at every width cannot hardcode one vocabulary — and
// the alternative, a per-width copy of the list, is three lists to forget to
// update.
//
// `side` is the sidebar label and doubles as the screen's name in test titles.
// `sheet` is the More sheet's label, absent for screens that live only on the
// bottom bar. `bar` is the bottom bar's four-item shortlist.
//
// ⚠️ This list is CHECKED against the running app by responsive.spec.js rather
// than trusted: a screen added to the sidebar, or a flag flipped in
// config/flags.js, must not be able to fall out of the sweep silently.
export const ALL_SCREENS = [
  { key: "dashboard",    side: "Dashboard",        sheet: "Dashboard" },
  { key: "builder",      side: "Class Builder",    sheet: "Builder",      bar: "Build" },
  { key: "personas",     side: "Coaches",          sheet: "Coaches" },
  { key: "library",      side: "Exercise Library", sheet: "Library" },
  { key: "live",         side: "Class Runner",     bar: "Run" },
  { key: "calendar",     side: "Schedule",         sheet: "Schedule" },
  { key: "member",       side: "Members",          sheet: "Members",      bar: "Members" },
  { key: "brand-studio", side: "Brand Studio",     sheet: "Brand Studio", bar: "Brand" },
];

// Navigate to a screen whatever the viewport is doing.
//
// ⚠️ The More sheet's labels carry an emoji in a sibling <span>, so the
// accessible name is "🏋️ Builder" — matched with a regex, never `exact: true`.
export async function navAnyWidth(page, screen) {
  const sidebar = page.locator("aside");
  if (await sidebar.count()) {
    await page.getByRole("button", { name: screen.side, exact: true }).click();
  } else {
    const bar = page.locator("nav").first();
    if (screen.bar) {
      await bar.getByRole("button", { name: screen.bar, exact: true }).click();
    } else {
      await bar.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`${screen.sheet}$`) }).first().click();
    }
  }
  await expect(page.getByTestId("screen-loading")).toHaveCount(0);
}

// Read a domain object back out of localStorage. The repo rule is to assert on
// what was STORED, not only what was rendered: session 4's defects were mostly
// cases where those two disagreed.
export async function stored(page, key) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }, key);
}
