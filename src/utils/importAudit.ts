import type { EntryFormData, ImportAudit, SheetAnswerItem, SheetFigureItem } from "../types";
import { parseQuestionText } from "./textLayout";

export function normalizeImportQuestionNumber(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  return raw.replace(/^#/, "").replace(/^(?:문제|문항)\s*/, "").replace(/[.)번]\s*$/, "").replace(/^0+(?=\d)/, "").trim();
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
    const rangeMatch = part.match(/^(.+?)-(.+)$/);
    if (rangeMatch) {
      const start = Number(normalizeImportQuestionNumber(rangeMatch[1]));
      const end = Number(normalizeImportQuestionNumber(rangeMatch[2]));
      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        return { numbers: [], error: "예상 문제 번호 범위를 읽지 못했습니다. 예: 1-20" };
      }
      if (start > end) {
        return { numbers: [], error: "예상 문제 번호 범위는 작은 번호에서 큰 번호 순서로 입력해 주세요." };
      }
      for (let current = start; current <= end; current += 1) {
        numbers.push(String(current));
      }
      continue;
    }

    const normalized = normalizeImportQuestionNumber(part);
    if (!/^\d+$/.test(normalized)) {
      return { numbers: [], error: "예상 문제 번호는 숫자, 쉼표, 범위만 사용할 수 있습니다. 예: 1-20 또는 1,2,3,5" };
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

function detectedNumbers(question: string): string[] {
  return [...new Set(parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .map((block) => normalizeImportQuestionNumber(block.numberLabel) || String(block.displayNumber))
    .filter(Boolean))];
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
  const detected = detectedNumbers(data.question ?? "");
  const expected = normalizeNumberList(source.expectedQuestionNumbers);
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
