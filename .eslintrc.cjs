module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint"],
  rules: {
    "no-console": "error",
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [`badger-server/app(?!/api)`],
          },
          {
            group: [`badger-server/app`],
            message: "You probably wanted 'import type'.",
            allowTypeImports: true,
          },
          {
            group: ["^electron"],
            importNames: ["safeStorage"],
            message:
              "Use main/safeStorage.ts instead to avoid E2E test failures.",
          },
        ],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^ignored",
      },
    ],
  },
};
