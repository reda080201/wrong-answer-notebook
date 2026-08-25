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
    pool: "threads",
    minWorkers: 1,
    fileParallelism: false,
    maxWorkers: 1,
    singleThread: true,
  },
});
