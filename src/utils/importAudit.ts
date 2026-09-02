import type { EntryFormData, ImportAudit, ImportRejectedItem, SheetAnswerItem, SheetFigureItem, StructuredQuestion, QuestionContentSegment } from "../types";
import { parseQuestionText } from "./textLayout";
import { normalizeQuestionNumber } from "./questionMeta";
import { isMultipleChoiceQuestion, normalizeStructuredQuestionType } from "./structuredQuestionType";

export function normalizeImportQuestionNumber(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return normalizeQuestionNumber(String(value));
}

export interface ExpectedQuestionNumberParseResult {
  numbers: string[];
  error?: string;
}

export function parseExpectedQuestionNumbers(input: string): ExpectedQuestionNumberParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { numbers: [] };
  const numbers: string[] = [];
  const parts = trimmed.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const numericRangeMatch = part.match(/^(0*\d+)-(0*\d+)$/);
    if (numericRangeMatch) {
      const start = Number(normalizeImportQuestionNumber(numericRangeMatch[1]));
      const end = Number(normalizeImportQuestionNumber(numericRangeMatch[2]));
      if (start > end) {
        return { numbers: [], error: "예상 문제 번호 범위는 작은 번호에서 큰 번호 순서로 입력해 주세요." };
      }
      for (let current = start; current <= end; current += 1) {
        numbers.push(String(current));
      }
      continue;
    }

    const rangeMatch = part.match(/^(.+)-(.+)$/);
    if (rangeMatch) {
      const normalized = normalizeImportQuestionNumber(part);
      const hyphenCount = (normalized.match(/-/g) ?? []).length;
      if (hyphenCount !== 1 || /^\d/.test(normalized)) {
        return { numbers: [], error: "특수 문제 번호는 A-1, Ⅰ-1처럼 하나씩 입력해 주세요. 특수 범위 자동 생성은 지원하지 않습니다." };
      }
      if (!normalized || normalized.endsWith("-")) {
        return { numbers: [], error: "예상 문제 번호를 읽지 못했습니다. 예: 1-20 또는 A-1, A-2" };
      }
      numbers.push(normalized);
      continue;
    }

    const normalized = normalizeImportQuestionNumber(part);
    if (!normalized) {
      return { numbers: [], error: "예상 문제 번호를 읽지 못했습니다. 예: 1-20 또는 A-1, A-2" };
    }
    numbers.push(normalized);
  }

  return { numbers: [...new Set(numbers)] };
}

function normalizeNumberList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return [...new Set(values.map(normalizeImportQuestionNumber).filter(Boolean))];
}

export function normalizeRejectedNotes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

