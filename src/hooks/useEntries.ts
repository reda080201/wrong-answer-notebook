import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { deleteImage, errorMessage, loadEntries, saveEntries } from "../api";
import type { EntryFormData, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "../utils/entry";

export function useEntries() {
  const [entries, setEntries] = useState<WrongAnswerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadEntries();
      setEntries(data);
    } catch (err) {
      setError(errorMessage(err, "노트를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next: WrongAnswerEntry[]) => {
    await saveEntries(next);
    setEntries(next);
  }, []);

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
        const next = [entry, ...entries];
        await persist(next);
        return entry.id;
      } catch (err) {
        const message = errorMessage(err, "항목을 추가하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [entries, persist],
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
        await persist([...added, ...entries]);
        return added.map((entry) => entry.id);
      } catch (err) {
        const message = errorMessage(err, "여러 항목을 추가하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [entries, persist],
  );

  const updateEntry = useCallback(
    async (id: string, form: EntryFormData, removedImages: string[]) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const next = entries.map((e) =>
          e.id === id ? { ...e, ...form, updatedAt: now } : e,
        );
        await persist(next);
        await deleteImagesBestEffort(removedImages);
      } catch (err) {
        const message = errorMessage(err, "항목을 수정하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [deleteImagesBestEffort, entries, persist],
  );

  const patchEntry = useCallback(
    async (id: string, partial: Partial<WrongAnswerEntry>) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const next = entries.map((e) =>
          e.id === id ? { ...e, ...partial, updatedAt: now } : e,
        );
        await persist(next);
      } catch (err) {
        const message = errorMessage(err, "항목을 저장하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [entries, persist],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      setError(null);
      const entry = entries.find((e) => e.id === id);
      const images = entry ? getAllImageFilenames(entry) : [];

      try {
        await persist(entries.filter((e) => e.id !== id));
        await deleteImagesBestEffort(images);
      } catch (err) {
        const message = errorMessage(err, "항목을 삭제하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [deleteImagesBestEffort, entries, persist],
  );

  const toggleMastered = useCallback(
    async (id: string) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const next = entries.map((e) =>
          e.id === id
            ? { ...e, mastered: !e.mastered, updatedAt: now }
            : e,
        );
        await persist(next);
      } catch (err) {
        const message = errorMessage(err, "복습 상태를 저장하지 못했습니다.");
        setError(message);
      }
    },
    [entries, persist],
  );

  const toggleDifficult = useCallback(
    async (id: string) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const next = entries.map((e) =>
          e.id === id
            ? {
                ...e,
                difficult: !e.difficult,
                difficulty: e.difficult ? "none" as const : "high" as const,
                updatedAt: now,
              }
            : e,
        );
        await persist(next);
      } catch (err) {
        const message = errorMessage(err, "난이도 상태를 저장하지 못했습니다.");
        setError(message);
      }
    },
    [entries, persist],
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
