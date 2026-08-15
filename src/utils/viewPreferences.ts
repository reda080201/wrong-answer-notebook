import type {
  ExamPreferences,
  ExamPrintPreferences,
  ExamPrintPreset,
  ChatGptMcpPreferences,
  GptMcpPreferences,
  ImagePreferences,
  LectureBlockDefaultState,
  QuestionSolutionPresentation,
  TextReviewDockState,
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
  problemSheetDisplayMode: "questions",
  questionSolutionPresentation: "split",
  lectureBlockDefaultState: "first",
  textReviewDockState: "compact",
  lectureLayout: "document",
  conceptLinksEnabled: true,
  automaticConceptLinksEnabled: false,
  conceptLinkPreviewMode: "popover",
};

export const DEFAULT_EXAM_PREFERENCES: ExamPreferences = {
  showScratchNote: true,
  showOriginalPages: true,
  showNavigator: true,
  autoAdvanceOnAnswer: false,
  warnUnansweredOnSubmit: true,
  showTimer: true,
  showMcpHelp: true,
  defaultRealExamMinutes: 50,
  realExamAnswerSheetOpen: true,
  warnBeforeEnd: true,
  autoSubmitOnTimeExpired: false,
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

export const DEFAULT_EXAM_PRINT_PREFERENCES: ExamPrintPreferences = {
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
  sourceDisplay: "hidden",
  includeSourceIndex: false,
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

export function normalizeQuestionSolutionPresentation(value: unknown): QuestionSolutionPresentation {
  return value === "dialog" || value === "split" ? value : "split";
}

export function normalizeLectureBlockDefaultState(value: unknown): LectureBlockDefaultState {
  return value === "all" || value === "none" || value === "first" ? value : "first";
}

export function normalizeTextReviewDockState(value: unknown): TextReviewDockState {
  return value === "expanded" || value === "hidden" ? value : "compact";
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
    problemSheetDisplayMode: value.problemSheetDisplayMode === "exam" ? "exam" : "questions",
    questionSolutionPresentation: normalizeQuestionSolutionPresentation(value.questionSolutionPresentation),
    lectureBlockDefaultState: normalizeLectureBlockDefaultState(value.lectureBlockDefaultState),
    textReviewDockState: normalizeTextReviewDockState(value.textReviewDockState),
    lectureLayout: value.lectureLayout === "cards" ? "cards" : "document",
    conceptLinksEnabled: value.conceptLinksEnabled !== false,
    automaticConceptLinksEnabled: Boolean(value.automaticConceptLinksEnabled),
    conceptLinkPreviewMode: "popover",
  };
}

export function normalizeExamPreferences(raw: unknown): ExamPreferences {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const showOriginalPages = value.showOriginalPages ?? value.showSourcePages;
  const defaultRealExamMinutes =
    typeof value.defaultRealExamMinutes === "number" && Number.isFinite(value.defaultRealExamMinutes)
      ? Math.max(1, Math.round(value.defaultRealExamMinutes))
      : DEFAULT_EXAM_PREFERENCES.defaultRealExamMinutes;
  return {
    showScratchNote: value.showScratchNote !== false,
    showOriginalPages: showOriginalPages !== false,
    showNavigator: value.showNavigator !== false,
    autoAdvanceOnAnswer: Boolean(value.autoAdvanceOnAnswer),
    warnUnansweredOnSubmit: value.warnUnansweredOnSubmit !== false,
    showTimer: value.showTimer === undefined ? DEFAULT_EXAM_PREFERENCES.showTimer : Boolean(value.showTimer),
    showMcpHelp: value.showMcpHelp !== false,
    defaultRealExamMinutes,
    realExamAnswerSheetOpen:
      value.realExamAnswerSheetOpen === undefined
        ? DEFAULT_EXAM_PREFERENCES.realExamAnswerSheetOpen
        : Boolean(value.realExamAnswerSheetOpen),
    warnBeforeEnd:
      value.warnBeforeEnd === undefined
        ? DEFAULT_EXAM_PREFERENCES.warnBeforeEnd
        : Boolean(value.warnBeforeEnd),
    autoSubmitOnTimeExpired:
      value.autoSubmitOnTimeExpired === undefined
        ? DEFAULT_EXAM_PREFERENCES.autoSubmitOnTimeExpired
        : Boolean(value.autoSubmitOnTimeExpired),
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

function normalizeExamPrintPreset(value: unknown): ExamPrintPreset {
  if (value === "spacious" || value === "wrong_only" || value === "source_like" || value === "custom" || value === "real_exam") {
    return value;
  }
  return DEFAULT_EXAM_PRINT_PREFERENCES.preset;
}

function normalizePaperSize(value: unknown): ExamPrintPreferences["paperSize"] {
  return value === "letter" ? "letter" : "a4";
}

function normalizeOrientation(value: unknown): ExamPrintPreferences["orientation"] {
  return value === "landscape" || value === "auto" ? value : "portrait";
}

function normalizePrintLayout(value: unknown): ExamPrintPreferences["layout"] {
  return value === "single" || value === "columns" ? value : "auto";
}

function normalizeWorkspaceSize(value: unknown): ExamPrintPreferences["workspaceSize"] {
  return value === "none" || value === "normal" || value === "large" ? value : "small";
}

export function normalizeExamPrintPreferences(raw: unknown): ExamPrintPreferences {
  const value = raw && typeof raw === "object" ? (raw as Partial<ExamPrintPreferences>) : {};
  const scratch = Number(value.extraScratchPages);
  return {
    preset: normalizeExamPrintPreset(value.preset),
    paperSize: normalizePaperSize(value.paperSize),
    orientation: normalizeOrientation(value.orientation),
    layout: normalizePrintLayout(value.layout),
    includeHeader: value.includeHeader !== false,
    includeAnswerSheet: value.includeAnswerSheet !== false,
    includePageNumbers: value.includePageNumbers !== false,
    includeSourcePages: Boolean(value.includeSourcePages),
    workspaceSize: normalizeWorkspaceSize(value.workspaceSize),
    extraScratchPages: Number.isFinite(scratch) ? Math.max(0, Math.min(3, Math.round(scratch))) : 0,
    sourceDisplay: value.sourceDisplay === "below-question" || value.sourceDisplay === "index-at-end" ? value.sourceDisplay : "hidden",
    includeSourceIndex: Boolean(value.includeSourceIndex),
  };
}
