import type { EntryFormData } from "../../../types";
import { cleanQuestionText } from "../../../utils/textCleanup";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import { updateQuestionCompatibilityText, COMPATIBILITY_REVIEW_WARNING } from "../../../utils/questionCompatibility";
import type { StructuredQuestion } from "../../../types";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
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
  const question = structuredQuestions?.length
    ? preservedQuestion.trim() ? preservedQuestion : renderStructuredQuestionsCompatibilityText(structuredQuestions)
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

/** Update generated single-text projections when the legacy source editor changes. */
export function updateLegacyImportDraftQuestion(data: Partial<EntryFormData>, value: string): Partial<EntryFormData> {
  const blocks = (text: string) => parseQuestionText(cleanQuestionText(text)).filter((block): block is QuestionBlock => block.kind === "question");
  const previous = blocks(data.question ?? "");
  const next = blocks(value);
  const matching = (items: QuestionBlock[], number: string) => items.filter(block => normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber)) === normalizeQuestionNumber(number));
  const questionContentSegments = data.questionContentSegments ? Object.fromEntries(Object.entries(data.questionContentSegments).map(([number, segments]) => {
    const before = matching(previous, number);
    const after = matching(next, number);
    if (before.length === 1 && after.length === 1) {
      if (before[0].body === after[0].body) return [number, segments];
      if (segments.length === 1 && segments[0].type === "text" && segments[0].text.trim() === before[0].body.trim())
        return [number, [{ ...segments[0], text: after[0].body }]];
    }
    if (value === data.question) return [number, segments];
    throw new Error("수정 본문과 기존 구조화 내용의 연결이 모호합니다. 원문을 유지하고 작업실에서 문항별로 수정해 주세요.");
  })) : undefined;
  return { ...data, question: value, questionContentSegments };
}
