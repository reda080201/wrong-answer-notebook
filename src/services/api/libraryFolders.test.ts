import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";
import type { LibraryFolder } from "../../models/library";
import {
  loadLibraryFolders,
  loadLibraryFoldersFromStorage,
  saveLibraryFolders,
  saveLibraryFoldersToStorage,
} from "./libraryFolders";

const mockedInvoke = vi.mocked(invoke);
const mockedIsTauri = vi.mocked(isTauri);

const folder = (id = "folder-1"): LibraryFolder => ({
  id,
  name: "수학",
  sortOrder: 0,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  } as Storage;
}

describe("library folder persistence", () => {
  beforeEach(() => mockedIsTauri.mockReturnValue(false));
  afterEach(() => vi.clearAllMocks());

  it("keeps an absent browser folder store as an empty root", () => {
    const storage = memoryStorage();
    expect(loadLibraryFoldersFromStorage(storage)).toEqual([]);

    saveLibraryFoldersToStorage([folder()], storage);
    expect(loadLibraryFoldersFromStorage(storage)).toEqual([folder()]);
  });

  it("rejects duplicate folder ids and self-parenting browser data", () => {
    const storage = memoryStorage();
    expect(() => saveLibraryFoldersToStorage([folder(), folder() ], storage)).toThrow();
    expect(() => saveLibraryFoldersToStorage([{ ...folder(), parentId: "folder-1" }], storage)).toThrow();
  });

  it("uses the dedicated Tauri commands", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValueOnce([folder()]).mockResolvedValueOnce(undefined);

    await expect(loadLibraryFolders()).resolves.toEqual([folder()]);
    await saveLibraryFolders([folder()]);

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "load_library_folders");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "save_library_folders", { folders: [folder()] });
  });
});
