import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpBridgeRuntimeStatus } from "./useMcpBridgeSettings";
import { useBridgeActiveSync } from "./useBridgeActiveSync";

const liveStatus: McpBridgeRuntimeStatus = {
  status: "listening",
  port: 3847,
  readOnly: true,
  error: null,
  lastConnectionTestAt: null,
  lastConnectionTestOk: null,
};

describe("useBridgeActiveSync", () => {
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
});
