import type { ChatGptMcpPreferences, ExportScopeMode } from "./settings";

export type AiProviderType = "manual" | "gemini-flash-lite" | "gemini-3.5-flash";

export type AiProviderKeySource = "env" | "tauri-settings";

export interface AiProviderSettings {
  type: AiProviderType;
  enabled: boolean;
  keySource: AiProviderKeySource;
  hasStoredKey: boolean;
}

export interface AiProviderStatus extends AiProviderSettings {
  hasEnvKey: boolean;
  available: boolean;
  message?: string;
}

/** 로컬 읽기 전용 MCP 브리지의 공개 설정입니다. 인증 토큰은 절대 포함하지 않습니다. */
export interface McpBridgeSettings {
  enabled: boolean;
  port: number;
}

export type McpBridgeState = "stopped" | "starting" | "running" | "error";

/** 설정 화면과 앱 내부 동기화에만 쓰는 공개 상태입니다. */
export interface McpBridgeStatus {
  enabled: boolean;
  state: McpBridgeState;
  host: "127.0.0.1";
  port: number;
  readOnly: true;
  bridgeVersion: string;
  /** 마지막으로 앱이 실제 MCP 왕복 검증을 마친 시각입니다. */
  lastTestAt?: string;
  /** 마지막 실제 MCP 왕복 검증 결과입니다. 서버 listening 상태와 별개입니다. */
  lastTestOk?: boolean;
  /** 마지막으로 인증된 외부 MCP 클라이언트가 접속한 시각입니다. */
  lastClientConnectedAt?: string;
  lastError?: string;
  hasAuthToken: boolean;
}

/** 일회성 MCP 연결 코드의 공개 정보입니다. bearer token은 절대 프론트에 전달하지 않습니다. */
export interface McpBridgePairingSession {
  code: string;
  expiresAt: string;
  pairingUrl?: string;
  mcpUrl?: string;
  /** @deprecated mcpUrl을 사용하세요. */
  bridgeUrl: string;
}

export interface McpActiveContext {
  entryId: string | null;
  questionNumber: string | null;
}

/** App-owned export context read by MCP */
export interface McpExportContext {
  entryId: string | null;
  sessionId?: string | null;
  scope: ExportScopeMode;
  questionNumbers: string[];
  submitted: boolean;
  shareOptions: Pick<
    ChatGptMcpPreferences,
    "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages"
  >;
  updatedAt: string;
  generatedExamId?: string | null;
  includeSourceReferences?: boolean;
}
