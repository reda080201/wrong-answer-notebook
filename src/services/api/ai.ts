import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { AiProviderSettings, AiProviderStatus, AiProviderType } from "../../types";
import type { SimilarQuestionRankingRequest, SimilarQuestionRankingResponse } from "../../features/question-bank/utils/similarQuestionLinks";
import { errorMessage } from "./shared";

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!isTauri()) {
    return {
      provider: "openai-compatible",
      type: "manual",
      model: "",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
      hasEnvKey: false,
      available: false,
      message: "브라우저 모드는 manual provider만 지원합니다.",
    };
  }
  try {
    return await invoke<AiProviderStatus>("get_ai_provider_status");
  } catch (error) {
    return {
      type: "manual",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
      hasEnvKey: false,
      available: false,
      message: errorMessage(error, "AI provider 상태를 확인하지 못했습니다."),
    };
  }
}

export async function saveAiProviderConfig(config: AiProviderSettings): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("save_ai_provider_config", { config });
}

export async function saveAiProviderKey(
  apiKey: string,
  expectedProvider: AiProviderType,
): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("save_ai_provider_key", { apiKey, expectedProvider });
}

export async function testAiProviderConnection(): Promise<AiProviderStatus> {
  if (!isTauri()) throw new Error("AI provider 연결 테스트는 데스크톱 앱에서만 사용할 수 있습니다.");
  return invoke<AiProviderStatus>("test_ai_provider_connection");
}

export async function clearAiProviderKey(expectedProvider: AiProviderType): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("clear_ai_provider_key", { expectedProvider });
}

export async function generateImportWithAi(
  prompt: string,
  inputText: string,
  imageFilenames: string[] = [],
  signal?: AbortSignal,
  imageSessionId?: string,
): Promise<string> {
  if (!isTauri()) {
    throw new Error("AI provider는 데스크톱 앱에서만 사용할 수 있습니다.");
  }
  if (signal?.aborted) throw new DOMException("AI 분석을 취소했습니다.", "AbortError");
  if (imageSessionId) {
    const requestId = crypto.randomUUID();
    const cancel = () => { void invoke("cancel_study_ai", { requestId }).catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) throw new DOMException("AI 분석을 취소했습니다.", "AbortError");
      const response = await invoke<string>("request_study_ai", { requestId, request: { messages: [{ role: "user", text: inputText }], context: prompt, images: imageFilenames, imageSessionId, json: true }, onDelta: new Channel<string>() });
      if (signal?.aborted) throw new DOMException("AI 분석을 취소했습니다.", "AbortError");
      return response;
    } finally { signal?.removeEventListener("abort", cancel); }
  }
  const response = await invoke<string>("generate_import_with_ai", { prompt, inputText, imageFilenames });
  if (signal?.aborted) throw new DOMException("AI 분석을 취소했습니다.", "AbortError");
  return response;
}

export interface VisionProviderReceipt { text: string; provider: "openai"; model: string; providerRequestId: string; responseHash: string; completedAtMs: number; requestId: string; }
/** Only the native transport can issue this envelope; model-authored JSON is not a receipt. */
export async function requestVisionAssessment(prompt: string, input: string, images: string[], sessionId: string, signal: AbortSignal): Promise<VisionProviderReceipt> {
  if (!isTauri()) throw new Error("GPT 사전 평가는 Windows 설치 앱에서 연결 설정 후 사용할 수 있습니다.");
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  const cancel = () => { void invoke("cancel_study_ai", { requestId }).catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const response = await invoke<string>("request_study_ai", { requestId, request: { messages: [{ role: "user", text: input }], context: prompt, images, imageSessionId: sessionId, json: true, assessmentReceipt: true }, onDelta: new Channel<string>() });
    signal.throwIfAborted();
    const value = JSON.parse(response) as Omit<VisionProviderReceipt, "requestId">;
    if (value.provider !== "openai" || !value.model?.startsWith("gpt-") || !value.providerRequestId || !/^[a-f0-9]{64}$/.test(value.responseHash) || !Number.isFinite(value.completedAtMs) || typeof value.text !== "string") throw new Error("GPT 실행 증거를 확인하지 못했습니다.");
    return { ...value, requestId };
  } finally { signal.removeEventListener("abort", cancel); }
}

export async function rankSimilarQuestionsWithAi(request: SimilarQuestionRankingRequest): Promise<SimilarQuestionRankingResponse> {
  if (!isTauri()) throw new Error("유사 문제 재정렬은 설치된 데스크톱 앱에서만 사용할 수 있습니다.");
  return invoke<SimilarQuestionRankingResponse>("rank_similar_questions_with_ai", { request });
}
