import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";
import EntryDetail from "./components/EntryDetail";
import EntryForm from "./components/EntryForm";
import ImportFromGptModal from "./components/ImportFromGptModal";
import QuickConceptPanel from "./components/QuickConceptPanel";
import ReviewPanel from "./components/ReviewPanel";
import SubjectList from "./components/SubjectList";
import {
  cleanupOrphanImages,
  createAutoBackup,
  createBackup,
  clearAiProviderKey,
  generateImportWithAi,
  getAiProviderStatus,
  restoreBackup,
  runNativeIntegrityCheck,
  saveAiProviderConfig,
  saveAiProviderKey,
} from "./api";
import { useEntries } from "./hooks/useEntries";
import { useSettings } from "./hooks/useSettings";
import { useSubjectOrder } from "./hooks/useSubjectOrder";
import { useTheme } from "./hooks/useTheme";
import type {
  Difficulty,
  AiProviderSettings,
  AiProviderStatus,
  AiProviderType,
  EntryFormData,
  EntryKind,
  EntryTemplate,
  IntegrityReport,
  ListFilter,
  MemoTemplate,
  PromptTemplate,
  ReviewResult,
  SortKey,
  Subject,
  ThemeMode,
  WrongAnswerEntry,
} from "./types";
import { SUBJECTS } from "./types";
import { findDuplicateEntries } from "./utils/duplicates";
import { buildLearningDashboardStats } from "./utils/conceptAnalytics";
import { collectExplanationSearchText, getAllImageFilenames, getEntryTitle } from "./utils/entry";
import { downloadMarkdown, openPrintableEntry } from "./utils/exportEntry";
import {
  entryToFormData,
  mergeGptSolutionIntoEntry,
  type GptSolutionApplyMode,
} from "./utils/gptSolution";
import { runClientIntegrityCheck } from "./utils/integrity";
import {
  applyReviewResult,
  getDifficultReviewCandidates,
  getRandomReviewCandidates,
  getTodayReviewCandidates,
  shuffleEntries,
} from "./utils/review";
import { mistakeCauseLabel } from "./utils/mistakeAnalysis";

function sortEntries(list: WrongAnswerEntry[], sortKey: SortKey) {
  const copy = [...list];
  switch (sortKey) {
    case "title-asc":
      return copy.sort((a, b) =>
        getEntryTitle(a).localeCompare(getEntryTitle(b), "ko"),
      );
    case "title-desc":
      return copy.sort((a, b) =>
        getEntryTitle(b).localeCompare(getEntryTitle(a), "ko"),
      );
    case "date-asc":
      return copy.sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
    case "date-desc":
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }
}

function getEntryCardPreview(entry: WrongAnswerEntry): string {
  const text =
    entry.entryKind === "concept"
      ? entry.question.trim() || entry.memo.trim()
      : "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 90) ?? "";
}

type DifficultyFilter = "all" | Difficulty;

function isDifficultyFilter(value: string): value is DifficultyFilter {
  return (
    value === "all" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "none"
  );
}

