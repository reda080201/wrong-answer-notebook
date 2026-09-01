import type { ProcessingStatus, QuestionContentSegment, StructuredQuestion, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionNumber";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { isMultipleChoiceQuestion } from "./structuredQuestionType";
import { stripLegacyChoiceSeparator } from "./legacyChoiceSeparator";
import { reconcileEntryQuestions } from "./questionCanonical";

export interface ResolvedEntryQuestion {
  /** Stable source identity. Never use position as a persistence key. */
  questionNumber: string;
  /** One-based order within this entry, for navigation only. */
  position: number;
  section?: string;
  questionType?: StructuredQuestion["questionType"];
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
  contentSegments?: QuestionContentSegment[];
  needsReview?: boolean;
  processingStatus?: ProcessingStatus;
  points?: number;
  warning?: string;
  figureIds: string[];
  source?: StructuredQuestion["source"];
}

function cloneSegments(segments: QuestionContentSegment[]): QuestionContentSegment[] {
  return segments.map((segment) => {
    if (segment.type === "table") return { ...segment, rows: segment.rows.map((row) => [...row]) };
    return { ...segment };
  });
}

const EMPTY_MULTIPLE_CHOICE_WARNING = "객관식 문항에 선택지가 없어 검토가 필요합니다.";

function normalizedSegmentContent(segment: QuestionContentSegment): string[] {
  if (segment.type === "condition" || segment.type === "text") return [segment.text];
  if (segment.type === "equation") return [segment.latex];
  if (segment.type === "table") return segment.rows.flat();
  return [];
}

function sameContent(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function appendMissingSemanticSegments(
  question: Pick<StructuredQuestion, "conditions" | "equations" | "contentSegments">,
): QuestionContentSegment[] {
  const segments = cloneSegments(question.contentSegments);
  const usedIds = new Set(segments.map((segment) => segment.id));
  let conditionIndex = 0;
  let equationIndex = 0;

  const append = (type: "condition" | "equation", content: string) => {
    if (!content.trim()) return;
    if (segments.some((segment) => normalizedSegmentContent(segment).some((value) => sameContent(value, content)))) return;
    const prefix = type === "condition" ? "condition" : "equation";
    const ordinal = type === "condition" ? ++conditionIndex : ++equationIndex;
    let id = `${prefix}-${ordinal}`;
    let suffix = ordinal;
    while (usedIds.has(id)) id = `${prefix}-${++suffix}`;
    usedIds.add(id);
    segments.push(type === "condition"
      ? { id, type, text: content }
      : { id, type, latex: content, display: true });
  };

  question.conditions.forEach((condition) => append("condition", condition));
  question.equations.forEach((equation) => append("equation", equation));
  return segments;
}

function projectStructuredQuestion(question: StructuredQuestion, index: number): ResolvedEntryQuestion {
  const isEmptyMultipleChoice = isMultipleChoiceQuestion(question.questionType, question.choices)
    && question.choices.length === 0;
  const warning = isEmptyMultipleChoice
    ? [question.warning, EMPTY_MULTIPLE_CHOICE_WARNING].filter((value, index, values) => value && values.indexOf(value) === index).join(" ")
    : question.warning;
  return {
    questionNumber: normalizeQuestionNumber(question.questionNumber) || question.questionNumber,
    position: index + 1,
    section: question.section,
    questionType: question.questionType,
    questionText: question.questionText,
    conditions: [...question.conditions],
    equations: [...question.equations],
    choices: [...question.choices],
    contentSegments: appendMissingSemanticSegments(question),
    needsReview: Boolean(question.needsReview || isEmptyMultipleChoice),
    processingStatus: question.processingStatus,
    points: question.points,
    warning,
    figureIds: [...question.figureIds],
    source: question.source ? structuredClone(question.source) : undefined,
  };
}

export function getEntryQuestions(entry: Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments"> & Partial<Pick<WrongAnswerEntry, "answerKey" | "questionMeta" | "figures">>): ResolvedEntryQuestion[] {
  const canonical = reconcileEntryQuestions(entry).entry;
  if (canonical.structuredQuestions?.length) {
    return canonical.structuredQuestions.map((question, index) => projectStructuredQuestion({ ...question, choices: question.choices.map(stripLegacyChoiceSeparator) }, index));
  }

  return parseQuestionText(canonical.question)
    .filter((block): block is QuestionBlock => block.kind === "question")
    .map((block, index) => {
      const number = normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber ?? index + 1));
      return {
        questionNumber: number || String(index + 1),
        position: index + 1,
        conditions: [],
        equations: [],
        questionText: block.body,
        choices: block.choices.map((choice) => stripLegacyChoiceSeparator(`${choice.marker} ${choice.text}`.trim())),
        contentSegments: number && canonical.questionContentSegments?.[number]
          ? cloneSegments(canonical.questionContentSegments[number])
          : undefined,
        figureIds: [],
      };
    });
}

/**
 * Transitional adapter for legacy consumers that still expect QuestionBlock.
 * Structured entries retain their source number in both identity fields; the
 * positional index is deliberately kept only in ResolvedEntryQuestion.position.
 */
export function resolvedQuestionToBlock(question: ResolvedEntryQuestion): QuestionBlock {
  const bodySegments = question.contentSegments
    ?.filter((segment): segment is Extract<QuestionContentSegment, { type: "text" | "condition" | "equation" }> =>
      segment.type === "text" || segment.type === "condition" || segment.type === "equation",
    )
    .map((segment, index) => ({
      kind: segment.type === "condition" ? "condition" as const : "body" as const,
      text: segment.type === "equation" ? segment.latex : segment.text,
      label: segment.type === "condition" ? segment.label : undefined,
      start: index,
      end: index + (segment.type === "equation" ? segment.latex.length : segment.text.length),
    }))
    ?? [{ kind: "body" as const, text: question.questionText, start: 0, end: question.questionText.length }];
  const body = bodySegments.map((segment) => segment.text).filter(Boolean).join("\n") || question.questionText;
  const base = question.position * 100_000;
  return {
    kind: "question",
    numberLabel: question.questionNumber,
    displayNumber: Number(question.questionNumber) || question.position,
    body,
    bodyStart: base,
    bodyEnd: base + body.length,
    start: base,
    end: base + body.length,
    bodySegments: bodySegments.map((segment, index) => ({ ...segment, start: base + index, end: base + index + segment.text.length })),
    choices: question.choices.map((choice, index) => {
      const match = choice.match(/^\s*([①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,2}\)?[.)]?)\s*(.*)$/);
      return {
        marker: match?.[1] || String(index + 1),
        text: match?.[2] || choice,
        start: base + body.length + index,
        end: base + body.length + index + choice.length,
      };
    }),
  };
}

export function renderStructuredQuestionsCompatibilityText(questions: StructuredQuestion[]): string {
  return questions.map((question) => {
    const heading = `${question.questionNumber}. ${question.questionText}`.trim();
    const conditions = question.conditions.map((item) => item.trim()).filter(Boolean);
    const equations = question.equations.map((item) => item.trim()).filter(Boolean);
    const choices = question.choices.map((item) => item.trim()).filter(Boolean);
    return [heading, ...conditions, ...equations, ...choices].filter(Boolean).join("\n");
  }).join("\n\n");
}