export function removeRejectedNotes(text: string, rejectedNotes: string[]): string {
  let result = text;
  for (const note of rejectedNotes) {
    if (note.length >= 3) result = result.replaceAll(note, "");
  }
  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function scrubRejectedNotesFromAnswers(answers: SheetAnswerItem[], rejectedNotes: string[]): SheetAnswerItem[] {
  return answers.map((item) => ({
    ...item,
    answer: removeRejectedNotes(item.answer, rejectedNotes),
    explanation: removeRejectedNotes(item.explanation, rejectedNotes),
    notes: removeRejectedNotes(item.notes ?? "", rejectedNotes),
    strategy: removeRejectedNotes(item.strategy ?? "", rejectedNotes),
    steps: item.steps?.map((step) => removeRejectedNotes(step, rejectedNotes)).filter(Boolean),
    choiceJudgements: item.choiceJudgements
      ?.map((judgement) => ({
        ...judgement,
        text: removeRejectedNotes(judgement.text, rejectedNotes),
      }))
      .filter((judgement) => judgement.text),
    wrongPoint: removeRejectedNotes(item.wrongPoint ?? "", rejectedNotes),
    reviewPoint: removeRejectedNotes(item.reviewPoint ?? "", rejectedNotes),
    sourceNote: removeRejectedNotes(item.sourceNote ?? "", rejectedNotes),
    importantPoints: item.importantPoints.map((point) => removeRejectedNotes(point, rejectedNotes)).filter(Boolean),
  }));
}

function missingChoicesWarning(warning: string | undefined): string {
  const message = "객관식 문항의 선택지가 없습니다.";
  if (!warning) return message;
  return warning.includes(message) ? warning : `${warning} ${message}`;
}

export function scrubRejectedNotesFromSegment(segment: QuestionContentSegment, rejectedNotes: string[]): QuestionContentSegment {
  if (segment.type === "text" || segment.type === "condition") {
    return {
      ...segment,
      text: removeRejectedNotes(segment.text, rejectedNotes),
      ...(segment.type === "condition" ? { label: segment.label ? removeRejectedNotes(segment.label, rejectedNotes) || undefined : undefined } : {}),
    };
  }
  if (segment.type === "equation") {
    return { ...segment, latex: removeRejectedNotes(segment.latex, rejectedNotes) };
  }
  if (segment.type === "table") {
    return { ...segment, rows: segment.rows.map((row) => row.map((cell) => removeRejectedNotes(cell, rejectedNotes))) };
  }
  return { ...segment };
}

export function scrubRejectedNotesFromContentSegments(
  segments: QuestionContentSegment[] | undefined,
  rejectedNotes: string[],
): QuestionContentSegment[] | undefined {
  return Array.isArray(segments)
    ? segments.map((segment) => scrubRejectedNotesFromSegment(segment, rejectedNotes))
    : segments;
}

export function scrubRejectedNotesFromContentSegmentMap(
  segments: Record<string, QuestionContentSegment[]> | undefined,
  rejectedNotes: string[],
): Record<string, QuestionContentSegment[]> | undefined {
  if (!segments || Array.isArray(segments)) return segments;
  return Object.fromEntries(
    Object.entries(segments).map(([questionNumber, questionSegments]) => [
      questionNumber,
      scrubRejectedNotesFromContentSegments(questionSegments, rejectedNotes) ?? [],
    ]),
  );
}

export function scrubRejectedNotesFromStructuredQuestions(
  questions: StructuredQuestion[],
  rejectedNotes: string[],
): StructuredQuestion[];
export function scrubRejectedNotesFromStructuredQuestions(
  questions: undefined,
  rejectedNotes: string[],
): undefined;
export function scrubRejectedNotesFromStructuredQuestions(
  questions: StructuredQuestion[] | undefined,
  rejectedNotes: string[],
): StructuredQuestion[] | undefined;
export function scrubRejectedNotesFromStructuredQuestions(
  questions: StructuredQuestion[] | undefined,
  rejectedNotes: string[],
): StructuredQuestion[] | undefined {
  if (!questions) return undefined;
  return questions.map((question) => {
    const questionType = normalizeStructuredQuestionType(question.questionType);
    const choices = question.choices
      .map((choice) => removeRejectedNotes(choice, rejectedNotes))
      .filter(Boolean);
    const missingChoices = isMultipleChoiceQuestion(questionType, choices) && choices.length === 0;
    return {
      ...question,
      section: question.section ? removeRejectedNotes(question.section, rejectedNotes) || undefined : undefined,
      questionType,
      questionText: removeRejectedNotes(question.questionText, rejectedNotes),
      conditions: question.conditions.map((item) => removeRejectedNotes(item, rejectedNotes)).filter(Boolean),
      equations: question.equations.map((item) => removeRejectedNotes(item, rejectedNotes)).filter(Boolean),
      choices,
      contentSegments: question.contentSegments.map((segment) => scrubRejectedNotesFromSegment(segment, rejectedNotes)),
      source: question.source
        ? {
            ...question.source,
            title: question.source.title ? removeRejectedNotes(question.source.title, rejectedNotes) || undefined : undefined,
            reference: question.source.reference ? removeRejectedNotes(question.source.reference, rejectedNotes) || undefined : undefined,
          }
        : undefined,
      needsReview: Boolean(question.needsReview) || missingChoices,
      warning: missingChoices
        ? missingChoicesWarning(question.warning ? removeRejectedNotes(question.warning, rejectedNotes) || undefined : undefined)
        : question.warning ? removeRejectedNotes(question.warning, rejectedNotes) || undefined : undefined,
      figureIds: [...question.figureIds],
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsIdentifier(text: string, identifier: string): boolean {
  if (!identifier) return false;
  const escaped = escapeRegExp(identifier);
  return new RegExp(`(^|[^0-9A-Za-z가-힣])${escaped}([^0-9A-Za-z가-힣]|$)`, "i").test(text.replace(/[ \t]+/g, ""));
}

function regexDetectedNumbers(question: string): string[] {
  const numbers: string[] = [];
  const pattern = /(?:^|[\n\r])\s*(?:\[\s*)?(?:문제\s*)?#?(\d{1,3})(?:\s*\])?\s*(?:[.)]|번)/g;
  for (const match of question.matchAll(pattern)) {
    const normalized = normalizeImportQuestionNumber(match[1]);
    if (normalized) numbers.push(normalized);
  }
  return numbers;
}

function detectedNumbers(question: string, expected: string[] = [], rawDetected: unknown = []): string[] {
  const detected = parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .map((block) => normalizeImportQuestionNumber(block.numberLabel))
    .filter(Boolean);
  detected.push(...normalizeNumberList(rawDetected));
  detected.push(...regexDetectedNumbers(question));
  for (const number of expected) {
    if (!/^\d+$/.test(number) && containsIdentifier(question, number)) {
      detected.push(number);
    }
  }
  return [...new Set(detected)];
}

function calculateNeedsReviewCount(
  answers: SheetAnswerItem[],
  figures: SheetFigureItem[],
  missing: string[],
  uncertain: string[],
  structuredQuestions: StructuredQuestion[] = [],
): number {
  const reviewKeys = new Set<string>();
  missing.forEach((number) => reviewKeys.add(`question:${number}`));
  uncertain.forEach((number) => reviewKeys.add(`question:${number}`));
  answers.forEach((item, index) => {
    if (item.needsReview) reviewKeys.add(item.questionNumber ? `question:${normalizeImportQuestionNumber(item.questionNumber)}` : `answer:${index}`);
  });
  figures.forEach((figure, index) => {
    if (figure.needsReview || !figure.image) reviewKeys.add(figure.questionNumber ? `question:${normalizeImportQuestionNumber(figure.questionNumber)}` : `figure:${index}`);
  });
  structuredQuestions.forEach((item) => {
    if (item.needsReview) reviewKeys.add(`question:${normalizeImportQuestionNumber(item.questionNumber)}`);
  });
  return reviewKeys.size;
}

export function normalizeImportAudit(
  raw: unknown,
  data: Pick<Partial<EntryFormData>, "question" | "answerKey" | "figures" | "structuredQuestions">,
): ImportAudit {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<ImportAudit> : {};
  const expected = normalizeNumberList(source.expectedQuestionNumbers);
  const structuredQuestions = Array.isArray(data.structuredQuestions)
    ? data.structuredQuestions.filter((item): item is StructuredQuestion => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : undefined;
  const detected = structuredQuestions
    ? [...new Set(structuredQuestions.map((item) => normalizeImportQuestionNumber(item.questionNumber)).filter(Boolean))]
    : detectedNumbers(data.question ?? "", expected, source.detectedQuestionNumbers);
  const uncertain = normalizeNumberList(source.uncertainQuestionNumbers);
  const detectedSet = new Set(detected);
  const explicitMissing = normalizeNumberList(source.missingQuestionNumbers);
  const missingSource = explicitMissing.length ? explicitMissing : expected;
  const missing = missingSource.filter((number) => expected.includes(number) && !detectedSet.has(number));
  const answers = data.answerKey ?? [];
  const figures = data.figures ?? [];
  return {
    expectedQuestionNumbers: expected.length ? expected : detected,
    detectedQuestionNumbers: detected,
    missingQuestionNumbers: missing,
    uncertainQuestionNumbers: uncertain,
    handwritingExcluded: source.handwritingExcluded === true,
    needsReviewCount: calculateNeedsReviewCount(answers, figures, missing, uncertain, structuredQuestions ?? []),
    rejectedItems: Array.isArray(source.rejectedItems)
      ? source.rejectedItems.filter((item): item is ImportRejectedItem => Boolean(
        item && typeof item === "object" &&
        (((item as { kind?: unknown }).kind === "structured_question") || ((item as { kind?: unknown }).kind === "answer") || ((item as { kind?: unknown }).kind === "figure")) &&
        typeof (item as { reason?: unknown }).reason === "string",
      ))
      : undefined,
  };
}
