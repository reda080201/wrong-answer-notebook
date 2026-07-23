import type {
  ExamPreferences,
  ChatGptMcpPreferences,
  GptMcpPreferences,
  ImagePreferences,
  ViewPreferences,
} from "../types";

/** EntryDetail.tsx localStorage keys used before viewPreferences lived in settings. */
export const ENTRY_DETAIL_STORAGE_KEYS = {
  sheetLayout: "wrong-answer-sheet-layout",
  answerView: "wrong-answer-answer-view",
  answerHide: "wrong-answer-answer-hidden",
  focusTextSize: "wrong-answer-focus-text-size",
  focusPanel: "wrong-answer-focus-last-panel",
  studyControlCompact: "wrong-answer-study-control-compact",
} as const;

export interface ViewPreferencesLegacyStorage {
  getItem(key: string): string | null;
}

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  sheetLayout: "single",
  fontSize: "normal",
  hideAnswers: false,
  showDifficulty: true,
  showOriginalPages: true,
  showLearningVisuals: true,
  compactToolbar: false,
};

export const DEFAULT_EXAM_PREFERENCES: ExamPreferences = {
  showScratchNote: true,
  showOriginalPages: true,
  showNavigator: true,
  autoAdvanceOnAnswer: false,
  warnUnansweredOnSubmit: true,
  showTimer: false,
  showMcpHelp: true,
};

export const DEFAULT_IMAGE_PREFERENCES: ImagePreferences = {
  preserveSourcePages: true,
  showUnlinkedImages: true,
  thumbnailSize: "medium",
};

export const DEFAULT_GPT_MCP_PREFERENCES: GptMcpPreferences = {
  mcpShareScope: "current-question",
  importReviewExpanded: true,
  importDetailCollapsedByDefault: true,
};

export const DEFAULT_CHATGPT_MCP_PREFERENCES: ChatGptMcpPreferences = {
  displayName: "오답노트",
  shareUserResponse: true,
  shareScratchNote: true,
  shareQuestionImages: true,
  shareSourcePageImages: false,
  copyPromptBeforeOpen: true,
  openChatGptAfterCopy: true,
};

function normalizeSheetLayout(value: unknown): ViewPreferences["sheetLayout"] {
  return value === "columns" ? "columns" : "single";
}

function normalizeFontSize(value: unknown): ViewPreferences["fontSize"] {
  return value === "large" || value === "xlarge" ? value : "normal";
}

function normalizeThumbnailSize(value: unknown): ImagePreferences["thumbnailSize"] {
  return value === "small" || value === "large" ? value : "medium";
}

function normalizeMcpShareScope(value: unknown): GptMcpPreferences["mcpShareScope"] {
  if (value === "session" || value === "session-summary") return "session-summary";
  if (value === "off" || value === "submitted-result") return "submitted-result";
  if (value === "active-question" || value === "current-question") return "current-question";
  return DEFAULT_GPT_MCP_PREFERENCES.mcpShareScope;
}

export function normalizeViewPreferences(raw: unknown): ViewPreferences {
  const value = raw && typeof raw === "object" ? (raw as Partial<ViewPreferences>) : {};
  return {
    sheetLayout: normalizeSheetLayout(value.sheetLayout),
    fontSize: normalizeFontSize(value.fontSize),
    hideAnswers: Boolean(value.hideAnswers),
    showDifficulty: value.showDifficulty !== false,
    showOriginalPages: value.showOriginalPages !== false,
    showLearningVisuals: value.showLearningVisuals !== false,
    compactToolbar: Boolean(value.compactToolbar),
  };
}

export function normalizeExamPreferences(raw: unknown): ExamPreferences {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const showOriginalPages = value.showOriginalPages ?? value.showSourcePages;
  return {
    showScratchNote: value.showScratchNote !== false,
    showOriginalPages: showOriginalPages !== false,
    showNavigator: value.showNavigator !== false,
    autoAdvanceOnAnswer: Boolean(value.autoAdvanceOnAnswer),
    warnUnansweredOnSubmit: value.warnUnansweredOnSubmit !== false,
    showTimer: Boolean(value.showTimer),
    showMcpHelp: value.showMcpHelp !== false,
  };
}

