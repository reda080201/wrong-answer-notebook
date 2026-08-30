import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // A single fork is more reliable than a long-lived worker thread on Windows.
    pool: "forks",
    minWorkers: 1,
    fileParallelism: false,
    maxWorkers: 1,
    singleFork: true,
  },
});
