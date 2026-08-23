import { useMemo } from "react";
import type { ExamPrintPreferences, GeneratedExam, WrongAnswerEntry } from "../types";
import { useExamSessionController, type ExamOpenOptions } from "./useExamSessionController";
import { useGeneratedExamController } from "./useGeneratedExamController";

interface UseExamWorkspaceControllerOptions {
  existingEntries: WrongAnswerEntry[];
  commitExamSubmission: Parameters<typeof useExamSessionController>[0]["commitExamSubmission"];
  examPrintPreferences: ExamPrintPreferences;
}

export function useExamWorkspaceController(options: UseExamWorkspaceControllerOptions) {
  const exam = useExamSessionController({
    existingEntries: options.existingEntries,
    commitExamSubmission: options.commitExamSubmission,
  });
  const generated = useGeneratedExamController({
    examPrintPreferences: options.examPrintPreferences,
    onOpenExam: exam.openGenerated,
  });
  return useMemo(() => ({
    ...exam,
    generated,
    openGeneratedExam: (generatedExam: GeneratedExam, openOptions?: ExamOpenOptions) => generated.openExam(generatedExam, openOptions),
  }), [exam, generated]);
}
