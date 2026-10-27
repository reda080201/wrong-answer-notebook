import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedExam } from "../../../types";
import GeneratedExamsDialog from "./GeneratedExamsDialog";

const exam = { id: "exam-1", title: "모의고사", questions: [], preset: "custom", status: "ready", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as GeneratedExam;

function props(overrides: Partial<ComponentProps<typeof GeneratedExamsDialog>> = {}) {
  return { open: true, closing: false, closeError: null, loading: false, loadError: null, saving: false, saveError: null, hasRetryableChange: false, exams: [exam], onClose: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(undefined), onRetry: vi.fn().mockResolvedValue(undefined), onDiscardFailure: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn().mockResolvedValue(undefined), onPrint: vi.fn().mockResolvedValue(undefined), ...overrides };
}

describe("GeneratedExamsDialog", () => {
  it("reports a failed snapshot answer confirmation without changing the visible snapshot", async () => {
    const pendingExam = {
      ...exam,
      questions: [{ position: 1, source: { sourceEntryId: "entry-1", sourceEntryTitle: "원본", sourceQuestionNumber: "1" }, snapshot: { questionNumber: "1", solutionAnswer: { answer: "현재 답", answerProvenance: { kind: "gpt_estimate", proposedAnswer: "예상 답" } } } }],
    } as unknown as GeneratedExam;
    const onConfirmAnswer = vi.fn().mockRejectedValue(new Error("저장 실패"));
    render(<GeneratedExamsDialog {...props({ exams: [pendingExam], onConfirmAnswer })} />);
    fireEvent.click(screen.getByText(/확인이 필요한 정답 .*개 검토/));
    fireEvent.click(screen.getByRole("button", { name: "이 정답 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(screen.getByText(/AI 예상 답:/)).toHaveTextContent("예상 답");
    expect(onConfirmAnswer).toHaveBeenCalledWith(pendingExam, 1);
  });

  it("keeps the dialog open after a failed delete and retries that delete", async () => {
    const onDelete = vi.fn().mockRejectedValueOnce(new Error("삭제 실패")).mockResolvedValueOnce(undefined);
    render(<GeneratedExamsDialog {...props({ onDelete })} />);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("삭제 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("clears a previous action error when reopened", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("삭제 실패"));
    const view = render(<GeneratedExamsDialog {...props({ onDelete })} />);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("삭제 실패");
    view.rerender(<GeneratedExamsDialog {...props({ open: false, onDelete })} />);
    view.rerender(<GeneratedExamsDialog {...props({ onDelete })} />);
    expect(screen.queryByText("삭제 실패")).not.toBeInTheDocument();
  });

  it("does not start the same delete twice while the first action is pending", () => {
    let resolveDelete: (() => void) | undefined;
    const onDelete = vi.fn(() => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));
    render(<GeneratedExamsDialog {...props({ onDelete })} />);

    const deleteButton = screen.getByRole("button", { name: "삭제" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
    resolveDelete?.();
  });

  it("handles a failed generated-exam retry without leaving a rejected promise", async () => {
    const onRetry = vi.fn().mockRejectedValueOnce(new Error("재저장 실패")).mockResolvedValueOnce(undefined);
    render(<GeneratedExamsDialog {...props({ saveError: "저장 실패", hasRetryableChange: true, onRetry })} />);

    fireEvent.click(screen.getByRole("button", { name: "실패한 변경 다시 저장" }));
    expect(await screen.findByText("재저장 실패")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("keeps an unexpected close failure in the dialog and allows retry", async () => {
    const onClose = vi.fn().mockRejectedValueOnce(new Error("닫기 실패")).mockResolvedValueOnce(undefined);
    render(<GeneratedExamsDialog {...props({ onClose })} />);

    fireEvent.click(screen.getByRole("button", { name: "내 모의고사 닫기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("닫기 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("does not enter composition when closing could not save, then permits a safe retry", async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<GeneratedExamsDialog {...props({ exams: [], onClose, onCreate })} />);
    fireEvent.click(screen.getByRole("button", { name: "모의고사 만들기" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "모의고사 만들기" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "모의고사 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  });

});
