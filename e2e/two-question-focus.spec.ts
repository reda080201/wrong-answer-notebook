import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const focusEntry = {
  ...syntheticLifecycleEntry,
  title: "집중 보기 합성 시험지",
  question: "[지문]\n함수의 성질을 이용하여 다음 물음에 답하시오.\n\n1. 첫 번째 문항입니다.\n① 1\n② 2\n③ 3\n④ 4\n⑤ 5\n\n2. 두 번째 문항입니다.\n\n3. 세 번째 문항입니다.\n\n4. 네 번째 문항입니다.\n\n[지문]\n새로운 공통 지문입니다.\n\n5. 마지막 문항입니다.",
  structuredQuestions: syntheticLifecycleEntry.structuredQuestions.slice(0, 5).map((question, index) => ({
    ...question,
    question: `${question.question} 긴 본문과 조건을 읽고 답하시오.`,
    contentSegments: [...question.contentSegments, { id: `condition-${index}`, type: "condition", label: "(가)", text: "함수는 연속이다." }],
  })),
  answerKey: syntheticLifecycleEntry.answerKey.slice(0, 5),
};

test.describe("two-question focus view", () => {
  test("uses its own spreads and keeps question view unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 970 });
    await page.addInitScript(({ entry }) => {
      localStorage.clear();
      localStorage.setItem("wrong-answer-e2e-seeded", "true");
      localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [entry] }));
      localStorage.setItem("wrong-answer-knowledge-graph", JSON.stringify({ entities: [], relations: [], questionLinks: [] }));
      localStorage.setItem("wrong-answer-theme", "light");
      localStorage.setItem("wrong-answer-settings", JSON.stringify({ examPreferences: { paperPresentation: "two-question", paperNavigation: "horizontal-pages" } }));
    }, { entry: focusEntry });
    await page.goto("/");
    await page.getByRole("button", { name: "시험지함" }).click();
    await page.locator(".entry-card", { hasText: focusEntry.title }).click();

    const display = page.getByRole("group", { name: "문제지 표시 방식" });
    await expect(page.locator(".question-focus-reader")).toHaveCount(0);
    await display.getByRole("button", { name: "문항별", exact: true }).click();
    await expect(page.locator(".question-focus-reader")).toHaveCount(0);
    await display.getByRole("button", { name: "시험지", exact: true }).click();
    const focus = page.locator(".question-focus-reader");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(2);
    await expect(focus.locator(".question-focus-spread:not([hidden]) footer")).toHaveText("1–2 / 5");
    await expect(focus.locator(".structured-question-choices li")).toHaveCount(5);
    await page.screenshot({ path: "test-results/focus-1536-choice.png", fullPage: true });

    await focus.getByRole("button", { name: "다음" }).first().click();
    await expect(focus.locator(".question-focus-spread:not([hidden]) footer")).toHaveText("3–4 / 5");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(2);
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-stimulus")).toHaveCount(1);
    await page.screenshot({ path: "test-results/focus-1536-stimulus.png", fullPage: true });
    await focus.getByRole("button", { name: "다음" }).first().click();
    await expect(focus.locator(".question-focus-spread:not([hidden]) footer")).toHaveText("5 / 5");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(1);
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-columns--single")).toBeVisible();
    const overflow = await focus.evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "test-results/focus-1536-first.png", fullPage: true });
  });

  test("falls back to one question per focus page on a narrow surface", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await seedBrowserStorage(page, [focusEntry]);
    await page.addInitScript(() => {
      localStorage.setItem("wrong-answer-settings", JSON.stringify({ examPreferences: { paperPresentation: "two-question" } }));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "시험지함" }).click();
    await page.locator(".entry-card", { hasText: focusEntry.title }).click();
    await page.getByRole("group", { name: "문제지 표시 방식" }).getByRole("button", { name: "시험지", exact: true }).click();
    const focus = page.locator(".question-focus-reader");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(1);
    await expect(focus).toHaveCSS("touch-action", "pan-y");
    await page.screenshot({ path: "test-results/focus-800.png", fullPage: true });
  });
});
