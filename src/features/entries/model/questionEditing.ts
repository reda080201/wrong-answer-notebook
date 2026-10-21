import type { EntryFormData, StructuredQuestion } from "../../../types";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import { updateQuestionCompatibilityText } from "../../../utils/questionCompatibility";
import { parseQuestionText } from "../../../utils/textLayout";
import { canonicalAnnotationOwner, canonicalAnnotationText, canonicalQuestionKey } from "../../../utils/canonicalAnnotations";
import { normalizeQuestionPresentationSegments } from "../../../utils/questionPresentation";
import { projectStructuredSemanticFields } from "../../import/services/structuredQuestionSegments";
import { resolveGeneratedWrongAnswerContent } from "../../../utils/generatedWrongAnswerContent";

const reviewMessage = "문항 또는 기존 필기의 연결이 모호합니다. 원문과 필기를 확인한 뒤 다시 수정해 주세요.";

/** Use the same normalized flow as study; retain stored identities and source fields. */
export function editableEntryQuestions(data: EntryFormData): StructuredQuestion[] {
  if (!data.structuredQuestions?.length && !Object.keys(data.questionContentSegments ?? {}).length) return [];
  if (hasAmbiguousEntryQuestionData(data)) return structuredClone(data.structuredQuestions ?? []);
  const resolved = getEntryQuestions(data);
  const blocks = parseQuestionText(data.question).filter(block => block.kind === "question");
  return resolved.map(question => {
    const stored = data.structuredQuestions?.filter(item => normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(question.questionNumber));
    const segmentKeys = Object.keys(data.questionContentSegments ?? {}).filter(key => normalizeQuestionNumber(key) === normalizeQuestionNumber(question.questionNumber));
    const legacy = blocks.filter(block => normalizeQuestionNumber(block.numberLabel ?? String(block.displayNumber)) === normalizeQuestionNumber(question.questionNumber));
    const rawSegments = stored?.length === 1 ? stored[0].contentSegments
      : segmentKeys.length === 1 ? data.questionContentSegments![segmentKeys[0]] : question.contentSegments ?? [];
    // Consume only the compatibility occurrence represented by each ordered
    // figure anchor. Repeated anchors and unresolved tokens remain distinct.
    const withoutPlacedTokens = (value: string) => rawSegments.reduce((text, segment) => segment.type === "figure" ? text.replace(`[FIGURE:${segment.figureId}]`, "") : text, value);
    const baseSegments = normalizeQuestionPresentationSegments({
      questionText: withoutPlacedTokens(question.questionText), conditions: question.conditions, equations: question.equations, contentSegments: rawSegments,
    });
    const contentSegments = normalizeQuestionPresentationSegments({
      questionText: withoutPlacedTokens(legacy.length === 1 ? legacy[0].body : question.questionText),
      conditions: question.conditions, equations: question.equations, contentSegments: baseSegments,
    });
    return {
      ...(stored?.length === 1 ? stored[0] : undefined),
      questionNumber: stored?.length === 1 ? stored[0].questionNumber : segmentKeys.length === 1 ? segmentKeys[0] : question.questionNumber,
      section: question.section, questionType: question.questionType, points: question.points,
      ...projectStructuredSemanticFields(contentSegments),
      choices: [...question.choices], contentSegments,
      source: question.source, needsReview: question.needsReview, processingStatus: question.processingStatus,
      warning: question.warning, figureIds: [...question.figureIds],
    };
  });
}

export function hasAmbiguousQuestionIdentity(questions: StructuredQuestion[]): boolean {
  const keys = questions.map(question => normalizeQuestionNumber(question.questionNumber));
  return keys.some(key => !key) || new Set(keys).size !== keys.length;
}

export function hasAmbiguousEntryQuestionData(data: EntryFormData): boolean {
  const keys = Object.keys(data.questionContentSegments ?? {}).map(normalizeQuestionNumber);
  return hasAmbiguousQuestionIdentity(data.structuredQuestions ?? []) || keys.some(key => !key) || new Set(keys).size !== keys.length
    || Boolean(data.generatedFromExamSessionId && !data.structuredQuestions?.length && resolveGeneratedWrongAnswerContent(data).status === "ambiguous");
}

