// Copy of settingsStorage.ts but doesn't use Electron.
import { AppSettings, SettingsStateSchema } from "./settings";
import { once, cloneDeep } from "lodash";
import * as fsp from "fs/promises";
import { getLogger } from "./logging";
import { inspect } from "util";
import * as nodePath from "path";
import isElectron from "is-electron";
import invariant from "../../common/invariant";

invariant(!isElectron(), "This file should not be used in Electron");

const logger = getLogger("settingsStorage.dev");

const dir = nodePath.join(process.cwd(), ".dev");
const path = once(() => nodePath.join(dir, "settings.json"));

export async function saveSettings(val: AppSettings) {
  if (process.env.E2E_TEST === "true") {
    logger.info("Skipping saving settings in E2E test");
    return;
  }
  const nv = cloneDeep(val);
  const data = JSON.stringify(nv, null, 2);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path(), data, { encoding: "utf-8", flag: "w" });
  logger.info("Saved settings");
}

export async function loadSettings(): Promise<AppSettings> {
  if (process.env.E2E_TEST === "true") {
    logger.info("Skipping loading settings in E2E test");
    return SettingsStateSchema.parse({});
  }
  let data;
  try {
    data = await fsp.readFile(path(), { encoding: "utf-8" });
  } catch (e) {
    if (
      e instanceof Error &&
      (e as unknown as { code: string }).code === "ENOENT"
    ) {
      return SettingsStateSchema.parse({});
    }
    throw e;
  }
  const settings = SettingsStateSchema.safeParse(JSON.parse(data));
  if (!settings.success) {
    logger.error("Failed to parse settings: " + inspect(settings.error));
    return SettingsStateSchema.parse(undefined);
  }
  return settings.data;
}
