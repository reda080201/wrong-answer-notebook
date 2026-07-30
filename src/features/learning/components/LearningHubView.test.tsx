import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import LearningHubView from "./LearningHubView";

const entry: WrongAnswerEntry = {
  id: "sheet-1", subject: "수학", title: "미분 문제지", question: "1. 문제", questionImages: [], entryKind: "problem_sheet",
  difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", mastered: false,
  learningBlocks: [{ id: "block-1", type: "formula", title: "합성함수 미분", content: "핵심 내용", unit: "미분", importance: "essential", sourceQuestionNumber: "1", commonTraps: ["안쪽 미분 누락"], subjectMetadata: { subject: "math", knowledgeType: "formula", formulaLatex: ["f(g(x))"], whenToUse: ["합성함수"] } }],
};

describe("LearningHubView", () => {
  it("renders math details and opens the linked question", () => {
    const onOpenSource = vi.fn();
    render(<LearningHubView entries={[entry]} onOpenSource={onOpenSource} onOpenCandidateReview={vi.fn()} onUpdateBlock={vi.fn().mockResolvedValue(undefined)} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText("과목별 학습 지식 허브")).toBeInTheDocument();
    expect(screen.getByText("합성함수 미분")).toBeInTheDocument();
    expect(screen.getByText("언제 사용하는가")).toBeInTheDocument();
    expect(screen.getByText("안쪽 미분 누락")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "연결 문제 열기" }));
    expect(onOpenSource).toHaveBeenCalledWith("sheet-1", "1");
  });

  it("filters cards by combined search", () => {
    render(<LearningHubView entries={[entry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={vi.fn().mockResolvedValue(undefined)} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.change(screen.getByRole("textbox", { name: "학습 내용 검색" }), { target: { value: "없는 문자열" } });
    expect(screen.getByText("조건에 맞는 학습 카드가 없습니다.")).toBeInTheDocument();
  });
});
