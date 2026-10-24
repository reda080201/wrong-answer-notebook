import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openSyntheticSheet, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const layout = await page.evaluate(() => ({
    fonts: document.fonts.status,
    readers: [...document.querySelectorAll<HTMLElement>(".exam-paper-reader")].map(reader => ({ state: reader.dataset.paperLayoutState, mode: reader.className })),
    pages: [...document.querySelectorAll<HTMLElement>(".exam-paper-page")].map(element => ({
      page: element.dataset.paperPage, oversized: element.classList.contains("exam-paper-page--oversized"),
      width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      offsetHeight: element.offsetHeight, zoom: getComputedStyle(element).zoom,
      columns: [...element.querySelectorAll<HTMLElement>(".exam-paper-page__column")].map(column => ({ width: column.offsetWidth, height: column.offsetHeight })),
      items: [...element.querySelectorAll<HTMLElement>("[data-paper-item]")].map(item => {
        const host = document.createElement("div"); host.className = "exam-paper-measure";
        const clone = item.cloneNode(true) as HTMLElement; clone.removeAttribute("data-paper-item");
        host.append(clone); element.closest(".exam-paper-reader")!.append(host);
        host.style.width = "339px"; const narrow = clone.offsetHeight;
        host.style.width = "706px"; const wide = clone.offsetHeight;
        host.remove();
        return { id: item.dataset.paperItem, height: item.offsetHeight, narrow, wide, width: item.offsetWidth, font: getComputedStyle(item).font, margin: getComputedStyle(item).marginBottom };
      }),
    })),
    sessions: JSON.parse(localStorage.getItem("wrong-answer-exam-sessions") || "[]").map((session: { id: string; entryId: string; mode: string; status: string; currentQuestionIndex: number }) => ({ id: session.id, entryId: session.entryId, mode: session.mode, status: session.status, currentQuestionIndex: session.currentQuestionIndex })),
  }));
  const path = info.outputPath("a4-layout-state.json");
  await writeFile(path, JSON.stringify(layout, null, 2));
  await info.attach("a4-layout-state", { path, contentType: "application/json" });
});

const sizes = [{ width: 1100, height: 750 }, { width: 1280, height: 720 }, { width: 1536, height: 970 }, { width: 1920, height: 1080 }];
const figure = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect width="240" height="140" fill="white"/><path d="M20 110H220 M120 10V130 M35 25Q120 185 205 25" stroke="black" fill="none" stroke-width="2"/><text x="210" y="130">x</text><text x="130" y="20">y</text></svg>').toString("base64");
const entry = {
  ...syntheticLifecycleEntry,
  structuredQuestions: syntheticLifecycleEntry.structuredQuestions.map((question, index) => ({
    ...question,
    questionType: index === 5 ? "essay" : question.questionType,
    choices: index === 5 ? [] : question.choices,
    contentSegments: [
      ...question.contentSegments,
      { id: `condition-${index}`, type: "condition", label: "(가)", text: "함수는 모든 실수에서 연속이다." },
      ...(index === 3 ? [{ id: "table", type: "table", rows: [["x", "0", "1"], ["f(x)", "1", "2"]] }] : []),
      ...(index === 4 ? [{ id: "figure", type: "figure", figureId: "parabola" }] : []),
      ...(index === 28 ? [{ id: "oversized", type: "text", text: "긴 지문에서도 마지막 문장과 다음 페이지가 겹치지 않아야 합니다. ".repeat(180) }] : []),
    ],
    figureIds: index === 4 ? ["parabola"] : [],
  })),
  figures: [{ id: "parabola", questionNumber: "5", title: "이차함수", caption: "", source: "original", image: "img_a4_fixture", original: { image: "img_a4_fixture" } }],
};

