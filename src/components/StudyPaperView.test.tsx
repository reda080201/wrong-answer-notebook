import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { resolveEntryQuestionStimuli } from "../features/exam/services/examSession";
import StudyPaperView from "./StudyPaperView";

vi.mock("../api", () => ({
  getImageUrl: vi.fn((filename: string) => Promise.resolve(`mock://${filename}`)),
}));

describe("StudyPaperView shared passage figures", () => {
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
