import { v4 as uuidv4 } from "uuid";
import type { ReviewItem, ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
import { resolveEntryDifficultyScore } from "./difficulty";
import { recommendedStrategyForAnalysis } from "./mistakeAnalysis";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "./questionMeta";
import { parseQuestionText } from "./textLayout";

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calculateNextReview(
  previous: ReviewState | undefined,
  result: ReviewResult,
  reviewedAt = new Date(),
) {
  const currentInterval = previous?.intervalDays ?? 0;
  const currentStreak = previous?.streak ?? 0;

  let intervalDays = 1;
  let streak = 0;

  if (result === "hard") {
    intervalDays = 3;
    streak = Math.max(0, currentStreak - 1);
  } else if (result === "good") {
    streak = currentStreak + 1;
    if (currentInterval >= 14 || streak >= 3) {
      intervalDays = 30;
    } else if (currentInterval >= 7 || streak >= 2) {
      intervalDays = 14;
    } else {
      intervalDays = 7;
    }
  }

  const nextDueAt = addDays(reviewedAt, intervalDays).toISOString();
  return { intervalDays, streak, nextDueAt };
}

export function applyReviewResult(
  entry: WrongAnswerEntry,
  result: ReviewResult,
  reviewedAt = new Date(),
): WrongAnswerEntry {
  const next = calculateNextReview(entry.review, result, reviewedAt);
  const event = {
    id: uuidv4(),
    reviewedAt: reviewedAt.toISOString(),
    result,
    nextDueAt: next.nextDueAt,
    intervalDays: next.intervalDays,
    causeSnapshot: entry.mistakeAnalysis?.causes.map((cause) => cause.type),
    strategy: recommendedStrategyForAnalysis(entry.mistakeAnalysis),
  };

  const review: ReviewState = {
    dueAt: next.nextDueAt,
    lastReviewedAt: event.reviewedAt,
    intervalDays: next.intervalDays,
    streak: next.streak,
    history: [...(entry.review?.history ?? []), event],
  };

  return {
    ...entry,
    review,
    mastered: result === "good" && next.intervalDays >= 30 ? true : entry.mastered,
  };
}

export function isDueForReview(entry: WrongAnswerEntry, now = new Date()): boolean {
  if (entry.mastered) return false;
  if (entry.entryKind === "concept") return false;
  if (entry.entryKind === "lecture") return false;
  if (!entry.review?.dueAt) return true;
  return startOfDay(new Date(entry.review.dueAt)).getTime() <= startOfDay(now).getTime();
}

function isQuestionDue(review: ReviewState | undefined, now = new Date()): boolean {
  if (!review?.dueAt) return true;
  return startOfDay(new Date(review.dueAt)).getTime() <= startOfDay(now).getTime();
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
      return Boolean(answer?.needsReview || isQuestionDue(questionMeta?.review, now));
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
    .sort((a, b) => resolveEntryDifficultyScore(b.entry) - resolveEntryDifficultyScore(a.entry));
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
    .sort((a, b) => resolveEntryDifficultyScore(b.entry) - resolveEntryDifficultyScore(a.entry));
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
