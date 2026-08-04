import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Annotation, AnnotationTool, ChatGptMcpPreferences, ChecklistItem, ExamPrintPreferences, ExamSession, ExportScopeMode, QuestionMeta, ReviewResult, SheetAnswerItem, ViewPreferences, WrongAnswerEntry } from "../types";
import type { ExportHubView } from "../features/export/types";
import type { SettingsTab } from "./SettingsModal";
import { hasExplanationContent } from "../utils/entry";
import { getRelatedEntries } from "../utils/concepts";
import { buildConceptAnalytics } from "../utils/conceptAnalytics";
import { buildLearningBlocksFromEntry } from "../utils/learningContent";
import {
  recommendedStrategyForAnalysis,
} from "../utils/mistakeAnalysis";
import { getNextStudyAction, type NextStudyActionId } from "../utils/nextStudyAction";
import { normalizeDifficultyScore } from "../utils/difficulty";
import { parseQuestionText, type QuestionBlock } from "../utils/textLayout";
import { detectSuspiciousTextSegments } from "../utils/suspiciousText";
import {
  getQuestionMetaForBlock,
  normalizeQuestionMeta,
  normalizeQuestionNumber,
  applyQuestionReviewResult,
  toggleQuestionImportant,
} from "../utils/questionMeta";
import AnnotatableQuestion, { FocusedQuestionView } from "./AnnotatableQuestion";
import CollapsibleSection from "./CollapsibleSection";
import ContentBlock from "./ContentBlock";
import { LinkifiedText } from "../utils/wikiLinks";
import LearningContentPanel from "./LearningContentPanel";
import MathText from "./MathText";
import SolutionBookView from "./SolutionBookView";
import StudyAnalysisView from "./StudyAnalysisView";
import StudyControlBar from "./StudyControlBar";
import StudyPaperView from "./StudyPaperView";
import StudyFlowStrip from "./StudyFlowStrip";
import StudyZoomViewport, { getQuestionZoomStorageKey } from "./StudyZoomViewport";
import TextReviewPanel from "./TextReviewPanel";
import QuestionTheaterView from "./QuestionTheaterView";
import LectureReaderView from "./LectureReaderView";
import ExportHubModal from "../features/export/components/ExportHubModal";
import QuickViewSettingsMenu from "./QuickViewSettingsMenu";
import Dialog from "../shared/ui/Dialog";
import { writeUiStorageValue } from "../services/uiStorage";
import Toast from "../shared/ui/Toast";
import Menu from "../shared/ui/Menu";
import SimilarQuestionLinksPanel from "../features/question-bank/components/SimilarQuestionLinksPanel";
import type { QuestionBankItem } from "../features/question-bank/model/questionBankTypes";
import {
  ConceptChecklistSection,
  ConceptConnectionsSection,
  EntryImportAuditSection,
  EntryMistakeAnalysisSection,
} from "./EntryDetailSections";

