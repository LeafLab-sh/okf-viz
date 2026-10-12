import { defineConfig } from "vitest/config";

// The Workers test runs against dist/, so it is kept out of `pnpm test`.
export default defineConfig({
  test: {
    include: ["test/workers/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
