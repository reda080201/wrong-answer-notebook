import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { seedBrowserStorage } from "./fixtures/syntheticLifecycle";
import { validPngBytes } from "../src/test/fixtures/validPng";

for (const width of [1100, 680]) {
  test(`vision bridge exports actual source and keeps clean layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 750 });
    await seedBrowserStorage(page, []); await page.goto("/");
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "첫 시험지 가져오기", exact: true }).click();
    await page.getByRole("button", { name: "PDF / 이미지 분석", exact: true }).click();
    await expect(page.getByRole("button", { name: "PDF / 이미지 분석", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.locator("summary").filter({ hasText: "PNG 생성 작업 묶음" }).click();
    await page.getByLabel("v8 관측 JSON", { exact: true }).fill('{"invalid":true}');
    await page.getByRole("button", { name: "관측 형식 확인", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "관측 JSON 형식을 확인하지 못했습니다" })).toBeVisible();
    await page.locator("summary").filter({ hasText: "오류 상세" }).click();
    await expect(page.locator("pre").filter({ hasText: "$.schemaVersion" })).toBeVisible();
    await page.getByLabel("v8 관측 JSON", { exact: true }).fill(await readFile(resolve("tools/diagram_pipeline/examples/vision-v1.json"), "utf8"));
    await page.getByLabel("v8 원본 파일", { exact: true }).setInputFiles({ name: "source.png", mimeType: "image/png", buffer: Buffer.from(validPngBytes) });
    await page.getByRole("button", { name: "관측 형식 확인", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "관측 1문항" })).toContainText("파일 검사 전");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "작업 묶음 내보내기", exact: true }).click();
    const download = await downloadEvent; const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    const job = JSON.parse(await zip.file("job.json")!.async("string"));
    expect(job.sources[0].sourceKey).toBe("upload-1");
    expect([...await zip.file(job.sources[0].filename)!.async("uint8array")]).toEqual([...validPngBytes]);
    expect(await zip.file("analysis.json")!.async("string")).toContain("wrong-answer-notebook-vision-v1");
    await expect(page.getByRole("status").filter({ hasText: "작업 묶음을 저장했습니다" })).toBeVisible();
    const dialog = page.getByRole("dialog", { name: "시험지 가져오기", exact: true });
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`vision-bridge-${width}.png`) });
  });
}

for (const width of [1100, 680]) {
  test(`vision CLI result keeps original default and explicit choice after reload at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 750 }); await seedBrowserStorage(page, []); await page.goto("/");
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "첫 시험지 가져오기", exact: true }).click();
    await page.getByLabel("올인원 가져오기").setInputFiles(resolve("e2e/fixtures/vision-pipeline-v8.zip"));
    await expect(page.getByText(/올인원 가져오기 완료: 1개 항목/)).toBeVisible();
    await page.getByRole("button", { name: "전체 화면 검수", exact: true }).click();
    const review = page.getByRole("dialog", { name: /합성 예제.*검수/ });
    const card = review.locator(".figure-review-card").first();
    const comparison = review.getByRole("region", { name: "1번 그림 비교", exact: true });
    await expect(comparison).toContainText("수학적 동일성 미확인");
    await expect(comparison.getByRole("checkbox")).toBeEnabled();
    await expect(card.getByRole("button", { name: "정리본 사용", exact: true })).toBeDisabled();
    expect(await comparison.getByAltText("원본 도형 crop").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await comparison.getByAltText("정리본 후보").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await comparison.getByRole("checkbox").check();
    await card.getByRole("button", { name: "정리본 사용", exact: true }).click();
    await expect(card).toContainText("사용자 비교 확인");
    await page.screenshot({ path: testInfo.outputPath(`vision-comparison-${width}.png`) });
    await review.getByRole("button", { name: "취소", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "시험지 가져오기", exact: true });
    await importer.locator("summary").filter({ hasText: "다른 저장 방법" }).click();
    await importer.getByRole("button", { name: "바로 저장", exact: true }).click();
    await expect(importer).toBeHidden(); await page.reload();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries);
    expect(stored).toHaveLength(1);
    expect(stored[0].figures[0].representationSelectionSource).toBe("user");
    expect(stored[0].figures[0].preferredRepresentation).toBe("cleaned");
    expect(stored[0].structuredQuestions[0].contentSegments.map((segment: { type: string }) => segment.type)).toEqual(["text", "figure"]);
    expect(stored[0].structuredQuestions[0].source.page).toBe(1);
    expect(stored[0].questionSourceCrops[0].sourcePageImage).toBe(stored[0].sourcePageImages[0]);
  });
}
