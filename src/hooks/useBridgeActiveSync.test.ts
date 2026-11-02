import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpBridgeRuntimeStatus } from "./useMcpBridgeSettings";
import { useBridgeActiveSync } from "./useBridgeActiveSync";
import { syncMcpBridgeActiveContext } from "../api";
vi.mock("../api", () => ({ syncMcpBridgeActiveContext: vi.fn() }));

const liveStatus: McpBridgeRuntimeStatus = {
  status: "listening",
  port: 3847,
  readOnly: true,
  error: null,
  lastTestAt: null,
  lastTestOk: null,
  lastClientConnectedAt: null,
};

describe("useBridgeActiveSync", () => {
  it("keeps the latest context error when an earlier sync succeeds late", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.mocked(syncMcpBridgeActiveContext).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error("latest failed"));
    const view = renderHook(() => useBridgeActiveSync(true));
    act(() => view.result.current.syncActiveContext({ entryId: "a", questionNumber: "1" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    act(() => view.result.current.syncActiveContext({ entryId: "b", questionNumber: "1" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(view.result.current.bridgeSyncState.lastSyncError).toBe("latest failed");
    await act(async () => finish());
    expect(view.result.current.bridgeSyncState.lastSyncError).toBe("latest failed");
    view.unmount();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays inactive when bridge is disabled", () => {
    const { result } = renderHook(() =>
      useBridgeActiveSync({
        bridgeEnabled: false,
        bridgeStatus: liveStatus,
        syncEntries: vi.fn().mockResolvedValue(1),
        pollIntervalMs: 1000,
      }),
    );

    expect(result.current.bridgeSyncState.active).toBe(false);
    expect(result.current.bridgeSyncState.syncedCount).toBe(0);
  });

  it("syncs when bridge is live and enabled", async () => {
    const syncEntries = vi.fn().mockResolvedValue(2);

    const { result } = renderHook(() =>
      useBridgeActiveSync({
        bridgeEnabled: true,
        bridgeStatus: liveStatus,
        syncEntries,
        pollIntervalMs: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.bridgeSyncState.active).toBe(true);
    });

    await waitFor(() => {
      expect(syncEntries).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.bridgeSyncState.syncedCount).toBe(2);
    });
  });

  it("records sync errors", async () => {
    const syncEntries = vi.fn().mockRejectedValue(new Error("동기화 실패"));

    const { result } = renderHook(() =>
      useBridgeActiveSync({
        bridgeEnabled: true,
        bridgeStatus: liveStatus,
        syncEntries,
        pollIntervalMs: 60_000,
      }),
    );

    await act(async () => {
      await result.current.triggerBridgeSync();
    });

    expect(result.current.bridgeSyncState.lastSyncError).toBe("동기화 실패");
  });

  it("uses the latest legacy callback after a rerender", async () => {
    const first = vi.fn().mockResolvedValue(1);
    const second = vi.fn().mockResolvedValue(2);
    const { result, rerender } = renderHook(
      ({ syncEntries }) => useBridgeActiveSync({
        bridgeEnabled: true,
        bridgeStatus: liveStatus,
        syncEntries,
      }),
      { initialProps: { syncEntries: first } },
    );

    await waitFor(() => expect(first).toHaveBeenCalled());
    rerender({ syncEntries: second });
    await act(async () => { await result.current.triggerBridgeSync(); });

    expect(second).toHaveBeenCalledOnce();
  });
});
