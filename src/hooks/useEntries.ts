import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  commitImportAssetSessionEntries,
  commitImportAssetSessionEntry,
  deleteImage,
  errorMessage,
  loadEntries,
  saveEntries,
} from "../api";
import type { EntryFormData, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "../utils/entry";
import { useSerialTaskQueue } from "./useSerialTaskQueue";

type Mutation<T> = (current: WrongAnswerEntry[]) => { next: WrongAnswerEntry[]; value: T };
export type EntryPatch = Partial<WrongAnswerEntry> | ((entry: WrongAnswerEntry) => Partial<WrongAnswerEntry>);

function getUnreferencedImages(candidates: string[], entries: WrongAnswerEntry[]): string[] {
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  return [...new Set(candidates)].filter((image) => !referenced.has(image));
}

export function useEntries() {
  const [entries, setEntries] = useState<WrongAnswerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entriesRef = useRef<WrongAnswerEntry[]>([]);
  const lastOperationRef = useRef<Promise<unknown>>(Promise.resolve());
  const mutationRevisionRef = useRef(0);
  const loadedRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);
  const { enqueue, drain } = useSerialTaskQueue();

  const clearError = useCallback(() => setError(null), []);

  const enqueueMutation = useCallback(<T,>(mutation: Mutation<T>): Promise<T> => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (!loadedRef.current) {
      return Promise.reject(new Error("노트를 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    mutationRevisionRef.current += 1;
    const task = enqueue(async () => {
      const { next, value } = mutation(entriesRef.current);
      await saveEntries(next);
      entriesRef.current = next;
      setEntries(next);
      return value;
    });
    lastOperationRef.current = task;
    return task;
  }, [enqueue]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    loadedRef.current = false;
    const refreshRevision = mutationRevisionRef.current;
    try {
      await drain();
      const data = await loadEntries();
      if (refreshRevision !== mutationRevisionRef.current) {
        loadedRef.current = true;
        return;
      }
      entriesRef.current = data;
      setEntries(data);
      loadedRef.current = true;
    } catch (err) {
      loadedRef.current = false;
      if (refreshRevision === mutationRevisionRef.current) {
        setError(errorMessage(err, "노트를 불러오지 못했습니다."));
      }
    } finally {
      setLoading(false);
    }
  }, [drain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flushEntries = useCallback(async () => {
    await lastOperationRef.current;
  }, []);

  const setEntriesMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);

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

  const addEntriesWithImportAssetSession = useCallback(
    async (sessionId: string, forms: EntryFormData[]) => {
      if (!forms.length) return [];
      if (maintenanceBlockedRef.current) {
        throw new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요.");
      }
      if (!loadedRef.current) {
        throw new Error("노트를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      }
      try {
        setError(null);
        const now = new Date().toISOString();
        const added = forms.map((form) => ({
          id: uuidv4(),
          ...form,
          createdAt: now,
          updatedAt: now,
        } satisfies WrongAnswerEntry));
        const task = enqueue(async () => {
          await commitImportAssetSessionEntries(sessionId, added);
          const next = [...added, ...entriesRef.current];
          entriesRef.current = next;
          setEntries(next);
          return added.map((entry) => entry.id);
        });
        lastOperationRef.current = task;
        return await task;
      } catch (err) {
        const message = errorMessage(err, "가져온 항목을 저장하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [enqueue],
  );

  const updateEntry = useCallback(
    async (id: string, form: EntryFormData, removedImages: string[]) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const unreferenced = await enqueueMutation((current) => {
          const next = current.map((entry) =>
            entry.id === id ? { ...entry, ...form, updatedAt: now } : entry,
          );
          return {
            next,
            value: getUnreferencedImages(removedImages, next),
          };
        });
        await deleteImagesBestEffort(unreferenced);
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

  const patchEntryWithImportAssetSession = useCallback(
    async (
      id: string,
      expectedUpdatedAt: string,
      sessionId: string,
      partial: EntryPatch,
    ) => {
      try {
        setError(null);
        const now = new Date().toISOString();
        const task = enqueue(async () => {
          const current = entriesRef.current;
          const existing = current.find((entry) => entry.id === id);
          if (!existing) throw new Error("대상 문제지를 찾을 수 없습니다.");
          if (existing.updatedAt !== expectedUpdatedAt) {
            throw new Error("대상 문제지가 저장 중 변경되었습니다. 병합 내용을 다시 확인해 주세요.");
          }
          const patch = typeof partial === "function" ? partial(existing) : partial;
          const updated = { ...existing, ...patch, updatedAt: now };
          await commitImportAssetSessionEntry(sessionId, id, expectedUpdatedAt, updated);
          const next = current.map((entry) => (entry.id === id ? updated : entry));
          entriesRef.current = next;
          setEntries(next);
        });
        lastOperationRef.current = task;
        await task;
      } catch (err) {
        const message = errorMessage(err, "가져온 자료를 저장하지 못했습니다.");
        setError(message);
        throw new Error(message, { cause: err });
      }
    },
    [enqueue],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const images = await enqueueMutation((current) => {
          const entry = current.find((item) => item.id === id);
          const next = current.filter((item) => item.id !== id);
          return {
            next,
            value: entry ? getUnreferencedImages(getAllImageFilenames(entry), next) : [],
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
    addEntriesWithImportAssetSession,
    updateEntry,
    replaceEntries,
    patchEntry,
    patchEntryWithImportAssetSession,
    deleteEntry,
    toggleMastered,
    toggleDifficult,
    refresh,
    flushEntries,
    setEntriesMaintenanceBlocked,
  };
}
