import type {
  EntryFormData,
  QuestionContentSegment,
} from "../../../types";
import type { ImportValidationIssue } from "../../../utils/importValidation";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";

export function removeFigureFromImportDraft(
  draft: Partial<EntryFormData>,
  figureId: string,
): Partial<EntryFormData> {
  const strip = (segments: QuestionContentSegment[]) => segments
    .filter((segment) => segment.type !== "figure" || segment.figureId !== figureId)
    .map((segment) => segment.type === "table"
      ? { ...segment, rows: segment.rows.map((row) => [...row]) }
      : { ...segment });
  const structuredQuestions = draft.structuredQuestions?.map((question) => ({
    ...question,
    figureIds: question.figureIds.filter((id) => id !== figureId),
    contentSegments: strip(question.contentSegments),
    source: question.source ? { ...question.source } : undefined,
  }));
  const questionContentSegments = draft.questionContentSegments
    ? Object.fromEntries(Object.entries(draft.questionContentSegments).map(([number, segments]) => [number, strip(segments)]))
    : undefined;

  return {
    ...draft,
    figures: (draft.figures ?? []).filter((figure) => figure.id !== figureId),
    structuredQuestions,
    questionContentSegments,
    question: structuredQuestions?.length
      ? renderStructuredQuestionsCompatibilityText(structuredQuestions)
      : draft.question,
  };
}

export function getStructuredValidationFingerprint(issues: ImportValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.id}\u0000${issue.severity}\u0000${issue.message}`)
    .sort()
    .join("\u0001");
}
