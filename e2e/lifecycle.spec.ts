import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { openSyntheticSheet, seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

test.describe("synthetic real-exam lifecycle", () => {
  test("starts, persists, resumes, and navigates a 30-question real exam", async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.setViewportSize({ width: 1100, height: 750 });
    await seedBrowserStorage(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openSyntheticSheet(page);

    await page.getByRole("button", { name: "실전 모드" }).click();
    const startDialog = page.getByRole("dialog", { name: "실전 모의고사 시작" });
    await expect(startDialog).toBeVisible();
    await expect(startDialog).toContainText("문항 30개");
    await startDialog.getByRole("button", { name: "실전 모드 시작" }).click();

    await expect(page.getByRole("region", { name: "실전 모의고사" })).toBeVisible();
    await expect(page.getByRole("heading", { name: syntheticLifecycleEntry.title })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "답안지" })).toBeVisible();
    await expect(page.locator(".real-exam-paper .real-exam-question")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "문제 2", exact: true })).toHaveCount(0);
    await expect(page.locator(".exam-session-close")).toHaveAttribute("aria-label", "시험 닫기");

    await page
      .getByRole("group", { name: "1번 선택지", exact: true })
      .getByRole("button", { name: "① 1", exact: true })
      .click();
    await page.getByLabel("2번 답안", { exact: true }).fill("short-2");
    await page.getByRole("button", { name: "20번 미응답", exact: true }).click();
    await expect(page.getByRole("heading", { name: "문제 20", exact: true })).toBeVisible();
    const answerSheet = page.getByRole("complementary", { name: "답안지" });
    await answerSheet.getByRole("button", { name: "접기" }).click();
    await expect(answerSheet.getByRole("button", { name: "펼치기" })).toBeVisible();

    await expect.poll(async () => page.evaluate(() => {
      const sessions = JSON.parse(localStorage.getItem("wrong-answer-exam-sessions") ?? "[]") as Array<{ responses?: Array<{ questionNumber: string }> }>;
      return sessions[0]?.responses?.length ?? 0;
    })).toBe(2);

    await page.getByRole("button", { name: "시험 닫기" }).click();
    await expect(page.getByRole("region", { name: "실전 모의고사" })).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await openSyntheticSheet(page);
    const resumeTrigger = page.getByRole("button", { name: "실전 이어서" });
    await expect(resumeTrigger).toBeVisible();
    await resumeTrigger.click();
    const resumeDialog = page.getByRole("dialog", { name: "실전 모의고사 시작" });
    await expect(resumeDialog).toContainText("진행 중인 실전 모의고사");
    await resumeDialog.getByRole("button", { name: "이어서 풀기" }).click();
    await page.getByRole("complementary", { name: "답안지" }).getByRole("button", { name: "펼치기" }).click();
    await expect(page.getByLabel("2번 답안", { exact: true })).toHaveValue("short-2");
    await expect(page.getByRole("button", { name: /^20번 미응답/ })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("real-exam-resumed-1100x750.png"), fullPage: true });
  });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }]) {
    test(`real exam surface has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await seedBrowserStorage(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await openSyntheticSheet(page);
      await page.getByRole("button", { name: "실전 모드" }).click();
      await page.getByRole("dialog", { name: "실전 모의고사 시작" }).getByRole("button", { name: "실전 모드 시작" }).click();
      await expect(page.getByRole("region", { name: "실전 모의고사" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`real-exam-${viewport.width}x${viewport.height}.png`), fullPage: true });
    });
  }
});

test("imports a synthetic v2 problem sheet through summary, review, and direct save", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "시험지함" }).click();
  await page.getByRole("button", { name: "시험지 가져오기" }).click();
  const input = page.getByLabel("올인원 가져오기");
  await input.setInputFiles(resolve("e2e/fixtures/synthetic-import.json"));

  await expect(page.getByText("올인원 가져오기 완료: 1개 항목")).toBeVisible();
  const quickSave = page.getByRole("button", { name: "바로 저장" });
  await expect(quickSave).toBeEnabled();
  await quickSave.click();
  await expect(page.getByRole("dialog", { name: "GPT 결과 가져오기" })).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries") ?? "{}"));
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0].title).toBe("E2E 가져오기 시험지");
  expect(stored.entries[0].structuredQuestions).toHaveLength(2);
  expect(stored.entries[0].structuredQuestions[0].contentSegments[1].type).toBe("equation");
  await page.screenshot({ path: testInfo.outputPath("import-direct-save-1100x750.png"), fullPage: true });
});
