import { expect, test, type Page } from "@playwright/test";

const entries = [
  {
    id: "shell-sheet",
    subject: "수학",
    title: "합성 UI 시험지",
    question: "1. 다음 식의 값을 구하여라.\n① 1\n② 2\n③ 3",
    questionImages: [],
    entryKind: "problem_sheet",
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: ["shell-e2e"],
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    mastered: false,
  },
  {
    id: "shell-lecture",
    subject: "수학",
    title: "합성 함수 특강",
    question: "함수의 핵심 개념",
    questionImages: [],
    entryKind: "lecture",
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    learningBlocks: [{ id: "lecture-block", type: "concept", title: "핵심 개념", content: "함수의 정의와 그래프를 연결한다." }],
    memo: "",
    annotations: [],
    tags: ["shell-e2e"],
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    mastered: false,
  },
];

async function seedEntries(page: Page) {
  await page.addInitScript((seed) => {
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: seed }));
    localStorage.removeItem("wrong-answer-app-sidebar-collapsed");
    localStorage.removeItem("wrong-answer-entry-pane-collapsed");
    localStorage.removeItem("wrong-answer-entry-pane-width");
  }, entries);
}

for (const viewport of [{ width: 1100, height: 750 }, { width: 1536, height: 864 }]) {
  test(`shell panes stay usable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedEntries(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "시험지함" }).click();
    await page.locator(".entry-card", { hasText: "합성 UI 시험지" }).click();
    const detail = page.locator(".detail-panel");
    await expect(detail).toBeVisible();
    const initialWidth = (await detail.boundingBox())?.width ?? 0;

    await page.getByRole("button", { name: "항목 목록 접기" }).click();
    const afterEntryCollapse = (await detail.boundingBox())?.width ?? 0;
    expect(afterEntryCollapse).toBeGreaterThan(initialWidth);
    await expect(page.getByRole("button", { name: "항목 목록 펼치기" })).toBeVisible();

    await page.getByRole("button", { name: "앱 사이드바 접기" }).click();
    await expect(page.getByRole("button", { name: "앱 사이드바 펼치기" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({ path: testInfo.outputPath(`ui-shell-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}

test("lecture fullscreen occupies the viewport and closes with Escape", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await seedEntries(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "특강자료" }).click();
  await page.locator(".entry-card", { hasText: "합성 함수 특강" }).click();
  const trigger = page.getByRole("button", { name: "특강 전체 화면" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "합성 함수 특강 전체 화면" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(1099);
  expect(box?.height).toBeGreaterThanOrEqual(749);
  await page.screenshot({ path: testInfo.outputPath("lecture-fullscreen-1100x750.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
