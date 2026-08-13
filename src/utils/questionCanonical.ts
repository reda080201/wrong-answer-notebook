import type { StructuredQuestion, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionNumber";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { stripLegacyChoiceSeparator } from "./legacyChoiceSeparator";

export interface QuestionCanonicalDiagnostics {
  sources: Record<string, { numbers: string[]; duplicates: string[] }>;
  expectedNumbers: string[];
  missingStructuredNumbers: string[];
  recoverable: boolean;
  message?: string;
}

type CanonicalEntryLike = Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments"> & Partial<Pick<WrongAnswerEntry, "answerKey" | "questionMeta" | "figures">>;

export interface QuestionReconciliationResult<T extends CanonicalEntryLike = WrongAnswerEntry> {
  entry: T;
  repairedNumbers: string[];
  unresolvedNumbers: string[];
  changed: boolean;
}

function summarize(values: Array<string | undefined>): { numbers: string[]; duplicates: string[] } {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const number = normalizeQuestionNumber(value ?? "");
    if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
  });
  return {
    numbers: [...counts.keys()],
    duplicates: [...counts].filter(([, count]) => count > 1).map(([number]) => number),
  };
}

function flatBlocks(entry: Pick<WrongAnswerEntry, "question">): QuestionBlock[] {
  return parseQuestionText(entry.question).filter((block): block is QuestionBlock => block.kind === "question");
}

export function diagnoseQuestionSources(entry: CanonicalEntryLike): QuestionCanonicalDiagnostics {
  const flat = flatBlocks(entry);
  const sources = {
    answerKey: summarize((entry.answerKey ?? []).map((item) => item.questionNumber)),
    structuredQuestions: summarize((entry.structuredQuestions ?? []).map((item) => item.questionNumber)),
    questionContentSegments: summarize(Object.keys(entry.questionContentSegments ?? {})),
    questionMeta: summarize((entry.questionMeta ?? []).map((item) => item.questionNumber)),
    compatibilityText: summarize(flat.map((item) => item.numberLabel ?? String(item.displayNumber))),
  };
  const corroboratingNumbers = [
    ...sources.answerKey.numbers,
    ...sources.questionMeta.numbers,
    ...sources.questionContentSegments.numbers,
  ];
  const expectedNumbers = corroboratingNumbers.length
    ? [...new Set([...corroboratingNumbers, ...sources.compatibilityText.numbers])]
    : [...sources.structuredQuestions.numbers];
  const structured = new Set(sources.structuredQuestions.numbers);
  const missingStructuredNumbers = expectedNumbers.filter((number) => !structured.has(number));
  const flatCounts = new Map<string, number>();
  flat.forEach((block) => {
    const number = normalizeQuestionNumber(block.numberLabel ?? String(block.displayNumber));
    if (number && block.body.trim()) flatCounts.set(number, (flatCounts.get(number) ?? 0) + 1);
  });
  const recoverable = missingStructuredNumbers.every((number) => flatCounts.get(number) === 1);
  return {
    sources,
    expectedNumbers,
    missingStructuredNumbers,
    recoverable,
    message: missingStructuredNumbers.length && !recoverable
      ? `구조화 문항 ${sources.structuredQuestions.numbers.length} / 기대 문항 ${expectedNumbers.length} — 재가져오기가 필요합니다.`
      : undefined,
  };
}

function structuredFromBlock(entry: CanonicalEntryLike, block: QuestionBlock): StructuredQuestion {
  const number = normalizeQuestionNumber(block.numberLabel ?? String(block.displayNumber));
  const segments = entry.questionContentSegments?.[number] ?? block.bodySegments.map((segment, index) => ({
    id: `recovered-${number}-${index + 1}`,
    type: segment.kind === "condition" ? "condition" as const : "text" as const,
    text: segment.text,
    ...(segment.kind === "condition" && segment.label ? { label: segment.label } : {}),
  }));
  return {
    questionNumber: number,
    questionText: block.body,
    conditions: block.bodySegments.filter((segment) => segment.kind === "condition").map((segment) => segment.text),
    equations: [],
    choices: block.choices.map((choice) => stripLegacyChoiceSeparator(`${choice.marker} ${choice.text}`.trim())),
    contentSegments: structuredClone(segments),
    figureIds: (entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber ?? "") === number).map((figure) => figure.id),
    needsReview: true,
    warning: "기존 호환 본문에서 복구된 문항입니다. 원문을 확인하세요.",
  };
}

export function reconcileEntryQuestions<T extends CanonicalEntryLike>(entry: T): QuestionReconciliationResult<T> {
  const diagnostics = diagnoseQuestionSources(entry);
  if (!entry.structuredQuestions?.length || !diagnostics.missingStructuredNumbers.length) {
    return { entry, repairedNumbers: [], unresolvedNumbers: [], changed: false };
  }
  const blocksByNumber = new Map<string, QuestionBlock[]>();
  flatBlocks(entry).forEach((block) => {
    const number = normalizeQuestionNumber(block.numberLabel ?? String(block.displayNumber));
    if (!number || !block.body.trim()) return;
    blocksByNumber.set(number, [...(blocksByNumber.get(number) ?? []), block]);
  });
  const repairedNumbers: string[] = [];
  const unresolvedNumbers: string[] = [];
  const additions: StructuredQuestion[] = [];
  diagnostics.missingStructuredNumbers.forEach((number) => {
    const candidates = blocksByNumber.get(number) ?? [];
    if (candidates.length !== 1) {
      unresolvedNumbers.push(number);
      return;
    }
    repairedNumbers.push(number);
    additions.push(structuredFromBlock(entry, candidates[0]));
  });
  if (!additions.length) return { entry, repairedNumbers, unresolvedNumbers, changed: false };
  const order = new Map(diagnostics.sources.compatibilityText.numbers.map((number, index) => [number, index]));
  const structuredQuestions = [...entry.structuredQuestions, ...additions].sort((left, right) =>
    (order.get(normalizeQuestionNumber(left.questionNumber)) ?? Number.MAX_SAFE_INTEGER) -
    (order.get(normalizeQuestionNumber(right.questionNumber)) ?? Number.MAX_SAFE_INTEGER));
  return { entry: { ...entry, structuredQuestions }, repairedNumbers, unresolvedNumbers, changed: true };
}
