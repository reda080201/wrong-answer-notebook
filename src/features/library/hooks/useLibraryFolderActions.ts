import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { LibraryFolder, WrongAnswerEntry } from "../../../types";
import { getFolderDescendantIds } from "../../../utils/libraryFolders";

interface LibraryFolderStore {
  folders: LibraryFolder[];
  mutate(recipe: (current: LibraryFolder[]) => LibraryFolder[]): Promise<void>;
}

interface UseLibraryFolderActionsOptions {
  entries: WrongAnswerEntry[];
  library: LibraryFolderStore;
  patchEntry(entryId: string, patch: Partial<WrongAnswerEntry>): Promise<unknown>;
  confirm(options: { title?: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>;
  prompt(options: { title?: string; message: string; defaultValue?: string }): Promise<string | null>;
}

export function useLibraryFolderActions({
  entries,
  library,
  patchEntry,
  confirm,
  prompt,
}: UseLibraryFolderActionsOptions) {
  const createFolder = useCallback(async (parentId?: string) => {
    const name = await prompt({ title: "새 폴더", message: "폴더 이름을 입력하세요." });
    if (!name?.trim()) return;
    const now = new Date().toISOString();
    await library.mutate((current) => [
      ...current,
      {
        id: uuidv4(),
        name: name.trim(),
        parentId,
        sortOrder: current.filter((folder) => folder.parentId === parentId).length,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, [library, prompt]);

  const renameFolder = useCallback(async (folder: LibraryFolder) => {
    const name = await prompt({ title: "폴더 이름 변경", message: "새 폴더 이름을 입력하세요.", defaultValue: folder.name });
    if (!name?.trim() || name.trim() === folder.name) return;
    await library.mutate((current) => current.map((item) => (
      item.id === folder.id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item
    )));
  }, [library, prompt]);

  const moveFolder = useCallback(async (folder: LibraryFolder, parentId?: string) => {
    if (folder.id === parentId) throw new Error("폴더를 자기 자신으로 이동할 수 없습니다.");
    const descendants = getFolderDescendantIds(library.folders, folder.id);
    if (parentId && descendants.has(parentId)) throw new Error("폴더를 자신의 하위 폴더로 이동할 수 없습니다.");
    await library.mutate((current) => current.map((item) => (
      item.id === folder.id ? { ...item, parentId, updatedAt: new Date().toISOString() } : item
    )));
  }, [library]);

  const moveEntries = useCallback(async (entryIds: string[], folderId?: string) => {
    const validFolderId = folderId && library.folders.some((folder) => folder.id === folderId)
      ? folderId
      : undefined;
    await Promise.all(entryIds.map((entryId) => patchEntry(entryId, { folderId: validFolderId })));
  }, [library.folders, patchEntry]);

  const deleteFolder = useCallback(async (folder: LibraryFolder) => {
    const childFolders = library.folders.filter((item) => item.parentId === folder.id);
    const childEntries = entries.filter((entry) => entry.folderId === folder.id);
    const accepted = await confirm({
      title: "폴더 삭제",
      message: childFolders.length || childEntries.length
        ? `이 폴더의 하위 폴더 ${childFolders.length}개와 항목 ${childEntries.length}개를 루트로 이동합니다. 항목은 삭제되지 않습니다.`
        : "빈 폴더를 삭제합니다.",
      confirmLabel: "삭제",
    });
    if (!accepted) return;
    await Promise.all(childEntries.map((entry) => patchEntry(entry.id, { folderId: undefined })));
    await library.mutate((current) => current
      .filter((item) => item.id !== folder.id)
      .map((item) => item.parentId === folder.id ? { ...item, parentId: undefined, updatedAt: new Date().toISOString() } : item));
  }, [confirm, entries, library, patchEntry]);

  return { createFolder, renameFolder, moveFolder, moveEntries, deleteFolder };
}
