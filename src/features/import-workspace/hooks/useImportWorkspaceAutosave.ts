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


