import { expect, test } from "@playwright/test";
import { seedBrowserStorage, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const focusEntry = {
  ...syntheticLifecycleEntry,
  title: "집중 보기 합성 시험지",
  structuredQuestions: syntheticLifecycleEntry.structuredQuestions.slice(0, 5).map((question, index) => ({
    ...question,
    passage: index > 1 && index < 5 ? "다음 지문을 읽고 물음에 답하시오." : undefined,
    stimulusGroupId: index > 1 && index < 5 ? "stimulus-a" : undefined,
    question: `${question.question} 긴 본문과 조건을 읽고 답하시오.`,
    contentSegments: [...question.contentSegments, { id: `condition-${index}`, type: "condition", label: "(가)", text: "함수는 연속이다." }],
  })),
  answerKey: syntheticLifecycleEntry.answerKey.slice(0, 5),
};

test.describe("two-question focus view", () => {
  test("uses its own spreads and keeps question view unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
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

    await focus.getByRole("button", { name: "다음" }).first().click();
    await expect(focus.locator(".question-focus-spread:not([hidden]) footer")).toHaveText("3–4 / 5");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(2);
    await focus.getByRole("button", { name: "다음" }).first().click();
    await expect(focus.locator(".question-focus-spread:not([hidden]) footer")).toHaveText("5 / 5");
    await expect(focus.locator(".question-focus-spread:not([hidden]) .question-focus-item")).toHaveCount(1);
    const overflow = await focus.evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "test-results/two-question-focus-1920x1080.png", fullPage: true });
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
  });
});
