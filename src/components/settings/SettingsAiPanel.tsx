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
  const selectedProvider = provider.provider ?? (provider.type === "gemini-flash-lite" || provider.type === "gemini-3.5-flash" ? "google-gemini" : provider.type === "manual" ? "openai-compatible" : provider.type);
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
  const envName = ({ openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", "google-gemini": "GOOGLE_API_KEY (또는 GEMINI_API_KEY)", openrouter: "OPENROUTER_API_KEY", groq: "GROQ_API_KEY", "openai-compatible": "OPENAI_COMPATIBLE_API_KEY" } as Record<string, string>)[selectedProvider];
  const customEndpoint = selectedProvider === "openai-compatible";
  return <div className="ai-provider-settings">
    <details className="settings-disclosure settings-connection-guide" aria-label="AI 연결 시작 안내"><summary>처음 연결할 때의 설정 방법</summary>
      <ol><li>사용할 제공자와 계정에서 이용 가능한 <strong>정확한 모델 ID</strong>를 입력하세요.</li><li>API 키 위치를 선택하세요. 직접 입력하려면 <strong>OS 보안 저장소 → 키 저장</strong>을 이용하세요.</li><li><strong>API 사용</strong>을 켜고 <strong>연결 테스트</strong>로 설정을 확인하세요.</li></ol>
      <p>연결하지 않아도 문제 풀이·가져오기와 수동 GPT 결과 붙여넣기를 사용할 수 있습니다. API 사용 요금과 한도는 선택한 제공자의 계정에 적용됩니다.</p>
      {!isTauri() && <p role="note">지금은 브라우저 화면입니다. API 키 설정과 실제 호출은 Windows 설치 앱에서 가능합니다.</p>}
    </details>
    {!isTauri() && <p className="form-hint" role="note">API 키 설정과 실제 AI 호출은 Windows 설치 앱에서 사용할 수 있습니다.</p>}
    <div className="form-field"><label htmlFor="ai-provider-type">AI 제공자</label><select id="ai-provider-type" value={selectedProvider} disabled={controlsDisabled} onChange={(event) => onConfigChange({ provider: event.target.value as AiProviderType })}>{providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <label className="form-field"><span>모델</span><input value={modelDraft} aria-label="모델" disabled={controlsDisabled} onChange={(event) => { modelDirtyRef.current = true; setModelDraft(event.target.value); }} onBlur={() => void commitModel()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder={selectedProvider === "openrouter" ? "제공자/모델 ID" : "제공자 대시보드의 모델 ID"} aria-describedby="ai-model-help" /><small id="ai-model-help" className="form-hint">표시 이름이 아닌 API 모델 ID입니다. 그림 지원 여부도 이 모델에 따라 달라집니다.</small></label>
    <label className="settings-checkbox"><input type="checkbox" checked={provider.enabled} disabled={controlsDisabled} onChange={(event) => onConfigChange({ enabled: event.target.checked })} /> API 사용 {isTauri() ? "(선택)" : "(데스크톱 앱에서 사용 가능)"}</label>
    <p className="form-hint">API 키는 대화 기록이나 백업에 넣지 않습니다. 선택한 위치의 키만 사용합니다.</p><div className="theme-options">{(["env", "keyring"] as const).map((source) => <button key={source} type="button" className={`theme-btn ${provider.keySource === source || (source === "keyring" && provider.keySource === "tauri-settings") ? "active" : ""}`} disabled={controlsDisabled} onClick={() => onConfigChange({ keySource: source })}>{source === "env" ? "환경변수" : "OS 보안 저장소"}</button>)}</div>
    <details className="settings-disclosure"><summary>{provider.keySource === "env" ? "환경변수 설정 방법" : "API 키 보관 안내"}</summary><p className="form-hint">{provider.keySource === "env" ? <>환경변수 <code>{envName}</code>를 앱 실행 전에 설정하세요. 키를 바꿨다면 앱을 다시 실행하세요.</> : "이 PC의 운영체제 보안 저장소에 키를 저장합니다. ‘키 삭제’는 저장된 키만 제거하며 제공자 계정의 키 자체를 폐기하지는 않습니다."}</p></details>
    {provider.keySource === "tauri-settings" || provider.keySource === "keyring" ? <div className="ai-provider-key-row"><input type="password" value={keyInput} disabled={controlsDisabled} onChange={(event) => onKeyInputChange(event.target.value)} placeholder="API 키" aria-label="AI API 키" autoComplete="new-password" /><button type="button" className="theme-btn" disabled={controlsDisabled} onClick={onStoreKey}>키 저장</button><button type="button" className="theme-btn" disabled={controlsDisabled} onClick={onRemoveKey}>키 삭제</button></div> : null}
    <details className="settings-disclosure" key={selectedProvider} open={customEndpoint}><summary>{customEndpoint ? "서버 주소 (필수)" : "고급 연결 설정"}</summary><label className="form-field"><span>{customEndpoint ? "기본 URL (필수)" : "기본 URL (선택)"}</span><input value={baseUrlDraft} aria-label={customEndpoint ? "기본 URL (필수)" : "기본 URL (선택)"} disabled={controlsDisabled} onChange={(event) => { baseUrlDirtyRef.current = true; setBaseUrlDraft(event.target.value); }} onBlur={() => void commitBaseUrl()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder={customEndpoint ? "https://서버주소/v1" : "비워 두면 제공자의 기본 주소 사용"} aria-describedby="ai-url-help" /><small id="ai-url-help" className="form-hint">{customEndpoint ? "OpenAI 호환 서버의 API 기본 주소를 입력하세요. 키와 선택한 자료가 이 서버로 전송되므로 신뢰하는 주소를 사용하세요." : "공식 주소를 사용하려면 비워 두세요. 별도 프록시를 사용하는 경우에만 입력하세요."} /chat/completions 같은 개별 요청 경로는 붙이지 않습니다.</small></label></details>
    <div className="ai-provider-status">{statusLoading ? <span>상태: 확인 중</span> : statusError ? <span role="alert">{providers.find(([value]) => value === selectedProvider)?.[1] ?? "AI 제공자"} 연결 상태 확인 실패: {statusError}</span> : status ? <><span>환경변수 키: {status.hasEnvKey ? "감지됨" : "없음"}</span><span>저장된 키: {status.hasStoredKey ? "저장됨" : "없음"}</span><span>상태: {status.available ? "호출 설정 준비됨" : "설정 필요 · 수동 사용 가능"}</span></> : <span>상태: 확인 대기</span>}</div>
    <button type="button" className="btn-secondary" disabled={controlsDisabled} onClick={onTestConnection}>연결 테스트</button>
    <details className="settings-disclosure"><summary>연결 테스트로 확인하는 내용</summary><p className="form-hint">모델 조회 API로 연결을 확인하며 대화를 생성하지 않습니다. 일부 제공자는 모델 목록만 확인하므로, 성공하더라도 실제 대화 권한·그림 지원·잔액까지 보장하지는 않습니다.</p></details>
    <p className="form-hint">API 요금은 제공자 계정에 청구됩니다. 대화는 자료 없이 시작합니다. ‘AI가 볼 자료’에서 추가한 범위만 요청에 사용하며, 정답·해설 등은 별도로 허용합니다.</p>
  </div>;
}