export function normalizeImagePreferences(raw: unknown): ImagePreferences {
  const value = raw && typeof raw === "object" ? (raw as Partial<ImagePreferences>) : {};
  return {
    preserveSourcePages: value.preserveSourcePages !== false,
    showUnlinkedImages: value.showUnlinkedImages !== false,
    thumbnailSize: normalizeThumbnailSize(value.thumbnailSize),
  };
}

export function normalizeGptMcpPreferences(raw: unknown): GptMcpPreferences {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const importReviewExpanded =
    value.importReviewExpanded ?? value.expandImportAuditByDefault;
  const importDetailCollapsedByDefault =
    value.importDetailCollapsedByDefault ?? value.collapseQuestionDetailsByDefault;
  return {
    mcpShareScope: normalizeMcpShareScope(value.mcpShareScope),
    importReviewExpanded:
      importReviewExpanded === undefined
        ? DEFAULT_GPT_MCP_PREFERENCES.importReviewExpanded
        : Boolean(importReviewExpanded),
    importDetailCollapsedByDefault:
      importDetailCollapsedByDefault === undefined
        ? DEFAULT_GPT_MCP_PREFERENCES.importDetailCollapsedByDefault
        : Boolean(importDetailCollapsedByDefault),
  };
}

export function normalizeChatGptMcpPreferences(raw: unknown): ChatGptMcpPreferences {
  const value = raw && typeof raw === "object"
    ? raw as Partial<ChatGptMcpPreferences>
    : {};
  const displayName = typeof value.displayName === "string" && value.displayName.trim()
    ? value.displayName.trim().slice(0, 40)
    : DEFAULT_CHATGPT_MCP_PREFERENCES.displayName;
  const remoteBaseUrl = typeof value.remoteBaseUrl === "string" && value.remoteBaseUrl.trim()
    ? value.remoteBaseUrl.trim()
    : undefined;
  return {
    displayName,
    ...(remoteBaseUrl ? { remoteBaseUrl } : {}),
    shareUserResponse: value.shareUserResponse !== false,
    shareScratchNote: value.shareScratchNote !== false,
    shareQuestionImages: value.shareQuestionImages !== false,
    shareSourcePageImages: Boolean(value.shareSourcePageImages),
    copyPromptBeforeOpen: value.copyPromptBeforeOpen !== false,
    openChatGptAfterCopy: value.openChatGptAfterCopy !== false,
  };
}

export interface MigrateViewPreferencesInput {
  answerViewPreferences?: { hideAnswers?: boolean };
  storage?: ViewPreferencesLegacyStorage | null;
}

export function migrateViewPreferences(input: MigrateViewPreferencesInput = {}): ViewPreferences {
  const storage = input.storage ?? null;
  const hideFromSettings = Boolean(input.answerViewPreferences?.hideAnswers);
  const hideFromStorage = storage?.getItem(ENTRY_DETAIL_STORAGE_KEYS.answerHide) === "true";

  const savedLayout = storage?.getItem(ENTRY_DETAIL_STORAGE_KEYS.sheetLayout);
  const sheetLayout = savedLayout === "columns" ? "columns" : DEFAULT_VIEW_PREFERENCES.sheetLayout;

  const savedFontSize = storage?.getItem(ENTRY_DETAIL_STORAGE_KEYS.focusTextSize);
  const fontSize =
    savedFontSize === "large" || savedFontSize === "xlarge"
      ? savedFontSize
      : DEFAULT_VIEW_PREFERENCES.fontSize;

  const compactSaved = storage?.getItem(ENTRY_DETAIL_STORAGE_KEYS.studyControlCompact);
  const compactToolbar = compactSaved === "true";

  return normalizeViewPreferences({
    hideAnswers: hideFromSettings || hideFromStorage,
    sheetLayout,
    fontSize,
    showDifficulty: true,
    showOriginalPages: true,
    showLearningVisuals: true,
    compactToolbar,
  });
}

export function resolveViewPreferences(
  raw: unknown,
  legacy: MigrateViewPreferencesInput = {},
): ViewPreferences {
  if (raw !== undefined && raw !== null) {
    return normalizeViewPreferences(raw);
  }
  return migrateViewPreferences(legacy);
}
