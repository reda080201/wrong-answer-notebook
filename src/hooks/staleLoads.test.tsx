import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import {
  getMcpBridgeStatus,
  setMcpBridgeEnabled,
} from "../api";
import { getStorageBackend } from "../services/storageBackend";
import { useMcpBridgeSettings } from "./useMcpBridgeSettings";
import { useReviewSessions } from "./useReviewSessions";

vi.mock("../services/storageBackend", () => ({ getStorageBackend: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("../api", () => ({
  getMcpBridgeStatus: vi.fn(),
  setMcpBridgeEnabled: vi.fn(),
  testMcpBridgeConnection: vi.fn(),
  createMcpBridgePairing: vi.fn(),
  rotateMcpBridgeCredential: vi.fn(),
  disconnectMcpBridgeClients: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const session = (id: string) => ({
  id, mode: "random" as const, itemRefs: [], currentIndex: 0,
  completedItemKeys: [], reviewEvents: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

const mcpStatus = (enabled: boolean, port = 43129) => ({
  enabled, state: enabled ? "running" as const : "stopped" as const,
  host: "127.0.0.1" as const, port, readOnly: true as const,
  bridgeVersion: "local-bridge-v2", hasAuthToken: enabled,
});

describe("stale async load preservation", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(false); });
  afterEach(() => { vi.mocked(isTauri).mockReturnValue(false); });

  it("keeps the refreshed review snapshot and merges a later save into it", async () => {
    const oldLoad = deferred<ReturnType<typeof session>[]>();
    const refreshedLoad = deferred<ReturnType<typeof session>[]>();
    const writer = vi.fn().mockResolvedValue(undefined);
    const loader = vi.fn().mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(refreshedLoad.promise);
    vi.mocked(getStorageBackend).mockReturnValue({ loadReviewSessions: loader, saveReviewSessions: writer } as never);
    const { result } = renderHook(() => useReviewSessions());
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setMaintenanceBlocked(true);
      result.current.setRestoreReloadBlocked(true);
    });
    let refresh!: Promise<boolean>;
    act(() => { refresh = result.current.refresh(); });
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    await act(async () => { refreshedLoad.resolve([session("B")]); await refresh; });
    act(() => {
      result.current.setRestoreReloadBlocked(false);
      result.current.setMaintenanceBlocked(false);
    });
    await act(async () => { oldLoad.resolve([session("A")]); await Promise.resolve(); });
    await act(async () => { await result.current.save(session("C")); });

    expect(writer).toHaveBeenCalledWith([expect.objectContaining({ id: "B" }), expect.objectContaining({ id: "C" })]);
    expect(result.current.sessions.map(({ id }) => id)).toEqual(["B", "C"]);
  });

  it("allows retry after a failed review load and saves on the refreshed baseline", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const loader = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([session("B")]);
    vi.mocked(getStorageBackend).mockReturnValue({ loadReviewSessions: loader, saveReviewSessions: writer } as never);
    const { result } = renderHook(() => useReviewSessions());
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    await act(async () => { await result.current.refresh(); });
    await act(async () => { await result.current.save(session("C")); });
    expect(writer).toHaveBeenCalledWith([expect.objectContaining({ id: "B" }), expect.objectContaining({ id: "C" })]);
  });

  it("ignores a late initial MCP status after a newer configuration result", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const oldStatus = deferred<ReturnType<typeof mcpStatus>>();
    vi.mocked(getMcpBridgeStatus).mockReturnValueOnce(oldStatus.promise as never);
    vi.mocked(setMcpBridgeEnabled).mockResolvedValue(mcpStatus(true) as never);
    const initialConfig = { enabled: false, port: 43129 };
    const { result, rerender } = renderHook(
      ({ config }) => useMcpBridgeSettings({ mcpBridge: config, persistMcpBridge: vi.fn().mockResolvedValue(undefined), setSettingsMessage: vi.fn() }),
      { initialProps: { config: initialConfig } },
    );
    await waitFor(() => expect(getMcpBridgeStatus).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.updateMcpBridgeConfig({ enabled: true }); });
    rerender({ config: result.current.mcpBridgeSettings });
    expect(result.current.mcpBridgeStatus?.status).toBe("listening");
    await act(async () => { oldStatus.resolve(mcpStatus(false)); await Promise.resolve(); });
    expect(result.current.mcpBridgeStatus?.status).toBe("listening");
  });

  it("does not roll back a saved config when its follow-up status query fails", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(getMcpBridgeStatus).mockResolvedValueOnce(mcpStatus(false) as never).mockRejectedValueOnce(new Error("status offline"));
    const persist = vi.fn().mockResolvedValue(undefined);
    const setMessage = vi.fn();
    const initialConfig = { enabled: false, port: 43129 };
    const { result, rerender } = renderHook(
      ({ config }) => useMcpBridgeSettings({ mcpBridge: config, persistMcpBridge: persist, setSettingsMessage: setMessage }),
      { initialProps: { config: initialConfig } },
    );
    await waitFor(() => expect(result.current.mcpBridgeStatus?.status).toBe("disabled"));
    await act(async () => { await result.current.updateMcpBridgeConfig({ port: 43130 }); });
    rerender({ config: result.current.mcpBridgeSettings });
    expect(persist).toHaveBeenCalledWith({ enabled: false, port: 43130 });
    expect(setMcpBridgeEnabled).not.toHaveBeenCalled();
    expect(result.current.mcpBridgeSettings.port).toBe(43130);
    expect(setMessage).toHaveBeenCalledWith(expect.stringContaining("설정은 저장했지만"));
  });
});
