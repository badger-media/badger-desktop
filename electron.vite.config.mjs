import commonjs from "vite-plugin-commonjs";
import { mergeConfig, defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import * as fsp from "node:fs/promises";
import "./dev/update-electron-releases.mjs";
import { base } from "./vite.config.mjs";

const visualizeBundle = process.argv.includes("--visualize-bundle");

const electronReleases = JSON.parse(
  await fsp.readFile("dev/electron-releases.json", { encoding: "utf-8" }),
);
const electronVersion = await fsp.readFile(
  "node_modules/electron/dist/version",
  { encoding: "utf-8" },
);
const electronChromeVersion = electronReleases.find(
  (v) => v.version === electronVersion,
)?.chrome;
const electronChromeMajor = electronChromeVersion?.split(".")[0];

/**
 * @type {import('electron-vite').UserConfig}
 */
const config = {
  main: mergeConfig(
    base,
    defineConfig({
      plugins: [
        commonjs(),
        visualizeBundle &&
          visualizer({
            filename: "bundle-main.html",
          }),
      ].filter(Boolean),
      resolve: {
        conditions: ["node"],
        browserField: false,
      },
      build: {
        sourcemap: true,
      },
    }),
  ),
  renderer: mergeConfig(
    base,
    defineConfig({
      plugins: [
        visualizeBundle &&
          visualizer({
            filename: "bundle-renderer.html",
          }),
      ].filter(Boolean),
      build: {
        target: `chrome${electronChromeMajor}`,
        rollupOptions: {
          input: "./src/renderer/index.html",
        },
      },
    }),
  ),
  preload: mergeConfig(
    base,
    defineConfig({
      plugins: [
        visualizeBundle &&
          visualizer({
            filename: "bundle-preload.html",
          }),
      ].filter(Boolean),
      build: {
        lib: {
          entry: "./src/common/preload.ts",
          // ESM is not supported in sandboxed preload scripts
          formats: ["cjs"],
        },
      },
    }),
  ),
};

export default config;
