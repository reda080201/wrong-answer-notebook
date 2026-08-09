import { useEffect, useRef } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";
import { readStorageJson, writeStorageJson } from "../../../services/storageJson";

const STORAGE_KEY = "wrong-answer-import-workspace-draft";

export function loadImportWorkspaceDraft(): ImportWorkspace | null {
  try {
    const draft = readStorageJson(localStorage, STORAGE_KEY, (value): value is ImportWorkspace =>
      value !== null && typeof value === "object" && "id" in value && "groups" in value,
    );
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
  } catch { return null; }
}

export function clearImportWorkspaceDraft(): void { localStorage.removeItem(STORAGE_KEY); }

export function saveImportWorkspaceDraft(workspace: ImportWorkspace): void {
  writeStorageJson(localStorage, STORAGE_KEY, workspace);
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
    const timer = window.setTimeout(() => {
      callbacksRef.current?.onSaving?.();
      try {
        saveImportWorkspaceDraft(workspace);
        callbacksRef.current?.onSaved?.();
      } catch (error) {
        callbacksRef.current?.onError?.(error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [workspace, enabled]);
}

