import { useEffect, useRef } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";
import { getStorageBackend } from "../../../services/storageBackend";

export async function loadImportWorkspaceDraft(): Promise<ImportWorkspace | null> {
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
  await getStorageBackend().clearImportWorkspaceDraft();
}

export async function saveImportWorkspaceDraft(workspace: ImportWorkspace): Promise<void> {
  await getStorageBackend().saveImportWorkspaceDraft(workspace);
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
): void {
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(async () => {
      callbacksRef.current?.onSaving?.();
      try {
        await saveImportWorkspaceDraft(workspace);
        callbacksRef.current?.onSaved?.();
      } catch (error) {
        callbacksRef.current?.onError?.(error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [workspace, enabled]);
}

