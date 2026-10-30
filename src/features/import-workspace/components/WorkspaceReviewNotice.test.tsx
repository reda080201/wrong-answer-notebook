import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImportQuestionDraft } from "../model/importWorkspace";
import WorkspaceReviewNotice from "./WorkspaceReviewNotice";

const question: ImportQuestionDraft = {
  id: "q1", groupId: "g1", order: 0, displayQuestionNumber: "1",
  contentSegments: [{ id: "body", type: "text", text: "문제" }], choices: [],
  figures: [], questionImageAssets: [], sourcePageAssets: [], explanationParts: [], sourceReferences: [],
  answer: { id: "a1", questionNumber: "1", answer: "①" }, status: "ready", warnings: [],
};

describe("WorkspaceReviewNotice", () => {
  it("shows a completed status without a redundant disabled action", () => {
    render(<WorkspaceReviewNotice question={question} issues={[]} disabled={false} onConfirm={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("추가 확인 없음");
    expect(screen.queryByRole("button", { name: "내용 비교 확인 완료" })).not.toBeInTheDocument();
  });

  it("identifies the question and permits only manual content confirmation", () => {
    const onConfirm = vi.fn();
    render(<WorkspaceReviewNotice question={{ ...question, status: "needs_review" }} issues={[]} disabled={false} onConfirm={onConfirm} />);
    expect(screen.getByText("1번 검토할 내용")).toBeInTheDocument();
    expect(screen.getByText(/구체적인 사유는 제공되지 않았습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내용 비교 확인 완료" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not let content confirmation bypass a reference error", () => {
    const onConfirm = vi.fn();
    render(<WorkspaceReviewNotice question={{ ...question, status: "needs_review" }} issues={[{ id: "missing", severity: "error", message: "없는 이미지 자산" }]} disabled={false} onConfirm={onConfirm} />);
    expect(screen.getByText("수정 필요: 없는 이미지 자산")).toBeInTheDocument();
    expect(screen.getByText(/수정할 때 다시 검사/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내용 비교 확인 완료" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "내용 비교 확인 완료" })).toBeDisabled();
  });

  it.each(["gpt_estimate", "conflict"] as const)("blocks an unconfirmed %s answer independently of reference checks", kind => {
    render(<WorkspaceReviewNotice question={{ ...question, status: "needs_review", answer: { ...question.answer!, answerProvenance: { kind, proposedAnswer: "②", independent: false } } }} issues={[]} disabled={false} onConfirm={vi.fn()} />);
    expect(screen.getByText(/정답을 확인하기 전에는/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내용 비교 확인 완료" })).toBeDisabled();
  });

  it("keeps figure review and maintenance blocks even without reference errors", () => {
    const props = { issues: [], disabled: false, onConfirm: vi.fn() };
    const { rerender } = render(<WorkspaceReviewNotice {...props} question={{ ...question, status: "needs_review", figures: [{ id: "f1", questionNumber: "1", title: "그림", caption: "", source: "original", needsReview: true }] }} />);
    expect(screen.getByText(/내용 편집의 그림 비교/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내용 비교 확인 완료" })).toBeDisabled();
    rerender(<WorkspaceReviewNotice {...props} question={{ ...question, status: "needs_review" }} disabled />);
    expect(screen.getByRole("button", { name: "내용 비교 확인 완료" })).toBeDisabled();
  });
});