export default function App() {
  const {
    entries,
    loading,
    error,
    clearError,
    refresh,
    addEntry,
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
    refreshSettings,
    clearSettingsError,
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const { subjectOrder, moveSubject } = useSubjectOrder();

  const [activeSection, setActiveSection] = useState<EntryKind>("wrong_answer");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [prefilledTitle, setPrefilledTitle] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<"import" | "solution">("import");
  const [solutionSourceEntry, setSolutionSourceEntry] = useState<WrongAnswerEntry | undefined>();
  const [importedInitialData, setImportedInitialData] = useState<Partial<EntryFormData> | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [reviewMode, setReviewMode] = useState<"today" | "random" | "difficult" | null>(null);
  const [reviewSeed, setReviewSeed] = useState<WrongAnswerEntry[]>([]);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [aiProviderStatus, setAiProviderStatus] = useState<AiProviderStatus | null>(null);
  const [aiProviderKeyInput, setAiProviderKeyInput] = useState("");
  const [editingEntry, setEditingEntry] = useState<WrongAnswerEntry | undefined>();

  const filtered = useMemo(() => {
    const list = entries.filter((e) => {
      // 1. Filter by section tab
      if (e.entryKind !== activeSection) return false;

      // 2. Filter by subject
      if (subjectFilter && e.subject !== subjectFilter) return false;

      // 3. Filter by status
      if (listFilter === "pending" && e.mastered) return false;
      if (listFilter === "mastered" && !e.mastered) return false;
      if (listFilter === "difficult" && !e.difficult) return false;
      if (listFilter === "due" && !getTodayReviewCandidates([e]).length) return false;

      // 4. Filter by difficulty level
      if (difficultyFilter !== "all" && e.difficulty !== difficultyFilter) return false;

      // 5. Filter by search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [
          e.title,
          e.question,
          e.myAnswer,
          e.correctAnswer,
          collectExplanationSearchText(e),
          ...(e.answerKey ?? []).flatMap((item) => [
            item.questionNumber,
            item.answer,
            item.explanation,
            ...item.importantPoints,
          ]),
          e.memo,
          e.subject,
          ...e.tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return sortEntries(list, sortKey);
  }, [entries, activeSection, subjectFilter, listFilter, difficultyFilter, search, sortKey]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const sectionEntries = entries.filter((e) => e.entryKind === activeSection);
    return {
      total: sectionEntries.length,
      mastered: sectionEntries.filter((e) => e.mastered).length,
      pending: sectionEntries.filter((e) => !e.mastered).length,
      difficult: sectionEntries.filter((e) => e.difficult).length,
    };
  }, [entries, activeSection]);

  const todayReviewCount = useMemo(
    () => getTodayReviewCandidates(entries).length,
    [entries],
  );
  const learningStats = useMemo(() => buildLearningDashboardStats(entries), [entries]);

  useEffect(() => {
    void getAiProviderStatus().then(setAiProviderStatus);
  }, [settings.aiProvider]);

  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of subjectOrder) map[s] = 0;
    const sectionEntries = entries.filter((e) => e.entryKind === activeSection);
    for (const e of sectionEntries) {
      if (map[e.subject] !== undefined) map[e.subject]++;
    }
    return map;
  }, [entries, subjectOrder, activeSection]);

  const linkableTargets = useMemo(() => {
    const targets = new Set<string>();
    for (const e of entries) {
      targets.add(e.id.toLowerCase());
      if (e.title.trim()) {
        targets.add(e.title.trim().toLowerCase());
      }
    }
    return targets;
  }, [entries]);

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
        await setSettings({
          ...settings,
          autoBackup: {
            ...settings.autoBackup,
            lastBackupAt: new Date().toISOString(),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setSettingsMessage("자동 백업에 실패했습니다. 설정에서 수동 백업을 실행해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [settings, setSettings]);

  const handleWikiLinkClick = (target: string) => {
    const targetLower = target.toLowerCase();
    const found = entries.find(
      (e) =>
        e.id.toLowerCase() === targetLower ||
        e.title.trim().toLowerCase() === targetLower
    );

    if (found) {
      // Auto switch section tab if needed
      if (found.entryKind !== activeSection) {
        setActiveSection(found.entryKind);
      }
      setSelectedId(found.id);
    } else {
      const confirmCreate = confirm(`"${target}" 항목을 찾을 수 없습니다. 이 제목으로 새 항목을 생성할까요?`);
      if (confirmCreate) {
        setPrefilledTitle(target);
        setEditingEntry(undefined);
        setShowForm(true);
      }
    }
  };

  const handleSave = async (
    data: EntryFormData,
    removedImages: string[],
  ) => {
    const duplicates = findDuplicateEntries(entries, data, editingEntry?.id, 3);
    if (
      duplicates.length &&
      !confirm(
        [
          "비슷한 항목이 발견되었습니다. 그래도 저장할까요?",
          ...duplicates.map(
            ({ entry, score }) => `- ${getEntryTitle(entry)} (${Math.round(score * 100)}%)`,
          ),
        ].join("\n"),
      )
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }

    if (editingEntry) {
      await updateEntry(editingEntry.id, data, removedImages);
      setSelectedId(editingEntry.id);
    } else {
      const id = await addEntry(data);
      setSelectedId(id);
    }
  };

  const handleQuickConceptCreate = async (data: EntryFormData) => {
    const sameTitle = entries.find(
      (entry) =>
        entry.entryKind === "concept" &&
        entry.title.trim().toLowerCase() === data.title.trim().toLowerCase(),
    );
    if (
      sameTitle &&
      !confirm(`"${getEntryTitle(sameTitle)}" 개념이 이미 있습니다. 그래도 새로 추가할까요?`)
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }
    const id = await addEntry(data);
    setActiveSection("concept");
    setSelectedId(id);
  };

  const saveTemplate = async (template: EntryTemplate) => {
    await setSettings({
      ...settings,
      templates: [template, ...settings.templates],
    });
    setSettingsMessage("템플릿을 저장했습니다.");
  };

  const deleteTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      templates: settings.templates.filter((template) => template.id !== templateId),
    });
  };

  const savePromptTemplate = async (template: PromptTemplate) => {
    await setSettings({
      ...settings,
      promptTemplates: [template, ...settings.promptTemplates.filter((item) => item.id !== template.id)],
    });
    setSettingsMessage("프롬프트 템플릿을 저장했습니다.");
  };

  const deletePromptTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      promptTemplates: settings.promptTemplates.filter(
        (template) => template.id !== templateId || template.builtIn,
      ),
    });
  };

  const saveMemoTemplate = async (template: MemoTemplate) => {
    await setSettings({
      ...settings,
      memoTemplates: [template, ...settings.memoTemplates.filter((item) => item.id !== template.id)],
    });
    setSettingsMessage("메모 템플릿을 저장했습니다.");
  };

  const deleteMemoTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      memoTemplates: settings.memoTemplates.filter(
        (template) => template.id !== templateId || template.builtIn,
      ),
    });
  };

  const updateAiProviderConfig = async (patch: Partial<AiProviderSettings>) => {
    const next: AiProviderSettings = {
      ...settings.aiProvider,
      ...patch,
    };
    if (next.type === "manual") next.enabled = false;
    try {
      const status = await saveAiProviderConfig(next);
      setAiProviderStatus(status);
      await refreshSettings();
      setSettingsMessage("AI Provider 설정을 저장했습니다.");
    } catch (configError) {
      setSettingsMessage(configError instanceof Error ? configError.message : "AI Provider 설정 저장에 실패했습니다.");
    }
  };

  const storeAiProviderKey = async () => {
    if (!aiProviderKeyInput.trim()) {
      setSettingsMessage("저장할 API key를 입력하세요.");
      return;
    }
    try {
      const status = await saveAiProviderKey(aiProviderKeyInput.trim());
      setAiProviderKeyInput("");
      setAiProviderStatus(status);
      await refreshSettings();
      setSettingsMessage("AI Provider key를 저장했습니다.");
    } catch (keyError) {
      setSettingsMessage(keyError instanceof Error ? keyError.message : "API key 저장에 실패했습니다.");
    }
  };

  const removeAiProviderKey = async () => {
    try {
      const status = await clearAiProviderKey();
      setAiProviderStatus(status);
      await refreshSettings();
      setSettingsMessage("저장된 AI Provider key를 삭제했습니다.");
    } catch (keyError) {
      setSettingsMessage(keyError instanceof Error ? keyError.message : "API key 삭제에 실패했습니다.");
    }
  };

  const addMemoTemplate = async () => {
    const name = prompt("메모 템플릿 이름을 입력하세요.");
    if (!name?.trim()) return;
    const content = prompt("메모 템플릿 내용을 입력하세요.");
    if (!content?.trim()) return;
    await saveMemoTemplate({
      id: crypto.randomUUID(),
      name: name.trim(),
      content,
    });
  };

  const startReview = (mode: "today" | "random" | "difficult") => {
    const candidates =
      mode === "today"
        ? getTodayReviewCandidates(entries)
        : mode === "difficult"
          ? getDifficultReviewCandidates(entries)
          : shuffleEntries(getRandomReviewCandidates(entries));
    setReviewSeed(candidates);
    setReviewMode(mode);
  };

  const handleReview = async (entry: WrongAnswerEntry, result: ReviewResult) => {
    const next = applyReviewResult(entry, result);
    await patchEntry(entry.id, {
      review: next.review,
      mastered: next.mastered,
    });
  };

  const runIntegrity = async () => {
    const nativeReport = await runNativeIntegrityCheck().catch(() => null);
    const report = nativeReport ?? runClientIntegrityCheck(entries, settings);
    setIntegrityReport(report);
    setSettingsMessage(
      report.issues.length === 0
        ? "무결성 검사에서 문제가 발견되지 않았습니다."
        : `무결성 검사에서 ${report.issues.length}개 항목을 확인했습니다.`,
    );
  };

  const handleBackup = async () => {
    const message = await createBackup(entries, settings);
    setSettingsMessage(message);
    if (isTauri()) {
      await setSettings({
        ...settings,
        autoBackup: {
          ...settings.autoBackup,
          lastBackupAt: new Date().toISOString(),
        },
      });
    }
  };

  const handleRestore = async () => {
    if (!confirm("백업을 복원하면 현재 데이터가 덮어써질 수 있습니다. 계속할까요?")) return;
    const payload = await restoreBackup();
    if (payload) {
      await replaceEntries(payload.entries);
      await setSettings(payload.settings);
      for (const [key, value] of Object.entries(payload.browserImages ?? {})) {
        localStorage.setItem(key, value);
      }
    } else {
      await refresh();
      await refreshSettings();
    }
    setSettingsMessage("백업 복원을 완료했습니다.");
  };

  const handleCleanupOrphans = async () => {
    const removed = await cleanupOrphanImages(entries.flatMap(getAllImageFilenames));
    setSettingsMessage(`사용하지 않는 이미지 ${removed}개를 정리했습니다.`);
  };

  const openNew = () => {
    setPrefilledTitle("");
    setImportedInitialData(undefined);
    setEditingEntry(undefined);
    setShowForm(true);
  };

  const openImport = () => {
    setImportMode("import");
    setSolutionSourceEntry(undefined);
    setShowImportModal(true);
  };

  const openQuickGptSolution = () => {
    if (!selected) return;
    setImportMode("solution");
    setSolutionSourceEntry(selected);
    setShowImportModal(true);
  };

  const openEdit = () => {
    if (selected) {
      setPrefilledTitle("");
      setImportedInitialData(undefined);
      setEditingEntry(selected);
      setShowForm(true);
    }
  };

  const importFallbackSubject: Subject =
    subjectFilter && SUBJECTS.includes(subjectFilter as Subject)
      ? (subjectFilter as Subject)
      : "수학";

  const quickConceptSubject: Subject =
    subjectFilter && SUBJECTS.includes(subjectFilter as Subject)
      ? (subjectFilter as Subject)
      : "기타";

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm("이 항목을 삭제할까요? 첨부 이미지도 함께 삭제됩니다.")) return;
    await deleteEntry(selected.id);
    setSelectedId(null);
  };

  const imageCount = (e: WrongAnswerEntry) =>
    e.questionImages.length +
    e.explanationParts.reduce((n, p) => n + p.images.length, 0);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">📓</div>
          <h1>오답노트</h1>
        </div>

        <div className="section-tabs">
          {(
            [
              ["wrong_answer", "📕 오답노트"],
              ["concept", "💡 개념노트"],
              ["problem_sheet", "📄 시험지함"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`section-tab-btn ${activeSection === key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(key);
                setSelectedId(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="stats">
          <div className="stat-card">
            <div className="value">{stats.total}</div>
            <div className="label">전체</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.pending}</div>
            <div className="label">복습 필요</div>
          </div>
          <div className="stat-card stat-card--compact">
            <div className="value">{stats.difficult}</div>
            <div className="label">어려움</div>
          </div>
        </div>

        <div className="learning-insights">
          <div className="learning-insight">
            <span>7일 복습</span>
            <strong>{learningStats.recentReviewCount}</strong>
          </div>
          <div className="learning-insight">
            <span>주요 원인</span>
            <strong>
              {learningStats.topCauses[0]
                ? mistakeCauseLabel(learningStats.topCauses[0].type)
                : "미분류"}
            </strong>
          </div>
          <div className="learning-insight">
            <span>약점 개념</span>
            <strong>{learningStats.weakConcepts[0]?.concept ?? "-"}</strong>
          </div>
        </div>

        <div className="filter-section">
          <h3>과목</h3>
          <SubjectList
            subjectOrder={subjectOrder}
            subjectFilter={subjectFilter}
            subjectCounts={subjectCounts}
            totalCount={entries.filter(e => e.entryKind === activeSection).length}
            onSelect={setSubjectFilter}
            onReorder={moveSubject}
          />
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-settings"
            onClick={() => setShowSettings((v) => !v)}
          >
            ⚙ 설정
          </button>
          {showSettings && (
            <div className="settings-panel">
              {(settingsError || settingsMessage) && (
                <div className="settings-message">
                  <span>{settingsError || settingsMessage}</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearSettingsError();
                      setSettingsMessage(null);
                    }}
                  >
                    닫기
                  </button>
                </div>
              )}
              <p className="settings-label">테마</p>
              <div className="theme-options">
                {(
                  [
                    ["light", "라이트"],
                    ["dark", "다크"],
                    ["system", "시스템"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`theme-btn ${theme === value ? "active" : ""}`}
                    onClick={() => setTheme(value as ThemeMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="settings-label">AI Provider</p>
              <div className="ai-provider-settings">
                <div className="form-field">
                  <label htmlFor="ai-provider-type">Provider</label>
                  <select
                    id="ai-provider-type"
                    value={settings.aiProvider.type}
                    disabled={!isTauri()}
                    onChange={(event) =>
                      updateAiProviderConfig({
                        type: event.target.value as AiProviderType,
                      })
                    }
                  >
                    <option value="manual">manual</option>
                    <option value="gemini-flash-lite">gemini-flash-lite</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  </select>
                  <div className="provider-hint" style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem", lineHeight: "1.4" }}>
                    • <b>flash-lite</b>: 빠르고 저렴하며 텍스트 기반의 간단한 문제에 적합합니다.<br/>
                    • <b>3.5-flash</b>: 추론이 필요한 복잡한 문제나 이미지 인식(OCR)에 적합합니다.
                  </div>
                </div>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.aiProvider.enabled}
                    disabled={!isTauri() || settings.aiProvider.type === "manual"}
                    onChange={(event) => updateAiProviderConfig({ enabled: event.target.checked })}
                  />
                  API 사용 {isTauri() ? "(선택)" : "(데스크톱 앱에서 사용 가능)"}
                </label>
                <div className="theme-options">
                  {(["env", "tauri-settings"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      className={`theme-btn ${settings.aiProvider.keySource === source ? "active" : ""}`}
                      disabled={!isTauri()}
                      onClick={() => updateAiProviderConfig({ keySource: source })}
                    >
                      {source === "env" ? "환경변수" : "OS 보안 저장소"}
                    </button>
                  ))}
                </div>
                {settings.aiProvider.keySource === "tauri-settings" && (
                  <p className="form-hint">
                    저장 key는 Windows Credential Manager 등 OS 보안 저장소에 보관됩니다. 이전 버전의 평문 key 파일이 있으면 사용 시 자동 이전됩니다.
                  </p>
                )}
                <div className="ai-provider-status">
                  <span>환경변수 key: {aiProviderStatus?.hasEnvKey ? "감지됨" : "없음"}</span>
                  <span>저장 key: {aiProviderStatus?.hasStoredKey ? "저장됨" : "없음"}</span>
                  <span>상태: {aiProviderStatus?.available ? "사용 가능" : "manual 대기"}</span>
                </div>
                {settings.aiProvider.keySource === "tauri-settings" && (
                  <div className="ai-provider-key-row">
                    <input
                      type="password"
                      value={aiProviderKeyInput}
                      disabled={!isTauri()}
                      onChange={(event) => setAiProviderKeyInput(event.target.value)}
                      placeholder="Gemini API key"
                    />
                    <button type="button" className="theme-btn" disabled={!isTauri()} onClick={storeAiProviderKey}>
                      key 저장
                    </button>
                    <button type="button" className="theme-btn" disabled={!isTauri()} onClick={removeAiProviderKey}>
                      key 삭제
                    </button>
                  </div>
                )}
              </div>
              <p className="settings-label">데이터 관리</p>
              <div className="settings-actions">
                <button type="button" className="theme-btn" onClick={handleBackup}>
                  백업 만들기
                </button>
                <button type="button" className="theme-btn" onClick={handleRestore}>
                  백업 복원
                </button>
                <button type="button" className="theme-btn" onClick={runIntegrity}>
                  무결성 검사
                </button>
                <button type="button" className="theme-btn" onClick={handleCleanupOrphans}>
                  미사용 이미지 정리
                </button>
              </div>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.autoBackup.enabled}
                  disabled={!isTauri()}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      autoBackup: {
                        ...settings.autoBackup,
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
                자동 백업 {isTauri() ? "하루 1회" : "(데스크톱 앱에서 사용 가능)"}
              </label>
              {integrityReport && (
                <div className="integrity-report">
                  {integrityReport.issues.length === 0 ? (
                    <p>문제가 없습니다.</p>
                  ) : (
                    integrityReport.issues.slice(0, 6).map((issue) => (
                      <p key={issue.id} className={`integrity-issue integrity-issue--${issue.severity}`}>
                        {issue.message}
                      </p>
                    ))
                  )}
                </div>
              )}
              <p className="settings-label">템플릿</p>
              <div className="template-list">
                {settings.templates.length === 0 ? (
                  <span className="template-empty">저장된 템플릿이 없습니다.</span>
                ) : (
                  settings.templates.map((template) => (
                    <div key={template.id} className="template-item">
                      <span>{template.name}</span>
                      <button type="button" onClick={() => deleteTemplate(template.id)}>
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>
              <p className="settings-label">GPT 프롬프트 템플릿</p>
              <div className="template-list">
                {settings.promptTemplates.map((template) => (
                  <div key={template.id} className="template-item">
                    <span>{template.name}{template.builtIn ? " · 기본" : ""}</span>
                    {!template.builtIn && (
                      <button type="button" onClick={() => deletePromptTemplate(template.id)}>
                        삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="settings-label">메모 템플릿</p>
              <div className="settings-actions">
                <button type="button" className="theme-btn" onClick={addMemoTemplate}>
                  메모 템플릿 추가
                </button>
              </div>
              <div className="template-list">
                {settings.memoTemplates.map((template) => (
                  <div key={template.id} className="template-item">
                    <span>{template.name}{template.builtIn ? " · 기본" : ""}</span>
                    {!template.builtIn && (
                      <button type="button" onClick={() => deleteMemoTemplate(template.id)}>
                        삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn-new" onClick={openNew}>
            + 새 {activeSection === "concept" ? "개념" : activeSection === "problem_sheet" ? "시험지" : "오답"} 추가
          </button>
          {(activeSection === "problem_sheet" || activeSection === "concept") && (
            <button type="button" className="btn-new btn-new--secondary" onClick={openImport}>
              GPT 결과 가져오기
            </button>
          )}
        </div>
      </aside>

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
        <div className="toolbar">
          <input
            type="search"
            className="search-input"
            placeholder={activeSection === "concept" ? "개념명, 설명, 태그로 검색…" : "문제, 답, 태그로 검색…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="정렬"
          >
            <option value="date-desc">최신순</option>
            <option value="date-asc">오래된순</option>
            <option value="title-asc">제목 가나다순</option>
            <option value="title-desc">제목 역순</option>
          </select>
          <div className="difficulty-filter-wrap">
            <select
              className="difficulty-filter-select"
              value={difficultyFilter}
              onChange={(e) => {
                if (isDifficultyFilter(e.target.value)) {
                  setDifficultyFilter(e.target.value);
                }
              }}
              aria-label="난이도 필터"
            >
              <option value="all">모든 난이도</option>
              <option value="high">난이도: 상</option>
              <option value="medium">난이도: 중</option>
              <option value="low">난이도: 하</option>
              <option value="none">난이도: 없음</option>
            </select>
          </div>
          <div className="filter-toggle filter-toggle--wrap">
            {(
              [
                ["all", "전체"],
                ["pending", "복습 필요"],
                ["mastered", "완료"],
                ["difficult", "어려움"],
                ["due", `오늘 ${todayReviewCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={listFilter === key ? "active" : ""}
                onClick={() => setListFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="review-launcher">
            <button type="button" className="btn-secondary" onClick={() => startReview("today")}>
              오늘 복습
            </button>
            <button type="button" className="btn-secondary" onClick={() => startReview("random")}>
              랜덤 복습
            </button>
            <button type="button" className="btn-secondary" onClick={() => startReview("difficult")}>
              어려움 집중
            </button>
          </div>
        </div>

        <div className="content">
          <div className="entry-list">
            {activeSection === "concept" && (
              <QuickConceptPanel
                subject={quickConceptSubject}
                onCreate={handleQuickConceptCreate}
              />
            )}
            {loading ? (
              <div className="list-empty">불러오는 중…</div>
            ) : filtered.length === 0 ? (
              <div className="list-empty">
                {entries.filter(e => e.entryKind === activeSection).length === 0
                  ? `아직 등록된 ${activeSection === "concept" ? "개념이" : activeSection === "problem_sheet" ? "시험지가" : "오답이"} 없습니다.\n하단의 버튼으로 추가해 보세요.`
                  : "검색 결과가 없습니다."}
              </div>
            ) : (
              filtered.map((e) => (
                <div
                  key={e.id}
                  className={`entry-card ${selectedId === e.id ? "selected" : ""} ${e.mastered ? "mastered" : ""}`}
                  onClick={() => setSelectedId(e.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => ev.key === "Enter" && setSelectedId(e.id)}
                >
                  <div className="entry-card-header">
                    <span className="subject-badge">{e.subject}</span>
                    {e.entryKind === "problem_sheet" && (
                      <span className="entry-mini-badge entry-mini-badge--sheet">
                        문제지
                      </span>
                    )}
                    {e.entryKind === "concept" && (
                      <span className="entry-mini-badge entry-mini-badge--concept">
                        개념
                      </span>
                    )}
                    {e.difficulty && e.difficulty !== "none" && (
                      <span className={`entry-mini-badge entry-mini-badge--difficulty entry-mini-badge--difficulty-${e.difficulty}`}>
                        {e.difficulty === "high" ? "상" : e.difficulty === "medium" ? "중" : "하"}
                      </span>
                    )}
                    {e.mastered && <span className="mastered-badge">✓ 완료</span>}
                  </div>
                  <p className="entry-card-question">{getEntryTitle(e)}</p>
                  {getEntryCardPreview(e) && (
                    <p className="entry-card-preview">{getEntryCardPreview(e)}</p>
                  )}
                  <div className="entry-card-meta">
                    <span>
                      {new Date(e.updatedAt).toLocaleDateString("ko-KR")}
                    </span>
                    {imageCount(e) > 0 && (
                      <span className="image-indicator">📷 {imageCount(e)}</span>
                    )}
                    {e.tags.length > 0 && <span>#{e.tags[0]}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          {selected ? (
            <EntryDetail
              entry={selected}
              onEdit={openEdit}
              onQuickGptSolution={selected.entryKind !== "concept" ? openQuickGptSolution : undefined}
              onDelete={handleDelete}
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
              onOpenEntry={(entryId) => {
                const found = entries.find((entry) => entry.id === entryId);
                if (found) {
                  setActiveSection(found.entryKind);
                  setSelectedId(entryId);
                }
              }}
              onExportMarkdown={() => downloadMarkdown(selected)}
              onOpenPrint={() => openPrintableEntry(selected)}
            />
          ) : (
            <div className="detail-panel empty-state">
              <span className="icon">
                {activeSection === "concept" ? "💡" : activeSection === "problem_sheet" ? "📄" : "📓"}
              </span>
              <p>
                왼쪽 목록에서 {activeSection === "concept" ? "개념을" : activeSection === "problem_sheet" ? "시험지를" : "오답을"} 선택하거나
                <br />
                새 {activeSection === "concept" ? "개념을" : activeSection === "problem_sheet" ? "시험지를" : "오답을"} 추가하세요.
              </p>
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <EntryForm
          entry={editingEntry}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingEntry(undefined);
            setPrefilledTitle("");
            setImportedInitialData(undefined);
          }}
          defaultEntryKind={activeSection}
          prefilledTitle={prefilledTitle}
          initialData={importedInitialData}
          templates={settings.templates}
          memoTemplates={settings.memoTemplates}
          onSaveTemplate={saveTemplate}
        />
      )}
      {showImportModal && (
        <ImportFromGptModal
          fallbackSubject={
            importMode === "solution" &&
            solutionSourceEntry &&
            SUBJECTS.includes(solutionSourceEntry.subject as Subject)
              ? (solutionSourceEntry.subject as Subject)
              : importFallbackSubject
          }
          promptTemplates={settings.promptTemplates}
          aiProvider={settings.aiProvider}
          aiProviderStatus={aiProviderStatus}
          onGenerateWithAi={async (prompt, inputText, imageFilenames) => {
            try {
              return await generateImportWithAi(prompt, inputText, imageFilenames);
            } catch (aiError) {
              await updateAiProviderConfig({ enabled: false, type: "manual" });
              throw aiError;
            }
          }}
          onAiFallback={() => {
            void updateAiProviderConfig({ enabled: false, type: "manual" });
          }}
          selectedPromptTemplateId={settings.importPreferences.lastPromptTemplateId}
          onPromptTemplateSelect={(templateId) =>
            setSettings({
              ...settings,
              importPreferences: {
                ...settings.importPreferences,
                lastPromptTemplateId: templateId,
              },
            })
          }
          onSavePromptTemplate={savePromptTemplate}
          sourceEntry={solutionSourceEntry}
          mode={importMode}
          onClose={() => {
            setShowImportModal(false);
            setSolutionSourceEntry(undefined);
            setImportMode("import");
          }}
          onApply={(data, applyMode?: GptSolutionApplyMode) => {
            if (importMode === "solution" && solutionSourceEntry) {
              const merged = mergeGptSolutionIntoEntry(
                entryToFormData(solutionSourceEntry),
                data,
                applyMode ?? "fill",
              );
              setImportedInitialData(undefined);
              setEditingEntry({
                ...solutionSourceEntry,
                ...merged,
              });
              setShowImportModal(false);
              setSolutionSourceEntry(undefined);
              setImportMode("import");
              setShowForm(true);
              return;
            }
            setImportedInitialData(data);
            setActiveSection(data.entryKind ?? "problem_sheet");
            setEditingEntry(undefined);
            setPrefilledTitle("");
            setShowImportModal(false);
            setSolutionSourceEntry(undefined);
            setImportMode("import");
            setShowForm(true);
          }}
        />
      )}
      {reviewMode && (
        <ReviewPanel
          title={
            reviewMode === "today"
              ? "오늘 복습"
              : reviewMode === "difficult"
                ? "어려움 집중"
                : "랜덤 복습"
          }
          entries={reviewSeed}
          onClose={() => setReviewMode(null)}
          onReview={handleReview}
          onOpenEntry={(entry) => {
            setActiveSection(entry.entryKind);
            setSelectedId(entry.id);
            setReviewMode(null);
          }}
          onWikiLinkClick={handleWikiLinkClick}
          existingTargets={linkableTargets}
        />
      )}
    </div>
  );
}
