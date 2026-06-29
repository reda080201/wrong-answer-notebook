import type { EntryFormData, ImportAudit, SheetAnswerItem, SheetFigureItem } from "../types";
import { parseQuestionText } from "./textLayout";

export function normalizeImportQuestionNumber(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  const normalized = raw
    .replace(/^#/, "")
    .replace(/^(?:문제|문항)\s*/, "")
    .replace(/[.)번]\s*$/, "")
    .replace(/\s+/g, "")
    .trim();
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : normalized;
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
    sourceNote: removeRejectedNotes(item.sourceNote ?? "", rejectedNotes),
    importantPoints: item.importantPoints.map((point) => removeRejectedNotes(point, rejectedNotes)).filter(Boolean),
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsIdentifier(text: string, identifier: string): boolean {
  if (!identifier) return false;
  const escaped = escapeRegExp(identifier);
  return new RegExp(`(^|[^0-9A-Za-z가-힣])${escaped}([^0-9A-Za-z가-힣]|$)`, "i").test(text.replace(/[ \t]+/g, ""));
}

function detectedNumbers(question: string, expected: string[] = []): string[] {
  const detected = parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .map((block) => normalizeImportQuestionNumber(block.numberLabel) || String(block.displayNumber))
    .filter(Boolean);
  for (const number of expected) {
    if (!/^\d+$/.test(number) && containsIdentifier(question, number)) {
      detected.push(number);
    }
  }
  return [...new Set(detected)];
}

function calculateNeedsReviewCount(answers: SheetAnswerItem[], figures: SheetFigureItem[], missing: string[], uncertain: string[]): number {
  const reviewKeys = new Set<string>();
  missing.forEach((number) => reviewKeys.add(`question:${number}`));
  uncertain.forEach((number) => reviewKeys.add(`question:${number}`));
  answers.forEach((item, index) => {
    if (item.needsReview) reviewKeys.add(item.questionNumber ? `question:${normalizeImportQuestionNumber(item.questionNumber)}` : `answer:${index}`);
  });
  figures.forEach((figure, index) => {
    if (figure.needsReview || !figure.image) reviewKeys.add(figure.questionNumber ? `question:${normalizeImportQuestionNumber(figure.questionNumber)}` : `figure:${index}`);
  });
  return reviewKeys.size;
}

export function normalizeImportAudit(
  raw: unknown,
  data: Pick<Partial<EntryFormData>, "question" | "answerKey" | "figures">,
): ImportAudit {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<ImportAudit> : {};
  const expected = normalizeNumberList(source.expectedQuestionNumbers);
  const detected = detectedNumbers(data.question ?? "", expected);
  const uncertain = normalizeNumberList(source.uncertainQuestionNumbers);
  const detectedSet = new Set(detected);
  const missing = expected.filter((number) => !detectedSet.has(number));
  const answers = data.answerKey ?? [];
  const figures = data.figures ?? [];
  return {
    expectedQuestionNumbers: expected.length ? expected : detected,
    detectedQuestionNumbers: detected,
    missingQuestionNumbers: missing,
    uncertainQuestionNumbers: uncertain,
    handwritingExcluded: source.handwritingExcluded === true,
    needsReviewCount: calculateNeedsReviewCount(answers, figures, missing, uncertain),
  };
}
