import type { EntryFormData } from "../../../types";
import { cleanQuestionText } from "../../../utils/textCleanup";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import {
  normalizeImportAudit,
  normalizeRejectedNotes,
  removeRejectedNotes,
  scrubRejectedNotesFromAnswers,
  scrubRejectedNotesFromStructuredQuestions,
} from "../../../utils/importAudit";

/** Builds the single persisted snapshot used by direct and reviewed saves. */
export function canonicalizeImportDraftForSave(data: Partial<EntryFormData>): Partial<EntryFormData> {
  const rejectedNotes = normalizeRejectedNotes(data.rejectedNotes);
  const structuredQuestions = scrubRejectedNotesFromStructuredQuestions(
    data.structuredQuestions,
    rejectedNotes,
  );
  const question = structuredQuestions?.length
    ? renderStructuredQuestionsCompatibilityText(structuredQuestions)
    : cleanQuestionText(removeRejectedNotes(data.question ?? "", rejectedNotes));
  const answerKey = scrubRejectedNotesFromAnswers(data.answerKey ?? [], rejectedNotes);
  return {
    ...data,
    question,
    structuredQuestions,
    questionContentSegments: structuredQuestions?.length
      ? Object.fromEntries(structuredQuestions.map((item) => [item.questionNumber, item.contentSegments]))
      : data.questionContentSegments,
    memo: removeRejectedNotes(data.memo ?? "", rejectedNotes),
    answerKey,
    rejectedNotes,
    importAudit: data.importAudit
      ? normalizeImportAudit(data.importAudit, { question, answerKey, figures: data.figures, structuredQuestions })
      : undefined,
  };
}
