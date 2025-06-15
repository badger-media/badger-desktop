import { AppSettings } from "./settings";
import isElectron from "is-electron";

export interface SettingsStore {
  saveSettings: (val: AppSettings) => Promise<void>;
  loadSettings: () => Promise<AppSettings>;
}

export async function getSettingsStore(): Promise<SettingsStore> {
  return !isElectron()
    ? await import("./settingsStorage.dev")
    : await import("./settingsStorage.electron");
}
