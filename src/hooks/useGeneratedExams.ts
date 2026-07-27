import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, loadGeneratedExams, saveGeneratedExams } from "../api";
import type { GeneratedExam } from "../types";
import { mergeGeneratedExam } from "../features/exam-builder/storage/generatedExamStorage";

export function useGeneratedExams() {
  const [exams, setExams] = useState<GeneratedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const examsRef = useRef<GeneratedExam[]>([]);
  const persistedRef = useRef<GeneratedExam[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastOperationRef = useRef<Promise<void>>(Promise.resolve());
  const failedTargetRef = useRef<GeneratedExam[] | null>(null);
  const mutationRef = useRef(0);
  const savingCountRef = useRef(0);
  const [hasRetryableChange, setHasRetryableChange] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadGeneratedExams()
      .then((loaded) => {
        if (cancelled) return;
        const next = Array.isArray(loaded) ? loaded : [];
        examsRef.current = next;
        persistedRef.current = next;
        setExams(next);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause, "생성 모의고사를 불러오지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const enqueue = useCallback((next: GeneratedExam[], retrying = false) => {
    if (!retrying) {
      failedTargetRef.current = null;
      setHasRetryableChange(false);
    }
    examsRef.current = next;
    setExams(next);
    setError(null);
    const mutation = ++mutationRef.current;
    savingCountRef.current += 1;
    setSaving(true);
    const operation = saveQueueRef.current
      .then(() => saveGeneratedExams(next))
      .then(() => {
        persistedRef.current = next;
        if (retrying && mutation === mutationRef.current) {
          failedTargetRef.current = null;
          setHasRetryableChange(false);
        }
      })
      .catch((cause) => {
        const message = errorMessage(cause, "생성 모의고사를 저장하지 못했습니다.");
        if (mutation === mutationRef.current) {
          failedTargetRef.current = next;
          setHasRetryableChange(true);
          examsRef.current = persistedRef.current;
          setExams(persistedRef.current);
        }
        setError(message);
        throw new Error(message, { cause });
      })
      .finally(() => {
        savingCountRef.current -= 1;
        if (savingCountRef.current === 0) setSaving(false);
      });
    lastOperationRef.current = operation;
    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const upsert = useCallback((exam: GeneratedExam) => enqueue(mergeGeneratedExam(examsRef.current, exam)), [enqueue]);
  const remove = useCallback((id: string) => enqueue(examsRef.current.filter((exam) => exam.id !== id)), [enqueue]);
  const retry = useCallback(() => {
    const failedTarget = failedTargetRef.current;
    return failedTarget ? enqueue(failedTarget, true) : Promise.resolve();
  }, [enqueue]);
  const discardFailedChange = useCallback(() => {
    failedTargetRef.current = null;
    setHasRetryableChange(false);
    setError(null);
  }, []);
  const flush = useCallback(() => lastOperationRef.current, []);

  return { exams, loading, saving, error, hasRetryableChange, upsert, remove, retry, discardFailedChange, flush, clearError: () => setError(null) };
}
