const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ["coverage/*", ".expo/*"],
  },
  {
    files: [
      "src/database/**/*.ts",
      "src/shared/**/*.ts",
      "src/state/**/*.{ts,tsx}",
      "src/navigation/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
]);
