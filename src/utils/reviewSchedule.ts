import type { MistakeCauseType, ReviewResult, ReviewState } from "../types";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function validDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const previousReviewedAt = validDate(previous?.lastReviewedAt);
  const safeReviewedAt = validDate(reviewedAt) ?? new Date();
  const elapsedDays = previousReviewedAt
    ? Math.max(0, (safeReviewedAt.getTime() - previousReviewedAt.getTime()) / 86_400_000)
    : 0;
  const retrievability = previousReviewedAt
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

  const nextDueAt = addDays(safeReviewedAt, intervalDays).toISOString();
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
