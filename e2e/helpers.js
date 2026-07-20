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
}

// Read a domain object back out of localStorage. The repo rule is to assert on
// what was STORED, not only what was rendered: session 4's defects were mostly
// cases where those two disagreed.
export async function stored(page, key) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  }, key);
}
