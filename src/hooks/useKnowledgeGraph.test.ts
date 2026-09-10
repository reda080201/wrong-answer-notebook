import { renderHook, waitFor } from "@testing-library/react";
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
});
