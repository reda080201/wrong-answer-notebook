import { useCallback, useEffect, useRef, useState } from "react";
import { saveLibraryFolders, loadLibraryFolders } from "../../../api";
import type { LibraryFolder } from "../../../types";
import { useSerialTaskQueue } from "../../../hooks/useSerialTaskQueue";

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useLibraryFolders() {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const foldersRef = useRef<LibraryFolder[]>([]);
  const loadedRef = useRef(false);
  const reloadingRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const lastOperationRef = useRef<Promise<unknown>>(Promise.resolve());
  const { enqueue, drain } = useSerialTaskQueue();

  const loadFolderSnapshot = useCallback(async (request: number) => {
    let revision = mutationRevisionRef.current;
    try {
      await drain();
      revision = mutationRevisionRef.current;
      const next = await loadLibraryFolders();
      return { request, revision, ok: true as const, folders: next };
    } catch (caught) {
      return { request, revision, ok: false as const, error: caught };
    }
  }, [drain]);

  const applyFolderSnapshot = useCallback((result: Awaited<ReturnType<typeof loadFolderSnapshot>>) => {
    if (result.request !== loadRequestRef.current) return false;
    if (!result.ok) {
      setError(message(result.error, "폴더 목록을 불러오지 못했습니다."));
      loadedRef.current = false;
      reloadingRef.current = false;
      setLoading(false);
      return false;
    }
    if (result.revision !== mutationRevisionRef.current) {
      reloadingRef.current = false;
      setLoading(false);
      return false;
    }
    foldersRef.current = result.folders;
    setFolders(result.folders);
    loadedRef.current = true;
    setError(null);
    reloadingRef.current = false;
    setLoading(false);
    return true;
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (reloadingRef.current) return false;
    reloadingRef.current = true;
    loadedRef.current = false;
    const request = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    return loadFolderSnapshot(request).then(applyFolderSnapshot);
  }, [applyFolderSnapshot, loadFolderSnapshot]);

  useEffect(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    const request = ++loadRequestRef.current;
    void loadFolderSnapshot(request).then(applyFolderSnapshot);
  }, [applyFolderSnapshot, loadFolderSnapshot]);

  const mutate = useCallback(async (recipe: (current: LibraryFolder[]) => LibraryFolder[]) => {
    if (maintenanceBlockedRef.current) throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
    if (reloadingRef.current) throw new Error("폴더 목록을 새로 불러오는 중입니다. 완료된 뒤 다시 시도해 주세요.");
    if (!loadedRef.current) throw new Error("폴더 목록을 불러오는 중입니다.");
    const revision = ++mutationRevisionRef.current;
    const task = enqueue(async () => {
      const next = recipe(foldersRef.current);
      await saveLibraryFolders(next);
      foldersRef.current = next;
      setFolders(next);
      if (revision === mutationRevisionRef.current) {
        setError(null);
      }
      return next;
    });
    lastOperationRef.current = task;
    try {
      setError(null);
      await task;
    } catch (caught) {
      const nextError = message(caught, "폴더 변경을 저장하지 못했습니다.");
      if (revision === mutationRevisionRef.current) setError(nextError);
      throw new Error(nextError, { cause: caught });
    }
  }, [enqueue]);

  const flush = useCallback(async () => { await lastOperationRef.current; }, []);
  const setMaintenanceBlocked = useCallback((blocked: boolean) => { maintenanceBlockedRef.current = blocked; }, []);

  return { folders, loading, error, clearError: () => setError(null), refresh, mutate, flush, setMaintenanceBlocked };
}
