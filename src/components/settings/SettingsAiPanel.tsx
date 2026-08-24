import { isTauri } from "@tauri-apps/api/core";
import type { AiProviderType } from "../../types";

interface SettingsAiPanelProps {
  provider: { provider?: AiProviderType; type: AiProviderType; model?: string; baseUrl?: string; enabled: boolean; keySource: "env" | "tauri-settings" | "keyring" };
  status: { hasEnvKey: boolean; hasStoredKey: boolean; available: boolean } | null;
  statusLoading: boolean;
  statusError: string | null;
  keyInput: string;
  onKeyInputChange(value: string): void;
  onConfigChange(patch: Partial<{ provider: AiProviderType; type: AiProviderType; model: string; baseUrl?: string; enabled: boolean; keySource: "env" | "tauri-settings" | "keyring" }>): void;
  onStoreKey(): void;
  onRemoveKey(): void;
  onTestConnection(): void;
}

const providers: Array<[Exclude<AiProviderType, "manual" | "gemini-flash-lite" | "gemini-3.5-flash">, string]> = [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google-gemini", "Google Gemini"], ["openrouter", "OpenRouter"], ["groq", "Groq"], ["openai-compatible", "Custom / OpenAI-compatible"]];

export default function SettingsAiPanel({ provider, status, statusLoading, statusError, keyInput, onKeyInputChange, onConfigChange, onStoreKey, onRemoveKey, onTestConnection }: SettingsAiPanelProps) {
  const selectedProvider = provider.provider ?? (provider.type === "gemini-flash-lite" || provider.type === "gemini-3.5-flash" ? "google-gemini" : "openai-compatible");
  return <div className="ai-provider-settings">
    <div className="form-field"><label htmlFor="ai-provider-type">AI 제공자</label><select id="ai-provider-type" value={selectedProvider} disabled={!isTauri()} onChange={(event) => onConfigChange({ provider: event.target.value as AiProviderType })}>{providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <label className="form-field"><span>모델</span><input value={provider.model ?? ""} disabled={!isTauri()} onChange={(event) => onConfigChange({ model: event.target.value })} placeholder="예: gpt-5.1-mini" /></label>
    <label className="form-field"><span>기본 URL (선택)</span><input value={provider.baseUrl ?? ""} disabled={!isTauri()} onChange={(event) => onConfigChange({ baseUrl: event.target.value })} placeholder="https://api.example.com" /></label>
    <label className="settings-checkbox"><input type="checkbox" checked={provider.enabled} disabled={!isTauri()} onChange={(event) => onConfigChange({ enabled: event.target.checked })} /> API 사용 {isTauri() ? "(선택)" : "(데스크톱 앱에서 사용 가능)"}</label>
    <div className="theme-options">{(["env", "keyring"] as const).map((source) => <button key={source} type="button" className={`theme-btn ${provider.keySource === source || (source === "keyring" && provider.keySource === "tauri-settings") ? "active" : ""}`} disabled={!isTauri()} onClick={() => onConfigChange({ keySource: source })}>{source === "env" ? "환경변수" : "OS 보안 저장소"}</button>)}</div>
    <div className="ai-provider-status">{statusLoading ? <span>상태: 확인 중</span> : statusError ? <span role="alert">상태 확인 실패: {statusError}</span> : status ? <><span>환경변수 키: {status.hasEnvKey ? "감지됨" : "없음"}</span><span>저장된 키: {status.hasStoredKey ? "저장됨" : "없음"}</span><span>상태: {status.available ? "사용 가능" : "수동 모드 대기"}</span></> : <span>상태: 확인 대기</span>}</div>
    {provider.keySource === "tauri-settings" || provider.keySource === "keyring" ? <div className="ai-provider-key-row"><input type="password" value={keyInput} disabled={!isTauri()} onChange={(event) => onKeyInputChange(event.target.value)} placeholder="API 키" autoComplete="new-password" /><button type="button" className="theme-btn" disabled={!isTauri()} onClick={onStoreKey}>키 저장</button><button type="button" className="theme-btn" disabled={!isTauri()} onClick={onRemoveKey}>키 삭제</button></div> : null}
    <button type="button" className="btn-secondary" disabled={!isTauri() || statusLoading} onClick={onTestConnection}>연결 테스트</button>
  </div>;
}
