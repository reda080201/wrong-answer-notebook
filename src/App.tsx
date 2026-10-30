import { entryAiMaterials } from "./features/study-ai/model";
import { hydrateSessionSourceReferences } from "./features/exam-builder/services/questionSource";
import StudyAiChat from "./features/study-ai/StudyAiChat";
import { SourceNavigationContext } from "./features/exam-builder/components/sourceNavigationContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealExamProtection, assertRealExamSourcesAllowed } from "./features/exam/services/realExamProtection";
import { useSavedRealExamProtection } from "./hooks/useSavedRealExamProtection";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar, { type SidebarDestination } from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./features/entries/components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import ExamSessionOverlay from "./components/ExamSessionOverlay";
import { deferDialog } from "./shared/ui/deferDialog";
import { createPreUpdateBackup, deleteImage, saveImageFiles } from "./api";
import { clearMcpSharedContexts, syncMcpBridgeActiveExamContext, syncMcpBridgeExportContext } from "./api";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import type { ChatGptMcpPreferences, EntryKind, LearningBlock, McpExportContext } from "./types";
import type { SettingsTab } from "./components/SettingsModal";
import { entryKindIcon, entryKindWithParticle } from "./utils/appUi";
import { collectAllImageReferences } from "./utils/entry";
import GeneratedExamsDialog from "./features/exam-builder/components/GeneratedExamsDialog";
import { useAppUpdater } from "./features/updater/hooks/useAppUpdater";
import { useAppDialog } from "./shared/ui/AppDialogProvider";
import { GITHUB_RELEASES_URL } from "./features/updater/services/appUpdater";
import ErrorNotice from "./shared/ui/ErrorNotice";
import Dialog from "./shared/ui/Dialog";
import { useAppMaintenance } from "./hooks/useAppMaintenance";
import { useExamWorkspaceController } from "./hooks/useExamWorkspaceController";
import { useAppNavigationController } from "./hooks/useAppNavigationController";
import { usePersistenceCoordinator } from "./hooks/usePersistenceCoordinator";
import LearningCandidateReviewModal from "./features/learning/components/LearningCandidateReviewModal";
import { buildQuestionBankItems } from "./features/question-bank/utils/buildQuestionBankItems";
import { projectLearningBlocks } from "./features/learning/utils/learningHub";
import ConceptLinkProvider from "./features/learning/components/ConceptLinkProvider";
import NotebookKnowledgeWorkspace from "./components/NotebookKnowledgeWorkspace";
import LibraryExplorer from "./features/library/components/LibraryExplorer";
import { useLibraryFolders } from "./features/library/hooks/useLibraryFolders";
import { useGptSolutionRoundtripDrafts } from "./hooks/useGptSolutionRoundtripDrafts";
import { useAppWriteRegistrations } from "./hooks/useAppWriteRegistrations";
import { SettingsProvider, useSettingsContext } from "./contexts/SettingsContext";
import { normalizeQuestionNumber } from "./utils/questionMeta";
import { confirmAssessmentAnswer } from "./utils/studyAssessment";
import type { GeneratedExam } from "./types";
import { getEntryQuestions, renderStructuredQuestionsCompatibilityText } from "./utils/entryQuestions";
import { presentSessionSharedPassages, presentWrongAnswerSharedPassage } from "./utils/sharedPassageRecovery";
import { useUiShellPreferences } from "./hooks/useUiShellPreferences";
import { useAppModalController } from "./hooks/useAppModalController";
import { getRemainingExamSeconds } from "./features/exam/services/realExam";
import { getStorageBackendKind } from "./services/storageBackend";
import { useLibraryFolderActions } from "./features/library/hooks/useLibraryFolderActions";
import { useReviewSessions } from "./hooks/useReviewSessions";
import { canResumeReviewSession } from "./features/review/storage/reviewSessionIdentity";
import { useNavigationHistory } from "./hooks/useNavigationHistory";
import { usePendingDeletionCoordinator } from "./hooks/usePendingDeletionCoordinator";
import Snackbar from "./shared/ui/Snackbar";
import { prefersCompactExamLayout } from "./features/exam/services/examLayout";
import OnboardingTour from "./shared/ui/OnboardingTour";
import CommandPalette, { type AppCommand } from "./shared/ui/CommandPalette";
import { NotificationProvider, NotificationRegion } from "./shared/ui/NotificationProvider";
import { useKnowledgeGraph } from "./hooks/useKnowledgeGraph";
import { canReconcileKnowledgeGraph } from "./utils/knowledgeGraphReconciliationGate";

const SettingsModal = deferDialog(() => import("./components/SettingsModal"), "설정");
const ExamBuilderWizard = deferDialog(() => import("./features/exam-builder/components/ExamBuilderWizard"), "문제 모음 구성");

export function appendUniqueLearningBlocks(existingBlocks: LearningBlock[], newBlocks: LearningBlock[]): LearningBlock[] {
  return [...existingBlocks, ...newBlocks.filter((block) => !existingBlocks.some((existing) => (
    normalizeQuestionNumber(existing.sourceQuestionNumber) === normalizeQuestionNumber(block.sourceQuestionNumber)
      && existing.type === block.type
      && existing.title.trim().toLocaleLowerCase("ko-KR") === block.title.trim().toLocaleLowerCase("ko-KR")
  )))];
}

