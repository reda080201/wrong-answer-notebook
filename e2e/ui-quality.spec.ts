import { expect, test } from "@playwright/test";
import { openSyntheticSheet, seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const longQuestions = syntheticLifecycleEntry.structuredQuestions.map(q => q.questionNumber !== "20" ? q : {
  ...q, contentSegments: [...q.contentSegments, ...Array.from({ length: 8 }, (_, i) => ({ id: `long-${i}`, type: "equation", latex: `\\sum_{k=1}^{n}a_k=\\frac{${i + 1}}{n}`, display: true }))],
});
const longEntry = { ...syntheticLifecycleEntry, structuredQuestions: longQuestions, questionContentSegments: Object.fromEntries(longQuestions.map(q => [q.questionNumber, q.contentSegments])) };

for (const [width, theme] of [[1100, "light"], [680, "dark"]] as const) {
  test(`focus panes and controls remain separate at ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 750 });
    await seedBrowserStorage(page, [longEntry]);
    await page.addInitScript(t => localStorage.setItem("wrong-answer-theme", t), theme);
    await page.goto("/"); await openSyntheticSheet(page);
    await page.getByRole("button", { name: "문항별", exact: true }).click();
    await page.getByRole("button", { name: "20번 크게 보기", exact: true }).click();
    await page.getByRole("button", { name: "해설 보기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "문제 크게 보기" });
    const boxes = await dialog.evaluate(el => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { question: rect(".question-theater-question-pane"), solution: rect(".question-theater-solution-pane"), dock: rect(".question-theater-dock") };
    });
    expect(boxes.question.bottom).toBeLessThanOrEqual(boxes.solution.top + 1);
    expect(boxes.solution.bottom).toBeLessThanOrEqual(boxes.dock.top + 1);
    expect(boxes.question.height).toBeGreaterThan(100);
    expect(boxes.solution.height).toBeGreaterThan(100);
    await expect(page.getByRole("button", { name: "AI 학습 대화 열기" })).toBeHidden();
    const next = dialog.getByRole("button", { name: "다음", exact: true });
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await next.click(); await expect(dialog.getByText("21 / 30", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "문제 크게 보기 추가 작업" }).click();
    await dialog.getByRole("menuitem", { name: "난이도 수정", exact: true }).click();
    await expect(dialog.getByRole("slider", { name: "현재 문제 난이도 점수" })).toBeVisible();
    const edited = await dialog.evaluate(el => ({ main: el.querySelector(".question-theater-main")!.getBoundingClientRect().toJSON(), dock: el.querySelector(".question-theater-dock")!.getBoundingClientRect().toJSON() }));
    expect(edited.main.height).toBeGreaterThan(100);
    expect(edited.main.bottom).toBeLessThanOrEqual(edited.dock.top + 1);
    await dialog.getByRole("button", { name: "자동", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("focus.png") });
    await dialog.getByRole("button", { name: "문제 크게 보기 닫기" }).click();
    await expect(page.getByRole("button", { name: "AI 학습 대화 열기" })).toBeVisible();
  });
}

test("long reading lists defer bodies, while navigation, search and print expose content", async ({ page }) => {
  await seedBrowserStorage(page); await page.goto("/"); await openSyntheticSheet(page);
  await page.getByRole("button", { name: "문항별", exact: true }).click();
  await expect(page.locator('[data-question-body="deferred"]').first()).toBeAttached();
  expect(await page.locator('[data-question-body="mounted"]').count()).toBeLessThan(30);
  await page.getByRole("button", { name: "30번 크게 보기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "문제 크게 보기" }).getByText("문제 30", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "문제 크게 보기 닫기" }).click();
  await page.getByRole("button", { name: "시험지 검색", exact: true }).click();
  await page.getByRole("searchbox", { name: "시험지 안에서 검색" }).fill("30번");
  await expect(page.locator('[data-question-body="mounted"]')).toHaveCount(30);
  await page.getByRole("button", { name: "시험지 검색 닫기" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator('[data-question-body="mounted"]')).toHaveCount(30);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.getByRole("button", { name: "AI 학습 대화 열기" }).click();
  const message = page.getByRole("textbox", { name: "메시지", exact: true }); await message.fill("전송 전 보존할 문장");
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
  await message.press("Enter"); await expect(message).toHaveValue("전송 전 보존할 문장");
  await expect(page.getByRole("button", { name: "기록 다시 불러오기" })).toHaveCount(0);
  await expect(page.getByText("응답에 실패했습니다.", { exact: true })).toHaveCount(0);
});
