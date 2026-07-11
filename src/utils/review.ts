import { v4 as uuidv4 } from "uuid";
import type { MistakeCauseType, ReviewItem, ReviewResult, ReviewState, WrongAnswerEntry } from "../types";
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
  cause?: MistakeCauseType,
) {
  const currentInterval = previous?.intervalDays ?? 0;
  const currentStreak = previous?.streak ?? 0;
  const repetitionCount = (previous?.repetitionCount ?? previous?.history.length ?? 0) + 1;
  const lapseCount = (previous?.lapseCount ?? previous?.history.filter((event) => event.result === "again").length ?? 0) + (result === "again" ? 1 : 0);
  const previousStability = Math.max(0.5, (previous?.stabilityDays ?? currentInterval) || 1);
  const preLapseStability = Math.max(1, previous?.preLapseStabilityDays ?? previousStability);
  const previousDifficulty = Math.min(10, Math.max(1, previous?.memoryDifficulty ?? 5));
  const elapsedDays = previous?.lastReviewedAt
    ? Math.max(0, (reviewedAt.getTime() - new Date(previous.lastReviewedAt).getTime()) / 86_400_000)
    : 0;
  const retrievability = previous?.lastReviewedAt
    ? Math.exp(-elapsedDays / previousStability)
    : 1;
  const causeMultiplier = cause === "concept_gap" || cause === "strategy_gap"
    ? 0.8
    : cause === "condition_misread" || cause === "choice_trap" || cause === "time_pressure"
      ? 0.9
      : cause === "calculation" || cause === "careless"
        ? 0.95
        : 1;
  const difficultyMultiplier = Math.min(1.2, Math.max(0.7, 1 - (previousDifficulty - 5) * 0.06));
  const lapseMultiplier = Math.min(1, Math.max(0.58, 1 - Math.min(7, lapseCount) * 0.06));

  let stabilityDays = previousStability * (result === "hard"
    ? 1.05 + (1 - retrievability) * 0.15
    : 1.7 + (1 - retrievability) * 0.5);
  let memoryDifficulty = previousDifficulty;
  let streak: number;
  let phase: ReviewState["phase"] = "learning";
  let relearningStep: 0 | 1 | undefined;
  let nextPreLapseStability: number | undefined = previous?.preLapseStabilityDays;

  if (!previous) {
    stabilityDays = result === "again" ? 1 : result === "hard" ? 3 : 7;
    memoryDifficulty = result === "again" ? 7.5 : result === "hard" ? 6 : 5;
    streak = result === "good" ? 1 : 0;
    if (result === "again") {
      phase = "relearning";
      relearningStep = 0;
    }
  } else if (result === "again") {
    memoryDifficulty += 0.8;
    streak = 0;
    phase = "relearning";
    relearningStep = 0;
    nextPreLapseStability = preLapseStability;
  } else if (result === "hard") {
    memoryDifficulty += 0.25;
    streak = Math.max(0, currentStreak - 1);
    if (previous.phase === "relearning") {
      phase = "relearning";
      relearningStep = previous.relearningStep ?? 0;
    }
  } else {
    memoryDifficulty -= 0.2;
    streak = currentStreak + 1;
    if (previous.phase === "relearning") {
      if ((previous.relearningStep ?? 0) === 0) {
        stabilityDays = 3;
        phase = "relearning";
        relearningStep = 1;
      } else {
        stabilityDays = Math.max(3, preLapseStability * 0.35 * 1.4);
        phase = "learning";
        relearningStep = undefined;
      }
    }
  }

  if (result !== "again" && !(phase === "relearning" && relearningStep === 0)) {
    stabilityDays = Math.max(0.5, stabilityDays * causeMultiplier * difficultyMultiplier * lapseMultiplier);
  }
  memoryDifficulty = Math.min(10, Math.max(1, memoryDifficulty));

  let intervalDays = Math.max(1, Math.round(stabilityDays));
  if (result === "again") {
    intervalDays = 1;
    stabilityDays = 1;
  } else if (phase === "relearning" && relearningStep === 1 && result === "good") {
    intervalDays = 3;
    stabilityDays = 3;
  } else if (result === "hard") {
    intervalDays = phase === "relearning"
      ? 2
      : Math.max(3, Math.min(30, Math.round(stabilityDays * 0.8)));
  } else {
    if (currentInterval >= 60) intervalDays = Math.max(120, intervalDays);
    else if (currentInterval >= 30) intervalDays = Math.max(60, intervalDays);
    else if (currentInterval >= 14 || streak >= 3) intervalDays = Math.max(30, intervalDays);
    else if (currentInterval >= 7 || streak >= 2) intervalDays = Math.max(14, intervalDays);
    else intervalDays = Math.max(7, intervalDays);
    intervalDays = Math.min(120, intervalDays);
    if (intervalDays >= 30) phase = "long_term";
  }

  if (lapseCount >= 6 && result !== "again" && phase !== "long_term") {
    intervalDays = Math.min(intervalDays, 30);
  }

  const nextDueAt = addDays(reviewedAt, intervalDays).toISOString();
  return {
    intervalDays,
    streak,
    nextDueAt,
    stabilityDays,
    memoryDifficulty,
    lapseCount,
    repetitionCount,
    phase,
    preLapseStabilityDays: nextPreLapseStability,
    relearningStep,
  };
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
    mastered: next.phase === "long_term"
      ? true
      : result === "good"
        ? entry.mastered
        : false,
  };
}

export function isDueForReview(entry: WrongAnswerEntry, now = new Date()): boolean {
  if (entry.entryKind === "concept") return false;
  if (entry.entryKind === "lecture") return false;
  if (entry.review?.phase === "archived") return false;
  if (entry.mastered && !entry.review?.dueAt && !entry.review?.phase) return false;
  if (!entry.review?.dueAt) return true;
  return startOfDay(new Date(entry.review.dueAt)).getTime() <= startOfDay(now).getTime();
}

function isQuestionDue(review: ReviewState | undefined, now = new Date()): boolean {
  if (review?.phase === "archived") return false;
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
