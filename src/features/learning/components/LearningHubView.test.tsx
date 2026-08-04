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

  it("keeps a failed card action visible and retries the same operation", async () => {
    const onUpdateBlock = vi.fn().mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce(undefined);
    render(<LearningHubView entries={[entry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={onUpdateBlock} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "검토 완료" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    expect(onUpdateBlock).toHaveBeenCalledTimes(2);
    expect(onUpdateBlock).toHaveBeenLastCalledWith("sheet-1", "block-1", { reviewStatus: "reviewed" });
  });

  it("renders life ethics filters as individually removable chips", () => {
    const ethicsEntry: WrongAnswerEntry = {
      ...entry,
      subject: "생활과 윤리",
      learningBlocks: [{
        id: "ethics-1",
        type: "concept",
        title: "의무론",
        content: "",
        subjectDomain: "life_ethics",
        subjectMetadata: {
          subject: "life_ethics",
          knowledgeType: "thinker",
          thinkers: ["칸트", "롤스"],
          passageClues: ["보편화"],
          rejectedClaims: ["결과만 중시"],
        },
      }],
    };
    render(<LearningHubView entries={[ethicsEntry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={vi.fn().mockResolvedValue(undefined)} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.change(screen.getByRole("combobox", { name: "과목 필터" }), { target: { value: "life_ethics" } });
    fireEvent.click(screen.getByRole("button", { name: "칸트" }));
    fireEvent.click(screen.getByRole("button", { name: "롤스" }));
    fireEvent.click(screen.getByRole("button", { name: "지문 단서" }));
    expect(screen.getByRole("button", { name: "칸트 필터 제거" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "롤스 필터 제거" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지문 단서 필터 제거" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "칸트 필터 제거" }));
    expect(screen.queryByRole("button", { name: "칸트 필터 제거" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "롤스 필터 제거" })).toBeInTheDocument();
  });
});
