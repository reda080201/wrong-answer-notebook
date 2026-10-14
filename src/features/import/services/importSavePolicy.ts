import type { EntryFormData } from "../../../types";
import { cleanQuestionText } from "../../../utils/textCleanup";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import { updateQuestionCompatibilityText, COMPATIBILITY_REVIEW_WARNING } from "../../../utils/questionCompatibility";
import type { StructuredQuestion } from "../../../types";
import {
  normalizeImportAudit,
  normalizeRejectedNotes,
  removeRejectedNotes,
  scrubRejectedNotesFromContentSegmentMap,
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
  const preservedQuestion = removeRejectedNotes(data.question ?? "", rejectedNotes);
  const question = preservedQuestion.trim() ? preservedQuestion : structuredQuestions?.length
    ? renderStructuredQuestionsCompatibilityText(structuredQuestions)
    : cleanQuestionText(preservedQuestion);
  const answerKey = scrubRejectedNotesFromAnswers(data.answerKey ?? [], rejectedNotes);
  const questionContentSegments = scrubRejectedNotesFromContentSegmentMap(
    data.questionContentSegments,
    rejectedNotes,
  );
  return {
    ...data,
    question,
    structuredQuestions,
    questionContentSegments: structuredQuestions?.length
      ? Object.fromEntries(structuredQuestions.map((item) => [item.questionNumber, item.contentSegments]))
      : questionContentSegments,
    memo: removeRejectedNotes(data.memo ?? "", rejectedNotes),
    answerKey,
    rejectedNotes,
    importAudit: data.importAudit
      ? normalizeImportAudit(data.importAudit, { question, answerKey, figures: data.figures, structuredQuestions })
      : undefined,
  };
}

/** Preserve source-only content when the structured review editor changes a question. */
export function updateImportDraftQuestions(data: Partial<EntryFormData>, questions: StructuredQuestion[]): Partial<EntryFormData> {
  const result = updateQuestionCompatibilityText(data.question ?? "", questions, data.structuredQuestions ?? []);
  const structuredQuestions = questions.map(question => result.unresolved.includes(question.questionNumber)
    ? { ...question, needsReview: true, warning: [...new Set([question.warning, COMPATIBILITY_REVIEW_WARNING].filter(Boolean))].join(" ") } : question);
  return { ...data, question: result.text, structuredQuestions, questionContentSegments: Object.fromEntries(structuredQuestions.map(question => [question.questionNumber, question.contentSegments])) };
}
