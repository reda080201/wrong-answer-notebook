import { v4 as uuidv4 } from "uuid";
import type { ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
import { recommendedStrategyForAnalysis } from "./mistakeAnalysis";

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
  if (!entry.review?.dueAt) return true;
  return startOfDay(new Date(entry.review.dueAt)).getTime() <= startOfDay(now).getTime();
}

export function getTodayReviewCandidates(
  entries: WrongAnswerEntry[],
  now = new Date(),
): WrongAnswerEntry[] {
  return entries.filter((entry) => isDueForReview(entry, now));
}

export function getDifficultReviewCandidates(entries: WrongAnswerEntry[]): WrongAnswerEntry[] {
  return entries.filter(
    (entry) =>
      entry.entryKind !== "concept" &&
      !entry.mastered &&
      (entry.difficult || entry.difficulty === "high" || entry.difficulty === "medium"),
  );
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
