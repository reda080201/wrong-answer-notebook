import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession } from "../types";
import { getStorageBackend } from "../services/storageBackend";
import { mergeReviewSession, normalizeReviewSession } from "../features/review/storage/reviewSessionStorage";

export function useReviewSessions() {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionsRef = useRef<ReviewSession[]>([]);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const refresh = useCallback(async () => {
    const loader = getStorageBackend().loadReviewSessions;
    if (!loader) {
      setReady(true);
      return false;
    }
    try {
      const next = (await loader()).map(normalizeReviewSession);
      sessionsRef.current = next;
      setSessions(next);
      setError(null);
      setReady(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "복습 세션을 불러오지 못했습니다.");
      setReady(true);
      return false;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (session: ReviewSession) => {
    const writer = getStorageBackend().saveReviewSessions;
    if (!writer) throw new Error("현재 저장소는 복습 세션을 지원하지 않습니다.");
    const operation = async () => {
      const next = mergeReviewSession(sessionsRef.current, session);
      await writer(next);
      sessionsRef.current = next;
      setSessions(next);
      setError(null);
    };
    queueRef.current = queueRef.current.then(operation, operation);
    return queueRef.current;
  }, []);

  const remove = useCallback(async (id: string) => {
    const writer = getStorageBackend().saveReviewSessions;
    if (!writer) throw new Error("현재 저장소는 복습 세션을 지원하지 않습니다.");
    const operation = async () => {
      const next = sessionsRef.current.filter((session) => session.id !== id);
      await writer(next);
      sessionsRef.current = next;
      setSessions(next);
    };
    queueRef.current = queueRef.current.then(operation, operation);
    return queueRef.current;
  }, []);

  const flush = useCallback(async () => queueRef.current, []);
  return { sessions, ready, error, refresh, save, remove, flush };
}
