import { useCallback, useRef } from "react";

interface MaintenanceCoordinatorOptions {
  flushEntries(): Promise<void>;
  flushSettings(): Promise<void>;
  flushGeneratedExams(): Promise<void>;
  setEntriesMaintenanceBlocked(blocked: boolean): void;
  setSettingsMaintenanceBlocked(blocked: boolean): void;
  setGeneratedExamsMaintenanceBlocked(blocked: boolean): void;
}

export function useMaintenanceCoordinator({
  flushEntries,
  flushSettings,
  flushGeneratedExams,
  setEntriesMaintenanceBlocked,
  setSettingsMaintenanceBlocked,
  setGeneratedExamsMaintenanceBlocked,
}: MaintenanceCoordinatorOptions) {
  const activeRef = useRef(false);

  return useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    if (activeRef.current) throw new Error("백업, 복원 또는 업데이트 준비 작업이 이미 진행 중입니다.");
    activeRef.current = true;
    setEntriesMaintenanceBlocked(true);
    setSettingsMaintenanceBlocked(true);
    setGeneratedExamsMaintenanceBlocked(true);
    try {
      await Promise.all([flushEntries(), flushSettings(), flushGeneratedExams()]);
      return await task();
    } finally {
      setEntriesMaintenanceBlocked(false);
      setSettingsMaintenanceBlocked(false);
      setGeneratedExamsMaintenanceBlocked(false);
      activeRef.current = false;
    }
  }, [flushEntries, flushGeneratedExams, flushSettings, setEntriesMaintenanceBlocked, setGeneratedExamsMaintenanceBlocked, setSettingsMaintenanceBlocked]);
}
