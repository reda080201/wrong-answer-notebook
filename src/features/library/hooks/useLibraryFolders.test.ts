import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "../../../api";
import { useLibraryFolders } from "./useLibraryFolders";
import type { LibraryFolder } from "../../../types";

vi.mock("../../../api");

describe("useLibraryFolders", () => {
  const mockFolder: LibraryFolder = {
    id: "folder-1",
    name: "Test Folder",
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
  const initialFolders: LibraryFolder[] = [mockFolder];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads library folders on mount", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    const { result } = renderHook(() => useLibraryFolders());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.folders).toEqual(initialFolders);
  });

  it("persists folder changes immediately via saveLibraryFolders", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    vi.mocked(api.saveLibraryFolders).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newFolder: LibraryFolder = {
      id: "folder-2",
      name: "New Folder",
      sortOrder: 1,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    };
    await act(async () => {
      await result.current.mutate((current) => [...current, newFolder]);
    });
    expect(api.saveLibraryFolders).toHaveBeenCalledWith([...initialFolders, newFolder]);
  });

  it("flush waits for in-flight mutate before resolving", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    let resolveSave: () => void = () => undefined;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(api.saveLibraryFolders).mockReturnValue(savePromise);

    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newFolder: LibraryFolder = {
      id: "folder-2",
      name: "New Folder",
      sortOrder: 1,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    };

    let mutationDone = false;
    const mutationPromise = act(async () => {
      await result.current.mutate((current) => [...current, newFolder]);
      mutationDone = true;
    });
    await waitFor(() => expect(api.saveLibraryFolders).toHaveBeenCalled());

    const flushPromise = result.current.flush();
    expect(mutationDone).toBe(false);
    resolveSave();
    await mutationPromise;
    await flushPromise;
    expect(result.current.folders).toEqual([...initialFolders, newFolder]);
  });

  it("exposes flush for close guard integration", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    const { result } = renderHook(() => useLibraryFolders());
    expect(typeof result.current.flush).toBe("function");
    await expect(result.current.flush()).resolves.toBeUndefined();
  });
});
