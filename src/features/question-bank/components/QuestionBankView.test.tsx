import { fireEvent, render, screen } from "@testing-library/react";
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
});
