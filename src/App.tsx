import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import ExamSessionOverlay from "./components/ExamSessionOverlay";
import SettingsModal from "./components/SettingsModal";
import { createPreUpdateBackup } from "./api";
import { syncMcpBridgeActiveContext, syncMcpBridgeActiveExamContext, syncMcpBridgeExportContext } from "./api";
import { useBridgeActiveSync } from "./hooks/useBridgeActiveSync";
import { useMcpBridgeSettings } from "./hooks/useMcpBridgeSettings";
import { useAiProviderSettings } from "./hooks/useAiProviderSettings";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSettings } from "./hooks/useSettings";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import { useTheme } from "./hooks/useTheme";
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

export default function App() {
  const { confirm } = useAppDialog();
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
  const {
    settings,
    settingsError,
    settingsSaveState,
    setSettings,
    patchSettings,
    patchViewPreferences,
    patchExamPreferences,
    patchImagePreferences,
    patchGptMcpPreferences,
    patchChatGptMcpPreferences,
    patchUpdatePreferences,
    patchQuestionBankPreferences,
    patchExamPrintPreferences,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
    setLastImportTemplate,
    refreshSettings,
    clearSettingsError,
    retrySettingsSave,
    flushSettings,
    setSettingsMaintenanceBlocked,
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const { subjectOrder, moveSubject } = useSubjectOrder();
  const [showSettings, setShowSettings] = useState(false);
  const [showLearningHub, setShowLearningHub] = useState(false);
  const [learningHubTarget, setLearningHubTarget] = useState<{ entryId: string; blockId: string } | null>(null);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [learningCandidateEntryId, setLearningCandidateEntryId] = useState<string | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [questionTarget, setQuestionTarget] = useState<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>(null);
  const workspaceDraftFlushRef = useRef<(() => Promise<void>) | null>(null);
  const questionBankPreferenceFlushRef = useRef<(() => Promise<void>) | null>(null);
  const registerQuestionBankPreferenceFlush = useCallback((flush: (() => Promise<void>) | null) => {
    questionBankPreferenceFlushRef.current = flush;
  }, []);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const exam = useExamSessionController({
    chatGptPreferences: settings.chatGptMcpPreferences,
    addEntry,
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
    savedSessions: savedExamSessions,
    activeGeneratedExam,
    open: openExamSession,
    openGenerated: openGeneratedExamSession,
    close: closeExamSession,
    flush: flushExamSessionSave,
    submit: handleExamSubmit,
  } = exam;

  const registerWorkspaceDraftFlush = useCallback((flush: (() => Promise<void>) | null) => {
    workspaceDraftFlushRef.current = flush;
  }, []);

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

  const requestNavigation = useCallback(async (target: {
    section?: EntryKind;
    entryId?: string | null;
    question?: { entryId: string; questionNumber: string };
  }): Promise<boolean> => {
    if (examSubmitting) {
      setExamSaveError("시험 제출 중에는 이동할 수 없습니다.");
      return false;
    }
    if (examSession) {
      const isSameEntry = target.entryId === undefined || target.entryId === examSession.entryId;
      const isSameSection = target.section === undefined || target.section === activeSection;
      if (!isSameEntry || !isSameSection) {
        const closed = await closeExamSession();
        if (!closed) return false;
      }
    }
    if (target.section) setActiveSection(target.section);
    setShowLearningHub(false);
    setShowQuestionBank(false);
    if (target.entryId !== undefined) setSelectedId(target.entryId);
    if (target.question) {
      setQuestionTarget({ ...target.question, requestId: Date.now() });
    }
    return true;
  }, [activeSection, closeExamSession, examSession, examSubmitting, setActiveSection, setExamSaveError, setSelectedId]);

  const { closeError: closeFlushError, saving: closeFlushSaving, clearCloseError: clearCloseFlushError, retryClose } = useWindowCloseGuard({
    activeExam: examSession,
    examSaveTimerRef,
    flushExamSession: flushExamSessionSave,
    flushEntries,
    flushGeneratedExams,
    flushSettings,
    flushImportWorkspaceDraft: async () => {
      await workspaceDraftFlushRef.current?.();
      await questionBankPreferenceFlushRef.current?.();
    },
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

  const {
    aiProviderStatus,
    aiProviderStatusLoading,
    aiProviderStatusError,
    aiProviderKeyInput,
    setAiProviderKeyInput,
    updateAiProviderConfig,
    storeAiProviderKey,
    removeAiProviderKey,
  } = useAiProviderSettings({
    aiProvider: settings.aiProvider,
    refreshSettings,
    setSettingsMessage: actions.setSettingsMessage,
  });
  const setSettingsMessage = actions.setSettingsMessage;
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
  const mcpBridge = useMcpBridgeSettings({
    mcpBridge: settings.mcpBridge,
    persistMcpBridge: async (next) => patchSettings({ mcpBridge: next }),
    setSettingsMessage,
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
      />

      <main className="main">
        {error && <ErrorNotice message={error} onRetry={() => void refresh()} onDismiss={clearError} />}
        {availableUpdate && settings.updatePreferences.notificationsEnabled && availableUpdate.latestVersion !== settings.updatePreferences.skippedVersion && availableUpdate.latestVersion !== dismissedUpdateVersion && !examSession && (
          <div className="app-update-banner" role="status">
            <span>새 버전 {availableUpdate.latestVersion}을 사용할 수 있습니다.</span>
            <button type="button" onClick={() => openSettings("updates")}>변경사항</button>
            <button type="button" onClick={() => void updater.installUpdate()}>업데이트</button>
            <button type="button" onClick={() => setDismissedUpdateVersion(availableUpdate.latestVersion)}>나중에</button>
            <button type="button" onClick={() => void patchSettings({ updatePreferences: { ...settings.updatePreferences, skippedVersion: availableUpdate.latestVersion } })}>이번 버전 건너뛰기</button>
          </div>
        )}
        {!showLearningHub && !showQuestionBank && <AppToolbar
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
          {showQuestionBank ? (
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
                const status = await mcpBridge.testMcpBridgeConnection();
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
                const status = await mcpBridge.testMcpBridgeConnection();
                if (status.status !== "listening" && status.status !== "connected") {
                  throw new Error("로컬 MCP 브리지 연결 테스트에 실패했습니다.");
                }
              }}
              remoteMcpConfigured={Boolean(settings.chatGptMcpPreferences.remoteBaseUrl)}
              questionBankItems={buildQuestionBankItems(entries)}
              onSimilarQuestionLinksChange={(entry, links) => patchEntry(entry.id, { similarQuestionLinks: links })}
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
          settings={settings}
          settingsError={settingsError}
          settingsSaveState={settingsSaveState}
          retrySettingsSave={retrySettingsSave}
          settingsMessage={actions.settingsMessage}
          clearSettingsError={clearSettingsError}
          setSettingsMessage={actions.setSettingsMessage}
          patchSettings={patchSettings}
          patchViewPreferences={patchViewPreferences}
          patchExamPreferences={patchExamPreferences}
          patchImagePreferences={patchImagePreferences}
          patchGptMcpPreferences={patchGptMcpPreferences}
          theme={theme}
          setTheme={setTheme}
          aiProviderStatus={aiProviderStatus}
          aiProviderStatusLoading={aiProviderStatusLoading}
          aiProviderStatusError={aiProviderStatusError}
          aiProviderKeyInput={aiProviderKeyInput}
          setAiProviderKeyInput={setAiProviderKeyInput}
          updateAiProviderConfig={updateAiProviderConfig}
          storeAiProviderKey={storeAiProviderKey}
          removeAiProviderKey={removeAiProviderKey}
          integrityReport={actions.integrityReport}
          saveTemplate={actions.saveTemplate}
          deleteTemplate={actions.deleteTemplate}
          savePromptTemplate={actions.savePromptTemplate}
          saveMemoTemplate={actions.saveMemoTemplate}
          deletePromptTemplate={actions.deletePromptTemplate}
          deleteMemoTemplate={actions.deleteMemoTemplate}
          handleBackup={actions.handleBackup}
          handleRestore={actions.handleRestore}
          runIntegrity={actions.runIntegrity}
          handleCleanupOrphans={actions.handleCleanupOrphans}
          mcpBridgeSettings={mcpBridge.mcpBridgeSettings}
          mcpBridgeStatus={mcpBridge.mcpBridgeStatus}
          mcpBridgePortInput={mcpBridge.mcpBridgePortInput}
          setMcpBridgePortInput={mcpBridge.setMcpBridgePortInput}
          updateMcpBridgeConfig={mcpBridge.updateMcpBridgeConfig}
          applyMcpBridgePort={mcpBridge.applyMcpBridgePort}
          testMcpBridgeConnection={async () => { await mcpBridge.testMcpBridgeConnection(); }}
          createMcpBridgePairing={mcpBridge.createPairing}
          rotateMcpBridgeCredential={mcpBridge.rotateCredential}
          disconnectMcpBridgeClients={mcpBridge.disconnectClients}
          mcpBridgePairingSession={mcpBridge.pairingSession}
          isMcpBridgePairingPending={mcpBridge.isMcpBridgePairingPending}
          isMcpBridgeConnectionTesting={mcpBridge.isMcpBridgeConnectionTesting}
          isMcpBridgeBrowserBlocked={mcpBridge.isMcpBridgeBrowserBlocked}
          onPatchChatGptMcpPreferences={patchChatGptMcpPreferences}
          updateState={updater.state}
          onCheckForUpdate={async () => { await updater.checkForUpdate({ ignoreSkipped: true }); }}
          onInstallUpdate={async () => { await updater.installUpdate(); }}
          onRestartAfterUpdate={async () => { await updater.restart(); }}
          onOpenReleasePage={() => { window.open(GITHUB_RELEASES_URL, "_blank", "noopener,noreferrer"); }}
          onPatchUpdatePreferences={patchUpdatePreferences}
          initialTab={settingsInitialTab}
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
          <button type="button" onClick={() => void retryClose.current?.()} disabled={closeFlushSaving}>다시 저장 후 종료</button>
        </footer>
      </Dialog>
    </div>
    </ConceptLinkProvider>
  );
}
