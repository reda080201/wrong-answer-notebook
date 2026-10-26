import { useCallback, useMemo, useState } from "react";
import { prefersCompactExamLayout } from "../features/exam/services/examLayout";
import type { ExamPrintPreferences, GeneratedExam, WrongAnswerEntry } from "../types";
import { normalizeGeneratedExamSources } from "../features/exam-builder/services/questionSource";
import { buildGeneratedExamPrintModel } from "../features/exam-builder/services/buildGeneratedExamPrintModel";
import { printExamDocument } from "../features/export/services/printExamDocument";
import { useGeneratedExams } from "./useGeneratedExams";
import type { ExamOpenOptions, ExamOpenResult } from "./useExamSessionController";

interface UseGeneratedExamControllerOptions {
  examPrintPreferences: ExamPrintPreferences;
  entries: WrongAnswerEntry[];
  onOpenExam(exam: GeneratedExam, options?: ExamOpenOptions): ExamOpenResult;
}

export function useGeneratedExamController({
  examPrintPreferences,
  entries,
  onOpenExam,
}: UseGeneratedExamControllerOptions) {
  const store = useGeneratedExams();
  const { upsert, remove: removeStored, flush } = store;
  const [builderOpen, setBuilderOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const exams = useMemo(() => store.exams.map((exam) => normalizeGeneratedExamSources(exam, entries)), [entries, store.exams]);

  const persist = useCallback(async (exam: GeneratedExam) => {
    await upsert(exam);
  }, [upsert]);

  const remove = useCallback(async (id: string) => {
    await removeStored(id);
  }, [removeStored]);

  const openExam = useCallback((exam: GeneratedExam, options?: ExamOpenOptions) => {
    const mode = options?.mode ?? (exam.preset === "real_exam" ? "real" : "practice");
    const result = onOpenExam(exam, {
      ...options,
      mode,
      timeLimitMinutes: mode === "real" ? options?.timeLimitMinutes ?? exam.timeLimitMinutes ?? 50 : undefined,
      showTimer: mode === "real" ? options?.showTimer ?? true : options?.showTimer,
      answerSheetOpen: mode === "real" ? options?.answerSheetOpen ?? !prefersCompactExamLayout() : options?.answerSheetOpen,
      answerSheetLayout: mode === "real" ? options?.answerSheetLayout ?? "auto" : options?.answerSheetLayout,
    });
    if (result.ok) setListOpen(false);
    return result;
  }, [onOpenExam]);

  const print = useCallback(async (exam: GeneratedExam) => {
    await printExamDocument(buildGeneratedExamPrintModel(exam, examPrintPreferences));
  }, [examPrintPreferences]);

  const closeList = useCallback(async () => {
    if (closing) return false;
    setClosing(true);
    setCloseError(null);
    try {
      await flush();
      setListOpen(false);
      return true;
    } catch {
      setCloseError("모의고사 변경을 저장하지 못했습니다. 저장이 완료된 뒤 다시 닫아 주세요.");
      return false;
    } finally {
      setClosing(false);
    }
  }, [closing, flush]);

  return {
    ...store,
    exams,
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
