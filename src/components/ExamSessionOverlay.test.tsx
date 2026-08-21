import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatGptMcpPreferences, ExamPreferences, ExamSession } from "../types";
import ExamSessionOverlay from "./ExamSessionOverlay";

const session: ExamSession = {
  id: "real-session-1", entryId: "entry-1", title: "실전 모의고사", subject: "국어", mode: "real", status: "in_progress",
  questions: [], responses: [], currentQuestionIndex: 0, startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

const examPreferences: ExamPreferences = {
  showScratchNote: true, showOriginalPages: false, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false,
};

const chatGptPreferences: ChatGptMcpPreferences = {
  displayName: "ChatGPT", shareUserResponse: false, shareScratchNote: false, shareQuestionImages: false, shareSourcePageImages: false, copyPromptBeforeOpen: false, openChatGptAfterCopy: false,
};

describe("ExamSessionOverlay", () => {
  it("uses a top-right icon close control and disables it while saving", () => {
    const onClose = vi.fn();
    const props = {
      session,
      generated: false,
      examPreferences,
      onOpenSettings: vi.fn(),
      chatGptPreferences,
      onChatGptPreferencesChange: vi.fn(),
      onSyncChatGptContext: vi.fn(),
      onOpenChatGptSettings: vi.fn(),
      onCheckLocalMcp: vi.fn(),
      remoteMcpConfigured: false,
      onChange: vi.fn(),
      onSubmittingChange: vi.fn(),
      onSubmit: vi.fn(),
      onClose,
      submitting: false,
      saveError: null,
      onRetrySave: vi.fn(),
    };
    const { rerender } = render(<ExamSessionOverlay {...props} saving={false} />);

    fireEvent.click(screen.getByRole("button", { name: "시험 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ExamSessionOverlay {...props} saving />);

    const closeButton = screen.getByRole("button", { name: "시험 닫기" });
    expect(closeButton).toHaveClass("exam-session-overlay-close");
    expect(closeButton).toBeDisabled();
    expect(screen.queryByText("시험 닫기")).not.toBeInTheDocument();
  });
});
