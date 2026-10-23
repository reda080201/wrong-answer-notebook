import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { seedBrowserStorage } from "./fixtures/syntheticLifecycle";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

for (const width of [1100, 680]) {
  test(`real CLI PNG package preserves comparison, choice and reload at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 750 });
    await seedBrowserStorage(page, []);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "첫 시험지 가져오기", exact: true }).click();
    await page.getByLabel("올인원 가져오기").setInputFiles(resolve("e2e/fixtures/diagram-pipeline-v7.zip"));
    await expect(page.getByText(/올인원 가져오기 완료: 1개 항목/)).toBeVisible();
    await page.getByRole("button", { name: "전체 화면 검수", exact: true }).click();
    const review = page.getByRole("dialog", { name: /합성 확인용.*검수/ });
    const comparison = review.getByRole("region", { name: "1번 그림 비교", exact: true });
    await expect(comparison).toContainText("수학적 동일성 미확인");
    await expect(comparison.getByRole("checkbox")).toBeEnabled();
    const source = comparison.getByAltText("원본 도형 crop");
    const candidate = comparison.getByAltText("정리본 후보");
    expect(await source.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await candidate.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await source.getAttribute("src")).not.toBe(await candidate.getAttribute("src"));
    const card = review.locator(".figure-review-card").first();
    await expect(card.getByRole("button", { name: "정리본 사용", exact: true })).toBeDisabled();
    await comparison.getByRole("checkbox").check();
    await card.getByRole("button", { name: "정리본 사용", exact: true }).click();
    await expect(card).toContainText("사용자 비교 확인");
    await page.screenshot({ path: testInfo.outputPath(`diagram-comparison-${width}.png`) });
    await review.getByRole("button", { name: "취소", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "시험지 가져오기", exact: true });
    await importer.locator("summary").filter({ hasText: "다른 저장 방법" }).click();
    await importer.getByRole("button", { name: "바로 저장", exact: true }).click();
    await expect(importer).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries);
    expect(stored).toHaveLength(1);
    expect(stored[0].structuredQuestions).toHaveLength(3);
    expect(stored[0].answerKey.map((answer: { answer: string }) => answer.answer)).toEqual(["①", "①", "①"]);
    expect(stored[0].figures[0].representationSelectionSource).toBe("user");
    expect(stored[0].figures[0].preferredRepresentation).toBe("cleaned");
    expect(stored[0].figures[0].original.image).not.toBe(stored[0].figures[0].cleaned.image);
    expect(stored[0].structuredQuestions[0].contentSegments.map((segment: { type: string }) => segment.type)).toEqual(["text", "figure", "text"]);
    expect(stored[0].structuredQuestions[0].choices[0]).toContain(stored[0].figures[0].id);
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.locator(".entry-card", { hasText: "합성 확인용" }).click();
    await page.screenshot({ path: testInfo.outputPath(`diagram-saved-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("a forged original SHA blocks a real PNG package before saving", async ({ page }) => {
  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "시험지함", exact: true }).click();
  await page.getByRole("button", { name: "첫 시험지 가져오기", exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile(resolve("e2e/fixtures/diagram-pipeline-v7.zip")));
  const document = JSON.parse(await zip.file("import.json")!.async("string"));
  document.entries[0].figures[0].cleaned.sourceImageHash = "0".repeat(64);
  zip.file("import.json", JSON.stringify(document));
  await page.getByLabel("올인원 가져오기").setInputFiles({ name: "forged.zip", mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  await expect(page.getByRole("dialog", { name: "시험지 가져오기", exact: true }).getByRole("alert")).toContainText("SHA-256");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries.length)).toBe(0);
});
