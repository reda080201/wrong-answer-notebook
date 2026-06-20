import type { EntryFormData, ImportAudit, SheetAnswerItem, SheetFigureItem } from "../types";
import { parseQuestionText } from "./textLayout";

export function normalizeImportQuestionNumber(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  return raw.replace(/^#/, "").replace(/^(?:문제|문항)\s*/, "").replace(/[.)번]\s*$/, "").replace(/^0+(?=\d)/, "").trim();
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
