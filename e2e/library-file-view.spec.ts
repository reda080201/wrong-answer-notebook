import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const sizes = [
  { width: 1100, height: 750 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

test.describe("Library file view", () => {
  for (const size of sizes) {
    test(`${size.width}x${size.height} keeps file rows compact and usable`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      const entries = [1, 2, 3].map((index) => ({
        ...syntheticLifecycleEntry,
        id: `library-file-${index}`,
        title: index === 1 ? "매우 긴 보관함 자료 제목이 한 줄에서 줄임표로 표시되는지 확인하는 자료" : `파일형 자료 ${index}`,
        updatedAt: `2026-08-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
      }));
      await seedBrowserStorage(page, entries);
      await page.addInitScript(() => {
        localStorage.setItem("wrong-answer-settings", JSON.stringify({
          libraryPreferences: {
            separateMockExams: false,
            defaultUnitView: "home",
            listDensity: "standard",
            showUserFolders: true,
            displayMode: "file",
          },
        }));
      });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "보관함", exact: true }).click();

      const library = page.getByRole("region", { name: "학습 자료 보관함" });
      const row = library.locator(".library-resource-row--file").first();
      await expect(row).toBeVisible();
      await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeLessThanOrEqual(52);
      await expect(row.locator(".library-resource-name")).toHaveCSS("white-space", "nowrap");
      await expect(row.locator(".library-file-favorite")).toBeVisible();
      await expect(row.locator(".library-file-menu > button")).toBeVisible();
      await expect(row.locator(".library-file-favorite")).toHaveAttribute("aria-pressed", "false");
      await expect.poll(async () => library.evaluate((element) => Math.max(element.scrollWidth - element.clientWidth, 0))).toBeLessThanOrEqual(1);

      const [titleButton, star, menuTrigger] = await Promise.all([
        row.locator(".library-file-open").boundingBox(),
        row.locator(".library-file-favorite").boundingBox(),
        row.locator(".library-file-menu > button").boundingBox(),
      ]);
      expect(titleButton).not.toBeNull();
      expect(star).not.toBeNull();
      expect(menuTrigger).not.toBeNull();
      if (titleButton && star && menuTrigger) {
        expect(star.y).toBeGreaterThanOrEqual(titleButton.y);
        expect(star.y + star.height).toBeLessThanOrEqual(titleButton.y + titleButton.height + 2);
        expect(menuTrigger.y).toBeGreaterThanOrEqual(titleButton.y);
        expect(menuTrigger.y + menuTrigger.height).toBeLessThanOrEqual(titleButton.y + titleButton.height + 2);
        expect(star.x - (titleButton.x + titleButton.width)).toBeLessThanOrEqual(16);
        expect(menuTrigger.x - (star.x + star.width)).toBeLessThanOrEqual(16);
      }
      await page.screenshot({ path: testInfo.outputPath(`library-file-${size.width}x${size.height}.png`), fullPage: true });
    });
  }
});
