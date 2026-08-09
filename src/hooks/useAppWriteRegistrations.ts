import { useCallback, useRef } from "react";

export type TransientWriteRegistration = {
  flush: () => Promise<void>;
  setMaintenanceBlocked?: (blocked: boolean) => void;
} | null;

/** Keeps transient feature flush callbacks out of the application shell. */
export function useAppWriteRegistrations() {
  const workspaceDraftRef = useRef<TransientWriteRegistration>(null);
  const questionBankPreferenceRef = useRef<TransientWriteRegistration>(null);

  const registerWorkspaceDraftFlush = useCallback((registration: TransientWriteRegistration) => {
    workspaceDraftRef.current = registration;
  }, []);
  const registerQuestionBankPreferenceFlush = useCallback((registration: TransientWriteRegistration) => {
    questionBankPreferenceRef.current = registration;
  }, []);
  const flushTransientWrites = useCallback(async () => {
    await workspaceDraftRef.current?.flush();
    await questionBankPreferenceRef.current?.flush();
  }, []);
  const setTransientWritesMaintenanceBlocked = useCallback((blocked: boolean) => {
    workspaceDraftRef.current?.setMaintenanceBlocked?.(blocked);
    questionBankPreferenceRef.current?.setMaintenanceBlocked?.(blocked);
  }, []);

  return {
    registerWorkspaceDraftFlush,
    registerQuestionBankPreferenceFlush,
    flushTransientWrites,
    setTransientWritesMaintenanceBlocked,
  };
}
