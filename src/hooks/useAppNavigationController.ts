import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EntryKind } from "../types";
import { useNotebookNavigationController } from "./useNotebookNavigationController";

export interface NavigationTarget {
  section?: EntryKind;
  entryId?: string | null;
  question?: { entryId: string; questionNumber: string };
}

interface UseAppNavigationControllerOptions {
  activeSection: EntryKind;
  examSubmitting: boolean;
  examSession: { entryId: string } | null;
  closeExamSession: () => Promise<boolean>;
  setActiveSection: Dispatch<SetStateAction<EntryKind>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setShowLearningHub: Dispatch<SetStateAction<boolean>>;
  setShowQuestionBank: Dispatch<SetStateAction<boolean>>;
  setShowLibraryExplorer: Dispatch<SetStateAction<boolean>>;
  setQuestionTarget: Dispatch<SetStateAction<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>>;
  setExamSaveError: (message: string | null) => void;
}

export interface AppNavigationController {
  requestNavigation(target: NavigationTarget): Promise<boolean>;
}

export type AppNavigationControllerGroup = Pick<AppNavigationController, "requestNavigation">;

export function useAppNavigationController(options: UseAppNavigationControllerOptions): AppNavigationController {
  const requestNavigation = useNotebookNavigationController(options);
  return { requestNavigation: useCallback((target: NavigationTarget) => requestNavigation(target), [requestNavigation]) };
}
