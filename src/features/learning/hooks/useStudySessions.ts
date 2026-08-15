import { useCallback, useEffect, useRef, useState } from "react";
import { loadStudySessions, saveStudySessions } from "../../../services/api/studySessions";
import type { StudySession } from "../../../types";

export function useStudySessions() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionsRef = useRef(sessions);
  const queueRef = useRef(Promise.resolve());
  const maintenanceBlockedRef = useRef(false);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const reload = useCallback(async () => {
    try { const next = await loadStudySessions(); sessionsRef.current = next; setSessions(next); setError(null); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "학습 세션을 불러오지 못했습니다."); return false; }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const persist = useCallback((recipe: (current: StudySession[]) => StudySession[]) => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다."));
    }
    const operation = queueRef.current.then(async () => {
      const next = recipe(sessionsRef.current);
      await saveStudySessions(next);
      sessionsRef.current = next;
      setSessions(next);
      setError(null);
    });
    queueRef.current = operation.catch(() => undefined);
    return operation.catch((cause) => { setError(cause instanceof Error ? cause.message : "학습 세션을 저장하지 못했습니다."); throw cause; });
  }, []);
  const flush = useCallback(async () => { await queueRef.current; }, []);
  const setMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);
  return { sessions, error, reload, persist, flush, setMaintenanceBlocked };
}
