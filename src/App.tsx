import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import SettingsModal from "./components/SettingsModal";
import { createAutoBackup } from "./api";
import { loadExamSessions, saveExamSessions, syncMcpBridgeActiveExamContext } from "./api";
import { useBridgeActiveSync } from "./hooks/useBridgeActiveSync";
import { useMcpBridgeSettings } from "./hooks/useMcpBridgeSettings";
import { useAiProviderSettings } from "./hooks/useAiProviderSettings";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSettings } from "./hooks/useSettings";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import { useTheme } from "./hooks/useTheme";
import type { EntryKind } from "./types";
import { downloadMarkdown, openPrintableEntry } from "./utils/exportEntry";
import { entryKindIcon, entryKindName } from "./utils/appUi";
import ExamSessionView from "./features/exam/components/ExamSessionView";
import { createExamSession } from "./features/exam/services/examSession";
import { scoreExamSession } from "./features/exam/services/examScoring";
import { createEmptyEntryDraft, normalizeEntryDraftForSave } from "./features/entries/model/entryDraft";
import type { ExamSession } from "./types";

export default function App() {
  const {
    entries,
    loading,
    error,
    clearError,
    refresh,
    addEntry,
    addEntries,
    updateEntry,
    replaceEntries,
    deleteEntry,
    toggleMastered,
    toggleDifficult,
    patchEntry,
  } = useEntries();
  const {
    settings,
    settingsError,
    setSettings,
    patchSettings,
    refreshSettings,
    clearSettingsError,
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const { subjectOrder, moveSubject } = useSubjectOrder();
  const [showSettings, setShowSettings] = useState(false);
  const [questionTarget, setQuestionTarget] = useState<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>(null);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [savedExamSessions, setSavedExamSessions] = useState<ExamSession[]>([]);
  const savedExamSessionsRef = useRef<ExamSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadExamSessions().then((sessions) => {
      if (!cancelled) {
        const normalized = Array.isArray(sessions) ? sessions : [];
        savedExamSessionsRef.current = normalized;
        setSavedExamSessions(normalized);
      }
    }).catch(() => {
      if (!cancelled) setSavedExamSessions([]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!examSession) {
      void syncMcpBridgeActiveExamContext({ sessionId: null, questionId: null, questionIndex: null, userResponse: "", scratchNote: "", markedForReview: false, submitted: false, updatedAt: new Date().toISOString() });
      return;
    }
    const current = examSession.questions[examSession.currentQuestionIndex];
    const response = current ? examSession.responses.find((item) => item.questionNumber === current.questionNumber) : undefined;
    const context = { sessionId: examSession.id, questionId: current?.id ?? null, questionIndex: examSession.currentQuestionIndex, userResponse: response?.response ?? "", scratchNote: response?.scratchNote ?? "", markedForReview: response?.markedForReview ?? false, submitted: examSession.status === "submitted", updatedAt: examSession.updatedAt };
    const timer = window.setTimeout(() => { void syncMcpBridgeActiveExamContext(context); }, 350);
    return () => window.clearTimeout(timer);
  }, [examSession]);

  useEffect(() => {
    if (!examSession) return;
    const timer = window.setTimeout(() => {
      const nextSessions = [...savedExamSessionsRef.current.filter((item) => item.id !== examSession.id), examSession];
      savedExamSessionsRef.current = nextSessions;
      setSavedExamSessions(nextSessions);
      void saveExamSessions(nextSessions);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [examSession]);

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

  const actions = useAppActions({
    entries,
    settings,
    selected,
    activeSection,
    subjectFilter,
    addEntry,
    addEntries,
    updateEntry,
    replaceEntries,
    deleteEntry,
    patchEntry,
    refresh,
    setSettings,
    refreshSettings,
    setActiveSection,
    setSelectedId,
  });

  const {
    aiProviderStatus,
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
  const mcpBridge = useMcpBridgeSettings({
    mcpBridge: settings.mcpBridge,
    persistMcpBridge: async (next) => patchSettings({ mcpBridge: next }),
    setSettingsMessage,
  });
  const { syncActiveContext } = useBridgeActiveSync(settings.mcpBridge.enabled);

  useEffect(() => {
    if (!isTauri() || !settings.autoBackup.enabled) return;
    const lastBackup = settings.autoBackup.lastBackupAt
      ? new Date(settings.autoBackup.lastBackupAt)
      : null;
    const today = new Date().toDateString();
    if (lastBackup?.toDateString() === today) return;

    let cancelled = false;
    createAutoBackup()
      .then(async () => {
        if (cancelled) return;
        await patchSettings({ autoBackup: { ...settings.autoBackup, lastBackupAt: new Date().toISOString() } });
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsMessage(
            "자동 백업에 실패했습니다. 설정에서 수동 백업을 실행해 주세요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [settings, patchSettings, setSettingsMessage]);

  const selectEntry = (entryId: string, section?: EntryKind) => {
    if (section) setActiveSection(section);
    setSelectedId(entryId);
  };

  const openImportantQuestion = (entryId: string, questionNumber: string) => {
    const found = entries.find((entry) => entry.id === entryId);
    if (!found) return;
    setActiveSection(found.entryKind);
    setSelectedId(entryId);
    setQuestionTarget({
      entryId,
      questionNumber,
      requestId: Date.now(),
    });
  };

  const handleWikiLinkClick = (target: string) => {
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

    const confirmCreate = confirm(
      `"${target}" 항목을 찾을 수 없습니다. 이 제목으로 새 항목을 생성할까요?`,
    );
    if (confirmCreate) {
      actions.openNewWithTitle(target);
    }
  };

  const openEntryById = (entryId: string) => {
    const found = entries.find((entry) => entry.id === entryId);
    if (found) selectEntry(entryId, found.entryKind);
  };

  const handleExamSubmit = async (session: ExamSession) => {
    const score = scoreExamSession(session);
    const submitted = {
      ...session,
      status: "submitted" as const,
      submittedAt: new Date().toISOString(),
      score,
    };
    setExamSession(submitted);

    const wrongQuestions = submitted.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return result?.hasResponse && !result.correct;
    });
    for (const question of wrongQuestions) {
      const response = submitted.responses.find((item) => item.questionNumber === question.questionNumber);
      const draft = createEmptyEntryDraft("wrong_answer");
      await addEntry(normalizeEntryDraftForSave({
        ...draft,
        subject: submitted.subject,
        title: `${submitted.title} · ${question.questionNumber}번 오답`,
        question: [question.question, ...question.choices].filter(Boolean).join("\n"),
        questionImages: question.questionImages,
        figures: question.figures,
        correctAnswer: question.correctAnswer ?? "",
        memo: [
          `모의고사: ${submitted.title}`,
          response?.scratchNote?.trim(),
        ].filter(Boolean).join("\n"),
        explanationParts: question.explanation
          ? [{ id: crypto.randomUUID(), text: question.explanation, images: [] }]
          : draft.explanationParts,
        tags: [submitted.subject, "모의고사", "채점 오답"],
      }));
    }
  };

  const selectedExamHistory = selected
    ? savedExamSessions
      .filter((item) => item.entryId === selected.id && item.status === "submitted")
      .sort((a, b) => (b.submittedAt ?? b.updatedAt).localeCompare(a.submittedAt ?? a.updatedAt))
    : [];

  return (
    <div className="app">
      <AppSidebar
        activeSection={activeSection}
        entries={entries}
        setActiveSection={setActiveSection}
        setSelectedId={setSelectedId}
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
      />

      <main className="main">
        {error && (
          <div className="app-error-banner" role="alert">
            <span>{error}</span>
            <div className="app-error-actions">
              <button type="button" onClick={refresh}>
                다시 시도
              </button>
              <button type="button" onClick={clearError} aria-label="오류 닫기">
                닫기
              </button>
            </div>
          </div>
        )}
        <AppToolbar
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
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="content">
          <EntryListPane
            activeSection={activeSection}
            loading={loading}
            entries={entries}
            filtered={filtered}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            quickConceptSubject={actions.quickConceptSubject}
            onQuickConceptCreate={actions.handleQuickConceptCreate}
            onOpenImportantQuestion={openImportantQuestion}
            onStartImportantReview={() => actions.startReview("important")}
          />

          {selected ? (
            <>
              {selected.entryKind === "problem_sheet" && !examSession && (() => {
                const resumable = savedExamSessions.find((item) => item.entryId === selected.id && item.status === "in_progress");
                return <button
                  type="button"
                  className="exam-start-button"
                  onClick={() => setExamSession(resumable ?? createExamSession(selected))}
                >
                  {resumable ? "모의고사 이어서 보기" : "모의고사 시작"}
                </button>;
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
              {examSession ? (
                <div className="exam-session-overlay">
                  <button type="button" onClick={() => setExamSession(null)}>시험 닫기</button>
                  <ExamSessionView
                    session={examSession}
                    onChange={setExamSession}
                    onSubmit={handleExamSubmit}
                  />
                </div>
              ) : <EntryDetail
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
              onExportMarkdown={() => downloadMarkdown(selected)}
              onOpenPrint={() => openPrintableEntry(selected)}
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
              onActiveContextChange={(context) => syncActiveContext(context)}
            />}
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
        </div>
      </main>

      <AppModals
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
        setSettings={setSettings}
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
      />
      {showSettings && (
        <SettingsModal
          settings={settings}
          settingsError={settingsError}
          settingsMessage={actions.settingsMessage}
          clearSettingsError={clearSettingsError}
          setSettingsMessage={actions.setSettingsMessage}
          setSettings={setSettings}
          theme={theme}
          setTheme={setTheme}
          aiProviderStatus={aiProviderStatus}
          aiProviderKeyInput={aiProviderKeyInput}
          setAiProviderKeyInput={setAiProviderKeyInput}
          updateAiProviderConfig={updateAiProviderConfig}
          storeAiProviderKey={storeAiProviderKey}
          removeAiProviderKey={removeAiProviderKey}
          integrityReport={actions.integrityReport}
          saveTemplate={actions.saveTemplate}
          deleteTemplate={actions.deleteTemplate}
          savePromptTemplate={actions.savePromptTemplate}
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
          testMcpBridgeConnection={mcpBridge.testMcpBridgeConnection}
          createMcpBridgePairing={mcpBridge.createPairing}
          rotateMcpBridgeCredential={mcpBridge.rotateCredential}
          disconnectMcpBridgeClients={mcpBridge.disconnectClients}
          mcpBridgePairingSession={mcpBridge.pairingSession}
          isMcpBridgePairingPending={mcpBridge.isMcpBridgePairingPending}
          isMcpBridgeConnectionTesting={mcpBridge.isMcpBridgeConnectionTesting}
          isMcpBridgeBrowserBlocked={mcpBridge.isMcpBridgeBrowserBlocked}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
