import { useEffect, useState } from "react";
import {
  MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE,
  type McpBridgeRuntimeStatus,
  type McpBridgeSettings,
} from "../hooks/useMcpBridgeSettings";
import { normalizeRemoteMcpBaseUrl } from "../features/chatgpt/services/chatGptConnection";
import type {
  EntryKind,
  EntryTemplate,
  ExamPreferences,
  GptMcpPreferences,
  ChatGptMcpPreferences,
  ImagePreferences,
  IntegrityReport,
  McpBridgePairingSession,
  ViewPreferences,
} from "../types";
import type { AppUpdateState } from "../features/updater/model/appUpdate";
import Dialog from "../shared/ui/Dialog";
import { useSettingsContext } from "../contexts/SettingsContext";
import { X } from "lucide-react";
import SettingsTabList from "./SettingsTabList";
import SettingsThemePanel from "./settings/SettingsThemePanel";
import SettingsViewPanel from "./settings/SettingsViewPanel";
import { SettingsAdvancedPanel, SettingsDataPanel, SettingsExamPanel, SettingsImagesPanel, SettingsLibraryPanel, SettingsUpdatesPanel } from "./settings/SettingsOperationalPanels";
import SettingsAiPanel from "./settings/SettingsAiPanel";
import SettingsTemplatesPanel from "./settings/SettingsTemplatesPanel";

export type SettingsTab =
  | "theme"
  | "ai"
  | "view"
  | "library"
  | "exam"
  | "images"
  | "gpt-mcp"
  | "chatgpt"
  | "data"
  | "templates"
  | "advanced"
  | "updates";

const SETTINGS_TABS: Array<[SettingsTab, string]> = [
  ["theme", "테마"],
  ["ai", "AI 설정"],
  ["view", "보기"],
  ["library", "보관함"],
  ["exam", "시험"],
  ["images", "이미지"],
  ["gpt-mcp", "GPT·MCP"],
  ["chatgpt", "ChatGPT 연결"],
  ["data", "데이터 관리"],
  ["templates", "템플릿"],
  ["advanced", "고급"],
  ["updates", "업데이트"],
];

interface SettingsModalProps {
  onClose: () => void;
  initialTab?: SettingsTab;
  dataActions: {
    integrityReport: IntegrityReport | null;
    backup: () => Promise<void>;
    restore: () => Promise<void>;
    runIntegrity: () => Promise<void>;
    cleanupOrphans: () => Promise<void>;
  };
  updateActions: {
    state: AppUpdateState;
    check: () => Promise<void>;
    install: () => Promise<void>;
    restart: () => Promise<void>;
    openReleasePage: () => void;
  };
}

