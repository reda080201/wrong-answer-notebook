import type { QuestionContentSegment, StructuredQuestion, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionMeta";
import { parseQuestionText, type QuestionBlock } from "./textLayout";

export interface ResolvedEntryQuestion {
  questionNumber: string;
  section?: string;
  questionType?: string;
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
  contentSegments?: QuestionContentSegment[];
  needsReview?: boolean;
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

function projectStructuredQuestion(question: StructuredQuestion): ResolvedEntryQuestion {
  const isEmptyMultipleChoice = question.questionType === "multiple_choice" && question.choices.length === 0;
  const warning = isEmptyMultipleChoice
    ? [question.warning, EMPTY_MULTIPLE_CHOICE_WARNING].filter((value, index, values) => value && values.indexOf(value) === index).join(" ")
    : question.warning;
  return {
    questionNumber: normalizeQuestionNumber(question.questionNumber) || question.questionNumber,
    section: question.section,
    questionType: question.questionType,
    questionText: question.questionText,
    conditions: [...question.conditions],
    equations: [...question.equations],
    choices: [...question.choices],
    contentSegments: appendMissingSemanticSegments(question),
    needsReview: Boolean(question.needsReview || isEmptyMultipleChoice),
    points: question.points,
    warning,
    figureIds: [...question.figureIds],
    source: question.source ? structuredClone(question.source) : undefined,
  };
}

export function getEntryQuestions(entry: Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments">): ResolvedEntryQuestion[] {
  if (entry.structuredQuestions?.length) {
    return entry.structuredQuestions.map(projectStructuredQuestion);
  }

  return parseQuestionText(entry.question)
    .filter((block): block is QuestionBlock => block.kind === "question")
    .map((block, index) => {
      const number = normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber ?? index + 1));
      return {
        questionNumber: number || String(index + 1),
        conditions: [],
        equations: [],
        questionText: block.body,
        choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim()),
        contentSegments: number && entry.questionContentSegments?.[number]
          ? cloneSegments(entry.questionContentSegments[number])
          : undefined,
        figureIds: [],
      };
    });
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
