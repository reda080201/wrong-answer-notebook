import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  openSyntheticSheet,
  seedBrowserStorage,
  syntheticLifecycleEntry,
} from "./fixtures/syntheticLifecycle";

const viewport = { width: 1100, height: 750 };

async function openPaper(page: Page) {
  await page.setViewportSize(viewport);
  await seedBrowserStorage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openSyntheticSheet(page);
  await expect(page.locator(".study-paper").first()).toBeVisible();
}

async function documentHorizontalOverflow(page: Page) {
  return page.evaluate(() => Math.max(
    0,
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
}

async function expectNoOverlap(first: Locator, second: Locator) {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!firstBox || !secondBox) return;

  const overlaps = firstBox.x < secondBox.x + secondBox.width
    && firstBox.x + firstBox.width > secondBox.x
    && firstBox.y < secondBox.y + secondBox.height
    && firstBox.y + firstBox.height > secondBox.y;
  expect(overlaps).toBe(false);
}

test.describe("runtime/UI convergence", () => {
  test("paper search is triggered, removable with Escape, and stays outside the paper", async ({ page }, testInfo) => {
    await openPaper(page);

    const searchTrigger = page.getByRole("button", { name: "시험지 검색", exact: true });
    const searchInput = page.getByRole("searchbox", { name: "시험지 안에서 검색" });
    const paper = page.locator(".study-paper").first();

    await expect(searchInput).toHaveCount(0);
    await searchTrigger.click();
    await expect(searchInput).toBeVisible();
    await expectNoOverlap(page.locator("#problem-sheet-search"), paper);
    await expect(documentHorizontalOverflow(page)).resolves.toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("problem-sheet-search-and-math.png"), fullPage: true });

    await searchInput.fill("합성 시험");
    await page.keyboard.press("Escape");
    await expect(searchInput).toHaveCount(0);
    await expect(searchTrigger).toBeVisible();
    await expect(documentHorizontalOverflow(page)).resolves.toBeLessThanOrEqual(1);
  });

  test("core runtime surfaces compute the Pretendard family", async ({ page }) => {
    await openPaper(page);

    const surfaces = page.locator("html, body, #root, .app-shell, .app-sidebar, .main, .detail-panel, .study-paper");
    await expect(surfaces).not.toHaveCount(0);
    const fontFamilies = await surfaces.evaluateAll((elements) => elements.map((element) => ({
      selector: element.tagName.toLowerCase() + (element.className ? `.${String(element.className).split(/\\s+/).join(".")}` : ""),
      fontFamily: getComputedStyle(element).fontFamily,
    })));

    for (const surface of fontFamilies) {
      expect(surface.fontFamily, surface.selector).toMatch(/Pretendard/i);
    }
  });

  test("settings and the sidebar footer remain reachable at 1100x750", async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const entries = Array.from({ length: 36 }, (_, index) => ({
      ...syntheticLifecycleEntry,
      id: `e2e-sidebar-${index}`,
      subject: `과목 ${String(index + 1).padStart(2, "0")}`,
      title: `사이드바 스크롤 시험지 ${index + 1}`,
    }));
    await seedBrowserStorage(page, entries);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const settingsButton = page.getByRole("button", { name: /설정/ }).first();
    await settingsButton.click();
    const settingsPanel = page.locator(".settings-modal-panel");
    await expect(settingsPanel).toBeVisible();
    await page.getByRole("button", { name: "AI & 연결", exact: true }).click();

    await expect.poll(async () => settingsPanel.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(0);
    await settingsPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => settingsPanel.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect.poll(async () => settingsPanel.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath("settings-scroll-reachability.png"), fullPage: true });

    await page.getByRole("button", { name: "닫기", exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeHidden();
    await page.getByRole("button", { name: "시험지함", exact: true }).click();

    const sidebarScrollRegion = page.locator(".app-sidebar-scroll-region");
    await expect.poll(async () => sidebarScrollRegion.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(0);
    await sidebarScrollRegion.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => sidebarScrollRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    const sidebarFooter = page.locator(".sidebar-footer");
    await expect(sidebarFooter).toBeInViewport();
    await expect(page.getByRole("button", { name: "+ 시험지 가져오기", exact: true })).toBeInViewport();
    await expect(documentHorizontalOverflow(page)).resolves.toBeLessThanOrEqual(1);
  });

  test("Learning Hub and Question Bank keep Pretendard, compact layout, and MathText", async ({ page }, testInfo) => {
    const learningEntry = {
      ...syntheticLifecycleEntry,
      learningBlocks: [{
        id: "e2e-learning-block",
        type: "formula",
        title: "아주 긴 합성함수 미분 학습 개념 이름과 적용 조건",
        content: "합성함수의 극한은 /lim과 \\frac{1}{2}를 함께 확인합니다.",
        subjectDomain: "math",
        importance: "essential",
        reviewStatus: "draft",
      }],
    };
    await page.setViewportSize(viewport);
    await seedBrowserStorage(page, [learningEntry]);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "학습 허브", exact: true }).click();
    const learningHub = page.getByRole("region", { name: "학습 허브" });
    await expect(learningHub).toBeVisible();
    await expect(page.locator(".app-sidebar [aria-current='page']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /새 오답/ })).toHaveCount(0);
    await expect(learningHub.getByRole("button", { name: "자세히" })).toBeVisible();
    await expect(learningHub.evaluate((element) => getComputedStyle(element).fontFamily)).resolves.toMatch(/Pretendard/i);
    await page.screenshot({ path: testInfo.outputPath("learning-hub-compact.png"), fullPage: true });

    await page.getByRole("button", { name: "문제 은행", exact: true }).click();
    const questionBank = page.locator(".question-bank-view");
    await expect(questionBank).toBeVisible();
    await expect(page.locator(".app-sidebar [aria-current='page']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /새 오답/ })).toHaveCount(0);
    const firstRow = questionBank.locator(".question-bank-card").first();
    await expect(firstRow).toBeVisible();
    await expect.poll(async () => (await firstRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(76);
    await expect.poll(async () => (await firstRow.boundingBox())?.height ?? 0).toBeLessThanOrEqual(88);
    await expect.poll(async () => firstRow.locator(".question-bank-card__detail").evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
    const searchField = questionBank.locator(".question-bank-search .ui-search-field");
    await expect(searchField).toBeVisible();
    await expect.poll(async () => searchField.evaluate((element) => ({ border: getComputedStyle(element).borderWidth, background: getComputedStyle(element).backgroundColor }))).toMatchObject({ border: "1px" });
    const chips = questionBank.locator(".question-bank-card__chips");
    await expect(chips).toBeVisible();
    await expect.poll(async () => chips.evaluate((element) => ({ gap: getComputedStyle(element).gap, count: element.children.length }))).toMatchObject({ gap: "6px" });
    await expect(questionBank.locator(".katex").first()).toBeVisible();
    await expect(questionBank.evaluate((element) => getComputedStyle(element).fontFamily)).resolves.toMatch(/Pretendard/i);
    await page.screenshot({ path: testInfo.outputPath("question-bank-mathtext.png"), fullPage: true });
    await page.getByRole("button", { name: "보관함", exact: true }).click();
    await expect(page.locator(".app-sidebar [aria-current='page']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /새 오답/ })).toHaveCount(0);
    await expect(documentHorizontalOverflow(page)).resolves.toBeLessThanOrEqual(1);
  });

  test("captures compact study destinations across acceptance viewports", async ({ page }, testInfo) => {
    for (const size of [{ width: 1100, height: 750 }, { width: 1366, height: 768 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await seedBrowserStorage(page, [syntheticLifecycleEntry]);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await openSyntheticSheet(page);
      await expect(page.locator(".study-paper").first()).toBeVisible();
      const dock = page.locator(".study-control-bar");
      await expect(dock).toBeVisible();
      await expect.poll(async () => (await dock.boundingBox())?.height ?? 0).toBeLessThanOrEqual(52);
      await page.screenshot({ path: testInfo.outputPath(`problem-sheet-${size.width}x${size.height}.png`), fullPage: true });
    }
  });
});
