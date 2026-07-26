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
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadGeneratedExams()
      .then((loaded) => {
        if (cancelled) return;
        const next = Array.isArray(loaded) ? loaded : [];
        examsRef.current = next;
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

  const enqueue = useCallback((next: GeneratedExam[]) => {
    examsRef.current = next;
    setExams(next);
    setError(null);
    setSaving(true);
    const operation = saveQueueRef.current
      .then(() => saveGeneratedExams(next))
      .catch((cause) => {
        const message = errorMessage(cause, "생성 모의고사를 저장하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause });
      })
      .finally(() => setSaving(false));
    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const upsert = useCallback((exam: GeneratedExam) => enqueue(mergeGeneratedExam(examsRef.current, exam)), [enqueue]);
  const remove = useCallback((id: string) => enqueue(examsRef.current.filter((exam) => exam.id !== id)), [enqueue]);
  const flush = useCallback(() => saveQueueRef.current, []);

  return { exams, loading, saving, error, upsert, remove, flush, clearError: () => setError(null) };
}
