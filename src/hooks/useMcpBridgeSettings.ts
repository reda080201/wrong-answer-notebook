import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  getMcpBridgeStatus,
  setMcpBridgeEnabled,
  testMcpBridgeConnection as testMcpBridgeConnectionApi,
} from "../api";
import type { McpBridgeSettings, McpBridgeStatus } from "../types";

export { type McpBridgeSettings } from "../types";

export const DEFAULT_MCP_BRIDGE_SETTINGS: McpBridgeSettings = { enabled: false, port: 43129 };
export const MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE = "브라우저 모드에서는 MCP 브리지를 사용할 수 없습니다. 데스크톱 앱에서만 사용할 수 있습니다.";

export interface McpBridgeRuntimeStatus {
  status: "disabled" | "idle" | "starting" | "listening" | "connected" | "error";
  port: number | null;
  readOnly: true;
  error: string | null;
  message?: string;
  lastConnectionTestAt: string | null;
  lastConnectionTestOk: boolean | null;
  clientCount?: number;
}

function toRuntimeStatus(status: McpBridgeStatus): McpBridgeRuntimeStatus {
  return {
    status: status.state === "running" ? "listening" : status.state === "error" ? "error" : status.enabled ? "starting" : "disabled",
    port: status.enabled ? status.port : null,
    readOnly: true,
    error: status.lastError ?? null,
    message: status.state === "running" ? "127.0.0.1에서 읽기 전용으로 실행 중입니다." : undefined,
    lastConnectionTestAt: status.lastConnectedAt ?? null,
    lastConnectionTestOk: status.state === "running" ? true : null,
  };
}

export interface UseMcpBridgeSettingsOptions {
  mcpBridge?: McpBridgeSettings;
  persistMcpBridge?: (next: McpBridgeSettings) => Promise<void>;
  setSettingsMessage: (message: string | null) => void;
}

export function useMcpBridgeSettings({ mcpBridge, persistMcpBridge, setSettingsMessage }: UseMcpBridgeSettingsOptions) {
  const suppliedConfig = useMemo(
    () => mcpBridge ?? DEFAULT_MCP_BRIDGE_SETTINGS,
    [mcpBridge],
  );
  const [config, setConfig] = useState<McpBridgeSettings>(suppliedConfig);
  const [runtimeStatus, setRuntimeStatus] = useState<McpBridgeRuntimeStatus | null>(null);
  const [portInput, setPortInput] = useState(String(config.port));
  const [connectionTesting, setConnectionTesting] = useState(false);

  useEffect(() => { setConfig(suppliedConfig); }, [suppliedConfig]);

  const refreshMcpBridgeStatus = useCallback(async () => {
    if (!isTauri()) {
      const status: McpBridgeRuntimeStatus = { status: "disabled", port: null, readOnly: true, error: MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE, lastConnectionTestAt: null, lastConnectionTestOk: null };
      setRuntimeStatus(status);
      return status;
    }
    const status = toRuntimeStatus(await getMcpBridgeStatus());
    setRuntimeStatus(status);
    return status;
  }, []);

  useEffect(() => { setPortInput(String(config.port)); }, [config.port]);
  useEffect(() => { void refreshMcpBridgeStatus(); }, [refreshMcpBridgeStatus]);

  const updateMcpBridgeConfig = useCallback(async (patch: Partial<McpBridgeSettings>) => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    const port = patch.port === undefined ? config.port : Math.min(65535, Math.max(1024, Math.round(patch.port)));
    const next = { ...config, ...patch, port };
    try {
      const status = patch.enabled === undefined ? null : await setMcpBridgeEnabled(Boolean(patch.enabled), port);
      await persistMcpBridge?.(next);
      setConfig(next);
      setPortInput(String(port));
      setRuntimeStatus(status ? toRuntimeStatus(status) : await refreshMcpBridgeStatus());
      setSettingsMessage("로컬 MCP 브리지 설정을 저장했습니다.");
    } catch (error) { setSettingsMessage(error instanceof Error ? error.message : "MCP 브리지 설정을 저장하지 못했습니다."); }
  }, [config, persistMcpBridge, refreshMcpBridgeStatus, setSettingsMessage]);

  const applyMcpBridgePort = useCallback(async () => {
    const port = Number.parseInt(portInput, 10);
    if (!Number.isFinite(port)) { setSettingsMessage("포트는 1024~65535 사이 숫자여야 합니다."); return; }
    await updateMcpBridgeConfig({ port });
  }, [portInput, setSettingsMessage, updateMcpBridgeConfig]);

  const testMcpBridgeConnection = useCallback(async () => {
    setConnectionTesting(true);
    try { const status = await testMcpBridgeConnectionApi(); setRuntimeStatus(toRuntimeStatus(status)); setSettingsMessage(`연결 테스트 성공 (포트 ${status.port}).`); }
    catch (error) { setSettingsMessage(error instanceof Error ? error.message : "연결 테스트에 실패했습니다."); }
    finally { setConnectionTesting(false); }
  }, [setSettingsMessage]);

  return { mcpBridgeSettings: config, mcpBridgeStatus: runtimeStatus, mcpBridgePortInput: portInput, setMcpBridgePortInput: setPortInput, updateMcpBridgeConfig, applyMcpBridgePort, testMcpBridgeConnection, isMcpBridgeConnectionTesting: connectionTesting, isMcpBridgeBrowserBlocked: !isTauri(), isMcpBridgeDesktopAvailable: isTauri(), refreshMcpBridgeStatus };
}
