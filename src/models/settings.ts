import type { EntryFormData, EntryKind, ProblemSourceType, QuestionAnswerType } from "./entry";
import type { AiProviderSettings, McpBridgeSettings } from "./integrations";

export interface LibraryPreferences {
  separateMockExams: boolean;
  defaultUnitView: "home" | "lectures" | "problems";
  listDensity: "standard" | "compact";
  showUserFolders: boolean;
}

export interface EntryTemplate {
  id: string;
  name: string;
  entryKind: EntryKind;
  data: Partial<EntryFormData>;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  builtIn?: boolean;
}

export interface MemoTemplate {
  id: string;
  name: string;
  content: string;
  builtIn?: boolean;
}

export type ProblemSheetDisplayMode = "questions" | "exam";
export type QuestionSolutionPresentation = "dialog" | "split";
export type LectureBlockDefaultState = "first" | "all" | "none";

export type LibraryNavigationGroup = "all" | "lectures" | "problems" | "past" | "nset" | "mocks" | "unclassified";

export interface LibraryNavigationPreference {
  subject?: string;
  course?: string;
  unit?: string;
  group?: LibraryNavigationGroup;
  section?: "all" | "lectures" | "problems";
}

export interface ViewPreferences {
  sheetLayout: "single" | "columns";
  fontSize: "normal" | "large" | "xlarge";
  hideAnswers: boolean;
  showDifficulty: boolean;
  showOriginalPages: boolean;
  showLearningVisuals: boolean;
  compactToolbar: boolean;
  problemSheetDisplayMode: ProblemSheetDisplayMode;
  questionSolutionPresentation: QuestionSolutionPresentation;
  lectureBlockDefaultState: LectureBlockDefaultState;
  lectureLayout?: LectureLayout;
  libraryNavigation?: LibraryNavigationPreference;
  lectureBodyWidth?: LectureBodyWidth;
  conceptLinksEnabled?: boolean;
  automaticConceptLinksEnabled?: boolean;
  conceptLinkPreviewMode?: "popover";
}

export type LectureLayout = "document" | "cards";
export type LectureBodyWidth = "narrow" | "standard" | "wide" | "full";

export interface ExamPreferences {
  showScratchNote: boolean;
  showOriginalPages: boolean;
  showNavigator: boolean;
  autoAdvanceOnAnswer: boolean;
  warnUnansweredOnSubmit: boolean;
  showTimer: boolean;
  showMcpHelp: boolean;
  defaultRealExamMinutes?: number;
  realExamAnswerSheetOpen?: boolean;
  warnBeforeEnd?: boolean;
  autoSubmitOnTimeExpired?: boolean;
  defaultAnswerSheetLayout?: "auto" | "vertical" | "horizontal";
}

export interface ImagePreferences {
  preserveSourcePages: boolean;
  showUnlinkedImages: boolean;
  thumbnailSize: "small" | "medium" | "large";
}

export interface GptMcpPreferences {
  mcpShareScope: "current-question" | "session-summary" | "submitted-result";
  importReviewExpanded: boolean;
  importDetailCollapsedByDefault: boolean;
}

/** ChatGPT preferences for read-only local MCP bridge. */
export interface ChatGptMcpPreferences {
  displayName: string;
  remoteBaseUrl?: string;
  shareUserResponse: boolean;
  shareScratchNote: boolean;
  shareQuestionImages: boolean;
  shareSourcePageImages: boolean;
  copyPromptBeforeOpen: boolean;
  openChatGptAfterCopy: boolean;
}

/** Retake exam sheet PDF preset */
export type ExamPrintPreset =
  | "real_exam"
  | "spacious"
  | "wrong_only"
  | "source_like"
  | "custom";

/** Share/export question scope */
export type ExportScopeMode =
  | "current"
  | "selected"
  | "wrong"
  | "important"
  | "marked"
  | "whole"
  | "manual";

/** Exam print/PDF preferences */
export interface ExamPrintPreferences {
  preset: ExamPrintPreset;
  paperSize: "a4" | "letter";
  orientation: "portrait" | "landscape" | "auto";
  layout: "single" | "columns" | "auto";
  includeHeader: boolean;
  includeAnswerSheet: boolean;
  includePageNumbers: boolean;
  includeSourcePages: boolean;
  workspaceSize: "none" | "small" | "normal" | "large";
  extraScratchPages: number;
  sourceDisplay?: "hidden" | "below-question" | "index-at-end";
  includeSourceIndex?: boolean;
}

export interface AppSettings {
  templates: EntryTemplate[];
  promptTemplates: PromptTemplate[];
  memoTemplates: MemoTemplate[];
  aiProvider: AiProviderSettings;
  importPreferences: {
    lastPromptTemplateId?: string;
  };
  viewPreferences: ViewPreferences;
  examPreferences: ExamPreferences;
  examPrintPreferences: ExamPrintPreferences;
  imagePreferences: ImagePreferences;
  gptMcpPreferences: GptMcpPreferences;
  chatGptMcpPreferences: ChatGptMcpPreferences;
  answerViewPreferences: {
    viewMode: "card" | "table";
    hideAnswers: boolean;
  };
  autoBackup: {
    enabled: boolean;
    lastBackupAt?: string;
  };
  mcpBridge: McpBridgeSettings;
  updatePreferences: AppUpdatePreferences;
  questionBankPreferences?: QuestionBankPreferences;
  libraryPreferences?: LibraryPreferences;
}

export type QuestionBankSort = "updated" | "difficulty" | "importance" | "quality" | "review_due";

export interface QuestionBankStoredFilters {
  subject?: string;
  sourceType?: ProblemSourceType | "all";
  unit?: string;
  subunit?: string;
  concept?: string;
  minDifficulty?: number | null;
  minImportance?: number | null;
  minQuality?: number | null;
  answerType?: QuestionAnswerType | "all";
  wrongOnly?: boolean;
  answerState?: "all" | "has" | "missing";
  explanationState?: "all" | "has" | "missing";
  hasImages?: "all" | "has" | "missing";
  reviewDueOnly?: boolean;
  year?: string;
  tag?: string;
}

export interface QuestionBankPreset {
  id: string;
  name: string;
  filters: QuestionBankStoredFilters;
  sort: QuestionBankSort;
}

export interface QuestionBankPreferences {
  recentFilters?: QuestionBankStoredFilters;
  savedPresets?: QuestionBankPreset[];
  lastSort?: QuestionBankSort;
}

export interface AppUpdatePreferences {
  autoCheckEnabled: boolean;
  notificationsEnabled: boolean;
  backupBeforeInstall: boolean;
  channel: "stable";
  skippedVersion?: string;
  lastCheckedAt?: string;
  lastSeenReleaseNotesVersion?: string;
}

export type IntegritySeverity = "info" | "warning" | "error";

export interface IntegrityIssue {
  id: string;
  severity: IntegritySeverity;
  message: string;
  entryId?: string;
}

export interface IntegrityReport {
  checkedAt: string;
  issues: IntegrityIssue[];
}

export interface OrphanImagePreview {
  filenames: string[];
  totalBytes: number;
}
