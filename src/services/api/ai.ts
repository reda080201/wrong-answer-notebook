import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AiProviderSettings, AiProviderStatus } from "../../types";
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

export async function saveAiProviderKey(apiKey: string): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("save_ai_provider_key", { apiKey });
}

export async function testAiProviderConnection(): Promise<AiProviderStatus> {
  if (!isTauri()) throw new Error("AI provider 연결 테스트는 데스크톱 앱에서만 사용할 수 있습니다.");
  return invoke<AiProviderStatus>("test_ai_provider_connection");
}

export async function clearAiProviderKey(): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("clear_ai_provider_key");
}

export async function generateImportWithAi(
  prompt: string,
  inputText: string,
  imageFilenames: string[] = [],
): Promise<string> {
  if (!isTauri()) {
    throw new Error("AI provider는 데스크톱 앱에서만 사용할 수 있습니다.");
  }
  return invoke<string>("generate_import_with_ai", { prompt, inputText, imageFilenames });
}

export async function rankSimilarQuestionsWithAi(request: SimilarQuestionRankingRequest): Promise<SimilarQuestionRankingResponse> {
  if (!isTauri()) throw new Error("유사 문제 재정렬은 설치된 데스크톱 앱에서만 사용할 수 있습니다.");
  return invoke<SimilarQuestionRankingResponse>("rank_similar_questions_with_ai", { request });
}
