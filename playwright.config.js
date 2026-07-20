import { defineConfig, devices } from "@playwright/test";

// E2E against the LOCAL, no-Supabase build (REGRESSION-PLAN §1). That build is
// the right target precisely because it is boring: no network, no auth, a fixed
// PIN, and sync paths that no-op cleanly. It exercises the same store and UI
// wiring, which is where every defect this repo has shipped actually lived.
//
// The DEV server is the target rather than `vite preview`, deliberately:
// the preview build registers the service worker, which caches aggressively and
// would make test order matter. `npm run build` already gates the built artifact
// in CI; these tests are here for runtime wiring, and dev exercises that
// identically while starting faster.
//
// Port 5191 is its own: a second chat often holds 5173, and the dev/preview
// servers used while working sit on 5180/5190.
const PORT = 5191;
const BASE = `http://localhost:${PORT}/Jungle-App/`;

// The offline suite needs the PRODUCTION artifact: the service worker registers
// only in a prod build (in dev it would fight HMR), so an offline test against
// the dev server proves nothing. It gets its own preview server and port.
const PREVIEW_PORT = 5192;
const PREVIEW_BASE = `http://localhost:${PREVIEW_PORT}/Jungle-App/`;

export default defineConfig({
  testDir: "./e2e",
  // The whole suite has to stay quick or it gets skipped under pressure, which
  // is exactly when it is needed.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // A stray `test.only` must fail CI rather than silently shrink the suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /offline\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "offline",
      testMatch: /offline\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_BASE },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: BASE,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // `npm run build` runs first so the preview serves the CURRENT code —
      // serving a stale dist/ is a documented failure mode in this repo.
      command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: PREVIEW_BASE,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
