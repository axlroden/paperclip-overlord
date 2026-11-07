import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts", "quips/**/*.test.ts"], environment: "node" },
});