for (const size of sizes) {
  for (const navigation of ["vertical-pages", "horizontal-pages"] as const) {
    test(`A4 ${navigation} ${size.width}x${size.height}`, async ({ page }, info) => {
      info.setTimeout(180_000);
      await page.setViewportSize(size);
      await page.addInitScript(({ entry, navigation, figure }) => {
        localStorage.clear();
        localStorage.setItem("wrong-answer-e2e-seeded", "true");
        localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [entry] }));
        localStorage.setItem("wrong-answer-knowledge-graph", JSON.stringify({ entities: [], relations: [], questionLinks: [] }));
        localStorage.setItem("wrong-answer-settings", JSON.stringify({ examPreferences: { paperNavigation: navigation, realExamAnswerSheetOpen: false, autoAdvanceOnAnswer: false } }));
        localStorage.setItem("img_a4_fixture", figure);
      }, { entry, navigation, figure });
      await page.goto("/");
      await openSyntheticSheet(page);
      const examDisplayButton = page.getByRole("group", { name: "문제지 표시 방식" }).getByTestId("problem-sheet-display-exam");
      await expect(examDisplayButton).toHaveText(/^(원본|텍스트) 시험지$/);
      await examDisplayButton.click();
      for (const surface of ["paper", "practice", "real"] as const) {
        if (surface === "practice") await page.getByRole("button", { name: "문제 풀기", exact: true }).click();
        if (surface === "real") {
          await page.getByRole("button", { name: "실전 모드", exact: true }).click();
          await page.getByRole("dialog", { name: "실전 모의고사 시작" }).getByRole("button", { name: "실전 모드 시작" }).click();
        }
        info.annotations.push({ type: "surface", description: surface });
        const reader = surface === "paper" ? page.locator(".study-paper .exam-paper-reader") : surface === "practice" ? page.locator(".exam-session-body .exam-paper-reader") : page.locator(".real-exam-paper .exam-paper-reader");
        await expect.poll(() => reader.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
        await expect(reader).toHaveAttribute("data-paper-layout-state", "ready");
        await expect(reader.locator("[data-paper-item]")).toHaveCount(30);
        await expect(reader.locator(".exam-paper-page").first()).toBeVisible();
        await expect.poll(() => reader.locator(".exam-paper-page--oversized").count()).toBeGreaterThan(0);
        await expect(reader).toHaveClass(new RegExp(navigation));
        const readBounds = () => reader.evaluate(element => [...element.querySelectorAll<HTMLElement>(".exam-paper-page:not([hidden])")].map(page => {
          const rect = page.getBoundingClientRect();
          return {
            ratio: rect.width / rect.height,
            width: rect.width, height: rect.height, canonicalHeight: page.offsetHeight,
            state: element.dataset.paperLayoutState,
            items: [...page.querySelectorAll<HTMLElement>("[data-paper-item]")].map(item => ({ id: item.dataset.paperItem, actual: item.offsetHeight, measured: item.dataset.paperMeasuredHeight, images: [...item.querySelectorAll("img")].map(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })) })),
            oversized: page.classList.contains("exam-paper-page--oversized"),
            overflow: page.scrollWidth - page.clientWidth,
            contained: [...page.querySelectorAll<HTMLElement>("[data-paper-item]")].every(item => {
              const box = item.getBoundingClientRect();
              return box.left >= rect.left && box.right <= rect.right + 1 && box.bottom <= rect.bottom - 12;
            }),
          };
        }));
        let bounds = await readBounds();
        // Earlier awaits can be followed by a lazy-image load or React node
        // replacement. Read readiness and geometry in the same DOM snapshot;
        // intrinsic growth can precede load delivery, so also require the
        // committed height model to cover the visible canonical box (1px rounding).
        // retain the strict, one-shot geometry assertions below.
        await expect.poll(async () => {
          bounds = await readBounds();
          return bounds.length > 0 && bounds.every(bound => bound.state === "ready" && bound.items.every(item => Number.isFinite(Number(item.measured)) && item.actual <= Number(item.measured) + 1 && item.images.every(image => image.complete && image.width > 0)));
        }).toBe(true);
        await writeFile(info.outputPath(`a4-bounds-${surface}.json`), JSON.stringify(bounds, null, 2));
        for (const bound of bounds) {
          expect(bound.overflow).toBeLessThanOrEqual(1);
          expect(bound.contained).toBe(true);
          if (!bound.oversized) expect(bound.ratio).toBeCloseTo(210 / 297, 2);
        }
        await page.screenshot({ path: info.outputPath(`${surface}-${navigation}-${size.width}.png`) });
        if (navigation === "horizontal-pages") {
          const top = reader.getByRole("navigation", { name: "시험지 페이지 상단 이동" });
          await expect(top.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
          await top.getByRole("button", { name: "다음 페이지" }).click();
          await expect(reader.locator("[data-paper-page='2']")).toBeVisible();
          await expect(reader.locator("[data-paper-page='1']")).toBeHidden();
          while (await top.getByRole("button", { name: "다음 페이지" }).isEnabled()) await top.getByRole("button", { name: "다음 페이지" }).click();
          await expect(reader.locator("[data-paper-item]").last()).toBeVisible();
          await page.screenshot({ path: info.outputPath(`${surface}-last-${size.width}.png`) });
        } else {
          await reader.locator("[data-paper-item]").last().scrollIntoViewIfNeeded();
          await expect(reader.locator("[data-paper-item]").last()).toBeInViewport();
        }
        if (surface !== "paper") {
          const dock = page.getByRole("navigation", { name: surface === "practice" ? "문항 이동" : "실전 문항 이동", exact: true });
          expect((await dock.boundingBox())?.height).toBeLessThanOrEqual(52);
          await page.getByRole("button", { name: "시험 닫기", exact: true }).click();
        }
      }
    });
  }
}

