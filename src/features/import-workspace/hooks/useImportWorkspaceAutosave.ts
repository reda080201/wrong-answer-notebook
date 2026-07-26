import { useEffect } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";

const STORAGE_KEY = "wrong-answer-import-workspace-draft";

export function loadImportWorkspaceDraft(): ImportWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as ImportWorkspace : null;
  } catch { return null; }
}

export function clearImportWorkspaceDraft(): void { localStorage.removeItem(STORAGE_KEY); }

export function useImportWorkspaceAutosave(workspace: ImportWorkspace, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); } catch { /* best effort */ }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [workspace, enabled]);
}

