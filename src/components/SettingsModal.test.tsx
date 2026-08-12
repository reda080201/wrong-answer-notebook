import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types";
import type { SettingsContextValue } from "../contexts/SettingsContext";
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
    problemSheetDisplayMode: "questions",
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
    showTimer: true,
    defaultRealExamMinutes: 50,
    realExamAnswerSheetOpen: true,
    warnBeforeEnd: true,
    autoSubmitOnTimeExpired: false,
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

vi.mock("../contexts/SettingsContext", () => ({
  useSettingsContext: () => mockCtx,
}));

const patchView = vi.fn().mockResolvedValue(undefined);

const mockCtx = {
  settings,
  settingsError: null,
  settingsSaveState: "idle",
  settingsMessage: null,
  setSettingsMessage: vi.fn(),
  patchSettings: vi.fn(),
  setSettings: vi.fn(),
  refreshSettings: vi.fn(),
  flushSettings: vi.fn(),
  setSettingsMaintenanceBlocked: vi.fn(),
  clearSettingsError: vi.fn(),
  retrySettingsSave: vi.fn(),
  theme: { current: "system", set: vi.fn() },
  aiProvider: {
    status: null,
    statusLoading: false,
    statusError: null,
    keyInput: "",
    setKeyInput: vi.fn(),
    updateConfig: vi.fn(),
    storeKey: vi.fn(),
    removeKey: vi.fn(),
  },
  viewPreferences: { preferences: settings.viewPreferences, patch: patchView },
  examPreferences: {
    preferences: settings.examPreferences,
    printPreferences: settings.examPrintPreferences,
    patch: vi.fn(),
    patchPrint: vi.fn(),
  },
  imagePreferences: { preferences: settings.imagePreferences, patch: vi.fn() },
  gptMcpPreferences: { preferences: settings.gptMcpPreferences, patch: vi.fn() },
  chatGptMcpPreferences: { preferences: settings.chatGptMcpPreferences, patch: vi.fn() },
  mcpBridge: {
    settings: { enabled: false, port: 43129 },
    status: null,
    portInput: "43129",
    setPortInput: vi.fn(),
    pairingSession: null,
    isPairingPending: false,
    isConnectionTesting: false,
    isBrowserBlocked: true,
    updateConfig: vi.fn(),
    applyPort: vi.fn(),
    testConnection: vi.fn(),
    createPairing: vi.fn(),
    rotateCredential: vi.fn(),
    disconnectClients: vi.fn(),
  },
  templates: { entries: [], save: vi.fn(), delete: vi.fn() },
  promptTemplates: { list: [], save: vi.fn(), delete: vi.fn(), setLastUsed: vi.fn() },
  memoTemplates: { list: [], save: vi.fn(), delete: vi.fn() },
  data: {
    integrityReport: null,
    runIntegrity: vi.fn(),
    handleBackup: vi.fn(),
    handleRestore: vi.fn(),
    handleCleanupOrphans: vi.fn(),
  },
  updates: {
    state: { status: "idle" },
    preferences: settings.updatePreferences,
    checkForUpdate: vi.fn(),
    installUpdate: vi.fn(),
    restartAfterUpdate: vi.fn(),
    openReleasePage: vi.fn(),
    patchPreferences: vi.fn(),
  },
  questionBank: { preferences: undefined, patch: vi.fn() },
} as unknown as SettingsContextValue;

describe("SettingsModal", () => {
  it("opens the requested initial tab and updates view preferences", async () => {
    render(
      <SettingsModal
        initialTab="view"
        dataActions={{
          integrityReport: null,
          backup: vi.fn(),
          restore: vi.fn(),
          runIntegrity: vi.fn(),
          cleanupOrphans: vi.fn(),
        }}
        updateActions={{
          state: { status: "idle" },
          check: vi.fn(),
          install: vi.fn(),
          restart: vi.fn(),
          openReleasePage: vi.fn(),
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "보기" })).toHaveClass("active");
    fireEvent.click(screen.getByLabelText("정답 가리기"));
    expect(patchView).toHaveBeenCalledWith({ hideAnswers: true });

    fireEvent.click(screen.getByRole("button", { name: "시험" }));
    expect(screen.getByText("풀이 메모 표시")).toBeInTheDocument();
    expect(screen.getByText("기본 제한 시간(분)")).toBeInTheDocument();
    expect(screen.getByLabelText("답안지 처음 열기")).toBeInTheDocument();
    expect(screen.getByLabelText("종료 전 경고")).toBeInTheDocument();
    expect(screen.getByLabelText("시간 만료 시 자동 제출")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("종료 전 경고"));
    expect(mockCtx.examPreferences.patch).toHaveBeenCalledWith({ warnBeforeEnd: false });
    fireEvent.click(screen.getByLabelText("답안지 처음 열기"));
    expect(mockCtx.examPreferences.patch).toHaveBeenCalledWith({ realExamAnswerSheetOpen: false });
    fireEvent.click(screen.getByLabelText("시간 만료 시 자동 제출"));
    expect(mockCtx.examPreferences.patch).toHaveBeenCalledWith({ autoSubmitOnTimeExpired: true });
    fireEvent.click(screen.getByRole("button", { name: "이미지" }));
    expect(screen.getByText("원본 페이지 보존")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "GPT·MCP" }));
    expect(screen.getByText("가져오기 검토 기본 펼침")).toBeInTheDocument();
  });
});
