import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { AiProviderStatus, Annotation, AnnotationTool, ChatGptMcpPreferences, ChecklistItem, ExamPrintPreferences, ExamSession, ExportScopeMode, McpSendOptions, ProblemSheetDisplayMode, QuestionMeta, ReviewResult, SheetAnswerItem, ViewPreferences, WrongAnswerEntry } from "../../../types";
import type { ExportHubView } from "../../../features/export/types";
import type { SettingsTab } from "../../../components/SettingsModal";
import { hasExplanationContent } from "../../../utils/entry";
import { getRelatedEntries } from "../../../utils/concepts";
import { buildConceptAnalytics } from "../../../utils/conceptAnalytics";
import { buildLearningBlocksFromEntry } from "../../../utils/learningContent";
import {
  recommendedStrategyForAnalysis,
} from "../../../utils/mistakeAnalysis";
import { getNextStudyAction, type NextStudyActionId } from "../../../utils/nextStudyAction";
import { normalizeDifficultyScore } from "../../../utils/difficulty";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { getEntryQuestions, resolvedQuestionToBlock } from "../../../utils/entryQuestions";
import { detectSuspiciousTextSegments } from "../../../utils/suspiciousText";
import {
  getQuestionMetaForBlock,
  normalizeQuestionMeta,
  normalizeQuestionNumber,
  applyQuestionReviewResult,
  toggleQuestionImportant,
} from "../../../utils/questionMeta";
import AnnotatableQuestion, { FocusedQuestionView } from "../../../components/AnnotatableQuestion";
import CollapsibleSection from "../../../components/CollapsibleSection";
import ContentBlock from "../../../components/ContentBlock";
import { LinkifiedText } from "../../../utils/wikiLinks";
import LearningContentPanel from "../../../components/LearningContentPanel";
import MathText from "../../../components/MathText";
import SolutionBookView from "../../../components/SolutionBookView";
import StudyAnalysisView from "../../../components/StudyAnalysisView";
import StudyPaperView from "../../../components/StudyPaperView";
import StudyFlowStrip from "../../../components/StudyFlowStrip";
import StudyZoomViewport, { getQuestionZoomStorageKey } from "../../../components/StudyZoomViewport";
import QuestionTheaterView from "../../../components/QuestionTheaterView";
import LectureReaderView from "../../../components/LectureReaderView";
import ExportHubModal from "../../../features/export/components/ExportHubModal";
import type { ChatGptSharePayload } from "../../../features/export/types";
import type { GptSolutionPurpose } from "../../../features/export/components/ChatGptSharePanel";
import GptSolutionRoundtripModal from "../../../features/gpt-solution-roundtrip/components/GptSolutionRoundtripModal";
import type { GptSolutionRoundtripDraft } from "../../../features/gpt-solution-roundtrip/model";
import { validateGptSolutionResponse } from "../../../features/gpt-solution-roundtrip/services/gptSolutionRoundtrip";
import type { GptSolutionRoundtripDraftStore } from "../../../hooks/useGptSolutionRoundtripDrafts";
import QuickViewSettingsMenu from "../../../components/QuickViewSettingsMenu";
import { writeUiStorageValue } from "../../../services/uiStorage";
import Toast from "../../../shared/ui/Toast";
import Menu from "../../../shared/ui/Menu";
import SimilarQuestionLinksPanel from "../../../features/question-bank/components/SimilarQuestionLinksPanel";
import type { QuestionBankItem } from "../../../features/question-bank/model/questionBankTypes";
import { buildConceptLinkContext } from "../../../features/learning/utils/conceptIndex";
import {
  ConceptChecklistSection,
  ConceptConnectionsSection,
  EntryImportAuditSection,
  EntryMistakeAnalysisSection,
} from "../../../components/EntryDetailSections";
import FocusedAnswerPanel from "./FocusedAnswerPanel";
import FocusedNotesPanel from "./FocusedNotesPanel";
import FocusedStudyHints from "./FocusedStudyHints";
import { EntryDetailProvider } from "./EntryDetailContext";
import { ProblemSheetHeader, QuestionWorkspace, ReviewExportDialogs, SecondaryStudyViews } from "./EntryDetailAreas";
import EntryDetailReviewDialogs from "./EntryDetailReviewDialogs";
import EntryDetailStudyControls from "./EntryDetailStudyControls";
import EntryDetailViewHelpDialog from "./EntryDetailViewHelpDialog";

interface EntryDetailProps {
  entry: WrongAnswerEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMastered: () => Promise<void>;
  onToggleDifficult: () => Promise<void>;
  onAnnotationsChange: (annotations: Annotation[]) => Promise<void>;
  onChecklistChange?: (checklist: ChecklistItem[]) => Promise<void>;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  allEntries?: WrongAnswerEntry[];
  onOpenEntry?: (entryId: string) => void;
  onOpenQuestionTarget?: (entryId: string, questionNumber: string) => void;
  onQuickGptSolution?: () => void;
  onExportMarkdown?: () => void;
  onOpenPrint?: () => void;
  onStartExam?: () => void;
  onStartRealExam?: () => void;
  startExamLabel?: string;
  startRealExamLabel?: string;
  examSession?: ExamSession | null;
  examPrintPreferences?: ExamPrintPreferences;
  onExamPrintPreferencesChange?: (patch: Partial<ExamPrintPreferences>) => Promise<void> | void;
  onSyncExportContext?: (payload: {
    scope: ExportScopeMode;
    questionNumbers: string[];
    submitted: boolean;
    shareOptions: McpSendOptions;
  }) => Promise<void>;
  onReview?: (entry: WrongAnswerEntry, result: ReviewResult) => Promise<void>;
  onQuickMemo?: (entry: WrongAnswerEntry, text: string) => Promise<void>;
  onLearningBlocksChange?: (entry: WrongAnswerEntry, blocks: WrongAnswerEntry["learningBlocks"]) => Promise<void>;
  onImportLecture?: () => void;
  onQuestionTextChange?: (entry: WrongAnswerEntry, text: string) => Promise<void>;
  onStructuredQuestionsChange?: (entry: WrongAnswerEntry, questions: NonNullable<WrongAnswerEntry["structuredQuestions"]>) => Promise<void>;
  onTitleChange?: (entry: WrongAnswerEntry, title: string) => Promise<void>;
  onQuestionMetaChange?: (
    entry: WrongAnswerEntry,
    questionMeta: QuestionMeta[] | ((current: QuestionMeta[]) => QuestionMeta[]),
  ) => Promise<void>;
  initialQuestionTarget?: { questionNumber: string; requestId: number } | null;
  onInitialQuestionTargetConsumed?: (
    requestId: number,
    result: "opened" | "not-found",
  ) => void;
  viewPreferences?: ViewPreferences;
  onViewPreferencesChange?: (patch: Partial<ViewPreferences>) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
  aiProviderStatus?: AiProviderStatus | null;
  chatGptPreferences?: ChatGptMcpPreferences;
  onChatGptPreferencesChange?: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onOpenChatGptSettings?: () => void;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
  questionBankItems?: QuestionBankItem[];
  onSimilarQuestionLinksChange?: (entry: WrongAnswerEntry, links: WrongAnswerEntry["similarQuestionLinks"]) => Promise<void>;
  onApplyGptSolutionRoundtrip?: (entry: WrongAnswerEntry, patch: Pick<WrongAnswerEntry, "answerKey" | "learningBlocks">) => Promise<void>;
  onPersistQuestionRender?: (input: { questionNumber: string; blob: Blob; filename: string; canonicalFingerprint: string }) => Promise<void>;
  onUpdateQuestionRenderVerification?: (input: { questionNumber: string; status: "unverified" | "needs_review" | "verified" }) => Promise<void>;
  gptSolutionDraftStore?: GptSolutionRoundtripDraftStore;
}

type SheetLayout = "auto" | "single" | "columns";
type AnswerViewMode = "card" | "table";
type DetailViewMode = "paper" | "solution" | "learning" | "analysis";
type FocusMode = "closed" | "expanded" | "mini";
type FocusTextSize = "normal" | "large" | "xlarge";
type StudyPanel = "question" | "answer" | "explanation" | "notes" | "images";

const SHEET_LAYOUT_KEY = "wrong-answer-sheet-layout";
const ANSWER_VIEW_KEY = "wrong-answer-answer-view";
const ANSWER_HIDE_KEY = "wrong-answer-answer-hidden";
const FOCUS_TEXT_SIZE_KEY = "wrong-answer-focus-text-size";
const FOCUS_PANEL_KEY = "wrong-answer-focus-last-panel";
const STUDY_CONTROL_COMPACT_KEY = "wrong-answer-study-control-compact";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadSheetLayout(): SheetLayout {
  const saved = localStorage.getItem(SHEET_LAYOUT_KEY);
  return saved === "columns" ? "columns" : "single";
}

function loadAnswerView(): AnswerViewMode {
  return localStorage.getItem(ANSWER_VIEW_KEY) === "table" ? "table" : "card";
}

function loadAnswerHidden(): boolean {
  return localStorage.getItem(ANSWER_HIDE_KEY) === "true";
}

function loadFocusTextSize(): FocusTextSize {
  const saved = localStorage.getItem(FOCUS_TEXT_SIZE_KEY);
  return saved === "large" || saved === "xlarge" ? saved : "normal";
}

function loadFocusPanel(): StudyPanel {
  const saved = localStorage.getItem(FOCUS_PANEL_KEY);
  return saved === "answer" || saved === "explanation" || saved === "notes" || saved === "images" ? saved : "question";
}

function loadStudyControlCompact(): boolean {
  const saved = localStorage.getItem(STUDY_CONTROL_COMPACT_KEY);
  if (saved === "true") return true;
  if (saved === "false") return false;
  return typeof window !== "undefined" && window.matchMedia?.("(max-height: 760px)").matches;
}

function shouldIgnoreStudyShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  if (!tagName) return false;
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ||
    Boolean(target.closest("[role='dialog'], .form-modal, .import-modal, .review-panel, .study-quick-memo"))
  );
}

