import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ExamSession, GeneratedExam, WrongAnswerEntry } from "../types";
import { setSavedRealExamProtection } from "../features/exam/services/realExamProtection";

interface Options {
  sessions: ExamSession[];
  sessionLoading: boolean;
  sessionLoadError: string | null;
  entries: WrongAnswerEntry[];
  exams: GeneratedExam[];
  generatedLoading: boolean;
  generatedLoadError: string | null;
  reloadSessions(): Promise<boolean>;
  reloadGenerated(): Promise<boolean>;
  runMaintenanceOperation<T>(task: () => Promise<T>): Promise<T>;
}

/** Keep both provenance stores behind the same protection and recovery boundary. */
export function useSavedRealExamProtection({
  sessions, sessionLoading, sessionLoadError, entries, exams,
  generatedLoading, generatedLoadError, reloadSessions, reloadGenerated, runMaintenanceOperation,
}: Options) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryLock = useRef(false);
  const mounted = useRef(false);
  const loading = sessionLoading || generatedLoading;
  const cannotRead = loading || Boolean(sessionLoadError || generatedLoadError || retryError) || retrying;

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; setSavedRealExamProtection([]); };
  }, []);
  useLayoutEffect(() => {
    setSavedRealExamProtection(sessions, cannotRead, entries, exams);
  }, [sessions, cannotRead, entries, exams]);

  const retry = useCallback(async (): Promise<boolean> => {
    if (retryLock.current || loading) return false;
    retryLock.current = true;
    setRetrying(true);
    setRetryError(null);
    // Block synchronously, including requests already waiting to send.
    setSavedRealExamProtection(sessions, true, entries, exams);
    try {
      await runMaintenanceOperation(async () => {
        const results = await Promise.allSettled([reloadSessions, reloadGenerated].map(reload => Promise.resolve().then(reload)));
        if (results.some(result => result.status === "rejected" || !result.value)) {
          throw new Error("시험 기록과 원본 출처를 모두 불러오지 못했습니다. 다시 불러오기를 시도해 주세요.");
        }
      });
      return true;
    } catch (cause) {
      if (mounted.current) setRetryError(cause instanceof Error ? cause.message : "시험 기록과 원본 출처를 불러오지 못했습니다.");
      return false;
    } finally {
      retryLock.current = false;
      if (mounted.current) setRetrying(false);
    }
  }, [loading, sessions, entries, exams, runMaintenanceOperation, reloadSessions, reloadGenerated]);

  return { retry, retrying, retryError, loading };
}