function AppContent() {
  const storageBackendKind = getStorageBackendKind();
  const knowledgeGraph = useKnowledgeGraph();
  const { confirm, prompt } = useAppDialog();
  const {
    entries,
    loading,
    initialLoadStatus: entriesInitialLoadStatus,
    error,
    clearError,
    refresh,
    addEntry,
    addEntries,
    cancelUncommittedImport,
    commitExamSubmission,
    addEntriesWithImportAssetSession,
    updateEntry,
    deleteEntry,
    deleteEntryWithUndo,
    restorePendingDeletion,
    toggleMastered,
    toggleDifficult,
    patchEntry,
    patchEntryWithImportAssetSession,
    flushEntries,
    setEntriesMaintenanceBlocked,
  } = useEntries();
  const settingsCtx = useSettingsContext();
  const {
    settings,
    patchSettings,
    refreshSettings,
    flushSettings,
    setSettingsMaintenanceBlocked,
    setSettingsMessage: setContextSettingsMessage,
    aiProvider,
    mcpBridge,
    viewPreferences,
    examPreferences,
    chatGptMcpPreferences,
    questionBank,
    templates,
    promptTemplates,
    memoTemplates,
  } = settingsCtx;
  const patchViewPreferences = viewPreferences.patch;
  const patchChatGptMcpPreferences = chatGptMcpPreferences.patch;
  const patchQuestionBankPreferences = questionBank.patch;
  const patchExamPrintPreferences = examPreferences.patchPrint;
  const upsertTemplate = templates.save;
  const removeTemplate = templates.delete;
  const upsertPromptTemplate = promptTemplates.save;
  const removePromptTemplate = promptTemplates.delete;
  const upsertMemoTemplate = memoTemplates.save;
  const removeMemoTemplate = memoTemplates.delete;
  const setLastImportTemplate = promptTemplates.setLastUsed;
  const { status: aiProviderStatus } = aiProvider;
  const { subjectOrder, moveSubject } = useSubjectOrder();
  const {
    showSettings, setShowSettings,
    showLearningHub, setShowLearningHub,
    learningHubTarget, setLearningHubTarget,
    showQuestionBank, setShowQuestionBank,
    showLibraryExplorer, setShowLibraryExplorer,
    examHistoryOpen, setExamHistoryOpen,
    learningCandidateEntryId, setLearningCandidateEntryId,
    settingsInitialTab, setSettingsInitialTab,
    questionTarget, setQuestionTarget,
    realExamStartEntry, setRealExamStartEntry,
    setRealExamMinutes,
    realExamShowTimer, setRealExamShowTimer,
    realExamAnswerSheetOpen, setRealExamAnswerSheetOpen,
    realExamAnswerSheetLayout, setRealExamAnswerSheetLayout,
    dismissedUpdateVersion, setDismissedUpdateVersion,
    controller: modalController,
  } = useAppModalController();
  const [realExamTimePreset, setRealExamTimePreset] = useState<"30" | "50" | "80" | "100" | "custom">("50");
  const [realExamCustomMinutes, setRealExamCustomMinutes] = useState("50");
  const parsedCustomMinutes = Number(realExamCustomMinutes);
  const customTimeError = realExamTimePreset === "custom" && (!Number.isInteger(parsedCustomMinutes) || parsedCustomMinutes < 1 || parsedCustomMinutes > 720)
    ? "1~720분 사이의 정수를 입력하세요."
    : null;
  const selectedRealMinutes = realExamTimePreset === "custom" ? parsedCustomMinutes : Number(realExamTimePreset);
  const questionRenderPersistingRef = useRef(false);
  const shell = useUiShellPreferences();
  const [autoCompactEntryPane, setAutoCompactEntryPane] = useState(false);
  const { setEntryPaneCollapsed, setEntryPaneOverride } = shell;
  const {
    registerWorkspaceDraftFlush,
    registerQuestionBankPreferenceFlush,
    flushTransientWrites,
    setTransientWritesMaintenanceBlocked,
  } = useAppWriteRegistrations();
  const examWorkspace = useExamWorkspaceController({
    existingEntries: entries,
    commitExamSubmission,
    examPrintPreferences: settings.examPrintPreferences,
  });
  const {
    session: examSession,
    setSession: setExamSession,
    sessionRef: examSessionRef,
    saveTimerRef: examSaveTimerRef,
    submitting: examSubmitting,
    setSubmitting: setExamSubmitting,
    saving: examSaving,
    saveError: examSaveError,
    setSaveError: setExamSaveError,
    startError: examStartError,
    setStartError: setExamStartError,
    loading: examSessionsLoading,
    loadError: examSessionsLoadError,
    reload: reloadExamSessions,
    updateSession: updateExamSession,
    savedSessions: savedExamSessions,
    activeGeneratedExam,
    open: openExamSession,
    close: closeExamSession,
    discardActiveSessionAfterRestore,
    flush: flushExamSessionSave,
    submit: handleExamSubmit,
  } = examWorkspace;

  const realProtection = useRealExamProtection();
  useEffect(() => {
    if (realProtection.sourceIds.size || realProtection.unavailable) void clearMcpSharedContexts().catch(() => setExamSaveError("실전 자료의 이전 MCP 공유를 해제하지 못했습니다. 연결을 확인해 주세요."));
  }, [realProtection, setExamSaveError]);

  const generatedExamController = examWorkspace.generated;
  const {
    flush: flushGeneratedExams,
    reload: reloadGeneratedExams,
    setGeneratedExamsMaintenanceBlocked,
    builderOpen: showExamBuilder,
    setBuilderOpen: setShowExamBuilder,
    listOpen: showGeneratedExams,
    setListOpen: setShowGeneratedExams,
  } = generatedExamController;
  const library = useLibraryFolders();
  const gptSolutionDrafts = useGptSolutionRoundtripDrafts();
  const reviewSessions = useReviewSessions();
  const reviewSessionGenerationRef = useRef(0);
  const reviewCallbackGeneration = reviewSessionGenerationRef.current;
  const saveReviewSession = (session: import("./types").ReviewSession) => {
    if (reviewCallbackGeneration !== reviewSessionGenerationRef.current) {
      return Promise.reject(new Error("복원 후 이전 복습 화면의 저장 요청은 취소되었습니다."));
    }
    return reviewSessions.save(session);
  };
  const discardActiveReviewAfterRestore = useCallback(() => {
    reviewSessionGenerationRef.current += 1;
  }, []);
  const pendingDeletionFlushRef = useRef<() => Promise<void>>(async () => undefined);
  const persistence = usePersistenceCoordinator({
    activeExam: examSession,
    examSaveTimerRef,
    examSessionRef,
    flushExamSession: flushExamSessionSave,
    flushEntries,
    flushSettings,
    flushAiProviderConfig: aiProvider.flushConfig,
    flushGeneratedExams,
    flushImportWorkspaceDraft: flushTransientWrites,
    flushLibraryFolders: library.flush,
    flushGptSolutionDrafts: gptSolutionDrafts.flush,
    flushReviewSessions: reviewSessions.flush,
    flushPendingDeletions: () => pendingDeletionFlushRef.current(),
    flushKnowledgeGraph: knowledgeGraph.flush,
    flushTransientWrites,
    setTransientWritesMaintenanceBlocked,
    setEntriesMaintenanceBlocked,
    setSettingsMaintenanceBlocked,
    setGeneratedExamsMaintenanceBlocked,
    setLibraryMaintenanceBlocked: library.setMaintenanceBlocked,
    setGptSolutionDraftsMaintenanceBlocked: gptSolutionDrafts.setMaintenanceBlocked,
    setKnowledgeGraphMaintenanceBlocked: knowledgeGraph.setMaintenanceBlocked,
    setReviewSessionsMaintenanceBlocked: reviewSessions.setMaintenanceBlocked,
    confirmCloseWithoutSaving: () => confirm({
      title: "저장하지 않고 종료",
      message: "저장되지 않은 변경 내용이 사라질 수 있습니다. 정말 저장하지 않고 종료하시겠습니까?",
      confirmLabel: "저장하지 않고 종료",
      cancelLabel: "종료 취소",
    }),
  });
  const { runMaintenanceOperation } = persistence;
  const protectionRecovery = useSavedRealExamProtection({
    sessions: savedExamSessions,
    sessionLoading: examSessionsLoading,
    sessionLoadError: examSessionsLoadError,
    entries,
    exams: generatedExamController.exams,
    generatedLoading: generatedExamController.loading,
    generatedLoadError: generatedExamController.loadError,
    reloadSessions: reloadExamSessions,
    reloadGenerated: reloadGeneratedExams,
    runMaintenanceOperation,
  });

  const navigation = useAppNavigationState({ entries, subjectOrder });
  const {
    activeSection,
    setActiveSection,
    selectedId,
    setSelectedId,
    search,
    setSearch,
    subjectFilter,
    setSubjectFilter,
    listFilter,
    setListFilter,
    sortKey,
    setSortKey,
    difficultyScoreFilter,
    setDifficultyScoreFilter,
    filtered,
    selected,
    stats,
    todayReviewCount,
    learningStats,
    subjectCounts,
    linkableTargets,
    sectionEntryCount,
  } = navigation;
  const selectedIsVisible = selected ? filtered.some((entry) => entry.id === selected.id) : false;
  // Read-only projections never enter the editable entry or the session save queue.
  const studyEntries = useMemo(() => entries.map(entry => presentWrongAnswerSharedPassage(entry, savedExamSessions, entries)), [entries, savedExamSessions]);
  const accessibleStudyEntries = useMemo(() => realProtection.unavailable ? [] : studyEntries.filter(entry => !realProtection.sourceIds.has(entry.id)), [studyEntries, realProtection]);
  const studySelected = selected ? studyEntries.find(entry => entry.id === selected.id) : undefined;
  const studyExamSession = useMemo(() => examSession ? presentSessionSharedPassages(examSession, entries) : null, [examSession, entries]);
  const hasActiveSectionEntries = entries.some((entry) => entry.entryKind === activeSection);
  const selectedEntryPaneOverride = selectedId ? shell.entryPaneOverrides[selectedId] : undefined;

  useEffect(() => {
    const updateCompactMode = () => setAutoCompactEntryPane(Boolean(selectedId) && (window.innerWidth <= 1100 || window.innerWidth <= 1200 && selected?.entryKind === "problem_sheet"));
    updateCompactMode();
    window.addEventListener("resize", updateCompactMode);
    return () => window.removeEventListener("resize", updateCompactMode);
  }, [selected?.entryKind, selectedId]);

  const entryPaneCollapsed = selected?.entryKind === "problem_sheet"
    ? selectedEntryPaneOverride ?? autoCompactEntryPane
    : autoCompactEntryPane || shell.entryPaneCollapsed;

  const handleEntryPaneCollapsedChange = useCallback((collapsed: boolean) => {
    if (selected?.entryKind === "problem_sheet" && selectedId) setEntryPaneOverride(selectedId, collapsed);
    else { setAutoCompactEntryPane(false); setEntryPaneCollapsed(collapsed); }
  }, [selected?.entryKind, selectedId, setEntryPaneCollapsed, setEntryPaneOverride]);

  const { removeEntryLinks } = knowledgeGraph;
  const handleFinalizedKnowledgeGraphEntry = useCallback(
    async (entryId: string) => removeEntryLinks(entryId),
    [removeEntryLinks],
  );
  const pendingDeletions = usePendingDeletionCoordinator({
    entries,
    restore: restorePendingDeletion,
    setSelectedId,
    onFinalizeEntry: handleFinalizedKnowledgeGraphEntry,
  });
  useEffect(() => {
    pendingDeletionFlushRef.current = pendingDeletions.flush;
  }, [pendingDeletions.flush]);
  const {
    ready: knowledgeGraphReady,
    loadStatus: knowledgeGraphLoadStatus,
    maintenanceBlocked: knowledgeGraphMaintenanceBlocked,
    reconcileQuestionLinks,
  } = knowledgeGraph;
  useEffect(() => {
    if (!knowledgeGraphReady || !canReconcileKnowledgeGraph({
      graph: knowledgeGraphLoadStatus,
      entries: entriesInitialLoadStatus,
      pendingDeletions: pendingDeletions.initialLoadStatus,
      maintenanceBlocked: knowledgeGraphMaintenanceBlocked,
    })) return;
    const protectedEntryIds = new Set(pendingDeletions.pending.map((record) => record.entry.id));
    void reconcileQuestionLinks(buildQuestionBankItems(entries), protectedEntryIds).catch(() => undefined);
  }, [entries, entriesInitialLoadStatus, knowledgeGraphLoadStatus, knowledgeGraphMaintenanceBlocked, knowledgeGraphReady, pendingDeletions.initialLoadStatus, pendingDeletions.pending, reconcileQuestionLinks]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const dismissOnboarding = useCallback((dontShowAgain: boolean) => {
    setOnboardingOpen(false);
    if (dontShowAgain) void patchViewPreferences({ onboarding: { dismissed: true } });
  }, [patchViewPreferences]);

  useEffect(() => {
    setExamStartError((current) => current?.entryId === selectedId ? current : null);
  }, [selectedId, setExamStartError]);

  const appNavigationController = useAppNavigationController({
    activeSection,
    selectedId,
    examSubmitting,
    examSession,
    closeExamSession,
    setActiveSection,
    setSelectedId,
    setShowLearningHub,
    setShowQuestionBank,
    setShowLibraryExplorer,
    setQuestionTarget,
    setExamSaveError,
  });

  const {
    closeError: closeFlushError,
    saving: closeFlushSaving,
    clearCloseError: clearCloseFlushError,
    retryClose,
    closeWithoutSaving,
  } = persistence;

  useEffect(() => {
    if (!examSession) return;
    const entry = entries.find((item) => item.id === examSession.entryId);
    if (examSession.entryId.startsWith("generated:")) return;
    const overlayIsStale =
      !selected ||
      selected.id !== examSession.entryId ||
      !entry;
    if (overlayIsStale) void closeExamSession();
  }, [examSession, selected, activeSection, entries, closeExamSession]);

  useEffect(() => {
    if (!questionTarget) return;
    if (selectedId !== questionTarget.entryId) {
      setQuestionTarget(null);
    }
  }, [selectedId, questionTarget, setQuestionTarget]);

  const handleQuestionTargetConsumed = useCallback((requestId: number) => {
    setQuestionTarget((current) => current?.requestId === requestId ? null : current);
  }, [setQuestionTarget]);

  const actions = useAppActions({
    entries,
    settings,
    selected,
    activeSection,
    subjectFilter,
    addEntry,
    addEntries,
    addEntriesWithImportAssetSession,
    updateEntry,
    deleteEntry,
    deleteEntryWithUndo,
    onPendingDeletion: pendingDeletions.record,
    patchEntry,
    patchEntryWithImportAssetSession,
    refresh,
    patchSettings,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
    refreshSettings,
    refreshExamSessions: reloadExamSessions,
    refreshReviewSessions: reviewSessions.refresh,
    setReviewSessionsRestoreReloadBlocked: reviewSessions.setRestoreReloadBlocked,
    discardActiveSessionAfterRestore,
    discardActiveReviewAfterRestore,
    refreshGeneratedExams: reloadGeneratedExams,
    refreshLibraryFolders: library.refresh,
    refreshGptSolutionDrafts: gptSolutionDrafts.reload,
    refreshKnowledgeGraph: knowledgeGraph.reload,
    setKnowledgeGraphRestoreReloadBlocked: knowledgeGraph.setRestoreReloadBlocked,
    runMaintenanceOperation,
    setActiveSection,
    setSelectedId,
  });
  const resumableReviewSession = actions.reviewMode
    ? reviewSessions.sessions.find((candidate) => canResumeReviewSession(candidate, actions.reviewMode!, actions.reviewSeed))
    : undefined;
  const studyReviewSeed = useMemo(() => actions.reviewSeed.map(item => ({ ...item,
    entry: studyEntries.find(entry => entry.id === item.entry.id) ?? item.entry })), [actions.reviewSeed, studyEntries]);

  useEffect(() => {
    setContextSettingsMessage(actions.settingsMessage);
  }, [actions.settingsMessage, setContextSettingsMessage]);
  const setSettingsMessage = (message: string | null) => {
    actions.setSettingsMessage(message);
    setContextSettingsMessage(message);
  };

  const updater = useAppUpdater(settings, patchSettings, async (update) => {
    if (examSubmitting || examSaving || actions.showForm || actions.showImportModal || showExamBuilder) {
      actions.setSettingsMessage("시험 또는 저장 중에는 업데이트를 설치할 수 없습니다. 작업을 마친 뒤 다시 시도해 주세요.");
      return false;
    }
    if (settings.updatePreferences.backupBeforeInstall && isTauri()) {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        await runMaintenanceOperation(() => createPreUpdateBackup(currentVersion, update.latestVersion));
      } catch {
        actions.setSettingsMessage("업데이트 전 백업에 실패했습니다. 데이터를 보호하기 위해 설치를 중단했습니다.");
        return false;
      }
    }
    return true;
  });

  const syncExamChatGptContext = useCallback(async (sharing: Pick<
    ChatGptMcpPreferences,
    "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages"
  >) => {
    const session = examSessionRef.current;
    if (!session) throw new Error("현재 응시 중인 모의고사 세션이 없습니다.");
    const current = session.questions[session.currentQuestionIndex];
    assertRealExamSourcesAllowed([current?.sourceReference?.sourceEntryId ?? current?.sourceEntryId ?? session.entryId]);
    const response = current
      ? session.responses.find((item) => item.questionNumber === current.questionNumber)
      : undefined;
    await syncMcpBridgeActiveExamContext({
      sessionId: session.id,
      questionId: current?.id ?? null,
      questionIndex: session.currentQuestionIndex,
      userResponse: response?.response ?? "",
      scratchNote: response?.scratchNote ?? "",
      markedForReview: response?.markedForReview ?? false,
      submitted: session.status === "submitted",
      updatedAt: session.updatedAt,
      ...sharing,
      contextUpdatedAt: new Date().toISOString(),
    });
  }, [examSessionRef]);

  useAppMaintenance({
    settings,
    patchSettings,
    report: setSettingsMessage,
    runMaintenanceOperation,
  });

  const openSettings = useCallback((tab?: SettingsTab) => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, [setSettingsInitialTab, setShowSettings]);

  const selectEntry = (entryId: string, section?: EntryKind) => {
    void requestNavigation({ entryId, section });
  };

  const openImportantQuestion = (entryId: string, questionNumber: string) => {
    const found = entries.find((entry) => entry.id === entryId);
    if (!found) return;
    void requestNavigation({
      section: found.entryKind,
      entryId,
      question: { entryId, questionNumber },
    });
  };

  const handleWikiLinkClick = async (target: string) => {
    const targetLower = target.toLowerCase();
    const found = entries.find(
      (entry) =>
        entry.id.toLowerCase() === targetLower ||
        entry.title.trim().toLowerCase() === targetLower,
    );

    if (found) {
      selectEntry(found.id, found.entryKind);
      return;
    }

    const confirmCreate = await confirm({
      title: "새 항목 만들기",
      message: `"${target}" 항목을 찾을 수 없습니다. 이 제목으로 새 항목을 생성할까요?`,
    });
    if (confirmCreate) {
      actions.openNewWithTitle(target);
    }
  };

  const openEntryById = (entryId: string) => {
    const found = entries.find((entry) => entry.id === entryId);
    if (found) selectEntry(entryId, found.entryKind);
  };

  const selectedExamHistory = selected
    ? savedExamSessions
      .filter((item) => item.entryId === selected.id && item.status === "submitted")
      .sort((a, b) => (b.submittedAt ?? b.updatedAt).localeCompare(a.submittedAt ?? a.updatedAt))
    : [];
  const selectedPracticeSession = selected
    ? savedExamSessions.find((item) => item.entryId === selected.id && item.status === "in_progress" && (item.mode ?? "practice") === "practice")
    : undefined;
  const selectedRealSession = selected
    ? savedExamSessions.find((item) => item.entryId === selected.id && item.status === "in_progress" && item.mode === "real")
    : undefined;
  const openNewRealExamDialog = () => {
    const defaultMinutes = settings.examPreferences.defaultRealExamMinutes ?? 50;
    if ([30, 50, 80, 100].includes(defaultMinutes)) {
      setRealExamTimePreset(String(defaultMinutes) as "30" | "50" | "80" | "100");
      setRealExamCustomMinutes(String(defaultMinutes));
    } else {
      setRealExamTimePreset("custom");
      setRealExamCustomMinutes(String(defaultMinutes));
    }
    setRealExamMinutes(defaultMinutes);
    setRealExamShowTimer(settings.examPreferences.showTimer);
    setRealExamAnswerSheetOpen(prefersCompactExamLayout() ? false : settings.examPreferences.realExamAnswerSheetOpen ?? true);
    setRealExamAnswerSheetLayout(settings.examPreferences.defaultAnswerSheetLayout ?? "auto");
    setRealExamStartEntry(selected);
  };
  const availableUpdate = updater.state.status === "available" ? updater.state : null;
  const openConceptLearningBlock = (entryId: string, blockId: string) => {
    void (async () => {
      if (await requestNavigation({ entryId: null })) {
        setShowQuestionBank(false);
        setShowLearningHub(true);
        setLearningHubTarget({ entryId, blockId });
      }
    })();
  };
  const libraryActions = useLibraryFolderActions({
    entries,
    library,
    patchEntry,
    confirm,
    prompt,
  });
  const { requestNavigation } = appNavigationController;
  const questionBankSidebar = useMemo(() => {
    const items = buildQuestionBankItems(entries);
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.subject] = (counts[item.subject] ?? 0) + 1;
    return { total: items.length, counts };
  }, [entries]);
  const learningHubSidebar = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of projectLearningBlocks(entries)) {
      counts[item.sourceSubject] = (counts[item.sourceSubject] ?? 0) + 1;
    }
    return { total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts };
  }, [entries]);
  const sidebarDestination = useMemo<SidebarDestination>(() => {
    if (showLearningHub) return { type: "learning_hub" };
    if (showQuestionBank) return { type: "question_bank" };
    if (showLibraryExplorer) return { type: "library" };
    return { type: "section", section: activeSection };
  }, [activeSection, showLearningHub, showLibraryExplorer, showQuestionBank]);
  const navigationSnapshot = useMemo(() => ({
      destination: sidebarDestination.type,
      section: activeSection,
      selectedId,
      search,
      subjectFilter,
      listFilter,
      sortKey,
      difficultyScoreFilter,
  }), [activeSection, difficultyScoreFilter, listFilter, search, selectedId, sidebarDestination.type, sortKey, subjectFilter]);
  const restoreNavigationSnapshot = useCallback((snapshot: typeof navigationSnapshot) => {
      setActiveSection(snapshot.section as EntryKind);
      setSelectedId(snapshot.selectedId);
      setSearch(snapshot.search);
      setSubjectFilter(snapshot.subjectFilter);
      setListFilter(snapshot.listFilter as typeof listFilter);
      setSortKey(snapshot.sortKey as typeof sortKey);
      setDifficultyScoreFilter(snapshot.difficultyScoreFilter as typeof difficultyScoreFilter);
      setShowLearningHub(snapshot.destination === "learning_hub");
      setShowQuestionBank(snapshot.destination === "question_bank");
      setShowLibraryExplorer(snapshot.destination === "library");
  }, [setActiveSection, setDifficultyScoreFilter, setListFilter, setSearch, setSelectedId, setShowLearningHub, setShowLibraryExplorer, setShowQuestionBank, setSortKey, setSubjectFilter]);
  const navigationHistory = useNavigationHistory({
    snapshot: navigationSnapshot,
    restore: restoreNavigationSnapshot,
  });
  const appCommands = useMemo<AppCommand[]>(() => [
    { id: "new-entry", label: "새 오답 추가", hint: "Ctrl/Cmd+N", onExecute: actions.openNew },
    { id: "import", label: "시험지 가져오기", hint: "Ctrl/Cmd+I", onExecute: actions.openImport },
    { id: "question-bank", label: "문제 은행", onExecute: () => void appNavigationController.openQuestionBank() },
    { id: "learning-hub", label: "학습 허브", onExecute: () => void appNavigationController.openLearningHub() },
    { id: "today-review", label: "오늘 복습", hint: "R", onExecute: () => actions.startReview("today") },
    { id: "settings", label: "설정", onExecute: () => openSettings() },
  ], [actions, appNavigationController, openSettings]);

  return (
    <SourceNavigationContext.Provider value={async source => { const entry = entries.find(e => e.id === source.sourceEntryId); if (!entry) { await confirm({ title: "원본 이동 불가", message: "원본 항목이 삭제되었거나 찾을 수 없습니다. 생성 당시 출처는 보존되어 있습니다." }); return; } if (entryAiMaterials(entry).filter(m=>normalizeQuestionNumber(m.source.sourceQuestionNumber)===normalizeQuestionNumber(source.sourceQuestionNumber)).length !== 1) { await confirm({title:"원문 문항 확인 필요",message:"원문 문항이 없거나 번호가 중복되어 안전하게 이동할 수 없습니다."});return; } if (examSession && !(await closeExamSession())) return; await appNavigationController.requestNavigation({ section: entry.entryKind ?? "wrong_answer", entryId: entry.id, question: { entryId: entry.id, questionNumber: source.sourceQuestionNumber } }); }}>
    <ConceptLinkProvider entries={accessibleStudyEntries} preferences={settings.viewPreferences} onOpenEntry={openEntryById} onOpenLearningBlock={openConceptLearningBlock}>
    <StudyAiChat entries={entries} selectedEntryId={selectedId} session={examSession ? hydrateSessionSourceReferences(studyExamSession ?? examSession, generatedExamController.exams) : null} onSaveExam={generatedExamController.persist} onStartExam={exam => { const result = generatedExamController.openExam(exam); if (!result.ok) throw new Error(result.message); }} onSettings={() => openSettings("ai")} connection={{ unsupported: !isTauri(), available: isTauri() && Boolean(aiProviderStatus?.available) && !aiProvider.statusLoading && !aiProvider.operationPending, pending: isTauri() && (aiProvider.statusLoading || aiProvider.operationPending), reason: !isTauri() ? "AI 대화는 Windows 설치 앱에서 사용할 수 있습니다. 작성한 내용은 전송되지 않습니다." : aiProvider.statusLoading || aiProvider.operationPending ? "AI 연결 설정을 확인하는 중입니다…" : aiProvider.statusError || aiProviderStatus?.message || "제공자·모델·API 키를 설정한 뒤 대화할 수 있습니다." }} />
    <CommandPalette commands={appCommands} />
    <div className={`app app-shell${shell.appSidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}${entryPaneCollapsed ? " app-shell--entry-collapsed" : ""}`}>
      <AppSidebar
        navigationController={appNavigationController}
        activeSection={activeSection}
        entries={entries}
        stats={stats}
        learningStats={learningStats}
        subjects={{ order: subjectOrder, filter: subjectFilter, counts: subjectCounts, sectionEntryCount, move: moveSubject, select: setSubjectFilter }}
        questionBank={{ active: showQuestionBank, total: questionBankSidebar.total, subjectCounts: questionBankSidebar.counts }}
        learningHub={{ active: showLearningHub, total: learningHubSidebar.total, subjectCounts: learningHubSidebar.counts }}
        actions={{ openNew: actions.openNew, openImport: actions.openImport, openLearningImport: () => actions.setShowLearningImportModal(true), openExamBuilder: () => setShowExamBuilder(true) }}
        destination={sidebarDestination}
        shell={{ collapsed: shell.appSidebarCollapsed, overlay: shell.appSidebarOverlay, onCollapsedChange: shell.setAppSidebarCollapsed }}
      />

      <main className="main">
        {storageBackendKind === "isolated-browser" && (
          <div className="storage-mode-notice" role="status">
            브라우저 격리 모드 · 이 창의 데이터는 데스크톱 앱 데이터와 분리됩니다.
          </div>
        )}
        {error && <ErrorNotice message={error} onRetry={() => void refresh()} onDismiss={clearError} />}
        {examSessionsLoadError && (
          <ErrorNotice
            message={examSessionsLoadError}
            onRetry={() => void reloadExamSessions()}
            busy={examSessionsLoading}
          />
        )}
        {examSessionsLoading && <p className="status-message" role="status">시험 기록을 불러오는 중입니다. 시험 시작과 저장은 잠시 차단됩니다.</p>}
        {availableUpdate && settings.updatePreferences.notificationsEnabled && availableUpdate.latestVersion !== settings.updatePreferences.skippedVersion && availableUpdate.latestVersion !== dismissedUpdateVersion && !examSession && (
          <div className="app-update-banner" role="status">
            <span>새 버전 {availableUpdate.latestVersion}을 사용할 수 있습니다.</span>
            <button type="button" onClick={() => openSettings("updates")}>변경사항</button>
            <button type="button" onClick={() => void updater.installUpdate()}>업데이트</button>
            <button type="button" onClick={() => setDismissedUpdateVersion(availableUpdate.latestVersion)}>나중에</button>
            <button type="button" onClick={() => void patchSettings({ updatePreferences: { ...settings.updatePreferences, skippedVersion: availableUpdate.latestVersion } })}>이번 버전 건너뛰기</button>
          </div>
        )}
        {!showLearningHub && !showQuestionBank && !showLibraryExplorer && <AppToolbar
          activeSection={activeSection}
          search={search}
          setSearch={setSearch}
          sortKey={sortKey}
          setSortKey={setSortKey}
          difficultyScoreFilter={difficultyScoreFilter}
          setDifficultyScoreFilter={setDifficultyScoreFilter}
          listFilter={listFilter}
          setListFilter={setListFilter}
          todayReviewCount={todayReviewCount}
          startReview={actions.startReview}
          onOpenSettings={() => openSettings()}
          examHistoryCount={selectedIsVisible && selected?.entryKind === "problem_sheet" && !examSession ? selectedExamHistory.length : 0}
          onOpenExamHistory={() => setExamHistoryOpen(true)}
        />}

        {!showLearningHub && !showQuestionBank && !showLibraryExplorer && activeSection === "problem_sheet" && (
          <nav className="problem-sheet-library-tabs" aria-label="시험지함 보기">
            <button type="button" className="is-active" aria-current="page">시험지</button>
            <button type="button" onClick={() => setShowGeneratedExams(true)}>생성한 모의고사</button>
          </nav>
        )}

        <div className="content" ref={navigationHistory.scrollRef("main")}>
          {showLibraryExplorer ? (
            <LibraryExplorer
              folders={library.folders}
              entries={entries}
              preferences={settings.libraryPreferences}
              navigation={settings.viewPreferences.libraryNavigation}
              onNavigationChange={(libraryNavigation) => void patchViewPreferences({ libraryNavigation })}
              onOpenEntry={openEntryById}
              onCreateFolder={(parentId) => void libraryActions.createFolder(parentId)}
              onRenameFolder={(folder) => void libraryActions.renameFolder(folder)}
              onMoveFolder={(folder, parentId) => void libraryActions.moveFolder(folder, parentId)}
              onMoveEntries={(entryIds, folderId) => void libraryActions.moveEntries(entryIds, folderId)}
              onUpdateEntries={(entryIds, patch) => Promise.all(entryIds.map((entryId) => patchEntry(entryId, patch))).then(() => undefined)}
              onDeleteFolder={(folder) => void libraryActions.deleteFolder(folder)}
            />
          ) : showQuestionBank ? (
            <NotebookKnowledgeWorkspace
              mode="question-bank"
              entries={accessibleStudyEntries}
              learningHubTarget={learningHubTarget}
              questionBankPreferences={settings.questionBankPreferences}
              patchQuestionBankPreferences={patchQuestionBankPreferences}
              registerQuestionBankPreferenceFlush={registerQuestionBankPreferenceFlush}
              patchEntry={patchEntry}
              openCandidateReview={setLearningCandidateEntryId}
              aiProviderStatus={aiProviderStatus}
              onOpenAiSettings={() => openSettings("gpt-mcp")}
              onOpenImport={actions.openImport}
              onRegisterScrollContainer={navigationHistory.registerScrollRestoration}
              onStartReview={(items) => actions.startSelectionReview(items.map((item) => {
                const itemEntry = entries.find((entry) => entry.id === item.entryId);
                return itemEntry?.entryKind === "problem_sheet"
                  ? { kind: "sheet-question" as const, entry: itemEntry, questionNumber: item.questionNumber }
                  : itemEntry ? { kind: "entry" as const, entry: itemEntry } : null;
              }).filter((item): item is { kind: "entry"; entry: typeof entries[number] } | { kind: "sheet-question"; entry: typeof entries[number]; questionNumber: string } => Boolean(item)))}
              knowledgeGraph={{ ...knowledgeGraph, refresh: actions.retryRestoreReload }}
              subjectFilter={subjectFilter}
              openEntry={(entry, questionNumber) => void requestNavigation({
                  section: entry.entryKind,
                  entryId: entry.id,
                  question: questionNumber ? { entryId: entry.id, questionNumber } : undefined,
                })}
            />
          ) : showLearningHub ? (
            <NotebookKnowledgeWorkspace
              mode="learning-hub"
              entries={accessibleStudyEntries}
              learningHubTarget={learningHubTarget}
              questionBankPreferences={settings.questionBankPreferences}
              patchQuestionBankPreferences={patchQuestionBankPreferences}
              registerQuestionBankPreferenceFlush={registerQuestionBankPreferenceFlush}
              patchEntry={patchEntry}
              openCandidateReview={setLearningCandidateEntryId}
              aiProviderStatus={aiProviderStatus}
              onOpenAiSettings={() => openSettings("gpt-mcp")}
              onOpenImport={actions.openImport}
              onRegisterScrollContainer={navigationHistory.registerScrollRestoration}
              knowledgeGraph={{ ...knowledgeGraph, refresh: actions.retryRestoreReload }}
              subjectFilter={subjectFilter}
              onStartReview={(items) => actions.startSelectionReview(items.map((item) => {
                const itemEntry = entries.find((entry) => entry.id === item.entryId);
                return itemEntry?.entryKind === "problem_sheet"
                  ? { kind: "sheet-question" as const, entry: itemEntry, questionNumber: item.questionNumber }
                  : itemEntry ? { kind: "entry" as const, entry: itemEntry } : null;
              }).filter((item): item is { kind: "entry"; entry: typeof entries[number] } | { kind: "sheet-question"; entry: typeof entries[number]; questionNumber: string } => Boolean(item)))}
              openEntry={(entry, questionNumber) => void requestNavigation({
                  section: entry.entryKind,
                  entryId: entry.id,
                  question: questionNumber ? { entryId: entry.id, questionNumber } : undefined,
                })}
            />
          ) : <>
          {(loading || hasActiveSectionEntries || activeSection === "concept") && <EntryListPane
            activeSection={activeSection}
            loading={loading}
            entries={entries}
            filtered={filtered}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onSelectEntry={(entryId) => void requestNavigation({ entryId })}
            quickConceptSubject={actions.quickConceptSubject}
            onQuickConceptCreate={actions.handleQuickConceptCreate}
            onOpenImportantQuestion={openImportantQuestion}
            onStartImportantReview={() => actions.startReview("important")}
            onAddSupplemental={actions.openSupplementalImport}
            onManageSupplemental={actions.openSupplementalManager}
            onEditEntry={actions.openEditEntry}
            onDeleteEntry={(entryId) => void actions.deleteEntryById(entryId)}
            onLinkLearningEntry={actions.openLearningEntryLink}
            collapsed={entryPaneCollapsed}
            width={shell.entryPaneWidth}
            onCollapsedChange={handleEntryPaneCollapsedChange}
            onWidthChange={shell.setEntryPaneWidth}
            libraryPreferences={settings.libraryPreferences}
            onUpdateEntry={(entryId, patch) => patchEntry(entryId, patch)}
          />}

          {examSession ? (
            <ExamSessionOverlay
              session={hydrateSessionSourceReferences(studyExamSession ?? examSession, generatedExamController.exams)}
              generated={Boolean(activeGeneratedExam)}
              hideAnswers={settings.viewPreferences.hideAnswers}
              examPreferences={settings.examPreferences}
              onOpenSettings={(tab) => openSettings(tab ?? "exam")}
              chatGptPreferences={settings.chatGptMcpPreferences}
              onChatGptPreferencesChange={(patch) => patchChatGptMcpPreferences(patch)}
              onSyncChatGptContext={syncExamChatGptContext}
              onOpenChatGptSettings={() => openSettings("chatgpt")}
              onCheckLocalMcp={async () => {
                const status = await mcpBridge.testConnection();
                if (status.status !== "listening" && status.status !== "connected") {
                  throw new Error("로컬 MCP 브리지 연결 테스트에 실패했습니다.");
                }
              }}
              remoteMcpConfigured={Boolean(settings.chatGptMcpPreferences.remoteBaseUrl)}
              onChange={setExamSession}
              onUpdateSession={updateExamSession}
              onSubmittingChange={setExamSubmitting}
              onSubmit={handleExamSubmit}
              onClose={closeExamSession}
              onStartReview={(questionNumbers) => selected && actions.startSelectionReview(questionNumbers.map((questionNumber) => ({ kind: "sheet-question" as const, entry: selected, questionNumber })))}
              submitting={examSubmitting}
              saving={examSaving}
              saveError={examSaveError}
              onRetrySave={() => {
                const current = examSessionRef.current;
                if (current) void flushExamSessionSave(current);
              }}
            />
          ) : selected && selectedIsVisible ? (
            <>
              {examHistoryOpen && <Dialog open size="md" ariaLabel="모의고사 결과 이력" onClose={() => setExamHistoryOpen(false)}><header className="modal-head"><h2>모의고사 결과 이력</h2></header><div className="exam-session-history-list">{selectedExamHistory.map((item) => <button type="button" key={item.id} onClick={() => { setExamHistoryOpen(false); setExamSession(item); }}><span>{new Date(item.submittedAt ?? item.updatedAt).toLocaleDateString("ko-KR")}</span><strong>{item.score?.percentCorrect ?? 0}%</strong><small>{item.score?.correctCount ?? 0} / {item.score?.totalQuestions ?? item.questions.length}</small></button>)}</div></Dialog>}
              {realProtection.unavailable || realProtection.sourceIds.has(selected.id) ? <section className="empty-state" role="status">
                <h2>{selected.title}</h2>
                <p>{realProtection.unavailable ? "시험 기록 또는 원본 출처를 확인하지 못해 학습·해설·공유를 잠시 차단했습니다. 다시 불러온 뒤에도 안내가 남으면 미제출 실전 시험의 원본 연결을 확인해 주세요." : "진행 중 실전 시험의 자료입니다. 제출 후 학습·해설·공유를 사용할 수 있습니다. 시험을 닫아도 보호는 유지됩니다."}</p>
                {realProtection.unavailable ? <>
                  <button type="button" disabled={protectionRecovery.loading || protectionRecovery.retrying} onClick={() => void protectionRecovery.retry()}>{protectionRecovery.loading || protectionRecovery.retrying ? "시험 기록·출처 확인 중…" : "시험 기록·출처 다시 불러오기"}</button>
                  {protectionRecovery.retryError && <p role="alert">{protectionRecovery.retryError}</p>}
                </> : null}
                {realProtection.sessions.filter(item => realProtection.unavailable || item.entryId === selected.id || item.questions.some(question => question.sourceEntryId === selected.id || question.sourceReference?.sourceEntryId === selected.id)).map(item => <button key={item.id} type="button" onClick={() => { const latest = savedExamSessions.find(saved => saved.id === item.id); if (latest) setExamSession(latest); }}>실전 이어서 · {item.title}</button>)}
              </section> : <EntryDetail
              entry={selected}
              examStartError={examStartError?.entryId === selected.id ? examStartError.message : undefined}
              presentationEntry={studySelected}
              onStartExam={selected.entryKind === "problem_sheet" ? () => {
                openExamSession(selected, { mode: "practice", resumable: selectedPracticeSession });
              } : undefined}
              onStartRealExam={selected.entryKind === "problem_sheet" ? () => {
                openNewRealExamDialog();
              } : undefined}
              onStartReview={() => actions.startSelectionReview([{ kind: "entry", entry: selected }])}
              startExamLabel={selectedPracticeSession ? "이어서 풀기" : "문제 풀기"}
              startRealExamLabel={selectedRealSession ? "실전 이어서" : "실전 모드"}
              onEdit={actions.openEdit}
              onQuickGptSolution={
                selected.entryKind !== "concept"
                  ? actions.openQuickGptSolution
                  : undefined
              }
              onDelete={actions.handleDelete}
              onToggleMastered={() => toggleMastered(selected.id)}
              onToggleDifficult={() => toggleDifficult(selected.id)}
              onAnnotationsChange={(annotations) =>
                patchEntry(selected.id, { annotations })
              }
              onChecklistChange={(checklist) =>
                patchEntry(selected.id, { checklist })
              }
              onWikiLinkClick={handleWikiLinkClick}
              existingTargets={linkableTargets}
              allEntries={entries}
              onOpenEntry={openEntryById}
              onOpenQuestionTarget={openImportantQuestion}
              examSession={savedExamSessions.find((item) => item.entryId === selected.id) ?? null}
              examPrintPreferences={settings.examPrintPreferences}
              examPreferences={settings.examPreferences}
              onExamPrintPreferencesChange={(patch) => void patchExamPrintPreferences(patch)}
              onSyncExportContext={async (payload) => {
                assertRealExamSourcesAllowed([selected.id]);
                const context: McpExportContext = {
                  entryId: selected.id,
                  sessionId: savedExamSessions.find((item) => item.entryId === selected.id)?.id ?? null,
                  scope: payload.scope,
                  questionNumbers: payload.questionNumbers,
                  submitted: payload.submitted,
                  shareOptions: payload.shareOptions,
                  updatedAt: new Date().toISOString(),
                  generatedExamId: activeGeneratedExam?.id ?? null,
                  includeSourceReferences: false,
                };
                await syncMcpBridgeExportContext(context);
              }}
              onReview={actions.handleReview}
              onQuickMemo={actions.handleQuickMemo}
              onLearningBlocksChange={actions.handleLearningBlocksChange}
              onImportLecture={() => actions.setShowLearningImportModal(true)}
              onSaveSolutionHotspots={hotspots => patchEntry(selected.id, { questionSolutionHotspots: hotspots })}
              onQuestionTextChange={(entry, text) =>
                patchEntry(entry.id, { question: text })
              }
              onStructuredQuestionsChange={(entry, questions) =>
                patchEntry(entry.id, {
                  structuredQuestions: questions,
                  question: renderStructuredQuestionsCompatibilityText(questions),
                  questionContentSegments: Object.fromEntries(
                    questions.map((question) => [question.questionNumber, question.contentSegments]),
                  ),
                })
              }
              onTitleChange={(entry, title) =>
                patchEntry(entry.id, { title })
              }
              onQuestionMetaChange={(entry, nextQuestionMeta) =>
                patchEntry(entry.id, (current) => ({
                  questionMeta: typeof nextQuestionMeta === "function"
                    ? nextQuestionMeta(current.questionMeta ?? [])
                    : nextQuestionMeta,
                }))
              }
              onPersistQuestionRender={async ({ questionNumber, blob, filename, canonicalFingerprint, scope, rendererVersion }) => {
                if (questionRenderPersistingRef.current) throw new Error("정리본 저장이 이미 진행 중입니다.");
                questionRenderPersistingRef.current = true;
                const file = new File([blob], filename.endsWith(".png") ? filename : `${filename}.png`, { type: "image/png" });
                let savedImage: string;
                try {
                  [savedImage] = await saveImageFiles([file]);
                } catch (error) {
                  questionRenderPersistingRef.current = false;
                  throw error;
                }
                const previousImage = selected.questionRenderVerification?.find((item) => item.questionNumber === questionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion)?.renderedImage;
                try {
                  await patchEntry(selected.id, (current) => ({
                    questionRenderVerification: [
                      ...(current.questionRenderVerification ?? []).filter((item) => !(item.questionNumber === questionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion)),
                      { questionNumber, canonicalFingerprint, scope, rendererVersion, status: "unverified", renderedImage: savedImage },
                    ],
                  }));
                } catch (error) {
                  await deleteImage(savedImage).catch(() => undefined);
                  questionRenderPersistingRef.current = false;
                  throw error;
                }
                if (previousImage && previousImage !== savedImage) {
                  const nextVerification = [
                    ...(selected.questionRenderVerification ?? []).filter((item) => !(item.questionNumber === questionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion)),
                    { questionNumber, canonicalFingerprint, scope, rendererVersion, status: "unverified" as const, renderedImage: savedImage },
                  ];
                  const nextEntries = entries.map((entry) => entry.id === selected.id ? { ...entry, questionRenderVerification: nextVerification } : entry);
                  if ((collectAllImageReferences(nextEntries).get(previousImage) ?? 0) === 0) await deleteImage(previousImage).catch(() => undefined);
                }
                questionRenderPersistingRef.current = false;
              }}
              onUpdateQuestionRenderVerification={async ({ questionNumber, scope, rendererVersion, status, expectedFingerprint }) => {
                await patchEntry(selected.id, (current) => ({
                  questionRenderVerification: (current.questionRenderVerification ?? []).map((item) => item.questionNumber === questionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion
                    ? (() => { if (status === "verified" && expectedFingerprint && item.canonicalFingerprint !== expectedFingerprint) throw new Error("정리본이 변경되어 다시 확인해야 합니다."); return { ...item, status, verifiedAt: status === "verified" ? new Date().toISOString() : undefined, verificationSource: status === "verified" ? "user" : undefined }; })()
                    : item),
                }));
              }}
              initialQuestionTarget={
                questionTarget?.entryId === selected.id ? questionTarget : null
              }
              onInitialQuestionTargetConsumed={handleQuestionTargetConsumed}
              viewPreferences={settings.viewPreferences}
              onViewPreferencesChange={(patch) => void patchViewPreferences(patch)}
              onOpenSettings={(tab) => openSettings(tab ?? "view")}
              aiProviderStatus={aiProviderStatus}
              chatGptPreferences={settings.chatGptMcpPreferences}
              onChatGptPreferencesChange={(patch) => patchChatGptMcpPreferences(patch)}
              onOpenChatGptSettings={() => openSettings("chatgpt")}
              onCheckLocalMcp={async () => {
                const status = await mcpBridge.testConnection();
                if (status.status !== "listening" && status.status !== "connected") {
                  throw new Error("로컬 MCP 브리지 연결 테스트에 실패했습니다.");
                }
              }}
              remoteMcpConfigured={Boolean(settings.chatGptMcpPreferences.remoteBaseUrl)}
              questionBankItems={buildQuestionBankItems(studyEntries)}
              onSimilarQuestionLinksChange={(entry, links) => patchEntry(entry.id, { similarQuestionLinks: links })}
               onApplyGptSolutionRoundtrip={(entry, patch) => patchEntry(entry.id, patch)}
               gptSolutionDraftStore={gptSolutionDrafts}
             />}
            </>
          ) : (
            <div className="detail-panel empty-state">
              <span className="icon">{entryKindIcon(activeSection)}</span>
              <p>
                {selected
                  ? "선택한 항목이 현재 검색 또는 필터에 포함되지 않습니다. 검색어나 필터를 조정하면 다시 표시됩니다."
                  : hasActiveSectionEntries ? `왼쪽 목록에서 ${entryKindWithParticle(activeSection, "object")} 선택하세요.` : `아직 등록된 ${entryKindWithParticle(activeSection, "subject")} 없습니다.`}
                {!selected && !hasActiveSectionEntries && <><br />{activeSection === "problem_sheet" ? "파일·ZIP을 가져오거나 직접 입력해 시작하세요." : "첫 자료를 추가해 학습을 시작하세요."}</>}
              </p>
              {hasActiveSectionEntries && filtered.length === 0 && <button type="button" className="btn-primary" onClick={() => { setSearch(""); setSubjectFilter("all"); setListFilter("all"); setDifficultyScoreFilter("all"); }}>검색·필터 초기화</button>}
              {!selected && !(hasActiveSectionEntries && filtered.length === 0) && (activeSection === "problem_sheet" ? (
                <button type="button" className="btn-primary" onClick={() => actions.openImport()}>{hasActiveSectionEntries ? "새 시험지 가져오기" : "첫 시험지 가져오기"}</button>
              ) : activeSection === "lecture" ? (
                <button type="button" className="btn-primary" onClick={() => actions.setShowLearningImportModal(true)}>{hasActiveSectionEntries ? "새 특강 가져오기" : "첫 특강 가져오기"}</button>
              ) : activeSection === "concept" ? (
                <button type="button" className="btn-primary" onClick={() => actions.openNew()}>{hasActiveSectionEntries ? "새 개념 만들기" : "첫 개념 만들기"}</button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => actions.openNew()}>{hasActiveSectionEntries ? "새 오답 추가" : "첫 오답 추가"}</button>
              ))}
            </div>
          )}
          </>}
        </div>
      </main>

      {learningCandidateEntryId && (() => {
        const candidateEntry = entries.find((entry) => entry.id === learningCandidateEntryId);
        if (!candidateEntry) return null;
        return <LearningCandidateReviewModal
          entry={candidateEntry}
          onClose={() => setLearningCandidateEntryId(null)}
          onSave={(blocks) => patchEntry(candidateEntry.id, (current) => ({
            learningBlocks: appendUniqueLearningBlocks(current.learningBlocks ?? [], blocks),
          }))}
        />;
      })()}

      <AppModals
        modalController={modalController}
        workspaceActions={{ registerDraftFlush: registerWorkspaceDraftFlush }}
        form={{ show: actions.showForm, editingEntry: actions.editingEntry, handleSave: actions.handleSave, close: actions.closeForm, activeSection, prefilledTitle: actions.prefilledTitle, importedInitialData: actions.importedInitialData }}
        settings={{ value: settings, saveTemplate: actions.saveTemplate, aiProviderStatus, setLastImportTemplate, savePromptTemplate: actions.savePromptTemplate, open: openSettings }}
        importFlow={{ show: actions.showImportModal, mode: actions.importMode, solutionSourceEntry: actions.solutionSourceEntry, fallbackSubject: actions.importFallbackSubject, close: actions.closeImportModal, apply: actions.handleImportApply, applyEntries: actions.handleImportedEntriesApply, cancelPending: cancelUncommittedImport }}
        learningImport={{ show: actions.showLearningImportModal, setShow: actions.setShowLearningImportModal, apply: actions.handleLearningImportApply }}
        review={{
          mode: actions.reviewMode,
          seed: studyReviewSeed,
          setMode: actions.setReviewMode,
          handle: actions.handleReview,
          session: resumableReviewSession,
          saveSession: saveReviewSession,
        }}
        navigation={{ setActiveSection, setSelectedId, handleWikiLinkClick, existingTargets: linkableTargets }}
        supplemental={{ target: (() => {
          if (!actions.supplementalTarget) return null;
          const entry = entries.find((item) => item.id === actions.supplementalTarget?.entryId);
          return entry ? { entry, mode: actions.supplementalTarget.mode } : null;
        })(), closeImport: actions.closeSupplementalImport, applyMerge: actions.applySupplementalMerge, managerEntry: actions.supplementalManagerEntryId ? entries.find((entry) => entry.id === actions.supplementalManagerEntryId) ?? null : null, closeManager: actions.closeSupplementalManager, rename: actions.renameSupplementalResource, remove: actions.deleteSupplementalResource, linkTarget: actions.supplementalLinkEntryId ? entries.find((entry) => entry.id === actions.supplementalLinkEntryId) ?? null : null, linkCandidates: entries.filter((entry) => entry.entryKind === "lecture" || entry.entryKind === "concept"), closeLink: actions.closeLearningEntryLink, link: actions.linkLearningEntry }}
      />
      <NotificationRegion>{pendingDeletions.latestUndoable && (
        <Snackbar actionLabel="실행 취소" onAction={() => pendingDeletions.undo(pendingDeletions.latestUndoable!)}>
          {`"${pendingDeletions.latestUndoable.entry.title || "항목"}"을(를) 삭제했습니다.`}
        </Snackbar>
      )}
      {pendingDeletions.error && (
        <Snackbar actionLabel="다시 시도" onAction={() => pendingDeletions.finalizeExpired()}>
          삭제 항목 정리를 완료하지 못했습니다.
        </Snackbar>
      )}
      </NotificationRegion>
      {showExamBuilder && (
        <ExamBuilderWizard
          entries={entries}
          onClose={() => setShowExamBuilder(false)}
          onSave={generatedExamController.persist}
          onStart={async (exam) => {
            await generatedExamController.persist(exam);
            setShowExamBuilder(false);
            generatedExamController.openExam(exam);
          }}
        />
      )}
      <GeneratedExamsDialog
        onCreate={() => setShowExamBuilder(true)}
        open={showGeneratedExams}
        closing={generatedExamController.closing}
        closeError={generatedExamController.closeError}
        loading={generatedExamController.loading}
        loadError={generatedExamController.loadError}
        saving={generatedExamController.saving}
        saveError={generatedExamController.error}
        retryableError={generatedExamController.retryableError}
        hasRetryableChange={generatedExamController.hasRetryableChange}
        exams={generatedExamController.exams}
        onClose={generatedExamController.closeList}
        onReload={async () => { await generatedExamController.reload(); }}
        onRetry={generatedExamController.retry}
        onDiscardFailure={generatedExamController.discardFailedChange}
        onOpen={generatedExamController.openExam}
        protectedExamIds={realProtection.sourceIds}
        protectionUnavailable={realProtection.unavailable}
        onConfirmAnswer={async (exam, position) => {
          assertRealExamSourcesAllowed([`generated:${exam.id}`, ...exam.questions.map(question => question.source.sourceEntryId)]);
          const matches = exam.questions.filter(question => question.position === position);
          if (matches.length !== 1) throw new Error("확인할 문항을 고유하게 찾지 못했습니다.");
          const target = matches[0];
          const answer = target.snapshot.solutionAnswer;
          if (!answer || !["gpt_estimate", "conflict"].includes(answer.answerProvenance?.kind ?? "")) throw new Error("이 문항은 정답 확인이 필요하지 않거나 저장된 답을 찾을 수 없습니다.");
          const confirmed = confirmAssessmentAnswer(answer);
          const updated: GeneratedExam = {
            ...exam,
            updatedAt: new Date().toISOString(),
            questions: exam.questions.map(question => question.position === position
              ? { ...question, snapshot: { ...question.snapshot, solutionAnswer: confirmed, correctAnswer: confirmed.answer } }
              : question),
          };
          await generatedExamController.persist(updated);
        }}
        onDelete={async (id) => {
          const exam = generatedExamController.exams.find((item) => item.id === id);
          if (!exam) return;
          const confirmed = await confirm({
            title: "모의고사 삭제",
            message: `"${exam.title}"을(를) 삭제할까요? 저장된 문제 세트가 제거됩니다.`,
            confirmLabel: "삭제",
            variant: "destructive",
          });
          if (confirmed) await generatedExamController.remove(id);
        }}
        onPrint={async exam => { assertRealExamSourcesAllowed([`generated:${exam.id}`, ...exam.questions.map(question => question.source.sourceEntryId)]); await generatedExamController.print(exam); }}
      />
      {showSettings && (
        <SettingsModal
          initialTab={settingsInitialTab}
          dataActions={{
            integrityReport: actions.integrityReport,
            backup: actions.handleBackup,
            restore: actions.handleRestore,
            restoreReloadPending: actions.restoreReloadPending,
            retryRestoreReload: actions.retryRestoreReload,
            runIntegrity: actions.runIntegrity,
            cleanupOrphans: actions.handleCleanupOrphans,
          }}
          updateActions={{
            state: updater.state,
            check: async () => { await updater.checkForUpdate({ ignoreSkipped: true }); },
            install: async () => { await updater.installUpdate(); },
            restart: async () => { await updater.restart(); },
            openReleasePage: () => { window.open(GITHUB_RELEASES_URL, "_blank", "noopener,noreferrer"); },
          }}
          onReplayOnboarding={() => setOnboardingOpen(true)}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialTab(undefined);
          }}
        />
      )}
      <Dialog
        open={Boolean(realExamStartEntry)}
        onClose={() => setRealExamStartEntry(null)}
        title="실전 모의고사 시작"
        ariaLabel="실전 모의고사 시작"
        footer={null}
      >
        {realExamStartEntry && (
          <div className="real-exam-start-dialog">
            <p className="form-hint">{realExamStartEntry.title}</p>
            <p>문항 {selectedRealSession?.questions.length ?? getEntryQuestions(realExamStartEntry).length}개</p>
            {examStartError?.entryId === realExamStartEntry.id && <p className="form-error" role="alert">{examStartError.message}</p>}
            {selectedRealSession?.deadlineAt && (
              <p className="form-hint" role="status">
                진행 중인 실전 모의고사 · 남은 시간 {Math.floor(getRemainingExamSeconds(selectedRealSession.deadlineAt) / 60).toString().padStart(2, "0")}:{(getRemainingExamSeconds(selectedRealSession.deadlineAt) % 60).toString().padStart(2, "0")}
              </p>
            )}
            <label className="form-field">
              제한 시간
              <select value={selectedRealSession ? String(selectedRealSession.timeLimitMinutes ?? 50) : (realExamTimePreset === "custom" ? "custom" : realExamTimePreset)} disabled={Boolean(selectedRealSession)} onChange={(event) => { const value = event.target.value as typeof realExamTimePreset; setRealExamTimePreset(value); if (value !== "custom") setRealExamMinutes(Number(value)); }}>
                {["30", "50", "80", "100"].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
                {selectedRealSession && ![30, 50, 80, 100].includes(selectedRealSession.timeLimitMinutes ?? 50) && <option value={String(selectedRealSession.timeLimitMinutes)}>{selectedRealSession.timeLimitMinutes}분 (기존 설정)</option>}
                <option value="custom">사용자 지정</option>
              </select>
              {!selectedRealSession && realExamTimePreset === "custom" && <><input aria-label="사용자 지정 제한 시간" type="number" min="1" max="720" step="1" value={realExamCustomMinutes} onChange={(event) => setRealExamCustomMinutes(event.target.value)} />{customTimeError && <span className="form-error" role="alert">{customTimeError}</span>}</>}
            </label>
            <label className="form-field">
              답안지
              <select value={selectedRealSession?.answerSheetLayout ?? realExamAnswerSheetLayout} disabled={Boolean(selectedRealSession)} onChange={(event) => setRealExamAnswerSheetLayout(event.target.value as "auto" | "vertical" | "horizontal")}>
                <option value="auto">자동</option><option value="vertical">세로</option><option value="horizontal">가로</option>
              </select>
            </label>
            <label className="settings-checkbox"><input type="checkbox" checked={selectedRealSession?.showTimer ?? realExamShowTimer} disabled={Boolean(selectedRealSession)} onChange={(event) => setRealExamShowTimer(event.target.checked)} /> 타이머 표시</label>
            <label className="settings-checkbox"><input type="checkbox" checked={selectedRealSession?.answerSheetOpen ?? realExamAnswerSheetOpen} disabled={Boolean(selectedRealSession)} onChange={(event) => setRealExamAnswerSheetOpen(event.target.checked)} /> 답안지 열기</label>
            <p className="form-hint">선택한 설정으로 시험을 시작합니다. 답안지는 시험 중에도 펼치거나 접을 수 있습니다. 시험 중에는 정답과 해설을 표시하지 않습니다.</p>
            <div className="dialog-actions">
              <button type="button" className="btn-secondary" onClick={() => setRealExamStartEntry(null)}>취소</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedRealSession && Boolean(customTimeError)}
                onClick={() => {
                  const entry = realExamStartEntry;
                  if (!selectedRealSession && customTimeError) return;
                  const result = openExamSession(entry, { mode: "real", resumable: selectedRealSession, timeLimitMinutes: selectedRealSession?.timeLimitMinutes ?? selectedRealMinutes, showTimer: selectedRealSession?.showTimer ?? realExamShowTimer, answerSheetOpen: selectedRealSession?.answerSheetOpen ?? realExamAnswerSheetOpen, answerSheetLayout: selectedRealSession?.answerSheetLayout ?? realExamAnswerSheetLayout });
                  if (result.ok) setRealExamStartEntry(null);
                }}
              >
                {selectedRealSession ? "이어서 풀기" : "실전 모드 시작"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={Boolean(closeFlushError)} onClose={clearCloseFlushError} title="일부 변경을 저장하지 못했습니다" closeDisabled={closeFlushSaving} busy={closeFlushSaving} footer={
        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={clearCloseFlushError} disabled={closeFlushSaving}>종료 취소</button>
          <button type="button" className="btn-danger" onClick={() => void closeWithoutSaving(true)} disabled={closeFlushSaving}>저장하지 않고 종료</button>
          <button type="button" className="btn-primary" onClick={() => void retryClose.current?.()} disabled={closeFlushSaving}>다시 저장 후 종료</button>
        </div>
      }>
        <p>{closeFlushError}</p>
        <p className="form-hint">아직 종료하지 않았습니다. 다시 저장하거나 앱으로 돌아갈 수 있습니다. ‘저장하지 않고 종료’를 선택하면 미저장 변경이 사라질 수 있으며, 추가 확인 없이 종료합니다.</p>
      </Dialog>
      <OnboardingTour
        open={onboardingOpen}
        onDismiss={dismissOnboarding}
        onStartNew={() => {
          dismissOnboarding(false);
          actions.openNew();
        }}
        onImport={() => {
          dismissOnboarding(false);
          actions.openImport();
        }}
        onOpenQuestionBank={() => {
          dismissOnboarding(false);
          void appNavigationController.openQuestionBank();
        }}
      />
    </div>
    </ConceptLinkProvider>
    </SourceNavigationContext.Provider>
  );
}

/**
 * App component wrapped with SettingsProvider for context-based settings management
 */
export default function App() {
  return (
    <NotificationProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </NotificationProvider>
  );
}
