import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageBackend } from "../services/storageBackend";
import type { KnowledgeGraphStore } from "../models/knowledgeGraph";
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

  it("runs refresh after a pending mutation and loads the committed graph", async () => {
    let persisted = { entities: [], relations: [], questionLinks: [] };
    let releaseWrite!: () => void;
    const saveKnowledgeGraph = vi.fn(async (value: typeof persisted) => {
      await new Promise<void>((resolve) => { releaseWrite = resolve; });
      persisted = value;
    });
    const loadKnowledgeGraph = vi.fn(async () => persisted);
    vi.mocked(getStorageBackend).mockReturnValue({ loadKnowledgeGraph, saveKnowledgeGraph } as never);
    const { result } = renderHook(() => useKnowledgeGraph());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let create!: Promise<unknown>;
    act(() => { create = result.current.createEntity({ id: "a", type: "concept", name: "A", aliases: [], provenance: "manual" }); });
    await waitFor(() => expect(saveKnowledgeGraph).toHaveBeenCalledTimes(1));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refresh(); });
    expect(loadKnowledgeGraph).toHaveBeenCalledTimes(1);
    releaseWrite();
    await act(async () => { await create; await refresh; });

    expect(loadKnowledgeGraph).toHaveBeenCalledTimes(2);
    expect(result.current.graph.entities.map((entity) => entity.id)).toEqual(["a"]);
  });

  it("queues a mutation behind a pending refresh and applies it to the loaded graph", async () => {
    let loadCount = 0;
    let releaseRefresh!: (value: unknown) => void;
    const persisted = { entities: [{ id: "loaded", type: "concept", name: "Loaded", aliases: [], provenance: "manual" }], relations: [], questionLinks: [] };
    const loadKnowledgeGraph = vi.fn(() => {
      loadCount += 1;
      if (loadCount === 1) return Promise.resolve({ entities: [], relations: [], questionLinks: [] });
      return new Promise((resolve) => { releaseRefresh = resolve; });
    });
    const saveKnowledgeGraph = vi.fn<(value: KnowledgeGraphStore) => Promise<void>>().mockResolvedValue(undefined);
    vi.mocked(getStorageBackend).mockReturnValue({ loadKnowledgeGraph, saveKnowledgeGraph } as never);
    const { result } = renderHook(() => useKnowledgeGraph());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refresh(); });
    let create!: Promise<unknown>;
    act(() => { create = result.current.createEntity({ id: "new", type: "concept", name: "New", aliases: [], provenance: "manual" }); });
    await waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    expect(saveKnowledgeGraph).not.toHaveBeenCalled();
    releaseRefresh(persisted);
    await act(async () => { await refresh; await create; });

    expect(saveKnowledgeGraph).toHaveBeenCalledTimes(1);
    expect(saveKnowledgeGraph.mock.calls[0][0].entities.map((entity) => entity.id)).toEqual(["loaded", "new"]);
    expect(result.current.graph.entities.map((entity) => entity.id)).toEqual(["loaded", "new"]);
  });

  it("keeps the last committed graph when a later refresh fails", async () => {
    const loadKnowledgeGraph = vi.fn()
      .mockResolvedValueOnce({ entities: [], relations: [], questionLinks: [] })
      .mockRejectedValueOnce(new Error("refresh offline"));
    const saveKnowledgeGraph = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getStorageBackend).mockReturnValue({ loadKnowledgeGraph, saveKnowledgeGraph } as never);
    const { result } = renderHook(() => useKnowledgeGraph());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.createEntity({ id: "kept", type: "concept", name: "Kept", aliases: [], provenance: "manual" }); });

    await act(async () => { await result.current.refresh(); });

    expect(result.current.graph.entities.map((entity) => entity.id)).toEqual(["kept"]);
    expect(result.current.ready).toBe(true);
    expect(result.current.loadStatus).toBe("error");
    expect(result.current.error).toBe("refresh offline");
  });
});
