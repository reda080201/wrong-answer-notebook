import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  ActiveExamContext,
  McpActiveContext,
  McpBridgePairingSession,
  McpBridgeStatus,
  McpExportContext,
  McpSharedContextStatus,
} from "../../types";
import { errorMessage } from "./shared";

export const MCP_BRIDGE_VERSION = "local-bridge-v2" as const;

const browserMcpBridgeStatus: McpBridgeStatus = {
  enabled: false,
  state: "stopped",
  host: "127.0.0.1",
  port: 43129,
  readOnly: true,
  bridgeVersion: MCP_BRIDGE_VERSION,
  hasAuthToken: false,
  lastError: "브라우저 모드에서는 로컬 MCP 브리지를 사용할 수 없습니다.",
};

export async function getMcpBridgeStatus(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  try {
    return await invoke<McpBridgeStatus>("get_mcp_bridge_status");
  } catch (error) {
    return {
      ...browserMcpBridgeStatus,
      lastError: errorMessage(error, "MCP 브리지 상태를 확인하지 못했습니다."),
    };
  }
}

export async function setMcpBridgeEnabled(enabled: boolean, port = 43129): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("set_mcp_bridge_enabled", { enabled, port });
}

export async function testMcpBridgeConnection(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("test_mcp_bridge");
}

/** Rust command returns a short-lived pairing code only, never the bridge bearer token. */
export async function createMcpBridgePairing(): Promise<McpBridgePairingSession> {
  if (!isTauri()) throw new Error("브라우저 모드에서는 MCP 페어링을 사용할 수 없습니다.");
  const session = await invoke<Omit<McpBridgePairingSession, "bridgeUrl"> & { bridgeUrl?: string }>("create_mcp_bridge_pairing");
  return { ...session, mcpUrl: session.mcpUrl ?? session.bridgeUrl, bridgeUrl: session.bridgeUrl ?? session.mcpUrl ?? "" };
}

/** Invalidates the current bridge credential without exposing its value to the UI. */
export async function rotateMcpBridgeCredential(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("rotate_mcp_bridge_credential");
}

/** Closes authenticated clients and invalidates their server-side session. */
export async function disconnectMcpBridgeClients(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("disconnect_mcp_bridge_clients");
}

export async function syncMcpBridgeActiveContext(context: McpActiveContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_context", {
    entryId: context.entryId,
    questionNumber: context.questionNumber,
  });
}

export async function syncMcpBridgeActiveExamContext(context: ActiveExamContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_exam_context", { context });
}

export async function syncMcpBridgeExportContext(context: McpExportContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_export_context", { context });
}

export async function clearMcpSharedContexts(): Promise<void> {
  if (!isTauri()) return;
  await invoke("clear_mcp_shared_contexts");
}

export async function getMcpSharedContextStatus(): Promise<McpSharedContextStatus> {
  if (!isTauri()) return { exportShared: false, examShared: false, questionCount: 0 };
  return invoke<McpSharedContextStatus>("get_mcp_shared_context_status");
}
