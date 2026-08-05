import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  getMcpBridgeStatus,
  createMcpBridgePairing,
  disconnectMcpBridgeClients,
  rotateMcpBridgeCredential,
  setMcpBridgeEnabled,
  testMcpBridgeConnection as testMcpBridgeConnectionApi,
} from "../api";
import type { McpBridgePairingSession, McpBridgeSettings, McpBridgeStatus } from "../types";

export { type McpBridgeSettings } from "../types";

export const DEFAULT_MCP_BRIDGE_SETTINGS: McpBridgeSettings = { enabled: false, port: 43129 };
export const MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE = "브라우저 모드에서는 MCP 브리지를 사용할 수 없습니다. 데스크톱 앱에서만 사용할 수 있습니다.";

export interface McpBridgeRuntimeStatus {
  status: "disabled" | "idle" | "starting" | "listening" | "connected" | "error";
  port: number | null;
  readOnly: true;
  error: string | null;
  message?: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastClientConnectedAt: string | null;
  clientCount?: number;
}

function toRuntimeStatus(status: McpBridgeStatus): McpBridgeRuntimeStatus {
  return {
    status: status.state === "running" ? "listening" : status.state === "error" ? "error" : status.enabled ? "starting" : "disabled",
    port: status.enabled ? status.port : null,
    readOnly: true,
    error: status.lastError ?? null,
    message: status.state === "running" ? "127.0.0.1에서 읽기 전용으로 실행 중입니다." : undefined,
    // Listening only proves that the local socket opened. It is not an MCP
    // handshake result and must never be presented as one.
    lastTestAt: status.lastTestAt ?? null,
    lastTestOk: status.lastTestOk ?? null,
    lastClientConnectedAt: status.lastClientConnectedAt ?? null,
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
  const [pairingSession, setPairingSession] = useState<McpBridgePairingSession | null>(null);
  const [pairingPending, setPairingPending] = useState(false);
  const configRef = useRef(config);
  const operationRef = useRef(Promise.resolve());
  const revisionRef = useRef(0);

  useEffect(() => { configRef.current = suppliedConfig; setConfig(suppliedConfig); }, [suppliedConfig]);

  const refreshMcpBridgeStatus = useCallback(async () => {
    if (!isTauri()) {
      const status: McpBridgeRuntimeStatus = {
        status: "disabled",
        port: null,
        readOnly: true,
        error: MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE,
        lastTestAt: null,
        lastTestOk: null,
        lastClientConnectedAt: null,
      };
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
    const operation = async () => {
      if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
      const previous = configRef.current;
      const port = patch.port === undefined ? previous.port : Math.min(65535, Math.max(1024, Math.round(patch.port)));
      const next = { ...previous, ...patch, port };
      const revision = ++revisionRef.current;
      const shouldApplyRuntime = patch.enabled !== undefined || (patch.port !== undefined && previous.enabled);
      try {
        const status = shouldApplyRuntime ? await setMcpBridgeEnabled(Boolean(next.enabled), port) : null;
        await persistMcpBridge?.(next);
        if (revision !== revisionRef.current) return;
        configRef.current = next;
        setConfig(next);
        setPortInput(String(port));
        setRuntimeStatus(status ? toRuntimeStatus(status) : await refreshMcpBridgeStatus());
        setSettingsMessage("로컬 MCP 브리지 설정을 저장했습니다.");
      } catch (error) {
        if (shouldApplyRuntime) {
          try { await setMcpBridgeEnabled(Boolean(previous.enabled), previous.port); } catch { /* runtime rollback is best effort */ }
          await refreshMcpBridgeStatus();
        }
        if (revision === revisionRef.current) setSettingsMessage(error instanceof Error ? error.message : "MCP 브리지 설정을 저장하지 못했습니다.");
        throw error;
      }
    };
    const queued = operationRef.current.then(operation, operation);
    operationRef.current = queued.then(() => undefined, () => undefined);
    await queued;
  }, [persistMcpBridge, refreshMcpBridgeStatus, setSettingsMessage]);

  const applyMcpBridgePort = useCallback(async () => {
    const port = Number.parseInt(portInput, 10);
    if (!Number.isFinite(port)) { setSettingsMessage("포트는 1024~65535 사이 숫자여야 합니다."); return; }
    await updateMcpBridgeConfig({ port });
  }, [portInput, setSettingsMessage, updateMcpBridgeConfig]);

  const testMcpBridgeConnection = useCallback(async () => {
    setConnectionTesting(true);
    try {
      const status = await testMcpBridgeConnectionApi();
      const runtimeStatus = toRuntimeStatus(status);
      setRuntimeStatus(runtimeStatus);
      setSettingsMessage(`연결 테스트 성공 (포트 ${status.port}).`);
      return runtimeStatus;
    }
    catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "연결 테스트에 실패했습니다.");
      throw error;
    }
    finally { setConnectionTesting(false); }
  }, [setSettingsMessage]);

  const createPairing = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    setPairingPending(true);
    try {
      const session = await createMcpBridgePairing();
      setPairingSession(session);
      setSettingsMessage("일회성 연결 코드를 만들었습니다. 만료 전 tunnel-client에만 입력하세요.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "MCP 연결 코드를 만들지 못했습니다.");
    } finally { setPairingPending(false); }
  }, [setSettingsMessage]);

  const rotateCredential = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    try {
      const status = await rotateMcpBridgeCredential();
      setPairingSession(null);
      setRuntimeStatus(toRuntimeStatus(status));
      setSettingsMessage("MCP 연결 자격 증명을 회전했습니다. 기존 클라이언트는 다시 연결해야 합니다.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "MCP 연결 자격 증명을 회전하지 못했습니다.");
    }
  }, [setSettingsMessage]);

  const disconnectClients = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    try {
      const status = await disconnectMcpBridgeClients();
      setPairingSession(null);
      setRuntimeStatus(toRuntimeStatus(status));
      setSettingsMessage("연결된 MCP 클라이언트를 해제했습니다.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "MCP 클라이언트를 해제하지 못했습니다.");
    }
  }, [setSettingsMessage]);

  return { mcpBridgeSettings: config, mcpBridgeStatus: runtimeStatus, mcpBridgePortInput: portInput, setMcpBridgePortInput: setPortInput, updateMcpBridgeConfig, applyMcpBridgePort, testMcpBridgeConnection, createPairing, rotateCredential, disconnectClients, pairingSession, isMcpBridgePairingPending: pairingPending, isMcpBridgeConnectionTesting: connectionTesting, isMcpBridgeBrowserBlocked: !isTauri(), isMcpBridgeDesktopAvailable: isTauri(), refreshMcpBridgeStatus };
}
