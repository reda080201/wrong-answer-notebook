import { useCallback, useRef } from "react";

interface MaintenanceCoordinatorOptions {
  flushEntries(): Promise<void>;
  flushSettings(): Promise<void>;
  flushGeneratedExams(): Promise<void>;
  flushLibraryFolders?(): Promise<void>;
  flushGptSolutionDrafts?(): Promise<void>;
  flushReviewSessions?(): Promise<void>;
  flushPendingDeletions?(): Promise<void>;
  flushKnowledgeGraph?(): Promise<void>;
  flushActiveExam?(): Promise<void>;
  flushTransientWrites?(): Promise<void>;
  setTransientWritesMaintenanceBlocked?(blocked: boolean): void;
  setEntriesMaintenanceBlocked(blocked: boolean): void;
  setSettingsMaintenanceBlocked(blocked: boolean): void;
  setGeneratedExamsMaintenanceBlocked(blocked: boolean): void;
  setLibraryMaintenanceBlocked?(blocked: boolean): void;
  setGptSolutionDraftsMaintenanceBlocked?(blocked: boolean): void;
  setKnowledgeGraphMaintenanceBlocked?(blocked: boolean): void;
  setReviewSessionsMaintenanceBlocked?(blocked: boolean): void;
}

export function useMaintenanceCoordinator({
  flushEntries,
  flushSettings,
  flushGeneratedExams,
  flushLibraryFolders = async () => undefined,
  flushGptSolutionDrafts = async () => undefined,
  flushReviewSessions = async () => undefined,
  flushPendingDeletions = async () => undefined,
  flushKnowledgeGraph = async () => undefined,
  flushActiveExam = async () => undefined,
  flushTransientWrites = async () => undefined,
  setTransientWritesMaintenanceBlocked = () => undefined,
  setEntriesMaintenanceBlocked,
  setSettingsMaintenanceBlocked,
  setGeneratedExamsMaintenanceBlocked,
  setLibraryMaintenanceBlocked = () => undefined,
  setGptSolutionDraftsMaintenanceBlocked = () => undefined,
  setKnowledgeGraphMaintenanceBlocked = () => undefined,
  setReviewSessionsMaintenanceBlocked = () => undefined,
}: MaintenanceCoordinatorOptions) {
  const activeRef = useRef(false);

  return useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    if (activeRef.current) throw new Error("백업, 복원 또는 업데이트 준비 작업이 이미 진행 중입니다.");
    activeRef.current = true;
    setTransientWritesMaintenanceBlocked(true);
    try {
      await flushTransientWrites();
    } catch (error) {
      setTransientWritesMaintenanceBlocked(false);
      activeRef.current = false;
      throw error;
    }
    setEntriesMaintenanceBlocked(true);
    setSettingsMaintenanceBlocked(true);
    setGeneratedExamsMaintenanceBlocked(true);
    setLibraryMaintenanceBlocked(true);
    setGptSolutionDraftsMaintenanceBlocked(true);
    setKnowledgeGraphMaintenanceBlocked(true);
    setReviewSessionsMaintenanceBlocked(true);
    try {
      await Promise.all([
        flushEntries(),
        flushSettings(),
        flushGeneratedExams(),
        flushLibraryFolders(),
        flushGptSolutionDrafts(),
        flushReviewSessions(),
        flushPendingDeletions(),
        flushKnowledgeGraph(),
        flushActiveExam(),
      ]);
      return await task();
    } finally {
      setEntriesMaintenanceBlocked(false);
      setSettingsMaintenanceBlocked(false);
      setGeneratedExamsMaintenanceBlocked(false);
      setLibraryMaintenanceBlocked(false);
      setGptSolutionDraftsMaintenanceBlocked(false);
      setKnowledgeGraphMaintenanceBlocked(false);
      setReviewSessionsMaintenanceBlocked(false);
      setTransientWritesMaintenanceBlocked(false);
      activeRef.current = false;
    }
  }, [flushActiveExam, flushEntries, flushGeneratedExams, flushGptSolutionDrafts, flushKnowledgeGraph, flushLibraryFolders, flushPendingDeletions, flushReviewSessions, flushSettings, flushTransientWrites, setEntriesMaintenanceBlocked, setGeneratedExamsMaintenanceBlocked, setGptSolutionDraftsMaintenanceBlocked, setKnowledgeGraphMaintenanceBlocked, setLibraryMaintenanceBlocked, setReviewSessionsMaintenanceBlocked, setSettingsMaintenanceBlocked, setTransientWritesMaintenanceBlocked]);
}
