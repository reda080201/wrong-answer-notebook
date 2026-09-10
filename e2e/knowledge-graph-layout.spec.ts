import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const graph = {
  entities: [{
    id: "knowledge:derivative",
    type: "concept",
    name: "미분",
    aliases: ["도함수"],
    subject: "수학",
    provenance: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }],
  relations: [],
  questionLinks: [],
};

for (const viewport of [{ width: 1100, height: 750 }, { width: 1280, height: 720 }]) {
  test(`Learning Hub graph switcher stays compact at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedBrowserStorage(page, [{ ...syntheticLifecycleEntry, subject: "수학" }], graph);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "학습 허브", exact: true }).click();

    const switcher = page.getByRole("group", { name: "학습 허브 보기" });
    const blocks = switcher.getByRole("button", { name: "학습 블록", exact: true });
    const graphButton = switcher.getByRole("button", { name: "개념 관계", exact: true });
    await expect(switcher).toBeVisible();
    await expect(blocks).toHaveAttribute("aria-pressed", "true");
    await expect(blocks).toHaveCSS("min-height", "40px");
    await expect(page.locator("html").evaluate((element) => element.scrollWidth - element.clientWidth)).resolves.toBeLessThanOrEqual(1);
    const [blocksBox, graphBox] = await Promise.all([blocks.boundingBox(), graphButton.boundingBox()]);
    expect(blocksBox).not.toBeNull();
    expect(graphBox).not.toBeNull();
    expect(Math.abs((blocksBox?.y ?? 0) - (graphBox?.y ?? 0))).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath(`learning-hub-blocks-${viewport.width}x${viewport.height}.png`), fullPage: true });

    await graphButton.click();
    await expect(graphButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "지식 그래프" })).toBeVisible();
    await expect(page.locator("html").evaluate((element) => element.scrollWidth - element.clientWidth)).resolves.toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`learning-hub-graph-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}
