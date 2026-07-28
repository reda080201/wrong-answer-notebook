import { useEffect } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";

const STORAGE_KEY = "wrong-answer-import-workspace-draft";

export function loadImportWorkspaceDraft(): ImportWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ImportWorkspace;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function useImportWorkspaceAutosave(workspace: ImportWorkspace, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      try { saveImportWorkspaceDraft(workspace); } catch { /* best effort */ }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [workspace, enabled]);
}

