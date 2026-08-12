import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("app shell loads with brand title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/오답노트/);
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("settings can be opened from the UI", async ({ page }) => {
    await page.goto("/");
    const settingsButton = page.getByRole("button", { name: /설정/ }).first();
    await expect(settingsButton).toBeVisible({ timeout: 30_000 });
    await settingsButton.click();
    await expect(page.getByRole("dialog", { name: /설정/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "테마" })).toBeVisible();
  });

  test("theme boot script sets data-theme before paint", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("wrong-answer-theme", "light");
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
