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
  selectedId: string | null;
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
  activeSection: EntryKind;
  selectedId: string | null;
  requestNavigation(target: NavigationTarget): Promise<boolean>;
  selectSection(section: EntryKind): Promise<boolean>;
  selectEntry(entryId: string | null, section?: EntryKind): Promise<boolean>;
  openQuestion(entryId: string, questionNumber: string): Promise<boolean>;
  openLearningHub(): Promise<boolean>;
  openQuestionBank(): Promise<boolean>;
  openLibrary(): Promise<boolean>;
}

export type AppNavigationControllerGroup = AppNavigationController;

export function useAppNavigationController(options: UseAppNavigationControllerOptions): AppNavigationController {
  const requestNavigation = useNotebookNavigationController(options);
  const request = useCallback((target: NavigationTarget) => requestNavigation(target), [requestNavigation]);
  const selectSection = useCallback((section: EntryKind) => request({ section, entryId: null }), [request]);
  const selectEntry = useCallback((entryId: string | null, section?: EntryKind) => request({ entryId, section }), [request]);
  const openQuestion = useCallback((entryId: string, questionNumber: string) => request({ question: { entryId, questionNumber } }), [request]);
  const openLearningHub = useCallback(async () => {
    if (!(await request({ entryId: null }))) return false;
    options.setShowLearningHub(true);
    options.setShowQuestionBank(false);
    options.setShowLibraryExplorer(false);
    return true;
  }, [options, request]);
  const openQuestionBank = useCallback(async () => {
    if (!(await request({ entryId: null }))) return false;
    options.setShowLearningHub(false);
    options.setShowQuestionBank(true);
    options.setShowLibraryExplorer(false);
    return true;
  }, [options, request]);
  const openLibrary = useCallback(async () => {
    if (!(await request({ entryId: null }))) return false;
    options.setShowLearningHub(false);
    options.setShowQuestionBank(false);
    options.setShowLibraryExplorer(true);
    return true;
  }, [options, request]);
  return {
    activeSection: options.activeSection,
    selectedId: options.selectedId,
    requestNavigation: request,
    selectSection,
    selectEntry,
    openQuestion,
    openLearningHub,
    openQuestionBank,
    openLibrary,
  };
}
