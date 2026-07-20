import { v4 as uuidv4 } from "uuid";
import type { ReviewItem, ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
import { resolveEntryDifficultyScore } from "./difficulty";
import { recommendedStrategyForAnalysis } from "./mistakeAnalysis";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "./questionMeta";
import { parseQuestionText } from "./textLayout";

import { calculateNextReview } from "./reviewSchedule";
export { calculateNextReview } from "./reviewSchedule";

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function validDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function applyReviewResult(
  entry: WrongAnswerEntry,
  result: ReviewResult,
  reviewedAt = new Date(),
): WrongAnswerEntry {
  const cause = entry.mistakeAnalysis?.primaryCause ?? entry.mistakeAnalysis?.causes[0]?.type;
  const next = calculateNextReview(entry.review, result, reviewedAt, cause);
  const event = {
    id: uuidv4(),
    reviewedAt: reviewedAt.toISOString(),
    result,
    nextDueAt: next.nextDueAt,
    intervalDays: next.intervalDays,
    causeSnapshot: entry.mistakeAnalysis?.causes.map((cause) => cause.type),
    strategy: recommendedStrategyForAnalysis(entry.mistakeAnalysis),
    stabilityDays: next.stabilityDays,
    memoryDifficulty: next.memoryDifficulty,
    lapseCount: next.lapseCount,
  };

  const review: ReviewState = {
    dueAt: next.nextDueAt,
    lastReviewedAt: event.reviewedAt,
    intervalDays: next.intervalDays,
    streak: next.streak,
    history: [...(entry.review?.history ?? []), event],
    stabilityDays: next.stabilityDays,
    memoryDifficulty: next.memoryDifficulty,
    lapseCount: next.lapseCount,
    repetitionCount: next.repetitionCount,
    phase: next.phase,
    preLapseStabilityDays: next.preLapseStabilityDays,
    relearningStep: next.relearningStep,
  };

  return {
    ...entry,
    review,
    mastered: false,
  };
}

export function isDueForReview(entry: WrongAnswerEntry, now = new Date()): boolean {
  if (entry.entryKind === "concept") return false;
  if (entry.entryKind === "lecture") return false;
  if (entry.review?.phase === "archived") return false;
  if (entry.mastered && !entry.review?.dueAt && !entry.review?.phase) return false;
  if (!entry.review?.dueAt) return true;
  const dueAt = validDate(entry.review.dueAt);
  const today = validDate(now);
  if (!dueAt || !today) return true;
  return startOfDay(dueAt).getTime() <= startOfDay(today).getTime();
}

function isQuestionDue(review: ReviewState | undefined, now = new Date()): boolean {
  if (review?.phase === "archived") return false;
  if (!review?.dueAt) return false;
  const dueAt = validDate(review.dueAt);
  const today = validDate(now);
  if (!dueAt || !today) return true;
  return startOfDay(dueAt).getTime() <= startOfDay(today).getTime();
}

export function getSheetQuestionReviewItems(
  entry: WrongAnswerEntry,
  mode: "today" | "important" | "difficult" | "all" = "today",
  now = new Date(),
): ReviewItem[] {
  if (entry.entryKind !== "problem_sheet") return [];
  const questions = parseQuestionText(entry.question).filter((block) => block.kind === "question");
  const meta = normalizeQuestionMeta(entry.questionMeta);
  const answers = entry.answerKey ?? [];
  return questions
    .filter((block) => {
      const number = normalizeQuestionNumber(block.displayNumber);
      const original = normalizeQuestionNumber(block.numberLabel);
      const questionMeta = meta.find(
        (item) =>
          normalizeQuestionNumber(item.questionNumber) === number ||
          normalizeQuestionNumber(item.questionNumber) === original,
      );
      const answer = answers.find(
        (item) =>
          normalizeQuestionNumber(item.questionNumber) === number ||
          normalizeQuestionNumber(item.questionNumber) === original,
      );
      if (mode === "important") return Boolean(questionMeta?.important);
      if (mode === "difficult") {
        return Boolean(
          (questionMeta?.difficultyScore ?? answer?.difficultyScore ?? 0) >= 61 ||
            questionMeta?.important ||
            answer?.needsReview,
        );
      }
      if (mode === "all") return true;
      return Boolean(
        questionMeta?.needsReview ||
        questionMeta?.important ||
        isQuestionDue(questionMeta?.review, now),
      );
    })
    .map((block) => ({
      kind: "sheet-question" as const,
      entry,
      questionNumber: normalizeQuestionNumber(block.displayNumber),
    }));
}

export function getTodayReviewItems(
  entries: WrongAnswerEntry[],
  now = new Date(),
): ReviewItem[] {
  return entries
    .flatMap((entry): ReviewItem[] => {
      if (entry.entryKind === "problem_sheet") {
        return getSheetQuestionReviewItems(entry, "today", now);
      }
      return isDueForReview(entry, now) ? [{ kind: "entry", entry }] : [];
    })
    .sort((a, b) => reviewItemPriority(b) - reviewItemPriority(a));
}

function reviewItemPriority(item: ReviewItem): number {
  if (item.kind === "entry") {
    const review = item.entry.review;
    const stability = review?.stabilityDays ?? review?.intervalDays ?? 1;
    const lapses = review?.lapseCount ?? 0;
    return resolveEntryDifficultyScore(item.entry) + (10 - Math.min(10, stability)) + lapses * 2;
  }
  const meta = normalizeQuestionMeta(item.entry.questionMeta).find(
    (candidate) => normalizeQuestionNumber(candidate.questionNumber) === normalizeQuestionNumber(item.questionNumber),
  );
  const answer = (item.entry.answerKey ?? []).find(
    (candidate) => normalizeQuestionNumber(candidate.questionNumber) === normalizeQuestionNumber(item.questionNumber),
  );
  const review = meta?.review;
  const score = meta?.difficultyScore ?? answer?.difficultyScore ?? 0;
  return score + (10 - Math.min(10, review?.stabilityDays ?? review?.intervalDays ?? 1)) + (review?.lapseCount ?? 0) * 2;
}

export function getDifficultReviewItems(entries: WrongAnswerEntry[]): ReviewItem[] {
  return entries
    .flatMap((entry): ReviewItem[] => {
      if (entry.entryKind === "problem_sheet") return getSheetQuestionReviewItems(entry, "difficult");
      return entry.entryKind !== "concept" &&
        entry.entryKind !== "lecture" &&
        !entry.mastered &&
        (entry.difficult || entry.difficulty === "high" || entry.difficulty === "medium")
        ? [{ kind: "entry", entry }]
        : [];
    })
    .sort((a, b) => reviewItemPriority(b) - reviewItemPriority(a));
}

export function getRandomReviewItems(entries: WrongAnswerEntry[]): ReviewItem[] {
  return entries.flatMap((entry): ReviewItem[] => {
    if (entry.entryKind === "problem_sheet") return getSheetQuestionReviewItems(entry, "all");
    return entry.entryKind !== "concept" && entry.entryKind !== "lecture" && !entry.mastered
      ? [{ kind: "entry", entry }]
      : [];
  });
}

export function getImportantQuestionReviewItems(entries: WrongAnswerEntry[]): ReviewItem[] {
  return entries.flatMap((entry) => getSheetQuestionReviewItems(entry, "important"));
}

export function getTodayReviewCandidates(
  entries: WrongAnswerEntry[],
  now = new Date(),
): WrongAnswerEntry[] {
  return entries
    .filter((entry) => isDueForReview(entry, now))
    .sort((a, b) => resolveEntryDifficultyScore(b) - resolveEntryDifficultyScore(a));
}

export function getDifficultReviewCandidates(entries: WrongAnswerEntry[]): WrongAnswerEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.entryKind !== "concept" &&
        !entry.mastered &&
        (entry.difficult || entry.difficulty === "high" || entry.difficulty === "medium"),
    )
    .sort((a, b) => resolveEntryDifficultyScore(b) - resolveEntryDifficultyScore(a));
}

export function getRandomReviewCandidates(entries: WrongAnswerEntry[]): WrongAnswerEntry[] {
  return entries.filter((entry) => entry.entryKind !== "concept" && !entry.mastered);
}

export function shuffleEntries(entries: WrongAnswerEntry[]): WrongAnswerEntry[] {
  const copy = [...entries];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
