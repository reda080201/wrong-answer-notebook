import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedExam } from "../../../types";
import GeneratedExamList from "./GeneratedExamList";

const makeExam = (preset: GeneratedExam["preset"]): GeneratedExam => ({
  id: `exam-${preset}`,
  title: "저장 모의고사",
  subject: "수학",
  preset,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  seed: "seed",
  status: "ready",
  timeLimitMinutes: 80,
  questions: [],
  generationReport: {} as GeneratedExam["generationReport"],
});

describe("GeneratedExamList launch options", () => {
  it("shows proposed and current answers and confirms the selected saved question", () => {
    const onConfirmAnswer = vi.fn();
    const exam = {
      ...makeExam("custom"),
      questions: [{
        position: 2,
        source: { sourceEntryId: "entry-1", sourceEntryTitle: "원본", sourceQuestionNumber: "7" },
        snapshot: { id: "snapshot-1", questionNumber: "7", question: "질문", choices: [], questionImages: [], figures: [], correctAnswer: "현재 답", solutionAnswer: { answer: "현재 답", sourceNote: "검토 필요", answerProvenance: { kind: "conflict", proposedAnswer: "예상 답", independent: false } } },
      }],
    } as unknown as GeneratedExam;
    render(<GeneratedExamList exams={[exam]} onOpen={vi.fn()} onDelete={vi.fn()} onConfirmAnswer={onConfirmAnswer} />);
    expect(screen.getByText(/AI 예상 답:/)).toHaveTextContent("예상 답");
    expect(screen.getByText(/현재 정답:/)).toHaveTextContent("현재 답");
    fireEvent.click(screen.getByText(/확인이 필요한 정답 .*개 검토/));
    fireEvent.click(screen.getByRole("button", { name: "이 정답 확인" }));
    expect(onConfirmAnswer).toHaveBeenCalledWith(exam, 2);
  });

  it("does not expose snapshot answers while its source is protected by a real exam", () => {
    const exam = {
      ...makeExam("custom"),
      questions: [{ position: 1, source: { sourceEntryId: "protected-source", sourceEntryTitle: "원본", sourceQuestionNumber: "1" }, snapshot: { questionNumber: "1", solutionAnswer: { answer: "비공개 답", answerProvenance: { kind: "gpt_estimate", proposedAnswer: "예상 답" } } } }],
    } as unknown as GeneratedExam;
    render(<GeneratedExamList exams={[exam]} onOpen={vi.fn()} onDelete={vi.fn()} protectedExamIds={new Set(["protected-source"])} />);
    fireEvent.click(screen.getByText(/확인이 필요한 정답 .*개 검토/));
    expect(screen.getByRole("status")).toHaveTextContent("진행 중 실전 시험 자료");
    expect(screen.queryByText("비공개 답", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("예상 답", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 정답 확인" })).not.toBeInTheDocument();
  });

  it("offers explicit practice and real launch options", () => {
    const onOpen = vi.fn();
    render(<GeneratedExamList exams={[makeExam("real_exam")]} onOpen={onOpen} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "실전 모드" }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ preset: "real_exam" }));

    fireEvent.click(screen.getByRole("button", { name: "문제 풀기" }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ preset: "real_exam" }), { mode: "practice" });
  });

  it("offers real mode explicitly for non-real presets", () => {
    const onOpen = vi.fn();
    render(<GeneratedExamList exams={[makeExam("custom")]} onOpen={onOpen} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "실전 모드" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ preset: "custom" }), {
      mode: "real",
      timeLimitMinutes: 80,
      showTimer: true,
      answerSheetOpen: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "문제 풀기" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ preset: "custom" }));
  });
});
