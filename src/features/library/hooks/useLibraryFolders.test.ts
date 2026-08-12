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

  it("blocks mutations while a refresh is reading a new folder snapshot", async () => {
    let resolveRefresh!: (folders: LibraryFolder[]) => void;
    vi.mocked(api.loadLibraryFolders)
      .mockResolvedValueOnce(initialFolders)
      .mockReturnValueOnce(new Promise<LibraryFolder[]>((resolve) => { resolveRefresh = resolve; }));
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const refresh = result.current.refresh();
    await waitFor(() => expect(result.current.loading).toBe(true));
    await expect(result.current.mutate((current) => current)).rejects.toThrow("불러오는 중");
    expect(api.saveLibraryFolders).not.toHaveBeenCalled();

    resolveRefresh(initialFolders);
    await act(async () => { await refresh; });
    expect(result.current.folders).toEqual(initialFolders);
  });

  it("uses each successful queued mutation as the next canonical folder state", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    vi.mocked(api.saveLibraryFolders).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const folderB = { ...mockFolder, id: "folder-b", name: "B" };
    const folderC = { ...mockFolder, id: "folder-c", name: "C" };

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.mutate((current) => [...current, folderB]);
      second = result.current.mutate((current) => [...current, folderC]);
      await Promise.all([first, second]);
    });

    expect(api.saveLibraryFolders).toHaveBeenNthCalledWith(1, [...initialFolders, folderB]);
    expect(api.saveLibraryFolders).toHaveBeenNthCalledWith(2, [...initialFolders, folderB, folderC]);
    expect(result.current.folders).toEqual([...initialFolders, folderB, folderC]);
  });

  it("keeps the last successful snapshot after a queued save fails", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    vi.mocked(api.saveLibraryFolders)
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const folderB = { ...mockFolder, id: "folder-b", name: "B" };
    const folderC = { ...mockFolder, id: "folder-c", name: "C" };

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.mutate((current) => [...current, folderB]);
      second = result.current.mutate((current) => [...current, folderC]);
      await Promise.allSettled([first, second]);
    });

    expect(api.saveLibraryFolders).toHaveBeenNthCalledWith(2, [...initialFolders, folderC]);
    expect(result.current.folders).toEqual([...initialFolders, folderC]);
  });

  it("keeps a prior successful mutation visible when the next queued mutation fails", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    vi.mocked(api.saveLibraryFolders)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk full"));
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const folderB = { ...mockFolder, id: "folder-b", name: "B" };
    const folderC = { ...mockFolder, id: "folder-c", name: "C" };

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.mutate((current) => [...current, folderB]);
      second = result.current.mutate((current) => [...current, folderC]);
      await Promise.allSettled([first, second]);
    });

    expect(api.saveLibraryFolders).toHaveBeenNthCalledWith(1, [...initialFolders, folderB]);
    expect(api.saveLibraryFolders).toHaveBeenNthCalledWith(2, [...initialFolders, folderB, folderC]);
    expect(result.current.folders).toEqual([...initialFolders, folderB]);
  });

  it("flushes an accepted mutation while maintenance rejects only later mutations", async () => {
    vi.mocked(api.loadLibraryFolders).mockResolvedValue(initialFolders);
    let finishSave!: () => void;
    vi.mocked(api.saveLibraryFolders).mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const folderB = { ...mockFolder, id: "folder-b", name: "B" };

    const accepted = result.current.mutate((current) => [...current, folderB]);
    result.current.setMaintenanceBlocked(true);
    await expect(result.current.mutate((current) => current)).rejects.toThrow("백업 또는 복원이 진행 중");
    finishSave();
    await expect(accepted).resolves.toBeUndefined();
    await expect(result.current.flush()).resolves.toBeUndefined();
  });

  it("drains an accepted mutation before loading a refreshed folder snapshot", async () => {
    const refreshedFolders = [{ ...mockFolder, name: "Refreshed" }];
    vi.mocked(api.loadLibraryFolders)
      .mockResolvedValueOnce(initialFolders)
      .mockResolvedValueOnce(refreshedFolders);
    let finishSave!: () => void;
    vi.mocked(api.saveLibraryFolders).mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    const { result } = renderHook(() => useLibraryFolders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const folderB = { ...mockFolder, id: "folder-b", name: "B" };

    const mutation = result.current.mutate((current) => [...current, folderB]);
    const reload = result.current.refresh();
    finishSave();
    await act(async () => { await Promise.all([mutation, reload]); });

    expect(api.saveLibraryFolders).toHaveBeenCalledWith([...initialFolders, folderB]);
    expect(result.current.folders).toEqual(refreshedFolders);
  });
});
