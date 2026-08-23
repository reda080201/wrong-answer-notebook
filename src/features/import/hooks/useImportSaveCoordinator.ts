import { useCallback, useRef, useState } from "react";

interface UseImportSaveCoordinatorOptions {
  onError(message: string): void;
  onSuccess?(): void;
}

export function useImportSaveCoordinator({ onError, onSuccess }: UseImportSaveCoordinatorOptions) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (operation: () => Promise<void>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
      onSuccess?.();
      return true;
    } catch (error) {
      onError(error instanceof Error && error.message.trim() ? error.message : "가져온 항목을 저장하지 못했습니다.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onError, onSuccess]);
  return { busy, run };
}