test("remeasures late content growth after a page move without clipping", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await page.addInitScript(entry => {
    localStorage.clear();
    localStorage.setItem("wrong-answer-e2e-seeded", "true");
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [entry] }));
    localStorage.setItem("wrong-answer-exam-sessions", "[]");
    localStorage.setItem("wrong-answer-generated-exams", "[]");
    localStorage.setItem("wrong-answer-knowledge-graph", JSON.stringify({ entities: [], relations: [], questionLinks: [] }));
    localStorage.setItem("wrong-answer-theme", "light");
  }, syntheticLifecycleEntry);
  await page.goto("/"); await openSyntheticSheet(page);
  await page.getByTestId("problem-sheet-display-exam").click();
  const reader = page.locator(".study-paper .exam-paper-reader");
  await expect(reader).toHaveAttribute("data-paper-layout-state", "ready");
  const target = reader.locator('[data-paper-number="20"]');
  // Simulate an asynchronous image/renderer changing an already paginated item.
  await target.evaluate(element => {
    const style = document.createElement("style");
    style.textContent = `[data-paper-number="${(element as HTMLElement).dataset.paperNumber}"]::after { content: "지연된 콘텐츠의 끝"; display: block; height: 1400px; }`;
    document.head.append(style);
  });
  const pageWithTarget = reader.locator(".exam-paper-page").filter({ has: page.locator('[data-paper-number="20"]') });
  await expect(pageWithTarget).toHaveClass(/exam-paper-page--oversized/);
  await expect(reader).toHaveAttribute("data-paper-layout-state", "ready");
  await expect(reader.locator("[data-paper-item]")).toHaveCount(30);
  await expect(reader.locator('[data-paper-number="30"]')).toBeAttached();
});

test("normal A4 pages keep their ratio when grid pages have different heights and zoom", async ({ page }) => {
  await page.setContent('<main class="exam-paper-reader"><div class="exam-paper-compositor"><section class="exam-paper-page">short page</section><section class="exam-paper-page exam-paper-page--oversized"><div style="height:1600px">long page</div></section><section class="exam-paper-page">last page</section></div></main>');
  await page.addStyleTag({ path: resolve("src/components/ExamPaperCompositor.css") });
  for (const scale of [0.65, 0.8, 1, 1.25]) {
    await page.locator(".exam-paper-reader").evaluate((element, scale) => (element as HTMLElement).style.setProperty("--paper-scale", String(scale)), scale);
    const bounds = await page.locator(".exam-paper-page:not(.exam-paper-page--oversized)").evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return rect.width / rect.height; }));
    for (const ratio of bounds) expect(ratio).toBeCloseTo(210 / 297, 2);
  }
});
