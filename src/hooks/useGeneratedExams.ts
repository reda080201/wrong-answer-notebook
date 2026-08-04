import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, loadGeneratedExams, saveGeneratedExams } from "../api";
import type { GeneratedExam } from "../types";
import { mergeGeneratedExam } from "../features/exam-builder/storage/generatedExamStorage";
import { useSerialTaskQueue } from "./useSerialTaskQueue";

export function useGeneratedExams() {
  const [exams, setExams] = useState<GeneratedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const examsRef = useRef<GeneratedExam[]>([]);
  const persistedRef = useRef<GeneratedExam[]>([]);
  const failedTargetRef = useRef<GeneratedExam[] | null>(null);
  const failedErrorRef = useRef<Error | null>(null);
  const mutationRef = useRef(0);
  const loadRequestRef = useRef(0);
  const loadSucceededRef = useRef(false);
  const savingCountRef = useRef(0);
  const [hasRetryableChange, setHasRetryableChange] = useState(false);
  const { enqueue: enqueueTask, drain } = useSerialTaskQueue();

  const reload = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const loadMutation = mutationRef.current;
    loadSucceededRef.current = false;
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await loadGeneratedExams();
      if (requestId !== loadRequestRef.current) return;
      if (loadMutation !== mutationRef.current) {
        loadSucceededRef.current = true;
        return;
      }
      const next = Array.isArray(loaded) ? loaded : [];
      examsRef.current = next;
      persistedRef.current = next;
      loadSucceededRef.current = true;
      setExams(next);
      setError(null);
    } catch (cause) {
      if (requestId === loadRequestRef.current) {
        if (loadMutation !== mutationRef.current) {
          loadSucceededRef.current = true;
          return;
        }
        const message = errorMessage(cause, "생성 모의고사를 불러오지 못했습니다.");
        setLoadError(message);
        setError(message);
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enqueue = useCallback((next: GeneratedExam[], retrying = false) => {
    if (!loadSucceededRef.current) {
      return Promise.reject(new Error(loadError ?? "생성 모의고사를 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    if (!retrying) {
      failedTargetRef.current = null;
      failedErrorRef.current = null;
      setHasRetryableChange(false);
    }
    examsRef.current = next;
    setExams(next);
    setError(null);
    const mutation = ++mutationRef.current;
    savingCountRef.current += 1;
    setSaving(true);
    const operation = enqueueTask(() => saveGeneratedExams(next))
      .then(() => {
        persistedRef.current = next;
        if (retrying && mutation === mutationRef.current) {
          failedTargetRef.current = null;
          failedErrorRef.current = null;
          setHasRetryableChange(false);
        }
        if (mutation === mutationRef.current) setError(null);
      })
      .catch((cause) => {
        const message = errorMessage(cause, "생성 모의고사를 저장하지 못했습니다.");
        if (mutation === mutationRef.current) {
          failedTargetRef.current = next;
          failedErrorRef.current = new Error(message, { cause });
          setHasRetryableChange(true);
          examsRef.current = persistedRef.current;
          setExams(persistedRef.current);
          setError(message);
        }
        throw new Error(message, { cause });
      })
      .finally(() => {
        savingCountRef.current -= 1;
        if (savingCountRef.current === 0) setSaving(false);
      });
    return operation;
  }, [enqueueTask, loadError]);

  const upsert = useCallback((exam: GeneratedExam) => enqueue(mergeGeneratedExam(examsRef.current, exam)), [enqueue]);
  const remove = useCallback((id: string) => enqueue(examsRef.current.filter((exam) => exam.id !== id)), [enqueue]);
  const retry = useCallback(() => {
    const failedTarget = failedTargetRef.current;
    return failedTarget ? enqueue(failedTarget, true) : Promise.resolve();
  }, [enqueue]);
  const discardFailedChange = useCallback(() => {
    failedTargetRef.current = null;
    failedErrorRef.current = null;
    setHasRetryableChange(false);
    setError(null);
  }, []);
  const flush = useCallback(async () => {
    await drain();
    if (failedErrorRef.current) throw failedErrorRef.current;
  }, [drain]);

  return { exams, loading, loadError, saving, error, hasRetryableChange, upsert, remove, retry, discardFailedChange, flush, reload, clearError: () => setError(null) };
}
