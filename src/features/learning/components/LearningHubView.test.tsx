import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: "자세히" }));
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

  it("blocks rapid duplicate card mutations before React rerenders", () => {
    let resolveDuplicate: (() => void) | undefined;
    const onDuplicateBlock = vi.fn(() => new Promise<void>((resolve) => { resolveDuplicate = resolve; }));
    render(<LearningHubView entries={[entry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={vi.fn().mockResolvedValue(undefined)} onDuplicateBlock={onDuplicateBlock} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);
    const duplicate = screen.getByRole("button", { name: "복제" });
    fireEvent.click(duplicate);
    fireEvent.click(duplicate);
    expect(onDuplicateBlock).toHaveBeenCalledTimes(1);
    resolveDuplicate?.();
  });

  it("keeps edit input and surfaces a rejected save so the user can submit it again", async () => {
    const onUpdateBlock = vi.fn().mockRejectedValueOnce(new Error("디스크에 저장하지 못했습니다.")).mockResolvedValueOnce(undefined);
    render(<LearningHubView entries={[entry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={onUpdateBlock} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    const title = screen.getByRole("textbox", { name: "제목" });
    fireEvent.change(title, { target: { value: "수정한 합성함수 미분" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("디스크에 저장하지 못했습니다.");
    expect(title).toHaveValue("수정한 합성함수 미분");
    expect(screen.getByRole("button", { name: "취소" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onUpdateBlock).toHaveBeenCalledTimes(2));
    expect(onUpdateBlock).toHaveBeenLastCalledWith("sheet-1", "block-1", expect.objectContaining({ title: "수정한 합성함수 미분" }));
  });

  it("prevents duplicate edit submissions before the save button rerenders as disabled", () => {
    let resolveSave: (() => void) | undefined;
    const onUpdateBlock = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(<LearningHubView entries={[entry]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={onUpdateBlock} onDuplicateBlock={vi.fn().mockResolvedValue(undefined)} onDeleteBlock={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    const form = screen.getByRole("textbox", { name: "제목" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onUpdateBlock).toHaveBeenCalledTimes(1);
    resolveSave?.();
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
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.click(screen.getByRole("button", { name: "칸트" }));
    fireEvent.click(screen.getByRole("button", { name: "롤스" }));
    fireEvent.click(screen.getByRole("button", { name: "지문 단서" }));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(screen.getByRole("button", { name: "칸트 필터 제거" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "롤스 필터 제거" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지문 단서 필터 제거" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "칸트 필터 제거" }));
    expect(screen.queryByRole("button", { name: "칸트 필터 제거" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "롤스 필터 제거" })).toBeInTheDocument();
  });
});
