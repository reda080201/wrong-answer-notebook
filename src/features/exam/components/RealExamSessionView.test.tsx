import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import RealExamSessionView from "./RealExamSessionView";

function createSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    id: "real-session-1",
    entryId: "entry-1",
    title: "실전 모의고사",
    subject: "국어",
    status: "in_progress",
    mode: "real",
    questions: [
      {
        id: "q-1",
        questionNumber: "1",
        question: "첫 번째 문제",
        choices: ["① 하나", "② 둘"],
        questionImages: [],
        figures: [],
        correctAnswer: "①",
      },
      {
        id: "q-2",
        questionNumber: "2",
        question: "두 번째 문제",
        choices: ["① 하나", "② 둘"],
        questionImages: [],
        figures: [],
        correctAnswer: "②",
      },
    ],
    responses: [],
    currentQuestionIndex: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RealExamSessionView", () => {
  it("renders only the current question and moves the canonical index with arrow navigation", () => {
    const onChange = vi.fn();
    render(<RealExamSessionView session={createSession()} onChange={onChange} onSubmit={vi.fn()} />);

    expect(screen.getByText("첫 번째 문제")).toBeInTheDocument();
    expect(screen.queryByText("두 번째 문제")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ currentQuestionIndex: 1 }));
  });

  it("does not steal arrow keys from answer inputs", () => {
    const onChange = vi.fn();
    const session = createSession({
      questions: [{
        ...createSession().questions[0],
        questionType: "short_answer",
        choices: [],
      }],
    });
    render(<RealExamSessionView session={session} onChange={onChange} onSubmit={vi.fn()} />);

    fireEvent.keyDown(screen.getByLabelText("답안"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses separate horizontal and vertical answer sheet layouts", () => {
    const { rerender } = render(<RealExamSessionView session={createSession({ answerSheetLayout: "horizontal" })} onChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("가로 답안지").tagName).toBe("DIV");

    rerender(<RealExamSessionView session={createSession({ subject: "수학", answerSheetLayout: "auto" })} onChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("세로 답안지").tagName).toBe("OL");
  });

  it("focuses the continue action in the compact submit dialog and submits once when clicked repeatedly", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    }));
    render(<RealExamSessionView session={createSession()} onChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "시험 제출" }));
    const dialog = screen.getByRole("dialog", { name: "시험을 제출할까요?" });
    expect(dialog).toHaveClass("dialog-size-sm");
    const continueButton = within(dialog).getByRole("button", { name: "계속 풀기" });
    await waitFor(() => expect(continueButton).toHaveFocus());

    const submitButton = within(dialog).getByRole("button", { name: "그래도 제출" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolveSubmit?.();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "시험을 제출할까요?" })).not.toBeInTheDocument());
  });
});
