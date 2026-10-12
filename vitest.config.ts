import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/golden/**/*.test.ts", "test/reference/**/*.test.ts"],
  },
});
