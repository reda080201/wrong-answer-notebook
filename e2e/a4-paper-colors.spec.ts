import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openSyntheticSheet, syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

const questions = syntheticLifecycleEntry.structuredQuestions.slice(0, 4).map((question, index) => ({
  ...question,
  ...(index === 0 ? { sourceReference: { sourceEntryId: "palette-source", sourceEntryTitle: "색상 회귀 출처", sourceQuestionNumber: "1", sourceStatus: "linked" } } : {}),
  contentSegments: [
    ...question.contentSegments,
    ...(index === 0 ? [{ id: "palette-condition", type: "condition", label: "(가)", text: "함수는 모든 실수에서 연속이다." }] : []),
    ...(index === 3 ? [{ id: "palette-table", type: "table", rows: [["x", "0", "1"], ["f(x)", "1", "2"]] }] : []),
  ],
}));

const entry = {
  ...syntheticLifecycleEntry,
  question: questions.map(question => `${question.questionNumber}. ${question.questionText}`).join("\n"),
  structuredQuestions: questions,
  questionContentSegments: Object.fromEntries(questions.map(question => [question.questionNumber, question.contentSegments])),
  answerKey: syntheticLifecycleEntry.answerKey.slice(0, questions.length),
};

type ColorSample = { color: string; background: string; contrast: number };
type PaperPalette = {
  page: ColorSample;
  body: ColorSample;
  math: ColorSample;
  muted: ColorSample | null;
  table: ColorSample | null;
  selected: ColorSample | null;
  input: ColorSample | null;
  headerActions: ColorSample[];
  colorScheme: string;
  readerTextToken: string;
};

function assertReadable(label: string, sample: ColorSample | null | undefined, minimum = 4.5) {
  expect(sample, `${label} should exist`).not.toBeNull();
  expect(sample!.contrast, `${label} contrast ${sample!.contrast.toFixed(2)}:1 (${sample!.color} on ${sample!.background})`).toBeGreaterThanOrEqual(minimum);
}