export default function SettingsModal({
  onClose,
  initialTab,
  dataActions,
  updateActions,
}: SettingsModalProps) {
  const ctx = useSettingsContext();
  const settings = ctx.settings;
  const settingsError = ctx.settingsError;
  const settingsSaveState = ctx.settingsSaveState;
  const retrySettingsSave = ctx.retrySettingsSave;
  const settingsMessage = ctx.settingsMessage;
  const clearSettingsError = ctx.clearSettingsError;
  const setSettingsMessage = ctx.setSettingsMessage;
  const patchSettings = ctx.patchSettings;
  const theme = ctx.theme.current;
  const setTheme = ctx.theme.set;
  const aiProviderStatus = ctx.aiProvider.status;
  const aiProviderStatusLoading = ctx.aiProvider.statusLoading;
  const aiProviderStatusError = ctx.aiProvider.statusError;
  const aiProviderKeyInput = ctx.aiProvider.keyInput;
  const setAiProviderKeyInput = ctx.aiProvider.setKeyInput;
  const updateAiProviderConfig = ctx.aiProvider.updateConfig;
  const storeAiProviderKey = ctx.aiProvider.storeKey;
  const removeAiProviderKey = ctx.aiProvider.removeKey;
  const saveTemplate = ctx.templates.save;
  const deleteTemplate = ctx.templates.delete;
  const savePromptTemplate = ctx.promptTemplates.save;
  const saveMemoTemplate = ctx.memoTemplates.save;
  const deletePromptTemplate = ctx.promptTemplates.delete;
  const deleteMemoTemplate = ctx.memoTemplates.delete;
  const integrityReport = dataActions.integrityReport;
  const handleBackup = dataActions.backup;
  const handleRestore = dataActions.restore;
  const runIntegrity = dataActions.runIntegrity;
  const handleCleanupOrphans = dataActions.cleanupOrphans;
  const mcpBridgeSettings = ctx.mcpBridge.settings;
  const mcpBridgeStatus = ctx.mcpBridge.status;
  const mcpBridgePortInput = ctx.mcpBridge.portInput;
  const setMcpBridgePortInput = ctx.mcpBridge.setPortInput;
  const updateMcpBridgeConfig = ctx.mcpBridge.updateConfig;
  const applyMcpBridgePort = ctx.mcpBridge.applyPort;
  const testMcpBridgeConnection = async () => { await ctx.mcpBridge.testConnection(); };
  const createMcpBridgePairing = ctx.mcpBridge.createPairing;
  const rotateMcpBridgeCredential = ctx.mcpBridge.rotateCredential;
  const disconnectMcpBridgeClients = ctx.mcpBridge.disconnectClients;
  const mcpBridgePairingSession = ctx.mcpBridge.pairingSession;
  const isMcpBridgePairingPending = ctx.mcpBridge.isPairingPending;
  const isMcpBridgeConnectionTesting = ctx.mcpBridge.isConnectionTesting;
  const isMcpBridgeBrowserBlocked = ctx.mcpBridge.isBrowserBlocked;
  const updateState = updateActions.state;
  const onCheckForUpdate = updateActions.check;
  const onInstallUpdate = updateActions.install;
  const onRestartAfterUpdate = updateActions.restart;
  const onOpenReleasePage = updateActions.openReleasePage;
  const onPatchUpdatePreferences = ctx.updates.patchPreferences;

  const bridgePortValue = mcpBridgePortInput ?? String(mcpBridgeSettings.port);
  const bridgeControlsDisabled = isMcpBridgeBrowserBlocked;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "theme");
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const patchView = async (patch: Partial<ViewPreferences>) => {
    await ctx.viewPreferences.patch(patch);
  };
  const patchExam = async (patch: Partial<ExamPreferences>) => {
    await ctx.examPreferences.patch(patch);
  };
  const patchImages = async (patch: Partial<ImagePreferences>) => {
    await ctx.imagePreferences.patch(patch);
  };
  const patchGptMcp = async (patch: Partial<GptMcpPreferences>) => {
    await ctx.gptMcpPreferences.patch(patch);
  };
  const patchChatGpt = async (patch: Partial<ChatGptMcpPreferences>) => {
    await ctx.chatGptMcpPreferences.patch(patch);
  };

  const saveRemoteBaseUrl = async (raw: string) => {
    if (!raw.trim()) {
      await patchChatGpt({ remoteBaseUrl: undefined });
      return;
    }
    const normalized = normalizeRemoteMcpBaseUrl(raw);
    await patchChatGpt({ remoteBaseUrl: normalized.baseUrl });
  };
  const [templateDraft, setTemplateDraft] = useState<{ kind: "entry" | "prompt" | "memo"; id?: string; name: string; content: string } | null>(null);

  return (
    <Dialog open onClose={onClose} className="settings-modal" ariaLabel="설정" size="xl" scrollMode="custom">
        <header className="modal-head">
          <div>
            <h2>설정</h2>
            <p className="form-hint">보기, 시험, 연결과 데이터 동작을 관리합니다.</p>
          </div>
          <button type="button" className="btn-icon" aria-label="닫기" title="닫기" onClick={onClose}>
            <X size={18} aria-hidden="true" />
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
        {settingsSaveState === "saving" && <p className="form-hint" role="status">설정 저장 중...</p>}
        {settingsSaveState === "error" && retrySettingsSave && <button type="button" className="btn-secondary" onClick={() => void retrySettingsSave()}>설정 다시 저장</button>}

        <div className="settings-modal-body">
          <nav className="settings-modal-tabs" aria-label="설정 탭">
            <SettingsTabList activeTab={activeTab} tabs={SETTINGS_TABS} onSelect={setActiveTab} />
          </nav>

          <section className="settings-modal-panel">
            {activeTab === "theme" && (
              <SettingsThemePanel theme={theme} onThemeChange={setTheme} />
            )}

            {activeTab === "ai" && (
              <SettingsAiPanel provider={settings.aiProvider} status={aiProviderStatus} statusLoading={aiProviderStatusLoading} statusError={aiProviderStatusError} keyInput={aiProviderKeyInput} onKeyInputChange={setAiProviderKeyInput} onConfigChange={updateAiProviderConfig} onStoreKey={storeAiProviderKey} onRemoveKey={removeAiProviderKey} />
            )}

            {activeTab === "view" && (
              <SettingsViewPanel
                preferences={settings.viewPreferences}
                onPatch={patchView}
              />
            )}

            {activeTab === "library" && (
              <SettingsLibraryPanel preferences={settings.libraryPreferences} onPatch={(patch) => void patchSettings({ libraryPreferences: { ...(settings.libraryPreferences ?? { separateMockExams: false, defaultUnitView: "home", listDensity: "standard", showUserFolders: true }), ...patch } })} />
            )}

            {activeTab === "exam" && (
              <SettingsExamPanel preferences={settings.examPreferences} onPatch={(patch) => void patchExam(patch)} />
            )}

            {activeTab === "images" && (
              <SettingsImagesPanel preferences={settings.imagePreferences} onPatch={(patch) => void patchImages(patch)} />
            )}

            {activeTab === "gpt-mcp" && (
              <div className="settings-pref-panel">
                <p className="settings-label">GPT·MCP</p>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.gptMcpPreferences.importReviewExpanded} onChange={(event) => void patchGptMcp({ importReviewExpanded: event.target.checked })} /> 가져오기 검토 기본 펼침</label>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.gptMcpPreferences.importDetailCollapsedByDefault} onChange={(event) => void patchGptMcp({ importDetailCollapsedByDefault: event.target.checked })} /> 문항 상세 기본 접기</label>
                <p className="settings-label">MCP 공유 범위</p>
                <div className="theme-options">
                  {([["current-question", "현재 문항"], ["session-summary", "세션 요약"], ["submitted-result", "제출 결과"]] as const).map(([value, label]) => (
                    <button key={value} type="button" className={`theme-btn ${settings.gptMcpPreferences.mcpShareScope === value ? "active" : ""}`} onClick={() => void patchGptMcp({ mcpShareScope: value })}>{label}</button>
                  ))}
                </div>
                <McpBridgeSettingsPanel
                  settings={mcpBridgeSettings}
                  status={mcpBridgeStatus}
                  portInput={bridgePortValue}
                  controlsDisabled={bridgeControlsDisabled}
                  connectionTesting={isMcpBridgeConnectionTesting}
                  onPortInputChange={setMcpBridgePortInput}
                  onApplyPort={applyMcpBridgePort}
                  onToggleEnabled={(enabled) => updateMcpBridgeConfig({ enabled })}
                  onTestConnection={testMcpBridgeConnection}
                  onCreatePairing={createMcpBridgePairing}
                  onRotateCredential={rotateMcpBridgeCredential}
                  onDisconnectClients={disconnectMcpBridgeClients}
                  pairingSession={mcpBridgePairingSession}
                  pairingPending={isMcpBridgePairingPending}
                />
              </div>
            )}

            {activeTab === "chatgpt" && (
              <div className="settings-pref-panel chatgpt-connection-center">
                <h3>ChatGPT와 오답노트 연결</h3>
                <p className="provider-hint">OpenAI API 키 없이 읽기 전용 MCP와 ChatGPT 앱 사용 흐름을 연결합니다.</p>
                <div className="chatgpt-connection-status" aria-label="ChatGPT 연결 상태">
                  <p><strong>로컬 MCP</strong> {mcpBridgeStatus?.status === "listening" || mcpBridgeStatus?.status === "connected" ? "준비됨" : "연결 대기"}</p>
                  <p><strong>보안 터널</strong> {settings.chatGptMcpPreferences.remoteBaseUrl ? "외부 URL 등록됨" : "외부 URL 미등록"}</p>
                  <p><strong>ChatGPT 연결</strong> {mcpBridgeStatus?.lastClientConnectedAt ? `최근 연결됨 (${new Date(mcpBridgeStatus.lastClientConnectedAt).toLocaleString("ko-KR")})` : "연결 확인되지 않음"}</p>
                  <p><strong>현재 문항 공유</strong> 사용자 동의 후에만 동기화합니다.</p>
                </div>
                <label className="form-field">
                  <span>표시 이름</span>
                  <input value={settings.chatGptMcpPreferences.displayName} maxLength={40} onChange={(event) => void patchChatGpt({ displayName: event.target.value })} />
                </label>
                <label className="form-field">
                  <span>외부 HTTPS MCP 기본 URL</span>
                  <input defaultValue={settings.chatGptMcpPreferences.remoteBaseUrl ?? ""} placeholder="https://example-tunnel-domain" onBlur={(event) => void saveRemoteBaseUrl(event.target.value).catch((error) => setSettingsMessage(error instanceof Error ? error.message : "외부 MCP URL을 저장하지 못했습니다."))} />
                  <small>자동 tunnel helper가 없는 환경에서는 외부에서 만든 HTTPS 기본 URL을 등록하세요.</small>
                </label>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.chatGptMcpPreferences.shareUserResponse} onChange={(event) => void patchChatGpt({ shareUserResponse: event.target.checked })} /> 내 답 공유</label>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.chatGptMcpPreferences.shareScratchNote} onChange={(event) => void patchChatGpt({ shareScratchNote: event.target.checked })} /> 풀이 메모 공유</label>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.chatGptMcpPreferences.shareQuestionImages} onChange={(event) => void patchChatGpt({ shareQuestionImages: event.target.checked })} /> 문항 직접 이미지 공유</label>
                <label className="settings-checkbox"><input type="checkbox" checked={settings.chatGptMcpPreferences.shareSourcePageImages} onChange={(event) => void patchChatGpt({ shareSourcePageImages: event.target.checked })} /> 원본 전체 페이지 공유</label>
                <p className="provider-hint">사용 가능한 MCP 기능은 ChatGPT 계정, 워크스페이스 및 단계적 출시 상태에 따라 다를 수 있습니다. ChatGPT 설정의 앱 메뉴에서 사용자 지정 MCP 연결 가능 여부를 확인하세요.</p>
                <McpBridgeSettingsPanel
                  settings={mcpBridgeSettings}
                  status={mcpBridgeStatus}
                  portInput={bridgePortValue}
                  controlsDisabled={bridgeControlsDisabled}
                  connectionTesting={isMcpBridgeConnectionTesting}
                  onPortInputChange={setMcpBridgePortInput}
                  onApplyPort={applyMcpBridgePort}
                  onToggleEnabled={(enabled) => updateMcpBridgeConfig({ enabled })}
                  onTestConnection={testMcpBridgeConnection}
                  onCreatePairing={createMcpBridgePairing}
                  onRotateCredential={rotateMcpBridgeCredential}
                  onDisconnectClients={disconnectMcpBridgeClients}
                  pairingSession={mcpBridgePairingSession}
                  pairingPending={isMcpBridgePairingPending}
                />
              </div>
            )}

            {activeTab === "data" && (
              <SettingsDataPanel settings={settings} report={integrityReport} onBackup={() => void handleBackup()} onRestore={() => void handleRestore()} onIntegrity={() => void runIntegrity()} onCleanup={() => void handleCleanupOrphans()} onAutoBackupChange={(enabled) => void patchSettings({ autoBackup: { ...settings.autoBackup, enabled } })} />
            )}

            {activeTab === "templates" && (
              <SettingsTemplatesPanel
                templates={settings.templates}
                promptTemplates={settings.promptTemplates}
                memoTemplates={settings.memoTemplates}
                saveTemplate={saveTemplate}
                deleteTemplate={deleteTemplate}
                savePromptTemplate={savePromptTemplate}
                deletePromptTemplate={deletePromptTemplate}
                saveMemoTemplate={saveMemoTemplate}
                deleteMemoTemplate={deleteMemoTemplate}
                onError={setSettingsMessage}
              />
            )}

            {false && activeTab === "templates" && (
              <>
                <p className="settings-label">입력 템플릿</p>
                <TemplateList
                  empty="저장된 템플릿이 없습니다."
                  items={settings.templates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: false,
                    onDelete: () => deleteTemplate(template.id),
                    onEdit: () => setTemplateDraft({
                      kind: "entry",
                      id: template.id,
                      name: template.name,
                      content: JSON.stringify(template.data, null, 2),
                    }),
                  }))}
                />
                <p className="settings-label">GPT 프롬프트 템플릿</p>
                <TemplateList
                  items={settings.promptTemplates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: template.builtIn,
                    onDelete: () => deletePromptTemplate(template.id),
                    onEdit: () => setTemplateDraft({ kind: "prompt", id: template.id, name: template.name, content: template.content }),
                    onCopy: () => setTemplateDraft({ kind: "prompt", name: `${template.name} 복사본`, content: template.content }),
                  }))}
                />
                <p className="settings-label">메모 템플릿</p>
                <button type="button" className="theme-btn" onClick={() => setTemplateDraft({ kind: "memo", name: "", content: "" })}>
                  메모 템플릿 추가
                </button>
                <TemplateList
                  items={settings.memoTemplates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    builtIn: template.builtIn,
                    onDelete: () => deleteMemoTemplate(template.id),
                    onEdit: () => setTemplateDraft({ kind: "memo", id: template.id, name: template.name, content: template.content }),
                    onCopy: () => setTemplateDraft({ kind: "memo", name: `${template.name} 복사본`, content: template.content }),
                  }))}
                />
                {templateDraft && (
                  <form
                    className="template-edit-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const name = templateDraft!.name.trim();
                      const content = templateDraft!.content.trim();
                      if (!name || !content) return;
                      try {
                        if (templateDraft!.kind === "prompt") {
                          await savePromptTemplate({ id: templateDraft!.id ?? crypto.randomUUID(), name, content });
                        } else if (templateDraft!.kind === "entry") {
                          const data = JSON.parse(content) as EntryTemplate["data"];
                          const entryKind: EntryKind =
                            data.entryKind === "concept" || data.entryKind === "problem_sheet" || data.entryKind === "lecture"
                              ? data.entryKind
                              : "wrong_answer";
                          await saveTemplate({ id: templateDraft!.id ?? crypto.randomUUID(), name, entryKind, data });
                        } else {
                          await saveMemoTemplate({ id: templateDraft!.id ?? crypto.randomUUID(), name, content });
                        }
                      } catch (error) {
                        setSettingsMessage(error instanceof Error ? error.message : "템플릿 저장에 실패했습니다.");
                        return;
                      }
                      setTemplateDraft(null);
                    }}
                  >
                    <label>
                      이름
                      <input value={templateDraft!.name} onChange={(event) => setTemplateDraft({ ...templateDraft!, name: event.target.value })} />
                    </label>
                    <label>
                      내용
                      <textarea value={templateDraft!.content} onChange={(event) => setTemplateDraft({ ...templateDraft!, content: event.target.value })} />
                    </label>
                    <div className="settings-actions">
                      <button type="submit" className="theme-btn">저장</button>
                      <button type="button" className="theme-btn" onClick={() => setTemplateDraft(null)}>취소</button>
                    </div>
                  </form>
                )}
              </>
            )}

            {activeTab === "advanced" && (
              <SettingsAdvancedPanel />
            )}

            {activeTab === "updates" && (
              <SettingsUpdatesPanel state={updateState} onCheck={() => void onCheckForUpdate()} onInstall={() => void onInstallUpdate()} onRestart={() => void onRestartAfterUpdate()} onOpenRelease={onOpenReleasePage} preferences={settings.updatePreferences} onPatch={(patch) => void onPatchUpdatePreferences(patch)} />
            )}
          </section>
        </div>
    </Dialog>
  );
}

