import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import ReviewPanel from "./ReviewPanel";

vi.mock("../api", () => ({
  getImageUrl: vi.fn(),
}));

const entry: WrongAnswerEntry = {
  id: "review-1",
  subject: "수학",
  title: "복습 문제",
  question: "1+1",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "3",
  correctAnswer: "2",
  explanationParts: [{ id: "exp-1", text: "덧셈", images: [] }],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("ReviewPanel", () => {
  it("reveals answer and submits self review", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        onClose={vi.fn()}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(screen.queryByText("덧셈")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    expect(screen.getByText("덧셈")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "맞음" }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith({ kind: "entry", entry }, "good");
    });
  }, 30000);

  it("renders a problem sheet question item with linked answer key", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const sheet: WrongAnswerEntry = {
      ...entry,
      id: "sheet-1",
      title: "수학 시험지",
      entryKind: "problem_sheet",
      question: "1. 극한값을 구하시오.\n① 1\n② 2",
      correctAnswer: "",
      explanationParts: [],
      answerKey: [{
        id: "a1",
        questionNumber: "01",
        answer: "②",
        explanation: "좌우 극한을 비교한다.",
        importantPoints: [],
        difficultyScore: 72,
      }],
      questionMeta: [{
        questionNumber: "1",
        important: true,
        difficultyScore: 88,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    };

    render(
      <ReviewPanel
        title="오늘 복습"
        items={[{ kind: "sheet-question", entry: sheet, questionNumber: "1" }]}
        onClose={vi.fn()}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(screen.getByText(/수학 시험지 · 문제 1/)).toBeInTheDocument();
    expect(screen.getByText("중요")).toBeInTheDocument();
    expect(screen.getByText("매우 어려움 · 88/100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    expect(screen.getAllByText("②").length).toBeGreaterThan(0);
    expect(screen.getByText("좌우 극한을 비교한다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "어려움" }));
    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith({ kind: "sheet-question", entry: sheet, questionNumber: "1" }, "hard");
    });
  }, 30000);
});
