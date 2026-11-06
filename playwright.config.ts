import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running app (`npm run dev` or `npm start`) with the demo seed.
 * smoke.spec.ts is read-only; workflow.spec.ts and ops.spec.ts mutate data and run only with E2E_MUTATING=1
 * (CI: disposable DB).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
      : {},
  },
  projects: [
    // Mutating vertical (skipped unless E2E_MUTATING=1). Runs first so a freshly seeded DB gets a published version.
    {
      name: "workflow",
      testMatch: /workflow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    // Phase 6 operations on top of that publication (also mutating; skipped unless E2E_MUTATING=1).
    {
      name: "ops",
      testMatch: /ops\.spec\.ts/,
      dependencies: ["workflow"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop",
      testIgnore: /(workflow|ops)\.spec\.ts/,
      dependencies: ["workflow"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: /(workflow|ops)\.spec\.ts/,
      dependencies: ["workflow"],
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
});