function TemplateList({
  items,
  empty = "템플릿이 없습니다.",
}: {
  items: Array<{ id: string; name: string; builtIn?: boolean; onDelete: () => void; onEdit?: () => void; onCopy?: () => void }>;
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
              <>
                {item.onEdit && <button type="button" onClick={item.onEdit}>편집</button>}
                <button type="button" onClick={item.onDelete}>삭제</button>
              </>
            )}
            {item.builtIn && item.onCopy && (
              <button type="button" onClick={item.onCopy}>
                복사해서 편집
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}


function mcpBridgeStatusLabel(status: McpBridgeRuntimeStatus["status"]): string {
  switch (status) {
    case "disabled":
      return "꺼짐";
    case "idle":
      return "대기";
    case "starting":
      return "시작 중";
    case "listening":
      return "수신 중";
    case "connected":
      return "연결됨";
    case "error":
      return "오류";
    default:
      return status;
  }
}

function formatMcpStatusTime(value: string): string {
  // Rust stores bridge timestamps as epoch seconds while fixtures and older
  // bridge builds may return ISO strings. Keep this presentation boundary
  // tolerant without changing the public status contract.
  const epochSeconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  const date = epochSeconds === null ? new Date(value) : new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function McpBridgeSettingsPanel({
  settings,
  status,
  portInput,
  controlsDisabled,
  connectionTesting,
  onPortInputChange,
  onApplyPort,
  onToggleEnabled,
  onTestConnection,
  onCreatePairing,
  onRotateCredential,
  onDisconnectClients,
  pairingSession,
  pairingPending,
}: {
  settings: McpBridgeSettings;
  status: McpBridgeRuntimeStatus | null;
  portInput: string;
  controlsDisabled: boolean;
  connectionTesting: boolean;
  onPortInputChange?: (value: string) => void;
  onApplyPort?: () => Promise<void>;
  onToggleEnabled: (enabled: boolean) => void;
  onTestConnection?: () => Promise<void>;
  onCreatePairing?: () => Promise<void>;
  onRotateCredential?: () => Promise<void>;
  onDisconnectClients?: () => Promise<void>;
  pairingSession: McpBridgePairingSession | null;
  pairingPending: boolean;
}) {
  const activePort = status?.port ?? (settings.enabled ? settings.port : null);
  const connectionTestLabel =
    status?.lastTestOk === true
      ? "성공"
      : status?.lastTestOk === false
        ? "실패"
        : "아직 실행하지 않음";

  return (
    <div className="ai-provider-settings mcp-bridge-settings">
      <p className="settings-label">MCP 브릿지</p>
      <p className="provider-hint">
        외부 AI 도구가 오답노트 데이터에 접근할 수 있도록 로컬 브릿지를 켭니다. 기본값은 꺼짐이며, 브라우저 모드에서는 사용할 수 없습니다.
      </p>

      {controlsDisabled && (
        <p className="integrity-issue integrity-issue--warning" role="status">
          {MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE}
        </p>
      )}

      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={controlsDisabled}
          onChange={(event) => onToggleEnabled(event.target.checked)}
        />
        MCP 브릿지 사용 {controlsDisabled ? "(데스크톱 앱에서 사용 가능)" : "(기본: 꺼짐)"}
      </label>

      <div className="form-field">
        <label htmlFor="mcp-bridge-port">포트</label>
        <div className="ai-provider-key-row">
          <input
            id="mcp-bridge-port"
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            disabled={controlsDisabled || !settings.enabled}
            onChange={(event) => onPortInputChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onApplyPort?.();
              }
            }}
          />

          <button
            type="button"
            className="theme-btn"
            disabled={controlsDisabled || !settings.enabled || !onApplyPort}
            onClick={() => void onApplyPort?.()}
          >
            포트 적용
          </button>
          <button
            type="button"
            className="theme-btn"
            disabled={controlsDisabled || !settings.enabled || connectionTesting || !onTestConnection}
            onClick={() => void onTestConnection?.()}
          >
            {connectionTesting ? "연결 테스트 중…" : "연결 테스트"}
          </button>
        </div>
        <p className="provider-hint">로컬 MCP 클라이언트가 접속할 TCP 포트입니다. (1024~65535)</p>
      </div>

      <p className="provider-hint">읽기 전용으로 고정됩니다. 외부 도구는 노트·이미지·설정을 수정할 수 없습니다.</p>

      <section className="mcp-pairing-controls" aria-label="MCP 연결 관리">
        <p className="settings-label">안전한 연결</p>
        <p className="provider-hint">
          영구 인증 토큰은 표시하거나 복사할 수 없습니다. 이 코드는 앱의 페어링 규칙을 지원하는 로컬 MCP 클라이언트에만 입력하세요.
        </p>
        <div className="settings-actions">
          <button type="button" className="theme-btn" disabled={controlsDisabled || !settings.enabled || pairingPending || !onCreatePairing} onClick={() => void onCreatePairing?.()}>
            {pairingPending ? "연결 코드 생성 중…" : "연결 코드 만들기"}
          </button>
          <button type="button" className="theme-btn" disabled={controlsDisabled || !settings.enabled || !onRotateCredential} onClick={() => void onRotateCredential?.()}>
            연결 자격 증명 회전
          </button>
          <button type="button" className="theme-btn" disabled={controlsDisabled || !settings.enabled || !onDisconnectClients} onClick={() => void onDisconnectClients?.()}>
            모든 연결 해제
          </button>
        </div>
        {pairingSession && (
          <div className="mcp-pairing-code" role="status">
            <span>일회성 연결 코드</span>
            <code>{pairingSession.code}</code>
            <span>만료: {new Date(Number(pairingSession.expiresAt)).toLocaleString("ko-KR")}</span>
            {pairingSession.pairingUrl && <span>코드 교환: {pairingSession.pairingUrl}</span>}
            <span>MCP: {pairingSession.mcpUrl ?? pairingSession.bridgeUrl}</span>
          </div>
        )}
      </section>

      <div className="ai-provider-status mcp-bridge-status" aria-live="polite">
        <span>상태: {mcpBridgeStatusLabel(status?.status ?? "disabled")}</span>
        <span>포트: {activePort ?? "—"}</span>
        <span>읽기 전용: 예</span>
        <span>
          마지막 연결 테스트: {connectionTestLabel}
          {status?.lastTestAt
            ? ` · ${formatMcpStatusTime(status.lastTestAt)}`
            : ""}
        </span>
        <span>
          마지막 외부 클라이언트 접속:
          {status?.lastClientConnectedAt
            ? ` ${formatMcpStatusTime(status.lastClientConnectedAt)}`
            : " 아직 없음"}
        </span>
        {typeof status?.clientCount === "number" && (
          <span>연결된 클라이언트: {status.clientCount}</span>
        )}
        {status?.message && <span>안내: {status.message}</span>}
        {status?.error && (
          <span className="integrity-issue integrity-issue--error">오류: {status.error}</span>
        )}
      </div>
    </div>
  );
}
