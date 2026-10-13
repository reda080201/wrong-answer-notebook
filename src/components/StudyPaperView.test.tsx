import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { resolveEntryQuestionStimuli } from "../features/exam/services/examSession";
import StudyPaperView from "./StudyPaperView";
import { createEmptyEntryDraft } from "../features/entries/model/entryDraft";

vi.mock("./DiagramCard", () => ({ default: () => <div data-testid="diagram">학습 그림</div> }));

vi.mock("../api", () => ({
  getImageUrl: vi.fn((filename: string) => Promise.resolve(`mock://${filename}`)),
}));

describe("StudyPaperView shared passage figures", () => {
  it("makes all learning diagrams accessible only after expanding their section", async () => {
    const entry = { ...createEmptyEntryDraft(), id: "diagrams", createdAt: "", updatedAt: "", question: "1. 문제",
      answerKey: [1, 2, 3].map(number => ({ id: `a${number}`, questionNumber: String(number), answer: "", explanation: "", importantPoints: [], diagramType: "derivative-tangent" as const })) };
    const { container } = render(<StudyPaperView entry={entry} memoMode={false} activeTool="highlight" onAnnotationsChange={vi.fn()} onWikiLinkClick={vi.fn()} existingTargets={new Set()} sheetLayout="single" />);
    expect(screen.queryAllByTestId("diagram")).toHaveLength(0);
    fireEvent.click(screen.getByText("GPT 학습용 시각화 3개"));
    await waitFor(() => expect(screen.getAllByTestId("diagram")).toHaveLength(3));
    expect(container.querySelector(".study-paper-diagrams")).toHaveTextContent("3번 시각화");
  });
  it("renders a figure referenced in a shared passage for canonical questions", async () => {
    const entry = {
      id: "sheet-passage-figure",
      subject: "사회",
      title: "그림이 있는 문제지",
      question: "[지문]\n공통 자료 [FIGURE:passage-f1]\n\n1. 문제 본문",
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
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      mastered: false,
      figures: [{ id: "passage-f1", questionNumber: "1", title: "공통 자료 그림", caption: "자료", image: "passage.png", source: "original" }],
      structuredQuestions: [{
        questionNumber: "1",
        questionText: "문제 본문",
        conditions: [],
        equations: [],
        choices: [],
        contentSegments: [{ id: "question-text", type: "text", text: "문제 본문" }],
        figureIds: [],
      }],
    } as WrongAnswerEntry;
    expect(resolveEntryQuestionStimuli(entry).get("1")?.text).toContain("passage-f1");
    const { container } = render(
      <StudyPaperView
        entry={entry}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
        displayMode="exam"
        paperPresentation="two-question"
      />,
    );

    await waitFor(() => expect(container.querySelector(".exam-passage img")).toHaveAttribute("src", "mock://passage.png"));
    expect(container.querySelector(".exam-passage img")).toHaveAttribute("alt", "공통 자료 그림");
    expect(container.querySelector(".exam-passage")).not.toHaveTextContent("[FIGURE:");
    expect(container.querySelector(".exam-passage")).not.toHaveTextContent("그림 연결 확인 필요");
  });
});
