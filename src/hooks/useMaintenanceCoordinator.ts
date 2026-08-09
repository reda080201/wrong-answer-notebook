import { useCallback, useRef } from "react";

interface MaintenanceCoordinatorOptions {
  flushEntries(): Promise<void>;
  flushSettings(): Promise<void>;
  flushGeneratedExams(): Promise<void>;
  flushLibraryFolders?(): Promise<void>;
  flushGptSolutionDrafts?(): Promise<void>;
  setEntriesMaintenanceBlocked(blocked: boolean): void;
  setSettingsMaintenanceBlocked(blocked: boolean): void;
  setGeneratedExamsMaintenanceBlocked(blocked: boolean): void;
  setLibraryMaintenanceBlocked?(blocked: boolean): void;
  setGptSolutionDraftsMaintenanceBlocked?(blocked: boolean): void;
}

export function useMaintenanceCoordinator({
  flushEntries,
  flushSettings,
  flushGeneratedExams,
  flushLibraryFolders = async () => undefined,
  flushGptSolutionDrafts = async () => undefined,
  setEntriesMaintenanceBlocked,
  setSettingsMaintenanceBlocked,
  setGeneratedExamsMaintenanceBlocked,
  setLibraryMaintenanceBlocked = () => undefined,
  setGptSolutionDraftsMaintenanceBlocked = () => undefined,
}: MaintenanceCoordinatorOptions) {
  const activeRef = useRef(false);

  return useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    if (activeRef.current) throw new Error("백업, 복원 또는 업데이트 준비 작업이 이미 진행 중입니다.");
    activeRef.current = true;
    setEntriesMaintenanceBlocked(true);
    setSettingsMaintenanceBlocked(true);
    setGeneratedExamsMaintenanceBlocked(true);
    setLibraryMaintenanceBlocked(true);
    setGptSolutionDraftsMaintenanceBlocked(true);
    try {
      await Promise.all([
        flushEntries(),
        flushSettings(),
        flushGeneratedExams(),
        flushLibraryFolders(),
        flushGptSolutionDrafts(),
      ]);
      return await task();
    } finally {
      setEntriesMaintenanceBlocked(false);
      setSettingsMaintenanceBlocked(false);
      setGeneratedExamsMaintenanceBlocked(false);
      setLibraryMaintenanceBlocked(false);
      setGptSolutionDraftsMaintenanceBlocked(false);
      activeRef.current = false;
    }
  }, [flushEntries, flushGeneratedExams, flushGptSolutionDrafts, flushLibraryFolders, flushSettings, setEntriesMaintenanceBlocked, setGeneratedExamsMaintenanceBlocked, setGptSolutionDraftsMaintenanceBlocked, setLibraryMaintenanceBlocked, setSettingsMaintenanceBlocked]);
}
