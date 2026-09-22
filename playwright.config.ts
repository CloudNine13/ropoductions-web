import { defineConfig, devices } from "@playwright/test";

/** Runs only under a browser profile that genuinely refuses WebGL contexts. */
const WEBGL_DISABLED_SPEC = /webgl-unavailable\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: WEBGL_DISABLED_SPEC,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: WEBGL_DISABLED_SPEC,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "firefox-webgl-disabled",
      testMatch: WEBGL_DISABLED_SPEC,
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: { firefoxUserPrefs: { "webgl.disabled": true } },
      },
    },
  ],
  webServer: {
    command: "npm run e2e:server",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    // The server command builds the OpenNext worker before serving it.
    timeout: 420 * 1000,
  },
});
