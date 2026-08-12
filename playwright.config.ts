import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-mode smoke E2E against Vite.
 * Full Tauri webview E2E can reuse the same specs with a different baseURL / launch hook later.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 1420",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
