import type { QuestionContentSegment, TextRangeAnnotation } from "../types";
import { getEntryQuestions, type ResolvedEntryQuestion } from "./entryQuestions";
import { normalizeQuestionNumber } from "./questionNumber";

export interface CanonicalAnnotationContext {
  /** Undefined means a duplicate identity; writing/applying annotations is blocked. */
  questionKey?: string;
  questions: Array<{ key: string; segments: QuestionContentSegment[] }>;
}
export const canonicalQuestionKey = (question: Pick<ResolvedEntryQuestion, "questionNumber" | "section">) =>
  JSON.stringify([normalizeQuestionNumber(question.questionNumber), question.section?.trim() ?? ""]);

export function createCanonicalAnnotationContext(questions: ResolvedEntryQuestion[], current: ResolvedEntryQuestion): CanonicalAnnotationContext {
  const key = canonicalQuestionKey(current);
  return {
    questionKey: questions.filter(question => canonicalQuestionKey(question) === key).length === 1 ? key : undefined,
    questions: questions.map(question => ({ key: canonicalQuestionKey(question), segments: question.contentSegments ?? [] })),
  };
}

export function canonicalAnnotationText(segment: QuestionContentSegment): string | undefined {
  if (segment.type !== "text" && segment.type !== "condition") return undefined;
  if (segment.type === "condition" && segment.label && segment.text.trimStart().startsWith(segment.label))
    return segment.text.trimStart().slice(segment.label.length).trimStart();
  return segment.text;
}

function validAnchors(segments: QuestionContentSegment[], annotation: TextRangeAnnotation) {
  return Boolean(annotation.canonicalAnchors?.length) && annotation.canonicalAnchors!.every(anchor => {
    const matches = segments.filter(segment => segment.id === anchor.segmentId && canonicalAnnotationText(segment) !== undefined);
    const text = matches.length === 1 ? canonicalAnnotationText(matches[0]) : undefined;
    return text !== undefined && Number.isInteger(anchor.start) && Number.isInteger(anchor.end) && anchor.start >= 0 && anchor.end > anchor.start && anchor.end <= text.length;
  });
}

/** Legacy anchors are usable only when all their ranges identify exactly one question. */
export function canonicalAnnotationOwner(annotation: TextRangeAnnotation, context: CanonicalAnnotationContext): string | undefined {
  const candidates = context.questions.filter(question => (!annotation.canonicalQuestionKey || annotation.canonicalQuestionKey === question.key)
    && validAnchors(question.segments, annotation));
  return candidates.length === 1 ? candidates[0].key : undefined;
}


export function getEntryCanonicalAnnotationContext(entry: Parameters<typeof getEntryQuestions>[0], number?: string, section?: string): CanonicalAnnotationContext {
  const questions = getEntryQuestions(entry);
  const matches = number ? questions.filter(question => normalizeQuestionNumber(question.questionNumber) === normalizeQuestionNumber(number) && (section === undefined || question.section?.trim() === section.trim())) : questions;
  return matches.length === 1 ? createCanonicalAnnotationContext(questions, matches[0]) : { questions: questions.map(question => ({ key: canonicalQuestionKey(question), segments: question.contentSegments ?? [] })) };
}
