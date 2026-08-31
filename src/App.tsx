import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar, { type SidebarDestination } from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./features/entries/components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import ExamSessionOverlay from "./components/ExamSessionOverlay";
import SettingsModal from "./components/SettingsModal";
import { createPreUpdateBackup, deleteImage, saveImageFiles } from "./api";
import { syncMcpBridgeActiveExamContext, syncMcpBridgeExportContext } from "./api";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import type { ChatGptMcpPreferences, EntryKind, LearningBlock, McpExportContext, PendingDeletion } from "./types";
import type { SettingsTab } from "./components/SettingsModal";
import { entryKindIcon, entryKindName } from "./utils/appUi";
import { collectAllImageReferences, getEntryTitle } from "./utils/entry";
import ExamBuilderWizard from "./features/exam-builder/components/ExamBuilderWizard";
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
import { renderStructuredQuestionsCompatibilityText } from "./utils/entryQuestions";
import { useUiShellPreferences } from "./hooks/useUiShellPreferences";
import { useAppModalController } from "./hooks/useAppModalController";
import { getRemainingExamSeconds } from "./features/exam/services/realExam";
import { getStorageBackendKind } from "./services/storageBackend";
import { useLibraryFolderActions } from "./features/library/hooks/useLibraryFolderActions";
import { useReviewSessions } from "./hooks/useReviewSessions";
import { useNavigationHistory } from "./hooks/useNavigationHistory";
import { canResumeReviewSession } from "./features/review/storage/reviewSessionIdentity";
import Toast from "./shared/ui/Toast";

export function appendUniqueLearningBlocks(existingBlocks: LearningBlock[], newBlocks: LearningBlock[]): LearningBlock[] {
  return [...existingBlocks, ...newBlocks.filter((block) => !existingBlocks.some((existing) => (
    normalizeQuestionNumber(existing.sourceQuestionNumber) === normalizeQuestionNumber(block.sourceQuestionNumber)
      && existing.type === block.type
      && existing.title.trim().toLocaleLowerCase("ko-KR") === block.title.trim().toLocaleLowerCase("ko-KR")
  )))];
}

