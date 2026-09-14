import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewSession, WrongAnswerEntry } from "../types";
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

const entryB: WrongAnswerEntry = {
  ...entry,
  id: "review-2",
  title: "복습 문제 2",
  question: "2+2",
  correctAnswer: "4",
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
      expect(onReview).toHaveBeenCalledWith({ kind: "entry", entry }, expect.objectContaining({ result: "good", eventId: expect.any(String) }));
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
      expect(onReview).toHaveBeenCalledWith({ kind: "sheet-question", entry: sheet, questionNumber: "1" }, expect.objectContaining({ result: "hard", eventId: expect.any(String) }));
    });
  }, 30000);

  it("moves focus into the dialog and closes with Escape", async () => {
    const onClose = vi.fn();
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        onClose={onClose}
        onReview={vi.fn().mockResolvedValue(undefined)}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable error when saving a review result fails", async () => {
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        onClose={vi.fn()}
        onReview={vi.fn().mockRejectedValue(new Error("디스크 오류"))}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("디스크 오류");
  });

  it("does not close while a review result is saving", async () => {
    let resolveReview: (() => void) | undefined;
    const onReview = vi.fn(() => new Promise<void>((resolve) => { resolveReview = resolve; }));
    const onClose = vi.fn();
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        onClose={onClose}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    await waitFor(() => expect(onReview).toHaveBeenCalled());

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolveReview?.();
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false"));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("guards against duplicate rating button clicks on already reviewed items", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const onSessionSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry, entryB]}
        onClose={vi.fn()}
        onReview={onReview}
        onSessionSave={onSessionSave}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(1));

    expect(screen.getByText("복습 문제 2")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("복습 문제")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));

    const goodButton = screen.getByRole("button", { name: "맞음" });
    expect(goodButton).toBeDisabled();
    fireEvent.click(goodButton);

    expect(onReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("이 세션에서 맞음으로 평가했습니다.")).toBeInTheDocument();
  });

  it("guards against duplicate rating keyboard shortcuts on already reviewed items", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry, entryB]}
        onClose={vi.fn()}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(1));

    expect(screen.getByText("복습 문제 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("복습 문제")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));

    fireEvent.keyDown(document, { key: "1" });
    fireEvent.keyDown(document, { key: "2" });
    fireEvent.keyDown(document, { key: "3" });

    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("retries session progress without repeating a saved review result", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const onSessionSave = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("세션 저장 실패"))
      .mockResolvedValueOnce(undefined);
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        onClose={vi.fn()}
        onReview={onReview}
        onSessionSave={onSessionSave}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    await waitFor(() => expect(onSessionSave).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("결과는 저장되었지만 진행 상태를 저장하지 못했습니다");
    expect(onReview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "세션 진행 상태 다시 저장" }));
    await waitFor(() => expect(onSessionSave).toHaveBeenCalledTimes(3));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("replaces existing event and updates review stats on explicit rating edit", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry, entryB]}
        onClose={vi.fn()}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "맞음" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(1));
    const firstSubmission = onReview.mock.calls[0][1];

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));

    fireEvent.click(screen.getByRole("button", { name: "평가 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "어려움" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(2));

    expect(onReview).toHaveBeenLastCalledWith(
      { kind: "entry", entry },
      expect.objectContaining({
        result: "hard",
        eventId: firstSubmission.eventId,
        replacementEventId: firstSubmission.eventId,
      }),
    );

    expect(screen.getByText("어려움").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("맞음").nextElementSibling).toHaveTextContent("0");
  });

  it("initializes completed state and stats from resumed session and blocks unprompted ratings", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const resumedSession: ReviewSession = {
      id: "session-1",
      mode: "today",
      currentIndex: 0,
      itemRefs: [{ kind: "entry", entryId: entry.id }],
      completedItemKeys: ["entry:review-1"],
      reviewEvents: [
        {
          id: "event-prev",
          itemKey: "entry:review-1",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          result: "good",
          nextDueAt: null,
          intervalDays: 1,
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    render(
      <ReviewPanel
        title="오늘 복습"
        entries={[entry]}
        session={resumedSession}
        onClose={vi.fn()}
        onReview={onReview}
        onOpenEntry={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(screen.getByText("맞음").nextElementSibling).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));

    expect(screen.getByText("이 세션에서 맞음으로 평가했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "맞음" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "1" });
    fireEvent.keyDown(document, { key: "2" });
    fireEvent.keyDown(document, { key: "3" });
    expect(onReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "평가 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "어려움" }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith(
        { kind: "entry", entry },
        expect.objectContaining({
          result: "hard",
          eventId: "event-prev",
          replacementEventId: "event-prev",
        }),
      );
    });

    expect(screen.getByText("어려움").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("맞음").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByText("다시").nextElementSibling).toHaveTextContent("0");
  });
});
