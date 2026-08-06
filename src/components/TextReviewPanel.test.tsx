import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import TextReviewPanel from "./TextReviewPanel";

const entry: WrongAnswerEntry = {
  id: "entry-1", subject: "수학", title: "문제", question: "문제 본문", questionImages: [], entryKind: "wrong_answer",
  difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
};

describe("TextReviewPanel", () => {
  it("keeps every close control disabled while saving", () => {
    const onClose = vi.fn();
    let resolveSave: (() => void) | undefined;
    render(<TextReviewPanel entry={entry} segments={[]} onClose={onClose} onSave={() => new Promise<void>((resolve) => { resolveSave = resolve; })} />);
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).not.toHaveBeenCalled();
    resolveSave?.();
  });
});
