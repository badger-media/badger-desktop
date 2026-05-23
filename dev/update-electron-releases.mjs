import * as fsp from "node:fs/promises";
import path from "node:path";

const outPath = import.meta.dirname.includes("dev")
  ? import.meta.dirname
  : path.join(import.meta.dirname, "dev");

// eslint-disable-next-line no-console
console.log("Updating electron-releases.json...");
await fetch("https://releases.electronjs.org/releases.json")
  .then((r) => r.text())
  .then((r) => fsp.writeFile(path.join(outPath, "electron-releases.json"), r));
