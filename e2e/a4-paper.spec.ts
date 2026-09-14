import { expect, test } from "@playwright/test";
import { openSyntheticSheet, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

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
      await page.getByRole("group", { name: "문제지 표시 방식" }).getByRole("button", { name: "시험지", exact: true }).click();
      for (const surface of ["paper", "practice", "real"] as const) {
        if (surface === "practice") await page.getByRole("button", { name: "문제 풀기", exact: true }).click();
        if (surface === "real") {
          await page.getByRole("button", { name: "실전 모드", exact: true }).click();
          await page.getByRole("dialog", { name: "실전 모의고사 시작" }).getByRole("button", { name: "실전 모드 시작" }).click();
        }
        const reader = surface === "paper" ? page.locator(".study-paper .exam-paper-reader") : surface === "practice" ? page.locator(".exam-session-body .exam-paper-reader") : page.locator(".real-exam-paper .exam-paper-reader");
        await expect(reader.locator("[data-paper-item]")).toHaveCount(30);
        await expect(reader.locator(".exam-paper-page").first()).toBeVisible();
        await expect.poll(() => reader.locator(".exam-paper-page--oversized").count()).toBeGreaterThan(0);
        await expect(reader).toHaveClass(new RegExp(navigation));
        const bounds = await reader.evaluate(element => [...element.querySelectorAll<HTMLElement>(".exam-paper-page:not([hidden])")].map(page => {
          const rect = page.getBoundingClientRect();
          return {
            ratio: rect.width / rect.height,
            oversized: page.classList.contains("exam-paper-page--oversized"),
            overflow: page.scrollWidth - page.clientWidth,
            contained: [...page.querySelectorAll<HTMLElement>("[data-paper-item]")].every(item => {
              const box = item.getBoundingClientRect();
              return box.left >= rect.left && box.right <= rect.right + 1 && box.bottom <= rect.bottom - 12;
            }),
          };
        }));
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
