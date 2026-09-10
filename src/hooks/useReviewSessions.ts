import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession } from "../types";
import { getStorageBackend } from "../services/storageBackend";
import { mergeReviewSession, normalizeReviewSession } from "../features/review/storage/reviewSessionStorage";

export type ReviewSessionLoadStatus = "loading" | "ready" | "error";

export function useReviewSessions() {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [ready, setReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState<ReviewSessionLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const sessionsRef = useRef<ReviewSession[]>([]);
  const queueRef = useRef(Promise.resolve());
  const loadedRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const refresh = useCallback(async () => {
    const loader = getStorageBackend().loadReviewSessions;
    loadedRef.current = false;
    setLoadStatus("loading");
    if (!loader) {
      const message = "현재 저장소는 복습 세션을 지원하지 않습니다.";
      setError(message);
      setLoadStatus("error");
      setReady(false);
      return false;
    }
    try {
      await queueRef.current;
      const next = (await loader()).map(normalizeReviewSession);
      sessionsRef.current = next;
      setSessions(next);
      setError(null);
      loadedRef.current = true;
      setLoadStatus("ready");
      setReady(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "복습 세션을 불러오지 못했습니다.");
      loadedRef.current = false;
      setLoadStatus("error");
      setReady(false);
      return false;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (session: ReviewSession) => {
    if (maintenanceBlockedRef.current) throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
    if (!loadedRef.current) throw new Error(error ?? "복습 세션을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
    const writer = getStorageBackend().saveReviewSessions;
    if (!writer) throw new Error("현재 저장소는 복습 세션을 지원하지 않습니다.");
    const operation = async () => {
      const next = mergeReviewSession(sessionsRef.current, session);
      try {
        await writer(next);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "복습 세션을 저장하지 못했습니다.";
        setError(message);
        throw new Error(message, { cause });
      }
      sessionsRef.current = next;
      setSessions(next);
      setError(null);
    };
    const task = queueRef.current.then(operation, operation);
    queueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [error]);

  const remove = useCallback(async (id: string) => {
    if (maintenanceBlockedRef.current) throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
    if (!loadedRef.current) throw new Error(error ?? "복습 세션을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
    const writer = getStorageBackend().saveReviewSessions;
    if (!writer) throw new Error("현재 저장소는 복습 세션을 지원하지 않습니다.");
    const operation = async () => {
      const next = sessionsRef.current.filter((session) => session.id !== id);
      try {
        await writer(next);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "복습 세션을 저장하지 못했습니다.";
        setError(message);
        throw new Error(message, { cause });
      }
      sessionsRef.current = next;
      setSessions(next);
    };
    const task = queueRef.current.then(operation, operation);
    queueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [error]);

  const flush = useCallback(async () => queueRef.current, []);
  const setMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);
  return { sessions, ready, loadStatus, error, refresh, save, remove, flush, setMaintenanceBlocked };
}
