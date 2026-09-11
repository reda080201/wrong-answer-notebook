import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { AiProviderType } from "../../types";

interface SettingsAiPanelProps {
  provider: { provider?: AiProviderType; type: AiProviderType; model?: string; baseUrl?: string; enabled: boolean; keySource: "env" | "tauri-settings" | "keyring" };
  status: { hasEnvKey: boolean; hasStoredKey: boolean; available: boolean } | null;
  statusLoading: boolean;
  operationPending?: boolean;
  statusError: string | null;
  keyInput: string;
  onKeyInputChange(value: string): void;
  onConfigChange(patch: Partial<{ provider: AiProviderType; type: AiProviderType; model: string; baseUrl?: string; enabled: boolean; keySource: "env" | "tauri-settings" | "keyring" }>): Promise<boolean> | boolean | void;
  onStoreKey(): void;
  onRemoveKey(): void;
  onTestConnection(): void;
}

const providers: Array<[Exclude<AiProviderType, "manual" | "gemini-flash-lite" | "gemini-3.5-flash">, string]> = [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google-gemini", "Google Gemini"], ["openrouter", "OpenRouter"], ["groq", "Groq"], ["openai-compatible", "Custom / OpenAI-compatible"]];

export default function SettingsAiPanel({ provider, status, statusLoading, operationPending = false, statusError, keyInput, onKeyInputChange, onConfigChange, onStoreKey, onRemoveKey, onTestConnection }: SettingsAiPanelProps) {
  const selectedProvider = provider.provider ?? (provider.type === "gemini-flash-lite" || provider.type === "gemini-3.5-flash" ? "google-gemini" : "openai-compatible");
  const [modelDraft, setModelDraft] = useState(provider.model ?? "");
  const [baseUrlDraft, setBaseUrlDraft] = useState(provider.baseUrl ?? "");
  const modelDirtyRef = useRef(false);
  const baseUrlDirtyRef = useRef(false);
  const modelCommitRef = useRef<string | null>(null);
  const baseUrlCommitRef = useRef<string | null>(null);
  const providerIdentity = `${selectedProvider}:${provider.type}`;
  const previousProviderIdentityRef = useRef(providerIdentity);
  useEffect(() => {
    if (previousProviderIdentityRef.current !== providerIdentity) {
      previousProviderIdentityRef.current = providerIdentity;
      modelDirtyRef.current = false;
      baseUrlDirtyRef.current = false;
      setModelDraft(provider.model ?? "");
      setBaseUrlDraft(provider.baseUrl ?? "");
      return;
    }
    if (!modelDirtyRef.current) setModelDraft(provider.model ?? "");
    if (!baseUrlDirtyRef.current) setBaseUrlDraft(provider.baseUrl ?? "");
  }, [provider.model, provider.baseUrl, providerIdentity]);
  const commitModel = async () => {
    const value = modelDraft;
    if (modelCommitRef.current === value || value === (provider.model ?? "")) {
      modelDirtyRef.current = false;
      return;
    }
    const identity = providerIdentity;
    modelCommitRef.current = value;
    modelDirtyRef.current = false;
    const saved = await onConfigChange({ model: value });
    if (saved === false && providerIdentity === identity && modelDraft === value) {
      modelDirtyRef.current = true;
    }
    if (modelCommitRef.current === value) modelCommitRef.current = null;
  };
  const commitBaseUrl = async () => {
    const value = baseUrlDraft;
    if (baseUrlCommitRef.current === value || value === (provider.baseUrl ?? "")) {
      baseUrlDirtyRef.current = false;
      return;
    }
    const identity = providerIdentity;
    baseUrlCommitRef.current = value;
    baseUrlDirtyRef.current = false;
    const saved = await onConfigChange({ baseUrl: value });
    if (saved === false && providerIdentity === identity && baseUrlDraft === value) {
      baseUrlDirtyRef.current = true;
    }
    if (baseUrlCommitRef.current === value) baseUrlCommitRef.current = null;
  };
  const controlsDisabled = !isTauri() || statusLoading || operationPending;
  return <div className="ai-provider-settings">
    <div className="form-field"><label htmlFor="ai-provider-type">AI 제공자</label><select id="ai-provider-type" value={selectedProvider} disabled={controlsDisabled} onChange={(event) => onConfigChange({ provider: event.target.value as AiProviderType })}>{providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <label className="form-field"><span>모델</span><input value={modelDraft} disabled={controlsDisabled} onChange={(event) => { modelDirtyRef.current = true; setModelDraft(event.target.value); }} onBlur={() => void commitModel()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder={selectedProvider === "openrouter" ? "예: openai/gpt-5.1-mini" : "예: gpt-5.1-mini"} /></label>
    <label className="settings-checkbox"><input type="checkbox" checked={provider.enabled} disabled={controlsDisabled} onChange={(event) => onConfigChange({ enabled: event.target.checked })} /> API 사용 {isTauri() ? "(선택)" : "(데스크톱 앱에서 사용 가능)"}</label>
    <div className="theme-options">{(["env", "keyring"] as const).map((source) => <button key={source} type="button" className={`theme-btn ${provider.keySource === source || (source === "keyring" && provider.keySource === "tauri-settings") ? "active" : ""}`} disabled={controlsDisabled} onClick={() => onConfigChange({ keySource: source })}>{source === "env" ? "환경변수" : "OS 보안 저장소"}</button>)}</div>
    {provider.keySource === "tauri-settings" || provider.keySource === "keyring" ? <div className="ai-provider-key-row"><input type="password" value={keyInput} disabled={controlsDisabled} onChange={(event) => onKeyInputChange(event.target.value)} placeholder="API 키" autoComplete="new-password" /><button type="button" className="theme-btn" disabled={controlsDisabled} onClick={onStoreKey}>키 저장</button><button type="button" className="theme-btn" disabled={controlsDisabled} onClick={onRemoveKey}>키 삭제</button></div> : null}
    <label className="form-field"><span>기본 URL (선택)</span><input value={baseUrlDraft} disabled={controlsDisabled} onChange={(event) => { baseUrlDirtyRef.current = true; setBaseUrlDraft(event.target.value); }} onBlur={() => void commitBaseUrl()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="https://api.example.com" /></label>
    <div className="ai-provider-status">{statusLoading ? <span>상태: 확인 중</span> : statusError ? <span role="alert">{providers.find(([value]) => value === selectedProvider)?.[1] ?? "AI 제공자"} 연결 상태 확인 실패: {statusError}</span> : status ? <><span>환경변수 키: {status.hasEnvKey ? "감지됨" : "없음"}</span><span>저장된 키: {status.hasStoredKey ? "저장됨" : "없음"}</span><span>상태: {status.available ? "사용 가능" : "수동 모드 대기"}</span></> : <span>상태: 확인 대기</span>}</div>
    <button type="button" className="btn-secondary" disabled={controlsDisabled} onClick={onTestConnection}>연결 테스트</button>
  </div>;
}
