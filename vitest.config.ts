import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    minWorkers: 1,
    maxWorkers: 4,
  },
});
