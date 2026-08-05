import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { DEFAULT_EXAM_PRINT_PREFERENCES } from "../../../utils/viewPreferences";
import { buildExamPrintModel } from "./buildExamPrintModel";

const entry: WrongAnswerEntry = {
  id: "sheet-export",
  title: "Alpha 모의고사",
  subject: "수학",
  entryKind: "problem_sheet",
  question: "[문제 1] 조건 A\n[FIGURE:figure-1]\n① 1\n② 2",
  questionImages: ["question-image.png"],
  sourcePageImages: ["source-page.png"],
  answerKey: [{ id: "a-1", questionNumber: "1", answer: "②", explanation: "정답 해설", importantPoints: [] }],
  figures: [
    { id: "figure-1", questionNumber: "1", title: "그래프", caption: "그래프 설명", image: "graph.png", source: "original" },
    { id: "figure-2", questionNumber: "1", title: "설명 도표", caption: "이미지 없는 설명", source: "described_only" },
  ],
  difficult: false,
  difficulty: "none",
  myAnswer: "①",
  correctAnswer: "",
  explanationParts: [],
  memo: "기존 메모",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("buildExamPrintModel", () => {
  it("builds a retake model without answers, explanations, or prior work", () => {
    const model = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: DEFAULT_EXAM_PRINT_PREFERENCES,
      scope: "whole",
    });

    expect(JSON.stringify(model)).not.toContain("정답 해설");
    expect(JSON.stringify(model)).not.toContain("\"②\"");
    expect(JSON.stringify(model)).not.toContain("기존 메모");
    expect(model.includeAnswerSheet).toBe(true);
  });

  it("keeps an unplaced described-only figure as a caption-only item", () => {
    const model = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: DEFAULT_EXAM_PRINT_PREFERENCES,
      scope: "current",
    });

    const described = model.questions[0]?.figures.find((figure) => figure.id === "figure-2");
    expect(described?.source).toBe("described_only");
    expect(described?.image).toBeUndefined();
  });

  it("includes original pages only when the print option is enabled", () => {
    const hidden = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: DEFAULT_EXAM_PRINT_PREFERENCES,
      scope: "whole",
    });
    const shown = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: { ...DEFAULT_EXAM_PRINT_PREFERENCES, includeSourcePages: true },
      scope: "whole",
    });

    expect(hidden.sourcePageImages).toEqual([]);
    expect(shown.sourcePageImages).toEqual(["source-page.png"]);
  });

  it("preserves the requested question order while resolving question labels", () => {
    const multiQuestionEntry: WrongAnswerEntry = {
      ...entry,
      question: "[문제 1] 첫 문항\n① 1\n[문제 2] 둘째 문항\n① 2",
    };

    const model = buildExamPrintModel({
      entry: multiQuestionEntry,
      questionNumbers: ["2", "1"],
      preferences: DEFAULT_EXAM_PRINT_PREFERENCES,
    });

    expect(model.questions.map((question) => question.questionNumber)).toEqual(["2", "1"]);
    expect(model.questions.map((question) => question.displayNumber)).toEqual(["2", "1"]);
  });

  it("resolves automatic print layout and orientation conservatively", () => {
    const shortEntry: WrongAnswerEntry = {
      ...entry,
      question: [1, 2, 3, 4].map((number) => `[문제 ${number}] 짧은 문항\n① 1\n② 2`).join("\n"),
      figures: [],
    };
    const automatic = buildExamPrintModel({
      entry: shortEntry,
      questionNumbers: ["1", "2", "3", "4"],
      preferences: { ...DEFAULT_EXAM_PRINT_PREFERENCES, layout: "auto", orientation: "auto" },
    });
    const withFigure = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: { ...DEFAULT_EXAM_PRINT_PREFERENCES, layout: "auto", orientation: "auto" },
    });

    expect(automatic.resolvedPaperSize).toBe("a4");
    expect(automatic.resolvedLayout).toBe("columns");
    expect(automatic.resolvedOrientation).toBe("landscape");
    expect(withFigure.resolvedLayout).toBe("single");
    expect(withFigure.resolvedOrientation).toBe("landscape");
  });

  it("honors explicit layout and orientation choices", () => {
    const model = buildExamPrintModel({
      entry,
      questionNumbers: ["1"],
      preferences: {
        ...DEFAULT_EXAM_PRINT_PREFERENCES,
        paperSize: "letter",
        layout: "columns",
        orientation: "portrait",
      },
    });

    expect(model.resolvedPaperSize).toBe("letter");
    expect(model.resolvedLayout).toBe("columns");
    expect(model.resolvedOrientation).toBe("portrait");
  });
});
