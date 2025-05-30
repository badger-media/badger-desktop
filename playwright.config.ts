import { defineConfig } from "@playwright/test";
import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "complete",
      use: {},
      testDir: "./e2e/complete",
      workers: 1, // Complete tests are not parallelized because they modify Server state
    },
    {
      name: "standalone",
      use: {},
      testDir: "./e2e/standalone",
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "yarn microserver",
    url: "http://127.0.0.1:8594",
    reuseExistingServer: !process.env.CI,
  },
});
