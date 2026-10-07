import { useCallback, useEffect, useRef } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";
import { getStorageBackend } from "../../../services/storageBackend";

let draftWriteQueue: Promise<void> = Promise.resolve();

function enqueueDraftWrite(write: () => Promise<void>): Promise<void> {
  const result = draftWriteQueue.then(write, write);
  draftWriteQueue = result.catch(() => undefined);
  return result;
}

export async function flushImportWorkspaceDraftWrites(): Promise<void> {
  await draftWriteQueue;
}

export async function loadImportWorkspaceDraft(): Promise<ImportWorkspace | null> {
    await flushImportWorkspaceDraftWrites();
    const draft = await getStorageBackend().loadImportWorkspaceDraft();
    if (!draft) return null;
    if (draft.commitAttempt) {
      const receipt = draft.commitAttempt;
      if (!Array.isArray(receipt.entryIds) || !Array.isArray(receipt.groupIds) || !receipt.entryIds.length
        || receipt.entryIds.length !== receipt.groupIds.length || !receipt.entryIds.every(id => typeof id === "string" && id.length > 0)
        || new Set(receipt.entryIds).size !== receipt.entryIds.length || !receipt.groupIds.every(id => typeof id === "string" && id.length > 0)
        || (receipt.state !== "pending" && receipt.state !== "completed")) throw new Error("가져오기 확정 기록이 손상되어 초안 복구를 중단했습니다. 항목 목록과 백업을 확인해 주세요.");
      if (receipt.attemptId !== undefined && (typeof receipt.attemptId !== "string" || !receipt.attemptId.trim() || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt)))) throw new Error("가져오기 작업 식별 정보가 손상되었습니다.");
      if (receipt.sourceToSaved !== undefined && (!receipt.sourceToSaved || typeof receipt.sourceToSaved !== "object" || Array.isArray(receipt.sourceToSaved) || Object.values(receipt.sourceToSaved).some(name => typeof name !== "string" || !name.trim()))) throw new Error("가져오기 자산 대응 정보가 손상되었습니다.");
      if (receipt.entryDigests && (!Array.isArray(receipt.entryDigests) || receipt.entryDigests.length !== receipt.entryIds.length || receipt.entryDigests.some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)))) throw new Error("가져오기 확정 내용의 해시가 손상되었습니다.");
      if (receipt.preparedEntries && (!Array.isArray(receipt.preparedEntries) || receipt.preparedEntries.length !== receipt.entryIds.length || receipt.preparedEntries.some(entry => !entry || typeof entry !== "object"))) throw new Error("가져오기 확정 내용이 손상되었습니다.");
    }
    return {
      ...draft,
      groups: (draft.groups ?? []).map((group) => ({
        ...group,
        questions: (group.questions ?? []).map((question) => ({
          ...question,
          questionImageAssets: question.questionImageAssets ?? [],
          sourcePageAssets: question.sourcePageAssets ?? [],
        })),
      })),
    };
}

export async function clearImportWorkspaceDraft(): Promise<void> {
  await enqueueDraftWrite(() => getStorageBackend().clearImportWorkspaceDraft());
}

export async function saveImportWorkspaceDraft(workspace: ImportWorkspace): Promise<void> {
  await enqueueDraftWrite(() => getStorageBackend().saveImportWorkspaceDraft(workspace));
}

export interface ImportWorkspaceAutosaveCallbacks {
  onSaving?(): void;
  onSaved?(): void;
  onError?(error: unknown): void;
}

export function useImportWorkspaceAutosave(
  workspace: ImportWorkspace,
  enabled = true,
  callbacks?: ImportWorkspaceAutosaveCallbacks,
): () => Promise<void> {
  const callbacksRef = useRef(callbacks);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(async () => {
      timerRef.current = null;
      callbacksRef.current?.onSaving?.();
      try {
        await saveImportWorkspaceDraft(workspace);
        callbacksRef.current?.onSaved?.();
      } catch (error) {
        callbacksRef.current?.onError?.(error);
      }
    }, 750);
    timerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [workspace, enabled]);

  return useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await flushImportWorkspaceDraftWrites();
  }, []);
}

