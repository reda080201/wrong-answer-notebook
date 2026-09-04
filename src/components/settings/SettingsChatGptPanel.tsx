import type { ChatGptMcpPreferences } from "../../types";
import type { McpBridgeRuntimeStatus } from "../../hooks/useMcpBridgeSettings";

interface SettingsChatGptPanelProps {
  preferences: ChatGptMcpPreferences;
  status: McpBridgeRuntimeStatus | null;
  onPatch(patch: Partial<ChatGptMcpPreferences>): Promise<void>;
  onSaveRemoteBaseUrl(raw: string): Promise<void>;
}

export default function SettingsChatGptPanel({ preferences, status, onPatch, onSaveRemoteBaseUrl }: SettingsChatGptPanelProps) {
  const ready = status?.status === "listening" || status?.status === "connected";
  return <div className="settings-pref-panel chatgpt-connection-center">
    <h3>ChatGPT와 오답노트 연결</h3>
    <p className="provider-hint">OpenAI API 키 없이 읽기 전용 MCP와 ChatGPT 앱 사용 흐름을 연결합니다.</p>
    <div className="chatgpt-connection-status" aria-label="ChatGPT 연결 상태">
      <p><strong>로컬 MCP</strong> {ready ? "준비됨" : "연결 대기"}</p>
      <p><strong>보안 터널</strong> {preferences.remoteBaseUrl ? "외부 URL 등록됨" : "외부 URL 미등록"}</p>
      <p><strong>ChatGPT 연결</strong> {status?.lastClientConnectedAt ? `최근 연결됨 (${new Date(status.lastClientConnectedAt).toLocaleString("ko-KR")})` : "연결 확인되지 않음"}</p>
      <p><strong>현재 문항 공유</strong> 사용자 동의 후에만 동기화합니다.</p>
    </div>
    <label className="form-field"><span>표시 이름</span><input value={preferences.displayName} maxLength={40} onChange={(event) => void onPatch({ displayName: event.target.value })} /></label>
    <label className="form-field"><span>외부 HTTPS MCP 기본 URL</span><input defaultValue={preferences.remoteBaseUrl ?? ""} placeholder="https://example-tunnel-domain" onBlur={(event) => void onSaveRemoteBaseUrl(event.target.value)} /><small>자동 tunnel helper가 없는 환경에서는 외부에서 만든 HTTPS 기본 URL을 등록하세요.</small></label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.shareUserResponse} onChange={(event) => void onPatch({ shareUserResponse: event.target.checked })} /> 내 답 공유</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.shareScratchNote} onChange={(event) => void onPatch({ shareScratchNote: event.target.checked })} /> 풀이 메모 공유</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.shareQuestionImages} onChange={(event) => void onPatch({ shareQuestionImages: event.target.checked })} /> 문항 직접 이미지 공유</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.shareSourcePageImages} onChange={(event) => void onPatch({ shareSourcePageImages: event.target.checked })} /> 원본 전체 페이지 공유</label>
  </div>;
}
