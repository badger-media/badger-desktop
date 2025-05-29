import {
  test as base,
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { join } from "node:path";

export const test = base.extend<{
  appEnv: Record<string, string>;
  app: [ElectronApplication, Page];
  testSettings: Record<string, Record<string, unknown>>;
  supportedIntegrations: ("obs" | "ontime" | "vmix")[];
  testMediaPath: string;
}>({
  appEnv: {},
  testSettings: {},
  supportedIntegrations: ["obs", "ontime", "vmix"],

  // eslint-disable-next-line no-empty-pattern
  testMediaPath: async ({}, use) => {
    const dir = await fs.mkdtemp(
      join(os.tmpdir(), "badger-desktop-e2e-complete"),
    );
    await use(dir);
    await fs.rm(dir, { recursive: true });
  },

  // eslint-disable-next-line no-empty-pattern
  app: async (
    { appEnv, testSettings, testMediaPath, supportedIntegrations },
    use,
    testInfo,
  ) => {
    const env: Record<string, string> = {
      ...process.env,
      NODE_ENV: "test",
      E2E_TEST: "true",
      BADGER_TEST_SCENARIO: "complete: " + testInfo.title,
      __TEST_SUPPORTED_INTEGRATIONS: JSON.stringify(supportedIntegrations),
      ...appEnv,
    };
    if (!testSettings.media) {
      testSettings.media = {};
    }
    testSettings.media.mediaPath = testMediaPath;
    for (const [key, value] of Object.entries(testSettings)) {
      env[`__TEST_SETTINGS_${key.toUpperCase()}`] = JSON.stringify(value);
    }
    const app = await electron.launch({
      args: ["--enable-logging", "out/main/index.js"],
      env,
    });
    const win = await app.firstWindow();

    await win.context().tracing.start({ screenshots: true, snapshots: true });

    await win.waitForLoadState("domcontentloaded");

    await win.getByLabel("Server address").fill("http://localhost:3000");
    await win.getByLabel("Server Password").fill("aaa");

    await win.getByRole("button", { name: "Connect" }).click();

    await expect(
      win.getByRole("heading", { name: "Select a show" }),
    ).toBeVisible();

    await use([app, win]);

    await win
      .context()
      .tracing.stop({ path: `traces/${testInfo.title}-${testInfo.retry}.zip` });

    await win.close();
    await app.close();
  },
});
