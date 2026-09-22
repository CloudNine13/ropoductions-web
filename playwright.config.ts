import { defineConfig, devices } from "@playwright/test";

/** Runs only under a browser profile that genuinely refuses WebGL contexts. */
const WEBGL_DISABLED_SPEC = /webgl-unavailable\.spec\.ts/;

/**
 * Headless Firefox ships without a WebGL path (Mozilla 1375585; Playwright
 * #13146/#21783: WebGL is headed-only), so the engine preflight refuses the
 * session and the boot specs see no iframe. CI therefore runs this project
 * headed under xvfb; the force-enabled prefs cover blocklisted software GL.
 */
const FIREFOX_WEBGL_PREFS = {
  "webgl.disabled": false,
  "webgl.force-enabled": true,
};

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
      use: {
        ...devices["Desktop Firefox"],
        headless: process.env.CI ? false : true,
        launchOptions: { firefoxUserPrefs: FIREFOX_WEBGL_PREFS },
      },
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
