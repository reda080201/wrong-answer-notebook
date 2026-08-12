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
