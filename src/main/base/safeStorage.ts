// Workaround for safeStorage issues when running in tests.

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { safeStorage as electronSafeStorage } from "electron";
import isElectron from "is-electron";

const testSafeStorage = {
  encryptString(str: string): Buffer {
    return Buffer.from("!ENCRYPTED!" + str + "!ENCRYPTED!", "utf-8");
  },
  decryptString(buf: Buffer): string {
    return buf.toString("utf-8").replace(/(^!ENCRYPTED!|!ENCRYPTED!$)/g, "");
  },
  isEncryptionAvailable(): boolean {
    return true;
  },
};

export const safeStorage = !isElectron()
  ? testSafeStorage
  : electronSafeStorage;
