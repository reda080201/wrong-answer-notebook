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
  const maintenanceBlockedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const lastOperationRef = useRef<Promise<unknown>>(Promise.resolve());
  const { enqueue, drain } = useSerialTaskQueue();

  const refresh = useCallback(async () => {
    const request = ++loadRequestRef.current;
    const revision = mutationRevisionRef.current;
    setLoading(true);
    setError(null);
    loadedRef.current = false;
    try {
      await drain();
      const next = await loadLibraryFolders();
      if (request !== loadRequestRef.current || revision !== mutationRevisionRef.current) return;
      foldersRef.current = next;
      setFolders(next);
      loadedRef.current = true;
    } catch (caught) {
      if (request === loadRequestRef.current && revision === mutationRevisionRef.current) {
        setError(message(caught, "폴더 목록을 불러오지 못했습니다."));
        loadedRef.current = false;
      }
    } finally {
      if (request === loadRequestRef.current) setLoading(false);
    }
  }, [drain]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (recipe: (current: LibraryFolder[]) => LibraryFolder[]) => {
    if (maintenanceBlockedRef.current) throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
    if (!loadedRef.current) throw new Error("폴더 목록을 불러오는 중입니다.");
    const revision = ++mutationRevisionRef.current;
    const task = enqueue(async () => {
      if (maintenanceBlockedRef.current) throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
      if (!loadedRef.current) throw new Error("폴더 목록을 불러오는 중입니다.");
      const next = recipe(foldersRef.current);
      await saveLibraryFolders(next);
      if (revision !== mutationRevisionRef.current) return next;
      foldersRef.current = next;
      setFolders(next);
      return next;
    });
    lastOperationRef.current = task;
    try {
      setError(null);
      await task;
    } catch (caught) {
      const nextError = message(caught, "폴더 변경을 저장하지 못했습니다.");
      setError(nextError);
      throw new Error(nextError, { cause: caught });
    }
  }, [enqueue]);

  const flush = useCallback(async () => { await lastOperationRef.current; }, []);
  const setMaintenanceBlocked = useCallback((blocked: boolean) => { maintenanceBlockedRef.current = blocked; }, []);

  return { folders, loading, error, clearError: () => setError(null), refresh, mutate, flush, setMaintenanceBlocked };
}
