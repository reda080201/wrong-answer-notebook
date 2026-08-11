import type { QuestionContentSegment, StructuredQuestion } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export interface StructuredQuestionSegmentPatch {
  questionNumber: string;
  segmentId: string;
  value: string;
}

function cloneSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table"
    ? { ...segment, rows: segment.rows.map((row) => [...row]) }
    : { ...segment };
}

function segmentValue(segment: QuestionContentSegment): string | undefined {
  if (segment.type === "text" || segment.type === "condition") return segment.text;
  if (segment.type === "equation") return segment.latex;
  return undefined;
}

function missingValues(
  segments: QuestionContentSegment[],
  type: "condition" | "equation",
  values: string[],
): string[] {
  const available = new Map<string, number>();
  segments.forEach((segment) => {
    if (segment.type !== type) return;
    const value = segmentValue(segment);
    if (value) available.set(value, (available.get(value) ?? 0) + 1);
  });
  return values.filter((value) => {
    const count = available.get(value) ?? 0;
    if (count > 0) {
      available.set(value, count - 1);
      return false;
    }
    return Boolean(value.trim());
  });
}

/**
 * Materializes only semantic values that do not already have an ordered segment.
 * Existing figure/table anchors are cloned in place and never moved.
 */
export function materializeStructuredReviewSegments(question: StructuredQuestion): QuestionContentSegment[] {
  const segments = question.contentSegments.map(cloneSegment);
  const usedIds = new Set(segments.map((segment) => segment.id));
  let ordinal = 0;
  const idFor = (type: "text" | "condition" | "equation") => {
    let id = `review-${question.questionNumber}-${type}-${++ordinal}`;
    while (usedIds.has(id)) id = `review-${question.questionNumber}-${type}-${++ordinal}`;
    usedIds.add(id);
    return id;
  };

  if (question.questionText.trim() && !segments.some((segment) => segment.type === "text")) {
    segments.unshift({ id: idFor("text"), type: "text", text: question.questionText });
  }
  missingValues(segments, "condition", question.conditions)
    .forEach((text) => segments.push({ id: idFor("condition"), type: "condition", text }));
  missingValues(segments, "equation", question.equations)
    .forEach((latex) => segments.push({ id: idFor("equation"), type: "equation", latex, display: true }));
  return segments;
}

export function projectStructuredSemanticFields(
  segments: QuestionContentSegment[],
): Pick<StructuredQuestion, "questionText" | "conditions" | "equations"> {
  return {
    questionText: segments
      .filter((segment): segment is Extract<QuestionContentSegment, { type: "text" }> => segment.type === "text")
      .map((segment) => segment.text)
      .join("\n")
      .trim(),
    conditions: segments
      .filter((segment): segment is Extract<QuestionContentSegment, { type: "condition" }> => segment.type === "condition")
      .map((segment) => segment.text)
      .filter(Boolean),
    equations: segments
      .filter((segment): segment is Extract<QuestionContentSegment, { type: "equation" }> => segment.type === "equation")
      .map((segment) => segment.latex)
      .filter(Boolean),
  };
}

export function normalizeStructuredQuestionReviewData(question: StructuredQuestion): StructuredQuestion {
  const contentSegments = materializeStructuredReviewSegments(question);
  return {
    ...question,
    ...projectStructuredSemanticFields(contentSegments),
    contentSegments,
    figureIds: [...question.figureIds],
    source: question.source ? { ...question.source } : undefined,
  };
}

export function updateStructuredQuestionSegment(
  questions: StructuredQuestion[],
  patch: StructuredQuestionSegmentPatch,
): StructuredQuestion[] {
  const targetNumber = normalizeQuestionNumber(patch.questionNumber);
  return questions.map((question) => {
    if (normalizeQuestionNumber(question.questionNumber) !== targetNumber) return question;
    const materialized = materializeStructuredReviewSegments(question);
    const contentSegments = materialized.map((segment) => {
      if (segment.id !== patch.segmentId) return cloneSegment(segment);
      if (segment.type === "text" || segment.type === "condition") return { ...segment, text: patch.value };
      if (segment.type === "equation") return { ...segment, latex: patch.value };
      return cloneSegment(segment);
    });
    return {
      ...question,
      ...projectStructuredSemanticFields(contentSegments),
      contentSegments,
      figureIds: [...question.figureIds],
      source: question.source ? { ...question.source } : undefined,
    };
  });
}
