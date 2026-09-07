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

export function getProtectedPendingImageReferences(
  records: PendingDeletion[],
  entries: WrongAnswerEntry[],
  currentRecordId: string,
): Set<string> {
  return new Set(
    records
      .filter((record) => record.id !== currentRecordId)
      .filter((record) => !entries.some((entry) => entry.id === record.entry.id))
      .flatMap((record) => record.imageReferences),
  );
}

/** Coordinates persisted deletion records without deleting a shared image early. */
export function usePendingDeletionCoordinator({ entries, restore, setSelectedId }: Options) {
  const entriesRef = useRef(entries);
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const finalizePromiseRef = useRef<Promise<void> | null>(null);
  const retryDelayRef = useRef(1_000);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  const finalizeExpired = useCallback(async () => {
    if (finalizePromiseRef.current) return finalizePromiseRef.current;
    const task = (async () => {
      const backend = getStorageBackend();
      if (!backend.loadPendingDeletions || !backend.savePendingDeletions) return;
      const records = await backend.loadPendingDeletions();
      const now = Date.now();
      const retained: PendingDeletion[] = [];
      let failure: string | null = null;
      for (const record of records) {
        if (Date.parse(record.finalizeAfter) > now) {
          retained.push(record);
          continue;
        }
        // A restored entry owns its images again, so its already-expired pending
        // record is no longer actionable and must not survive another startup.
        if (entriesRef.current.some((entry) => entry.id === record.entry.id)) continue;
        const references = new Set(entriesRef.current.flatMap(getAllImageFilenames));
        // Pending snapshots are still the source of truth while Undo is
        // available. Keep an image alive when another pending record references
        // it, even if that other record is also due in this pass.
        for (const image of getProtectedPendingImageReferences(records, entriesRef.current, record.id)) {
          references.add(image);
        }
        try {
          for (const image of record.imageReferences) {
            if (!references.has(image)) await deleteImage(image);
          }
        } catch (cause) {
          retained.push(record);
          failure = cause instanceof Error ? `삭제 대기 이미지를 정리하지 못했습니다. ${cause.message}` : "삭제 대기 이미지를 정리하지 못했습니다.";
        }
      }
      try {
        await backend.savePendingDeletions(retained);
      } catch (cause) {
        failure = cause instanceof Error ? `삭제 대기 항목을 저장하지 못했습니다. ${cause.message}` : "삭제 대기 항목을 저장하지 못했습니다.";
      }
      setPending(retained);
      setError(failure);
      if (failure) {
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000);
      } else {
        retryDelayRef.current = 1_000;
      }
    })();
    finalizePromiseRef.current = task.finally(() => {
      finalizePromiseRef.current = null;
    });
    return finalizePromiseRef.current;
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
    const untilDue = Math.max(0, Math.min(...due) - Date.now());
    const delay = error ? retryDelayRef.current : untilDue + 20;
    const timer = window.setTimeout(() => void finalizeExpired(), delay);
    return () => window.clearTimeout(timer);
  }, [error, pending, finalizeExpired]);

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
