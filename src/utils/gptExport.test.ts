import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { buildGptExportPayload, parseQuestionSelectionRange } from "./gptExport";

const baseEntry: WrongAnswerEntry = {
  id: "sheet",
  subject: "수학",
  title: "모의고사",
  question: "1. 첫 문제\n① A\n② B\n\n2. 둘째 문제\n① C\n② D",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey: [
    {
      id: "a1",
      questionNumber: "1",
      answer: "②",
      explanation: "첫 문제 풀이",
      importantPoints: ["오답 포인트"],
    },
  ],
  figures: [
    {
      id: "f1",
      questionNumber: "1",
      title: "그래프",
      caption: "증가 그래프",
      image: "graph.png",
      source: "gpt_cleaned",
    },
  ],
  learningBlocks: [{ id: "l1", type: "concept", title: "핵심", content: "일차함수" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("gptExport utilities", () => {
  it("parses mixed question ranges", () => {
    expect(parseQuestionSelectionRange("1-5, 7, 10-12")).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "7",
      "10",
      "11",
      "12",
    ]);
  });

  it("exports only selected questions with selected include options", () => {
    const output = buildGptExportPayload({
      entry: baseEntry,
      allEntries: [baseEntry],
      currentQuestionNumber: "1",
      rangeMode: "manual-range",
      manualRange: "1",
      format: "prompt",
      includeQuestion: true,
      includeChoices: true,
      includeFigures: true,
      includeAnswers: true,
      includeExplanations: true,
      includeWrongPoints: true,
      includeLearning: true,
    });

    expect(output).toContain("첫 문제");
    expect(output).not.toContain("둘째 문제");
    expect(output).toContain("증가 그래프");
    expect(output).toContain("첫 문제 풀이");
    expect(output).toContain("일차함수");
  });
});
