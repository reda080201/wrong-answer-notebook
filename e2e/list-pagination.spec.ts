import { test, expect } from "@playwright/test";
test("300 synthetic entries use batches and native keyboard activation", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    const entries = Array.from({ length: 300 }, (_, i) => ({ id: `batch-${i}`, title: `합성 항목 ${String(i).padStart(3, "0")}`, subject: "수학", question: `1. 합성 문항 ${i}`, entryKind: "wrong_answer", questionImages: [], difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], mastered: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
    localStorage.setItem("wrong-answer-theme", "light");
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries }));
  });
  page.on("pageerror", error => console.error(error.message));
  await page.goto("/");
  await page.screenshot({ path: "test-results/list-initial.png" });
  await page.getByRole("button", { name: "오답노트", exact: true }).click();
  await expect(page.locator(".entry-card")).toHaveCount(30);
  const more = page.getByRole("button", { name: "30개 더 보기" });
  await more.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".entry-card")).toHaveCount(60);
  await expect(more).toBeFocused();
  for (let batch = 2; batch < 10; batch++) await more.click();
  await expect(page.locator(".entry-card")).toHaveCount(300);
  await expect(page.locator(".entry-card__main", { hasText: "합성 항목 299" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "자료 검색" });
  await search.fill("합성 항목 299");
  await expect(page.locator(".entry-card")).toHaveCount(1);
  await search.fill("");
  await expect(page.locator(".entry-card")).toHaveCount(30);
  const first = page.locator(".entry-card__main").first();
  await first.focus(); await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-current", "page");
  const second = page.locator(".entry-card__main").nth(1);
  await second.focus(); await page.keyboard.press("Space");
  await expect(second).toHaveAttribute("aria-current", "page");
  for (const width of [680, 768, 1024, 1100, 1200]) {
    await page.setViewportSize({ width, height: 750 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/list-${width}.png` });
  }
});
