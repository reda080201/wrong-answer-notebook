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

    fireEvent.click(screen.getByRole("button", { name: "맞힘" }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith(entry, "good");
    });
  }, 30000);
});
