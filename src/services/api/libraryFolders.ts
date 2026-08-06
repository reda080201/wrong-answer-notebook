import { invoke, isTauri } from "@tauri-apps/api/core";
import { isLibraryFolderArray, type LibraryFolder } from "../../models/library";
import { readStorageJson, writeStorageJson } from "../storageJson";
import { errorMessage } from "./shared";

export const LIBRARY_FOLDERS_STORAGE_KEY = "wrong-answer-library-folders";

export function loadLibraryFoldersFromStorage(
  storage: Storage = localStorage,
): LibraryFolder[] {
  return readStorageJson(storage, LIBRARY_FOLDERS_STORAGE_KEY, isLibraryFolderArray) ?? [];
}

export function saveLibraryFoldersToStorage(
  folders: LibraryFolder[],
  storage: Storage = localStorage,
): void {
  if (!isLibraryFolderArray(folders)) {
    throw new Error("폴더 데이터 형식이 올바르지 않습니다.");
  }
  writeStorageJson(storage, LIBRARY_FOLDERS_STORAGE_KEY, folders);
}

export async function loadLibraryFolders(): Promise<LibraryFolder[]> {
  try {
    if (isTauri()) return await invoke<LibraryFolder[]>("load_library_folders");
    return loadLibraryFoldersFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "폴더 목록을 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveLibraryFolders(folders: LibraryFolder[]): Promise<void> {
  try {
    if (isTauri()) {
      await invoke("save_library_folders", { folders });
      return;
    }
    saveLibraryFoldersToStorage(folders);
  } catch (error) {
    throw new Error(errorMessage(error, "폴더 목록을 저장하지 못했습니다."), { cause: error });
  }
}
