import { useCallback, useEffect, useRef, useState } from "react";
import { deleteImage } from "../api";
import type { PendingDeletion, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "../utils/entry";
import { getStorageBackend } from "../services/storageBackend";

export function getUndoablePendingDeletions(records: PendingDeletion[], now = Date.now()) {
  return records.filter((record) => !record.cleanupRetry && Date.parse(record.finalizeAfter) > now);
}

function newest(records: PendingDeletion[]) {
  return [...records].sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt))[0] ?? null;
}

interface Options {
  entries: WrongAnswerEntry[];
  restore(pending: PendingDeletion): Promise<void>;
  setSelectedId(id: string | null): void;
  onFinalizeEntry?(entryId: string): Promise<void>;
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
  logicallyFinalizedEntryIds: string[];
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
  return {
    retained: [...plan.retained, ...retryRecords],
    failedImages,
    logicallyFinalizedEntryIds: [...new Set(plan.actionable.map((record) => record.entry.id))],
  };
}

/** Coordinates persisted deletion records without deleting a shared image early. */
export function usePendingDeletionCoordinator({ entries, restore, setSelectedId, onFinalizeEntry }: Options) {
  const entriesRef = useRef(entries);
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const finalizePromiseRef = useRef<Promise<void> | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const retryDelayRef = useRef(1_000);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  const runExclusively = useCallback(<T,>(operation: () => Promise<T>) => {
    const task = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);

  const finalizeExpired = useCallback(async () => {
    if (finalizePromiseRef.current) return finalizePromiseRef.current;
    const task = runExclusively(async () => {
      const backend = getStorageBackend();
      if (!backend.loadPendingDeletions || !backend.savePendingDeletions) return;
      const records = await backend.loadPendingDeletions();
      const result = await finalizePendingDeletionRecords(records, entriesRef.current, deleteImage);
      const graphFailures = new Set<string>();
      if (onFinalizeEntry) {
        const graphCleanupIds = [...new Set(
          records
            .filter((record) => Date.parse(record.finalizeAfter) <= Date.now())
            .filter((record) => record.graphCleanupPending !== false)
            .map((record) => record.entry.id),
        )];
        for (const entryId of graphCleanupIds) {
          try {
            await onFinalizeEntry(entryId);
          } catch {
            graphFailures.add(entryId);
          }
        }
      }
      const retained = [
        ...result.retained.map((record) => ({
          ...record,
          cleanupRetry: true,
          graphCleanupPending: graphFailures.has(record.entry.id),
        })),
        ...records
          .filter((record) => Date.parse(record.finalizeAfter) <= Date.now())
          .filter((record) => !result.retained.some((retainedRecord) => retainedRecord.id === record.id))
          .filter((record) => graphFailures.has(record.entry.id))
          .map((record) => ({ ...record, imageReferences: [], cleanupRetry: true, graphCleanupPending: true })),
      ];
      let failure = result.failedImages.size > 0 || graphFailures.size > 0
        ? "삭제 항목 정리를 완료하지 못했습니다."
        : null;
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
    });
    finalizePromiseRef.current = task.finally(() => {
      finalizePromiseRef.current = null;
    });
    return finalizePromiseRef.current;
  }, [onFinalizeEntry, runExclusively]);

  useEffect(() => {
    void (async () => {
      const loader = getStorageBackend().loadPendingDeletions;
      if (!loader) return;
      setPending(await loader());
      await finalizeExpired();
    })().catch((cause) => setError(cause instanceof Error ? cause.message : "삭제 대기 항목을 불러오지 못했습니다."));
  }, [finalizeExpired]);

  useEffect(() => {
    const due = pending
      .filter((record) => !record.cleanupRetry)
      .map((record) => Date.parse(record.finalizeAfter))
      .filter(Number.isFinite);
    const hasCleanupRetry = pending.some((record) => record.cleanupRetry);
    if (!due.length && !hasCleanupRetry) return;
    const untilDue = due.length ? Math.max(0, Math.min(...due) - Date.now()) : retryDelayRef.current;
    const delay = error ? retryDelayRef.current : untilDue + 20;
    const timer = window.setTimeout(() => void finalizeExpired(), delay);
    return () => window.clearTimeout(timer);
  }, [error, pending, finalizeExpired]);

  const record = useCallback((item: PendingDeletion) => {
    setPending((current) => current.some((record) => record.id === item.id) ? current : [...current, item]);
  }, []);

  const undo = useCallback(async (item: PendingDeletion) => runExclusively(async () => {
    const backend = getStorageBackend();
    if (!backend.loadPendingDeletions) throw new Error("삭제 대기 항목을 불러오지 못했습니다.");
    const current = await backend.loadPendingDeletions();
    const durableItem = current.find((record) => record.id === item.id);
    if (!durableItem || durableItem.cleanupRetry || Date.parse(durableItem.finalizeAfter) <= Date.now()) {
      setPending(current);
      throw new Error("실행 취소 가능 시간이 지났습니다.");
    }
    await restore(durableItem);
    const remaining = await backend.loadPendingDeletions();
    setPending(remaining);
    if (durableItem.wasSelected) setSelectedId(durableItem.entry.id);
    setError(null);
  }), [restore, runExclusively, setSelectedId]);

  const undoableRecords = getUndoablePendingDeletions(pending);
  const cleanupRetryRecords = pending.filter((record) => record.cleanupRetry);
  return {
    latestUndoable: newest(undoableRecords),
    undoableRecords,
    cleanupRetryRecords,
    pending,
    error,
    record,
    undo,
    finalizeExpired,
    flush: finalizeExpired,
  };
}
