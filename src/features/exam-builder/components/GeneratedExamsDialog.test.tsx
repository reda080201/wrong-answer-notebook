import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedExam } from "../../../types";
import GeneratedExamsDialog from "./GeneratedExamsDialog";

const exam = { id: "exam-1", title: "모의고사", questions: [], preset: "custom", status: "ready", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as GeneratedExam;

function props(overrides: Partial<ComponentProps<typeof GeneratedExamsDialog>> = {}) {
  return { open: true, closing: false, closeError: null, loading: false, loadError: null, saving: false, saveError: null, hasRetryableChange: false, exams: [exam], onClose: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(undefined), onRetry: vi.fn().mockResolvedValue(undefined), onDiscardFailure: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn().mockResolvedValue(undefined), onPrint: vi.fn().mockResolvedValue(undefined), ...overrides };
}

describe("GeneratedExamsDialog", () => {
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
});
