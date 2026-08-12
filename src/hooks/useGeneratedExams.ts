import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, loadGeneratedExams, saveGeneratedExams } from "../api";
import type { GeneratedExam } from "../types";
import { mergeGeneratedExam } from "../features/exam-builder/storage/generatedExamStorage";
import { useSerialTaskQueue } from "./useSerialTaskQueue";

type ExamRecipe = (current: GeneratedExam[]) => GeneratedExam[];

export function useGeneratedExams() {
  const [exams, setExams] = useState<GeneratedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const persistedRef = useRef<GeneratedExam[]>([]);
  const pendingRecipesRef = useRef(new Map<number, ExamRecipe>());
  const failedRecipeRef = useRef<ExamRecipe | null>(null);
  const failedErrorRef = useRef<Error | null>(null);
  const mutationRef = useRef(0);
  const loadRequestRef = useRef(0);
  const loadingRef = useRef(false);
  const loadSucceededRef = useRef(false);
  const savingCountRef = useRef(0);
  const maintenanceBlockedRef = useRef(false);
  const [hasRetryableChange, setHasRetryableChange] = useState(false);
  const { enqueue: enqueueTask, drain } = useSerialTaskQueue();

  const visibleFromPersisted = useCallback(() => {
    let next = persistedRef.current;
    for (const recipe of pendingRecipesRef.current.values()) next = recipe(next);
    return next;
  }, []);

  const refreshVisible = useCallback(() => {
    setExams(visibleFromPersisted());
  }, [visibleFromPersisted]);

  const reload = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      await drain();
      const mutationAtLoad = mutationRef.current;
      loadSucceededRef.current = false;
      const loaded = await loadGeneratedExams();
      if (requestId !== loadRequestRef.current || mutationAtLoad !== mutationRef.current) return false;
      if (!Array.isArray(loaded)) throw new Error("생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.");
      persistedRef.current = loaded;
      loadSucceededRef.current = true;
      refreshVisible();
      setError(null);
      return true;
    } catch (cause) {
      if (requestId === loadRequestRef.current) {
        const message = errorMessage(cause, "생성 모의고사를 불러오지 못했습니다.");
        loadSucceededRef.current = false;
        setLoadError(message);
        setError(message);
      }
      return false;
    } finally {
      if (requestId === loadRequestRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [drain, refreshVisible]);

  useEffect(() => { void reload(); }, [reload]);

  const enqueue = useCallback((recipe: ExamRecipe, retrying = false): Promise<void> => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (!loadSucceededRef.current || loadingRef.current) {
      return Promise.reject(new Error(loadError ?? "생성 모의고사를 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    const mutation = ++mutationRef.current;
    pendingRecipesRef.current.set(mutation, recipe);
    refreshVisible();
    setError(null);
    savingCountRef.current += 1;
    setSaving(true);

    return enqueueTask(async () => {
      const next = recipe(persistedRef.current);
      await saveGeneratedExams(next);
      return next;
    }).then((next) => {
      persistedRef.current = next;
      pendingRecipesRef.current.delete(mutation);
      if (retrying) {
        failedRecipeRef.current = null;
        failedErrorRef.current = null;
        setHasRetryableChange(false);
      }
      if (mutation === mutationRef.current) setError(null);
      refreshVisible();
    }).catch((cause) => {
      pendingRecipesRef.current.delete(mutation);
      const message = errorMessage(cause, "생성 모의고사를 저장하지 못했습니다.");
      failedRecipeRef.current = recipe;
      failedErrorRef.current = new Error(message, { cause });
      setHasRetryableChange(true);
      if (mutation === mutationRef.current) {
        setError(message);
      }
      refreshVisible();
      throw new Error(message, { cause });
    }).finally(() => {
      savingCountRef.current -= 1;
      if (savingCountRef.current === 0) setSaving(false);
    });
  }, [enqueueTask, loadError, refreshVisible]);

  const upsert = useCallback((exam: GeneratedExam) => enqueue((current) => mergeGeneratedExam(current, exam)), [enqueue]);
  const remove = useCallback((id: string) => enqueue((current) => current.filter((exam) => exam.id !== id)), [enqueue]);
  const retry = useCallback(() => {
    const recipe = failedRecipeRef.current;
    return recipe ? enqueue(recipe, true) : Promise.resolve();
  }, [enqueue]);
  const discardFailedChange = useCallback(() => {
    failedRecipeRef.current = null;
    failedErrorRef.current = null;
    setHasRetryableChange(false);
    setError(null);
    refreshVisible();
  }, [refreshVisible]);
  const flush = useCallback(async () => {
    await drain();
    if (failedErrorRef.current) throw failedErrorRef.current;
  }, [drain]);
  const setGeneratedExamsMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);

  return { exams, loading, loadError, saving, error, hasRetryableChange, upsert, remove, retry, discardFailedChange, flush, reload, setGeneratedExamsMaintenanceBlocked, clearError: () => setError(null) };
}
