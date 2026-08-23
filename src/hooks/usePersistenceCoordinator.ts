import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ExamSession } from "../types";
import { useMaintenanceCoordinator } from "./useMaintenanceCoordinator";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

interface UsePersistenceCoordinatorOptions {
  activeExam: ExamSession | null;
  examSaveTimerRef: MutableRefObject<number | null>;
  examSessionRef: MutableRefObject<ExamSession | null>;
  flushExamSession: (session: ExamSession) => Promise<boolean>;
  flushEntries: () => Promise<void>;
  flushSettings: () => Promise<void>;
  flushGeneratedExams: () => Promise<void>;
  flushImportWorkspaceDraft: () => Promise<void>;
  flushLibraryFolders: () => Promise<void>;
  flushGptSolutionDrafts: () => Promise<void>;
  flushTransientWrites: () => Promise<void>;
  setTransientWritesMaintenanceBlocked(blocked: boolean): void;
  setEntriesMaintenanceBlocked(blocked: boolean): void;
  setSettingsMaintenanceBlocked(blocked: boolean): void;
  setGeneratedExamsMaintenanceBlocked(blocked: boolean): void;
  setLibraryMaintenanceBlocked(blocked: boolean): void;
  setGptSolutionDraftsMaintenanceBlocked(blocked: boolean): void;
  confirmCloseWithoutSaving(): Promise<boolean>;
}

export function usePersistenceCoordinator(options: UsePersistenceCoordinatorOptions) {
  const { examSaveTimerRef, examSessionRef, flushExamSession } = options;
  const flushActiveExam = useCallback(async () => {
    if (examSaveTimerRef.current !== null) {
      window.clearTimeout(examSaveTimerRef.current);
      examSaveTimerRef.current = null;
    }
    const current = examSessionRef.current;
    if (current && !(await flushExamSession(current))) {
      throw new Error("시험 진행 상태를 저장하지 못했습니다.");
    }
  }, [examSaveTimerRef, examSessionRef, flushExamSession]);

  const runMaintenanceOperation = useMaintenanceCoordinator({
    flushEntries: options.flushEntries,
    flushSettings: options.flushSettings,
    flushGeneratedExams: options.flushGeneratedExams,
    flushLibraryFolders: options.flushLibraryFolders,
    flushGptSolutionDrafts: options.flushGptSolutionDrafts,
    flushActiveExam,
    flushTransientWrites: options.flushTransientWrites,
    setTransientWritesMaintenanceBlocked: options.setTransientWritesMaintenanceBlocked,
    setEntriesMaintenanceBlocked: options.setEntriesMaintenanceBlocked,
    setSettingsMaintenanceBlocked: options.setSettingsMaintenanceBlocked,
    setGeneratedExamsMaintenanceBlocked: options.setGeneratedExamsMaintenanceBlocked,
    setLibraryMaintenanceBlocked: options.setLibraryMaintenanceBlocked,
    setGptSolutionDraftsMaintenanceBlocked: options.setGptSolutionDraftsMaintenanceBlocked,
  });
  const closeGuard = useWindowCloseGuard({
    activeExam: options.activeExam,
    examSaveTimerRef: options.examSaveTimerRef,
    flushExamSession: options.flushExamSession,
    flushEntries: options.flushEntries,
    flushGeneratedExams: options.flushGeneratedExams,
    flushSettings: options.flushSettings,
    flushImportWorkspaceDraft: options.flushImportWorkspaceDraft,
    flushLibraryFolders: options.flushLibraryFolders,
    flushGptSolutionDrafts: options.flushGptSolutionDrafts,
    confirmCloseWithoutSaving: options.confirmCloseWithoutSaving,
  });
  return { runMaintenanceOperation, flushActiveExam, ...closeGuard };
}
