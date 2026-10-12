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
    await expect(page.locator(".real-exam-header").getByRole("heading", { name: syntheticLifecycleEntry.title })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "답안지" })).toBeVisible();
    await expect(page.locator(".real-exam-paper [data-paper-item]")).toHaveCount(30);
    await expect(page.getByRole("article", { name: "문제 2", exact: true })).toBeAttached();
    await expect(page.getByRole("button", { name: "시험 닫기", exact: true })).toHaveAttribute("aria-label", "시험 닫기");

    await page
      .locator(".real-exam-paper").getByRole("group", { name: "1번 선택지", exact: true })
      .getByRole("button", { name: "① 1", exact: true })
      .click();
    await page.getByRole("complementary", { name: "답안지" }).getByLabel("2번 답안", { exact: true }).fill("short-2");
    await page.getByRole("button", { name: "20번 미응답", exact: true }).click();
    await expect(page.getByRole("article", { name: "문제 20", exact: true })).toBeVisible();
    const answerSheet = page.getByRole("complementary", { name: "답안지" });
    await answerSheet.getByRole("button", { name: "접기" }).click();
    await expect(answerSheet.getByRole("button", { name: "답안지 펼치기" })).toBeVisible();

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
    await page.getByRole("complementary", { name: "답안지" }).getByRole("button", { name: "답안지 펼치기" }).click();
    await expect(page.getByRole("complementary", { name: "답안지" }).getByLabel("2번 답안", { exact: true })).toHaveValue("short-2");
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
      await page.screenshot({ path: testInfo.outputPath(`real-exam-${viewport.width}x${viewport.height}.png`) });
    });
  }
});

test("imports a synthetic v2 problem sheet through summary, review, and direct save", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "시험지함" }).click();
  await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
  const input = page.getByLabel("올인원 가져오기");
  await input.setInputFiles(resolve("e2e/fixtures/synthetic-import.json"));

  await expect(page.getByText("올인원 가져오기 완료: 1개 항목")).toBeVisible();
  const quickSave = page.getByRole("button", { name: "바로 저장" });
  await expect(quickSave).toBeEnabled();
  await quickSave.click();
  await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries") ?? "{}"));
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0].title).toBe("E2E 가져오기 시험지");
  expect(stored.entries[0].structuredQuestions).toHaveLength(2);
  expect(stored.entries[0].structuredQuestions[0].contentSegments[1].type).toBe("equation");
  await page.screenshot({ path: testInfo.outputPath("import-direct-save-1100x750.png"), fullPage: true });
});

test("direct import survives a failed entry write and rapid retry without duplicates", async ({ page }) => {
  await seedBrowserStorage(page, []);
  await page.goto("/");
  await page.getByRole("button", { name: "시험지함" }).click();
  await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
  await page.getByLabel("올인원 가져오기").setInputFiles(resolve("e2e/fixtures/synthetic-import.json"));
  const save = page.getByRole("button", { name: "바로 저장", exact: true });
  await expect(save).toBeEnabled();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function(key, value) {
      if (key === "wrong-answer-entries" && fail) { fail = false; throw new Error("isolated entry write failure"); }
      return write.call(this, key, value);
    };
  });
  await save.click();
  await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "시험지 가져오기" }).getByRole("alert")).toHaveText("여러 항목을 추가하지 못했습니다. (브라우저 저장소에 데이터를 저장하지 못했습니다.)");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries)).toHaveLength(0);
  const plannedIds = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-import-workspace-draft")!).commitAttempt.entryIds);
  await page.getByRole("button", { name: "저장 결과 확인·정리 재시도", exact: true }).dblclick();
  await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries);
  expect(entries).toHaveLength(1);
  expect(entries.map((entry: { id: string }) => entry.id)).toEqual(plannedIds);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries)).toHaveLength(1);
});

for (const phase of ["completed-receipt", "cleanup"] as const) {
  test(`direct import recovers ${phase} failure after browser restart`, async ({ page }) => {
    await seedBrowserStorage(page, []);
    await page.goto("/");
    await page.getByRole("button", { name: "시험지함" }).click();
    await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
    await page.getByLabel("올인원 가져오기").setInputFiles(resolve("e2e/fixtures/synthetic-import.json"));
    await expect(page.getByRole("button", { name: "바로 저장", exact: true })).toBeEnabled();
    await page.evaluate(phase => {
      const write = Storage.prototype.setItem; const remove = Storage.prototype.removeItem;
      let fail = true;
      Storage.prototype.setItem = function(key, value) {
        if (phase === "completed-receipt" && fail && key === "wrong-answer-import-workspace-draft" && JSON.parse(value).commitAttempt?.state === "completed") { fail = false; throw new Error("receipt write failed"); }
        return write.call(this, key, value);
      };
      Storage.prototype.removeItem = function(key) {
        if (phase === "cleanup" && fail && key === "wrong-answer-import-workspace-draft") { fail = false; throw new Error("draft cleanup failed"); }
        return remove.call(this, key);
      };
    }, phase);
    await page.getByRole("button", { name: "바로 저장", exact: true }).click();
    await expect(page.getByRole("button", { name: "확정 기록 확인·정리", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries)).toHaveLength(1);
    await expect(page.getByRole("button", { name: "수정 후 저장", exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
    await page.getByRole("button", { name: "확정 기록 확인·정리", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries)).toHaveLength(1);
    expect(await page.evaluate(() => localStorage.getItem("wrong-answer-import-workspace-draft"))).toBeNull();
  });
}
