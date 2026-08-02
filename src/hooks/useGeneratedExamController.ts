import { useCallback, useState } from "react";
import type { ExamPrintPreferences, GeneratedExam } from "../types";
import { buildGeneratedExamPrintModel } from "../features/exam-builder/services/buildGeneratedExamPrintModel";
import { printExamDocument } from "../features/export/services/printExamDocument";
import { useGeneratedExams } from "./useGeneratedExams";

interface UseGeneratedExamControllerOptions {
  examPrintPreferences: ExamPrintPreferences;
  onOpenExam(exam: GeneratedExam): void;
}

export function useGeneratedExamController({
  examPrintPreferences,
  onOpenExam,
}: UseGeneratedExamControllerOptions) {
  const store = useGeneratedExams();
  const { upsert, remove: removeStored, flush } = store;
  const [builderOpen, setBuilderOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const persist = useCallback(async (exam: GeneratedExam) => {
    await upsert(exam);
  }, [upsert]);

  const remove = useCallback(async (id: string) => {
    await removeStored(id);
  }, [removeStored]);

  const openExam = useCallback((exam: GeneratedExam) => {
    onOpenExam(exam);
    setListOpen(false);
  }, [onOpenExam]);

  const print = useCallback(async (exam: GeneratedExam) => {
    await printExamDocument(buildGeneratedExamPrintModel(exam, examPrintPreferences));
  }, [examPrintPreferences]);

  const closeList = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    setCloseError(null);
    try {
      await flush();
      setListOpen(false);
    } catch {
      setCloseError("모의고사 변경을 저장하지 못했습니다. 저장이 완료된 뒤 다시 닫아 주세요.");
    } finally {
      setClosing(false);
    }
  }, [closing, flush]);

  return {
    ...store,
    builderOpen,
    setBuilderOpen,
    listOpen,
    setListOpen,
    closeError,
    closing,
    persist,
    remove,
    openExam,
    print,
    closeList,
  };
}
