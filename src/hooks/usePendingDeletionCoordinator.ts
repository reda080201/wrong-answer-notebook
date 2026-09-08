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

interface FinalizationPlan {
  retained: PendingDeletion[];
  actionable: PendingDeletion[];
  protectedImages: Set<string>;
}

function buildFinalizationPlan(records: PendingDeletion[], entries: WrongAnswerEntry[], now: number): FinalizationPlan {
  const retained: PendingDeletion[] = [];
  const actionable: PendingDeletion[] = [];
  const liveEntryIds = new Set(entries.map((entry) => entry.id));
  for (const record of records) {
    if (liveEntryIds.has(record.entry.id)) continue;
    if (Date.parse(record.finalizeAfter) > now) retained.push(record);
    else actionable.push(record);
  }
  return {
    retained,
    actionable,
    protectedImages: new Set([
      ...entries.flatMap(getAllImageFilenames),
      ...retained.flatMap((record) => record.imageReferences),
    ]),
  };
}

export interface PendingDeletionFinalizationResult {
  retained: PendingDeletion[];
  failedImages: Set<string>;
}

export async function finalizePendingDeletionRecords(
  records: PendingDeletion[],
  entries: WrongAnswerEntry[],
  deleteAsset: (filename: string) => Promise<void>,
  now = Date.now(),
): Promise<PendingDeletionFinalizationResult> {
  const plan = buildFinalizationPlan(records, entries, now);
  const candidateImages = new Set(
    plan.actionable.flatMap((record) => record.imageReferences.filter((image) => !plan.protectedImages.has(image))),
  );
  const failedImages = new Set<string>();
  for (const image of candidateImages) {
    try {
      await deleteAsset(image);
    } catch {
      failedImages.add(image);
    }
  }
  const retryRecords = plan.actionable
    .map((record) => ({
      ...record,
      imageReferences: record.imageReferences.filter((image) => failedImages.has(image)),
    }))
    .filter((record) => record.imageReferences.length > 0);
  return { retained: [...plan.retained, ...retryRecords], failedImages };
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
      const result = await finalizePendingDeletionRecords(records, entriesRef.current, deleteImage);
      let failure = result.failedImages.size > 0 ? "삭제 대기 이미지를 정리하지 못했습니다." : null;
      const retained = result.retained;
      try {
        await backend.savePendingDeletions(retained);
      } catch (cause) {
        failure = cause instanceof Error ? `삭제 대기 항목을 저장하지 못했습니다. ${cause.message}` : "삭제 대기 항목을 저장하지 못했습니다.";
        setError(failure);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000);
        return;
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
