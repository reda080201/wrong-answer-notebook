import { v4 as uuidv4 } from "uuid";
import type { QuestionBlock } from "./textLayout";
import { parseQuestionText } from "./textLayout";
import type { MistakeCauseType, QuestionMeta, ReviewEvent, ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
import { normalizeDifficultyScore } from "./difficulty";
import { calculateNextReview } from "./review";
import { isMistakeCauseType, isReviewStrategy, normalizeMistakeAnalysis } from "./mistakeAnalysis";

export function normalizeQuestionNumber(value: string | number | undefined | null): string {
  const raw = `${value ?? ""}`.trim();
  const normalized = raw
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .replace(/^#/, "")
    .replace(/^(?:문제|문항)\s*/i, "")
    .replace(/\s*(?:[.)]|번)\s*$/, "")
    .replace(/^0+(?=\d)/, "")
    .trim();
  return normalized || raw;
}

function isReviewResult(value: unknown): value is ReviewResult {
  return value === "again" || value === "hard" || value === "good";
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export function normalizeQuestionReview(raw: unknown): ReviewState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ReviewState>;
  const historySource = Array.isArray(value.history) ? value.history : [];
  const history: ReviewEvent[] = historySource
    .filter((event) => Boolean(event && typeof event === "object"))
    .map((event) => event as Partial<ReviewEvent>)
    .map((event) => ({
      id: event.id || uuidv4(),
      reviewedAt: isValidIsoDate(event.reviewedAt) ? event.reviewedAt : new Date().toISOString(),
      result: isReviewResult(event.result) ? event.result : "again",
      nextDueAt: event.nextDueAt === null || isValidIsoDate(event.nextDueAt) ? event.nextDueAt : null,
      intervalDays: typeof event.intervalDays === "number" && event.intervalDays >= 0 ? event.intervalDays : 1,
      causeSnapshot: Array.isArray(event.causeSnapshot)
        ? event.causeSnapshot.filter(isMistakeCauseType)
        : undefined,
      strategy: isReviewStrategy(event.strategy) ? event.strategy : undefined,
      stabilityDays:
        typeof event.stabilityDays === "number" && event.stabilityDays > 0
          ? event.stabilityDays
          : undefined,
      memoryDifficulty:
        typeof event.memoryDifficulty === "number" && event.memoryDifficulty >= 1
          ? Math.min(10, event.memoryDifficulty)
          : undefined,
      lapseCount:
        typeof event.lapseCount === "number" && event.lapseCount >= 0
          ? Math.floor(event.lapseCount)
          : undefined,
    }));

  return {
    dueAt: value.dueAt === null || isValidIsoDate(value.dueAt) ? value.dueAt : null,
    lastReviewedAt: isValidIsoDate(value.lastReviewedAt) ? value.lastReviewedAt : undefined,
    intervalDays: typeof value.intervalDays === "number" && value.intervalDays >= 0 ? value.intervalDays : 0,
    streak: typeof value.streak === "number" && value.streak >= 0 ? Math.floor(value.streak) : 0,
    history,
    stabilityDays:
      typeof value.stabilityDays === "number" && value.stabilityDays > 0
        ? value.stabilityDays
        : Math.max(0.5, typeof value.intervalDays === "number" ? value.intervalDays : 0),
    memoryDifficulty:
      typeof value.memoryDifficulty === "number" && value.memoryDifficulty >= 1
        ? Math.min(10, value.memoryDifficulty)
        : 5,
    lapseCount:
      typeof value.lapseCount === "number" && value.lapseCount >= 0
        ? Math.floor(value.lapseCount)
        : history.filter((event) => event.result === "again").length,
    preLapseStabilityDays:
      typeof value.preLapseStabilityDays === "number" && value.preLapseStabilityDays > 0
        ? value.preLapseStabilityDays
        : undefined,
    relearningStep:
      value.relearningStep === 0 || value.relearningStep === 1
        ? value.relearningStep
        : undefined,
    repetitionCount:
      typeof value.repetitionCount === "number" && value.repetitionCount >= 0
        ? Math.floor(value.repetitionCount)
        : history.length,
    phase:
      value.phase === "learning" || value.phase === "relearning" || value.phase === "long_term" || value.phase === "archived"
        ? value.phase
        : "learning",
  };
}

export function normalizeQuestionMeta(raw: unknown): QuestionMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<QuestionMeta>)
    .map((item) => ({
      questionNumber: normalizeQuestionNumber(item.questionNumber),
      important: Boolean(item.important),
      needsReview: Boolean(item.needsReview),
      difficultyScore: normalizeDifficultyScore(item.difficultyScore),
      bookmarkLabel: item.bookmarkLabel ? `${item.bookmarkLabel}`.trim() : undefined,
      note: item.note ? `${item.note}`.trim() : undefined,
      mistakeAnalysis: item.mistakeAnalysis
        ? normalizeMistakeAnalysis(item.mistakeAnalysis)
        : undefined,
      review: normalizeQuestionReview(item.review),
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
  const answerNeedsReview = normalizeQuestionMeta(entry.questionMeta).filter((item) => item.needsReview).length;
  const missing = entry.importAudit?.missingQuestionNumbers.length ?? 0;
  const due = entry.review?.dueAt && new Date(entry.review.dueAt).getTime() <= Date.now() ? 1 : 0;
  const questionDue = normalizeQuestionMeta(entry.questionMeta).filter(
    (meta) => meta.review?.dueAt && new Date(meta.review.dueAt).getTime() <= Date.now(),
  ).length;
  return answerNeedsReview + missing + due + questionDue;
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

export function applyQuestionReviewResult(
  current: QuestionMeta[] | undefined,
  questionNumber: string | number,
  result: ReviewResult,
  reviewedAt = new Date(),
  cause?: MistakeCauseType,
): QuestionMeta[] {
  const normalized = normalizeQuestionNumber(questionNumber);
  const items = normalizeQuestionMeta(current);
  const index = items.findIndex(
    (item) => normalizeQuestionNumber(item.questionNumber) === normalized,
  );
  const previous = index >= 0 ? items[index].review : undefined;
  const currentCause = cause ?? items[index ?? -1]?.mistakeAnalysis?.primaryCause;
  const next = calculateNextReview(previous, result, reviewedAt, currentCause);
  const event: ReviewEvent = {
    id: uuidv4(),
    reviewedAt: reviewedAt.toISOString(),
    result,
    nextDueAt: next.nextDueAt,
    intervalDays: next.intervalDays,
    causeSnapshot: currentCause ? [currentCause] : undefined,
    stabilityDays: next.stabilityDays,
    memoryDifficulty: next.memoryDifficulty,
    lapseCount: next.lapseCount,
  };
  const review: ReviewState = {
    dueAt: next.nextDueAt,
    lastReviewedAt: event.reviewedAt,
    intervalDays: next.intervalDays,
    streak: next.streak,
    history: [...(previous?.history ?? []), event],
    stabilityDays: next.stabilityDays,
    memoryDifficulty: next.memoryDifficulty,
    lapseCount: next.lapseCount,
    repetitionCount: next.repetitionCount,
    phase: next.phase,
    preLapseStabilityDays: next.preLapseStabilityDays,
    relearningStep: next.relearningStep,
  };
  const nextMeta: QuestionMeta = {
    ...(index >= 0 ? items[index] : { important: false }),
    questionNumber: normalized,
    needsReview: false,
    review,
    updatedAt: reviewedAt.toISOString(),
  };
  if (index >= 0) {
    return items.map((item, itemIndex) => (itemIndex === index ? nextMeta : item));
  }
  return [...items, nextMeta];
}
