import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MCP_BRIDGE_SETTINGS,
  MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE,
  useMcpBridgeSettings,
} from "./useMcpBridgeSettings";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("../api", () => ({
  getMcpBridgeStatus: vi.fn(async () => ({
    enabled: false,
    state: "stopped",
    host: "127.0.0.1",
    port: 43129,
    readOnly: true,
    bridgeVersion: "local-bridge-v1",
    hasAuthToken: false,
  })),
  setMcpBridgeEnabled: vi.fn(async (enabled: boolean, port: number) => ({
    enabled,
    state: enabled ? "running" : "stopped",
    host: "127.0.0.1",
    port,
    readOnly: true,
    bridgeVersion: "local-bridge-v1",
    hasAuthToken: enabled,
  })),
  testMcpBridgeConnection: vi.fn(async () => ({
    enabled: true,
    state: "running",
    host: "127.0.0.1",
    port: 43129,
    readOnly: true,
    bridgeVersion: "local-bridge-v1",
    hasAuthToken: true,
  })),
  createMcpBridgePairing: vi.fn(async () => ({
    code: "PAIR-1234",
    expiresAt: "2026-07-13T12:00:00.000Z",
    bridgeUrl: "http://127.0.0.1:43129/mcp",
  })),
  rotateMcpBridgeCredential: vi.fn(async () => ({
    enabled: true,
    state: "running",
    host: "127.0.0.1",
    port: 43129,
    readOnly: true,
    bridgeVersion: "local-bridge-v1",
    hasAuthToken: true,
  })),
  disconnectMcpBridgeClients: vi.fn(async () => ({
    enabled: true,
    state: "running",
    host: "127.0.0.1",
    port: 43129,
    readOnly: true,
    bridgeVersion: "local-bridge-v1",
    hasAuthToken: true,
  })),
}));

import { isTauri } from "@tauri-apps/api/core";

const mockedIsTauri = vi.mocked(isTauri);

describe("useMcpBridgeSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
  });

  it("starts disabled with default port and read-only mode", async () => {
    const { result } = renderHook(() =>
      useMcpBridgeSettings({ setSettingsMessage: vi.fn() }),
    );

    await waitFor(() => {
      expect(result.current.mcpBridgeSettings).toEqual(DEFAULT_MCP_BRIDGE_SETTINGS);
    });

    expect(result.current.mcpBridgePortInput).toBe("43129");
    expect(result.current.isMcpBridgeBrowserBlocked).toBe(true);
  });

  it("reports browser blocked status and message in browser mode", async () => {
    const setSettingsMessage = vi.fn();
    const { result } = renderHook(() =>
      useMcpBridgeSettings({ setSettingsMessage }),
    );

    await waitFor(() => {
      expect(result.current.mcpBridgeStatus?.error).toBe(
        MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE,
      );
    });

    await act(async () => {
      await result.current.updateMcpBridgeConfig({ enabled: true });
    });

    expect(setSettingsMessage).toHaveBeenCalledWith(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE);
  });

  it("persists desktop config and refreshes runtime status", async () => {
    mockedIsTauri.mockReturnValue(true);
    const setSettingsMessage = vi.fn();
    const persistMcpBridge = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useMcpBridgeSettings({
        setSettingsMessage,
        persistMcpBridge,
      }),
    );

    await waitFor(() => {
      expect(result.current.mcpBridgeStatus?.status).toBe("disabled");
    });

    await act(async () => {
      await result.current.updateMcpBridgeConfig({ enabled: true });
    });

    expect(persistMcpBridge).toHaveBeenCalledWith({
      enabled: true,
      port: 43129,
    });
    expect(result.current.mcpBridgeSettings.enabled).toBe(true);
    expect(setSettingsMessage).toHaveBeenCalledWith("로컬 MCP 브리지 설정을 저장했습니다.");
  });

  it("runs connection test shell when enabled on desktop", async () => {
    mockedIsTauri.mockReturnValue(true);
    const setSettingsMessage = vi.fn();

    const { result } = renderHook(() =>
      useMcpBridgeSettings({ setSettingsMessage }),
    );

    await act(async () => {
      await result.current.updateMcpBridgeConfig({ enabled: true });
    });

    await act(async () => {
      await result.current.testMcpBridgeConnection();
    });

    expect(result.current.mcpBridgeStatus?.lastConnectionTestOk).toBe(true);
    expect(setSettingsMessage).toHaveBeenCalledWith(
      expect.stringContaining("연결 테스트 성공"),
    );
  });

  it("shows only a short-lived pairing code and clears it after credential rotation", async () => {
    mockedIsTauri.mockReturnValue(true);
    const { result } = renderHook(() => useMcpBridgeSettings({ setSettingsMessage: vi.fn() }));

    await act(async () => { await result.current.createPairing(); });
    expect(result.current.pairingSession?.code).toBe("PAIR-1234");

    await act(async () => { await result.current.rotateCredential(); });
    expect(result.current.pairingSession).toBeNull();
  });
});