export default function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onToggleMastered,
  onToggleDifficult,
  onAnnotationsChange,
  onChecklistChange,
  onWikiLinkClick,
  existingTargets,
  allEntries = [],
  onOpenEntry,
  onOpenQuestionTarget,
  onQuickGptSolution,
  onOpenPrint,
  onStartExam,
  onStartRealExam,
  startExamLabel = "문제 풀기",
  startRealExamLabel = "실전 모드",
  examSession,
  examPrintPreferences,
  onExamPrintPreferencesChange,
  onSyncExportContext,
  onReview,
  onQuickMemo,
  onLearningBlocksChange,
  onImportLecture,
  onQuestionTextChange,
  onStructuredQuestionsChange,
  onTitleChange,
  onQuestionMetaChange,
  initialQuestionTarget,
  onInitialQuestionTargetConsumed,
  viewPreferences,
  onViewPreferencesChange,
  onOpenSettings,
  aiProviderStatus,
  chatGptPreferences,
  onChatGptPreferencesChange,
  onOpenChatGptSettings,
  onCheckLocalMcp,
  remoteMcpConfigured,
  questionBankItems = [],
  onSimilarQuestionLinksChange,
  onApplyGptSolutionRoundtrip,
  onPersistQuestionRender,
  onUpdateQuestionRenderVerification,
  gptSolutionDraftStore,
}: EntryDetailProps) {
  const [focusMode, setFocusMode] = useState<FocusMode>("closed");
  const [focusTextSize, setFocusTextSize] = useState<FocusTextSize>(viewPreferences?.fontSize ?? loadFocusTextSize);
  const [activeStudyPanel, setActiveStudyPanel] = useState<StudyPanel>(loadFocusPanel);
  const [memoMode, setMemoMode] = useState(false);
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>(viewPreferences?.sheetLayout ?? loadSheetLayout);
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetSearchOpen, setSheetSearchOpen] = useState(false);
  const [sheetTocOpen, setSheetTocOpen] = useState(false);
  const [quickViewSettingsRequested, setQuickViewSettingsRequested] = useState(false);
  const [answerView, setAnswerView] = useState<AnswerViewMode>(loadAnswerView);
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>("paper");
  const [problemSheetDisplayMode, setProblemSheetDisplayMode] = useState<ProblemSheetDisplayMode>(
    viewPreferences?.problemSheetDisplayMode ?? "questions",
  );
  const [hideAnswers, setHideAnswers] = useState(viewPreferences?.hideAnswers ?? loadAnswerHidden);
  const [revealedAnswerNumbers, setRevealedAnswerNumbers] = useState<Set<string>>(() => new Set());
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState(0);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [quickMemoText, setQuickMemoText] = useState("");
  const [studyControlCompact, setStudyControlCompact] = useState(viewPreferences?.compactToolbar ?? loadStudyControlCompact);
  const [showTextReview, setShowTextReview] = useState(false);
  const [showExportHub, setShowExportHub] = useState(false);
  const [exportHubView, setExportHubView] = useState<ExportHubView>("home");
  const [exportHubScope, setExportHubScope] = useState<ExportScopeMode>("current");
  const [exportSelectionOnly, setExportSelectionOnly] = useState(false);
  const [solutionRoundtrip, setSolutionRoundtrip] = useState<{
    draftId: string;
    purpose: GptSolutionPurpose;
    questionNumbers: string[];
    payload: ChatGptSharePayload;
  } | null>(null);
  const [viewHelpOpen, setViewHelpOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedQuestionNumbers, setSelectedQuestionNumbers] = useState<string[]>([]);
  const [theaterQuestionIndex, setTheaterQuestionIndex] = useState<number | null>(null);
  const [selectedReviewQueue, setSelectedReviewQueue] = useState<{
    entryId: string;
    questionNumbers: string[];
    currentIndex: number;
    mode: "selected" | "important" | "sheet";
  } | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(entry.title);
  const [reviewSaving, setReviewSaving] = useState<ReviewResult | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; tone: "success" | "error" | "info" }>>([]);
  const [activeTool, setActiveTool] = useState<AnnotationTool | "erase">(
    "highlight",
  );
  const consumedInitialTargetRef = useRef<number | null>(null);
  const sheetSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetSearchInputRef = useRef<HTMLInputElement>(null);

  const updateViewPreference = useCallback(<K extends keyof ViewPreferences>(key: K, value: ViewPreferences[K]) => {
    if (key === "sheetLayout") setSheetLayout(value as SheetLayout);
    if (key === "fontSize") setFocusTextSize(value as FocusTextSize);
    if (key === "hideAnswers") setHideAnswers(Boolean(value));
    if (key === "compactToolbar") setStudyControlCompact(Boolean(value));
    if (key === "problemSheetDisplayMode") setProblemSheetDisplayMode(value as ProblemSheetDisplayMode);
    onViewPreferencesChange?.({ [key]: value } as Partial<ViewPreferences>);
  }, [onViewPreferencesChange]);

  useEffect(() => {
    if (!viewPreferences) return;
    setSheetLayout(viewPreferences.sheetLayout);
    setFocusTextSize(viewPreferences.fontSize);
    setHideAnswers(viewPreferences.hideAnswers);
    setStudyControlCompact(viewPreferences.compactToolbar);
    setProblemSheetDisplayMode(viewPreferences.problemSheetDisplayMode);
  }, [viewPreferences]);

  const filledParts = entry.explanationParts
    .map((p, i) => ({ part: p, index: i }))
    .filter(({ part }) => part.text.trim() || part.images.length > 0);

  const explanationBadge =
    filledParts.length > 0
      ? `${filledParts.length}개 · 이미지 ${filledParts.reduce((n, { part }) => n + part.images.length, 0)}`
      : undefined;

  const annCount = entry.annotations?.length ?? 0;
  const isSheet = entry.entryKind === "problem_sheet";
  const isConcept = entry.entryKind === "concept";
  const isLecture = entry.entryKind === "lecture";
  const isWrongAnswer = entry.entryKind === "wrong_answer";
  const isFocusable = !isConcept && !isLecture;
  const isFocusExpanded = isFocusable && focusMode === "expanded";
  const isFocusMini = isFocusable && focusMode === "mini";
  const sheetAnswerKey = (entry.answerKey ?? []).filter(
    (item) =>
      item.questionNumber.trim() ||
      item.answer.trim() ||
      item.explanation.trim() ||
      item.importantPoints.length,
  );
  const resolvedSheetQuestions = useMemo(
    () => (entry.structuredQuestions?.length ? getEntryQuestions(entry) : []),
    [entry],
  );
  const questionBlocks = useMemo(
    () => entry.structuredQuestions?.length
      ? resolvedSheetQuestions.map(resolvedQuestionToBlock)
      : parseQuestionText(entry.question),
    [entry.question, entry.structuredQuestions?.length, resolvedSheetQuestions],
  );
  const questionAnchors = useMemo(
    () => questionBlocks.filter((block) => block.kind === "question"),
    [questionBlocks],
  );
  const focusedQuestion = questionAnchors[focusedQuestionIndex] as QuestionBlock | undefined;
  const questionIdentifier = useCallback((question?: QuestionBlock) => {
    if (!question) return null;
    if (entry.structuredQuestions?.length) {
      return question.numberLabel ? normalizeQuestionNumber(String(question.numberLabel)) : null;
    }
    return question.displayNumber ? String(question.displayNumber) : null;
  }, [entry.structuredQuestions?.length]);
  const focusedPassage = (() => {
    if (!focusedQuestion) return undefined;
    const currentIndex = questionBlocks.findIndex((block) => block === focusedQuestion);
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const block = questionBlocks[index];
      if (block.kind === "passage" || block.kind === "paragraph") return block;
      if (block.kind === "question") break;
    }
    return undefined;
  })();
  const sheetMatches = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return [];
    if (entry.structuredQuestions?.length) {
      return questionAnchors.filter((_block, index) => {
        const question = resolvedSheetQuestions[index];
        return `${question?.questionNumber ?? ""} ${question?.questionText ?? ""} ${question?.conditions.join(" ") ?? ""} ${question?.equations.join(" ") ?? ""} ${question?.choices.join(" ") ?? ""} ${question?.contentSegments?.filter((segment) => segment.type === "table").flatMap((segment) => segment.rows.flat()).join(" ") ?? ""}`.toLowerCase().includes(q);
      });
    }
    return questionAnchors.filter((block) => `${block.numberLabel} ${block.body} ${block.choices.map((choice) => choice.text).join(" ")}`.toLowerCase().includes(q));
  }, [entry.structuredQuestions?.length, questionAnchors, resolvedSheetQuestions, sheetSearch]);
  const relatedEntries = useMemo(
    () => (isConcept ? getRelatedEntries(entry, allEntries) : []),
    [allEntries, entry, isConcept],
  );
  const conceptAnalytics = useMemo(() => {
    if (!isConcept || !entry.title.trim()) return undefined;
    return buildConceptAnalytics(allEntries).find(
      (item) => item.concept.trim().toLowerCase() === entry.title.trim().toLowerCase(),
    );
  }, [allEntries, entry.title, isConcept]);
  const diagnosisStrategy = recommendedStrategyForAnalysis(entry.mistakeAnalysis);
  const hasMistakeAnalysis =
    (entry.mistakeAnalysis?.causes.length ?? 0) > 0 ||
    Boolean(entry.mistakeAnalysis?.preventionNote?.trim());
  const showPaperSupplementSections = !isFocusExpanded && detailViewMode === "paper";
  const hasNextQuestion = isSheet && focusedQuestionIndex < questionAnchors.length - 1;
  const suspiciousSegments = useMemo(
    () => (isFocusable ? detectSuspiciousTextSegments(entry.question) : []),
    [entry.question, isFocusable],
  );
  const hasSuspiciousText = suspiciousSegments.length > 0;

  useEffect(() => {
    writeUiStorageValue(ANSWER_VIEW_KEY, answerView);
  }, [answerView]);

  useEffect(() => {
    writeUiStorageValue(FOCUS_PANEL_KEY, activeStudyPanel);
  }, [activeStudyPanel]);

  useEffect(() => {
    if (onViewPreferencesChange) return;
    writeUiStorageValue(SHEET_LAYOUT_KEY, sheetLayout);
  }, [onViewPreferencesChange, sheetLayout]);

  useEffect(() => {
    if (onViewPreferencesChange) return;
    writeUiStorageValue(ANSWER_HIDE_KEY, hideAnswers ? "true" : "false");
  }, [hideAnswers, onViewPreferencesChange]);

  useEffect(() => {
    if (onViewPreferencesChange) return;
    writeUiStorageValue(FOCUS_TEXT_SIZE_KEY, focusTextSize);
  }, [focusTextSize, onViewPreferencesChange]);

  useEffect(() => {
    if (onViewPreferencesChange) return;
    writeUiStorageValue(STUDY_CONTROL_COMPACT_KEY, studyControlCompact ? "true" : "false");
  }, [onViewPreferencesChange, studyControlCompact]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [sheetSearch, entry.id]);

  useEffect(() => {
    if (!sheetSearchOpen) return undefined;
    const frame = window.requestAnimationFrame(() => sheetSearchInputRef.current?.focus());
    const closeSearch = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheetSearchOpen(false);
        sheetSearchTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeSearch);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeSearch);
    };
  }, [sheetSearchOpen]);

  useEffect(() => {
    if (!isSheet || detailViewMode !== "paper") return undefined;
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSheetSearchOpen(true);
      }
    };
    document.addEventListener("keydown", openSearch);
    return () => document.removeEventListener("keydown", openSearch);
  }, [detailViewMode, isSheet]);

  useEffect(() => {
    setFocusedQuestionIndex(0);
    setFocusMode("closed");
    setTheaterQuestionIndex(null);
    setShowTextReview(false);
    setSelectionMode(false);
    setSelectedQuestionNumbers([]);
    setRevealedAnswerNumbers(new Set());
    setTitleEditing(false);
    setTitleDraft(entry.title);
  }, [entry.id, entry.title]);

  useEffect(() => {
    setTitleDraft(entry.title);
  }, [entry.title]);

  useEffect(() => {
    if (focusedQuestionIndex >= questionAnchors.length) {
      setFocusedQuestionIndex(Math.max(0, questionAnchors.length - 1));
    }
  }, [focusedQuestionIndex, questionAnchors.length]);

  const scrollToQuestion = useCallback((start: number) => {
    document.getElementById(`sheet-question-${start}`)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, []);

  const moveSearch = (delta: number) => {
    if (sheetMatches.length === 0) return;
    const nextIndex = (activeSearchIndex + delta + sheetMatches.length) % sheetMatches.length;
    setActiveSearchIndex(nextIndex);
    const match = sheetMatches[nextIndex];
    if (match?.kind === "question") scrollToQuestion(match.start);
  };

  const updateChecklist = async (next: ChecklistItem[]) => {
    try {
      await onChecklistChange?.(next);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "체크리스트 저장에 실패했습니다.", "error");
    }
  };

  const pushToast = useCallback((message: string, tone: "success" | "error" | "info" = "info") => {
    const id = uuidv4();
    setToasts((items) => [...items, { id, message, tone }].slice(-3));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 2400);
  }, []);

  const openExportHub = useCallback((view: ExportHubView = "home", scope?: ExportScopeMode, selectionOnly = false) => {
    setExportHubView(view);
    setExportHubScope(scope ?? (selectionMode && selectedQuestionNumbers.length > 0 ? "selected" : "current"));
    setExportSelectionOnly(selectionOnly);
    setShowExportHub(true);
  }, [selectedQuestionNumbers.length, selectionMode]);

  const moveTheaterQuestion = useCallback((delta: number) => {
    if (selectedReviewQueue && selectedReviewQueue.entryId === entry.id) {
      const nextQueueIndex = Math.max(
        0,
        Math.min(selectedReviewQueue.questionNumbers.length - 1, selectedReviewQueue.currentIndex + delta),
      );
      const nextQuestionNumber = selectedReviewQueue.questionNumbers[nextQueueIndex];
      const nextQuestionIndex = questionAnchors.findIndex(
        (block) => questionIdentifier(block) === normalizeQuestionNumber(nextQuestionNumber),
      );
      if (nextQuestionIndex >= 0) {
        setSelectedReviewQueue({ ...selectedReviewQueue, currentIndex: nextQueueIndex });
        setTheaterQuestionIndex(nextQuestionIndex);
        setFocusedQuestionIndex(nextQuestionIndex);
      }
      return;
    }
    setTheaterQuestionIndex((current) => {
      const currentIndex = current ?? 0;
      const next = Math.max(0, Math.min(questionAnchors.length - 1, currentIndex + delta));
      setFocusedQuestionIndex(next);
      return next;
    });
  }, [entry.id, questionAnchors, questionIdentifier, selectedReviewQueue]);

  const moveFocusedQuestion = useCallback((delta: number) => {
    if (!isSheet || questionAnchors.length === 0) return;
    // Keep theater and focused indices in lockstep while the overlay is open.
    if (theaterQuestionIndex !== null) {
      moveTheaterQuestion(delta);
      return;
    }
    setFocusedQuestionIndex((index) => {
      const next = Math.max(0, Math.min(questionAnchors.length - 1, index + delta));
      const target = questionAnchors[next] as QuestionBlock | undefined;
      if (focusMode === "closed" && target) {
        window.setTimeout(() => scrollToQuestion(target.start), 0);
      }
      return next;
    });
  }, [focusMode, isSheet, moveTheaterQuestion, questionAnchors, scrollToQuestion, theaterQuestionIndex]);

  const handleReviewResult = useCallback(async (
    result: ReviewResult,
    explicitQuestion?: QuestionBlock,
  ) => {
    if (reviewSaving) return;
    if (isSheet && !explicitQuestion && theaterQuestionIndex === null && focusMode === "closed") {
      pushToast("문제를 크게 보거나 집중 보기에서 복습 결과를 기록하세요.", "info");
      return;
    }
    setReviewSaving(result);
    try {
      const currentSheetQuestion =
        explicitQuestion ??
        (theaterQuestionIndex !== null
          ? questionAnchors[theaterQuestionIndex] as QuestionBlock | undefined
          : focusedQuestion);
      if (isSheet && currentSheetQuestion && onQuestionMetaChange) {
        await onQuestionMetaChange(entry, (current) => {
          const questionMeta = normalizeQuestionMeta(current).find(
            (meta) => normalizeQuestionNumber(meta.questionNumber) === questionIdentifier(currentSheetQuestion),
          );
          return applyQuestionReviewResult(
            current,
            questionIdentifier(currentSheetQuestion) ?? String(currentSheetQuestion.displayNumber),
            result,
            new Date(),
            questionMeta?.mistakeAnalysis?.primaryCause,
          );
        });
      } else if (onReview) {
        await onReview(entry, result);
      } else {
        return;
      }
      pushToast(
        result === "again"
          ? "다시 볼 문제로 기록했습니다."
          : result === "hard"
            ? "어려움으로 기록했습니다."
            : "맞음으로 기록했습니다.",
        "success",
      );
      if (selectedReviewQueue?.entryId === entry.id) {
        const nextQueueIndex = Math.min(
          selectedReviewQueue.questionNumbers.length - 1,
          selectedReviewQueue.currentIndex + 1,
        );
        if (nextQueueIndex !== selectedReviewQueue.currentIndex) {
          const nextQuestionNumber = selectedReviewQueue.questionNumbers[nextQueueIndex];
          const nextQuestionIndex = questionAnchors.findIndex(
            (block) => questionIdentifier(block) === normalizeQuestionNumber(nextQuestionNumber),
          );
          if (nextQuestionIndex >= 0) {
            setSelectedReviewQueue({ ...selectedReviewQueue, currentIndex: nextQueueIndex });
            setTheaterQuestionIndex(nextQuestionIndex);
            setFocusedQuestionIndex(nextQuestionIndex);
          }
        }
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "복습 결과 저장에 실패했습니다.", "error");
    } finally {
      setReviewSaving(null);
    }
  }, [entry, focusMode, focusedQuestion, isSheet, onQuestionMetaChange, onReview, pushToast, questionAnchors, questionIdentifier, reviewSaving, selectedReviewQueue, theaterQuestionIndex]);

  const handleQuickMemoSubmit = async () => {
    const text = quickMemoText.trim();
    if (!text || !onQuickMemo) return;
    try {
      await onQuickMemo(entry, text);
      setQuickMemoText("");
      setQuickMemoOpen(false);
      pushToast("빠른 메모를 추가했습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "메모 저장에 실패했습니다.", "error");
    }
  };

  const handleStudyModeChange = useCallback((mode: DetailViewMode) => {
    setDetailViewMode(mode);
    pushToast(
      mode === "paper"
        ? "문제지 모드"
        : mode === "solution"
          ? "해설지 모드"
          : mode === "learning"
            ? "특강 모드"
            : "분석 모드",
      "info",
    );
  }, [pushToast]);

  const handleAutoCreateLecture = useCallback(async () => {
    if (!onLearningBlocksChange) return;
    const generated = buildLearningBlocksFromEntry(entry);
    if (!generated.length) {
      pushToast("해설이나 메모가 부족해 자동 생성할 특강이 없습니다.", "info");
      return;
    }
    try {
      await onLearningBlocksChange(entry, generated);
      setDetailViewMode("learning");
      pushToast("해설에서 특강 카드를 만들었습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "특강 생성에 실패했습니다.", "error");
    }
  }, [entry, onLearningBlocksChange, pushToast]);

  const handleToggleDifficultWithToast = async () => {
    try {
      await onToggleDifficult();
      pushToast(entry.difficult ? "어려움 표시를 해제했습니다." : "어려움으로 표시했습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "난이도 상태 저장에 실패했습니다.", "error");
    }
  };

  const handleTitleSave = async () => {
    const title = titleDraft.trim();
    if (!title) {
      pushToast("빈 제목은 사용할 수 없습니다.", "error");
      return;
    }
    if (!onTitleChange || title === entry.title.trim()) {
      setTitleEditing(false);
      return;
    }
    try {
      await onTitleChange(entry, title);
      setTitleEditing(false);
      pushToast("시험지 이름을 변경했습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "시험지 이름 변경에 실패했습니다.", "error");
    }
  };

  const handleToggleQuestionImportant = async (questionNumber: string) => {
    if (!onQuestionMetaChange) return;
    const changed = normalizeQuestionMeta(entry.questionMeta).find(
      (meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(questionNumber),
    );
    try {
      await onQuestionMetaChange(entry, (current) => toggleQuestionImportant(current, questionNumber));
      pushToast(
        !(changed?.important ?? false)
          ? `${normalizeQuestionNumber(questionNumber)}번 문제를 중요 표시했습니다.`
          : `${normalizeQuestionNumber(questionNumber)}번 문제 중요 표시를 해제했습니다.`,
        "success",
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "중요 표시 저장에 실패했습니다.", "error");
    }
  };

  const handleQuestionDifficultyScoreChange = async (
    questionNumber: string,
    score: number | undefined,
  ) => {
    if (!onQuestionMetaChange) return;
    const normalized = normalizeQuestionNumber(questionNumber);
    const normalizedScore = normalizeDifficultyScore(score);
    try {
      await onQuestionMetaChange(entry, (current) => {
        const now = new Date().toISOString();
        const normalizedCurrent = normalizeQuestionMeta(current);
        const index = normalizedCurrent.findIndex(
          (meta) => normalizeQuestionNumber(meta.questionNumber) === normalized,
        );
        return index >= 0
          ? normalizedCurrent.map((meta, metaIndex) =>
              metaIndex === index
                ? { ...meta, difficultyScore: normalizedScore, updatedAt: now }
                : meta,
            )
          : [
              ...normalizedCurrent,
              {
                questionNumber: normalized,
                important: false,
                difficultyScore: normalizedScore,
                updatedAt: now,
              },
            ];
      });
      pushToast(
        normalizedScore
          ? `${normalized}번 난이도를 ${normalizedScore}점으로 저장했습니다.`
          : `${normalized}번 난이도 점수를 자동 추정으로 되돌렸습니다.`,
        "success",
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "난이도 점수 저장에 실패했습니다.", "error");
    }
  };

  const toggleQuestionSelected = (questionNumber: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    setSelectedQuestionNumbers((current) =>
      current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized],
    );
  };

  const toggleQuestionAnswerReveal = useCallback((questionNumber: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    setRevealedAnswerNumbers((current) => {
      const next = new Set(current);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  }, []);

  const openSolutionForQuestion = useCallback((questionNumber: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    setDetailViewMode("solution");
    window.setTimeout(() => {
      document.getElementById(`solution-question-${normalized}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }, []);

  const markSelectedImportant = async () => {
    if (!onQuestionMetaChange || selectedQuestionNumbers.length === 0) return;
    try {
      await onQuestionMetaChange(entry, (current) => {
        let next = current;
        for (const questionNumber of selectedQuestionNumbers) {
          const currentImportant = next.some(
            (meta) =>
              normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(questionNumber) &&
              meta.important,
          );
          if (!currentImportant) next = toggleQuestionImportant(next, questionNumber);
        }
        return next;
      });
      pushToast("선택한 문제를 중요 표시했습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "중요 표시 저장에 실패했습니다.", "error");
    }
  };

  const cycleFocusTextSize = (delta: number) => {
    const sizes: FocusTextSize[] = ["normal", "large", "xlarge"];
    setFocusTextSize((current) => {
      const currentIndex = sizes.indexOf(current);
      return sizes[Math.max(0, Math.min(sizes.length - 1, currentIndex + delta))];
    });
  };

  const openFocusMode = useCallback(() => {
    if (isFocusable) {
      setTheaterQuestionIndex(null);
      setSelectedReviewQueue(null);
      setFocusMode("expanded");
    }
  }, [isFocusable]);

  const openTheaterMode = useCallback((index = focusedQuestionIndex) => {
    if (!isSheet || !questionAnchors.length) return;
    setFocusMode("closed");
    setFocusedQuestionIndex(Math.max(0, Math.min(questionAnchors.length - 1, index)));
    setTheaterQuestionIndex(Math.max(0, Math.min(questionAnchors.length - 1, index)));
  }, [focusedQuestionIndex, isSheet, questionAnchors.length]);

  const startSelectedReviewQueue = useCallback(() => {
    if (!isSheet || selectedQuestionNumbers.length === 0 || questionAnchors.length === 0) return;
    const selected = new Set(selectedQuestionNumbers.map(normalizeQuestionNumber));
    const ordered = questionAnchors
      .filter((block) => {
        const id = questionIdentifier(block);
        return id ? selected.has(id) : false;
      })
      .map((block) => questionIdentifier(block))
      .filter((id): id is string => Boolean(id));
    if (!ordered.length) return;
    const firstIndex = questionAnchors.findIndex(
      (block) => questionIdentifier(block) === ordered[0],
    );
    setSelectedReviewQueue({
      entryId: entry.id,
      questionNumbers: ordered,
      currentIndex: 0,
      mode: "selected",
    });
    setSelectionMode(false);
    setSelectedQuestionNumbers([]);
    openTheaterMode(firstIndex >= 0 ? firstIndex : 0);
    pushToast("선택한 문제 복습 큐를 시작합니다.", "success");
  }, [entry.id, isSheet, openTheaterMode, pushToast, questionAnchors, questionIdentifier, selectedQuestionNumbers]);

  useEffect(() => {
    if (!initialQuestionTarget || !isSheet || questionAnchors.length === 0) return;
    if (consumedInitialTargetRef.current === initialQuestionTarget.requestId) return;
    const normalized = normalizeQuestionNumber(initialQuestionTarget.questionNumber);
    const index = questionAnchors.findIndex(
      (block) => questionIdentifier(block) === normalized,
    );
    consumedInitialTargetRef.current = initialQuestionTarget.requestId;
    if (index >= 0) {
      openTheaterMode(index);
      onInitialQuestionTargetConsumed?.(initialQuestionTarget.requestId, "opened");
    } else {
      onInitialQuestionTargetConsumed?.(initialQuestionTarget.requestId, "not-found");
    }
  }, [initialQuestionTarget, isSheet, onInitialQuestionTargetConsumed, openTheaterMode, questionAnchors, questionIdentifier]);

  const closeTheaterMode = useCallback(() => {
    const target = theaterQuestionIndex !== null ? questionAnchors[theaterQuestionIndex] : undefined;
    if (theaterQuestionIndex !== null) setFocusedQuestionIndex(theaterQuestionIndex);
    setTheaterQuestionIndex(null);
    setSelectedReviewQueue(null);
    if (target?.kind === "question") {
      window.setTimeout(() => scrollToQuestion(target.start), 0);
    }
  }, [questionAnchors, scrollToQuestion, theaterQuestionIndex]);

  const executeStudyAction = useCallback((id: NextStudyActionId) => {
    if (id === "review-text") {
      setShowTextReview(true);
      return;
    }
    if (id === "review-missing" || id === "review-rejected-notes") {
      handleStudyModeChange("analysis");
      return;
    }
    if (id === "generate-solution") {
      onQuickGptSolution?.();
      return;
    }
    if (id === "generate-learning" || id === "make-visualization") {
      void handleAutoCreateLecture();
      return;
    }
    if (id === "start-focus") {
      if (isSheet) openTheaterMode(focusedQuestionIndex);
      else openFocusMode();
      return;
    }
    if (id === "show-answer") {
      setHideAnswers(false);
      return;
    }
    if (id === "next-question") {
      moveFocusedQuestion(1);
      return;
    }
    void handleReviewResult("good");
  }, [focusedQuestionIndex, handleAutoCreateLecture, handleReviewResult, handleStudyModeChange, isSheet, moveFocusedQuestion, onQuickGptSolution, openFocusMode, openTheaterMode]);

  const findQuestionTarget = (questionNumber: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    return questionAnchors.find(
      (block) =>
        block.kind === "question" &&
        questionIdentifier(block) === normalized,
    );
  };

  const answerMatchesQuestion = (item: SheetAnswerItem, question: QuestionBlock) => {
    const normalized = normalizeQuestionNumber(item.questionNumber);
    if (normalized === questionIdentifier(question)) return true;
    // Legacy OCR imports can retain a positional label alongside the printed
    // number. Preserve both aliases until they have structured canonical data.
    return !entry.structuredQuestions?.length && (
      normalized === normalizeQuestionNumber(String(question.numberLabel ?? "")) ||
      normalized === normalizeQuestionNumber(String(question.displayNumber ?? ""))
    );
  };

  const focusedAnswer = focusedQuestion
    ? sheetAnswerKey.find((item) => answerMatchesQuestion(item, focusedQuestion))
    : undefined;
  const theaterQuestion = theaterQuestionIndex !== null
    ? questionAnchors[theaterQuestionIndex] as QuestionBlock | undefined
    : undefined;
  const theaterPassage = (() => {
    if (!theaterQuestion) return undefined;
    const currentIndex = questionBlocks.findIndex((block) => block === theaterQuestion);
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const block = questionBlocks[index];
      if (block.kind === "passage" || block.kind === "paragraph") return block;
      if (block.kind === "question") break;
    }
    return undefined;
  })();
  const theaterAnswer = theaterQuestion
    ? sheetAnswerKey.find((item) => answerMatchesQuestion(item, theaterQuestion))
    : undefined;
  const theaterQuestionMeta = theaterQuestion
    ? getQuestionMetaForBlock(entry, theaterQuestion)
    : undefined;
  const isFocusedQuestionShort = focusedQuestion
    ? `${focusedQuestion.body} ${focusedQuestion.choices.map((choice) => choice.text).join(" ")}`.trim().length < 360
    : entry.question.trim().length < 360;
  const focusedFigureImageFilenames = focusedQuestion
    ? (entry.figures ?? [])
      .filter((figure) => {
        const normalized = normalizeQuestionNumber(figure.questionNumber);
        return normalized === questionIdentifier(focusedQuestion);
      })
      .flatMap((figure) => figure.image ? [figure.image] : [])
    : [];
  const focusedImageFilenames = [
    ...focusedFigureImageFilenames,
    ...entry.questionImages,
  ].filter((filename, index, values) => values.indexOf(filename) === index);

  const focusedHasNotes = Boolean(
    entry.memo.trim() ||
      focusedAnswer?.notes?.trim() ||
      focusedAnswer?.importantPoints.length ||
      focusedAnswer?.sourceNote?.trim() ||
      focusedAnswer?.needsReview,
  );
  const hasWrongAnswerText = Boolean(entry.myAnswer.trim() || entry.correctAnswer.trim());
  const wrongAnswerHasNotes = Boolean(entry.memo.trim());
  const canShowActiveStudyPanel =
    activeStudyPanel === "question" ||
    (activeStudyPanel === "answer" && (isSheet ? sheetAnswerKey.length > 0 : hasWrongAnswerText)) ||
    (activeStudyPanel === "explanation" && !isSheet && hasExplanationContent(entry)) ||
    (activeStudyPanel === "notes" && (isSheet ? focusedHasNotes : wrongAnswerHasNotes)) ||
    (activeStudyPanel === "images" && (isSheet ? focusedImageFilenames.length > 0 : entry.questionImages.length > 0));

  const focusedStudyHints = (() => {
    if (!isFocusExpanded || !isFocusedQuestionShort) return [];
    const hints: Array<{ label: string; text: string }> = [];
    if (focusedAnswer?.reviewPoint?.trim()) hints.push({ label: "다음 복습", text: focusedAnswer.reviewPoint.trim() });
    if (focusedAnswer?.wrongPoint?.trim()) hints.push({ label: "오답 포인트", text: focusedAnswer.wrongPoint.trim() });
    if (focusedAnswer?.notes?.trim()) hints.push({ label: "문제 메모", text: focusedAnswer.notes.trim() });
    for (const point of focusedAnswer?.importantPoints ?? []) {
      if (point.trim()) hints.push({ label: "핵심", text: point.trim() });
      if (hints.length >= 4) break;
    }
    if (!hints.length && entry.memo.trim()) {
      hints.push({ label: "최근 메모", text: entry.memo.trim().slice(0, 160) });
    }
    return hints.slice(0, 4);
  })();

  const nextActionHint = hideAnswers
    ? "정답을 먼저 확인하세요."
    : isSheet && focusedQuestionIndex < questionAnchors.length - 1
      ? "다음 문제로 넘어갈 차례입니다."
      : "이 문제를 맞음으로 기록할 수 있습니다.";

  const nextStudyAction = isFocusable
    ? getNextStudyAction(entry, {
      isSheet,
      hasNextQuestion,
      hideAnswers,
      focusModeClosed: focusMode === "closed",
      theaterModeClosed: theaterQuestionIndex === null,
      canGenerateSolution: Boolean(onQuickGptSolution),
      canGenerateLearning: Boolean(onLearningBlocksChange),
      hasSuspiciousText,
    })
    : undefined;

  useEffect(() => {
    if (!isFocusable || focusMode === "closed" || canShowActiveStudyPanel) return;
    setActiveStudyPanel("question");
  }, [canShowActiveStudyPanel, focusMode, isFocusable]);

  useEffect(() => {
    if (!isFocusable) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreStudyShortcut(event)) return;
      const key = event.key.toLowerCase();

      if (event.code === "Space" || key === " ") {
        event.preventDefault();
        setHideAnswers((value) => !value);
        pushToast(hideAnswers ? "정답을 표시했습니다." : "정답을 가렸습니다.", "info");
        return;
      }

      if (key === "arrowleft" || key === "j") {
        if (isSheet) {
          event.preventDefault();
          moveFocusedQuestion(-1);
        }
        return;
      }

      if (key === "arrowright" || key === "k") {
        if (isSheet) {
          event.preventDefault();
          moveFocusedQuestion(1);
        }
        return;
      }

      if (key === "1") {
        event.preventDefault();
        void handleReviewResult("again");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        void handleReviewResult("hard");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        void handleReviewResult("good");
        return;
      }

      if (key === "p") {
        event.preventDefault();
        handleStudyModeChange("paper");
        return;
      }

      if (key === "s") {
        event.preventDefault();
        handleStudyModeChange("solution");
        return;
      }

      if (key === "l") {
        event.preventDefault();
        handleStudyModeChange("learning");
        return;
      }

      if (key === "a") {
        event.preventDefault();
        handleStudyModeChange("analysis");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleReviewResult,
    handleStudyModeChange,
    hideAnswers,
    isFocusable,
    isSheet,
    moveFocusedQuestion,
    pushToast,
    questionAnchors.length,
    reviewSaving,
  ]);

  const renderAnswerKey = () =>
    answerView === "table" ? (
      <div className="sheet-answer-table">
        <div className="sheet-answer-table-head">
          <span>번호</span>
          <span>정답</span>
          <span>난이도</span>
          <span>개념</span>
          <span>풀이</span>
        </div>
        {sheetAnswerKey.map((item) => {
          const target = findQuestionTarget(item.questionNumber);
          return (
            <div key={item.id} className="sheet-answer-table-row">
              <button
                type="button"
                className="sheet-answer-number"
                onClick={() => {
                  if (target?.kind === "question") scrollToQuestion(target.start);
                }}
                disabled={!target}
              >
                {item.questionNumber || "검토"}번
              </button>
              <strong className={hideAnswers ? "answer-hidden" : ""}>
                {hideAnswers ? "•••" : <MathText text={item.answer || "정답 없음"} />}
              </strong>
              <span>{item.difficulty === "high" ? "상" : item.difficulty === "medium" ? "중" : item.difficulty === "low" ? "하" : "-"}</span>
              <span>{item.concepts?.join(", ") || "-"}</span>
              <span className={hideAnswers ? "answer-hidden" : ""}>{hideAnswers ? "가려짐" : item.explanation || "-"}</span>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="sheet-answer-list">
        {sheetAnswerKey.map((item) => {
          const target = findQuestionTarget(item.questionNumber);
          return (
            <article key={item.id} className="sheet-answer-card">
              <div className="sheet-answer-card-head">
                <button
                  type="button"
                  className="sheet-answer-number"
                  onClick={() => {
                    if (target?.kind === "question") scrollToQuestion(target.start);
                  }}
                  disabled={!target}
                >
                  {item.questionNumber || "검토"}번
                </button>
                <strong className={hideAnswers ? "answer-hidden" : ""}>
                  {hideAnswers ? "•••" : <MathText text={item.answer || "정답 없음"} />}
                </strong>
                {item.needsReview && <span className="answer-review-badge">검토 필요</span>}
                {item.difficulty && (
                  <span className={`difficulty-badge difficulty-badge--${item.difficulty}`}>
                    {item.difficulty === "high" ? "상" : item.difficulty === "medium" ? "중" : "하"}
                  </span>
                )}
              </div>
              {item.concepts?.length ? (
                <div className="sheet-answer-concepts">
                  {item.concepts.map((concept) => (
                    <button key={concept} type="button" onClick={() => onWikiLinkClick(concept)}>
                      [[{concept}]]
                    </button>
                  ))}
                </div>
              ) : null}
              {!hideAnswers && item.notes?.trim() && <p className="sheet-answer-source">문제별 메모: {item.notes}</p>}
              {item.sourceNote?.trim() && <p className="sheet-answer-source">{item.sourceNote}</p>}
              {item.explanation.trim() && (
                <div className={`sheet-answer-explanation ${hideAnswers ? "answer-hidden" : ""}`}>
                  {hideAnswers ? (
                    "답 가리기 모드입니다."
                  ) : (
                    <LinkifiedText
                      text={item.explanation}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                      conceptContext={buildConceptLinkContext(entry, item.questionNumber)}
                    />
                  )}
                </div>
              )}
              {!hideAnswers && item.importantPoints.length > 0 && (
                <ul className="sheet-answer-points">
                  {item.importantPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    );

  const renderAnswerToolbar = () => (
    <div className="sheet-answer-toolbar">
      <button
        type="button"
        className={`btn-secondary btn-sm ${hideAnswers ? "active" : ""}`}
        onClick={() => setHideAnswers((value) => !value)}
      >
        {hideAnswers ? "정답 보이기" : "답 가리기"}
      </button>
      <div className="sheet-layout-toggle" aria-label="답안지 보기 방식">
        <button
          type="button"
          className={answerView === "card" ? "active" : ""}
          onClick={() => setAnswerView("card")}
        >
          카드
        </button>
        <button
          type="button"
          className={answerView === "table" ? "active" : ""}
          onClick={() => setAnswerView("table")}
        >
          표
        </button>
      </div>
    </div>
  );

  return (
    <EntryDetailProvider value={{
      entry,
      data: { entry, allEntries, selectedQuestion: resolvedSheetQuestions[focusedQuestionIndex] ?? null, questions: resolvedSheetQuestions },
      actions: { onEdit, onDelete, onToggleMastered, onToggleDifficult: handleToggleDifficultWithToast },
      workspace: { detailViewMode, focusMode, selectionMode },
    }}>
    <div
      className={`detail-panel detail-panel--review detail-panel--sheet-${sheetLayout} detail-panel--focus-${focusMode} detail-panel--focus-text-${focusTextSize} ${isFocusExpanded ? "detail-panel--zoom" : ""} ${memoMode ? "detail-panel--memo" : ""} ${isFocusable ? "detail-panel--study-controls" : ""} ${studyControlCompact ? "detail-panel--control-compact" : ""}`}
    >
      {!isFocusExpanded && (
      <ProblemSheetHeader>
      <div className={`detail-toolbar ${isSheet && detailViewMode === "paper" ? "detail-toolbar--problem-sheet" : ""}`}>
        {isSheet && detailViewMode === "paper" ? (
          <div className="problem-sheet-primary-toolbar" aria-label="문제지 도구 모음">
            <span className="problem-sheet-primary-title">{entry.title.trim() || "제목 없음"}</span>
            <div className="problem-sheet-primary-controls">
              {onStartExam && <button type="button" className="ui-button ui-button--primary" onClick={onStartExam}>{startExamLabel}</button>}
              {onStartRealExam && <button type="button" className="ui-button ui-button--secondary" onClick={onStartRealExam}>{startRealExamLabel}</button>}
              <div className="problem-sheet-display-mode" role="group" aria-label="문제지 표시 방식">
                <button type="button" className={problemSheetDisplayMode === "questions" ? "active" : ""} aria-pressed={problemSheetDisplayMode === "questions"} onClick={() => updateViewPreference("problemSheetDisplayMode", "questions")}>문항별</button>
                <button type="button" className={problemSheetDisplayMode === "exam" ? "active" : ""} aria-pressed={problemSheetDisplayMode === "exam"} onClick={() => updateViewPreference("problemSheetDisplayMode", "exam")}>시험지</button>
              </div>
              <button type="button" className={`btn-icon ${selectionMode ? "active" : ""}`} aria-pressed={selectionMode} onClick={() => setSelectionMode((value) => {
                const next = !value;
                if (!next) {
                  setSelectedQuestionNumbers([]);
                  setShowExportHub(false);
                }
                return next;
              })}>선택</button>
              {sheetSearchOpen ? (
                <div id="problem-sheet-search" className="sheet-search sheet-search--inline">
                  <input
                    ref={sheetSearchInputRef}
                    type="search"
                    value={sheetSearch}
                    onChange={(event) => setSheetSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        moveSearch(event.shiftKey ? -1 : 1);
                      }
                    }}
                    placeholder="시험지 안에서 검색"
                    aria-label="시험지 안에서 검색"
                  />
                  <span aria-live="polite">{sheetSearch.trim() ? `${sheetMatches.length ? activeSearchIndex + 1 : 0}/${sheetMatches.length}` : "검색"}</span>
                  <button type="button" className="btn-icon" onClick={() => moveSearch(-1)} disabled={sheetMatches.length === 0} aria-label="이전 검색 결과" title="이전 검색 결과"><ChevronUp size={16} aria-hidden="true" /></button>
                  <button type="button" className="btn-icon" onClick={() => moveSearch(1)} disabled={sheetMatches.length === 0} aria-label="다음 검색 결과" title="다음 검색 결과"><ChevronDown size={16} aria-hidden="true" /></button>
                  <button type="button" className="btn-icon" onClick={() => {
                    setSheetSearchOpen(false);
                    requestAnimationFrame(() => sheetSearchTriggerRef.current?.focus());
                  }} aria-label="시험지 검색 닫기" title="시험지 검색 닫기"><X size={16} aria-hidden="true" /></button>
                </div>
              ) : (
                <button ref={sheetSearchTriggerRef} type="button" className="btn-icon" aria-label="시험지 검색" title="시험지 검색" aria-expanded={false} aria-controls="problem-sheet-search" onClick={() => setSheetSearchOpen(true)}><Search size={17} aria-hidden="true" /></button>
              )}
              <Menu label="더보기" triggerAriaLabel="문제지 더보기" className="detail-more-menu">
                <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("paper")}>문제로 돌아가기</button>
                <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("solution")}>해설지</button>
                <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("learning")}>특강</button>
                <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("analysis")}>분석</button>
                {isFocusable && <button type="button" className="btn-icon" onClick={openFocusMode}>집중 보기</button>}
                <button type="button" className="btn-icon" onClick={() => openExportHub()}>공유·내보내기</button>
                <button type="button" className="btn-icon" onClick={() => onOpenPrint ? onOpenPrint() : openExportHub("exam-pdf")}>인쇄</button>
                {onQuickGptSolution && <button type="button" className="btn-icon" onClick={onQuickGptSolution}>GPT 해설</button>}
                <button type="button" className="btn-icon" onClick={onEdit}>수정</button>
                <button type="button" className="btn-icon" onClick={() => setQuickViewSettingsRequested(true)}>보기 설정</button>
                {onTitleChange && <button type="button" className="btn-icon" onClick={() => setTitleEditing(true)}>이름 변경</button>}
                <button type="button" className={`btn-icon ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>메모</button>
                <button type="button" className={`btn-icon ${entry.difficult ? "active-difficult" : ""}`} onClick={handleToggleDifficultWithToast}>어려움 표시</button>
                <button type="button" className={`btn-icon ${entry.mastered ? "success" : ""}`} onClick={onToggleMastered}>{entry.mastered ? "완료 해제" : "복습 완료"}</button>
                <button type="button" className="btn-icon danger" onClick={onDelete}>삭제</button>
              </Menu>
              {quickViewSettingsRequested && <QuickViewSettingsMenu
                layout={sheetLayout}
                onLayoutChange={(layout) => updateViewPreference("sheetLayout", layout)}
                fontSize={focusTextSize}
                onFontSizeChange={(size) => updateViewPreference("fontSize", size)}
                hideAnswers={hideAnswers}
                onHideAnswersChange={(hidden) => updateViewPreference("hideAnswers", hidden)}
                onOpenHelp={() => setViewHelpOpen(true)}
                onOpenAllSettings={() => onOpenSettings?.("view")}
              />}
            </div>
          </div>
        ) : (
        <>
        <div className="detail-toolbar-left">
          {!isConcept && !isLecture && (
            <nav className="study-mode-tabs" aria-label="학습 보기 모드" role="tablist">
              {[{ id: "paper", label: "문제지" }, { id: "solution", label: "해설지" }, { id: "learning", label: "특강" }, { id: "analysis", label: "분석" }].map((item) => {
                const selected = detailViewMode === item.id;
                return <button key={item.id} type="button" role="tab" aria-selected={selected} aria-controls="detail-study-panel" tabIndex={selected ? 0 : -1} className={selected ? "active" : ""} onClick={() => handleStudyModeChange(item.id as typeof detailViewMode)}>{item.label}</button>;
              })}
            </nav>
          )}
          {isSheet && !isFocusExpanded && detailViewMode === "paper" && (
            <div className="problem-sheet-display-mode" role="group" aria-label="문제지 표시 방식">
              <button
                type="button"
                className={problemSheetDisplayMode === "questions" ? "active" : ""}
                aria-pressed={problemSheetDisplayMode === "questions"}
                onClick={() => updateViewPreference("problemSheetDisplayMode", "questions")}
              >
                문항별
              </button>
              <button
                type="button"
                className={problemSheetDisplayMode === "exam" ? "active" : ""}
                aria-pressed={problemSheetDisplayMode === "exam"}
                onClick={() => updateViewPreference("problemSheetDisplayMode", "exam")}
              >
                시험지
              </button>
            </div>
          )}
        </div>
        <div className="detail-actions">
          <div className="detail-actions-primary">
            {isFocusable && (
              <button
                type="button"
                className="btn-icon btn-focus-primary"
                onClick={openFocusMode}
                title={isSheet ? "문제 집중 보기" : "오답 집중 보기"}
              >
                집중 보기
              </button>
            )}
            {isSheet && (
              <button type="button" className="btn-icon" onClick={() => openExportHub()}>
                공유·내보내기
              </button>
            )}
            <button type="button" className="btn-icon" onClick={onEdit}>
              수정
            </button>
            <QuickViewSettingsMenu
              layout={isSheet ? sheetLayout : undefined}
              onLayoutChange={isSheet ? ((layout) => updateViewPreference("sheetLayout", layout)) : undefined}
              fontSize={focusTextSize}
              onFontSizeChange={(size) => updateViewPreference("fontSize", size)}
              hideAnswers={(isSheet || entry.entryKind === "wrong_answer") ? hideAnswers : undefined}
              onHideAnswersChange={(isSheet || entry.entryKind === "wrong_answer") ? ((hidden) => updateViewPreference("hideAnswers", hidden)) : undefined}
              onOpenHelp={() => setViewHelpOpen(true)}
              onOpenAllSettings={() => onOpenSettings?.("view")}
            />
          </div>
          <Menu label="더보기" triggerAriaLabel="도구" className="detail-more-menu">
              {!isConcept && !isLecture && (
                <>
                  <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("paper")}>문제로 돌아가기</button>
                  <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("solution")}>해설지</button>
                  <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("learning")}>특강</button>
                  <button type="button" className="btn-icon" onClick={() => handleStudyModeChange("analysis")}>분석</button>
                </>
              )}
              {isFocusable && <button type="button" className="btn-icon" onClick={openFocusMode}>집중 보기</button>}
              {isSheet && <button type="button" className="btn-icon" onClick={() => openExportHub()}>공유·내보내기</button>}
              {onQuickGptSolution && (
                <button type="button" className="btn-icon" onClick={onQuickGptSolution}>
                  GPT 해설
                </button>
              )}
              <button
                type="button"
                className={`btn-icon ${entry.difficult ? "active-difficult" : ""}`}
                onClick={handleToggleDifficultWithToast}
              >
                어려움 표시
              </button>
              {isSheet && onTitleChange && (
                <button type="button" className="btn-icon" onClick={() => setTitleEditing(true)}>
                  이름 변경
                </button>
              )}
              <button
                type="button"
                className={`btn-icon btn-memo ${memoMode ? "active" : ""}`}
                onClick={() => setMemoMode((m) => !m)}
              >
                메모 {memoMode ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                className={`btn-icon ${entry.mastered ? "success" : ""}`}
                onClick={onToggleMastered}
              >
                {entry.mastered ? "완료 해제" : "복습 완료"}
              </button>
              <button type="button" className="btn-icon danger" onClick={onDelete}>
                삭제
              </button>
          </Menu>
        </div>
        </>
        )}
      </div>
      </ProblemSheetHeader>
      )}

      {entry.structuredQuestionsRecovery && (
        <p className="detail-data-warning" role="alert">
          구조화된 문항 데이터 일부를 읽지 못해 기존 문제 본문으로 표시합니다. 수정 화면에서 내용을 확인해 주세요.
        </p>
      )}

      {memoMode && (
        <div className="memo-toolbar">
          <span className="memo-toolbar-label">도구</span>
          <button
            type="button"
            className={`memo-tool ${activeTool === "highlight" ? "active" : ""}`}
            onClick={() => setActiveTool("highlight")}
          >
            🖍 형광펜
          </button>
          <button
            type="button"
            className={`memo-tool ${activeTool === "underline" ? "active" : ""}`}
            onClick={() => setActiveTool("underline")}
          >
            ＿ 밑줄
          </button>
          <button
            type="button"
            className={`memo-tool ${activeTool === "erase" ? "active" : ""}`}
            onClick={() => setActiveTool("erase")}
          >
            ⌫ 지우기
          </button>
          <span className="memo-toolbar-hint">
            텍스트: 드래그 선택 · 이미지: 영역 드래그 · 지우기: 표시 클릭
            {annCount > 0 && ` (${annCount})`}
          </span>
        </div>
      )}

      {isFocusExpanded && isSheet && (
        <div className="focused-sheet-nav" aria-label="문제 집중 보기 이동">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => moveFocusedQuestion(-1)}
            disabled={focusedQuestionIndex === 0}
          >
            이전
          </button>
          <strong>
            문제 {questionIdentifier(focusedQuestion) ?? 0}
            <span>{focusedQuestionIndex + 1} / {questionAnchors.length}</span>
          </strong>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => moveFocusedQuestion(1)}
            disabled={focusedQuestionIndex >= questionAnchors.length - 1}
          >
            다음
          </button>
          <button type="button" className="btn-secondary" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}
      {isFocusExpanded && isWrongAnswer && (
        <div className="focused-sheet-nav focused-sheet-nav--single" aria-label="오답 집중 보기">
          <strong>{entry.title.trim() || "오답 집중 보기"}</strong>
          <button type="button" className="btn-secondary" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}

      <div className="detail-scroll">
        <header className={`detail-title-block ${isSheet && detailViewMode === "paper" && !titleEditing ? "detail-title-block--sheet-compact" : ""}`}>
          {titleEditing ? (
            <div className="detail-title-edit">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleTitleSave();
                  if (event.key === "Escape") {
                    setTitleDraft(entry.title);
                    setTitleEditing(false);
                  }
                }}
                aria-label="시험지 이름"
                autoFocus
              />
              <button type="button" className="btn-secondary" onClick={() => void handleTitleSave()}>
                저장
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setTitleDraft(entry.title);
                  setTitleEditing(false);
                }}
              >
                취소
              </button>
            </div>
          ) : (
            <div className="detail-title-row">
              <h2 className="detail-title">{entry.title.trim() || "(제목 없음)"}</h2>
              {isSheet && onTitleChange && (
                <span className="sheet-group-title-hint">{entry.sheetGroup ? `${entry.sheetGroup.groupTitle} · ${entry.sheetGroup.partTitle}` : ""}</span>
              )}
            </div>
          )}
          <div className="detail-meta-row">
            <span className="subject-badge">{entry.subject}</span>
            {isSheet ? (
              <span className="kind-badge kind-badge--sheet">문제지</span>
            ) : isConcept ? (
              <span className="kind-badge kind-badge--concept">개념</span>
            ) : isLecture ? (
              <span className="kind-badge kind-badge--lecture">특강자료</span>
            ) : (
              <span className="kind-badge kind-badge--wrong">오답</span>
            )}
            {hasSuspiciousText && (
              <button
                type="button"
                className="text-review-badge"
                onClick={() => setShowTextReview(true)}
              >
                텍스트 검수 필요 {suspiciousSegments.length}
              </button>
            )}
            {entry.difficulty && entry.difficulty !== "none" && (
              <span className={`difficulty-badge difficulty-badge--${entry.difficulty}`}>
                난이도: {entry.difficulty === "high" ? "상" : entry.difficulty === "medium" ? "중" : "하"}
              </span>
            )}
            {entry.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
          <span className="detail-date">{formatDate(entry.updatedAt)}</span>
        </header>

        <QuestionWorkspace>
        <section id="detail-study-panel" className="detail-question-section" role="tabpanel" aria-label={`${detailViewMode} 학습 패널`}>
          {!isConcept && !isFocusExpanded && (!isSheet || detailViewMode !== "paper") && (
            <StudyFlowStrip
              entry={entry}
              focusAvailable={isFocusable}
              onModeChange={handleStudyModeChange}
              onStartFocus={openFocusMode}
            />
          )}
          <h3 className="section-heading">
            {isFocusExpanded
              ? isSheet ? "문제 집중 보기" : "오답 집중 보기"
              : isConcept
                ? "개념 설명"
                : isLecture
                  ? "특강자료"
                : detailViewMode === "solution"
                  ? "교재형 해설지"
                  : detailViewMode === "learning"
                    ? "특강 노트"
                  : detailViewMode === "analysis"
                    ? "학습 분석"
                    : isSheet ? "교재형 문제지" : "문제지"}
          </h3>
          {isSheet && !isFocusExpanded && detailViewMode === "paper" && (
            <div className="sheet-reading-tools">
              <div className="sheet-selection-tools">
                {selectionMode && (
                  <span className="sheet-selection-hint">문항을 선택하세요.</span>
                )}
              </div>
              {questionAnchors.length > 0 && (
                <>
                  <button type="button" className="btn-secondary btn-sm" aria-expanded={sheetTocOpen} onClick={() => setSheetTocOpen((value) => !value)}>문항 목록</button>
                  {sheetTocOpen && <nav className="sheet-toc" aria-label="문제 번호 목차">
                    {questionAnchors.map((block, index) => (
                      <button key={block.start} type="button" onClick={() => { setFocusedQuestionIndex(index); scrollToQuestion(block.start); }}>
                        {questionIdentifier(block) ?? block.displayNumber}
                      </button>
                    ))}
                  </nav>}
                </>
              )}
            </div>
          )}
          {(isConcept || isLecture) && onSimilarQuestionLinksChange ? (
            <SimilarQuestionLinksPanel
              sourceEntry={entry}
              links={entry.similarQuestionLinks ?? []}
              items={questionBankItems}
              onOpen={(entryId, questionNumber) => onOpenQuestionTarget?.(entryId, questionNumber)}
              onChange={(links) => onSimilarQuestionLinksChange(entry, links)}
              label="전체 관련 문제"
              aiProviderStatus={aiProviderStatus}
              onOpenAiSettings={() => onOpenSettings?.("gpt-mcp")}
            />
          ) : null}
          {isLecture ? (
            <LectureReaderView
              entry={entry}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              onOpenLinkedEntry={onOpenEntry}
              layout={viewPreferences?.lectureLayout ?? "document"}
              onLayoutChange={(layout) => onViewPreferencesChange?.({ lectureLayout: layout })}
              blockDefaultState={viewPreferences?.lectureBlockDefaultState ?? "first"}
            />
          ) : !isFocusExpanded && !isConcept ? (
            detailViewMode === "solution" ? (
              <div className="solution-learning-layout">
                <div className="solution-learning-main">
                  <SolutionBookView
                    entry={entry}
                    hideAnswers={hideAnswers}
                    onToggleHideAnswers={() => setHideAnswers((value) => !value)}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </div>
                <LearningContentPanel
                  entry={entry}
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                  onGenerateLecture={onQuickGptSolution}
                  onImportLecture={onImportLecture}
                  onAutoCreateLecture={handleAutoCreateLecture}
                  onEditLecture={onEdit}
                />
              </div>
            ) : detailViewMode === "analysis" ? (
              <StudyAnalysisView entry={entry} />
            ) : detailViewMode === "learning" ? (
              <LearningContentPanel
                entry={entry}
                variant="main"
                onWikiLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
                onGenerateLecture={onQuickGptSolution}
                onImportLecture={onImportLecture}
                onAutoCreateLecture={handleAutoCreateLecture}
                onEditLecture={onEdit}
              />
            ) : (
              <>
                <StudyZoomViewport storageKey={getQuestionZoomStorageKey(entry.id, "paper")}>
                  <StudyPaperView
                    entry={entry}
                    memoMode={memoMode}
                    activeTool={activeTool}
                    onAnnotationsChange={onAnnotationsChange}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                    sheetLayout={isSheet ? sheetLayout : "single"}
                    searchQuery={isSheet ? sheetSearch : ""}
                    suspiciousSegments={suspiciousSegments}
                    onOpenQuestionTheater={isSheet ? openTheaterMode : undefined}
                    onToggleQuestionImportant={isSheet ? handleToggleQuestionImportant : undefined}
                    onQuestionDifficultyScoreChange={
                      isSheet ? handleQuestionDifficultyScoreChange : undefined
                    }
                    selectionMode={selectionMode}
                    selectedQuestionNumbers={selectedQuestionNumbers}
                    onToggleQuestionSelected={toggleQuestionSelected}
                    displayMode={isSheet ? problemSheetDisplayMode : "questions"}
                    revealedAnswerNumbers={revealedAnswerNumbers}
                    onToggleAnswerReveal={toggleQuestionAnswerReveal}
                    onOpenQuestionSolution={openSolutionForQuestion}
                  />
                </StudyZoomViewport>
                <CollapsibleSection title="학습 내용" defaultOpen={false}>
                  <LearningContentPanel
                    entry={entry}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                    onGenerateLecture={onQuickGptSolution}
                    onImportLecture={onImportLecture}
                    onAutoCreateLecture={handleAutoCreateLecture}
                    onEditLecture={onEdit}
                  />
                </CollapsibleSection>
              </>
            )
          ) : isSheet && isFocusExpanded ? (
            focusedQuestion ? (
              <>
                <StudyZoomViewport storageKey={getQuestionZoomStorageKey(entry.id, "focus")}>
                  <FocusedQuestionView
                    passage={focusedPassage}
                    questionBlock={focusedQuestion}
                    questionImages={entry.questionImages}
                    figures={entry.figures ?? []}
                    annotations={entry.annotations ?? []}
                    memoMode={memoMode}
                    activeTool={activeTool}
                    onAnnotationsChange={onAnnotationsChange}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                    showImages={activeStudyPanel === "images"}
                    suspiciousSegments={suspiciousSegments}
                  />
                </StudyZoomViewport>
                {isFocusedQuestionShort && (
                  <FocusedStudyHints
                    nextActionHint={nextActionHint}
                    hints={focusedStudyHints}
                  />
                )}
                <div className="focus-panel-tabs" aria-label="집중 보기 패널">
                  <button
                    type="button"
                    className={activeStudyPanel === "question" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("question")}
                  >
                    문제
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "answer" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("answer")}
                    disabled={sheetAnswerKey.length === 0}
                  >
                    답지
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "notes" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("notes")}
                    disabled={!focusedHasNotes}
                  >
                    필기
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "images" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("images")}
                    disabled={focusedImageFilenames.length === 0}
                  >
                    이미지
                  </button>
                </div>
              </>
            ) : (
              <div className="focused-empty-panel">
                표시할 문제를 찾지 못했습니다.
              </div>
            )
          ) : isWrongAnswer && isFocusExpanded ? (
            <>
              <div className="wrong-focus-question">
                <StudyZoomViewport storageKey={getQuestionZoomStorageKey(entry.id, "focus")}>
                  <AnnotatableQuestion
                    question={entry.question}
                    questionImages={activeStudyPanel === "images" ? entry.questionImages : []}
                    annotations={entry.annotations ?? []}
                    memoMode={memoMode}
                    activeTool={activeTool}
                    onAnnotationsChange={onAnnotationsChange}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                    sheetLayout="single"
                    searchQuery=""
                    zoomableImages={activeStudyPanel === "images"}
                    suspiciousSegments={suspiciousSegments}
                  />
                </StudyZoomViewport>
              </div>
              {isFocusedQuestionShort && (
                <FocusedStudyHints
                  nextActionHint={nextActionHint}
                  hints={focusedStudyHints}
                />
              )}
              <div className="focus-panel-tabs" aria-label="오답 집중 보기 패널">
                <button
                  type="button"
                  className={activeStudyPanel === "question" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("question")}
                >
                  문제
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "answer" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("answer")}
                  disabled={!hasWrongAnswerText}
                >
                  정답
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "explanation" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("explanation")}
                  disabled={!hasExplanationContent(entry)}
                >
                  해설
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "notes" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("notes")}
                  disabled={!wrongAnswerHasNotes}
                >
                  메모
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "images" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("images")}
                  disabled={entry.questionImages.length === 0}
                >
                  이미지
                </button>
              </div>
            </>
          ) : (
            <AnnotatableQuestion
              question={entry.question}
              questionImages={entry.questionImages}
              figures={entry.figures ?? []}
              annotations={entry.annotations ?? []}
              memoMode={memoMode}
              activeTool={activeTool}
              onAnnotationsChange={onAnnotationsChange}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              sheetLayout={isSheet && sheetLayout === "columns" ? "columns" : "single"}
              searchQuery={isSheet ? sheetSearch : ""}
              suspiciousSegments={suspiciousSegments}
              sourceEntry={entry}
            />
          )}
        </section>
        </QuestionWorkspace>

        <SecondaryStudyViews>

        {showPaperSupplementSections && <EntryImportAuditSection entry={entry} />}

        {isFocusExpanded && isSheet && activeStudyPanel === "answer" && sheetAnswerKey.length > 0 && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <div className="sheet-study-panel-head">
              <h3 className="section-heading">답지</h3>
              {renderAnswerToolbar()}
            </div>
            <FocusedAnswerPanel
              entry={entry}
              answer={focusedAnswer}
              hideAnswers={hideAnswers}
              existingTargets={existingTargets}
              onWikiLinkClick={onWikiLinkClick}
            />
          </section>
        )}

        {isFocusExpanded && isSheet && activeStudyPanel === "notes" && focusedHasNotes && (
          <section className="sheet-study-panel sheet-study-panel--notes">
            <h3 className="section-heading">필기</h3>
            <FocusedNotesPanel
              entry={entry}
              focusedAnswer={focusedAnswer}
              hasNotes={focusedHasNotes}
              existingTargets={existingTargets}
              onWikiLinkClick={onWikiLinkClick}
            />
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "answer" && hasWrongAnswerText && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <h3 className="section-heading">정답</h3>
            <div className="detail-answers-row">
              {entry.myAnswer.trim() && (
                <div className="answer-card answer-card--wrong">
                  <label>내 답</label>
                  <p>
                    <LinkifiedText
                      text={entry.myAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  </p>
                </div>
              )}
              {entry.correctAnswer.trim() && (
                <div className="answer-card answer-card--correct">
                  <label>정답</label>
                  <p>
                    <LinkifiedText
                      text={entry.correctAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "explanation" && hasExplanationContent(entry) && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <h3 className="section-heading">해설</h3>
            <div className="explanation-parts-detail">
              {filledParts.map(({ part, index }) => (
                <div key={part.id} className="explanation-part-detail">
                  <h4 className="explanation-part-detail-title">해설 {index + 1}</h4>
                  <ContentBlock
                    text={part.text}
                    images={part.images}
                    variant="fill"
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "notes" && wrongAnswerHasNotes && (
          <section className="sheet-study-panel sheet-study-panel--notes">
            <h3 className="section-heading">메모</h3>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </section>
        )}

        {isConcept && (
          <ConceptChecklistSection
            checklist={entry.checklist ?? []}
            newItemText={newChecklistText}
            onNewItemTextChange={setNewChecklistText}
            onChange={updateChecklist}
            createId={uuidv4}
          />
        )}

        {isSheet && showPaperSupplementSections && sheetAnswerKey.length > 0 && (
          <CollapsibleSection
            title="답안지"
            badge={`${sheetAnswerKey.length}개`}
            defaultOpen={false}
          >
            {renderAnswerToolbar()}
            {renderAnswerKey()}
          </CollapsibleSection>
        )}

        {showPaperSupplementSections && !isSheet && !isConcept && (entry.myAnswer || entry.correctAnswer) && (
          <section className="detail-answers-row">
            {entry.myAnswer && (
              <div className="answer-card answer-card--wrong">
                <label>내 답</label>
                <p>
                  <LinkifiedText
                    text={entry.myAnswer}
                    onLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </p>
              </div>
            )}
            {entry.correctAnswer && (
              <div className="answer-card answer-card--correct">
                <label>정답</label>
                <p>
                  <LinkifiedText
                    text={entry.correctAnswer}
                    onLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </p>
              </div>
            )}
          </section>
        )}

        {showPaperSupplementSections && !isConcept && (
          <EntryMistakeAnalysisSection
            entry={entry}
            diagnosisStrategy={diagnosisStrategy}
            hasMistakeAnalysis={hasMistakeAnalysis}
          />
        )}

        {showPaperSupplementSections && hasExplanationContent(entry) && (
          <CollapsibleSection
            title="해설"
            badge={explanationBadge}
            defaultOpen={false}
          >
            <div className="explanation-parts-detail">
              {filledParts.map(({ part, index }) => (
                <div key={part.id} className="explanation-part-detail">
                  <h4 className="explanation-part-detail-title">
                    해설 {index + 1}
                  </h4>
                  <ContentBlock
                    text={part.text}
                    images={part.images}
                    variant="fill"
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {showPaperSupplementSections && entry.memo.trim() && (
          <CollapsibleSection title="텍스트 메모" defaultOpen={false}>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </CollapsibleSection>
        )}

        {isConcept && (
          <ConceptConnectionsSection
            entry={entry}
            allEntries={allEntries}
            relatedEntries={relatedEntries}
            analytics={conceptAnalytics}
            onOpenEntry={onOpenEntry}
          />
        )}
        </SecondaryStudyViews>
      </div>
      <ReviewExportDialogs>
      <EntryDetailReviewDialogs open={showTextReview} entry={entry} segments={suspiciousSegments} onClose={() => setShowTextReview(false)} onQuestionTextChange={onQuestionTextChange} onStructuredQuestionsChange={onStructuredQuestionsChange} onToast={(message) => pushToast(message, "success")} />
      </ReviewExportDialogs>
      {theaterQuestion && theaterQuestionIndex !== null && (
        <QuestionTheaterView
          passage={theaterPassage}
          questionBlock={theaterQuestion}
          questionIndex={
            selectedReviewQueue?.entryId === entry.id
              ? selectedReviewQueue.currentIndex
              : theaterQuestionIndex
          }
          questionCount={
            selectedReviewQueue?.entryId === entry.id
              ? selectedReviewQueue.questionNumbers.length
              : questionAnchors.length
          }
          answer={theaterAnswer}
          questionMeta={theaterQuestionMeta}
          sourceEntry={entry}
          questionImages={entry.questionImages}
          figures={entry.figures ?? []}
          annotations={entry.annotations ?? []}
          memoMode={memoMode}
          activeTool={activeTool}
          hideAnswers={hideAnswers}
          memo={entry.memo}
          onAnnotationsChange={onAnnotationsChange}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          onPrevious={() => moveTheaterQuestion(-1)}
          onNext={() => moveTheaterQuestion(1)}
          onToggleAnswers={() => setHideAnswers((value) => !value)}
          onToggleImportant={() => handleToggleQuestionImportant(questionIdentifier(theaterQuestion) ?? String(theaterQuestion.displayNumber))}
          onDifficultyScoreChange={(score) =>
            void handleQuestionDifficultyScoreChange(questionIdentifier(theaterQuestion) ?? String(theaterQuestion.displayNumber), score)
          }
          onOpenGptExport={() => {
            setSelectedQuestionNumbers([questionIdentifier(theaterQuestion) ?? String(theaterQuestion.displayNumber)]);
            openExportHub("chatgpt-share", "selected", true);
          }}
          onReview={(result) => void handleReviewResult(result, theaterQuestion)}
          reviewSaving={reviewSaving !== null}
          solutionPresentation={viewPreferences?.questionSolutionPresentation ?? "split"}
          onClose={closeTheaterMode}
        />
      )}
      {isSheet && selectionMode && selectedQuestionNumbers.length > 0 && (
        <div className="sheet-selection-action-bar" role="region" aria-label="선택 문항 작업">
          <strong>{selectedQuestionNumbers.length}문제 선택됨</strong>
          <button type="button" className="btn-primary btn-sm" onClick={() => openExportHub("chatgpt-share", "selected", true)}>
            MCP 보내기
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void markSelectedImportant()}>
            중요 표시
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={startSelectedReviewQueue}>
            복습 큐
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedQuestionNumbers([])}>
            선택 해제
          </button>
        </div>
      )}
      {isFocusable && (
        <EntryDetailStudyControls
          isSheet={isSheet}
          isConcept={isConcept}
          questionIndex={focusedQuestionIndex}
          questionCount={questionAnchors.length}
          hideAnswers={hideAnswers}
          detailViewMode={detailViewMode}
          difficult={entry.difficult}
          reviewSaving={reviewSaving}
          nextStudyAction={
            nextStudyAction
              ? {
                label: nextStudyAction.label,
                onExecute: () => executeStudyAction(nextStudyAction.id),
              }
              : undefined
          }
          compact={studyControlCompact}
          showModeControls={focusMode !== "closed"}
          quickMemoOpen={quickMemoOpen}
          quickMemoText={quickMemoText}
          onPrevious={() => moveFocusedQuestion(-1)}
          onNext={() => moveFocusedQuestion(1)}
          onToggleAnswers={() => setHideAnswers((value) => !value)}
          onReview={(result) => void handleReviewResult(
            result,
            isSheet && focusMode !== "closed" ? focusedQuestion : undefined,
          )}
          onToggleDifficult={handleToggleDifficultWithToast}
          onModeChange={handleStudyModeChange}
          onCompactChange={setStudyControlCompact}
          onQuickMemoOpenChange={setQuickMemoOpen}
          onQuickMemoTextChange={setQuickMemoText}
          onQuickMemoSubmit={() => void handleQuickMemoSubmit()}
          onOpenGptExport={isSheet && focusedQuestion ? () => {
            setSelectionMode(true);
            setSelectedQuestionNumbers([questionIdentifier(focusedQuestion) ?? String(focusedQuestion.displayNumber)]);
            openExportHub("chatgpt-share", "selected", true);
          } : undefined}
        />
      )}
      <EntryDetailViewHelpDialog open={viewHelpOpen} onClose={() => setViewHelpOpen(false)} />

      {showExportHub && examPrintPreferences && onExamPrintPreferencesChange && onSyncExportContext && chatGptPreferences && onChatGptPreferencesChange && (
        <ExportHubModal
          entry={entry}
          allEntries={allEntries}
          examSession={examSession}
          currentQuestionNumber={
            theaterQuestion
              ? questionIdentifier(theaterQuestion) ?? String(theaterQuestion.displayNumber)
              : focusedQuestion
                ? questionIdentifier(focusedQuestion) ?? String(focusedQuestion.displayNumber)
                : "1"
          }
          selectedQuestionNumbers={selectedQuestionNumbers}
          examPrintPreferences={examPrintPreferences}
          onExamPrintPreferencesChange={onExamPrintPreferencesChange}
          chatGptPreferences={chatGptPreferences}
          onChatGptPreferencesChange={onChatGptPreferencesChange}
          onSyncExportContext={onSyncExportContext}
          onCheckLocalMcp={onCheckLocalMcp}
          remoteMcpConfigured={remoteMcpConfigured}
          onOpenSettings={() => onOpenChatGptSettings?.()}
          onClose={() => setShowExportHub(false)}
          initialView={exportHubView}
          initialScope={exportHubScope}
          selectionOnly={exportSelectionOnly}
          onToast={(message) => pushToast(message, "success")}
          onPersistQuestionRender={onPersistQuestionRender}
          onUpdateQuestionRenderVerification={onUpdateQuestionRenderVerification}
          onStartSolutionRoundtrip={onApplyGptSolutionRoundtrip && gptSolutionDraftStore?.ready ? async (input) => {
            const now = new Date().toISOString();
            const draft: GptSolutionRoundtripDraft = {
              id: uuidv4(), entryId: entry.id, entryUpdatedAt: entry.updatedAt, purpose: input.purpose,
              requestedQuestionNumbers: input.questionNumbers, questionSnapshot: input.payload,
              status: "shared", createdAt: now, updatedAt: now,
            };
            await gptSolutionDraftStore.upsertDraft(draft);
            setSolutionRoundtrip({ ...input, draftId: draft.id });
            setShowExportHub(false);
          } : undefined}
        />
      )}

      {solutionRoundtrip && onApplyGptSolutionRoundtrip ? (
        <GptSolutionRoundtripModal
          entry={entry}
          purpose={solutionRoundtrip.purpose}
          questionNumbers={solutionRoundtrip.questionNumbers}
          payload={solutionRoundtrip.payload}
          onClose={() => setSolutionRoundtrip(null)}
          onApply={(patch) => {
            const draft = gptSolutionDraftStore?.getDraft(solutionRoundtrip.draftId);
            if (!draft || draft.entryUpdatedAt !== entry.updatedAt) {
              return Promise.reject(new Error("검토 시작 뒤 문제지가 수정되었습니다. 최신 내용으로 다시 요청해 주세요."));
            }
            return onApplyGptSolutionRoundtrip(entry, patch);
          }}
          onImportedResponse={async (raw) => {
            const parsed: unknown = JSON.parse(raw);
            const validation = validateGptSolutionResponse(parsed, {
              entryId: entry.id,
              requestedQuestionNumbers: solutionRoundtrip.questionNumbers,
            });
            if (!validation.valid || !validation.response) throw new Error(validation.errors.join(" "));
            if (!gptSolutionDraftStore) throw new Error("GPT 해설 초안 저장소를 사용할 수 없습니다.");
            await gptSolutionDraftStore.updateDraft(solutionRoundtrip.draftId, (draft) => ({
              ...draft,
              importedResponse: validation.response,
              status: "reviewing" as const,
              updatedAt: new Date().toISOString(),
            }));
          }}
          onApplied={async () => {
            if (!gptSolutionDraftStore) throw new Error("GPT 해설 초안 저장소를 사용할 수 없습니다.");
            await gptSolutionDraftStore.removeDraft(solutionRoundtrip.draftId);
          }}
        />
      ) : null}

      {toasts.length > 0 && (
        <div className="study-toast-stack" aria-live="polite">
          {toasts.map((toast) => <Toast key={toast.id} tone={toast.tone}>{toast.message}</Toast>)}
        </div>
      )}
      {isFocusExpanded && (
        <div className="focus-floating-controls" aria-label="집중 보기 빠른 조작">
          <button type="button" onClick={() => setFocusMode("mini")}>
            축소
          </button>
          <button
            type="button"
            onClick={() => cycleFocusTextSize(-1)}
            disabled={focusTextSize === "normal"}
          >
            글자 -
          </button>
          <button
            type="button"
            onClick={() => cycleFocusTextSize(1)}
            disabled={focusTextSize === "xlarge"}
          >
            글자 +
          </button>
          <button type="button" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}
      {isFocusMini && (isSheet ? focusedQuestion : isWrongAnswer) && (
        <aside className="focus-mini-player" aria-label="축소된 문제 집중 보기">
          <button type="button" className="focus-mini-main" onClick={() => setFocusMode("expanded")}>
            <strong>{isSheet && focusedQuestion ? `문제 ${questionIdentifier(focusedQuestion) ?? focusedQuestion.displayNumber}` : entry.title || "오답 집중 보기"}</strong>
            <span>{isSheet && focusedQuestion ? focusedQuestion.body.trim() || entry.title || "현재 문제" : entry.question.trim() || "현재 오답"}</span>
          </button>
          <div className="focus-mini-actions">
            <button type="button" onClick={() => setFocusMode("expanded")}>
              확대
            </button>
            {isSheet && (
              <button
                type="button"
                onClick={() => moveFocusedQuestion(1)}
                disabled={focusedQuestionIndex >= questionAnchors.length - 1}
              >
                다음
              </button>
            )}
            <button type="button" onClick={() => setFocusMode("closed")}>
              닫기
            </button>
          </div>
        </aside>
      )}
    </div>
    </EntryDetailProvider>
  );
}
