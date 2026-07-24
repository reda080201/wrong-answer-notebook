import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";
import SettingsModal from "./SettingsModal";

const settings: AppSettings = {
  templates: [],
  promptTemplates: [],
  memoTemplates: [],
  aiProvider: { type: "manual", enabled: false, keySource: "env", hasStoredKey: false },
  importPreferences: {},
  viewPreferences: {
    sheetLayout: "single",
    fontSize: "normal",
    hideAnswers: false,
    showDifficulty: true,
    showOriginalPages: true,
    showLearningVisuals: true,
    compactToolbar: false,
  },
  examPrintPreferences: {
    preset: "real_exam",
    paperSize: "a4",
    orientation: "portrait",
    layout: "auto",
    includeHeader: true,
    includeAnswerSheet: true,
    includePageNumbers: true,
    includeSourcePages: false,
    workspaceSize: "small",
    extraScratchPages: 0,
  },
  examPreferences: {
    showScratchNote: true,
    showOriginalPages: true,
    showNavigator: true,
    autoAdvanceOnAnswer: false,
    warnUnansweredOnSubmit: true,
    showTimer: false,
    showMcpHelp: true,
  },
  imagePreferences: {
    preserveSourcePages: true,
    showUnlinkedImages: true,
    thumbnailSize: "medium",
  },
  gptMcpPreferences: {
    mcpShareScope: "current-question",
    importReviewExpanded: true,
    importDetailCollapsedByDefault: true,
  },
  chatGptMcpPreferences: {
    displayName: "오답노트",
    shareUserResponse: true,
    shareScratchNote: true,
    shareQuestionImages: true,
    shareSourcePageImages: false,
    copyPromptBeforeOpen: true,
    openChatGptAfterCopy: true,
  },
  answerViewPreferences: { viewMode: "card", hideAnswers: false },
  autoBackup: { enabled: false },
  mcpBridge: { enabled: false, port: 43129 },
  updatePreferences: { autoCheckEnabled: true, notificationsEnabled: true, backupBeforeInstall: true, channel: "stable" },
};

describe("SettingsModal", () => {
  it("opens the requested initial tab and updates view preferences", async () => {
    const setSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsModal
        initialTab="view"
        settings={settings}
        settingsError={null}
        settingsMessage={null}
        clearSettingsError={vi.fn()}
        setSettingsMessage={vi.fn()}
        setSettings={setSettings}
        theme="system"
        setTheme={vi.fn()}
        aiProviderStatus={null}
        aiProviderKeyInput=""
        setAiProviderKeyInput={vi.fn()}
        updateAiProviderConfig={vi.fn()}
        storeAiProviderKey={vi.fn()}
        removeAiProviderKey={vi.fn()}
        integrityReport={null}
        saveTemplate={vi.fn()}
        deleteTemplate={vi.fn()}
        savePromptTemplate={vi.fn()}
        deletePromptTemplate={vi.fn()}
        deleteMemoTemplate={vi.fn()}
        handleBackup={vi.fn()}
        handleRestore={vi.fn()}
        runIntegrity={vi.fn()}
        handleCleanupOrphans={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "보기" })).toHaveClass("active");
    fireEvent.click(screen.getByLabelText("정답 가리기"));
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({
      viewPreferences: expect.objectContaining({ hideAnswers: true }),
      answerViewPreferences: expect.objectContaining({ hideAnswers: true }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "시험" }));
    expect(screen.getByText("풀이 메모 표시")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이미지" }));
    expect(screen.getByText("원본 페이지 보존")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "GPT·MCP" }));
    expect(screen.getByText("가져오기 검토 기본 펼침")).toBeInTheDocument();
  });
});
