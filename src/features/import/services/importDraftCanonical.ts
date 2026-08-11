import type {
  EntryFormData,
  QuestionContentSegment,
  StructuredQuestion,
} from "../../../types";
import type { ImportValidationIssue } from "../../../utils/importValidation";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";

export interface StructuredQuestionMergeResult {
  questions?: StructuredQuestion[];
  error?: string;
}

function editableSegments(
  question: StructuredQuestion,
  block: QuestionBlock,
): QuestionContentSegment[] {
  const replacements: QuestionContentSegment[] = block.bodySegments.map((segment, index) => {
    const existing = question.contentSegments.filter((item) => item.type !== "figure" && item.type !== "table")[index];
    const id = existing?.id ?? `review-${question.questionNumber}-${index + 1}`;
    return segment.kind === "condition"
      ? { id, type: "condition", label: segment.label, text: segment.text }
      : { id, type: "text", text: segment.text };
  });

  let replacementIndex = 0;
  const merged: QuestionContentSegment[] = [];
  for (const segment of question.contentSegments) {
    if (segment.type === "figure" || segment.type === "table") {
      merged.push(segment.type === "table"
        ? { ...segment, rows: segment.rows.map((row) => [...row]) }
        : { ...segment });
      continue;
    }
    const replacement = replacements[replacementIndex++];
    if (replacement) merged.push({ ...replacement, id: segment.id });
  }
  merged.push(...replacements.slice(replacementIndex));
  return merged;
}

export function mergeCompatibilityTextIntoStructuredQuestions(
  questions: StructuredQuestion[],
  text: string,
): StructuredQuestionMergeResult {
  const blocks = parseQuestionText(text).filter((block): block is QuestionBlock => block.kind === "question");
  const blockNumbers = blocks.map((block) => normalizeQuestionNumber(block.numberLabel));
  if (blockNumbers.some((number) => !number)) {
    return { error: "모든 문항에 원래 문항 번호를 표시해야 합니다." };
  }
  if (new Set(blockNumbers).size !== blockNumbers.length) {
    return { error: "문항 번호를 중복해서 사용할 수 없습니다." };
  }

  const canonicalNumbers = questions.map((question) => normalizeQuestionNumber(question.questionNumber));
  const expected = [...canonicalNumbers].sort();
  const actual = [...blockNumbers].sort();
  if (expected.length !== actual.length || expected.some((number, index) => number !== actual[index])) {
    return { error: "구조화된 문항의 번호를 추가하거나 삭제할 수 없습니다." };
  }

  const byNumber = new Map(blocks.map((block) => [normalizeQuestionNumber(block.numberLabel), block]));
  return {
    questions: questions.map((question) => {
      const block = byNumber.get(normalizeQuestionNumber(question.questionNumber));
      if (!block) return question;
      return {
        ...question,
        questionText: block.body,
        conditions: block.bodySegments
          .filter((segment) => segment.kind === "condition")
          .map((segment) => segment.text),
        choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim()),
        contentSegments: editableSegments(question, block),
        figureIds: [...question.figureIds],
        source: question.source ? { ...question.source } : undefined,
      };
    }),
  };
}

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
