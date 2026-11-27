module.exports = {
  preset: "jest-expo/android",
  testTimeout: 30_000,
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  collectCoverageFrom: [
    "App.tsx",
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/theme/colors.ts",
    "!src/theme/images.ts",
    "!src/theme/layout.ts",
    "!src/theme/tokens.ts",
    "!src/navigation/types.ts",
    "!src/shared/icons/iconPaths.ts",
  ],
  coverageReporters: ["text-summary", "text"],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
