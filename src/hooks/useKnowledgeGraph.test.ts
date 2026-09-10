import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageBackend } from "../services/storageBackend";
import { useKnowledgeGraph } from "./useKnowledgeGraph";

vi.mock("../services/storageBackend", () => ({ getStorageBackend: vi.fn() }));

describe("useKnowledgeGraph load readiness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks an empty graph ready only after a successful load", async () => {
    vi.mocked(getStorageBackend).mockReturnValue({
      loadKnowledgeGraph: vi.fn().mockResolvedValue({ entities: [], relations: [], questionLinks: [] }),
    } as never);
    const { result } = renderHook(() => useKnowledgeGraph());
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    expect(result.current.ready).toBe(true);
    expect(result.current.graph).toEqual({ entities: [], relations: [], questionLinks: [] });
  });

  it("does not expose a failed graph load as ready", async () => {
    vi.mocked(getStorageBackend).mockReturnValue({
      loadKnowledgeGraph: vi.fn().mockRejectedValue(new Error("offline")),
    } as never);
    const { result } = renderHook(() => useKnowledgeGraph());
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    expect(result.current.ready).toBe(false);
    expect(result.current.graph).toEqual({ entities: [], relations: [], questionLinks: [] });
  });

  it("does not write before the initial graph load succeeds", async () => {
    let resolveLoad!: (value: unknown) => void;
    const saveKnowledgeGraph = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getStorageBackend).mockReturnValue({
      loadKnowledgeGraph: vi.fn(() => new Promise((resolve) => { resolveLoad = resolve; })),
      saveKnowledgeGraph,
    } as never);
    const { result } = renderHook(() => useKnowledgeGraph());

    await expect(result.current.createEntity({
      id: "entity-1",
      type: "concept",
      name: "미분",
      aliases: [],
      provenance: "manual",
    })).rejects.toThrow("불러오지 못했습니다");
    expect(saveKnowledgeGraph).not.toHaveBeenCalled();

    resolveLoad({ entities: [], relations: [], questionLinks: [] });
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    await act(async () => {
      await result.current.createEntity({ id: "entity-1", type: "concept", name: "미분", aliases: [], provenance: "manual" });
    });
    expect(saveKnowledgeGraph).toHaveBeenCalledTimes(1);
  });
});
