import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./features/entries/components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import ExamSessionOverlay from "./components/ExamSessionOverlay";
import SettingsModal from "./components/SettingsModal";
import { createPreUpdateBackup } from "./api";
import { syncMcpBridgeActiveContext, syncMcpBridgeActiveExamContext, syncMcpBridgeExportContext } from "./api";
import { useBridgeActiveSync } from "./hooks/useBridgeActiveSync";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import type { ChatGptMcpPreferences, EntryKind, McpExportContext } from "./types";
import type { SettingsTab } from "./components/SettingsModal";
import { entryKindIcon, entryKindName } from "./utils/appUi";
import ExamBuilderWizard from "./features/exam-builder/components/ExamBuilderWizard";
import GeneratedExamsDialog from "./features/exam-builder/components/GeneratedExamsDialog";
import { useAppUpdater } from "./features/updater/hooks/useAppUpdater";
import { useAppDialog } from "./shared/ui/AppDialogProvider";
import { GITHUB_RELEASES_URL } from "./features/updater/services/appUpdater";
import ErrorNotice from "./shared/ui/ErrorNotice";
import Dialog from "./shared/ui/Dialog";
import { useWindowCloseGuard } from "./hooks/useWindowCloseGuard";
import { useExamSessionController } from "./hooks/useExamSessionController";
import { useGeneratedExamController } from "./hooks/useGeneratedExamController";
import { useAppMaintenance } from "./hooks/useAppMaintenance";
import { useMaintenanceCoordinator } from "./hooks/useMaintenanceCoordinator";
import LearningCandidateReviewModal from "./features/learning/components/LearningCandidateReviewModal";
import { buildQuestionBankItems } from "./features/question-bank/utils/buildQuestionBankItems";
import ConceptLinkProvider from "./features/learning/components/ConceptLinkProvider";
import NotebookKnowledgeWorkspace from "./components/NotebookKnowledgeWorkspace";
import LibraryExplorer from "./features/library/components/LibraryExplorer";
import { useLibraryFolders } from "./features/library/hooks/useLibraryFolders";
import type { LibraryFolder } from "./types";
import { useAppWriteRegistrations } from "./hooks/useAppWriteRegistrations";
import { useNotebookNavigationController } from "./hooks/useNotebookNavigationController";
import { SettingsProvider, useSettingsContext } from "./contexts/SettingsContext";