async function readPaperPalette(reader: Locator, includeControls: boolean): Promise<PaperPalette> {
  return reader.evaluate((element, controls) => {
    const readerElement = element as HTMLElement;
    const page = readerElement.querySelector<HTMLElement>(".exam-paper-page")!;
    const pageStyle = getComputedStyle(page);
    const rgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const luminance = (value: string) => {
      const channels = rgb(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const sample = (node: Element | null): { color: string; background: string; contrast: number } | null => {
      if (!node) return null;
      const style = getComputedStyle(node);
      const color = style.color;
      const background = style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent"
        ? pageStyle.backgroundColor
        : style.backgroundColor;
      const values = [luminance(color), luminance(background)].sort((a, b) => b - a);
      return { color, background, contrast: (values[0] + 0.05) / (values[1] + 0.05) };
    };
    const item = readerElement.querySelector<HTMLElement>('[data-paper-number="1"]')!;
    const pageSample = sample(page)!;
    return {
      page: pageSample,
      body: sample(item.querySelector(".content-block-text, .question-content-view [data-canonical-segment-id], .question-content-view > p"))!,
      math: sample(item.querySelector(".katex"))!,
      muted: sample(item.querySelector(".question-source-reference, .question-sequence") ?? page.querySelector(".exam-paper-page__number")),
      table: sample(readerElement.querySelector(".question-table-wrap td")),
      selected: controls ? sample(readerElement.querySelector('.real-exam-choices button[aria-pressed="true"]')) : null,
      input: controls ? sample(readerElement.querySelector('.real-exam-answer-field input, .real-exam-answer-field textarea')) : null,
      headerActions: [...page.querySelectorAll(".structured-problem-sheet-actions .btn-secondary")].map(button => sample(button)!).filter(Boolean),
      colorScheme: pageStyle.colorScheme,
      readerTextToken: getComputedStyle(readerElement).getPropertyValue("--text").trim(),
    };
  }, includeControls);
}

async function readMeasurementClone(reader: Locator) {
  return reader.evaluate(element => {
    const readerElement = element as HTMLElement;
    const source = readerElement.querySelector<HTMLElement>('[data-paper-number="1"]')!;
    const page = readerElement.querySelector<HTMLElement>(".exam-paper-page")!;
    const host = document.createElement("div");
    host.className = "exam-paper-measure";
    host.setAttribute("aria-hidden", "true");
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-paper-item");
    host.append(clone);
    readerElement.append(host);
    const pageStyle = getComputedStyle(page);
    const sample = (node: Element | null) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      const color = style.color;
      const background = style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent"
        ? pageStyle.backgroundColor
        : style.backgroundColor;
      return { color, background };
    };
    const result = {
      hostBackground: getComputedStyle(host).backgroundColor,
      hostColor: getComputedStyle(host).color,
      pageBackground: pageStyle.backgroundColor,
      pageTextToken: pageStyle.getPropertyValue("--text").trim(),
      pageMutedToken: pageStyle.getPropertyValue("--text-muted").trim(),
      body: sample(clone.querySelector(".content-block-text, .question-content-view [data-canonical-segment-id], .question-content-view > p")),
      math: sample(clone.querySelector(".katex")),
      hostTextToken: getComputedStyle(host).getPropertyValue("--text").trim(),
      hostMutedToken: getComputedStyle(host).getPropertyValue("--text-muted").trim(),
    };
    host.remove();
    return result;
  });
}

async function inspectSurface(page: Page, info: TestInfo, width: number, surface: "paper" | "practice" | "real", theme: "light" | "dark") {
  if (surface === "practice") await page.getByRole("button", { name: "문제 풀기", exact: true }).click();
  if (surface === "real") {
    await page.getByRole("button", { name: "실전 모드", exact: true }).click();
    await page.getByRole("dialog", { name: "실전 모의고사 시작" }).getByRole("button", { name: "실전 모드 시작" }).click();
  }
  const reader = surface === "paper"
    ? page.locator(".study-paper .exam-paper-reader")
    : surface === "practice"
      ? page.locator(".exam-session-body .exam-paper-reader")
      : page.locator(".real-exam-paper .exam-paper-reader");
  await expect(reader).toHaveAttribute("data-paper-layout-state", "ready");
  await expect(reader.locator(".exam-paper-page").first()).toBeVisible();
  await expect(reader.locator("[data-paper-number='1'] .katex").first()).toBeVisible();

  const hasControls = surface !== "paper";
  if (hasControls) {
    const choice = reader.locator('[data-paper-number="1"] .real-exam-choices button').first();
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(reader.locator('[data-paper-number="2"] .real-exam-answer-field input, [data-paper-number="2"] .real-exam-answer-field textarea')).toBeVisible();
  }

  const palette = await readPaperPalette(reader, hasControls);
  expect(palette.page.background).toBe("rgb(255, 255, 255)");
  expect(palette.colorScheme).toBe("light");
  expect(palette.readerTextToken).toBe(theme === "dark" ? "#e8edf4" : "#1a2332");
  assertReadable(`${theme}/${surface} paper text`, palette.page);
  assertReadable(`${theme}/${surface} question body`, palette.body);
  assertReadable(`${theme}/${surface} math`, palette.math);
  assertReadable(`${theme}/${surface} muted label`, palette.muted);
  assertReadable(`${theme}/${surface} table text`, palette.table);
  if (surface === "paper") {
    expect(palette.headerActions.length).toBeGreaterThanOrEqual(2);
    palette.headerActions.forEach((button, index) => assertReadable(`${theme}/${surface} header action ${index + 1}`, button));
  }
  if (hasControls) {
    assertReadable(`${theme}/${surface} selected choice`, palette.selected);
    assertReadable(`${theme}/${surface} answer input`, palette.input);
  }

  const clone = await readMeasurementClone(reader);
  expect(clone.pageBackground).toBe("rgb(255, 255, 255)");
  expect(clone.hostTextToken).toBe(clone.pageTextToken);
  expect(clone.hostMutedToken).toBe(clone.pageMutedToken);
  expect(clone.body?.background).toBe(clone.pageBackground);
  expect(clone.math?.background).toBe(clone.pageBackground);
  expect(clone.body?.color).toBe(palette.body.color);
  expect(clone.math?.color).toBe(palette.math.color);
  await page.screenshot({ path: info.outputPath(`${theme}-${width}-${surface}.png`) });

  if (surface === "paper") {
    await page.emulateMedia({ media: "print" });
    const printPalette = await readPaperPalette(reader, false);
    expect(printPalette.page.background).toBe("rgb(255, 255, 255)");
    assertReadable(`${theme} print body`, printPalette.body);
    assertReadable(`${theme} print math`, printPalette.math);
    printPalette.headerActions.forEach((button, index) => assertReadable(`${theme} print header action ${index + 1}`, button));
    await page.screenshot({ path: info.outputPath(`${theme}-${width}-paper-print.png`) });
    await page.emulateMedia({ media: "screen" });
  } else {
    await page.getByRole("button", { name: "시험 닫기", exact: true }).click();
  }
}

for (const scenario of [
  { theme: "light", width: 1100 },
  { theme: "light", width: 680 },
  { theme: "dark", width: 1100 },
  { theme: "dark", width: 680 },
] as const) {
  test(`${scenario.theme} A4 palette stays readable at ${scenario.width}px across study and exam surfaces`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 850 });
    await page.addInitScript(({ seededEntry, theme }) => {
      localStorage.clear();
      localStorage.setItem("wrong-answer-e2e-seeded", "true");
      localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [seededEntry] }));
      localStorage.setItem("wrong-answer-knowledge-graph", JSON.stringify({ entities: [], relations: [], questionLinks: [] }));
      localStorage.setItem("wrong-answer-settings", JSON.stringify({ examPreferences: { paperNavigation: "vertical-pages", realExamAnswerSheetOpen: false, autoAdvanceOnAnswer: false } }));
      localStorage.setItem("wrong-answer-theme", theme);
    }, { seededEntry: entry, theme: scenario.theme });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scenario.theme);
    await openSyntheticSheet(page);
    await expect(page.getByRole("group", { name: "문제지 표시 방식" }).getByTestId("problem-sheet-display-exam")).toHaveText(/^(원본|텍스트) 시험지$/);
    await page.getByRole("group", { name: "문제지 표시 방식" }).getByTestId("problem-sheet-display-exam").click();

    for (const surface of ["paper", "practice", "real"] as const) {
      await inspectSurface(page, test.info(), scenario.width, surface, scenario.theme);
    }
  });
}
