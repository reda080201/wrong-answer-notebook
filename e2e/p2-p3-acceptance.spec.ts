import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

test("P2/P3 drawer, onboarding, search suggestions, and Question Bank stay usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "시작 안내" })).toBeVisible();
  await page.getByRole("button", { name: "시작 안내" }).click();
  await expect(page.getByRole("dialog", { name: "오답노트 시작 안내" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("onboarding-1100x750.png"), fullPage: true });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 900, height: 750 });
  await expect(page.getByRole("button", { name: "사이드바 열기" })).toBeVisible();
  await page.getByRole("button", { name: "사이드바 열기" }).click();
  await expect(page.getByRole("navigation", { name: "주요 탐색" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sidebar-drawer-900x750.png"), fullPage: true });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1536, height: 864 });
  await seedBrowserStorage(page, [syntheticLifecycleEntry]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "문제 은행" }).click();
  const search = page.getByRole("textbox", { name: "문제 은행 검색" });
  await search.fill("subject:");
  await expect(search).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("question-bank-advanced-search-1536x864.png"), fullPage: true });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".question-bank-view")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`question-bank-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
});
