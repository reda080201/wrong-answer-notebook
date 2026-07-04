import type { QuestionBlock } from "./textLayout";
import { parseQuestionText } from "./textLayout";
import type { QuestionMeta, WrongAnswerEntry } from "../types";

export function normalizeQuestionNumber(value: string | number | undefined | null): string {
  const raw = `${value ?? ""}`.trim();
  return raw
    .replace(/^#/, "")
    .replace(/^문제\s*/i, "")
    .replace(/[.)번]\s*$/, "")
    .replace(/^0+(?=\d)/, "")
    .trim();
}

export function normalizeQuestionMeta(raw: unknown): QuestionMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<QuestionMeta>)
    .map((item) => ({
      questionNumber: normalizeQuestionNumber(item.questionNumber),
      important: Boolean(item.important),
      bookmarkLabel: item.bookmarkLabel ? `${item.bookmarkLabel}`.trim() : undefined,
      note: item.note ? `${item.note}`.trim() : undefined,
      updatedAt:
        item.updatedAt && !Number.isNaN(new Date(item.updatedAt).getTime())
          ? item.updatedAt
          : new Date().toISOString(),
    }))
    .filter((item) => item.questionNumber);
}

export function getQuestionCount(entry: WrongAnswerEntry): number {
  if (entry.entryKind !== "problem_sheet") return 0;
  return parseQuestionText(entry.question).filter((block) => block.kind === "question").length;
}

export function getImportantQuestionCount(entry: WrongAnswerEntry): number {
  return normalizeQuestionMeta(entry.questionMeta).filter((meta) => meta.important).length;
}

export function getReviewNeedCount(entry: WrongAnswerEntry): number {
  const answerNeedsReview = (entry.answerKey ?? []).filter((item) => item.needsReview).length;
  const missing = entry.importAudit?.missingQuestionNumbers.length ?? 0;
  const due = entry.review?.dueAt && new Date(entry.review.dueAt).getTime() <= Date.now() ? 1 : 0;
  return answerNeedsReview + missing + due;
}

export function getQuestionMetaForBlock(
  entry: WrongAnswerEntry,
  block: QuestionBlock,
): QuestionMeta | undefined {
  const candidates = new Set([
    normalizeQuestionNumber(block.displayNumber),
    normalizeQuestionNumber(block.numberLabel),
  ]);
  return normalizeQuestionMeta(entry.questionMeta).find((meta) =>
    candidates.has(normalizeQuestionNumber(meta.questionNumber)),
  );
}

export function isQuestionImportant(entry: WrongAnswerEntry, block: QuestionBlock): boolean {
  return Boolean(getQuestionMetaForBlock(entry, block)?.important);
}

export function toggleQuestionImportant(
  current: QuestionMeta[] | undefined,
  questionNumber: string | number,
  now = new Date().toISOString(),
): QuestionMeta[] {
  const normalized = normalizeQuestionNumber(questionNumber);
  const items = normalizeQuestionMeta(current);
  const index = items.findIndex(
    (item) => normalizeQuestionNumber(item.questionNumber) === normalized,
  );
  if (index >= 0) {
    return items.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            important: !item.important,
            updatedAt: now,
          }
        : item,
    );
  }
  return [
    ...items,
    {
      questionNumber: normalized,
      important: true,
      updatedAt: now,
    },
  ];
}
