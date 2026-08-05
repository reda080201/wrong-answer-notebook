import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EntryKind } from "../types";

interface NavigationTarget {
  section?: EntryKind;
  entryId?: string | null;
  question?: { entryId: string; questionNumber: string };
}

interface UseNotebookNavigationControllerOptions {
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

export function useNotebookNavigationController({
  activeSection,
  examSubmitting,
  examSession,
  closeExamSession,
  setActiveSection,
  setSelectedId,
  setShowLearningHub,
  setShowQuestionBank,
  setShowLibraryExplorer,
  setQuestionTarget,
  setExamSaveError,
}: UseNotebookNavigationControllerOptions) {
  return useCallback(async (target: NavigationTarget): Promise<boolean> => {
    if (examSubmitting) {
      setExamSaveError("시험 제출 중에는 이동할 수 없습니다.");
      return false;
    }
    if (examSession) {
      const isSameEntry = target.entryId === undefined || target.entryId === examSession.entryId;
      const isSameSection = target.section === undefined || target.section === activeSection;
      if (!isSameEntry || !isSameSection) {
        const closed = await closeExamSession();
        if (!closed) return false;
      }
    }
    if (target.section) setActiveSection(target.section);
    setShowLearningHub(false);
    setShowQuestionBank(false);
    setShowLibraryExplorer(false);
    if (target.entryId !== undefined) setSelectedId(target.entryId);
    if (target.question) {
      setQuestionTarget({ ...target.question, requestId: Date.now() });
    }
    return true;
  }, [activeSection, closeExamSession, examSession, examSubmitting, setActiveSection, setExamSaveError, setSelectedId, setShowLearningHub, setShowQuestionBank, setShowLibraryExplorer, setQuestionTarget]);
}
