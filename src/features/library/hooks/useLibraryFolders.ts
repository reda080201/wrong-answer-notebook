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
  const { enqueue, drain } = useSerialTaskQueue();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await drain();
      const next = await loadLibraryFolders();
      foldersRef.current = next;
      setFolders(next);
      loadedRef.current = true;
    } catch (caught) {
      setError(message(caught, "폴더 목록을 불러오지 못했습니다."));
      loadedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [drain]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (recipe: (current: LibraryFolder[]) => LibraryFolder[]) => {
    if (!loadedRef.current) throw new Error("폴더 목록을 불러오는 중입니다.");
    const task = enqueue(async () => {
      const next = recipe(foldersRef.current);
      await saveLibraryFolders(next);
      foldersRef.current = next;
      setFolders(next);
      return next;
    });
    try {
      setError(null);
      await task;
    } catch (caught) {
      const nextError = message(caught, "폴더 변경을 저장하지 못했습니다.");
      setError(nextError);
      throw new Error(nextError, { cause: caught });
    }
  }, [enqueue]);

  return { folders, loading, error, clearError: () => setError(null), refresh, mutate, flush: drain };
}
