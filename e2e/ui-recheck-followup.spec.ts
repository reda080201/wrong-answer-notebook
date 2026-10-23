import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

for (const width of [1100, 680]) {
  test(`undo stays inside the dialog focus and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 750 });
    await seedBrowserStorage(page, []);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /설정/ }).first()).toBeVisible();
    // Start the undo fixture after the development bundle has loaded. Its real
    // expiration policy must not include Vite's unrelated cold compilation time.
    await page.evaluate(entry => {
      localStorage.setItem("wrong-answer-pending-deletions", JSON.stringify([{
        id: "isolated-undo", entry, originalIndex: 0, imageReferences: [],
        requestedAt: new Date().toISOString(), finalizeAfter: new Date(Date.now() + 60_000).toISOString(),
      }]));
    }, { ...syntheticLifecycleEntry, title: `긴 자료명 ${"S".repeat(180)}` });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "실행 취소", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /설정/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "설정", exact: true });
    const undo = dialog.getByRole("button", { name: "실행 취소", exact: true });
    await expect(undo).toBeInViewport();
    expect(await undo.evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, radius: getComputedStyle(element).borderRadius }))).toEqual({ fontSize: "14px", radius: "6px" });
    expect(await dialog.locator(".app-snackbar").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await undo.focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    const body = await dialog.locator(":scope > .dialog-body").boundingBox();
    const notice = await dialog.locator(":scope > .dialog-notification-host").boundingBox();
    const geometry = await dialog.evaluate(element => [...element.children].map(child => {
      const style = getComputedStyle(child); const rect = child.getBoundingClientRect();
      return { className: child.className, display: style.display, height: style.height, width: style.width, flex: style.flex, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    }));
    expect(body, JSON.stringify(geometry)).not.toBeNull(); expect(notice).not.toBeNull();
    expect(body!.y + body!.height).toBeLessThanOrEqual(notice!.y + 1);
    await undo.click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries.map((entry: { id: string }) => entry.id))).toEqual([syntheticLifecycleEntry.id]);
    await expect(undo).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