function AppContent() {
  const { confirm, prompt } = useAppDialog();
  const {
    entries,
    loading,
    error,
    clearError,
    refresh,
    addEntry,
    addEntries,
    addEntriesWithImportAssetSession,
    updateEntry,
    replaceEntries,
    deleteEntry,
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
    setSettings,
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
  const [showSettings, setShowSettings] = useState(false);
  const [showLearningHub, setShowLearningHub] = useState(false);
  const [learningHubTarget, setLearningHubTarget] = useState<{ entryId: string; blockId: string } | null>(null);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showLibraryExplorer, setShowLibraryExplorer] = useState(false);
  const [learningCandidateEntryId, setLearningCandidateEntryId] = useState<string | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [questionTarget, setQuestionTarget] = useState<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>(null);
  const {
    registerWorkspaceDraftFlush,
    registerQuestionBankPreferenceFlush,
    flushTransientWrites,
  } = useAppWriteRegistrations();
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const exam = useExamSessionController({
    chatGptPreferences: settings.chatGptMcpPreferences,
    existingEntries: entries,
    addEntries,
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
    openGenerated: openGeneratedExamSession,
    close: closeExamSession,
    flush: flushExamSessionSave,
    submit: handleExamSubmit,
  } = exam;

  const generatedExamController = useGeneratedExamController({
    examPrintPreferences: settings.examPrintPreferences,
    onOpenExam: openGeneratedExamSession,
  });
  const {
    flush: flushGeneratedExams,
    reload: reloadGeneratedExams,
    setGeneratedExamsMaintenanceBlocked,
    builderOpen: showExamBuilder,
    setBuilderOpen: setShowExamBuilder,
    listOpen: showGeneratedExams,
    setListOpen: setShowGeneratedExams,
  } = generatedExamController;
  const runMaintenanceOperation = useMaintenanceCoordinator({
    flushEntries,
    flushSettings,
    flushGeneratedExams,
    setEntriesMaintenanceBlocked,
    setSettingsMaintenanceBlocked,
    setGeneratedExamsMaintenanceBlocked,
  });
  const library = useLibraryFolders();

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
  }, [selectedId, setExamStartError]);

  const requestNavigation = useNotebookNavigationController({
    activeSection,
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

  const { closeError: closeFlushError, saving: closeFlushSaving, clearCloseError: clearCloseFlushError, retryClose, closeWithoutSaving } = useWindowCloseGuard({
    activeExam: examSession,
    examSaveTimerRef,
    flushExamSession: flushExamSessionSave,
    flushEntries,
    flushGeneratedExams,
    flushSettings,
    flushImportWorkspaceDraft: flushTransientWrites,
    flushLibraryFolders: library.flush,
    confirmCloseWithoutSaving: () => confirm({
      title: "저장하지 않고 종료",
      message: "저장되지 않은 변경 내용이 사라질 수 있습니다. 정말 저장하지 않고 종료하시겠습니까?",
      confirmLabel: "저장하지 않고 종료",
      cancelLabel: "종료 취소",
    }),
  });

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
  }, [selectedId, questionTarget]);

  const handleQuestionTargetConsumed = useCallback((requestId: number) => {
    setQuestionTarget((current) => current?.requestId === requestId ? null : current);
  }, []);

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
    replaceEntries,
    deleteEntry,
    patchEntry,
    patchEntryWithImportAssetSession,
    refresh,
    setSettings,
    patchSettings,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
    refreshSettings,
    refreshGeneratedExams: reloadGeneratedExams,
    runMaintenanceOperation,
    setActiveSection,
    setSelectedId,
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
  const { syncActiveContext } = useBridgeActiveSync(settings.mcpBridge.enabled);

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
  const createLibraryFolder = useCallback(async (parentId?: string) => {
    const name = await prompt({ title: "새 폴더", message: "폴더 이름을 입력하세요." });
    if (!name?.trim()) return;
    const now = new Date().toISOString();
    await library.mutate((current) => [
      ...current,
      { id: uuidv4(), name: name.trim(), parentId, sortOrder: current.filter((folder) => folder.parentId === parentId).length, createdAt: now, updatedAt: now },
    ]);
  }, [library, prompt]);
  const renameLibraryFolder = useCallback(async (folder: LibraryFolder) => {
    const name = await prompt({ title: "폴더 이름 변경", message: "새 폴더 이름을 입력하세요.", defaultValue: folder.name });
    if (!name?.trim() || name.trim() === folder.name) return;
    await library.mutate((current) => current.map((item) => item.id === folder.id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item));
  }, [library, prompt]);
  const moveLibraryFolder = useCallback(async (folder: LibraryFolder, parentId?: string) => {
    if (folder.id === parentId) throw new Error("폴더를 자기 자신으로 이동할 수 없습니다.");
    const descendants = new Set<string>([folder.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of library.folders) if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) { descendants.add(item.id); changed = true; }
    }
    if (parentId && descendants.has(parentId)) throw new Error("폴더를 자신의 하위 폴더로 이동할 수 없습니다.");
    await library.mutate((current) => current.map((item) => item.id === folder.id ? { ...item, parentId, updatedAt: new Date().toISOString() } : item));
  }, [library]);
  const moveLibraryEntries = useCallback(async (entryIds: string[], folderId?: string) => {
    const validFolderId = folderId && library.folders.some((folder) => folder.id === folderId) ? folderId : undefined;
    await Promise.all(entryIds.map((entryId) => patchEntry(entryId, { folderId: validFolderId })));
  }, [library.folders, patchEntry]);
  const deleteLibraryFolder = useCallback(async (folder: LibraryFolder) => {
    const childFolders = library.folders.filter((item) => item.parentId === folder.id);
    const childEntries = entries.filter((entry) => entry.folderId === folder.id);
    const accepted = await confirm({
      title: "폴더 삭제",
      message: childFolders.length || childEntries.length
        ? `이 폴더의 하위 폴더 ${childFolders.length}개와 항목 ${childEntries.length}개를 루트로 이동합니다. 항목은 삭제되지 않습니다.`
        : "빈 폴더를 삭제합니다.",
      confirmLabel: "삭제",
    });
    if (!accepted) return;
    await Promise.all(childEntries.map((entry) => patchEntry(entry.id, { folderId: undefined })));
    await library.mutate((current) => current.filter((item) => item.id !== folder.id).map((item) => item.parentId === folder.id ? { ...item, parentId: undefined, updatedAt: new Date().toISOString() } : item));
  }, [confirm, entries, library, patchEntry]);

  return (
    <ConceptLinkProvider entries={entries} preferences={settings.viewPreferences} onOpenEntry={openEntryById} onOpenLearningBlock={openConceptLearningBlock}>
    <div className="app">
      <AppSidebar
        activeSection={activeSection}
        entries={entries}
        setActiveSection={setActiveSection}
        setSelectedId={setSelectedId}
        onSectionSelect={(section) => void requestNavigation({ section, entryId: null })}
        stats={stats}
        learningStats={learningStats}
        subjectOrder={subjectOrder}
        subjectFilter={subjectFilter}
        subjectCounts={subjectCounts}
        sectionEntryCount={sectionEntryCount}
        moveSubject={moveSubject}
        openNew={actions.openNew}
        openImport={actions.openImport}
        openLearningImport={() => actions.setShowLearningImportModal(true)}
        onSubjectSelect={setSubjectFilter}
        onOpenExamBuilder={() => setShowExamBuilder(true)}
        onOpenGeneratedExams={() => setShowGeneratedExams(true)}
        learningHubOpen={showLearningHub}
        onOpenLearningHub={() => {
          void (async () => {
            if (await requestNavigation({ entryId: null })) {
              setShowLearningHub(true);
              setSelectedId(null);
            }
          })();
        }}
        questionBankOpen={showQuestionBank}
        onOpenQuestionBank={() => {
          void (async () => {
            if (await requestNavigation({ entryId: null })) {
              setShowLearningHub(false);
              setShowQuestionBank(true);
              setSelectedId(null);
            }
          })();
        }}
        libraryOpen={showLibraryExplorer}
        onOpenLibrary={() => {
          void (async () => {
            if (await requestNavigation({ entryId: null })) {
              setShowLearningHub(false);
              setShowQuestionBank(false);
              setShowLibraryExplorer(true);
              setSelectedId(null);
            }
          })();
        }}
      />

      <main className="main">
        {error && <ErrorNotice message={error} onRetry={() => void refresh()} onDismiss={clearError} />}
        {examSessionsLoadError && (
          <ErrorNotice
            message={examSessionsLoadError}
            onRetry={() => void reloadExamSessions()}
            onDismiss={() => undefined}
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

        <div className="content">
          {showLibraryExplorer ? (
            <LibraryExplorer
              folders={library.folders}
              entries={entries}
              onOpenEntry={openEntryById}
              onCreateFolder={(parentId) => void createLibraryFolder(parentId)}
              onRenameFolder={(folder) => void renameLibraryFolder(folder)}
              onMoveFolder={(folder, parentId) => void moveLibraryFolder(folder, parentId)}
              onMoveEntries={(entryIds, folderId) => void moveLibraryEntries(entryIds, folderId)}
              onDeleteFolder={(folder) => void deleteLibraryFolder(folder)}
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
              {selected.entryKind === "problem_sheet" && !examSession && (() => {
                const resumable = savedExamSessions.find((item) => item.entryId === selected.id && item.status === "in_progress");
                return <>
                  <button
                    type="button"
                    className="exam-start-button"
                    onClick={() => openExamSession(selected, resumable)}
                  >
                    {resumable ? "모의고사 이어서 보기" : "모의고사 시작"}
                  </button>
                  {examStartError?.entryId === selected.id && (
                    <p className="form-error" role="alert">{examStartError.message}</p>
                  )}
                </>;
              })()}
              {selected.entryKind === "problem_sheet" && !examSession && selectedExamHistory.length > 0 && (
                <section className="exam-session-history" aria-label="모의고사 결과 이력">
                  <header><strong>모의고사 결과 이력</strong><span>{selectedExamHistory.length}회</span></header>
                  <div className="exam-session-history-list">
                    {selectedExamHistory.slice(0, 5).map((item) => (
                      <button type="button" key={item.id} onClick={() => setExamSession(item)}>
                        <span>{new Date(item.submittedAt ?? item.updatedAt).toLocaleDateString("ko-KR")}</span>
                        <strong>{item.score?.percentCorrect ?? 0}%</strong>
                        <small>{item.score?.correctCount ?? 0} / {item.score?.totalQuestions ?? item.questions.length}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <EntryDetail
              entry={selected}
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
              initialQuestionTarget={
                questionTarget?.entryId === selected.id ? questionTarget : null
              }
              onInitialQuestionTargetConsumed={handleQuestionTargetConsumed}
              viewPreferences={settings.viewPreferences}
              onViewPreferencesChange={(patch) => void patchViewPreferences(patch)}
              onOpenSettings={(tab) => openSettings(tab ?? "view")}
              chatGptPreferences={settings.chatGptMcpPreferences}
              onChatGptPreferencesChange={(patch) => patchChatGptMcpPreferences(patch)}
              onSyncChatGptContext={async (context) => {
                await syncMcpBridgeActiveContext({
                  entryId: context.entryId,
                  questionNumber: context.questionNumber,
                });
              }}
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
              onActiveContextChange={(context) => syncActiveContext(context)}
             />
            </>
          ) : (
            <div className="detail-panel empty-state">
              <span className="icon">{entryKindIcon(activeSection)}</span>
              <p>
                왼쪽 목록에서 {entryKindName(activeSection)}를 선택하거나
                <br />새 {entryKindName(activeSection)}를 추가하세요.
              </p>
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
            learningBlocks: [...(current.learningBlocks ?? []), ...blocks.filter((block) => !(current.learningBlocks ?? []).some((existing) => existing.sourceQuestionNumber === block.sourceQuestionNumber && existing.type === block.type && existing.title.trim().toLocaleLowerCase("ko-KR") === block.title.trim().toLocaleLowerCase("ko-KR")))],
          }))}
        />;
      })()}

      <AppModals
        registerWorkspaceDraftFlush={registerWorkspaceDraftFlush}
        showForm={actions.showForm}
        editingEntry={actions.editingEntry}
        handleSave={actions.handleSave}
        closeForm={actions.closeForm}
        activeSection={activeSection}
        prefilledTitle={actions.prefilledTitle}
        importedInitialData={actions.importedInitialData}
        settings={settings}
        saveTemplate={actions.saveTemplate}
        showImportModal={actions.showImportModal}
        importMode={actions.importMode}
        solutionSourceEntry={actions.solutionSourceEntry}
        importFallbackSubject={actions.importFallbackSubject}
        aiProviderStatus={aiProviderStatus}
        setLastImportTemplate={setLastImportTemplate}
        savePromptTemplate={actions.savePromptTemplate}
        closeImportModal={actions.closeImportModal}
        handleImportApply={actions.handleImportApply}
        showLearningImportModal={actions.showLearningImportModal}
        setShowLearningImportModal={actions.setShowLearningImportModal}
        handleLearningImportApply={actions.handleLearningImportApply}
        handleImportedEntriesApply={actions.handleImportedEntriesApply}
        reviewMode={actions.reviewMode}
        reviewSeed={actions.reviewSeed}
        setReviewMode={actions.setReviewMode}
        handleReview={actions.handleReview}
        setActiveSection={setActiveSection}
        setSelectedId={setSelectedId}
        handleWikiLinkClick={handleWikiLinkClick}
        existingTargets={linkableTargets}
        onOpenSettings={openSettings}
        supplementalTarget={(() => {
          if (!actions.supplementalTarget) return null;
          const entry = entries.find((item) => item.id === actions.supplementalTarget?.entryId);
          return entry ? { entry, mode: actions.supplementalTarget.mode } : null;
        })()}
        onCloseSupplementalImport={actions.closeSupplementalImport}
        applySupplementalMerge={actions.applySupplementalMerge}
        supplementalManagerEntry={actions.supplementalManagerEntryId ? entries.find((entry) => entry.id === actions.supplementalManagerEntryId) ?? null : null}
        onCloseSupplementalManager={actions.closeSupplementalManager}
        renameSupplementalResource={actions.renameSupplementalResource}
        deleteSupplementalResource={actions.deleteSupplementalResource}
        supplementalLinkTarget={actions.supplementalLinkEntryId ? entries.find((entry) => entry.id === actions.supplementalLinkEntryId) ?? null : null}
        supplementalLinkCandidates={entries.filter((entry) => entry.entryKind === "lecture" || entry.entryKind === "concept")}
        onCloseSupplementalLink={actions.closeLearningEntryLink}
        onLinkLearningEntry={actions.linkLearningEntry}
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
        onReload={generatedExamController.reload}
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
      <Dialog open={Boolean(closeFlushError)} onClose={clearCloseFlushError} title="저장 후 종료할 수 없습니다." closeDisabled={closeFlushSaving} busy={closeFlushSaving}>
        <p>{closeFlushError}</p>
        <p className="form-hint">저장되지 않은 변경을 버리지 않도록 창을 닫지 않았습니다.</p>
        <footer className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={clearCloseFlushError} disabled={closeFlushSaving}>종료 취소</button>
          <button type="button" className="btn-danger" onClick={() => void closeWithoutSaving()} disabled={closeFlushSaving}>저장하지 않고 종료</button>
          <button type="button" onClick={() => void retryClose.current?.()} disabled={closeFlushSaving}>다시 저장 후 종료</button>
        </footer>
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
