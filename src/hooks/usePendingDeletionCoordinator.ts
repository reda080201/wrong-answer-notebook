import { useCallback, useEffect, useRef, useState } from "react";
import { deleteImage } from "../api";
import type { PendingDeletion, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "../utils/entry";
import { getStorageBackend } from "../services/storageBackend";

function newest(records: PendingDeletion[]) {
  return [...records].sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt))[0] ?? null;
}

interface Options {
  entries: WrongAnswerEntry[];
  restore(pending: PendingDeletion): Promise<void>;
  setSelectedId(id: string | null): void;
}

/** Coordinates persisted deletion records without deleting a shared image early. */
export function usePendingDeletionCoordinator({ entries, restore, setSelectedId }: Options) {
  const entriesRef = useRef(entries);
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  const save = useCallback(async (next: PendingDeletion[]) => {
    const writer = getStorageBackend().savePendingDeletions;
    if (!writer) throw new Error("현재 저장소는 삭제 복구를 지원하지 않습니다.");
    await writer(next);
    setPending(next);
  }, []);

  const finalizeExpired = useCallback(async () => {
    const backend = getStorageBackend();
    if (!backend.loadPendingDeletions || !backend.savePendingDeletions) return;
    const records = await backend.loadPendingDeletions();
    const now = Date.now();
    const retained: PendingDeletion[] = [];
    let failure: string | null = null;
    for (const record of records) {
      if (Date.parse(record.finalizeAfter) > now || entriesRef.current.some((entry) => entry.id === record.entry.id)) {
        retained.push(record);
        continue;
      }
      const references = new Set(entriesRef.current.flatMap(getAllImageFilenames));
      try {
        for (const image of record.imageReferences) {
          if (!references.has(image)) await deleteImage(image);
        }
      } catch (cause) {
        retained.push(record);
        failure = cause instanceof Error ? `삭제 대기 이미지를 정리하지 못했습니다. ${cause.message}` : "삭제 대기 이미지를 정리하지 못했습니다.";
      }
    }
    await backend.savePendingDeletions(retained);
    setPending(retained);
    setError(failure);
  }, []);

  useEffect(() => {
    void (async () => {
      const loader = getStorageBackend().loadPendingDeletions;
      if (!loader) return;
      setPending(await loader());
      await finalizeExpired();
    })().catch((cause) => setError(cause instanceof Error ? cause.message : "삭제 대기 항목을 불러오지 못했습니다."));
  }, [finalizeExpired]);

  useEffect(() => {
    const due = pending.map((record) => Date.parse(record.finalizeAfter)).filter(Number.isFinite);
    if (!due.length) return;
    const timer = window.setTimeout(() => void finalizeExpired(), Math.max(0, Math.min(...due) - Date.now()) + 20);
    return () => window.clearTimeout(timer);
  }, [pending, finalizeExpired]);

  const record = useCallback((item: PendingDeletion) => {
    setPending((current) => current.some((record) => record.id === item.id) ? current : [...current, item]);
  }, []);

  const undo = useCallback(async (item: PendingDeletion) => {
    await restore(item);
    setPending((current) => current.filter((record) => record.id !== item.id));
    if (item.wasSelected) setSelectedId(item.entry.id);
    setError(null);
  }, [restore, setSelectedId]);

  return { latest: newest(pending), pending, error, record, undo, finalizeExpired, flush: finalizeExpired };
}
