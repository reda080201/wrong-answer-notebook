import { v4 as uuidv4 } from "uuid";
import type { QuestionBlock } from "./textLayout";
import { getEntryQuestions } from "./entryQuestions";
import type { MistakeCauseType, QuestionMeta, ReviewEvent, ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
import { normalizeDifficultyScore } from "./difficulty";
import { calculateNextReview } from "./reviewSchedule";
import { normalizeMistakeAnalysis } from "./mistakeAnalysis";
export { normalizeQuestionNumber } from "./questionNumber";
import { normalizeQuestionNumber } from "./questionNumber";
import { normalizeReviewState, isValidIsoDate } from "./reviewNormalization";
import { normalizeQuestionClassification } from "./questionClassification";

export function normalizeQuestionReview(raw: unknown): ReviewState | undefined {
  return normalizeReviewState(raw, { defaultPhase: "learning" });
}

export function normalizeQuestionMeta(raw: unknown): QuestionMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<QuestionMeta>)
    .map((item) => {
      const rawClassification = item.classification && typeof item.classification === "object"
        ? item.classification as Record<string, unknown>
        : undefined;
      const rawRating = item.rating && typeof item.rating === "object"
        ? item.rating
        : undefined;
      const importanceScore = normalizeDifficultyScore(rawRating?.importanceScore)
        ?? normalizeDifficultyScore(rawClassification?.importanceScore);
      const qualityScore = normalizeDifficultyScore(rawRating?.qualityScore)
        ?? normalizeDifficultyScore(rawClassification?.qualityScore);
      return {
      questionNumber: normalizeQuestionNumber(item.questionNumber),
      important: Boolean(item.important) || (item.important === undefined && (importanceScore ?? 0) >= 80),
      needsReview: Boolean(item.needsReview),
      difficultyScore: normalizeDifficultyScore(item.difficultyScore)
        ?? normalizeDifficultyScore(rawClassification?.difficultyScore),
      bookmarkLabel: item.bookmarkLabel ? `${item.bookmarkLabel}`.trim() : undefined,
      note: item.note ? `${item.note}`.trim() : undefined,
      mistakeAnalysis: item.mistakeAnalysis
        ? normalizeMistakeAnalysis(item.mistakeAnalysis)
        : undefined,
      review: normalizeQuestionReview(item.review),
      rating: rawRating || importanceScore !== undefined || qualityScore !== undefined
        ? {
            importanceScore,
            qualityScore,
            userQualityScore: normalizeDifficultyScore(rawRating?.userQualityScore),
            aiQualityScore: normalizeDifficultyScore(rawRating?.aiQualityScore),
            aiQualityConfidence: normalizeDifficultyScore(rawRating?.aiQualityConfidence),
            lastEvaluatedAt: isValidIsoDate(rawRating?.lastEvaluatedAt) ? rawRating.lastEvaluatedAt : undefined,
            evaluationSource: rawRating?.evaluationSource === "manual" || rawRating?.evaluationSource === "heuristic" || rawRating?.evaluationSource === "gemini" ? rawRating.evaluationSource : undefined,
          }
        : undefined,
      classification: normalizeQuestionClassification(item.classification),
      updatedAt:
        item.updatedAt && !Number.isNaN(new Date(item.updatedAt).getTime())
          ? item.updatedAt
          : new Date().toISOString(),
    }; })
    .filter((item) => item.questionNumber);
}

export function getQuestionCount(entry: WrongAnswerEntry): number {
  if (entry.entryKind !== "problem_sheet") return 0;
  return getEntryQuestions(entry).length;
}

export function getImportantQuestionCount(entry: WrongAnswerEntry): number {
  return normalizeQuestionMeta(entry.questionMeta).filter((meta) => meta.important).length;
}

export function getReviewNeedCount(entry: WrongAnswerEntry): number {
  const reviewQuestionNumbers = new Set<string>();
  const addQuestion = (questionNumber: string | number | undefined, fallbackKey?: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    reviewQuestionNumbers.add(normalized || fallbackKey || "");
  };

  normalizeQuestionMeta(entry.questionMeta).forEach((meta) => {
    const isDue = meta.review?.dueAt && new Date(meta.review.dueAt).getTime() <= Date.now();
    if (meta.needsReview || isDue) addQuestion(meta.questionNumber);
  });
  (entry.answerKey ?? []).forEach((answer, index) => {
    if (answer.needsReview) addQuestion(answer.questionNumber, `answer-${index}`);
  });
  (entry.importAudit?.missingQuestionNumbers ?? []).forEach((questionNumber, index) => {
    addQuestion(questionNumber, `missing-${index}`);
  });

  const entryDue = entry.review?.dueAt && new Date(entry.review.dueAt).getTime() <= Date.now() ? 1 : 0;
  return reviewQuestionNumbers.size + entryDue;
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
  submission?: { eventId?: string; replacementEventId?: string },
): QuestionMeta[] {
  const normalized = normalizeQuestionNumber(questionNumber);
  const items = normalizeQuestionMeta(current);
  const index = items.findIndex(
    (item) => normalizeQuestionNumber(item.questionNumber) === normalized,
  );
  const currentReview = index >= 0 ? items[index].review : undefined;
  const history = (currentReview?.history ?? []).filter((event) => event.id !== submission?.replacementEventId);
  let previous: ReviewState | undefined;
  history.forEach((event, eventIndex) => {
    const replayed = calculateNextReview(previous, event.result, new Date(event.reviewedAt), event.causeSnapshot?.[0]);
    previous = {
      dueAt: replayed.nextDueAt,
      lastReviewedAt: event.reviewedAt,
      intervalDays: replayed.intervalDays,
      streak: replayed.streak,
      history: history.slice(0, eventIndex + 1),
      stabilityDays: replayed.stabilityDays,
      memoryDifficulty: replayed.memoryDifficulty,
      lapseCount: replayed.lapseCount,
      repetitionCount: replayed.repetitionCount,
      phase: replayed.phase,
      preLapseStabilityDays: replayed.preLapseStabilityDays,
      relearningStep: replayed.relearningStep,
    };
  });
  const currentCause = cause ?? items[index ?? -1]?.mistakeAnalysis?.primaryCause;
  const next = calculateNextReview(previous, result, reviewedAt, currentCause);
  const event: ReviewEvent = {
    id: submission?.eventId ?? uuidv4(),
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
    history: [...history, event],
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
