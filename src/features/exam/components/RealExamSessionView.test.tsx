import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import RealExamSessionView from "./RealExamSessionView";

function session(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    id: "real-1", entryId: "entry-1", title: "실전 시험", subject: "수학", status: "in_progress", mode: "real",
    questions: [
      { id: "q1", questionNumber: "1", questionType: "multiple_choice", question: "첫 문항", choices: ["① 1", "② 2"], questionImages: [], sourcePageImages: [], figures: [] },
      { id: "q2", questionNumber: "2", questionType: "short_answer", question: "둘째 문항", choices: [], questionImages: [], sourcePageImages: [], figures: [] },
    ], responses: [], currentQuestionIndex: 0, startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", answerSheetOpen: true, answerSheetLayout: "auto", ...overrides,
  };
}

describe("RealExamSessionView", () => {
  it("renders only the active question and answer sheet navigation changes it", () => {
    const onChange = vi.fn();
    render(<RealExamSessionView session={session()} onChange={onChange} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("첫 문항")).toBeInTheDocument();
    expect(screen.queryByText("둘째 문항")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2번 미응답/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ currentQuestionIndex: 1 }));
  });

  it("uses vertical rows for mixed exams and exposes the 44px close control", () => {
    render(<RealExamSessionView session={session()} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector(".real-exam-answer-grid--vertical")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시험 닫기" })).toBeInTheDocument();
  });

  it("uses horizontal answer sheets only for all multiple-choice sessions", () => {
    const questions = session().questions.map((question) => ({ ...question, questionType: "multiple_choice" as const }));
    render(<RealExamSessionView session={session({ questions, subject: "영어" })} onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector(".real-exam-answer-grid--horizontal")).toBeTruthy();
  });
});
