import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import RealExamSessionView from "./RealExamSessionView";

function createEssaySession(): ExamSession {
  return {
    id: "real-session-1", entryId: "entry-1", title: "서술형 실전 테스트", subject: "국어", status: "in_progress",
    questions: [{ id: "question-1", questionNumber: "1", questionType: "essay", question: "다음 물음에 답하시오.", choices: [], questionImages: [], figures: [] }],
    responses: [], currentQuestionIndex: 0, answerSheetOpen: true,
    startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("RealExamSessionView response editors", () => {
  it("uses a textarea for essay answers in both the paper and answer sheet", () => {
    render(<RealExamSessionView session={createEssaySession()} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const editors = screen.getAllByRole("textbox", { name: "1번 답안" });
    expect(editors).toHaveLength(2);
    expect(editors.every((element) => element.tagName === "TEXTAREA")).toBe(true);
  });

  it("uses the same response update contract from the answer sheet", () => {
    const onChange = vi.fn();
    render(<RealExamSessionView session={createEssaySession()} onChange={onChange} onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getAllByRole("textbox", { name: "1번 답안" })[1], { target: { value: "답안" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ responses: [expect.objectContaining({ questionNumber: "1", response: "답안" })] }));
  });
});
