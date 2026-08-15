import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ExamSession } from "../types";
import { flushPendingAppWrites } from "../services/flushAppWrites";

interface UseWindowCloseGuardOptions {
  activeExam: ExamSession | null;
  examSaveTimerRef: MutableRefObject<number | null>;
  flushExamSession: (session: ExamSession) => Promise<boolean>;
  flushEntries: () => Promise<void>;
  flushGeneratedExams: () => Promise<void>;
  flushSettings: () => Promise<void>;
  flushImportWorkspaceDraft: () => Promise<void>;
  flushLibraryFolders: () => Promise<void>;
  flushGptSolutionDrafts?: () => Promise<void>;
  flushStudySessions?: () => Promise<void>;
  confirmCloseWithoutSaving: () => Promise<boolean>;
}

function getCloseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function useWindowCloseGuard({
  activeExam,
  examSaveTimerRef,
  flushExamSession,
  flushEntries,
  flushGeneratedExams,
  flushSettings,
  flushImportWorkspaceDraft,
  flushLibraryFolders,
  flushGptSolutionDrafts = async () => undefined,
  flushStudySessions = async () => undefined,
  confirmCloseWithoutSaving,
}: UseWindowCloseGuardOptions) {
  const [closeError, setCloseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeExamRef = useRef(activeExam);
  const allowCloseRef = useRef(false);
  const inFlightRef = useRef(false);
  const retryRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    activeExamRef.current = activeExam;
  }, [activeExam]);

  const attemptClose = useCallback(async () => {
    if (inFlightRef.current || !isTauri()) return;
    inFlightRef.current = true;
    setSaving(true);
    try {
      if (examSaveTimerRef.current !== null) {
        window.clearTimeout(examSaveTimerRef.current);
        examSaveTimerRef.current = null;
      }
      await flushPendingAppWrites({
        activeExam: activeExamRef.current,
        flushExamSession,
        flushEntries,
        flushGeneratedExams,
        flushSettings,
        flushImportWorkspaceDraft,
        flushLibraryFolders,
        flushGptSolutionDrafts,
        flushStudySessions,
      });
      setCloseError(null);
      allowCloseRef.current = true;
      await getCurrentWindow().close();
    } catch (error) {
      allowCloseRef.current = false;
      setCloseError(getCloseErrorMessage(error, "저장 중 오류가 발생했습니다."));
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }, [examSaveTimerRef, flushEntries, flushExamSession, flushGeneratedExams, flushGptSolutionDrafts, flushImportWorkspaceDraft, flushLibraryFolders, flushSettings, flushStudySessions]);

  const closeWithoutSaving = useCallback(async () => {
    if (inFlightRef.current || !closeError || !isTauri()) return;
    inFlightRef.current = true;
    setSaving(true);
    try {
      const confirmed = await confirmCloseWithoutSaving();
      if (!confirmed) return;
      allowCloseRef.current = true;
      await getCurrentWindow().destroy();
    } catch (error) {
      allowCloseRef.current = false;
      setCloseError(getCloseErrorMessage(error, "창을 종료하지 못했습니다."));
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }, [closeError, confirmCloseWithoutSaving]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (allowCloseRef.current) return;
      event.preventDefault();
      await attemptClose();
    }).then((cleanup) => { unlisten = cleanup; });
    retryRef.current = attemptClose;
    return () => {
      retryRef.current = null;
      unlisten?.();
    };
  }, [attemptClose]);

  return {
    closeError,
    saving,
    clearCloseError: () => setCloseError(null),
    retryClose: retryRef,
    closeWithoutSaving,
  };
}
