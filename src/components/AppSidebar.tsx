import { isTauri } from "@tauri-apps/api/core";
import SubjectList from "./SubjectList";
import type {
  AiProviderStatus,
  AiProviderType,
  AppSettings,
  EntryKind,
  IntegrityReport,
  ThemeMode,
} from "../types";
import { entryKindName } from "../utils/appUi";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";

interface AppSidebarProps {
  activeSection: EntryKind;
  setActiveSection: (section: EntryKind) => void;
  setSelectedId: (id: string | null) => void;
  stats: {
    total: number;
    pending: number;
    difficult: number;
  };
  learningStats: ReturnType<
    typeof import("../utils/conceptAnalytics").buildLearningDashboardStats
  >;
  subjectOrder: string[];
  subjectFilter: string | null;
  subjectCounts: Record<string, number>;
  sectionEntryCount: number;
  moveSubject: (fromIndex: number, toIndex: number) => void;
  settings: AppSettings;
  settingsError: string | null;
  settingsMessage: string | null;
  clearSettingsError: () => void;
  setSettingsMessage: (message: string | null) => void;
  setSettings: (settings: AppSettings) => Promise<void>;
  showSettings: boolean;
  setShowSettings: (show: boolean | ((value: boolean) => boolean)) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  aiProviderStatus: AiProviderStatus | null;
  aiProviderKeyInput: string;
  setAiProviderKeyInput: (value: string) => void;
  updateAiProviderConfig: (patch: Partial<AppSettings["aiProvider"]>) => Promise<void>;
  storeAiProviderKey: () => Promise<void>;
  removeAiProviderKey: () => Promise<void>;
  integrityReport: IntegrityReport | null;
  deleteTemplate: (templateId: string) => Promise<void>;
  deletePromptTemplate: (templateId: string) => Promise<void>;
  deleteMemoTemplate: (templateId: string) => Promise<void>;
  addMemoTemplate: () => Promise<void>;
  handleBackup: () => Promise<void>;
  handleRestore: () => Promise<void>;
  runIntegrity: () => Promise<void>;
  handleCleanupOrphans: () => Promise<void>;
  openNew: () => void;
  openImport: () => void;
  openLearningImport: () => void;
  onSubjectSelect: (subject: string | null) => void;
}

const sectionTabs = [
  ["wrong_answer", "📕 오답노트"],
  ["concept", "💡 개념노트"],
  ["problem_sheet", "📄 시험지함"],
  ["lecture", "🎓 특강자료"],
] as const;

export default function AppSidebar({
  activeSection,
  setActiveSection,
  setSelectedId,
  stats,
  learningStats,
  subjectOrder,
  subjectFilter,
  subjectCounts,
  sectionEntryCount,
  moveSubject,
  settings,
  settingsError,
  settingsMessage,
  clearSettingsError,
  setSettingsMessage,
  setSettings,
  showSettings,
  setShowSettings,
  theme,
  setTheme,
  aiProviderStatus,
  aiProviderKeyInput,
  setAiProviderKeyInput,
  updateAiProviderConfig,
  storeAiProviderKey,
  removeAiProviderKey,
  integrityReport,
  deleteTemplate,
  deletePromptTemplate,
  deleteMemoTemplate,
  addMemoTemplate,
  handleBackup,
  handleRestore,
  runIntegrity,
  handleCleanupOrphans,
  openNew,
  openImport,
  openLearningImport,
  onSubjectSelect,
}: AppSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-icon">📓</div>
        <h1>오답노트</h1>
      </div>

      <div className="section-tabs">
        {sectionTabs.map(([key, label]) => (
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
          totalCount={sectionEntryCount}
          onSelect={onSubjectSelect}
          onReorder={moveSubject}
        />
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="btn-settings"
          onClick={() => setShowSettings((value) => !value)}
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
                <div
                  className="provider-hint"
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.4rem",
                    lineHeight: "1.4",
                  }}
                >
                  • <b>flash-lite</b>: 빠르고 저렴하며 텍스트 기반의 간단한 문제에 적합합니다.
                  <br />• <b>3.5-flash</b>: 추론이 필요한 복잡한 문제나 이미지 인식(OCR)에 적합합니다.
                </div>
              </div>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.aiProvider.enabled}
                  disabled={!isTauri() || settings.aiProvider.type === "manual"}
                  onChange={(event) =>
                    updateAiProviderConfig({ enabled: event.target.checked })
                  }
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
                    onChange={(event) =>
                      setAiProviderKeyInput(event.target.value)
                    }
                    placeholder="Gemini API key"
                  />
                  <button
                    type="button"
                    className="theme-btn"
                    disabled={!isTauri()}
                    onClick={storeAiProviderKey}
                  >
                    key 저장
                  </button>
                  <button
                    type="button"
                    className="theme-btn"
                    disabled={!isTauri()}
                    onClick={removeAiProviderKey}
                  >
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
              <button
                type="button"
                className="theme-btn"
                onClick={handleCleanupOrphans}
              >
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
                    <p
                      key={issue.id}
                      className={`integrity-issue integrity-issue--${issue.severity}`}
                    >
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
                  <span>
                    {template.name}
                    {template.builtIn ? " · 기본" : ""}
                  </span>
                  {!template.builtIn && (
                    <button
                      type="button"
                      onClick={() => deletePromptTemplate(template.id)}
                    >
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
                  <span>
                    {template.name}
                    {template.builtIn ? " · 기본" : ""}
                  </span>
                  {!template.builtIn && (
                    <button
                      type="button"
                      onClick={() => deleteMemoTemplate(template.id)}
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="btn-new" onClick={openNew}>
          + 새 {entryKindName(activeSection)} 추가
        </button>
        {(activeSection === "problem_sheet" || activeSection === "concept") && (
          <button
            type="button"
            className="btn-new btn-new--secondary"
            onClick={openImport}
          >
            GPT 결과 가져오기
          </button>
        )}
        {activeSection === "lecture" && (
          <button
            type="button"
            className="btn-new btn-new--secondary"
            onClick={openLearningImport}
          >
            HTML/MD/JSON 가져오기
          </button>
        )}
      </div>
    </aside>
  );
}
