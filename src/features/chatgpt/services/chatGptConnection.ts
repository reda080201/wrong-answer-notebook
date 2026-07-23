import type { ChatGptMcpPreferences } from "../../../types";

export const CHATGPT_URL = "https://chatgpt.com/";
export const CHATGPT_CONNECTION_RECENT_MS = 10 * 60 * 1000;

export interface RemoteMcpEndpoints {
  baseUrl: string;
  pairingUrl: string;
  mcpUrl: string;
}

export function normalizeRemoteMcpBaseUrl(raw: string): RemoteMcpEndpoints {
  const candidate = raw.trim();
  if (!candidate) throw new Error("외부 MCP 기본 URL을 입력하세요.");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("올바른 HTTPS URL을 입력하세요.");
  }
  if (url.protocol !== "https:") throw new Error("외부 MCP URL은 HTTPS만 사용할 수 있습니다.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("인증 정보, query, fragment가 없는 기본 URL을 입력하세요.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("localhost 주소는 외부 MCP URL로 사용할 수 없습니다.");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/(?:mcp|pair)$/i, "");
  const baseUrl = `${url.origin}${path || ""}`;
  return { baseUrl, pairingUrl: `${baseUrl}/pair`, mcpUrl: `${baseUrl}/mcp` };
}

export function isRecentClientConnection(lastClientConnectedAt?: string | null, now = Date.now()): boolean {
  if (!lastClientConnectedAt) return false;
  const time = Date.parse(lastClientConnectedAt);
  return Number.isFinite(time) && now - time >= 0 && now - time <= CHATGPT_CONNECTION_RECENT_MS;
}

export type ChatGptPromptMode = "pre-submit" | "submitted" | "detail";

const PRE_SUBMIT_QUESTIONS = [
  "힌트만 줘",
  "내 풀이의 잘못된 부분만 찾아줘",
  "다음에 생각할 방향만 알려줘",
  "이 문제에 필요한 개념만 설명해 줘",
  "정답은 말하지 말고 내 접근을 평가해 줘",
];

const SUBMITTED_QUESTIONS = [
  "내가 왜 틀렸는지 분석해 줘",
  "공식 해설과 내 풀이를 비교해 줘",
  "비슷하게 틀린 과거 문제를 찾아줘",
  "복습 카드로 정리해 줘",
  "다음에 적용할 풀이 루틴을 만들어 줘",
];

export function recommendedChatGptQuestions(mode: ChatGptPromptMode): string[] {
  return mode === "pre-submit" ? PRE_SUBMIT_QUESTIONS : SUBMITTED_QUESTIONS;
}

export function buildChatGptPrompt(
  mode: ChatGptPromptMode,
  selectedQuestion: string,
  preferences: Pick<ChatGptMcpPreferences, "displayName">,
): string {
  const mention = `@${preferences.displayName || "오답노트"}`;
  if (mode === "pre-submit") {
    return `${mention} 현재 응시 중인 문항을 읽어 줘.\n내 답과 풀이 메모도 확인하되 정답과 공식 해설은 말하지 마.\n${selectedQuestion}\n내가 잘못 생각한 지점과 다음에 확인할 방향만 알려 줘.`;
  }
  if (mode === "submitted") {
    return `${mention} 방금 제출한 모의고사 현재 문항을 읽어 줘.\n내 답, 정답, 공식 해설을 비교해서 오답 원인과 복습 포인트를 정리해 줘.\n${selectedQuestion}`;
  }
  return `${mention} 현재 열어 둔 오답노트 문항을 읽어 줘.\n${selectedQuestion}\n문제의 핵심 조건과 다음 학습 행동을 정리해 줘.`;
}

export async function openChatGpt(): Promise<void> {
  const opened = window.open(CHATGPT_URL, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("ChatGPT 창을 열지 못했습니다. 주소를 직접 복사해 열어 주세요.");
}
