import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import LearningCandidateReviewModal from "./LearningCandidateReviewModal";

const entry = {
  id: "entry-1",
  title: "테스트 오답",
  entryKind: "wrong_answer",
  answerKey: [{ questionNumber: "1", concepts: ["핵심 개념"], importantPoints: [] }],
} as unknown as WrongAnswerEntry;

describe("LearningCandidateReviewModal", () => {
  it("supports select all, select none, expanding a candidate, and closing", () => {
    const onClose = vi.fn();
    render(<LearningCandidateReviewModal entry={entry} onClose={onClose} onSave={vi.fn().mockResolvedValue(undefined)} />);
    const dialog = screen.getByRole("dialog", { name: "학습 후보 검토" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("1 / 1개 선택");

    fireEvent.click(within(dialog).getByRole("button", { name: "전체 해제" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("0 / 1개 선택");
    fireEvent.click(within(dialog).getByRole("button", { name: "전체 선택" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("1 / 1개 선택");
    fireEvent.click(within(dialog).getByText("내용 보기"));
    expect(within(dialog).getByText("핵심 개념")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "학습 후보 검토 닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
