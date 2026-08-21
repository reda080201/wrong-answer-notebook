import { isTauri } from "@tauri-apps/api/core";
import type { AiProviderType } from "../../types";

interface SettingsAiPanelProps {
  provider: { type: AiProviderType; enabled: boolean; keySource: "env" | "tauri-settings" };
  status: { hasEnvKey: boolean; hasStoredKey: boolean; available: boolean } | null;
  statusLoading: boolean;
  statusError: string | null;
  keyInput: string;
  onKeyInputChange(value: string): void;
  onConfigChange(patch: Partial<{ type: AiProviderType; enabled: boolean; keySource: "env" | "tauri-settings" }>): void;
  onStoreKey(): void;
  onRemoveKey(): void;
}

export default function SettingsAiPanel({ provider, status, statusLoading, statusError, keyInput, onKeyInputChange, onConfigChange, onStoreKey, onRemoveKey }: SettingsAiPanelProps) {
  return <div className="ai-provider-settings">
    <div className="form-field"><label htmlFor="ai-provider-type">AI 제공자</label><select id="ai-provider-type" value={provider.type} disabled={!isTauri()} onChange={(event) => onConfigChange({ type: event.target.value as AiProviderType })}><option value="manual">수동 입력</option><option value="gemini-flash-lite">Gemini Flash Lite</option><option value="gemini-3.5-flash">Gemini 3.5 Flash</option></select><p className="provider-hint">flash-lite는 빠른 정리에, 3.5-flash는 이미지 인식과 복잡한 추론에 맞춰 사용합니다.</p></div>
    <label className="settings-checkbox"><input type="checkbox" checked={provider.enabled} disabled={!isTauri() || provider.type === "manual"} onChange={(event) => onConfigChange({ enabled: event.target.checked })} /> API 사용 {isTauri() ? "(선택)" : "(데스크톱 앱에서 사용 가능)"}</label>
    <div className="theme-options">{(["env", "tauri-settings"] as const).map((source) => <button key={source} type="button" className={`theme-btn ${provider.keySource === source ? "active" : ""}`} disabled={!isTauri()} onClick={() => onConfigChange({ keySource: source })}>{source === "env" ? "환경변수" : "OS 보안 저장소"}</button>)}</div>
    <div className="ai-provider-status">{statusLoading ? <span>상태: 확인 중</span> : statusError ? <span role="alert">상태 확인 실패: {statusError}</span> : status ? <><span>환경변수 키: {status.hasEnvKey ? "감지됨" : "없음"}</span><span>저장된 키: {status.hasStoredKey ? "저장됨" : "없음"}</span><span>상태: {status.available ? "사용 가능" : "수동 모드 대기"}</span></> : <span>상태: 확인 대기</span>}</div>
    {provider.keySource === "tauri-settings" && <div className="ai-provider-key-row"><input type="password" value={keyInput} disabled={!isTauri()} onChange={(event) => onKeyInputChange(event.target.value)} placeholder="Gemini API 키" /><button type="button" className="theme-btn" disabled={!isTauri()} onClick={onStoreKey}>키 저장</button><button type="button" className="theme-btn" disabled={!isTauri()} onClick={onRemoveKey}>키 삭제</button></div>}
  </div>;
}
