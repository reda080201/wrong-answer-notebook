import type { Page } from "@playwright/test";

const now = "2026-08-12T00:00:00.000Z";

function question(number: number) {
  const multipleChoice = number % 2 === 1;
  const choices = multipleChoice ? ["① 1", "② 2", "③ 3", "④ 4", "⑤ 5"] : [];
  return {
    questionNumber: String(number),
    questionText: `${number}번 합성 시험 문항입니다. \\frac{${number}}{2}의 값을 구하시오.`,
    questionType: multipleChoice ? "multiple_choice" : "short_answer",
    points: number <= 15 ? 1 : undefined,
    conditions: [],
    equations: [`x = ${number}`],
    choices,
    contentSegments: [
      { id: `text-${number}`, type: "text", text: `${number}번 합성 시험 문항입니다.` },
      { id: `equation-${number}`, type: "equation", latex: `\\frac{${number}}{2}`, display: true },
    ],
    figureIds: [],
  };
}

export const syntheticLifecycleEntry = {
  id: "e2e-synthetic-sheet",
  subject: "수학",
  title: "E2E 합성 30문항 시험지",
  entryKind: "problem_sheet",
  question: Array.from({ length: 30 }, (_, index) => `${index + 1}. ${index + 1}번 합성 시험 문항입니다.`).join("\\n"),
  structuredQuestions: Array.from({ length: 30 }, (_, index) => question(index + 1)),
  questionContentSegments: Object.fromEntries(Array.from({ length: 30 }, (_, index) => {
    const item = question(index + 1);
    return [item.questionNumber, item.contentSegments];
  })),
  answerKey: Array.from({ length: 30 }, (_, index) => ({
    id: `answer-${index + 1}`,
    questionNumber: String(index + 1),
    answer: index % 2 === 1 ? `short-${index + 1}` : "①",
    explanation: `${index + 1}번 해설`,
    importantPoints: [],
  })),
  questionImages: [],
  sourcePageImages: [],
  figures: [],
  explanationParts: [],
  learningBlocks: [],
  annotations: [],
  checklist: [],
  tags: ["e2e", "synthetic"],
  memo: "",
  myAnswer: "",
  correctAnswer: "",
  difficulty: "none",
  difficult: false,
  mastered: false,
  createdAt: now,
  updatedAt: now,
};

export async function seedBrowserStorage(page: Page, entries: unknown[] = [syntheticLifecycleEntry]) {
  await page.addInitScript((seed) => {
    if (localStorage.getItem("wrong-answer-e2e-seeded") === "true") return;
    localStorage.clear();
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: seed }));
    localStorage.setItem("wrong-answer-exam-sessions", "[]");
    localStorage.setItem("wrong-answer-generated-exams", "[]");
    localStorage.setItem("wrong-answer-gpt-solution-roundtrip-drafts", "[]");
    localStorage.setItem("wrong-answer-library-folders", "[]");
    localStorage.setItem("wrong-answer-theme", "light");
    localStorage.removeItem("wrong-answer-app-sidebar-collapsed");
    localStorage.removeItem("wrong-answer-entry-pane-collapsed");
    localStorage.removeItem("wrong-answer-entry-pane-width");
    localStorage.setItem("wrong-answer-e2e-seeded", "true");
  }, entries);
}

export async function openSyntheticSheet(page: Page) {
  await page.getByRole("button", { name: "시험지함" }).click();
  await page.locator(".entry-card", { hasText: syntheticLifecycleEntry.title }).click();
}
