import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import QuestionBankView from "./QuestionBankView";

const entry: WrongAnswerEntry = {
  id: "sheet", subject: "수학", title: "기출 시험", entryKind: "problem_sheet", question: "1. 함수의 값은?\n① 1\n② 2", questionImages: [],
  problemSource: { type: "past_exam" }, difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [],
  answerKey: [{ id: "a1", questionNumber: "1", answer: "②", explanation: "풀이", importantPoints: [] }],
  questionMeta: [{ questionNumber: "1", important: false, difficultyScore: 72, classification: { unit: "함수" }, updatedAt: "2026-01-01T00:00:00.000Z" }],
  figures: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
};

describe("QuestionBankView", () => {
  it("filters projected questions and opens the exact question target", () => {
    const onOpenQuestion = vi.fn();
    render(<QuestionBankView entries={[entry]} onOpenQuestion={onOpenQuestion} />);
    expect(screen.getByText("기출 시험 1번")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("문제 은행 검색"), { target: { value: "없는 개념" } });
    expect(screen.getByText("조건에 맞는 문항이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "기출 시험 1번 열기" }));
    expect(onOpenQuestion).toHaveBeenCalledWith(expect.objectContaining({ entryId: "sheet", questionNumber: "1" }));
  });

  it("does not persist hydrated preferences and saves a user sort change once", async () => {
    vi.useFakeTimers();
    const onPreferencesChange = vi.fn().mockResolvedValue(undefined);
    const preferences = { recentFilters: { subject: "수학" }, lastSort: "updated" as const };
    const { rerender } = render(<QuestionBankView entries={[entry]} onOpenQuestion={vi.fn()} preferences={preferences} onPreferencesChange={onPreferencesChange} />);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onPreferencesChange).not.toHaveBeenCalled();
    rerender(<QuestionBankView entries={[entry]} onOpenQuestion={vi.fn()} preferences={{ ...preferences, recentFilters: { ...preferences.recentFilters } }} onPreferencesChange={onPreferencesChange} />);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onPreferencesChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("정렬"), { target: { value: "difficulty" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(onPreferencesChange).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    expect(onPreferencesChange).toHaveBeenCalledWith(expect.objectContaining({ lastSort: "difficulty" }));
    vi.useRealTimers();
  });

  it("flushes a pending preference change when it unmounts", async () => {
    vi.useFakeTimers();
    const onPreferencesChange = vi.fn().mockResolvedValue(undefined);
    const onRegisterPreferenceFlush = vi.fn();
    const { unmount } = render(<QuestionBankView entries={[entry]} onOpenQuestion={vi.fn()} onPreferencesChange={onPreferencesChange} onRegisterPreferenceFlush={onRegisterPreferenceFlush} />);
    fireEvent.change(screen.getByLabelText("정렬"), { target: { value: "difficulty" } });
    unmount();
    await act(async () => undefined);
    expect(onPreferencesChange).toHaveBeenCalledWith(expect.objectContaining({ lastSort: "difficulty" }));
    expect(onRegisterPreferenceFlush).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });

  it("shows a retry affordance when persisting preferences fails", async () => {
    vi.useFakeTimers();
    const onPreferencesChange = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce(undefined);
    render(<QuestionBankView entries={[entry]} onOpenQuestion={vi.fn()} onPreferencesChange={onPreferencesChange} />);

    fireEvent.change(screen.getByLabelText("정렬"), { target: { value: "difficulty" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("문제 은행 설정을 저장하지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(onPreferencesChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