function AppContent() {
  const storageBackendKind = getStorageBackendKind();
  const { confirm, prompt } = useAppDialog();
  const {
    entries,
    loading,
    error,
    clearError,
    refresh,
    addEntry,
    addEntries,
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
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  useEffect(() => {
    if (!pendingDeletion) return undefined;
    const remaining = Math.max(0, Date.parse(pendingDeletion.finalizeAfter) - Date.now());
    const timer = window.setTimeout(() => setPendingDeletion((current) => current?.id === pendingDeletion.id ? null : current), remaining);
    return () => window.clearTimeout(timer);
  }, [pendingDeletion]);
  const parsedCustomMinutes = Number(realExamCustomMinutes);
  const customTimeError = realExamTimePreset === "custom" && (!Number.isInteger(parsedCustomMinutes) || parsedCustomMinutes < 1 || parsedCustomMinutes > 720)
    ? "1~720분 사이의 정수를 입력하세요."
    : null;
  const selectedRealMinutes = realExamTimePreset === "custom" ? parsedCustomMinutes : Number(realExamTimePreset);
  const questionRenderPersistingRef = useRef(false);
  const shell = useUiShellPreferences();
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
    savedSessions: savedExamSessions,
    activeGeneratedExam,
    open: openExamSession,
    close: closeExamSession,
    discardActiveSessionAfterRestore,
    flush: flushExamSessionSave,
    submit: handleExamSubmit,
  } = examWorkspace;

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
  const persistence = usePersistenceCoordinator({
    activeExam: examSession,
    examSaveTimerRef,
    examSessionRef,
    flushExamSession: flushExamSessionSave,
    flushEntries,
    flushSettings,
    flushGeneratedExams,
    flushImportWorkspaceDraft: flushTransientWrites,
    flushLibraryFolders: library.flush,
    flushGptSolutionDrafts: gptSolutionDrafts.flush,
    flushReviewSessions: reviewSessions.flush,
    flushTransientWrites,
    setTransientWritesMaintenanceBlocked,
    setEntriesMaintenanceBlocked,
    setSettingsMaintenanceBlocked,
    setGeneratedExamsMaintenanceBlocked,
    setLibraryMaintenanceBlocked: library.setMaintenanceBlocked,
    setGptSolutionDraftsMaintenanceBlocked: gptSolutionDrafts.setMaintenanceBlocked,
    confirmCloseWithoutSaving: () => confirm({
      title: "저장하지 않고 종료",
      message: "저장되지 않은 변경 내용이 사라질 수 있습니다. 정말 저장하지 않고 종료하시겠습니까?",
      confirmLabel: "저장하지 않고 종료",
      cancelLabel: "종료 취소",
    }),
  });
  const { runMaintenanceOperation } = persistence;

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
    difficultyFilter,
    setDifficultyFilter,
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

  useEffect(() => {
    setExamStartError((current) => current?.entryId === selectedId ? current : null);
  }, [selectedId, setExamStartError, setQuestionTarget]);

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
      (entry ? activeSection !== entry.entryKind : false);
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
    discardActiveSessionAfterRestore,
    refreshGeneratedExams: reloadGeneratedExams,
    refreshLibraryFolders: library.refresh,
    refreshGptSolutionDrafts: gptSolutionDrafts.reload,
    runMaintenanceOperation,
    setActiveSection,
    setSelectedId,
    onPendingDeletion: (pending) => setPendingDeletion(pending),
  });

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

  const openSettings = (tab?: SettingsTab) => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  };

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
    setRealExamAnswerSheetOpen(settings.examPreferences.realExamAnswerSheetOpen ?? true);
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
  useNavigationHistory({
    snapshot: {
      destination: sidebarDestination.type,
      section: activeSection,
      entryId: selectedId,
      search,
      filters: { subject: subjectFilter, list: listFilter, difficulty: difficultyScoreFilter },
      sort: sortKey,
    },
    restore: (snapshot) => {
      setShowLearningHub(snapshot.destination === "learning_hub");
      setShowQuestionBank(snapshot.destination === "question_bank");
      setShowLibraryExplorer(snapshot.destination === "library");
      if (snapshot.destination === "section" && snapshot.section) setActiveSection(snapshot.section as EntryKind);
      setSelectedId(snapshot.entryId ?? null);
      setSearch(snapshot.search ?? "");
    },
  });

  return (
    <ConceptLinkProvider entries={entries} preferences={settings.viewPreferences} onOpenEntry={openEntryById} onOpenLearningBlock={openConceptLearningBlock}>
    <div className={`app app-shell${shell.appSidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}${shell.entryPaneCollapsed ? " app-shell--entry-collapsed" : ""}`}>
      {pendingDeletion && <div className="app-undo-snackbar" role="status"><Toast tone="info"><span>{getEntryTitle(pendingDeletion.entry)}을 삭제했습니다.</span><button type="button" onClick={() => void restorePendingDeletion(pendingDeletion).then(() => setPendingDeletion(null))}>실행 취소</button></Toast></div>}
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
        shell={{ collapsed: shell.appSidebarCollapsed, onCollapsedChange: shell.setAppSidebarCollapsed }}
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
          difficultyFilter={difficultyFilter}
          setDifficultyFilter={setDifficultyFilter}
          difficultyScoreFilter={difficultyScoreFilter}
          setDifficultyScoreFilter={setDifficultyScoreFilter}
          listFilter={listFilter}
          setListFilter={setListFilter}
          todayReviewCount={todayReviewCount}
          startReview={actions.startReview}
          onOpenSettings={() => openSettings()}
        />}

        {!showLearningHub && !showQuestionBank && !showLibraryExplorer && activeSection === "problem_sheet" && (
          <nav className="problem-sheet-library-tabs" aria-label="시험지함 보기">
            <button type="button" className="is-active" aria-current="page">시험지</button>
            <button type="button" onClick={() => setShowGeneratedExams(true)}>생성한 모의고사</button>
          </nav>
        )}

        <div className="content">
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
              entries={entries}
              learningHubTarget={learningHubTarget}
              questionBankPreferences={settings.questionBankPreferences}
              patchQuestionBankPreferences={patchQuestionBankPreferences}
              registerQuestionBankPreferenceFlush={registerQuestionBankPreferenceFlush}
              patchEntry={patchEntry}
              openCandidateReview={setLearningCandidateEntryId}
              aiProviderStatus={aiProviderStatus}
              onOpenAiSettings={() => openSettings("gpt-mcp")}
              openEntry={(entry, questionNumber) => void requestNavigation({
                  section: entry.entryKind,
                  entryId: entry.id,
                  question: questionNumber ? { entryId: entry.id, questionNumber } : undefined,
                })}
            />
          ) : showLearningHub ? (
            <NotebookKnowledgeWorkspace
              mode="learning-hub"
              entries={entries}
              learningHubTarget={learningHubTarget}
              questionBankPreferences={settings.questionBankPreferences}
              patchQuestionBankPreferences={patchQuestionBankPreferences}
              registerQuestionBankPreferenceFlush={registerQuestionBankPreferenceFlush}
              patchEntry={patchEntry}
              openCandidateReview={setLearningCandidateEntryId}
              aiProviderStatus={aiProviderStatus}
              onOpenAiSettings={() => openSettings("gpt-mcp")}
              openEntry={(entry, questionNumber) => void requestNavigation({
                  section: entry.entryKind,
                  entryId: entry.id,
                  question: questionNumber ? { entryId: entry.id, questionNumber } : undefined,
                })}
            />
          ) : <>
          <EntryListPane
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
            collapsed={shell.entryPaneCollapsed}
            width={shell.entryPaneWidth}
            onCollapsedChange={shell.setEntryPaneCollapsed}
            onWidthChange={shell.setEntryPaneWidth}
          />

          {examSession ? (
            <ExamSessionOverlay
              session={examSession}
              generated={Boolean(activeGeneratedExam)}
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
              onSubmittingChange={setExamSubmitting}
              onSubmit={handleExamSubmit}
              onClose={closeExamSession}
              submitting={examSubmitting}
              saving={examSaving}
              saveError={examSaveError}
              onRetrySave={() => {
                const current = examSessionRef.current;
                if (current) void flushExamSessionSave(current);
              }}
            />
          ) : selected ? (
            <>
              {examStartError?.entryId === selected.id && <p className="form-error" role="alert">{examStartError.message}</p>}
              {selected.entryKind === "problem_sheet" && !examSession && selectedExamHistory.length > 0 && <button type="button" className="exam-history-trigger btn-secondary" onClick={() => setExamHistoryOpen(true)}>이력 <span>{selectedExamHistory.length}</span></button>}
              {examHistoryOpen && <Dialog open size="md" ariaLabel="모의고사 결과 이력" onClose={() => setExamHistoryOpen(false)}><header className="modal-head"><h2>모의고사 결과 이력</h2></header><div className="exam-session-history-list">{selectedExamHistory.map((item) => <button type="button" key={item.id} onClick={() => { setExamHistoryOpen(false); setExamSession(item); }}><span>{new Date(item.submittedAt ?? item.updatedAt).toLocaleDateString("ko-KR")}</span><strong>{item.score?.percentCorrect ?? 0}%</strong><small>{item.score?.correctCount ?? 0} / {item.score?.totalQuestions ?? item.questions.length}</small></button>)}</div></Dialog>}
              <EntryDetail
              entry={selected}
              onStartExam={selected.entryKind === "problem_sheet" ? () => {
                openExamSession(selected, { mode: "practice", resumable: selectedPracticeSession });
              } : undefined}
              onStartRealExam={selected.entryKind === "problem_sheet" ? () => {
                openNewRealExamDialog();
              } : undefined}
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
              onExamPrintPreferencesChange={(patch) => void patchExamPrintPreferences(patch)}
              onSyncExportContext={async (payload) => {
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
              questionBankItems={buildQuestionBankItems(entries)}
              onSimilarQuestionLinksChange={(entry, links) => patchEntry(entry.id, { similarQuestionLinks: links })}
               onApplyGptSolutionRoundtrip={(entry, patch) => patchEntry(entry.id, patch)}
               gptSolutionDraftStore={gptSolutionDrafts}
             />
            </>
          ) : (
            <div className="detail-panel empty-state">
              <span className="icon">{entryKindIcon(activeSection)}</span>
              <p>
                왼쪽 목록에서 {entryKindName(activeSection)}를 선택하거나
                <br />새 {entryKindName(activeSection)}를 추가하세요.
              </p>
              <div className="empty-state-actions">
                {activeSection === "problem_sheet" ? <button type="button" className="btn-primary" onClick={actions.openImport}>시험지 가져오기</button> : activeSection === "lecture" ? <button type="button" className="btn-primary" onClick={() => actions.setShowLearningImportModal(true)}>특강 가져오기</button> : activeSection === "concept" ? <button type="button" className="btn-primary" onClick={actions.openNew}>개념 만들기</button> : <button type="button" className="btn-primary" onClick={actions.openNew}>첫 오답 추가</button>}
              </div>
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
        importFlow={{ show: actions.showImportModal, mode: actions.importMode, solutionSourceEntry: actions.solutionSourceEntry, fallbackSubject: actions.importFallbackSubject, close: actions.closeImportModal, apply: actions.handleImportApply, applyEntries: actions.handleImportedEntriesApply }}
        learningImport={{ show: actions.showLearningImportModal, setShow: actions.setShowLearningImportModal, apply: actions.handleLearningImportApply }}
        review={{
          mode: actions.reviewMode,
          seed: actions.reviewSeed,
          setMode: actions.setReviewMode,
          handle: actions.handleReview,
          session: actions.reviewMode
            ? reviewSessions.sessions.find((candidate) => canResumeReviewSession(candidate, actions.reviewMode!, actions.reviewSeed))
            : undefined,
          saveSession: reviewSessions.save,
        }}
        navigation={{ setActiveSection, setSelectedId, handleWikiLinkClick, existingTargets: linkableTargets }}
        supplemental={{ target: (() => {
          if (!actions.supplementalTarget) return null;
          const entry = entries.find((item) => item.id === actions.supplementalTarget?.entryId);
          return entry ? { entry, mode: actions.supplementalTarget.mode } : null;
        })(), closeImport: actions.closeSupplementalImport, applyMerge: actions.applySupplementalMerge, managerEntry: actions.supplementalManagerEntryId ? entries.find((entry) => entry.id === actions.supplementalManagerEntryId) ?? null : null, closeManager: actions.closeSupplementalManager, rename: actions.renameSupplementalResource, remove: actions.deleteSupplementalResource, linkTarget: actions.supplementalLinkEntryId ? entries.find((entry) => entry.id === actions.supplementalLinkEntryId) ?? null : null, linkCandidates: entries.filter((entry) => entry.entryKind === "lecture" || entry.entryKind === "concept"), closeLink: actions.closeLearningEntryLink, link: actions.linkLearningEntry }}
      />
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
        open={showGeneratedExams}
        closing={generatedExamController.closing}
        closeError={generatedExamController.closeError}
        loading={generatedExamController.loading}
        loadError={generatedExamController.loadError}
        saving={generatedExamController.saving}
        saveError={generatedExamController.error}
        hasRetryableChange={generatedExamController.hasRetryableChange}
        exams={generatedExamController.exams}
        onClose={generatedExamController.closeList}
        onReload={async () => { await generatedExamController.reload(); }}
        onRetry={generatedExamController.retry}
        onDiscardFailure={generatedExamController.discardFailedChange}
        onOpen={generatedExamController.openExam}
        onDelete={generatedExamController.remove}
        onPrint={generatedExamController.print}
      />
      {showSettings && (
        <SettingsModal
          initialTab={settingsInitialTab}
          dataActions={{
            integrityReport: actions.integrityReport,
            backup: actions.handleBackup,
            restore: actions.handleRestore,
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
            <p>문항 {realExamStartEntry.structuredQuestions?.length ?? realExamStartEntry.question.trim().split(/\n+/).filter(Boolean).length}개</p>
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
            <p className="form-hint">타이머와 답안지를 함께 엽니다. 시험 중에는 정답과 해설을 표시하지 않습니다.</p>
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
      <Dialog open={Boolean(closeFlushError)} onClose={clearCloseFlushError} title="저장 후 종료할 수 없습니다." closeDisabled={closeFlushSaving} busy={closeFlushSaving} footer={
        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={clearCloseFlushError} disabled={closeFlushSaving}>종료 취소</button>
          <button type="button" className="btn-danger" onClick={() => void closeWithoutSaving()} disabled={closeFlushSaving}>저장하지 않고 종료</button>
          <button type="button" onClick={() => void retryClose.current?.()} disabled={closeFlushSaving}>다시 저장 후 종료</button>
        </div>
      }>
        <p>{closeFlushError}</p>
        <p className="form-hint">저장되지 않은 변경을 버리지 않도록 창을 닫지 않았습니다.</p>
      </Dialog>
    </div>
    </ConceptLinkProvider>
  );
}

/**
 * App component wrapped with SettingsProvider for context-based settings management
 */
export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
