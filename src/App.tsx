import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import AppModals from "./components/AppModals";
import AppSidebar from "./components/AppSidebar";
import AppToolbar from "./components/AppToolbar";
import EntryDetail from "./components/EntryDetail";
import EntryListPane from "./components/EntryListPane";
import ExamSessionOverlay from "./components/ExamSessionOverlay";
import SettingsModal from "./components/SettingsModal";
import { cleanupStaleImportAssetSessions, createAutoBackup, createPreUpdateBackup } from "./api";
import { loadExamSessions, saveExamSessions, syncMcpBridgeActiveContext, syncMcpBridgeActiveExamContext, syncMcpBridgeExportContext } from "./api";
import { useBridgeActiveSync } from "./hooks/useBridgeActiveSync";
import { useMcpBridgeSettings } from "./hooks/useMcpBridgeSettings";
import { useAiProviderSettings } from "./hooks/useAiProviderSettings";
import { useAppActions } from "./hooks/useAppActions";
import { useAppNavigationState } from "./hooks/useAppNavigationState";
import { useEntries } from "./hooks/useEntries";
import { useSettings } from "./hooks/useSettings";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import { useTheme } from "./hooks/useTheme";
import { useGeneratedExams } from "./hooks/useGeneratedExams";
import type { ActiveExamContext, ChatGptMcpPreferences, EntryKind, ExamSession, GeneratedExam, McpExportContext, WrongAnswerEntry } from "./types";
import type { SettingsTab } from "./components/SettingsModal";
import { entryKindIcon, entryKindName } from "./utils/appUi";
import { createExamSession } from "./features/exam/services/examSession";
import {
  EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS,
  mergeExamSession,
} from "./features/exam/storage/examSessionStorage";
import { scoreExamSession } from "./features/exam/services/examScoring";
import { createEmptyEntryDraft, normalizeEntryDraftForSave } from "./features/entries/model/entryDraft";
import ExamBuilderWizard from "./features/exam-builder/components/ExamBuilderWizard";
import GeneratedExamList from "./features/exam-builder/components/GeneratedExamList";
import { createSessionFromGeneratedExam } from "./features/exam-builder/services/createSessionFromGeneratedExam";
import { buildGeneratedExamPrintModel } from "./features/exam-builder/services/buildGeneratedExamPrintModel";
import { printExamDocument } from "./features/export/services/printExamDocument";
import { useAppUpdater } from "./features/updater/hooks/useAppUpdater";
import { useAppDialog } from "./shared/ui/AppDialogProvider";
import { GITHUB_RELEASES_URL } from "./features/updater/services/appUpdater";
import { loadImportWorkspaceDraft } from "./features/import-workspace/hooks/useImportWorkspaceAutosave";
import { flushPendingAppWrites } from "./services/flushAppWrites";
import Dialog from "./shared/ui/Dialog";

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
    updateEntry,
    replaceEntries,
    deleteEntry,
    toggleMastered,
    toggleDifficult,
    patchEntry,
    flushEntries,
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
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const { subjectOrder, moveSubject } = useSubjectOrder();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [questionTarget, setQuestionTarget] = useState<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>(null);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examStartError, setExamStartError] = useState<{ entryId: string; message: string } | null>(null);
  const [examSaveError, setExamSaveError] = useState<string | null>(null);
  const [examSaving, setExamSaving] = useState(false);
  const [closeFlushError, setCloseFlushError] = useState<string | null>(null);
  const [closeFlushSaving, setCloseFlushSaving] = useState(false);
  const workspaceDraftFlushRef = useRef<(() => Promise<void>) | null>(null);
  const [savedExamSessions, setSavedExamSessions] = useState<ExamSession[]>([]);
  const [showExamBuilder, setShowExamBuilder] = useState(false);
  const [showGeneratedExams, setShowGeneratedExams] = useState(false);
  const [activeGeneratedExam, setActiveGeneratedExam] = useState<GeneratedExam | null>(null);
  const { exams: generatedExams, upsert: upsertGeneratedExam, remove: removeGeneratedExam, retry: retryGeneratedExams, discardFailedChange: discardGeneratedExamFailure, flush: flushGeneratedExams, saving: generatedExamsSaving, error: generatedExamsError, hasRetryableChange: hasGeneratedExamRetry, loading: generatedExamsLoading, loadError: generatedExamsLoadError, reload: reloadGeneratedExams } = useGeneratedExams();
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const savedExamSessionsRef = useRef<ExamSession[]>([]);
  const examSessionRef = useRef<ExamSession | null>(null);
  const examSaveTimerRef = useRef<number | null>(null);
  const examSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const examSaveSequenceRef = useRef(0);
  const allowWindowCloseRef = useRef(false);
  const windowCloseInFlightRef = useRef(false);
  const closeRetryRef = useRef<(() => Promise<void>) | null>(null);

  const registerWorkspaceDraftFlush = useCallback((flush: (() => Promise<void>) | null) => {
    workspaceDraftFlushRef.current = flush;
  }, []);

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

  const persistGeneratedExam = useCallback(async (exam: GeneratedExam) => {
    await upsertGeneratedExam(exam);
  }, [upsertGeneratedExam]);

  const deleteGeneratedExam = useCallback(async (id: string) => {
    await removeGeneratedExam(id);
  }, [removeGeneratedExam]);

  useEffect(() => {
    if (!examSession) {
      void syncMcpBridgeActiveExamContext({ sessionId: null, questionId: null, questionIndex: null, userResponse: "", scratchNote: "", markedForReview: false, submitted: false, updatedAt: new Date().toISOString(), contextUpdatedAt: new Date().toISOString() });
      return;
    }
    const current = examSession.questions[examSession.currentQuestionIndex];
    const response = current ? examSession.responses.find((item) => item.questionNumber === current.questionNumber) : undefined;
    const context: ActiveExamContext = {
      sessionId: examSession.id,
      questionId: current?.id ?? null,
      questionIndex: examSession.currentQuestionIndex,
      userResponse: response?.response ?? "",
      scratchNote: response?.scratchNote ?? "",
      markedForReview: response?.markedForReview ?? false,
      submitted: examSession.status === "submitted",
      updatedAt: examSession.updatedAt,
      shareUserResponse: settings.chatGptMcpPreferences.shareUserResponse,
      shareScratchNote: settings.chatGptMcpPreferences.shareScratchNote,
      shareQuestionImages: settings.chatGptMcpPreferences.shareQuestionImages,
      shareSourcePageImages: settings.chatGptMcpPreferences.shareSourcePageImages,
      contextUpdatedAt: new Date().toISOString(),
    };
    const timer = window.setTimeout(() => { void syncMcpBridgeActiveExamContext(context); }, 350);
    return () => window.clearTimeout(timer);
  }, [examSession, settings.chatGptMcpPreferences]);

  const flushExamSessionSave = useCallback(async (session: ExamSession, updateUi = true): Promise<boolean> => {
    const sequence = ++examSaveSequenceRef.current;
    const nextSessions = mergeExamSession(savedExamSessionsRef.current, session);
    savedExamSessionsRef.current = nextSessions;
    if (updateUi) setSavedExamSessions(nextSessions);
    setExamSaving(true);
    const saveTask = examSaveQueueRef.current
      .then(async () => {
        await saveExamSessions(nextSessions);
        return true;
      })
      .catch((error) => {
        if (sequence === examSaveSequenceRef.current) {
          setExamSaveError(error instanceof Error && error.message ? error.message : "모의고사 진행 상태를 저장하지 못했습니다.");
        }
        return false;
      });
    examSaveQueueRef.current = saveTask.then(() => undefined);
    const saved = await saveTask;
    if (sequence === examSaveSequenceRef.current) {
      if (saved) setExamSaveError(null);
      setExamSaving(false);
    }
    return saved;
  }, [setExamSaving, setExamSaveError, setSavedExamSessions]);

  const closeExamSession = useCallback(async (): Promise<boolean> => {
    if (examSubmitting) {
      setExamSaveError("시험 제출 중에는 이동하거나 닫을 수 없습니다.");
      return false;
    }
    if (examSaveTimerRef.current !== null) {
      window.clearTimeout(examSaveTimerRef.current);
      examSaveTimerRef.current = null;
    }
    const current = examSessionRef.current;
    if (current && !(await flushExamSessionSave(current))) return false;
    examSessionRef.current = null;
    setExamSession(null);
    setActiveGeneratedExam(null);
    return true;
  }, [examSubmitting, flushExamSessionSave]);

  const openExamSession = useCallback((entry: WrongAnswerEntry, resumable?: ExamSession) => {
    setExamStartError(null);
    setActiveGeneratedExam(null);
    if (resumable) {
      setExamSession(resumable);
      return;
    }
    const next = createExamSession(entry);
    if (!next.questions.length) {
      setExamStartError({ entryId: entry.id, message: "감지된 문항이 없어 모의고사를 시작할 수 없습니다. 문제 번호 형식을 확인해 주세요." });
      return;
    }
    const missingAnswers = next.questions
      .filter((question) => !question.correctAnswer?.trim())
      .map((question) => question.questionNumber);
    if (missingAnswers.length) {
      setExamStartError({ entryId: entry.id, message: `정답이 연결되지 않은 문항이 있습니다: ${missingAnswers.join(", ")}. 답안지를 연결한 뒤 시작해 주세요.` });
      return;
    }
    setExamSession(next);
  }, []);

  const openGeneratedExam = useCallback((exam: GeneratedExam) => {
    if (!exam.questions.length) return;
    setActiveGeneratedExam(exam);
    setExamStartError(null);
    setExamSession(createSessionFromGeneratedExam(exam));
    setShowGeneratedExams(false);
  }, []);

  const printGeneratedExam = useCallback(async (exam: GeneratedExam) => {
    await printExamDocument(buildGeneratedExamPrintModel(exam, settings.examPrintPreferences));
  }, [settings.examPrintPreferences]);

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
  }, [selectedId]);

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
    if (target.entryId !== undefined) setSelectedId(target.entryId);
    if (target.question) {
      setQuestionTarget({ ...target.question, requestId: Date.now() });
    }
    return true;
  }, [activeSection, closeExamSession, examSession, examSubmitting, setActiveSection, setSelectedId]);

  useEffect(() => {
    examSessionRef.current = examSession;
    if (examSaveTimerRef.current !== null) {
      window.clearTimeout(examSaveTimerRef.current);
      examSaveTimerRef.current = null;
    }
    if (examSession) {
      examSaveTimerRef.current = window.setTimeout(() => {
        const latest = examSessionRef.current;
        if (latest) void flushExamSessionSave(latest);
        examSaveTimerRef.current = null;
      }, EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS);
    }
  }, [examSession, flushExamSessionSave]);

  useEffect(() => {
    if (!isTauri()) return;
    const draft = loadImportWorkspaceDraft();
    const protectedSessionIds = draft?.assetSession?.mode === "tauri-staged" ? [draft.assetSession.id] : [];
    void cleanupStaleImportAssetSessions(protectedSessionIds).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (examSaveTimerRef.current !== null) {
        window.clearTimeout(examSaveTimerRef.current);
      }
      const latest = examSessionRef.current;
      if (latest) void flushExamSessionSave(latest, false);
    };
  }, [flushExamSessionSave]);

  useEffect(() => {
    if (!isTauri()) return;
    const windowHandle = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const attemptClose = async () => {
      if (windowCloseInFlightRef.current) return;
      windowCloseInFlightRef.current = true;
      setCloseFlushSaving(true);
      try {
        if (examSaveTimerRef.current !== null) {
          window.clearTimeout(examSaveTimerRef.current);
          examSaveTimerRef.current = null;
        }
        await flushPendingAppWrites({
          activeExam: examSessionRef.current,
          flushExamSession: (session) => flushExamSessionSave(session),
          flushEntries,
          flushGeneratedExams,
          flushSettings,
          flushImportWorkspaceDraft: () => workspaceDraftFlushRef.current?.() ?? Promise.resolve(),
        });
        setCloseFlushError(null);
        allowWindowCloseRef.current = true;
        await windowHandle.close();
      } catch (error) {
        allowWindowCloseRef.current = false;
        setCloseFlushError(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
      } finally {
        windowCloseInFlightRef.current = false;
        setCloseFlushSaving(false);
      }
    };
    closeRetryRef.current = attemptClose;
    void windowHandle.onCloseRequested(async (event) => {
      if (allowWindowCloseRef.current) return;
      event.preventDefault();
      await attemptClose();
    }).then((cleanup) => { unlisten = cleanup; });
    return () => { closeRetryRef.current = null; unlisten?.(); };
  }, [flushEntries, flushExamSessionSave, flushGeneratedExams, flushSettings]);

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
    updateEntry,
    replaceEntries,
    deleteEntry,
    patchEntry,
    refresh,
    setSettings,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
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
  const updater = useAppUpdater(settings, patchSettings, async (update) => {
    if (examSubmitting || examSaving || actions.showForm || actions.showImportModal || showExamBuilder) {
      actions.setSettingsMessage("시험 또는 저장 중에는 업데이트를 설치할 수 없습니다. 작업을 마친 뒤 다시 시도해 주세요.");
      return false;
    }
    if (settings.updatePreferences.backupBeforeInstall && isTauri()) {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        await createPreUpdateBackup(currentVersion, update.latestVersion);
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
  }, []);

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
  const availableUpdate = updater.state.status === "available" ? updater.state : null;

  return (
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
        onOpenExamBuilder={() => { if (!generatedExamsLoading && !generatedExamsLoadError) setShowExamBuilder(true); }}
        onOpenGeneratedExams={() => setShowGeneratedExams(true)}
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
        {availableUpdate && settings.updatePreferences.notificationsEnabled && availableUpdate.latestVersion !== settings.updatePreferences.skippedVersion && availableUpdate.latestVersion !== dismissedUpdateVersion && !examSession && (
          <div className="app-update-banner" role="status">
            <span>새 버전 {availableUpdate.latestVersion}을 사용할 수 있습니다.</span>
            <button type="button" onClick={() => openSettings("updates")}>변경사항</button>
            <button type="button" onClick={() => void updater.installUpdate()}>업데이트</button>
            <button type="button" onClick={() => setDismissedUpdateVersion(availableUpdate.latestVersion)}>나중에</button>
            <button type="button" onClick={() => void patchSettings({ updatePreferences: { ...settings.updatePreferences, skippedVersion: availableUpdate.latestVersion } })}>이번 버전 건너뛰기</button>
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
          onOpenSettings={() => openSettings()}
        />

        <div className="content">
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
        </div>
      </main>

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
      />
      {showExamBuilder && (
        <ExamBuilderWizard
          entries={entries}
          onClose={() => setShowExamBuilder(false)}
          onSave={persistGeneratedExam}
          onStart={async (exam) => { await persistGeneratedExam(exam); setShowExamBuilder(false); openGeneratedExam(exam); }}
        />
      )}
      <Dialog open={showGeneratedExams} onClose={() => { void flushGeneratedExams(); setShowGeneratedExams(false); }} className="modal-card generated-exams-modal" ariaLabel="내 모의고사">
            <button type="button" className="btn-icon generated-exams-modal__close" aria-label="내 모의고사 닫기" onClick={() => setShowGeneratedExams(false)}>✕</button>
            {generatedExamsLoading && <p className="form-hint" role="status">모의고사 목록을 불러오는 중...</p>}
            {generatedExamsLoadError && <div className="form-error" role="alert">{generatedExamsLoadError}<button type="button" className="btn-secondary" onClick={() => void reloadGeneratedExams()}>다시 불러오기</button></div>}
            {generatedExamsSaving && <p className="form-hint" role="status">저장 중...</p>}
            {generatedExamsError && <div className="form-error" role="alert">{generatedExamsError}{hasGeneratedExamRetry && <><button type="button" className="btn-secondary" onClick={() => void retryGeneratedExams()}>실패한 변경 다시 저장</button><button type="button" className="btn-secondary" onClick={discardGeneratedExamFailure}>변경 취소</button></>}</div>}
            <GeneratedExamList exams={generatedExams} onOpen={openGeneratedExam} onDelete={(id) => void deleteGeneratedExam(id)} onPrint={(exam) => void printGeneratedExam(exam)} disabled={generatedExamsLoading || Boolean(generatedExamsLoadError)} />
      </Dialog>
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
          onPatchUpdatePreferences={async (patch) => { await patchSettings({ updatePreferences: { ...settings.updatePreferences, ...patch } }); }}
          initialTab={settingsInitialTab}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialTab(undefined);
          }}
        />
      )}
      <Dialog open={Boolean(closeFlushError)} onClose={() => setCloseFlushError(null)} title="저장 후 종료할 수 없습니다." closeDisabled={closeFlushSaving} busy={closeFlushSaving}>
        <p>{closeFlushError}</p>
        <p className="form-hint">저장되지 않은 변경을 버리지 않도록 창을 닫지 않았습니다.</p>
        <footer className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={() => setCloseFlushError(null)} disabled={closeFlushSaving}>종료 취소</button>
          <button type="button" onClick={() => void closeRetryRef.current?.()} disabled={closeFlushSaving}>다시 저장 후 종료</button>
        </footer>
      </Dialog>
    </div>
  );
}
