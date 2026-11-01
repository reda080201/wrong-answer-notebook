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

function runtimeStatusError(error: unknown, port: number): McpBridgeRuntimeStatus {
  return {
    status: "error",
    port,
    readOnly: true,
    error: error instanceof Error && error.message ? error.message : "MCP 브리지 상태를 불러오지 못했습니다.",
    lastTestAt: null,
    lastTestOk: null,
    lastClientConnectedAt: null,
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
  const runtimeGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runtimeGenerationRef.current += 1;
      revisionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const current = configRef.current;
    if (current.enabled === suppliedConfig.enabled && current.port === suppliedConfig.port) return;
    configRef.current = suppliedConfig;
    setConfig(suppliedConfig);
    revisionRef.current += 1;
    runtimeGenerationRef.current += 1;
  }, [suppliedConfig]);

  const refreshMcpBridgeStatus = useCallback(async () => {
    const generation = ++runtimeGenerationRef.current;
    const current = () => mountedRef.current && runtimeGenerationRef.current === generation;
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
      if (current()) setRuntimeStatus(status);
      return status;
    }
    try {
      const status = toRuntimeStatus(await getMcpBridgeStatus());
      if (current()) setRuntimeStatus(status);
      return status;
    } catch (error) {
      if (current()) setRuntimeStatus(runtimeStatusError(error, configRef.current.port));
      throw error;
    }
  }, []);

  useEffect(() => { setPortInput(String(config.port)); }, [config.port]);
  useEffect(() => { void refreshMcpBridgeStatus().catch(() => undefined); }, [refreshMcpBridgeStatus]);

  const updateMcpBridgeConfig = useCallback(async (patch: Partial<McpBridgeSettings>) => {
    const operation = async () => {
      if (!isTauri()) {
        if (mountedRef.current) setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE);
        return;
      }
      const previous = configRef.current;
      const port = patch.port === undefined ? previous.port : Math.min(65535, Math.max(1024, Math.round(patch.port)));
      const next = { ...previous, ...patch, port };
      const revision = ++revisionRef.current;
      const generation = ++runtimeGenerationRef.current;
      const shouldApplyRuntime = patch.enabled !== undefined || (patch.port !== undefined && previous.enabled);
      let runtimeStatus: McpBridgeStatus | null = null;
      let runtimeChanged = false;
      let persisted = false;
      try {
        if (shouldApplyRuntime) {
          runtimeStatus = await setMcpBridgeEnabled(Boolean(next.enabled), port);
          runtimeChanged = true;
        }
        if (revision !== revisionRef.current) {
          if (runtimeChanged) await setMcpBridgeEnabled(Boolean(configRef.current.enabled), configRef.current.port).catch(() => undefined);
          return;
        }
        // The parent's update echoes this value through suppliedConfig. Record it
        // before awaiting so that echo does not invalidate this committed action.
        configRef.current = next;
        await persistMcpBridge?.(next);
        persisted = true;
        if (revision !== revisionRef.current || !mountedRef.current) return;
        setConfig(next);
        setPortInput(String(port));
        if (runtimeStatus) {
          if (mountedRef.current && runtimeGenerationRef.current === generation) setRuntimeStatus(toRuntimeStatus(runtimeStatus));
        } else {
          try {
            await refreshMcpBridgeStatus();
          } catch (statusError) {
            if (mountedRef.current && revision === revisionRef.current) {
              const detail = statusError instanceof Error && statusError.message ? statusError.message : "상태를 불러오지 못했습니다.";
              setSettingsMessage(`설정은 저장했지만 MCP 브리지 상태를 새로 불러오지 못했습니다: ${detail}`);
            }
            return;
          }
        }
        if (mountedRef.current && revision === revisionRef.current) setSettingsMessage("로컬 MCP 브리지 설정을 저장했습니다.");
      } catch (error) {
        if (!persisted) {
          configRef.current = previous;
          if (shouldApplyRuntime) {
            try { await setMcpBridgeEnabled(Boolean(previous.enabled), previous.port); } catch { /* runtime rollback is best effort */ }
            if (mountedRef.current) await refreshMcpBridgeStatus().catch(() => undefined);
          }
        }
        if (mountedRef.current && revision === revisionRef.current) setSettingsMessage(error instanceof Error ? error.message : "MCP 브리지 설정을 저장하지 못했습니다.");
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
    const generation = ++runtimeGenerationRef.current;
    setConnectionTesting(true);
    try {
      const status = await testMcpBridgeConnectionApi();
      const runtimeStatus = toRuntimeStatus(status);
      if (mountedRef.current && runtimeGenerationRef.current === generation) setRuntimeStatus(runtimeStatus);
      if (runtimeStatus.status !== "listening" && runtimeStatus.status !== "connected") {
        throw new Error(status.lastError || "로컬 MCP 브리지가 연결 대기 상태가 아닙니다.");
      }
      if (mountedRef.current && runtimeGenerationRef.current === generation) setSettingsMessage(`연결 테스트 성공 (포트 ${status.port}).`);
      return runtimeStatus;
    }
    catch (error) {
      if (mountedRef.current && runtimeGenerationRef.current === generation) setSettingsMessage(error instanceof Error ? error.message : "연결 테스트에 실패했습니다.");
      throw error;
    }
    finally { if (mountedRef.current) setConnectionTesting(false); }
  }, [setSettingsMessage]);

  const createPairing = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    const generation = ++runtimeGenerationRef.current;
    setPairingPending(true);
    try {
      const session = await createMcpBridgePairing();
      if (mountedRef.current && runtimeGenerationRef.current === generation) {
        setPairingSession(session);
        setSettingsMessage("일회성 연결 코드를 만들었습니다. 만료 전 tunnel-client에만 입력하세요.");
      }
    } catch (error) {
      if (mountedRef.current && runtimeGenerationRef.current === generation) setSettingsMessage(error instanceof Error ? error.message : "MCP 연결 코드를 만들지 못했습니다.");
    } finally { if (mountedRef.current) setPairingPending(false); }
  }, [setSettingsMessage]);

  const rotateCredential = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    const generation = ++runtimeGenerationRef.current;
    try {
      const status = await rotateMcpBridgeCredential();
      if (mountedRef.current && runtimeGenerationRef.current === generation) {
        setPairingSession(null);
        setRuntimeStatus(toRuntimeStatus(status));
        setSettingsMessage("MCP 연결 자격 증명을 회전했습니다. 기존 클라이언트는 다시 연결해야 합니다.");
      }
    } catch (error) {
      if (mountedRef.current && runtimeGenerationRef.current === generation) setSettingsMessage(error instanceof Error ? error.message : "MCP 연결 자격 증명을 회전하지 못했습니다.");
    }
  }, [setSettingsMessage]);

  const disconnectClients = useCallback(async () => {
    if (!isTauri()) { setSettingsMessage(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE); return; }
    const generation = ++runtimeGenerationRef.current;
    try {
      const status = await disconnectMcpBridgeClients();
      if (mountedRef.current && runtimeGenerationRef.current === generation) {
        setPairingSession(null);
        setRuntimeStatus(toRuntimeStatus(status));
        setSettingsMessage("연결된 MCP 클라이언트를 해제했습니다.");
      }
    } catch (error) {
      if (mountedRef.current && runtimeGenerationRef.current === generation) setSettingsMessage(error instanceof Error ? error.message : "MCP 클라이언트를 해제하지 못했습니다.");
    }
  }, [setSettingsMessage]);

  return useMemo(() => ({
    mcpBridgeSettings: config,
    mcpBridgeStatus: runtimeStatus,
    mcpBridgePortInput: portInput,
    setMcpBridgePortInput: setPortInput,
    updateMcpBridgeConfig,
    applyMcpBridgePort,
    testMcpBridgeConnection,
    createPairing,
    rotateCredential,
    disconnectClients,
    pairingSession,
    isMcpBridgePairingPending: pairingPending,
    isMcpBridgeConnectionTesting: connectionTesting,
    isMcpBridgeBrowserBlocked: !isTauri(),
    isMcpBridgeDesktopAvailable: isTauri(),
    refreshMcpBridgeStatus,
  }), [
    config,
    runtimeStatus,
    portInput,
    updateMcpBridgeConfig,
    applyMcpBridgePort,
    testMcpBridgeConnection,
    createPairing,
    rotateCredential,
    disconnectClients,
    pairingSession,
    pairingPending,
    connectionTesting,
    refreshMcpBridgeStatus,
  ]);
}
