import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { deleteImage, errorMessage, loadEntries, saveEntries } from "../api";
import type { EntryFormData, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "../utils/entry";

type Mutation<T> = (current: WrongAnswerEntry[]) => { next: WrongAnswerEntry[]; value: T };
export type EntryPatch = Partial<WrongAnswerEntry> | ((entry: WrongAnswerEntry) => Partial<WrongAnswerEntry>);

export function useEntries() {
  const [entries, setEntries] = useState<WrongAnswerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entriesRef = useRef<WrongAnswerEntry[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const clearError = useCallback(() => setError(null), []);

  const enqueueMutation = useCallback(<T,>(mutation: Mutation<T>): Promise<T> => {
    const task = saveQueueRef.current.then(async () => {
      const { next, value } = mutation(entriesRef.current);
      await saveEntries(next);
      entriesRef.current = next;
      setEntries(next);
      return value;
    });
    saveQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await saveQueueRef.current;
      const data = await loadEntries();
      entriesRef.current = data;
      setEntries(data);
    } catch (err) {
      setError(errorMessage(err, "노트를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    async (nextEntries: WrongAnswerEntry[]) => {
      await enqueueMutation(() => ({ next: nextEntries, value: undefined }));
    },
    [enqueueMutation],
  );

  const replaceEntries = useCallback(
    async (nextEntries: WrongAnswerEntry[]) => {
      try {
        setError(null);
        await persist(nextEntries);
      } catch (err) {
        const message = errorMessage(err, "노트를 복원하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [persist],
  );

  const deleteImagesBestEffort = useCallback(async (images: string[]) => {
    const unique = [...new Set(images)];
    const failed: string[] = [];

    for (const img of unique) {
      try {
        await deleteImage(img);
      } catch {
        failed.push(img);
      }
    }

    if (failed.length > 0) {
      setError(
        `항목은 저장됐지만 일부 이미지 정리에 실패했습니다. (${failed.length}개)`,
      );
    }
  }, []);

  const addEntry = useCallback(
    async (form: EntryFormData) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const entry: WrongAnswerEntry = {
          id: uuidv4(),
          ...form,
          createdAt: now,
          updatedAt: now,
        };
        await enqueueMutation((current) => ({ next: [entry, ...current], value: entry.id }));
        return entry.id;
      } catch (err) {
        const message = errorMessage(err, "항목을 추가하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [enqueueMutation],
  );

  const addEntries = useCallback(
    async (forms: EntryFormData[]) => {
      if (!forms.length) return [];
      try {
        setError(null);
        const now = new Date().toISOString();
        const added = forms.map((form) => ({
          id: uuidv4(),
          ...form,
          createdAt: now,
          updatedAt: now,
        } satisfies WrongAnswerEntry));
        return await enqueueMutation((current) => ({
          next: [...added, ...current],
          value: added.map((entry) => entry.id),
        }));
      } catch (err) {
        const message = errorMessage(err, "여러 항목을 추가하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [enqueueMutation],
  );

  const updateEntry = useCallback(
    async (id: string, form: EntryFormData, removedImages: string[]) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        await enqueueMutation((current) => ({
          next: current.map((entry) =>
            entry.id === id ? { ...entry, ...form, updatedAt: now } : entry,
          ),
          value: undefined,
        }));
        await deleteImagesBestEffort(removedImages);
      } catch (err) {
        const message = errorMessage(err, "항목을 수정하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [deleteImagesBestEffort, enqueueMutation],
  );

  const patchEntry = useCallback(
    async (id: string, partial: EntryPatch) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        await enqueueMutation((current) => ({
          next: current.map((entry) => {
            if (entry.id !== id) return entry;
            const patch = typeof partial === "function" ? partial(entry) : partial;
            return { ...entry, ...patch, updatedAt: now };
          }),
          value: undefined,
        }));
      } catch (err) {
        const message = errorMessage(err, "항목을 저장하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [enqueueMutation],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const images = await enqueueMutation((current) => {
          const entry = current.find((item) => item.id === id);
          return {
            next: current.filter((item) => item.id !== id),
            value: entry ? getAllImageFilenames(entry) : [],
          };
        });
        await deleteImagesBestEffort(images);
      } catch (err) {
        const message = errorMessage(err, "항목을 삭제하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [deleteImagesBestEffort, enqueueMutation],
  );

  const toggleMastered = useCallback(
    async (id: string) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        await enqueueMutation((current) => ({
          next: current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  mastered: !entry.mastered,
                  review: entry.mastered
                    ? { ...(entry.review ?? { dueAt: now, intervalDays: 0, streak: 0, history: [] }), phase: "learning", dueAt: now }
                    : { ...(entry.review ?? { dueAt: null, intervalDays: 0, streak: 0, history: [] }), phase: "archived", dueAt: null },
                  updatedAt: now,
                }
              : entry,
          ),
          value: undefined,
        }));
      } catch (err) {
        setError(errorMessage(err, "복습 상태를 저장하지 못했습니다."));
      }
    },
    [enqueueMutation],
  );

  const toggleDifficult = useCallback(
    async (id: string) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        await enqueueMutation((current) => ({
          next: current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  difficult: !entry.difficult,
                  difficulty: entry.difficult ? "none" as const : "high" as const,
                  updatedAt: now,
                }
              : entry,
          ),
          value: undefined,
        }));
      } catch (err) {
        setError(errorMessage(err, "난이도 상태를 저장하지 못했습니다."));
      }
    },
    [enqueueMutation],
  );

  return {
    entries,
    loading,
    error,
    clearError,
    addEntry,
    addEntries,
    updateEntry,
    replaceEntries,
    patchEntry,
    deleteEntry,
    toggleMastered,
    toggleDifficult,
    refresh,
  };
}