function movedRange(before: string, after: string, start: number, end: number) {
  if (before === after) return { start, end };
  if (start < 0 || end <= start || end > before.length) throw new Error(reviewMessage);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  if (end <= prefix) return { start, end };
  if (start >= before.length - suffix) return { start: start + after.length - before.length, end: end + after.length - before.length };
  const fragment = before.slice(start, end);
  const next = after.indexOf(fragment);
  if (before.indexOf(fragment) !== start || before.indexOf(fragment, start + 1) >= 0 || next < 0 || after.indexOf(fragment, next + 1) >= 0) throw new Error(reviewMessage);
  return { start: next, end: next + fragment.length };
}

/** Patch against the original draft, never a partially edited compatibility string. */
export function saveEntryQuestionEdits(original: EntryFormData, edited: EntryFormData): EntryFormData {
  const previous = editableEntryQuestions(original);
  const next = edited.structuredQuestions;
  if (hasAmbiguousEntryQuestionData(original)) {
    if (original.question !== edited.question || JSON.stringify(original.structuredQuestions) !== JSON.stringify(next)) throw new Error(reviewMessage);
    return edited;
  }
  if (!previous.length || !next) return edited;
  if (JSON.stringify(previous) === JSON.stringify(next)) {
    if (original.question !== edited.question) throw new Error(reviewMessage);
    return edited;
  }
  const segmentKeys = Object.keys(original.questionContentSegments ?? {}).map(normalizeQuestionNumber);
  const questionKeys = new Set(previous.map(item => normalizeQuestionNumber(item.questionNumber)));
  const singleGeneratedAlias = Boolean(original.generatedFromExamSessionId && !original.structuredQuestions?.length
    && previous.length === 1 && segmentKeys.length === 1 && resolveGeneratedWrongAnswerContent(original).status === "matched");
  if (hasAmbiguousQuestionIdentity(previous) || hasAmbiguousQuestionIdentity(next)
    || new Set(segmentKeys).size !== segmentKeys.length
    || (!singleGeneratedAlias && segmentKeys.some(key => !questionKeys.has(key)))
    || previous.length !== next.length || previous.some((question, index) => question.questionNumber !== next[index].questionNumber)) throw new Error(reviewMessage);

  // A generated snapshot may keep its original printed number in compatibility
  // prose while its canonical identity is the generated exam number.
  const blocks = parseQuestionText(original.question).filter(block => block.kind === "question");
  const generatedAlias = original.generatedFromExamSessionId && previous.length === 1 && blocks.length === 1 ? blocks[0].numberLabel ?? String(blocks[0].displayNumber) : undefined;
  const before = generatedAlias ? previous.map(question => ({ ...question, questionNumber: generatedAlias })) : previous;
  const after = generatedAlias ? next.map(question => ({ ...question, questionNumber: generatedAlias })) : next;
  const unnumbered = previous.length === 1 && blocks.length === 0 && original.question.trim();
  const prefix = unnumbered ? `${before[0].questionNumber}. ` : "";
  const result = updateQuestionCompatibilityText(prefix + original.question, after, before);
  if (result.unresolved.length) throw new Error(reviewMessage);
  const question = prefix ? result.text.slice(prefix.length) : result.text;
  const context = { questions: previous.map(item => ({ key: canonicalQuestionKey(item), segments: item.contentSegments })) };
  const annotations = (edited.annotations ?? []).map(annotation => {
    if (annotation.kind !== "text" || annotation.target !== "question") return annotation;
    if (!annotation.canonicalAnchors?.length) return { ...annotation, ...movedRange(original.question, question, annotation.start, annotation.end) };
    const owner = canonicalAnnotationOwner(annotation, context);
    const oldQuestion = previous.find(item => canonicalQuestionKey(item) === owner);
    const newQuestion = next.find(item => canonicalQuestionKey(item) === owner);
    // Already unresolved records remain available for review; do not guess.
    if (!oldQuestion || !newQuestion) return annotation;
    return { ...annotation, canonicalAnchors: annotation.canonicalAnchors.map(anchor => {
      const oldSegment = oldQuestion.contentSegments.find(segment => segment.id === anchor.segmentId);
      const newSegment = newQuestion.contentSegments.find(segment => segment.id === anchor.segmentId);
      const oldText = oldSegment && canonicalAnnotationText(oldSegment);
      const newText = newSegment && canonicalAnnotationText(newSegment);
      if (oldText === undefined || newText === undefined) throw new Error(reviewMessage);
      return { ...anchor, ...movedRange(oldText, newText, anchor.start, anchor.end) };
    }) };
  });
  return { ...edited, question, annotations, questionContentSegments: Object.fromEntries(next.map(item => [item.questionNumber, structuredClone(item.contentSegments)])) };
}
