import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageBackend } from "../services/storageBackend";
import { useReviewSessions } from "./useReviewSessions";

vi.mock("../services/storageBackend", () => ({ getStorageBackend: vi.fn() }));

describe("useReviewSessions load safety", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a save until the initial load succeeds", async () => {
    let resolveLoad!: (value: never[]) => void;
    const saveReviewSessions = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getStorageBackend).mockReturnValue({
      loadReviewSessions: vi.fn(() => new Promise((resolve) => { resolveLoad = resolve; })),
      saveReviewSessions,
    } as never);
    const { result } = renderHook(() => useReviewSessions());
    const session = { id: "session-1", mode: "random" as const, itemRefs: [], currentIndex: 0, completedItemKeys: [], reviewEvents: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

    await expect(result.current.save(session)).rejects.toThrow("불러오는 중");
    expect(saveReviewSessions).not.toHaveBeenCalled();
    resolveLoad([]);
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    await act(async () => { await result.current.save(session); });
    expect(saveReviewSessions).toHaveBeenCalledTimes(1);
  });

  it("keeps persistence unavailable after an initial load failure", async () => {
    const saveReviewSessions = vi.fn();
    vi.mocked(getStorageBackend).mockReturnValue({
      loadReviewSessions: vi.fn().mockRejectedValue(new Error("offline")),
      saveReviewSessions,
    } as never);
    const { result } = renderHook(() => useReviewSessions());
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    await expect(result.current.save({ id: "session-1", mode: "random", itemRefs: [], currentIndex: 0, completedItemKeys: [], reviewEvents: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow("offline");
    expect(saveReviewSessions).not.toHaveBeenCalled();
  });
});
