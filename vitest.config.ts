import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Pure-logic unit tests only — colocated next to the code they cover.
    // No jsdom/browser environment: everything under lib/ runs in plain Node.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Next.js resolves this compile-time boundary; Vitest's plain Node
      // runner needs a harmless stub without weakening production imports.
      "server-only": path.resolve(__dirname, "test-support/server-only.ts"),
    },
  },
});
