import commonjs from "vite-plugin-commonjs";
import { mergeConfig, defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import * as base from "./vite.config.mjs";

const visualizeBundle = process.argv.includes("--visualize-bundle");

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
        // Check package.json for the current Electron version
        // and https://www.electronjs.org/docs/latest/tutorial/electron-timelines
        // for the current supported Chrome version.
        // TODO: Automate this
        target: "chrome126",
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
