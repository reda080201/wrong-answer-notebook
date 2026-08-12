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

  it("keeps the legacy flat text editor for ordinary entries", () => {
    render(<TextReviewPanel entry={entry} segments={[]} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "검수할 문제 텍스트" })).toHaveValue("문제 본문");
    expect(screen.getByRole("button", { name: "수정 저장" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "문항 선택" })).not.toBeInTheDocument();
  });

  it("uses canonical question numbers and exposes stable structured segment targets", () => {
    const onActiveQuestionChange = vi.fn();
    const onActiveSegmentChange = vi.fn();
    const structuredEntry: WrongAnswerEntry = {
      ...entry,
      entryKind: "problem_sheet",
      structuredQuestions: [
        {
          questionNumber: "1",
          questionText: "첫 문항",
          conditions: [],
          equations: [],
          choices: [],
          contentSegments: [{ id: "segment-1", type: "text", text: "첫 문항" }],
          figureIds: [],
        },
        {
          questionNumber: "2",
          questionText: "두 번째 문항",
          conditions: ["두 번째 문항"],
          equations: [],
          choices: [],
          contentSegments: [{ id: "segment-2", type: "condition", label: "조건", text: "두 번째 문항" }],
          figureIds: [],
        },
      ],
      questionContentSegments: {
        "99": [{ id: "legacy-segment", type: "text", text: "구형 segment" }],
      },
    };
    render(
      <TextReviewPanel
        entry={structuredEntry}
        segments={[{ id: "warning-1", start: 0, end: 2, text: "문제", reason: "OCR 의심 조각", severity: "high" }]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onActiveQuestionChange={onActiveQuestionChange}
        onActiveSegmentChange={onActiveSegmentChange}
      />,
    );

    const warning = screen.getByRole("status");
    warning.focus();
    expect(warning).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "검수할 문제 텍스트" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1번" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2번" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "99번" })).not.toBeInTheDocument();
    expect(screen.queryByText("편집 슬롯 대기 중")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2번" }));
    const segmentButton = screen.getByRole("button", { name: /condition.*두 번째 문항/ });
    expect(segmentButton).toHaveAttribute("id", "text-review-segment-trigger-2-segment-2");
    expect(segmentButton).toHaveAttribute("aria-controls", "text-review-structured-editor-2-segment-2");
    fireEvent.click(segmentButton);

    expect(onActiveQuestionChange).toHaveBeenCalledWith("2");
    expect(onActiveSegmentChange).toHaveBeenCalledWith("segment-2");
    expect(screen.getByRole("textbox", { name: /2번 조건/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /2번 조건/ })).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "문항 편집기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "segment 편집기" })).not.toBeInTheDocument();
  });

  it("falls back to compatibility segment question numbers when canonical questions are unavailable", () => {
    const compatibilityEntry: WrongAnswerEntry = {
      ...entry,
      entryKind: "problem_sheet",
      structuredQuestions: [],
      questionContentSegments: {
        "3": [{ id: "segment-3", type: "text", text: "구형 문항" }],
      },
    };

    render(<TextReviewPanel entry={compatibilityEntry} segments={[]} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "검수할 문제 텍스트" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "문항 선택" })).not.toBeInTheDocument();
  });

  it("keeps canonical question numbers authoritative over compatibility keys", () => {
    const structuredEntry: WrongAnswerEntry = {
      ...entry,
      entryKind: "problem_sheet",
      structuredQuestions: [{
        questionNumber: "12",
        questionText: "정규 문항",
        conditions: [],
        equations: [],
        choices: [],
        contentSegments: [{ id: "segment-12", type: "text", text: "정규 문항" }],
        figureIds: [],
      }],
      questionContentSegments: {
        "1": [{ id: "legacy-1", type: "text", text: "오래된 키" }],
      },
    };

    render(<TextReviewPanel entry={structuredEntry} segments={[]} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "12번" })).toHaveAttribute("id", "text-review-question-12");
    expect(screen.queryByRole("button", { name: "1번" })).not.toBeInTheDocument();
  });
});
