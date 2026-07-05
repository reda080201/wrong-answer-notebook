import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type {
  AiProviderStatus,
  AiProviderType,
  AppSettings,
  IntegrityReport,
  ThemeMode,
} from "../types";

type SettingsTab = "theme" | "ai" | "data" | "templates" | "advanced";

interface SettingsModalProps {
  settings: AppSettings;
  settingsError: string | null;
  settingsMessage: string | null;
  clearSettingsError: () => void;
  setSettingsMessage: (message: string | null) => void;
  setSettings: (settings: AppSettings) => Promise<void>;
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
  onClose: () => void;
}

export default function SettingsModal({
  settings,
  settingsError,
  settingsMessage,
  clearSettingsError,
  setSettingsMessage,
  setSettings,
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
  onClose,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="설정">
      <div className="settings-modal">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Settings</span>
            <h2>설정</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </header>

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

        <div className="settings-modal-body">
          <nav className="settings-modal-tabs" aria-label="설정 탭">
            {(
              [
                ["theme", "테마"],
                ["ai", "AI Provider"],
                ["data", "데이터 관리"],
                ["templates", "템플릿"],
                ["advanced", "고급"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? "active" : ""}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          <section className="settings-modal-panel">
            {activeTab === "theme" && (
              <>
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
              </>
            )}

            {activeTab === "ai" && (
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
                  <p className="provider-hint">
                    flash-lite는 빠른 정리에, 3.5-flash는 이미지 인식과 복잡한 추론에 맞춰 사용합니다.
                  </p>
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
            )}

            {activeTab === "data" && (
              <>
                <div className="settings-actions">
                  <button type="button" className="theme-btn" onClick={handleBackup}>백업 만들기</button>
                  <button type="button" className="theme-btn" onClick={handleRestore}>백업 복원</button>
                  <button type="button" className="theme-btn" onClick={runIntegrity}>무결성 검사</button>
                  <button type="button" className="theme-btn" onClick={handleCleanupOrphans}>미사용 이미지 정리</button>
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
                      integrityReport.issues.slice(0, 8).map((issue) => (
                        <p key={issue.id} className={`integrity-issue integrity-issue--${issue.severity}`}>
                          {issue.message}
                        </p>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === "templates" && (
              <>
                <p className="settings-label">입력 템플릿</p>
                <TemplateList
                  empty="저장된 템플릿이 없습니다."
                  items={settings.templates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: false,
                    onDelete: () => deleteTemplate(template.id),
                  }))}
                />
                <p className="settings-label">GPT 프롬프트 템플릿</p>
                <TemplateList
                  items={settings.promptTemplates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: template.builtIn,
                    onDelete: () => deletePromptTemplate(template.id),
                  }))}
                />
                <p className="settings-label">메모 템플릿</p>
                <div className="settings-actions">
                  <button type="button" className="theme-btn" onClick={addMemoTemplate}>
                    메모 템플릿 추가
                  </button>
                </div>
                <TemplateList
                  items={settings.memoTemplates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: template.builtIn,
                    onDelete: () => deleteMemoTemplate(template.id),
                  }))}
                />
              </>
            )}

            {activeTab === "advanced" && (
              <div className="advanced-settings-panel">
                <p>고급 설정은 데이터 보존과 진단 기능 중심으로 유지됩니다.</p>
                <button type="button" className="theme-btn" onClick={runIntegrity}>
                  무결성 검사 다시 실행
                </button>
                <button type="button" className="theme-btn" onClick={handleCleanupOrphans}>
                  미사용 이미지 정리
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TemplateList({
  items,
  empty = "템플릿이 없습니다.",
}: {
  items: Array<{ id: string; name: string; builtIn?: boolean; onDelete: () => void }>;
  empty?: string;
}) {
  return (
    <div className="template-list">
      {items.length === 0 ? (
        <span className="template-empty">{empty}</span>
      ) : (
        items.map((item) => (
          <div key={item.id} className="template-item">
            <span>
              {item.name}
              {item.builtIn ? " · 기본" : ""}
            </span>
            {!item.builtIn && (
              <button type="button" onClick={item.onDelete}>
                삭제
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
