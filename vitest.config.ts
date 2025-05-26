import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  test: {
    include: [...configDefaults.include, `src/**/*.test.integration.{ts,tsx}`],
    exclude: [...configDefaults.exclude, `e2e/**/*`, `out/**/*`],
    coverage: {
      all: true,
      include: ["src/**/*"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.test.integration.{ts,tsx}"],
    },
    setupFiles: ["./vitest.global-setup.ts"],
  },
});
