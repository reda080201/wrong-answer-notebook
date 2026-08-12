import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SheetAnswerItem } from "../../../types";
import ImportAnswerReviewList from "./ImportAnswerReviewList";

const item: SheetAnswerItem = {
  id: "answer-1",
  questionNumber: "3",
  answer: "\\frac{1}{2}",
  explanation: "분모를 통분합니다.",
  strategy: "조건을 먼저 정리합니다.",
  steps: ["식 세우기", "검산하기"],
  choiceJudgements: [{ marker: "①", text: "조건과 일치" }],
  wrongPoint: "부호를 확인합니다.",
  reviewPoint: "다음에는 단위를 먼저 확인합니다.",
  notes: "검수 메모",
  importantPoints: [],
  difficulty: "medium",
  difficultyScore: 55,
  needsReview: true,
};

describe("ImportAnswerReviewList", () => {
  it("shows compact answer metadata without synthesizing a numeric difficulty score", () => {
    render(<ImportAnswerReviewList items={[item]} onUpdate={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "3번" })).toBeInTheDocument();
    expect(screen.getAllByText("보통")).not.toHaveLength(0);
    expect(screen.getByText("검토 필요")).toBeInTheDocument();
    expect(screen.queryByText(/55\/100/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("3번 정답 미리보기")).toHaveTextContent("1");
  });

  it("updates answer, strategy, steps, judgements, review fields, and removes a row", () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<ImportAnswerReviewList items={[item]} onUpdate={onUpdate} onRemove={onRemove} defaultDetailsOpen />);

    fireEvent.change(screen.getByLabelText("3번 정답"), { target: { value: "①" } });
    fireEvent.change(screen.getByLabelText("3번 풀이 전략"), { target: { value: "새 전략" } });
    fireEvent.change(screen.getByLabelText("3번 풀이 단계"), { target: { value: "첫 단계\n둘째 단계" } });
    fireEvent.change(screen.getByLabelText("3번 선지 판단"), { target: { value: "②: 오답" } });
    fireEvent.change(screen.getByLabelText("3번 오답 포인트"), { target: { value: "새 오답" } });
    fireEvent.change(screen.getByLabelText("3번 복습 포인트"), { target: { value: "새 복습" } });
    fireEvent.change(screen.getByLabelText("3번 문제별 메모"), { target: { value: "새 메모" } });

    expect(onUpdate).toHaveBeenNthCalledWith(1, "answer-1", { answer: "①" });
    expect(onUpdate).toHaveBeenNthCalledWith(2, "answer-1", { strategy: "새 전략" });
    expect(onUpdate).toHaveBeenNthCalledWith(3, "answer-1", { steps: ["첫 단계", "둘째 단계"] });
    expect(onUpdate).toHaveBeenNthCalledWith(4, "answer-1", { choiceJudgements: [{ marker: "②", text: "오답" }] });
    expect(onUpdate).toHaveBeenNthCalledWith(5, "answer-1", { wrongPoint: "새 오답" });
    expect(onUpdate).toHaveBeenNthCalledWith(6, "answer-1", { reviewPoint: "새 복습" });
    expect(onUpdate).toHaveBeenNthCalledWith(7, "answer-1", { notes: "새 메모" });

    fireEvent.click(screen.getByRole("button", { name: "3번 답안 삭제" }));
    expect(onRemove).toHaveBeenCalledWith("answer-1");
  });

  it("supports collapsed detail fields and an empty state", () => {
    const { rerender } = render(<ImportAnswerReviewList items={[item]} onUpdate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("풀이 전략").closest("details")).not.toHaveAttribute("open");

    rerender(<ImportAnswerReviewList items={[]} onUpdate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("검수할 답안이 없습니다.")).toBeInTheDocument();
  });
});
