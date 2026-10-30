import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

test("focus exit restores the opener and uses one control dock", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 750 });
  await seedBrowserStorage(page, [{ ...syntheticLifecycleEntry, entryKind: "wrong_answer", title: "$\\frac{1}{2}$", question: "$\\frac{1}{2}$", structuredQuestions: [], questionContentSegments: {}, answerKey: [], questionMeta: [] }]);
  await page.goto("/");
  await page.getByRole("button", { name: "오답노트", exact: true }).click();
  await page.getByRole("button", { name: /수식이 포함된 오답/ }).click();
  const opener = page.getByRole("button", { name: "집중 보기", exact: true });
  await opener.click();
  await expect(page.locator('.focused-sheet-nav--single strong')).toHaveText("수식이 포함된 오답");
  await expect(page.getByLabel("학습 빠른 조작")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.getByLabel("학습 빠른 조작")).toBeVisible();
});

test("sharing cancel returns focus without granting answer sharing", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 750 });
  await seedBrowserStorage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "AI 학습 대화 열기" }).click();
  const panel = page.getByRole("dialog", { name: "AI 학습 대화" });
  await panel.locator('.ai-material-picker > summary').click();
  const answer = panel.getByRole("checkbox", { name: "정답", exact: true });
  await answer.click();
  await page.getByRole("dialog", { name: "정답·해설 공유 허용" }).getByRole("button", { name: "취소", exact: true }).click();
  await expect(answer).not.toBeChecked();
  await expect(answer).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("textbox", { name: "메시지", exact: true })).toBeVisible();
});
