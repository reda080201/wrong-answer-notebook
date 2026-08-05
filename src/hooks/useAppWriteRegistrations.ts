import { useCallback, useRef } from "react";

type FlushCallback = (() => Promise<void>) | null;

/** Keeps transient feature flush callbacks out of the application shell. */
export function useAppWriteRegistrations() {
  const workspaceDraftFlushRef = useRef<FlushCallback>(null);
  const questionBankPreferenceFlushRef = useRef<FlushCallback>(null);

  const registerWorkspaceDraftFlush = useCallback((flush: FlushCallback) => {
    workspaceDraftFlushRef.current = flush;
  }, []);
  const registerQuestionBankPreferenceFlush = useCallback((flush: FlushCallback) => {
    questionBankPreferenceFlushRef.current = flush;
  }, []);
  const flushTransientWrites = useCallback(async () => {
    await workspaceDraftFlushRef.current?.();
    await questionBankPreferenceFlushRef.current?.();
  }, []);

  return {
    registerWorkspaceDraftFlush,
    registerQuestionBankPreferenceFlush,
    flushTransientWrites,
  };
}