interface EntryDetailProps {
  entry: WrongAnswerEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMastered: () => void;
  onToggleDifficult: () => void;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onChecklistChange?: (checklist: ChecklistItem[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  allEntries?: WrongAnswerEntry[];
  onOpenEntry?: (entryId: string) => void;
  onOpenQuestionTarget?: (entryId: string, questionNumber: string) => void;
  onQuickGptSolution?: () => void;
  onExportMarkdown?: () => void;
  onOpenPrint?: () => void;
  examSession?: ExamSession | null;
  examPrintPreferences?: ExamPrintPreferences;
  onExamPrintPreferencesChange?: (patch: Partial<ExamPrintPreferences>) => Promise<void> | void;
  onSyncExportContext?: (payload: {
    scope: ExportScopeMode;
    questionNumbers: string[];
    submitted: boolean;
    shareOptions: Pick<
      ChatGptMcpPreferences,
      "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages"
    >;
  }) => Promise<void>;
  onReview?: (entry: WrongAnswerEntry, result: ReviewResult) => Promise<void>;
  onQuickMemo?: (entry: WrongAnswerEntry, text: string) => Promise<void>;
  onLearningBlocksChange?: (entry: WrongAnswerEntry, blocks: WrongAnswerEntry["learningBlocks"]) => Promise<void>;
  onImportLecture?: () => void;
  onQuestionTextChange?: (entry: WrongAnswerEntry, text: string) => Promise<void>;
  onTitleChange?: (entry: WrongAnswerEntry, title: string) => Promise<void>;
  onQuestionMetaChange?: (
    entry: WrongAnswerEntry,
    questionMeta: QuestionMeta[] | ((current: QuestionMeta[]) => QuestionMeta[]),
  ) => Promise<void>;
  onActiveContextChange?: (context: {
    entryId: string;
    questionNumber: string | null;
    source: "detail" | "focused" | "theater";
  }) => void;
  initialQuestionTarget?: { questionNumber: string; requestId: number } | null;
  onInitialQuestionTargetConsumed?: (
    requestId: number,
    result: "opened" | "not-found",
  ) => void;
  viewPreferences?: ViewPreferences;
  onViewPreferencesChange?: (patch: Partial<ViewPreferences>) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
  chatGptPreferences?: ChatGptMcpPreferences;
  onChatGptPreferencesChange?: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncChatGptContext?: (context: { entryId: string; questionNumber: string | null }) => Promise<void>;
  onOpenChatGptSettings?: () => void;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
  questionBankItems?: QuestionBankItem[];
  onSimilarQuestionLinksChange?: (entry: WrongAnswerEntry, links: WrongAnswerEntry["similarQuestionLinks"]) => Promise<void>;
}

type SheetLayout = "single" | "columns";
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
  examSession,
  examPrintPreferences,
  onExamPrintPreferencesChange,
  onSyncExportContext,
  onReview,
  onQuickMemo,
  onLearningBlocksChange,
  onImportLecture,
  onQuestionTextChange,
  onTitleChange,
  onQuestionMetaChange,
  onActiveContextChange,
  initialQuestionTarget,
  onInitialQuestionTargetConsumed,
  viewPreferences,
  onViewPreferencesChange,
  onOpenSettings,
  chatGptPreferences,
  onChatGptPreferencesChange,
  onOpenChatGptSettings,
  onCheckLocalMcp,
  remoteMcpConfigured,
  questionBankItems = [],
  onSimilarQuestionLinksChange,
}: EntryDetailProps) {
  const [focusMode, setFocusMode] = useState<FocusMode>("closed");
  const [focusTextSize, setFocusTextSize] = useState<FocusTextSize>(viewPreferences?.fontSize ?? loadFocusTextSize);
  const [activeStudyPanel, setActiveStudyPanel] = useState<StudyPanel>(loadFocusPanel);
  const [memoMode, setMemoMode] = useState(false);
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>(viewPreferences?.sheetLayout ?? loadSheetLayout);
  const [sheetSearch, setSheetSearch] = useState("");
  const [answerView, setAnswerView] = useState<AnswerViewMode>(loadAnswerView);
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>("paper");
  const [hideAnswers, setHideAnswers] = useState(viewPreferences?.hideAnswers ?? loadAnswerHidden);
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

  const updateViewPreference = useCallback(<K extends keyof ViewPreferences>(key: K, value: ViewPreferences[K]) => {
    if (key === "sheetLayout") setSheetLayout(value as SheetLayout);
    if (key === "fontSize") setFocusTextSize(value as FocusTextSize);
    if (key === "hideAnswers") setHideAnswers(Boolean(value));
    if (key === "compactToolbar") setStudyControlCompact(Boolean(value));
    onViewPreferencesChange?.({ [key]: value } as Partial<ViewPreferences>);
  }, [onViewPreferencesChange]);

  useEffect(() => {
    if (!viewPreferences) return;
    setSheetLayout(viewPreferences.sheetLayout);
    setFocusTextSize(viewPreferences.fontSize);
    setHideAnswers(viewPreferences.hideAnswers);
    setStudyControlCompact(viewPreferences.compactToolbar);
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
  const questionBlocks = useMemo(() => parseQuestionText(entry.question), [entry.question]);
  const questionAnchors = useMemo(
    () => questionBlocks.filter((block) => block.kind === "question"),
    [questionBlocks],
  );
  const focusedQuestion = questionAnchors[focusedQuestionIndex] as QuestionBlock | undefined;
  const questionIdentifier = (question?: QuestionBlock) =>
    question?.numberLabel ? String(question.numberLabel) : question?.displayNumber ? String(question.displayNumber) : null;
  useEffect(() => {
    const theaterQuestion = theaterQuestionIndex === null ? undefined : questionAnchors[theaterQuestionIndex] as QuestionBlock | undefined;
    const focused = focusMode === "closed" ? undefined : focusedQuestion;
    onActiveContextChange?.({
      entryId: entry.id,
      questionNumber: questionIdentifier(theaterQuestion) ?? questionIdentifier(focused),
      source: theaterQuestion ? "theater" : focused ? "focused" : "detail",
    });
  }, [entry.id, focusMode, focusedQuestion, onActiveContextChange, questionAnchors, theaterQuestionIndex]);
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
    return questionBlocks.filter(
      (block) =>
        block.kind === "question" &&
        `${block.displayNumber} ${block.numberLabel} ${block.body} ${block.choices.map((choice) => choice.text).join(" ")}`
          .toLowerCase()
          .includes(q),
    );
  }, [questionBlocks, sheetSearch]);
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
    setFocusedQuestionIndex(0);
    setFocusMode("closed");
    setTheaterQuestionIndex(null);
    setShowTextReview(false);
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

  const updateChecklist = (next: ChecklistItem[]) => {
    onChecklistChange?.(next);
  };

  const pushToast = useCallback((message: string, tone: "success" | "error" | "info" = "info") => {
    const id = uuidv4();
    setToasts((items) => [...items, { id, message, tone }].slice(-3));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 2400);
  }, []);

  const openExportHub = useCallback((view: ExportHubView = "home", scope?: ExportScopeMode) => {
    setExportHubView(view);
    setExportHubScope(scope ?? (selectedQuestionNumbers.length > 0 ? "selected" : "current"));
    setShowExportHub(true);
  }, [selectedQuestionNumbers.length]);

  const moveTheaterQuestion = useCallback((delta: number) => {
    if (selectedReviewQueue && selectedReviewQueue.entryId === entry.id) {
      const nextQueueIndex = Math.max(
        0,
        Math.min(selectedReviewQueue.questionNumbers.length - 1, selectedReviewQueue.currentIndex + delta),
      );
      const nextQuestionNumber = selectedReviewQueue.questionNumbers[nextQueueIndex];
      const nextQuestionIndex = questionAnchors.findIndex(
        (block) => normalizeQuestionNumber(block.displayNumber) === normalizeQuestionNumber(nextQuestionNumber),
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
  }, [entry.id, questionAnchors, selectedReviewQueue]);

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
            (meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(currentSheetQuestion.displayNumber),
          );
          return applyQuestionReviewResult(
            current,
            currentSheetQuestion.displayNumber,
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
            (block) => normalizeQuestionNumber(block.displayNumber) === normalizeQuestionNumber(nextQuestionNumber),
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
  }, [entry, focusMode, focusedQuestion, isSheet, onQuestionMetaChange, onReview, pushToast, questionAnchors, reviewSaving, selectedReviewQueue, theaterQuestionIndex]);

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

  const handleToggleDifficultWithToast = () => {
    onToggleDifficult();
    pushToast(entry.difficult ? "어려움 표시를 해제했습니다." : "어려움으로 표시했습니다.", "success");
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
      .filter((block) => selected.has(normalizeQuestionNumber(block.displayNumber)))
      .map((block) => normalizeQuestionNumber(block.displayNumber));
    if (!ordered.length) return;
    const firstIndex = questionAnchors.findIndex(
      (block) => normalizeQuestionNumber(block.displayNumber) === ordered[0],
    );
    setSelectedReviewQueue({
      entryId: entry.id,
      questionNumbers: ordered,
      currentIndex: 0,
      mode: "selected",
    });
    setSelectionMode(false);
    openTheaterMode(firstIndex >= 0 ? firstIndex : 0);
    pushToast("선택한 문제 복습 큐를 시작합니다.", "success");
  }, [entry.id, isSheet, openTheaterMode, pushToast, questionAnchors, selectedQuestionNumbers]);

  useEffect(() => {
    if (!initialQuestionTarget || !isSheet || questionAnchors.length === 0) return;
    if (consumedInitialTargetRef.current === initialQuestionTarget.requestId) return;
    const normalized = normalizeQuestionNumber(initialQuestionTarget.questionNumber);
    const index = questionAnchors.findIndex(
      (block) =>
        normalizeQuestionNumber(block.displayNumber) === normalized ||
        normalizeQuestionNumber(block.numberLabel) === normalized,
    );
    consumedInitialTargetRef.current = initialQuestionTarget.requestId;
    if (index >= 0) {
      openTheaterMode(index);
      onInitialQuestionTargetConsumed?.(initialQuestionTarget.requestId, "opened");
    } else {
      onInitialQuestionTargetConsumed?.(initialQuestionTarget.requestId, "not-found");
    }
  }, [initialQuestionTarget, isSheet, onInitialQuestionTargetConsumed, openTheaterMode, questionAnchors]);

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
        (normalizeQuestionNumber(block.numberLabel) === normalized ||
          String(block.displayNumber) === normalized),
    );
  };

  const answerMatchesQuestion = (item: SheetAnswerItem, question: QuestionBlock) => {
    const normalized = normalizeQuestionNumber(item.questionNumber);
    return (
      normalized === String(question.displayNumber) ||
      normalized === normalizeQuestionNumber(question.numberLabel)
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
        return (
          normalized === String(focusedQuestion.displayNumber) ||
          normalized === normalizeQuestionNumber(focusedQuestion.numberLabel)
        );
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

  const renderFocusedAnswer = () => {
    if (!focusedAnswer) {
      return <div className="focused-empty-panel">현재 문제에 연결된 답안이 없습니다.</div>;
    }

    return (
      <article className="focused-answer-card">
        <header>
          <span className="focused-section-label">답지</span>
          <strong className={hideAnswers ? "answer-hidden" : ""}>
            {hideAnswers ? "•••" : <MathText text={focusedAnswer.answer || "정답 없음"} />}
          </strong>
          {focusedAnswer.needsReview && <span className="answer-review-badge">검토 필요</span>}
        </header>
        {focusedAnswer.sourceNote?.trim() && (
          <p className="sheet-answer-source">{focusedAnswer.sourceNote}</p>
        )}
        {!hideAnswers && focusedAnswer.notes?.trim() && (
          <p className="sheet-answer-source">문제별 메모: {focusedAnswer.notes}</p>
        )}
        {focusedAnswer.explanation.trim() && (
          <div className={`focused-answer-explanation ${hideAnswers ? "answer-hidden" : ""}`}>
            {hideAnswers ? (
              "답 가리기 모드입니다."
            ) : (
              <LinkifiedText
                text={focusedAnswer.explanation}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            )}
          </div>
        )}
        {!hideAnswers && focusedAnswer.importantPoints.length > 0 && (
          <ul className="sheet-answer-points">
            {focusedAnswer.importantPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
      </article>
    );
  };

  const renderFocusStudyHints = () => {
    if (!isFocusExpanded || !isFocusedQuestionShort) return null;
    return (
      <aside className="focus-study-hints" aria-label="집중 보기 학습 힌트">
        <header>
          <span>다음 행동</span>
          <strong>{nextActionHint}</strong>
        </header>
        {focusedStudyHints.length > 0 ? (
          <div className="focus-study-hint-list">
            {focusedStudyHints.map((hint) => (
              <p key={`${hint.label}-${hint.text}`}>
                <span>{hint.label}</span>
                <MathText text={hint.text} />
              </p>
            ))}
          </div>
        ) : (
          <p className="focus-study-hint-empty">짧은 문제는 정답 확인 후 바로 복습 결과를 남겨도 좋습니다.</p>
        )}
      </aside>
    );
  };

  const renderFocusedNotes = () => {
    if (!focusedHasNotes) {
      return <div className="focused-empty-panel">현재 문제에 표시할 필기가 없습니다.</div>;
    }

    return (
      <div className="focused-notes-panel">
        {entry.memo.trim() && (
          <section className="sheet-study-note-card sheet-study-note-card--global">
            <strong>전체 메모</strong>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </section>
        )}
        {focusedAnswer && (
          <article className="sheet-study-note-card">
            <strong>현재 문제 메모 {focusedAnswer.questionNumber ? `(${focusedAnswer.questionNumber}번)` : ""}</strong>
            {focusedAnswer.needsReview && <span className="answer-review-badge">번호 확인 필요</span>}
            {focusedAnswer.notes?.trim() && <p>{focusedAnswer.notes}</p>}
            {focusedAnswer.sourceNote?.trim() && <p>{focusedAnswer.sourceNote}</p>}
            {focusedAnswer.importantPoints.length > 0 && (
              <ul>
                {focusedAnswer.importantPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </article>
        )}
      </div>
    );
  };

  return (
    <div
      className={`detail-panel detail-panel--review detail-panel--sheet-${sheetLayout} detail-panel--focus-${focusMode} detail-panel--focus-text-${focusTextSize} ${isFocusExpanded ? "detail-panel--zoom" : ""} ${memoMode ? "detail-panel--memo" : ""} ${isFocusable ? "detail-panel--study-controls" : ""} ${studyControlCompact ? "detail-panel--control-compact" : ""}`}
    >
      {!isFocusExpanded && (
      <div className="detail-toolbar">
        <div className="detail-toolbar-left">
          {!isConcept && !isLecture && (
            <nav className="study-mode-tabs" aria-label="학습 보기 모드" role="tablist">
              {[{ id: "paper", label: "문제지" }, { id: "solution", label: "해설지" }, { id: "learning", label: "특강" }, { id: "analysis", label: "분석" }].map((item) => {
                const selected = detailViewMode === item.id;
                return <button key={item.id} type="button" role="tab" aria-selected={selected} aria-controls="detail-study-panel" tabIndex={selected ? 0 : -1} className={selected ? "active" : ""} onClick={() => handleStudyModeChange(item.id as typeof detailViewMode)}>{item.label}</button>;
              })}
            </nav>
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
          <Menu label="도구" className="detail-more-menu">
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
      </div>
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
            문제 {focusedQuestion ? focusedQuestion.displayNumber : 0}
            <span> / {questionAnchors.length}</span>
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
        <header className="detail-title-block">
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

        <section id="detail-study-panel" className="detail-question-section" role="tabpanel" aria-label={`${detailViewMode} 학습 패널`}>
          {!isConcept && !isFocusExpanded && (
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
                <button
                  type="button"
                  className={`btn-secondary btn-sm ${selectionMode ? "active" : ""}`}
                  onClick={() => setSelectionMode((value) => !value)}
                >
                  문제 선택
                </button>
                {selectionMode && (
                  <>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => openExportHub("chatgpt-share", "selected")} disabled={selectedQuestionNumbers.length === 0}>
                      GPT에게 보내기
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={markSelectedImportant} disabled={selectedQuestionNumbers.length === 0}>
                      중요 표시
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={startSelectedReviewQueue} disabled={selectedQuestionNumbers.length === 0}>
                      복습 큐 만들기
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedQuestionNumbers([])}>
                      선택 해제
                    </button>
                  </>
                )}
              </div>
              {questionAnchors.length > 0 && (
                <nav className="sheet-toc" aria-label="문제 번호 목차">
                  {questionAnchors.map((block, index) => (
                    <button
                      key={block.start}
                      type="button"
                      onClick={() => {
                        setFocusedQuestionIndex(index);
                        scrollToQuestion(block.start);
                      }}
                    >
                      {block.displayNumber}
                    </button>
                  ))}
                </nav>
              )}
              <div className="sheet-search">
                <input
                  type="search"
                  value={sheetSearch}
                  onChange={(event) => setSheetSearch(event.target.value)}
                  placeholder="시험지 안에서 검색"
                />
                <span>
                  {sheetSearch.trim() ? `${sheetMatches.length}개` : "검색"}
                </span>
                <button type="button" onClick={() => moveSearch(-1)} disabled={sheetMatches.length === 0}>
                  이전
                </button>
                <button type="button" onClick={() => moveSearch(1)} disabled={sheetMatches.length === 0}>
                  다음
                </button>
              </div>
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
                {renderFocusStudyHints()}
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
              {renderFocusStudyHints()}
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
              sheetLayout={isSheet ? sheetLayout : "single"}
              searchQuery={isSheet ? sheetSearch : ""}
              suspiciousSegments={suspiciousSegments}
              sourceEntry={entry}
            />
          )}
        </section>

        {showPaperSupplementSections && <EntryImportAuditSection entry={entry} />}

        {isFocusExpanded && isSheet && activeStudyPanel === "answer" && sheetAnswerKey.length > 0 && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <div className="sheet-study-panel-head">
              <h3 className="section-heading">답지</h3>
              {renderAnswerToolbar()}
            </div>
            {renderFocusedAnswer()}
          </section>
        )}

        {isFocusExpanded && isSheet && activeStudyPanel === "notes" && focusedHasNotes && (
          <section className="sheet-study-panel sheet-study-panel--notes">
            <h3 className="section-heading">필기</h3>
            {renderFocusedNotes()}
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
      </div>
      {showTextReview && (
        <TextReviewPanel
          entry={entry}
          segments={suspiciousSegments}
          onClose={() => setShowTextReview(false)}
          onSave={async (text) => {
            if (!onQuestionTextChange) return;
            await onQuestionTextChange(entry, text);
            pushToast("검수한 문제 텍스트를 저장했습니다.", "success");
          }}
        />
      )}
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
            openExportHub("chatgpt-share", "selected");
          }}
          onReview={(result) => void handleReviewResult(result, theaterQuestion)}
          reviewSaving={reviewSaving !== null}
          onClose={closeTheaterMode}
        />
      )}
      {isFocusable && (
        <StudyControlBar
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
          onOpenGptExport={isSheet ? () => openExportHub("chatgpt-share", "current") : undefined}
        />
      )}
      <Dialog open={viewHelpOpen} onClose={() => setViewHelpOpen(false)} className="exam-dialog" ariaLabel="보기 도움말">
            <header>
              <h3>보기 도움말</h3>
              <button type="button" className="btn-icon" onClick={() => setViewHelpOpen(false)}>닫기</button>
            </header>
            <ul>
              <li>빠른 보기 설정은 현재 화면의 배치, 글자 크기, 정답 가리기를 바로 바꾼니다.</li>
              <li>전체 설정에서는 보기, 시험, 이미지, GPT·MCP 기본값을 함께 관리합니다.</li>
              <li>개념노트와 특강자료에는 정답 가리기가 표시되지 않습니다.</li>
            </ul>
      </Dialog>

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
          onToast={(message) => pushToast(message, "success")}
        />
      )}

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
            <strong>{isSheet && focusedQuestion ? `문제 ${focusedQuestion.displayNumber}` : entry.title || "오답 집중 보기"}</strong>
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
  );
}
